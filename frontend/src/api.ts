import type { AccountSummary, Contact, ConversationSummary, Group, HistorySyncResult, Message, SessionStatus, SendReceipt, SendResponse } from './types';
import { chatSession, readStoredCredential, type ChatSessionSnapshot } from './features/chat/model/chat-session';

export class ApiError extends Error {
  constructor(message: string, public status: number, public receipt?: SendReceipt, public code?: string) { super(message); }
}
export const SEND_TIMEOUT_MS = { text: 30_000, attachment: 120_000 };

export interface AccountStatusSummary extends AccountSummary {
  listener?: { connected: boolean; started: boolean; lastError?: string };
  watchdog?: { at: string; action: 'restart_listener' | 'relogin' | 'skip'; reason: string; ok: boolean; error?: string };
  account?: { userId?: string; displayName?: string; phoneNumber?: string; avatar?: string };
  qrCodeAvailable?: boolean;
}

type RequestIdentity = ChatSessionSnapshot | { bootstrapToken: string } | null;
function assertIdentity(identity: RequestIdentity) {
  if (identity === null) return; // Only the public system login endpoint.
  if ('bootstrapToken' in identity) {
    chatSession.synchronizeCredentials();
    if (identity.bootstrapToken && identity.bootstrapToken === readStoredCredential()) return;
  } else if (chatSession.valid(identity) && identity.token) return;
  throw new ApiError('Phiên đăng nhập đã thay đổi. Vui lòng xác thực lại.', 401);
}
function identityHeaders(identity: RequestIdentity): Record<string, string> {
  assertIdentity(identity);
  const token = identity && ('bootstrapToken' in identity ? identity.bootstrapToken : identity.token);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function req<T>(url: string, options: RequestInit = {}, identity: RequestIdentity = chatSession.capture()): Promise<T> {
  const extraHeaders = (options.headers as Record<string, string>) ?? {};
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...extraHeaders, ...identityHeaders(identity) },
  });
  const body = await res.json().catch(() => ({}));
  assertIdentity(identity);
  if (!res.ok) throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status, body.receipt, body.code);
  return body as T;
}

async function upload(url: string, formData: FormData, signal?: AbortSignal, identity = chatSession.capture()): Promise<SendResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: identityHeaders(identity),
    body: formData,
    signal,
  });
  const body = await res.json().catch(() => ({}));
  assertIdentity(identity);
  if (!res.ok) throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status, body.receipt, body.code);
  return body;
}

export const api = {
  status: () => req<SessionStatus>('/api/status'),
  health: () => req<SessionStatus>('/api/health'),

  loginStart: () => req<{ started: boolean }>('/api/login/start', { method: 'POST', body: '{}' }),
  loginQr: () => req<{ qrCode: string | null; ready: boolean }>('/api/login/qr'),
  reconnectStart: (accountId: string) => req<{ started: boolean }>(`/api/admin/accounts/${encodeURIComponent(accountId)}/reconnect`, { method: 'POST', body: '{}' }),
  reconnectQr: (accountId: string) => req<{ qrCode: string | null; ready: boolean }>(`/api/admin/accounts/${encodeURIComponent(accountId)}/reconnect/qr`),
  logout: () => req('/api/logout', { method: 'POST', body: '{}' }),
  accounts: () => req<{ accounts: AccountStatusSummary[]; activeAccountId?: string }>('/api/accounts'),
  activateAccount: (accountId: string) => req<{ ok: boolean; accountId: string; status: SessionStatus }>('/api/accounts/activate', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  }),
  accountStatus: (accountId: string) => req<SessionStatus>(`/api/accounts/${encodeURIComponent(accountId)}/status`),
  updateAccountProfile: (accountId: string, updates: { displayName?: string; hubAlias?: string }) => req<{ ok: boolean; account?: AccountSummary }>(`/api/accounts/${encodeURIComponent(accountId)}/profile`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),

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

  accountSendText: (accountId: string, conversationId: string, text: string, intent: { clientRequestId?: string; retry?: boolean } = {}, signal?: AbortSignal, identity = chatSession.capture()) =>
    req<SendResponse>(`/api/accounts/${encodeURIComponent(accountId)}/send`, {
      method: 'POST',
      body: JSON.stringify({ conversationId, text, ...intent }),
      signal,
    }, identity),
  sendRequest: (accountId: string, clientRequestId: string, signal?: AbortSignal, identity = chatSession.capture()) =>
    req<{ receipt: SendReceipt }>(`/api/accounts/${encodeURIComponent(accountId)}/send-requests/${encodeURIComponent(clientRequestId)}`, { signal }, identity),

  sendAttachment: (conversationId: string, file: File, caption?: string) => {
    const fd = new FormData();
    fd.append('conversationId', conversationId);
    fd.append('file', file, file.name);
    if (caption) fd.append('caption', caption);
    return upload('/api/send-attachment', fd);
  },

  accountSendAttachment: (accountId: string, conversationId: string, file: File, caption?: string, intent: { clientRequestId?: string; retry?: boolean } = {}, signal?: AbortSignal, identity = chatSession.capture()) => {
    const fd = new FormData();
    fd.append('conversationId', conversationId);
    fd.append('file', file, file.name);
    if (caption) fd.append('caption', caption);
    if (intent.clientRequestId) fd.append('clientRequestId', intent.clientRequestId);
    if (intent.retry) fd.append('retry', 'true');
    return upload(`/api/accounts/${encodeURIComponent(accountId)}/send-attachment`, fd, signal, identity);
  },

  authLogin: (email: string, password: string) =>
    req<{ token: string; user: { id: string; email: string; displayName: string; type: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, null),

  authMe: (token: string) =>
    req<{ token: string; user: { id: string; email: string; displayName: string; type: string } }>('/api/auth/me', {
    }, { bootstrapToken: token }),

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

  accountAddReaction: (accountId: string, conversationId: string, messageId: string, cliMsgId: string, icon: string) =>
    req(`/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/reaction`, {
      method: 'POST',
      body: JSON.stringify({ messageId, cliMsgId, icon }),
    }),

  accountUpdateNotes: (accountId: string, conversationId: string, notes: string | null) =>
    req<{ ok: boolean; conversationId: string; notes: string | null; notesUpdatedBy?: string | null; notesUpdatedAt?: string | null }>(
      `/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/notes`,
      {
        method: 'PUT',
        body: JSON.stringify({ notes }),
      },
    ),

  accountUpdateReadState: (accountId: string, conversationId: string, readAt: string) =>
    req<{ ok: boolean; readAt: string }>(`/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/read-state`, {
      method: 'POST',
      body: JSON.stringify({ readAt }),
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
    req<{ received: number; insertedCount: number; dedupedCount: number; oldestTimestamp?: string; timedOut?: boolean }>(`/api/accounts/${encodeURIComponent(accountId)}/mobile-sync-thread`, {
      method: 'POST',
      body: JSON.stringify({ threadId, threadType, timeoutMs }),
    }),

  accountMobileSync: (accountId: string) =>
    req<{ requ18Synced: number; requ18Failed: number; requ18Received: number; requ18Inserted: number; historySynced: number; historyFailed: number; results: Array<any> }>(`/api/accounts/${encodeURIComponent(accountId)}/mobile-sync`, {
      method: 'POST',
      body: '{}',
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
    req(`/api/admin/accounts/${encodeURIComponent(accountId)}/members`, {
      method: 'POST',
      body: JSON.stringify({ email: userId, role }),
    }),

  myAccounts: () =>
    req<{ accounts: Array<{ accountId: string; role: string; visible: boolean; displayName: string; phoneNumber: string; avatar: string; hasSession: boolean }> }>('/api/me/accounts'),

  setAccountVisible: (accountId: string, visible: boolean) =>
    req(`/api/me/accounts/${encodeURIComponent(accountId)}/visible`, {
      method: 'PUT', body: JSON.stringify({ visible }),
    }),

  adminAddMember: (accountId: string, email: string, role: string) =>
    req(`/api/admin/accounts/${encodeURIComponent(accountId)}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),

  adminRemoveMember: (accountId: string, userId: string) =>
    req(`/api/admin/accounts/${encodeURIComponent(accountId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),

  adminUpdateMemberRole: (accountId: string, userId: string, role: string) =>
    req(`/api/admin/accounts/${encodeURIComponent(accountId)}/members/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),

  adminTransferMaster: (accountId: string, userId: string) =>
    req<{ ok: boolean; newMasterId: string; previousMasterRole: string }>(`/api/admin/accounts/${encodeURIComponent(accountId)}/transfer`, {
      method: 'PUT',
      body: JSON.stringify({ userId }),
    }),

  adminAllAccounts: () =>
    req<{ accounts: Array<AccountSummary & { master: { userId: string; displayName: string; email: string } | null; memberCount: number }> }>('/api/admin/accounts/all'),

  adminUpdateUser: (userId: string, updates: { displayName?: string; role?: string; type?: string; password?: string }) =>
    req<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  adminDeleteAccount: (accountId: string) =>
    req<{ ok: boolean }>(`/api/admin/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' }),

  adminLogoutAccount: (accountId: string) =>
    req<{ ok: boolean }>(`/api/admin/accounts/${encodeURIComponent(accountId)}/logout`, { method: 'POST', body: '{}' }),

  adminUpdateAccount: (accountId: string, updates: { hubAlias?: string }) =>
    req<{ ok: boolean; account?: AccountSummary }>(`/api/admin/accounts/${encodeURIComponent(accountId)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  adminSyncAccountProfile: (accountId: string) =>
    req<{ ok: boolean; account?: AccountSummary }>(`/api/admin/accounts/${encodeURIComponent(accountId)}/sync-profile`, {
      method: 'POST',
      body: '{}',
    }),

  restartAccount: (accountId: string) =>
    req<{ ok: boolean; message?: string; error?: string }>(`/api/accounts/${encodeURIComponent(accountId)}/restart`, {
      method: 'POST',
    }),

  // Tags API
  listTags: (accountId?: string) =>
    req<{ tags: import('./types').TagItem[] }>(`/api/tags${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),

  createTag: (data: { name: string; color?: string; emoji?: string; source?: string; accountId?: string }) =>
    req<{ ok: boolean; tag: import('./types').TagItem }>('/api/tags', { method: 'POST', body: JSON.stringify(data) }),

  deleteTag: (tagId: string) =>
    req<{ ok: boolean; deleted: boolean }>(`/api/tags/${encodeURIComponent(tagId)}`, { method: 'DELETE' }),

  assignTag: (conversationId: string, tagId: string, accountId?: string) =>
    req<{ ok: boolean; conversationId: string; tags: import('./types').TagItem[] }>('/api/tags/assign', {
      method: 'POST',
      body: JSON.stringify({ conversationId, tagId, accountId }),
    }),

  unassignTag: (conversationId: string, tagId: string, accountId?: string) =>
    req<{ ok: boolean; conversationId: string; tags: import('./types').TagItem[] }>('/api/tags/unassign', {
      method: 'POST',
      body: JSON.stringify({ conversationId, tagId, accountId }),
    }),

  syncTags: (accountId: string) =>
    req<{ ok: boolean; tags: import('./types').TagItem[]; count: number }>(`/api/tags/sync/${encodeURIComponent(accountId)}`, {
      method: 'POST',
      body: '{}',
    }),

  // User Settings API
  getUserSettings: () => req<{ ok: boolean; settings: import('./types').UserSettings }>('/api/user/settings'),
  updateUserSettings: (settings: Partial<import('./types').UserSettings>) =>
    req<{ ok: boolean; settings: import('./types').UserSettings }>('/api/user/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  // Mute API
  setConversationMute: (accountId: string, conversationId: string, action: 'mute' | 'unmute', duration = -1) =>
    req<{ ok: boolean; conversationId: string; isMuted: boolean; muteUntil: number | null }>(
      `/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/mute`,
      {
        method: 'POST',
        body: JSON.stringify({ action, duration }),
      },
    ),

  // Dify Bots
  adminBots: () => req<{ bots: Array<any> }>('/api/admin/bots'),
  adminBotCreate: (data: any) => req<any>('/api/admin/bots', { method: 'POST', body: JSON.stringify(data) }),
  adminBotUpdate: (id: string, data: any) => req<any>(`/api/admin/bots/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  adminBotDelete: (id: string) => req<{ ok: boolean }>(`/api/admin/bots/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminAccountEntities: (accountId: string) => req<{ accountId: string; entities: Array<{ id: string; name: string; type: 'group' | 'contact' | 'conversation' }> }>(`/api/admin/accounts/${encodeURIComponent(accountId)}/entities`),
};
