import type { AccountSummary, Contact, Message } from './types';

export function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function formatSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function getInitial(name: string) {
  return (name ?? '?').charAt(0).toUpperCase();
}

export function getContactDisplayName(contact: Pick<Contact, 'displayName' | 'hubAlias' | 'zaloAlias' | 'zaloName' | 'phoneNumber' | 'userId'>) {
  return contact.hubAlias?.trim()
    || contact.zaloAlias?.trim()
    || contact.zaloName?.trim()
    || contact.phoneNumber?.trim()
    || contact.displayName?.trim()
    || contact.userId;
}

export function getAccountDisplayName(account: Pick<AccountSummary, 'hubAlias' | 'displayName' | 'phoneNumber' | 'accountId'>) {
  return account.hubAlias?.trim()
    || account.displayName?.trim()
    || account.phoneNumber?.trim()
    || account.accountId;
}

export function directConversationId(contactId: string) {
  return `direct:${contactId}`;
}

export function groupConversationId(groupId: string) {
  return `group:${groupId}`;
}

export function getFileIcon(msg: Message, fileName?: string, mimeType?: string) {
  const lowerName = (fileName ?? '').toLowerCase();
  const lowerMime = (mimeType ?? '').toLowerCase();

  if (msg.kind === 'video' || lowerMime.startsWith('video/')) return '🎬';
  if (lowerMime.includes('pdf') || lowerName.endsWith('.pdf')) return '📕';
  if (lowerMime.includes('sheet') || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) return '📊';
  if (lowerMime.includes('word') || lowerName.endsWith('.doc') || lowerName.endsWith('.docx') || lowerName.endsWith('.txt')) return '📄';
  if (lowerName.endsWith('.zip') || lowerName.endsWith('.rar') || lowerName.endsWith('.7z')) return '🗜️';
  if (lowerMime.startsWith('image/')) return '🖼️';
  return '📎';
}

export function isVideoAttachment(msg: Message, fileName?: string, mimeType?: string) {
  const lowerName = (fileName ?? '').toLowerCase();
  const lowerMime = (mimeType ?? '').toLowerCase();
  return msg.kind === 'video' || lowerMime.startsWith('video/') || lowerName.endsWith('.mp4') || lowerName.endsWith('.mov') || lowerName.endsWith('.webm');
}

export function isImageAttachment(msg: Message, fileName?: string, mimeType?: string) {
  const lowerName = (fileName ?? '').toLowerCase();
  const lowerMime = (mimeType ?? '').toLowerCase();
  return msg.kind === 'image' || lowerMime.startsWith('image/') || lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.gif') || lowerName.endsWith('.webp');
}
