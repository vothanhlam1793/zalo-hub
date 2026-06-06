import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('dify_bots', (t) => {
    t.string('dify_api_key').nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  // First update any NULL values to a placeholder before making NOT NULL
  await knex('dify_bots')
    .whereNull('dify_api_key')
    .update({ dify_api_key: '' });

  await knex.schema.alterTable('dify_bots', (t) => {
    t.string('dify_api_key').notNullable().alter();
  });
}
