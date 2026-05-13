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

  return (
    <div className={`message-row ${dir}`}>
      <div className={`bubble ${dir}`}>
        {isGroup && dir === 'incoming' && msg.senderName && (
          <div style={{ fontSize: 12, color: '#667085', fontWeight: 600, marginBottom: 4 }}>{msg.senderName}</div>
        )}
        {shouldRenderImage ? (
          <img src={imageUrl} alt={msg.text || 'Hình ảnh'} />
        ) : shouldRenderVideo && att?.url ? (
          <div className="media-card">
            <video className="message-video" controls preload="metadata">
              <source src={att.url} type={att.mimeType ?? 'video/mp4'} />
            </video>
            <div className="attachment-actions">
              <a href={att.url} target="_blank" rel="noreferrer">Mở video</a>
              <a href={att.url} download={att.fileName ?? 'video'}>Tải xuống</a>
            </div>
          </div>
        ) : shouldRenderFile && att ? (
          <div className="file-attachment" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="file-icon">{fileIcon}</span>
            <div className="file-info">
              <div className="file-name">
                {hasAttachmentUrl ? (
                  <a href={att.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                    {fallbackFileLabel}
                  </a>
                ) : (
                  fallbackFileLabel
                )}
              </div>
              <div className="file-meta-row">
                {att.mimeType && <span className="file-chip">{att.mimeType.split('/').pop()?.toUpperCase()}</span>}
                {att.size && <div className="file-size">{formatSize(att.size)}</div>}
              </div>
              {hasAttachmentUrl && (
                <div className="attachment-actions">
                  <a href={att.url} target="_blank" rel="noreferrer">Xem file</a>
                  <a href={att.url} download={att.fileName ?? 'download'}>Tải xuống</a>
                </div>
              )}
            </div>
          </div>
        ) : null}
        {msg.text && msg.text !== '[image]' && msg.text !== '[file]' && msg.text !== '[video]' && (
          <div style={{ marginTop: (att && msg.text) ? 6 : 0 }}>{msg.text}</div>
        )}
        <div className="bubble-time">{formatTime(msg.timestamp)}</div>
      </div>
    </div>
  );
}
