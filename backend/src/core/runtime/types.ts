import type { GoldConversationMessage, GoldConversationType, GoldGroupMemberRecord, GoldMessageKind, GoldAttachment } from '../types.js';
import type { GoldStore } from '../store.js';
import type { GoldLogger } from '../logger.js';
import type { GoldMediaStore } from '../media-store.js';

export type CookieShape = {
  key?: string;
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  expires?: string;
  maxAge?: number;
};

export type ActiveSession = {
  zalo: any;
  api?: any;
};

export type GoldAccountInfo = {
  userId?: string;
  displayName?: string;
  phoneNumber?: string;
  avatar?: string;
};

export type ListenerMessage = {
  type?: number;
  threadId?: string;
  isSelf?: boolean;
  data?: Record<string, unknown>;
};

export type ListenerLike = {
  on: (event: string, handler: (...args: any[]) => void) => void;
  start: (options?: { retryOnClose?: boolean }) => void;
  requestOldMessages?: (threadType: number, lastMsgId?: string | null) => void;
  stop?: () => void;
};

export type ListenerState = {
  attached: boolean;
  started: boolean;
  connected: boolean;
  startAttempts: number;
  lastEventAt?: string;
  lastMessageAt?: string;
  lastError?: string;
  lastCloseCode?: string;
  closeCount: number;
  closeWindowStart: number;
  needsRelogin: boolean;
};

export type ConversationListener = (message: GoldConversationMessage) => void;

export type HistorySyncState = {
  conversationId: string;
  threadId: string;
  type: GoldConversationType;
  beforeMessageId?: string;
  requestedAt: number;
  resolve: (result: HistorySyncResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type HistorySyncResult = {
  conversationId: string;
  threadId: string;
  type: GoldConversationType;
  requestedBeforeMessageId?: string;
  remoteCount: number;
  insertedCount: number;
  dedupedCount: number;
  oldestTimestamp?: string;
  oldestProviderMessageId?: string;
  hasMore: boolean;
  timedOut?: boolean;
  batchCount?: number;
};

export interface SharedState {
  store: GoldStore;
  logger: GoldLogger;
  mediaStore: GoldMediaStore;
  boundAccountId: string | undefined;
  session: ActiveSession | undefined;
  currentQrCode: string | undefined;
  currentAccount: GoldAccountInfo | undefined;
  conversations: Map<string, GoldConversationMessage[]>;
  seenMessageKeys: Set<string>;
  conversationListeners: Set<ConversationListener>;
  listenerStarted: boolean;
  listenerAttached: boolean;
  listenerState: ListenerState;
  historySyncState: HistorySyncState | undefined;
  pendingHistorySyncs: Map<string, Promise<HistorySyncResult>>;
  cipherKey: string | undefined;
}
