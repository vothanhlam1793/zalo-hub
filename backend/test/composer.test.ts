import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';
import knex from 'knex';
import { aggregateBatch, ComposerService, parseBatch, releasableReceipt } from '../src/server/services/composer-service.js';
import type { SendRequestRow } from '../src/core/store/send-request-repo.js';
import { SendRequestService } from '../src/server/services/send-request-service.js';
import { SendRequestRepo } from '../src/core/store/send-request-repo.js';
import { up as sendsMigration } from '../db/migrations/20260922000000_create_send_requests.js';
import { up as composerMigration } from '../db/migrations/20260927150000_create_composer_staging.js';
import { up as contextMigration } from '../db/migrations/20260927171000_composer_item_context.js';
import { up as actionsMigration } from '../db/migrations/20260927170000_extended_action_receipts.js';
import { logger } from './send-request-fixtures.js';
import express from 'express';
import { createComposerRouter } from '../src/server/routes/composer.js';
import { normalizeSend } from '../src/server/services/send-request-service.js';

test('composer denies anonymous multipart before touching database or object service', async () => {
  const app = express();
  const db = (() => { throw new Error('Database must not be queried'); }) as unknown as ReturnType<typeof knex>;
  app.use('/api/accounts/:accountId/composer', createComposerRouter(db, {} as ComposerService, logger));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>(resolve => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/accounts/a/composer/staging?conversationId=direct:1`, {
      method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=x' }, body: '--malformed',
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json() as { code: string }).code, 'UNAUTHENTICATED');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('batch contract validates stable IDs, bounded items, captions and explicit retries', () => {
  const item = { stagingId: randomUUID(), clientRequestId: randomUUID(), caption: ' hello ' };
  const body = { clientBatchId: randomUUID(), items: [item] };
  assert.equal(parseBatch(body).items[0].caption, 'hello');
  assert.equal(parseBatch(body).retry, false);
  assert.equal(parseBatch({ ...body, retry: true }).retry, true);
  for (const invalid of [null, {}, { ...body, items: [] }, { ...body, items: Array(11).fill(item) },
    { ...body, retry: 'true' }, { ...body, items: [item, item] }, { ...body, items: [{ ...item, caption: 123 }] },
    { ...body, items: [{ ...item, caption: 'a'.repeat(20001) }] }, { ...body, items: [{ ...item, stagingId: '../x' }] }]) {
    assert.throws(() => parseBatch(invalid));
  }
});

test('aggregate state never describes partial/unknown outcomes as successful', () => {
  assert.equal(aggregateBatch(['sent', 'sent']), 'sent');
  assert.equal(aggregateBatch(['sent', 'failed']), 'partial');
  assert.equal(aggregateBatch(['sent', 'unknown']), 'unknown');
  assert.equal(aggregateBatch(['queued', 'sending']), 'sending');
  assert.equal(aggregateBatch(['queued', 'queued']), 'queued');
  assert.equal(aggregateBatch(['failed', 'failed']), 'failed');
  assert.equal(aggregateBatch(['sent', 'queued']), 'partial');
});
test('mention-only attachment preserves whitespace and offsets through batch and send normalization', () => {
  const caption = '  @Old ';
  const mentions = [{ uid: 'u', pos: 2, len: 4 }];
  const parsed = parseBatch({ clientBatchId: randomUUID(), items: [{ stagingId: randomUUID(), clientRequestId: randomUUID(), caption, mentions }] });
  assert.equal(parsed.items[0].caption, caption);
  const normalized = normalizeSend({ accountId: 'a', systemUserId: 'u', conversationId: 'group:g', text: parsed.items[0].caption, mentions });
  assert.equal(normalized.text, caption); assert.deepEqual(normalized.mentions, mentions);
});

const testUrl = process.env.SEND_REQUEST_TEST_DATABASE_URL;
test('release requires durable sent, completed persistence and explicit media mirror evidence', () => {
  const row = { status: 'sent', error_code: null, provider_receipt_json: { localPersistence: 'complete', mediaMirrorComplete: true, localPersistenceVerified: true } } as SendRequestRow;
  assert.equal(releasableReceipt(row), true);
  assert.equal(releasableReceipt({ ...row, provider_receipt_json: { ...row.provider_receipt_json, localPersistenceVerified: false } }), false);
  for (const status of ['unknown', 'sending', 'failed'] as const) assert.equal(releasableReceipt({ ...row, status }), false);
  for (const localPersistence of ['pending', 'failed', 'interrupted', undefined] as const) {
    assert.equal(releasableReceipt({ ...row, provider_receipt_json: { ...row.provider_receipt_json, localPersistence } }), false);
  }
  assert.equal(releasableReceipt({ ...row, provider_receipt_json: { localPersistence: 'complete' } }), false);
  assert.equal(releasableReceipt({ ...row, error_code: 'LOCAL_PERSISTENCE_FAILED' }), false);
  assert.equal(Boolean(releasableReceipt()), false);
});
test('isolated PostgreSQL composer: ownership, expiry, reference safety, deduplication and explicit retry', {
  skip: !testUrl ? 'Set SEND_REQUEST_TEST_DATABASE_URL to an isolated *_test database.' : false,
}, async () => {
  assert.match(new URL(testUrl!).pathname, /_test$/);
  const schema = `composer_test_${randomUUID().replaceAll('-', '')}`;
  const admin = knex({ client: 'pg', connection: testUrl, pool: { min: 0, max: 1 } });
  const db = knex({ client: 'pg', connection: testUrl, searchPath: [schema], pool: { min: 0, max: 8 } });
  const scope = { account_id: 'a', system_user_id: 'u', conversation_id: 'direct:1' };
  const buffer = Buffer.from('test content');
  let dispatches = 0; let deletes = 0; let failDelete = false;
  try {
    await admin.raw('CREATE SCHEMA ??', [schema]);
    await sendsMigration(db); await composerMigration(db); await contextMigration(db); await actionsMigration(db);
    await db.schema.createTable('messages', t => { t.string('id').primary(); for (const field of ['account_id', 'conversation_id', 'provider_message_id', 'thread_id', 'conversation_type', 'friend_id', 'direction', 'kind', 'text', 'image_url', 'timestamp', 'created_at']) t.string(field); t.integer('is_self'); });
    await db.schema.createTable('attachments', t => { t.string('id').primary(); for (const field of ['message_id', 'type', 'url', 'created_at']) t.string(field); });
    await db.schema.createTable('conversations', t => { for (const field of ['id', 'account_id', 'thread_id', 'type', 'friend_id', 'title', 'display_name_snapshot', 'last_message_text', 'last_message_kind', 'last_direction', 'last_message_timestamp', 'created_at', 'updated_at']) t.string(field); t.integer('message_count'); t.unique(['account_id', 'friend_id']); });
    const repo = new SendRequestRepo(db);
    // No message repair tables needed: use only repository delivery semantics here.
    repo.repairLocal = async () => {};
    const sends = new SendRequestService(repo, logger);
    const service = new ComposerService(db, { put: async () => {}, read: async () => buffer, remove: async () => { if (failDelete) throw new Error('storage unavailable'); deletes++; } }, sends,
      async (_input, lifecycle) => {
        dispatches++;
        lifecycle.onDispatch?.();
        return { method: 'sendMessage', result: {}, status: 'sent', providerMessageIds: [String(dispatches)], messages: [], acceptedAt: new Date().toISOString() };
      }, logger);
    const stage = async (expired = false) => {
      const id = randomUUID();
      await db('composer_staging').insert({ ...scope, id, object_key: id, file_name: 'test.txt', mime_type: 'text/plain', size: buffer.length,
        sha256: createHash('sha256').update(buffer).digest('hex'), status: 'ready', expires_at: new Date(Date.now() + (expired ? -1000 : 86400_000)) });
      return id;
    };
    const id = await stage();
    await assert.rejects(service.getStage({ ...scope, system_user_id: 'other' }, id), { status: 404 });
    await assert.rejects(service.getStage({ ...scope, conversation_id: 'direct:other' }, id), { status: 404 });
    const input = parseBatch({ clientBatchId: randomUUID(), items: [{ stagingId: id, clientRequestId: randomUUID() }] });
    await Promise.all([service.createBatch(scope, input), service.createBatch(scope, input)]);
    await assert.rejects(service.remove(scope, id), { code: 'STAGING_REFERENCED' });
    await assert.rejects(service.createBatch(scope, { ...input, items: [{ ...input.items[0], caption: 'changed' }] }), { code: 'REQUEST_CONFLICT' });
    await assert.rejects(service.getBatch({ ...scope, system_user_id: 'other' }, input.clientBatchId), { status: 404 });
    await Promise.all([service.execute(scope, input), service.execute(scope, input)]);
    assert.equal(dispatches, 1);
    await service.execute(scope, { ...input, retry: true });
    assert.equal(dispatches, 1, 'accepted child must never resend');
    assert.equal((await service.getBatch(scope, input.clientBatchId)).status, 'sent');
    await db('composer_staging').where({ id }).update({ expires_at: new Date(0) });
    const expired = await stage(true);
    assert.equal(await service.cleanup(scope), 1);
    assert.equal(deletes, 1, 'referenced expired object retained');
    assert.equal((await service.getStage(scope, expired)).status, 'deleted');
    await db('send_requests').where({ client_request_id: input.items[0].clientRequestId }).update({
      provider_receipt_json: JSON.stringify({ localPersistence: 'complete', mediaMirrorComplete: true, localPersistenceVerified: true, providerMessageIds: ['1'] }),
      message_refs_json: JSON.stringify([{ id: 'm', providerMessageId: '1', kind: 'file', attachments: [{ id: 'media', type: 'file', url: '/media/file' }] }]) });
    assert.equal(await service.cleanup(scope), 0, 'mirror and complete flags alone cannot release missing DB rows');
    await db('messages').insert({ id: 'm', account_id: 'a', conversation_id: 'direct:1', provider_message_id: '1', friend_id: '1', thread_id: '1', conversation_type: 'direct' });
    assert.equal(await service.cleanup(scope), 0, 'missing attachment still prevents release');
    await db('attachments').insert({ id: 'media', message_id: 'm', type: 'file', url: '/media/file' });
    await db('send_requests').where({ client_request_id: input.items[0].clientRequestId }).update({ error_code: 'LOCAL_PERSISTENCE_FAILED', provider_receipt_json: JSON.stringify({ localPersistence: 'failed', mediaMirrorComplete: true, providerMessageIds: ['1'] }) });
    assert.equal(await service.cleanup(scope), 0, 'rows alone do not bypass pending repair');
    const repairRepo = new SendRequestRepo(db);
    await repairRepo.repairLocal((await repairRepo.get('a', input.items[0].clientRequestId))!);
    assert.equal((await repairRepo.get('a', input.items[0].clientRequestId))?.provider_receipt_json.localPersistenceVerified, true, 'only actual row verification certifies repaired receipt');
    assert.equal(await service.cleanup(scope), 1, 'verified mirrored receipt releases referenced object');
    assert.equal((await service.getStage(scope, id)).status, 'deleted');
    await service.createBatch(scope, input);
    await service.execute(scope, input);
    assert.equal(dispatches, 1, 'metadata-only accepted replay never needs deleted bytes');
    assert.equal(await service.cleanup(scope), 0, 'cleanup is idempotent');
    const failedInput = parseBatch({ clientBatchId: randomUUID(), items: [{ stagingId: await stage(), clientRequestId: randomUUID() }] });
    await service.createBatch(scope, failedInput);
    await db('composer_batch_items').where({ client_request_id: failedInput.items[0].clientRequestId }).update({ error_code: 'STAGING_PREPARATION_FAILED' });
    await service.execute(scope, failedInput); assert.equal(dispatches, 1);
    await service.execute(scope, { ...failedInput, retry: true }); assert.equal(dispatches, 2);
    await db('send_requests').where({ client_request_id: failedInput.items[0].clientRequestId }).update({ status: 'unknown' });
    await service.execute(scope, { ...failedInput, retry: true }); assert.equal(dispatches, 2, 'unknown must not resend');
    await assert.rejects(service.remove(scope, failedInput.items[0].stagingId, false, true), { code: 'STAGING_REFERENCED' });
    const abandoned = parseBatch({ clientBatchId: randomUUID(), items: [{ stagingId: await stage(), clientRequestId: randomUUID() }] });
    await assert.rejects(service.createBatch(scope, abandoned), { code: 'CONVERSATION_UNRESOLVED' });
    // Isolate abandonment from the intentionally unresolved earlier conversation.
    await db('send_requests').where({ client_request_id: failedInput.items[0].clientRequestId }).update({ status: 'sent' });
    await service.createBatch(scope, abandoned);
    await db('composer_batch_items').where({ client_request_id: abandoned.items[0].clientRequestId }).update({ error_code: 'STAGING_PREPARATION_FAILED' });
    await service.remove(scope, abandoned.items[0].stagingId, false, true);
    assert.equal((await service.getBatch(scope, abandoned.clientBatchId)).items[0].retryable, false);
    await service.execute(scope, { ...abandoned, retry: true });
    assert.equal(dispatches, 2, 'abandoned child cannot replay');
    await db('send_requests').where({ client_request_id: failedInput.items[0].clientRequestId }).update({ status: 'unknown' });
    const pending = parseBatch({ clientBatchId: randomUUID(), items: [{ stagingId: await stage(), clientRequestId: randomUUID() }] });
    await assert.rejects(service.createBatch(scope, pending), { code: 'CONVERSATION_UNRESOLVED' });
    assert.equal(await db('composer_batches').where({ client_batch_id: pending.clientBatchId }).first(), undefined, 'blocked reservation leaves no batch');
    assert.equal(dispatches, 2, 'competing batch cannot bypass unknown receipt');
    const doomed = await stage(true);
    failDelete = true;
    await service.cleanup(scope);
    assert.equal((await db('composer_staging').where({ id: doomed }).first()).status, 'deleting', 'failed object deletion keeps durable tombstone');
    failDelete = false;
    await service.cleanup(scope);
    assert.equal((await service.getStage(scope, doomed)).status, 'deleted', 'next cleanup repairs interrupted deletion');
    const gated = await stage(true);
    await db.transaction(async lock => {
      await lock.raw('SELECT pg_advisory_xact_lock(27150000)');
      assert.equal(await service.cleanup(scope), 0, 'execution gate prevents competing deletion');
      await assert.rejects(service.remove(scope, gated), { code: 'COMPOSER_BUSY' });
    });
    await service.cleanup(scope);
    assert.equal((await service.getStage(scope, gated)).status, 'deleted');
    // Metadata grows beyond the former 100-file ceiling without consuming live quota.
    const tombstones = Array.from({ length: 101 }, () => {
      const id = randomUUID(); return { ...scope, id, object_key: id, file_name: 'old', mime_type: 'text/plain', size: 1,
        sha256: '0'.repeat(64), status: 'deleted', expires_at: new Date(0) };
    });
    await db('composer_staging').insert(tombstones);
    const live = await db('composer_staging').where(scope).whereNot('status', 'deleted').count('* as count').first();
    assert.equal(Number(live?.count), 2, 'unknown reference and unreserved ready staging still consume live quota');
    const path = fileURLToPath(import.meta.url);
    const uploaded = await service.upload(scope, { path, originalname: 'fixture.txt', mimetype: 'text/plain', size: statSync(path).size } as Express.Multer.File);
    assert.equal(uploaded.status, 'ready', 'upload admission works after more than 100 retained metadata records');
  } finally {
    await db.destroy(); await admin.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]); await admin.destroy();
  }
});
