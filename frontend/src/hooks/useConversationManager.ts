import { useCallback } from 'react';
import { bff } from '../bff-api';
import type { ConversationSummary, HistorySyncResult, Message, SessionStatus } from '../types';
import { clientDb } from '../lib/client-db';

export function useConversationManager() {
  const refreshConversationMessages = useCallback(async (
    accountId: string,
    conversationId: string,
    mergeMessagesIntoConversation: (accountId: string, conversationId: string, incoming: Message[], mode?: 'append' | 'replace') => { next: Message[] },
    setHasMoreHistory: (v: boolean) => void,
    selectionTokenRef: React.MutableRefObject<number>,
    activeConversationIdRef: React.MutableRefObject<string>,
    messagesEndRef?: React.MutableRefObject<HTMLDivElement | null>,
  ) => {
    const token = selectionTokenRef.current;
    try {
      const r = await bff.chatGetMessages(accountId, conversationId, { limit: 50 });
      const stillActive = activeConversationIdRef.current === conversationId && token === selectionTokenRef.current;
      if (r.messages && r.messages.length > 0) {
        mergeMessagesIntoConversation(accountId, conversationId, r.messages, 'replace');
        if (stillActive) {
          setHasMoreHistory(Boolean(r.hasMore));
        }
      }
      return r;
    } catch {
      return { messages: [], count: 0, hasMore: false };
    }
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
      const result = await bff.syncHistory(accountId, conversationId, { beforeMessageId, timeoutMs: 8000 });
      if (readAt) {
        void bff.updateReadState(accountId, conversationId, readAt).catch(() => {});
      }
      await refreshConversationMessages(accountId, conversationId);
      const cv = await bff.chatGetConversations(accountId).catch(() => ({ conversations: [] }));
      if (token === selectionTokenRef.current && cv.conversations?.length > 0) {
        replaceAccountConversations(accountId, cv.conversations);
        void clientDb.saveConversations(accountId, cv.conversations);
      }
      return result;
    } catch {
      return {
        remoteCount: 0,
        insertedCount: 0,
        dedupedCount: 0,
        hasMore: false,
      } as HistorySyncResult;
    } finally {
      if (activeConversationIdRef.current === conversationId && token === selectionTokenRef.current) {
        setSyncingHistory(false);
      }
    }
  }, []);

  // INSTANT OPEN CONVERSATION: 0ms render from Cache/IndexedDB, then background non-blocking refresh
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
    loadFromDb?: (accountId: string, conversationId: string, limit?: number) => Promise<Message[]>,
  ) => {
    const token = selectionTokenRef.current + 1;
    selectionTokenRef.current = token;
    setActiveConversationId(conversationId);
    activeConversationIdRef.current = conversationId;
    setLoadError('');
    setStatusMsg('');
    subscribe(accountId, conversationId);

    // Save active state to localStorage for instant F5 restoration
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('zalohub_active_conversation', conversationId);
    }

    // Step 1 (0ms): Check RAM cache first
    let cached = getCachedMessages(accountId, conversationId);
    if (cached.length > 0) {
      setMessages(cached);
      setHasMoreHistory(true);
    } else if (loadFromDb) {
      // Step 2 (1~5ms): Fallback to IndexedDB
      const dbMsgs = await loadFromDb(accountId, conversationId, 50);
      if (token === selectionTokenRef.current && activeConversationIdRef.current === conversationId) {
        if (dbMsgs.length > 0) {
          cached = dbMsgs;
          setMessages(dbMsgs);
          setHasMoreHistory(true);
        }
      }
    }

    // Step 3 (Non-blocking background refresh): Always fetch the latest 50 messages from server
    void (async () => {
      try {
        const messagesRes = await bff.chatGetMessages(accountId, conversationId, { limit: 50 }).catch(() => null);

        if (token !== selectionTokenRef.current || activeConversationIdRef.current !== conversationId) return;

        if (messagesRes && messagesRes.messages && messagesRes.messages.length > 0) {
          const { next } = mergeMessagesIntoConversation(accountId, conversationId, messagesRes.messages, cached.length > 0 ? 'append' : 'replace');
          setMessages(next);
          setHasMoreHistory(Boolean(messagesRes.hasMore || next.length >= 40));
        }
      } catch {
        // Non-blocking: silence errors so user keeps reading local messages
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

    const oldest = messages[0]?.timestamp;
    const oldestProviderId = messages[0]?.providerMessageId;
    if (!oldest) return;

    setLoadingOlder(true);
    try {
      // 1. Try to load older from local IndexedDB first
      const dbOlder = await clientDb.getMessages(accountId, activeConversationId, 40, oldest);
      if (dbOlder.length > 0) {
        prependMessages(accountId, activeConversationId, dbOlder);
        setHasMoreHistory(true);
        return;
      }

      // 2. Fetch from backend DB
      const r = await bff.chatGetMessages(accountId, activeConversationId, { before: oldest, limit: 40 });
      if (r.messages && r.messages.length > 0) {
        prependMessages(accountId, activeConversationId, r.messages);
        setHasMoreHistory(Boolean(r.hasMore));
      } else {
        // 3. Fallback: sync from Zalo cloud if DB is exhausted
        const syncResult = await syncConversationHistory(accountId, activeConversationId, oldestProviderId, undefined);
        setHasMoreHistory(Boolean(syncResult.hasMore));
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Tải thêm tin cũ thất bại');
    } finally {
      setLoadingOlder(false);
    }
  }, []);

  return { selectConversation, loadOlderMessages, refreshConversationMessages, syncConversationHistory };
}
