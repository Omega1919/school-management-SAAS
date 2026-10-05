import { db, withDbRetry } from '../db/index.ts';
import {
  users,
  teachers,
  students,
  parents,
  parentStudents,
  academicSessions,
  academicTerms,
  classes,
  subjects,
  classSubjects,
  studentEnrollments,
} from '../db/schema.ts';
import { hashPassword } from './auth.ts';
import { clearRateLimitStore } from '../middleware/rate-limiter.ts';
import { eq } from 'drizzle-orm';

/**
 * Ensures demo personas (Teacher, Student, Parent) always exist with working credentials.
 * Runs on startup so the demo portals are immediately accessible without manual seeding.
 */
export async function ensureDemoPersonas(): Promise<void> {
  // Clear any existing in-memory rate limiting blocks on startup
  clearRateLimitStore();

  await withDbRetry(async () => {
    const teacherPassHash = await hashPassword('teacher123');
    const studentPassHash = await hashPassword('student123');
    const parentPassHash = await hashPassword('parent123');

    // 1. Ensure current academic session and term exist
    let [session] = await db
      .select()
      .from(academicSessions)
      .where(eq(academicSessions.name, '2026/2027'))
      .limit(1);

    if (!session) {
      const [newSession] = await db
        .insert(academicSessions)
        .values({
          name: '2026/2027',
          startDate: '2026-08-01',
          endDate: '2027-07-16',
          isCurrent: true,
          status: 'active',
          description: '2026/2027 Academic Session',
        })
        .returning();
      session = newSession;
    }

    let [term] = await db
      .select()
      .from(academicTerms)
      .where(eq(academicTerms.sessionName, '2026/2027'))
      .limit(1);

    if (!term) {
      const [newTerm] = await db
        .insert(academicTerms)
        .values({
          sessionId: session.id,
          sessionName: '2026/2027',
          termName: 'First Term',
          termNumber: 1,
          isCurrent: true,
          startDate: '2026-08-01',
          endDate: '2026-12-18',
        })
        .returning();
      term = newTerm;
    }

    // 2. Demo Teacher: Babatunde Adewale (teacher.adewale@school.com / teacher123)
    let [teacherUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'teacher.adewale@school.com'))
      .limit(1);

    if (!teacherUser) {
      const [created] = await db
        .insert(users)
        .values({
          uid: 'seed-tch-01',
          email: 'teacher.adewale@school.com',
          passwordHash: teacherPassHash,
          fullName: 'Babatunde Adewale',
          role: 'teacher',
          status: 'active',
          phone: '+234 802 100 1000',
        })
        .returning();
      teacherUser = created;
    } else {
      await db
        .update(users)
        .set({ passwordHash: teacherPassHash, status: 'active' })
        .where(eq(users.id, teacherUser.id));
    }

    let [teacherRecord] = await db
      .select()
      .from(teachers)
      .where(eq(teachers.userId, teacherUser.id))
      .limit(1);

    if (!teacherRecord) {
      const [createdT] = await db
        .insert(teachers)
        .values({
          userId: teacherUser.id,
          employeeId: 'TCH-2026-001',
          specialization: 'Mathematics & Further Mathematics',
          qualification: 'B.Sc (Ed), M.Ed Mathematics',
          hireDate: '2026-08-01',
          address: '10 Victoria Island, Lagos',
          status: 'active',
        })
        .returning();
      teacherRecord = createdT;
    }

    // 3. Ensure a default class exists
    let [defaultClass] = await db
      .select()
      .from(classes)
      .where(eq(classes.name, 'JSS 1 Gold'))
      .limit(1);

    if (!defaultClass) {
      const [newClass] = await db
        .insert(classes)
        .values({
          name: 'JSS 1 Gold',
          section: 'A',
          gradeLevel: '7',
          sessionId: session.id,
          capacity: 35,
          classTeacherId: teacherRecord.id,
          attendanceRecorderId: teacherRecord.id,
          status: 'active',
        })
        .returning();
      defaultClass = newClass;
    }

    // 4. Demo Parent: Chief Chinedu Okafor (parent.ibrahim@school.com / parent123)
    let [parentUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'parent.ibrahim@school.com'))
      .limit(1);

    if (!parentUser) {
      const [created] = await db
        .insert(users)
        .values({
          uid: 'seed-par-001',
          email: 'parent.ibrahim@school.com',
          passwordHash: parentPassHash,
          fullName: 'Chief Chinedu Okafor',
          role: 'parent',
          status: 'active',
          phone: '+234 803 200 1000',
        })
        .returning();
      parentUser = created;
    } else {
      await db
        .update(users)
        .set({ passwordHash: parentPassHash, status: 'active' })
        .where(eq(users.id, parentUser.id));
    }

    let [parentRecord] = await db
      .select()
      .from(parents)
      .where(eq(parents.userId, parentUser.id))
      .limit(1);

    if (!parentRecord) {
      const [createdP] = await db
        .insert(parents)
        .values({
          userId: parentUser.id,
          parentId: 'PAR-2026-0001',
        })
        .returning();
      parentRecord = createdP;
    }

    // 5. Demo Student: Emeka Adeleke (student.chinedu@school.com / student123)
    let [studentUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'student.chinedu@school.com'))
      .limit(1);

    if (!studentUser) {
      const [created] = await db
        .insert(users)
        .values({
          uid: 'seed-stu-0001',
          email: 'student.chinedu@school.com',
          passwordHash: studentPassHash,
          fullName: 'Emeka Adeleke',
          role: 'student',
          status: 'active',
        })
        .returning();
      studentUser = created;
    } else {
      await db
        .update(users)
        .set({ passwordHash: studentPassHash, status: 'active' })
        .where(eq(users.id, studentUser.id));
    }

    let [studentRecord] = await db
      .select()
      .from(students)
      .where(eq(students.userId, studentUser.id))
      .limit(1);

    if (!studentRecord) {
      const [createdS] = await db
        .insert(students)
        .values({
          userId: studentUser.id,
          studentId: 'STU-2026-0001',
          firstName: 'Emeka',
          lastName: 'Adeleke',
          dateOfBirth: '2012-05-14',
          gender: 'Male',
          classId: defaultClass.id,
          currentSessionId: session.id,
          admissionDate: '2026-08-01',
          address: '15 Victoria Island, Lagos',
          emergencyContact: 'Chief Chinedu Okafor (+234 803 200 1000)',
          status: 'active',
        })
        .returning();
      studentRecord = createdS;
    }

    // 6. Link parent to student
    const existingLink = await db
      .select()
      .from(parentStudents)
      .where(eq(parentStudents.parentUserId, parentUser.id))
      .limit(1);

    if (existingLink.length === 0) {
      await db.insert(parentStudents).values({
        parentUserId: parentUser.id,
        studentId: studentRecord.id,
        relationship: 'Father',
        isPrimary: true,
      });
    }

    // 7. Ensure student enrollment record
    const existingEnrollment = await db
      .select()
      .from(studentEnrollments)
      .where(eq(studentEnrollments.studentId, studentRecord.id))
      .limit(1);

    if (existingEnrollment.length === 0) {
      await db.insert(studentEnrollments).values({
        studentId: studentRecord.id,
        classId: defaultClass.id,
        sessionId: session.id,
        termId: term.id,
        enrollmentDate: '2026-08-01',
        status: 'enrolled',
        academicAverage: 84.5,
        attendanceRate: 96,
        remarks: 'Active student enrollment for 2026/2027 session.',
      });
    }

    console.log('✓ Demo personas verified: Teacher, Student, and Parent accounts ready.');
  });
}
