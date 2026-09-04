import type { AccountSummary, Contact, ConversationSummary, Group, HistorySyncResult, Message, SessionStatus } from './types';

interface BffResponse<T> {
  ok: true;
  data: T;
  requestId?: string;
}

interface BffErrorBody {
  ok: false;
  code: string;
  message: string;
  detail?: string;
  requestId?: string;
}

export type BffResult<T> = BffResponse<T> | BffErrorBody;

export interface AccountStatusSummary extends AccountSummary {
  listener?: { connected: boolean; started: boolean; lastError?: string };
  watchdog?: { at: string; action: 'restart_listener' | 'relogin' | 'skip'; reason: string; ok: boolean; error?: string };
  account?: { userId?: string; displayName?: string; phoneNumber?: string; avatar?: string };
  qrCodeAvailable?: boolean;
}

async function bffReq<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    credentials: 'include',
    headers,
    ...options,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body as BffErrorBody;
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }

  const result = body as BffResponse<T>;
  return result.data;
}

async function bffUpload(url: string, formData: FormData) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body as BffErrorBody;
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }

  const result = body as BffResponse<Record<string, unknown>>;
  return result.data;
}

export const bff = {
  authLogin: (email: string, password: string) =>
    bffReq<{ user: { id: string; email: string; displayName: string; type: string; role?: string } }>('/bff/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  authLogout: () =>
    bffReq<{ ok: boolean }>('/bff/auth/logout', { method: 'POST' }),

  authMe: () =>
    bffReq<{ user: { id: string; email: string; displayName: string; type: string; role?: string } }>('/bff/auth/me'),

  workspaceInit: () =>
    bffReq<{
      status: SessionStatus | null;
      accounts: { accounts: AccountStatusSummary[]; activeAccountId?: string } | null;
      myAccounts: { accounts: Array<{ accountId: string; role: string; visible: boolean; displayName: string; phoneNumber: string; avatar: string; hasSession: boolean }> } | null;
    }>('/bff/workspace/init', { method: 'POST' }),

  workspaceLoadAccount: (accountId: string, refresh = false) =>
    bffReq<{
      contacts: { contacts: Contact[] } | null;
      groups: { groups: Group[] } | null;
      conversations: { conversations: ConversationSummary[] } | null;
    }>('/bff/workspace/load-account', {
      method: 'POST',
      body: JSON.stringify({ accountId, refresh }),
    }),

  chatOpenConversation: (accountId: string, conversationId: string, options: { since?: string; before?: string; limit?: number } = {}) =>
    bffReq<{
      messages: { messages: Message[]; count: number; oldestTimestamp?: string; hasMore?: boolean } | null;
      metadata: { conversationId: string; threadId: string; type: 'direct' | 'group'; messages: Message[] } | null;
    }>('/bff/chat/open-conversation', {
      method: 'POST',
      body: JSON.stringify({ accountId, conversationId, ...options }),
    }),

  chatGetMessages: (accountId: string, conversationId: string, options: { since?: string; before?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (options.since) params.set('since', options.since);
    if (options.before) params.set('before', options.before);
    if (options.limit) params.set('limit', String(options.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return bffReq<{ messages: Message[]; count: number; oldestTimestamp?: string; hasMore?: boolean }>(
      `/bff/chat/conversations/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(conversationId)}${suffix}`,
    );
  },

  chatGetConversations: (accountId: string) =>
    bffReq<{ conversations: ConversationSummary[] }>(`/bff/chat/conversations/${encodeURIComponent(accountId)}`),

  send: (params: {
    accountId: string; conversationId: string;
    text?: string; type?: string; caption?: string;
    stickerId?: string; catId?: string;
  }, file?: File) => {
    if (file) {
      const fd = new FormData();
      fd.append('accountId', params.accountId);
      fd.append('conversationId', params.conversationId);
      fd.append('type', 'attachment');
      fd.append('file', file, file.name);
      if (params.caption) fd.append('caption', params.caption);
      return bffUpload('/bff/chat/send', fd);
    }
    return bffReq<Record<string, unknown>>('/bff/chat/send', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  sendTyping: (accountId: string, conversationId: string, isTyping: boolean) =>
    bffReq<Record<string, unknown>>('/bff/chat/typing', {
      method: 'POST',
      body: JSON.stringify({ accountId, conversationId, isTyping }),
    }),

  sendReaction: (accountId: string, conversationId: string, messageId: string, cliMsgId: string, icon: string) =>
    bffReq<Record<string, unknown>>('/bff/chat/reaction', {
      method: 'POST',
      body: JSON.stringify({ accountId, conversationId, messageId, cliMsgId, icon }),
    }),

  updateReadState: (accountId: string, conversationId: string, readAt: string) =>
    bffReq<{ ok: boolean; readAt: string }>('/bff/chat/read-state', {
      method: 'POST',
      body: JSON.stringify({ accountId, conversationId, readAt }),
    }),

  forwardMessage: (accountId: string, conversationId: string, messageId: string, toThreadId: string, toType: string) =>
    bffReq<Record<string, unknown>>('/bff/chat/forward', {
      method: 'POST',
      body: JSON.stringify({ accountId, conversationId, messageId, toThreadId, toType }),
    }),

  createPoll: (accountId: string, groupId: string, question: string, options: string[]) =>
    bffReq<Record<string, unknown>>('/bff/chat/poll', {
      method: 'POST',
      body: JSON.stringify({ accountId, groupId, question, options }),
    }),

  loginStart: () =>
    bffReq<{ started: boolean }>('/bff/login/start', { method: 'POST' }),

  loginQr: () =>
    bffReq<{ qrCode: string | null; ready: boolean }>('/bff/login/qr'),

  reconnectStart: (accountId: string) =>
    bffReq<{ started: boolean }>(`/bff/admin/accounts/${encodeURIComponent(accountId)}/reconnect`, { method: 'POST' }),

  reconnectQr: (accountId: string) =>
    bffReq<{ qrCode: string | null; ready: boolean }>(`/bff/admin/accounts/${encodeURIComponent(accountId)}/reconnect/qr`),

  activateAccount: (accountId: string) =>
    bffReq<{ ok: boolean; accountId: string; status: SessionStatus }>('/bff/workspace/account/activate', {
      method: 'POST',
      body: JSON.stringify({ accountId }),
    }),

  updateAccountProfile: (accountId: string, updates: { displayName?: string; hubAlias?: string }) =>
    bffReq<{ ok: boolean; account?: AccountSummary }>(`/bff/account/${encodeURIComponent(accountId)}/profile`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  syncHistory: (accountId: string, conversationId: string, options: { beforeMessageId?: string; timeoutMs?: number } = {}) =>
    bffReq<HistorySyncResult>('/bff/sync-history', {
      method: 'POST',
      body: JSON.stringify({ accountId, conversationId, ...options }),
    }),

  mobileSync: (accountId: string) =>
    bffReq<Record<string, unknown>>('/bff/mobile-sync', {
      method: 'POST',
      body: JSON.stringify({ accountId }),
    }),

  mobileSyncThread: (accountId: string, threadId: string, threadType: string, timeoutMs?: number) =>
    bffReq<Record<string, unknown>>('/bff/mobile-sync-thread', {
      method: 'POST',
      body: JSON.stringify({ accountId, threadId, threadType, timeoutMs }),
    }),

  syncAll: (accountId: string) =>
    bffReq<Record<string, unknown>>('/bff/sync-all', {
      method: 'POST',
      body: JSON.stringify({ accountId }),
    }),

  restartAccount: (accountId: string) =>
    bffReq<{ ok: boolean; message?: string }>(`/bff/account/${encodeURIComponent(accountId)}/restart`, { method: 'POST' }),

  myAccounts: () =>
    bffReq<{ accounts: Array<{ accountId: string; role: string; visible: boolean; displayName: string; phoneNumber: string; avatar: string; hasSession: boolean }> }>('/bff/workspace/me/accounts'),

  setAccountVisible: (accountId: string, visible: boolean) =>
    bffReq<Record<string, unknown>>(`/bff/admin/me/accounts/${encodeURIComponent(accountId)}/visible`, {
      method: 'PUT', body: JSON.stringify({ visible }),
    }),

  adminUsers: () => bffReq<any>('/bff/admin/users'),
  adminCreateUser: (email: string, password: string, displayName: string) =>
    bffReq<any>('/bff/admin/users', { method: 'POST', body: JSON.stringify({ email, password, displayName }) }),
  adminUpdateUser: (userId: string, updates: Record<string, unknown>) =>
    bffReq<{ ok: boolean }>(`/bff/admin/users/${encodeURIComponent(userId)}`, { method: 'PUT', body: JSON.stringify(updates) }),
  adminDeleteUser: (userId: string) =>
    bffReq<{ ok: boolean }>(`/bff/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }),

  status: () => bffReq<SessionStatus>('/bff/status'),
  accounts: () =>
    bffReq<{ accounts: AccountStatusSummary[]; activeAccountId?: string }>('/bff/accounts'),
  accountStatus: (accountId: string) =>
    bffReq<SessionStatus>(`/bff/account/${encodeURIComponent(accountId)}/status`),

  accountMobileSync: (accountId: string) => bff.mobileSync(accountId) as any,
  accountSyncAll: (accountId: string) => bff.syncAll(accountId) as any,
  adminUpdateMembership: (userId: string, accountId: string, role: string) =>
    bff.adminAddMember(accountId, userId, role),

  adminAllAccounts: () => bffReq<any>('/bff/admin/accounts/all'),
  adminAccountEntities: (accountId: string) =>
    bffReq<any>(`/bff/admin/accounts/${encodeURIComponent(accountId)}/entities`),
  adminAddMember: (accountId: string, email: string, role: string) =>
    bffReq<any>(`/bff/admin/accounts/${encodeURIComponent(accountId)}/members`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  adminRemoveMember: (accountId: string, userId: string) =>
    bffReq<any>(`/bff/admin/accounts/${encodeURIComponent(accountId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  adminUpdateMemberRole: (accountId: string, userId: string, role: string) =>
    bffReq<any>(`/bff/admin/accounts/${encodeURIComponent(accountId)}/members/${encodeURIComponent(userId)}`, { method: 'PUT', body: JSON.stringify({ role }) }),
  adminTransferMaster: (accountId: string, userId: string) =>
    bffReq<{ ok: boolean; newMasterId: string; previousMasterRole: string }>(`/bff/admin/accounts/${encodeURIComponent(accountId)}/transfer`, { method: 'PUT', body: JSON.stringify({ userId }) }),
  adminDeleteAccount: (accountId: string) =>
    bffReq<{ ok: boolean }>(`/bff/admin/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' }),
  adminLogoutAccount: (accountId: string) =>
    bffReq<{ ok: boolean }>(`/bff/admin/accounts/${encodeURIComponent(accountId)}/logout`, { method: 'POST' }),
  adminUpdateAccount: (accountId: string, updates: { hubAlias?: string }) =>
    bffReq<{ ok: boolean }>(`/bff/admin/accounts/${encodeURIComponent(accountId)}`, { method: 'PUT', body: JSON.stringify(updates) }),
  adminSyncAccountProfile: (accountId: string) =>
    bffReq<Record<string, unknown>>(`/bff/admin/accounts/${encodeURIComponent(accountId)}/sync-profile`, { method: 'POST' }),

  // Dify bots
  adminBots: () => bffReq<any>('/bff/admin/bots'),
  adminBotCreate: (data: Record<string, unknown>) => bffReq<any>('/bff/admin/bots', { method: 'POST', body: JSON.stringify(data) }),
  adminBotUpdate: (id: string, data: Record<string, unknown>) => bffReq<any>(`/bff/admin/bots/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  adminBotDelete: (id: string) => bffReq<{ ok: boolean }>(`/bff/admin/bots/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
