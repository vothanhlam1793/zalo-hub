import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { AccountRuntimeManager } from '../account-manager.js';
import type { GoldConversationMessage } from '../../core/types.js';
import { getStatusForRuntime, getEmptyStatus } from '../helpers/status.js';

export function createWsHandler(
  server: Server,
  accountManager: AccountRuntimeManager,
) {
  const wsServer = new WebSocketServer({ server, path: '/ws' });
  const wsSubscriptions = new Map<WebSocket, { accountId: string; conversationId: string }>();

  function broadcast(payload: Record<string, unknown>) {
    const body = JSON.stringify(payload);
    for (const client of wsServer.clients) {
      if (client.readyState !== client.OPEN) continue;
      client.send(body);
    }
  }

  function broadcastConversationMessage(accountId: string, message: GoldConversationMessage) {
    const payload = JSON.stringify({ type: 'conversation_message', accountId, message });
    for (const client of wsServer.clients) {
      if (client.readyState !== client.OPEN) continue;
      const subscription = wsSubscriptions.get(client);
      if (!subscription || subscription.accountId !== accountId || subscription.conversationId !== message.conversationId) continue;
      client.send(payload);
    }
  }

  accountManager.onConversationMessage(({ accountId, message }) => {
    broadcastConversationMessage(accountId, message);
    const accountRuntime = accountManager.getRuntime(accountId);
    if (!accountRuntime) return;
    broadcast({ type: 'conversation_summaries', accountId, conversations: accountRuntime.getConversationSummaries() });
    broadcast({ type: 'session_state', accountId, status: getStatusForRuntime(accountRuntime) });
  });

  wsServer.on('connection', (socket: WebSocket) => {
    socket.send(JSON.stringify({ type: 'connected' }));
    const primaryAccountId = accountManager.getPrimaryAccountId();
    const primaryRuntime = accountManager.getPrimaryRuntime();
    socket.send(JSON.stringify({
      type: 'conversation_summaries',
      accountId: primaryAccountId,
      conversations: primaryRuntime?.getConversationSummaries() ?? [],
    }));
    socket.send(JSON.stringify({
      type: 'session_state',
      accountId: primaryAccountId,
      status: primaryRuntime ? getStatusForRuntime(primaryRuntime) : getEmptyStatus(),
    }));

    socket.on('message', (raw: string | Buffer) => {
      try {
        const payload = JSON.parse(String(raw)) as { type?: string; conversationId?: string; accountId?: string };
        if (payload.type === 'subscribe' && payload.conversationId && payload.accountId) {
          wsSubscriptions.set(socket, { accountId: String(payload.accountId), conversationId: String(payload.conversationId) });
          socket.send(JSON.stringify({ type: 'subscribed', accountId: String(payload.accountId), conversationId: String(payload.conversationId) }));
          return;
        }
        if (payload.type === 'unsubscribe') {
          wsSubscriptions.delete(socket);
          socket.send(JSON.stringify({ type: 'unsubscribed' }));
        }
      } catch (error) {
        socket.send(JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Invalid websocket payload' }));
      }
    });

    socket.on('close', () => {
      wsSubscriptions.delete(socket);
    });
  });

  return { broadcast, broadcastConversationMessage, wsServer };
}
