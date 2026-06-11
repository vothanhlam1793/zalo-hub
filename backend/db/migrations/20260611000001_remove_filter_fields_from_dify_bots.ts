import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('dify_bots', (t) => {
    t.dropColumn('filter_mode');
    t.dropColumn('filter_keywords');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('dify_bots', (t) => {
    t.string('filter_mode').defaultTo('all');
    t.jsonb('filter_keywords').defaultTo('[]');
  });
}
