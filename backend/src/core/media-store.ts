import { createHash, randomUUID } from 'node:crypto';
import { Client as MinioClient } from 'minio';

function resolveMinioConfig() {
  const endPoint = process.env.MINIO_ENDPOINT || 'localhost';
  const port = Number(process.env.MINIO_PORT || 9000);
  const accessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
  const secretKey = process.env.MINIO_SECRET_KEY || 'minioadmin';
  return { endPoint, port, useSSL: false, accessKey, secretKey };
}

const BUCKET = process.env.MINIO_BUCKET || 'zalohub-media';

let minioClient: MinioClient | null = null;

function getMinio(): MinioClient {
  if (!minioClient) {
    minioClient = new MinioClient(resolveMinioConfig());
  }
  return minioClient;
}

async function ensureBucket(): Promise<void> {
  const minio = getMinio();
  const exists = await minio.bucketExists(BUCKET);
  if (!exists) {
    await minio.makeBucket(BUCKET);
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
  private ready: Promise<void>;

  constructor() {
    this.ready = ensureBucket().catch((err) => {
      console.warn('MinIO bucket init failed:', (err as Error)?.message);
    });
  }

  async getRootDir() {
    await this.ready;
    return BUCKET;
  }

  async isStoredFileUsable(localPath?: string) {
    if (!localPath) return false;
    await this.ready;
    try {
      const objPath = localPath.startsWith('/media/') ? localPath.slice('/media/'.length) : localPath;
      const stat = await getMinio().statObject(BUCKET, objPath);
      return (stat.size ?? 0) > 0;
    } catch {
      return false;
    }
  }

  async saveBuffer(options: { accountId?: string; messageId: string; fileName?: string; mimeType?: string; buffer: Buffer }): Promise<StoredMedia> {
    await this.ready;
    const now = new Date();
    const accountPart = slugify(options.accountId ?? 'unknown-account');
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');

    const fallbackExtension = extensionFromMimeType(options.mimeType);
    const requestedName = options.fileName?.trim() || options.messageId;
    const preferredName = hasExtension(requestedName) ? requestedName : `${requestedName}${fallbackExtension}`;
    const fileName = `${options.messageId}-${randomUUID()}-${slugify(preferredName)}`;
    const objPath = `${accountPart}/${year}/${month}/${fileName}`;

    const meta: Record<string, string> = {};
    if (options.mimeType) meta['Content-Type'] = options.mimeType;

    await getMinio().putObject(BUCKET, objPath, options.buffer, options.buffer.length, meta);

    return {
      localPath: `/media/${objPath}`,
      publicUrl: `/media/${objPath}`,
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
    if (buffer.length === 0) {
      throw new Error('Khong tai duoc file remote: empty response body');
    }
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
