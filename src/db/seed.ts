import { db, pool } from './index.ts';
import {
  users,
  teachers,
  students,
  parents,
  parentStudents,
  classes,
  subjects,
  classSubjects,
  academicSessions,
  academicTerms,
  studentEnrollments,
  fees,
  payments,
  attendance,
  classAttendanceSubmissions,
  homeworks,
  homeworkSubmissions,
  results,
  announcements,
  conversations,
  messages,
  schoolSettings,
  auditLogs,
  timetables,
  timetablePeriods,
  departments,
  admissionApplications,
  admissionApplicationLogs,
  publicPortalSettings,
  blogCategories,
  blogPosts,
  importantDates,
  admissionRequirements,
  faqs,
} from './schema.ts';
import { hashPassword } from '../lib/auth.ts';
import { eq, sql } from 'drizzle-orm';

export const DDL_STATEMENTS = `
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'teacher', 'parent', 'student');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'suspended', 'pending');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE session_status AS ENUM ('upcoming', 'active', 'completed', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE enrollment_status AS ENUM ('enrolled', 'promoted', 'repeated', 'transferred', 'graduated', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('Present', 'Absent', 'Excused');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE grade_letter AS ENUM ('A', 'B', 'C', 'D', 'E', 'F');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE result_status AS ENUM ('draft', 'submitted', 'approved', 'published');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('draft', 'unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('completed', 'pending', 'reversed', 'refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method_type AS ENUM ('Bank Transfer', 'Direct Deposit', 'Card', 'Cash', 'Online Portal');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE conversation_status AS ENUM ('active', 'closed', 'resolved', 'escalated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE homework_status AS ENUM ('active', 'closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE submission_status AS ENUM ('submitted', 'graded', 'late', 'resubmitted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  phone TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_sessions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_terms (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES academic_sessions(id),
  session_name TEXT NOT NULL,
  term_name TEXT NOT NULL,
  term_number INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  start_date TEXT,
  end_date TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teachers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  employee_id TEXT NOT NULL UNIQUE,
  specialization TEXT,
  qualification TEXT,
  hire_date TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  section TEXT,
  grade_level TEXT,
  session_id INTEGER REFERENCES academic_sessions(id),
  capacity INTEGER NOT NULL DEFAULT 40,
  class_teacher_id INTEGER REFERENCES teachers(id),
  attendance_recorder_id INTEGER REFERENCES teachers(id),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id),
  student_id TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dateOfBirth TEXT,
  date_of_birth TEXT,
  gender TEXT,
  class_id INTEGER REFERENCES classes(id),
  current_session_id INTEGER REFERENCES academic_sessions(id),
  admission_date TEXT,
  address TEXT,
  emergency_contact TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  enrollment_token TEXT UNIQUE,
  enrollment_token_expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_enrollments (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  session_id INTEGER NOT NULL REFERENCES academic_sessions(id),
  term_id INTEGER REFERENCES academic_terms(id),
  enrollment_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enrolled',
  academic_average DOUBLE PRECISION,
  attendance_rate DOUBLE PRECISION,
  promoted_to_class_id INTEGER REFERENCES classes(id),
  remarks TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  parent_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parent_students (
  id SERIAL PRIMARY KEY,
  parent_user_id INTEGER NOT NULL REFERENCES users(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  relationship TEXT NOT NULL DEFAULT 'Parent',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parent_invitations (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  invitation_token TEXT NOT NULL UNIQUE,
  invited_email TEXT,
  relationship TEXT NOT NULL DEFAULT 'Guardian',
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_invitations (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  employee_id TEXT NOT NULL UNIQUE,
  specialization TEXT,
  invitation_token TEXT NOT NULL UNIQUE,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_subjects (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  teacher_id INTEGER REFERENCES teachers(id),
  periods_per_week INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  session_id INTEGER REFERENCES academic_sessions(id),
  term_id INTEGER REFERENCES academic_terms(id),
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  arrival_time TEXT,
  late_reason TEXT,
  late_approved BOOLEAN NOT NULL DEFAULT FALSE,
  late_recorded_by INTEGER REFERENCES users(id),
  late_recorded_at TIMESTAMP,
  remarks TEXT,
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_attendance_submissions (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  date TEXT NOT NULL,
  session_id INTEGER REFERENCES academic_sessions(id),
  term_id INTEGER REFERENCES academic_terms(id),
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_by INTEGER NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS results (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  term_id INTEGER NOT NULL REFERENCES academic_terms(id),
  session_id INTEGER REFERENCES academic_sessions(id),
  assessment_type TEXT NOT NULL,
  test_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  exam_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_marks DOUBLE PRECISION NOT NULL DEFAULT 100,
  grade TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  remarks TEXT,
  entered_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fees (
  id SERIAL PRIMARY KEY,
  invoice_number TEXT UNIQUE,
  student_id INTEGER NOT NULL REFERENCES students(id),
  session_id INTEGER REFERENCES academic_sessions(id),
  term_id INTEGER NOT NULL REFERENCES academic_terms(id),
  fee_title TEXT NOT NULL,
  fee_category TEXT NOT NULL DEFAULT 'tuition',
  amount NUMERIC(12, 2) NOT NULL,
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT '0.00',
  outstanding_balance NUMERIC(12, 2) NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  due_date TEXT,
  issued_date TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  fee_id INTEGER NOT NULL REFERENCES fees(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  amount NUMERIC(12, 2) NOT NULL,
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_reference TEXT NOT NULL UNIQUE,
  receipt_number TEXT NOT NULL UNIQUE,
  verified_by INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'completed',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  target_role TEXT NOT NULL DEFAULT 'all',
  target_class_id INTEGER REFERENCES classes(id),
  priority TEXT NOT NULL DEFAULT 'normal',
  author_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  user_email TEXT,
  role TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  reset_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS homeworks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  session_id INTEGER REFERENCES academic_sessions(id),
  term_id INTEGER REFERENCES academic_terms(id),
  due_date TEXT NOT NULL,
  max_marks INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS homework_submissions (
  id SERIAL PRIMARY KEY,
  homework_id INTEGER NOT NULL REFERENCES homeworks(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  submission_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  score DOUBLE PRECISION,
  feedback TEXT,
  graded_by INTEGER REFERENCES users(id),
  graded_at TIMESTAMP,
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  teacher_user_id INTEGER NOT NULL REFERENCES users(id),
  parent_user_id INTEGER NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'academic',
  status TEXT NOT NULL DEFAULT 'active',
  is_escalated BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_reason TEXT,
  escalated_at TIMESTAMP,
  escalated_by INTEGER REFERENCES users(id),
  last_message_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  sender_user_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMP,
  is_internal_note BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS school_settings (
  id SERIAL PRIMARY KEY,
  school_name TEXT NOT NULL DEFAULT 'School Management System',
  motto TEXT DEFAULT 'Integrated Academic & Administrative Platform',
  currencySymbol TEXT,
  currency_symbol TEXT NOT NULL DEFAULT '₦',
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  attendance_start_time TEXT NOT NULL DEFAULT '07:30',
  attendance_cutoff_time TEXT NOT NULL DEFAULT '08:30',
  attendance_policy TEXT NOT NULL DEFAULT 'flexible',
  timetable_days TEXT NOT NULL DEFAULT 'Monday,Tuesday,Wednesday,Thursday,Friday',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timetable_periods (
  id SERIAL PRIMARY KEY,
  period_number INTEGER NOT NULL,
  label TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'lesson',
  is_teaching BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  days TEXT NOT NULL DEFAULT 'Monday,Tuesday,Wednesday,Thursday,Friday',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timetables (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  day_of_week TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  period_number INTEGER NOT NULL DEFAULT 1,
  room TEXT DEFAULT 'Classroom',
  session_id INTEGER REFERENCES academic_sessions(id),
  term_id INTEGER REFERENCES academic_terms(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE students ADD COLUMN IF NOT EXISTS address TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE teachers ADD COLUMN IF NOT EXISTS address TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

-- Clean any existing duplicate current records before creating unique index
UPDATE academic_sessions
SET is_current = false
WHERE is_current = true AND id NOT IN (
  SELECT id FROM academic_sessions WHERE is_current = true ORDER BY id DESC LIMIT 1
);

UPDATE academic_terms
SET is_current = false
WHERE is_current = true AND id NOT IN (
  SELECT id FROM academic_terms WHERE is_current = true ORDER BY id DESC LIMIT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS academic_sessions_current_unique_idx ON academic_sessions (is_current) WHERE is_current = true;
CREATE UNIQUE INDEX IF NOT EXISTS academic_terms_current_unique_idx ON academic_terms (is_current) WHERE is_current = true;

CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE classes ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id);
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS term_system TEXT NOT NULL DEFAULT 'term';
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS level_system TEXT NOT NULL DEFAULT 'class';
EXCEPTION WHEN OTHERS THEN null; END $$;

CREATE TABLE IF NOT EXISTS admission_applications (
  id SERIAL PRIMARY KEY,
  application_number TEXT NOT NULL UNIQUE,
  access_key TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  gender TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  session_id INTEGER NOT NULL REFERENCES academic_sessions(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  department_id INTEGER REFERENCES departments(id),
  guardian_name TEXT,
  guardian_phone TEXT,
  guardian_email TEXT,
  guardian_relationship TEXT DEFAULT 'Parent',
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  applicant_message TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  approved_student_id INTEGER REFERENCES students(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admission_application_logs (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES admission_applications(id),
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  notes TEXT,
  performed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

export async function ensureTablesExist() {
  const { runMigrations } = await import('./migrations.ts');
  await runMigrations();
}

// Batch insert helper to avoid overwhelming Postgres parameter limits
async function batchInsert<T extends Record<string, any>>(table: any, items: T[], batchSize = 50) {
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    if (chunk.length > 0) {
      await db.insert(table).values(chunk);
    }
  }
}

// Generate all weekday dates between startDate and endDate (inclusive)
function getWeekdayDates(startDateStr: string, endDateStr: string): string[] {
  const dates: string[] = [];
  const curr = new Date(startDateStr);
  const end = new Date(endDateStr);
  while (curr <= end) {
    const day = curr.getDay();
    if (day !== 0 && day !== 6) {
      // Mon-Fri
      dates.push(curr.toISOString().split('T')[0]);
    }
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

// Lists for realistic generator
const FIRST_NAMES_MALE = [
  'Chinedu', 'Emeka', 'David', 'Femi', 'Tunde', 'Babatunde', 'Ibrahim', 'Samuel', 'Mustapha',
  'Kayode', 'Farouk', 'Kofi', 'Bashir', 'Segun', 'Kelechi', 'Obinna', 'Adeyemi', 'Dapo',
  'Victor', 'Emmanuel', 'Michael', 'Daniel', 'Gabriel', 'Joshua', 'Joseph', 'Usman', 'Aliyu',
  'Tariq', 'Sadiq', 'Kabir', 'Olamide', 'Rotimi', 'Bolaji', 'Chuka', 'Somto', 'Ifeanyi',
  'Nonso', 'Tochukwu', 'Jubril', 'Zubairu', 'Umar', 'Hamza', 'Mansur', 'Haruna', 'Suleiman'
];

const FIRST_NAMES_FEMALE = [
  'Zainab', 'Aisha', 'Ngozi', 'Maryam', 'Grace', 'Chioma', 'Fatima', 'Amina', 'Folake',
  'Blessing', 'Temitope', 'Halima', 'Amara', 'Yetunde', 'Funmilayo', 'Chinwe', 'Khadijah',
  'Adaobi', 'Chiamaka', 'Oluchi', 'Kemi', 'Ronke', 'Yewande', 'Omotola', 'Titilope',
  'Hauwa', 'Safiya', 'Rukayat', 'Bilkis', 'Nafisa', 'Somkele', 'Uchechi', 'Nneka', 'Ifeoma',
  'Joy', 'Faith', 'Precious', 'Mercy', 'Hannah', 'Esther', 'Ruth', 'Deborah', 'Sarah'
];

const LAST_NAMES = [
  'Okafor', 'Bello', 'Eze', 'Mohammed', 'Oluwaseun', 'Adeleke', 'Balogun', 'Abubakar',
  'Bakare', 'Danjuma', 'Adewale', 'Okonkwo', 'Adeyemi', 'Kalu', 'Yusuf', 'Nwachukwu',
  'Dahiru', 'Awolowo', 'Aliyu', 'Ojo', 'Sani', 'Ogundipe', 'Nwosu', 'Garba', 'Ibrahim',
  'Lawal', 'Mensah', 'Umar', 'Johnson', 'Bamidele', 'Yakubu', 'Okoro', 'Afolabi', 'Idris',
  'Chukwu', 'Oladipo', 'Fashola', 'Soyinka', 'Achebe', 'Nnamani', 'Soludo', 'Sanusi',
  'Dangote', 'Tinubu', 'Akintola', 'Gowon', 'Obasanjo', 'Buhari', 'Jonathan', 'Azikiwe'
];

const LAGOS_AREAS = [
  'Victoria Island', 'Ikoyi', 'Lekki Phase 1', 'Ikeja GRA', 'Surulere', 'Yaba',
  'Maryland', 'Magodo Phase 2', 'Gbagada Phase 1', 'Ogudu GRA', 'Opebi, Ikeja',
  'Allen Avenue, Ikeja', 'Bode Thomas, Surulere', 'Admiralty Way, Lekki',
  'Banana Island, Ikoyi', 'Chevy View, Chevron Lekki', 'Parkview Estate, Ikoyi'
];

/**
 * Reconstructs comprehensive academic dummy dataset:
 * - 2-Month everyday attendance stretch (Monday, Aug 3, 2026 to Friday, Sep 25, 2026 = 40 school days)
 * - 500 Students across 18 distinct classes
 * - 30 Teachers across all academic subjects
 * - 350 Parents linked with primary guardian relations
 * - Academic sessions, enrollments, fees, results, homeworks, submissions, messages
 */
export async function seedInitialData(explicitOptIn = false) {
  // Production safety: Never allow TRUNCATE or database resets in production without explicit opt-in
  if (process.env.NODE_ENV === 'production' && !explicitOptIn && process.env.ALLOW_SEED !== 'true') {
    throw new Error('PRODUCTION SAFETY VIOLATION: Database reseed/reset operations with TRUNCATE are strictly forbidden in production without explicit opt-in.');
  }

  try {
    await ensureTablesExist();

    // Check baseline institutional settings
    const settings = await db.select().from(schoolSettings).limit(1);
    if (settings.length === 0) {
      await db.insert(schoolSettings).values({
        schoolName: 'Springfield International Academy',
        motto: 'Excellence, Character & Integrity',
        currencySymbol: '₦',
        contactEmail: 'contact@springfield.edu.ng',
        contactPhone: '+234 1 234 5678',
        address: '12 Academy Boulevard, Victoria Island, Lagos',
        timezone: 'Africa/Lagos',
        attendanceStartTime: '07:30',
        attendanceCutoffTime: '08:30',
        attendancePolicy: 'flexible',
      });
    }

    console.log('🔄 Reconstructing 2-Month Academic Dataset (500 Students, 30 Teachers, 350 Parents, 18 Classes, Everyday Attendance Aug-Sep 2026)...');

    // Safe cascading clear: preserve real super_admin users
    const clearSql = `
      TRUNCATE TABLE admission_application_logs, admission_applications, timetables, messages, conversations, homework_submissions, homeworks,
      results, payments, fees, attendance, class_attendance_submissions,
      student_enrollments, class_subjects, parent_students, parent_invitations,
      teacher_invitations, students, teachers, parents, classes, departments, subjects,
      academic_terms, academic_sessions, announcements, audit_logs, password_resets CASCADE;
      DELETE FROM users WHERE role != 'super_admin';
    `;
    if (global._pgliteInstance) {
      await global._pgliteInstance.exec(clearSql);
    } else if (typeof (pool as any).exec === 'function') {
      await (pool as any).exec(clearSql);
    } else {
      await pool.query(clearSql);
    }

    // Pre-hash default passwords for demo personas
    const adminPassHash = await hashPassword('admin123');
    const teacherPassHash = await hashPassword('teacher123');
    const parentPassHash = await hashPassword('parent123');
    const studentPassHash = await hashPassword('student123');

    // 0. Ensure Demo Super Admin user is seeded
    const [existingDemoAdminInSeed] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'admin@school.com'))
      .limit(1);

    if (!existingDemoAdminInSeed) {
      await db.insert(users).values({
        uid: 'admin-demo-superadmin',
        email: 'admin@school.com',
        passwordHash: adminPassHash,
        fullName: 'Demo Super Administrator',
        role: 'super_admin',
        status: 'active',
        phone: '+234 800 000 0001',
      });
      console.log('✓ Demo Super Admin seeded: admin@school.com / admin123');
    } else {
      await db
        .update(users)
        .set({ passwordHash: adminPassHash, status: 'active', role: 'super_admin', fullName: 'Demo Super Administrator' })
        .where(eq(users.id, existingDemoAdminInSeed.id));
    }

    // 1. Academic Sessions & Terms (Current 2-month stretch in 2026/2027)
    const [session2025] = await db
      .insert(academicSessions)
      .values({
        name: '2025/2026',
        startDate: '2025-09-08',
        endDate: '2026-07-17',
        isCurrent: false,
        status: 'completed',
        description: '2025/2026 Academic Session (Completed)',
      })
      .returning();

    const [session2026] = await db
      .insert(academicSessions)
      .values({
        name: '2026/2027',
        startDate: '2026-08-01',
        endDate: '2027-07-16',
        isCurrent: true,
        status: 'active',
        description: '2026/2027 Academic Session (Current)',
      })
      .returning();

    const [term2025T3] = await db
      .insert(academicTerms)
      .values({
        sessionId: session2025.id,
        sessionName: '2025/2026',
        termName: 'Third Term',
        termNumber: 3,
        isCurrent: false,
        startDate: '2026-04-27',
        endDate: '2026-07-17',
      })
      .returning();

    const [term2026T1] = await db
      .insert(academicTerms)
      .values({
        sessionId: session2026.id,
        sessionName: '2026/2027',
        termName: 'First Term',
        termNumber: 1,
        isCurrent: true,
        startDate: '2026-08-01',
        endDate: '2026-12-18',
      })
      .returning();

    // 2. Core Academic Subjects
    const subjectsData = [
      { code: 'MTH-101', name: 'General Mathematics', category: 'Sciences' },
      { code: 'ENG-101', name: 'English Language & Literature', category: 'Arts & Humanities' },
      { code: 'SCI-101', name: 'Basic Science & Technology', category: 'Sciences' },
      { code: 'CSC-101', name: 'Computer Studies & ICT', category: 'Sciences' },
      { code: 'BIO-201', name: 'Biology', category: 'Sciences' },
      { code: 'PHY-201', name: 'Physics', category: 'Sciences' },
      { code: 'CHE-201', name: 'Chemistry', category: 'Sciences' },
      { code: 'BUS-101', name: 'Business Studies & Commerce', category: 'Commercial' },
      { code: 'ECO-201', name: 'Economics', category: 'Commercial' },
      { code: 'GEO-201', name: 'Geography', category: 'Sciences' },
      { code: 'GOV-201', name: 'Government & Civic Education', category: 'Arts & Humanities' },
      { code: 'AGR-101', name: 'Agricultural Science', category: 'Sciences' },
      { code: 'FRE-101', name: 'French Language', category: 'Languages' },
      { code: 'ART-101', name: 'Fine Arts & Design', category: 'Creative Arts' },
    ];
    const createdSubjects = await db.insert(subjects).values(subjectsData).returning();

    // 3. Departments / Programmes
    const departmentsData = [
      { code: 'SCI', name: 'Science & Technology', description: 'Natural Sciences, Mathematics, Computing, and Applied Engineering' },
      { code: 'ART', name: 'Arts & Humanities', description: 'Languages, Literature, History, and Creative Fine Arts' },
      { code: 'COMM', name: 'Commercial & Social Sciences', description: 'Business Studies, Accounting, Economics, and Social Sciences' },
    ];
    const createdDepartments = await db.insert(departments).values(departmentsData).returning();

    // 4. 30 Teachers
    const teacherProfiles = [
      { name: 'Babatunde Adewale', spec: 'Mathematics & Further Mathematics', qual: 'B.Sc (Ed), M.Ed Mathematics', email: 'teacher.adewale@school.com' },
      { name: 'Chioma Okonkwo', spec: 'English Language & Literature', qual: 'B.A (Ed) English, M.A Literature', email: 'teacher.chioma@school.com' },
      { name: 'Dr. Emmanuel Adeyemi', spec: 'Physics & Applied Sciences', qual: 'B.Sc Physics, Ph.D Science Education', email: 'teacher.adeyemi@school.com' },
      { name: 'Fatima Bello', spec: 'Chemistry & Biochemistry', qual: 'B.Sc Biochemistry, PGDE', email: 'teacher.fatima@school.com' },
      { name: 'Samuel Kalu', spec: 'Computer Studies & Robotics', qual: 'B.Tech Computer Science, CCNA', email: 'teacher.kalu@school.com' },
      { name: 'Amina Yusuf', spec: 'Biology & Environmental Science', qual: 'B.Sc Biology, M.Sc Microbiology', email: 'teacher.amina@school.com' },
      { name: 'Olumide Adeleke', spec: 'Economics & Financial Accounting', qual: 'B.Sc Economics, ICAN', email: 'teacher.adeleke@school.com' },
      { name: 'Ngozi Nwachukwu', spec: 'Literature in English & Drama', qual: 'B.A Literature, M.A Creative Arts', email: 'teacher.nwachukwu@school.com' },
      { name: 'Ibrahim Dahiru', spec: 'Geography & Regional Planning', qual: 'B.Sc Geography, PGDE', email: 'teacher.dahiru@school.com' },
      { name: 'Folake Awolowo', spec: 'Government & Civic Education', qual: 'B.Sc Political Science, PGDE', email: 'teacher.awolowo@school.com' },
      { name: 'Chinedu Eze', spec: 'Agricultural Science & Agribusiness', qual: 'B.Agric, M.Sc Crop Science', email: 'teacher.eze@school.com' },
      { name: 'Blessing Danjuma', spec: 'French Language & Linguistics', qual: 'B.A French, DELF B2, PGDE', email: 'teacher.danjuma@school.com' },
      { name: 'Mustapha Aliyu', spec: 'Fine Arts & Graphic Design', qual: 'B.A Fine Arts, MFA', email: 'teacher.aliyu@school.com' },
      { name: 'Temitope Ojo', spec: 'Technical Drawing & Basic Technology', qual: 'B.Eng Mechanical, PGDE', email: 'teacher.ojo@school.com' },
      { name: 'Halima Sani', spec: 'Commerce & Business Management', qual: 'B.Sc Business Admin, PGDE', email: 'teacher.sani@school.com' },
      { name: 'Kayode Ogundipe', spec: 'Basic Science & Health Education', qual: 'B.Sc (Ed) Integrated Science', email: 'teacher.ogundipe@school.com' },
      { name: 'Amara Nwosu', spec: 'Music & Performing Arts', qual: 'B.A Music, PGDE', email: 'teacher.nwosu@school.com' },
      { name: 'Usman Garba', spec: 'Physical & Health Education', qual: 'B.Sc PHE, Certified Athletics Coach', email: 'teacher.garba@school.com' },
      { name: 'Yetunde Balogun', spec: 'Social Studies & Cultural Heritage', qual: 'B.Ed Social Studies, M.Ed', email: 'teacher.balogun@school.com' },
      { name: 'Farouk Ibrahim', spec: 'Further Mathematics & Statistics', qual: 'B.Sc Statistics, M.Sc Applied Maths', email: 'teacher.ibrahim@school.com' },
      { name: 'Emeka Okafor', spec: 'History & International Studies', qual: 'B.A History, M.A Diplomatic History', email: 'teacher.okafor@school.com' },
      { name: 'Zainab Lawal', spec: 'Home Economics & Food Nutrition', qual: 'B.Sc Food Science, PGDE', email: 'teacher.lawal@school.com' },
      { name: 'Kofi Mensah', spec: 'Integrated Science & Physics', qual: 'B.Sc Physics Education', email: 'teacher.mensah@school.com' },
      { name: 'Aisha Umar', spec: 'Islamic Religious Studies & Arabic', qual: 'B.A Islamic Studies, PGDE', email: 'teacher.umar@school.com' },
      { name: 'David Johnson', spec: 'Christian Religious Studies & Ethics', qual: 'B.A Religious Studies, M.Div', email: 'teacher.johnson@school.com' },
      { name: 'Funmilayo Bamidele', spec: 'Business Studies & Office Practice', qual: 'B.Sc Secretarial Admin, PGDE', email: 'teacher.bamidele@school.com' },
      { name: 'Bashir Yakubu', spec: 'Data Processing & Web Technology', qual: 'B.Sc ICT, Certified Python Developer', email: 'teacher.yakubu@school.com' },
      { name: 'Chinwe Okoro', spec: 'Guidance & Counseling Psychology', qual: 'B.Ed Guidance & Counseling, M.Ed', email: 'teacher.okoro@school.com' },
      { name: 'Segun Afolabi', spec: 'Applied Chemistry & Lab Techniques', qual: 'B.Sc Pure & Industrial Chemistry', email: 'teacher.afolabi@school.com' },
      { name: 'Maryam Idris', spec: 'Creative Arts & Textile Craft', qual: 'B.A Industrial Design, PGDE', email: 'teacher.idris@school.com' },
    ];

    const teacherUsersData = teacherProfiles.map((tp, i) => ({
      uid: `seed-tch-${String(i + 1).padStart(2, '0')}`,
      email: tp.email,
      passwordHash: teacherPassHash,
      fullName: tp.name,
      role: 'teacher',
      status: 'active',
      phone: `+234 80${(2 + (i % 8))} ${String(100 + i * 31).padStart(3, '0')} ${String(1000 + i * 47).slice(0, 4)}`,
    }));

    const teacherUserRecords = await db.insert(users).values(teacherUsersData).returning();

    const teacherRecordsData = teacherProfiles.map((tp, i) => ({
      userId: teacherUserRecords[i].id,
      employeeId: `TCH-2026-${String(i + 1).padStart(3, '0')}`,
      specialization: tp.spec,
      qualification: tp.qual,
      hireDate: '2026-08-01',
      address: `${10 + i * 2} ${LAGOS_AREAS[i % LAGOS_AREAS.length]}, Lagos`,
      status: 'active',
    }));

    const teacherRecords = await db.insert(teachers).values(teacherRecordsData).returning();

    // 5. 18 Distinct Classes
    const classConfigs = [
      { name: 'JSS 1 Gold', section: 'A', gradeLevel: '7', cap: 35, tIdx: 0, rIdx: 0 },
      { name: 'JSS 1 Silver', section: 'B', gradeLevel: '7', cap: 35, tIdx: 1, rIdx: 1 },
      { name: 'JSS 1 Bronze', section: 'C', gradeLevel: '7', cap: 35, tIdx: 2, rIdx: 2 },
      { name: 'JSS 2 Gold', section: 'A', gradeLevel: '8', cap: 35, tIdx: 3, rIdx: 3 },
      { name: 'JSS 2 Silver', section: 'B', gradeLevel: '8', cap: 35, tIdx: 4, rIdx: 4 },
      { name: 'JSS 2 Bronze', section: 'C', gradeLevel: '8', cap: 35, tIdx: 5, rIdx: 5 },
      { name: 'JSS 3 Gold', section: 'A', gradeLevel: '9', cap: 35, tIdx: 6, rIdx: 6 },
      { name: 'JSS 3 Silver', section: 'B', gradeLevel: '9', cap: 35, tIdx: 7, rIdx: 7 },
      { name: 'JSS 3 Bronze', section: 'C', gradeLevel: '9', cap: 35, tIdx: 8, rIdx: 8 },
      { name: 'SS 1 Diamond', section: 'Science', gradeLevel: '10', cap: 35, tIdx: 9, rIdx: 9 },
      { name: 'SS 1 Ruby', section: 'Arts', gradeLevel: '10', cap: 35, tIdx: 10, rIdx: 10 },
      { name: 'SS 1 Sapphire', section: 'Commercial', gradeLevel: '10', cap: 35, tIdx: 11, rIdx: 11 },
      { name: 'SS 2 Emerald', section: 'Science', gradeLevel: '11', cap: 35, tIdx: 12, rIdx: 12 },
      { name: 'SS 2 Pearl', section: 'Arts', gradeLevel: '11', cap: 35, tIdx: 13, rIdx: 13 },
      { name: 'SS 2 Opal', section: 'Commercial', gradeLevel: '11', cap: 35, tIdx: 14, rIdx: 14 },
      { name: 'SS 3 Platinum', section: 'Science', gradeLevel: '12', cap: 35, tIdx: 15, rIdx: 15 },
      { name: 'SS 3 Crystal', section: 'Arts', gradeLevel: '12', cap: 35, tIdx: 16, rIdx: 16 },
      { name: 'SS 3 Onyx', section: 'Commercial', gradeLevel: '12', cap: 35, tIdx: 17, rIdx: 17 },
    ];

    const classInserts = classConfigs.map((cc) => {
      let deptId: number | null = null;
      if (cc.section === 'Science') deptId = createdDepartments[0].id;
      else if (cc.section === 'Arts') deptId = createdDepartments[1].id;
      else if (cc.section === 'Commercial') deptId = createdDepartments[2].id;

      return {
        name: cc.name,
        section: cc.section,
        gradeLevel: cc.gradeLevel,
        sessionId: session2026.id,
        departmentId: deptId,
        capacity: cc.cap,
        classTeacherId: teacherRecords[cc.tIdx].id,
        attendanceRecorderId: teacherRecords[cc.rIdx].id,
        status: 'active',
      };
    });

    const allClasses = await db.insert(classes).values(classInserts).returning();

    // 6. Class Subject Allocations
    const classSubjectInserts: any[] = [];
    allClasses.forEach((cls, cIdx) => {
      // Allocate 4 core subjects per class
      for (let sIdx = 0; sIdx < 4; sIdx++) {
        const sub = createdSubjects[(cIdx * 2 + sIdx) % createdSubjects.length];
        const tch = teacherRecords[(cIdx + sIdx) % teacherRecords.length];
        classSubjectInserts.push({
          classId: cls.id,
          subjectId: sub.id,
          teacherId: tch.id,
          periodsPerWeek: 4,
        });
      }
    });
    await db.insert(classSubjects).values(classSubjectInserts);

    // 7. 350 Parents
    const parentUsersData: any[] = [];
    for (let i = 0; i < 350; i++) {
      const isFemale = i % 2 === 1;
      const firstName = isFemale
        ? FIRST_NAMES_FEMALE[i % FIRST_NAMES_FEMALE.length]
        : FIRST_NAMES_MALE[i % FIRST_NAMES_MALE.length];
      const lastName = LAST_NAMES[i % LAST_NAMES.length];
      const title = isFemale ? (i % 4 === 0 ? 'Dr. Mrs.' : 'Mrs.') : (i % 5 === 0 ? 'Chief' : i % 7 === 0 ? 'Alhaji' : i % 9 === 0 ? 'Engr.' : 'Mr.');
      const fullName = `${title} ${firstName} ${lastName}`;
      const email = i < 5
        ? ['parent.ibrahim@school.com', 'parent.beatrice@school.com', 'parent.usman@school.com', 'parent.balogun@school.com', 'parent.anthony@school.com'][i]
        : `parent${i + 1}.${firstName.toLowerCase()}.${lastName.toLowerCase()}@school.com`;
      const phone = `+234 80${(3 + (i % 7))} ${String(200 + (i * 17) % 700).padStart(3, '0')} ${String(1000 + (i * 29) % 9000)}`;

      parentUsersData.push({
        uid: `seed-par-${String(i + 1).padStart(3, '0')}`,
        email,
        passwordHash: parentPassHash,
        fullName,
        role: 'parent',
        status: 'active',
        phone,
      });
    }

    const parentUserRecords = await db.insert(users).values(parentUsersData).returning();

    const parentRecordsData = parentUserRecords.map((pu: any, i: number) => ({
      userId: pu.id,
      parentId: `PAR-2026-${String(i + 1).padStart(4, '0')}`,
    }));
    await db.insert(parents).values(parentRecordsData);

    // 8. 500 Students
    const studentUsersData: any[] = [];
    for (let i = 0; i < 500; i++) {
      const isFemale = i % 2 === 1;
      const firstName = isFemale
        ? FIRST_NAMES_FEMALE[(i * 3 + 1) % FIRST_NAMES_FEMALE.length]
        : FIRST_NAMES_MALE[(i * 3 + 1) % FIRST_NAMES_MALE.length];
      const lastName = LAST_NAMES[(i * 2 + 5) % LAST_NAMES.length];
      const fullName = `${firstName} ${lastName}`;
      const email = i < 10
        ? [
            'student.chinedu@school.com', 'student.zainab@school.com', 'student.emeka@school.com',
            'student.aisha@school.com', 'student.david@school.com', 'student.ngozi@school.com',
            'student.femi@school.com', 'student.maryam@school.com', 'student.tunde@school.com',
            'student.grace@school.com'
          ][i]
        : `student${i + 1}.${firstName.toLowerCase()}.${lastName.toLowerCase()}@school.com`;

      studentUsersData.push({
        uid: `seed-stu-${String(i + 1).padStart(4, '0')}`,
        email,
        passwordHash: studentPassHash,
        fullName,
        role: 'student',
        status: 'active',
      });
    }

    const studentUserRecords = await db.insert(users).values(studentUsersData).returning();

    const studentRecordsData: any[] = [];
    const studentEnrollmentsToInsert: any[] = [];
    const parentStudentLinksToInsert: any[] = [];

    for (let i = 0; i < 500; i++) {
      const su = studentUserRecords[i];
      const isFemale = i % 2 === 1;
      const firstName = isFemale
        ? FIRST_NAMES_FEMALE[(i * 3 + 1) % FIRST_NAMES_FEMALE.length]
        : FIRST_NAMES_MALE[(i * 3 + 1) % FIRST_NAMES_MALE.length];
      const lastName = LAST_NAMES[(i * 2 + 5) % LAST_NAMES.length];
      const studentCode = `STU-2026-${String(i + 1).padStart(4, '0')}`;

      const classIndex = i % allClasses.length;
      const targetClass = allClasses[classIndex];
      const gradeNum = parseInt(targetClass.gradeLevel || '7', 10);
      const birthYear = 2026 - (gradeNum + 5);
      const birthMonth = String((i % 12) + 1).padStart(2, '0');
      const birthDay = String((i % 28) + 1).padStart(2, '0');
      const dateOfBirth = `${birthYear}-${birthMonth}-${birthDay}`;

      const parentIndex = i < 300 ? Math.floor(i / 2) : 150 + (i - 300);
      const parentUser = parentUserRecords[parentIndex % parentUserRecords.length];
      const address = `${5 + (i % 60)} ${LAGOS_AREAS[i % LAGOS_AREAS.length]}, Lagos`;
      const emergencyContact = `${parentUser.fullName} (${parentUser.phone})`;

      studentRecordsData.push({
        userId: su.id,
        studentId: studentCode,
        firstName,
        lastName,
        dateOfBirth,
        gender: isFemale ? 'Female' : 'Male',
        classId: targetClass.id,
        currentSessionId: session2026.id,
        admissionDate: '2026-08-01',
        address,
        emergencyContact,
        status: 'active',
      });
    }

    const studentRecords = await db.insert(students).values(studentRecordsData).returning();

    for (let i = 0; i < 500; i++) {
      const sr = studentRecords[i];
      const isFemale = i % 2 === 1;
      const targetClass = allClasses[i % allClasses.length];
      const parentIndex = i < 300 ? Math.floor(i / 2) : 150 + (i - 300);
      const parentUser = parentUserRecords[parentIndex % parentUserRecords.length];

      // Parent student link
      parentStudentLinksToInsert.push({
        parentUserId: parentUser.id,
        studentId: sr.id,
        relationship: isFemale ? (i % 3 === 0 ? 'Mother' : 'Guardian') : (i % 3 === 0 ? 'Father' : 'Guardian'),
        isPrimary: true,
      });

      // Enrollment record for 2026/2027 First Term
      const avg = 72 + ((i * 7) % 25) + 0.5;
      const attRate = 93 + ((i * 3) % 7);
      studentEnrollmentsToInsert.push({
        studentId: sr.id,
        classId: targetClass.id,
        sessionId: session2026.id,
        termId: term2026T1.id,
        enrollmentDate: '2026-08-01',
        status: 'enrolled',
        academicAverage: avg,
        attendanceRate: attRate,
        remarks: 'Active student enrollment for 2026/2027 session.',
      });
    }

    await batchInsert(parentStudents, parentStudentLinksToInsert);
    await batchInsert(studentEnrollments, studentEnrollmentsToInsert);

    // 9. Everyday Attendance for the 2-Month Stretch (Aug 3, 2026 to Sep 25, 2026 = 40 school weekdays)
    const schoolDays = getWeekdayDates('2026-08-03', '2026-09-25');
    console.log(`  Generating everyday attendance across ${schoolDays.length} school days for 500 students...`);

    const submissionsToInsert: any[] = [];
    allClasses.forEach((cls) => {
      schoolDays.forEach((dateStr) => {
        submissionsToInsert.push({
          classId: cls.id,
          date: dateStr,
          sessionId: session2026.id,
          termId: term2026T1.id,
          status: 'submitted',
          submittedBy: teacherUserRecords[0].id,
          submittedAt: new Date(`${dateStr}T08:35:00Z`),
          notes: 'Daily roll-call verified and submitted.',
        });
      });
    });
    await batchInsert(classAttendanceSubmissions, submissionsToInsert);

    const attendanceRecordsToInsert: any[] = [];
    const LATE_REASONS = [
      'Heavy vehicular traffic on expressway',
      'School bus mechanical delay',
      'Morning torrential rainfall delay',
      'Bridge construction traffic congestion',
      'Family transit logistics delay',
    ];

    for (const dateStr of schoolDays) {
      for (let sIdx = 0; sIdx < studentRecords.length; sIdx++) {
        const st = studentRecords[sIdx];
        // Deterministic pseudo-randomness based on student ID and date
        const hash = (sIdx * 37 + dateStr.charCodeAt(8) * 13 + dateStr.charCodeAt(9) * 7);
        const mod = hash % 100;

        let attStatus = 'Present';
        let isLate = false;
        let arrival = '07:42 AM';
        let lateReason: string | null = null;
        let lateApproved = false;
        let remarks = 'Present and punctual';

        if (mod < 92) {
          // 92% Present on-time
          attStatus = 'Present';
          isLate = false;
          const mins = 30 + (hash % 15);
          arrival = `07:${String(mins).padStart(2, '0')} AM`;
          remarks = 'Present and punctual';
        } else if (mod < 96) {
          // 4% Late
          attStatus = 'Present';
          isLate = true;
          const mins = 31 + (hash % 25);
          arrival = `08:${String(mins).padStart(2, '0')} AM`;
          lateReason = LATE_REASONS[hash % LATE_REASONS.length];
          lateApproved = true;
          remarks = 'Late arrival documented';
        } else if (mod < 98.5) {
          // 2.5% Absent
          attStatus = 'Absent';
          isLate = false;
          arrival = '';
          remarks = 'Parent notified school of absence';
        } else {
          // 1.5% Excused
          attStatus = 'Excused';
          isLate = false;
          arrival = '';
          remarks = 'Excused: Medical leave / Official school representation';
        }

        attendanceRecordsToInsert.push({
          studentId: st.id,
          classId: st.classId,
          sessionId: session2026.id,
          termId: term2026T1.id,
          date: dateStr,
          status: attStatus,
          isLate,
          arrivalTime: arrival,
          lateReason,
          lateApproved,
          remarks,
          recordedBy: teacherUserRecords[0].id,
        });
      }
    }

    await batchInsert(attendance, attendanceRecordsToInsert);
    console.log(`  Inserted ${attendanceRecordsToInsert.length} daily attendance records successfully.`);

    // 10. Fees & Invoices for All 500 Students
    const feesToInsert: any[] = [];
    const paymentsToInsert: any[] = [];

    for (let i = 0; i < studentRecords.length; i++) {
      const st = studentRecords[i];
      const invNumber = `INV-2026-${String(i + 1).padStart(4, '0')}`;
      const amount = (160000 + (i % 6) * 5000).toFixed(2);

      let paidAmt = '0.00';
      let balAmt = amount;
      let statusStr = 'unpaid';

      if (i % 4 === 0 || i % 4 === 1) {
        // 50% paid in full
        paidAmt = amount;
        balAmt = '0.00';
        statusStr = 'paid';
      } else if (i % 4 === 2) {
        // 25% partially paid
        paidAmt = (parseFloat(amount) / 2).toFixed(2);
        balAmt = (parseFloat(amount) / 2).toFixed(2);
        statusStr = 'partially_paid';
      }

      feesToInsert.push({
        invoiceNumber: invNumber,
        studentId: st.id,
        sessionId: session2026.id,
        termId: term2026T1.id,
        feeTitle: '2026/2027 First Term Comprehensive Tuition & Academic Pack',
        feeCategory: 'tuition',
        amount,
        amountPaid: paidAmt,
        outstandingBalance: balAmt,
        paymentStatus: statusStr,
        dueDate: '2026-09-30',
        issuedDate: '2026-08-01',
      });
    }

    const insertedFees = await db.insert(fees).values(feesToInsert).returning();

    for (let i = 0; i < insertedFees.length; i++) {
      const f = insertedFees[i];
      if (parseFloat(f.amountPaid) > 0) {
        paymentsToInsert.push({
          feeId: f.id,
          studentId: f.studentId,
          amount: f.amountPaid,
          paymentDate: '2026-08-10',
          paymentMethod: 'Bank Transfer',
          paymentReference: `TX-2026-REF-${f.studentId}-01`,
          receiptNumber: `REC-2026-${String(i + 1).padStart(4, '0')}`,
          verifiedBy: teacherUserRecords[0]?.id || null,
          status: 'completed',
          notes: 'Tuition installment verified via electronic settlement.',
        });
      }
    }
    await batchInsert(payments, paymentsToInsert);

    // 11. Results & Coursework
    const resultsToInsert: any[] = [];
    const homeworksToInsert: any[] = [];
    const hwSubmissionsToInsert: any[] = [];

    // Create 4 homework assignments
    const homeworkDefs = [
      { title: 'Algebraic Equations & Quadratic Graphs', desc: 'Solve exercises 4.1 to 4.5 in textbook.', subIdx: 0, tIdx: 0, date: '2026-09-18' },
      { title: 'Essay: Critical Analysis of Character Development in Nigerian Prose', desc: 'Compose a 500-word critical evaluation.', subIdx: 1, tIdx: 1, date: '2026-09-20' },
      { title: 'Physics Lab: Ohm’s Law & Resistance Practical', desc: 'Submit table of experimental values and error analysis.', subIdx: 5, tIdx: 2, date: '2026-09-22' },
      { title: 'Python Control Flow & Functions Practical', desc: 'Write a program demonstrating sorting algorithms.', subIdx: 3, tIdx: 4, date: '2026-09-24' },
    ];

    for (let hIdx = 0; hIdx < homeworkDefs.length; hIdx++) {
      const hd = homeworkDefs[hIdx];
      const targetClass = allClasses[hIdx % allClasses.length];
      const [hw] = await db
        .insert(homeworks)
        .values({
          title: hd.title,
          description: hd.desc,
          classId: targetClass.id,
          subjectId: createdSubjects[hd.subIdx].id,
          teacherId: teacherRecords[hd.tIdx].id,
          sessionId: session2026.id,
          termId: term2026T1.id,
          dueDate: hd.date,
          maxMarks: 100,
          status: 'active',
        })
        .returning();

      const classStudents = studentRecords.filter((s) => s.classId === targetClass.id);
      for (const cs of classStudents) {
        hwSubmissionsToInsert.push({
          homeworkId: hw.id,
          studentId: cs.id,
          submissionText: `Comprehensive assignment submission by ${cs.firstName} ${cs.lastName}.`,
          status: 'graded',
          score: 80 + (cs.id % 19),
          feedback: 'Well articulated work with clear step-by-step methodologies.',
          gradedBy: teacherUserRecords[hd.tIdx].id,
          gradedAt: new Date('2026-09-23T12:00:00Z'),
        });
      }
    }
    await batchInsert(homeworkSubmissions, hwSubmissionsToInsert);

    // Results across core subjects for every student
    for (let i = 0; i < studentRecords.length; i++) {
      const st = studentRecords[i];
      const testScore = 30 + (i % 10);
      const examScore = 45 + (i % 15);
      const totalScore = testScore + examScore;
      const grade = totalScore >= 75 ? 'A1' : totalScore >= 70 ? 'B2' : totalScore >= 65 ? 'B3' : 'C4';

      resultsToInsert.push({
        studentId: st.id,
        subjectId: createdSubjects[0].id, // Mathematics
        classId: st.classId,
        termId: term2026T1.id,
        sessionId: session2026.id,
        assessmentType: 'terminal',
        testScore,
        examScore,
        totalScore,
        maxMarks: 100,
        grade,
        remarks: 'Demonstrates exemplary understanding of curriculum objectives.',
        enteredBy: teacherUserRecords[0].id,
        status: 'published',
      });

      resultsToInsert.push({
        studentId: st.id,
        subjectId: createdSubjects[1].id, // English
        classId: st.classId,
        termId: term2026T1.id,
        sessionId: session2026.id,
        assessmentType: 'terminal',
        testScore: 32 + (i % 8),
        examScore: 48 + (i % 12),
        totalScore: 80 + (i % 15),
        maxMarks: 100,
        grade: 'A1',
        remarks: 'Fluent expressive essay composition and strong grammar mastery.',
        enteredBy: teacherUserRecords[1].id,
        status: 'published',
      });
    }
    await batchInsert(results, resultsToInsert);

    // 12. Sample Parent Communications
    for (let i = 0; i < 5; i++) {
      const st = studentRecords[i];
      const tu = teacherUserRecords[i % teacherUserRecords.length];
      const pu = parentUserRecords[i % parentUserRecords.length];

      const [conv] = await db
        .insert(conversations)
        .values({
          studentId: st.id,
          teacherUserId: tu.id,
          parentUserId: pu.id,
          subject: `${st.firstName} Academic Progress & Attendance Review`,
          category: 'academic',
          status: 'active',
          lastMessageAt: new Date('2026-09-24T14:30:00Z'),
          createdAt: new Date('2026-09-10T09:00:00Z'),
        })
        .returning();

      await db.insert(messages).values([
        {
          conversationId: conv.id,
          senderUserId: tu.id,
          content: `Good day! We are monitoring ${st.firstName}'s attendance and coursework engagement. Punctuality and classroom contributions have been excellent.`,
          isRead: true,
          readAt: new Date('2026-09-10T11:00:00Z'),
          createdAt: new Date('2026-09-10T09:00:00Z'),
        },
        {
          conversationId: conv.id,
          senderUserId: pu.id,
          content: `Thank you for the update. We ensure daily early departure from home to maintain full attendance.`,
          isRead: true,
          readAt: new Date('2026-09-10T14:00:00Z'),
          createdAt: new Date('2026-09-10T13:30:00Z'),
        },
      ]);
    }

    // 13. Institutional Announcements
    const announcementAuthorId = teacherUserRecords[0]?.id;
    await db.insert(announcements).values([
      {
        title: 'Welcome to 2026/2027 Academic Session - First Term',
        content: 'Welcome back faculty, students, and parents. Daily school activities commence promptly at 7:30 AM. Attendance registers close at 8:30 AM.',
        targetRole: 'all',
        priority: 'normal',
        authorId: announcementAuthorId,
        createdAt: new Date('2026-08-01T07:00:00Z'),
      },
      {
        title: 'Continuous Assessment Tests (CA) Timetable Announcement',
        content: 'Midterm continuous assessments for all junior and senior secondary divisions will take place per subject schedules.',
        targetRole: 'students',
        priority: 'urgent',
        authorId: announcementAuthorId,
        createdAt: new Date('2026-09-15T08:00:00Z'),
      },
      {
        title: 'Annual Inter-House Sports & STEM Exhibition Notice',
        content: 'The Annual Inter-House Athletics Championship and Science & Technology Exhibition will be hosted at the main sports complex in October.',
        targetRole: 'all',
        priority: 'high',
        authorId: announcementAuthorId,
        createdAt: new Date('2026-09-20T09:00:00Z'),
      },
    ]);

    // 14. Class Timetables Seeding
    console.log('🌱 Seeding official class timetables for all active classes...');
    const existingPeriods = await db.select().from(timetablePeriods);
    if (existingPeriods.length === 0) {
      await db.insert(timetablePeriods).values([
        { periodNumber: 1, label: 'Period 1', startTime: '08:00', endTime: '08:45', type: 'lesson', isTeaching: true, sortOrder: 1, days: 'Monday,Tuesday,Wednesday,Thursday,Friday' },
        { periodNumber: 2, label: 'Period 2', startTime: '08:45', endTime: '09:30', type: 'lesson', isTeaching: true, sortOrder: 2, days: 'Monday,Tuesday,Wednesday,Thursday,Friday' },
        { periodNumber: 3, label: 'Period 3', startTime: '09:30', endTime: '10:15', type: 'lesson', isTeaching: true, sortOrder: 3, days: 'Monday,Tuesday,Wednesday,Thursday,Friday' },
        { periodNumber: 0, label: 'Morning Break', startTime: '10:15', endTime: '10:45', type: 'break', isTeaching: false, sortOrder: 4, days: 'Monday,Tuesday,Wednesday,Thursday,Friday' },
        { periodNumber: 4, label: 'Period 4', startTime: '10:45', endTime: '11:30', type: 'lesson', isTeaching: true, sortOrder: 5, days: 'Monday,Tuesday,Wednesday,Thursday,Friday' },
        { periodNumber: 5, label: 'Period 5', startTime: '11:30', endTime: '12:15', type: 'lesson', isTeaching: true, sortOrder: 6, days: 'Monday,Tuesday,Wednesday,Thursday,Friday' },
        { periodNumber: 6, label: 'Period 6', startTime: '12:15', endTime: '13:00', type: 'lesson', isTeaching: true, sortOrder: 7, days: 'Monday,Tuesday,Wednesday,Thursday,Friday' },
        { periodNumber: 99, label: 'Lunch Interval', startTime: '13:00', endTime: '13:45', type: 'lunch', isTeaching: false, sortOrder: 8, days: 'Monday,Tuesday,Wednesday,Thursday,Friday' },
        { periodNumber: 7, label: 'Period 7', startTime: '13:45', endTime: '14:30', type: 'lesson', isTeaching: true, sortOrder: 9, days: 'Monday,Tuesday,Wednesday,Thursday,Friday' },
        { periodNumber: 8, label: 'Period 8', startTime: '14:30', endTime: '15:15', type: 'lesson', isTeaching: true, sortOrder: 10, days: 'Monday,Tuesday,Wednesday,Thursday,Friday' },
      ]);
    }

    const DAYS_LIST = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const PERIODS_LIST = [
      { num: 1, start: '08:00', end: '08:45' },
      { num: 2, start: '08:45', end: '09:30' },
      { num: 3, start: '09:30', end: '10:15' },
      { num: 4, start: '10:45', end: '11:30' },
      { num: 5, start: '11:30', end: '12:15' },
      { num: 6, start: '12:15', end: '13:00' },
      { num: 7, start: '13:45', end: '14:30' },
      { num: 8, start: '14:30', end: '15:15' },
    ];

    const timetableSlots: any[] = [];
    for (const cls of allClasses) {
      // Fetch subjects assigned to this class
      const classSubjs = await db
        .select({ subjectId: classSubjects.subjectId, teacherId: classSubjects.teacherId })
        .from(classSubjects)
        .where(eq(classSubjects.classId, cls.id));

      const pool = classSubjs.length > 0
        ? classSubjs
        : createdSubjects.map((s, idx) => ({
            subjectId: s.id,
            teacherId: teacherRecords[idx % teacherRecords.length].id,
          }));

      DAYS_LIST.forEach((day, dayIndex) => {
        PERIODS_LIST.forEach((period, pIndex) => {
          const idx = (dayIndex * 8 + pIndex + cls.id) % pool.length;
          const item = pool[idx];
          timetableSlots.push({
            classId: cls.id,
            subjectId: item.subjectId,
            teacherId: item.teacherId || teacherRecords[idx % teacherRecords.length].id,
            dayOfWeek: day,
            startTime: period.start,
            endTime: period.end,
            periodNumber: period.num,
            room: `Room ${100 + cls.id}`,
            sessionId: session2026.id,
            termId: term2026T1.id,
          });
        });
      });
    }

    if (timetableSlots.length > 0) {
      await batchInsert(timetables, timetableSlots, 500);
      console.log(`✅ Class timetables seeded successfully (${timetableSlots.length} slots across ${allClasses.length} classes).`);
    }

    // 10. Sample Admission Applications across diverse workflows
    const sampleApps = [
      {
        applicationNumber: 'APP-2026-89241',
        accessKey: 'APP-KEY-A1B2C3D4E5F6789012345678',
        firstName: 'Tomiwa',
        middleName: 'Ayodeji',
        lastName: 'Adeleke',
        dateOfBirth: '2011-04-15',
        gender: 'Male',
        email: 'tomiwa.applicant@example.com',
        phone: '+234 803 111 2233',
        address: '14 Admiralty Way, Lekki Phase 1, Lagos',
        sessionId: session2026.id,
        classId: allClasses[0].id, // JSS 1 Gold
        departmentId: createdDepartments[0].id,
        guardianName: 'Chief Ayodeji Adeleke',
        guardianPhone: '+234 802 334 5566',
        guardianEmail: 'ayodeji.adeleke@example.com',
        guardianRelationship: 'Father',
        applicantMessage: 'Passionate about science and mathematics competitions.',
        status: 'pending',
      },
      {
        applicationNumber: 'APP-2026-45129',
        accessKey: 'APP-KEY-B2C3D4E5F6A1789012345678',
        firstName: 'Zainab',
        middleName: 'Oluwakemi',
        lastName: 'Balogun',
        dateOfBirth: '2010-09-22',
        gender: 'Female',
        email: 'zainab.balogun@example.com',
        phone: '+234 805 222 3344',
        address: '8 Glover Road, Ikoyi, Lagos',
        sessionId: session2026.id,
        classId: allClasses[3].id, // JSS 2 Gold
        departmentId: createdDepartments[0].id,
        guardianName: 'Dr. (Mrs) Fatima Balogun',
        guardianPhone: '+234 803 556 7788',
        guardianEmail: 'fatima.balogun@example.com',
        guardianRelationship: 'Mother',
        applicantMessage: 'Transfer student from Abuja. Excellent academic record in arts and debate.',
        status: 'under_review',
        adminNotes: 'Application documents received and credentials under academic committee review.',
      },
      {
        applicationNumber: 'APP-2026-67382',
        accessKey: 'APP-KEY-C3D4E5F6A1B2789012345678',
        firstName: 'Chukwuebuka',
        middleName: 'Francis',
        lastName: 'Okonkwo',
        dateOfBirth: '2009-02-18',
        gender: 'Male',
        email: 'ebuka.okonkwo@example.com',
        phone: '+234 807 333 4455',
        address: '22 Marine Road, Apapa, Lagos',
        sessionId: session2026.id,
        classId: allClasses[9].id, // SS 1 Diamond
        departmentId: createdDepartments[0].id,
        guardianName: 'Mr. Emmanuel Okonkwo',
        guardianPhone: '+234 809 667 8899',
        guardianEmail: 'e.okonkwo@example.com',
        guardianRelationship: 'Father',
        applicantMessage: 'Seeking admission into Senior Secondary Science track.',
        status: 'needs_information',
        adminNotes: 'Please upload certified copy of Junior WAEC / BECE official result transcript.',
      },
      {
        applicationNumber: 'APP-2026-19405',
        accessKey: 'APP-KEY-D4E5F6A1B2C3789012345678',
        firstName: 'Halimat',
        middleName: 'Busayo',
        lastName: 'Suleiman',
        dateOfBirth: '2009-11-05',
        gender: 'Female',
        email: 'halimat.s@example.com',
        phone: '+234 809 444 5566',
        address: '5 Isaac John Street, GRA Ikeja, Lagos',
        sessionId: session2026.id,
        classId: allClasses[10].id, // SS 1 Ruby
        departmentId: createdDepartments[1].id,
        guardianName: 'Alhaji Suleiman Haruna',
        guardianPhone: '+234 812 778 9900',
        guardianEmail: 'suleiman.h@example.com',
        guardianRelationship: 'Father',
        applicantMessage: 'Interested in humanities, literature, and international relations.',
        status: 'pending',
      },
    ];

    const insertedApps = await db.insert(admissionApplications).values(sampleApps).returning();
    for (const app of insertedApps) {
      await db.insert(admissionApplicationLogs).values({
        applicationId: app.id,
        action: app.status === 'under_review' ? 'STATUS_CHANGE' : app.status === 'needs_information' ? 'INFO_REQUESTED' : 'SUBMITTED',
        previousStatus: null,
        newStatus: app.status,
        notes: app.adminNotes || 'Application submitted via admissions system.',
      });
    }
    console.log(`✅ Sample admission applications initialized (${insertedApps.length} active applicant profiles).`);

    console.log('✅ Comprehensive academic seed data successfully initialized: 500 students, 30 teachers, 350 parents, 18 classes, complete timetables, and everyday attendance for the 2-month stretch.');
  } catch (error: any) {
    console.error('Initial seeding error:', error);
  }
}

/**
 * Automatically ensures baseline dummy accounts exist and are ready for login:
 * - Teacher: teacher.adewale@school.com / teacher123 (ID: TCH-2026-001)
 * - Parent: parent.ibrahim@school.com / parent123 (ID: PAR-2026-0001)
 * - Student: student.chinedu@school.com / student123 (ID: STU-2026-0001)
 * If demo accounts or records are missing, seeds the complete academic dataset.
 */
export async function ensureDefaultDemoData(): Promise<void> {
  const allowDemo = process.env.ENABLE_DEMO_LOGINS === 'true' || process.env.DEMO_MODE === 'true' || process.env.SEED_DEMO_DATA === 'true' || process.env.ALLOW_DEMO === 'true' || process.env.NODE_ENV !== 'production';
  // Production safety: Automatic demo data and user seeding only runs in dev or with explicit demo flags
  if (!allowDemo) {
    console.log('Production mode active: automatic demo seeding and dummy accounts are disabled.');
    return;
  }

  try {
    await ensureTablesExist();

    // 1. Ensure Demo Super Admin account (admin@school.com / admin123)
    const demoAdminEmail = 'admin@school.com';
    const demoAdminPassHash = await hashPassword('admin123');

    const [existingDemoAdmin] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, demoAdminEmail))
      .limit(1);

    if (!existingDemoAdmin) {
      await db.insert(users).values({
        uid: 'admin-demo-superadmin',
        email: demoAdminEmail,
        passwordHash: demoAdminPassHash,
        fullName: 'Demo Super Administrator',
        role: 'super_admin',
        status: 'active',
        phone: '+234 800 000 0001',
      });
      console.log(`✓ Demo Super Admin account verified: ${demoAdminEmail}`);
    } else {
      await db
        .update(users)
        .set({ passwordHash: demoAdminPassHash, status: 'active', role: 'super_admin', fullName: 'Demo Super Administrator' })
        .where(eq(users.id, existingDemoAdmin.id));
      console.log(`✓ Demo Super Admin credentials synchronized for: ${demoAdminEmail}`);
    }

    // 2. Ensure Primary Super Admin account if configured via environment
    const envAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const envAdminPassword = process.env.ADMIN_PASSWORD?.trim();
    if (envAdminEmail && envAdminPassword) {
      const adminPassHash = await hashPassword(envAdminPassword);
      const [adminUser] = await db
        .select({ id: users.id, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.email, envAdminEmail))
        .limit(1);

      if (!adminUser) {
        await db.insert(users).values({
          uid: 'admin-configured-primary',
          email: envAdminEmail,
          passwordHash: adminPassHash,
          fullName: process.env.ADMIN_FULL_NAME?.trim() || 'Super Administrator',
          role: 'super_admin',
          status: 'active',
          phone: '+234 800 000 0001',
        });
        console.log(`✓ Super Admin account verified: ${envAdminEmail}`);
      }
    }

    const [teacherUser] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, 'teacher.adewale@school.com'))
      .limit(1);

    const [parentUser] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, 'parent.ibrahim@school.com'))
      .limit(1);

    const [studentUser] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, 'student.chinedu@school.com'))
      .limit(1);

    const teacherCountRes = await db.select({ count: sql<number>`count(*)` }).from(teachers);
    const studentCountRes = await db.select({ count: sql<number>`count(*)` }).from(students);
    const parentCountRes = await db.select({ count: sql<number>`count(*)` }).from(parents);

    const tc = Number(teacherCountRes[0]?.count || 0);
    const sc = Number(studentCountRes[0]?.count || 0);
    const pc = Number(parentCountRes[0]?.count || 0);

    if (!teacherUser || !parentUser || !studentUser || tc < 30 || sc < 100 || pc < 50) {
      console.log('🔄 Initializing standard academic dataset (30 teachers, 500 students, 350 parents)...');
      await seedInitialData(true);
    } else {
      // Ensure default password hashes are guaranteed to match
      const teacherPassHash = await hashPassword('teacher123');
      const parentPassHash = await hashPassword('parent123');
      const studentPassHash = await hashPassword('student123');

      await db
        .update(users)
        .set({ passwordHash: teacherPassHash, status: 'active' })
        .where(eq(users.id, teacherUser.id));

      await db
        .update(users)
        .set({ passwordHash: parentPassHash, status: 'active' })
        .where(eq(users.id, parentUser.id));

      await db
        .update(users)
        .set({ passwordHash: studentPassHash, status: 'active' })
        .where(eq(users.id, studentUser.id));

      console.log('✓ Demo admin, teacher, parent, and student accounts verified with active credentials.');
    }

    // Ensure Public Portal & CMS default records exist
    await ensurePublicPortalSeedData();
  } catch (err: any) {
    console.error('Failed to ensure default demo data:', err);
  }
}

/**
 * Seeds initial CMS content and Public Portal settings if not already present.
 */
export async function ensurePublicPortalSeedData(): Promise<void> {
  try {
    const existingSettings = await db.select().from(publicPortalSettings).limit(1);
    const [currentSession] = await db
      .select({ id: academicSessions.id, name: academicSessions.name })
      .from(academicSessions)
      .where(eq(academicSessions.isCurrent, true))
      .limit(1);

    const sessionId = currentSession?.id || 1;

    // 1. Initialize Portal Settings if empty
    if (existingSettings.length === 0) {
      await db.insert(publicPortalSettings).values({
        portalEnabled: true,
        admissionsOpen: true,
        openingDate: '2026-08-01',
        closingDate: '2027-01-31',
        currentSessionId: sessionId,
        announcementMessage: 'Applications are now open for the 2026/2027 academic session. Explore accredited programmes and apply online.',
        applicationInstructions: '1. Select your target program or class.\n2. Complete applicant details and guardian contact information.\n3. Save your Application Number and Access Key to track review progress live.',
        applicationFee: '0.00',
        admissionsContactInfo: 'Admissions Office: admissions@school.edu • Tel: +234 803 111 2233',
        showPrograms: true,
        showRequirements: true,
        showImportantDates: true,
        showNews: true,
        showFaqs: true,
        showContact: true,
        heroTitle: "Let's fly to your Dream Academy",
        heroSubtitle: 'Your dream education is just a few clicks away — no stress, no complexity. Apply smart, verify credentials, and track your admission progress live.',
        heroBadgeText: 'Admissions Intake Open',
        officeHours: 'Mon - Fri • 8:00 AM - 5:00 PM',
      });
      console.log('✓ Public Portal default settings initialized.');
    }

    // 2. Initialize Blog Categories & Posts if empty
    const postsCount = await db.select({ count: sql<number>`count(*)` }).from(blogPosts);
    if (Number(postsCount[0]?.count || 0) === 0) {
      const [cat1, cat2, cat3, cat4] = await db
        .insert(blogCategories)
        .values([
          { name: 'Admissions & Enrollment', slug: 'admissions-enrollment', description: 'Important notices and admission guides' },
          { name: 'Academic Excellence', slug: 'academic-excellence', description: 'Curriculum updates and scholarly distinctions' },
          { name: 'Campus & Student Life', slug: 'campus-student-life', description: 'Student experiences and co-curricular programs' },
          { name: 'STEM & Innovations', slug: 'stem-innovations', description: 'Science, technology, engineering, and mathematics' },
        ])
        .returning();

      await db.insert(blogPosts).values([
        {
          title: 'Admissions Guide 2026/2027: Key Requirements and Entry Paths',
          slug: 'admissions-guide-2026-2027-key-requirements-and-entry-paths',
          summary: 'A step-by-step walkthrough for parents and prospective applicants seeking entry into junior and senior secondary levels.',
          content: '<p>Welcome prospective students and parents to the 2026/2027 academic admission season. Our institution prides itself on cultivating well-rounded scholars through academic rigor, ethical leadership, and technological fluency.</p><h3>Application Milestones</h3><p>All candidates are required to register online, provide verified transcripts, and participate in our holistic entry assessment. Early applicants benefit from tailored orientation sessions and early confirmation of subject electives.</p><ul><li>Submit your biodata and academic record before January 31, 2027.</li><li>Receive real-time updates through your cryptographic tracking key.</li><li>Attend the guided campus tour and entrance review.</li></ul>',
          category: 'Admissions & Enrollment',
          categoryId: cat1.id,
          authorName: 'Admissions Committee',
          status: 'published',
          publishedAt: new Date('2026-08-15T09:00:00Z'),
          isFeatured: true,
          viewsCount: 342,
        },
        {
          title: 'Advanced STEM & Modern Scientific Research Laboratories Open',
          slug: 'stem-innovation-and-modern-laboratories-student-achievements',
          summary: 'Exploring our newly upgraded science labs, robotics kits, and digital innovation spaces available for experiential learning.',
          content: '<p>In line with our commitment to forward-thinking STEM education, the academy has expanded its modern science laboratories with new spectroscopy kits, robotics microcontrollers, and dedicated computer science learning suites.</p><p>Students from Grade 7 through Grade 12 participate in weekly hands-on experiments designed to bridge theoretical concepts with real-world technological challenges.</p>',
          category: 'STEM & Innovations',
          categoryId: cat4.id,
          authorName: 'Head of Science Faculty',
          status: 'published',
          publishedAt: new Date('2026-08-25T11:30:00Z'),
          isFeatured: true,
          viewsCount: 218,
        },
        {
          title: 'Scholarship Opportunities & Merit Grants for Incoming Scholars',
          slug: 'scholarship-opportunities-and-merit-grants-for-incoming-scholars',
          summary: 'Discover merit-based tuition waivers and athletic excellence grants available for exceptional new admissions.',
          content: '<p>Every academic session, our Board of Governors awards competitive merit scholarships to candidates displaying exemplary scholastic performance and innovative community contributions.</p><p>Interested applicants should ensure previous report cards and teacher recommendation letters are submitted during registration.</p>',
          category: 'Academic Excellence',
          categoryId: cat2.id,
          authorName: 'Dean of Student Affairs',
          status: 'published',
          publishedAt: new Date('2026-09-05T14:00:00Z'),
          isFeatured: false,
          viewsCount: 185,
        },
        {
          title: 'Annual Open Campus Exhibition & Academy Guided Tour',
          slug: 'annual-open-campus-exhibition-and-guided-tour',
          summary: 'Join us on Saturday, October 15th for an immersive tour of classrooms, athletics grounds, and student art galleries.',
          content: '<p>Prospective families are warmly invited to tour our world-class campus facilities, meet our dedicated teachers, and experience student demonstrations in debate, robotics, and athletics.</p>',
          category: 'Campus & Student Life',
          categoryId: cat3.id,
          authorName: 'Admissions Office',
          status: 'published',
          publishedAt: new Date('2026-09-12T10:00:00Z'),
          isFeatured: false,
          viewsCount: 140,
        },
      ]);
      console.log('✓ Default blog categories and published articles seeded.');
    }

    // 3. Initialize Important Dates if empty
    const datesCount = await db.select({ count: sql<number>`count(*)` }).from(importantDates);
    if (Number(datesCount[0]?.count || 0) === 0) {
      await db.insert(importantDates).values([
        {
          title: 'Online Admissions Portal Opens',
          description: 'Official commencement of online student registration for all active academic cohorts.',
          eventDate: '2026-08-01',
          eventTime: '08:00 AM',
          category: 'Admission',
          isPubliclyVisible: true,
          status: 'ongoing',
          displayOrder: 1,
        },
        {
          title: 'Open Campus Day & Academy Guided Tour',
          description: 'Guided tour of academic halls, STEM labs, athletics facilities, and meeting with department heads.',
          eventDate: '2026-10-15',
          eventTime: '10:00 AM',
          category: 'General',
          isPubliclyVisible: true,
          status: 'upcoming',
          displayOrder: 2,
        },
        {
          title: 'First Batch Entrance Examination',
          description: 'Standardized entrance examination in English, Mathematics, and General Aptitude.',
          eventDate: '2026-12-12',
          eventTime: '09:00 AM',
          category: 'Exam',
          isPubliclyVisible: true,
          status: 'upcoming',
          displayOrder: 3,
        },
        {
          title: 'Final Application Deadline for Current Session',
          description: 'Portal closes for late admissions submissions and document verifications.',
          eventDate: '2027-01-31',
          eventTime: '11:59 PM',
          category: 'Admission',
          isPubliclyVisible: true,
          status: 'upcoming',
          displayOrder: 4,
        },
        {
          title: 'Orientation Week for Newly Admitted Students',
          description: 'Welcome assembly, campus familiarization, locker assignment, and timetable distribution.',
          eventDate: '2027-02-08',
          eventTime: '08:30 AM',
          category: 'Resumption',
          isPubliclyVisible: true,
          status: 'upcoming',
          displayOrder: 5,
        },
      ]);
      console.log('✓ Default important dates seeded.');
    }

    // 4. Initialize Admission Requirements if empty
    const reqsCount = await db.select({ count: sql<number>`count(*)` }).from(admissionRequirements);
    if (Number(reqsCount[0]?.count || 0) === 0) {
      await db.insert(admissionRequirements).values([
        {
          title: 'Certified Birth Certificate or Statutory Age Declaration',
          description: 'Government-issued birth certificate or verified statutory declaration of age confirming applicant eligibility.',
          scope: 'general',
          isMandatory: true,
          isPubliclyVisible: true,
          displayOrder: 1,
        },
        {
          title: 'Two (2) Recent Passport-Sized Photographs',
          description: 'Clear, full-face color passport photographs with plain white background taken within the last 3 months.',
          scope: 'general',
          isMandatory: true,
          isPubliclyVisible: true,
          displayOrder: 2,
        },
        {
          title: 'Official Academic Transcripts / Previous School Records',
          description: 'Certified termly progress reports or continuous assessment transcripts from the two most recent academic sessions.',
          scope: 'general',
          isMandatory: true,
          isPubliclyVisible: true,
          displayOrder: 3,
        },
        {
          title: 'Medical Certificate of Fitness',
          description: 'Official medical fitness certificate, immunization record, and blood group verification from a recognized clinic.',
          scope: 'general',
          isMandatory: true,
          isPubliclyVisible: true,
          displayOrder: 4,
        },
        {
          title: 'Valid Parent / Guardian Identity & Proof of Residence',
          description: 'Copy of valid government ID (Driver License, National ID, or Passport) and utility bill or residency proof.',
          scope: 'general',
          isMandatory: true,
          isPubliclyVisible: true,
          displayOrder: 5,
        },
        {
          title: 'BECE / Junior WAEC Statement of Result (Senior Secondary Track)',
          description: 'Official confirmation of credit passes in core subjects including Mathematics and English Language.',
          scope: 'department',
          isMandatory: false,
          isPubliclyVisible: true,
          displayOrder: 6,
        },
      ]);
      console.log('✓ Default admission requirements seeded.');
    }

    // 5. Initialize FAQs if empty
    const faqsCount = await db.select({ count: sql<number>`count(*)` }).from(faqs);
    if (Number(faqsCount[0]?.count || 0) === 0) {
      await db.insert(faqs).values([
        {
          question: 'When does admission close for the 2026/2027 academic session?',
          answer: '<p>Online applications officially close on <strong>January 31, 2027</strong>. We strongly recommend early registration as classroom capacities are capped to ensure low student-teacher ratios.</p>',
          category: 'Admissions',
          displayOrder: 1,
          isPublished: true,
        },
        {
          question: 'How do I track the progress of my submitted application?',
          answer: '<p>You can track your application anytime by clicking the <strong>Track</strong> tab on our public admissions portal. Simply enter your unique <strong>Application Number</strong> (e.g., APP-2026-89241) and the confidential <strong>Access Key</strong> provided upon submission.</p>',
          category: 'Admissions',
          displayOrder: 2,
          isPublished: true,
        },
        {
          question: 'Is there an application fee for online registration?',
          answer: '<p>Online application registration for the 2026/2027 intake is completely <strong>free of charge</strong> during the open application window.</p>',
          category: 'Financial',
          displayOrder: 3,
          isPublished: true,
        },
        {
          question: 'What subjects are tested during the entrance assessment?',
          answer: '<p>The entrance examination covers <strong>English Language</strong>, <strong>General Mathematics</strong>, and <strong>Quantitative & Verbal Reasoning</strong> appropriate to the applicant’s designated entry grade.</p>',
          category: 'Requirements',
          displayOrder: 4,
          isPublished: true,
        },
        {
          question: 'Can I modify my application or submit missing documents after applying?',
          answer: '<p>Yes. If our admissions committee requires additional information or document verification, your tracking status will update to <em>Needs Information</em>, and you will receive guidance on how to submit updates.</p>',
          category: 'General',
          displayOrder: 5,
          isPublished: true,
        },
        {
          question: 'What age requirements apply to Junior Secondary entry?',
          answer: '<p>Candidates seeking admission into JSS 1 (Grade 7) should normally be 10 or 11 years old by September of the entry year, with successful completion of primary curriculum.</p>',
          category: 'Requirements',
          displayOrder: 6,
          isPublished: true,
        },
      ]);
      console.log('✓ Default FAQs seeded.');
    }

    // 6. Enhance Classes with rich public portal metadata
    const allClasses = await db.select({ id: classes.id, name: classes.name, gradeLevel: classes.gradeLevel }).from(classes);
    for (const c of allClasses) {
      const isJunior = c.name.toLowerCase().includes('jss') || c.name.toLowerCase().includes('junior');
      const isSenior = c.name.toLowerCase().includes('ss') || c.name.toLowerCase().includes('senior');
      const duration = isJunior ? '3 Academic Years' : isSenior ? '3 Academic Years' : '1 Academic Year';
      const desc = isJunior
        ? 'Comprehensive foundation across basic sciences, humanities, modern languages, and introductory technology.'
        : isSenior
        ? 'Specialized university-preparatory coursework with advanced STEM, commercial, and arts tracks.'
        : 'Holistic curriculum fostering critical thinking, creative expression, and collaborative leadership.';
      const req = isSenior
        ? 'Satisfactory completion of Junior Secondary BECE examinations with credit passes in English and Mathematics.'
        : 'Completion of primary level coursework with continuous assessment records.';

      await db
        .update(classes)
        .set({
          isPubliclyVisible: true,
          admissionStatus: 'available',
          duration,
          publicDescription: desc,
          requirements: req,
          isFeatured: c.name.includes('1') || c.name.includes('Gold') || c.name.includes('Diamond'),
        })
        .where(eq(classes.id, c.id));
    }
    console.log('✓ Academic classes enriched with public portal metadata.');
  } catch (err: any) {
    console.error('Error seeding public portal data:', err);
  }
}
