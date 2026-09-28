import type { GoldAttachment } from '../types.js';
import type { RawAttachmentRow } from './helpers.js';

/** Local URLs beat remote URLs; an existing local URL always wins over a snapshot. */
export function repairMediaUrl(existing: string | null | undefined, incoming: string | undefined) {
  if (!existing) return incoming;
  if (!existing.startsWith('/media/') && incoming?.startsWith('/media/')) return incoming;
  return existing;
}

/** Only fill gaps/upgrade remote URLs. Never overwrite richer echo metadata. */
export function attachmentRepairPatch(existing: Partial<RawAttachmentRow>, incoming: GoldAttachment): Partial<RawAttachmentRow> {
  const patch: Partial<RawAttachmentRow> = {};
  const fields = { file_name: incoming.fileName, mime_type: incoming.mimeType, size: incoming.size,
    width: incoming.width, height: incoming.height, duration: incoming.duration,
    source_url: incoming.sourceUrl, thumbnail_source_url: incoming.thumbnailSourceUrl };
  for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
    if ((existing[key] === undefined || existing[key] === null || existing[key] === '') && fields[key] !== undefined) {
      Object.assign(patch, { [key]: fields[key] });
    }
  }
  const url = repairMediaUrl(existing.url, incoming.url);
  const thumbnail = repairMediaUrl(existing.thumbnail_url, incoming.thumbnailUrl);
  if (url && url !== existing.url) {
    patch.url = url;
    if (existing.url && !existing.source_url) patch.source_url = existing.url;
  }
  if (thumbnail && thumbnail !== existing.thumbnail_url) {
    patch.thumbnail_url = thumbnail;
    if (existing.thumbnail_url && !existing.thumbnail_source_url) patch.thumbnail_source_url = existing.thumbnail_url;
  }
  return patch;
}
