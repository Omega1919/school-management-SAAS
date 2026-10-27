import path from 'path';
import os from 'os';
import assert from 'assert';
import crypto from 'crypto';
import express from 'express';

// Use an isolated test database
const isolatedTestDbDir = path.join(
  os.tmpdir(),
  `sms_auth_hardening_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
);
process.env.PGLITE_DATA_DIR = isolatedTestDbDir;
delete process.env.DATABASE_URL;
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'ultra-secure-test-jwt-secret-min-32-chars-entropy-abc123!';
process.env.ENABLE_DEMO_2FA_INSPECTION = 'true';
process.env.ENABLE_DEMO_LOGINS = 'true';

import { runMigrations } from './src/db/migrations.ts';
import { db } from './src/db/index.ts';
import {
  users,
  students,
  teachers,
  parents,
  parentStudents,
  authVerificationChallenges,
  passwordResets,
  userSessions,
} from './src/db/schema.ts';
import { authenticate } from './src/middleware/auth.ts';
import { authRouter } from './src/routes/auth.ts';
import { auditLogsRouter } from './src/routes/audit-logs.ts';
import { hashPassword, comparePassword, generateToken, verifyToken } from './src/lib/auth.ts';
import { hashToken, generateSecureToken } from './src/lib/identifiers.ts';
import { eq, and } from 'drizzle-orm';

async function runAuthHardeningTests() {
  console.log('====================================================');
  console.log('RUNNING COMPREHENSIVE AUTHENTICATION HARDENING TESTS');
  console.log('Isolated DB:', isolatedTestDbDir);
  console.log('====================================================');

  // STEP 1: MIGRATIONS
  console.log('\n[STEP 1] Running database migrations...');
  const migRes = await runMigrations();
  console.log(`✓ Applied migrations (applied: ${migRes.applied}, total: ${migRes.total})`);

  // Verify Migration 21 created universal MFA challenges and user sessions tables
  const challengesCheck = await db.select().from(authVerificationChallenges);
  assert(Array.isArray(challengesCheck), 'auth_verification_challenges must exist');
  const sessionsCheck = await db.select().from(userSessions);
  assert(Array.isArray(sessionsCheck), 'user_sessions must exist');
  console.log('✓ Migration 21 verified: universal 2FA challenges and user sessions tables ready.');

  // SETUP EXPRESS APP FOR INTEGRATION TESTING
  const app = express();
  app.use(express.json());
  app.use(authenticate);
  app.use('/api/auth', authRouter);
  app.use('/api/audit-logs', auditLogsRouter);

  // Helper request function
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api/auth`;

  async function postJson(endpoint: string, body: any, headers: Record<string, string> = {}) {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  try {
    // SEED TEST USERS WITH UNIQUE TEST RUN EMAILS
    const runId = Date.now();
    const adminEmail = `admin.live.${runId}@school.edu`;
    const teacherEmail = `teacher.live.${runId}@school.edu`;
    const parentEmail = `parent.live.${runId}@school.edu`;
    const studentEmail = `student.live.${runId}@school.edu`;

    console.log(`\n[STEP 2] Seeding test users across roles (Run ${runId})...`);
    const passwordHash = await hashPassword('SecureSchoolPass2026!');

    const [adminUser] = await db
      .insert(users)
      .values({
        uid: `uid_admin_live_${runId}`,
        email: adminEmail,
        passwordHash,
        fullName: 'Principal Sarah Jenkins',
        role: 'super_admin',
        tokenVersion: 1,
        isDemo: false,
      })
      .returning();

    const [teacherUser] = await db
      .insert(users)
      .values({
        uid: `uid_teacher_live_${runId}`,
        email: teacherEmail,
        passwordHash,
        fullName: 'Mr. David Adebayo',
        role: 'teacher',
        tokenVersion: 1,
        isDemo: false,
      })
      .returning();

    const [parentUser] = await db
      .insert(users)
      .values({
        uid: `uid_parent_live_${runId}`,
        email: parentEmail,
        passwordHash,
        fullName: 'Mrs. Fatima Bello',
        role: 'parent',
        tokenVersion: 1,
        isDemo: false,
      })
      .returning();

    const [studentUser] = await db
      .insert(users)
      .values({
        uid: `uid_student_live_${runId}`,
        email: studentEmail,
        passwordHash,
        fullName: 'Chinedu Okafor',
        role: 'student',
        tokenVersion: 1,
        isDemo: false,
      })
      .returning();

    console.log('✓ Seeded live users: super_admin, teacher, parent, student.');

    // =========================================================================
    // TEST 1: UNIVERSAL 2FA CHALLENGE CREATION ON LOGIN
    // =========================================================================
    console.log('\n[TEST 1] Universal 2FA challenge creation for all live roles...');

    // 1a. Super Admin login
    const adminLoginRes = await postJson('/login', {
      identifier: adminEmail,
      password: 'SecureSchoolPass2026!',
    });
    assert.strictEqual(adminLoginRes.status, 200, 'Admin login credentials must be accepted');
    assert.strictEqual(adminLoginRes.data.requiresVerification, true, 'Admin must require 2FA verification');
    assert(adminLoginRes.data.verifyToken, 'Admin login must return a verifyToken');
    assert(!adminLoginRes.data.token, 'Must NOT issue session token before 2FA verification');

    // 1b. Teacher login
    const teacherLoginRes = await postJson('/login', {
      identifier: teacherEmail,
      password: 'SecureSchoolPass2026!',
    });
    assert.strictEqual(teacherLoginRes.status, 200, 'Teacher login credentials must be accepted');
    assert.strictEqual(teacherLoginRes.data.requiresVerification, true, 'Teacher must require 2FA verification');
    assert(teacherLoginRes.data.verifyToken, 'Teacher login must return a verifyToken');
    assert(!teacherLoginRes.data.token, 'Must NOT issue session token before 2FA verification');

    // 1c. Parent login
    const parentLoginRes = await postJson('/login', {
      identifier: parentEmail,
      password: 'SecureSchoolPass2026!',
    });
    assert.strictEqual(parentLoginRes.status, 200, 'Parent login credentials must be accepted');
    assert.strictEqual(parentLoginRes.data.requiresVerification, true, 'Parent must require 2FA verification');

    // 1d. Student login
    const studentLoginRes = await postJson('/login', {
      identifier: studentEmail,
      password: 'SecureSchoolPass2026!',
    });
    assert.strictEqual(studentLoginRes.status, 200, 'Student login credentials must be accepted');
    assert.strictEqual(studentLoginRes.data.requiresVerification, true, 'Student must require 2FA verification');
    console.log('  ✓ Verified: All 4 roles (super_admin, teacher, parent, student) require email 2FA.');

    // =========================================================================
    // TEST 2: ATTEMPTED DEMO BYPASS ON LIVE LOGIN MUST FAIL
    // =========================================================================
    console.log('\n[TEST 2] Verifying client-sent demo bypass flags are strictly ignored on /login...');
    const bypassAttempt1 = await postJson('/login', {
      identifier: adminEmail,
      password: 'SecureSchoolPass2026!',
      isDemo: true,
      demoLogin: true,
      role: 'super_admin',
    });
    assert.strictEqual(bypassAttempt1.status, 200);
    assert.strictEqual(bypassAttempt1.data.requiresVerification, true, 'isDemo: true flag must NEVER bypass MFA');
    assert(!bypassAttempt1.data.token, 'Bypass attempt must not receive session token');
    console.log('  ✓ Client-supplied demo flags (isDemo, demoLogin) on live /login strictly ignored.');

    // =========================================================================
    // TEST 3: CRYPTOGRAPHIC CODE STORAGE IN DATABASE
    // =========================================================================
    console.log('\n[TEST 3] Cryptographic hashing of verification codes in database...');
    const activeAdminVerifyToken = bypassAttempt1.data.verifyToken;

    const challengeRecords = await db
      .select()
      .from(authVerificationChallenges)
      .where(eq(authVerificationChallenges.challengeToken, activeAdminVerifyToken));

    assert.strictEqual(challengeRecords.length, 1, 'Challenge record must exist in DB');
    const challenge = challengeRecords[0];
    assert.strictEqual(challenge.userId, adminUser.id, 'Challenge must reference correct user');
    assert.strictEqual(challenge.attemptsRemaining, 5, 'Initial attemptsRemaining must be 5');
    assert.strictEqual(challenge.isConsumed, false, 'Challenge must not be consumed initially');
    assert.strictEqual(challenge.codeHash.length, 64, 'Stored code must be a 64-character SHA-256 hex hash');

    // Ensure code is stored strictly as a 64-character SHA-256 hex string
    assert(/^[a-f0-9]{64}$/i.test(challenge.codeHash), 'Stored codeHash must be a valid 64-character SHA-256 hex string');
    console.log('  ✓ Verified: 2FA codes are securely hashed (SHA-256) in the database.');

    // =========================================================================
    // TEST 4: VERIFICATION CODE ATTEMPT EXHAUSTION & INVALIDATION
    // =========================================================================
    console.log('\n[TEST 4] 2FA attempt limits (maximum 5 attempts before challenge invalidation)...');
    // Send 4 wrong attempts
    for (let i = 1; i <= 4; i++) {
      const wrongRes = await postJson('/verify-2fa', {
        verifyToken: activeAdminVerifyToken,
        code: '000000',
      });
      assert.strictEqual(wrongRes.status, 400, `Attempt ${i} must fail`);
      assert(wrongRes.data.error.includes('attempt(s) remaining') || wrongRes.data.error.includes('Invalid'));
    }

    // 5th wrong attempt must invalidate the challenge
    const fifthAttempt = await postJson('/verify-2fa', {
      verifyToken: activeAdminVerifyToken,
      code: '000000',
    });
    assert.strictEqual(fifthAttempt.status, 400, '5th attempt must fail');
    assert(
      fifthAttempt.data.error.includes('Maximum attempts exceeded') || fifthAttempt.data.error.includes('terminated'),
      'Must notify that challenge has been exhausted'
    );

    // Verify challenge is eliminated or marked invalid in DB
    const exhaustedCheck = await db
      .select()
      .from(authVerificationChallenges)
      .where(eq(authVerificationChallenges.challengeToken, activeAdminVerifyToken));
    assert.strictEqual(exhaustedCheck.length, 0, 'Exhausted challenge must be terminated');

    // Any subsequent attempt even with correct code must now fail
    const postExhaustionAttempt = await postJson('/verify-2fa', {
      verifyToken: activeAdminVerifyToken,
      code: '123456',
    });
    assert.strictEqual(postExhaustionAttempt.status, 400, 'Exhausted challenge must reject all codes');
    console.log('  ✓ Attempt limits enforced: challenge invalidated after 5 consecutive failures.');

    // =========================================================================
    // TEST 5: RESEND COOLDOWN AND ATOMIC CODE CONSUMPTION
    // =========================================================================
    console.log('\n[TEST 5] Resend cooldown and atomic single-use code consumption...');
    // Fresh login for teacher
    const freshTeacherLogin = await postJson('/login', {
      identifier: teacherEmail,
      password: 'SecureSchoolPass2026!',
    });
    const teacherVerifyToken = freshTeacherLogin.data.verifyToken;

    // Resend immediately -> should be blocked by 30-second cooldown
    const earlyResend = await postJson('/resend-2fa', {
      verifyToken: teacherVerifyToken,
    });
    assert.strictEqual(earlyResend.status, 429, 'Immediate resend must trigger 429 cooldown');
    assert(earlyResend.data.error.includes('cooldown') || earlyResend.data.error.includes('wait'));
    console.log('  ✓ Resend cooldown enforced: rapid resending rejected with HTTP 429.');

    // Verify login API response strictly does NOT leak verification codes
    assert(!freshTeacherLogin.data.devCode, 'Login API response must NEVER leak verification codes in response body');

    // Retrieve from safe non-production simulated mailbox inspector
    const mailRes = await fetch(`${baseUrl}/demo-simulated-mail?verifyToken=${encodeURIComponent(teacherVerifyToken)}`);
    assert.strictEqual(mailRes.status, 200, 'Non-production simulated mailbox must provide code for verification');
    const mailData: any = await mailRes.json();
    assert(mailData.verificationCode, 'Verification code must be present in simulated mail');
    const teacherCode = mailData.verificationCode;

    const verifySuccessRes = await postJson('/verify-2fa', {
      verifyToken: teacherVerifyToken,
      code: teacherCode,
    });
    assert.strictEqual(verifySuccessRes.status, 200, 'Valid code must authenticate');
    assert(verifySuccessRes.data.token, 'Must issue JWT token on successful 2FA verification');
    assert.strictEqual(verifySuccessRes.data.user.email, teacherEmail);
    assert.strictEqual(verifySuccessRes.data.user.role, 'teacher');

    const teacherAuthToken = verifySuccessRes.data.token;

    // Replay attack: attempting to reuse the same code must fail immediately
    const replayRes = await postJson('/verify-2fa', {
      verifyToken: teacherVerifyToken,
      code: teacherCode,
    });
    assert.strictEqual(replayRes.status, 400, 'Replay of consumed verification code must be rejected');
    console.log('  ✓ Atomic single-use verified: replay of used 2FA challenge strictly rejected.');

    // =========================================================================
    // TEST 6: ISOLATED DEMO AUTHENTICATION
    // =========================================================================
    console.log('\n[TEST 6] Testing server-isolated demo authentication endpoint (/api/auth/demo-login)...');
    const demoAdminRes = await postJson('/demo-login', { role: 'super_admin' });
    assert.strictEqual(demoAdminRes.status, 200, 'Demo admin login should succeed when enabled');
    assert(demoAdminRes.data.token, 'Demo login returns token');
    assert.strictEqual(demoAdminRes.data.user.isDemo, true, 'Demo user must be flagged isDemo: true');

    const demoPayload = verifyToken(demoAdminRes.data.token);
    assert.strictEqual(demoPayload.isDemo, true, 'JWT payload must declare isDemo: true');

    // Demo student login
    const demoStudentRes = await postJson('/demo-login', { role: 'student' });
    assert.strictEqual(demoStudentRes.status, 200);
    assert.strictEqual(demoStudentRes.data.user.role, 'student');
    assert.strictEqual(demoStudentRes.data.user.isDemo, true);
    console.log('  ✓ Demo authentication isolated: distinct endpoint, tagged isDemo: true.');

    // =========================================================================
    // TEST 7: REAL PASSWORD RESET FLOW BY EMAIL
    // =========================================================================
    console.log('\n[TEST 7] Password reset request, token generation, and secure reset...');
    // 7a. Generic response prevents account enumeration
    const nonExistentReset = await postJson('/forgot-password', {
      email: 'nonexistent.user@school.edu',
    });
    assert.strictEqual(nonExistentReset.status, 200, 'Must return 200 generic success');
    assert(nonExistentReset.data.message.includes('If an account exists'));

    // 7b. Valid reset request
    const validReset = await postJson('/forgot-password', {
      email: studentEmail,
    });
    assert.strictEqual(validReset.status, 200);
    assert(validReset.data.message.includes('If an account exists'));

    // Verify token stored hashed in password_resets
    const resetRecords = await db
      .select()
      .from(passwordResets)
      .where(and(eq(passwordResets.userId, studentUser.id), eq(passwordResets.isUsed, false)));
    assert(resetRecords.length >= 1, 'Password reset record must exist in DB');
    const resetEntry = resetRecords[0];
    assert.strictEqual(resetEntry.resetToken.length, 64, 'Reset token must be stored as SHA-256 hash');

    // Now test resetting password using a known token
    const testRawToken = generateSecureToken('RST');
    const testTokenHash = hashToken(testRawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResets).values({
      userId: studentUser.id,
      resetToken: testTokenHash,
      expiresAt,
      isUsed: false,
    });

    // 7c. Submit new password
    const newPasswordPlain = 'NewStudentPass2026!#';
    const completeReset = await postJson('/reset-password', {
      resetToken: testRawToken,
      newPassword: newPasswordPlain,
    });
    assert.strictEqual(completeReset.status, 200, 'Password reset must succeed');
    assert(completeReset.data.message.includes('securely reset'));

    // Verify password updated in DB
    const [updatedStudent] = await db.select().from(users).where(eq(users.id, studentUser.id));
    assert(
      await comparePassword(newPasswordPlain, updatedStudent.passwordHash),
      'New password hash must match new password'
    );

    // Verify reset token consumed
    const consumedCheck = await db
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.resetToken, testTokenHash));
    assert.strictEqual(consumedCheck[0].isUsed, true, 'Reset token must be marked isUsed = true');

    // 7d. Attempting to reuse the reset token must fail
    const reuseAttempt = await postJson('/reset-password', {
      resetToken: testRawToken,
      newPassword: 'AnotherPassword123!',
    });
    assert.strictEqual(reuseAttempt.status, 400, 'Reusing consumed reset token must be rejected');

    // 7e. Expired token rejection
    const expiredRawToken = generateSecureToken('RST');
    const expiredTokenHash = hashToken(expiredRawToken);
    await db.insert(passwordResets).values({
      userId: studentUser.id,
      resetToken: expiredTokenHash,
      expiresAt: new Date(Date.now() - 10000), // in the past
      isUsed: false,
    });
    const expiredAttempt = await postJson('/reset-password', {
      resetToken: expiredRawToken,
      newPassword: 'AnotherPassword123!',
    });
    assert.strictEqual(expiredAttempt.status, 400, 'Expired reset token must be rejected');
    console.log('  ✓ Password reset verified: high-entropy tokens, SHA-256 hashing, single-use, expiry enforcement.');

    // =========================================================================
    // TEST 8: SESSION INVALIDATION ON PASSWORD RESET AND LOGOUT
    // =========================================================================
    console.log('\n[TEST 8] Session revocation via tokenVersion validation...');
    // Create an old token for student with tokenVersion = 1
    const oldStudentToken = generateToken({
      id: studentUser.id,
      email: studentUser.email,
      role: 'student',
      tokenVersion: 1, // student's tokenVersion was incremented to 2 after reset!
    });

    const studentMeRes = await fetch(`${baseUrl}/me`, {
      headers: { Authorization: `Bearer ${oldStudentToken}` },
    });
    assert.strictEqual(
      studentMeRes.status,
      401,
      'Token with outdated tokenVersion must be rejected with 401 Unauthorized'
    );
    console.log('  ✓ Outdated sessions revoked: tokenVersion check rejected invalidated JWT.');

    // Test explicit logout session revocation
    const activeAdminToken = generateToken({
      id: adminUser.id,
      email: adminUser.email,
      role: 'super_admin',
      tokenVersion: adminUser.tokenVersion || 1,
    });

    const logoutRes = await fetch(`${baseUrl}/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${activeAdminToken}` },
    });
    assert.strictEqual(logoutRes.status, 200, 'Logout request must succeed');

    // Attempting to access /me with the logged out token must now fail
    const postLogoutMe = await fetch(`${baseUrl}/me`, {
      headers: { Authorization: `Bearer ${activeAdminToken}` },
    });
    assert.strictEqual(postLogoutMe.status, 401, 'Logged out session must be rejected with 401');
    console.log('  ✓ Server-side logout verified: user tokenVersion advanced, sessions invalidated.');

    // =========================================================================
    // TEST 9: CROSS-ROLE AUTHORIZATION RESTRICTIONS
    // =========================================================================
    console.log('\n[TEST 9] Cross-role authorization restrictions...');
    // Live teacher token
    const liveTeacherToken = generateToken({
      id: teacherUser.id,
      email: teacherUser.email,
      role: 'teacher',
      tokenVersion: teacherUser.tokenVersion || 1,
    });

    // Parent token
    const liveParentToken = generateToken({
      id: parentUser.id,
      email: parentUser.email,
      role: 'parent',
      tokenVersion: parentUser.tokenVersion || 1,
    });

    // Non-admin attempting to access admin audit logs
    const auditRes = await fetch(`http://127.0.0.1:${port}/api/audit-logs`, {
      headers: { Authorization: `Bearer ${liveTeacherToken}` },
    });
    assert.strictEqual(auditRes.status, 403, 'Teacher must receive 403 Forbidden on super_admin audit logs');

    // Admin accessing audit logs
    const [freshAdmin] = await db.select().from(users).where(eq(users.id, adminUser.id));
    const freshAdminToken = generateToken({
      id: freshAdmin.id,
      email: freshAdmin.email,
      role: 'super_admin',
      tokenVersion: freshAdmin.tokenVersion || 1,
    });
    const adminAuditRes = await fetch(`http://127.0.0.1:${port}/api/audit-logs`, {
      headers: { Authorization: `Bearer ${freshAdminToken}` },
    });
    assert.strictEqual(adminAuditRes.status, 200, 'Super admin must have access to audit logs');

    // Parent attempting to access administrative setup status
    const setupRes = await fetch(`http://127.0.0.1:${port}/api/auth/admin-status`, {
      headers: { Authorization: `Bearer ${liveParentToken}` },
    });
    assert.strictEqual(setupRes.status, 200, 'Admin status check should be accessible');
    const elevationAttempt = await fetch(`http://127.0.0.1:${port}/api/auth/register-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupKey: 'invalid-key', email: 'hacker@test.com', password: 'ShortPassword123!' }),
    });
    assert.strictEqual(elevationAttempt.status, 403, 'Privilege escalation with invalid key rejected with 403 Forbidden');
    console.log('  ✓ Cross-role authorization boundaries verified.');

    console.log('\n====================================================');
    console.log('ALL AUTHENTICATION HARDENING TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
  } finally {
    server.close();
  }
}

runAuthHardeningTests().catch((err) => {
  console.error('\n❌ AUTH HARDENING TEST FAILED:', err);
  process.exit(1);
});
