import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import multer from 'multer';
import { GoldLogger } from '../gold-1/logger.js';
import { GoldRuntime } from '../gold-1/runtime.js';
import { GoldStore } from '../gold-1/store.js';
import type { GoldConversationMessage } from '../gold-1/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, 'client');
const gold4ClientDir = path.resolve(__dirname, '../../dist/gold-4-web');

const logger = new GoldLogger();
const runtime = new GoldRuntime(new GoldStore(), logger);
const app = express();
const port = Number(process.env.GOLD2_PORT ?? 3399);
const server = createServer(app);
const wsServer = new WebSocketServer({ server, path: '/ws' });

let loginPromise: Promise<void> | undefined;

const wsSubscriptions = new Map<WebSocket, string>();

function broadcast(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  for (const client of wsServer.clients) {
    if (client.readyState !== client.OPEN) {
      continue;
    }

    client.send(body);
  }
}

function broadcastConversationMessage(message: GoldConversationMessage) {
  const payload = JSON.stringify({ type: 'conversation_message', message });
  for (const client of wsServer.clients) {
    if (client.readyState !== client.OPEN) {
      continue;
    }

    if (wsSubscriptions.get(client) !== message.friendId) {
      continue;
    }

    client.send(payload);
  }
}

runtime.onConversationMessage((message) => {
  broadcastConversationMessage(message);
  broadcast({ type: 'conversation_summaries', conversations: runtime.getConversationSummaries() });
  broadcast({ type: 'session_state', status: getStatus() });
});

wsServer.on('connection', (socket: WebSocket) => {
  socket.send(JSON.stringify({ type: 'connected' }));
  socket.send(JSON.stringify({ type: 'conversation_summaries', conversations: runtime.getConversationSummaries() }));
  socket.send(JSON.stringify({ type: 'session_state', status: getStatus() }));

  socket.on('message', (raw: string | Buffer) => {
    try {
      const payload = JSON.parse(String(raw)) as { type?: string; friendId?: string };
      if (payload.type === 'subscribe' && payload.friendId) {
        wsSubscriptions.set(socket, String(payload.friendId));
        socket.send(JSON.stringify({ type: 'subscribed', friendId: String(payload.friendId) }));
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

function getStatus(loginInProgress = Boolean(loginPromise)) {
  const account = runtime.getCurrentAccount();
  return {
    hasCredential: runtime.hasCredential(),
    sessionActive: runtime.isSessionActive(),
    friendCacheCount: runtime.getFriendCache().length,
    qrCodeAvailable: Boolean(runtime.getCurrentQrCode()),
    account,
    listener: runtime.getListenerState(),
    loginInProgress,
    loggedIn: Boolean(runtime.hasCredential() || runtime.isSessionActive() || account?.userId || account?.displayName),
  };
}

function requireActiveSession(res: express.Response) {
  if (runtime.isSessionActive()) {
    return true;
  }

  res.status(401).json({ error: 'Phien dang nhap khong con active. Hay dang nhap lai.' });
  return false;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'gold-2-web', ...getStatus() });
});

app.get('/api/status', (_req, res) => {
  void (async () => {
    if (!loginPromise && runtime.hasCredential() && !runtime.isSessionActive()) {
      await runtime.loginWithStoredCredential().catch((error) => {
        logger.error('gold2_status_reconnect_failed', error);
      });
    }

    if (runtime.hasCredential() && !runtime.getCurrentAccount()) {
      await runtime.fetchAccountInfo().catch((error) => {
        logger.error('gold2_status_account_fetch_failed', error);
      });
    }

    res.json(getStatus());
  })();
});

app.post('/api/login/start', (_req, res) => {
  if (!loginPromise) {
    logger.info('gold2_login_start_requested');
    loginPromise = runtime
      .loginByQr({
        onQr(qrCode) {
          logger.info('gold2_qr_ready', { qrLength: qrCode.length });
        },
      })
      .then(() => {
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

  res.json({ started: true, qrCodeAvailable: Boolean(runtime.getCurrentQrCode()) });
});

app.get('/api/login/qr', (_req, res) => {
  const qrCode = runtime.getCurrentQrCode();
  if (!qrCode) {
    res.status(404).json({ error: 'QR chua san sang' });
    return;
  }

  res.json({ qrCode });
});

app.post('/api/logout', (_req, res) => {
  const result = runtime.logout();
  logger.info('gold2_logout_completed');
  res.json(result);
});

app.get('/api/friends', (req, res) => {
  void (async () => {
    try {
      if (!requireActiveSession(res)) {
        return;
      }

      const refresh = req.query.refresh === '1';
      const friends = refresh || runtime.getFriendCache().length === 0
        ? await runtime.listFriends()
        : runtime.getFriendCache();
      if (!runtime.getCurrentAccount()) {
        await runtime.fetchAccountInfo().catch((error) => {
          logger.error('gold2_friends_account_fetch_failed', error);
        });
      }
      res.json({ friends, count: friends.length });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Tai friends that bai' });
    }
  })();
});

app.get('/api/conversations/:friendId/messages', (req, res) => {
  const friendId = String(req.params.friendId ?? '').trim();
  const since = typeof req.query.since === 'string' ? req.query.since : undefined;

  if (!requireActiveSession(res)) {
    return;
  }

  if (!friendId) {
    res.status(400).json({ error: 'friendId la bat buoc' });
    return;
  }

  try {
    const messages = runtime.getConversationMessages(friendId, since);
    res.json({ friendId, messages, count: messages.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Tai conversation that bai' });
  }
});

app.get('/api/conversations', (_req, res) => {
  if (!requireActiveSession(res)) {
    return;
  }

  try {
    const conversations = runtime.getConversationSummaries();
    res.json({ conversations, count: conversations.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Tai conversations that bai' });
  }
});

app.post('/api/send', (req, res) => {
  void (async () => {
    if (!requireActiveSession(res)) {
      return;
    }

    const friendId = String(req.body?.friendId ?? '').trim();
    const text = String(req.body?.text ?? '').trim();
    const imageBase64 = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64.trim() : '';
    const imageFileName = typeof req.body?.imageFileName === 'string' ? req.body.imageFileName.trim() : '';
    const imageMimeType = typeof req.body?.imageMimeType === 'string' ? req.body.imageMimeType.trim() : '';

    logger.info('gold2_send_requested', {
      friendId,
      textLength: text.length,
      hasImage: Boolean(imageBase64),
      imageFileName,
      imageMimeType,
      imageBase64Length: imageBase64.length,
    });

    if (!friendId) {
      res.status(400).json({ error: 'friendId la bat buoc' });
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
        result = await runtime.sendImage(friendId, {
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

        result = await runtime.sendText(friendId, text);
      }

      broadcast({ type: 'conversation_summaries', conversations: runtime.getConversationSummaries() });
      broadcast({ type: 'session_state', status: getStatus() });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Gui tin that bai' });
    }
  })();
});

app.post('/api/send-attachment', upload.single('file'), (req, res) => {
  void (async () => {
    if (!requireActiveSession(res)) return;

    const friendId = String(req.body?.friendId ?? '').trim();
    const caption = String(req.body?.caption ?? '').trim();

    if (!friendId) {
      res.status(400).json({ error: 'friendId la bat buoc' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'File la bat buoc' });
      return;
    }

    logger.info('gold2_send_attachment_requested', {
      friendId,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });

    try {
      const result = await runtime.sendAttachment(friendId, {
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        caption: caption || undefined,
      });

      broadcast({ type: 'conversation_summaries', conversations: runtime.getConversationSummaries() });
      broadcast({ type: 'session_state', status: getStatus() });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Gui file that bai' });
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
});
