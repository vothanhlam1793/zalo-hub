export type MessageKind = 'text' | 'image' | 'file' | 'video' | 'sticker' | 'reaction' | 'poll' | 'voice' | 'gif';
export type ConversationType = 'direct' | 'group';

export interface MessageQuote {
  messageId?: string;
  senderId?: string;
  senderName?: string;
  text?: string;
  kind?: MessageKind;
}

export interface MessageReactionItem {
  emoji: string;
  count: number;
  userIds?: string[];
}

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
  providerMessageId?: string;
  imageUrl?: string; // legacy
  quote?: MessageQuote;
  reactions?: MessageReactionItem[];
  rawMessageJson?: string;
  cliMsgId?: string;
}
export interface MessageReactionOption {
  emoji: string;
  icon: string;
}

export interface HistorySyncResult {
  conversationId: string;
  threadId: string;
  type: ConversationType;
  requestedBeforeMessageId?: string;
  remoteCount: number;
  insertedCount: number;
  dedupedCount: number;
  oldestTimestamp?: string;
  oldestProviderMessageId?: string;
  hasMore: boolean;
  timedOut?: boolean;
  batchCount?: number;
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
  zaloName?: string;
  zaloAlias?: string;
  hubAlias?: string;
  status?: string;
  phoneNumber?: string;
  avatar?: string;
}

export interface Group {
  id: string;
  groupId: string;
  displayName: string;
  avatar?: string;
  memberCount?: number;
}

export interface AccountSummary {
  accountId: string;
  hubAlias?: string;
  displayName?: string;
  phoneNumber?: string;
  avatar?: string;
  isActive?: boolean;
  hasCredential?: boolean;
  runtimeLoaded?: boolean;
  sessionActive?: boolean;
}

export interface SessionStatus {
  hasCredential: boolean;
  sessionActive: boolean;
  loggedIn: boolean;
  loginInProgress: boolean;
  friendCacheCount: number;
  qrCodeAvailable: boolean;
  account?: { userId?: string; displayName?: string; phoneNumber?: string; avatar?: string };
  listener?: { connected: boolean; started: boolean; lastError?: string };
}

export interface WsConversationSummariesPayload {
  accountId?: string;
  conversations: ConversationSummary[];
}

export interface WsSessionStatusPayload {
  accountId?: string;
  status: SessionStatus;
}

export interface WsConversationMessagePayload {
  accountId: string;
  message: Message;
}
