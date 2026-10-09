import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import {
  students,
  classes,
  parentStudents,
  parentInvitations,
  users,
  teachers,
  classSubjects,
  studentEnrollments,
  academicSessions,
  academicTerms,
  attendance,
  results,
  fees,
  homeworks,
  homeworkSubmissions,
  subjects,
} from '../db/schema.ts';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import {
  generateUniqueStudentId,
  generateSecureToken,
  hashToken,
} from '../lib/identifiers.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { eq, and, or, ilike, sql, desc, count, inArray } from 'drizzle-orm';

export const studentsRouter = Router();

// 1. GET /api/students/me - Get logged in student's own record (or parent's linked child)
studentsRouter.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    let studentRecord: any = null;

    if (user.role === 'parent') {
      const [link] = await db
        .select({ studentId: parentStudents.studentId })
        .from(parentStudents)
        .where(eq(parentStudents.parentUserId, user.id))
        .limit(1);

      if (link) {
        [studentRecord] = await db
          .select({
            id: students.id,
            userId: students.userId,
            studentId: students.studentId,
            firstName: students.firstName,
            lastName: students.lastName,
            dateOfBirth: students.dateOfBirth,
            gender: students.gender,
            classId: students.classId,
            className: classes.name,
            currentSessionId: students.currentSessionId,
            sessionName: academicSessions.name,
            admissionDate: students.admissionDate,
            address: students.address,
            emergencyContact: students.emergencyContact,
            status: students.status,
          })
          .from(students)
          .leftJoin(classes, eq(students.classId, classes.id))
          .leftJoin(academicSessions, eq(students.currentSessionId, academicSessions.id))
          .where(eq(students.id, link.studentId))
          .limit(1);
      }
    }

    if (!studentRecord && user.role === 'student') {
      [studentRecord] = await db
        .select({
          id: students.id,
          userId: students.userId,
          studentId: students.studentId,
          firstName: students.firstName,
          lastName: students.lastName,
          dateOfBirth: students.dateOfBirth,
          gender: students.gender,
          classId: students.classId,
          className: classes.name,
          currentSessionId: students.currentSessionId,
          sessionName: academicSessions.name,
          admissionDate: students.admissionDate,
          address: students.address,
          emergencyContact: students.emergencyContact,
          status: students.status,
        })
        .from(students)
        .leftJoin(classes, eq(students.classId, classes.id))
        .leftJoin(academicSessions, eq(students.currentSessionId, academicSessions.id))
        .where(eq(students.userId, user.id))
        .limit(1);
    }

    if (!studentRecord) {
      return res.status(404).json({ error: 'Student record not found for this account' });
    }

    res.json(studentRecord);
  } catch (error: any) {
    console.error('Fetch student /me error:', error);
    res.status(500).json({ error: 'Failed to retrieve student profile' });
  }
});

// 2. GET /api/students - Paginated, searchable, filterable with academic session support
studentsRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userRole = req.user!.role;
    if (userRole !== 'super_admin' && userRole !== 'teacher') {
      return res.status(403).json({ error: 'Access denied. Only staff can view the full student directory.' });
    }

    const isAll = req.query.all === 'true' || req.query.limit === 'all';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = isAll ? 1000 : Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = isAll ? 0 : (page - 1) * limit;

    const searchQuery = (req.query.q as string || '').trim();
    const classId = req.query.classId ? parseInt(req.query.classId as string) : undefined;
    const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : undefined;
    const status = (req.query.status as string || '').trim();

    const conditions = [];

    if (userRole === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, req.user!.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher record not found' });

      const classTeacherClasses = await db.select({ id: classes.id }).from(classes).where(eq(classes.classTeacherId, t.id));
      const subjectClasses = await db.select({ id: classSubjects.classId }).from(classSubjects).where(eq(classSubjects.teacherId, t.id));

      const assignedClassIds = Array.from(new Set([
        ...classTeacherClasses.map((c) => c.id),
        ...subjectClasses.map((c) => c.id),
      ]));

      if (classId) {
        if (!assignedClassIds.includes(classId)) {
          return res.status(403).json({ error: 'Access denied: You are not assigned to this class.' });
        }
        conditions.push(eq(students.classId, classId));
      } else {
        if (assignedClassIds.length === 0) {
          return res.json({ data: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } });
        }
        conditions.push(inArray(students.classId, assignedClassIds));
      }
    } else {
      if (classId) {
        conditions.push(eq(students.classId, classId));
      }
    }

    if (sessionId) {
      conditions.push(eq(students.currentSessionId, sessionId));
    }

    if (searchQuery) {
      const numId = parseInt(searchQuery, 10);
      const studentSearchConditions = [
        ilike(students.firstName, `%${searchQuery}%`),
        ilike(students.lastName, `%${searchQuery}%`),
        ilike(students.studentId, `%${searchQuery}%`),
        ilike(sql`concat(${students.firstName}, ' ', ${students.lastName})`, `%${searchQuery}%`),
      ];
      if (!isNaN(numId)) {
        studentSearchConditions.push(eq(students.id, numId));
      }
      conditions.push(or(...studentSearchConditions));
    }

    if (status) {
      conditions.push(eq(students.status, status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalCountRes = await db
      .select({ count: count() })
      .from(students)
      .where(whereClause);

    const total = totalCountRes[0]?.count || 0;

    const list = await db
      .select({
        id: students.id,
        userId: students.userId,
        studentId: students.studentId,
        firstName: students.firstName,
        lastName: students.lastName,
        dateOfBirth: students.dateOfBirth,
        gender: students.gender,
        classId: students.classId,
        className: classes.name,
        currentSessionId: students.currentSessionId,
        sessionName: academicSessions.name,
        admissionDate: students.admissionDate,
        address: students.address,
        emergencyContact: students.emergencyContact,
        status: students.status,
        hasAccount: sql<boolean>`${students.userId} IS NOT NULL`,
        hasEnrollmentToken: sql<boolean>`${students.enrollmentToken} IS NOT NULL`,
        createdAt: students.createdAt,
      })
      .from(students)
      .leftJoin(classes, eq(students.classId, classes.id))
      .leftJoin(academicSessions, eq(students.currentSessionId, academicSessions.id))
      .where(whereClause)
      .orderBy(desc(students.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      data: list,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Fetch students error:', error);
    res.status(500).json({ error: 'Failed to retrieve students' });
  }
});

// 3. POST /api/students - Super admin creates student record with enrollment & session tracking
studentsRouter.post('/', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { firstName, lastName, dateOfBirth, gender, classId, sessionId, admissionDate, address, emergencyContact } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }

    // Determine current academic session
    let targetSessionId = sessionId ? parseInt(sessionId) : null;
    if (!targetSessionId) {
      const [curSession] = await db.select().from(academicSessions).where(eq(academicSessions.isCurrent, true)).limit(1);
      if (curSession) targetSessionId = curSession.id;
    }

    const studentId = await generateUniqueStudentId();
    const rawEnrollmentToken = generateSecureToken('ENR');
    const enrollmentTokenHash = hashToken(rawEnrollmentToken);
    const enrollmentTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const admDate = admissionDate || new Date().toISOString().split('T')[0];

    const result = await db.transaction(async (tx) => {
      const [newStudent] = await tx
        .insert(students)
        .values({
          studentId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dateOfBirth: dateOfBirth || null,
          gender: gender || 'Other',
          classId: classId ? parseInt(classId) : null,
          currentSessionId: targetSessionId,
          admissionDate: admDate,
          address: address || null,
          emergencyContact: emergencyContact || null,
          status: 'active',
          enrollmentToken: enrollmentTokenHash,
          enrollmentTokenExpiresAt,
        })
        .returning();

      // Create initial studentEnrollments record if class and session are assigned
      if (classId && targetSessionId) {
        await tx
          .insert(studentEnrollments)
          .values({
            studentId: newStudent.id,
            classId: parseInt(classId),
            sessionId: targetSessionId,
            enrollmentDate: admDate,
            status: 'enrolled',
          })
          .onConflictDoNothing();
      }

      return newStudent;
    });

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'STUDENT_ENROLLED',
      resource: 'students',
      resourceId: result.id.toString(),
      details: { studentId: result.studentId, name: `${firstName} ${lastName}`, classId, sessionId: targetSessionId },
      ipAddress: req.ip,
    });

    res.status(201).json({
      ...result,
      enrollmentToken: rawEnrollmentToken,
    });
  } catch (error: any) {
    console.error('Create student error:', error);
    res.status(500).json({ error: 'Failed to create student record' });
  }
});

// 4. GET /api/students/:id/enrollment-history - Retrieve full multi-year class and session history
studentsRouter.get('/:id/enrollment-history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.id);
    const user = req.user!;

    if (user.role === 'student') {
      const [self] = await db.select().from(students).where(eq(students.userId, user.id)).limit(1);
      if (!self || self.id !== studentId) {
        return res.status(403).json({ error: 'Unauthorized to view this history' });
      }
    } else if (user.role === 'parent') {
      const [linked] = await db
        .select()
        .from(parentStudents)
        .where(and(eq(parentStudents.parentUserId, user.id), eq(parentStudents.studentId, studentId)))
        .limit(1);
      if (!linked) {
        return res.status(403).json({ error: 'Unauthorized to view this child history' });
      }
    } else if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher record not found' });
      const [st] = await db.select({ classId: students.classId }).from(students).where(eq(students.id, studentId)).limit(1);
      if (!st || !st.classId) return res.status(404).json({ error: 'Student record not found' });
      const [ct] = await db.select({ id: classes.id }).from(classes).where(and(eq(classes.id, st.classId), eq(classes.classTeacherId, t.id))).limit(1);
      const [cs] = await db.select({ id: classSubjects.id }).from(classSubjects).where(and(eq(classSubjects.classId, st.classId), eq(classSubjects.teacherId, t.id))).limit(1);
      if (!ct && !cs) {
        return res.status(403).json({ error: 'Access denied: You are not assigned to this student.' });
      }
    } else if (user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: Unauthorized role.' });
    }

    const history = await db
      .select({
        id: studentEnrollments.id,
        sessionId: studentEnrollments.sessionId,
        sessionName: academicSessions.name,
        classId: studentEnrollments.classId,
        className: classes.name,
        enrollmentDate: studentEnrollments.enrollmentDate,
        status: studentEnrollments.status,
        academicAverage: studentEnrollments.academicAverage,
        attendanceRate: studentEnrollments.attendanceRate,
        remarks: studentEnrollments.remarks,
        createdAt: studentEnrollments.createdAt,
      })
      .from(studentEnrollments)
      .innerJoin(academicSessions, eq(studentEnrollments.sessionId, academicSessions.id))
      .innerJoin(classes, eq(studentEnrollments.classId, classes.id))
      .where(eq(studentEnrollments.studentId, studentId))
      .orderBy(desc(academicSessions.startDate), desc(studentEnrollments.createdAt));

    res.json(history);
  } catch (error: any) {
    console.error('Fetch student history error:', error);
    res.status(500).json({ error: 'Failed to retrieve enrollment history' });
  }
});

// 5. POST /api/students/:id/promote - Promote individual student to next class/session
studentsRouter.post('/:id/promote', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.id);
    const { targetClassId, targetSessionId, status, remarks } = req.body;

    if (!targetClassId || !targetSessionId) {
      return res.status(400).json({ error: 'Target class and academic session are required for promotion/progression' });
    }

    const [s] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
    if (!s) return res.status(404).json({ error: 'Student not found' });

    const newClassId = parseInt(targetClassId);
    const newSessionId = parseInt(targetSessionId);
    const promotionStatus = status || 'promoted';

    await db.transaction(async (tx) => {
      // Mark previous enrollment as promoted if existing
      if (s.currentSessionId && s.classId) {
        await tx
          .update(studentEnrollments)
          .set({
            status: 'promoted',
            promotedToClassId: newClassId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(studentEnrollments.studentId, studentId),
              eq(studentEnrollments.sessionId, s.currentSessionId),
              eq(studentEnrollments.classId, s.classId)
            )
          );
      }

      // Insert new session enrollment
      await tx
        .insert(studentEnrollments)
        .values({
          studentId,
          classId: newClassId,
          sessionId: newSessionId,
          enrollmentDate: new Date().toISOString().split('T')[0],
          status: 'enrolled',
          remarks: remarks || `Promoted from class ID ${s.classId}`,
        })
        .onConflictDoUpdate({
          target: [studentEnrollments.studentId, studentEnrollments.sessionId, studentEnrollments.classId],
          set: {
            status: 'enrolled',
            remarks: remarks || 'Updated enrollment',
            updatedAt: new Date(),
          },
        });

      // Update student's active class & session
      await tx
        .update(students)
        .set({
          classId: newClassId,
          currentSessionId: newSessionId,
          updatedAt: new Date(),
        })
        .where(eq(students.id, studentId));
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'STUDENT_PROMOTED',
      resource: 'students',
      resourceId: studentId.toString(),
      details: { fromClass: s.classId, toClass: newClassId, sessionId: newSessionId, status: promotionStatus },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Student promoted successfully' });
  } catch (error: any) {
    console.error('Promote student error:', error);
    res.status(500).json({ error: 'Failed to promote student' });
  }
});

// 6. POST /api/students/bulk-promote - Bulk promote an entire class cohort
studentsRouter.post('/bulk-promote', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { fromClassId, toClassId, targetSessionId, studentIds, remarks } = req.body;

    if (!toClassId || !targetSessionId) {
      return res.status(400).json({ error: 'Target class and academic session are required' });
    }

    const newClassId = parseInt(toClassId);
    const newSessionId = parseInt(targetSessionId);
    const today = new Date().toISOString().split('T')[0];

    // Determine target students
    let targetStudents: { id: number; currentSessionId: number | null; classId: number | null }[] = [];
    if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
      targetStudents = await db
        .select({ id: students.id, currentSessionId: students.currentSessionId, classId: students.classId })
        .from(students)
        .where(inArray(students.id, studentIds));
    } else if (fromClassId) {
      targetStudents = await db
        .select({ id: students.id, currentSessionId: students.currentSessionId, classId: students.classId })
        .from(students)
        .where(eq(students.classId, parseInt(fromClassId)));
    }

    if (targetStudents.length === 0) {
      return res.status(400).json({ error: 'No students found to promote' });
    }

    await db.transaction(async (tx) => {
      for (const st of targetStudents) {
        if (st.currentSessionId && st.classId) {
          await tx
            .update(studentEnrollments)
            .set({
              status: 'promoted',
              promotedToClassId: newClassId,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(studentEnrollments.studentId, st.id),
                eq(studentEnrollments.sessionId, st.currentSessionId),
                eq(studentEnrollments.classId, st.classId)
              )
            );
        }

        await tx
          .insert(studentEnrollments)
          .values({
            studentId: st.id,
            classId: newClassId,
            sessionId: newSessionId,
            enrollmentDate: today,
            status: 'enrolled',
            remarks: remarks || `Cohort bulk promotion`,
          })
          .onConflictDoUpdate({
            target: [studentEnrollments.studentId, studentEnrollments.sessionId, studentEnrollments.classId],
            set: {
              status: 'enrolled',
              updatedAt: new Date(),
            },
          });

        await tx
          .update(students)
          .set({
            classId: newClassId,
            currentSessionId: newSessionId,
            updatedAt: new Date(),
          })
          .where(eq(students.id, st.id));
      }
    });

    await logAuditEvent({
      userId: req.user!.id,
      action: 'BULK_STUDENTS_PROMOTED',
      resource: 'students',
      details: { count: targetStudents.length, toClassId: newClassId, sessionId: newSessionId },
      ipAddress: req.ip,
    });

    res.json({ success: true, count: targetStudents.length, message: `Successfully promoted ${targetStudents.length} students` });
  } catch (error: any) {
    console.error('Bulk promotion error:', error);
    res.status(500).json({ error: 'Failed to execute bulk promotion' });
  }
});

// 6b. POST /api/students/bulk-update - Bulk update status or class for selected students
studentsRouter.post('/bulk-update', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const { studentIds, status, classId } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'At least one student ID must be selected for bulk update.' });
    }

    const cleanIds = studentIds
      .map((id: any) => (typeof id === 'number' ? id : parseInt(String(id), 10)))
      .filter((id: number) => !isNaN(id) && id > 0);

    if (cleanIds.length === 0) {
      return res.status(400).json({ error: 'No valid student IDs provided.' });
    }

    if (!status && classId === undefined) {
      return res.status(400).json({ error: 'Please provide either a status or a classId to update.' });
    }

    const updatePayload: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (status) {
      if (!['active', 'suspended', 'pending'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be active, suspended, or pending.' });
      }
      updatePayload.status = status;
    }

    if (classId !== undefined) {
      const parsedClassId = classId ? parseInt(String(classId), 10) : null;
      if (parsedClassId !== null) {
        const [targetClass] = await db
          .select({ id: classes.id, name: classes.name })
          .from(classes)
          .where(and(eq(classes.id, parsedClassId), eq(classes.status, 'active')))
          .limit(1);

        if (!targetClass) {
          return res.status(400).json({ error: 'Selected destination class is inactive or does not exist.' });
        }
      }
      updatePayload.classId = parsedClassId;
    }

    // Verify existence of target students
    const existingStudents = await db
      .select({ id: students.id, currentSessionId: students.currentSessionId, classId: students.classId })
      .from(students)
      .where(inArray(students.id, cleanIds));

    if (existingStudents.length === 0) {
      return res.status(404).json({ error: 'None of the selected students were found in the database.' });
    }

    const validIds = existingStudents.map((s) => s.id);

    await db
      .update(students)
      .set(updatePayload)
      .where(inArray(students.id, validIds));

    // If status was updated, also synchronize corresponding user status
    if (status) {
      const studentUserRows = await db
        .select({ userId: students.userId })
        .from(students)
        .where(inArray(students.id, validIds));

      const userIds = studentUserRows.map((r) => r.userId).filter((uid): uid is number => uid !== null);
      if (userIds.length > 0) {
        await db
          .update(users)
          .set({ status, updatedAt: new Date() })
          .where(inArray(users.id, userIds));
      }
    }

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'STUDENTS_BULK_UPDATE',
      resource: 'students',
      resourceId: validIds.join(','),
      details: {
        affectedCount: validIds.length,
        studentIds: validIds,
        changes: { status, classId },
      },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      updatedCount: validIds.length,
      message: `Successfully updated ${validIds.length} student record${validIds.length > 1 ? 's' : ''}.`,
    });
  } catch (error: any) {
    console.error('Bulk update students error:', error);
    return res.status(500).json({ error: 'Failed to process bulk student updates.' });
  }
});

// 7. GET /api/students/:id & GET /api/students/:id/overview - Detailed student profile with strict RBAC
const handleStudentProfile = async (req: AuthRequest, res: Response, isOverviewOnly = false) => {
  try {
    const rawId = req.params.id;
    const numId = parseInt(rawId, 10);
    const user = req.user!;

    // Find student by ID, studentCode, or userId
    let studentCondition;
    if (!isNaN(numId)) {
      studentCondition = or(eq(students.id, numId), eq(students.userId, numId));
    } else {
      studentCondition = eq(students.studentId, rawId);
    }

    const [studentRecord] = await db
      .select({
        id: students.id,
        userId: students.userId,
        studentId: students.studentId,
        firstName: students.firstName,
        lastName: students.lastName,
        dateOfBirth: students.dateOfBirth,
        gender: students.gender,
        classId: students.classId,
        className: classes.name,
        classSection: classes.section,
        currentSessionId: students.currentSessionId,
        sessionName: academicSessions.name,
        admissionDate: students.admissionDate,
        address: students.address,
        emergencyContact: students.emergencyContact,
        status: students.status,
        accountEmail: users.email,
        hasAccount: sql<boolean>`${students.userId} IS NOT NULL`,
        createdAt: students.createdAt,
      })
      .from(students)
      .leftJoin(classes, eq(students.classId, classes.id))
      .leftJoin(academicSessions, eq(students.currentSessionId, academicSessions.id))
      .leftJoin(users, eq(students.userId, users.id))
      .where(studentCondition)
      .limit(1);

    if (!studentRecord) {
      return res.status(404).json({ error: 'Student record not found' });
    }

    const targetStudentId = studentRecord.id;

    // Strict RBAC & Access Verification
    let isClassTeacher = false;
    let isAttendanceRecorder = false;
    let isSubjectTeacher = false;
    let isAssigned = false;
    let teacherTaughtSubjectIds: number[] = [];

    if (user.role === 'student') {
      if (studentRecord.userId !== user.id) {
        return res.status(403).json({ error: 'Unauthorized: You can only view your own student profile' });
      }
    } else if (user.role === 'parent') {
      const [link] = await db
        .select()
        .from(parentStudents)
        .where(
          and(
            eq(parentStudents.parentUserId, user.id),
            eq(parentStudents.studentId, targetStudentId)
          )
        )
        .limit(1);
      if (!link) {
        return res.status(403).json({ error: 'Unauthorized: This child is not linked to your parent account' });
      }
    } else if (user.role === 'teacher') {
      const [t] = await db.select().from(teachers).where(eq(teachers.userId, user.id)).limit(1);
      if (!t) return res.status(403).json({ error: 'Teacher profile not found' });

      if (studentRecord.classId) {
        const [ct] = await db
          .select({ id: classes.id })
          .from(classes)
          .where(and(eq(classes.id, studentRecord.classId), eq(classes.classTeacherId, t.id)))
          .limit(1);
        isClassTeacher = !!ct;

        const [ar] = await db
          .select({ id: classes.id })
          .from(classes)
          .where(and(eq(classes.id, studentRecord.classId), eq(classes.attendanceRecorderId, t.id)))
          .limit(1);
        isAttendanceRecorder = !!ar;

        const subjectsTaught = await db
          .select({ subjectId: classSubjects.subjectId })
          .from(classSubjects)
          .where(and(eq(classSubjects.classId, studentRecord.classId), eq(classSubjects.teacherId, t.id)));
        
        teacherTaughtSubjectIds = subjectsTaught.map((s) => s.subjectId);
        isSubjectTeacher = teacherTaughtSubjectIds.length > 0;
      }
      isAssigned = isClassTeacher || isAttendanceRecorder || isSubjectTeacher;
      if (!isAssigned) {
        return res.status(403).json({ error: 'Access denied: You are not assigned to teach or manage this student.' });
      }
    } else if (user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: Unauthorized role.' });
    }

    // 1. Attendance Summary & Recent Logs
    const attendanceRecords = await db
      .select({
        id: attendance.id,
        date: attendance.date,
        status: attendance.status,
        isLate: attendance.isLate,
        arrivalTime: attendance.arrivalTime,
        lateReason: attendance.lateReason,
        remarks: attendance.remarks,
        createdAt: attendance.createdAt,
      })
      .from(attendance)
      .where(eq(attendance.studentId, targetStudentId))
      .orderBy(desc(attendance.date))
      .limit(100);

    const totalDays = attendanceRecords.length;
    const presentDays = attendanceRecords.filter((a) => a.status === 'Present').length;
    const absentDays = attendanceRecords.filter((a) => a.status === 'Absent').length;
    const excusedDays = attendanceRecords.filter((a) => a.status === 'Excused').length;
    const lateDays = attendanceRecords.filter((a) => a.isLate).length;
    const attendancePercentage = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;

    // Overview endpoint return - strictly minimal fields
    if (isOverviewOnly) {
      return res.json({
        id: studentRecord.id,
        studentId: studentRecord.studentId,
        firstName: studentRecord.firstName,
        lastName: studentRecord.lastName,
        fullName: `${studentRecord.firstName} ${studentRecord.lastName}`.trim(),
        gender: studentRecord.gender,
        dateOfBirth: studentRecord.dateOfBirth,
        classId: studentRecord.classId,
        className: studentRecord.className,
        classSection: studentRecord.classSection,
        currentSessionId: studentRecord.currentSessionId,
        sessionName: studentRecord.sessionName,
        status: studentRecord.status,
        admissionDate: studentRecord.admissionDate,
        attendancePercentage,
      });
    }

    // 2. Guardians list (Sensitive phone/email exposed ONLY to authorized guardians, super_admin, or class teacher)
    const canViewGuardianContacts = user.role === 'super_admin' || user.role === 'parent' || isClassTeacher;
    const rawParentsList = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        relationship: parentStudents.relationship,
        isPrimary: parentStudents.isPrimary,
      })
      .from(parentStudents)
      .innerJoin(users, eq(parentStudents.parentUserId, users.id))
      .where(eq(parentStudents.studentId, targetStudentId));

    const parentsList = rawParentsList.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      relationship: p.relationship,
      isPrimary: p.isPrimary,
      email: canViewGuardianContacts ? p.email : undefined,
      phone: canViewGuardianContacts ? p.phone : undefined,
    }));

    // 3. Enrollment History
    const rawEnrollmentHistory = await db
      .select({
        id: studentEnrollments.id,
        sessionId: studentEnrollments.sessionId,
        sessionName: academicSessions.name,
        classId: studentEnrollments.classId,
        className: classes.name,
        enrollmentDate: studentEnrollments.enrollmentDate,
        status: studentEnrollments.status,
        academicAverage: studentEnrollments.academicAverage,
        attendanceRate: studentEnrollments.attendanceRate,
        remarks: studentEnrollments.remarks,
        createdAt: studentEnrollments.createdAt,
      })
      .from(studentEnrollments)
      .innerJoin(academicSessions, eq(studentEnrollments.sessionId, academicSessions.id))
      .innerJoin(classes, eq(studentEnrollments.classId, classes.id))
      .where(eq(studentEnrollments.studentId, targetStudentId))
      .orderBy(desc(academicSessions.startDate), desc(studentEnrollments.createdAt));

    let enrollmentHistory = rawEnrollmentHistory.map((item) => {
      const enrollDateStr = item.enrollmentDate;
      const logsSinceEnrollment = enrollDateStr
        ? attendanceRecords.filter((a) => a.date >= enrollDateStr)
        : attendanceRecords;

      const ePresent = logsSinceEnrollment.filter((a) => a.status === 'Present').length;
      const eAbsent = logsSinceEnrollment.filter((a) => a.status === 'Absent').length;
      const eExcused = logsSinceEnrollment.filter((a) => a.status === 'Excused').length;
      const eLate = logsSinceEnrollment.filter((a) => a.isLate).length;
      const eTotalAttendanceDays = logsSinceEnrollment.length;
      const eTotalDaysSinceEnrollment = eTotalAttendanceDays;
      const eRate = eTotalAttendanceDays > 0 ? Math.round((ePresent / eTotalAttendanceDays) * 100) : (item.attendanceRate ?? 100);

      return {
        ...item,
        daysPresent: ePresent,
        daysAbsent: eAbsent,
        daysExcused: eExcused,
        daysLate: eLate,
        totalAttendanceDays: eTotalAttendanceDays,
        totalDaysSinceEnrollment: eTotalDaysSinceEnrollment,
        calculatedAttendanceRate: eRate,
      };
    });

    if (enrollmentHistory.length === 0) {
      const defaultEnrollDate = studentRecord.admissionDate || new Date(studentRecord.createdAt).toISOString().split('T')[0];
      enrollmentHistory = [
        {
          id: 0,
          sessionId: studentRecord.currentSessionId || 0,
          sessionName: studentRecord.sessionName || 'Current Academic Session',
          classId: studentRecord.classId || 0,
          className: studentRecord.className || 'Assigned Cohort',
          enrollmentDate: defaultEnrollDate,
          status: studentRecord.status || 'enrolled',
          academicAverage: null,
          attendanceRate: attendancePercentage,
          remarks: 'Current active enrollment',
          createdAt: studentRecord.createdAt,
          daysPresent: presentDays,
          daysAbsent: absentDays,
          daysExcused: excusedDays,
          daysLate: lateDays,
          totalAttendanceDays: totalDays,
          totalDaysSinceEnrollment: totalDays,
          calculatedAttendanceRate: attendancePercentage,
        },
      ];
    }

    const attendanceSummary = {
      totalDays,
      presentDays,
      absentDays,
      excusedDays,
      lateDays,
      attendancePercentage,
      totalDaysSinceAdmission: totalDays,
      admissionDate: studentRecord.admissionDate || studentRecord.createdAt.toISOString().split('T')[0],
      recentLogs: attendanceRecords.slice(0, 15),
    };

    // 4. Academic Assessment Results
    let rawResults = await db
      .select({
        id: results.id,
        subjectId: results.subjectId,
        subjectCode: subjects.code,
        subjectName: subjects.name,
        assessmentType: results.assessmentType,
        testScore: results.testScore,
        examScore: results.examScore,
        totalScore: results.totalScore,
        maxMarks: results.maxMarks,
        grade: results.grade,
        remarks: results.remarks,
        termId: results.termId,
        termName: academicTerms.termName,
        sessionId: results.sessionId,
        sessionName: academicSessions.name,
        status: results.status,
        createdAt: results.createdAt,
      })
      .from(results)
      .innerJoin(subjects, eq(results.subjectId, subjects.id))
      .innerJoin(academicTerms, eq(results.termId, academicTerms.id))
      .leftJoin(academicSessions, eq(results.sessionId, academicSessions.id))
      .where(eq(results.studentId, targetStudentId))
      .orderBy(desc(results.createdAt));

    if (user.role === 'teacher' && !isClassTeacher) {
      rawResults = rawResults.filter((r) => teacherTaughtSubjectIds.includes(r.subjectId));
    }

    // 5. Fees & Financial Summary (ONLY for Admins, Parents of student, or Self; NEVER for teachers)
    let feesSummary: any = null;
    if (user.role === 'super_admin' || user.role === 'parent' || user.role === 'student') {
      const studentFees = await db
        .select({
          id: fees.id,
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
        .where(eq(fees.studentId, targetStudentId))
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

    // 6. Homework / Assignments - ONLY accessible to assigned teachers
    let homeworkList: any[] = [];
    if (user.role === 'teacher' && studentRecord.classId) {
      const hwList = await db
        .select({
          id: homeworks.id,
          title: homeworks.title,
          description: homeworks.description,
          subjectId: homeworks.subjectId,
          subjectName: subjects.name,
          dueDate: homeworks.dueDate,
          maxMarks: homeworks.maxMarks,
          status: homeworks.status,
          submissionId: homeworkSubmissions.id,
          submissionText: homeworkSubmissions.submissionText,
          submissionStatus: homeworkSubmissions.status,
          score: homeworkSubmissions.score,
          feedback: homeworkSubmissions.feedback,
          submittedAt: homeworkSubmissions.submittedAt,
        })
        .from(homeworks)
        .innerJoin(subjects, eq(homeworks.subjectId, subjects.id))
        .leftJoin(
          homeworkSubmissions,
          and(
            eq(homeworkSubmissions.homeworkId, homeworks.id),
            eq(homeworkSubmissions.studentId, targetStudentId)
          )
        )
        .where(eq(homeworks.classId, studentRecord.classId))
        .orderBy(desc(homeworks.createdAt))
        .limit(20);

      if (!isClassTeacher) {
        homeworkList = hwList.filter((h) => teacherTaughtSubjectIds.includes(h.subjectId));
      } else {
        homeworkList = hwList;
      }
    }

    const canViewPersonalDetails = user.role === 'super_admin' || user.role === 'parent' || (user.role === 'student' && studentRecord.userId === user.id) || isClassTeacher;
    const sanitizedStudentRecord = {
      ...studentRecord,
      address: canViewPersonalDetails ? studentRecord.address : undefined,
      emergencyContact: canViewPersonalDetails ? studentRecord.emergencyContact : undefined,
      accountEmail: canViewPersonalDetails ? studentRecord.accountEmail : undefined,
    };

    const permissions = {
      canEdit: user.role === 'super_admin',
      isClassTeacher,
      isAttendanceRecorder,
      isSubjectTeacher,
      isAssigned,
      isSuperAdmin: user.role === 'super_admin',
      isGuardian: user.role === 'parent',
      isSelf: user.role === 'student' && studentRecord.userId === user.id,
    };

    res.json({
      student: sanitizedStudentRecord,
      guardians: parentsList,
      enrollmentHistory,
      attendanceSummary,
      academicResults: rawResults,
      feesSummary,
      homeworkList,
      permissions,
    });
  } catch (error: any) {
    console.error('Get student details error:', error);
    res.status(500).json({ error: 'Failed to retrieve student profile' });
  }
};

studentsRouter.get('/:id/overview', requireAuth, (req: AuthRequest, res: Response) => handleStudentProfile(req, res, true));
studentsRouter.get('/:id', requireAuth, (req: AuthRequest, res: Response) => handleStudentProfile(req, res, false));

// 8. PUT /api/students/:id - Update student record
studentsRouter.put('/:id', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.id);
    const { firstName, lastName, dateOfBirth, gender, classId, currentSessionId, status, address, emergencyContact } = req.body;

    const [updated] = await db
      .update(students)
      .set({
        firstName: firstName ? firstName.trim() : undefined,
        lastName: lastName ? lastName.trim() : undefined,
        dateOfBirth: dateOfBirth !== undefined ? dateOfBirth : undefined,
        gender: gender || undefined,
        classId: classId !== undefined ? (classId ? parseInt(classId) : null) : undefined,
        currentSessionId: currentSessionId !== undefined ? (currentSessionId ? parseInt(currentSessionId) : null) : undefined,
        status: status || undefined,
        address: address !== undefined ? address : undefined,
        emergencyContact: emergencyContact !== undefined ? emergencyContact : undefined,
        updatedAt: new Date(),
      })
      .where(eq(students.id, studentId))
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'STUDENT_UPDATED',
      resource: 'students',
      resourceId: studentId.toString(),
      details: { changes: req.body },
      ipAddress: req.ip,
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Update student error:', error);
    res.status(500).json({ error: 'Failed to update student' });
  }
});

// 10. POST /api/students/:id/toggle-status - Deactivate / Reactivate student account
studentsRouter.post('/:id/toggle-status', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.id);
    const [studentRecord] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
    if (!studentRecord) {
      return res.status(404).json({ error: 'Student record not found' });
    }

    const newStatus = studentRecord.status === 'active' ? 'suspended' : 'active';
    const [updatedStudent] = await db
      .update(students)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(students.id, studentId))
      .returning();

    // If student is linked to a user account, update user account status as well
    if (studentRecord.userId) {
      await db
        .update(users)
        .set({
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(users.id, studentRecord.userId));
    }

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: newStatus === 'suspended' ? 'STUDENT_ACCOUNT_DEACTIVATED' : 'STUDENT_ACCOUNT_ACTIVATED',
      resource: 'students',
      resourceId: studentId.toString(),
      details: { previousStatus: studentRecord.status, newStatus },
      ipAddress: req.ip,
    });

    res.json({
      message: `Student account successfully ${newStatus === 'suspended' ? 'deactivated' : 'reactivated'}.`,
      status: newStatus,
      student: updatedStudent,
    });
  } catch (error: any) {
    console.error('Toggle student status error:', error);
    res.status(500).json({ error: 'Failed to update student account status' });
  }
});

studentsRouter.post('/:id/regenerate-token', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.id);
    const rawToken = generateSecureToken('ENR');
    const tokenHashed = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db
      .update(students)
      .set({
        enrollmentToken: tokenHashed,
        enrollmentTokenExpiresAt: expiresAt,
        userId: null,
      })
      .where(eq(students.id, studentId));

    await logAuditEvent({
      userId: req.user!.id,
      action: 'ENROLLMENT_TOKEN_REGENERATED',
      resource: 'students',
      resourceId: studentId.toString(),
      ipAddress: req.ip,
    });

    res.json({ enrollmentToken: rawToken, expiresAt });
  } catch (error: any) {
    console.error('Regenerate token error:', error);
    res.status(500).json({ error: 'Failed to regenerate enrollment token' });
  }
});

// 10. POST /api/students/:id/parent-invitation
studentsRouter.post('/:id/parent-invitation', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.id);
    const { relationship, invitedEmail } = req.body;

    const s = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
    if (s.length === 0) {
      return res.status(404).json({ error: 'Student record does not exist' });
    }

    const rawInvitationToken = generateSecureToken('PAR-INV');
    const tokenHashed = hashToken(rawInvitationToken);
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days

    const [invitation] = await db
      .insert(parentInvitations)
      .values({
        studentId,
        invitationToken: tokenHashed,
        relationship: relationship || 'Guardian',
        invitedEmail: invitedEmail ? invitedEmail.trim().toLowerCase() : null,
        expiresAt,
        createdBy: req.user!.id,
        isUsed: false,
      })
      .returning();

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'PARENT_INVITATION_CREATED',
      resource: 'parent_invitations',
      resourceId: invitation.id.toString(),
      details: { studentId, studentCode: s[0].studentId, relationship },
      ipAddress: req.ip,
    });

    res.status(201).json({
      ...invitation,
      invitationToken: rawInvitationToken,
    });
  } catch (error: any) {
    console.error('Create parent invitation error:', error);
    res.status(500).json({ error: 'Failed to create parent invitation' });
  }
});
