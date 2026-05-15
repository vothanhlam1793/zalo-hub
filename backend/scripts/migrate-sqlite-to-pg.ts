// Script migrate data from sqlite to postgres
// Usage: npx tsx scripts/migrate-sqlite-to-pg.ts
import { DatabaseSync } from 'node:sqlite';
import knexLib from 'knex';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlitePath = path.resolve(__dirname, '../data/gold-4.sqlite');

const pg = knexLib({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgresql://zalohub:zalohub@localhost:5432/zalohub',
});

async function main() {
  if (!require('fs').existsSync(sqlitePath)) {
    console.log('No sqlite database found, skipping migration');
    await pg.destroy();
    return;
  }

  const sqlite = new DatabaseSync(sqlitePath);
  console.log('Starting migration from SQLite to PostgreSQL...');

  // 1. accounts
  try {
    const rows = sqlite.prepare('SELECT * FROM accounts').all() as any[];
    if (rows.length > 0) {
      for (const row of rows) {
        await pg.raw(`INSERT INTO accounts (account_id, hub_alias, display_name, phone_number, avatar, created_at, updated_at, last_login_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (account_id) DO NOTHING`, [row.account_id, row.hub_alias, row.display_name, row.phone_number, row.avatar, row.created_at || new Date().toISOString(), row.updated_at || new Date().toISOString(), row.last_login_at]);
      }
      console.log(`Migrated ${rows.length} accounts`);
    }
  } catch (e) { console.error('accounts:', (e as Error).message); }

  // 2. account_sessions
  try {
    const rows = sqlite.prepare('SELECT * FROM account_sessions').all() as any[];
    for (const row of rows) {
      await pg.raw(`INSERT INTO account_sessions (account_id, cookie_json, imei, user_agent, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (account_id) DO NOTHING`, [row.account_id, row.cookie_json ? Buffer.from(row.cookie_json) : '{}', row.imei || '', row.user_agent || '', row.is_active || 0, row.created_at || new Date().toISOString(), row.updated_at || new Date().toISOString()]);
    }
    console.log(`Migrated ${rows.length} sessions`);
  } catch (e) { console.error('sessions:', (e as Error).message); }

  // 3. friends
  try {
    const rows = sqlite.prepare('SELECT * FROM friends').all() as any[];
    for (const row of rows) {
      await pg.raw(`INSERT INTO friends (id, account_id, friend_id, display_name, zalo_name, zalo_alias, hub_alias, avatar, status, phone_number, last_sync_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (account_id, friend_id) DO NOTHING`, [row.id, row.account_id, row.friend_id, row.display_name, row.zalo_name, row.zalo_alias, row.hub_alias, row.avatar, row.status, row.phone_number, row.last_sync_at || new Date().toISOString(), row.created_at || new Date().toISOString(), row.updated_at || new Date().toISOString()]);
    }
    console.log(`Migrated ${rows.length} friends`);
  } catch (e) { console.error('friends:', (e as Error).message); }

  // 4. conversations
  try {
    const rows = sqlite.prepare('SELECT * FROM conversations').all() as any[];
    for (const row of rows) {
      await pg.raw(`INSERT INTO conversations (id, account_id, thread_id, type, title, avatar, friend_id, display_name_snapshot, last_message_text, last_message_kind, last_direction, last_message_timestamp, message_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (account_id, friend_id) DO NOTHING`, [row.id, row.account_id, row.thread_id, row.type || 'direct', row.title, row.avatar, row.friend_id, row.display_name_snapshot, row.last_message_text || '', row.last_message_kind || 'text', row.last_direction || 'incoming', row.last_message_timestamp || '', row.message_count || 0, row.created_at || new Date().toISOString(), row.updated_at || new Date().toISOString()]);
    }
    console.log(`Migrated ${rows.length} conversations`);
  } catch (e) { console.error('conversations:', (e as Error).message); }

  // 5. messages
  try {
    const rows = sqlite.prepare('SELECT * FROM messages').all() as any[];
    for (const row of rows) {
      const rawJson = row.raw_message_json ? (typeof row.raw_message_json === 'string' ? row.raw_message_json : Buffer.from(row.raw_message_json).toString()) : null;
      await pg.raw(`INSERT INTO messages (id, conversation_id, account_id, thread_id, conversation_type, friend_id, provider_message_id, sender_id, sender_name, direction, kind, text, image_url, is_self, timestamp, raw_summary_json, raw_message_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO NOTHING`, [row.id, row.conversation_id, row.account_id, row.thread_id, row.conversation_type, row.friend_id, row.provider_message_id, row.sender_id, row.sender_name, row.direction || 'incoming', row.kind || 'text', row.text || '', row.image_url, row.is_self || 0, row.timestamp, row.raw_summary_json, rawJson, row.created_at || new Date().toISOString()]);
    }
    console.log(`Migrated ${rows.length} messages`);
  } catch (e) { console.error('messages:', (e as Error).message); }

  // 6. groups
  try {
    const rows = sqlite.prepare('SELECT * FROM groups').all() as any[];
    for (const row of rows) {
      const membersJson = row.members_json ? (typeof row.members_json === 'string' ? row.members_json : Buffer.from(row.members_json).toString()) : null;
      await pg.raw(`INSERT INTO groups (id, account_id, group_id, display_name, avatar, member_count, members_json, last_sync_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (account_id, group_id) DO NOTHING`, [row.id, row.account_id, row.group_id, row.display_name || '', row.avatar, row.member_count, membersJson, row.last_sync_at || new Date().toISOString(), row.created_at || new Date().toISOString(), row.updated_at || new Date().toISOString()]);
    }
    console.log(`Migrated ${rows.length} groups`);
  } catch (e) { console.error('groups:', (e as Error).message); }

  // 7. attachments
  try {
    const rows = sqlite.prepare('SELECT * FROM attachments').all() as any[];
    for (const row of rows) {
      await pg.raw(`INSERT INTO attachments (id, message_id, type, url, source_url, local_path, thumbnail_url, thumbnail_source_url, thumbnail_local_path, file_name, mime_type, size, width, height, duration, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO NOTHING`, [row.id, row.message_id, row.type || 'file', row.url, row.source_url, row.local_path, row.thumbnail_url, row.thumbnail_source_url, row.thumbnail_local_path, row.file_name, row.mime_type, row.size, row.width, row.height, row.duration, row.created_at || new Date().toISOString()]);
    }
    console.log(`Migrated ${rows.length} attachments`);
  } catch (e) { console.error('attachments:', (e as Error).message); }

  // 8. system_users
  try {
    const rows = sqlite.prepare('SELECT * FROM system_users').all() as any[];
    for (const row of rows) {
      await pg.raw(`INSERT INTO system_users (id, email, password_hash, display_name, role, avatar, type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (email) DO NOTHING`, [row.id, row.email, row.password_hash, row.display_name, row.role || 'user', row.avatar, row.type || 'human', row.created_at || new Date().toISOString()]);
    }
    console.log(`Migrated ${rows.length} system_users`);
  } catch (e) { console.error('system_users:', (e as Error).message); }

  // 9. system_sessions
  try {
    const rows = sqlite.prepare('SELECT * FROM system_sessions').all() as any[];
    for (const row of rows) {
      await pg.raw(`INSERT INTO system_sessions (token, user_id, expires_at, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (token) DO NOTHING`, [row.token, row.user_id, row.expires_at, row.created_at || new Date().toISOString()]);
    }
    console.log(`Migrated ${rows.length} system_sessions`);
  } catch (e) { console.error('system_sessions:', (e as Error).message); }

  // 10. zalo_account_memberships + rename owner → master
  try {
    const rows = sqlite.prepare('SELECT * FROM zalo_account_memberships').all() as any[];
    for (const row of rows) {
      const role = row.role === 'owner' ? 'master' : (row.role || 'viewer');
      await pg.raw(`INSERT INTO zalo_account_memberships (user_id, account_id, role, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id, account_id) DO NOTHING`, [row.user_id, row.account_id, role, row.created_at || new Date().toISOString()]);
    }
    console.log(`Migrated ${rows.length} memberships (owner → master)`);
  } catch (e) { console.error('memberships:', (e as Error).message); }

  sqlite.close();
  await pg.destroy();
  console.log('Migration complete!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
