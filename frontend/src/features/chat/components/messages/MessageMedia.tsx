import React, { useEffect, useRef, useState } from 'react';
import type { Attachment, Message } from '@/types';
import { formatSize, isImageAttachment, isVideoAttachment, safeMediaUrl } from '@/utils';
import { formatDuration, MESSAGE_LABELS } from '../../model/message-preview';
import { mediaKey, messageAttachments, attachmentSource } from '../../model/message-media';
export { mediaKey, messageAttachments, attachmentSource } from '../../model/message-media';

let activeAudio: HTMLMediaElement | undefined;
export function claimAudio(audio: HTMLMediaElement) {
  if (activeAudio && activeAudio !== audio) activeAudio.pause();
  activeAudio = audio;
}
export function releaseAudio(audio: HTMLMediaElement) {
  audio.pause();
  if (activeAudio === audio) activeAudio = undefined;
}

export function MediaFallback({ label }: { label: string }) {
  return <div role="status" className="rounded-lg border border-current/20 p-3 text-xs">{label} không khả dụng. Nguồn có thể đã hết hạn hoặc định dạng không được hỗ trợ.</div>;
}

export function SafeImage({ src, alt, className, source = 'provider' }: { src?: string; alt: string; className?: string; source?: 'provider' | 'local-preview' }) {
  const [failedSource, setFailedSource] = useState<string>();
  const safe = safeMediaUrl(src, source);
  if (!safe || failedSource === safe) return <MediaFallback label={alt} />;
  return <img src={safe} alt={alt} loading="lazy" className={className} onError={() => setFailedSource(safe)} />;
}

function MediaAttachment({ message, attachment, index, onOpenLightbox }: {
  message: Message; attachment: Attachment; index: number; onOpenLightbox?: (key: string) => void;
}) {
  const src = attachmentSource(message, attachment, index);
  const [failedSource, setFailedSource] = useState<string>();
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = audioRef.current;
    return () => { if (audio) releaseAudio(audio); };
  }, [src]);
  const kind = attachment.type;
  const label = MESSAGE_LABELS[kind] ?? 'Tệp đính kèm';
  const duration = formatDuration(attachment.duration === undefined
    ? (index === 0 ? message.presentation?.durationSeconds : undefined) : attachment.duration / 1000);
  const poster = safeMediaUrl(attachment.thumbnailUrl) ?? (index === 0 ? safeMediaUrl(message.presentation?.thumbnailUrl) : undefined);
  const video = isVideoAttachment({ kind }, attachment.fileName, attachment.mimeType);
  const image = isImageAttachment({ kind }, attachment.fileName, attachment.mimeType);
  const voice = kind === 'voice' || attachment.mimeType?.startsWith('audio/');
  if (!src) return <MediaFallback label={label} />;
  return <div className="my-1 min-w-0 max-w-full space-y-1.5">
    {failedSource === src ? <MediaFallback label={label} /> : voice ? <>
      <div className="text-xs font-medium">Tin nhắn thoại{duration && ` · ${duration}`}</div>
      <audio ref={audioRef} aria-label="Phát tin nhắn thoại" controls preload="none" src={src}
        className="w-full max-w-[320px]" onPlay={event => claimAudio(event.currentTarget)} onError={event => { releaseAudio(event.currentTarget); setFailedSource(src); }} />
    </> : video ? <>
      <video aria-label={kind === 'gif' ? 'Ảnh động' : 'Video'} src={src} poster={poster} controls playsInline preload="none"
        className="max-w-[320px] w-full max-h-[360px] rounded-xl bg-black" onError={() => setFailedSource(src)} />
      {duration && <div className="text-xs">Thời lượng: {duration}</div>}
    </> : image ? (onOpenLightbox && kind !== 'sticker' ?
      <button type="button" className="block max-w-full rounded-xl focus-visible:outline-2" title="Xem ảnh lớn"
        onClick={() => onOpenLightbox(mediaKey(message.id, attachment.id, index))}>
        <SafeImage src={src} source="local-preview" alt={label} className="max-w-full max-h-[320px] rounded-xl object-contain" />
      </button> : <SafeImage src={src} source="local-preview" alt={label} className="max-w-full max-h-[240px] rounded-xl object-contain" />)
      : <div className="rounded-lg border border-current/20 p-3 text-sm break-all">📎 {attachment.fileName || label}{attachment.size ? ` · ${formatSize(attachment.size)}` : ''}</div>}
    {(!image || failedSource === src) && <a href={src} target="_blank" rel="noopener noreferrer" className="inline-block text-xs underline">
      Mở / tải {attachment.fileName || label.toLowerCase()}
    </a>}
  </div>;
}

export function MessageMedia({ message, onOpenLightbox }: { message: Message; onOpenLightbox?: (key: string) => void }) {
  return <>{messageAttachments(message).map((attachment, index) =>
    <MediaAttachment key={mediaKey(message.id, attachment.id, index)} message={message} attachment={attachment} index={index} onOpenLightbox={onOpenLightbox} />)}</>;
}
