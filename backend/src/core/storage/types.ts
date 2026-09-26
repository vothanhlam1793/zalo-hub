export interface StorageDriveRecord {
  id: string;
  name: string;
  provider: 'gdrive';
  accountEmail?: string;
  credentials: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    accessToken?: string;
    tokenExpiry?: number;
    serviceAccountKey?: string;
  };
  rootFolderId?: string;
  status: 'active' | 'disabled' | 'full' | 'error';
  assignedAccounts: string[];
  isDefault: boolean;
  quotaBytes?: number;
  usedBytes?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StorageSettings {
  hotRetentionDays: number;
  autoOffloadEnabled: boolean;
  cronIntervalMinutes: number;
  defaultDriveStrategy: 'round_robin' | 'fill_first' | 'account_mapping';
}

export interface OffloadCandidate {
  id: string;
  messageId: string;
  accountId: string;
  type: string;
  url?: string;
  localPath: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  createdAt: string;
}

export interface OffloadResult {
  totalScanned: number;
  totalOffloaded: number;
  totalFailed: number;
  bytesSaved: number;
  errors: Array<{ attachmentId: string; message: string }>;
}

export interface StorageStats {
  hotAttachmentsCount: number;
  coldAttachmentsCount: number;
  hotTotalBytes: number;
  coldTotalBytes: number;
  drivesCount: number;
}
