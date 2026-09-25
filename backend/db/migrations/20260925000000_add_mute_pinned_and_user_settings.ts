import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasMuted = await knex.schema.hasColumn('conversations', 'is_muted');
  if (!hasMuted) {
    await knex.schema.alterTable('conversations', (t) => {
      t.boolean('is_muted').defaultTo(false);
      t.bigInteger('mute_until').nullable();
      t.boolean('is_pinned').defaultTo(false);
    });
  }

  const hasUserSettings = await knex.schema.hasTable('user_settings');
  if (!hasUserSettings) {
    await knex.schema.createTable('user_settings', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.text('user_id').notNullable().unique().references('id').inTable('system_users').onDelete('CASCADE');
      t.boolean('desktop_notification').defaultTo(true);
      t.boolean('sound_enabled').defaultTo(true);
      t.integer('sound_volume').defaultTo(80);
      t.boolean('notify_group_messages').defaultTo(true);
      t.boolean('show_message_preview').defaultTo(true);
      t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  }

  const hasLabelVersion = await knex.schema.hasColumn('accounts', 'zalo_label_version');
  if (!hasLabelVersion) {
    await knex.schema.alterTable('accounts', (t) => {
      t.integer('zalo_label_version').defaultTo(0);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_settings');
  const hasMuted = await knex.schema.hasColumn('conversations', 'is_muted');
  if (hasMuted) {
    await knex.schema.alterTable('conversations', (t) => {
      t.dropColumn('is_muted');
      t.dropColumn('mute_until');
      t.dropColumn('is_pinned');
    });
  }
  const hasLabelVersion = await knex.schema.hasColumn('accounts', 'zalo_label_version');
  if (hasLabelVersion) {
    await knex.schema.alterTable('accounts', (t) => {
      t.dropColumn('zalo_label_version');
    });
  }
}
