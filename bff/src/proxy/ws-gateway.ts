import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import { verifyToken } from '../middleware/auth.js';
import { BACKEND_URL } from '../config.js';

interface BackendWsMessage {
  type: string;
  accountId?: string;
  conversationId?: string;
  message?: unknown;
  conversations?: unknown[];
  status?: unknown;
  [key: string]: unknown;
}

interface ClientSubscription {
  accountId: string;
  conversationId: string;
  userId: string;
}

export function createWsGateway(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  let backendWs: WebSocket | null = null;
  let backendReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  const MAX_RECONNECT_DELAY = 30_000;
  let backendConnected = false;

  const clients = new Map<WebSocket, ClientSubscription>();

  const HEARTBEAT_INTERVAL = 30_000;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  function connectBackend() {
    if (backendWs?.readyState === WebSocket.OPEN || backendWs?.readyState === WebSocket.CONNECTING) return;

    const wsUrl = BACKEND_URL.replace(/^http/, 'ws') + '/ws';
    const socket = new WebSocket(wsUrl);
    backendWs = socket;

    socket.on('open', () => {
      backendConnected = true;
      reconnectDelay = 1000;
      broadcastToClients({ type: 'connection_status', status: 'connected' });

      for (const [clientWs, sub] of clients) {
        if (clientWs.readyState !== WebSocket.OPEN) continue;
        socket.send(JSON.stringify({ type: 'subscribe', accountId: sub.accountId, conversationId: sub.conversationId, token: undefined }));
      }
    });

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data)) as BackendWsMessage;
        relayToClients(msg);
      } catch { /* ignore malformed */ }
    });

    socket.on('close', () => {
      backendConnected = false;
      backendWs = null;
      broadcastToClients({ type: 'connection_status', status: 'reconnecting' });
      scheduleReconnect();
    });

    socket.on('error', () => {
      socket.close();
    });
  }

  function scheduleReconnect() {
    if (backendReconnectTimer) clearTimeout(backendReconnectTimer);
    backendReconnectTimer = setTimeout(() => {
      connectBackend();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (backendWs?.readyState === WebSocket.OPEN) {
        backendWs.ping();
      }
      for (const [clientWs] of clients) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.ping();
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  function broadcastToClients(payload: Record<string, unknown>) {
    const body = JSON.stringify(payload);
    for (const [clientWs] of clients) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(body);
      }
    }
  }

  function relayToClients(msg: BackendWsMessage) {
    const body = JSON.stringify(msg);

    if (msg.type === 'conversation_message') {
      const accountId = msg.accountId as string;
      for (const [clientWs, sub] of clients) {
        if (clientWs.readyState !== WebSocket.OPEN) continue;
        if (sub.accountId !== accountId) continue;
        const message = msg.message as { conversationId?: string } | undefined;
        if (message?.conversationId && message.conversationId !== sub.conversationId) continue;
        clientWs.send(body);
      }
    } else {
      for (const [clientWs] of clients) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(body);
        }
      }
    }
  }

  wss.on('connection', (clientWs: WebSocket) => {
    clientWs.send(JSON.stringify({
      type: 'connection_status',
      status: backendConnected ? 'connected' : 'reconnecting',
    }));

    clientWs.on('message', (data) => {
      try {
        const payload = JSON.parse(String(data)) as {
          type?: string; accountId?: string; conversationId?: string; token?: string;
        };

        if (payload.type === 'subscribe' && payload.accountId && payload.conversationId) {
          const token = payload.token;
          let userId = 'anonymous';
          if (token) {
            const decoded = verifyToken(token);
            if (!decoded) {
              clientWs.send(JSON.stringify({ type: 'error', code: 'AUTH_TOKEN_EXPIRED', message: 'Token khong hop le hoac het han' }));
              return;
            }
            userId = decoded.userId;
          }

          clients.set(clientWs, {
            accountId: payload.accountId,
            conversationId: payload.conversationId,
            userId,
          });

          if (backendWs?.readyState === WebSocket.OPEN) {
            backendWs.send(JSON.stringify({
              type: 'subscribe',
              accountId: payload.accountId,
              conversationId: payload.conversationId,
              token,
            }));
          }

          clientWs.send(JSON.stringify({ type: 'subscribed', accountId: payload.accountId, conversationId: payload.conversationId }));
        } else if (payload.type === 'unsubscribe') {
          clients.delete(clientWs);
          clientWs.send(JSON.stringify({ type: 'unsubscribed' }));
        }
      } catch {
        clientWs.send(JSON.stringify({ type: 'error', code: 'VALIDATION_INVALID', message: 'Invalid message format' }));
      }
    });

    clientWs.on('close', () => {
      clients.delete(clientWs);
    });
  });

  server.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/bff/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  connectBackend();
  startHeartbeat();

  return { wss };
}
