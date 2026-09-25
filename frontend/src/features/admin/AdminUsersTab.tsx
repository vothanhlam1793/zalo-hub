import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { bff } from '@/bff-api';
import type { AccountSummary } from '@/types';

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

export function AdminUsersTab({ users, accounts, onRefresh, setError, setStatus }: Props) {
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', displayName: '', role: 'user', type: 'human' });

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await bff.adminUpdateUser(userId, { role });
      onRefresh();
      setStatus('Cap nhat role thanh cong');
    } catch (err) { setError(err instanceof Error ? err.message : 'Loi cap nhat role'); }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Xoa nguoi dung nay?')) return;
    try { await bff.adminDeleteUser(userId); onRefresh(); setStatus('Xoa thanh cong'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Xoa that bai'); }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    try {
      const updates: Record<string, string> = {};
      if (form.displayName !== editUser.displayName) updates.displayName = form.displayName;
      if (form.role !== (editUser.role || 'user')) updates.role = form.role;
      if (form.type !== editUser.type) updates.type = form.type;
      if (form.password) updates.password = form.password;
      if (Object.keys(updates).length === 0) { setEditUser(null); return; }
      await bff.adminUpdateUser(editUser.id, updates);
      setEditUser(null);
      onRefresh();
      setStatus('Cap nhat nguoi dung thanh cong');
    } catch (err) { setError(err instanceof Error ? err.message : 'Cap nhat that bai'); }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.displayName) return;
    try {
      await bff.adminCreateUser(form.email, form.password, form.displayName);
      setShowAdd(false);
      setForm({ email: '', password: '', displayName: '', role: 'user', type: 'human' });
      onRefresh();
      setStatus('Tao nguoi dung thanh cong');
    } catch (err) { setError(err instanceof Error ? err.message : 'Tao that bai'); }
  };

  const openEdit = (u: AdminUser) => {
    setEditUser(u);
    setForm({ email: u.email, password: '', displayName: u.displayName, role: u.role || 'user', type: u.type });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-[var(--foreground)]">Người dùng hệ thống ({users.length})</h2>
        <Button size="sm" onClick={() => { setShowAdd(true); setForm({ email: '', password: '', displayName: '', role: 'user', type: 'human' }); }}>
          + Thêm người dùng
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-muted-foreground bg-[var(--accent)]/40">
              <th className="py-2.5 px-4">Tên hiển thị</th>
              <th className="py-2.5 px-4">Email</th>
              <th className="py-2.5 px-4">System Role</th>
              <th className="py-2.5 px-4">Type</th>
              <th className="py-2.5 px-4">Zalo Accounts quản lý</th>
              <th className="py-2.5 px-4 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--accent)]/30">
                <td className="py-2.5 px-4 font-medium text-[var(--foreground)]">{u.displayName}</td>
                <td className="py-2.5 px-4 text-muted-foreground">{u.email}</td>
                <td className="py-2.5 px-4">
                  <Select value={u.role || 'user'} onValueChange={(v) => handleRoleChange(u.id, v)}>
                    <SelectTrigger className="h-7 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="super_admin">super_admin</SelectItem>
                      <SelectItem value="admin">admin</SelectItem>
                      <SelectItem value="user">user</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-2.5 px-4">
                  <Badge variant="secondary" className="text-[10px]">{u.type}</Badge>
                </td>
                <td className="py-2.5 px-4">
                  <div className="flex flex-wrap gap-1 items-center">
                    {u.memberships && u.memberships.length > 0 ? (
                      u.memberships.map((m) => {
                        const acc = accounts.find((a) => a.accountId === m.account_id);
                        const label = acc?.hubAlias || acc?.displayName || m.account_id.slice(-6);
                        return (
                          <span
                            key={m.account_id}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20"
                            title={`Vai trò: ${m.role}`}
                          >
                            {label} ({m.role})
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-muted-foreground text-xs italic">Chưa gán</span>
                    )}
                  </div>
                </td>
                <td className="py-2.5 px-4 text-right">
                  <div className="inline-flex gap-1 justify-end">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(u)} title="Sửa thông tin">✏️</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10" onClick={() => handleDelete(u.id)} title="Xóa">🗑️</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="bg-[#13181f] border-[var(--border)] max-w-sm">
          <DialogHeader><DialogTitle>Sửa người dùng</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1"><Label className="text-xs">Tên hiển thị</Label><Input value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})} className="h-9" /></div>
            <div className="flex flex-col gap-1"><Label className="text-xs">System Role</Label>
              <Select value={form.role} onValueChange={v => setForm({...form, role: v})}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="admin">admin</SelectItem><SelectItem value="user">user</SelectItem></SelectContent></Select>
            </div>
            <div className="flex flex-col gap-1"><Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={v => setForm({...form, type: v})}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="human">human</SelectItem><SelectItem value="ai_bot">ai_bot</SelectItem></SelectContent></Select>
            </div>
            <div className="flex flex-col gap-1"><Label className="text-xs">Mật khẩu mới (để trống nếu không đổi)</Label><Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="h-9" /></div>
            <DialogFooter><Button type="submit" size="sm">Lưu</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-[#13181f] border-[var(--border)] max-w-sm">
          <DialogHeader><DialogTitle>Thêm người dùng</DialogTitle></DialogHeader>
          <form onSubmit={handleAddSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1"><Label className="text-xs">Email</Label><Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="h-9" /></div>
            <div className="flex flex-col gap-1"><Label className="text-xs">Mật khẩu</Label><Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="h-9" /></div>
            <div className="flex flex-col gap-1"><Label className="text-xs">Tên hiển thị</Label><Input value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})} className="h-9" /></div>
            <DialogFooter><Button type="submit" size="sm">Thêm</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
