import express from 'express';
import type { ServiceHealth } from '@zalohub/contracts';
import { config } from './config.js';
import { requireGatewayOperation } from './internal-auth.js';

const app = express();

function health(): ServiceHealth {
  return { ok: true, service: 'zalo-gateway', timestamp: new Date().toISOString() };
}

app.get('/health', (_req, res) => res.json(health()));
app.get('/ready', (_req, res) => res.json(health()));

// This proves the Gateway accepts only Management-issued internal credentials.
app.get('/internal/v1/ping', requireGatewayOperation(['accounts.read']), (_req, res) => {
  res.json({ ok: true, service: 'zalo-gateway' });
});

app.listen(config.port, () => {
  console.log(`[zalo-gateway] listening on :${config.port}`);
});
