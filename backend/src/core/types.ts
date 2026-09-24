export interface GoldStoredCredential {
  cookie: string;
  imei: string;
  userAgent: string;
}

export interface GoldAccountRecord {
  accountId: string;
  hubAlias?: string;
  displayName?: string;
  phoneNumber?: string;
  avatar?: string;
  isActive?: boolean;
}

export type GoldConversationType = 'direct' | 'group';
export type GoldMessageKind = 'text' | 'image' | 'file' | 'video' | 'sticker' | 'reaction' | 'poll' | 'voice' | 'gif';

export interface GoldMessageQuote {
  messageId?: string;
  senderId?: string;
  senderName?: string;
  text?: string;
  kind?: GoldMessageKind;
}

export interface GoldMessageReactionItem {
  emoji: string;
  count: number;
  userIds?: string[];
}

export interface GoldContactRecord {
  id: string;
  userId: string;
  displayName: string;
  zaloName?: string;
  zaloAlias?: string;
  hubAlias?: string;
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
  quote?: GoldMessageQuote;
  reactions?: GoldMessageReactionItem[];
  rawMessageJson?: string;
  cliMsgId?: string;
  clientRequestId?: string;
}

/** sent means provider acceptance, not recipient delivery/read. */
export interface SendReceipt {
  clientRequestId: string;
  accountId: string;
  conversationId: string;
  status: 'sending' | 'sent' | 'failed' | 'unknown';
  messages: GoldConversationMessage[];
  providerMessageIds: string[];
  acceptedAt?: string;
  error?: { code: string; message: string; retryable: boolean };
}

export interface GoldConversationSummary {
  id: string;
  accountId: string;
  threadId: string;
  type: GoldConversationType;
  title: string;
  avatar?: string;
  lastMessageText: string;
  lastMessageKind: GoldMessageKind;
  lastMessageTimestamp: string;
  lastDirection: 'incoming' | 'outgoing';
  messageCount: number;
  unreadCount: number;
  lastReadAt?: string;
  labels?: GoldTagItem[];
  notes?: string;
  notesUpdatedBy?: string;
  notesUpdatedAt?: string;
}

export type GoldTagSource = 'zalo' | 'system' | 'ai';

export interface GoldTagItem {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  source: GoldTagSource;
  zaloLabelId?: number;
  accountId?: string;
  usageCount?: number;
}

export interface GoldState {
  credential?: GoldStoredCredential;
  friends: GoldContactRecord[];
  conversations?: Record<string, GoldConversationMessage[]>;
  updatedAt?: string;
}
