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

export function cleanTechnicalId(id?: string) {
  if (!id) return '';
  return id.replace(/^(direct:|group:)/, '');
}

export function formatConversationTitle(title?: string, type?: 'direct' | 'group', threadId?: string) {
  const raw = (title || threadId || '').trim();
  const cleaned = cleanTechnicalId(raw);
  
  // If title is a real name (not just direct:xxx, group:xxx or purely numeric ID)
  if (raw && !raw.startsWith('direct:') && !raw.startsWith('group:') && !/^\d{10,}$/.test(raw)) {
    return raw;
  }

  // Purely numeric or direct/group ID
  const shortId = cleaned.length > 4 ? `..${cleaned.slice(-4)}` : cleaned;
  if (type === 'group' || raw.startsWith('group:')) {
    return `Nhóm Zalo (${shortId})`;
  }
  return `Khách Zalo (${shortId})`;
}

export function formatConversationSubtitle(params: {
  status?: string;
  phoneNumber?: string;
  memberCount?: number;
  type?: 'direct' | 'group';
  threadId?: string;
  conversationId?: string;
}) {
  const { status, phoneNumber, memberCount, type, threadId, conversationId } = params;
  if (phoneNumber?.trim()) return `📞 ${phoneNumber.trim()}`;
  if (status?.trim()) return status.trim();
  if (type === 'group' || conversationId?.startsWith('group:')) {
    return memberCount ? `👥 ${memberCount} thành viên` : '👥 Nhóm Zalo';
  }
  const clean = cleanTechnicalId(threadId || conversationId);
  if (clean && /^\d+$/.test(clean)) {
    return `👤 Khách Zalo (${clean.slice(-4)})`;
  }
  return '👤 Khách hàng cá nhân';
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
