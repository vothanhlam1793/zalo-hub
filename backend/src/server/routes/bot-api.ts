import { Router, type Request, type Response } from 'express';
import type { AccountRuntimeManager } from '../account-manager.js';
import type { GoldStore } from '../../core/store/index.js';
import { createBotAuth } from './bot-auth.js';
import type { DifyBotService } from '../services/dify-bot-service.js';

export function createBotApiRouter(
  accountManager: AccountRuntimeManager,
  botService: DifyBotService,
  store: GoldStore,
) {
  const router = Router();
  const botAuth = createBotAuth(botService);

  // GET /api/bot/openapi.json — public, no auth
  router.get('/openapi.json', (_req: Request, res: Response) => {
    res.json({
      openapi: '3.0.3',
      info: {
        title: 'ZaloHub Bot API',
        version: '1.0.0',
        description: 'API cho Dify bot giao tiếp với tài khoản Zalo qua ZaloHub',
      },
      servers: [
        { url: `${process.env.PUBLIC_URL || 'https://hub.besen.vn'}/api/bot`, description: 'ZaloHub Production' },
      ],
      security: [{ ApiKeyAuth: [] }],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Bot-Token',
            description: 'Bot token từ ZaloHub (dạng zhb_xxx). Lấy trong Admin Panel → Dify Bots, paste vào đây khi import tool.',
          },
        },
      },
      paths: {
        '/send-message': {
          post: {
            summary: 'Gửi tin nhắn Zalo',
            operationId: 'sendMessage',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['conversationId', 'text'],
                    properties: {
                      conversationId: { type: 'string', description: 'ID cuộc hội thoại' },
                      text: { type: 'string', description: 'Nội dung tin nhắn' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': { description: 'Gửi thành công' },
              '400': { description: 'Thiếu tham số' },
              '401': { description: 'Token không hợp lệ' },
              '503': { description: 'Tài khoản Zalo không online' },
            },
          },
        },
        '/conversations/{conversationId}/messages': {
          get: {
            summary: 'Lấy tin nhắn',
            operationId: 'getMessages',
            parameters: [
              { name: 'conversationId', in: 'path', required: true, schema: { type: 'string' } },
              { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
            ],
            responses: { '200': { description: 'Danh sách tin nhắn' } },
          },
        },
        '/conversations': {
          get: {
            summary: 'Lấy danh sách hội thoại',
            operationId: 'listConversations',
            responses: { '200': { description: 'Danh sách hội thoại' } },
          },
        },
        '/contacts': {
          get: {
            summary: 'Lấy danh sách liên hệ',
            operationId: 'listContacts',
            responses: { '200': { description: 'Danh sách liên hệ' } },
          },
        },
        '/messages': {
          get: {
            summary: 'Lấy tất cả tin nhắn trong khoảng thời gian (không cần conversation ID)',
            operationId: 'getMessagesByTimeRange',
            parameters: [
              { name: 'from', in: 'query', required: true, schema: { type: 'string' }, description: 'ISO 8601 start (e.g. 2026-06-08T00:00:00Z)' },
              { name: 'to', in: 'query', required: true, schema: { type: 'string' }, description: 'ISO 8601 end (e.g. 2026-06-08T23:59:59Z)' },
              { name: 'limit', in: 'query', schema: { type: 'integer', default: 200, maximum: 1000 } },
              { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Cursor cho pagination' },
              { name: 'type', in: 'query', schema: { type: 'string', enum: ['direct', 'group'] }, description: 'Lọc theo loại hội thoại' },
            ],
            responses: { '200': { description: 'Danh sách tin nhắn kèm nextCursor' } },
          },
        },
      },
    });
  });

  // ALL other routes require bot token auth
  router.use(botAuth);

  // POST /api/bot/send-message
  router.post('/send-message', async (req: Request, res: Response) => {
    const bot = req.difyBot!;
    const { conversationId, text } = req.body;

    if (!conversationId || !text) {
      res.status(400).json({ error: 'conversationId and text are required' });
      return;
    }

    const sendGroups: string[] = (bot.send_groups && Array.isArray(bot.send_groups)) ? bot.send_groups : [];
    if (sendGroups.length > 0 && !sendGroups.includes(conversationId)) {
      res.status(403).json({
        error: 'Bot khong duoc phep gui tin nhan vao group nay',
        conversationId,
        allowed_groups: sendGroups,
      });
      return;
    }

    try {
      const runtime = accountManager.getRuntime(bot.account_id);
      if (!runtime) {
        res.status(503).json({ error: 'Account not online or session not active' });
        return;
      }

      const msg = await runtime.sendText(conversationId, text);
      res.json({ ok: true, message: msg });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to send message' });
    }
  });

  // GET /api/bot/conversations/:conversationId/messages — get messages in a conversation
  router.get('/conversations/:conversationId/messages', async (req: Request, res: Response) => {
    const bot = req.difyBot!;
    const conversationId = req.params.conversationId as string;
    const limitRaw = req.query.limit;
    const limit: number = Math.min(Number(Array.isArray(limitRaw) ? limitRaw[0] : limitRaw) || 20, 100);

    try {
      const runtime = accountManager.getRuntime(bot.account_id);
      if (!runtime) {
        res.status(503).json({ error: 'Account not online' });
        return;
      }

      const messages = await runtime.getConversationMessages(conversationId, { limit });
      res.json({ conversationId, messages, count: messages.length });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to get messages' });
    }
  });

  // GET /api/bot/conversations — list conversations (contacts + groups)
  router.get('/conversations', async (req: Request, res: Response) => {
    const bot = req.difyBot!;

    try {
      const runtime = accountManager.getRuntime(bot.account_id);
      if (!runtime) {
        res.status(503).json({ error: 'Account not online' });
        return;
      }

      const conversations = await runtime.listConversations();
      res.json({ conversations });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to list conversations' });
    }
  });

  // GET /api/bot/contacts — list contacts
  router.get('/contacts', async (req: Request, res: Response) => {
    const bot = req.difyBot!;

    try {
      const runtime = accountManager.getRuntime(bot.account_id);
      if (!runtime) {
        res.status(503).json({ error: 'Account not online' });
        return;
      }

      const contacts = await runtime.listContacts();
      res.json({ contacts });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to list contacts' });
    }
  });

  // GET /api/bot/messages — lấy tất cả tin nhắn trong khoảng thời gian (không cần biết conversation)
  router.get('/messages', async (req: Request, res: Response) => {
    const bot = req.difyBot!;
    const accountId = bot.account_id;

    const fromRaw = String(req.query.from ?? '').trim();
    const toRaw = String(req.query.to ?? '').trim();
    if (!fromRaw || !toRaw) {
      res.status(400).json({ error: 'from and to are required (ISO 8601, e.g. 2026-06-08T00:00:00Z)' });
      return;
    }

    const limitRaw = req.query.limit;
    const limit: number = Math.min(Number(Array.isArray(limitRaw) ? limitRaw[0] : limitRaw) || 200, 1000);
    const cursor = String(req.query.cursor ?? '').trim() || undefined;
    const typeRaw = req.query.type;
    const conversationType = (Array.isArray(typeRaw) ? typeRaw[0] : typeRaw) as 'direct' | 'group' | undefined;
    const convIdRaw = req.query.conversationId;
    const conversationId = (Array.isArray(convIdRaw) ? convIdRaw[0] : convIdRaw) as string | undefined;

    try {
      const result = await store.listMonitorMessagesByAccountAndRange(accountId, {
        from: fromRaw,
        to: toRaw,
        limit,
        cursor,
        conversationType,
        conversationId,
      });

      res.json({
        accountId,
        from: fromRaw,
        to: toRaw,
        messages: result.items,
        count: result.items.length,
        nextCursor: result.nextCursor,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to get messages' });
    }
  });

  return router;
}
