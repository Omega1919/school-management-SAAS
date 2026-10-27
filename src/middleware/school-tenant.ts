import { Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';
import { db, runWithSchoolContext } from '../db/index.ts';
import { schools } from '../db/schema.ts';

export interface TenantRequest extends Request {
  school?: { id: number; name: string; slug: string };
}

function cleanHost(host: string): string {
  return host.split(':')[0].trim().toLowerCase();
}

export async function schoolTenantMiddleware(req: TenantRequest, res: Response, next: NextFunction) {
  try {
    const host = cleanHost(String(req.headers['x-forwarded-host'] || req.headers.host || ''));
    const requestedSlug = String(req.query.school || '').trim().toLowerCase();
    const configuredDefault = String(process.env.DEFAULT_SCHOOL_SLUG || '').trim().toLowerCase();
    const localHost = ['localhost', '127.0.0.1'].includes(host);
    const tenantRoot = String(process.env.TENANT_ROOT_DOMAIN || '').trim().toLowerCase();
    const subdomain = tenantRoot && host.endsWith(`.${tenantRoot}`)
      ? host.slice(0, -(tenantRoot.length + 1)).split('.')[0]
      : '';
    const fallbackSlug = localHost ? configuredDefault || 'springfield' : configuredDefault;

    // Resolve the tenant from the actual domain first. A client-provided
    // school slug must not override the school configured for this hostname.
    let [school] = host ? await db.select({ id: schools.id, name: schools.name, slug: schools.slug })
      .from(schools).where(and(eq(schools.domain, host), eq(schools.status, 'active'))).limit(1) : [];
    if (!school && subdomain) {
      [school] = await db.select({ id: schools.id, name: schools.name, slug: schools.slug })
        .from(schools).where(and(eq(schools.slug, subdomain), eq(schools.status, 'active'))).limit(1);
    }
    if (!school && requestedSlug) {
      [school] = await db.select({ id: schools.id, name: schools.name, slug: schools.slug })
        .from(schools).where(and(eq(schools.slug, requestedSlug), eq(schools.status, 'active'))).limit(1);
    }
    if (!school && !requestedSlug && !subdomain && fallbackSlug) {
      [school] = await db.select({ id: schools.id, name: schools.name, slug: schools.slug })
        .from(schools).where(and(eq(schools.slug, fallbackSlug), eq(schools.status, 'active'))).limit(1);
    }

    if (!school && !host && !fallbackSlug && !requestedSlug) {
      return res.status(400).json({ error: 'School could not be determined for this address.' });
    }
    if (!school) return res.status(404).json({ error: 'School could not be verified for this address.' });
    req.school = school;
    res.setHeader('X-School-Slug', school.slug);

    let releaseContext: (() => void) | undefined;
    let resolveResponse!: () => void;
    const complete = () => { releaseContext?.(); resolveResponse(); };
    const waitForResponse = new Promise<void>((resolve) => { resolveResponse = resolve; });
    res.once('finish', complete);
    res.once('close', complete);
    res.locals.releaseSchoolContext = complete;

    await runWithSchoolContext(school.id, async (release) => {
      releaseContext = release;
      res.locals.releaseSchoolContext = complete;
      next();
      await waitForResponse;
    });
  } catch (error) {
    next(error);
  }
}
