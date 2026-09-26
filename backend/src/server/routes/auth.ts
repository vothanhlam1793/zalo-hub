import { Router } from 'express';
import type { Knex } from 'knex';
import type { GoldRuntime } from '../../core/runtime.js';
import type { GoldLogger } from '../../core/logger.js';
import type { AccountRuntimeManager } from '../account-manager.js';
import { createAuthMiddleware } from '../helpers/auth-middleware.js';
import { PlaywrightQrLogin } from '../../core/playwright-qr.js';
import { IndexedDbImporter } from '../../core/indexeddb-importer.js';

export function createAuthRouter(
  logger: GoldLogger,
  loginRuntime: GoldRuntime,
  knex: Knex,
  accountManager: AccountRuntimeManager,
  broadcast: (payload: Record<string, unknown>) => void,
  getLoginPromise: () => Promise<void> | undefined,
  setLoginPromise: (p: Promise<void> | undefined) => void,
  getEmptyStatus: (loginInProgress?: boolean) => Record<string, unknown>,
) {
  const router = Router();
  const { requireAuth } = createAuthMiddleware(knex);
  const indexedDbImporter = new IndexedDbImporter(knex, logger);
  let globalQrHandler: PlaywrightQrLogin | null = null;
  let currentQrImage: string | null = null;

  router.post('/login/start', requireAuth, (req, res) => {
    const userId = (req as any).systemUserId as string;
    let loginPromise = getLoginPromise();
    if (!loginPromise) {
      logger.info('playwright_unified_login_start_requested', { userId });
      currentQrImage = null;

      if (globalQrHandler) {
        void globalQrHandler.cancel().catch(() => {});
        globalQrHandler = null;
      }

      const qrHandler = new PlaywrightQrLogin(logger, indexedDbImporter);
      globalQrHandler = qrHandler;

      loginPromise = (async () => {
        const qrBase64 = await qrHandler.start();
        currentQrImage = qrBase64;
        logger.info('playwright_unified_qr_ready', { len: qrBase64.length });

        const loginRes = await qrHandler.waitForLoginAndImport(180_000, (prog) => {
          if (prog.step === 'waiting_phone_confirm' || prog.step === 'receiving_chunks') {
            currentQrImage = null;
          }
          broadcast({
            type: 'ws_sync_progress',
            accountId: prog.step === 'waiting_phone_confirm' ? 'new_login' : loginRes?.accountId || 'new_login',
            ...prog,
          });
        });

        const accountId = loginRes.accountId;
        if (accountId && userId) {
          // 1. Assign membership if needed
          const { rows: existing } = await knex.raw('SELECT role FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?', [userId, accountId]);
          if (existing.length === 0) {
            const existingAcc = await knex.raw('SELECT 1 FROM accounts WHERE account_id = ?', [accountId]);
            if (existingAcc.rows.length === 0) {
              await knex.raw('INSERT INTO zalo_account_memberships (user_id, account_id, role) VALUES (?, ?, ?)', [userId, accountId, 'master']);
            } else {
              await knex.raw('INSERT INTO zalo_account_memberships (user_id, account_id, role) VALUES (?, ?, ?)', [userId, accountId, 'viewer']);
            }
            logger.info('gold2_auto_membership_assigned', { userId, accountId });
          }

          // 2. Save session credentials
          const cookiesJson = JSON.stringify(loginRes.cookies);
          await knex('account_sessions')
            .insert({
              account_id: accountId,
              cookie_json: cookiesJson,
              imei: 'playwright-' + accountId,
              user_agent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
              is_active: 1,
              created_at: knex.fn.now(),
              updated_at: knex.fn.now(),
            })
            .onConflict('account_id')
            .merge({
              cookie_json: cookiesJson,
              is_active: 1,
              updated_at: knex.fn.now(),
            });

          // 3. Ensure runtime and notify clients
          await accountManager.activatePrimaryAccount(accountId);
          await accountManager.ensureRuntime(accountId).catch((error) => {
            logger.error('gold2_account_runtime_start_failed_after_qr', {
              accountId,
              error: error instanceof Error ? error.message : String(error),
            });
          });

          void accountManager.syncAccountAfterLogin(accountId);
        }
        logger.info('playwright_unified_login_completed', { accountId });
      })()
        .catch((error) => {
          logger.error('playwright_unified_login_failed', error);
          throw error;
        })
        .finally(async () => {
          await qrHandler.cleanup().catch(() => {});
          if (globalQrHandler === qrHandler) globalQrHandler = null;
          currentQrImage = null;
          setLoginPromise(undefined);
        });

      setLoginPromise(loginPromise);
    }

    res.json({ started: true, qrCodeAvailable: Boolean(currentQrImage) });
  });

  router.get('/login/qr', (_req, res) => {
    if (!currentQrImage) {
      res.json({ qrCode: null, ready: false });
      return;
    }
    res.json({ qrCode: `data:image/png;base64,${currentQrImage}`, ready: true });
  });

  router.post('/logout', (_req, res) => {
    void (async () => {
      const accountId = accountManager.getPrimaryAccountId();
      const primaryRuntime = accountId ? accountManager.getRuntime(accountId) : undefined;

      if (primaryRuntime) {
        const result = primaryRuntime.logout();
        logger.info('gold2_logout_completed', { accountId, via: 'primary_runtime' });
        broadcast({ type: 'session_state', accountId, status: getEmptyStatus(Boolean(getLoginPromise())) });
        res.json(result);
        return;
      }

      const result = loginRuntime.logout();
      logger.info('gold2_logout_completed', { via: 'login_runtime_fallback' });
      res.json(result);
    })();
  });

  return router;
}
