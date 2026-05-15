import { create } from 'zustand';

interface ComposerState {
  text: string;
  attachFile: File | null;
  sending: boolean;
  statusMsg: string;
  loadError: string;

  setText: (t: string) => void;
  setAttachFile: (f: File | null) => void;
  setSending: (v: boolean) => void;
  setStatusMsg: (m: string) => void;
  setLoadError: (e: string) => void;
  clearComposer: () => void;
  clearErrors: () => void;
}

export const useComposerStore = create<ComposerState>((set) => ({
  text: '',
  attachFile: null,
  sending: false,
  statusMsg: '',
  loadError: '',

  setText: (t) => set({ text: t }),
  setAttachFile: (f) => set({ attachFile: f }),
  setSending: (v) => set({ sending: v }),
  setStatusMsg: (m) => set({ statusMsg: m }),
  setLoadError: (e) => set({ loadError: e }),
  clearComposer: () => set({ text: '', attachFile: null }),
  clearErrors: () => set({ statusMsg: '', loadError: '' }),
}));
