import { DatabaseSync } from 'node:sqlite';
import type { GoldAttachment, GoldConversationMessage } from '../types.js';
import { normalizeMessageQuote, normalizeMessageReactions } from '../runtime/normalizer.js';
import {
  buildStoredAttachmentId,
  buildStoredMessageId,
  canonicalizeStoredMessage,
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

export class GoldMessageRepo {
  private db: DatabaseSync;
  private resolveAccountId: (accountId?: string) => string | undefined;
  private requireAccountId: (accountId?: string) => string;

  constructor(
    db: DatabaseSync,
    resolveAccountId: (accountId?: string) => string | undefined,
    requireAccountId: (accountId?: string) => string,
  ) {
    this.db = db;
    this.resolveAccountId = resolveAccountId;
    this.requireAccountId = requireAccountId;
  }

  listConversationMessages(activeAccountId: string | undefined, conversationId: string, options: { before?: string; limit?: number } = {}): GoldConversationMessage[] {
    return this.listConversationMessagesByAccount(activeAccountId, conversationId, options);
  }

  listConversationMessagesByAccount(accountId: string | undefined, conversationId: string, options: { before?: string; limit?: number } = {}): GoldConversationMessage[] {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId) {
      return [];
    }

    const { threadId, type } = parseConversationId(conversationId);
    const directLegacyKey = type === 'direct' ? threadId : null;
    const limit = Math.max(1, Math.min(options.limit ?? 40, 200));
    const before = options.before?.trim();

    const query = before
      ? `
        SELECT * FROM (
          SELECT id, conversation_id, thread_id, conversation_type, friend_id, text, kind, image_url, direction, is_self, timestamp, sender_id, sender_name, provider_message_id, raw_message_json, created_at
          FROM messages
          WHERE account_id = ?
            AND (
              conversation_id = ?
              OR (conversation_id IS NULL AND friend_id = ?)
            )
            AND timestamp < ?
          ORDER BY timestamp DESC, created_at DESC
          LIMIT ?
        )
        ORDER BY timestamp ASC, created_at ASC
      `
      : `
        SELECT * FROM (
          SELECT id, conversation_id, thread_id, conversation_type, friend_id, text, kind, image_url, direction, is_self, timestamp, sender_id, sender_name, provider_message_id, raw_message_json, created_at
          FROM messages
          WHERE account_id = ?
            AND (
              conversation_id = ?
              OR (conversation_id IS NULL AND friend_id = ?)
            )
          ORDER BY timestamp DESC, created_at DESC
          LIMIT ?
        )
        ORDER BY timestamp ASC, created_at ASC
      `;

    const rows = (before
      ? this.db.prepare(query).all(resolvedAccountId, conversationId, directLegacyKey, before, limit)
      : this.db.prepare(query).all(resolvedAccountId, conversationId, directLegacyKey, limit)) as RawMessageRow[];

    const messageIds = rows.map((r) => r.id);

    const attachmentsByMessageId = new Map<string, GoldAttachment[]>();
    if (messageIds.length > 0) {
      const placeholders = messageIds.map(() => '?').join(',');
      const attRows = this.db.prepare(`
        SELECT id, message_id, type, url, source_url, local_path, thumbnail_url, thumbnail_source_url, thumbnail_local_path, file_name, mime_type, size, width, height, duration
        FROM attachments
        WHERE message_id IN (${placeholders})
      `).all(...messageIds) as RawAttachmentRow[];

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
          raw = JSON.parse(row.raw_message_json) as Record<string, unknown>;
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
        reactions: raw ? normalizeMessageReactions(raw) : undefined,
        rawMessageJson: row.raw_message_json ?? undefined,
        cliMsgId,
        direction: row.direction,
        isSelf: Boolean(row.is_self),
        timestamp: row.timestamp,
      } satisfies GoldConversationMessage;
    });
  }

  hasMessageByProviderId(activeAccountId: string | undefined, conversationId: string, providerMessageId: string) {
    return this.hasMessageByProviderIdForAccount(activeAccountId, conversationId, providerMessageId);
  }

  hasMessageByProviderIdForAccount(accountId: string | undefined, conversationId: string, providerMessageId: string) {
    const resolvedAccountId = this.resolveAccountId(accountId);
    if (!resolvedAccountId || !providerMessageId.trim()) {
      return false;
    }

    const { threadId, type } = parseConversationId(conversationId);
    const row = this.db.prepare(`
      SELECT id
      FROM messages
      WHERE account_id = ?
        AND provider_message_id = ?
        AND thread_id = ?
        AND conversation_type = ?
      LIMIT 1
    `).get(resolvedAccountId, providerMessageId.trim(), threadId, type) as { id: string } | undefined;

    return Boolean(row?.id);
  }

  replaceConversationMessages(
    activeAccountId: string | undefined,
    conversationId: string,
    messages: GoldConversationMessage[],
    upsertConversation: (accountId: string, conversationId: string, messages: GoldConversationMessage[]) => void,
  ): GoldConversationMessage[] {
    return this.replaceConversationMessagesByAccount(activeAccountId, conversationId, messages, upsertConversation);
  }

  replaceConversationMessagesByAccount(
    accountId: string | undefined,
    conversationId: string,
    messages: GoldConversationMessage[],
    upsertConversation: (accountId: string, conversationId: string, messages: GoldConversationMessage[]) => void,
  ): GoldConversationMessage[] {
    const resolvedAccountId = this.requireAccountId(accountId);

    const sortedMessages = [...messages].sort((left, right) => left.timestamp.localeCompare(right.timestamp));

    const dedupedMessages = deduplicateMessagesByPreferredPayload(sortedMessages);

    this.db.exec('BEGIN');
    try {
      const { threadId, type } = parseConversationId(conversationId);
      this.db.prepare(`
        DELETE FROM messages
        WHERE account_id = ?
          AND (
            conversation_id = ?
            OR (conversation_id IS NULL AND friend_id = ?)
          )
      `).run(resolvedAccountId, conversationId, type === 'direct' ? threadId : null);

      const insertMessage = this.db.prepare(`
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
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `);

      const insertAttachment = this.db.prepare(`
        INSERT OR IGNORE INTO attachments (
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
      `);

      for (const message of dedupedMessages) {
        const messageThreadId = message.threadId || threadId;
        const storedMessageId = buildStoredMessageId(resolvedAccountId, message.id);
        const legacyImageUrl = message.imageUrl
          ?? (message.kind === 'image' && message.attachments?.[0]?.url ? message.attachments[0].url : null);

        insertMessage.run(
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
          nowIso(),
        );

        for (const att of message.attachments ?? []) {
          if (att.id.startsWith('legacy-')) continue;
          const storedAttachmentId = buildStoredAttachmentId(resolvedAccountId, att.id);
          insertAttachment.run(
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
          );
        }
      }

      upsertConversation(resolvedAccountId, conversationId, dedupedMessages);

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return this.listConversationMessagesByAccount(resolvedAccountId, conversationId);
  }

  appendConversationMessage(
    activeAccountId: string | undefined,
    message: GoldConversationMessage,
    upsertConversation: (accountId: string, conversationId: string, messages: GoldConversationMessage[]) => void,
  ) {
    const existing = this.listConversationMessages(activeAccountId, message.conversationId);
    existing.push(message);
    return this.replaceConversationMessages(activeAccountId, message.conversationId, existing, upsertConversation);
  }
}
