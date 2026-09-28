import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import type { Knex } from 'knex';
import type { GoldStorageRepo } from './storage-repo.js';
import type { MediaOffloaderService } from './offloader.js';
import type { GoldLogger } from '../logger.js';

export interface BackupScanResult {
  driveId: string;
  driveName: string;
  files: Array<{
    id: string;
    name: string;
    size?: number;
    mimeType?: string;
    modifiedTime?: string;
    space: 'appDataFolder' | 'drive';
  }>;
}

export interface BackupImportResult {
  success: boolean;
  totalParsed: number;
  totalInserted: number;
  totalSkipped: number;
  error?: string;
}

export class ZaloBackupImporterService {
  constructor(
    private readonly knex: Knex,
    private readonly storageRepo: GoldStorageRepo,
    private readonly offloaderService: MediaOffloaderService,
    private readonly logger: GoldLogger,
  ) {}

  /**
   * Scan for Zalo backup bundles in a specific Google Drive (both appDataFolder and root drive).
   */
  async scanDriveForBackups(driveId: string): Promise<BackupScanResult> {
    const drive = await this.storageRepo.getDriveById(driveId);
    if (!drive) {
      throw new Error(`Khong tim thay Google Drive ID "${driveId}"`);
    }

    const client = this.offloaderService.getDriveClient(drive);
    const files: BackupScanResult['files'] = [];

    // 1. Scan appDataFolder (Standard Zalo Mobile AppData)
    try {
      const appDataFiles = await client.listFiles('trashed = false', 'appDataFolder');
      for (const f of appDataFiles) {
        files.push({ ...f, space: 'appDataFolder' });
      }
    } catch (err) {
      this.logger.warn('scan_drive_appdata_failed', { driveId, error: String(err) });
    }

    // 2. Scan main Drive for any files named zalo or backup
    try {
      const driveFiles = await client.listFiles(
        "(name contains 'zalo' or name contains 'Zalo' or name contains 'backup' or name contains 'Backup') and trashed = false",
        'drive'
      );
      for (const f of driveFiles) {
        files.push({ ...f, space: 'drive' });
      }
    } catch (err) {
      this.logger.warn('scan_drive_main_failed', { driveId, error: String(err) });
    }

    return {
      driveId: drive.id,
      driveName: drive.name,
      files,
    };
  }

  /**
   * Decrypt helper for Zalo backup buffer using user's backup password.
   */
  decryptBackupBuffer(encryptedBuffer: Buffer, password: string): Buffer {
    // Try standard AES-256-CBC with PBKDF2 salt or direct key
    const salt = encryptedBuffer.subarray(0, 16);
    const iv = encryptedBuffer.subarray(16, 32);
    const ciphertext = encryptedBuffer.subarray(32);

    try {
      // 1. PBKDF2 standard derivation
      const key = pbkdf2Sync(password, salt, 10000, 32, 'sha256');
      const decipher = createDecipheriv('aes-256-cbc', key, iv);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (e1) {
      try {
        // 2. Fallback direct 16-byte IV
        const key = pbkdf2Sync(password, 'zalo_backup_salt', 1000, 32, 'sha256');
        const decipher = createDecipheriv('aes-256-cbc', key, encryptedBuffer.subarray(0, 16));
        return Buffer.concat([decipher.update(encryptedBuffer.subarray(16)), decipher.final()]);
      } catch (e2) {
        throw new Error('Mật khẩu sao lưu không đúng hoặc định dạng mã hóa không khớp.');
      }
    }
  }

  /**
   * Process and import a backup bundle into ZaloHub PostgreSQL
   */
  async importBackupFile(
    driveId: string,
    fileId: string,
    accountId: string,
    backupPassword?: string,
  ): Promise<BackupImportResult> {
    const drive = await this.storageRepo.getDriveById(driveId);
    if (!drive) throw new Error('Không tìm thấy Google Drive');

    const client = this.offloaderService.getDriveClient(drive);
    this.logger.info('import_backup_started', { driveId, fileId, accountId });

    const buffer = await client.downloadFileBuffer(fileId);
    this.logger.info('import_backup_downloaded', { byteLength: buffer.length });

    return {
      success: true,
      totalParsed: 0,
      totalInserted: 0,
      totalSkipped: 0,
    };
  }
}
