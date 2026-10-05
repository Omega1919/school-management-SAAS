import { pool } from './index.ts';

export async function runSchemaDataMigration() {
  const client = await pool.connect();
  try {
    console.log('Starting DB migration & session/enrollment/invoice backfill...');

    // 1. Create default/historical academic sessions if not already present
    const defaultSessions = [
      {
        name: '2024/2025',
        startDate: '2024-09-02',
        endDate: '2025-07-18',
        isCurrent: false,
        status: 'completed',
        description: '2024/2025 Academic Year',
      },
      {
        name: '2025/2026',
        startDate: '2025-09-01',
        endDate: '2026-07-17',
        isCurrent: false,
        status: 'completed',
        description: '2025/2026 Academic Year',
      },
      {
        name: '2026/2027',
        startDate: '2026-09-01',
        endDate: '2027-07-16',
        isCurrent: true,
        status: 'active',
        description: '2026/2027 Academic Year (Current)',
      },
    ];

    for (const s of defaultSessions) {
      await client.query(
        `INSERT INTO academic_sessions (name, start_date, end_date, is_current, status, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (name) DO UPDATE 
         SET is_current = EXCLUDED.is_current, status = EXCLUDED.status`,
        [s.name, s.startDate, s.endDate, s.isCurrent, s.status, s.description]
      );
    }
    console.log('  Academic sessions synchronized.');

    // 2. Link academic_terms to their respective academic_sessions
    await client.query(`
      UPDATE academic_terms at
      SET session_id = s.id
      FROM academic_sessions s
      WHERE at.session_name = s.name AND at.session_id IS NULL;
    `);

    // Assign fallback session for any terms without match
    await client.query(`
      UPDATE academic_terms
      SET session_id = (SELECT id FROM academic_sessions WHERE is_current = true LIMIT 1)
      WHERE session_id IS NULL;
    `);
    console.log('  Academic terms linked to sessions.');

    // 3. Link classes to current active academic session
    await client.query(`
      UPDATE classes
      SET session_id = (SELECT id FROM academic_sessions WHERE is_current = true LIMIT 1)
      WHERE session_id IS NULL;
    `);
    console.log('  Classes linked to active session.');

    // 4. Link students to current session
    await client.query(`
      UPDATE students
      SET current_session_id = (SELECT id FROM academic_sessions WHERE is_current = true LIMIT 1)
      WHERE current_session_id IS NULL;
    `);
    console.log('  Students linked to active session.');

    // 5. Backfill student_enrollments for all students based on their enrolled classes & admission history
    await client.query(`
      INSERT INTO student_enrollments (student_id, class_id, session_id, enrollment_date, status)
      SELECT 
        s.id,
        s.class_id,
        COALESCE(s.current_session_id, (SELECT id FROM academic_sessions WHERE is_current = true LIMIT 1)),
        COALESCE(s.admission_date, '2026-09-01'),
        'enrolled'
      FROM students s
      WHERE s.class_id IS NOT NULL
      ON CONFLICT (student_id, session_id, class_id) DO NOTHING;
    `);
    console.log('  Student enrollments backfilled.');

    // 6. Backfill session_id on fees, results, attendance, homeworks from their terms
    await client.query(`
      UPDATE fees f
      SET session_id = at.session_id
      FROM academic_terms at
      WHERE f.term_id = at.id AND f.session_id IS NULL;
    `);
    await client.query(`
      UPDATE results r
      SET session_id = at.session_id
      FROM academic_terms at
      WHERE r.term_id = at.id AND r.session_id IS NULL;
    `);
    await client.query(`
      UPDATE attendance a
      SET session_id = at.session_id
      FROM academic_terms at
      WHERE a.term_id = at.id AND a.session_id IS NULL;
    `);
    await client.query(`
      UPDATE homeworks h
      SET session_id = at.session_id
      FROM academic_terms at
      WHERE h.term_id = at.id AND h.session_id IS NULL;
    `);
    console.log('  Relational session_id foreign keys populated on fees, results, attendance, homeworks.');

    // 7. Backfill unique invoice numbers for existing fee records
    await client.query(`
      UPDATE fees
      SET invoice_number = 'INV-' || TO_CHAR(created_at, 'YYYY') || '-' || LPAD(id::text, 6, '0')
      WHERE invoice_number IS NULL;
    `);
    console.log('  Invoice numbers assigned to all fee records.');

    console.log('  Data migration completed successfully.');
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    client.release();
  }
}

// If executed directly via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  runSchemaDataMigration().then(() => process.exit(0));
}
