import knexLib from "knex";

const knex = knexLib({
  client: "pg",
  connection: process.env.DATABASE_URL || "postgresql://zalohub:zalohub@localhost:5433/zalohub",
});

async function main() {
  await knex.raw(`CREATE TABLE IF NOT EXISTS accounts (
    account_id TEXT PRIMARY KEY, hub_alias VARCHAR(255), display_name VARCHAR(255),
    phone_number VARCHAR(50), avatar TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
  )`);
  console.log("OK accounts");

  await knex.raw(`CREATE TABLE IF NOT EXISTS account_sessions (
    account_id TEXT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
    cookie_json JSONB NOT NULL, imei VARCHAR(100) NOT NULL, user_agent TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log("OK account_sessions");

  await knex.raw(`CREATE TABLE IF NOT EXISTS friends (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    friend_id TEXT NOT NULL, display_name TEXT NOT NULL,
    zalo_name TEXT, zalo_alias TEXT, hub_alias TEXT, avatar TEXT, status TEXT, phone_number TEXT,
    last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, friend_id)
  )`);
  console.log("OK friends");

  await knex.raw(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    thread_id TEXT, type VARCHAR(20) NOT NULL DEFAULT 'direct', title TEXT, avatar TEXT,
    friend_id TEXT NOT NULL, display_name_snapshot TEXT,
    last_message_text TEXT NOT NULL DEFAULT '', last_message_kind TEXT NOT NULL DEFAULT 'text',
    last_direction TEXT NOT NULL DEFAULT 'incoming', last_message_timestamp TEXT NOT NULL DEFAULT '',
    message_count INTEGER NOT NULL DEFAULT 0, unread_count INTEGER NOT NULL DEFAULT 0,
    last_read_at TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, friend_id)
  )`);
  await knex.raw(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0`);
  await knex.raw(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_read_at TEXT NULL`);
  console.log("OK conversations");

  await knex.raw(`CREATE TABLE IF NOT EXISTS conversation_read_state (
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL,
    last_read_at TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, conversation_id)
  )`);
  await knex.raw(`
    INSERT INTO conversation_read_state (account_id, conversation_id, last_read_at)
    SELECT account_id, id, last_read_at
    FROM conversations
    WHERE last_read_at IS NOT NULL
    ON CONFLICT (account_id, conversation_id) DO NOTHING
  `);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_conversation_read_state_account ON conversation_read_state(account_id)`);
  console.log("OK conversation_read_state");

  await knex.raw(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT, account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    thread_id TEXT, conversation_type TEXT, friend_id TEXT NOT NULL,
    provider_message_id TEXT, sender_id TEXT, sender_name TEXT,
    direction TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'text', text TEXT NOT NULL DEFAULT '',
    image_url TEXT, is_self INTEGER NOT NULL DEFAULT 0, timestamp TEXT NOT NULL,
    raw_summary_json TEXT, raw_message_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_messages_account_friend_time ON messages(account_id, friend_id, timestamp)");
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_messages_account_time ON messages(account_id, timestamp)");
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_messages_provider_id ON messages(provider_message_id)");
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(account_id, conversation_id)");
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_messages_account_conversation_direction_time ON messages(account_id, conversation_id, direction, timestamp)");
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_messages_raw_json_gin ON messages USING GIN (raw_message_json)");
  console.log("OK messages");

  await knex.raw(`CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    group_id TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '', avatar TEXT,
    member_count INTEGER, members_json JSONB,
    last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, group_id)
  )`);
  console.log("OK groups");

  await knex.raw(`CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    type TEXT NOT NULL, url TEXT, source_url TEXT, local_path TEXT,
    thumbnail_url TEXT, thumbnail_source_url TEXT, thumbnail_local_path TEXT,
    file_name TEXT, mime_type TEXT, size INTEGER, width INTEGER, height INTEGER, duration INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log("OK attachments");

  await knex.raw(`CREATE TABLE IF NOT EXISTS system_users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL, role VARCHAR(50) NOT NULL DEFAULT 'user',
    avatar TEXT, type VARCHAR(50) NOT NULL DEFAULT 'human',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log("OK system_users");

  await knex.raw(`CREATE TABLE IF NOT EXISTS system_sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log("OK system_sessions");

  await knex.raw(`CREATE TABLE IF NOT EXISTS zalo_account_memberships (
    user_id TEXT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL, role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    visible INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, account_id)
  )`);
  await knex.raw("ALTER TABLE zalo_account_memberships ADD COLUMN IF NOT EXISTS visible INTEGER NOT NULL DEFAULT 1");
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_memberships_account ON zalo_account_memberships(account_id)");
  console.log("OK zalo_account_memberships");

  await knex.raw("CREATE INDEX IF NOT EXISTS idx_friends_search ON friends(account_id, display_name)");
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_groups_search ON groups(account_id, display_name)");
  await knex.raw("CREATE INDEX IF NOT EXISTS idx_conversations_account ON conversations(account_id, last_message_timestamp DESC)");
  console.log("OK indexes");

  await knex.destroy();
  console.log("\nAll migrations complete!");
}

main().catch((err) => { console.error("Migration failed:", err.message); process.exit(1); });
