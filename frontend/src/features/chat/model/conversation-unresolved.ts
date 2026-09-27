import { useComposerStore } from '../../../stores/composer-store';
import { useChatStore } from '../../../stores/chat-store';
import { unresolvedBatch } from './composer-types';
import { actionRecovery } from './action-recovery';
export function conversationUnresolved(key: string) {
  const d = useComposerStore.getState().drafts[key];
  return actionRecovery.unresolved(key) || unresolvedBatch(d?.batch) || Boolean(d?.outbox?.some(e => unresolvedBatch(e.batch))) ||
    Boolean(useChatStore.getState().byConversation[key]?.messages.some(m => ['queued', 'sending', 'unknown'].includes(m.delivery || '')));
}
