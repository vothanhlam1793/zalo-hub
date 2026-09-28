import { useEffect, useState } from "react";
import { useAuthStore } from "../stores/auth-store";
import { MyAccountsTab } from "../components/MyAccountsTab";
import { AdminUsersTab, type AdminUser } from "../components/AdminUsersTab";
import { AdminAccountsTab, type AccountSummary } from "../components/AdminAccountsTab";
import DifyBotsTab from "../components/DifyBotsTab";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";
import { api } from "../api";

type TabKey = "myaccounts" | "users" | "allaccounts" | "difybots";

export default function AdminPage() {
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>("myaccounts");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const isSuperAdmin = user?.role === "super_admin" || user?.role === "admin";

  const loadData = async () => {
    try {
      const [u, a] = await Promise.all([
        api.adminUsers().catch(() => ({ users: [] })),
        api.adminAllAccounts().catch(() => ({ accounts: [] })),
      ]);
      setUsers(u.users || []);
      setAccounts(a.accounts || []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      void loadData();
    }
  }, [isSuperAdmin]);

  const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
    { key: "myaccounts", label: "Tài khoản của tôi", icon: "📱" },
  ];

  if (isSuperAdmin) {
    tabs.push(
      { key: "users", label: "Người dùng", icon: "👤" },
      { key: "allaccounts", label: "Tất cả Accounts", icon: "🔐" },
      { key: "difybots", label: "Dify Bots", icon: "🤖" },
    );
  }

  return (
    <div className="flex-1 flex min-h-screen w-full bg-[#0f1117]">
      {/* Sidebar */}
      <div className="w-[220px] min-w-[200px] border-r border-[var(--border)] flex flex-col bg-[#0d1015]">
        <div className="px-4 py-4 border-b border-[var(--border)]">
          <h1 className="text-sm font-bold text-[#eee]">Quản trị ZaloHub</h1>
          <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
          <Badge variant={isSuperAdmin ? "default" : "secondary"} className="text-[10px] mt-1">
            {user?.role || "user"}
          </Badge>
        </div>

        <div className="p-3 border-b border-[var(--border)]">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs font-semibold justify-start gap-2 bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20"
            onClick={() => (window.location.href = "/")}
          >
            <span>💬</span> Quay lại Chat Panel
          </Button>
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-1.5 overflow-y-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setError("");
                setStatus("");
              }}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-colors text-left",
                activeTab === tab.key
                  ? "bg-[rgba(79,122,255,0.15)] text-[#9fc0ff] font-medium"
                  : "text-muted-foreground hover:text-[#ccc] hover:bg-white/[0.04]",
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
            className="w-full text-xs justify-start gap-2 text-[#ff8888] hover:bg-red-500/10 cursor-pointer"
            onClick={() => {
              if (window.confirm("Bạn có chắc chắn muốn đăng xuất tài khoản?")) {
                logout();
              }
            }}
          >
            <span>🚪</span> Đăng xuất
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {(status || error) && (
          <div
            className={`shrink-0 px-5 py-2.5 text-[13px] ${
              error ? "bg-[rgba(255,80,80,0.1)] text-[#ff9a9a]" : "bg-[rgba(60,200,120,0.1)] text-[#6fe0a0]"
            }`}
          >
            {error || status}
          </div>
        )}

        <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
          {activeTab === "myaccounts" && <MyAccountsTab isSuperAdmin={isSuperAdmin} />}
          {activeTab === "users" && isSuperAdmin && (
            <AdminUsersTab
              users={users}
              accounts={accounts}
              onRefresh={loadData}
              setError={setError}
              setStatus={setStatus}
            />
          )}
          {activeTab === "allaccounts" && isSuperAdmin && (
            <AdminAccountsTab
              accounts={accounts}
              onRefresh={loadData}
              setError={setError}
              setStatus={setStatus}
            />
          )}
          {activeTab === "difybots" && <DifyBotsTab isSuperAdmin={isSuperAdmin} />}
        </div>
      </div>
    </div>
  );
}

