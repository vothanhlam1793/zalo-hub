import { bff } from '../../../bff-api';
import { useChatStore } from '../../../stores/chat-store';
import { chatSession, parseConversationKey } from './chat-session';

/** Dashboard-owned selection lifetime, independent of a socket's private refs.
 * Injectable HTTP seams exercise reconnect/remount races without React or WS.
 */
export function createPaneResumeController(options: {
  subscribe: (accountId: string, conversationId: string) => void;
  unsubscribe: () => void;
  loadMessages?: typeof bff.chatGetMessages;
  loadConversations?: typeof bff.chatGetConversations;
}) {
  const session = chatSession.capture();
  let disposed = false;
  let selectedKey = '';
  let generation = 0;
  const loadMessages = options.loadMessages || bff.chatGetMessages;
  const loadConversations = options.loadConversations || bff.chatGetConversations;

  async function refresh() {
    const key = selectedKey;
    const token = ++generation;
    if (!key || disposed || !chatSession.valid(session)) return;
    const [user, account, conversation] = parseConversationKey(key);
    if (user !== session.userId) return;
    const current = () => !disposed && token === generation && chatSession.valid(session)
      && useChatStore.getState().activeKey === key;
    const store = useChatStore.getState();
    const revision = store.byConversation[key]?.revision || 0;
    const summaries = store.conversationsByAccount[account];
    store.setLoadState(key, { loadState: 'loading', error: undefined });
    // Independent requests: metadata/summary latency never gates message reads.
    await Promise.all([
      loadMessages(account, conversation, { limit: 50 }).then((result) => {
        if (!current()) return;
        const state = useChatStore.getState();
        state.mergeForKey(key, result.messages, (state.byConversation[key]?.revision || 0) !== revision);
        state.setLoadState(key, { loadState: 'ready', hasMore: Boolean(result.hasMore), error: undefined });
      }).catch((error) => {
        if (current()) useChatStore.getState().setLoadState(key, { loadState: 'error', error: error instanceof Error ? error.message : 'Không tải được tin nhắn' });
      }),
      loadConversations(account).then((result) => {
        if (!current()) return;
        const state = useChatStore.getState();
        const live = state.conversationsByAccount[account];
        // Preserve newer scoped WS/read-state updates while adding newly found
        // conversations from the reconnect snapshot.
        const merged = live && live !== summaries
          ? [...live, ...result.conversations.filter((row) => !live.some((m) => m.id === row.id))]
          : result.conversations;
        state.replaceAccountConversations(account, merged);
      }).catch(() => {}),
    ]);
  }

  function synchronizeSelection() {
    const key = useChatStore.getState().activeKey;
    if (disposed || (key === selectedKey && key)) return;
    selectedKey = key;
    generation++; // Also fences A -> B -> A and cleared selections.
    if (!key || !chatSession.valid(session) || parseConversationKey(key)[0] !== session.userId) {
      options.unsubscribe();
      return;
    }
    const [, account, conversation] = parseConversationKey(key);
    options.subscribe(account, conversation);
    void refresh();
  }
  const stop = useChatStore.subscribe((state, previous) => {
    if (state.activeKey !== previous.activeKey) synchronizeSelection();
  });
  synchronizeSelection(); // Critical: Zustand may retain the pane across /admin.
  return {
    authenticated: refresh, // The transport resubscribes; recover messages it missed.
    refresh,
    dispose() {
      disposed = true;
      generation++;
      stop();
      options.unsubscribe();
    },
  };
}
