import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { useWebSocket } from './useWebSocket';
import type {
  AccountSummary,
  Contact,
  ConversationSummary,
  Group,
  HistorySyncResult,
  Message,
  SessionStatus,
  WsConversationMessagePayload,
  WsConversationSummariesPayload,
  WsSessionStatusPayload,
} from './types';

type SidebarTab = 'conversations' | 'contacts' | 'groups';

type AccountSidebarItem = AccountSummary;

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

function getContactDisplayName(contact: Pick<Contact, 'displayName' | 'hubAlias' | 'zaloAlias' | 'zaloName' | 'phoneNumber' | 'userId'>) {
  return contact.hubAlias?.trim()
    || contact.zaloAlias?.trim()
    || contact.zaloName?.trim()
    || contact.phoneNumber?.trim()
    || contact.displayName?.trim()
    || contact.userId;
}

function directConversationId(contactId: string) {
  return `direct:${contactId}`;
}

function groupConversationId(groupId: string) {
  return `group:${groupId}`;
}

function getFileIcon(msg: Message, fileName?: string, mimeType?: string) {
  const lowerName = (fileName ?? '').toLowerCase();
  const lowerMime = (mimeType ?? '').toLowerCase();

  if (msg.kind === 'video' || lowerMime.startsWith('video/')) return '🎬';
  if (lowerMime.includes('pdf') || lowerName.endsWith('.pdf')) return '📕';
  if (lowerMime.includes('sheet') || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) return '📊';
  if (lowerMime.includes('word') || lowerName.endsWith('.doc') || lowerName.endsWith('.docx') || lowerName.endsWith('.txt')) return '📄';
  if (lowerName.endsWith('.zip') || lowerName.endsWith('.rar') || lowerName.endsWith('.7z')) return '🗜️';
  if (lowerMime.startsWith('image/')) return '🖼️';
  return '📎';
}

function isVideoAttachment(msg: Message, fileName?: string, mimeType?: string) {
  const lowerName = (fileName ?? '').toLowerCase();
  const lowerMime = (mimeType ?? '').toLowerCase();
  return msg.kind === 'video' || lowerMime.startsWith('video/') || lowerName.endsWith('.mp4') || lowerName.endsWith('.mov') || lowerName.endsWith('.webm');
}

function isImageAttachment(msg: Message, fileName?: string, mimeType?: string) {
  const lowerName = (fileName ?? '').toLowerCase();
  const lowerMime = (mimeType ?? '').toLowerCase();
  return msg.kind === 'image' || lowerMime.startsWith('image/') || lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.gif') || lowerName.endsWith('.webp');
}

function MessageBubble({ msg, isGroup }: { msg: Message; isGroup: boolean }) {
  const dir = msg.direction;
  const att = msg.attachments?.[0];
  const imageUrl = att?.url ?? att?.thumbnailUrl ?? msg.imageUrl;
  const fallbackFileLabel = att?.fileName ?? msg.text ?? (msg.kind === 'video' ? 'Video' : 'File');
  const fileIcon = getFileIcon(msg, att?.fileName, att?.mimeType);
  const hasAttachmentUrl = Boolean(att?.url);
  const shouldRenderImage = Boolean(imageUrl && isImageAttachment(msg, att?.fileName, att?.mimeType));
  const shouldRenderVideo = Boolean(att?.url && isVideoAttachment(msg, att?.fileName, att?.mimeType));
  const shouldRenderFile = Boolean(att && !shouldRenderImage && !shouldRenderVideo);

  return (
    <div className={`message-row ${dir}`}>
      <div className={`bubble ${dir}`}>
        {isGroup && dir === 'incoming' && msg.senderName && (
          <div style={{ fontSize: 12, color: '#667085', fontWeight: 600, marginBottom: 4 }}>{msg.senderName}</div>
        )}
        {shouldRenderImage ? (
          <img src={imageUrl} alt={msg.text || 'Hình ảnh'} />
        ) : shouldRenderVideo && att?.url ? (
          <div className="media-card">
            <video className="message-video" controls preload="metadata">
              <source src={att.url} type={att.mimeType ?? 'video/mp4'} />
            </video>
            <div className="attachment-actions">
              <a href={att.url} target="_blank" rel="noreferrer">Mở video</a>
              <a href={att.url} download={att.fileName ?? 'video'}>Tải xuống</a>
            </div>
          </div>
        ) : shouldRenderFile && att ? (
          <div className="file-attachment" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="file-icon">{fileIcon}</span>
            <div className="file-info">
              <div className="file-name">
                {hasAttachmentUrl ? (
                  <a href={att.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                    {fallbackFileLabel}
                  </a>
                ) : (
                  fallbackFileLabel
                )}
              </div>
              <div className="file-meta-row">
                {att.mimeType && <span className="file-chip">{att.mimeType.split('/').pop()?.toUpperCase()}</span>}
                {att.size && <div className="file-size">{formatSize(att.size)}</div>}
              </div>
              {hasAttachmentUrl && (
                <div className="attachment-actions">
                  <a href={att.url} target="_blank" rel="noreferrer">Xem file</a>
                  <a href={att.url} download={att.fileName ?? 'download'}>Tải xuống</a>
                </div>
              )}
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
  const [qrCode, setQrCode] = useState('');
  const [loginPolling, setLoginPolling] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('conversations');
  const [query, setQuery] = useState('');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [text, setText] = useState('');
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [loadError, setLoadError] = useState('');
  const [knownAccounts, setKnownAccounts] = useState<AccountSidebarItem[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeConversationIdRef = useRef('');
  const selectionTokenRef = useRef(0);
  const messageCacheRef = useRef(new Map<string, Message[]>());

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function mergeMessageList(base: Message[], incoming: Message[]) {
    const byKey = new Map<string, Message>();
    for (const message of base) {
      byKey.set(message.providerMessageId ?? message.id, message);
    }
    for (const message of incoming) {
      byKey.set(message.providerMessageId ?? message.id, message);
    }
    return [...byKey.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  function getConversationCacheKey(accountId: string, conversationId: string) {
    return `${accountId}::${conversationId}`;
  }

  function setConversationCache(accountId: string, conversationId: string, nextMessages: Message[]) {
    messageCacheRef.current.set(getConversationCacheKey(accountId, conversationId), nextMessages);
  }

  function mergeMessagesIntoConversation(accountId: string, conversationId: string, incoming: Message[], mode: 'append' | 'replace' = 'append') {
    const previous = messageCacheRef.current.get(getConversationCacheKey(accountId, conversationId)) ?? [];
    const next = mode === 'replace' ? mergeMessageList([], incoming) : mergeMessageList(previous, incoming);
    setConversationCache(accountId, conversationId, next);
    if (activeConversationIdRef.current === conversationId) {
      setMessages(next);
    }
    return next;
  }

  function getWorkspaceAccountId(statusOverride?: SessionStatus | null) {
    return selectedAccountId || statusOverride?.account?.userId || status?.account?.userId || '';
  }

  function buildHistoryStatus(result: HistorySyncResult) {
    if (result.timedOut) {
      return 'Đồng bộ lịch sử bị timeout. Có thể điện thoại hoặc nguồn sync của Zalo chưa phản hồi.';
    }

    if (result.remoteCount === 0) {
      return 'Zalo không trả thêm lịch sử cũ cho cuộc trò chuyện này.';
    }

    return `Đồng bộ lịch sử: nhận ${result.remoteCount} tin, thêm mới ${result.insertedCount}, bỏ trùng ${result.dedupedCount}.`;
  }

  function clearComposer() {
    setText('');
    setAttachFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function refreshConversationMessages(accountId: string, conversationId: string, options: { preserveScrollTop?: boolean } = {}) {
    const token = selectionTokenRef.current;
    const r = await api.accountMessages(accountId, conversationId, { limit: 40 });
    const stillActive = activeConversationIdRef.current === conversationId && token === selectionTokenRef.current;
    mergeMessagesIntoConversation(accountId, conversationId, r.messages, 'replace');
    if (stillActive) {
      setHasMoreHistory(Boolean(r.hasMore && r.messages.length >= 40));
    }
    if (stillActive && !options.preserveScrollTop) {
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
    return r;
  }

  async function syncConversationHistory(accountId: string, conversationId: string, beforeMessageId?: string) {
    const token = selectionTokenRef.current;
    if (activeConversationIdRef.current === conversationId) {
      setSyncingHistory(true);
    }
    try {
      const result = await api.accountSyncHistory(accountId, conversationId, { beforeMessageId, timeoutMs: 15000 });
      await refreshConversationMessages(accountId, conversationId, { preserveScrollTop: Boolean(beforeMessageId) });
      const cv = await api.accountConversations(accountId);
      if (token === selectionTokenRef.current) {
        setConversations(cv.conversations);
      }
      if (activeConversationIdRef.current === conversationId && token === selectionTokenRef.current) {
        setStatusMsg(buildHistoryStatus(result));
        setHasMoreHistory(result.hasMore || result.insertedCount > 0);
      }
      return result;
    } finally {
      if (activeConversationIdRef.current === conversationId && token === selectionTokenRef.current) {
        setSyncingHistory(false);
      }
    }
  }

  function prependMessages(conversationId: string, incoming: Message[]) {
    const accountId = getWorkspaceAccountId();
    if (!accountId) {
      return [];
    }
    return mergeMessagesIntoConversation(accountId, conversationId, incoming, 'append');
  }

  const { subscribe, unsubscribe } = useWebSocket({
    onStatus: ({ accountId, status: nextStatus }: WsSessionStatusPayload) => {
      if (!accountId || accountId === getWorkspaceAccountId(nextStatus)) {
        setStatus(nextStatus);
      }
    },
    onConversations: ({ accountId, conversations: nextConversations }: WsConversationSummariesPayload) => {
      if (!accountId || accountId === getWorkspaceAccountId()) {
        setConversations(nextConversations);
      }
    },
    onMessage: ({ accountId, message }: WsConversationMessagePayload) => {
      if (accountId !== getWorkspaceAccountId()) {
        return;
      }
      setConversations((prev) => {
        const next = [...prev];
        const index = next.findIndex((entry) => entry.id === message.conversationId);
        if (index >= 0) {
          next[index] = {
            ...next[index],
            lastMessageText: message.text,
            lastMessageKind: message.kind,
            lastMessageTimestamp: message.timestamp,
            lastDirection: message.direction,
          };
        }
        return next.sort((a, b) => b.lastMessageTimestamp.localeCompare(a.lastMessageTimestamp));
      });

      mergeMessagesIntoConversation(accountId, message.conversationId, [message], 'append');
    },
  });

  useEffect(() => {
    api.status().then(setStatus).catch(() => {});
    api.accounts().then((result) => {
      setKnownAccounts(result.accounts);
      if (result.activeAccountId) {
        setSelectedAccountId(result.activeAccountId);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const userId = status?.account?.userId?.trim();
    const displayName = status?.account?.displayName?.trim();
    if (!userId) {
      return;
    }

    setKnownAccounts((prev) => {
      const nextItem = {
        accountId: userId,
        displayName: displayName || userId,
        phoneNumber: status?.account?.phoneNumber,
        isActive: true,
      } satisfies AccountSidebarItem;
      const existingIndex = prev.findIndex((entry) => entry.accountId === userId);
      const next = existingIndex >= 0
        ? prev.map((entry, index) => index === existingIndex ? { ...entry, ...nextItem } : entry)
        : [...prev, nextItem];
      return next;
    });

    setSelectedAccountId((prev) => prev || userId);
  }, [status?.account?.displayName, status?.account?.phoneNumber, status?.account?.userId]);

  useEffect(() => {
    const accountId = getWorkspaceAccountId();
    if (!status?.sessionActive || !accountId) {
      return;
    }

    void loadData(accountId, status);
  }, [selectedAccountId, status?.sessionActive]);

  async function refreshQr() {
    try {
      const r = await api.loginQr();
      setQrCode(r.qrCode ?? '');
    } catch {
      setQrCode('');
    }
  }

  async function startLogin(targetAccountId?: string) {
    clearComposer();
    setLoadError('');
    setStatusMsg(targetAccountId ? 'Đang mở QR đăng nhập lại...' : 'Đang mở QR thêm tài khoản...');
    const knownAccountIds = new Set(knownAccounts.map((account) => account.accountId));
    await api.loginStart();
    await refreshQr();
    if (loginPollRef.current) clearInterval(loginPollRef.current);
    setLoginPolling(true);
    loginPollRef.current = setInterval(async () => {
      try {
        const s = await api.status();
        setStatus(s);
        api.accounts().then((result) => {
          setKnownAccounts(result.accounts);
          const newlyReadyAccount = result.accounts.find((account) => account.sessionActive && !knownAccountIds.has(account.accountId));
          const targetBecameReady = targetAccountId
            ? result.accounts.find((account) => account.accountId === targetAccountId && account.sessionActive)
            : undefined;
          if (newlyReadyAccount || targetBecameReady) {
            clearInterval(loginPollRef.current!);
            loginPollRef.current = null;
            setLoginPolling(false);
            const readyId = newlyReadyAccount?.accountId ?? targetBecameReady!.accountId;
            setSelectedAccountId(readyId);
            api.activateAccount(readyId).catch(() => {});
            setStatusMsg(newlyReadyAccount ? 'Đã thêm tài khoản mới.' : 'Đã đăng nhập lại tài khoản.');
            loadData(readyId, s);
            return;
          }
        }).catch(() => {});
        await refreshQr();
      } catch {
        // ignore
      }
    }, 1500);
  }

  function cancelLogin() {
    if (loginPollRef.current) {
      clearInterval(loginPollRef.current);
      loginPollRef.current = null;
    }
    setLoginPolling(false);
    setQrCode('');
    setStatusMsg('');
  }

  async function loadData(accountId: string, s?: SessionStatus, options: { refresh?: boolean } = {}) {
    const cur = s ?? status;
    if (!accountId) return;
    if (!cur?.sessionActive) return;
    try {
      const refresh = Boolean(options.refresh);
      const [ct, gp, cv] = await Promise.all([
        api.accountContacts(accountId, refresh),
        api.accountGroups(accountId, refresh),
        api.accountConversations(accountId),
      ]);
      setContacts(ct.contacts);
      setGroups(gp.groups);
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
    setContacts([]);
    setGroups([]);
    setActiveConversationId('');
    setMessages([]);
    clearComposer();
    activeConversationIdRef.current = '';
    selectionTokenRef.current += 1;
    messageCacheRef.current.clear();
    setLoadError('');
    unsubscribe();
    setStatusMsg('Đã đăng xuất.');
    api.status().then(setStatus).catch(() => {});
    api.accounts().then((result) => {
      setKnownAccounts(result.accounts);
      setSelectedAccountId(result.activeAccountId ?? '');
    }).catch(() => {});
  }

  async function handleSelectAccount(accountId: string) {
    setSelectedAccountId(accountId);
    if (accountId === status?.account?.userId) {
      setStatusMsg('');
      return;
    }

    try {
      setStatusMsg('Đang chuyển tài khoản...');
      setLoadError('');
      selectionTokenRef.current += 1;
      activeConversationIdRef.current = '';
      setActiveConversationId('');
      setMessages([]);
      clearComposer();
      setConversations([]);
      setContacts([]);
      setGroups([]);
      messageCacheRef.current.clear();
      unsubscribe();

      const result = await api.activateAccount(accountId);
      setStatus(result.status);
      const accountsResult = await api.accounts();
      setKnownAccounts(accountsResult.accounts);
      setSelectedAccountId(accountsResult.activeAccountId ?? accountId);
      await loadData(accountId, result.status, { refresh: true });
      setStatusMsg('Đã chuyển tài khoản.');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không chuyển được tài khoản');
      setStatusMsg('');
      api.status().then(setStatus).catch(() => {});
      api.accounts().then((result) => {
        setKnownAccounts(result.accounts);
        setSelectedAccountId(result.activeAccountId ?? status?.account?.userId ?? '');
      }).catch(() => {});
    }
  }

  async function selectConversation(conversationId: string) {
    const accountId = getWorkspaceAccountId();
    if (!accountId) {
      setLoadError('Chưa có tài khoản workspace được chọn');
      return;
    }
    const token = selectionTokenRef.current + 1;
    clearComposer();
    selectionTokenRef.current = token;
    setActiveConversationId(conversationId);
    activeConversationIdRef.current = conversationId;
    const cached = messageCacheRef.current.get(getConversationCacheKey(accountId, conversationId)) ?? [];
    setMessages(cached);
    setHasMoreHistory(false);
    setLoadError('');
    setStatusMsg('');
    subscribe(accountId, conversationId);
    try {
      const synced = await api.accountSyncConversationMetadata(accountId, conversationId);
      if (token !== selectionTokenRef.current || activeConversationIdRef.current !== conversationId) {
        return;
      }

      if (synced.conversationId !== conversationId) {
        setActiveConversationId(synced.conversationId);
        activeConversationIdRef.current = synced.conversationId;
        subscribe(accountId, synced.conversationId);
        conversationId = synced.conversationId;
      }

      mergeMessagesIntoConversation(accountId, conversationId, synced.messages, 'replace');
      await loadData(accountId, undefined, { refresh: true });
      const r = await refreshConversationMessages(accountId, conversationId);
      if (token !== selectionTokenRef.current || activeConversationIdRef.current !== conversationId) {
        return;
      }
      if (r.messages.length < 40) {
        await syncConversationHistory(accountId, conversationId, r.messages[0]?.providerMessageId);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không tải được history');
    }
  }

  async function loadOlderMessages() {
    if (!activeConversationId || loadingOlder || !hasMoreHistory || messages.length === 0) {
      return;
    }
    const accountId = getWorkspaceAccountId();
    if (!accountId) {
      return;
    }

    const oldest = messages[0]?.timestamp;
    if (!oldest) return;

    const container = messagesAreaRef.current;
    const previousHeight = container?.scrollHeight ?? 0;

    setLoadingOlder(true);
    try {
      const r = await api.accountMessages(accountId, activeConversationId, { before: oldest, limit: 40 });
      if (r.messages.length > 0) {
        prependMessages(activeConversationId, r.messages);
      } else {
        const syncResult = await syncConversationHistory(accountId, activeConversationId, messages[0]?.providerMessageId);
        if (syncResult.insertedCount > 0) {
          const next = await api.accountMessages(accountId, activeConversationId, { before: oldest, limit: 40 });
          prependMessages(activeConversationId, next.messages);
          setHasMoreHistory(Boolean(next.messages.length >= 40 || syncResult.hasMore));
        } else {
          setHasMoreHistory(false);
        }
      }
      if (r.messages.length > 0) {
        setHasMoreHistory(Boolean(r.messages.length >= 40));
      }
      requestAnimationFrame(() => {
        if (!container) return;
        const nextHeight = container.scrollHeight;
        container.scrollTop = nextHeight - previousHeight;
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không tải được lịch sử cũ hơn');
    } finally {
      setLoadingOlder(false);
    }
  }

  function handleMessagesScroll(e: React.UIEvent<HTMLDivElement>) {
    if (e.currentTarget.scrollTop <= 32) {
      void loadOlderMessages();
    }
  }

  async function openDirectConversation(contact: Contact) {
    const conversationId = directConversationId(contact.userId);
    const displayName = getContactDisplayName(contact);
    if (!conversations.find((entry) => entry.id === conversationId)) {
      setConversations((prev) => [{
        id: conversationId,
        threadId: contact.userId,
        type: 'direct',
        title: displayName,
        avatar: contact.avatar,
        lastMessageText: 'Nhấn để mở chat',
        lastMessageKind: 'text',
        lastMessageTimestamp: new Date(0).toISOString(),
        lastDirection: 'incoming',
        messageCount: 0,
      }, ...prev]);
    }
    await selectConversation(conversationId);
  }

  async function openGroupConversation(group: Group) {
    const conversationId = groupConversationId(group.groupId);
    if (!conversations.find((entry) => entry.id === conversationId)) {
      setConversations((prev) => [{
        id: conversationId,
        threadId: group.groupId,
        type: 'group',
        title: group.displayName,
        avatar: group.avatar,
        lastMessageText: 'Nhấn để mở nhóm chat',
        lastMessageKind: 'text',
        lastMessageTimestamp: new Date(0).toISOString(),
        lastDirection: 'incoming',
        messageCount: 0,
      }, ...prev]);
    }
    await selectConversation(conversationId);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeConversationId || (!text.trim() && !attachFile)) return;
    const accountId = getWorkspaceAccountId();
    if (!accountId) {
      setStatusMsg('Chưa có tài khoản workspace được chọn');
      return;
    }
    setSending(true);
    setStatusMsg('');
    try {
      if (attachFile) {
        await api.accountSendAttachment(accountId, activeConversationId, attachFile, text.trim() || undefined);
        setAttachFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        await api.accountSendText(accountId, activeConversationId, text.trim());
      }
      setText('');
      const r = await api.accountMessages(accountId, activeConversationId, { limit: 40 });
      mergeMessagesIntoConversation(accountId, activeConversationId, r.messages, 'replace');
      const cv = await api.accountConversations(accountId);
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

  const activeConversation = conversations.find((entry) => entry.id === activeConversationId);
  const activeName = activeConversation?.title ?? activeConversationId;
  const isGroupConversation = activeConversation?.type === 'group';
  const currentAccountId = status?.account?.userId ?? '';
  const sidebarAccounts = useMemo(() => {
    if (currentAccountId && !knownAccounts.some((entry) => entry.accountId === currentAccountId)) {
      return [...knownAccounts, {
        accountId: currentAccountId,
        displayName: status?.account?.displayName ?? currentAccountId,
        phoneNumber: status?.account?.phoneNumber,
        isActive: true,
      } satisfies AccountSidebarItem];
    }

    return knownAccounts;
  }, [currentAccountId, knownAccounts, status?.account?.displayName, status?.account?.phoneNumber]);

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((entry) => entry.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((entry) => getContactDisplayName(entry).toLowerCase().includes(q));
  }, [contacts, query]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((entry) => entry.displayName.toLowerCase().includes(q));
  }, [groups, query]);

  if (!status?.loggedIn) {
    return (
      <div className="login-screen">
        <h1>Zalo Hub</h1>
        <p className="subtitle">Chat direct + group với tài khoản Zalo cá nhân</p>
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
      {loginPolling && (
        <div className="qr-overlay">
          <div className="qr-overlay-card">
            <span className="status-badge">Đang chờ quét QR...</span>
            {statusMsg && <p style={{ color: '#ff6666', margin: '8px 0', fontSize: 13 }}>{statusMsg}</p>}
            {qrCode ? (
              <div className="qr-wrapper">
                <img src={`data:image/png;base64,${qrCode}`} alt="QR đăng nhập Zalo" />
              </div>
            ) : (
              <div className="qr-placeholder">QR chưa sẵn sàng...</div>
            )}
            <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={cancelLogin}>Hủy</button>
          </div>
        </div>
      )}
      <div className="mini-sidebar">
        <button className="mini-sidebar-add" type="button" title="Thêm tài khoản Zalo" onClick={() => void startLogin()}>
          +
        </button>

        <div className="mini-sidebar-list">
          {sidebarAccounts.map((account) => {
            const isCurrent = account.sessionActive === true;
            const isSelected = account.accountId === (selectedAccountId || currentAccountId);
            const label = account.displayName ?? account.accountId;
            const subtitle = account.phoneNumber;
            const canActivate = account.sessionActive ?? account.accountId === currentAccountId;
            return (
              <button
                key={account.accountId}
                type="button"
                title={subtitle ? `${label} • ${subtitle}` : label}
                className={`mini-account ${isSelected ? 'active' : ''} ${isCurrent ? 'is-current' : ''}`}
                onClick={() => {
                  if (!canActivate) {
                    setStatusMsg(`Đang mở QR đăng nhập lại cho ${label}...`);
                    setLoadError('');
                    void startLogin(account.accountId);
                    return;
                  }
                  void handleSelectAccount(account.accountId);
                }}
              >
                <span className="mini-account-avatar">{getInitial(label)}</span>
                {isCurrent && <span className="mini-account-dot" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="sidebar">
        <div className="sidebar-header">
          <div>
            <h2>Zalo Hub</h2>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
              {sidebarAccounts.find((a) => a.accountId === getWorkspaceAccountId())?.displayName ?? status?.account?.displayName ?? 'Đã đăng nhập'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <span className={`status-badge ${status?.listener?.connected ? 'connected' : 'error'}`}>
              {status?.listener?.connected ? 'Live' : 'Offline'}
            </span>
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => {
              const id = getWorkspaceAccountId();
              if (id) loadData(id, undefined, { refresh: true });
            }}>
              Làm mới
            </button>
            <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '12px 14px 6px' }}>
          <button className="btn btn-ghost" onClick={() => setSidebarTab('conversations')}>Cuộc trò chuyện</button>
          <button className="btn btn-ghost" onClick={() => setSidebarTab('contacts')}>Bạn bè</button>
          <button className="btn btn-ghost" onClick={() => setSidebarTab('groups')}>Nhóm</button>
        </div>

        <div style={{ padding: '0 14px 10px' }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={sidebarTab === 'conversations' ? 'Tìm cuộc trò chuyện...' : sidebarTab === 'contacts' ? 'Tìm bạn bè...' : 'Tìm nhóm...'}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #d7dce5' }}
          />
        </div>

        <div className="sidebar-body">
          {sidebarTab === 'conversations' && filteredConversations.map((entry) => (
            <div
              key={entry.id}
              className={`conversation-item ${activeConversationId === entry.id ? 'active' : ''}`}
              onClick={() => selectConversation(entry.id)}
            >
              <div className="avatar">{getInitial(entry.title)}</div>
              <div className="conversation-info">
                <div className="conversation-name">{entry.title}{entry.type === 'group' ? ' (Nhóm)' : ''}</div>
                <div className="conversation-last">
                  {entry.lastDirection === 'outgoing' ? 'Bạn: ' : ''}
                  {entry.lastMessageKind !== 'text' ? `[${entry.lastMessageKind}] ` : ''}
                  {entry.lastMessageText}
                </div>
              </div>
            </div>
          ))}

          {sidebarTab === 'contacts' && filteredContacts.map((entry) => (
            <div
              key={entry.userId}
              className={`conversation-item ${activeConversationId === directConversationId(entry.userId) ? 'active' : ''}`}
              onClick={() => openDirectConversation(entry)}
            >
              <div className="avatar">{getInitial(getContactDisplayName(entry))}</div>
              <div className="conversation-info">
                <div className="conversation-name">{getContactDisplayName(entry)}</div>
                <div className="conversation-last">Nhấn để mở chat</div>
              </div>
            </div>
          ))}

          {sidebarTab === 'groups' && filteredGroups.map((entry) => (
            <div
              key={entry.groupId}
              className={`conversation-item ${activeConversationId === groupConversationId(entry.groupId) ? 'active' : ''}`}
              onClick={() => openGroupConversation(entry)}
            >
              <div className="avatar">{getInitial(entry.displayName)}</div>
              <div className="conversation-info">
                <div className="conversation-name">{entry.displayName}</div>
                <div className="conversation-last">{entry.memberCount ? `${entry.memberCount} thành viên` : 'Nhấn để mở nhóm chat'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="chat-panel">
        {!activeConversationId ? (
          <div className="empty-hint">Chọn một cuộc trò chuyện để bắt đầu</div>
        ) : (
          <>
            <div className="chat-header">
              <div className="avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
                {getInitial(activeName)}
              </div>
              <div>
                <div className="chat-header-name">{activeName}</div>
                <div className="chat-header-id">{activeConversationId}</div>
              </div>
            </div>

            {(statusMsg || loadError) && (
              <div className={`chat-status-banner ${loadError ? 'is-error' : 'is-success'}`}>
                {loadError || statusMsg}
              </div>
            )}

            <div className="messages-area" ref={messagesAreaRef} onScroll={handleMessagesScroll}>
              {hasMoreHistory && (
                <div className="history-loader">{loadingOlder || syncingHistory ? 'Đang tải thêm tin cũ...' : 'Kéo lên để tải thêm tin cũ'}</div>
              )}
              {messages.length === 0 && (
                <div className="empty-hint">Chưa có tin nhắn. Hãy gửi tin nhắn đầu tiên!</div>
              )}
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} isGroup={isGroupConversation} />
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
                  placeholder={isGroupConversation ? 'Nhập tin nhắn vào nhóm...' : 'Nhập tin nhắn...'}
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
