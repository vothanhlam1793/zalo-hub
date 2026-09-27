import { Router } from 'express';
import type { Knex } from 'knex';
import type { GoldRuntime } from '../../core/runtime.js';
import type { GoldLogger } from '../../core/logger.js';
import type { AccountRuntimeManager } from '../account-manager.js';
import { createAuthMiddleware } from '../helpers/auth-middleware.js';

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
  let currentQrImage: string | null = null;

  router.post('/login/start', requireAuth, (req, res) => {
    const userId = (req as any).systemUserId as string;
    let loginPromise = getLoginPromise();
    if (!loginPromise) {
      logger.info('gold2_native_qr_login_start_requested', { userId });
      currentQrImage = null;

      loginPromise = (async () => {
        await loginRuntime.loginByQr({
          onQr(qrCode) {
            currentQrImage = qrCode;
            logger.info('gold2_native_qr_ready', { qrLength: qrCode.length });
            broadcast({
              type: 'ws_sync_progress',
              accountId: 'new_login',
              step: 'qr_ready',
              percent: 25,
              qrCode,
              message: 'Mã QR đã sẵn sàng. Vui lòng quét bằng Zalo trên điện thoại.',
            });
          },
        });

        const currentAccount = await loginRuntime.getCurrentAccount();
        const accountId = currentAccount?.userId;
        if (accountId && userId) {
          // 1. Assign membership if needed
          const { rows: existing } = await knex.raw(
            'SELECT role FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?',
            [userId, accountId]
          );
          if (existing.length === 0) {
            const existingAcc = await knex.raw('SELECT 1 FROM accounts WHERE account_id = ?', [accountId]);
            if (existingAcc.rows.length === 0) {
              await knex.raw(
                'INSERT INTO zalo_account_memberships (user_id, account_id, role) VALUES (?, ?, ?)',
                [userId, accountId, 'master']
              );
            } else {
              await knex.raw(
                'INSERT INTO zalo_account_memberships (user_id, account_id, role) VALUES (?, ?, ?)',
                [userId, accountId, 'viewer']
              );
            }
            logger.info('gold2_auto_membership_assigned', { userId, accountId });
          }

          // 2. Activate primary account and ensure dedicated runtime
          await accountManager.activatePrimaryAccount(accountId);
          await accountManager.ensureRuntime(accountId).catch((error) => {
            logger.error('gold2_account_runtime_start_failed_after_qr', {
              accountId,
              error: error instanceof Error ? error.message : String(error),
            });
          });

          // 3. Notify completion
          broadcast({
            type: 'ws_sync_progress',
            accountId,
            step: 'completed',
            percent: 100,
            message: '🎉 Đăng nhập thành công!',
          });

          await loginRuntime.closeMessageListener().catch(() => undefined);
          loginRuntime.releaseTransientSession();
          void accountManager.syncAccountAfterLogin(accountId);
        }
        logger.info('gold2_native_login_completed', { accountId });
      })()
        .catch((error) => {
          logger.error('gold2_native_login_failed', error);
          broadcast({
            type: 'ws_sync_progress',
            accountId: 'new_login',
            step: 'error',
            percent: 0,
            message: 'Đăng nhập thất bại hoặc hết thời gian quét QR',
          });
          throw error;
        })
        .finally(() => {
          currentQrImage = null;
          setLoginPromise(undefined);
        });

      setLoginPromise(loginPromise);
    }

    res.json({ started: true, qrCodeAvailable: Boolean(loginRuntime.getCurrentQrCode() || currentQrImage) });
  });

  router.get('/login/qr', (_req, res) => {
    const qrCode = loginRuntime.getCurrentQrCode() || currentQrImage;
    if (!qrCode) {
      res.json({ qrCode: null, ready: false });
      return;
    }
    res.json({ qrCode, ready: true });
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
