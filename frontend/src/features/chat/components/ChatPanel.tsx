import { useRef, useEffect, useState, useMemo, useCallback, useLayoutEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatSize, getInitial, isImageAttachment } from '@/utils';
import { MessageBubble, type MessageGroupItem } from './MessageBubble';
import Lightbox, { type LightboxImage } from './Lightbox';
import type { ConversationSummary, Message } from '@/types';

interface ChatPanelProps {
  activeConversationId: string;
  activeConversation?: ConversationSummary;
  activeName: string;
  activeAvatar?: string;
  activeSubtitle?: string;
  isGroupConversation: boolean;
  headerLeading?: React.ReactNode;
  messages: Message[];
  hasMoreHistory: boolean;
  loadingOlder: boolean;
  syncingHistory: boolean;
  statusMsg: string;
  loadError: string;
  showDisconnectBanner?: boolean;
  onReconnectAccount?: (accountId?: string) => void;
  workspaceAccountId?: string;
  text: string;
  attachFile: File | null;
  sending: boolean;
  typingUsers: string[];
  detailsOpen: boolean;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onTextChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCompositionStart?: () => void;
  onCompositionEnd?: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onSend: (e: React.FormEvent) => void;
  onAttachFile: (file: File | null) => void;
  onClearFile: () => void;
  onToggleDetails: () => void;
  onReactMessage: (message: Message, reaction: { emoji: string; type: number }) => void;
}

function formatDateDivider(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Hôm nay';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
    return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

export function ChatPanel({
  activeConversationId,
  activeConversation,
  activeName,
  activeAvatar,
  activeSubtitle,
  isGroupConversation,
  headerLeading,
  messages,
  hasMoreHistory,
  loadingOlder,
  syncingHistory,
  statusMsg,
  loadError,
  showDisconnectBanner,
  onReconnectAccount,
  workspaceAccountId,
  text,
  attachFile,
  sending,
  typingUsers,
  detailsOpen,
  onScroll,
  onTextChange,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  textareaRef,
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
  const userInteractedScrollRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  const [showScrollBottomButton, setShowScrollBottomButton] = useState(false);

  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Group messages by sender and 5-minute interval for cleaner layout
  const groupedMessages = useMemo<MessageGroupItem[]>(() => {
    const list: MessageGroupItem[] = [];
    let lastDate = '';

    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];
      const prev = messages[i - 1];
      const next = messages[i + 1];

      const currentDateStr = new Date(current.timestamp).toDateString();
      let showDateDivider: string | undefined;
      if (currentDateStr !== lastDate) {
        showDateDivider = formatDateDivider(current.timestamp);
        lastDate = currentDateStr;
      }

      const isSameSenderAsPrev = Boolean(
        prev &&
        prev.direction === current.direction &&
        (prev.senderId === current.senderId || prev.senderName === current.senderName) &&
        Math.abs(Date.parse(current.timestamp) - Date.parse(prev.timestamp)) < 5 * 60 * 1000
      );

      const isSameSenderAsNext = Boolean(
        next &&
        next.direction === current.direction &&
        (next.senderId === current.senderId || next.senderName === current.senderName) &&
        Math.abs(Date.parse(next.timestamp) - Date.parse(current.timestamp)) < 5 * 60 * 1000
      );

      list.push({
        msg: current,
        isFirstInGroup: !isSameSenderAsPrev || Boolean(showDateDivider),
        isLastInGroup: !isSameSenderAsNext,
        showDateDivider,
      });
    }

    return list;
  }, [messages]);

  const lightboxImages = useMemo<LightboxImage[]>(() => {
    const result: LightboxImage[] = [];
    for (const msg of messages) {
      const att = msg.attachments?.[0];
      const imgUrl = att?.url ?? att?.thumbnailUrl ?? msg.imageUrl;
      if (imgUrl && isImageAttachment(msg, att?.fileName, att?.mimeType)) {
        result.push({ url: imgUrl, senderName: msg.senderName });
      }
    }
    return result;
  }, [messages]);

  const lightboxMsgIdToIndex = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const msg of messages) {
      const att = msg.attachments?.[0];
      const imgUrl = att?.url ?? att?.thumbnailUrl ?? msg.imageUrl;
      if (imgUrl && isImageAttachment(msg, att?.fileName, att?.mimeType)) {
        map.set(msg.id, idx);
        idx += 1;
      }
    }
    return map;
  }, [messages]);

  const openLightbox = useCallback((messageId: string) => {
    const idx = lightboxMsgIdToIndex.get(messageId);
    if (idx !== undefined) {
      setLightboxIndex(idx);
      setLightboxOpen(true);
    }
  }, [lightboxMsgIdToIndex]);

  // Robust bottom scrolling engine
  const scrollToBottomInstant = useCallback(() => {
    const el = messagesAreaRef.current;
    if (!el) return;
    isAutoScrollingRef.current = true;
    el.scrollTop = el.scrollHeight;
    setShowScrollBottomButton(false);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight;
      setTimeout(() => { isAutoScrollingRef.current = false; }, 50);
    });
  }, []);

  const scrollToBottomSmooth = useCallback(() => {
    const el = messagesAreaRef.current;
    if (!el) return;
    isAutoScrollingRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setShowScrollBottomButton(false);
    setTimeout(() => { isAutoScrollingRef.current = false; }, 300);
  }, []);

  // When switching conversation: reset state and snap to bottom
  useLayoutEffect(() => {
    const isNewConversation = activeConversationId !== prevConversationRef.current;
    prevConversationRef.current = activeConversationId;

    if (isNewConversation) {
      userInteractedScrollRef.current = false;
      scrollToBottomInstant();
    }
  }, [activeConversationId, scrollToBottomInstant]);

  // When messages update: if user hasn't explicitly scrolled up, keep pinned to bottom
  useEffect(() => {
    if (!userInteractedScrollRef.current) {
      scrollToBottomInstant();
    }
  }, [messages.length, scrollToBottomInstant]);

  // Track real user scroll interaction
  const handleUserWheelOrTouch = () => {
    userInteractedScrollRef.current = true;
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom < 90;

    if (atBottom) {
      userInteractedScrollRef.current = false;
      setShowScrollBottomButton(false);
    } else if (userInteractedScrollRef.current && !isAutoScrollingRef.current) {
      setShowScrollBottomButton(true);
    }

    onScroll(e);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0b0e14]">
      {!activeConversationId ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
          <div className="w-12 h-12 rounded-2xl bg-white/4 flex items-center justify-center text-xl text-white/40">💬</div>
          <span>Chọn một cuộc trò chuyện để bắt đầu</span>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="shrink-0 px-5 py-3 border-b border-[var(--border)] flex items-center gap-3 bg-[rgba(11,14,20,0.85)] backdrop-blur-md z-10">
            {headerLeading}
            <Avatar className="w-10 h-10 text-sm shrink-0 ring-1 ring-white/10">
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
              <div className="text-[15px] font-semibold text-[#f1f5f9] truncate">{activeName}</div>
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
              className={`text-xs shrink-0 h-8 px-3 rounded-lg border border-transparent ${detailsOpen ? 'bg-white/10 text-[#7fa8ff] border-white/10' : 'text-muted-foreground hover:text-white hover:bg-white/5'}`}
            >
              {detailsOpen ? 'Ẩn info' : 'Info'}
            </Button>
          </div>

          {/* Banners */}
          {(statusMsg || loadError) && (
            <div className={`shrink-0 px-5 py-2 text-xs font-medium ${loadError ? 'bg-rose-500/10 text-rose-300 border-b border-rose-500/20' : 'bg-emerald-500/10 text-emerald-300 border-b border-emerald-500/20'}`}>
              {loadError || statusMsg}
            </div>
          )}
          {showDisconnectBanner && (
            <div className="shrink-0 px-5 py-2 text-xs bg-amber-500/10 text-amber-300 border-b border-amber-500/20 flex items-center justify-between gap-2">
              <span>⚠️ Tài khoản mất kết nối hoặc chưa active.</span>
              <div className="flex items-center gap-2">
                {onReconnectAccount && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onReconnectAccount(workspaceAccountId || activeConversation?.accountId)}
                    className="h-6 px-2 text-[11px] bg-amber-500 hover:bg-amber-600 text-black font-semibold shrink-0"
                  >
                    ⚡ Kết nối lại
                  </Button>
                )}
                <a href="/admin" className="underline text-[11px] shrink-0 text-amber-200">Admin</a>
              </div>
            </div>
          )}

          {/* Messages Viewport */}
          <div className="flex-1 min-h-0 relative">
            <div
              ref={messagesAreaRef}
              className="h-full overflow-y-auto px-4 sm:px-6 py-4 flex flex-col gap-0.5 scroll-smooth"
              style={{ overflowAnchor: 'auto' }}
              onScroll={handleScroll}
              onWheel={handleUserWheelOrTouch}
              onTouchMove={handleUserWheelOrTouch}
              onPointerDown={handleUserWheelOrTouch}
            >
              {hasMoreHistory && (
                <div className="mx-auto my-2 px-3 py-1 text-[11px] text-muted-foreground bg-white/5 border border-white/5 rounded-full select-none">
                  {loadingOlder || syncingHistory ? 'Đang tải thêm tin cũ...' : 'Kéo lên để tải thêm tin cũ'}
                </div>
              )}

              {messages.length === 0 && !hasMoreHistory && (
                <div className="flex flex-col items-center justify-center my-auto py-12 text-center text-muted-foreground text-sm">
                  <div className="text-3xl mb-2">👋</div>
                  <div>Chưa có tin nhắn nào.</div>
                  <div className="text-xs opacity-70 mt-0.5">Gửi tin nhắn đầu tiên để bắt đầu hội thoại!</div>
                </div>
              )}

              {groupedMessages.map((item) => (
                <div key={item.msg.id} className="flex flex-col">
                  {item.showDateDivider && (
                    <div className="flex items-center justify-center my-4 select-none">
                      <span className="text-[11px] font-medium tracking-wide uppercase px-3 py-0.5 rounded-full bg-white/5 border border-white/5 text-[#94a3b8] shadow-sm">
                        {item.showDateDivider}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    msg={item.msg}
                    isGroup={isGroupConversation}
                    isFirstInGroup={item.isFirstInGroup}
                    isLastInGroup={item.isLastInGroup}
                    onReact={onReactMessage}
                    onOpenLightbox={openLightbox}
                  />
                </div>
              ))}
              <div ref={messagesEndRef} className="h-1 shrink-0" />
            </div>

            {/* Jump to bottom pill */}
            {showScrollBottomButton && (
              <button
                type="button"
                onClick={scrollToBottomSmooth}
                className="absolute right-6 bottom-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1e293b]/95 border border-white/10 text-xs text-white shadow-xl backdrop-blur-sm hover:bg-[#334155] active:scale-95 transition-all animate-in fade-in zoom-in duration-150"
              >
                <span>↓ Mới nhất</span>
              </button>
            )}
          </div>

          {/* Composer */}
          <form className="shrink-0 p-3 sm:p-4 border-t border-[var(--border)] flex flex-col gap-2 bg-[rgba(11,14,20,0.95)] backdrop-blur" onSubmit={onSend}>
            {attachFile && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#4f7aff]/10 border border-[#4f7aff]/25 rounded-xl text-xs text-[#7fa8ff] animate-in fade-in">
                <span>📎 {attachFile.name} ({formatSize(attachFile.size)})</span>
                <button type="button" onClick={onClearFile} className="ml-auto text-rose-400 hover:text-rose-300 p-0.5">✕</button>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) onAttachFile(e.target.files[0]);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-10 w-10 p-0 rounded-xl text-muted-foreground hover:text-white hover:bg-white/5 shrink-0"
                title="Đính kèm file hoặc ảnh"
              >
                📎
              </Button>

              <Textarea
                ref={textareaRef as any}
                placeholder={isGroupConversation ? 'Nhập tin nhắn vào nhóm...' : 'Nhập tin nhắn...'}
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                onKeyDown={onKeyDown}
                onCompositionStart={onCompositionStart}
                onCompositionEnd={onCompositionEnd}
                rows={1}
                className="min-h-[42px] max-h-[140px] resize-none flex-1 rounded-xl bg-white/5 border-white/10 focus:border-[#4f7aff]/50 text-sm py-2.5 px-3.5 leading-relaxed placeholder:text-muted-foreground/60"
              />

              <Button
                type="submit"
                disabled={sending || (!text.trim() && !attachFile)}
                className="h-10 px-4 rounded-xl bg-[#4f7aff] hover:bg-[#4068e8] text-white font-medium shrink-0 disabled:opacity-40 transition-opacity"
              >
                {sending ? '...' : 'Gửi'}
              </Button>
            </div>
          </form>

          {/* Lightbox for large images */}
          {lightboxOpen && (
            <Lightbox
              images={lightboxImages}
              initialIndex={lightboxIndex}
              onClose={() => setLightboxOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
