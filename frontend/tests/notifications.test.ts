import assert from 'node:assert/strict';
import { test } from 'node:test';
import { notificationService as service, DEFAULT_USER_SETTINGS } from '../src/features/notifications/notification-service';
import { chatSession } from '../src/features/chat/model/chat-session';
import { api } from '../src/api';
import type { WsConversationNotificationPayload } from '../src/features/realtime/useWebSocket';
import { createMuteUpdateController, patchConversationMute } from '../src/features/notifications/mute-update';
import type { ConversationSummary } from '../src/types';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
} });
function login(id = 'alice') {
  chatSession.setUser('');
  storage.set('auth_token', `token-${id}`);
  chatSession.setUser(id);
  service.updateSettings(DEFAULT_USER_SETTINGS, false);
}
const event = (patch: Partial<WsConversationNotificationPayload> = {}): WsConversationNotificationPayload => ({
  type: 'conversation_notification', accountId: 'A', conversationId: 'direct:1', messageId: 'm1',
  conversationType: 'direct', kind: 'voice', text: '[voice]', senderName: 'Private sender',
  isMuted: false, muteUntil: null, ...patch,
});
const context = { activeAccountId: 'A', activeConversationId: 'other' };
const pause = (ms = 450) => new Promise((resolve) => setTimeout(resolve, ms));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { resolve, promise };
}

test('notification policy: qualified dedup, focus, mute, groups, canonical preview, meeting mode', (t) => {
  login();
  const desktop: string[][] = [];
  const tabs: string[] = [];
  let chimes = 0;
  t.mock.method(service, 'isFocused', () => true);
  t.mock.method(service, 'playChime', () => { if (service.getSettings().soundEnabled) chimes++; });
  t.mock.method(service, 'showDesktopNotification', (title: string, body: string) => {
    if (service.getSettings().desktopNotification) desktop.push([title, body]);
  });
  t.mock.method(service, 'startTabFlashing', (text: string) => tabs.push(text));
  service.notifyMessage(event(), context);
  service.notifyMessage(event(), context);
  assert.equal(chimes, 1);
  assert.equal(desktop[0][1], 'Tin nhắn thoại');
  service.notifyMessage(event({ accountId: 'B' }), { ...context, activeConversationId: 'direct:1' });
  service.notifyMessage(event({ conversationId: 'direct:2' }), context);
  assert.equal(chimes, 3, 'same message id in another account/conversation remains distinct');
  service.notifyMessage(event({ messageId: 'focused' }), { ...context, activeConversationId: 'direct:1' });
  service.notifyMessage(event({ messageId: 'muted', isMuted: true }), context);
  service.notifyMessage(event({ messageId: 'optimistic-mute' }), { ...context, conversation: { isMuted: true } });
  service.updateSettings({ notifyGroupMessages: false });
  service.notifyMessage(event({ messageId: 'group', conversationType: 'group' }), context);
  service.notifyMessage(event({ messageId: 'reaction', kind: 'reaction' }), context);
  assert.equal(chimes, 3);
  service.updateSettings({ showMessagePreview: false });
  service.notifyMessage(event({ messageId: 'hidden', text: 'secret body' }), context);
  assert.deepEqual(desktop.at(-1), ['ZaloHub', 'Tin nhắn mới']);
  assert.equal(tabs.at(-1), 'Tin nhắn mới');
  service.updateSettings({ soundEnabled: false, desktopNotification: false });
  service.notifyMessage(event({ messageId: 'meeting' }), context);
  assert.equal(chimes, 4);
  assert.equal(desktop.length, 4);
  login('bob');
  service.notifyMessage(event(), context);
  assert.equal(chimes, 5, 'new session has its own dedup scope');
  chatSession.setUser('');
});

test('settings loads cannot overwrite edits, newer loads, or replacement sessions', async (t) => {
  login();
  const requests: ReturnType<typeof deferred<any>>[] = [];
  t.mock.method(api, 'getUserSettings', () => {
    const request = deferred<any>(); requests.push(request); return request.promise;
  });
  const a = service.loadSettings(); const b = service.loadSettings();
  requests[1].resolve({ ok: true, settings: { ...DEFAULT_USER_SETTINGS, soundVolume: 22 } });
  await b;
  requests[0].resolve({ ok: true, settings: DEFAULT_USER_SETTINGS }); await a;
  assert.equal(service.getSettings().soundVolume, 22);
  const c = service.loadSettings();
  service.updateSettings({ soundVolume: 33 });
  requests[2].resolve({ ok: true, settings: DEFAULT_USER_SETTINGS }); await c;
  assert.equal(service.getSettings().soundVolume, 33);
  const d = service.loadSettings(); login('bob');
  requests[3].resolve({ ok: true, settings: { ...DEFAULT_USER_SETTINGS, soundVolume: 1 } }); await d;
  assert.equal(service.getSettings().soundVolume, 80);
  chatSession.setUser('');
});

test('settings saves debounce, serialize and cancel pending work across logout', async (t) => {
  login();
  const writes: Array<{ value: any; done: ReturnType<typeof deferred<any>> }> = [];
  t.mock.method(api, 'updateUserSettings', (value: any) => {
    const done = deferred<any>(); writes.push({ value, done }); return done.promise;
  });
  service.saveSettings({ soundVolume: 10 });
  service.saveSettings({ soundVolume: 20 });
  await pause();
  assert.equal(writes.length, 1); assert.equal(writes[0].value.soundVolume, 20);
  service.saveSettings({ soundVolume: 30 }); await pause();
  assert.equal(writes.length, 1, 'new write waits for old write');
  writes[0].done.resolve({ ok: true }); await pause(10);
  assert.equal(writes.length, 2); assert.equal(writes[1].value.soundVolume, 30);
  service.saveSettings({ soundVolume: 40 });
  login('bob');
  writes[1].done.resolve({ ok: true }); await pause();
  assert.equal(writes.length, 2, 'logout cancels debounce and old response cannot apply');
  assert.equal(service.getSettings().soundVolume, 80);
  chatSession.setUser('');
});

test('mute rollback changes only mute fields', () => {
  login();
  const conversations = [{ id: 'direct:1', isMuted: true, muteUntil: -1, lastMessageText: 'new message', unreadCount: 7, notes: 'new note' },
    { id: 'direct:2', unreadCount: 2 }] as ConversationSummary[];
  const patched = patchConversationMute(conversations, 'direct:1', { isMuted: false, muteUntil: null });
  assert.deepEqual(patched[0], { ...conversations[0], isMuted: false, muteUntil: null });
  assert.equal(patched[1], conversations[1]);
  chatSession.setUser('');
});

for (const failB of [false, true]) test(`serialized mute/unmute keeps B intent across A echo; B ${failB ? 'fails visibly and restores A' : 'succeeds'}`, async () => {
  login();
  const controller = createMuteUpdateController();
  const a = deferred<any>(); const b = deferred<any>();
  let fields = { isMuted: false, muteUntil: null as number | null | undefined };
  const calls: string[] = []; const errors: unknown[] = [];
  const write = (action: 'mute' | 'unmute', response: typeof a) => controller.write({
    accountId: 'A', conversationId: 'direct:1', action, previous: fields,
    request: () => { calls.push(action); return response.promise.then((value) => { if (value instanceof Error) throw value; return value; }); },
    apply: (value) => { fields = { isMuted: !!value.isMuted, muteUntil: value.muteUntil }; },
    onError: (error) => errors.push(error),
  });
  const first = write('mute', a); await Promise.resolve();
  const second = write('unmute', b);
  assert.deepEqual(calls, ['mute']);
  assert.equal(fields.isMuted, false, 'B immediately wins optimistically');
  assert.equal(controller.remote('A', 'direct:1', { isMuted: true, muteUntil: null }), false);
  assert.equal(fields.isMuted, false);
  a.resolve({ isMuted: true, muteUntil: null }); await first; await Promise.resolve();
  assert.deepEqual(calls, ['mute', 'unmute']);
  assert.equal(fields.isMuted, false, 'A HTTP must not replace B optimism');
  b.resolve(failB ? new Error('B failed') : { isMuted: false, muteUntil: null }); await second;
  assert.equal(fields.isMuted, failB);
  assert.equal(errors.length, failB ? 1 : 0);
  if (!failB) assert.equal(controller.remote('A', 'direct:1', { isMuted: false, muteUntil: null }), false);
  chatSession.setUser('');
});

test('A WS echo delayed until after B HTTP cannot undo B; unrelated account events still apply', async () => {
  login();
  const controller = createMuteUpdateController();
  let muted = false;
  for (const action of ['mute', 'unmute'] as const) await controller.write({
    accountId: 'A', conversationId: 'direct:1', action, previous: { isMuted: muted },
    request: async () => ({ isMuted: action === 'mute', muteUntil: null }),
    apply: (fields) => { muted = !!fields.isMuted; }, onError: assert.fail,
  });
  assert.equal(controller.remote('A', 'direct:1', { isMuted: true, muteUntil: null }), false);
  assert.equal(muted, false);
  assert.equal(controller.remote('B', 'direct:1', { isMuted: true }), true);
  assert.equal(controller.remote('A', 'direct:1', { isMuted: false, muteUntil: null }), false);
  assert.equal(controller.remote('A', 'direct:1', { isMuted: true, muteUntil: null }), true);
  chatSession.setUser('');
});

test('logout cancels queued B and suppresses A results/errors, including same-user login', async () => {
  for (const fail of [false, true]) {
    login();
    const controller = createMuteUpdateController(); const a = deferred<any>();
    let calls = 0; let applications = 0; let errors = 0;
    const options = { accountId: 'A', conversationId: 'direct:1', previous: { isMuted: false },
      request: () => { calls++; return a.promise.then((result) => { if (fail) throw new Error('old failure'); return result; }); },
      apply: () => { applications++; }, onError: () => { errors++; },
    };
    const first = controller.write({ ...options, action: 'mute' }); await Promise.resolve();
    const second = controller.write({ ...options, action: 'unmute' });
    login();
    a.resolve({ isMuted: true }); await first; await second;
    assert.equal(calls, 1); assert.equal(applications, 2); assert.equal(errors, 0);
    assert.equal(controller.remote('A', 'direct:1', { isMuted: true }), true, 'new session clears old echo state');
    chatSession.setUser('');
  }
});

test('failed A is reported without dropping queued B or overwriting its optimism', async () => {
  login();
  const controller = createMuteUpdateController(); const a = deferred<any>();
  let muted = false; const errors: unknown[] = [];
  const common = { accountId: 'A', conversationId: 'direct:1', previous: { isMuted: false },
    apply: (value: { isMuted?: boolean }) => { muted = !!value.isMuted; }, onError: (error: unknown) => errors.push(error) };
  const first = controller.write({ ...common, action: 'mute', request: async () => { await a.promise; throw new Error('A failed'); } });
  const second = controller.write({ ...common, action: 'unmute', request: async () => ({ isMuted: false, muteUntil: null }) });
  a.resolve(null); await first; await second;
  assert.equal(errors.length, 1); assert.equal(muted, false);
  chatSession.setUser('');
});

test('when A and B both fail rollback uses confirmed state, not A optimistic state', async () => {
  login();
  const controller = createMuteUpdateController();
  let muted = false; let errors = 0;
  const common = { accountId: 'A', conversationId: 'direct:1',
    apply: (value: { isMuted?: boolean }) => { muted = !!value.isMuted; },
    request: async () => { throw new Error('write failed'); }, onError: () => { errors++; } };
  const a = controller.write({ ...common, previous: { isMuted: false }, action: 'mute' });
  const b = controller.write({ ...common, previous: { isMuted: true }, action: 'unmute' });
  await a; await b;
  assert.equal(muted, false); assert.equal(errors, 2);
  chatSession.setUser('');
});
