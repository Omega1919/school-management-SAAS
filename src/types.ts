export type UserRole = 'super_admin' | 'teacher' | 'parent' | 'student';

export type StaffPermission =
  | 'fee_management'
  | 'public_portal_management'
  | 'visual_page_editor'
  | 'admissions_management'
  | 'timetable_editing'
  | 'class_management'
  | 'grading_management'
  | 'announcements_management'
  | 'attendance_management';

export interface PermissionDefinition {
  id: StaffPermission;
  name: string;
  category: 'Finance' | 'Website & CMS' | 'Admissions' | 'Academics' | 'Communication' | 'Operations';
  description: string;
  icon: string;
}

export const AVAILABLE_STAFF_PERMISSIONS: PermissionDefinition[] = [
  {
    id: 'fee_management',
    name: 'Fee Management & Invoicing',
    category: 'Finance',
    description: 'Create & manage school fee structures, issue student invoices, record payments, and view billing statistics.',
    icon: 'CreditCard',
  },
  {
    id: 'public_portal_management',
    name: 'Public Website & CMS Management',
    category: 'Website & CMS',
    description: 'Publish and edit articles, campus news, admission key dates, entry requirements, and school FAQs.',
    icon: 'Globe',
  },
  {
    id: 'visual_page_editor',
    name: 'Visual Page Editor',
    category: 'Website & CMS',
    description: 'Access the live visual editor to rearrange hero slides, interactive section layouts, and publish live changes.',
    icon: 'Sparkles',
  },
  {
    id: 'admissions_management',
    name: 'Student Admissions & Applications',
    category: 'Admissions',
    description: 'Review applicant submissions, approve/reject admissions, request extra documentation, and manage enrollment pipeline.',
    icon: 'UserCheck',
  },
  {
    id: 'timetable_editing',
    name: 'Timetable & Schedule Editing',
    category: 'Academics',
    description: 'Create, modify, and delete class timetables, assign period slots, instructors, and lecture halls.',
    icon: 'CalendarDays',
  },
  {
    id: 'class_management',
    name: 'Classes & Curriculum Management',
    category: 'Academics',
    description: 'Create and organize classes, departments, sections, and allocate academic subjects to cohorts.',
    icon: 'BookOpen',
  },
  {
    id: 'grading_management',
    name: 'Grading & Academic Report Approvals',
    category: 'Academics',
    description: 'Approve submitted test/exam scores, finalize class report cards, and publish grades school-wide.',
    icon: 'Award',
  },
  {
    id: 'announcements_management',
    name: 'Announcements Broadcast',
    category: 'Communication',
    description: 'Broadcast urgent and regular school-wide announcements to teachers, parents, and students.',
    icon: 'Bell',
  },
  {
    id: 'attendance_management',
    name: 'Full Attendance Oversight',
    category: 'Operations',
    description: 'Review full school attendance registers, approve student lateness, and manage school-wide attendance metrics.',
    icon: 'CalendarCheck',
  },
];

export interface User {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  status: 'active' | 'suspended' | 'pending';
  phone?: string;
  permissions?: StaffPermission[] | string[];
  createdAt?: string;
}

export interface AcademicSession {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: 'upcoming' | 'active' | 'completed' | 'archived' | 'closed';
  description?: string | null;
  terms?: AcademicTerm[];
  totalClasses?: number;
  totalEnrollments?: number;
  createdAt?: string;
}

export interface StudentEnrollment {
  id: number;
  sessionId: number;
  sessionName: string;
  classId: number;
  className: string;
  enrollmentDate: string;
  status: 'enrolled' | 'promoted' | 'repeated' | 'transferred' | 'graduated' | 'withdrawn';
  academicAverage?: number | null;
  attendanceRate?: number | null;
  remarks?: string | null;
  createdAt?: string;
}

export interface Student {
  id: number;
  studentId: string;
  firstName: string;
  lastName: string;
  gender?: string;
  dateOfBirth?: string;
  classId?: number | null;
  className?: string;
  currentSessionId?: number | null;
  sessionName?: string;
  admissionDate?: string;
  emergencyContact?: string;
  status: 'active' | 'archived' | 'suspended';
  hasAccount?: boolean;
  hasEnrollmentToken?: boolean;
  enrollmentToken?: string | null;
  createdAt?: string;
}

export interface Teacher {
  id: number;
  userId: number;
  fullName: string;
  email: string;
  phone?: string;
  employeeId: string;
  specialization?: string;
  qualification?: string;
  status: string;
  address?: string;
  hireDate?: string;
  permissions?: StaffPermission[] | string[];
}

export interface ParentProfile {
  id: number;
  userId: number;
  parentId: string;
  createdAt: string;
}

export interface ClassItem {
  id: number;
  name: string;
  section?: string | null;
  gradeLevel?: string | null;
  sessionId?: number | null;
  sessionName?: string | null;
  capacity: number;
  classTeacherId?: number | null;
  classTeacherName?: string | null;
  attendanceRecorderId?: number | null;
  attendanceRecorderName?: string | null;
  status?: string;
  studentCount?: number;
  isClassTeacher?: boolean;
  isAttendanceRecorder?: boolean;
  canRecordAttendance?: boolean;
}

export interface SubjectItem {
  id: number;
  code: string;
  name: string;
  category?: string;
}

export interface AcademicTerm {
  id: number;
  sessionId?: number | null;
  sessionName: string;
  termName: string;
  termNumber?: number;
  isCurrent: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

export interface SchoolSettings {
  id: number;
  schoolName: string;
  motto?: string;
  currencySymbol: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  timezone?: string;
  attendanceStartTime?: string;
  attendanceCutoffTime?: string;
  attendancePolicy?: string;
  updatedAt?: string;
}

export interface AttendanceRecord {
  id: number;
  studentId: number;
  studentCode: string;
  studentName: string;
  classId: number;
  className: string;
  sessionId?: number;
  date: string;
  status: 'Present' | 'Absent' | 'Excused';
  isLate?: boolean;
  arrivalTime?: string | null;
  lateReason?: string | null;
  lateApproved?: boolean;
  remarks?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ClassAttendanceStatus {
  classId: number;
  className: string;
  section?: string | null;
  gradeLevel?: string | null;
  capacity: number;
  classTeacherId?: number | null;
  classTeacherName?: string | null;
  attendanceRecorderId?: number | null;
  attendanceRecorderName?: string | null;
  isClassTeacher?: boolean;
  isAttendanceRecorder?: boolean;
  isSubmitted: boolean;
  submissionStatus: 'submitted' | 'not_submitted';
  submittedAt?: string | null;
  submittedBy?: number | null;
  submittedByName?: string | null;
  totalEnrolled: number;
  totalMarked: number;
  presentCount: number;
  absentCount: number;
  excusedCount: number;
  lateCount: number;
}

export interface ResultRecord {
  id: number;
  studentId: number;
  studentName: string;
  studentCode: string;
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  classId: number;
  className: string;
  sessionId?: number | null;
  sessionName?: string;
  termId: number;
  termName: string;
  assessmentType: string;
  testScore: number;
  examScore: number;
  totalScore: number;
  maxMarks?: number;
  grade: string;
  status?: string;
  remarks?: string;
  updatedAt: string;
}

export interface FeeRecord {
  id: number;
  invoiceNumber?: string;
  studentId: number;
  studentName: string;
  studentCode: string;
  className?: string;
  sessionId?: number | null;
  sessionName?: string;
  termId: number;
  termName: string;
  feeTitle: string;
  feeCategory?: 'tuition' | 'uniform' | 'books' | 'transport' | 'examination' | 'boarding' | 'other';
  amount: number | string;
  amountPaid: number | string;
  outstandingBalance: number | string;
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
  dueDate?: string | null;
  issuedDate?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface PaymentTransaction {
  id: number;
  receiptNumber: string;
  paymentReference: string;
  amount: number | string;
  paymentDate: string;
  paymentMethod: string;
  status: string;
  studentId?: number;
  studentName?: string;
  studentCode?: string;
  feeTitle?: string;
  notes?: string;
  createdAt: string;
}

export interface Announcement {
  id: number;
  title: string;
  content: string;
  targetRole: string;
  targetClassId?: number;
  className?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  authorName: string;
  createdAt: string;
}

export interface AuditLog {
  id: number;
  userId?: number;
  userEmail?: string;
  role?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: string;
  ipAddress?: string;
  createdAt: string;
}

export interface HomeworkSubmission {
  id: number;
  homeworkId: number;
  studentId: number;
  studentName?: string;
  studentCode?: string;
  submissionText: string;
  status: 'submitted' | 'graded';
  score?: number | null;
  feedback?: string | null;
  submittedAt: string;
  gradedAt?: string | null;
}

export interface HomeworkItem {
  id: number;
  title: string;
  description: string;
  classId: number;
  className: string;
  classSection?: string;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  teacherName?: string;
  dueDate: string;
  maxMarks: number;
  status: 'active' | 'closed';
  createdAt: string;
  totalStudents?: number;
  totalSubmissions?: number;
  gradedSubmissions?: number;
  pendingToGrade?: number;
  submission?: HomeworkSubmission | null;
  children?: Array<{
    studentId: number;
    studentName: string;
    submission: HomeworkSubmission | null;
  }>;
}

export interface CommunicationMessage {
  id: number;
  conversationId: number;
  senderUserId: number;
  senderName: string;
  senderRole: UserRole;
  content: string;
  isRead: boolean;
  readAt?: string | null;
  isInternalNote: boolean;
  createdAt: string;
}

export interface ConversationItem {
  id: number;
  studentId: number;
  studentCode: string;
  studentFirstName: string;
  studentLastName: string;
  studentName?: string;
  className?: string;
  teacherUserId: number;
  teacherName?: string;
  parentUserId: number;
  parentName?: string;
  subject: string;
  category: 'academic' | 'behavior' | 'attendance' | 'financial' | 'safeguarding' | 'general';
  status: 'active' | 'closed' | 'resolved' | 'escalated';
  isEscalated: boolean;
  escalationReason?: string | null;
  escalatedAt?: string | null;
  lastMessageAt: string;
  createdAt: string;
  unreadCount?: number;
  lastMessageSnippet?: string;
  lastMessageSenderId?: number;
  messages?: CommunicationMessage[];
}
