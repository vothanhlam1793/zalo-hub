import type { AccountSummary, Contact, ConversationSummary, Group, HistorySyncResult, Message, SessionStatus } from './types';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function req<T>(url: string, options: RequestInit = {}): Promise<T> {
  const extraHeaders = (options.headers as Record<string, string>) ?? {};
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...extraHeaders },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

async function upload(url: string, formData: FormData) {
  const res = await fetch(url, { method: 'POST', body: formData });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export const api = {
  status: () => req<SessionStatus>('/api/status'),
  health: () => req<SessionStatus>('/api/health'),

  loginStart: () => req<{ started: boolean }>('/api/login/start', { method: 'POST', body: '{}' }),
  loginQr: () => req<{ qrCode: string | null; ready: boolean }>('/api/login/qr'),
  logout: () => req('/api/logout', { method: 'POST', body: '{}' }),
  accounts: () => req<{ accounts: AccountSummary[]; activeAccountId?: string }>('/api/accounts'),
  activateAccount: (accountId: string) => req<{ ok: boolean; accountId: string; status: SessionStatus }>('/api/accounts/activate', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  }),
  accountStatus: (accountId: string) => req<SessionStatus>(`/api/accounts/${encodeURIComponent(accountId)}/status`),

  friends: (refresh = false) =>
    req<{ friends: Contact[] }>(`/api/friends${refresh ? '?refresh=1' : ''}`),

  contacts: (refresh = false) =>
    req<{ contacts: Contact[] }>(`/api/contacts${refresh ? '?refresh=1' : ''}`),

  accountContacts: (accountId: string, refresh = false) =>
    req<{ contacts: Contact[] }>(`/api/accounts/${encodeURIComponent(accountId)}/contacts${refresh ? '?refresh=1' : ''}`),

  groups: (refresh = false) =>
    req<{ groups: Group[] }>(`/api/groups${refresh ? '?refresh=1' : ''}`),

  accountGroups: (accountId: string, refresh = false) =>
    req<{ groups: Group[] }>(`/api/accounts/${encodeURIComponent(accountId)}/groups${refresh ? '?refresh=1' : ''}`),

  conversations: () =>
    req<{ conversations: ConversationSummary[] }>('/api/conversations'),

  accountConversations: (accountId: string) =>
    req<{ conversations: ConversationSummary[] }>(`/api/accounts/${encodeURIComponent(accountId)}/conversations`),

  messages: (conversationId: string, options: { since?: string; before?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (options.since) params.set('since', options.since);
    if (options.before) params.set('before', options.before);
    if (options.limit) params.set('limit', String(options.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return req<{ messages: Message[]; count: number; oldestTimestamp?: string; hasMore?: boolean }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`,
    );
  },

  accountMessages: (accountId: string, conversationId: string, options: { since?: string; before?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (options.since) params.set('since', options.since);
    if (options.before) params.set('before', options.before);
    if (options.limit) params.set('limit', String(options.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return req<{ messages: Message[]; count: number; oldestTimestamp?: string; hasMore?: boolean }>(
      `/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`,
    );
  },

  syncConversationMetadata: (conversationId: string) =>
    req<{ conversationId: string; threadId: string; type: 'direct' | 'group'; messages: Message[] }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/sync-metadata`,
      { method: 'POST', body: '{}' },
    ),

  accountSyncConversationMetadata: (accountId: string, conversationId: string) =>
    req<{ conversationId: string; threadId: string; type: 'direct' | 'group'; messages: Message[] }>(
      `/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/sync-metadata`,
      { method: 'POST', body: '{}' },
    ),

  syncHistory: (conversationId: string, options: { beforeMessageId?: string; timeoutMs?: number } = {}) =>
    req<HistorySyncResult>('/api/conversations/sync-history', {
      method: 'POST',
      body: JSON.stringify({ conversationId, ...options }),
    }),

  accountSyncHistory: (accountId: string, conversationId: string, options: { beforeMessageId?: string; timeoutMs?: number } = {}) =>
    req<HistorySyncResult>(`/api/accounts/${encodeURIComponent(accountId)}/conversations/sync-history`, {
      method: 'POST',
      body: JSON.stringify({ conversationId, ...options }),
    }),

  sendText: (conversationId: string, text: string) =>
    req('/api/send', {
      method: 'POST',
      body: JSON.stringify({ conversationId, text }),
    }),

  accountSendText: (accountId: string, conversationId: string, text: string) =>
    req(`/api/accounts/${encodeURIComponent(accountId)}/send`, {
      method: 'POST',
      body: JSON.stringify({ conversationId, text }),
    }),

  sendAttachment: (conversationId: string, file: File, caption?: string) => {
    const fd = new FormData();
    fd.append('conversationId', conversationId);
    fd.append('file', file, file.name);
    if (caption) fd.append('caption', caption);
    return upload('/api/send-attachment', fd);
  },

  accountSendAttachment: (accountId: string, conversationId: string, file: File, caption?: string) => {
    const fd = new FormData();
    fd.append('conversationId', conversationId);
    fd.append('file', file, file.name);
    if (caption) fd.append('caption', caption);
    return upload(`/api/accounts/${encodeURIComponent(accountId)}/send-attachment`, fd);
  },

  authLogin: (email: string, password: string) =>
    req<{ token: string; user: { id: string; email: string; displayName: string; type: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  authMe: (token: string) =>
    req<{ token: string; user: { id: string; email: string; displayName: string; type: string } }>('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` } as Record<string, string>,
    }),

  accountSendSticker: (accountId: string, conversationId: string, stickerId: string, catId: string) =>
    req(`/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/sticker`, {
      method: 'POST',
      body: JSON.stringify({ stickerId, catId }),
    }),

  accountSendTyping: (accountId: string, conversationId: string, isTyping: boolean) =>
    req(`/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/typing`, {
      method: 'POST',
      body: JSON.stringify({ isTyping }),
    }),

  accountAddReaction: (accountId: string, conversationId: string, messageId: string, type: number) =>
    req(`/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/reaction`, {
      method: 'POST',
      body: JSON.stringify({ messageId, type }),
    }),

  accountCreatePoll: (accountId: string, groupId: string, question: string, options: string[]) =>
    req(`/api/accounts/${encodeURIComponent(accountId)}/groups/${encodeURIComponent(groupId)}/poll`, {
      method: 'POST',
      body: JSON.stringify({ question, options }),
    }),

  accountForwardMessage: (accountId: string, conversationId: string, messageId: string, toThreadId: string, toType: string) =>
    req(`/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/forward`, {
      method: 'POST',
      body: JSON.stringify({ messageId, toThreadId, toType }),
    }),

  accountMobileSyncThread: (accountId: string, threadId: string, threadType: string, timeoutMs?: number) =>
    req<{ received: number; textFrames: string[] }>(`/api/accounts/${encodeURIComponent(accountId)}/mobile-sync-thread`, {
      method: 'POST',
      body: JSON.stringify({ threadId, threadType, timeoutMs }),
    }),

  accountSyncAll: (accountId: string) =>
    req<{ synced: number; failed: number; results: Array<{ conversationId: string; remoteCount: number; insertedCount: number; dedupedCount: number; batchCount?: number }> }>(`/api/accounts/${encodeURIComponent(accountId)}/sync-all`, {
      method: 'POST',
      body: '{}',
    }),

  adminUsers: () => req<{ users: Array<{ id: string; email: string; displayName: string; type: string; memberships: Array<{ account_id: string; role: string }> }> }>('/api/admin/users'),

  adminCreateUser: (email: string, password: string, displayName: string) =>
    req('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    }),

  adminDeleteUser: (userId: string) =>
    req(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }),

  adminUpdateMembership: (userId: string, accountId: string, role: string) =>
    req(`/api/admin/memberships`, {
      method: 'PUT',
      body: JSON.stringify({ userId, accountId, role }),
    }),

  adminUpdateUser: (userId: string, updates: { displayName?: string; role?: string; type?: string; password?: string }) =>
    req<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  adminDeleteAccount: (accountId: string) =>
    req<{ ok: boolean }>(`/api/admin/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' }),

  adminLogoutAccount: (accountId: string) =>
    req<{ ok: boolean }>(`/api/admin/accounts/${encodeURIComponent(accountId)}/logout`, { method: 'POST', body: '{}' }),
};
