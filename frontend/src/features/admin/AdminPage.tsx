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
import { AdminAccountsTab } from './AdminAccountsTab';
import { AdminStorageTab } from './AdminStorageTab';
import DifyBotsTab from './DifyBotsTab';
import type { AccountSummary } from '@/types';

interface AdminUser {
  id: string; email: string; displayName: string; type: string; role?: string;
  memberships: Array<{ account_id: string; role: string }>;
}

type TabKey = 'myaccounts' | 'tags' | 'users' | 'allaccounts' | 'difybots' | 'storage';

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
      { key: 'storage', label: 'Lưu trữ & Drive', icon: '💾' },
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

        <div className="p-3 border-b border-[var(--border)]">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs font-semibold justify-start gap-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20 shadow-xs"
            onClick={() => navigate('/')}
          >
            <span>💬</span> Quay lại Chat Panel
          </Button>
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-1.5 overflow-y-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setError(''); setStatus(''); }}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left cursor-pointer',
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

        <div className="p-3 border-t border-[var(--border)] mt-auto">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs justify-start gap-2 text-red-500 hover:text-red-600 hover:bg-red-500/10 cursor-pointer"
            onClick={() => {
              if (window.confirm('Bạn có chắc chắn muốn đăng xuất tài khoản?')) {
                logout();
                navigate('/login');
              }
            }}
          >
            <span>🚪</span> Đăng xuất
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
            <AdminAccountsTab accounts={accounts} onRefresh={loadData} setError={setError} setStatus={setStatus} />
          )}
          {activeTab === 'difybots' && isSuperAdmin && (
            <DifyBotsTab setError={setError} setStatus={setStatus} />
          )}
          {activeTab === 'storage' && isSuperAdmin && (
            <AdminStorageTab accounts={accounts} />
          )}
        </div>
      </div>
    </div>
  );
}
