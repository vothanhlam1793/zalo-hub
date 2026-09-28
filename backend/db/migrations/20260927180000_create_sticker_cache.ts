import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('sticker_cache', (t) => {
    t.integer('sticker_id').primary();
    t.integer('category_id').nullable();
    t.text('local_url').nullable();
    t.text('remote_url').nullable();
    t.string('mime_type', 64).nullable();
    t.integer('width').nullable();
    t.integer('height').nullable();
    t.string('status', 32).notNullable().defaultTo('ready');
    t.timestamp('created_at', { useTz: true }).defaultTo(db.fn.now());
    t.timestamp('updated_at', { useTz: true }).defaultTo(db.fn.now());

    t.index(['category_id']);
    t.index(['status']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('sticker_cache');
}
