import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import knexLib from "knex";

const sqlitePath = path.resolve(process.env.HOME || "/home/leco", "zalohub/data/gold-4.sqlite");

const knex = knexLib({
  client: "pg",
  connection: process.env.DATABASE_URL || "postgresql://zalohub:zalohub@localhost:5433/zalohub",
});

async function main() {
  if (!fs.existsSync(sqlitePath)) {
    console.log("No sqlite at", sqlitePath);
    await knex.destroy();
    return;
  }
  const sqlite = new DatabaseSync(sqlitePath);
  console.log("Migrating from", sqlitePath);

  const accounts = sqlite.prepare("SELECT * FROM accounts").all();
  for (const r of accounts) {
    await knex.raw(
      `INSERT INTO accounts (account_id, hub_alias, display_name, phone_number, avatar, created_at, updated_at, last_login_at) VALUES (:a, :b, :c, :d, :e, :f, :g, :h) ON CONFLICT (account_id) DO NOTHING`,
      { a: r.account_id, b: r.hub_alias, c: r.display_name, d: r.phone_number, e: r.avatar, f: r.created_at || new Date().toISOString(), g: r.updated_at || new Date().toISOString(), h: r.last_login_at }
    );
  }
  console.log("accounts:", accounts.length);

  const sessions = sqlite.prepare("SELECT * FROM account_sessions").all();
  for (const r of sessions) {
    await knex.raw(
      `INSERT INTO account_sessions (account_id, cookie_json, imei, user_agent, is_active, created_at, updated_at) VALUES (:a, :b, :c, :d, :e, :f, :g) ON CONFLICT (account_id) DO NOTHING`,
      { a: r.account_id, b: r.cookie_json || "{}", c: r.imei || "", d: r.user_agent || "", e: r.is_active || 0, f: r.created_at || new Date().toISOString(), g: r.updated_at || new Date().toISOString() }
    );
  }
  console.log("sessions:", sessions.length);

  const friends = sqlite.prepare("SELECT * FROM friends").all();
  for (const r of friends) {
    await knex.raw(
      `INSERT INTO friends (id, account_id, friend_id, display_name, zalo_name, zalo_alias, hub_alias, avatar, status, phone_number, last_sync_at, created_at, updated_at) VALUES (:a, :b, :c, :d, :e, :f, :g, :h, :i, :j, :k, :l, :m) ON CONFLICT (account_id, friend_id) DO NOTHING`,
      { a: r.id, b: r.account_id, c: r.friend_id, d: r.display_name, e: r.zalo_name, f: r.zalo_alias, g: r.hub_alias, h: r.avatar, i: r.status, j: r.phone_number, k: r.last_sync_at || new Date().toISOString(), l: r.created_at || new Date().toISOString(), m: r.updated_at || new Date().toISOString() }
    );
  }
  console.log("friends:", friends.length);

  const convs = sqlite.prepare("SELECT * FROM conversations").all();
  for (const r of convs) {
    await knex.raw(
      `INSERT INTO conversations (id, account_id, thread_id, type, title, avatar, friend_id, display_name_snapshot, last_message_text, last_message_kind, last_direction, last_message_timestamp, message_count, created_at, updated_at) VALUES (:a, :b, :c, :d, :e, :f, :g, :h, :i, :j, :k, :l, :m, :n, :o) ON CONFLICT (account_id, friend_id) DO NOTHING`,
      { a: r.id, b: r.account_id, c: r.thread_id, d: r.type || "direct", e: r.title, f: r.avatar, g: r.friend_id, h: r.display_name_snapshot, i: r.last_message_text || "", j: r.last_message_kind || "text", k: r.last_direction || "incoming", l: r.last_message_timestamp || "", m: r.message_count || 0, n: r.created_at || new Date().toISOString(), o: r.updated_at || new Date().toISOString() }
    );
  }
  console.log("conversations:", convs.length);

  const msgs = sqlite.prepare("SELECT * FROM messages").all();
  for (const r of msgs) {
    const raw = r.raw_message_json ? (Buffer.isBuffer(r.raw_message_json) ? r.raw_message_json.toString() : r.raw_message_json) : null;
    await knex.raw(
      `INSERT INTO messages (id, conversation_id, account_id, thread_id, conversation_type, friend_id, provider_message_id, sender_id, sender_name, direction, kind, text, image_url, is_self, timestamp, raw_summary_json, raw_message_json, created_at) VALUES (:a, :b, :c, :d, :e, :f, :g, :h, :i, :j, :k, :l, :m, :n, :o, :p, :q, :r) ON CONFLICT (id) DO NOTHING`,
      { a: r.id, b: r.conversation_id, c: r.account_id, d: r.thread_id, e: r.conversation_type, f: r.friend_id, g: r.provider_message_id, h: r.sender_id, i: r.sender_name, j: r.direction || "incoming", k: r.kind || "text", l: r.text || "", m: r.image_url, n: r.is_self || 0, o: r.timestamp, p: r.raw_summary_json, q: raw, r: r.created_at || new Date().toISOString() }
    );
  }
  console.log("messages:", msgs.length);

  const groups = sqlite.prepare("SELECT * FROM groups").all();
  for (const r of groups) {
    const mj = r.members_json ? (Buffer.isBuffer(r.members_json) ? r.members_json.toString() : r.members_json) : null;
    await knex.raw(
      `INSERT INTO groups (id, account_id, group_id, display_name, avatar, member_count, members_json, last_sync_at, created_at, updated_at) VALUES (:a, :b, :c, :d, :e, :f, :g, :h, :i, :j) ON CONFLICT (account_id, group_id) DO NOTHING`,
      { a: r.id, b: r.account_id, c: r.group_id, d: r.display_name || "", e: r.avatar, f: r.member_count, g: mj, h: r.last_sync_at || new Date().toISOString(), i: r.created_at || new Date().toISOString(), j: r.updated_at || new Date().toISOString() }
    );
  }
  console.log("groups:", groups.length);

  const atts = sqlite.prepare("SELECT * FROM attachments").all();
  for (const r of atts) {
    await knex.raw(
      `INSERT INTO attachments (id, message_id, type, url, source_url, local_path, thumbnail_url, thumbnail_source_url, thumbnail_local_path, file_name, mime_type, size, width, height, duration, created_at) VALUES (:a, :b, :c, :d, :e, :f, :g, :h, :i, :j, :k, :l, :m, :n, :o, :p) ON CONFLICT (id) DO NOTHING`,
      { a: r.id, b: r.message_id, c: r.type || "file", d: r.url, e: r.source_url, f: r.local_path, g: r.thumbnail_url, h: r.thumbnail_source_url, i: r.thumbnail_local_path, j: r.file_name, k: r.mime_type, l: r.size, m: r.width, n: r.height, o: r.duration, p: r.created_at || new Date().toISOString() }
    );
  }
  console.log("attachments:", atts.length);

  const su = sqlite.prepare("SELECT * FROM system_users").all();
  for (const r of su) {
    await knex.raw(
      `INSERT INTO system_users (id, email, password_hash, display_name, role, avatar, type, created_at) VALUES (:a, :b, :c, :d, :e, :f, :g, :h) ON CONFLICT (email) DO NOTHING`,
      { a: r.id, b: r.email, c: r.password_hash, d: r.display_name, e: r.role || "user", f: r.avatar, g: r.type || "human", h: r.created_at || new Date().toISOString() }
    );
  }
  console.log("system_users:", su.length);

  const ss = sqlite.prepare("SELECT * FROM system_sessions").all();
  for (const r of ss) {
    await knex.raw(
      `INSERT INTO system_sessions (token, user_id, expires_at, created_at) VALUES (:a, :b, :c, :d) ON CONFLICT (token) DO NOTHING`,
      { a: r.token, b: r.user_id, c: r.expires_at, d: r.created_at || new Date().toISOString() }
    );
  }
  console.log("system_sessions:", ss.length);

  const mems = sqlite.prepare("SELECT * FROM zalo_account_memberships").all();
  for (const r of mems) {
    const role = r.role === "owner" ? "master" : (r.role || "viewer");
    await knex.raw(
      `INSERT INTO zalo_account_memberships (user_id, account_id, role, created_at) VALUES (:a, :b, :c, :d) ON CONFLICT (user_id, account_id) DO NOTHING`,
      { a: r.user_id, b: r.account_id, c: role, d: r.created_at || new Date().toISOString() }
    );
  }
  console.log("memberships:", mems.length, "(owner→master)");

  sqlite.close();
  await knex.destroy();
  console.log("\n✅ Migration complete!");
}

main().catch((err) => { console.error("FAILED:", err.message); process.exit(1); });
