import crypto from 'node:crypto';
import fs from 'node:fs';
import readline from 'node:readline';
import knexLib from 'knex';
import type { Knex } from 'knex';
import { projectRichMessage } from '../../src/core/message-projection.js';

/** Shared, pure mapping; importing this helper never starts an import or connects to a DB. */
export function projectPcBackupMessage(raw: unknown) {
  return projectRichMessage({}, raw);
}

/**
 * Zalo PC Backup Extractor & Ingestion Engine (All-In-One Production Pipeline)
 * 
 * Flow:
 * 1. Zalo PC export container: AES-256-CBC, key = SHA256(uin), iv = "zie" + uin.slice(0, 13)
 * 2. Stream-decodes and parses JSON line-by-line, mapping to ZaloHub PostgreSQL schema:
 *    - Upserts conversations table with ON CONFLICT (id)
 *    - Inserts messages table with ON CONFLICT (id) DO NOTHING
 * 3. Automatic Post-Processing (Idempotent):
 *    - Deduplicates messages
 *    - Routes direct:0 messages to correct conversations
 *    - Normalizes timestamps to ISO UTC '...Z'
 *    - Syncs titles & avatars from friends & groups tables
 *    - Resets empty conversations to 1970 to guarantee perfect timeline sorting
 */

interface ImportOptions {
  filePath: string;
  sessionUin: string;
  targetAccountId: string;
  databaseUrl?: string;
  limit?: number;
  dryRun?: boolean;
}

export function createZaloPcDecipher(uin: string) {
  const key = crypto.createHash('sha256').update(uin).digest();
  const iv = Buffer.from('zie' + uin.slice(0, 13));
  return crypto.createDecipheriv('aes-256-cbc', key, iv);
}

async function runPostProcessing(knex: Knex, targetAccountId: string) {
  console.log(`\n========================================================`);
  console.log(`🧹 BẮT ĐẦU HẬU XỬ LÝ & CHUẨN HÓA DỮ LIỆU TỰ ĐỘNG`);
  console.log(`========================================================`);

  // 1. Deduplicate
  console.log(`🔍 [1/4] Dọn dẹp tin nhắn trùng lặp...`);
  try {
    await knex.raw(`
      WITH duplicates AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY account_id, provider_message_id 
                 ORDER BY id ASC
               ) as rn
        FROM messages
        WHERE account_id = ?
          AND provider_message_id IS NOT NULL 
          AND provider_message_id != ''
      )
      DELETE FROM messages
      WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);
    `, [targetAccountId]);
    console.log(`   ✅ Đã loại bỏ tin trùng lặp.`);
  } catch (e) {
    console.warn(`   ⚠️ Deduplicate error:`, e instanceof Error ? e.message : String(e));
  }

  // 2. Resolve direct:0
  console.log(`\n🔄 [2/4] Kiểm tra và giải phóng tin nhắn direct:0...`);
  try {
    const res = await knex.raw(`
      WITH batch AS (
        SELECT id
        FROM messages
        WHERE account_id = ? AND conversation_id = 'direct:0'
        LIMIT 50000
      ),
      resolved AS (
        SELECT
          m.id,
          CASE 
            WHEN (m.raw_message_json->>'toUid') LIKE 'g%' THEN 'group:' || SUBSTRING(m.raw_message_json->>'toUid' FROM 2)
            WHEN (m.raw_message_json->>'idTo') LIKE 'g%' THEN 'group:' || SUBSTRING(m.raw_message_json->>'idTo' FROM 2)
            WHEN COALESCE(m.raw_message_json->>'fromUid', m.raw_message_json->>'uidFrom') IN (?, '0', '') 
              THEN 'direct:' || COALESCE(m.raw_message_json->>'toUid', m.raw_message_json->>'idTo')
            ELSE 'direct:' || COALESCE(m.raw_message_json->>'fromUid', m.raw_message_json->>'uidFrom')
          END as new_conv_id,
          CASE 
            WHEN (m.raw_message_json->>'toUid') LIKE 'g%' THEN SUBSTRING(m.raw_message_json->>'toUid' FROM 2)
            WHEN (m.raw_message_json->>'idTo') LIKE 'g%' THEN SUBSTRING(m.raw_message_json->>'idTo' FROM 2)
            WHEN COALESCE(m.raw_message_json->>'fromUid', m.raw_message_json->>'uidFrom') IN (?, '0', '') 
              THEN COALESCE(m.raw_message_json->>'toUid', m.raw_message_json->>'idTo')
            ELSE COALESCE(m.raw_message_json->>'fromUid', m.raw_message_json->>'uidFrom')
          END as new_thread_id,
          CASE 
            WHEN (m.raw_message_json->>'toUid') LIKE 'g%' OR (m.raw_message_json->>'idTo') LIKE 'g%' THEN 'group'
            ELSE 'direct'
          END as new_conv_type,
          CASE
            WHEN COALESCE(m.raw_message_json->>'fromUid', m.raw_message_json->>'uidFrom') IN (?, '0', '') THEN 'outgoing'
            ELSE 'incoming'
          END as new_dir,
          CASE
            WHEN COALESCE(m.raw_message_json->>'fromUid', m.raw_message_json->>'uidFrom') IN (?, '0', '') THEN 1
            ELSE 0
          END as new_self,
          CASE
            WHEN COALESCE(m.raw_message_json->>'fromUid', m.raw_message_json->>'uidFrom') IN (?, '0', '') THEN ?
            ELSE COALESCE(m.raw_message_json->>'fromUid', m.raw_message_json->>'uidFrom')
          END as new_sender,
          NULLIF(m.raw_message_json->>'dName', '') as new_name
        FROM messages m
        JOIN batch b ON b.id = m.id
      )
      UPDATE messages m
      SET 
        conversation_id = r.new_conv_id,
        thread_id = r.new_thread_id,
        conversation_type = r.new_conv_type,
        friend_id = r.new_thread_id,
        sender_id = r.new_sender,
        sender_name = COALESCE(r.new_name, m.sender_name),
        direction = r.new_dir,
        is_self = r.new_self
      FROM resolved r
      WHERE m.id = r.id
        AND r.new_conv_id IS NOT NULL 
        AND r.new_conv_id != 'direct:' 
        AND r.new_conv_id != 'direct:0';
    `, [targetAccountId, targetAccountId, targetAccountId, targetAccountId, targetAccountId, targetAccountId, targetAccountId]);

    console.log(`   ✅ Đã di chuyển ${res.rowCount || 0} tin nhắn direct:0.`);
    await knex('messages').where({ account_id: targetAccountId, conversation_id: 'direct:0' }).delete();
    await knex('conversations').where({ account_id: targetAccountId, id: 'direct:0' }).delete();
  } catch (e) {
    console.warn(`   ⚠️ direct:0 error:`, e instanceof Error ? e.message : String(e));
  }

  // 3. Normalize Timestamps to UTC
  console.log(`\n⏰ [3/4] Chuẩn hóa mốc thời gian ISO UTC...`);
  try {
    await knex.raw(`
      UPDATE messages
      SET timestamp = to_char(timestamp::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      WHERE account_id = ? AND timestamp LIKE '%+%';
    `, [targetAccountId]);
    console.log(`   ✅ Đã chuẩn hóa toàn bộ timestamps.`);
  } catch (e) {
    console.warn(`   ⚠️ Timestamp normalization error:`, e instanceof Error ? e.message : String(e));
  }

  // 4. Sync Names & Reset Empty Conversations
  console.log(`\n🏷️  [4/4] Đồng bộ danh bạ (friends & groups) và cập nhật thứ tự hội thoại...`);
  try {
    // 4a. Reset empty conversations
    await knex.raw(`
      UPDATE conversations c
      SET 
        last_message_timestamp = '1970-01-01T00:00:00.000Z',
        last_message_text = '',
        message_count = 0,
        updated_at = '1970-01-01T00:00:00.000Z'
      WHERE c.account_id = ? AND NOT EXISTS (
        SELECT 1 FROM messages m 
        WHERE m.account_id = c.account_id AND m.conversation_id = c.id
      );
    `, [targetAccountId]);

    // 4b. Sync Friends
    await knex.raw(`
      UPDATE conversations c
      SET
        title = f.display_name,
        display_name_snapshot = f.display_name,
        avatar = COALESCE(NULLIF(f.avatar, ''), c.avatar),
        updated_at = NOW()
      FROM friends f
      WHERE f.account_id = c.account_id
        AND f.friend_id = c.friend_id
        AND c.account_id = ?
        AND f.display_name IS NOT NULL
        AND f.display_name != '';
    `, [targetAccountId]);

    // 4c. Sync Groups
    await knex.raw(`
      UPDATE conversations c
      SET
        title = g.display_name,
        display_name_snapshot = g.display_name,
        avatar = COALESCE(NULLIF(g.avatar, ''), c.avatar),
        updated_at = NOW()
      FROM groups g
      WHERE g.account_id = c.account_id
        AND g.group_id = c.thread_id
        AND c.account_id = ?
        AND g.display_name IS NOT NULL
        AND g.display_name != '';
    `, [targetAccountId]);

    // 4d. Recalculate latest message summary and counts
    const convUpdateRes = await knex.raw(`
      WITH latest AS (
        SELECT DISTINCT ON (account_id, conversation_id)
          account_id,
          conversation_id,
          timestamp as last_ts,
          text as last_text,
          direction as last_dir,
          sender_name as last_sender_name,
          kind as last_kind
        FROM messages
        WHERE account_id = ? AND conversation_id IS NOT NULL
        ORDER BY account_id, conversation_id, timestamp DESC
      ),
      counts AS (
        SELECT account_id, conversation_id, count(id) as total_msgs
        FROM messages
        WHERE account_id = ? AND conversation_id IS NOT NULL
        GROUP BY account_id, conversation_id
      )
      UPDATE conversations c
      SET
        last_message_timestamp = l.last_ts,
        last_message_text = l.last_text,
        last_direction = l.last_dir,
        last_message_sender_name = COALESCE(l.last_sender_name, c.last_message_sender_name),
        last_message_kind = l.last_kind,
        message_count = cnt.total_msgs,
        updated_at = NOW()
      FROM latest l
      JOIN counts cnt ON cnt.account_id = l.account_id AND cnt.conversation_id = l.conversation_id
      WHERE c.account_id = l.account_id AND c.id = l.conversation_id;
    `, [targetAccountId, targetAccountId]);

    console.log(`   ✅ Đã chuẩn hóa trạng thái & thứ tự cho ${convUpdateRes.rowCount || 0} cuộc hội thoại.`);
  } catch (e) {
    console.warn(`   ⚠️ Sync names error:`, e instanceof Error ? e.message : String(e));
  }

  console.log(`\n✨ HẬU XỬ LÝ HOÀN TẤT TRỌN VẸN!`);
}

export async function runImport(options: ImportOptions) {
  const { filePath, sessionUin, targetAccountId, databaseUrl, limit = Infinity, dryRun = false } = options;

  console.log(`\n========================================================`);
  console.log(`🚀 ZALOHUB - ZALO PC BACKUP INGESTOR (PRODUCTION)`);
  console.log(`========================================================`);
  console.log(`📦 File: ${filePath}`);
  console.log(`🔑 Session UIN: ${sessionUin}`);
  console.log(`👤 Target Account ID: ${targetAccountId}`);
  console.log(`⚙️  Dry-Run Mode: ${dryRun ? 'ON (No DB changes)' : 'OFF (Live Insertion)'}`);
  if (limit !== Infinity) console.log(`⏱️  Limit: ${limit} messages`);
  console.log(`--------------------------------------------------------\n`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File không tồn tại: ${filePath}`);
  }

  const decipher = createZaloPcDecipher(sessionUin);
  const fileStream = fs.createReadStream(filePath);
  const decryptedStream = fileStream.pipe(decipher);

  const rl = readline.createInterface({
    input: decryptedStream,
    crlfDelay: Infinity,
  });

  const knex = dryRun ? null : knexLib({
    client: 'pg',
    connection: databaseUrl || process.env.DATABASE_URL || 'postgresql://zalohub:zalohub@localhost:5433/zalohub',
    pool: { min: 2, max: 10 },
  });

  let totalParsed = 0;
  let totalConversations = 0;
  let totalMessages = 0;
  let insertedMessages = 0;
  let insertedConversations = 0;

  const convBatch: any[] = [];
  const messageBatch: any[] = [];
  const CONV_BATCH_SIZE = 100;
  const MSG_BATCH_SIZE = 500;

  const flushConvBatch = async () => {
    if (!knex || convBatch.length === 0) {
      convBatch.length = 0;
      return;
    }
    const current = [...convBatch];
    convBatch.length = 0;

    try {
      await knex('conversations')
        .insert(current)
        .onConflict('id')
        .merge({
          last_message_timestamp: knex.raw('GREATEST(conversations.last_message_timestamp, EXCLUDED.last_message_timestamp)'),
          updated_at: new Date().toISOString(),
        });
      insertedConversations += current.length;
    } catch (err: any) {
      // ignore individual batch conflict
    }
  };

  const flushMessageBatch = async () => {
    if (!knex || messageBatch.length === 0) {
      messageBatch.length = 0;
      return;
    }
    const current = [...messageBatch];
    messageBatch.length = 0;

    try {
      await knex('messages')
        .insert(current)
        .onConflict('id')
        .ignore();
      insertedMessages += current.length;
    } catch (err: any) {
      // ignore duplicate message conflict
    }
  };

  try {
    for await (const line of rl) {
      if (!line.trim().startsWith('{')) continue;

      try {
        const obj = JSON.parse(line);
        totalParsed++;

        // 1. Check if conversation entry
        if (obj.userId && obj.isGroup !== undefined && obj.firstSmsLocalId !== undefined) {
          totalConversations++;

          const rawUid = String(obj.userId);
          const isGroup = Boolean(obj.isGroup);
          const threadId = isGroup && rawUid.startsWith('g') ? rawUid.slice(1) : rawUid;
          const conversationId = isGroup ? `group:${threadId}` : `direct:${threadId}`;

          const lastTs = Number(obj.infoCheckSearch?.lastMessageTime || 0);
          const lastDate = lastTs > 0 && !isNaN(lastTs) ? new Date(lastTs).toISOString() : '1970-01-01T00:00:00.000Z';

          const convRecord = {
            id: conversationId,
            account_id: targetAccountId,
            thread_id: threadId,
            type: isGroup ? 'group' : 'direct',
            friend_id: isGroup ? conversationId : threadId,
            title: isGroup ? `Nhóm ${threadId.slice(-4)}` : threadId,
            last_message_text: '',
            last_message_kind: 'text',
            last_direction: 'incoming',
            last_message_timestamp: lastDate,
            message_count: obj.numMsg || 0,
            unread_count: 0,
            created_at: lastDate,
            updated_at: lastDate,
          };

          if (!dryRun) {
            convBatch.push(convRecord);
            if (convBatch.length >= CONV_BATCH_SIZE) {
              await flushConvBatch();
            }
          }
        }

        // 2. Check if message entry
        const rawFrom = String(obj.fromUid || obj.uidFrom || '');
        const rawTo = String(obj.toUid || obj.idTo || '');
        if (obj.msgId && (rawTo || rawFrom)) {
          totalMessages++;

          const rawMsgId = String(obj.msgId);
          const fromUid = rawFrom;
          const toUid = rawTo;

          const isGroup = toUid.startsWith('g');
          let threadId = '';
          let conversationId = '';

          const isSelf = fromUid === targetAccountId || fromUid === '0';
          const direction = isSelf ? 'outgoing' : 'incoming';

          if (isGroup) {
            threadId = toUid.startsWith('g') ? toUid.slice(1) : toUid;
            conversationId = `group:${threadId}`;
          } else {
            threadId = isSelf ? toUid : fromUid;
            conversationId = `direct:${threadId}`;
          }

          if (!threadId || threadId === '0') {
            continue;
          }

          // Composite unique primary key id: <account_id>::<conversation_id>::<msg_id>
          const uniqueId = `${targetAccountId}::${conversationId}::${rawMsgId}`;

          let content = '';
          if (typeof obj.message === 'string') {
            content = obj.message;
          } else if (obj.message && typeof obj.message === 'object' && typeof obj.message.title === 'string') {
            content = obj.message.title;
          } else if (typeof obj.content === 'string') {
            content = obj.content;
          }

          const rawTs = Number(obj.sendDttm || obj.serverTime || obj.localDttm || obj.ts || Date.now());
          const createdAt = new Date(isNaN(rawTs) ? Date.now() : rawTs);
          const isoTimestamp = createdAt.toISOString();

          let msgType = 'text';
          if (obj.msgType === 2) msgType = 'image';
          else if (obj.msgType === 3) msgType = 'video';
          else if (obj.msgType === 14) msgType = 'audio';
          else if (obj.msgType === 19) msgType = 'sticker';
          else if (obj.msgType === 1) msgType = 'file';

          const messageRecord = {
            id: uniqueId,
            account_id: targetAccountId,
            conversation_id: conversationId,
            thread_id: threadId,
            conversation_type: isGroup ? 'group' : 'direct',
            friend_id: isGroup ? conversationId : threadId,
            provider_message_id: rawMsgId,
            sender_id: isSelf ? targetAccountId : fromUid,
            sender_name: obj.dName || undefined,
            direction: direction,
            kind: msgType,
            text: content || '',
            image_url: null,
            is_self: isSelf ? 1 : 0,
            timestamp: isoTimestamp,
            raw_summary_json: null,
            raw_message_json: line,
            created_at: isoTimestamp,
          };

          if (dryRun) {
            if (totalMessages <= (limit === Infinity ? 10 : limit)) {
              console.log(`[SAMPLE #${totalMessages}] [${isoTimestamp}] [${conversationId}] [${direction}] ${obj.dName || fromUid}: ${content.slice(0, 80)}`);
            }
          } else {
            messageBatch.push(messageRecord);
            if (messageBatch.length >= MSG_BATCH_SIZE) {
              await flushMessageBatch();
              process.stdout.write(`\r📥 Tiến độ nạp: ${insertedMessages} tin nhắn (Tổng dòng parsed: ${totalParsed})...`);
            }
          }

          if (totalMessages >= limit) {
            console.log(`\n🛑 Đã đạt giới hạn --limit=${limit}`);
            break;
          }
        }
      } catch (e) {
        // Skip malformed lines
      }
    }

    if (!dryRun) {
      await flushConvBatch();
      await flushMessageBatch();
    }

    console.log(`\n\n========================================================`);
    console.log(`🎉 NẠP DỮ LIỆU HOÀN TẤT THÀNH CÔNG!`);
    console.log(`========================================================`);
    console.log(`📊 Tổng số dòng parsed: ${totalParsed}`);
    console.log(`💬 Tổng số tin nhắn: ${totalMessages}`);
    console.log(`👥 Tổng số cuộc hội thoại: ${totalConversations}`);
    if (!dryRun) {
      console.log(`💾 Đã nạp thành công vào PostgreSQL: ${insertedMessages} tin nhắn, ${insertedConversations} hội thoại.`);
      if (knex) {
        await runPostProcessing(knex, targetAccountId);
      }
    }
  } finally {
    if (knex) await knex.destroy();
  }
}

// CLI runner
if (process.argv[1]?.endsWith('decrypt-and-import.ts')) {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const file = getArg('--file') || '/tmp/opencode/zalo_backup/backup_zalo_26_09_2026.zl.zip';
  const uin = getArg('--uin') || '0202ec6f59844ca48f5bf44d9d962df9';
  const accountId = getArg('--account') || '2223644954053185337';
  const dbArg = getArg('--db');
  const limitArg = getArg('--limit');
  const dryRun = args.includes('--dry-run');

  let databaseUrl = process.env.DATABASE_URL;
  if (dbArg === 'creta' || dbArg === 'zalohub_creta') {
    databaseUrl = 'postgresql://zalohub:zalohub@localhost:5433/zalohub_creta';
  } else if (dbArg === 'main' || dbArg === 'zalohub') {
    databaseUrl = 'postgresql://zalohub:zalohub@localhost:5433/zalohub';
  } else if (dbArg && dbArg.startsWith('postgres')) {
    databaseUrl = dbArg;
  }

  runImport({
    filePath: file,
    sessionUin: uin,
    targetAccountId: accountId,
    databaseUrl,
    limit: limitArg ? parseInt(limitArg, 10) : undefined,
    dryRun,
  }).catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
