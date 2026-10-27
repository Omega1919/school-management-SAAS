import assert from 'node:assert/strict';
import {
  assertPostgresApplicationRoleIsSafe,
  isRlsBypassDemoModeEnabled,
} from './src/db/postgres-role-check.ts';

const previousOverride = process.env.ALLOW_RLS_BYPASS_FOR_DEMO;

try {
  delete process.env.ALLOW_RLS_BYPASS_FOR_DEMO;
  assert.equal(isRlsBypassDemoModeEnabled(), false, 'Demo mode must be off when the variable is absent.');
  assert.throws(
    () => assertPostgresApplicationRoleIsSafe({ rolsuper: false, rolbypassrls: true }),
    /Multi-school security requires a PostgreSQL application role/,
    'A BYPASSRLS role must be rejected by default.',
  );
  assert.throws(
    () => assertPostgresApplicationRoleIsSafe({ rolsuper: true, rolbypassrls: true }),
    /Multi-school security requires a PostgreSQL application role/,
    'A superuser role must be rejected by default.',
  );

  process.env.ALLOW_RLS_BYPASS_FOR_DEMO = 'true';
  assert.equal(isRlsBypassDemoModeEnabled(), true, 'The exact server-side value true enables demo mode.');
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

  assert.doesNotThrow(
    () => assertPostgresApplicationRoleIsSafe(
      { rolsuper: true, rolbypassrls: true },
      undefined,
      () => {},
    ),
    'The explicit demo override must allow an elevated PostgreSQL connection role.',
  );

  process.env.ALLOW_RLS_BYPASS_FOR_DEMO = 'TRUE';
  assert.throws(
    () => assertPostgresApplicationRoleIsSafe({ rolsuper: false, rolbypassrls: true }),
    /Multi-school security requires a PostgreSQL application role/,
    'The override must require the exact lowercase string true.',
  );

  process.env.ALLOW_RLS_BYPASS_FOR_DEMO = 'true';
  assert.throws(
    () => assertPostgresApplicationRoleIsSafe(undefined, undefined, () => {}),
    /Multi-school security requires a PostgreSQL application role/,
    'The demo override must not allow missing role verification data.',
  );

  console.log('PostgreSQL role-check tests passed.');
} finally {
  if (previousOverride === undefined) delete process.env.ALLOW_RLS_BYPASS_FOR_DEMO;
  else process.env.ALLOW_RLS_BYPASS_FOR_DEMO = previousOverride;
}
