import { Router } from 'express';
import { db } from '../db/index.ts';
import { students, classes, teachers, users, classSubjects } from '../db/schema.ts';
import { requireRole, AuthRequest } from '../middleware/auth.ts';
import { eq, or, ilike, sql, and, inArray } from 'drizzle-orm';

export const searchRouter = Router();

// Universal Global Search for Teachers and Admins
// Query student, class, teacher by name, ID, or code
searchRouter.get('/', requireRole(['super_admin', 'teacher']), async (req: AuthRequest, res) => {
  try {
    const rawQuery = (req.query.q as string || '').trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 15, 30);
    const filterType = req.query.type as string; // 'all' | 'students' | 'classes' | 'teachers'

    if (!rawQuery) {
      return res.json({
        query: '',
        students: [],
        classes: [],
        teachers: [],
        totalMatches: 0,
      });
    }

    const searchPattern = `%${rawQuery}%`;
    const numericId = parseInt(rawQuery, 10);
    const isNumber = !isNaN(numericId);
    const user = req.user!;

    let allowedClassIds: number[] | null = null; // null means all classes (for super_admin)
    if (user.role === 'teacher') {
      const [teacherRecord] = await db
        .select()
        .from(teachers)
        .where(eq(teachers.userId, user.id))
        .limit(1);

      if (teacherRecord) {
        const classTeacherClasses = await db
          .select({ id: classes.id })
          .from(classes)
          .where(eq(classes.classTeacherId, teacherRecord.id));

        const recorderClasses = await db
          .select({ id: classes.id })
          .from(classes)
          .where(eq(classes.attendanceRecorderId, teacherRecord.id));

        const subjectTeacherClasses = await db
          .select({ classId: classSubjects.classId })
          .from(classSubjects)
          .where(eq(classSubjects.teacherId, teacherRecord.id));

        const classIdSet = new Set<number>();
        classTeacherClasses.forEach((c) => classIdSet.add(c.id));
        recorderClasses.forEach((c) => classIdSet.add(c.id));
        subjectTeacherClasses.forEach((cs) => classIdSet.add(cs.classId));
        allowedClassIds = Array.from(classIdSet);
      } else {
        allowedClassIds = [];
      }
    }

    // 1. Search Students
    let studentResults: any[] = [];
    if (!filterType || filterType === 'all' || filterType === 'students') {
      const studentConditions = [
        ilike(students.firstName, searchPattern),
        ilike(students.lastName, searchPattern),
        ilike(students.studentId, searchPattern),
        ilike(sql`concat(${students.firstName}, ' ', ${students.lastName})`, searchPattern),
      ];

      if (isNumber) {
        studentConditions.push(eq(students.id, numericId));
      }

      let whereCondition = or(...studentConditions);
      if (allowedClassIds !== null) {
        if (allowedClassIds.length > 0) {
          whereCondition = and(whereCondition, inArray(students.classId, allowedClassIds));
        } else {
          whereCondition = and(whereCondition, sql`1 = 0`); // No assigned classes
        }
      }

      studentResults = await db
        .select({
          id: students.id,
          studentCode: students.studentId,
          firstName: students.firstName,
          lastName: students.lastName,
          gender: students.gender,
          status: students.status,
          admissionDate: students.admissionDate,
          classId: students.classId,
          className: classes.name,
          classSection: classes.section,
        })
        .from(students)
        .leftJoin(classes, eq(students.classId, classes.id))
        .where(whereCondition)
        .limit(limit);
    }

    // 2. Search Classes (scoped to teacher's authorized classes)
    let classResults: any[] = [];
    if (!filterType || filterType === 'all' || filterType === 'classes') {
      const classConditions = [
        ilike(classes.name, searchPattern),
        ilike(classes.section, searchPattern),
      ];

      if (isNumber) {
        classConditions.push(eq(classes.id, numericId));
      }

      let classWhereCondition = or(...classConditions);
      if (allowedClassIds !== null) {
        if (allowedClassIds.length > 0) {
          classWhereCondition = and(classWhereCondition, inArray(classes.id, allowedClassIds));
        } else {
          classWhereCondition = and(classWhereCondition, sql`1 = 0`);
        }
      }

      const rawClasses = await db
        .select({
          id: classes.id,
          name: classes.name,
          section: classes.section,
          capacity: classes.capacity,
          classTeacherId: classes.classTeacherId,
          teacherName: users.fullName,
          teacherCode: teachers.employeeId,
        })
        .from(classes)
        .leftJoin(teachers, eq(classes.classTeacherId, teachers.id))
        .leftJoin(users, eq(teachers.userId, users.id))
        .where(classWhereCondition)
        .limit(limit);

      classResults = await Promise.all(
        rawClasses.map(async (c) => {
          const [countRes] = await db
            .select({ count: sql<number>`count(*)` })
            .from(students)
            .where(eq(students.classId, c.id));
          return {
            ...c,
            studentCount: Number(countRes?.count || 0),
            isAssignedToMe: allowedClassIds ? allowedClassIds.includes(c.id) : true,
          };
        })
      );
    }

    // 3. Search Teachers (sanitized for teachers to protect private phone & email)
    let teacherResults: any[] = [];
    if (!filterType || filterType === 'all' || filterType === 'teachers') {
      const teacherConditions = [
        ilike(users.fullName, searchPattern),
        ilike(teachers.employeeId, searchPattern),
        ilike(teachers.specialization, searchPattern),
        ilike(teachers.qualification, searchPattern),
      ];

      if (user.role === 'super_admin') {
        teacherConditions.push(ilike(users.email, searchPattern));
      }

      if (isNumber) {
        teacherConditions.push(eq(teachers.id, numericId));
      }

      const rawTeachers = await db
        .select({
          id: teachers.id,
          userId: teachers.userId,
          name: users.fullName,
          email: users.email,
          phone: users.phone,
          employeeId: teachers.employeeId,
          specialization: teachers.specialization,
          qualification: teachers.qualification,
          status: teachers.status,
          hireDate: teachers.hireDate,
        })
        .from(teachers)
        .innerJoin(users, eq(teachers.userId, users.id))
        .where(or(...teacherConditions))
        .limit(limit);

      // Sanitize: Teachers do not receive private phone and email of other teachers
      teacherResults = rawTeachers.map((t) => {
        if (user.role === 'teacher') {
          return {
            id: t.id,
            userId: t.userId,
            name: t.name,
            employeeId: t.employeeId,
            specialization: t.specialization,
            qualification: t.qualification,
            status: t.status,
            hireDate: t.hireDate,
          };
        }
        return t;
      });
    }

    const totalMatches = studentResults.length + classResults.length + teacherResults.length;

    res.json({
      query: rawQuery,
      students: studentResults,
      classes: classResults,
      teachers: teacherResults,
      totalMatches,
    });
  } catch (err: any) {
    console.error('Global search error:', err);
    res.status(500).json({ error: 'Failed to perform search' });
  }
});
