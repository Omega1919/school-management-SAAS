import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import {
  homeworks,
  homeworkSubmissions,
  classes,
  subjects,
  teachers,
  students,
  users,
  classSubjects,
  parentStudents,
  academicTerms,
  schoolSettings,
} from '../db/schema.ts';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { getSchoolTime } from '../lib/time.ts';
import { eq, and, desc, sql, count, inArray } from 'drizzle-orm';

export const homeworkRouter = Router();

// Helper to get school timezone and date
async function getSchoolTimezoneAndDate(): Promise<{ timezone: string; todayDate: string }> {
  const [settings] = await db.select().from(schoolSettings).limit(1);
  const timezone = settings?.timezone || 'Africa/Lagos';
  const schoolTime = getSchoolTime(timezone);
  return { timezone, todayDate: schoolTime.dateStr };
}

// ============================================================================
// 1. GET /api/homework/assignments - Returns teacher's assigned classes with their assigned subjects
// ============================================================================
homeworkRouter.get('/assignments', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.json({ classes: [] });

      // Find subjects assigned to this teacher in class_subjects
      const assigned = await db
        .select({
          classId: classSubjects.classId,
          className: classes.name,
          classSection: classes.section,
          subjectId: classSubjects.subjectId,
          subjectCode: subjects.code,
          subjectName: subjects.name,
        })
        .from(classSubjects)
        .innerJoin(classes, eq(classSubjects.classId, classes.id))
        .innerJoin(subjects, eq(classSubjects.subjectId, subjects.id))
        .where(eq(classSubjects.teacherId, t.id));

      // Also find classes where this teacher is the head/class teacher
      const classTeacherClasses = await db
        .select({
          classId: classes.id,
          className: classes.name,
          classSection: classes.section,
        })
        .from(classes)
        .where(eq(classes.classTeacherId, t.id));

      // Group by class
      const classMap = new Map<number, any>();
      for (const row of assigned) {
        if (!classMap.has(row.classId)) {
          classMap.set(row.classId, {
            id: row.classId,
            name: row.className,
            section: row.classSection,
            subjects: [],
          });
        }
        classMap.get(row.classId).subjects.push({
          id: row.subjectId,
          code: row.subjectCode,
          name: row.subjectName,
        });
      }

      for (const c of classTeacherClasses) {
        if (!classMap.has(c.classId)) {
          const clsSubs = await db
            .select({
              subjectId: classSubjects.subjectId,
              subjectCode: subjects.code,
              subjectName: subjects.name,
            })
            .from(classSubjects)
            .innerJoin(subjects, eq(classSubjects.subjectId, subjects.id))
            .where(eq(classSubjects.classId, c.classId));

          classMap.set(c.classId, {
            id: c.classId,
            name: c.className,
            section: c.classSection,
            subjects: clsSubs.map((s) => ({
              id: s.subjectId,
              code: s.subjectCode,
              name: s.subjectName,
            })),
          });
        }
      }

      return res.json({ classes: Array.from(classMap.values()) });
    }

    if (user.role === 'super_admin') {
      const allCls = await db.select().from(classes);
      const allSubs = await db.select().from(subjects);
      const classesWithSubjects = allCls.map((c) => ({
        id: c.id,
        name: c.name,
        section: c.section,
        subjects: allSubs.map((s) => ({ id: s.id, code: s.code, name: s.name })),
      }));
      return res.json({ classes: classesWithSubjects });
    }

    res.json({ classes: [] });
  } catch (error: any) {
    console.error('Fetch teacher assignments error:', error);
    res.status(500).json({ error: 'Failed to retrieve teacher assignments' });
  }
});

// ============================================================================
// 2. GET /api/homework - List homework assignments based on user role
// ============================================================================
homeworkRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.json([]);

      // Fetch homeworks assigned by this teacher or in teacher's subjects/classes
      const hwList = await db
        .select({
          id: homeworks.id,
          title: homeworks.title,
          description: homeworks.description,
          classId: homeworks.classId,
          className: classes.name,
          classSection: classes.section,
          subjectId: homeworks.subjectId,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          dueDate: homeworks.dueDate,
          maxMarks: homeworks.maxMarks,
          status: homeworks.status,
          createdAt: homeworks.createdAt,
        })
        .from(homeworks)
        .innerJoin(classes, eq(homeworks.classId, classes.id))
        .innerJoin(subjects, eq(homeworks.subjectId, subjects.id))
        .where(eq(homeworks.teacherId, t.id))
        .orderBy(desc(homeworks.createdAt));

      const enriched = await Promise.all(
        hwList.map(async (hw) => {
          const [totalStudents] = await db
            .select({ count: count() })
            .from(students)
            .where(and(eq(students.classId, hw.classId), eq(students.status, 'active')));

          const [subCounts] = await db
            .select({
              totalSubmissions: count(),
              gradedSubmissions: sql<number>`count(case when ${homeworkSubmissions.status} = 'graded' then 1 end)`,
            })
            .from(homeworkSubmissions)
            .where(eq(homeworkSubmissions.homeworkId, hw.id));

          return {
            ...hw,
            totalStudents: Number(totalStudents?.count || 0),
            totalSubmissions: Number(subCounts?.totalSubmissions || 0),
            gradedSubmissions: Number(subCounts?.gradedSubmissions || 0),
            pendingToGrade:
              Number(subCounts?.totalSubmissions || 0) - Number(subCounts?.gradedSubmissions || 0),
          };
        })
      );

      return res.json(enriched);
    }

    if (user.role === 'student') {
      const [s] = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      if (!s || !s.classId) return res.json([]);

      const hwList = await db
        .select({
          id: homeworks.id,
          title: homeworks.title,
          description: homeworks.description,
          classId: homeworks.classId,
          className: classes.name,
          subjectId: homeworks.subjectId,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          teacherName: users.fullName,
          dueDate: homeworks.dueDate,
          maxMarks: homeworks.maxMarks,
          status: homeworks.status,
          createdAt: homeworks.createdAt,
        })
        .from(homeworks)
        .innerJoin(classes, eq(homeworks.classId, classes.id))
        .innerJoin(subjects, eq(homeworks.subjectId, subjects.id))
        .innerJoin(teachers, eq(homeworks.teacherId, teachers.id))
        .innerJoin(users, eq(teachers.userId, users.id))
        .where(eq(homeworks.classId, s.classId))
        .orderBy(desc(homeworks.createdAt));

      const enriched = await Promise.all(
        hwList.map(async (hw) => {
          const [submission] = await db
            .select()
            .from(homeworkSubmissions)
            .where(
              and(
                eq(homeworkSubmissions.homeworkId, hw.id),
                eq(homeworkSubmissions.studentId, s!.id)
              )
            )
            .limit(1);

          return {
            ...hw,
            submission: submission
              ? {
                  id: submission.id,
                  submissionText: submission.submissionText,
                  status: submission.status,
                  score: submission.score,
                  feedback: submission.feedback,
                  submittedAt: submission.submittedAt,
                  gradedAt: submission.gradedAt,
                }
              : null,
          };
        })
      );

      return res.json(enriched);
    }

    if (user.role === 'parent') {
      const linked = await db
        .select({ studentId: parentStudents.studentId, classId: students.classId, studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}` })
        .from(parentStudents)
        .innerJoin(students, eq(parentStudents.studentId, students.id))
        .where(eq(parentStudents.parentUserId, user.id));

      if (linked.length === 0) return res.json([]);

      const classIds = Array.from(new Set(linked.map((l) => l.classId).filter((cid): cid is number => cid !== null)));
      if (classIds.length === 0) return res.json([]);

      const hwList = await db
        .select({
          id: homeworks.id,
          title: homeworks.title,
          description: homeworks.description,
          classId: homeworks.classId,
          className: classes.name,
          subjectId: homeworks.subjectId,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          teacherName: users.fullName,
          dueDate: homeworks.dueDate,
          maxMarks: homeworks.maxMarks,
          status: homeworks.status,
          createdAt: homeworks.createdAt,
        })
        .from(homeworks)
        .innerJoin(classes, eq(homeworks.classId, classes.id))
        .innerJoin(subjects, eq(homeworks.subjectId, subjects.id))
        .innerJoin(teachers, eq(homeworks.teacherId, teachers.id))
        .innerJoin(users, eq(teachers.userId, users.id))
        .where(inArray(homeworks.classId, classIds as any))
        .orderBy(desc(homeworks.createdAt));

      const enriched = await Promise.all(
        hwList.map(async (hw) => {
          const childSubmissions = await Promise.all(
            linked
              .filter((l) => l.classId === hw.classId)
              .map(async (child) => {
                const [sub] = await db
                  .select()
                  .from(homeworkSubmissions)
                  .where(
                    and(
                      eq(homeworkSubmissions.homeworkId, hw.id),
                      eq(homeworkSubmissions.studentId, child.studentId)
                    )
                  )
                  .limit(1);

                return {
                  studentId: child.studentId,
                  studentName: child.studentName,
                  submission: sub || null,
                };
              })
          );

          return {
            ...hw,
            children: childSubmissions,
          };
        })
      );

      return res.json(enriched);
    }

    // Super Admin: List all
    const allHw = await db
      .select({
        id: homeworks.id,
        title: homeworks.title,
        description: homeworks.description,
        classId: homeworks.classId,
        className: classes.name,
        subjectId: homeworks.subjectId,
        subjectCode: subjects.code,
        subjectName: subjects.name,
        teacherName: users.fullName,
        dueDate: homeworks.dueDate,
        maxMarks: homeworks.maxMarks,
        status: homeworks.status,
        createdAt: homeworks.createdAt,
      })
      .from(homeworks)
      .innerJoin(classes, eq(homeworks.classId, classes.id))
      .innerJoin(subjects, eq(homeworks.subjectId, subjects.id))
      .innerJoin(teachers, eq(homeworks.teacherId, teachers.id))
      .innerJoin(users, eq(teachers.userId, users.id))
      .orderBy(desc(homeworks.createdAt));

    res.json(allHw);
  } catch (error: any) {
    console.error('Fetch homeworks error:', error);
    res.status(500).json({ error: 'Failed to retrieve homework assignments' });
  }
});

// ============================================================================
// 2b. GET /api/homework/:id - Detail view with all submissions or student's submission
// ============================================================================
homeworkRouter.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const hwId = parseInt(req.params.id);
    const user = req.user!;

    if (isNaN(hwId) || hwId <= 0) {
      return res.status(400).json({ error: 'Invalid homework ID' });
    }

    const [hw] = await db
      .select({
        id: homeworks.id,
        title: homeworks.title,
        description: homeworks.description,
        classId: homeworks.classId,
        className: classes.name,
        classSection: classes.section,
        subjectId: homeworks.subjectId,
        subjectCode: subjects.code,
        subjectName: subjects.name,
        teacherId: homeworks.teacherId,
        dueDate: homeworks.dueDate,
        maxMarks: homeworks.maxMarks,
        status: homeworks.status,
        createdAt: homeworks.createdAt,
      })
      .from(homeworks)
      .innerJoin(classes, eq(homeworks.classId, classes.id))
      .innerJoin(subjects, eq(homeworks.subjectId, subjects.id))
      .where(eq(homeworks.id, hwId))
      .limit(1);

    if (!hw) {
      return res.status(404).json({ error: 'Homework assignment not found' });
    }

    if (user.role === 'teacher' || user.role === 'super_admin') {
      if (user.role === 'teacher') {
        const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
        if (!t) return res.status(403).json({ error: 'Teacher profile not found' });

        const [assigned] = await db
          .select({ id: classSubjects.id })
          .from(classSubjects)
          .where(and(eq(classSubjects.classId, hw.classId), eq(classSubjects.subjectId, hw.subjectId), eq(classSubjects.teacherId, t.id)))
          .limit(1);

        const [isClassTeacher] = await db
          .select({ id: classes.id })
          .from(classes)
          .where(and(eq(classes.id, hw.classId), eq(classes.classTeacherId, t.id)))
          .limit(1);

        if (hw.teacherId !== t.id && !assigned && !isClassTeacher) {
          return res.status(403).json({ error: 'Access denied: You are not assigned to this class or subject.' });
        }
      }

      // Fetch all students in the class
      const classStudentList = await db
        .select({
          studentId: students.id,
          studentCode: students.studentId,
          firstName: students.firstName,
          lastName: students.lastName,
          gender: students.gender,
        })
        .from(students)
        .where(and(eq(students.classId, hw.classId), eq(students.status, 'active')))
        .orderBy(students.lastName, students.firstName);

      const subs = await db
        .select()
        .from(homeworkSubmissions)
        .where(eq(homeworkSubmissions.homeworkId, hwId));

      const subMap = new Map<number, any>();
      for (const s of subs) {
        subMap.set(s.studentId, s);
      }

      const roster = classStudentList.map((st) => {
        const submission = subMap.get(st.studentId);
        return {
          ...st,
          hasSubmitted: !!submission,
          submission: submission || null,
        };
      });

      return res.json({
        ...hw,
        students: roster,
      });
    }

    if (user.role === 'student') {
      const [s] = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      if (!s || s.classId !== hw.classId) {
        return res.status(403).json({ error: 'Access denied: You are not in this class.' });
      }

      const [submission] = await db
        .select()
        .from(homeworkSubmissions)
        .where(and(eq(homeworkSubmissions.homeworkId, hwId), eq(homeworkSubmissions.studentId, s.id)))
        .limit(1);

      return res.json({
        ...hw,
        submission: submission || null,
      });
    }

    if (user.role === 'parent') {
      const linked = await db
        .select({
          studentId: parentStudents.studentId,
          classId: students.classId,
          studentName: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
        })
        .from(parentStudents)
        .innerJoin(students, eq(parentStudents.studentId, students.id))
        .where(eq(parentStudents.parentUserId, user.id));

      const childrenInClass = linked.filter((l) => l.classId === hw.classId);
      if (childrenInClass.length === 0) {
        return res.status(403).json({
          error: 'Access denied: You do not have any child enrolled in this class cohort.',
        });
      }

      const childSubmissions = await Promise.all(
        childrenInClass.map(async (child) => {
          const [submission] = await db
            .select()
            .from(homeworkSubmissions)
            .where(
              and(
                eq(homeworkSubmissions.homeworkId, hwId),
                eq(homeworkSubmissions.studentId, child.studentId)
              )
            )
            .limit(1);

          return {
            studentId: child.studentId,
            studentName: child.studentName,
            submission: submission || null,
          };
        })
      );

      return res.json({
        ...hw,
        children: childSubmissions,
      });
    }

    res.json(hw);
  } catch (error: any) {
    console.error('Fetch homework detail error:', error);
    res.status(500).json({ error: 'Failed to retrieve homework details' });
  }
});

// ============================================================================
// 3. POST /api/homework - Teacher assigns homework to their assigned class & subject
// ============================================================================
homeworkRouter.post('/', requireAuth, requireRole(['teacher', 'super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { title, description, classId, subjectId, dueDate, maxMarks } = req.body;

    if (!title || !description || !classId || !subjectId || !dueDate) {
      return res.status(400).json({
        error: 'Title, description/questions, class, subject, and due date are required',
      });
    }

    const parsedClassId = parseInt(classId);
    const parsedSubjectId = parseInt(subjectId);
    const parsedMaxMarks = maxMarks ? parseInt(maxMarks) : 100;

    if (isNaN(parsedClassId) || isNaN(parsedSubjectId) || isNaN(parsedMaxMarks) || parsedMaxMarks <= 0) {
      return res.status(400).json({ error: 'Invalid class, subject, or max marks value' });
    }

    let teacherId: number;

    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher profile not found' });
      teacherId = t.id;

      // STRICT VALIDATION: Verify this teacher is assigned to this subject and class
      const [assignment] = await db
        .select()
        .from(classSubjects)
        .where(
          and(
            eq(classSubjects.classId, parsedClassId),
            eq(classSubjects.subjectId, parsedSubjectId),
            eq(classSubjects.teacherId, teacherId)
          )
        )
        .limit(1);

      const [asClassTeacher] = await db
        .select()
        .from(classes)
        .where(and(eq(classes.id, parsedClassId), eq(classes.classTeacherId, teacherId)))
        .limit(1);

      if (!assignment && !asClassTeacher) {
        return res.status(403).json({
          error: 'Access denied: You are not assigned to teach this subject in this class.',
        });
      }
    } else {
      // Super admin can explicitly specify teacherId or derive from subject/class allocation
      let targetTeacherId = req.body.teacherId ? parseInt(req.body.teacherId) : null;
      if (targetTeacherId) {
        const [t] = await db.select().from(teachers).where(eq(teachers.id, targetTeacherId)).limit(1);
        if (!t) return res.status(400).json({ error: 'Specified teacher ID does not exist' });
        teacherId = t.id;
      } else {
        const [assigned] = await db
          .select({ teacherId: classSubjects.teacherId })
          .from(classSubjects)
          .where(and(eq(classSubjects.classId, parsedClassId), eq(classSubjects.subjectId, parsedSubjectId)))
          .limit(1);

        if (assigned?.teacherId) {
          teacherId = assigned.teacherId;
        } else {
          const [cls] = await db.select({ classTeacherId: classes.classTeacherId }).from(classes).where(eq(classes.id, parsedClassId)).limit(1);
          if (cls?.classTeacherId) {
            teacherId = cls.classTeacherId;
          } else {
            return res.status(400).json({
              error: 'No valid teacher assigned to this class/subject. Please assign a teacher before creating homework assignments.',
            });
          }
        }
      }
    }

    const [currentTerm] = await db
      .select({ id: academicTerms.id })
      .from(academicTerms)
      .where(eq(academicTerms.isCurrent, true))
      .limit(1);

    const [created] = await db
      .insert(homeworks)
      .values({
        title: String(title).trim(),
        description: String(description).trim(),
        classId: parsedClassId,
        subjectId: parsedSubjectId,
        teacherId,
        termId: currentTerm?.id || null,
        dueDate: String(dueDate).trim(),
        maxMarks: parsedMaxMarks,
        status: 'active',
      })
      .returning();

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'HOMEWORK_CREATED',
      resource: 'homeworks',
      resourceId: created.id.toString(),
      details: { title, classId: parsedClassId, subjectId: parsedSubjectId, dueDate },
      ipAddress: req.ip,
    });

    res.status(201).json(created);
  } catch (error: any) {
    console.error('Create homework error:', error);
    res.status(500).json({ error: 'Failed to create homework assignment' });
  }
});

// ============================================================================
// 3b. GET /api/homework/submissions/student/:studentId - Get homework submissions for a student
// ============================================================================
homeworkRouter.get('/submissions/student/:studentId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const user = req.user!;

    if (user.role === 'student') {
      const s = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      if (s.length === 0 || s[0].id !== studentId) {
        return res.status(403).json({ error: 'Unauthorized to view these homework submissions' });
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
      const [isSubjectTeacher] = await db.select({ id: classSubjects.id }).from(classSubjects).where(and(eq(classSubjects.classId, st.classId), eq(classSubjects.teacherId, t.id))).limit(1);

      if (!isClassTeacher && !isSubjectTeacher) {
        return res.status(403).json({ error: 'Access denied: You do not teach this student.' });
      }
    }

    const subs = await db
      .select({
        id: homeworkSubmissions.id,
        homeworkId: homeworkSubmissions.homeworkId,
        homeworkTitle: homeworks.title,
        subjectName: subjects.name,
        submissionText: homeworkSubmissions.submissionText,
        score: homeworkSubmissions.score,
        maxMarks: homeworks.maxMarks,
        feedback: homeworkSubmissions.feedback,
        status: homeworkSubmissions.status,
        submittedAt: homeworkSubmissions.submittedAt,
        gradedAt: homeworkSubmissions.gradedAt,
      })
      .from(homeworkSubmissions)
      .innerJoin(homeworks, eq(homeworkSubmissions.homeworkId, homeworks.id))
      .innerJoin(subjects, eq(homeworks.subjectId, subjects.id))
      .where(eq(homeworkSubmissions.studentId, studentId))
      .orderBy(desc(homeworkSubmissions.submittedAt));

    res.json(subs);
  } catch (error: any) {
    console.error('Fetch student homework submissions error:', error);
    res.status(500).json({ error: 'Failed to retrieve homework submissions' });
  }
});

// ============================================================================
// 3c. GET /api/homework/submissions/:submissionId - Get specific submission
// ============================================================================
homeworkRouter.get('/submissions/:submissionId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const submissionId = parseInt(req.params.submissionId);
    const user = req.user!;

    const [sub] = await db
      .select({
        id: homeworkSubmissions.id,
        homeworkId: homeworkSubmissions.homeworkId,
        studentId: homeworkSubmissions.studentId,
        submissionText: homeworkSubmissions.submissionText,
        score: homeworkSubmissions.score,
        feedback: homeworkSubmissions.feedback,
        status: homeworkSubmissions.status,
        submittedAt: homeworkSubmissions.submittedAt,
        gradedAt: homeworkSubmissions.gradedAt,
        homeworkTitle: homeworks.title,
        maxMarks: homeworks.maxMarks,
        classId: homeworks.classId,
        teacherId: homeworks.teacherId,
        subjectId: homeworks.subjectId,
      })
      .from(homeworkSubmissions)
      .innerJoin(homeworks, eq(homeworkSubmissions.homeworkId, homeworks.id))
      .where(eq(homeworkSubmissions.id, submissionId))
      .limit(1);

    if (!sub) {
      return res.status(404).json({ error: 'Homework submission not found' });
    }

    if (user.role === 'student') {
      const [s] = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      if (!s || s.id !== sub.studentId) {
        return res.status(403).json({ error: 'Access denied: You cannot view another student\'s submission.' });
      }
    } else if (user.role === 'parent') {
      const [linked] = await db
        .select()
        .from(parentStudents)
        .where(and(eq(parentStudents.parentUserId, user.id), eq(parentStudents.studentId, sub.studentId)))
        .limit(1);
      if (!linked) {
        return res.status(403).json({ error: 'Access denied: You cannot view submissions of unlinked students.' });
      }
    } else if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher profile not found' });

      if (sub.teacherId !== t.id) {
        const [isCt] = await db.select({ id: classes.id }).from(classes).where(and(eq(classes.id, sub.classId), eq(classes.classTeacherId, t.id))).limit(1);
        const [isSubjectTeacher] = await db.select({ id: classSubjects.id }).from(classSubjects).where(and(eq(classSubjects.classId, sub.classId), eq(classSubjects.subjectId, sub.subjectId), eq(classSubjects.teacherId, t.id))).limit(1);
        if (!isCt && !isSubjectTeacher) {
          return res.status(403).json({ error: 'Access denied: You are not assigned to grade or review this submission.' });
        }
      }
    }

    res.json(sub);
  } catch (error: any) {
    console.error('Fetch submission detail error:', error);
    res.status(500).json({ error: 'Failed to retrieve submission details' });
  }
});

// ============================================================================
// 4. POST /api/homework/:id/submit - Student submits answers with strict rules
// ============================================================================
homeworkRouter.post('/:id/submit', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const hwId = parseInt(req.params.id);
    const user = req.user!;
    const { submissionText } = req.body;

    if (isNaN(hwId) || hwId <= 0) {
      return res.status(400).json({ error: 'Invalid homework ID' });
    }

    if (!submissionText || !submissionText.trim()) {
      return res.status(400).json({ error: 'Please enter your answer/solution before submitting.' });
    }

    const [student] = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
    if (!student) {
      return res.status(404).json({ error: 'Student record not found for this account.' });
    }

    const [hw] = await db.select().from(homeworks).where(eq(homeworks.id, hwId)).limit(1);
    if (!hw) {
      return res.status(404).json({ error: 'Homework not found.' });
    }

    // 1. STUDENT MUST BELONG TO HOMEWORK'S CLASS
    if (student.classId !== hw.classId) {
      return res.status(403).json({ error: 'Access denied: You are not enrolled in this class.' });
    }

    // 2. CLOSED HOMEWORK CANNOT BE SUBMITTED
    if (hw.status === 'closed') {
      return res.status(400).json({
        error: 'This homework assignment is closed and is no longer accepting submissions.',
      });
    }

    // Determine school date in configured timezone for due-date enforcement
    const { todayDate } = await getSchoolTimezoneAndDate();
    const isPastDue = todayDate > hw.dueDate;

    // Check existing submission
    const [existing] = await db
      .select()
      .from(homeworkSubmissions)
      .where(and(eq(homeworkSubmissions.homeworkId, hwId), eq(homeworkSubmissions.studentId, student.id)))
      .limit(1);

    if (existing) {
      // 4. STUDENT CANNOT MODIFY A GRADED SUBMISSION
      if (existing.status === 'graded') {
        return res.status(400).json({
          error: 'This homework has already been graded and marked by your teacher. You cannot edit it.',
        });
      }

      // 3. ENFORCE DUE-DATE / LATE SUBMISSION BEHAVIOR
      const newStatus = isPastDue ? 'late' : 'resubmitted';

      const [updated] = await db
        .update(homeworkSubmissions)
        .set({
          submissionText: submissionText.trim(),
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(homeworkSubmissions.id, existing.id))
        .returning();

      await logAuditEvent({
        userId: user.id,
        userEmail: user.email,
        role: user.role,
        action: 'HOMEWORK_SUBMITTED',
        resource: 'homework_submissions',
        resourceId: updated.id.toString(),
        details: { homeworkId: hwId, studentId: student.id, isLate: isPastDue, status: newStatus },
        ipAddress: req.ip,
      });

      return res.json({
        message: isPastDue
          ? 'Homework submission updated (marked as Late).'
          : 'Homework submission updated successfully!',
        submission: updated,
      });
    }

    // 3. CREATE NEW SUBMISSION WITH LATE CHECK
    const initialStatus = isPastDue ? 'late' : 'submitted';

    const [created] = await db
      .insert(homeworkSubmissions)
      .values({
        homeworkId: hwId,
        studentId: student.id,
        submissionText: submissionText.trim(),
        status: initialStatus,
      })
      .returning();

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'HOMEWORK_SUBMITTED',
      resource: 'homework_submissions',
      resourceId: created.id.toString(),
      details: { homeworkId: hwId, studentId: student.id, isLate: isPastDue, status: initialStatus },
      ipAddress: req.ip,
    });

    res.status(201).json({
      message: isPastDue
        ? 'Homework submitted successfully (marked as Late).'
        : 'Homework submitted successfully to your teacher!',
      submission: created,
    });
  } catch (error: any) {
    console.error('Submit homework error:', error);
    res.status(500).json({ error: 'Failed to submit homework answers' });
  }
});

// ============================================================================
// 5. POST /api/homework/:id/grade - Teacher marks and scores a student submission
// ============================================================================
homeworkRouter.post('/:id/grade', requireAuth, requireRole(['teacher', 'super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const hwId = parseInt(req.params.id);
    const user = req.user!;
    const { submissionId, studentId, score, feedback } = req.body;

    if (isNaN(hwId) || hwId <= 0) {
      return res.status(400).json({ error: 'Invalid homework ID' });
    }

    if ((!submissionId && !studentId) || score === undefined || score === null) {
      return res.status(400).json({ error: 'Submission ID or student ID, and score are required.' });
    }

    const [hw] = await db.select().from(homeworks).where(eq(homeworks.id, hwId)).limit(1);
    if (!hw) {
      return res.status(404).json({ error: 'Homework not found.' });
    }

    // Check teacher authorization: creator or assigned subject teacher
    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher profile not found' });

      const [assignedSubject] = await db
        .select({ id: classSubjects.id })
        .from(classSubjects)
        .where(
          and(
            eq(classSubjects.classId, hw.classId),
            eq(classSubjects.subjectId, hw.subjectId),
            eq(classSubjects.teacherId, t.id)
          )
        )
        .limit(1);

      if (hw.teacherId !== t.id && !assignedSubject) {
        return res.status(403).json({ error: 'Access denied: You are not the assigned teacher for this homework.' });
      }
    }

    // Validate score: finite number, between 0 and hw.maxMarks
    const rawNum = typeof score === 'number' ? score : Number(String(score).trim());
    if (typeof rawNum !== 'number' || isNaN(rawNum) || !Number.isFinite(rawNum) || rawNum < 0 || rawNum > hw.maxMarks) {
      return res.status(400).json({
        error: `Score must be a valid finite number between 0 and maximum mark (${hw.maxMarks}).`,
      });
    }

    let submissionQuery = db.select().from(homeworkSubmissions);
    if (submissionId) {
      submissionQuery.where(and(eq(homeworkSubmissions.id, parseInt(submissionId)), eq(homeworkSubmissions.homeworkId, hwId)));
    } else {
      submissionQuery.where(and(eq(homeworkSubmissions.studentId, parseInt(studentId)), eq(homeworkSubmissions.homeworkId, hwId)));
    }
    const [submission] = await submissionQuery.limit(1);

    if (!submission) {
      return res.status(404).json({ error: 'Submission record not found for this homework.' });
    }

    const [updated] = await db
      .update(homeworkSubmissions)
      .set({
        score: rawNum,
        feedback: feedback ? String(feedback).trim() : null,
        status: 'graded',
        gradedBy: user.id,
        gradedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(homeworkSubmissions.id, submission.id))
      .returning();

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'HOMEWORK_GRADED',
      resource: 'homework_submissions',
      resourceId: updated.id.toString(),
      details: { homeworkId: hwId, studentId: submission.studentId, score: rawNum },
      ipAddress: req.ip,
    });

    res.json({
      message: 'Homework marked and graded successfully!',
      submission: updated,
    });
  } catch (error: any) {
    console.error('Grade homework error:', error);
    res.status(500).json({ error: 'Failed to grade homework submission' });
  }
});

homeworkRouter.post('/:homeworkId/submissions/:submissionId/grade', requireAuth, requireRole(['teacher', 'super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const hwId = parseInt(req.params.homeworkId);
    const submissionId = parseInt(req.params.submissionId);
    const user = req.user!;
    const { score, feedback } = req.body;

    if (isNaN(hwId) || isNaN(submissionId) || hwId <= 0 || submissionId <= 0) {
      return res.status(400).json({ error: 'Invalid homework or submission ID' });
    }

    if (score === undefined || score === null) {
      return res.status(400).json({ error: 'Score is required.' });
    }

    const [hw] = await db.select().from(homeworks).where(eq(homeworks.id, hwId)).limit(1);
    if (!hw) {
      return res.status(404).json({ error: 'Homework not found.' });
    }

    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher profile not found' });

      const [assignedSubject] = await db
        .select({ id: classSubjects.id })
        .from(classSubjects)
        .where(
          and(
            eq(classSubjects.classId, hw.classId),
            eq(classSubjects.subjectId, hw.subjectId),
            eq(classSubjects.teacherId, t.id)
          )
        )
        .limit(1);

      if (hw.teacherId !== t.id && !assignedSubject) {
        return res.status(403).json({ error: 'Access denied: You are not the assigned teacher for this homework.' });
      }
    }

    const rawNum = typeof score === 'number' ? score : Number(String(score).trim());
    if (typeof rawNum !== 'number' || isNaN(rawNum) || !Number.isFinite(rawNum) || rawNum < 0 || rawNum > hw.maxMarks) {
      return res.status(400).json({
        error: `Score must be a valid finite number between 0 and maximum mark (${hw.maxMarks}).`,
      });
    }

    const [submission] = await db
      .select()
      .from(homeworkSubmissions)
      .where(and(eq(homeworkSubmissions.id, submissionId), eq(homeworkSubmissions.homeworkId, hwId)))
      .limit(1);

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found for this homework.' });
    }

    const [updated] = await db
      .update(homeworkSubmissions)
      .set({
        score: rawNum,
        feedback: feedback ? String(feedback).trim() : null,
        status: 'graded',
        gradedBy: user.id,
        gradedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(homeworkSubmissions.id, submission.id))
      .returning();

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'HOMEWORK_GRADED',
      resource: 'homework_submissions',
      resourceId: updated.id.toString(),
      details: { homeworkId: hwId, studentId: submission.studentId, score: rawNum },
      ipAddress: req.ip,
    });

    res.json({
      message: 'Homework marked and graded successfully!',
      submission: updated,
    });
  } catch (error: any) {
    console.error('Grade homework error:', error);
    res.status(500).json({ error: 'Failed to grade homework submission' });
  }
});

// ============================================================================
// 6. DELETE /api/homework/:id - Delete homework
// ============================================================================
homeworkRouter.delete('/:id', requireAuth, requireRole(['teacher', 'super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const hwId = parseInt(req.params.id);
    const user = req.user!;

    if (isNaN(hwId) || hwId <= 0) {
      return res.status(400).json({ error: 'Invalid homework ID' });
    }

    const [hw] = await db.select().from(homeworks).where(eq(homeworks.id, hwId)).limit(1);
    if (!hw) {
      return res.status(404).json({ error: 'Homework not found.' });
    }

    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t || hw.teacherId !== t.id) {
        return res.status(403).json({ error: 'Access denied: You cannot delete another teacher\'s homework.' });
      }
    }

    await db.delete(homeworkSubmissions).where(eq(homeworkSubmissions.homeworkId, hwId));
    await db.delete(homeworks).where(eq(homeworks.id, hwId));

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'HOMEWORK_DELETED',
      resource: 'homeworks',
      resourceId: hwId.toString(),
      details: { title: hw.title, classId: hw.classId },
      ipAddress: req.ip,
    });

    res.json({ message: 'Homework deleted successfully.' });
  } catch (error: any) {
    console.error('Delete homework error:', error);
    res.status(500).json({ error: 'Failed to delete homework' });
  }
});
