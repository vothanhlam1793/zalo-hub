import { Router } from 'express';
import type { GoldRuntime } from '../../core/runtime.js';
import type { GoldStore } from '../../core/store.js';
import type { GoldLogger } from '../../core/logger.js';
import type { AccountRuntimeManager } from '../account-manager.js';

export function createAuthRouter(
  logger: GoldLogger,
  loginRuntime: GoldRuntime,
  loginStore: GoldStore,
  accountManager: AccountRuntimeManager,
  broadcast: (payload: Record<string, unknown>) => void,
  getLoginPromise: () => Promise<void> | undefined,
  setLoginPromise: (p: Promise<void> | undefined) => void,
  getEmptyStatus: (loginInProgress?: boolean) => Record<string, unknown>,
) {

  const router = Router();

  router.post('/login/start', (_req, res) => {
    let loginPromise = getLoginPromise();
    if (!loginPromise) {
      logger.info('gold2_login_start_requested');
      loginPromise = loginRuntime
        .loginByQr({
          onQr(qrCode) {
            logger.info('gold2_qr_ready', { qrLength: qrCode.length });
          },
        })
        .then(async () => {
          const accountId = loginRuntime.getCurrentAccount()?.userId;
          if (accountId) {
            accountManager.activatePrimaryAccount(accountId);
            await accountManager.ensureRuntime(accountId).catch((error) => {
              logger.error('gold2_account_runtime_start_failed_after_qr', {
                accountId,
                error: error instanceof Error ? error.message : String(error),
              });
            });
          }
          logger.info('gold2_login_completed');
        })
        .catch((error) => {
          logger.error('gold2_login_failed', error);
          throw error;
        })
        .finally(() => {
          setLoginPromise(undefined);
        });
      setLoginPromise(loginPromise);
    }

    res.json({ started: true, qrCodeAvailable: Boolean(loginRuntime.getCurrentQrCode()) });
  });

  router.get('/login/qr', (_req, res) => {
    const qrCode = loginRuntime.getCurrentQrCode();
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
