import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasRestricted = await knex.schema.hasColumn('conversations', 'is_restricted');
  if (!hasRestricted) {
    await knex.schema.alterTable('conversations', (t) => {
      t.boolean('is_restricted').defaultTo(false).notNullable();
      t.text('restricted_by').nullable();
      t.timestamp('restricted_at', { useTz: true }).nullable();
    });
  }

  const hasUserTagPerms = await knex.schema.hasTable('user_tag_permissions');
  if (!hasUserTagPerms) {
    await knex.schema.createTable('user_tag_permissions', (t) => {
      t.text('user_id').notNullable().references('id').inTable('system_users').onDelete('CASCADE');
      t.text('account_id').notNullable().references('account_id').inTable('accounts').onDelete('CASCADE');
      t.text('tag_id').notNullable().references('id').inTable('tags').onDelete('CASCADE');
      t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      t.primary(['user_id', 'account_id', 'tag_id']);
    });
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_user_tag_perms_lookup ON user_tag_permissions(user_id, account_id)');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_tag_permissions');
  const hasRestricted = await knex.schema.hasColumn('conversations', 'is_restricted');
  if (hasRestricted) {
    await knex.schema.alterTable('conversations', (t) => {
      t.dropColumn('is_restricted');
      t.dropColumn('restricted_by');
      t.dropColumn('restricted_at');
    });
  }
}
