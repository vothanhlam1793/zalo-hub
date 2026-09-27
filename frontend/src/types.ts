export type MessageKind = 'text' | 'image' | 'file' | 'video' | 'sticker' | 'reaction' | 'poll' | 'voice' | 'gif' | 'call' | 'system' | 'location' | 'link' | 'card' | 'unknown';
export interface MessagePresentation {
  version: 1;
  durationSeconds?: number;
  url?: string;
  thumbnailUrl?: string;
  latitude?: number;
  longitude?: number;
  albumId?: string;
  albumIndex?: number;
  albumTotal?: number;
  unavailable?: boolean;
  stickerId?: number;
}
export type ConversationType = 'direct' | 'group';

export interface MessageMention {
  pos: number;
  len: number;
  uid: string;
  type?: number;
}

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
  /** Milliseconds, matching the backend attachment contract. */
  duration?: number;
}

export interface Message {
  composerBatchId?: string;
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
  senderAvatar?: string;
  providerMessageId?: string;
  imageUrl?: string; // legacy
  presentation?: MessagePresentation;
  quote?: MessageQuote;
  mentions?: MessageMention[];
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
  usageCount?: number;
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
  lastMessageSenderName?: string;
  memberAvatars?: string[];
  messageCount: number;
  unreadCount: number;
  lastReadAt?: string;
  isMuted?: boolean;
  muteUntil?: number | null;
  isPinned?: boolean;
  isRestricted?: boolean;
  restrictedBy?: string;
  restrictedAt?: string;
  labels?: TagItem[];
  notes?: string;
  notesUpdatedBy?: string;
  notesUpdatedAt?: string;
}

export interface UserSettings {
  desktopNotification: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  notifyGroupMessages: boolean;
  showMessagePreview: boolean;
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

export interface GroupMember {
  userId: string;
  displayName?: string;
  avatar?: string;
  role?: string;
}

export interface Group {
  id: string;
  groupId: string;
  displayName: string;
  avatar?: string;
  memberCount?: number;
  members?: GroupMember[];
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

export interface StorageDrive {
  id: string;
  name: string;
  provider: 'gdrive';
  accountEmail?: string;
  rootFolderId?: string;
  status: 'active' | 'disabled' | 'full' | 'error';
  assignedAccounts: string[];
  isDefault: boolean;
  quotaBytes?: number;
  usedBytes?: number;
  createdAt: string;
  updatedAt: string;
  credentials?: {
    clientId?: string;
    hasRefreshToken?: boolean;
  };
}

export interface StorageSettings {
  hotRetentionDays: number;
  autoOffloadEnabled: boolean;
  cronIntervalMinutes: number;
  defaultDriveStrategy: 'round_robin' | 'fill_first' | 'account_mapping';
}

export interface StorageStats {
  hotAttachmentsCount: number;
  coldAttachmentsCount: number;
  hotTotalBytes: number;
  coldTotalBytes: number;
  drivesCount: number;
}

export interface SyncProgressPayload {
  type: 'ws_sync_progress';
  accountId: string;
  step: 'connecting' | 'qr_ready' | 'waiting_phone_confirm' | 'receiving_chunks' | 'unpacking_db' | 'importing_postgres' | 'importing' | 'completed' | 'error';
  percent: number;
  current?: number;
  total?: number;
  message?: string;
  error?: string;
}
