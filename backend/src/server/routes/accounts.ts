import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import type { Knex } from 'knex';
import type { GoldLogger } from '../../core/logger.js';
import type { AccountRuntimeManager } from '../account-manager.js';
import { getStatusForRuntime } from '../helpers/status.js';
import { getRuntimeForAccount } from '../helpers/context.js';
import { SendRequestRepo } from '../../core/store/send-request-repo.js';
import { SendRequestError, SendRequestService, type NormalizedSend } from '../services/send-request-service.js';
import { SendFailure, type SendLifecycle } from '../../core/runtime/send-contract.js';

export function createAccountsRouter(
  logger: GoldLogger,
  accountManager: AccountRuntimeManager,
  broadcast: (payload: Record<string, unknown>) => void,
  upload: multer.Multer,
  knex: Knex,
  requireAuth?: (req: Request, res: Response, next: NextFunction) => void,
  requireAccountAccess?: (minRole?: string) => (req: Request, res: Response, next: NextFunction) => void,
  sendRequestService?: SendRequestService,
) {

  const router = Router();
  const needsViewer = requireAccountAccess?.('viewer');
  const needsEditor = requireAccountAccess?.('editor');

  const auth = requireAuth ? [requireAuth] : [];
  const viewAny = requireAuth && needsViewer ? [requireAuth, needsViewer] : [];
  const editAny = requireAuth && needsEditor ? [requireAuth, needsEditor] : [];
  const sendRepo = new SendRequestRepo(knex);
  const sends = sendRequestService ?? new SendRequestService(sendRepo, logger);
  const metadataInFlight = new Set<string>();
  const sendError = (res: Response, error: unknown) => {
    if (error instanceof SendRequestError || error instanceof SendFailure) {
      res.status(error instanceof SendRequestError ? error.status : error.httpStatus).json({ error: error.message, code: error.code });
    } else {
      logger.error('send_request_route_failed', { code: 'SEND_REQUEST_UNAVAILABLE' });
      res.status(503).json({ error: 'Không thể xử lý yêu cầu gửi. Kiểm tra trạng thái bằng cùng clientRequestId.', code: 'SEND_REQUEST_UNAVAILABLE' });
    }
  };
  const dispatch = async (input: NormalizedSend, lifecycle: SendLifecycle) => {
    const targetRuntime = await getRuntimeForAccount(input.accountId, accountManager);
    if (!targetRuntime.isSessionActive()) throw new SendFailure('SESSION_UNAVAILABLE', 'Phiên Zalo chưa sẵn sàng.', true, 409);
    const result = input.attachment
      ? await targetRuntime.sendAttachment(input.conversationId, { ...input.attachment, caption: input.text }, lifecycle)
      : await targetRuntime.sendText(input.conversationId, input.text, lifecycle);
    void (async () => {
      broadcast({ type: 'conversation_summaries', accountId: input.accountId, conversations: await targetRuntime.getConversationSummaries() });
      broadcast({ type: 'session_state', accountId: input.accountId, status: await getStatusForRuntime(targetRuntime) });
    })().catch(() => logger.error('send_summary_refresh_failed', { accountId: input.accountId }));
    return result;
  };

  router.get('/', ...auth, (_req, res) => {
    void (async () => {
      res.json({
        accounts: await accountManager.listAccountStatuses(),
        activeAccountId: accountManager.getPrimaryAccountId() ?? accountManager.getPreferredAccountId(),
      });
    })();
  });

  router.post('/activate', ...viewAny, (req, res) => {
    void (async () => {
      const accountId = String(req.body?.accountId ?? '').trim();
      if (!accountId) {
        res.status(400).json({ error: 'accountId la bat buoc' });
        return;
      }
      try {
        let targetRuntime = accountManager.getRuntime(accountId);
        if (!targetRuntime) {
          try {
            targetRuntime = await accountManager.ensureRuntime(accountId);
          } catch (startErr) {
            // If ensureRuntime failed (e.g. cookie expired or kicked)
            logger.error('account_activate_ensure_failed', { accountId, error: startErr instanceof Error ? startErr.message : String(startErr) });
          }
        }
        if (!targetRuntime || !targetRuntime.isSessionActive()) {
          res.status(200).json({
            ok: false,
            needsRelogin: true,
            accountId,
            error: 'Tài khoản chưa active session hoặc cookie đã hết hạn. Hãy quét lại mã QR.',
          });
          return;
        }
        await accountManager.activatePrimaryAccount(accountId);
        broadcast({ type: 'conversation_summaries', accountId, conversations: await targetRuntime.getConversationSummaries() });
        broadcast({ type: 'session_state', accountId, status: await getStatusForRuntime(targetRuntime) });
        res.json({ ok: true, accountId, status: await getStatusForRuntime(targetRuntime) });
      } catch (error) {
        res.status(200).json({
          ok: false,
          needsRelogin: true,
          error: error instanceof Error ? error.message : 'Kich hoat account that bai',
        });
      }
    })();
  });

  router.get('/:accountId/status', ...viewAny, (req, res) => {
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

  router.put('/:accountId/profile', ...editAny, (req, res) => {
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

  router.get('/:accountId/contacts', ...viewAny, (req, res) => {
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

  // POST /api/accounts/:accountId/restart — restart account runtime (reattach Dify executor)
  router.post('/:accountId/restart', ...editAny, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      try {
        const result = await accountManager.restartRuntime(accountId);
        if (!result.ok) {
          res.status(200).json({
            ok: false,
            needsRelogin: result.needsRelogin ?? false,
            error: result.error || 'Khong the khoi dong lai account Zalo. Vui long quet lai QR neu can.',
          });
          return;
        }
        res.json({ ok: true, message: 'Tai khoan da ket noi lai thanh cong.' });
      } catch (error) {
        res.status(200).json({
          ok: false,
          needsRelogin: true,
          error: error instanceof Error ? error.message : 'Restart that bai',
        });
      }
    })();
  });

  router.get('/:accountId/groups', ...viewAny, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        if (!targetRuntime.isSessionActive()) {
          res.status(401).json({ error: 'Account chua active session' });
          return;
        }
        const groupCache = await targetRuntime.getGroupCache();
        const refresh = req.query.refresh === '1';

        // DB-First: return cached groups immediately if present
        if (groupCache.length > 0 && !refresh) {
          res.json({ groups: groupCache, count: groupCache.length });
          return;
        }

        // Fetch from Zalo with timeout protection
        const groups = await Promise.race([
          targetRuntime.listGroups(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Fetch groups timeout')), 7000)),
        ]).catch(async (error) => {
          logger.error('account_groups_refresh_failed', {
            accountId,
            error: error instanceof Error ? error.message : String(error),
          });
          const fallbackGroups = await targetRuntime.getGroupCache();
          if (fallbackGroups.length > 0) return fallbackGroups;
          return [];
        });

        res.json({ groups, count: groups.length });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Tai groups that bai' });
      }
    })();
  });

  router.get('/:accountId/conversations', ...viewAny, (req, res) => {
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

  router.get('/:accountId/conversations/:conversationId/messages', ...viewAny, (req, res) => {
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
        if ((limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 1000))
          || (since && !Number.isFinite(Date.parse(since))) || (before && !Number.isFinite(Date.parse(before)))) {
          res.status(400).json({ error: 'Tham số phân trang không hợp lệ.' });
          return;
        }
        // Registry store is already available; never ensureRuntime/login on a history read.
        const rawMessages = await accountManager.getRegistryStore().listConversationMessagesByAccount(accountId, conversationId, { before, limit });
        const filtered = since ? rawMessages.filter((message) => message.timestamp > since) : rawMessages;
        const messages = await sendRepo.correlate(accountId, conversationId, filtered);
        const oldestTimestamp = messages[0]?.timestamp;
        const hasMore = Boolean(before ? messages.length === (limit ?? 40) : oldestTimestamp);
        res.json({ conversationId, messages, count: messages.length, oldestTimestamp, hasMore });
        // Bounded DB metadata enrichment is off-path and remains useful while Zalo is offline.
        const key = JSON.stringify([accountId, conversationId]);
        if (conversationId.startsWith('group:') && !metadataInFlight.has(key)) {
          metadataInFlight.add(key);
          const candidates = rawMessages.slice(-200);
          void accountManager.getRegistryStore().resolveGroupSenderNamesByAccount(accountId, conversationId, candidates)
            .then(async (enriched) => {
              const previous = new Map(candidates.map((m) => [m.id, m.senderName]));
              const changed = enriched.filter((m) => m.senderName && m.senderName !== previous.get(m.id));
              if (!changed.length) return;
              await knex.raw(`UPDATE messages AS m SET sender_name = names.sender_name
                FROM (VALUES ${changed.map(() => '(?::text, ?::text)').join(',')}) AS names(id, sender_name)
                WHERE m.account_id = ? AND m.id = names.id`, [...changed.flatMap((m) => [m.id, m.senderName!]), accountId]);
            })
            .catch(() => logger.error('history_metadata_refresh_failed', { accountId, conversationId }))
            .finally(() => metadataInFlight.delete(key));
        }
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Tai conversation that bai' });
      }
    })();
  });

  router.post('/:accountId/conversations/:conversationId/sync-metadata', ...editAny, (req, res) => {
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

  router.post('/:accountId/conversations/sync-history', ...editAny, (req, res) => {
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

  router.post('/:accountId/mobile-sync-thread', ...editAny, (req, res) => {
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

  router.post('/:accountId/mobile-sync', ...editAny, (req, res) => {
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

  router.post('/:accountId/sync-all', ...editAny, (req, res) => {
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

  router.get('/:accountId/send-requests/:clientRequestId', ...editAny, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      try {
        const userId = (req as Request & { systemUserId?: string }).systemUserId;
        if (!userId) throw new SendRequestError(401, 'UNAUTHENTICATED', 'Yêu cầu xác thực.');
        const user = await knex('system_users').where('id', userId).select('role').first();
        const membership = await knex('zalo_account_memberships').where({ user_id: userId, account_id: accountId }).select('role').first();
        if (user?.role !== 'super_admin' && !['editor', 'admin', 'master'].includes(membership?.role)) {
          throw new SendRequestError(403, 'FORBIDDEN', 'Cần quyền editor để xem trạng thái gửi.');
        }
        const privileged = user?.role === 'super_admin' || ['admin', 'master'].includes(membership?.role);
        const receipt = await sends.get(accountId, req.params.clientRequestId, userId, privileged);
        const unresolved = receipt.status === 'sending' || receipt.status === 'unknown';
        if (unresolved) res.setHeader('Retry-After', '2');
        res.status(unresolved ? 202 : 200).json({ receipt });
      } catch (error) { sendError(res, error); }
    })();
  });

  router.post('/:accountId/send', ...editAny, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      try {
        const body = req.body ?? {};
        let attachment;
        if (body.imageBase64) {
          if (typeof body.imageBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.imageBase64)
            || typeof body.imageFileName !== 'string' || typeof body.imageMimeType !== 'string') {
            throw new SendRequestError(400, 'INVALID_ATTACHMENT', 'Dữ liệu ảnh base64 không hợp lệ.');
          }
          attachment = { fileBuffer: Buffer.from(body.imageBase64, 'base64'), fileName: body.imageFileName, mimeType: body.imageMimeType };
        }
        const result = await sends.send({ accountId, systemUserId: (req as any).systemUserId,
          conversationId: body.conversationId, text: body.text, attachment,
          clientRequestId: body.clientRequestId, retry: body.retry }, dispatch);
        if (result.status === 202) res.setHeader('Retry-After', '2');
        res.status(result.status).json(result.body);
      } catch (error) { sendError(res, error); }
    })();
  });

  // Authorization deliberately precedes multipart allocation/parsing.
  router.post('/:accountId/send-attachment', ...editAny, (req, res, next) => {
    upload.single('file')(req, res, (error: unknown) => {
      if (error) {
        const tooLarge = (error as { code?: string }).code === 'LIMIT_FILE_SIZE';
        res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? 'File vượt quá 50 MB.' : 'Dữ liệu multipart không hợp lệ.', code: 'INVALID_ATTACHMENT' });
      } else next();
    });
  }, (req, res) => {
    void (async () => {
      try {
        if (!req.file) throw new SendRequestError(400, 'INVALID_ATTACHMENT', 'File là bắt buộc.');
        const result = await sends.send({ accountId: String(req.params.accountId ?? '').trim(),
          systemUserId: (req as any).systemUserId, conversationId: req.body?.conversationId, text: req.body?.caption,
          clientRequestId: req.body?.clientRequestId, retry: req.body?.retry,
          attachment: { fileBuffer: req.file.buffer, fileName: req.file.originalname, mimeType: req.file.mimetype } }, dispatch);
        if (result.status === 202) res.setHeader('Retry-After', '2');
        res.status(result.status).json(result.body);
      } catch (error) { sendError(res, error); }
    })();
  });

  router.post('/:accountId/conversations/:conversationId/sticker', ...editAny, (req, res) => {
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

  router.post('/:accountId/conversations/:conversationId/typing', ...editAny, (req, res) => {
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

  router.post('/:accountId/conversations/:conversationId/reaction', ...editAny, (req, res) => {
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

  router.put('/:accountId/conversations/:conversationId/notes', ...editAny, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.params.conversationId ?? '').trim();
      const notes = typeof req.body?.notes === 'string' ? req.body.notes : null;
      const updatedBy = (req as any).user?.username || (req as any).user?.email || 'sales';
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        const updated = await targetRuntime.store.conversationRepo.updateConversationNotes(
          accountId,
          conversationId,
          notes,
          updatedBy,
        );

        broadcast({
          type: 'conversation_notes_updated',
          accountId,
          conversationId,
          notes: updated?.notes ?? null,
          notesUpdatedBy: updated?.notesUpdatedBy ?? null,
          notesUpdatedAt: updated?.notesUpdatedAt ?? null,
        });

        // Also broadcast updated conversation summaries so sidebar/list is fresh
        broadcast({
          type: 'conversation_summaries',
          accountId,
          conversations: await targetRuntime.getConversationSummaries(),
        });

        res.json({
          ok: true,
          conversationId,
          notes: updated?.notes ?? null,
          notesUpdatedBy: updated?.notesUpdatedBy ?? null,
          notesUpdatedAt: updated?.notesUpdatedAt ?? null,
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Cap nhat ghi chu that bai' });
      }
    })();
  });

  router.post('/:accountId/conversations/:conversationId/read-state', ...viewAny, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.params.conversationId ?? '').trim();
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        const requestedReadAt = typeof req.body?.readAt === 'string' ? req.body.readAt.trim() : '';
        const readAt = requestedReadAt && Number.isFinite(Date.parse(requestedReadAt))
          ? new Date(requestedReadAt).toISOString()
          : new Date().toISOString();
        logger.info('read_state_update_request', { accountId, conversationId, requestedReadAt, readAt });
        const updateResult = await knex.raw(
          `INSERT INTO conversation_read_state (account_id, conversation_id, last_read_at, updated_at)
           VALUES (?, ?, ?, NOW())
           ON CONFLICT (account_id, conversation_id) DO UPDATE SET
             last_read_at = EXCLUDED.last_read_at,
             updated_at = NOW()`,
          [accountId, conversationId, readAt],
        );

        logger.info('read_state_update_persisted', {
          accountId,
          conversationId,
          readAt,
          rowCount: typeof updateResult?.rowCount === 'number' ? updateResult.rowCount : undefined,
        });

        broadcast({ type: 'conversation_summaries', accountId, conversations: await targetRuntime.getConversationSummaries() });

        res.json({ ok: true, readAt });
      } catch (error) {
        logger.error('read_state_update_failed', {
          accountId,
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Cap nhat read state that bai' });
      }
    })();
  });

  router.post('/:accountId/groups/:groupId/poll', ...editAny, (req, res) => {
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

  router.post('/:accountId/conversations/:conversationId/forward', ...editAny, (req, res) => {
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
