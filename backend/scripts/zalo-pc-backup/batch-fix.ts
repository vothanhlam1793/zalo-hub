import knexLib from 'knex';

async function main() {
  const knex = knexLib({
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgresql://zalohub:zalohub@localhost:5433/zalohub',
    pool: { min: 2, max: 10 },
  });

  const accountId = '2223644954053185337';

  console.log(`========================================================`);
  console.log(`⚡ CHUẨN HÓA DỮ LIỆU TỐC ĐỘ CAO THEO BATCH TRỰC TIẾP`);
  console.log(`========================================================\n`);

  // BƯỚC 1: Xử lý direct:0 theo từng batch 20.000 dòng bằng subquery có LIMIT
  console.log(`🔍 [1/3] Đang chuyển đổi tin nhắn direct:0...`);
  let totalFixed = 0;

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
            WHEN COALESCE(m.raw_message_json->>'fromUid', m.raw_message_json->>'uidFrom') = ? THEN 'direct:' || COALESCE(m.raw_message_json->>'toUid', m.raw_message_json->>'idTo')
            ELSE 'direct:' || COALESCE(m.raw_message_json->>'fromUid', m.raw_message_json->>'uidFrom')
          END as new_conv_id,
          CASE 
            WHEN (m.raw_message_json->>'toUid') LIKE 'g%' THEN SUBSTRING(m.raw_message_json->>'toUid' FROM 2)
            WHEN (m.raw_message_json->>'idTo') LIKE 'g%' THEN SUBSTRING(m.raw_message_json->>'idTo' FROM 2)
            WHEN COALESCE(m.raw_message_json->>'fromUid', m.raw_message_json->>'uidFrom') = ? THEN COALESCE(m.raw_message_json->>'toUid', m.raw_message_json->>'idTo')
            ELSE COALESCE(m.raw_message_json->>'fromUid', m.raw_message_json->>'uidFrom')
          END as new_thread_id,
          CASE 
            WHEN (m.raw_message_json->>'toUid') LIKE 'g%' OR (m.raw_message_json->>'idTo') LIKE 'g%' THEN 'group'
            ELSE 'direct'
          END as new_conv_type,
          CASE
            WHEN COALESCE(m.raw_message_json->>'fromUid', m.raw_message_json->>'uidFrom') = ? THEN 'outgoing'
            ELSE 'incoming'
          END as new_dir,
          CASE
            WHEN COALESCE(m.raw_message_json->>'fromUid', m.raw_message_json->>'uidFrom') = ? THEN 1
            ELSE 0
          END as new_self,
          COALESCE(m.raw_message_json->>'fromUid', m.raw_message_json->>'uidFrom') as new_sender,
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
    `, [accountId, accountId, accountId, accountId, accountId]);

    const count = res.rowCount || 0;
    if (count === 0) break;
    totalFixed += count;
    process.stdout.write(`\r   Đã cập nhật: ${totalFixed} tin nhắn...`);
  }

  // Xóa bất kỳ tin rác còn sót lại không có ID
  await knex('messages').where({ account_id: accountId, conversation_id: 'direct:0' }).delete();
  await knex('conversations').where({ account_id: accountId, id: 'direct:0' }).delete();
  console.log(`\n   ✅ Đã xử lý xong toàn bộ direct:0.`);

  // BƯỚC 2: Cập nhật tên thật (title)
  console.log(`\n🏷️  [2/3] Cập nhật tên thật cho các cuộc trò chuyện...`);
  await knex.raw(`
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
  console.log(`   ✅ Đã cập nhật tên thật hoàn tất.`);

  // BƯỚC 3: Cập nhật thời gian và nội dung mới nhất
  console.log(`\n⏱️  [3/3] Cập nhật mốc thời gian tin nhắn mới nhất thật sự cho từng hội thoại...`);
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
  console.log(`   ✅ Đã cập nhật thời gian chuẩn xác.`);

  // BƯỚC 4: Hiển thị Top 10 sau khi cập nhật
  const topConvs = await knex.raw(`
    SELECT c.id, c.title, c.last_message_text, c.last_message_timestamp, c.last_direction, c.last_message_sender_name
    FROM conversations c
    WHERE c.account_id = ?
    ORDER BY c.last_message_timestamp DESC
    LIMIT 10;
  `, [accountId]);

  console.log(`\n========================================================`);
  console.log(`🎉 TOP 10 CUỘC HỘI THOẠI MỚI NHẤT CHUẨN XÁC:`);
  console.log(`========================================================`);
  console.log(JSON.stringify(topConvs.rows, null, 2));

  await knex.destroy();
}

main().catch(console.error);
