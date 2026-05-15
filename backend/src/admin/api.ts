async function req<T = any>(url: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (init?.body && typeof init.body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  status: () => req("/api/status"),
  health: () => req("/api/health"),

  authLogin: (email: string, password: string) =>
    req<{ token: string; user: { id: string; email: string; displayName: string; type: string; role: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  authMe: () =>
    req<{ user: { id: string; email: string; displayName: string; type: string; role: string }; memberships: Array<{ account_id: string; role: string }> }>("/api/auth/me"),

  authLogout: () => req("/api/auth/logout", { method: "POST", body: "{}" }),

  myAccounts: () =>
    req<{ accounts: Array<{ accountId: string; role: string; visible: boolean; displayName: string; phoneNumber: string; avatar: string; hasSession: boolean }> }>("/api/me/accounts"),

  setAccountVisible: (accountId: string, visible: boolean) =>
    req(`/api/me/accounts/${encodeURIComponent(accountId)}/visible`, {
      method: "PUT",
      body: JSON.stringify({ visible }),
    }),

  accounts: () => req<{ accounts: any[]; activeAccountId: string }>("/api/accounts"),

  loginStart: () => req<{ started: boolean }>("/api/login/start", { method: "POST", body: "{}" }),

  loginQr: () => req<{ qrCode: string | null; ready: boolean }>("/api/login/qr"),

  reconnectStart: (accountId: string) =>
    req<{ started: boolean }>(`/api/admin/accounts/${encodeURIComponent(accountId)}/reconnect`, { method: "POST", body: "{}" }),

  reconnectQr: (accountId: string) =>
    req<{ qrCode: string | null; ready: boolean }>(`/api/admin/accounts/${encodeURIComponent(accountId)}/reconnect/qr`),

  adminUsers: () => req<{ users: any[] }>("/api/admin/users"),

  adminAddMember: (accountId: string, email: string, role: string) =>
    req(`/api/admin/accounts/${encodeURIComponent(accountId)}/members`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),

  adminRemoveMember: (accountId: string, userId: string) =>
    req(`/api/admin/accounts/${encodeURIComponent(accountId)}/members/${encodeURIComponent(userId)}`, { method: "DELETE" }),

  adminUpdateMemberRole: (accountId: string, userId: string, role: string) =>
    req(`/api/admin/accounts/${encodeURIComponent(accountId)}/members/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),

  adminTransferMaster: (accountId: string, userId: string) =>
    req(`/api/admin/accounts/${encodeURIComponent(accountId)}/transfer`, {
      method: "PUT",
      body: JSON.stringify({ userId }),
    }),

  adminCreateUser: (email: string, password: string, displayName: string) =>
    req("/api/admin/users", { method: "POST", body: JSON.stringify({ email, password, displayName }) }),

  adminDeleteUser: (userId: string) =>
    req(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" }),

  adminUpdateUser: (userId: string, updates: Record<string, string>) =>
    req(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "PUT", body: JSON.stringify(updates) }),

  adminAllAccounts: () => req<{ accounts: any[] }>("/api/admin/accounts/all"),

  adminDeleteAccount: (accountId: string) =>
    req(`/api/admin/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" }),

  adminLogoutAccount: (accountId: string) =>
    req(`/api/admin/accounts/${encodeURIComponent(accountId)}/logout`, { method: "POST", body: "{}" }),

  adminSyncAccountProfile: (accountId: string) =>
    req(`/api/admin/accounts/${encodeURIComponent(accountId)}/sync-profile`, { method: "POST", body: "{}" }),
};
