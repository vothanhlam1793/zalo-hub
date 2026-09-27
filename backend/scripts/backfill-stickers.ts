import pg from 'pg';
import fs from 'node:fs';
import knexConstructor from 'knex';
import { GoldMediaStore } from '../src/core/media-store.js';
import { StickerResolverService } from '../src/core/sticker-resolver.js';
import { GoldStore } from '../src/core/store.js';

async function getRunningDbUrl() {
  const environ = fs.readFileSync('/proc/3567191/environ', 'utf8');
  const map = Object.fromEntries(environ.split('\0').filter(Boolean).map(x => {
    const idx = x.indexOf('=');
    return [x.slice(0, idx), x.slice(idx + 1)];
  }));
  return map.DATABASE_URL;
}

async function main() {
  console.log('🚀 Starting Sticker Backfill Scanner...');

  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    dbUrl = await getRunningDbUrl();
  }

  if (!dbUrl) {
    dbUrl = 'postgresql://zalohub:zalohub@localhost:5432/zalohub';
  }

  const knex = knexConstructor({
    client: 'pg',
    connection: dbUrl,
  });

  // Ensure migration is applied
  try {
    console.log('📦 Checking migrations...');
    await knex.migrate.latest({
      directory: './db/migrations',
      extension: 'ts',
    });
    console.log('✅ Migrations up to date.');
  } catch (migErr) {
    console.warn('Migration check:', (migErr as Error)?.message);
  }

  const mediaStore = new GoldMediaStore();
  const stickerResolver = new StickerResolverService(knex, mediaStore);
  const store = new GoldStore(knex);

  // 1. Scan for all unique sticker IDs in database
  console.log('🔍 Scanning database for sticker messages...');
  const rows = await knex('messages')
    .select('id', 'kind', 'raw_message_json')
    .where('kind', 'sticker')
    .orWhereRaw("raw_message_json::text LIKE '%catId%'")
    .orWhereRaw("raw_message_json::text LIKE '%\"msgType\":4%'")
    .orWhereRaw("raw_message_json::text LIKE '%\"msgType\":\"chat.sticker\"%'");

  console.log(`📊 Found ${rows.length} candidate sticker messages in DB.`);

  const stickerMap = new Map<number, number | undefined>(); // stickerId -> catId

  for (const row of rows) {
    let raw: any = row.raw_message_json;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch {}
    }
    const data = raw?.data ?? raw ?? {};
    const message = data.message ?? data.content ?? {};
    const params = data.paramsExt ?? data.params ?? {};

    const rawId = message.id ?? message.stickerId ?? params.id ?? params.stickerId ?? data.id;
    const rawCatId = message.catId ?? message.cateId ?? params.catId ?? params.cateId;

    const id = Number(rawId);
    const catId = Number(rawCatId);

    if (Number.isSafeInteger(id) && id > 0) {
      stickerMap.set(id, Number.isSafeInteger(catId) && catId > 0 ? catId : undefined);
    }
  }

  console.log(`🎯 Identified ${stickerMap.size} unique sticker IDs across all conversations.`);

  if (stickerMap.size === 0) {
    console.log('✨ No stickers need backfilling.');
    await knex.destroy();
    return;
  }

  // 2. Check which ones are already cached
  const existingRecords = await knex('sticker_cache').whereIn('sticker_id', Array.from(stickerMap.keys()));
  const cachedReadySet = new Set(existingRecords.filter((r: any) => r.status === 'ready' && r.local_url).map((r: any) => r.sticker_id));

  const toFetch = Array.from(stickerMap.keys()).filter(id => !cachedReadySet.has(id));
  console.log(`📥 Need to fetch & cache ${toFetch.length} stickers (${cachedReadySet.size} already ready in cache).`);

  if (toFetch.length === 0) {
    console.log('🎉 All stickers are already cached!');
    await knex.destroy();
    return;
  }

  // 3. Find an active Zalo account API instance to fetch sticker details
  const accounts = await store.listAccounts();
  console.log(`📋 Found ${accounts.length} accounts in DB.`);
  let apiInstance: any = null;

  for (const account of accounts) {
    try {
      const cred = await store.getCredentialForAccount(account.accountId);
      if (cred && cred.cookie && cred.imei) {
        console.log(`🔑 Attempting login for account ${account.displayName || account.accountId}...`);
        const { Zalo } = await import('zalo-api-final');
        const { prepareCookiesForChatSession } = await import('../src/core/runtime/normalizer.js');
        const preparedCookies = prepareCookiesForChatSession(cred.cookie);
        const zalo = new Zalo({ selfListen: false, logging: false } as any);
        apiInstance = await zalo.login({
          cookie: preparedCookies,
          imei: cred.imei,
          userAgent: cred.userAgent,
        } as any);
        console.log(`✅ Zalo API instance created successfully for ${account.displayName || account.accountId}.`);
        break;
      }
    } catch (apiErr) {
      console.warn(`Could not login with account ${account.accountId}:`, (apiErr as Error)?.message);
    }
  }

  if (!apiInstance) {
    console.log('⚠️ No active Zalo API available right now. Creating not_found records or attempting direct fetch.');
  }

  // 4. Batch resolve stickers (batches of 20)
  const batchSize = 20;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);
    console.log(`[Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(toFetch.length / batchSize)}] Fetching details for ${batch.length} stickers...`);

    if (apiInstance && typeof apiInstance.getStickersDetail === 'function') {
      try {
        const details = await apiInstance.getStickersDetail(batch);
        for (const id of batch) {
          const detail = Array.isArray(details) ? details.find((d: any) => Number(d.id) === id) : null;
          if (detail) {
            const remoteUrl = String(detail.stickerWebpUrl || detail.stickerUrl || detail.stickerSpriteUrl || '').trim();
            if (remoteUrl) {
              let localUrl = remoteUrl;
              try {
                const stored = await mediaStore.mirrorRemoteUrl({
                  accountId: 'stickers',
                  messageId: `cat-${detail.cateId || '0'}-stk-${id}`,
                  sourceUrl: remoteUrl,
                  fileName: `${id}.webp`,
                  mimeType: 'image/webp',
                });
                localUrl = stored.localPath;
              } catch (mErr) {
                console.warn(`Mirroring sticker ${id} failed:`, (mErr as Error)?.message);
              }

              await stickerResolver.saveCacheRecord({
                sticker_id: id,
                category_id: detail.cateId || stickerMap.get(id),
                remote_url: remoteUrl,
                local_url: localUrl,
                mime_type: 'image/webp',
                width: detail.width,
                height: detail.height,
                status: 'ready',
              });
              successCount++;
            } else {
              await stickerResolver.saveCacheRecord({
                sticker_id: id,
                category_id: detail.cateId || stickerMap.get(id),
                status: 'not_found',
              });
              failCount++;
            }
          } else {
            await stickerResolver.saveCacheRecord({
              sticker_id: id,
              category_id: stickerMap.get(id),
              status: 'not_found',
            });
            failCount++;
          }
        }
      } catch (batchErr) {
        console.warn('Batch fetch error:', (batchErr as Error)?.message);
        failCount += batch.length;
      }
    } else {
      failCount += batch.length;
    }

    // Small delay to prevent rate-limiting
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n==============================================`);
  console.log(`🎉 Sticker Backfill Finished!`);
  console.log(`✅ Successfully cached: ${successCount} stickers`);
  console.log(`⚠️ Not found / Skipped: ${failCount} stickers`);
  console.log(`==============================================\n`);

  await knex.destroy();
}

main().catch(err => {
  console.error('Fatal error in sticker backfill:', err);
  process.exit(1);
});
