export interface GoldStoredCredential {
  cookie: string;
  imei: string;
  userAgent: string;
}

export type GoldConversationType = 'direct' | 'group';
export type GoldMessageKind = 'text' | 'image' | 'file' | 'video';

export interface GoldContactRecord {
  id: string;
  userId: string;
  displayName: string;
  zaloName?: string;
  avatar?: string;
  status?: string;
  phoneNumber?: string;
  lastSyncAt: string;
}

export interface GoldGroupRecord {
  id: string;
  groupId: string;
  displayName: string;
  avatar?: string;
  memberCount?: number;
  members?: GoldGroupMemberRecord[];
  lastSyncAt: string;
}

export interface GoldGroupMemberRecord {
  userId: string;
  displayName?: string;
  avatar?: string;
  role?: string;
}

export interface GoldAttachment {
  id: string;
  type: GoldMessageKind;
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
  duration?: number;
}

export interface GoldConversationMessage {
  id: string;
  conversationId: string;
  threadId: string;
  conversationType: GoldConversationType;
  text: string;
  kind: GoldMessageKind;
  attachments: GoldAttachment[];
  direction: 'incoming' | 'outgoing';
  isSelf: boolean;
  timestamp: string;
  senderId?: string;
  senderName?: string;
  providerMessageId?: string;
  imageUrl?: string;
  rawMessageJson?: string;
}

export interface GoldConversationSummary {
  id: string;
  threadId: string;
  type: GoldConversationType;
  title: string;
  avatar?: string;
  lastMessageText: string;
  lastMessageKind: GoldMessageKind;
  lastMessageTimestamp: string;
  lastDirection: 'incoming' | 'outgoing';
  messageCount: number;
}

export interface GoldState {
  credential?: GoldStoredCredential;
  friends: GoldContactRecord[];
  conversations?: Record<string, GoldConversationMessage[]>;
  updatedAt?: string;
}
