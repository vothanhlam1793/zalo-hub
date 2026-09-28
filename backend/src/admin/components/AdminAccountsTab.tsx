import { useState } from "react";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { api } from "../api";

export interface AccountSummary {
  accountId: string;
  displayName: string;
  phoneNumber: string;
  avatar?: string;
  hasCredential: boolean;
  runtimeLoaded?: boolean;
  sessionActive?: boolean;
  hubAlias?: string;
  memberCount?: number;
  master?: { userId: string; displayName: string; email: string } | null;
}

interface Props {
  accounts: AccountSummary[];
  onRefresh: () => void;
  setError: (e: string) => void;
  setStatus: (e: string) => void;
}

function InfoRow({ label, value, tone = "default" }: { label: string; value?: string; tone?: "default" | "accent" }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className={`text-xs break-words font-medium ${tone === "accent" ? "text-[#9fc0ff]" : "text-[#eef2ff]"}`}>
        {value?.trim() || "Chưa có"}
      </div>
    </div>
  );
}

export function AdminAccountsTab({ accounts, onRefresh, setError, setStatus }: Props) {
  const [editingAccountId, setEditingAccountId] = useState("");
  const [aliasValue, setAliasValue] = useState("");
  const [savingAlias, setSavingAlias] = useState(false);

  const handleLogout = async (accountId: string) => {
    if (!confirm("Logout tài khoản này khỏi ZaloHub?")) return;
    try {
      await api.adminLogoutAccount(accountId);
      setStatus("Đã logout");
      onRefresh();
    } catch (err: any) {
      setError(err?.message || "Logout thất bại");
    }
  };

  const handleDelete = async (accountId: string) => {
    if (!confirm("XÓA VĨNH VIỄN tài khoản này cùng toàn bộ dữ liệu?")) return;
    try {
      await api.adminDeleteAccount(accountId);
      setStatus("Đã xóa tài khoản");
      onRefresh();
    } catch (err: any) {
      setError(err?.message || "Xóa thất bại");
    }
  };

  const handleSyncProfile = async (accountId: string) => {
    setStatus("Đang đồng bộ hồ sơ...");
    try {
      await api.adminSyncAccountProfile(accountId);
      setStatus("Đã cập nhật hồ sơ từ Zalo");
      onRefresh();
    } catch (err: any) {
      setError(err?.message || "Đồng bộ hồ sơ thất bại");
    }
  };

  const openAliasDialog = (acc: AccountSummary) => {
    setEditingAccountId(acc.accountId);
    setAliasValue(acc.hubAlias || "");
  };

  const handleSaveAlias = async () => {
    if (!editingAccountId) return;
    setSavingAlias(true);
    try {
      await api.adminUpdateAccount(editingAccountId, { hubAlias: aliasValue.trim() || undefined });
      setStatus("Đã cập nhật tên gợi nhớ");
      setEditingAccountId("");
      onRefresh();
    } catch (err: any) {
      setError(err?.message || "Lưu tên gợi nhớ thất bại");
    } finally {
      setSavingAlias(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-[#eee]">Tất cả tài khoản Zalo trong hệ thống</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Quản trị toàn bộ Zalo accounts và phân quyền thành viên</p>
      </div>

      <div className="grid gap-3">
        {accounts.map((acc) => {
          const isOnline = Boolean(acc.sessionActive);
          return (
            <Card key={acc.accountId} className="p-4 bg-[#13181f] border-white/10">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10 shrink-0 border border-white/10">
                    <AvatarImage src={acc.avatar} />
                    <AvatarFallback className="text-xs bg-white/5">
                      {acc.displayName?.slice(0, 2).toUpperCase() || "ZA"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[#eee] truncate">
                        {acc.hubAlias ? `${acc.hubAlias} (${acc.displayName})` : acc.displayName || acc.accountId}
                      </span>
                      <Badge
                        variant={isOnline ? "default" : "secondary"}
                        className={`text-[10px] ${
                          isOnline ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {isOnline ? "🟢 Online" : "⚪ Offline"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{acc.phoneNumber || "Chưa có SĐT"}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openAliasDialog(acc)}>
                    Đổi tên alias
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleSyncProfile(acc.accountId)}>
                    Đồng bộ profile
                  </Button>
                  {isOnline && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-300 hover:text-amber-200" onClick={() => handleLogout(acc.accountId)}>
                      Logout
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-[#ff8888] hover:text-red-400" onClick={() => handleDelete(acc.accountId)}>
                    Xóa
                  </Button>
                </div>
              </div>

              <Separator className="my-3 bg-white/5" />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <InfoRow label="Account ID" value={acc.accountId} />
                <InfoRow label="Master Owner" value={acc.master?.email || acc.master?.displayName || "Super Admin"} tone="accent" />
                <InfoRow label="Số thành viên" value={String(acc.memberCount ?? 1)} />
                <InfoRow label="Credential" value={acc.hasCredential ? "Đã lưu" : "Chưa có"} />
              </div>
            </Card>
          );
        })}
      </div>

      {/* Dialog Alias */}
      <Dialog open={Boolean(editingAccountId)} onOpenChange={(open) => !open && setEditingAccountId("")}>
        <DialogContent className="max-w-md bg-[#13181f] border-white/10 text-[#eee]">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Đặt tên gợi nhớ (Hub Alias)</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Tên này sẽ hiển thị ưu tiên trên thanh danh sách để dễ phân biệt tài khoản.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={aliasValue}
              onChange={(e) => setAliasValue(e.target.value)}
              placeholder="VD: Zalo Sales 01..."
              className="text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setEditingAccountId("")}>
              Hủy
            </Button>
            <Button size="sm" disabled={savingAlias} onClick={handleSaveAlias}>
              {savingAlias ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
