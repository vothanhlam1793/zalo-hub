import type { Knex } from 'knex';
import crypto from 'crypto';

export async function up(knex: Knex): Promise<void> {
  // Add bot_token column — used by Dify to authenticate when calling ZaloHub Bot API
  await knex.schema.alterTable('dify_bots', (t) => {
    t.string('bot_token', 64).nullable();
  });

  // Generate tokens for any existing bots that don't have one yet
  const bots = await knex('dify_bots').select('id').whereNull('bot_token');
  for (const bot of bots) {
    const token = 'zhb_' + crypto.randomBytes(24).toString('base64url');
    await knex('dify_bots').where({ id: bot.id }).update({ bot_token: token });
  }

  // Make it non-nullable + unique after backfill
  await knex.schema.alterTable('dify_bots', (t) => {
    t.string('bot_token', 64).notNullable().alter();
  });
  await knex.schema.alterTable('dify_bots', (t) => {
    t.unique(['bot_token']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('dify_bots', (t) => {
    t.dropUnique(['bot_token']);
    t.dropColumn('bot_token');
  });
}
