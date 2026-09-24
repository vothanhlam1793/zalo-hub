import type { Knex } from 'knex';
import type { GoldConversationMessage, SendReceipt } from '../types.js';
import type { RawAttachmentRow, RawMessageRow } from './helpers.js';
import { attachmentRepairPatch, repairMediaUrl } from './send-message-repair.js';

export interface SendRequestRow {
  account_id: string;
  client_request_id: string;
  system_user_id: string;
  conversation_id: string;
  payload_hash: string;
  status: SendReceipt['status'];
  provider_receipt_json: { method?: string; kind?: string; result?: unknown; providerMessageIds?: string[]; acceptedAt?: string;
    localPersistence?: 'pending' | 'complete' | 'failed' | 'interrupted' };
  message_refs_json: GoldConversationMessage[];
  error_code: string | null;
  retryable: boolean;
  attempt_count: number;
}
export interface SendRequestRepository {
  claim(row: SendRequestRow): Promise<boolean>;
  get(accountId: string, requestId: string): Promise<SendRequestRow | undefined>;
  retry(row: SendRequestRow): Promise<boolean>;
  update(row: SendRequestRow, patch: Partial<SendRequestRow>): Promise<void>;
  recoverAbandoned(): Promise<number>;
  repairLocal?(row: SendRequestRow): Promise<void>;
}

export class SendRequestRepo implements SendRequestRepository {
  constructor(private readonly db: Knex) {}
  async claim(row: SendRequestRow) {
    const rows = await this.db('send_requests').insert(this.serialize(row))
      .onConflict(['account_id', 'client_request_id']).ignore().returning('client_request_id');
    return rows.length === 1;
  }
  async get(accountId: string, requestId: string): Promise<SendRequestRow | undefined> {
    return this.db('send_requests').where({ account_id: accountId, client_request_id: requestId }).first();
  }
  async retry(row: SendRequestRow) {
    const changed = await this.key(row).where({ status: 'failed', retryable: true, attempt_count: row.attempt_count })
      .update({ status: 'sending', retryable: false, error_code: null,
        attempt_count: row.attempt_count + 1, updated_at: this.db.fn.now() });
    return changed === 1;
  }
  async update(row: SendRequestRow, patch: Partial<SendRequestRow>) {
    // Fence late completions by attempt. Terminal sent can only receive richer sent data.
    let query = this.key(row).where('attempt_count', row.attempt_count);
    query = patch.status === 'sent' ? query.whereIn('status', ['sending', 'unknown', 'sent'])
      : query.whereIn('status', ['sending', 'unknown']);
    await query.update({ ...this.serialize(patch), updated_at: this.db.fn.now() });
  }
  async recoverAbandoned() {
    // Startup-only for the current single backend process. No automatic execution.
    return this.db.transaction(async (trx) => {
      const unknown = await trx('send_requests').where('status', 'sending').update({ status: 'unknown',
        error_code: 'PROCESS_RESTARTED', retryable: false, updated_at: trx.fn.now() });
      const interrupted = await trx('send_requests').where('status', 'sent')
        .whereRaw("provider_receipt_json->>'localPersistence' = 'pending'")
        .update({ provider_receipt_json: trx.raw("jsonb_set(provider_receipt_json, '{localPersistence}', '\"interrupted\"'::jsonb)"),
          error_code: 'LOCAL_PERSISTENCE_FAILED', retryable: false, updated_at: trx.fn.now() });
      return unknown + interrupted;
    });
  }
  async correlate(accountId: string, conversationId: string, messages: GoldConversationMessage[]) {
    const ids = messages.flatMap((m) => m.providerMessageId ? [m.providerMessageId] : []);
    if (!ids.length) return messages;
    const rows: SendRequestRow[] = await this.db('send_requests').where({ account_id: accountId, conversation_id: conversationId })
      .whereRaw("(provider_receipt_json->'providerMessageIds') \\?| ?::text[]", [ids]);
    const mapping = new Map<string, string>();
    for (const row of rows) for (const id of row.provider_receipt_json.providerMessageIds ?? []) mapping.set(id, row.client_request_id);
    return messages.map((m) => ({ ...m, clientRequestId: mapping.get(m.providerMessageId ?? '') ?? m.clientRequestId }));
  }
  async repairLocal(row: SendRequestRow) {
    // Lock/re-read the durable checkpoint rather than repairing a stale GET snapshot.
    // Pending means the original append still owns persistence; only startup recovery
    // may make an abandoned pending checkpoint repairable. Never contact the provider.
    await this.db.transaction(async (trx) => {
      const latest: SendRequestRow | undefined = await trx('send_requests').where({ account_id: row.account_id,
        client_request_id: row.client_request_id, attempt_count: row.attempt_count }).forUpdate().first();
      if (!latest || latest.status !== 'sent' || latest.provider_receipt_json.localPersistence === 'pending') return;
      for (const m of [...latest.message_refs_json].sort((a, b) => a.id.localeCompare(b.id))) {
        if (!m.providerMessageId) continue;
        const key = { account_id: row.account_id, conversation_id: row.conversation_id, provider_message_id: m.providerMessageId };
        let stored: RawMessageRow | undefined = await trx('messages').where(key).orderBy('id').forUpdate().first();
        if (!stored) {
          await trx('messages').insert({ id: m.id, ...key,
            thread_id: m.threadId, conversation_type: m.conversationType, friend_id: m.conversationType === 'direct' ? m.threadId : '',
            direction: 'outgoing', kind: m.kind, text: m.text, image_url: m.imageUrl ?? null,
            is_self: 1, timestamp: m.timestamp, created_at: new Date().toISOString(),
          }).onConflict('id').ignore();
          stored = await trx('messages').where(key).orderBy('id').forUpdate().first();
        }
        if (!stored) continue; // conflicting unrelated local identity must never be overwritten
        const imageUrl = repairMediaUrl(stored.image_url, m.imageUrl);
        const patch: Record<string, unknown> = {};
        if (!stored.text && m.text) patch.text = m.text;
        if (imageUrl && imageUrl !== stored.image_url) patch.image_url = imageUrl;
        if (Object.keys(patch).length) await trx('messages').where({ account_id: row.account_id, id: stored.id }).update(patch);
        const attachments: RawAttachmentRow[] = await trx('attachments').where('message_id', stored.id).orderBy('id').forUpdate();
        for (const a of m.attachments) {
          let target = attachments.find((existing) => existing.id === a.id);
          // This send path uploads one file. Its sole echo may use another attachment ID.
          // Do not guess across multiple attachments or insert a duplicate over a rich echo.
          if (!target && m.attachments.length === 1 && attachments.length === 1 && attachments[0].type === a.type) target = attachments[0];
          if (!target && attachments.length) continue;
          if (!target) {
            await trx('attachments').insert({ id: a.id, message_id: stored.id, type: a.type,
              ...attachmentRepairPatch({}, a), created_at: new Date().toISOString(),
            }).onConflict('id').ignore();
            target = await trx('attachments').where({ message_id: stored.id, id: a.id }).forUpdate().first();
          }
          if (target) {
            const enrich = attachmentRepairPatch(target, a);
            if (Object.keys(enrich).length) await trx('attachments').where({ id: target.id, message_id: stored.id }).update(enrich);
          }
        }
      }
      // A repair that creates a message must not leave a new conversation invisible.
      // Derive from stored history, not sparse request snapshots. Preserve any existing
      // summary/title/avatar/unread state: normal runtime/metadata paths own enrichment.
      const messageKey = { account_id: row.account_id, conversation_id: row.conversation_id };
      const last: RawMessageRow | undefined = await trx('messages').where(messageKey).orderBy('timestamp', 'desc').orderBy('id', 'desc').first();
      if (last) {
        const count = await trx('messages').where(messageKey).count('* as count').first();
        const type = last.conversation_type ?? 'direct';
        const threadId = last.thread_id ?? last.friend_id;
        await trx('conversations').insert({ id: row.conversation_id, account_id: row.account_id,
          thread_id: threadId, type, friend_id: type === 'group' ? `group:${threadId}` : threadId,
          title: threadId, display_name_snapshot: type === 'direct' ? threadId : null,
          last_message_text: last.text, last_message_kind: last.kind, last_direction: last.direction,
          last_message_timestamp: last.timestamp, message_count: Number(count?.count ?? 0),
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).onConflict(['account_id', 'friend_id']).ignore();
      }
    });
  }
  private key(row: SendRequestRow) {
    return this.db('send_requests').where({ account_id: row.account_id, client_request_id: row.client_request_id });
  }
  private serialize(row: Partial<SendRequestRow>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...row };
    if (row.provider_receipt_json) result.provider_receipt_json = JSON.stringify(row.provider_receipt_json);
    if (row.message_refs_json) result.message_refs_json = JSON.stringify(row.message_refs_json);
    return result;
  }
}
