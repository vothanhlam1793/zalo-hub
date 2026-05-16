import jwt from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { Knex } from 'knex';
import type { AccountRuntimeManager } from '../account-manager.js';
import type { GoldConversationMessage } from '../../core/types.js';
import { getStatusForRuntime, getEmptyStatus } from '../helpers/status.js';

const JWT_SECRET = process.env.JWT_SECRET || 'zalohub-dev-secret-change-in-production';

export function createWsHandler(
  server: Server,
  accountManager: AccountRuntimeManager,
  knex: Knex,
) {
  const wsServer = new WebSocketServer({ server, path: '/ws' });
  const wsSubscriptions = new Map<WebSocket, { accountId: string; conversationId: string; userId: string }>();

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

  async function verifyAccountAccess(userId: string, accountId: string): Promise<boolean> {
    const { rows } = await knex.raw('SELECT 1 FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?', [userId, accountId]);
    return rows.length > 0;
  }

  accountManager.onConversationMessage(({ accountId, message }) => {
    void (async () => {
      broadcastConversationMessage(accountId, message);

      const accountRuntime = accountManager.getRuntime(accountId);
      if (!accountRuntime) return;
      broadcast({ type: 'conversation_summaries', accountId, conversations: await accountRuntime.getConversationSummaries() });
      broadcast({ type: 'session_state', accountId, status: await getStatusForRuntime(accountRuntime) });
    })();
  });

  wsServer.on('connection', (socket: WebSocket) => {
    void (async () => {
      socket.send(JSON.stringify({ type: 'connected' }));
      const primaryAccountId = accountManager.getPrimaryAccountId();
      const primaryRuntime = accountManager.getPrimaryRuntime();
      socket.send(JSON.stringify({
        type: 'conversation_summaries',
        accountId: primaryAccountId,
        conversations: await primaryRuntime?.getConversationSummaries() ?? [],
      }));
      socket.send(JSON.stringify({
        type: 'session_state',
        accountId: primaryAccountId,
        status: primaryRuntime ? await getStatusForRuntime(primaryRuntime) : getEmptyStatus(),
      }));
    })();

    socket.on('message', async (raw: string | Buffer) => {
      try {
        const payload = JSON.parse(String(raw)) as { type?: string; conversationId?: string; accountId?: string; token?: string };
        if (payload.type === 'subscribe' && payload.conversationId && payload.accountId) {
          const accountId = String(payload.accountId);
          const conversationId = String(payload.conversationId);

          if (payload.token) {
            try {
              const decoded = jwt.verify(payload.token, JWT_SECRET) as { userId: string };
              if (!(await verifyAccountAccess(decoded.userId, accountId))) {
                socket.send(JSON.stringify({ type: 'error', error: 'Khong co quyen truy cap tai khoan nay' }));
                return;
              }
              wsSubscriptions.set(socket, { accountId, conversationId, userId: decoded.userId });
            } catch {
              socket.send(JSON.stringify({ type: 'error', error: 'Token khong hop le' }));
              return;
            }
          } else {
            wsSubscriptions.set(socket, { accountId, conversationId, userId: 'anonymous' });
          }

          socket.send(JSON.stringify({ type: 'subscribed', accountId, conversationId }));
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
