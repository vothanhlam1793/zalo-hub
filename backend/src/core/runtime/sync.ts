import { randomUUID } from 'node:crypto';
import { createDecipheriv } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { normalizeFriendList, normalizeGroupList, normalizeGroupInfoMap, chunkArray, normalizeUserInfoMap, normalizeGroupMemberInfoMap, getConversationId, localMediaUrlNeedsRepair, normalizeMessageKind, normalizeMessageText, normalizeAttachments, normalizeImageUrl, mergeAttachmentMetadata } from './normalizer.js';
import { getAllGroups as fetchAllGroups, getGroupInfo as fetchGroupInfo } from '../zalo-group-client.js';
import { ZaloPcHandshake } from '../zalo-pc-handshake.js';
import type { GoldConversationMessage, GoldConversationType, GoldGroupMemberRecord, GoldAttachment } from '../types.js';
import type { SharedState, HistorySyncResult } from './types.js';

const ThreadType = { User: 0, Group: 1 };

export class GoldSync {
  private readonly state: SharedState;
  private _loginWithStoredCredential?: () => Promise<SharedState['session']>;
  private _resolveConversationTarget?: (conversationId: string) => { threadId: string; type: GoldConversationType };
  private _normalizeGroupMembers?: (members: unknown) => GoldGroupMemberRecord[] | undefined;
  private _resolveGroupSenderName?: (groupId: string, senderId?: string) => Promise<string | undefined>;
  private _hydrate?: () => Promise<void>;
  private _repairMessageFromRawPayload?: (message: GoldConversationMessage) => GoldConversationMessage;
  private _persistMessageAttachmentsLocally?: (message: GoldConversationMessage) => Promise<GoldConversationMessage>;
  constructor(state: SharedState) {
    this.state = state;
  }

  init(deps: {
    loginWithStoredCredential: () => Promise<SharedState['session']>;
    resolveConversationTarget: (conversationId: string) => { threadId: string; type: GoldConversationType };
    normalizeGroupMembers: (members: unknown) => GoldGroupMemberRecord[] | undefined;
    resolveGroupSenderName: (groupId: string, senderId?: string) => Promise<string | undefined>;
    hydrateConversationsFromStore: () => Promise<void>;
    repairMessageFromRawPayload: (message: GoldConversationMessage) => GoldConversationMessage;
    persistMessageAttachmentsLocally: (message: GoldConversationMessage) => Promise<GoldConversationMessage>;
  }) {
    this._loginWithStoredCredential = deps.loginWithStoredCredential;
    this._resolveConversationTarget = deps.resolveConversationTarget;
    this._normalizeGroupMembers = deps.normalizeGroupMembers;
    this._resolveGroupSenderName = deps.resolveGroupSenderName;
    this._hydrate = deps.hydrateConversationsFromStore;
    this._repairMessageFromRawPayload = deps.repairMessageFromRawPayload;
    this._persistMessageAttachmentsLocally = deps.persistMessageAttachmentsLocally;
  }

  async getFriendCache() {
    return await this.state.store.listContactsByAccount(this.state.boundAccountId);
  }

  async getContactCache() {
    return await this.state.store.listContactsByAccount(this.state.boundAccountId);
  }

  getBoundAccountId() {
    return this.state.boundAccountId;
  }

  async getGroupCache() {
    return await this.state.store.listGroupsByAccount(this.state.boundAccountId);
  }

  async getConversationMessages(conversationId: string, options: { since?: string; before?: string; limit?: number } = {}) {
    const { since, before, limit } = options;
    const messages = before || limit
      ? await this.state.store.listConversationMessagesByAccount(this.state.boundAccountId, conversationId, { before, limit })
      : (this.state.conversations.get(conversationId) ?? await this.state.store.listConversationMessagesByAccount(this.state.boundAccountId, conversationId));

    if (!since) {
      return [...messages];
    }

    return messages.filter((message) => message.timestamp > since);
  }

  async getConversationSummaries() {
    if (this.state.conversations.size === 0) {
      return await this.state.store.listConversationSummariesByAccount(this.state.boundAccountId);
    }

    return await this.state.store.listConversationSummariesByAccount(this.state.boundAccountId);
  }

  async syncConversationMetadata(conversationId: string) {
    if (!this.state.session) {
      await this._loginWithStoredCredential?.();
    }

    const target = this._resolveConversationTarget?.(conversationId) ?? { threadId: conversationId, type: 'direct' as const };

    // Refresh contact/group metadata from Zalo (lightweight).
    // canonicalizeConversationData and hydrateConversationsFromStore are intentionally
    // NOT called here — they run once at startup (loginWithCredential) and would be
    // catastrophically expensive on every conversation click.
    if (target.type === 'group') {
      await this.refreshGroupMetadata(target.threadId).catch((err) => {
        this.state.logger.error('sync_conversation_metadata_group_refresh_failed', {
          threadId: target.threadId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    } else {
      await this.refreshContactMetadata(target.threadId).catch((err) => {
        this.state.logger.error('sync_conversation_metadata_contact_refresh_failed', {
          threadId: target.threadId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    const canonicalConversationId = getConversationId(target.threadId, target.type);

    // Load messages for this specific conversation only (not the whole account).
    const messages = await this.state.store.listConversationMessagesByAccount(this.state.boundAccountId, canonicalConversationId);

    // Request old reactions in background (non-blocking).
    void (async () => {
      try {
        const reactionListener = this.state.session?.api?.listener as { requestOldReactions?: (threadType: number, lastMsgId?: string | null) => void } | undefined;
        if (reactionListener?.requestOldReactions) {
          const threadType = target.type === 'group' ? ThreadType.Group : ThreadType.User;
          const oldestMessage = messages[messages.length - 1];
          reactionListener.requestOldReactions(threadType, oldestMessage?.providerMessageId ?? null);
        }
      } catch {
        // Non-critical: old reactions load silently.
      }
    })();

    return {
      conversationId: canonicalConversationId,
      type: target.type,
      threadId: target.threadId,
      messages,
    };
  }

  async syncConversationHistory(conversationId: string, options: { beforeMessageId?: string; timeoutMs?: number; maxTotalTimeMs?: number } = {}) {
    if (!this.state.session) {
      await this._loginWithStoredCredential?.();
    }

    const listener = this.state.session?.api?.listener as { requestOldMessages?: (threadType: number, lastMsgId?: string | null) => void } | undefined;
    if (!listener?.requestOldMessages) {
      throw new Error('Session hien tai khong ho tro requestOldMessages');
    }

    const active = this.state.pendingHistorySyncs.get(conversationId);
    if (active) {
      return active;
    }

    const target = this._resolveConversationTarget?.(conversationId) ?? { threadId: conversationId, type: 'direct' as const };
    const perBatchTimeout = Math.max(5_000, Math.min(options.timeoutMs ?? 45_000, 45_000));
    const maxTotalTimeMs = options.maxTotalTimeMs ?? 240_000;
    const startTime = Date.now();

    let beforeMessageId: string | null | undefined = options.beforeMessageId?.trim();
    if (!beforeMessageId) {
      const oldestMessages = await this.state.store.listConversationMessagesByAccount(this.state.boundAccountId, conversationId, { limit: 1 });
      const oldestLocal = oldestMessages[0];
      beforeMessageId = oldestLocal?.providerMessageId ?? null;
    }

    let totalRemote = 0;
    let totalInserted = 0;
    let totalDeduped = 0;
    let batchCount = 0;
    let finalOldestTimestamp: string | undefined;
    let finalOldestPmid: string | undefined;
    let finalTimedOut = false;
    let finalHasMore = false;

    const promise = (async () => {
      while (true) {
        const elapsed = Date.now() - startTime;
        if (elapsed >= maxTotalTimeMs) break;

        const batchTimeout = Math.min(perBatchTimeout, maxTotalTimeMs - elapsed);
        const result = await this._requestHistoryBatch(conversationId, target, listener, beforeMessageId, batchTimeout);

        totalRemote += result.remoteCount;
        totalInserted += result.insertedCount;
        totalDeduped += result.dedupedCount;
        batchCount++;

        if (!result.oldestTimestamp && !result.oldestProviderMessageId) {
          // nothing produced at all
        }

        if (result.oldestTimestamp) finalOldestTimestamp = result.oldestTimestamp;
        if (result.oldestProviderMessageId) finalOldestPmid = result.oldestProviderMessageId;
        finalHasMore = result.hasMore;

        if (result.timedOut) {
          finalTimedOut = true;
          this.state.logger.info('history_sync_batch_timeout', { conversationId, batchCount });
          break;
        }

        if (!result.hasMore || !result.oldestProviderMessageId) {
          this.state.logger.info('history_sync_exhausted', { conversationId, batchCount, totalRemote });
          break;
        }

        beforeMessageId = result.oldestProviderMessageId;
      }

      const aggregated: HistorySyncResult = {
        conversationId,
        threadId: target.threadId,
        type: target.type,
        remoteCount: totalRemote,
        insertedCount: totalInserted,
        dedupedCount: totalDeduped,
        oldestTimestamp: finalOldestTimestamp,
        oldestProviderMessageId: finalOldestPmid,
        hasMore: finalHasMore,
        timedOut: finalTimedOut,
        batchCount,
      };

      this.state.logger.info('history_sync_complete_aggregate', aggregated);
      return aggregated;
    })().finally(() => {
      if (this.state.pendingHistorySyncs.get(conversationId) === promise) {
        this.state.pendingHistorySyncs.delete(conversationId);
      }
    });

    this.state.pendingHistorySyncs.set(conversationId, promise);
    return promise;
  }

  private _requestHistoryBatch(
    conversationId: string,
    target: { threadId: string; type: string },
    listener: { requestOldMessages?: (threadType: number, lastMsgId?: string | null) => void },
    beforeMessageId: string | null | undefined,
    timeoutMs: number,
  ): Promise<HistorySyncResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.state.historySyncState?.conversationId !== conversationId) {
          return;
        }

        this.state.historySyncState = undefined;
        this.state.pendingHistorySyncs.delete(conversationId);
        const result: HistorySyncResult = {
          conversationId,
          threadId: target.threadId,
          type: target.type as HistorySyncResult['type'],
          requestedBeforeMessageId: beforeMessageId ?? undefined,
          remoteCount: 0,
          insertedCount: 0,
          dedupedCount: 0,
          hasMore: false,
          timedOut: true,
        };
        resolve(result);
      }, timeoutMs);

      this.state.historySyncState = {
        conversationId,
        threadId: target.threadId,
        type: target.type as HistorySyncResult['type'],
        beforeMessageId: beforeMessageId ?? undefined,
        requestedAt: Date.now(),
        resolve,
        reject,
        timer,
      };

      listener.requestOldMessages?.(
        target.type === 'group' ? ThreadType.Group : ThreadType.User,
        beforeMessageId ?? null,
      );
    });
  }

  async requestMobileSyncThread(threadId: string, threadType: 'direct' | 'group', options: { timeoutMs?: number } = {}): Promise<{ received: number; insertedCount: number; dedupedCount: number; oldestTimestamp?: string; timedOut?: boolean }> {
    const listener = this.state.session?.api?.listener as any;
    const ws = listener?.ws;
    if (!ws || ws.readyState !== 1) {
      this.state.logger.info('mobile_sync_ws_not_ready', { threadId, readyState: ws?.readyState });
      throw new Error('WebSocket khong san sang');
    }

    if (!this.state.cipherKey) {
      this.state.logger.info('mobile_sync_no_cipher_key', { threadId });
      throw new Error('Cipher key chua co');
    }

    const timeoutMs = Math.min(options.timeoutMs ?? 15_000, 30_000);

    try {
      const handshake = new ZaloPcHandshake(this.state);
      await handshake.runHandshake();

      const result = await handshake.requestMobileSync(threadId, threadType, timeoutMs);
      this.state.logger.info('mobile_sync_req18_complete', {
        threadId,
        totalReceived: result.received,
        totalInserted: result.insertedCount,
        totalDeduped: result.dedupedCount,
        wsReadyState: ws.readyState,
      });

      return {
        received: result.received,
        insertedCount: result.insertedCount,
        dedupedCount: result.dedupedCount,
        oldestTimestamp: result.oldestTimestamp,
        timedOut: result.received === 0,
      };
    } catch (err) {
      this.state.logger.error('mobile_sync_handshake_failed', { error: String(err) });
      return {
        received: 0,
        insertedCount: 0,
        dedupedCount: 0,
        timedOut: true,
      };
    }
  }

  async mobileSyncAllAccountConversations(options: { perThreadTimeoutMs?: number; maxTotalTimeMs?: number } = {}): Promise<{
    requ18Synced: number;
    requ18Failed: number;
    requ18Received: number;
    requ18Inserted: number;
    historySynced: number;
    historyFailed: number;
    results: Array<{
      conversationId: string;
      threadId: string;
      type: string;
      requ18Received: number;
      requ18Inserted: number;
      requ18TimedOut: boolean;
      historyResult: HistorySyncResult | null;
      error?: string;
    }>;
  }> {
    const summaries = await this.state.store.listConversationSummariesByAccount(this.state.boundAccountId);
    this.state.logger.info('mobile_sync_all_start', {
      accountId: this.state.boundAccountId,
      conversationCount: summaries.length,
      cipherKeyAvailable: !!this.state.cipherKey,
      wsReady: (this.state.session?.api?.listener as any)?.ws?.readyState,
    });

    const results: Array<any> = [];
    let requ18Synced = 0;
    let requ18Failed = 0;
    let requ18Received = 0;
    let requ18Inserted = 0;
    let historySynced = 0;
    let historyFailed = 0;
    const perThreadTimeoutMs = options.perThreadTimeoutMs ?? 10_000;
    const maxTotalTimeMs = options.maxTotalTimeMs ?? 120_000;
    const startTime = Date.now();

    for (const summary of summaries) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxTotalTimeMs) {
        this.state.logger.info('mobile_sync_all_time_limit', { elapsedMs: elapsed, maxTotalTimeMs });
        break;
      }

      const threadTimeout = Math.min(perThreadTimeoutMs, maxTotalTimeMs - elapsed);
      const result: any = {
        conversationId: summary.id,
        threadId: summary.threadId ?? '',
        type: summary.type ?? 'direct',
        requ18Received: 0,
        requ18Inserted: 0,
        requ18TimedOut: false,
        historyResult: null,
      };

      try {
        const requ18Result = await this.requestMobileSyncThread(
          result.threadId,
          result.type as 'direct' | 'group',
          { timeoutMs: threadTimeout },
        );
        result.requ18Received = requ18Result.received;
        result.requ18Inserted = requ18Result.insertedCount;
        result.requ18TimedOut = requ18Result.timedOut ?? false;
        requ18Received += requ18Result.received;
        requ18Inserted += requ18Result.insertedCount;
        requ18Synced++;

        const historyElapsed = Date.now() - startTime;
        const historyTimeout = Math.min(perThreadTimeoutMs, maxTotalTimeMs - historyElapsed);
        try {
          const historyResult = await this.syncConversationHistory(summary.id, {
            timeoutMs: historyTimeout,
            maxTotalTimeMs: historyTimeout,
          });
          result.historyResult = historyResult;
          historySynced++;
        } catch (histErr) {
          result.historyError = String(histErr);
          historyFailed++;
        }
      } catch (err) {
        result.error = String(err);
        requ18Failed++;
        this.state.logger.error('mobile_sync_all_thread_failed', { conversationId: summary.id, error: String(err) });
      }

      results.push(result);
      this.state.logger.info('mobile_sync_all_thread_done', {
        conversationId: summary.id,
        requ18Received: result.requ18Received,
        requ18Inserted: result.requ18Inserted,
      });
    }

    return {
      requ18Synced,
      requ18Failed,
      requ18Received,
      requ18Inserted,
      historySynced,
      historyFailed,
      results,
    };
  }

  async syncAllAccountConversations(options: { perConversationTimeoutMs?: number; maxTotalTimeMs?: number } = {}): Promise<{ synced: number; failed: number; results: HistorySyncResult[] }> {
    const summaries = await this.state.store.listConversationSummariesByAccount(this.state.boundAccountId);
    const results: HistorySyncResult[] = [];
    let failed = 0;

    for (const summary of summaries) {
      try {
        const result = await this.syncConversationHistory(summary.id, {
          timeoutMs: options.perConversationTimeoutMs ?? 15_000,
          maxTotalTimeMs: Math.min(options.maxTotalTimeMs ?? 120_000, 120_000),
        });
        results.push(result);
        this.state.logger.info('account_sync_conversation_done', { conversationId: summary.id, remoteCount: result.remoteCount });
      } catch (error) {
        failed++;
        this.state.logger.error('account_sync_conversation_failed', { conversationId: summary.id, error: String(error) });
      }
    }

    return { synced: results.length, failed, results };
  }

  async backfillMediaForStoredMessages() {
    let updatedMessages = 0;
    let repairedMessages = 0;
    for (const summary of await this.state.store.listConversationSummariesByAccount(this.state.boundAccountId)) {
      const messages = await this.state.store.listConversationMessagesByAccount(this.state.boundAccountId, summary.id);
      let changed = false;
      const nextMessages: GoldConversationMessage[] = [];
      for (const message of messages) {
        const repaired = this._repairMessageFromRawPayload?.(message) ?? message;
        const needsBackfill = repaired.attachments.some((attachment) =>
          Boolean((attachment.sourceUrl || attachment.url) && (!attachment.url || !attachment.url.startsWith('/media/') || localMediaUrlNeedsRepair(attachment.url))),
        );
        const persisted = needsBackfill ? await this._persistMessageAttachmentsLocally?.(repaired) ?? repaired : repaired;
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
        await this.state.store.replaceConversationMessagesByAccount(this.state.boundAccountId, summary.id, nextMessages);
        this.state.conversations.set(summary.id, nextMessages);
      }
    }

    if (updatedMessages > 0) {
      this.state.logger.info('media_backfill_completed', { updatedMessages, repairedMessages });
    }

    return { updatedMessages, repairedMessages };
  }

  async listFriends() {
    if (!this.state.session) {
      await this._loginWithStoredCredential?.();
    }

    if (typeof this.state.session?.api?.getAllFriends !== 'function') {
      throw new Error('Session hien tai khong ho tro getAllFriends');
    }

    const response = await this.state.session.api.getAllFriends();
    this.state.logger.info('friends_raw_response_received', {
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

    this.state.logger.info('friends_normalized', { count: friends.length });
    return await this.state.store.replaceContactsByAccount(this.state.boundAccountId, friends);
  }

  async listGroups() {
    if (!this.state.session) {
      await this._loginWithStoredCredential?.();
    }

    if (!this.state.session?.api) {
      throw new Error('Session hien tai khong co API de tai groups');
    }

    let response: unknown;
    try {
      response = await fetchAllGroups(this.state.session.api);
    } catch (error) {
      this.state.logger.error('groups_fetch_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    this.state.logger.info('groups_raw_response_received', {
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
          const infoResponse = await fetchGroupInfo(this.state.session.api, batch);
          const decodedGroups = normalizeGroupInfoMap(infoResponse) as Array<Record<string, unknown>>;
          this.state.logger.info('groups_info_response_received', {
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

    const conversationSummaries = await this.state.store.listConversationSummariesByAccount(this.state.boundAccountId);
    const conversationGroupIds = conversationSummaries
      .filter((summary) => summary.type === 'group')
      .map((summary) => summary.threadId)
      .filter((threadId): threadId is string => Boolean(threadId));
    const knownGroupIds = new Set(groups.map((group: any) => String(group.groupId ?? group.grid ?? group.id ?? group.group_id)));
    const missingGroupIds = conversationGroupIds.filter((groupId) => !knownGroupIds.has(groupId));
    if (missingGroupIds.length > 0) {
      const infoResponse = await fetchGroupInfo(this.state.session.api, missingGroupIds);
      const infoGroups = normalizeGroupInfoMap(infoResponse);
      for (const group of infoGroups) {
        const normalizedGroupId = String((group as Record<string, unknown>).groupId ?? (group as Record<string, unknown>).grid ?? (group as Record<string, unknown>).id ?? (group as Record<string, unknown>).group_id);
        if (!knownGroupIds.has(normalizedGroupId)) {
          groups.push(group);
          knownGroupIds.add(normalizedGroupId);
        }
      }
      this.state.logger.info('groups_merged_from_conversations', {
        missingCount: missingGroupIds.length,
        mergedCount: infoGroups.length,
      });
    }

    const normalizedGroups: Omit<{ id: string; groupId: string; displayName: string; avatar?: string; memberCount?: number; members?: GoldGroupMemberRecord[]; lastSyncAt: string }, 'id'>[] = groups.map((group: any) => {
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
      const members = this._normalizeGroupMembers?.(group.members ?? group.memVerList ?? group.memberIds);
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

    this.state.logger.info('groups_normalized', { count: normalizedGroups.length });
    await this.state.store.replaceGroupsByAccount(this.state.boundAccountId, normalizedGroups);
    await this.state.store.canonicalizeConversationDataForAccount(this.state.boundAccountId);
    await this._hydrate?.();
    return await this.state.store.listGroupsByAccount(this.state.boundAccountId);
  }

  private async refreshContactMetadata(userId: string) {
    if (!userId || !this.state.session?.api) {
      return;
    }

    const api = this.state.session.api;
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

      await this.state.store.upsertContactByAccount(this.state.boundAccountId, {
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
      this.state.logger.error('contact_metadata_refresh_failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async refreshGroupMetadata(groupId: string) {
    if (!groupId || !this.state.session?.api) {
      return;
    }

    const api = this.state.session.api;
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

      const baseMembers = this._normalizeGroupMembers?.(group.members ?? group.memVerList ?? group.memberIds) ?? [];
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

      await this.state.store.upsertGroupByAccount(this.state.boundAccountId, {
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
        await this.state.store.upsertContactByAccount(this.state.boundAccountId, {
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
      this.state.logger.error('group_metadata_refresh_failed', {
        groupId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async ensureGroupMetadata(groupId: string) {
    if (!groupId || (await this.state.store.listGroupsByAccount(this.state.boundAccountId)).some((group) => group.groupId === groupId)) {
      return;
    }

    if (!this.state.session) {
      await this._loginWithStoredCredential?.();
    }

    const api = this.state.session?.api;
    if (typeof api?.getContext !== 'function') {
      return;
    }

    try {
      const response = await fetchGroupInfo(api, [groupId]);
      const groups = normalizeGroupInfoMap(response) as Array<Record<string, unknown>>;
      if (groups.length === 0) {
        return;
      }

      const existingGroups = await this.state.store.listGroupsByAccount(this.state.boundAccountId);
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
          members: this._normalizeGroupMembers?.(group.members ?? group.memVerList ?? group.memberIds),
          lastSyncAt: new Date().toISOString(),
        });
      }

      await this.state.store.replaceGroupsByAccount(this.state.boundAccountId, [...groupsById.values()].map(({ id: _id, ...group }) => group));
      await this.state.store.canonicalizeConversationDataForAccount(this.state.boundAccountId);
      await this._hydrate?.();
      this.state.logger.info('group_metadata_enriched', { groupId, fetchedCount: groups.length });
    } catch (error) {
      this.state.logger.error('group_metadata_enrich_failed', {
        groupId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
