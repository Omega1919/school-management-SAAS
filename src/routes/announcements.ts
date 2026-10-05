import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import { announcements, users, classes, teachers, classSubjects, students, parentStudents } from '../db/schema.ts';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { eq, or, and, desc, inArray, isNull, SQL } from 'drizzle-orm';

export const announcementsRouter = Router();

export const ALLOWED_TARGET_ROLES = ['all', 'students', 'teachers', 'parents', 'class'] as const;
export const ALLOWED_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

// ============================================================================
// 1. GET /api/announcements - Audience-aware, class-scoped announcement feed
// ============================================================================
announcementsRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    if (user.role === 'super_admin') {
      // Super admin sees all announcements
      const list = await db
        .select({
          id: announcements.id,
          title: announcements.title,
          content: announcements.content,
          targetRole: announcements.targetRole,
          targetClassId: announcements.targetClassId,
          className: classes.name,
          priority: announcements.priority,
          authorName: users.fullName,
          createdAt: announcements.createdAt,
        })
        .from(announcements)
        .innerJoin(users, eq(announcements.authorId, users.id))
        .leftJoin(classes, eq(announcements.targetClassId, classes.id))
        .orderBy(desc(announcements.createdAt));
      return res.json(list);
    }

    const orConditions: (SQL | undefined)[] = [];

    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      let assignedClassIds: number[] = [];
      if (t) {
        const ctClasses = await db.select({ id: classes.id }).from(classes).where(eq(classes.classTeacherId, t.id));
        const arClasses = await db.select({ id: classes.id }).from(classes).where(eq(classes.attendanceRecorderId, t.id));
        const csClasses = await db.select({ id: classSubjects.classId }).from(classSubjects).where(eq(classSubjects.teacherId, t.id));
        assignedClassIds = Array.from(new Set([
          ...ctClasses.map((c) => c.id),
          ...arClasses.map((c) => c.id),
          ...csClasses.map((c) => c.id),
        ]));
      }

      // General announcements for all or teachers (no class scoping)
      orConditions.push(
        and(
          or(eq(announcements.targetRole, 'all'), eq(announcements.targetRole, 'teachers')),
          isNull(announcements.targetClassId)
        )
      );

      // Class-specific announcements for classes teacher is assigned to
      if (assignedClassIds.length > 0) {
        orConditions.push(inArray(announcements.targetClassId as any, assignedClassIds));
      }
    } else if (user.role === 'student') {
      const [s] = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);

      // General announcements for all or students
      orConditions.push(
        and(
          or(eq(announcements.targetRole, 'all'), eq(announcements.targetRole, 'students')),
          isNull(announcements.targetClassId)
        )
      );

      // Class-specific announcements matching student's class
      if (s?.classId) {
        orConditions.push(eq(announcements.targetClassId, s.classId));
      }
    } else if (user.role === 'parent') {
      const linked = await db
        .select({ classId: students.classId })
        .from(parentStudents)
        .innerJoin(students, eq(parentStudents.studentId, students.id))
        .where(eq(parentStudents.parentUserId, user.id));

      const childrenClassIds = Array.from(new Set(linked.map((l) => l.classId).filter((cid): cid is number => cid !== null)));

      // General announcements for all or parents
      orConditions.push(
        and(
          or(eq(announcements.targetRole, 'all'), eq(announcements.targetRole, 'parents')),
          isNull(announcements.targetClassId)
        )
      );

      // Class-specific announcements for children's classes
      if (childrenClassIds.length > 0) {
        orConditions.push(inArray(announcements.targetClassId as any, childrenClassIds));
      }
    }

    const list = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        targetRole: announcements.targetRole,
        targetClassId: announcements.targetClassId,
        className: classes.name,
        priority: announcements.priority,
        authorName: users.fullName,
        createdAt: announcements.createdAt,
      })
      .from(announcements)
      .innerJoin(users, eq(announcements.authorId, users.id))
      .leftJoin(classes, eq(announcements.targetClassId, classes.id))
      .where(or(...orConditions))
      .orderBy(desc(announcements.createdAt));

    res.json(list);
  } catch (error: any) {
    console.error('Fetch announcements error:', error);
    res.status(500).json({ error: 'Failed to retrieve announcements' });
  }
});

// ============================================================================
// 2. POST /api/announcements - Publish announcement with validation & class scoping
// ============================================================================
announcementsRouter.post('/', requireAuth, requireRole(['super_admin', 'teacher']), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { title, content, targetRole, targetClassId, priority } = req.body;

    if (!title || !title.trim() || !content || !content.trim()) {
      return res.status(400).json({ error: 'Title and content are required.' });
    }

    const effectiveRole = targetRole || (targetClassId ? 'class' : 'all');
    if (!ALLOWED_TARGET_ROLES.includes(effectiveRole)) {
      return res.status(400).json({
        error: `Invalid target role '${effectiveRole}'. Allowed roles: ${ALLOWED_TARGET_ROLES.join(', ')}.`,
      });
    }

    const effectivePriority = priority || 'normal';
    if (!ALLOWED_PRIORITIES.includes(effectivePriority)) {
      return res.status(400).json({
        error: `Invalid priority '${effectivePriority}'. Allowed priorities: ${ALLOWED_PRIORITIES.join(', ')}.`,
      });
    }

    let parsedClassId: number | null = null;
    if (targetClassId !== undefined && targetClassId !== null && targetClassId !== '') {
      parsedClassId = parseInt(targetClassId, 10);
      if (isNaN(parsedClassId) || parsedClassId <= 0) {
        return res.status(400).json({ error: 'Invalid target class ID.' });
      }

      const [cls] = await db.select().from(classes).where(eq(classes.id, parsedClassId)).limit(1);
      if (!cls) {
        return res.status(404).json({ error: 'Target class not found.' });
      }

      // Teachers cannot target another teacher's class
      if (user.role === 'teacher') {
        const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
        if (!t) return res.status(403).json({ error: 'Teacher profile not found.' });

        const isClassTeacher = cls.classTeacherId === t.id;
        const isRecorder = cls.attendanceRecorderId === t.id;
        const [isSubjectTeacher] = await db
          .select({ id: classSubjects.id })
          .from(classSubjects)
          .where(and(eq(classSubjects.classId, parsedClassId), eq(classSubjects.teacherId, t.id)))
          .limit(1);

        if (!isClassTeacher && !isRecorder && !isSubjectTeacher) {
          return res.status(403).json({
            error: 'Access denied: Teachers can only publish announcements for classes they are assigned to.',
          });
        }
      }
    } else if (user.role === 'teacher') {
      // Teachers without classId must have permission or target their assigned classes
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher profile not found.' });
    }

    const [created] = await db
      .insert(announcements)
      .values({
        title: title.trim(),
        content: content.trim(),
        targetRole: effectiveRole,
        targetClassId: parsedClassId,
        priority: effectivePriority,
        authorId: user.id,
      })
      .returning();

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'ANNOUNCEMENT_POSTED',
      resource: 'announcements',
      resourceId: created.id.toString(),
      details: { title: title.trim(), targetRole: effectiveRole, targetClassId: parsedClassId, priority: effectivePriority },
      ipAddress: req.ip,
    });

    res.status(201).json(created);
  } catch (error: any) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Failed to publish announcement' });
  }
});

// ============================================================================
// 3. DELETE /api/announcements/:id - Delete announcement
// ============================================================================
announcementsRouter.delete('/:id', requireAuth, requireRole(['super_admin', 'teacher']), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = req.user!;

    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid announcement ID.' });
    }

    const [existing] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }

    if (user.role === 'teacher' && existing.authorId !== user.id) {
      return res.status(403).json({ error: 'Access denied: You can only delete announcements published by yourself.' });
    }

    await db.delete(announcements).where(eq(announcements.id, id));

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'ANNOUNCEMENT_DELETED',
      resource: 'announcements',
      resourceId: id.toString(),
      details: { title: existing.title },
      ipAddress: req.ip,
    });

    res.json({ message: 'Announcement deleted successfully.' });
  } catch (error: any) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});
