import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatSession, conversationKey } from './chat-session';
import { conversationRecovery } from './conversation-recovery';
import { ensureConversationRecovered, useComposerStore } from '../../../stores/composer-store';
import { useChatStore } from '../../../stores/chat-store';
import { clientDb } from '../../../lib/client-db';
import { submitMessage } from './send-controller';
import { sendComposerBatch } from './composer-controller';
import { freezeBatch, type StoredComposer } from './composer-types';
import type { Message } from '../../../types';
const turn = () => new Promise<void>(r => setImmediate(r));
test('delayed dual recovery gates dispatch and saves; edits preserve old attachments/context and durable unknown', async () => {
  const original = { getDraft: clientDb.getDraft, getRecoveryMessages: clientDb.getRecoveryMessages, saveComposer: clientDb.saveComposer, saveMessages: clientDb.saveMessages, fetch: globalThis.fetch };
  chatSession.setUser(''); chatSession.setUser('recovery');
  const key = conversationKey('recovery', 'a', 'group:g');
  let draft!: (v: StoredComposer) => void, messages!: (v: Message[]) => void;
  let saves = 0, posts = 0;
  clientDb.getDraft = () => new Promise(r => { draft = r; });
  clientDb.getRecoveryMessages = () => new Promise(r => { messages = r; });
  clientDb.saveComposer = async () => { saves++; return true; };
  clientDb.saveMessages = async () => true;
  globalThis.fetch = async () => { posts++; throw new Error('must not dispatch'); };
  try {
    useComposerStore.getState().selectKey(key);
    useComposerStore.getState().setText('new typed text');
    const task = ensureConversationRecovered(key);
    const mentions = [{ uid: 'u', pos: 0, len: 4 }];
    const replyingTo = { id: 'quote' } as Message;
    draft({ version: 2, text: '@Old ', mentions, replyingTo, attachments: [{ id: 'old', name: 'old.png', file: new Blob(['bytes']), type: 'image/png', size: 5, lastModified: 0, caption: '', upload: 'local' }] });
    await turn();
    assert.equal(saves, 0); assert.equal(conversationRecovery.ready(key), false);
    submitMessage(key, 'explicit new send');
    assert.equal(posts, 0);
    messages([{ id: 'old-send', clientRequestId: 'old-id', text: '', kind: 'text', attachments: [], conversationId: 'group:g', delivery: 'unknown', timestamp: '', direction: 'outgoing', isSelf: true, threadId: 'g', conversationType: 'group' }]);
    await task; await turn();
    assert.equal(conversationRecovery.ready(key), true); assert.equal(posts, 0);
    const recovered = useComposerStore.getState().drafts[key];
    assert.equal(recovered.attachments[0].name, 'old.png');
    assert.deepEqual(recovered.replyingTo, replyingTo);
    assert.deepEqual(recovered.recoveredDrafts?.[0], { text: '@Old ', mentions, replyingTo });
    assert.ok(saves > 0);
    assert.equal(useChatStore.getState().byConversation[key].messages.some(m => m.delivery === 'unknown'), true);
  } finally { Object.assign(clientDb, { getDraft: original.getDraft, getRecoveryMessages: original.getRecoveryMessages, saveComposer: original.saveComposer, saveMessages: original.saveMessages }); globalThis.fetch = original.fetch; chatSession.setUser(''); }
});
test('mention-only image freeze preserves exact whitespace and offset', () => {
  const mentions = [{ uid: 'u', pos: 2, len: 4 }];
  const payload = freezeBatch([{ id: 'a', name: 'a.png', type: 'image/png', size: 1, lastModified: 0, caption: '', upload: 'ready', stage: { id: crypto.randomUUID(), status: 'ready', fileName: 'a.png', mimeType: 'image/png', size: 1, expiresAt: '' } }], '  @Old ', mentions);
  assert.equal(payload.items[0].caption, '  @Old ');
  assert.deepEqual(payload.items[0].mentions, mentions);
});
test('unknown outbox recovered last blocks dispatch; untouched mentions and explicit reply edit survive delayed merge', async () => {
  const original = { draft: clientDb.getDraft, messages: clientDb.getRecoveryMessages, save: clientDb.saveComposer, fetch: globalThis.fetch };
  chatSession.setUser('outbox-recovery');
  const key = conversationKey('outbox-recovery', 'a', 'group:g');
  let resolveDraft!: (v: StoredComposer) => void;
  let posts = 0;
  clientDb.getDraft = () => new Promise(r => { resolveDraft = r; });
  clientDb.getRecoveryMessages = async () => [];
  clientDb.saveComposer = async () => true;
  globalThis.fetch = async () => { posts++; throw new Error('must not dispatch'); };
  try {
    useComposerStore.getState().selectKey(key);
    useComposerStore.getState().setReplyingTo(null);
    await turn();
    assert.equal(conversationRecovery.ready(key), false, 'message cache alone is insufficient');
    const mentions = [{ uid: 'u', pos: 0, len: 4 }];
    const payload = { clientBatchId: crypto.randomUUID(), items: [{ stagingId: crypto.randomUUID(), clientRequestId: crypto.randomUUID(), caption: '' }] };
    resolveDraft({ version: 2, text: '@Old ', mentions, replyingTo: { id: 'old-reply' } as Message, attachments: [], outbox: [{ attachments: [], batch: { payload } }] });
    await ensureConversationRecovered(key);
    assert.deepEqual(useComposerStore.getState().drafts[key].mentions, mentions);
    assert.equal(useComposerStore.getState().drafts[key].replyingTo, null, 'explicit edited field wins');
    submitMessage(key, 'new'); await turn();
    assert.equal(posts, 0); assert.equal(useComposerStore.getState().drafts[key].outbox?.[0].batch.payload.clientBatchId, payload.clientBatchId);
  } finally { clientDb.getDraft = original.draft; clientDb.getRecoveryMessages = original.messages; clientDb.saveComposer = original.save; globalThis.fetch = original.fetch; chatSession.setUser(''); }
});
test('recovery read error fails closed and preserves editable unsaved draft', async () => {
  const original = { draft: clientDb.getDraft, messages: clientDb.getRecoveryMessages, save: clientDb.saveComposer };
  chatSession.setUser('failed-recovery');
  const key = conversationKey('failed-recovery', 'a', 'direct:c');
  let writes = 0;
  clientDb.getDraft = async () => { throw new Error('IDB unavailable'); };
  clientDb.getRecoveryMessages = async () => [];
  clientDb.saveComposer = async () => { writes++; return true; };
  try {
    useComposerStore.getState().selectKey(key);
    useComposerStore.getState().setText('keep typing');
    await ensureConversationRecovered(key);
    assert.equal(conversationRecovery.state(key), 'error');
    assert.equal(useComposerStore.getState().drafts[key].text, 'keep typing');
    assert.equal(writes, 0);
  } finally { clientDb.getDraft = original.draft; clientDb.getRecoveryMessages = original.messages; clientDb.saveComposer = original.save; chatSession.setUser(''); }
});
test('confirmed pre-reservation validation unlocks only new intent; ambiguous failure retains immutable batch', async () => {
  const original = { save: clientDb.saveComposer, fetch: globalThis.fetch };
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'token' } });
  chatSession.setUser('validation');
  const key = conversationKey('validation', 'a', 'group:g');
  conversationRecovery.set(key, 'ready');
  clientDb.saveComposer = async () => true;
  let rejection = true;
  globalThis.fetch = async (url, init) => {
    const body = String(url).includes('capabilities') ? { batch: true, maxBatchItems: 10, attachmentContext: true }
      : init?.method === 'POST' ? { code: rejection ? 'BATCH_VALIDATION_REJECTED' : 'COMPOSER_UNAVAILABLE', error: 'rejected' }
      : { staging: { status: 'ready', expiresAt: new Date(Date.now() + 60000).toISOString() } };
    return new Response(JSON.stringify(body), { status: init?.method === 'POST' ? rejection ? 400 : 503 : 200 });
  };
  try {
    useComposerStore.getState().selectKey(key);
    useComposerStore.getState().updateDraft(key, { text: '@Old ', mentions: [{ uid: 'u', pos: 0, len: 4 }], attachments: [{ id: 'a', name: 'a', size: 1, type: 'image/png', lastModified: 0, caption: '', upload: 'ready', stage: { id: crypto.randomUUID(), status: 'ready', expiresAt: '', size: 1, fileName: 'a', mimeType: 'image/png' } }] });
    await sendComposerBatch(key);
    assert.equal(useComposerStore.getState().drafts[key].batch, undefined);
    assert.equal(useComposerStore.getState().drafts[key].text, '@Old ');
    assert.equal(useChatStore.getState().byConversation[key].messages.length, 0);
    rejection = false;
    await sendComposerBatch(key);
    assert.ok(useComposerStore.getState().drafts[key].batch, 'ambiguous POST must remain immutable');
  } finally { clientDb.saveComposer = original.save; globalThis.fetch = original.fetch; chatSession.setUser(''); if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});
