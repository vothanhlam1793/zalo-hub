import { create } from 'zustand';
import { clientDb } from '../lib/client-db';
import { chatSession } from '../features/chat/model/chat-session';
import type { Message, MessageMention } from '../types';

export interface Draft {
  text: string;
  attachFile: File | null;
  missingFileName?: string;
  replyingTo?: Message | null;
  mentions?: MessageMention[];
  revision: number;
}
const empty = (): Draft => ({ text: '', attachFile: null, replyingTo: null, mentions: undefined, revision: 0 });
interface ComposerState {
  activeKey: string;
  drafts: Record<string, Draft>;
  text: string;
  attachFile: File | null;
  missingFileName?: string;
  replyingTo?: Message | null;
  mentions?: MessageMention[];
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
    if (!key || existing) return;
    const session = chatSession.capture();
    void clientDb.getDraft(key).then((draft) => {
      if (!draft || !chatSession.valid(session) || get().drafts[key]) return;
      get().updateDraft(key, { text: draft.text, missingFileName: draft.fileName });
    });
  },
  updateDraft: (key, patch) => {
    if (!key) return;
    const previous = get().drafts[key] || empty();
    const draft = { ...previous, ...patch, revision: previous.revision + 1 };
    set((s) => ({ drafts: { ...s.drafts, [key]: draft }, ...(s.activeKey === key ? draft : {}) }));
    void clientDb.saveDraft(key, { text: draft.text, fileName: draft.attachFile?.name || draft.missingFileName });
  },
  setText: (text) => get().updateDraft(get().activeKey, { text }),
  setAttachFile: (attachFile) => get().updateDraft(get().activeKey, { attachFile, missingFileName: undefined }),
  setReplyingTo: (replyingTo) => get().updateDraft(get().activeKey, { replyingTo }),
  setMentions: (mentions) => get().updateDraft(get().activeKey, { mentions }),
  setSending: (sending) => set({ sending }),
  setStatusMsg: (statusMsg) => set({ statusMsg }),
  setLoadError: (loadError) => set({ loadError }),
  clearComposer: () => get().updateDraft(get().activeKey, { text: '', attachFile: null, missingFileName: undefined, replyingTo: null, mentions: undefined }),
  clearErrors: () => set({ statusMsg: '', loadError: '' }),
}));
chatSession.subscribe(() => useComposerStore.setState({ activeKey: '', drafts: {}, ...empty(), missingFileName: undefined, statusMsg: '', loadError: '' }));
