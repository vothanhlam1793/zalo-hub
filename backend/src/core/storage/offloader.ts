import { Client as MinioClient } from 'minio';
import type { GoldStorageRepo } from './storage-repo.js';
import { GoogleDriveClient } from './google-drive.js';
import type {
  StorageDriveRecord,
  OffloadResult,
  OffloadCandidate,
} from './types.js';

export class MediaOffloaderService {
  private storageRepo: GoldStorageRepo;
  private minioClient: MinioClient;
  private minioBucket: string;
  private driveClients = new Map<string, GoogleDriveClient>();
  private cronTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(options: {
    storageRepo: GoldStorageRepo;
    minioClient: MinioClient;
    minioBucket?: string;
  }) {
    this.storageRepo = options.storageRepo;
    this.minioClient = options.minioClient;
    this.minioBucket = options.minioBucket || process.env.MINIO_BUCKET || 'zalohub-media';
  }

  getDriveClient(drive: StorageDriveRecord): GoogleDriveClient {
    let client = this.driveClients.get(drive.id);
    if (!client) {
      client = new GoogleDriveClient(drive);
      this.driveClients.set(drive.id, client);
    }
    return client;
  }

  clearDriveClientCache(driveId?: string) {
    if (driveId) {
      this.driveClients.delete(driveId);
    } else {
      this.driveClients.clear();
    }
  }

  async runManualOffload(limit = 100): Promise<OffloadResult> {
    if (this.isRunning) {
      throw new Error('Tác vụ dịch chuyển dữ liệu đang chạy nền, vui lòng thử lại sau.');
    }
    return this.executeOffload(limit);
  }

  async executeOffload(limit = 100): Promise<OffloadResult> {
    this.isRunning = true;
    const result: OffloadResult = {
      totalScanned: 0,
      totalOffloaded: 0,
      totalFailed: 0,
      bytesSaved: 0,
      errors: [],
    };

    try {
      const settings = await this.storageRepo.getSettings();
      const candidates = await this.storageRepo.getHotAttachmentsOlderThan(
        settings.hotRetentionDays,
        limit
      );
      result.totalScanned = candidates.length;

      if (candidates.length === 0) {
        return result;
      }

      for (const candidate of candidates) {
        try {
          const bytes = await this.offloadSingleAttachment(candidate);
          result.totalOffloaded += 1;
          result.bytesSaved += bytes;
        } catch (err: any) {
          result.totalFailed += 1;
          result.errors.push({
            attachmentId: candidate.id,
            message: err?.message || String(err),
          });
        }
      }
    } finally {
      this.isRunning = false;
    }

    return result;
  }

  private async offloadSingleAttachment(candidate: OffloadCandidate): Promise<number> {
    const drive = await this.storageRepo.getDriveForAccount(candidate.accountId);
    if (!drive) {
      throw new Error(`Không tìm thấy Google Drive khả dụng cho tài khoản ${candidate.accountId}`);
    }

    const driveClient = this.getDriveClient(drive);

    // 1. Get object from MinIO
    let objPath = candidate.localPath.startsWith('/media/')
      ? candidate.localPath.slice('/media/'.length)
      : candidate.localPath;

    // Check if object exists in MinIO
    let buffer: Buffer;
    let mimeType = candidate.mimeType || 'application/octet-stream';
    try {
      const stat = await this.minioClient.statObject(this.minioBucket, objPath);
      if (stat.metaData?.['content-type']) {
        mimeType = stat.metaData['content-type'];
      }
      const stream = await this.minioClient.getObject(this.minioBucket, objPath);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      buffer = Buffer.concat(chunks);
    } catch (minioErr: any) {
      throw new Error(`Không đọc được file từ MinIO (${objPath}): ${minioErr?.message || minioErr}`);
    }

    if (!buffer.length) {
      throw new Error(`File rỗng trên MinIO: ${objPath}`);
    }

    // 2. Prepare folder hierarchy on Google Drive: ZaloHub_Archive / <accountId> / <YYYY-MM>
    const createdDate = new Date(candidate.createdAt);
    const yearMonth = `${createdDate.getUTCFullYear()}-${String(createdDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const folderId = await driveClient.ensureFolderPath([
      'ZaloHub_Archive',
      candidate.accountId || 'general',
      yearMonth,
    ]);

    // 3. Upload to Google Drive
    const uploadFileName = candidate.fileName || objPath.split('/').pop() || `${candidate.id}.bin`;
    const uploadRes = await driveClient.uploadFile({
      fileName: uploadFileName,
      mimeType,
      buffer,
      folderId,
    });

    if (!uploadRes.fileId) {
      throw new Error('Upload Google Drive không trả về fileId');
    }

    // 4. Update database record to 'cold' tier
    await this.storageRepo.markAttachmentOffloaded({
      attachmentId: candidate.id,
      driveId: drive.id,
      remoteFileId: uploadRes.fileId,
      remoteWebViewLink: uploadRes.webViewLink,
    });

    // 5. Delete file from MinIO to free disk space
    try {
      await this.minioClient.removeObject(this.minioBucket, objPath);
    } catch (rmErr) {
      console.warn(`[Offloader] Da upload len Google Drive nhung xoa MinIO that bai (${objPath}):`, rmErr);
    }

    return buffer.length;
  }

  startCronWorker() {
    if (this.cronTimer) return;
    // Run periodically
    const intervalMs = 60 * 60 * 1000; // 60 minutes
    this.cronTimer = setInterval(async () => {
      try {
        const settings = await this.storageRepo.getSettings();
        if (settings.autoOffloadEnabled) {
          await this.executeOffload(150);
        }
      } catch (err) {
        console.error('[Offloader Worker] Loi chay dinh ky:', err);
      }
    }, intervalMs);

    // Initial run after 1 minute on boot
    setTimeout(async () => {
      try {
        const settings = await this.storageRepo.getSettings();
        if (settings.autoOffloadEnabled) {
          await this.executeOffload(50);
        }
      } catch (err) {
        console.error('[Offloader Worker] Loi khoi dong ban dau:', err);
      }
    }, 60000);
  }

  stopCronWorker() {
    if (this.cronTimer) {
      clearInterval(this.cronTimer);
      this.cronTimer = null;
    }
  }
}
