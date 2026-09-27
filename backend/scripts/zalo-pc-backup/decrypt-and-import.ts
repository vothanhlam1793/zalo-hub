import crypto from 'node:crypto';
import fs from 'node:fs';
import readline from 'node:readline';
import knexLib from 'knex';
import { projectRichMessage } from '../../src/core/message-projection.js';

/** Shared, pure mapping; importing this helper never starts an import or connects to a DB. */
export function projectPcBackupMessage(raw: unknown) {
  return projectRichMessage({}, raw);
}

/**
 * Zalo PC Backup Extractor & Ingestion Engine
 * 
 * Flow:
 * 1. Zalo PC export container: AES-256-CBC, key = SHA256(uin), iv = "zie" + uin.slice(0, 13)
 * 2. Payload is a tar archive containing:
 *    - <userId>/ZaloDownloads/database/<userId>_zconversation.zdb (Newline-delimited JSON)
 *    - <userId>/ZaloDownloads/database/<userId>_zmessage.zdb (Newline-delimited JSON)
 * 3. Stream-decodes and parses JSON line-by-line, mapping to ZaloHub PostgreSQL schema:
 *    - Upserts conversations table with ON CONFLICT (id)
 *    - Inserts messages table with ON CONFLICT (id) DO NOTHING
 */

interface ImportOptions {
  filePath: string;
  sessionUin: string;
  targetAccountId: string;
  limit?: number;
  dryRun?: boolean;
}

export function createZaloPcDecipher(uin: string) {
  const key = crypto.createHash('sha256').update(uin).digest();
  const iv = Buffer.from('zie' + uin.slice(0, 13));
  return crypto.createDecipheriv('aes-256-cbc', key, iv);
}

export async function runImport(options: ImportOptions) {
  const { filePath, sessionUin, targetAccountId, limit = Infinity, dryRun = false } = options;

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
    connection: process.env.DATABASE_URL || 'postgresql://zalohub:zalohub@localhost:5433/zalohub',
    pool: { min: 2, max: 10 },
  });

  let totalParsed = 0;
  let totalConversations = 0;
  let totalMessages = 0;
  let insertedMessages = 0;
  let skippedMessages = 0;
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
          updated_at: new Date(),
        });
      insertedConversations += current.length;
    } catch (err: any) {
      // If error, ignore and continue
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
      console.error(`⚠️ Lỗi khi nạp batch messages:`, err.message);
      skippedMessages += current.length;
    }
  };

  try {
    for await (const line of rl) {
      if (!line || !line.startsWith('{')) continue;

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

          const lastTs = Number(obj.infoCheckSearch?.lastMessageTime || Date.now());
          const lastDate = new Date(isNaN(lastTs) ? Date.now() : lastTs).toISOString();

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
            updated_at: new Date().toISOString(),
          };

          if (!dryRun) {
            convBatch.push(convRecord);
            if (convBatch.length >= CONV_BATCH_SIZE) {
              await flushConvBatch();
            }
          }
          continue;
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

          // Composite unique primary key id in ZaloHub format: <account_id>::<conversation_id>::<msg_id>
          const uniqueId = `${targetAccountId}::${conversationId}::${rawMsgId}`;

          const projected = projectPcBackupMessage(obj);
          const content = projected.text;

          const rawTs = Number(obj.sendDttm || obj.serverTime || obj.localDttm || obj.ts || Date.now());
          const createdAt = new Date(isNaN(rawTs) ? Date.now() : rawTs);
          const isoTimestamp = createdAt.toISOString();

          const msgType = projected.kind;

          const dbRecord = {
            id: uniqueId,
            conversation_id: conversationId,
            account_id: targetAccountId,
            thread_id: threadId,
            conversation_type: isGroup ? 'group' : 'direct',
            friend_id: isGroup ? conversationId : threadId,
            provider_message_id: rawMsgId,
            sender_id: isSelf ? targetAccountId : fromUid,
            sender_name: obj.dName || undefined,
            direction: direction,
            kind: msgType,
            text: content || '',
            image_url: projected.imageUrl ?? null,
            is_self: isSelf ? 1 : 0,
            timestamp: isoTimestamp,
            raw_summary_json: null,
            raw_message_json: line,
            created_at: isoTimestamp,
          };

          if (dryRun) {
            if (totalMessages <= 10) {
              console.log(`[SAMPLE #${totalMessages}] [${createdAt.toLocaleString('vi-VN')}] [${conversationId}] [${direction}] ${dbRecord.sender_name || fromUid}: ${content.slice(0, 80)}`);
            }
          } else {
            messageBatch.push(dbRecord);
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
  const limitArg = getArg('--limit');
  const dryRun = args.includes('--dry-run');

  runImport({
    filePath: file,
    sessionUin: uin,
    targetAccountId: accountId,
    limit: limitArg ? parseInt(limitArg, 10) : undefined,
    dryRun,
  }).catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
