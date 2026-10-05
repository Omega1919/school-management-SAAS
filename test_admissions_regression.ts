import { db, pool } from './src/db/index.ts';
import { runMigrations } from './src/db/migrations.ts';
import { ensureDefaultDemoData } from './src/db/seed.ts';
import {
  users,
  academicSessions,
  classes,
  departments,
  admissionApplications,
  admissionApplicationLogs,
  students,
  studentEnrollments,
} from './src/db/schema.ts';
import { generateToken, hashPassword } from './src/lib/auth.ts';
import { admissionsRouter } from './src/routes/admissions.ts';
import { academicRouter } from './src/routes/academic.ts';
import { classesRouter } from './src/routes/classes.ts';
import express from 'express';
import { authenticate } from './src/middleware/auth.ts';
import { createRateLimiter } from './src/middleware/rate-limiter.ts';
import { eq, and, count } from 'drizzle-orm';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runAdmissionsRegressionTests() {
  console.log('===============================================================');
  console.log('STARTING PUBLIC STUDENT REGISTRATION & ADMISSIONS REGRESSION SUITE');
  console.log('===============================================================\n');

  // Setup Express test harness
  const app = express();
  app.use(express.json());
  app.use(authenticate);
  app.use('/api/admissions', admissionsRouter);
  app.use('/api/academic', academicRouter);
  app.use('/api/classes', classesRouter);

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 0. Database & Seed verification
    console.log('[SETUP] Verifying migrations and seed data...');
    await runMigrations();
    await ensureDefaultDemoData();

    // Fetch an active session and class from DB
    const [testSession] = await db
      .select()
      .from(academicSessions)
      .where(eq(academicSessions.isCurrent, true))
      .limit(1);
    assert(!!testSession, 'Active academic session must exist');

    const [testClass] = await db
      .select()
      .from(classes)
      .where(and(eq(classes.status, 'active'), eq(classes.sessionId, testSession.id)))
      .limit(1);
    assert(!!testClass, 'Active class for current session must exist');

    // Fetch admin user or bootstrap for test harness
    let [adminUser] = await db
      .select()
      .from(users)
      .where(eq(users.role, 'super_admin'))
      .limit(1);

    if (!adminUser) {
      const passHash = await hashPassword('admin123');
      const [newAdmin] = await db
        .insert(users)
        .values({
          uid: 'admin-test-uid-1',
          email: 'admin.admissions.test@school.com',
          passwordHash: passHash,
          fullName: 'Admissions Test Super Admin',
          role: 'super_admin',
          status: 'active',
        })
        .returning();
      adminUser = newAdmin;
    }
    assert(!!adminUser, 'Super admin user must exist');
    const adminToken = generateToken(adminUser);

    // Fetch student user (unauthorized actor)
    const [studentUser] = await db
      .select()
      .from(users)
      .where(eq(users.role, 'student'))
      .limit(1);
    assert(!!studentUser, 'Student user must exist');
    const studentToken = generateToken(studentUser);

    console.log(`✓ Test Environment Configured: Session "${testSession.name}", Class "${testClass.name}"\n`);

    // ------------------------------------------------------------------------
    // TEST 1: Applicant can submit valid application
    // ------------------------------------------------------------------------
    console.log('[TEST 1/12] Testing valid public application submission...');
    const uniqueEmail = `applicant.${Date.now()}@example.com`;
    const submitRes = await fetch(`${baseUrl}/api/admissions/public/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Olumide',
        middleName: 'Ayotunde',
        lastName: 'Fashola',
        dateOfBirth: '2010-06-12',
        gender: 'Male',
        email: uniqueEmail,
        phone: '+234 802 999 8888',
        address: '10 Admiralty Way, Lekki, Lagos',
        sessionId: testSession.id,
        classId: testClass.id,
        guardianName: 'Dr. Fashola',
        guardianPhone: '+234 803 111 4444',
        guardianRelationship: 'Father',
        applicantMessage: 'Passionate scholar in sciences and robotics.',
      }),
    });

    assert(submitRes.status === 201, `Submission status expected 201, got ${submitRes.status}`);
    const submitData = await submitRes.json();
    assert(!!submitData.applicationNumber, 'Response must include applicationNumber');
    assert(!!submitData.accessKey, 'Response must include private accessKey');
    assert(submitData.status === 'pending', 'Initial status must be pending');

    const appNumber = submitData.applicationNumber;
    const accessKey = submitData.accessKey;
    console.log(`✓ Valid application created: ${appNumber}\n`);

    // ------------------------------------------------------------------------
    // TEST 2: Invalid class/level is rejected
    // ------------------------------------------------------------------------
    console.log('[TEST 2/12] Testing rejection of invalid class/level...');
    const invalidClassRes = await fetch(`${baseUrl}/api/admissions/public/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Test',
        lastName: 'InvalidClass',
        dateOfBirth: '2010-01-01',
        gender: 'Female',
        email: `invalid.class.${Date.now()}@example.com`,
        phone: '+234 801 000 0000',
        address: 'Test Address',
        sessionId: testSession.id,
        classId: 9999999, // non-existent class
      }),
    });
    assert(invalidClassRes.status === 400, `Expected 400 for invalid class, got ${invalidClassRes.status}`);
    const invalidClassErr = await invalidClassRes.json();
    assert(invalidClassErr.error?.includes('class'), 'Error should mention class');
    console.log('✓ Invalid class correctly rejected with 400.\n');

    // ------------------------------------------------------------------------
    // TEST 3: Invalid academic session is rejected
    // ------------------------------------------------------------------------
    console.log('[TEST 3/12] Testing rejection of invalid academic session...');
    const invalidSessionRes = await fetch(`${baseUrl}/api/admissions/public/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Test',
        lastName: 'InvalidSession',
        dateOfBirth: '2010-01-01',
        gender: 'Male',
        email: `invalid.session.${Date.now()}@example.com`,
        phone: '+234 801 000 0000',
        address: 'Test Address',
        sessionId: 8888888, // non-existent session
        classId: testClass.id,
      }),
    });
    assert(invalidSessionRes.status === 400, `Expected 400 for invalid session, got ${invalidSessionRes.status}`);
    console.log('✓ Invalid academic session correctly rejected with 400.\n');

    // ------------------------------------------------------------------------
    // TEST 4: Applicant cannot access another applicant's application
    // ------------------------------------------------------------------------
    console.log('[TEST 4/12] Testing applicant privacy and access key enforcement...');
    const wrongKeyRes = await fetch(`${baseUrl}/api/admissions/public/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationNumber: appNumber,
        accessKey: 'WRONG-KEY-12345',
      }),
    });
    assert(wrongKeyRes.status === 404, `Expected 404 for mismatched accessKey, got ${wrongKeyRes.status}`);

    // Legitimate lookup
    const validKeyRes = await fetch(`${baseUrl}/api/admissions/public/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationNumber: appNumber,
        accessKey: accessKey,
      }),
    });
    assert(validKeyRes.status === 200, `Expected 200 for valid accessKey, got ${validKeyRes.status}`);
    const trackedData = await validKeyRes.json();
    assert(trackedData.applicationNumber === appNumber, 'Tracked data matches applicant');
    assert(trackedData.status === 'pending', 'Status correctly tracked as pending');
    console.log('✓ Applicant isolation verified: unauthorized access strictly denied.\n');

    // ------------------------------------------------------------------------
    // TEST 5: Applicant cannot modify academic structure
    // ------------------------------------------------------------------------
    console.log('[TEST 5/12] Testing security: applicants cannot modify academic structure...');
    const unauthSessionCreate = await fetch(`${baseUrl}/api/academic/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // No auth header
      body: JSON.stringify({
        name: 'Hacked Session 2099',
        startDate: '2099-01-01',
        endDate: '2099-12-31',
      }),
    });
    assert(unauthSessionCreate.status === 401, `Expected 401 for unauthenticated session creation, got ${unauthSessionCreate.status}`);

    const studentClassCreate = await fetch(`${baseUrl}/api/classes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        name: 'Hacked Class',
      }),
    });
    assert(studentClassCreate.status === 403, `Expected 403 for student modifying class structure, got ${studentClassCreate.status}`);
    console.log('✓ Academic structure protected by server-side RBAC (401/403 enforced).\n');

    // ------------------------------------------------------------------------
    // TEST 6: Admin can review applications
    // ------------------------------------------------------------------------
    console.log('[TEST 6/12] Testing admin review of submitted applications...');
    const listRes = await fetch(`${baseUrl}/api/admissions/applications?q=${encodeURIComponent(appNumber)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(listRes.status === 200, `Expected 200 for admin listing applications, got ${listRes.status}`);
    const listData = await listRes.json();
    assert(listData.data.length > 0, 'Admin should find the submitted application');
    const createdAppId = listData.data[0].id;

    // Single details lookup
    const detailsRes = await fetch(`${baseUrl}/api/admissions/applications/${createdAppId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(detailsRes.status === 200, `Expected 200 for admin application details, got ${detailsRes.status}`);
    const detailsData = await detailsRes.json();
    assert(detailsData.application.applicationNumber === appNumber, 'Details match application number');
    assert(detailsData.logs.length >= 1, 'Initial submission log must be present');
    console.log('✓ Admin successfully reviewed application and audit history.\n');

    // ------------------------------------------------------------------------
    // TEST 7 & 8: Admin approves application -> Creates exactly one student and one enrollment
    // ------------------------------------------------------------------------
    console.log('[TEST 7 & 8/12] Testing application approval and atomic student/enrollment creation...');
    const initialStudentCount = await db.select({ count: count() }).from(students).where(eq(students.classId, testClass.id));
    const initialEnrollmentCount = await db.select({ count: count() }).from(studentEnrollments).where(and(eq(studentEnrollments.classId, testClass.id), eq(studentEnrollments.sessionId, testSession.id)));

    const approveRes = await fetch(`${baseUrl}/api/admissions/applications/${createdAppId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        notes: 'Official admission granted by admissions board.',
      }),
    });
    assert(approveRes.status === 200, `Expected 200 for approval, got ${approveRes.status}`);
    const approveData = await approveRes.json();
    assert(approveData.success === true, 'Approval response success should be true');
    assert(!!approveData.student.studentId, 'New official studentId must be returned');
    assert(!!approveData.enrollmentToken, 'Enrollment token for student account activation must be returned');

    // Verify exactly one student record and one enrollment record created
    const postStudentCount = await db.select({ count: count() }).from(students).where(eq(students.classId, testClass.id));
    const postEnrollmentCount = await db.select({ count: count() }).from(studentEnrollments).where(and(eq(studentEnrollments.classId, testClass.id), eq(studentEnrollments.sessionId, testSession.id)));

    assert(Number(postStudentCount[0].count) === Number(initialStudentCount[0].count) + 1, 'Exactly one student profile must be created');
    assert(Number(postEnrollmentCount[0].count) === Number(initialEnrollmentCount[0].count) + 1, 'Exactly one enrollment record must be created');

    // Check application status in database
    const [appInDb] = await db.select().from(admissionApplications).where(eq(admissionApplications.id, createdAppId)).limit(1);
    assert(appInDb.status === 'approved', 'Database application status must be approved');
    assert(appInDb.approvedStudentId === approveData.student.id, 'approvedStudentId must link to new student record');
    assert(appInDb.reviewedBy === adminUser.id, 'reviewedBy must record the approving admin user');
    console.log(`✓ Approval verified: Exactly 1 student profile and 1 enrollment created (Student ID: ${approveData.student.studentId})\n`);

    // ------------------------------------------------------------------------
    // TEST 9: Duplicate approval cannot create duplicate records
    // ------------------------------------------------------------------------
    console.log('[TEST 9/12] Testing duplicate approval prevention...');
    const duplicateApproveRes = await fetch(`${baseUrl}/api/admissions/applications/${createdAppId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ notes: 'Attempting duplicate approval' }),
    });
    assert(duplicateApproveRes.status === 409, `Expected 409 conflict for duplicate approval, got ${duplicateApproveRes.status}`);

    const finalStudentCount = await db.select({ count: count() }).from(students).where(eq(students.classId, testClass.id));
    assert(Number(finalStudentCount[0].count) === Number(postStudentCount[0].count), 'No duplicate student records created on second approval attempt');
    console.log('✓ Duplicate approval blocked with 409 conflict. Record duplication prevented.\n');

    // ------------------------------------------------------------------------
    // TEST 10: Unauthorized users cannot approve applications
    // ------------------------------------------------------------------------
    console.log('[TEST 10/12] Testing authorization: non-admins cannot approve applications...');
    // Create another application to test unauthorized approval
    const [unauthTestApp] = await db
      .insert(admissionApplications)
      .values({
        applicationNumber: `APP-TEST-${Date.now()}`,
        accessKey: 'TEST-KEY',
        firstName: 'Unauthorized',
        lastName: 'Test',
        dateOfBirth: '2010-01-01',
        gender: 'Female',
        email: `unauth.${Date.now()}@example.com`,
        phone: '+234 800 123 4567',
        address: 'Test',
        sessionId: testSession.id,
        classId: testClass.id,
        status: 'pending',
      })
      .returning();

    const studentApproveRes = await fetch(`${baseUrl}/api/admissions/applications/${unauthTestApp.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`, // student role
      },
      body: JSON.stringify({ notes: 'Student approving' }),
    });
    assert(studentApproveRes.status === 403, `Expected 403 for student approving application, got ${studentApproveRes.status}`);

    const anonApproveRes = await fetch(`${baseUrl}/api/admissions/applications/${unauthTestApp.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // unauthenticated
      body: JSON.stringify({ notes: 'Anon approving' }),
    });
    assert(anonApproveRes.status === 401, `Expected 401 for anonymous approval, got ${anonApproveRes.status}`);
    console.log('✓ RBAC verified: Only super_admin can approve applications.\n');

    // ------------------------------------------------------------------------
    // TEST 11: Rate limiting on public submissions works
    // ------------------------------------------------------------------------
    console.log('[TEST 11/12] Testing public rate limiter configuration and execution...');
    // Create a local limiter test app to verify rate limiter 429 response without altering global IP
    const limiterTestApp = express();
    limiterTestApp.use(express.json());
    const testLimiter = createRateLimiter({
      windowMs: 60 * 1000,
      max: 3,
      message: 'Rate limit exceeded for admissions',
      keyPrefix: 'test_admissions',
      skipDevRelaxation: true,
    });
    limiterTestApp.post('/test-limit', testLimiter, (_req, res) => res.json({ ok: true }));
    const limiterServer = limiterTestApp.listen(0);
    const limPort = (limiterServer.address() as any).port;
    const limUrl = `http://127.0.0.1:${limPort}`;

    let hit429 = false;
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${limUrl}/test-limit`, { method: 'POST' });
      if (r.status === 429) {
        hit429 = true;
        break;
      }
    }
    limiterServer.close();
    assert(hit429, 'Rate limiter must respond with 429 when max threshold is exceeded');
    console.log('✓ Public submission rate limiting operates correctly with 429 status.\n');

    // ------------------------------------------------------------------------
    // TEST 12: Database transaction rollback on failure
    // ------------------------------------------------------------------------
    console.log('[TEST 12/12] Testing transaction atomicity and rollback...');
    // Create a test application referencing a class, but simulate an error
    const [rollbackApp] = await db
      .insert(admissionApplications)
      .values({
        applicationNumber: `APP-RB-${Date.now()}`,
        accessKey: 'RB-KEY',
        firstName: 'Rollback',
        lastName: 'Candidate',
        dateOfBirth: '2010-01-01',
        gender: 'Male',
        email: `rollback.${Date.now()}@example.com`,
        phone: '+234 800 000 1111',
        address: 'Rollback address',
        sessionId: testSession.id,
        classId: testClass.id,
        status: 'pending',
      })
      .returning();

    // Verify transaction rollback pattern: If any step fails inside transaction, nothing persists
    let rollbackCaught = false;
    try {
      await db.transaction(async (tx) => {
        await tx.update(admissionApplications).set({ status: 'approved' }).where(eq(admissionApplications.id, rollbackApp.id));
        // Intentionally throw error to force rollback
        throw new Error('Simulated atomic failure during student enrollment');
      });
    } catch (err: any) {
      rollbackCaught = true;
    }
    assert(rollbackCaught, 'Transaction error was caught');

    // Verify application in DB did NOT change status
    const [checkRollback] = await db.select().from(admissionApplications).where(eq(admissionApplications.id, rollbackApp.id)).limit(1);
    assert(checkRollback.status === 'pending', 'Application status must remain "pending" after rollback');
    console.log('✓ Transaction atomicity verified: rolled back cleanly with zero data corruption.\n');

    // Clean up test app
    await db.delete(admissionApplications).where(eq(admissionApplications.id, rollbackApp.id));
    await db.delete(admissionApplications).where(eq(admissionApplications.id, unauthTestApp.id));

    console.log('===============================================================');
    console.log('ALL 12/12 ADMISSIONS & REGISTRATION REGRESSION TESTS PASSED! ✅');
    console.log('===============================================================\n');
  } finally {
    server.close();
  }
}

runAdmissionsRegressionTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FATAL TEST FAILURE:', err);
    process.exit(1);
  });
