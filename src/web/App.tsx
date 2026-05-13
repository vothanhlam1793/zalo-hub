import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { useWebSocket } from './useWebSocket';
import { directConversationId, getContactDisplayName, groupConversationId } from './utils';
import type {
  AccountSummary,
  Contact,
  ConversationSummary,
  Group,
  Message,
  SessionStatus,
  WsConversationMessagePayload,
  WsConversationSummariesPayload,
  WsSessionStatusPayload,
} from './types';
import { LoginScreen } from './components/LoginScreen';
import { QrOverlay } from './components/QrOverlay';
import { MiniSidebar } from './components/MiniSidebar';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { useMessageCache } from './hooks/useMessageCache';
import { useLogin } from './hooks/useLogin';
import { useAccountManager } from './hooks/useAccountManager';
import { useConversationManager } from './hooks/useConversationManager';
import { useComposer } from './hooks/useComposer';

type SidebarTab = 'conversations' | 'contacts' | 'groups';

export default function App() {
  const [status, setStatus] = useState<SessionStatus | null>(null);
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
  const [knownAccounts, setKnownAccounts] = useState<AccountSummary[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeConversationIdRef = useRef('');
  const selectionTokenRef = useRef(0);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const messageCache = useMessageCache();
  const login = useLogin();
  const { loadData, handleLogout, handleSelectAccount } = useAccountManager();
  const { selectConversation, loadOlderMessages, refreshConversationMessages, syncConversationHistory } = useConversationManager();
  const { handleSend, handleKeyDown } = useComposer();

  const resolveWorkspaceId = useCallback((s?: SessionStatus | null) => {
    return selectedAccountId || s?.account?.userId || status?.account?.userId || '';
  }, [selectedAccountId, status]);

  const clearComposer = useCallback(() => {
    setText('');
    setAttachFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const { subscribe, unsubscribe } = useWebSocket({
    onStatus: ({ accountId, status: nextStatus }: WsSessionStatusPayload) => {
      if (!accountId || accountId === resolveWorkspaceId(nextStatus)) {
        setStatus(nextStatus);
      }
    },
    onConversations: ({ accountId, conversations: nextConversations }: WsConversationSummariesPayload) => {
      if (!accountId || accountId === resolveWorkspaceId()) {
        setConversations(nextConversations);
      }
    },
    onMessage: ({ accountId, message }: WsConversationMessagePayload) => {
      if (accountId !== resolveWorkspaceId()) return;
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
      const { next } = messageCache.mergeMessagesIntoConversation(accountId, message.conversationId, [message], 'append');
      if (activeConversationIdRef.current === message.conversationId) {
        setMessages(next);
      }
    },
  });

  useEffect(() => {
    api.status().then(setStatus).catch(() => {});
    api.accounts().then((result) => {
      setKnownAccounts(result.accounts);
      if (result.activeAccountId) setSelectedAccountId(result.activeAccountId);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const userId = status?.account?.userId?.trim();
    const displayName = status?.account?.displayName?.trim();
    if (!userId) return;
    setKnownAccounts((prev) => {
      const nextItem = { accountId: userId, displayName: displayName || userId, phoneNumber: status?.account?.phoneNumber, isActive: true } satisfies AccountSummary;
      const existingIndex = prev.findIndex((e) => e.accountId === userId);
      return existingIndex >= 0
        ? prev.map((e, i) => i === existingIndex ? { ...e, ...nextItem } : e)
        : [...prev, nextItem];
    });
    setSelectedAccountId((prev) => prev || userId);
  }, [status?.account?.displayName, status?.account?.phoneNumber, status?.account?.userId]);

  useEffect(() => {
    const accountId = resolveWorkspaceId();
    if (!status?.sessionActive || !accountId) return;
    void loadData(accountId, status, {}, setContacts, setGroups, setConversations, setLoadError);
  }, [selectedAccountId, status?.sessionActive]);

  const onStartLogin = useCallback(() => {
    void login.startLogin(
      undefined, knownAccounts,
      (accountId, s) => { loadData(accountId, s, {}, setContacts, setGroups, setConversations, setLoadError); },
      setStatusMsg, setLoadError, setStatus, setKnownAccounts, setSelectedAccountId, undefined!,
    );
  }, [login, knownAccounts]);

  const onReLogin = useCallback((accountId: string, label: string) => {
    setStatusMsg(`Đang mở QR đăng nhập lại cho ${label}...`);
    setLoadError('');
    void login.startLogin(
      accountId, knownAccounts,
      (readyId, s) => { loadData(readyId, s, {}, setContacts, setGroups, setConversations, setLoadError); },
      setStatusMsg, setLoadError, setStatus, setKnownAccounts, setSelectedAccountId, undefined!,
    );
  }, [login, knownAccounts]);

  const onLogout = useCallback(() => {
    void handleLogout(
      setStatus, setConversations, setContacts, setGroups, setActiveConversationId, setMessages,
      clearComposer, messageCache.clearCache, setLoadError, setStatusMsg, unsubscribe,
      setKnownAccounts, setSelectedAccountId, activeConversationIdRef, selectionTokenRef,
    );
  }, [handleLogout, clearComposer, messageCache, unsubscribe]);

  const onSelectAccount = useCallback((accountId: string) => {
    if (accountId === status?.account?.userId) {
      setSelectedAccountId(accountId);
      setStatusMsg('');
      return;
    }
    const innerLoad = (aid: string, s?: SessionStatus | null, opts?: { refresh?: boolean }) =>
      loadData(aid, s, opts, setContacts, setGroups, setConversations, setLoadError);
    void handleSelectAccount(
      accountId, setSelectedAccountId, setStatus, setStatusMsg, setLoadError,
      setActiveConversationId, setMessages, setConversations, setContacts, setGroups,
      clearComposer, messageCache.clearCache, unsubscribe, setKnownAccounts,
      innerLoad, activeConversationIdRef, selectionTokenRef,
    );
  }, [status, handleSelectAccount, loadData, clearComposer, messageCache, unsubscribe]);

  const onSelectConversation = useCallback((conversationId: string) => {
    const accountId = resolveWorkspaceId();
    if (!accountId) { setLoadError('Chưa có tài khoản workspace được chọn'); return; }
    void selectConversation(
      conversationId, accountId, subscribe, messageCache.getCachedMessages,
      messageCache.mergeMessagesIntoConversation, setMessages, setActiveConversationId,
      setHasMoreHistory, setLoadError, setStatusMsg,
      (aid, s, opts) => loadData(aid, s, opts, setContacts, setGroups, setConversations, setLoadError),
      (aid, cid) => refreshConversationMessages(aid, cid, messageCache.mergeMessagesIntoConversation, setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef),
      (aid, cid, bmid) => syncConversationHistory(aid, cid, bmid, (a, c) => refreshConversationMessages(a, c, messageCache.mergeMessagesIntoConversation, setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef), setSyncingHistory, setStatusMsg, setHasMoreHistory, setConversations, selectionTokenRef, activeConversationIdRef),
      selectionTokenRef, activeConversationIdRef,
    );
  }, [resolveWorkspaceId, selectConversation, subscribe, messageCache, refreshConversationMessages, syncConversationHistory, loadData]);

  const onOpenDirectConversation = useCallback((contact: Contact) => {
    const conversationId = directConversationId(contact.userId);
    const displayName = getContactDisplayName(contact);
    if (!conversations.find((e) => e.id === conversationId)) {
      setConversations((prev) => [{
        id: conversationId, threadId: contact.userId, type: 'direct', title: displayName,
        avatar: contact.avatar, lastMessageText: 'Nhấn để mở chat', lastMessageKind: 'text',
        lastMessageTimestamp: new Date(0).toISOString(), lastDirection: 'incoming', messageCount: 0,
      }, ...prev]);
    }
    void onSelectConversation(conversationId);
  }, [conversations, onSelectConversation]);

  const onOpenGroupConversation = useCallback((group: Group) => {
    const conversationId = groupConversationId(group.groupId);
    if (!conversations.find((e) => e.id === conversationId)) {
      setConversations((prev) => [{
        id: conversationId, threadId: group.groupId, type: 'group', title: group.displayName,
        avatar: group.avatar, lastMessageText: 'Nhấn để mở nhóm chat', lastMessageKind: 'text',
        lastMessageTimestamp: new Date(0).toISOString(), lastDirection: 'incoming', messageCount: 0,
      }, ...prev]);
    }
    void onSelectConversation(conversationId);
  }, [conversations, onSelectConversation]);

  const onLoadOlder = useCallback(() => {
    const accountId = resolveWorkspaceId();
    if (!accountId) return;
    void loadOlderMessages(
      accountId, activeConversationId, messages, hasMoreHistory, loadingOlder,
      setLoadingOlder, setHasMoreHistory, setLoadError,
      (aid, cid, incoming) => {
        const { next } = messageCache.prependMessages(aid, cid, incoming);
        if (activeConversationIdRef.current === cid) setMessages(next);
        return { next };
      },
      (aid, cid, bmid) => syncConversationHistory(aid, cid, bmid,
        (a, c) => refreshConversationMessages(a, c, messageCache.mergeMessagesIntoConversation, setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef),
        setSyncingHistory, setStatusMsg, setHasMoreHistory, setConversations, selectionTokenRef, activeConversationIdRef),
      { current: null } as any,
    );
  }, [resolveWorkspaceId, loadOlderMessages, activeConversationId, messages, hasMoreHistory, loadingOlder, messageCache, syncConversationHistory, refreshConversationMessages]);

  const onMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop <= 32) onLoadOlder();
  }, [onLoadOlder]);

  const onSend = useCallback((e: React.FormEvent) => {
    const accountId = resolveWorkspaceId();
    void handleSend(
      e, activeConversationId, text, attachFile, accountId,
      setText, setAttachFile, setSending, setStatusMsg, setLoadError, setConversations,
      messageCache.mergeMessagesIntoConversation, fileInputRef,
    );
  }, [resolveWorkspaceId, handleSend, activeConversationId, text, attachFile, messageCache]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    handleKeyDown(e, onSend);
  }, [handleKeyDown, onSend]);

  const onRefresh = useCallback(() => {
    const id = resolveWorkspaceId();
    if (id) loadData(id, status, { refresh: true }, setContacts, setGroups, setConversations, setLoadError);
  }, [resolveWorkspaceId, status, loadData]);

  const activeConversation = conversations.find((e) => e.id === activeConversationId);
  const activeName = activeConversation?.title ?? activeConversationId;
  const isGroupConversation = activeConversation?.type === 'group';
  const currentAccountId = status?.account?.userId ?? '';

  const sidebarAccounts = useMemo(() => {
    if (currentAccountId && !knownAccounts.some((e) => e.accountId === currentAccountId)) {
      return [...knownAccounts, { accountId: currentAccountId, displayName: status?.account?.displayName ?? currentAccountId, phoneNumber: status?.account?.phoneNumber, isActive: true } satisfies AccountSummary];
    }
    return knownAccounts;
  }, [currentAccountId, knownAccounts, status?.account?.displayName, status?.account?.phoneNumber]);

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((e) => e.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((e) => getContactDisplayName(e).toLowerCase().includes(q));
  }, [contacts, query]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((e) => e.displayName.toLowerCase().includes(q));
  }, [groups, query]);

  if (!status?.loggedIn) {
    return (
      <LoginScreen
        loginPolling={login.loginPolling}
        qrCode={login.qrCode}
        statusMsg={statusMsg}
        onStartLogin={onStartLogin}
      />
    );
  }

  return (
    <div className="app-shell">
      {login.loginPolling && (
        <QrOverlay qrCode={login.qrCode} statusMsg={statusMsg} onCancel={login.cancelLogin} />
      )}
      <MiniSidebar
        accounts={sidebarAccounts}
        selectedAccountId={selectedAccountId}
        currentAccountId={currentAccountId}
        onAddAccount={onStartLogin}
        onSelectAccount={onSelectAccount}
        onReLogin={onReLogin}
      />
      <Sidebar
        sidebarTab={sidebarTab}
        onTabChange={setSidebarTab}
        query={query}
        onQueryChange={setQuery}
        conversations={filteredConversations}
        contacts={filteredContacts}
        groups={filteredGroups}
        activeConversationId={activeConversationId}
        workspaceAccountId={resolveWorkspaceId()}
        accounts={sidebarAccounts}
        statusDisplayName={status?.account?.displayName ?? 'Đã đăng nhập'}
        listenerConnected={status?.listener?.connected ?? false}
        onRefresh={onRefresh}
        onLogout={onLogout}
        onSelectConversation={onSelectConversation}
        onOpenDirectConversation={onOpenDirectConversation}
        onOpenGroupConversation={onOpenGroupConversation}
      />
      <ChatPanel
        activeConversationId={activeConversationId}
        activeConversation={activeConversation}
        activeName={activeName}
        isGroupConversation={isGroupConversation}
        messages={messages}
        hasMoreHistory={hasMoreHistory}
        loadingOlder={loadingOlder}
        syncingHistory={syncingHistory}
        statusMsg={statusMsg}
        loadError={loadError}
        text={text}
        attachFile={attachFile}
        sending={sending}
        onScroll={onMessagesScroll}
        onTextChange={setText}
        onKeyDown={onKeyDown}
        onSend={onSend}
        onAttachFile={setAttachFile}
        onClearFile={() => { setAttachFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
      />
    </div>
  );
}
