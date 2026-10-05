import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import {
  attendance,
  students,
  classes,
  academicTerms,
  academicSessions,
  parentStudents,
  teachers,
  classSubjects,
  users,
  schoolSettings,
  classAttendanceSubmissions,
} from '../db/schema.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { getSchoolTime } from '../lib/time.ts';
import { eq, and, sql, desc, count, inArray, aliasedTable } from 'drizzle-orm';

export const attendanceRouter = Router();

// Helper to get school timezone and current date
async function getSchoolTimezoneAndDate(): Promise<{ timezone: string; todayDate: string; currentTime: string; displayTime: string }> {
  const [settings] = await db.select().from(schoolSettings).limit(1);
  const timezone = settings?.timezone || 'Africa/Lagos';
  const schoolTime = getSchoolTime(timezone);
  return {
    timezone,
    todayDate: schoolTime.dateStr,
    currentTime: schoolTime.timeStr,
    displayTime: schoolTime.displayTimeStr,
  };
}

// ============================================================================
// 1. GET /api/attendance - List attendance records with role scoping & filters
// ============================================================================
attendanceRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined;
    const date = req.query.date as string | undefined;
    const status = req.query.status as string | undefined;
    const isLateQuery = req.query.isLate as string | undefined;
    let studentId = req.query.studentId ? parseInt(req.query.studentId as string) : undefined;

    const conditions = [];

    // Security & Role scoping
    if (user.role === 'student') {
      const studentProfile = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      if (studentProfile.length === 0) {
        return res.status(404).json({ error: 'Student record not found' });
      }
      if (!req.query.studentId || parseInt(req.query.studentId as string) !== studentProfile[0].id) {
        return res.status(403).json({ error: 'Access denied: General attendance register is restricted. Students must access their own records.' });
      }
      studentId = studentProfile[0].id;
      conditions.push(eq(attendance.studentId, studentId));
    } else if (user.role === 'parent') {
      const linked = await db.select().from(parentStudents).where(eq(parentStudents.parentUserId, user.id));
      const allowedStudentIds = linked.map((l) => l.studentId);
      if (allowedStudentIds.length === 0) {
        return res.json([]);
      }
      if (studentId) {
        if (!allowedStudentIds.includes(studentId)) {
          return res.status(403).json({ error: 'Unauthorized to view this student\'s attendance' });
        }
        conditions.push(eq(attendance.studentId, studentId));
      } else {
        conditions.push(inArray(attendance.studentId, allowedStudentIds));
      }
    } else if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher record not found' });

      const classTeacherClasses = await db.select({ id: classes.id }).from(classes).where(eq(classes.classTeacherId, t.id));
      const recorderClasses = await db.select({ id: classes.id }).from(classes).where(eq(classes.attendanceRecorderId, t.id));
      const subjectClasses = await db.select({ id: classSubjects.classId }).from(classSubjects).where(eq(classSubjects.teacherId, t.id));

      const assignedClassIds = Array.from(new Set([
        ...classTeacherClasses.map((c) => c.id),
        ...recorderClasses.map((c) => c.id),
        ...subjectClasses.map((c) => c.id),
      ]));

      if (assignedClassIds.length === 0) {
        return res.json([]);
      }

      if (classId) {
        if (!assignedClassIds.includes(classId)) {
          return res.status(403).json({ error: 'Access denied: You are not assigned to view attendance for this class.' });
        }
        conditions.push(eq(attendance.classId, classId));
      } else {
        conditions.push(inArray(attendance.classId, assignedClassIds));
      }

      if (studentId) {
        conditions.push(eq(attendance.studentId, studentId));
      }
    } else {
      // Super admin
      if (classId) conditions.push(eq(attendance.classId, classId));
      if (studentId) conditions.push(eq(attendance.studentId, studentId));
    }

    if (date) conditions.push(eq(attendance.date, date));
    if (status) conditions.push(eq(attendance.status, status));
    if (isLateQuery === 'true') conditions.push(eq(attendance.isLate, true));
    if (isLateQuery === 'false') conditions.push(eq(attendance.isLate, false));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Pagination check
    const isPaginated = req.query.page !== undefined || req.query.paginated === 'true';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(5, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const baseQuery = db
      .select({
        id: attendance.id,
        studentId: attendance.studentId,
        studentCode: students.studentId,
        studentName: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
        classId: attendance.classId,
        className: classes.name,
        date: attendance.date,
        status: attendance.status,
        isLate: attendance.isLate,
        arrivalTime: attendance.arrivalTime,
        lateReason: attendance.lateReason,
        lateApproved: attendance.lateApproved,
        remarks: attendance.remarks,
        recordedBy: attendance.recordedBy,
        createdAt: attendance.createdAt,
        updatedAt: attendance.updatedAt,
      })
      .from(attendance)
      .innerJoin(students, eq(attendance.studentId, students.id))
      .innerJoin(classes, eq(attendance.classId, classes.id))
      .where(whereClause)
      .orderBy(desc(attendance.date), desc(attendance.id));

    if (isPaginated) {
      const [totalRes] = await db
        .select({ count: count() })
        .from(attendance)
        .where(whereClause);
      const total = totalRes?.count || 0;
      const records = await baseQuery.limit(limit).offset(offset);
      return res.json({
        data: records,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    const records = await baseQuery;
    res.json(records);
  } catch (error: any) {
    console.error('Fetch attendance error:', error);
    res.status(500).json({ error: 'Failed to retrieve attendance records' });
  }
});

// ============================================================================
// 1b. GET /api/attendance/history - Attendance history with role verification
// ============================================================================
attendanceRouter.get('/history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined;
    const date = req.query.date as string | undefined;
    let studentId = req.query.studentId ? parseInt(req.query.studentId as string) : undefined;

    const conditions = [];

    if (user.role === 'student') {
      const studentProfile = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      if (studentProfile.length === 0) return res.status(404).json({ error: 'Student record not found' });
      if (!req.query.studentId || parseInt(req.query.studentId as string) !== studentProfile[0].id) {
        return res.status(403).json({ error: 'Access denied: You cannot view attendance history of other students.' });
      }
      studentId = studentProfile[0].id;
      conditions.push(eq(attendance.studentId, studentId));
    } else if (user.role === 'parent') {
      const linked = await db.select().from(parentStudents).where(eq(parentStudents.parentUserId, user.id));
      const allowed = linked.map((l) => l.studentId);
      if (allowed.length === 0) return res.json([]);
      if (studentId) {
        if (!allowed.includes(studentId)) {
          return res.status(403).json({ error: 'Access denied: Child not linked to your account' });
        }
        conditions.push(eq(attendance.studentId, studentId));
      } else {
        conditions.push(inArray(attendance.studentId, allowed));
      }
    } else if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher record not found' });

      const ctClasses = await db.select({ id: classes.id }).from(classes).where(eq(classes.classTeacherId, t.id));
      const arClasses = await db.select({ id: classes.id }).from(classes).where(eq(classes.attendanceRecorderId, t.id));
      const csClasses = await db.select({ id: classSubjects.classId }).from(classSubjects).where(eq(classSubjects.teacherId, t.id));

      const assignedClassIds = Array.from(new Set([
        ...ctClasses.map((c) => c.id),
        ...arClasses.map((c) => c.id),
        ...csClasses.map((c) => c.id),
      ]));

      if (classId) {
        if (!assignedClassIds.includes(classId)) {
          return res.status(403).json({ error: 'Access denied: You are not assigned to view attendance for this class.' });
        }
        conditions.push(eq(attendance.classId, classId));
      } else {
        if (assignedClassIds.length === 0) return res.json([]);
        conditions.push(inArray(attendance.classId, assignedClassIds));
      }

      if (studentId) {
        conditions.push(eq(attendance.studentId, studentId));
      }
    } else {
      if (classId) conditions.push(eq(attendance.classId, classId));
      if (studentId) conditions.push(eq(attendance.studentId, studentId));
    }

    if (date) conditions.push(eq(attendance.date, date));

    const records = await db
      .select({
        id: attendance.id,
        studentId: attendance.studentId,
        studentCode: students.studentId,
        studentName: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
        classId: attendance.classId,
        className: classes.name,
        date: attendance.date,
        status: attendance.status,
        isLate: attendance.isLate,
        arrivalTime: attendance.arrivalTime,
        lateReason: attendance.lateReason,
        lateApproved: attendance.lateApproved,
        remarks: attendance.remarks,
        createdAt: attendance.createdAt,
      })
      .from(attendance)
      .innerJoin(students, eq(attendance.studentId, students.id))
      .innerJoin(classes, eq(attendance.classId, classes.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(attendance.date), desc(attendance.id))
      .limit(100);

    res.json(records);
  } catch (error: any) {
    console.error('Fetch attendance history error:', error);
    res.status(500).json({ error: 'Failed to retrieve attendance history' });
  }
});

// ============================================================================
// 2. GET /api/attendance/window - Configured attendance window & active status
// ============================================================================
attendanceRouter.get('/window', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const list = await db.select().from(schoolSettings).limit(1);
    const settings = list[0];
    const tz = settings?.timezone || 'Africa/Lagos';
    const startTime = settings?.attendanceStartTime || '07:30';
    const cutoffTime = settings?.attendanceCutoffTime || '08:30';
    const policy = settings?.attendancePolicy || 'flexible';

    // Calculate current time in configured school timezone
    const schoolTime = getSchoolTime(tz);
    const currentTime = schoolTime.timeStr;
    const isWindowActive = currentTime >= startTime && currentTime <= cutoffTime;

    res.json({
      startTime,
      cutoffTime,
      policy,
      currentTime,
      isWindowActive,
      timezone: tz,
    });
  } catch (error: any) {
    console.error('Fetch attendance window error:', error);
    res.status(500).json({ error: 'Failed to retrieve attendance window' });
  }
});

// ============================================================================
// 3. GET /api/attendance/class-status - Today's attendance status across classes
// ============================================================================
attendanceRouter.get('/class-status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { todayDate } = await getSchoolTimezoneAndDate();
    const date = (req.query.date as string) || todayDate;

    // Determine allowed classes for teacher
    let teacherAssignedClassIds: number[] | null = null;
    let currentTeacherId: number | null = null;

    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher record not found' });
      currentTeacherId = t.id;

      const ctClasses = await db.select({ id: classes.id }).from(classes).where(eq(classes.classTeacherId, t.id));
      const arClasses = await db.select({ id: classes.id }).from(classes).where(eq(classes.attendanceRecorderId, t.id));
      const csClasses = await db.select({ id: classSubjects.classId }).from(classSubjects).where(eq(classSubjects.teacherId, t.id));

      teacherAssignedClassIds = Array.from(new Set([
        ...ctClasses.map((c) => c.id),
        ...arClasses.map((c) => c.id),
        ...csClasses.map((c) => c.id),
      ]));

      if (teacherAssignedClassIds.length === 0) {
        return res.json([]);
      }
    }

    const ctTeacher = aliasedTable(teachers, 'ct_t');
    const ctUser = aliasedTable(users, 'ct_u');
    const arTeacher = aliasedTable(teachers, 'ar_t');
    const arUser = aliasedTable(users, 'ar_u');
    const subUser = aliasedTable(users, 'sub_u');

    const classConditions = [];
    if (teacherAssignedClassIds !== null) {
      classConditions.push(inArray(classes.id, teacherAssignedClassIds));
    }
    classConditions.push(eq(classes.status, 'active'));

    const activeClasses = await db
      .select({
        id: classes.id,
        name: classes.name,
        section: classes.section,
        gradeLevel: classes.gradeLevel,
        capacity: classes.capacity,
        classTeacherId: classes.classTeacherId,
        classTeacherName: ctUser.fullName,
        attendanceRecorderId: classes.attendanceRecorderId,
        attendanceRecorderName: arUser.fullName,
      })
      .from(classes)
      .leftJoin(ctTeacher, eq(classes.classTeacherId, ctTeacher.id))
      .leftJoin(ctUser, eq(ctTeacher.userId, ctUser.id))
      .leftJoin(arTeacher, eq(classes.attendanceRecorderId, arTeacher.id))
      .leftJoin(arUser, eq(arTeacher.userId, arUser.id))
      .where(and(...classConditions))
      .orderBy(classes.name);

    // Fetch submissions for this date
    const classIds = activeClasses.map((c) => c.id);
    if (classIds.length === 0) {
      return res.json([]);
    }

    const submissions = await db
      .select({
        classId: classAttendanceSubmissions.classId,
        status: classAttendanceSubmissions.status,
        submittedAt: classAttendanceSubmissions.submittedAt,
        submittedBy: classAttendanceSubmissions.submittedBy,
        submittedByName: subUser.fullName,
      })
      .from(classAttendanceSubmissions)
      .leftJoin(subUser, eq(classAttendanceSubmissions.submittedBy, subUser.id))
      .where(and(eq(classAttendanceSubmissions.date, date), inArray(classAttendanceSubmissions.classId, classIds)));

    const submissionMap = new Map<number, (typeof submissions)[0]>();
    submissions.forEach((s) => submissionMap.set(s.classId, s));

    // Fetch attendance stats for each class for this date
    const attendanceStats = await db
      .select({
        classId: attendance.classId,
        totalMarked: count(attendance.id),
        present: sql<number>`count(case when ${attendance.status} = 'Present' then 1 end)`,
        absent: sql<number>`count(case when ${attendance.status} = 'Absent' then 1 end)`,
        excused: sql<number>`count(case when ${attendance.status} = 'Excused' then 1 end)`,
        lateArrivals: sql<number>`count(case when ${attendance.isLate} = true then 1 end)`,
      })
      .from(attendance)
      .where(and(eq(attendance.date, date), inArray(attendance.classId, classIds)))
      .groupBy(attendance.classId);

    const statsMap = new Map<number, (typeof attendanceStats)[0]>();
    attendanceStats.forEach((st) => statsMap.set(st.classId, st));

    // Fetch enrolled active students count per class
    const enrolledStudents = await db
      .select({
        classId: students.classId,
        studentCount: count(students.id),
      })
      .from(students)
      .where(and(inArray(students.classId, classIds), eq(students.status, 'active')))
      .groupBy(students.classId);

    const enrolledMap = new Map<number, number>();
    enrolledStudents.forEach((e) => {
      if (e.classId) enrolledMap.set(e.classId, Number(e.studentCount));
    });

    const result = activeClasses.map((cls) => {
      const sub = submissionMap.get(cls.id);
      const st = statsMap.get(cls.id);
      const enrolled = enrolledMap.get(cls.id) || 0;

      const isClassTeacher = user.role === 'super_admin' || (currentTeacherId !== null && cls.classTeacherId === currentTeacherId);
      const isAttendanceRecorder = user.role === 'super_admin' || (currentTeacherId !== null && cls.attendanceRecorderId === currentTeacherId);
      const canRecordAttendance = isClassTeacher || isAttendanceRecorder;

      return {
        classId: cls.id,
        className: cls.name,
        section: cls.section,
        gradeLevel: cls.gradeLevel,
        capacity: cls.capacity,
        classTeacherId: cls.classTeacherId,
        classTeacherName: cls.classTeacherName,
        attendanceRecorderId: cls.attendanceRecorderId,
        attendanceRecorderName: cls.attendanceRecorderName,
        isClassTeacher,
        isAttendanceRecorder,
        canRecordAttendance,
        isSubmitted: Boolean(sub),
        submissionStatus: sub ? 'submitted' : 'not_submitted',
        submittedAt: sub?.submittedAt || null,
        submittedBy: sub?.submittedBy || null,
        submittedByName: sub?.submittedByName || null,
        totalEnrolled: enrolled,
        totalMarked: Number(st?.totalMarked || 0),
        presentCount: Number(st?.present || 0),
        absentCount: Number(st?.absent || 0),
        excusedCount: Number(st?.excused || 0),
        lateCount: Number(st?.lateArrivals || 0),
      };
    });

    res.json(result);
  } catch (error: any) {
    console.error('Fetch class attendance status error:', error);
    res.status(500).json({ error: 'Failed to retrieve class attendance statuses' });
  }
});

// ============================================================================
// 4. GET /api/attendance/student/:studentId - Specific student attendance history
// ============================================================================
attendanceRouter.get('/student/:studentId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const user = req.user!;

    if (user.role === 'student') {
      const s = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      if (s.length === 0 || s[0].id !== studentId) {
        return res.status(403).json({ error: 'Unauthorized to view these student attendance records' });
      }
    } else if (user.role === 'parent') {
      const linked = await db
        .select()
        .from(parentStudents)
        .where(and(eq(parentStudents.parentUserId, user.id), eq(parentStudents.studentId, studentId)))
        .limit(1);
      if (linked.length === 0) {
        return res.status(403).json({ error: 'Unauthorized: This child is not linked to your account' });
      }
    } else if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher profile not found' });

      const [st] = await db.select({ classId: students.classId }).from(students).where(eq(students.id, studentId)).limit(1);
      if (!st || !st.classId) return res.status(404).json({ error: 'Student record not found' });

      const [isClassTeacher] = await db.select({ id: classes.id }).from(classes).where(and(eq(classes.id, st.classId), eq(classes.classTeacherId, t.id))).limit(1);
      const [isAttendanceRecorder] = await db.select({ id: classes.id }).from(classes).where(and(eq(classes.id, st.classId), eq(classes.attendanceRecorderId, t.id))).limit(1);
      const [isSubjectTeacher] = await db.select({ id: classSubjects.id }).from(classSubjects).where(and(eq(classSubjects.classId, st.classId), eq(classSubjects.teacherId, t.id))).limit(1);

      if (!isClassTeacher && !isAttendanceRecorder && !isSubjectTeacher) {
        return res.status(403).json({ error: 'Access denied: You do not teach this student.' });
      }
    }

    const records = await db
      .select({
        id: attendance.id,
        studentId: attendance.studentId,
        studentCode: students.studentId,
        studentName: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
        classId: attendance.classId,
        className: classes.name,
        date: attendance.date,
        status: attendance.status,
        isLate: attendance.isLate,
        arrivalTime: attendance.arrivalTime,
        lateReason: attendance.lateReason,
        lateApproved: attendance.lateApproved,
        remarks: attendance.remarks,
        createdAt: attendance.createdAt,
        updatedAt: attendance.updatedAt,
      })
      .from(attendance)
      .innerJoin(students, eq(attendance.studentId, students.id))
      .innerJoin(classes, eq(attendance.classId, classes.id))
      .where(eq(attendance.studentId, studentId))
      .orderBy(desc(attendance.date), desc(attendance.id));

    res.json(records);
  } catch (error: any) {
    console.error('Fetch student attendance error:', error);
    res.status(500).json({ error: 'Failed to retrieve attendance records' });
  }
});

// ============================================================================
// 4b. GET /api/attendance/student/:studentId/summary - Dedicated summary endpoint
// ============================================================================
attendanceRouter.get('/student/:studentId/summary', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const user = req.user!;

    if (user.role === 'student') {
      const s = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      if (s.length === 0 || s[0].id !== studentId) {
        return res.status(403).json({ error: 'Unauthorized to view this student attendance summary' });
      }
    } else if (user.role === 'parent') {
      const linked = await db
        .select()
        .from(parentStudents)
        .where(and(eq(parentStudents.parentUserId, user.id), eq(parentStudents.studentId, studentId)))
        .limit(1);
      if (linked.length === 0) {
        return res.status(403).json({ error: 'Unauthorized: This child is not linked to your account' });
      }
    } else if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher profile not found' });

      const [st] = await db.select({ classId: students.classId }).from(students).where(eq(students.id, studentId)).limit(1);
      if (!st || !st.classId) return res.status(404).json({ error: 'Student record not found' });

      const [isClassTeacher] = await db.select({ id: classes.id }).from(classes).where(and(eq(classes.id, st.classId), eq(classes.classTeacherId, t.id))).limit(1);
      const [isAttendanceRecorder] = await db.select({ id: classes.id }).from(classes).where(and(eq(classes.id, st.classId), eq(classes.attendanceRecorderId, t.id))).limit(1);
      const [isSubjectTeacher] = await db.select({ id: classSubjects.id }).from(classSubjects).where(and(eq(classSubjects.classId, st.classId), eq(classSubjects.teacherId, t.id))).limit(1);

      if (!isClassTeacher && !isAttendanceRecorder && !isSubjectTeacher) {
        return res.status(403).json({ error: 'Access denied: You do not teach this student.' });
      }
    }

    const [summary] = await db
      .select({
        totalDays: sql<number>`count(*)`,
        present: sql<number>`count(case when ${attendance.status} = 'Present' then 1 end)`,
        absent: sql<number>`count(case when ${attendance.status} = 'Absent' then 1 end)`,
        excused: sql<number>`count(case when ${attendance.status} = 'Excused' then 1 end)`,
        lateArrivals: sql<number>`count(case when ${attendance.isLate} = true then 1 end)`,
        attendanceRate: sql<number>`case when count(*) > 0 then round((count(case when ${attendance.status} = 'Present' then 1 end)::numeric / count(*)::numeric) * 100) else 0 end`,
      })
      .from(attendance)
      .where(eq(attendance.studentId, studentId));

    res.json({
      totalDays: Number(summary?.totalDays || 0),
      present: Number(summary?.present || 0),
      absent: Number(summary?.absent || 0),
      excused: Number(summary?.excused || 0),
      lateArrivals: Number(summary?.lateArrivals || 0),
      attendanceRate: Number(summary?.attendanceRate || 0),
    });
  } catch (error: any) {
    console.error('Fetch student attendance summary error:', error);
    res.status(500).json({ error: 'Failed to compute attendance summary' });
  }
});

// ============================================================================
// 5. POST /api/attendance/batch & POST /api/attendance - Roll-Call Attendance Submission
// ============================================================================
const handleBatchAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'super_admin' && user.role !== 'teacher') {
      return res.status(403).json({ error: 'Only teachers and administrators can record attendance' });
    }

    const { classId, date, termId, entries, records, submitClass } = req.body;
    const rawEntries = entries || records;

    if (!classId || !Array.isArray(rawEntries) || rawEntries.length === 0) {
      return res.status(400).json({ error: 'classId and non-empty entries/records array are required' });
    }

    const parsedClassId = parseInt(classId);
    if (isNaN(parsedClassId) || parsedClassId <= 0) {
      return res.status(400).json({ error: 'Invalid class ID provided' });
    }

    // Determine school timezone and effective date
    const { timezone, todayDate, displayTime } = await getSchoolTimezoneAndDate();
    const targetDate = date ? String(date).trim() : todayDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' });
    }

    // Verify class exists and get teacher assignments
    const [targetClass] = await db
      .select()
      .from(classes)
      .where(eq(classes.id, parsedClassId))
      .limit(1);

    if (!targetClass) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // 1. REJECT DUPLICATE STUDENT IDS & VALIDATE STUDENT IDS
    const rawStudentIds: number[] = [];
    const seenStudentIds = new Set<number>();
    for (const entry of rawEntries) {
      const sid = parseInt(entry.studentId);
      if (isNaN(sid) || sid <= 0) {
        return res.status(400).json({ error: 'All attendance entries must contain a valid positive student ID' });
      }
      if (seenStudentIds.has(sid)) {
        return res.status(400).json({ error: `Duplicate student ID ${sid} detected in attendance submission.` });
      }
      seenStudentIds.add(sid);
      rawStudentIds.push(sid);
    }

    // 2. REJECT INVALID STATUSES (Allowed: Present, Absent, Excused, Late)
    const allowedInputStatuses = ['Present', 'Absent', 'Excused', 'Late'];
    for (const entry of rawEntries) {
      if (!entry.status || typeof entry.status !== 'string' || !allowedInputStatuses.includes(entry.status)) {
        return res.status(400).json({
          error: `Invalid attendance status '${entry.status}'. Allowed statuses are Present, Absent, Excused.`,
        });
      }
    }

    // 3. FETCH ALL ACTIVE/ENROLLED STUDENTS IN TARGET CLASS
    const enrolledStudents = await db
      .select({ id: students.id, status: students.status, classId: students.classId })
      .from(students)
      .where(and(eq(students.classId, parsedClassId), eq(students.status, 'active')));

    const activeEnrolledMap = new Map(enrolledStudents.map((s) => [s.id, s]));

    // 4. REJECT STUDENTS BELONGING TO ANOTHER CLASS
    for (const sid of rawStudentIds) {
      if (!activeEnrolledMap.has(sid)) {
        return res.status(400).json({
          error: `Cross-class IDOR blocked: Student ID ${sid} is not enrolled in class ${parsedClassId}.`,
        });
      }
    }

    // 5. IF submitClass=true: MUST INCLUDE EVERY ACTIVE/ENROLLED STUDENT IN TARGET CLASS
    if (submitClass) {
      if (enrolledStudents.length === 0) {
        return res.status(400).json({
          error: 'Cannot submit class attendance: Class has no active enrolled students.',
        });
      }
      for (const enrolled of enrolledStudents) {
        if (!seenStudentIds.has(enrolled.id)) {
          return res.status(400).json({
            error: `Batch submission must include every active/enrolled student in the target class before submitting class attendance. Missing student ID ${enrolled.id}.`,
          });
        }
      }
    }

    // Teacher authorization checks
    let teacherRecord: any = null;
    if (user.role === 'teacher') {
      const [t] = await db
        .select()
        .from(teachers)
        .where(eq(teachers.userId, user.id))
        .limit(1);

      if (!t) {
        return res.status(403).json({ error: 'Teacher profile not found for current user' });
      }
      teacherRecord = t;

      const isClassTeacher = targetClass.classTeacherId === teacherRecord.id;
      const isAttendanceRecorder = targetClass.attendanceRecorderId === teacherRecord.id;

      if (!isClassTeacher && !isAttendanceRecorder) {
        return res.status(403).json({
          error: 'Access denied: Daily attendance recording is restricted to the Class Teacher or designated Attendance Recorder.',
        });
      }
    }

    // Check if attendance for this class and date is already submitted
    const [existingSubmission] = await db
      .select()
      .from(classAttendanceSubmissions)
      .where(and(eq(classAttendanceSubmissions.classId, parsedClassId), eq(classAttendanceSubmissions.date, targetDate)))
      .limit(1);

    if (user.role === 'teacher') {
      const isClassTeacher = targetClass.classTeacherId === teacherRecord?.id;

      // If attendance was already submitted, only Class Teacher (or Super Admin) can modify
      if (existingSubmission && !isClassTeacher) {
        return res.status(403).json({
          error: 'Attendance for this class has already been submitted. Corrections require authorization from the Class Teacher or Administrator.',
        });
      }
    }

    // Determine active term & session
    let targetTermId = termId ? parseInt(termId) : null;
    let targetSessionId = targetClass.sessionId;
    if (!targetTermId) {
      const currentTerm = await db.select().from(academicTerms).where(eq(academicTerms.isCurrent, true)).limit(1);
      if (currentTerm.length > 0) {
        targetTermId = currentTerm[0].id;
        if (!targetSessionId) targetSessionId = currentTerm[0].sessionId;
      }
    }

    // ATOMIC TRANSACTION FOR ATTENDANCE BATCH WRITE
    await db.transaction(async (tx) => {
      for (const entry of rawEntries) {
        const studentId = parseInt(entry.studentId);
        let finalStatus: 'Present' | 'Absent' | 'Excused' = 'Present';
        let isLate = Boolean(entry.isLate);

        if (entry.status === 'Late') {
          finalStatus = 'Present';
          isLate = true;
        } else if (entry.status === 'Present') {
          finalStatus = 'Present';
          isLate = Boolean(entry.isLate);
        } else if (entry.status === 'Absent' || entry.status === 'Excused') {
          finalStatus = entry.status;
          isLate = false; // Absent/Excused cannot be late
        }

        const arrivalTime = isLate ? (entry.arrivalTime || displayTime) : null;
        const lateReason = isLate ? (entry.lateReason ? String(entry.lateReason).trim() : null) : null;
        const lateApproved = isLate ? (entry.lateApproved !== undefined ? Boolean(entry.lateApproved) : true) : false;
        const remarks = entry.remarks ? String(entry.remarks).trim() : null;

        const existing = await tx
          .select({ id: attendance.id })
          .from(attendance)
          .where(and(eq(attendance.studentId, studentId), eq(attendance.date, targetDate)))
          .limit(1);

        if (existing.length > 0) {
          await tx
            .update(attendance)
            .set({
              status: finalStatus,
              isLate,
              arrivalTime,
              lateReason,
              lateApproved,
              remarks,
              updatedBy: user.id,
              updatedAt: new Date(),
            })
            .where(eq(attendance.id, existing[0].id));
        } else {
          await tx.insert(attendance).values({
            studentId,
            classId: parsedClassId,
            sessionId: targetSessionId,
            termId: targetTermId,
            date: targetDate,
            status: finalStatus,
            isLate,
            arrivalTime,
            lateReason,
            lateApproved,
            remarks,
            recordedBy: user.id,
            updatedBy: user.id,
          });
        }
      }

      // If submitClass requested, record class submission
      if (submitClass) {
        if (existingSubmission) {
          await tx
            .update(classAttendanceSubmissions)
            .set({
              status: 'submitted',
              updatedBy: user.id,
              updatedAt: new Date(),
            })
            .where(eq(classAttendanceSubmissions.id, existingSubmission.id));
        } else {
          await tx.insert(classAttendanceSubmissions).values({
            classId: parsedClassId,
            date: targetDate,
            sessionId: targetSessionId,
            termId: targetTermId,
            status: 'submitted',
            submittedBy: user.id,
          });
        }
      }
    });

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: submitClass ? 'ATTENDANCE_SUBMITTED' : 'ATTENDANCE_RECORDED',
      resource: 'attendance',
      resourceId: parsedClassId.toString(),
      details: { classId: parsedClassId, date: targetDate, count: rawEntries.length, submitted: Boolean(submitClass) },
      ipAddress: req.ip,
    });

    res.json({ success: true, count: rawEntries.length, submitted: Boolean(submitClass), date: targetDate });
  } catch (error: any) {
    console.error('Record attendance error:', error);
    res.status(500).json({ error: 'Failed to record attendance' });
  }
};

attendanceRouter.post('/batch', requireAuth, handleBatchAttendance);
attendanceRouter.post('/', requireAuth, handleBatchAttendance);

// ============================================================================
// 6. POST /api/attendance/submit-class - Explicit Class Attendance Submission
// ============================================================================
attendanceRouter.post('/submit-class', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'super_admin' && user.role !== 'teacher') {
      return res.status(403).json({ error: 'Only authorized staff can submit class attendance' });
    }

    const { classId, date, notes } = req.body;
    if (!classId) {
      return res.status(400).json({ error: 'classId is required' });
    }

    const parsedClassId = parseInt(classId);
    const [cls] = await db.select().from(classes).where(eq(classes.id, parsedClassId)).limit(1);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const { todayDate } = await getSchoolTimezoneAndDate();
    const targetDate = date ? String(date).trim() : todayDate;

    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher record not found' });

      const isClassTeacher = cls.classTeacherId === t.id;
      const isAttendanceRecorder = cls.attendanceRecorderId === t.id;

      if (!isClassTeacher && !isAttendanceRecorder) {
        return res.status(403).json({ error: 'Access denied: Only the Class Teacher or Attendance Recorder can submit attendance.' });
      }
    }

    // Verify that every active/enrolled student in this class has attendance recorded for this date
    const enrolled = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.classId, parsedClassId), eq(students.status, 'active')));

    if (enrolled.length === 0) {
      return res.status(400).json({ error: 'Cannot submit attendance for a class with no active enrolled students' });
    }

    const enrolledIds = enrolled.map((e) => e.id);
    const recordedAttendance = await db
      .select({ studentId: attendance.studentId })
      .from(attendance)
      .where(and(eq(attendance.classId, parsedClassId), eq(attendance.date, targetDate), inArray(attendance.studentId, enrolledIds)));

    const recordedIdSet = new Set(recordedAttendance.map((r) => r.studentId));
    const unrecordedStudents = enrolledIds.filter((id) => !recordedIdSet.has(id));

    if (unrecordedStudents.length > 0) {
      return res.status(400).json({
        error: `Cannot submit class attendance: Every active enrolled student in the target class must have attendance recorded before submission. Missing ${unrecordedStudents.length} students.`,
      });
    }

    const [existing] = await db
      .select()
      .from(classAttendanceSubmissions)
      .where(and(eq(classAttendanceSubmissions.classId, parsedClassId), eq(classAttendanceSubmissions.date, targetDate)))
      .limit(1);

    if (existing) {
      await db
        .update(classAttendanceSubmissions)
        .set({
          status: 'submitted',
          notes: notes !== undefined ? notes : existing.notes,
          updatedBy: user.id,
          updatedAt: new Date(),
        })
        .where(eq(classAttendanceSubmissions.id, existing.id));
    } else {
      await db.insert(classAttendanceSubmissions).values({
        classId: parsedClassId,
        date: targetDate,
        sessionId: cls.sessionId,
        status: 'submitted',
        submittedBy: user.id,
        notes: notes || null,
      });
    }

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'CLASS_ATTENDANCE_SUBMITTED',
      resource: 'class_attendance_submissions',
      resourceId: parsedClassId.toString(),
      details: { classId: parsedClassId, date: targetDate },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Class attendance marked as submitted successfully', date: targetDate });
  } catch (error: any) {
    console.error('Submit class attendance error:', error);
    res.status(500).json({ error: 'Failed to submit class attendance' });
  }
});

// ============================================================================
// 7. POST /api/attendance/late-arrival - Student Late Arrival Workflow
// ============================================================================
attendanceRouter.post('/late-arrival', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'super_admin' && user.role !== 'teacher') {
      return res.status(403).json({ error: 'Only authorized teachers and administrators can record late arrivals' });
    }

    const { studentId, classId, date, arrivalTime, lateReason, lateApproved } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required' });
    }

    const parsedStudentId = parseInt(studentId);
    const { timezone, todayDate, displayTime } = await getSchoolTimezoneAndDate();
    const targetDate = date ? String(date).trim() : todayDate;

    // Verify student exists and get class
    const [studentRec] = await db
      .select({ id: students.id, classId: students.classId, firstName: students.firstName, lastName: students.lastName })
      .from(students)
      .where(eq(students.id, parsedStudentId))
      .limit(1);

    if (!studentRec) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (!studentRec.classId) {
      return res.status(400).json({ error: 'Student is not enrolled in an active class cohort.' });
    }

    // STRICT IDOR PROTECTION: Derive target class directly from DB. Never trust client classId.
    const targetClassId = studentRec.classId;
    if (classId && parseInt(classId) !== targetClassId) {
      return res.status(400).json({
        error: `Cross-class IDOR blocked: Student ID ${parsedStudentId} does not belong to supplied class ID ${classId}.`,
      });
    }

    // Authorization check for teachers
    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher record not found' });

      const [cls] = await db.select().from(classes).where(eq(classes.id, targetClassId)).limit(1);
      if (!cls) return res.status(404).json({ error: 'Class not found' });

      const isClassTeacher = cls.classTeacherId === t.id;
      const isAttendanceRecorder = cls.attendanceRecorderId === t.id;

      if (!isClassTeacher && !isAttendanceRecorder) {
        return res.status(403).json({
          error: 'Access denied: Only the Class Teacher or designated Attendance Recorder can record late arrivals.',
        });
      }
    }

    const formattedTime = arrivalTime?.trim() || displayTime;

    const [existing] = await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.studentId, parsedStudentId), eq(attendance.date, targetDate)))
      .limit(1);

    let updatedRecord;
    if (existing) {
      const [rec] = await db
        .update(attendance)
        .set({
          status: 'Present',
          isLate: true,
          arrivalTime: formattedTime,
          lateReason: lateReason ? String(lateReason).trim() : existing.lateReason,
          lateApproved: lateApproved !== undefined ? Boolean(lateApproved) : existing.lateApproved,
          lateRecordedBy: user.id,
          lateRecordedAt: new Date(),
          updatedBy: user.id,
          updatedAt: new Date(),
        })
        .where(eq(attendance.id, existing.id))
        .returning();
      updatedRecord = rec;
    } else {
      const [cls] = await db.select().from(classes).where(eq(classes.id, targetClassId)).limit(1);
      const [rec] = await db
        .insert(attendance)
        .values({
          studentId: parsedStudentId,
          classId: targetClassId,
          sessionId: cls?.sessionId || null,
          date: targetDate,
          status: 'Present',
          isLate: true,
          arrivalTime: formattedTime,
          lateReason: lateReason ? String(lateReason).trim() : null,
          lateApproved: lateApproved !== undefined ? Boolean(lateApproved) : true,
          lateRecordedBy: user.id,
          lateRecordedAt: new Date(),
          recordedBy: user.id,
          updatedBy: user.id,
        })
        .returning();
      updatedRecord = rec;
    }

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'ATTENDANCE_LATE_ARRIVAL_RECORDED',
      resource: 'attendance',
      resourceId: updatedRecord.id.toString(),
      details: {
        studentId: parsedStudentId,
        studentName: `${studentRec.firstName} ${studentRec.lastName}`,
        classId: targetClassId,
        date: targetDate,
        arrivalTime: formattedTime,
        previousStatus: existing?.status || 'None',
        newStatus: 'Present',
        lateReason,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: `${studentRec.firstName} ${studentRec.lastName} marked as Present (Late arrival at ${formattedTime})`,
      record: updatedRecord,
    });
  } catch (error: any) {
    console.error('Record late arrival error:', error);
    res.status(500).json({ error: 'Failed to record late arrival' });
  }
});

// ============================================================================
// 8. POST /api/attendance/:id/correct & PATCH /api/attendance/:id/correct - Authorized Correction Workflow
// ============================================================================
const handleAttendanceCorrection = async (req: AuthRequest, res: Response) => {
  try {
    const attendanceId = parseInt(req.params.id);
    const user = req.user!;
    const { status, isLate, arrivalTime, reason, remarks } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A justification reason is required for attendance correction audit trail' });
    }

    const [existing] = await db
      .select({
        id: attendance.id,
        studentId: attendance.studentId,
        classId: attendance.classId,
        date: attendance.date,
        status: attendance.status,
        isLate: attendance.isLate,
        arrivalTime: attendance.arrivalTime,
        classTeacherId: classes.classTeacherId,
      })
      .from(attendance)
      .innerJoin(classes, eq(attendance.classId, classes.id))
      .where(eq(attendance.id, attendanceId))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    // Role check: Only Class Teacher of this class or Super Admin can authorize corrections
    // Attendance Recorder does NOT gain correction authority unless they are the Class Teacher
    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t || existing.classTeacherId !== t.id) {
        return res.status(403).json({
          error: 'Access denied: Only the designated Class Teacher or Administrator can correct attendance.',
        });
      }
    } else if (user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized to correct attendance' });
    }

    // Validate status: reject invalid statuses instead of silently converting
    const allowedStatuses = ['Present', 'Absent', 'Excused', 'Late'];
    let finalStatus: 'Present' | 'Absent' | 'Excused' = existing.status as any;
    let finalIsLate = isLate !== undefined ? Boolean(isLate) : existing.isLate;

    if (status !== undefined) {
      if (typeof status !== 'string' || !allowedStatuses.includes(status)) {
        return res.status(400).json({
          error: `Invalid attendance status '${status}'. Allowed statuses are Present, Absent, Excused.`,
        });
      }
      if (status === 'Late') {
        finalStatus = 'Present';
        finalIsLate = true;
      } else if (status === 'Present') {
        finalStatus = 'Present';
      } else if (status === 'Absent' || status === 'Excused') {
        finalStatus = status;
        finalIsLate = false;
      }
    }

    const { displayTime } = await getSchoolTimezoneAndDate();
    const finalArrivalTime = finalIsLate ? (arrivalTime !== undefined ? arrivalTime : (existing.arrivalTime || displayTime)) : null;

    const [updated] = await db
      .update(attendance)
      .set({
        status: finalStatus,
        isLate: finalIsLate,
        arrivalTime: finalArrivalTime,
        remarks: remarks !== undefined ? remarks : `Corrected: ${reason.trim()}`,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(attendance.id, attendanceId))
      .returning();

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'ATTENDANCE_CORRECTED',
      resource: 'attendance',
      resourceId: attendanceId.toString(),
      details: {
        studentId: existing.studentId,
        classId: existing.classId,
        date: existing.date,
        previousStatus: existing.status,
        newStatus: finalStatus,
        previousIsLate: existing.isLate,
        newIsLate: finalIsLate,
        correctionReason: reason.trim(),
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Attendance record corrected successfully',
      record: updated,
    });
  } catch (error: any) {
    console.error('Correct attendance error:', error);
    res.status(500).json({ error: 'Failed to correct attendance record' });
  }
};

attendanceRouter.post('/:id/correct', requireAuth, handleAttendanceCorrection);
attendanceRouter.patch('/:id/correct', requireAuth, handleAttendanceCorrection);

// ============================================================================
// 8b. PATCH /api/attendance/:id - Update Single Attendance Record
// ============================================================================
attendanceRouter.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const attendanceId = parseInt(req.params.id);
    const user = req.user!;

    if (user.role !== 'teacher' && user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: Students and parents cannot modify attendance records.' });
    }

    const [existing] = await db
      .select({
        id: attendance.id,
        studentId: attendance.studentId,
        classId: attendance.classId,
        date: attendance.date,
        status: attendance.status,
        isLate: attendance.isLate,
        arrivalTime: attendance.arrivalTime,
        classTeacherId: classes.classTeacherId,
      })
      .from(attendance)
      .innerJoin(classes, eq(attendance.classId, classes.id))
      .where(eq(attendance.id, attendanceId))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    // Role check: Only Class Teacher of this class or Super Admin can modify/correct
    // Attendance Recorder does NOT automatically gain correction authority
    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t || existing.classTeacherId !== t.id) {
        return res.status(403).json({ error: 'Access denied: Only the designated Class Teacher or Administrator can correct attendance.' });
      }
    }

    const { status, isLate, arrivalTime, lateReason, remarks } = req.body;
    const allowedStatuses = ['Present', 'Absent', 'Excused', 'Late'];
    let finalStatus: 'Present' | 'Absent' | 'Excused' = existing.status as any;
    let finalIsLate = isLate !== undefined ? Boolean(isLate) : existing.isLate;

    if (status !== undefined) {
      if (typeof status !== 'string' || !allowedStatuses.includes(status)) {
        return res.status(400).json({
          error: `Invalid attendance status '${status}'. Allowed statuses are Present, Absent, Excused.`,
        });
      }
      if (status === 'Late') {
        finalStatus = 'Present';
        finalIsLate = true;
      } else if (status === 'Present') {
        finalStatus = 'Present';
      } else if (status === 'Absent' || status === 'Excused') {
        finalStatus = status;
        finalIsLate = false;
      }
    }

    const { displayTime } = await getSchoolTimezoneAndDate();
    const finalArrivalTime = finalIsLate ? (arrivalTime !== undefined ? arrivalTime : (existing.arrivalTime || displayTime)) : null;

    const [updated] = await db
      .update(attendance)
      .set({
        status: finalStatus,
        isLate: finalIsLate,
        arrivalTime: finalArrivalTime,
        lateReason: finalIsLate ? (lateReason !== undefined ? lateReason : undefined) : null,
        remarks: remarks !== undefined ? remarks : undefined,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(attendance.id, attendanceId))
      .returning();

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'ATTENDANCE_CORRECTED',
      resource: 'attendance',
      resourceId: attendanceId.toString(),
      details: { previousStatus: existing.status, newStatus: updated.status, studentId: existing.studentId },
      ipAddress: req.ip,
    });

    res.json({ message: 'Attendance record updated successfully', attendance: updated });
  } catch (error: any) {
    console.error('Patch attendance error:', error);
    res.status(500).json({ error: 'Failed to update attendance record' });
  }
});

// ============================================================================
// 9. GET /api/attendance/summary - Statistical Summary
// ============================================================================
attendanceRouter.get('/summary', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    let studentId = req.query.studentId ? parseInt(req.query.studentId as string) : undefined;

    if (user.role === 'student') {
      const s = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      if (s.length === 0) return res.status(404).json({ error: 'Student record not found' });
      if (req.query.studentId && parseInt(req.query.studentId as string) !== s[0].id) {
        return res.status(403).json({ error: 'Access denied: You cannot view attendance summary of other students.' });
      }
      studentId = s[0].id;
    } else if (user.role === 'parent' && studentId) {
      const check = await db
        .select()
        .from(parentStudents)
        .where(and(eq(parentStudents.parentUserId, user.id), eq(parentStudents.studentId, studentId)))
        .limit(1);
      if (check.length === 0) return res.status(403).json({ error: 'Unauthorized to view attendance for this student' });
    } else if (user.role === 'teacher' && studentId) {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher profile not found' });

      const [studentRec] = await db
        .select({ classId: students.classId })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);

      if (!studentRec || !studentRec.classId) {
        return res.status(404).json({ error: 'Student record not found' });
      }

      const [asClassTeacher] = await db
        .select({ id: classes.id })
        .from(classes)
        .where(and(eq(classes.id, studentRec.classId), eq(classes.classTeacherId, t.id)))
        .limit(1);

      const [asAttendanceRecorder] = await db
        .select({ id: classes.id })
        .from(classes)
        .where(and(eq(classes.id, studentRec.classId), eq(classes.attendanceRecorderId, t.id)))
        .limit(1);

      if (!asClassTeacher && !asAttendanceRecorder) {
        const [asSubjectTeacher] = await db
          .select({ id: classSubjects.id })
          .from(classSubjects)
          .where(and(eq(classSubjects.classId, studentRec.classId), eq(classSubjects.teacherId, t.id)))
          .limit(1);

        if (!asSubjectTeacher) {
          return res.status(403).json({ error: 'Access denied: You are not assigned to this student\'s class or subjects.' });
        }
      }
    }

    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required for summary' });
    }

    const [summary] = await db
      .select({
        totalDays: sql<number>`count(*)`,
        present: sql<number>`count(case when ${attendance.status} = 'Present' then 1 end)`,
        absent: sql<number>`count(case when ${attendance.status} = 'Absent' then 1 end)`,
        excused: sql<number>`count(case when ${attendance.status} = 'Excused' then 1 end)`,
        lateArrivals: sql<number>`count(case when ${attendance.isLate} = true then 1 end)`,
        attendanceRate: sql<number>`case when count(*) > 0 then round((count(case when ${attendance.status} = 'Present' then 1 end)::numeric / count(*)::numeric) * 100) else 0 end`,
      })
      .from(attendance)
      .where(eq(attendance.studentId, studentId));

    res.json({
      totalDays: Number(summary?.totalDays || 0),
      present: Number(summary?.present || 0),
      absent: Number(summary?.absent || 0),
      excused: Number(summary?.excused || 0),
      lateArrivals: Number(summary?.lateArrivals || 0),
      attendanceRate: Number(summary?.attendanceRate || 0),
    });
  } catch (error: any) {
    console.error('Attendance summary error:', error);
    res.status(500).json({ error: 'Failed to compute attendance summary' });
  }
});
