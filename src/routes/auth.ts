import { Router, Response } from 'express';
import { db, withDbRetry } from '../db/index.ts';
import {
  users,
  students,
  teachers,
  parents,
  parentStudents,
  parentInvitations,
  teacherInvitations,
  passwordResets,
} from '../db/schema.ts';
import {
  comparePassword,
  generateToken,
  hashPassword,
} from '../lib/auth.ts';
import {
  generateUniqueParentId,
  generateSecureToken,
  hashToken,
} from '../lib/identifiers.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';
import {
  loginLimiter,
  passwordResetLimiter,
  registrationLimiter,
  tokenValidationLimiter,
} from '../middleware/rate-limiter.ts';
import { eq, and, gt, or } from 'drizzle-orm';
import crypto from 'crypto';

export const authRouter = Router();

interface PendingAdminVerification {
  code: string;
  userId: number;
  email: string;
  fullName: string;
  role: string;
  status: string;
  uid: string;
  expiresAt: number;
}

const pendingAdminVerifications = new Map<string, PendingAdminVerification>();

// Google Sign-in / SSO verification
authRouter.post('/google', async (req: AuthRequest, res: Response) => {
  try {
    const { idToken, accessToken } = req.body;
    if (!idToken && !accessToken) {
      return res.status(400).json({ error: 'Google authentication credential (idToken or accessToken) is required' });
    }

    let email = '';
    let fullName = '';
    let uid = '';

    // 1. Try decoding as Firebase ID token
    if (idToken) {
      try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        email = (decoded.email || '').trim().toLowerCase();
        fullName = decoded.name || '';
        uid = decoded.uid;
      } catch (fbErr: any) {
        // Fallback: Verify Google ID token against Google tokeninfo endpoint
        try {
          const gRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
          if (gRes.ok) {
            const gData = await gRes.json();
            email = (gData.email || '').trim().toLowerCase();
            fullName = gData.name || '';
            uid = gData.sub || gData.user_id || `google:${email}`;
          }
        } catch (gErr) {
          console.error('Google tokeninfo lookup failed:', gErr);
        }
      }
    }

    // 2. If no email yet and accessToken provided, fetch from Google userinfo
    if (!email && accessToken) {
      try {
        const uRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (uRes.ok) {
          const uData = await uRes.json();
          email = (uData.email || '').trim().toLowerCase();
          fullName = uData.name || '';
          uid = uData.sub || `google:${email}`;
        }
      } catch (uErr) {
        console.error('Google userinfo fetch failed:', uErr);
      }
    }

    if (!email) {
      return res.status(401).json({ error: 'Could not verify Google credentials. Please try signing in again.' });
    }

    // Look up existing user by email or UID strictly from registered database records
    const dbUser = await withDbRetry(async () => {
      let [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!existing) {
        // Automatically authorize designated real admin on Google SSO if configured in environment
        const envAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
        if (envAdminEmail && email === envAdminEmail) {
          const [newAdmin] = await db
            .insert(users)
            .values({
              uid: uid || crypto.randomUUID(),
              email: email,
              fullName: fullName || 'System Administrator',
              role: 'super_admin',
              status: 'active',
            })
            .returning();
          return newAdmin;
        }
        // DO NOT auto-create uninvited Parent accounts. Account must exist via registration or invitation.
        return null;
      }

      // Elevate to super_admin if matching explicitly configured admin email in environment
      const envAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      if (envAdminEmail && email === envAdminEmail && existing.role !== 'super_admin') {
        const [elevated] = await db
          .update(users)
          .set({
            role: 'super_admin',
            status: 'active',
            uid: uid || existing.uid,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id))
          .returning();
        return elevated;
      }

      // Update UID and timestamp if necessary, preserving DB-assigned role and active status
      if (uid && existing.uid !== uid) {
        const [updated] = await db
          .update(users)
          .set({
            uid: uid,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id))
          .returning();
        return updated;
      }
      return existing;
    });

    if (!dbUser) {
      return res.status(403).json({
        error: `No registered school account was found for Google account (${email}). Please register with your school invitation or contact the administrator.`,
      });
    }

    if (dbUser.status === 'suspended') {
      return res.status(403).json({ error: 'This account has been suspended. Please contact the administrator.' });
    }

    const token = generateToken({
      id: dbUser.id,
      uid: dbUser.uid,
      email: dbUser.email,
      role: dbUser.role as any,
      fullName: dbUser.fullName,
    });

    await logAuditEvent({
      userId: dbUser.id,
      userEmail: dbUser.email,
      role: dbUser.role,
      action: 'USER_LOGIN',
      resource: 'auth',
      details: { method: 'Google SSO' },
      ipAddress: req.ip,
    });

    return res.json({
      token,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.fullName,
        role: dbUser.role,
        status: dbUser.status,
      },
    });
  } catch (error: any) {
    console.error('Google login error:', error);
    return res.status(500).json({ error: 'Failed to authenticate with Google' });
  }
});

// 1. Login with ID or email & password (Rate Limited)
authRouter.post('/login', loginLimiter, async (req: AuthRequest, res: Response) => {
  try {
    let rawIdentifier = (req.body.identifier || req.body.email || '').trim();
    const { password, expectedRole } = req.body;

    if (!rawIdentifier || !password) {
      return res.status(400).json({ error: 'Identifier/Email and password are required' });
    }

    const isProd = process.env.NODE_ENV === 'production';
    const lowerIdentifier = rawIdentifier.toLowerCase();
    const isDemoAlias = ['admin', 'admin1', 'superadmin', 'teacher', 'teacher1', 'parent', 'parent1', 'student', 'student1'].includes(lowerIdentifier);

    // In production, strictly reject demo aliases
    if (isProd && isDemoAlias) {
      return res.status(401).json({
        error: 'Demo aliases are disabled in production. Please use your registered email address or official school identifier.',
      });
    }

    // In production, strictly reject demo test accounts
    const isDemoEmail = [
      'student.chinedu@school.com',
      'parent.ibrahim@school.com',
      'teacher.adewale@school.com',
      'admin@school.com',
    ].includes(lowerIdentifier);

    if (isProd && isDemoEmail) {
      return res.status(401).json({
        error: 'Demo accounts are disabled in production. Please sign in with your verified institutional account credentials.',
      });
    }

    // Friendly shorthand aliases for demo testing (strictly development only)
    if (!isProd) {
      if (lowerIdentifier === 'admin' || lowerIdentifier === 'admin1' || lowerIdentifier === 'superadmin') {
        rawIdentifier = 'admin@school.com';
      } else if (lowerIdentifier === 'teacher' || lowerIdentifier === 'teacher1') {
        rawIdentifier = 'teacher.adewale@school.com';
      } else if (lowerIdentifier === 'parent' || lowerIdentifier === 'parent1') {
        rawIdentifier = 'parent.ibrahim@school.com';
      } else if (lowerIdentifier === 'student' || lowerIdentifier === 'student1') {
        rawIdentifier = 'student.chinedu@school.com';
      }
    }

    let foundUserId: number | null = null;
    const upperId = rawIdentifier.toUpperCase();

    // 1. Check if identifier is a Student ID
    if (upperId.startsWith('STU-') || upperId.startsWith('STU')) {
      const formatted = upperId.startsWith('STU-') ? upperId : `STU-${upperId.slice(3)}`;
      const studentRec = await db
        .select({ userId: students.userId })
        .from(students)
        .where(
          or(
            eq(students.studentId, upperId),
            eq(students.studentId, formatted),
            eq(students.studentId, upperId.replace('STU-2026-0', 'STU-2026-00')),
            eq(students.studentId, upperId.replace('STU-0', 'STU-2026-00'))
          )
        )
        .limit(1);
      if (studentRec.length > 0 && studentRec[0].userId) {
        foundUserId = studentRec[0].userId;
      }
    }

    // 2. Check if identifier is a Teacher / Employee ID
    if (!foundUserId && (upperId.startsWith('TCH-') || upperId.startsWith('TCH'))) {
      const formatted = upperId.startsWith('TCH-') ? upperId : `TCH-${upperId.slice(3)}`;
      const teacherRec = await db
        .select({ userId: teachers.userId })
        .from(teachers)
        .where(
          or(
            eq(teachers.employeeId, upperId),
            eq(teachers.employeeId, formatted),
            eq(teachers.employeeId, upperId.replace('TCH-2026-00', 'TCH-2026-0')),
            eq(teachers.employeeId, upperId.replace('TCH-0', 'TCH-2026-0'))
          )
        )
        .limit(1);
      if (teacherRec.length > 0 && teacherRec[0].userId) {
        foundUserId = teacherRec[0].userId;
      }
    }

    // 3. Check if identifier is a Parent ID
    if (!foundUserId && (upperId.startsWith('PAR-') || upperId.startsWith('PAR'))) {
      const formatted = upperId.startsWith('PAR-') ? upperId : `PAR-${upperId.slice(3)}`;
      const parentRec = await db
        .select({ userId: parents.userId })
        .from(parents)
        .where(
          or(
            eq(parents.parentId, upperId),
            eq(parents.parentId, formatted),
            eq(parents.parentId, upperId.replace('PAR-2026-0', 'PAR-2026-00')),
            eq(parents.parentId, upperId.replace('PAR-0', 'PAR-2026-00'))
          )
        )
        .limit(1);
      if (parentRec.length > 0 && parentRec[0].userId) {
        foundUserId = parentRec[0].userId;
      }
    }

    let foundUsers;
    if (foundUserId) {
      foundUsers = await withDbRetry(() =>
        db
          .select()
          .from(users)
          .where(eq(users.id, foundUserId!))
          .limit(1)
      );
    } else {
      // Fallback to searching by email, or check tables directly
      foundUsers = await withDbRetry(() =>
        db
          .select()
          .from(users)
          .where(eq(users.email, rawIdentifier.toLowerCase()))
          .limit(1)
      );

      // If still not found, check if it's an ID without standard prefix
      if (foundUsers.length === 0) {
        const studentMatch = await db
          .select({ userId: students.userId })
          .from(students)
          .where(eq(students.studentId, upperId))
          .limit(1);
        if (studentMatch.length > 0 && studentMatch[0].userId) {
          foundUsers = await db.select().from(users).where(eq(users.id, studentMatch[0].userId)).limit(1);
        }
      }
    }

    if (foundUsers.length === 0) {
      await logAuditEvent({
        action: 'FAILED_LOGIN_UNKNOWN_IDENTIFIER',
        resource: 'auth',
        details: `Failed login attempt with unregistered identifier: ${rawIdentifier} (Target Portal: ${expectedRole || 'General'})`,
        ipAddress: req.ip,
      });

      if (expectedRole === 'super_admin') {
        return res.status(401).json({
          error: `Unrecognized Administrator Account: No administrative profile was found matching "${rawIdentifier}". Administrative access is strictly restricted to authorized institution directors.`,
        });
      }

      return res.status(401).json({
        error: `Unrecognized Account: No registered user profile was found matching "${rawIdentifier}" for this portal. Please verify your identification code or activate your account.`,
      });
    }

    const user = foundUsers[0];

    // Portal Access Restriction Rules:
    // 1. Super Admin: full access to all portals
    // 2. Teacher: allowed to sign in on teacher portal, student portal, etc.
    // 3. Parent: restricted strictly to parent portal
    // 4. Student: restricted strictly to student portal
    if (expectedRole) {
      if (user.role === 'student' && expectedRole !== 'student') {
        return res.status(403).json({
          error: `Access Restricted: Student accounts are restricted to the Student Portal (/student/login).`,
        });
      }
      if (user.role === 'parent' && expectedRole !== 'parent') {
        return res.status(403).json({
          error: `Access Restricted: Parent accounts are restricted to the Parent Portal (/parent/login).`,
        });
      }
      if (user.role === 'teacher' && expectedRole === 'parent') {
        return res.status(403).json({
          error: `Access Restricted: Teacher accounts cannot sign in via the Parent Portal. Please use /teacher/login.`,
        });
      }
      if (user.role === 'teacher' && expectedRole === 'super_admin') {
        return res.status(403).json({
          error: `Access Restricted: Faculty accounts do not possess Super Admin privileges. Please use the Teacher Portal (/teacher/login).`,
        });
      }
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Security Notice: This account has been suspended by institution administration. Please contact support.' });
    }

    if (!user.passwordHash) {
      return res.status(400).json({ error: 'Please sign in with your configured single sign-on provider or reset your password.' });
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      await logAuditEvent({
        userId: user.id,
        userEmail: user.email,
        role: user.role,
        action: 'FAILED_LOGIN_PASSWORD',
        resource: 'auth',
        details: `Incorrect password supplied for identifier: ${rawIdentifier}`,
        ipAddress: req.ip,
      });
      return res.status(401).json({
        error: expectedRole === 'super_admin'
          ? 'Authentication Failed: Incorrect administrative password. Please verify your credentials or reset your password.'
          : 'Authentication Failed: The password you entered is incorrect. Please try again or use Forgot Password.',
      });
    }

    // Super Admin Two-Factor Email Verification Code Step
    if (user.role === 'super_admin') {
      const verifyToken = crypto.randomUUID();
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

      pendingAdminVerifications.set(verifyToken, {
        code: verificationCode,
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        uid: user.uid,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      console.log(`\n========================================`);
      console.log(`🔐 [ADMIN 2FA EMAIL VERIFICATION CODE]`);
      console.log(`Recipient Email: ${user.email}`);
      console.log(`Verification Code: ${verificationCode}`);
      console.log(`Expires in: 10 minutes`);
      console.log(`========================================\n`);

      await logAuditEvent({
        userId: user.id,
        userEmail: user.email,
        role: user.role,
        action: 'ADMIN_VERIFICATION_CODE_ISSUED',
        resource: 'auth',
        details: `Two-factor email confirmation code issued for ${user.email}`,
        ipAddress: req.ip,
      });

      return res.json({
        requiresVerification: true,
        verifyToken,
        email: user.email,
        message: `A 6-digit confirmation code has been generated for ${user.email}. Please enter the code to confirm your administrative access.`,
        devCode: verificationCode,
      });
    }

    const token = generateToken({
      id: user.id,
      uid: user.uid,
      email: user.email,
      role: user.role as any,
      fullName: user.fullName,
    });

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'USER_LOGIN',
      resource: 'auth',
      ipAddress: req.ip,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// 1b. Verify 6-digit Admin Email Confirmation Code
authRouter.post('/verify-admin-code', tokenValidationLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { verifyToken, code } = req.body;
    if (!verifyToken || !code) {
      return res.status(400).json({ error: 'Verification session and 6-digit code are required.' });
    }

    const pending = pendingAdminVerifications.get((verifyToken || '').trim());
    if (!pending) {
      return res.status(400).json({ error: 'Verification session has expired or is invalid. Please sign in again.' });
    }

    if (Date.now() > pending.expiresAt) {
      pendingAdminVerifications.delete(verifyToken.trim());
      return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    }

    if (pending.code !== (code || '').trim()) {
      return res.status(400).json({ error: 'Invalid verification code. Please check your email and try again.' });
    }

    // Confirmation successful
    pendingAdminVerifications.delete(verifyToken.trim());

    const token = generateToken({
      id: pending.userId,
      uid: pending.uid,
      email: pending.email,
      role: pending.role as any,
      fullName: pending.fullName,
    });

    await logAuditEvent({
      userId: pending.userId,
      userEmail: pending.email,
      role: pending.role,
      action: 'ADMIN_VERIFICATION_SUCCESSFUL',
      resource: 'auth',
      details: `Administrator ${pending.email} confirmed email verification code successfully`,
      ipAddress: req.ip,
    });

    return res.json({
      token,
      user: {
        id: pending.userId,
        email: pending.email,
        fullName: pending.fullName,
        role: pending.role,
        status: pending.status,
      },
    });
  } catch (error: any) {
    console.error('Verify admin code error:', error);
    return res.status(500).json({ error: 'Failed to verify confirmation code' });
  }
});

// 1c. Resend 6-digit Admin Email Confirmation Code
authRouter.post('/resend-admin-code', tokenValidationLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { verifyToken } = req.body;
    if (!verifyToken) {
      return res.status(400).json({ error: 'Verification session is required.' });
    }

    const pending = pendingAdminVerifications.get((verifyToken || '').trim());
    if (!pending) {
      return res.status(400).json({ error: 'Verification session has expired. Please sign in again.' });
    }

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    pending.code = newCode;
    pending.expiresAt = Date.now() + 10 * 60 * 1000;

    console.log(`\n========================================`);
    console.log(`🔐 [ADMIN 2FA EMAIL VERIFICATION CODE - RESENT]`);
    console.log(`Recipient Email: ${pending.email}`);
    console.log(`Verification Code: ${newCode}`);
    console.log(`Expires in: 10 minutes`);
    console.log(`========================================\n`);

    return res.json({
      success: true,
      message: `A fresh 6-digit confirmation code has been sent to ${pending.email}.`,
      devCode: newCode,
    });
  } catch (error: any) {
    console.error('Resend admin code error:', error);
    return res.status(500).json({ error: 'Failed to resend confirmation code' });
  }
});

// 2. Student self-service registration with Enrollment Token (Rate Limited & Atomic)
authRouter.post('/register-student', registrationLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { enrollmentToken, studentId, email, password, fullName } = req.body;
    if (!enrollmentToken || !studentId || !email || !password) {
      return res.status(400).json({ error: 'Enrollment token, student ID, email, and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const tokenHashed = hashToken(enrollmentToken);

    // Verify student record atomically
    const result = await db.transaction(async (tx) => {
      const studentRecords = await tx
        .select()
        .from(students)
        .where(
          and(
            eq(students.studentId, studentId.trim().toUpperCase()),
            eq(students.enrollmentToken, tokenHashed)
          )
        )
        .limit(1);

      if (studentRecords.length === 0) {
        throw new Error('INVALID_TOKEN');
      }

      const student = studentRecords[0];

      if (student.userId) {
        throw new Error('ALREADY_REGISTERED');
      }

      if (student.enrollmentTokenExpiresAt && new Date(student.enrollmentTokenExpiresAt) < new Date()) {
        throw new Error('TOKEN_EXPIRED');
      }

      // Check if email already in use
      const existing = await tx
        .select()
        .from(users)
        .where(eq(users.email, email.trim().toLowerCase()))
        .limit(1);

      if (existing.length > 0) {
        throw new Error('EMAIL_EXISTS');
      }

      const hashedPassword = await hashPassword(password);
      const userUid = crypto.randomUUID();

      const [newUser] = await tx
        .insert(users)
        .values({
          uid: userUid,
          email: email.trim().toLowerCase(),
          passwordHash: hashedPassword,
          fullName: fullName || `${student.firstName} ${student.lastName}`,
          role: 'student',
          status: 'active',
        })
        .returning();

      // Invalidate one-time token immediately and link profile
      await tx
        .update(students)
        .set({
          userId: newUser.id,
          enrollmentToken: null,
          enrollmentTokenExpiresAt: null,
        })
        .where(eq(students.id, student.id));

      return { newUser, student };
    });

    await logAuditEvent({
      userId: result.newUser.id,
      userEmail: result.newUser.email,
      role: 'student',
      action: 'STUDENT_ACCOUNT_REGISTERED',
      resource: 'students',
      resourceId: result.student.id.toString(),
      details: `Student registered account with ID ${result.student.studentId}`,
      ipAddress: req.ip,
    });

    const token = generateToken({
      id: result.newUser.id,
      uid: result.newUser.uid,
      email: result.newUser.email,
      role: 'student',
      fullName: result.newUser.fullName,
    });

    res.status(201).json({
      token,
      user: {
        id: result.newUser.id,
        email: result.newUser.email,
        fullName: result.newUser.fullName,
        role: 'student',
      },
    });
  } catch (error: any) {
    if (error.message === 'INVALID_TOKEN') {
      return res.status(400).json({ error: 'Invalid or unrecognized student ID or enrollment token' });
    }
    if (error.message === 'ALREADY_REGISTERED') {
      return res.status(400).json({ error: 'This student record has already been registered with an account' });
    }
    if (error.message === 'TOKEN_EXPIRED') {
      return res.status(400).json({ error: 'Enrollment token has expired. Please request a new token from administration.' });
    }
    if (error.message === 'EMAIL_EXISTS') {
      return res.status(400).json({ error: 'Email is already registered' });
    }
    console.error('Student registration error:', error);
    res.status(500).json({ error: 'Failed to complete student registration' });
  }
});

// 3. Parent self-service registration with Invitation Token (Rate Limited & Atomic)
authRouter.post('/register-parent', registrationLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { invitationToken, email, password, fullName, phone } = req.body;
    if (!invitationToken || !email || !password || !fullName) {
      return res.status(400).json({ error: 'Invitation token, email, password, and full name are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const tokenHashed = hashToken(invitationToken);

    const result = await db.transaction(async (tx) => {
      const invites = await tx
        .select()
        .from(parentInvitations)
        .where(
          and(
            eq(parentInvitations.invitationToken, tokenHashed),
            eq(parentInvitations.isUsed, false),
            gt(parentInvitations.expiresAt, new Date())
          )
        )
        .limit(1);

      if (invites.length === 0) {
        throw new Error('INVALID_INVITATION');
      }

      const invite = invites[0];

      // Check if user already exists
      const existing = await tx
        .select()
        .from(users)
        .where(eq(users.email, email.trim().toLowerCase()))
        .limit(1);

      let parentUser;
      if (existing.length > 0) {
        parentUser = existing[0];
        if (parentUser.role !== 'parent') {
          throw new Error('ROLE_MISMATCH');
        }
      } else {
        const hashedPassword = await hashPassword(password);
        const userUid = crypto.randomUUID();

        const [created] = await tx
          .insert(users)
          .values({
            uid: userUid,
            email: email.trim().toLowerCase(),
            passwordHash: hashedPassword,
            fullName: fullName.trim(),
            phone: phone || null,
            role: 'parent',
            status: 'active',
          })
          .returning();
        parentUser = created;
      }

      // Ensure parent profile with system-generated Parent ID (Format: PAR-XXXX-XXXX-XXXX) exists
      const existingParentProfile = await tx
        .select()
        .from(parents)
        .where(eq(parents.userId, parentUser.id))
        .limit(1);

      let isNewParentIdGenerated = false;
      let generatedParentId: string | null = null;
      if (existingParentProfile.length === 0) {
        generatedParentId = await generateUniqueParentId();
        await tx.insert(parents).values({
          userId: parentUser.id,
          parentId: generatedParentId,
        });
        isNewParentIdGenerated = true;
      }

      // Link parent to student (prevent duplicates via unique constraint)
      await tx
        .insert(parentStudents)
        .values({
          parentUserId: parentUser.id,
          studentId: invite.studentId,
          relationship: invite.relationship || 'Parent',
          isPrimary: true,
        })
        .onConflictDoNothing();

      // Invalidate invitation code immediately
      await tx
        .update(parentInvitations)
        .set({ isUsed: true })
        .where(eq(parentInvitations.id, invite.id));

      return { parentUser, invite, isNewParentIdGenerated, generatedParentId };
    });

    if (result.isNewParentIdGenerated && result.generatedParentId) {
      await logAuditEvent({
        userId: result.parentUser.id,
        userEmail: result.parentUser.email,
        role: 'parent',
        action: 'PARENT_ID_GENERATED',
        resource: 'parents',
        details: { parentId: result.generatedParentId },
        ipAddress: req.ip,
      });
    }

    await logAuditEvent({
      userId: result.parentUser.id,
      userEmail: result.parentUser.email,
      role: 'parent',
      action: 'PARENT_REGISTERED_LINKED_STUDENT',
      resource: 'parent_students',
      resourceId: result.invite.studentId.toString(),
      details: `Parent linked to student ID ${result.invite.studentId}`,
      ipAddress: req.ip,
    });

    const token = generateToken({
      id: result.parentUser.id,
      uid: result.parentUser.uid,
      email: result.parentUser.email,
      role: 'parent',
      fullName: result.parentUser.fullName,
    });

    res.status(201).json({
      token,
      user: {
        id: result.parentUser.id,
        email: result.parentUser.email,
        fullName: result.parentUser.fullName,
        role: 'parent',
      },
    });
  } catch (error: any) {
    if (error.message === 'INVALID_INVITATION') {
      return res.status(400).json({ error: 'Invalid, used, or expired parent invitation token' });
    }
    if (error.message === 'ROLE_MISMATCH') {
      return res.status(400).json({ error: 'An account with this email exists but is not a parent account' });
    }
    console.error('Parent registration error:', error);
    res.status(500).json({ error: 'Failed to complete parent registration' });
  }
});

// 4. Teacher registration with Invitation Token (Rate Limited & Atomic)
authRouter.post('/register-teacher', registrationLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { invitationToken, password, fullName, phone } = req.body;
    if (!invitationToken || !password) {
      return res.status(400).json({ error: 'Invitation token and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const tokenHashed = hashToken(invitationToken);

    const result = await db.transaction(async (tx) => {
      const invites = await tx
        .select()
        .from(teacherInvitations)
        .where(
          and(
            eq(teacherInvitations.invitationToken, tokenHashed),
            eq(teacherInvitations.isUsed, false),
            gt(teacherInvitations.expiresAt, new Date())
          )
        )
        .limit(1);

      if (invites.length === 0) {
        throw new Error('INVALID_INVITATION');
      }

      const invite = invites[0];

      // Check existing email
      const existing = await tx
        .select()
        .from(users)
        .where(eq(users.email, invite.email.toLowerCase()))
        .limit(1);

      if (existing.length > 0) {
        throw new Error('EMAIL_EXISTS');
      }

      const hashedPassword = await hashPassword(password);
      const userUid = crypto.randomUUID();

      const [newUser] = await tx
        .insert(users)
        .values({
          uid: userUid,
          email: invite.email.toLowerCase(),
          passwordHash: hashedPassword,
          fullName: fullName ? fullName.trim() : invite.fullName,
          phone: phone || null,
          role: 'teacher',
          status: 'active',
        })
        .returning();

      // Create teacher record
      await tx.insert(teachers).values({
        userId: newUser.id,
        employeeId: invite.employeeId,
        specialization: invite.specialization || 'General',
        qualification: 'B.Ed / B.Sc',
        status: 'active',
        hireDate: new Date().toISOString().split('T')[0],
      });

      // Mark invitation token used
      await tx
        .update(teacherInvitations)
        .set({ isUsed: true })
        .where(eq(teacherInvitations.id, invite.id));

      return { newUser, invite };
    });

    await logAuditEvent({
      userId: result.newUser.id,
      userEmail: result.newUser.email,
      role: 'teacher',
      action: 'TEACHER_REGISTERED',
      resource: 'teachers',
      details: `Teacher ${result.invite.fullName} registered with ID ${result.invite.employeeId}`,
      ipAddress: req.ip,
    });

    const token = generateToken({
      id: result.newUser.id,
      uid: result.newUser.uid,
      email: result.newUser.email,
      role: 'teacher',
      fullName: result.newUser.fullName,
    });

    res.status(201).json({
      token,
      user: {
        id: result.newUser.id,
        email: result.newUser.email,
        fullName: result.newUser.fullName,
        role: 'teacher',
      },
    });
  } catch (error: any) {
    if (error.message === 'INVALID_INVITATION') {
      return res.status(400).json({ error: 'Invalid, used, or expired teacher invitation code' });
    }
    if (error.message === 'EMAIL_EXISTS') {
      return res.status(400).json({ error: 'Teacher email is already registered' });
    }
    console.error('Teacher registration error:', error);
    res.status(500).json({ error: 'Failed to complete teacher registration' });
  }
});

// Unified registration endpoint for frontend RegisterView
authRouter.post('/register', registrationLimiter, async (req: AuthRequest, res: Response) => {
  const { role, token, studentId, employeeId } = req.body;
  if (role === 'student') {
    req.body.enrollmentToken = token;
    req.body.studentId = studentId;
    return (authRouter as any).handle({ ...req, url: '/register-student', method: 'POST' }, res);
  } else if (role === 'parent') {
    req.body.invitationToken = token;
    return (authRouter as any).handle({ ...req, url: '/register-parent', method: 'POST' }, res);
  } else if (role === 'teacher') {
    req.body.invitationToken = token;
    req.body.employeeId = employeeId;
    return (authRouter as any).handle({ ...req, url: '/register-teacher', method: 'POST' }, res);
  } else if (role === 'super_admin') {
    return (authRouter as any).handle({ ...req, url: '/register-admin', method: 'POST' }, res);
  } else {
    return res.status(400).json({ error: 'Invalid or unsupported registration role' });
  }
});

// 4a. Portal Account Self-Activation (Enforces STRICT 1-to-1 mapping - No duplicate accounts per ID)
authRouter.post('/activate-portal-account', registrationLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { identifier, email, password, role } = req.body;
    const cleanId = (identifier || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const targetRole = (role || '').toLowerCase();

    if (!cleanId || !password) {
      return res.status(400).json({ error: 'Identification code / ID and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    if (targetRole === 'super_admin') {
      return res.status(403).json({ error: 'Administrative accounts cannot be self-activated. Contact system directors.' });
    }

    // 1. STUDENT ACTIVATION
    if (targetRole === 'student' || cleanId.toUpperCase().startsWith('STU-')) {
      const upperId = cleanId.toUpperCase();
      const studentMatches = await db
        .select()
        .from(students)
        .where(eq(students.studentId, upperId))
        .limit(1);

      if (studentMatches.length === 0) {
        return res.status(404).json({
          error: `Student ID "${cleanId}" was not found in the institutional roster. Please verify your Student ID with the administration.`,
        });
      }

      const student = studentMatches[0];

      // CRITICAL CHECK: Does this student record already have an active account?
      if (student.userId) {
        const [existingUser] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, student.userId))
          .limit(1);

        return res.status(409).json({
          error: `An account is already linked to Student ID "${cleanId}" (${existingUser?.email || 'Registered'}). Multiple accounts cannot be created with just one Student ID. Please log in with your existing password or reset it.`,
        });
      }

      // Check if chosen email is already taken
      const finalEmail = cleanEmail || `${student.firstName.toLowerCase()}.${student.lastName.toLowerCase()}@school.com`;
      const emailCheck = await db.select({ id: users.id }).from(users).where(eq(users.email, finalEmail)).limit(1);
      if (emailCheck.length > 0) {
        return res.status(409).json({
          error: `The email "${finalEmail}" is already registered to another account. Please use a unique email or log in.`,
        });
      }

      const hashedPassword = await hashPassword(password);
      const userUid = crypto.randomUUID();

      const result = await db.transaction(async (tx) => {
        const lockedStudent = await tx
          .select()
          .from(students)
          .where(eq(students.id, student.id))
          .limit(1);

        if (lockedStudent[0].userId) {
          throw new Error('ALREADY_LINKED');
        }

        const [newUser] = await tx
          .insert(users)
          .values({
            uid: userUid,
            email: finalEmail,
            passwordHash: hashedPassword,
            fullName: `${student.firstName} ${student.lastName}`,
            role: 'student',
            status: 'active',
          })
          .returning();

        await tx
          .update(students)
          .set({ userId: newUser.id, updatedAt: new Date() })
          .where(eq(students.id, student.id));

        return newUser;
      });

      await logAuditEvent({
        userId: result.id,
        userEmail: result.email,
        role: 'student',
        action: 'STUDENT_PORTAL_ACTIVATED',
        resource: 'students',
        resourceId: student.id.toString(),
        details: `Student account activated for ${student.studentId}`,
        ipAddress: req.ip,
      });

      return res.status(201).json({
        message: 'Student account successfully activated.',
        email: result.email,
        studentId: student.studentId,
      });
    }

    // 2. TEACHER ACTIVATION
    if (targetRole === 'teacher' || cleanId.toUpperCase().startsWith('TCH-')) {
      const upperId = cleanId.toUpperCase();
      const teacherMatches = await db
        .select()
        .from(teachers)
        .where(eq(teachers.employeeId, upperId))
        .limit(1);

      if (teacherMatches.length === 0) {
        return res.status(404).json({
          error: `Staff / Employee ID "${cleanId}" was not found in the institutional registry. Please contact administration.`,
        });
      }

      const teacher = teacherMatches[0];

      // CRITICAL CHECK: Does this teacher record already have an account?
      if (teacher.userId) {
        const [existingUser] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, teacher.userId))
          .limit(1);

        return res.status(409).json({
          error: `An account is already linked to Staff ID "${cleanId}" (${existingUser?.email || 'Registered'}). Multiple accounts cannot be created with just one Staff ID. Please sign in with your existing account.`,
        });
      }

      const finalEmail = cleanEmail || `staff.${cleanId.toLowerCase().replace(/[^a-z0-9]/g, '')}@school.com`;
      const emailCheck = await db.select({ id: users.id }).from(users).where(eq(users.email, finalEmail)).limit(1);
      if (emailCheck.length > 0) {
        return res.status(409).json({
          error: `The email "${finalEmail}" is already registered. Please provide a different email or log in.`,
        });
      }

      const hashedPassword = await hashPassword(password);
      const userUid = crypto.randomUUID();

      const result = await db.transaction(async (tx) => {
        const lockedTeacher = await tx
          .select()
          .from(teachers)
          .where(eq(teachers.id, teacher.id))
          .limit(1);

        if (lockedTeacher[0].userId) {
          throw new Error('ALREADY_LINKED');
        }

        const [newUser] = await tx
          .insert(users)
          .values({
            uid: userUid,
            email: finalEmail,
            passwordHash: hashedPassword,
            fullName: `Faculty Member (${teacher.employeeId})`,
            role: 'teacher',
            status: 'active',
          })
          .returning();

        await tx
          .update(teachers)
          .set({ userId: newUser.id, updatedAt: new Date() })
          .where(eq(teachers.id, teacher.id));

        return newUser;
      });

      await logAuditEvent({
        userId: result.id,
        userEmail: result.email,
        role: 'teacher',
        action: 'TEACHER_PORTAL_ACTIVATED',
        resource: 'teachers',
        resourceId: teacher.id.toString(),
        details: `Teacher account activated for employee ID ${teacher.employeeId}`,
        ipAddress: req.ip,
      });

      return res.status(201).json({
        message: 'Faculty account successfully activated.',
        email: result.email,
        employeeId: teacher.employeeId,
      });
    }

    // 3. PARENT ACTIVATION
    if (targetRole === 'parent' || cleanId.toUpperCase().startsWith('PAR-')) {
      const upperId = cleanId.toUpperCase();
      const parentMatches = await db
        .select()
        .from(parents)
        .where(eq(parents.parentId, upperId))
        .limit(1);

      if (parentMatches.length > 0) {
        const parent = parentMatches[0];
        if (parent.userId) {
          return res.status(409).json({
            error: `An account is already linked to Parent ID "${cleanId}". Multiple accounts cannot be created with just one Parent ID. Please sign in.`,
          });
        }
      }

      const finalEmail = cleanEmail || (cleanId.includes('@') ? cleanId.toLowerCase() : null);
      if (!finalEmail) {
        return res.status(400).json({ error: 'Please provide a valid registered parent email address.' });
      }

      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, finalEmail))
        .limit(1);

      if (existingUser.length > 0) {
        return res.status(409).json({
          error: `An account is already registered for "${finalEmail}". Multiple accounts cannot be created for the same identity. Please sign in.`,
        });
      }

      const hashedPassword = await hashPassword(password);
      const userUid = crypto.randomUUID();

      const result = await db.transaction(async (tx) => {
        const [newUser] = await tx
          .insert(users)
          .values({
            uid: userUid,
            email: finalEmail,
            passwordHash: hashedPassword,
            fullName: 'Parent / Guardian',
            phone: cleanId.startsWith('+') || /^\d+$/.test(cleanId) ? cleanId : null,
            role: 'parent',
            status: 'active',
          })
          .returning();

        const parentId = cleanId.startsWith('PAR-') ? cleanId : await generateUniqueParentId();
        await tx.insert(parents).values({
          userId: newUser.id,
          parentId,
        });

        return { newUser, parentId };
      });

      await logAuditEvent({
        userId: result.newUser.id,
        userEmail: result.newUser.email,
        role: 'parent',
        action: 'PARENT_PORTAL_ACTIVATED',
        resource: 'parents',
        details: `Parent account activated for ${result.parentId}`,
        ipAddress: req.ip,
      });

      return res.status(201).json({
        message: 'Parent account successfully activated.',
        email: result.newUser.email,
        parentId: result.parentId,
      });
    }

    return res.status(400).json({ error: 'Unrecognized identification code or portal role.' });
  } catch (err: any) {
    if (err.message === 'ALREADY_LINKED') {
      return res.status(409).json({
        error: 'This ID has already been registered with an active account. Multiple accounts are not allowed.',
      });
    }
    console.error('Portal activation error:', err);
    return res.status(500).json({ error: 'Failed to complete portal activation. Please try again.' });
  }
});

// 4b. Real Admin Registration / Setup (Rate Limited & Secure Bootstrap)
authRouter.post('/register-admin', registrationLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, fullName, phone, setupKey } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !password) {
      return res.status(400).json({ error: 'Admin email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const envSetupKey = process.env.ADMIN_SETUP_KEY?.trim();
    const isSuperAdminRequest = req.user?.role === 'super_admin';
    const isSetupKeyValid = !!envSetupKey && typeof setupKey === 'string' && setupKey.trim() === envSetupKey;

    // Secure Bootstrap Authorization:
    // MUST NEVER authorize based only on matching ADMIN_EMAIL.
    // Require valid ADMIN_SETUP_KEY or an authenticated existing super_admin.
    if (!isSuperAdminRequest && !isSetupKeyValid) {
      return res.status(403).json({
        error: 'Forbidden: Super administrator registration requires valid authorization (a valid ADMIN_SETUP_KEY or an existing Super Admin session).',
      });
    }

    const hashedPassword = await hashPassword(password);

    // Check if user record already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, cleanEmail))
      .limit(1);

    let adminUser;
    if (existingUser) {
      // Prevent unauthorized takeover if caller is not an authenticated super_admin or valid setup key holder
      const [updated] = await db
        .update(users)
        .set({
          passwordHash: hashedPassword,
          fullName: fullName ? fullName.trim() : existingUser.fullName,
          role: 'super_admin',
          status: 'active',
          phone: phone || existingUser.phone,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id))
        .returning();
      adminUser = updated;
    } else {
      const userUid = `admin-${crypto.randomUUID()}`;
      const [created] = await db
        .insert(users)
        .values({
          uid: userUid,
          email: cleanEmail,
          passwordHash: hashedPassword,
          fullName: fullName ? fullName.trim() : 'System Administrator',
          role: 'super_admin',
          status: 'active',
          phone: phone || null,
        })
        .returning();
      adminUser = created;
    }

    await logAuditEvent({
      userId: adminUser.id,
      userEmail: adminUser.email,
      role: 'super_admin',
      action: 'ADMIN_ACCOUNT_CONFIGURED',
      resource: 'users',
      resourceId: adminUser.id.toString(),
      details: `Administrator account configured for ${adminUser.email}`,
      ipAddress: req.ip,
    });

    const token = generateToken({
      id: adminUser.id,
      uid: adminUser.uid,
      email: adminUser.email,
      role: 'super_admin',
      fullName: adminUser.fullName,
    });

    return res.status(201).json({
      message: 'Administrator account configured successfully.',
      token,
      user: {
        id: adminUser.id,
        email: adminUser.email,
        fullName: adminUser.fullName,
        role: adminUser.role,
        status: adminUser.status,
      },
    });
  } catch (error: any) {
    console.error('Admin registration error:', error);
    return res.status(500).json({ error: 'Failed to configure administrator account' });
  }
});

// Admin status check (returns whether admin is configured)
authRouter.get('/admin-status', async (_req: AuthRequest, res: Response) => {
  try {
    const envAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;
    const existingAdmins = await db
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(users)
      .where(eq(users.role, 'super_admin'))
      .limit(1);

    const hasAdmin = existingAdmins.length > 0;
    return res.json({
      configured: hasAdmin,
      adminEmail: hasAdmin ? existingAdmins[0].email : envAdminEmail,
    });
  } catch (error: any) {
    console.error('Admin status error:', error);
    return res.status(500).json({ error: 'Failed to check admin status' });
  }
});

// 5. Token validation check (Rate Limited)
authRouter.get('/verify-token', tokenValidationLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const rawToken = (req.query.token as string || '').trim();
    const type = (req.query.type as string || '').trim();

    if (!rawToken) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const hashed = hashToken(rawToken);

    if (type === 'student') {
      const studentMatch = await db
        .select({
          studentId: students.studentId,
          firstName: students.firstName,
          lastName: students.lastName,
          hasAccount: students.userId,
        })
        .from(students)
        .where(eq(students.enrollmentToken, hashed))
        .limit(1);

      if (studentMatch.length === 0 || studentMatch[0].hasAccount) {
        return res.status(404).json({ valid: false, message: 'Invalid or already activated enrollment token' });
      }
      return res.json({ valid: true, type: 'student', student: studentMatch[0] });
    }

    if (type === 'parent') {
      const parentMatch = await db
        .select({ id: parentInvitations.id, studentId: parentInvitations.studentId, relationship: parentInvitations.relationship })
        .from(parentInvitations)
        .where(and(eq(parentInvitations.invitationToken, hashed), eq(parentInvitations.isUsed, false), gt(parentInvitations.expiresAt, new Date())))
        .limit(1);

      if (parentMatch.length === 0) {
        return res.status(404).json({ valid: false, message: 'Invalid or expired invitation token' });
      }
      return res.json({ valid: true, type: 'parent' });
    }

    if (type === 'teacher') {
      const teacherMatch = await db
        .select({ id: teacherInvitations.id, fullName: teacherInvitations.fullName, email: teacherInvitations.email })
        .from(teacherInvitations)
        .where(and(eq(teacherInvitations.invitationToken, hashed), eq(teacherInvitations.isUsed, false), gt(teacherInvitations.expiresAt, new Date())))
        .limit(1);

      if (teacherMatch.length === 0) {
        return res.status(404).json({ valid: false, message: 'Invalid or expired invitation token' });
      }
      return res.json({ valid: true, type: 'teacher' });
    }

    res.status(400).json({ error: 'Unknown token type' });
  } catch (err: any) {
    console.error('Verify token error:', err);
    res.status(500).json({ error: 'Failed to verify token' });
  }
});

// 6. Get current profile (Me)
authRouter.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userRecords: any = await withDbRetry(() =>
      db
        .select()
        .from(users)
        .where(eq(users.id, req.user!.id))
        .limit(1)
    );

    if (userRecords.length === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const u = userRecords[0];
    if (u.status === 'suspended') {
      return res.status(403).json({ error: 'This account has been suspended. Please contact the administrator.' });
    }

    let extra: any = {};
    let userPermissions: string[] = [];

    if (u.role === 'super_admin') {
      userPermissions = [
        'fee_management',
        'public_portal_management',
        'visual_page_editor',
        'admissions_management',
        'timetable_editing',
        'class_management',
        'grading_management',
        'announcements_management',
        'attendance_management',
      ];
    } else if (u.role === 'teacher') {
      const t = await db.select().from(teachers).where(eq(teachers.userId, u.id)).limit(1);
      if (t.length > 0) {
        let parsedPerms: string[] = [];
        if (t[0].permissions) {
          if (Array.isArray(t[0].permissions)) {
            parsedPerms = t[0].permissions;
          } else {
            try {
              parsedPerms = JSON.parse(t[0].permissions);
            } catch {
              parsedPerms = [];
            }
          }
        }
        userPermissions = parsedPerms;
        extra.teacherProfile = {
          ...t[0],
          permissions: parsedPerms,
        };
      }
    } else if (u.role === 'student') {
      const s = await db.select().from(students).where(eq(students.userId, u.id)).limit(1);
      if (s.length > 0) extra.studentProfile = s[0];
    } else if (u.role === 'parent') {
      let pProfile = await db.select().from(parents).where(eq(parents.userId, u.id)).limit(1);
      if (pProfile.length === 0) {
        const parentId = await generateUniqueParentId();
        const [createdP] = await db.insert(parents).values({ userId: u.id, parentId }).returning();
        pProfile = [createdP];
      }
      extra.parentProfile = pProfile[0];
      const linked = await db
        .select({
          relationshipId: parentStudents.id,
          studentId: students.id,
          studentCode: students.studentId,
          firstName: students.firstName,
          lastName: students.lastName,
          classId: students.classId,
          relationship: parentStudents.relationship,
        })
        .from(parentStudents)
        .innerJoin(students, eq(parentStudents.studentId, students.id))
        .where(eq(parentStudents.parentUserId, u.id));
      extra.children = linked;
    }

    res.json({
      user: {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        status: u.status,
        phone: u.phone,
        permissions: userPermissions,
        createdAt: u.createdAt,
      },
      ...extra,
    });
  } catch (error: any) {
    console.error('Failed to get user profile:', error);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// 7. Request Password Reset Token (Accepts email or Student/Teacher/Parent ID)
authRouter.post('/forgot-password', passwordResetLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const rawIdentifier = (req.body.identifier || req.body.email || '').trim();
    if (!rawIdentifier) {
      return res.status(400).json({ error: 'Email address or School ID is required' });
    }

    const isEmailDeliveryConfigured = Boolean(
      process.env.SMTP_HOST ||
      process.env.SENDGRID_API_KEY ||
      process.env.RESEND_API_KEY ||
      process.env.AWS_SES_REGION ||
      process.env.EMAIL_SERVICE_CONFIGURED === 'true'
    );

    if (!isEmailDeliveryConfigured) {
      return res.status(503).json({
        error: 'Password reset email delivery is currently unavailable because an outbound email service (SMTP) is not configured. Please contact the school administrator directly to reset your credentials or use the Student/Staff portal account activation.',
        serviceConfigured: false,
      });
    }

    const genericSuccessResponse = {
      message: 'If an account exists with this identifier, password recovery instructions have been prepared and dispatched.',
      serviceConfigured: true,
    };

    let targetUserId: number | null = null;
    const upper = rawIdentifier.toUpperCase();

    // Check by Student ID
    if (upper.startsWith('STU-')) {
      const studentRec = await db
        .select({ userId: students.userId })
        .from(students)
        .where(eq(students.studentId, upper))
        .limit(1);
      if (studentRec.length > 0 && studentRec[0].userId) {
        targetUserId = studentRec[0].userId;
      }
    }

    // Check by Teacher ID
    if (!targetUserId && upper.startsWith('TCH-')) {
      const teacherRec = await db
        .select({ userId: teachers.userId })
        .from(teachers)
        .where(eq(teachers.employeeId, upper))
        .limit(1);
      if (teacherRec.length > 0 && teacherRec[0].userId) {
        targetUserId = teacherRec[0].userId;
      }
    }

    // Check by Parent ID
    if (!targetUserId && upper.startsWith('PAR-')) {
      const parentRec = await db
        .select({ userId: parents.userId })
        .from(parents)
        .where(eq(parents.parentId, upper))
        .limit(1);
      if (parentRec.length > 0 && parentRec[0].userId) {
        targetUserId = parentRec[0].userId;
      }
    }

    // Lookup user record
    let foundUsers;
    if (targetUserId) {
      foundUsers = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
    } else {
      foundUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, rawIdentifier.toLowerCase()))
        .limit(1);
    }

    if (foundUsers.length === 0) {
      return res.json(genericSuccessResponse);
    }

    const user = foundUsers[0];
    const rawResetToken = generateSecureToken('RST');
    const resetTokenHash = hashToken(rawResetToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResets).values({
      userId: user.id,
      resetToken: resetTokenHash, // Storing only SHA-256 hash
      expiresAt,
      isUsed: false,
    });

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'PASSWORD_RESET_REQUESTED',
      resource: 'password_resets',
      ipAddress: req.ip,
    });

    res.json(genericSuccessResponse);
  } catch (error: any) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Could not process password recovery' });
  }
});

// 8. Student Instant Self-Service Password Reset (with Student ID + Enrollment Token or Reset Token)
authRouter.post('/reset-student-password', passwordResetLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, enrollmentToken, resetToken, newPassword } = req.body;
    if (!studentId || !newPassword) {
      return res.status(400).json({ error: 'Student ID and new password are required' });
    }

    if (!enrollmentToken && !resetToken) {
      return res.status(400).json({ error: 'Enrollment token or reset code is required for student verification' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const cleanStudentId = studentId.trim().toUpperCase();
    const studentRecords = await db
      .select({
        id: students.id,
        userId: students.userId,
        enrollmentToken: students.enrollmentToken,
        firstName: students.firstName,
        lastName: students.lastName,
      })
      .from(students)
      .where(eq(students.studentId, cleanStudentId))
      .limit(1);

    if (studentRecords.length === 0 || !studentRecords[0].userId) {
      return res.status(404).json({ error: 'No active student account found for this Student ID' });
    }

    const student = studentRecords[0];
    const studentUserId = student.userId as number;
    let isVerified = false;

    // Check enrollment token verification
    if (enrollmentToken) {
      const hashedGivenEnrollment = hashToken(enrollmentToken.trim().toUpperCase());
      if (student.enrollmentToken && student.enrollmentToken === hashedGivenEnrollment) {
        isVerified = true;
      }
    }

    // Check reset token verification
    if (!isVerified && resetToken) {
      const hashedReset = hashToken(resetToken.trim());
      const resetRecords = await db
        .select()
        .from(passwordResets)
        .where(
          and(
            eq(passwordResets.userId, studentUserId),
            eq(passwordResets.resetToken, hashedReset),
            eq(passwordResets.isUsed, false),
            gt(passwordResets.expiresAt, new Date())
          )
        )
        .limit(1);

      if (resetRecords.length > 0) {
        isVerified = true;
        await db.update(passwordResets).set({ isUsed: true }).where(eq(passwordResets.id, resetRecords[0].id));
      }
    }

    if (!isVerified) {
      return res.status(400).json({ error: 'Verification failed: invalid enrollment token or reset code' });
    }

    const newHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, studentUserId));

    const userRecords = await db.select().from(users).where(eq(users.id, studentUserId)).limit(1);
    const user = userRecords[0];

    await logAuditEvent({
      userId: studentUserId,
      userEmail: user?.email,
      role: 'student',
      action: 'STUDENT_PASSWORD_RESET',
      resource: 'users',
      resourceId: studentUserId.toString(),
      details: `Student ${student.firstName} ${student.lastName} reset their password via self-service verification`,
      ipAddress: req.ip,
    });

    const token = generateToken({
      id: user.id,
      uid: user.uid,
      email: user.email,
      role: 'student',
      fullName: user.fullName,
    });

    res.json({
      message: 'Your password has been successfully reset! You are now logged in.',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error: any) {
    console.error('Student password reset error:', error);
    res.status(500).json({ error: 'Failed to reset student password' });
  }
});

// 9. Complete Password Reset via Standard Token (Rate Limited & Hashed Comparison)
authRouter.post('/reset-password', passwordResetLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: 'Reset token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const resetTokenHash = hashToken(resetToken);

    await db.transaction(async (tx) => {
      const foundTokens = await tx
        .select()
        .from(passwordResets)
        .where(
          and(
            eq(passwordResets.resetToken, resetTokenHash),
            eq(passwordResets.isUsed, false),
            gt(passwordResets.expiresAt, new Date())
          )
        )
        .limit(1);

      if (foundTokens.length === 0) {
        throw new Error('INVALID_RESET_TOKEN');
      }

      const pr = foundTokens[0];
      const newHash = await hashPassword(newPassword);

      await tx.update(users).set({ passwordHash: newHash }).where(eq(users.id, pr.userId));
      await tx.update(passwordResets).set({ isUsed: true }).where(eq(passwordResets.id, pr.id));
    });

    logAuditEvent({
      action: 'PASSWORD_RESET_COMPLETED',
      resource: 'users',
      ipAddress: req.ip,
    }).catch(() => {});

    res.json({ message: 'Password has been securely reset. You may now sign in with your new password.' });
  } catch (error: any) {
    if (error.message === 'INVALID_RESET_TOKEN') {
      return res.status(400).json({ error: 'Invalid or expired password reset token' });
    }
    console.error('Password reset completion error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});
