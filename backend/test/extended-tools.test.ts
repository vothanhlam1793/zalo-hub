import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { createExtendedToolsRouter, stickerKeyword } from '../src/server/routes/extended-tools.js';
import { ExtendedToolsService, parseAction, prepareAction, toolCapabilities, type ActionStore } from '../src/server/services/extended-tools-service.js';
import { parseBatch } from '../src/server/services/composer-service.js';
import { SendRequestError } from '../src/server/services/send-request-service.js';
const scope = { account_id: 'a', system_user_id: 'u', conversation_id: 'group:1' };
test('sticker search requires nonempty bounded SDK keyword', () => {
  for (const value of [undefined, '', '   ', 'a'.repeat(101), ['x']]) assert.throws(() => stickerKeyword(value), { code: 'INVALID_QUERY' });
  assert.equal(stickerKeyword(' hello '), 'hello');
});
class MemoryStore implements ActionStore {
  rows = new Map<string, any>();
  async get(s: typeof scope, id: string) { const r = this.rows.get(id); if (!r || r.system_user_id !== s.system_user_id || r.conversation_id !== s.conversation_id || r.account_id !== s.account_id) throw new SendRequestError(404, 'NOT_FOUND', 'Not found'); return r; }
  async reserve(s: typeof scope, input: ReturnType<typeof parseAction>, hash: string) {
    const fresh = !this.rows.has(input.id);
    if (fresh) this.rows.set(input.id, { ...s, ...input, payload_hash: hash, status: 'unknown' });
    const row = await this.get(s, input.id);
    if (row.payload_hash !== hash) throw new SendRequestError(409, 'REQUEST_CONFLICT', 'Conflict');
    return { fresh, row };
  }
  async settle(s: typeof scope, id: string, status: string, result: unknown) { Object.assign(await this.get(s, id), { status, result }); }
}
test('scoped receipts deduplicate concurrent sends, conflicts, ownership and unknown replay', async () => {
  const store = new MemoryStore(), service = new ExtendedToolsService(store);
  const input = parseAction({ id: randomUUID(), action: 'sticker', stickerId: 123 });
  let calls = 0;
  const dispatch = async () => { calls++; return { msgId: '10' }; };
  await Promise.all([service.execute(scope, input, dispatch), service.execute(scope, input, dispatch)]);
  assert.equal(calls, 1);
  assert.equal((await service.execute(scope, input, dispatch)).status, 'accepted');
  await assert.rejects(service.execute(scope, { ...input, payload: { stickerId: 124 } }, dispatch), { status: 409 });
  await assert.rejects(service.execute({ ...scope, system_user_id: 'other' }, input, dispatch), { status: 404 });
  const uncertain = { ...input, id: randomUUID() };
  assert.equal((await service.execute(scope, uncertain, async () => { calls++; throw new Error('network lost'); })).status, 'unknown');
  await service.execute(scope, uncertain, dispatch); assert.equal(calls, 2);
});
test('eight concurrent actions acquire synchronous permits before slow reservation; duplicate/failure releases permit', async () => {
  const store = new MemoryStore();
  const original = store.reserve.bind(store);
  let reservations = 0, peak = 0, running = 0;
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  store.reserve = async (...args) => { reservations++; running++; peak = Math.max(peak, running); await gate; running--; return original(...args); };
  const service = new ExtendedToolsService(store);
  const work = Array.from({ length: 8 }, () => service.execute(scope, parseAction({ id: randomUUID(), action: 'sticker', stickerId: 1 }), async () => ({ msgId: '1' })));
  const settled = Promise.allSettled(work);
  await new Promise(r => setImmediate(r));
  assert.equal(reservations, 4); assert.equal(peak, 4);
  release();
  const results = await settled;
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 4);
  for (const r of results) if (r.status === 'rejected') { assert.equal(r.reason.status, 429); assert.equal(r.reason.dispatched, false); assert.equal(r.reason.reserved, false); }
  const input = parseAction({ id: randomUUID(), action: 'sticker', stickerId: 1 });
  await service.execute(scope, input, async () => ({}));
  for (let i = 0; i < 8; i++) await service.execute(scope, input, async () => { throw new Error('duplicate dispatch'); });
  store.reserve = async () => { throw new Error('DB unavailable'); };
  for (let i = 0; i < 8; i++) await assert.rejects(service.execute(scope, { ...input, id: randomUUID() }, async () => ({})), /DB unavailable/);
  store.reserve = original;
  assert.equal((await service.execute(scope, { ...input, id: randomUUID() }, async () => ({}))).status, 'accepted');
});
test('async preparation is inside durable reservation: failure rejects without dispatch, replay never prepares again', async () => {
  const store = new MemoryStore(), service = new ExtendedToolsService(store);
  const input = parseAction({ id: randomUUID(), action: 'sticker', stickerId: 1 });
  let calls = 0;
  const result = await service.execute(scope, input, async () => { calls++; }, async () => {
    assert.equal((await store.get(scope, input.id)).status, 'unknown');
    throw new Error('catalog 503');
  });
  assert.equal(result.status, 'rejected'); assert.equal(result.result.dispatched, false); assert.equal(calls, 0);
  assert.equal((await service.execute(scope, input, async () => { calls++; })).status, 'rejected'); assert.equal(calls, 0);
});
test('actual capabilities and input bounds do not advertise voice/location or direct polls', () => {
  assert.equal(toolCapabilities({ createPoll() {} }, 'direct:1').poll, false);
  assert.equal(toolCapabilities({ sendVoice() {} }, 'group:1').voice, false);
  assert.equal(toolCapabilities({}, 'group:1').location, false);
  for (const b of [{ action: 'location' }, { action: 'sticker', stickerId: '1' }, { action: 'poll', question: 'x', options: ['a'] }, { action: 'reminder', title: 'x', startTime: NaN }]) assert.throws(() => parseAction({ id: randomUUID(), ...b }));
});
test('SDK sticker/poll/reminder adapters use installed argument signatures', async () => {
  const sticker = { id: 2, cateId: 4, type: 3 };
  const calls: any[] = [];
  const api = { getStickers() {}, getStickersDetail: async () => [sticker], sendSticker: async (...args: any[]) => { calls.push(args); return { msgId: 7 }; },
    createPoll: async (...args: any[]) => { calls.push(args); return { poll_id: '8' }; },
    createReminder: async (...args: any[]) => { calls.push(args); return { reminderId: '9' }; } };
  for (const action of [{ action: 'sticker', stickerId: 2 }, { action: 'poll', question: 'Q', options: ['A', 'B'] }, { action: 'reminder', title: 'R', startTime: 1234 }]) {
    await (await prepareAction({} as any, scope, parseAction({ id: randomUUID(), ...action }), api, async () => {}))();
  }
  assert.deepEqual(calls[0], [sticker, '1', 1]);
  assert.deepEqual(calls[1], [{ question: 'Q', options: ['A', 'B'] }, '1']);
  assert.deepEqual(calls[2], [{ title: 'R', startTime: 1234 }, '1', 1]);
});
test('forward checks target authorization; recall requires own message and real client ID', async () => {
  let message: any = { kind: 'text', text: 'hello', direction: 'incoming', provider_message_id: '12', raw_message_json: '{}' };
  const db: any = () => ({ where() { return this; }, first: async () => message });
  const api = { forwardMessage: async () => ({ success: [{ msgId: '1' }], failed: [] }), undo: async () => ({ status: 0 }) };
  await assert.rejects(prepareAction(db, scope, parseAction({ id: randomUUID(), action: 'forward', messageId: 'm', target: 'group:2' }), api, async () => { throw new SendRequestError(403, 'FORBIDDEN', 'denied'); }), { status: 403 });
  await assert.rejects(prepareAction(db, scope, parseAction({ id: randomUUID(), action: 'undo', messageId: 'm' }), api, async () => {}), { status: 400 });
  message = { ...message, direction: 'outgoing', raw_message_json: JSON.stringify({ cliMsgId: '99' }) };
  assert.deepEqual(await (await prepareAction(db, scope, parseAction({ id: randomUUID(), action: 'undo', messageId: 'm' }), api, async () => {}))(), { providerStatus: 0 });
});
test('batch context is validated and preserved in immutable payload', () => {
  const body = { clientBatchId: randomUUID(), items: [{ stagingId: randomUUID(), clientRequestId: randomUUID(), caption: '@A hi', mentions: [{ pos: 0, len: 2, uid: '1' }], quoteMessageId: 'm' }] };
  assert.equal(parseBatch(body).items[0].quoteMessageId, 'm');
  assert.throws(() => parseBatch({ ...body, items: [{ ...body.items[0], mentions: [{ pos: 10, len: 2, uid: '1' }] }] }));
});
test('tools route rejects anonymous and viewer before SDK/receipt access', async () => {
  for (const user of [undefined, 'viewer']) {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { (req as any).systemUserId = user; next(); });
    const db: any = () => ({ where() { return this; }, first: async () => ({ role: 'viewer' }) });
    app.use('/accounts/:accountId/tools', createExtendedToolsRouter(db, () => { throw new Error('SDK must not be accessed'); }));
    const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
    try {
      const url = `http://127.0.0.1:${(server.address() as any).port}/accounts/a/tools`;
      for (const path of ['/capabilities', '/actions', '/actions/' + randomUUID()]) assert.equal((await fetch(url + path + '?conversationId=group:1')).status, user ? 403 : 401);
      assert.equal((await fetch(url + '/actions?conversationId=group:1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: randomUUID(), action: 'sticker', stickerId: 1 }) })).status, user ? 403 : 401);
    } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
  }
});
