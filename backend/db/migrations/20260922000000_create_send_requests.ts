import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('send_requests', (t) => {
    t.string('account_id').notNullable();
    t.uuid('client_request_id').notNullable();
    t.string('system_user_id').notNullable();
    t.string('conversation_id').notNullable();
    t.string('payload_hash', 64).notNullable();
    t.string('status').notNullable();
    t.jsonb('provider_receipt_json').notNullable().defaultTo('{}');
    // Canonical snapshots retain references and permit local-only repair without resending.
    t.jsonb('message_refs_json').notNullable().defaultTo('[]');
    t.string('error_code').nullable();
    t.boolean('retryable').notNullable().defaultTo(false);
    t.integer('attempt_count').notNullable().defaultTo(1);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(['account_id', 'client_request_id']);
    t.index(['account_id', 'conversation_id']);
    t.index(['status']);
  });
  await knex.raw("ALTER TABLE send_requests ADD CONSTRAINT send_requests_status_check CHECK (status IN ('sending','sent','failed','unknown'))");
  await knex.raw("CREATE INDEX send_requests_provider_ids_idx ON send_requests USING gin ((provider_receipt_json->'providerMessageIds'))");
}

export async function down(): Promise<void> {
  throw new Error('send_requests contains durable idempotency keys; export and approve a retention/rollback plan before removal');
}
