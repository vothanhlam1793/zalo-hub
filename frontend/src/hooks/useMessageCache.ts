import { useMemo } from 'react';
import type { Message } from '../types';
import { clientDb } from '../lib/client-db';
import { useChatStore } from '../stores/chat-store';
import { chatSession, conversationKey } from '../features/chat/model/chat-session';
import { recoverMessage } from '../features/chat/model/message-reconciliation';

/** Compatibility adapter only; all messages live in chat-store. */
export function useMessageCache() {
  return useMemo(() => {
    const key = (account: string, conversation: string) => conversationKey(chatSession.capture().userId, account, conversation);
    const getCachedMessages = (account: string, conversation: string) => useChatStore.getState().byConversation[key(account, conversation)]?.messages || [];
    const mergeMessagesIntoConversation = (account: string, conversation: string, incoming: Message[], _mode?: 'append' | 'replace') => {
      const previous = getCachedMessages(account, conversation);
      return { previous, next: useChatStore.getState().mergeForKey(key(account, conversation), incoming) };
    };
    return {
      getConversationCacheKey: key,
      getCachedMessages,
      mergeMessagesIntoConversation,
      prependMessages: mergeMessagesIntoConversation,
      setConversationCache: mergeMessagesIntoConversation,
      clearCache: () => {}, // Account switching is selection, not cache destruction.
      async loadFromDb(account: string, conversation: string, limit = 50, before?: string) {
        const session = chatSession.capture();
        const capturedKey = key(account, conversation);
        const rows = await clientDb.getMessages(account, conversation, limit, before);
        if (!chatSession.valid(session)) return [];
        return useChatStore.getState().mergeForKey(capturedKey, rows.map(recoverMessage), true);
      },
    };
  }, []);
}
