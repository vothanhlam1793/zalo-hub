import { create } from 'zustand';
import type { Contact, ConversationSummary, Group, Message } from '../types';

interface ChatState {
  conversations: ConversationSummary[];
  contacts: Contact[];
  groups: Group[];
  activeConversationId: string;
  messages: Message[];
  hasMoreHistory: boolean;
  loadingOlder: boolean;
  syncingHistory: boolean;

  setConversations: (c: ConversationSummary[]) => void;
  setContacts: (c: Contact[]) => void;
  setGroups: (g: Group[]) => void;
  setActiveConversationId: (id: string) => void;
  setMessages: (m: Message[]) => void;
  setHasMoreHistory: (v: boolean) => void;
  setLoadingOlder: (v: boolean) => void;
  setSyncingHistory: (v: boolean) => void;

  updateConversationFromWs: (message: { conversationId: string; text: string; kind: string; timestamp: string; direction: string }) => void;
  prependConversation: (entry: ConversationSummary) => void;
  resetChat: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  contacts: [],
  groups: [],
  activeConversationId: '',
  messages: [],
  hasMoreHistory: false,
  loadingOlder: false,
  syncingHistory: false,

  setConversations: (c) => set({ conversations: c }),
  setContacts: (c) => set({ contacts: c }),
  setGroups: (g) => set({ groups: g }),
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  setMessages: (m) => set({ messages: m }),
  setHasMoreHistory: (v) => set({ hasMoreHistory: v }),
  setLoadingOlder: (v) => set({ loadingOlder: v }),
  setSyncingHistory: (v) => set({ syncingHistory: v }),

  updateConversationFromWs: (msg) => set((state) => {
    const next = [...state.conversations];
    const idx = next.findIndex((e) => e.id === msg.conversationId);
    if (idx >= 0) {
      next[idx] = {
        ...next[idx],
        lastMessageText: msg.text,
        lastMessageKind: msg.kind as ConversationSummary['lastMessageKind'],
        lastMessageTimestamp: msg.timestamp,
        lastDirection: msg.direction as 'incoming' | 'outgoing',
      };
    }
    next.sort((a, b) => b.lastMessageTimestamp.localeCompare(a.lastMessageTimestamp));
    return { conversations: next };
  }),

  prependConversation: (entry) => set((state) => {
    if (state.conversations.find((e) => e.id === entry.id)) return state;
    return { conversations: [entry, ...state.conversations] };
  }),

  resetChat: () => set({
    conversations: [],
    contacts: [],
    groups: [],
    activeConversationId: '',
    messages: [],
    hasMoreHistory: false,
    loadingOlder: false,
    syncingHistory: false,
  }),
}));
