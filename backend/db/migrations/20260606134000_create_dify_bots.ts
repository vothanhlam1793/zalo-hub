import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('dify_bots', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('account_id').notNullable();
    t.string('name').notNullable();
    t.string('dify_api_key').notNullable();
    t.string('dify_webhook_url').notNullable();
    t.boolean('enabled').notNullable().defaultTo(true);
    t.string('filter_mode').notNullable().defaultTo('all');
    t.jsonb('filter_keywords').defaultTo('[]');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.index(['account_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('dify_bots');
}
