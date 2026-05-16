import { useCallback } from 'react';
import { api } from '../api';
import type { ConversationSummary, HistorySyncResult, Message, Contact, Group } from '../types';

function buildHistoryStatus(result: HistorySyncResult) {
  if (result.timedOut && result.remoteCount === 0) {
    return 'Đồng bộ lịch sử bị timeout. Có thể điện thoại hoặc nguồn sync của Zalo chưa phản hồi.';
  }
  const batchInfo = (result.batchCount && result.batchCount > 1) ? ` (${result.batchCount} đợt)` : '';
  if (result.remoteCount === 0) {
    return 'Zalo không trả thêm lịch sử cũ cho cuộc trò chuyện này.';
  }
  return `Đồng bộ lịch sử: nhận ${result.remoteCount} tin, thêm mới ${result.insertedCount}, bỏ trùng ${result.dedupedCount}${batchInfo}.`;
}

export function useConversationManager() {
  const refreshConversationMessages = useCallback(async (
    accountId: string,
    conversationId: string,
    mergeMessagesIntoConversation: (accountId: string, conversationId: string, incoming: Message[], mode?: 'append' | 'replace') => { next: Message[] },
    setHasMoreHistory: (v: boolean) => void,
    selectionTokenRef: React.MutableRefObject<number>,
    activeConversationIdRef: React.MutableRefObject<string>,
    messagesEndRef: React.MutableRefObject<HTMLDivElement | null>,
  ) => {
    const token = selectionTokenRef.current;
    const r = await api.accountMessages(accountId, conversationId, { limit: 40 });
    const stillActive = activeConversationIdRef.current === conversationId && token === selectionTokenRef.current;
    mergeMessagesIntoConversation(accountId, conversationId, r.messages, 'replace');
    if (stillActive) {
      setHasMoreHistory(Boolean(r.hasMore));
    }
    if (stillActive) {
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
    return r;
  }, []);

  const syncConversationHistory = useCallback(async (
    accountId: string,
    conversationId: string,
    beforeMessageId: string | undefined,
    readAt: string | undefined,
    refreshConversationMessages: (accountId: string, conversationId: string) => Promise<any>,
    setSyncingHistory: (v: boolean) => void,
    setStatusMsg: (m: string) => void,
    setHasMoreHistory: (v: boolean) => void,
    replaceAccountConversations: (accountId: string, c: ConversationSummary[]) => void,
    selectionTokenRef: React.MutableRefObject<number>,
    activeConversationIdRef: React.MutableRefObject<string>,
  ) => {
    const token = selectionTokenRef.current;
    if (activeConversationIdRef.current === conversationId) {
      setSyncingHistory(true);
    }
    try {
      const result = await api.accountSyncHistory(accountId, conversationId, { beforeMessageId, timeoutMs: 15000 });
      if (readAt) {
        await api.accountUpdateReadState(accountId, conversationId, readAt);
      }
      await refreshConversationMessages(accountId, conversationId);
      const cv = await api.accountConversations(accountId);
      if (token === selectionTokenRef.current) {
        replaceAccountConversations(accountId, cv.conversations);
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
  }, []);

  const selectConversation = useCallback(async (
    conversationId: string,
    accountId: string,
    subscribe: (accountId: string, conversationId: string) => void,
    getCachedMessages: (accountId: string, conversationId: string) => Message[],
    mergeMessagesIntoConversation: (accountId: string, conversationId: string, incoming: Message[], mode?: 'append' | 'replace') => { next: Message[] },
    setMessages: (m: Message[]) => void,
    setActiveConversationId: (id: string) => void,
    setHasMoreHistory: (v: boolean) => void,
    setLoadError: (e: string) => void,
    setStatusMsg: (m: string) => void,
    loadData: (accountId: string, s?: SessionStatus | null, options?: { refresh?: boolean }) => void,
    refreshConversationMessages: (accountId: string, conversationId: string) => Promise<any>,
    syncConversationHistory: (accountId: string, conversationId: string, beforeMessageId?: string, readAt?: string) => Promise<HistorySyncResult>,
    selectionTokenRef: React.MutableRefObject<number>,
    activeConversationIdRef: React.MutableRefObject<string>,
  ) => {
    const token = selectionTokenRef.current + 1;
    selectionTokenRef.current = token;
    setActiveConversationId(conversationId);
    activeConversationIdRef.current = conversationId;
    const cached = getCachedMessages(accountId, conversationId);
    setMessages(cached);
    setHasMoreHistory(false);
    setLoadError('');
    setStatusMsg('');
    subscribe(accountId, conversationId);

    void (async () => {
      try {
        // Fetch messages from DB immediately in parallel with metadata sync.
        // This shows messages as fast as possible without waiting for heavy backend work.
        const [r] = await Promise.all([
          refreshConversationMessages(accountId, conversationId),
          api.accountSyncConversationMetadata(accountId, conversationId)
            .then((synced) => {
              if (token !== selectionTokenRef.current || activeConversationIdRef.current !== conversationId) return;
              if (synced.conversationId !== conversationId) {
                setActiveConversationId(synced.conversationId);
                activeConversationIdRef.current = synced.conversationId;
                subscribe(accountId, synced.conversationId);
                conversationId = synced.conversationId;
              }
              mergeMessagesIntoConversation(accountId, conversationId, synced.messages, 'replace');
            })
            .catch(() => { /* metadata sync failure should not block message display */ }),
        ]);

        if (token !== selectionTokenRef.current || activeConversationIdRef.current !== conversationId) return;
        if (r) {
          setMessages(r.messages);
          const hasMore = Boolean(r.hasMore);
          setHasMoreHistory(hasMore);

          // Nếu ít tin trong DB (< 10) và Zalo còn lịch sử → auto sync ngay, không cần scroll
          if (hasMore && r.messages.length < 10) {
            setStatusMsg('Đang tải lịch sử...');
            try {
              const syncResult = await syncConversationHistory(accountId, conversationId, r.messages[0]?.providerMessageId, new Date().toISOString());
              if (token !== selectionTokenRef.current || activeConversationIdRef.current !== conversationId) return;
              if (syncResult.insertedCount > 0) {
                const next = await refreshConversationMessages(accountId, conversationId);
                if (token !== selectionTokenRef.current || activeConversationIdRef.current !== conversationId) return;
                if (next) setMessages(next.messages);
                setHasMoreHistory(Boolean(syncResult.hasMore || (next?.messages.length ?? 0) >= 40));
              }
              setStatusMsg('');
            } catch {
              setStatusMsg('');
            }
          }
        }
      } catch (error) {
        if (token === selectionTokenRef.current) {
          setLoadError(error instanceof Error ? error.message : 'Không tải được history');
        }
      }
    })();
  }, []);

  const loadOlderMessages = useCallback(async (
    accountId: string,
    activeConversationId: string,
    messages: Message[],
    hasMoreHistory: boolean,
    loadingOlder: boolean,
    setLoadingOlder: (v: boolean) => void,
    setHasMoreHistory: (v: boolean) => void,
    setLoadError: (e: string) => void,
    prependMessages: (accountId: string, conversationId: string, incoming: Message[]) => { next: Message[] },
    syncConversationHistory: (accountId: string, conversationId: string, beforeMessageId?: string, readAt?: string) => Promise<HistorySyncResult>,
    messagesAreaRef: React.MutableRefObject<HTMLDivElement | null>,
  ) => {
    if (!activeConversationId || loadingOlder || !hasMoreHistory || messages.length === 0) {
      return;
    }
    if (!accountId) return;

    const oldest = messages[0]?.timestamp;
    if (!oldest) return;

    const container = messagesAreaRef.current;
    const previousHeight = container?.scrollHeight ?? 0;

    setLoadingOlder(true);
    try {
      const r = await api.accountMessages(accountId, activeConversationId, { before: oldest, limit: 40 });
      if (r.messages.length > 0) {
        prependMessages(accountId, activeConversationId, r.messages);
      } else {
        const syncResult = await syncConversationHistory(accountId, activeConversationId, messages[0]?.providerMessageId, new Date().toISOString());
        if (syncResult.insertedCount > 0) {
          const next = await api.accountMessages(accountId, activeConversationId, { before: oldest, limit: 40 });
          prependMessages(accountId, activeConversationId, next.messages);
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
  }, []);

  return { selectConversation, loadOlderMessages, refreshConversationMessages, syncConversationHistory };
}
