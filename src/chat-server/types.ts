export interface WorkspaceRecord {
  id: string;
  name: string;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceUserRecord {
  id: string;
  workspaceId: string;
  displayName: string;
  email: string;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface ChannelRecord {
  id: string;
  workspaceId: string;
  name: string;
  provider: 'local';
  status: 'active' | 'disabled' | 'qr_pending' | 'connected' | 'error';
  qrCode?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactRecord {
  id: string;
  workspaceId: string;
  channelId: string;
  displayName: string;
  externalContactId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecord {
  id: string;
  workspaceId: string;
  channelId: string;
  contactId: string;
  title: string;
  status: 'open' | 'resolved';
  createdAt: string;
  updatedAt: string;
}

export interface MessageRecord {
  id: string;
  workspaceId: string;
  channelId: string;
  conversationId: string;
  senderType: 'contact' | 'workspace_user' | 'system';
  senderRefId: string;
  senderName: string;
  text: string;
  direction: 'inbound' | 'outbound';
  createdAt: string;
}

export interface ChatAppState {
  workspaces: WorkspaceRecord[];
  users: WorkspaceUserRecord[];
  channels: ChannelRecord[];
  contacts: ContactRecord[];
  conversations: ConversationRecord[];
  messages: MessageRecord[];
}
