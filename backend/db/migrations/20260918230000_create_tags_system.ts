import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tags', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name').notNullable();
    t.string('color').notNullable().defaultTo('#1890ff');
    t.string('emoji').nullable();
    t.string('source').notNullable().defaultTo('system'); // 'zalo' | 'system' | 'ai'
    t.integer('zalo_label_id').nullable();
    t.string('account_id').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['account_id', 'source'], 'tags_account_source_idx');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX tags_account_zalo_label_uq
    ON tags (account_id, zalo_label_id)
    WHERE zalo_label_id IS NOT NULL
  `);

  await knex.schema.createTable('conversation_tags', (t) => {
    t.string('conversation_id').notNullable();
    t.uuid('tag_id').notNullable().references('id').inTable('tags').onDelete('CASCADE');
    t.string('assigned_by').notNullable().defaultTo('manual'); // 'manual' | 'bot' | 'zalo_sync'
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.primary(['conversation_id', 'tag_id']);
    t.index(['tag_id'], 'conv_tags_tag_idx');
    t.index(['conversation_id'], 'conv_tags_conv_idx');
  });

  await knex.schema.alterTable('conversations', (t) => {
    t.jsonb('labels_json').notNullable().defaultTo('[]');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('conversations', (t) => {
    t.dropColumn('labels_json');
  });
  await knex.schema.dropTableIfExists('conversation_tags');
  await knex.schema.dropTableIfExists('tags');
}
