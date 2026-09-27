import knexLib from 'knex';

const dbUrl = process.env.DATABASE_URL || 'postgresql://zalohub:zalohub@localhost:5433/zalohub_creta';
const knex = knexLib({
  client: 'pg',
  connection: dbUrl,
});

async function main() {
  console.log(`Connecting to: ${dbUrl}`);

  // 1. Core tables
  await knex.raw(`CREATE TABLE IF NOT EXISTS accounts (
    account_id TEXT PRIMARY KEY, hub_alias VARCHAR(255), display_name VARCHAR(255),
    phone_number VARCHAR(50), avatar TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
  )`);
  console.log('OK accounts');

  await knex.raw(`CREATE TABLE IF NOT EXISTS account_sessions (
    account_id TEXT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
    cookie_json JSONB NOT NULL, imei VARCHAR(100) NOT NULL, user_agent TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log('OK account_sessions');

  await knex.raw(`CREATE TABLE IF NOT EXISTS friends (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    friend_id TEXT NOT NULL, display_name TEXT NOT NULL,
    zalo_name TEXT, zalo_alias TEXT, hub_alias TEXT, avatar TEXT, status TEXT, phone_number TEXT,
    last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, friend_id)
  )`);
  console.log('OK friends');

  await knex.raw(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    thread_id TEXT, type VARCHAR(20) NOT NULL DEFAULT 'direct', title TEXT, avatar TEXT,
    friend_id TEXT NOT NULL, display_name_snapshot TEXT,
    last_message_text TEXT NOT NULL DEFAULT '', last_message_kind TEXT NOT NULL DEFAULT 'text',
    last_direction TEXT NOT NULL DEFAULT 'incoming', last_message_timestamp TEXT NOT NULL DEFAULT '',
    message_count INTEGER NOT NULL DEFAULT 0, unread_count INTEGER NOT NULL DEFAULT 0,
    last_read_at TEXT,
    is_restricted BOOLEAN NOT NULL DEFAULT false,
    restricted_by TEXT NULL,
    restricted_at TIMESTAMPTZ NULL,
    notes TEXT NULL,
    last_message_sender_name VARCHAR(255) NULL,
    is_muted BOOLEAN NOT NULL DEFAULT false,
    mute_until TIMESTAMPTZ NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    pinned_at TIMESTAMPTZ NULL,
    labels_json JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, friend_id)
  )`);
  console.log('OK conversations');

  await knex.raw(`CREATE TABLE IF NOT EXISTS system_users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL, role VARCHAR(50) NOT NULL DEFAULT 'user',
    avatar TEXT, type VARCHAR(50) NOT NULL DEFAULT 'human',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log('OK system_users');

  await knex.raw(`CREATE TABLE IF NOT EXISTS system_sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log('OK system_sessions');

  await knex.raw(`CREATE TABLE IF NOT EXISTS zalo_account_memberships (
    user_id TEXT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL, role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    visible INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, account_id)
  )`);
  console.log('OK zalo_account_memberships');

  await knex.raw(`CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    color VARCHAR(50) NOT NULL DEFAULT '#1890ff',
    emoji VARCHAR(50),
    source VARCHAR(50) NOT NULL DEFAULT 'system',
    zalo_label_id INTEGER,
    account_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS tags_account_zalo_label_uq ON tags (account_id, zalo_label_id) WHERE zalo_label_id IS NOT NULL`);
  console.log('OK tags');

  await knex.raw(`CREATE TABLE IF NOT EXISTS conversation_tags (
    conversation_id TEXT NOT NULL,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    assigned_by VARCHAR(50) NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, tag_id)
  )`);
  console.log('OK conversation_tags');

  await knex.raw(`CREATE TABLE IF NOT EXISTS user_tag_permissions (
    user_id TEXT NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, account_id, tag_id)
  )`);
  console.log('OK user_tag_permissions');

  await knex.raw(`CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE REFERENCES system_users(id) ON DELETE CASCADE,
    desktop_notification BOOLEAN NOT NULL DEFAULT true,
    sound_enabled BOOLEAN NOT NULL DEFAULT true,
    sound_volume INTEGER NOT NULL DEFAULT 80,
    notify_group_messages BOOLEAN NOT NULL DEFAULT true,
    show_message_preview BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log('OK user_settings');

  await knex.raw(`CREATE TABLE IF NOT EXISTS conversation_read_state (
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL,
    last_read_at TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, conversation_id)
  )`);
  console.log('OK conversation_read_state');

  await knex.raw(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT, account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    thread_id TEXT, conversation_type TEXT, friend_id TEXT NOT NULL,
    provider_message_id TEXT, sender_id TEXT, sender_name TEXT,
    direction TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'text', text TEXT NOT NULL DEFAULT '',
    image_url TEXT, is_self INTEGER NOT NULL DEFAULT 0, timestamp TEXT NOT NULL,
    raw_summary_json TEXT, raw_message_json JSONB,
    reactions_json JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log('OK messages');

  await knex.raw(`CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    group_id TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '', avatar TEXT,
    member_count INTEGER, members_json JSONB,
    last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, group_id)
  )`);
  console.log('OK groups');

  await knex.raw(`CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    type TEXT NOT NULL, url TEXT, source_url TEXT, local_path TEXT,
    thumbnail_url TEXT, thumbnail_source_url TEXT, thumbnail_local_path TEXT,
    file_name TEXT, mime_type TEXT, size INTEGER, width INTEGER, height INTEGER, duration INTEGER,
    storage_tier VARCHAR(20) NOT NULL DEFAULT 'hot',
    storage_provider VARCHAR(50) NOT NULL DEFAULT 'minio',
    storage_drive_id UUID NULL,
    remote_file_id TEXT NULL,
    remote_web_view_link TEXT NULL,
    offloaded_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log('OK attachments');

  await knex.raw(`CREATE TABLE IF NOT EXISTS storage_drives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'gdrive',
    account_email VARCHAR(255),
    credentials JSONB NOT NULL DEFAULT '{}',
    root_folder_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    assigned_accounts JSONB NOT NULL DEFAULT '[]',
    is_default BOOLEAN NOT NULL DEFAULT false,
    quota_bytes BIGINT,
    used_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log('OK storage_drives');

  await knex.raw(`CREATE TABLE IF NOT EXISTS storage_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log('OK storage_settings');

  await knex.raw(`CREATE TABLE IF NOT EXISTS dify_bots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    dify_api_url VARCHAR(500) NOT NULL,
    dify_api_key VARCHAR(255) NULL,
    bot_token VARCHAR(255) NULL,
    description TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    bot_type VARCHAR(50) NOT NULL DEFAULT 'chat',
    response_mode VARCHAR(50) NOT NULL DEFAULT 'streaming',
    trigger_mode VARCHAR(50) NOT NULL DEFAULT 'keyword',
    whitelist_scope VARCHAR(50) NOT NULL DEFAULT 'all',
    whitelist_ids JSONB NOT NULL DEFAULT '[]',
    assigned_accounts JSONB NOT NULL DEFAULT '[]',
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log('OK dify_bots');

  await knex.raw(`CREATE TABLE IF NOT EXISTS case_station_webhook_outbox (
    delivery_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    source_message_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log('OK case_station_webhook_outbox');

  await knex.raw(`CREATE TABLE IF NOT EXISTS send_requests (
    account_id TEXT NOT NULL,
    client_request_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    system_user_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_receipt_json JSONB NOT NULL DEFAULT '{}',
    message_refs_json JSONB NOT NULL DEFAULT '[]',
    error_code TEXT,
    retryable BOOLEAN NOT NULL DEFAULT false,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, client_request_id)
  )`);
  console.log('OK send_requests');

  await knex.raw(`CREATE TABLE IF NOT EXISTS composer_staging (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    system_user_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    object_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    sha256 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'uploading',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  )`);
  console.log('OK composer_staging');

  await knex.raw(`CREATE TABLE IF NOT EXISTS composer_batches (
    account_id TEXT NOT NULL,
    client_batch_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    system_user_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, client_batch_id)
  )`);
  console.log('OK composer_batches');

  await knex.raw(`CREATE TABLE IF NOT EXISTS composer_batch_items (
    account_id TEXT NOT NULL,
    client_batch_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    staging_id TEXT NOT NULL,
    client_request_id TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    error_code TEXT NULL,
    send_context JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, client_batch_id, position)
  )`);
  console.log('OK composer_batch_items');

  await knex.raw(`CREATE TABLE IF NOT EXISTS composer_actions (
    account_id TEXT NOT NULL,
    client_action_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    system_user_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    error_code TEXT,
    receipt_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, client_action_id)
  )`);
  console.log('OK composer_actions');

  await knex.raw(`CREATE TABLE IF NOT EXISTS sticker_cache (
    sticker_id INTEGER PRIMARY KEY,
    category_id INTEGER NULL,
    local_url TEXT NULL,
    remote_url TEXT NULL,
    mime_type VARCHAR(100) NULL,
    width INTEGER NULL,
    height INTEGER NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ready',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  console.log('OK sticker_cache');

  // 2. Indexes
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_messages_account_time_id ON messages (account_id, timestamp, id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_messages_account_conv_time_id ON messages (account_id, conversation_id, timestamp, id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_conversations_account_lastmsg ON conversations (account_id, last_message_timestamp DESC)`);
  await knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_account_provider_msg_id ON messages (account_id, provider_message_id) WHERE provider_message_id IS NOT NULL AND provider_message_id <> ''`);
  console.log('OK all indexes');

  // 3. Populate knex_migrations table so knex.migrate.latest() considers them all completed
  await knex.schema.createTableIfNotExists('knex_migrations', (t) => {
    t.increments('id').primary();
    t.string('name', 255);
    t.integer('batch');
    t.timestamp('migration_time', { useTz: true });
  });

  await knex.schema.createTableIfNotExists('knex_migrations_lock', (t) => {
    t.increments('index').primary();
    t.integer('is_locked');
  });

  const lockCount = await knex('knex_migrations_lock').count('* as count').first();
  if (Number(lockCount?.count ?? 0) === 0) {
    await knex('knex_migrations_lock').insert({ index: 1, is_locked: 0 });
  }

  const allMigrations = [
    '20260515103940_add_reactions_column.ts',
    '20260516052000_add_last_read_at.ts',
    '20260517000000_create_conversation_read_state.ts',
    '20260529000000_add_monitor_indexes.ts',
    '20260606134000_create_dify_bots.ts',
    '20260606141500_add_bot_token_to_dify_bots.ts',
    '20260606170000_make_dify_api_key_nullable.ts',
    '20260611000000_add_whitelist_to_dify_bots.ts',
    '20260611000001_remove_filter_fields_from_dify_bots.ts',
    '20260916000000_create_case_station_webhook_outbox.ts',
    '20260918230000_create_tags_system.ts',
    '20260922000000_create_send_requests.ts',
    '20260924000000_add_conversation_notes.ts',
    '20260924120000_add_last_message_sender_name.ts',
    '20260925000000_add_mute_pinned_and_user_settings.ts',
    '20260925120000_add_conversation_restrictions_and_tag_permissions.ts',
    '20260927150000_create_composer_staging.ts',
    '20260927170000_extended_action_receipts.ts',
    '20260927171000_composer_item_context.ts',
    '20260927180000_create_sticker_cache.ts',
  ];

  for (const name of allMigrations) {
    const exists = await knex('knex_migrations').where({ name }).first();
    if (!exists) {
      await knex('knex_migrations').insert({
        name,
        batch: 1,
        migration_time: new Date(),
      });
    }
  }
  console.log('OK knex_migrations synchronized (20/20)');

  await knex.destroy();
  console.log('\n=== Database initialized cleanly & successfully! ===');
}

main().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
