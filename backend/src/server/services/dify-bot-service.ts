import type { Knex } from 'knex';
import crypto from 'crypto';
import type { GoldLogger } from '../../core/logger.js';

export interface DifyBotConfig {
  id: string;
  account_id: string;
  name: string;
  dify_api_key: string | null;
  dify_webhook_url: string;
  bot_token: string;
  enabled: boolean;
  receive_groups?: string[];
  send_groups?: string[];
  created_at: string;
  updated_at: string;
}

export class DifyBotService {
  constructor(
    private readonly knex: Knex,
    private readonly logger: GoldLogger,
  ) {}

  async listBots(accountId?: string): Promise<DifyBotConfig[]> {
    let query = this.knex<DifyBotConfig>('dify_bots').orderBy('created_at', 'desc');
    if (accountId) query = query.where('account_id', accountId);
    const rows = await query;
    return rows.map(row => ({
      ...row,
      receive_groups: Array.isArray(row.receive_groups) ? row.receive_groups : [],
      send_groups: Array.isArray(row.send_groups) ? row.send_groups : [],
    }));
  }

  async getBot(id: string): Promise<DifyBotConfig | undefined> {
    return this.knex<DifyBotConfig>('dify_bots').where('id', id).first();
  }

  async getEnabledBotsForAccount(accountId: string): Promise<DifyBotConfig[]> {
    return this.knex<DifyBotConfig>('dify_bots')
      .where('account_id', accountId)
      .where('enabled', true);
  }

  async findByToken(token: string): Promise<DifyBotConfig | undefined> {
    return this.knex<DifyBotConfig>('dify_bots')
      .where('bot_token', token)
      .where('enabled', true)
      .first();
  }

  async createBot(data: Omit<DifyBotConfig, 'id' | 'created_at' | 'updated_at' | 'bot_token'>): Promise<DifyBotConfig> {
    const bot_token = 'zhb_' + crypto.randomBytes(24).toString('base64url');
    const [bot] = await this.knex<DifyBotConfig>('dify_bots')
      .insert({
        account_id: data.account_id,
        name: data.name,
        dify_api_key: data.dify_api_key || '',
        dify_webhook_url: data.dify_webhook_url,
        enabled: data.enabled ?? true,
        bot_token,
        receive_groups: this.knex.raw('?::jsonb', [JSON.stringify(data.receive_groups ?? [])]),
        send_groups: this.knex.raw('?::jsonb', [JSON.stringify(data.send_groups ?? [])]),
      })
      .returning('*');
    return bot;
  }

  async updateBot(id: string, data: Partial<Omit<DifyBotConfig, 'id' | 'created_at'>>): Promise<DifyBotConfig | undefined> {
    const updateData: Record<string, unknown> = { ...data, updated_at: this.knex.fn.now() };
    if (data.receive_groups !== undefined) updateData.receive_groups = this.knex.raw('?::jsonb', [JSON.stringify(data.receive_groups)]);
    if (data.send_groups !== undefined) updateData.send_groups = this.knex.raw('?::jsonb', [JSON.stringify(data.send_groups)]);
    const [bot] = await this.knex<DifyBotConfig>('dify_bots')
      .where('id', id)
      .update(updateData as any)
      .returning('*');
    return bot;
  }

  async deleteBot(id: string): Promise<boolean> {
    const count = await this.knex('dify_bots').where('id', id).delete();
    return count > 0;
  }
}
