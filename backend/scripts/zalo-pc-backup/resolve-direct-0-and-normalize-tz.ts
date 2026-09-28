import knexLib from 'knex';

async function main() {
  const knex = knexLib({
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgresql://zalohub:zalohub@localhost:5433/zalohub',
    pool: { min: 2, max: 10 },
  });

  try {
    const accountRows = await knex('accounts').select('account_id', 'display_name');
    console.log(`📋 Found ${accountRows.length} accounts to process...`);

    // ---------------------------------------------------------
    // BƯỚC 1: Xử lý tin nhắn bị kẹt ở direct:0 cho TẤT CẢ ACCOUNTS
    // ---------------------------------------------------------
    console.log(`\n🔍 [1/4] Đang di chuyển tin nhắn kẹt từ direct:0 về đúng hội thoại...`);
    let totalMoved = 0;

    for (const acc of accountRows) {
      const accountId = acc.account_id;
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
        totalMoved += count;
        if (count === 0) break;
        process.stdout.write(`\r   -> Đã chuyển ${totalMoved} tin nhắn...`);
      }
    }
    console.log(`\n   ✅ Đã di chuyển thành công ${totalMoved.toLocaleString()} tin nhắn về đúng hội thoại!`);

    // Xóa bất kỳ rác nào còn lại trong direct:0 nếu không thể map
    await knex('messages').where({ conversation_id: 'direct:0' }).delete();
    await knex('conversations').where({ id: 'direct:0' }).delete();

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
          WHERE timestamp LIKE '%+%'
          LIMIT 50000
        )
        UPDATE messages m
        SET timestamp = to_char(m.timestamp::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        FROM batch b
        WHERE m.id = b.id;
      `);

      const count = res.rowCount || 0;
      if (count === 0) break;
      totalTzNormalized += count;
      process.stdout.write(`\r   -> Đã chuẩn hóa: ${totalTzNormalized.toLocaleString()} timestamps...`);
    }
    console.log(`\n   ✅ Đã chuẩn hóa thành công ${totalTzNormalized.toLocaleString()} timestamps về chuẩn UTC!`);

    // ---------------------------------------------------------
    // BƯỚC 3: Cập nhật lại conversations từ tin nhắn thực tế
    // ---------------------------------------------------------
    console.log(`\n📊 [3/4] Cập nhật lại trạng thái mới nhất cho các cuộc hội thoại...`);

    // 3a. Reset các hội thoại không có tin nhắn nào về 1970 để không bị đẩy lên đầu
    await knex.raw(`
      UPDATE conversations c
      SET 
        last_message_timestamp = '1970-01-01T00:00:00.000Z',
        last_message_text = '',
        message_count = 0,
        updated_at = '1970-01-01T00:00:00.000Z'
      WHERE NOT EXISTS (
        SELECT 1 FROM messages m 
        WHERE m.account_id = c.account_id AND m.conversation_id = c.id
      );
    `);

    // 3b. Cập nhật thông tin tin nhắn mới nhất & message_count thực tế
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
        WHERE conversation_id IS NOT NULL
        ORDER BY account_id, conversation_id, timestamp DESC
      ),
      counts AS (
        SELECT account_id, conversation_id, count(id) as total_msgs
        FROM messages
        WHERE conversation_id IS NOT NULL
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
    `);
    console.log(`   ✅ Đã cập nhật trạng thái chuẩn xác cho ${convUpdateRes.rowCount || 0} cuộc hội thoại.`);

    // ---------------------------------------------------------
    // BƯỚC 4: Đồng bộ tên hiển thị & Avatar từ danh bạ Friends & Groups
    // ---------------------------------------------------------
    console.log(`\n🏷️  [4/5] Đồng bộ tên khách & tên nhóm từ danh bạ (friends & groups)...`);
    
    // Direct from friends
    const fRes = await knex.raw(`
      UPDATE conversations c
      SET
        title = f.display_name,
        display_name_snapshot = f.display_name,
        avatar = COALESCE(NULLIF(f.avatar, ''), c.avatar),
        updated_at = NOW()
      FROM friends f
      WHERE f.account_id = c.account_id
        AND f.friend_id = c.friend_id
        AND f.display_name IS NOT NULL
        AND f.display_name != '';
    `);

    // Groups from groups table
    const gRes = await knex.raw(`
      UPDATE conversations c
      SET
        title = g.display_name,
        display_name_snapshot = g.display_name,
        avatar = COALESCE(NULLIF(g.avatar, ''), c.avatar),
        updated_at = NOW()
      FROM groups g
      WHERE g.account_id = c.account_id
        AND g.group_id = c.thread_id
        AND g.display_name IS NOT NULL
        AND g.display_name != '';
    `);

    console.log(`   ✅ Đã cập nhật ${fRes.rowCount || 0} tên khách và ${gRes.rowCount || 0} tên nhóm.`);

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
