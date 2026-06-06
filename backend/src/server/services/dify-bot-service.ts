import type { Knex } from 'knex';
import type { GoldLogger } from '../../core/logger.js';

export interface DifyBotConfig {
  id: string;
  account_id: string;
  name: string;
  dify_api_key: string;
  dify_webhook_url: string;
  enabled: boolean;
  filter_mode: 'all' | 'keywords' | 'mention';
  filter_keywords: string[];
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
    return query;
  }

  async getBot(id: string): Promise<DifyBotConfig | undefined> {
    return this.knex<DifyBotConfig>('dify_bots').where('id', id).first();
  }

  async getEnabledBotsForAccount(accountId: string): Promise<DifyBotConfig[]> {
    return this.knex<DifyBotConfig>('dify_bots')
      .where('account_id', accountId)
      .where('enabled', true);
  }

  async createBot(data: Omit<DifyBotConfig, 'id' | 'created_at' | 'updated_at'>): Promise<DifyBotConfig> {
    const [bot] = await this.knex<DifyBotConfig>('dify_bots').insert(data).returning('*');
    return bot;
  }

  async updateBot(id: string, data: Partial<Omit<DifyBotConfig, 'id' | 'created_at'>>): Promise<DifyBotConfig | undefined> {
    const [bot] = await this.knex<DifyBotConfig>('dify_bots')
      .where('id', id)
      .update({ ...data, updated_at: this.knex.fn.now() })
      .returning('*');
    return bot;
  }

  async deleteBot(id: string): Promise<boolean> {
    const count = await this.knex('dify_bots').where('id', id).delete();
    return count > 0;
  }
}
