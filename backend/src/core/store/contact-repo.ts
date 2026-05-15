import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import type { GoldContactRecord } from '../types.js';
import { nowIso, resolveContactDisplayName } from './helpers.js';
import type { RawFriendRow } from './helpers.js';

export class GoldContactRepo {
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

  async listContacts(activeAccountId?: string) {
    return this.listContactsByAccount(activeAccountId);
  }

  async listContactsByAccount(accountId?: string) {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return [];
    }

    const rows = (await this.knex.raw(`
      SELECT id, friend_id, display_name, zalo_name, zalo_alias, hub_alias, avatar, status, phone_number, last_sync_at
      FROM friends
      WHERE account_id = ?
      ORDER BY LOWER(display_name) ASC, friend_id ASC
    `, [resolvedAccountId])).rows as RawFriendRow[];

    return rows.map((row) => ({
      id: row.id,
      userId: row.friend_id,
      displayName: resolveContactDisplayName({
        userId: row.friend_id,
        hubAlias: row.hub_alias,
        zaloAlias: row.zalo_alias,
        zaloName: row.zalo_name ?? row.display_name,
        phoneNumber: row.phone_number,
      }),
      zaloName: row.zalo_name ?? undefined,
      zaloAlias: row.zalo_alias ?? undefined,
      hubAlias: row.hub_alias ?? undefined,
      avatar: row.avatar ?? undefined,
      status: row.status ?? undefined,
      phoneNumber: row.phone_number ?? undefined,
      lastSyncAt: row.last_sync_at,
    } satisfies GoldContactRecord));
  }

  async listFriends(activeAccountId?: string) {
    return this.listContacts(activeAccountId);
  }

  async replaceContacts(activeAccountId: string | undefined, friends: Omit<GoldContactRecord, 'id'>[]) {
    return this.replaceContactsByAccount(activeAccountId, friends);
  }

  async replaceContactsByAccount(accountId: string | undefined, friends: Omit<GoldContactRecord, 'id'>[]) {
    const resolvedAccountId = this.requireAccountId(accountId);

    const timestamp = nowIso();
    await this.knex.transaction(async (trx) => {
      await trx.raw('DELETE FROM friends WHERE account_id = ?', [resolvedAccountId]);

      for (const friend of friends) {
        await trx.raw(`
          INSERT INTO friends (
            id,
            account_id,
            friend_id,
            display_name,
            zalo_name,
            zalo_alias,
            hub_alias,
            avatar,
            status,
            phone_number,
            last_sync_at,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          randomUUID(),
          resolvedAccountId,
          friend.userId,
          resolveContactDisplayName({
            userId: friend.userId,
            hubAlias: friend.hubAlias,
            zaloAlias: friend.zaloAlias,
            zaloName: friend.zaloName ?? friend.displayName,
            phoneNumber: friend.phoneNumber,
          }),
          friend.zaloName ?? friend.displayName,
          friend.zaloAlias ?? null,
          friend.hubAlias ?? null,
          friend.avatar ?? null,
          friend.status ?? null,
          friend.phoneNumber ?? null,
          friend.lastSyncAt,
          timestamp,
          timestamp,
        ]);
      }
    });

    return this.listContactsByAccount(resolvedAccountId);
  }

  async upsertContact(activeAccountId: string | undefined, contact: Omit<GoldContactRecord, 'id'>) {
    return this.upsertContactByAccount(activeAccountId, contact);
  }

  async upsertContactByAccount(accountId: string | undefined, contact: Omit<GoldContactRecord, 'id'>) {
    const resolvedAccountId = this.requireAccountId(accountId);

    const timestamp = nowIso();
    const existingRows = (await this.knex.raw(`
      SELECT id
      FROM friends
      WHERE account_id = ? AND friend_id = ?
      LIMIT 1
    `, [resolvedAccountId, contact.userId])).rows as Array<{ id: string }>;

    const existing = existingRows[0];

    await this.knex.raw(`
      INSERT INTO friends (
        id,
        account_id,
        friend_id,
        display_name,
        zalo_name,
        zalo_alias,
        hub_alias,
        avatar,
        status,
        phone_number,
        last_sync_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, friend_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        zalo_name = COALESCE(EXCLUDED.zalo_name, friends.zalo_name),
        zalo_alias = COALESCE(EXCLUDED.zalo_alias, friends.zalo_alias),
        hub_alias = COALESCE(friends.hub_alias, EXCLUDED.hub_alias),
        avatar = COALESCE(EXCLUDED.avatar, friends.avatar),
        status = COALESCE(EXCLUDED.status, friends.status),
        phone_number = COALESCE(EXCLUDED.phone_number, friends.phone_number),
        last_sync_at = EXCLUDED.last_sync_at,
        updated_at = EXCLUDED.updated_at
    `, [
      existing?.id ?? randomUUID(),
      resolvedAccountId,
      contact.userId,
      resolveContactDisplayName({
        userId: contact.userId,
        hubAlias: contact.hubAlias,
        zaloAlias: contact.zaloAlias,
        zaloName: contact.zaloName ?? contact.displayName,
        phoneNumber: contact.phoneNumber,
      }),
      contact.zaloName ?? contact.displayName,
      contact.zaloAlias ?? null,
      contact.hubAlias ?? null,
      contact.avatar ?? null,
      contact.status ?? null,
      contact.phoneNumber ?? null,
      contact.lastSyncAt,
      timestamp,
      timestamp,
    ]);

    const allContacts = await this.listContactsByAccount(resolvedAccountId);
    return allContacts.find((entry) => entry.userId === contact.userId);
  }

  async replaceFriends(activeAccountId: string | undefined, friends: Omit<GoldContactRecord, 'id'>[]) {
    return this.replaceContacts(activeAccountId, friends);
  }

  async getFriendDisplayName(friendId: string, activeAccountId?: string, accountId?: string) {
    const resolvedAccountId = this.resolveAccountId(accountId ?? activeAccountId);
    if (!resolvedAccountId) {
      return undefined;
    }

    const rows = (await this.knex.raw(`
      SELECT display_name
      FROM friends
      WHERE account_id = ? AND friend_id = ?
      LIMIT 1
    `, [resolvedAccountId, friendId])).rows as Array<{ display_name: string }>;
    return rows[0]?.display_name;
  }

  async getFriendAvatar(friendId: string, activeAccountId?: string, accountId?: string) {
    const resolvedAccountId = this.resolveAccountId(accountId ?? activeAccountId);
    if (!resolvedAccountId) return undefined;
    const rows = (await this.knex.raw(`
      SELECT avatar
      FROM friends
      WHERE account_id = ? AND friend_id = ?
      LIMIT 1
    `, [resolvedAccountId, friendId])).rows as Array<{ avatar: string | null }>;
    return rows[0]?.avatar ?? undefined;
  }
}
