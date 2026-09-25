import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import { bff } from '@/bff-api';
import type { AccountSummary } from '@/types';
import { getAccountDisplayName, getInitial } from '@/utils';

interface AdminAccountItem extends AccountSummary {
  master?: { userId: string; displayName: string; email: string } | null;
  memberCount?: number;
}

interface Props {
  accounts: AccountSummary[];
  onRefresh: () => void;
  setError: (e: string) => void;
  setStatus: (e: string) => void;
}

function InfoRow({ label, value, tone = 'default' }: { label: string; value?: string; tone?: 'default' | 'accent' }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className={`text-sm break-words ${tone === 'accent' ? 'text-blue-500 dark:text-[#9fc0ff]' : 'text-[var(--foreground)]'}`}>
        {value?.trim() || 'Chưa có'}
      </div>
    </div>
  );
}

export function AdminAccountsTab({ onRefresh, setError, setStatus }: Props) {
  const [allAccounts, setAllAccounts] = useState<AdminAccountItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState('');
  const [aliasValue, setAliasValue] = useState('');
  const [savingAlias, setSavingAlias] = useState(false);

  const loadAllAccounts = async () => {
    setLoading(true);
    try {
      const res = await bff.adminAllAccounts();
      setAllAccounts(res.accounts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách tài khoản toàn cục');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllAccounts();
  }, []);

  const handleLogout = async (accountId: string) => {
    if (!confirm('Bạn có chắc muốn đăng xuất (Logout) tài khoản này?')) return;
    try {
      await bff.adminLogoutAccount(accountId);
      setStatus('Đã đăng xuất tài khoản');
      loadAllAccounts();
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng xuất thất bại');
    }
  };

  const handleDelete = async (accountId: string) => {
    if (!confirm('CẢNH BÁO: XÓA VĨNH VIỄN tài khoản này và toàn bộ dữ liệu phiên liên quan?')) return;
    try {
      await bff.adminDeleteAccount(accountId);
      setStatus('Đã xóa tài khoản vĩnh viễn');
      loadAllAccounts();
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xóa tài khoản thất bại');
    }
  };

  const handleMobileSync = async (accountId: string) => {
    setStatus('Đang đồng bộ Mobile (req_18)...');
    try {
      const r = await bff.accountMobileSync(accountId);
      setStatus(`Mobile sync hoàn tất: ${r.requ18Received} tin từ req_18, đồng bộ ${r.historySynced} hội thoại.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mobile sync thất bại');
    }
  };

  const handleSync = async (accountId: string) => {
    setStatus('Đang đồng bộ toàn bộ lịch sử tin nhắn...');
    try {
      const r = await bff.accountSyncAll(accountId);
      setStatus(`Đồng bộ thành công: ${r.synced} cuộc trò chuyện`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đồng bộ thất bại');
    }
  };

  const handleSyncProfile = async (accountId: string) => {
    setStatus('Đang làm mới thông tin Profile từ Zalo...');
    try {
      await bff.adminSyncAccountProfile(accountId);
      setStatus('Đã cập nhật profile tài khoản');
      loadAllAccounts();
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Làm mới profile thất bại');
    }
  };

  const openAliasDialog = (account: AccountSummary) => {
    setEditingAccountId(account.accountId);
    setAliasValue(account.hubAlias ?? '');
  };

  const closeAliasDialog = () => {
    if (savingAlias) return;
    setEditingAccountId('');
    setAliasValue('');
  };

  const saveAlias = async () => {
    if (!editingAccountId || savingAlias) return;
    setSavingAlias(true);
    try {
      await bff.adminUpdateAccount(editingAccountId, { hubAlias: aliasValue.trim() || undefined });
      setStatus('Đã cập nhật alias tài khoản');
      closeAliasDialog();
      loadAllAccounts();
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cập nhật alias thất bại');
    } finally {
      setSavingAlias(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-[var(--foreground)]">
          Tất cả Tài khoản Zalo Hệ thống ({allAccounts.length})
        </h2>
        <Button variant="outline" size="sm" onClick={loadAllAccounts} disabled={loading} className="text-xs">
          {loading ? 'Đang tải...' : '🔄 Làm mới'}
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {allAccounts.map((a) => (
          <Card key={a.accountId} className="p-4 bg-[var(--card)] border-[var(--border)] flex flex-col gap-4 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Avatar className="w-12 h-12 rounded-2xl shrink-0">
                  {a.avatar ? <img src={a.avatar} alt={getAccountDisplayName(a)} className="w-full h-full object-cover rounded-2xl" /> : null}
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-base font-extrabold rounded-2xl">
                    {getInitial(getAccountDisplayName(a))}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-[var(--foreground)] truncate flex items-center gap-2">
                    {getAccountDisplayName(a)}
                    {a.hubAlias && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 font-normal">
                        {a.hubAlias}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{a.phoneNumber?.trim() || a.accountId}</div>
                </div>
              </div>
              <Badge variant={a.isActive ? 'default' : 'secondary'} className="text-[10px] shrink-0 mt-1">
                {a.isActive ? 'Active' : 'Offline / Idle'}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[var(--accent)]/30 p-3 rounded-lg text-xs">
              <InfoRow label="Tên Zalo gốc" value={a.displayName} />
              <InfoRow label="Số điện thoại" value={a.phoneNumber} />
              <InfoRow label="Master sở hữu" value={a.master ? `${a.master.displayName} (${a.master.email})` : 'Chưa có'} tone={a.master ? 'accent' : 'default'} />
              <InfoRow label="Số nhân viên được phân quyền" value={`${a.memberCount ?? 1} thành viên`} />
              <div className="sm:col-span-2">
                <InfoRow label="Account ID" value={a.accountId} />
              </div>
            </div>

            <Separator className="bg-[var(--border)]" />

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" className="h-8 text-[11px]" onClick={() => openAliasDialog(a)}>
                ✏️ Sửa alias
              </Button>
              <Button variant="secondary" size="sm" className="h-8 text-[11px]" onClick={() => handleSyncProfile(a.accountId)}>
                👤 Sync profile
              </Button>
              <Button variant="secondary" size="sm" className="h-8 text-[11px]" onClick={() => handleMobileSync(a.accountId)}>
                📱 Mobile sync
              </Button>
              <Button variant="secondary" size="sm" className="h-8 text-[11px]" onClick={() => handleSync(a.accountId)}>
                🔄 Sync history
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-[11px] text-amber-500 hover:text-amber-600 hover:bg-amber-500/10" onClick={() => handleLogout(a.accountId)}>
                ⏏️ Logout
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-[11px] text-red-500 hover:text-red-600 hover:bg-red-500/10" onClick={() => handleDelete(a.accountId)}>
                🗑️ Xóa vĩnh viễn
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={Boolean(editingAccountId)} onOpenChange={(open) => { if (!open) closeAliasDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa Alias Tài khoản Zalo</DialogTitle>
            <DialogDescription>
              Alias nội bộ giúp nhận diện mục đích tài khoản (ví dụ: CSKH 01, Kỹ Thuật, Kế Toán).
            </DialogDescription>
          </DialogHeader>
          <Input
            value={aliasValue}
            onChange={(event) => setAliasValue(event.target.value)}
            placeholder="Ví dụ: Hotline Bán Hàng 01"
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeAliasDialog} disabled={savingAlias}>
              Hủy
            </Button>
            <Button type="button" onClick={saveAlias} disabled={savingAlias}>
              {savingAlias ? 'Đang lưu...' : 'Lưu alias'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
