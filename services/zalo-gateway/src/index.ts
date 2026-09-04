import express from 'express';
import type { GatewayAccessClaims, ServiceHealth } from '@zalohub/contracts';
import { config } from './config.js';
import { requireGatewayOperation } from './internal-auth.js';
import { ZaloOnboardingService } from './onboarding-service.js';
import { GatewayStore } from './store.js';

function health(): ServiceHealth {
  return { ok: true, service: 'zalo-gateway', timestamp: new Date().toISOString() };
}

function claims(res: express.Response): GatewayAccessClaims {
  return res.locals.gatewayClaims as GatewayAccessClaims;
}

function requireClaimAccount(res: express.Response, accountId: string): boolean {
  if (claims(res).accountId === accountId) return true;
  res.status(403).json({ error: 'Gateway token is not scoped to this account' });
  return false;
}

async function main() {
  const store = new GatewayStore();
  await store.migrate();
  const onboarding = new ZaloOnboardingService(store);
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => res.json(health()));
  app.get('/ready', async (_req, res) => {
    try {
      await store.ready();
      res.json(health());
    } catch {
      res.status(503).json({ ok: false, service: 'zalo-gateway' });
    }
  });

  app.post('/internal/v1/onboarding', requireGatewayOperation(['onboarding.manage']), async (_req, res) => {
    try {
      const created = await onboarding.start(claims(res).sub);
      res.status(202).json({ onboardingId: created.id, status: created.status });
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : 'Unable to start Zalo onboarding' });
    }
  });

  app.get('/internal/v1/onboarding/:onboardingId', requireGatewayOperation(['onboarding.manage']), (req, res) => {
    const onboardingId = String(req.params.onboardingId);
    const current = onboarding.get(onboardingId, claims(res).sub);
    if (!current) {
      res.status(404).json({ error: 'Onboarding not found' });
      return;
    }
    res.json({ onboardingId: current.id, status: current.status, account: current.account, error: current.error });
  });

  app.get('/internal/v1/onboarding/:onboardingId/qr', requireGatewayOperation(['onboarding.manage']), (req, res) => {
    const onboardingId = String(req.params.onboardingId);
    const current = onboarding.get(onboardingId, claims(res).sub);
    if (!current) {
      res.status(404).json({ error: 'Onboarding not found' });
      return;
    }
    res.json({ onboardingId: current.id, status: current.status, qrCode: current.qrCode ?? null, error: current.error });
  });

  app.get('/internal/v1/accounts/:accountId/status', requireGatewayOperation(['accounts.read']), async (req, res) => {
    const accountId = String(req.params.accountId);
    if (!requireClaimAccount(res, accountId)) return;
    const account = await onboarding.status(accountId);
    if (!account) {
      res.status(404).json({ error: 'Zalo account not found' });
      return;
    }
    res.json(account);
  });

  app.post('/internal/v1/accounts/:accountId/reconnect', requireGatewayOperation(['accounts.manage']), async (req, res) => {
    const accountId = String(req.params.accountId);
    if (!requireClaimAccount(res, accountId)) return;
    try {
      res.json(await onboarding.reconnect(accountId));
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'Zalo reconnect failed' });
    }
  });

  app.delete('/internal/v1/accounts/:accountId/session', requireGatewayOperation(['accounts.manage']), async (req, res) => {
    const accountId = String(req.params.accountId);
    if (!requireClaimAccount(res, accountId)) return;
    await onboarding.logout(accountId);
    res.status(204).end();
  });

  app.listen(config.port, config.host, () => {
    console.log(`[zalo-gateway] listening on ${config.host}:${config.port}`);
  });
}

main().catch((error) => {
  console.error('[zalo-gateway] startup failed', error);
  process.exit(1);
});
