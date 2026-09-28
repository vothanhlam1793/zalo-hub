import { create } from 'zustand';
import { clientDb } from '../lib/client-db';
import { chatSession } from '../features/chat/model/chat-session';
import type { Message, MessageMention } from '../types';
import { migrateComposer, type DraftAttachment, type StoredComposer } from '../features/chat/model/composer-types';
import { conversationRecovery } from '../features/chat/model/conversation-recovery';
import { useChatStore } from './chat-store';
import { recoverMessage } from '../features/chat/model/message-reconciliation';
import { actionRecovery } from '../features/chat/model/action-recovery';

export interface Draft {
  text: string;
  attachFile: File | null;
  missingFileName?: string;
  replyingTo?: Message | null;
  mentions?: MessageMention[];
  revision: number;
  attachments: DraftAttachment[];
  batch?: StoredComposer['batch'];
  outbox?: StoredComposer['outbox'];
  recoveredDrafts?: StoredComposer['recoveredDrafts'];
  storageWarning?: string;
}
const empty = (): Draft => ({ text: '', attachFile: null, replyingTo: null, mentions: undefined, attachments: [], batch: undefined, outbox: [], recoveredDrafts: [], storageWarning: undefined, revision: 0 });
const hydration = new Map<string, Promise<void>>();
const touched = new Map<string, Partial<Draft>>();
export function ensureConversationRecovered(key: string): Promise<void> {
  if (conversationRecovery.ready(key)) return Promise.resolve();
  const pending = hydration.get(key); if (pending) return pending;
  const session = chatSession.capture();
  conversationRecovery.set(key, 'loading');
  const task = Promise.all([clientDb.getDraft(key, true), clientDb.getRecoveryMessages(key)]).then(([stored, messages]) => {
    if (!chatSession.valid(session)) return;
    actionRecovery.load(key);
    const loaded = migrateComposer(stored);
    const edits = touched.get(key) || {};
    const edited = Object.keys(edits).length > 0;
    const merged: Partial<Draft> = { ...loaded, ...edits };
    // Text and mention offsets are inseparable. Preserve conflicting old context
    // as a recoverable snapshot rather than attach old offsets to new text.
    if (Object.prototype.hasOwnProperty.call(edits, 'text') && edits.text !== loaded.text) {
      merged.mentions = edits.mentions;
      merged.recoveredDrafts = [...(loaded.recoveredDrafts || []), ...(loaded.text || loaded.mentions?.length
        ? [{ text: loaded.text, mentions: loaded.mentions, replyingTo: loaded.replyingTo }] : [])];
    }
    if (edited && loaded.batch) {
      merged.batch = undefined;
      merged.outbox = [...(loaded.outbox || []), { batch: loaded.batch, attachments: loaded.attachments }, ...(edits.outbox || [])];
      merged.attachments = edits.attachments || [];
    } else if (edits.attachments) {
      merged.attachments = [...loaded.attachments.filter(a => !edits.attachments!.some(b => b.id === a.id)), ...edits.attachments];
    }
    // Mark ready only after BOTH merges; no persistence can replace unread cache.
    useComposerStore.getState().updateDraft(key, merged);
    useChatStore.getState().mergeForKey(key, messages.map(recoverMessage), true);
    touched.delete(key);
    conversationRecovery.set(key, 'ready');
    useComposerStore.getState().updateDraft(key, {});
  }).catch(() => {
    if (!chatSession.valid(session)) return;
    conversationRecovery.set(key, 'error');
    useComposerStore.getState().updateDraft(key, { storageWarning: 'Chưa khôi phục được dữ liệu cục bộ. Có thể soạn nháp; chưa thể gửi. Chọn lại hội thoại để thử lại.' });
  }).finally(() => { if (hydration.get(key) === task) hydration.delete(key); });
  hydration.set(key, task);
  return task;
}
interface ComposerState {
  activeKey: string;
  drafts: Record<string, Draft>;
  text: string;
  attachFile: File | null;
  missingFileName?: string;
  replyingTo?: Message | null;
  mentions?: MessageMention[];
  attachments: DraftAttachment[];
  batch?: StoredComposer['batch'];
  outbox?: StoredComposer['outbox'];
  recoveredDrafts?: StoredComposer['recoveredDrafts'];
  storageWarning?: string;
  sending: boolean;
  statusMsg: string;
  loadError: string;
  selectKey: (key: string) => void;
  updateDraft: (key: string, patch: Partial<Draft>) => void;
  setText: (text: string) => void;
  setAttachFile: (file: File | null) => void;
  setReplyingTo: (message: Message | null) => void;
  setMentions: (mentions: MessageMention[]) => void;
  setSending: (value: boolean) => void;
  setStatusMsg: (message: string) => void;
  setLoadError: (error: string) => void;
  clearComposer: () => void;
  clearErrors: () => void;
}
export const useComposerStore = create<ComposerState>((set, get) => ({
  activeKey: '', drafts: {}, ...empty(), sending: false, statusMsg: '', loadError: '',
  selectKey: (key) => {
    const existing = get().drafts[key];
    set({ activeKey: key, ...(existing || empty()), missingFileName: existing?.missingFileName, statusMsg: '', loadError: '' });
    if (key) void ensureConversationRecovered(key);
  },
  updateDraft: (key, patch) => {
    if (!key) return;
    const previous = get().drafts[key] || empty();
    const draft = { ...previous, ...patch, revision: previous.revision + 1 };
    set((s) => ({ drafts: { ...s.drafts, [key]: draft }, ...(s.activeKey === key ? draft : {}) }));
    if (!conversationRecovery.ready(key)) {
      touched.set(key, { ...touched.get(key), ...patch });
      return; // Delayed writes must not erase still-unread attachments/outbox.
    }
    const record: StoredComposer = { version: 2, text: draft.text, attachments: draft.attachments,
      mentions: draft.mentions, replyingTo: draft.replyingTo, batch: draft.batch, outbox: draft.outbox, recoveredDrafts: draft.recoveredDrafts };
    // Retain legacy single-file callers while upgrading their durable representation.
    if (draft.attachFile && !record.attachments.length) record.attachments = [{ id: 'legacy', name: draft.attachFile.name,
      size: draft.attachFile.size, type: draft.attachFile.type, lastModified: draft.attachFile.lastModified,
      file: draft.attachFile, caption: '', upload: 'local' }];
    void clientDb.saveComposer(key, record).then(async saved => {
      if (get().drafts[key]?.revision !== draft.revision) return;
      if (!saved) {
        await clientDb.saveComposer(key, { ...record, attachments: record.attachments.map(({ file: _file, ...item }) => ({ ...item, upload: item.stage ? item.upload : 'missing' })) });
        if (get().drafts[key]?.revision !== draft.revision) return;
        const storageWarning = 'Không lưu được tệp trên thiết bị. Giữ tab này mở; sau tải lại có thể cần chọn lại tệp.';
        set(s => ({ drafts: { ...s.drafts, [key]: { ...draft, storageWarning } }, ...(s.activeKey === key ? { storageWarning } : {}) }));
      }
    });
  },
  setText: (text) => get().updateDraft(get().activeKey, { text }),
  setAttachFile: (attachFile) => get().updateDraft(get().activeKey, { attachFile, missingFileName: undefined }),
  setReplyingTo: (replyingTo) => get().updateDraft(get().activeKey, { replyingTo }),
  setMentions: (mentions) => get().updateDraft(get().activeKey, { mentions }),
  setSending: (sending) => set({ sending }),
  setStatusMsg: (statusMsg) => set({ statusMsg }),
  setLoadError: (loadError) => set({ loadError }),
   clearComposer: () => get().updateDraft(get().activeKey, { ...empty(), outbox: get().drafts[get().activeKey]?.outbox || [] }),
  clearErrors: () => set({ statusMsg: '', loadError: '' }),
}));
chatSession.subscribe(() => { hydration.clear(); touched.clear(); useComposerStore.setState({ activeKey: '', drafts: {}, ...empty(), missingFileName: undefined, statusMsg: '', loadError: '' }); });
