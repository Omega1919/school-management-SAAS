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
import { sql, eq, and, ne, asc, inArray } from 'drizzle-orm';

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
  if (typeof time !== 'string') return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim());
}

/**
 * Validates that an input array or comma-separated list of weekdays contains valid, non-empty, unique weekdays.
 */
export function parseDayList(daysInput: unknown): { days: string[]; error?: string } {
  const rawList = Array.isArray(daysInput)
    ? daysInput
    : typeof daysInput === 'string'
    ? daysInput.split(',')
    : [];

  const trimmed = rawList.map((d) => String(d).trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return { days: [], error: 'At least one active weekday must be specified.' };
  }

  const seen = new Set<string>();
  for (const day of trimmed) {
    if (!ALL_POSSIBLE_DAYS.includes(day as any)) {
      return { days: [], error: `Invalid weekday '${day}'. Supported weekdays are: ${ALL_POSSIBLE_DAYS.join(', ')}.` };
    }
    if (seen.has(day)) {
      return { days: [], error: `Duplicate weekday '${day}' in days list.` };
    }
    seen.add(day);
  }

  return { days: trimmed };
}

/**
 * Determines whether two period schedules overlap.
 * Touching boundaries (e.g. 08:00–09:00 and 09:00–10:00) do NOT overlap.
 * Periods on disjoint days do NOT overlap.
 */
export function periodsOverlap(
  startA: string,
  endA: string,
  daysA: string[],
  startB: string,
  endB: string,
  daysB: string[]
): boolean {
  const sharesDay = daysA.some((d) => daysB.includes(d));
  if (!sharesDay) return false;
  return startA < endB && endA > startB;
}

/**
 * Returns dynamic school timetable schedule and periods from PostgreSQL database.
 */
export async function getActiveSchoolSchedule(tx?: any) {
  const runner = tx || db;
  const [settings] = await runner
    .select({ id: schoolSettings.id, timetableDays: schoolSettings.timetableDays })
    .from(schoolSettings)
    .orderBy(asc(schoolSettings.id))
    .limit(1);
  const daysList = (settings?.timetableDays ? settings.timetableDays.split(',') : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    .map((d: string) => d.trim())
    .filter(Boolean);

  const periods = await runner
    .select()
    .from(timetablePeriods)
    .orderBy(asc(timetablePeriods.sortOrder), asc(timetablePeriods.startTime));

  if (periods.length === 0) {
    return {
      schoolId: settings?.id,
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
    schoolId: settings?.id,
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
      return res.status(400).json({ error: 'Start time must be strictly before end time. Overnight schedules are not supported.' });
    }

    if (periodNumber === undefined || periodNumber === null || String(periodNumber).trim() === '') {
      return res.status(400).json({ error: 'Period number is required.' });
    }

    const parsedPeriodNumber = Number(periodNumber);
    if (!Number.isInteger(parsedPeriodNumber) || parsedPeriodNumber < 0) {
      return res.status(400).json({ error: 'Period number must be a valid non-negative integer.' });
    }

    // Parse and validate days against supported weekdays
    const activeSchedule = await getActiveSchoolSchedule();
    const periodDaysResult: { days: string[]; error?: string } = days !== undefined
      ? parseDayList(days)
      : { days: activeSchedule.days };

    if (periodDaysResult.error) {
      return res.status(400).json({ error: periodDaysResult.error });
    }
    const validatedDays = periodDaysResult.days;

    const periodType = type || (isTeaching === false ? 'break' : 'lesson');
    const teachingBool = isTeaching !== undefined ? Boolean(isTeaching) : (periodType === 'lesson');

    // Concurrency safe insert inside transaction with advisory lock
    const insertedResult = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('timetable_periods_lock'))`);

      const existingPeriods = await tx.select().from(timetablePeriods);

      for (const ep of existingPeriods) {
        const epDays = (ep.days ? ep.days.split(',') : []).map((d: string) => d.trim()).filter(Boolean);
        if (periodsOverlap(cleanStart, cleanEnd, validatedDays, ep.startTime, ep.endTime, epDays)) {
          const common = validatedDays.filter((d) => epDays.includes(d));
          return {
            error: `Time overlap conflict: New period (${cleanStart} - ${cleanEnd}) overlaps with existing period "${ep.label}" (${ep.startTime} - ${ep.endTime}) on ${common.join(', ')}.`,
          };
        }
        if (ep.periodNumber === parsedPeriodNumber && validatedDays.some((d) => epDays.includes(d))) {
          const common = validatedDays.filter((d) => epDays.includes(d));
          return {
            error: `Period number ${parsedPeriodNumber} is already in use by "${ep.label}" on ${common.join(', ')}.`,
          };
        }
      }

      const computedSortOrder = sortOrder !== undefined ? Number(sortOrder) : existingPeriods.length + 1;

      const [row] = await tx
        .insert(timetablePeriods)
        .values({
          periodNumber: parsedPeriodNumber,
          label: String(label).trim(),
          startTime: cleanStart,
          endTime: cleanEnd,
          type: periodType,
          isTeaching: teachingBool,
          sortOrder: isNaN(computedSortOrder) ? 0 : computedSortOrder,
          days: validatedDays.join(','),
        })
        .returning();

      return { period: row };
    });

    if ('error' in insertedResult && insertedResult.error) {
      return res.status(400).json({ error: insertedResult.error });
    }

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'CREATE_TIMETABLE_PERIOD',
      resource: 'timetable_periods',
      resourceId: String(insertedResult.period.id),
      details: insertedResult.period,
      ipAddress: req.ip,
    });

    return res.status(201).json({
      message: 'Schedule period created successfully.',
      period: insertedResult.period,
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

    const { periodNumber, label, startTime, endTime, type, isTeaching, sortOrder, days } = req.body;

    const updatedResult = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('timetable_periods_lock'))`);

      const [existing] = await tx.select().from(timetablePeriods).where(eq(timetablePeriods.id, periodId)).limit(1);
      if (!existing) {
        return { notFound: true };
      }

      const newStart = startTime !== undefined ? String(startTime).trim() : existing.startTime;
      const newEnd = endTime !== undefined ? String(endTime).trim() : existing.endTime;

      if (!isValidTimeFormat(newStart) || !isValidTimeFormat(newEnd)) {
        return { error: 'Start and end times must be in valid HH:MM 24-hour format.' };
      }

      if (newStart >= newEnd) {
        return { error: 'Start time must be strictly before end time. Overnight schedules are not supported.' };
      }

      let newPeriodNum = existing.periodNumber;
      if (periodNumber !== undefined) {
        if (periodNumber === null || String(periodNumber).trim() === '') {
          return { error: 'Period number cannot be empty.' };
        }
        const pNum = Number(periodNumber);
        if (!Number.isInteger(pNum) || pNum < 0) {
          return { error: 'Period number must be a valid non-negative integer.' };
        }
        newPeriodNum = pNum;
      }

      let validatedDays: string[];
      if (days !== undefined) {
        const parseRes = parseDayList(days);
        if (parseRes.error) return { error: parseRes.error };
        validatedDays = parseRes.days;
      } else {
        validatedDays = (existing.days ? existing.days.split(',') : []).map((d: string) => d.trim()).filter(Boolean);
      }

      const newType = type !== undefined ? type : existing.type;
      const newIsTeaching = isTeaching !== undefined ? Boolean(isTeaching) : (newType === 'lesson' ? existing.isTeaching : false);

      // Check existing scheduled lessons for this period
      const existingLessons = await tx
        .select({ id: timetables.id, dayOfWeek: timetables.dayOfWeek, startTime: timetables.startTime, endTime: timetables.endTime })
        .from(timetables)
        .where(eq(timetables.periodNumber, existing.periodNumber));

      if (existingLessons.length > 0) {
        // Prevent changing to non-teaching if active lessons exist
        if (!newIsTeaching || newType !== 'lesson') {
          return {
            error: `Cannot change period "${existing.label}" to non-teaching because ${existingLessons.length} scheduled lesson(s) reference it.`,
          };
        }
        // Prevent removing days where active lessons exist
        const removedDays = existingLessons
          .map((l) => l.dayOfWeek)
          .filter((d) => !validatedDays.includes(d));
        if (removedDays.length > 0) {
          return {
            error: `Cannot remove day(s) ${Array.from(new Set(removedDays)).join(', ')} from period "${existing.label}" because active lessons are scheduled on those days.`,
          };
        }
      }

      // Check for time and number overlaps with any other period
      const otherPeriods = await tx.select().from(timetablePeriods).where(ne(timetablePeriods.id, periodId));
      for (const op of otherPeriods) {
        const opDays = (op.days ? op.days.split(',') : []).map((d: string) => d.trim()).filter(Boolean);
        if (periodsOverlap(newStart, newEnd, validatedDays, op.startTime, op.endTime, opDays)) {
          const common = validatedDays.filter((d) => opDays.includes(d));
          return {
            error: `Time overlap conflict: Updated times (${newStart} - ${newEnd}) overlap with period "${op.label}" (${op.startTime} - ${op.endTime}) on ${common.join(', ')}.`,
          };
        }
        if (op.periodNumber === newPeriodNum && validatedDays.some((d) => opDays.includes(d))) {
          const common = validatedDays.filter((d) => opDays.includes(d));
          return {
            error: `Period number ${newPeriodNum} is already used by "${op.label}" on ${common.join(', ')}.`,
          };
        }
      }

      const [updated] = await tx
        .update(timetablePeriods)
        .set({
          periodNumber: newPeriodNum,
          label: label !== undefined ? String(label).trim() : existing.label,
          startTime: newStart,
          endTime: newEnd,
          type: newType,
          isTeaching: newIsTeaching,
          sortOrder: sortOrder !== undefined ? Number(sortOrder) : existing.sortOrder,
          days: validatedDays.join(','),
          updatedAt: new Date(),
        })
        .where(eq(timetablePeriods.id, periodId))
        .returning();

      // If period number or times changed, sync in existing timetable slots
      if (newPeriodNum !== existing.periodNumber || newStart !== existing.startTime || newEnd !== existing.endTime) {
        await tx
          .update(timetables)
          .set({
            periodNumber: newPeriodNum,
            startTime: newStart,
            endTime: newEnd,
            updatedAt: new Date(),
          })
          .where(eq(timetables.periodNumber, existing.periodNumber));
      }

      return { updated, existing };
    });

    if ('notFound' in updatedResult && updatedResult.notFound) {
      return res.status(404).json({ error: 'Schedule period not found.' });
    }
    if ('error' in updatedResult && updatedResult.error) {
      return res.status(400).json({ error: updatedResult.error });
    }

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'UPDATE_TIMETABLE_PERIOD',
      resource: 'timetable_periods',
      resourceId: String(periodId),
      details: { previous: updatedResult.existing, updated: updatedResult.updated },
      ipAddress: req.ip,
    });

    return res.json({
      message: 'Schedule period updated successfully.',
      period: updatedResult.updated,
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

    const deleteResult = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('timetable_periods_lock'))`);

      const [existing] = await tx.select().from(timetablePeriods).where(eq(timetablePeriods.id, periodId)).limit(1);
      if (!existing) {
        return { notFound: true };
      }

      // Safety check: Prevent deletion if active timetable entries exist for this period number
      const [existingSlot] = await tx
        .select({ id: timetables.id, classId: timetables.classId })
        .from(timetables)
        .where(eq(timetables.periodNumber, existing.periodNumber))
        .limit(1);

      if (existingSlot) {
        return {
          error: `Cannot delete "${existing.label}" (Period ${existing.periodNumber}) because active classes have scheduled lessons in it. Please remove or reassign class timetable slots first to prevent orphan records.`,
        };
      }

      await tx.delete(timetablePeriods).where(eq(timetablePeriods.id, periodId));
      return { existing };
    });

    if ('notFound' in deleteResult && deleteResult.notFound) {
      return res.status(404).json({ error: 'Schedule period not found.' });
    }
    if ('error' in deleteResult && deleteResult.error) {
      return res.status(400).json({ error: deleteResult.error });
    }

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'DELETE_TIMETABLE_PERIOD',
      resource: 'timetable_periods',
      resourceId: String(periodId),
      details: deleteResult.existing,
      ipAddress: req.ip,
    });

    return res.json({
      message: `Period "${deleteResult.existing.label}" removed successfully.`,
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

    const parseRes = parseDayList(days);
    if (parseRes.error) {
      return res.status(400).json({ error: parseRes.error });
    }
    const validDays = parseRes.days;

    const result = await db.transaction(async (tx) => {
      const [settings] = await tx.select().from(schoolSettings).limit(1);
      const currentDays = (
        settings?.timetableDays
          ? settings.timetableDays.split(',')
          : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
      )
        .map((d: string) => d.trim())
        .filter(Boolean);

      const disabledDays = currentDays.filter((d: string) => !validDays.includes(d));
      if (disabledDays.length > 0) {
        const [existingLesson] = await tx
          .select({ id: timetables.id, dayOfWeek: timetables.dayOfWeek })
          .from(timetables)
          .where(inArray(timetables.dayOfWeek, disabledDays))
          .limit(1);

        if (existingLesson) {
          return {
            error: `Cannot disable '${existingLesson.dayOfWeek}' because active class lessons are scheduled on this day. Please remove or reassign those timetable lessons first.`,
          };
        }
      }

      const joinedDays = validDays.join(',');
      if (settings) {
        await tx
          .update(schoolSettings)
          .set({ timetableDays: joinedDays, updatedAt: new Date() })
          .where(eq(schoolSettings.id, settings.id));
      } else {
        await tx.insert(schoolSettings).values({ timetableDays: joinedDays });
      }

      return { success: true };
    });

    if ('error' in result && result.error) {
      return res.status(400).json({ error: result.error });
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
      schoolId,
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

    // Strict validation of periodNumber - zero is a valid period number!
    if (periodNumber === undefined || periodNumber === null || String(periodNumber).trim() === '') {
      return res.status(400).json({ error: 'Period number is required.' });
    }
    const parsedPeriodNumber = Number(periodNumber);
    if (!Number.isInteger(parsedPeriodNumber) || parsedPeriodNumber < 0) {
      return res.status(400).json({ error: 'Period number must be a valid non-negative integer.' });
    }

    const parsedClassId = Number(classId);
    const parsedSubjectId = Number(subjectId);
    const parsedTeacherId = Number(teacherId);

    if (
      !Number.isInteger(parsedClassId) || parsedClassId <= 0 ||
      !Number.isInteger(parsedSubjectId) || parsedSubjectId <= 0 ||
      !Number.isInteger(parsedTeacherId) || parsedTeacherId <= 0
    ) {
      return res.status(400).json({ error: 'Invalid numeric IDs provided.' });
    }

    const cleanDay = String(dayOfWeek).trim();
    if (!ALL_POSSIBLE_DAYS.includes(cleanDay as any)) {
      return res.status(400).json({ error: `Invalid day of week '${cleanDay}'. Supported weekdays are: ${ALL_POSSIBLE_DAYS.join(', ')}.` });
    }

    const cleanStart = String(startTime).trim();
    const cleanEnd = String(endTime).trim();

    if (!isValidTimeFormat(cleanStart) || !isValidTimeFormat(cleanEnd)) {
      return res.status(400).json({ error: 'Start time and End time must be in valid HH:MM 24-hour format.' });
    }

    if (cleanStart >= cleanEnd) {
      return res.status(400).json({ error: 'Start time must be strictly before end time. Overnight schedules are not supported.' });
    }

    // Execute in transaction with lock & validation
    const transactionResult = await db.transaction(async (tx) => {
      // 0. Validate school if provided
      if (schoolId !== undefined && schoolId !== null) {
        const parsedSchoolId = Number(schoolId);
        if (!Number.isInteger(parsedSchoolId) || parsedSchoolId <= 0) {
          return { error: 'Selected school ID must be a positive integer.' };
        }
        const [targetSchool] = await tx
          .select({ id: schoolSettings.id })
          .from(schoolSettings)
          .where(eq(schoolSettings.id, parsedSchoolId))
          .limit(1);
        if (!targetSchool) {
          return { error: 'Selected school ID is invalid or does not match current school configuration.' };
        }
      }

      // Concurrency lock: lock class and teacher rows to prevent concurrent race conditions
      await tx.execute(sql`SELECT id FROM classes WHERE id = ${parsedClassId} FOR UPDATE`);
      await tx.execute(sql`SELECT id FROM teachers WHERE id = ${parsedTeacherId} FOR UPDATE`);

      // 1. VALIDATE CLASS, SUBJECT, TEACHER
      const [targetClass] = await tx.select().from(classes).where(and(eq(classes.id, parsedClassId), eq(classes.status, 'active'))).limit(1);
      if (!targetClass) {
        return { error: `Class ID ${parsedClassId} does not exist or is not active.` };
      }

      const [targetSubject] = await tx.select().from(subjects).where(eq(subjects.id, parsedSubjectId)).limit(1);
      if (!targetSubject) {
        return { error: `Subject ID ${parsedSubjectId} does not exist.` };
      }

      const [targetTeacher] = await tx.select().from(teachers).where(and(eq(teachers.id, parsedTeacherId), eq(teachers.status, 'active'))).limit(1);
      if (!targetTeacher) {
        return { error: `Teacher ID ${parsedTeacherId} does not exist or is not active.` };
      }

      // 2. REQUIRE TEACHER ALLOCATED TO CLASS + SUBJECT
      const [assignedSubject] = await tx
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
        return {
          error: `Teacher authorization error: Teacher ID ${parsedTeacherId} is not assigned to teach subject ID ${parsedSubjectId} in class ID ${parsedClassId}. Please allocate the teacher to this subject in Subject Allocation first.`,
        };
      }

      // 3. VALIDATE ACTIVE SCHOOL SCHEDULE AND PERIOD
      const schedule = await getActiveSchoolSchedule(tx);
      if (!schedule.days.includes(cleanDay)) {
        return { error: `Day '${cleanDay}' is not an active school day. Active school days are: ${schedule.days.join(', ')}.` };
      }

      const matchingPeriods = schedule.periods.filter((p: any) => p.periodNumber === parsedPeriodNumber);
      if (matchingPeriods.length === 0) {
        return { error: `Period ${parsedPeriodNumber} does not exist in the configured timetable schedule.` };
      }

      const configuredPeriod =
        matchingPeriods.find((p: any) => {
          const pDays = (p.days ? p.days.split(',') : []).map((d: string) => d.trim()).filter(Boolean);
          return pDays.length === 0 || pDays.includes(cleanDay);
        }) || matchingPeriods[0];

      if (!configuredPeriod.isTeaching || configuredPeriod.type !== 'lesson') {
        return {
          error: `Cannot schedule a lesson during non-teaching interval "${configuredPeriod.label}" (${configuredPeriod.type}).`,
        };
      }

      const periodDays = (configuredPeriod.days ? configuredPeriod.days.split(',') : []).map((d: string) => d.trim()).filter(Boolean);
      if (periodDays.length > 0 && !periodDays.includes(cleanDay)) {
        return {
          error: `Period ${parsedPeriodNumber} ("${configuredPeriod.label}") is not configured to run on ${cleanDay}. Configured days for this period: ${periodDays.join(', ')}.`,
        };
      }

      // Ensure lesson start/end times fall within configured period
      if (cleanStart < configuredPeriod.startTime || cleanEnd > configuredPeriod.endTime) {
        return {
          error: `Lesson time (${cleanStart} - ${cleanEnd}) falls outside the configured teaching period "${configuredPeriod.label}" (${configuredPeriod.startTime} - ${configuredPeriod.endTime}).`,
        };
      }

      // 4. ACADEMIC SESSION / TERM SCOPE
      const [currentTerm] = await tx
        .select({ id: academicTerms.id, sessionId: academicTerms.sessionId })
        .from(academicTerms)
        .where(eq(academicTerms.isCurrent, true))
        .limit(1);

      const targetTermId = currentTerm?.id || null;
      const targetSessionId = currentTerm?.sessionId || targetClass.sessionId || null;

      // 5. PREVENT CLASS CONFLICT (same period or overlapping time on same day and term)
      const existingClassSlots = await tx
        .select({
          id: timetables.id,
          periodNumber: timetables.periodNumber,
          startTime: timetables.startTime,
          endTime: timetables.endTime,
          termId: timetables.termId,
        })
        .from(timetables)
        .where(
          and(
            eq(timetables.classId, parsedClassId),
            eq(timetables.dayOfWeek, cleanDay)
          )
        );

      const classConflict = existingClassSlots.find((s) => {
        const termMatches = !targetTermId || !s.termId || s.termId === targetTermId;
        if (!termMatches) return false;
        return s.periodNumber === parsedPeriodNumber || (cleanStart < s.endTime && cleanEnd > s.startTime);
      });

      if (classConflict) {
        return {
          error: `Class booking conflict: Class ${targetClass.name} already has a scheduled lesson on ${cleanDay} period ${classConflict.periodNumber} (${classConflict.startTime} - ${classConflict.endTime}).`,
        };
      }

      // 6. PREVENT TEACHER CONFLICT (same period or overlapping time across any class on same day and term)
      const existingTeacherSlots = await tx
        .select({
          id: timetables.id,
          classId: timetables.classId,
          periodNumber: timetables.periodNumber,
          startTime: timetables.startTime,
          endTime: timetables.endTime,
          termId: timetables.termId,
        })
        .from(timetables)
        .where(
          and(
            eq(timetables.teacherId, parsedTeacherId),
            eq(timetables.dayOfWeek, cleanDay)
          )
        );

      const teacherConflict = existingTeacherSlots.find((s) => {
        const termMatches = !targetTermId || !s.termId || s.termId === targetTermId;
        if (!termMatches) return false;
        return s.periodNumber === parsedPeriodNumber || (cleanStart < s.endTime && cleanEnd > s.startTime);
      });

      if (teacherConflict) {
        const [conflictingClass] = await tx.select({ name: classes.name }).from(classes).where(eq(classes.id, teacherConflict.classId)).limit(1);
        return {
          error: `Teacher booking conflict: This teacher is already scheduled for class ${conflictingClass?.name || '#' + teacherConflict.classId} on ${cleanDay} period ${teacherConflict.periodNumber} (${teacherConflict.startTime} - ${teacherConflict.endTime}).`,
        };
      }

      // 7. INSERT TIMETABLE SLOT
      const [inserted] = await tx
        .insert(timetables)
        .values({
          classId: parsedClassId,
          subjectId: parsedSubjectId,
          teacherId: parsedTeacherId,
          dayOfWeek: cleanDay,
          startTime: cleanStart,
          endTime: cleanEnd,
          periodNumber: parsedPeriodNumber,
          room: room ? String(room).trim() : 'Classroom',
          sessionId: targetSessionId,
          termId: targetTermId,
        })
        .returning();

      return {
        slot: inserted,
        classId: parsedClassId,
        subjectId: parsedSubjectId,
        teacherId: parsedTeacherId,
        dayOfWeek: cleanDay,
        periodNumber: parsedPeriodNumber,
      };
    });

    if ('error' in transactionResult && transactionResult.error) {
      return res.status(400).json({ error: transactionResult.error });
    }

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'CREATE_TIMETABLE_SLOT',
      resource: 'timetables',
      resourceId: String(transactionResult.slot.id),
      details: {
        classId: transactionResult.classId,
        subjectId: transactionResult.subjectId,
        teacherId: transactionResult.teacherId,
        dayOfWeek: transactionResult.dayOfWeek,
        periodNumber: transactionResult.periodNumber,
      },
      ipAddress: req.ip,
    });

    return res.status(201).json({
      message: 'Timetable period slot added successfully.',
      slot: transactionResult.slot,
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

    const {
      schoolId,
      classId,
      subjectId,
      teacherId,
      dayOfWeek,
      startTime,
      endTime,
      periodNumber,
      room,
    } = req.body;

    const transactionResult = await db.transaction(async (tx) => {
      // 0. Lookup existing slot
      const [existing] = await tx.select().from(timetables).where(eq(timetables.id, slotId)).limit(1);
      if (!existing) {
        return { notFound: true };
      }

      // 0b. Validate school if provided
      if (schoolId !== undefined && schoolId !== null) {
        const parsedSchoolId = Number(schoolId);
        if (!Number.isInteger(parsedSchoolId) || parsedSchoolId <= 0) {
          return { error: 'Selected school ID must be a positive integer.' };
        }
        const [targetSchool] = await tx
          .select({ id: schoolSettings.id })
          .from(schoolSettings)
          .where(eq(schoolSettings.id, parsedSchoolId))
          .limit(1);
        if (!targetSchool) {
          return { error: 'Selected school ID is invalid or does not match current school configuration.' };
        }
      }

      const newClassId = classId !== undefined ? Number(classId) : existing.classId;
      const newSubjectId = subjectId !== undefined ? Number(subjectId) : existing.subjectId;
      const newTeacherId = teacherId !== undefined ? Number(teacherId) : existing.teacherId;

      if (
        !Number.isInteger(newClassId) || newClassId <= 0 ||
        !Number.isInteger(newSubjectId) || newSubjectId <= 0 ||
        !Number.isInteger(newTeacherId) || newTeacherId <= 0
      ) {
        return { error: 'Invalid numeric IDs provided.' };
      }

      let newPeriodNum = existing.periodNumber;
      if (periodNumber !== undefined) {
        if (periodNumber === null || String(periodNumber).trim() === '') {
          return { error: 'Period number cannot be empty.' };
        }
        const pNum = Number(periodNumber);
        if (!Number.isInteger(pNum) || pNum < 0) {
          return { error: 'Period number must be a valid non-negative integer.' };
        }
        newPeriodNum = pNum;
      }

      const newDay = dayOfWeek !== undefined ? String(dayOfWeek).trim() : existing.dayOfWeek;
      if (!ALL_POSSIBLE_DAYS.includes(newDay as any)) {
        return { error: `Invalid day of week '${newDay}'. Supported weekdays are: ${ALL_POSSIBLE_DAYS.join(', ')}.` };
      }

      const newStart = startTime !== undefined ? String(startTime).trim() : existing.startTime;
      const newEnd = endTime !== undefined ? String(endTime).trim() : existing.endTime;

      if (!isValidTimeFormat(newStart) || !isValidTimeFormat(newEnd)) {
        return { error: 'Start time and End time must be in valid HH:MM 24-hour format.' };
      }

      if (newStart >= newEnd) {
        return { error: 'Start time must be strictly before end time. Overnight schedules are not supported.' };
      }

      const newRoom = room !== undefined ? String(room).trim() : existing.room;

      // Concurrency locks on class and teacher
      await tx.execute(sql`SELECT id FROM classes WHERE id = ${newClassId} FOR UPDATE`);
      await tx.execute(sql`SELECT id FROM teachers WHERE id = ${newTeacherId} FOR UPDATE`);

      // Validate class, subject, teacher
      const [targetClass] = await tx.select().from(classes).where(and(eq(classes.id, newClassId), eq(classes.status, 'active'))).limit(1);
      if (!targetClass) {
        return { error: `Class ID ${newClassId} does not exist or is not active.` };
      }

      const [targetSubject] = await tx.select().from(subjects).where(eq(subjects.id, newSubjectId)).limit(1);
      if (!targetSubject) {
        return { error: `Subject ID ${newSubjectId} does not exist.` };
      }

      const [targetTeacher] = await tx.select().from(teachers).where(and(eq(teachers.id, newTeacherId), eq(teachers.status, 'active'))).limit(1);
      if (!targetTeacher) {
        return { error: `Teacher ID ${newTeacherId} does not exist or is not active.` };
      }

      // Require teacher to be actively assigned to class + subject via classSubjects
      const [assignedSubject] = await tx
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
        return {
          error: `Teacher authorization error: Teacher ID ${newTeacherId} is not assigned to teach subject ID ${newSubjectId} in class ID ${newClassId}. Please allocate the teacher to this subject in Subject Allocation first.`,
        };
      }

      const schedule = await getActiveSchoolSchedule(tx);
      if (!schedule.days.includes(newDay)) {
        return { error: `Day '${newDay}' is not an active school day. Active school days are: ${schedule.days.join(', ')}.` };
      }

      const matchingPeriods = schedule.periods.filter((p: any) => p.periodNumber === newPeriodNum);
      if (matchingPeriods.length === 0) {
        return { error: `Period ${newPeriodNum} does not exist in the configured timetable schedule.` };
      }

      const configuredPeriod =
        matchingPeriods.find((p: any) => {
          const pDays = (p.days ? p.days.split(',') : []).map((d: string) => d.trim()).filter(Boolean);
          return pDays.length === 0 || pDays.includes(newDay);
        }) || matchingPeriods[0];

      if (!configuredPeriod.isTeaching || configuredPeriod.type !== 'lesson') {
        return {
          error: `Cannot schedule a lesson during non-teaching interval "${configuredPeriod.label}" (${configuredPeriod.type}).`,
        };
      }

      const periodDays = (configuredPeriod.days ? configuredPeriod.days.split(',') : []).map((d: string) => d.trim()).filter(Boolean);
      if (periodDays.length > 0 && !periodDays.includes(newDay)) {
        return {
          error: `Period ${newPeriodNum} ("${configuredPeriod.label}") is not configured to run on ${newDay}. Configured days for this period: ${periodDays.join(', ')}.`,
        };
      }

      if (newStart < configuredPeriod.startTime || newEnd > configuredPeriod.endTime) {
        return {
          error: `Lesson time (${newStart} - ${newEnd}) falls outside the configured teaching period "${configuredPeriod.label}" (${configuredPeriod.startTime} - ${configuredPeriod.endTime}).`,
        };
      }

      const targetTermId = existing.termId;

      // Check duplicate class slot collision or overlapping time
      const existingClassSlots = await tx
        .select({
          id: timetables.id,
          periodNumber: timetables.periodNumber,
          startTime: timetables.startTime,
          endTime: timetables.endTime,
          termId: timetables.termId,
        })
        .from(timetables)
        .where(
          and(
            eq(timetables.classId, newClassId),
            eq(timetables.dayOfWeek, newDay),
            ne(timetables.id, slotId)
          )
        );

      const classCollision = existingClassSlots.find((s) => {
        const termMatches = !targetTermId || !s.termId || s.termId === targetTermId;
        if (!termMatches) return false;
        return s.periodNumber === newPeriodNum || (newStart < s.endTime && newEnd > s.startTime);
      });

      if (classCollision) {
        return {
          error: `Class booking conflict: Class already has a scheduled lesson on ${newDay} period ${classCollision.periodNumber} (${classCollision.startTime} - ${classCollision.endTime}).`,
        };
      }

      // Check duplicate teacher booking collision or overlapping time
      const existingTeacherSlots = await tx
        .select({
          id: timetables.id,
          classId: timetables.classId,
          periodNumber: timetables.periodNumber,
          startTime: timetables.startTime,
          endTime: timetables.endTime,
          termId: timetables.termId,
        })
        .from(timetables)
        .where(
          and(
            eq(timetables.teacherId, newTeacherId),
            eq(timetables.dayOfWeek, newDay),
            ne(timetables.id, slotId)
          )
        );

      const teacherCollision = existingTeacherSlots.find((s) => {
        const termMatches = !targetTermId || !s.termId || s.termId === targetTermId;
        if (!termMatches) return false;
        return s.periodNumber === newPeriodNum || (newStart < s.endTime && newEnd > s.startTime);
      });

      if (teacherCollision) {
        const [conflictingClass] = await tx.select({ name: classes.name }).from(classes).where(eq(classes.id, teacherCollision.classId)).limit(1);
        return {
          error: `Teacher booking conflict: This teacher is already scheduled for class ${conflictingClass?.name || '#' + teacherCollision.classId} on ${newDay} period ${teacherCollision.periodNumber} (${teacherCollision.startTime} - ${teacherCollision.endTime}).`,
        };
      }

      const [updated] = await tx
        .update(timetables)
        .set({
          classId: newClassId,
          subjectId: newSubjectId,
          teacherId: newTeacherId,
          dayOfWeek: newDay,
          startTime: newStart,
          endTime: newEnd,
          periodNumber: newPeriodNum,
          room: newRoom,
          updatedAt: new Date(),
        })
        .where(eq(timetables.id, slotId))
        .returning();

      return { updated, existing };
    });

    if ('notFound' in transactionResult && transactionResult.notFound) {
      return res.status(404).json({ error: 'Timetable period not found.' });
    }
    if ('error' in transactionResult && transactionResult.error) {
      return res.status(400).json({ error: transactionResult.error });
    }

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'UPDATE_TIMETABLE_SLOT',
      resource: 'timetables',
      resourceId: String(slotId),
      details: {
        previous: transactionResult.existing,
        updated: transactionResult.updated,
      },
      ipAddress: req.ip,
    });

    return res.json({
      message: 'Timetable slot updated successfully.',
      slot: transactionResult.updated,
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

    const deleteResult = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(timetables).where(eq(timetables.id, slotId)).limit(1);
      if (!existing) {
        return { notFound: true };
      }

      await tx.delete(timetables).where(eq(timetables.id, slotId));
      return { existing };
    });

    if ('notFound' in deleteResult && deleteResult.notFound) {
      return res.status(404).json({ error: 'Timetable period not found.' });
    }

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'DELETE_TIMETABLE_SLOT',
      resource: 'timetables',
      resourceId: String(slotId),
      details: deleteResult.existing,
      ipAddress: req.ip,
    });

    return res.json({ message: 'Timetable slot deleted successfully.' });
  } catch (error: any) {
    console.error('Error deleting timetable slot:', error);
    return res.status(500).json({ error: 'Failed to delete timetable slot' });
  }
});
