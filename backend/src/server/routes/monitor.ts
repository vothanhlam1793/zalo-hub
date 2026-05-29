import { Router, type Request, type Response, type NextFunction } from 'express';
import type { GoldLogger } from '../../core/logger.js';
import type { GoldStore } from '../../core/store/index.js';
import type { AccountRuntimeManager } from '../account-manager.js';

export function createMonitorRouter(
  logger: GoldLogger,
  store: GoldStore,
  accountManager: AccountRuntimeManager,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireAccountAccess: (minRole?: string) => (req: Request, res: Response, next: NextFunction) => void,
) {
  const router = Router({ mergeParams: true });

  const monitorMiddleware = [requireAuth, requireAccountAccess('viewer')];

  // GET /:accountId/monitor/conversations
  router.get('/:accountId/monitor/conversations', ...monitorMiddleware, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      if (!accountId) {
        res.status(400).json({ error: 'accountId la bat buoc' });
        return;
      }

      const fromRaw = String(req.query.from ?? '').trim();
      const toRaw = String(req.query.to ?? '').trim();
      if (!fromRaw || !toRaw) {
        res.status(400).json({ error: 'from va to la bat buoc (ISO 8601)' });
        return;
      }

      try {
        const result = await store.listMonitorConversationsByAccountAndRange(accountId, {
          from: fromRaw,
          to: toRaw,
          type: (req.query.type as 'direct' | 'group') || undefined,
          onlyUnread: req.query.onlyUnread === '1' || req.query.onlyUnread === 'true',
          limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
          cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
        });

        res.json({ accountId, from: fromRaw, to: toRaw, items: result.items, nextCursor: result.nextCursor });
      } catch (error) {
        logger.error('monitor_conversations_failed', {
          accountId,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Lay danh sach conversation that bai' });
      }
    })();
  });

  // GET /:accountId/monitor/conversations/unread
  router.get('/:accountId/monitor/conversations/unread', ...monitorMiddleware, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      if (!accountId) {
        res.status(400).json({ error: 'accountId la bat buoc' });
        return;
      }

      try {
        const items = await store.listUnreadConversationsByAccount(accountId);
        res.json({ accountId, items });
      } catch (error) {
        logger.error('monitor_unread_failed', {
          accountId,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Lay danh sach unread that bai' });
      }
    })();
  });

  // GET /:accountId/monitor/messages
  router.get('/:accountId/monitor/messages', ...monitorMiddleware, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      if (!accountId) {
        res.status(400).json({ error: 'accountId la bat buoc' });
        return;
      }

      const fromRaw = String(req.query.from ?? '').trim();
      const toRaw = String(req.query.to ?? '').trim();
      if (!fromRaw || !toRaw) {
        res.status(400).json({ error: 'from va to la bat buoc (ISO 8601)' });
        return;
      }

      try {
        const result = await store.listMonitorMessagesByAccountAndRange(accountId, {
          from: fromRaw,
          to: toRaw,
          conversationId: typeof req.query.conversationId === 'string' ? req.query.conversationId : undefined,
          conversationType: (req.query.type as 'direct' | 'group') || undefined,
          limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
          cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
        });

        res.json({ accountId, from: fromRaw, to: toRaw, items: result.items, nextCursor: result.nextCursor });
      } catch (error) {
        logger.error('monitor_messages_failed', {
          accountId,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Lay messages that bai' });
      }
    })();
  });

  // GET /:accountId/monitor/conversations/:conversationId
  router.get('/:accountId/monitor/conversations/:conversationId', ...monitorMiddleware, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.params.conversationId ?? '').trim();
      if (!accountId || !conversationId) {
        res.status(400).json({ error: 'accountId va conversationId la bat buoc' });
        return;
      }

      try {
        const summary = await store.getConversationSummaryByAccountAndId(accountId, conversationId);
        if (!summary) {
          res.status(404).json({ error: 'Khong tim thay conversation' });
          return;
        }

        res.json({ conversation: summary });
      } catch (error) {
        logger.error('monitor_conversation_detail_failed', {
          accountId,
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Lay thong tin conversation that bai' });
      }
    })();
  });

  // GET /:accountId/monitor/conversations/:conversationId/messages
  router.get('/:accountId/monitor/conversations/:conversationId/messages', ...monitorMiddleware, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.params.conversationId ?? '').trim();
      if (!accountId || !conversationId) {
        res.status(400).json({ error: 'accountId va conversationId la bat buoc' });
        return;
      }

      const fromRaw = typeof req.query.from === 'string' ? req.query.from : undefined;
      const toRaw = typeof req.query.to === 'string' ? req.query.to : undefined;
      const before = typeof req.query.before === 'string' ? req.query.before : undefined;
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

      try {
        if (fromRaw && toRaw) {
          const result = await store.listMonitorMessagesByAccountAndRange(accountId, {
            from: fromRaw,
            to: toRaw,
            conversationId,
            limit,
            cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
          });

          res.json({ accountId, conversationId, from: fromRaw, to: toRaw, items: result.items, nextCursor: result.nextCursor });
          return;
        }

        const runtime = accountManager.getRuntime(accountId);
        if (!runtime || !runtime.isSessionActive()) {
          res.status(401).json({ error: 'Account chua active session' });
          return;
        }

        const rawMessages = await runtime.getConversationMessages(conversationId, { before, limit });
        const messages = await runtime.resolveGroupSenderNames(conversationId, rawMessages);
        const oldestTimestamp = messages[0]?.timestamp;
        const hasMore = Boolean(before ? messages.length === (limit ?? 40) : oldestTimestamp);

        res.json({ accountId, conversationId, messages, count: messages.length, oldestTimestamp, hasMore });
      } catch (error) {
        logger.error('monitor_conversation_messages_failed', {
          accountId,
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Lay messages conversation that bai' });
      }
    })();
  });

  return router;
}
