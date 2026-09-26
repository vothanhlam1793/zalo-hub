import type { Knex } from 'knex';
import type {
  StorageDriveRecord,
  StorageSettings,
  OffloadCandidate,
  StorageStats,
} from './types.js';

export class GoldStorageRepo {
  private knex: Knex;

  constructor(knex: Knex) {
    this.knex = knex;
  }

  async getDrives(): Promise<StorageDriveRecord[]> {
    const rows = await this.knex('storage_drives').orderBy('created_at', 'asc');
    return rows.map((r) => this.mapDriveRow(r));
  }

  async getDriveById(id: string): Promise<StorageDriveRecord | null> {
    const row = await this.knex('storage_drives').where({ id }).first();
    return row ? this.mapDriveRow(row) : null;
  }

  async getDefaultDrive(): Promise<StorageDriveRecord | null> {
    const row = await this.knex('storage_drives')
      .where({ is_default: true, status: 'active' })
      .first();
    if (row) return this.mapDriveRow(row);

    const firstActive = await this.knex('storage_drives')
      .where({ status: 'active' })
      .orderBy('created_at', 'asc')
      .first();
    return firstActive ? this.mapDriveRow(firstActive) : null;
  }

  async getDriveForAccount(accountId: string): Promise<StorageDriveRecord | null> {
    const drives = await this.getDrives();
    const matching = drives.find(
      (d) => d.status === 'active' && d.assignedAccounts.includes(accountId)
    );
    if (matching) return matching;
    return this.getDefaultDrive();
  }

  async createDrive(data: {
    name: string;
    provider?: 'gdrive';
    accountEmail?: string;
    credentials: Record<string, unknown>;
    rootFolderId?: string;
    status?: 'active' | 'disabled' | 'full' | 'error';
    assignedAccounts?: string[];
    isDefault?: boolean;
    quotaBytes?: number;
    usedBytes?: number;
  }): Promise<StorageDriveRecord> {
    if (data.isDefault) {
      await this.knex('storage_drives').update({ is_default: false });
    }

    const [row] = await this.knex('storage_drives')
      .insert({
        name: data.name,
        provider: data.provider || 'gdrive',
        account_email: data.accountEmail ?? null,
        credentials: JSON.stringify(data.credentials || {}),
        root_folder_id: data.rootFolderId ?? null,
        status: data.status || 'active',
        assigned_accounts: JSON.stringify(data.assignedAccounts || []),
        is_default: data.isDefault ?? false,
        quota_bytes: data.quotaBytes ?? null,
        used_bytes: data.usedBytes ?? null,
      })
      .returning('*');

    return this.mapDriveRow(row);
  }

  async updateDrive(
    id: string,
    data: Partial<{
      name: string;
      accountEmail: string;
      credentials: Record<string, unknown>;
      rootFolderId: string;
      status: 'active' | 'disabled' | 'full' | 'error';
      assignedAccounts: string[];
      isDefault: boolean;
      quotaBytes: number;
      usedBytes: number;
    }>
  ): Promise<StorageDriveRecord | null> {
    if (data.isDefault) {
      await this.knex('storage_drives').whereNot({ id }).update({ is_default: false });
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: this.knex.fn.now(),
    };
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.accountEmail !== undefined) updatePayload.account_email = data.accountEmail;
    if (data.credentials !== undefined) updatePayload.credentials = JSON.stringify(data.credentials);
    if (data.rootFolderId !== undefined) updatePayload.root_folder_id = data.rootFolderId;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.assignedAccounts !== undefined) updatePayload.assigned_accounts = JSON.stringify(data.assignedAccounts);
    if (data.isDefault !== undefined) updatePayload.is_default = data.isDefault;
    if (data.quotaBytes !== undefined) updatePayload.quota_bytes = data.quotaBytes;
    if (data.usedBytes !== undefined) updatePayload.used_bytes = data.usedBytes;

    const [row] = await this.knex('storage_drives')
      .where({ id })
      .update(updatePayload)
      .returning('*');

    return row ? this.mapDriveRow(row) : null;
  }

  async deleteDrive(id: string): Promise<boolean> {
    const deleted = await this.knex('storage_drives').where({ id }).delete();
    return deleted > 0;
  }

  async getSettings(): Promise<StorageSettings> {
    const row = await this.knex('storage_settings').where({ key: 'main_storage_config' }).first();
    if (!row || !row.value) {
      return {
        hotRetentionDays: 3,
        autoOffloadEnabled: true,
        cronIntervalMinutes: 60,
        defaultDriveStrategy: 'account_mapping',
      };
    }
    const val = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    return {
      hotRetentionDays: Number(val.hotRetentionDays ?? 3),
      autoOffloadEnabled: Boolean(val.autoOffloadEnabled ?? true),
      cronIntervalMinutes: Number(val.cronIntervalMinutes ?? 60),
      defaultDriveStrategy: val.defaultDriveStrategy ?? 'account_mapping',
    };
  }

  async updateSettings(settings: Partial<StorageSettings>): Promise<StorageSettings> {
    const current = await this.getSettings();
    const updated: StorageSettings = {
      ...current,
      ...settings,
    };
    await this.knex('storage_settings')
      .insert({
        key: 'main_storage_config',
        value: JSON.stringify(updated),
        updated_at: this.knex.fn.now(),
      })
      .onConflict('key')
      .merge({
        value: JSON.stringify(updated),
        updated_at: this.knex.fn.now(),
      });
    return updated;
  }

  async getHotAttachmentsOlderThan(days: number, limit = 200): Promise<OffloadCandidate[]> {
    const rows = await this.knex.raw(
      `SELECT a.id, a.message_id, a.type, a.url, a.local_path, a.file_name, a.mime_type, a.size,
              a.created_at, m.account_id
       FROM attachments a
       JOIN messages m ON a.message_id = m.id
       WHERE a.storage_tier = 'hot'
         AND a.local_path IS NOT NULL
         AND a.created_at < (NOW() - (INTERVAL '1 day' * ?))
       ORDER BY a.created_at ASC
       LIMIT ?`,
      [days, limit]
    );

    return (rows.rows || []).map((r: any) => ({
      id: r.id,
      messageId: r.message_id,
      accountId: r.account_id,
      type: r.type,
      url: r.url,
      localPath: r.local_path,
      fileName: r.file_name,
      mimeType: r.mime_type,
      size: r.size ? Number(r.size) : undefined,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async markAttachmentOffloaded(options: {
    attachmentId: string;
    driveId: string;
    remoteFileId: string;
    remoteWebViewLink?: string;
  }): Promise<void> {
    await this.knex('attachments')
      .where({ id: options.attachmentId })
      .update({
        storage_tier: 'cold',
        storage_provider: 'gdrive',
        storage_drive_id: options.driveId,
        remote_file_id: options.remoteFileId,
        remote_web_view_link: options.remoteWebViewLink ?? null,
        offloaded_at: this.knex.fn.now(),
      });
  }

  async getAttachmentByPath(localPathOrUrl: string): Promise<{
    id: string;
    localPath: string;
    storageTier: string;
    storageProvider: string;
    storageDriveId?: string;
    remoteFileId?: string;
    fileName?: string;
    mimeType?: string;
    size?: number;
  } | null> {
    const cleanPath = localPathOrUrl.startsWith('/media/') ? localPathOrUrl : `/media/${localPathOrUrl}`;
    const row = await this.knex('attachments')
      .where({ local_path: cleanPath })
      .orWhere({ url: cleanPath })
      .orWhere({ local_path: cleanPath.replace('/media/', '') })
      .first();

    if (!row) return null;
    return {
      id: row.id,
      localPath: row.local_path,
      storageTier: row.storage_tier || 'hot',
      storageProvider: row.storage_provider || 'minio',
      storageDriveId: row.storage_drive_id ?? undefined,
      remoteFileId: row.remote_file_id ?? undefined,
      fileName: row.file_name ?? undefined,
      mimeType: row.mime_type ?? undefined,
      size: row.size ? Number(row.size) : undefined,
    };
  }

  async getStorageStats(): Promise<StorageStats> {
    const hotRes = await this.knex.raw(`
      SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size
      FROM attachments
      WHERE storage_tier = 'hot'
    `);
    const coldRes = await this.knex.raw(`
      SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size
      FROM attachments
      WHERE storage_tier = 'cold'
    `);
    const drivesRes = await this.knex('storage_drives').count('* as count').first();

    return {
      hotAttachmentsCount: Number(hotRes.rows?.[0]?.count ?? 0),
      hotTotalBytes: Number(hotRes.rows?.[0]?.total_size ?? 0),
      coldAttachmentsCount: Number(coldRes.rows?.[0]?.count ?? 0),
      coldTotalBytes: Number(coldRes.rows?.[0]?.total_size ?? 0),
      drivesCount: Number(drivesRes?.count ?? 0),
    };
  }

  private mapDriveRow(row: any): StorageDriveRecord {
    const creds = typeof row.credentials === 'string' ? JSON.parse(row.credentials) : row.credentials || {};
    const accounts = typeof row.assigned_accounts === 'string' ? JSON.parse(row.assigned_accounts) : row.assigned_accounts || [];
    return {
      id: row.id,
      name: row.name,
      provider: row.provider || 'gdrive',
      accountEmail: row.account_email ?? undefined,
      credentials: creds,
      rootFolderId: row.root_folder_id ?? undefined,
      status: row.status || 'active',
      assignedAccounts: Array.isArray(accounts) ? accounts : [],
      isDefault: Boolean(row.is_default),
      quotaBytes: row.quota_bytes ? Number(row.quota_bytes) : undefined,
      usedBytes: row.used_bytes ? Number(row.used_bytes) : undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
