import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('conversations', (t) => {
    t.text('notes').nullable();
    t.string('notes_updated_by').nullable();
    t.timestamp('notes_updated_at', { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('conversations', (t) => {
    t.dropColumn('notes');
    t.dropColumn('notes_updated_by');
    t.dropColumn('notes_updated_at');
  });
}
