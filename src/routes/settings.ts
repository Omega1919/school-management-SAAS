import { Router, Response } from 'express';
import { db } from '../db/index.ts';
import { schoolSettings } from '../db/schema.ts';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import { logAuditEvent } from '../lib/audit.ts';
import { seedInitialData } from '../db/seed.ts';
import { eq } from 'drizzle-orm';

export const settingsRouter = Router();

// Reseed academic data (Super Admin only - permanently disabled in production)
settingsRouter.post('/reseed', requireAuth, requireRole(['super_admin']), async (req: AuthRequest, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Database reseeding is permanently disabled in production environments.' });
    }
    await seedInitialData(true);
    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'DATABASE_RESEEDED',
      resource: 'database',
      details: 'Reconstructed 2-month dataset with 500 students, 30 teachers, 350 parents, and everyday attendance.',
      ipAddress: req.ip,
    });
    res.json({ success: true, message: 'Database successfully reseeded with 500 students, 30 teachers, 350 parents, and 2-month everyday attendance.' });
  } catch (error: any) {
    console.error('Reseed error:', error);
    res.status(500).json({ error: 'Failed to reseed database' });
  }
});

// 0. GET /api/settings/public - Fetch public institution info (No Auth Required)
settingsRouter.get('/public', async (_req, res: Response) => {
  try {
    const list = await db.select({
      schoolName: schoolSettings.schoolName,
      motto: schoolSettings.motto,
      currencySymbol: schoolSettings.currencySymbol,
      termSystem: schoolSettings.termSystem,
      levelSystem: schoolSettings.levelSystem,
      contactEmail: schoolSettings.contactEmail,
      contactPhone: schoolSettings.contactPhone,
      address: schoolSettings.address,
    }).from(schoolSettings).limit(1);

    if (list.length === 0) {
      return res.json({
        schoolName: 'School Management System',
        motto: 'Integrated Academic & Administrative Platform',
        currencySymbol: '$',
        termSystem: 'term',
        levelSystem: 'class',
      });
    }
    res.json(list[0]);
  } catch (error: any) {
    console.error('Fetch public settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve institution settings' });
  }
});

// 1. GET /api/settings - Fetch current school settings (Requires authentication)
settingsRouter.get('/', requireAuth, async (_req, res: Response) => {
  try {
    const list = await db.select().from(schoolSettings).limit(1);
    if (list.length === 0) {
      const [defaultSettings] = await db
        .insert(schoolSettings)
        .values({
          schoolName: 'School Management System',
          motto: 'Integrated Academic & Administrative Platform',
          currencySymbol: '$',
          termSystem: 'term',
          levelSystem: 'class',
        })
        .returning();
      return res.json(defaultSettings);
    }
    res.json(list[0]);
  } catch (error: any) {
    console.error('Fetch settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve school settings' });
  }
});

// Helper for updating settings
async function handleUpdateSettings(req: AuthRequest, res: Response) {
  try {
    const {
      schoolName,
      motto,
      currencySymbol,
      contactEmail,
      contactPhone,
      address,
      timezone,
      attendanceStartTime,
      attendanceCutoffTime,
      attendancePolicy,
      termSystem,
      levelSystem,
    } = req.body;

    if (!schoolName || !schoolName.trim()) {
      return res.status(400).json({ error: 'School name is required' });
    }

    const validTermSystems = ['term', 'semester'];
    const safeTermSystem = termSystem && validTermSystems.includes(termSystem) ? termSystem : 'term';

    const validLevelSystems = ['class', 'level', 'grade', 'cohort'];
    const safeLevelSystem = levelSystem && validLevelSystems.includes(levelSystem) ? levelSystem : 'class';
    const list = await db.select().from(schoolSettings).limit(1);
    let safeTimezone = 'Africa/Lagos';
    if (typeof timezone === 'string' && timezone.trim()) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone.trim() });
        safeTimezone = timezone.trim();
      } catch {
        return res.status(400).json({ error: 'Please choose a valid timezone.' });
      }
    } else if (list.length > 0 && list[0].timezone) {
      safeTimezone = list[0].timezone;
    }
    let updated;
    if (list.length === 0) {
      [updated] = await db
        .insert(schoolSettings)
        .values({
          schoolName: schoolName.trim(),
          motto: motto ? motto.trim() : null,
          currencySymbol: currencySymbol ? currencySymbol.trim() : '$',
          contactEmail: contactEmail ? contactEmail.trim() : null,
          contactPhone: contactPhone ? contactPhone.trim() : null,
          address: address ? address.trim() : null,
          timezone: safeTimezone,
          attendanceStartTime: attendanceStartTime ? attendanceStartTime.trim() : '07:30',
          attendanceCutoffTime: attendanceCutoffTime ? attendanceCutoffTime.trim() : '08:30',
          attendancePolicy: attendancePolicy ? attendancePolicy.trim() : 'flexible',
          termSystem: safeTermSystem,
          levelSystem: safeLevelSystem,
        })
        .returning();
    } else {
      [updated] = await db
        .update(schoolSettings)
        .set({
          schoolName: schoolName.trim(),
          motto: motto !== undefined ? (motto ? motto.trim() : null) : list[0].motto,
          currencySymbol: currencySymbol !== undefined ? (currencySymbol ? currencySymbol.trim() : '$') : list[0].currencySymbol,
          contactEmail: contactEmail !== undefined ? contactEmail : list[0].contactEmail,
          contactPhone: contactPhone !== undefined ? contactPhone : list[0].contactPhone,
          address: address !== undefined ? address : list[0].address,
          timezone: timezone !== undefined ? safeTimezone : list[0].timezone,
          attendanceStartTime: attendanceStartTime !== undefined ? attendanceStartTime.trim() : list[0].attendanceStartTime,
          attendanceCutoffTime: attendanceCutoffTime !== undefined ? attendanceCutoffTime.trim() : list[0].attendanceCutoffTime,
          attendancePolicy: attendancePolicy !== undefined ? attendancePolicy.trim() : list[0].attendancePolicy,
          termSystem: termSystem !== undefined ? safeTermSystem : list[0].termSystem,
          levelSystem: levelSystem !== undefined ? safeLevelSystem : list[0].levelSystem,
          updatedAt: new Date(),
        })
        .where(eq(schoolSettings.id, list[0].id))
        .returning();
    }

    await logAuditEvent({
      userId: req.user!.id,
      userEmail: req.user!.email,
      role: req.user!.role,
      action: 'SETTINGS_UPDATED',
      resource: 'settings',
      details: { schoolName, currencySymbol, termSystem: safeTermSystem, levelSystem: safeLevelSystem },
      ipAddress: req.ip,
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update school settings' });
  }
}

// 2. PUT /api/settings - Update school settings (Super Admin only)
settingsRouter.put('/', requireAuth, requireRole(['super_admin']), handleUpdateSettings);
settingsRouter.post('/', requireAuth, requireRole(['super_admin']), handleUpdateSettings);
