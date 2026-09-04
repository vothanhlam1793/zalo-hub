import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as ZaloApi from 'zalo-api-final';
import { GatewayStore, type GatewayAccount, type StoredCredential } from './store.js';

const { Zalo } = ZaloApi as { Zalo: new (options?: Record<string, unknown>) => any };
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
const require = createRequire(import.meta.url);

type Onboarding = {
  id: string;
  ownerUserId: string;
  status: 'starting' | 'waiting_for_qr' | 'completed' | 'failed';
  qrCode?: string;
  account?: GatewayAccount;
  error?: string;
};

export class ZaloOnboardingService {
  private readonly onboardings = new Map<string, Onboarding>();
  private readonly sessions = new Map<string, unknown>();
  private activeOnboardingId?: string;

  constructor(private readonly store: GatewayStore) {}

  async start(ownerUserId: string) {
    if (this.activeOnboardingId) throw new Error('Another Zalo QR onboarding is already in progress');
    const id = crypto.randomUUID();
    const onboarding: Onboarding = { id, ownerUserId, status: 'starting' };
    this.onboardings.set(id, onboarding);
    this.activeOnboardingId = id;
    void this.run(onboarding).finally(() => { this.activeOnboardingId = undefined; });
    return onboarding;
  }

  get(onboardingId: string, ownerUserId: string) {
    const onboarding = this.onboardings.get(onboardingId);
    if (!onboarding || onboarding.ownerUserId !== ownerUserId) return undefined;
    return onboarding;
  }

  async reconnect(accountId: string) {
    const credential = await this.store.getCredential(accountId);
    if (!credential) throw new Error('No active Zalo credential for account');
    const account = await this.loginWithCredential(credential);
    if (account.accountId !== accountId) throw new Error('Stored credential belongs to a different Zalo account');
    return account;
  }

  async status(accountId: string) {
    const account = await this.store.getAccount(accountId);
    if (!account) return undefined;
    return { ...account, sessionActive: this.sessions.has(accountId) };
  }

  async logout(accountId: string) {
    this.sessions.delete(accountId);
    await this.store.deactivateSession(accountId);
  }

  private async run(onboarding: Onboarding) {
    try {
      const { loginQR, createContext, generateZaloUUID } = await loadQrInternals();
      const context = createContext();
      context.options = { ...(context.options ?? {}), selfListen: true, logging: true };
      context.userAgent = userAgent;
      const result = await loginQR(context, { userAgent, language: 'vi' }, (event: any) => {
        if (event?.type === 0 && event?.data?.image) {
          onboarding.qrCode = String(event.data.image);
          onboarding.status = 'waiting_for_qr';
        }
      });
      const credential: StoredCredential = { cookie: JSON.stringify(result?.cookies ?? []), imei: generateZaloUUID(userAgent), userAgent };
      const account = await this.loginWithCredential(credential);
      await this.store.saveAccount(account, credential);
      onboarding.account = { ...account, hasCredential: true };
      onboarding.status = 'completed';
      onboarding.qrCode = undefined;
    } catch (error) {
      onboarding.status = 'failed';
      onboarding.error = error instanceof Error ? error.message : String(error);
    }
  }

  private async loginWithCredential(credential: StoredCredential): Promise<Omit<GatewayAccount, 'hasCredential'>> {
    const zalo = new Zalo({ selfListen: true, logging: true } as any);
    const api = await zalo.login({ cookie: prepareCookies(credential.cookie), imei: credential.imei, userAgent: credential.userAgent } as any);
    if (typeof api.getAllFriends !== 'function') throw new Error('Zalo session does not support friend lookup');
    await api.getAllFriends(1, 1);
    const account = await readAccount(api);
    if (!account.accountId) throw new Error('Unable to determine Zalo account ID after login');
    this.sessions.set(account.accountId, { zalo, api });
    return account;
  }
}

function prepareCookies(rawCookie: string) {
  const allowed = new Set(['zalo.me', 'chat.zalo.me', 'wpa.chat.zalo.me', 'jr.chat.zalo.me']);
  const seen = new Set<string>();
  return (JSON.parse(rawCookie) as Array<Record<string, unknown>>).filter((cookie) => {
    const domain = String(cookie.domain ?? '').replace(/^\./, '');
    const key = `${String(cookie.key ?? cookie.name ?? '')}:${domain}:${String(cookie.path ?? '/')}`;
    if (!allowed.has(domain) || !cookie.value || cookie.value === 'EXPIRED' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readAccount(api: any): Promise<Omit<GatewayAccount, 'hasCredential'>> {
  const accountId = typeof api.getOwnId === 'function' ? String(await api.getOwnId()) : '';
  const response = typeof api.fetchAccountInfo === 'function' ? await api.fetchAccountInfo().catch(() => undefined) : undefined;
  const data = response?.data ?? response ?? {};
  return {
    accountId: accountId || String(data.uid ?? ''),
    displayName: data.displayName ? String(data.displayName) : data.name ? String(data.name) : undefined,
    phoneNumber: data.phoneNumber ? String(data.phoneNumber) : data.phone ? String(data.phone) : undefined,
    avatar: typeof data.avatar === 'string' ? data.avatar : typeof data.avatarUrl === 'string' ? data.avatarUrl : undefined,
  };
}

async function loadQrInternals() {
  // The package does not export package.json; resolve its public entry instead.
  const packageRoot = path.resolve(path.dirname(require.resolve('zalo-api-final')), '..', '..');
  const basePath = path.join(packageRoot, 'dist');
  const [{ loginQR }, { createContext }, { generateZaloUUID }] = await Promise.all([
    import(pathToFileURL(path.join(basePath, 'apis', 'loginQR.js')).href),
    import(pathToFileURL(path.join(basePath, 'context.js')).href),
    import(pathToFileURL(path.join(basePath, 'utils.js')).href),
  ]);
  return { loginQR: loginQR as any, createContext: createContext as any, generateZaloUUID: generateZaloUUID as (agent: string) => string };
}
