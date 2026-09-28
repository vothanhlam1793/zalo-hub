import type { SendRequestRepository, SendRequestRow } from '../src/core/store/send-request-repo.js';
import type { SendExecution, SendLifecycle } from '../src/core/runtime/send-contract.js';

export const requestId = '72ec7915-e9a9-4d95-a503-234f2fa15b1d';
export const input = { accountId: 'account-a', systemUserId: 'user-a', conversationId: 'direct:123', text: 'hello', clientRequestId: requestId };
export const logger = { info() {}, error() {} };
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

/** Controlled model of the repository's CAS semantics; NOT evidence of PostgreSQL isolation. */
export class FakeSendRepo implements SendRequestRepository {
  rows = new Map<string, SendRequestRow>();
  updates: Array<Partial<SendRequestRow>> = [];
  key(account: string, id: string) { return JSON.stringify([account, id]); }
  async claim(row: SendRequestRow) {
    const key = this.key(row.account_id, row.client_request_id);
    if (this.rows.has(key)) return false;
    this.rows.set(key, structuredClone(row)); return true;
  }
  async get(account: string, id: string) { return structuredClone(this.rows.get(this.key(account, id))); }
  async retry(row: SendRequestRow) {
    const current = this.rows.get(this.key(row.account_id, row.client_request_id));
    if (!current || current.status !== 'failed' || !current.retryable || current.attempt_count !== row.attempt_count) return false;
    Object.assign(current, { status: 'sending', retryable: false, error_code: null, attempt_count: row.attempt_count + 1 }); return true;
  }
  async update(row: SendRequestRow, patch: Partial<SendRequestRow>) {
    this.updates.push(structuredClone(patch));
    const current = this.rows.get(this.key(row.account_id, row.client_request_id));
    if (!current || current.attempt_count !== row.attempt_count) return;
    if (!(patch.status === 'sent' ? ['sending', 'unknown', 'sent'] : ['sending', 'unknown']).includes(current.status)) return;
    Object.assign(current, structuredClone(patch));
  }
  async recoverAbandoned() {
    let count = 0;
    for (const row of this.rows.values()) if (row.status === 'sending') {
      Object.assign(row, { status: 'unknown', error_code: 'PROCESS_RESTARTED', retryable: false }); count++;
    } else if (row.status === 'sent' && row.provider_receipt_json.localPersistence === 'pending') {
      row.provider_receipt_json.localPersistence = 'interrupted';
      row.error_code = 'LOCAL_PERSISTENCE_FAILED'; row.retryable = false; count++;
    }
    return count;
  }
}

export function execution(id = '101'): SendExecution {
  return { method: 'sendMessage', result: { message: { msgId: Number(id) }, attachment: [] },
    status: 'sent', providerMessageIds: [id], acceptedAt: '2026-09-22T01:00:00.000Z', messages: [{
      id: `account-a::${id}`, providerMessageId: id, clientRequestId: requestId, conversationId: 'direct:123',
      threadId: '123', conversationType: 'direct', text: 'hello', kind: 'text', attachments: [],
      direction: 'outgoing', isSelf: true, timestamp: '2026-09-22T01:00:00.000Z',
    }] };
}
export async function accept(lifecycle: SendLifecycle, result = execution()) {
  lifecycle.onDispatch?.(); await lifecycle.onAccepted?.(result); return result;
}
