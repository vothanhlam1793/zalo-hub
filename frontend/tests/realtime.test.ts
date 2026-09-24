import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRealtimeConnection } from '../src/features/realtime/useWebSocket';

type Payload = Record<string, any>;
class FakeSocket {
  readyState = 0;
  sent: Payload[] = [];
  listeners = new Map<string, Array<(event: any) => void>>();
  addEventListener(name: string, callback: (event: any) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), callback]);
  }
  emit(name: string, event: any = {}) { for (const callback of this.listeners.get(name) ?? []) callback(event); }
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  open() { this.readyState = 1; this.emit('open'); }
  message(payload: Payload) { this.emit('message', { data: JSON.stringify(payload) }); }
  close(code = 1000) { this.readyState = 3; this.emit('close', { code }); }
}

function fixture() {
  const sockets: FakeSocket[] = [];
  const received: Payload[] = [];
  const jobs = new Map<number, { callback: () => void; delay: number }>();
  let id = 0;
  let token: string | null = 'jwt-user-A';
  let current = true;
  const transport = createRealtimeConnection({
    url: 'ws://local.test/ws', getToken: () => token, isSessionCurrent: () => current,
    onPayload: (payload) => received.push(payload),
    createSocket(url) { assert.equal(url, 'ws://local.test/ws'); const socket = new FakeSocket(); sockets.push(socket); return socket as unknown as WebSocket; },
    schedule(callback, delay) { jobs.set(++id, { callback, delay }); return id as unknown as ReturnType<typeof setTimeout>; },
    cancel(timer) { jobs.delete(timer as unknown as number); },
  });
  return {
    transport, sockets, received, jobs,
    setToken(value: string | null) { token = value; },
    logout() { current = false; token = null; transport.dispose(); },
    run(delay: number) {
      const entry = [...jobs].find(([, job]) => job.delay === delay);
      assert.ok(entry, `Missing timer for ${delay}ms`);
      jobs.delete(entry[0]); entry[1].callback();
    },
  };
}

test('authenticate on open, suppress pre-auth data, subscribe once after ack with latest captured selection', () => {
  const f = fixture();
  f.transport.subscribe('A', 'direct:1');
  f.transport.connect(); const s = f.sockets[0]; s.open();
  assert.deepEqual(s.sent, [{ type: 'authenticate', token: 'jwt-user-A' }]);
  s.message({ type: 'conversation_message', accountId: 'A', message: { id: 'anonymous' } });
  assert.equal(f.received.length, 0);
  f.transport.subscribe('B', 'direct:2');
  s.message({ type: 'authenticated' }); s.message({ type: 'authenticated' });
  assert.deepEqual(s.sent[1], { type: 'subscribe', accountId: 'B', conversationId: 'direct:2' });
  assert.equal(s.sent.length, 2);
  assert.equal(f.jobs.size, 0);
  const lateReceipt = { type: 'conversation_message', accountId: 'A', message: { conversationId: 'direct:1', clientRequestId: 'request-1', extra: 'preserve' } };
  s.message(lateReceipt);
  s.message({ type: 'future_event', accountId: 'A', untouched: true });
  assert.deepEqual(f.received[1], lateReceipt, 'never relabel late receipt using B selection');
  assert.equal(f.received[2].untouched, true);
  f.transport.dispose();
});

test('reconnect authenticates then resubscribes exactly once; old close/message cannot affect new socket', () => {
  const f = fixture(); f.transport.connect();
  const old = f.sockets[0]; old.open(); old.message({ type: 'authenticated' });
  f.transport.subscribe('A', 'direct:1'); old.close(1006);
  assert.equal(f.jobs.size, 1); f.run(1000);
  const next = f.sockets[1]; next.open();
  assert.deepEqual(next.sent, [{ type: 'authenticate', token: 'jwt-user-A' }]);
  old.emit('close', { code: 1006 }); old.message({ type: 'future_event', accountId: 'A', stale: true });
  next.message({ type: 'authenticated' });
  assert.deepEqual(next.sent[1], { type: 'subscribe', accountId: 'A', conversationId: 'direct:1' });
  assert.ok(!f.received.some((p) => p.stale)); assert.equal(f.jobs.size, 0);
  f.transport.dispose(); old.close(); next.close();
  assert.equal(f.jobs.size, 0);
});

test('unmount/logout dispose both reconnect and handshake timers; delayed callbacks are inert', () => {
  for (const phase of ['connecting', 'retry', 'authenticated']) {
    const f = fixture(); f.transport.connect(); const socket = f.sockets[0];
    if (phase === 'retry') socket.close(1006);
    if (phase === 'authenticated') { socket.open(); socket.message({ type: 'authenticated' }); }
    const lateTimers = [...f.jobs.values()];
    f.logout();
    for (const job of lateTimers) job.callback();
    socket.open(); socket.message({ type: 'authenticated' }); socket.close();
    assert.equal(f.jobs.size, 0); assert.equal(f.sockets.length, 1);
    assert.equal(socket.sent.length, phase === 'authenticated' ? 1 : 0);
  }
});

test('token replacement or expiry ends old session without retry or cross-user payloads', () => {
  const f = fixture(); f.transport.connect(); const socket = f.sockets[0];
  socket.open(); socket.message({ type: 'authenticated' });
  f.setToken('jwt-user-B'); socket.message({ type: 'future_event', accountId: 'A', stale: true });
  assert.ok(!f.received.some((p) => p.stale)); assert.equal(f.jobs.size, 0);
  const expired = fixture(); expired.transport.connect(); const s = expired.sockets[0];
  s.open(); s.message({ type: 'authenticated' }); s.message({ type: 'error', code: 'TOKEN_EXPIRED' });
  s.close(4401); assert.equal(expired.jobs.size, 0);
});

test('failed handshakes back off, error/close cannot double schedule, unsubscribe survives reconnect', () => {
  const f = fixture(); f.transport.connect(); f.transport.subscribe('A', 'direct:1');
  const first = f.sockets[0]; first.open();
  f.run(10_000); f.run(1000);
  const second = f.sockets[1]; second.open(); second.emit('error'); second.close(1006);
  assert.equal(f.jobs.size, 1); f.run(2000);
  f.transport.unsubscribe();
  const third = f.sockets[2]; third.open(); third.message({ type: 'authenticated' });
  assert.deepEqual(third.sent, [{ type: 'authenticate', token: 'jwt-user-A' }]);
  assert.equal(f.jobs.size, 0); f.transport.dispose();
});
