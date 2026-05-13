export type MessageKind = 'text' | 'image' | 'file' | 'video';
export type ConversationType = 'direct' | 'group';

export interface Attachment {
  id: string;
  type: MessageKind;
  url?: string;
  sourceUrl?: string;
  localPath?: string;
  thumbnailUrl?: string;
  thumbnailSourceUrl?: string;
  thumbnailLocalPath?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  threadId: string;
  conversationType: ConversationType;
  text: string;
  kind: MessageKind;
  attachments: Attachment[];
  direction: 'incoming' | 'outgoing';
  isSelf: boolean;
  timestamp: string;
  senderId?: string;
  senderName?: string;
  imageUrl?: string; // legacy
  rawMessageJson?: string;
}

export interface ConversationSummary {
  id: string;
  threadId: string;
  type: ConversationType;
  title: string;
  avatar?: string;
  lastMessageText: string;
  lastMessageKind: MessageKind;
  lastMessageTimestamp: string;
  lastDirection: 'incoming' | 'outgoing';
  messageCount: number;
}

export interface Contact {
  id: string;
  userId: string;
  displayName: string;
  avatar?: string;
}

export interface Group {
  id: string;
  groupId: string;
  displayName: string;
  avatar?: string;
  memberCount?: number;
}

export interface SessionStatus {
  hasCredential: boolean;
  sessionActive: boolean;
  loggedIn: boolean;
  loginInProgress: boolean;
  friendCacheCount: number;
  qrCodeAvailable: boolean;
  account?: { userId?: string; displayName?: string; phoneNumber?: string };
  listener?: { connected: boolean; started: boolean; lastError?: string };
}
