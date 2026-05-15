import { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatSize, getInitial } from '../utils';
import { MessageBubble } from './MessageBubble';
import type { ConversationSummary, Message } from '../types';

interface ChatPanelProps {
  activeConversationId: string;
  activeConversation?: ConversationSummary;
  activeName: string;
  activeAvatar?: string;
  activeSubtitle?: string;
  isGroupConversation: boolean;
  messages: Message[];
  hasMoreHistory: boolean;
  loadingOlder: boolean;
  syncingHistory: boolean;
  statusMsg: string;
  loadError: string;
  showDisconnectBanner?: boolean;
  text: string;
  attachFile: File | null;
  sending: boolean;
  typingUsers: string[];
  detailsOpen: boolean;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onTextChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: (e: React.FormEvent) => void;
  onAttachFile: (file: File | null) => void;
  onClearFile: () => void;
  onToggleDetails: () => void;
  onReactMessage: (message: Message, reaction: { emoji: string; type: number }) => void;
}

export function ChatPanel({
  activeConversationId,
  activeConversation,
  activeName,
  activeAvatar,
  activeSubtitle,
  isGroupConversation,
  messages,
  hasMoreHistory,
  loadingOlder,
  syncingHistory,
  statusMsg,
  loadError,
  showDisconnectBanner,
  text,
  attachFile,
  sending,
  typingUsers,
  detailsOpen,
  onScroll,
  onTextChange,
  onKeyDown,
  onSend,
  onAttachFile,
  onClearFile,
  onToggleDetails,
  onReactMessage,
}: ChatPanelProps) {
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevConversationRef = useRef(activeConversationId);
  const observerRef = useRef<ResizeObserver | null>(null);
  const observerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userScrolledUpRef = useRef(false);

  useEffect(() => {
    const container = messagesAreaRef.current;
    if (!container) return;

    const isNewConversation = activeConversationId !== prevConversationRef.current;
    prevConversationRef.current = activeConversationId;

    if (isNewConversation) {
      userScrolledUpRef.current = false;
    }

    const scrollToBottom = () => {
      if (!messagesAreaRef.current || userScrolledUpRef.current) return;
      messagesAreaRef.current.scrollTop = messagesAreaRef.current.scrollHeight;
    };

    const cleanObserver = () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (observerTimeoutRef.current) {
        clearTimeout(observerTimeoutRef.current);
        observerTimeoutRef.current = null;
      }
    };

    cleanObserver();

    if (isNewConversation || messages.length > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(scrollToBottom);
      });

      observerRef.current = new ResizeObserver(() => {
        scrollToBottom();
      });
      observerRef.current.observe(container);

      observerTimeoutRef.current = setTimeout(() => {
        cleanObserver();
      }, 8000);
    }

    return cleanObserver;
  }, [activeConversationId, messages]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    if (!atBottom) {
      userScrolledUpRef.current = true;
    }
    onScroll(e);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {!activeConversationId ? (
        <div className="flex-1 flex items-center justify-center text-[#555] text-sm">
          Chọn một cuộc trò chuyện để bắt đầu
        </div>
      ) : (
        <>
          <div className="shrink-0 px-5 py-3.5 border-b border-[var(--border)] flex items-center gap-3">
            <Avatar className="w-9 h-9 text-sm shrink-0">
              {activeAvatar ? <img src={activeAvatar} alt={activeName} className="w-full h-full object-cover rounded-full" /> : null}
              <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] font-bold">
                {getInitial(activeName)}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={onToggleDetails}
              className="min-w-0 flex-1 text-left rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-white/4 transition-colors"
              title="Xem thông tin hội thoại"
            >
              <div className="text-[15px] font-bold text-[#eee] truncate">{activeName}</div>
              {typingUsers.length > 0 ? (
                <div className="text-xs text-[#7fa8ff] animate-pulse mt-0.5">
                  {typingUsers.length === 1
                    ? `${typingUsers[0]} đang nhập...`
                    : `${typingUsers.length} người đang nhập...`}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{activeSubtitle || activeConversationId}</div>
              )}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleDetails}
              className={`text-xs shrink-0 h-7 ${detailsOpen ? 'text-[#7fa8ff]' : 'text-muted-foreground hover:text-[#7fa8ff]'}`}
            >
              {detailsOpen ? 'Ẩn info' : 'Info'}
            </Button>
          </div>

          {(statusMsg || loadError) && (
            <div className={`shrink-0 px-5 py-2.5 text-[13px] ${loadError ? 'bg-[rgba(255,80,80,0.1)] text-[#ff9a9a]' : 'bg-[rgba(60,200,120,0.1)] text-[#6fe0a0]'}`}>
              {loadError || statusMsg}
            </div>
          )}
          {showDisconnectBanner && (
            <div className="shrink-0 px-5 py-2.5 text-[13px] bg-[rgba(255,160,60,0.1)] text-[#ffa03c] flex items-center justify-between">
              <span>⚠️ Tài khoản mất kết nối. Vào <a href="/admin" className="underline">Admin</a> để quét QR lại hoặc liên hệ master.</span>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-visible px-4 pt-4 pb-10">
            <div
              ref={messagesAreaRef}
              className="h-full overflow-y-auto pr-1"
              onScroll={handleScroll}
            >
              {hasMoreHistory && (
                <div className="mx-auto w-fit px-2.5 py-1.5 text-xs text-[#7b8597] bg-white/4 border border-white/6 rounded-full">
                  {loadingOlder || syncingHistory ? 'Đang tải thêm tin cũ...' : 'Kéo lên để tải thêm tin cũ'}
                </div>
              )}
              {messages.length === 0 && !hasMoreHistory && (
                <div className="flex items-center justify-center h-full text-[#555] text-sm mt-8">
                  Chưa có tin nhắn. Hãy gửi tin nhắn đầu tiên!
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                {messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} isGroup={isGroupConversation} onReact={onReactMessage} />
                ))}
              </div>
              <div ref={messagesEndRef} />
            </div>
          </div>

          <form className="shrink-0 p-3.5 pb-4 border-t border-[var(--border)] flex flex-col gap-2.5 bg-[var(--card)]" onSubmit={onSend}>
            {attachFile && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[rgba(79,122,255,0.1)] border border-[rgba(79,122,255,0.25)] rounded-[10px] text-xs text-[#7fa8ff]">
                <span>📎 {attachFile.name} ({formatSize(attachFile.size)})</span>
                <button type="button" onClick={onClearFile} className="ml-auto bg-none border-none text-[#ff8888] cursor-pointer text-sm p-0 leading-none">✕</button>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <Textarea
                placeholder={isGroupConversation ? 'Nhập tin nhắn vào nhóm...' : 'Nhập tin nhắn...'}
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                className="min-h-[58px] max-h-[160px] resize-none flex-1"
              />
              <div className="flex gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Đính kèm ảnh/file"
                  onClick={() => fileInputRef.current?.click()}
                  className={attachFile ? 'border-[rgba(79,122,255,0.6)] text-[#7fa8ff] bg-[rgba(79,122,255,0.12)]' : ''}
                >
                  📎
                </Button>
                <Button
                  type="submit"
                  size="icon"
                  disabled={sending || (!text.trim() && !attachFile)}
                  title="Gửi"
                >
                  ➤
                </Button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt,.mp4"
              className="hidden"
              onChange={(e) => onAttachFile(e.target.files?.[0] ?? null)}
            />
          </form>
        </>
      )}
    </div>
  );
}
