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

export interface GoldConversationMessage {
  id: string;
  friendId: string;
  text: string;
  kind?: 'text' | 'image';
  imageUrl?: string;
  direction: 'incoming' | 'outgoing';
  isSelf: boolean;
  timestamp: string;
}

export interface GoldState {
  credential?: GoldStoredCredential;
  friends: GoldFriendRecord[];
  updatedAt?: string;
}
