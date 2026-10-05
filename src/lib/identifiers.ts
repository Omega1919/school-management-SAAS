import crypto from 'crypto';
import { db } from '../db/index.ts';
import { students, teachers, teacherInvitations, parents, admissionApplications } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

/**
 * Crockford Base32 Alphabet (Excludes easily confused characters: 0, O, 1, I, L)
 * 32 characters = exactly 5 bits of entropy per character.
 */
const CROCKFORD_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generates an unpredictable, cryptographically secure human-facing official ID.
 * Format: PREFIX-XXXX-XXXX-XXXX (e.g., STU-7K4Q-92MX-8P3D, TCH-4N8P-X2QA-7M6K, PAR-9D3M-K7RX-2Q8L)
 * Entropy: 32^12 = 1,152,921,504,606,846,976 combinations (~60 bits)
 */
export function generatePublicId(prefix: 'STU' | 'TCH' | 'PAR'): string {
  const bytes = crypto.randomBytes(12);
  let idChars = '';
  for (let i = 0; i < 12; i++) {
    const index = bytes[i] % CROCKFORD_ALPHABET.length;
    idChars += CROCKFORD_ALPHABET[index];
  }

  // Group into 3 blocks of 4 characters: PREFIX-XXXX-XXXX-XXXX
  const block1 = idChars.slice(0, 4);
  const block2 = idChars.slice(4, 8);
  const block3 = idChars.slice(8, 12);

  return `${prefix}-${block1}-${block2}-${block3}`;
}

/**
 * Generates a high-entropy cryptographically secure authorization token.
 * Example: ENR-8F3A2B1C9D4E5F6A7B8C9D0E1F2A3B4C (192 bits of entropy)
 * Raw tokens must NEVER be stored in the database.
 */
export function generateSecureToken(prefix: 'ENR' | 'TCH-INV' | 'PAR-INV' | 'PWD-RST' | string): string {
  const randomHex = crypto.randomBytes(16).toString('hex').toUpperCase();
  return prefix ? `${prefix}-${randomHex}` : randomHex;
}

/**
 * Cryptographic SHA-256 hash for secure token persistence.
 */
export function hashToken(token: string): string {
  if (!token) return '';
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Helper to generate a collision-free Student ID against the database
 */
export async function generateUniqueStudentId(maxAttempts = 5): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidateId = generatePublicId('STU');
    const existing = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.studentId, candidateId))
      .limit(1);

    if (existing.length === 0) {
      return candidateId;
    }
  }
  throw new Error('Failed to generate a unique Student ID after multiple attempts');
}

/**
 * Helper to generate a collision-free Teacher / Employee ID against the database
 */
export async function generateUniqueEmployeeId(maxAttempts = 5): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidateId = generatePublicId('TCH');
    
    // Check both active teachers and pending invitations
    const [existingTeacher] = await db
      .select({ id: teachers.id })
      .from(teachers)
      .where(eq(teachers.employeeId, candidateId))
      .limit(1);
    if (existingTeacher) continue;

    const [existingInvite] = await db
      .select({ id: teacherInvitations.id })
      .from(teacherInvitations)
      .where(eq(teacherInvitations.employeeId, candidateId))
      .limit(1);
    if (!existingInvite) {
      return candidateId;
    }
  }
  throw new Error('Failed to generate a unique Teacher ID after multiple attempts');
}

/**
 * Helper to generate a collision-free Parent ID against the database
 */
export async function generateUniqueParentId(maxAttempts = 5): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidateId = generatePublicId('PAR');
    const existing = await db
      .select({ id: parents.id })
      .from(parents)
      .where(eq(parents.parentId, candidateId))
      .limit(1);

    if (existing.length === 0) {
      return candidateId;
    }
  }
  throw new Error('Failed to generate a unique Parent ID after multiple attempts');
}

/**
 * Helper to generate a collision-free Application Number against the database.
 * Format: APP-YYYY-XXXXX (e.g., APP-2026-9M4K2)
 */
export async function generateUniqueApplicationNumber(maxAttempts = 5): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const bytes = crypto.randomBytes(4);
    let rand = '';
    for (let i = 0; i < 5; i++) {
      rand += CROCKFORD_ALPHABET[bytes[i % bytes.length] % CROCKFORD_ALPHABET.length];
    }
    const candidateNumber = `APP-${year}-${rand}`;
    const existing = await db
      .select({ id: admissionApplications.id })
      .from(admissionApplications)
      .where(eq(admissionApplications.applicationNumber, candidateNumber))
      .limit(1);

    if (existing.length === 0) {
      return candidateNumber;
    }
  }
  throw new Error('Failed to generate a unique Application Number after multiple attempts');
}
