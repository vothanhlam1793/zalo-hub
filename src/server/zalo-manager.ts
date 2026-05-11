import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as ZaloApi from 'zalo-api-final';
import { FileStore } from './store.js';
import type { StoredCredential } from './types.js';

const { Zalo } = ZaloApi as { Zalo: new (options?: Record<string, unknown>) => any };
const ThreadType = (ZaloApi as { ThreadType?: { User: number; Group: number } }).ThreadType ?? { User: 0, Group: 1 };

type ActiveSession = {
  zalo: InstanceType<typeof Zalo>;
  api?: any;
};

export class ZaloManager {
  private sessions = new Map<string, ActiveSession>();

  private qrFlows = new Map<string, Promise<void>>();

  constructor(private readonly store: FileStore) {}

  async warmupStoredAccounts() {
    const accounts = this.store.listAccounts().filter((account) => account.credential);

    for (const account of accounts) {
      try {
        await this.connectStoredAccount(account.id);
      } catch {
        // Keep persisted status for now; the UI can trigger reconnect/QR login again.
      }
    }
  }

  private async loadQrInternals() {
    const basePath = path.join(process.cwd(), 'node_modules', 'zalo-api-final', 'dist');
    const [{ loginQR }, { createContext }, { generateZaloUUID }] = await Promise.all([
      import(pathToFileURL(path.join(basePath, 'apis', 'loginQR.js')).href),
      import(pathToFileURL(path.join(basePath, 'context.js')).href),
      import(pathToFileURL(path.join(basePath, 'utils.js')).href),
    ]);

    return {
      loginQR: loginQR as (ctx: any, options: { userAgent: string; language?: string }, callback?: (event: any) => void) => Promise<any>,
      createContext: createContext as (apiType?: number, apiVersion?: number) => any,
      generateZaloUUID: generateZaloUUID as (userAgent: string) => string,
    };
  }

  async startQrLogin(accountId: string) {
    const account = this.store.getAccount(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
    const { loginQR, createContext, generateZaloUUID } = await this.loadQrInternals();
    const ctx = createContext();
    ctx.options = { ...(ctx.options ?? {}), selfListen: true, logging: true };
    ctx.userAgent = userAgent;

    if (this.qrFlows.has(accountId)) {
      return { accountId, qrCode: account.qrCode ?? '' };
    }

    let latestQrCode = account.qrCode ?? '';

    const qrReady = new Promise<string>((resolve, reject) => {
      let resolved = false;

      const flow = loginQR(ctx, { userAgent, language: 'vi' }, (event: any) => {
        if (event?.type === 0 && event?.data?.image) {
          latestQrCode = event.data.image;
          this.store.setAccountStatus(accountId, 'qr_pending', { qrCode: latestQrCode, lastError: undefined });
          if (!resolved) {
            resolved = true;
            resolve(latestQrCode);
          }
        }

        if (event?.type === 4 && event?.data) {
          const credential: StoredCredential = {
            cookie: JSON.stringify(event.data.cookie ?? []),
            imei: event.data.imei ?? generateZaloUUID(userAgent),
            userAgent: event.data.userAgent ?? userAgent,
          };

          this.store.setAccountCredential(accountId, credential);
        }

        if (event?.type === 3) {
          this.store.setAccountStatus(accountId, 'error', { lastError: 'QR login was declined', qrCode: undefined });
        }
      })
        .then(async (result: any) => {
          if (!result) {
            throw new Error('QR login ended without a confirmed session');
          }

          const credential: StoredCredential = {
            cookie: JSON.stringify(result.cookies ?? []),
            imei: generateZaloUUID(userAgent),
            userAgent,
          };

          this.store.setAccountCredential(accountId, credential);
          await this.connectStoredAccount(accountId);
        })
        .catch(async (error: unknown) => {
          const cookieJar = typeof ctx.cookie?.toJSON === 'function' ? ctx.cookie.toJSON() : undefined;
          const fallbackCookies = Array.isArray(cookieJar?.cookies) ? cookieJar.cookies : [];

          // Some QR flows end with a false negative from the library even though
          // the desktop session cookies are already present. Try to recover first.
          if (fallbackCookies.length > 0) {
            try {
              const credential: StoredCredential = {
                cookie: JSON.stringify(fallbackCookies),
                imei: generateZaloUUID(userAgent),
                userAgent,
              };

              this.store.setAccountCredential(accountId, credential);
              await this.connectStoredAccount(accountId);

              if (!resolved) {
                resolved = true;
                resolve(latestQrCode || '');
              }
              return;
            } catch {
              // Fall through to the original error handling below.
            }
          }

          const message = error instanceof Error ? error.message : 'QR login failed';
          const current = this.store.getAccount(accountId);
          if (current?.status !== 'connected') {
            this.store.setAccountStatus(accountId, 'error', { lastError: message });
          }
          if (!resolved) {
            resolved = true;
            reject(new Error(message));
          }
        })
        .finally(() => {
          this.qrFlows.delete(accountId);
        });

      this.qrFlows.set(accountId, flow.then(() => undefined));
    });

    try {
      const qrCode = await qrReady;
      return { accountId, qrCode };
    } catch (error) {
      this.store.setAccountStatus(accountId, 'error', {
        lastError: error instanceof Error ? error.message : 'Failed to start QR login',
      });
      throw error;
    }
  }

  async connectStoredAccount(accountId: string) {
    const account = this.store.getAccount(accountId);
    if (!account?.credential) {
      throw new Error('Stored credential not found');
    }

    const zalo = new Zalo({ selfListen: true, logging: true } as any);
    const api = await zalo.login({
      cookie: JSON.parse(account.credential.cookie),
      imei: account.credential.imei,
      userAgent: account.credential.userAgent,
    } as any);

    this.sessions.set(accountId, { zalo, api });
    this.store.setAccountStatus(accountId, 'connected', { lastError: undefined, qrCode: undefined });
    this.store.seedDemoConversation(accountId);
    await this.syncFriends(accountId);

    return { connected: true };
  }

  async syncFriends(accountId: string) {
    const session = this.sessions.get(accountId);
    if (!session?.api?.getAllFriends) {
      return [];
    }

    const friends = await session.api.getAllFriends();
    const mapped = (friends ?? []).map((friend: any) => ({
      accountId,
      userId: String(friend.userId),
      displayName: String(friend.displayName || friend.zaloName || friend.username || friend.userId),
      zaloName: friend.zaloName ? String(friend.zaloName) : undefined,
      avatar: friend.avatar ? String(friend.avatar) : undefined,
      status: friend.status ? String(friend.status) : undefined,
      phoneNumber: friend.phoneNumber ? String(friend.phoneNumber) : undefined,
      lastSyncAt: new Date().toISOString(),
    }));

    this.store.replaceFriends(accountId, mapped);

    for (const friend of mapped) {
      this.store.upsertConversation(accountId, friend.userId, friend.displayName, 'user', {
        subtitle: friend.status,
        avatar: friend.avatar,
      });
    }

    return mapped;
  }

  async sendMessage(accountId: string, conversationId: string, text: string) {
    const account = this.store.getAccount(accountId);
    if (!account) throw new Error('Account not found');

    const conversation = this.store.listConversations(accountId).find((item) => item.id === conversationId);
    if (!conversation) throw new Error('Conversation not found');

    const session = this.sessions.get(accountId);

    if (session?.api?.sendMessage) {
      try {
        const threadType = conversation.threadType === 'group' ? ThreadType.Group : ThreadType.User;
        await session.api.sendMessage({ msg: text }, conversation.threadId, threadType);
      } catch {
        // MVP mode: still store the message locally even if remote send fails.
      }
    }

    return this.store.appendMessage({
      accountId,
      conversationId,
      senderId: accountId,
      senderName: account.name,
      text,
      createdAt: new Date().toISOString(),
      direction: 'out',
    });
  }

  createLocalConversation(accountId: string, title: string) {
    return this.store.ensureConversation(accountId, randomUUID(), title, 'user');
  }

  createFriendConversation(accountId: string, userId: string) {
    const friend = this.store.listFriends(accountId).find((item) => item.userId === userId);
    if (!friend) throw new Error('Friend not found');

    return this.store.upsertConversation(accountId, friend.userId, friend.displayName, 'user', {
      subtitle: friend.status,
      avatar: friend.avatar,
    });
  }
}
