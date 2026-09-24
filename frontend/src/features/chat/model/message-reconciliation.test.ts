import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Message, SendReceipt } from '../../../types';
import { applyReceipt, canRetry, mergeMessages, recoverMessage } from './message-reconciliation';
import { conversationKey, chatSession } from './chat-session';
import { ManualSendQueue } from './manual-send-queue';

const message = (id: string, extra: Partial<Message> = {}): Message => ({
  id, conversationId: 'direct:customer', threadId: 'customer', conversationType: 'direct',
  text: 'identical text', kind: 'text', attachments: [], direction: 'outgoing', isSelf: true,
  timestamp: '2026-09-22T10:00:00.000Z', ...extra,
});
const pending = (request = 'request-1') => message(`pending-${request}`, {
  localId: `pending-${request}`, clientRequestId: request, delivery: 'sending',
});
const canonical = (id = 'provider-1', extra: Partial<Message> = {}) => message(`account::${id}`, { providerMessageId: id, ...extra });
const receipt = (messages: Message[], extra: Partial<SendReceipt> = {}): SendReceipt => ({
  clientRequestId: 'request-1', accountId: 'account', conversationId: 'direct:customer', status: 'sent',
  messages, providerMessageIds: messages.flatMap((m) => m.providerMessageId ? [m.providerMessageId] : []), ...extra,
});

test('identical text/timestamps represent independent intents and provider messages', () => {
  let rows = mergeMessages([pending(), pending('request-2')], [canonical()], 'account');
  assert.equal(rows.length, 3, 'uncorrelated echo remains separate until receipt');
  rows = applyReceipt(rows, receipt([canonical()]));
  rows = applyReceipt(rows, receipt([canonical('provider-2')], { clientRequestId: 'request-2' }));
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map((m) => m.localId)), new Set(['pending-request-1', 'pending-request-2']));
});

test('HTTP-first and WS-first converge; duplicate events keep stable local key', () => {
  const sent = canonical();
  const httpFirst = mergeMessages(applyReceipt([pending()], receipt([sent])), [sent, sent], 'account');
  const wsFirst = applyReceipt(mergeMessages([pending()], [sent, sent], 'account'), receipt([sent]));
  for (const rows of [httpFirst, wsFirst]) {
    assert.equal(rows.length, 1);
    assert.equal(rows[0].localId, 'pending-request-1');
    assert.equal(rows[0].providerMessageId, 'provider-1');
    assert.equal(rows[0].delivery, 'sent');
  }
});

test('caption plus image preserves both real messages, including shared provider cliMsgId', () => {
  const caption = canonical('caption', { cliMsgId: 'same-client' });
  const image = canonical('image', { cliMsgId: 'same-client', kind: 'image', attachments: [{ id: 'img', type: 'image', url: '/media/img' }] });
  const rows = applyReceipt(mergeMessages([pending()], [image, caption], 'account'), receipt([caption, image]));
  assert.equal(rows.length, 2);
  assert.equal(rows.find((m) => m.id === caption.id)?.localId, 'pending-request-1');
  assert.equal(rows.find((m) => m.id === image.id)?.attachments[0].url, '/media/img');
});

test('trusted request echo upgrades a placeholder without text matching', () => {
  const rows = mergeMessages([pending()], [canonical('p', { text: 'server-normalized', clientRequestId: 'request-1' })], 'account');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].localId, 'pending-request-1');
  assert.equal(rows[0].text, 'server-normalized');
  assert.equal(rows[0].delivery, 'sent');
});

test('opaque provider IDs are not split on ::; only known account storage prefix is normalized', () => {
  const rows = mergeMessages([canonical('prefix::same')], [canonical('other::same')], 'account');
  assert.equal(rows.length, 2);
  assert.equal(mergeMessages([message('account::provider')], [canonical('provider')], 'account').length, 1);
});

test('stale hydration cannot resurrect pending or downgrade status/richer metadata', () => {
  const sent = canonical('p', { attachments: [{ id: 'img', type: 'image', url: '/media/new' }], reactions: [{ emoji: '❤️', count: 2 }], quote: { text: 'quoted' } });
  const live = applyReceipt([pending()], receipt([sent]));
  const hydrated = mergeMessages(live, [pending(), canonical('p', { reactions: [] })], 'account', true);
  assert.equal(hydrated.length, 1);
  assert.equal(hydrated[0].delivery, 'sent');
  assert.equal(hydrated[0].reactions?.[0].count, 2);
  assert.equal(hydrated[0].attachments[0].url, '/media/new');
  assert.equal(hydrated[0].quote?.text, 'quoted');
  assert.equal(applyReceipt(hydrated, receipt([], { status: 'unknown' }))[0].delivery, 'sent');
});

test('accepted receipt without IDs is sent but never fabricates a provider ID', () => {
  const rows = applyReceipt([pending()], receipt([]));
  assert.equal(rows[0].delivery, 'sent');
  assert.equal(rows[0].providerMessageId, undefined);
  assert.equal(rows[0].localId, 'pending-request-1');
});

test('one observed receipt ID joins an earlier uncorrelated WS echo without canonical receipt DTOs', () => {
  const rows = applyReceipt(mergeMessages([pending()], [canonical()], 'account'), receipt([], { providerMessageIds: ['provider-1'] }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].localId, 'pending-request-1');
});

test('reload never yields executable queued/sending items; unknown never retryable', () => {
  const queued = recoverMessage({ ...pending(), delivery: 'queued' });
  assert.equal(queued.delivery, 'failed');
  assert.equal(queued.errorCode, 'UNSENT_RELOAD');
  assert.equal(canRetry(queued), false);
  const interrupted = recoverMessage({ ...pending(), localFile: { name: 'a.png', size: 1, type: 'image/png', lastModified: 1 } });
  assert.equal(interrupted.delivery, 'unknown');
  assert.equal(interrupted.attachmentNeedsReselect, true);
  assert.equal(canRetry({ ...interrupted, retryable: true }), false);
  assert.equal(canRetry({ ...interrupted, delivery: 'failed', retryable: true }), true);
});

test('tuple scope and session epochs isolate accounts, users, and same-user re-login', () => {
  assert.notEqual(conversationKey('u', 'a', 'direct:c'), conversationKey('u', 'b', 'direct:c'));
  assert.notEqual(conversationKey('u', 'a', 'direct:c'), conversationKey('v', 'a', 'direct:c'));
  chatSession.setUser('u');
  const captured = chatSession.capture();
  chatSession.setUser('');
  chatSession.setUser('u');
  assert.equal(chatSession.valid(captured), false);
  chatSession.setUser('');
});

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
test('manual queue serializes within a conversation, not across conversations', async () => {
  const calls: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const queue = new ManualSendQueue(() => false);
  queue.enqueue('a', '1', async () => { calls.push('a1'); await held; });
  queue.enqueue('a', '2', async () => { calls.push('a2'); });
  queue.enqueue('b', '1', async () => { calls.push('b1'); });
  assert.deepEqual(calls, ['a1', 'b1']);
  release(); await turn();
  assert.deepEqual(calls, ['a1', 'b1', 'a2']);
});

test('unknown pauses a conversation, queued cancellation and logout cannot dispatch later', async () => {
  let unknown = false;
  const calls: string[] = [];
  const queue = new ManualSendQueue(() => unknown);
  queue.enqueue('a', '1', async () => { calls.push('first'); unknown = true; });
  queue.enqueue('a', '2', async () => { calls.push('cancelled'); });
  queue.enqueue('a', '3', async () => { calls.push('third'); });
  await turn(); assert.deepEqual(calls, ['first']);
  queue.cancel('a', '2');
  unknown = false; await queue.resume('a');
  assert.deepEqual(calls, ['first', 'third']);
  unknown = true;
  queue.enqueue('a', '4', async () => { calls.push('logged-out'); });
  queue.clear(); unknown = false; await queue.resume('a');
  assert.deepEqual(calls, ['first', 'third']);
});
