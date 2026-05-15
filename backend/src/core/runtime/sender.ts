import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import * as ZaloApi from 'zalo-api-final';
import type { GoldConversationMessage, GoldConversationType, GoldMessageKind, GoldAttachment } from '../types.js';
import type { SharedState } from './types.js';

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

  async sendText(conversationId: string, text: string) {
    if (!conversationId || !text) {
      throw new Error('conversationId va text la bat buoc');
    }

    if (!this.state.session) {
      await this._loginWithStoredCredential?.();
    }

    const api = this.state.session?.api;
    const target = this._resolveConversationTarget?.(conversationId) ?? { threadId: conversationId, type: 'direct' as const };
    this.state.logger.info('send_text_started', { conversationId, threadId: target.threadId, type: target.type, text });

    if (typeof api?.sendMessage === 'function') {
      try {
        const result = await api.sendMessage(
          { msg: text },
          target.threadId,
          target.type === 'group' ? ThreadType.Group : ThreadType.User,
        );
        await this._appendConversationMessage?.({
          id: String(result?.message?.msgId ?? result?.msgId ?? result?.messageId ?? randomUUID()),
          providerMessageId: String(result?.message?.msgId ?? result?.msgId ?? result?.messageId ?? randomUUID()),
          cliMsgId: result?.message?.cliMsgId ? String(result.message.cliMsgId) : undefined,
          conversationId,
          threadId: target.threadId,
          conversationType: target.type,
          text,
          kind: 'text',
          attachments: [],
          direction: 'outgoing',
          isSelf: true,
          timestamp: new Date().toISOString(),
          rawMessageJson: JSON.stringify(result ?? {}),
        });
        this.state.logger.info('send_text_succeeded', { method: 'sendMessage', conversationId, result });
        return { method: 'sendMessage', result };
      } catch (error) {
        this.state.logger.error('send_method_failed', { method: 'sendMessage', conversationId, error });
        console.error('[gold-1] send method sendMessage failed', error);
      }
    }

    if (typeof api?.sendMsg === 'function') {
      try {
        const result = await api.sendMsg({ msg: text }, target.threadId);
        await this._appendConversationMessage?.({
          id: String(result?.message?.msgId ?? result?.msgId ?? result?.messageId ?? randomUUID()),
          providerMessageId: String(result?.message?.msgId ?? result?.msgId ?? result?.messageId ?? randomUUID()),
          cliMsgId: result?.message?.cliMsgId ? String(result.message.cliMsgId) : undefined,
          conversationId,
          threadId: target.threadId,
          conversationType: target.type,
          text,
          kind: 'text',
          attachments: [],
          direction: 'outgoing',
          isSelf: true,
          timestamp: new Date().toISOString(),
          rawMessageJson: JSON.stringify(result ?? {}),
        });
        this.state.logger.info('send_text_succeeded', { method: 'sendMsg', conversationId, result });
        return { method: 'sendMsg', conversationId, result };
      } catch (error) {
        this.state.logger.error('send_method_failed', { method: 'sendMsg', conversationId, error });
        console.error('[gold-1] send method sendMsg failed', error);
      }
    }

    const apiKeys = api && typeof api === 'object' ? Object.keys(api).sort() : [];
    this.state.logger.error('send_method_not_found', { conversationId, apiKeys });
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

    if (!this.state.session) {
      await this._loginWithStoredCredential?.();
    }

    const api = this.state.session?.api;
    if (typeof api?.sendMessage !== 'function') {
      throw new Error('Session khong ho tro sendMessage');
    }

    const target = this._resolveConversationTarget?.(conversationId) ?? { threadId: conversationId, type: 'direct' as const };

    const caption = options.caption?.trim() ?? '';
    const mimeType = options.mimeType.trim();
    const kind: GoldMessageKind = mimeType.startsWith('image/') ? 'image' : 'file';

    const tempDir = path.join('/tmp/opencode', 'gold-4-uploads');
    mkdirSync(tempDir, { recursive: true });
    const safeFileName = options.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const tempFilePath = path.join(tempDir, `${Date.now()}-${randomUUID()}-${safeFileName}`);

    this.state.logger.info('send_attachment_started', {
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

      this.state.logger.info('send_attachment_api_result', { conversationId, result });

      const att = result?.attachment?.[0];
      const msgResult = result?.message;
      const messageId = String(att?.photoId ?? att?.fileId ?? att?.msgId ?? msgResult?.msgId ?? randomUUID());
      const storedMedia = await this.state.mediaStore.saveBuffer({
        accountId: this._getActiveAccountId?.() ?? '',
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

      await this._appendConversationMessage?.({
        id: messageId,
        providerMessageId: messageId,
        cliMsgId: result?.message?.cliMsgId ? String(result.message.cliMsgId) : undefined,
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

      this.state.logger.info('send_attachment_succeeded', { conversationId, kind, messageId });
      return { method: 'sendMessage', kind, result };
    } finally {
      try { unlinkSync(tempFilePath); } catch { /* ignore */ }
    }
  }

  async sendImage(conversationId: string, options: { imageBuffer: Buffer; fileName: string; mimeType: string; caption?: string }) {
    return this.sendAttachment(conversationId, { fileBuffer: options.imageBuffer, ...options });
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
}
