import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

async function main() {
  // Use an in-memory database so this check never reaches the configured DB.
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = '';
  process.env.SQL_HOST = '';
  process.env.SQL_USER = '';
  process.env.SQL_PASSWORD = '';

  const pg = new PGlite();
  await pg.waitReady;
  (globalThis as any)._pgliteInstance = pg;

  try {
    const { MIGRATIONS, runMigrations } = await import('../src/db/migrations.ts');
    await pg.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);

    // Build the pre-tenancy database, then insert representative one-school
    // data to prove the upgrade keeps it with its original school.
    for (const migration of MIGRATIONS.filter((item) => item.version <= 23)) {
      await pg.exec(migration.sql);
      await pg.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [migration.version, migration.name]);
    }
    await pg.query(`INSERT INTO school_settings (school_name) VALUES ('Original Academy')`);
    await pg.query(`INSERT INTO users (uid, email, full_name, role) VALUES ('legacy-admin', 'admin@school.com', 'Legacy Admin', 'super_admin')`);
    await pg.query(`INSERT INTO students (student_id, first_name, last_name, gender) VALUES ('STU-001', 'Legacy', 'Student', 'Other')`);

    const migrationResult = await runMigrations();
    assert.equal(migrationResult.applied, 2, 'should apply tenant and same-school relationship migrations');
    assert.equal(migrationResult.total, MIGRATIONS.length);

    const { ensureSecondaryDemoSchoolData } = await import('../src/db/seed.ts');
    await ensureSecondaryDemoSchoolData();

    const schoolsResult = await pg.query(`SELECT id, slug FROM schools ORDER BY slug`);
    const schoolRows = schoolsResult.rows as Array<{ id: number; slug: string }>;
    const springfield = schoolRows.find((row) => row.slug === 'springfield');
    const lakeside = schoolRows.find((row) => row.slug === 'lakeside-demo');
    assert.ok(springfield && lakeside, 'should keep the original school and add the Lakeside demo school');

    const originalRows = await pg.query(`SELECT school_id FROM students WHERE student_id = 'STU-001'`);
    assert.equal(Number((originalRows.rows[0] as any)?.school_id), Number(springfield.id), 'legacy student should remain in Springfield');

    async function asSchool<T>(schoolId: number, operation: () => Promise<T>): Promise<T> {
      await pg.query('BEGIN');
      try {
        await pg.query('SET LOCAL ROLE sms_app_runtime');
        await pg.query(`SELECT set_config('app.school_id', $1, true)`, [String(schoolId)]);
        const result = await operation();
        await pg.query('COMMIT');
        return result;
      } catch (error) {
        await pg.query('ROLLBACK');
        throw error;
      }
    }

    for (const school of [springfield, lakeside]) {
      const visible = await asSchool(school.id, () => pg.query(`SELECT email FROM users WHERE email = 'admin@school.com'`));
      assert.equal(visible.rows.length, 1, 'same email may exist in both schools and remains visible only in its own school');
    }

    await asSchool(lakeside.id, () => pg.query(`INSERT INTO students (student_id, first_name, last_name, gender)
      VALUES ('STU-001', 'Lakeside', 'Student', 'Other')`));
    for (const school of [springfield, lakeside]) {
      const visible = await asSchool(school.id, () => pg.query(`SELECT id FROM students WHERE student_id = 'STU-001'`));
      assert.equal(visible.rows.length, 1, 'same student number may exist in both schools while remaining isolated');
    }

    const springfieldAcademic = await asSchool(springfield.id, async () => {
      const session = await pg.query(`INSERT INTO academic_sessions (name, start_date, end_date)
        VALUES ('Isolation Check', '2026-01-01', '2026-12-31') RETURNING id`);
      const cls = await pg.query(`INSERT INTO classes (name, session_id)
        VALUES ('Isolation Check Class', $1) RETURNING id`, [(session.rows[0] as any).id]);
      return { sessionId: Number((session.rows[0] as any).id), classId: Number((cls.rows[0] as any).id) };
    });

    const otherStudent = await asSchool(lakeside.id, async () => {
      const student = await pg.query(`INSERT INTO students (student_id, first_name, last_name, gender)
        VALUES ('CROSS-SCHOOL-STUDENT', 'Cross', 'School', 'Other') RETURNING id`);
      return Number((student.rows[0] as any).id);
    });

    await assert.rejects(
      asSchool(springfield.id, () => pg.query(`INSERT INTO student_enrollments
        (student_id, class_id, session_id, enrollment_date)
        VALUES ($1, $2, $3, '2026-01-01')`, [otherStudent, springfieldAcademic.classId, springfieldAcademic.sessionId])),
      /same school|row-level security|policy/i,
      'database should reject linking a school to another school’s student'
    );

    await assert.rejects(
      asSchool(springfield.id, () => pg.query(`INSERT INTO users
        (school_id, uid, email, full_name, role)
        VALUES ($1, 'wrong-school-user', 'wrong@school.test', 'Wrong School', 'student')`, [lakeside.id])),
      /row-level security|policy/i,
      'database should reject writes that name a different school'
    );

    const demoCounts = await asSchool(lakeside.id, async () => {
      const users = await pg.query(`SELECT count(*)::int AS count FROM users`);
      const students = await pg.query(`SELECT count(*)::int AS count FROM students`);
      return { users: Number((users.rows[0] as any).count), students: Number((students.rows[0] as any).count) };
    });
    assert.ok(demoCounts.users > 1 && demoCounts.students > 0, 'Lakeside should contain its own demo users and students');

    console.log('Multi-school staging check passed. Legacy data stayed in Springfield; Lakeside demo data is separate; cross-school reads, writes, and links were rejected.');
  } finally {
    await pg.close();
    delete (globalThis as any)._pgliteInstance;
    delete (globalThis as any)._postgresPool;
    delete (globalThis as any)._drizzleDb;
  }
}

await main().catch((error) => {
  console.error('Multi-school staging check failed:', error);
  process.exitCode = 1;
});
