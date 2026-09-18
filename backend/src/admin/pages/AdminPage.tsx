import { useState } from "react";
import { useAuthStore } from "../stores/auth-store";
import { MyAccountsTab } from "../components/MyAccountsTab";
import DifyBotsTab from "../components/DifyBotsTab";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";

type TabKey = "myaccounts" | "difybots";

export default function AdminPage() {
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>("myaccounts");
  const isSuperAdmin = user?.role === "super_admin" || user?.role === "admin";

  const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
    { key: "myaccounts", label: "Tài khoản của tôi", icon: "📱" },
    { key: "difybots", label: "Dify Bots", icon: "🤖" },
  ];

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

        <nav className="flex-1 p-3 flex flex-col gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
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

        <div className="p-3 border-t border-[var(--border)] flex flex-col gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs justify-start"
            onClick={() => (window.location.href = "/")}
          >
            ← Dashboard Chat
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs justify-start text-[#ff8888]"
            onClick={() => logout()}
          >
            Đăng xuất
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="p-6 max-w-4xl mx-auto w-full">
          {activeTab === "myaccounts" && <MyAccountsTab isSuperAdmin={isSuperAdmin} />}
          {activeTab === "difybots" && <DifyBotsTab isSuperAdmin={isSuperAdmin} />}
        </div>
      </div>
    </div>
  );
}

