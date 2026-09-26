import { useCallback, useRef, useState } from 'react';
import { useChatStore } from '../stores/chat-store';
import { useComposerStore } from '../stores/composer-store';
import { submitMessage } from '../features/chat/model/send-controller';

export function useComposer() {
  const isComposingRef = useRef(false);
  const [isComposing, setIsComposing] = useState(false);
  const handledEvents = useRef(new WeakSet<object>());
  const handleSend = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    if (isComposingRef.current || handledEvents.current.has(event.nativeEvent)) return;
    handledEvents.current.add(event.nativeEvent);
    const key = useChatStore.getState().activeKey;
    const draft = useComposerStore.getState().drafts[key];
    if (!key || !draft || (draft.missingFileName && !draft.attachFile)) return;
    const quote = draft.replyingTo ? {
      messageId: draft.replyingTo.id,
      senderId: draft.replyingTo.senderId,
      senderName: draft.replyingTo.senderName,
      text: draft.replyingTo.text,
      kind: draft.replyingTo.kind,
    } : undefined;

    submitMessage(key, draft.text.trim(), draft.attachFile || undefined, {
      mentions: draft.mentions,
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
