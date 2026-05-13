import express from 'express';
import { ZaloRuntimeManager } from './manager.js';
import { ZaloServiceStore } from './store.js';

const app = express();
const store = new ZaloServiceStore();
const manager = new ZaloRuntimeManager(store);
const port = Number(process.env.ZALO_PORT ?? 3299);

app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'zalo-service' });
});

app.get('/api/channels/:channelId', (req, res) => {
  const channel = store.getChannel(req.params.channelId);
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }
  res.json(channel);
});

app.post('/api/channels/ensure', (req, res) => {
  const channelId = String(req.body?.channelId ?? '').trim();
  const workspaceId = String(req.body?.workspaceId ?? '').trim();
  const name = String(req.body?.name ?? '').trim();
  if (!channelId || !workspaceId || !name) {
    res.status(400).json({ error: 'channelId, workspaceId and name are required' });
    return;
  }
  res.status(201).json(store.ensureChannel({ channelId, workspaceId, name }));
});

app.post('/api/channels/:channelId/qr-login', async (req, res) => {
  try {
    const result = await manager.startQrLogin(req.params.channelId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'QR login failed' });
  }
});

app.post('/api/channels/:channelId/connect', async (req, res) => {
  try {
    const result = await manager.connectStoredChannel(req.params.channelId);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connect failed';
    res.status(message === 'Stored credential not found' ? 400 : 500).json({ error: message });
  }
});

app.post('/api/channels/:channelId/reconnect', async (req, res) => {
  try {
    const result = await manager.reconnectChannel(req.params.channelId);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reconnect failed';
    res.status(message === 'Stored credential not found' ? 400 : 500).json({ error: message });
  }
});

app.post('/api/channels/:channelId/sync-contacts', async (req, res) => {
  try {
    const friends = await manager.syncFriends(req.params.channelId);
    res.json(friends);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync contacts failed';
    res.status(message.includes('Khong con session active') ? 400 : 500).json({ error: message });
  }
});

app.get('/api/channels/:channelId/friends', (req, res) => {
  res.json(store.listFriends(req.params.channelId));
});

app.listen(port, () => {
  console.log(`zalo-service running at http://localhost:${port}`);
});

void manager.warmupStoredChannels();
