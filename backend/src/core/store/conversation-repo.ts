import type { Knex } from 'knex';
import type {
  GoldContactRecord,
  GoldConversationMessage,
  GoldConversationSummary,
  GoldGroupRecord,
} from '../types.js';
import {
  nowIso,
  parseConversationId,
  toMessageKind,
} from './helpers.js';
import type { RawConversationRow } from './helpers.js';

export class GoldConversationRepo {
  private knex: Knex;
  readonly resolveAccountId: (accountId?: string) => string | undefined;
  private getGroupDisplayNameFn: (groupId: string, accountId?: string) => Promise<string | undefined>;
  private getGroupAvatarFn: (groupId: string, accountId?: string) => Promise<string | undefined>;
  private getFriendDisplayNameFn: (friendId: string, accountId?: string) => Promise<string | undefined>;
  private getFriendAvatarFn: (friendId: string, accountId?: string) => Promise<string | undefined>;

  constructor(
    knex: Knex,
    resolveAccountId: (accountId?: string) => string | undefined,
    getGroupDisplayName: (groupId: string, accountId?: string) => Promise<string | undefined>,
    getGroupAvatar: (groupId: string, accountId?: string) => Promise<string | undefined>,
    getFriendDisplayName: (friendId: string, accountId?: string) => Promise<string | undefined>,
    getFriendAvatar: (friendId: string, accountId?: string) => Promise<string | undefined>,
  ) {
    this.knex = knex;
    this.resolveAccountId = resolveAccountId;
    this.getGroupDisplayNameFn = getGroupDisplayName;
    this.getGroupAvatarFn = getGroupAvatar;
    this.getFriendDisplayNameFn = getFriendDisplayName;
    this.getFriendAvatarFn = getFriendAvatar;
  }

  async upsertConversation(
    accountId: string,
    conversationId: string,
    messages: GoldConversationMessage[],
    trx?: Knex.Transaction,
  ) {
    const db = trx ?? this.knex;
    const lastMessage = messages[messages.length - 1];
    const timestamp = nowIso();

    if (!lastMessage) {
      await db.raw('DELETE FROM conversations WHERE account_id = ? AND id = ?', [accountId, conversationId]);
      return;
    }

    const threadId = lastMessage.threadId;
    const type = lastMessage.conversationType;
    const friendId = type === 'direct' ? threadId : `group:${threadId}`;
    const title = type === 'group'
      ? (await this.getGroupDisplayNameFn(threadId, accountId)) ?? threadId
      : (await this.getFriendDisplayNameFn(threadId, accountId)) ?? threadId;
    const avatar = type === 'group'
      ? (await this.getGroupAvatarFn(threadId, accountId)) ?? null
      : (await this.getFriendAvatarFn(threadId, accountId)) ?? null;

    const existingRows = (await db.raw(`
      SELECT id, created_at
      FROM conversations
      WHERE account_id = ? AND id = ?
      LIMIT 1
    `, [accountId, conversationId])).rows as Array<{ id: string; created_at: string }>;

    const existing = existingRows[0];
    const storedConversationId = existing?.id ?? conversationId;
    const createdAt = existing?.created_at ?? timestamp;
    await db.raw(`
      INSERT INTO conversations (
        id,
        account_id,
        thread_id,
        type,
        title,
        avatar,
        friend_id,
        display_name_snapshot,
        last_message_text,
        last_message_kind,
        last_direction,
        last_message_timestamp,
        message_count,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, friend_id) DO UPDATE SET
        id = EXCLUDED.id,
        thread_id = EXCLUDED.thread_id,
        type = EXCLUDED.type,
        title = EXCLUDED.title,
        avatar = EXCLUDED.avatar,
        display_name_snapshot = EXCLUDED.display_name_snapshot,
        last_message_text = EXCLUDED.last_message_text,
        last_message_kind = EXCLUDED.last_message_kind,
        last_direction = EXCLUDED.last_direction,
        last_message_timestamp = EXCLUDED.last_message_timestamp,
        message_count = EXCLUDED.message_count,
        updated_at = EXCLUDED.updated_at
    `, [
      storedConversationId,
      accountId,
      threadId,
      type,
      title,
      avatar,
      friendId,
      type === 'direct' ? title : null,
      lastMessage.text,
      lastMessage.kind,
      lastMessage.direction,
      lastMessage.timestamp,
      messages.length,
      createdAt,
      timestamp,
    ]);
  }

  async listConversationSummaries(activeAccountId?: string): Promise<GoldConversationSummary[]> {
    return this.listConversationSummariesByAccount(activeAccountId);
  }

  async listConversationSummariesByAccount(accountId?: string): Promise<GoldConversationSummary[]> {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return [];
    }

    const rows = (await this.knex.raw(`
      SELECT friend_id, display_name_snapshot, last_message_text, last_message_kind, last_direction, last_message_timestamp, message_count
           , id, thread_id, type, title, avatar
      FROM conversations
      WHERE account_id = ?
      ORDER BY last_message_timestamp DESC, updated_at DESC
    `, [resolvedAccountId])).rows as RawConversationRow[];

    const summaries: GoldConversationSummary[] = [];
    for (const row of rows) {
      const resolvedType = row.type ?? 'direct';
      const threadOrFriend = row.thread_id ?? row.friend_id;
      summaries.push({
        id: `${resolvedType}:${threadOrFriend}`,
        threadId: threadOrFriend,
        type: resolvedType,
        title: row.title
          ?? row.display_name_snapshot
          ?? (resolvedType === 'group'
            ? (await this.getGroupDisplayNameFn(threadOrFriend, resolvedAccountId))
            : (await this.getFriendDisplayNameFn(row.friend_id, resolvedAccountId)))
          ?? threadOrFriend
          ?? row.friend_id,
        avatar: row.avatar ?? (resolvedType === 'group'
          ? (await this.getGroupAvatarFn(threadOrFriend, resolvedAccountId))
          : (await this.getFriendAvatarFn(row.friend_id, resolvedAccountId))),
        lastMessageText: row.last_message_text,
        lastMessageKind: toMessageKind(row.last_message_kind),
        lastMessageTimestamp: row.last_message_timestamp,
        lastDirection: row.last_direction,
        messageCount: row.message_count,
      } satisfies GoldConversationSummary);
    }
    return summaries;
  }

  async canonicalizeConversationData(
    activeAccountId?: string,
  ) {
    return this.canonicalizeConversationDataForAccount(activeAccountId);
  }

  async canonicalizeConversationDataForAccount(
    accountId?: string,
  ) {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return { repairedGroupIds: [] as string[], rebuiltConversationCount: 0 };
    }

    const rows = (await this.knex.raw(`
      SELECT id, thread_id, raw_message_json
      FROM messages
      WHERE account_id = ?
        AND raw_message_json IS NOT NULL
        AND raw_message_json::text <> ''
    `, [resolvedAccountId])).rows as Array<{
      id: string;
      thread_id: string | null;
      raw_message_json: string | null;
    }>;

    const repairedGroupIds = new Set<string>();

    await this.knex.transaction(async (trx) => {
      for (const row of rows) {
        if (!row.thread_id || !row.raw_message_json) {
          continue;
        }

        try {
          const raw = typeof row.raw_message_json === 'string'
            ? JSON.parse(row.raw_message_json) as Record<string, unknown>
            : row.raw_message_json as unknown as Record<string, unknown>;
          const cmd = Number(raw.cmd ?? 0);
          const groupRows = (await trx.raw(`
            SELECT 1
            FROM groups
            WHERE account_id = ? AND group_id = ?
            LIMIT 1
          `, [resolvedAccountId, row.thread_id])).rows as Array<{ '?column?': number }>;
          const isKnownGroup = Boolean(groupRows[0]);
          const isGroup = isKnownGroup || cmd === 521 || cmd === 511 || cmd === 611;
          const conversationType = isGroup ? 'group' : 'direct';
          const conversationId = `${conversationType}:${row.thread_id}`;
          const friendId = isGroup ? `group:${row.thread_id}` : row.thread_id;
          await trx.raw(`
            UPDATE messages
            SET conversation_id = ?,
                conversation_type = ?,
                thread_id = ?,
                friend_id = ?
            WHERE id = ? AND account_id = ?
          `, [conversationId, conversationType, row.thread_id, friendId, row.id, resolvedAccountId]);
          if (isGroup) {
            repairedGroupIds.add(row.thread_id);
          }
        } catch {
          // Ignore malformed legacy payload.
        }
      }

      await trx.raw('DELETE FROM conversations WHERE account_id = ?', [resolvedAccountId]);

      const summaries = (await trx.raw(`
        SELECT conversation_id, thread_id, conversation_type, MAX(timestamp) AS last_timestamp, COUNT(*) AS message_count
        FROM messages
        WHERE account_id = ? AND conversation_id IS NOT NULL AND thread_id IS NOT NULL
        GROUP BY conversation_id, thread_id, conversation_type
      `, [resolvedAccountId])).rows as Array<{
        conversation_id: string;
        thread_id: string;
        conversation_type: 'direct' | 'group';
        last_timestamp: string;
        message_count: number;
      }>;

      for (const summary of summaries) {
        const latestRows = (await trx.raw(`
          SELECT text, kind, direction, timestamp
          FROM messages
          WHERE account_id = ? AND conversation_id = ?
          ORDER BY timestamp DESC, created_at DESC
          LIMIT 1
        `, [resolvedAccountId, summary.conversation_id])).rows as Array<{
          text: string;
          kind: string;
          direction: 'incoming' | 'outgoing';
          timestamp: string;
        }>;

        const latest = latestRows[0];
        if (!latest) {
          continue;
        }

        const isGroup = summary.conversation_type === 'group';
        const title = isGroup
          ? (await this.getGroupDisplayNameFn(summary.thread_id, resolvedAccountId)) ?? summary.thread_id
          : (await this.getFriendDisplayNameFn(summary.thread_id, resolvedAccountId)) ?? summary.thread_id;
        const avatar = isGroup
          ? (await this.getGroupAvatarFn(summary.thread_id, resolvedAccountId)) ?? null
          : (await this.getFriendAvatarFn(summary.thread_id, resolvedAccountId)) ?? null;
        const friendId = isGroup ? `group:${summary.thread_id}` : summary.thread_id;
        const createdAt = nowIso();

        await trx.raw(`
          INSERT INTO conversations (
            id,
            account_id,
            thread_id,
            type,
            title,
            avatar,
            friend_id,
            display_name_snapshot,
            last_message_text,
            last_message_kind,
            last_direction,
            last_message_timestamp,
            message_count,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          summary.conversation_id,
          resolvedAccountId,
          summary.thread_id,
          summary.conversation_type,
          title,
          avatar,
          friendId,
          isGroup ? null : title,
          latest.text,
          latest.kind,
          latest.direction,
          latest.timestamp,
          Number(summary.message_count ?? 0),
          createdAt,
          nowIso(),
        ]);
      }
    });

    const rebuiltSummaries = await this.listConversationSummariesByAccount(resolvedAccountId);

    return {
      repairedGroupIds: [...repairedGroupIds],
      rebuiltConversationCount: rebuiltSummaries.length,
    };
  }

  async enrichConversationMessageSenders(
    activeAccountId: string | undefined,
    conversationId: string,
    listMessages: (accountId: string | undefined, conversationId: string) => Promise<GoldConversationMessage[]>,
    listGroups: (accountId?: string) => Promise<GoldGroupRecord[]>,
    listContacts: (accountId?: string) => Promise<GoldContactRecord[]>,
    replaceMessages: (accountId: string | undefined, conversationId: string, messages: GoldConversationMessage[]) => Promise<GoldConversationMessage[]>,
  ) {
    return this.enrichConversationMessageSendersByAccount(
      activeAccountId,
      conversationId,
      listMessages,
      listGroups,
      listContacts,
      replaceMessages,
    );
  }

  async enrichConversationMessageSendersByAccount(
    accountId: string | undefined,
    conversationId: string,
    listMessages: (accountId: string | undefined, conversationId: string) => Promise<GoldConversationMessage[]>,
    listGroups: (accountId?: string) => Promise<GoldGroupRecord[]>,
    listContacts: (accountId?: string) => Promise<GoldContactRecord[]>,
    replaceMessages: (accountId: string | undefined, conversationId: string, messages: GoldConversationMessage[]) => Promise<GoldConversationMessage[]>,
  ) {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return [] as GoldConversationMessage[];
    }

    const messages = await listMessages(resolvedAccountId, conversationId);
    const { type, threadId } = parseConversationId(conversationId);
    if (type !== 'group') {
      return messages;
    }

    const groups = await listGroups(resolvedAccountId);
    const group = groups.find((entry) => entry.groupId === threadId);
    const contacts = await listContacts(resolvedAccountId);
    const nextMessages = messages.map((message) => {
      if (!message.senderId) {
        return message;
      }

      const memberName = group?.members?.find((member) => member.userId === message.senderId)?.displayName;
      const contact = contacts.find((entry) => entry.userId === message.senderId);
      let payloadDisplayName: string | undefined;
      if (message.rawMessageJson) {
        try {
          const raw = typeof message.rawMessageJson === 'string'
            ? (message.rawMessageJson.trim() ? JSON.parse(message.rawMessageJson) as Record<string, unknown> : {})
            : message.rawMessageJson as unknown as Record<string, unknown>;
          payloadDisplayName = typeof raw.dName === 'string' && raw.dName.trim() ? raw.dName.trim() : undefined;
        } catch {
          // Ignore malformed payload.
        }
      }

      const senderName = memberName ?? contact?.hubAlias ?? contact?.zaloAlias ?? contact?.zaloName ?? contact?.displayName ?? payloadDisplayName ?? message.senderName;
      return senderName && senderName !== message.senderName
        ? { ...message, senderName }
        : message;
    });

    await replaceMessages(resolvedAccountId, conversationId, nextMessages);
    return nextMessages;
  }
}
