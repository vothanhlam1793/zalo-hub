import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatFileStore } from './store.js';

const zaloServiceBaseUrl = process.env.ZALO_SERVICE_URL ?? 'http://localhost:3299';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, 'client');

const app = express();
const store = new ChatFileStore();
const port = Number(process.env.CHAT_PORT ?? 3199);

async function ensureZaloChannel(channelId: string) {
  const channel = store.getChannel(channelId);
  if (!channel) throw new Error('Channel not found');

  const response = await fetch(`${zaloServiceBaseUrl}/api/channels/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelId: channel.id,
      workspaceId: channel.workspaceId,
      name: channel.name,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to ensure Zalo channel');
  }
}

async function postToZaloService(pathname: string, options: RequestInit = {}) {
  const response = await fetch(`${zaloServiceBaseUrl}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Zalo service request failed');
  }
  return body;
}

async function syncChannelRuntime(channelId: string) {
  const runtime = await postToZaloService(`/api/channels/${channelId}`);
  const channel = store.updateChannel(channelId, {
    status: runtime.status === 'disconnected' || runtime.status === 'draft' ? 'active' : runtime.status,
    qrCode: runtime.qrCode,
    lastError: runtime.lastError,
  });
  return channel;
}

async function importContactsFromZaloService(channelId: string) {
  const channel = store.getChannel(channelId);
  if (!channel) {
    throw new Error('Channel not found');
  }

  const friends = await postToZaloService(`/api/channels/${channelId}/friends`);
  const importedContacts = Array.isArray(friends)
    ? friends.map((friend) => store.upsertContact({
        workspaceId: channel.workspaceId,
        channelId,
        displayName: String(friend.displayName || friend.zaloName || friend.userId),
        externalContactId: String(friend.userId),
      }))
    : [];

  return { friends, contacts: importedContacts };
}

async function syncWorkspaceChannelRuntime(workspaceId?: string) {
  const channels = store.listChannels(workspaceId);
  await Promise.all(
    channels.map(async (channel) => {
      try {
        await ensureZaloChannel(channel.id);
        await syncChannelRuntime(channel.id);
      } catch {
        // Keep last known local state if runtime service is unreachable.
      }
    }),
  );
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(clientDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'chat-server', phase: 1 });
});

app.get('/api/workspaces', (_req, res) => {
  res.json(store.listWorkspaces());
});

app.get('/api/users', (req, res) => {
  const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
  res.json(store.listUsers(workspaceId));
});

app.get('/api/channels', (req, res) => {
  void (async () => {
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
    await syncWorkspaceChannelRuntime(workspaceId);
    res.json(store.listChannels(workspaceId));
  })();
});

app.get('/api/channels/:channelId', (req, res) => {
  void (async () => {
    try {
      await ensureZaloChannel(req.params.channelId);
      const channel = await syncChannelRuntime(req.params.channelId);
      if (!channel) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }
      res.json(channel);
    } catch {
      const channel = store.getChannel(req.params.channelId);
      if (!channel) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }
      res.json(channel);
    }
  })();
});

app.post('/api/channels', (req, res) => {
  const workspaceId = String(req.body?.workspaceId ?? '').trim();
  const name = String(req.body?.name ?? '').trim();

  if (!workspaceId || !name) {
    res.status(400).json({ error: 'workspaceId and name are required' });
    return;
  }

  void (async () => {
    try {
      const channel = store.createChannel(workspaceId, name);
      await ensureZaloChannel(channel.id);
      const syncedChannel = await syncChannelRuntime(channel.id).catch(() => channel);
      res.status(201).json(syncedChannel);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Create channel failed' });
    }
  })();
});

app.post('/api/channels/:channelId/qr-login', (req, res) => {
  void (async () => {
    try {
      await ensureZaloChannel(req.params.channelId);
      await postToZaloService(`/api/channels/${req.params.channelId}/qr-login`, { method: 'POST' });
      const channel = await syncChannelRuntime(req.params.channelId);
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'QR login failed' });
    }
  })();
});

app.post('/api/channels/:channelId/connect', (req, res) => {
  void (async () => {
    try {
      await ensureZaloChannel(req.params.channelId);
      await postToZaloService(`/api/channels/${req.params.channelId}/connect`, { method: 'POST' });
      const channel = await syncChannelRuntime(req.params.channelId);
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Connect failed' });
    }
  })();
});

app.post('/api/channels/:channelId/reconnect', (req, res) => {
  void (async () => {
    try {
      await ensureZaloChannel(req.params.channelId);
      await postToZaloService(`/api/channels/${req.params.channelId}/reconnect`, { method: 'POST' });
      const channel = await syncChannelRuntime(req.params.channelId);
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Reconnect failed' });
    }
  })();
});

app.post('/api/channels/:channelId/sync-contacts', (req, res) => {
  void (async () => {
    try {
      await ensureZaloChannel(req.params.channelId);
      const channel = await syncChannelRuntime(req.params.channelId);
      if (!channel || channel.status !== 'connected') {
        res.status(400).json({ error: 'Channel chua connected, khong the dong bo contact' });
        return;
      }

      try {
        await postToZaloService(`/api/channels/${req.params.channelId}/sync-contacts`, { method: 'POST' });
      } catch {
        // Fall back to already cached friends if runtime session was lost after login.
      }

      const syncedChannel = await syncChannelRuntime(req.params.channelId).catch(() => channel);
      const imported = await importContactsFromZaloService(req.params.channelId);
      res.json({ channel: syncedChannel, friends: imported.friends, contacts: imported.contacts });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync contacts failed';
      res.status(message.includes('Khong con session active') ? 400 : 500).json({ error: message });
    }
  })();
});

app.get('/api/contacts', (req, res) => {
  const channelId = typeof req.query.channelId === 'string' ? req.query.channelId : undefined;
  res.json(store.listContacts(channelId));
});

app.get('/api/conversations', (req, res) => {
  const channelId = typeof req.query.channelId === 'string' ? req.query.channelId : undefined;
  res.json(store.listConversations(channelId));
});

app.post('/api/conversations', (req, res) => {
  const channelId = String(req.body?.channelId ?? '').trim();
  const contactName = String(req.body?.contactName ?? '').trim();
  const contactId = String(req.body?.contactId ?? '').trim();

  if (!channelId || (!contactName && !contactId)) {
    res.status(400).json({ error: 'channelId and contactName or contactId are required' });
    return;
  }

  try {
    if (contactId) {
      const contact = store.listContacts(channelId).find((item) => item.id === contactId);
      if (!contact) {
        res.status(404).json({ error: 'Contact not found' });
        return;
      }
      const conversation = store.ensureConversationForContact(channelId, contact.id, contact.displayName);
      res.status(201).json({ contact, conversation });
      return;
    }

    const result = store.createConversation(channelId, contactName);
    res.status(201).json(result);
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : 'Create conversation failed' });
  }
});

app.get('/api/conversations/:conversationId/messages', (req, res) => {
  res.json(store.listMessages(req.params.conversationId));
});

app.post('/api/messages', (req, res) => {
  const workspaceId = String(req.body?.workspaceId ?? '').trim();
  const channelId = String(req.body?.channelId ?? '').trim();
  const conversationId = String(req.body?.conversationId ?? '').trim();
  const senderType = req.body?.senderType === 'contact' ? 'contact' : 'workspace_user';
  const senderRefId = String(req.body?.senderRefId ?? '').trim();
  const senderName = String(req.body?.senderName ?? '').trim();
  const text = String(req.body?.text ?? '').trim();

  if (!workspaceId || !channelId || !conversationId || !senderRefId || !senderName || !text) {
    res.status(400).json({ error: 'workspaceId, channelId, conversationId, senderRefId, senderName and text are required' });
    return;
  }

  const message = store.appendMessage({
    workspaceId,
    channelId,
    conversationId,
    senderType,
    senderRefId,
    senderName,
    text,
    direction: senderType === 'contact' ? 'inbound' : 'outbound',
  });
  res.status(201).json(message);
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`chat-server running at http://localhost:${port}`);
});
