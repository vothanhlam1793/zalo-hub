export type MessageKind = 'text' | 'image' | 'file' | 'video';

export interface Attachment {
  id: string;
  type: MessageKind;
  url?: string;
  thumbnailUrl?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
}

export interface Message {
  id: string;
  friendId: string;
  text: string;
  kind: MessageKind;
  attachments: Attachment[];
  direction: 'incoming' | 'outgoing';
  isSelf: boolean;
  timestamp: string;
  imageUrl?: string; // legacy
}

export interface ConversationSummary {
  friendId: string;
  displayName?: string;
  lastMessageText: string;
  lastMessageKind: MessageKind;
  lastMessageTimestamp: string;
  lastDirection: 'incoming' | 'outgoing';
  messageCount: number;
}

export interface Friend {
  id: string;
  userId: string;
  displayName: string;
  avatar?: string;
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
