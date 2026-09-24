import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import type {
  WsConversationMessagePayload,
  WsConversationSummariesPayload,
  WsSessionStatusPayload,
} from '@/types';

interface WsHandlers {
  onStatus?: (payload: WsSessionStatusPayload) => void;
  onConversations?: (payload: WsConversationSummariesPayload) => void;
  onMessage?: (payload: WsConversationMessagePayload) => void;
  onSyncStatus?: (payload: { accountId: string; status: string; requ18Received?: number; historySynced?: number; historyMsgs?: number; error?: string }) => void;
  /** Additive escape hatch: preserve unknown scoped events and all extra fields. */
  onEvent?: (payload: Record<string, unknown>) => void;
}

type Selection = { accountId: string; conversationId: string };
type Timer = ReturnType<typeof setTimeout>;

/** Small transport seam for deterministic reconnect tests, with no React/DOM work.
 * Selection and session belong to this instance, never to a late socket callback.
 */
export function createRealtimeConnection(options: {
  url: string;
  getToken: () => string | null;
  isSessionCurrent: () => boolean;
  onPayload: (payload: Record<string, unknown>) => void;
  createSocket?: (url: string) => WebSocket;
  schedule?: (callback: () => void, delay: number) => Timer;
  cancel?: (timer: Timer) => void;
}) {
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let socket: WebSocket | null = null;
  let reconnectTimer: Timer | undefined;
  let authTimer: Timer | undefined;
  let disposed = false;
  let authenticated = false;
  let attempts = 0;
  let selection: Selection | null = null;
  let sessionToken: string | null = null;

  function clearTimers() {
    if (reconnectTimer !== undefined) cancel(reconnectTimer);
    if (authTimer !== undefined) cancel(authTimer);
    reconnectTimer = authTimer = undefined;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimers();
    selection = null;
    authenticated = false;
    const old = socket;
    socket = null; // Invalidate callbacks BEFORE close (also safe for synchronous mocks).
    if (old && old.readyState < 2) old.close();
  }

  function sessionCurrent() {
    if (disposed) return false;
    if (!options.isSessionCurrent() || !sessionToken || options.getToken() !== sessionToken) {
      dispose();
      return false;
    }
    return true;
  }

  function sendSelection() {
    if (!authenticated || !sessionCurrent() || socket?.readyState !== 1) return;
    socket.send(JSON.stringify(selection ? { type: 'subscribe', ...selection } : { type: 'unsubscribe' }));
  }

  function retry() {
    if (!sessionCurrent() || reconnectTimer !== undefined) return;
    const delay = [1000, 2000, 4000, 8000, 16000, 30000][Math.min(attempts++, 5)];
    reconnectTimer = schedule(() => { reconnectTimer = undefined; connect(); }, delay);
  }

  function connect() {
    if (disposed || socket || !options.isSessionCurrent()) return;
    const token = options.getToken();
    if (!token || (sessionToken && token !== sessionToken)) { dispose(); return; }
    sessionToken = token;
    let current: WebSocket;
    try {
      current = (options.createSocket ?? ((url) => new WebSocket(url)))(options.url);
    } catch { retry(); return; }
    socket = current;
    authenticated = false;
    const currentSession = () => socket === current && sessionCurrent();
    // Covers a hung CONNECTING socket as well as a missing authentication ack.
    authTimer = schedule(() => {
      authTimer = undefined;
      if (!currentSession()) return;
      socket = null;
      authenticated = false;
      current.close();
      retry();
    }, 10_000);

    current.addEventListener('open', () => {
      if (!currentSession()) return;
      current.send(JSON.stringify({ type: 'authenticate', token }));
    });
    current.addEventListener('message', (event) => {
      if (!currentSession()) return;
      let payload: Record<string, unknown>;
      try {
        const value = JSON.parse(String(event.data));
        if (!value || typeof value !== 'object' || Array.isArray(value)) return;
        payload = value;
      } catch { return; }
      if (payload.type === 'authenticated') {
        if (authenticated) return;
        authenticated = true;
        attempts = 0; // An OPEN socket is not yet a successful connection.
        if (authTimer !== undefined) cancel(authTimer);
        authTimer = undefined;
        if (selection) sendSelection();
        options.onPayload(payload);
        return;
      }
      if (payload.type === 'error' && ['AUTH_REQUIRED', 'AUTH_INVALID', 'TOKEN_EXPIRED', 'AUTH_REVOKED'].includes(String(payload.code))) {
        dispose(); // Retry only when the application supplies a new login session.
        return;
      }
      if (!authenticated) return;
      if (payload.type === 'connected') return;
      // Do not infer account/conversation from current UI selection, or discard
      // an already-in-flight own receipt merely because the view has changed.
      options.onPayload(payload);
    });
    current.addEventListener('close', (event) => {
      if (!currentSession()) return;
      socket = null;
      authenticated = false;
      if (authTimer !== undefined) cancel(authTimer);
      authTimer = undefined;
      if (event.code === 4401 || event.code === 4403) { dispose(); return; }
      retry();
    });
    current.addEventListener('error', () => {
      if (!currentSession()) return;
      // Detach immediately; browsers may deliver close asynchronously (or not
      // at all for a failed CONNECTING socket). Schedule exactly one retry.
      socket = null;
      authenticated = false;
      if (authTimer !== undefined) cancel(authTimer);
      authTimer = undefined;
      current.close();
      retry();
    });
  }

  return {
    connect,
    dispose,
    subscribe(accountId: string, conversationId: string) {
      if (disposed) return;
      selection = accountId && conversationId ? { accountId, conversationId } : null;
      sendSelection();
    },
    unsubscribe() { if (!disposed) { selection = null; sendSelection(); } },
  };
}

function getToken() {
  try { return localStorage.getItem('auth_token'); } catch { return null; }
}

export function useWebSocket(handlers: WsHandlers) {
  // Observe the user object as well as the ID: logout/login as the same user
  // can be batched by React and can even receive the same JWT within a second.
  const user = useAuthStore((state) => state.user);
  const userId = user?.id;
  const token = getToken();
  const connection = useRef<ReturnType<typeof createRealtimeConnection> | null>(null);
  const selection = useRef<(Selection & { userId?: string }) | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!userId || !token) { selection.current = null; return; }
    if (selection.current?.userId !== userId) selection.current = null;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const transport = createRealtimeConnection({
      url: `${protocol}//${window.location.host}/ws`,
      getToken,
      isSessionCurrent: () => useAuthStore.getState().user?.id === userId,
      onPayload(payload) {
        const current = handlersRef.current;
        // Forward the original envelope, including additive receipt/unknown
        // fields. Never rebuild it from the currently selected conversation.
        if (typeof payload.accountId === 'string' && payload.accountId) {
          if (payload.type === 'session_state') current.onStatus?.(payload as unknown as WsSessionStatusPayload);
          if (payload.type === 'conversation_summaries') current.onConversations?.(payload as unknown as WsConversationSummariesPayload);
          if (payload.type === 'conversation_message') current.onMessage?.(payload as unknown as WsConversationMessagePayload);
          if (payload.type === 'ws_sync_status') current.onSyncStatus?.(payload as unknown as Parameters<NonNullable<WsHandlers['onSyncStatus']>>[0]);
        }
        current.onEvent?.(payload);
      },
    });
    connection.current = transport;
    transport.connect();
    if (selection.current) transport.subscribe(selection.current.accountId, selection.current.conversationId);
    // Zustand notifies synchronously: close immediately on logout/replacement,
    // rather than waiting for React's next effect cleanup.
    const stopOnSessionChange = useAuthStore.subscribe((state) => {
      if (state.user?.id !== userId || getToken() !== token) {
        selection.current = null;
        transport.dispose();
      }
    });
    const checkCredentials = () => {
      if (getToken() !== token || useAuthStore.getState().user?.id !== userId) {
        selection.current = null;
        transport.dispose();
      }
    };
    window.addEventListener('storage', checkCredentials);
    window.addEventListener('focus', checkCredentials);
    return () => {
      stopOnSessionChange();
      window.removeEventListener('storage', checkCredentials);
      window.removeEventListener('focus', checkCredentials);
      transport.dispose();
      if (connection.current === transport) connection.current = null;
    };
  }, [user, userId, token]);

  const subscribe = useCallback((accountId: string, conversationId: string) => {
    selection.current = { accountId, conversationId, userId: useAuthStore.getState().user?.id };
    connection.current?.subscribe(accountId, conversationId);
  }, []);
  const unsubscribe = useCallback(() => {
    selection.current = null;
    connection.current?.unsubscribe();
  }, []);

  return { subscribe, unsubscribe };
}
