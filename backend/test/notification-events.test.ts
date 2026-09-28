import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GoldRuntime } from '../src/core/runtime/index.js';
import type { GoldConversationMessage } from '../src/core/types.js';

test('runtime append explicitly marks new messages, but history append does not', async () => {
  const events: Array<{ id: string; event?: 'new' }> = [];
  const state = {
    boundAccountId: 'A', seenMessageKeys: new Set(), conversations: new Map(),
    conversationListeners: new Set([(message: GoldConversationMessage, event?: 'new') => events.push({ id: message.id, event })]),
    store: {
      hasMessageByProviderIdForAccount: async () => false,
      appendConversationMessageByAccount: async () => {},
    },
  };
  const runtime = Object.assign(Object.create(GoldRuntime.prototype), { state });
  const message = { id: 'live', providerMessageId: 'live', conversationId: 'direct:1', threadId: '1',
    conversationType: 'direct', direction: 'incoming', isSelf: false, kind: 'text', text: 'hello',
    timestamp: '2026-09-27T00:00:00.000Z', attachments: [] } as GoldConversationMessage;
  await runtime.appendConversationMessage(message);
  await runtime.appendConversationMessage(message);
  await runtime.appendConversationMessage({ ...message, id: 'history', providerMessageId: 'history' }, false);
  assert.deepEqual(events, [{ id: 'live', event: 'new' }, { id: 'history', event: undefined }]);
});
