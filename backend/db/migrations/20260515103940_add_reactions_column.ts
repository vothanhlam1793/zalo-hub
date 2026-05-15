import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS reactions_json JSONB NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE messages
    DROP COLUMN IF EXISTS reactions_json
  `);
}
