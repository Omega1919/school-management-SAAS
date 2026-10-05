import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { authenticate } from './src/middleware/auth.ts';
import { validateAuthEnvironment } from './src/lib/auth.ts';
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
import { verifyDatabase } from './src/db/index.ts';
import { ensureDefaultDemoData } from './src/db/seed.ts';

async function startServer() {
  // Validate that critical environment secrets exist before booting services
  validateEnvironment();
  validateAuthEnvironment();

  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Configure reverse proxy trust
  app.set('trust proxy', 1);

  // Body parser with size limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Global auth token extractor
  app.use(authenticate);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

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

  // Database connectivity verification & baseline demo account verification
  try {
    await verifyDatabase();
    if (process.env.NODE_ENV !== 'production') {
      await ensureDefaultDemoData();
    }
  } catch (err: any) {
    console.error('Fatal initialization error: database verification failed:', err.message);
    process.exit(1);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`  School Management System running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
