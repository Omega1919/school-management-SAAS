import { pool } from './index.ts';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '0001_initial_schema',
    sql: `
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

CREATE TABLE IF NOT EXISTS teachers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL UNIQUE,
  specialization TEXT NOT NULL,
  qualification TEXT NOT NULL,
  hire_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  address TEXT,
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE teachers ADD COLUMN IF NOT EXISTS hire_date TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

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

CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_subjects (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES teachers(id),
  periods_per_week INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(class_id, subject_id)
);

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  student_id TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender TEXT NOT NULL,
  dob TEXT,
  date_of_birth TEXT,
  class_id INTEGER REFERENCES classes(id),
  current_session_id INTEGER REFERENCES academic_sessions(id),
  admission_date TEXT NOT NULL DEFAULT '2026-09-01',
  enrollment_token TEXT,
  enrollment_token_expires_at TIMESTAMP,
  guardian_name TEXT,
  guardian_phone TEXT,
  guardian_email TEXT,
  emergency_contact TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  address TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_birth TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE students ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

CREATE TABLE IF NOT EXISTS parents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id TEXT NOT NULL UNIQUE,
  relationship TEXT DEFAULT 'Parent',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parent_students (
  id SERIAL PRIMARY KEY,
  parent_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'Parent',
  is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(parent_user_id, student_id)
);

CREATE TABLE IF NOT EXISTS student_enrollments (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES academic_sessions(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  enrollment_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enrolled',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, session_id, class_id)
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

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  session_id INTEGER REFERENCES academic_sessions(id),
  term_id INTEGER NOT NULL REFERENCES academic_terms(id),
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  arrival_time TEXT,
  late_reason TEXT,
  late_approved BOOLEAN NOT NULL DEFAULT FALSE,
  late_recorded_by INTEGER REFERENCES users(id),
  late_recorded_at TIMESTAMP,
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  remarks TEXT,
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, date, class_id)
);

CREATE TABLE IF NOT EXISTS class_attendance_submissions (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  date TEXT NOT NULL,
  recorded_by INTEGER REFERENCES users(id),
  submitted_by INTEGER REFERENCES users(id),
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  total_present INTEGER NOT NULL DEFAULT 0,
  total_absent INTEGER NOT NULL DEFAULT 0,
  total_excused INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(class_id, date)
);

CREATE TABLE IF NOT EXISTS results (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  term_id INTEGER NOT NULL REFERENCES academic_terms(id),
  session_id INTEGER REFERENCES academic_sessions(id),
  assessment_type TEXT NOT NULL DEFAULT 'Continuous Assessment',
  test_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  exam_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_marks DOUBLE PRECISION NOT NULL DEFAULT 100,
  grade TEXT NOT NULL,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  entered_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS announcement_reads (
  id SERIAL PRIMARY KEY,
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
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

CREATE TABLE IF NOT EXISTS parent_invitations (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  invitation_token TEXT NOT NULL UNIQUE,
  relationship TEXT DEFAULT 'Parent',
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_invitations (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  specialization TEXT NOT NULL,
  qualification TEXT NOT NULL,
  invitation_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER NOT NULL REFERENCES users(id),
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
  currency_symbol TEXT NOT NULL DEFAULT '$',
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  attendance_start_time TEXT NOT NULL DEFAULT '07:30',
  attendance_cutoff_time TEXT NOT NULL DEFAULT '08:30',
  attendance_policy TEXT NOT NULL DEFAULT 'flexible',
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
`,
  },
  {
    version: 2,
    name: '0002_academic_current_unique_indexes',
    sql: `
-- Clean any duplicate current session flags before enforcing partial unique constraint
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

-- Enforce exactly one active/current academic session in PostgreSQL
CREATE UNIQUE INDEX IF NOT EXISTS academic_sessions_current_unique_idx
ON academic_sessions (is_current)
WHERE is_current = true;

-- Enforce exactly one active/current academic term in PostgreSQL
CREATE UNIQUE INDEX IF NOT EXISTS academic_terms_current_unique_idx
ON academic_terms (is_current)
WHERE is_current = true;
`,
  },
  {
    version: 3,
    name: '0003_timetable_indexes_and_constraints',
    sql: `
CREATE INDEX IF NOT EXISTS timetables_class_idx ON timetables (class_id);
CREATE INDEX IF NOT EXISTS timetables_teacher_idx ON timetables (teacher_id);
CREATE INDEX IF NOT EXISTS timetables_subject_idx ON timetables (subject_id);
CREATE INDEX IF NOT EXISTS class_subjects_class_idx ON class_subjects (class_id);
CREATE INDEX IF NOT EXISTS class_subjects_teacher_idx ON class_subjects (teacher_id);
`,
  },
  {
    version: 4,
    name: '0004_teacher_and_student_columns',
    sql: `
DO $$ BEGIN
  ALTER TABLE teachers ADD COLUMN IF NOT EXISTS hire_date TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_birth TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE students ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;
`,
  },
  {
    version: 5,
    name: '0005_parents_and_relations_columns',
    sql: `
DO $$ BEGIN
  ALTER TABLE parents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE parent_students ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN OTHERS THEN null; END $$;
`,
  },
  {
    version: 6,
    name: '0006_students_dob_nullable',
    sql: `
DO $$ BEGIN
  ALTER TABLE students ALTER COLUMN dob DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN null; END $$;
`,
  },
  {
    version: 7,
    name: '0007_admissions_and_departments',
    sql: `
-- Departments / Programmes
CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS departments_code_idx ON departments (code);
CREATE INDEX IF NOT EXISTS departments_status_idx ON departments (status);

-- Classes department reference
DO $$ BEGIN
  ALTER TABLE classes ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN null; END $$;
CREATE INDEX IF NOT EXISTS classes_department_idx ON classes (department_id);

-- School Settings nomenclature
DO $$ BEGIN
  ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS term_system TEXT NOT NULL DEFAULT 'term';
EXCEPTION WHEN OTHERS THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS level_system TEXT NOT NULL DEFAULT 'class';
EXCEPTION WHEN OTHERS THEN null; END $$;

-- Admissions Applications
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
  session_id INTEGER NOT NULL REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  guardian_name TEXT,
  guardian_phone TEXT,
  guardian_email TEXT,
  guardian_relationship TEXT DEFAULT 'Parent',
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  applicant_message TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  approved_student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admission_apps_session_idx ON admission_applications (session_id);
CREATE INDEX IF NOT EXISTS admission_apps_class_idx ON admission_applications (class_id);
CREATE INDEX IF NOT EXISTS admission_apps_dept_idx ON admission_applications (department_id);
CREATE INDEX IF NOT EXISTS admission_apps_status_idx ON admission_applications (status);
CREATE INDEX IF NOT EXISTS admission_apps_email_idx ON admission_applications (email);
CREATE UNIQUE INDEX IF NOT EXISTS admission_apps_number_idx ON admission_applications (application_number);

-- Admissions Application Logs / Review History
CREATE TABLE IF NOT EXISTS admission_application_logs (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  notes TEXT,
  performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admission_logs_app_idx ON admission_application_logs (application_id);
`,
  },
  {
    version: 8,
    name: '0008_student_enrollments_alignment',
    sql: `
DO $$ BEGIN
  ALTER TABLE student_enrollments ADD COLUMN IF NOT EXISTS term_id INTEGER REFERENCES academic_terms(id);
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE student_enrollments ADD COLUMN IF NOT EXISTS academic_average DOUBLE PRECISION;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE student_enrollments ADD COLUMN IF NOT EXISTS attendance_rate DOUBLE PRECISION;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE student_enrollments ADD COLUMN IF NOT EXISTS promoted_to_class_id INTEGER REFERENCES classes(id);
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE student_enrollments ADD COLUMN IF NOT EXISTS remarks TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE student_enrollments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
EXCEPTION WHEN OTHERS THEN null; END $$;
`,
  },
  {
    version: 9,
    name: '0009_attendance_submissions_alignment',
    sql: `
DO $$ BEGIN
  ALTER TABLE class_attendance_submissions ADD COLUMN IF NOT EXISTS session_id INTEGER REFERENCES academic_sessions(id);
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE class_attendance_submissions ADD COLUMN IF NOT EXISTS term_id INTEGER REFERENCES academic_terms(id);
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE class_attendance_submissions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'submitted';
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE class_attendance_submissions ADD COLUMN IF NOT EXISTS submitted_by INTEGER REFERENCES users(id);
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE class_attendance_submissions ALTER COLUMN recorded_by DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE class_attendance_submissions ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE class_attendance_submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
EXCEPTION WHEN OTHERS THEN null; END $$;
`,
  },
  {
    version: 10,
    name: '0010_drop_recorded_by_not_null',
    sql: `
DO $$ BEGIN
  ALTER TABLE class_attendance_submissions ALTER COLUMN recorded_by DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN null; END $$;
`,
  },
  {
    version: 11,
    name: '0011_public_portal_cms_architecture',
    sql: `
-- 1. Extend classes table with public portal availability columns
DO $$ BEGIN
  ALTER TABLE classes ADD COLUMN IF NOT EXISTS is_publicly_visible BOOLEAN NOT NULL DEFAULT true;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE classes ADD COLUMN IF NOT EXISTS admission_status TEXT NOT NULL DEFAULT 'available';
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE classes ADD COLUMN IF NOT EXISTS public_description TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE classes ADD COLUMN IF NOT EXISTS duration TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE classes ADD COLUMN IF NOT EXISTS requirements TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE classes ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN OTHERS THEN null; END $$;

CREATE INDEX IF NOT EXISTS classes_admission_status_idx ON classes (admission_status);

-- 2. Create public_portal_settings table
CREATE TABLE IF NOT EXISTS public_portal_settings (
  id SERIAL PRIMARY KEY,
  portal_enabled BOOLEAN NOT NULL DEFAULT true,
  admissions_open BOOLEAN NOT NULL DEFAULT true,
  opening_date TEXT,
  closing_date TEXT,
  current_session_id INTEGER REFERENCES academic_sessions(id),
  announcement_message TEXT DEFAULT 'Applications are now officially open for admission into accredited programmes.',
  application_instructions TEXT,
  application_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  admissions_contact_info TEXT,
  show_programs BOOLEAN NOT NULL DEFAULT true,
  show_requirements BOOLEAN NOT NULL DEFAULT true,
  show_important_dates BOOLEAN NOT NULL DEFAULT true,
  show_news BOOLEAN NOT NULL DEFAULT true,
  show_faqs BOOLEAN NOT NULL DEFAULT true,
  show_contact BOOLEAN NOT NULL DEFAULT true,
  hero_title TEXT DEFAULT 'Let''s fly to your Dream Academy',
  hero_subtitle TEXT DEFAULT 'Your dream education is just a few clicks away — no stress, no complexity. Apply smart, verify credentials, and track your admission progress live.',
  hero_badge_text TEXT DEFAULT 'Admissions Intake Open',
  website_url TEXT,
  facebook_url TEXT,
  twitter_url TEXT,
  instagram_url TEXT,
  linkedin_url TEXT,
  office_hours TEXT DEFAULT 'Mon - Sat • 8:00 AM - 5:00 PM',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Create blog_categories table
CREATE TABLE IF NOT EXISTS blog_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Create blog_posts table
CREATE TABLE IF NOT EXISTS blog_posts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  summary TEXT,
  content TEXT NOT NULL,
  featured_image TEXT,
  category TEXT NOT NULL DEFAULT 'Admissions',
  category_id INTEGER REFERENCES blog_categories(id),
  author_name TEXT NOT NULL DEFAULT 'Admissions Committee',
  author_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'published',
  published_at TIMESTAMP,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  views_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS blog_posts_slug_idx ON blog_posts (slug);
CREATE INDEX IF NOT EXISTS blog_posts_status_idx ON blog_posts (status);
CREATE INDEX IF NOT EXISTS blog_posts_published_idx ON blog_posts (published_at);
CREATE INDEX IF NOT EXISTS blog_posts_category_idx ON blog_posts (category);

-- 5. Create important_dates table
CREATE TABLE IF NOT EXISTS important_dates (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_date TEXT NOT NULL,
  event_time TEXT,
  category TEXT NOT NULL DEFAULT 'Admission',
  is_publicly_visible BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'upcoming',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dates_visible_idx ON important_dates (is_publicly_visible);
CREATE INDEX IF NOT EXISTS dates_event_date_idx ON important_dates (event_date);
CREATE INDEX IF NOT EXISTS dates_order_idx ON important_dates (display_order);

-- 6. Create admission_requirements table
CREATE TABLE IF NOT EXISTS admission_requirements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'general',
  department_id INTEGER REFERENCES departments(id),
  class_id INTEGER REFERENCES classes(id),
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  is_publicly_visible BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reqs_scope_idx ON admission_requirements (scope);
CREATE INDEX IF NOT EXISTS reqs_dept_idx ON admission_requirements (department_id);
CREATE INDEX IF NOT EXISTS reqs_class_idx ON admission_requirements (class_id);
CREATE INDEX IF NOT EXISTS reqs_visible_idx ON admission_requirements (is_publicly_visible);

-- 7. Create faqs table
CREATE TABLE IF NOT EXISTS faqs (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS faqs_published_idx ON faqs (is_published);
CREATE INDEX IF NOT EXISTS faqs_order_idx ON faqs (display_order);
`,
  },
  {
    version: 12,
    name: '0012_fix_school_timezone_default_africa_lagos',
    sql: `
DO $$ BEGIN
  -- Establish intended column default for school timezone
  ALTER TABLE school_settings ALTER COLUMN timezone SET DEFAULT 'Africa/Lagos';
EXCEPTION WHEN OTHERS THEN null; END $$;

-- Update existing records if they were left as UTC
UPDATE school_settings
SET timezone = 'Africa/Lagos'
WHERE timezone = 'UTC' OR timezone IS NULL;
`,
  },
  {
    version: 13,
    name: '0013_admission_application_upgrades',
    sql: `
DO $$ BEGIN
  ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS nationality TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS state_of_origin TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS lga TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS passport_photo TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS guardian_address TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS guardian_occupation TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS entry_mode TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS documents TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;
`,
  },
  {
    version: 14,
    name: '0014_public_portal_visual_editor_enhancements',
    sql: `
DO $$ BEGIN
  ALTER TABLE public_portal_settings ADD COLUMN IF NOT EXISTS hero_primary_cta_text TEXT DEFAULT 'Apply Online';
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public_portal_settings ADD COLUMN IF NOT EXISTS hero_secondary_cta_text TEXT DEFAULT 'Track Status';
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public_portal_settings ADD COLUMN IF NOT EXISTS draft_settings TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public_portal_settings ADD COLUMN IF NOT EXISTS has_unpublished_changes BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN OTHERS THEN null; END $$;

CREATE TABLE IF NOT EXISTS public_portal_hero_slides (
  id SERIAL PRIMARY KEY,
  image_url TEXT NOT NULL,
  title TEXT,
  alt_text TEXT DEFAULT 'Campus Hero Background',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hero_slides_active_idx ON public_portal_hero_slides (is_active);
CREATE INDEX IF NOT EXISTS hero_slides_order_idx ON public_portal_hero_slides (display_order);
`,
  },
  {
    version: 15,
    name: '0015_attendance_lateness_columns',
    sql: `
DO $$ BEGIN
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS arrival_time TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_reason TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_approved BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_recorded_by INTEGER REFERENCES users(id);
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_recorded_at TIMESTAMP;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
EXCEPTION WHEN OTHERS THEN null; END $$;

CREATE INDEX IF NOT EXISTS attendance_is_late_idx ON attendance (is_late);
`,
  },
  {
    version: 16,
    name: '0016_attendance_recorded_by_column',
    sql: `
DO $$ BEGIN
  ALTER TABLE attendance ADD COLUMN IF NOT EXISTS recorded_by INTEGER REFERENCES users(id);
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  UPDATE attendance SET recorded_by = marked_by WHERE recorded_by IS NULL AND marked_by IS NOT NULL;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  UPDATE attendance SET recorded_by = (SELECT id FROM users WHERE role = 'super_admin' LIMIT 1) WHERE recorded_by IS NULL;
EXCEPTION WHEN OTHERS THEN null; END $$;
`,
  },
  {
    version: 17,
    name: '0017_teacher_delegated_admin_permissions',
    sql: `
DO $$ BEGIN
  ALTER TABLE teachers ADD COLUMN IF NOT EXISTS permissions TEXT NOT NULL DEFAULT '[]';
EXCEPTION WHEN OTHERS THEN null; END $$;
`,
  },
  {
    version: 18,
    name: '0018_results_assessment_type_and_test_scores',
    sql: `
DO $$ BEGIN
  ALTER TABLE results ADD COLUMN IF NOT EXISTS assessment_type TEXT NOT NULL DEFAULT 'Continuous Assessment';
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE results ADD COLUMN IF NOT EXISTS test_score DOUBLE PRECISION NOT NULL DEFAULT 0;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE results ADD COLUMN IF NOT EXISTS max_marks DOUBLE PRECISION NOT NULL DEFAULT 100;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE results ADD COLUMN IF NOT EXISTS entered_by INTEGER REFERENCES users(id);
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  UPDATE results SET entered_by = recorded_by WHERE entered_by IS NULL AND recorded_by IS NOT NULL;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  UPDATE results SET entered_by = (SELECT id FROM users WHERE role = 'super_admin' LIMIT 1) WHERE entered_by IS NULL;
EXCEPTION WHEN OTHERS THEN null; END $$;
`,
  },
  {
    version: 19,
    name: '0019_configurable_timetable_schedules',
    sql: `
DO $$ BEGIN
  ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS timetable_days TEXT NOT NULL DEFAULT 'Monday,Tuesday,Wednesday,Thursday,Friday';
EXCEPTION WHEN OTHERS THEN null; END $$;

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

CREATE INDEX IF NOT EXISTS timetable_periods_number_idx ON timetable_periods (period_number);
CREATE INDEX IF NOT EXISTS timetable_periods_type_idx ON timetable_periods (type);

-- Seed default standard periods if table is empty
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM timetable_periods LIMIT 1) THEN
    INSERT INTO timetable_periods (period_number, label, start_time, end_time, type, is_teaching, sort_order, days)
    VALUES
      (1, 'Period 1', '08:00', '08:45', 'lesson', true, 1, 'Monday,Tuesday,Wednesday,Thursday,Friday'),
      (2, 'Period 2', '08:45', '09:30', 'lesson', true, 2, 'Monday,Tuesday,Wednesday,Thursday,Friday'),
      (3, 'Period 3', '09:30', '10:15', 'lesson', true, 3, 'Monday,Tuesday,Wednesday,Thursday,Friday'),
      (0, 'Morning Break', '10:15', '10:45', 'break', false, 4, 'Monday,Tuesday,Wednesday,Thursday,Friday'),
      (4, 'Period 4', '10:45', '11:30', 'lesson', true, 5, 'Monday,Tuesday,Wednesday,Thursday,Friday'),
      (5, 'Period 5', '11:30', '12:15', 'lesson', true, 6, 'Monday,Tuesday,Wednesday,Thursday,Friday'),
      (6, 'Period 6', '12:15', '13:00', 'lesson', true, 7, 'Monday,Tuesday,Wednesday,Thursday,Friday'),
      (99, 'Lunch Interval', '13:00', '13:45', 'lunch', false, 8, 'Monday,Tuesday,Wednesday,Thursday,Friday'),
      (7, 'Period 7', '13:45', '14:30', 'lesson', true, 9, 'Monday,Tuesday,Wednesday,Thursday,Friday'),
      (8, 'Period 8', '14:30', '15:15', 'lesson', true, 10, 'Monday,Tuesday,Wednesday,Thursday,Friday');
  END IF;
END $$;
`,
  },
  {
    version: 20,
    name: 'admin_verification_sessions_and_password_hardening',
    sql: `
CREATE TABLE IF NOT EXISTS admin_verification_sessions (
  id SERIAL PRIMARY KEY,
  verify_token TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempts_remaining INTEGER NOT NULL DEFAULT 5,
  resend_count INTEGER NOT NULL DEFAULT 0,
  last_resend_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_verif_token_idx ON admin_verification_sessions (verify_token);
CREATE INDEX IF NOT EXISTS admin_verif_user_idx ON admin_verification_sessions (user_id);
`,
  },
];

async function executeSql(sql: string): Promise<void> {
  if (global._pgliteInstance) {
    await global._pgliteInstance.exec(sql);
  } else if (typeof (pool as any).exec === 'function') {
    await (pool as any).exec(sql);
  } else {
    await pool.query(sql);
  }
}

async function querySql(sql: string, params?: any[]): Promise<any> {
  if (global._pgliteInstance) {
    return await global._pgliteInstance.query(sql, params);
  }
  return await pool.query(sql, params);
}

/**
 * Runs all pending versioned migrations in ascending sequence.
 * Fails startup with an explicit exception if any migration step fails.
 */
export async function runMigrations(): Promise<{ applied: number; total: number }> {
  // 1. Ensure migrations tracking table exists
  await executeSql(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // 2. Fetch applied migration versions
  const result = await querySql('SELECT version FROM schema_migrations ORDER BY version ASC');
  const appliedRows = result?.rows || result || [];
  const appliedVersions = new Set<number>(appliedRows.map((r: any) => Number(r.version)));

  // Deduplicate and sort migrations by version
  const uniqueMigrationsMap = new Map<number, Migration>();
  for (const m of MIGRATIONS) {
    if (!uniqueMigrationsMap.has(m.version)) {
      uniqueMigrationsMap.set(m.version, m);
    }
  }
  const sortedMigrations = Array.from(uniqueMigrationsMap.values()).sort((a, b) => a.version - b.version);

  let appliedCount = 0;

  for (const migration of sortedMigrations) {
    if (!appliedVersions.has(migration.version)) {
      console.log(`Applying migration ${migration.version}: ${migration.name}...`);
      try {
        await executeSql(migration.sql);
        await querySql(
          `INSERT INTO schema_migrations (version, name, applied_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name, applied_at = NOW()`,
          [migration.version, migration.name]
        );
        appliedVersions.add(migration.version);
        console.log(`✓ Migration ${migration.version} (${migration.name}) applied successfully.`);
        appliedCount++;
      } catch (err: any) {
        console.error(`FATAL: Migration failed at version ${migration.version} (${migration.name}):`, err);
        throw new Error(`Migration failure [${migration.version} - ${migration.name}]: ${err.message || err}`);
      }
    }
  }

  return { applied: appliedCount, total: sortedMigrations.length };
}
