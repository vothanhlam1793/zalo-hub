import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GoldMessageKind, GoldAttachment, GoldConversationType, GoldMessageQuote, GoldMessageReactionItem } from '../types.js';
import type { CookieShape } from './types.js';

export function normalizeMessageText(data: Record<string, unknown>) {
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

export function normalizeMessageKind(data: Record<string, unknown>): GoldMessageKind {
  const msgType = String(data.msgType ?? '');
  if (msgType === 'chat.photo') return 'image';
  if (msgType === 'chat.sticker' || msgType === 'sticker') return 'sticker';
  if (msgType === 'chat.reaction' || msgType === 'reaction') return 'reaction';
  if (msgType === 'chat.vote' || msgType === 'poll') return 'poll';
  if (msgType === 'chat.voice') return 'voice';
  if (msgType === 'chat.gif') return 'gif';
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

function toReactionEmoji(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const map: Record<number, string> = {
      1: '👍',
      2: '❤️',
      3: '😆',
      4: '😮',
      5: '😢',
      6: '😡',
    };
    return map[value] ?? String(value);
  }
  return undefined;
}

function pickRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function isReactionItem(value: GoldMessageReactionItem | undefined): value is GoldMessageReactionItem {
  return Boolean(value);
}

export function normalizeMessageQuote(data: Record<string, unknown>): GoldMessageQuote | undefined {
  const candidate = [
    pickRecord(data.quote),
    pickRecord(data.quotedMessage),
    pickRecord(data.quoteMsg),
    pickRecord(data.reply),
    pickRecord(data.replyMessage),
    pickRecord(pickRecord(data.content)?.quote),
    pickRecord(pickRecord(data.content)?.quotedMessage),
    pickRecord(pickRecord(data.content)?.reply),
    pickRecord(pickRecord(data.paramsExt)?.quote),
  ].find(Boolean);

  if (!candidate) return undefined;

  const text = typeof candidate.content === 'string'
    ? candidate.content.trim()
    : typeof candidate.msg === 'string'
      ? candidate.msg.trim()
      : typeof candidate.text === 'string'
        ? candidate.text.trim()
        : typeof candidate.title === 'string'
          ? candidate.title.trim()
          : undefined;

  const kind = normalizeMessageKind(candidate);
  return {
    messageId: candidate.msgId ? String(candidate.msgId) : candidate.messageId ? String(candidate.messageId) : undefined,
    senderId: candidate.uidFrom ? String(candidate.uidFrom) : candidate.senderId ? String(candidate.senderId) : undefined,
    senderName: candidate.dName ? String(candidate.dName) : candidate.senderName ? String(candidate.senderName) : candidate.displayName ? String(candidate.displayName) : undefined,
    text,
    kind: text || kind !== 'text' ? kind : undefined,
  } satisfies GoldMessageQuote;
}

export function normalizeMessageReactions(data: Record<string, unknown>): GoldMessageReactionItem[] | undefined {
  const candidates = [
    data.reactions,
    data.reaction,
    pickRecord(data.content)?.reactions,
    pickRecord(data.paramsExt)?.reactions,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const mapped: GoldMessageReactionItem[] = candidate
        .map((item): GoldMessageReactionItem | undefined => {
          const record = pickRecord(item);
          if (!record) return undefined;
          const emoji = toReactionEmoji(record.emoji ?? record.icon ?? record.type ?? record.reactIcon);
          if (!emoji) return undefined;
          const userIds = Array.isArray(record.userIds)
            ? record.userIds.map((userId) => String(userId))
            : Array.isArray(record.uids)
              ? record.uids.map((userId) => String(userId))
              : undefined;
          return {
            emoji,
            count: Number(record.count ?? userIds?.length ?? 1) || 1,
            userIds,
          } satisfies GoldMessageReactionItem;
        })
        .filter(isReactionItem);
      if (mapped.length > 0) return mapped;
    }

    const record = pickRecord(candidate);
    if (record) {
      const mapped: GoldMessageReactionItem[] = Object.entries(record).map(([emojiKey, value]): GoldMessageReactionItem | undefined => {
        const detail = pickRecord(value);
        const emoji = toReactionEmoji(emojiKey) ?? toReactionEmoji(detail?.emoji ?? detail?.icon ?? detail?.type);
        if (!emoji) return undefined;
        const userIds = Array.isArray(detail?.userIds)
          ? detail!.userIds.map((userId) => String(userId))
          : undefined;
        return {
          emoji,
          count: Number(detail?.count ?? userIds?.length ?? value ?? 1) || 1,
          userIds,
        } satisfies GoldMessageReactionItem;
      }).filter(isReactionItem);
      if (mapped.length > 0) return mapped;
    }
  }

  const singleEmoji = toReactionEmoji(data.reactIcon ?? data.icon ?? data.emoji ?? pickRecord(data.content)?.emoji);
  if (singleEmoji) {
    return [{
      emoji: singleEmoji,
      count: 1,
      userIds: data.uidFrom ? [String(data.uidFrom)] : undefined,
    }];
  }

  return undefined;
}

export function normalizeAttachments(data: Record<string, unknown>): GoldAttachment[] {
  const msgType = String(data.msgType ?? '');
  const content = data.content;
  const contentObj = content && typeof content === 'object' ? content as Record<string, unknown> : null;

   if (msgType === 'chat.sticker' || msgType === 'sticker') {
    const url = typeof contentObj?.href === 'string'
      ? contentObj.href.trim()
      : typeof contentObj?.src === 'string'
        ? contentObj.src.trim()
        : typeof contentObj?.thumbnail === 'string'
          ? contentObj.thumbnail.trim()
          : typeof data.url === 'string'
            ? data.url.trim()
            : undefined;
    if (!url) return [];
    return [{
      id: String(data.msgId ?? data.cliMsgId ?? Math.random()),
      type: 'sticker',
      url,
      thumbnailUrl: url,
    }];
  }

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

export function mergeAttachmentMetadata(existing: GoldAttachment | undefined, normalized: GoldAttachment, fallbackKind: GoldMessageKind) {
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

export function localMediaUrlNeedsRepair(url?: string) {
  if (!url?.startsWith('/media/')) {
    return false;
  }

  const fileName = url.split('/').pop() ?? '';
  return !/\.[a-zA-Z0-9]{2,8}$/.test(fileName);
}

export function normalizeImageUrl(data: Record<string, unknown>) {
  const content = data.content;
  if (content && typeof content === 'object') {
    const href = (content as Record<string, unknown>).href;
    if (typeof href === 'string' && href.trim()) {
      return href.trim();
    }
  }

  return undefined;
}

export function normalizeMessageTimestamp(data: Record<string, unknown>) {
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

export function summarizeListenerData(data: Record<string, unknown>) {
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

export function normalizeFriendList(response: unknown) {
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

export function normalizeGroupList(response: unknown) {
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

export function normalizeGroupInfoMap(response: unknown) {
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

export function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function getConversationTypeFromThreadId(threadId: string, knownGroupIds: Set<string>): GoldConversationType {
  return knownGroupIds.has(threadId) ? 'group' : 'direct';
}

export function getConversationId(threadId: string, type: GoldConversationType) {
  return `${type}:${threadId}`;
}

export function normalizeUserInfoMap(response: unknown) {
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

export function normalizeGroupMemberInfoMap(response: unknown) {
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

export function prepareCookiesForChatSession(rawCookie: string) {
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

export async function loadQrInternals() {
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

export function parseBase64Image(input: string) {
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

export function mimeTypeToExtension(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'bin';
}

export function readFlag(argv: string[], name: string) {
  const index = argv.findIndex((item) => item === `--${name}`);
  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
}

const ICON_TO_EMOJI_MAP: Record<string, string> = {
  '/-heart': '❤️',
  '/-strong': '👍',
  ':>': '😆',
  ':o': '😮',
  ':-((': '😢',
  ':-h': '😡',
  '/-l': '😍',
  '/-y': '🎉',
  '/-b': '😭',
  ';)': '😉',
  ':*': '😗',
  '/-<': '😰',
  '/-x': '😤',
  '/-p': '😜',
  '/-e': '🥺',
  '/-c': '😎',
  '/-z': '🤓',
  '/-d': '😳',
  '/-t': '🌹',
  '/-s': '💔',
  '/-w': '👎',
};

export function mapReactionIconToEmoji(icon: string): string {
  const trimmed = icon?.trim() ?? '';
  if (!trimmed) return '❤️';
  const direct = ICON_TO_EMOJI_MAP[trimmed];
  if (direct) return direct;
  const fieldIcon = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return ICON_TO_EMOJI_MAP[fieldIcon] ?? trimmed;
}

export function normalizeReactionEvent(
  rawReaction: { data?: { content?: { rIcon?: string; rType?: number; rMsg?: Array<{ gMsgID?: string; cMsgID?: string | number }> }; uidFrom?: string | number; dName?: string }; threadId?: string | number; isGroup?: boolean },
  knownGroupIds: Set<string>,
) {
  const data = (rawReaction as Record<string, unknown>).data as Record<string, unknown> | undefined;
  const content = data?.content as Record<string, unknown> | undefined;
  const rIcon = typeof content?.rIcon === 'string' ? content.rIcon.trim() : '';
  const rType = typeof content?.rType === 'number' ? content.rType : undefined;
  const rMsg = content?.rMsg as Array<Record<string, unknown>> | undefined;
  const uidFrom = String(data?.uidFrom ?? (data as Record<string, unknown>)?.uidFrom ?? '');
  const dName = typeof data?.dName === 'string' ? data.dName.trim() : undefined;
  const threadId = String(rawReaction.threadId ?? '');
  const isGroup = Boolean(rawReaction.isGroup);
  const type = isGroup ? 'group' as const : getConversationTypeFromThreadId(threadId, knownGroupIds);
  const conversationId = getConversationId(threadId, type);
  const emoji = mapReactionIconToEmoji(rIcon);

  const targetIds = new Set<string>();
  if (Array.isArray(rMsg)) {
    for (const ref of rMsg) {
      const gMsgID = typeof ref.gMsgID === 'string' ? ref.gMsgID : typeof ref.gMsgID === 'number' ? String(ref.gMsgID) : '';
      const cMsgID = ref.cMsgID !== undefined ? String(ref.cMsgID) : '';
      if (gMsgID) targetIds.add(gMsgID);
      if (cMsgID) targetIds.add(cMsgID);
    }
  }

  return {
    conversationId,
    threadId,
    type,
    emoji,
    rType,
    targetGlobalMsgIds: [...targetIds],
    userIds: uidFrom ? [uidFrom] : [],
    reactorName: dName,
  };
}
