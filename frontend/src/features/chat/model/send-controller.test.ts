import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatSession, conversationKey } from './chat-session';
import { useChatStore } from '../../../stores/chat-store';
import { useComposerStore } from '../../../stores/composer-store';
import { submitMessage, retryMessage, querySendStatus } from './send-controller';

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
function setup() {
  chatSession.setUser('');
  chatSession.setUser('tester');
  const key = conversationKey('tester', 'account-a', 'direct:customer');
  useChatStore.getState().selectKey(key);
  useComposerStore.getState().selectKey(key);
  return key;
}
function envelope(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function localStorageStub() {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'test-token' } });
  return () => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage'); };
}

test('pending is committed before transport; typing and switching cannot redirect the late receipt', async () => {
  const restoreStorage = localStorageStub();
  const originalFetch = globalThis.fetch;
  const key = setup();
  let release!: (response: Response) => void;
  let body: { clientRequestId: string; conversationId: string };
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body));
    assert.equal(useChatStore.getState().byConversation[key].messages.length, 1, 'optimistic row exists before POST');
    return new Promise<Response>((resolve) => { release = resolve; });
  };
  try {
    useComposerStore.getState().setText('first draft');
    const sent = submitMessage(key, 'first draft')!;
    assert.equal(useComposerStore.getState().text, '');
    useComposerStore.getState().setText('new draft');
    const other = conversationKey('tester', 'account-b', 'direct:customer');
    useChatStore.getState().selectKey(other);
    useComposerStore.getState().selectKey(other);
    useComposerStore.getState().setText('other account draft');
    release(envelope({ method: 'sendMessage', result: {}, receipt: {
      clientRequestId: body!.clientRequestId, accountId: 'account-a', conversationId: body!.conversationId,
      status: 'sent', messages: [], providerMessageIds: [],
    } }));
    await turn();
    assert.equal(useChatStore.getState().messages.length, 0);
    assert.equal(useComposerStore.getState().text, 'other account draft');
    assert.equal(useComposerStore.getState().drafts[key].text, 'new draft');
    assert.equal(useChatStore.getState().byConversation[key].messages[0].localId, sent.localId);
    assert.equal(useChatStore.getState().byConversation[key].messages[0].delivery, 'sent');
  } finally { chatSession.setUser(''); globalThis.fetch = originalFetch; restoreStorage(); }
});

test('ambiguous transport plus 404 lookup marks first message failed and unblocks send queue', async () => {
  const restoreStorage = localStorageStub();
  const originalFetch = globalThis.fetch;
  const key = setup();
  let posts = 0;
  let gets = 0;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === 'POST') { posts++; throw new TypeError('Connection lost after dispatch'); }
    gets++; return envelope({ error: 'Not found' }, 404);
  };
  try {
    const first = submitMessage(key, 'same')!;
    submitMessage(key, 'same');
    await turn();
    const unresolved = useChatStore.getState().byConversation[key].messages.find((m) => m.localId === first.localId)!;
    assert.equal(unresolved.delivery, 'unknown');
    await querySendStatus(key, first.clientRequestId!);
    await turn();
    assert.equal(gets, 1);
    const resolved = useChatStore.getState().byConversation[key].messages.find((m) => m.localId === first.localId)!;
    assert.equal(resolved.delivery, 'failed');
    assert.equal(resolved.retryable, true);
    // Queue unblocked, so the second message was attempted
    assert.equal(posts, 2);
  } finally { chatSession.setUser(''); globalThis.fetch = originalFetch; restoreStorage(); }
});

test('explicit retry of a definite failure reuses request ID and payload with retry:true', async () => {
  const restoreStorage = localStorageStub();
  const originalFetch = globalThis.fetch;
  const key = setup();
  const requests: Array<{ clientRequestId: string; text: string; conversationId: string; retry?: boolean }> = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)); requests.push(body);
    return envelope({ error: 'Rejected', receipt: {
      clientRequestId: body.clientRequestId, accountId: 'account-a', conversationId: body.conversationId,
      status: requests.length === 1 ? 'failed' : 'sent', messages: [], providerMessageIds: [],
      ...(requests.length === 1 ? { error: { code: 'REJECTED', message: 'Rejected', retryable: true } } : {}),
    } }, requests.length === 1 ? 503 : 200);
  };
  try {
    submitMessage(key, 'original'); await turn();
    const failed = useChatStore.getState().byConversation[key].messages[0];
    assert.equal(failed.delivery, 'failed');
    retryMessage(key, failed); await turn();
    assert.equal(requests.length, 2);
    assert.equal(requests[0].clientRequestId, requests[1].clientRequestId);
    assert.equal(requests[1].text, 'original');
    assert.equal(requests[1].retry, true);
    assert.equal(useChatStore.getState().byConversation[key].messages[0].delivery, 'sent');
  } finally { chatSession.setUser(''); globalThis.fetch = originalFetch; restoreStorage(); }
});

test('logout invalidates in-flight acknowledgements and clears drafts/messages before response', async () => {
  const restoreStorage = localStorageStub();
  const originalFetch = globalThis.fetch;
  const key = setup();
  let release!: (response: Response) => void;
  globalThis.fetch = async () => new Promise<Response>((resolve) => { release = resolve; });
  try {
    const sent = submitMessage(key, 'secret')!;
    submitMessage(key, 'unsent');
    chatSession.setUser('different-user');
    release(envelope({ receipt: { accountId: 'account-a', conversationId: 'direct:customer',
      clientRequestId: sent.clientRequestId, status: 'sent', messages: [], providerMessageIds: [],
    } }));
    await turn();
    assert.deepEqual(useChatStore.getState().byConversation, {});
    assert.deepEqual(useComposerStore.getState().drafts, {});
  } finally { chatSession.setUser(''); globalThis.fetch = originalFetch; restoreStorage(); }
});

test('store hydration merges without replacing newer events or resurrecting cancelled local rows', () => {
  const key = setup();
  try {
    const old = { id: 'pending-old', localId: 'pending-old', clientRequestId: 'old',
      conversationId: 'direct:customer', threadId: 'customer', conversationType: 'direct' as const,
      text: 'old', kind: 'text' as const, attachments: [], isSelf: true, direction: 'outgoing' as const,
      timestamp: '2026-09-22T10:00:00Z', delivery: 'queued' as const,
    };
    useChatStore.getState().mergeForKey(key, [old]);
    useChatStore.getState().removeMessage(key, old.localId);
    useChatStore.getState().mergeForKey(key, [old], true);
    assert.equal(useChatStore.getState().messages.length, 0);
    useComposerStore.getState().setText('account A draft');
    const otherKey = conversationKey('tester', 'account-b', 'direct:customer');
    useComposerStore.getState().selectKey(otherKey);
    assert.equal(useComposerStore.getState().text, '');
    useComposerStore.getState().setText('account B draft');
    useComposerStore.getState().selectKey(key);
    assert.equal(useComposerStore.getState().text, 'account A draft');
  } finally { chatSession.setUser(''); }
});
