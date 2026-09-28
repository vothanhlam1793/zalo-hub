import type { GoldAttachment, GoldMessageKind, GoldMessagePresentation } from './types.js';

type RecordValue = Record<string, unknown>;
export function parseProviderRecord(value: unknown): RecordValue | undefined {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return undefined; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined;
}

/** Only unwrap provider envelopes, never parse arbitrary chat text as a message. */
export function providerMessageData(raw: unknown): RecordValue {
  const outer = parseProviderRecord(raw) ?? {};
  return parseProviderRecord(outer.data) ?? outer;
}

const text = (...values: unknown[]) => values.find((v): v is string => typeof v === 'string' && !!v.trim())?.trim();
const verbatimText = (...values: unknown[]) => values.find((v): v is string => typeof v === 'string' && !!v.trim());
const number = (...values: unknown[]): number | undefined => {
  for (const v of values) {
    if ((typeof v !== 'number' && typeof v !== 'string') || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
};
const url = (...values: unknown[]) => values.map(v => text(v)).find(v => v && (/^https?:\/\//i.test(v) || /^\/(?!\/)/.test(v)));
const kinds = new Set<GoldMessageKind>(['text', 'image', 'file', 'video', 'sticker', 'reaction', 'poll', 'voice', 'gif', 'call', 'system', 'location', 'link', 'card', 'unknown']);
export function storedMessageKind(value: string): GoldMessageKind {
  return kinds.has(value as GoldMessageKind) ? value as GoldMessageKind : 'unknown';
}
const mapping: Record<string, GoldMessageKind> = {
  '0': 'text', '1': 'text', '2': 'image', '3': 'voice', '4': 'sticker', '18': 'video',
  '19': 'file', '26': 'poll', '-1909': 'system', '17': 'location', '25': 'card', '52': 'card',
  webchat: 'text', 'chat.text': 'text', 'chat.photo': 'image', 'chat.voice': 'voice',
  'chat.sticker': 'sticker', sticker: 'sticker', 'chat.reaction': 'reaction', reaction: 'reaction',
  'chat.vote': 'poll', poll: 'poll', 'chat.gif': 'gif', 'chat.video.msg': 'video',
  'chat.video': 'video', video: 'video', 'chat.file': 'file', 'chat.doc': 'file', 'share.file': 'file',
  'chat.ecard': 'card', 'chat.location': 'location',
};
const fallback: Partial<Record<GoldMessageKind, string>> = {
  image: '[image]', voice: '[voice]', video: '[video]', file: '[file]', sticker: '[sticker]',
  call: 'Cuộc gọi', system: 'Thông báo hệ thống', location: 'Vị trí', link: 'Liên kết',
  card: 'Thẻ thông tin', unknown: 'Tin nhắn chưa được hỗ trợ', poll: 'Bình chọn', gif: '[gif]', reaction: '[reaction]',
};
export interface ProjectionInput {
  id?: string;
  kind?: GoldMessageKind;
  text?: string;
  attachments?: GoldAttachment[];
  imageUrl?: string;
  presentation?: GoldMessagePresentation;
  rawMessageJson?: unknown;
}

/** Pure read-time/ingestion projection. Stored assets and IDs always win over provider URLs. */
export function projectRichMessage<T extends ProjectionInput>(stored: T, raw: unknown = stored.rawMessageJson) {
  const data = providerMessageData(raw);
  const type = String(data.msgType ?? '');
  const structured = !!type && type !== 'webchat' && type !== 'chat.text' && type !== '0' && type !== '1';
  const bodyValue = data.message ?? data.content;
  const body = (structured || typeof bodyValue === 'object' ? parseProviderRecord(bodyValue) : undefined) ?? {};
  const params = parseProviderRecord(body.params) ?? parseProviderRecord(data.params) ?? {};
  let kind = type ? (mapping[type] ?? 'unknown') : stored.kind ?? 'text';
  if (type === '6' || type === 'chat.recommended') {
    kind = (typeof params.callId === 'string' || typeof params.callId === 'number') && String(params.callId).length > 0
      && body.title === 'sendBubbleMessage' ? 'call' : 'link';
  }
  const attachments = (stored.attachments ?? []).map(a => ({ ...a }));
  const media = ['image', 'voice', 'video', 'file', 'sticker', 'gif'].includes(kind);
  const source = kind === 'voice'
    ? url(params.m4a, body.href, body.url)
    : url(body.oriUrl, body.normalUrl, body.hdUrl, body.href, body.url, body.src, data.url, kind === 'image' ? body.thumbUrl : undefined);
  const thumb = url(body.thumbUrl, body.thumb, body.thumbnail, body.thumbnailUrl);
  const duration = number(params.duration ?? body.duration);
  if (media && (source || stored.imageUrl || attachments.length)) {
    const generated: GoldAttachment = {
      id: String(stored.id ?? data.msgId ?? data.cliMsgId ?? 'rich-media'), type: kind,
      url: stored.imageUrl ?? source, sourceUrl: source,
      thumbnailUrl: thumb ?? (kind === 'image' || kind === 'sticker' ? source : undefined),
      fileName: text(body.fileName, kind === 'file' ? body.title : undefined),
      duration, width: number(body.width), height: number(body.height), size: number(body.size),
    };
    if (attachments[0]) {
      const existing = attachments[0];
      const defined = Object.fromEntries(Object.entries(existing).filter(([, v]) => v !== undefined));
      attachments[0] = { ...generated, ...defined, type: kind };
    } else attachments.push(generated);
  }
  const presentation: GoldMessagePresentation = { ...stored.presentation, version: 1 };
  if (structured) {
    const albumId = params.group_layout_id;
    if (typeof albumId === 'string' && albumId.trim()) presentation.albumId = albumId;
    else if (typeof albumId === 'number' && Number.isSafeInteger(albumId)) presentation.albumId = String(albumId);
    const albumIndex = number(params.id_in_group);
    const albumTotal = number(params.total_item_in_group);
    // Keep the provider index as-is; no unverified zero/one-based conversion.
    if (albumIndex !== undefined && Number.isSafeInteger(albumIndex)) presentation.albumIndex = albumIndex;
    if (albumTotal !== undefined && Number.isSafeInteger(albumTotal) && albumTotal > 0) presentation.albumTotal = albumTotal;
  }
  if (kind === 'sticker') {
    const stkId = number(body.id, body.stickerId, params.id, params.stickerId);
    if (stkId !== undefined) {
      if (!presentation.stickerId) presentation.stickerId = stkId;
      if (!presentation.url) {
        // Fallback or mapped from cache if present in data
        const cachedUrl = typeof data._cachedStickerUrl === 'string' ? data._cachedStickerUrl : undefined;
        if (cachedUrl) {
          presentation.url = cachedUrl;
          if (attachments[0]) attachments[0].url = cachedUrl;
          else attachments.push({ id: `stk-${stkId}`, type: 'sticker', url: cachedUrl, thumbnailUrl: cachedUrl });
        }
      }
    }
  }

  const primary = attachments[0];
  const playable = url(primary?.url, stored.imageUrl, stored.presentation?.url, source, primary?.sourceUrl);
  if (playable) presentation.url = playable;
  const thumbnail = url(primary?.thumbnailUrl, stored.presentation?.thumbnailUrl, thumb);
  if (thumbnail) presentation.thumbnailUrl = thumbnail;
  const durationMs = primary?.duration ?? duration;
  if (durationMs !== undefined) presentation.durationSeconds = durationMs / 1000;
  if (kind === 'location') {
    const latValue = body.lat ?? params.lat;
    const lonValue = body.lo ?? params.lo;
    const lat = typeof latValue === 'number' || typeof latValue === 'string' && latValue.trim() ? Number(latValue) : NaN;
    const lon = typeof lonValue === 'number' || typeof lonValue === 'string' && lonValue.trim() ? Number(lonValue) : NaN;
    if (Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180) {
      presentation.latitude = lat;
      presentation.longitude = lon;
    }
  }
  if (media) presentation.unavailable = !playable;
  if (kind === 'location') presentation.unavailable = presentation.latitude === undefined || presentation.longitude === undefined;
  if (kind === 'unknown') presentation.unavailable = true;

  const caption = text(body.caption, body.description, body.msg, body.title);
  const storedText = text(stored.text);
  const isPayloadText = structured && !!parseProviderRecord(storedText);
  let display = !isPayloadText && storedText && !/^\[[a-z]+\]$/.test(storedText) ? storedText : undefined;
  if (kind === 'text') display = stored.text ?? verbatimText(data.content, data.message, body.msg, body.title, data.msg, data.text, data.body) ?? '';
  else if (kind === 'call') display = fallback.call;
  else if (kind === 'poll') {
    const event = parseProviderRecord(params.msg);
    const anonymous = params.isAnonymous === true || params.isAnonymous === 1 || params.isAnonymous === '1' || params.isAnonymous === 'true';
    // Anonymous events must not accidentally expose the event actor via dName/msg.vi.
    display = text(params.question) ?? (anonymous ? 'Bình chọn ẩn danh' : text(event?.vi, caption)) ?? fallback.poll;
  } else if (kind === 'system') {
    const template = text(body.msg, body.title, body.template, typeof bodyValue === 'string' && !parseProviderRecord(bodyValue) ? bodyValue : undefined);
    display = template && !/[{}]|%[sd]|\$\w|<[^>]*>/.test(template) ? template : fallback.system;
  } else display ??= caption;
  if (kind !== 'text' && parseProviderRecord(display)) display = undefined;
  if (structured && (display === 'sendBubbleMessage' || display === 'EVENTS')) display = undefined;
  return {
    ...stored, kind, text: display ?? fallback[kind] ?? '', attachments,
    imageUrl: kind === 'image' ? playable : stored.imageUrl,
    presentation: kind !== 'text' || stored.presentation ? presentation : undefined,
  };
}
