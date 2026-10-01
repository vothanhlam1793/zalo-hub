import { useCallback, useRef, useState } from 'react';
import { useChatStore } from '../stores/chat-store';
import { useComposerStore } from '../stores/composer-store';
import { submitMessage } from '../features/chat/model/send-controller';
import { sendComposerBatch } from '../features/chat/model/composer-controller';
import { conversationRecovery } from '../features/chat/model/conversation-recovery';
import { ensureConversationRecovered } from '../stores/composer-store';
import { sanitizeMentions } from '../features/chat/model/mention-utils';

export function useComposer() {
  const isComposingRef = useRef(false);
  const [isComposing, setIsComposing] = useState(false);
  const handledEvents = useRef(new WeakSet<object>());
  const handleSend = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    if (isComposingRef.current || handledEvents.current.has(event.nativeEvent)) return;
    handledEvents.current.add(event.nativeEvent);
    const key = useChatStore.getState().activeKey;
    if (key && !conversationRecovery.ready(key)) {
      void ensureConversationRecovered(key);
      useComposerStore.getState().setStatusMsg('Đang khôi phục hội thoại. Giữ bản nháp và bấm gửi sau khi khôi phục xong.');
      return;
    }
    const draft = useComposerStore.getState().drafts[key];
    if (!key || !draft || (draft.missingFileName && !draft.attachFile)) return;
    if (draft.attachments.length || draft.batch) {
      if (!draft.batch) void sendComposerBatch(key);
      return;
    }
    const quote = draft.replyingTo ? {
      messageId: draft.replyingTo.id,
      senderId: draft.replyingTo.senderId,
      senderName: draft.replyingTo.senderName,
      text: draft.replyingTo.text,
      kind: draft.replyingTo.kind,
    } : undefined;

    const text = draft.text.trim();
    const validMentions = sanitizeMentions(draft.text, draft.mentions);

    submitMessage(key, text, draft.attachFile || undefined, {
      mentions: validMentions,
      quoteMessageId: draft.replyingTo?.id,
      quote,
    });
  }, []);
  const handleCompositionStart = useCallback(() => { isComposingRef.current = true; setIsComposing(true); }, []);
  const handleCompositionEnd = useCallback(() => { isComposingRef.current = false; setIsComposing(false); }, []);
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>, send: (event: React.FormEvent) => void) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      if (event.nativeEvent.isComposing || isComposingRef.current || event.keyCode === 229) return;
      event.preventDefault();
      send(event);
    }
  }, []);
  return { handleSend, handleKeyDown, handleCompositionStart, handleCompositionEnd, isComposingRef, isComposing };
}
