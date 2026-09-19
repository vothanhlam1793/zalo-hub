import React, { memo } from 'react';
import { formatSize, formatTime, getFileIcon, isImageAttachment, isVideoAttachment } from '@/utils';
import type { Message, MessageReactionOption } from '@/types';

const REACTION_OPTIONS: MessageReactionOption[] = [
  { emoji: '❤️', icon: '/-heart' },
  { emoji: '👍', icon: '/-strong' },
  { emoji: '😆', icon: ':>' },
  { emoji: '😮', icon: ':o' },
  { emoji: '😢', icon: ':-((' },
  { emoji: '😡', icon: ':-h' },
];

export interface MessageGroupItem {
  msg: Message;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  showDateDivider?: string;
}

interface MessageBubbleProps {
  msg: Message;
  isGroup: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  onReact?: (message: Message, reaction: MessageReactionOption) => void;
  onOpenLightbox?: (messageId: string) => void;
}

export const MessageBubble = memo(function MessageBubble({
  msg,
  isGroup,
  isFirstInGroup = true,
  isLastInGroup = true,
  onReact,
  onOpenLightbox,
}: MessageBubbleProps) {
  const dir = msg.direction;
  const isOutgoing = dir === 'outgoing' || msg.isSelf;
  const att = msg.attachments?.[0];
  const imageUrl = att?.url ?? att?.thumbnailUrl ?? msg.imageUrl;
  const fallbackFileLabel = att?.fileName ?? msg.text ?? (msg.kind === 'video' ? 'Video' : 'File');
  const fileIcon = getFileIcon(msg, att?.fileName, att?.mimeType);
  const hasAttachmentUrl = Boolean(att?.url);
  const shouldRenderImage = Boolean(imageUrl && isImageAttachment(msg, att?.fileName, att?.mimeType));
  const shouldRenderVideo = Boolean(att?.url && isVideoAttachment(msg, att?.fileName, att?.mimeType));
  const shouldRenderFile = Boolean(att && !shouldRenderImage && !shouldRenderVideo);
  const isSticker = msg.kind === 'sticker';
  const quoteLabel = msg.quote?.senderName ?? msg.quote?.senderId ?? 'Tin nhắn gốc';
  const quoteText = msg.quote?.text?.trim() || (msg.quote?.kind ? `[${msg.quote.kind}]` : 'Tin nhắn đã trả lời');
  const canReact = Boolean(onReact && msg.providerMessageId && msg.kind !== 'reaction');
  const defaultReaction = REACTION_OPTIONS[1];

  const reactionDock = canReact ? (
    <div className={`pointer-events-none absolute top-full z-10 mt-0.5 flex items-center opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 ${isOutgoing ? 'right-0 justify-end' : 'left-0 justify-start'}`}>
      <div className="group/reaction relative flex items-center">
        <button
          type="button"
          className="h-6 w-6 rounded-full text-[13px] text-[rgba(255,255,255,0.20)] transition hover:text-[rgba(255,255,255,0.55)] hover:bg-white/5 focus-visible:text-[rgba(255,255,255,0.55)] focus-visible:outline-none"
          onClick={() => onReact?.(msg, defaultReaction)}
          title="Thả thích"
        >
          👍
        </button>
        <div className={`pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-0 transition-all duration-150 group-hover/reaction:pointer-events-auto group-hover/reaction:opacity-100 group-focus-within/reaction:pointer-events-auto group-focus-within/reaction:opacity-100 ${isOutgoing ? 'right-full mr-0.5' : 'left-full ml-0.5'}`}>
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[rgba(8,12,18,0.95)] px-1.5 py-1 shadow-lg backdrop-blur-sm">
            {REACTION_OPTIONS.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                className="h-7 w-7 rounded-full text-sm hover:bg-white/10 active:scale-95 transition-transform"
                onClick={() => onReact?.(msg, reaction)}
                title={`Thả cảm xúc ${reaction.emoji}`}
              >
                {reaction.emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const showText = msg.text && msg.text !== '[image]' && msg.text !== '[file]' && msg.text !== '[video]' && !isSticker;

  // Custom rounded corners based on position in group for clean Slack/Telegram look
  const roundedClass = isOutgoing
    ? `rounded-2xl ${isFirstInGroup ? 'rounded-tr-2xl' : 'rounded-tr-md'} ${isLastInGroup ? 'rounded-br-sm' : 'rounded-br-md'}`
    : `rounded-2xl ${isFirstInGroup ? 'rounded-tl-2xl' : 'rounded-tl-md'} ${isLastInGroup ? 'rounded-bl-sm' : 'rounded-bl-md'}`;

  if (isSticker) {
    const stickerUrl = imageUrl || att?.url || '';
    return (
      <div className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'} ${isFirstInGroup ? 'mt-2.5' : 'mt-1'}`}>
        <div className="group relative max-w-[160px]">
          {isGroup && !isOutgoing && isFirstInGroup && msg.senderName && (
            <div className="text-[11px] text-[#7fa8ff] font-medium mb-1 pl-1">{msg.senderName}</div>
          )}
          <div className="min-h-[120px] min-w-[120px] flex items-center justify-center">
            <img src={stickerUrl} alt="Sticker" className="w-full h-auto block" loading="lazy" />
          </div>
          <div className="text-[10px] text-[rgba(255,255,255,0.30)] mt-0.5 text-right">{formatTime(msg.timestamp)}</div>
          {reactionDock}
        </div>
      </div>
    );
  }

  if (msg.kind === 'poll') {
    return (
      <div className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'} ${isFirstInGroup ? 'mt-2.5' : 'mt-1'}`}>
        <div className="max-w-[85%] sm:max-w-[480px]">
          <div className={`group relative px-4 py-3 text-sm leading-relaxed bg-[rgba(255,255,255,0.06)] border border-white/10 text-[#ddd] ${roundedClass}`}>
            {isGroup && !isOutgoing && isFirstInGroup && msg.senderName && (
              <div className="text-[11px] text-[#7fa8ff] font-medium mb-1">{msg.senderName}</div>
            )}
            <div className="font-semibold text-[#eee] mb-2">📊 {msg.text}</div>
            <div className="flex flex-col gap-1.5">
              {(msg.attachments || []).slice(0, 1).map((a, i) => (
                <div key={i} className="text-xs text-muted-foreground">
                  {a.fileName ? `Tùy chọn: ${a.fileName}` : 'Xem chi tiết poll trên Zalo'}
                </div>
              ))}
            </div>
            <div className="text-[10px] text-[rgba(255,255,255,0.35)] mt-2 text-right">{formatTime(msg.timestamp)}</div>
            {reactionDock}
          </div>
        </div>
      </div>
    );
  }

  if (msg.kind === 'reaction') {
    return (
      <div className="flex justify-center my-1.5">
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/5 border border-white/5 text-[#9aa4b2]">{msg.text}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'} ${isFirstInGroup ? 'mt-2.5' : 'mt-0.5'}`}>
      <div className="max-w-[85%] sm:max-w-[500px]">
        {isGroup && !isOutgoing && isFirstInGroup && msg.senderName && (
          <div className="text-[11px] text-[#7fa8ff] font-medium mb-1 pl-1.5">{msg.senderName}</div>
        )}
        <div className={`group relative px-3.5 py-2.5 text-[14px] leading-relaxed break-words shadow-sm ${roundedClass} ${
          isOutgoing
            ? 'bg-[rgba(79,122,255,0.20)] border border-[rgba(79,122,255,0.30)] text-[#e8f0fe]'
            : 'bg-[rgba(255,255,255,0.06)] border border-white/8 text-[#e2e8f0]'
        }`}>
          {msg.quote && (
            <div className={`mb-2 rounded-xl border px-3 py-2 text-xs ${
              isOutgoing
                ? 'border-[rgba(159,192,255,0.25)] bg-[rgba(7,16,34,0.20)] text-[#d7e4ff]'
                : 'border-white/10 bg-black/20 text-[#d7dbe5]'
            }`}>
              <div className="font-semibold truncate">{quoteLabel}</div>
              <div className="mt-0.5 truncate opacity-80">{quoteText}</div>
            </div>
          )}

          {shouldRenderImage ? (
            <button type="button" className="cursor-pointer block w-full text-left overflow-hidden rounded-xl" onClick={() => onOpenLightbox?.(msg.id)} title="Xem ảnh lớn">
              <div className="min-h-[140px] max-w-[280px] bg-black/20 rounded-xl overflow-hidden flex items-center justify-center">
                <img src={imageUrl} alt={msg.text || 'Hình ảnh'} className="max-w-[280px] max-h-[320px] w-auto h-auto object-cover rounded-xl block transition-transform hover:scale-[1.02]" loading="lazy" />
              </div>
            </button>
          ) : shouldRenderVideo && att?.url ? (
            <div className="flex flex-col gap-2">
              <video className="max-w-[320px] w-full rounded-xl bg-black" controls preload="metadata">
                <source src={att.url} type={att.mimeType ?? 'video/mp4'} />
              </video>
              <div className="flex gap-3 flex-wrap mt-1">
                <a href={att.url} target="_blank" rel="noreferrer" className="text-xs text-[#9fc0ff] no-underline hover:underline">Mở video</a>
                <a href={att.url} download={att.fileName ?? 'video'} className="text-xs text-[#9fc0ff] no-underline hover:underline">Tải xuống</a>
              </div>
            </div>
          ) : shouldRenderFile && att ? (
            <div className="flex items-start gap-2.5 p-2.5 bg-black/20 rounded-xl border border-white/8">
              <span className="text-[26px] leading-none shrink-0">{fileIcon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-[#eee] font-medium truncate">
                  {hasAttachmentUrl ? (
                    <a href={att.url} target="_blank" rel="noreferrer" className="text-inherit no-underline hover:underline">
                      {fallbackFileLabel}
                    </a>
                  ) : (
                    fallbackFileLabel
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {att.mimeType && (
                    <span className="text-[10px] font-bold text-[#8cb1ff] bg-[rgba(79,122,255,0.15)] border border-[rgba(79,122,255,0.22)] rounded-full px-1.5 py-0.2">
                      {att.mimeType.split('/').pop()?.toUpperCase()}
                    </span>
                  )}
                  {att.size ? <div className="text-[11px] text-muted-foreground">{formatSize(att.size)}</div> : null}
                </div>
                {hasAttachmentUrl && (
                  <div className="flex gap-3 flex-wrap mt-1.5">
                    <a href={att.url} target="_blank" rel="noreferrer" className="text-xs text-[#9fc0ff] no-underline hover:underline">Xem file</a>
                    <a href={att.url} download={att.fileName ?? 'download'} className="text-xs text-[#9fc0ff] no-underline hover:underline">Tải xuống</a>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {showText && (
            <div className={`whitespace-pre-wrap ${att ? 'mt-2' : ''}`}>{msg.text}</div>
          )}

          {msg.reactions && msg.reactions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {msg.reactions.map((reaction) => (
                <span key={`${reaction.emoji}-${reaction.count}`} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] text-[#eef2ff]">
                  <span>{reaction.emoji}</span>
                  <span className="opacity-80">{reaction.count}</span>
                </span>
              ))}
            </div>
          )}

          <div className="text-[10px] text-[rgba(255,255,255,0.35)] mt-1 flex items-center justify-end gap-1 select-none">
            <span>{formatTime(msg.timestamp)}</span>
            {isOutgoing && (
              <span className="text-[11px] text-[#7fa8ff]" title="Đã gửi">✓</span>
            )}
          </div>
          {reactionDock}
        </div>
      </div>
    </div>
  );
});
