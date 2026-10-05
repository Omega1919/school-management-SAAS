import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import { teachers, users, teacherInvitations, classSubjects, classes, subjects } from '../db/schema.ts';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import {
  generateUniqueEmployeeId,
  generateSecureToken,
  hashToken,
} from '../lib/identifiers.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { eq, and, desc, or } from 'drizzle-orm';

export const teachersRouter = Router();

// 1. GET /api/teachers - List all teachers
teachersRouter.get('/', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const list = await db
      .select({
        id: teachers.id,
        userId: teachers.userId,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        employeeId: teachers.employeeId,
        specialization: teachers.specialization,
        qualification: teachers.qualification,
        status: teachers.status,
        hireDate: teachers.hireDate,
        address: teachers.address,
        permissions: teachers.permissions,
        createdAt: teachers.createdAt,
      })
      .from(teachers)
      .innerJoin(users, eq(teachers.userId, users.id))
      .orderBy(desc(teachers.createdAt));

    const formattedTeachers = list.map((t) => {
      let perms: string[] = [];
      if (t.permissions) {
        if (Array.isArray(t.permissions)) {
          perms = t.permissions;
        } else {
          try {
            perms = JSON.parse(t.permissions);
          } catch {
            perms = [];
          }
        }
      }
      return {
        ...t,
        permissions: perms,
      };
    });

    // Also fetch pending invitations (omit token hash for security)
    const pendingInvites = await db
      .select({
        id: teacherInvitations.id,
        email: teacherInvitations.email,
        fullName: teacherInvitations.fullName,
        employeeId: teacherInvitations.employeeId,
        specialization: teacherInvitations.specialization,
        expiresAt: teacherInvitations.expiresAt,
        isUsed: teacherInvitations.isUsed,
        createdAt: teacherInvitations.createdAt,
      })
      .from(teacherInvitations)
      .where(eq(teacherInvitations.isUsed, false))
      .orderBy(desc(teacherInvitations.createdAt));

    res.json({ teachers: formattedTeachers, pendingInvitations: pendingInvites });
  } catch (error: any) {
    console.error('Fetch teachers error:', error);
    res.status(500).json({ error: 'Failed to retrieve teachers' });
  }
});

// 2. POST /api/teachers/invite - Super Admin invites a new teacher
teachersRouter.post('/invite', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { email, fullName, specialization } = req.body;
    if (!email || !fullName) {
      return res.status(400).json({ error: 'Email and full name are required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user or pending invitation already exists for this email
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, cleanEmail))
      .limit(1);

    if (existingUser) {
      return res.status(400).json({ error: 'An account is already registered with this email address' });
    }

    const existingInvites = await db
      .select()
      .from(teacherInvitations)
      .where(eq(teacherInvitations.email, cleanEmail))
      .limit(1);

    if (existingInvites.length > 0 && !existingInvites[0].isUsed) {
      return res.status(400).json({ error: 'A pending invitation already exists for this email address' });
    }

    // Cryptographically secure system-generated Teacher ID (Format: TCH-XXXX-XXXX-XXXX)
    const employeeId = await generateUniqueEmployeeId();

    // Cryptographically secure random invitation token (192-bit secret)
    const rawInvitationToken = generateSecureToken('TCH-INV');
    const invitationTokenHash = hashToken(rawInvitationToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const [invitation] = await db
      .insert(teacherInvitations)
      .values({
        email: cleanEmail,
        fullName: fullName.trim(),
        employeeId,
        specialization: specialization ? specialization.trim() : null,
        invitationToken: invitationTokenHash,
        expiresAt,
        createdBy: req.user!.id,
        isUsed: false,
      })
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'TEACHER_INVITATION_CREATED',
      resource: 'teacher_invitations',
      resourceId: invitation.id.toString(),
      details: { email: cleanEmail, employeeId, fullName: fullName.trim() },
      ipAddress: req.ip,
    });

    // Return the raw token ONLY once in the creation response
    res.status(201).json({
      id: invitation.id,
      email: invitation.email,
      fullName: invitation.fullName,
      employeeId: invitation.employeeId,
      specialization: invitation.specialization,
      expiresAt: invitation.expiresAt,
      invitationToken: rawInvitationToken,
    });
  } catch (error: any) {
    console.error('Teacher invitation error:', error);
    res.status(500).json({ error: 'Failed to generate teacher invitation' });
  }
});

// 3. POST /api/teachers/invitations/:id/regenerate-token - Super Admin regenerates token
teachersRouter.post('/invitations/:id/regenerate-token', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const inviteId = parseInt(req.params.id);
    const [invite] = await db
      .select()
      .from(teacherInvitations)
      .where(and(eq(teacherInvitations.id, inviteId), eq(teacherInvitations.isUsed, false)))
      .limit(1);

    if (!invite) {
      return res.status(404).json({ error: 'Pending invitation not found or already redeemed' });
    }

    const rawInvitationToken = generateSecureToken('TCH-INV');
    const invitationTokenHash = hashToken(rawInvitationToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db
      .update(teacherInvitations)
      .set({
        invitationToken: invitationTokenHash,
        expiresAt,
      })
      .where(eq(teacherInvitations.id, inviteId));

    await logAuditEvent({
      userId: req.user!.id,
      action: 'TEACHER_INVITATION_TOKEN_REGENERATED',
      resource: 'teacher_invitations',
      resourceId: inviteId.toString(),
      ipAddress: req.ip,
    });

    res.json({
      id: invite.id,
      employeeId: invite.employeeId,
      email: invite.email,
      invitationToken: rawInvitationToken,
      expiresAt,
    });
  } catch (error: any) {
    console.error('Regenerate teacher token error:', error);
    res.status(500).json({ error: 'Failed to regenerate teacher invitation token' });
  }
});

// 3. GET /api/teachers/my-assignments - Logged-in teacher assignments
teachersRouter.get('/my-assignments', requireAuth, requireRole(['teacher']), async (req: AuthRequest, res: Response) => {
  try {
    const teacherProfile = await db
      .select()
      .from(teachers)
      .where(eq(teachers.userId, req.user!.id))
      .limit(1);

    if (teacherProfile.length === 0) {
      return res.status(404).json({ error: 'Teacher profile record not found' });
    }

    const teacherId = teacherProfile[0].id;
    const assignments = await db
      .select({
        id: classSubjects.id,
        classId: classSubjects.classId,
        className: classes.name,
        section: classes.section,
        subjectId: classSubjects.subjectId,
        subjectCode: subjects.code,
        subjectName: subjects.name,
        periodsPerWeek: classSubjects.periodsPerWeek,
      })
      .from(classSubjects)
      .innerJoin(classes, eq(classSubjects.classId, classes.id))
      .innerJoin(subjects, eq(classSubjects.subjectId, subjects.id))
      .where(eq(classSubjects.teacherId, teacherId));

    res.json({
      teacher: teacherProfile[0],
      assignments,
    });
  } catch (error: any) {
    console.error('My assignments error:', error);
    res.status(500).json({ error: 'Failed to fetch assigned classes and subjects' });
  }
});

// 4. PUT /api/teachers/:id - Update teacher profile & permissions
teachersRouter.put('/:id', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = parseInt(req.params.id);
    const { specialization, qualification, status, address, permissions } = req.body;

    let serializedPermissions: string | undefined = undefined;
    if (permissions !== undefined) {
      serializedPermissions = typeof permissions === 'string' ? permissions : JSON.stringify(permissions);
    }

    const [updated] = await db
      .update(teachers)
      .set({
        specialization: specialization || undefined,
        qualification: qualification || undefined,
        status: status || undefined,
        address: address !== undefined ? address : undefined,
        permissions: serializedPermissions !== undefined ? serializedPermissions : undefined,
      })
      .where(eq(teachers.id, teacherId))
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      action: 'TEACHER_UPDATED',
      resource: 'teachers',
      resourceId: teacherId.toString(),
      details: req.body,
      ipAddress: req.ip,
    });

    let permsArray: string[] = [];
    if (updated?.permissions) {
      try {
        permsArray = typeof updated.permissions === 'string' ? JSON.parse(updated.permissions) : updated.permissions;
      } catch {
        permsArray = [];
      }
    }

    res.json({
      ...updated,
      permissions: permsArray,
    });
  } catch (error: any) {
    console.error('Update teacher error:', error);
    res.status(500).json({ error: 'Failed to update teacher' });
  }
});

// 4b. PUT /api/teachers/:id/permissions - Super Admin updates teacher delegated admin permissions
teachersRouter.put('/:id/permissions', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = parseInt(req.params.id);
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Permissions must be provided as an array of permission keys' });
    }

    const serializedPermissions = JSON.stringify(permissions);

    const [updated] = await db
      .update(teachers)
      .set({
        permissions: serializedPermissions,
      })
      .where(eq(teachers.id, teacherId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Teacher record not found' });
    }

    await logAuditEvent({
      userId: req.user!.id,
      action: 'TEACHER_DELEGATED_PERMISSIONS_UPDATED',
      resource: 'teachers',
      resourceId: teacherId.toString(),
      details: { teacherId, permissions },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      teacherId,
      permissions,
      message: 'Staff delegated administrative permissions updated successfully',
    });
  } catch (error: any) {
    console.error('Update teacher permissions error:', error);
    res.status(500).json({ error: 'Failed to update teacher permissions' });
  }
});

// 5. GET /api/teachers/:id & GET /api/teachers/:id/overview - Detailed teacher profile with strict RBAC
const handleTeacherProfile = async (req: AuthRequest, res: Response, isOverviewOnly = false) => {
  try {
    const rawId = req.params.id;
    const numId = parseInt(rawId, 10);
    const user = req.user!;

    // STRICT SERVER-SIDE RBAC:
    // - super_admin: allowed
    // - teacher: allowed
    // - parent: denied (403)
    // - student: denied (403)
    if (user.role === 'parent' || user.role === 'student') {
      return res.status(403).json({ error: 'Access denied: You are not authorized to view faculty profiles.' });
    }
    if (user.role !== 'super_admin' && user.role !== 'teacher') {
      return res.status(403).json({ error: 'Access denied: Unauthorized role.' });
    }

    let teacherRecord: any = null;
    if (!isNaN(numId)) {
      // Find by teacher ID or user ID
      const [tById] = await db
        .select({
          id: teachers.id,
          userId: teachers.userId,
          employeeId: teachers.employeeId,
          specialization: teachers.specialization,
          qualification: teachers.qualification,
          hireDate: teachers.hireDate,
          address: teachers.address,
          status: teachers.status,
          permissions: teachers.permissions,
          createdAt: teachers.createdAt,
          fullName: users.fullName,
          email: users.email,
          phone: users.phone,
        })
        .from(teachers)
        .innerJoin(users, eq(teachers.userId, users.id))
        .where(or(eq(teachers.id, numId), eq(teachers.userId, numId)))
        .limit(1);
      teacherRecord = tById;
    } else {
      // Find by employeeId
      const [tByCode] = await db
        .select({
          id: teachers.id,
          userId: teachers.userId,
          employeeId: teachers.employeeId,
          specialization: teachers.specialization,
          qualification: teachers.qualification,
          hireDate: teachers.hireDate,
          address: teachers.address,
          status: teachers.status,
          permissions: teachers.permissions,
          createdAt: teachers.createdAt,
          fullName: users.fullName,
          email: users.email,
          phone: users.phone,
        })
        .from(teachers)
        .innerJoin(users, eq(teachers.userId, users.id))
        .where(eq(teachers.employeeId, rawId))
        .limit(1);
      teacherRecord = tByCode;
    }

    if (!teacherRecord) {
      return res.status(404).json({ error: 'Teacher record not found' });
    }

    // Parse permissions array
    let teacherPermissions: string[] = [];
    if (teacherRecord.permissions) {
      try {
        teacherPermissions = typeof teacherRecord.permissions === 'string' ? JSON.parse(teacherRecord.permissions) : teacherRecord.permissions;
      } catch {
        teacherPermissions = [];
      }
    }
    teacherRecord.permissions = teacherPermissions;

    // Fetch class teacher responsibilities
    const headClasses = await db
      .select({
        id: classes.id,
        name: classes.name,
        section: classes.section,
        gradeLevel: classes.gradeLevel,
        capacity: classes.capacity,
      })
      .from(classes)
      .where(eq(classes.classTeacherId, teacherRecord.id));

    // Fetch attendance recorder responsibilities
    const recorderClasses = await db
      .select({
        id: classes.id,
        name: classes.name,
        section: classes.section,
      })
      .from(classes)
      .where(eq(classes.attendanceRecorderId, teacherRecord.id));

    // Fetch assigned class-subjects allocations
    const subjectAllocations = await db
      .select({
        id: classSubjects.id,
        classId: classSubjects.classId,
        className: classes.name,
        section: classes.section,
        subjectId: classSubjects.subjectId,
        subjectCode: subjects.code,
        subjectName: subjects.name,
        periodsPerWeek: classSubjects.periodsPerWeek,
      })
      .from(classSubjects)
      .innerJoin(classes, eq(classSubjects.classId, classes.id))
      .innerJoin(subjects, eq(classSubjects.subjectId, subjects.id))
      .where(eq(classSubjects.teacherId, teacherRecord.id));

    // Privacy & Security Enforcement:
    // Only super_admin or the teacher themselves can see private personal information (phone, address, hireDate)
    const isSelfOrAdmin = user.role === 'super_admin' || teacherRecord.userId === user.id;

    if (isOverviewOnly) {
      return res.json({
        id: teacherRecord.id,
        employeeId: teacherRecord.employeeId,
        fullName: teacherRecord.fullName,
        specialization: teacherRecord.specialization,
        qualification: teacherRecord.qualification,
        status: teacherRecord.status,
        email: teacherRecord.email,
        phone: isSelfOrAdmin ? teacherRecord.phone : undefined,
        headClasses,
        recorderClasses,
        subjectAllocations,
      });
    }

    const profile = {
      ...teacherRecord,
      phone: isSelfOrAdmin ? teacherRecord.phone : undefined,
      address: isSelfOrAdmin ? teacherRecord.address : undefined,
      hireDate: isSelfOrAdmin ? teacherRecord.hireDate : undefined,
      headClasses,
      recorderClasses,
      subjectAllocations,
    };

    res.json(profile);
  } catch (error: any) {
    console.error('Fetch teacher details error:', error);
    res.status(500).json({ error: 'Failed to retrieve teacher profile' });
  }
};

teachersRouter.get('/:id/overview', requireAuth, (req: AuthRequest, res: Response) => handleTeacherProfile(req, res, true));
teachersRouter.get('/:id', requireAuth, (req: AuthRequest, res: Response) => handleTeacherProfile(req, res, false));

// 6. POST /api/teachers/:id/toggle-status - Deactivate / Reactivate faculty member
teachersRouter.post('/:id/toggle-status', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const teacherId = parseInt(req.params.id);
    const [teacherRecord] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1);
    if (!teacherRecord) {
      return res.status(404).json({ error: 'Teacher record not found' });
    }

    const newStatus = teacherRecord.status === 'active' ? 'suspended' : 'active';
    const [updatedTeacher] = await db
      .update(teachers)
      .set({
        status: newStatus,
      })
      .where(eq(teachers.id, teacherId))
      .returning();

    if (teacherRecord.userId) {
      await db
        .update(users)
        .set({
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(users.id, teacherRecord.userId));
    }

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: newStatus === 'suspended' ? 'TEACHER_ACCOUNT_DEACTIVATED' : 'TEACHER_ACCOUNT_ACTIVATED',
      resource: 'teachers',
      resourceId: teacherId.toString(),
      details: { previousStatus: teacherRecord.status, newStatus },
      ipAddress: req.ip,
    });

    res.json({
      message: `Teacher account successfully ${newStatus === 'suspended' ? 'deactivated' : 'reactivated'}.`,
      status: newStatus,
      teacher: updatedTeacher,
    });
  } catch (error: any) {
    console.error('Toggle teacher status error:', error);
    res.status(500).json({ error: 'Failed to update teacher account status' });
  }
});
