import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StoredCredential, ZaloChannelRecord, ZaloChannelStatus, ZaloFriendRecord, ZaloServiceState } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const statePath = path.resolve(__dirname, '../../data/zalo-service-state.json');
const stateDir = path.dirname(statePath);

function ensureStateDir() {
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
}

const initialState: ZaloServiceState = {
  channels: [],
  friends: [],
};

function persistState(state: ZaloServiceState) {
  ensureStateDir();
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function loadState() {
  ensureStateDir();
  if (!existsSync(statePath)) {
    persistState(initialState);
    return initialState;
  }

  const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as Partial<ZaloServiceState>;
  return {
    channels: parsed.channels ?? [],
    friends: parsed.friends ?? [],
  } satisfies ZaloServiceState;
}

export class ZaloServiceStore {
  private state = loadState();

  listChannels() {
    return this.state.channels;
  }

  getChannel(channelId: string) {
    return this.state.channels.find((item) => item.channelId === channelId);
  }

  ensureChannel(input: { channelId: string; workspaceId: string; name: string }) {
    const existing = this.getChannel(input.channelId);
    if (existing) {
      Object.assign(existing, { workspaceId: input.workspaceId, name: input.name, updatedAt: new Date().toISOString() });
      this.save();
      return existing;
    }

    const record: ZaloChannelRecord = {
      channelId: input.channelId,
      workspaceId: input.workspaceId,
      name: input.name,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.state.channels.unshift(record);
    this.save();
    return record;
  }

  updateChannel(channelId: string, patch: Partial<ZaloChannelRecord>) {
    const channel = this.getChannel(channelId);
    if (!channel) return undefined;
    Object.assign(channel, patch, { updatedAt: new Date().toISOString() });
    this.save();
    return channel;
  }

  setChannelStatus(channelId: string, status: ZaloChannelStatus, extra: Partial<ZaloChannelRecord> = {}) {
    return this.updateChannel(channelId, { status, ...extra });
  }

  setChannelCredential(channelId: string, credential: StoredCredential) {
    return this.updateChannel(channelId, { credential, status: 'connected', qrCode: undefined, lastError: undefined });
  }

  listFriends(channelId: string) {
    return this.state.friends.filter((item) => item.channelId === channelId);
  }

  replaceFriends(channelId: string, friends: Omit<ZaloFriendRecord, 'id'>[]) {
    this.state.friends = this.state.friends.filter((item) => item.channelId !== channelId);
    this.state.friends.push(
      ...friends.map((friend) => ({
        id: randomUUID(),
        ...friend,
      })),
    );
    this.save();
  }

  save() {
    persistState(this.state);
  }
}
