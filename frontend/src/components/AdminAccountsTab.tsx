import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useState } from 'react';
import { api } from '../api';
import type { AccountSummary } from '../types';
import { getAccountDisplayName, getInitial } from '../utils';

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
      <div className={`text-sm break-words ${tone === 'accent' ? 'text-[#9fc0ff]' : 'text-[#eef2ff]'}`}>
        {value?.trim() || 'Chưa có'}
      </div>
    </div>
  );
}

export function AdminAccountsTab({ accounts, onRefresh, setError, setStatus }: Props) {
  const [editingAccountId, setEditingAccountId] = useState('');
  const [aliasValue, setAliasValue] = useState('');
  const [savingAlias, setSavingAlias] = useState(false);

  const handleLogout = async (accountId: string) => {
    if (!confirm('Logout tai khoan nay?')) return;
    try { await api.adminLogoutAccount(accountId); setStatus('Da logout'); onRefresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Logout that bai'); }
  };

  const handleDelete = async (accountId: string) => {
    if (!confirm('XOA VINH VIEN tai khoan nay?')) return;
    try { await api.adminDeleteAccount(accountId); setStatus('Da xoa'); onRefresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Xoa that bai'); }
  };

  const handleMobileSync = async (accountId: string) => {
    setStatus('Dang dong bo Mobile (req_18)...');
    try {
      const r = await api.accountMobileSync(accountId);
      setStatus(`Mobile sync xong: ${r.requ18Received} tin tu req_18 + ${r.historySynced} cuoc tro chuyen qua history (tong ${r.requ18Inserted + (r.results?.reduce((s: number, x: any) => s + (x.historyResult?.remoteCount || 0), 0) || 0)} tin)`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Mobile sync that bai'); }
  };

  const handleSync = async (accountId: string) => {
    setStatus('Dang dong bo...');
    try {
      const r = await api.accountSyncAll(accountId);
      setStatus(`Dong bo xong: ${r.synced} cuoc tro chuyen`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Dong bo that bai'); }
  };

  const handleSyncProfile = async (accountId: string) => {
    setStatus('Dang dong bo profile account...');
    try {
      await api.adminSyncAccountProfile(accountId);
      setStatus('Da dong bo profile account');
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dong bo profile that bai');
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
      await api.adminUpdateAccount(editingAccountId, { hubAlias: aliasValue.trim() || undefined });
      setStatus('Da cap nhat alias account');
      closeAliasDialog();
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cap nhat alias that bai');
    } finally {
      setSavingAlias(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-bold text-[#eee]">Tài khoản Zalo ({accounts.length})</h2>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {accounts.map((a) => (
          <Card key={a.accountId} className="p-4 bg-[#13181f] border-[var(--border)] flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Avatar className="w-12 h-12 rounded-2xl shrink-0">
                  {a.avatar ? <img src={a.avatar} alt={getAccountDisplayName(a)} className="w-full h-full object-cover rounded-2xl" /> : null}
                  <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#08101d] text-base font-extrabold rounded-2xl">
                    {getInitial(getAccountDisplayName(a))}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-[#eef2ff] truncate">{getAccountDisplayName(a)}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 truncate">{a.phoneNumber?.trim() || a.accountId}</div>
                </div>
              </div>
              <Badge variant={a.isActive ? 'default' : 'destructive'} className="text-[10px] shrink-0 mt-1">
                {a.isActive ? 'Active' : 'Idle'}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow label="Tên hiển thị" value={getAccountDisplayName(a)} tone={a.hubAlias ? 'accent' : 'default'} />
              <InfoRow label="Tên Zalo" value={a.displayName} />
              <InfoRow label="Alias nội bộ" value={a.hubAlias} tone="accent" />
              <InfoRow label="Số điện thoại" value={a.phoneNumber} />
              <div className="sm:col-span-2">
                <InfoRow label="Account ID" value={a.accountId} />
              </div>
            </div>

            <Separator className="bg-white/8" />

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
              <Button variant="ghost" size="sm" className="h-8 text-[11px] text-[#ffcc88]" onClick={() => handleLogout(a.accountId)}>
                ⏏️ Logout
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-[11px] text-[#ff8888]" onClick={() => handleDelete(a.accountId)}>
                🗑️ Xóa
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={Boolean(editingAccountId)} onOpenChange={(open) => { if (!open) closeAliasDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa alias account</DialogTitle>
            <DialogDescription>
              Alias nội bộ sẽ được ưu tiên hiển thị thay cho tên Zalo khi có giá trị.
            </DialogDescription>
          </DialogHeader>
          <Input value={aliasValue} onChange={(event) => setAliasValue(event.target.value)} placeholder="Để trống để dùng tên Zalo mặc định" autoFocus />
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
