import test from 'node:test';
import assert from 'node:assert/strict';
import { GoldSender } from '../src/core/runtime/sender.js';
import { GoldRuntime } from '../src/core/runtime/index.js';
import type { SharedState } from '../src/core/runtime/types.js';
import type { GoldConversationMessage } from '../src/core/types.js';
import type { SendRequestRow } from '../src/core/store/send-request-repo.js';
import { attachmentRepairPatch, repairMediaUrl } from '../src/core/store/send-message-repair.js';
import { SendRequestService } from '../src/server/services/send-request-service.js';
import { deferred, execution, FakeSendRepo, input, logger, requestId } from './send-request-fixtures.js';

// Uses the actual runtime append/dedup logic; only DB/media/provider are controlled fakes.
for (const captionFile of [false, true]) test(`status GET + POST replay during delayed ${captionFile ? 'caption/file' : 'image'} media save cannot preempt normal append`, async () => {
  const history = new Map<string, GoldConversationMessage>();
  const summaries = new Set<string>(); const published: string[] = [];
  const mediaEntered = deferred<void>(); const releaseMedia = deferred<void>();
  let providerCalls = 0; let repairCalls = 0;
  class Repo extends FakeSendRepo {
    async repairLocal(row: SendRequestRow) {
      repairCalls++;
      // Deliberately reproduce the original insertion behavior. Coordination MUST keep
      // this away from the intermediate accepted snapshot, not rely on this fake's mercy.
      for (const m of row.message_refs_json) if (!history.has(m.providerMessageId!)) history.set(m.providerMessageId!, structuredClone(m));
    }
  }
  const repo = new Repo(); const service = new SendRequestService(repo, logger);
  const state = { boundAccountId: input.accountId, listenerState: {}, logger,
    conversations: new Map(), seenMessageKeys: new Set(), conversationListeners: new Set([(m: GoldConversationMessage) => published.push(m.id)]),
    store: {
      hasMessageByProviderIdForAccount: async (_a: string, _c: string, id: string) => history.has(id),
      replaceConversationMessagesByAccount: async (_a: string, c: string, messages: GoldConversationMessage[]) => {
        for (const m of messages) history.set(m.providerMessageId!, structuredClone(m)); summaries.add(c);
      },
    },
    session: { api: { sendMessage: async () => { providerCalls++; return { message: captionFile ? { msgId: 103 } : null, attachment: [{ msgId: 104 }] }; } } },
    mediaStore: { saveBuffer: async () => { mediaEntered.resolve(); await releaseMedia.promise; return { publicUrl: '/media/saved', localPath: '/private/saved' }; } },
  } as unknown as SharedState;
  const runtime = Object.assign(Object.create(GoldRuntime.prototype), { state });
  const sender = new GoldSender(state);
  sender.init({ loginWithStoredCredential: async () => state.session,
    resolveConversationTarget: () => ({ type: 'direct', threadId: '123' }), getActiveAccountId: () => input.accountId,
    appendConversationMessage: (m) => runtime.appendConversationMessage(m),
  });
  const payload = { ...input, attachment: { fileBuffer: Buffer.from('fake-provider-only'), fileName: captionFile ? 'a.txt' : 'a.png', mimeType: captionFile ? 'text/plain' : 'image/png' } };
  const dispatch = (i: Parameters<Parameters<typeof service.send>[1]>[0], life: Parameters<Parameters<typeof service.send>[1]>[1]) =>
    sender.sendAttachment(i.conversationId, { ...i.attachment!, caption: i.text }, life);
  const pending = service.send(payload, dispatch);
  await mediaEntered.promise;
  assert.equal((await repo.get(input.accountId, requestId))?.provider_receipt_json.localPersistence, 'pending');
  assert.equal((await service.get(input.accountId, requestId, input.systemUserId, false)).status, 'sent');
  assert.equal((await service.send(payload, dispatch)).status, 200);
  // A separate service instance is also blocked by the durable phase marker.
  await new SendRequestService(repo, logger).get(input.accountId, requestId, input.systemUserId, false);
  assert.equal(repairCalls, 0); assert.equal(history.has('104'), false);
  releaseMedia.resolve();
  assert.equal((await pending).body.receipt?.status, 'sent');
  assert.equal(providerCalls, 1); assert.equal(history.size, captionFile ? 2 : 1);
  assert.equal(history.get('104')?.attachments[0].url, '/media/saved');
  assert.equal(summaries.has(input.conversationId), true);
  assert.equal(published.length, captionFile ? 2 : 1, 'normal append must publish instead of being suppressed by repair');
  assert.equal((await repo.get(input.accountId, requestId))?.provider_receipt_json.localPersistence, 'complete');
});

test('repair marker survives process replacement; startup makes pending acceptance locally repairable only', async () => {
  let repairs = 0;
  class Repo extends FakeSendRepo { async repairLocal() { repairs++; } }
  const repo = new Repo(); const accepted = execution();
  const row: SendRequestRow = { account_id: input.accountId, client_request_id: requestId, system_user_id: input.systemUserId,
    conversation_id: input.conversationId, payload_hash: 'hash', attempt_count: 1, status: 'sent', retryable: false, error_code: null,
    message_refs_json: accepted.messages, provider_receipt_json: { providerMessageIds: accepted.providerMessageIds, localPersistence: 'pending' } };
  await repo.claim(row);
  const service = new SendRequestService(repo, logger);
  await service.get(input.accountId, requestId, input.systemUserId, false); assert.equal(repairs, 0);
  assert.equal(await repo.recoverAbandoned(), 1);
  const receipt = await service.get(input.accountId, requestId, input.systemUserId, false);
  assert.equal(receipt.status, 'sent'); assert.equal(receipt.error?.retryable, false); assert.equal(repairs, 1);
});

test('attachment repair fills missing fields, upgrades remote to local, and never downgrades a rich echo', () => {
  const snapshot = { id: 'snapshot', type: 'image' as const, url: '/media/snapshot', thumbnailUrl: '/media/snapshot-thumb',
    fileName: 'snapshot.png', mimeType: 'image/png', size: 12 };
  assert.deepEqual(attachmentRepairPatch({ id: 'incomplete', url: null }, snapshot), {
    file_name: 'snapshot.png', mime_type: 'image/png', size: 12, url: '/media/snapshot', thumbnail_url: '/media/snapshot-thumb',
  });
  const richer = { id: 'echo-id', url: '/media/echo', thumbnail_url: '/media/echo-thumb', source_url: 'https://provider/echo',
    file_name: 'original.png', mime_type: 'image/png', size: 99, width: 1200, height: 800, duration: 0, local_path: '/private/echo' };
  assert.deepEqual(attachmentRepairPatch(richer, snapshot), {});
  const remote = attachmentRepairPatch({ url: 'https://provider/old' }, snapshot);
  assert.equal(remote.url, '/media/snapshot'); assert.equal(remote.source_url, 'https://provider/old');
  assert.equal(repairMediaUrl('/media/echo', 'https://provider/old'), '/media/echo');
});
