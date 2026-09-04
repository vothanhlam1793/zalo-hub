import { useCallback } from 'react';
import { bff } from '../bff-api';
import type { ConversationSummary, HistorySyncResult, Message, Contact, Group, SessionStatus } from '../types';

function buildHistoryStatus(result: HistorySyncResult) {
  if (result.timedOut && result.remoteCount === 0) {
    return 'Dong bo lich su bi timeout. Co the dien thoai hoac nguon sync cua Zalo chua phan hoi.';
  }
  const batchInfo = (result.batchCount && result.batchCount > 1) ? ` (${result.batchCount} dot)` : '';
  if (result.remoteCount === 0) {
    return 'Zalo khong tra them lich su cu cho cuoc tro chuyen nay.';
  }
  return `Dong bo lich su: nhan ${result.remoteCount} tin, them moi ${result.insertedCount}, bo trung ${result.dedupedCount}${batchInfo}.`;
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
    const r = await bff.chatGetMessages(accountId, conversationId, { limit: 40 });
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
      const result = await bff.syncHistory(accountId, conversationId, { beforeMessageId, timeoutMs: 15000 });
      if (readAt) {
        await bff.updateReadState(accountId, conversationId, readAt);
      }
      await refreshConversationMessages(accountId, conversationId);
      const cv = await bff.chatGetConversations(accountId);
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
        const [messagesRes, metadataRes] = await Promise.all([
          refreshConversationMessages(accountId, conversationId),
          bff.chatOpenConversation(accountId, conversationId).then((res) => {
            if (token !== selectionTokenRef.current || activeConversationIdRef.current !== conversationId) return;
            if (res.metadata) {
              const synced = res.metadata;
              if (synced.conversationId !== conversationId) {
                setActiveConversationId(synced.conversationId);
                activeConversationIdRef.current = synced.conversationId;
                subscribe(accountId, synced.conversationId);
                conversationId = synced.conversationId;
              }
              mergeMessagesIntoConversation(accountId, conversationId, synced.messages, 'replace');
            }
          }).catch(() => {}),
        ]);

        if (token !== selectionTokenRef.current || activeConversationIdRef.current !== conversationId) return;
        if (messagesRes) {
          setMessages(messagesRes.messages);
          const hasMore = Boolean(messagesRes.hasMore);
          setHasMoreHistory(hasMore);

          if (hasMore && messagesRes.messages.length < 10) {
            setStatusMsg('Dang tai lich su...');
            try {
              const syncResult = await syncConversationHistory(accountId, conversationId, messagesRes.messages[0]?.providerMessageId, new Date().toISOString());
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
          setLoadError(error instanceof Error ? error.message : 'Khong tai duoc history');
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
      const r = await bff.chatGetMessages(accountId, activeConversationId, { before: oldest, limit: 40 });
      if (r.messages.length > 0) {
        prependMessages(accountId, activeConversationId, r.messages);
      } else {
        const syncResult = await syncConversationHistory(accountId, activeConversationId, messages[0]?.providerMessageId, new Date().toISOString());
        if (syncResult.insertedCount > 0) {
          const next = await bff.chatGetMessages(accountId, activeConversationId, { before: oldest, limit: 40 });
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
      setLoadError(error instanceof Error ? error.message : 'Khong tai duoc lich su cu hon');
    } finally {
      setLoadingOlder(false);
    }
  }, []);

  return { selectConversation, loadOlderMessages, refreshConversationMessages, syncConversationHistory };
}
