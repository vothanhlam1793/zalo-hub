import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('case_station_webhook_outbox', (t) => {
    t.bigIncrements('id');
    t.uuid('event_id').notNullable().unique();
    t.uuid('delivery_id').notNullable().unique();
    t.string('account_id').notNullable();
    t.string('conversation_id').notNullable();
    t.string('source_message_id').notNullable();
    t.string('event_type').notNullable();
    t.text('payload').notNullable();
    t.string('status').notNullable().defaultTo('pending');
    t.integer('attempt_count').notNullable().defaultTo(0);
    t.timestamp('available_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('locked_at', { useTz: true }).nullable();
    t.timestamp('delivered_at', { useTz: true }).nullable();
    t.timestamp('permanent_failed_at', { useTz: true }).nullable();
    t.integer('last_http_status').nullable();
    t.text('last_error').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['status', 'available_at'], 'case_station_outbox_due_idx');
    t.index(['account_id', 'conversation_id', 'id'], 'case_station_outbox_stream_idx');
  });

  await knex.raw(`
    ALTER TABLE case_station_webhook_outbox
    ADD CONSTRAINT case_station_webhook_outbox_status_check
    CHECK (status IN ('pending', 'processing', 'delivered', 'failed_permanent'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('case_station_webhook_outbox');
}
