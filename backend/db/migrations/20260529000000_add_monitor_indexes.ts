import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_messages_account_time_id
    ON messages(account_id, timestamp, id)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_messages_account_conv_time_id
    ON messages(account_id, conversation_id, timestamp, id)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_conversations_account_lastmsg
    ON conversations(account_id, last_message_timestamp DESC)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_zalo_memberships_user_id
    ON zalo_account_memberships(user_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_messages_account_time_id');
  await knex.raw('DROP INDEX IF EXISTS idx_messages_account_conv_time_id');
  await knex.raw('DROP INDEX IF EXISTS idx_conversations_account_lastmsg');
  await knex.raw('DROP INDEX IF EXISTS idx_zalo_memberships_user_id');
}
