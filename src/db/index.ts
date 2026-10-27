import 'dotenv/config';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
const { Pool } = pg;
import * as schema from './schema.ts';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';

declare global {
  var _postgresPool: any;
  var _drizzleDb: any;
  var _pgliteInstance: any;
  var _pgliteTenantRoleReady: boolean;
}

export const createPool = () => {
  const isProd = process.env.NODE_ENV === 'production';

  if (global._postgresPool) {
    if (isProd && global._postgresPool.isPglite) {
      throw new Error(
        'FATAL: PGlite embedded database fallback is strictly forbidden in production. PostgreSQL connection (DATABASE_URL) is mandatory.'
      );
    }
    return global._postgresPool;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const sqlHost = process.env.SQL_HOST?.trim();
  const sqlUser = process.env.SQL_USER?.trim();
  const sqlPassword = process.env.SQL_PASSWORD;
  const sqlDbName = process.env.SQL_DB_NAME?.trim() || 'postgres';
  const sqlPort = parseInt(process.env.SQL_PORT?.trim() || '5432', 10);

  if (databaseUrl) {
    const pgPool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 5000,
    });

    pgPool.on('error', (err: any) => {
      const safeMsg = (err?.message || '').replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://***:***@');
      console.warn('Notice: Postgres connection reset or idle timeout:', safeMsg);
    });

    global._postgresPool = pgPool;
    return global._postgresPool;
  } else if (sqlHost && sqlUser && sqlPassword) {
    const pgPool = new Pool({
      host: sqlHost,
      port: sqlPort,
      user: sqlUser,
      password: sqlPassword,
      database: sqlDbName,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 5000,
    });

    pgPool.on('error', (err: any) => {
      const safeMsg = (err?.message || '').replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://***:***@');
      console.warn('Notice: Postgres connection reset or idle timeout:', safeMsg);
    });

    global._postgresPool = pgPool;
    return global._postgresPool;
  }

  // In production, failure is mandatory and immediate:
  if (isProd) {
    throw new Error(
      'FATAL: PostgreSQL configuration is mandatory in production (DATABASE_URL or SQL_HOST/SQL_USER/SQL_PASSWORD). PGlite embedded database fallback is strictly forbidden in production.'
    );
  }

  // Development/Test fallback: embedded PGlite in persistent/temp directory
  const dataDir = process.env.PGLITE_DATA_DIR?.trim() || path.join(os.tmpdir(), 'sms_pglite_db');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  } else {
    // Clean up stale lock files from killed node processes
    const pidFile = path.join(dataDir, 'postmaster.pid');
    if (fs.existsSync(pidFile)) {
      try {
        fs.unlinkSync(pidFile);
      } catch (e) {
        // Ignore if locked by active process
      }
    }
  }

  if (!global._pgliteInstance) {
    try {
      const pidFile = path.join(dataDir, 'postmaster.pid');
      if (fs.existsSync(pidFile)) {
        try { fs.unlinkSync(pidFile); } catch (e) {}
      }
      global._pgliteInstance = new PGlite(dataDir);
    } catch (initErr) {
      console.warn('Notice: Corrupted local embedded database files detected, resetting data directory for clean startup...', initErr);
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
        fs.mkdirSync(dataDir, { recursive: true });
        global._pgliteInstance = new PGlite(dataDir);
      } catch (fallbackErr) {
        console.warn('Falling back to in-memory PGlite instance:', fallbackErr);
        global._pgliteInstance = new PGlite();
      }
    }
  }

  // Wrapper pool object for compatibility
  global._postgresPool = {
    query: async (text: string, params?: any[]) => {
      if (global._pgliteInstance?.waitReady) {
        await global._pgliteInstance.waitReady;
      }
      return await global._pgliteInstance.query(text, params);
    },
    exec: async (sql: string) => {
      if (global._pgliteInstance?.waitReady) {
        await global._pgliteInstance.waitReady;
      }
      return await global._pgliteInstance.exec(sql);
    },
    isPglite: true,
  };

  return global._postgresPool;
};

export const pool = createPool();

export const getDb = () => {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && global._pgliteInstance) {
    throw new Error(
      'FATAL: PGlite embedded database fallback is strictly forbidden in production. PostgreSQL connection (DATABASE_URL) is mandatory.'
    );
  }

  if (global._drizzleDb) {
    return global._drizzleDb;
  }

  if (global._pgliteInstance) {
    if (isProd) {
      throw new Error(
        'FATAL: PGlite embedded database fallback is strictly forbidden in production. PostgreSQL connection (DATABASE_URL) is mandatory.'
      );
    }
    global._drizzleDb = drizzlePglite(global._pgliteInstance, { schema });
  } else {
    global._drizzleDb = drizzlePg(pool, { schema });
  }
  return global._drizzleDb;
};

const baseDb = getDb();
const schoolTransaction = new AsyncLocalStorage<any>();
const schoolIdContext = new AsyncLocalStorage<number>();

// Existing routes keep using the `db` export. During API requests it resolves
// to that request's transaction, where PostgreSQL row security is active.
export const db = new Proxy(baseDb as any, {
  get(target, property) {
    const currentDb = schoolTransaction.getStore() ?? target;
    const value = Reflect.get(currentDb, property, currentDb);
    return typeof value === 'function' ? value.bind(currentDb) : value;
  },
});

export function getCurrentSchoolId(): number | undefined {
  return schoolIdContext.getStore();
}

export async function runWithSchoolContext<T>(schoolId: number, callback: (release: () => void) => Promise<T>): Promise<T> {
  return schoolIdContext.run(schoolId, () => baseDb.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT set_config('app.school_id', ${String(schoolId)}, true)`);
      if (global._pgliteInstance) {
        // PGlite runs as a superuser by default, which bypasses RLS. Use a
        // restricted local role so development exercises production row security.
        await tx.execute(sql`SET LOCAL ROLE sms_app_runtime`);
      }
      let releaseTransaction!: () => void;
      const released = new Promise<void>((resolve) => { releaseTransaction = resolve; });
      const release = () => releaseTransaction();
      const result = await schoolTransaction.run(tx, () => callback(release));
      await released;
      return result;
    }));
}

export async function runWithSchoolTransaction<T>(schoolId: number, callback: () => Promise<T>): Promise<T> {
  return runWithSchoolContext(schoolId, async (release) => {
    try { return await callback(); } finally { release(); }
  });
}

/**
 * Execute a database operation with automatic retry on transient socket/connection drops
 */
export async function withDbRetry<T>(operation: () => Promise<T>, maxRetries = 2): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (err: any) {
      attempt++;
      const isTransientConnectionError =
        err?.message?.includes('Connection terminated unexpectedly') ||
        err?.message?.includes('connection terminated') ||
        err?.message?.includes('ECONNRESET') ||
        err?.message?.includes('socket has been ended') ||
        err?.code === 'ECONNRESET' ||
        err?.code === '57P01';
      if (isTransientConnectionError && attempt <= maxRetries) {
        console.warn(`Transient database connection drop encountered (attempt ${attempt}/${maxRetries}), retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Startup database connection verification
 * Verifies connectivity and ensures relational tables exist.
 * Startup NEVER seeds demo users or dummy records automatically.
 */
export async function verifyDatabase(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && (global._pgliteInstance || (pool as any)?.isPglite)) {
    throw new Error(
      'FATAL: PGlite embedded database fallback is strictly forbidden in production. PostgreSQL connection (DATABASE_URL) is mandatory.'
    );
  }

  await withDbRetry(async () => {
    try {
      if (global._pgliteInstance) {
        if (global._pgliteInstance.waitReady) {
          await global._pgliteInstance.waitReady;
        }
        await global._pgliteInstance.query('SELECT 1');
      } else {
        await pool.query('SELECT 1');
      }
    } catch (err: any) {
      const safeErr = (err?.message || '').replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://***:***@');
      throw new Error(`Database verification query failed: ${safeErr}`);
    }
  });

  // Row-level security cannot protect a process using a PostgreSQL superuser
  // or a role granted BYPASSRLS, even when FORCE ROW LEVEL SECURITY is set.
  if (isProd) {
    const roleCheck = await pool.query(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
    );
    const role = roleCheck.rows?.[0];
    if (!role || role.rolsuper || role.rolbypassrls) {
      throw new Error('Multi-school security requires a PostgreSQL application role without SUPERUSER or BYPASSRLS privileges.');
    }
  }

  // Execute versioned schema migrations on boot
  try {
    const { runMigrations } = await import('./migrations.ts');
    const { applied, total } = await runMigrations();
    console.log(`✓ Database schema and migrations verified (${applied} applied, ${total} total).`);
  } catch (err: any) {
    console.error('FATAL ERROR during database schema/migration verification:', err?.message || err);
    throw new Error(`Database schema/migration initialization failed: ${err?.message || err}`);
  }

  console.log('✓ Database connection established and verified.');
}
