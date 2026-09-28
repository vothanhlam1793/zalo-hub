import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Message } from '@/types';
import { chatSession, conversationKey } from './chat-session';
import { useChatStore } from '@/stores/chat-store';
import { createMessageSnapshot, readMessageSnapshot } from '@/lib/client-db';

const message = (id: string, patch: Partial<Message> = {}): Message => ({ id, conversationId: 'direct:c', threadId: 'c',
  conversationType: 'direct', kind: 'text', text: 'legacy', attachments: [], direction: 'incoming', isSelf: false,
  timestamp: '2026-09-27T00:00:00Z', ...patch });
function setup() {
  chatSession.setUser(''); chatSession.setUser('cache-test');
  return conversationKey('cache-test', 'a', 'direct:c');
}

test('HTTP replaces hydrated legacy kind/text while unrelated and same-row newer WS updates survive', () => {
  const key = setup();
  const store = useChatStore.getState();
  const revision = store.byConversation[key]?.revision || 0;
  store.mergeForKey(key, [message('voice'), message('edited')], true);
  assert.equal(useChatStore.getState().byConversation[key].revision, revision, 'hydration is not a live revision');
  store.mergeForKey(key, [message('edited', { text: 'new WS edit', reactions: [{ emoji: '❤️', count: 2 }] }), message('new-ws')]);
  store.mergeForKey(key, [message('voice', { kind: 'voice', text: '[voice]', presentation: { version: 1, url: '/voice.m4a' } }), message('edited', { text: 'old HTTP edit' })], revision);
  const rows = useChatStore.getState().byConversation[key].messages;
  assert.equal(rows.find(m => m.id === 'voice')?.kind, 'voice');
  assert.equal(rows.find(m => m.id === 'voice')?.presentation?.url, '/voice.m4a');
  assert.equal(rows.find(m => m.id === 'edited')?.text, 'new WS edit');
  assert.equal(rows.find(m => m.id === 'edited')?.reactions?.[0].count, 2);
  assert.ok(rows.some(m => m.id === 'new-ws'));
  store.mergeForKey(key, [message('voice')], true);
  assert.equal(useChatStore.getState().byConversation[key].messages.find(m => m.id === 'voice')?.kind, 'voice', 'late cache cannot downgrade HTTP');
});

test('newer HTTP snapshot wins over earlier in-flight HTTP for the same row only', () => {
  const key = setup(); const store = useChatStore.getState();
  store.mergeForKey(key, [message('one', { text: 'new HTTP' })], 0);
  store.mergeForKey(key, [message('one', { text: 'old HTTP' }), message('two', { kind: 'call' })], 0);
  const rows = useChatStore.getState().byConversation[key].messages;
  assert.equal(rows.find(m => m.id === 'one')?.text, 'new HTTP');
  assert.equal(rows.find(m => m.id === 'two')?.kind, 'call');
});

test('legacy presentation cache drops history only; all unresolved sends survive version and page cap', () => {
  const pending = message('pending-request', { delivery: 'unknown', clientRequestId: 'request', text: 'unsent draft content' });
  const legacy = [pending, ...Array.from({ length: 70 }, (_, i) => message(String(i)))];
  assert.deepEqual(readMessageSnapshot(legacy), [pending]);
  const snapshot = createMessageSnapshot(legacy);
  assert.equal(snapshot.messages.length, 51);
  assert.ok(readMessageSnapshot(snapshot).some(m => m.id === pending.id));
  assert.deepEqual(readMessageSnapshot({ ...snapshot, presentationVersion: 0 }), snapshot.messages.filter(m => m.id === pending.id));
});
