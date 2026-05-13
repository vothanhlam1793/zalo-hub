import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as ZaloApi from 'zalo-api-final';
import { ZaloServiceStore } from './store.js';
import type { StoredCredential } from './types.js';

const { Zalo } = ZaloApi as { Zalo: new (options?: Record<string, unknown>) => any };

type ActiveSession = {
  zalo: InstanceType<typeof Zalo>;
  api?: any;
};

type CookieShape = {
  key?: string;
  value?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expires?: string;
  sameSite?: string;
};

function normalizeFriendList(response: unknown) {
  if (Array.isArray(response)) {
    return response;
  }

  if (response && typeof response === 'object') {
    const candidateKeys = ['friends', 'items', 'data', 'results', 'contacts'];
    for (const key of candidateKeys) {
      const value = (response as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        return value;
      }

      if (value && typeof value === 'object') {
        for (const nestedKey of candidateKeys) {
          const nestedValue = (value as Record<string, unknown>)[nestedKey];
          if (Array.isArray(nestedValue)) {
            return nestedValue;
          }
        }
      }
    }
  }

  return [];
}

function sanitizeCookies(rawCookie: string) {
  const parsed = JSON.parse(rawCookie) as CookieShape[];
  const allowedDomains = ['zalo.me', 'chat.zalo.me', 'wpa.chat.zalo.me', 'jr.chat.zalo.me'];
  const seen = new Set<string>();

  const sanitized = parsed.filter((cookie) => {
    const normalizedDomain = String(cookie.domain ?? '').replace(/^\./, '');
    if (!normalizedDomain) {
      return true;
    }

    const allowed = allowedDomains.some(
      (domain) => normalizedDomain === domain || normalizedDomain.endsWith(`.${domain}`),
    );
    if (!allowed) {
      return false;
    }

    const dedupeKey = `${cookie.key ?? ''}:${normalizedDomain}:${cookie.path ?? '/'}`;
    if (seen.has(dedupeKey)) {
      return false;
    }
    seen.add(dedupeKey);
    return true;
  });

  return sanitized;
}

export class ZaloRuntimeManager {
  private sessions = new Map<string, ActiveSession>();
  private qrFlows = new Map<string, Promise<void>>();

  constructor(private readonly store: ZaloServiceStore) {}

  async warmupStoredChannels() {
    const channels = this.store.listChannels().filter((channel) => channel.credential);

    for (const channel of channels) {
      try {
        await this.connectStoredChannel(channel.channelId);
      } catch {
        this.store.setChannelStatus(channel.channelId, 'error', {
          lastError: 'Khong the khoi phuc session da luu',
        });
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

  async startQrLogin(channelId: string) {
    const channel = this.store.getChannel(channelId);
    if (!channel) throw new Error('Channel not found');

    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
    const { loginQR, createContext, generateZaloUUID } = await this.loadQrInternals();
    const ctx = createContext();
    ctx.options = { ...(ctx.options ?? {}), selfListen: true, logging: true };
    ctx.userAgent = userAgent;

    if (this.qrFlows.has(channelId)) {
      return { channelId, qrCode: channel.qrCode ?? '' };
    }

    let latestQrCode = channel.qrCode ?? '';
    let resolvedCredential: StoredCredential | undefined;

    const qrReady = new Promise<string>((resolve, reject) => {
      let resolved = false;

      const flow = loginQR(ctx, { userAgent, language: 'vi' }, (event: any) => {
        if (event?.type === 0 && event?.data?.image) {
          latestQrCode = event.data.image;
          this.store.setChannelStatus(channelId, 'qr_pending', { qrCode: latestQrCode, lastError: undefined });
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
          resolvedCredential = credential;
          this.store.setChannelCredential(channelId, credential);
        }

        if (event?.type === 3) {
          this.store.setChannelStatus(channelId, 'error', { lastError: 'QR login was declined', qrCode: undefined });
        }
      })
        .then(async (result: any) => {
          if (!result) throw new Error('QR login ended without a confirmed session');

          const credential: StoredCredential = resolvedCredential ?? {
            cookie: JSON.stringify(result.cookies ?? []),
            imei: channel.credential?.imei ?? generateZaloUUID(userAgent),
            userAgent: channel.credential?.userAgent ?? userAgent,
          };

          this.store.setChannelCredential(channelId, credential);
          await this.connectStoredChannel(channelId);
        })
        .catch(async (error: unknown) => {
          const cookieJar = typeof ctx.cookie?.toJSON === 'function' ? ctx.cookie.toJSON() : undefined;
          const fallbackCookies = Array.isArray(cookieJar?.cookies) ? cookieJar.cookies : [];

          if (fallbackCookies.length > 0) {
            try {
              const credential: StoredCredential = resolvedCredential ?? {
                cookie: JSON.stringify(fallbackCookies),
                imei: channel.credential?.imei ?? generateZaloUUID(userAgent),
                userAgent: channel.credential?.userAgent ?? userAgent,
              };
              this.store.setChannelCredential(channelId, credential);
              await this.connectStoredChannel(channelId);
              if (!resolved) {
                resolved = true;
                resolve(latestQrCode || '');
              }
              return;
            } catch {
              // Fall through to standard error flow.
            }
          }

          const message = error instanceof Error ? error.message : 'QR login failed';
          const current = this.store.getChannel(channelId);
          if (current?.status !== 'connected') {
            this.store.setChannelStatus(channelId, 'error', { lastError: message });
          }
          if (!resolved) {
            resolved = true;
            reject(new Error(message));
          }
        })
        .finally(() => {
          this.qrFlows.delete(channelId);
        });

      this.qrFlows.set(channelId, flow.then(() => undefined));
    });

    try {
      const qrCode = await qrReady;
      return { channelId, qrCode };
    } catch (error) {
      this.store.setChannelStatus(channelId, 'error', {
        lastError: error instanceof Error ? error.message : 'Failed to start QR login',
      });
      throw error;
    }
  }

  private async verifyConnectedSession(channelId: string) {
    const session = this.sessions.get(channelId);
    if (!session?.api) {
      throw new Error('Session verification failed: api unavailable');
    }

    if (typeof session.api.getAllFriends !== 'function') {
      throw new Error('Session verification failed: getAllFriends unavailable');
    }

    await session.api.getAllFriends(1, 1);
  }

  async connectStoredChannel(channelId: string, options: { syncFriends?: boolean } = {}) {
    const channel = this.store.getChannel(channelId);
    if (!channel?.credential) throw new Error('Stored credential not found');

    const shouldSyncFriends = options.syncFriends ?? true;
    const sanitizedCookies = sanitizeCookies(channel.credential.cookie);

    const zalo = new Zalo({ selfListen: true, logging: true } as any);
    const api = await zalo.login({
      cookie: sanitizedCookies,
      imei: channel.credential.imei,
      userAgent: channel.credential.userAgent,
    } as any);

    this.sessions.set(channelId, { zalo, api });
    await this.verifyConnectedSession(channelId);
    this.store.setChannelStatus(channelId, 'connected', { lastError: undefined, qrCode: undefined });
    if (shouldSyncFriends) {
      await this.syncFriends(channelId);
    }
    return { connected: true };
  }

  async reconnectChannel(channelId: string) {
    return this.connectStoredChannel(channelId);
  }

  async syncFriends(channelId: string) {
    const session = this.sessions.get(channelId);

    if (!session?.api) {
      throw new Error('Khong con session active de dong bo contact. Hay dang nhap Zalo lai.');
    }

    if (typeof session.api.getAllFriends !== 'function') {
      throw new Error('Session hien tai khong ho tro getAllFriends');
    }

    const response = await session.api.getAllFriends();
    const friends = normalizeFriendList(response);
    console.log(
      `[zalo-service] syncFriends channel=${channelId} normalized=${friends.length} rawType=${Array.isArray(response) ? 'array' : typeof response}`,
    );
    if (!Array.isArray(response)) {
      console.log('[zalo-service] syncFriends raw keys=', Object.keys((response ?? {}) as Record<string, unknown>));
    }

    const mapped = friends.map((friend: any) => ({
      channelId,
      userId: String(friend.userId),
      displayName: String(friend.displayName || friend.zaloName || friend.username || friend.userId),
      zaloName: friend.zaloName ? String(friend.zaloName) : undefined,
      avatar: friend.avatar ? String(friend.avatar) : undefined,
      status: friend.status ? String(friend.status) : undefined,
      phoneNumber: friend.phoneNumber ? String(friend.phoneNumber) : undefined,
      lastSyncAt: new Date().toISOString(),
    }));

    this.store.replaceFriends(channelId, mapped);
    return this.store.listFriends(channelId);
  }
}
