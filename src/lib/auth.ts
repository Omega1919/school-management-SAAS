import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export interface TokenPayload {
  id: number;
  uid: string;
  email: string;
  role: 'super_admin' | 'teacher' | 'parent' | 'student';
  fullName: string;
}

export interface StreamTokenPayload {
  userId: number;
  type: 'stream';
}

let ephemeralDevSecret: string | null = null;

/**
 * Validates that JWT_SECRET is configured properly.
 * In production, strictly requires a cryptographically strong secret (>= 32 characters)
 * and never allows fallbacks.
 */
export function validateAuthEnvironment(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const secret = process.env.JWT_SECRET?.trim();

  if (isProd) {
    if (!secret) {
      throw new Error('FATAL: JWT_SECRET environment variable is required in production.');
    }
    if (secret.length < 32) {
      throw new Error(`FATAL: JWT_SECRET in production must be at least 32 characters (current: ${secret.length}).`);
    }
  } else {
    if (secret && secret.length < 16) {
      throw new Error(`JWT_SECRET must be at least 16 characters in development (current: ${secret.length}).`);
    }
  }
}

export function getJwtSecret(): string {
  const isProd = process.env.NODE_ENV === 'production';
  const secret = process.env.JWT_SECRET?.trim();

  if (isProd) {
    if (!secret) {
      throw new Error('FATAL: JWT_SECRET environment variable is missing in production.');
    }
    if (secret.length < 32) {
      throw new Error(`FATAL: JWT_SECRET in production must be at least 32 characters (current: ${secret.length}).`);
    }
    return secret;
  }

  // Development / Test environment
  if (secret) {
    if (secret.length < 16) {
      throw new Error(`JWT_SECRET must be at least 16 characters in development (current: ${secret.length}).`);
    }
    return secret;
  }

  // Ephemeral in-memory key generated strictly for non-production development/test when unconfigured
  if (!ephemeralDevSecret) {
    ephemeralDevSecret = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️ Notice: JWT_SECRET not configured in development environment. Using ephemeral process key.');
  }
  return ephemeralDevSecret;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validates password length and complexity bounds.
 * Minimum 8 characters. Maximum 72 bytes (preventing silent bcrypt truncation).
 */
export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return { valid: false, error: 'Password cannot exceed 72 bytes (maximum bcrypt input limit)' };
  }
  return { valid: true };
}

export function generateToken(payload: TokenPayload, expiresIn = '7d'): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Generates a short-lived (60 seconds) dedicated stream token for SSE connection establishment.
 */
export function generateStreamToken(userId: number, expiresIn = '60s'): string {
  return jwt.sign({ userId, type: 'stream' }, getJwtSecret(), { expiresIn } as jwt.SignOptions);
}

/**
 * Verifies a dedicated SSE stream token.
 */
export function verifyStreamToken(token: string): { userId: number } | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    if (decoded && decoded.type === 'stream' && typeof decoded.userId === 'number') {
      return { userId: decoded.userId };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generates an unguessable high-entropy token (128 bits)
 * to be handed to the recipient (e.g. via invitation slip or email).
 */
export function generateSecureToken(prefix = ''): string {
  const randomBytes = crypto.randomBytes(16).toString('hex').toUpperCase();
  return prefix ? `${prefix}-${randomBytes}` : randomBytes;
}

/**
 * One-way cryptographic SHA-256 hash for secure token persistence.
 * Raw tokens are NEVER stored in the database.
 */
export function hashToken(token: string): string {
  if (!token) return '';
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

export function calculateGrade(totalScore: number): { grade: string; remarks: string } {
  if (totalScore >= 75) return { grade: 'A', remarks: 'Excellent' };
  if (totalScore >= 65) return { grade: 'B', remarks: 'Very Good' };
  if (totalScore >= 50) return { grade: 'C', remarks: 'Good' };
  if (totalScore >= 40) return { grade: 'D', remarks: 'Pass' };
  if (totalScore >= 30) return { grade: 'E', remarks: 'Poor' };
  return { grade: 'F', remarks: 'Fail' };
}
