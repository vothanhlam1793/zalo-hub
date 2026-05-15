import { randomUUID } from 'node:crypto';
import { normalizeMessageText, normalizeMessageKind, normalizeAttachments, normalizeImageUrl, normalizeMessageTimestamp, summarizeListenerData, getConversationTypeFromThreadId, getConversationId, normalizeMessageQuote, normalizeMessageReactions, mapReactionIconToEmoji, normalizeReactionEvent } from './normalizer.js';
import type { GoldConversationMessage, GoldConversationType, GoldAttachment, GoldMessageKind, GoldMessageReactionItem } from '../types.js';
import type { SharedState, ListenerMessage, ListenerLike, HistorySyncResult } from './types.js';

const ThreadType = { User: 0, Group: 1 };

export class GoldListener {
  private readonly state: SharedState;
  private _resolveGroupSenderName?: (groupId: string, senderId?: string) => Promise<string | undefined>;
  private _ensureGroupMetadata?: (groupId: string) => Promise<void>;
  private _appendConversationMessage?: (message: GoldConversationMessage) => Promise<boolean>;
  private _persistMessageAttachmentsLocally?: (message: GoldConversationMessage) => Promise<GoldConversationMessage>;
  private _handleReactionUpdate?: (conversationId: string, targetGlobalMsgId: string, emoji: string, count: number, userIds: string[]) => Promise<boolean>;

  constructor(state: SharedState) {
    this.state = state;
  }

  init(deps: {
    resolveGroupSenderName: (groupId: string, senderId?: string) => Promise<string | undefined>;
    ensureGroupMetadata: (groupId: string) => Promise<void>;
    appendConversationMessage: (message: GoldConversationMessage) => Promise<boolean>;
    persistMessageAttachmentsLocally: (message: GoldConversationMessage) => Promise<GoldConversationMessage>;
    handleReactionUpdate: (conversationId: string, targetGlobalMsgId: string, emoji: string, count: number, userIds: string[]) => Promise<boolean>;
  }) {
    this._resolveGroupSenderName = deps.resolveGroupSenderName;
    this._ensureGroupMetadata = deps.ensureGroupMetadata;
    this._appendConversationMessage = deps.appendConversationMessage;
    this._persistMessageAttachmentsLocally = deps.persistMessageAttachmentsLocally;
    this._handleReactionUpdate = deps.handleReactionUpdate;
  }

  ensureMessageListener() {
    const listener = this.state.session?.api?.listener as ListenerLike | undefined;
    if (!listener) {
      this.state.logger.error('message_listener_unavailable');
      return;
    }

    if (!this.state.listenerAttached) {
      listener.on('connected', () => {
        this.state.listenerState.connected = true;
        this.state.listenerState.lastEventAt = new Date().toISOString();
        this.state.listenerState.lastError = undefined;
        this.state.logger.info('message_listener_connected');
      });
      listener.on('cipher_key', (key: unknown) => {
        this.state.cipherKey = typeof key === 'string' ? key : undefined;
        this.state.listenerState.lastEventAt = new Date().toISOString();
        this.state.logger.info('message_listener_cipher_key_received');
      });
      listener.on('message', (message: ListenerMessage) => {
        void this.handleIncomingListenerMessage(message);
      });
      listener.on('old_messages', (messages: ListenerMessage[], threadType: number) => {
        void this.handleOldMessages(messages, threadType);
      });
      listener.on('reaction', (reaction: unknown) => {
        void this.handleReaction(reaction as Record<string, unknown>);
      });
      listener.on('old_reactions', (reactions: unknown[], _isGroup: boolean) => {
        void this.handleOldReactions(reactions as Record<string, unknown>[]);
      });
      listener.on('error', (error: unknown) => {
        this.state.listenerState.connected = false;
        this.state.listenerState.lastEventAt = new Date().toISOString();
        this.state.listenerState.lastError = error instanceof Error ? error.message : String(error);
        this.state.logger.error('message_listener_error', error);
      });
      listener.on('closed', (code: unknown) => {
        this.state.listenerStarted = false;
        this.state.listenerState.started = false;
        this.state.listenerState.connected = false;
        this.state.listenerState.lastEventAt = new Date().toISOString();
        this.state.listenerState.lastCloseCode = String(code);
        this.state.logger.error('message_listener_closed', { code });
      });
      this.state.listenerAttached = true;
      this.state.listenerState.attached = true;
    }

    if (!this.state.listenerStarted) {
      this.startMessageListener(listener);
    }
  }

  startMessageListener(listener: ListenerLike) {
    listener.start({ retryOnClose: true });
    this.state.listenerStarted = true;
    this.state.listenerState.started = true;
    this.state.listenerState.startAttempts += 1;
    this.state.listenerState.lastEventAt = new Date().toISOString();
    this.state.logger.info('message_listener_started', { startAttempts: this.state.listenerState.startAttempts });

    const rawWs: WebSocket | null = (listener as any).ws;
    if (rawWs) {
      const onRawText = (event: { data: any }) => {
        const raw = event.data;
        if (typeof raw !== 'string') return;
        try {
          const parsed = JSON.parse(raw);
          const reqId = parsed.reqId || parsed.eventId || '';
          if (reqId) {
            this.state.logger.info('ws_text_frame', {
              reqId,
              hasData: !!parsed.data,
              keys: parsed.data ? Object.keys(parsed.data).slice(0, 6) : [],
            });
            if (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
              const msgs = parsed.data.msgs;
              const actions = parsed.data.actions;
              if (msgs && Array.isArray(msgs)) {
                this.state.logger.info('ws_text_frame_messages', { count: msgs.length, reqId });
              }
              if (actions && Array.isArray(actions)) {
                this.state.logger.info('ws_text_frame_actions', { count: actions.length, reqId });
              }
            }
          }
        } catch {}
      };
      (rawWs as any).addEventListener?.('message', onRawText);
    }
  }

  private async normalizeListenerMessage(message: ListenerMessage, forcedType?: GoldConversationType): Promise<GoldConversationMessage | undefined> {
    const threadId = String(message.threadId ?? '').trim();
    const groups = await this.state.store.listGroupsByAccount(this.state.boundAccountId);
    const knownGroupIds = new Set(groups.map((group) => group.groupId));
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
      cliMsgId: typeof data.cliMsgId === 'string' || typeof data.cliMsgId === 'number' ? String(data.cliMsgId) : undefined,
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
        ? await this._resolveGroupSenderName?.(threadId, typeof data.uidFrom === 'string' || typeof data.uidFrom === 'number' ? String(data.uidFrom) : undefined)
        : undefined,
      quote: normalizeMessageQuote(data),
      reactions: normalizeMessageReactions(data),
      timestamp: normalizeMessageTimestamp(data),
      rawMessageJson: JSON.stringify(data),
    };

    return normalized;
  }

  private async handleOldMessages(messages: ListenerMessage[], threadType: number) {
    const sync = this.state.historySyncState;
    if (!sync) {
      this.state.logger.info('history_sync_old_messages_ignored', { reason: 'no_pending_sync', count: messages.length, threadType });
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
      const persisted = await this._persistMessageAttachmentsLocally?.(message) ?? message;
      if (await this._appendConversationMessage?.(persisted)) {
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
      hasMore: normalized.length > 0,
    };

    clearTimeout(sync.timer);
    this.state.historySyncState = undefined;
    this.state.logger.info('history_sync_completed', result);
    sync.resolve(result);
  }

  private async handleIncomingListenerMessage(message: ListenerMessage) {
    if (message?.type !== 0 && message?.type !== undefined) {
      this.state.logger.info('conversation_listener_message_non_zero_type', {
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
      await this._ensureGroupMetadata?.(threadId);
    }

    const normalizedMessage = await this.normalizeListenerMessage(message);

      this.state.logger.info('conversation_listener_message_received', {
      threadId,
      isSelf: Boolean(message.isSelf),
      textLength: text.length,
      kind,
      imageUrl,
      summary: summarizeListenerData(data),
    });
    this.state.listenerState.lastEventAt = new Date().toISOString();
    this.state.listenerState.lastMessageAt = this.state.listenerState.lastEventAt;

    if (!threadId || (!text && attachments.length === 0)) {
      this.state.logger.error('conversation_listener_message_ignored', {
        reason: !threadId ? 'missing_thread_id' : 'missing_content',
        threadId,
        isSelf: Boolean(message.isSelf),
        kind,
        summary: summarizeListenerData(data),
        rawMsgType: String(data.msgType ?? ''),
      });
      return;
    }

    if (!normalizedMessage) {
      this.state.logger.error('conversation_listener_message_ignored', {
        reason: !threadId ? 'missing_thread_id' : 'missing_content',
        threadId,
        isSelf: Boolean(message.isSelf),
        kind,
        summary: summarizeListenerData(data),
      });
      return;
    }

    const persistedMessage = await this._persistMessageAttachmentsLocally?.(normalizedMessage) ?? normalizedMessage;

    if (await this._appendConversationMessage?.(persistedMessage)) {
        this.state.logger.info('conversation_message_captured', {
        conversationId: normalizedMessage.conversationId,
        direction: persistedMessage.direction,
        kind,
        textLength: text.length,
      });
      return;
    }

    this.state.logger.info('conversation_message_deduped', {
      conversationId: normalizedMessage.conversationId,
      direction: normalizedMessage.direction,
      kind,
      textLength: text.length,
    });
  }

  onConversationMessage(listener: (message: GoldConversationMessage) => void) {
    this.state.conversationListeners.add(listener);
    return () => {
      this.state.conversationListeners.delete(listener);
    };
  }

  getListenerState() {
    return { ...this.state.listenerState };
  }

  restartListener() {
    const listener = this.state.session?.api?.listener as ListenerLike | undefined;
    if (!listener) {
      throw new Error('Message listener unavailable');
    }

    listener.stop?.();
    this.state.listenerStarted = false;
    this.state.listenerState.started = false;
    this.state.listenerState.connected = false;
    this.state.listenerState.lastEventAt = new Date().toISOString();
    this.startMessageListener(listener);
    return this.getListenerState();
  }

  async closeMessageListener() {
    const listener = this.state.session?.api?.listener as ListenerLike | undefined;
    listener?.stop?.();
    this.state.listenerStarted = false;
    this.state.listenerAttached = false;
    this.state.listenerState.started = false;
    this.state.listenerState.connected = false;
    this.state.listenerState.attached = false;
    this.state.listenerState.lastEventAt = new Date().toISOString();
  }

  private async handleReaction(rawReaction: Record<string, unknown>) {
    if (!this._handleReactionUpdate) return;
    const groups = await this.state.store.listGroupsByAccount(this.state.boundAccountId);
    const knownGroupIds = new Set(groups.map((g) => g.groupId));
    const parsed = normalizeReactionEvent(rawReaction, knownGroupIds);
    if (!parsed.threadId || !parsed.emoji) return;

    for (const targetId of parsed.targetGlobalMsgIds) {
      try {
        const existing = this.state.conversations.get(parsed.conversationId) ?? [];
        const idx = existing.findIndex((msg) => msg.providerMessageId === targetId);
        const prevReactions = idx >= 0 ? (existing[idx].reactions ?? []) : [];
        const emojiIdx = prevReactions.findIndex((r) => r.emoji === parsed.emoji);
        if (emojiIdx >= 0) {
          prevReactions[emojiIdx] = { ...prevReactions[emojiIdx], count: prevReactions[emojiIdx].count + 1 };
        } else {
          prevReactions.push({ emoji: parsed.emoji, count: 1, userIds: parsed.userIds });
        }
        await this._handleReactionUpdate(parsed.conversationId, targetId, parsed.emoji, emojiIdx >= 0 ? prevReactions[emojiIdx].count : 1, parsed.userIds);
        if (idx >= 0) {
          existing[idx] = { ...existing[idx], reactions: [...prevReactions] };
          this.state.conversations.set(parsed.conversationId, existing);
          for (const listener of this.state.conversationListeners) {
            listener(existing[idx]);
          }
        }
        this.state.logger.info('reaction_applied', { conversationId: parsed.conversationId, targetId, emoji: parsed.emoji });
      } catch (error) {
        this.state.logger.error('reaction_apply_failed', { targetId, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  private async handleOldReactions(reactions: Record<string, unknown>[]) {
    for (const rawReaction of reactions) {
      try {
        await this.handleReaction(rawReaction);
      } catch (error) {
        this.state.logger.error('old_reaction_apply_failed', { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}
