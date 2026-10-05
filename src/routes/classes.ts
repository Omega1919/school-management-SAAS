import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import { classes, subjects, classSubjects, teachers, users, students, parentStudents, academicSessions, departments, studentEnrollments } from '../db/schema.ts';
import { AuthRequest, requireAuth, requireRole, hasPermission, requireRoleOrPermission } from '../middleware/auth.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { eq, sql, desc, count, inArray, and, or, aliasedTable } from 'drizzle-orm';

export const classesRouter = Router();

// 1. GET /api/classes - List classes with strict role scoping and session support
classesRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    let allowedClassIds: number[] | null = null;
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : undefined;

    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) {
        return res.json([]);
      }

      const classTeacherClasses = await db.select({ id: classes.id }).from(classes).where(eq(classes.classTeacherId, t.id));
      const recorderClasses = await db.select({ id: classes.id }).from(classes).where(eq(classes.attendanceRecorderId, t.id));
      const subjectClasses = await db.select({ id: classSubjects.classId }).from(classSubjects).where(eq(classSubjects.teacherId, t.id));

      const classIdSet = new Set<number>([
        ...classTeacherClasses.map((c) => c.id),
        ...recorderClasses.map((c) => c.id),
        ...subjectClasses.map((c) => c.id),
      ]);

      allowedClassIds = Array.from(classIdSet);
      if (allowedClassIds.length === 0) {
        return res.json([]);
      }
    } else if (user.role === 'student') {
      const [s] = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      if (!s || !s.classId) {
        return res.json([]);
      }
      allowedClassIds = [s.classId];
    } else if (user.role === 'parent') {
      const linked = await db
        .select({ classId: students.classId })
        .from(parentStudents)
        .innerJoin(students, eq(parentStudents.studentId, students.id))
        .where(eq(parentStudents.parentUserId, user.id));

      const validClassIds = linked.map((l) => l.classId).filter((cid): cid is number => cid !== null);
      allowedClassIds = Array.from(new Set(validClassIds));
      if (allowedClassIds.length === 0) {
        return res.json([]);
      }
    }

    const conditions = [];
    if (allowedClassIds !== null) {
      conditions.push(inArray(classes.id, allowedClassIds));
    }
    if (sessionId) {
      conditions.push(eq(classes.sessionId, sessionId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const ctTeacher = aliasedTable(teachers, 'ct_teacher');
    const ctUser = aliasedTable(users, 'ct_user');
    const arTeacher = aliasedTable(teachers, 'ar_teacher');
    const arUser = aliasedTable(users, 'ar_user');

    const query = db
      .select({
        id: classes.id,
        name: classes.name,
        section: classes.section,
        gradeLevel: classes.gradeLevel,
        sessionId: classes.sessionId,
        sessionName: academicSessions.name,
        departmentId: classes.departmentId,
        departmentName: departments.name,
        departmentCode: departments.code,
        capacity: classes.capacity,
        classTeacherId: classes.classTeacherId,
        classTeacherName: ctUser.fullName,
        attendanceRecorderId: classes.attendanceRecorderId,
        attendanceRecorderName: arUser.fullName,
        status: classes.status,
        studentCount: count(students.id),
      })
      .from(classes)
      .leftJoin(academicSessions, eq(classes.sessionId, academicSessions.id))
      .leftJoin(departments, eq(classes.departmentId, departments.id))
      .leftJoin(ctTeacher, eq(classes.classTeacherId, ctTeacher.id))
      .leftJoin(ctUser, eq(ctTeacher.userId, ctUser.id))
      .leftJoin(arTeacher, eq(classes.attendanceRecorderId, arTeacher.id))
      .leftJoin(arUser, eq(arTeacher.userId, arUser.id))
      .leftJoin(students, eq(classes.id, students.classId))
      .where(whereClause)
      .groupBy(classes.id, academicSessions.name, departments.name, departments.code, ctUser.fullName, arUser.fullName)
      .orderBy(classes.name);

    const list = await query;

    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      const sanitized = list.map((c) => {
        const isCT = Boolean(t && c.classTeacherId === t.id);
        const isAR = Boolean(t && c.attendanceRecorderId === t.id);
        return {
          ...c,
          classTeacherName: c.classTeacherName,
          attendanceRecorderName: c.attendanceRecorderName,
          isClassTeacher: isCT,
          isAttendanceRecorder: isAR,
          canRecordAttendance: isCT || isAR,
        };
      });
      return res.json(sanitized);
    }

    const withPerms = list.map((c) => ({
      ...c,
      isClassTeacher: user.role === 'super_admin',
      isAttendanceRecorder: user.role === 'super_admin',
      canRecordAttendance: user.role === 'super_admin',
    }));

    res.json(withPerms);
  } catch (error: any) {
    console.error('Fetch classes error:', error);
    res.status(500).json({ error: 'Failed to retrieve classes' });
  }
});

// 2. POST /api/classes - Create new class tied to academic session
classesRouter.post('/', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, section, gradeLevel, sessionId, departmentId, capacity, classTeacherId, attendanceRecorderId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Class name is required' });
    }

    let parsedDepartmentId: number | null = null;
    if (departmentId !== undefined && departmentId !== null && departmentId !== '') {
      parsedDepartmentId = parseInt(departmentId, 10);
      if (isNaN(parsedDepartmentId) || parsedDepartmentId <= 0) {
        return res.status(400).json({ error: 'Invalid department ID' });
      }
      const [d] = await db.select().from(departments).where(eq(departments.id, parsedDepartmentId)).limit(1);
      if (!d) {
        return res.status(400).json({ error: `Department ID ${parsedDepartmentId} does not exist.` });
      }
    }

    let parsedClassTeacherId: number | null = null;
    if (classTeacherId !== undefined && classTeacherId !== null && classTeacherId !== '') {
      parsedClassTeacherId = parseInt(classTeacherId, 10);
      if (isNaN(parsedClassTeacherId) || parsedClassTeacherId <= 0) {
        return res.status(400).json({ error: 'Invalid class teacher ID' });
      }
      const [t] = await db.select().from(teachers).where(and(eq(teachers.id, parsedClassTeacherId), eq(teachers.status, 'active'))).limit(1);
      if (!t) {
        return res.status(400).json({ error: `Invalid Class Teacher: Teacher ID ${parsedClassTeacherId} does not exist or is not active.` });
      }
    }

    let parsedRecorderId: number | null = null;
    if (attendanceRecorderId !== undefined && attendanceRecorderId !== null && attendanceRecorderId !== '') {
      parsedRecorderId = parseInt(attendanceRecorderId, 10);
      if (isNaN(parsedRecorderId) || parsedRecorderId <= 0) {
        return res.status(400).json({ error: 'Invalid attendance recorder ID' });
      }
      const [t] = await db.select().from(teachers).where(and(eq(teachers.id, parsedRecorderId), eq(teachers.status, 'active'))).limit(1);
      if (!t) {
        return res.status(400).json({ error: `Invalid Attendance Recorder: Teacher ID ${parsedRecorderId} does not exist or is not active.` });
      }
    }

    let targetSessionId = sessionId ? parseInt(sessionId) : null;
    if (!targetSessionId) {
      const [cur] = await db.select().from(academicSessions).where(eq(academicSessions.isCurrent, true)).limit(1);
      if (cur) targetSessionId = cur.id;
    }

    const [created] = await db
      .insert(classes)
      .values({
        name: name.trim(),
        section: section ? section.trim() : null,
        gradeLevel: gradeLevel ? gradeLevel.trim() : null,
        sessionId: targetSessionId,
        departmentId: parsedDepartmentId,
        capacity: capacity ? parseInt(capacity) : 40,
        classTeacherId: parsedClassTeacherId,
        attendanceRecorderId: parsedRecorderId,
        status: 'active',
      })
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'CLASS_CREATED',
      resource: 'classes',
      resourceId: created.id.toString(),
      details: { name, section, sessionId: targetSessionId, departmentId: parsedDepartmentId, classTeacherId: parsedClassTeacherId, attendanceRecorderId: parsedRecorderId },
      ipAddress: req.ip,
    });

    res.status(201).json(created);
  } catch (error: any) {
    console.error('Create class error:', error);
    res.status(500).json({ error: 'Failed to create class' });
  }
});

// 2b. PATCH /api/classes/:id - Update class details, assign Class Teacher or Attendance Recorder
classesRouter.patch('/:id', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.id);
    const { name, section, gradeLevel, sessionId, departmentId, capacity, classTeacherId, attendanceRecorderId, status } = req.body;

    const [existing] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (section !== undefined) updateData.section = section ? section.trim() : null;
    if (gradeLevel !== undefined) updateData.gradeLevel = gradeLevel ? gradeLevel.trim() : null;
    if (sessionId !== undefined) updateData.sessionId = sessionId ? parseInt(sessionId) : null;
    if (capacity !== undefined) updateData.capacity = parseInt(capacity);

    if (departmentId !== undefined) {
      if (departmentId === null || departmentId === '') {
        updateData.departmentId = null;
      } else {
        const parsed = parseInt(departmentId, 10);
        if (isNaN(parsed) || parsed <= 0) {
          return res.status(400).json({ error: 'Invalid department ID' });
        }
        const [d] = await db.select().from(departments).where(eq(departments.id, parsed)).limit(1);
        if (!d) {
          return res.status(400).json({ error: `Department ID ${parsed} does not exist.` });
        }
        updateData.departmentId = parsed;
      }
    }

    if (classTeacherId !== undefined) {
      if (classTeacherId === null || classTeacherId === '') {
        updateData.classTeacherId = null;
      } else {
        const parsed = parseInt(classTeacherId, 10);
        if (isNaN(parsed) || parsed <= 0) {
          return res.status(400).json({ error: 'Invalid class teacher ID' });
        }
        const [t] = await db.select().from(teachers).where(and(eq(teachers.id, parsed), eq(teachers.status, 'active'))).limit(1);
        if (!t) {
          return res.status(400).json({ error: `Invalid Class Teacher: Teacher ID ${parsed} does not exist or is not active.` });
        }
        updateData.classTeacherId = parsed;
      }
    }

    if (attendanceRecorderId !== undefined) {
      if (attendanceRecorderId === null || attendanceRecorderId === '') {
        updateData.attendanceRecorderId = null;
      } else {
        const parsed = parseInt(attendanceRecorderId, 10);
        if (isNaN(parsed) || parsed <= 0) {
          return res.status(400).json({ error: 'Invalid attendance recorder ID' });
        }
        const [t] = await db.select().from(teachers).where(and(eq(teachers.id, parsed), eq(teachers.status, 'active'))).limit(1);
        if (!t) {
          return res.status(400).json({ error: `Invalid Attendance Recorder: Teacher ID ${parsed} does not exist or is not active.` });
        }
        updateData.attendanceRecorderId = parsed;
      }
    }

    if (status !== undefined) updateData.status = status;

    const [updated] = await db
      .update(classes)
      .set(updateData)
      .where(eq(classes.id, classId))
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'CLASS_UPDATED',
      resource: 'classes',
      resourceId: classId.toString(),
      details: updateData,
      ipAddress: req.ip,
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Update class error:', error);
    res.status(500).json({ error: 'Failed to update class' });
  }
});

// 3. GET /api/classes/:id - Class details with subjects and roster
classesRouter.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.id);
    const user = req.user!;

    const ctTeacher = aliasedTable(teachers, 'ct_t');
    const ctUser = aliasedTable(users, 'ct_u');
    const arTeacher = aliasedTable(teachers, 'ar_t');
    const arUser = aliasedTable(users, 'ar_u');

    const classRecord = await db
      .select({
        id: classes.id,
        name: classes.name,
        section: classes.section,
        gradeLevel: classes.gradeLevel,
        sessionId: classes.sessionId,
        sessionName: academicSessions.name,
        capacity: classes.capacity,
        classTeacherId: classes.classTeacherId,
        classTeacherName: ctUser.fullName,
        attendanceRecorderId: classes.attendanceRecorderId,
        attendanceRecorderName: arUser.fullName,
        status: classes.status,
      })
      .from(classes)
      .leftJoin(academicSessions, eq(classes.sessionId, academicSessions.id))
      .leftJoin(ctTeacher, eq(classes.classTeacherId, ctTeacher.id))
      .leftJoin(ctUser, eq(ctTeacher.userId, ctUser.id))
      .leftJoin(arTeacher, eq(classes.attendanceRecorderId, arTeacher.id))
      .leftJoin(arUser, eq(arTeacher.userId, arUser.id))
      .where(eq(classes.id, classId))
      .limit(1);

    if (classRecord.length === 0) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Role-based access verification
    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher record not found' });

      const isClassTeacher = classRecord[0].classTeacherId === t.id;
      const isAttendanceRecorder = classRecord[0].attendanceRecorderId === t.id;
      const [subjectTeacher] = await db
        .select({ id: classSubjects.id })
        .from(classSubjects)
        .where(and(eq(classSubjects.classId, classId), eq(classSubjects.teacherId, t.id)))
        .limit(1);

      if (!isClassTeacher && !isAttendanceRecorder && !subjectTeacher) {
        return res.status(403).json({ error: 'Access denied: You are not assigned to this class.' });
      }
    } else if (user.role === 'student') {
      const [s] = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      if (!s || s.classId !== classId) {
        return res.status(403).json({ error: 'Access denied: You are not enrolled in this class.' });
      }
    } else if (user.role === 'parent') {
      const linked = await db
        .select({ studentId: students.id })
        .from(parentStudents)
        .innerJoin(students, eq(parentStudents.studentId, students.id))
        .where(and(eq(parentStudents.parentUserId, user.id), eq(students.classId, classId)))
        .limit(1);
      if (linked.length === 0) {
        return res.status(403).json({ error: 'Access denied: You do not have children enrolled in this class.' });
      }
    }

    // Allocated subjects
    const subjectWhereClauses = [eq(classSubjects.classId, classId)];
    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (t) {
        subjectWhereClauses.push(eq(classSubjects.teacherId, t.id));
      }
    }

    const allocatedSubjects = await db
      .select({
        id: classSubjects.id,
        subjectId: subjects.id,
        subjectCode: subjects.code,
        subjectName: subjects.name,
        category: subjects.category,
        teacherId: classSubjects.teacherId,
        teacherName: users.fullName,
        periodsPerWeek: classSubjects.periodsPerWeek,
      })
      .from(classSubjects)
      .innerJoin(subjects, eq(classSubjects.subjectId, subjects.id))
      .leftJoin(teachers, eq(classSubjects.teacherId, teachers.id))
      .leftJoin(users, eq(teachers.userId, users.id))
      .where(and(...subjectWhereClauses));

    let enrolledStudents: any[] = [];
    if (user.role === 'super_admin' || user.role === 'teacher') {
      enrolledStudents = await db
        .select({
          id: students.id,
          studentId: students.studentId,
          firstName: students.firstName,
          lastName: students.lastName,
          gender: students.gender,
          status: students.status,
        })
        .from(students)
        .where(eq(students.classId, classId))
        .orderBy(students.lastName, students.firstName);
    } else if (user.role === 'parent') {
      enrolledStudents = await db
        .select({
          id: students.id,
          studentId: students.studentId,
          firstName: students.firstName,
          lastName: students.lastName,
          gender: students.gender,
          status: students.status,
        })
        .from(parentStudents)
        .innerJoin(students, eq(parentStudents.studentId, students.id))
        .where(and(eq(parentStudents.parentUserId, user.id), eq(students.classId, classId)))
        .orderBy(students.lastName, students.firstName);
    }

    let isClassTeacher = user.role === 'super_admin';
    let isAttendanceRecorder = user.role === 'super_admin';
    let canRecordAttendance = user.role === 'super_admin';

    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (t) {
        isClassTeacher = classRecord[0].classTeacherId === t.id;
        isAttendanceRecorder = classRecord[0].attendanceRecorderId === t.id;
        canRecordAttendance = isClassTeacher || isAttendanceRecorder;
      }
    }

    res.json({
      class: {
        ...classRecord[0],
        isClassTeacher,
        isAttendanceRecorder,
        canRecordAttendance,
      },
      subjects: allocatedSubjects,
      students: enrolledStudents,
    });
  } catch (error: any) {
    console.error('Get class details error:', error);
    res.status(500).json({ error: 'Failed to retrieve class details' });
  }
});

// 4. POST /api/classes/:id/subjects - Assign subject and teacher to class
classesRouter.post('/:id/subjects', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.id);
    const { subjectId, teacherId, periodsPerWeek } = req.body;

    if (!subjectId) {
      return res.status(400).json({ error: 'Subject is required' });
    }

    const [allocated] = await db
      .insert(classSubjects)
      .values({
        classId,
        subjectId: parseInt(subjectId),
        teacherId: teacherId ? parseInt(teacherId) : null,
        periodsPerWeek: periodsPerWeek ? parseInt(periodsPerWeek) : 4,
      })
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      action: 'CLASS_SUBJECT_ASSIGNED',
      resource: 'class_subjects',
      details: { classId, subjectId, teacherId },
      ipAddress: req.ip,
    });

    res.status(201).json(allocated);
  } catch (error: any) {
    console.error('Assign subject error:', error);
    res.status(500).json({ error: 'Failed to assign subject to class' });
  }
});

// 5. DELETE /api/classes/:id/subjects/:subjectId - Remove subject allocation from class
classesRouter.delete('/:id/subjects/:subjectId', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.id);
    const subjectId = parseInt(req.params.subjectId);

    const [deleted] = await db
      .delete(classSubjects)
      .where(and(eq(classSubjects.classId, classId), eq(classSubjects.subjectId, subjectId)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Subject allocation not found for this class' });
    }

    await logAuditEvent({
      userId: req.user!.id,
      action: 'CLASS_SUBJECT_REMOVED',
      resource: 'class_subjects',
      details: { classId, subjectId },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Subject removed from class successfully' });
  } catch (error: any) {
    console.error('Remove class subject error:', error);
    res.status(500).json({ error: 'Failed to remove subject from class' });
  }
});

// 6. DELETE /api/classes/:id - Delete class section
classesRouter.delete('/:id', requireAuth, requireRoleOrPermission(['super_admin'], 'class_management'), async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.id);
    const [existing] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Verify no students or active enrollments
    const [stu] = await db.select({ count: count() }).from(students).where(eq(students.classId, classId));
    const [enr] = await db.select({ count: count() }).from(studentEnrollments).where(eq(studentEnrollments.classId, classId));

    if (Number(stu?.count || 0) > 0 || Number(enr?.count || 0) > 0) {
      return res.status(400).json({
        error: `Cannot delete class "${existing.name}": ${stu?.count || 0} student(s) and ${enr?.count || 0} enrollment record(s) are attached to it. Please reassign students or archive the class.`,
      });
    }

    await db.transaction(async (tx) => {
      await tx.delete(classSubjects).where(eq(classSubjects.classId, classId));
      await tx.delete(classes).where(eq(classes.id, classId));
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'CLASS_DELETED',
      resource: 'classes',
      resourceId: classId.toString(),
      details: { name: existing.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `Class "${existing.name}" deleted successfully` });
  } catch (error: any) {
    console.error('Delete class error:', error);
    res.status(500).json({ error: 'Failed to delete class' });
  }
});
