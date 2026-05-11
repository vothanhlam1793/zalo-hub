export type ZaloAccountStatus = 'disconnected' | 'qr_pending' | 'connected' | 'error';

export interface StoredCredential {
  cookie: string;
  imei: string;
  userAgent: string;
}

export interface AccountRecord {
  id: string;
  name: string;
  status: ZaloAccountStatus;
  createdAt: string;
  updatedAt: string;
  qrCode?: string;
  credential?: StoredCredential;
  lastError?: string;
}

export interface ConversationRecord {
  id: string;
  accountId: string;
  threadId: string;
  threadType: 'user' | 'group';
  title: string;
  subtitle?: string;
  avatar?: string;
  unreadCount: number;
  updatedAt: string;
}

export interface MessageRecord {
  id: string;
  accountId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
  direction: 'in' | 'out';
}

export interface AgentWorkspaceRecord {
  accountId: string;
  enabled: boolean;
  systemPrompt: string;
  notes: string[];
}

export interface FriendRecord {
  id: string;
  accountId: string;
  userId: string;
  displayName: string;
  zaloName?: string;
  avatar?: string;
  status?: string;
  phoneNumber?: string;
  lastSyncAt: string;
}

export interface AppState {
  accounts: AccountRecord[];
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  agents: AgentWorkspaceRecord[];
  friends: FriendRecord[];
}
