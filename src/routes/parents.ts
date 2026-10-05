import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import { parentStudents, students, classes, parentInvitations, users, teachers, classSubjects, fees, academicTerms, attendance } from '../db/schema.ts';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import { hashToken } from '../lib/identifiers.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { eq, and, gt, or, inArray, desc, sql } from 'drizzle-orm';

export const parentsRouter = Router();

// 1. GET /api/parents/children & /api/parents/my-children - Returns all linked students for logged-in parent
parentsRouter.get(['/children', '/my-children'], requireAuth, requireRole(['parent']), async (req: AuthRequest, res: Response) => {
  try {
    const parentUserId = req.user!.id;
    const linkedRecords = await db
      .select({
        relationshipId: parentStudents.id,
        relationship: parentStudents.relationship,
        isPrimary: parentStudents.isPrimary,
        studentId: students.id,
        studentCode: students.studentId,
        firstName: students.firstName,
        lastName: students.lastName,
        fullName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
        gender: students.gender,
        dateOfBirth: students.dateOfBirth,
        classId: students.classId,
        className: classes.name,
        admissionDate: students.admissionDate,
        address: students.address,
        status: students.status,
      })
      .from(parentStudents)
      .innerJoin(students, eq(parentStudents.studentId, students.id))
      .leftJoin(classes, eq(students.classId, classes.id))
      .where(eq(parentStudents.parentUserId, parentUserId));

    const enriched = await Promise.all(
      linkedRecords.map(async (child) => {
        const [attSummary] = await db
          .select({
            total: sql<number>`count(*)`,
            present: sql<number>`count(case when ${attendance.status} = 'Present' then 1 end)`,
          })
          .from(attendance)
          .where(eq(attendance.studentId, child.studentId));

        const totalAtt = Number(attSummary?.total || 0);
        const presentAtt = Number(attSummary?.present || 0);
        const attRate = totalAtt > 0 ? Math.round((presentAtt / totalAtt) * 100) : 98;

        const [feeSummary] = await db
          .select({
            total: sql<number>`coalesce(sum(${fees.amount}), 0)`,
            paid: sql<number>`coalesce(sum(${fees.amountPaid}), 0)`,
            balance: sql<number>`coalesce(sum(${fees.outstandingBalance}), 0)`,
          })
          .from(fees)
          .where(eq(fees.studentId, child.studentId));

        return {
          ...child,
          attendanceRate: attRate,
          totalFees: Number(feeSummary?.total || 0),
          paidFees: Number(feeSummary?.paid || 0),
          balanceFees: Number(feeSummary?.balance || 0),
        };
      })
    );

    res.json(enriched);
  } catch (error: any) {
    console.error('Fetch children error:', error);
    res.status(500).json({ error: 'Failed to retrieve linked children' });
  }
});

// 2. POST /api/parents/link-child - Link another child using invitation code (Atomic & Hashed)
parentsRouter.post('/link-child', requireAuth, requireRole(['parent']), async (req: AuthRequest, res: Response) => {
  try {
    const { invitationToken } = req.body;
    if (!invitationToken) {
      return res.status(400).json({ error: 'Invitation token is required' });
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

      // Check if already linked
      const existingLink = await tx
        .select()
        .from(parentStudents)
        .where(
          and(
            eq(parentStudents.parentUserId, req.user!.id),
            eq(parentStudents.studentId, invite.studentId)
          )
        )
        .limit(1);

      if (existingLink.length > 0) {
        throw new Error('ALREADY_LINKED');
      }

      const [newLink] = await tx
        .insert(parentStudents)
        .values({
          parentUserId: req.user!.id,
          studentId: invite.studentId,
          relationship: invite.relationship || 'Parent',
          isPrimary: false,
        })
        .returning();

      await tx
        .update(parentInvitations)
        .set({ isUsed: true })
        .where(eq(parentInvitations.id, invite.id));

      return { newLink, invite };
    });

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: 'parent',
      action: 'ADDITIONAL_CHILD_LINKED',
      resource: 'parent_students',
      resourceId: result.invite.studentId.toString(),
      ipAddress: req.ip,
    });

    res.status(201).json({ message: 'Child successfully linked to your account', link: result.newLink });
  } catch (error: any) {
    if (error.message === 'INVALID_INVITATION') {
      return res.status(400).json({ error: 'Invalid or expired invitation token' });
    }
    if (error.message === 'ALREADY_LINKED') {
      return res.status(400).json({ error: 'This child is already linked to your parent account' });
    }
    console.error('Link child error:', error);
    res.status(500).json({ error: 'Failed to link child' });
  }
});

// 3. GET /api/parents/:id - Get parent profile & linked children
parentsRouter.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rawId = req.params.id;
    const numId = parseInt(rawId, 10);
    const user = req.user!;

    if (isNaN(numId)) {
      return res.status(400).json({ error: 'Invalid parent ID' });
    }

    // Find parent user
    const [parentUser] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.id, numId), eq(users.role, 'parent')))
      .limit(1);

    if (!parentUser) {
      return res.status(404).json({ error: 'Parent record not found' });
    }

    // Find all linked children
    const linkedChildren = await db
      .select({
        studentId: students.id,
        studentCode: students.studentId,
        firstName: students.firstName,
        lastName: students.lastName,
        gender: students.gender,
        classId: students.classId,
        className: classes.name,
        relationship: parentStudents.relationship,
        isPrimary: parentStudents.isPrimary,
        status: students.status,
      })
      .from(parentStudents)
      .innerJoin(students, eq(parentStudents.studentId, students.id))
      .leftJoin(classes, eq(students.classId, classes.id))
      .where(eq(parentStudents.parentUserId, parentUser.id));

    // Role-based access control
    if (user.role === 'parent' && user.id !== parentUser.id) {
      return res.status(403).json({ error: 'Access denied: You cannot view other parent profiles.' });
    }

    if (user.role === 'student') {
      // Allow only if linked child
      const [selfStudent] = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      const isLinkedToMe = selfStudent && linkedChildren.some((c) => c.studentId === selfStudent.id);
      if (!isLinkedToMe) {
        return res.status(403).json({ error: 'Access denied: You are not authorized to view this guardian.' });
      }
    }

    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher profile not found' });

      // Teacher can access if any linked child is in teacher's classes or subjects
      const childClassIds = linkedChildren.map((c) => c.classId).filter((id): id is number => id !== null);
      if (childClassIds.length > 0) {
        const classTeacherClasses = await db.select({ id: classes.id }).from(classes).where(and(inArray(classes.id, childClassIds), or(eq(classes.classTeacherId, t.id), eq(classes.attendanceRecorderId, t.id))));
        const subjectClasses = await db.select({ id: classSubjects.classId }).from(classSubjects).where(and(inArray(classSubjects.classId, childClassIds), eq(classSubjects.teacherId, t.id)));
        const isAuthorizedTeacher = classTeacherClasses.length > 0 || subjectClasses.length > 0;
        if (!isAuthorizedTeacher) {
          return res.status(403).json({ error: 'Access denied: None of this parent s children are in your assigned classes or subjects.' });
        }
      }
    }

    let feesSummary: any = null;
    if (user.role === 'super_admin' && linkedChildren.length > 0) {
      const studentIds = linkedChildren.map((c) => c.studentId);
      const studentFees = await db
        .select({
          id: fees.id,
          studentId: fees.studentId,
          invoiceNumber: fees.invoiceNumber,
          feeTitle: fees.feeTitle,
          feeCategory: fees.feeCategory,
          amount: fees.amount,
          amountPaid: fees.amountPaid,
          outstandingBalance: fees.outstandingBalance,
          paymentStatus: fees.paymentStatus,
          dueDate: fees.dueDate,
          issuedDate: fees.issuedDate,
          termName: academicTerms.termName,
        })
        .from(fees)
        .leftJoin(academicTerms, eq(fees.termId, academicTerms.id))
        .where(inArray(fees.studentId, studentIds))
        .orderBy(desc(fees.createdAt));

      const totalBilled = studentFees.reduce((acc, f) => acc + parseFloat(f.amount || '0'), 0);
      const totalPaid = studentFees.reduce((acc, f) => acc + parseFloat(f.amountPaid || '0'), 0);
      const outstandingBalance = studentFees.reduce((acc, f) => acc + parseFloat(f.outstandingBalance || '0'), 0);

      feesSummary = {
        totalBilled: totalBilled.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        outstandingBalance: outstandingBalance.toFixed(2),
        invoices: studentFees,
      };
    }

    res.json({
      parent: parentUser,
      children: linkedChildren,
      feesSummary,
    });
  } catch (error: any) {
    console.error('Fetch parent details error:', error);
    res.status(500).json({ error: 'Failed to retrieve parent profile' });
  }
});

// 4. POST /api/parents/:id/toggle-status - Deactivate / Reactivate guardian account
parentsRouter.post('/:id/toggle-status', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const parentId = parseInt(req.params.id);
    const [parentUser] = await db.select().from(users).where(and(eq(users.id, parentId), eq(users.role, 'parent'))).limit(1);
    if (!parentUser) {
      return res.status(404).json({ error: 'Parent record not found' });
    }

    const newStatus = parentUser.status === 'active' ? 'suspended' : 'active';
    await db
      .update(users)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(users.id, parentId));

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: newStatus === 'suspended' ? 'PARENT_ACCOUNT_DEACTIVATED' : 'PARENT_ACCOUNT_ACTIVATED',
      resource: 'parents',
      resourceId: parentId.toString(),
      details: { previousStatus: parentUser.status, newStatus },
      ipAddress: req.ip,
    });

    res.json({
      message: `Parent account successfully ${newStatus === 'suspended' ? 'deactivated' : 'reactivated'}.`,
      status: newStatus,
    });
  } catch (error: any) {
    console.error('Toggle parent status error:', error);
    res.status(500).json({ error: 'Failed to update parent account status' });
  }
});
