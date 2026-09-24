import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { bff } from '@/bff-api';
import { useAuthStore } from '@/stores/auth-store';
import { MyAccountsTab } from '@/features/accounts/components/MyAccountsTab';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AdminUsersTab } from './AdminUsersTab';
import { AdminTagsTab } from './AdminTagsTab';
import DifyBotsTab from './DifyBotsTab';
import type { AccountSummary } from '@/types';

interface AdminUser {
  id: string; email: string; displayName: string; type: string; role?: string;
  memberships: Array<{ account_id: string; role: string }>;
}

type TabKey = 'myaccounts' | 'tags' | 'users' | 'allaccounts' | 'difybots';

export default function AdminPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('myaccounts');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  const loadData = async () => {
    try {
      const [u, a] = await Promise.all([bff.adminUsers(), bff.accounts()]);
      setUsers(u.users);
      setAccounts(a.accounts);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadData(); }, [isSuperAdmin]);

  const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
    { key: 'myaccounts', label: 'Tài khoản của tôi', icon: '📱' },
    { key: 'tags', label: 'Quản lý Nhãn (Tags)', icon: '🏷️' },
  ];

  if (isSuperAdmin) {
    tabs.push(
      { key: 'users', label: 'Người dùng', icon: '👤' },
      { key: 'allaccounts', label: 'Tất cả Accounts', icon: '🔐' },
      { key: 'difybots', label: 'Dify Bots', icon: '🤖' },
    );
  }

  return (
    <div className="flex-1 flex min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors">
      <div className="w-[230px] min-w-[210px] border-r border-[var(--border)] flex flex-col bg-[var(--card)] transition-colors">
        <div className="px-4 py-4 border-b border-[var(--border)] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-[var(--foreground)]">Quản trị</h1>
            <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
            <Badge variant={isSuperAdmin ? 'default' : 'secondary'} className="text-[10px] mt-1">{user?.role || 'user'}</Badge>
          </div>
          <ThemeToggle />
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setError(''); setStatus(''); }}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left',
                activeTab === tab.key
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300 font-semibold border border-blue-500/30'
                  : 'text-muted-foreground hover:text-[var(--foreground)] hover:bg-[var(--accent)]',
              )}
            >
              <span className="text-sm">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-[var(--border)] flex flex-col gap-2">
          <Button variant="ghost" size="sm" className="text-xs justify-start" onClick={() => navigate('/')}>
            ← Dashboard Chat
          </Button>
          <Button variant="ghost" size="sm" className="text-xs justify-start text-red-500 hover:text-red-600 hover:bg-red-500/10" onClick={() => { logout(); navigate('/login'); }}>
            Đăng xuất
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {(status || error) && (
          <div className={`shrink-0 px-5 py-2.5 text-[13px] ${error ? 'bg-[rgba(255,80,80,0.1)] text-[#ff9a9a]' : 'bg-[rgba(60,200,120,0.1)] text-[#6fe0a0]'}`}>
            {error || status}
          </div>
        )}

        <div className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'myaccounts' && (
            <MyAccountsTab setError={setError} setStatus={setStatus} />
          )}
          {activeTab === 'tags' && (
            <AdminTagsTab accounts={accounts} setError={setError} setStatus={setStatus} />
          )}
          {activeTab === 'users' && isSuperAdmin && (
            <AdminUsersTab users={users} accounts={accounts} onRefresh={loadData} setError={setError} setStatus={setStatus} />
          )}
          {activeTab === 'allaccounts' && isSuperAdmin && (
            <SuperAdminAccountsTab accounts={accounts} onRefresh={loadData} setError={setError} setStatus={setStatus} />
          )}
          {activeTab === 'difybots' && isSuperAdmin && (
            <DifyBotsTab setError={setError} setStatus={setStatus} />
          )}
        </div>
      </div>
    </div>
  );
}

function SuperAdminAccountsTab({ accounts, onRefresh, setError, setStatus }: { accounts: AccountSummary[]; onRefresh: () => void; setError: (msg: string) => void; setStatus: (msg: string) => void }) {
  const [allAccounts, setAllAccounts] = useState<Array<any>>([]);

  useEffect(() => {
    bff.adminAllAccounts().then((r: any) => setAllAccounts(r.accounts)).catch(() => {});
  }, []);

  return (
    <div>
      <h2 className="text-sm font-bold text-[#eee] mb-4">Tất cả tài khoản Zalo</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {allAccounts.map((acc: any) => (
          <div key={acc.accountId} className="p-4 rounded-lg border border-[var(--border)] bg-[#0d1015]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-[rgba(79,122,255,0.15)] flex items-center justify-center text-sm font-bold text-[#9fc0ff]">
                {(acc.displayName || acc.accountId).charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-[#eee]">{acc.displayName || acc.accountId}</p>
                <p className="text-[11px] text-muted-foreground">{acc.accountId}</p>
              </div>
            </div>
            <div className="text-[11px] space-y-1 text-muted-foreground">
              {acc.master && <p>Master: {acc.master.displayName} ({acc.master.email})</p>}
              <p>Thành viên: {acc.memberCount}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
