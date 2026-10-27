import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../lib/auth.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users, teachers } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

export interface AuthenticatedUser extends TokenPayload {
  status?: string;
  permissions?: string[];
  isDemo?: boolean;
  dbUser?: any;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export async function fetchUserPermissions(userId: number, role: string): Promise<string[]> {
  if (role === 'super_admin') {
    return [
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
  }
  if (role === 'teacher') {
    try {
      const [t] = await db
        .select({ permissions: teachers.permissions })
        .from(teachers)
        .where(eq(teachers.userId, userId))
        .limit(1);

      if (t && t.permissions) {
        if (Array.isArray(t.permissions)) return t.permissions;
        try {
          const parsed = JSON.parse(t.permissions);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          return [];
        }
      }
    } catch {
      return [];
    }
  }
  return [];
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split('Bearer ')[1].trim();
  }

  if (!token) {
    return next();
  }

  // 1. Try custom JWT
  const jwtPayload = verifyToken(token);
  if (jwtPayload && jwtPayload.id) {
    try {
      const [dbUser] = await db
        .select({
          id: users.id,
          uid: users.uid,
          email: users.email,
          role: users.role,
          status: users.status,
          fullName: users.fullName,
          tokenVersion: users.tokenVersion,
          isDemo: users.isDemo,
        })
        .from(users)
        .where(eq(users.id, jwtPayload.id))
        .limit(1);

      // Immediately reject suspended or deleted accounts
      if (!dbUser || dbUser.status === 'suspended') {
        return next();
      }

      // Check token version to enforce server-side session invalidation on password reset or logout
      if (
        typeof jwtPayload.tokenVersion !== 'number' ||
        typeof dbUser.tokenVersion !== 'number' ||
        jwtPayload.tokenVersion !== dbUser.tokenVersion
      ) {
        // Token has been revoked
        return next();
      }

      const permissions = await fetchUserPermissions(dbUser.id, dbUser.role);

      // Always assign fresh role, state, and permissions from database (prevents client-forged roles)
      req.user = {
        id: dbUser.id,
        uid: dbUser.uid,
        email: dbUser.email,
        role: dbUser.role as any,
        status: dbUser.status,
        fullName: dbUser.fullName,
        tokenVersion: dbUser.tokenVersion,
        isDemo: dbUser.isDemo,
        permissions,
      };
      return next();
    } catch (err) {
      console.error('Database verification error in auth middleware:', err);
      return next();
    }
  }

  // 2. Try Firebase ID token
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = (decoded.email || '').toLowerCase().trim();
    
    // Fetch user in PostgreSQL strictly by UID or email
    let foundUsers = await db.select().from(users).where(eq(users.uid, decoded.uid)).limit(1);
    if (foundUsers.length === 0 && email) {
      foundUsers = await db.select().from(users).where(eq(users.email, email)).limit(1);
    }

    if (foundUsers.length > 0) {
      const u = foundUsers[0];
      if (u.status === 'suspended') {
        return next();
      }

      const permissions = await fetchUserPermissions(u.id, u.role);

      req.user = {
        id: u.id,
        uid: u.uid,
        email: u.email,
        role: u.role as any,
        status: u.status,
        fullName: u.fullName,
        permissions,
      };
    }
    // If not found in database, do NOT auto-assign fallback roles
  } catch {
    // Invalid token
  }

  next();
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  if (req.user.status === 'suspended') {
    return res.status(403).json({ error: 'This account has been suspended. Please contact the administrator.' });
  }
  next();
}

export function hasPermission(user: AuthenticatedUser | undefined, permission: string): boolean {
  if (!user || !user.id || user.status === 'suspended') return false;
  if (user.role === 'super_admin') return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

export function requireRole(allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.status === 'suspended') {
      return res.status(403).json({ error: 'This account has been suspended. Please contact the administrator.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Access restricted to ${allowedRoles.join(', ')}. Your role is ${req.user.role}.`
      });
    }
    next();
  };
}

export function requirePermission(permission: string, fallbackRoles: string[] = ['super_admin']) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.status === 'suspended') {
      return res.status(403).json({ error: 'This account has been suspended. Please contact the administrator.' });
    }
    if (fallbackRoles.includes(req.user.role) || hasPermission(req.user, permission)) {
      return next();
    }
    return res.status(403).json({
      error: `Forbidden: You do not have permission (${permission}) to perform this administrative action.`
    });
  };
}

export function requireRoleOrPermission(allowedRoles: string[], permission?: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.status === 'suspended') {
      return res.status(403).json({ error: 'This account has been suspended. Please contact the administrator.' });
    }
    if (allowedRoles.includes(req.user.role)) {
      return next();
    }
    if (permission && hasPermission(req.user, permission)) {
      return next();
    }
    return res.status(403).json({
      error: `Forbidden: Access restricted. You lack required role or permission.`
    });
  };
}

