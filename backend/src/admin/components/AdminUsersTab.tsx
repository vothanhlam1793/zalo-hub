import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { api } from "../api";

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  type: string;
  role?: string;
  memberships: Array<{ account_id: string; role: string }>;
}

interface Props {
  users: AdminUser[];
  accounts: any[];
  onRefresh: () => void;
  setError: (e: string) => void;
  setStatus: (e: string) => void;
}

export function AdminUsersTab({ users, onRefresh, setError, setStatus }: Props) {
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", displayName: "", role: "user", type: "human" });

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await api.adminUpdateUser(userId, { role });
      onRefresh();
      setStatus("Cập nhật role thành công");
    } catch (err: any) {
      setError(err?.message || "Lỗi cập nhật role");
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("Xóa người dùng này?")) return;
    try {
      await api.adminDeleteUser(userId);
      onRefresh();
      setStatus("Xóa thành công");
    } catch (err: any) {
      setError(err?.message || "Xóa thất bại");
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    try {
      const updates: Record<string, string> = {};
      if (form.displayName !== editUser.displayName) updates.displayName = form.displayName;
      if (form.role !== (editUser.role || "user")) updates.role = form.role;
      if (form.type !== editUser.type) updates.type = form.type;
      if (form.password) updates.password = form.password;
      if (Object.keys(updates).length === 0) {
        setEditUser(null);
        return;
      }
      await api.adminUpdateUser(editUser.id, updates);
      setEditUser(null);
      onRefresh();
      setStatus("Cập nhật người dùng thành công");
    } catch (err: any) {
      setError(err?.message || "Cập nhật thất bại");
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.displayName) {
      setError("Vui lòng điền đầy đủ email, mật khẩu, tên");
      return;
    }
    try {
      await api.adminCreateUser(form.email, form.password, form.displayName);
      setShowAdd(false);
      setForm({ email: "", password: "", displayName: "", role: "user", type: "human" });
      onRefresh();
      setStatus("Tạo người dùng thành công");
    } catch (err: any) {
      setError(err?.message || "Tạo người dùng thất bại");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#eee]">Danh sách người dùng hệ thống</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Quản lý tài khoản đăng nhập và phân quyền</p>
        </div>
        <Button size="sm" className="text-xs h-8" onClick={() => setShowAdd(true)}>
          + Thêm người dùng
        </Button>
      </div>

      <div className="border border-white/10 rounded-lg overflow-hidden bg-[#13181f]">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-muted-foreground font-medium">
              <th className="p-3">Tên & Email</th>
              <th className="p-3">Loại</th>
              <th className="p-3">Vai trò hệ thống</th>
              <th className="p-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="p-3">
                  <div className="font-medium text-[#eee]">{u.displayName || "Chưa đặt tên"}</div>
                  <div className="text-[11px] text-muted-foreground">{u.email}</div>
                </td>
                <td className="p-3">
                  <Badge variant="secondary" className="text-[10px]">
                    {u.type}
                  </Badge>
                </td>
                <td className="p-3">
                  <Select
                    value={u.role || "user"}
                    onValueChange={(val) => handleRoleChange(u.id, val)}
                  >
                    <SelectTrigger className="h-7 w-[120px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-3 text-right space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setEditUser(u);
                      setForm({
                        email: u.email,
                        password: "",
                        displayName: u.displayName || "",
                        role: u.role || "user",
                        type: u.type || "human",
                      });
                    }}
                  >
                    Sửa
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-[#ff8888] hover:text-red-400"
                    onClick={() => handleDelete(u.id)}
                  >
                    Xóa
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dialog Add User */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md bg-[#13181f] border-white/10 text-[#eee]">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Thêm người dùng mới</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Mật khẩu</Label>
              <Input
                type="password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Tên hiển thị</Label>
              <Input
                required
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                Hủy
              </Button>
              <Button type="submit" size="sm">
                Tạo người dùng
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Edit User */}
      <Dialog open={Boolean(editUser)} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="max-w-md bg-[#13181f] border-white/10 text-[#eee]">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Chỉnh sửa người dùng</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Tên hiển thị</Label>
              <Input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Đổi mật khẩu mới (bỏ trống nếu giữ nguyên)</Label>
              <Input
                type="password"
                placeholder="Mật khẩu mới..."
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditUser(null)}>
                Hủy
              </Button>
              <Button type="submit" size="sm">
                Lưu thay đổi
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
