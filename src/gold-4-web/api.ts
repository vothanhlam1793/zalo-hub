import type { ConversationSummary, Friend, Message, SessionStatus } from './types';

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
    req<{ friends: Friend[] }>(`/api/friends${refresh ? '?refresh=1' : ''}`),

  conversations: () =>
    req<{ conversations: ConversationSummary[] }>('/api/conversations'),

  messages: (friendId: string, since?: string) =>
    req<{ messages: Message[] }>(
      `/api/conversations/${encodeURIComponent(friendId)}/messages${since ? `?since=${encodeURIComponent(since)}` : ''}`,
    ),

  sendText: (friendId: string, text: string) =>
    req('/api/send', {
      method: 'POST',
      body: JSON.stringify({ friendId, text }),
    }),

  sendAttachment: (friendId: string, file: File, caption?: string) => {
    const fd = new FormData();
    fd.append('friendId', friendId);
    fd.append('file', file, file.name);
    if (caption) fd.append('caption', caption);
    return upload('/api/send-attachment', fd);
  },
};
