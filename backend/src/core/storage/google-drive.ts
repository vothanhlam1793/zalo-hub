import { Readable } from 'node:stream';
import type { StorageDriveRecord } from './types.js';

export interface GoogleDriveUploadResult {
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  md5Checksum?: string;
  webViewLink?: string;
}

export class GoogleDriveClient {
  private drive: StorageDriveRecord;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private folderCache = new Map<string, string>();

  constructor(drive: StorageDriveRecord) {
    this.drive = drive;
    if (drive.credentials.accessToken && drive.credentials.tokenExpiry) {
      this.accessToken = drive.credentials.accessToken;
      this.tokenExpiresAt = drive.credentials.tokenExpiry;
    }
  }

  async getValidAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && this.tokenExpiresAt > now + 60000) {
      return this.accessToken;
    }

    const { clientId, clientSecret, refreshToken } = this.drive.credentials;
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(`Google Drive "${this.drive.name}" thieu thong tin OAuth (clientId, clientSecret, refreshToken)`);
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Khong the refresh Google OAuth token (${res.status}): ${errText}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = now + (data.expires_in * 1000);
    return this.accessToken;
  }

  async testConnection(): Promise<{ email?: string; displayName?: string; quotaLimit?: number; quotaUsage?: number }> {
    const token = await this.getValidAccessToken();
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress),storageQuota(limit,usage)', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Test Google Drive that bai (${res.status}): ${text}`);
    }

    const data = await res.json() as {
      user?: { displayName?: string; emailAddress?: string };
      storageQuota?: { limit?: string; usage?: string };
    };

    return {
      email: data.user?.emailAddress,
      displayName: data.user?.displayName,
      quotaLimit: data.storageQuota?.limit ? Number(data.storageQuota.limit) : undefined,
      quotaUsage: data.storageQuota?.usage ? Number(data.storageQuota.usage) : undefined,
    };
  }

  async ensureFolder(name: string, parentFolderId?: string): Promise<string> {
    const cacheKey = `${parentFolderId || 'root'}::${name}`;
    const cached = this.folderCache.get(cacheKey);
    if (cached) return cached;

    const token = await this.getValidAccessToken();
    const query = parentFolderId
      ? `name = '${name.replace(/'/g, "\\'")}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      : `name = '${name.replace(/'/g, "\\'")}' and 'root' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json() as { files?: Array<{ id: string; name: string }> };
      if (searchData.files && searchData.files.length > 0) {
        const folderId = searchData.files[0].id;
        this.folderCache.set(cacheKey, folderId);
        return folderId;
      }
    }

    // Create new folder
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentFolderId ? [parentFolderId] : undefined,
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`Khong tao duoc thu muc Google Drive "${name}": ${text}`);
    }

    const created = await createRes.json() as { id: string };
    this.folderCache.set(cacheKey, created.id);
    return created.id;
  }

  async ensureFolderPath(segments: string[], rootParentId?: string): Promise<string> {
    let currentParent = rootParentId || this.drive.rootFolderId || undefined;
    for (const seg of segments) {
      if (!seg.trim()) continue;
      currentParent = await this.ensureFolder(seg.trim(), currentParent);
    }
    return currentParent || 'root';
  }

  async uploadFile(options: {
    fileName: string;
    mimeType?: string;
    buffer: Buffer;
    folderId?: string;
  }): Promise<GoogleDriveUploadResult> {
    const token = await this.getValidAccessToken();
    const boundary = `-------ZaloHubDriveBoundary${Date.now()}`;
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const mimeType = options.mimeType || 'application/octet-stream';
    const metadata: Record<string, unknown> = {
      name: options.fileName,
      mimeType,
    };
    if (options.folderId) {
      metadata.parents = [options.folderId];
    }

    const metaPart = Buffer.from(
      `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`
    );
    const mediaHeaderPart = Buffer.from(
      `${delimiter}Content-Type: ${mimeType}\r\n\r\n`
    );
    const closePart = Buffer.from(closeDelimiter);

    const bodyBuffer = Buffer.concat([metaPart, mediaHeaderPart, options.buffer, closePart]);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,md5Checksum,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(bodyBuffer.length),
      },
      body: bodyBuffer,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Upload len Google Drive that bai (${res.status}): ${errText}`);
    }

    const data = await res.json() as {
      id: string;
      name: string;
      mimeType: string;
      size?: string;
      md5Checksum?: string;
      webViewLink?: string;
    };

    return {
      fileId: data.id,
      name: data.name,
      mimeType: data.mimeType,
      size: data.size ? Number(data.size) : options.buffer.length,
      md5Checksum: data.md5Checksum,
      webViewLink: data.webViewLink,
    };
  }

  async getFileStream(fileId: string, rangeHeader?: string): Promise<{
    stream: Readable;
    contentType?: string;
    contentLength?: number;
    contentRange?: string;
    statusCode: number;
  }> {
    const token = await this.getValidAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (rangeHeader) {
      headers.Range = rangeHeader;
    }

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers,
    });

    if (!res.ok && res.status !== 206) {
      const errText = await res.text();
      throw new Error(`Google Drive get media that bai (${res.status}): ${errText}`);
    }

    const contentType = res.headers.get('content-type') || undefined;
    const contentLength = res.headers.get('content-length') ? Number(res.headers.get('content-length')) : undefined;
    const contentRange = res.headers.get('content-range') || undefined;

    const nodeStream = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);

    return {
      stream: nodeStream,
      contentType,
      contentLength,
      contentRange,
      statusCode: res.status,
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    const token = await this.getValidAccessToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(`Xoa file Google Drive that bai (${res.status}): ${text}`);
    }
  }
}
