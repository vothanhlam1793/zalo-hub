import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import knex from 'knex';
import { up } from '../db/migrations/20260922000000_create_send_requests.js';
import { SendRequestRepo, type SendRequestRow } from '../src/core/store/send-request-repo.js';
import { execution, input, requestId } from './send-request-fixtures.js';

const testUrl = process.env.SEND_REQUEST_TEST_DATABASE_URL;

test('isolated PostgreSQL: concurrent unique claims, retry CAS, monotonic acceptance, restart and correlation', {
  skip: !testUrl ? 'Set SEND_REQUEST_TEST_DATABASE_URL to an isolated database whose name ends in _test; never DATABASE_URL.' : false,
}, async () => {
  const parsed = new URL(testUrl!);
  assert.match(parsed.pathname, /_test$/, 'Refusing a database without the explicit _test suffix');
  const schema = `send_request_test_${randomUUID().replaceAll('-', '')}`;
  const admin = knex({ client: 'pg', connection: testUrl, pool: { min: 0, max: 1 } });
  const db = knex({ client: 'pg', connection: testUrl, searchPath: [schema], pool: { min: 0, max: 6 } });
  try {
    await admin.raw('CREATE SCHEMA ??', [schema]);
    await up(db); // This migration touches only the generated isolated schema.
    const repo = new SendRequestRepo(db);
    const row: SendRequestRow = { account_id: input.accountId, client_request_id: requestId, system_user_id: input.systemUserId,
      conversation_id: input.conversationId, payload_hash: 'a'.repeat(64), status: 'sending', provider_receipt_json: {},
      message_refs_json: [], error_code: null, retryable: false, attempt_count: 1 };
    const claims = await Promise.all(Array.from({ length: 20 }, () => repo.claim(row)));
    assert.equal(claims.filter(Boolean).length, 1);
    await repo.update(row, { status: 'failed', error_code: 'SESSION_UNAVAILABLE', retryable: true });
    const failed = (await repo.get(row.account_id, row.client_request_id))!;
    const retries = await Promise.all(Array.from({ length: 20 }, () => repo.retry(failed)));
    assert.equal(retries.filter(Boolean).length, 1);
    assert.equal((await repo.get(row.account_id, row.client_request_id))?.attempt_count, 2);
    await repo.update(row, { status: 'sent' }); // stale attempt cannot finalize replacement
    assert.equal((await repo.get(row.account_id, row.client_request_id))?.status, 'sending');
    assert.equal(await repo.recoverAbandoned(), 1);
    const abandoned = (await repo.get(row.account_id, row.client_request_id))!;
    assert.equal(abandoned.status, 'unknown'); assert.equal(await repo.retry(abandoned), false);
    const accepted = execution();
    await repo.update(abandoned, { status: 'sent', retryable: false, error_code: null,
      provider_receipt_json: { providerMessageIds: accepted.providerMessageIds, acceptedAt: accepted.acceptedAt }, message_refs_json: accepted.messages });
    await repo.update(abandoned, { status: 'unknown', retryable: true });
    assert.equal((await repo.get(row.account_id, row.client_request_id))?.status, 'sent');
    const messages = accepted.messages.map(({ clientRequestId: _id, ...m }) => m);
    assert.equal((await repo.correlate(input.accountId, input.conversationId, messages))[0].clientRequestId, requestId);
    assert.equal((await repo.correlate('another-account', input.conversationId, messages))[0].clientRequestId, undefined);
    assert.equal((await repo.correlate(input.accountId, 'direct:other', messages))[0].clientRequestId, undefined);
  } finally {
    await db.destroy();
    await admin.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await admin.destroy();
  }
});
