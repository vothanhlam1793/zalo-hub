import type { MessageKind, MessagePresentation } from '@/types';

export const MESSAGE_LABELS: Record<MessageKind, string> = {
  text: 'Tin nhắn', image: 'Hình ảnh', file: 'Tệp đính kèm', video: 'Video',
  sticker: 'Nhãn dán', reaction: 'Cảm xúc', poll: 'Bình chọn', voice: 'Tin nhắn thoại',
  gif: 'Ảnh động', call: 'Cuộc gọi', system: 'Thông báo hệ thống', location: 'Vị trí',
  link: 'Liên kết', card: 'Thẻ thông tin', unknown: 'Tin nhắn chưa được hỗ trợ',
};

/** Suppress only known provider placeholders. Never interpret user text as JSON. */
export function messageCaption(message: { kind: MessageKind; text?: string }): string {
  const text = message.text ?? '';
  if (message.kind === 'text') return text;
  if (/^\[(?:image|file|video|sticker|reaction|poll|voice|gif|call|system|location|link|card|unknown)\]$/i.test(text.trim())
    || text.trim() === 'sendBubbleMessage' || text.trim() === 'EVENTS') return '';
  return text;
}

export function formatDuration(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function messagePreview(
  message: { kind: MessageKind; text: string; presentation?: MessagePresentation },
  options: { showMessagePreview?: boolean } = {},
): string {
  if (options.showMessagePreview === false) return 'Tin nhắn mới';
  const label = MESSAGE_LABELS[message.kind] ?? MESSAGE_LABELS.unknown;
  const caption = messageCaption(message).trim();
  if (message.kind === 'call') {
    const duration = formatDuration(message.presentation?.durationSeconds);
    return duration ? `${label} · ${duration}` : label;
  }
  return caption || label;
}
