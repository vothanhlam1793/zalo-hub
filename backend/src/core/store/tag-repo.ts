import type { Knex } from 'knex';
import type { GoldTagItem, GoldTagSource } from '../types.js';

export interface RawTagRow {
  id: string;
  name: string;
  color: string;
  emoji: string | null;
  source: GoldTagSource;
  zalo_label_id: number | null;
  account_id: string | null;
  created_at: string;
  updated_at: string;
}

export class GoldTagRepo {
  private knex: Knex;

  constructor(knex: Knex) {
    this.knex = knex;
  }

  async listTags(accountId?: string): Promise<GoldTagItem[]> {
    let query = this.knex('tags').select('*').orderBy('name', 'asc');
    if (accountId) {
      query = query.where((qb) => {
        qb.whereNull('account_id').orWhere('account_id', accountId);
      });
    }
    const rows: RawTagRow[] = await query;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      emoji: r.emoji ?? undefined,
      source: r.source,
      zaloLabelId: r.zalo_label_id ?? undefined,
      accountId: r.account_id ?? undefined,
    }));
  }

  async createTag(params: {
    name: string;
    color?: string;
    emoji?: string;
    source?: GoldTagSource;
    zaloLabelId?: number;
    accountId?: string;
  }): Promise<GoldTagItem> {
    const [row]: RawTagRow[] = await this.knex('tags')
      .insert({
        name: params.name,
        color: params.color || '#1890ff',
        emoji: params.emoji || null,
        source: params.source || 'system',
        zalo_label_id: params.zaloLabelId ?? null,
        account_id: params.accountId ?? null,
        updated_at: this.knex.fn.now(),
      })
      .returning('*');

    return {
      id: row.id,
      name: row.name,
      color: row.color,
      emoji: row.emoji ?? undefined,
      source: row.source,
      zaloLabelId: row.zalo_label_id ?? undefined,
      accountId: row.account_id ?? undefined,
    };
  }

  async deleteTag(tagId: string): Promise<boolean> {
    const count = await this.knex('tags').where('id', tagId).delete();
    return count > 0;
  }

  async assignTagToConversation(conversationId: string, tagId: string, assignedBy = 'manual'): Promise<void> {
    await this.knex.raw(`
      INSERT INTO conversation_tags (conversation_id, tag_id, assigned_by, created_at)
      VALUES (?, ?, ?, NOW())
      ON CONFLICT (conversation_id, tag_id) DO NOTHING
    `, [conversationId, tagId, assignedBy]);

    await this.refreshConversationLabelsCache(conversationId);
  }

  async removeTagFromConversation(conversationId: string, tagId: string): Promise<void> {
    await this.knex('conversation_tags')
      .where({ conversation_id: conversationId, tag_id: tagId })
      .delete();

    await this.refreshConversationLabelsCache(conversationId);
  }

  async getConversationTags(conversationId: string): Promise<GoldTagItem[]> {
    const rows: RawTagRow[] = await this.knex('tags')
      .join('conversation_tags', 'tags.id', 'conversation_tags.tag_id')
      .where('conversation_tags.conversation_id', conversationId)
      .select('tags.*');

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      emoji: r.emoji ?? undefined,
      source: r.source,
      zaloLabelId: r.zalo_label_id ?? undefined,
      accountId: r.account_id ?? undefined,
    }));
  }

  async refreshConversationLabelsCache(conversationId: string): Promise<void> {
    const tags = await this.getConversationTags(conversationId);
    await this.knex('conversations')
      .where('id', conversationId)
      .update({
        labels_json: JSON.stringify(tags),
        updated_at: this.knex.fn.now(),
      });
  }

  async syncZaloLabels(
    accountId: string,
    zaloLabels: Array<{
      id: number;
      text: string;
      color: string;
      emoji?: string;
      conversations?: string[];
    }>,
  ): Promise<void> {
    await this.knex.transaction(async (trx) => {
      for (const zl of zaloLabels) {
        // Upsert tag
        const existing = await trx('tags')
          .where({ account_id: accountId, zalo_label_id: zl.id })
          .first();

        let tagId: string;
        if (existing) {
          tagId = existing.id;
          await trx('tags')
            .where('id', tagId)
            .update({
              name: zl.text,
              color: zl.color,
              emoji: zl.emoji || null,
              updated_at: trx.fn.now(),
            });
        } else {
          const [inserted] = await trx('tags')
            .insert({
              name: zl.text,
              color: zl.color,
              emoji: zl.emoji || null,
              source: 'zalo',
              zalo_label_id: zl.id,
              account_id: accountId,
              updated_at: trx.fn.now(),
            })
            .returning('id');
          tagId = inserted.id || inserted;
        }

        // Map conversations if available
        if (Array.isArray(zl.conversations) && zl.conversations.length > 0) {
          for (const threadId of zl.conversations) {
            // Check direct and group conversation ids
            const convs = await trx('conversations')
              .where('account_id', accountId)
              .andWhere((qb) => {
                qb.where('thread_id', threadId)
                  .orWhere('friend_id', threadId)
                  .orWhere('friend_id', `group:${threadId}`)
                  .orWhere('id', threadId);
              })
              .select('id');

            for (const conv of convs) {
              await trx.raw(`
                INSERT INTO conversation_tags (conversation_id, tag_id, assigned_by, created_at)
                VALUES (?, ?, 'zalo_sync', NOW())
                ON CONFLICT (conversation_id, tag_id) DO NOTHING
              `, [conv.id, tagId]);
            }
          }
        }
      }
    });

    // Refresh all conversation labels_json for this account
    const convRows = await this.knex('conversations').where('account_id', accountId).select('id');
    for (const c of convRows) {
      await this.refreshConversationLabelsCache(c.id);
    }
  }
}
