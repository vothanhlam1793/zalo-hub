import { formatSize, formatTime, getFileIcon, isImageAttachment, isVideoAttachment } from '../utils';
import type { Message, MessageReactionOption } from '../types';

const REACTION_OPTIONS: MessageReactionOption[] = [
  { emoji: '❤️', icon: '/-heart' },
  { emoji: '👍', icon: '/-strong' },
  { emoji: '😆', icon: ':>' },
  { emoji: '😮', icon: ':o' },
  { emoji: '😢', icon: ':-((' },
  { emoji: '😡', icon: ':-h' },
];

export function MessageBubble({ msg, isGroup, onReact }: { msg: Message; isGroup: boolean; onReact?: (message: Message, reaction: MessageReactionOption) => void }) {
  const dir = msg.direction;
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
    <div className={`flex items-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 ${dir === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
      <div className="group/reaction relative flex items-center">
        <button
          type="button"
          className="h-6 w-6 rounded-full text-[13px] text-[rgba(255,255,255,0.20)] transition hover:text-[rgba(255,255,255,0.55)] hover:bg-white/5 focus-visible:text-[rgba(255,255,255,0.55)] focus-visible:outline-none"
          onClick={() => onReact?.(msg, defaultReaction)}
          title="Thả thích"
        >
          👍
        </button>
        <div className={`pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-0 transition-all duration-150 group-hover/reaction:pointer-events-auto group-hover/reaction:opacity-100 group-focus-within/reaction:pointer-events-auto group-focus-within/reaction:opacity-100 ${dir === 'outgoing' ? 'right-full mr-2' : 'left-full ml-2'}`}>
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[rgba(8,12,18,0.92)] px-1.5 py-1 shadow-lg backdrop-blur-sm">
            {REACTION_OPTIONS.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                className="h-7 w-7 rounded-full text-sm hover:bg-white/10"
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

  if (isSticker) {
    return (
      <div className={`group flex flex-col ${dir === 'outgoing' ? 'items-end' : 'items-start'}`}>
        <div className="max-w-[160px]">
          {isGroup && dir === 'incoming' && msg.senderName && (
            <div className="text-xs text-[#667085] font-semibold mb-1">{msg.senderName}</div>
          )}
          <img src={imageUrl || att?.url} alt="Sticker" className="w-full h-auto block" />
          <div className="text-[10px] text-[rgba(255,255,255,0.25)] mt-0.5 text-right">{formatTime(msg.timestamp)}</div>
        </div>
        {reactionDock}
      </div>
    );
  }

  if (msg.kind === 'poll') {
    return (
      <div className={`group flex flex-col ${dir === 'outgoing' ? 'items-end' : 'items-start'}`}>
        <div className="max-w-[72%] max-w-[480px]">
          <div className="px-[14px] py-[10px] rounded-2xl text-sm leading-relaxed bg-[rgba(255,255,255,0.07)] border border-[rgba(255,255,255,0.1)] text-[#ddd] rounded-bl">
          {isGroup && dir === 'incoming' && msg.senderName && (
            <div className="text-xs text-[#667085] font-semibold mb-1">{msg.senderName}</div>
          )}
          <div className="font-semibold text-[#eee] mb-2">📊 {msg.text}</div>
          <div className="flex flex-col gap-1.5">
            {(msg.attachments || []).slice(0, 1).map((a, i) => (
              <div key={i} className="text-xs text-muted-foreground">
                {a.fileName ? `Tùy chọn: ${a.fileName}` : 'Xem chi tiết poll trên Zalo'}
              </div>
            ))}
          </div>
          <div className="text-[11px] text-[rgba(255,255,255,0.35)] mt-2 text-right">{formatTime(msg.timestamp)}</div>
          </div>
        </div>
        {reactionDock}
      </div>
    );
  }

  if (msg.kind === 'reaction') {
    return (
      <div className="flex justify-center">
        <span className="text-sm px-2 py-0.5 rounded-full bg-white/5 text-[#ccc]">{msg.text}</span>
      </div>
    );
  }

  return (
    <div className={`group flex flex-col ${dir === 'outgoing' ? 'items-end' : 'items-start'}`}>
      <div className="max-w-[72%] max-w-[480px]">
        <div className={`px-[14px] py-[10px] rounded-2xl text-sm leading-relaxed break-words ${
        dir === 'outgoing'
          ? 'bg-[rgba(79,122,255,0.22)] border border-[rgba(79,122,255,0.35)] text-[#dde8ff] rounded-br'
          : 'bg-[rgba(255,255,255,0.07)] border border-[rgba(255,255,255,0.1)] text-[#ddd] rounded-bl'
      }`}>
        {isGroup && dir === 'incoming' && msg.senderName && (
          <div className="text-xs text-[#667085] font-semibold mb-1">{msg.senderName}</div>
        )}
        {msg.quote && (
          <div className={`mb-2 rounded-xl border px-3 py-2 text-xs ${
            dir === 'outgoing'
              ? 'border-[rgba(159,192,255,0.25)] bg-[rgba(7,16,34,0.16)] text-[#d7e4ff]'
              : 'border-white/8 bg-black/15 text-[#d7dbe5]'
          }`}>
            <div className="font-semibold truncate">{quoteLabel}</div>
            <div className="mt-0.5 truncate opacity-80">{quoteText}</div>
          </div>
        )}
        {shouldRenderImage ? (
          <img src={imageUrl} alt={msg.text || 'Hình ảnh'} className="max-w-[240px] rounded-[10px] block" />
        ) : shouldRenderVideo && att?.url ? (
          <div className="flex flex-col gap-2">
            <video className="max-w-[320px] w-full rounded-xl bg-black" controls preload="metadata">
              <source src={att.url} type={att.mimeType ?? 'video/mp4'} />
            </video>
            <div className="flex gap-3 flex-wrap mt-1.5">
              <a href={att.url} target="_blank" rel="noreferrer" className="text-xs text-[#9fc0ff] no-underline hover:underline">Mở video</a>
              <a href={att.url} download={att.fileName ?? 'video'} className="text-xs text-[#9fc0ff] no-underline hover:underline">Tải xuống</a>
            </div>
          </div>
        ) : shouldRenderFile && att ? (
          <div className="flex items-start gap-2.5 p-2 bg-white/5 rounded-[10px] border border-white/8">
            <span className="text-[28px] leading-none">{fileIcon}</span>
            <div>
              <div className="text-[13px] text-[#ddd] font-medium">
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
                  <span className="text-[10px] font-bold text-[#8cb1ff] bg-[rgba(79,122,255,0.15)] border border-[rgba(79,122,255,0.22)] rounded-full px-1.5 py-0.5">
                    {att.mimeType.split('/').pop()?.toUpperCase()}
                  </span>
                )}
                {att.size && <div className="text-[11px] text-[#666]">{formatSize(att.size)}</div>}
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
          <div className={att ? 'mt-1.5' : ''}>{msg.text}</div>
        )}
        {msg.reactions && msg.reactions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.reactions.map((reaction) => (
              <span key={`${reaction.emoji}-${reaction.count}`} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/15 px-2 py-0.5 text-xs text-[#eef2ff]">
                <span>{reaction.emoji}</span>
                <span className="text-[11px] opacity-80">{reaction.count}</span>
              </span>
            ))}
          </div>
        )}
        <div className="text-[11px] text-[rgba(255,255,255,0.35)] mt-1 text-right">{formatTime(msg.timestamp)}</div>
        </div>
      </div>
      {reactionDock}
    </div>
  );
}
