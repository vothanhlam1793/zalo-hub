import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { bff } from '@/bff-api';
import type { StorageDrive, StorageSettings, StorageStats, AccountSummary } from '@/types';

interface AdminStorageTabProps {
  accounts: AccountSummary[];
}

function formatBytes(bytes: number, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function AdminStorageTab({ accounts }: AdminStorageTabProps) {
  const [drives, setDrives] = useState<StorageDrive[]>([]);
  const [settings, setSettings] = useState<StorageSettings>({
    hotRetentionDays: 3,
    autoOffloadEnabled: true,
    cronIntervalMinutes: 60,
    defaultDriveStrategy: 'account_mapping',
  });
  const [stats, setStats] = useState<StorageStats>({
    hotAttachmentsCount: 0,
    coldAttachmentsCount: 0,
    hotTotalBytes: 0,
    coldTotalBytes: 0,
    drivesCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [offloading, setOffloading] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [testingDriveId, setTestingDriveId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 5000);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 6000);
  };

  // Dialog State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDrive, setEditingDrive] = useState<StorageDrive | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formClientId, setFormClientId] = useState('');
  const [formClientSecret, setFormClientSecret] = useState('');
  const [formRefreshToken, setFormRefreshToken] = useState('');
  const [formRootFolderId, setFormRootFolderId] = useState('');
  const [formAssignedAccounts, setFormAssignedAccounts] = useState<string[]>([]);
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // OAuth 1-Click State (CLIProxy style)
  const [authMode, setAuthMode] = useState<'oauth' | 'manual'>('oauth');
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthUrl, setOauthUrl] = useState('');
  const [oauthCodeOrUrl, setOauthCodeOrUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [modalError, setModalError] = useState('');

  // Backup Import Modal State
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [selectedBackupDrive, setSelectedBackupDrive] = useState<StorageDrive | null>(null);
  const [backupFiles, setBackupFiles] = useState<Array<{ id: string; name: string; size?: number; mimeType?: string; modifiedTime?: string; space: 'appDataFolder' | 'drive' }>>([]);
  const [scanningBackup, setScanningBackup] = useState(false);
  const [selectedBackupFileId, setSelectedBackupFileId] = useState('');
  const [backupTargetAccountId, setBackupTargetAccountId] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [importingBackup, setImportingBackup] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [drivesRes, settingsRes] = await Promise.all([
        bff.getStorageDrives(),
        bff.getStorageSettings(),
      ]);
      setDrives(drivesRes.drives || []);
      setSettings(settingsRes.settings);
      setStats(settingsRes.stats);
    } catch (err: any) {
      console.warn('Không thể tải dữ liệu lưu trữ:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveSettings = async (newRetentionDays: number, autoEnabled: boolean) => {
    setSavingSettings(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await bff.updateStorageSettings({
        hotRetentionDays: newRetentionDays,
        autoOffloadEnabled: autoEnabled,
      });
      setSettings(res.settings);
      showStatus('Đã cập nhật cấu hình lưu trữ');
    } catch (err: any) {
      showError(err?.message || 'Lỗi lưu cấu hình');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTriggerOffload = async () => {
    if (!confirm('Bạn có chắc muốn chạy dịch chuyển các file cũ hơn ' + settings.hotRetentionDays + ' ngày lên Google Drive ngay bây giờ?')) {
      return;
    }
    setOffloading(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await bff.triggerOffloadNow(200);
      const r = res.result;
      showStatus(`Đã dịch chuyển thành công ${r.totalOffloaded}/${r.totalScanned} files. Tiết kiệm ${formatBytes(r.bytesSaved)} MinIO VPS!`);
      await loadAll();
    } catch (err: any) {
      showError(err?.message || 'Lỗi khi chạy dịch chuyển dữ liệu');
    } finally {
      setOffloading(false);
    }
  };

  const handleBackfillMedia = async () => {
    setBackfilling(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await bff.backfillRemoteMedia(200);
      const r = res.result;
      showStatus(`Đã tải và lưu trữ thành công ${r.mirrored}/${r.scanned} files media từ Zalo về MinIO VPS (${formatBytes(r.totalBytes)}).`);
      await loadAll();
    } catch (err: any) {
      showError(err?.message || 'Lỗi khi tải media Zalo');
    } finally {
      setBackfilling(false);
    }
  };

  const handleTestDrive = async (driveId: string) => {
    setTestingDriveId(driveId);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await bff.testStorageDrive(driveId);
      showStatus(`Kết nối Google Drive thành công: ${res.email || res.displayName || 'OK'}`);
      await loadAll();
    } catch (err: any) {
      showError(err?.message || 'Kiểm tra kết nối thất bại');
    } finally {
      setTestingDriveId(null);
    }
  };

  const handleOpenBackupModal = async (drive: StorageDrive) => {
    setSelectedBackupDrive(drive);
    setSelectedBackupFileId('');
    setBackupPassword('');
    setBackupFiles([]);
    setIsBackupModalOpen(true);
    setScanningBackup(true);
    setErrorMsg('');
    try {
      const res = await bff.scanDriveBackups(drive.id);
      setBackupFiles(res.files || []);
      if (res.files && res.files.length > 0) {
        setSelectedBackupFileId(res.files[0].id);
      }
      if (accounts && accounts.length > 0) {
        setBackupTargetAccountId(accounts[0].accountId);
      }
    } catch (err: any) {
      showError(err?.message || 'Không thể quét file sao lưu trên Google Drive');
    } finally {
      setScanningBackup(false);
    }
  };

  const handleExecuteBackupImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBackupDrive || !selectedBackupFileId || !backupTargetAccountId) {
      showError('Vui lòng chọn đầy đủ File sao lưu và Tài khoản Zalo nhận dữ liệu');
      return;
    }

    setImportingBackup(true);
    try {
      const res = await bff.importDriveBackup(selectedBackupDrive.id, {
        fileId: selectedBackupFileId,
        accountId: backupTargetAccountId,
        backupPassword: backupPassword.trim() || undefined,
      });
      if (res.success) {
        showStatus(`Đã kết nối và xử lý bản sao lưu thành công!`);
        setIsBackupModalOpen(false);
        await loadAll();
      } else {
        showError(res.error || 'Lỗi khi nhập bản sao lưu');
      }
    } catch (err: any) {
      showError(err?.message || 'Lỗi khi nhập bản sao lưu');
    } finally {
      setImportingBackup(false);
    }
  };

  const handleDeleteDrive = async (driveId: string, name: string) => {
    if (!confirm(`Bạn có chắc muốn xóa cấu hình Drive "${name}"? Các file đã lưu trên Drive vẫn tồn tại nhưng sẽ không thể stream.`)) {
      return;
    }
    try {
      await bff.deleteStorageDrive(driveId);
      showStatus(`Đã xóa Google Drive "${name}"`);
      await loadAll();
    } catch (err: any) {
      showError(err?.message || 'Lỗi khi xóa Drive');
    }
  };

  const handleOpenCreateModal = async () => {
    setEditingDrive(null);
    setFormName('');
    setFormEmail('');
    setFormClientId('');
    setFormClientSecret('');
    setFormRefreshToken('');
    setFormRootFolderId('');
    setFormAssignedAccounts([]);
    setFormIsDefault(drives.length === 0);
    setAuthMode('oauth');
    setOauthCodeOrUrl('');
    setCopiedLink(false);
    setModalError('');
    setIsModalOpen(true);

    // Pre-fetch Google OAuth URL
    setOauthLoading(true);
    try {
      const res = await bff.getGoogleOAuthUrl();
      if (res && res.authUrl) {
        setOauthUrl(res.authUrl);
      }
    } catch (err: any) {
      setModalError('Chưa tải được link Google OAuth: ' + (err?.message || 'Lỗi server'));
    } finally {
      setOauthLoading(false);
    }
  };

  const handleExchangeOAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oauthCodeOrUrl.trim()) {
      setModalError('Vui lòng dán link chuyển hướng hoặc mã code xác thực');
      return;
    }

    setModalSubmitting(true);
    setModalError('');
    try {
      const res = await bff.exchangeGoogleOAuth({
        codeOrUrl: oauthCodeOrUrl.trim(),
        name: formName.trim() || undefined,
        isDefault: formIsDefault,
        assignedAccounts: formAssignedAccounts,
      });
      setStatusMsg(`Đã kết nối thành công Google Drive (${res.email || res.displayName || 'Google Drive'})!`);
      setIsModalOpen(false);
      await loadAll();
    } catch (err: any) {
      setModalError(err?.message || 'Xác thực thất bại');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleOpenEditModal = (drive: StorageDrive) => {
    setEditingDrive(drive);
    setFormName(drive.name);
    setFormEmail(drive.accountEmail || '');
    setFormClientId('');
    setFormClientSecret('');
    setFormRefreshToken('');
    setFormRootFolderId(drive.rootFolderId || '');
    setFormAssignedAccounts(drive.assignedAccounts || []);
    setFormIsDefault(drive.isDefault);
    setAuthMode('manual');
    setModalError('');
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setModalError('Vui lòng nhập tên gợi nhớ');
      return;
    }
    if (!editingDrive && (!formClientId || !formClientSecret || !formRefreshToken)) {
      setModalError('Vui lòng nhập đầy đủ Client ID, Client Secret và Refresh Token');
      return;
    }

    setModalSubmitting(true);
    setModalError('');
    try {
      if (editingDrive) {
        await bff.updateStorageDrive(editingDrive.id, {
          name: formName.trim(),
          accountEmail: formEmail.trim() || undefined,
          rootFolderId: formRootFolderId.trim() || undefined,
          assignedAccounts: formAssignedAccounts,
          isDefault: formIsDefault,
          clientId: formClientId.trim() || undefined,
          clientSecret: formClientSecret.trim() || undefined,
          refreshToken: formRefreshToken.trim() || undefined,
        });
        setStatusMsg('Đã cập nhật Google Drive');
      } else {
        await bff.createStorageDrive({
          name: formName.trim(),
          accountEmail: formEmail.trim() || undefined,
          clientId: formClientId.trim(),
          clientSecret: formClientSecret.trim(),
          refreshToken: formRefreshToken.trim(),
          rootFolderId: formRootFolderId.trim() || undefined,
          assignedAccounts: formAssignedAccounts,
          isDefault: formIsDefault,
        });
        setStatusMsg('Đã thêm Google Drive mới');
      }
      setIsModalOpen(false);
      await loadAll();
    } catch (err: any) {
      setModalError(err?.message || 'Lỗi lưu Google Drive');
    } finally {
      setModalSubmitting(false);
    }
  };

  const toggleAccountAssignment = (accountId: string) => {
    if (formAssignedAccounts.includes(accountId)) {
      setFormAssignedAccounts(formAssignedAccounts.filter((id) => id !== accountId));
    } else {
      setFormAssignedAccounts([...formAssignedAccounts, accountId]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border)]">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <span>💾</span> Quản lý Lưu trữ & Dịch chuyển (Multi-Drive Offloader)
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tự động đẩy hình ảnh, video và file cũ lên Google Drive cá nhân sau 3–5 ngày để tiết kiệm dung lượng VPS.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleBackfillMedia}
            disabled={backfilling}
            className="text-xs font-semibold gap-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20"
          >
            {backfilling ? '⏳ Đang tải media...' : '📥 Lưu Media Zalo về MinIO'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleTriggerOffload}
            disabled={offloading || drives.length === 0}
            className="text-xs font-semibold gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
          >
            {offloading ? '⏳ Đang dịch chuyển...' : '⚡ Dịch chuyển lên Drive'}
          </Button>
          <Button
            size="sm"
            onClick={handleOpenCreateModal}
            className="text-xs font-semibold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <span>➕</span> Thêm Google Drive
          </Button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-2.5 px-3 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✅</span> {statusMsg}
          </div>
          <button onClick={() => setStatusMsg('')} className="text-muted-foreground hover:text-foreground text-xs ml-2">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-2.5 px-3 bg-destructive/10 border border-destructive/20 rounded-md text-xs text-destructive flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span> {errorMsg}
          </div>
          <button onClick={() => setErrorMsg('')} className="text-muted-foreground hover:text-foreground text-xs ml-2">✕</button>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold flex items-center gap-1.5">
              <span>🔥</span> Hot Storage (MinIO VPS)
            </span>
            <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 border-red-500/20">
              {settings.hotRetentionDays} ngày gần nhất
            </Badge>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold">{formatBytes(stats.hotTotalBytes)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {stats.hotAttachmentsCount.toLocaleString()} files đang lưu trên VPS
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold flex items-center gap-1.5">
              <span>☁️</span> Cold Storage (Google Drive)
            </span>
            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">
              Lưu vĩnh viễn
            </Badge>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold">{formatBytes(stats.coldTotalBytes)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {stats.coldAttachmentsCount.toLocaleString()} files đã lưu trữ trên Cloud
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold flex items-center gap-1.5">
              <span>📁</span> Tổng số Google Drives
            </span>
            <Badge variant="outline" className="text-[10px]">
              Multi-Drive
            </Badge>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold">{drives.length} Accounts</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {drives.filter((d) => d.status === 'active').length} đang hoạt động
            </div>
          </div>
        </div>
      </div>

      {/* Lifecycle Configuration Section */}
      <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <span>⚙️</span> Cấu hình Vòng đời Lưu trữ (Retention & Automation)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div>
            <label className="text-xs font-medium block mb-1.5">
              Thời gian giữ trên Hot Storage (MinIO VPS):
            </label>
            <div className="flex items-center gap-2">
              <select
                className="h-8 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs shadow-xs"
                value={settings.hotRetentionDays}
                disabled={savingSettings}
                onChange={(e) => handleSaveSettings(Number(e.target.value), settings.autoOffloadEnabled)}
              >
                <option value={1}>1 ngày</option>
                <option value={2}>2 ngày</option>
                <option value={3}>3 ngày (Khuyến nghị)</option>
                <option value={5}>5 ngày</option>
                <option value={7}>7 ngày</option>
                <option value={14}>14 ngày</option>
                <option value={30}>30 ngày</option>
              </select>
              <span className="text-[11px] text-muted-foreground">
                Sau thời gian này, file sẽ tự động chuyển lên Google Drive và xóa khỏi VPS.
              </span>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1.5">
              Tác vụ Nền Tự động (Auto Offload Worker):
            </label>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoOffloadToggle"
                checked={settings.autoOffloadEnabled}
                disabled={savingSettings}
                onChange={(e) => handleSaveSettings(settings.hotRetentionDays, e.target.checked)}
                className="rounded border-input text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              <label htmlFor="autoOffloadToggle" className="text-xs cursor-pointer">
                Tự động quét và đẩy file lên Google Drive mỗi giờ
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Drive List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <span>☁️</span> Danh sách Google Drive Đã Kết Nối ({drives.length})
          </h3>
        </div>

        {drives.length === 0 ? (
          <div className="p-8 border border-dashed border-[var(--border)] rounded-lg text-center bg-[var(--card)]/50">
            <div className="text-3xl mb-2">📁</div>
            <p className="text-xs font-medium">Chưa có Google Drive nào được kết nối.</p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-md mx-auto">
              Thêm tài khoản Google Drive cá nhân (như 717 hoặc 1793 với 10TB) để bắt đầu lưu trữ ảnh, video và file tài liệu vĩnh viễn.
            </p>
            <Button
              size="sm"
              onClick={handleOpenCreateModal}
              className="mt-3 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              <span>➕</span> Thêm Google Drive Đầu Tiên
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {drives.map((drive) => {
              const usedStr = drive.usedBytes ? formatBytes(drive.usedBytes) : 'N/A';
              const quotaStr = drive.quotaBytes ? formatBytes(drive.quotaBytes) : 'N/A';
              const percentUsed = drive.quotaBytes && drive.usedBytes ? Math.min(100, Math.round((drive.usedBytes / drive.quotaBytes) * 100)) : null;

              return (
                <div
                  key={drive.id}
                  className="p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] flex flex-col justify-between gap-3 shadow-xs"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[var(--foreground)]">{drive.name}</span>
                          {drive.isDefault && (
                            <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                              ⭐ Mặc định
                            </Badge>
                          )}
                          <Badge
                            variant={drive.status === 'active' ? 'default' : 'secondary'}
                            className="text-[10px]"
                          >
                            {drive.status === 'active' ? '🟢 Đang hoạt động' : '🔴 Tạm ngưng'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {drive.accountEmail ? `📧 ${drive.accountEmail}` : '📧 Chưa liên kết email'}
                        </p>
                      </div>
                    </div>

                    {/* Quota bar */}
                    {percentUsed !== null && (
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Dung lượng: {usedStr} / {quotaStr}</span>
                          <span>{percentUsed}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full ${percentUsed > 85 ? 'bg-red-500' : 'bg-blue-500'}`}
                            style={{ width: `${percentUsed}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Assigned Accounts */}
                    <div className="text-[11px] text-muted-foreground pt-1">
                      <span className="font-semibold text-[var(--foreground)]">Zalo Accounts: </span>
                      {drive.assignedAccounts.length === 0 ? (
                        <span className="italic">Áp dụng cho tất cả Zalo Accounts (Mặc định)</span>
                      ) : (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {drive.assignedAccounts.map((accId) => {
                            const acc = accounts.find((a) => a.accountId === accId);
                            return (
                              <Badge key={accId} variant="outline" className="text-[10px]">
                                {acc?.displayName || acc?.phoneNumber || accId}
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => handleTestDrive(drive.id)}
                      disabled={testingDriveId === drive.id}
                    >
                      {testingDriveId === drive.id ? '⏳ Đang test...' : '🔍 Test kết nối'}
                    </Button>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20"
                        onClick={() => handleOpenBackupModal(drive)}
                        title="Quét và nạp dữ liệu từ bản sao lưu Zalo Mobile trên Google Drive"
                      >
                        📥 Nạp Sao Lưu
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-blue-600 dark:text-blue-400"
                        onClick={() => handleOpenEditModal(drive)}
                      >
                        Sửa
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteDrive(drive.id, drive.name)}
                      >
                        Xóa
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Dialog for Add / Edit Google Drive */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <span>{editingDrive ? '⚙️ Chỉnh sửa Google Drive' : '☁️ Thêm Google Drive'}</span>
              </h3>
              <button
                className="text-muted-foreground hover:text-foreground text-sm"
                onClick={() => setIsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            {!editingDrive && (
              <div className="flex border-b border-[var(--border)] bg-muted/20">
                <button
                  type="button"
                  onClick={() => { setAuthMode('oauth'); setModalError(''); }}
                  className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                    authMode === 'oauth'
                      ? 'border-blue-600 text-blue-600 bg-background'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span>⚡</span> Đăng nhập 1-Click & Dán Link
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('manual'); setModalError(''); }}
                  className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                    authMode === 'manual'
                      ? 'border-blue-600 text-blue-600 bg-background'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span>⚙️</span> Nhập Client ID / Secret Thủ công
                </button>
              </div>
            )}

            {modalError && (
              <div className="m-4 mb-0 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-xs text-destructive flex items-center gap-2">
                <span>⚠️</span> {modalError}
              </div>
            )}

            {/* OAuth 1-Click & CLIProxy Mode */}
            {!editingDrive && authMode === 'oauth' ? (
              <form onSubmit={handleExchangeOAuth} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                <div>
                  <label className="text-xs font-semibold block mb-1">
                    Tên gợi nhớ (tùy chọn):
                  </label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Để trống sẽ tự động lấy theo Email của Google Drive"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>

                {/* Step 1: Open Google OAuth or Copy Link */}
                <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                      <span>1️⃣</span> Bước 1: Mở hoặc Sao chép link ủy quyền Google
                    </span>
                    {oauthLoading && <span className="text-[11px] text-muted-foreground">⏳ Đang tạo link...</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Cấp quyền Google Drive (bao gồm sao lưu Zalo Mobile) trong 1 cú nhấp:
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!oauthUrl || oauthLoading}
                      onClick={() => window.open(oauthUrl, '_blank')}
                      className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 flex-1"
                    >
                      <span>🔗</span> Mở đăng nhập Google
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!oauthUrl || oauthLoading}
                      onClick={() => {
                        navigator.clipboard.writeText(oauthUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 3000);
                      }}
                      className="h-8 text-xs gap-1.5"
                    >
                      <span>{copiedLink ? '✅ Đã chép!' : '📋 Copy Link'}</span>
                    </Button>
                  </div>
                </div>

                {/* Step 2: Paste Redirect Link or Code */}
                <div className="p-3.5 bg-muted/40 border border-[var(--border)] rounded-lg space-y-2.5">
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <span>2️⃣</span> Bước 2: Dán Redirect URL hoặc Code xác thực (Kiểu CLIProxy)
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Sau khi bấm <strong>"Cho phép"</strong> trên Google, nếu màn hình hiện link <code>http://localhost:53682/callback?code=...</code> hoặc không tải được, hãy <strong>sao chép toàn bộ thanh địa chỉ trình duyệt</strong> rồi dán vào đây:
                  </p>
                  <Input
                    className="h-8 text-xs font-mono"
                    placeholder="Dán link http://... hoặc mã code 4/0A... vào đây"
                    value={oauthCodeOrUrl}
                    onChange={(e) => setOauthCodeOrUrl(e.target.value)}
                    required
                  />
                </div>

                {/* Account assignment */}
                <div>
                  <label className="text-xs font-semibold block mb-1">
                    Phân bổ Zalo Accounts nhận lưu trữ (tùy chọn):
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 border border-input rounded-md bg-background">
                    {accounts.map((acc) => {
                      const selected = formAssignedAccounts.includes(acc.accountId);
                      return (
                        <button
                          type="button"
                          key={acc.accountId}
                          onClick={() => toggleAccountAssignment(acc.accountId)}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                            selected
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-muted/50 text-muted-foreground border-transparent hover:border-input'
                          }`}
                        >
                          {acc.displayName} ({acc.phoneNumber || acc.accountId}) {selected && '✓'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="modalIsDefaultOauth"
                    checked={formIsDefault}
                    onChange={(e) => setFormIsDefault(e.target.checked)}
                    className="rounded border-input text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <label htmlFor="modalIsDefaultOauth" className="text-xs cursor-pointer">
                    Đặt làm Google Drive Mặc định
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Hủy
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={modalSubmitting || !oauthCodeOrUrl.trim()}
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  >
                    {modalSubmitting ? '⏳ Đang xác thực...' : '🚀 Xác nhận & Kết nối Drive'}
                  </Button>
                </div>
              </form>
            ) : (
              /* Manual Mode Form */
              <form onSubmit={handleModalSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                <div>
                  <label className="text-xs font-semibold block mb-1">
                    Tên gợi nhớ: <span className="text-destructive">*</span>
                  </label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Ví dụ: Google Drive 717 (10TB) hoặc Drive 1793"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">
                    Email tài khoản Google (tùy chọn):
                  </label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Ví dụ: vothanhlam1793@gmail.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-3 p-3 bg-muted/40 rounded-lg border border-[var(--border)]">
                  <div className="text-xs font-bold flex items-center justify-between">
                    <span>🔑 Google OAuth 2.0 Credentials:</span>
                    {editingDrive && (
                      <span className="text-[10px] text-muted-foreground font-normal">
                        (Để trống nếu không muốn đổi token)
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      Client ID: {!editingDrive && <span className="text-destructive">*</span>}
                    </label>
                    <Input
                      className="h-8 text-xs font-mono"
                      placeholder="xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com"
                      value={formClientId}
                      onChange={(e) => setFormClientId(e.target.value)}
                      required={!editingDrive}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      Client Secret: {!editingDrive && <span className="text-destructive">*</span>}
                    </label>
                    <Input
                      type="password"
                      className="h-8 text-xs font-mono"
                      placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx"
                      value={formClientSecret}
                      onChange={(e) => setFormClientSecret(e.target.value)}
                      required={!editingDrive}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      Refresh Token: {!editingDrive && <span className="text-destructive">*</span>}
                    </label>
                    <Input
                      type="password"
                      className="h-8 text-xs font-mono"
                      placeholder="1//04xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={formRefreshToken}
                      onChange={(e) => setFormRefreshToken(e.target.value)}
                      required={!editingDrive}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">
                    Root Folder ID (tùy chọn):
                  </label>
                  <Input
                    className="h-8 text-xs font-mono"
                    placeholder="Để trống sẽ tự động tạo thư mục ZaloHub_Archive"
                    value={formRootFolderId}
                    onChange={(e) => setFormRootFolderId(e.target.value)}
                  />
                </div>

                {/* Assign to Zalo Accounts */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold block">
                    Phân bổ tài khoản Zalo lưu trữ vào Drive này:
                  </label>
                  <div className="grid grid-cols-2 gap-2 mt-2 max-h-32 overflow-y-auto p-2 border border-input rounded-md bg-transparent">
                    {accounts.map((acc) => {
                      const checked = formAssignedAccounts.includes(acc.accountId);
                      return (
                        <label
                          key={acc.accountId}
                          className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 p-1 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAccountAssignment(acc.accountId)}
                            className="rounded border-input text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                          />
                          <span className="truncate">{acc.displayName} ({acc.phoneNumber || acc.accountId})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="formIsDefault"
                    checked={formIsDefault}
                    onChange={(e) => setFormIsDefault(e.target.checked)}
                    className="rounded border-input text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <label htmlFor="formIsDefault" className="text-xs font-semibold cursor-pointer">
                    Đặt làm Google Drive Mặc định
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Hủy
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={modalSubmitting}
                  >
                    {modalSubmitting ? 'Đang lưu...' : editingDrive ? 'Cập nhật' : 'Thêm Google Drive'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal Dialog for Zalo Google Drive Backup Import */}
      {isBackupModalOpen && selectedBackupDrive && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <span>📥 Nạp Lịch Sử Sao Lưu từ Google Drive</span>
              </h3>
              <button
                className="text-muted-foreground hover:text-foreground text-sm"
                onClick={() => setIsBackupModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleExecuteBackupImport} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs text-purple-600 dark:text-purple-400 space-y-1">
                <p className="font-semibold">
                  Ổ Drive được chọn: {selectedBackupDrive.name} ({selectedBackupDrive.accountEmail || 'Không có email'})
                </p>
                <p className="text-[11px] opacity-90">
                  Hệ thống tự động quét vùng AppData của Zalo trên Drive này để tìm bản sao lưu tin nhắn.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">
                  Chọn file sao lưu tìm thấy trên Drive: <span className="text-destructive">*</span>
                </label>
                {scanningBackup ? (
                  <div className="p-3 bg-muted rounded text-xs text-muted-foreground animate-pulse">
                    ⏳ Đang quét bản sao lưu trên Google Drive...
                  </div>
                ) : backupFiles.length === 0 ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-600 dark:text-amber-400">
                    ⚠️ Không tìm thấy file sao lưu Zalo nào trong AppData hoặc thư mục gốc của Drive này. Hãy đảm bảo bạn đã chạy sao lưu trên Zalo Mobile lên đúng tài khoản Google này.
                  </div>
                ) : (
                  <select
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={selectedBackupFileId}
                    onChange={(e) => setSelectedBackupFileId(e.target.value)}
                    required
                  >
                    {backupFiles.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.size ? formatBytes(f.size) : 'N/A'}) - [{f.space}]
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">
                  Nạp dữ liệu vào Tài khoản Zalo: <span className="text-destructive">*</span>
                </label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={backupTargetAccountId}
                  onChange={(e) => setBackupTargetAccountId(e.target.value)}
                  required
                >
                  {accounts.map((acc) => (
                    <option key={acc.accountId} value={acc.accountId}>
                      {acc.displayName || acc.phoneNumber || acc.accountId} ({acc.phoneNumber || 'Không có SĐT'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">
                  Mật khẩu sao lưu (nếu có đặt trên Zalo):
                </label>
                <Input
                  type="password"
                  className="h-8 text-xs font-mono"
                  placeholder="Nhập mật khẩu mã hóa sao lưu của bạn..."
                  value={backupPassword}
                  onChange={(e) => setBackupPassword(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Mật khẩu bạn đã đặt khi bật tính năng "Sao lưu & Khôi phục" trên ứng dụng Zalo điện thoại.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setIsBackupModalOpen(false)}
                >
                  Đóng
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="text-xs bg-purple-600 hover:bg-purple-700 text-white"
                  disabled={importingBackup || scanningBackup || backupFiles.length === 0}
                >
                  {importingBackup ? '⏳ Đang nạp dữ liệu...' : '🚀 Bắt đầu Nạp Tin Nhắn'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
