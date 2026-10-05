import { Router, Response } from 'express';
import { db, withDbRetry } from '../db/index.ts';
import {
  timetables,
  classes,
  subjects,
  teachers,
  users,
  students,
  parentStudents,
  classSubjects,
  academicTerms,
} from '../db/schema.ts';
import { AuthRequest, requireAuth, requireRole, hasPermission, requireRoleOrPermission } from '../middleware/auth.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { eq, and, ne, asc } from 'drizzle-orm';

export const timetableRouter = Router();

// Standard 8 periods template (08:00 - 15:15 with Assembly, Morning Break & Lunch)
export const STANDARD_PERIODS = [
  { periodNumber: 1, startTime: '08:00', endTime: '08:45', label: 'Period 1' },
  { periodNumber: 2, startTime: '08:45', endTime: '09:30', label: 'Period 2' },
  { periodNumber: 3, startTime: '09:30', endTime: '10:15', label: 'Period 3' },
  { periodNumber: 4, startTime: '10:45', endTime: '11:30', label: 'Period 4' },
  { periodNumber: 5, startTime: '11:30', endTime: '12:15', label: 'Period 5' },
  { periodNumber: 6, startTime: '12:15', endTime: '13:00', label: 'Period 6' },
  { periodNumber: 7, startTime: '13:45', endTime: '14:30', label: 'Period 7' },
  { periodNumber: 8, startTime: '14:30', endTime: '15:15', label: 'Period 8' },
];

export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;

function isValidTimeFormat(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim());
}

// ============================================================================
// 1. GET /api/timetable/meta - Returns classes, subjects & sanitized teacher directory
// ============================================================================
timetableRouter.get('/meta', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.user!.role;
    const userId = req.user!.id;

    let accessibleClasses: { id: number; name: string; gradeLevel: string | null }[] = [];
    let isStudentClassId: number | null = null;

    if (userRole === 'student') {
      const [stu] = await db
        .select({ classId: students.classId })
        .from(students)
        .where(eq(students.userId, userId))
        .limit(1);

      if (stu && stu.classId) {
        isStudentClassId = stu.classId;
        const [cls] = await db
          .select({ id: classes.id, name: classes.name, gradeLevel: classes.gradeLevel })
          .from(classes)
          .where(eq(classes.id, stu.classId))
          .limit(1);
        if (cls) accessibleClasses = [cls];
      }
    } else if (userRole === 'parent') {
      const parentRows = await db
        .select({ classId: students.classId, className: classes.name, gradeLevel: classes.gradeLevel })
        .from(parentStudents)
        .innerJoin(students, eq(parentStudents.studentId, students.id))
        .innerJoin(classes, eq(students.classId, classes.id))
        .where(eq(parentStudents.parentUserId, userId));

      const uniqueMap = new Map<number, { id: number; name: string; gradeLevel: string | null }>();
      parentRows.forEach((r) => {
        if (r.classId && !uniqueMap.has(r.classId)) {
          uniqueMap.set(r.classId, { id: r.classId, name: r.className, gradeLevel: r.gradeLevel });
        }
      });
      accessibleClasses = Array.from(uniqueMap.values());
    } else if (userRole === 'teacher') {
      const [tch] = await db
        .select({ id: teachers.id })
        .from(teachers)
        .where(eq(teachers.userId, userId))
        .limit(1);

      if (tch) {
        const teacherClasses = await db
          .select({ id: classes.id, name: classes.name, gradeLevel: classes.gradeLevel })
          .from(classes)
          .where(eq(classes.classTeacherId, tch.id));

        const recorderClasses = await db
          .select({ id: classes.id, name: classes.name, gradeLevel: classes.gradeLevel })
          .from(classes)
          .where(eq(classes.attendanceRecorderId, tch.id));

        const subjectClasses = await db
          .select({ id: classes.id, name: classes.name, gradeLevel: classes.gradeLevel })
          .from(classSubjects)
          .innerJoin(classes, eq(classSubjects.classId, classes.id))
          .where(eq(classSubjects.teacherId, tch.id));

        const map = new Map<number, { id: number; name: string; gradeLevel: string | null }>();
        [...teacherClasses, ...recorderClasses, ...subjectClasses].forEach((c) => {
          if (!map.has(c.id)) map.set(c.id, c);
        });
        accessibleClasses = Array.from(map.values());
      }
    } else {
      // Super Admin: all active classes
      accessibleClasses = await db
        .select({ id: classes.id, name: classes.name, gradeLevel: classes.gradeLevel })
        .from(classes)
        .where(eq(classes.status, 'active'))
        .orderBy(asc(classes.name));
    }

    const allSubjects = await db
      .select({ id: subjects.id, code: subjects.code, name: subjects.name, category: subjects.category })
      .from(subjects)
      .orderBy(asc(subjects.name));

    // Sanitized teacher directory (excludes private phone, email, home address)
    const allTeachers = await db
      .select({
        id: teachers.id,
        employeeId: teachers.employeeId,
        specialization: teachers.specialization,
        qualification: teachers.qualification,
        fullName: users.fullName,
      })
      .from(teachers)
      .innerJoin(users, eq(teachers.userId, users.id))
      .where(eq(teachers.status, 'active'))
      .orderBy(asc(users.fullName));

    return res.json({
      role: userRole,
      accessibleClasses,
      studentClassId: isStudentClassId,
      canEdit: userRole === 'super_admin',
      subjects: allSubjects,
      teachers: allTeachers,
      periods: STANDARD_PERIODS,
      days: DAYS_OF_WEEK,
    });
  } catch (error: any) {
    console.error('Error fetching timetable metadata:', error);
    return res.status(500).json({ error: 'Failed to retrieve timetable metadata' });
  }
});

// ============================================================================
// 2. GET /api/timetable - Get timetable schedule strictly filtered by permissions
// ============================================================================
timetableRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.user!.role;
    const userId = req.user!.id;
    const requestedClassId = req.query.classId ? parseInt(req.query.classId as string, 10) : undefined;
    const dayFilter = req.query.dayOfWeek as string | undefined;

    let targetClassId = requestedClassId;

    if (userRole === 'student') {
      const [stu] = await db
        .select({ classId: students.classId })
        .from(students)
        .where(eq(students.userId, userId))
        .limit(1);

      if (!stu || !stu.classId) {
        return res.json({
          data: [],
          className: 'Unassigned',
          message: 'Student is not currently assigned to any classroom.',
        });
      }

      // Enforce student can ONLY access their own class timetable
      if (requestedClassId && requestedClassId !== stu.classId) {
        return res.status(403).json({
          error: 'Access denied: You can only view timetable for your assigned class.',
        });
      }
      targetClassId = stu.classId;
    } else if (userRole === 'parent') {
      const parentRows = await db
        .select({ classId: students.classId })
        .from(parentStudents)
        .innerJoin(students, eq(parentStudents.studentId, students.id))
        .where(eq(parentStudents.parentUserId, userId));

      const allowedClassIds = parentRows.map((r) => r.classId).filter((id): id is number => id !== null);

      if (allowedClassIds.length === 0) {
        return res.json({ data: [], message: 'No registered wards found for this parent.' });
      }

      if (targetClassId && !allowedClassIds.includes(targetClassId)) {
        return res.status(403).json({
          error: 'Access denied: You do not have permission to view this class timetable.',
        });
      }

      if (!targetClassId) {
        targetClassId = allowedClassIds[0];
      }
    } else if (userRole === 'teacher') {
      const [tch] = await db
        .select({ id: teachers.id })
        .from(teachers)
        .where(eq(teachers.userId, userId))
        .limit(1);

      if (!tch) {
        return res.status(403).json({ error: 'Teacher profile not found.' });
      }

      const teacherClasses = await db
        .select({ id: classes.id })
        .from(classes)
        .where(eq(classes.classTeacherId, tch.id));

      const recorderClasses = await db
        .select({ id: classes.id })
        .from(classes)
        .where(eq(classes.attendanceRecorderId, tch.id));

      const subjectClasses = await db
        .select({ id: classSubjects.classId })
        .from(classSubjects)
        .where(eq(classSubjects.teacherId, tch.id));

      const timetableClasses = await db
        .select({ id: timetables.classId })
        .from(timetables)
        .where(eq(timetables.teacherId, tch.id));

      const allowedSet = new Set<number>([
        ...teacherClasses.map((c) => c.id),
        ...recorderClasses.map((c) => c.id),
        ...subjectClasses.map((c) => c.id),
        ...timetableClasses.map((c) => c.id),
      ]);

      const allowedIds = Array.from(allowedSet);

      if (allowedIds.length === 0) {
        return res.json({ data: [], message: 'No classes assigned to this teacher yet.' });
      }

      if (targetClassId && !allowedSet.has(targetClassId)) {
        return res.status(403).json({
          error: 'Access denied: You are not assigned to view timetable for this class.',
        });
      }

      if (!targetClassId) {
        targetClassId = allowedIds[0];
      }
    } else {
      // Super Admin
      if (!targetClassId) {
        const [firstClass] = await db
          .select({ id: classes.id })
          .from(classes)
          .where(eq(classes.status, 'active'))
          .limit(1);
        targetClassId = firstClass?.id || 1;
      }
    }

    const [cls] = await db
      .select({ id: classes.id, name: classes.name, gradeLevel: classes.gradeLevel })
      .from(classes)
      .where(eq(classes.id, targetClassId))
      .limit(1);

    // Fetch timetable entries (sanitized, no private phone/email)
    const query = db
      .select({
        id: timetables.id,
        classId: timetables.classId,
        className: classes.name,
        subjectId: timetables.subjectId,
        subjectName: subjects.name,
        subjectCode: subjects.code,
        subjectCategory: subjects.category,
        teacherId: timetables.teacherId,
        teacherName: users.fullName,
        teacherEmployeeId: teachers.employeeId,
        dayOfWeek: timetables.dayOfWeek,
        startTime: timetables.startTime,
        endTime: timetables.endTime,
        periodNumber: timetables.periodNumber,
        room: timetables.room,
        createdAt: timetables.createdAt,
      })
      .from(timetables)
      .innerJoin(classes, eq(timetables.classId, classes.id))
      .innerJoin(subjects, eq(timetables.subjectId, subjects.id))
      .innerJoin(teachers, eq(timetables.teacherId, teachers.id))
      .innerJoin(users, eq(teachers.userId, users.id))
      .where(
        dayFilter
          ? and(eq(timetables.classId, targetClassId), eq(timetables.dayOfWeek, dayFilter))
          : eq(timetables.classId, targetClassId)
      )
      .orderBy(asc(timetables.periodNumber));

    const rows = await withDbRetry(() => query);

    return res.json({
      data: rows,
      classInfo: cls || { id: targetClassId, name: `Class #${targetClassId}` },
      canEdit: userRole === 'super_admin',
    });
  } catch (error: any) {
    console.error('Error fetching timetable:', error);
    return res.status(500).json({ error: 'Failed to retrieve class timetable' });
  }
});

// ============================================================================
// 3. POST /api/timetable - Admin creates a timetable period with collision guards
// ============================================================================
timetableRouter.post('/', requireAuth, requireRoleOrPermission(['super_admin'], 'timetable_editing'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      classId,
      subjectId,
      teacherId,
      dayOfWeek,
      startTime,
      endTime,
      periodNumber,
      room,
    } = req.body;

    if (!classId || !subjectId || !teacherId || !dayOfWeek || !startTime || !endTime) {
      return res.status(400).json({
        error: 'Class ID, Subject ID, Teacher ID, Day, Start Time, and End Time are required.',
      });
    }

    const parsedClassId = parseInt(classId, 10);
    const parsedSubjectId = parseInt(subjectId, 10);
    const parsedTeacherId = parseInt(teacherId, 10);
    const parsedPeriodNumber = periodNumber ? parseInt(periodNumber, 10) : 1;

    if (isNaN(parsedClassId) || isNaN(parsedSubjectId) || isNaN(parsedTeacherId) || isNaN(parsedPeriodNumber)) {
      return res.status(400).json({ error: 'Invalid numeric IDs provided.' });
    }

    // 1. VALIDATE CLASS, SUBJECT, AND ACTIVE TEACHER
    const [targetClass] = await db.select().from(classes).where(and(eq(classes.id, parsedClassId), eq(classes.status, 'active'))).limit(1);
    if (!targetClass) {
      return res.status(400).json({ error: `Class ID ${parsedClassId} does not exist or is not active.` });
    }

    const [targetSubject] = await db.select().from(subjects).where(eq(subjects.id, parsedSubjectId)).limit(1);
    if (!targetSubject) {
      return res.status(400).json({ error: `Subject ID ${parsedSubjectId} does not exist.` });
    }

    const [targetTeacher] = await db.select().from(teachers).where(and(eq(teachers.id, parsedTeacherId), eq(teachers.status, 'active'))).limit(1);
    if (!targetTeacher) {
      return res.status(400).json({ error: `Teacher ID ${parsedTeacherId} does not exist or is not active.` });
    }

    // 1b. REQUIRE TEACHER TO BE ACTIVELY ASSIGNED TO CLASS + SUBJECT VIA classSubjects
    const [assignedSubject] = await db
      .select({ id: classSubjects.id })
      .from(classSubjects)
      .where(
        and(
          eq(classSubjects.classId, parsedClassId),
          eq(classSubjects.subjectId, parsedSubjectId),
          eq(classSubjects.teacherId, parsedTeacherId)
        )
      )
      .limit(1);

    if (!assignedSubject) {
      return res.status(400).json({
        error: `Teacher authorization error: Teacher ID ${parsedTeacherId} is not assigned to teach subject ID ${parsedSubjectId} in class ID ${parsedClassId}. Please allocate the teacher to this subject in Subject Allocation first.`,
      });
    }

    // 2. VALIDATE DAY, TIME, PERIOD VALUES
    if (!DAYS_OF_WEEK.includes(dayOfWeek as any)) {
      return res.status(400).json({
        error: `Invalid day of week '${dayOfWeek}'. Allowed days: ${DAYS_OF_WEEK.join(', ')}.`,
      });
    }

    if (parsedPeriodNumber < 1 || parsedPeriodNumber > 10) {
      return res.status(400).json({ error: 'Period number must be between 1 and 10.' });
    }

    if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
      return res.status(400).json({ error: 'Start time and End time must be in valid HH:MM 24-hour format.' });
    }

    if (startTime >= endTime) {
      return res.status(400).json({ error: 'Start time must be strictly before end time.' });
    }

    // 3. PREVENT DUPLICATE CLASS/DAY/PERIOD SLOTS
    const [existingClassSlot] = await db
      .select({ id: timetables.id })
      .from(timetables)
      .where(
        and(
          eq(timetables.classId, parsedClassId),
          eq(timetables.dayOfWeek, dayOfWeek),
          eq(timetables.periodNumber, parsedPeriodNumber)
        )
      )
      .limit(1);

    if (existingClassSlot) {
      return res.status(400).json({
        error: `Class slot collision: Class ${targetClass.name} already has a scheduled subject on ${dayOfWeek} period ${parsedPeriodNumber}.`,
      });
    }

    // 4. PREVENT TEACHER TIME COLLISION
    const [existingTeacherSlot] = await db
      .select({ id: timetables.id, classId: timetables.classId })
      .from(timetables)
      .where(
        and(
          eq(timetables.teacherId, parsedTeacherId),
          eq(timetables.dayOfWeek, dayOfWeek),
          eq(timetables.periodNumber, parsedPeriodNumber)
        )
      )
      .limit(1);

    if (existingTeacherSlot) {
      return res.status(400).json({
        error: `Teacher booking conflict: This teacher is already scheduled for class #${existingTeacherSlot.classId} on ${dayOfWeek} period ${parsedPeriodNumber}.`,
      });
    }

    const [currentTerm] = await db
      .select({ id: academicTerms.id, sessionId: academicTerms.sessionId })
      .from(academicTerms)
      .where(eq(academicTerms.isCurrent, true))
      .limit(1);

    const [inserted] = await withDbRetry<any[]>(() =>
      db
        .insert(timetables)
        .values({
          classId: parsedClassId,
          subjectId: parsedSubjectId,
          teacherId: parsedTeacherId,
          dayOfWeek,
          startTime: startTime.trim(),
          endTime: endTime.trim(),
          periodNumber: parsedPeriodNumber,
          room: room ? String(room).trim() : 'Classroom',
          sessionId: currentTerm?.sessionId || targetClass.sessionId || null,
          termId: currentTerm?.id || null,
        })
        .returning()
    );

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'CREATE_TIMETABLE_SLOT',
      resource: 'timetables',
      resourceId: String(inserted.id),
      details: { classId: parsedClassId, subjectId: parsedSubjectId, teacherId: parsedTeacherId, dayOfWeek, periodNumber: parsedPeriodNumber },
      ipAddress: req.ip,
    });

    return res.status(201).json({
      message: 'Timetable period slot added successfully.',
      slot: inserted,
    });
  } catch (error: any) {
    console.error('Error creating timetable slot:', error);
    return res.status(500).json({ error: 'Failed to create timetable slot' });
  }
});

// ============================================================================
// 4. PUT /api/timetable/:id - Admin updates a timetable period
// ============================================================================
timetableRouter.put('/:id', requireAuth, requireRoleOrPermission(['super_admin'], 'timetable_editing'), async (req: AuthRequest, res: Response) => {
  try {
    const slotId = parseInt(req.params.id, 10);
    if (isNaN(slotId) || slotId <= 0) {
      return res.status(400).json({ error: 'Invalid timetable slot ID.' });
    }

    const [existing] = await db.select().from(timetables).where(eq(timetables.id, slotId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Timetable period not found.' });
    }

    const {
      classId,
      subjectId,
      teacherId,
      dayOfWeek,
      startTime,
      endTime,
      periodNumber,
      room,
    } = req.body;

    const newClassId = classId !== undefined ? parseInt(classId, 10) : existing.classId;
    const newSubjectId = subjectId !== undefined ? parseInt(subjectId, 10) : existing.subjectId;
    const newTeacherId = teacherId !== undefined ? parseInt(teacherId, 10) : existing.teacherId;
    const newDay = dayOfWeek || existing.dayOfWeek;
    const newStart = startTime !== undefined ? String(startTime).trim() : existing.startTime;
    const newEnd = endTime !== undefined ? String(endTime).trim() : existing.endTime;
    const newPeriod = periodNumber !== undefined ? parseInt(periodNumber, 10) : existing.periodNumber;
    const newRoom = room !== undefined ? String(room).trim() : existing.room;

    // Validate class, subject, teacher
    const [targetClass] = await db.select().from(classes).where(and(eq(classes.id, newClassId), eq(classes.status, 'active'))).limit(1);
    if (!targetClass) {
      return res.status(400).json({ error: `Class ID ${newClassId} does not exist or is not active.` });
    }

    const [targetSubject] = await db.select().from(subjects).where(eq(subjects.id, newSubjectId)).limit(1);
    if (!targetSubject) {
      return res.status(400).json({ error: `Subject ID ${newSubjectId} does not exist.` });
    }

    const [targetTeacher] = await db.select().from(teachers).where(and(eq(teachers.id, newTeacherId), eq(teachers.status, 'active'))).limit(1);
    if (!targetTeacher) {
      return res.status(400).json({ error: `Teacher ID ${newTeacherId} does not exist or is not active.` });
    }

    // Require teacher to be actively assigned to class + subject via classSubjects
    const [assignedSubject] = await db
      .select({ id: classSubjects.id })
      .from(classSubjects)
      .where(
        and(
          eq(classSubjects.classId, newClassId),
          eq(classSubjects.subjectId, newSubjectId),
          eq(classSubjects.teacherId, newTeacherId)
        )
      )
      .limit(1);

    if (!assignedSubject) {
      return res.status(400).json({
        error: `Teacher authorization error: Teacher ID ${newTeacherId} is not assigned to teach subject ID ${newSubjectId} in class ID ${newClassId}. Please allocate the teacher to this subject in Subject Allocation first.`,
      });
    }

    if (!DAYS_OF_WEEK.includes(newDay as any)) {
      return res.status(400).json({ error: `Invalid day of week '${newDay}'.` });
    }

    if (newPeriod < 1 || newPeriod > 10) {
      return res.status(400).json({ error: 'Period number must be between 1 and 10.' });
    }

    if (!isValidTimeFormat(newStart) || !isValidTimeFormat(newEnd)) {
      return res.status(400).json({ error: 'Start time and End time must be in valid HH:MM 24-hour format.' });
    }

    if (newStart >= newEnd) {
      return res.status(400).json({ error: 'Start time must be strictly before end time.' });
    }

    // Check duplicate class slot collision
    const [classCollision] = await db
      .select({ id: timetables.id })
      .from(timetables)
      .where(
        and(
          eq(timetables.classId, newClassId),
          eq(timetables.dayOfWeek, newDay),
          eq(timetables.periodNumber, newPeriod),
          ne(timetables.id, slotId)
        )
      )
      .limit(1);

    if (classCollision) {
      return res.status(400).json({
        error: `Class slot collision: Class already has a scheduled subject on ${newDay} period ${newPeriod}.`,
      });
    }

    // Check duplicate teacher booking collision
    const [teacherCollision] = await db
      .select({ id: timetables.id, classId: timetables.classId })
      .from(timetables)
      .where(
        and(
          eq(timetables.teacherId, newTeacherId),
          eq(timetables.dayOfWeek, newDay),
          eq(timetables.periodNumber, newPeriod),
          ne(timetables.id, slotId)
        )
      )
      .limit(1);

    if (teacherCollision) {
      return res.status(400).json({
        error: `Teacher booking conflict: This teacher is already scheduled for class #${teacherCollision.classId} on ${newDay} period ${newPeriod}.`,
      });
    }

    const [updated] = await withDbRetry<any[]>(() =>
      db
        .update(timetables)
        .set({
          classId: newClassId,
          subjectId: newSubjectId,
          teacherId: newTeacherId,
          dayOfWeek: newDay,
          startTime: newStart,
          endTime: newEnd,
          periodNumber: newPeriod,
          room: newRoom,
          updatedAt: new Date(),
        })
        .where(eq(timetables.id, slotId))
        .returning()
    );

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'UPDATE_TIMETABLE_SLOT',
      resource: 'timetables',
      resourceId: String(slotId),
      details: { classId: newClassId, subjectId: newSubjectId, teacherId: newTeacherId, dayOfWeek: newDay, periodNumber: newPeriod },
      ipAddress: req.ip,
    });

    return res.json({
      message: 'Timetable slot updated successfully.',
      slot: updated,
    });
  } catch (error: any) {
    console.error('Error updating timetable slot:', error);
    return res.status(500).json({ error: 'Failed to update timetable slot' });
  }
});

// ============================================================================
// 5. DELETE /api/timetable/:id - Admin deletes a timetable slot
// ============================================================================
timetableRouter.delete('/:id', requireAuth, requireRoleOrPermission(['super_admin'], 'timetable_editing'), async (req: AuthRequest, res: Response) => {
  try {
    const slotId = parseInt(req.params.id, 10);
    if (isNaN(slotId) || slotId <= 0) {
      return res.status(400).json({ error: 'Invalid timetable slot ID.' });
    }

    const [existing] = await db.select().from(timetables).where(eq(timetables.id, slotId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Timetable period not found.' });
    }

    await withDbRetry(() => db.delete(timetables).where(eq(timetables.id, slotId)));

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'DELETE_TIMETABLE_SLOT',
      resource: 'timetables',
      resourceId: String(slotId),
      ipAddress: req.ip,
    });

    return res.json({ message: 'Timetable slot deleted successfully.' });
  } catch (error: any) {
    console.error('Error deleting timetable slot:', error);
    return res.status(500).json({ error: 'Failed to delete timetable slot' });
  }
});
