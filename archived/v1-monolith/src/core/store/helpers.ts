import type { GoldAttachment, GoldMessageKind } from '../types.js';

export type RawCredentialRow = {
  cookie_json: string;
  imei: string;
  user_agent: string;
  is_active: number;
};

export type RawFriendRow = {
  id: string;
  friend_id: string;
  display_name: string;
  zalo_name: string | null;
  zalo_alias: string | null;
  hub_alias: string | null;
  avatar: string | null;
  status: string | null;
  phone_number: string | null;
  last_sync_at: string;
};

export type RawGroupRow = {
  id: string;
  group_id: string;
  display_name: string;
  avatar: string | null;
  member_count: number | null;
  members_json: string | null;
  last_sync_at: string;
};

export type RawConversationRow = {
  id: string;
  thread_id: string;
  type: 'direct' | 'group';
  title: string | null;
  avatar: string | null;
  friend_id: string;
  display_name_snapshot: string | null;
  last_message_text: string;
  last_message_kind: string;
  last_direction: 'incoming' | 'outgoing';
  last_message_timestamp: string;
  message_count: number;
};

export type RawMessageRow = {
  id: string;
  conversation_id: string | null;
  thread_id: string | null;
  conversation_type: 'direct' | 'group' | null;
  friend_id: string;
  text: string;
  kind: string;
  image_url: string | null;
  direction: 'incoming' | 'outgoing';
  is_self: number;
  timestamp: string;
  sender_id: string | null;
  sender_name: string | null;
  provider_message_id: string | null;
  raw_message_json: string | null;
};

export type RawAttachmentRow = {
  id: string;
  message_id: string;
  type: string;
  url: string | null;
  source_url: string | null;
  local_path: string | null;
  thumbnail_url: string | null;
  thumbnail_source_url: string | null;
  thumbnail_local_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

export function resolveContactDisplayName(contact: {
  userId: string;
  hubAlias?: string | null;
  zaloAlias?: string | null;
  zaloName?: string | null;
  phoneNumber?: string | null;
}) {
  return contact.hubAlias?.trim()
    || contact.zaloAlias?.trim()
    || contact.zaloName?.trim()
    || contact.phoneNumber?.trim()
    || contact.userId;
}

export function nowIso() {
  return new Date().toISOString();
}

export function buildStoredMessageId(accountId: string, messageId: string) {
  return `${accountId}::${messageId}`;
}

export function buildStoredAttachmentId(accountId: string, attachmentId: string) {
  return `${accountId}::${attachmentId}`;
}

export function toMessageKind(raw: string): GoldMessageKind {
  if (raw === 'image' || raw === 'file' || raw === 'video' || raw === 'sticker' || raw === 'reaction' || raw === 'poll' || raw === 'voice' || raw === 'gif') return raw;
  return 'text';
}

export function looksLikeFileName(value: string) {
  return /\.(xlsx|xls|csv|doc|docx|pdf|zip|rar|7z|txt|ppt|pptx)$/i.test(value.trim());
}

export function guessKindFromAttachment(attachment: GoldAttachment | undefined): GoldMessageKind | undefined {
  if (!attachment) {
    return undefined;
  }

  if (attachment.type === 'image' || attachment.type === 'video' || attachment.type === 'file') {
    return attachment.type;
  }

  if (attachment.type === 'sticker' || attachment.type === 'gif' || attachment.type === 'voice') {
    return attachment.type;
  }

  const mimeType = (attachment.mimeType ?? '').toLowerCase();
  const fileName = (attachment.fileName ?? attachment.url ?? attachment.sourceUrl ?? '').toLowerCase();
  if (mimeType.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/.test(fileName)) return 'image';
  if (mimeType.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/.test(fileName)) return 'video';
  if (attachment.url || attachment.sourceUrl || looksLikeFileName(attachment.fileName ?? '')) return 'file';
  return undefined;
}

export function canonicalizeStoredMessage(row: RawMessageRow, currentAttachments: GoldAttachment[]) {
  const attachments = [...currentAttachments];
  const rowKind = toMessageKind(row.kind);

  if (rowKind === 'image' && attachments.length === 0 && row.image_url) {
    attachments.push({
      id: `legacy-${row.id}`,
      type: 'image',
      url: row.image_url,
      sourceUrl: row.image_url,
      thumbnailUrl: row.image_url,
      thumbnailSourceUrl: row.image_url,
    });
  }

  if (attachments.length === 0 && row.image_url && looksLikeFileName(row.text) && (rowKind === 'text' || rowKind === 'file')) {
    attachments.push({
      id: `legacy-file-${row.id}`,
      type: 'file',
      url: row.image_url,
      sourceUrl: row.image_url,
      fileName: row.text,
    });
  }

  const primaryAttachment = attachments[0];
  const inferredKind = guessKindFromAttachment(primaryAttachment) ?? rowKind;
  const canonicalKind = rowKind === 'text' && inferredKind !== 'text' ? inferredKind : (rowKind === 'file' && inferredKind !== 'text' ? inferredKind : rowKind);
  const canonicalText = canonicalKind === 'image'
    ? (row.text === '' || row.text === '[image]' ? '[image]' : row.text)
    : canonicalKind === 'video'
      ? (row.text === '' || row.text === '[video]' ? '[video]' : row.text)
      : row.text;

  if ((canonicalKind === 'file' || canonicalKind === 'video' || canonicalKind === 'image') && attachments.length === 0 && row.image_url) {
    attachments.push({
      id: `legacy-canonical-${row.id}`,
      type: canonicalKind,
      url: row.image_url,
      sourceUrl: row.image_url,
      thumbnailUrl: canonicalKind === 'image' ? row.image_url : undefined,
      thumbnailSourceUrl: canonicalKind === 'image' ? row.image_url : undefined,
      fileName: looksLikeFileName(row.text) ? row.text : undefined,
    });
  }

  return {
    kind: canonicalKind,
    text: canonicalText,
    attachments,
    imageUrl: canonicalKind === 'image'
      ? (attachments[0]?.url ?? row.image_url ?? undefined)
      : row.image_url ?? undefined,
  };
}

export function parseConversationId(conversationId: string) {
  if (conversationId.startsWith('group:')) {
    return { type: 'group' as const, threadId: conversationId.slice('group:'.length) };
  }

  if (conversationId.startsWith('direct:')) {
    return { type: 'direct' as const, threadId: conversationId.slice('direct:'.length) };
  }

  return { type: 'direct' as const, threadId: conversationId };
}
