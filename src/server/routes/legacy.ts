import { Router } from 'express';
import multer from 'multer';
import type { GoldLogger } from '../../core/logger.js';
import type { AccountRuntimeManager } from '../account-manager.js';
import { getStatusForRuntime } from '../helpers/status.js';
import { getLegacyPrimaryContextOrRespond } from '../helpers/context.js';

export function createLegacyRouter(
  logger: GoldLogger,
  accountManager: AccountRuntimeManager,
  broadcast: (payload: Record<string, unknown>) => void,
  upload: multer.Multer,
) {

  const router = Router();

  router.get('/friends', (req, res) => {
    void (async () => {
      const context = await getLegacyPrimaryContextOrRespond(res, accountManager, '/api/accounts/:accountId/contacts');
      if (!context) return;
      try {
        const refresh = req.query.refresh === '1';
        const friends = refresh || context.runtime.getContactCache().length === 0
          ? await context.runtime.listFriends()
          : context.runtime.getContactCache();
        if (!context.runtime.getCurrentAccount()) {
          await context.runtime.fetchAccountInfo().catch((error) => {
            logger.error('gold2_friends_account_fetch_failed', error);
          });
        }
        res.json({ friends, count: friends.length });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Tai friends that bai' });
      }
    })();
  });

  router.get('/contacts', (req, res) => {
    void (async () => {
      const context = await getLegacyPrimaryContextOrRespond(res, accountManager, '/api/accounts/:accountId/contacts');
      if (!context) return;
      try {
        const refresh = req.query.refresh === '1';
        const contacts = refresh || context.runtime.getContactCache().length === 0
          ? await context.runtime.listFriends()
          : context.runtime.getContactCache();
        res.json({ contacts, count: contacts.length });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Tai contacts that bai' });
      }
    })();
  });

  router.get('/groups', (req, res) => {
    void (async () => {
      const context = await getLegacyPrimaryContextOrRespond(res, accountManager, '/api/accounts/:accountId/groups');
      if (!context) return;
      try {
        const refresh = req.query.refresh === '1';
        const groups = refresh || context.runtime.getGroupCache().length === 0
          ? await context.runtime.listGroups()
          : context.runtime.getGroupCache();
        res.json({ groups, count: groups.length });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Tai groups that bai' });
      }
    })();
  });

  router.get('/conversations/:conversationId/messages', (req, res) => {
    void (async () => {
      const context = await getLegacyPrimaryContextOrRespond(res, accountManager, '/api/accounts/:accountId/conversations/:conversationId/messages');
      if (!context) return;
      const conversationId = String(req.params.conversationId ?? '').trim();
      const since = typeof req.query.since === 'string' ? req.query.since : undefined;
      const before = typeof req.query.before === 'string' ? req.query.before : undefined;
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
      if (!conversationId) {
        res.status(400).json({ error: 'conversationId la bat buoc' });
        return;
      }
      try {
        const messages = context.runtime.getConversationMessages(conversationId, { since, before, limit });
        const oldestTimestamp = messages[0]?.timestamp;
        const hasMore = Boolean(before ? messages.length === (limit ?? 40) : oldestTimestamp);
        res.json({ conversationId, messages, count: messages.length, oldestTimestamp, hasMore });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Tai conversation that bai' });
      }
    })();
  });

  router.post('/conversations/:conversationId/sync-metadata', (req, res) => {
    void (async () => {
      const context = await getLegacyPrimaryContextOrRespond(res, accountManager, '/api/accounts/:accountId/conversations/:conversationId/sync-metadata');
      if (!context) return;
      const conversationId = String(req.params.conversationId ?? '').trim();
      if (!conversationId) {
        res.status(400).json({ error: 'conversationId la bat buoc' });
        return;
      }
      try {
        const result = await context.runtime.syncConversationMetadata(conversationId);
        broadcast({ type: 'conversation_summaries', accountId: context.accountId, conversations: context.runtime.getConversationSummaries() });
        broadcast({ type: 'session_state', accountId: context.accountId, status: getStatusForRuntime(context.runtime) });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Sync metadata that bai' });
      }
    })();
  });

  router.post('/conversations/sync-history', (req, res) => {
    void (async () => {
      const context = await getLegacyPrimaryContextOrRespond(res, accountManager, '/api/accounts/:accountId/conversations/sync-history');
      if (!context) return;
      const conversationId = String(req.body?.conversationId ?? '').trim();
      const beforeMessageId = typeof req.body?.beforeMessageId === 'string' ? req.body.beforeMessageId.trim() : undefined;
      const timeoutMs = typeof req.body?.timeoutMs === 'number' ? req.body.timeoutMs : undefined;
      if (!conversationId) {
        res.status(400).json({ error: 'conversationId la bat buoc' });
        return;
      }
      try {
        const result = await context.runtime.syncConversationHistory(conversationId, { beforeMessageId, timeoutMs });
        broadcast({ type: 'conversation_summaries', accountId: context.accountId, conversations: context.runtime.getConversationSummaries() });
        broadcast({ type: 'session_state', accountId: context.accountId, status: getStatusForRuntime(context.runtime) });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Sync history that bai' });
      }
    })();
  });

  router.get('/conversations', (_req, res) => {
    void (async () => {
      const context = await getLegacyPrimaryContextOrRespond(res, accountManager, '/api/accounts/:accountId/conversations');
      if (!context) return;
      try {
        const conversations = context.runtime.getConversationSummaries();
        res.json({ conversations, count: conversations.length });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Tai conversations that bai' });
      }
    })();
  });

  router.post('/send', (req, res) => {
    void (async () => {
      const context = await getLegacyPrimaryContextOrRespond(res, accountManager, '/api/accounts/:accountId/send');
      if (!context) return;
      const conversationId = String(req.body?.conversationId ?? '').trim();
      const text = String(req.body?.text ?? '').trim();
      const imageBase64 = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64.trim() : '';
      const imageFileName = typeof req.body?.imageFileName === 'string' ? req.body.imageFileName.trim() : '';
      const imageMimeType = typeof req.body?.imageMimeType === 'string' ? req.body.imageMimeType.trim() : '';
      logger.info('gold2_send_requested', { conversationId, textLength: text.length, hasImage: Boolean(imageBase64), imageFileName, imageMimeType, imageBase64Length: imageBase64.length });
      if (!conversationId) {
        res.status(400).json({ error: 'conversationId la bat buoc' });
        return;
      }
      try {
        let result;
        if (imageBase64) {
          if (!imageFileName || !imageMimeType) {
            res.status(400).json({ error: 'imageFileName va imageMimeType la bat buoc khi gui anh' });
            return;
          }
          result = await context.runtime.sendImage(conversationId, {
            imageBuffer: Buffer.from(imageBase64, 'base64'),
            fileName: imageFileName,
            mimeType: imageMimeType,
            caption: text || undefined,
          });
        } else {
          if (!text) {
            res.status(400).json({ error: 'Can co text hoac image de gui' });
            return;
          }
          result = await context.runtime.sendText(conversationId, text);
        }
        broadcast({ type: 'conversation_summaries', accountId: context.accountId, conversations: context.runtime.getConversationSummaries() });
        broadcast({ type: 'session_state', accountId: context.accountId, status: getStatusForRuntime(context.runtime) });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Gui tin that bai' });
      }
    })();
  });

  router.post('/send-attachment', upload.single('file'), (req, res) => {
    void (async () => {
      const context = await getLegacyPrimaryContextOrRespond(res, accountManager, '/api/accounts/:accountId/send-attachment');
      if (!context) return;
      const conversationId = String(req.body?.conversationId ?? '').trim();
      const caption = String(req.body?.caption ?? '').trim();
      if (!conversationId) {
        res.status(400).json({ error: 'conversationId la bat buoc' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'File la bat buoc' });
        return;
      }
      logger.info('gold2_send_attachment_requested', { conversationId, fileName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size });
      try {
        const result = await context.runtime.sendAttachment(conversationId, {
          fileBuffer: req.file.buffer,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          caption: caption || undefined,
        });
        broadcast({ type: 'conversation_summaries', accountId: context.accountId, conversations: context.runtime.getConversationSummaries() });
        broadcast({ type: 'session_state', accountId: context.accountId, status: getStatusForRuntime(context.runtime) });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Gui file that bai' });
      }
    })();
  });

  router.post('/media/backfill', (_req, res) => {
    void (async () => {
      const context = await getLegacyPrimaryContextOrRespond(res, accountManager, '/api/accounts/:accountId/conversations');
      if (!context) return;
      try {
        const result = await context.runtime.backfillMediaForStoredMessages();
        broadcast({ type: 'conversation_summaries', accountId: context.accountId, conversations: context.runtime.getConversationSummaries() });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Backfill media that bai' });
      }
    })();
  });

  return router;
}
