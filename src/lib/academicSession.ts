import { db } from '../db/index.ts';
import { academicSessions, academicTerms } from '../db/schema.ts';
import { eq, sql } from 'drizzle-orm';

export interface AcademicContext {
  sessionId: number | null;
  sessionName: string | null;
  termId: number | null;
  termName: string | null;
}

/**
 * SINGLE SOURCE OF TRUTH FOR ACADEMIC SESSIONS & TERMS
 * All seed scripts, migrations, dashboards, and services reference these constants.
 */
export const CANONICAL_CURRENT_SESSION_NAME = '2026/2027';
export const CANONICAL_CURRENT_TERM_NAME = 'First Term';

export const CANONICAL_SESSIONS = [
  {
    name: '2024/2025',
    startDate: '2024-09-02',
    endDate: '2025-07-18',
    isCurrent: false,
    status: 'completed' as const,
    description: '2024/2025 Academic Year',
  },
  {
    name: '2025/2026',
    startDate: '2025-09-01',
    endDate: '2026-07-17',
    isCurrent: false,
    status: 'completed' as const,
    description: '2025/2026 Academic Year',
  },
  {
    name: '2026/2027',
    startDate: '2026-09-07',
    endDate: '2027-07-16',
    isCurrent: true,
    status: 'active' as const,
    description: '2026/2027 Academic Year (Current)',
  },
];

export const CANONICAL_TERMS = [
  // 2024/2025
  { sessionName: '2024/2025', termName: 'First Term', termNumber: 1, isCurrent: false, start: '2024-09-09', end: '2024-12-20' },
  { sessionName: '2024/2025', termName: 'Second Term', termNumber: 2, isCurrent: false, start: '2025-01-06', end: '2025-04-11' },
  { sessionName: '2024/2025', termName: 'Third Term', termNumber: 3, isCurrent: false, start: '2025-04-28', end: '2025-07-25' },
  // 2025/2026
  { sessionName: '2025/2026', termName: 'First Term', termNumber: 1, isCurrent: false, start: '2025-09-08', end: '2025-12-19' },
  { sessionName: '2025/2026', termName: 'Second Term', termNumber: 2, isCurrent: false, start: '2026-01-05', end: '2026-04-10' },
  { sessionName: '2025/2026', termName: 'Third Term', termNumber: 3, isCurrent: false, start: '2026-04-27', end: '2026-07-24' },
  // 2026/2027 (Active)
  { sessionName: '2026/2027', termName: 'First Term', termNumber: 1, isCurrent: true, start: '2026-09-07', end: '2026-12-18' },
  { sessionName: '2026/2027', termName: 'Second Term', termNumber: 2, isCurrent: false, start: '2027-01-11', end: '2027-04-09' },
  { sessionName: '2026/2027', termName: 'Third Term', termNumber: 3, isCurrent: false, start: '2027-04-26', end: '2027-07-16' },
];

/**
 * Single Source of Truth for Current Academic Session and Term.
 */
export async function getCurrentAcademicContext(): Promise<AcademicContext> {
  const [currentSession] = await db
    .select({ id: academicSessions.id, name: academicSessions.name })
    .from(academicSessions)
    .where(eq(academicSessions.isCurrent, true))
    .limit(1);

  const [currentTerm] = await db
    .select({ id: academicTerms.id, termName: academicTerms.termName })
    .from(academicTerms)
    .where(eq(academicTerms.isCurrent, true))
    .limit(1);

  return {
    sessionId: currentSession?.id || null,
    sessionName: currentSession?.name || CANONICAL_CURRENT_SESSION_NAME,
    termId: currentTerm?.id || null,
    termName: currentTerm?.termName || CANONICAL_CURRENT_TERM_NAME,
  };
}

/**
 * Synchronizes the database with canonical sessions and terms without destroying production data.
 */
export async function syncCanonicalSessionsAndTerms(): Promise<{ currentSessionId: number; currentTermId: number }> {
  const sessionMap = new Map<string, number>();

  for (const s of CANONICAL_SESSIONS) {
    const existing = await db
      .select()
      .from(academicSessions)
      .where(eq(academicSessions.name, s.name))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(academicSessions)
        .set({
          isCurrent: s.isCurrent,
          status: s.status,
          startDate: s.startDate,
          endDate: s.endDate,
          description: s.description,
        })
        .where(eq(academicSessions.id, existing[0].id));
      sessionMap.set(s.name, existing[0].id);
    } else {
      const [inserted] = await db
        .insert(academicSessions)
        .values({
          name: s.name,
          startDate: s.startDate,
          endDate: s.endDate,
          isCurrent: s.isCurrent,
          status: s.status,
          description: s.description,
        })
        .returning();
      sessionMap.set(s.name, inserted.id);
    }
  }

  const currentSessionId = sessionMap.get(CANONICAL_CURRENT_SESSION_NAME)!;
  let currentTermId = 1;

  for (const t of CANONICAL_TERMS) {
    const sessId = sessionMap.get(t.sessionName);
    const existing = await db
      .select()
      .from(academicTerms)
      .where(sql`session_name = ${t.sessionName} AND term_name = ${t.termName}`)
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(academicTerms)
        .set({
          sessionId: sessId || null,
          isCurrent: t.isCurrent,
          termNumber: t.termNumber,
          startDate: t.start,
          endDate: t.end,
        })
        .where(eq(academicTerms.id, existing[0].id));
      if (t.isCurrent) currentTermId = existing[0].id;
    } else {
      const [inserted] = await db
        .insert(academicTerms)
        .values({
          sessionId: sessId || null,
          sessionName: t.sessionName,
          termName: t.termName,
          termNumber: t.termNumber,
          isCurrent: t.isCurrent,
          startDate: t.start,
          endDate: t.end,
        })
        .returning();
      if (t.isCurrent) currentTermId = inserted.id;
    }
  }

  return { currentSessionId, currentTermId };
}
