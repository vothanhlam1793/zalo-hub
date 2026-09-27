import type { Attachment, Message } from '@/types';
import { isImageAttachment, safeMediaUrl } from '@/utils';

export function mediaKey(messageId: string, attachmentId: string, index: number) {
  return JSON.stringify([messageId, attachmentId, index]);
}

export function messageAttachments(message: Message): Attachment[] {
  if (message.attachments?.length) return message.attachments;
  if (!['image', 'video', 'voice', 'gif', 'sticker', 'file'].includes(message.kind)) return [];
  return [{ id: 'primary', type: message.kind, url: message.presentation?.url ?? message.imageUrl,
    thumbnailUrl: message.presentation?.thumbnailUrl }];
}

export function attachmentSource(message: Message, attachment: Attachment, index: number) {
  return safeMediaUrl(attachment.url, 'local-preview') ?? (index === 0 ? safeMediaUrl(message.presentation?.url) ?? safeMediaUrl(message.imageUrl) : undefined)
    ?? safeMediaUrl(attachment.sourceUrl)
    ?? (isImageAttachment({ kind: attachment.type }, attachment.fileName, attachment.mimeType)
      ? safeMediaUrl(attachment.thumbnailUrl) ?? (index === 0 ? safeMediaUrl(message.presentation?.thumbnailUrl) : undefined) : undefined);
}
