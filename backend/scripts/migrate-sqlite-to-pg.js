const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");

const sqlitePath = path.resolve(process.env.HOME, "zalohub/data/gold-4.sqlite");

async function main() {
  const knex = require("knex")({
    client: "pg",
    connection: process.env.DATABASE_URL || "postgresql://zalohub:zalohub@localhost:5433/zalohub",
  });

  if (!require("fs").existsSync(sqlitePath)) {
    console.log("No sqlite database found at", sqlitePath);
    await knex.destroy();
    return;
  }

  const sqlite = new DatabaseSync(sqlitePath);
  console.log("Migrating from", sqlitePath);

  // 1. accounts
  const accounts = sqlite.prepare("SELECT * FROM accounts").all();
  for (const row of accounts) {
    await knex.raw("INSERT INTO accounts (account_id, hub_alias, display_name, phone_number, avatar, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (account_id) DO NOTHING", [row.account_id, row.hub_alias, row.display_name, row.phone_number, row.avatar, row.created_at || new Date().toISOString(), row.updated_at || new Date().toISOString(), row.last_login_at]);
  }
  console.log("accounts:", accounts.length);

  // 2. account_sessions  
  const sessions = sqlite.prepare("SELECT * FROM account_sessions").all();
  for (const row of sessions) {
    await knex.raw("INSERT INTO account_sessions (account_id, cookie_json, imei, user_agent, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (account_id) DO NOTHING", [row.account_id, row.cookie_json || "{}", row.imei || "", row.user_agent || "", row.is_active || 0, row.created_at || new Date().toISOString(), row.updated_at || new Date().toISOString()]);
  }
  console.log("sessions:", sessions.length);

  // 3. friends
  const friends = sqlite.prepare("SELECT * FROM friends").all();
  for (const row of friends) {
    await knex.raw("INSERT INTO friends (id, account_id, friend_id, display_name, zalo_name, zalo_alias, hub_alias, avatar, status, phone_number, last_sync_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (account_id, friend_id) DO NOTHING", [row.id, row.account_id, row.friend_id, row.display_name, row.zalo_name, row.zalo_alias, row.hub_alias, row.avatar, row.status, row.phone_number, row.last_sync_at || new Date().toISOString(), row.created_at || new Date().toISOString(), row.updated_at || new Date().toISOString()]);
  }
  console.log("friends:", friends.length);

  // 4. conversations
  const conversations = sqlite.prepare("SELECT * FROM conversations").all();
  for (const row of conversations) {
    await knex.raw("INSERT INTO conversations (id, account_id, thread_id, type, title, avatar, friend_id, display_name_snapshot, last_message_text, last_message_kind, last_direction, last_message_timestamp, message_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (account_id, friend_id) DO NOTHING", [row.id, row.account_id, row.thread_id, row.type || "direct", row.title, row.avatar, row.friend_id, row.display_name_snapshot, row.last_message_text || "", row.last_message_kind || "text", row.last_direction || "incoming", row.last_message_timestamp || "", row.message_count || 0, row.created_at || new Date().toISOString(), row.updated_at || new Date().toISOString()]);
  }
  console.log("conversations:", conversations.length);

  // 5. messages
  const messages = sqlite.prepare("SELECT * FROM messages").all();
  for (const row of messages) {
    const rawJson = row.raw_message_json ? (Buffer.isBuffer(row.raw_message_json) ? row.raw_message_json.toString() : row.raw_message_json) : null;
    await knex.raw("INSERT INTO messages (id, conversation_id, account_id, thread_id, conversation_type, friend_id, provider_message_id, sender_id, sender_name, direction, kind, text, image_url, is_self, timestamp, raw_summary_json, raw_message_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING", [row.id, row.conversation_id, row.account_id, row.thread_id, row.conversation_type, row.friend_id, row.provider_message_id, row.sender_id, row.sender_name, row.direction || "incoming", row.kind || "text", row.text || "", row.image_url, row.is_self || 0, row.timestamp, row.raw_summary_json, rawJson, row.created_at || new Date().toISOString()]);
  }
  console.log("messages:", messages.length);

  // 6. groups
  const groups = sqlite.prepare("SELECT * FROM groups").all();
  for (const row of groups) {
    const mj = row.members_json ? (Buffer.isBuffer(row.members_json) ? row.members_json.toString() : row.members_json) : null;
    await knex.raw("INSERT INTO groups (id, account_id, group_id, display_name, avatar, member_count, members_json, last_sync_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (account_id, group_id) DO NOTHING", [row.id, row.account_id, row.group_id, row.display_name || "", row.avatar, row.member_count, mj, row.last_sync_at || new Date().toISOString(), row.created_at || new Date().toISOString(), row.updated_at || new Date().toISOString()]);
  }
  console.log("groups:", groups.length);

  // 7. attachments
  const attachments = sqlite.prepare("SELECT * FROM attachments").all();
  for (const row of attachments) {
    await knex.raw("INSERT INTO attachments (id, message_id, type, url, source_url, local_path, thumbnail_url, thumbnail_source_url, thumbnail_local_path, file_name, mime_type, size, width, height, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING", [row.id, row.message_id, row.type || "file", row.url, row.source_url, row.local_path, row.thumbnail_url, row.thumbnail_source_url, row.thumbnail_local_path, row.file_name, row.mime_type, row.size, row.width, row.height, row.duration, row.created_at || new Date().toISOString()]);
  }
  console.log("attachments:", attachments.length);

  // 8. system_users
  const sysUsers = sqlite.prepare("SELECT * FROM system_users").all();
  for (const row of sysUsers) {
    await knex.raw("INSERT INTO system_users (id, email, password_hash, display_name, role, avatar, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (email) DO NOTHING", [row.id, row.email, row.password_hash, row.display_name, row.role || "user", row.avatar, row.type || "human", row.created_at || new Date().toISOString()]);
  }
  console.log("system_users:", sysUsers.length);

  // 9. system_sessions
  const sysSessions = sqlite.prepare("SELECT * FROM system_sessions").all();
  for (const row of sysSessions) {
    await knex.raw("INSERT INTO system_sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (token) DO NOTHING", [row.token, row.user_id, row.expires_at, row.created_at || new Date().toISOString()]);
  }
  console.log("system_sessions:", sysSessions.length);

  // 10. zalo_account_memberships (owner → master)
  const memberships = sqlite.prepare("SELECT * FROM zalo_account_memberships").all();
  for (const row of memberships) {
    const role = row.role === "owner" ? "master" : (row.role || "viewer");
    await knex.raw("INSERT INTO zalo_account_memberships (user_id, account_id, role, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, account_id) DO NOTHING", [row.user_id, row.account_id, role, row.created_at || new Date().toISOString()]);
  }
  console.log("memberships:", memberships.length, "(owner→master)");

  sqlite.close();
  await knex.destroy();
  console.log("\nMigration complete!");
}

main().catch((err) => { console.error("FAILED:", err.message); process.exit(1); });
