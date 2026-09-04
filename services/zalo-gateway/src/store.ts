import knexConstructor, { type Knex } from 'knex';
import { config } from './config.js';

export type StoredCredential = {
  cookie: string;
  imei: string;
  userAgent: string;
};

export type GatewayAccount = {
  accountId: string;
  displayName?: string;
  phoneNumber?: string;
  avatar?: string;
  hasCredential: boolean;
};

export class GatewayStore {
  readonly knex: Knex;
  private readonly schema = config.databaseSchema;

  constructor() {
    this.knex = knexConstructor({
      client: 'pg',
      connection: config.databaseUrl,
      pool: { min: 1, max: process.env.NODE_ENV === 'production' ? 20 : 5 },
    });
  }

  async migrate() {
    await this.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
    await this.knex.raw(`CREATE TABLE IF NOT EXISTS ${this.schema}.accounts (
      account_id TEXT PRIMARY KEY,
      display_name TEXT,
      phone_number TEXT,
      avatar TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    )`);
    await this.knex.raw(`CREATE TABLE IF NOT EXISTS ${this.schema}.account_sessions (
      account_id TEXT PRIMARY KEY REFERENCES ${this.schema}.accounts(account_id) ON DELETE CASCADE,
      cookie_json JSONB NOT NULL,
      imei VARCHAR(100) NOT NULL,
      user_agent TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }

  async ready() {
    await this.knex.raw('SELECT 1');
  }

  async saveAccount(account: Omit<GatewayAccount, 'hasCredential'>, credential: StoredCredential) {
    await this.knex.transaction(async (trx) => {
      await trx.raw(`INSERT INTO ${this.schema}.accounts (account_id, display_name, phone_number, avatar, last_login_at)
        VALUES (?, ?, ?, ?, NOW())
        ON CONFLICT (account_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          phone_number = EXCLUDED.phone_number,
          avatar = EXCLUDED.avatar,
          last_login_at = NOW(),
          updated_at = NOW()`, [account.accountId, account.displayName ?? null, account.phoneNumber ?? null, account.avatar ?? null]);
      await trx.raw(`INSERT INTO ${this.schema}.account_sessions (account_id, cookie_json, imei, user_agent, is_active)
        VALUES (?, ?::jsonb, ?, ?, TRUE)
        ON CONFLICT (account_id) DO UPDATE SET
          cookie_json = EXCLUDED.cookie_json,
          imei = EXCLUDED.imei,
          user_agent = EXCLUDED.user_agent,
          is_active = TRUE,
          updated_at = NOW()`, [account.accountId, credential.cookie, credential.imei, credential.userAgent]);
    });
  }

  async getCredential(accountId: string): Promise<StoredCredential | undefined> {
    const { rows } = await this.knex.raw(`SELECT cookie_json, imei, user_agent FROM ${this.schema}.account_sessions
      WHERE account_id = ? AND is_active = TRUE LIMIT 1`, [accountId]);
    const row = rows[0] as { cookie_json: unknown; imei: string; user_agent: string } | undefined;
    if (!row) return undefined;
    return { cookie: typeof row.cookie_json === 'string' ? row.cookie_json : JSON.stringify(row.cookie_json), imei: row.imei, userAgent: row.user_agent };
  }

  async getAccount(accountId: string): Promise<GatewayAccount | undefined> {
    const { rows } = await this.knex.raw(`SELECT a.account_id, a.display_name, a.phone_number, a.avatar,
      EXISTS(SELECT 1 FROM ${this.schema}.account_sessions s WHERE s.account_id = a.account_id AND s.is_active = TRUE) AS has_credential
      FROM ${this.schema}.accounts a WHERE a.account_id = ? LIMIT 1`, [accountId]);
    const row = rows[0] as { account_id: string; display_name: string | null; phone_number: string | null; avatar: string | null; has_credential: boolean } | undefined;
    if (!row) return undefined;
    return { accountId: row.account_id, displayName: row.display_name ?? undefined, phoneNumber: row.phone_number ?? undefined, avatar: row.avatar ?? undefined, hasCredential: row.has_credential };
  }

  async deactivateSession(accountId: string) {
    await this.knex.raw(`UPDATE ${this.schema}.account_sessions SET is_active = FALSE, updated_at = NOW() WHERE account_id = ?`, [accountId]);
  }
}
