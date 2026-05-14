import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { api } from '../api';
import { useAuthStore } from '../stores/auth-store';
import { AdminUsersTab } from '../components/AdminUsersTab';
import { AdminAccountsTab } from '../components/AdminAccountsTab';
import { AdminMatrixTab } from '../components/AdminMatrixTab';
import type { AccountSummary } from '../types';

interface AdminUser {
  id: string; email: string; displayName: string; type: string; role?: string;
  memberships: Array<{ account_id: string; role: string }>;
}

type TabKey = 'users' | 'accounts' | 'memberships';

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'users', label: 'Người dùng', icon: '👤' },
  { key: 'accounts', label: 'Tài khoản Zalo', icon: '📱' },
  { key: 'memberships', label: 'Phân quyền', icon: '🔐' },
];

export default function AdminPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [u, a] = await Promise.all([api.adminUsers(), api.accounts()]);
      setUsers(u.users);
      setAccounts(a.accounts);
    } catch { setError('Khong the tai du lieu'); }
  };

  useEffect(() => { loadData(); }, []);

  return (
    <div className="flex-1 flex min-h-screen bg-[#0f1117]">
      <div className="w-[220px] min-w-[200px] border-r border-[var(--border)] flex flex-col bg-[#0d1015]">
        <div className="px-4 py-4 border-b border-[var(--border)]">
          <h1 className="text-sm font-bold text-[#eee]">Quản trị hệ thống</h1>
          <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
          <Badge variant={user?.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">{user?.role || 'user'}</Badge>
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setError(''); setStatus(''); }}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-colors text-left',
                activeTab === tab.key
                  ? 'bg-[rgba(79,122,255,0.15)] text-[#9fc0ff] font-medium'
                  : 'text-muted-foreground hover:text-[#ccc] hover:bg-white/[0.04]',
              )}
            >
              <span className="text-sm">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-[var(--border)] flex flex-col gap-2">
          <Button variant="ghost" size="sm" className="text-xs justify-start" onClick={() => navigate('/')}>
            ← Dashboard
          </Button>
          <Button variant="ghost" size="sm" className="text-xs justify-start text-[#ff8888]" onClick={() => { logout(); navigate('/login'); }}>
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
          {activeTab === 'users' && (
            <AdminUsersTab users={users} accounts={accounts} onRefresh={loadData} setError={setError} setStatus={setStatus} />
          )}
          {activeTab === 'accounts' && (
            <AdminAccountsTab accounts={accounts} onRefresh={loadData} setError={setError} setStatus={setStatus} />
          )}
          {activeTab === 'memberships' && (
            <AdminMatrixTab users={users} accounts={accounts} onRefresh={loadData} setError={setError} setStatus={setStatus} />
          )}
        </div>
      </div>
    </div>
  );
}
