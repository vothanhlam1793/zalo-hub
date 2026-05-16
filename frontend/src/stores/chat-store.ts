import { create } from 'zustand';
import type { Contact, ConversationSummary, Group, Message } from '../types';

interface ChatState {
  conversationsByAccount: Record<string, ConversationSummary[]>;
  pendingReadAtByConversation: Record<string, string>;
  contacts: Contact[];
  groups: Group[];
  activeConversationId: string;
  messages: Message[];
  hasMoreHistory: boolean;
  loadingOlder: boolean;
  syncingHistory: boolean;

  replaceAccountConversations: (accountId: string, c: ConversationSummary[]) => void;
  setSidebarConversationsForAccount: (accountId: string, c: ConversationSummary[]) => void;
  markConversationReadLocal: (accountId: string, conversationId: string, readAt?: string) => void;
  clearPendingReadAt: (accountId: string, conversationId: string, persistedReadAt?: string) => void;
  prependConversation: (entry: ConversationSummary) => void;
  updateConversationFromWs: (accountId: string, message: { conversationId: string; text: string; kind: string; timestamp: string; direction: string }) => void;

  getAccountConversations: (accountId: string) => ConversationSummary[];
  setContacts: (c: Contact[]) => void;
  setGroups: (g: Group[]) => void;
  setActiveConversationId: (id: string) => void;
  setMessages: (m: Message[]) => void;
  setHasMoreHistory: (v: boolean) => void;
  setLoadingOlder: (v: boolean) => void;
  setSyncingHistory: (v: boolean) => void;
  clearActivePane: () => void;
  resetAll: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversationsByAccount: {},
  pendingReadAtByConversation: {},
  contacts: [],
  groups: [],
  activeConversationId: '',
  messages: [],
  hasMoreHistory: false,
  loadingOlder: false,
  syncingHistory: false,

  replaceAccountConversations: (accountId, c) => set((state) => {
    const nextPending = { ...state.pendingReadAtByConversation };
    const merged = c.map((entry) => {
      const pendingKey = `${accountId}::${entry.id}`;
      const pendingReadAt = nextPending[pendingKey];
      const backendReadAt = entry.lastReadAt ?? new Date(0).toISOString();
      if (!pendingReadAt) {
        return { ...entry, lastReadAt: backendReadAt };
      }
      if (Date.parse(backendReadAt) >= Date.parse(pendingReadAt)) {
        delete nextPending[pendingKey];
        return { ...entry, lastReadAt: backendReadAt };
      }
      return { ...entry, unreadCount: 0, lastReadAt: pendingReadAt };
    });
    return {
      pendingReadAtByConversation: nextPending,
      conversationsByAccount: {
        ...state.conversationsByAccount,
        [accountId]: merged,
      },
    };
  }),

  setSidebarConversationsForAccount: (accountId, c) => get().replaceAccountConversations(accountId, c),

  markConversationReadLocal: (accountId, conversationId, readAt) => {
    const resolvedReadAt = readAt ?? new Date().toISOString();
    const key = `${accountId}::${conversationId}`;
    set((state) => ({
      pendingReadAtByConversation: {
        ...state.pendingReadAtByConversation,
        [key]: resolvedReadAt,
      },
      conversationsByAccount: {
        ...state.conversationsByAccount,
        [accountId]: (state.conversationsByAccount[accountId] ?? []).map((entry) =>
          entry.id === conversationId ? { ...entry, unreadCount: 0, lastReadAt: resolvedReadAt } : entry,
        ),
      },
    }));
  },

  clearPendingReadAt: (accountId, conversationId, persistedReadAt) => set((state) => {
    const key = `${accountId}::${conversationId}`;
    const pendingReadAt = state.pendingReadAtByConversation[key];
    if (!pendingReadAt) return state;
    if (persistedReadAt && Date.parse(persistedReadAt) < Date.parse(pendingReadAt)) return state;
    const nextPending = { ...state.pendingReadAtByConversation };
    delete nextPending[key];
    return { pendingReadAtByConversation: nextPending };
  }),

  prependConversation: (entry) => set((state) => {
    const accountEntries = state.conversationsByAccount[entry.accountId] ?? [];
    if (accountEntries.find((e) => e.id === entry.id)) return state;
    return {
      conversationsByAccount: {
        ...state.conversationsByAccount,
        [entry.accountId]: [entry, ...accountEntries],
      },
    };
  }),

  updateConversationFromWs: (accountId, msg) => set((state) => {
    const current = state.conversationsByAccount[accountId] ?? [];
    const idx = current.findIndex((e) => e.id === msg.conversationId);
    if (idx < 0) return state;
    const next = [...current];
    next[idx] = {
      ...next[idx],
      lastMessageText: msg.text,
      lastMessageKind: msg.kind as ConversationSummary['lastMessageKind'],
      lastMessageTimestamp: msg.timestamp,
      lastDirection: msg.direction as 'incoming' | 'outgoing',
    };
    next.sort((a, b) => b.lastMessageTimestamp.localeCompare(a.lastMessageTimestamp));
    return {
      conversationsByAccount: {
        ...state.conversationsByAccount,
        [accountId]: next,
      },
    };
  }),

  getAccountConversations: (accountId) => get().conversationsByAccount[accountId] ?? [],
  setContacts: (c) => set({ contacts: c }),
  setGroups: (g) => set({ groups: g }),
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  setMessages: (m) => set({ messages: m }),
  setHasMoreHistory: (v) => set({ hasMoreHistory: v }),
  setLoadingOlder: (v) => set({ loadingOlder: v }),
  setSyncingHistory: (v) => set({ syncingHistory: v }),

  clearActivePane: () => set({
    pendingReadAtByConversation: {},
    contacts: [],
    groups: [],
    activeConversationId: '',
    messages: [],
    hasMoreHistory: false,
    loadingOlder: false,
    syncingHistory: false,
  }),

  resetAll: () => set({
    conversationsByAccount: {},
    pendingReadAtByConversation: {},
    contacts: [],
    groups: [],
    activeConversationId: '',
    messages: [],
    hasMoreHistory: false,
    loadingOlder: false,
    syncingHistory: false,
  }),
}));
