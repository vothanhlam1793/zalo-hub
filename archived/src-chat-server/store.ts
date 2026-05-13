import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ChannelRecord,
  ChatAppState,
  ContactRecord,
  ConversationRecord,
  MessageRecord,
  WorkspaceRecord,
  WorkspaceUserRecord,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const statePath = path.resolve(__dirname, '../../data/chat-state.json');
const stateDir = path.dirname(statePath);

function ensureStateDir() {
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
}

function now() {
  return new Date().toISOString();
}

function buildInitialState(): ChatAppState {
  const timestamp = now();
  const workspace: WorkspaceRecord = {
    id: randomUUID(),
    name: 'Default Workspace',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const user: WorkspaceUserRecord = {
    id: randomUUID(),
    workspaceId: workspace.id,
    displayName: 'Operator One',
    email: 'operator@example.com',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const channel: ChannelRecord = {
    id: randomUUID(),
    workspaceId: workspace.id,
    name: 'Local Demo Channel',
    provider: 'local',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const contact: ContactRecord = {
    id: randomUUID(),
    workspaceId: workspace.id,
    channelId: channel.id,
    displayName: 'Demo Customer',
    externalContactId: 'local-demo-customer',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const conversation: ConversationRecord = {
    id: randomUUID(),
    workspaceId: workspace.id,
    channelId: channel.id,
    contactId: contact.id,
    title: 'Demo Customer',
    status: 'open',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const welcome: MessageRecord = {
    id: randomUUID(),
    workspaceId: workspace.id,
    channelId: channel.id,
    conversationId: conversation.id,
    senderType: 'system',
    senderRefId: 'system',
    senderName: 'Chat Server',
    text: 'Chat-server skeleton da san sang. Ban co the gui tin local de test domain.',
    direction: 'inbound',
    createdAt: timestamp,
  };

  return {
    workspaces: [workspace],
    users: [user],
    channels: [channel],
    contacts: [contact],
    conversations: [conversation],
    messages: [welcome],
  };
}

function persistState(state: ChatAppState) {
  ensureStateDir();
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function loadState(): ChatAppState {
  const fallback = buildInitialState();
  ensureStateDir();

  if (!existsSync(statePath)) {
    persistState(fallback);
    return fallback;
  }

  const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as Partial<ChatAppState>;
  const state: ChatAppState = {
    workspaces: parsed.workspaces ?? [],
    users: parsed.users ?? [],
    channels: parsed.channels ?? [],
    contacts: parsed.contacts ?? [],
    conversations: parsed.conversations ?? [],
    messages: parsed.messages ?? [],
  };

  if (state.workspaces.length === 0) {
    persistState(fallback);
    return fallback;
  }

  return state;
}

export class ChatFileStore {
  private state: ChatAppState;

  constructor() {
    this.state = loadState();
  }

  listWorkspaces() {
    return this.state.workspaces;
  }

  listUsers(workspaceId?: string) {
    return this.state.users.filter((item) => !workspaceId || item.workspaceId === workspaceId);
  }

  listChannels(workspaceId?: string) {
    return this.state.channels.filter((item) => !workspaceId || item.workspaceId === workspaceId);
  }

  getChannel(channelId: string) {
    return this.state.channels.find((item) => item.id === channelId);
  }

  createChannel(workspaceId: string, name: string) {
    const channel: ChannelRecord = {
      id: randomUUID(),
      workspaceId,
      name,
      provider: 'local',
      status: 'active',
      createdAt: now(),
      updatedAt: now(),
    };
    this.state.channels.unshift(channel);
    this.save();
    return channel;
  }

  updateChannel(channelId: string, patch: Partial<ChannelRecord>) {
    const channel = this.getChannel(channelId);
    if (!channel) return undefined;
    Object.assign(channel, patch, { updatedAt: now() });
    this.save();
    return channel;
  }

  startMockQrLogin(channelId: string) {
    const qrCode = Buffer.from(`mock-qr:${channelId}:${Date.now()}`).toString('base64');
    return this.updateChannel(channelId, {
      status: 'qr_pending',
      qrCode,
      lastError: undefined,
    });
  }

  connectChannel(channelId: string) {
    return this.updateChannel(channelId, {
      status: 'connected',
      qrCode: undefined,
      lastError: undefined,
    });
  }

  reconnectChannel(channelId: string) {
    const channel = this.getChannel(channelId);
    if (!channel) return undefined;
    if (channel.status === 'disabled') {
      return this.updateChannel(channelId, { status: 'error', lastError: 'Channel is disabled' });
    }
    return this.connectChannel(channelId);
  }

  syncContacts(channelId: string) {
    const channel = this.getChannel(channelId);
    if (!channel) throw new Error('Channel not found');

    const existing = this.state.contacts.find(
      (item) => item.channelId === channelId && item.externalContactId === 'local-synced-contact',
    );
    if (existing) return existing;

    const contact: ContactRecord = {
      id: randomUUID(),
      workspaceId: channel.workspaceId,
      channelId,
      displayName: 'Synced Contact',
      externalContactId: 'local-synced-contact',
      createdAt: now(),
      updatedAt: now(),
    };
    this.state.contacts.unshift(contact);
    this.save();
    return contact;
  }

  listContacts(channelId?: string) {
    return this.state.contacts.filter((item) => !channelId || item.channelId === channelId);
  }

  upsertContact(input: Omit<ContactRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    const existing = this.state.contacts.find(
      (item) => item.channelId === input.channelId && item.externalContactId === input.externalContactId,
    );

    if (existing) {
      existing.displayName = input.displayName;
      existing.updatedAt = now();
      this.save();
      return existing;
    }

    const contact: ContactRecord = {
      id: randomUUID(),
      createdAt: now(),
      updatedAt: now(),
      ...input,
    };
    this.state.contacts.unshift(contact);
    this.save();
    return contact;
  }

  listConversations(channelId?: string) {
    return this.state.conversations.filter((item) => !channelId || item.channelId === channelId);
  }

  createConversation(channelId: string, contactName: string) {
    const channel = this.state.channels.find((item) => item.id === channelId);
    if (!channel) throw new Error('Channel not found');

    const timestamp = now();
    const contact: ContactRecord = {
      id: randomUUID(),
      workspaceId: channel.workspaceId,
      channelId,
      displayName: contactName,
      externalContactId: `local-${randomUUID()}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const conversation: ConversationRecord = {
      id: randomUUID(),
      workspaceId: channel.workspaceId,
      channelId,
      contactId: contact.id,
      title: contactName,
      status: 'open',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.state.contacts.unshift(contact);
    this.state.conversations.unshift(conversation);
    this.save();
    return { contact, conversation };
  }

  ensureConversationForContact(channelId: string, contactId: string, title: string) {
    const channel = this.state.channels.find((item) => item.id === channelId);
    if (!channel) throw new Error('Channel not found');

    const existing = this.state.conversations.find(
      (item) => item.channelId === channelId && item.contactId === contactId,
    );
    if (existing) {
      existing.title = title;
      existing.updatedAt = now();
      this.save();
      return existing;
    }

    const conversation: ConversationRecord = {
      id: randomUUID(),
      workspaceId: channel.workspaceId,
      channelId,
      contactId,
      title,
      status: 'open',
      createdAt: now(),
      updatedAt: now(),
    };
    this.state.conversations.unshift(conversation);
    this.save();
    return conversation;
  }

  listMessages(conversationId: string) {
    return this.state.messages.filter((item) => item.conversationId === conversationId);
  }

  appendMessage(input: Omit<MessageRecord, 'id' | 'createdAt'>) {
    const message: MessageRecord = {
      id: randomUUID(),
      createdAt: now(),
      ...input,
    };
    this.state.messages.push(message);

    const conversation = this.state.conversations.find((item) => item.id === input.conversationId);
    if (conversation) {
      conversation.updatedAt = message.createdAt;
    }

    this.save();
    return message;
  }

  save() {
    persistState(this.state);
  }
}
