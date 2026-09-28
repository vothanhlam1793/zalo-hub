import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn('conversations', 'last_message_sender_name');
  if (!hasCol) {
    await knex.schema.alterTable('conversations', (t) => {
      t.text('last_message_sender_name').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn('conversations', 'last_message_sender_name');
  if (hasCol) {
    await knex.schema.alterTable('conversations', (t) => {
      t.dropColumn('last_message_sender_name');
    });
  }
}
