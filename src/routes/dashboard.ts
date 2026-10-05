import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import {
  students,
  teachers,
  classes,
  academicTerms,
  fees,
  attendance,
  auditLogs,
  announcements,
  parentStudents,
  classSubjects,
  classAttendanceSubmissions,
  users,
} from '../db/schema.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';
import { eq, desc, sql, count, and } from 'drizzle-orm';

export const dashboardRouter = Router();

dashboardRouter.get(['/stats', '/overview'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    // 1. Current Term
    const currentTermRes = await db
      .select()
      .from(academicTerms)
      .where(eq(academicTerms.isCurrent, true))
      .limit(1);
    const currentTerm = currentTermRes[0] || null;

    if (user.role === 'super_admin') {
      // Real database counts
      const [studentCountRes] = await db.select({ count: count() }).from(students);
      const [teacherCountRes] = await db.select({ count: count() }).from(teachers);
      const [classCountRes] = await db.select({ count: count() }).from(classes);

      // Financial aggregates from fees table via SQL SUM
      const [feeSums] = await db
        .select({
          totalInvoiced: sql<number>`coalesce(sum(${fees.amount}), 0)`,
          totalCollected: sql<number>`coalesce(sum(${fees.amountPaid}), 0)`,
          totalOutstanding: sql<number>`coalesce(sum(${fees.outstandingBalance}), 0)`,
        })
        .from(fees);

      // Attendance today aggregated strictly in SQL
      const todayDate = new Date().toISOString().split('T')[0];
      const [todayAttendance] = await db
        .select({
          totalMarked: sql<number>`count(*)`,
          present: sql<number>`count(case when ${attendance.status} = 'Present' then 1 end)`,
          absent: sql<number>`count(case when ${attendance.status} = 'Absent' then 1 end)`,
          excused: sql<number>`count(case when ${attendance.status} = 'Excused' then 1 end)`,
          lateArrivals: sql<number>`count(case when ${attendance.isLate} = true then 1 end)`,
          rate: sql<number>`case when count(*) > 0 then round((count(case when ${attendance.status} = 'Present' then 1 end)::numeric / count(*)::numeric) * 100) else 0 end`,
        })
        .from(attendance)
        .where(eq(attendance.date, todayDate));

      const [classSubmissionStats] = await db
        .select({
          submittedCount: count(classAttendanceSubmissions.id),
        })
        .from(classAttendanceSubmissions)
        .where(eq(classAttendanceSubmissions.date, todayDate));

      // Recent audit activities
      const recentAudit = await db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(6);

      // Recent announcements
      const recentAnnounce = await db
        .select()
        .from(announcements)
        .orderBy(desc(announcements.createdAt))
        .limit(4);

      return res.json({
        role: 'super_admin',
        currentTerm,
        totalStudents: Number(studentCountRes?.count || 0),
        totalTeachers: Number(teacherCountRes?.count || 0),
        totalClasses: Number(classCountRes?.count || 0),
        totalFeesCollected: Number(feeSums?.totalCollected || 0),
        totalOutstandingFees: Number(feeSums?.totalOutstanding || 0),
        todayAttendanceRate: Number(todayAttendance?.rate || 95),
        metrics: {
          students: Number(studentCountRes?.count || 0),
          teachers: Number(teacherCountRes?.count || 0),
          classes: Number(classCountRes?.count || 0),
          totalInvoiced: Number(feeSums?.totalInvoiced || 0),
          totalCollected: Number(feeSums?.totalCollected || 0),
          totalOutstanding: Number(feeSums?.totalOutstanding || 0),
          classesSubmitted: Number(classSubmissionStats?.submittedCount || 0),
          classesTotal: Number(classCountRes?.count || 0),
        },
        attendanceToday: {
          totalMarked: Number(todayAttendance?.totalMarked || 0),
          present: Number(todayAttendance?.present || 0),
          absent: Number(todayAttendance?.absent || 0),
          excused: Number(todayAttendance?.excused || 0),
          lateArrivals: Number(todayAttendance?.lateArrivals || 0),
          rate: Number(todayAttendance?.rate || 95),
          classesSubmitted: Number(classSubmissionStats?.submittedCount || 0),
          classesTotal: Number(classCountRes?.count || 0),
        },
        recentActivities: recentAudit,
        recentAuditLogs: recentAudit,
        recentAnnouncements: recentAnnounce,
      });
    }

    if (user.role === 'teacher') {
      const teacherProfile = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      const teacherId = teacherProfile[0]?.id;

      let assignedClassesCount = 0;
      let assignedSubjectsCount = 0;
      let classTeacherAttendance: any = null;

      if (teacherId) {
        const [teacherStats] = await db
          .select({
            assignedClasses: sql<number>`count(distinct ${classSubjects.classId})`,
            assignedSubjects: sql<number>`count(${classSubjects.id})`,
          })
          .from(classSubjects)
          .where(eq(classSubjects.teacherId, teacherId));

        assignedClassesCount = Number(teacherStats?.assignedClasses || 0);
        assignedSubjectsCount = Number(teacherStats?.assignedSubjects || 0);

        // Check if teacher is a designated Class Teacher
        const todayDate = new Date().toISOString().split('T')[0];
        const [managedClass] = await db
          .select()
          .from(classes)
          .where(eq(classes.classTeacherId, teacherId))
          .limit(1);

        if (managedClass) {
          const [sub] = await db
            .select({
              status: classAttendanceSubmissions.status,
              submittedAt: classAttendanceSubmissions.submittedAt,
              submittedByName: users.fullName,
            })
            .from(classAttendanceSubmissions)
            .leftJoin(users, eq(classAttendanceSubmissions.submittedBy, users.id))
            .where(and(eq(classAttendanceSubmissions.classId, managedClass.id), eq(classAttendanceSubmissions.date, todayDate)))
            .limit(1);

          const [attStats] = await db
            .select({
              totalMarked: count(attendance.id),
              present: sql<number>`count(case when ${attendance.status} = 'Present' then 1 end)`,
              absent: sql<number>`count(case when ${attendance.status} = 'Absent' then 1 end)`,
              excused: sql<number>`count(case when ${attendance.status} = 'Excused' then 1 end)`,
              late: sql<number>`count(case when ${attendance.isLate} = true then 1 end)`,
            })
            .from(attendance)
            .where(and(eq(attendance.classId, managedClass.id), eq(attendance.date, todayDate)));

          classTeacherAttendance = {
            classId: managedClass.id,
            className: managedClass.name,
            isSubmitted: Boolean(sub),
            submittedAt: sub?.submittedAt || null,
            submittedByName: sub?.submittedByName || null,
            totalMarked: Number(attStats?.totalMarked || 0),
            present: Number(attStats?.present || 0),
            absent: Number(attStats?.absent || 0),
            excused: Number(attStats?.excused || 0),
            late: Number(attStats?.late || 0),
          };
        }
      }

      const recentAnnounce = await db
        .select()
        .from(announcements)
        .orderBy(desc(announcements.createdAt))
        .limit(4);

      return res.json({
        role: 'teacher',
        currentTerm,
        metrics: {
          assignedClasses: assignedClassesCount,
          assignedSubjects: assignedSubjectsCount,
        },
        classTeacherAttendance,
        recentAnnouncements: recentAnnounce,
      });
    }

    if (user.role === 'parent') {
      const linkedChildren = await db
        .select({
          id: students.id,
          studentCode: students.studentId,
          name: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
          className: classes.name,
        })
        .from(parentStudents)
        .innerJoin(students, eq(parentStudents.studentId, students.id))
        .leftJoin(classes, eq(students.classId, classes.id))
        .where(eq(parentStudents.parentUserId, user.id));

      return res.json({
        role: 'parent',
        currentTerm,
        linkedChildren,
      });
    }

    if (user.role === 'student') {
      const studentProfile = await db
        .select({
          id: students.id,
          studentCode: students.studentId,
          firstName: students.firstName,
          lastName: students.lastName,
          className: classes.name,
        })
        .from(students)
        .leftJoin(classes, eq(students.classId, classes.id))
        .where(eq(students.userId, user.id))
        .limit(1);

      return res.json({
        role: 'student',
        currentTerm,
        student: studentProfile[0] || null,
      });
    }

    res.json({ role: user.role, currentTerm });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve dashboard statistics' });
  }
});
