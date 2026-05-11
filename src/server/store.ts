import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AccountRecord,
  AgentWorkspaceRecord,
  AppState,
  ConversationRecord,
  FriendRecord,
  MessageRecord,
  StoredCredential,
  ZaloAccountStatus,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const statePath = path.resolve(__dirname, '../../data/state.json');

const initialState: AppState = {
  accounts: [],
  conversations: [],
  messages: [],
  agents: [],
  friends: [],
};

function loadState(): AppState {
  if (!existsSync(statePath)) {
    persistState(initialState);
    return initialState;
  }

  const raw = readFileSync(statePath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<AppState>;

  return {
    accounts: parsed.accounts ?? [],
    conversations: parsed.conversations ?? [],
    messages: parsed.messages ?? [],
    agents: parsed.agents ?? [],
    friends: parsed.friends ?? [],
  };
}

function persistState(state: AppState) {
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

export class FileStore {
  private state: AppState;

  constructor() {
    this.state = loadState();
  }

  listAccounts() {
    return this.state.accounts;
  }

  createAccount(name: string) {
    const now = new Date().toISOString();
    const account: AccountRecord = {
      id: randomUUID(),
      name,
      status: 'disconnected',
      createdAt: now,
      updatedAt: now,
    };

    this.state.accounts.unshift(account);
    this.state.agents.push({
      accountId: account.id,
      enabled: false,
      systemPrompt: 'You are a personal Zalo assistant inside MyChat.',
      notes: [],
    });
    this.save();
    return account;
  }

  updateAccount(id: string, patch: Partial<AccountRecord>) {
    const account = this.state.accounts.find((item) => item.id === id);
    if (!account) return undefined;
    Object.assign(account, patch, { updatedAt: new Date().toISOString() });
    this.save();
    return account;
  }

  getAccount(id: string) {
    return this.state.accounts.find((item) => item.id === id);
  }

  setAccountStatus(id: string, status: ZaloAccountStatus, extra: Partial<AccountRecord> = {}) {
    return this.updateAccount(id, { status, ...extra });
  }

  setAccountCredential(id: string, credential: StoredCredential) {
    return this.updateAccount(id, { credential, status: 'connected', qrCode: undefined, lastError: undefined });
  }

  listConversations(accountId?: string) {
    return this.state.conversations.filter((item) => !accountId || item.accountId === accountId);
  }

  ensureConversation(accountId: string, threadId: string, title: string, threadType: 'user' | 'group') {
    const existing = this.state.conversations.find(
      (item) => item.accountId === accountId && item.threadId === threadId,
    );

    if (existing) {
      existing.title = title;
      existing.threadType = threadType;
      existing.updatedAt = new Date().toISOString();
      this.save();
      return existing;
    }

    const conversation: ConversationRecord = {
      id: randomUUID(),
      accountId,
      threadId,
      threadType,
      title,
      unreadCount: 0,
      updatedAt: new Date().toISOString(),
    };

    this.state.conversations.unshift(conversation);
    this.save();
    return conversation;
  }

  upsertConversation(
    accountId: string,
    threadId: string,
    title: string,
    threadType: 'user' | 'group',
    patch: Partial<ConversationRecord> = {},
  ) {
    const conversation = this.ensureConversation(accountId, threadId, title, threadType);
    Object.assign(conversation, patch, { updatedAt: new Date().toISOString() });
    this.save();
    return conversation;
  }

  listMessages(conversationId: string) {
    return this.state.messages.filter((item) => item.conversationId === conversationId);
  }

  listFriends(accountId: string) {
    return this.state.friends.filter((item) => item.accountId === accountId);
  }

  replaceFriends(accountId: string, friends: Omit<FriendRecord, 'id'>[]) {
    this.state.friends = this.state.friends.filter((item) => item.accountId !== accountId);
    this.state.friends.push(
      ...friends.map((friend) => ({
        id: randomUUID(),
        ...friend,
      })),
    );
    this.save();
  }

  appendMessage(message: Omit<MessageRecord, 'id'>) {
    const record: MessageRecord = { id: randomUUID(), ...message };
    this.state.messages.push(record);

    const conversation = this.state.conversations.find((item) => item.id === message.conversationId);
    if (conversation) {
      conversation.updatedAt = message.createdAt;
      if (message.direction === 'in') conversation.unreadCount += 1;
    }

    this.save();
    return record;
  }

  getAgentWorkspace(accountId: string) {
    return this.state.agents.find((item) => item.accountId === accountId);
  }

  updateAgentWorkspace(accountId: string, patch: Partial<AgentWorkspaceRecord>) {
    const workspace = this.getAgentWorkspace(accountId);
    if (!workspace) return undefined;
    Object.assign(workspace, patch);
    this.save();
    return workspace;
  }

  seedDemoConversation(accountId: string) {
    const conversation = this.ensureConversation(accountId, `demo-${accountId}`, 'Ghi chu ca nhan', 'user');
    if (this.listMessages(conversation.id).length > 0) return conversation;

    this.appendMessage({
      accountId,
      conversationId: conversation.id,
      senderId: 'system',
      senderName: 'MyChat',
      text: 'Workspace da san sang. Ban co the gan Zalo account qua QR login o buoc tiep theo.',
      createdAt: new Date().toISOString(),
      direction: 'in',
    });
    return conversation;
  }

  save() {
    persistState(this.state);
  }
}
