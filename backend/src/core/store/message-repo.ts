import type { Knex } from 'knex';
import type { GoldAttachment, GoldConversationMessage, GoldMessageReactionItem } from '../types.js';
import { normalizeMessageQuote, normalizeMessageReactions } from '../runtime/normalizer.js';
import {
  buildStoredAttachmentId,
  buildStoredMessageId,
  canonicalizeStoredMessage,
  mergeReactions,
  nowIso,
  parseConversationId,
  toMessageKind,
} from './helpers.js';
import type { RawAttachmentRow, RawMessageRow } from './helpers.js';

function deduplicateMessagesByPreferredPayload(messages: GoldConversationMessage[]): GoldConversationMessage[] {
  const seen = new Map<string, GoldConversationMessage>();
  for (const msg of messages) {
    const key = msg.providerMessageId || msg.id;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, msg);
      continue;
    }
    const existingScore = scoreMessage(existing);
    const currentScore = scoreMessage(msg);
    if (currentScore > existingScore) {
      seen.set(key, msg);
    }
  }
  return [...seen.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function scoreMessage(msg: GoldConversationMessage): number {
  let score = 0;
  if (msg.cliMsgId) score += 100;
  if (msg.rawMessageJson) score += msg.rawMessageJson.length;
  if (msg.reactions?.length) score += msg.reactions.length * 2;
  if (msg.quote) score += 1;
  return score;
}

function tryParseReactions(raw: string | null): GoldMessageReactionItem[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter((item) => item && typeof item.emoji === 'string');
  } catch {
    return undefined;
  }
}

export class GoldMessageRepo {
  private knex: Knex;
  private resolveAccountId: (accountId?: string) => string | undefined;
  private requireAccountId: (accountId?: string) => string;

  private async resolveCanonicalConversationType(
    accountId: string,
    threadId: string,
    fallbackType: 'direct' | 'group',
  ): Promise<'direct' | 'group'> {
    if (!threadId || fallbackType === 'group') {
      return fallbackType;
    }

    const groupRows = (await this.knex.raw(`
      SELECT 1
      FROM groups
      WHERE account_id = ? AND group_id = ?
      LIMIT 1
    `, [accountId, threadId])).rows as Array<{ '?column?': number }>;
    if (groupRows[0]) {
      return 'group';
    }

    const existingRows = (await this.knex.raw(`
      SELECT 1
      FROM messages
      WHERE account_id = ?
        AND thread_id = ?
        AND conversation_type = 'group'
      LIMIT 1
    `, [accountId, threadId])).rows as Array<{ '?column?': number }>;
    return existingRows[0] ? 'group' : fallbackType;
  }

  constructor(
    knex: Knex,
    resolveAccountId: (accountId?: string) => string | undefined,
    requireAccountId: (accountId?: string) => string,
  ) {
    this.knex = knex;
    this.resolveAccountId = resolveAccountId;
    this.requireAccountId = requireAccountId;
  }

  async listConversationMessages(activeAccountId: string | undefined, conversationId: string, options: { before?: string; limit?: number } = {}): Promise<GoldConversationMessage[]> {
    return this.listConversationMessagesByAccount(activeAccountId, conversationId, options);
  }

  async listConversationMessagesByAccount(accountId: string | undefined, conversationId: string, options: { before?: string; limit?: number } = {}): Promise<GoldConversationMessage[]> {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return [];
    }

    const { threadId, type } = parseConversationId(conversationId);
    const canonicalType = await this.resolveCanonicalConversationType(resolvedAccountId, threadId, type);
    const canonicalConversationId = `${canonicalType}:${threadId}`;
    const directLegacyKey = canonicalType === 'direct' ? threadId : null;
    const limit = Math.max(1, Math.min(options.limit ?? 10000, 100000));
    const before = options.before?.trim();

    const query = before
      ? `
        SELECT * FROM (
          SELECT id, conversation_id, thread_id, conversation_type, friend_id, text, kind, image_url, direction, is_self, timestamp, sender_id, sender_name, provider_message_id, raw_message_json, reactions_json, created_at
          FROM messages
          WHERE account_id = ?
            AND (
              conversation_id = ?
              OR (conversation_id IS NULL AND friend_id = ?)
            )
            AND timestamp < ?
          ORDER BY timestamp DESC, created_at DESC
          LIMIT ?
        ) AS sub
        ORDER BY timestamp ASC, created_at ASC
      `
      : `
        SELECT * FROM (
          SELECT id, conversation_id, thread_id, conversation_type, friend_id, text, kind, image_url, direction, is_self, timestamp, sender_id, sender_name, provider_message_id, raw_message_json, reactions_json, created_at
          FROM messages
          WHERE account_id = ?
            AND (
              conversation_id = ?
              OR (conversation_id IS NULL AND friend_id = ?)
            )
          ORDER BY timestamp DESC, created_at DESC
          LIMIT ?
        ) AS sub
        ORDER BY timestamp ASC, created_at ASC
      `;

    const bindings = before
      ? [resolvedAccountId, canonicalConversationId, directLegacyKey, before, limit]
      : [resolvedAccountId, canonicalConversationId, directLegacyKey, limit];

    const rows = (await this.knex.raw(query, bindings)).rows as RawMessageRow[];

    const messageIds = rows.map((r) => r.id);

    const attachmentsByMessageId = new Map<string, GoldAttachment[]>();
    if (messageIds.length > 0) {
      const placeholders = messageIds.map(() => '?').join(',');
      const attRows = (await this.knex.raw(`
        SELECT id, message_id, type, url, source_url, local_path, thumbnail_url, thumbnail_source_url, thumbnail_local_path, file_name, mime_type, size, width, height, duration
        FROM attachments
        WHERE message_id IN (${placeholders})
      `, messageIds)).rows as RawAttachmentRow[];

      for (const att of attRows) {
        const list = attachmentsByMessageId.get(att.message_id) ?? [];
        list.push({
          id: att.id,
          type: toMessageKind(att.type),
          url: att.url ?? undefined,
          sourceUrl: att.source_url ?? undefined,
          localPath: att.local_path ?? undefined,
          thumbnailUrl: att.thumbnail_url ?? undefined,
          thumbnailSourceUrl: att.thumbnail_source_url ?? undefined,
          thumbnailLocalPath: att.thumbnail_local_path ?? undefined,
          fileName: att.file_name ?? undefined,
          mimeType: att.mime_type ?? undefined,
          size: att.size ?? undefined,
          width: att.width ?? undefined,
          height: att.height ?? undefined,
          duration: att.duration ?? undefined,
        });
        attachmentsByMessageId.set(att.message_id, list);
      }
    }

    return rows.map((row) => {
      const canonical = canonicalizeStoredMessage(row, attachmentsByMessageId.get(row.id) ?? []);
      let raw: Record<string, unknown> | undefined;
      if (row.raw_message_json) {
        try {
          raw = typeof row.raw_message_json === 'string'
            ? (row.raw_message_json.trim() ? JSON.parse(row.raw_message_json) as Record<string, unknown> : undefined)
            : row.raw_message_json as Record<string, unknown>;
        } catch {
          raw = undefined;
        }
      }

      let cliMsgId: string | undefined;
      if (raw) {
        const data = (raw.data ?? raw) as Record<string, unknown>;
        cliMsgId = (raw.cliMsgId ?? data?.cliMsgId ?? (raw.message as Record<string, unknown>)?.cliMsgId) as string | undefined;
        if (cliMsgId === undefined || cliMsgId === null) cliMsgId = undefined;
        else cliMsgId = String(cliMsgId);
      }

      return {
        id: row.id,
        conversationId: row.conversation_id ?? `direct:${row.friend_id}`,
        threadId: row.thread_id ?? row.friend_id,
        conversationType: row.conversation_type ?? 'direct',
        text: canonical.text,
        kind: canonical.kind,
        attachments: canonical.attachments,
        senderId: row.sender_id ?? undefined,
        senderName: row.sender_name ?? undefined,
        providerMessageId: row.provider_message_id ?? undefined,
        imageUrl: canonical.imageUrl,
        quote: raw ? normalizeMessageQuote(raw) : undefined,
        reactions: mergeReactions(
          raw ? normalizeMessageReactions(raw) : undefined,
          row.reactions_json ? tryParseReactions(row.reactions_json) : undefined,
        ),
        rawMessageJson: row.raw_message_json ?? undefined,
        cliMsgId,
        direction: row.direction,
        isSelf: Boolean(row.is_self),
        timestamp: row.timestamp,
      } satisfies GoldConversationMessage;
    });
  }

  async hasMessageByProviderId(activeAccountId: string | undefined, conversationId: string, providerMessageId: string) {
    return this.hasMessageByProviderIdForAccount(activeAccountId, conversationId, providerMessageId);
  }

  async hasMessageByProviderIdForAccount(accountId: string | undefined, conversationId: string, providerMessageId: string) {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId || !providerMessageId.trim()) {
      return false;
    }

    const { threadId, type } = parseConversationId(conversationId);
    const canonicalType = await this.resolveCanonicalConversationType(resolvedAccountId, threadId, type);
    const rows = (await this.knex.raw(`
      SELECT id
      FROM messages
      WHERE account_id = ?
        AND provider_message_id = ?
        AND thread_id = ?
        AND conversation_type = ?
      LIMIT 1
    `, [resolvedAccountId, providerMessageId.trim(), threadId, canonicalType])).rows as Array<{ id: string }>;

    return Boolean(rows[0]?.id);
  }

  async replaceConversationMessages(
    activeAccountId: string | undefined,
    conversationId: string,
    messages: GoldConversationMessage[],
    upsertConversation: (accountId: string, conversationId: string, messages: GoldConversationMessage[], trx?: Knex.Transaction) => Promise<void>,
    options?: { purge?: boolean },
  ): Promise<GoldConversationMessage[]> {
    return this.replaceConversationMessagesByAccount(activeAccountId, conversationId, messages, upsertConversation, options);
  }

  async replaceConversationMessagesByAccount(
    accountId: string | undefined,
    conversationId: string,
    messages: GoldConversationMessage[],
    upsertConversation: (accountId: string, conversationId: string, messages: GoldConversationMessage[], trx?: Knex.Transaction) => Promise<void>,
    options?: { purge?: boolean },
  ): Promise<GoldConversationMessage[]> {
    const resolvedAccountId = this.requireAccountId(accountId);
    const parsedConversation = parseConversationId(conversationId);
    const canonicalType = await this.resolveCanonicalConversationType(resolvedAccountId, parsedConversation.threadId, parsedConversation.type);
    const canonicalConversationId = `${canonicalType}:${parsedConversation.threadId}`;

    const sortedMessages = [...messages]
      .map((message) => ({
        ...message,
        threadId: message.threadId || parsedConversation.threadId,
        conversationType: canonicalType,
        conversationId: `${canonicalType}:${message.threadId || parsedConversation.threadId}`,
      }))
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp));

    const dedupedMessages = deduplicateMessagesByPreferredPayload(sortedMessages);

    const shouldPurge = options?.purge === true;
    if (!shouldPurge) {
      const dbCount = await this.knex.raw(`
        SELECT COUNT(*)::int AS cnt FROM messages
        WHERE account_id = ? AND conversation_id = ?`,
        [resolvedAccountId, canonicalConversationId],
      ).then((r: any) => Number(r.rows?.[0]?.cnt ?? 0));
      if (dbCount > 0 && dedupedMessages.length < dbCount && dedupedMessages.length <= 10) {
        console.warn(`[zalohub] replace_conversation_messages_skip_purge conv=${canonicalConversationId} db=${dbCount} incoming=${dedupedMessages.length}`);
        return this.listConversationMessagesByAccount(resolvedAccountId, canonicalConversationId);
      }
    }
    await this.knex.transaction(async (trx) => {
      await trx.raw(`
        DELETE FROM messages
        WHERE account_id = ?
          AND (
            conversation_id = ?
            OR (conversation_id IS NULL AND friend_id = ?)
          )
      `, [resolvedAccountId, canonicalConversationId, canonicalType === 'direct' ? parsedConversation.threadId : null]);

      for (const message of dedupedMessages) {
        const messageThreadId = message.threadId || parsedConversation.threadId;
        const storedMessageId = buildStoredMessageId(resolvedAccountId, message.id);
        const legacyImageUrl = message.imageUrl
          ?? (message.kind === 'image' && message.attachments?.[0]?.url ? message.attachments[0].url : null);

        await trx.raw(`
          INSERT INTO messages (
            id,
            conversation_id,
            account_id,
            thread_id,
            conversation_type,
            friend_id,
            provider_message_id,
            sender_id,
            sender_name,
            direction,
            kind,
            text,
            image_url,
            is_self,
            timestamp,
            raw_summary_json,
            raw_message_json,
            reactions_json,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
        `, [
          storedMessageId,
          message.conversationId,
          resolvedAccountId,
          messageThreadId,
          message.conversationType,
          message.conversationType === 'direct' ? messageThreadId : '',
          message.providerMessageId ?? message.id,
          message.senderId ?? null,
          message.senderName ?? null,
          message.direction,
          message.kind,
          message.text,
          legacyImageUrl ?? null,
          message.isSelf ? 1 : 0,
          message.timestamp,
          message.rawMessageJson ?? null,
          message.reactions && message.reactions.length > 0 ? JSON.stringify(message.reactions) : null,
          nowIso(),
        ]);

        for (const att of message.attachments ?? []) {
          if (att.id.startsWith('legacy-')) continue;
          const storedAttachmentId = buildStoredAttachmentId(resolvedAccountId, att.id);
          await trx.raw(`
            INSERT INTO attachments (
              id,
              message_id,
              type,
              url,
              source_url,
              local_path,
              thumbnail_url,
              thumbnail_source_url,
              thumbnail_local_path,
              file_name,
              mime_type,
              size,
              width,
              height,
              duration,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING
          `, [
            storedAttachmentId,
            storedMessageId,
            att.type,
            att.url ?? null,
            att.sourceUrl ?? null,
            att.localPath ?? null,
            att.thumbnailUrl ?? null,
            att.thumbnailSourceUrl ?? null,
            att.thumbnailLocalPath ?? null,
            att.fileName ?? null,
            att.mimeType ?? null,
            att.size ?? null,
            att.width ?? null,
            att.height ?? null,
            att.duration ?? null,
            nowIso(),
          ]);
        }
      }

      await upsertConversation(resolvedAccountId, canonicalConversationId, dedupedMessages, trx);
    });

    return this.listConversationMessagesByAccount(resolvedAccountId, canonicalConversationId);
  }

  async appendConversationMessage(
    activeAccountId: string | undefined,
    message: GoldConversationMessage,
    upsertConversation: (accountId: string, conversationId: string, messages: GoldConversationMessage[], trx?: Knex.Transaction) => Promise<void>,
  ) {
    const existing = await this.listConversationMessages(activeAccountId, message.conversationId);
    existing.push(message);
    return this.replaceConversationMessages(activeAccountId, message.conversationId, existing, upsertConversation);
  }

  async updateMessageReactions(
    accountId: string,
    providerMessageId: string,
    reactions: GoldMessageReactionItem[],
  ) {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId || !providerMessageId.trim()) return false;

    await this.knex.raw(`
      UPDATE messages
      SET reactions_json = ?
      WHERE account_id = ? AND provider_message_id = ?
    `, [JSON.stringify(reactions), resolvedAccountId, providerMessageId.trim()]);
    return true;
  }
}
