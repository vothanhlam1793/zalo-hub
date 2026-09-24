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
  /** Browser identity survives HTTP/WS acknowledgement. Never a provider ID. */
  localId?: string;
  clientRequestId?: string;
  delivery?: 'queued' | 'sending' | 'sent' | 'failed' | 'unknown';
  errorCode?: string;
  errorText?: string;
  retryable?: boolean;
  attachmentNeedsReselect?: boolean;
  localFile?: { name: string; size: number; type: string; lastModified: number };
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
export interface SendReceipt {
  clientRequestId: string;
  accountId: string;
  conversationId: string;
  status: 'sending' | 'sent' | 'failed' | 'unknown';
  messages: Message[];
  providerMessageIds: string[];
  acceptedAt?: string;
  error?: { code: string; message: string; retryable: boolean };
}
export interface SendResponse {
  method?: string;
  result?: unknown;
  kind?: string;
  receipt?: SendReceipt;
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

export interface TagItem {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  source: 'zalo' | 'system' | 'ai';
  zaloLabelId?: number;
  accountId?: string;
}

export interface ConversationSummary {
  id: string;
  accountId: string;
  threadId: string;
  type: ConversationType;
  title: string;
  avatar?: string;
  lastMessageText: string;
  lastMessageKind: MessageKind;
  lastMessageTimestamp: string;
  lastDirection: 'incoming' | 'outgoing';
  messageCount: number;
  unreadCount: number;
  lastReadAt?: string;
  labels?: TagItem[];
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
