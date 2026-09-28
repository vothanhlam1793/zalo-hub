import test from 'node:test';
import assert from 'node:assert/strict';
import { freezeBatch } from './composer-types';
import { actionRecovery } from './action-recovery';
import { conversationUnresolved } from './conversation-unresolved';
import { useComposerStore } from '../../../stores/composer-store';
test('batch context belongs to first child, retains stable immutable IDs on serialization', () => {
  const attachment: any = { id: 'a', caption: 'caption', stage: { id: 'stage', status: 'ready' } };
  const batch = freezeBatch([attachment, { ...attachment, stage: { id: 'stage2', status: 'ready' } }], '@A hello', [{ pos: 0, len: 2, uid: 'u' }], 'message');
  assert.equal(batch.items[0].quoteMessageId, 'message');
  assert.equal(batch.items[0].mentions?.[0].uid, 'u');
  assert.equal(batch.items[1].quoteMessageId, undefined);
  assert.equal(batch.items[1].mentions, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(batch)), batch);
});
test('shared local tool receipts and archived unknown batches block other composer features; terminal recovery clears only own action', () => {
  const key = JSON.stringify(['u', 'a', 'direct:1']);
  actionRecovery.merge(key, [{ id: 'action', action: 'poll', status: 'unknown' }]);
  assert.equal(conversationUnresolved(key), true);
  actionRecovery.merge(key, [{ id: 'action', action: 'poll', status: 'rejected' }]);
  assert.equal(conversationUnresolved(key), false);
  useComposerStore.setState({ drafts: { [key]: { outbox: [{ batch: { payload: { clientBatchId: 'batch', items: [] }, result: { status: 'unknown', items: [{ status: 'unknown' }] } }, attachments: [] }] } as any } });
  assert.equal(conversationUnresolved(key), true);
  actionRecovery.merge(key, [{ id: 'action', action: 'poll', status: 'accepted' }]);
  assert.equal(conversationUnresolved(key), true, 'accepted tool cannot unlock archived unknown batch');
});
