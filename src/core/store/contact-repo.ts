import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { GoldContactRecord } from '../types.js';
import { nowIso, resolveContactDisplayName } from './helpers.js';
import type { RawFriendRow } from './helpers.js';

export class GoldContactRepo {
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

  listContacts(activeAccountId?: string) {
    return this.listContactsByAccount(activeAccountId);
  }

  listContactsByAccount(accountId?: string) {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return [];
    }

    const rows = this.db.prepare(`
      SELECT id, friend_id, display_name, zalo_name, zalo_alias, hub_alias, avatar, status, phone_number, last_sync_at
      FROM friends
      WHERE account_id = ?
      ORDER BY display_name COLLATE NOCASE ASC, friend_id ASC
    `).all(resolvedAccountId) as RawFriendRow[];

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

  listFriends(activeAccountId?: string) {
    return this.listContacts(activeAccountId);
  }

  replaceContacts(activeAccountId: string | undefined, friends: Omit<GoldContactRecord, 'id'>[]) {
    return this.replaceContactsByAccount(activeAccountId, friends);
  }

  replaceContactsByAccount(accountId: string | undefined, friends: Omit<GoldContactRecord, 'id'>[]) {
    const resolvedAccountId = this.requireAccountId(accountId);

    const timestamp = nowIso();
    this.runInTransaction(() => {
      this.db.prepare('DELETE FROM friends WHERE account_id = ?').run(resolvedAccountId);
      const insertFriend = this.db.prepare(`
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
      `);

      for (const friend of friends) {
        insertFriend.run(
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
        );
      }
    });

    return this.listContactsByAccount(resolvedAccountId);
  }

  upsertContact(activeAccountId: string | undefined, contact: Omit<GoldContactRecord, 'id'>) {
    return this.upsertContactByAccount(activeAccountId, contact);
  }

  upsertContactByAccount(accountId: string | undefined, contact: Omit<GoldContactRecord, 'id'>) {
    const resolvedAccountId = this.requireAccountId(accountId);

    const timestamp = nowIso();
    const existing = this.db.prepare(`
      SELECT id
      FROM friends
      WHERE account_id = ? AND friend_id = ?
      LIMIT 1
    `).get(resolvedAccountId, contact.userId) as { id: string } | undefined;

    this.db.prepare(`
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
        display_name = excluded.display_name,
        zalo_name = COALESCE(excluded.zalo_name, friends.zalo_name),
        zalo_alias = COALESCE(excluded.zalo_alias, friends.zalo_alias),
        hub_alias = COALESCE(friends.hub_alias, excluded.hub_alias),
        avatar = COALESCE(excluded.avatar, friends.avatar),
        status = COALESCE(excluded.status, friends.status),
        phone_number = COALESCE(excluded.phone_number, friends.phone_number),
        last_sync_at = excluded.last_sync_at,
        updated_at = excluded.updated_at
    `).run(
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
    );

    return this.listContactsByAccount(resolvedAccountId).find((entry) => entry.userId === contact.userId);
  }

  replaceFriends(activeAccountId: string | undefined, friends: Omit<GoldContactRecord, 'id'>[]) {
    return this.replaceContacts(activeAccountId, friends);
  }

  getFriendDisplayName(friendId: string, activeAccountId?: string, accountId?: string) {
    const resolvedAccountId = this.resolveAccountId(accountId ?? activeAccountId);
    if (!resolvedAccountId) {
      return undefined;
    }

    const row = this.db.prepare(`
      SELECT display_name
      FROM friends
      WHERE account_id = ? AND friend_id = ?
      LIMIT 1
    `).get(resolvedAccountId, friendId) as { display_name: string } | undefined;
    return row?.display_name;
  }

  getFriendAvatar(friendId: string, activeAccountId?: string, accountId?: string) {
    const resolvedAccountId = this.resolveAccountId(accountId ?? activeAccountId);
    if (!resolvedAccountId) return undefined;
    const row = this.db.prepare(`
      SELECT avatar
      FROM friends
      WHERE account_id = ? AND friend_id = ?
      LIMIT 1
    `).get(resolvedAccountId, friendId) as { avatar: string | null } | undefined;
    return row?.avatar ?? undefined;
  }
}
