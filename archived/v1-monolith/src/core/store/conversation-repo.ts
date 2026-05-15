import { DatabaseSync } from 'node:sqlite';
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
  private db: DatabaseSync;
  private resolveAccountId: (accountId?: string) => string | undefined;
  private getGroupDisplayNameFn: (groupId: string, accountId?: string) => string | undefined;
  private getGroupAvatarFn: (groupId: string, accountId?: string) => string | undefined;
  private getFriendDisplayNameFn: (friendId: string, accountId?: string) => string | undefined;
  private getFriendAvatarFn: (friendId: string, accountId?: string) => string | undefined;

  constructor(
    db: DatabaseSync,
    resolveAccountId: (accountId?: string) => string | undefined,
    getGroupDisplayName: (groupId: string, accountId?: string) => string | undefined,
    getGroupAvatar: (groupId: string, accountId?: string) => string | undefined,
    getFriendDisplayName: (friendId: string, accountId?: string) => string | undefined,
    getFriendAvatar: (friendId: string, accountId?: string) => string | undefined,
  ) {
    this.db = db;
    this.resolveAccountId = resolveAccountId;
    this.getGroupDisplayNameFn = getGroupDisplayName;
    this.getGroupAvatarFn = getGroupAvatar;
    this.getFriendDisplayNameFn = getFriendDisplayName;
    this.getFriendAvatarFn = getFriendAvatar;
  }

  upsertConversation(accountId: string, conversationId: string, messages: GoldConversationMessage[]) {
    const lastMessage = messages[messages.length - 1];
    const timestamp = nowIso();

    if (!lastMessage) {
      this.db.prepare('DELETE FROM conversations WHERE account_id = ? AND id = ?').run(accountId, conversationId);
      return;
    }

    const threadId = lastMessage.threadId;
    const type = lastMessage.conversationType;
    const friendId = type === 'direct' ? threadId : `group:${threadId}`;
    const title = type === 'group'
      ? this.getGroupDisplayNameFn(threadId, accountId) ?? threadId
      : this.getFriendDisplayNameFn(threadId, accountId) ?? threadId;
    const avatar = type === 'group'
      ? this.getGroupAvatarFn(threadId, accountId) ?? null
      : this.getFriendAvatarFn(threadId, accountId) ?? null;

    const existing = this.db.prepare(`
      SELECT id, created_at
      FROM conversations
      WHERE account_id = ? AND id = ?
      LIMIT 1
    `).get(accountId, conversationId) as { id: string; created_at: string } | undefined;

    const storedConversationId = existing?.id ?? conversationId;
    const createdAt = existing?.created_at ?? timestamp;
    this.db.prepare(`
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
        id = excluded.id,
        thread_id = excluded.thread_id,
        type = excluded.type,
        title = excluded.title,
        avatar = excluded.avatar,
        display_name_snapshot = excluded.display_name_snapshot,
        last_message_text = excluded.last_message_text,
        last_message_kind = excluded.last_message_kind,
        last_direction = excluded.last_direction,
        last_message_timestamp = excluded.last_message_timestamp,
        message_count = excluded.message_count,
        updated_at = excluded.updated_at
    `).run(
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
      );
  }

  listConversationSummaries(activeAccountId?: string): GoldConversationSummary[] {
    return this.listConversationSummariesByAccount(activeAccountId);
  }

  listConversationSummariesByAccount(accountId?: string): GoldConversationSummary[] {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return [];
    }

    const rows = this.db.prepare(`
      SELECT friend_id, display_name_snapshot, last_message_text, last_message_kind, last_direction, last_message_timestamp, message_count
           , id, thread_id, type, title, avatar
      FROM conversations
      WHERE account_id = ?
      ORDER BY last_message_timestamp DESC, updated_at DESC
    `).all(resolvedAccountId) as RawConversationRow[];

    return rows.map((row) => ({
      id: `${row.type}:${row.thread_id ?? row.friend_id}`,
      threadId: row.thread_id ?? row.friend_id,
      type: row.type ?? 'direct',
      title: row.title
        ?? row.display_name_snapshot
        ?? ((row.type ?? 'direct') === 'group'
          ? this.getGroupDisplayNameFn(row.thread_id ?? row.friend_id, resolvedAccountId)
          : this.getFriendDisplayNameFn(row.friend_id, resolvedAccountId))
        ?? row.thread_id
        ?? row.friend_id,
      avatar: row.avatar ?? ((row.type ?? 'direct') === 'group'
        ? this.getGroupAvatarFn(row.thread_id ?? row.friend_id, resolvedAccountId)
        : this.getFriendAvatarFn(row.friend_id, resolvedAccountId)),
      lastMessageText: row.last_message_text,
      lastMessageKind: toMessageKind(row.last_message_kind),
      lastMessageTimestamp: row.last_message_timestamp,
      lastDirection: row.last_direction,
      messageCount: row.message_count,
    } satisfies GoldConversationSummary));
  }

  canonicalizeConversationData(
    activeAccountId?: string,
  ) {
    return this.canonicalizeConversationDataForAccount(activeAccountId);
  }

  canonicalizeConversationDataForAccount(
    accountId?: string,
    runInTransaction?: (work: () => void) => void,
  ) {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return { repairedGroupIds: [] as string[], rebuiltConversationCount: 0 };
    }

    if (!runInTransaction) {
      return { repairedGroupIds: [] as string[], rebuiltConversationCount: 0 };
    }

    const rows = this.db.prepare(`
      SELECT id, thread_id, raw_message_json
      FROM messages
      WHERE account_id = ?
        AND raw_message_json IS NOT NULL
        AND raw_message_json <> ''
    `).all(resolvedAccountId) as Array<{
      id: string;
      thread_id: string | null;
      raw_message_json: string | null;
    }>;

    const repairedGroupIds = new Set<string>();
    runInTransaction(() => {
      const updateMessageType = this.db.prepare(`
        UPDATE messages
        SET conversation_id = ?,
            conversation_type = ?,
            thread_id = ?,
            friend_id = ?
        WHERE id = ? AND account_id = ?
      `);

      for (const row of rows) {
        if (!row.thread_id || !row.raw_message_json) {
          continue;
        }

        try {
          const raw = JSON.parse(row.raw_message_json) as Record<string, unknown>;
          const cmd = Number(raw.cmd ?? 0);
          const isGroup = cmd === 521 || cmd === 511 || cmd === 611;
          const conversationType = isGroup ? 'group' : 'direct';
          const conversationId = `${conversationType}:${row.thread_id}`;
          const friendId = isGroup ? `group:${row.thread_id}` : row.thread_id;
          updateMessageType.run(conversationId, conversationType, row.thread_id, friendId, row.id, resolvedAccountId);
          if (isGroup) {
            repairedGroupIds.add(row.thread_id);
          }
        } catch {
          // Ignore malformed legacy payload.
        }
      }

      this.db.prepare('DELETE FROM conversations WHERE account_id = ?').run(resolvedAccountId);

      const summaries = this.db.prepare(`
        SELECT conversation_id, thread_id, conversation_type, MAX(timestamp) AS last_timestamp, COUNT(*) AS message_count
        FROM messages
        WHERE account_id = ? AND conversation_id IS NOT NULL AND thread_id IS NOT NULL
        GROUP BY conversation_id, thread_id, conversation_type
      `).all(resolvedAccountId) as Array<{
        conversation_id: string;
        thread_id: string;
        conversation_type: 'direct' | 'group';
        last_timestamp: string;
        message_count: number;
      }>;

      const latestMessageQuery = this.db.prepare(`
        SELECT text, kind, direction, timestamp
        FROM messages
        WHERE account_id = ? AND conversation_id = ?
        ORDER BY timestamp DESC, created_at DESC
        LIMIT 1
      `);

      const insertConversation = this.db.prepare(`
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
      `);

      for (const summary of summaries) {
        const latest = latestMessageQuery.get(resolvedAccountId, summary.conversation_id) as {
          text: string;
          kind: string;
          direction: 'incoming' | 'outgoing';
          timestamp: string;
        } | undefined;
        if (!latest) {
          continue;
        }

        const isGroup = summary.conversation_type === 'group';
        const title = isGroup
          ? this.getGroupDisplayNameFn(summary.thread_id, resolvedAccountId) ?? summary.thread_id
          : this.getFriendDisplayNameFn(summary.thread_id, resolvedAccountId) ?? summary.thread_id;
        const avatar = isGroup
          ? this.getGroupAvatarFn(summary.thread_id, resolvedAccountId) ?? null
          : this.getFriendAvatarFn(summary.thread_id, resolvedAccountId) ?? null;
        const friendId = isGroup ? `group:${summary.thread_id}` : summary.thread_id;
        const createdAt = nowIso();

        insertConversation.run(
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
        );
      }
    });

    return {
      repairedGroupIds: [...repairedGroupIds],
      rebuiltConversationCount: this.listConversationSummariesByAccount(resolvedAccountId).length,
    };
  }

  enrichConversationMessageSenders(
    activeAccountId: string | undefined,
    conversationId: string,
    listMessages: (accountId: string | undefined, conversationId: string) => GoldConversationMessage[],
    listGroups: (accountId?: string) => GoldGroupRecord[],
    listContacts: (accountId?: string) => GoldContactRecord[],
    replaceMessages: (accountId: string | undefined, conversationId: string, messages: GoldConversationMessage[]) => GoldConversationMessage[],
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

  enrichConversationMessageSendersByAccount(
    accountId: string | undefined,
    conversationId: string,
    listMessages: (accountId: string | undefined, conversationId: string) => GoldConversationMessage[],
    listGroups: (accountId?: string) => GoldGroupRecord[],
    listContacts: (accountId?: string) => GoldContactRecord[],
    replaceMessages: (accountId: string | undefined, conversationId: string, messages: GoldConversationMessage[]) => GoldConversationMessage[],
  ) {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return [] as GoldConversationMessage[];
    }

    const messages = listMessages(resolvedAccountId, conversationId);
    const { type, threadId } = parseConversationId(conversationId);
    if (type !== 'group') {
      return messages;
    }

    const group = listGroups(resolvedAccountId).find((entry) => entry.groupId === threadId);
    const contacts = listContacts(resolvedAccountId);
    const nextMessages = messages.map((message) => {
      if (!message.senderId) {
        return message;
      }

      const memberName = group?.members?.find((member) => member.userId === message.senderId)?.displayName;
      const contact = contacts.find((entry) => entry.userId === message.senderId);
      let payloadDisplayName: string | undefined;
      if (message.rawMessageJson) {
        try {
          const raw = JSON.parse(message.rawMessageJson) as Record<string, unknown>;
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

    replaceMessages(resolvedAccountId, conversationId, nextMessages);
    return nextMessages;
  }
}
