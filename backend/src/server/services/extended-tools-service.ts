import { createHash } from 'node:crypto';
import type { Knex } from 'knex';
import { SendRequestError, validateRequestId } from './send-request-service.js';
import type { ComposerScope } from './composer-service.js';
import { providerMessageData } from '../../core/message-projection.js';
import { buildStoredMessageId } from '../../core/store/helpers.js';
import { lockConversation, assertConversationClear } from './conversation-send-barrier.js';

const fail = (message: string) => new SendRequestError(400, 'INVALID_ACTION', message);
const providerId = (v: unknown) => {
  if ((typeof v !== 'string' && typeof v !== 'number') || (typeof v === 'number' && !Number.isSafeInteger(v)) || !String(v) || ['0', '-1'].includes(String(v))) throw new Error('Provider identity unconfirmed');
  return String(v);
};
const text = (v: unknown, max = 2000): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw fail('Invalid text field.');
  return v.trim();
};
export function parseAction(body: any) {
  const id = validateRequestId(body?.id);
  let payload: Record<string, unknown>;
  switch (body?.action) {
    case 'sticker':
      if (!Number.isSafeInteger(body.stickerId) || body.stickerId < 1) throw fail('Invalid sticker ID.');
      payload = { stickerId: body.stickerId }; break;
    case 'poll':
      if (!Array.isArray(body.options) || body.options.length < 2 || body.options.length > 10) throw fail('Use 2–10 options.');
      payload = { question: text(body.question), options: body.options.map((s: unknown) => text(s, 500)) }; break;
    case 'forward': payload = { messageId: text(body.messageId, 255), target: text(body.target, 255) }; break;
    case 'undo': payload = { messageId: text(body.messageId, 255) }; break;
    case 'reminder': case 'editReminder':
      if (!Number.isSafeInteger(body.startTime) || body.startTime < 1) throw fail('Invalid reminder time.');
      payload = { title: text(body.title), startTime: body.startTime,
        ...(body.action === 'editReminder' ? { topicId: text(body.topicId, 255) } : {}) }; break;
    case 'contact': payload = { userId: text(body.userId, 100) }; break;
    default: throw fail('Unsupported action.');
  }
  return { id, action: String(body.action), payload };
}
export function toolCapabilities(api: any, conversation: string) {
  const has = (...names: string[]) => names.every(n => typeof api?.[n] === 'function');
  return { sticker: has('getStickers', 'getStickersDetail', 'sendSticker'), poll: conversation.startsWith('group:') && has('createPoll'),
    forward: has('forwardMessage'), undo: has('undo'), reminder: has('createReminder'), editReminder: has('editReminder'),
    contact: has('sendCard'), voice: false, audioFile: true, location: false };
}
export interface ActionStore {
  reserve(scope: ComposerScope, input: ReturnType<typeof parseAction>, hash: string): Promise<{ fresh: boolean; row: any }>;
  get(scope: ComposerScope, id: string): Promise<any>;
  settle(scope: ComposerScope, id: string, status: string, result: unknown): Promise<void>;
}
export class DbActionStore implements ActionStore {
  constructor(private db: Knex) {}
  async reserve(scope: ComposerScope, input: ReturnType<typeof parseAction>, hash: string) {
    return this.db.transaction(async trx => {
    await lockConversation(trx, scope.account_id, scope.conversation_id);
    const existing = await trx('composer_actions').where({ account_id: scope.account_id, id: input.id }).first();
    if (!existing) await assertConversationClear(trx, scope.account_id, scope.conversation_id);
    const inserted = await trx('composer_actions').insert({ ...scope, id: input.id, action: input.action,
      payload_hash: hash, status: 'unknown' }).onConflict(['account_id', 'id']).ignore().returning('id');
    const row = await trx('composer_actions').where(scope).where({ id: input.id }).first();
    if (!row) throw new SendRequestError(404, 'NOT_FOUND', 'Action not found.');
    if (row.payload_hash === 'sealed') return { fresh: false, row };
    if (row.payload_hash !== hash) throw new SendRequestError(409, 'REQUEST_CONFLICT', 'Action ID belongs to another payload.');
    return { fresh: inserted.length > 0, row };
    });
  }
  /** Atomically seal an absent identity; a delayed POST cannot reserve/dispatch after this proof. */
  async recover(scope: ComposerScope, id: string) {
    await this.db.transaction(async trx => {
      await lockConversation(trx, scope.account_id, scope.conversation_id);
      await trx('composer_actions').insert({ ...scope, id, action: 'recovery', payload_hash: 'sealed', status: 'rejected', result: JSON.stringify({ dispatched: false }) })
        .onConflict(['account_id', 'id']).ignore();
    });
    return this.get(scope, id);
  }
  async get(scope: ComposerScope, id: string) {
    const row = await this.db('composer_actions').where(scope).where({ id }).first();
    if (!row) throw new SendRequestError(404, 'NOT_FOUND', 'Action not found.');
    return row;
  }
  async settle(scope: ComposerScope, id: string, status: string, result: unknown) {
    await this.db('composer_actions').where(scope).where({ id }).update({ status, result: JSON.stringify(result) });
  }
}
export const actionView = (r: any) => ({ id: r.id, action: r.action, status: r.status, result: r.result ?? null, retryable: false });
export class ExtendedToolsService {
  private active = 0;
  constructor(private store: ActionStore) {}
  async execute(scope: ComposerScope, input: ReturnType<typeof parseAction>, dispatch: () => Promise<any>, prepare?: () => Promise<() => Promise<any>>) {
    const hash = createHash('sha256').update(JSON.stringify({ action: input.action, payload: input.payload })).digest('hex');
    if (this.active >= 4) {
      // Read-only replay remains available even while every mutation permit is held.
      try { const row = await this.store.get(scope, input.id); if (row.payload_hash !== hash && row.payload_hash !== 'sealed') throw new SendRequestError(409, 'REQUEST_CONFLICT', 'Payload conflict.'); return actionView(row); }
      catch (e) { if (!(e instanceof SendRequestError && e.status === 404)) throw e; }
      throw Object.assign(new SendRequestError(429, 'TOOL_CAPACITY', 'Capacity reached; this invocation did not reserve or dispatch.'), { reserved: false, dispatched: false });
    }
    // Acquire synchronously BEFORE the first await. Held until provider settlement, not HTTP timeout.
    this.active++;
    let reservation: Awaited<ReturnType<ActionStore['reserve']>>;
    try { reservation = await this.store.reserve(scope, input, hash); }
    catch (e) { this.active--; throw e; }
    const { fresh, row } = reservation;
    if (!fresh) { this.active--; return actionView(row); }
    // Reserve UNKNOWN before any provider mutation. Crash/timeout/rejection never automatically replays.
    const work = (async () => {
      try {
        if (prepare) {
          try { dispatch = await prepare(); }
          catch { await this.store.settle(scope, input.id, 'rejected', { dispatched: false }); return; }
        }
        const result = await dispatch(); await this.store.settle(scope, input.id, 'accepted', result);
      }
      catch { /* SDK exceptions can occur after acceptance. Keep the durable unknown identity. */ }
      finally { this.active--; }
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([work, new Promise<void>(resolve => { timer = setTimeout(resolve, 15_000); })]);
    if (timer) clearTimeout(timer);
    return actionView(await this.store.get(scope, input.id));
  }
}
export async function prepareAction(db: Knex, scope: ComposerScope, input: ReturnType<typeof parseAction>, api: any,
  authorizeTarget: (target: string) => Promise<void>): Promise<() => Promise<any>> {
  const p = input.payload as any;
  const thread = scope.conversation_id.slice(scope.conversation_id.indexOf(':') + 1);
  const type = scope.conversation_id.startsWith('group:') ? 1 : 0;
  if (!(toolCapabilities(api, scope.conversation_id) as any)[input.action]) throw new SendRequestError(409, 'UNSUPPORTED', 'Tool unavailable in this session.');
  switch (input.action) {
    case 'sticker': {
      const details = await api.getStickersDetail(p.stickerId);
      const sticker = details.find((s: any) => s.id === p.stickerId);
      if (!sticker) throw fail('Sticker not found.');
      return async () => ({ msgId: providerId((await api.sendSticker(sticker, thread, type)).msgId) });
    }
    case 'poll': return async () => ({ pollId: providerId((await api.createPoll(p, thread)).poll_id) });
    case 'contact': return async () => ({ msgId: providerId((await api.sendCard(p, thread, type)).msgId) });
    case 'reminder': case 'editReminder': return async () => {
      const r = await api[input.action === 'reminder' ? 'createReminder' : 'editReminder'](p, thread, type);
      return { topicId: providerId(r.reminderId ?? r.id) };
    };
    case 'forward': case 'undo': {
      const storedId = p.messageId.startsWith(`${scope.account_id}::`) ? p.messageId : buildStoredMessageId(scope.account_id, p.messageId);
      const message = await db('messages').where({ account_id: scope.account_id, conversation_id: scope.conversation_id, id: storedId }).first();
      if (!message) throw new SendRequestError(404, 'NOT_FOUND', 'Source message not found.');
      if (input.action === 'forward') {
        await authorizeTarget(p.target);
        if (message.kind !== 'text' || !message.text) throw fail('Only text forwarding is supported.');
        return async () => {
          const r = await api.forwardMessage({ message: message.text, threadIds: [p.target.split(':')[1]] }, p.target.startsWith('group:') ? 1 : 0);
          if (r.failed?.length || !r.success?.length) throw new Error('Unconfirmed forward');
          return { msgIds: r.success.map((s: any) => providerId(s.msgId)) };
        };
      }
      const raw = providerMessageData(message.raw_message_json);
      if (message.direction !== 'outgoing' || !message.provider_message_id || !raw.cliMsgId) throw fail('Recall requires your own message and its provider/client IDs.');
      return async () => ({ providerStatus: (await api.undo({ msgId: message.provider_message_id, cliMsgId: raw.cliMsgId }, thread, type)).status });
    }
    default: throw fail('Unsupported action.');
  }
}
