import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS last_read_at TEXT NULL
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_messages_account_conversation_direction_time
    ON messages(account_id, conversation_id, direction, timestamp)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_messages_account_conversation_direction_time
  `);

  await knex.raw(`
    ALTER TABLE conversations
    DROP COLUMN IF EXISTS last_read_at
  `);
}
