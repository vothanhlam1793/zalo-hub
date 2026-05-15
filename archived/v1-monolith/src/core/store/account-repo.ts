import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir } from '../media-store.js';
import type {
  GoldAccountRecord,
  GoldContactRecord,
  GoldConversationMessage,
  GoldStoredCredential,
} from '../types.js';
import { nowIso } from './helpers.js';
import type { RawCredentialRow } from './helpers.js';

type AccountRecord = GoldAccountRecord;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const legacyStatePath = path.join(dataDir, 'gold-1-state.json');

export class GoldAccountRepo {
  private db: DatabaseSync;
  activeAccountId?: string;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.activeAccountId = this.getMetaValue('active_account_id') ?? this.getLatestAccountId();
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

  getCredentialForAccount(accountId: string) {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      return undefined;
    }

    const row = this.db.prepare(`
      SELECT cookie_json, imei, user_agent, is_active
      FROM account_sessions
      WHERE account_id = ? AND is_active = 1
      LIMIT 1
    `).get(normalizedAccountId) as RawCredentialRow | undefined;

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

  setCredentialForAccount(accountId: string, credential: GoldStoredCredential) {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      throw new Error('accountId la bat buoc khi luu credential');
    }

    const timestamp = nowIso();
    this.ensureAccountRecord({ accountId: normalizedAccountId });
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
    `).run(normalizedAccountId, credential.cookie, credential.imei, credential.userAgent, timestamp, timestamp);

    this.setActiveAccountId(normalizedAccountId);
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

  resolveAccountId(accountId?: string) {
    const normalized = accountId?.trim();
    return normalized || this.activeAccountId;
  }

  requireAccountId(accountId?: string) {
    const resolved = this.resolveAccountId(accountId);
    if (!resolved) {
      throw new Error('accountId la bat buoc');
    }
    return resolved;
  }

  activateAccount(accountId: string) {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      throw new Error('accountId la bat buoc');
    }

    const account = this.getAccount(normalizedAccountId);
    if (!account) {
      throw new Error('Khong tim thay account da luu');
    }

    this.setActiveAccountId(normalizedAccountId);
    return account;
  }

  updateActiveAccountProfile(profile: { hubAlias?: string; displayName?: string; phoneNumber?: string; avatar?: string }) {
    return this.updateAccountProfile(this.activeAccountId, profile);
  }

  updateAccountProfile(accountId: string | undefined, profile: { hubAlias?: string; displayName?: string; phoneNumber?: string; avatar?: string }) {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return;
    }

    const existing = this.getAccount(resolvedAccountId);
    this.ensureAccountRecord({
      accountId: resolvedAccountId,
      hubAlias: profile.hubAlias ?? existing?.hubAlias,
      displayName: profile.displayName ?? existing?.displayName,
      phoneNumber: profile.phoneNumber ?? existing?.phoneNumber,
      avatar: profile.avatar ?? existing?.avatar,
    });
  }

  getActiveAccount() {
    if (!this.activeAccountId) {
      return undefined;
    }

    return this.getAccount(this.activeAccountId);
  }

  listAccounts(): GoldAccountRecord[] {
    const rows = this.db.prepare(`
      SELECT account_id, hub_alias, display_name, phone_number, avatar
      FROM accounts
      ORDER BY COALESCE(last_login_at, updated_at, created_at) DESC, account_id ASC
    `).all() as Array<{ account_id: string; hub_alias: string | null; display_name: string | null; phone_number: string | null; avatar: string | null }>;

    return rows.map((row) => ({
      accountId: row.account_id,
      hubAlias: row.hub_alias ?? undefined,
      displayName: row.display_name ?? undefined,
      phoneNumber: row.phone_number ?? undefined,
      avatar: row.avatar ?? undefined,
      isActive: row.account_id === this.activeAccountId,
    } satisfies GoldAccountRecord));
  }

  clearSession() {
    return this.clearSessionForAccount(this.activeAccountId);
  }

  clearSessionForAccount(accountId?: string) {
    this.clearPendingCredential();
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return;
    }

    this.db.prepare('UPDATE account_sessions SET is_active = 0, updated_at = ? WHERE account_id = ?').run(nowIso(), resolvedAccountId);
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

  private getAccount(accountId: string) {
    const row = this.db.prepare(`
      SELECT account_id, hub_alias, display_name, phone_number, avatar
      FROM accounts
      WHERE account_id = ?
      LIMIT 1
    `).get(accountId) as { account_id: string; hub_alias: string | null; display_name: string | null; phone_number: string | null; avatar: string | null } | undefined;

    if (!row) {
      return undefined;
    }

    return {
      accountId: row.account_id,
      hubAlias: row.hub_alias ?? undefined,
      displayName: row.display_name ?? undefined,
      phoneNumber: row.phone_number ?? undefined,
      avatar: row.avatar ?? undefined,
    } satisfies AccountRecord;
  }

  private ensureAccountRecord(account: AccountRecord) {
    const timestamp = nowIso();
    const existing = this.getAccount(account.accountId);
    this.db.prepare(`
      INSERT INTO accounts (
        account_id,
        hub_alias,
        display_name,
        phone_number,
        avatar,
        created_at,
        updated_at,
        last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        hub_alias = COALESCE(accounts.hub_alias, excluded.hub_alias),
        display_name = excluded.display_name,
        phone_number = excluded.phone_number,
        avatar = excluded.avatar,
        updated_at = excluded.updated_at,
        last_login_at = COALESCE(excluded.last_login_at, accounts.last_login_at)
    `).run(
      account.accountId,
      account.hubAlias ?? existing?.hubAlias ?? null,
      account.displayName ?? existing?.displayName ?? null,
      account.phoneNumber ?? existing?.phoneNumber ?? null,
      account.avatar ?? existing?.avatar ?? null,
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

  getMetaValue(key: string) {
    const row = this.db.prepare('SELECT value FROM app_meta WHERE key = ? LIMIT 1').get(key) as { value: string } | undefined;
    return row?.value;
  }

  setMetaValue(key: string, value: string) {
    this.db.prepare(`
      INSERT INTO app_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  importLegacyStateIfNeeded(
    replaceFriends: (friends: Omit<GoldContactRecord, 'id'>[]) => GoldContactRecord[],
    replaceConversationMessages: (conversationId: string, messages: GoldConversationMessage[]) => GoldConversationMessage[],
  ) {
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

      const fallbackAccountId = this.getMetaValue('active_account_id') ?? this.getLatestAccountId() ?? `legacy-${Date.now()}`;
      this.ensureAccountRecord({ accountId: fallbackAccountId, displayName: 'Legacy account' });
      this.setActiveAccountId(fallbackAccountId);
      this.setCredential(legacy.credential);

      if (legacy.friends?.length) {
        replaceFriends(legacy.friends.map(({ id: _id, ...friend }) => friend));
      }

      if (legacy.conversations) {
        for (const [friendId, messages] of Object.entries(legacy.conversations)) {
          replaceConversationMessages(friendId, messages);
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

  runInTransaction(work: () => void) {
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
