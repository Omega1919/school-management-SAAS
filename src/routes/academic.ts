import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import {
  subjects,
  academicTerms,
  academicSessions,
  teachers,
  classSubjects,
  classes,
  studentEnrollments,
  departments,
  schoolSettings,
} from '../db/schema.ts';
import { AuthRequest, requireAuth, requireRole, hasPermission, requireRoleOrPermission } from '../middleware/auth.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { eq, desc, inArray, count, sql, and } from 'drizzle-orm';

export const academicRouter = Router();

// ============================================================================
// 1. ACADEMIC SESSIONS MANAGEMENT
// ============================================================================

// GET /api/academic/sessions - List all academic sessions with terms and enrollment stats
academicRouter.get('/sessions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const sessionList = await db
      .select({
        id: academicSessions.id,
        name: academicSessions.name,
        startDate: academicSessions.startDate,
        endDate: academicSessions.endDate,
        isCurrent: academicSessions.isCurrent,
        status: academicSessions.status,
        description: academicSessions.description,
        createdAt: academicSessions.createdAt,
      })
      .from(academicSessions)
      .orderBy(desc(academicSessions.startDate));

    // Enrich with terms and active class count
    const enriched = await Promise.all(
      sessionList.map(async (s) => {
        const terms = await db
          .select()
          .from(academicTerms)
          .where(eq(academicTerms.sessionId, s.id))
          .orderBy(academicTerms.termNumber);

        const [classCount] = await db
          .select({ count: count() })
          .from(classes)
          .where(eq(classes.sessionId, s.id));

        const [enrollmentCount] = await db
          .select({ count: count() })
          .from(studentEnrollments)
          .where(eq(studentEnrollments.sessionId, s.id));

        return {
          ...s,
          terms,
          totalClasses: Number(classCount?.count || 0),
          totalEnrollments: Number(enrollmentCount?.count || 0),
        };
      })
    );

    res.json(enriched);
  } catch (error: any) {
    console.error('Fetch sessions error:', error);
    res.status(500).json({ error: 'Failed to retrieve academic sessions' });
  }
});

// POST /api/academic/sessions - Create new academic session
academicRouter.post('/sessions', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, startDate, endDate, isCurrent, status, description, terms } = req.body;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ error: 'Session name (e.g. 2026/2027), start date, and end date are required' });
    }

    const cleanName = name.trim();

    // Check if session already exists
    const [existing] = await db.select().from(academicSessions).where(eq(academicSessions.name, cleanName)).limit(1);
    if (existing) {
      return res.status(400).json({ error: `Academic session "${cleanName}" already exists.` });
    }

    const createdSession = await db.transaction(async (tx) => {
      if (isCurrent) {
        await tx.update(academicSessions).set({ isCurrent: false });
      }

      const [created] = await tx
        .insert(academicSessions)
        .values({
          name: cleanName,
          startDate: startDate.trim(),
          endDate: endDate.trim(),
          isCurrent: Boolean(isCurrent),
          status: status || (isCurrent ? 'active' : 'upcoming'),
          description: description ? description.trim() : null,
        })
        .returning();

      // Automatically create default 3 terms for new session if requested
      const defaultTerms = terms && Array.isArray(terms) && terms.length > 0 ? terms : [
        { termName: 'First Term', termNumber: 1, isCurrent: Boolean(isCurrent) },
        { termName: 'Second Term', termNumber: 2, isCurrent: false },
        { termName: 'Third Term', termNumber: 3, isCurrent: false },
      ];

      for (const t of defaultTerms) {
        await tx.insert(academicTerms).values({
          sessionId: created.id,
          sessionName: created.name,
          termName: t.termName,
          termNumber: t.termNumber || 1,
          isCurrent: Boolean(t.isCurrent),
        });
      }

      return created;
    });

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'ACADEMIC_SESSION_CREATED',
      resource: 'academic_sessions',
      resourceId: createdSession.id.toString(),
      details: { name: cleanName, startDate, endDate, isCurrent },
      ipAddress: req.ip,
    });

    res.status(201).json(createdSession);
  } catch (error: any) {
    console.error('Create academic session error:', error);
    res.status(500).json({ error: 'Failed to create academic session' });
  }
});

// PUT /api/academic/sessions/:id/set-current - Set active academic session
academicRouter.put('/sessions/:id/set-current', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);

    const updated = await db.transaction(async (tx) => {
      // Unset all sessions
      await tx.update(academicSessions).set({ isCurrent: false });

      // Set target session active
      const [rec] = await tx
        .update(academicSessions)
        .set({ isCurrent: true, status: 'active', updatedAt: new Date() })
        .where(eq(academicSessions.id, sessionId))
        .returning();

      return rec;
    });

    if (!updated) {
      return res.status(404).json({ error: 'Academic session not found' });
    }

    await logAuditEvent({
      userId: req.user!.id,
      role: req.user!.role,
      action: 'CURRENT_SESSION_UPDATED',
      resource: 'academic_sessions',
      resourceId: sessionId.toString(),
      details: { name: updated.name },
      ipAddress: req.ip,
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Set current session error:', error);
    res.status(500).json({ error: 'Failed to activate academic session' });
  }
});

// PATCH /api/academic/sessions/:id - Update academic session
academicRouter.patch('/sessions/:id', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const { name, startDate, endDate, status, description, isCurrent } = req.body;

    const [existing] = await db.select().from(academicSessions).where(eq(academicSessions.id, sessionId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Academic session not found' });
    }

    const updateData: any = { updatedAt: new Date() };
    if (name) updateData.name = name.trim();
    if (startDate) updateData.startDate = startDate.trim();
    if (endDate) updateData.endDate = endDate.trim();
    if (status) updateData.status = status;
    if (description !== undefined) updateData.description = description ? description.trim() : null;

    const updated = await db.transaction(async (tx) => {
      if (isCurrent) {
        await tx.update(academicSessions).set({ isCurrent: false });
        updateData.isCurrent = true;
      }
      const [res] = await tx
        .update(academicSessions)
        .set(updateData)
        .where(eq(academicSessions.id, sessionId))
        .returning();
      return res;
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'ACADEMIC_SESSION_UPDATED',
      resource: 'academic_sessions',
      resourceId: sessionId.toString(),
      details: updateData,
      ipAddress: req.ip,
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Update session error:', error);
    res.status(500).json({ error: 'Failed to update academic session' });
  }
});

// DELETE /api/academic/sessions/:id - Safely delete or archive academic session
academicRouter.delete('/sessions/:id', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const [existing] = await db.select().from(academicSessions).where(eq(academicSessions.id, sessionId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Academic session not found' });
    }

    // Check if session has classes or enrollments
    const [cls] = await db.select({ count: count() }).from(classes).where(eq(classes.sessionId, sessionId));
    const [enr] = await db.select({ count: count() }).from(studentEnrollments).where(eq(studentEnrollments.sessionId, sessionId));

    if (Number(cls?.count || 0) > 0 || Number(enr?.count || 0) > 0) {
      return res.status(400).json({
        error: `Cannot delete session "${existing.name}": It has ${cls?.count || 0} class(es) and ${enr?.count || 0} student enrollment(s) associated with it. You can archive it instead.`,
      });
    }

    await db.transaction(async (tx) => {
      await tx.delete(academicTerms).where(eq(academicTerms.sessionId, sessionId));
      await tx.delete(academicSessions).where(eq(academicSessions.id, sessionId));
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'ACADEMIC_SESSION_DELETED',
      resource: 'academic_sessions',
      resourceId: sessionId.toString(),
      details: { name: existing.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `Academic session "${existing.name}" deleted successfully` });
  } catch (error: any) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Failed to delete academic session' });
  }
});

// ============================================================================
// 2. SUBJECTS
// ============================================================================

// GET /api/academic/subjects
academicRouter.get('/subjects', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.json([]);

      const assigned = await db
        .select({ subjectId: classSubjects.subjectId })
        .from(classSubjects)
        .where(eq(classSubjects.teacherId, t.id));

      const subjectIds = Array.from(new Set(assigned.map((a) => a.subjectId)));
      if (subjectIds.length === 0) {
        return res.json([]);
      }

      const list = await db
        .select()
        .from(subjects)
        .where(inArray(subjects.id, subjectIds as any))
        .orderBy(subjects.name);
      return res.json(list);
    }

    const list = await db.select().from(subjects).orderBy(subjects.name);
    res.json(list);
  } catch (error: any) {
    console.error('Fetch subjects error:', error);
    res.status(500).json({ error: 'Failed to retrieve subjects' });
  }
});

// POST /api/academic/subjects
academicRouter.post('/subjects', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, category } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Subject code and name are required' });
    }

    const [created] = await db
      .insert(subjects)
      .values({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        category: category || 'General',
      })
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      action: 'SUBJECT_CREATED',
      resource: 'subjects',
      resourceId: created.id.toString(),
      details: { code, name },
      ipAddress: req.ip,
    });

    res.status(201).json(created);
  } catch (error: any) {
    console.error('Create subject error:', error);
    res.status(500).json({ error: 'Failed to create subject' });
  }
});

// PATCH /api/academic/subjects/:id - Update subject
academicRouter.patch('/subjects/:id', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const subjectId = parseInt(req.params.id);
    const { code, name, category } = req.body;

    const [existing] = await db.select().from(subjects).where(eq(subjects.id, subjectId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    const updateData: any = {};
    if (code) updateData.code = code.trim().toUpperCase();
    if (name) updateData.name = name.trim();
    if (category) updateData.category = category.trim();

    const [updated] = await db
      .update(subjects)
      .set(updateData)
      .where(eq(subjects.id, subjectId))
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      action: 'SUBJECT_UPDATED',
      resource: 'subjects',
      resourceId: subjectId.toString(),
      details: updateData,
      ipAddress: req.ip,
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Update subject error:', error);
    res.status(500).json({ error: 'Failed to update subject' });
  }
});

// DELETE /api/academic/subjects/:id - Safely delete subject
academicRouter.delete('/subjects/:id', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const subjectId = parseInt(req.params.id);
    const [existing] = await db.select().from(subjects).where(eq(subjects.id, subjectId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Check if allocated to classes
    const [alloc] = await db.select({ count: count() }).from(classSubjects).where(eq(classSubjects.subjectId, subjectId));
    if (Number(alloc?.count || 0) > 0) {
      return res.status(400).json({
        error: `Cannot delete subject "${existing.name}": It is allocated in ${alloc?.count || 0} class section(s). Remove the class-subject allocations first.`,
      });
    }

    await db.delete(subjects).where(eq(subjects.id, subjectId));

    await logAuditEvent({
      userId: req.user!.id,
      action: 'SUBJECT_DELETED',
      resource: 'subjects',
      resourceId: subjectId.toString(),
      details: { code: existing.code, name: existing.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `Subject "${existing.name}" deleted successfully` });
  } catch (error: any) {
    console.error('Delete subject error:', error);
    res.status(500).json({ error: 'Failed to delete subject' });
  }
});

// ============================================================================
// 3. ACADEMIC TERMS
// ============================================================================

// GET /api/academic/terms
academicRouter.get('/terms', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : undefined;
    
    const query = db
      .select({
        id: academicTerms.id,
        sessionId: academicTerms.sessionId,
        sessionName: academicTerms.sessionName,
        termName: academicTerms.termName,
        termNumber: academicTerms.termNumber,
        isCurrent: academicTerms.isCurrent,
        startDate: academicTerms.startDate,
        endDate: academicTerms.endDate,
        createdAt: academicTerms.createdAt,
      })
      .from(academicTerms);

    if (sessionId) {
      query.where(eq(academicTerms.sessionId, sessionId));
    }

    const list = await query.orderBy(desc(academicTerms.createdAt));
    res.json(list);
  } catch (error: any) {
    console.error('Fetch terms error:', error);
    res.status(500).json({ error: 'Failed to retrieve academic terms' });
  }
});

// POST /api/academic/terms
academicRouter.post('/terms', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId, sessionName, termName, termNumber, isCurrent, startDate, endDate } = req.body;
    if (!termName) {
      return res.status(400).json({ error: 'Term name is required' });
    }

    let targetSessionId = sessionId ? parseInt(sessionId) : undefined;
    let targetSessionName = sessionName;

    if (targetSessionId) {
      const [s] = await db.select().from(academicSessions).where(eq(academicSessions.id, targetSessionId)).limit(1);
      if (s) targetSessionName = s.name;
    } else if (targetSessionName) {
      const [s] = await db.select().from(academicSessions).where(eq(academicSessions.name, targetSessionName)).limit(1);
      if (s) targetSessionId = s.id;
    } else {
      const [cur] = await db.select().from(academicSessions).where(eq(academicSessions.isCurrent, true)).limit(1);
      if (cur) {
        targetSessionId = cur.id;
        targetSessionName = cur.name;
      }
    }

    const created = await db.transaction(async (tx) => {
      if (isCurrent) {
        await tx.update(academicTerms).set({ isCurrent: false });
      }

      const [c] = await tx
        .insert(academicTerms)
        .values({
          sessionId: targetSessionId || null,
          sessionName: targetSessionName || '2026/2027',
          termName: termName.trim(),
          termNumber: termNumber ? parseInt(termNumber) : 1,
          isCurrent: Boolean(isCurrent),
          startDate: startDate || null,
          endDate: endDate || null,
        })
        .returning();

      return c;
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'ACADEMIC_TERM_CREATED',
      resource: 'academic_terms',
      resourceId: created.id.toString(),
      details: { sessionName: targetSessionName, termName },
      ipAddress: req.ip,
    });

    res.status(201).json(created);
  } catch (error: any) {
    console.error('Create academic term error:', error);
    res.status(500).json({ error: 'Failed to create academic term' });
  }
});

// PUT /api/academic/terms/:id/set-current
academicRouter.put('/terms/:id/set-current', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const termId = parseInt(req.params.id);

    const updated = await db.transaction(async (tx) => {
      // Unset all
      await tx.update(academicTerms).set({ isCurrent: false });

      // Set selected
      const [rec] = await tx
        .update(academicTerms)
        .set({ isCurrent: true })
        .where(eq(academicTerms.id, termId))
        .returning();

      return rec;
    });

    if (!updated) {
      return res.status(404).json({ error: 'Academic term not found' });
    }

    await logAuditEvent({
      userId: req.user!.id,
      action: 'CURRENT_TERM_UPDATED',
      resource: 'academic_terms',
      resourceId: termId.toString(),
      ipAddress: req.ip,
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Set current term error:', error);
    res.status(500).json({ error: 'Failed to update active term' });
  }
});

// PATCH /api/academic/terms/:id - Update term/semester details
academicRouter.patch('/terms/:id', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const termId = parseInt(req.params.id);
    const { termName, termNumber, startDate, endDate, isCurrent } = req.body;

    const [existing] = await db.select().from(academicTerms).where(eq(academicTerms.id, termId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Academic term not found' });
    }

    const updateData: any = {};
    if (termName) updateData.termName = termName.trim();
    if (termNumber) updateData.termNumber = parseInt(termNumber);
    if (startDate !== undefined) updateData.startDate = startDate || null;
    if (endDate !== undefined) updateData.endDate = endDate || null;

    const updated = await db.transaction(async (tx) => {
      if (isCurrent) {
        await tx.update(academicTerms).set({ isCurrent: false });
        updateData.isCurrent = true;
      }
      const [rec] = await tx
        .update(academicTerms)
        .set(updateData)
        .where(eq(academicTerms.id, termId))
        .returning();
      return rec;
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'ACADEMIC_TERM_UPDATED',
      resource: 'academic_terms',
      resourceId: termId.toString(),
      details: updateData,
      ipAddress: req.ip,
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Update term error:', error);
    res.status(500).json({ error: 'Failed to update academic term' });
  }
});

// DELETE /api/academic/terms/:id - Safely delete term
academicRouter.delete('/terms/:id', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const termId = parseInt(req.params.id);
    const [existing] = await db.select().from(academicTerms).where(eq(academicTerms.id, termId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Academic term not found' });
    }

    await db.delete(academicTerms).where(eq(academicTerms.id, termId));

    await logAuditEvent({
      userId: req.user!.id,
      action: 'ACADEMIC_TERM_DELETED',
      resource: 'academic_terms',
      resourceId: termId.toString(),
      details: { termName: existing.termName, sessionName: existing.sessionName },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `Term "${existing.termName}" deleted successfully` });
  } catch (error: any) {
    console.error('Delete term error:', error);
    res.status(500).json({ error: 'Failed to delete academic term' });
  }
});

// ============================================================================
// 4. DEPARTMENTS & PROGRAMMES (Institution-Agnostic)
// ============================================================================

// GET /api/academic/departments - List all departments/programmes
academicRouter.get('/departments', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const list = await db
      .select({
        id: departments.id,
        code: departments.code,
        name: departments.name,
        description: departments.description,
        status: departments.status,
        createdAt: departments.createdAt,
      })
      .from(departments)
      .orderBy(departments.name);

    // Enrich with class count
    const enriched = await Promise.all(
      list.map(async (dept) => {
        const [clsCount] = await db
          .select({ count: count() })
          .from(classes)
          .where(eq(classes.departmentId, dept.id));
        return {
          ...dept,
          totalClasses: Number(clsCount?.count || 0),
        };
      })
    );

    res.json(enriched);
  } catch (error: any) {
    console.error('Fetch departments error:', error);
    res.status(500).json({ error: 'Failed to retrieve departments' });
  }
});

// POST /api/academic/departments - Create department/programme
academicRouter.post('/departments', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, description, status } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Department code and name are required' });
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();

    const [existing] = await db.select().from(departments).where(eq(departments.code, cleanCode)).limit(1);
    if (existing) {
      return res.status(400).json({ error: `Department with code "${cleanCode}" already exists` });
    }

    const [created] = await db
      .insert(departments)
      .values({
        code: cleanCode,
        name: cleanName,
        description: description ? description.trim() : null,
        status: status || 'active',
      })
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      action: 'DEPARTMENT_CREATED',
      resource: 'departments',
      resourceId: created.id.toString(),
      details: { code: cleanCode, name: cleanName },
      ipAddress: req.ip,
    });

    res.status(201).json(created);
  } catch (error: any) {
    console.error('Create department error:', error);
    res.status(500).json({ error: 'Failed to create department' });
  }
});

// PATCH /api/academic/departments/:id - Update department
academicRouter.patch('/departments/:id', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const deptId = parseInt(req.params.id);
    const { code, name, description, status } = req.body;

    const [existing] = await db.select().from(departments).where(eq(departments.id, deptId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const updateData: any = { updatedAt: new Date() };
    if (code) updateData.code = code.trim().toUpperCase();
    if (name) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description ? description.trim() : null;
    if (status) updateData.status = status;

    const [updated] = await db
      .update(departments)
      .set(updateData)
      .where(eq(departments.id, deptId))
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      action: 'DEPARTMENT_UPDATED',
      resource: 'departments',
      resourceId: deptId.toString(),
      details: updateData,
      ipAddress: req.ip,
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Update department error:', error);
    res.status(500).json({ error: 'Failed to update department' });
  }
});

// DELETE /api/academic/departments/:id - Delete department
academicRouter.delete('/departments/:id', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const deptId = parseInt(req.params.id);
    const [existing] = await db.select().from(departments).where(eq(departments.id, deptId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Department not found' });
    }

    // Check if classes reference this department
    const [cls] = await db.select({ count: count() }).from(classes).where(eq(classes.departmentId, deptId));
    if (Number(cls?.count || 0) > 0) {
      return res.status(400).json({
        error: `Cannot delete department "${existing.name}": ${cls?.count || 0} class section(s) are assigned to it. Reassign or archive the department instead.`,
      });
    }

    await db.delete(departments).where(eq(departments.id, deptId));

    await logAuditEvent({
      userId: req.user!.id,
      action: 'DEPARTMENT_DELETED',
      resource: 'departments',
      resourceId: deptId.toString(),
      details: { code: existing.code, name: existing.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `Department "${existing.name}" deleted successfully` });
  } catch (error: any) {
    console.error('Delete department error:', error);
    res.status(500).json({ error: 'Failed to delete department' });
  }
});

// ============================================================================
// 5. PUBLIC ACADEMIC STRUCTURE (No Auth Required - For Public Admissions)
// ============================================================================

// GET /api/academic/public/structure
academicRouter.get('/public/structure', async (_req, res: Response) => {
  try {
    const [settingsList, activeSessions, activeDepartments, activeClasses] = await Promise.all([
      db.select({
        schoolName: schoolSettings.schoolName,
        motto: schoolSettings.motto,
        termSystem: schoolSettings.termSystem,
        levelSystem: schoolSettings.levelSystem,
      }).from(schoolSettings).limit(1),

      db.select({
        id: academicSessions.id,
        name: academicSessions.name,
        startDate: academicSessions.startDate,
        endDate: academicSessions.endDate,
        isCurrent: academicSessions.isCurrent,
        status: academicSessions.status,
      }).from(academicSessions).where(inArray(academicSessions.status, ['active', 'upcoming'])).orderBy(desc(academicSessions.isCurrent), desc(academicSessions.startDate)),

      db.select({
        id: departments.id,
        code: departments.code,
        name: departments.name,
        description: departments.description,
      }).from(departments).where(eq(departments.status, 'active')).orderBy(departments.name),

      db.select({
        id: classes.id,
        name: classes.name,
        section: classes.section,
        gradeLevel: classes.gradeLevel,
        sessionId: classes.sessionId,
        departmentId: classes.departmentId,
        capacity: classes.capacity,
        status: classes.status,
      }).from(classes).where(eq(classes.status, 'active')).orderBy(classes.name),
    ]);

    const settings = settingsList[0] || {
      schoolName: 'School Management System',
      motto: 'Integrated Academic & Administrative Platform',
      termSystem: 'term',
      levelSystem: 'class',
    };

    res.json({
      settings,
      sessions: activeSessions,
      departments: activeDepartments,
      classes: activeClasses,
    });
  } catch (error: any) {
    console.error('Fetch public academic structure error:', error);
    res.status(500).json({ error: 'Failed to retrieve academic structure' });
  }
});
