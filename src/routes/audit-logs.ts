import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import { eq, desc, and, count } from 'drizzle-orm';

export const auditLogsRouter = Router();

auditLogsRouter.get('/', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit as string) || 25));
    const offset = (page - 1) * limit;

    const resource = (req.query.resource as string || '').trim();
    const condition = resource ? eq(auditLogs.resource, resource) : undefined;

    const totalCountRes = await db.select({ count: count() }).from(auditLogs).where(condition);
    const total = totalCountRes[0]?.count || 0;

    const logs = await db
      .select()
      .from(auditLogs)
      .where(condition)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Fetch audit logs error:', error);
    res.status(500).json({ error: 'Failed to retrieve audit trail' });
  }
});

auditLogsRouter.get('/:id', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.id, id)).limit(1);
    if (!log) {
      return res.status(404).json({ error: 'Audit log record not found' });
    }
    res.json(log);
  } catch (error: any) {
    console.error('Fetch audit log item error:', error);
    res.status(500).json({ error: 'Failed to retrieve audit log record' });
  }
});
