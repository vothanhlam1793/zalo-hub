import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { WebSocket } from 'ws';
import type { Knex } from 'knex';
import type { AccountRuntimeManager, AccountMessageEvent } from '../src/server/account-manager.js';
import type { GoldConversationMessage } from '../src/core/types.js';
import { createWsHandler } from '../src/server/ws/handler.js';

const secret = process.env.JWT_SECRET || 'zalohub-dev-secret-change-in-production';
const pause = (ms = 40) => new Promise<void>((resolve) => setTimeout(resolve, ms));
type Payload = Record<string, any>;

async function fixture() {
  const users = new Map([
    ['alice', { role: 'user', accounts: ['A', 'C'] }],
    ['bob', { role: 'user', accounts: ['B'] }],
    ['root', { role: 'super_admin', accounts: [] as string[] }],
    ['outsider', { role: 'user', accounts: [] as string[] }],
  ]);
  let failQuery = false;
  const policyReads = new Map<string, number>();
  const policyGates = new Map<string, { wait: Promise<void>; started: () => void }>();
  const releasePolicyGates = new Set<() => void>();
  const knex = { raw: async (sql: string, bindings: string[]) => {
    assert.match(sql, /FROM system_users/);
    assert.match(sql, /zalo_account_memberships/);
    assert.equal(bindings.length, 1);
    const userId = bindings[0];
    policyReads.set(userId, (policyReads.get(userId) ?? 0) + 1);
    const gate = policyGates.get(userId);
    if (gate) {
      policyGates.delete(userId);
      gate.started();
      await gate.wait;
    }
    if (failQuery) throw new Error('private DB failure');
    const user = users.get(bindings[0]);
    if (!user) return { rows: [] };
    const accounts = user.role === 'super_admin' ? ['A', 'B', 'C'] : user.accounts;
    return { rows: accounts.length ? accounts.map((account_id) => ({ account_id, role: user.role })) : [{ account_id: null, role: user.role }] };
  } } as unknown as Knex;
  const listeners = new Set<(event: AccountMessageEvent) => void>();
  const backendEvents: AccountMessageEvent[] = [];
  listeners.add((event) => backendEvents.push(event));
  const manager = {
    onConversationMessage(fn: (event: AccountMessageEvent) => void) { listeners.add(fn); return () => listeners.delete(fn); },
    getRuntime(accountId: string) {
      return {
        async getConversationSummaries() { return [{ id: 'direct:1', title: `Only ${accountId}` }]; },
        async getCurrentAccount() { return { userId: accountId }; },
        async getFriendCache() { return []; },
        async hasCredential() { return true; },
        isSessionActive() { return true; },
        getCurrentQrCode() { return undefined; },
        getListenerState() { return { connected: true, started: true }; },
      };
    },
  } as unknown as AccountRuntimeManager;
  const server = createServer();
  const handler = createWsHandler(server, manager, knex);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const clients: WebSocket[] = [];
  async function client() {
    const ws = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`);
    clients.push(ws);
    const events: Payload[] = [];
    const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
    ws.on('message', (raw) => events.push(JSON.parse(String(raw))));
    ws.on('error', () => { /* close assertions handle connection errors */ });
    async function waitFor(predicate: (event: Payload) => boolean) {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const found = events.find(predicate);
        if (found) return found;
        await pause(5);
      }
      assert.fail(`Missing expected websocket event; received ${JSON.stringify(events)}`);
    }
    await waitFor((e) => e.type === 'connected');
    return {
      ws, events, closed, waitFor,
      send(payload: Payload) { ws.send(JSON.stringify(payload)); },
      async auth(userId: string, extra: Payload = {}) {
        ws.send(JSON.stringify({ type: 'authenticate', token: jwt.sign({ userId, ...extra }, secret, extra.exp ? {} : { expiresIn: '1h' }) }));
        await waitFor((e) => e.type === 'authenticated');
      },
    };
  }
  return {
    ...handler, users, client, backendEvents, policyReads,
    pauseNextPolicyRead(userId: string) {
      assert.ok(!policyGates.has(userId), 'Only one pending gate per user');
      let release!: () => void;
      let started!: () => void;
      const startedPromise = new Promise<void>((resolve) => { started = resolve; });
      const wait = new Promise<void>((resolve) => { release = resolve; });
      policyGates.set(userId, { wait, started });
      releasePolicyGates.add(release);
      return { started: startedPromise, release };
    },
    failQuery() { failQuery = true; },
    emit(accountId: string, conversationId: string, id = 'm1') {
      const message = { id, conversationId, clientRequestId: 'request-1', direction: 'outgoing', isSelf: true, customReceipt: { preserved: true } } as unknown as GoldConversationMessage;
      for (const listener of listeners) listener({ accountId, message });
      return message;
    },
    async close() {
      for (const release of releasePolicyGates) release();
      for (const client of clients) client.terminate();
      await new Promise<void>((resolve) => handler.wsServer.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
      assert.equal(listeners.size, 1, 'WS disposal retains unrelated backend listeners');
    },
  };
}

test('anonymous sockets receive connected/auth error only; no global data escape', { timeout: 10_000 }, async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const c = await f.client();
  f.broadcast({ type: 'session_state', accountId: 'A', status: { secret: true } });
  f.broadcast({ type: 'tag_created', tag: { secret: true } });
  f.broadcast({ type: 'connected', secret: true });
  f.emit('A', 'direct:1');
  await pause();
  assert.ok(c.events.every((e) => JSON.stringify(e) === '{"type":"connected"}'));
  c.send({ type: 'subscribe', accountId: 'A', conversationId: 'direct:1' });
  assert.equal(await c.closed, 4401);
  assert.ok(c.events.every((e) => ['connected', 'error'].includes(e.type)));
});

test('two users: initial status, summaries, unknown events and messages are scoped', { timeout: 10_000 }, async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const a = await f.client(); const b = await f.client();
  await a.auth('alice'); await b.auth('bob');
  a.send({ type: 'subscribe', accountId: 'A', conversationId: 'direct:1' });
  b.send({ type: 'subscribe', accountId: 'B', conversationId: 'direct:1' });
  await a.waitFor((e) => e.type === 'subscribed'); await b.waitFor((e) => e.type === 'subscribed');
  const ownMessage = f.emit('A', 'direct:1');
  f.emit('A', 'direct:2', 'wrong-conversation');
  f.emit('B', 'direct:1', 'bob-message');
  f.broadcast({ type: 'conversation_summaries', accountId: 'C', conversations: [{ id: 'other-authorized-account' }] });
  f.broadcast({ type: 'future_event', accountId: 'A', additive: { intact: true } });
  f.broadcast({ type: 'tag_deleted', tagId: 'unscoped' });
  const receipt = await a.waitFor((e) => e.type === 'conversation_message');
  assert.deepEqual(receipt.message, ownMessage);
  await b.waitFor((e) => e.type === 'conversation_message');
  await a.waitFor((e) => e.type === 'future_event');
  await pause();
  assert.deepEqual(a.events.filter((e) => e.type === 'conversation_message').map((e) => e.message.id), ['m1']);
  assert.ok(a.events.every((e) => !e.accountId || ['A', 'C'].includes(e.accountId)));
  assert.ok(b.events.every((e) => !e.accountId || e.accountId === 'B'));
  assert.ok(a.events.some((e) => e.accountId === 'C' && e.type === 'conversation_summaries'));
  assert.ok(!a.events.some((e) => e.type === 'tag_deleted'));
  assert.equal(f.backendEvents.length, 3, 'WS does not swallow local outgoing/backend events');
  a.send({ type: 'unsubscribe' }); await a.waitFor((e) => e.type === 'unsubscribed');
  f.emit('A', 'direct:1', 'after-unsubscribe');
  f.broadcast({ type: 'future_event', accountId: 'C', after: 'unsubscribe' });
  await a.waitFor((e) => e.after === 'unsubscribe');
  assert.ok(!a.events.some((e) => e.message?.id === 'after-unsubscribe'));
});

test('no membership denies subscription; first token-bearing subscribe and DB super-admin work', { timeout: 10_000 }, async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const outsider = await f.client(); await outsider.auth('outsider');
  outsider.send({ type: 'subscribe', accountId: 'A', conversationId: 'direct:1' });
  await outsider.waitFor((e) => e.code === 'ACCOUNT_FORBIDDEN');
  const root = await f.client();
  root.send({ type: 'subscribe', token: jwt.sign({ userId: 'root' }, secret, { expiresIn: '1h' }), accountId: 'B', conversationId: 'direct:1' });
  await root.waitFor((e) => e.type === 'subscribed');
  assert.ok(root.events.findIndex((e) => e.type === 'authenticated') < root.events.findIndex((e) => e.type === 'subscribed'));
  f.emit('B', 'direct:1'); await root.waitFor((e) => e.type === 'conversation_message');
  assert.ok(!outsider.events.some((e) => e.accountId));
  // JWT roles cannot grant the bypass.
  const forgedRole = await f.client(); await forgedRole.auth('outsider', { role: 'super_admin' });
  forgedRole.send({ type: 'subscribe', accountId: 'A', conversationId: 'direct:1' });
  await forgedRole.waitFor((e) => e.code === 'ACCOUNT_FORBIDDEN');
});

test('both broadcast APIs scope message envelopes; rejected replacement clears the old subscription', { timeout: 10_000 }, async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const c = await f.client(); await c.auth('alice');
  c.send({ type: 'subscribe', accountId: 'A', conversationId: 'direct:1' });
  await c.waitFor((e) => e.type === 'subscribed');
  const message = { id: 'public-helper', conversationId: 'direct:1', clientRequestId: 'request-2' } as unknown as GoldConversationMessage;
  f.broadcastConversationMessage('A', message);
  await c.waitFor((e) => e.message?.id === 'public-helper');
  f.broadcast({ type: 'conversation_message', accountId: 'A', message: { ...message, id: 'generic-helper' }, additive: true });
  const generic = await c.waitFor((e) => e.message?.id === 'generic-helper');
  assert.equal(generic.additive, true);
  c.send({ type: 'subscribe', accountId: 'B', conversationId: 'direct:1' });
  await c.waitFor((e) => e.code === 'ACCOUNT_FORBIDDEN');
  f.broadcastConversationMessage('A', { ...message, id: 'old-subscription' });
  f.broadcast({ type: 'future_event', accountId: 'A', marker: 'barrier' });
  await c.waitFor((e) => e.marker === 'barrier');
  assert.ok(!c.events.some((e) => e.message?.id === 'old-subscription'));
});

test('membership revocation and super-admin demotion recheck before next payload', { timeout: 10_000 }, async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const a = await f.client(); await a.auth('alice');
  a.send({ type: 'subscribe', accountId: 'A', conversationId: 'direct:1' });
  await a.waitFor((e) => e.type === 'subscribed');
  f.users.get('alice')!.accounts = ['C'];
  f.emit('A', 'direct:1', 'revoked');
  f.broadcast({ type: 'conversation_summaries', accountId: 'A', marker: 'revoked' });
  await a.waitFor((e) => e.code === 'ACCOUNT_ACCESS_REVOKED');
  f.broadcast({ type: 'future_event', accountId: 'C', marker: 'allowed' });
  await a.waitFor((e) => e.marker === 'allowed');
  assert.ok(!a.events.some((e) => e.message?.id === 'revoked' || e.marker === 'revoked'));
  const root = await f.client(); await root.auth('root');
  f.users.get('root')!.role = 'user';
  f.broadcast({ type: 'future_event', accountId: 'A', marker: 'demoted' });
  await pause();
  assert.ok(!root.events.some((e) => e.marker === 'demoted'));
  f.users.delete('alice');
  f.broadcast({ type: 'future_event', accountId: 'C' });
  assert.equal(await a.closed, 4401);
});

test('invalid/expired JWTs and expiry during an open session cannot deliver data', { timeout: 10_000 }, async (t) => {
  const f = await fixture(); t.after(() => f.close());
  for (const token of ['invalid', jwt.sign({ userId: 'alice', exp: Math.floor(Date.now() / 1000) - 1 }, secret)]) {
    const c = await f.client(); c.send({ type: 'authenticate', token });
    assert.equal(await c.closed, 4401);
    assert.ok(c.events.every((e) => ['connected', 'error'].includes(e.type)));
  }
  const c = await f.client(); await c.auth('alice', { exp: Math.floor(Date.now() / 1000) + 2 });
  assert.equal(await c.closed, 4401);
  assert.ok(c.events.some((e) => e.code === 'TOKEN_EXPIRED'));
  const length = c.events.length;
  f.broadcast({ type: 'future_event', accountId: 'A' }); await pause();
  assert.equal(c.events.length, length);
});

test('policy DB errors fail closed without exposing exception details', { timeout: 10_000 }, async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const c = await f.client(); await c.auth('alice');
  f.failQuery();
  f.broadcast({ type: 'future_event', accountId: 'A', marker: 'private' });
  assert.equal(await c.closed, 1013);
  assert.ok(!JSON.stringify(c.events).includes('private'));
  assert.ok(c.events.some((e) => e.code === 'AUTH_UNAVAILABLE'));
});

test('unrelated-account and unsubscribed-conversation bursts spend no healthy client queue or policy budget', { timeout: 10_000 }, async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const a = await f.client(); const b = await f.client();
  await a.auth('alice'); await b.auth('bob');
  // Finish bootstrap before counting delivery reads or pausing a policy query.
  await a.waitFor((e) => e.type === 'session_state' && e.accountId === 'C');
  await b.waitFor((e) => e.type === 'session_state' && e.accountId === 'B');
  a.send({ type: 'subscribe', accountId: 'A', conversationId: 'direct:1' });
  b.send({ type: 'subscribe', accountId: 'B', conversationId: 'direct:1' });
  await a.waitFor((e) => e.type === 'subscribed'); await b.waitFor((e) => e.type === 'subscribed');
  const aliceReads = f.policyReads.get('alice')!;
  const bobReads = f.policyReads.get('bob')!;
  for (let i = 0; i < 400; i++) {
    f.broadcastConversationMessage('A', { id: `other-a-${i}`, conversationId: 'direct:other' } as GoldConversationMessage);
    f.broadcast({ type: 'conversation_message', accountId: 'B', message: { id: `other-b-${i}`, conversationId: 'direct:other' } });
  }
  f.broadcast({ type: 'future_event', accountId: 'A', marker: 'alice-barrier' });
  f.broadcast({ type: 'future_event', accountId: 'B', marker: 'bob-barrier' });
  await a.waitFor((e) => e.marker === 'alice-barrier'); await b.waitFor((e) => e.marker === 'bob-barrier');
  assert.equal(f.policyReads.get('alice'), aliceReads + 1, 'Only the eligible barrier needs a DB read');
  assert.equal(f.policyReads.get('bob'), bobReads + 1);
  assert.equal(a.ws.readyState, WebSocket.OPEN);
  assert.equal(b.ws.readyState, WebSocket.OPEN);
  assert.ok(![...a.events, ...b.events].some((e) => e.message?.conversationId === 'direct:other'));

  // Hold B's legitimate delivery in the database, then exceed the queue bound
  // with A traffic. A may exhaust its own budget; B must remain unaffected.
  const gate = f.pauseNextPolicyRead('bob');
  const beforeHeldRead = f.policyReads.get('bob')!;
  f.broadcast({ type: 'future_event', accountId: 'B', marker: 'held-authorized' });
  await gate.started;
  for (let i = 0; i < 400; i++) {
    f.broadcast({ type: 'conversation_summaries', accountId: 'A', conversations: [], unrelatedBurst: i });
    f.broadcast({ type: 'session_state', accountId: 'A', status: {}, unrelatedBurst: i });
    f.broadcast({ type: 'future_event', accountId: 'A', unrelatedBurst: i });
    f.broadcastConversationMessage('A', { id: `busy-a-${i}`, conversationId: 'direct:1' } as GoldConversationMessage);
  }
  gate.release();
  await b.waitFor((e) => e.marker === 'held-authorized');
  f.broadcastConversationMessage('B', { id: 'healthy-after-burst', conversationId: 'direct:1' } as GoldConversationMessage);
  await b.waitFor((e) => e.message?.id === 'healthy-after-burst');
  assert.equal(f.policyReads.get('bob'), beforeHeldRead + 2, 'No A broadcast queued a policy read for B');
  assert.equal(b.ws.readyState, WebSocket.OPEN);
  assert.ok(!b.events.some((e) => e.code === 'SLOW_CLIENT' || e.accountId === 'A'));
});

test('permission gains are learned by fresh subscribe, not by rejected broadcast traffic', { timeout: 10_000 }, async (t) => {
  const f = await fixture(); t.after(() => f.close());
  const c = await f.client(); await c.auth('outsider');
  const readsBeforeGrant = f.policyReads.get('outsider')!;
  f.users.get('outsider')!.accounts = ['B'];
  for (let i = 0; i < 400; i++) f.broadcast({ type: 'future_event', accountId: 'B', marker: 'before-refresh' });
  c.send({ type: 'subscribe', accountId: 'B', conversationId: 'direct:1' });
  await c.waitFor((e) => e.type === 'subscribed');
  assert.equal(f.policyReads.get('outsider'), readsBeforeGrant + 1, 'Only the command refreshes a newly granted account');
  assert.ok(!c.events.some((e) => e.marker === 'before-refresh'), 'Dropped events are not replayed');
  f.broadcast({ type: 'session_state', accountId: 'B', status: {}, marker: 'granted-summary' });
  f.broadcastConversationMessage('B', { id: 'granted-message', conversationId: 'direct:1' } as GoldConversationMessage);
  await c.waitFor((e) => e.marker === 'granted-summary');
  await c.waitFor((e) => e.message?.id === 'granted-message');
  assert.equal(c.ws.readyState, WebSocket.OPEN);
});

for (const change of ['revocation', 'expiry'] as const) {
  test(`pre-queue eligibility cannot bypass ${change} during an in-flight policy read`, { timeout: 10_000 }, async (t) => {
    const f = await fixture(); t.after(() => f.close());
    const c = await f.client();
    await c.auth('bob', change === 'expiry' ? { exp: Math.floor(Date.now() / 1000) + 3 } : {});
    await c.waitFor((e) => e.type === 'session_state' && e.accountId === 'B');
    c.send({ type: 'subscribe', accountId: 'B', conversationId: 'direct:1' });
    await c.waitFor((e) => e.type === 'subscribed');
    const gate = f.pauseNextPolicyRead('bob');
    f.broadcastConversationMessage('B', { id: 'must-not-arrive', conversationId: 'direct:1' } as GoldConversationMessage);
    await gate.started;
    if (change === 'revocation') {
      f.users.get('bob')!.accounts = [];
      gate.release();
      await c.waitFor((e) => e.code === 'ACCOUNT_ACCESS_REVOKED');
    } else {
      assert.equal(await c.closed, 4401, 'Expiry closes even while the policy query is pending');
      gate.release();
      await pause();
      assert.ok(c.events.some((e) => e.code === 'TOKEN_EXPIRED'));
    }
    assert.ok(!c.events.some((e) => e.message?.id === 'must-not-arrive'));
  });
}
