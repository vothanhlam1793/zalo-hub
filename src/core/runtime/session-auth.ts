import * as ZaloApi from 'zalo-api-final';
import { prepareCookiesForChatSession, loadQrInternals } from './normalizer.js';
import type { GoldStoredCredential } from '../types.js';
import type { ActiveSession, GoldAccountInfo, SharedState } from './types.js';

const { Zalo } = ZaloApi as {
  Zalo: new (options?: Record<string, unknown>) => any;
};

export class GoldSessionAuth {
  private readonly state: SharedState;
  private _ensureMessageListener?: () => void;
  private _hydrate?: () => void;
  private _backfill?: () => Promise<{ updatedMessages: number; repairedMessages: number }>;

  constructor(state: SharedState) {
    this.state = state;
  }

  init(deps: {
    ensureMessageListener: () => void;
    hydrateConversationsFromStore: () => void;
    backfillMediaForStoredMessages: () => Promise<{ updatedMessages: number; repairedMessages: number }>;
  }) {
    this._ensureMessageListener = deps.ensureMessageListener;
    this._hydrate = deps.hydrateConversationsFromStore;
    this._backfill = deps.backfillMediaForStoredMessages;
  }

  async loginWithStoredCredential() {
    const credential = this.state.boundAccountId
      ? this.state.store.getCredentialForAccount(this.state.boundAccountId)
      : this.state.store.getCredential();
    if (!credential) {
      this.state.logger.error('missing_stored_credential');
      throw new Error('Stored credential not found. Hay chay lenh login truoc.');
    }

    return this.loginWithCredential(credential);
  }

  async startBoundAccount() {
    if (!this.state.boundAccountId) {
      throw new Error('Runtime nay chua duoc bind voi accountId cu the');
    }

    return this.loginWithStoredCredential();
  }

  private async loginWithCredential(credential: GoldStoredCredential) {
    const preparedCookies = prepareCookiesForChatSession(credential.cookie);
    this.state.logger.info('login_with_credential_started', {
      rawCookieCount: JSON.parse(credential.cookie).length,
      preparedCookieCount: preparedCookies.length,
    });

    const zalo = new Zalo({ selfListen: true, logging: true } as any);
    const api = await zalo.login({
      cookie: preparedCookies,
      imei: credential.imei,
      userAgent: credential.userAgent,
    } as any);

    this.state.session = { zalo, api };
    this.state.listenerStarted = false;
    this.state.listenerAttached = false;
    await this.verifySession();
    this._ensureMessageListener?.();
    this.state.currentAccount = await this.fetchAccountInfo().catch(() => this.state.currentAccount);
    if (this.state.boundAccountId && this.state.currentAccount?.userId && this.state.currentAccount.userId !== this.state.boundAccountId) {
      throw new Error(`Credential dang tro toi account ${this.state.currentAccount.userId}, khong khop runtime da bind ${this.state.boundAccountId}`);
    }
    if (this.state.currentAccount?.userId) {
      this.state.store.setActiveAccount({
        accountId: this.state.currentAccount.userId,
        displayName: this.state.currentAccount.displayName,
        phoneNumber: this.state.currentAccount.phoneNumber,
      });
      this.state.store.canonicalizeConversationDataForAccount(this.state.boundAccountId);
      this._hydrate?.();
      void this._backfill?.();
    }
    this.state.logger.info('login_with_credential_succeeded');
    return this.state.session;
  }

  async loginByQr(options: { onQr?: (qrCode: string) => void } = {}) {
    this.state.logger.info('qr_login_started');
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
    const { loginQR, createContext, generateZaloUUID } = await loadQrInternals();
    const ctx = createContext();
    ctx.options = { ...(ctx.options ?? {}), selfListen: true, logging: true };
    ctx.userAgent = userAgent;

    let lastQr = '';
    let resolvedCredential: GoldStoredCredential | undefined;

    let flowDoneResolve: (() => void) | undefined;
    let flowDoneReject: ((error: Error) => void) | undefined;
    const flowDone = new Promise<void>((resolve, reject) => {
      flowDoneResolve = resolve;
      flowDoneReject = reject;
    });

    const qrReady = new Promise<string>((resolve, reject) => {
      let resolved = false;

      void loginQR(ctx, { userAgent, language: 'vi' }, (event: any) => {
        if (event?.type === 0 && event?.data?.image) {
          lastQr = String(event.data.image);
          this.state.currentQrCode = lastQr;
          this.state.logger.info('qr_ready', { qrLength: lastQr.length });
          options.onQr?.(lastQr);
          if (!resolved) {
            resolved = true;
            resolve(lastQr);
          }
          return;
        }

        if (event?.type === 3 && !resolved) {
          this.state.logger.error('qr_login_declined');
          resolved = true;
          reject(new Error('QR login was declined'));
        }
      })
        .then(async (result: any) => {
          const credential: GoldStoredCredential = {
            cookie: JSON.stringify(result?.cookies ?? []),
            imei: generateZaloUUID(userAgent),
            userAgent,
          };
          this.state.logger.info('qr_credential_captured_from_result', {
            cookieCount: Array.isArray(result?.cookies) ? result.cookies.length : 0,
          });
          await this.loginWithCredential(credential);
          if (!this.state.currentAccount?.userId) {
            throw new Error('Khong xac dinh duoc account sau khi login QR');
          }
          this.state.store.setCredentialForAccount(this.state.currentAccount.userId, credential);
          this.state.logger.info('qr_login_completed');
          flowDoneResolve?.();
        })
        .catch(async (error: unknown) => {
          const cookieJar = typeof ctx.cookie?.toJSON === 'function' ? ctx.cookie.toJSON() : undefined;
          const fallbackCookies = Array.isArray(cookieJar?.cookies) ? cookieJar.cookies : [];

          if (fallbackCookies.length > 0) {
            try {
              const credential: GoldStoredCredential = {
                cookie: JSON.stringify(fallbackCookies),
                imei: generateZaloUUID(userAgent),
                userAgent,
              };

              this.state.logger.info('qr_login_recovered_from_cookie_jar', {
                cookieCount: fallbackCookies.length,
                originalError: error instanceof Error ? error.message : String(error),
              });
              await this.loginWithCredential(credential);
              if (!this.state.currentAccount?.userId) {
                throw new Error('Khong xac dinh duoc account sau khi recover login QR');
              }
              this.state.store.setCredentialForAccount(this.state.currentAccount.userId, credential);
              this.state.logger.info('qr_login_completed_after_recovery');
              flowDoneResolve?.();
              return;
            } catch (recoveryError) {
              this.state.logger.error('qr_login_recovery_failed', recoveryError);
            }
          }

          this.state.logger.error('qr_login_failed', error);
          flowDoneReject?.(error instanceof Error ? error : new Error('QR login failed'));
          if (!resolved) {
            resolved = true;
            reject(error instanceof Error ? error : new Error('QR login failed'));
          }
        });
    });

    const qrCode = await qrReady;
    await flowDone;
    return { qrCode };
  }

  getCurrentQrCode() {
    return this.state.currentQrCode;
  }

  hasCredential() {
    return Boolean(this.state.boundAccountId ? this.state.store.getCredentialForAccount(this.state.boundAccountId) : this.state.store.getCredential());
  }

  isSessionActive() {
    return Boolean(this.state.session?.api);
  }

  getCurrentAccount() {
    return this.state.currentAccount;
  }

  async pingSession() {
    const api = this.state.session?.api;
    if (!api) {
      await this.loginWithStoredCredential();
    }

    if (typeof this.state.session?.api?.keepAlive !== 'function') {
      throw new Error('Session hien tai khong ho tro keepAlive');
    }

    const result = await this.state.session.api.keepAlive();
    this.state.logger.info('session_keepalive_completed', { result });
    return result;
  }

  async doctor() {
    const credential = this.state.store.getCredential();
    if (!credential) {
      this.state.logger.info('doctor_missing_credential');
      return { ok: false, reason: 'missing_credential' };
    }

    await this.loginWithStoredCredential();
    this.state.logger.info('doctor_session_verified', { friendCacheCount: this.state.store.listFriends().length });
    return {
      ok: true,
      reason: 'session_verified',
      friendCacheCount: this.state.store.listFriends().length,
    };
  }

  private async verifySession() {
    if (!this.state.session?.api) {
      this.state.logger.error('verify_session_api_unavailable');
      throw new Error('Session verification failed: api unavailable');
    }

    if (typeof this.state.session.api.getAllFriends !== 'function') {
      this.state.logger.error('verify_session_get_all_friends_unavailable');
      throw new Error('Session verification failed: getAllFriends unavailable');
    }

    await this.state.session.api.getAllFriends(1, 1);
    this.state.logger.info('verify_session_succeeded');
  }

  async fetchAccountInfo() {
    if (!this.state.session) {
      await this.loginWithStoredCredential();
    }

    const api = this.state.session?.api;
    let account: GoldAccountInfo = {};

    if (typeof api?.getOwnId === 'function') {
      try {
        account.userId = String(await api.getOwnId());
      } catch (error) {
        this.state.logger.error('get_own_id_failed', error);
      }
    }

    if (typeof api?.fetchAccountInfo === 'function') {
      try {
        const response = await api.fetchAccountInfo();
        const data = response?.data ?? response ?? {};
        account = {
          ...account,
          userId: account.userId ?? (data.uid ? String(data.uid) : undefined),
          displayName: data.displayName
            ? String(data.displayName)
            : data.name
              ? String(data.name)
              : data.zaloName
                ? String(data.zaloName)
                : account.displayName,
          phoneNumber: data.phoneNumber
            ? String(data.phoneNumber)
            : data.phone
              ? String(data.phone)
              : account.phoneNumber,
        };
      } catch (error) {
        this.state.logger.error('fetch_account_info_failed', error);
      }
    }

    this.state.currentAccount = account;
    if (account.userId) {
      this.state.store.setActiveAccount({
        accountId: account.userId,
        displayName: account.displayName,
        phoneNumber: account.phoneNumber,
      });
      this._hydrate?.();
    }
    this.state.store.updateAccountProfile(this.state.boundAccountId ?? account.userId, {
      displayName: account.displayName,
      phoneNumber: account.phoneNumber,
    });
    this.state.logger.info('account_info_loaded', account);
    return account;
  }

  logout() {
    this.state.session = undefined;
    this.state.currentQrCode = undefined;
    this.state.currentAccount = undefined;
    this.state.conversations.clear();
    this.state.seenMessageKeys.clear();
    this.state.listenerAttached = false;
    this.state.listenerStarted = false;
    this.state.listenerState = {
      attached: false,
      started: false,
      connected: false,
      startAttempts: 0,
    };
    this.state.store.clearSessionForAccount(this.state.boundAccountId);
    this.state.logger.info('logout_completed');
    return { ok: true };
  }
}
