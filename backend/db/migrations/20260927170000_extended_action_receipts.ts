import type { Knex } from 'knex';
export async function up(db: Knex) {
  await db.schema.createTable('composer_actions', t => {
    t.string('account_id').notNullable(); t.uuid('id').notNullable();
    t.string('system_user_id').notNullable(); t.string('conversation_id').notNullable();
    t.string('payload_hash', 64).notNullable(); t.string('action').notNullable();
    t.string('status').notNullable(); t.jsonb('result');
    t.timestamp('created_at', { useTz: true }).defaultTo(db.fn.now());
    t.primary(['account_id', 'id']);
    t.index(['account_id', 'system_user_id', 'conversation_id', 'created_at']);
  });
}
export async function down() { throw new Error('Durable action identities must not be dropped automatically.'); }
