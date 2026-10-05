import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';

export async function logAuditEvent(
  params: {
    userId?: number;
    userEmail?: string;
    role?: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: Record<string, any> | string;
    ipAddress?: string;
  },
  executor?: any
) {
  try {
    const detailsStr =
      typeof params.details === 'object'
        ? JSON.stringify(params.details)
        : params.details;

    const client = executor || db;

    await client.insert(auditLogs).values({
      userId: params.userId,
      userEmail: params.userEmail,
      role: params.role,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      details: detailsStr,
      ipAddress: params.ipAddress,
    });
  } catch (err) {
    // Non-blocking for primary application flow, but logged on server
    console.error('Failed to write audit log:', err);
  }
}
