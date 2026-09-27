import knexLib from 'knex';

async function main() {
  const knex = knexLib({
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgresql://zalohub:zalohub@localhost:5433/zalohub',
    pool: { min: 2, max: 10 },
  });

  const accountId = '2223644954053185337';

  console.log(`================================================================`);
  console.log(`🚀 GIẢI PHÓNG TIN NHẮN DIRECT:0 & CHUẨN HÓA MÚI GIỜ TIMESTAMP`);
  console.log(`================================================================\n`);

  try {
    // ---------------------------------------------------------
    // BƯỚC 1: Xử lý 309k tin nhắn bị kẹt ở direct:0
    // ---------------------------------------------------------
    console.log(`🔍 [1/4] Đang di chuyển tin nhắn kẹt từ direct:0 về đúng hội thoại...`);
    let totalMoved = 0;
    while (true) {
      const res = await knex.raw(`
        WITH batch AS (
          SELECT id
          FROM messages
          WHERE account_id = ? AND conversation_id = 'direct:0'
          LIMIT 25000
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
      `, [accountId, accountId, accountId, accountId, accountId, accountId, accountId]);

      const count = res.rowCount || 0;
      if (count === 0) break;
      totalMoved += count;
      process.stdout.write(`\r   -> Đã di chuyển: ${totalMoved.toLocaleString()} tin nhắn...`);
    }
    console.log(`\n   ✅ Đã di chuyển thành công ${totalMoved.toLocaleString()} tin nhắn về đúng hội thoại!`);

    // Xóa bất kỳ rác nào còn lại trong direct:0 nếu không thể map
    await knex('messages').where({ account_id: accountId, conversation_id: 'direct:0' }).delete();
    await knex('conversations').where({ account_id: accountId, id: 'direct:0' }).delete();

    // ---------------------------------------------------------
    // BƯỚC 2: Chuẩn hóa toàn bộ timestamp trong messages về ISO UTC '...Z'
    // ---------------------------------------------------------
    console.log(`\n⏰ [2/4] Chuẩn hóa định dạng timestamp về ISO UTC '...Z'...`);
    let totalTzNormalized = 0;
    while (true) {
      const res = await knex.raw(`
        WITH batch AS (
          SELECT id
          FROM messages
          WHERE account_id = ? AND timestamp LIKE '%+%'
          LIMIT 50000
        )
        UPDATE messages m
        SET timestamp = to_char(m.timestamp::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        FROM batch b
        WHERE m.id = b.id;
      `, [accountId]);

      const count = res.rowCount || 0;
      if (count === 0) break;
      totalTzNormalized += count;
      process.stdout.write(`\r   -> Đã chuẩn hóa: ${totalTzNormalized.toLocaleString()} timestamps...`);
    }
    console.log(`\n   ✅ Đã chuẩn hóa thành công ${totalTzNormalized.toLocaleString()} timestamps về chuẩn UTC!`);

    // ---------------------------------------------------------
    // BƯỚC 3: Cập nhật lại conversations (last_message_timestamp, last_message_text...)
    // ---------------------------------------------------------
    console.log(`\n📊 [3/4] Cập nhật lại trạng thái mới nhất cho các cuộc hội thoại...`);
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
      )
      UPDATE conversations c
      SET
        last_message_timestamp = l.last_ts,
        last_message_text = l.last_text,
        last_direction = l.last_dir,
        last_message_sender_name = COALESCE(l.last_sender_name, c.last_message_sender_name),
        last_message_kind = l.last_kind,
        updated_at = NOW()
      FROM latest l
      WHERE c.account_id = l.account_id AND c.id = l.conversation_id;
    `, [accountId]);
    console.log(`   ✅ Đã cập nhật trạng thái cho ${convUpdateRes.rowCount || 0} cuộc hội thoại.`);

    // ---------------------------------------------------------
    // BƯỚC 4: Kiểm tra xác minh hội thoại Châu Đỗ
    // ---------------------------------------------------------
    console.log(`\n🔎 [4/4] Kiểm tra kiểm thử trực tiếp hội thoại Châu Đỗ...`);
    const chauDoMsgs = await knex.raw(`
      SELECT id, direction, is_self, text, timestamp
      FROM messages
      WHERE account_id = ? AND conversation_id = 'direct:6320721228312226389'
      ORDER BY timestamp DESC
      LIMIT 10;
    `, [accountId]);

    console.log(`10 tin nhắn gần nhất của Châu Đỗ sau khi chuẩn hóa:`);
    for (const m of chauDoMsgs.rows.reverse()) {
      const tag = m.is_self ? '🧑 BẠN' : '👤 CHÂU ĐỖ';
      console.log(`   [${m.timestamp}] [${tag}]: ${m.text}`);
    }

    console.log(`\n================================================================`);
    console.log(`🎉 TOÀN BỘ DỮ LIỆU ĐÃ ĐƯỢC CHUẨN HÓA HOÀN TOÀN!`);
    console.log(`================================================================`);
  } catch (err: any) {
    console.error(`❌ Lỗi migration:`, err);
  } finally {
    await knex.destroy();
  }
}

main().catch(console.error);
