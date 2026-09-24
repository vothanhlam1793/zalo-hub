import { create } from 'zustand';
import { clientDb } from '../lib/client-db';
import { chatSession } from '../features/chat/model/chat-session';

export interface Draft { text: string; attachFile: File | null; missingFileName?: string; revision: number }
const empty = (): Draft => ({ text: '', attachFile: null, revision: 0 });
interface ComposerState {
  activeKey: string;
  drafts: Record<string, Draft>;
  text: string;
  attachFile: File | null;
  missingFileName?: string;
  sending: boolean;
  statusMsg: string;
  loadError: string;
  selectKey: (key: string) => void;
  updateDraft: (key: string, patch: Partial<Draft>) => void;
  setText: (text: string) => void;
  setAttachFile: (file: File | null) => void;
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
  setSending: (sending) => set({ sending }),
  setStatusMsg: (statusMsg) => set({ statusMsg }),
  setLoadError: (loadError) => set({ loadError }),
  clearComposer: () => get().updateDraft(get().activeKey, { text: '', attachFile: null, missingFileName: undefined }),
  clearErrors: () => set({ statusMsg: '', loadError: '' }),
}));
chatSession.subscribe(() => useComposerStore.setState({ activeKey: '', drafts: {}, ...empty(), missingFileName: undefined, statusMsg: '', loadError: '' }));
