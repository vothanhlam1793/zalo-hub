import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { dataDir } from './media-store.js';
import type {
  GoldAttachment,
  GoldContactRecord,
  GoldConversationMessage,
  GoldConversationSummary,
  GoldGroupMemberRecord,
  GoldGroupRecord,
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

type RawGroupRow = {
  id: string;
  group_id: string;
  display_name: string;
  avatar: string | null;
  member_count: number | null;
  members_json: string | null;
  last_sync_at: string;
};

type RawConversationRow = {
  id: string;
  thread_id: string;
  type: 'direct' | 'group';
  title: string | null;
  avatar: string | null;
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
  conversation_id: string | null;
  thread_id: string | null;
  conversation_type: 'direct' | 'group' | null;
  friend_id: string;
  text: string;
  kind: string;
  image_url: string | null;
  direction: 'incoming' | 'outgoing';
  is_self: number;
  timestamp: string;
  sender_id: string | null;
  sender_name: string | null;
  provider_message_id: string | null;
  raw_message_json: string | null;
};

type RawAttachmentRow = {
  id: string;
  message_id: string;
  type: string;
  url: string | null;
  source_url: string | null;
  local_path: string | null;
  thumbnail_url: string | null;
  thumbnail_source_url: string | null;
  thumbnail_local_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

function looksLikeFileName(value: string) {
  return /\.(xlsx|xls|csv|doc|docx|pdf|zip|rar|7z|txt|ppt|pptx)$/i.test(value.trim());
}

function guessKindFromAttachment(attachment: GoldAttachment | undefined): GoldMessageKind | undefined {
  if (!attachment) {
    return undefined;
  }

  if (attachment.type === 'image' || attachment.type === 'video' || attachment.type === 'file') {
    return attachment.type;
  }

  const mimeType = (attachment.mimeType ?? '').toLowerCase();
  const fileName = (attachment.fileName ?? attachment.url ?? attachment.sourceUrl ?? '').toLowerCase();
  if (mimeType.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/.test(fileName)) return 'image';
  if (mimeType.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/.test(fileName)) return 'video';
  if (attachment.url || attachment.sourceUrl || looksLikeFileName(attachment.fileName ?? '')) return 'file';
  return undefined;
}

function canonicalizeStoredMessage(row: RawMessageRow, currentAttachments: GoldAttachment[]) {
  const attachments = [...currentAttachments];
  const rowKind = toMessageKind(row.kind);

  if (rowKind === 'image' && attachments.length === 0 && row.image_url) {
    attachments.push({
      id: `legacy-${row.id}`,
      type: 'image',
      url: row.image_url,
      sourceUrl: row.image_url,
      thumbnailUrl: row.image_url,
      thumbnailSourceUrl: row.image_url,
    });
  }

  if (attachments.length === 0 && row.image_url && looksLikeFileName(row.text) && (rowKind === 'text' || rowKind === 'file')) {
    attachments.push({
      id: `legacy-file-${row.id}`,
      type: 'file',
      url: row.image_url,
      sourceUrl: row.image_url,
      fileName: row.text,
    });
  }

  const primaryAttachment = attachments[0];
  const inferredKind = guessKindFromAttachment(primaryAttachment) ?? rowKind;
  const canonicalKind = rowKind === 'text' && inferredKind !== 'text' ? inferredKind : (rowKind === 'file' && inferredKind !== 'text' ? inferredKind : rowKind);
  const canonicalText = canonicalKind === 'image'
    ? (row.text === '' || row.text === '[image]' ? '[image]' : row.text)
    : canonicalKind === 'video'
      ? (row.text === '' || row.text === '[video]' ? '[video]' : row.text)
      : row.text;

  if ((canonicalKind === 'file' || canonicalKind === 'video' || canonicalKind === 'image') && attachments.length === 0 && row.image_url) {
    attachments.push({
      id: `legacy-canonical-${row.id}`,
      type: canonicalKind,
      url: row.image_url,
      sourceUrl: row.image_url,
      thumbnailUrl: canonicalKind === 'image' ? row.image_url : undefined,
      thumbnailSourceUrl: canonicalKind === 'image' ? row.image_url : undefined,
      fileName: looksLikeFileName(row.text) ? row.text : undefined,
    });
  }

  return {
    kind: canonicalKind,
    text: canonicalText,
    attachments,
    imageUrl: canonicalKind === 'image'
      ? (attachments[0]?.url ?? row.image_url ?? undefined)
      : row.image_url ?? undefined,
  };
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

  getCurrentAccountId() {
    return this.activeAccountId;
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

  listContacts() {
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
    } satisfies GoldContactRecord));
  }

  listFriends() {
    return this.listContacts();
  }

  listGroups(): GoldGroupRecord[] {
    if (!this.activeAccountId) {
      return [];
    }

    const rows = this.db.prepare(`
      SELECT id, group_id, display_name, avatar, member_count, members_json, last_sync_at
      FROM groups
      WHERE account_id = ?
      ORDER BY display_name COLLATE NOCASE ASC, group_id ASC
    `).all(this.activeAccountId) as RawGroupRow[];

    return rows.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      displayName: row.display_name,
      avatar: row.avatar ?? undefined,
      memberCount: row.member_count ?? undefined,
      members: row.members_json ? JSON.parse(row.members_json) as GoldGroupMemberRecord[] : undefined,
      lastSyncAt: row.last_sync_at,
    } satisfies GoldGroupRecord));
  }

  listConversationMessages(conversationId: string, options: { before?: string; limit?: number } = {}): GoldConversationMessage[] {
    if (!this.activeAccountId) {
      return [];
    }

    const { threadId, type } = this.parseConversationId(conversationId);
    const directLegacyKey = type === 'direct' ? threadId : null;
    const limit = Math.max(1, Math.min(options.limit ?? 40, 200));
    const before = options.before?.trim();

    const query = before
      ? `
        SELECT * FROM (
          SELECT id, conversation_id, thread_id, conversation_type, friend_id, text, kind, image_url, direction, is_self, timestamp, sender_id, sender_name, provider_message_id, raw_message_json, created_at
          FROM messages
          WHERE account_id = ?
            AND (
              conversation_id = ?
              OR (conversation_id IS NULL AND friend_id = ?)
            )
            AND timestamp < ?
          ORDER BY timestamp DESC, created_at DESC
          LIMIT ?
        )
        ORDER BY timestamp ASC, created_at ASC
      `
      : `
        SELECT * FROM (
          SELECT id, conversation_id, thread_id, conversation_type, friend_id, text, kind, image_url, direction, is_self, timestamp, sender_id, sender_name, provider_message_id, raw_message_json, created_at
          FROM messages
          WHERE account_id = ?
            AND (
              conversation_id = ?
              OR (conversation_id IS NULL AND friend_id = ?)
            )
          ORDER BY timestamp DESC, created_at DESC
          LIMIT ?
        )
        ORDER BY timestamp ASC, created_at ASC
      `;

    const rows = (before
      ? this.db.prepare(query).all(this.activeAccountId, conversationId, directLegacyKey, before, limit)
      : this.db.prepare(query).all(this.activeAccountId, conversationId, directLegacyKey, limit)) as RawMessageRow[];

    const messageIds = rows.map((r) => r.id);

    // batch load attachments
    const attachmentsByMessageId = new Map<string, GoldAttachment[]>();
    if (messageIds.length > 0) {
      const placeholders = messageIds.map(() => '?').join(',');
      const attRows = this.db.prepare(`
        SELECT id, message_id, type, url, source_url, local_path, thumbnail_url, thumbnail_source_url, thumbnail_local_path, file_name, mime_type, size, width, height, duration
        FROM attachments
        WHERE message_id IN (${placeholders})
      `).all(...messageIds) as RawAttachmentRow[];

      for (const att of attRows) {
        const list = attachmentsByMessageId.get(att.message_id) ?? [];
        list.push({
          id: att.id,
          type: toMessageKind(att.type),
          url: att.url ?? undefined,
          sourceUrl: att.source_url ?? undefined,
          localPath: att.local_path ?? undefined,
          thumbnailUrl: att.thumbnail_url ?? undefined,
          thumbnailSourceUrl: att.thumbnail_source_url ?? undefined,
          thumbnailLocalPath: att.thumbnail_local_path ?? undefined,
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
      const canonical = canonicalizeStoredMessage(row, attachmentsByMessageId.get(row.id) ?? []);

      return {
        id: row.id,
        conversationId: row.conversation_id ?? `direct:${row.friend_id}`,
        threadId: row.thread_id ?? row.friend_id,
        conversationType: row.conversation_type ?? 'direct',
        text: canonical.text,
        kind: canonical.kind,
        attachments: canonical.attachments,
        senderId: row.sender_id ?? undefined,
        senderName: row.sender_name ?? undefined,
        providerMessageId: row.provider_message_id ?? undefined,
        imageUrl: canonical.imageUrl,
        rawMessageJson: row.raw_message_json ?? undefined,
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
           , id, thread_id, type, title, avatar
      FROM conversations
      WHERE account_id = ?
      ORDER BY last_message_timestamp DESC, updated_at DESC
    `).all(this.activeAccountId) as RawConversationRow[];

    return rows.map((row) => ({
      id: `${row.type}:${row.thread_id ?? row.friend_id}`,
      threadId: row.thread_id ?? row.friend_id,
      type: row.type ?? 'direct',
      title: row.title
        ?? row.display_name_snapshot
        ?? ((row.type ?? 'direct') === 'group' ? this.getGroupDisplayName(row.thread_id ?? row.friend_id) : this.getFriendDisplayName(row.friend_id))
        ?? row.thread_id
        ?? row.friend_id,
      avatar: row.avatar ?? ((row.type ?? 'direct') === 'group' ? this.getGroupAvatar(row.thread_id ?? row.friend_id) : this.getFriendAvatar(row.friend_id)),
      lastMessageText: row.last_message_text,
      lastMessageKind: toMessageKind(row.last_message_kind),
      lastMessageTimestamp: row.last_message_timestamp,
      lastDirection: row.last_direction,
      messageCount: row.message_count,
    } satisfies GoldConversationSummary));
  }

  replaceConversationMessages(conversationId: string, messages: GoldConversationMessage[]) {
    if (!this.activeAccountId) {
      return [];
    }

    const sortedMessages = [...messages].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    this.runInTransaction(() => {
      const accountId = this.activeAccountId as string;
      const { threadId, type } = this.parseConversationId(conversationId);
      this.db.prepare(`
        DELETE FROM messages
        WHERE account_id = ?
          AND (
            conversation_id = ?
            OR (conversation_id IS NULL AND friend_id = ?)
          )
      `).run(accountId, conversationId, type === 'direct' ? threadId : null);

      const insertMessage = this.db.prepare(`
        INSERT INTO messages (
          id,
          conversation_id,
          account_id,
          thread_id,
          conversation_type,
          friend_id,
          provider_message_id,
          sender_id,
          sender_name,
          direction,
          kind,
          text,
          image_url,
          is_self,
          timestamp,
          raw_summary_json,
          raw_message_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `);

      const insertAttachment = this.db.prepare(`
        INSERT OR IGNORE INTO attachments (
          id,
          message_id,
          type,
          url,
          source_url,
          local_path,
          thumbnail_url,
          thumbnail_source_url,
          thumbnail_local_path,
          file_name,
          mime_type,
          size,
          width,
          height,
          duration,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const message of sortedMessages) {
        const messageThreadId = message.threadId || threadId;
        // legacy compat: giữ image_url cho các message image cũ
        const legacyImageUrl = message.imageUrl
          ?? (message.kind === 'image' && message.attachments?.[0]?.url ? message.attachments[0].url : null);

        insertMessage.run(
          message.id,
          message.conversationId,
          accountId,
          messageThreadId,
          message.conversationType,
          message.conversationType === 'direct' ? messageThreadId : '',
          message.providerMessageId ?? message.id,
          message.senderId ?? null,
          message.senderName ?? null,
          message.direction,
          message.kind,
          message.text,
          legacyImageUrl ?? null,
          message.isSelf ? 1 : 0,
          message.timestamp,
          message.rawMessageJson ?? null,
          nowIso(),
        );

        for (const att of message.attachments ?? []) {
          if (att.id.startsWith('legacy-')) continue; // skip legacy synthetic attachments
          insertAttachment.run(
            att.id,
            message.id,
            att.type,
            att.url ?? null,
            att.sourceUrl ?? null,
            att.localPath ?? null,
            att.thumbnailUrl ?? null,
            att.thumbnailSourceUrl ?? null,
            att.thumbnailLocalPath ?? null,
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

      this.upsertConversation(accountId, conversationId, sortedMessages);
    });

    return this.listConversationMessages(conversationId);
  }

  appendConversationMessage(message: GoldConversationMessage) {
    const existing = this.listConversationMessages(message.conversationId);
    existing.push(message);
    return this.replaceConversationMessages(message.conversationId, existing);
  }

  replaceContacts(friends: Omit<GoldContactRecord, 'id'>[]) {
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

    return this.listContacts();
  }

  replaceFriends(friends: Omit<GoldContactRecord, 'id'>[]) {
    return this.replaceContacts(friends);
  }

  replaceGroups(groups: Omit<GoldGroupRecord, 'id'>[]) {
    if (!this.activeAccountId) {
      return [];
    }

    const timestamp = nowIso();
    this.runInTransaction(() => {
      const accountId = this.activeAccountId as string;
      this.db.prepare('DELETE FROM groups WHERE account_id = ?').run(accountId);
      const insertGroup = this.db.prepare(`
        INSERT INTO groups (
          id,
          account_id,
          group_id,
          display_name,
          avatar,
          member_count,
          members_json,
          last_sync_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const group of groups) {
        insertGroup.run(
          randomUUID(),
          accountId,
          group.groupId,
          group.displayName,
          group.avatar ?? null,
          group.memberCount ?? null,
          group.members ? JSON.stringify(group.members) : null,
          group.lastSyncAt,
          timestamp,
          timestamp,
        );
      }
    });

    return this.listGroups();
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
        thread_id TEXT,
        type TEXT NOT NULL DEFAULT 'direct',
        title TEXT,
        avatar TEXT,
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
        conversation_id TEXT,
        account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
        thread_id TEXT,
        conversation_type TEXT,
        friend_id TEXT NOT NULL,
        provider_message_id TEXT,
        sender_id TEXT,
        sender_name TEXT,
        direction TEXT NOT NULL,
        kind TEXT NOT NULL,
        text TEXT NOT NULL,
        image_url TEXT,
        is_self INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        raw_summary_json TEXT,
        raw_message_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_account_friend_time
      ON messages(account_id, friend_id, timestamp);

      CREATE INDEX IF NOT EXISTS idx_messages_account_time
      ON messages(account_id, timestamp);

      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
        group_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar TEXT,
        member_count INTEGER,
        members_json TEXT,
        last_sync_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(account_id, group_id)
      );

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        url TEXT,
        source_url TEXT,
        local_path TEXT,
        thumbnail_url TEXT,
        thumbnail_source_url TEXT,
        thumbnail_local_path TEXT,
        file_name TEXT,
        mime_type TEXT,
        size INTEGER,
        width INTEGER,
        height INTEGER,
        duration INTEGER,
        created_at TEXT NOT NULL
      );
    `);

    this.addColumnIfMissing('conversations', 'thread_id', 'TEXT');
    this.addColumnIfMissing('conversations', 'type', "TEXT NOT NULL DEFAULT 'direct'");
    this.addColumnIfMissing('conversations', 'title', 'TEXT');
    this.addColumnIfMissing('conversations', 'avatar', 'TEXT');
    this.addColumnIfMissing('messages', 'conversation_id', 'TEXT');
    this.addColumnIfMissing('messages', 'thread_id', 'TEXT');
    this.addColumnIfMissing('messages', 'conversation_type', 'TEXT');
    this.addColumnIfMissing('messages', 'sender_id', 'TEXT');
    this.addColumnIfMissing('messages', 'sender_name', 'TEXT');
    this.addColumnIfMissing('messages', 'raw_message_json', 'TEXT');
    this.addColumnIfMissing('attachments', 'source_url', 'TEXT');
    this.addColumnIfMissing('attachments', 'local_path', 'TEXT');
    this.addColumnIfMissing('attachments', 'thumbnail_source_url', 'TEXT');
    this.addColumnIfMissing('attachments', 'thumbnail_local_path', 'TEXT');

    this.backfillConversationColumns();
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

  private getFriendAvatar(friendId: string) {
    if (!this.activeAccountId) return undefined;
    const row = this.db.prepare(`
      SELECT avatar
      FROM friends
      WHERE account_id = ? AND friend_id = ?
      LIMIT 1
    `).get(this.activeAccountId, friendId) as { avatar: string | null } | undefined;
    return row?.avatar ?? undefined;
  }

  private getGroupDisplayName(groupId: string) {
    if (!this.activeAccountId) return undefined;
    const row = this.db.prepare(`
      SELECT display_name
      FROM groups
      WHERE account_id = ? AND group_id = ?
      LIMIT 1
    `).get(this.activeAccountId, groupId) as { display_name: string } | undefined;
    return row?.display_name;
  }

  private getGroupAvatar(groupId: string) {
    if (!this.activeAccountId) return undefined;
    const row = this.db.prepare(`
      SELECT avatar
      FROM groups
      WHERE account_id = ? AND group_id = ?
      LIMIT 1
    `).get(this.activeAccountId, groupId) as { avatar: string | null } | undefined;
    return row?.avatar ?? undefined;
  }

  private upsertConversation(accountId: string, conversationId: string, messages: GoldConversationMessage[]) {
    const lastMessage = messages[messages.length - 1];
    const timestamp = nowIso();

    if (!lastMessage) {
      this.db.prepare('DELETE FROM conversations WHERE account_id = ? AND id = ?').run(accountId, conversationId);
      return;
    }

    const threadId = lastMessage.threadId;
    const type = lastMessage.conversationType;
    const friendId = type === 'direct' ? threadId : `group:${threadId}`;
    const title = type === 'group'
      ? this.getGroupDisplayName(threadId) ?? threadId
      : this.getFriendDisplayName(threadId) ?? threadId;
    const avatar = type === 'group'
      ? this.getGroupAvatar(threadId) ?? null
      : this.getFriendAvatar(threadId) ?? null;

    const existing = this.db.prepare(`
      SELECT id, created_at
      FROM conversations
      WHERE account_id = ? AND id = ?
      LIMIT 1
    `).get(accountId, conversationId) as { id: string; created_at: string } | undefined;

    const storedConversationId = existing?.id ?? conversationId;
    const createdAt = existing?.created_at ?? timestamp;
    this.db.prepare(`
      INSERT INTO conversations (
        id,
        account_id,
        thread_id,
        type,
        title,
        avatar,
        friend_id,
        display_name_snapshot,
        last_message_text,
        last_message_kind,
        last_direction,
        last_message_timestamp,
        message_count,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, friend_id) DO UPDATE SET
        id = excluded.id,
        thread_id = excluded.thread_id,
        type = excluded.type,
        title = excluded.title,
        avatar = excluded.avatar,
        display_name_snapshot = excluded.display_name_snapshot,
        last_message_text = excluded.last_message_text,
        last_message_kind = excluded.last_message_kind,
        last_direction = excluded.last_direction,
        last_message_timestamp = excluded.last_message_timestamp,
        message_count = excluded.message_count,
        updated_at = excluded.updated_at
    `).run(
        storedConversationId,
        accountId,
        threadId,
        type,
        title,
        avatar,
        friendId,
        type === 'direct' ? title : null,
        lastMessage.text,
        lastMessage.kind,
        lastMessage.direction,
      lastMessage.timestamp,
      messages.length,
      createdAt,
        timestamp,
      );
  }

  private backfillConversationColumns() {
    if (!this.activeAccountId) return;
    this.db.prepare(`
      UPDATE conversations
      SET thread_id = COALESCE(thread_id, friend_id),
          type = COALESCE(type, 'direct'),
          title = COALESCE(title, display_name_snapshot, friend_id),
          avatar = COALESCE(avatar, (
            SELECT avatar FROM friends
            WHERE friends.account_id = conversations.account_id AND friends.friend_id = conversations.friend_id
            LIMIT 1
          ))
      WHERE account_id = ?
    `).run(this.activeAccountId);

    this.db.prepare(`
      UPDATE messages
      SET conversation_id = COALESCE(conversation_id, 'direct:' || friend_id),
          thread_id = COALESCE(thread_id, friend_id),
          conversation_type = COALESCE(conversation_type, 'direct'),
          provider_message_id = COALESCE(provider_message_id, id)
      WHERE account_id = ?
    `).run(this.activeAccountId);
  }

  private addColumnIfMissing(tableName: string, columnName: string, definition: string) {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === columnName)) {
      return;
    }

    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }

  private parseConversationId(conversationId: string) {
    if (conversationId.startsWith('group:')) {
      return { type: 'group' as const, threadId: conversationId.slice('group:'.length) };
    }

    if (conversationId.startsWith('direct:')) {
      return { type: 'direct' as const, threadId: conversationId.slice('direct:'.length) };
    }

    return { type: 'direct' as const, threadId: conversationId };
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
        friends?: GoldContactRecord[];
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
