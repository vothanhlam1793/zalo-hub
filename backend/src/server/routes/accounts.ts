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
import { canUserAccessConversation, filterConversationsForUser } from '../helpers/conversation-access.js';
import { IndexedDbImporter } from '../../core/indexeddb-importer.js';
import { PlaywrightSyncWorker } from '../../core/playwright-sync-worker.js';
import { PlaywrightQrLogin } from '../../core/playwright-qr.js';

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
  const indexedDbImporter = new IndexedDbImporter(knex, logger);
  const playwrightSyncWorker = new PlaywrightSyncWorker(indexedDbImporter, logger);
  const activeQrSessions = new Map<string, PlaywrightQrLogin>();

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
      : await targetRuntime.sendText(input.conversationId, input.text, {
          mentions: input.mentions,
          quoteMessageId: input.quoteMessageId,
        }, lifecycle);
    
    // Background async broadcast — does not block or add latency to HTTP Send response
    setImmediate(() => {
      void (async () => {
        broadcast({ type: 'conversation_summaries', accountId: input.accountId, conversations: await targetRuntime.getConversationSummaries() });
        broadcast({ type: 'session_state', accountId: input.accountId, status: await getStatusForRuntime(targetRuntime) });
      })().catch(() => logger.error('send_summary_refresh_failed', { accountId: input.accountId }));
    });

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
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager).catch(() => undefined);
        const refresh = req.query.refresh === '1';

        if (targetRuntime && targetRuntime.isSessionActive()) {
          const contactCache = await targetRuntime.getContactCache();
          const contacts = refresh || contactCache.length === 0
            ? await targetRuntime.listFriends().catch(() => contactCache)
            : contactCache;
          res.json({ contacts, count: contacts.length });
          return;
        }

        // Offline / Inactive session fallback to DB store
        const offlineContacts = await accountManager.getRegistryStore().listContactsByAccount(accountId).catch(() => []);
        res.json({ contacts: offlineContacts, count: offlineContacts.length, offline: true });
      } catch (error) {
        logger.warn('account_contacts_fallback', { accountId, error: error instanceof Error ? error.message : String(error) });
        const offlineContacts = await accountManager.getRegistryStore().listContactsByAccount(accountId).catch(() => []);
        res.json({ contacts: offlineContacts, count: offlineContacts.length, offline: true });
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
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager).catch(() => undefined);
        const refresh = req.query.refresh === '1';

        if (targetRuntime && targetRuntime.isSessionActive()) {
          const groupCache = await targetRuntime.getGroupCache();
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
          return;
        }

        // Offline / Inactive session fallback to DB store
        const offlineGroups = await accountManager.getRegistryStore().listGroupsByAccount(accountId).catch(() => []);
        res.json({ groups: offlineGroups, count: offlineGroups.length, offline: true });
      } catch (error) {
        logger.warn('account_groups_fallback', { accountId, error: error instanceof Error ? error.message : String(error) });
        const offlineGroups = await accountManager.getRegistryStore().listGroupsByAccount(accountId).catch(() => []);
        res.json({ groups: offlineGroups, count: offlineGroups.length, offline: true });
      }
    })();
  });

  router.get('/:accountId/conversations', ...viewAny, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const userId = (req as any).systemUserId as string;
      try {
        let conversations: any[] = [];
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager).catch(() => undefined);
        if (targetRuntime && targetRuntime.isSessionActive()) {
          conversations = await targetRuntime.getConversationSummaries().catch(() => []);
        }

        if (conversations.length === 0) {
          // Offline / Inactive session fallback to DB store
          conversations = await accountManager.getRegistryStore().listConversationSummariesByAccount(accountId).catch(() => []);
        }

        if (userId) {
          conversations = await filterConversationsForUser(knex, userId, accountId, conversations);
        }

        res.json({ conversations, count: conversations.length });
      } catch (error) {
        logger.warn('account_conversations_fallback', { accountId, error: error instanceof Error ? error.message : String(error) });
        let offlineConversations = await accountManager.getRegistryStore().listConversationSummariesByAccount(accountId).catch(() => []);
        if (userId) {
          offlineConversations = await filterConversationsForUser(knex, userId, accountId, offlineConversations);
        }
        res.json({ conversations: offlineConversations, count: offlineConversations.length, offline: true });
      }
    })();
  });

  router.get('/:accountId/conversations/:conversationId/messages', ...viewAny, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.params.conversationId ?? '').trim();
      const userId = (req as any).systemUserId as string;
      const since = typeof req.query.since === 'string' ? req.query.since : undefined;
      const before = typeof req.query.before === 'string' ? req.query.before : undefined;
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
      if (!conversationId) {
        res.status(400).json({ error: 'conversationId la bat buoc' });
        return;
      }
      try {
        if (userId) {
          const allowed = await canUserAccessConversation(knex, userId, accountId, conversationId);
          if (!allowed) {
            res.status(403).json({ error: 'Bạn không có quyền truy cập cuộc trò chuyện này' });
            return;
          }
        }

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

  router.post('/:accountId/re-sync-qr', ...viewAny, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      try {
        logger.info('resync_qr_start_requested', { accountId });
        const existing = activeQrSessions.get(accountId);
        if (existing) {
          await existing.cancel().catch(() => {});
          activeQrSessions.delete(accountId);
        }

        const qrHandler = new PlaywrightQrLogin(logger, indexedDbImporter);
        activeQrSessions.set(accountId, qrHandler);

        const qrBase64 = await qrHandler.start();

        // Background monitor for scan & import
        setImmediate(async () => {
          try {
            const loginRes = await qrHandler.waitForLoginAndImport(120_000, (prog) => {
              broadcast({
                type: 'ws_sync_progress',
                accountId,
                ...prog,
              });
            });

            // Update session in database
            if (loginRes.cookies.length > 0) {
              const cookiesJson = JSON.stringify(loginRes.cookies);
              await knex('account_sessions')
                .where({ account_id: accountId })
                .update({
                  cookie_json: cookiesJson,
                  is_active: 1,
                  updated_at: knex.fn.now(),
                })
                .catch(() => undefined);

              // Restart account runtime with new credentials
              await accountManager.restartRuntime(accountId).catch(() => undefined);
              const targetRuntime = accountManager.getRuntime(accountId);
              if (targetRuntime) {
                const summaries = await targetRuntime.getConversationSummaries();
                broadcast({ type: 'conversation_summaries', accountId, conversations: summaries });
              }
            }
          } catch (bgErr) {
            logger.warn('resync_qr_background_err', { accountId, error: String(bgErr) });
            broadcast({
              type: 'ws_sync_progress',
              accountId,
              step: 'error',
              percent: 0,
              message: 'Hết thời gian quét QR hoặc lỗi phiên đồng bộ',
            });
          } finally {
            await qrHandler.cleanup().catch(() => {});
            activeQrSessions.delete(accountId);
          }
        });

        res.json({
          ok: true,
          qrCode: `data:image/png;base64,${qrBase64}`,
          message: 'Quét mã QR bằng Zalo trên điện thoại và chọn Đồng bộ ngay',
        });
      } catch (err: any) {
        logger.error('resync_qr_start_failed', { accountId, error: err?.message || String(err) });
        res.status(500).json({ error: err?.message || 'Không thể tạo mã QR đồng bộ' });
      }
    })();
  });

  router.post('/:accountId/re-sync-cancel', ...viewAny, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const existing = activeQrSessions.get(accountId);
      if (existing) {
        await existing.cancel().catch(() => {});
        activeQrSessions.delete(accountId);
      }
      res.json({ ok: true });
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

        const credential = await accountManager.getRegistryStore().getCredentialForAccount(accountId);
        if (!credential) {
          res.status(400).json({ error: 'Chua co credential cho account nay de dong bo' });
          return;
        }

        // Báo trạng thái bắt đầu qua WebSocket
        broadcast({
          type: 'ws_sync_progress',
          accountId,
          step: 'connecting',
          percent: 5,
          message: 'Đang khởi động phiên đồng bộ Zalo Web...',
        });

        // Chạy Worker Playwright Sync ngầm trong nền
        setImmediate(async () => {
          try {
            await playwrightSyncWorker.runSync(accountId, credential, (update) => {
              broadcast({
                type: 'ws_sync_progress',
                accountId,
                ...update,
              });
            });

            // Sau khi Playwright nạp xong, reload danh sách hội thoại
            const summaries = await targetRuntime.getConversationSummaries();
            broadcast({ type: 'conversation_summaries', accountId, conversations: summaries });
            broadcast({ type: 'session_state', accountId, status: await getStatusForRuntime(targetRuntime) });
          } catch (bgErr) {
            logger.warn('playwright_sync_background_fallback', { accountId, error: String(bgErr) });
            // Fallback sang recent catchup nếu Playwright gặp lỗi môi trường
            const catchupResult = await targetRuntime.catchupRecentConversations({
              limitConversations: 25,
              perBatchTimeoutMs: 5000,
            }).catch(() => ({ totalChecked: 0, totalInserted: 0 }));

            const summaries = await targetRuntime.getConversationSummaries();
            broadcast({ type: 'conversation_summaries', accountId, conversations: summaries });
            broadcast({
              type: 'ws_sync_progress',
              accountId,
              step: 'completed',
              percent: 100,
              current: catchupResult.totalInserted,
              message: `Đã bù đắp ${catchupResult.totalInserted} tin nhắn gần đây qua Cloud Catchup.`,
            });
          }
        });

        res.json({ started: true, message: 'Đã kích hoạt quy trình đồng bộ 14 ngày trong nền' });
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
      const userId = (req as any).systemUserId as string;
      try {
        const body = req.body ?? {};
        if (userId && body.conversationId) {
          const allowed = await canUserAccessConversation(knex, userId, accountId, body.conversationId);
          if (!allowed) {
            res.status(403).json({ error: 'Bạn không có quyền gửi tin nhắn vào cuộc trò chuyện này' });
            return;
          }
        }

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
          mentions: Array.isArray(body.mentions) ? body.mentions : undefined,
          quoteMessageId: body.quoteMessageId ? String(body.quoteMessageId).trim() : undefined,
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
        const updated = await targetRuntime.getStore().conversationRepo.updateConversationNotes(
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

  router.put('/:accountId/conversations/:conversationId/restriction', ...viewAny, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.params.conversationId ?? '').trim();
      const userId = (req as any).systemUserId as string;
      const isRestricted = Boolean(req.body?.isRestricted);

      try {
        // Only Master / Admin / Super Admin can toggle restriction
        const { rows: userRows } = await knex.raw('SELECT role FROM system_users WHERE id = ?', [userId]);
        const systemRole = userRows[0]?.role;
        const { rows: memberRows } = await knex.raw(
          'SELECT role FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?',
          [userId, accountId],
        );
        const accountRole = memberRows[0]?.role;

        const isAllowed =
          systemRole === 'super_admin' ||
          systemRole === 'admin' ||
          accountRole === 'master' ||
          accountRole === 'admin';

        if (!isAllowed) {
          res.status(403).json({ error: 'Chỉ Quản lý (Master/Admin) mới có quyền khóa/mở hội thoại' });
          return;
        }

        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        const updated = await targetRuntime.getStore().setConversationRestriction(
          accountId,
          conversationId,
          isRestricted,
          userId,
        );

        broadcast({
          type: 'conversation_restriction_updated',
          accountId,
          conversationId,
          isRestricted: updated?.isRestricted ?? isRestricted,
          restrictedBy: updated?.restrictedBy,
          restrictedAt: updated?.restrictedAt,
        });

        broadcast({
          type: 'conversation_summaries',
          accountId,
          conversations: await targetRuntime.getConversationSummaries(),
        });

        res.json({
          ok: true,
          conversationId,
          isRestricted: updated?.isRestricted ?? isRestricted,
          restrictedBy: updated?.restrictedBy,
          restrictedAt: updated?.restrictedAt,
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Cập nhật trạng thái khóa thất bại' });
      }
    })();
  });

  router.post('/:accountId/conversations/:conversationId/mute', ...editAny, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      const conversationId = String(req.params.conversationId ?? '').trim();
      const action = req.body?.action === 'unmute' ? 'unmute' : 'mute';
      const duration = typeof req.body?.duration === 'number' ? req.body.duration : -1; // -1 = forever

      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        const { type, threadId } = targetRuntime.resolveConversationTarget(conversationId);
        const api = (targetRuntime as any).state?.session?.api;

        if (api && typeof api.setMute === 'function') {
          try {
            await api.setMute({
              duration: action === 'unmute' ? -1 : duration,
              action: action === 'unmute' ? 3 : 1, // 1=MUTE, 3=UNMUTE
            }, threadId, type === 'group' ? 1 : 0);
          } catch (zaloErr) {
            // ignore or log
          }
        }

        const isMuted = action === 'mute';
        const muteUntil = isMuted && duration !== -1 ? Date.now() + duration * 1000 : null;
        await targetRuntime.getStore().conversationRepo.setConversationMuteState(
          accountId,
          conversationId,
          isMuted,
          muteUntil,
        );

        broadcast({
          type: 'conversation_mute_updated',
          accountId,
          conversationId,
          isMuted,
          muteUntil,
        });

        // Broadcast updated summaries so sidebar icon updates immediately
        setImmediate(async () => {
          try {
            broadcast({
              type: 'conversation_summaries',
              accountId,
              conversations: await targetRuntime.getConversationSummaries(),
            });
          } catch {}
        });

        res.json({ ok: true, conversationId, isMuted, muteUntil });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Cap nhat trang thai mute that bai' });
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

        // 2-way sync: Remove unread mark on Zalo server
        setImmediate(async () => {
          try {
            const { type, threadId } = targetRuntime.resolveConversationTarget(conversationId);
            await targetRuntime.markConversationRead(threadId, type === 'group').catch(() => undefined);
          } catch { /* ignore */ }
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

  router.post('/:accountId/conversations/mark-all-read', ...editAny, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        await targetRuntime.getStore().conversationRepo.markAllAsRead(accountId);

        // 2-way sync: Remove all unread marks on Zalo server
        setImmediate(async () => {
          try {
            const unreads = await targetRuntime.getUnreadMark().catch(() => ({ direct: [], group: [] }));
            for (const d of unreads.direct) {
              await targetRuntime.markConversationRead(d.threadId, false).catch(() => undefined);
            }
            for (const g of unreads.group) {
              await targetRuntime.markConversationRead(g.threadId, true).catch(() => undefined);
            }
          } catch { /* ignore */ }
        });

        const summaries = await targetRuntime.getConversationSummaries();
        broadcast({ type: 'conversation_summaries', accountId, conversations: summaries });

        res.json({ ok: true, count: summaries.length });
      } catch (error) {
        logger.error('mark_all_read_failed', { accountId, error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Danh dau tat ca da doc that bai' });
      }
    })();
  });

  router.post('/:accountId/conversations/sync-unread', ...viewAny, (req, res) => {
    void (async () => {
      const accountId = String(req.params.accountId ?? '').trim();
      try {
        const targetRuntime = await getRuntimeForAccount(accountId, accountManager);
        await targetRuntime.syncUnreadMarks();
        const summaries = await targetRuntime.getConversationSummaries();
        broadcast({ type: 'conversation_summaries', accountId, conversations: summaries });

        res.json({ ok: true, count: summaries.length });
      } catch (error) {
        logger.error('sync_unread_failed', { accountId, error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Dong bo unread that bai' });
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
