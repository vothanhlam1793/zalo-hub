import { useCallback, useRef } from 'react';
import { bff } from '../bff-api';
import type { ConversationSummary, Message } from '../types';

export function useComposer() {
  const lastSendTimeRef = useRef(0);
  const isComposingRef = useRef(false);

  const handleSend = useCallback(async (
    e: React.FormEvent,
    activeConversationId: string,
    text: string,
    attachFile: File | null,
    accountId: string,
    setText: (t: string) => void,
    setAttachFile: (f: File | null) => void,
    setSending: (v: boolean) => void,
    setStatusMsg: (m: string) => void,
    setLoadError: (e: string) => void,
    replaceAccountConversations: (accountId: string, c: ConversationSummary[]) => void,
    setMessages: (m: Message[]) => void,
    mergeMessagesIntoConversation: (accountId: string, conversationId: string, incoming: Message[], mode?: 'append' | 'replace') => { next: Message[] },
    fileInputRef: React.MutableRefObject<HTMLInputElement | null>,
    appendLocalMessage?: (msg: Message) => void,
    updateConversationSummaryLocal?: (accountId: string, msg: { conversationId: string; text: string; kind: string; timestamp: string; direction: string }) => void,
    textareaRef?: React.MutableRefObject<HTMLTextAreaElement | null>,
  ) => {
    e.preventDefault();
    const currentInputText = (textareaRef?.current?.value ?? text).trim();
    if (!activeConversationId || (!currentInputText && !attachFile)) return;
    if (!accountId) {
      setStatusMsg('Chưa có tài khoản workspace được chọn');
      return;
    }

    // Debounce guard: block duplicate Enter bursts within 250ms
    const nowTs = Date.now();
    if (nowTs - lastSendTimeRef.current < 250) {
      return;
    }
    lastSendTimeRef.current = nowTs;

    const tempId = `pending-${nowTs}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const kind = attachFile ? (attachFile.type.startsWith('image/') ? 'image' : 'file') : 'text';

    const pendingMsg: Message = {
      id: tempId,
      conversationId: activeConversationId,
      threadId: '',
      conversationType: 'direct',
      text: currentInputText || (attachFile ? `[${kind}]` : ''),
      kind,
      attachments: [],
      direction: 'outgoing',
      isSelf: true,
      timestamp: now,
      providerMessageId: tempId,
      cliMsgId: undefined,
    };

    // Synchronously clear both DOM element and React state immediately
    if (textareaRef?.current) {
      textareaRef.current.value = '';
    }
    setText('');
    setAttachFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSending(true);
    setStatusMsg('');

    appendLocalMessage?.(pendingMsg);

    updateConversationSummaryLocal?.(accountId, {
      conversationId: activeConversationId,
      text: pendingMsg.text,
      kind: pendingMsg.kind,
      timestamp: now,
      direction: 'outgoing',
    });

    try {
      const params: {
        accountId: string; conversationId: string;
        text?: string; type?: string; caption?: string;
      } = {
        accountId,
        conversationId: activeConversationId,
      };

      if (attachFile) {
        params.type = 'attachment';
        if (currentInputText) params.caption = currentInputText;
        const result: any = await bff.send(params, attachFile);
        const resId = result?.message?.msgId ?? result?.msgId;
        if (resId) {
          pendingMsg.id = String(resId);
          pendingMsg.providerMessageId = String(resId);
        }
      } else {
        params.text = currentInputText;
        const result: any = await bff.send(params);
        const resId = result?.message?.msgId ?? result?.msgId;
        if (resId) {
          pendingMsg.id = String(resId);
          pendingMsg.providerMessageId = String(resId);
        }
      }
      setLoadError('');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Gửi thất bại');
      setLoadError(err instanceof Error ? err.message : 'Gửi thất bại');
    } finally {
      setSending(false);
      // Double check cleanup in case IME injected text after asynchronous tick
      if (textareaRef?.current && textareaRef.current.value === currentInputText) {
        textareaRef.current.value = '';
        setText('');
      }
    }
  }, []);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
  }, []);

  const handleKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    handleSend: (e: React.FormEvent) => void,
  ) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      if (e.nativeEvent.isComposing || isComposingRef.current || e.keyCode === 229) {
        return;
      }
      e.preventDefault();
      handleSend(e as any);
    }
  }, []);

  return { handleSend, handleKeyDown, handleCompositionStart, handleCompositionEnd, isComposingRef };
}
