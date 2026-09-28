import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import type { GoldMediaStore } from './media-store.js';

export interface StickerCacheRecord {
  sticker_id: number;
  category_id?: number | null;
  local_url?: string | null;
  remote_url?: string | null;
  mime_type?: string | null;
  width?: number | null;
  height?: number | null;
  status: 'ready' | 'failed' | 'not_found';
  created_at?: string;
  updated_at?: string;
}

export class StickerResolverService {
  private knex: Knex;
  private mediaStore: GoldMediaStore;
  private memoryCache = new Map<number, StickerCacheRecord>();
  private inFlight = new Map<number, Promise<StickerCacheRecord | null>>();

  constructor(knex: Knex, mediaStore: GoldMediaStore) {
    this.knex = knex;
    this.mediaStore = mediaStore;
  }

  /**
   * Resolve a single sticker ID into cached record or fetch & cache it
   */
  async getSticker(stickerId: number, api?: any): Promise<StickerCacheRecord | null> {
    if (!Number.isSafeInteger(stickerId) || stickerId <= 0) return null;

    // 1. Memory cache
    const cached = this.memoryCache.get(stickerId);
    if (cached) return cached;

    // 2. In-flight de-duplication
    const ongoing = this.inFlight.get(stickerId);
    if (ongoing) return ongoing;

    const promise = this._resolveSticker(stickerId, api).finally(() => {
      this.inFlight.delete(stickerId);
    });
    this.inFlight.set(stickerId, promise);
    return promise;
  }

  /**
   * Bulk query cache from DB for an array of sticker IDs
   */
  async getStickersMap(stickerIds: number[]): Promise<Map<number, StickerCacheRecord>> {
    const validIds = [...new Set(stickerIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
    const result = new Map<number, StickerCacheRecord>();
    if (!validIds.length) return result;

    // Check memory first
    const missing: number[] = [];
    for (const id of validIds) {
      const hit = this.memoryCache.get(id);
      if (hit) result.set(id, hit);
      else missing.push(id);
    }

    if (!missing.length) return result;

    try {
      const rows: StickerCacheRecord[] = await this.knex('sticker_cache').whereIn('sticker_id', missing);
      for (const row of rows) {
        this.memoryCache.set(row.sticker_id, row);
        result.set(row.sticker_id, row);
      }
    } catch {
      // Table might not exist yet if migration pending
    }

    return result;
  }

  private async _resolveSticker(stickerId: number, api?: any): Promise<StickerCacheRecord | null> {
    // Check DB
    try {
      const existing: StickerCacheRecord | undefined = await this.knex('sticker_cache')
        .where('sticker_id', stickerId)
        .first();
      if (existing) {
        this.memoryCache.set(stickerId, existing);
        return existing;
      }
    } catch {
      // DB query failure fallback
    }

    // If no active API provided, cannot fetch from Zalo
    if (!api || typeof api.getStickersDetail !== 'function') {
      return null;
    }

    // Fetch from Zalo API
    try {
      const details = await api.getStickersDetail(stickerId);
      const detail = Array.isArray(details) ? details.find((d: any) => Number(d.id) === stickerId) || details[0] : null;

      if (!detail) {
        const notFoundRecord: StickerCacheRecord = {
          sticker_id: stickerId,
          status: 'not_found',
        };
        await this.saveCacheRecord(notFoundRecord);
        return notFoundRecord;
      }

      const remoteUrl = String(detail.stickerWebpUrl || detail.stickerUrl || detail.stickerSpriteUrl || '').trim();
      if (!remoteUrl) {
        const failedRecord: StickerCacheRecord = {
          sticker_id: stickerId,
          category_id: detail.cateId || undefined,
          status: 'not_found',
        };
        await this.saveCacheRecord(failedRecord);
        return failedRecord;
      }

      // Download remote image and store into MinIO
      let localUrl: string | undefined;
      let mimeType = 'image/webp';
      try {
        const stored = await this.mediaStore.mirrorRemoteUrl({
          accountId: 'stickers',
          messageId: `cat-${detail.cateId || '0'}-stk-${stickerId}`,
          sourceUrl: remoteUrl,
          fileName: `${stickerId}.webp`,
          mimeType: 'image/webp',
        });
        localUrl = stored.localPath;
      } catch (mirrorErr) {
        console.warn(`[StickerResolver] Failed to mirror sticker ${stickerId} from ${remoteUrl}:`, (mirrorErr as Error)?.message);
        // If mirroring failed, we still can use remoteUrl temporarily
        localUrl = remoteUrl;
      }

      const record: StickerCacheRecord = {
        sticker_id: stickerId,
        category_id: detail.cateId || undefined,
        remote_url: remoteUrl,
        local_url: localUrl,
        mime_type: mimeType,
        width: detail.width || undefined,
        height: detail.height || undefined,
        status: 'ready',
      };

      await this.saveCacheRecord(record);
      return record;
    } catch (err) {
      console.warn(`[StickerResolver] Error fetching sticker detail ${stickerId}:`, (err as Error)?.message);
      return null;
    }
  }

  async saveCacheRecord(record: StickerCacheRecord): Promise<void> {
    this.memoryCache.set(record.sticker_id, record);
    try {
      await this.knex('sticker_cache')
        .insert(record)
        .onConflict('sticker_id')
        .merge({
          category_id: record.category_id,
          local_url: record.local_url,
          remote_url: record.remote_url,
          mime_type: record.mime_type,
          width: record.width,
          height: record.height,
          status: record.status,
          updated_at: this.knex.fn.now(),
        });
    } catch (dbErr) {
      console.warn(`[StickerResolver] Failed to persist sticker_cache for ${record.sticker_id}:`, (dbErr as Error)?.message);
    }
  }
}
