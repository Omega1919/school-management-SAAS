import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import {
  results,
  students,
  subjects,
  classes,
  academicTerms,
  academicSessions,
  parentStudents,
  teachers,
  classSubjects,
  attendance,
} from '../db/schema.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';
import { calculateGrade } from '../lib/auth.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { eq, and, desc, sql, count, inArray, or } from 'drizzle-orm';

export const resultsRouter = Router();

export const ALLOWED_ASSESSMENT_TYPES = [
  'Continuous Assessment',
  'Final Exam',
  'Midterm Exam',
  'Test',
  'Assignment',
  'Project',
  'Practical',
];

/**
 * Validates a numeric score within the specified bounds (0 to max).
 * Rejects NaN, Infinity, negative values, and values above max.
 */
function validateScore(
  val: any,
  fieldName: string,
  max: number,
  studentId?: number
): { valid: boolean; score: number; error?: string } {
  if (val === undefined || val === null || val === '') {
    return { valid: true, score: 0 };
  }
  const num = typeof val === 'number' ? val : Number(String(val).trim());
  if (typeof num !== 'number' || isNaN(num) || !Number.isFinite(num)) {
    return {
      valid: false,
      score: 0,
      error: `${fieldName}${studentId ? ` for student ID ${studentId}` : ''} must be a valid finite number.`,
    };
  }
  if (num < 0 || num > max) {
    return {
      valid: false,
      score: 0,
      error: `${fieldName}${studentId ? ` for student ID ${studentId}` : ''} must be between 0 and ${max}. Received: ${num}.`,
    };
  }
  return { valid: true, score: num };
}

// ============================================================================
// 1. GET /api/results - Query results with pagination & session filtering
// ============================================================================
resultsRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    let studentId = req.query.studentId ? parseInt(req.query.studentId as string) : undefined;
    const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined;
    const subjectId = req.query.subjectId ? parseInt(req.query.subjectId as string) : undefined;
    const termId = req.query.termId ? parseInt(req.query.termId as string) : undefined;
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : undefined;

    const conditions: any[] = [];

    // Role verification
    if (user.role === 'student') {
      const s = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      if (s.length === 0) return res.status(404).json({ error: 'Student record not found' });
      if (!req.query.studentId || parseInt(req.query.studentId as string) !== s[0].id) {
        return res.status(403).json({ error: 'Access denied: General results register is restricted. Students must access through their assigned student profile.' });
      }
      studentId = s[0].id;
      conditions.push(eq(results.studentId, studentId));
    } else if (user.role === 'parent') {
      const linked = await db.select().from(parentStudents).where(eq(parentStudents.parentUserId, user.id));
      const allowedIds = linked.map((l) => l.studentId);
      if (allowedIds.length === 0) return res.json([]);
      if (studentId) {
        if (!allowedIds.includes(studentId)) {
          return res.status(403).json({ error: 'Unauthorized to view this student results' });
        }
        conditions.push(eq(results.studentId, studentId));
      } else {
        conditions.push(inArray(results.studentId, allowedIds));
      }
    } else if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher profile not found' });

      const assignedSubjects = await db
        .select({ classId: classSubjects.classId, subjectId: classSubjects.subjectId })
        .from(classSubjects)
        .where(eq(classSubjects.teacherId, t.id));

      const classTeacherClasses = await db
        .select({ id: classes.id })
        .from(classes)
        .where(eq(classes.classTeacherId, t.id));
      const classTeacherClassIds = classTeacherClasses.map((c) => c.id);

      if (assignedSubjects.length === 0 && classTeacherClassIds.length === 0) {
        return res.json([]);
      }

      if (classId) {
        const teachesInClass = assignedSubjects.some((as) => as.classId === classId);
        const isClassTeacher = classTeacherClassIds.includes(classId);
        if (!teachesInClass && !isClassTeacher) {
          return res.status(403).json({ error: 'Access denied: You are not assigned to this class.' });
        }
        conditions.push(eq(results.classId, classId));
      }

      if (subjectId) {
        const teachesSubject = assignedSubjects.some(
          (as) => as.subjectId === subjectId && (!classId || as.classId === classId)
        );
        const isClassTeacher = classId ? classTeacherClassIds.includes(classId) : false;
        if (!teachesSubject && !isClassTeacher) {
          return res.status(403).json({ error: 'Access denied: You are not assigned to this subject.' });
        }
        conditions.push(eq(results.subjectId, subjectId));
      }

      if (!classId && !subjectId) {
        const orClauses = [];
        for (const as of assignedSubjects) {
          orClauses.push(and(eq(results.classId, as.classId), eq(results.subjectId, as.subjectId)));
        }
        if (classTeacherClassIds.length > 0) {
          orClauses.push(inArray(results.classId, classTeacherClassIds));
        }
        if (orClauses.length > 0) {
          conditions.push(or(...orClauses));
        }
      }

      if (studentId) {
        const [st] = await db
          .select({ classId: students.classId })
          .from(students)
          .where(eq(students.id, studentId))
          .limit(1);

        if (!st || !st.classId) {
          return res.status(404).json({ error: 'Student record not found' });
        }

        const isClassTeacher = classTeacherClassIds.includes(st.classId);
        const taughtSubjects = assignedSubjects
          .filter((as) => as.classId === st.classId)
          .map((as) => as.subjectId);

        if (!isClassTeacher && taughtSubjects.length === 0) {
          return res.status(403).json({ error: 'Access denied: You do not teach this student.' });
        }

        if (!isClassTeacher && !subjectId) {
          conditions.push(inArray(results.subjectId, taughtSubjects));
        }
        conditions.push(eq(results.studentId, studentId));
      }
    } else {
      // Super Admin
      if (studentId) conditions.push(eq(results.studentId, studentId));
      if (classId) conditions.push(eq(results.classId, classId));
      if (subjectId) conditions.push(eq(results.subjectId, subjectId));
    }

    if (termId) conditions.push(eq(results.termId, termId));
    if (sessionId) conditions.push(eq(results.sessionId, sessionId));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const isPaginated = req.query.page !== undefined || req.query.paginated === 'true';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(5, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const baseQuery = db
      .select({
        id: results.id,
        studentId: results.studentId,
        studentName: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
        studentCode: students.studentId,
        subjectId: results.subjectId,
        subjectName: subjects.name,
        subjectCode: subjects.code,
        classId: results.classId,
        className: classes.name,
        sessionId: results.sessionId,
        sessionName: academicSessions.name,
        termId: results.termId,
        termName: academicTerms.termName,
        assessmentType: results.assessmentType,
        testScore: results.testScore,
        examScore: results.examScore,
        totalScore: results.totalScore,
        maxMarks: results.maxMarks,
        grade: results.grade,
        status: results.status,
        remarks: results.remarks,
        updatedAt: results.updatedAt,
      })
      .from(results)
      .innerJoin(students, eq(results.studentId, students.id))
      .innerJoin(subjects, eq(results.subjectId, subjects.id))
      .innerJoin(classes, eq(results.classId, classes.id))
      .innerJoin(academicTerms, eq(results.termId, academicTerms.id))
      .leftJoin(academicSessions, eq(results.sessionId, academicSessions.id))
      .where(whereClause)
      .orderBy(subjects.name, desc(results.updatedAt));

    if (isPaginated) {
      const [totalRes] = await db
        .select({ count: count() })
        .from(results)
        .where(whereClause);
      const total = totalRes?.count || 0;
      const items = await baseQuery.limit(limit).offset(offset);
      return res.json({
        data: items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    const items = await baseQuery;
    res.json(items);
  } catch (error: any) {
    console.error('Fetch results error:', error);
    res.status(500).json({ error: 'Failed to retrieve academic results' });
  }
});

// ============================================================================
// 1b. GET /api/results/student/:studentId - Get results for a specific student
// ============================================================================
resultsRouter.get('/student/:studentId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const user = req.user!;

    if (user.role === 'student') {
      const s = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      if (s.length === 0 || s[0].id !== studentId) {
        return res.status(403).json({ error: 'Unauthorized to view these student results' });
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

    const items = await db
      .select({
        id: results.id,
        studentId: results.studentId,
        studentName: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
        studentCode: students.studentId,
        subjectId: results.subjectId,
        subjectName: subjects.name,
        subjectCode: subjects.code,
        classId: results.classId,
        className: classes.name,
        sessionId: results.sessionId,
        sessionName: academicSessions.name,
        termId: results.termId,
        termName: academicTerms.termName,
        assessmentType: results.assessmentType,
        testScore: results.testScore,
        examScore: results.examScore,
        totalScore: results.totalScore,
        maxMarks: results.maxMarks,
        grade: results.grade,
        status: results.status,
        remarks: results.remarks,
        updatedAt: results.updatedAt,
      })
      .from(results)
      .innerJoin(students, eq(results.studentId, students.id))
      .innerJoin(subjects, eq(results.subjectId, subjects.id))
      .innerJoin(classes, eq(results.classId, classes.id))
      .innerJoin(academicTerms, eq(results.termId, academicTerms.id))
      .leftJoin(academicSessions, eq(results.sessionId, academicSessions.id))
      .where(eq(results.studentId, studentId))
      .orderBy(subjects.name, desc(results.updatedAt));

    res.json(items);
  } catch (error: any) {
    console.error('Fetch student results error:', error);
    res.status(500).json({ error: 'Failed to retrieve student results' });
  }
});

// ============================================================================
// 2. POST /api/results/batch & POST /api/results - Enter assessment scores with strict validation
// ============================================================================
const handleResultsBatchSubmission = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'super_admin' && user.role !== 'teacher') {
      return res.status(403).json({ error: 'Only teachers and administrators can enter academic scores' });
    }

    const { classId, subjectId, termId, sessionId, assessmentType, entries, records } = req.body;
    const rawEntries = entries || records;

    if (!classId || !subjectId || !Array.isArray(rawEntries) || rawEntries.length === 0) {
      return res.status(400).json({ error: 'classId, subjectId, and non-empty entries/records array are required' });
    }

    const parsedClassId = parseInt(classId);
    const parsedSubjectId = parseInt(subjectId);
    let parsedTermId = termId ? parseInt(termId) : null;

    if (isNaN(parsedClassId) || parsedClassId <= 0) {
      return res.status(400).json({ error: 'Invalid classId provided' });
    }
    if (isNaN(parsedSubjectId) || parsedSubjectId <= 0) {
      return res.status(400).json({ error: 'Invalid subjectId provided' });
    }

    // Determine target session ID and term ID if not explicitly supplied
    let targetSessionId = sessionId ? parseInt(sessionId) : null;
    if (!parsedTermId) {
      const [currentTerm] = await db.select().from(academicTerms).where(eq(academicTerms.isCurrent, true)).limit(1);
      if (currentTerm) {
        parsedTermId = currentTerm.id;
        if (!targetSessionId) targetSessionId = currentTerm.sessionId;
      } else {
        const [anyTerm] = await db.select().from(academicTerms).limit(1);
        if (anyTerm) {
          parsedTermId = anyTerm.id;
          if (!targetSessionId) targetSessionId = anyTerm.sessionId;
        } else {
          return res.status(400).json({ error: 'No active academic term found. termId is required.' });
        }
      }
    } else if (!targetSessionId) {
      const [term] = await db.select().from(academicTerms).where(eq(academicTerms.id, parsedTermId)).limit(1);
      if (term && term.sessionId) targetSessionId = term.sessionId;
    }

    // 1. REJECT INVALID ASSESSMENT TYPES
    const type = assessmentType || 'Final Exam';
    if (!ALLOWED_ASSESSMENT_TYPES.includes(type)) {
      return res.status(400).json({
        error: `Invalid assessment type '${type}'. Allowed types are: ${ALLOWED_ASSESSMENT_TYPES.join(', ')}.`,
      });
    }

    // 2. TEACHER SUBJECT-ASSIGNMENT AUTHORIZATION
    if (user.role === 'teacher') {
      const [teacherRecord] = await db
        .select()
        .from(teachers)
        .where(eq(teachers.userId, user.id))
        .limit(1);

      if (!teacherRecord) {
        return res.status(403).json({ error: 'Teacher profile not found for current user' });
      }

      const [assignedSubject] = await db
        .select({ id: classSubjects.id })
        .from(classSubjects)
        .where(
          and(
            eq(classSubjects.classId, parsedClassId),
            eq(classSubjects.subjectId, parsedSubjectId),
            eq(classSubjects.teacherId, teacherRecord.id)
          )
        )
        .limit(1);

      if (!assignedSubject) {
        return res.status(403).json({
          error: 'Access denied: Only the assigned subject teacher or School Administrator can enter results for this subject. Class Teacher status alone does not grant subject grading permission.',
        });
      }
    }

    // 3. REJECT DUPLICATE STUDENT IDS & VALIDATE STUDENT IDS
    const rawStudentIds: number[] = [];
    const seenStudentIds = new Set<number>();
    for (const entry of rawEntries) {
      const sid = parseInt(entry.studentId);
      if (isNaN(sid) || sid <= 0) {
        return res.status(400).json({ error: 'All results entries must contain a valid positive student ID' });
      }
      if (seenStudentIds.has(sid)) {
        return res.status(400).json({ error: `Duplicate student ID ${sid} detected in results submission.` });
      }
      seenStudentIds.add(sid);
      rawStudentIds.push(sid);
    }

    // 4. VERIFY ALL STUDENTS BELONG TO THE TARGET CLASS
    const enrolledStudents = await db
      .select({ id: students.id, classId: students.classId })
      .from(students)
      .where(inArray(students.id, rawStudentIds));

    const studentClassMap = new Map(enrolledStudents.map((s) => [s.id, s.classId]));
    for (const sid of rawStudentIds) {
      const studentClassId = studentClassMap.get(sid);
      if (studentClassId === undefined || studentClassId !== parsedClassId) {
        return res.status(400).json({
          error: `Cross-class IDOR blocked: Student ID ${sid} is not enrolled in class ${parsedClassId}.`,
        });
      }
    }

    // 5. VALIDATE SCORES (testScore 0–40, examScore 0–60, reject NaN/Infinity/negative)
    const validatedEntries: Array<{
      studentId: number;
      testScore: number;
      examScore: number;
      totalScore: number;
      grade: string;
      remarks: string;
    }> = [];

    for (const entry of rawEntries) {
      const sid = parseInt(entry.studentId);
      const rawTest = entry.testScore !== undefined ? entry.testScore : entry.caScore;
      const rawExam = entry.examScore;

      const testValidation = validateScore(rawTest, 'Test score', 40, sid);
      if (!testValidation.valid) {
        return res.status(400).json({ error: testValidation.error });
      }

      const examValidation = validateScore(rawExam, 'Exam score', 60, sid);
      if (!examValidation.valid) {
        return res.status(400).json({ error: examValidation.error });
      }

      const test = testValidation.score;
      const exam = examValidation.score;
      const total = test + exam;
      const { grade, remarks } = calculateGrade(total);

      validatedEntries.push({
        studentId: sid,
        testScore: test,
        examScore: exam,
        totalScore: total,
        grade,
        remarks: entry.remarks ? String(entry.remarks).trim() : remarks,
      });
    }

    // 6. ATOMIC TRANSACTION FOR RESULTS BATCH WRITE
    await db.transaction(async (tx) => {
      for (const entry of validatedEntries) {
        const existing = await tx
          .select({ id: results.id })
          .from(results)
          .where(
            and(
              eq(results.studentId, entry.studentId),
              eq(results.subjectId, parsedSubjectId),
              eq(results.termId, parsedTermId!),
              eq(results.assessmentType, type)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          await tx
            .update(results)
            .set({
              classId: parsedClassId,
              sessionId: targetSessionId,
              testScore: entry.testScore,
              examScore: entry.examScore,
              totalScore: entry.totalScore,
              grade: entry.grade,
              remarks: entry.remarks,
              status: 'published',
              enteredBy: user.id,
              updatedAt: new Date(),
            })
            .where(eq(results.id, existing[0].id));
        } else {
          await tx.insert(results).values({
            studentId: entry.studentId,
            subjectId: parsedSubjectId,
            classId: parsedClassId,
            termId: parsedTermId!,
            sessionId: targetSessionId,
            assessmentType: type,
            testScore: entry.testScore,
            examScore: entry.examScore,
            totalScore: entry.totalScore,
            grade: entry.grade,
            status: 'published',
            remarks: entry.remarks,
            enteredBy: user.id,
          });
        }
      }
    });

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'RESULTS_ENTERED',
      resource: 'results',
      details: { classId: parsedClassId, subjectId: parsedSubjectId, termId: parsedTermId, count: validatedEntries.length, assessmentType: type },
      ipAddress: req.ip,
    });

    res.json({ success: true, count: validatedEntries.length });
  } catch (error: any) {
    console.error('Record results error:', error);
    res.status(500).json({ error: 'Failed to record results' });
  }
};

resultsRouter.post('/batch', requireAuth, handleResultsBatchSubmission);
resultsRouter.post('/', requireAuth, handleResultsBatchSubmission);

// ============================================================================
// 3. GET /api/results/report-card/:studentId - Comprehensive Terminal Report Card
// ============================================================================
resultsRouter.get('/report-card/:studentId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const user = req.user!;

    if (user.role === 'student') {
      const s = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      if (s.length === 0 || s[0].id !== studentId) {
        return res.status(403).json({ error: 'Unauthorized to view this report card' });
      }
    } else if (user.role === 'parent') {
      const linked = await db
        .select()
        .from(parentStudents)
        .where(and(eq(parentStudents.parentUserId, user.id), eq(parentStudents.studentId, studentId)))
        .limit(1);
      if (linked.length === 0) {
        return res.status(403).json({ error: 'Unauthorized to view this report card' });
      }
    } else if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher profile not found' });

      const [studentRec] = await db.select({ classId: students.classId }).from(students).where(eq(students.id, studentId)).limit(1);
      if (!studentRec || !studentRec.classId) {
        return res.status(404).json({ error: 'Student or class not found' });
      }

      const [classTeacherMatch] = await db
        .select({ id: classes.id })
        .from(classes)
        .where(and(eq(classes.id, studentRec.classId), eq(classes.classTeacherId, t.id)))
        .limit(1);

      if (!classTeacherMatch) {
        const [subjectTeacherMatch] = await db
          .select({ id: classSubjects.id })
          .from(classSubjects)
          .where(and(eq(classSubjects.classId, studentRec.classId), eq(classSubjects.teacherId, t.id)))
          .limit(1);

        if (!subjectTeacherMatch) {
          return res.status(403).json({ error: 'Access denied: You do not teach this student.' });
        }
      }
    }

    const s = await db
      .select({
        id: students.id,
        studentId: students.studentId,
        firstName: students.firstName,
        lastName: students.lastName,
        classId: students.classId,
        className: classes.name,
        currentSessionId: students.currentSessionId,
        sessionName: academicSessions.name,
      })
      .from(students)
      .leftJoin(classes, eq(students.classId, classes.id))
      .leftJoin(academicSessions, eq(students.currentSessionId, academicSessions.id))
      .where(eq(students.id, studentId))
      .limit(1);

    if (s.length === 0) return res.status(404).json({ error: 'Student not found' });

    let termId = req.query.termId ? parseInt(req.query.termId as string) : undefined;
    if (!termId) {
      const curr = await db.select().from(academicTerms).where(eq(academicTerms.isCurrent, true)).limit(1);
      if (curr.length > 0) termId = curr[0].id;
    }

    const termCondition = termId ? eq(results.termId, termId) : undefined;

    const termResults = await db
      .select({
        subjectId: results.subjectId,
        subjectName: subjects.name,
        subjectCode: subjects.code,
        testScore: results.testScore,
        examScore: results.examScore,
        totalScore: results.totalScore,
        grade: results.grade,
        remarks: results.remarks,
        assessmentType: results.assessmentType,
      })
      .from(results)
      .innerJoin(subjects, eq(results.subjectId, subjects.id))
      .where(and(eq(results.studentId, studentId), termCondition))
      .orderBy(subjects.name);

    // Attendance rate for this term
    let attendanceSummary = { totalDays: 0, presentDays: 0, percentage: 100 };
    if (termId) {
      const [totalAtt] = await db
        .select({ count: count() })
        .from(attendance)
        .where(and(eq(attendance.studentId, studentId), eq(attendance.termId, termId)));
      const [presentAtt] = await db
        .select({ count: count() })
        .from(attendance)
        .where(and(eq(attendance.studentId, studentId), eq(attendance.termId, termId), eq(attendance.status, 'Present')));

      const total = totalAtt?.count || 0;
      const present = presentAtt?.count || 0;
      attendanceSummary = {
        totalDays: total,
        presentDays: present,
        percentage: total > 0 ? Math.round((present / total) * 100) : 100,
      };
    }

    const subjectCount = termResults.length;
    const grandTotal = termResults.reduce((sum, r) => sum + r.totalScore, 0);
    const average = subjectCount > 0 ? (grandTotal / subjectCount).toFixed(1) : '0.0';

    res.json({
      student: s[0],
      termId,
      results: termResults,
      attendance: attendanceSummary,
      summary: {
        totalSubjects: subjectCount,
        grandTotal,
        averagePercentage: Number(average),
        overallGrade: calculateGrade(Number(average)).grade,
      },
    });
  } catch (error: any) {
    console.error('Report card error:', error);
    res.status(500).json({ error: 'Failed to generate report card' });
  }
});

// ============================================================================
// 4. PATCH /api/results/:id - Modify single result with strict authorization & validation
// ============================================================================
resultsRouter.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const resultId = parseInt(req.params.id);
    const user = req.user!;

    if (isNaN(resultId) || resultId <= 0) {
      return res.status(400).json({ error: 'Invalid result ID provided' });
    }

    if (user.role !== 'teacher' && user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: Students and parents cannot modify academic results.' });
    }

    const [existing] = await db.select().from(results).where(eq(results.id, resultId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Result record not found' });
    }

    // Authorization: Only assigned subject teacher for this class & subject or Super Admin
    if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher profile not found' });

      const [assignedSubject] = await db
        .select({ id: classSubjects.id })
        .from(classSubjects)
        .where(
          and(
            eq(classSubjects.classId, existing.classId),
            eq(classSubjects.subjectId, existing.subjectId),
            eq(classSubjects.teacherId, t.id)
          )
        )
        .limit(1);

      if (!assignedSubject) {
        return res.status(403).json({
          error: 'Access denied: Only the assigned subject teacher or School Administrator can modify results for this subject.',
        });
      }
    }

    // Consistent validation with batch endpoint
    let testScore = existing.testScore;
    let examScore = existing.examScore;

    const rawTest = req.body.testScore !== undefined ? req.body.testScore : req.body.caScore;
    if (rawTest !== undefined) {
      const testValidation = validateScore(rawTest, 'Test score', 40);
      if (!testValidation.valid) {
        return res.status(400).json({ error: testValidation.error });
      }
      testScore = testValidation.score;
    }

    if (req.body.examScore !== undefined) {
      const examValidation = validateScore(req.body.examScore, 'Exam score', 60);
      if (!examValidation.valid) {
        return res.status(400).json({ error: examValidation.error });
      }
      examScore = examValidation.score;
    }

    const totalScore = testScore + examScore;
    const gradeInfo = calculateGrade(totalScore);

    const [updated] = await db
      .update(results)
      .set({
        testScore,
        examScore,
        totalScore,
        grade: gradeInfo.grade,
        remarks: req.body.remarks !== undefined ? String(req.body.remarks).trim() : existing.remarks,
        updatedAt: new Date(),
      })
      .where(eq(results.id, resultId))
      .returning();

    await logAuditEvent({
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      action: 'RESULT_UPDATED',
      resource: 'results',
      resourceId: resultId.toString(),
      details: { previousTotal: existing.totalScore, newTotal: totalScore, studentId: existing.studentId },
      ipAddress: req.ip,
    });

    res.json({ message: 'Result updated successfully', result: updated });
  } catch (error: any) {
    console.error('Update result error:', error);
    res.status(500).json({ error: 'Failed to update result record' });
  }
});
