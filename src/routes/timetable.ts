import { Router, Response } from 'express';
import { db, withDbRetry } from '../db/index.ts';
import {
  timetables,
  timetablePeriods,
  schoolSettings,
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
import { eq, and, ne, asc, inArray } from 'drizzle-orm';

export const timetableRouter = Router();

// Standard default 8 periods template fallback
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
export const ALL_POSSIBLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export function isValidTimeFormat(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim());
}

/**
 * Returns dynamic school timetable schedule and periods from PostgreSQL database.
 */
export async function getActiveSchoolSchedule() {
  const [settings] = await db.select({ timetableDays: schoolSettings.timetableDays }).from(schoolSettings).limit(1);
  const daysList = (settings?.timetableDays ? settings.timetableDays.split(',') : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    .map((d) => d.trim())
    .filter(Boolean);

  const periods = await db
    .select()
    .from(timetablePeriods)
    .orderBy(asc(timetablePeriods.sortOrder), asc(timetablePeriods.startTime));

  if (periods.length === 0) {
    return {
      days: daysList,
      periods: STANDARD_PERIODS.map((p) => ({
        id: p.periodNumber,
        periodNumber: p.periodNumber,
        label: p.label,
        startTime: p.startTime,
        endTime: p.endTime,
        type: 'lesson',
        isTeaching: true,
        sortOrder: p.periodNumber,
        days: daysList.join(','),
      })),
    };
  }

  return {
    days: daysList,
    periods,
  };
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

    const schedule = await getActiveSchoolSchedule();

    return res.json({
      role: userRole,
      accessibleClasses,
      studentClassId: isStudentClassId,
      canEdit: userRole === 'super_admin',
      subjects: allSubjects,
      teachers: allTeachers,
      periods: schedule.periods,
      days: schedule.days,
    });
  } catch (error: any) {
    console.error('Error fetching timetable metadata:', error);
    return res.status(500).json({ error: 'Failed to retrieve timetable metadata' });
  }
});

// ============================================================================
// 1b. GET /api/timetable/periods - Returns configured schedule periods & days
// ============================================================================
timetableRouter.get('/periods', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const schedule = await getActiveSchoolSchedule();
    return res.json(schedule);
  } catch (error: any) {
    console.error('Error fetching timetable periods:', error);
    return res.status(500).json({ error: 'Failed to retrieve timetable periods.' });
  }
});

// ============================================================================
// 1c. POST /api/timetable/periods - Admin creates a new schedule period
// ============================================================================
timetableRouter.post('/periods', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { periodNumber, label, startTime, endTime, type, isTeaching, sortOrder, days } = req.body;

    if (!label || !String(label).trim()) {
      return res.status(400).json({ error: 'Period label/name is required.' });
    }

    if (!startTime || !endTime || !isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
      return res.status(400).json({ error: 'Start and end times must be in valid HH:MM 24-hour format.' });
    }

    const cleanStart = String(startTime).trim();
    const cleanEnd = String(endTime).trim();

    if (cleanStart >= cleanEnd) {
      return res.status(400).json({ error: 'Start time must be strictly before end time.' });
    }

    const periodType = type || (isTeaching === false ? 'break' : 'lesson');
    const teachingBool = isTeaching !== undefined ? Boolean(isTeaching) : periodType === 'lesson';

    const parsedPeriodNumber = periodNumber !== undefined ? parseInt(String(periodNumber), 10) : 0;
    if (isNaN(parsedPeriodNumber) || parsedPeriodNumber < 0) {
      return res.status(400).json({ error: 'Period number must be a valid non-negative number.' });
    }

    // Check for overlapping period in the same schedule
    const existingPeriods = await db.select().from(timetablePeriods);
    for (const ep of existingPeriods) {
      if (cleanStart < ep.endTime && cleanEnd > ep.startTime) {
        return res.status(400).json({
          error: `Time overlap conflict: New period (${cleanStart} - ${cleanEnd}) overlaps with existing period "${ep.label}" (${ep.startTime} - ${ep.endTime}).`,
        });
      }
    }

    // Compute sortOrder if not provided
    const computedSortOrder = sortOrder !== undefined ? parseInt(String(sortOrder), 10) : existingPeriods.length + 1;

    const [inserted] = await withDbRetry<any[]>(() =>
      db
        .insert(timetablePeriods)
        .values({
          periodNumber: parsedPeriodNumber,
          label: String(label).trim(),
          startTime: cleanStart,
          endTime: cleanEnd,
          type: periodType,
          isTeaching: teachingBool,
          sortOrder: isNaN(computedSortOrder) ? 0 : computedSortOrder,
          days: days ? String(days).trim() : 'Monday,Tuesday,Wednesday,Thursday,Friday',
        })
        .returning()
    );

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'CREATE_TIMETABLE_PERIOD',
      resource: 'timetable_periods',
      resourceId: String(inserted.id),
      details: inserted,
      ipAddress: req.ip,
    });

    return res.status(201).json({
      message: 'Schedule period created successfully.',
      period: inserted,
    });
  } catch (error: any) {
    console.error('Error creating timetable period:', error);
    return res.status(500).json({ error: 'Failed to create schedule period.' });
  }
});

// ============================================================================
// 1d. PUT /api/timetable/periods/:id - Admin updates a schedule period
// ============================================================================
timetableRouter.put('/periods/:id', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const periodId = parseInt(req.params.id, 10);
    if (isNaN(periodId) || periodId <= 0) {
      return res.status(400).json({ error: 'Invalid period ID.' });
    }

    const [existing] = await db.select().from(timetablePeriods).where(eq(timetablePeriods.id, periodId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Schedule period not found.' });
    }

    const { periodNumber, label, startTime, endTime, type, isTeaching, sortOrder, days } = req.body;

    const newStart = startTime !== undefined ? String(startTime).trim() : existing.startTime;
    const newEnd = endTime !== undefined ? String(endTime).trim() : existing.endTime;

    if (!isValidTimeFormat(newStart) || !isValidTimeFormat(newEnd)) {
      return res.status(400).json({ error: 'Start and end times must be in valid HH:MM 24-hour format.' });
    }

    if (newStart >= newEnd) {
      return res.status(400).json({ error: 'Start time must be strictly before end time.' });
    }

    const newType = type !== undefined ? type : existing.type;
    const newIsTeaching = isTeaching !== undefined ? Boolean(isTeaching) : existing.isTeaching;
    const newPeriodNum = periodNumber !== undefined ? parseInt(String(periodNumber), 10) : existing.periodNumber;

    // Check for time overlap with any other period
    const otherPeriods = await db.select().from(timetablePeriods).where(ne(timetablePeriods.id, periodId));
    for (const op of otherPeriods) {
      if (newStart < op.endTime && newEnd > op.startTime) {
        return res.status(400).json({
          error: `Time overlap conflict: Updated times (${newStart} - ${newEnd}) overlap with period "${op.label}" (${op.startTime} - ${op.endTime}).`,
        });
      }
    }

    const [updated] = await withDbRetry<any[]>(() =>
      db
        .update(timetablePeriods)
        .set({
          periodNumber: isNaN(newPeriodNum) ? existing.periodNumber : newPeriodNum,
          label: label !== undefined ? String(label).trim() : existing.label,
          startTime: newStart,
          endTime: newEnd,
          type: newType,
          isTeaching: newIsTeaching,
          sortOrder: sortOrder !== undefined ? parseInt(String(sortOrder), 10) : existing.sortOrder,
          days: days !== undefined ? String(days).trim() : existing.days,
          updatedAt: new Date(),
        })
        .where(eq(timetablePeriods.id, periodId))
        .returning()
    );

    // If times changed, sync times in existing timetable slots for this period number
    if (newStart !== existing.startTime || newEnd !== existing.endTime) {
      await db
        .update(timetables)
        .set({ startTime: newStart, endTime: newEnd, updatedAt: new Date() })
        .where(eq(timetables.periodNumber, existing.periodNumber));
    }

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'UPDATE_TIMETABLE_PERIOD',
      resource: 'timetable_periods',
      resourceId: String(periodId),
      details: { previous: existing, updated },
      ipAddress: req.ip,
    });

    return res.json({
      message: 'Schedule period updated successfully.',
      period: updated,
    });
  } catch (error: any) {
    console.error('Error updating timetable period:', error);
    return res.status(500).json({ error: 'Failed to update schedule period.' });
  }
});

// ============================================================================
// 1e. DELETE /api/timetable/periods/:id - Admin deletes a schedule period
// ============================================================================
timetableRouter.delete('/periods/:id', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const periodId = parseInt(req.params.id, 10);
    if (isNaN(periodId) || periodId <= 0) {
      return res.status(400).json({ error: 'Invalid period ID.' });
    }

    const [existing] = await db.select().from(timetablePeriods).where(eq(timetablePeriods.id, periodId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Schedule period not found.' });
    }

    // Safety check: Prevent deletion if active timetable entries exist for this period number
    const [existingSlot] = await db
      .select({ id: timetables.id, classId: timetables.classId })
      .from(timetables)
      .where(eq(timetables.periodNumber, existing.periodNumber))
      .limit(1);

    if (existingSlot) {
      return res.status(400).json({
        error: `Cannot delete "${existing.label}" (Period ${existing.periodNumber}) because active classes have scheduled lessons in it. Please remove or reassign class timetable slots first to prevent orphan records.`,
      });
    }

    await db.delete(timetablePeriods).where(eq(timetablePeriods.id, periodId));

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'DELETE_TIMETABLE_PERIOD',
      resource: 'timetable_periods',
      resourceId: String(periodId),
      details: existing,
      ipAddress: req.ip,
    });

    return res.json({
      message: `Period "${existing.label}" removed successfully.`,
    });
  } catch (error: any) {
    console.error('Error deleting timetable period:', error);
    return res.status(500).json({ error: 'Failed to delete schedule period.' });
  }
});

// ============================================================================
// 1f. PUT /api/timetable/schedule-days - Admin updates school days of week
// ============================================================================
timetableRouter.put('/schedule-days', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { days } = req.body;
    if (!Array.isArray(days) || days.length === 0) {
      return res.status(400).json({ error: 'Days must be a non-empty array of school day names.' });
    }

    const validDays = days.filter((d: string) => ALL_POSSIBLE_DAYS.includes(d as any));
    if (validDays.length === 0) {
      return res.status(400).json({ error: `Invalid days specified. Valid days are: ${ALL_POSSIBLE_DAYS.join(', ')}` });
    }

    const joinedDays = validDays.join(',');

    const [settings] = await db.select().from(schoolSettings).limit(1);
    if (settings) {
      await db
        .update(schoolSettings)
        .set({ timetableDays: joinedDays, updatedAt: new Date() })
        .where(eq(schoolSettings.id, settings.id));
    } else {
      await db.insert(schoolSettings).values({ timetableDays: joinedDays });
    }

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'UPDATE_TIMETABLE_DAYS',
      resource: 'school_settings',
      resourceId: 'timetable_days',
      details: { days: validDays },
      ipAddress: req.ip,
    });

    return res.json({
      message: 'School timetable days updated successfully.',
      days: validDays,
    });
  } catch (error: any) {
    console.error('Error updating timetable schedule days:', error);
    return res.status(500).json({ error: 'Failed to update timetable schedule days.' });
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

    // 2. VALIDATE DAY, TIME, PERIOD VALUES AGAINST CONFIGURED SCHOOL SCHEDULE
    const schedule = await getActiveSchoolSchedule();
    if (!schedule.days.includes(dayOfWeek)) {
      return res.status(400).json({
        error: `Invalid day of week '${dayOfWeek}'. Active school days are: ${schedule.days.join(', ')}.`,
      });
    }

    const cleanStart = String(startTime).trim();
    const cleanEnd = String(endTime).trim();

    if (!isValidTimeFormat(cleanStart) || !isValidTimeFormat(cleanEnd)) {
      return res.status(400).json({ error: 'Start time and End time must be in valid HH:MM 24-hour format.' });
    }

    if (cleanStart >= cleanEnd) {
      return res.status(400).json({ error: 'Start time must be strictly before end time.' });
    }

    // Verify period exists and is a valid teaching interval
    const configuredPeriod = schedule.periods.find((p: any) => p.periodNumber === parsedPeriodNumber);
    if (configuredPeriod && configuredPeriod.isTeaching === false) {
      return res.status(400).json({
        error: `Cannot schedule a lesson during non-teaching interval "${configuredPeriod.label}" (${configuredPeriod.type}).`,
      });
    }

    // 3. PREVENT CLASS DOUBLE-BOOKING (same period or overlapping time)
    const existingClassSlots = await db
      .select({ id: timetables.id, periodNumber: timetables.periodNumber, startTime: timetables.startTime, endTime: timetables.endTime })
      .from(timetables)
      .where(
        and(
          eq(timetables.classId, parsedClassId),
          eq(timetables.dayOfWeek, dayOfWeek)
        )
      );

    const classConflict = existingClassSlots.find((s) =>
      s.periodNumber === parsedPeriodNumber ||
      (cleanStart < s.endTime && cleanEnd > s.startTime)
    );

    if (classConflict) {
      return res.status(400).json({
        error: `Class booking conflict: Class ${targetClass.name} already has a scheduled lesson on ${dayOfWeek} period ${classConflict.periodNumber} (${classConflict.startTime} - ${classConflict.endTime}).`,
      });
    }

    // 4. PREVENT TEACHER DOUBLE-BOOKING (same period or overlapping time across any class)
    const existingTeacherSlots = await db
      .select({ id: timetables.id, classId: timetables.classId, periodNumber: timetables.periodNumber, startTime: timetables.startTime, endTime: timetables.endTime })
      .from(timetables)
      .where(
        and(
          eq(timetables.teacherId, parsedTeacherId),
          eq(timetables.dayOfWeek, dayOfWeek)
        )
      );

    const teacherConflict = existingTeacherSlots.find((s) =>
      s.periodNumber === parsedPeriodNumber ||
      (cleanStart < s.endTime && cleanEnd > s.startTime)
    );

    if (teacherConflict) {
      const [conflictingClass] = await db.select({ name: classes.name }).from(classes).where(eq(classes.id, teacherConflict.classId)).limit(1);
      return res.status(400).json({
        error: `Teacher booking conflict: This teacher is already scheduled for class ${conflictingClass?.name || `#${teacherConflict.classId}`} on ${dayOfWeek} period ${teacherConflict.periodNumber} (${teacherConflict.startTime} - ${teacherConflict.endTime}).`,
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

    const schedule = await getActiveSchoolSchedule();
    if (!schedule.days.includes(newDay)) {
      return res.status(400).json({ error: `Invalid day of week '${newDay}'. Active school days are: ${schedule.days.join(', ')}.` });
    }

    if (!isValidTimeFormat(newStart) || !isValidTimeFormat(newEnd)) {
      return res.status(400).json({ error: 'Start time and End time must be in valid HH:MM 24-hour format.' });
    }

    if (newStart >= newEnd) {
      return res.status(400).json({ error: 'Start time must be strictly before end time.' });
    }

    // Verify period exists and is a valid teaching interval
    const configuredPeriod = schedule.periods.find((p: any) => p.periodNumber === newPeriod);
    if (configuredPeriod && configuredPeriod.isTeaching === false) {
      return res.status(400).json({
        error: `Cannot schedule a lesson during non-teaching interval "${configuredPeriod.label}" (${configuredPeriod.type}).`,
      });
    }

    // Check duplicate class slot collision or overlapping time
    const existingClassSlots = await db
      .select({ id: timetables.id, periodNumber: timetables.periodNumber, startTime: timetables.startTime, endTime: timetables.endTime })
      .from(timetables)
      .where(
        and(
          eq(timetables.classId, newClassId),
          eq(timetables.dayOfWeek, newDay),
          ne(timetables.id, slotId)
        )
      );

    const classCollision = existingClassSlots.find((s) =>
      s.periodNumber === newPeriod ||
      (newStart < s.endTime && newEnd > s.startTime)
    );

    if (classCollision) {
      return res.status(400).json({
        error: `Class booking conflict: Class already has a scheduled lesson on ${newDay} period ${classCollision.periodNumber} (${classCollision.startTime} - ${classCollision.endTime}).`,
      });
    }

    // Check duplicate teacher booking collision or overlapping time
    const existingTeacherSlots = await db
      .select({ id: timetables.id, classId: timetables.classId, periodNumber: timetables.periodNumber, startTime: timetables.startTime, endTime: timetables.endTime })
      .from(timetables)
      .where(
        and(
          eq(timetables.teacherId, newTeacherId),
          eq(timetables.dayOfWeek, newDay),
          ne(timetables.id, slotId)
        )
      );

    const teacherCollision = existingTeacherSlots.find((s) =>
      s.periodNumber === newPeriod ||
      (newStart < s.endTime && newEnd > s.startTime)
    );

    if (teacherCollision) {
      const [conflictingClass] = await db.select({ name: classes.name }).from(classes).where(eq(classes.id, teacherCollision.classId)).limit(1);
      return res.status(400).json({
        error: `Teacher booking conflict: This teacher is already scheduled for class ${conflictingClass?.name || `#${teacherCollision.classId}`} on ${newDay} period ${teacherCollision.periodNumber} (${teacherCollision.startTime} - ${teacherCollision.endTime}).`,
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
