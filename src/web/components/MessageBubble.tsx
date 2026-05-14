import { formatSize, formatTime, getFileIcon, isImageAttachment, isVideoAttachment } from '../utils';
import type { Message } from '../types';

export function MessageBubble({ msg, isGroup }: { msg: Message; isGroup: boolean }) {
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

  const showText = msg.text && msg.text !== '[image]' && msg.text !== '[file]' && msg.text !== '[video]' && !isSticker;

  if (isSticker) {
    return (
      <div className={`flex ${dir === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[160px]">
          {isGroup && dir === 'incoming' && msg.senderName && (
            <div className="text-xs text-[#667085] font-semibold mb-1">{msg.senderName}</div>
          )}
          <img src={imageUrl || att?.url} alt="Sticker" className="w-full h-auto block" />
          <div className="text-[10px] text-[rgba(255,255,255,0.25)] mt-0.5 text-right">{formatTime(msg.timestamp)}</div>
        </div>
      </div>
    );
  }

  if (msg.kind === 'poll') {
    return (
      <div className={`flex ${dir === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[72%] max-w-[480px] px-[14px] py-[10px] rounded-2xl text-sm leading-relaxed bg-[rgba(255,255,255,0.07)] border border-[rgba(255,255,255,0.1)] text-[#ddd] rounded-bl">
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
    <div className={`flex ${dir === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[72%] max-w-[480px] px-[14px] py-[10px] rounded-2xl text-sm leading-relaxed break-words ${
        dir === 'outgoing'
          ? 'bg-[rgba(79,122,255,0.22)] border border-[rgba(79,122,255,0.35)] text-[#dde8ff] rounded-br'
          : 'bg-[rgba(255,255,255,0.07)] border border-[rgba(255,255,255,0.1)] text-[#ddd] rounded-bl'
      }`}>
        {isGroup && dir === 'incoming' && msg.senderName && (
          <div className="text-xs text-[#667085] font-semibold mb-1">{msg.senderName}</div>
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
        <div className="text-[11px] text-[rgba(255,255,255,0.35)] mt-1 text-right">{formatTime(msg.timestamp)}</div>
      </div>
    </div>
  );
}
