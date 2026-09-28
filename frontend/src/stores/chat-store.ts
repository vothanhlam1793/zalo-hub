import { create } from 'zustand';
import type { Contact, ConversationSummary, Group, Message } from '../types';
import type { SendReceipt } from '../types';
import { applyReceipt, mergeMessages, messageAliases } from '../features/chat/model/message-reconciliation';
import { chatSession, conversationKey, parseConversationKey } from '../features/chat/model/chat-session';
import { clientDb } from '../lib/client-db';
import { conversationRecovery } from '../features/chat/model/conversation-recovery';

export interface ConversationMessages {
  messages: Message[];
  revision: number;
  messageRevisions?: Record<string, number>;
  loadState: 'idle' | 'loading' | 'ready' | 'error';
  hasMore: boolean;
  error?: string;
  discardedLocalIds?: string[];
}
const emptyEntry = (): ConversationMessages => ({ messages: [], revision: 0, loadState: 'idle', hasMore: false });

interface ChatState {
  byConversation: Record<string, ConversationMessages>;
  activeKey: string;
  selectKey: (key: string) => void;
  /** true = cache hydration; number = authoritative HTTP request's start revision. */
  mergeForKey: (key: string, messages: Message[], stale?: boolean | number) => Message[];
  receiptForKey: (key: string, receipt: SendReceipt) => void;
  patchMessage: (key: string, localId: string, patch: Partial<Message>) => void;
  removeMessage: (key: string, localId: string) => void;
  setLoadState: (key: string, patch: Partial<ConversationMessages>) => void;
  conversationsByAccount: Record<string, ConversationSummary[]>;
  pendingReadAtByConversation: Record<string, string>;
  contacts: Contact[];
  groups: Group[];
  activeConversationId: string;
  messages: Message[];
  hasMoreHistory: boolean;
  loadingOlder: boolean;
  syncingHistory: boolean;

  appendAccountConversations: (accountId: string, c: ConversationSummary[]) => void;
  replaceAccountConversations: (accountId: string, c: ConversationSummary[]) => void;
  setSidebarConversationsForAccount: (accountId: string, c: ConversationSummary[]) => void;
  markConversationReadLocal: (accountId: string, conversationId: string, readAt?: string) => void;
  clearPendingReadAt: (accountId: string, conversationId: string, persistedReadAt?: string) => void;
  prependConversation: (entry: ConversationSummary) => void;
  updateConversationFromWs: (accountId: string, message: { conversationId: string; text: string; kind: string; timestamp: string; direction: string }) => void;
  updateConversationSummaryLocal: (accountId: string, message: { conversationId: string; text: string; kind: string; timestamp: string; direction: string }) => void;
  appendLocalMessage: (msg: Message) => void;
  reconcileOutgoingMessage: (sentMsg: Message) => void;

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
  byConversation: {},
  activeKey: '',
  selectKey: (key) => set((s) => ({ activeKey: key, activeConversationId: key ? parseConversationKey(key)[2] : '',
    messages: s.byConversation[key]?.messages || [], hasMoreHistory: s.byConversation[key]?.hasMore || false,
    loadingOlder: false, syncingHistory: false })),
  mergeForKey: (key, incoming, stale = false) => {
    const [user, account, conversation] = parseConversationKey(key);
    if (user !== chatSession.capture().userId || !user) return [];
    const old = get().byConversation[key] || emptyEntry();
    let messages = old.messages;
    const revision = old.revision + (stale === true ? 0 : 1);
    const messageRevisions = { ...old.messageRevisions };
    for (const message of incoming.filter((m) => m.conversationId === conversation && !old.discardedLocalIds?.includes(m.localId || m.id))) {
      const aliases = messageAliases(message, account);
      const preserveNewer = stale === true || (typeof stale === 'number' && aliases.some(alias => (messageRevisions[alias] || 0) > stale));
      messages = mergeMessages(messages, [message], account, preserveNewer);
      if (!preserveNewer) for (const alias of aliases) messageRevisions[alias] = revision;
    }
    get().setLoadState(key, { messages, revision, messageRevisions });
    return messages;
  },
  receiptForKey: (key, receipt) => {
    const [user, account, conversation] = parseConversationKey(key);
    if (user !== chatSession.capture().userId || receipt.accountId !== account || receipt.conversationId !== conversation) return;
    const old = get().byConversation[key] || emptyEntry();
    const messages = applyReceipt(old.messages, receipt);
    const messageRevisions = { ...old.messageRevisions };
    for (const message of messages.filter(m => m.clientRequestId === receipt.clientRequestId)) {
      for (const alias of messageAliases(message, account)) messageRevisions[alias] = old.revision + 1;
    }
    get().setLoadState(key, { messages, revision: old.revision + 1, messageRevisions });
  },
  patchMessage: (key, localId, patch) => {
    const old = get().byConversation[key];
    if (!old) return;
    const messages = old.messages.map((m) => (m.localId || m.id) !== localId ? m : {
      ...m, ...patch, delivery: m.delivery === 'sent' ? 'sent' : patch.delivery || m.delivery,
    });
    const messageRevisions = { ...old.messageRevisions };
    const account = parseConversationKey(key)[1];
    for (const message of messages.filter(m => (m.localId || m.id) === localId)) {
      for (const alias of messageAliases(message, account)) messageRevisions[alias] = old.revision + 1;
    }
    get().setLoadState(key, { messages, revision: old.revision + 1, messageRevisions });
  },
  removeMessage: (key, localId) => {
    const old = get().byConversation[key];
    if (!old) return;
    const messages = old.messages.filter((m) => (m.localId || m.id) !== localId);
    get().setLoadState(key, { messages, revision: old.revision + 1, discardedLocalIds: [...(old.discardedLocalIds || []), localId] });
  },
  setLoadState: (key, patch) => set((s) => {
    if (!key || parseConversationKey(key)[0] !== chatSession.capture().userId) return s;
    const entry = { ...(s.byConversation[key] || emptyEntry()), ...patch };
    return { byConversation: { ...s.byConversation, [key]: entry },
      ...(s.activeKey === key ? { messages: entry.messages, hasMoreHistory: entry.hasMore } : {}) };
  }),
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
    const currentList = state.conversationsByAccount[accountId] ?? [];
    const incomingMap = new Map(c.map((item) => [item.id, item]));

    // 1. Process incoming items with read-state reconciliation
    const processedIncoming = c.map((snapshot) => {
      const current = currentList.find((entry) => entry.id === snapshot.id);
      const entry = current && current.lastMessageTimestamp > snapshot.lastMessageTimestamp
        ? { ...snapshot, lastMessageText: current.lastMessageText, lastMessageKind: current.lastMessageKind,
          lastMessageTimestamp: current.lastMessageTimestamp, lastDirection: current.lastDirection,
          messageCount: Math.max(current.messageCount, snapshot.messageCount), unreadCount: current.unreadCount }
        : snapshot;
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

    // 2. CRITICAL PRESERVATION: If an active conversation or existing conversation in current list
    // is NOT in the incoming snapshot (e.g. backend only returned top 100/150 or it's from a pagination/direct open),
    // preserve it so it never vanishes from the sidebar while user is chatting!
    const retainedCurrent = currentList.filter((existing) => !incomingMap.has(existing.id));
    const merged = [...processedIncoming, ...retainedCurrent];
    merged.sort((a, b) => b.lastMessageTimestamp.localeCompare(a.lastMessageTimestamp));

    return {
      pendingReadAtByConversation: nextPending,
      conversationsByAccount: {
        ...state.conversationsByAccount,
        [accountId]: merged,
      },
    };
  }),

  appendAccountConversations: (accountId, c) => set((state) => {
    const current = state.conversationsByAccount[accountId] ?? [];
    const existingIds = new Set(current.map((item) => item.id));
    const toAdd = c.filter((item) => !existingIds.has(item.id));
    if (toAdd.length === 0) return state;
    const next = [...current, ...toAdd];
    next.sort((a, b) => b.lastMessageTimestamp.localeCompare(a.lastMessageTimestamp));
    return {
      conversationsByAccount: {
        ...state.conversationsByAccount,
        [accountId]: next,
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
    const isViewing = state.activeConversationId === msg.conversationId;
    const isIncoming = msg.direction === 'incoming';
    const next = [...current];

    if (idx < 0) {
      // If conversation is not in current loaded list, synthesize and prepend so it appears immediately!
      const isGroup = msg.conversationId.startsWith('group:');
      const threadId = msg.conversationId.replace(/^(group|direct):/, '');
      const newEntry: ConversationSummary = {
        id: msg.conversationId,
        accountId,
        threadId,
        type: isGroup ? 'group' : 'direct',
        title: isGroup ? `Nhóm ${threadId}` : `Hội thoại ${threadId}`,
        lastMessageText: msg.text,
        lastMessageKind: msg.kind as ConversationSummary['lastMessageKind'],
        lastMessageTimestamp: msg.timestamp,
        lastDirection: msg.direction as 'incoming' | 'outgoing',
        messageCount: 1,
        unreadCount: isViewing ? 0 : (isIncoming ? 1 : 0),
      };
      next.unshift(newEntry);
    } else {
      next[idx] = {
        ...next[idx],
        lastMessageText: msg.text,
        lastMessageKind: msg.kind as ConversationSummary['lastMessageKind'],
        lastMessageTimestamp: msg.timestamp,
        lastDirection: msg.direction as 'incoming' | 'outgoing',
        unreadCount: isViewing ? 0 : (isIncoming ? (next[idx].unreadCount || 0) + 1 : (next[idx].unreadCount || 0)),
      };
    }
    next.sort((a, b) => b.lastMessageTimestamp.localeCompare(a.lastMessageTimestamp));
    return {
      conversationsByAccount: {
        ...state.conversationsByAccount,
        [accountId]: next,
      },
    };
  }),

  updateConversationSummaryLocal: (accountId, msg) => set((state) => {
    const current = state.conversationsByAccount[accountId] ?? [];
    const idx = current.findIndex((e) => e.id === msg.conversationId);
    const next = [...current];
    if (idx >= 0) {
      next[idx] = {
        ...next[idx],
        lastMessageText: msg.text,
        lastMessageKind: msg.kind as ConversationSummary['lastMessageKind'],
        lastMessageTimestamp: msg.timestamp,
        lastDirection: msg.direction as 'incoming' | 'outgoing',
        messageCount: next[idx].messageCount + 1,
      };
    } else {
      const isGroup = msg.conversationId.startsWith('group:');
      const threadId = msg.conversationId.replace(/^(group|direct):/, '');
      const newEntry: ConversationSummary = {
        id: msg.conversationId,
        accountId,
        threadId,
        type: isGroup ? 'group' : 'direct',
        title: isGroup ? `Nhóm ${threadId}` : `Hội thoại ${threadId}`,
        lastMessageText: msg.text,
        lastMessageKind: msg.kind as ConversationSummary['lastMessageKind'],
        lastMessageTimestamp: msg.timestamp,
        lastDirection: msg.direction as 'incoming' | 'outgoing',
        messageCount: 1,
        unreadCount: 0,
      };
      next.unshift(newEntry);
    }
    next.sort((a, b) => b.lastMessageTimestamp.localeCompare(a.lastMessageTimestamp));
    return {
      conversationsByAccount: {
        ...state.conversationsByAccount,
        [accountId]: next,
      },
    };
  }),

  appendLocalMessage: (msg) => { if (get().activeKey) get().mergeForKey(get().activeKey, [msg]); },
  reconcileOutgoingMessage: (msg) => { if (get().activeKey) get().mergeForKey(get().activeKey, [msg]); },

  getAccountConversations: (accountId) => get().conversationsByAccount[accountId] ?? [],
  setContacts: (c) => set({ contacts: c }),
  setGroups: (g) => set({ groups: g }),
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  setMessages: (m) => { if (get().activeKey) get().mergeForKey(get().activeKey, m); },
  setHasMoreHistory: (v) => { if (get().activeKey) get().setLoadState(get().activeKey, { hasMore: v }); },
  setLoadingOlder: (v) => set({ loadingOlder: v }),
  setSyncingHistory: (v) => set({ syncingHistory: v }),

  clearActivePane: () => set({
    activeKey: '',
    contacts: [],
    groups: [],
    activeConversationId: '',
    messages: [],
    hasMoreHistory: false,
    loadingOlder: false,
    syncingHistory: false,
  }),

  resetAll: () => set({
    byConversation: {},
    activeKey: '',
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
chatSession.subscribe(() => useChatStore.getState().resetAll());

// Store listeners can synchronously dispatch the next queued send. Never save
// the pre-notification array from a mutator: it may already be superseded by a
// nested sending/receipt transition. Coalesce, then read the committed owner.
const pendingSnapshots = new Set<string>();
useChatStore.subscribe((state, previous) => {
  const session = chatSession.capture();
  if (!chatSession.valid(session)) return;
  for (const [key, entry] of Object.entries(state.byConversation)) {
    if (entry.messages === previous.byConversation[key]?.messages || pendingSnapshots.has(key)) continue;
    pendingSnapshots.add(key);
    queueMicrotask(() => {
      pendingSnapshots.delete(key);
      if (!chatSession.valid(session) || !conversationRecovery.ready(key)) return;
      const latest = useChatStore.getState().byConversation[key];
      if (!latest) return;
      const [user, account, conversation] = parseConversationKey(key);
      if (user === session.userId) void clientDb.saveMessages(account, conversation, latest.messages);
    });
  }
});
chatSession.subscribe(() => pendingSnapshots.clear());
conversationRecovery.subscribe(key => {
  if (!conversationRecovery.ready(key)) return;
  const entry = useChatStore.getState().byConversation[key];
  const [, account, conversation] = parseConversationKey(key);
  if (entry) void clientDb.saveMessages(account, conversation, entry.messages);
});
