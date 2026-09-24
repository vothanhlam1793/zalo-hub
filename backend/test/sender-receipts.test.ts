import test from 'node:test';
import assert from 'node:assert/strict';
import { GoldSender } from '../src/core/runtime/sender.js';
import { GoldRuntime } from '../src/core/runtime/index.js';
import type { SharedState } from '../src/core/runtime/types.js';
import type { GoldConversationMessage } from '../src/core/types.js';
import { parseSendMessageReceipt, providerId, SendFailure } from '../src/core/runtime/send-contract.js';
import { requestId, logger } from './send-request-fixtures.js';

// Hand-authored fixtures mirror installed SDK 2.1.1 declarations/source; not live captures.
const textReceipt = { message: { msgId: 101 }, attachment: [] };
const imageReceipt = { message: null, attachment: [{ msgId: 102 }] };
const captionFileReceipt = { message: { msgId: 103 }, attachment: [{ msgId: 104 }] };

function sender(result: unknown, failLocal = false) {
  const appended: GoldConversationMessage[] = []; const order: string[] = [];
  const state = { boundAccountId: 'account-a', listenerState: {}, logger,
    session: { api: { sendMessage: async () => { order.push('provider'); return result; } } },
    mediaStore: { saveBuffer: async () => { order.push('media'); if (failLocal) throw new Error('media down'); return { publicUrl: '/media/file', localPath: '/private/file' }; } },
  } as unknown as SharedState;
  const instance = new GoldSender(state);
  instance.init({ loginWithStoredCredential: async () => state.session,
    appendConversationMessage: async (m) => { order.push('append'); if (failLocal) throw new Error('database down'); appended.push(m); return true; },
    resolveConversationTarget: () => ({ type: 'direct', threadId: '123' }), getActiveAccountId: () => 'wrong-primary',
  });
  return { instance, appended, order, state };
}

test('strict parser validates actual SDK wrapper, rejecting sentinels/rounded numeric IDs', () => {
  assert.equal(parseSendMessageReceipt(textReceipt).accepted, true);
  assert.deepEqual(parseSendMessageReceipt(captionFileReceipt).slots, [{ id: '103', attachment: false }, { id: '104', attachment: true }]);
  for (const bad of [{}, { success: true }, { message: {}, attachment: [] }, { message: null, attachment: [] },
    { message: null, attachment: [{ photoId: '102' }] }, { message: { msgId: -1 }, attachment: [] },
    { message: { msgId: Number.MAX_SAFE_INTEGER + 1 }, attachment: [] }]) assert.equal(parseSendMessageReceipt(bad).accepted, false);
  for (const bad of [null, {}, '', '0', '-1', NaN, Infinity, 'undefined']) assert.equal(providerId(bad), undefined);
  assert.equal(providerId('9007199254740993'), '9007199254740993');
});

test('duplicate same-role slots collapse once; conflicting text/media identity stays unknown without conflicting DTOs', async () => {
  const sameRole = parseSendMessageReceipt({ message: null, attachment: [{ msgId: 103 }, { msgId: '103' }] });
  assert.equal(sameRole.accepted, true);
  assert.deepEqual(sameRole.slots, [{ id: '103', attachment: true }]);
  const conflicting = { message: { msgId: 103 }, attachment: [{ msgId: 103 }] };
  const { instance, appended } = sender(conflicting);
  const result = await instance.sendAttachment('direct:123', { fileBuffer: Buffer.from('fake'), fileName: 'a.txt', mimeType: 'text/plain' });
  assert.equal(result.status, 'unknown'); assert.deepEqual(result.providerMessageIds, ['103']);
  assert.deepEqual(result.messages, []); assert.equal(appended.length, 0);
});

test('text sends one canonical correlated message; durable acceptance runs before local append', async () => {
  const { instance, appended, order } = sender(textReceipt);
  const result = await instance.sendText('direct:123', 'hello', { clientRequestId: requestId, onAccepted: async () => { order.push('accepted'); } });
  assert.deepEqual(order, ['provider', 'accepted', 'append']);
  assert.equal(result.method, 'sendMessage'); assert.deepEqual(result.result, textReceipt);
  assert.equal(appended[0].id, 'account-a::101'); assert.equal(appended[0].providerMessageId, '101');
  assert.equal(appended[0].clientRequestId, requestId); assert.equal(appended[0].cliMsgId, undefined);
  assert.deepEqual(result.messages, appended);
});

test('image and caption+file preserve every real emitted message and media acceptance boundary', async () => {
  for (const fixture of [imageReceipt, captionFileReceipt]) {
    const { instance, order } = sender(fixture);
    const result = await instance.sendAttachment('direct:123', { fileBuffer: Buffer.from('fake-provider-only'),
      fileName: fixture === imageReceipt ? 'a.png' : 'a.txt', mimeType: fixture === imageReceipt ? 'image/png' : 'text/plain', caption: 'caption' },
    { clientRequestId: requestId, onAccepted: async () => { order.push('accepted'); } });
    assert.ok(order.indexOf('accepted') < order.indexOf('media'));
    assert.equal(result.messages.length, fixture === imageReceipt ? 1 : 2);
    assert.deepEqual(result.providerMessageIds, fixture === imageReceipt ? ['102'] : ['103', '104']);
    assert.equal(result.messages.at(-1)?.attachments[0].url, '/media/file');
    if (fixture === captionFileReceipt) assert.equal(result.messages[0].text, 'caption');
  }
});

test('local database/media failure after acceptance cannot become failed/retryable send', async () => {
  const a = sender(textReceipt, true); let accepted = false;
  const text = await a.instance.sendText('direct:123', 'hello', { onAccepted: async () => { accepted = true; } });
  assert.equal(accepted, true); assert.equal(text.status, 'sent'); assert.equal(text.localPersistenceFailed, true);
  const b = sender(imageReceipt, true);
  const image = await b.instance.sendAttachment('direct:123', { fileBuffer: Buffer.from('fake'), fileName: 'a.png', mimeType: 'image/png' });
  assert.equal(image.status, 'sent'); assert.equal(image.localPersistenceFailed, true); assert.deepEqual(image.providerMessageIds, ['102']);
});

test('missing ID result stays unknown, no fabricated provider/local IDs or append', async () => {
  const { instance, appended } = sender({ message: {}, attachment: [] });
  const result = await instance.sendText('direct:123', 'hello');
  assert.equal(result.status, 'unknown'); assert.deepEqual(result.providerMessageIds, []);
  assert.deepEqual(result.messages, []); assert.equal(appended.length, 0);
});

test('SDK coded text rejection is definite, attachment exception remains ambiguous (caption may already be sent)', async () => {
  const { instance, state } = sender(null);
  state.session!.api.sendMessage = async () => { throw Object.assign(new Error('denied'), { name: 'ZcaApiError', code: 123 }); };
  await assert.rejects(instance.sendText('direct:123', 'hello'), (e) => e instanceof SendFailure && !e.retryable);
  await assert.rejects(instance.sendAttachment('direct:123', { fileBuffer: Buffer.from('fake'), fileName: 'a.txt', mimeType: 'text/plain', caption: 'caption' }),
    (e) => e instanceof Error && !(e instanceof SendFailure));
});

test('distinct observed provider IDs are not deduplicated by equal text/time in runtime', async () => {
  const message = { id: '101', providerMessageId: '101', conversationId: 'direct:123', text: 'same', kind: 'text',
    direction: 'outgoing', timestamp: '2026-09-22T00:00:00.000Z' };
  const fakeRuntime = { state: { boundAccountId: 'account-a', store: { hasMessageByProviderIdForAccount: async () => false } } };
  const duplicate = await (GoldRuntime.prototype as any).isLikelyDuplicateMessage.call(fakeRuntime, [message], { ...message, id: '102', providerMessageId: '102' });
  assert.equal(duplicate, false);
});
