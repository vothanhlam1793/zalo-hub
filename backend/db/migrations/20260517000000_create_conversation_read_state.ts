import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS conversation_read_state (
      account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL,
      last_read_at TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (account_id, conversation_id)
    )
  `);

  await knex.raw(`
    INSERT INTO conversation_read_state (account_id, conversation_id, last_read_at)
    SELECT account_id, id, last_read_at
    FROM conversations
    WHERE last_read_at IS NOT NULL
    ON CONFLICT (account_id, conversation_id) DO NOTHING
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_conversation_read_state_account
    ON conversation_read_state(account_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TABLE IF EXISTS conversation_read_state
  `);
}
