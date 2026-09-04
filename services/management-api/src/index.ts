import express from 'express';
import { gatewayOperations, type CreateGatewayTokenRequest, type CreateGatewayTokenResponse, type ServiceHealth } from '@zalohub/contracts';
import { config } from './config.js';
import { createGatewayToken, gatewayTokenTtlSeconds } from './gateway-token.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

function health(): ServiceHealth {
  return { ok: true, service: 'management-api', timestamp: new Date().toISOString() };
}

app.get('/health', (_req, res) => res.json(health()));
app.get('/ready', (_req, res) => res.json(health()));

app.post('/internal/v1/gateway-tokens', (req, res) => {
  if (req.get('x-service-key') !== config.serviceAuthKey) {
    res.status(401).json({ error: 'Unauthorized service' });
    return;
  }

  const body = req.body as Partial<CreateGatewayTokenRequest>;
  if (!body.userId || !body.operation || !gatewayOperations.includes(body.operation)) {
    res.status(400).json({ error: 'Invalid gateway token request' });
    return;
  }

  const response: CreateGatewayTokenResponse = {
    token: createGatewayToken({ userId: body.userId, accountId: body.accountId, operation: body.operation }),
    expiresInSeconds: gatewayTokenTtlSeconds,
  };
  res.json(response);
});

app.listen(config.port, () => {
  console.log(`[management-api] listening on :${config.port}`);
});
