import knexLib from 'knex';

async function main() {
  const knex = knexLib({
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgresql://zalohub:zalohub@localhost:5433/zalohub',
    pool: { min: 2, max: 10 },
  });

  console.log(`========================================================`);
  console.log(`🧹 DỌN DẸP & SO TRÙNG DỮ LIỆU TIN NHẮN (ALL ACCOUNTS)`);
  console.log(`========================================================\n`);

  try {
    // BƯỚC 1: Tạo bảng tạm dedup_mapping (discarded_id, kept_id) cho TOÀN BỘ ACCOUNTS
    console.log(`🔍 [1/5] Đang phân tích và tìm các tin nhắn trùng lặp trên mọi tài khoản...`);
    const t0 = Date.now();

    await knex.raw(`DROP TABLE IF EXISTS dedup_mapping;`);
    await knex.raw(`
      CREATE UNLOGGED TABLE dedup_mapping AS
      WITH ranked AS (
        SELECT 
          id, 
          account_id, 
          provider_message_id,
          reactions_json,
          image_url,
          FIRST_VALUE(id) OVER (
            PARTITION BY account_id, provider_message_id
            ORDER BY
              CASE 
                WHEN id ~ '^[^:]+::(direct|group):[^:]+::[^:]+$' THEN 1
                WHEN id ~ '^[^:]+::(direct|group):' THEN 2
                ELSE 3
              END ASC,
              CASE WHEN reactions_json IS NOT NULL THEN 1 ELSE 2 END ASC,
              CASE WHEN image_url IS NOT NULL THEN 1 ELSE 2 END ASC,
              created_at DESC
          ) as kept_id,
          ROW_NUMBER() OVER (
            PARTITION BY account_id, provider_message_id
            ORDER BY
              CASE 
                WHEN id ~ '^[^:]+::(direct|group):[^:]+::[^:]+$' THEN 1
                WHEN id ~ '^[^:]+::(direct|group):' THEN 2
                ELSE 3
              END ASC,
              CASE WHEN reactions_json IS NOT NULL THEN 1 ELSE 2 END ASC,
              CASE WHEN image_url IS NOT NULL THEN 1 ELSE 2 END ASC,
              created_at DESC
          ) as rn
        FROM messages
        WHERE provider_message_id IS NOT NULL 
          AND provider_message_id <> ''
      )
      SELECT id as discarded_id, kept_id
      FROM ranked
      WHERE rn > 1;
    `);

    await knex.raw(`CREATE INDEX idx_dedup_map_disc ON dedup_mapping (discarded_id);`);
    await knex.raw(`CREATE INDEX idx_dedup_map_kept ON dedup_mapping (kept_id);`);

    const countRes = await knex.raw(`SELECT count(*) as c FROM dedup_mapping;`);
    const dupCount = Number(countRes.rows[0].c);
    console.log(`   -> Tìm thấy ${dupCount.toLocaleString()} bản ghi tin nhắn trùng lặp (${((Date.now() - t0) / 1000).toFixed(1)}s).`);

    if (dupCount === 0) {
      console.log(`✅ Không có tin nhắn nào bị trùng.`);
      return;
    }

    // BƯỚC 2: Chuyển dữ liệu quan trọng (reactions, image_url) từ tin nhắn cũ sang tin nhắn giữ lại (nếu tin giữ lại bị thiếu)
    console.log(`\n🔄 [2/5] Cập nhật reactions và image_url sang tin nhắn chuẩn...`);
    const updateRes = await knex.raw(`
      UPDATE messages m
      SET 
        reactions_json = COALESCE(m.reactions_json, disc.reactions_json),
        image_url = COALESCE(m.image_url, disc.image_url)
      FROM dedup_mapping map
      JOIN messages disc ON disc.id = map.discarded_id
      WHERE m.id = map.kept_id 
        AND (m.reactions_json IS NULL AND disc.reactions_json IS NOT NULL 
             OR m.image_url IS NULL AND disc.image_url IS NOT NULL);
    `);
    console.log(`   -> Đã hợp nhất thuộc tính cho ${updateRes.rowCount || 0} tin nhắn.`);

    // BƯỚC 3: Cập nhật khóa ngoại trong bảng attachments trỏ về message_id giữ lại
    console.log(`\n📎 [3/5] Chuyển hướng các attachments từ tin nhắn cũ sang tin nhắn giữ lại...`);
    const attRes = await knex.raw(`
      UPDATE attachments a
      SET message_id = map.kept_id
      FROM dedup_mapping map
      WHERE a.message_id = map.discarded_id;
    `);
    console.log(`   -> Đã chuyển ${attRes.rowCount || 0} tệp đính kèm sang tin nhắn chuẩn.`);

    // BƯỚC 4: Xóa các tin nhắn trùng lặp theo từng batch 10.000 dòng
    console.log(`\n🗑️  [4/5] Đang xóa các bản ghi tin nhắn trùng lặp...`);
    let deletedTotal = 0;
    while (true) {
      const delBatch = await knex.raw(`
        WITH to_delete AS (
          SELECT discarded_id
          FROM dedup_mapping
          LIMIT 10000
        )
        DELETE FROM messages m
        USING to_delete td
        WHERE m.id = td.discarded_id
        RETURNING m.id;
      `);
      
      const count = delBatch.rowCount || 0;
      if (count === 0) break;

      await knex.raw(`
        DELETE FROM dedup_mapping dm
        WHERE dm.discarded_id = ANY(?::text[]);
      `, [delBatch.rows.map((r: any) => r.id)]);

      deletedTotal += count;
      process.stdout.write(`\r   -> Đã xóa: ${deletedTotal.toLocaleString()} / ${dupCount.toLocaleString()} tin nhắn trùng...`);
    }
    console.log(`\n   -> Hoàn thành xóa ${deletedTotal.toLocaleString()} tin nhắn thừa.`);

    // Xóa bảng tạm
    await knex.raw(`DROP TABLE IF EXISTS dedup_mapping;`);

    // BƯỚC 5: Tạo Partial Unique Index trên (account_id, provider_message_id) để chống trùng vĩnh viễn
    console.log(`\n🛡️  [5/5] Đang tạo Unique Index chống trùng lặp vĩnh viễn...`);
    await knex.raw(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_account_provider_msg_id 
      ON messages (account_id, provider_message_id) 
      WHERE provider_message_id IS NOT NULL AND provider_message_id <> '';
    `);
    console.log(`   -> Đã tạo thành công index duy nhất 'idx_messages_account_provider_msg_id'!`);

    console.log(`\n========================================================`);
    console.log(`🎉 QUÁ TRÌNH DỌN DẸP SO TRÙNG HOÀN TẤT THÀNH CÔNG!`);
    console.log(`========================================================`);
  } catch (err: any) {
    console.error(`❌ Lỗi dọn dẹp:`, err);
  } finally {
    await knex.destroy();
  }
}

main().catch(console.error);
