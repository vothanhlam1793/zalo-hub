import type { Knex } from 'knex';
import { SendRequestError } from './send-request-service.js';
export async function lockConversation(db: Knex.Transaction, account: string, conversation: string) {
  await db.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`composer-dispatch:${account}:${conversation}`]);
}
/** Call under lockConversation, in the same transaction as the reservation. Scope is account/conversation, not user. */
export async function assertConversationClear(db: Knex.Transaction, account: string, conversation: string, ownSend?: string, ownBatch?: string) {
  // Auto-expire requests stuck in sending/unknown older than 60 seconds so conversations never stay blocked indefinitely.
  await db('send_requests')
    .where({ account_id: account, conversation_id: conversation })
    .whereIn('status', ['sending', 'unknown'])
    .where('updated_at', '<', db.raw("NOW() - INTERVAL '60 seconds'"))
    .update({
      status: 'failed',
      error_code: 'BARRIER_TIMEOUT_EXPIRED',
      updated_at: db.fn.now()
    });

  const sends = db('send_requests').where({ account_id: account, conversation_id: conversation }).whereIn('status', ['sending', 'unknown']);
  if (ownSend) sends.whereNot('client_request_id', ownSend);
  const actions = db('composer_actions').where({ account_id: account, conversation_id: conversation }).whereIn('status', ['pending', 'unknown']);
  const batches = db('composer_batch_items as i').join('composer_batches as b', function () {
    this.on('b.account_id', '=', 'i.account_id').andOn('b.client_batch_id', '=', 'i.client_batch_id');
  }).leftJoin('send_requests as s', function () {
    this.on('s.account_id', '=', 'i.account_id').andOn('s.client_request_id', '=', 'i.client_request_id');
  }).where({ 'b.account_id': account, 'b.conversation_id': conversation })
    .where(function () { this.whereIn('s.status', ['sending', 'unknown']).orWhere(function () { this.whereNull('s.client_request_id').whereNull('i.error_code'); }); });
  if (ownBatch) batches.whereNot('b.client_batch_id', ownBatch);
  if (await sends.first() || await actions.first() || await batches.first()) throw new SendRequestError(409, 'CONVERSATION_UNRESOLVED', 'Resolve the earlier conversation operation before sending.');
}
