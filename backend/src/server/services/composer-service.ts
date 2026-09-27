import { createHash, randomUUID } from 'node:crypto';
import { lockConversation, assertConversationClear } from './conversation-send-barrier.js';
import { createReadStream } from 'node:fs';
import type { Knex } from 'knex';
import type { GoldLogger } from '../../core/logger.js';
import { hasDurableSendMedia, SendRequestRepo, type SendRequestRow } from '../../core/store/send-request-repo.js';
import { SendRequestError, SendRequestService, validateRequestId, type NormalizedSend } from './send-request-service.js';
import type { SendExecution, SendLifecycle } from '../../core/runtime/send-contract.js';
import { MAX_FILE_BYTES, type ComposerObjects } from './composer-object-store.js';

export interface ComposerScope { account_id: string; system_user_id: string; conversation_id: string }
interface Stage extends ComposerScope {
  id: string; object_key: string; file_name: string; mime_type: string; size: number | string; sha256: string;
  status: string; created_at: Date; expires_at: Date;
}
export interface BatchItem { stagingId: string; clientRequestId: string; caption: string; mentions?: import('../../core/types.js').GoldMessageMention[]; quoteMessageId?: string }
export function parseBatch(body: any): { clientBatchId: string; items: BatchItem[]; retry: boolean } {
  const clientBatchId = validateRequestId(body?.clientBatchId);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 10 || ![undefined, true, false].includes(body.retry)) {
    throw new SendRequestError(400, 'INVALID_BATCH', 'Batch requires 1–10 items and boolean retry.');
  }
  const items = body.items.map((item: any) => {
    if (!item || (item.caption !== undefined && typeof item.caption !== 'string') || (item.caption?.length ?? 0) > 20_000) {
      throw new SendRequestError(400, 'INVALID_BATCH', 'Invalid caption.');
    }
    const caption = item.mentions?.length ? item.caption ?? '' : item.caption?.trim() ?? '';
    if (item.mentions !== undefined && (!Array.isArray(item.mentions) || item.mentions.length > 100 || item.mentions.some((m: any) =>
      !m || !Number.isInteger(m.pos) || !Number.isInteger(m.len) || m.pos < 0 || m.len < 1 || m.pos + m.len > caption.length || typeof m.uid !== 'string' || !m.uid || m.uid.length > 100))) {
      throw new SendRequestError(400, 'INVALID_BATCH', 'Invalid caption mentions.');
    }
    if (item.quoteMessageId !== undefined && (typeof item.quoteMessageId !== 'string' || !item.quoteMessageId || item.quoteMessageId.length > 255)) throw new SendRequestError(400, 'INVALID_BATCH', 'Invalid quote ID.');
    return { stagingId: validateRequestId(item.stagingId), clientRequestId: validateRequestId(item.clientRequestId), caption,
      ...(item.mentions?.length ? { mentions: item.mentions.map((m: any) => ({ pos: m.pos, len: m.len, uid: m.uid })) } : {}),
      ...(item.quoteMessageId ? { quoteMessageId: item.quoteMessageId } : {}) };
  });
  if (new Set(items.map((i: BatchItem) => i.clientRequestId)).size !== items.length || new Set(items.map((i: BatchItem) => i.stagingId)).size !== items.length) {
    throw new SendRequestError(400, 'INVALID_BATCH', 'Duplicate child or staging IDs.');
  }
  return { clientBatchId, items, retry: body.retry === true };
}
export function aggregateBatch(states: string[]) {
  if (states.every(s => s === 'sent')) return 'sent';
  if (states.includes('sending')) return 'sending';
  if (states.includes('unknown')) return 'unknown';
  if (states.every(s => s === 'queued')) return 'queued';
  if (states.every(s => s === 'failed')) return 'failed';
  return 'partial';
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const notFound = () => new SendRequestError(404, 'NOT_FOUND', 'Composer resource not found.');
export function releasableReceipt(row?: SendRequestRow) {
  return row?.status === 'sent' && row.provider_receipt_json.localPersistence === 'complete'
    && row.provider_receipt_json.mediaMirrorComplete === true && row.provider_receipt_json.localPersistenceVerified === true && !row.error_code;
}
export class ComposerService {
  private readonly repo: SendRequestRepo;
  private executing = false;
  constructor(private readonly db: Knex, private readonly objects: ComposerObjects, private readonly sends: SendRequestService,
    private readonly dispatch: (input: NormalizedSend, lifecycle: SendLifecycle) => Promise<SendExecution>,
    private readonly logger: Pick<GoldLogger, 'info' | 'error'>) { this.repo = new SendRequestRepo(db); }

  private stageView(row: Stage) {
    return { id: row.id, accountId: row.account_id, conversationId: row.conversation_id, fileName: row.file_name,
      mimeType: row.mime_type, size: Number(row.size), sha256: row.sha256, createdAt: row.created_at, expiresAt: row.expires_at,
      status: row.status === 'deleted' || row.status === 'deleting' ? 'deleted' : new Date(row.expires_at).getTime() <= Date.now() ? 'expired' : row.status };
  }
  async list(scope: ComposerScope) {
    return (await this.db<Stage>('composer_staging').where(scope).orderBy('created_at', 'desc').limit(100)).map(r => this.stageView(r));
  }
  async getStage(scope: ComposerScope, id: string) {
    const row = await this.db<Stage>('composer_staging').where(scope).where({ id: validateRequestId(id) }).first();
    if (!row) throw notFound();
    return this.stageView(row);
  }
  async upload(scope: ComposerScope, file: Express.Multer.File) {
    const fileName = file.originalname.replace(/[\\/\x00-\x1f\x7f]/g, '_').trim();
    if (!file.size || file.size > MAX_FILE_BYTES || !fileName || fileName.length > 255 || file.mimetype.length > 255) {
      throw new SendRequestError(400, 'INVALID_ATTACHMENT', 'Invalid file metadata.');
    }
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(file.path)) digest.update(chunk);
    // Reclaim terminal references across this owner's conversations before enforcing quota.
    const scopes = await this.db('composer_staging').where({ account_id: scope.account_id, system_user_id: scope.system_user_id })
      .whereNot('status', 'deleted').distinct('conversation_id').limit(100);
    for (const s of scopes) await this.cleanup({ ...scope, conversation_id: s.conversation_id });
    const id = randomUUID();
    const row: Stage = { ...scope, id, object_key: `v1/${id}`, file_name: fileName, mime_type: file.mimetype || 'application/octet-stream',
      size: file.size, sha256: digest.digest('hex'), status: 'uploading', created_at: new Date(), expires_at: new Date(Date.now() + 86400_000) };
    await this.db.transaction(async trx => {
      await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`composer-quota:${scope.account_id}:${scope.system_user_id}`]);
      const total = await trx('composer_staging').where({ account_id: scope.account_id, system_user_id: scope.system_user_id })
        .whereNot('status', 'deleted').count('* as count').sum('size as bytes').first();
      if (Number(total?.count) >= 100 || Number(total?.bytes ?? 0) + file.size > 500 * 1024 * 1024) {
        throw new SendRequestError(429, 'STAGING_QUOTA', 'Staging quota reached (100 files / 500 MiB).');
      }
      await trx('composer_staging').insert(row);
    });
    // Durable uploading row makes failed or interrupted uploads discoverable by cleanup.
    await this.objects.put(row.object_key, file.path, file.size);
    await this.db('composer_staging').where({ id }).update({ status: 'ready' });
    return this.stageView({ ...row, status: 'ready' });
  }
  async remove(scope: ComposerScope, id: string, expiredOnly = false, abandon = false) {
    const row = await this.db.transaction(async trx => {
      // Same global gate as execution: never abandon a failed attempt as it is retried.
      const gate = await trx.raw('SELECT pg_try_advisory_xact_lock(27150000) AS acquired');
      if (!gate.rows[0].acquired) {
        if (expiredOnly) return undefined;
        throw new SendRequestError(409, 'COMPOSER_BUSY', 'A batch is executing. Check status and try again.');
      }
      const stage: Stage | undefined = await trx('composer_staging').where(scope).where({ id: validateRequestId(id) }).forUpdate().first();
      if (!stage) throw notFound();
      if (stage.status === 'deleted') return undefined;
      const references = await trx('composer_batch_items').where({ staging_id: id }).forUpdate();
      for (const ref of references) {
        const receipt: SendRequestRow | undefined = await trx('send_requests').where({ account_id: ref.account_id, client_request_id: ref.client_request_id }).forUpdate().first();
        const abandoned = ref.error_code === 'ABANDONED' && (!receipt || receipt.status === 'failed');
        const definite = receipt ? receipt.status === 'failed' : Boolean(ref.error_code);
        const verifiedSent = releasableReceipt(receipt) && await hasDurableSendMedia(trx, receipt!);
        if (!verifiedSent && !abandoned && !(abandon && definite)) {
          if (expiredOnly) return undefined;
          throw new SendRequestError(409, 'STAGING_REFERENCED', 'Unresolved or unmirrored batch reference must be retained.');
        }
      }
      if (!references.length && expiredOnly && new Date(stage.expires_at).getTime() > Date.now()) return undefined;
      if (abandon) {
        for (const ref of references) await trx('composer_batch_items').where({ account_id: ref.account_id, client_request_id: ref.client_request_id }).update({ error_code: 'ABANDONED' });
      }
      // Prevent manual delete racing a still-running object write.
      if (stage.status === 'uploading' && new Date(stage.expires_at).getTime() > Date.now()) {
        throw new SendRequestError(409, 'UPLOAD_IN_PROGRESS', 'Upload is still in progress.');
      }
      await trx('composer_staging').where({ id }).update({ status: 'deleting' });
      return stage;
    });
    if (!row) return false;
    await this.objects.remove(row.object_key);
    await this.db('composer_staging').where({ id, status: 'deleting' }).update({ status: 'deleted' });
    return true;
  }
  async cleanup(scope: ComposerScope) {
    const rows = await this.db('composer_staging').where(scope).whereNot('status', 'deleted').orderBy('created_at').limit(100);
    let deleted = 0;
    for (const row of rows) {
      try { if (await this.remove(scope, row.id, true)) deleted++; }
      catch { this.logger.error('composer_cleanup_failed', { stagingId: row.id }); }
    }
    return deleted;
  }
  async createBatch(scope: ComposerScope, input: ReturnType<typeof parseBatch>) {
    if (!scope.conversation_id.startsWith('group:') && input.items.some(i => i.mentions?.length)) throw new SendRequestError(400, 'UNSUPPORTED', 'Mentions require a group.');
    const key = { account_id: scope.account_id, client_batch_id: input.clientBatchId };
    await this.db.transaction(async trx => {
      await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`composer-batch:${scope.account_id}:${input.clientBatchId}`]);
      await lockConversation(trx, scope.account_id, scope.conversation_id);
      const existing = await trx('composer_batches').where(key).first();
      if (existing && (existing.system_user_id !== scope.system_user_id || existing.conversation_id !== scope.conversation_id)) throw notFound();
      const stages: Stage[] = await trx('composer_staging').where(scope).whereIn('id', input.items.map(i => i.stagingId)).orderBy('id').forUpdate();
      if (stages.length !== input.items.length) throw notFound();
      const payloadHash = hash(JSON.stringify(input.items.map(item => {
        const s = stages.find(s => s.id === item.stagingId)!;
        return { ...item, sha256: s.sha256, size: Number(s.size), fileName: s.file_name, mimeType: s.mime_type };
      })));
      if (existing) {
        if (existing.payload_hash !== payloadHash) throw new SendRequestError(409, 'REQUEST_CONFLICT', 'Batch ID belongs to another payload.');
        return;
      }
      if (input.retry) throw notFound();
      await assertConversationClear(trx, scope.account_id, scope.conversation_id);
      if (stages.some(s => s.status !== 'ready' || new Date(s.expires_at).getTime() <= Date.now())) {
        throw new SendRequestError(409, 'STAGING_UNAVAILABLE', 'Stage expired or not ready.');
      }
      const ids = input.items.map(i => i.clientRequestId);
      if (await trx('send_requests').where({ account_id: scope.account_id }).whereIn('client_request_id', ids).first()
        || await trx('composer_batch_items').where({ account_id: scope.account_id }).whereIn('client_request_id', ids).first()) {
        throw new SendRequestError(409, 'REQUEST_CONFLICT', 'Child ID is already reserved.');
      }
      await trx('composer_batches').insert({ ...scope, ...key, payload_hash: payloadHash });
      await trx('composer_batch_items').insert(input.items.map((item, position) => ({ ...key, position, staging_id: item.stagingId,
        client_request_id: item.clientRequestId, caption: item.caption, send_context: JSON.stringify({ mentions: item.mentions, quoteMessageId: item.quoteMessageId }) })));
    });
  }
  async getBatch(scope: ComposerScope, id: string) {
    const key = { account_id: scope.account_id, client_batch_id: validateRequestId(id) };
    if (!await this.db('composer_batches').where(scope).where(key).first()) throw notFound();
    const rows = await this.db('composer_batch_items').where(key).orderBy('position');
    const items = [];
    for (const row of rows) {
      const sent = await this.repo.get(scope.account_id, row.client_request_id);
      const receipt = sent ? await this.sends.get(scope.account_id, row.client_request_id, scope.system_user_id, false) : undefined;
      items.push({ stagingId: row.staging_id, clientRequestId: row.client_request_id, caption: row.caption,
        status: receipt?.status ?? (row.error_code ? 'failed' : 'queued'), retryable: row.error_code === 'ABANDONED' ? false : receipt?.error?.retryable ?? Boolean(row.error_code),
        providerMessageIds: receipt?.providerMessageIds ?? [], ...(receipt ? { receipt } : {}),
        ...(row.error_code === 'ABANDONED' ? { error: { code: 'ABANDONED', message: 'Failed item abandoned; bytes released. Retry disabled.' } }
          : row.error_code && !receipt ? { error: { code: row.error_code, message: 'Staged file could not be prepared. Explicit retry required.' } } : {}) });
    }
    return { clientBatchId: id, accountId: scope.account_id, conversationId: scope.conversation_id, status: aggregateBatch(items.map(i => i.status)), items };
  }
  /** No durable background queue: only explicit POST starts/resumes work. DB lock bounds SDK memory across processes. */
  async execute(scope: ComposerScope, input: ReturnType<typeof parseBatch>) {
    if (this.executing) return;
    this.executing = true;
    try { await this.db.transaction(async lock => {
      const result = await lock.raw('SELECT pg_try_advisory_xact_lock(27150000) AS acquired');
      if (!result.rows[0].acquired) return;
      // A settled HTTP request is not evidence of a settled provider outcome.
      // Do not let a competing batch bypass an unresolved conversation receipt.
      if (await this.db('send_requests').where({ account_id: scope.account_id, conversation_id: scope.conversation_id })
        .whereIn('status', ['unknown', 'sending']).first()) return;
      const rows = await this.db('composer_batch_items').where({ account_id: scope.account_id, client_batch_id: input.clientBatchId }).orderBy('position');
      for (const item of rows) {
        if (item.error_code === 'ABANDONED') continue;
        const existing = await this.repo.get(scope.account_id, item.client_request_id);
        if (existing && !(input.retry && existing.status === 'failed' && existing.retryable)) continue;
        if (!existing && item.error_code && !input.retry) continue;
        try {
          const stage: Stage = await this.db('composer_staging').where(scope).where({ id: item.staging_id }).first();
          if (!stage || stage.status !== 'ready') throw new Error('Stage unavailable');
          const buffer = await this.objects.read(stage.object_key, Number(stage.size));
          if (hash(buffer) !== stage.sha256) throw new Error('Stage integrity mismatch');
          await this.sends.send({ accountId: scope.account_id, systemUserId: scope.system_user_id, conversationId: scope.conversation_id,
            clientRequestId: item.client_request_id, text: item.caption, retry: Boolean(existing && input.retry),
            mentions: item.send_context?.mentions, quoteMessageId: item.send_context?.quoteMessageId,
            attachment: { fileBuffer: buffer, fileName: stage.file_name, mimeType: stage.mime_type } }, this.dispatch);
          // send() may return at its HTTP timeout while SDK/persistence is still running.
          // Never release the serial execution lock or load another buffer until it settles.
          await this.sends.drain();
          const settled = await this.repo.get(scope.account_id, item.client_request_id);
          if (settled?.status === 'unknown' || settled?.status === 'sending') break;
        } catch {
          await this.db('composer_batch_items').where({ account_id: scope.account_id, client_request_id: item.client_request_id })
            .update({ error_code: 'STAGING_PREPARATION_FAILED' });
          this.logger.error('composer_child_failed', { accountId: scope.account_id, clientRequestId: item.client_request_id });
        }
      }
    }); } finally { this.executing = false; }
    await this.cleanup(scope);
  }
}
