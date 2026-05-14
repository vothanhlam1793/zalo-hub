import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { api } from './api';
import { useWebSocket } from './useWebSocket';
import { directConversationId, getContactDisplayName, groupConversationId } from './utils';
import { useAuthStore } from './stores/auth-store';
import type {
  AccountSummary,
  Contact,
  ConversationSummary,
  Group,
  SessionStatus,
  WsConversationMessagePayload,
  WsConversationSummariesPayload,
  WsSessionStatusPayload,
} from './types';
import { QrOverlay } from './components/QrOverlay';
import { MiniSidebar } from './components/MiniSidebar';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { useMessageCache } from './hooks/useMessageCache';
import { useLogin } from './hooks/useLogin';
import { useAccountManager } from './hooks/useAccountManager';
import { useConversationManager } from './hooks/useConversationManager';
import { useComposer } from './hooks/useComposer';
import { useWorkspaceStore } from './stores/workspace-store';
import { useChatStore } from './stores/chat-store';
import { useComposerStore } from './stores/composer-store';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';
import { AuthGuard } from './components/AuthGuard';

function DashboardPage() {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeConversationIdRef = useRef('');
  const selectionTokenRef = useRef(0);
  const loadedAccountRef = useRef('');

  const workspace = useWorkspaceStore();
  const chat = useChatStore();
  const composer = useComposerStore();
  const { user } = useAuthStore();

  useEffect(() => {
    activeConversationIdRef.current = chat.activeConversationId;
  }, [chat.activeConversationId]);

  const messageCache = useMessageCache();
  const login = useLogin();
  const { loadData, handleLogout, handleSelectAccount } = useAccountManager();
  const { selectConversation, loadOlderMessages, refreshConversationMessages, syncConversationHistory } = useConversationManager();
  const { handleSend, handleKeyDown } = useComposer();

  const resolveWorkspaceId = useCallback(() => {
    return workspace.selectedAccountId || status?.account?.userId || '';
  }, [workspace.selectedAccountId, status]);

  const clearComposer = useCallback(() => {
    composer.clearComposer();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [composer]);

  const { subscribe, unsubscribe } = useWebSocket({
    onStatus: ({ accountId, status: nextStatus }: WsSessionStatusPayload) => {
      if (!accountId || accountId === resolveWorkspaceId()) {
        setStatus(nextStatus);
      }
    },
    onConversations: ({ accountId, conversations: nextConversations }: WsConversationSummariesPayload) => {
      if (!accountId || accountId === resolveWorkspaceId()) {
        chat.setConversations(nextConversations);
      }
    },
    onMessage: ({ accountId, message }: WsConversationMessagePayload) => {
      if (accountId !== resolveWorkspaceId()) return;
      chat.updateConversationFromWs(message);
      const { next } = messageCache.mergeMessagesIntoConversation(accountId, message.conversationId, [message], 'append');
      if (activeConversationIdRef.current === message.conversationId) {
        chat.setMessages(next);
      }
    },
    onSyncStatus: ({ accountId, status: syncStatus, requ18Received, historySynced, historyMsgs }) => {
      if (accountId !== resolveWorkspaceId()) return;
      if (syncStatus === 'loading') composer.setStatusMsg('Đang tự động đồng bộ contacts & groups...');
      else if (syncStatus === 'syncing') composer.setStatusMsg('Đang tự động đồng bộ lịch sử chat...');
      else if (syncStatus === 'done') {
        composer.setStatusMsg(`Tự động đồng bộ xong: ${requ18Received ?? 0} tin req_18 + ${historySynced ?? 0} cuộc trò chuyện (${historyMsgs ?? 0} tin)`);
        loadData(accountId, status, { refresh: true }, chat.setContacts, chat.setGroups, chat.setConversations, composer.setLoadError);
      } else if (syncStatus === 'error') {
        composer.setLoadError('Tự động đồng bộ thất bại');
      }
    },
  });

  useEffect(() => {
    api.status().then(setStatus).catch(() => {});
    api.accounts().then((result) => {
      workspace.setKnownAccounts(result.accounts);
      if (result.activeAccountId) workspace.setSelectedAccountId(result.activeAccountId);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const userId = status?.account?.userId?.trim();
    const displayName = status?.account?.displayName?.trim();
    if (!userId) return;
    workspace.addOrUpdateAccount({
      accountId: userId,
      displayName: displayName || userId,
      phoneNumber: status?.account?.phoneNumber,
      isActive: true,
    });
    if (!workspace.selectedAccountId) {
      workspace.setSelectedAccountId(userId);
    }
  }, [status?.account?.displayName, status?.account?.phoneNumber, status?.account?.userId]);

  useEffect(() => {
    const accountId = resolveWorkspaceId();
    if (!status?.sessionActive || !accountId || accountId === loadedAccountRef.current) return;
    loadedAccountRef.current = accountId;
    chat.resetChat();
    void loadData(accountId, status, {}, chat.setContacts, chat.setGroups, chat.setConversations, composer.setLoadError);
  }, [workspace.selectedAccountId, status?.sessionActive]);

  const onStartLogin = useCallback(() => {
    void login.startLogin(
      undefined, workspace.knownAccounts,
      (accountId, s) => { loadData(accountId, s, {}, chat.setContacts, chat.setGroups, chat.setConversations, composer.setLoadError); },
      composer.setStatusMsg, composer.setLoadError, setStatus, workspace.setKnownAccounts, workspace.setSelectedAccountId, undefined!,
    );
  }, [login, workspace.knownAccounts, loadData, chat, composer]);

  const onReLogin = useCallback((accountId: string, label: string) => {
    composer.setStatusMsg(`Đang mở QR đăng nhập lại cho ${label}...`);
    composer.setLoadError('');
    void login.startLogin(
      accountId, workspace.knownAccounts,
      (readyId, s) => { loadData(readyId, s, {}, chat.setContacts, chat.setGroups, chat.setConversations, composer.setLoadError); },
      composer.setStatusMsg, composer.setLoadError, setStatus, workspace.setKnownAccounts, workspace.setSelectedAccountId, undefined!,
    );
  }, [login, workspace.knownAccounts, loadData, chat, composer]);

  const onLogout = useCallback(() => {
    void handleLogout(
      setStatus, chat.setConversations, chat.setContacts, chat.setGroups, chat.setActiveConversationId, chat.setMessages,
      clearComposer, messageCache.clearCache, composer.setLoadError, composer.setStatusMsg, unsubscribe,
      workspace.setKnownAccounts, workspace.setSelectedAccountId, activeConversationIdRef, selectionTokenRef,
    );
  }, [handleLogout, clearComposer, messageCache, unsubscribe, chat, workspace, composer]);

  const onSelectAccount = useCallback((accountId: string) => {
    loadedAccountRef.current = '';
    const innerLoad = (aid: string, s?: SessionStatus | null, opts?: { refresh?: boolean }) =>
      loadData(aid, s, opts, chat.setContacts, chat.setGroups, chat.setConversations, composer.setLoadError);
    void handleSelectAccount(
      accountId, workspace.setSelectedAccountId, setStatus, composer.setStatusMsg, composer.setLoadError,
      chat.setActiveConversationId, chat.setMessages, chat.setConversations, chat.setContacts, chat.setGroups,
      clearComposer, messageCache.clearCache, unsubscribe, workspace.setKnownAccounts,
      innerLoad, activeConversationIdRef, selectionTokenRef,
    );
  }, [handleSelectAccount, loadData, clearComposer, messageCache, unsubscribe, chat, workspace, composer]);

  const onSelectConversation = useCallback((conversationId: string) => {
    const accountId = resolveWorkspaceId();
    if (!accountId) { composer.setLoadError('Chưa có tài khoản workspace được chọn'); return; }
    void selectConversation(
      conversationId, accountId, subscribe, messageCache.getCachedMessages,
      messageCache.mergeMessagesIntoConversation, chat.setMessages, chat.setActiveConversationId,
      chat.setHasMoreHistory, composer.setLoadError, composer.setStatusMsg,
      (aid, s, opts) => loadData(aid, s, opts, chat.setContacts, chat.setGroups, chat.setConversations, composer.setLoadError),
      (aid, cid) => refreshConversationMessages(aid, cid, messageCache.mergeMessagesIntoConversation, chat.setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef),
      (aid, cid, bmid) => syncConversationHistory(aid, cid, bmid, (a, c) => refreshConversationMessages(a, c, messageCache.mergeMessagesIntoConversation, chat.setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef), chat.setSyncingHistory, composer.setStatusMsg, chat.setHasMoreHistory, chat.setConversations, selectionTokenRef, activeConversationIdRef),
      selectionTokenRef, activeConversationIdRef,
    );
  }, [resolveWorkspaceId, selectConversation, subscribe, messageCache, refreshConversationMessages, syncConversationHistory, loadData, chat, composer]);

  const onOpenDirectConversation = useCallback((contact: Contact) => {
    const conversationId = directConversationId(contact.userId);
    const displayName = getContactDisplayName(contact);
    const convs = chat.conversations;
    if (!convs.find((e) => e.id === conversationId)) {
      chat.setConversations([{
        id: conversationId, threadId: contact.userId, type: 'direct', title: displayName,
        avatar: contact.avatar, lastMessageText: 'Nhấn để mở chat', lastMessageKind: 'text',
        lastMessageTimestamp: new Date(0).toISOString(), lastDirection: 'incoming', messageCount: 0,
      }, ...convs]);
    }
    void onSelectConversation(conversationId);
  }, [chat.conversations, onSelectConversation]);

  const onOpenGroupConversation = useCallback((group: Group) => {
    const conversationId = groupConversationId(group.groupId);
    const convs = chat.conversations;
    if (!convs.find((e) => e.id === conversationId)) {
      chat.setConversations([{
        id: conversationId, threadId: group.groupId, type: 'group', title: group.displayName,
        avatar: group.avatar, lastMessageText: 'Nhấn để mở nhóm chat', lastMessageKind: 'text',
        lastMessageTimestamp: new Date(0).toISOString(), lastDirection: 'incoming', messageCount: 0,
      }, ...convs]);
    }
    void onSelectConversation(conversationId);
  }, [chat.conversations, onSelectConversation]);

  const onLoadOlder = useCallback(() => {
    const accountId = resolveWorkspaceId();
    if (!accountId) return;
    void loadOlderMessages(
      accountId, chat.activeConversationId, chat.messages, chat.hasMoreHistory, chat.loadingOlder,
      chat.setLoadingOlder, chat.setHasMoreHistory, composer.setLoadError,
      (aid, cid, incoming) => {
        const { next } = messageCache.prependMessages(aid, cid, incoming);
        if (activeConversationIdRef.current === cid) chat.setMessages(next);
        return { next };
      },
      (aid, cid, bmid) => syncConversationHistory(aid, cid, bmid,
        (a, c) => refreshConversationMessages(a, c, messageCache.mergeMessagesIntoConversation, chat.setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef),
        chat.setSyncingHistory, composer.setStatusMsg, chat.setHasMoreHistory, chat.setConversations, selectionTokenRef, activeConversationIdRef),
      { current: null } as any,
    );
  }, [resolveWorkspaceId, loadOlderMessages, chat.activeConversationId, chat.messages, chat.hasMoreHistory, chat.loadingOlder, messageCache, syncConversationHistory, refreshConversationMessages, chat, composer]);

  const onMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop <= 32) onLoadOlder();
  }, [onLoadOlder]);

  const onSyncHistoryClick = useCallback(() => {
    const accountId = resolveWorkspaceId();
    const conversationId = chat.activeConversationId;
    if (!accountId || !conversationId) return;
    void syncConversationHistory(
      accountId, conversationId, undefined,
      (a, c) => refreshConversationMessages(a, c, messageCache.mergeMessagesIntoConversation, chat.setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef),
      chat.setSyncingHistory, composer.setStatusMsg, chat.setHasMoreHistory, chat.setConversations, selectionTokenRef, activeConversationIdRef,
    );
  }, [resolveWorkspaceId, chat.activeConversationId, syncConversationHistory, refreshConversationMessages, messageCache, chat, composer]);

  const onSend = useCallback((e: React.FormEvent) => {
    const accountId = resolveWorkspaceId();
    void handleSend(
      e, chat.activeConversationId, composer.text, composer.attachFile, accountId,
      composer.setText, composer.setAttachFile, composer.setSending, composer.setStatusMsg, composer.setLoadError, chat.setConversations,
      messageCache.mergeMessagesIntoConversation, fileInputRef,
    );
  }, [resolveWorkspaceId, handleSend, chat.activeConversationId, composer.text, composer.attachFile, messageCache, chat, composer]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    handleKeyDown(e, onSend);
  }, [handleKeyDown, onSend]);

  const onRefresh = useCallback(() => {
    const id = resolveWorkspaceId();
    if (id) loadData(id, status, { refresh: true }, chat.setContacts, chat.setGroups, chat.setConversations, composer.setLoadError);
  }, [resolveWorkspaceId, status, loadData, chat, composer]);

  const onSyncAll = useCallback(() => {
    const accountId = resolveWorkspaceId();
    if (!accountId || syncingAll) return;
    setSyncingAll(true);
    composer.setStatusMsg('Đang đồng bộ Mobile (req_18 + history)...');
    api.accountMobileSync(accountId).then((result) => {
      const totalHistoryMsgs = (result.results ?? []).reduce((s: number, x: any) => s + (x.historyResult?.remoteCount || 0), 0);
      composer.setStatusMsg(`Mobile sync xong: ${result.requ18Received} tin req_18 + ${result.historySynced} cuộc trò chuyện (${totalHistoryMsgs} tin history). Đang làm mới...`);
      return loadData(accountId, status, { refresh: true }, chat.setContacts, chat.setGroups, chat.setConversations, composer.setLoadError);
    }).catch((err) => {
      composer.setLoadError(err instanceof Error ? err.message : 'Đồng bộ thất bại');
    }).finally(() => {
      setSyncingAll(false);
    });
  }, [resolveWorkspaceId, syncingAll, composer, chat, loadData, status]);

  const activeConversation = useMemo(() => chat.conversations.find((e) => e.id === chat.activeConversationId), [chat.conversations, chat.activeConversationId]);
  const activeName = activeConversation?.title ?? chat.activeConversationId;
  const isGroupConversation = activeConversation?.type === 'group';
  const currentAccountId = status?.account?.userId ?? '';

  const sidebarAccounts = useMemo(() => {
    if (currentAccountId && !workspace.knownAccounts.some((e) => e.accountId === currentAccountId)) {
      return [...workspace.knownAccounts, { accountId: currentAccountId, displayName: status?.account?.displayName ?? currentAccountId, phoneNumber: status?.account?.phoneNumber, isActive: true } satisfies AccountSummary];
    }
    return workspace.knownAccounts;
  }, [currentAccountId, workspace.knownAccounts, status?.account?.displayName, status?.account?.phoneNumber]);

  const filteredConversations = useMemo(() => {
    const q = workspace.query.trim().toLowerCase();
    if (!q) return chat.conversations;
    return chat.conversations.filter((e) => e.title.toLowerCase().includes(q));
  }, [chat.conversations, workspace.query]);

  const filteredContacts = useMemo(() => {
    const q = workspace.query.trim().toLowerCase();
    if (!q) return chat.contacts;
    return chat.contacts.filter((e) => getContactDisplayName(e).toLowerCase().includes(q));
  }, [chat.contacts, workspace.query]);

  const filteredGroups = useMemo(() => {
    const q = workspace.query.trim().toLowerCase();
    if (!q) return chat.groups;
    return chat.groups.filter((e) => e.displayName.toLowerCase().includes(q));
  }, [chat.groups, workspace.query]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex w-full h-screen overflow-hidden">
        {login.loginPolling && (
          <QrOverlay qrCode={login.qrCode} statusMsg={composer.statusMsg} onCancel={login.cancelLogin} />
        )}
        <MiniSidebar
          accounts={sidebarAccounts}
          selectedAccountId={workspace.selectedAccountId}
          currentAccountId={currentAccountId}
          onAddAccount={onStartLogin}
          onSelectAccount={onSelectAccount}
          onReLogin={onReLogin}
        />
        <Sidebar
          sidebarTab={workspace.sidebarTab}
          onTabChange={workspace.setSidebarTab}
          query={workspace.query}
          onQueryChange={workspace.setQuery}
          conversations={filteredConversations}
          contacts={filteredContacts}
          groups={filteredGroups}
          activeConversationId={chat.activeConversationId}
          workspaceAccountId={resolveWorkspaceId()}
          accounts={sidebarAccounts}
          statusDisplayName={status?.account?.displayName ?? 'Đã đăng nhập'}
          listenerConnected={status?.listener?.connected ?? false}
          onRefresh={onRefresh}
          onLogout={onLogout}
          onSelectConversation={onSelectConversation}
          onOpenDirectConversation={onOpenDirectConversation}
          onOpenGroupConversation={onOpenGroupConversation}
          onSyncAll={onSyncAll}
          syncingAll={syncingAll}
          userDisplayName={user?.displayName}
        />
        <ChatPanel
          activeConversationId={chat.activeConversationId}
          activeConversation={activeConversation}
          activeName={activeName}
          isGroupConversation={isGroupConversation}
          messages={chat.messages}
          hasMoreHistory={chat.hasMoreHistory}
          loadingOlder={chat.loadingOlder}
          syncingHistory={chat.syncingHistory}
          statusMsg={composer.statusMsg}
          loadError={composer.loadError}
          text={composer.text}
          attachFile={composer.attachFile}
          sending={composer.sending}
          onScroll={onMessagesScroll}
          onTextChange={composer.setText}
          onKeyDown={onKeyDown}
          onSend={onSend}
          onAttachFile={composer.setAttachFile}
          onClearFile={() => { composer.setAttachFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
          onSyncHistory={onSyncHistoryClick}
          typingUsers={[]}
        />
      </div>
    </TooltipProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<AuthGuard><DashboardPage /></AuthGuard>} />
      <Route path="/admin" element={<AuthGuard><AdminPage /></AuthGuard>} />
    </Routes>
  );
}
