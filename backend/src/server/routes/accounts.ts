import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import type { GoldLogger } from '../../core/logger.js';
import type { AccountRuntimeManager } from '../account-manager.js';
import { getStatusForRuntime } from '../helpers/status.js';
import { getRuntimeForAccount } from '../helpers/context.js';

export function createAccountsRouter(
  logger: GoldLogger,
  accountManager: AccountRuntimeManager,
  broadcast: (payload: Record<string, unknown>) => void,
  upload: multer.Multer,
  requireAuth?: (req: Request, res: Response, next: NextFunction) => void,
  requireAccountAccess?: (minRole?: string) => (req: Request, res: Response, next: NextFunction) => void,
) {

  const router = Router();
  const needsEditor = requireAccountAccess?.('editor');

  router.get('/', (_req, res) => {
    void (async () => {
      res.json({
        accounts: await accountManager.listAccountStatuses(),
        activeAccountId: accountManager.getPrimaryAccountId() ?? accountManager.getPreferredAccountId(),
      });
    })();
  });

  router.post('/activate', (req, res) => {
    void (async () => {
      const accountId = String(req.body?.accountId ?? '').trim();
      if (!accountId) {
        res.status(400).json({ error: 'accountId la bat buoc' });
        return;
      }
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        if (!targetRuntime.isSessionActive()) {
          res.status(401).json({ error: 'Account chua active session. Hay dang nhap lai bang QR.' });
          return;
        }
        await accountManager.activatePrimaryAccount(accountId);
        broadcast({ type: 'conversation_summaries', accountId, conversations: await targetRuntime.getConversationSummaries() });
        broadcast({ type: 'session_state', accountId, status: await getStatusForRuntime(targetRuntime) });
        res.json({ ok: true, accountId, status: await getStatusForRuntime(targetRuntime) });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Kich hoat account that bai' });
      }
    })();
  });

  router.get('/:accountId/status', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      if (!accountId) {
        res.status(400).json({ error: 'accountId la bat buoc' });
        return;
      }
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        if (await targetRuntime.hasCredential() && !targetRuntime.isSessionActive()) {
          await targetRuntime.loginWithStoredCredential().catch((error) => {
            logger.error('account_status_reconnect_failed', { accountId, error: error instanceof Error ? error.message : String(error) });
          });
        }
        if (await targetRuntime.hasCredential() && !(await targetRuntime.getCurrentAccount())) {
          await targetRuntime.fetchAccountInfo().catch((error) => {
            logger.error('account_status_profile_fetch_failed', { accountId, error: error instanceof Error ? error.message : String(error) });
          });
        }
        res.json(await getStatusForRuntime(targetRuntime));
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Tai status account that bai' });
      }
    })();
  });

  router.put('/:accountId/profile', (req, res) => {
    const accountId = String(req.params.accountId ?? '').trim();
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    const hubAlias = typeof req.body?.hubAlias === 'string' ? req.body.hubAlias.trim() : '';
    if (!accountId) {
      res.status(400).json({ error: 'accountId la bat buoc' });
      return;
    }
    if (!displayName && req.body?.displayName !== undefined && !hubAlias && req.body?.hubAlias === undefined) {
      res.status(400).json({ error: 'Khong co du lieu profile de cap nhat' });
      return;
    }

    void (async () => {
      try {
        await accountManager.getRegistryStore().updateAccountProfile(accountId, {
          displayName: displayName || undefined,
          hubAlias: req.body?.hubAlias !== undefined ? (hubAlias || undefined) : undefined,
        });
        const runtime = accountManager.getRuntime(accountId);
        if (displayName && runtime) {
          const currentAccount = await runtime.getCurrentAccount();
          if (currentAccount) {
            currentAccount.displayName = displayName;
          }
        }

        const allAccounts = await accountManager.getRegistryStore().listAccounts();
        res.json({
          ok: true,
          account: allAccounts.find((account) => account.accountId === accountId),
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Cap nhat account that bai' });
      }
    })();
  });

  router.get('/:accountId/contacts', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        if (!targetRuntime.isSessionActive()) {
          res.status(401).json({ error: 'Account chua active session' });
          return;
        }
        const refresh = req.query.refresh === '1';
        const contactCache = await targetRuntime.getContactCache();
        const contacts = refresh || contactCache.length === 0
          ? await targetRuntime.listFriends()
          : contactCache;
        res.json({ contacts, count: contacts.length });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Tai contacts that bai' });
      }
    })();
  });

  router.get('/:accountId/groups', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        if (!targetRuntime.isSessionActive()) {
          res.status(401).json({ error: 'Account chua active session' });
          return;
        }
        const refresh = req.query.refresh === '1';
        const groupCache = await targetRuntime.getGroupCache();
        const groups = refresh || groupCache.length === 0
          ? await targetRuntime.listGroups().catch(async (error) => {
              logger.error('account_groups_refresh_failed', {
                accountId,
                error: error instanceof Error ? error.message : String(error),
              });
              const fallbackGroups = await targetRuntime.getGroupCache();
              if (fallbackGroups.length > 0) return fallbackGroups;
              throw error;
            })
          : groupCache;
        res.json({ groups, count: groups.length });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Tai groups that bai' });
      }
    })();
  });

  router.get('/:accountId/conversations', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        if (!targetRuntime.isSessionActive()) {
          res.status(401).json({ error: 'Account chua active session' });
          return;
        }
        const conversations = await targetRuntime.getConversationSummaries();
        res.json({ conversations, count: conversations.length });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Tai conversations that bai' });
      }
    })();
  });

  router.get('/:accountId/conversations/:conversationId/messages', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.params.conversationId ?? '').trim();
      const since = typeof req.query.since === 'string' ? req.query.since : undefined;
      const before = typeof req.query.before === 'string' ? req.query.before : undefined;
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
      if (!conversationId) {
        res.status(400).json({ error: 'conversationId la bat buoc' });
        return;
      }
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        if (!targetRuntime.isSessionActive()) {
          res.status(401).json({ error: 'Account chua active session' });
          return;
        }
        const messages = await targetRuntime.getConversationMessages(conversationId, { since, before, limit });
        const oldestTimestamp = messages[0]?.timestamp;
        const hasMore = Boolean(before ? messages.length === (limit ?? 40) : oldestTimestamp);
        res.json({ conversationId, messages, count: messages.length, oldestTimestamp, hasMore });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Tai conversation that bai' });
      }
    })();
  });

  router.post('/:accountId/conversations/:conversationId/sync-metadata', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.params.conversationId ?? '').trim();
      if (!conversationId) {
        res.status(400).json({ error: 'conversationId la bat buoc' });
        return;
      }
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        if (!targetRuntime.isSessionActive()) {
          res.status(401).json({ error: 'Account chua active session' });
          return;
        }
        const result = await targetRuntime.syncConversationMetadata(conversationId);
        broadcast({ type: 'conversation_summaries', accountId, conversations: await targetRuntime.getConversationSummaries() });
        broadcast({ type: 'session_state', accountId, status: await getStatusForRuntime(targetRuntime) });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Sync metadata that bai' });
      }
    })();
  });

  router.post('/:accountId/conversations/sync-history', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.body?.conversationId ?? '').trim();
      const beforeMessageId = typeof req.body?.beforeMessageId === 'string' ? req.body.beforeMessageId.trim() : undefined;
      const timeoutMs = typeof req.body?.timeoutMs === 'number' ? req.body.timeoutMs : undefined;
      if (!conversationId) {
        res.status(400).json({ error: 'conversationId la bat buoc' });
        return;
      }
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        if (!targetRuntime.isSessionActive()) {
          res.status(401).json({ error: 'Account chua active session' });
          return;
        }
        const result = await targetRuntime.syncConversationHistory(conversationId, { beforeMessageId, timeoutMs });
        broadcast({ type: 'conversation_summaries', accountId, conversations: await targetRuntime.getConversationSummaries() });
        broadcast({ type: 'session_state', accountId, status: await getStatusForRuntime(targetRuntime) });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Sync history that bai' });
      }
    })();
  });

  router.post('/:accountId/mobile-sync-thread', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const threadId = String(req.body?.threadId ?? '').trim();
      const threadType = String(req.body?.threadType ?? 'direct').trim() as 'direct' | 'group';
      const timeoutMs = typeof req.body?.timeoutMs === 'number' ? req.body.timeoutMs : undefined;
      if (!threadId) {
        res.status(400).json({ error: 'threadId la bat buoc' });
        return;
      }
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        if (!targetRuntime.isSessionActive()) {
          res.status(401).json({ error: 'Account chua active session' });
          return;
        }
        const result = await targetRuntime.requestMobileSyncThread(threadId, threadType, { timeoutMs });
        broadcast({ type: 'conversation_summaries', accountId, conversations: await targetRuntime.getConversationSummaries() });
        broadcast({ type: 'session_state', accountId, status: await getStatusForRuntime(targetRuntime) });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Mobile sync thread that bai' });
      }
    })();
  });

  router.post('/:accountId/mobile-sync', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const perThreadTimeoutMs = typeof req.body?.perThreadTimeoutMs === 'number' ? req.body.perThreadTimeoutMs : undefined;
      const maxTotalTimeMs = typeof req.body?.maxTotalTimeMs === 'number' ? req.body.maxTotalTimeMs : undefined;
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        if (!targetRuntime.isSessionActive()) {
          res.status(401).json({ error: 'Account chua active session' });
          return;
        }
        const result = await targetRuntime.mobileSyncAllAccountConversations({ perThreadTimeoutMs, maxTotalTimeMs });
        broadcast({ type: 'conversation_summaries', accountId, conversations: await targetRuntime.getConversationSummaries() });
        broadcast({ type: 'session_state', accountId, status: await getStatusForRuntime(targetRuntime) });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Mobile sync all that bai' });
      }
    })();
  });

  router.post('/:accountId/sync-all', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        if (!targetRuntime.isSessionActive()) {
          res.status(401).json({ error: 'Account chua active session' });
          return;
        }
        const result = await targetRuntime.syncAllAccountConversations();
        broadcast({ type: 'conversation_summaries', accountId, conversations: await targetRuntime.getConversationSummaries() });
        broadcast({ type: 'session_state', accountId, status: await getStatusForRuntime(targetRuntime) });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Sync all that bai' });
      }
    })();
  });

  router.post('/:accountId/send', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.body?.conversationId ?? '').trim();
      const text = String(req.body?.text ?? '').trim();
      const imageBase64 = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64.trim() : '';
      const imageFileName = typeof req.body?.imageFileName === 'string' ? req.body.imageFileName.trim() : '';
      const imageMimeType = typeof req.body?.imageMimeType === 'string' ? req.body.imageMimeType.trim() : '';
      if (!conversationId) {
        res.status(400).json({ error: 'conversationId la bat buoc' });
        return;
      }
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        if (!targetRuntime.isSessionActive()) {
          res.status(401).json({ error: 'Account chua active session' });
          return;
        }
        let result;
        if (imageBase64) {
          if (!imageFileName || !imageMimeType) {
            res.status(400).json({ error: 'imageFileName va imageMimeType la bat buoc khi gui anh' });
            return;
          }
          result = await targetRuntime.sendImage(conversationId, {
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
          result = await targetRuntime.sendText(conversationId, text);
        }
        broadcast({ type: 'conversation_summaries', accountId, conversations: await targetRuntime.getConversationSummaries() });
        broadcast({ type: 'session_state', accountId, status: await getStatusForRuntime(targetRuntime) });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Gui tin that bai' });
      }
    })();
  });

  router.post('/:accountId/send-attachment', upload.single('file'), (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
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
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        if (!targetRuntime.isSessionActive()) {
          res.status(401).json({ error: 'Account chua active session' });
          return;
        }
        const result = await targetRuntime.sendAttachment(conversationId, {
          fileBuffer: req.file.buffer,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          caption: caption || undefined,
        });
        broadcast({ type: 'conversation_summaries', accountId, conversations: await targetRuntime.getConversationSummaries() });
        broadcast({ type: 'session_state', accountId, status: await getStatusForRuntime(targetRuntime) });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Gui file that bai' });
      }
    })();
  });

  router.post('/:accountId/conversations/:conversationId/sticker', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.params.conversationId ?? '').trim();
      const stickerId = String(req.body?.stickerId ?? '').trim();
      const catId = String(req.body?.catId ?? '').trim();
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        const result = await targetRuntime.sendSticker(conversationId, stickerId, catId);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Gui sticker that bai' });
      }
    })();
  });

  router.post('/:accountId/conversations/:conversationId/typing', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.params.conversationId ?? '').trim();
      const isTyping = Boolean(req.body?.isTyping);
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        await targetRuntime.sendTypingEvent(conversationId, isTyping);
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: 'Gui typing event that bai' });
      }
    })();
  });

  router.post('/:accountId/conversations/:conversationId/reaction', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.params.conversationId ?? '').trim();
      const messageId = String(req.body?.messageId ?? '').trim();
      const cliMsgId = String(req.body?.cliMsgId ?? '').trim();
      const reactionIcon = String(req.body?.icon ?? '').trim();
      if (!messageId || !cliMsgId || !reactionIcon) {
        res.status(400).json({ error: 'messageId, cliMsgId va icon la bat buoc' });
        return;
      }
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        const result = await targetRuntime.addReaction(conversationId, messageId, cliMsgId, reactionIcon);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Gui reaction that bai' });
      }
    })();
  });

  router.post('/:accountId/conversations/:conversationId/mark-read', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.params.conversationId ?? '').trim();
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        const target = targetRuntime.resolveConversationTarget(conversationId);
        await targetRuntime.markConversationRead(target.threadId, target.type === 'group');
        res.json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Mark read that bai' });
      }
    })();
  });

  router.post('/:accountId/groups/:groupId/poll', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const groupId = String(req.params.groupId ?? '').trim();
      const question = String(req.body?.question ?? '').trim();
      const options = Array.isArray(req.body?.options) ? req.body.options.map(String) : [];
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        const result = await targetRuntime.createPoll(groupId, question, options);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Tao poll that bai' });
      }
    })();
  });

  router.post('/:accountId/conversations/:conversationId/forward', (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.params.conversationId ?? '').trim();
      const messageId = String(req.body?.messageId ?? '').trim();
      const toThreadId = String(req.body?.toThreadId ?? '').trim();
      const toType = String(req.body?.toType ?? 'direct').trim() as 'direct' | 'group';
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        const result = await targetRuntime.forwardMessage(messageId, toThreadId, toType);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Forward that bai' });
      }
    })();
  });

  return router;
}
