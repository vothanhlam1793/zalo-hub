import type { Attachment, Message } from '@/types';
import { isImageAttachment } from '@/utils';
import { messageAttachments, mediaKey } from './message-media';

export interface AlbumMedia { message: Message; attachment: Attachment; index: number; key: string }
export interface AlbumRow {
  key: string;
  messages: Message[];
  media: AlbumMedia[];
  album: boolean;
  total?: number;
}

function imageOnly(message: Message) {
  const attachments = messageAttachments(message);
  return attachments.length > 0 && attachments.every(a => a.type !== 'sticker' && isImageAttachment({ kind: a.type }, a.fileName, a.mimeType));
}

function namespace(message: Message, accountId: string): string | undefined {
  const date = new Date(message.timestamp);
  if (!accountId || !message.senderId?.trim() || !message.presentation?.albumId?.trim()
    || !Number.isFinite(date.getTime()) || !imageOnly(message)) return;
  return JSON.stringify([accountId, message.conversationId, message.senderId, message.direction,
    message.isSelf, message.presentation.albumId, date.toDateString()]);
}

/** Only contiguous verified albums. No proximity/name matching, no movement across a boundary.
 * SDK zalo-api-final/dist/apis/sendMessage.js:247,279 assigns N-1 then decrements.
 * Descending canonical indices restore SDK attachment order. Incomplete/duplicate indices
 * cannot establish a total order: retain input order for the entire run instead.
 */
export function selectAlbumRows(messages: readonly Message[], accountId: string): AlbumRow[] {
  const rows: AlbumRow[] = [];
  let previousNamespace: string | undefined;
  for (const message of messages) {
    const scope = namespace(message, accountId);
    if (scope && scope === previousNamespace) rows[rows.length - 1].messages.push(message);
    else rows.push({ key: JSON.stringify([accountId, message.conversationId, message.localId || message.id]), messages: [message], media: [], album: false });
    previousNamespace = scope;
  }
  for (const row of rows) {
    const seen = new Set<string>();
    const unique = row.messages.filter(message => {
      const identity = message.providerMessageId ? `provider:${message.providerMessageId}` : `stored:${message.id}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
    const indices = unique.map(m => m.presentation?.albumIndex);
    const ordered = indices.every(n => Number.isSafeInteger(n) && n! >= 0) && new Set(indices).size === indices.length
      ? [...unique].sort((a, b) => b.presentation!.albumIndex! - a.presentation!.albumIndex!) : unique;
    row.media = ordered.flatMap(message => messageAttachments(message).map((attachment, index) => ({
      message, attachment, index, key: mediaKey(message.id, attachment.id, index),
    })));
    row.album = imageOnly(row.messages[0]) && (row.media.length > 1 || Boolean(namespace(row.messages[0], accountId)));
    const totals = unique.map(m => m.presentation?.albumTotal).filter((n): n is number => Number.isSafeInteger(n) && n! > 0);
    if (totals.length && new Set(totals).size === 1 && totals[0] >= row.media.length) row.total = totals[0];
  }
  return rows;
}
