import { randomUUID } from 'node:crypto';
import { normalizeFriendList, normalizeGroupList, normalizeGroupInfoMap, chunkArray, normalizeUserInfoMap, normalizeGroupMemberInfoMap, getConversationId, localMediaUrlNeedsRepair, normalizeMessageKind, normalizeMessageText, normalizeAttachments, normalizeImageUrl, mergeAttachmentMetadata } from './normalizer.js';
import { getAllGroups as fetchAllGroups, getGroupInfo as fetchGroupInfo } from '../zalo-group-client.js';
import type { GoldConversationMessage, GoldConversationType, GoldGroupMemberRecord, GoldAttachment } from '../types.js';
import type { SharedState, HistorySyncResult } from './types.js';

const ThreadType = { User: 0, Group: 1 };

export class GoldSync {
  private readonly state: SharedState;
  private _loginWithStoredCredential?: () => Promise<SharedState['session']>;
  private _resolveConversationTarget?: (conversationId: string) => { threadId: string; type: GoldConversationType };
  private _normalizeGroupMembers?: (members: unknown) => GoldGroupMemberRecord[] | undefined;
  private _resolveGroupSenderName?: (groupId: string, senderId?: string) => string | undefined;
  private _hydrate?: () => void;
  private _repairMessageFromRawPayload?: (message: GoldConversationMessage) => GoldConversationMessage;
  private _persistMessageAttachmentsLocally?: (message: GoldConversationMessage) => Promise<GoldConversationMessage>;
  constructor(state: SharedState) {
    this.state = state;
  }

  init(deps: {
    loginWithStoredCredential: () => Promise<SharedState['session']>;
    resolveConversationTarget: (conversationId: string) => { threadId: string; type: GoldConversationType };
    normalizeGroupMembers: (members: unknown) => GoldGroupMemberRecord[] | undefined;
    resolveGroupSenderName: (groupId: string, senderId?: string) => string | undefined;
    hydrateConversationsFromStore: () => void;
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

  getFriendCache() {
    return this.state.store.listContactsByAccount(this.state.boundAccountId);
  }

  getContactCache() {
    return this.state.store.listContactsByAccount(this.state.boundAccountId);
  }

  getBoundAccountId() {
    return this.state.boundAccountId;
  }

  getGroupCache() {
    return this.state.store.listGroupsByAccount(this.state.boundAccountId);
  }

  getConversationMessages(conversationId: string, options: { since?: string; before?: string; limit?: number } = {}) {
    const { since, before, limit } = options;
    const messages = before || limit
      ? this.state.store.listConversationMessagesByAccount(this.state.boundAccountId, conversationId, { before, limit })
      : (this.state.conversations.get(conversationId) ?? this.state.store.listConversationMessagesByAccount(this.state.boundAccountId, conversationId));

    if (!since) {
      return [...messages];
    }

    return messages.filter((message) => message.timestamp > since);
  }

  getConversationSummaries() {
    if (this.state.conversations.size === 0) {
      return this.state.store.listConversationSummariesByAccount(this.state.boundAccountId);
    }

    return this.state.store.listConversationSummariesByAccount(this.state.boundAccountId);
  }

  async syncConversationMetadata(conversationId: string) {
    if (!this.state.session) {
      await this._loginWithStoredCredential?.();
    }

    const target = this._resolveConversationTarget?.(conversationId) ?? { threadId: conversationId, type: 'direct' as const };
    if (target.type === 'group') {
      await this.refreshGroupMetadata(target.threadId);
    } else {
      await this.refreshContactMetadata(target.threadId);
    }

    this.state.store.canonicalizeConversationDataForAccount(this.state.boundAccountId);
    const canonicalConversationId = getConversationId(target.threadId, target.type);
    const messages = this.state.store.enrichConversationMessageSendersByAccount(this.state.boundAccountId, canonicalConversationId);
    this._hydrate?.();

    return {
      conversationId: canonicalConversationId,
      type: target.type,
      threadId: target.threadId,
      messages,
    };
  }

  async syncConversationHistory(conversationId: string, options: { beforeMessageId?: string; timeoutMs?: number } = {}) {
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
    const oldestLocal = this.state.store.listConversationMessagesByAccount(this.state.boundAccountId, conversationId, { limit: 1 })[0];
    const beforeMessageId = options.beforeMessageId?.trim() || oldestLocal?.providerMessageId;
    const timeoutMs = Math.max(3_000, Math.min(options.timeoutMs ?? 12_000, 45_000));

    const promise = new Promise<HistorySyncResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.state.historySyncState?.conversationId !== conversationId) {
          return;
        }

        this.state.historySyncState = undefined;
        this.state.pendingHistorySyncs.delete(conversationId);
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
        this.state.logger.info('history_sync_timeout', result);
        resolve(result);
      }, timeoutMs);

      this.state.historySyncState = {
        conversationId,
        threadId: target.threadId,
        type: target.type,
        beforeMessageId,
        requestedAt: Date.now(),
        resolve,
        reject,
        timer,
      };

      this.state.logger.info('history_sync_requested', {
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

    this.state.pendingHistorySyncs.set(conversationId, promise);
    return promise;
  }

  async backfillMediaForStoredMessages() {
    let updatedMessages = 0;
    let repairedMessages = 0;
    for (const summary of this.state.store.listConversationSummariesByAccount(this.state.boundAccountId)) {
      const messages = this.state.store.listConversationMessagesByAccount(this.state.boundAccountId, summary.id);
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
        this.state.store.replaceConversationMessagesByAccount(this.state.boundAccountId, summary.id, nextMessages);
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
    return this.state.store.replaceContactsByAccount(this.state.boundAccountId, friends);
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

    const conversationGroupIds = this.state.store.listConversationSummariesByAccount(this.state.boundAccountId)
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
    this.state.store.replaceGroupsByAccount(this.state.boundAccountId, normalizedGroups);
    this.state.store.canonicalizeConversationDataForAccount(this.state.boundAccountId);
    this._hydrate?.();
    return this.state.store.listGroupsByAccount(this.state.boundAccountId);
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

      this.state.store.upsertContactByAccount(this.state.boundAccountId, {
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

      this.state.store.upsertGroupByAccount(this.state.boundAccountId, {
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
        this.state.store.upsertContactByAccount(this.state.boundAccountId, {
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
    if (!groupId || this.state.store.listGroupsByAccount(this.state.boundAccountId).some((group) => group.groupId === groupId)) {
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

      const existingGroups = this.state.store.listGroupsByAccount(this.state.boundAccountId);
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

      this.state.store.replaceGroupsByAccount(this.state.boundAccountId, [...groupsById.values()].map(({ id: _id, ...group }) => group));
      this.state.store.canonicalizeConversationDataForAccount(this.state.boundAccountId);
      this._hydrate?.();
      this.state.logger.info('group_metadata_enriched', { groupId, fetchedCount: groups.length });
    } catch (error) {
      this.state.logger.error('group_metadata_enrich_failed', {
        groupId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
