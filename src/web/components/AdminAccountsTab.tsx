import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '../api';
import type { AccountSummary } from '../types';

interface Props {
  accounts: AccountSummary[];
  onRefresh: () => void;
  setError: (e: string) => void;
  setStatus: (e: string) => void;
}

export function AdminAccountsTab({ accounts, onRefresh, setError, setStatus }: Props) {
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

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-bold text-[#eee]">Tài khoản Zalo ({accounts.length})</h2>
      <div className="grid grid-cols-2 gap-3">
        {accounts.map((a) => (
          <Card key={a.accountId} className="p-4 bg-[#13181f] border-[var(--border)] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium text-[#eee] truncate">{a.displayName || (a as any).account?.displayName || a.accountId}</div>
                <div className="text-[11px] text-muted-foreground truncate">{(a.accountId || '').slice(0, 20)}...</div>
              </div>
              <Badge variant={a.isActive ? 'default' : 'destructive'} className="text-[10px] shrink-0">
                {a.isActive ? 'Online' : 'Offline'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="secondary" size="sm" className="h-7 text-[11px]" onClick={() => handleMobileSync(a.accountId)}>
                📱 Mobile
              </Button>
              <Button variant="secondary" size="sm" className="h-7 text-[11px]" onClick={() => handleSync(a.accountId)}>
                🔄 Đồng bộ
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-[11px] text-[#ffcc88]" onClick={() => handleLogout(a.accountId)}>
                ⏏️ Logout
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-[11px] text-[#ff8888]" onClick={() => handleDelete(a.accountId)}>
                🗑️ Xoá
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
