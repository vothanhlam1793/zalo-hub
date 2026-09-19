import { useRef, useCallback } from 'react';
import type { Message } from '../types';
import { clientDb } from '../lib/client-db';

/**
 * Robust message key extractor:
 * Strips accountId prefix (e.g. 2223644954053185337::8279911281026 -> 8279911281026)
 * to ensure incoming WS messages, DB messages, and optimistic messages resolve to the same entity.
 */
function getMessageCanonicalKey(m: Message): string {
  if (m.providerMessageId && m.providerMessageId.trim()) {
    const p = m.providerMessageId.trim();
    return p.includes('::') ? p.split('::').pop()! : p;
  }
  if (m.cliMsgId && m.cliMsgId.trim()) {
    return m.cliMsgId.trim();
  }
  const id = m.id.trim();
  return id.includes('::') ? id.split('::').pop()! : id;
}

function mergeMessageList(base: Message[], incoming: Message[]) {
  const byKey = new Map<string, Message>();
  
  for (const message of base) {
    const key = getMessageCanonicalKey(message);
    byKey.set(key, message);
  }

  for (const message of incoming) {
    const key = getMessageCanonicalKey(message);
    const existing = byKey.get(key);

    // If matching a pending outgoing message with a confirmed outgoing message, replace with confirmed
    if (existing && existing.id.startsWith('pending-') && !message.id.startsWith('pending-')) {
      byKey.set(key, message);
    } else if (existing) {
      byKey.set(key, { ...existing, ...message });
    } else {
      // Check if this incoming message matches an existing pending message with same text & direction
      let foundPendingKey: string | undefined;
      if (message.direction === 'outgoing' || message.isSelf) {
        for (const [k, v] of byKey.entries()) {
          if (v.id.startsWith('pending-') && v.text === message.text && Math.abs(Date.parse(v.timestamp) - Date.parse(message.timestamp)) < 30_000) {
            foundPendingKey = k;
            break;
          }
        }
      }
      if (foundPendingKey) {
        byKey.delete(foundPendingKey);
      }
      byKey.set(key, message);
    }
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
