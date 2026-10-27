import assert from 'node:assert/strict';
import { assertPostgresApplicationRoleIsSafe } from './src/db/postgres-role-check.ts';

const previousOverride = process.env.ALLOW_RLS_BYPASS_FOR_DEMO;

try {
  delete process.env.ALLOW_RLS_BYPASS_FOR_DEMO;
  assert.throws(
    () => assertPostgresApplicationRoleIsSafe({ rolsuper: false, rolbypassrls: true }),
    /Multi-school security requires a PostgreSQL application role/,
    'A BYPASSRLS role must be rejected by default.',
  );

  process.env.ALLOW_RLS_BYPASS_FOR_DEMO = 'true';
  let warning = '';
  assert.doesNotThrow(
    () => assertPostgresApplicationRoleIsSafe(
      { rolsuper: false, rolbypassrls: true },
      undefined,
      (message) => { warning = message; },
    ),
    'The exact demo override value should allow a BYPASSRLS role.',
  );
  assert.match(warning, /demo-only override/i, 'The demo override must log a clear warning.');

  process.env.ALLOW_RLS_BYPASS_FOR_DEMO = 'TRUE';
  assert.throws(
    () => assertPostgresApplicationRoleIsSafe({ rolsuper: false, rolbypassrls: true }),
    /Multi-school security requires a PostgreSQL application role/,
    'The override must require the exact lowercase string true.',
  );

  process.env.ALLOW_RLS_BYPASS_FOR_DEMO = 'true';
  assert.throws(
    () => assertPostgresApplicationRoleIsSafe({ rolsuper: true, rolbypassrls: true }, undefined, () => {}),
    /Multi-school security requires a PostgreSQL application role/,
    'The demo override must not allow a superuser role.',
  );

  console.log('PostgreSQL role-check tests passed.');
} finally {
  if (previousOverride === undefined) delete process.env.ALLOW_RLS_BYPASS_FOR_DEMO;
  else process.env.ALLOW_RLS_BYPASS_FOR_DEMO = previousOverride;
}
