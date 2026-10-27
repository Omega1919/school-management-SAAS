export interface PostgresRoleSecurityFlags {
  rolsuper?: boolean;
  rolbypassrls?: boolean;
}

const ROLE_SECURITY_ERROR =
  'Multi-school security requires a PostgreSQL application role without SUPERUSER or BYPASSRLS privileges.';

/** Server-side demo mode; only the exact value `true` enables the exception. */
export function isRlsBypassDemoModeEnabled(): boolean {
  return process.env.ALLOW_RLS_BYPASS_FOR_DEMO === 'true';
}

/**
 * Verify the database role used by the application. The explicit demo override
 * permits elevated roles because both SUPERUSER and BYPASSRLS bypass RLS;
 * missing role data is always rejected.
 */
export function assertPostgresApplicationRoleIsSafe(
  role: PostgresRoleSecurityFlags | undefined,
  allowRlsBypassForDemo = isRlsBypassDemoModeEnabled(),
  warn: (message: string) => void = console.warn,
): void {
  if (allowRlsBypassForDemo) {
    warn(
      'WARNING: ALLOW_RLS_BYPASS_FOR_DEMO=true is active. This demo-only override permits a PostgreSQL SUPERUSER or BYPASSRLS role. Do not use it with real school data.',
    );
  }

  if (!role || (role.rolsuper && !allowRlsBypassForDemo)) {
    throw new Error(ROLE_SECURITY_ERROR);
  }

  if (role.rolbypassrls && !allowRlsBypassForDemo) {
    throw new Error(ROLE_SECURITY_ERROR);
  }
}
