import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './api';
import { useWebSocket } from './useWebSocket';
import type { ConversationSummary, Friend, Message, SessionStatus } from './types';

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getInitial(name: string) {
  return (name ?? '?').charAt(0).toUpperCase();
}

function buildConversationFromMessage(message: Message, friends: Friend[]): ConversationSummary {
  const friend = friends.find((entry) => entry.userId === message.friendId);
  return {
    friendId: message.friendId,
    displayName: friend?.displayName,
    lastMessageText: message.text,
    lastMessageKind: message.kind,
    lastMessageTimestamp: message.timestamp,
    lastDirection: message.direction,
    messageCount: 1,
  };
}

function upsertConversationList(
  list: ConversationSummary[],
  message: Message,
  friends: Friend[],
): ConversationSummary[] {
  const next = [...list];
  const index = next.findIndex((item) => item.friendId === message.friendId);
  if (index === -1) {
    next.unshift(buildConversationFromMessage(message, friends));
  } else {
    const current = next[index];
    next[index] = {
      ...current,
      lastMessageText: message.text,
      lastMessageKind: message.kind,
      lastMessageTimestamp: message.timestamp,
      lastDirection: message.direction,
      messageCount: Math.max(current.messageCount, 1),
    };
  }

  next.sort((left, right) => right.lastMessageTimestamp.localeCompare(left.lastMessageTimestamp));
  return next;
}

function MessageBubble({ msg }: { msg: Message }) {
  const dir = msg.direction;
  const att = msg.attachments?.[0];
  const imageUrl = att?.url ?? att?.thumbnailUrl ?? msg.imageUrl;
  const fallbackFileLabel = att?.fileName ?? msg.text ?? (msg.kind === 'video' ? 'Video' : 'File');

  return (
    <div className={`message-row ${dir}`}>
      <div className={`bubble ${dir}`}>
        {(msg.kind === 'image') && imageUrl ? (
          <img src={imageUrl} alt={msg.text || 'Hình ảnh'} />
        ) : (msg.kind === 'file' || msg.kind === 'video') && att ? (
          <div
            className="file-attachment"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <span className="file-icon">{msg.kind === 'video' ? '🎬' : '📎'}</span>
            <div className="file-info">
              <div className="file-name">
                {att.url ? (
                  <a href={att.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                    {fallbackFileLabel}
                  </a>
                ) : (
                  fallbackFileLabel
                )}
              </div>
              {att.size && <div className="file-size">{formatSize(att.size)}</div>}
            </div>
          </div>
        ) : null}
        {msg.text && msg.text !== '[image]' && msg.text !== '[file]' && msg.text !== '[video]' && (
          <div style={{ marginTop: (att && msg.text) ? 6 : 0 }}>{msg.text}</div>
        )}
        <div className="bubble-time">{formatTime(msg.timestamp)}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [qrCode, setQrCode] = useState<string>('');
  const [loginPolling, setLoginPolling] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeFriendId, setActiveFriendId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [loadError, setLoadError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const friendsRef = useRef<Friend[]>([]);

  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);

  const mergeMessages = useCallback((incoming: Message[]) => {
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const merged = [...prev];
      for (const m of incoming) {
        if (!seen.has(m.id)) { seen.add(m.id); merged.push(m); }
      }
      return merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    });
  }, []);

  const { subscribe, unsubscribe } = useWebSocket({
    onStatus: (s) => setStatus(s),
    onConversations: (c) => setConversations(c),
    onMessage: (m) => {
      setConversations((prev) => upsertConversationList(prev, m, friendsRef.current));
      mergeMessages([m]);
    },
  });

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initial status load
  useEffect(() => {
    api.status().then(setStatus).catch(() => {});
  }, []);

  async function refreshQr() {
    try {
      const r = await api.loginQr();
      setQrCode(r.qrCode);
    } catch { setQrCode(''); }
  }

  async function startLogin() {
    await api.loginStart();
    await refreshQr();
    if (loginPollRef.current) clearInterval(loginPollRef.current);
    setLoginPolling(true);
    loginPollRef.current = setInterval(async () => {
      try {
        const s = await api.status();
        setStatus(s);
        await refreshQr();
        if (s.loggedIn) {
          clearInterval(loginPollRef.current!);
          setLoginPolling(false);
          loadData(s);
        }
      } catch { /* ignore */ }
    }, 1500);
  }

  async function loadData(s?: SessionStatus) {
    const cur = s ?? status;
    if (!cur?.sessionActive) return;
    try {
      const [fr, cv] = await Promise.all([api.friends(), api.conversations()]);
      setFriends(fr.friends);
      setConversations(cv.conversations);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không tải được dữ liệu');
    }
  }

  async function handleLogout() {
    await api.logout().catch(() => {});
    setStatus(null);
    setQrCode('');
    setConversations([]);
    setFriends([]);
    setActiveFriendId('');
    setMessages([]);
    setLoadError('');
    unsubscribe();
    setStatusMsg('Đã đăng xuất.');
    api.status().then(setStatus).catch(() => {});
  }

  async function selectConversation(friendId: string) {
    setActiveFriendId(friendId);
    setMessages([]);
    setLoadError('');
    subscribe(friendId);
    try {
      const r = await api.messages(friendId);
      setMessages([]);
      mergeMessages(r.messages);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không tải được history');
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeFriendId || (!text.trim() && !attachFile)) return;
    setSending(true);
    setStatusMsg('');
    try {
      if (attachFile) {
        await api.sendAttachment(activeFriendId, attachFile, text.trim() || undefined);
        setAttachFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        await api.sendText(activeFriendId, text.trim());
      }
      setText('');
      // reload messages
      const r = await api.messages(activeFriendId);
      setMessages([]);
      mergeMessages(r.messages);
      const cv = await api.conversations();
      setConversations(cv.conversations);
      setStatusMsg('Đã gửi.');
      setLoadError('');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Gửi thất bại');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      handleSend(e as any);
    }
  }

  const activeFriend =
    friends.find((f) => f.userId === activeFriendId) ??
    conversations.find((c) => c.friendId === activeFriendId);
  const activeName =
    (activeFriend && 'displayName' in activeFriend ? activeFriend.displayName : activeFriend?.displayName) ?? activeFriendId;

  // Không đăng nhập
  if (!status?.loggedIn) {
    return (
      <div className="login-screen">
        <h1>Zalo Hub</h1>
        <p className="subtitle">Chat 1-1 với tài khoản Zalo cá nhân</p>
        <div className="login-card">
          <span className={`status-badge ${loginPolling ? '' : ''}`}>
            {loginPolling ? 'Đang chờ quét QR...' : 'Chưa đăng nhập'}
          </span>
          {qrCode ? (
            <div className="qr-wrapper">
              <img src={`data:image/png;base64,${qrCode}`} alt="QR đăng nhập Zalo" />
            </div>
          ) : (
            <div className="qr-placeholder">QR chưa sẵn sàng</div>
          )}
          <button className="btn btn-primary" onClick={startLogin} disabled={loginPolling}>
            {loginPolling ? 'Đang chờ...' : 'Tạo QR đăng nhập'}
          </button>
          {statusMsg && <p style={{ color: '#ff8888', margin: 0, fontSize: 13 }}>{statusMsg}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div>
            <h2>Zalo Hub</h2>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
              {status?.account?.displayName ?? 'Đã đăng nhập'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <span className={`status-badge ${status?.listener?.connected ? 'connected' : 'error'}`}>
              {status?.listener?.connected ? 'Live' : 'Offline'}
            </span>
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => loadData()}>
              Làm mới
            </button>
            <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </div>
        <div className="sidebar-body">
          {conversations.length === 0 && friends.length === 0 && (
            <div style={{ padding: 16, color: '#555', fontSize: 13 }}>
              Chưa có cuộc trò chuyện.{' '}
              <span
                style={{ color: '#4f7aff', cursor: 'pointer' }}
                onClick={() => loadData()}
              >
                Tải danh sách bạn bè
              </span>
            </div>
          )}
          {/* Conversations */}
          {conversations.map((c) => {
            const fr = friends.find((f) => f.userId === c.friendId);
            const name = c.displayName ?? fr?.displayName ?? c.friendId;
            const lastPrefix = c.lastMessageKind !== 'text' ? `[${c.lastMessageKind}] ` : '';
            return (
              <div
                key={c.friendId}
                className={`conversation-item ${activeFriendId === c.friendId ? 'active' : ''}`}
                onClick={() => selectConversation(c.friendId)}
              >
                <div className="avatar">{getInitial(name)}</div>
                <div className="conversation-info">
                  <div className="conversation-name">{name}</div>
                  <div className="conversation-last">
                    {c.lastDirection === 'outgoing' ? 'Bạn: ' : ''}
                    {lastPrefix}{c.lastMessageText}
                  </div>
                </div>
              </div>
            );
          })}
          {/* Friends không có conversation */}
          {friends
            .filter((f) => !conversations.find((c) => c.friendId === f.userId))
            .map((f) => (
              <div
                key={f.userId}
                className={`conversation-item ${activeFriendId === f.userId ? 'active' : ''}`}
                onClick={() => selectConversation(f.userId)}
              >
                <div className="avatar">{getInitial(f.displayName)}</div>
                <div className="conversation-info">
                  <div className="conversation-name">{f.displayName}</div>
                  <div className="conversation-last">Nhấn để mở chat</div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Chat panel */}
      <div className="chat-panel">
        {!activeFriendId ? (
          <div className="empty-hint">Chọn một cuộc trò chuyện để bắt đầu</div>
        ) : (
          <>
            <div className="chat-header">
              <div className="avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
                {getInitial(activeName)}
              </div>
              <div>
                <div className="chat-header-name">{activeName}</div>
                <div className="chat-header-id">{activeFriendId}</div>
              </div>
            </div>

            {(statusMsg || loadError) && (
              <div className={`chat-status-banner ${loadError ? 'is-error' : 'is-success'}`}>
                {loadError || statusMsg}
              </div>
            )}

            <div className="messages-area">
              {messages.length === 0 && (
                <div className="empty-hint">Chưa có tin nhắn. Hãy gửi tin nhắn đầu tiên!</div>
              )}
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form className="composer" onSubmit={handleSend}>
              {attachFile && (
                <div className="attachment-preview">
                  <span>📎 {attachFile.name} ({formatSize(attachFile.size)})</span>
                  <button type="button" onClick={() => { setAttachFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>✕</button>
                </div>
              )}
              <div className="composer-row">
                <textarea
                  className="composer-input"
                  placeholder="Nhập tin nhắn..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <div className="composer-actions">
                  <button
                    type="button"
                    className={`attach-btn ${attachFile ? 'has-file' : ''}`}
                    title="Đính kèm ảnh/file"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    📎
                  </button>
                  <button className="send-btn" type="submit" disabled={sending || (!text.trim() && !attachFile)} title="Gửi">
                    ➤
                  </button>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt,.mp4"
                style={{ display: 'none' }}
                onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
              />
            </form>
          </>
        )}
      </div>
    </div>
  );
}
