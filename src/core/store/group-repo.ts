import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { GoldGroupMemberRecord, GoldGroupRecord } from '../types.js';
import { nowIso } from './helpers.js';
import type { RawGroupRow } from './helpers.js';

export class GoldGroupRepo {
  private db: DatabaseSync;
  private resolveAccountId: (accountId?: string) => string | undefined;
  private requireAccountId: (accountId?: string) => string;
  private runInTransaction: (work: () => void) => void;

  constructor(
    db: DatabaseSync,
    resolveAccountId: (accountId?: string) => string | undefined,
    requireAccountId: (accountId?: string) => string,
    runInTransaction: (work: () => void) => void,
  ) {
    this.db = db;
    this.resolveAccountId = resolveAccountId;
    this.requireAccountId = requireAccountId;
    this.runInTransaction = runInTransaction;
  }

  listGroups(activeAccountId?: string): GoldGroupRecord[] {
    return this.listGroupsByAccount(activeAccountId);
  }

  listGroupsByAccount(accountId?: string): GoldGroupRecord[] {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return [];
    }

    const rows = this.db.prepare(`
      SELECT id, group_id, display_name, avatar, member_count, members_json, last_sync_at
      FROM groups
      WHERE account_id = ?
      ORDER BY display_name COLLATE NOCASE ASC, group_id ASC
    `).all(resolvedAccountId) as RawGroupRow[];

    return rows.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      displayName: row.display_name,
      avatar: row.avatar ?? undefined,
      memberCount: row.member_count ?? undefined,
      members: row.members_json ? JSON.parse(row.members_json) as GoldGroupMemberRecord[] : undefined,
      lastSyncAt: row.last_sync_at,
    } satisfies GoldGroupRecord));
  }

  replaceGroups(activeAccountId: string | undefined, groups: Omit<GoldGroupRecord, 'id'>[]) {
    return this.replaceGroupsByAccount(activeAccountId, groups);
  }

  replaceGroupsByAccount(accountId: string | undefined, groups: Omit<GoldGroupRecord, 'id'>[]) {
    const resolvedAccountId = this.requireAccountId(accountId);

    const timestamp = nowIso();
    this.runInTransaction(() => {
      this.db.prepare('DELETE FROM groups WHERE account_id = ?').run(resolvedAccountId);
      const insertGroup = this.db.prepare(`
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
      `);

      for (const group of groups) {
        insertGroup.run(
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
        );
      }
    });

    return this.listGroupsByAccount(resolvedAccountId);
  }

  upsertGroup(activeAccountId: string | undefined, group: Omit<GoldGroupRecord, 'id'>) {
    return this.upsertGroupByAccount(activeAccountId, group);
  }

  upsertGroupByAccount(accountId: string | undefined, group: Omit<GoldGroupRecord, 'id'>) {
    const resolvedAccountId = this.requireAccountId(accountId);

    const timestamp = nowIso();
    const existing = this.db.prepare(`
      SELECT id
      FROM groups
      WHERE account_id = ? AND group_id = ?
      LIMIT 1
    `).get(resolvedAccountId, group.groupId) as { id: string } | undefined;

    this.db.prepare(`
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
        display_name = excluded.display_name,
        avatar = COALESCE(excluded.avatar, groups.avatar),
        member_count = COALESCE(excluded.member_count, groups.member_count),
        members_json = COALESCE(excluded.members_json, groups.members_json),
        last_sync_at = excluded.last_sync_at,
        updated_at = excluded.updated_at
    `).run(
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
    );

    return this.listGroupsByAccount(resolvedAccountId).find((entry) => entry.groupId === group.groupId);
  }

  getGroupDisplayName(groupId: string, activeAccountId?: string, accountId?: string) {
    const resolvedAccountId = this.resolveAccountId(accountId ?? activeAccountId);
    if (!resolvedAccountId) return undefined;
    const row = this.db.prepare(`
      SELECT display_name
      FROM groups
      WHERE account_id = ? AND group_id = ?
      LIMIT 1
    `).get(resolvedAccountId, groupId) as { display_name: string } | undefined;
    return row?.display_name;
  }

  getGroupAvatar(groupId: string, activeAccountId?: string, accountId?: string) {
    const resolvedAccountId = this.resolveAccountId(accountId ?? activeAccountId);
    if (!resolvedAccountId) return undefined;
    const row = this.db.prepare(`
      SELECT avatar
      FROM groups
      WHERE account_id = ? AND group_id = ?
      LIMIT 1
    `).get(resolvedAccountId, groupId) as { avatar: string | null } | undefined;
    return row?.avatar ?? undefined;
  }
}
