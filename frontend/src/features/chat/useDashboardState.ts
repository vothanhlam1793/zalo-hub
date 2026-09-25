import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bff, type AccountStatusSummary } from '@/bff-api';
import { api } from '@/api';
import { useWebSocket } from '@/useWebSocket';
import { directConversationId, formatConversationSubtitle, formatConversationTitle, getContactDisplayName, groupConversationId } from '@/utils';
import { useAuthStore } from '@/stores/auth-store';
import { notificationService } from '@/features/notifications/notification-service';
import type {
  AccountSummary,
  Contact,
  ConversationSummary,
  Group,
  SessionStatus,
  WsConversationMessagePayload,
  WsConversationSummariesPayload,
  WsSessionStatusPayload,
} from '@/types';
import { useMessageCache } from '@/hooks/useMessageCache';
import { useAccountManager } from '@/hooks/useAccountManager';
import { useConversationManager } from '@/hooks/useConversationManager';
import { useComposer } from '@/hooks/useComposer';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useChatStore } from '@/stores/chat-store';
import { useComposerStore } from '@/stores/composer-store';
import { useShallow } from 'zustand/react/shallow';
import { chatSession, conversationKey } from './model/chat-session';
import { recheckUnresolved, retryMessage, querySendStatus, cancelQueued, restoreDraft } from './model/send-controller';
import { clientDb } from '@/lib/client-db';
import { recoverMessage } from './model/message-reconciliation';
import { createPaneResumeController } from './model/pane-resume';

export type DashboardState = ReturnType<typeof useDashboardState>;

export function useDashboardState() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeConversationIdRef = useRef('');
  const selectionTokenRef = useRef(0);
  const loadedAccountRef = useRef('');
  const initialBootstrapDoneRef = useRef(false);

  const workspace = useWorkspaceStore();
  const chat = useChatStore(useShallow(({ byConversation, ...view }) => view));
  // Keystrokes belong to the composer, not the entire sidebar/dashboard tree.
  const composer = useComposerStore(useShallow((s) => ({
    statusMsg: s.statusMsg, loadError: s.loadError, sending: s.sending,
    setStatusMsg: s.setStatusMsg, setLoadError: s.setLoadError, setText: s.setText,
    setAttachFile: s.setAttachFile, setSending: s.setSending,
    clearComposer: s.clearComposer, clearErrors: s.clearErrors,
  })));
  const messageLoad = useChatStore((s) => s.byConversation[s.activeKey]);
  const user = useAuthStore((s) => s.user);
  const [myAccountsMap, setMyAccountsMap] = useState<Map<string, boolean>>(new Map());
  const [accountRoles, setAccountRoles] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<import('@/types').TagItem[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [reconnectModal, setReconnectModal] = useState<{
    open: boolean;
    status: 'loading' | 'success' | 'error';
    errorMsg?: string;
    accountId?: string;
  }>({ open: false, status: 'loading' });
  const [qrLoginAccountId, setQrLoginAccountId] = useState<string | null>(null);
  const [qrLoginOpen, setQrLoginOpen] = useState(false);

  useEffect(() => {
    activeConversationIdRef.current = chat.activeConversationId;
  }, [chat.activeConversationId]);

  const messageCache = useMessageCache();
  const { loadData, handleSelectAccount } = useAccountManager();
  const { selectConversation, loadOlderMessages, refreshConversationMessages, syncConversationHistory } = useConversationManager();
  const { handleSend, handleKeyDown, handleCompositionStart, handleCompositionEnd, isComposing } = useComposer();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const paneResumeRef = useRef<ReturnType<typeof createPaneResumeController> | null>(null);
  const authenticatedBeforeMount = useRef(false);
  const { subscribe, unsubscribe } = useWebSocket({
    onEvent: (event) => {
      if (event.type === 'authenticated') {
        recheckUnresolved();
        if (paneResumeRef.current) void paneResumeRef.current.authenticated();
        else authenticatedBeforeMount.current = true;
      }
    },
    onStatus: ({ accountId, status: nextStatus }: WsSessionStatusPayload) => {
      if (nextStatus.listener?.connected) recheckUnresolved();
      if (!accountId || accountId === resolveWorkspaceId()) {
        setStatus(nextStatus);
      }
    },
    onConversations: ({ accountId, conversations: nextConversations }: WsConversationSummariesPayload) => {
      if (!accountId) return;
      chat.replaceAccountConversations(accountId, nextConversations);
    },
    onMessage: ({ accountId, message }: WsConversationMessagePayload) => {
      chat.updateConversationFromWs(accountId, message);
      messageCache.mergeMessagesIntoConversation(accountId, message.conversationId, [message], 'append');

      // Realtime Notification & Audio Chime
      if (message.direction === 'incoming') {
        const convs = chat.getAccountConversations(accountId);
        const targetConv = convs.find((c) => c.id === message.conversationId);
        const isMuted = targetConv?.isMuted === true;
        const isGroup = message.conversationType === 'group' || targetConv?.type === 'group';
        const settings = notificationService.getSettings();

        // Check if muted or if group notifications are disabled
        if (!isMuted && (!isGroup || settings.notifyGroupMessages)) {
          // Play chime sound
          notificationService.playChime();

          // Show desktop notification and flash tab
          const senderTitle = message.senderName || targetConv?.title || 'Tin nhắn mới';
          const bodyText = message.kind === 'text' ? message.text : `[${message.kind}] ${message.text || ''}`;
          
          notificationService.showDesktopNotification(
            senderTitle,
            bodyText,
            targetConv?.avatar || message.senderAvatar,
            () => {
              onSelectConversation(message.conversationId);
            }
          );
          notificationService.startTabFlashing(`${senderTitle}: ${bodyText}`);
        }
      }
    },
    onSyncStatus: ({ accountId, status: syncStatus, requ18Received, historySynced, historyMsgs }) => {
      if (accountId !== resolveWorkspaceId()) return;
      if (syncStatus === 'loading') composer.setStatusMsg('Dang tu dong dong bo contacts & groups...');
      else if (syncStatus === 'syncing') composer.setStatusMsg('Dang tu dong dong bo lich su chat...');
      else if (syncStatus === 'done') {
        composer.setStatusMsg(`Tu dong dong bo xong: ${requ18Received ?? 0} tin req_18 + ${historySynced ?? 0} cuoc tro chuyen (${historyMsgs ?? 0} tin)`);
        loadData(accountId, status, { refresh: true }, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError);
      } else if (syncStatus === 'error') {
        composer.setLoadError('Tu dong dong bo that bai');
      }
    },
  });
  useEffect(() => {
    const controller = createPaneResumeController({ subscribe, unsubscribe });
    paneResumeRef.current = controller;
    if (authenticatedBeforeMount.current) {
      authenticatedBeforeMount.current = false;
      void controller.authenticated();
    }
    return () => {
      controller.dispose();
      if (paneResumeRef.current === controller) paneResumeRef.current = null;
    };
  }, [subscribe, unsubscribe, user?.id]);

  useEffect(() => {
    if (initialBootstrapDoneRef.current) return;
    initialBootstrapDoneRef.current = true;
    const session = chatSession.capture();
    const selectedAtStart = useWorkspaceStore.getState().selectedAccountId;
    bff.workspaceInit().then((result) => {
      if (!chatSession.valid(session)) return;
      const selectionUnchanged = selectedAtStart === useWorkspaceStore.getState().selectedAccountId;
      if (result.status && selectionUnchanged && (!selectedAtStart || result.status.account?.userId === selectedAtStart)) setStatus(result.status);
      if (result.accounts) {
        workspace.setKnownAccounts(result.accounts.accounts.map(mapAccountStatusToSummary));
        if (result.accounts.activeAccountId && selectionUnchanged && !selectedAtStart) workspace.setSelectedAccountId(result.accounts.activeAccountId);
      }
      if (result.myAccounts) {
        const map = new Map<string, boolean>();
        result.myAccounts.accounts.forEach((a) => map.set(a.accountId, a.visible));
        setMyAccountsMap(map);
        setAccountRoles(Object.fromEntries(result.myAccounts.accounts.map((a) => [a.accountId, a.role])));
      }
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
    if (!accountId || accountId === loadedAccountRef.current) return;
    loadedAccountRef.current = accountId;
    void loadData(accountId, status, {}, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError);
  }, [workspace.selectedAccountId, status?.sessionActive]);

  const onSelectAccount = useCallback((accountId: string) => {
    loadedAccountRef.current = '';
    const innerLoad = (aid: string, s?: SessionStatus | null, opts?: { refresh?: boolean }) =>
      loadData(aid, s, opts, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError);
    void handleSelectAccount(
      accountId, workspace.setSelectedAccountId, setStatus, composer.setStatusMsg, composer.setLoadError,
      chat.setActiveConversationId, chat.setMessages, chat.clearActivePane,
      clearComposer, messageCache.clearCache, () => {}, workspace.setKnownAccounts,
      innerLoad, activeConversationIdRef, selectionTokenRef,
    );
  }, [handleSelectAccount, loadData, clearComposer, messageCache, unsubscribe, chat, workspace, composer]);

  const onSelectConversation = useCallback((conversationId: string) => {
    const accountId = resolveWorkspaceId();
    if (!accountId) { composer.setLoadError('Chua co tai khoan workspace duoc chon'); return; }
    const readAt = new Date().toISOString();
    const session = chatSession.capture();
    const key = conversationKey(session.userId, accountId, conversationId);
    chat.markConversationReadLocal(accountId, conversationId, readAt);
    void bff.updateReadState(accountId, conversationId, readAt)
      .then((result) => {
        if (chatSession.valid(session) && result?.ok) {
          chat.clearPendingReadAt(accountId, conversationId, result.readAt);
        }
      })
      .catch((error) => {
        if (chatSession.valid(session) && useChatStore.getState().activeKey === key) composer.setLoadError(error instanceof Error ? error.message : 'Luu trang thai da doc that bai');
      });
    void selectConversation(
      conversationId, accountId, () => {}, messageCache.getCachedMessages,
      messageCache.mergeMessagesIntoConversation, chat.setMessages, chat.setActiveConversationId,
      chat.setHasMoreHistory, composer.setLoadError, composer.setStatusMsg,
      (aid, s, opts) => loadData(aid, s, opts, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError),
      (aid, cid) => refreshConversationMessages(aid, cid, messageCache.mergeMessagesIntoConversation, chat.setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef),
      (aid, cid, bmid, readAt) => syncConversationHistory(aid, cid, bmid, readAt, (a, c) => refreshConversationMessages(a, c, messageCache.mergeMessagesIntoConversation, chat.setHasMoreHistory, selectionTokenRef, activeConversationIdRef, messagesEndRef), chat.setSyncingHistory, composer.setStatusMsg, chat.setHasMoreHistory, chat.replaceAccountConversations, selectionTokenRef, activeConversationIdRef),
      selectionTokenRef, activeConversationIdRef, messageCache.loadFromDb,
    );
  }, [resolveWorkspaceId, selectConversation, subscribe, messageCache, refreshConversationMessages, syncConversationHistory, loadData, chat, composer]);

  // Restore saved active conversation on page refresh / initial load
  const restoredConversationRef = useRef(false);
  useEffect(() => {
    if (restoredConversationRef.current) return;
    const accountId = resolveWorkspaceId();
    if (!accountId || !user?.id) return;

    if (typeof localStorage !== 'undefined') {
      let savedConvId: string | null = null;
      try { savedConvId = localStorage.getItem(`zalohub_active_conversation:${JSON.stringify([user.id, accountId])}`); } catch { /* optional */ }
      if (savedConvId && !chat.activeConversationId) {
        restoredConversationRef.current = true;
        onSelectConversation(savedConvId);
      }
    }
  }, [status?.sessionActive, workspace.selectedAccountId, chat.activeConversationId, onSelectConversation, resolveWorkspaceId]);

  const onOpenDirectConversation = useCallback((contact: Contact) => {
    const accountId = resolveWorkspaceId();
    const conversationId = directConversationId(contact.userId);
    const displayName = getContactDisplayName(contact);
    const convs = chat.getAccountConversations(accountId);
    if (!convs.find((e) => e.id === conversationId)) {
      chat.replaceAccountConversations(accountId, [{
        id: conversationId, accountId, threadId: contact.userId, type: 'direct', title: displayName,
        avatar: contact.avatar, lastMessageText: 'Nhan de mo chat', lastMessageKind: 'text',
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
        avatar: group.avatar, lastMessageText: 'Nhan de mo nhom chat', lastMessageKind: 'text',
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

  const selectedAccount = workspace.knownAccounts.find((a) => a.accountId === resolveWorkspaceId());
  const canSend = Boolean(
    (status?.account?.userId === resolveWorkspaceId() ? status.sessionActive : selectedAccount?.sessionActive)
    && (user?.role === 'super_admin' || user?.role === 'super-admin' || ['editor', 'admin', 'master'].includes(accountRoles[resolveWorkspaceId()])),
  );
  const onSend = useCallback((e: React.FormEvent) => {
    if (!canSend) { e.preventDefault(); return; }
    handleSend(e);
  }, [handleSend, canSend]);
  const onRetryMessage = useCallback((message: import('@/types').Message, file?: File) => {
    if (!canSend) { composer.setStatusMsg('Tài khoản cần kết nối và quyền gửi tin nhắn.'); return; }
    retryMessage(useChatStore.getState().activeKey, message, file);
  }, [canSend, composer.setStatusMsg]);
  const onQueryMessage = useCallback((message: import('@/types').Message) => {
    if (message.clientRequestId) void querySendStatus(useChatStore.getState().activeKey, message.clientRequestId);
  }, []);
  const onCancelMessage = useCallback((message: import('@/types').Message) => cancelQueued(useChatStore.getState().activeKey, message), []);
  const onRestoreDraft = useCallback((message: import('@/types').Message) => restoreDraft(useChatStore.getState().activeKey, message), []);
  useEffect(() => {
    const refresh = () => recheckUnresolved();
    const session = chatSession.capture();
    void clientDb.getPendingConversations().then((entries) => {
      if (!chatSession.valid(session)) return;
      entries.forEach(({ key, messages }) => useChatStore.getState().mergeForKey(key, messages.map(recoverMessage), true));
      refresh();
    });
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); };
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    handleKeyDown(e, onSend);
  }, [handleKeyDown, onSend]);

  const onReactMessage = useCallback(async (message: import('@/types').Message, reaction: import('@/types').MessageReactionOption) => {
    const accountId = resolveWorkspaceId();
    const session = chatSession.capture();
    const key = useChatStore.getState().activeKey;
    if (!accountId || !message.providerMessageId) {
      if (message.providerMessageId) composer.setStatusMsg('Chua chon account de gui reaction');
      else composer.setStatusMsg('Tin nhan nay chua co ID de gui reaction');
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
      await bff.sendReaction(accountId, message.conversationId, message.providerMessageId, cliMsgId, reaction.icon);
    } catch (err) {
      if (chatSession.valid(session) && useChatStore.getState().activeKey === key) composer.setLoadError(err instanceof Error ? err.message : 'Gui reaction that bai');
    }
  }, [resolveWorkspaceId, composer]);

  const onRefresh = useCallback(() => {
    void paneResumeRef.current?.refresh();
    const id = resolveWorkspaceId();
    const session = chatSession.capture();
    if (id) {
      loadData(id, status, { refresh: true }, chat.setContacts, chat.setGroups, chat.replaceAccountConversations, composer.setLoadError);
      bff.tagsList(id).then((r) => { if (chatSession.valid(session) && useWorkspaceStore.getState().selectedAccountId === id) setTags(r.tags); }).catch(() => {});
    }
  }, [resolveWorkspaceId, status, loadData, chat, composer]);

  useEffect(() => {
    const id = resolveWorkspaceId();
    const session = chatSession.capture();
    let cancelled = false;
    setTags([]);
    if (id) {
      bff.tagsList(id).then((r) => { if (!cancelled && chatSession.valid(session)) setTags(r.tags); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [resolveWorkspaceId]);

  const onSyncTags = useCallback(async () => {
    const id = resolveWorkspaceId();
    if (!id) return;
    const session = chatSession.capture();
    const active = () => chatSession.valid(session) && useWorkspaceStore.getState().selectedAccountId === id;
    try {
      composer.setStatusMsg('Đang đồng bộ nhãn từ Zalo...');
      const res = await bff.tagsSync(id);
      if (!chatSession.valid(session)) return;
      if (active()) setTags(res.tags);
      const convs = await bff.chatGetConversations(id);
      if (!chatSession.valid(session)) return;
      chat.replaceAccountConversations(id, convs.conversations);
      if (active()) composer.setStatusMsg(`Đã đồng bộ ${res.count} nhãn từ Zalo.`);
    } catch (err) {
      if (active()) composer.setLoadError(err instanceof Error ? err.message : 'Đồng bộ nhãn thất bại');
    }
  }, [resolveWorkspaceId, chat, composer]);

  const onToggleMute = useCallback(async (action: 'mute' | 'unmute') => {
    const id = resolveWorkspaceId();
    const convId = chat.activeConversationId;
    if (!id || !convId) return;
    const session = chatSession.capture();
    const key = useChatStore.getState().activeKey;
    try {
      const res = await api.setConversationMute(id, convId, action);
      if (!chatSession.valid(session)) return;
      const currentConvs = chat.getAccountConversations(id);
      const updated = currentConvs.map((c) =>
        c.id === convId ? { ...c, isMuted: res.isMuted, muteUntil: res.muteUntil } : c
      );
      chat.replaceAccountConversations(id, updated);
      if (useChatStore.getState().activeKey === key) {
        composer.setStatusMsg(action === 'mute' ? 'Đã tắt thông báo cuộc trò chuyện này.' : 'Đã bật lại thông báo.');
      }
    } catch (err) {
      if (chatSession.valid(session) && useChatStore.getState().activeKey === key) {
        composer.setLoadError(err instanceof Error ? err.message : 'Thay đổi trạng thái thông báo thất bại');
      }
    }
  }, [resolveWorkspaceId, chat, composer]);

  const onAssignTag = useCallback(async (tagId: string) => {
    const id = resolveWorkspaceId();
    const convId = chat.activeConversationId;
    if (!id || !convId) return;
    const session = chatSession.capture();
    const key = useChatStore.getState().activeKey;
    try {
      const res = await bff.tagAssign(convId, tagId, id);
      if (!chatSession.valid(session)) return;
      const currentConvs = chat.getAccountConversations(id);
      const updated = currentConvs.map((c) => c.id === convId ? { ...c, labels: res.tags } : c);
      chat.replaceAccountConversations(id, updated);
      if (useChatStore.getState().activeKey === key) composer.setStatusMsg('Đã gắn nhãn.');
    } catch (err) {
      if (chatSession.valid(session) && useChatStore.getState().activeKey === key) composer.setLoadError(err instanceof Error ? err.message : 'Gắn nhãn thất bại');
    }
  }, [resolveWorkspaceId, chat, composer]);

  const onUnassignTag = useCallback(async (tagId: string) => {
    const id = resolveWorkspaceId();
    const convId = chat.activeConversationId;
    if (!id || !convId) return;
    const session = chatSession.capture();
    const key = useChatStore.getState().activeKey;
    try {
      const res = await bff.tagUnassign(convId, tagId, id);
      if (!chatSession.valid(session)) return;
      const currentConvs = chat.getAccountConversations(id);
      const updated = currentConvs.map((c) => c.id === convId ? { ...c, labels: res.tags } : c);
      chat.replaceAccountConversations(id, updated);
      if (useChatStore.getState().activeKey === key) composer.setStatusMsg('Đã gỡ nhãn.');
    } catch (err) {
      if (chatSession.valid(session) && useChatStore.getState().activeKey === key) composer.setLoadError(err instanceof Error ? err.message : 'Gỡ nhãn thất bại');
    }
  }, [resolveWorkspaceId, chat, composer]);

  const onUpdateNotes = useCallback(async (notes: string | null) => {
    const id = resolveWorkspaceId();
    const convId = chat.activeConversationId;
    if (!id || !convId) return;
    const session = chatSession.capture();
    const key = useChatStore.getState().activeKey;
    try {
      const res = await bff.updateNotes(id, convId, notes);
      if (!chatSession.valid(session)) return;
      const currentConvs = chat.getAccountConversations(id);
      const updated = currentConvs.map((c) =>
        c.id === convId
          ? {
              ...c,
              notes: res.notes || undefined,
              notesUpdatedBy: res.notesUpdatedBy || undefined,
              notesUpdatedAt: res.notesUpdatedAt || undefined,
            }
          : c,
      );
      chat.replaceAccountConversations(id, updated);
      if (useChatStore.getState().activeKey === key) composer.setStatusMsg('Đã lưu ghi chú.');
    } catch (err) {
      if (chatSession.valid(session) && useChatStore.getState().activeKey === key) {
        composer.setLoadError(err instanceof Error ? err.message : 'Lưu ghi chú thất bại');
      }
    }
  }, [resolveWorkspaceId, chat, composer]);

  const onCreateTag = useCallback(async (name: string, color: string) => {
    const id = resolveWorkspaceId();
    if (!id || !name.trim()) return;
    const session = chatSession.capture();
    try {
      const res = await bff.tagCreate({ name: name.trim(), color, accountId: id });
      if (!chatSession.valid(session)) return;
      setTags((prev) => [...prev.filter((t) => t.id !== res.tag.id), res.tag]);
      composer.setStatusMsg(`Đã tạo nhãn "${res.tag.name}".`);
    } catch (err) {
      if (chatSession.valid(session)) {
        composer.setLoadError(err instanceof Error ? err.message : 'Tạo nhãn thất bại');
      }
    }
  }, [resolveWorkspaceId, composer]);

  const onDeleteTag = useCallback(async (tagId: string) => {
    const id = resolveWorkspaceId();
    if (!id || !tagId) return;
    const session = chatSession.capture();
    try {
      await bff.tagDelete(tagId);
      if (!chatSession.valid(session)) return;
      setTags((prev) => prev.filter((t) => t.id !== tagId));
      // Also refresh conversations to remove deleted tag
      const convs = await bff.chatGetConversations(id);
      if (!chatSession.valid(session)) return;
      chat.replaceAccountConversations(id, convs.conversations);
      composer.setStatusMsg('Đã xóa nhãn.');
    } catch (err) {
      if (chatSession.valid(session)) {
        composer.setLoadError(err instanceof Error ? err.message : 'Xóa nhãn thất bại');
      }
    }
  }, [resolveWorkspaceId, chat, composer]);

  const onRenameAccount = useCallback(async (nextDisplayName: string) => {
    const accountId = resolveWorkspaceId();
    if (!accountId) {
      throw new Error('Chua co account duoc chon');
    }

    const session = chatSession.capture();
    const result = await bff.updateAccountProfile(accountId, { hubAlias: nextDisplayName });
    if (!chatSession.valid(session)) return;
    const updatedAccount = result.account;
    if (updatedAccount) {
      workspace.addOrUpdateAccount(updatedAccount);
    }
    if (useWorkspaceStore.getState().selectedAccountId === accountId) composer.setStatusMsg('Da cap nhat alias account.');
  }, [resolveWorkspaceId, workspace, composer]);

  const visibleConversations = useMemo(() => chat.getAccountConversations(resolveWorkspaceId()), [chat, resolveWorkspaceId, workspace.selectedAccountId, chat.conversationsByAccount]);
  const activeConversation = useMemo(() => visibleConversations.find((e) => e.id === chat.activeConversationId), [visibleConversations, chat.activeConversationId]);
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
  const activeName = useMemo(() => {
    const rawTitle = activeContact ? getContactDisplayName(activeContact) : (activeGroup?.displayName ?? activeConversation?.title);
    return formatConversationTitle(rawTitle, activeConversation?.type, activeConversation?.threadId || chat.activeConversationId);
  }, [activeContact, activeGroup, activeConversation, chat.activeConversationId]);

  const activeSubtitle = useMemo(() => {
    return formatConversationSubtitle({
      status: activeContact?.status,
      phoneNumber: activeContact?.phoneNumber,
      memberCount: activeGroup?.memberCount,
      type: activeConversation?.type,
      threadId: activeConversation?.threadId,
      conversationId: activeConversation?.id || chat.activeConversationId,
    });
  }, [activeContact, activeGroup, activeConversation, chat.activeConversationId]);

  const [accountOrder, setAccountOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('zalohub_account_order');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

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
    const visibleList = list.map(a => ({
      ...a,
      visible: myAccountsMap.has(a.accountId) ? myAccountsMap.get(a.accountId) : true,
    }));

    // Deterministic sorting based on accountOrder saved in localStorage
    if (accountOrder.length > 0) {
      return [...visibleList].sort((a, b) => {
        const idxA = accountOrder.indexOf(a.accountId);
        const idxB = accountOrder.indexOf(b.accountId);
        const orderA = idxA >= 0 ? idxA : 9999;
        const orderB = idxB >= 0 ? idxB : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.displayName || a.accountId).localeCompare(b.displayName || b.accountId);
      });
    }

    return visibleList;
  }, [currentAccountId, workspace.knownAccounts, status?.account?.avatar, status?.account?.displayName, status?.account?.phoneNumber, myAccountsMap, accountOrder]);

  const onReorderAccounts = useCallback((newOrder: string[]) => {
    setAccountOrder(newOrder);
    try {
      localStorage.setItem('zalohub_account_order', JSON.stringify(newOrder));
    } catch { /* ignore */ }
  }, []);

  const onMoveAccount = useCallback((accountId: string, direction: 'up' | 'down') => {
    const currentList = sidebarAccounts.map((a) => a.accountId);
    const idx = currentList.indexOf(accountId);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === currentList.length - 1) return;

    const nextList = [...currentList];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const temp = nextList[idx];
    nextList[idx] = nextList[targetIdx];
    nextList[targetIdx] = temp;

    onReorderAccounts(nextList);
  }, [sidebarAccounts, onReorderAccounts]);

  const onMarkAllRead = useCallback(async () => {
    const id = resolveWorkspaceId();
    if (!id) return;
    const session = chatSession.capture();
    try {
      await api.markAllRead(id);
      if (!chatSession.valid(session)) return;
      const convs = chat.getAccountConversations(id);
      const updated = convs.map((c) => ({ ...c, unreadCount: 0 }));
      chat.replaceAccountConversations(id, updated);
      composer.setStatusMsg('Đã đánh dấu tất cả là đã đọc.');
    } catch (err) {
      if (chatSession.valid(session)) {
        composer.setLoadError(err instanceof Error ? err.message : 'Đánh dấu đã đọc thất bại');
      }
    }
  }, [resolveWorkspaceId, chat, composer]);

  const onSyncUnread = useCallback(async () => {
    const id = resolveWorkspaceId();
    if (!id) return;
    const session = chatSession.capture();
    try {
      composer.setStatusMsg('Đang đồng bộ số tin chưa đọc từ Zalo...');
      const res = await api.syncUnread(id);
      if (!chatSession.valid(session)) return;
      const fresh = await bff.chatGetConversations(id);
      if (!chatSession.valid(session)) return;
      chat.replaceAccountConversations(id, fresh.conversations);
      composer.setStatusMsg(`Đã đồng bộ ${res.count} cuộc trò chuyện từ Zalo.`);
    } catch (err) {
      if (chatSession.valid(session)) {
        composer.setLoadError(err instanceof Error ? err.message : 'Đồng bộ unread thất bại');
      }
    }
  }, [resolveWorkspaceId, chat, composer]);
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
    const session = chatSession.capture();
    void Promise.all(visibleAccountIds.map(async (accountId) => {
      try {
        const result = await bff.chatGetConversations(accountId);
        if (chatSession.valid(session)) chat.setSidebarConversationsForAccount(accountId, result.conversations);
      } catch {
        // Ignore per-account sidebar unread preload failures.
      }
    }));
  }, [sidebarAccounts, chat.setSidebarConversationsForAccount]);

  const filteredConversations = useMemo(() => {
    const q = workspace.query.trim().toLowerCase();
    let conversations = resolveConversationSummaries(visibleConversations);
    if (selectedTagId) {
      conversations = conversations.filter((c) => c.labels?.some((l) => l.id === selectedTagId));
    }
    if (!q) return conversations;
    return conversations.filter((e) => e.title.toLowerCase().includes(q));
  }, [visibleConversations, workspace.query, selectedTagId, resolveConversationSummaries]);

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

  const onReconnectAccount = useCallback(async (targetAccId?: string) => {
    const id = targetAccId || resolveWorkspaceId();
    if (!id) return;
    setReconnectModal({ open: true, status: 'loading', accountId: id });
    try {
      const res = await bff.accountRestart(id);
      if (res.ok === false || res.error) {
        setReconnectModal({
          open: true,
          status: 'error',
          accountId: id,
          errorMsg: res.error || 'Phiên Zalo đã hết hạn hoặc bị đăng xuất ở thiết bị khác.',
        });
      } else {
        setReconnectModal({ open: true, status: 'success', accountId: id });
        setTimeout(() => {
          setReconnectModal((prev) => ({ ...prev, open: false }));
          onRefresh();
        }, 1500);
      }
    } catch (err) {
      setReconnectModal({
        open: true,
        status: 'error',
        accountId: id,
        errorMsg: err instanceof Error ? err.message : 'Kết nối lại thất bại',
      });
    }
  }, [resolveWorkspaceId, onRefresh]);

  const onOpenQrLogin = useCallback((accId?: string) => {
    setQrLoginAccountId(accId ?? null);
    setQrLoginOpen(true);
  }, []);

  return {
    navigate,
    workspace,
    chat,
    composer,
    user,
    status,
    detailsOpen,
    setDetailsOpen,
    currentAccountId,
    sidebarAccounts,
    workspaceAccount,
    filteredConversations,
    filteredContacts,
    filteredGroups,
    visibleConversations,
    activeConversation,
    activeContact,
    activeGroup,
    activeName,
    activeAvatar,
    activeSubtitle,
    isGroupConversation,
    fileInputRef,
    textareaRef,
    handleCompositionStart,
    handleCompositionEnd,
    resolveWorkspaceId,
    onSelectAccount,
    onSelectConversation,
    onOpenDirectConversation,
    onOpenGroupConversation,
    onMessagesScroll,
    onKeyDown,
    onSend,
    onRetryMessage,
    onQueryMessage,
    onCancelMessage,
    onRestoreDraft,
    messageLoad,
    isComposing,
    canSend,
    onReactMessage,
    onRenameAccount,
    onReconnectAccount,
    reconnectModal,
    setReconnectModal,
    qrLoginOpen,
    setQrLoginOpen,
    qrLoginAccountId,
    onOpenQrLogin,
    tags,
    selectedTagId,
    setSelectedTagId,
    onSyncTags,
    onAssignTag,
    onUnassignTag,
    onCreateTag,
    onDeleteTag,
    onUpdateNotes,
    onToggleMute,
    onMoveAccount,
    onMarkAllRead,
    onSyncUnread,
  };
}
