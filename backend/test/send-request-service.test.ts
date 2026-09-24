import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { SendRequestService, SendRequestError, normalizeSend } from '../src/server/services/send-request-service.js';
import { SendFailure } from '../src/core/runtime/send-contract.js';
import { FakeSendRepo, accept, deferred, execution, input, logger, requestId } from './send-request-fixtures.js';

test('simultaneous identical intents atomically dispatch once; accepted replay preserves envelope', async () => {
  const repo = new FakeSendRepo(); const service = new SendRequestService(repo, logger);
  const entered = deferred<void>(); const release = deferred<void>(); let calls = 0;
  const dispatch = async (_: unknown, lifecycle: Parameters<typeof accept>[0]) => {
    calls++; lifecycle.onDispatch?.(); entered.resolve(); await release.promise; return accept(lifecycle);
  };
  const first = service.send(input, dispatch); await entered.promise;
  const second = await service.send(input, dispatch);
  assert.equal(second.status, 202); assert.equal(second.body.receipt?.status, 'sending');
  release.resolve(); assert.equal((await first).body.receipt?.status, 'sent');
  const replay = await service.send({ ...input, retry: true }, dispatch);
  assert.equal(replay.status, 200); assert.equal(replay.body.method, 'sendMessage');
  assert.deepEqual(replay.body.receipt?.providerMessageIds, ['101']); assert.equal(calls, 1);
});

test('different request IDs with identical text remain separate sends', async () => {
  const service = new SendRequestService(new FakeSendRepo(), logger); let calls = 0;
  const dispatch = async (_: unknown, life: Parameters<typeof accept>[0]) => accept(life, execution(String(++calls)));
  const a = await service.send(input, dispatch);
  const b = await service.send({ ...input, clientRequestId: '72ec7915-e9a9-4d95-a503-234f2fa15b1e' }, dispatch);
  assert.equal(calls, 2); assert.notDeepEqual(a.body.receipt?.providerMessageIds, b.body.receipt?.providerMessageIds);
});

test('fingerprint covers normalized target/text/file bytes and excludes retry', async () => {
  const a = { ...input, attachment: { fileBuffer: Buffer.from('a'), fileName: 'a.txt', mimeType: 'text/plain' } };
  assert.equal(normalizeSend(a).payloadHash, normalizeSend({ ...a, retry: true }).payloadHash);
  assert.equal(normalizeSend(input).payloadHash, normalizeSend({ ...input, text: ' hello ' }).payloadHash);
  assert.notEqual(normalizeSend(a).payloadHash, normalizeSend({ ...a, attachment: { ...a.attachment, fileBuffer: Buffer.from('b') } }).payloadHash);
  const service = new SendRequestService(new FakeSendRepo(), logger); let calls = 0;
  const dispatch = async (_: unknown, life: Parameters<typeof accept>[0]) => { calls++; return accept(life); };
  await service.send(a, dispatch);
  await assert.rejects(service.send({ ...a, text: 'different' }, dispatch), (e) => e instanceof SendRequestError && e.status === 409);
  await assert.rejects(service.send({ ...a, conversationId: 'direct:456' }, dispatch), (e) => e instanceof SendRequestError && e.status === 409);
  assert.equal(calls, 1);
});

test('validation rejects invalid identity and payload before claim/SDK', async () => {
  const repo = new FakeSendRepo(); const service = new SendRequestService(repo, logger);
  for (const change of [{ clientRequestId: {} }, { clientRequestId: 'not-uuid' }, { text: {} }, { conversationId: '123' }, { text: '' }, { retry: 'yes' }]) {
    await assert.rejects(service.send({ ...input, ...change }, async () => { throw new Error('must not dispatch'); }), SendRequestError);
  }
  assert.equal(repo.rows.size, 0);
});

test('status requires initiating user or separately authorized privileged caller; POST cannot steal intent', async () => {
  const service = new SendRequestService(new FakeSendRepo(), logger);
  await service.send(input, async (_, life) => accept(life));
  await assert.rejects(service.get(input.accountId, requestId, 'other-user', false), (e) => e instanceof SendRequestError && e.status === 403);
  assert.equal((await service.get(input.accountId, requestId, 'other-admin', true)).status, 'sent');
  await assert.rejects(service.send({ ...input, systemUserId: 'other-user' }, async () => execution()), (e) => e instanceof SendRequestError && e.status === 403);
  await assert.rejects(service.get('other-account', requestId, input.systemUserId, true), (e) => e instanceof SendRequestError && e.status === 404);
});

test('404 before a delayed POST is not grounds for a new identity', async () => {
  const service = new SendRequestService(new FakeSendRepo(), logger);
  await assert.rejects(service.get(input.accountId, requestId, input.systemUserId, false), (e) => e instanceof SendRequestError && e.status === 404);
  assert.equal((await service.send(input, async (_, life) => accept(life))).body.receipt?.clientRequestId, requestId);
});

test('failed pre-dispatch requires explicit same-key retry, and concurrent retry is CAS fenced', async () => {
  const repo = new FakeSendRepo(); const service = new SendRequestService(repo, logger); let calls = 0;
  const rejected = await service.send(input, async () => { throw new SendFailure('SESSION_UNAVAILABLE', 'offline', true, 409); });
  assert.equal(rejected.status, 409); assert.equal(rejected.body.receipt?.error?.retryable, true);
  const entered = deferred<void>(); const release = deferred<void>();
  const dispatch = async (_: unknown, life: Parameters<typeof accept>[0]) => { calls++; entered.resolve(); await release.promise; return accept(life); };
  assert.equal((await service.send(input, dispatch)).body.receipt?.status, 'failed'); assert.equal(calls, 0);
  const a = service.send({ ...input, retry: true }, dispatch); await entered.promise;
  const b = await service.send({ ...input, retry: true }, dispatch);
  assert.equal(b.status, 202); release.resolve(); await a;
  assert.equal(calls, 1); assert.equal((await repo.get(input.accountId, requestId))?.attempt_count, 2);
});

test('retry of an absent key cannot create a fresh send claim', async () => {
  const repo = new FakeSendRepo(); const service = new SendRequestService(repo, logger); let calls = 0;
  await assert.rejects(service.send({ ...input, retry: true }, async () => { calls++; return execution(); }),
    (e) => e instanceof SendRequestError && e.status === 404);
  assert.equal(calls, 0); assert.equal(repo.rows.size, 0);
});

test('coded provider rejection is definite but not blindly retryable', async () => {
  const service = new SendRequestService(new FakeSendRepo(), logger);
  const result = await service.send(input, async (_, life) => { life.onDispatch?.(); throw new SendFailure('PROVIDER_REJECTED', 'no', false); });
  assert.equal(result.status, 422); assert.equal(result.body.receipt?.status, 'failed');
  assert.equal(result.body.receipt?.error?.retryable, false); assert.equal(typeof result.body.error, 'string');
});

test('disconnect after dispatch and restart never auto-resend unknown', async () => {
  const repo = new FakeSendRepo(); const service = new SendRequestService(repo, logger); let calls = 0;
  const result = await service.send(input, async (_, life) => { calls++; life.onDispatch?.(); throw new Error('socket reset + secret'); });
  assert.equal(result.status, 202); assert.equal(result.body.receipt?.status, 'unknown');
  assert.equal(JSON.stringify(result).includes('secret'), false);
  await service.send({ ...input, retry: true }, async (_, life) => { calls++; return accept(life); }); assert.equal(calls, 1);
  const row = (await repo.get(input.accountId, requestId))!; row.status = 'sending'; repo.rows.set(repo.key(input.accountId, requestId), row);
  assert.equal(await repo.recoverAbandoned(), 1);
  assert.equal((await new SendRequestService(repo, logger).send({ ...input, retry: true }, async () => { calls++; return execution(); })).body.receipt?.status, 'unknown');
  assert.equal(calls, 1);
});

test('SDK acceptance precedes local failure; later GET retains sent and no provider replay', async () => {
  const repo = new FakeSendRepo(); const service = new SendRequestService(repo, logger); let calls = 0;
  const result = await service.send(input, async (_, life) => {
    calls++; life.onDispatch?.(); await life.onAccepted?.(execution());
    assert.equal((await repo.get(input.accountId, requestId))?.status, 'sent');
    throw new Error('local database/media write failed');
  });
  assert.equal(result.status, 200); assert.equal(result.body.receipt?.status, 'sent');
  assert.equal(result.body.receipt?.error?.retryable, false);
  assert.equal((await service.get(input.accountId, requestId, input.systemUserId, false)).status, 'sent');
  await service.send({ ...input, retry: true }, async () => { calls++; return execution(); }); assert.equal(calls, 1);
});

test('server timeout becomes unknown; late success upgrades same attempt without resend', async () => {
  const repo = new FakeSendRepo(); const service = new SendRequestService(repo, logger, { text: 10, attachment: 10 });
  const release = deferred<void>(); const completed = deferred<void>(); let calls = 0;
  const keepAlive = delay(60);
  const result = await service.send(input, async (_, life) => {
    calls++; life.onDispatch?.(); await release.promise; const result = await accept(life); completed.resolve(); return result;
  });
  assert.equal(result.status, 202); assert.equal(result.body.receipt?.status, 'unknown');
  await service.send({ ...input, retry: true }, async () => { calls++; return execution(); });
  release.resolve(); await completed.promise; await delay(0);
  assert.equal((await service.get(input.accountId, requestId, input.systemUserId, false)).status, 'sent');
  assert.equal(calls, 1); await keepAlive;
});

test('acceptance checkpoint write failure retains evidence and never permits provider retry', async () => {
  const repo = new FakeSendRepo();
  const originalUpdate = repo.update.bind(repo); let failOnce = true;
  repo.update = async (row, patch) => {
    if (patch.status === 'sent' && failOnce) { failOnce = false; throw new Error('database unavailable'); }
    await originalUpdate(row, patch);
  };
  const service = new SendRequestService(repo, logger); let calls = 0;
  const result = await service.send(input, async (_, life) => { calls++; return accept(life); });
  assert.equal(result.status, 200); assert.equal(result.body.receipt?.status, 'sent');
  const saved = (await repo.get(input.accountId, requestId))!;
  assert.equal(saved.status, 'sent'); assert.deepEqual(saved.provider_receipt_json.providerMessageIds, ['101']);
  await service.send({ ...input, retry: true }, async () => { calls++; return execution(); }); assert.equal(calls, 1);
});

test('pre-dispatch timeout fences a late runtime acquisition; explicit retry remains safe', async () => {
  const repo = new FakeSendRepo(); const service = new SendRequestService(repo, logger, { text: 10, attachment: 10 });
  const release = deferred<void>(); const finished = deferred<void>(); let providerCalls = 0;
  const keepAlive = delay(60);
  const result = await service.send(input, async (_, life) => {
    await release.promise;
    try { life.onDispatch?.(); providerCalls++; return execution(); } finally { finished.resolve(); }
  });
  assert.equal(result.body.receipt?.status, 'failed');
  await service.send({ ...input, retry: true }, async (_, life) => { life.onDispatch?.(); providerCalls++; return accept(life); });
  release.resolve(); await finished.promise; await delay(0);
  assert.equal(providerCalls, 1); assert.equal((await repo.get(input.accountId, requestId))?.status, 'sent'); await keepAlive;
});

test('legacy callers keep method/result, but intentionally have no registry guarantee', async () => {
  const repo = new FakeSendRepo(); const service = new SendRequestService(repo, logger); let calls = 0;
  const dispatch = async () => { calls++; return execution(); };
  const a = await service.send({ ...input, clientRequestId: undefined }, dispatch);
  await service.send({ ...input, clientRequestId: undefined }, dispatch);
  assert.deepEqual(a.body.result, execution().result); assert.equal(a.body.method, 'sendMessage');
  assert.equal(a.body.receipt, undefined); assert.equal(repo.rows.size, 0); assert.equal(calls, 2);
});
