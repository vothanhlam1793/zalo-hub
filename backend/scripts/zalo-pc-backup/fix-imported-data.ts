import knexLib from 'knex';

/**
 * Script fix-imported-data.ts
 * 
 * 1. Quét toàn bộ tin nhắn thuộc conversation_id = 'direct:0' của tài khoản 2223644954053185337.
 * 2. Đọc raw_message_json để bóc tách:
 *    - fromUid = obj.fromUid || obj.uidFrom
 *    - toUid = obj.toUid || obj.idTo
 *    - senderName = obj.dName
 * 3. Tính toán lại đúng conversation_id, thread_id, friend_id, direction, is_self.
 * 4. Cập nhật lại vào messages (hoặc insert vào đúng ID mới, xóa direct:0 cũ).
 * 5. Cập nhật lại conversations:
 *    - last_message_timestamp, last_message_text, last_direction, last_message_sender_name.
 *    - title và display_name_snapshot bằng tên thật từ tin nhắn (thay vì ID số gây ra 'Khách Zalo').
 */

async function main() {
  const knex = knexLib({
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgresql://zalohub:zalohub@localhost:5433/zalohub',
    pool: { min: 2, max: 10 },
  });

  const accountId = '2223644954053185337';

  console.log(`========================================================`);
  console.log(`🔧 BẮT ĐẦU CHUẨN HÓA DỮ LIỆU ZALOHUB CHO NICK ${accountId}`);
  console.log(`========================================================\n`);

  // BƯỚC 1: Xử lý các tin nhắn direct:0
  console.log(`🔍 [1/3] Đang kiểm tra tin nhắn thuộc direct:0...`);
  const countRes = await knex('messages')
    .where({ account_id: accountId, conversation_id: 'direct:0' })
    .count('id as count');
  const direct0Count = Number(countRes[0].count);
  console.log(`   Tìm thấy ${direct0Count} tin nhắn cần tái định tuyến.`);

  if (direct0Count > 0) {
    let processed = 0;
    const CHUNK_SIZE = 2000;

    while (true) {
      const rows = await knex('messages')
        .where({ account_id: accountId, conversation_id: 'direct:0' })
        .limit(CHUNK_SIZE)
        .select('id', 'raw_message_json', 'created_at', 'text');

      if (rows.length === 0) break;

      const updates: any[] = [];
      const idsToDelete: string[] = [];

      for (const row of rows) {
        let raw: any = null;
        try {
          raw = typeof row.raw_message_json === 'string' ? JSON.parse(row.raw_message_json) : row.raw_message_json;
        } catch (e) {}

        if (!raw) {
          idsToDelete.push(row.id);
          continue;
        }

        const rawMsgId = String(raw.msgId || '');
        const fromUid = String(raw.fromUid || raw.uidFrom || '');
        const toUid = String(raw.toUid || raw.idTo || '');

        if (!fromUid && !toUid) {
          idsToDelete.push(row.id);
          continue;
        }

        const isGroup = toUid.startsWith('g');
        let threadId = '';
        let conversationId = '';

        if (isGroup) {
          threadId = toUid.startsWith('g') ? toUid.slice(1) : toUid;
          conversationId = `group:${threadId}`;
        } else {
          threadId = fromUid === accountId ? toUid : fromUid;
          conversationId = `direct:${threadId}`;
        }

        const isSelf = fromUid === accountId;
        const direction = isSelf ? 'outgoing' : 'incoming';
        const senderName = raw.dName || undefined;
        const uniqueId = `${accountId}::${conversationId}::${rawMsgId}`;

        updates.push({
          id: uniqueId,
          conversation_id: conversationId,
          account_id: accountId,
          thread_id: threadId,
          conversation_type: isGroup ? 'group' : 'direct',
          friend_id: isGroup ? conversationId : threadId,
          provider_message_id: rawMsgId,
          sender_id: fromUid,
          sender_name: senderName,
          direction: direction,
          kind: row.raw_message_json?.msgType ? 'text' : 'text',
          text: row.text || raw.message || raw.content || '',
          image_url: null,
          is_self: isSelf ? 1 : 0,
          timestamp: row.created_at,
          raw_summary_json: null,
          raw_message_json: typeof row.raw_message_json === 'string' ? row.raw_message_json : JSON.stringify(row.raw_message_json),
          created_at: row.created_at,
        });

        idsToDelete.push(row.id);
      }

      // Batch insert into correct conversation
      if (updates.length > 0) {
        await knex('messages')
          .insert(updates)
          .onConflict('id')
          .ignore();
      }

      // Delete from direct:0
      if (idsToDelete.length > 0) {
        await knex('messages')
          .whereIn('id', idsToDelete)
          .delete();
      }

      processed += rows.length;
      process.stdout.write(`\r   Đã tái định tuyến: ${processed}/${direct0Count} tin nhắn...`);
    }
    console.log(`\n   ✅ Hoàn tất tái định tuyến tin nhắn sang hội thoại thật.`);
  }

  // Xóa cuộc trò chuyện ma direct:0 nếu có
  await knex('conversations').where({ account_id: accountId, id: 'direct:0' }).delete();

  // BƯỚC 2: Cập nhật tên thật (title / display_name_snapshot) từ tin nhắn
  console.log(`\n🏷️  [2/3] Đang quét tên người gửi thật từ tin nhắn để loại bỏ "Khách Zalo"...`);
  const namesQuery = await knex.raw(`
    WITH latest_names AS (
      SELECT DISTINCT ON (conversation_id)
             conversation_id,
             sender_name
      FROM messages
      WHERE account_id = ?
        AND sender_name IS NOT NULL
        AND sender_name != ''
        AND is_self = 0
      ORDER BY conversation_id, created_at DESC
    )
    UPDATE conversations c
    SET title = ln.sender_name,
        display_name_snapshot = ln.sender_name
    FROM latest_names ln
    WHERE c.id = ln.conversation_id
      AND c.account_id = ?
      AND (c.title IS NULL OR c.title ~ '^[0-9]+$' OR c.title LIKE 'direct:%');
  `, [accountId, accountId]);
  console.log(`   Đã cập nhật tên thật cho các cuộc trò chuyện.`);

  // BƯỚC 3: Cập nhật chuẩn xác last_message_timestamp, last_message_text, last_direction
  console.log(`\n⏱️  [3/3] Đang cập nhật mốc thời gian và tin nhắn mới nhất thật sự cho từng hội thoại...`);
  await knex.raw(`
    WITH latest_msg AS (
      SELECT DISTINCT ON (conversation_id)
             conversation_id,
             text,
             kind,
             direction,
             sender_name,
             created_at
      FROM messages
      WHERE account_id = ?
      ORDER BY conversation_id, created_at DESC
    )
    UPDATE conversations c
    SET last_message_timestamp = lm.created_at,
        last_message_text = lm.text,
        last_message_kind = lm.kind,
        last_direction = lm.direction,
        last_message_sender_name = lm.sender_name,
        updated_at = NOW()
    FROM latest_msg lm
    WHERE c.id = lm.conversation_id
      AND c.account_id = ?;
  `, [accountId, accountId]);

  console.log(`   ✅ Hoàn tất cập nhật thời gian.`);

  // BƯỚC 4: Kiểm tra lại Top 10 hội thoại sau khi chuẩn hóa
  const topConvs = await knex.raw(`
    SELECT c.id, c.title, c.last_message_text, c.last_message_timestamp, c.last_direction, c.last_message_sender_name
    FROM conversations c
    WHERE c.account_id = ?
    ORDER BY c.last_message_timestamp DESC
    LIMIT 10;
  `, [accountId]);

  console.log(`\n========================================================`);
  console.log(`🎉 KẾT QUẢ TOP 10 HỘI THOẠI SAU KHI CHUẨN HÓA:`);
  console.log(`========================================================`);
  console.log(JSON.stringify(topConvs.rows, null, 2));

  await knex.destroy();
}

main().catch(console.error);
