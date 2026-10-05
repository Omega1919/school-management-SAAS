import { db, withDbRetry } from '../db/index.ts';
import { users, announcements, auditLogs, payments, passwordResets, homeworkSubmissions } from '../db/schema.ts';
import { hashPassword } from './auth.ts';
import { eq, ne, and } from 'drizzle-orm';
import crypto from 'crypto';

export interface RealAdminConfig {
  email: string;
  fullName: string;
  id: number;
}

/**
 * Ensures a real administrator account exists in the database with genuine email and credentials.
 * Automatically purges legacy dummy admin data ('admin@school.com') and safely reassigns
 * any relational references to the real administrator.
 */
export async function ensureRealAdmin(): Promise<RealAdminConfig | null> {
  const envAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const envAdminPassword = process.env.ADMIN_PASSWORD?.trim();
  const envAdminName = process.env.ADMIN_FULL_NAME?.trim() || 'System Administrator';

  if (!envAdminEmail || !envAdminPassword) {
    return null;
  }

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && envAdminPassword.length < 12) {
    throw new Error(`FATAL: ADMIN_PASSWORD in production must be at least 12 characters (current: ${envAdminPassword.length}).`);
  }

  return await withDbRetry(async () => {
    // 0. Purge any legacy demo admin account if present
    await db.delete(users).where(eq(users.email, 'admin@school.com'));

    // 1. Look for existing super_admin matching the real admin email
    const [existingTarget] = await db
      .select()
      .from(users)
      .where(eq(users.email, envAdminEmail))
      .limit(1);

    if (existingTarget) {
      if (existingTarget.role !== 'super_admin' || existingTarget.status !== 'active') {
        const [updated] = await db
          .update(users)
          .set({
            role: 'super_admin',
            status: 'active',
            fullName: envAdminName,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingTarget.id))
          .returning();
        return {
          email: updated.email,
          fullName: updated.fullName,
          id: updated.id,
        };
      }
      return {
        email: existingTarget.email,
        fullName: existingTarget.fullName,
        id: existingTarget.id,
      };
    }

    // 2. Create the primary super_admin user only when not already existing
    const hashedPassword = await hashPassword(envAdminPassword);
    const [created] = await db
      .insert(users)
      .values({
        uid: `admin-${crypto.randomUUID()}`,
        email: envAdminEmail,
        passwordHash: hashedPassword,
        fullName: envAdminName,
        role: 'super_admin',
        status: 'active',
        phone: '+234 800 000 0001',
      })
      .returning();

    console.log(`✓ Real administrator initialized: ${created.email} (${created.fullName})`);
    return {
      email: created.email,
      fullName: created.fullName,
      id: created.id,
    };
  });
}
