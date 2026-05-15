import { Router } from 'express';
import type { AccountRuntimeManager } from '../account-manager.js';
import type { GoldLogger } from '../../core/logger.js';
import { getStatus, getStatusForRuntime, getEmptyStatus } from '../helpers/status.js';

export function createSystemRouter(logger: GoldLogger, accountManager: AccountRuntimeManager, loginPromise: () => Promise<void> | undefined) {

  const router = Router();

  router.get('/health', (_req, res) => {
    void (async () => {
      res.json({ ok: true, app: 'gold-2-web', ...await getStatus(accountManager, loginPromise) });
    })();
  });

  router.get('/status', (_req, res) => {
    void (async () => {
      const primaryRuntime = await accountManager.ensurePrimaryRuntime().catch((error) => {
        logger.error('primary_runtime_ensure_failed', error);
        return undefined;
      });
      const targetRuntime = primaryRuntime ?? accountManager.getPreferredRuntime();

      if (targetRuntime && await targetRuntime.hasCredential() && !targetRuntime.isSessionActive()) {
        await targetRuntime.loginWithStoredCredential().catch((error) => {
          logger.error('gold2_status_reconnect_failed', error);
        });
      }

      if (targetRuntime && await targetRuntime.hasCredential() && !(await targetRuntime.getCurrentAccount())) {
        await targetRuntime.fetchAccountInfo().catch((error) => {
          logger.error('gold2_status_account_fetch_failed', error);
        });
      }

      res.json(targetRuntime ? await getStatusForRuntime(targetRuntime, Boolean(loginPromise())) : getEmptyStatus(Boolean(loginPromise())));
    })();
  });

  return router;
}
