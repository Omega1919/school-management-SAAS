/**
 * Centralized Production Environment Validation
 * Ensures mandatory production configurations exist before boot and fails fast if missing or insecure.
 * Never prints or leaks secret values in error messages.
 */

export interface EnvValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateEnvironment(): EnvValidationResult {
  const isProd = process.env.NODE_ENV === 'production';
  const errors: string[] = [];

  const jwtSecret = process.env.JWT_SECRET?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const sqlHost = process.env.SQL_HOST?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

  if (isProd) {
    // 1. Mandatory Cryptographically Strong JWT Secret in Production
    if (!jwtSecret) {
      errors.push('FATAL: JWT_SECRET environment variable is missing in production.');
    } else if (jwtSecret.length < 32) {
      errors.push(`FATAL: JWT_SECRET in production must be at least 32 characters (current length: ${jwtSecret.length}).`);
    }

    // 2. Mandatory PostgreSQL Database Configuration in Production
    if (!databaseUrl && !sqlHost) {
      errors.push('FATAL: PostgreSQL configuration (DATABASE_URL or SQL_HOST) is mandatory in production. PGlite embedded database fallback is strictly forbidden in production.');
    }

    // 3. Admin Bootstrap Password Security
    if (adminPassword && adminPassword.length < 12) {
      errors.push(`FATAL: ADMIN_PASSWORD in production must be at least 12 characters (current length: ${adminPassword.length}).`);
    }
  } else {
    // Development/Test Environment Validation Warnings
    if (jwtSecret && jwtSecret.length < 16) {
      errors.push(`WARNING: JWT_SECRET is shorter than 16 characters (${jwtSecret.length}).`);
    }
  }

  if (errors.length > 0 && isProd) {
    console.error('====================================================');
    console.error('PRODUCTION ENVIRONMENT CONFIGURATION FAILURE:');
    errors.forEach((err) => console.error(` - ${err}`));
    console.error('====================================================');
    throw new Error(`Production environment validation failed:\n${errors.join('\n')}`);
  }

  return { isValid: errors.length === 0, errors };
}
