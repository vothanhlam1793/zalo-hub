import type { Knex } from 'knex';
import type {
  GoldAccountRecord,
  GoldStoredCredential,
} from '../types.js';
import { nowIso } from './helpers.js';
import type { RawCredentialRow } from './helpers.js';

type AccountRecord = GoldAccountRecord;

export class GoldAccountRepo {
  readonly knex: Knex;
  activeAccountId?: string;

  constructor(knex: Knex) {
    this.knex = knex;
  }

  async init() {
    this.activeAccountId = await this.getMetaValue('active_account_id') ?? await this.getLatestAccountId();
  }

  async getCredential() {
    const pendingCredential = await this.getPendingCredential();
    if (pendingCredential) {
      return pendingCredential;
    }

    if (!this.activeAccountId) {
      return undefined;
    }

    const rows = (await this.knex.raw(`
      SELECT cookie_json, imei, user_agent, is_active
      FROM account_sessions
      WHERE account_id = ? AND is_active = 1
      LIMIT 1
    `, [this.activeAccountId])).rows as RawCredentialRow[];

    const row = rows[0];
    if (!row) {
      return undefined;
    }

    return {
      cookie: typeof row.cookie_json === 'string' ? row.cookie_json : JSON.stringify(row.cookie_json),
      imei: row.imei,
      userAgent: row.user_agent,
    } satisfies GoldStoredCredential;
  }

  async getCredentialForAccount(accountId: string) {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      return undefined;
    }

    const rows = (await this.knex.raw(`
      SELECT cookie_json, imei, user_agent, is_active
      FROM account_sessions
      WHERE account_id = ? AND is_active = 1
      LIMIT 1
    `, [normalizedAccountId])).rows as RawCredentialRow[];

    const row = rows[0];
    if (!row) {
      return undefined;
    }

    return {
      cookie: typeof row.cookie_json === 'string' ? row.cookie_json : JSON.stringify(row.cookie_json),
      imei: row.imei,
      userAgent: row.user_agent,
    } satisfies GoldStoredCredential;
  }

  async setCredential(credential: GoldStoredCredential) {
    const accountId = this.activeAccountId ?? await this.getLatestAccountId();
    if (!accountId) {
      await this.setMetaValue('pending_credential_json', JSON.stringify(credential));
      return;
    }

    const timestamp = nowIso();
    await this.knex.raw(`
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
        cookie_json = EXCLUDED.cookie_json,
        imei = EXCLUDED.imei,
        user_agent = EXCLUDED.user_agent,
        is_active = 1,
        updated_at = EXCLUDED.updated_at
    `, [accountId, credential.cookie, credential.imei, credential.userAgent, timestamp, timestamp]);

    await this.ensureAccountRecord({ accountId });
    await this.setActiveAccountId(accountId);
    await this.clearPendingCredential();
  }

  async setCredentialForAccount(accountId: string, credential: GoldStoredCredential) {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      throw new Error('accountId la bat buoc khi luu credential');
    }

    const timestamp = nowIso();
    await this.ensureAccountRecord({ accountId: normalizedAccountId });
    await this.knex.raw(`
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
        cookie_json = EXCLUDED.cookie_json,
        imei = EXCLUDED.imei,
        user_agent = EXCLUDED.user_agent,
        is_active = 1,
        updated_at = EXCLUDED.updated_at
    `, [normalizedAccountId, credential.cookie, credential.imei, credential.userAgent, timestamp, timestamp]);

    await this.setActiveAccountId(normalizedAccountId);
    await this.clearPendingCredential();
  }

  async setActiveAccount(account: AccountRecord) {
    await this.ensureAccountRecord(account);
    await this.setActiveAccountId(account.accountId);
    await this.knex.raw('UPDATE accounts SET last_login_at = ?, updated_at = ? WHERE account_id = ?', [
      nowIso(),
      nowIso(),
      account.accountId,
    ]);

    const pendingCredential = await this.getPendingCredential();
    if (pendingCredential) {
      await this.setCredential(pendingCredential);
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

  async activateAccount(accountId: string) {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      throw new Error('accountId la bat buoc');
    }

    const account = await this.getAccount(normalizedAccountId);
    if (!account) {
      throw new Error('Khong tim thay account da luu');
    }

    this.activeAccountId = normalizedAccountId;
    await this.setMetaValue('active_account_id', normalizedAccountId);
    return account;
  }

  async updateActiveAccountProfile(profile: { hubAlias?: string; displayName?: string; phoneNumber?: string; avatar?: string }) {
    return this.updateAccountProfile(this.activeAccountId, profile);
  }

  async updateAccountProfile(accountId: string | undefined, profile: { hubAlias?: string; displayName?: string; phoneNumber?: string; avatar?: string }) {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return;
    }

    const existing = await this.getAccount(resolvedAccountId);
    await this.ensureAccountRecord({
      accountId: resolvedAccountId,
      hubAlias: profile.hubAlias ?? existing?.hubAlias,
      displayName: profile.displayName ?? existing?.displayName,
      phoneNumber: profile.phoneNumber ?? existing?.phoneNumber,
      avatar: profile.avatar ?? existing?.avatar,
    });
  }

  async getActiveAccount() {
    if (!this.activeAccountId) {
      return undefined;
    }

    return this.getAccount(this.activeAccountId);
  }

  async listAccounts(): Promise<GoldAccountRecord[]> {
    const rows = (await this.knex.raw(`
      SELECT account_id, hub_alias, display_name, phone_number, avatar
      FROM accounts
      ORDER BY COALESCE(last_login_at, updated_at, created_at) DESC, account_id ASC
    `)).rows as Array<{ account_id: string; hub_alias: string | null; display_name: string | null; phone_number: string | null; avatar: string | null }>;

    return rows.map((row) => ({
      accountId: row.account_id,
      hubAlias: row.hub_alias ?? undefined,
      displayName: row.display_name ?? undefined,
      phoneNumber: row.phone_number ?? undefined,
      avatar: row.avatar ?? undefined,
      isActive: row.account_id === this.activeAccountId,
    } satisfies GoldAccountRecord));
  }

  async clearSession() {
    return this.clearSessionForAccount(this.activeAccountId);
  }

  async clearSessionForAccount(accountId?: string) {
    await this.clearPendingCredential();
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return;
    }

    await this.knex.raw('UPDATE account_sessions SET is_active = 0, updated_at = ? WHERE account_id = ?', [nowIso(), resolvedAccountId]);
  }

  async clearAll() {
    await this.knex.raw(`DELETE FROM attachments`);
    await this.knex.raw(`DELETE FROM messages`);
    await this.knex.raw(`DELETE FROM conversations`);
    await this.knex.raw(`DELETE FROM friends`);
    await this.knex.raw(`DELETE FROM groups`);
    await this.knex.raw(`DELETE FROM account_sessions`);
    await this.knex.raw(`DELETE FROM accounts`);
    await this.knex.raw(`DELETE FROM app_meta`);
    this.activeAccountId = undefined;
  }

  async save() {
    // no-op kept for compatibility
  }

  async getMetaValue(key: string) {
    const rows = (await this.knex.raw('SELECT value FROM app_meta WHERE key = ? LIMIT 1', [key])).rows as Array<{ value: string }>;
    return rows[0]?.value;
  }

  async setMetaValue(key: string, value: string) {
    await this.knex.raw(`
      INSERT INTO app_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
    `, [key, value]);
  }

  private async getAccount(accountId: string) {
    const rows = (await this.knex.raw(`
      SELECT account_id, hub_alias, display_name, phone_number, avatar
      FROM accounts
      WHERE account_id = ?
      LIMIT 1
    `, [accountId])).rows as Array<{ account_id: string; hub_alias: string | null; display_name: string | null; phone_number: string | null; avatar: string | null }>;

    const row = rows[0];
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

  private async ensureAccountRecord(account: AccountRecord) {
    const timestamp = nowIso();
    const existing = await this.getAccount(account.accountId);
    await this.knex.raw(`
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
        hub_alias = COALESCE(accounts.hub_alias, EXCLUDED.hub_alias),
        display_name = EXCLUDED.display_name,
        phone_number = EXCLUDED.phone_number,
        avatar = EXCLUDED.avatar,
        updated_at = EXCLUDED.updated_at,
        last_login_at = COALESCE(EXCLUDED.last_login_at, accounts.last_login_at)
    `, [
      account.accountId,
      account.hubAlias ?? existing?.hubAlias ?? null,
      account.displayName ?? existing?.displayName ?? null,
      account.phoneNumber ?? existing?.phoneNumber ?? null,
      account.avatar ?? existing?.avatar ?? null,
      existing ? timestamp : timestamp,
      timestamp,
      timestamp,
    ]);
  }

  private async setActiveAccountId(accountId: string) {
    this.activeAccountId = accountId;
    await this.setMetaValue('active_account_id', accountId);
  }

  private async getLatestAccountId() {
    const rows = (await this.knex.raw(`
      SELECT account_id
      FROM accounts
      ORDER BY COALESCE(last_login_at, updated_at, created_at) DESC
      LIMIT 1
    `)).rows as Array<{ account_id: string }>;
    return rows[0]?.account_id;
  }

  private async getPendingCredential() {
    const raw = await this.getMetaValue('pending_credential_json');
    if (!raw) {
      return undefined;
    }

    try {
      return JSON.parse(raw) as GoldStoredCredential;
    } catch {
      return undefined;
    }
  }

  private async clearPendingCredential() {
    await this.knex.raw('DELETE FROM app_meta WHERE key = ?', ['pending_credential_json']);
  }
}
