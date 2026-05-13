import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const dataDir = path.resolve(__dirname, '../../data');
export const mediaDir = path.join(dataDir, 'media');

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function slugify(name: string) {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || 'file';
}

function hasExtension(name: string) {
  return /\.[a-zA-Z0-9]{2,8}$/.test(name);
}

function extensionFromMimeType(mimeType?: string) {
  const lower = (mimeType ?? '').toLowerCase();
  if (lower === 'image/jpeg') return '.jpg';
  if (lower === 'image/png') return '.png';
  if (lower === 'image/webp') return '.webp';
  if (lower === 'image/gif') return '.gif';
  if (lower === 'video/mp4') return '.mp4';
  if (lower === 'video/webm') return '.webm';
  if (lower === 'application/pdf') return '.pdf';
  return '';
}

export type StoredMedia = {
  localPath: string;
  publicUrl: string;
  sha1: string;
};

export class GoldMediaStore {
  constructor() {
    ensureDir(mediaDir);
  }

  getRootDir() {
    ensureDir(mediaDir);
    return mediaDir;
  }

  saveBuffer(options: { accountId?: string; messageId: string; fileName?: string; mimeType?: string; buffer: Buffer }) : StoredMedia {
    ensureDir(mediaDir);
    const now = new Date();
    const accountPart = slugify(options.accountId ?? 'unknown-account');
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dir = path.join(mediaDir, accountPart, year, month);
    ensureDir(dir);

    const fallbackExtension = extensionFromMimeType(options.mimeType);
    const requestedName = options.fileName?.trim() || options.messageId;
    const preferredName = hasExtension(requestedName) ? requestedName : `${requestedName}${fallbackExtension}`;
    const fileName = `${options.messageId}-${randomUUID()}-${slugify(preferredName)}`;
    const absolutePath = path.join(dir, fileName);
    writeFileSync(absolutePath, options.buffer);

    return {
      localPath: absolutePath,
      publicUrl: `/media/${accountPart}/${year}/${month}/${fileName}`,
      sha1: createHash('sha1').update(options.buffer).digest('hex'),
    };
  }

  async mirrorRemoteUrl(options: { accountId?: string; messageId: string; sourceUrl: string; fileName?: string; mimeType?: string }) {
    const response = await fetch(options.sourceUrl);
    if (!response.ok) {
      throw new Error(`Khong tai duoc file remote: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = options.mimeType || response.headers.get('content-type') || undefined;
    return this.saveBuffer({
      accountId: options.accountId,
      messageId: options.messageId,
      fileName: options.fileName,
      mimeType,
      buffer,
    });
  }
}
