import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileStore } from './store.js';
import { ZaloManager } from './zalo-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, '../client');

const app = express();
const store = new FileStore();
const zaloManager = new ZaloManager(store);
const port = Number(process.env.PORT ?? 3099);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(clientDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'MyChat', version: '0.1.0' });
});

app.get('/api/accounts', (_req, res) => {
  res.json(store.listAccounts());
});

app.get('/api/accounts/:accountId', (req, res) => {
  const account = store.getAccount(req.params.accountId);
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  res.json(account);
});

app.post('/api/accounts', (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const account = store.createAccount(name);
  store.seedDemoConversation(account.id);
  res.status(201).json(account);
});

app.post('/api/accounts/:accountId/qr-login', async (req, res) => {
  try {
    const result = await zaloManager.startQrLogin(req.params.accountId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'QR login failed' });
  }
});

app.post('/api/accounts/:accountId/connect', async (req, res) => {
  try {
    const result = await zaloManager.connectStoredAccount(req.params.accountId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Connect failed' });
  }
});

app.post('/api/accounts/:accountId/sync-friends', async (req, res) => {
  try {
    const friends = await zaloManager.syncFriends(req.params.accountId);
    res.json(friends);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Sync failed' });
  }
});

app.get('/api/accounts/:accountId/friends', (req, res) => {
  res.json(store.listFriends(req.params.accountId));
});

app.get('/api/conversations', (req, res) => {
  const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
  res.json(store.listConversations(accountId));
});

app.post('/api/conversations', (req, res) => {
  const accountId = String(req.body?.accountId ?? '');
  const title = String(req.body?.title ?? '').trim();
  const userId = String(req.body?.userId ?? '').trim();

  if (!accountId || (!title && !userId)) {
    res.status(400).json({ error: 'accountId and title or userId are required' });
    return;
  }

  const conversation = userId
    ? zaloManager.createFriendConversation(accountId, userId)
    : zaloManager.createLocalConversation(accountId, title);
  res.status(201).json(conversation);
});

app.get('/api/conversations/:conversationId/messages', (req, res) => {
  res.json(store.listMessages(req.params.conversationId));
});

app.post('/api/messages', async (req, res) => {
  const accountId = String(req.body?.accountId ?? '');
  const conversationId = String(req.body?.conversationId ?? '');
  const text = String(req.body?.text ?? '').trim();

  if (!accountId || !conversationId || !text) {
    res.status(400).json({ error: 'accountId, conversationId and text are required' });
    return;
  }

  try {
    const message = await zaloManager.sendMessage(accountId, conversationId, text);
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Send failed' });
  }
});

app.get('/api/agents/:accountId', (req, res) => {
  const workspace = store.getAgentWorkspace(req.params.accountId);
  if (!workspace) {
    res.status(404).json({ error: 'Agent workspace not found' });
    return;
  }

  res.json(workspace);
});

app.patch('/api/agents/:accountId', (req, res) => {
  const workspace = store.updateAgentWorkspace(req.params.accountId, req.body ?? {});
  if (!workspace) {
    res.status(404).json({ error: 'Agent workspace not found' });
    return;
  }

  res.json(workspace);
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`MyChat running at http://localhost:${port}`);
});

void zaloManager.warmupStoredAccounts();
