import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('composer_staging', t => {
    t.uuid('id').primary();
    t.string('account_id').notNullable(); t.string('system_user_id').notNullable(); t.string('conversation_id').notNullable();
    t.string('object_key').notNullable().unique(); t.string('file_name').notNullable(); t.string('mime_type').notNullable();
    t.bigInteger('size').notNullable(); t.string('sha256', 64).notNullable();
    t.string('status').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.index(['account_id', 'system_user_id', 'conversation_id', 'created_at']);
    t.index(['expires_at', 'status']);
  });
  await db.raw("ALTER TABLE composer_staging ADD CHECK (status IN ('uploading','ready','deleting','deleted')), ADD CHECK (size > 0 AND size <= 52428800)");
  await db.schema.createTable('composer_batches', t => {
    t.string('account_id').notNullable(); t.uuid('client_batch_id').notNullable();
    t.string('system_user_id').notNullable(); t.string('conversation_id').notNullable(); t.string('payload_hash', 64).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    t.primary(['account_id', 'client_batch_id']);
  });
  await db.schema.createTable('composer_batch_items', t => {
    t.string('account_id').notNullable(); t.uuid('client_batch_id').notNullable(); t.integer('position').notNullable();
    t.uuid('staging_id').notNullable().references('id').inTable('composer_staging');
    t.uuid('client_request_id').notNullable(); t.text('caption').notNullable(); t.string('error_code').nullable();
    t.primary(['account_id', 'client_batch_id', 'position']);
    t.unique(['account_id', 'client_request_id']); t.index(['staging_id']);
    t.foreign(['account_id', 'client_batch_id']).references(['account_id', 'client_batch_id']).inTable('composer_batches');
  });
}

export async function down(): Promise<void> {
  throw new Error('Composer tables retain idempotency keys and active object references. Approve retention/export before removal.');
}
