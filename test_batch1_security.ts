import path from 'path';
import os from 'os';
import assert from 'assert';
import crypto from 'crypto';

// Use an isolated test database
const isolatedTestDbDir = path.join(os.tmpdir(), `sms_batch1_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
process.env.PGLITE_DATA_DIR = isolatedTestDbDir;
delete process.env.DATABASE_URL;
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'super-secure-test-jwt-secret-with-more-than-32-chars-entropy!';
process.env.ENABLE_DEMO_2FA_INSPECTION = 'true';

import { hashPassword, comparePassword, validatePasswordStrength } from './src/lib/auth.ts';
import { hashToken } from './src/lib/identifiers.ts';
import { eq } from 'drizzle-orm';

async function runBatch1Tests() {
  console.log('====================================================');
  console.log('RUNNING BATCH 1 SECURITY & 2FA TESTS');
  console.log('Isolated DB:', isolatedTestDbDir);
  console.log('====================================================');

  // Dynamically import database modules so process.env.PGLITE_DATA_DIR takes effect
  const express = (await import('express')).default;
  const { runMigrations } = await import('./src/db/migrations.ts');
  const { db } = await import('./src/db/index.ts');
  const { users, adminVerificationSessions } = await import('./src/db/schema.ts');
  const { authenticate } = await import('./src/middleware/auth.ts');
  const { authRouter } = await import('./src/routes/auth.ts');

  // 1. Run migrations
  console.log('\n[STEP 1] Running migrations...');
  const migRes = await runMigrations();
  console.log(`✓ Applied migrations (applied: ${migRes.applied}, total: ${migRes.total})`);

  // Verify migration 20 created admin_verification_sessions
  const sessionCount = await db.select().from(adminVerificationSessions);
  assert(Array.isArray(sessionCount), 'admin_verification_sessions must exist');
  console.log('✓ Migration 20 verified: admin_verification_sessions table ready.');

  // 2. Test validatePasswordStrength
  console.log('\n[TEST 1] Testing password length and bcrypt 72-byte boundaries...');
  assert.strictEqual(validatePasswordStrength('').valid, false, 'Empty password must be invalid');
  assert.strictEqual(validatePasswordStrength('short').valid, false, 'Short password must be invalid');
  assert.strictEqual(validatePasswordStrength('1234567').valid, false, '7-char password must be invalid');
  assert.strictEqual(validatePasswordStrength('validpass123').valid, true, '8-char password must be valid');

  const tooLongPassword = 'A'.repeat(73);
  const longCheck = validatePasswordStrength(tooLongPassword);
  assert.strictEqual(longCheck.valid, false, '73-byte password must be rejected');
  assert(longCheck.error?.includes('72 bytes'), 'Error must specify 72 byte limit');
  console.log('  ✓ Password bounds (< 8 chars and > 72 bytes) verified.');

  // 3. Test bcrypt hashing work factor & uniqueness
  console.log('\n[TEST 2] Testing bcrypt work factor and unique salting...');
  const plain = 'GreenwoodPass2026!';
  const hash1 = await hashPassword(plain);
  const hash2 = await hashPassword(plain);
  assert(hash1.startsWith('$2a$12$') || hash1.startsWith('$2b$12$'), 'Hash must use work factor 12');
  assert.notStrictEqual(hash1, hash2, 'Identical passwords must have different salts');
  assert.strictEqual(await comparePassword(plain, hash1), true, 'Hash 1 must verify');
  assert.strictEqual(await comparePassword(plain, hash2), true, 'Hash 2 must verify');
  assert.strictEqual(await comparePassword('WrongPassword', hash1), false, 'Wrong password must fail verification');
  console.log('  ✓ Bcrypt work factor 12 and unique salt generation verified.');

  // 4. Start Express Test Server
  console.log('\n[STEP 2] Launching test HTTP server...');
  const app = express();
  app.use(express.json());
  app.use(authenticate);
  app.use('/api/auth', authRouter);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✓ Test server running on ${baseUrl}`);

  try {
    // 5. Create test admin and regular user
    const adminEmail = `director_${Date.now()}@school.test`;
    const adminPass = 'DirectorPass123!';
    const [adminUser] = await db
      .insert(users)
      .values({
        uid: `admin-${Date.now()}`,
        email: adminEmail,
        fullName: 'Academic Director',
        role: 'super_admin',
        status: 'active',
        passwordHash: await hashPassword(adminPass),
      })
      .returning();

    const teacherEmail = `teacher_${Date.now()}@school.test`;
    const teacherPass = 'TeacherPass123!';
    const [teacherUser] = await db
      .insert(users)
      .values({
        uid: `teacher-${Date.now()}`,
        email: teacherEmail,
        fullName: 'Mr. Teacher',
        role: 'teacher',
        status: 'active',
        passwordHash: await hashPassword(teacherPass),
      })
      .returning();

    // 6. Test Super Admin Login - Ensure NO 2FA Code in Response
    console.log('\n[TEST 3] Testing Super Admin Login (2FA Initiation & Secret Sanitization)...');
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: adminEmail,
        password: adminPass,
        expectedRole: 'super_admin',
      }),
    });
    assert.strictEqual(loginRes.status, 200);
    const loginBody = await loginRes.json();
    assert.strictEqual(loginBody.requiresVerification, true);
    assert.ok(loginBody.verifyToken, 'verifyToken must be returned');
    assert.strictEqual(loginBody.devCode, undefined, 'CRITICAL: devCode must NOT exist in login response');
    assert.strictEqual(loginBody.code, undefined, 'CRITICAL: code must NOT exist in login response');
    console.log('  ✓ Super admin login successfully initiates 2FA with zero code leakage.');

    const verifyToken = loginBody.verifyToken;

    // 7. Verify Database Session Storage & Hash Secrecy
    console.log('\n[TEST 4] Verifying database storage of 2FA session...');
    const [dbSession] = await db
      .select()
      .from(adminVerificationSessions)
      .where(eq(adminVerificationSessions.verifyToken, verifyToken));

    assert.ok(dbSession, 'Session must exist in admin_verification_sessions table');
    assert.strictEqual(dbSession.userId, adminUser.id, 'Session must link to correct admin');
    assert.strictEqual(dbSession.attemptsRemaining, 5, 'Session must initialize with 5 attempts');
    assert.strictEqual(dbSession.resendCount, 0, 'Session must initialize with 0 resends');
    assert(/^[a-f0-9]{64}$/i.test(dbSession.codeHash), 'Database must store SHA-256 hash of code');
    console.log('  ✓ 2FA session is persisted in PostgreSQL with SHA-256 code hash.');

    // 8. Test Safe Demo Simulated Mailbox Inspector
    console.log('\n[TEST 5] Testing Safe Demo Mailbox Inspection (Non-Production Only)...');
    const demoMailRes = await fetch(`${baseUrl}/api/auth/demo-simulated-mail?verifyToken=${verifyToken}`);
    assert.strictEqual(demoMailRes.status, 200, `Expected 200 from demo inspector, got ${demoMailRes.status}`);
    const demoMailBody = await demoMailRes.json();
    assert.strictEqual(demoMailBody.simulated, true);
    assert.strictEqual(demoMailBody.recipient, adminEmail);
    assert.ok(/^\d{6}$/.test(demoMailBody.verificationCode), 'Demo mailbox code must be 6 digits');
    const correctCode = demoMailBody.verificationCode;
    console.log('  ✓ Demo simulated mailbox provides simulated verification code safely.');

    // 9. Test Verification Code Attempt Decrementing & Maximum Attempts Enforcement
    console.log('\n[TEST 6] Testing verification attempt counting & brute-force lock...');
    const badCodeRes1 = await fetch(`${baseUrl}/api/auth/verify-admin-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifyToken, code: '000000' }),
    });
    assert.strictEqual(badCodeRes1.status, 400);
    const badBody1 = await badCodeRes1.json();
    assert(badBody1.error.includes('4 attempt(s) remaining'), `Expected 4 remaining attempts, got: ${badBody1.error}`);

    // Exhaust remaining attempts (attempts 2, 3, 4, 5)
    for (let i = 3; i >= 1; i--) {
      const res = await fetch(`${baseUrl}/api/auth/verify-admin-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verifyToken, code: '000000' }),
      });
      assert.strictEqual(res.status, 400);
    }
    // Attempt 5 (last one) terminates session
    const lastBadRes = await fetch(`${baseUrl}/api/auth/verify-admin-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifyToken, code: '000000' }),
    });
    assert.strictEqual(lastBadRes.status, 400);
    const lastBadBody = await lastBadRes.json();
    assert(lastBadBody.error.includes('Maximum attempts exceeded') || lastBadBody.error.includes('expired or is invalid'), 'Session must be terminated');

    // Verify session was purged from database
    const [purgedSession] = await db
      .select()
      .from(adminVerificationSessions)
      .where(eq(adminVerificationSessions.verifyToken, verifyToken));
    assert.strictEqual(purgedSession, undefined, 'Session must be deleted from DB after attempt exhaustion');
    console.log('  ✓ Verification session strictly deleted upon reaching 0 attempts.');

    // 10. Fresh 2FA Login & Resend Cooldown/Bounds
    console.log('\n[TEST 7] Testing 2FA Resend limits and cooldown...');
    const login2Res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: adminEmail,
        password: adminPass,
        expectedRole: 'super_admin',
      }),
    });
    const { verifyToken: verifyToken2 } = await login2Res.json();

    // Immediate resend should trigger cooldown (30s)
    const immediateResendRes = await fetch(`${baseUrl}/api/auth/resend-admin-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifyToken: verifyToken2 }),
    });
    assert.strictEqual(immediateResendRes.status, 429, `Immediate resend must return 429, got ${immediateResendRes.status}`);
    const cdBody = await immediateResendRes.json();
    assert(cdBody.error.includes('wait'), 'Error must specify cooldown wait');
    console.log('  ✓ 30-second resend cooldown strictly enforced (429).');

    // Simulate cooldown elapsed in DB
    await db
      .update(adminVerificationSessions)
      .set({ lastResendAt: new Date(Date.now() - 35 * 1000) })
      .where(eq(adminVerificationSessions.verifyToken, verifyToken2));

    const validResendRes = await fetch(`${baseUrl}/api/auth/resend-admin-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifyToken: verifyToken2 }),
    });
    assert.strictEqual(validResendRes.status, 200);
    const validResendBody = await validResendRes.json();
    assert.strictEqual(validResendBody.devCode, undefined, 'Resend response must NOT contain devCode');
    console.log('  ✓ Resend succeeds after cooldown without leaking verification code.');

    // 11. Successful Verification & Replay Protection
    console.log('\n[TEST 8] Testing successful 2FA verification & single-use replay protection...');
    // Fetch newly generated code from demo inspector
    const freshCodeRes = await fetch(`${baseUrl}/api/auth/demo-simulated-mail?verifyToken=${verifyToken2}`);
    const { verificationCode: activeCode } = await freshCodeRes.json();

    const verifySuccessRes = await fetch(`${baseUrl}/api/auth/verify-admin-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifyToken: verifyToken2, code: activeCode }),
    });
    assert.strictEqual(verifySuccessRes.status, 200, `Expected 200, got ${verifySuccessRes.status}`);
    const verifySuccessBody = await verifySuccessRes.json();
    assert.ok(verifySuccessBody.token, 'Must return JWT token upon successful verification');
    assert.strictEqual(verifySuccessBody.user.role, 'super_admin');
    const adminToken = verifySuccessBody.token;

    // REPLAY ATTEMPT: Calling verify-admin-code again with the same token MUST FAIL (400)
    const replayRes = await fetch(`${baseUrl}/api/auth/verify-admin-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifyToken: verifyToken2, code: activeCode }),
    });
    assert.strictEqual(replayRes.status, 400, 'Replay of used verification code must be rejected with 400');
    console.log('  ✓ Successful verification completes login and immediately invalidates session (replay blocked).');

    // 12. Authenticated Password Change
    console.log('\n[TEST 9] Testing authenticated password change (POST /api/auth/change-password)...');
    // Without auth -> 401
    const unauthChangeRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: adminPass, newPassword: 'BrandNewAdminPass2026!' }),
    });
    assert.strictEqual(unauthChangeRes.status, 401, 'Unauthenticated password change must return 401');

    // Wrong current password -> 401
    const wrongCurrentRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ currentPassword: 'WrongPassword!', newPassword: 'BrandNewAdminPass2026!' }),
    });
    assert.strictEqual(wrongCurrentRes.status, 401, 'Incorrect current password must return 401');

    // Same password -> 400
    const samePassRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ currentPassword: adminPass, newPassword: adminPass }),
    });
    assert.strictEqual(samePassRes.status, 400, 'Identical new password must return 400');

    // Short new password (< 8 chars) -> 400
    const shortNewPassRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ currentPassword: adminPass, newPassword: 'short' }),
    });
    assert.strictEqual(shortNewPassRes.status, 400, 'Short new password must return 400');

    // Valid change -> 200
    const brandNewPass = 'BrandNewAdminPass2026!';
    const validChangeRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ currentPassword: adminPass, newPassword: brandNewPass }),
    });
    assert.strictEqual(validChangeRes.status, 200, 'Valid password change must return 200');

    // Verify login with old password fails
    const oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: adminEmail, password: adminPass }),
    });
    assert.strictEqual(oldLoginRes.status, 401, 'Old password must fail authentication');

    // Verify login with new password succeeds
    const newLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: adminEmail, password: brandNewPass }),
    });
    assert.strictEqual(newLoginRes.status, 200, 'New password must succeed authentication');
    console.log('  ✓ Authenticated password change successfully validated, hashed, and verified.');

    console.log('\n====================================================');
    console.log('ALL BATCH 1 SECURITY & 2FA TESTS PASSED! ✓');
    console.log('====================================================');
    process.exit(0);
  } finally {
    server.close();
  }
}

runBatch1Tests().catch((err) => {
  console.error('\n❌ BATCH 1 TEST FAILURE:', err);
  process.exit(1);
});
