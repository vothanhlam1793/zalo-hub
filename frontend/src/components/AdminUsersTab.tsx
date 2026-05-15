import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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

export function AdminUsersTab({ users, accounts, onRefresh, setError, setStatus }: Props) {
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', displayName: '', role: 'user', type: 'human' });

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await api.adminUpdateUser(userId, { role });
      onRefresh();
      setStatus('Cap nhat role thanh cong');
    } catch (err) { setError(err instanceof Error ? err.message : 'Loi cap nhat role'); }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Xoa nguoi dung nay?')) return;
    try { await api.adminDeleteUser(userId); onRefresh(); setStatus('Xoa thanh cong'); }
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
      await api.adminUpdateUser(editUser.id, updates);
      setEditUser(null);
      onRefresh();
      setStatus('Cap nhat nguoi dung thanh cong');
    } catch (err) { setError(err instanceof Error ? err.message : 'Cap nhat that bai'); }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.displayName) return;
    try {
      await api.adminCreateUser(form.email, form.password, form.displayName);
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
        <h2 className="text-base font-bold text-[#eee]">Người dùng ({users.length})</h2>
        <Button size="sm" onClick={() => { setShowAdd(true); setForm({ email: '', password: '', displayName: '', role: 'user', type: 'human' }); }}>
          + Thêm người dùng
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8 text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4">Tên hiển thị</th>
              <th className="pb-2 pr-4">Email</th>
              <th className="pb-2 pr-4">System Role</th>
              <th className="pb-2 pr-4">Type</th>
              <th className="pb-2 pr-4">Zalo Accounts</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-white/4 hover:bg-white/[0.02]">
                <td className="py-2.5 pr-4 text-[#eee]">{u.displayName}</td>
                <td className="py-2.5 pr-4 text-[#999]">{u.email}</td>
                <td className="py-2.5 pr-4">
                  <Select value={u.role || 'user'} onValueChange={(v) => handleRoleChange(u.id, v)}>
                    <SelectTrigger className="h-7 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">admin</SelectItem>
                      <SelectItem value="user">user</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-2.5 pr-4">
                  <Badge variant="secondary" className="text-[10px]">{u.type}</Badge>
                </td>
                <td className="py-2.5 pr-4">
                  <span className="text-[#7fa8ff] text-xs">{u.memberships?.length || 0} accounts</span>
                </td>
                <td className="py-2.5 flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(u)}>✏️</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-[#ff8888]" onClick={() => handleDelete(u.id)}>🗑️</Button>
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
