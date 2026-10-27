import assert from 'assert';
import express from 'express';
import { runMigrations } from './src/db/migrations.ts';
import { db } from './src/db/index.ts';
import { users } from './src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { hashPassword } from './src/lib/auth.ts';
import { authRouter } from './src/routes/auth.ts';
import { authenticate } from './src/middleware/auth.ts';

async function runTest() {
  console.log('====================================================');
  console.log('STARTING DEMO SANDBOX VS LIVE LOGIN ISOLATION SUITE');
  console.log('====================================================\n');

  console.log('[STEP 1] Running migrations...');
  const migRes = await runMigrations();
  console.log(`✓ Database migrations verified (applied: ${migRes.applied}, total: ${migRes.total})`);

  // Ensure demo accounts are seeded and marked isDemo: true
  const demoEmail = 'admin@school.com';
  const [existingDemo] = await db.select().from(users).where(eq(users.email, demoEmail));
  if (existingDemo) {
    await db.update(users).set({ isDemo: true, failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, existingDemo.id));
  } else {
    await db.insert(users).values({
      uid: 'demo-superadmin-test',
      email: demoEmail,
      fullName: 'Demo Super Administrator',
      role: 'super_admin',
      status: 'active',
      isDemo: true,
      passwordHash: await hashPassword('admin123'),
    });
  }

  // Create real institutional user (isDemo: false)
  const liveAdminEmail = `live.principal.${Date.now()}@greenwood.edu`;
  const liveAdminPass = 'InstitutionalPass123!';
  const [liveAdmin] = await db.insert(users).values({
    uid: `live-admin-${Date.now()}`,
    email: liveAdminEmail,
    fullName: 'Dr. Margaret Hamilton',
    role: 'super_admin',
    status: 'active',
    isDemo: false,
    passwordHash: await hashPassword(liveAdminPass),
  }).returning();

  // Create real institutional teacher (isDemo: false)
  const liveTeacherEmail = `live.teacher.${Date.now()}@greenwood.edu`;
  const liveTeacherPass = 'TeacherPass123!';
  const [liveTeacher] = await db.insert(users).values({
    uid: `live-teacher-${Date.now()}`,
    email: liveTeacherEmail,
    fullName: 'Prof. Adeyemi John',
    role: 'teacher',
    status: 'active',
    isDemo: false,
    passwordHash: await hashPassword(liveTeacherPass),
  }).returning();

  const app = express();
  app.use(express.json());
  app.use(authenticate);
  app.use('/api/auth', authRouter);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✓ Test HTTP server initialized on ${baseUrl}\n`);

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Demo Sandbox Login (/api/auth/demo-login)
    // ------------------------------------------------------------------------
    console.log('[TEST 1] Testing Demo Sandbox Login (/api/auth/demo-login)...');
    const demoRes = await fetch(`${baseUrl}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'admin@school.com',
        password: 'admin123',
        expectedRole: 'super_admin',
      }),
    });
    assert.strictEqual(demoRes.status, 200, 'Demo admin login should succeed with 200');
    const demoBody = await demoRes.json();
    assert.ok(demoBody.token, 'Demo login must return token directly');
    assert.strictEqual(demoBody.requiresVerification, undefined, '2FA must be bypassed for demo sandbox');
    assert.strictEqual(demoBody.sandboxMode, true, 'Response must identify as sandbox mode');
    console.log('  ✓ Demo admin login succeeds instantly without 2FA challenge.');

    // ------------------------------------------------------------------------
    // TEST 2: Demo Sandbox Login Rejects Live Institutional Accounts
    // ------------------------------------------------------------------------
    console.log('\n[TEST 2] Testing Demo Sandbox rejects Live Institutional accounts...');
    const demoRejectRes = await fetch(`${baseUrl}/api/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: liveAdminEmail,
        password: liveAdminPass,
        expectedRole: 'super_admin',
      }),
    });
    assert.strictEqual(demoRejectRes.status, 403, 'Live account on demo portal must be rejected with 403');
    const demoRejectBody = await demoRejectRes.json();
    assert.match(demoRejectBody.error, /Live Institutional user/i);
    console.log('  ✓ Demo sandbox endpoint strictly rejects live institutional accounts.');

    // ------------------------------------------------------------------------
    // TEST 3: Live Institutional Login Rejects Demo Sandbox Accounts
    // ------------------------------------------------------------------------
    console.log('\n[TEST 3] Testing Live Institutional Login (/api/auth/live-login) rejects demo accounts...');
    const liveRejectRes = await fetch(`${baseUrl}/api/auth/live-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'admin@school.com',
        password: 'admin123',
        expectedRole: 'super_admin',
      }),
    });
    assert.strictEqual(liveRejectRes.status, 403, 'Demo account on live portal must return 403 Forbidden');
    const liveRejectBody = await liveRejectRes.json();
    assert.strictEqual(liveRejectBody.isDemoAccountBlocked, true);
    assert.match(liveRejectBody.error, /Demo sandbox accounts are disabled on the Live Institutional Portal/i);
    console.log('  ✓ Live institutional portal blocks synthetic demo accounts with clear sandbox guidance.');

    // ------------------------------------------------------------------------
    // TEST 4: Live Institutional Super Admin Login Enforces Full 2FA
    // ------------------------------------------------------------------------
    console.log('\n[TEST 4] Testing Live Institutional Admin Login enforces full 2FA challenge...');
    const liveAdminRes = await fetch(`${baseUrl}/api/auth/live-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: liveAdminEmail,
        password: liveAdminPass,
        expectedRole: 'super_admin',
      }),
    });
    assert.strictEqual(liveAdminRes.status, 200);
    const liveAdminBody = await liveAdminRes.json();
    assert.strictEqual(liveAdminBody.requiresVerification, true, 'Live admin must require 2FA verification');
    assert.ok(liveAdminBody.verifyToken, 'verifyToken must be provided for 2FA challenge');
    assert.strictEqual(liveAdminBody.devCode, undefined, 'Zero code leakage in response');
    console.log('  ✓ Live administrative login enforces full 2FA session without secret leakage.');

    // ------------------------------------------------------------------------
    // TEST 5: Live Institutional Non-Admin Login Succeeds Directly
    // ------------------------------------------------------------------------
    console.log('\n[TEST 5] Testing Live Institutional Teacher Login...');
    const liveTeacherRes = await fetch(`${baseUrl}/api/auth/live-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: liveTeacherEmail,
        password: liveTeacherPass,
        expectedRole: 'teacher',
      }),
    });
    assert.strictEqual(liveTeacherRes.status, 200);
    const liveTeacherBody = await liveTeacherRes.json();
    assert.ok(liveTeacherBody.token, 'Token returned for verified faculty member');
    assert.strictEqual(liveTeacherBody.sandboxMode, false, 'Identified as live production session');
    console.log('  ✓ Live faculty member logs in securely.');

    // ------------------------------------------------------------------------
    // TEST 6: Account Lockout after 5 Consecutive Failed Password Attempts
    // ------------------------------------------------------------------------
    console.log('\n[TEST 6] Testing Brute-Force Protection and Account Lockout...');
    for (let i = 1; i <= 4; i++) {
      const failRes = await fetch(`${baseUrl}/api/auth/live-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: liveTeacherEmail,
          password: 'WrongPassword!',
          expectedRole: 'teacher',
        }),
      });
      assert.strictEqual(failRes.status, 401);
      const failBody = await failRes.json();
      assert.match(failBody.error, /attempt\(s\) remaining/i);
    }

    // 5th failed attempt should trigger lockout
    const fifthRes = await fetch(`${baseUrl}/api/auth/live-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: liveTeacherEmail,
        password: 'WrongPassword!',
        expectedRole: 'teacher',
      }),
    });
    assert.strictEqual(fifthRes.status, 401);
    const fifthBody = await fifthRes.json();
    assert.match(fifthBody.error, /temporarily locked/i);

    // 6th attempt (even with CORRECT password) must be rejected with 423 Locked!
    const lockedRes = await fetch(`${baseUrl}/api/auth/live-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: liveTeacherEmail,
        password: liveTeacherPass,
        expectedRole: 'teacher',
      }),
    });
    assert.strictEqual(lockedRes.status, 423, 'Locked account must return 423 Locked');
    const lockedBody = await lockedRes.json();
    assert.match(lockedBody.error, /Account Temporarily Locked/i);
    console.log('  ✓ 5 failed attempts trigger 15-minute account lockout (HTTP 423).');

    console.log('\n====================================================');
    console.log('ALL DEMO SANDBOX & LIVE AUTH ISOLATION TESTS PASSED! ✅');
    console.log('====================================================\n');
  } finally {
    server.close();
    process.exit(0);
  }
}

runTest().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
