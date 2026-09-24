import jwt from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { Knex } from 'knex';
import type { AccountRuntimeManager } from '../account-manager.js';
import type { GoldConversationMessage } from '../../core/types.js';
import { getStatusForRuntime, getEmptyStatus } from '../helpers/status.js';
import { readAccountPolicy } from '../helpers/account-policy.js';

const JWT_SECRET = process.env.JWT_SECRET || 'zalohub-dev-secret-change-in-production';
const AUTH_TIMEOUT_MS = 10_000;
const POLICY_INTERVAL_MS = 30_000;

type SocketState = {
  userId?: string;
  expiresAt: number;
  accounts: Set<string>;
  subscription?: { accountId: string; conversationId: string };
  closed: boolean;
  queue: Promise<void>;
  pending: number;
  timer?: ReturnType<typeof setTimeout>;
};

export function createWsHandler(server: Server, accountManager: AccountRuntimeManager, knex: Knex) {
  const wsServer = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
  const states = new Map<WebSocket, SocketState>();

  function send(socket: WebSocket, payload: Record<string, unknown>) {
    if (socket.readyState !== WebSocket.OPEN || states.get(socket)?.closed) return;
    if (socket.bufferedAmount > 1024 * 1024) {
      end(socket, 'SLOW_CLIENT', 1013);
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  function end(socket: WebSocket, code: string, closeCode = 4401) {
    const state = states.get(socket);
    if (!state || state.closed) return;
    // No database/provider/token details in public errors.
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'error', code, error: code }));
    }
    state.closed = true;
    state.accounts.clear();
    state.subscription = undefined;
    clearTimeout(state.timer);
    socket.close(closeCode, code);
  }

  // Serialize auth, subscribe, revocation checks and deliveries per socket.
  // A delayed authorization result cannot resurrect an old subscription/session.
  function enqueue(socket: WebSocket, work: () => Promise<void>) {
    const state = states.get(socket);
    if (!state || state.closed) return;
    if (state.pending >= 128) { end(socket, 'SLOW_CLIENT', 1013); return; }
    state.pending++;
    state.queue = state.queue.then(async () => {
      if (!state.closed) await work();
    }).catch(() => end(socket, 'AUTH_UNAVAILABLE', 1013)).finally(() => { state.pending--; });
    return state.queue;
  }

  async function refreshPolicy(socket: WebSocket, state: SocketState): Promise<boolean> {
    if (state.closed || !state.userId) return false;
    if (Date.now() >= state.expiresAt) { end(socket, 'TOKEN_EXPIRED'); return false; }
    const accounts = await readAccountPolicy(knex, state.userId);
    if (state.closed) return false;
    if (Date.now() >= state.expiresAt) { end(socket, 'TOKEN_EXPIRED'); return false; }
    if (!accounts) { end(socket, 'AUTH_REVOKED'); return false; }
    state.accounts = accounts;
    if (state.subscription && !accounts.has(state.subscription.accountId)) {
      const { accountId } = state.subscription;
      state.subscription = undefined;
      send(socket, { type: 'error', code: 'ACCOUNT_ACCESS_REVOKED', accountId, error: 'Account access revoked' });
    }
    return true;
  }

  function deliver(socket: WebSocket, payload: Record<string, unknown>) {
    const state = states.get(socket);
    const accountId = payload.accountId;
    // Reject unscoped data, including legacy global tag events. Unknown scoped
    // event names/fields are preserved for existing and future consumers.
    if (!state?.userId || typeof accountId !== 'string' || !accountId) return;
    const eligible = () => {
      if (state.closed || socket.readyState !== WebSocket.OPEN || !state.accounts.has(accountId)) return false;
      if (payload.type !== 'conversation_message') return true;
      const message = payload.message as GoldConversationMessage | undefined;
      const sub = state.subscription;
      return Boolean(message && sub && sub.accountId === accountId && sub.conversationId === message.conversationId);
    };
    // Admission is NOT authorization: discard unrelated traffic without spending
    // this socket's queue budget or issuing a DB query. Otherwise another busy
    // account/conversation can close an entirely healthy client as SLOW_CLIENT.
    // Grants are learned by command/idle policy refresh, never by rejected fanout.
    if (!eligible()) return;
    return enqueue(socket, async () => {
      // A queued command or prior delivery may have changed eligibility. Fresh
      // DB policy and before/after-query expiry checks remain mandatory to send.
      if (!eligible() || !(await refreshPolicy(socket, state)) || !eligible()) return;
      send(socket, payload);
    });
  }

  function broadcast(payload: Record<string, unknown>) {
    // `connected` is the only global transport event; never forward extra data.
    if (payload.type === 'connected') {
      for (const socket of wsServer.clients) send(socket, { type: 'connected' });
      return;
    }
    for (const socket of wsServer.clients) deliver(socket, payload);
  }

  function broadcastConversationMessage(accountId: string, message: GoldConversationMessage) {
    broadcast({ type: 'conversation_message', accountId, message });
  }

  const removeMessageListener = accountManager.onConversationMessage(({ accountId, message }) => {
    broadcastConversationMessage(accountId, message);
    // Do not replace/intercept the manager's event stream: webhook and other
    // backend listeners must see the same incoming and local outgoing events.
    void (async () => {
      const runtime = accountManager.getRuntime(accountId);
      if (!runtime) return;
      broadcast({ type: 'conversation_summaries', accountId, conversations: await runtime.getConversationSummaries() });
      broadcast({ type: 'session_state', accountId, status: await getStatusForRuntime(runtime) });
    })().catch(() => { /* Snapshot failure must not suppress the message or leak an unhandled rejection. */ });
  });

  async function initialSnapshots(socket: WebSocket, state: SocketState) {
    for (const accountId of state.accounts) {
      if (state.closed) return;
      const runtime = accountManager.getRuntime(accountId);
      // Never start a Zalo session merely to authenticate a browser socket.
      if (runtime) {
        await deliver(socket, { type: 'conversation_summaries', accountId, conversations: await runtime.getConversationSummaries() });
      }
      // Pace bootstrap too: a super-admin with many accounts must not overflow
      // its own delivery queue before any network traffic has arrived.
      await deliver(socket, { type: 'session_state', accountId, status: runtime ? await getStatusForRuntime(runtime) : getEmptyStatus() });
    }
  }

  async function authenticate(socket: WebSocket, state: SocketState, token: unknown) {
    if (state.userId || typeof token !== 'string' || !token) { end(socket, 'AUTH_INVALID'); return false; }
    let decoded: jwt.JwtPayload;
    try {
      const value = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      if (typeof value === 'string' || typeof value.userId !== 'string' || !value.userId.trim()
        || typeof value.exp !== 'number' || !Number.isFinite(value.exp)) throw new Error('Invalid claims');
      decoded = value;
    } catch { end(socket, 'AUTH_INVALID'); return false; }
    state.userId = decoded.userId;
    state.expiresAt = decoded.exp! * 1000;
    if (!(await refreshPolicy(socket, state))) return false;
    clearTimeout(state.timer);
    const scheduleExpiry = () => {
      const remaining = state.expiresAt - Date.now();
      if (remaining <= 0) { end(socket, 'TOKEN_EXPIRED'); return; }
      state.timer = setTimeout(scheduleExpiry, Math.min(remaining, 2_147_483_647));
      state.timer.unref();
    };
    scheduleExpiry();
    if (state.closed) return false;
    send(socket, { type: 'authenticated' });
    // Fetch outside the command queue so slow snapshots do not block subscribe.
    void initialSnapshots(socket, state).catch(() => { /* HTTP remains the authoritative snapshot fallback. */ });
    return true;
  }

  wsServer.on('connection', (socket: WebSocket) => {
    const state: SocketState = { expiresAt: 0, accounts: new Set(), closed: false, queue: Promise.resolve(), pending: 0 };
    states.set(socket, state);
    send(socket, { type: 'connected' });
    state.timer = setTimeout(() => end(socket, 'AUTH_TIMEOUT', 4408), AUTH_TIMEOUT_MS);
    state.timer.unref();

    socket.on('message', (raw, isBinary) => {
      enqueue(socket, async () => {
        let payload: Record<string, unknown>;
        try {
          const value = JSON.parse(String(raw));
          if (isBinary || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid payload');
          payload = value;
        } catch {
          if (!state.userId) end(socket, 'AUTH_REQUIRED');
          else send(socket, { type: 'error', code: 'INVALID_PAYLOAD', error: 'Invalid websocket payload' });
          return;
        }
        if (payload.type === 'authenticate') { await authenticate(socket, state, payload.token); return; }
        // Optional compatibility: token-bearing first subscribe is atomic.
        if (!state.userId) {
          if (payload.type !== 'subscribe' || !(await authenticate(socket, state, payload.token))) {
            end(socket, 'AUTH_REQUIRED');
            return;
          }
        }
        // Do not reject subscribe using the admission cache: a just-granted
        // account must be discoverable immediately through this fresh lookup.
        if (!(await refreshPolicy(socket, state))) return;
        if (payload.type === 'unsubscribe') {
          state.subscription = undefined;
          send(socket, { type: 'unsubscribed' });
        } else if (payload.type === 'subscribe') {
          // An invalid replacement must not leave the previous selection active.
          state.subscription = undefined;
          const { accountId, conversationId } = payload;
          if (typeof accountId !== 'string' || !accountId || typeof conversationId !== 'string' || !conversationId) {
            send(socket, { type: 'error', code: 'INVALID_SUBSCRIPTION', error: 'Account and conversation are required' });
          } else if (!state.accounts.has(accountId)) {
            send(socket, { type: 'error', code: 'ACCOUNT_FORBIDDEN', error: 'Account access denied' });
          } else {
            state.subscription = { accountId, conversationId };
            send(socket, { type: 'subscribed', accountId, conversationId });
          }
        } else {
          send(socket, { type: 'error', code: 'UNKNOWN_MESSAGE', error: 'Unknown websocket command' });
        }
      });
    });
    socket.on('error', () => end(socket, 'SOCKET_ERROR', 1011));
    socket.on('close', () => {
      state.closed = true;
      clearTimeout(state.timer);
      state.accounts.clear();
      state.subscription = undefined;
      states.delete(socket);
    });
  });

  // Idle sockets learn grants/promotions and lose revoked subscriptions. Busy
  // eligible deliveries/commands also refresh the entire account set. Rejected
  // broadcasts never schedule refresh work; until a refresh, newly granted
  // accounts' events are dropped (WS is not durable replay). Every actual
  // delivery still checks fresh policy, so this is not a revocation grace period.
  const policyTimer = setInterval(() => {
    for (const [socket, state] of states) {
      if (state.userId && state.pending === 0) enqueue(socket, async () => { await refreshPolicy(socket, state); });
    }
  }, POLICY_INTERVAL_MS);
  policyTimer.unref();
  wsServer.on('close', () => {
    clearInterval(policyTimer);
    removeMessageListener();
    for (const state of states.values()) { state.closed = true; clearTimeout(state.timer); }
    states.clear();
  });

  return { broadcast, broadcastConversationMessage, wsServer };
}
