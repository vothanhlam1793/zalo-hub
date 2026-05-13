import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import multer from 'multer';
import { GoldLogger } from '../core/logger.js';
import { mediaDir } from '../core/media-store.js';
import { GoldRuntime } from '../core/runtime.js';
import { GoldStore } from '../core/store.js';
import type { GoldConversationMessage } from '../core/types.js';
import { AccountRuntimeManager } from './account-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, 'client');
const gold4ClientDir = path.resolve(__dirname, '../../dist/web');

const logger = new GoldLogger();
const loginStore = new GoldStore();
const loginRuntime = new GoldRuntime(loginStore, logger);
const accountManager = new AccountRuntimeManager(logger);
const app = express();
const port = Number(process.env.GOLD2_PORT ?? 3399);
const server = createServer(app);
const wsServer = new WebSocketServer({ server, path: '/ws' });

let loginPromise: Promise<void> | undefined;

const wsSubscriptions = new Map<WebSocket, { accountId: string; conversationId: string }>();

function broadcast(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  for (const client of wsServer.clients) {
    if (client.readyState !== client.OPEN) {
      continue;
    }

    client.send(body);
  }
}

function broadcastConversationMessage(accountId: string, message: GoldConversationMessage) {
  const payload = JSON.stringify({ type: 'conversation_message', accountId, message });
  for (const client of wsServer.clients) {
    if (client.readyState !== client.OPEN) {
      continue;
    }

    const subscription = wsSubscriptions.get(client);
    if (!subscription || subscription.accountId !== accountId || subscription.conversationId !== message.conversationId) {
      continue;
    }

    client.send(payload);
  }
}

accountManager.onConversationMessage(({ accountId, message }) => {
  broadcastConversationMessage(accountId, message);
  const accountRuntime = accountManager.getRuntime(accountId);
  if (!accountRuntime) {
    return;
  }
  broadcast({ type: 'conversation_summaries', accountId, conversations: accountRuntime.getConversationSummaries() });
  broadcast({ type: 'session_state', accountId, status: getStatusForRuntime(accountRuntime) });
});

wsServer.on('connection', (socket: WebSocket) => {
  socket.send(JSON.stringify({ type: 'connected' }));
  const primaryAccountId = accountManager.getPrimaryAccountId();
  const primaryRuntime = accountManager.getPrimaryRuntime();
  socket.send(JSON.stringify({
    type: 'conversation_summaries',
    accountId: primaryAccountId,
    conversations: primaryRuntime?.getConversationSummaries() ?? [],
  }));
  socket.send(JSON.stringify({
    type: 'session_state',
    accountId: primaryAccountId,
    status: primaryRuntime ? getStatusForRuntime(primaryRuntime) : getEmptyStatus(),
  }));

  socket.on('message', (raw: string | Buffer) => {
    try {
      const payload = JSON.parse(String(raw)) as { type?: string; conversationId?: string; accountId?: string };
      if (payload.type === 'subscribe' && payload.conversationId && payload.accountId) {
        wsSubscriptions.set(socket, { accountId: String(payload.accountId), conversationId: String(payload.conversationId) });
        socket.send(JSON.stringify({ type: 'subscribed', accountId: String(payload.accountId), conversationId: String(payload.conversationId) }));
        return;
      }

      if (payload.type === 'unsubscribe') {
        wsSubscriptions.delete(socket);
        socket.send(JSON.stringify({ type: 'unsubscribed' }));
      }
    } catch (error) {
      socket.send(JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Invalid websocket payload' }));
    }
  });

  socket.on('close', () => {
    wsSubscriptions.delete(socket);
  });
});

app.use(express.json({ limit: '12mb' }));
app.use((_, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(gold4ClientDir));
app.use(express.static(clientDir));

app.get('/media/*', (req, res) => {
  const relativePath = req.path.slice('/media/'.length).trim();
  const target = path.resolve(mediaDir, relativePath);
  if (!target.startsWith(mediaDir) || !existsSync(target)) {
    res.status(404).json({ error: 'Khong tim thay media' });
    return;
  }

  res.sendFile(target);
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

function getEmptyStatus(loginInProgress = false) {
  return {
    hasCredential: false,
    sessionActive: false,
    friendCacheCount: 0,
    qrCodeAvailable: false,
    account: undefined,
    listener: { connected: false, started: false },
    loginInProgress,
    loggedIn: false,
  };
}

function getStatus(loginInProgress = Boolean(loginPromise)) {
  const primaryRuntime = accountManager.getPrimaryRuntime();
  if (!primaryRuntime) {
    return getEmptyStatus(loginInProgress);
  }
  return getStatusForRuntime(primaryRuntime, loginInProgress);
}

function getStatusForRuntime(targetRuntime: GoldRuntime, loginInProgress = false) {
  const account = targetRuntime.getCurrentAccount();
  return {
    hasCredential: targetRuntime.hasCredential(),
    sessionActive: targetRuntime.isSessionActive(),
    friendCacheCount: targetRuntime.getFriendCache().length,
    qrCodeAvailable: Boolean(targetRuntime.getCurrentQrCode()),
    account,
    listener: targetRuntime.getListenerState(),
    loginInProgress,
    loggedIn: Boolean(targetRuntime.hasCredential() || targetRuntime.isSessionActive() || account?.userId || account?.displayName),
  };
}

async function getRuntimeForAccount(accountId: string) {
  const normalized = accountId.trim();
  if (!normalized) {
    throw new Error('accountId la bat buoc');
  }
  return accountManager.ensureRuntime(normalized);
}

function markLegacyRoute(res: express.Response, replacement: string) {
  res.setHeader('X-Gold-Legacy-Route', 'true');
  res.setHeader('X-Gold-Replacement-Route', replacement);
}

async function getLegacyPrimaryContextOrRespond(res: express.Response, replacement: string) {
  markLegacyRoute(res, replacement);
  const accountId = accountManager.getPrimaryAccountId();
  if (!accountId) {
    res.status(401).json({ error: 'Chua co active account. Hay chon account hoac dang nhap lai.' });
    return undefined;
  }

  try {
    const runtime = await getRuntimeForAccount(accountId);
    if (!runtime.isSessionActive()) {
      res.status(401).json({ error: 'Phien dang nhap khong con active. Hay dang nhap lai.' });
      return undefined;
    }

    return { accountId, runtime };
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Khong tai duoc active account runtime' });
    return undefined;
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'gold-2-web', ...getStatus() });
});

app.get('/api/status', (_req, res) => {
  void (async () => {
    const primaryRuntime = await accountManager.ensurePrimaryRuntime().catch((error) => {
      logger.error('primary_runtime_ensure_failed', error);
      return undefined;
    });

    if (primaryRuntime?.hasCredential() && !primaryRuntime.isSessionActive()) {
      await primaryRuntime.loginWithStoredCredential().catch((error) => {
        logger.error('gold2_status_reconnect_failed', error);
      });
    }

    if (primaryRuntime?.hasCredential() && !primaryRuntime.getCurrentAccount()) {
      await primaryRuntime.fetchAccountInfo().catch((error) => {
        logger.error('gold2_status_account_fetch_failed', error);
      });
    }

    res.json(primaryRuntime ? getStatusForRuntime(primaryRuntime, Boolean(loginPromise)) : getEmptyStatus(Boolean(loginPromise)));
  })();
});

app.get('/api/accounts', (_req, res) => {
  res.json({
    accounts: accountManager.listAccountStatuses(),
    activeAccountId: accountManager.getPrimaryAccountId(),
  });
});

app.post('/api/accounts/activate', (req, res) => {
  void (async () => {
    const accountId = String(req.body?.accountId ?? '').trim();
    if (!accountId) {
      res.status(400).json({ error: 'accountId la bat buoc' });
      return;
    }

    try {
      const targetRuntime = await getRuntimeForAccount(accountId);
      if (!targetRuntime.isSessionActive()) {
        res.status(401).json({ error: 'Account chua active session. Hay dang nhap lai bang QR.' });
        return;
      }
      accountManager.activatePrimaryAccount(accountId);
      broadcast({ type: 'conversation_summaries', accountId, conversations: targetRuntime.getConversationSummaries() });
      broadcast({ type: 'session_state', accountId, status: getStatusForRuntime(targetRuntime) });
      res.json({ ok: true, accountId, status: getStatusForRuntime(targetRuntime) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Kich hoat account that bai' });
    }
  })();
});

app.get('/api/accounts/:accountId/status', (req, res) => {
  void (async () => {
    const accountId = String(req.params.accountId ?? '').trim();
    if (!accountId) {
      res.status(400).json({ error: 'accountId la bat buoc' });
      return;
    }

    try {
      const targetRuntime = await getRuntimeForAccount(accountId);
      if (targetRuntime.hasCredential() && !targetRuntime.isSessionActive()) {
        await targetRuntime.loginWithStoredCredential().catch((error) => {
          logger.error('account_status_reconnect_failed', { accountId, error: error instanceof Error ? error.message : String(error) });
        });
      }
      if (targetRuntime.hasCredential() && !targetRuntime.getCurrentAccount()) {
        await targetRuntime.fetchAccountInfo().catch((error) => {
          logger.error('account_status_profile_fetch_failed', { accountId, error: error instanceof Error ? error.message : String(error) });
        });
      }
      res.json(getStatusForRuntime(targetRuntime));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Tai status account that bai' });
    }
  })();
});

app.get('/api/accounts/:accountId/contacts', (req, res) => {
  void (async () => {
    const accountId = String(req.params.accountId ?? '').trim();
    try {
      const targetRuntime = await getRuntimeForAccount(accountId);
      if (!targetRuntime.isSessionActive()) {
        res.status(401).json({ error: 'Account chua active session' });
        return;
      }
      const refresh = req.query.refresh === '1';
      const contacts = refresh || targetRuntime.getContactCache().length === 0
        ? await targetRuntime.listFriends()
        : targetRuntime.getContactCache();
      res.json({ contacts, count: contacts.length });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Tai contacts that bai' });
    }
  })();
});

app.get('/api/accounts/:accountId/groups', (req, res) => {
  void (async () => {
    const accountId = String(req.params.accountId ?? '').trim();
    try {
      const targetRuntime = await getRuntimeForAccount(accountId);
      if (!targetRuntime.isSessionActive()) {
        res.status(401).json({ error: 'Account chua active session' });
        return;
      }
      const refresh = req.query.refresh === '1';
      const groups = refresh || targetRuntime.getGroupCache().length === 0
        ? await targetRuntime.listGroups().catch((error) => {
            logger.error('account_groups_refresh_failed', {
              accountId,
              error: error instanceof Error ? error.message : String(error),
            });
            const fallbackGroups = targetRuntime.getGroupCache();
            if (fallbackGroups.length > 0) {
              return fallbackGroups;
            }
            throw error;
          })
        : targetRuntime.getGroupCache();
      res.json({ groups, count: groups.length });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Tai groups that bai' });
    }
  })();
});

app.get('/api/accounts/:accountId/conversations', (req, res) => {
  void (async () => {
    const accountId = String(req.params.accountId ?? '').trim();
    try {
      const targetRuntime = await getRuntimeForAccount(accountId);
      if (!targetRuntime.isSessionActive()) {
        res.status(401).json({ error: 'Account chua active session' });
        return;
      }
      const conversations = targetRuntime.getConversationSummaries();
      res.json({ conversations, count: conversations.length });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Tai conversations that bai' });
    }
  })();
});

app.get('/api/accounts/:accountId/conversations/:conversationId/messages', (req, res) => {
  void (async () => {
    const accountId = String(req.params.accountId ?? '').trim();
    const conversationId = String(req.params.conversationId ?? '').trim();
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

    if (!conversationId) {
      res.status(400).json({ error: 'conversationId la bat buoc' });
      return;
    }

    try {
      const targetRuntime = await getRuntimeForAccount(accountId);
      if (!targetRuntime.isSessionActive()) {
        res.status(401).json({ error: 'Account chua active session' });
        return;
      }
      const messages = targetRuntime.getConversationMessages(conversationId, { since, before, limit });
      const oldestTimestamp = messages[0]?.timestamp;
      const hasMore = Boolean(before ? messages.length === (limit ?? 40) : oldestTimestamp);
      res.json({ conversationId, messages, count: messages.length, oldestTimestamp, hasMore });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Tai conversation that bai' });
    }
  })();
});

app.post('/api/accounts/:accountId/conversations/:conversationId/sync-metadata', (req, res) => {
  void (async () => {
    const accountId = String(req.params.accountId ?? '').trim();
    const conversationId = String(req.params.conversationId ?? '').trim();
    if (!conversationId) {
      res.status(400).json({ error: 'conversationId la bat buoc' });
      return;
    }

    try {
      const targetRuntime = await getRuntimeForAccount(accountId);
      if (!targetRuntime.isSessionActive()) {
        res.status(401).json({ error: 'Account chua active session' });
        return;
      }
      const result = await targetRuntime.syncConversationMetadata(conversationId);
      broadcast({ type: 'conversation_summaries', accountId, conversations: targetRuntime.getConversationSummaries() });
      broadcast({ type: 'session_state', accountId, status: getStatusForRuntime(targetRuntime) });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Sync metadata that bai' });
    }
  })();
});

app.post('/api/accounts/:accountId/conversations/sync-history', (req, res) => {
  void (async () => {
    const accountId = String(req.params.accountId ?? '').trim();
    const conversationId = String(req.body?.conversationId ?? '').trim();
    const beforeMessageId = typeof req.body?.beforeMessageId === 'string' ? req.body.beforeMessageId.trim() : undefined;
    const timeoutMs = typeof req.body?.timeoutMs === 'number' ? req.body.timeoutMs : undefined;
    if (!conversationId) {
      res.status(400).json({ error: 'conversationId la bat buoc' });
      return;
    }

    try {
      const targetRuntime = await getRuntimeForAccount(accountId);
      if (!targetRuntime.isSessionActive()) {
        res.status(401).json({ error: 'Account chua active session' });
        return;
      }
      const result = await targetRuntime.syncConversationHistory(conversationId, { beforeMessageId, timeoutMs });
      broadcast({ type: 'conversation_summaries', accountId, conversations: targetRuntime.getConversationSummaries() });
      broadcast({ type: 'session_state', accountId, status: getStatusForRuntime(targetRuntime) });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Sync history that bai' });
    }
  })();
});

app.post('/api/accounts/:accountId/send', (req, res) => {
  void (async () => {
    const accountId = String(req.params.accountId ?? '').trim();
    const conversationId = String(req.body?.conversationId ?? '').trim();
    const text = String(req.body?.text ?? '').trim();
    const imageBase64 = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64.trim() : '';
    const imageFileName = typeof req.body?.imageFileName === 'string' ? req.body.imageFileName.trim() : '';
    const imageMimeType = typeof req.body?.imageMimeType === 'string' ? req.body.imageMimeType.trim() : '';

    if (!conversationId) {
      res.status(400).json({ error: 'conversationId la bat buoc' });
      return;
    }

    try {
      const targetRuntime = await getRuntimeForAccount(accountId);
      if (!targetRuntime.isSessionActive()) {
        res.status(401).json({ error: 'Account chua active session' });
        return;
      }
      let result;
      if (imageBase64) {
        if (!imageFileName || !imageMimeType) {
          res.status(400).json({ error: 'imageFileName va imageMimeType la bat buoc khi gui anh' });
          return;
        }
        result = await targetRuntime.sendImage(conversationId, {
          imageBuffer: Buffer.from(imageBase64, 'base64'),
          fileName: imageFileName,
          mimeType: imageMimeType,
          caption: text || undefined,
        });
      } else {
        if (!text) {
          res.status(400).json({ error: 'Can co text hoac image de gui' });
          return;
        }
        result = await targetRuntime.sendText(conversationId, text);
      }
      broadcast({ type: 'conversation_summaries', accountId, conversations: targetRuntime.getConversationSummaries() });
      broadcast({ type: 'session_state', accountId, status: getStatusForRuntime(targetRuntime) });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Gui tin that bai' });
    }
  })();
});

app.post('/api/accounts/:accountId/send-attachment', upload.single('file'), (req, res) => {
  void (async () => {
    const accountId = String(req.params.accountId ?? '').trim();
    const conversationId = String(req.body?.conversationId ?? '').trim();
    const caption = String(req.body?.caption ?? '').trim();

    if (!conversationId) {
      res.status(400).json({ error: 'conversationId la bat buoc' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'File la bat buoc' });
      return;
    }

    try {
      const targetRuntime = await getRuntimeForAccount(accountId);
      if (!targetRuntime.isSessionActive()) {
        res.status(401).json({ error: 'Account chua active session' });
        return;
      }
      const result = await targetRuntime.sendAttachment(conversationId, {
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        caption: caption || undefined,
      });
      broadcast({ type: 'conversation_summaries', accountId, conversations: targetRuntime.getConversationSummaries() });
      broadcast({ type: 'session_state', accountId, status: getStatusForRuntime(targetRuntime) });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Gui file that bai' });
    }
  })();
});

app.post('/api/login/start', (_req, res) => {
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
        loginPromise = undefined;
      });
  }

  res.json({ started: true, qrCodeAvailable: Boolean(loginRuntime.getCurrentQrCode()) });
});

app.get('/api/login/qr', (_req, res) => {
  const qrCode = loginRuntime.getCurrentQrCode();
  if (!qrCode) {
    res.json({ qrCode: null, ready: false });
    return;
  }

  res.json({ qrCode, ready: true });
});

app.post('/api/logout', (_req, res) => {
  void (async () => {
    const accountId = accountManager.getPrimaryAccountId();
    const primaryRuntime = accountId ? accountManager.getRuntime(accountId) : undefined;

    if (primaryRuntime) {
      const result = primaryRuntime.logout();
      logger.info('gold2_logout_completed', { accountId, via: 'primary_runtime' });
      broadcast({ type: 'session_state', accountId, status: getEmptyStatus(Boolean(loginPromise)) });
      res.json(result);
      return;
    }

    const result = loginRuntime.logout();
    logger.info('gold2_logout_completed', { via: 'login_runtime_fallback' });
    res.json(result);
  })();
});

app.get('/api/friends', (req, res) => {
  void (async () => {
    const context = await getLegacyPrimaryContextOrRespond(res, '/api/accounts/:accountId/contacts');
    if (!context) {
      return;
    }

    try {
      const refresh = req.query.refresh === '1';
      const friends = refresh || context.runtime.getContactCache().length === 0
        ? await context.runtime.listFriends()
        : context.runtime.getContactCache();
      if (!context.runtime.getCurrentAccount()) {
        await context.runtime.fetchAccountInfo().catch((error) => {
          logger.error('gold2_friends_account_fetch_failed', error);
        });
      }
      res.json({ friends, count: friends.length });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Tai friends that bai' });
    }
  })();
});

app.get('/api/contacts', (req, res) => {
  void (async () => {
    const context = await getLegacyPrimaryContextOrRespond(res, '/api/accounts/:accountId/contacts');
    if (!context) {
      return;
    }

    try {
      const refresh = req.query.refresh === '1';
      const contacts = refresh || context.runtime.getContactCache().length === 0
        ? await context.runtime.listFriends()
        : context.runtime.getContactCache();
      res.json({ contacts, count: contacts.length });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Tai contacts that bai' });
    }
  })();
});

app.get('/api/groups', (req, res) => {
  void (async () => {
    const context = await getLegacyPrimaryContextOrRespond(res, '/api/accounts/:accountId/groups');
    if (!context) {
      return;
    }

    try {
      const refresh = req.query.refresh === '1';
      const groups = refresh || context.runtime.getGroupCache().length === 0
        ? await context.runtime.listGroups()
        : context.runtime.getGroupCache();
      res.json({ groups, count: groups.length });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Tai groups that bai' });
    }
  })();
});

app.get('/api/conversations/:conversationId/messages', (req, res) => {
  void (async () => {
    const context = await getLegacyPrimaryContextOrRespond(res, '/api/accounts/:accountId/conversations/:conversationId/messages');
    if (!context) {
      return;
    }

    const conversationId = String(req.params.conversationId ?? '').trim();
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

    if (!conversationId) {
      res.status(400).json({ error: 'conversationId la bat buoc' });
      return;
    }

    try {
      const messages = context.runtime.getConversationMessages(conversationId, { since, before, limit });
      const oldestTimestamp = messages[0]?.timestamp;
      const hasMore = Boolean(before ? messages.length === (limit ?? 40) : oldestTimestamp);
      res.json({ conversationId, messages, count: messages.length, oldestTimestamp, hasMore });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Tai conversation that bai' });
    }
  })();
});

app.post('/api/conversations/:conversationId/sync-metadata', (req, res) => {
  void (async () => {
    const context = await getLegacyPrimaryContextOrRespond(res, '/api/accounts/:accountId/conversations/:conversationId/sync-metadata');
    if (!context) {
      return;
    }

    const conversationId = String(req.params.conversationId ?? '').trim();
    if (!conversationId) {
      res.status(400).json({ error: 'conversationId la bat buoc' });
      return;
    }

    try {
      const result = await context.runtime.syncConversationMetadata(conversationId);
      broadcast({ type: 'conversation_summaries', accountId: context.accountId, conversations: context.runtime.getConversationSummaries() });
      broadcast({ type: 'session_state', accountId: context.accountId, status: getStatusForRuntime(context.runtime) });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Sync metadata that bai' });
    }
  })();
});

app.post('/api/conversations/sync-history', (req, res) => {
  void (async () => {
    const context = await getLegacyPrimaryContextOrRespond(res, '/api/accounts/:accountId/conversations/sync-history');
    if (!context) {
      return;
    }

    const conversationId = String(req.body?.conversationId ?? '').trim();
    const beforeMessageId = typeof req.body?.beforeMessageId === 'string' ? req.body.beforeMessageId.trim() : undefined;
    const timeoutMs = typeof req.body?.timeoutMs === 'number' ? req.body.timeoutMs : undefined;

    if (!conversationId) {
      res.status(400).json({ error: 'conversationId la bat buoc' });
      return;
    }

    try {
      const result = await context.runtime.syncConversationHistory(conversationId, { beforeMessageId, timeoutMs });
      broadcast({ type: 'conversation_summaries', accountId: context.accountId, conversations: context.runtime.getConversationSummaries() });
      broadcast({ type: 'session_state', accountId: context.accountId, status: getStatusForRuntime(context.runtime) });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Sync history that bai' });
    }
  })();
});

app.get('/api/conversations', (_req, res) => {
  void (async () => {
    const context = await getLegacyPrimaryContextOrRespond(res, '/api/accounts/:accountId/conversations');
    if (!context) {
      return;
    }

    try {
      const conversations = context.runtime.getConversationSummaries();
      res.json({ conversations, count: conversations.length });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Tai conversations that bai' });
    }
  })();
});

app.post('/api/send', (req, res) => {
  void (async () => {
    const context = await getLegacyPrimaryContextOrRespond(res, '/api/accounts/:accountId/send');
    if (!context) {
      return;
    }

    const conversationId = String(req.body?.conversationId ?? '').trim();
    const text = String(req.body?.text ?? '').trim();
    const imageBase64 = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64.trim() : '';
    const imageFileName = typeof req.body?.imageFileName === 'string' ? req.body.imageFileName.trim() : '';
    const imageMimeType = typeof req.body?.imageMimeType === 'string' ? req.body.imageMimeType.trim() : '';

    logger.info('gold2_send_requested', {
      conversationId,
      textLength: text.length,
      hasImage: Boolean(imageBase64),
      imageFileName,
      imageMimeType,
      imageBase64Length: imageBase64.length,
    });

    if (!conversationId) {
      res.status(400).json({ error: 'conversationId la bat buoc' });
      return;
    }

    try {
      let result;
      if (imageBase64) {
        if (!imageFileName || !imageMimeType) {
          res.status(400).json({ error: 'imageFileName va imageMimeType la bat buoc khi gui anh' });
          return;
        }

        const imageBuffer = Buffer.from(imageBase64, 'base64');
        result = await context.runtime.sendImage(conversationId, {
          imageBuffer,
          fileName: imageFileName,
          mimeType: imageMimeType,
          caption: text || undefined,
        });
      } else {
        if (!text) {
          res.status(400).json({ error: 'Can co text hoac image de gui' });
          return;
        }

        result = await context.runtime.sendText(conversationId, text);
      }

      broadcast({ type: 'conversation_summaries', accountId: context.accountId, conversations: context.runtime.getConversationSummaries() });
      broadcast({ type: 'session_state', accountId: context.accountId, status: getStatusForRuntime(context.runtime) });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Gui tin that bai' });
    }
  })();
});

app.post('/api/send-attachment', upload.single('file'), (req, res) => {
  void (async () => {
    const context = await getLegacyPrimaryContextOrRespond(res, '/api/accounts/:accountId/send-attachment');
    if (!context) return;

    const conversationId = String(req.body?.conversationId ?? '').trim();
    const caption = String(req.body?.caption ?? '').trim();

    if (!conversationId) {
      res.status(400).json({ error: 'conversationId la bat buoc' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'File la bat buoc' });
      return;
    }

    logger.info('gold2_send_attachment_requested', {
      conversationId,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });

    try {
      const result = await context.runtime.sendAttachment(conversationId, {
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        caption: caption || undefined,
      });

      broadcast({ type: 'conversation_summaries', accountId: context.accountId, conversations: context.runtime.getConversationSummaries() });
      broadcast({ type: 'session_state', accountId: context.accountId, status: getStatusForRuntime(context.runtime) });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Gui file that bai' });
    }
  })();
});

app.post('/api/media/backfill', (_req, res) => {
  void (async () => {
    const context = await getLegacyPrimaryContextOrRespond(res, '/api/accounts/:accountId/conversations');
    if (!context) return;

    try {
      const result = await context.runtime.backfillMediaForStoredMessages();
      broadcast({ type: 'conversation_summaries', accountId: context.accountId, conversations: context.runtime.getConversationSummaries() });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Backfill media that bai' });
    }
  })();
});

app.get('*', (_req, res) => {
  const target = path.join(gold4ClientDir, 'index.html');
  res.sendFile(target, (error) => {
    if (!error) {
      return;
    }

    res.sendFile(path.join(clientDir, 'index.html'));
  });
});

server.listen(port, () => {
  console.log(`gold-2-web running at http://localhost:${port}`);
  void accountManager.warmStartAllAccounts();
});
