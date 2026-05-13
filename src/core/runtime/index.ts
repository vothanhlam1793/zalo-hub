import { randomUUID } from 'node:crypto';
import * as ZaloApi from 'zalo-api-final';
import { GoldLogger } from '../logger.js';
import { GoldMediaStore } from '../media-store.js';
import { GoldStore } from '../store.js';
import { GoldSessionAuth } from './session-auth.js';
import { GoldListener } from './listener.js';
import { GoldSender } from './sender.js';
import { GoldSync } from './sync.js';
import { renderQrToTerminal, parseSendArgs } from './qr.js';
import { mergeAttachmentMetadata, localMediaUrlNeedsRepair, normalizeMessageKind, normalizeMessageText, normalizeAttachments, normalizeImageUrl } from './normalizer.js';
import type {
  GoldAttachment,
  GoldConversationMessage,
  GoldConversationType,
  GoldGroupMemberRecord,
  GoldMessageKind,
} from '../types.js';
import type { ActiveSession, GoldAccountInfo, SharedState, ListenerState } from './types.js';

const { ThreadType } = ZaloApi as {
  Zalo: new (options?: Record<string, unknown>) => any;
  ThreadType: { User: number; Group: number };
};

export { GoldSessionAuth } from './session-auth.js';
export { GoldListener } from './listener.js';
export { GoldSender } from './sender.js';
export { GoldSync } from './sync.js';
export { renderQrToTerminal, parseSendArgs } from './qr.js';
export * from './normalizer.js';
export * from './types.js';

export class GoldRuntime {
  private readonly auth: GoldSessionAuth;
  private readonly listener: GoldListener;
  private readonly sender: GoldSender;
  private readonly sync: GoldSync;
  private readonly state: SharedState;

  constructor(
    store: GoldStore,
    private readonly logger: GoldLogger,
    options: { boundAccountId?: string } = {},
  ) {
    const mediaStore = new GoldMediaStore();
    const boundAccountId = options.boundAccountId?.trim() || undefined;

    if (boundAccountId) {
      store.activateAccount(boundAccountId);
    }

    this.state = {
      store,
      logger,
      mediaStore,
      boundAccountId,
      session: undefined,
      currentQrCode: undefined,
      currentAccount: undefined,
      conversations: new Map(),
      seenMessageKeys: new Set(),
      conversationListeners: new Set(),
      listenerStarted: false,
      listenerAttached: false,
      listenerState: {
        attached: false,
        started: false,
        connected: false,
        startAttempts: 0,
      },
      historySyncState: undefined,
      pendingHistorySyncs: new Map(),
    };

    this.auth = new GoldSessionAuth(this.state);
    this.listener = new GoldListener(this.state);
    this.sender = new GoldSender(this.state);
    this.sync = new GoldSync(this.state);

    this.wireServices();
    this.hydrateConversationsFromStore();
  }

  private wireServices() {
    const bound = {
      appendConversationMessage: this.appendConversationMessage.bind(this),
      persistMessageAttachmentsLocally: this.persistMessageAttachmentsLocally.bind(this),
      persistAttachmentLocally: this.persistAttachmentLocally.bind(this),
      repairMessageFromRawPayload: this.repairMessageFromRawPayload.bind(this),
      hydrateConversationsFromStore: this.hydrateConversationsFromStore.bind(this),
      getActiveAccountId: this.getActiveAccountId.bind(this),
      resolveConversationTarget: this.resolveConversationTarget.bind(this),
      normalizeGroupMembers: this.normalizeGroupMembers.bind(this),
      resolveGroupSenderName: this.resolveGroupSenderName.bind(this),
      loginWithStoredCredential: this.auth.loginWithStoredCredential.bind(this.auth),
    };

    this.auth.init({
      ensureMessageListener: this.listener.ensureMessageListener.bind(this.listener),
      hydrateConversationsFromStore: this.hydrateConversationsFromStore.bind(this),
      backfillMediaForStoredMessages: this.sync.backfillMediaForStoredMessages.bind(this.sync),
    });

    this.listener.init({
      resolveGroupSenderName: bound.resolveGroupSenderName,
      ensureGroupMetadata: this.sync.ensureGroupMetadata.bind(this.sync),
      appendConversationMessage: bound.appendConversationMessage,
      persistMessageAttachmentsLocally: bound.persistMessageAttachmentsLocally,
    });

    this.sender.init({
      loginWithStoredCredential: bound.loginWithStoredCredential,
      appendConversationMessage: bound.appendConversationMessage,
      resolveConversationTarget: bound.resolveConversationTarget,
      getActiveAccountId: bound.getActiveAccountId,
    });

    this.sync.init({
      loginWithStoredCredential: bound.loginWithStoredCredential,
      resolveConversationTarget: bound.resolveConversationTarget,
      normalizeGroupMembers: bound.normalizeGroupMembers,
      resolveGroupSenderName: bound.resolveGroupSenderName,
      hydrateConversationsFromStore: bound.hydrateConversationsFromStore,
      repairMessageFromRawPayload: bound.repairMessageFromRawPayload,
      persistMessageAttachmentsLocally: bound.persistMessageAttachmentsLocally,
    });
  }

  // --- Shared private methods (used by multiple services) ---

  private hydrateConversationsFromStore() {
    this.state.conversations.clear();
    this.state.seenMessageKeys.clear();

    for (const summary of this.state.store.listConversationSummariesByAccount(this.state.boundAccountId)) {
      const messages = this.state.store.listConversationMessagesByAccount(this.state.boundAccountId, summary.id);
      this.state.conversations.set(summary.id, messages);
      for (const message of messages) {
        this.state.seenMessageKeys.add(this.buildSeenKey(message));
      }
    }
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

      if (this.state.store.hasMessageByProviderIdForAccount(this.state.boundAccountId, message.conversationId, message.providerMessageId.trim())) {
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
    return this.state.currentAccount?.userId ?? this.state.store.getCurrentAccountId();
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
      const mirrored = await this.state.mediaStore.mirrorRemoteUrl({
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
      this.state.logger.error('mirror_remote_attachment_failed', {
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
      this.state.logger.error('repair_message_from_raw_payload_failed', {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return message;
    }
  }

  private appendConversationMessage(message: GoldConversationMessage) {
    const key = this.buildSeenKey(message);
    if (this.state.seenMessageKeys.has(key)) {
      return false;
    }

    const existing = this.state.conversations.get(message.conversationId) ?? [];
    const looksDuplicated = this.isLikelyDuplicateMessage(existing, message);

    if (looksDuplicated) {
      this.state.seenMessageKeys.add(key);
      return false;
    }

    this.state.seenMessageKeys.add(key);
    existing.push(message);
    existing.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    this.state.conversations.set(message.conversationId, existing);
    this.state.store.replaceConversationMessagesByAccount(this.state.boundAccountId, message.conversationId, existing);
    for (const listener of this.state.conversationListeners) {
      listener(message);
    }
    return true;
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
    const group = this.state.store.listGroupsByAccount(this.state.boundAccountId).find((entry) => entry.groupId === groupId);
    const member = group?.members?.find((entry) => entry.userId === senderId);
    if (member?.displayName) return member.displayName;
    const contact = this.state.store.listContactsByAccount(this.state.boundAccountId).find((entry) => entry.userId === senderId);
    return contact?.displayName;
  }

  // --- Public API delegation ---

  async loginWithStoredCredential() {
    return this.auth.loginWithStoredCredential();
  }

  async startBoundAccount() {
    return this.auth.startBoundAccount();
  }

  async loginByQr(options?: { onQr?: (qrCode: string) => void }) {
    return this.auth.loginByQr(options);
  }

  getCurrentQrCode() {
    return this.auth.getCurrentQrCode();
  }

  hasCredential() {
    return this.auth.hasCredential();
  }

  isSessionActive() {
    return this.auth.isSessionActive();
  }

  getCurrentAccount() {
    return this.auth.getCurrentAccount();
  }

  async pingSession() {
    return this.auth.pingSession();
  }

  async doctor() {
    return this.auth.doctor();
  }

  async fetchAccountInfo() {
    return this.auth.fetchAccountInfo();
  }

  logout() {
    return this.auth.logout();
  }

  getFriendCache() {
    return this.sync.getFriendCache();
  }

  getContactCache() {
    return this.sync.getContactCache();
  }

  getBoundAccountId() {
    return this.sync.getBoundAccountId();
  }

  getGroupCache() {
    return this.sync.getGroupCache();
  }

  getConversationMessages(conversationId: string, options?: { since?: string; before?: string; limit?: number }) {
    return this.sync.getConversationMessages(conversationId, options);
  }

  getConversationSummaries() {
    return this.sync.getConversationSummaries();
  }

  async syncConversationMetadata(conversationId: string) {
    return this.sync.syncConversationMetadata(conversationId);
  }

  async syncConversationHistory(conversationId: string, options?: { beforeMessageId?: string; timeoutMs?: number }) {
    return this.sync.syncConversationHistory(conversationId, options);
  }

  async backfillMediaForStoredMessages() {
    return this.sync.backfillMediaForStoredMessages();
  }

  async listFriends() {
    return this.sync.listFriends();
  }

  async listGroups() {
    return this.sync.listGroups();
  }

  async sendText(conversationId: string, text: string) {
    return this.sender.sendText(conversationId, text);
  }

  async sendAttachment(conversationId: string, options: {
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
    caption?: string;
  }) {
    return this.sender.sendAttachment(conversationId, options);
  }

  async sendImage(conversationId: string, options: { imageBuffer: Buffer; fileName: string; mimeType: string; caption?: string }) {
    return this.sender.sendImage(conversationId, options);
  }

  async sendFile(conversationId: string, options: { fileBuffer: Buffer; fileName: string; mimeType: string; caption?: string }) {
    return this.sender.sendFile(conversationId, options);
  }

  async renderQrToTerminal(qrCode: string) {
    return renderQrToTerminal(qrCode, this.logger);
  }

  static parseSendArgs(argv: string[]) {
    return parseSendArgs(argv);
  }

  onConversationMessage(listener: (message: GoldConversationMessage) => void) {
    return this.listener.onConversationMessage(listener);
  }

  getListenerState() {
    return this.listener.getListenerState();
  }

  restartListener() {
    return this.listener.restartListener();
  }

  async closeMessageListener() {
    return this.listener.closeMessageListener();
  }
}
