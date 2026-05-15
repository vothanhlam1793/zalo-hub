import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import type { GoldGroupMemberRecord, GoldGroupRecord } from '../types.js';
import { nowIso } from './helpers.js';
import type { RawGroupRow } from './helpers.js';

export class GoldGroupRepo {
  private knex: Knex;
  private resolveAccountId: (accountId?: string) => string | undefined;
  private requireAccountId: (accountId?: string) => string;

  constructor(
    knex: Knex,
    resolveAccountId: (accountId?: string) => string | undefined,
    requireAccountId: (accountId?: string) => string,
  ) {
    this.knex = knex;
    this.resolveAccountId = resolveAccountId;
    this.requireAccountId = requireAccountId;
  }

  async listGroups(activeAccountId?: string): Promise<GoldGroupRecord[]> {
    return this.listGroupsByAccount(activeAccountId);
  }

  async listGroupsByAccount(accountId?: string): Promise<GoldGroupRecord[]> {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return [];
    }

    const rows = (await this.knex.raw(`
      SELECT id, group_id, display_name, avatar, member_count, members_json, last_sync_at
      FROM groups
      WHERE account_id = ?
      ORDER BY LOWER(display_name) ASC, group_id ASC
    `, [resolvedAccountId])).rows as RawGroupRow[];

    return rows.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      displayName: row.display_name,
      avatar: row.avatar ?? undefined,
      memberCount: row.member_count ?? undefined,
      members: (() => {
        if (!row.members_json) return undefined;
        if (typeof row.members_json !== 'string') return row.members_json as GoldGroupMemberRecord[];
        const raw = row.members_json.trim();
        if (!raw) return undefined;
        try {
          return JSON.parse(raw) as GoldGroupMemberRecord[];
        } catch {
          return undefined;
        }
      })(),
      lastSyncAt: row.last_sync_at,
    } satisfies GoldGroupRecord));
  }

  async replaceGroups(activeAccountId: string | undefined, groups: Omit<GoldGroupRecord, 'id'>[]) {
    return this.replaceGroupsByAccount(activeAccountId, groups);
  }

  async replaceGroupsByAccount(accountId: string | undefined, groups: Omit<GoldGroupRecord, 'id'>[]) {
    const resolvedAccountId = this.requireAccountId(accountId);

    const timestamp = nowIso();
    await this.knex.transaction(async (trx) => {
      await trx.raw('DELETE FROM groups WHERE account_id = ?', [resolvedAccountId]);

      for (const group of groups) {
        await trx.raw(`
          INSERT INTO groups (
            id,
            account_id,
            group_id,
            display_name,
            avatar,
            member_count,
            members_json,
            last_sync_at,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          randomUUID(),
          resolvedAccountId,
          group.groupId,
          group.displayName,
          group.avatar ?? null,
          group.memberCount ?? null,
          group.members ? JSON.stringify(group.members) : null,
          group.lastSyncAt,
          timestamp,
          timestamp,
        ]);
      }
    });

    return this.listGroupsByAccount(resolvedAccountId);
  }

  async upsertGroup(activeAccountId: string | undefined, group: Omit<GoldGroupRecord, 'id'>) {
    return this.upsertGroupByAccount(activeAccountId, group);
  }

  async upsertGroupByAccount(accountId: string | undefined, group: Omit<GoldGroupRecord, 'id'>) {
    const resolvedAccountId = this.requireAccountId(accountId);

    const timestamp = nowIso();
    const existingRows = (await this.knex.raw(`
      SELECT id
      FROM groups
      WHERE account_id = ? AND group_id = ?
      LIMIT 1
    `, [resolvedAccountId, group.groupId])).rows as Array<{ id: string }>;

    const existing = existingRows[0];

    await this.knex.raw(`
      INSERT INTO groups (
        id,
        account_id,
        group_id,
        display_name,
        avatar,
        member_count,
        members_json,
        last_sync_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, group_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        avatar = COALESCE(EXCLUDED.avatar, groups.avatar),
        member_count = COALESCE(EXCLUDED.member_count, groups.member_count),
        members_json = COALESCE(EXCLUDED.members_json, groups.members_json),
        last_sync_at = EXCLUDED.last_sync_at,
        updated_at = EXCLUDED.updated_at
    `, [
      existing?.id ?? randomUUID(),
      resolvedAccountId,
      group.groupId,
      group.displayName,
      group.avatar ?? null,
      group.memberCount ?? null,
      group.members ? JSON.stringify(group.members) : null,
      group.lastSyncAt,
      timestamp,
      timestamp,
    ]);

    const allGroups = await this.listGroupsByAccount(resolvedAccountId);
    return allGroups.find((entry) => entry.groupId === group.groupId);
  }

  async getGroupDisplayName(groupId: string, activeAccountId?: string, accountId?: string) {
    const resolvedAccountId = this.resolveAccountId(accountId ?? activeAccountId);
    if (!resolvedAccountId) return undefined;
    const rows = (await this.knex.raw(`
      SELECT display_name
      FROM groups
      WHERE account_id = ? AND group_id = ?
      LIMIT 1
    `, [resolvedAccountId, groupId])).rows as Array<{ display_name: string }>;
    return rows[0]?.display_name;
  }

  async getGroupAvatar(groupId: string, activeAccountId?: string, accountId?: string) {
    const resolvedAccountId = this.resolveAccountId(accountId ?? activeAccountId);
    if (!resolvedAccountId) return undefined;
    const rows = (await this.knex.raw(`
      SELECT avatar
      FROM groups
      WHERE account_id = ? AND group_id = ?
      LIMIT 1
    `, [resolvedAccountId, groupId])).rows as Array<{ avatar: string | null }>;
    return rows[0]?.avatar ?? undefined;
  }
}
