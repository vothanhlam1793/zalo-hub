import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as ZaloApi from 'zalo-api-final';
import jsQRModule from 'jsqr';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import { GoldLogger } from './logger.js';
import { GoldStore } from './store.js';
import type { GoldConversationMessage, GoldStoredCredential } from './types.js';

const jsQR = jsQRModule as unknown as (
  data: Uint8ClampedArray,
  width: number,
  height: number,
) => { data: string } | null;

const { Zalo } = ZaloApi as { Zalo: new (options?: Record<string, unknown>) => any };

type CookieShape = {
  key?: string;
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  expires?: string;
  maxAge?: number;
};

type ActiveSession = {
  zalo: InstanceType<typeof Zalo>;
  api?: any;
};

type GoldAccountInfo = {
  userId?: string;
  displayName?: string;
  phoneNumber?: string;
};

type ListenerMessage = {
  type?: number;
  threadId?: string;
  isSelf?: boolean;
  data?: Record<string, unknown>;
};

type ListenerLike = {
  on: (event: string, handler: (...args: any[]) => void) => void;
  start: (options?: { retryOnClose?: boolean }) => void;
};

type ListenerState = {
  attached: boolean;
  started: boolean;
  connected: boolean;
  startAttempts: number;
  lastEventAt?: string;
  lastMessageAt?: string;
  lastError?: string;
  lastCloseCode?: string;
};

type ConversationListener = (message: GoldConversationMessage) => void;

function normalizeMessageText(data: Record<string, unknown>) {
  const content = data.content;

  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }

  if (content && typeof content === 'object') {
    const message = (content as Record<string, unknown>).msg;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }

    const title = (content as Record<string, unknown>).title;
    if (typeof title === 'string' && title.trim()) {
      return title.trim();
    }
  }

  const candidateKeys = ['msg', 'text', 'body', 'message'];
  for (const key of candidateKeys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function normalizeMessageKind(data: Record<string, unknown>) {
  const msgType = String(data.msgType ?? '');
  if (msgType === 'chat.photo') {
    return 'image' as const;
  }

  return 'text' as const;
}

function normalizeImageUrl(data: Record<string, unknown>) {
  const content = data.content;
  if (content && typeof content === 'object') {
    const href = (content as Record<string, unknown>).href;
    if (typeof href === 'string' && href.trim()) {
      return href.trim();
    }
  }

  return undefined;
}

function normalizeMessageTimestamp(data: Record<string, unknown>) {
  const candidateKeys = ['ts', 'ctime', 'time', 'timestamp'];
  for (const key of candidateKeys) {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value > 1_000_000_000_000 ? value : value * 1000).toISOString();
    }

    if (typeof value === 'string' && /^\d+$/.test(value)) {
      const numeric = Number(value);
      return new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000).toISOString();
    }
  }

  return new Date().toISOString();
}

function summarizeListenerData(data: Record<string, unknown>) {
  const summary: Record<string, unknown> = {};
  const candidateKeys = ['msgId', 'cliMsgId', 'uidFrom', 'idTo', 'msgType', 'ts', 'ctime', 'time'];

  for (const key of candidateKeys) {
    if (data[key] !== undefined) {
      summary[key] = data[key];
    }
  }

  const content = data.content;
  if (typeof content === 'string') {
    summary.content = content.slice(0, 200);
  } else if (content && typeof content === 'object') {
    const contentRecord = content as Record<string, unknown>;
    summary.content = {};
    for (const key of ['msg', 'title', 'href', 'type']) {
      if (contentRecord[key] !== undefined) {
        (summary.content as Record<string, unknown>)[key] = contentRecord[key];
      }
    }
  }

  return summary;
}

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

function prepareCookiesForChatSession(rawCookie: string) {
  const parsed = JSON.parse(rawCookie) as CookieShape[];
  const allowedDomains = ['zalo.me', 'chat.zalo.me', 'wpa.chat.zalo.me', 'jr.chat.zalo.me'];
  const seen = new Set<string>();

  return parsed.filter((cookie) => {
    const value = String(cookie.value ?? '');
    if (!value || value === 'EXPIRED') {
      return false;
    }

    const normalizedDomain = String(cookie.domain ?? '').replace(/^\./, '');
    if (!normalizedDomain) {
      return false;
    }

    const allowed =
      normalizedDomain === 'zalo.me' ||
      normalizedDomain === 'chat.zalo.me' ||
      normalizedDomain === 'wpa.chat.zalo.me' ||
      normalizedDomain === 'jr.chat.zalo.me';
    if (!allowed) {
      return false;
    }

    if (typeof cookie.maxAge === 'number' && cookie.maxAge <= 0) {
      return false;
    }

    const dedupeKey = `${cookie.key ?? cookie.name ?? ''}:${normalizedDomain}:${cookie.path ?? '/'}`;
    if (seen.has(dedupeKey)) {
      return false;
    }

    seen.add(dedupeKey);
    return true;
  });
}

async function loadQrInternals() {
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

function parseBase64Image(input: string) {
  const dataUrlMatch = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1],
      buffer: Buffer.from(dataUrlMatch[2], 'base64'),
    };
  }

  const normalized = input.replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(normalized) && normalized.length > 128) {
    return {
      mimeType: 'image/png',
      buffer: Buffer.from(normalized, 'base64'),
    };
  }

  return undefined;
}

function mimeTypeToExtension(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'bin';
}

function readFlag(argv: string[], name: string) {
  const index = argv.findIndex((item) => item === `--${name}`);
  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
}

export class GoldRuntime {
  private session: ActiveSession | undefined;
  private currentQrCode: string | undefined;
  private currentAccount: GoldAccountInfo | undefined;
  private readonly conversations = new Map<string, GoldConversationMessage[]>();
  private readonly seenMessageKeys = new Set<string>();
  private listenerStarted = false;
  private listenerAttached = false;
  private readonly conversationListeners = new Set<ConversationListener>();
  private listenerState: ListenerState = {
    attached: false,
    started: false,
    connected: false,
    startAttempts: 0,
  };

  constructor(
    private readonly store: GoldStore,
    private readonly logger: GoldLogger,
  ) {}

  async loginWithStoredCredential() {
    const credential = this.store.getCredential();
    if (!credential) {
      this.logger.error('missing_stored_credential');
      throw new Error('Stored credential not found. Hay chay lenh login truoc.');
    }

    return this.loginWithCredential(credential);
  }

  private async loginWithCredential(credential: GoldStoredCredential) {
    const preparedCookies = prepareCookiesForChatSession(credential.cookie);
    this.logger.info('login_with_credential_started', {
      rawCookieCount: JSON.parse(credential.cookie).length,
      preparedCookieCount: preparedCookies.length,
    });

    const zalo = new Zalo({ selfListen: true, logging: true } as any);
    const api = await zalo.login({
      cookie: preparedCookies,
      imei: credential.imei,
      userAgent: credential.userAgent,
    } as any);

    this.session = { zalo, api };
    this.listenerStarted = false;
    this.listenerAttached = false;
    await this.verifySession();
    this.ensureMessageListener();
    this.currentAccount = await this.fetchAccountInfo().catch(() => this.currentAccount);
    this.logger.info('login_with_credential_succeeded');
    return this.session;
  }

  private buildMessageKey(
    friendId: string,
    text: string,
    timestamp: string,
    direction: 'incoming' | 'outgoing',
    kind = 'text',
    imageUrl = '',
  ) {
    return `${friendId}::${direction}::${kind}::${timestamp}::${text}::${imageUrl}`;
  }

  private appendConversationMessage(message: GoldConversationMessage) {
    const key = this.buildMessageKey(
      message.friendId,
      message.text,
      message.timestamp,
      message.direction,
      message.kind,
      message.imageUrl,
    );
    if (this.seenMessageKeys.has(key)) {
      return false;
    }

    const existing = this.conversations.get(message.friendId) ?? [];
    const messageTime = Date.parse(message.timestamp);
    const looksDuplicated = existing.some((item) => {
      if (
        item.direction !== message.direction ||
        item.text !== message.text ||
        item.kind !== message.kind ||
        item.imageUrl !== message.imageUrl
      ) {
        return false;
      }

      const itemTime = Date.parse(item.timestamp);
      if (!Number.isFinite(itemTime) || !Number.isFinite(messageTime)) {
        return false;
      }

      return Math.abs(itemTime - messageTime) <= 15_000;
    });

    if (looksDuplicated) {
      this.seenMessageKeys.add(key);
      return false;
    }

    this.seenMessageKeys.add(key);
    existing.push(message);
    existing.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    this.conversations.set(message.friendId, existing);
    for (const listener of this.conversationListeners) {
      listener(message);
    }
    return true;
  }

  private ensureMessageListener() {
    const listener = this.session?.api?.listener as ListenerLike | undefined;
    if (!listener) {
      this.logger.error('message_listener_unavailable');
      return;
    }

    if (!this.listenerAttached) {
      listener.on('connected', () => {
        this.listenerState.connected = true;
        this.listenerState.lastEventAt = new Date().toISOString();
        this.listenerState.lastError = undefined;
        this.logger.info('message_listener_connected');
      });
      listener.on('cipher_key', () => {
        this.listenerState.lastEventAt = new Date().toISOString();
        this.logger.info('message_listener_cipher_key_received');
      });
      listener.on('message', (message: ListenerMessage) => {
        this.handleIncomingListenerMessage(message);
      });
      listener.on('error', (error: unknown) => {
        this.listenerState.connected = false;
        this.listenerState.lastEventAt = new Date().toISOString();
        this.listenerState.lastError = error instanceof Error ? error.message : String(error);
        this.logger.error('message_listener_error', error);
      });
      listener.on('closed', (code: unknown) => {
        this.listenerStarted = false;
        this.listenerState.started = false;
        this.listenerState.connected = false;
        this.listenerState.lastEventAt = new Date().toISOString();
        this.listenerState.lastCloseCode = String(code);
        this.logger.error('message_listener_closed', { code });
      });
      this.listenerAttached = true;
      this.listenerState.attached = true;
    }

    if (!this.listenerStarted) {
      this.startMessageListener(listener);
    }
  }

  private startMessageListener(listener: ListenerLike) {
    listener.start({ retryOnClose: true });
    this.listenerStarted = true;
    this.listenerState.started = true;
    this.listenerState.startAttempts += 1;
    this.listenerState.lastEventAt = new Date().toISOString();
    this.logger.info('message_listener_started', { startAttempts: this.listenerState.startAttempts });
  }

  private handleIncomingListenerMessage(message: ListenerMessage) {
    if (message?.type !== 0 && message?.type !== undefined) {
      this.logger.info('conversation_listener_message_skipped_non_user', {
        type: message?.type,
        threadId: message?.threadId,
      });
      return;
    }

    const friendId = String(message.threadId ?? '').trim();
    const data = message.data ?? {};
    const text = normalizeMessageText(data);
    const kind = normalizeMessageKind(data);
    const imageUrl = normalizeImageUrl(data);

    this.logger.info('conversation_listener_message_received', {
      threadId: friendId,
      isSelf: Boolean(message.isSelf),
      textLength: text.length,
      kind,
      imageUrl,
      summary: summarizeListenerData(data),
    });
    this.listenerState.lastEventAt = new Date().toISOString();
    this.listenerState.lastMessageAt = this.listenerState.lastEventAt;

    if (!friendId || (!text && !imageUrl)) {
      this.logger.error('conversation_listener_message_ignored', {
        reason: !friendId ? 'missing_thread_id' : 'missing_text',
        threadId: friendId,
        isSelf: Boolean(message.isSelf),
        kind,
        imageUrl,
        summary: summarizeListenerData(data),
      });
      return;
    }

    const normalizedMessage: GoldConversationMessage = {
      id: String(data.msgId ?? data.cliMsgId ?? randomUUID()),
      friendId,
      text: text || '[Hinh anh]',
      kind,
      imageUrl,
      direction: message.isSelf ? 'outgoing' : 'incoming',
      isSelf: Boolean(message.isSelf),
      timestamp: normalizeMessageTimestamp(data),
    };

    if (this.appendConversationMessage(normalizedMessage)) {
      this.logger.info('conversation_message_captured', {
        friendId,
        direction: normalizedMessage.direction,
        kind,
        textLength: text.length,
      });
      return;
    }

    this.logger.info('conversation_message_deduped', {
      friendId,
      direction: normalizedMessage.direction,
      kind,
      textLength: text.length,
    });
  }

  async doctor() {
    const credential = this.store.getCredential();
    if (!credential) {
      this.logger.info('doctor_missing_credential');
      return { ok: false, reason: 'missing_credential' };
    }

    await this.loginWithStoredCredential();
    this.logger.info('doctor_session_verified', { friendCacheCount: this.store.listFriends().length });
    return {
      ok: true,
      reason: 'session_verified',
      friendCacheCount: this.store.listFriends().length,
    };
  }

  async loginByQr(options: { onQr?: (qrCode: string) => void } = {}) {
    this.logger.info('qr_login_started');
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
          this.currentQrCode = lastQr;
          this.logger.info('qr_ready', { qrLength: lastQr.length });
          options.onQr?.(lastQr);
          if (!resolved) {
            resolved = true;
            resolve(lastQr);
          }
          return;
        }

        if (event?.type === 3 && !resolved) {
          this.logger.error('qr_login_declined');
          resolved = true;
          reject(new Error('QR login was declined'));
        }
      })
        .then(async (result: any) => {
          const credential = {
            cookie: JSON.stringify(result?.cookies ?? []),
            imei: generateZaloUUID(userAgent),
            userAgent,
          };
          this.store.setCredential(credential);
          this.logger.info('qr_credential_captured_from_result', {
            cookieCount: Array.isArray(result?.cookies) ? result.cookies.length : 0,
          });
          await this.loginWithCredential(credential);
          this.logger.info('qr_login_completed');
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

              this.store.setCredential(credential);
              this.logger.info('qr_login_recovered_from_cookie_jar', {
                cookieCount: fallbackCookies.length,
                originalError: error instanceof Error ? error.message : String(error),
              });
              await this.loginWithCredential(credential);
              this.logger.info('qr_login_completed_after_recovery');
              flowDoneResolve?.();
              return;
            } catch (recoveryError) {
              this.logger.error('qr_login_recovery_failed', recoveryError);
            }
          }

          this.logger.error('qr_login_failed', error);
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
    return this.currentQrCode;
  }

  hasCredential() {
    return Boolean(this.store.getCredential());
  }

  isSessionActive() {
    return Boolean(this.session?.api);
  }

  getCurrentAccount() {
    return this.currentAccount;
  }

  getFriendCache() {
    return this.store.listFriends();
  }

  getConversationMessages(friendId: string, since?: string) {
    const messages = this.conversations.get(friendId) ?? [];
    if (!since) {
      return [...messages];
    }

    return messages.filter((message) => message.timestamp > since);
  }

  onConversationMessage(listener: ConversationListener) {
    this.conversationListeners.add(listener);
    return () => {
      this.conversationListeners.delete(listener);
    };
  }

  getListenerState() {
    return { ...this.listenerState };
  }

  async pingSession() {
    const api = this.session?.api;
    if (!api) {
      await this.loginWithStoredCredential();
    }

    if (typeof this.session?.api?.keepAlive !== 'function') {
      throw new Error('Session hien tai khong ho tro keepAlive');
    }

    const result = await this.session.api.keepAlive();
    this.logger.info('session_keepalive_completed', { result });
    return result;
  }

  restartListener() {
    const listener = this.session?.api?.listener as (ListenerLike & { stop?: () => void }) | undefined;
    if (!listener) {
      throw new Error('Message listener unavailable');
    }

    listener.stop?.();
    this.listenerStarted = false;
    this.listenerState.started = false;
    this.listenerState.connected = false;
    this.listenerState.lastEventAt = new Date().toISOString();
    this.startMessageListener(listener);
    return this.getListenerState();
  }

  logout() {
    this.session = undefined;
    this.currentQrCode = undefined;
    this.currentAccount = undefined;
    this.conversations.clear();
    this.seenMessageKeys.clear();
    this.listenerAttached = false;
    this.listenerStarted = false;
    this.listenerState = {
      attached: false,
      started: false,
      connected: false,
      startAttempts: 0,
    };
    this.store.clearAll();
    this.logger.info('logout_completed');
    return { ok: true };
  }

  async fetchAccountInfo() {
    if (!this.session) {
      await this.loginWithStoredCredential();
    }

    const api = this.session?.api;
    let account: GoldAccountInfo = {};

    if (typeof api?.getOwnId === 'function') {
      try {
        account.userId = String(await api.getOwnId());
      } catch (error) {
        this.logger.error('get_own_id_failed', error);
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
        this.logger.error('fetch_account_info_failed', error);
      }
    }

    this.currentAccount = account;
    this.logger.info('account_info_loaded', account);
    return account;
  }

  async listFriends() {
    if (!this.session) {
      await this.loginWithStoredCredential();
    }

    if (typeof this.session?.api?.getAllFriends !== 'function') {
      throw new Error('Session hien tai khong ho tro getAllFriends');
    }

    const response = await this.session.api.getAllFriends();
    this.logger.info('friends_raw_response_received', {
      responseType: Array.isArray(response) ? 'array' : typeof response,
      keys: response && typeof response === 'object' && !Array.isArray(response) ? Object.keys(response as Record<string, unknown>) : [],
    });
    const friends = normalizeFriendList(response).map((friend: any) => ({
      userId: String(friend.userId),
      displayName: String(friend.displayName || friend.zaloName || friend.username || friend.userId),
      zaloName: friend.zaloName ? String(friend.zaloName) : undefined,
      avatar: friend.avatar ? String(friend.avatar) : undefined,
      status: friend.status ? String(friend.status) : undefined,
      phoneNumber: friend.phoneNumber ? String(friend.phoneNumber) : undefined,
      lastSyncAt: new Date().toISOString(),
    }));

    this.logger.info('friends_normalized', { count: friends.length });
    return this.store.replaceFriends(friends);
  }

  async sendText(friendId: string, text: string) {
    if (!friendId || !text) {
      throw new Error('friendId va text la bat buoc');
    }

    if (!this.session) {
      await this.loginWithStoredCredential();
    }

    const api = this.session?.api;
    this.logger.info('send_text_started', { friendId, text });

    if (typeof api?.sendMessage === 'function') {
      try {
        const result = await api.sendMessage({ msg: text }, friendId);
        this.appendConversationMessage({
          id: String(result?.message?.msgId ?? result?.msgId ?? result?.messageId ?? randomUUID()),
          friendId,
          text,
          kind: 'text',
          direction: 'outgoing',
          isSelf: true,
          timestamp: new Date().toISOString(),
        });
        this.logger.info('send_text_succeeded', { method: 'sendMessage', friendId, result });
        return { method: 'sendMessage', result };
      } catch (error) {
        this.logger.error('send_method_failed', { method: 'sendMessage', friendId, error });
        console.error('[gold-1] send method sendMessage failed', error);
      }
    }

    if (typeof api?.sendMsg === 'function') {
      try {
        const result = await api.sendMsg({ msg: text }, friendId);
        this.appendConversationMessage({
          id: String(result?.message?.msgId ?? result?.msgId ?? result?.messageId ?? randomUUID()),
          friendId,
          text,
          kind: 'text',
          direction: 'outgoing',
          isSelf: true,
          timestamp: new Date().toISOString(),
        });
        this.logger.info('send_text_succeeded', { method: 'sendMsg', friendId, result });
        return { method: 'sendMsg', friendId, result };
      } catch (error) {
        this.logger.error('send_method_failed', { method: 'sendMsg', friendId, error });
        console.error('[gold-1] send method sendMsg failed', error);
      }
    }

    const apiKeys = api && typeof api === 'object' ? Object.keys(api).sort() : [];
    this.logger.error('send_method_not_found', { friendId, apiKeys });
    throw new Error(
      `Khong tim thay send API phu hop tren session. Available methods: ${apiKeys.join(', ')}`,
    );
  }

  async renderQrToTerminal(qrCode: string) {
    try {
      const base64Image = parseBase64Image(qrCode);
      let qrPayload = qrCode;

      if (base64Image) {
        const savedPath = path.resolve(
          process.cwd(),
          'logs',
          'gold-1',
          `${this.logger.runId}.qr.${mimeTypeToExtension(base64Image.mimeType)}`,
        );
        writeFileSync(savedPath, base64Image.buffer);
        this.logger.info('qr_image_saved', { savedPath, mimeType: base64Image.mimeType, size: base64Image.buffer.length });

        if (base64Image.mimeType === 'image/png') {
          try {
            const png = PNG.sync.read(base64Image.buffer);
            const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
            if (decoded?.data) {
              qrPayload = decoded.data;
              this.logger.info('qr_image_decoded', { savedPath, decodedLength: decoded.data.length });
            } else {
              this.logger.error('qr_image_decode_failed', { savedPath, reason: 'jsqr_no_data' });
              return `Khong decode duoc QR tu anh base64. Anh da luu tai: ${savedPath}`;
            }
          } catch (error) {
            this.logger.error('qr_image_png_parse_failed', error);
            return `Khong parse duoc anh QR base64. Anh da luu tai: ${savedPath}`;
          }
        } else {
          return `QR dang o dang anh ${base64Image.mimeType}. Anh da luu tai: ${savedPath}`;
        }
      }

      const rendered = await QRCode.toString(qrPayload, { type: 'terminal', small: true });
      this.logger.info('qr_rendered_to_terminal');
      return rendered;
    } catch (error) {
      this.logger.error('qr_render_failed', error);
      return qrCode;
    }
  }

  private async verifySession() {
    if (!this.session?.api) {
      this.logger.error('verify_session_api_unavailable');
      throw new Error('Session verification failed: api unavailable');
    }

    if (typeof this.session.api.getAllFriends !== 'function') {
      this.logger.error('verify_session_get_all_friends_unavailable');
      throw new Error('Session verification failed: getAllFriends unavailable');
    }

    await this.session.api.getAllFriends(1, 1);
    this.logger.info('verify_session_succeeded');
  }

  static parseSendArgs(argv: string[]) {
    const friendId = readFlag(argv, 'to');
    const text = readFlag(argv, 'text') ?? 'hello world';
    return { friendId, text };
  }
}
