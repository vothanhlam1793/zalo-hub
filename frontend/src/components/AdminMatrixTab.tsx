import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '../api';
import type { AccountSummary } from '../types';

interface AdminUser {
  id: string; email: string; displayName: string; type: string; role?: string;
  memberships: Array<{ account_id: string; role: string }>;
}

interface Props {
  users: AdminUser[];
  accounts: AccountSummary[];
  onRefresh: () => void;
  setError: (e: string) => void;
  setStatus: (e: string) => void;
}

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
  { value: 'agent', label: 'Agent' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'none', label: '— Không —' },
];

export function AdminMatrixTab({ users, accounts, onRefresh, setError, setStatus }: Props) {
  const handleChange = async (userId: string, accountId: string, role: string) => {
    try {
      await api.adminUpdateMembership(userId, accountId, role === 'none' ? '' : role);
      onRefresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Cap nhat that bai'); }
  };

  if (accounts.length === 0) return <p className="text-[#666] text-sm">Chua co tai khoan Zalo</p>;
  if (users.length === 0) return <p className="text-[#666] text-sm">Chua co nguoi dung</p>;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-bold text-[#eee]">Phân quyền</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left pb-3 pr-4 text-xs text-muted-foreground sticky left-0 bg-[#0f1117] z-10">Người dùng</th>
              {accounts.map((a) => (
                <th key={a.accountId} className="text-center pb-3 px-2 text-[10px] text-muted-foreground font-normal max-w-[120px]">
                  <div className="truncate">{a.displayName || (a.accountId || '').slice(0, 12)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-white/4">
                <td className="py-2 pr-4 sticky left-0 bg-[#0f1117] z-10">
                  <div className="text-[#eee] text-xs">{u.displayName}</div>
                  <div className="text-[10px] text-muted-foreground">{u.email}</div>
                </td>
                {accounts.map((a) => {
                  const m = u.memberships?.find((m) => m.account_id === a.accountId);
                  return (
                    <td key={a.accountId} className="py-2 px-1 text-center">
                      <Select value={m?.role || 'none'} onValueChange={(v) => handleChange(u.id, a.accountId, v)}>
                        <SelectTrigger className="h-7 w-[100px] text-[11px] mx-auto">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
