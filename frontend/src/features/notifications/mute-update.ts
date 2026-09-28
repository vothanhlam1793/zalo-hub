import type { ConversationSummary } from '@/types';
import { chatSession } from '@/features/chat/model/chat-session';

type MuteFields = Pick<ConversationSummary, 'isMuted' | 'muteUntil'>;

/** Serialize HTTP writes; uncorrelated WS echoes are observations, not intent IDs. */
export function createMuteUpdateController() {
  type Entry = {
    confirmed: MuteFields; pending: number; version: number; queue: Promise<void>;
    echoes: Array<{ isMuted: boolean }>;
  };
  const entries = new Map<string, Entry>();
  let epoch = '';
  function keyFor(accountId: string, conversationId: string) {
    const session = chatSession.capture();
    const next = JSON.stringify([session.userId, session.generation, session.token]);
    if (epoch !== next) { entries.clear(); epoch = next; }
    return JSON.stringify([accountId, conversationId]);
  }
  return {
    remote(accountId: string, conversationId: string, fields: MuteFields): boolean {
      const entry = entries.get(keyFor(accountId, conversationId));
      if (!entry) return true;
      // HTTP and WS can arrive in either order. Consume each expected echo once,
      // including an A echo arriving after the B HTTP response has completed.
      const index = entry.echoes.findIndex((echo) => echo.isMuted === fields.isMuted);
      if (index !== -1) { entry.echoes.splice(index, 1); return false; }
      if (entry.pending) return false;
      entry.confirmed = fields;
      return true;
    },
    write(options: {
      accountId: string; conversationId: string; action: 'mute' | 'unmute'; previous: MuteFields;
      request: () => Promise<MuteFields>; apply: (fields: MuteFields) => void;
      onError: (error: unknown) => void;
    }): Promise<void> {
      const key = keyFor(options.accountId, options.conversationId);
      const session = chatSession.capture();
      if (!chatSession.valid(session)) return Promise.resolve();
      let entry = entries.get(key);
      if (!entry) {
        entry = { confirmed: options.previous, pending: 0, version: 0, queue: Promise.resolve(), echoes: [] };
        entries.set(key, entry);
      }
      // A refreshed summary may have updated the store since the last operation.
      if (!entry.pending) entry.confirmed = options.previous;
      const state = entry;
      const version = ++state.version;
      state.pending++;
      options.apply({ isMuted: options.action === 'mute', muteUntil: options.action === 'mute' ? -1 : null });
      const current = () => chatSession.valid(session) && entries.get(key) === state;
      const work = state.queue.then(async () => {
        if (!current()) return;
        const echo = { isMuted: options.action === 'mute' };
        state.echoes.push(echo);
        // Bounded best-effort echo tracking: the WS protocol has no operation ID.
        if (state.echoes.length > 32) state.echoes.shift();
        try {
          const result = await options.request();
          if (!current()) return;
          state.confirmed = { isMuted: result.isMuted, muteUntil: result.muteUntil };
          if (state.version === version) options.apply(state.confirmed);
        } catch (error) {
          if (!current()) return;
          const index = state.echoes.indexOf(echo);
          if (index !== -1) state.echoes.splice(index, 1);
          if (state.version === version) options.apply(state.confirmed);
          // Even an earlier failed write must be reported, never silently dropped.
          options.onError(error);
        } finally {
          state.pending--;
        }
      });
      state.queue = work.catch(() => {});
      return work;
    },
  };
}

export function patchConversationMute(conversations: ConversationSummary[], id: string,
  fields: Pick<ConversationSummary, 'isMuted' | 'muteUntil'>): ConversationSummary[] {
  return conversations.map((conversation) => conversation.id === id
    ? { ...conversation, isMuted: fields.isMuted, muteUntil: fields.muteUntil } : conversation);
}
