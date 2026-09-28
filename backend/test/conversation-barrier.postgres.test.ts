import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import knex from 'knex';
import { up as sends } from '../db/migrations/20260922000000_create_send_requests.js';
import { up as composer } from '../db/migrations/20260927150000_create_composer_staging.js';
import { up as actions } from '../db/migrations/20260927170000_extended_action_receipts.js';
import { DbActionStore, parseAction } from '../src/server/services/extended-tools-service.js';
import { SendRequestRepo, type SendRequestRow } from '../src/core/store/send-request-repo.js';
import { lockConversation, assertConversationClear } from '../src/server/services/conversation-send-barrier.js';
const url = process.env.SEND_REQUEST_TEST_DATABASE_URL;
test('PostgreSQL cross-feature reservation races, archived batch gate, same-ID replay and absent-ID seal', { skip: !url }, async () => {
  assert.match(new URL(url!).pathname, /_test$/);
  const schema = `barrier_${randomUUID().replaceAll('-', '')}`;
  const admin = knex({ client: 'pg', connection: url });
  const db = knex({ client: 'pg', connection: url, searchPath: [schema], pool: { min: 0, max: 8 } });
  const scope = { account_id: 'a', system_user_id: 'u', conversation_id: 'direct:1' };
  try {
    await admin.raw('CREATE SCHEMA ??', [schema]); await sends(db); await composer(db); await actions(db);
    const repo = new SendRequestRepo(db), store = new DbActionStore(db);
    const row: SendRequestRow = { ...scope, client_request_id: randomUUID(), payload_hash: 'text', status: 'sending', provider_receipt_json: {}, message_refs_json: [], error_code: null, retryable: false, attempt_count: 1 };
    const input = parseAction({ id: randomUUID(), action: 'sticker', stickerId: 1 });
    const result = await Promise.allSettled([repo.claim(row), store.reserve(scope, input, 'tool')]);
    assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(result.filter(r => r.status === 'rejected' && r.reason.code === 'CONVERSATION_UNRESOLVED').length, 1);
    await db('send_requests').del(); await db('composer_actions').del();
    await store.reserve(scope, input, 'tool');
    await assert.rejects(repo.claim(row), { code: 'CONVERSATION_UNRESOLVED' });
    await assert.rejects(db.transaction(async trx => { await lockConversation(trx, 'a', 'direct:1'); await assertConversationClear(trx, 'a', 'direct:1'); }), { code: 'CONVERSATION_UNRESOLVED' });
    assert.equal((await store.reserve(scope, input, 'tool')).fresh, false);
    await store.settle(scope, input.id, 'accepted', { msgId: '1' });
    assert.equal(await repo.claim(row), true);
    assert.equal(await repo.claim(row), false, 'own accepted/sending replay must not be blocked');
    await db('send_requests').del(); await db('composer_actions').del();
    const batch = randomUUID(), child = randomUUID(), stage = randomUUID();
    await db('composer_batches').insert({ ...scope, client_batch_id: batch, payload_hash: 'batch' });
    await db('composer_staging').insert({ ...scope, id: stage, object_key: stage, file_name: 'x', mime_type: 'x', size: 1, sha256: 'x', status: 'ready', expires_at: new Date(Date.now() + 10000) });
    await db('composer_batch_items').insert({ account_id: 'a', client_batch_id: batch, position: 0, staging_id: stage, client_request_id: child, caption: '' });
    await assert.rejects(store.reserve(scope, input, 'tool'), { code: 'CONVERSATION_UNRESOLVED' });
    assert.equal(await repo.claim({ ...row, client_request_id: child }), true, 'batch can dispatch its own reserved child');
    await db('send_requests').where({ client_request_id: child }).update({ status: 'unknown' });
    await assert.rejects(store.reserve(scope, input, 'tool'), { code: 'CONVERSATION_UNRESOLVED' });
    // Recovery reads/seals do not require a clear conversation and cannot send.
    const sealed = await store.recover(scope, input.id);
    assert.equal(sealed.status, 'rejected');
    assert.equal((await store.reserve(scope, input, 'tool')).fresh, false, 'late POST cannot cross tombstone');
    await assert.rejects(store.recover({ ...scope, system_user_id: 'other' }, input.id), { status: 404 });
  } finally { await db.destroy(); await admin.raw('DROP SCHEMA ?? CASCADE', [schema]); await admin.destroy(); }
});
