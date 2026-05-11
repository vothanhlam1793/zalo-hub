export type ZaloChannelStatus = 'draft' | 'qr_pending' | 'connected' | 'disconnected' | 'error' | 'disabled';

export interface StoredCredential {
  cookie: string;
  imei: string;
  userAgent: string;
}

export interface ZaloChannelRecord {
  channelId: string;
  workspaceId: string;
  name: string;
  status: ZaloChannelStatus;
  createdAt: string;
  updatedAt: string;
  qrCode?: string;
  lastError?: string;
  credential?: StoredCredential;
}

export interface ZaloFriendRecord {
  id: string;
  channelId: string;
  userId: string;
  displayName: string;
  zaloName?: string;
  avatar?: string;
  status?: string;
  phoneNumber?: string;
  lastSyncAt: string;
}

export interface ZaloServiceState {
  channels: ZaloChannelRecord[];
  friends: ZaloFriendRecord[];
}
