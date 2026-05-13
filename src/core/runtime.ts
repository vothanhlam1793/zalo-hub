import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as ZaloApi from 'zalo-api-final';
import jsQRModule from 'jsqr';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import { GoldLogger } from './logger.js';
import { GoldMediaStore } from './media-store.js';
import { GoldStore } from './store.js';
import { getAllGroups as fetchAllGroups, getGroupInfo as fetchGroupInfo } from './zalo-group-client.js';
import type {
  GoldAttachment,
  GoldContactRecord,
  GoldConversationMessage,
  GoldConversationSummary,
  GoldConversationType,
  GoldGroupMemberRecord,
  GoldGroupRecord,
  GoldMessageKind,
  GoldStoredCredential,
} from './types.js';

const jsQR = jsQRModule as unknown as (
  data: Uint8ClampedArray,
  width: number,
  height: number,
) => { data: string } | null;

const { Zalo, ThreadType } = ZaloApi as {
  Zalo: new (options?: Record<string, unknown>) => any;
  ThreadType: { User: number; Group: number };
};

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
  requestOldMessages?: (threadType: number, lastMsgId?: string | null) => void;
  stop?: () => void;
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

type HistorySyncState = {
  conversationId: string;
  threadId: string;
  type: GoldConversationType;
  beforeMessageId?: string;
  requestedAt: number;
  resolve: (result: HistorySyncResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type HistorySyncResult = {
  conversationId: string;
  threadId: string;
  type: GoldConversationType;
  requestedBeforeMessageId?: string;
  remoteCount: number;
  insertedCount: number;
  dedupedCount: number;
  oldestTimestamp?: string;
  oldestProviderMessageId?: string;
  hasMore: boolean;
  timedOut?: boolean;
};

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

function normalizeMessageKind(data: Record<string, unknown>): GoldMessageKind {
  const msgType = String(data.msgType ?? '');
  if (msgType === 'chat.photo') return 'image';
  if (
    msgType === 'chat.video.msg' ||
    msgType === 'chat.video' ||
    msgType === 'video'
  ) return 'video';
  if (
    msgType === 'chat.file' ||
    msgType === 'chat.doc' ||
    msgType === 'chat.voice' ||
    msgType === 'chat.gif' ||
    msgType === 'share.file'
  ) return 'file';
  return 'text';
}

function normalizeAttachments(data: Record<string, unknown>): GoldAttachment[] {
  const msgType = String(data.msgType ?? '');
  const content = data.content;
  const contentObj = content && typeof content === 'object' ? content as Record<string, unknown> : null;

  if (msgType === 'chat.photo') {
    const url = typeof contentObj?.href === 'string' ? contentObj.href.trim() : undefined;
    if (!url) return [];
    return [{
      id: String(data.msgId ?? data.cliMsgId ?? Math.random()),
      type: 'image',
      url,
      thumbnailUrl: url,
    }];
  }

  if (msgType === 'chat.video.msg' || msgType === 'chat.video' || msgType === 'video') {
    const url = typeof contentObj?.href === 'string' ? contentObj.href.trim() : undefined;
    const thumb = typeof contentObj?.thumb === 'string' ? contentObj.thumb.trim() : undefined;
    if (!url) return [];
    return [{
      id: String(data.msgId ?? data.cliMsgId ?? Math.random()),
      type: 'video',
      url,
      thumbnailUrl: thumb ?? url,
      fileName: typeof contentObj?.title === 'string' ? contentObj.title : undefined,
    }];
  }

  if (msgType === 'chat.file' || msgType === 'chat.doc' || msgType === 'chat.voice' || msgType === 'chat.gif' || msgType === 'share.file') {
    const url = typeof contentObj?.href === 'string' ? contentObj.href.trim() : undefined;
    const fileName = typeof contentObj?.title === 'string' ? contentObj.title.trim()
      : typeof contentObj?.fileName === 'string' ? contentObj.fileName.trim() : undefined;
    const thumb = typeof contentObj?.thumb === 'string' ? contentObj.thumb.trim() : undefined;
    if (!url && !fileName) return [];
    return [{
      id: String(data.msgId ?? data.cliMsgId ?? Math.random()),
      type: 'file',
      url,
      thumbnailUrl: thumb,
      fileName,
    }];
  }

  return [];
}

function mergeAttachmentMetadata(existing: GoldAttachment | undefined, normalized: GoldAttachment, fallbackKind: GoldMessageKind) {
  const inferredType = normalized.type === 'text' ? fallbackKind : normalized.type;
  return {
    ...existing,
    ...normalized,
    type: inferredType,
    fileName: normalized.fileName ?? existing?.fileName,
    mimeType: normalized.mimeType ?? existing?.mimeType,
    size: normalized.size ?? existing?.size,
    width: normalized.width ?? existing?.width,
    height: normalized.height ?? existing?.height,
    duration: normalized.duration ?? existing?.duration,
  } satisfies GoldAttachment;
}

function localMediaUrlNeedsRepair(url?: string) {
  if (!url?.startsWith('/media/')) {
    return false;
  }

  const fileName = url.split('/').pop() ?? '';
  return !/\.[a-zA-Z0-9]{2,8}$/.test(fileName);
}

// legacy compat - chỉ dùng để backward compat với gold-3
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

function normalizeGroupList(response: unknown) {
  if (Array.isArray(response)) {
    return response;
  }

  if (response && typeof response === 'object') {
    const candidateKeys = ['groups', 'items', 'data', 'results', 'conversations'];
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

function normalizeGroupInfoMap(response: unknown) {
  if (!response || typeof response !== 'object') {
    return [];
  }

  const candidateKeys = ['gridInfoMap', 'groupInfoMap', 'groups', 'data'];
  for (const key of candidateKeys) {
    const value = (response as Record<string, unknown>)[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value as Record<string, unknown>).map(([groupId, group]) => ({
        groupId,
        ...(group && typeof group === 'object' ? group as Record<string, unknown> : {}),
      }));
    }
  }

  return [];
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getConversationTypeFromThreadId(threadId: string, knownGroupIds: Set<string>): GoldConversationType {
  return knownGroupIds.has(threadId) ? 'group' : 'direct';
}

function getConversationId(threadId: string, type: GoldConversationType) {
  return `${type}:${threadId}`;
}

function normalizeUserInfoMap(response: unknown) {
  if (!response || typeof response !== 'object') {
    return [];
  }

  const candidateKeys = ['changed_profiles', 'profiles', 'data', 'users'];
  for (const key of candidateKeys) {
    const value = (response as Record<string, unknown>)[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value as Record<string, unknown>).map(([userId, user]) => ({
        userId: userId.replace(/_0$/, ''),
        ...(user && typeof user === 'object' ? user as Record<string, unknown> : {}),
      }));
    }
  }

  return [];
}

function normalizeGroupMemberInfoMap(response: unknown) {
  if (!response || typeof response !== 'object') {
    return [];
  }

  const candidateKeys = ['gridMemMap', 'members', 'data', 'profiles'];
  for (const key of candidateKeys) {
    const value = (response as Record<string, unknown>)[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value as Record<string, unknown>).map(([userId, user]) => ({
        userId: userId.replace(/_0$/, ''),
        ...(user && typeof user === 'object' ? user as Record<string, unknown> : {}),
      }));
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
  private readonly boundAccountId?: string;
  private readonly conversations = new Map<string, GoldConversationMessage[]>();
  private readonly seenMessageKeys = new Set<string>();
  private listenerStarted = false;
  private listenerAttached = false;
  private readonly conversationListeners = new Set<ConversationListener>();
  private readonly mediaStore = new GoldMediaStore();
  private readonly pendingHistorySyncs = new Map<string, Promise<HistorySyncResult>>();
  private historySyncState: HistorySyncState | undefined;
  private listenerState: ListenerState = {
    attached: false,
    started: false,
    connected: false,
    startAttempts: 0,
  };

  constructor(
    private readonly store: GoldStore,
    private readonly logger: GoldLogger,
    options: { boundAccountId?: string } = {},
  ) {
    this.boundAccountId = options.boundAccountId?.trim() || undefined;
    if (this.boundAccountId) {
      this.store.activateAccount(this.boundAccountId);
    }
    this.hydrateConversationsFromStore();
  }

  private hydrateConversationsFromStore() {
    this.conversations.clear();
    this.seenMessageKeys.clear();

    for (const summary of this.store.listConversationSummariesByAccount(this.boundAccountId)) {
      const messages = this.store.listConversationMessagesByAccount(this.boundAccountId, summary.id);
      this.conversations.set(summary.id, messages);
      for (const message of messages) {
        this.seenMessageKeys.add(this.buildSeenKey(message));
      }
    }
  }

  async loginWithStoredCredential() {
    const credential = this.boundAccountId
      ? this.store.getCredentialForAccount(this.boundAccountId)
      : this.store.getCredential();
    if (!credential) {
      this.logger.error('missing_stored_credential');
      throw new Error('Stored credential not found. Hay chay lenh login truoc.');
    }

    return this.loginWithCredential(credential);
  }

  async startBoundAccount() {
    if (!this.boundAccountId) {
      throw new Error('Runtime nay chua duoc bind voi accountId cu the');
    }

    return this.loginWithStoredCredential();
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
    if (this.boundAccountId && this.currentAccount?.userId && this.currentAccount.userId !== this.boundAccountId) {
      throw new Error(`Credential dang tro toi account ${this.currentAccount.userId}, khong khop runtime da bind ${this.boundAccountId}`);
    }
    if (this.currentAccount?.userId) {
      this.store.setActiveAccount({
        accountId: this.currentAccount.userId,
        displayName: this.currentAccount.displayName,
        phoneNumber: this.currentAccount.phoneNumber,
      });
      this.store.canonicalizeConversationDataForAccount(this.boundAccountId);
      this.hydrateConversationsFromStore();
      void this.backfillMediaForStoredMessages();
    }
    this.logger.info('login_with_credential_succeeded');
    return this.session;
  }

  private buildMessageKey(
    conversationId: string,
    text: string,
    timestamp: string,
    direction: 'incoming' | 'outgoing',
    kind = 'text',
    imageUrl = '',
  ) {
    return `${conversationId}::${direction}::${kind}::${timestamp}::${text}::${imageUrl}`;
  }

  private buildSeenKey(message: Pick<GoldConversationMessage, 'conversationId' | 'providerMessageId' | 'text' | 'timestamp' | 'direction' | 'kind' | 'imageUrl'>) {
    if (message.providerMessageId?.trim()) {
      return `provider::${message.conversationId}::${message.providerMessageId.trim()}`;
    }

    return `fallback::${this.buildMessageKey(
      message.conversationId,
      message.text,
      message.timestamp,
      message.direction,
      message.kind,
      message.imageUrl,
    )}`;
  }

  private isLikelyDuplicateMessage(existing: GoldConversationMessage[], message: GoldConversationMessage) {
    if (message.providerMessageId?.trim()) {
      if (existing.some((item) => item.providerMessageId?.trim() === message.providerMessageId?.trim())) {
        return true;
      }

      if (this.store.hasMessageByProviderIdForAccount(this.boundAccountId, message.conversationId, message.providerMessageId.trim())) {
        return true;
      }
    }

    const messageTime = Date.parse(message.timestamp);
    return existing.some((item) => {
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
  }

  private getActiveAccountId() {
    return this.currentAccount?.userId ?? this.store.getCurrentAccountId();
  }

  private async persistAttachmentLocally(messageId: string, attachment: GoldAttachment) {
    if (!attachment.url && !attachment.sourceUrl) {
      return attachment;
    }

    const remoteSourceUrl = attachment.sourceUrl ?? attachment.url;
    const localUrlNeedsRepair = localMediaUrlNeedsRepair(attachment.url);

    if (attachment.url?.startsWith('/media/') && !localUrlNeedsRepair) {
      return attachment;
    }

    try {
      const mirrored = await this.mediaStore.mirrorRemoteUrl({
        accountId: this.getActiveAccountId(),
        messageId,
        sourceUrl: remoteSourceUrl as string,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
      });

      return {
        ...attachment,
        url: mirrored.publicUrl,
        sourceUrl: remoteSourceUrl,
        localPath: mirrored.localPath,
      } satisfies GoldAttachment;
    } catch (error) {
      this.logger.error('mirror_remote_attachment_failed', {
        messageId,
        url: remoteSourceUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        ...attachment,
        sourceUrl: remoteSourceUrl,
      } satisfies GoldAttachment;
    }
  }

  private async persistMessageAttachmentsLocally(message: GoldConversationMessage) {
    if (!message.attachments.length) {
      return message;
    }

    const attachments = await Promise.all(message.attachments.map((attachment) => this.persistAttachmentLocally(message.id, attachment)));
    const imageAttachment = attachments.find((attachment) => attachment.type === 'image' && attachment.url);
    return {
      ...message,
      attachments,
      imageUrl: imageAttachment?.url ?? message.imageUrl,
    } satisfies GoldConversationMessage;
  }

  private repairMessageFromRawPayload(message: GoldConversationMessage) {
    if (!message.rawMessageJson) {
      return message;
    }

    try {
      const raw = JSON.parse(message.rawMessageJson) as Record<string, unknown>;
      const normalizedKind = normalizeMessageKind(raw);
      const normalizedText = normalizeMessageText(raw);
      const normalizedAttachments = normalizeAttachments(raw);
      const normalizedImageUrl = normalizeImageUrl(raw);

      if (normalizedAttachments.length === 0 && normalizedKind === 'text' && !normalizedImageUrl) {
        return message;
      }

      const nextAttachments = normalizedAttachments.length > 0
        ? normalizedAttachments.map((attachment, index) => mergeAttachmentMetadata(message.attachments[index], attachment, normalizedKind))
        : message.attachments;

      return {
        ...message,
        text: normalizedText || message.text,
        kind: normalizedKind !== 'text' || nextAttachments.length > 0 ? normalizedKind : message.kind,
        attachments: nextAttachments,
        imageUrl: normalizedImageUrl ?? nextAttachments.find((attachment) => attachment.type === 'image')?.url ?? message.imageUrl,
      } satisfies GoldConversationMessage;
    } catch (error) {
      this.logger.error('repair_message_from_raw_payload_failed', {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return message;
    }
  }

  private appendConversationMessage(message: GoldConversationMessage) {
    const key = this.buildSeenKey(message);
    if (this.seenMessageKeys.has(key)) {
      return false;
    }

    const existing = this.conversations.get(message.conversationId) ?? [];
    const looksDuplicated = this.isLikelyDuplicateMessage(existing, message);

    if (looksDuplicated) {
      this.seenMessageKeys.add(key);
      return false;
    }

    this.seenMessageKeys.add(key);
    existing.push(message);
    existing.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    this.conversations.set(message.conversationId, existing);
    this.store.replaceConversationMessagesByAccount(this.boundAccountId, message.conversationId, existing);
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
        void this.handleIncomingListenerMessage(message);
      });
      listener.on('old_messages', (messages: ListenerMessage[], threadType: number) => {
        void this.handleOldMessages(messages, threadType);
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

  private async normalizeListenerMessage(message: ListenerMessage, forcedType?: GoldConversationType): Promise<GoldConversationMessage | undefined> {
    const threadId = String(message.threadId ?? '').trim();
    const knownGroupIds = new Set(this.store.listGroupsByAccount(this.boundAccountId).map((group) => group.groupId));
    const conversationType = forcedType
      ?? (message.type === ThreadType.Group ? 'group' : undefined)
      ?? getConversationTypeFromThreadId(threadId, knownGroupIds);
    const conversationId = getConversationId(threadId, conversationType);
    const data = message.data ?? {};
    const text = normalizeMessageText(data);
    const kind = normalizeMessageKind(data);
    const attachments = normalizeAttachments(data);
    const imageUrl = normalizeImageUrl(data);

    if (!threadId || (!text && attachments.length === 0)) {
      return undefined;
    }

    const normalized: GoldConversationMessage = {
      id: String(data.msgId ?? data.cliMsgId ?? randomUUID()),
      providerMessageId: String(data.msgId ?? data.cliMsgId ?? randomUUID()),
      conversationId,
      threadId,
      conversationType,
      text: text || (kind !== 'text' ? `[${kind}]` : ''),
      kind,
      attachments,
      imageUrl,
      direction: message.isSelf ? 'outgoing' : 'incoming',
      isSelf: Boolean(message.isSelf),
      senderId: typeof data.uidFrom === 'string' || typeof data.uidFrom === 'number' ? String(data.uidFrom) : undefined,
      senderName: conversationType === 'group'
        ? this.resolveGroupSenderName(threadId, typeof data.uidFrom === 'string' || typeof data.uidFrom === 'number' ? String(data.uidFrom) : undefined)
        : undefined,
      timestamp: normalizeMessageTimestamp(data),
      rawMessageJson: JSON.stringify(data),
    };

    return normalized;
  }

  private async handleOldMessages(messages: ListenerMessage[], threadType: number) {
    const sync = this.historySyncState;
    if (!sync) {
      this.logger.info('history_sync_old_messages_ignored', { reason: 'no_pending_sync', count: messages.length, threadType });
      return;
    }

    const forcedType = threadType === ThreadType.Group ? 'group' : 'direct';
    const normalizedCandidates = await Promise.all(messages.map((message) => this.normalizeListenerMessage(message, forcedType)));
    const normalized = normalizedCandidates
      .filter((message): message is GoldConversationMessage => message !== undefined)
      .filter((message) => message.threadId === sync.threadId && message.conversationType === sync.type)
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp));

    let insertedCount = 0;
    let dedupedCount = 0;
    for (const message of normalized) {
      const persisted = await this.persistMessageAttachmentsLocally(message);
      if (this.appendConversationMessage(persisted)) {
        insertedCount += 1;
      } else {
        dedupedCount += 1;
      }
    }

    const oldestMessage = normalized[0];
    const result: HistorySyncResult = {
      conversationId: sync.conversationId,
      threadId: sync.threadId,
      type: sync.type,
      requestedBeforeMessageId: sync.beforeMessageId,
      remoteCount: normalized.length,
      insertedCount,
      dedupedCount,
      oldestTimestamp: oldestMessage?.timestamp,
      oldestProviderMessageId: oldestMessage?.providerMessageId,
      hasMore: normalized.length > 0 && insertedCount > 0,
    };

    clearTimeout(sync.timer);
    this.historySyncState = undefined;
    this.pendingHistorySyncs.delete(sync.conversationId);
    this.logger.info('history_sync_completed', result);
    sync.resolve(result);
  }

  private async handleIncomingListenerMessage(message: ListenerMessage) {
    if (message?.type !== 0 && message?.type !== undefined) {
      this.logger.info('conversation_listener_message_non_zero_type', {
        type: message?.type,
        threadId: message?.threadId,
      });
    }

    const threadId = String(message.threadId ?? '').trim();
    const data = message.data ?? {};
    const text = normalizeMessageText(data);
    const kind = normalizeMessageKind(data);
    const attachments = normalizeAttachments(data);
    const imageUrl = normalizeImageUrl(data);

    if (message.type === ThreadType.Group && threadId) {
      await this.ensureGroupMetadata(threadId);
    }

    const normalizedMessage = await this.normalizeListenerMessage(message);

      this.logger.info('conversation_listener_message_received', {
      threadId,
      isSelf: Boolean(message.isSelf),
      textLength: text.length,
      kind,
      imageUrl,
      summary: summarizeListenerData(data),
    });
    this.listenerState.lastEventAt = new Date().toISOString();
    this.listenerState.lastMessageAt = this.listenerState.lastEventAt;

    if (!threadId || (!text && attachments.length === 0)) {
      this.logger.error('conversation_listener_message_ignored', {
        reason: !threadId ? 'missing_thread_id' : 'missing_content',
        threadId,
        isSelf: Boolean(message.isSelf),
        kind,
        summary: summarizeListenerData(data),
      });
      return;
    }

    if (!normalizedMessage) {
      this.logger.error('conversation_listener_message_ignored', {
        reason: !threadId ? 'missing_thread_id' : 'missing_content',
        threadId,
        isSelf: Boolean(message.isSelf),
        kind,
        summary: summarizeListenerData(data),
      });
      return;
    }

    const persistedMessage = await this.persistMessageAttachmentsLocally(normalizedMessage);

    if (this.appendConversationMessage(persistedMessage)) {
        this.logger.info('conversation_message_captured', {
        conversationId: normalizedMessage.conversationId,
        direction: persistedMessage.direction,
        kind,
        textLength: text.length,
      });
      return;
    }

    this.logger.info('conversation_message_deduped', {
      conversationId: normalizedMessage.conversationId,
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
          this.logger.info('qr_credential_captured_from_result', {
            cookieCount: Array.isArray(result?.cookies) ? result.cookies.length : 0,
          });
          await this.loginWithCredential(credential);
          if (!this.currentAccount?.userId) {
            throw new Error('Khong xac dinh duoc account sau khi login QR');
          }
          this.store.setCredentialForAccount(this.currentAccount.userId, credential);
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

              this.logger.info('qr_login_recovered_from_cookie_jar', {
                cookieCount: fallbackCookies.length,
                originalError: error instanceof Error ? error.message : String(error),
              });
              await this.loginWithCredential(credential);
              if (!this.currentAccount?.userId) {
                throw new Error('Khong xac dinh duoc account sau khi recover login QR');
              }
              this.store.setCredentialForAccount(this.currentAccount.userId, credential);
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
    return Boolean(this.boundAccountId ? this.store.getCredentialForAccount(this.boundAccountId) : this.store.getCredential());
  }

  isSessionActive() {
    return Boolean(this.session?.api);
  }

  getCurrentAccount() {
    return this.currentAccount;
  }

  getFriendCache() {
    return this.store.listContactsByAccount(this.boundAccountId);
  }

  getContactCache() {
    return this.store.listContactsByAccount(this.boundAccountId);
  }

  getBoundAccountId() {
    return this.boundAccountId;
  }

  getGroupCache() {
    return this.store.listGroupsByAccount(this.boundAccountId);
  }

  getConversationMessages(conversationId: string, options: { since?: string; before?: string; limit?: number } = {}) {
    const { since, before, limit } = options;
    const messages = before || limit
      ? this.store.listConversationMessagesByAccount(this.boundAccountId, conversationId, { before, limit })
      : (this.conversations.get(conversationId) ?? this.store.listConversationMessagesByAccount(this.boundAccountId, conversationId));

    if (!since) {
      return [...messages];
    }

    return messages.filter((message) => message.timestamp > since);
  }

  async syncConversationMetadata(conversationId: string) {
    if (!this.session) {
      await this.loginWithStoredCredential();
    }

    const target = this.resolveConversationTarget(conversationId);
    if (target.type === 'group') {
      await this.refreshGroupMetadata(target.threadId);
    } else {
      await this.refreshContactMetadata(target.threadId);
    }

    this.store.canonicalizeConversationDataForAccount(this.boundAccountId);
    const canonicalConversationId = getConversationId(target.threadId, target.type);
    const messages = this.store.enrichConversationMessageSendersByAccount(this.boundAccountId, canonicalConversationId);
    this.hydrateConversationsFromStore();

    return {
      conversationId: canonicalConversationId,
      type: target.type,
      threadId: target.threadId,
      messages,
    };
  }

  getConversationSummaries() {
    if (this.conversations.size === 0) {
      return this.store.listConversationSummariesByAccount(this.boundAccountId);
    }

    return this.store.listConversationSummariesByAccount(this.boundAccountId);
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

  async backfillMediaForStoredMessages() {
    let updatedMessages = 0;
    let repairedMessages = 0;
    for (const summary of this.store.listConversationSummariesByAccount(this.boundAccountId)) {
      const messages = this.store.listConversationMessagesByAccount(this.boundAccountId, summary.id);
      let changed = false;
      const nextMessages: GoldConversationMessage[] = [];
      for (const message of messages) {
        const repaired = this.repairMessageFromRawPayload(message);
        const needsBackfill = repaired.attachments.some((attachment) =>
          Boolean((attachment.sourceUrl || attachment.url) && (!attachment.url || !attachment.url.startsWith('/media/') || localMediaUrlNeedsRepair(attachment.url))),
        );
        const persisted = needsBackfill ? await this.persistMessageAttachmentsLocally(repaired) : repaired;
        nextMessages.push(persisted);

        const metadataChanged =
          repaired.kind !== message.kind ||
          repaired.text !== message.text ||
          JSON.stringify(repaired.attachments) !== JSON.stringify(message.attachments) ||
          repaired.imageUrl !== message.imageUrl;
        const mediaChanged =
          JSON.stringify(persisted.attachments) !== JSON.stringify(message.attachments) ||
          persisted.imageUrl !== message.imageUrl;

        if (metadataChanged || mediaChanged) {
          changed = true;
          updatedMessages += 1;
          if (metadataChanged) {
            repairedMessages += 1;
          }
        }
      }

      if (changed) {
        this.store.replaceConversationMessagesByAccount(this.boundAccountId, summary.id, nextMessages);
        this.conversations.set(summary.id, nextMessages);
      }
    }

    if (updatedMessages > 0) {
      this.logger.info('media_backfill_completed', { updatedMessages, repairedMessages });
    }

    return { updatedMessages, repairedMessages };
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
    const listener = this.session?.api?.listener as ListenerLike | undefined;
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

  async closeMessageListener() {
    const listener = this.session?.api?.listener as ListenerLike | undefined;
    listener?.stop?.();
    this.listenerStarted = false;
    this.listenerAttached = false;
    this.listenerState.started = false;
    this.listenerState.connected = false;
    this.listenerState.attached = false;
    this.listenerState.lastEventAt = new Date().toISOString();
  }

  async syncConversationHistory(conversationId: string, options: { beforeMessageId?: string; timeoutMs?: number } = {}) {
    if (!this.session) {
      await this.loginWithStoredCredential();
    }

    const listener = this.session?.api?.listener as ListenerLike | undefined;
    if (!listener?.requestOldMessages) {
      throw new Error('Session hien tai khong ho tro requestOldMessages');
    }

    const active = this.pendingHistorySyncs.get(conversationId);
    if (active) {
      return active;
    }

    const target = this.resolveConversationTarget(conversationId);
    const oldestLocal = this.store.listConversationMessagesByAccount(this.boundAccountId, conversationId, { limit: 1 })[0];
    const beforeMessageId = options.beforeMessageId?.trim() || oldestLocal?.providerMessageId;
    const timeoutMs = Math.max(3_000, Math.min(options.timeoutMs ?? 12_000, 45_000));

    const promise = new Promise<HistorySyncResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.historySyncState?.conversationId !== conversationId) {
          return;
        }

        this.historySyncState = undefined;
        this.pendingHistorySyncs.delete(conversationId);
        const result: HistorySyncResult = {
          conversationId,
          threadId: target.threadId,
          type: target.type,
          requestedBeforeMessageId: beforeMessageId,
          remoteCount: 0,
          insertedCount: 0,
          dedupedCount: 0,
          hasMore: false,
          timedOut: true,
        };
        this.logger.info('history_sync_timeout', result);
        resolve(result);
      }, timeoutMs);

      this.historySyncState = {
        conversationId,
        threadId: target.threadId,
        type: target.type,
        beforeMessageId,
        requestedAt: Date.now(),
        resolve,
        reject,
        timer,
      };

      this.logger.info('history_sync_requested', {
        conversationId,
        threadId: target.threadId,
        type: target.type,
        beforeMessageId,
        timeoutMs,
      });

      listener.requestOldMessages?.(
        target.type === 'group' ? ThreadType.Group : ThreadType.User,
        beforeMessageId ?? null,
      );
    });

    this.pendingHistorySyncs.set(conversationId, promise);
    return promise;
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
    this.store.clearSessionForAccount(this.boundAccountId);
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
    if (account.userId) {
      this.store.setActiveAccount({
        accountId: account.userId,
        displayName: account.displayName,
        phoneNumber: account.phoneNumber,
      });
      this.hydrateConversationsFromStore();
    }
    this.store.updateAccountProfile(this.boundAccountId ?? account.userId, {
      displayName: account.displayName,
      phoneNumber: account.phoneNumber,
    });
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
      displayName: String(friend.aliasName || friend.alias || friend.displayName || friend.zaloName || friend.username || friend.userId),
      zaloName: friend.zaloName ? String(friend.zaloName) : friend.displayName ? String(friend.displayName) : undefined,
      zaloAlias: friend.aliasName ? String(friend.aliasName) : friend.alias ? String(friend.alias) : undefined,
      avatar: friend.avatar ? String(friend.avatar) : undefined,
      status: friend.status ? String(friend.status) : undefined,
      phoneNumber: friend.phoneNumber ? String(friend.phoneNumber) : undefined,
      lastSyncAt: new Date().toISOString(),
    }));

    this.logger.info('friends_normalized', { count: friends.length });
    return this.store.replaceContactsByAccount(this.boundAccountId, friends);
  }

  async listGroups() {
    if (!this.session) {
      await this.loginWithStoredCredential();
    }

    if (!this.session?.api) {
      throw new Error('Session hien tai khong co API de tai groups');
    }

    let response: unknown;
    try {
      response = await fetchAllGroups(this.session.api);
    } catch (error) {
      this.logger.error('groups_fetch_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    this.logger.info('groups_raw_response_received', {
      responseType: Array.isArray(response) ? 'array' : typeof response,
      keys: response && typeof response === 'object' && !Array.isArray(response) ? Object.keys(response as Record<string, unknown>) : [],
      sample: response,
    });
    let groups = normalizeGroupList(response);

    if (groups.length === 0 && response && typeof response === 'object') {
      const gridVerMap = (response as Record<string, unknown>).gridVerMap;
      const groupIds = gridVerMap && typeof gridVerMap === 'object'
        ? Object.keys(gridVerMap as Record<string, unknown>)
        : [];

      if (groupIds.length > 0) {
        const mergedGroups: Array<Record<string, unknown>> = [];
        for (const batch of chunkArray(groupIds, 20)) {
          const infoResponse = await fetchGroupInfo(this.session.api, batch);
          const decodedGroups = normalizeGroupInfoMap(infoResponse) as Array<Record<string, unknown>>;
          this.logger.info('groups_info_response_received', {
            requestedCount: batch.length,
            responseType: Array.isArray(infoResponse) ? 'array' : typeof infoResponse,
            keys: infoResponse && typeof infoResponse === 'object' && !Array.isArray(infoResponse) ? Object.keys(infoResponse as Record<string, unknown>) : [],
            decodedCount: decodedGroups.length,
          });
          mergedGroups.push(...decodedGroups);
        }
        groups = mergedGroups;
      }
    }

    const conversationGroupIds = this.store.listConversationSummariesByAccount(this.boundAccountId)
      .filter((summary) => summary.type === 'group')
      .map((summary) => summary.threadId)
      .filter((threadId): threadId is string => Boolean(threadId));
    const knownGroupIds = new Set(groups.map((group: any) => String(group.groupId ?? group.grid ?? group.id ?? group.group_id)));
    const missingGroupIds = conversationGroupIds.filter((groupId) => !knownGroupIds.has(groupId));
    if (missingGroupIds.length > 0) {
      const infoResponse = await fetchGroupInfo(this.session.api, missingGroupIds);
      const infoGroups = normalizeGroupInfoMap(infoResponse);
      for (const group of infoGroups) {
        const normalizedGroupId = String((group as Record<string, unknown>).groupId ?? (group as Record<string, unknown>).grid ?? (group as Record<string, unknown>).id ?? (group as Record<string, unknown>).group_id);
        if (!knownGroupIds.has(normalizedGroupId)) {
          groups.push(group);
          knownGroupIds.add(normalizedGroupId);
        }
      }
      this.logger.info('groups_merged_from_conversations', {
        missingCount: missingGroupIds.length,
        mergedCount: infoGroups.length,
      });
    }

    const normalizedGroups: Omit<GoldGroupRecord, 'id'>[] = groups.map((group: any) => {
      const groupId = String(group.groupId ?? group.grid ?? group.id ?? group.group_id);
      const displayName = String(group.displayName ?? group.name ?? group.subject ?? group.groupName ?? groupId);
      const avatar = typeof group.avatar === 'string'
        ? group.avatar
        : typeof group.avatarUrl === 'string'
          ? group.avatarUrl
          : typeof group.thumb === 'string'
            ? group.thumb
            : typeof group.avt === 'string'
              ? group.avt
            : undefined;
      const members = this.normalizeGroupMembers(group.members ?? group.memVerList ?? group.memberIds);
      const memberCount = typeof group.memberCount === 'number'
        ? group.memberCount
        : typeof group.totalMember === 'number'
          ? group.totalMember
        : members?.length;

      return {
        groupId,
        displayName,
        avatar,
        memberCount,
        members,
        lastSyncAt: new Date().toISOString(),
      };
    });

    this.logger.info('groups_normalized', { count: normalizedGroups.length });
    this.store.replaceGroupsByAccount(this.boundAccountId, normalizedGroups);
    this.store.canonicalizeConversationDataForAccount(this.boundAccountId);
    this.hydrateConversationsFromStore();
    return this.store.listGroupsByAccount(this.boundAccountId);
  }

  private async refreshContactMetadata(userId: string) {
    if (!userId || !this.session?.api) {
      return;
    }

    const api = this.session.api;
    if (typeof api.getUserInfo !== 'function') {
      return;
    }

    try {
      const response = await api.getUserInfo(userId);
      const users = normalizeUserInfoMap(response) as Array<Record<string, unknown> & { userId: string }>;
      const user = users.find((entry) => entry.userId === userId) ?? users[0];
      if (!user) {
        return;
      }

      this.store.upsertContactByAccount(this.boundAccountId, {
        userId,
        displayName: String(user.aliasName ?? user.alias ?? user.displayName ?? user.zaloName ?? user.name ?? userId),
        zaloName: typeof user.zaloName === 'string'
          ? user.zaloName
          : typeof user.displayName === 'string'
            ? user.displayName
          : typeof user.name === 'string'
            ? user.name
            : undefined,
        zaloAlias: typeof user.aliasName === 'string'
          ? user.aliasName
          : typeof user.alias === 'string'
            ? user.alias
            : undefined,
        avatar: typeof user.avatar === 'string'
          ? user.avatar
          : typeof user.avatarUrl === 'string'
            ? user.avatarUrl
            : undefined,
        status: typeof user.status === 'string' ? user.status : undefined,
        phoneNumber: typeof user.phoneNumber === 'string' ? user.phoneNumber : undefined,
        lastSyncAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('contact_metadata_refresh_failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async refreshGroupMetadata(groupId: string) {
    if (!groupId || !this.session?.api) {
      return;
    }

    const api = this.session.api;
    if (typeof api.getContext !== 'function') {
      return;
    }

    try {
      const response = await fetchGroupInfo(api, [groupId]);
      const groups = normalizeGroupInfoMap(response) as Array<Record<string, unknown>>;
      const group = groups.find((entry) => String(entry.groupId ?? entry.grid ?? entry.id ?? entry.group_id) === groupId);
      if (!group) {
        return;
      }

      const baseMembers = this.normalizeGroupMembers(group.members ?? group.memVerList ?? group.memberIds) ?? [];
      const memberIds = Array.from(new Set(baseMembers.map((member) => member.userId)));
      const groupMemberProfiles = memberIds.length > 0 && typeof api.getGroupMembersInfo === 'function'
        ? normalizeGroupMemberInfoMap(await api.getGroupMembersInfo(memberIds)) as Array<Record<string, unknown> & { userId: string }>
        : [];
      const users = memberIds.length > 0 && typeof api.getUserInfo === 'function'
        ? normalizeUserInfoMap(await api.getUserInfo(memberIds)) as Array<Record<string, unknown> & { userId: string }>
        : [];
      const groupProfilesById = new Map(groupMemberProfiles.map((user) => [String(user.userId), user]));
      const usersById = new Map(users.map((user) => [String(user.userId), user]));
      const members = baseMembers.map((member) => {
        const groupProfile = groupProfilesById.get(member.userId);
        const user = usersById.get(member.userId);
        return {
          ...member,
          displayName: typeof groupProfile?.displayName === 'string'
            ? groupProfile.displayName
            : typeof groupProfile?.aliasName === 'string'
              ? groupProfile.aliasName
              : typeof groupProfile?.name === 'string'
                ? groupProfile.name
                : typeof user?.displayName === 'string'
            ? user.displayName
            : typeof user?.aliasName === 'string'
              ? user.aliasName
              : typeof user?.alias === 'string'
                ? user.alias
              : typeof user?.zaloName === 'string'
                ? user.zaloName
                : typeof user?.name === 'string'
                  ? user.name
                : member.displayName,
          avatar: typeof groupProfile?.avatar === 'string'
            ? groupProfile.avatar
            : typeof groupProfile?.avatarUrl === 'string'
              ? groupProfile.avatarUrl
              : typeof user?.avatar === 'string'
            ? user.avatar
            : typeof user?.avatarUrl === 'string'
              ? user.avatarUrl
              : member.avatar,
        };
      });

      this.store.upsertGroupByAccount(this.boundAccountId, {
        groupId,
        displayName: String(group.displayName ?? group.name ?? group.subject ?? group.groupName ?? groupId),
        avatar: typeof group.avatar === 'string'
          ? group.avatar
          : typeof group.avatarUrl === 'string'
            ? group.avatarUrl
            : typeof group.thumb === 'string'
              ? group.thumb
              : typeof group.avt === 'string'
                ? group.avt
                : undefined,
        memberCount: typeof group.memberCount === 'number'
          ? group.memberCount
          : typeof group.totalMember === 'number'
            ? group.totalMember
            : members.length,
        members,
        lastSyncAt: new Date().toISOString(),
      });

      for (const user of users) {
        this.store.upsertContactByAccount(this.boundAccountId, {
          userId: String(user.userId),
          displayName: String(user.aliasName ?? user.alias ?? user.displayName ?? user.zaloName ?? user.name ?? user.userId),
          zaloName: typeof user.zaloName === 'string'
            ? user.zaloName
            : typeof user.displayName === 'string'
              ? user.displayName
            : typeof user.name === 'string'
              ? user.name
              : undefined,
          zaloAlias: typeof user.aliasName === 'string'
            ? user.aliasName
            : typeof user.alias === 'string'
              ? user.alias
              : undefined,
          avatar: typeof user.avatar === 'string'
            ? user.avatar
            : typeof user.avatarUrl === 'string'
              ? user.avatarUrl
              : undefined,
          status: typeof user.status === 'string' ? user.status : undefined,
          phoneNumber: typeof user.phoneNumber === 'string' ? user.phoneNumber : undefined,
          lastSyncAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.logger.error('group_metadata_refresh_failed', {
        groupId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async ensureGroupMetadata(groupId: string) {
    if (!groupId || this.store.listGroupsByAccount(this.boundAccountId).some((group) => group.groupId === groupId)) {
      return;
    }

    if (!this.session) {
      await this.loginWithStoredCredential();
    }

    const api = this.session?.api;
    if (typeof api?.getContext !== 'function') {
      return;
    }

    try {
      const response = await fetchGroupInfo(api, [groupId]);
      const groups = normalizeGroupInfoMap(response) as Array<Record<string, unknown>>;
      if (groups.length === 0) {
        return;
      }

      const existingGroups = this.store.listGroupsByAccount(this.boundAccountId);
      const groupsById = new Map(existingGroups.map((group) => [group.groupId, group]));
      for (const group of groups) {
        const normalizedGroupId = String(group.groupId ?? group.grid ?? group.id ?? group.group_id);
        groupsById.set(normalizedGroupId, {
          id: groupsById.get(normalizedGroupId)?.id ?? randomUUID(),
          groupId: normalizedGroupId,
          displayName: String(group.displayName ?? group.name ?? group.subject ?? group.groupName ?? normalizedGroupId),
          avatar: typeof group.avatar === 'string'
            ? group.avatar
            : typeof group.avatarUrl === 'string'
              ? group.avatarUrl
              : typeof group.thumb === 'string'
                ? group.thumb
                : typeof group.avt === 'string'
                  ? group.avt
                  : undefined,
          memberCount: typeof group.memberCount === 'number'
            ? group.memberCount
            : typeof group.totalMember === 'number'
              ? group.totalMember
              : Array.isArray(group.members) ? group.members.length : undefined,
          members: this.normalizeGroupMembers(group.members ?? group.memVerList ?? group.memberIds),
          lastSyncAt: new Date().toISOString(),
        });
      }

      this.store.replaceGroupsByAccount(this.boundAccountId, [...groupsById.values()].map(({ id: _id, ...group }) => group));
      this.store.canonicalizeConversationDataForAccount(this.boundAccountId);
      this.hydrateConversationsFromStore();
      this.logger.info('group_metadata_enriched', { groupId, fetchedCount: groups.length });
    } catch (error) {
      this.logger.error('group_metadata_enrich_failed', {
        groupId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async sendText(conversationId: string, text: string) {
    if (!conversationId || !text) {
      throw new Error('conversationId va text la bat buoc');
    }

    if (!this.session) {
      await this.loginWithStoredCredential();
    }

    const api = this.session?.api;
    const target = this.resolveConversationTarget(conversationId);
    this.logger.info('send_text_started', { conversationId, threadId: target.threadId, type: target.type, text });

    if (typeof api?.sendMessage === 'function') {
      try {
        const result = await api.sendMessage(
          { msg: text },
          target.threadId,
          target.type === 'group' ? ThreadType.Group : ThreadType.User,
        );
        this.appendConversationMessage({
          id: String(result?.message?.msgId ?? result?.msgId ?? result?.messageId ?? randomUUID()),
          providerMessageId: String(result?.message?.msgId ?? result?.msgId ?? result?.messageId ?? randomUUID()),
          conversationId,
          threadId: target.threadId,
          conversationType: target.type,
          text,
          kind: 'text',
          attachments: [],
          direction: 'outgoing',
          isSelf: true,
          timestamp: new Date().toISOString(),
        });
        this.logger.info('send_text_succeeded', { method: 'sendMessage', conversationId, result });
        return { method: 'sendMessage', result };
      } catch (error) {
        this.logger.error('send_method_failed', { method: 'sendMessage', conversationId, error });
        console.error('[gold-1] send method sendMessage failed', error);
      }
    }

    if (typeof api?.sendMsg === 'function') {
      try {
        const result = await api.sendMsg({ msg: text }, target.threadId);
        this.appendConversationMessage({
          id: String(result?.message?.msgId ?? result?.msgId ?? result?.messageId ?? randomUUID()),
          providerMessageId: String(result?.message?.msgId ?? result?.msgId ?? result?.messageId ?? randomUUID()),
          conversationId,
          threadId: target.threadId,
          conversationType: target.type,
          text,
          kind: 'text',
          attachments: [],
          direction: 'outgoing',
          isSelf: true,
          timestamp: new Date().toISOString(),
        });
        this.logger.info('send_text_succeeded', { method: 'sendMsg', conversationId, result });
        return { method: 'sendMsg', conversationId, result };
      } catch (error) {
        this.logger.error('send_method_failed', { method: 'sendMsg', conversationId, error });
        console.error('[gold-1] send method sendMsg failed', error);
      }
    }

    const apiKeys = api && typeof api === 'object' ? Object.keys(api).sort() : [];
    this.logger.error('send_method_not_found', { conversationId, apiKeys });
    throw new Error(
      `Khong tim thay send API phu hop tren session. Available methods: ${apiKeys.join(', ')}`,
    );
  }

  async sendAttachment(conversationId: string, options: {
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
    caption?: string;
  }) {
    if (!conversationId) throw new Error('conversationId la bat buoc');
    if (!options.fileBuffer?.length) throw new Error('fileBuffer la bat buoc');
    if (!options.fileName.trim()) throw new Error('fileName la bat buoc');

    if (!this.session) {
      await this.loginWithStoredCredential();
    }

    const api = this.session?.api;
    if (typeof api?.sendMessage !== 'function') {
      throw new Error('Session khong ho tro sendMessage');
    }

    const target = this.resolveConversationTarget(conversationId);

    const caption = options.caption?.trim() ?? '';
    const mimeType = options.mimeType.trim();
    const kind: GoldMessageKind = mimeType.startsWith('image/') ? 'image' : 'file';

    const tempDir = path.join('/tmp/opencode', 'gold-4-uploads');
    mkdirSync(tempDir, { recursive: true });
    const safeFileName = options.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const tempFilePath = path.join(tempDir, `${Date.now()}-${randomUUID()}-${safeFileName}`);

    this.logger.info('send_attachment_started', {
      conversationId,
      threadId: target.threadId,
      kind,
      fileName: options.fileName,
      mimeType,
      size: options.fileBuffer.length,
    });

    writeFileSync(tempFilePath, options.fileBuffer);

    try {
      const result = await api.sendMessage(
        { msg: caption, attachments: [tempFilePath] },
        target.threadId,
        target.type === 'group' ? ThreadType.Group : ThreadType.User,
      );

      this.logger.info('send_attachment_api_result', { conversationId, result });

      // attachment[] có thể chứa photoId (image) hoặc fileId/msgId (file)
      const att = result?.attachment?.[0];
      const msgResult = result?.message;
      const messageId = String(att?.photoId ?? att?.fileId ?? att?.msgId ?? msgResult?.msgId ?? randomUUID());
      const storedMedia = this.mediaStore.saveBuffer({
        accountId: this.getActiveAccountId(),
        messageId,
        fileName: options.fileName,
        mimeType,
        buffer: options.fileBuffer,
      });

      const attachmentUrl = att?.normalUrl ?? att?.hdUrl ?? att?.thumbUrl ?? att?.fileUrl ?? undefined;
      const thumbnailUrl = att?.thumbUrl ?? att?.normalUrl ?? undefined;

      const goldAttachment: GoldAttachment = {
        id: messageId,
        type: kind,
        url: storedMedia.publicUrl,
        sourceUrl: attachmentUrl,
        localPath: storedMedia.localPath,
        thumbnailUrl: kind === 'image' ? storedMedia.publicUrl : thumbnailUrl,
        thumbnailSourceUrl: thumbnailUrl,
        fileName: options.fileName,
        mimeType,
        size: options.fileBuffer.length,
      };

      this.appendConversationMessage({
        id: messageId,
        providerMessageId: messageId,
        conversationId,
        threadId: target.threadId,
        conversationType: target.type,
        text: caption || `[${kind}]`,
        kind,
        attachments: [goldAttachment],
        imageUrl: kind === 'image' ? storedMedia.publicUrl : undefined,
        direction: 'outgoing',
        isSelf: true,
        timestamp: new Date().toISOString(),
        rawMessageJson: JSON.stringify(result ?? {}),
      });

      this.logger.info('send_attachment_succeeded', { conversationId, kind, messageId });
      return { method: 'sendMessage', kind, result };
    } finally {
      try { unlinkSync(tempFilePath); } catch { /* ignore */ }
    }
  }

  // Compat wrappers
  async sendImage(conversationId: string, options: { imageBuffer: Buffer; fileName: string; mimeType: string; caption?: string }) {
    return this.sendAttachment(conversationId, { fileBuffer: options.imageBuffer, ...options });
  }

  async sendFile(conversationId: string, options: { fileBuffer: Buffer; fileName: string; mimeType: string; caption?: string }) {
    return this.sendAttachment(conversationId, options);
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

  private resolveConversationTarget(conversationId: string) {
    if (conversationId.startsWith('group:')) {
      return { threadId: conversationId.slice('group:'.length), type: 'group' as const };
    }

    if (conversationId.startsWith('direct:')) {
      return { threadId: conversationId.slice('direct:'.length), type: 'direct' as const };
    }

    return { threadId: conversationId, type: 'direct' as const };
  }

  private normalizeGroupMembers(members: unknown): GoldGroupMemberRecord[] | undefined {
    if (!Array.isArray(members)) {
      return undefined;
    }

    return members
      .filter((member) => member && typeof member === 'object')
      .map((member: any) => ({
        userId: String(member.userId ?? member.uid ?? member.id),
        displayName: member.displayName ? String(member.displayName) : member.name ? String(member.name) : undefined,
        avatar: member.avatar ? String(member.avatar) : member.avatarUrl ? String(member.avatarUrl) : undefined,
        role: member.role ? String(member.role) : undefined,
      }));
  }

  private resolveGroupSenderName(groupId: string, senderId?: string) {
    if (!senderId) return undefined;
    const group = this.store.listGroupsByAccount(this.boundAccountId).find((entry) => entry.groupId === groupId);
    const member = group?.members?.find((entry) => entry.userId === senderId);
    if (member?.displayName) return member.displayName;
    const contact = this.store.listContactsByAccount(this.boundAccountId).find((entry) => entry.userId === senderId);
    return contact?.displayName;
  }

  static parseSendArgs(argv: string[]) {
    const friendId = readFlag(argv, 'to');
    const text = readFlag(argv, 'text') ?? 'hello world';
    return { friendId, text };
  }
}
