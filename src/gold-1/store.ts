import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GoldFriendRecord, GoldState, GoldStoredCredential } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const statePath = path.resolve(__dirname, '../../data/gold-1-state.json');
const stateDir = path.dirname(statePath);

function ensureStateDir() {
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
}

function loadState(): GoldState {
  ensureStateDir();
  if (!existsSync(statePath)) {
    return { friends: [] };
  }

  const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as Partial<GoldState>;
  return {
    credential: parsed.credential,
    friends: parsed.friends ?? [],
    updatedAt: parsed.updatedAt,
  };
}

function persistState(state: GoldState) {
  ensureStateDir();
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

export class GoldStore {
  private state = loadState();

  getCredential() {
    return this.state.credential;
  }

  setCredential(credential: GoldStoredCredential) {
    this.state.credential = credential;
    this.state.updatedAt = new Date().toISOString();
    this.save();
  }

  listFriends() {
    return this.state.friends;
  }

  replaceFriends(friends: Omit<GoldFriendRecord, 'id'>[]) {
    this.state.friends = friends.map((friend) => ({ id: randomUUID(), ...friend }));
    this.state.updatedAt = new Date().toISOString();
    this.save();
    return this.state.friends;
  }

  clearAll() {
    this.state = {
      friends: [],
      updatedAt: new Date().toISOString(),
    };
    this.save();
  }

  save() {
    persistState(this.state);
  }
}
