import { DatabaseSync } from 'node:sqlite';

export class GoldStoreSchema {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  migrate() {
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
        zalo_alias TEXT,
        hub_alias TEXT,
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

      CREATE TABLE IF NOT EXISTS system_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        avatar TEXT,
        type TEXT NOT NULL DEFAULT 'human',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS system_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS zalo_account_memberships (
        user_id TEXT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'agent',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, account_id)
      );
    `);

    this.addColumnIfMissing('system_users', 'role', "TEXT NOT NULL DEFAULT 'user'");
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
    this.addColumnIfMissing('friends', 'zalo_alias', 'TEXT');
    this.addColumnIfMissing('friends', 'hub_alias', 'TEXT');
    this.addColumnIfMissing('attachments', 'source_url', 'TEXT');
    this.addColumnIfMissing('attachments', 'local_path', 'TEXT');
    this.addColumnIfMissing('attachments', 'thumbnail_source_url', 'TEXT');
    this.addColumnIfMissing('attachments', 'thumbnail_local_path', 'TEXT');

    this.backfillConversationColumns();
    return;
  }

  addColumnIfMissing(tableName: string, columnName: string, definition: string) {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === columnName)) {
      return;
    }

    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }

  backfillConversationColumns(activeAccountId?: string) {
    if (!activeAccountId) return;
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
    `).run(activeAccountId);

    this.db.prepare(`
      UPDATE messages
      SET conversation_id = COALESCE(conversation_id, 'direct:' || friend_id),
          thread_id = COALESCE(thread_id, friend_id),
          conversation_type = COALESCE(conversation_type, 'direct'),
          provider_message_id = COALESCE(provider_message_id, id)
      WHERE account_id = ?
    `).run(activeAccountId);
  }
}
