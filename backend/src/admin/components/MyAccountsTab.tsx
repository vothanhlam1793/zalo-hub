import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { QrLoginDialog } from "./QrLoginDialog";
import { api } from "../api";

interface MyAccount {
  accountId: string;
  role: string;
  visible: boolean;
  displayName: string;
  phoneNumber: string;
  avatar: string;
  hasSession: boolean;
}

const ROLE_LABELS: Record<string, string> = { master: "Master", admin: "Admin", editor: "Editor", viewer: "Viewer" };
const ROLE_COLORS: Record<string, string> = {
  master: "bg-[rgba(235,87,87,0.15)] text-[#eb5757]",
  admin: "bg-[rgba(79,122,255,0.15)] text-[#9fc0ff]",
  editor: "bg-[rgba(60,200,120,0.15)] text-[#6fe0a0]",
  viewer: "bg-white/10 text-muted-foreground",
};

export function MyAccountsTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [accounts, setAccounts] = useState<MyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [reconnectId, setReconnectId] = useState<string | null>(null);

  const [selectedAccount, setSelectedAccount] = useState<MyAccount | null>(null);
  const [members, setMembers] = useState<Array<{ userId: string; displayName: string; email: string; role: string }>>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("viewer");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");

  const loadAccounts = async () => {
    try {
      const res = await api.myAccounts();
      setAccounts(res.accounts);
    } catch (e: any) { setError(e.message || "Lỗi tải"); }
    setLoading(false);
  };

  const loadMembers = async (accountId: string) => {
    try {
      const res = await api.adminUsers();
      const allUsers = res.users;
      const members_ = allUsers.filter((u: any) => u.memberships.some((m: any) => m.account_id === accountId))
        .map((u: any) => ({
          userId: u.id,
          displayName: u.displayName,
          email: u.email,
          role: u.memberships.find((m: any) => m.account_id === accountId)?.role || "viewer",
        }));
      setMembers(members_);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadAccounts(); }, []);

  const handleManage = (account: MyAccount) => {
    setSelectedAccount(account);
    if (account.role === "master" || account.role === "admin") {
      loadMembers(account.accountId);
    }
  };

  const handleToggleVisible = async (account: MyAccount) => {
    const newVal = !account.visible;
    try {
      await api.setAccountVisible(account.accountId, newVal);
      setAccounts(accs => accs.map(a => a.accountId === account.accountId ? { ...a, visible: newVal } : a));
    } catch (e: any) { setError(e.message || "Cập nhật thất bại"); }
  };

  const handleAddMember = async () => {
    if (!selectedAccount || !memberEmail) return;
    try {
      await api.adminAddMember(selectedAccount.accountId, memberEmail, memberRole);
      setStatus("Đã thêm thành viên");
      setMemberEmail("");
      setAddOpen(false);
      loadMembers(selectedAccount.accountId);
    } catch (e: any) { setError(e.message || "Thêm thất bại"); }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedAccount) return;
    try {
      await api.adminRemoveMember(selectedAccount.accountId, userId);
      setStatus("Đã xóa thành viên");
      loadMembers(selectedAccount.accountId);
    } catch (e: any) { setError(e.message || "Xóa thất bại"); }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    if (!selectedAccount) return;
    try {
      await api.adminUpdateMemberRole(selectedAccount.accountId, userId, newRole);
      setStatus("Đã cập nhật quyền");
      loadMembers(selectedAccount.accountId);
      loadAccounts();
    } catch (e: any) { setError(e.message || "Cập nhật thất bại"); }
  };

  const handleTransferMaster = async () => {
    if (!selectedAccount || !transferEmail) return;
    try {
      const res = await api.adminUsers();
      const targetUser = res.users.find((u: any) => u.email === transferEmail);
      if (!targetUser) { setError("Không tìm thấy user"); return; }
      await api.adminTransferMaster(selectedAccount.accountId, targetUser.id);
      setStatus("Đã chuyển quyền master. Bạn hiện là admin.");
      setTransferOpen(false);
      setTransferEmail("");
      loadAccounts();
      loadMembers(selectedAccount.accountId);
    } catch (e: any) { setError(e.message || "Chuyển quyền thất bại"); }
  };

  if (loading) return <p className="text-muted-foreground text-sm">Đang tải...</p>;

  const visibleAccounts = accounts.filter(a => a.visible);
  const hiddenAccounts = accounts.filter(a => !a.visible);

  return (
    <div>
      {(status || error) && (
        <div className={`mb-4 px-4 py-2.5 text-[13px] rounded ${error ? "bg-[rgba(255,80,80,0.1)] text-[#ff9a9a]" : "bg-[rgba(60,200,120,0.1)] text-[#6fe0a0]"}`}>
          {error || status}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-[#eee]">Tài khoản Zalo của tôi</h2>
        <Button size="sm" className="text-[11px] h-7" onClick={() => setQrOpen(true)}>
          + Thêm tài khoản (QR)
        </Button>
      </div>

      <div className="space-y-3">
        {visibleAccounts.map((acc) => (
          <AccountCard
            key={acc.accountId}
            acc={acc}
            selectedAccount={selectedAccount}
            members={members}
            onManage={handleManage}
            onToggleVisible={handleToggleVisible}
            onReconnect={(id) => setReconnectId(id)}
            onDeselect={() => setSelectedAccount(null)}
            onAddMember={() => setAddOpen(true)}
            onTransferMaster={() => setTransferOpen(true)}
            onChangeRole={handleChangeRole}
            onRemoveMember={handleRemoveMember}
          />
        ))}

        {hiddenAccounts.length > 0 && (
          <>
            <div className="flex items-center gap-2 mt-6 mb-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[11px] text-muted-foreground shrink-0">Tài khoản ẩn ({hiddenAccounts.length})</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
            {hiddenAccounts.map((acc) => (
              <AccountCard
                key={acc.accountId}
                acc={acc}
                selectedAccount={selectedAccount}
                members={members}
                onManage={handleManage}
                onToggleVisible={handleToggleVisible}
                onReconnect={(id) => setReconnectId(id)}
                onDeselect={() => setSelectedAccount(null)}
                onAddMember={() => setAddOpen(true)}
                onTransferMaster={() => setTransferOpen(true)}
                onChangeRole={handleChangeRole}
                onRemoveMember={handleRemoveMember}
              />
            ))}
          </>
        )}

        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground">Bạn chưa có tài khoản Zalo. Bấm "Thêm tài khoản (QR)" để bắt đầu.</p>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-[#111] border-white/10 max-w-sm">
          <DialogHeader><DialogTitle className="text-[#eee]">Thêm thành viên</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Email người dùng" value={memberEmail} onChange={(e: any) => setMemberEmail(e.target.value)} className="bg-[#0d1015] border-white/10" />
            <Select value={memberRole} onValueChange={setMemberRole}>
              <SelectTrigger className="bg-[#0d1015] border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Hủy</Button>
            <Button size="sm" onClick={handleAddMember}>Thêm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="bg-[#111] border-white/10 max-w-sm">
          <DialogHeader><DialogTitle className="text-[#eee]">Chuyển quyền Master</DialogTitle></DialogHeader>
          <p className="text-[11px] text-muted-foreground">Bạn sẽ trở thành Admin sau khi chuyển.</p>
          <Input placeholder="Email người nhận" value={transferEmail} onChange={(e: any) => setTransferEmail(e.target.value)} className="bg-[#0d1015] border-white/10" />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTransferOpen(false)}>Hủy</Button>
            <Button variant="destructive" size="sm" onClick={handleTransferMaster}>Chuyển</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QrLoginDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        onSuccess={() => { setQrOpen(false); loadAccounts(); }}
      />

      {reconnectId && (
        <QrLoginDialog
          open
          accountId={reconnectId}
          onOpenChange={() => setReconnectId(null)}
          onSuccess={() => { setReconnectId(null); loadAccounts(); }}
        />
      )}
    </div>
  );
}

function AccountCard({
  acc, selectedAccount, members,
  onManage, onToggleVisible, onReconnect, onDeselect,
  onAddMember, onTransferMaster, onChangeRole, onRemoveMember,
}: {
  acc: MyAccount;
  selectedAccount: MyAccount | null;
  members: Array<{ userId: string; displayName: string; email: string; role: string }>;
  onManage: (a: MyAccount) => void;
  onToggleVisible: (a: MyAccount) => void;
  onReconnect: (id: string) => void;
  onDeselect: () => void;
  onAddMember: () => void;
  onTransferMaster: () => void;
  onChangeRole: (userId: string, newRole: string) => void;
  onRemoveMember: (userId: string) => void;
}) {
  const isExpanded = selectedAccount?.accountId === acc.accountId;
  const canManage = acc.role === "master" || acc.role === "admin";

  return (
    <Card className={`border-white/10 bg-[#0d1015] ${acc.visible ? "" : "opacity-60"}`}>
      <CardContent className="p-4 flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-[rgba(79,122,255,0.15)] flex items-center justify-center text-sm font-bold text-[#9fc0ff] shrink-0">
          {(acc.displayName || acc.accountId).charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-[#eee] truncate">{acc.displayName || acc.accountId}</p>
            <Badge className={ROLE_COLORS[acc.role] || "text-[10px]"}>{ROLE_LABELS[acc.role] || acc.role}</Badge>
            {!acc.hasSession && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(255,160,60,0.15)] text-[#ffa03c]">Mất kết nối</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{acc.phoneNumber || acc.accountId}</p>

          {isExpanded && canManage && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <p className="text-[11px] font-medium text-[#eee] mb-2">Quản lý phân quyền</p>
              {members.length === 0 && <p className="text-[11px] text-muted-foreground">Chưa có thành viên</p>}
              {members.map((m) => (
                <div key={m.userId} className="flex items-center gap-3 py-2 border-b border-white/5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#eee]">{m.displayName}</p>
                    <p className="text-[10px] text-muted-foreground">{m.email}</p>
                  </div>
                  <Select value={m.role} onValueChange={(v) => onChangeRole(m.userId, v)}>
                    <SelectTrigger className="w-24 h-7 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="master">Master</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] text-[#ff8888]" onClick={() => onRemoveMember(m.userId)}>
                    ✕
                  </Button>
                </div>
              ))}

              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" className="text-[11px] h-7" onClick={onAddMember}>+ Thêm người</Button>
                <Button variant="outline" size="sm" className="text-[11px] h-7 text-[#eb5757]" onClick={onTransferMaster}>Chuyển Master</Button>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5" title={acc.visible ? "Hiển thị trên sidebar" : "Ẩn khỏi sidebar"}>
            <Switch
              checked={acc.visible}
              onCheckedChange={() => onToggleVisible(acc)}
              className="data-[state=checked]:bg-[#4f7aff]"
            />
            <span className="text-[10px] text-muted-foreground w-8">{acc.visible ? "Hiện" : "Ẩn"}</span>
          </div>
          {!acc.hasSession && (
            <Button variant="outline" size="sm" className="text-[11px] h-7 text-[#ffa03c] border-[rgba(255,160,60,0.3)]" onClick={() => onReconnect(acc.accountId)}>
              Quét QR
            </Button>
          )}
          {canManage && (
            <Button variant="ghost" size="sm" className="text-[11px] h-7"
              onClick={() => isExpanded ? onDeselect() : onManage(acc)}>
              {isExpanded ? "Đóng" : "Quản lý"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
