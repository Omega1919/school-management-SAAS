import express from 'express';
import path from 'path';
import { eq } from 'drizzle-orm';
import { createServer as createViteServer } from 'vite';
import { authenticate } from './src/middleware/auth.ts';
import { validateAuthEnvironment } from './src/lib/auth.ts';
import { validateEmailEnvironment } from './src/lib/email.ts';
import { validateEnvironment } from './src/config/env.ts';
import { authRouter } from './src/routes/auth.ts';
import { studentsRouter } from './src/routes/students.ts';
import { teachersRouter } from './src/routes/teachers.ts';
import { classesRouter } from './src/routes/classes.ts';
import { academicRouter } from './src/routes/academic.ts';
import { attendanceRouter } from './src/routes/attendance.ts';
import { resultsRouter } from './src/routes/results.ts';
import { feesRouter } from './src/routes/fees.ts';
import { announcementsRouter } from './src/routes/announcements.ts';
import { auditLogsRouter } from './src/routes/audit-logs.ts';
import { dashboardRouter } from './src/routes/dashboard.ts';
import { parentsRouter } from './src/routes/parents.ts';
import { settingsRouter } from './src/routes/settings.ts';
import { homeworkRouter } from './src/routes/homework.ts';
import { communicationsRouter } from './src/routes/communications.ts';
import { searchRouter } from './src/routes/search.ts';
import { timetableRouter } from './src/routes/timetable.ts';
import { admissionsRouter } from './src/routes/admissions.ts';
import { publicPortalRouter } from './src/routes/public-portal.ts';
import { db, pool, runWithSchoolTransaction, verifyDatabase } from './src/db/index.ts';
import { schools } from './src/db/schema.ts';
import { ensureDefaultDemoData, ensureSecondaryDemoSchoolData } from './src/db/seed.ts';
import { startOverdueFeeReminderSchedule } from './src/lib/fee-reminders.ts';
import { schoolTenantMiddleware } from './src/middleware/school-tenant.ts';
import { platformRouter } from './src/routes/platform.ts';

async function startServer() {
  // Validate that critical environment secrets exist before booting services
  validateEnvironment();
  validateAuthEnvironment();
  validateEmailEnvironment();

  const app = express();

  // Baseline browser security headers. HSTS is only sent when TLS is active.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production' && req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Dev server must run on port 3000. In Cloud Run, PORT is set to 8080 which is occupied by Nginx.
  const PORT = (process.env.PORT && process.env.PORT !== '8080')
    ? parseInt(process.env.PORT, 10)
    : 3000;

  // Configure reverse proxy trust
  app.set('trust proxy', 1);

  // Body parser with size limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Platform provisioning is protected by a dedicated server-side secret and
  // runs before school tenant resolution because it creates new schools.
  app.use('/api/platform', platformRouter);

  // Resolve the school before auth or route handlers touch school-owned data.
  app.use('/api', schoolTenantMiddleware);
  app.use('/api', authenticate);

  // REST API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/teachers', teachersRouter);
  app.use('/api/classes', classesRouter);
  app.use('/api/academic', academicRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/results', resultsRouter);
  app.use('/api/fees', feesRouter);
  app.use('/api/announcements', announcementsRouter);
  app.use('/api/audit-logs', auditLogsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/parents', parentsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/homework', homeworkRouter);
  app.use('/api/communications', communicationsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/timetable', timetableRouter);
  app.use('/api/admissions', admissionsRouter);
  app.use('/api/public-portal', publicPortalRouter);

  // 404 handler for unmatched /api routes (prevents fallthrough to SPA HTML)
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });

  // Global Production-Safe API Error Handler
  app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const rawMsg = err?.message || 'Internal Server Error';
    const safeMsg = rawMsg
      .replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://***:***@')
      .replace(/(password|pwd|secret)=[^;&\s]+/gi, '$1=***');

    console.error('Unhandled API Exception:', safeMsg);
    const isProd = process.env.NODE_ENV === 'production';
    const statusCode = typeof err.status === 'number' && err.status >= 400 && err.status < 600
      ? err.status
      : 500;
    // Never leak stack traces, SQL internals, or sensitive system details in production
    const message = isProd && statusCode === 500
      ? 'An unexpected error occurred while processing your request. Please contact technical support.'
      : safeMsg;
    res.status(statusCode).json({ error: message });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Database connectivity verification & local embedded demo data initialization.
  // Never seed a configured PostgreSQL database during normal application startup.
  try {
    await verifyDatabase();
    const explicitDemoSetup = [
      process.env.ENABLE_DEMO_LOGINS,
      process.env.DEMO_MODE,
      process.env.SEED_DEMO_DATA,
      process.env.ALLOW_DEMO,
    ].includes('true');
    if ((pool as any)?.isPglite || explicitDemoSetup) {
      const [defaultSchool] = await db.select({ id: schools.id }).from(schools)
        .where(eq(schools.slug, process.env.DEFAULT_SCHOOL_SLUG || 'springfield')).limit(1);
      if (defaultSchool) {
        await runWithSchoolTransaction(defaultSchool.id, () => ensureDefaultDemoData());
      }
      if ((pool as any)?.isPglite) {
        await ensureSecondaryDemoSchoolData();
      }
    }
    startOverdueFeeReminderSchedule();
  } catch (err: any) {
    console.error('Fatal initialization error: database verification failed:', err.message);
    process.exit(1);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`  School Management System running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
