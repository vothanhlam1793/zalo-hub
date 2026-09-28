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

  // GET /api/admin/storage/oauth/google-url
  router.get('/admin/storage/oauth/google-url', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || '';
      const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost:53682/callback';
      const scopes = [
        'https://www.googleapis.com/auth/drive.appdata',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ].join(' ');

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;

      res.json({
        ok: true,
        authUrl,
        clientId,
        redirectUri,
      });
    } catch (err: any) {
      logger.error('get_google_oauth_url_failed', { error: err?.message || String(err) });
      res.status(500).json({ error: 'Không thể sinh URL xác thực Google' });
    }
  });

  // POST /api/admin/storage/oauth/exchange (CLIProxy style code / redirect url exchange)
  router.post('/admin/storage/oauth/exchange', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const rawInput = String(body.codeOrUrl || '').trim();
      if (!rawInput) {
        res.status(400).json({ error: 'Vui lòng cung cấp link chuyển hướng hoặc mã code xác thực' });
        return;
      }

      // Extract authorization code from raw string or URL
      let code = rawInput;
      let redirectUri = 'http://localhost:53682/callback';

      if (rawInput.includes('code=')) {
        try {
          const parsedUrl = new URL(rawInput.startsWith('http') ? rawInput : `http://dummy.com/${rawInput}`);
          const c = parsedUrl.searchParams.get('code');
          if (c) code = c;
          if (rawInput.startsWith('http')) {
            redirectUri = `${parsedUrl.origin}${parsedUrl.pathname}`;
          }
        } catch {
          const match = rawInput.match(/code=([^&]+)/);
          if (match) code = decodeURIComponent(match[1]);
        }
      }

      const clientId = body.clientId || process.env.GOOGLE_DRIVE_CLIENT_ID || '';
      const clientSecret = body.clientSecret || process.env.GOOGLE_DRIVE_CLIENT_SECRET || '';

      // 1. Exchange authorization code for tokens
      const redirectCandidates = [redirectUri, 'http://localhost:53682/callback', 'http://localhost'];
      let tokenData: any = null;
      let lastErrText = '';

      for (const uri of redirectCandidates) {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: uri,
          }),
        });

        if (tokenRes.ok) {
          tokenData = await tokenRes.json();
          break;
        } else {
          lastErrText = await tokenRes.text();
        }
      }

      if (!tokenData || !tokenData.refresh_token) {
        throw new Error(`Xác thực với Google thất bại: ${lastErrText || 'Không nhận được refresh_token'}`);
      }

      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;

      // 2. Fetch User Profile and Storage Quota from Google Drive API
      const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress),storageQuota(limit,usage)', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let email = body.accountEmail ? String(body.accountEmail).trim() : undefined;
      let displayName = 'Google Drive';
      let quotaLimit: number | undefined;
      let quotaUsage: number | undefined;

      if (aboutRes.ok) {
        const aboutData = await aboutRes.json() as any;
        if (aboutData.user?.emailAddress) email = aboutData.user.emailAddress;
        if (aboutData.user?.displayName) displayName = aboutData.user.displayName;
        if (aboutData.storageQuota?.limit) quotaLimit = Number(aboutData.storageQuota.limit);
        if (aboutData.storageQuota?.usage) quotaUsage = Number(aboutData.storageQuota.usage);
      }

      const driveName = String(body.name || '').trim() || (email ? `Drive (${email})` : `Google Drive ${displayName}`);

      // 3. Save into storage_drives table
      const existingDrives = await storageRepo.getDrives();
      const isDefault = body.isDefault !== undefined ? Boolean(body.isDefault) : existingDrives.length === 0;

      const drive = await storageRepo.createDrive({
        name: driveName,
        provider: 'gdrive',
        accountEmail: email,
        credentials: {
          clientId,
          clientSecret,
          refreshToken,
          accessToken,
          tokenExpiry: Date.now() + ((tokenData.expires_in || 3600) * 1000),
        },
        rootFolderId: body.rootFolderId ? String(body.rootFolderId).trim() : undefined,
        assignedAccounts: Array.isArray(body.assignedAccounts) ? body.assignedAccounts : [],
        isDefault,
        status: 'active',
      });

      if (quotaUsage !== undefined || quotaLimit !== undefined) {
        await storageRepo.updateDrive(drive.id, {
          usedBytes: quotaUsage !== undefined ? quotaUsage : undefined,
          quotaBytes: quotaLimit !== undefined ? quotaLimit : undefined,
        });
      }

      offloaderService.clearDriveClientCache();
      logger.info('google_drive_oauth_connected', { driveId: drive.id, email, driveName });

      res.json({
        ok: true,
        drive,
        email,
        displayName,
        quotaLimit,
        quotaUsage,
      });
    } catch (err: any) {
      logger.error('oauth_exchange_failed', { error: err?.message || String(err) });
      res.status(400).json({ error: err?.message || 'Lỗi trao đổi token với Google' });
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
