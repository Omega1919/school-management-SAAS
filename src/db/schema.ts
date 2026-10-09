import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ============================================================================
// 1. POSTGRES ENUMS (DB Constraints & Strong Typing)
// ============================================================================
export const userRoleEnum = pgEnum('user_role', ['super_admin', 'teacher', 'parent', 'student']);
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'pending']);
export const sessionStatusEnum = pgEnum('session_status', ['upcoming', 'active', 'completed', 'archived']);
export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'enrolled',
  'promoted',
  'repeated',
  'transferred',
  'graduated',
  'withdrawn',
]);
export const attendanceStatusEnum = pgEnum('attendance_status', ['Present', 'Absent', 'Excused']);
export const gradeEnum = pgEnum('grade_letter', ['A', 'B', 'C', 'D', 'E', 'F']);
export const resultStatusEnum = pgEnum('result_status', ['draft', 'submitted', 'approved', 'published']);
export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'unpaid',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
]);
export const paymentStatusEnum = pgEnum('payment_status', ['completed', 'pending', 'reversed', 'refunded']);
export const paymentMethodEnum = pgEnum('payment_method_type', [
  'Bank Transfer',
  'Direct Deposit',
  'Card',
  'Cash',
  'Online Portal',
]);
export const conversationStatusEnum = pgEnum('conversation_status', ['active', 'closed', 'resolved', 'escalated']);
export const homeworkStatusEnum = pgEnum('homework_status', ['active', 'closed']);
export const homeworkSubmissionStatusEnum = pgEnum('submission_status', ['submitted', 'graded', 'late', 'resubmitted']);

// ============================================================================
// 2. CORE AUTHENTICATION & USERS
// ============================================================================
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Auth UID or generated secure ID
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'), // Hashed password for direct credential login
  fullName: text('full_name').notNull(),
  role: text('role').notNull(), // 'super_admin' | 'teacher' | 'parent' | 'student'
  status: text('status').notNull().default('active'), // 'active' | 'suspended' | 'pending'
  phone: text('phone'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('users_email_idx').on(t.email),
  index('users_role_idx').on(t.role),
  index('users_status_idx').on(t.status),
]);

// ============================================================================
// 3. ACADEMIC SESSIONS & TERMS ARCHITECTURE
// ============================================================================
export const academicSessions = pgTable('academic_sessions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // e.g. "2024/2025", "2025/2026", "2026/2027"
  startDate: text('start_date').notNull(), // YYYY-MM-DD
  endDate: text('end_date').notNull(), // YYYY-MM-DD
  isCurrent: boolean('is_current').default(false).notNull(),
  status: text('status').default('active').notNull(), // 'upcoming' | 'active' | 'completed' | 'archived'
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('academic_sessions_current_unique_idx').on(t.isCurrent).where(sql`is_current = true`),
  index('academic_sessions_status_idx').on(t.status),
]);

export const academicTerms = pgTable('academic_terms', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => academicSessions.id),
  sessionName: text('session_name').notNull(), // e.g. "2025/2026" (retained for backward compatibility)
  termName: text('term_name').notNull(), // e.g. "First Term", "Second Term", "Third Term"
  termNumber: integer('term_number').default(1).notNull(), // 1, 2, 3
  isCurrent: boolean('is_current').default(false).notNull(),
  startDate: text('start_date'),
  endDate: text('end_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('academic_terms_current_unique_idx').on(t.isCurrent).where(sql`is_current = true`),
  index('academic_terms_session_idx').on(t.sessionId),
]);

// ============================================================================
// 4. DEPARTMENTS & PROGRAMMES (Institution-Agnostic)
// ============================================================================
export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // e.g. "SCI", "ART", "COMM", "ENG", "CS"
  name: text('name').notNull(), // e.g. "Science & Technology", "Faculty of Humanities", "Department of Computer Science"
  description: text('description'),
  status: text('status').default('active').notNull(), // 'active' | 'archived'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('departments_code_idx').on(t.code),
  index('departments_status_idx').on(t.status),
]);

// ============================================================================
// 4b. CLASSES & ACADEMIC COHORTS / LEVELS (Tied to Sessions & Optional Departments)
// ============================================================================
export const classes = pgTable('classes', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // e.g. "Senior Secondary 1A", "Primary 5B", "100 Level", "ND 1"
  section: text('section'), // e.g. "Science", "Arts", "Morning", "Batch A"
  gradeLevel: text('grade_level'), // e.g. "SS1", "JSS2", "100 Level", "ND 1"
  sessionId: integer('session_id').references(() => academicSessions.id),
  departmentId: integer('department_id').references(() => departments.id),
  capacity: integer('capacity').default(40).notNull(),
  classTeacherId: integer('class_teacher_id').references(() => teachers.id),
  attendanceRecorderId: integer('attendance_recorder_id').references(() => teachers.id),
  status: text('status').default('active').notNull(), // 'active' | 'archived'
  // Public Portal & Program Availability Config
  isPubliclyVisible: boolean('is_publicly_visible').default(true).notNull(),
  admissionStatus: text('admission_status').default('available').notNull(), // 'available' | 'closed' | 'hidden'
  publicDescription: text('public_description'),
  duration: text('duration'), // e.g. "3 Years", "4 Semesters"
  requirements: text('requirements'), // Class/program specific requirements
  isFeatured: boolean('is_featured').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('classes_session_idx').on(t.sessionId),
  index('classes_department_idx').on(t.departmentId),
  index('classes_teacher_idx').on(t.classTeacherId),
  index('classes_recorder_idx').on(t.attendanceRecorderId),
  index('classes_admission_status_idx').on(t.admissionStatus),
]);

// ============================================================================
// 5. SUBJECTS
// ============================================================================
export const subjects = pgTable('subjects', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // e.g. "MTH-101", "ENG-101"
  name: text('name').notNull(), // e.g. "General Mathematics"
  category: text('category').default('General'), // e.g. "Sciences", "Humanities"
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// 6. TEACHERS PROFILE
// ============================================================================
export const teachers = pgTable('teachers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull().unique(),
  employeeId: text('employee_id').notNull().unique(), // e.g. "TCH-2026-001"
  specialization: text('specialization'),
  qualification: text('qualification'),
  hireDate: text('hire_date'),
  address: text('address'), // Teacher residential home address
  status: text('status').default('active').notNull(),
  permissions: text('permissions').default('[]').notNull(), // JSON array of delegated admin permissions
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('teachers_user_idx').on(t.userId),
  index('teachers_employee_idx').on(t.employeeId),
]);

// ============================================================================
// 7. STUDENTS PROFILE & ENROLLMENT HISTORY
// ============================================================================
export const students = pgTable('students', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).unique(), // Connected when student registers
  studentId: text('student_id').notNull().unique(), // e.g. "STU-2026-001"
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  dateOfBirth: text('date_of_birth'),
  gender: text('gender'), // "Male" | "Female" | "Other"
  classId: integer('class_id').references(() => classes.id),
  currentSessionId: integer('current_session_id').references(() => academicSessions.id),
  admissionDate: text('admission_date'),
  address: text('address'), // Student residential home address
  emergencyContact: text('emergency_contact'),
  status: text('status').default('active').notNull(), // 'active' | 'archived' | 'suspended' | 'graduated'
  enrollmentToken: text('enrollment_token').unique(), // Stores SHA-256 hash of token
  enrollmentTokenExpiresAt: timestamp('enrollment_token_expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('students_class_idx').on(t.classId),
  index('students_status_idx').on(t.status),
  index('students_session_idx').on(t.currentSessionId),
]);

export const studentEnrollments = pgTable('student_enrollments', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').references(() => students.id).notNull(),
  classId: integer('class_id').references(() => classes.id).notNull(),
  sessionId: integer('session_id').references(() => academicSessions.id).notNull(),
  termId: integer('term_id').references(() => academicTerms.id),
  enrollmentDate: text('enrollment_date').notNull(), // YYYY-MM-DD
  status: text('status').default('enrolled').notNull(), // 'enrolled' | 'promoted' | 'repeated' | 'transferred' | 'graduated' | 'withdrawn'
  academicAverage: doublePrecision('academic_average'),
  attendanceRate: doublePrecision('attendance_rate'),
  promotedToClassId: integer('promoted_to_class_id').references(() => classes.id),
  remarks: text('remarks'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('student_enrollments_session_unique_idx').on(t.studentId, t.sessionId, t.classId),
  index('enrollments_student_idx').on(t.studentId),
  index('enrollments_session_idx').on(t.sessionId),
  index('enrollments_class_idx').on(t.classId),
]);

// ============================================================================
// 8. PARENTS & INVITATIONS
// ============================================================================
export const parents = pgTable('parents', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull().unique(),
  parentId: text('parent_id').notNull().unique(), // e.g. "PAR-9D3M-K7RX-2Q8L"
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const parentStudents = pgTable('parent_students', {
  id: serial('id').primaryKey(),
  parentUserId: integer('parent_user_id').references(() => users.id).notNull(),
  studentId: integer('student_id').references(() => students.id).notNull(),
  relationship: text('relationship').default('Parent').notNull(), // 'Father', 'Mother', 'Guardian'
  isPrimary: boolean('is_primary').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('parent_students_unique_idx').on(t.parentUserId, t.studentId),
  index('parent_students_parent_idx').on(t.parentUserId),
  index('parent_students_student_idx').on(t.studentId),
]);

export const parentInvitations = pgTable('parent_invitations', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').references(() => students.id).notNull(),
  invitationToken: text('invitation_token').notNull().unique(), // Stores SHA-256 hash
  invitedEmail: text('invited_email'),
  relationship: text('relationship').default('Guardian').notNull(),
  isUsed: boolean('is_used').default(false).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('parent_invites_student_idx').on(t.studentId),
]);

export const teacherInvitations = pgTable('teacher_invitations', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  employeeId: text('employee_id').notNull().unique(),
  specialization: text('specialization'),
  invitationToken: text('invitation_token').notNull().unique(), // Stores SHA-256 hash
  isUsed: boolean('is_used').default(false).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// 9. CLASS SUBJECTS ALLOCATION
// ============================================================================
export const classSubjects = pgTable('class_subjects', {
  id: serial('id').primaryKey(),
  classId: integer('class_id').references(() => classes.id).notNull(),
  subjectId: integer('subject_id').references(() => subjects.id).notNull(),
  teacherId: integer('teacher_id').references(() => teachers.id),
  periodsPerWeek: integer('periods_per_week').default(4).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('class_subjects_unique_idx').on(t.classId, t.subjectId),
  index('class_subjects_teacher_idx').on(t.teacherId),
]);

// ============================================================================
// 10. ATTENDANCE RECORDS (DAILY SCHOOL ATTENDANCE)
// ============================================================================
export const attendance = pgTable('attendance', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').references(() => students.id).notNull(),
  classId: integer('class_id').references(() => classes.id).notNull(),
  sessionId: integer('session_id').references(() => academicSessions.id),
  termId: integer('term_id').references(() => academicTerms.id),
  date: text('date').notNull(), // Format: YYYY-MM-DD
  status: text('status').notNull(), // 'Present' | 'Absent' | 'Excused'
  isLate: boolean('is_late').default(false).notNull(), // Lateness tracked separately from attendance status
  arrivalTime: text('arrival_time'), // e.g. "08:35 AM"
  lateReason: text('late_reason'),
  lateApproved: boolean('late_approved').default(false).notNull(),
  lateRecordedBy: integer('late_recorded_by').references(() => users.id),
  lateRecordedAt: timestamp('late_recorded_at'),
  remarks: text('remarks'),
  recordedBy: integer('recorded_by').references(() => users.id).notNull(),
  updatedBy: integer('updated_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('attendance_student_date_unique_idx').on(t.studentId, t.date),
  index('attendance_student_idx').on(t.studentId),
  index('attendance_class_idx').on(t.classId),
  index('attendance_date_idx').on(t.date),
  index('attendance_session_idx').on(t.sessionId),
  index('attendance_is_late_idx').on(t.isLate),
]);

export const classAttendanceSubmissions = pgTable('class_attendance_submissions', {
  id: serial('id').primaryKey(),
  classId: integer('class_id').references(() => classes.id).notNull(),
  date: text('date').notNull(), // Format: YYYY-MM-DD
  sessionId: integer('session_id').references(() => academicSessions.id),
  termId: integer('term_id').references(() => academicTerms.id),
  status: text('status').default('submitted').notNull(), // 'submitted'
  submittedBy: integer('submitted_by').references(() => users.id).notNull(),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  notes: text('notes'),
}, (t) => [
  uniqueIndex('class_att_sub_unique_idx').on(t.classId, t.date),
  index('class_att_sub_date_idx').on(t.date),
  index('class_att_sub_class_idx').on(t.classId),
]);

// ============================================================================
// 11. RESULTS & ASSESSMENT ARCHITECTURE
// ============================================================================
export const results = pgTable('results', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').references(() => students.id).notNull(),
  subjectId: integer('subject_id').references(() => subjects.id).notNull(),
  classId: integer('class_id').references(() => classes.id).notNull(),
  termId: integer('term_id').references(() => academicTerms.id).notNull(),
  sessionId: integer('session_id').references(() => academicSessions.id),
  assessmentType: text('assessment_type').notNull(), // 'Continuous Assessment' | 'Final Exam' | 'Midterm Exam'
  testScore: doublePrecision('test_score').default(0).notNull(), // Component 1 (e.g. CA 40 marks)
  examScore: doublePrecision('exam_score').default(0).notNull(), // Component 2 (e.g. Exam 60 marks)
  totalScore: doublePrecision('total_score').default(0).notNull(), // Total (Max 100)
  maxMarks: doublePrecision('max_marks').default(100).notNull(),
  grade: text('grade').notNull(), // 'A', 'B', 'C', 'D', 'E', 'F'
  status: text('status').default('published').notNull(), // 'draft' | 'submitted' | 'approved' | 'published'
  remarks: text('remarks'),
  enteredBy: integer('entered_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('results_composite_unique_idx').on(t.studentId, t.subjectId, t.termId, t.assessmentType),
  index('results_student_term_idx').on(t.studentId, t.termId),
  index('results_class_subject_idx').on(t.classId, t.subjectId),
  index('results_session_idx').on(t.sessionId),
]);

// ============================================================================
// 12. INVOICE & PAYMENT FINANCIAL MODEL
// ============================================================================
export const fees = pgTable('fees', {
  id: serial('id').primaryKey(),
  invoiceNumber: text('invoice_number').unique(), // e.g. "INV-2026-0001"
  studentId: integer('student_id').references(() => students.id).notNull(),
  sessionId: integer('session_id').references(() => academicSessions.id),
  termId: integer('term_id').references(() => academicTerms.id).notNull(),
  feeTitle: text('fee_title').notNull(), // e.g. "First Term Tuition & Materials"
  feeCategory: text('fee_category').default('tuition').notNull(), // 'tuition' | 'uniform' | 'books' | 'transport' | 'examination' | 'boarding' | 'other'
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  amountPaid: numeric('amount_paid', { precision: 12, scale: 2 }).default('0.00').notNull(),
  outstandingBalance: numeric('outstanding_balance', { precision: 12, scale: 2 }).notNull(),
  paymentStatus: text('payment_status').default('unpaid').notNull(), // 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'
  dueDate: text('due_date'), // YYYY-MM-DD
  issuedDate: text('issued_date'), // YYYY-MM-DD
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('fees_invoice_number_unique_idx').on(t.invoiceNumber),
  index('fees_student_idx').on(t.studentId),
  index('fees_term_idx').on(t.termId),
  index('fees_session_idx').on(t.sessionId),
  index('fees_status_idx').on(t.paymentStatus),
  index('fees_invoice_num_idx').on(t.invoiceNumber),
]);

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  feeId: integer('fee_id').references(() => fees.id).notNull(),
  studentId: integer('student_id').references(() => students.id).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paymentDate: text('payment_date').notNull(), // YYYY-MM-DD
  paymentMethod: text('payment_method').notNull(), // 'Bank Transfer' | 'Direct Deposit' | 'Card' | 'Cash' | 'Online Portal'
  paymentReference: text('payment_reference').notNull().unique(),
  receiptNumber: text('receipt_number').notNull().unique(),
  verifiedBy: integer('verified_by').references(() => users.id),
  status: text('status').default('completed').notNull(), // 'completed' | 'pending' | 'reversed' | 'refunded'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('payments_fee_idx').on(t.feeId),
  index('payments_student_idx').on(t.studentId),
  index('payments_date_idx').on(t.paymentDate),
  index('payments_reference_idx').on(t.paymentReference),
]);

// ============================================================================
// 13. ANNOUNCEMENTS & AUDIT
// ============================================================================
export const announcements = pgTable('announcements', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  targetRole: text('target_role').default('all').notNull(), // 'all' | 'students' | 'teachers' | 'parents' | 'class'
  targetClassId: integer('target_class_id').references(() => classes.id),
  priority: text('priority').default('normal').notNull(), // 'low' | 'normal' | 'high' | 'urgent'
  authorId: integer('author_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  userEmail: text('user_email'),
  role: text('role'),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id'),
  details: text('details'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('audit_created_idx').on(t.createdAt),
  index('audit_resource_idx').on(t.resource),
]);

export const passwordResets = pgTable('password_resets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  resetToken: text('reset_token').notNull().unique(), // Stores SHA-256 hash
  expiresAt: timestamp('expires_at').notNull(),
  isUsed: boolean('is_used').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// 14. HOMEWORK & SUBMISSIONS
// ============================================================================
export const homeworks = pgTable('homeworks', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  classId: integer('class_id').references(() => classes.id).notNull(),
  subjectId: integer('subject_id').references(() => subjects.id).notNull(),
  teacherId: integer('teacher_id').references(() => teachers.id).notNull(),
  sessionId: integer('session_id').references(() => academicSessions.id),
  termId: integer('term_id').references(() => academicTerms.id),
  dueDate: text('due_date').notNull(), // YYYY-MM-DD
  maxMarks: integer('max_marks').default(100).notNull(),
  status: text('status').default('active').notNull(), // 'active' | 'closed'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('homeworks_class_idx').on(t.classId),
  index('homeworks_subject_idx').on(t.subjectId),
  index('homeworks_teacher_idx').on(t.teacherId),
  index('homeworks_session_idx').on(t.sessionId),
]);

export const homeworkSubmissions = pgTable('homework_submissions', {
  id: serial('id').primaryKey(),
  homeworkId: integer('homework_id').references(() => homeworks.id).notNull(),
  studentId: integer('student_id').references(() => students.id).notNull(),
  submissionText: text('submission_text').notNull(),
  status: text('status').default('submitted').notNull(), // 'submitted' | 'graded' | 'late' | 'resubmitted'
  score: doublePrecision('score'),
  feedback: text('feedback'),
  gradedBy: integer('graded_by').references(() => users.id),
  gradedAt: timestamp('graded_at'),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('homework_submissions_unique_idx').on(t.homeworkId, t.studentId),
  index('homework_sub_hw_idx').on(t.homeworkId),
  index('homework_sub_student_idx').on(t.studentId),
]);

// ============================================================================
// 15. SECURE COMMUNICATIONS & MESSAGING
// ============================================================================
export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').references(() => students.id).notNull(),
  teacherUserId: integer('teacher_user_id').references(() => users.id).notNull(),
  parentUserId: integer('parent_user_id').references(() => users.id).notNull(),
  subject: text('subject').notNull(),
  category: text('category').default('academic').notNull(), // 'academic' | 'behavior' | 'attendance' | 'financial' | 'safeguarding' | 'general'
  status: text('status').default('active').notNull(), // 'active' | 'closed' | 'resolved' | 'escalated'
  isEscalated: boolean('is_escalated').default(false).notNull(),
  escalationReason: text('escalation_reason'),
  escalatedAt: timestamp('escalated_at'),
  escalatedBy: integer('escalated_by').references(() => users.id),
  lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('conv_student_idx').on(t.studentId),
  index('conv_teacher_idx').on(t.teacherUserId),
  index('conv_parent_idx').on(t.parentUserId),
  index('conv_escalated_idx').on(t.isEscalated),
  index('conv_last_msg_idx').on(t.lastMessageAt),
]);

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').references(() => conversations.id).notNull(),
  senderUserId: integer('sender_user_id').references(() => users.id).notNull(),
  content: text('content').notNull(),
  isRead: boolean('is_read').default(false).notNull(),
  readAt: timestamp('read_at'),
  isInternalNote: boolean('is_internal_note').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('msg_conv_idx').on(t.conversationId),
  index('msg_sender_idx').on(t.senderUserId),
  index('msg_created_idx').on(t.createdAt),
]);

// ============================================================================
// 16. SCHOOL SETTINGS
// ============================================================================
export const schoolSettings = pgTable('school_settings', {
  id: serial('id').primaryKey(),
  schoolName: text('school_name').notNull().default('School Management System'),
  motto: text('motto').default('Integrated Academic & Administrative Platform'),
  currencySymbol: text('currency_symbol').notNull().default('$'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  address: text('address'),
  timezone: text('timezone').default('Africa/Lagos').notNull(),
  attendanceStartTime: text('attendance_start_time').default('07:30').notNull(),
  attendanceCutoffTime: text('attendance_cutoff_time').default('08:30').notNull(),
  attendancePolicy: text('attendance_policy').default('flexible').notNull(), // 'recorder_only' | 'first_scheduled_teacher' | 'flexible'
  termSystem: text('term_system').default('term').notNull(), // 'term' | 'semester'
  levelSystem: text('level_system').default('class').notNull(), // 'class' | 'level' | 'grade' | 'cohort'
  timetableDays: text('timetable_days').default('Monday,Tuesday,Wednesday,Thursday,Friday').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================================
// 17. TIMETABLES & CONFIGURABLE SCHOOL SCHEDULES
// ============================================================================
export const timetablePeriods = pgTable('timetable_periods', {
  id: serial('id').primaryKey(),
  periodNumber: integer('period_number').notNull(),
  label: text('label').notNull(), // e.g. "Period 1", "Morning Break", "Lunch"
  startTime: text('start_time').notNull(), // e.g. "08:00"
  endTime: text('end_time').notNull(), // e.g. "08:45"
  type: text('type').default('lesson').notNull(), // 'lesson' | 'break' | 'lunch' | 'assembly' | 'other'
  isTeaching: boolean('is_teaching').default(true).notNull(), // false for break/lunch/assembly
  sortOrder: integer('sort_order').default(0).notNull(),
  days: text('days').default('Monday,Tuesday,Wednesday,Thursday,Friday').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('timetable_periods_number_idx').on(t.periodNumber),
  index('timetable_periods_type_idx').on(t.type),
]);

export const timetables = pgTable('timetables', {
  id: serial('id').primaryKey(),
  classId: integer('class_id').references(() => classes.id).notNull(),
  subjectId: integer('subject_id').references(() => subjects.id).notNull(),
  teacherId: integer('teacher_id').references(() => teachers.id).notNull(),
  dayOfWeek: text('day_of_week').notNull(), // 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday'
  startTime: text('start_time').notNull(), // e.g. '08:00'
  endTime: text('end_time').notNull(), // e.g. '08:45'
  periodNumber: integer('period_number').default(1).notNull(), // maps to timetablePeriods.periodNumber
  room: text('room').default('Classroom'), // e.g. "Room 101", "Lab 2"
  sessionId: integer('session_id').references(() => academicSessions.id),
  termId: integer('term_id').references(() => academicTerms.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('timetables_class_idx').on(t.classId),
  index('timetables_teacher_idx').on(t.teacherId),
  index('timetables_subject_idx').on(t.subjectId),
  index('timetables_day_idx').on(t.dayOfWeek),
]);

// ============================================================================
// 18. ADMISSIONS & PUBLIC REGISTRATIONS
// ============================================================================
export const admissionApplications = pgTable('admission_applications', {
  id: serial('id').primaryKey(),
  applicationNumber: text('application_number').notNull().unique(), // e.g. "APP-2026-08149"
  accessKey: text('access_key').notNull(), // Secure tracking secret
  firstName: text('first_name').notNull(),
  middleName: text('middle_name'),
  lastName: text('last_name').notNull(),
  dateOfBirth: text('date_of_birth').notNull(), // YYYY-MM-DD
  gender: text('gender').notNull(), // 'Male' | 'Female' | 'Other'
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  address: text('address').notNull(),
  sessionId: integer('session_id').references(() => academicSessions.id).notNull(),
  classId: integer('class_id').references(() => classes.id).notNull(),
  departmentId: integer('department_id').references(() => departments.id),
  guardianName: text('guardian_name'),
  guardianPhone: text('guardian_phone'),
  guardianEmail: text('guardian_email'),
  guardianRelationship: text('guardian_relationship').default('Parent'),
  nationality: text('nationality'),
  stateOfOrigin: text('state_of_origin'),
  lga: text('lga'),
  passportPhoto: text('passport_photo'),
  guardianAddress: text('guardian_address'),
  guardianOccupation: text('guardian_occupation'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  entryMode: text('entry_mode'),
  documents: text('documents'), // JSON stringified array of uploaded documents
  status: text('status').default('pending').notNull(), // 'pending' | 'under_review' | 'needs_information' | 'approved' | 'rejected'
  adminNotes: text('admin_notes'),
  applicantMessage: text('applicant_message'),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  approvedStudentId: integer('approved_student_id').references(() => students.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('admission_apps_session_idx').on(t.sessionId),
  index('admission_apps_class_idx').on(t.classId),
  index('admission_apps_dept_idx').on(t.departmentId),
  index('admission_apps_status_idx').on(t.status),
  index('admission_apps_email_idx').on(t.email),
  uniqueIndex('admission_apps_number_idx').on(t.applicationNumber),
]);

export const admissionApplicationLogs = pgTable('admission_application_logs', {
  id: serial('id').primaryKey(),
  applicationId: integer('application_id').references(() => admissionApplications.id).notNull(),
  action: text('action').notNull(), // 'SUBMITTED' | 'STATUS_CHANGE' | 'NOTE_ADDED' | 'APPROVED' | 'REJECTED' | 'INFO_REQUESTED'
  previousStatus: text('previous_status'),
  newStatus: text('new_status'),
  notes: text('notes'),
  performedBy: integer('performed_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('admission_logs_app_idx').on(t.applicationId),
]);

// ============================================================================
// 19. PUBLIC PORTAL & CMS ARCHITECTURE
// ============================================================================

export const publicPortalSettings = pgTable('public_portal_settings', {
  id: serial('id').primaryKey(),
  // Portal Master Switch & Admissions Window
  portalEnabled: boolean('portal_enabled').default(true).notNull(),
  admissionsOpen: boolean('admissions_open').default(true).notNull(),
  openingDate: text('opening_date'), // YYYY-MM-DD
  closingDate: text('closing_date'), // YYYY-MM-DD
  currentSessionId: integer('current_session_id').references(() => academicSessions.id),
  announcementMessage: text('announcement_message').default('Applications are now officially open for admission into accredited programmes.'),
  applicationInstructions: text('application_instructions'),
  applicationFee: numeric('application_fee', { precision: 12, scale: 2 }).default('0.00').notNull(),
  admissionsContactInfo: text('admissions_contact_info'),
  // Section Visibility Controls
  showPrograms: boolean('show_programs').default(true).notNull(),
  showRequirements: boolean('show_requirements').default(true).notNull(),
  showImportantDates: boolean('show_important_dates').default(true).notNull(),
  showNews: boolean('show_news').default(true).notNull(),
  showFaqs: boolean('show_faqs').default(true).notNull(),
  showContact: boolean('show_contact').default(true).notNull(),
  // Hero & Brand Customization
  heroTitle: text('hero_title').default("Let's fly to your Dream Academy"),
  heroSubtitle: text('hero_subtitle').default('Your dream education is just a few clicks away — no stress, no complexity. Apply smart, verify credentials, and track your admission progress live.'),
  heroBadgeText: text('hero_badge_text').default('Admissions Intake Open'),
  heroPrimaryCtaText: text('hero_primary_cta_text').default('Apply Online'),
  heroSecondaryCtaText: text('hero_secondary_cta_text').default('Track Status'),
  draftSettings: text('draft_settings'),
  hasUnpublishedChanges: boolean('has_unpublished_changes').default(false).notNull(),
  // Social links & public contact extension
  websiteUrl: text('website_url'),
  facebookUrl: text('facebook_url'),
  twitterUrl: text('twitter_url'),
  instagramUrl: text('instagram_url'),
  linkedinUrl: text('linkedin_url'),
  officeHours: text('office_hours').default('Mon - Sat • 8:00 AM - 5:00 PM'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const publicPortalHeroSlides = pgTable('public_portal_hero_slides', {
  id: serial('id').primaryKey(),
  imageUrl: text('image_url').notNull(),
  title: text('title'),
  altText: text('alt_text').default('Campus Hero Background'),
  displayOrder: integer('display_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('hero_slides_active_idx').on(t.isActive),
  index('hero_slides_order_idx').on(t.displayOrder),
]);

export const blogCategories = pgTable('blog_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const blogPosts = pgTable('blog_posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  summary: text('summary'),
  content: text('content').notNull(), // Sanitized rich-text HTML
  featuredImage: text('featured_image'),
  category: text('category').default('Admissions').notNull(),
  categoryId: integer('category_id').references(() => blogCategories.id),
  authorName: text('author_name').default('Admissions Committee').notNull(),
  authorId: integer('author_id').references(() => users.id),
  status: text('status').default('published').notNull(), // 'draft' | 'published' | 'archived'
  publishedAt: timestamp('published_at'),
  isFeatured: boolean('is_featured').default(false).notNull(),
  viewsCount: integer('views_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('blog_posts_slug_idx').on(t.slug),
  index('blog_posts_status_idx').on(t.status),
  index('blog_posts_published_idx').on(t.publishedAt),
  index('blog_posts_category_idx').on(t.category),
]);

export const importantDates = pgTable('important_dates', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  eventDate: text('event_date').notNull(), // YYYY-MM-DD
  eventTime: text('event_time'), // e.g. "09:00 AM"
  category: text('category').default('Admission').notNull(), // 'Admission' | 'Academic' | 'Exam' | 'Resumption' | 'General'
  isPubliclyVisible: boolean('is_publicly_visible').default(true).notNull(),
  status: text('status').default('upcoming').notNull(), // 'upcoming' | 'ongoing' | 'past'
  displayOrder: integer('display_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('dates_visible_idx').on(t.isPubliclyVisible),
  index('dates_event_date_idx').on(t.eventDate),
  index('dates_order_idx').on(t.displayOrder),
]);

export const admissionRequirements = pgTable('admission_requirements', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  scope: text('scope').default('general').notNull(), // 'general' | 'department' | 'class'
  departmentId: integer('department_id').references(() => departments.id),
  classId: integer('class_id').references(() => classes.id),
  isMandatory: boolean('is_mandatory').default(true).notNull(),
  isPubliclyVisible: boolean('is_publicly_visible').default(true).notNull(),
  displayOrder: integer('display_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('reqs_scope_idx').on(t.scope),
  index('reqs_dept_idx').on(t.departmentId),
  index('reqs_class_idx').on(t.classId),
  index('reqs_visible_idx').on(t.isPubliclyVisible),
]);

export const faqs = pgTable('faqs', {
  id: serial('id').primaryKey(),
  question: text('question').notNull(),
  answer: text('answer').notNull(), // Sanitized rich HTML / text
  category: text('category').default('General').notNull(), // 'Admissions' | 'Requirements' | 'Financial' | 'Academic' | 'General'
  displayOrder: integer('display_order').default(0).notNull(),
  isPublished: boolean('is_published').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('faqs_published_idx').on(t.isPublished),
  index('faqs_order_idx').on(t.displayOrder),
]);

// ============================================================================
// 18. DRIZZLE ORM RELATIONS
// ============================================================================
export const usersRelations = relations(users, ({ one, many }) => ({
  teacherProfile: one(teachers, {
    fields: [users.id],
    references: [teachers.userId],
  }),
  studentProfile: one(students, {
    fields: [users.id],
    references: [students.userId],
  }),
  parentProfile: one(parents, {
    fields: [users.id],
    references: [parents.userId],
  }),
  parentStudents: many(parentStudents),
  auditLogs: many(auditLogs),
}));

export const academicSessionsRelations = relations(academicSessions, ({ many }) => ({
  terms: many(academicTerms),
  classes: many(classes),
  enrollments: many(studentEnrollments),
  results: many(results),
  fees: many(fees),
}));

export const academicTermsRelations = relations(academicTerms, ({ one, many }) => ({
  session: one(academicSessions, {
    fields: [academicTerms.sessionId],
    references: [academicSessions.id],
  }),
  results: many(results),
  fees: many(fees),
  attendance: many(attendance),
  homeworks: many(homeworks),
}));

export const parentsRelations = relations(parents, ({ one }) => ({
  user: one(users, {
    fields: [parents.userId],
    references: [users.id],
  }),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  session: one(academicSessions, {
    fields: [classes.sessionId],
    references: [academicSessions.id],
  }),
  classTeacher: one(teachers, {
    fields: [classes.classTeacherId],
    references: [teachers.id],
  }),
  attendanceRecorder: one(teachers, {
    fields: [classes.attendanceRecorderId],
    references: [teachers.id],
  }),
  students: many(students),
  enrollments: many(studentEnrollments),
  classSubjects: many(classSubjects),
  attendance: many(attendance),
  submissions: many(classAttendanceSubmissions),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  user: one(users, {
    fields: [students.userId],
    references: [users.id],
  }),
  class: one(classes, {
    fields: [students.classId],
    references: [classes.id],
  }),
  currentSession: one(academicSessions, {
    fields: [students.currentSessionId],
    references: [academicSessions.id],
  }),
  enrollmentHistory: many(studentEnrollments),
  parentLinks: many(parentStudents),
  attendance: many(attendance),
  results: many(results),
  fees: many(fees),
  payments: many(payments),
}));

export const studentEnrollmentsRelations = relations(studentEnrollments, ({ one }) => ({
  student: one(students, {
    fields: [studentEnrollments.studentId],
    references: [students.id],
  }),
  class: one(classes, {
    fields: [studentEnrollments.classId],
    references: [classes.id],
  }),
  session: one(academicSessions, {
    fields: [studentEnrollments.sessionId],
    references: [academicSessions.id],
  }),
  promotedToClass: one(classes, {
    fields: [studentEnrollments.promotedToClassId],
    references: [classes.id],
  }),
}));

export const teachersRelations = relations(teachers, ({ one, many }) => ({
  user: one(users, {
    fields: [teachers.userId],
    references: [users.id],
  }),
  classSubjects: many(classSubjects),
  assignedClasses: many(classes),
}));

export const classSubjectsRelations = relations(classSubjects, ({ one }) => ({
  class: one(classes, {
    fields: [classSubjects.classId],
    references: [classes.id],
  }),
  subject: one(subjects, {
    fields: [classSubjects.subjectId],
    references: [subjects.id],
  }),
  teacher: one(teachers, {
    fields: [classSubjects.teacherId],
    references: [teachers.id],
  }),
}));

export const resultsRelations = relations(results, ({ one }) => ({
  student: one(students, {
    fields: [results.studentId],
    references: [students.id],
  }),
  subject: one(subjects, {
    fields: [results.subjectId],
    references: [subjects.id],
  }),
  class: one(classes, {
    fields: [results.classId],
    references: [classes.id],
  }),
  term: one(academicTerms, {
    fields: [results.termId],
    references: [academicTerms.id],
  }),
  session: one(academicSessions, {
    fields: [results.sessionId],
    references: [academicSessions.id],
  }),
}));

export const feesRelations = relations(fees, ({ one, many }) => ({
  student: one(students, {
    fields: [fees.studentId],
    references: [students.id],
  }),
  term: one(academicTerms, {
    fields: [fees.termId],
    references: [academicTerms.id],
  }),
  session: one(academicSessions, {
    fields: [fees.sessionId],
    references: [academicSessions.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  fee: one(fees, {
    fields: [payments.feeId],
    references: [fees.id],
  }),
  student: one(students, {
    fields: [payments.studentId],
    references: [students.id],
  }),
  verifiedByUser: one(users, {
    fields: [payments.verifiedBy],
    references: [users.id],
  }),
}));

export const homeworksRelations = relations(homeworks, ({ one, many }) => ({
  class: one(classes, {
    fields: [homeworks.classId],
    references: [classes.id],
  }),
  subject: one(subjects, {
    fields: [homeworks.subjectId],
    references: [subjects.id],
  }),
  teacher: one(teachers, {
    fields: [homeworks.teacherId],
    references: [teachers.id],
  }),
  term: one(academicTerms, {
    fields: [homeworks.termId],
    references: [academicTerms.id],
  }),
  session: one(academicSessions, {
    fields: [homeworks.sessionId],
    references: [academicSessions.id],
  }),
  submissions: many(homeworkSubmissions),
}));

export const homeworkSubmissionsRelations = relations(homeworkSubmissions, ({ one }) => ({
  homework: one(homeworks, {
    fields: [homeworkSubmissions.homeworkId],
    references: [homeworks.id],
  }),
  student: one(students, {
    fields: [homeworkSubmissions.studentId],
    references: [students.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  student: one(students, {
    fields: [conversations.studentId],
    references: [students.id],
  }),
  teacherUser: one(users, {
    fields: [conversations.teacherUserId],
    references: [users.id],
  }),
  parentUser: one(users, {
    fields: [conversations.parentUserId],
    references: [users.id],
  }),
  escalatedByUser: one(users, {
    fields: [conversations.escalatedBy],
    references: [users.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderUserId],
    references: [users.id],
  }),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  student: one(students, {
    fields: [attendance.studentId],
    references: [students.id],
  }),
  class: one(classes, {
    fields: [attendance.classId],
    references: [classes.id],
  }),
  session: one(academicSessions, {
    fields: [attendance.sessionId],
    references: [academicSessions.id],
  }),
  term: one(academicTerms, {
    fields: [attendance.termId],
    references: [academicTerms.id],
  }),
  recordedByUser: one(users, {
    fields: [attendance.recordedBy],
    references: [users.id],
  }),
  lateRecordedByUser: one(users, {
    fields: [attendance.lateRecordedBy],
    references: [users.id],
  }),
  updatedByUser: one(users, {
    fields: [attendance.updatedBy],
    references: [users.id],
  }),
}));

export const classAttendanceSubmissionsRelations = relations(classAttendanceSubmissions, ({ one }) => ({
  class: one(classes, {
    fields: [classAttendanceSubmissions.classId],
    references: [classes.id],
  }),
  session: one(academicSessions, {
    fields: [classAttendanceSubmissions.sessionId],
    references: [academicSessions.id],
  }),
  term: one(academicTerms, {
    fields: [classAttendanceSubmissions.termId],
    references: [academicTerms.id],
  }),
  submittedByUser: one(users, {
    fields: [classAttendanceSubmissions.submittedBy],
    references: [users.id],
  }),
  updatedByUser: one(users, {
    fields: [classAttendanceSubmissions.updatedBy],
    references: [users.id],
  }),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  classes: many(classes),
  applications: many(admissionApplications),
}));

export const admissionApplicationsRelations = relations(admissionApplications, ({ one, many }) => ({
  session: one(academicSessions, {
    fields: [admissionApplications.sessionId],
    references: [academicSessions.id],
  }),
  class: one(classes, {
    fields: [admissionApplications.classId],
    references: [classes.id],
  }),
  department: one(departments, {
    fields: [admissionApplications.departmentId],
    references: [departments.id],
  }),
  reviewer: one(users, {
    fields: [admissionApplications.reviewedBy],
    references: [users.id],
  }),
  approvedStudent: one(students, {
    fields: [admissionApplications.approvedStudentId],
    references: [students.id],
  }),
  logs: many(admissionApplicationLogs),
}));

export const admissionApplicationLogsRelations = relations(admissionApplicationLogs, ({ one }) => ({
  application: one(admissionApplications, {
    fields: [admissionApplicationLogs.applicationId],
    references: [admissionApplications.id],
  }),
  performer: one(users, {
    fields: [admissionApplicationLogs.performedBy],
    references: [users.id],
  }),
}));

