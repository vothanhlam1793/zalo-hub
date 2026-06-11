import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('dify_bots', (t) => {
    t.jsonb('receive_groups').defaultTo('[]');
    t.jsonb('send_groups').defaultTo('[]');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('dify_bots', (t) => {
    t.dropColumn('receive_groups');
    t.dropColumn('send_groups');
  });
}
