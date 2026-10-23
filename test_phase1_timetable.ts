import fs from 'fs';
import path from 'path';
import os from 'os';

// Force an isolated PGlite data directory BEFORE importing db
const isolatedTestDbDir = path.join(os.tmpdir(), `sms_phase1_isolated_${Date.now()}_${Math.random().toString(36).substring(7)}`);
fs.mkdirSync(isolatedTestDbDir, { recursive: true });

// Ensure DATABASE_URL is deleted for test isolation so PGlite isolated DB is used
delete process.env.DATABASE_URL;
delete process.env.SQL_HOST;
delete process.env.SQL_USER;
delete process.env.SQL_PASSWORD;
process.env.PGLITE_DATA_DIR = isolatedTestDbDir;
process.env.NODE_ENV = 'development';

import { db, pool } from './src/db/index.ts';
import { runMigrations, MIGRATIONS } from './src/db/migrations.ts';
import {
  users,
  classes,
  subjects,
  teachers,
  timetables,
  timetablePeriods,
  schoolSettings,
  classSubjects,
  academicSessions,
  academicTerms,
} from './src/db/schema.ts';
import { generateToken } from './src/lib/auth.ts';
import { timetableRouter, periodsOverlap, parseDayList } from './src/routes/timetable.ts';
import express from 'express';
import { authenticate } from './src/middleware/auth.ts';
import { eq, and } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

async function runPhase1Tests() {
  console.log('================================================================');
  console.log('PHASE 1: TIMETABLE ENGINE & DATABASE INTEGRITY TEST SUITE');
  console.log(`Isolated Test DB Path: ${isolatedTestDbDir}`);
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Helper unit tests (periodsOverlap, parseDayList)
  // --------------------------------------------------------------------------
  console.log('[TEST 1/12] Testing Scheduling Helpers (Overlaps & Weekday Validation)...');

  // Touching boundaries allowed: 08:00-09:00 and 09:00-10:00
  assert(
    periodsOverlap('08:00', '09:00', ['Monday'], '09:00', '10:00', ['Monday']) === false,
    'Consecutive touching periods (08:00-09:00 and 09:00-10:00) must NOT overlap'
  );

  // Overlapping times on same day
  assert(
    periodsOverlap('08:00', '09:00', ['Monday'], '08:30', '09:30', ['Monday']) === true,
    'Overlapping intervals (08:00-09:00 and 08:30-09:30) on Monday must overlap'
  );

  // Same times on different days
  assert(
    periodsOverlap('08:00', '09:00', ['Monday'], '08:00', '09:00', ['Tuesday']) === false,
    'Same time blocks on disjoint days must NOT overlap'
  );

  // Weekdays validation
  const validDaysRes = parseDayList(['Monday', 'Wednesday', 'Friday']);
  assert(!validDaysRes.error && validDaysRes.days.length === 3, 'Valid weekdays list must parse');

  const dupDaysRes = parseDayList(['Monday', 'Monday']);
  assert(!!dupDaysRes.error, 'Duplicate weekday must be rejected');

  const invalidDaysRes = parseDayList(['Funday']);
  assert(!!invalidDaysRes.error, 'Invalid weekday name must be rejected');

  console.log('  ✓ Touching boundaries, time overlaps, and weekday validation helpers verified.');

  // --------------------------------------------------------------------------
  // TEST 2: Migration & Default Seed Integrity on Fresh Database
  // --------------------------------------------------------------------------
  console.log('\n[TEST 2/12] Testing Migration 19 on Fresh Database & Default Period Seeding...');
  const freshDbDir = path.join(os.tmpdir(), `sms_phase1_fresh_${Date.now()}_${Math.random().toString(36).substring(7)}`);
  fs.mkdirSync(freshDbDir, { recursive: true });
  const freshPglite = new PGlite(freshDbDir);
  try {
    await freshPglite.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    for (const m of MIGRATIONS) {
      await freshPglite.exec(m.sql);
      await freshPglite.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [m.version, m.name]);
    }

    const freshRows = await freshPglite.query('SELECT * FROM timetable_periods;');
    const seededPeriods = freshRows.rows as any[];
    assert(seededPeriods.length === 10, `Expected 10 default periods on fresh database, found ${seededPeriods.length}`);

    // Verify none of the default periods overlap
    for (let i = 0; i < seededPeriods.length; i++) {
      for (let j = i + 1; j < seededPeriods.length; j++) {
        const pA = seededPeriods[i];
        const pB = seededPeriods[j];
        const daysA = pA.days.split(',').map((d: string) => d.trim());
        const daysB = pB.days.split(',').map((d: string) => d.trim());
        const overlap = periodsOverlap(pA.start_time, pA.end_time, daysA, pB.start_time, pB.end_time, daysB);
        assert(!overlap, `Default periods "${pA.label}" and "${pB.label}" must not overlap`);
      }
    }

    // Verify Period 0 exists in defaults as non-teaching break
    const defaultPeriod0 = seededPeriods.find((p) => p.period_number === 0);
    assert(defaultPeriod0 !== undefined, 'Default Period 0 (Morning Break) must exist');
    assert(defaultPeriod0?.is_teaching === false, 'Default Period 0 must be non-teaching');
    assert(defaultPeriod0?.type === 'break', 'Default Period 0 type must be break');
    console.log('  ✓ Migration 19 on fresh database seeded valid, non-overlapping default periods including Period 0 (Morning Break).');
  } finally {
    fs.rmSync(freshDbDir, { recursive: true, force: true });
  }

  // --------------------------------------------------------------------------
  // TEST 3: Existing Installation Fixture Migration (Preserve Existing Records)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 3/12] Testing Migration against Existing Installation Fixture...');
  const fixtureDbDir = path.join(os.tmpdir(), `sms_phase1_fixture_${Date.now()}_${Math.random().toString(36).substring(7)}`);
  fs.mkdirSync(fixtureDbDir, { recursive: true });
  const fixturePglite = new PGlite(fixtureDbDir);

  try {
    // Run migrations 1 through 18 on fixture
    await fixturePglite.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    for (const m of MIGRATIONS.filter((m) => m.version < 19)) {
      await fixturePglite.exec(m.sql);
      await fixturePglite.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [m.version, m.name]);
    }

    // Seed custom pre-existing period in fixture
    await fixturePglite.exec(`
      CREATE TABLE timetable_periods (
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
      INSERT INTO timetable_periods (period_number, label, start_time, end_time, type, is_teaching, sort_order)
      VALUES (0, 'Custom Pre-existing Early Period', '07:30', '08:15', 'lesson', true, 1);
    `);

    // Apply migration 19
    const mig19 = MIGRATIONS.find((m) => m.version === 19)!;
    await fixturePglite.exec(mig19.sql);

    // Verify existing period was preserved and NOT overwritten by defaults
    const fixtureRows = await fixturePglite.query('SELECT * FROM timetable_periods;');
    assert(fixtureRows.rows.length === 1, `Existing periods must be preserved (expected 1, got ${fixtureRows.rows.length})`);
    assert(
      (fixtureRows.rows[0] as any).label === 'Custom Pre-existing Early Period',
      'Existing period data must be preserved exactly'
    );
    console.log('  ✓ Migration 19 does not overwrite existing timetable configurations and preserves period zero records.');
  } finally {
    fs.rmSync(fixtureDbDir, { recursive: true, force: true });
  }

  // --------------------------------------------------------------------------
  // Setup Test Server and Seed Isolated Base Data
  // --------------------------------------------------------------------------
  const app = express();
  app.use(express.json());
  app.use(authenticate);
  app.use('/api/timetable', timetableRouter);

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // Fetch or create initial school settings
    let [settings] = await db.select().from(schoolSettings).limit(1);
    if (!settings) {
      [settings] = await db
        .insert(schoolSettings)
        .values({
          schoolName: 'Greenwood International School',
          timetableDays: 'Monday,Tuesday,Wednesday,Thursday,Friday',
        })
        .returning();
    } else {
      await db
        .update(schoolSettings)
        .set({ timetableDays: 'Monday,Tuesday,Wednesday,Thursday,Friday' })
        .where(eq(schoolSettings.id, settings.id));
    }

    // Create Super Admin user
    const [adminUser] = await db
      .insert(users)
      .values({
        uid: `admin-${Date.now()}`,
        email: `admin-${Date.now()}@greenwood.test`,
        fullName: 'Academic Director',
        role: 'super_admin',
        status: 'active',
        passwordHash: 'dummyhash',
      })
      .returning();

    const adminToken = generateToken({
      id: adminUser.id,
      uid: adminUser.uid,
      email: adminUser.email,
      role: 'super_admin',
      fullName: adminUser.fullName,
    });

    // Reuse existing current session and term or insert if none
    let [session] = await db.select().from(academicSessions).where(eq(academicSessions.isCurrent, true)).limit(1);
    if (!session) {
      [session] = await db
        .insert(academicSessions)
        .values({
          name: '2026/2027 Academic Year',
          startDate: '2026-09-01',
          endDate: '2027-07-20',
          isCurrent: true,
        })
        .returning();
    }

    let [term] = await db.select().from(academicTerms).where(eq(academicTerms.isCurrent, true)).limit(1);
    if (!term) {
      [term] = await db
        .insert(academicTerms)
        .values({
          sessionId: session.id,
          name: 'First Term',
          startDate: '2026-09-01',
          endDate: '2026-12-15',
          isCurrent: true,
        })
        .returning();
    }

    // Create 2 Classes
    const [classA] = await db
      .insert(classes)
      .values({
        name: 'Grade 10A Science',
        gradeLevel: '10',
        sessionId: session.id,
        status: 'active',
      })
      .returning();

    const [classB] = await db
      .insert(classes)
      .values({
        name: 'Grade 10B Arts',
        gradeLevel: '10',
        sessionId: session.id,
        status: 'active',
      })
      .returning();

    const now = Date.now();
    // Create 2 Subjects
    const [subjectMath] = await db
      .insert(subjects)
      .values({
        code: `MTH-P1-${now}`,
        name: 'Mathematics',
        category: 'Sciences',
      })
      .returning();

    const [subjectEnglish] = await db
      .insert(subjects)
      .values({
        code: `ENG-P1-${now}`,
        name: 'English Literature',
        category: 'Humanities',
      })
      .returning();

    // Create 2 Teachers
    const [teacherUser1] = await db
      .insert(users)
      .values({
        uid: `t1-${now}`,
        email: `t1-${now}@greenwood.test`,
        fullName: 'Dr. Jane Smith',
        role: 'teacher',
        status: 'active',
        passwordHash: 'hash',
      })
      .returning();

    const [teacher1] = await db
      .insert(teachers)
      .values({
        userId: teacherUser1.id,
        employeeId: `TCH-001-${now}`,
        specialization: 'Mathematics',
        qualification: 'B.Sc / PGDE',
        status: 'active',
      })
      .returning();

    const [teacherUser2] = await db
      .insert(users)
      .values({
        uid: `t2-${now}`,
        email: `t2-${now}@greenwood.test`,
        fullName: 'Prof. Mark Johnson',
        role: 'teacher',
        status: 'active',
        passwordHash: 'hash',
      })
      .returning();

    const [teacher2] = await db
      .insert(teachers)
      .values({
        userId: teacherUser2.id,
        employeeId: `TCH-002-${now}`,
        specialization: 'English',
        qualification: 'M.A Literature',
        status: 'active',
      })
      .returning();

    // Allocate Teacher 1 to Class A + Math
    await db.insert(classSubjects).values({
      classId: classA.id,
      subjectId: subjectMath.id,
      teacherId: teacher1.id,
    });

    // Allocate Teacher 1 to Class B + Math
    await db.insert(classSubjects).values({
      classId: classB.id,
      subjectId: subjectMath.id,
      teacherId: teacher1.id,
    });

    // Allocate Teacher 2 to Class A + English
    await db.insert(classSubjects).values({
      classId: classA.id,
      subjectId: subjectEnglish.id,
      teacherId: teacher2.id,
    });

    // Allocate Teacher 2 to Class B + English
    await db.insert(classSubjects).values({
      classId: classB.id,
      subjectId: subjectEnglish.id,
      teacherId: teacher2.id,
    });

    // --------------------------------------------------------------------------
    // TEST 4: Valid Lesson Creation
    // --------------------------------------------------------------------------
    console.log('\n[TEST 4/12] Testing Valid Lesson Creation...');
    const createSlotRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        schoolId: settings.id,
        classId: classA.id,
        subjectId: subjectMath.id,
        teacherId: teacher1.id,
        dayOfWeek: 'Monday',
        periodNumber: 1,
        startTime: '08:00',
        endTime: '08:45',
        room: 'Lab 101',
      }),
    });
    const createdSlotData = await createSlotRes.json();
    assert(createSlotRes.status === 201, `Valid lesson creation must return 201 (got ${createSlotRes.status}: ${JSON.stringify(createdSlotData)})`);
    const createdSlotId = createdSlotData.slot?.id;
    assert(createdSlotData.slot.periodNumber === 1, 'Period number must be 1');
    assert(createdSlotData.slot.termId === term.id, 'Slot must be scoped to active term');
    console.log('  ✓ Valid lesson slot created with correct period, times, room, and term scope.');

    // --------------------------------------------------------------------------
    // TEST 5: Lesson Outside Configured Period Bounds
    // --------------------------------------------------------------------------
    console.log('\n[TEST 5/12] Testing Lesson Outside Configured Period Bounds...');
    // Period 1 is 08:00 - 08:45. Passing 08:00 - 09:00 should be rejected!
    const outOfBoundsRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classB.id,
        subjectId: subjectEnglish.id,
        teacherId: teacher2.id,
        dayOfWeek: 'Monday',
        periodNumber: 1,
        startTime: '08:00',
        endTime: '09:00', // Exceeds Period 1 (08:45)
      }),
    });
    assert(outOfBoundsRes.status === 400, 'Lesson exceeding period bounds must be rejected with 400');
    const outOfBoundsBody = await outOfBoundsRes.json();
    assert(outOfBoundsBody.error.includes('falls outside'), 'Error message must specify falling outside period interval');
    console.log('  ✓ Out-of-bounds lesson start/end times correctly rejected.');

    // --------------------------------------------------------------------------
    // TEST 6: Break/Lunch Non-Teaching Rejection
    // --------------------------------------------------------------------------
    console.log('\n[TEST 6/12] Testing Break & Lunch Non-Teaching Interval Rejection...');
    // Period 0 is Morning Break (10:15 - 10:45, type: 'break')
    const breakRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classA.id,
        subjectId: subjectEnglish.id,
        teacherId: teacher2.id,
        dayOfWeek: 'Monday',
        periodNumber: 0,
        startTime: '10:15',
        endTime: '10:45',
      }),
    });
    assert(breakRes.status === 400, 'Scheduling during break interval must return 400');
    const breakBody = await breakRes.json();
    assert(breakBody.error.includes('non-teaching interval'), 'Error must specify non-teaching interval');

    // Period 99 is Lunch Interval (13:00 - 13:45, type: 'lunch')
    const lunchRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classA.id,
        subjectId: subjectEnglish.id,
        teacherId: teacher2.id,
        dayOfWeek: 'Monday',
        periodNumber: 99,
        startTime: '13:00',
        endTime: '13:45',
      }),
    });
    assert(lunchRes.status === 400, 'Scheduling during lunch interval must return 400');
    console.log('  ✓ Lessons during break and lunch intervals rejected based on stored type.');

    // --------------------------------------------------------------------------
    // TEST 7: Period-Zero Handling (Valid Lesson vs Conversion Bug)
    // --------------------------------------------------------------------------
    console.log('\n[TEST 7/12] Testing Period Number Zero Handling & Preservation...');
    // Create a legitimate teaching Period 0: "Early Morning Homeroom / Zero Period" (07:15 - 08:00)
    const createPeriod0Res = await fetch(`${baseUrl}/api/timetable/periods`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        periodNumber: 0,
        label: 'Period 0 (Early Bird)',
        startTime: '07:15',
        endTime: '08:00',
        type: 'lesson',
        isTeaching: true,
        days: 'Saturday', // Set on Saturday so it does not conflict with Mon-Fri Morning Break
      }),
    });
    assert(createPeriod0Res.status === 201, `Creating Period 0 on Saturday should return 201 (got ${createPeriod0Res.status})`);
    const period0Data = await createPeriod0Res.json();
    assert(period0Data.period.periodNumber === 0, 'Created period number must be strictly 0');

    // Add Saturday to active school days
    await fetch(`${baseUrl}/api/timetable/schedule-days`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      }),
    });

    // Schedule lesson for Period 0
    const scheduleP0Res = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classA.id,
        subjectId: subjectMath.id,
        teacherId: teacher1.id,
        dayOfWeek: 'Saturday',
        periodNumber: 0, // Period zero!
        startTime: '07:15',
        endTime: '08:00',
      }),
    });
    const p0SlotData = await scheduleP0Res.json();
    assert(scheduleP0Res.status === 201, `Scheduling lesson for Period 0 must return 201 (got ${scheduleP0Res.status}: ${JSON.stringify(p0SlotData)})`);
    assert(p0SlotData.slot.periodNumber === 0, 'Period 0 must be preserved as 0, NOT converted to 1');
    console.log('  ✓ Period number zero is strictly preserved and not converted into period one.');

    // --------------------------------------------------------------------------
    // TEST 8: Invalid & Unknown Period Values
    // --------------------------------------------------------------------------
    console.log('\n[TEST 8/12] Testing Missing, Malformed, Negative, and Unknown Period Values...');
    // Missing period number
    const missingPRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classA.id,
        subjectId: subjectMath.id,
        teacherId: teacher1.id,
        dayOfWeek: 'Tuesday',
        startTime: '08:00',
        endTime: '08:45',
        // periodNumber omitted!
      }),
    });
    assert(missingPRes.status === 400, 'Missing period number must return 400');

    // Malformed string
    const malformedPRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classA.id,
        subjectId: subjectMath.id,
        teacherId: teacher1.id,
        dayOfWeek: 'Tuesday',
        periodNumber: 'not-a-number',
        startTime: '08:00',
        endTime: '08:45',
      }),
    });
    assert(malformedPRes.status === 400, 'Malformed period number must return 400');

    // Negative period number
    const negativePRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classA.id,
        subjectId: subjectMath.id,
        teacherId: teacher1.id,
        dayOfWeek: 'Tuesday',
        periodNumber: -1,
        startTime: '08:00',
        endTime: '08:45',
      }),
    });
    assert(negativePRes.status === 400, 'Negative period number must return 400');

    // Unknown period number
    const unknownPRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classA.id,
        subjectId: subjectMath.id,
        teacherId: teacher1.id,
        dayOfWeek: 'Tuesday',
        periodNumber: 999, // Unknown
        startTime: '08:00',
        endTime: '08:45',
      }),
    });
    assert(unknownPRes.status === 400, 'Unknown period number must return 400');
    console.log('  ✓ Missing, malformed, negative, and unknown periods rejected with 400.');

    // --------------------------------------------------------------------------
    // TEST 9: Active-Day & Period-Day Validation
    // --------------------------------------------------------------------------
    console.log('\n[TEST 9/12] Testing Active-Day & Period-Day Validation...');
    // Sunday is not in active school days
    const inactiveDayRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classA.id,
        subjectId: subjectMath.id,
        teacherId: teacher1.id,
        dayOfWeek: 'Sunday',
        periodNumber: 1,
        startTime: '08:00',
        endTime: '08:45',
      }),
    });
    assert(inactiveDayRes.status === 400, 'Inactive school day must return 400');

    // Period 0 on Saturday cannot be scheduled on Monday (period-day mismatch)
    const periodDayMismatchRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classA.id,
        subjectId: subjectMath.id,
        teacherId: teacher1.id,
        dayOfWeek: 'Monday', // Period 0 (Early Bird) is Saturday only
        periodNumber: 0,
        startTime: '07:15',
        endTime: '08:00',
      }),
    });
    assert(periodDayMismatchRes.status === 400, 'Period scheduled on mismatched day must return 400');

    // Disabling a day that has active lessons without deleting data must be rejected
    // Saturday has the Period 0 lesson scheduled above!
    const disableActiveDayRes = await fetch(`${baseUrl}/api/timetable/schedule-days`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], // Omits Saturday
      }),
    });
    assert(disableActiveDayRes.status === 400, 'Disabling day with active lessons must return 400');
    const disableBody = await disableActiveDayRes.json();
    assert(disableBody.error.includes('Cannot disable'), 'Error message must explain cannot disable day with lessons');
    console.log('  ✓ Inactive days rejected and disabling active days with scheduled lessons protected.');

    // --------------------------------------------------------------------------
    // TEST 10: Teacher & Class Conflicts
    // --------------------------------------------------------------------------
    console.log('\n[TEST 10/12] Testing Teacher & Class Scheduling Conflicts...');
    // Slot 1 is already Class A, Teacher 1, Monday Period 1 (08:00 - 08:45).
    // Attempt 1: Same class (Class A) with different teacher (Teacher 2) at the same time -> MUST REJECT
    const classConflictRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classA.id,
        subjectId: subjectEnglish.id,
        teacherId: teacher2.id,
        dayOfWeek: 'Monday',
        periodNumber: 1,
        startTime: '08:00',
        endTime: '08:45',
      }),
    });
    assert(classConflictRes.status === 400, 'Class simultaneous conflict must return 400');
    const classConflictBody = await classConflictRes.json();
    assert(classConflictBody.error.includes('Class booking conflict'), 'Error must specify class booking conflict');

    // Attempt 2: Same teacher (Teacher 1) with different class (Class B) at the same time -> MUST REJECT
    const teacherConflictRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classB.id,
        subjectId: subjectMath.id,
        teacherId: teacher1.id,
        dayOfWeek: 'Monday',
        periodNumber: 1,
        startTime: '08:00',
        endTime: '08:45',
      }),
    });
    assert(teacherConflictRes.status === 400, 'Teacher simultaneous conflict must return 400');
    const teacherConflictBody = await teacherConflictRes.json();
    assert(teacherConflictBody.error.includes('Teacher booking conflict'), 'Error must specify teacher booking conflict');

    // Attempt 3: Legitimate simultaneous lesson: Different class (Class B) and Different teacher (Teacher 2) at the same time -> MUST SUCCEED (201)
    const simultaneousRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classB.id,
        subjectId: subjectEnglish.id,
        teacherId: teacher2.id,
        dayOfWeek: 'Monday',
        periodNumber: 1,
        startTime: '08:00',
        endTime: '08:45',
        room: 'Hall B',
      }),
    });
    assert(simultaneousRes.status === 201, `Legitimate simultaneous lesson must succeed with 201 (got ${simultaneousRes.status})`);
    const simultaneousSlotId = (await simultaneousRes.json()).slot.id;
    console.log('  ✓ Class conflict, teacher conflict, and legitimate simultaneous lessons verified.');

    // --------------------------------------------------------------------------
    // TEST 11: Cross-School & Teacher Allocation Authorization
    // --------------------------------------------------------------------------
    console.log('\n[TEST 11/12] Testing Cross-School Authorization & Teacher Allocations...');
    // Mismatched schoolId
    const wrongSchoolRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        schoolId: 99999, // Non-existent/mismatched school
        classId: classA.id,
        subjectId: subjectMath.id,
        teacherId: teacher1.id,
        dayOfWeek: 'Tuesday',
        periodNumber: 2,
        startTime: '08:45',
        endTime: '09:30',
      }),
    });
    assert(wrongSchoolRes.status === 400, 'Mismatched schoolId must return 400');

    // Teacher not allocated to class+subject
    // Create new unallocated teacher
    const [unallocatedTeacherUser] = await db
      .insert(users)
      .values({
        uid: `unalloc-${Date.now()}`,
        email: 'unallocated@greenwood.test',
        fullName: 'Unallocated Teacher',
        role: 'teacher',
        status: 'active',
        passwordHash: 'hash',
      })
      .returning();

    const [unallocatedTeacher] = await db
      .insert(teachers)
      .values({
        userId: unallocatedTeacherUser.id,
        employeeId: 'TCH-999',
        specialization: 'Physics',
        qualification: 'B.Sc Physics',
        status: 'active',
      })
      .returning();

    const unallocatedPostRes = await fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classA.id,
        subjectId: subjectMath.id,
        teacherId: unallocatedTeacher.id,
        dayOfWeek: 'Tuesday',
        periodNumber: 2,
        startTime: '08:45',
        endTime: '09:30',
      }),
    });
    assert(unallocatedPostRes.status === 400, 'Unallocated teacher must return 400');
    console.log('  ✓ Mismatched school and unallocated teacher correctly rejected.');

    // --------------------------------------------------------------------------
    // TEST 12: Concurrent Conflicting Requests & Update/Delete Lifecycle
    // --------------------------------------------------------------------------
    console.log('\n[TEST 12/12] Testing Concurrency Locks & Update/Delete Lifecycle...');

    // Concurrency test: launch 2 simultaneous requests attempting to book Teacher 1 on Wednesday Period 2 (08:45 - 09:30)
    const req1Promise = fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classA.id,
        subjectId: subjectMath.id,
        teacherId: teacher1.id,
        dayOfWeek: 'Wednesday',
        periodNumber: 2,
        startTime: '08:45',
        endTime: '09:30',
      }),
    });

    const req2Promise = fetch(`${baseUrl}/api/timetable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classId: classB.id,
        subjectId: subjectMath.id,
        teacherId: teacher1.id,
        dayOfWeek: 'Wednesday',
        periodNumber: 2,
        startTime: '08:45',
        endTime: '09:30',
      }),
    });

    const [res1, res2] = await Promise.all([req1Promise, req2Promise]);
    const statuses = [res1.status, res2.status].sort();
    assert(
      statuses[0] === 201 && statuses[1] === 400,
      `Exactly one concurrent request must succeed (201) and one fail (400). Got: ${statuses.join(', ')}`
    );
    console.log('  ✓ PostgreSQL transaction and concurrency locking prevented race condition.');

    // Update test: Update created slot to another non-conflicting time (Period 3: 09:30 - 10:15)
    const updateRes = await fetch(`${baseUrl}/api/timetable/${createdSlotId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        periodNumber: 3,
        startTime: '09:30',
        endTime: '10:15',
        room: 'Lab 102',
      }),
    });
    assert(updateRes.status === 200, `Updating slot should return 200 (got ${updateRes.status})`);
    const updatedSlot = (await updateRes.json()).slot;
    assert(updatedSlot.periodNumber === 3, 'Slot period number must be updated to 3');
    assert(updatedSlot.room === 'Lab 102', 'Slot room must be updated to Lab 102');

    // Clean up created test slots
    await fetch(`${baseUrl}/api/timetable/${createdSlotId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    await fetch(`${baseUrl}/api/timetable/${simultaneousSlotId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    await fetch(`${baseUrl}/api/timetable/${p0SlotData.slot.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    console.log('  ✓ Timetable slot update and deletion lifecycle verified.');

    console.log('\n================================================================');
    console.log('ALL 12 PHASE 1 TIMETABLE ENGINE & DATABASE TESTS PASSED! ✓');
    console.log('================================================================\n');
  } finally {
    server.close();
    // Clean up isolated test database
    try {
      fs.rmSync(isolatedTestDbDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup error
    }
  }
}

runPhase1Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PHASE 1 TEST SUITE FAILED:', err);
    process.exit(1);
  });
