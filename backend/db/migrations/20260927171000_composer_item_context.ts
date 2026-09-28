import type { Knex } from 'knex';
export async function up(db: Knex) {
  await db.schema.alterTable('composer_batch_items', t => { t.jsonb('send_context'); });
}
export async function down() { throw new Error('Immutable send context cannot be discarded safely.'); }
