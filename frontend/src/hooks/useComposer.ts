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
    setConversations: (c: ConversationSummary[] | ((prev: ConversationSummary[]) => ConversationSummary[])) => void,
    setMessages: (m: Message[]) => void,
    mergeMessagesIntoConversation: (accountId: string, conversationId: string, incoming: Message[], mode?: 'append' | 'replace') => { next: Message[] },
    fileInputRef: React.MutableRefObject<HTMLInputElement | null>,
  ) => {
    e.preventDefault();
    if (!activeConversationId || (!text.trim() && !attachFile)) return;
    if (!accountId) {
      setStatusMsg('Chưa có tài khoản workspace được chọn');
      return;
    }
    setSending(true);
    setStatusMsg('');
    try {
      if (attachFile) {
        await api.accountSendAttachment(accountId, activeConversationId, attachFile, text.trim() || undefined);
        setAttachFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        await api.accountSendText(accountId, activeConversationId, text.trim());
      }
      setText('');
      const r = await api.accountMessages(accountId, activeConversationId, { limit: 40 });
      const { next } = mergeMessagesIntoConversation(accountId, activeConversationId, r.messages, 'replace');
      setMessages(next);
      const cv = await api.accountConversations(accountId);
      setConversations(cv.conversations);
      setStatusMsg('Đã gửi.');
      setLoadError('');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Gửi thất bại');
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
