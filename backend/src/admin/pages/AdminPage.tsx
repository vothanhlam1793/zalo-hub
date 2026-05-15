import { useState } from "react";
import { useAuthStore } from "../stores/auth-store";
import { MyAccountsTab } from "../components/MyAccountsTab";

export default function AdminPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === "super_admin" || user?.role === "admin";

  return (
    <div className="min-h-screen bg-[#0f1117]">
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#0d1015]">
        <div>
          <h1 className="text-sm font-bold text-[#eee]">Zalo Hub Admin</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[11px] text-muted-foreground">{user?.email}</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(79,122,255,0.15)] text-[#9fc0ff]">{user?.role || "user"}</span>
          </div>
        </div>
        {isSuperAdmin && <div className="flex gap-2">
          <a href="/api/admin/users" className="text-[11px] text-[#9fc0ff] hover:underline">API Users</a>
          <a href="/api/admin/accounts/all" className="text-[11px] text-[#9fc0ff] hover:underline">API Accounts</a>
        </div>}
      </div>
      <div className="max-w-3xl mx-auto p-6">
        <MyAccountsTab isSuperAdmin={isSuperAdmin} />
      </div>
    </div>
  );
}
