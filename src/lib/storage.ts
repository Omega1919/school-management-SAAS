import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type StorageCategory = 'admission_document' | 'passport_photo' | 'hero_image' | 'general';

export interface StoredFileMetadata {
  fileId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
  category: StorageCategory;
  isPublic: boolean;
  ownerId?: string | number;
  url: string;
  createdAt: string;
}

export interface SaveFileOptions {
  dataUriOrBuffer: string | Buffer;
  filename?: string;
  mimeType?: string;
  category: StorageCategory;
  isPublic?: boolean;
  ownerId?: string | number;
  maxSizeBytes?: number;
}

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_DOCUMENT_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

// Storage Root Directory
const STORAGE_ROOT = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.resolve(process.cwd(), 'data', 'storage');

const PUBLIC_DIR = path.join(STORAGE_ROOT, 'public');
const PRIVATE_DIR = path.join(STORAGE_ROOT, 'private');

function ensureDirectoriesExist() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }
  if (!fs.existsSync(PRIVATE_DIR)) {
    fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  }
}

/**
 * Validates and stores files securely on the server-side filesystem
 * Enforces MIME validation, file size limits, safe UUID filenames, and path containment.
 */
export class StorageService {
  static getStorageRoot(): string {
    return STORAGE_ROOT;
  }

  static isAllowedMime(mime: string, category: StorageCategory): boolean {
    const cleanMime = mime.toLowerCase().trim();
    if (category === 'hero_image' || category === 'passport_photo') {
      return ALLOWED_IMAGE_MIMES.has(cleanMime);
    }
    return ALLOWED_DOCUMENT_MIMES.has(cleanMime);
  }

  static parseDataUri(dataUri: string): { buffer: Buffer; mimeType: string } {
    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Invalid data URI format. Expected data:[mime];base64,[data]');
    }
    const mimeType = match[1].toLowerCase().trim();
    const buffer = Buffer.from(match[2], 'base64');
    return { buffer, mimeType };
  }

  static async saveFile(options: SaveFileOptions): Promise<StoredFileMetadata> {
    ensureDirectoriesExist();

    let buffer: Buffer;
    let mimeType = options.mimeType || 'application/octet-stream';

    if (typeof options.dataUriOrBuffer === 'string') {
      if (options.dataUriOrBuffer.startsWith('data:')) {
        const parsed = this.parseDataUri(options.dataUriOrBuffer);
        buffer = parsed.buffer;
        mimeType = parsed.mimeType;
      } else {
        buffer = Buffer.from(options.dataUriOrBuffer, 'utf-8');
      }
    } else {
      buffer = options.dataUriOrBuffer;
    }

    const category = options.category;
    const isPublic = Boolean(options.isPublic);

    // 1. Validate MIME Type
    if (!this.isAllowedMime(mimeType, category)) {
      throw new Error(`Unsupported or unsafe file type: "${mimeType}". Allowed types: ${Array.from(category === 'hero_image' || category === 'passport_photo' ? ALLOWED_IMAGE_MIMES : ALLOWED_DOCUMENT_MIMES).join(', ')}`);
    }

    // 2. Validate File Size
    const defaultMax = category === 'hero_image' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    const maxBytes = options.maxSizeBytes || defaultMax;
    if (buffer.length > maxBytes) {
      const maxMb = Math.round(maxBytes / (1024 * 1024));
      throw new Error(`File size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of ${maxMb} MB`);
    }

    // 3. Generate Secure Server-Side Storage Identifier
    const fileId = crypto.randomUUID();
    const ext = MIME_TO_EXT[mimeType] || '.bin';
    const safeFilename = `${fileId}${ext}`;
    const targetDir = isPublic ? PUBLIC_DIR : PRIVATE_DIR;
    const filePath = path.join(targetDir, safeFilename);

    // Verify Path Traversal Containment
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(targetDir)) {
      throw new Error('Security Error: Path traversal attempt detected');
    }

    // Sanitize Original Filename for Metadata
    const rawOriginal = options.filename ? path.basename(options.filename).replace(/[^a-zA-Z0-9._-]/g, '_') : `upload${ext}`;

    // Write file to storage
    await fs.promises.writeFile(resolvedPath, buffer);

    const storageKey = path.relative(STORAGE_ROOT, resolvedPath);
    const url = isPublic
      ? `/api/public-portal/hero-image/${fileId}`
      : `/api/admissions/documents/${fileId}`;

    const metadata: StoredFileMetadata = {
      fileId,
      storageKey,
      filename: rawOriginal,
      mimeType,
      size: buffer.length,
      category,
      isPublic,
      ownerId: options.ownerId,
      url,
      createdAt: new Date().toISOString(),
    };

    // Store metadata sidecar file for fast lookup
    const metaPath = path.join(targetDir, `${fileId}.meta.json`);
    await fs.promises.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');

    return metadata;
  }

  static async getFile(fileId: string, isPublic?: boolean): Promise<{ buffer: Buffer; metadata: StoredFileMetadata; filePath: string } | null> {
    ensureDirectoriesExist();

    // Prevent directory traversal on fileId parameter
    const safeFileId = path.basename(fileId).trim();
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(safeFileId)) {
      return null;
    }

    const dirsToCheck = isPublic === true
      ? [PUBLIC_DIR]
      : isPublic === false
      ? [PRIVATE_DIR]
      : [PRIVATE_DIR, PUBLIC_DIR];

    for (const dir of dirsToCheck) {
      const metaPath = path.join(dir, `${safeFileId}.meta.json`);
      if (fs.existsSync(metaPath)) {
        try {
          const metaRaw = await fs.promises.readFile(metaPath, 'utf-8');
          const metadata: StoredFileMetadata = JSON.parse(metaRaw);
          const ext = MIME_TO_EXT[metadata.mimeType] || path.extname(metadata.filename) || '.bin';
          const filePath = path.join(dir, `${safeFileId}${ext}`);
          if (fs.existsSync(filePath)) {
            const buffer = await fs.promises.readFile(filePath);
            return { buffer, metadata, filePath };
          }
        } catch (e) {
          // Continue to next directory
        }
      }
    }

    return null;
  }

  static async deleteFile(fileId: string): Promise<boolean> {
    const safeFileId = path.basename(fileId).trim();
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(safeFileId)) {
      return false;
    }

    let deleted = false;
    for (const dir of [PRIVATE_DIR, PUBLIC_DIR]) {
      const metaPath = path.join(dir, `${safeFileId}.meta.json`);
      if (fs.existsSync(metaPath)) {
        try {
          const metaRaw = await fs.promises.readFile(metaPath, 'utf-8');
          const metadata: StoredFileMetadata = JSON.parse(metaRaw);
          const ext = MIME_TO_EXT[metadata.mimeType] || '.bin';
          const filePath = path.join(dir, `${safeFileId}${ext}`);
          if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
          }
          await fs.promises.unlink(metaPath);
          deleted = true;
        } catch {
          // ignore
        }
      }
    }
    return deleted;
  }
}
