import { Router, Request, Response } from 'express';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.ts';
import { publicPortalSettings, schoolSettings, schools, users } from '../db/schema.ts';
import { hashPassword, validatePasswordStrength } from '../lib/auth.ts';

export const platformRouter = Router();

function keyMatches(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

platformRouter.post('/schools', async (req: Request, res: Response) => {
  const configuredKey = process.env.PLATFORM_ADMIN_KEY || '';
  const receivedKey = String(req.headers['x-platform-admin-key'] || '');
  if (configuredKey.length < 32 || !keyMatches(receivedKey, configuredKey)) {
    return res.status(401).json({ error: 'Platform administrator authorization is required.' });
  }

  const { schoolName, slug: rawSlug, domain: rawDomain, adminName, adminEmail, adminPassword } = req.body || {};
  const slug = typeof rawSlug === 'string' ? rawSlug.trim().toLowerCase() : '';
  const domain = typeof rawDomain === 'string' && rawDomain.trim() ? rawDomain.trim().toLowerCase() : null;
  const email = typeof adminEmail === 'string' ? adminEmail.trim().toLowerCase() : '';
  const passwordCheck = validatePasswordStrength(adminPassword);
  if (
    typeof schoolName !== 'string' || schoolName.trim().length < 2 || schoolName.trim().length > 160 ||
    !/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ||
    typeof adminName !== 'string' || adminName.trim().length < 2 || adminName.trim().length > 160 ||
    (domain !== null && !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !passwordCheck.valid
  ) {
    return res.status(400).json({ error: 'Provide a valid school name, school code, administrator name, email, and password.' });
  }

  try {
    const passwordHash = await hashPassword(adminPassword);
    const created = await getDb().transaction(async (tx: any) => {
      const [school] = await tx.insert(schools).values({ name: schoolName.trim(), slug, domain }).returning({
        id: schools.id, name: schools.name, slug: schools.slug,
      });
      await tx.execute(sql`SELECT set_config('app.school_id', ${String(school.id)}, true)`);
      if ((globalThis as any)._pgliteInstance) await tx.execute(sql`SET LOCAL ROLE sms_app_runtime`);
      await tx.insert(users).values({
        uid: randomUUID(), email, passwordHash, fullName: adminName.trim(), role: 'super_admin', status: 'active',
      });
      await tx.insert(schoolSettings).values({ schoolName: school.name });
      await tx.insert(publicPortalSettings).values({});
      return school;
    });
    return res.status(201).json({ school: created, message: 'School and first administrator created.' });
  } catch (error: any) {
    if (error?.code === '23505' || /unique constraint/i.test(String(error?.message || ''))) {
      return res.status(409).json({ error: 'That school code, domain, or administrator email is already in use.' });
    }
    console.error('School provisioning failed:', error?.message || 'unknown error');
    return res.status(500).json({ error: 'The school could not be created. Check the server configuration and try again.' });
  }
});
