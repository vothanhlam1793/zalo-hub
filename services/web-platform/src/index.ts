import express from 'express';
import type { ServiceHealth } from '@zalohub/contracts';

const port = Number(process.env.WEB_PLATFORM_PORT ?? 3500);
const app = express();

function health(): ServiceHealth {
  return { ok: true, service: 'web-platform', timestamp: new Date().toISOString() };
}

app.get('/health', (_req, res) => res.json(health()));
app.get('/ready', (_req, res) => res.json(health()));

app.listen(port, () => {
  console.log(`[web-platform] foundation listening on :${port}`);
});
