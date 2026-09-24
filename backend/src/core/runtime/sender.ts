import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import * as ZaloApi from 'zalo-api-final';
import type { GoldConversationMessage, GoldConversationType, GoldMessageKind } from '../types.js';
import type { SharedState } from './types.js';
import { parseSendMessageReceipt, SendFailure, type SendExecution, type SendLifecycle } from './send-contract.js';
import { buildStoredMessageId } from '../store/helpers.js';

const ThreadType = { User: 0, Group: 1 };
const { Reactions } = ZaloApi as {
  Reactions: Record<string, string>;
};

export class GoldSender {
  private readonly state: SharedState;
  private _loginWithStoredCredential?: () => Promise<SharedState['session']>;
  private _appendConversationMessage?: (message: GoldConversationMessage) => Promise<boolean>;
  private _resolveConversationTarget?: (conversationId: string) => { threadId: string; type: GoldConversationType };
  private _getActiveAccountId?: () => string | undefined;

  constructor(state: SharedState) {
    this.state = state;
  }

  init(deps: {
    loginWithStoredCredential: () => Promise<SharedState['session']>;
    appendConversationMessage: (message: GoldConversationMessage) => Promise<boolean>;
    resolveConversationTarget: (conversationId: string) => { threadId: string; type: GoldConversationType };
    getActiveAccountId: () => string | undefined;
  }) {
    this._loginWithStoredCredential = deps.loginWithStoredCredential;
    this._appendConversationMessage = deps.appendConversationMessage;
    this._resolveConversationTarget = deps.resolveConversationTarget;
    this._getActiveAccountId = deps.getActiveAccountId;
  }

  private async ensureSessionReady(context: string) {
    if (this.state.listenerState.needsRelogin) {
      this.state.logger.info('ensure_session_needs_relogin', { context });
      await this._loginWithStoredCredential?.();
    }
    if (!this.state.session) {
      await this._loginWithStoredCredential?.();
    }
  }

  private execution(conversationId: string, target: { threadId: string; type: GoldConversationType },
    text: string, kind: GoldMessageKind, method: string, result: unknown, lifecycle?: SendLifecycle): SendExecution {
    // Only sendMessage has a verified aggregate receipt in the installed SDK.
    const parsed = method === 'sendMessage' ? parseSendMessageReceipt(result) : { accepted: false, slots: [] };
    const timestamp = new Date().toISOString();
    const accountId = this.state.boundAccountId ?? this._getActiveAccountId?.();
    const messages = parsed.slots.map((slot): GoldConversationMessage => ({
      id: accountId ? buildStoredMessageId(accountId, slot.id) : slot.id,
      providerMessageId: slot.id,
      clientRequestId: lifecycle?.clientRequestId,
      conversationId, threadId: target.threadId, conversationType: target.type,
      text: slot.attachment && parsed.slots.some((s) => !s.attachment) ? `[${kind}]` : text || `[${kind}]`,
      kind: slot.attachment ? kind : 'text', attachments: [], direction: 'outgoing', isSelf: true,
      timestamp,
      // Do not invent cliMsgId; the SDK result type does not expose it.
      rawMessageJson: JSON.stringify({ msgId: slot.id }),
    }));
    return { method, result, ...(kind !== 'text' ? { kind } : {}), status: parsed.accepted ? 'sent' : 'unknown',
      messages, providerMessageIds: 'observedIds' in parsed ? parsed.observedIds ?? [] : [...new Set(parsed.slots.map((s) => s.id))],
      acceptedAt: parsed.accepted ? timestamp : undefined };
  }

  private async persistAccepted(execution: SendExecution, lifecycle: SendLifecycle | undefined,
    localWork: () => Promise<void>) {
    if (execution.status !== 'sent') return;
    const started = Date.now();
    try {
      // This await separates remote acceptance from local failures. Never retry the provider here.
      await lifecycle?.onAccepted?.(execution);
      await localWork();
    } catch {
      execution.localPersistenceFailed = true;
      this.state.logger.error('send_local_persistence_failed', { clientRequestId: lifecycle?.clientRequestId,
        providerMessageIds: execution.providerMessageIds, code: 'LOCAL_PERSISTENCE_FAILED' });
    } finally {
      this.state.logger.info('send_local_persistence_completed', { clientRequestId: lifecycle?.clientRequestId,
        durationMs: Date.now() - started, failed: Boolean(execution.localPersistenceFailed) });
    }
  }

  private buildApiKeysReport(): string {
    const api = this.state.session?.api;
    const apiKeys = api && typeof api === 'object' ? Object.keys(api).sort() : [];
    return apiKeys.join(', ');
  }

  async sendText(conversationId: string, text: string, lifecycle?: SendLifecycle): Promise<SendExecution> {
    if (!conversationId || !text) {
      throw new Error('conversationId va text la bat buoc');
    }

    await this.ensureSessionReady(`sendText:${conversationId}`);

    const api = this.state.session?.api;
    const target = this._resolveConversationTarget?.(conversationId) ?? { threadId: conversationId, type: 'direct' as const };
    const method = typeof api?.sendMessage === 'function' ? 'sendMessage' : typeof api?.sendMsg === 'function' ? 'sendMsg' : undefined;
    if (!method) throw new SendFailure('SESSION_UNAVAILABLE', 'Phiên Zalo chưa sẵn sàng.', true, 409);
    const started = Date.now();
    lifecycle?.onDispatch?.();
    let result: unknown;
    try {
      result = method === 'sendMessage'
        ? await api.sendMessage({ msg: text }, target.threadId, target.type === 'group' ? ThreadType.Group : ThreadType.User)
        : await api.sendMsg({ msg: text }, target.threadId);
    } catch (error) {
      // Coded SDK errors are explicit provider rejections only for this one-message call.
      const e = error as { name?: string; code?: unknown };
      if (method === 'sendMessage' && e?.name === 'ZcaApiError' && typeof e.code === 'number' && e.code !== 0) {
        throw new SendFailure('PROVIDER_REJECTED', 'Zalo từ chối tin nhắn.', false);
      }
      throw error;
    }
    const execution = this.execution(conversationId, target, text, 'text', method, result, lifecycle);
    this.state.logger.info('send_provider_completed', { conversationId, clientRequestId: lifecycle?.clientRequestId,
      sdkDurationMs: Date.now() - started, status: execution.status });
    await this.persistAccepted(execution, lifecycle, async () => {
      for (const message of execution.messages) await this._appendConversationMessage?.(message);
    });
    return execution;
  }

  private findAttachmentSendMethod(): string | undefined {
    const api = this.state.session?.api;
    if (typeof api?.sendMessage === 'function') return 'sendMessage';
    if (typeof api?.sendFile === 'function') return 'sendFile';
    if (typeof api?.sendVideo === 'function') return 'sendVideo';
    return undefined;
  }

  async sendAttachment(conversationId: string, options: {
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
    caption?: string;
  }, lifecycle?: SendLifecycle): Promise<SendExecution> {
    if (!conversationId) throw new Error('conversationId la bat buoc');
    if (!options.fileBuffer?.length) throw new Error('fileBuffer la bat buoc');
    if (!options.fileName.trim()) throw new Error('fileName la bat buoc');

    await this.ensureSessionReady(`sendAttachment:${conversationId}`);

    const api = this.state.session?.api;
    const sendMethod = this.findAttachmentSendMethod();

    if (!sendMethod) {
      const apiKeys = this.buildApiKeysReport();
      throw new Error(`Session khong ho tro send attachment (sendMessage/sendFile/sendVideo deu thieu). Available methods: ${apiKeys}`);
    }

    const target = this._resolveConversationTarget?.(conversationId) ?? { threadId: conversationId, type: 'direct' as const };

    const caption = options.caption?.trim() ?? '';
    const mimeType = options.mimeType.trim();
    const kind: GoldMessageKind = mimeType.startsWith('image/') ? 'image' : 'file';

    const tempDir = path.join('/tmp', 'zalohub-uploads');
    mkdirSync(tempDir, { recursive: true, mode: 0o700 });
    const ext = path.extname(options.fileName) || (kind === 'image' ? '.jpg' : '');
    const baseName = path.basename(options.fileName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFileName = `${baseName || 'file'}${ext}`;
    const tempFilePath = path.join(tempDir, `${Date.now()}-${randomUUID()}-${safeFileName}`);

    this.state.logger.info('send_attachment_started', {
      conversationId,
      threadId: target.threadId,
      kind,
      mimeType,
      size: options.fileBuffer.length,
    });

    writeFileSync(tempFilePath, options.fileBuffer, { flag: 'wx', mode: 0o600 });

    try {
      let result: any;
      const started = Date.now();
      lifecycle?.onDispatch?.();
      if (sendMethod === 'sendMessage') {
        result = await api.sendMessage(
          { msg: caption, attachments: [tempFilePath] },
          target.threadId,
          target.type === 'group' ? ThreadType.Group : ThreadType.User,
        );
      } else {
        result = await api[sendMethod](tempFilePath, target.threadId);
      }

      const execution = this.execution(conversationId, target, caption, kind, sendMethod, result, lifecycle);
      this.state.logger.info('send_provider_completed', { conversationId, clientRequestId: lifecycle?.clientRequestId,
        sdkDurationMs: Date.now() - started, status: execution.status });
      for (const message of execution.messages) if (message.kind !== 'text') message.attachments = [{
        id: message.id, type: kind, fileName: options.fileName, mimeType, size: options.fileBuffer.length,
      }];
      await this.persistAccepted(execution, lifecycle, async () => {
        for (const message of execution.messages) {
          if (message.kind !== 'text') {
            const storedMedia = await this.state.mediaStore.saveBuffer({
              accountId: this.state.boundAccountId ?? this._getActiveAccountId?.() ?? '',
              messageId: message.providerMessageId!, fileName: options.fileName, mimeType, buffer: options.fileBuffer,
            });
            message.attachments[0] = { ...message.attachments[0], url: storedMedia.publicUrl,
              localPath: storedMedia.localPath, thumbnailUrl: kind === 'image' ? storedMedia.publicUrl : undefined };
            message.imageUrl = kind === 'image' ? storedMedia.publicUrl : undefined;
          }
          await this._appendConversationMessage?.(message);
        }
      });
      return execution;
    } finally {
      try { unlinkSync(tempFilePath); } catch { /* ignore */ }
    }
  }

  async sendImage(conversationId: string, options: { imageBuffer: Buffer; fileName: string; mimeType: string; caption?: string }, lifecycle?: SendLifecycle) {
    return this.sendAttachment(conversationId, { fileBuffer: options.imageBuffer, ...options }, lifecycle);
  }

  async sendFile(conversationId: string, options: { fileBuffer: Buffer; fileName: string; mimeType: string; caption?: string }) {
    return this.sendAttachment(conversationId, options);
  }

  async sendSticker(conversationId: string, stickerId: string, catId: string) {
    if (!this.state.session) await this._loginWithStoredCredential?.();
    const api = this.state.session?.api;
    if (typeof api?.sendSticker !== 'function') throw new Error('Session khong ho tro sendSticker');
    const target = this._resolveConversationTarget?.(conversationId) ?? { threadId: conversationId, type: 'direct' as const };
    const result = await api.sendSticker(stickerId, catId, target.threadId, target.type === 'group' ? ThreadType.Group : ThreadType.User);
    return { method: 'sendSticker', result };
  }

  async sendTypingEvent(conversationId: string, isTyping: boolean) {
    if (!this.state.session) await this._loginWithStoredCredential?.();
    const api = this.state.session?.api;
    if (typeof api?.sendTypingEvent !== 'function') return;
    const target = this._resolveConversationTarget?.(conversationId) ?? { threadId: conversationId, type: 'direct' as const };
    await api.sendTypingEvent(target.threadId, target.type === 'group' ? ThreadType.Group : ThreadType.User, isTyping);
  }

  async addReaction(conversationId: string, messageId: string, cliMsgId: string, reactionIcon: string) {
    if (!this.state.session) await this._loginWithStoredCredential?.();
    const api = this.state.session?.api;
    if (typeof api?.addReaction !== 'function') throw new Error('Session khong ho tro addReaction');
    const target = this._resolveConversationTarget?.(conversationId) ?? { threadId: conversationId, type: 'direct' as const };
    const normalizedReactionIcon = typeof reactionIcon === 'string' ? reactionIcon.trim() : '';
    if (!messageId || !cliMsgId || !normalizedReactionIcon) {
      throw new Error('messageId, cliMsgId va icon la bat buoc de gui reaction');
    }
    const validReactionIcon = Object.values(Reactions).includes(normalizedReactionIcon)
      ? normalizedReactionIcon
      : Reactions.NONE;
    if (!validReactionIcon) {
      throw new Error(`Reaction icon khong hop le: ${normalizedReactionIcon}`);
    }
    const result = await api.addReaction(validReactionIcon, {
      data: {
        msgId: messageId,
        cliMsgId,
      },
      threadId: target.threadId,
      type: target.type === 'group' ? ThreadType.Group : ThreadType.User,
    });
    return { method: 'addReaction', result };
  }

  async createPoll(groupId: string, question: string, options: string[]) {
    if (!this.state.session) await this._loginWithStoredCredential?.();
    const api = this.state.session?.api;
    if (typeof api?.createPoll !== 'function') throw new Error('Session khong ho tro createPoll');
    const result = await api.createPoll(groupId, question, options);
    return { method: 'createPoll', result };
  }

  async forwardMessage(messageId: string, toThreadId: string, toType: GoldConversationType) {
    if (!this.state.session) await this._loginWithStoredCredential?.();
    const api = this.state.session?.api;
    if (typeof api?.forwardMessage !== 'function') throw new Error('Session khong ho tro forwardMessage');
    const result = await api.forwardMessage(messageId, toThreadId, toType === 'group' ? ThreadType.Group : ThreadType.User);
    return { method: 'forwardMessage', result };
  }

  async getUnreadMark() {
    if (!this.state.session) await this._loginWithStoredCredential?.();
    const api = this.state.session?.api;
    if (typeof api?.getUnreadMark !== 'function') throw new Error('Session khong ho tro getUnreadMark');
    const result = await api.getUnreadMark();

    return {
      direct: (result.data?.convsUser ?? []).map((item: any) => ({
        threadId: String(item.id),
        count: (item.unreadCount || item.msgCount || item.count || item.totalUnread || 1),
      })),
      group: (result.data?.convsGroup ?? []).map((item: any) => ({
        threadId: String(item.id),
        count: (item.unreadCount || item.msgCount || item.count || item.totalUnread || 1),
      })),
    };
  }

  async markConversationRead(threadId: string, isGroup: boolean) {
    if (!this.state.session) await this._loginWithStoredCredential?.();
    const api = this.state.session?.api;
    if (typeof api?.removeUnreadMark !== 'function') return;
    try {
      await api.removeUnreadMark(threadId, isGroup ? ThreadType.Group : ThreadType.User);
    } catch {
      // non-blocking
    }
  }
}
