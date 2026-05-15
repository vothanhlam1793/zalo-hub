import { create } from 'zustand';
import type { Contact, ConversationSummary, Group, Message } from '../types';

interface ChatState {
  conversations: ConversationSummary[];
  conversationsByAccount: Record<string, ConversationSummary[]>;
  contacts: Contact[];
  groups: Group[];
  activeConversationId: string;
  messages: Message[];
  hasMoreHistory: boolean;
  loadingOlder: boolean;
  syncingHistory: boolean;

  setConversations: (c: ConversationSummary[]) => void;
  setConversationsForAccount: (accountId: string, c: ConversationSummary[]) => void;
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
  conversationsByAccount: {},
  contacts: [],
  groups: [],
  activeConversationId: '',
  messages: [],
  hasMoreHistory: false,
  loadingOlder: false,
  syncingHistory: false,

  setConversations: (c) => set({ conversations: c }),
  setConversationsForAccount: (accountId, c) => set((state) => ({
    conversations: state.conversations.length > 0 && state.conversations[0]?.accountId === accountId ? c : state.conversations,
    conversationsByAccount: {
      ...state.conversationsByAccount,
      [accountId]: c,
    },
  })),
  setContacts: (c) => set({ contacts: c }),
  setGroups: (g) => set({ groups: g }),
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  setMessages: (m) => set({ messages: m }),
  setHasMoreHistory: (v) => set({ hasMoreHistory: v }),
  setLoadingOlder: (v) => set({ loadingOlder: v }),
  setSyncingHistory: (v) => set({ syncingHistory: v }),

  updateConversationFromWs: (msg) => set((state) => {
    const currentAccountId = state.conversations.find((entry) => entry.id === msg.conversationId)?.accountId
      ?? Object.entries(state.conversationsByAccount).find(([, entries]) => entries.some((entry) => entry.id === msg.conversationId))?.[0]
      ?? '';
    if (!currentAccountId) return state;
    const nextByAccount = [...(state.conversationsByAccount[currentAccountId] ?? [])];
    const idx = nextByAccount.findIndex((e) => e.id === msg.conversationId);
    if (idx >= 0) {
      nextByAccount[idx] = {
        ...nextByAccount[idx],
        lastMessageText: msg.text,
        lastMessageKind: msg.kind as ConversationSummary['lastMessageKind'],
        lastMessageTimestamp: msg.timestamp,
        lastDirection: msg.direction as 'incoming' | 'outgoing',
      };
    }
    nextByAccount.sort((a, b) => b.lastMessageTimestamp.localeCompare(a.lastMessageTimestamp));
    const currentVisibleAccountId = state.conversations[0]?.accountId ?? '';
    return {
      conversations: currentVisibleAccountId === currentAccountId ? nextByAccount : state.conversations,
      conversationsByAccount: {
        ...state.conversationsByAccount,
        [currentAccountId]: nextByAccount,
      },
    };
  }),

  prependConversation: (entry) => set((state) => {
    if (state.conversations.find((e) => e.id === entry.id)) return state;
    const accountEntries = state.conversationsByAccount[entry.accountId] ?? [];
    return {
      conversations: [entry, ...state.conversations],
      conversationsByAccount: {
        ...state.conversationsByAccount,
        [entry.accountId]: [entry, ...accountEntries],
      },
    };
  }),

  resetChat: () => set({
    conversations: [],
    conversationsByAccount: {},
    contacts: [],
    groups: [],
    activeConversationId: '',
    messages: [],
    hasMoreHistory: false,
    loadingOlder: false,
    syncingHistory: false,
  }),
}));
