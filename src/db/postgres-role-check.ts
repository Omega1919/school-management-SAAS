export interface PostgresRoleSecurityFlags {
  rolsuper?: boolean;
  rolbypassrls?: boolean;
}

const ROLE_SECURITY_ERROR =
  'Multi-school security requires a PostgreSQL application role without SUPERUSER or BYPASSRLS privileges.';

/**
 * Verify the database role used by the application. The demo override is
 * intentionally limited to BYPASSRLS; superuser roles and missing role data
 * are always rejected.
 */
export function assertPostgresApplicationRoleIsSafe(
  role: PostgresRoleSecurityFlags | undefined,
  allowRlsBypassForDemo = process.env.ALLOW_RLS_BYPASS_FOR_DEMO === 'true',
  warn: (message: string) => void = console.warn,
): void {
  if (allowRlsBypassForDemo) {
    warn(
      'WARNING: ALLOW_RLS_BYPASS_FOR_DEMO=true is active. This demo-only override permits a PostgreSQL role with BYPASSRLS. Do not use it with real school data.',
    );
  }

  if (!role || role.rolsuper) {
    throw new Error(ROLE_SECURITY_ERROR);
  }

  if (role.rolbypassrls && !allowRlsBypassForDemo) {
    throw new Error(ROLE_SECURITY_ERROR);
  }
}
