import { useRef, useEffect, useState, useMemo, useCallback, useLayoutEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { GroupAvatar } from '@/components/GroupAvatar';
import { formatSize, getInitial, isImageAttachment } from '@/utils';
import { MessageBubble, type MessageGroupItem } from './MessageBubble';
import Lightbox, { type LightboxImage } from './Lightbox';
import type { ConversationSummary, Message, MessageReactionOption } from '@/types';
import { useComposerStore } from '@/stores/composer-store';
import type { DeliveryActions } from './messages/MessageDeliveryStatus';

interface ChatPanelProps extends DeliveryActions {
  loadState?: 'idle' | 'loading' | 'ready' | 'error';
  onRetryLoad?: () => void;
  isComposing?: boolean;
  canSend?: boolean;
  activeConversationId: string;
  activeConversation?: ConversationSummary;
  activeName: string;
  activeAvatar?: string;
  activeSubtitle?: string;
  isGroupConversation: boolean;
  groupMembers?: GroupMember[];
  contacts?: Contact[];
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
  onReactMessage: (message: Message, reaction: MessageReactionOption) => void;
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
  groupMembers,
  contacts,
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
  loadState, onRetryLoad, isComposing, canSend = true,
  onRetryMessage, onQueryMessage, onCancelMessage, onRestoreDraft,
}: ChatPanelProps) {
  const text = useComposerStore((s) => s.text);
  const attachFile = useComposerStore((s) => s.attachFile);
  const missingFileName = useComposerStore((s) => s.missingFileName);
  const [draftPreview, setDraftPreview] = useState<string>();
  useEffect(() => {
    if (!attachFile?.type.startsWith('image/')) { setDraftPreview(undefined); return; }
    const url = URL.createObjectURL(attachFile);
    setDraftPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [attachFile]);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewKey = JSON.stringify([workspaceAccountId, activeConversationId]);
  const prevConversationRef = useRef(viewKey);
  const userInteractedScrollRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  const [showScrollBottomButton, setShowScrollBottomButton] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const scrollSnapshot = useRef({ height: 0, top: 0, first: '', ids: new Set<string>(), anchor: '', offset: 0 });
  const captureAnchor = (el: HTMLDivElement) => {
    const top = el.getBoundingClientRect().top;
    const node = Array.from(el.querySelectorAll<HTMLElement>('[data-message-id]')).find((item) => item.getBoundingClientRect().bottom > top);
    return { anchor: node?.dataset.messageId || '', offset: node ? node.getBoundingClientRect().top - top : 0 };
  };

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
    setNewMessageCount(0);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight;
      setTimeout(() => { isAutoScrollingRef.current = false; }, 50);
    });
  }, []);

  const scrollToBottomSmooth = useCallback(() => {
    const el = messagesAreaRef.current;
    if (!el) return;
    isAutoScrollingRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setShowScrollBottomButton(false);
    setNewMessageCount(0);
    setTimeout(() => { isAutoScrollingRef.current = false; }, 300);
  }, []);

  // When switching conversation: reset state and snap to bottom
  useLayoutEffect(() => {
    const isNewConversation = viewKey !== prevConversationRef.current;
    prevConversationRef.current = viewKey;

    if (isNewConversation) {
      userInteractedScrollRef.current = false;
      scrollSnapshot.current = { height: 0, top: 0, first: '', ids: new Set(), anchor: '', offset: 0 };
      setNewMessageCount(0);
      scrollToBottomInstant();
    }
  }, [viewKey, scrollToBottomInstant]);

  // When messages update: if user hasn't explicitly scrolled up, keep pinned to bottom
  useLayoutEffect(() => {
    const el = messagesAreaRef.current;
    if (!el) return;
    const old = scrollSnapshot.current;
    const first = messages[0]?.localId || messages[0]?.id || '';
    const added = messages.filter((m) => !old.ids.has(m.localId || m.id));
    const ownSend = added.some((m) => m.delivery === 'queued' || m.delivery === 'sending');
    const prepended = old.first && first !== old.first && messages.some((m) => (m.localId || m.id) === old.first);
    if (prepended && !ownSend) {
      const anchor = Array.from(el.querySelectorAll<HTMLElement>('[data-message-id]')).find((node) => node.dataset.messageId === old.anchor);
      if (anchor) el.scrollTop += anchor.getBoundingClientRect().top - el.getBoundingClientRect().top - old.offset;
      else el.scrollTop = old.top + el.scrollHeight - old.height;
    }
    else if (ownSend || !userInteractedScrollRef.current) scrollToBottomInstant();
    else if (added.length) { setNewMessageCount((count) => count + added.length); setShowScrollBottomButton(true); }
    scrollSnapshot.current = { height: el.scrollHeight, top: el.scrollTop, first, ids: new Set(messages.map((m) => m.localId || m.id)), ...captureAnchor(el) };
  }, [messages, scrollToBottomInstant]);

  // Track real user scroll interaction
  const handleUserWheelOrTouch = () => {
    userInteractedScrollRef.current = true;
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom < 90;
    scrollSnapshot.current.top = container.scrollTop;
    scrollSnapshot.current.height = container.scrollHeight;
    Object.assign(scrollSnapshot.current, captureAnchor(container));

    if (atBottom) {
      userInteractedScrollRef.current = false;
      setShowScrollBottomButton(false);
      setNewMessageCount(0);
    } else if (userInteractedScrollRef.current && !isAutoScrollingRef.current) {
      setShowScrollBottomButton(true);
    }

    onScroll(e);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--background)] transition-colors">
      {!activeConversationId ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
          <div className="w-14 h-14 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs flex items-center justify-center text-2xl">💬</div>
          <span className="font-medium">Chọn một cuộc trò chuyện để bắt đầu</span>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="shrink-0 px-5 py-3 border-b border-[var(--border)] flex items-center gap-3 bg-[var(--card)] shadow-2xs z-10 transition-colors">
            {headerLeading}
            {isGroupConversation ? (
              <GroupAvatar
                avatar={activeAvatar}
                title={activeName}
                members={groupMembers}
                memberAvatars={activeConversation?.memberAvatars}
                contacts={contacts}
                size="md"
              />
            ) : (
              <Avatar className="w-10 h-10 text-sm shrink-0 ring-1 ring-[var(--border)]">
                {activeAvatar ? <img src={activeAvatar} alt={activeName} className="w-full h-full object-cover rounded-full" /> : null}
                <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#0a1020] font-bold">
                  {getInitial(activeName)}
                </AvatarFallback>
              </Avatar>
            )}
            <button
              type="button"
              onClick={onToggleDetails}
              className="min-w-0 flex-1 text-left rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-[var(--accent)]/50 transition-colors"
              title="Xem thông tin hội thoại"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[15px] font-bold text-[var(--foreground)] truncate">{activeName}</span>
                {/* Header Tag Badges */}
                {Array.isArray(activeConversation?.labels) && activeConversation.labels.length > 0 && (
                  <div className="flex items-center gap-1">
                    {activeConversation.labels.slice(0, 3).map((lbl) => (
                      <span
                        key={lbl.id}
                        className="px-1.5 py-0.2 rounded text-[10px] font-medium text-white shadow-xs"
                        style={{ backgroundColor: lbl.color || '#3b82f6' }}
                      >
                        {lbl.name}
                      </span>
                    ))}
                    {activeConversation.labels.length > 3 && (
                      <span className="text-[10px] text-muted-foreground font-semibold">+{activeConversation.labels.length - 3}</span>
                    )}
                  </div>
                )}
                {/* Note Indicator */}
                {activeConversation?.notes && (
                  <span className="text-xs text-amber-500" title="Có ghi chú khách hàng">📝</span>
                )}
              </div>
              {typingUsers.length > 0 ? (
                <div className="text-xs text-blue-500 animate-pulse mt-0.5 font-medium">
                  {typingUsers.length === 1
                    ? `${typingUsers[0]} đang nhập...`
                    : `${typingUsers.length} người đang nhập...`}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{activeSubtitle || '👤 Khách hàng Zalo'}</div>
              )}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleDetails}
              className={`text-xs shrink-0 h-8 px-3 rounded-lg border border-transparent ${detailsOpen ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold border-blue-500/20' : 'text-muted-foreground hover:text-foreground hover:bg-[var(--accent)]'}`}
            >
              {detailsOpen ? 'Ẩn info' : 'Info'}
            </Button>
          </div>

          {/* Banners */}
          {(statusMsg || loadError) && (
            <div className={`shrink-0 px-5 py-2 text-xs font-medium ${loadError ? 'bg-rose-500/10 text-rose-300 border-b border-rose-500/20' : 'bg-emerald-500/10 text-emerald-300 border-b border-emerald-500/20'}`}>
              {loadError || statusMsg}
              {loadState === 'error' && <button type="button" className="underline ml-3 p-2" onClick={onRetryLoad}>Tải lại</button>}
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
              className="h-full overflow-y-auto px-4 sm:px-6 py-4 flex flex-col gap-0.5"
              style={{ overflowAnchor: 'none' }}
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

              {loadState === 'loading' && <div role="status" className="text-xs text-slate-400 text-center p-3">Đang tải tin nhắn…</div>}
              {messages.length === 0 && loadState === 'ready' && (
                <div className="flex flex-col items-center justify-center my-auto py-12 text-center text-muted-foreground text-sm">
                  <div className="text-3xl mb-2">👋</div>
                  <div>Chưa có tin nhắn nào.</div>
                  <div className="text-xs opacity-70 mt-0.5">Gửi tin nhắn đầu tiên để bắt đầu hội thoại!</div>
                </div>
              )}

              {groupedMessages.map((item) => {
                const senderContact = item.msg.senderId && contacts ? contacts.find((c) => c.userId === item.msg.senderId) : undefined;
                const resolvedSenderAvatar = item.msg.senderAvatar || senderContact?.avatar;

                return (
                  <div key={item.msg.localId || item.msg.id} data-message-id={item.msg.localId || item.msg.id} className="flex flex-col">
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
                      senderAvatar={resolvedSenderAvatar}
                      onReact={onReactMessage}
                      onOpenLightbox={openLightbox}
                      onRetryMessage={onRetryMessage}
                      onQueryMessage={onQueryMessage}
                      onCancelMessage={onCancelMessage}
                      onRestoreDraft={onRestoreDraft}
                    />
                  </div>
                );
              })}
              <div ref={messagesEndRef} className="h-1 shrink-0" />
            </div>

            {/* Jump to bottom pill */}
            {showScrollBottomButton && (
              <button
                type="button"
                onClick={scrollToBottomSmooth}
                className="absolute right-6 bottom-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1e293b]/95 border border-white/10 text-xs text-white shadow-xl backdrop-blur-sm hover:bg-[#334155] active:scale-95 transition-all animate-in fade-in zoom-in duration-150"
              >
                <span>↓ {newMessageCount ? `${newMessageCount} tin nhắn mới` : 'Mới nhất'}</span>
              </button>
            )}
          </div>

          {/* Composer */}
          <form className="shrink-0 p-3 sm:p-4 border-t border-[var(--border)] flex flex-col gap-2 bg-[var(--card)] transition-colors shadow-lg" onSubmit={onSend}>
            {!canSend && <div className="text-xs text-amber-500 font-medium">Tài khoản cần kết nối và quyền gửi tin nhắn.</div>}
            {missingFileName && !attachFile && <div role="status" className="text-xs text-amber-500">Chọn lại tệp đính kèm: {missingFileName}
              <button type="button" className="underline p-2" onClick={onClearFile}>Bỏ tệp</button>
            </div>}
            {attachFile && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/25 rounded-xl text-xs text-blue-600 dark:text-blue-400 animate-in fade-in">
                {draftPreview && <img src={draftPreview} alt="Xem trước ảnh đính kèm" className="w-12 h-12 object-contain rounded" />}
                <span className="min-w-0 truncate font-medium">📎 {attachFile.name} ({formatSize(attachFile.size)})</span>
                <button type="button" aria-label="Bỏ tệp đính kèm" onClick={onClearFile} className="ml-auto text-rose-500 hover:text-rose-400 p-2">✕</button>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) onAttachFile(e.target.files[0]);
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-10 w-10 p-0 rounded-xl text-muted-foreground hover:text-[var(--foreground)] hover:bg-[var(--accent)] shrink-0"
                title="Đính kèm file hoặc ảnh"
                aria-label="Đính kèm file hoặc ảnh"
              >
                📎
              </Button>

              <Textarea
                ref={textareaRef as any}
                placeholder={isGroupConversation ? 'Nhập tin nhắn vào nhóm...' : 'Nhập tin nhắn...'}
                aria-label="Nội dung tin nhắn"
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                onKeyDown={onKeyDown}
                onCompositionStart={onCompositionStart}
                onCompositionEnd={onCompositionEnd}
                rows={1}
                className="min-h-[42px] max-h-[140px] resize-none flex-1 rounded-xl bg-[var(--muted)] border-[var(--border)] focus:border-blue-500 text-sm py-2.5 px-3.5 leading-relaxed text-[var(--foreground)] placeholder:text-muted-foreground"
              />

              <Button
                type="submit"
                disabled={!canSend || isComposing || (!text.trim() && !attachFile) || Boolean(missingFileName && !attachFile)}
                className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shrink-0 disabled:opacity-40 transition-opacity shadow-md shadow-blue-600/20"
              >
                Gửi
              </Button>
            </div>
          </form>

          {/* Lightbox for large images */}
          {lightboxOpen && (
            <Lightbox
              open={lightboxOpen}
              images={lightboxImages}
              index={lightboxIndex}
              onClose={() => setLightboxOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
