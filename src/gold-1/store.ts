import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import type {
  GoldAttachment,
  GoldConversationMessage,
  GoldConversationSummary,
  GoldFriendRecord,
  GoldMessageKind,
  GoldStoredCredential,
} from './types.js';

type AccountRecord = {
  accountId: string;
  displayName?: string;
  phoneNumber?: string;
};

type RawCredentialRow = {
  cookie_json: string;
  imei: string;
  user_agent: string;
  is_active: number;
};

type RawFriendRow = {
  id: string;
  friend_id: string;
  display_name: string;
  zalo_name: string | null;
  avatar: string | null;
  status: string | null;
  phone_number: string | null;
  last_sync_at: string;
};

type RawConversationRow = {
  friend_id: string;
  display_name_snapshot: string | null;
  last_message_text: string;
  last_message_kind: string;
  last_direction: 'incoming' | 'outgoing';
  last_message_timestamp: string;
  message_count: number;
};

type RawMessageRow = {
  id: string;
  friend_id: string;
  text: string;
  kind: string;
  image_url: string | null;
  direction: 'incoming' | 'outgoing';
  is_self: number;
  timestamp: string;
};

type RawAttachmentRow = {
  id: string;
  message_id: string;
  type: string;
  url: string | null;
  thumbnail_url: string | null;
  file_name: string | null;
  mime_type: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../../data');
const dbPath = path.join(dataDir, 'gold-4.sqlite');
const legacyStatePath = path.join(dataDir, 'gold-1-state.json');

function ensureDataDir() {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

function nowIso() {
  return new Date().toISOString();
}

function toMessageKind(raw: string): GoldMessageKind {
  if (raw === 'image' || raw === 'file' || raw === 'video') return raw;
  return 'text';
}

export class GoldStore {
  private readonly db: DatabaseSync;
  private activeAccountId?: string;

  constructor() {
    ensureDataDir();
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec('PRAGMA journal_mode = WAL');
    this.migrate();
    this.activeAccountId = this.getMetaValue('active_account_id') ?? this.getLatestAccountId();
    this.importLegacyStateIfNeeded();
  }

  getCredential() {
    const pendingCredential = this.getPendingCredential();
    if (pendingCredential) {
      return pendingCredential;
    }

    if (!this.activeAccountId) {
      return undefined;
    }

    const row = this.db.prepare(`
      SELECT cookie_json, imei, user_agent, is_active
      FROM account_sessions
      WHERE account_id = ? AND is_active = 1
      LIMIT 1
    `).get(this.activeAccountId) as RawCredentialRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      cookie: row.cookie_json,
      imei: row.imei,
      userAgent: row.user_agent,
    } satisfies GoldStoredCredential;
  }

  setCredential(credential: GoldStoredCredential) {
    const accountId = this.activeAccountId ?? this.getLatestAccountId();
    if (!accountId) {
      this.setMetaValue('pending_credential_json', JSON.stringify(credential));
      return;
    }

    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO account_sessions (
        account_id,
        cookie_json,
        imei,
        user_agent,
        is_active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        cookie_json = excluded.cookie_json,
        imei = excluded.imei,
        user_agent = excluded.user_agent,
        is_active = 1,
        updated_at = excluded.updated_at
    `).run(accountId, credential.cookie, credential.imei, credential.userAgent, timestamp, timestamp);

    this.ensureAccountRecord({ accountId });
    this.setActiveAccountId(accountId);
    this.clearPendingCredential();
  }

  setActiveAccount(account: AccountRecord) {
    this.ensureAccountRecord(account);
    this.setActiveAccountId(account.accountId);
    this.db.prepare('UPDATE accounts SET last_login_at = ?, updated_at = ? WHERE account_id = ?').run(
      nowIso(),
      nowIso(),
      account.accountId,
    );

    const pendingCredential = this.getPendingCredential();
    if (pendingCredential) {
      this.setCredential(pendingCredential);
    }
  }

  updateActiveAccountProfile(profile: { displayName?: string; phoneNumber?: string }) {
    if (!this.activeAccountId) {
      return;
    }

    const existing = this.getAccount(this.activeAccountId);
    this.ensureAccountRecord({
      accountId: this.activeAccountId,
      displayName: profile.displayName ?? existing?.displayName,
      phoneNumber: profile.phoneNumber ?? existing?.phoneNumber,
    });
  }

  getActiveAccount() {
    if (!this.activeAccountId) {
      return undefined;
    }

    return this.getAccount(this.activeAccountId);
  }

  listFriends() {
    if (!this.activeAccountId) {
      return [];
    }

    const rows = this.db.prepare(`
      SELECT id, friend_id, display_name, zalo_name, avatar, status, phone_number, last_sync_at
      FROM friends
      WHERE account_id = ?
      ORDER BY display_name COLLATE NOCASE ASC, friend_id ASC
    `).all(this.activeAccountId) as RawFriendRow[];

    return rows.map((row) => ({
      id: row.id,
      userId: row.friend_id,
      displayName: row.display_name,
      zaloName: row.zalo_name ?? undefined,
      avatar: row.avatar ?? undefined,
      status: row.status ?? undefined,
      phoneNumber: row.phone_number ?? undefined,
      lastSyncAt: row.last_sync_at,
    } satisfies GoldFriendRecord));
  }

  listConversationMessages(friendId: string): GoldConversationMessage[] {
    if (!this.activeAccountId) {
      return [];
    }

    const rows = this.db.prepare(`
      SELECT id, friend_id, text, kind, image_url, direction, is_self, timestamp
      FROM messages
      WHERE account_id = ? AND friend_id = ?
      ORDER BY timestamp ASC, created_at ASC
    `).all(this.activeAccountId, friendId) as RawMessageRow[];

    const messageIds = rows.map((r) => r.id);

    // batch load attachments
    const attachmentsByMessageId = new Map<string, GoldAttachment[]>();
    if (messageIds.length > 0) {
      const placeholders = messageIds.map(() => '?').join(',');
      const attRows = this.db.prepare(`
        SELECT id, message_id, type, url, thumbnail_url, file_name, mime_type, size, width, height, duration
        FROM attachments
        WHERE message_id IN (${placeholders})
      `).all(...messageIds) as RawAttachmentRow[];

      for (const att of attRows) {
        const list = attachmentsByMessageId.get(att.message_id) ?? [];
        list.push({
          id: att.id,
          type: toMessageKind(att.type),
          url: att.url ?? undefined,
          thumbnailUrl: att.thumbnail_url ?? undefined,
          fileName: att.file_name ?? undefined,
          mimeType: att.mime_type ?? undefined,
          size: att.size ?? undefined,
          width: att.width ?? undefined,
          height: att.height ?? undefined,
          duration: att.duration ?? undefined,
        });
        attachmentsByMessageId.set(att.message_id, list);
      }
    }

    return rows.map((row) => {
      const attachments = attachmentsByMessageId.get(row.id) ?? [];
      // legacy compat: nếu kind=image và không có attachment -> tạo attachment từ image_url cũ
      if (toMessageKind(row.kind) === 'image' && attachments.length === 0 && row.image_url) {
        attachments.push({
          id: `legacy-${row.id}`,
          type: 'image',
          url: row.image_url,
          thumbnailUrl: row.image_url,
        });
      }

      return {
        id: row.id,
        friendId: row.friend_id,
        text: row.text,
        kind: toMessageKind(row.kind),
        attachments,
        imageUrl: row.image_url ?? undefined,
        direction: row.direction,
        isSelf: Boolean(row.is_self),
        timestamp: row.timestamp,
      } satisfies GoldConversationMessage;
    });
  }

  listConversationSummaries(): GoldConversationSummary[] {
    if (!this.activeAccountId) {
      return [];
    }

    const rows = this.db.prepare(`
      SELECT friend_id, display_name_snapshot, last_message_text, last_message_kind, last_direction, last_message_timestamp, message_count
      FROM conversations
      WHERE account_id = ?
      ORDER BY last_message_timestamp DESC, updated_at DESC
    `).all(this.activeAccountId) as RawConversationRow[];

    return rows.map((row) => ({
      friendId: row.friend_id,
      displayName: row.display_name_snapshot ?? this.getFriendDisplayName(row.friend_id),
      lastMessageText: row.last_message_text,
      lastMessageKind: toMessageKind(row.last_message_kind),
      lastMessageTimestamp: row.last_message_timestamp,
      lastDirection: row.last_direction,
      messageCount: row.message_count,
    } satisfies GoldConversationSummary));
  }

  replaceConversationMessages(friendId: string, messages: GoldConversationMessage[]) {
    if (!this.activeAccountId) {
      return [];
    }

    const sortedMessages = [...messages].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    this.runInTransaction(() => {
      const accountId = this.activeAccountId as string;
      // delete messages sẽ cascade xóa attachments nhờ FK
      this.db.prepare('DELETE FROM messages WHERE account_id = ? AND friend_id = ?').run(accountId, friendId);

      const insertMessage = this.db.prepare(`
        INSERT INTO messages (
          id,
          account_id,
          friend_id,
          provider_message_id,
          direction,
          kind,
          text,
          image_url,
          is_self,
          timestamp,
          raw_summary_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      `);

      const insertAttachment = this.db.prepare(`
        INSERT OR IGNORE INTO attachments (
          id,
          message_id,
          type,
          url,
          thumbnail_url,
          file_name,
          mime_type,
          size,
          width,
          height,
          duration,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const message of sortedMessages) {
        // legacy compat: giữ image_url cho các message image cũ
        const legacyImageUrl = message.imageUrl
          ?? (message.kind === 'image' && message.attachments?.[0]?.url ? message.attachments[0].url : null);

        insertMessage.run(
          message.id,
          accountId,
          friendId,
          message.id,
          message.direction,
          message.kind,
          message.text,
          legacyImageUrl ?? null,
          message.isSelf ? 1 : 0,
          message.timestamp,
          nowIso(),
        );

        for (const att of message.attachments ?? []) {
          if (att.id.startsWith('legacy-')) continue; // skip legacy synthetic attachments
          insertAttachment.run(
            att.id,
            message.id,
            att.type,
            att.url ?? null,
            att.thumbnailUrl ?? null,
            att.fileName ?? null,
            att.mimeType ?? null,
            att.size ?? null,
            att.width ?? null,
            att.height ?? null,
            att.duration ?? null,
            nowIso(),
          );
        }
      }

      this.upsertConversation(accountId, friendId, sortedMessages);
    });

    return this.listConversationMessages(friendId);
  }

  appendConversationMessage(message: GoldConversationMessage) {
    const existing = this.listConversationMessages(message.friendId);
    existing.push(message);
    return this.replaceConversationMessages(message.friendId, existing);
  }

  replaceFriends(friends: Omit<GoldFriendRecord, 'id'>[]) {
    if (!this.activeAccountId) {
      return [];
    }

    const timestamp = nowIso();
    this.runInTransaction(() => {
      const accountId = this.activeAccountId as string;
      this.db.prepare('DELETE FROM friends WHERE account_id = ?').run(accountId);
      const insertFriend = this.db.prepare(`
        INSERT INTO friends (
          id,
          account_id,
          friend_id,
          display_name,
          zalo_name,
          avatar,
          status,
          phone_number,
          last_sync_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const friend of friends) {
        insertFriend.run(
          randomUUID(),
          accountId,
          friend.userId,
          friend.displayName,
          friend.zaloName ?? null,
          friend.avatar ?? null,
          friend.status ?? null,
          friend.phoneNumber ?? null,
          friend.lastSyncAt,
          timestamp,
          timestamp,
        );
      }
    });

    return this.listFriends();
  }

  clearSession() {
    this.clearPendingCredential();
    if (!this.activeAccountId) {
      return;
    }

    this.db.prepare('UPDATE account_sessions SET is_active = 0, updated_at = ? WHERE account_id = ?').run(nowIso(), this.activeAccountId);
  }

  clearAll() {
    this.db.exec(`
      DELETE FROM attachments;
      DELETE FROM messages;
      DELETE FROM conversations;
      DELETE FROM friends;
      DELETE FROM account_sessions;
      DELETE FROM accounts;
      DELETE FROM app_meta;
    `);
    this.activeAccountId = undefined;
  }

  save() {
    // SQLite persistence is synchronous; no-op kept for compatibility.
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        account_id TEXT PRIMARY KEY,
        display_name TEXT,
        phone_number TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
      );

      CREATE TABLE IF NOT EXISTS account_sessions (
        account_id TEXT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
        cookie_json TEXT NOT NULL,
        imei TEXT NOT NULL,
        user_agent TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS friends (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
        friend_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        zalo_name TEXT,
        avatar TEXT,
        status TEXT,
        phone_number TEXT,
        last_sync_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(account_id, friend_id)
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
        friend_id TEXT NOT NULL,
        display_name_snapshot TEXT,
        last_message_text TEXT NOT NULL,
        last_message_kind TEXT NOT NULL,
        last_direction TEXT NOT NULL,
        last_message_timestamp TEXT NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(account_id, friend_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
        friend_id TEXT NOT NULL,
        provider_message_id TEXT,
        direction TEXT NOT NULL,
        kind TEXT NOT NULL,
        text TEXT NOT NULL,
        image_url TEXT,
        is_self INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        raw_summary_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_account_friend_time
      ON messages(account_id, friend_id, timestamp);

      CREATE INDEX IF NOT EXISTS idx_messages_account_time
      ON messages(account_id, timestamp);

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        url TEXT,
        thumbnail_url TEXT,
        file_name TEXT,
        mime_type TEXT,
        size INTEGER,
        width INTEGER,
        height INTEGER,
        duration INTEGER,
        created_at TEXT NOT NULL
      );
    `);
  }

  private getAccount(accountId: string) {
    const row = this.db.prepare(`
      SELECT account_id, display_name, phone_number
      FROM accounts
      WHERE account_id = ?
      LIMIT 1
    `).get(accountId) as { account_id: string; display_name: string | null; phone_number: string | null } | undefined;

    if (!row) {
      return undefined;
    }

    return {
      accountId: row.account_id,
      displayName: row.display_name ?? undefined,
      phoneNumber: row.phone_number ?? undefined,
    } satisfies AccountRecord;
  }

  private ensureAccountRecord(account: AccountRecord) {
    const timestamp = nowIso();
    const existing = this.getAccount(account.accountId);
    this.db.prepare(`
      INSERT INTO accounts (
        account_id,
        display_name,
        phone_number,
        created_at,
        updated_at,
        last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        display_name = excluded.display_name,
        phone_number = excluded.phone_number,
        updated_at = excluded.updated_at,
        last_login_at = COALESCE(excluded.last_login_at, accounts.last_login_at)
    `).run(
      account.accountId,
      account.displayName ?? existing?.displayName ?? null,
      account.phoneNumber ?? existing?.phoneNumber ?? null,
      existing ? timestamp : timestamp,
      timestamp,
      timestamp,
    );
  }

  private setActiveAccountId(accountId: string) {
    this.activeAccountId = accountId;
    this.setMetaValue('active_account_id', accountId);
  }

  private getLatestAccountId() {
    const row = this.db.prepare(`
      SELECT account_id
      FROM accounts
      ORDER BY COALESCE(last_login_at, updated_at, created_at) DESC
      LIMIT 1
    `).get() as { account_id: string } | undefined;
    return row?.account_id;
  }

  private getFriendDisplayName(friendId: string) {
    if (!this.activeAccountId) {
      return undefined;
    }

    const row = this.db.prepare(`
      SELECT display_name
      FROM friends
      WHERE account_id = ? AND friend_id = ?
      LIMIT 1
    `).get(this.activeAccountId, friendId) as { display_name: string } | undefined;
    return row?.display_name;
  }

  private upsertConversation(accountId: string, friendId: string, messages: GoldConversationMessage[]) {
    const lastMessage = messages[messages.length - 1];
    const timestamp = nowIso();

    if (!lastMessage) {
      this.db.prepare('DELETE FROM conversations WHERE account_id = ? AND friend_id = ?').run(accountId, friendId);
      return;
    }

    const existing = this.db.prepare(`
      SELECT id, created_at
      FROM conversations
      WHERE account_id = ? AND friend_id = ?
      LIMIT 1
    `).get(accountId, friendId) as { id: string; created_at: string } | undefined;

    const conversationId = existing?.id ?? randomUUID();
    const createdAt = existing?.created_at ?? timestamp;
    this.db.prepare(`
      INSERT INTO conversations (
        id,
        account_id,
        friend_id,
        display_name_snapshot,
        last_message_text,
        last_message_kind,
        last_direction,
        last_message_timestamp,
        message_count,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, friend_id) DO UPDATE SET
        display_name_snapshot = excluded.display_name_snapshot,
        last_message_text = excluded.last_message_text,
        last_message_kind = excluded.last_message_kind,
        last_direction = excluded.last_direction,
        last_message_timestamp = excluded.last_message_timestamp,
        message_count = excluded.message_count,
        updated_at = excluded.updated_at
    `).run(
      conversationId,
      accountId,
      friendId,
      this.getFriendDisplayName(friendId) ?? null,
      lastMessage.text,
      lastMessage.kind,
      lastMessage.direction,
      lastMessage.timestamp,
      messages.length,
      createdAt,
      timestamp,
    );
  }

  private getMetaValue(key: string) {
    const row = this.db.prepare('SELECT value FROM app_meta WHERE key = ? LIMIT 1').get(key) as { value: string } | undefined;
    return row?.value;
  }

  private setMetaValue(key: string, value: string) {
    this.db.prepare(`
      INSERT INTO app_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  private importLegacyStateIfNeeded() {
    if (!existsSync(legacyStatePath) || this.getLatestAccountId()) {
      return;
    }

    try {
      const legacy = JSON.parse(readFileSync(legacyStatePath, 'utf8')) as {
        credential?: GoldStoredCredential;
        friends?: GoldFriendRecord[];
        conversations?: Record<string, GoldConversationMessage[]>;
      };

      if (!legacy.credential) {
        return;
      }

      const fallbackAccountId = `legacy-${Date.now()}`;
      this.ensureAccountRecord({ accountId: fallbackAccountId, displayName: 'Legacy account' });
      this.setActiveAccountId(fallbackAccountId);
      this.setCredential(legacy.credential);

      if (legacy.friends?.length) {
        this.replaceFriends(legacy.friends.map(({ id: _id, ...friend }) => friend));
      }

      if (legacy.conversations) {
        for (const [friendId, messages] of Object.entries(legacy.conversations)) {
          this.replaceConversationMessages(friendId, messages);
        }
      }

      unlinkSync(legacyStatePath);
    } catch {
      // Keep legacy file in place if import fails.
    }
  }

  private getPendingCredential() {
    const raw = this.getMetaValue('pending_credential_json');
    if (!raw) {
      return undefined;
    }

    try {
      return JSON.parse(raw) as GoldStoredCredential;
    } catch {
      return undefined;
    }
  }

  private clearPendingCredential() {
    this.db.prepare('DELETE FROM app_meta WHERE key = ?').run('pending_credential_json');
  }

  private runInTransaction(work: () => void) {
    this.db.exec('BEGIN');
    try {
      work();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
