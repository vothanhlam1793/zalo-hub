import { useRef, useCallback } from 'react';
import type { Message } from '../types';
import { clientDb } from '../lib/client-db';

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

export function useMessageCache() {
  const messageCacheRef = useRef(new Map<string, Message[]>());

  function getConversationCacheKey(accountId: string, conversationId: string) {
    return `${accountId}::${conversationId}`;
  }

  function setConversationCache(accountId: string, conversationId: string, nextMessages: Message[]) {
    messageCacheRef.current.set(getConversationCacheKey(accountId, conversationId), nextMessages);
  }

  const mergeMessagesIntoConversation = useCallback((
    accountId: string,
    conversationId: string,
    incoming: Message[],
    mode: 'append' | 'replace' = 'append',
  ) => {
    const previous = messageCacheRef.current.get(getConversationCacheKey(accountId, conversationId)) ?? [];
    const next = mode === 'replace' ? mergeMessageList([], incoming) : mergeMessageList(previous, incoming);
    setConversationCache(accountId, conversationId, next);

    // Save to IndexedDB asynchronously (fire and forget)
    if (incoming.length > 0) {
      void clientDb.saveMessages(accountId, conversationId, incoming);
    }

    return { next, previous };
  }, []);

  const prependMessages = useCallback((accountId: string, conversationId: string, incoming: Message[]) => {
    return mergeMessagesIntoConversation(accountId, conversationId, incoming, 'append');
  }, [mergeMessagesIntoConversation]);

  const getCachedMessages = useCallback((accountId: string, conversationId: string) => {
    return messageCacheRef.current.get(getConversationCacheKey(accountId, conversationId)) ?? [];
  }, []);

  const loadFromDb = useCallback(async (accountId: string, conversationId: string, limit = 50, before?: string) => {
    const dbMessages = await clientDb.getMessages(accountId, conversationId, limit, before);
    if (dbMessages.length > 0) {
      const current = messageCacheRef.current.get(getConversationCacheKey(accountId, conversationId)) ?? [];
      const merged = mergeMessageList(current, dbMessages);
      setConversationCache(accountId, conversationId, merged);
      return merged;
    }
    return dbMessages;
  }, []);

  function clearCache() {
    messageCacheRef.current.clear();
  }

  return {
    messageCacheRef,
    getConversationCacheKey,
    setConversationCache,
    mergeMessagesIntoConversation,
    prependMessages,
    getCachedMessages,
    loadFromDb,
    clearCache,
  };
}
