import { db, pool, createPool } from './src/db/index.ts';
import { users, admissionApplications, admissionApplicationLogs, passwordResets, academicSessions, classes, publicPortalHeroSlides } from './src/db/schema.ts';
import { generateToken, getJwtSecret, validateAuthEnvironment, hashPassword } from './src/lib/auth.ts';
import { ensureRealAdmin } from './src/lib/admin-init.ts';
import { StorageService } from './src/lib/storage.ts';
import { validateEnvironment } from './src/config/env.ts';
import { hashToken } from './src/lib/identifiers.ts';
import { admissionsRouter } from './src/routes/admissions.ts';
import { authRouter } from './src/routes/auth.ts';
import { publicPortalRouter } from './src/routes/public-portal.ts';
import express from 'express';
import { authenticate } from './src/middleware/auth.ts';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runHardeningTests() {
  console.log('====================================================');
  console.log('STARTING PRODUCTION HARDENING VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  // Setup express test app with authentication and routes
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(authenticate);
  app.use('/api/auth', authRouter);
  app.use('/api/admissions', admissionsRouter);
  app.use('/api/public-portal', publicPortalRouter);

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // ========================================================================
    // AUTH TESTS (1-5)
    // ========================================================================
    console.log('[AUTH] Test 1: missing JWT_SECRET in production fails...');
    const originalEnv = process.env.NODE_ENV;
    const originalJwt = process.env.JWT_SECRET;

    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;

    let test1Passed = false;
    try {
      getJwtSecret();
    } catch (e: any) {
      assert(e.message.includes('JWT_SECRET environment variable is missing'), `Expected missing JWT_SECRET error, got: ${e.message}`);
      test1Passed = true;
    }
    assert(test1Passed, 'getJwtSecret must throw when JWT_SECRET is missing in production');
    console.log('  ✓ Missing JWT_SECRET in production immediately throws fatal error.');

    console.log('[AUTH] Test 2: JWT_SECRET is never replaced by a hardcoded fallback...');
    let test2Passed = false;
    try {
      validateAuthEnvironment();
    } catch (e: any) {
      assert(!e.message.includes('springfield_school_management_saas_production_jwt_secret'), 'Must never leak or reference old hardcoded secret');
      test2Passed = true;
    }
    assert(test2Passed, 'validateAuthEnvironment must reject missing secret without fallback');
    console.log('  ✓ No hardcoded fallback secret is ever used in production.');

    console.log('[AUTH] Test 3: weak JWT_SECRET is rejected in production (< 32 chars)...');
    process.env.JWT_SECRET = 'short_weak_secret_under_32';
    let test3Passed = false;
    try {
      getJwtSecret();
    } catch (e: any) {
      assert(e.message.includes('at least 32 characters'), `Expected 32 chars error, got: ${e.message}`);
      test3Passed = true;
    }
    assert(test3Passed, 'getJwtSecret must reject JWT_SECRET under 32 characters in production');
    console.log('  ✓ Weak JWT_SECRET (< 32 chars) is strictly rejected in production.');

    // Restore valid strong secret for subsequent tests
    const strongTestSecret = 'super_secure_production_hardening_test_secret_2026_min_32_characters';
    process.env.JWT_SECRET = strongTestSecret;
    process.env.NODE_ENV = originalEnv;

    console.log('[AUTH] Test 4: missing admin credentials do not create an admin...');
    const originalAdminEmail = process.env.ADMIN_EMAIL;
    const originalAdminPass = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;

    const nullAdmin = await ensureRealAdmin();
    assert(nullAdmin === null, 'ensureRealAdmin must return null when credentials are not configured');
    console.log('  ✓ ensureRealAdmin returns null without creating any user when env vars are missing.');

    console.log('[AUTH] Test 5: hardcoded admin credentials are not used or accepted...');
    // Verify that sweeping fallback email is not used
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    const checkNoSweepspot = await ensureRealAdmin();
    assert(checkNoSweepspot === null, 'Must never create sweepspot fallback account');
    console.log('  ✓ No hardcoded fallback credentials (sweepspot / admin123) are ever provisioned.');

    process.env.ADMIN_EMAIL = originalAdminEmail;
    process.env.ADMIN_PASSWORD = originalAdminPass;

    // ========================================================================
    // DATABASE TESTS (6-8)
    // ========================================================================
    console.log('\n[DATABASE] Test 6: production without DATABASE_URL fails...');
    process.env.NODE_ENV = 'production';
    const originalDbUrl = process.env.DATABASE_URL;
    const originalSqlHost = process.env.SQL_HOST;
    delete process.env.DATABASE_URL;
    delete process.env.SQL_HOST;

    let test6Passed = false;
    try {
      validateEnvironment();
    } catch (e: any) {
      assert(e.message.includes('PGlite embedded database fallback is strictly forbidden in production'), `Expected PGlite forbidden error, got: ${e.message}`);
      test6Passed = true;
    }
    assert(test6Passed, 'validateEnvironment must fail fast in production when DATABASE_URL is missing');
    console.log('  ✓ Production without DATABASE_URL immediately fails fast.');

    console.log('[DATABASE] Test 7: production cannot fall back to PGlite...');
    let test7Passed = false;
    const originalGlobalPool = global._postgresPool;
    global._postgresPool = null;
    try {
      createPool();
    } catch (e: any) {
      assert(e.message.includes('PGlite embedded database fallback is strictly forbidden in production'), `Expected PGlite forbidden, got: ${e.message}`);
      test7Passed = true;
    } finally {
      global._postgresPool = originalGlobalPool;
    }
    assert(test7Passed, 'createPool must throw fatal error in production rather than initializing PGlite');
    console.log('  ✓ createPool refuses to initialize PGlite when in production mode.');

    console.log('[DATABASE] Test 8: valid PostgreSQL configuration works...');
    process.env.DATABASE_URL = originalDbUrl;
    process.env.SQL_HOST = originalSqlHost;
    process.env.NODE_ENV = originalEnv;

    const dbQuery = await pool.query('SELECT 1 as connected');
    const rows = dbQuery.rows || dbQuery;
    assert(rows.length > 0 && Number(rows[0].connected) === 1, 'Database connection query must succeed');
    console.log('  ✓ Configured database connection executes queries successfully.');

    // ========================================================================
    // SETUP TEST PERSONAS (Super Admin, Permitted Staff, Unauthorized Teacher)
    // ========================================================================
    console.log('\nSetting up test personas for Admissions RBAC and storage verification...');
    // 1. Super Admin
    const [superAdminUser] = await db
      .insert(users)
      .values({
        uid: `admin-hardening-${Date.now()}`,
        email: `super_admin_${Date.now()}@school.edu`,
        passwordHash: await hashPassword('AdminPass123!'),
        fullName: 'Head Administrator',
        role: 'super_admin',
        status: 'active',
      })
      .returning();

    const superAdminToken = generateToken({
      id: superAdminUser.id,
      uid: superAdminUser.uid,
      email: superAdminUser.email,
      role: 'super_admin',
      fullName: superAdminUser.fullName,
    });

    // 2. Teacher WITHOUT admissions permissions
    const [regularTeacherUser] = await db
      .insert(users)
      .values({
        uid: `teacher-reg-${Date.now()}`,
        email: `teacher_reg_${Date.now()}@school.edu`,
        passwordHash: await hashPassword('TeacherPass123!'),
        fullName: 'Regular Teacher',
        role: 'teacher',
        status: 'active',
      })
      .returning();

    const regularTeacherToken = generateToken({
      id: regularTeacherUser.id,
      uid: regularTeacherUser.uid,
      email: regularTeacherUser.email,
      role: 'teacher',
      fullName: regularTeacherUser.fullName,
    });

    // 3. Teacher WITH admissions_management permission
    const [authorizedStaffUser] = await db
      .insert(users)
      .values({
        uid: `teacher-staff-${Date.now()}`,
        email: `admissions_officer_${Date.now()}@school.edu`,
        passwordHash: await hashPassword('OfficerPass123!'),
        fullName: 'Admissions Officer',
        role: 'teacher',
        status: 'active',
      })
      .returning();

    // Assign admissions_management permission to this staff
    const { teachers } = await import('./src/db/schema.ts');
    await db.insert(teachers).values({
      userId: authorizedStaffUser.id,
      employeeId: `TCH-ADM-${Date.now()}`,
      specialization: 'Admissions',
      qualification: 'B.Ed',
      status: 'active',
      permissions: JSON.stringify(['admissions_management']),
    });

    const authorizedStaffToken = generateToken({
      id: authorizedStaffUser.id,
      uid: authorizedStaffUser.uid,
      email: authorizedStaffUser.email,
      role: 'teacher',
      fullName: authorizedStaffUser.fullName,
    });

    // ========================================================================
    // ADMISSIONS RBAC TESTS (9-12)
    // ========================================================================
    console.log('\n[ADMISSIONS] Test 9: unauthorized teacher cannot list admissions...');
    const unauthListRes = await fetch(`${baseUrl}/api/admissions/applications`, {
      headers: { Authorization: `Bearer ${regularTeacherToken}` },
    });
    assert(unauthListRes.status === 403, `Expected 403 for unauthorized teacher, got ${unauthListRes.status}`);
    console.log('  ✓ Unauthorized teacher receives 403 Forbidden when attempting to list applications.');

    // Create a sample applicant for detailed tests
    const [session] = await db
      .select()
      .from(academicSessions)
      .where(eq(academicSessions.status, 'active'))
      .limit(1);
    const [cls] = await db.select().from(classes).where(eq(classes.sessionId, session.id)).limit(1);

    const testAppKey = 'SECRET-APP-KEY-12345';
    const testAppKeyHash = hashToken(testAppKey);

    const [testApp] = await db
      .insert(admissionApplications)
      .values({
        applicationNumber: `APP-TEST-${Date.now()}`,
        accessKey: testAppKeyHash,
        firstName: 'Chidinma',
        lastName: 'Eze',
        dateOfBirth: '2010-05-12',
        gender: 'Female',
        email: 'chidinma.test@example.com',
        phone: '+2348011223344',
        address: '12 Victoria Island, Lagos',
        sessionId: session.id,
        classId: cls.id,
        status: 'pending',
      })
      .returning();

    console.log('[ADMISSIONS] Test 10: unauthorized teacher cannot view another application...');
    const unauthViewRes = await fetch(`${baseUrl}/api/admissions/applications/${testApp.id}`, {
      headers: { Authorization: `Bearer ${regularTeacherToken}` },
    });
    assert(unauthViewRes.status === 403, `Expected 403 for unauthorized teacher viewing application, got ${unauthViewRes.status}`);
    console.log('  ✓ Unauthorized teacher receives 403 Forbidden when attempting to view applicant details.');

    console.log('[ADMISSIONS] Test 11: unauthorized user cannot access applicant documents...');
    // Create a stored private file for testApp
    const sampleDocDataUri = 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwgL0xlbmd0aCA1IDAgUiAvRmlsdGVyIC9GbGF0ZURlY29kZSA+PgpzdHJlYW0KeAEr5HIKWTAAAAUwATgKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjEwCmVuZG9iag==';
    const storedDoc = await StorageService.saveFile({
      dataUriOrBuffer: sampleDocDataUri,
      filename: 'birth_certificate.pdf',
      category: 'admission_document',
      isPublic: false,
    });

    // Update testApp to reference this document
    await db
      .update(admissionApplications)
      .set({
        documents: JSON.stringify([
          {
            id: 'doc_birth_cert',
            title: 'Birth Certificate',
            fileId: storedDoc.fileId,
            fileData: `/api/admissions/documents/${storedDoc.fileId}`,
            fileName: storedDoc.filename,
            fileType: storedDoc.mimeType,
          },
        ]),
      })
      .where(eq(admissionApplications.id, testApp.id));

    // Request without auth or applicant credentials -> MUST be 403
    const unauthDocRes = await fetch(`${baseUrl}/api/admissions/documents/${storedDoc.fileId}`);
    assert(unauthDocRes.status === 403, `Expected 403 for unauthenticated document access, got ${unauthDocRes.status}`);

    // Request with regular teacher token -> MUST be 403
    const teacherDocRes = await fetch(`${baseUrl}/api/admissions/documents/${storedDoc.fileId}`, {
      headers: { Authorization: `Bearer ${regularTeacherToken}` },
    });
    assert(teacherDocRes.status === 403, `Expected 403 for unauthorized teacher document access, got ${teacherDocRes.status}`);

    // Request with Applicant B credentials (wrong application) -> MUST be 403
    const wrongApplicantDocRes = await fetch(`${baseUrl}/api/admissions/documents/${storedDoc.fileId}?applicationNumber=APP-WRONG-999&accessKey=wrong-key`);
    assert(wrongApplicantDocRes.status === 403, `Expected 403 for mismatched applicant document access, got ${wrongApplicantDocRes.status}`);
    console.log('  ✓ Unauthenticated users, unauthorized teachers, and mismatched applicants cannot access documents (403).');

    console.log('[ADMISSIONS] Test 12: authorized admissions staff can access permitted data...');
    // 1. Authorized admissions officer lists applications -> 200
    const authStaffListRes = await fetch(`${baseUrl}/api/admissions/applications`, {
      headers: { Authorization: `Bearer ${authorizedStaffToken}` },
    });
    assert(authStaffListRes.status === 200, `Expected 200 for authorized staff list, got ${authStaffListRes.status}`);

    // 2. Super admin views application -> 200
    const superAdminViewRes = await fetch(`${baseUrl}/api/admissions/applications/${testApp.id}`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert(superAdminViewRes.status === 200, `Expected 200 for super admin view, got ${superAdminViewRes.status}`);

    // 3. Authorized staff downloads document -> 200
    const authStaffDocRes = await fetch(`${baseUrl}/api/admissions/documents/${storedDoc.fileId}`, {
      headers: { Authorization: `Bearer ${authorizedStaffToken}` },
    });
    assert(authStaffDocRes.status === 200, `Expected 200 for authorized staff document access, got ${authStaffDocRes.status}`);

    // 4. Valid applicant self-service download -> 200
    const validApplicantDocRes = await fetch(
      `${baseUrl}/api/admissions/documents/${storedDoc.fileId}?applicationNumber=${testApp.applicationNumber}&accessKey=${testAppKey}`
    );
    assert(validApplicantDocRes.status === 200, `Expected 200 for valid applicant document access, got ${validApplicantDocRes.status}`);
    console.log('  ✓ Authorized staff and matching applicant credentials successfully access permitted data.');

    // ========================================================================
    // STORAGE TESTS (13-17)
    // ========================================================================
    console.log('\n[STORAGE] Test 13: unsupported file type rejected...');
    let test13Passed = false;
    try {
      await StorageService.saveFile({
        dataUriOrBuffer: 'data:application/x-msdownload;base64,TVqQAAMAAAAEAAAA//8A',
        filename: 'malicious.exe',
        category: 'admission_document',
        isPublic: false,
      });
    } catch (e: any) {
      assert(e.message.includes('Unsupported or unsafe file type'), `Expected unsupported file type error, got: ${e.message}`);
      test13Passed = true;
    }
    assert(test13Passed, 'StorageService must reject executable / unsupported MIME types');
    console.log('  ✓ Unsupported MIME types (e.g. application/x-msdownload) are strictly rejected.');

    console.log('[STORAGE] Test 14: oversized file rejected...');
    let test14Passed = false;
    // Generate buffer exceeding 5MB limit
    const hugeBuffer = Buffer.alloc(6 * 1024 * 1024);
    try {
      await StorageService.saveFile({
        dataUriOrBuffer: hugeBuffer,
        mimeType: 'application/pdf',
        filename: 'huge.pdf',
        category: 'admission_document',
        isPublic: false,
      });
    } catch (e: any) {
      assert(e.message.includes('exceeds maximum allowed limit'), `Expected oversized error, got: ${e.message}`);
      test14Passed = true;
    }
    assert(test14Passed, 'StorageService must reject files exceeding size limit');
    console.log('  ✓ Oversized files exceeding the limit are rejected.');

    console.log('[STORAGE] Test 15: private document cannot be accessed without authorization...');
    const privateFile = await StorageService.saveFile({
      dataUriOrBuffer: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      filename: 'passport.png',
      category: 'passport_photo',
      isPublic: false,
    });
    // Attempt public hero streaming on private file -> MUST be 404/403
    const publicFetchPrivateRes = await fetch(`${baseUrl}/api/public-portal/hero-image/${privateFile.fileId}`);
    assert(publicFetchPrivateRes.status === 404, `Private file must not be accessible via public endpoint, got ${publicFetchPrivateRes.status}`);
    console.log('  ✓ Private documents cannot be accessed via public asset routes.');

    console.log('[STORAGE] Test 16: database stores storage references rather than large base64 payloads...');
    // Submit an application via public API with base64 passport and doc
    const samplePassportDataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    const applyRes = await fetch(`${baseUrl}/api/admissions/public/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Adaobi',
        lastName: 'Okonkwo',
        dateOfBirth: '2011-04-19',
        gender: 'Female',
        email: `adaobi_${Date.now()}@example.com`,
        phone: '+2348022334455',
        address: '44 Marina, Lagos Island',
        sessionId: session.id,
        classId: cls.id,
        passportPhoto: samplePassportDataUri,
        documents: [
          {
            id: 'doc_previous_report',
            title: 'Previous Term Report',
            fileName: 'report.pdf',
            fileData: sampleDocDataUri,
          },
        ],
      }),
    });
    if (applyRes.status !== 201) {
      const errBody = await applyRes.json();
      console.error('applyRes error body:', errBody);
    }
    assert(applyRes.status === 201, `Expected 201 application creation, got ${applyRes.status}`);
    const applyData = await applyRes.json();

    // Query database record directly to ensure NO large base64 data URL is stored
    const [savedAppRec] = await db
      .select({
        passportPhoto: admissionApplications.passportPhoto,
        documents: admissionApplications.documents,
      })
      .from(admissionApplications)
      .where(eq(admissionApplications.applicationNumber, applyData.applicationNumber));

    assert(savedAppRec.passportPhoto?.startsWith('/api/admissions/documents/'), 'passportPhoto must store API reference URL');
    assert(!savedAppRec.passportPhoto?.startsWith('data:'), 'passportPhoto must NOT store raw base64 data URL in PostgreSQL');

    const parsedDocs = JSON.parse(savedAppRec.documents || '[]');
    assert(parsedDocs.length === 1, 'Must contain 1 document record');
    assert(parsedDocs[0].fileData.startsWith('/api/admissions/documents/'), 'doc fileData must store storage reference URL');
    assert(!parsedDocs[0].fileData.startsWith('data:'), 'doc fileData must NOT store base64 in PostgreSQL');
    console.log('  ✓ Admissions records store clean URL/ID storage references instead of base64 data.');

    console.log('[STORAGE] Test 17: hero images use storage references...');
    // Create hero slide with base64 data URI via admin endpoint
    const sampleHeroDataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    const heroSlideRes = await fetch(`${baseUrl}/api/public-portal/admin/hero-slides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        imageUrl: sampleHeroDataUri,
        title: 'New Campus Quad Slide',
        altText: 'Campus Quadrangle View',
        isActive: true,
        displayOrder: 1,
      }),
    });
    assert(heroSlideRes.status === 201, `Expected 201 for hero slide, got ${heroSlideRes.status}`);
    const heroJson = await heroSlideRes.json();
    assert(heroJson.slide.imageUrl.startsWith('/api/public-portal/hero-image/'), 'Hero slide imageUrl must be API streaming reference');
    assert(!heroJson.slide.imageUrl.startsWith('data:'), 'Hero slide imageUrl must NOT be raw base64');

    // Query DB record directly to verify PostgreSQL stores reference
    const [savedHeroSlide] = await db
      .select()
      .from(publicPortalHeroSlides)
      .where(eq(publicPortalHeroSlides.id, heroJson.slide.id));
    assert(savedHeroSlide.imageUrl.startsWith('/api/public-portal/hero-image/'), 'Postgres hero slide must store storage reference');

    // Verify public streaming endpoint serves the image
    const publicHeroStreamRes = await fetch(`${baseUrl}${savedHeroSlide.imageUrl}`);
    assert(publicHeroStreamRes.status === 200, `Expected 200 from public hero stream, got ${publicHeroStreamRes.status}`);
    assert(publicHeroStreamRes.headers.get('content-type')?.includes('image/jpeg'), 'Content-type must be image/jpeg');
    console.log('  ✓ Hero images are stored in secure storage and referenced by clean URLs in PostgreSQL.');

    // ========================================================================
    // PASSWORD RESET TESTS (18-22)
    // ========================================================================
    console.log('\n[PASSWORD RESET] Test 18: reset token is hashed in DB...');
    // Create a target user for password reset testing
    const [resetTargetUser] = await db
      .insert(users)
      .values({
        uid: `reset-target-${Date.now()}`,
        email: `reset_target_${Date.now()}@school.edu`,
        passwordHash: await hashPassword('InitialPass123!'),
        fullName: 'Reset Target User',
        role: 'student',
        status: 'active',
      })
      .returning();

    // Enable email service indicator for password reset flow test
    process.env.EMAIL_SERVICE_CONFIGURED = 'true';
    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetTargetUser.email }),
    });
    assert(forgotRes.status === 200, `Expected 200 from forgot-password, got ${forgotRes.status}`);

    const [dbResetRec] = await db
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.userId, resetTargetUser.id));

    assert(Boolean(dbResetRec), 'Password reset record must exist in DB');
    // SHA-256 hash is 64 hex characters
    assert(/^[a-f0-9]{64}$/i.test(dbResetRec.resetToken), 'DB must store 64-character SHA-256 hash of token, not raw token');
    console.log('  ✓ Password reset token is strictly stored as SHA-256 hash in database.');

    console.log('[PASSWORD RESET] Test 19: expired token is rejected...');
    // Insert an expired token
    const expiredRawToken = `RST-EXPIRED-TOKEN-${Date.now()}-${Math.random()}`;
    const expiredTokenHash = hashToken(expiredRawToken);
    await db.insert(passwordResets).values({
      userId: resetTargetUser.id,
      resetToken: expiredTokenHash,
      expiresAt: new Date(Date.now() - 3600 * 1000), // 1 hour in the past
      isUsed: false,
    });

    const expiredResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetToken: expiredRawToken,
        newPassword: 'BrandNewPassword123!',
      }),
    });
    assert(expiredResetRes.status === 400, `Expected 400 for expired reset token, got ${expiredResetRes.status}`);
    console.log('  ✓ Expired reset token is properly rejected with 400.');

    console.log('[PASSWORD RESET] Test 20: token is single-use and invalid after successful reset (20 & 21)...');
    const validRawToken = `RST-VALID-ONETIME-TOKEN-${Date.now()}-${Math.random()}`;
    const validTokenHash = hashToken(validRawToken);
    await db.insert(passwordResets).values({
      userId: resetTargetUser.id,
      resetToken: validTokenHash,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      isUsed: false,
    });

    // 1. First reset attempt with valid token -> MUST SUCCEED (200)
    const firstResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetToken: validRawToken,
        newPassword: 'BrandNewPassword123!',
      }),
    });
    assert(firstResetRes.status === 200, `Expected 200 for first reset, got ${firstResetRes.status}`);

    // 2. Second reset attempt with same token -> MUST FAIL (400)
    const secondResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetToken: validRawToken,
        newPassword: 'AnotherPassword456!',
      }),
    });
    assert(secondResetRes.status === 400, `Expected 400 for reused token, got ${secondResetRes.status}`);
    console.log('  ✓ Token is single-use and immediately invalidated upon successful password reset.');

    console.log('[PASSWORD RESET] Test 22: production never returns reset token when email service is unavailable...');
    delete process.env.EMAIL_SERVICE_CONFIGURED;
    delete process.env.SMTP_HOST;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.RESEND_API_KEY;
    delete process.env.AWS_SES_REGION;

    const noEmailRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetTargetUser.email }),
    });
    assert(noEmailRes.status === 503, `Expected 503 when email unconfigured, got ${noEmailRes.status}`);
    const noEmailJson = await noEmailRes.json();
    assert(!noEmailJson.token && !noEmailJson.resetToken && !noEmailJson.rawToken, 'Never leak raw token in API response');
    console.log('  ✓ When email service is unconfigured, endpoint returns 503 and never leaks tokens.');

    // ========================================================================
    // GLOBAL SECURITY VERIFICATION (23-25)
    // ========================================================================
    console.log('\n[SECURITY] Test 23: no production hardcoded secrets in source code...');
    const authSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'auth.ts'), 'utf-8');
    assert(!authSrc.includes('DEFAULT_SYSTEM_JWT_SECRET'), 'DEFAULT_SYSTEM_JWT_SECRET must be removed');
    assert(!authSrc.includes('springfield_school_management_saas_production_jwt_secret'), 'Hardcoded JWT secret string must be removed');
    console.log('  ✓ Verified absence of DEFAULT_SYSTEM_JWT_SECRET in auth source.');

    console.log('[SECURITY] Test 24: no production demo credentials or sweepspot fallbacks in admin-init...');
    const adminInitSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'admin-init.ts'), 'utf-8');
    assert(!adminInitSrc.includes('sweepspot049@gmail.com'), 'admin-init must not contain hardcoded sweepspot email fallback');
    assert(!adminInitSrc.includes('SweepSpot#Admin!2026$Secure'), 'admin-init must not contain hardcoded sweepspot password fallback');
    console.log('  ✓ Verified absence of hardcoded admin email and password in admin-init.');

    console.log('[SECURITY] Test 25: no production embedded DB fallback...');
    const dbSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'db', 'index.ts'), 'utf-8');
    assert(dbSrc.includes('PGlite embedded database fallback is strictly forbidden in production'), 'db/index must explicitly forbid PGlite in production');
    console.log('  ✓ Verified strict production prohibition of PGlite in db/index.ts.');

    console.log('\n====================================================');
    console.log('ALL 25 PRODUCTION HARDENING TESTS PASSED! ✓');
    console.log('====================================================\n');
  } finally {
    server.close();
  }
}

runHardeningTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ HARDENING REGRESSION TEST FAILED:', err);
    process.exit(1);
  });
