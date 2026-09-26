import { Router, type Request, type Response, type NextFunction } from 'express';
import type { GoldStorageRepo } from '../../core/storage/storage-repo.js';
import type { MediaOffloaderService } from '../../core/storage/offloader.js';
import type { ZaloBackupImporterService } from '../../core/storage/backup-importer.js';
import type { GoldLogger } from '../../core/logger.js';

export function createStorageRouter(
  logger: GoldLogger,
  storageRepo: GoldStorageRepo,
  offloaderService: MediaOffloaderService,
  backupImporterService: ZaloBackupImporterService,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireSystemRole: (role: string) => (req: Request, res: Response, next: NextFunction) => void,
) {
  const router = Router();
  const requireAdmin = requireSystemRole('admin');

  // GET /api/admin/storage/settings
  router.get('/admin/storage/settings', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [settings, stats] = await Promise.all([
        storageRepo.getSettings(),
        storageRepo.getStorageStats(),
      ]);
      res.json({ settings, stats });
    } catch (err: any) {
      logger.error('get_storage_settings_failed', { error: err?.message || String(err) });
      res.status(500).json({ error: 'Không thể tải cấu hình lưu trữ' });
    }
  });

  // PUT /api/admin/storage/settings
  router.put('/admin/storage/settings', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const updated = await storageRepo.updateSettings({
        hotRetentionDays: body.hotRetentionDays !== undefined ? Math.max(1, Number(body.hotRetentionDays)) : undefined,
        autoOffloadEnabled: body.autoOffloadEnabled !== undefined ? Boolean(body.autoOffloadEnabled) : undefined,
        cronIntervalMinutes: body.cronIntervalMinutes !== undefined ? Math.max(5, Number(body.cronIntervalMinutes)) : undefined,
        defaultDriveStrategy: body.defaultDriveStrategy,
      });
      res.json({ ok: true, settings: updated });
    } catch (err: any) {
      logger.error('update_storage_settings_failed', { error: err?.message || String(err) });
      res.status(500).json({ error: 'Không thể cập nhật cấu hình lưu trữ' });
    }
  });

  // GET /api/admin/storage/drives
  router.get('/admin/storage/drives', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const drives = await storageRepo.getDrives();
      // Mask sensitive client secret in list
      const masked = drives.map((d) => ({
        ...d,
        credentials: {
          clientId: d.credentials.clientId ? `${d.credentials.clientId.slice(0, 8)}...` : undefined,
          hasRefreshToken: Boolean(d.credentials.refreshToken),
        },
      }));
      res.json({ drives: masked });
    } catch (err: any) {
      logger.error('get_storage_drives_failed', { error: err?.message || String(err) });
      res.status(500).json({ error: 'Không thể tải danh sách Google Drive' });
    }
  });

  // POST /api/admin/storage/drives
  router.post('/admin/storage/drives', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const name = String(body.name || '').trim();
      if (!name) {
        res.status(400).json({ error: 'Tên Google Drive là bắt buộc' });
        return;
      }

      const clientId = String(body.clientId || '').trim();
      const clientSecret = String(body.clientSecret || '').trim();
      const refreshToken = String(body.refreshToken || '').trim();

      if (!clientId || !clientSecret || !refreshToken) {
        res.status(400).json({ error: 'Vui lòng cung cấp Client ID, Client Secret và Refresh Token' });
        return;
      }

      const drive = await storageRepo.createDrive({
        name,
        provider: 'gdrive',
        accountEmail: body.accountEmail ? String(body.accountEmail).trim() : undefined,
        credentials: {
          clientId,
          clientSecret,
          refreshToken,
        },
        rootFolderId: body.rootFolderId ? String(body.rootFolderId).trim() : undefined,
        assignedAccounts: Array.isArray(body.assignedAccounts) ? body.assignedAccounts : [],
        isDefault: Boolean(body.isDefault),
        status: 'active',
      });

      // Clear cache in offloader
      offloaderService.clearDriveClientCache();

      // Test immediately
      try {
        const client = offloaderService.getDriveClient(drive);
        const testRes = await client.testConnection();
        await storageRepo.updateDrive(drive.id, {
          accountEmail: testRes.email || drive.accountEmail,
          quotaBytes: testRes.quotaLimit,
          usedBytes: testRes.quotaUsage,
          status: 'active',
        });
      } catch (testErr) {
        logger.warn('new_drive_test_failed_on_create', { error: String(testErr) });
      }

      const refreshed = await storageRepo.getDriveById(drive.id);
      res.json({ ok: true, drive: refreshed });
    } catch (err: any) {
      logger.error('create_storage_drive_failed', { error: err?.message || String(err) });
      res.status(500).json({ error: 'Không thể thêm Google Drive' });
    }
  });

  // PUT /api/admin/storage/drives/:id
  router.put('/admin/storage/drives/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const existing = await storageRepo.getDriveById(id);
      if (!existing) {
        res.status(404).json({ error: 'Không tìm thấy Google Drive' });
        return;
      }

      const body = req.body || {};
      const updates: any = {};

      if (body.name !== undefined) updates.name = String(body.name).trim();
      if (body.accountEmail !== undefined) updates.accountEmail = String(body.accountEmail).trim();
      if (body.rootFolderId !== undefined) updates.rootFolderId = String(body.rootFolderId).trim();
      if (body.assignedAccounts !== undefined && Array.isArray(body.assignedAccounts)) {
        updates.assignedAccounts = body.assignedAccounts;
      }
      if (body.isDefault !== undefined) updates.isDefault = Boolean(body.isDefault);
      if (body.status !== undefined) updates.status = body.status;

      // Update credentials if provided
      if (body.clientId || body.clientSecret || body.refreshToken) {
        updates.credentials = {
          clientId: body.clientId ? String(body.clientId).trim() : existing.credentials.clientId,
          clientSecret: body.clientSecret ? String(body.clientSecret).trim() : existing.credentials.clientSecret,
          refreshToken: body.refreshToken ? String(body.refreshToken).trim() : existing.credentials.refreshToken,
        };
      }

      const updated = await storageRepo.updateDrive(id, updates);
      offloaderService.clearDriveClientCache(id);
      res.json({ ok: true, drive: updated });
    } catch (err: any) {
      logger.error('update_storage_drive_failed', { error: err?.message || String(err) });
      res.status(500).json({ error: 'Không thể cập nhật Google Drive' });
    }
  });

  // DELETE /api/admin/storage/drives/:id
  router.delete('/admin/storage/drives/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const ok = await storageRepo.deleteDrive(id);
      offloaderService.clearDriveClientCache(id);
      res.json({ ok });
    } catch (err: any) {
      logger.error('delete_storage_drive_failed', { error: err?.message || String(err) });
      res.status(500).json({ error: 'Không thể xóa Google Drive' });
    }
  });

  // POST /api/admin/storage/drives/:id/test
  router.post('/admin/storage/drives/:id/test', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const drive = await storageRepo.getDriveById(id);
      if (!drive) {
        res.status(404).json({ error: 'Không tìm thấy Google Drive' });
        return;
      }

      const client = offloaderService.getDriveClient(drive);
      const testRes = await client.testConnection();

      await storageRepo.updateDrive(id, {
        accountEmail: testRes.email || drive.accountEmail,
        quotaBytes: testRes.quotaLimit,
        usedBytes: testRes.quotaUsage,
        status: 'active',
      });

      res.json({
        ok: true,
        displayName: testRes.displayName,
        email: testRes.email,
        quotaLimit: testRes.quotaLimit,
        quotaUsage: testRes.quotaUsage,
      });
    } catch (err: any) {
      logger.error('test_storage_drive_failed', { error: err?.message || String(err) });
      res.status(400).json({ error: `Kết nối thất bại: ${err?.message || String(err)}` });
    }
  });

  // POST /api/admin/storage/offload-now
  router.post('/admin/storage/offload-now', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = req.body?.limit ? Math.min(500, Number(req.body.limit)) : 100;
      const result = await offloaderService.runManualOffload(limit);
      res.json({ ok: true, result });
    } catch (err: any) {
      logger.error('manual_offload_failed', { error: err?.message || String(err) });
      res.status(400).json({ error: err?.message || 'Lỗi thực thi dịch chuyển dữ liệu' });
    }
  });

  // POST /api/admin/storage/backfill-media
  router.post('/admin/storage/backfill-media', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = req.body?.limit ? Math.min(500, Number(req.body.limit)) : 100;
      const result = await offloaderService.backfillRemoteMedia(limit);
      res.json({ ok: true, result });
    } catch (err: any) {
      logger.error('backfill_media_failed', { error: err?.message || String(err) });
      res.status(400).json({ error: err?.message || 'Lỗi lưu trữ media Zalo về MinIO' });
    }
  });

  // GET /api/admin/storage/drives/:id/scan-backup
  router.get('/admin/storage/drives/:id/scan-backup', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const driveId = String(req.params.id || '');
      const result = await backupImporterService.scanDriveForBackups(driveId);
      res.json(result);
    } catch (err: any) {
      logger.error('scan_backup_failed', { error: err?.message || String(err) });
      res.status(400).json({ error: err?.message || 'Không thể quét file sao lưu trên Google Drive' });
    }
  });

  // POST /api/admin/storage/drives/:id/import-backup
  router.post('/admin/storage/drives/:id/import-backup', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const driveId = String(req.params.id || '');
      const { fileId, accountId, backupPassword } = req.body || {};
      if (!fileId) {
        res.status(400).json({ error: 'fileId là bắt buộc' });
        return;
      }
      if (!accountId) {
        res.status(400).json({ error: 'accountId là bắt buộc' });
        return;
      }
      const result = await backupImporterService.importBackupFile(driveId, fileId, accountId, backupPassword);
      res.json(result);
    } catch (err: any) {
      logger.error('import_backup_failed', { error: err?.message || String(err) });
      res.status(400).json({ error: err?.message || 'Lỗi khi nhập bản sao lưu' });
    }
  });

  return router;
}
