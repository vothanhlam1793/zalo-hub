import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';import { TooltipProvider } from '@/components/ui/tooltip';
import { api, type AccountStatusSummary } from './api';
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
import { MiniSidebar } from './components/MiniSidebar';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { ConversationDetailsPanel } from './components/ConversationDetailsPanel';
import { useMessageCache } from './hooks/useMessageCache';
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
  const navigate = useNavigate();
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeConversationIdRef = useRef('');
  const selectionTokenRef = useRef(0);
  const loadedAccountRef = useRef('');
  const initialBootstrapDoneRef = useRef(false);

  const workspace = useWorkspaceStore();
  const chat = useChatStore();
  const composer = useComposerStore();
  const { user } = useAuthStore();
  const [myAccountsMap, setMyAccountsMap] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    activeConversationIdRef.current = chat.activeConversationId;
  }, [chat.activeConversationId]);

  const messageCache = useMessageCache();
  const { loadData, handleSelectAccount } = useAccountManager();
  const { selectConversation, loadOlderMessages, refreshConversationMessages, syncConversationHistory } = useConversationManager();
  const { handleSend, handleKeyDown } = useComposer();

  const resolveWorkspaceId = useCallback(() => {
    return workspace.selectedAccountId || status?.account?.userId || '';
  }, [workspace.selectedAccountId, status]);

  const mapAccountStatusToSummary = useCallback((account: AccountStatusSummary): AccountSummary => ({
    accountId: account.accountId,
    hubAlias: account.hubAlias,
    displayName: account.account?.displayName ?? account.displayName,
    phoneNumber: account.account?.phoneNumber ?? account.phoneNumber,
    avatar: account.account?.avatar ?? account.avatar,
    isActive: account.isActive,
    hasCredential: account.hasCredential,
    runtimeLoaded: account.runtimeLoaded,
    sessionActive: account.sessionActive,
  }), []);

  const resolveConversationSummaries = useCallback((conversations: ConversationSummary[]) => {
    return conversations.map((conversation) => {
      if (conversation.type === 'group') {
        const group = chat.groups.find((entry) => groupConversationId(entry.groupId) === conversation.id);
        return {
          ...conversation,
          title: group?.displayName ?? conversation.title,
          avatar: group?.avatar ?? conversation.avatar,
        } satisfies ConversationSummary;
      }

      const contact = chat.contacts.find((entry) => directConversationId(entry.userId) === conversation.id);
      return {
        ...conversation,
        title: contact ? getContactDisplayName(contact) : conversation.title,
        avatar: contact?.avatar ?? conversation.avatar,
      } satisfies ConversationSummary;
    });
  }, [chat.contacts, chat.groups]);

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
      if (!accountId) return;
      chat.replaceAccountConversations(accountId, nextConversations);
    },
    onMessage: ({ accountId, message }: WsConversationMessagePayload) => {
      if (accountId !== resolveWorkspaceId()) return;
      chat.updateConversationFromWs(accountId, message);
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
        loadData(accountId, status, { refresh: true }, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError);
      } else if (syncStatus === 'error') {
        composer.setLoadError('Tự động đồng bộ thất bại');
      }
    },
  });

  useEffect(() => {
    if (initialBootstrapDoneRef.current) return;
    initialBootstrapDoneRef.current = true;

    api.status().then(setStatus).catch(() => {});
    api.accounts().then((result) => {
      workspace.setKnownAccounts(result.accounts.map(mapAccountStatusToSummary));
      if (result.activeAccountId) workspace.setSelectedAccountId(result.activeAccountId);
    }).catch(() => {});
    api.myAccounts().then((res) => {
      const map = new Map<string, boolean>();
      res.accounts.forEach((a) => map.set(a.accountId, a.visible));
      setMyAccountsMap(map);
    }).catch(() => {});
  }, [mapAccountStatusToSummary, workspace]);

  useEffect(() => {
    const userId = status?.account?.userId?.trim();
    const displayName = status?.account?.displayName?.trim();
    if (!userId) return;
    workspace.addOrUpdateAccount({
      accountId: userId,
      displayName: displayName || userId,
      phoneNumber: status?.account?.phoneNumber,
      avatar: status?.account?.avatar,
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
    chat.clearActivePane();
    void loadData(accountId, status, {}, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError);
  }, [workspace.selectedAccountId, status?.sessionActive]);

  const onSelectAccount = useCallback((accountId: string) => {
    loadedAccountRef.current = '';
    const innerLoad = (aid: string, s?: SessionStatus | null, opts?: { refresh?: boolean }) =>
      loadData(aid, s, opts, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError);
    void handleSelectAccount(
      accountId, workspace.setSelectedAccountId, setStatus, composer.setStatusMsg, composer.setLoadError,
      chat.setActiveConversationId, chat.setMessages, chat.clearActivePane,
      clearComposer, messageCache.clearCache, unsubscribe, workspace.setKnownAccounts,
      innerLoad, activeConversationIdRef, selectionTokenRef,
    );
  }, [handleSelectAccount, loadData, clearComposer, messageCache, unsubscribe, chat, workspace, composer]);

  const onSelectConversation = useCallback((conversationId: string) => {
    const accountId = resolveWorkspaceId();
    if (!accountId) { composer.setLoadError('Chưa có tài khoản workspace được chọn'); return; }
    const readAt = new Date().toISOString();
    chat.markConversationReadLocal(accountId, conversationId, readAt);
    void api.accountUpdateReadState(accountId, conversationId, readAt)
      .then((result) => {
        if (result?.ok) {
          chat.clearPendingReadAt(accountId, conversationId, result.readAt);
        }
      })
      .catch((error) => {
        composer.setLoadError(error instanceof Error ? error.message : 'Lưu trạng thái đã đọc thất bại');
      });
    void selectConversation(
      conversationId, accountId, subscribe, messageCache.getCachedMessages,
      messageCache.mergeMessagesIntoConversation, chat.setMessages, chat.setActiveConversationId,
      chat.setHasMoreHistory, composer.setLoadError, composer.setStatusMsg,
      (aid, s, opts) => loadData(aid, s, opts, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError),
      (aid, cid) => refreshConversationMessages(aid, cid, messageCache.mergeMessagesIntoConversation, chat.setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef),
      (aid, cid, bmid, readAt) => syncConversationHistory(aid, cid, bmid, readAt, (a, c) => refreshConversationMessages(a, c, messageCache.mergeMessagesIntoConversation, chat.setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef), chat.setSyncingHistory, composer.setStatusMsg, chat.setHasMoreHistory, chat.replaceAccountConversations, selectionTokenRef, activeConversationIdRef),
      selectionTokenRef, activeConversationIdRef,
    );
  }, [resolveWorkspaceId, selectConversation, subscribe, messageCache, refreshConversationMessages, syncConversationHistory, loadData, chat, composer]);

  const onOpenDirectConversation = useCallback((contact: Contact) => {
    const accountId = resolveWorkspaceId();
    const conversationId = directConversationId(contact.userId);
    const displayName = getContactDisplayName(contact);
    const convs = chat.getAccountConversations(accountId);
    if (!convs.find((e) => e.id === conversationId)) {
      chat.replaceAccountConversations(accountId, [{
        id: conversationId, accountId, threadId: contact.userId, type: 'direct', title: displayName,
        avatar: contact.avatar, lastMessageText: 'Nhấn để mở chat', lastMessageKind: 'text',
        lastMessageTimestamp: new Date(0).toISOString(), lastDirection: 'incoming', messageCount: 0, unreadCount: 0,
      }, ...convs]);
    }
    void onSelectConversation(conversationId);
  }, [chat, resolveWorkspaceId, onSelectConversation]);

  const onOpenGroupConversation = useCallback((group: Group) => {
    const accountId = resolveWorkspaceId();
    const conversationId = groupConversationId(group.groupId);
    const convs = chat.getAccountConversations(accountId);
    if (!convs.find((e) => e.id === conversationId)) {
      chat.replaceAccountConversations(accountId, [{
        id: conversationId, accountId, threadId: group.groupId, type: 'group', title: group.displayName,
        avatar: group.avatar, lastMessageText: 'Nhấn để mở nhóm chat', lastMessageKind: 'text',
        lastMessageTimestamp: new Date(0).toISOString(), lastDirection: 'incoming', messageCount: 0, unreadCount: 0,
      }, ...convs]);
    }
    void onSelectConversation(conversationId);
  }, [chat, resolveWorkspaceId, onSelectConversation]);

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
      (aid, cid, bmid, readAt) => syncConversationHistory(aid, cid, bmid, readAt,
        (a, c) => refreshConversationMessages(a, c, messageCache.mergeMessagesIntoConversation, chat.setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef),
        chat.setSyncingHistory, composer.setStatusMsg, chat.setHasMoreHistory, chat.replaceAccountConversations, selectionTokenRef, activeConversationIdRef),
      { current: null } as never,
    );
  }, [resolveWorkspaceId, loadOlderMessages, chat.activeConversationId, chat.messages, chat.hasMoreHistory, chat.loadingOlder, messageCache, syncConversationHistory, refreshConversationMessages, chat, composer]);

  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 32) return;
    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = setTimeout(() => { onLoadOlder(); }, 150);
  }, [onLoadOlder]);

  const onSyncHistoryClick = useCallback(() => {
    const accountId = resolveWorkspaceId();
    const conversationId = chat.activeConversationId;
    if (!accountId || !conversationId) return;
    void syncConversationHistory(
      accountId, conversationId, undefined, new Date().toISOString(),
      (a, c) => refreshConversationMessages(a, c, messageCache.mergeMessagesIntoConversation, chat.setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef),
      chat.setSyncingHistory, composer.setStatusMsg, chat.setHasMoreHistory, chat.replaceAccountConversations, selectionTokenRef, activeConversationIdRef,
    );
  }, [resolveWorkspaceId, chat.activeConversationId, syncConversationHistory, refreshConversationMessages, messageCache, chat, composer]);

  const onSend = useCallback((e: React.FormEvent) => {
    const accountId = resolveWorkspaceId();
    void handleSend(
      e, chat.activeConversationId, composer.text, composer.attachFile, accountId,
      composer.setText, composer.setAttachFile, composer.setSending, composer.setStatusMsg, composer.setLoadError, chat.replaceAccountConversations, chat.setMessages,
      messageCache.mergeMessagesIntoConversation, fileInputRef,
    );
  }, [resolveWorkspaceId, handleSend, chat.activeConversationId, composer.text, composer.attachFile, messageCache, chat, composer]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    handleKeyDown(e, onSend);
  }, [handleKeyDown, onSend]);

  const onReactMessage = useCallback(async (message: import('./types').Message, reaction: import('./types').MessageReactionOption) => {
    const accountId = resolveWorkspaceId();
    if (!accountId || !message.providerMessageId) {
      if (message.providerMessageId) composer.setStatusMsg('Chưa chọn account để gửi reaction');
      else composer.setStatusMsg('Tin nhắn này chưa có ID để gửi reaction');
      return;
    }

    let cliMsgId = message.cliMsgId?.trim() || '';
    if (!cliMsgId && message.rawMessageJson) {
      try {
        const raw = JSON.parse(message.rawMessageJson) as Record<string, unknown>;
        const data = (raw.data ?? raw) as Record<string, unknown>;
        cliMsgId = String(
          raw.cliMsgId
          ?? data?.cliMsgId
          ?? (raw.message as Record<string, unknown>)?.cliMsgId
          ?? (raw.content as Record<string, unknown>)?.cliMsgId
          ?? ''
        ).trim();
      } catch {
        cliMsgId = '';
      }
    }
    if (!cliMsgId) {
      cliMsgId = message.providerMessageId;
    }

    try {
      await api.accountAddReaction(accountId, message.conversationId, message.providerMessageId, cliMsgId, reaction.icon);
    } catch (err) {
      composer.setLoadError(err instanceof Error ? err.message : 'Gửi reaction thất bại');
    }
  }, [resolveWorkspaceId, composer]);

  const onRefresh = useCallback(() => {
    const id = resolveWorkspaceId();
    if (id) loadData(id, status, { refresh: true }, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError);
  }, [resolveWorkspaceId, status, loadData, chat, composer]);

  const onRenameAccount = useCallback(async (nextDisplayName: string) => {
    const accountId = resolveWorkspaceId();
    if (!accountId) {
      throw new Error('Chưa có account được chọn');
    }

    const result = await api.updateAccountProfile(accountId, { hubAlias: nextDisplayName });
    const updatedAccount = result.account;
    if (updatedAccount) {
      workspace.addOrUpdateAccount(updatedAccount);
    }
    composer.setStatusMsg('Đã cập nhật alias account.');
  }, [resolveWorkspaceId, workspace, composer]);

  const onSyncAll = useCallback(() => {
    const accountId = resolveWorkspaceId();
    if (!accountId || syncingAll) return;
    setSyncingAll(true);
    composer.setStatusMsg('Đang đồng bộ Mobile (req_18 + history)...');
    api.accountMobileSync(accountId).then((result) => {
      const totalHistoryMsgs = (result.results ?? []).reduce((s: number, x: any) => s + (x.historyResult?.remoteCount || 0), 0);
      composer.setStatusMsg(`Mobile sync xong: ${result.requ18Received} tin req_18 + ${result.historySynced} cuộc trò chuyện (${totalHistoryMsgs} tin history). Đang làm mới...`);
      return loadData(accountId, status, { refresh: true }, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError);
    }).catch((err) => {
      composer.setLoadError(err instanceof Error ? err.message : 'Đồng bộ thất bại');
    }).finally(() => {
      setSyncingAll(false);
    });
  }, [resolveWorkspaceId, syncingAll, composer, chat, loadData, status]);

  const visibleConversations = useMemo(() => chat.getAccountConversations(resolveWorkspaceId()), [chat, resolveWorkspaceId, workspace.selectedAccountId, chat.conversationsByAccount]);
  const activeConversation = useMemo(() => visibleConversations.find((e) => e.id === chat.activeConversationId), [visibleConversations, chat.activeConversationId]);
  const activeName = activeConversation?.title ?? chat.activeConversationId;
  const isGroupConversation = activeConversation?.type === 'group';
  const currentAccountId = status?.account?.userId ?? '';
  const activeContact = useMemo(() => {
    if (!activeConversation || activeConversation.type !== 'direct') return undefined;
    return chat.contacts.find((contact) => directConversationId(contact.userId) === activeConversation.id);
  }, [activeConversation, chat.contacts]);
  const activeGroup = useMemo(() => {
    if (!activeConversation || activeConversation.type !== 'group') return undefined;
    return chat.groups.find((group) => groupConversationId(group.groupId) === activeConversation.id);
  }, [activeConversation, chat.groups]);
  const activeAvatar = activeContact?.avatar ?? activeGroup?.avatar ?? activeConversation?.avatar;
  const activeSubtitle = activeContact?.status?.trim()
    || activeContact?.phoneNumber?.trim()
    || (activeGroup?.memberCount ? `${activeGroup.memberCount} thành viên` : '')
    || activeConversation?.threadId
    || activeConversation?.id
    || chat.activeConversationId;

  const sidebarAccounts = useMemo(() => {
    let list: AccountSummary[];
    if (currentAccountId && !workspace.knownAccounts.some((e) => e.accountId === currentAccountId)) {
      list = [...workspace.knownAccounts, {
        accountId: currentAccountId,
        displayName: status?.account?.displayName ?? currentAccountId,
        phoneNumber: status?.account?.phoneNumber,
        avatar: status?.account?.avatar,
        isActive: true,
      } satisfies AccountSummary];
    } else {
      list = workspace.knownAccounts;
    }
    return list.map(a => ({
      ...a,
      visible: myAccountsMap.has(a.accountId) ? myAccountsMap.get(a.accountId) : true,
    }));
  }, [currentAccountId, workspace.knownAccounts, status?.account?.avatar, status?.account?.displayName, status?.account?.phoneNumber, myAccountsMap]);
  const workspaceAccount = useMemo(() => {
    const workspaceId = resolveWorkspaceId();
    return sidebarAccounts.find((account) => account.accountId === workspaceId);
  }, [resolveWorkspaceId, sidebarAccounts]);

  useEffect(() => {
    const visibleAccountIds = sidebarAccounts
      .filter((account) => account.visible !== false && account.sessionActive === true)
      .map((account) => account.accountId)
      .filter(Boolean);
    if (visibleAccountIds.length === 0) return;
    void Promise.all(visibleAccountIds.map(async (accountId) => {
      try {
        const result = await api.accountConversations(accountId);
        chat.setSidebarConversationsForAccount(accountId, result.conversations);
      } catch {
        // Ignore per-account sidebar unread preload failures.
      }
    }));
  }, [sidebarAccounts, chat.setSidebarConversationsForAccount]);

  const filteredConversations = useMemo(() => {
    const q = workspace.query.trim().toLowerCase();
    const conversations = resolveConversationSummaries(visibleConversations);
    if (!q) return conversations;
    return conversations.filter((e) => e.title.toLowerCase().includes(q));
  }, [visibleConversations, workspace.query, resolveConversationSummaries]);

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
        <MiniSidebar
          accounts={sidebarAccounts}
          selectedAccountId={workspace.selectedAccountId}
          currentAccountId={currentAccountId}
          conversations={Object.values(chat.conversationsByAccount).flat()}
          onSelectAccount={onSelectAccount}
          onOpenAdmin={() => navigate('/admin')}
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
          accountHubAlias={workspaceAccount?.hubAlias}
          accountDisplayName={workspaceAccount?.displayName ?? status?.account?.displayName}
          accountAvatar={workspaceAccount?.avatar ?? status?.account?.avatar}
          accountPhoneNumber={workspaceAccount?.phoneNumber ?? status?.account?.phoneNumber}
          onRenameAccount={onRenameAccount}
          onSelectConversation={onSelectConversation}
          onOpenDirectConversation={onOpenDirectConversation}
          onOpenGroupConversation={onOpenGroupConversation}
        />
        <div className="flex-1 min-w-0 flex relative">
          <ChatPanel
            activeConversationId={chat.activeConversationId}
            activeConversation={activeConversation}
            activeName={activeName}
            activeAvatar={activeAvatar}
            activeSubtitle={activeSubtitle}
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
            typingUsers={[]}
            detailsOpen={detailsOpen}
            onScroll={onMessagesScroll}
            onTextChange={composer.setText}
            onKeyDown={onKeyDown}
            onSend={onSend}
            onAttachFile={composer.setAttachFile}
            onClearFile={() => { composer.setAttachFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
            onToggleDetails={() => setDetailsOpen((open) => !open)}
            onReactMessage={onReactMessage}
            showDisconnectBanner={status ? !status.sessionActive && !status.loginInProgress && !!workspace.selectedAccountId : false}
          />
          <ConversationDetailsPanel
            open={detailsOpen}
            conversation={activeConversation}
            contact={activeContact}
            group={activeGroup}
            workspaceAccount={workspaceAccount}
            onClose={() => setDetailsOpen(false)}
          />
        </div>
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
