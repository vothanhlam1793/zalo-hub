import { useCallback } from 'react';
import { api } from '../api';
import type { ConversationSummary, Message } from '../types';

export function useComposer() {
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
  ) => {
    e.preventDefault();
    const trimmedText = text.trim();
    if (!activeConversationId || (!trimmedText && !attachFile)) return;
    if (!accountId) {
      setStatusMsg('Chưa có tài khoản workspace được chọn');
      return;
    }

    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const kind = attachFile ? (attachFile.type.startsWith('image/') ? 'image' : 'file') : 'text';

    const pendingMsg: Message = {
      id: tempId,
      conversationId: activeConversationId,
      threadId: '',
      conversationType: 'direct',
      text: trimmedText || (attachFile ? `[${kind}]` : ''),
      kind,
      attachments: [],
      direction: 'outgoing',
      isSelf: true,
      timestamp: now,
      providerMessageId: tempId,
      cliMsgId: undefined,
    };

    appendLocalMessage?.(pendingMsg);
    setText('');
    setAttachFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSending(true);
    setStatusMsg('');

    updateConversationSummaryLocal?.(accountId, {
      conversationId: activeConversationId,
      text: pendingMsg.text,
      kind: pendingMsg.kind,
      timestamp: now,
      direction: 'outgoing',
    });

    try {
      if (attachFile) {
        const result: any = await api.accountSendAttachment(accountId, activeConversationId, attachFile, trimmedText || undefined);
        const resId = result?.message?.msgId ?? result?.msgId;
        if (resId) {
          pendingMsg.id = String(resId);
          pendingMsg.providerMessageId = String(resId);
        }
      } else {
        const result: any = await api.accountSendText(accountId, activeConversationId, trimmedText);
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
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>, handleSend: (e: React.FormEvent) => void) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      handleSend(e as any);
    }
  }, []);

  return { handleSend, handleKeyDown };
}
