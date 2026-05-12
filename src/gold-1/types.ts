export interface GoldStoredCredential {
  cookie: string;
  imei: string;
  userAgent: string;
}

export interface GoldFriendRecord {
  id: string;
  userId: string;
  displayName: string;
  zaloName?: string;
  avatar?: string;
  status?: string;
  phoneNumber?: string;
  lastSyncAt: string;
}

export type GoldMessageKind = 'text' | 'image' | 'file' | 'video';

export interface GoldAttachment {
  id: string;
  type: GoldMessageKind;
  url?: string;
  thumbnailUrl?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
}

export interface GoldConversationMessage {
  id: string;
  friendId: string;
  text: string;
  kind: GoldMessageKind;
  attachments: GoldAttachment[];
  direction: 'incoming' | 'outgoing';
  isSelf: boolean;
  timestamp: string;
  // legacy compat - được giữ để hydrate từ DB cũ
  imageUrl?: string;
}

export interface GoldConversationSummary {
  friendId: string;
  displayName?: string;
  lastMessageText: string;
  lastMessageKind: GoldMessageKind;
  lastMessageTimestamp: string;
  lastDirection: 'incoming' | 'outgoing';
  messageCount: number;
}

export interface GoldState {
  credential?: GoldStoredCredential;
  friends: GoldFriendRecord[];
  conversations?: Record<string, GoldConversationMessage[]>;
  updatedAt?: string;
}
