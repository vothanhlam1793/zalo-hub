import knexLib from 'knex';

/**
 * Script fast-fix-imported-data.ts
 * Sử dụng SQL CTE và UPDATE trực tiếp trên database để xử lý tốc độ cao:
 * Bóc tách JSON trực tiếp bằng PostgreSQL JSON operators -> nhanh hơn gấp 100 lần so với kéo qua Node.js
 */

async function main() {
  const knex = knexLib({
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgresql://zalohub:zalohub@localhost:5433/zalohub',
    pool: { min: 2, max: 10 },
  });

  const accountId = '2223644954053185337';

  console.log(`========================================================`);
  console.log(`⚡ SIÊU TỐC: CHUẨN HÓA DỮ LIỆU ZALOHUB BẰNG NATIVE POSTGRESQL`);
  console.log(`========================================================\n`);

  console.log(`🔍 [1/3] Đang tái định tuyến tin nhắn direct:0 trực tiếp trong PostgreSQL...`);
  
  // Update direct:0 records directly via Postgres JSON parsing
  const updateRes = await knex.raw(`
    WITH parsed AS (
      SELECT 
        id,
        raw_message_json->>'msgId' as raw_msg_id,
        COALESCE(raw_message_json->>'fromUid', raw_message_json->>'uidFrom', '') as f_uid,
        COALESCE(raw_message_json->>'toUid', raw_message_json->>'idTo', '') as t_uid,
        COALESCE(raw_message_json->>'dName', '') as d_name
      FROM messages
      WHERE account_id = ? AND conversation_id = 'direct:0'
    ),
    resolved AS (
      SELECT
        id,
        raw_msg_id,
        f_uid,
        d_name,
        CASE 
          WHEN t_uid LIKE 'g%' THEN 'group:' || SUBSTRING(t_uid FROM 2)
          WHEN t_uid LIKE 'group:%' THEN t_uid
          WHEN f_uid = ? THEN 'direct:' || t_uid
          ELSE 'direct:' || f_uid
        END as correct_conv_id,
        CASE
          WHEN t_uid LIKE 'g%' THEN SUBSTRING(t_uid FROM 2)
          WHEN t_uid LIKE 'group:%' THEN SUBSTRING(t_uid FROM 7)
          WHEN f_uid = ? THEN t_uid
          ELSE f_uid
        END as correct_thread_id,
        CASE
          WHEN t_uid LIKE 'g%' OR t_uid LIKE 'group:%' THEN 'group'
          ELSE 'direct'
        END as correct_conv_type,
        CASE
          WHEN f_uid = ? THEN 'outgoing'
          ELSE 'incoming'
        END as correct_direction,
        CASE
          WHEN f_uid = ? THEN 1
          ELSE 0
        END as correct_is_self
      FROM parsed
      WHERE f_uid != '' OR t_uid != ''
    )
    UPDATE messages m
    SET 
      conversation_id = r.correct_conv_id,
      thread_id = r.correct_thread_id,
      conversation_type = r.correct_conv_type,
      friend_id = CASE WHEN r.correct_conv_type = 'group' THEN r.correct_conv_id ELSE r.correct_thread_id END,
      sender_id = r.f_uid,
      sender_name = CASE WHEN r.d_name != '' THEN r.d_name ELSE m.sender_name END,
      direction = r.correct_direction,
      is_self = r.correct_is_self
    FROM resolved r
    WHERE m.id = r.id;
  `, [accountId, accountId, accountId, accountId, accountId]);

  console.log(`   ✅ Đã cập nhật xong toàn bộ tin nhắn direct:0.`);

  // Xóa bất kỳ tin rác còn sót lại không có ID
  await knex('messages').where({ account_id: accountId, conversation_id: 'direct:0' }).delete();
  await knex('conversations').where({ account_id: accountId, id: 'direct:0' }).delete();

  // BƯỚC 2: Cập nhật tên thật (title) từ sender_name cho các cuộc trò chuyện
  console.log(`\n🏷️  [2/3] Cập nhật tên thật cho các cuộc trò chuyện (loại bỏ "Khách Zalo")...`);
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

  // BƯỚC 3: Cập nhật chuẩn xác last_message_timestamp và last_message_text
  console.log(`\n⏱️  [3/3] Cập nhật thời gian tin nhắn mới nhất thật sự cho từng hội thoại...`);
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
  console.log(`   ✅ Đã cập nhật mốc thời gian chuẩn xác.`);

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
