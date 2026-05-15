import { useRef } from 'react';
import type { Message } from '../types';

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

  function mergeMessagesIntoConversation(
    accountId: string,
    conversationId: string,
    incoming: Message[],
    mode: 'append' | 'replace' = 'append',
  ) {
    const previous = messageCacheRef.current.get(getConversationCacheKey(accountId, conversationId)) ?? [];
    const next = mode === 'replace' ? mergeMessageList([], incoming) : mergeMessageList(previous, incoming);
    setConversationCache(accountId, conversationId, next);
    return { next, previous };
  }

  function prependMessages(accountId: string, conversationId: string, incoming: Message[]) {
    return mergeMessagesIntoConversation(accountId, conversationId, incoming, 'append');
  }

  function getCachedMessages(accountId: string, conversationId: string) {
    return messageCacheRef.current.get(getConversationCacheKey(accountId, conversationId)) ?? [];
  }

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
    clearCache,
  };
}
