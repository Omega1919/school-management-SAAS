import { db, pool } from './src/db/index.ts';
import { runMigrations } from './src/db/migrations.ts';
import {
  users,
  academicSessions,
  academicTerms,
  classes,
  subjects,
  classSubjects,
  teachers,
  timetables,
  passwordResets,
} from './src/db/schema.ts';
import {
  generateToken,
  generateStreamToken,
  hashPassword,
} from './src/lib/auth.ts';
import { ensureRealAdmin } from './src/lib/admin-init.ts';
import { authRouter } from './src/routes/auth.ts';
import { communicationsRouter } from './src/routes/communications.ts';
import { settingsRouter } from './src/routes/settings.ts';
import { timetableRouter } from './src/routes/timetable.ts';
import express from 'express';
import { authenticate } from './src/middleware/auth.ts';
import { eq, sql } from 'drizzle-orm';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runAuditTests() {
  console.log('====================================================');
  console.log('STARTING FINAL SOURCE-OF-TRUTH REGRESSION AUDIT TEST');
  console.log('====================================================\n');

  // Setup express test app
  const app = express();
  app.use(express.json());
  app.use(authenticate);
  app.use('/api/auth', authRouter);
  app.use('/api/communications', communicationsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/timetable', timetableRouter);

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // ------------------------------------------------------------------------
    // ITEM 4 & 3: Run versioned migrations and check schema_migrations table
    // ------------------------------------------------------------------------
    console.log('[TEST 1/8] Verifying versioned migrations and tracking table...');
    const migrationResult = await runMigrations();
    assert(migrationResult.total >= 3, 'Migration total should be at least 3');

    const appliedMigrations = await pool.query('SELECT version, name FROM schema_migrations ORDER BY version ASC');
    const versions = (appliedMigrations.rows || appliedMigrations).map((r: any) => Number(r.version));
    assert(versions.includes(1) && versions.includes(2) && versions.includes(3), 'Migrations 1, 2, 3 must be applied');
    console.log('  ✓ Versioned migrations verified in schema_migrations table.');

    // ------------------------------------------------------------------------
    // ITEM 3: PostgreSQL Partial Unique Index enforcement for sessions & terms
    // ------------------------------------------------------------------------
    console.log('\n[TEST 2/8] Verifying PostgreSQL unique constraint on is_current=true...');
    // Clean existing tables in strict foreign-key dependency order
    await pool.query('DELETE FROM admission_application_logs');
    await pool.query('DELETE FROM admission_applications');
    await pool.query('DELETE FROM timetables');
    await pool.query('DELETE FROM payments');
    await pool.query('DELETE FROM fees');
    await pool.query('DELETE FROM results');
    await pool.query('DELETE FROM attendance');
    await pool.query('DELETE FROM class_attendance_submissions');
    await pool.query('DELETE FROM homework_submissions');
    await pool.query('DELETE FROM homeworks');
    await pool.query('DELETE FROM parent_students');
    await pool.query('DELETE FROM parent_invitations');
    await pool.query('DELETE FROM student_enrollments');
    await pool.query('DELETE FROM students');
    await pool.query('DELETE FROM class_subjects');
    await pool.query('DELETE FROM classes');
    await pool.query('DELETE FROM academic_terms');
    await pool.query('DELETE FROM academic_sessions');

    // Insert first current session
    await pool.query(`
      INSERT INTO academic_sessions (name, start_date, end_date, is_current, status)
      VALUES ('2026/2027', '2026-09-01', '2027-07-16', true, 'active')
    `);

    // Attempt to insert second current session -> MUST FAIL unique partial index
    let sessionConstraintFailed = false;
    try {
      await pool.query(`
        INSERT INTO academic_sessions (name, start_date, end_date, is_current, status)
        VALUES ('2027/2028', '2027-09-01', '2028-07-16', true, 'upcoming')
      `);
    } catch (err: any) {
      sessionConstraintFailed = true;
      assert(
        err.message.includes('unique') || err.message.includes('academic_sessions_current_unique_idx'),
        `Expected unique constraint error, got: ${err.message}`
      );
    }
    assert(sessionConstraintFailed, 'PostgreSQL must reject duplicate is_current=true session');

    // Test terms unique partial index
    const [sess] = await db.select().from(academicSessions).limit(1);
    await pool.query(`
      INSERT INTO academic_terms (session_id, session_name, term_name, term_number, is_current)
      VALUES (${sess.id}, '2026/2027', 'First Term', 1, true)
    `);

    let termConstraintFailed = false;
    try {
      await pool.query(`
        INSERT INTO academic_terms (session_id, session_name, term_name, term_number, is_current)
        VALUES (${sess.id}, '2026/2027', 'Second Term', 2, true)
      `);
    } catch (err: any) {
      termConstraintFailed = true;
      assert(
        err.message.includes('unique') || err.message.includes('academic_terms_current_unique_idx'),
        `Expected unique constraint error, got: ${err.message}`
      );
    }
    assert(termConstraintFailed, 'PostgreSQL must reject duplicate is_current=true term');
    console.log('  ✓ PostgreSQL partial unique indexes enforce single is_current=true session and term.');

    // ------------------------------------------------------------------------
    // ITEM 1: /api/auth/register-admin matching ADMIN_EMAIL alone must NEVER authorize
    // ------------------------------------------------------------------------
    console.log('\n[TEST 3/8] Verifying /api/auth/register-admin authorization...');
    process.env.ADMIN_EMAIL = 'admin@institution.edu';
    process.env.ADMIN_SETUP_KEY = 'super-secret-setup-key-12345';

    // 1. Calling with matching email but NO setupKey and NO super_admin token -> MUST return 403
    const unauthorizedRes = await fetch(`${baseUrl}/api/auth/register-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@institution.edu',
        password: 'Password123!',
        fullName: 'Attacker Attempting Takeover',
      }),
    });
    assert(unauthorizedRes.status === 403, `Expected 403, got ${unauthorizedRes.status}`);
    console.log('  ✓ Matching ADMIN_EMAIL alone correctly rejected with 403.');

    // 2. Calling with valid setupKey -> MUST succeed
    const authorizedRes = await fetch(`${baseUrl}/api/auth/register-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@institution.edu',
        password: 'Password123!',
        fullName: 'Real Super Admin',
        setupKey: 'super-secret-setup-key-12345',
      }),
    });
    assert(authorizedRes.status === 201, `Expected 201, got ${authorizedRes.status}`);
    const adminData = await authorizedRes.json();
    assert(adminData.user.role === 'super_admin', 'Role must be super_admin');
    const adminToken = adminData.token;
    console.log('  ✓ Valid ADMIN_SETUP_KEY successfully authorized admin registration.');

    // ------------------------------------------------------------------------
    // ITEM 2: /api/communications/stream accepts ONLY dedicated stream token
    // ------------------------------------------------------------------------
    console.log('\n[TEST 4/8] Verifying SSE stream token validation...');
    // 1. Test normal 7-day JWT passed via ?token= -> MUST be rejected (401)
    const normalTokenQueryRes = await fetch(`${baseUrl}/api/communications/stream?token=${adminToken}`);
    assert(normalTokenQueryRes.status === 401, `Expected 401 for ?token=, got ${normalTokenQueryRes.status}`);

    // 2. Test normal 7-day JWT passed via Authorization header -> MUST be rejected (401)
    const normalBearerRes = await fetch(`${baseUrl}/api/communications/stream`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(normalBearerRes.status === 401, `Expected 401 for normal JWT Bearer, got ${normalBearerRes.status}`);

    // 3. Obtain dedicated short-lived stream token via GET /api/communications/stream-token
    const streamTokenRes = await fetch(`${baseUrl}/api/communications/stream-token`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(streamTokenRes.status === 200, `Expected 200 from stream-token, got ${streamTokenRes.status}`);
    const { streamToken } = await streamTokenRes.json();
    assert(typeof streamToken === 'string' && streamToken.length > 20, 'Must return streamToken');

    // 4. Test dedicated stream token -> MUST succeed
    const controller = new AbortController();
    const streamConnRes = await fetch(`${baseUrl}/api/communications/stream?streamToken=${streamToken}`, {
      signal: controller.signal,
    });
    assert(streamConnRes.status === 200, `Expected 200 for dedicated stream token, got ${streamConnRes.status}`);
    assert(streamConnRes.headers.get('content-type')?.includes('text/event-stream') || false, 'Content-type must be text/event-stream');
    controller.abort();
    console.log('  ✓ Stream endpoint strictly enforces dedicated stream token and rejects standard JWTs.');

    // ------------------------------------------------------------------------
    // ITEM 5: /api/settings/reseed permanently disabled in production
    // ------------------------------------------------------------------------
    console.log('\n[TEST 5/8] Verifying /api/settings/reseed permanently disabled in production...');
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const reseedRes = await fetch(`${baseUrl}/api/settings/reseed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ confirm: true }),
    });
    assert(reseedRes.status === 403, `Expected 403 for reseed in production, got ${reseedRes.status}`);
    const reseedJson = await reseedRes.json();
    assert(reseedJson.error.includes('permanently disabled in production'), 'Must state permanently disabled');
    process.env.NODE_ENV = originalEnv;
    console.log('  ✓ Reseed endpoint is permanently disabled in production with 403.');

    // ------------------------------------------------------------------------
    // ITEM 6: src/lib/admin-init.ts no hardcoded admin credentials
    // ------------------------------------------------------------------------
    console.log('\n[TEST 6/8] Verifying admin-init.ts contains no hardcoded fallbacks...');
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    // Clear audit logs and super admins
    await pool.query('DELETE FROM audit_logs');
    await pool.query('DELETE FROM password_resets');
    await pool.query("DELETE FROM users WHERE role = 'super_admin'");
    const adminInitResult = await ensureRealAdmin();
    assert(adminInitResult === null, 'ensureRealAdmin must return null when no env credentials provided');
    console.log('  ✓ No hardcoded admin credentials or accounts created.');

    // Restore super admin for subsequent tests
    const [restoredAdmin] = await db
      .insert(users)
      .values({
        uid: 'admin-test-uid',
        email: 'superadmin@test.com',
        passwordHash: await hashPassword('Password123!'),
        fullName: 'Super Admin Test',
        role: 'super_admin',
        status: 'active',
      })
      .returning();
    const superAdminToken = generateToken({
      id: restoredAdmin.id,
      uid: restoredAdmin.uid,
      email: restoredAdmin.email,
      role: 'super_admin',
      fullName: restoredAdmin.fullName,
    });

    // ------------------------------------------------------------------------
    // ITEM 7: Password Reset 503 and Token Security
    // ------------------------------------------------------------------------
    console.log('\n[TEST 7/8] Verifying password reset behavior...');
    delete process.env.SMTP_HOST;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.RESEND_API_KEY;
    delete process.env.AWS_SES_REGION;
    delete process.env.EMAIL_SERVICE_CONFIGURED;

    // 1. Request password reset without provider -> MUST return 503
    const forgotWithoutProvider = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'superadmin@test.com' }),
    });
    assert(forgotWithoutProvider.status === 503, `Expected 503 when no email provider, got ${forgotWithoutProvider.status}`);
    const forgotWithoutJson = await forgotWithoutProvider.json();
    assert(forgotWithoutJson.serviceConfigured === false, 'serviceConfigured must be false');

    // 2. When provider IS configured -> returns generic message, raw token never in API response
    process.env.EMAIL_SERVICE_CONFIGURED = 'true';
    const forgotWithProvider = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'superadmin@test.com' }),
    });
    assert(forgotWithProvider.status === 200, `Expected 200 when email provider configured, got ${forgotWithProvider.status}`);
    const forgotWithJson = await forgotWithProvider.json();
    assert(!forgotWithJson.token && !forgotWithJson.resetToken && !forgotWithJson.rawToken, 'Raw token must NEVER be returned in API response');
    console.log('  ✓ Password reset returns 503 when unconfigured and never leaks raw token.');

    // ------------------------------------------------------------------------
    // ITEM 8: Timetable POST & PUT requires teacher assigned via class_subjects
    // ------------------------------------------------------------------------
    console.log('\n[TEST 8/8] Verifying timetable teacher assignment validation...');
    // Create class, subject, teacher
    const [testClass] = await db
      .insert(classes)
      .values({ name: 'SS1 Test', sessionId: sess.id, status: 'active' })
      .returning();

    const [testSubject] = await db
      .insert(subjects)
      .values({ code: `TST-${Date.now()}`, name: 'Test Subject' })
      .returning();

    const [teacherUser] = await db
      .insert(users)
      .values({
        uid: `teacher-${Date.now()}`,
        email: `teacher_${Date.now()}@school.com`,
        fullName: 'Test Teacher',
        role: 'teacher',
        status: 'active',
      })
      .returning();

    const [testTeacher] = await db
      .insert(teachers)
      .values({
        userId: teacherUser.id,
        employeeId: `TCH-${Date.now()}`,
        specialization: 'Science',
        qualification: 'B.Sc',
        status: 'active',
      })
      .returning();

    // 1. Attempt timetable creation WITHOUT assigning teacher to class + subject -> MUST return 400
    const unassignedPostRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        classId: testClass.id,
        subjectId: testSubject.id,
        teacherId: testTeacher.id,
        dayOfWeek: 'Monday',
        startTime: '08:00',
        endTime: '08:45',
        periodNumber: 1,
      }),
    });
    assert(unassignedPostRes.status === 400, `Expected 400 for unassigned teacher, got ${unassignedPostRes.status}`);
    const unassignedJson = await unassignedPostRes.json();
    assert(unassignedJson.error.includes('Teacher authorization error'), 'Must return Teacher authorization error');

    // 2. Assign teacher to class + subject in class_subjects
    await db.insert(classSubjects).values({
      classId: testClass.id,
      subjectId: testSubject.id,
      teacherId: testTeacher.id,
      periodsPerWeek: 4,
    });

    // 3. Attempt timetable creation AFTER assignment -> MUST succeed (201)
    const assignedPostRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        classId: testClass.id,
        subjectId: testSubject.id,
        teacherId: testTeacher.id,
        dayOfWeek: 'Monday',
        startTime: '08:00',
        endTime: '08:45',
        periodNumber: 1,
      }),
    });
    assert(assignedPostRes.status === 201, `Expected 201 for assigned teacher, got ${assignedPostRes.status}`);
    const assignedJson = await assignedPostRes.json();
    const createdSlotId = assignedJson.slot.id;

    // 4. Test PUT endpoint with unassigned teacher -> MUST fail (400)
    const [anotherTeacherUser] = await db
      .insert(users)
      .values({
        uid: `teacher2-${Date.now()}`,
        email: `teacher2_${Date.now()}@school.com`,
        fullName: 'Another Teacher',
        role: 'teacher',
        status: 'active',
      })
      .returning();

    const [anotherTeacher] = await db
      .insert(teachers)
      .values({
        userId: anotherTeacherUser.id,
        employeeId: `TCH2-${Date.now()}`,
        specialization: 'Arts',
        qualification: 'B.A',
        status: 'active',
      })
      .returning();

    const unassignedPutRes = await fetch(`${baseUrl}/api/timetable/${createdSlotId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        teacherId: anotherTeacher.id,
      }),
    });
    assert(unassignedPutRes.status === 400, `Expected 400 for unassigned teacher on PUT, got ${unassignedPutRes.status}`);
    console.log('  ✓ Timetable POST and PUT strictly verify teacher assignment in class_subjects.');

    console.log('\n====================================================');
    console.log('ALL 8 REGRESSION AUDIT TESTS PASSED SUCCESSFULLY! ✓');
    console.log('====================================================\n');
  } finally {
    server.close();
    try {
      const { seedInitialData } = await import('./src/db/seed.ts');
      await seedInitialData(true);
      const { ensureDemoPersonas } = await import('./src/lib/demo-init.ts');
      await ensureDemoPersonas();
      console.log('✓ Demo accounts and academic dataset restored after audit test run.');
    } catch (e: any) {
      console.warn('Post-test demo data restoration notice:', e?.message || e);
    }
  }
}

runAuditTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ AUDIT REGRESSION TEST FAILED:', err);
    process.exit(1);
  });
