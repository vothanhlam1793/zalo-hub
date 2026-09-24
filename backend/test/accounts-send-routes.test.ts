import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import express, { type RequestHandler } from 'express';
import type { Knex } from 'knex';
import type multer from 'multer';
import type { AccountRuntimeManager } from '../src/server/account-manager.js';
import type { GoldLogger } from '../src/core/logger.js';
import { createAccountsRouter } from '../src/server/routes/accounts.js';
import { SendRequestService } from '../src/server/services/send-request-service.js';
import { FakeSendRepo, accept, input, logger, requestId } from './send-request-fixtures.js';

async function harness(t: TestContext) {
  let runtimeCalls = 0; let uploadCalls = 0;
  let role = 'editor'; let systemRole = 'user';
  const db = ((table: string) => ({ where() { return this; }, select() { return this; },
    async first() { return { role: table === 'system_users' ? systemRole : role }; },
  })) as unknown as Knex;
  const repo = new FakeSendRepo(); const service = new SendRequestService(repo, logger);
  const manager = { ensureRuntime: async () => { runtimeCalls++; throw new Error('reconnect must not be awaited'); },
    getRegistryStore: () => ({ listConversationMessagesByAccount: async (account: string, conversation: string) => [{
      id: `${account}::local`, conversationId: conversation, threadId: '123', conversationType: 'direct',
      text: 'stored offline', kind: 'text', attachments: [], direction: 'incoming', isSelf: false,
      timestamp: '2026-09-22T01:00:00.000Z',
    }] }),
  } as unknown as AccountRuntimeManager;
  const auth: RequestHandler = (req, res, next) => {
    if (!req.headers.authorization) { res.status(401).json({ error: 'auth required' }); return; }
    (req as any).systemUserId = req.headers.authorization; next();
  };
  const access = (_minimum?: string): RequestHandler => (_req, res, next) => {
    if (role === 'none') { res.status(403).json({ error: 'access denied' }); return; } next();
  };
  const upload = { single: () => (_req: unknown, _res: unknown, next: () => void) => { uploadCalls++; next(); } } as unknown as multer.Multer;
  const app = express(); app.use(express.json());
  app.use('/api/accounts', createAccountsRouter(logger as unknown as GoldLogger, manager, () => {}, upload, db, auth, access, service));
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => { server.close((e) => e ? reject(e) : resolve()); server.closeAllConnections(); }));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}/api/accounts/account-a`, service,
    counts: () => ({ runtimeCalls, uploadCalls }), setRole: (value: string) => { role = value; },
    setSystemRole: (value: string) => { systemRole = value; } };
}

test('authorized offline GET returns existing history shape without reconnect/runtime creation', async (t) => {
  const h = await harness(t);
  const response = await fetch(`${h.url}/conversations/direct%3A123/messages?limit=40`, { headers: { authorization: 'user-a' } });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.equal(body.conversationId, 'direct:123'); assert.equal(body.messages[0].text, 'stored offline');
  assert.equal(body.count, 1); assert.equal(typeof body.oldestTimestamp, 'string'); assert.equal(typeof body.hasMore, 'boolean');
  assert.equal(h.counts().runtimeCalls, 0);
  const bad = await fetch(`${h.url}/conversations/direct%3A123/messages?limit=NaN`, { headers: { authorization: 'user-a' } });
  assert.equal(bad.status, 400);
});

test('multipart authorization occurs before parsing bytes', async (t) => {
  const h = await harness(t);
  assert.equal((await fetch(`${h.url}/send-attachment`, { method: 'POST' })).status, 401);
  h.setRole('none');
  assert.equal((await fetch(`${h.url}/send-attachment`, { method: 'POST', headers: { authorization: 'user-a' } })).status, 403);
  assert.equal(h.counts().uploadCalls, 0);
});

test('status route enforces editor plus initiator, with authorized admin/master/super-admin override', async (t) => {
  const h = await harness(t);
  await h.service.send(input, async (_, life) => accept(life));
  const get = (user: string) => fetch(`${h.url}/send-requests/${requestId}`, { headers: { authorization: user } });
  assert.equal((await get('other-user')).status, 403);
  const own = await get('user-a'); assert.equal(own.status, 200);
  assert.equal((await own.json() as any).receipt.clientRequestId, requestId);
  h.setRole('viewer'); assert.equal((await get('user-a')).status, 403);
  for (const role of ['admin', 'master']) { h.setRole(role); assert.equal((await get('other-user')).status, 200); }
  h.setRole('viewer'); h.setSystemRole('super_admin'); assert.equal((await get('other-user')).status, 200);
  assert.equal(h.counts().runtimeCalls, 0);
});

test('POST validation preserves top-level error; session failure yields durable failed receipt', async (t) => {
  const h = await harness(t);
  const post = (body: object) => fetch(`${h.url}/send`, { method: 'POST', headers: { authorization: 'user-a', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const bad = await post({ conversationId: 'direct:123', text: 'hello', clientRequestId: 'invalid' });
  assert.equal(bad.status, 400); assert.equal(typeof (await bad.json() as any).error, 'string');
  assert.equal(h.counts().runtimeCalls, 0);
  const offline = await post(input); const body = await offline.json() as any;
  assert.equal(offline.status, 409); assert.equal(body.receipt.status, 'failed'); assert.equal(body.receipt.error.retryable, true);
  assert.equal(typeof body.error, 'string');
});
