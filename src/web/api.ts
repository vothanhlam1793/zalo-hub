import type { Contact, ConversationSummary, Group, Message, SessionStatus } from './types';

async function req<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...((options.headers as Record<string, string>) ?? {}) },
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
  loginQr: () => req<{ qrCode: string }>('/api/login/qr'),
  logout: () => req('/api/logout', { method: 'POST', body: '{}' }),

  friends: (refresh = false) =>
    req<{ friends: Contact[] }>(`/api/friends${refresh ? '?refresh=1' : ''}`),

  contacts: (refresh = false) =>
    req<{ contacts: Contact[] }>(`/api/contacts${refresh ? '?refresh=1' : ''}`),

  groups: (refresh = false) =>
    req<{ groups: Group[] }>(`/api/groups${refresh ? '?refresh=1' : ''}`),

  conversations: () =>
    req<{ conversations: ConversationSummary[] }>('/api/conversations'),

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

  sendText: (conversationId: string, text: string) =>
    req('/api/send', {
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
};
