import { createHash } from 'node:crypto';
import type { GoldLogger } from '../../core/logger.js';
import type { SendReceipt } from '../../core/types.js';
import type { SendRequestRepository, SendRequestRow } from '../../core/store/send-request-repo.js';
import { SendFailure, type SendExecution, type SendLifecycle } from '../../core/runtime/send-contract.js';

export interface SendInput {
  accountId: string;
  systemUserId: string;
  conversationId: unknown;
  text?: unknown;
  clientRequestId?: unknown;
  retry?: unknown;
  attachment?: { fileBuffer: Buffer; fileName: string; mimeType: string };
}
export interface NormalizedSend {
  accountId: string; systemUserId: string; conversationId: string; text: string;
  clientRequestId?: string; retry: boolean; attachment?: SendInput['attachment']; payloadHash: string;
}
export interface SendResponse { status: number; body: { method?: string; result?: unknown; kind?: string; receipt?: SendReceipt; error?: string } }

export class SendRequestError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

export function validateRequestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new SendRequestError(400, 'INVALID_REQUEST_ID', 'clientRequestId phải là UUID.');
  }
  return value.toLowerCase();
}

export function normalizeSend(input: SendInput): NormalizedSend {
  if (!input.systemUserId) throw new SendRequestError(401, 'UNAUTHENTICATED', 'Yêu cầu xác thực.');
  if (typeof input.conversationId !== 'string') throw new SendRequestError(400, 'INVALID_TARGET', 'conversationId không hợp lệ.');
  const conversationId = input.conversationId.trim();
  const clientRequestId = input.clientRequestId === undefined ? undefined : validateRequestId(input.clientRequestId);
  if (!conversationId || conversationId.length > 255 || (clientRequestId && !/^(direct|group):[^\s:]+$/.test(conversationId))) {
    throw new SendRequestError(400, 'INVALID_TARGET', 'conversationId phải có dạng direct:<id> hoặc group:<id>.');
  }
  if (input.text !== undefined && typeof input.text !== 'string') throw new SendRequestError(400, 'INVALID_TEXT', 'Nội dung không hợp lệ.');
  const text = (input.text as string | undefined)?.trim() ?? '';
  if (text.length > 20000 || (!text && !input.attachment)) throw new SendRequestError(400, 'INVALID_TEXT', 'Nội dung trống hoặc quá dài.');
  if (![undefined, false, true, 'false', 'true'].includes(input.retry as any)) throw new SendRequestError(400, 'INVALID_RETRY', 'retry phải là boolean.');
  const retry = input.retry === true || input.retry === 'true';
  if (retry && !clientRequestId) throw new SendRequestError(400, 'INVALID_RETRY', 'Retry cần clientRequestId ban đầu.');
  const attachment = input.attachment;
  if (attachment && (!Buffer.isBuffer(attachment.fileBuffer) || !attachment.fileBuffer.length
    || attachment.fileBuffer.length > 50 * 1024 * 1024 || !attachment.fileName.trim()
    || attachment.fileName.length > 255 || !attachment.mimeType.trim() || attachment.mimeType.length > 255)) {
    throw new SendRequestError(400, 'INVALID_ATTACHMENT', 'File không hợp lệ (tối đa 50 MB).');
  }
  const normalizedAttachment = attachment ? { ...attachment, fileName: attachment.fileName.trim(), mimeType: attachment.mimeType.trim() } : undefined;
  const payloadHash = createHash('sha256').update(JSON.stringify({ conversationId, text,
    attachment: normalizedAttachment ? { fileName: normalizedAttachment.fileName, mimeType: normalizedAttachment.mimeType,
      size: normalizedAttachment.fileBuffer.length, digest: createHash('sha256').update(normalizedAttachment.fileBuffer).digest('hex') } : null,
  })).digest('hex');
  return { accountId: input.accountId, systemUserId: input.systemUserId, conversationId, text, clientRequestId, retry,
    attachment: normalizedAttachment, payloadHash };
}

const errorMessages: Record<string, string> = {
  SESSION_UNAVAILABLE: 'Phiên Zalo chưa sẵn sàng. Hãy kết nối lại rồi thử lại.',
  PRE_DISPATCH_FAILED: 'Chưa gửi tới Zalo. Kiểm tra phiên kết nối rồi thử lại.',
  PROVIDER_REJECTED: 'Zalo từ chối tin nhắn.',
  OUTCOME_UNKNOWN: 'Chưa xác nhận kết quả từ Zalo. Kiểm tra trạng thái; không gửi lại tự động.',
  PROCESS_RESTARTED: 'Máy chủ đã khởi động lại khi đang gửi. Kết quả chưa xác nhận.',
  LOCAL_PERSISTENCE_FAILED: 'Zalo đã chấp nhận; dữ liệu cục bộ chưa lưu đầy đủ. Không gửi lại.',
};

function receipt(row: SendRequestRow): SendReceipt {
  return { clientRequestId: row.client_request_id, accountId: row.account_id, conversationId: row.conversation_id,
    status: row.status, messages: row.message_refs_json, providerMessageIds: row.provider_receipt_json.providerMessageIds ?? [],
    acceptedAt: row.provider_receipt_json.acceptedAt,
    ...(row.error_code ? { error: { code: row.error_code, message: errorMessages[row.error_code] ?? 'Không thể hoàn tất yêu cầu.', retryable: row.retryable } } : {}) };
}
function response(row: SendRequestRow, result?: SendExecution): SendResponse {
  const r = receipt(row);
  return { status: row.status === 'sent' ? 200 : row.status === 'failed' ? (row.error_code === 'PROVIDER_REJECTED' ? 422 : 409) : 202,
    body: { method: result?.method ?? row.provider_receipt_json.method, result: result?.result ?? row.provider_receipt_json.result,
      ...(result?.kind || row.provider_receipt_json.kind ? { kind: result?.kind ?? row.provider_receipt_json.kind } : {}),
      receipt: r, ...(r.error && r.status !== 'sent' ? { error: r.error.message } : {}) } };
}

export class SendRequestService {
  // Held until dispatch AND local persistence settle, not merely until HTTP times out.
  private readonly persisting = new Set<string>();
  private readonly repairing = new Set<string>();
  constructor(private readonly repo: SendRequestRepository, private readonly logger: Pick<GoldLogger, 'info' | 'error'>,
    private readonly timeouts = { text: 30_000, attachment: 120_000 }) {}

  async get(accountId: string, requestId: unknown, userId: string, privileged: boolean): Promise<SendReceipt> {
    const row = await this.repo.get(accountId, validateRequestId(requestId));
    if (!row) throw new SendRequestError(404, 'NOT_FOUND', 'Không tìm thấy yêu cầu gửi.');
    if (row.system_user_id !== userId && !privileged) throw new SendRequestError(403, 'FORBIDDEN', 'Không có quyền xem yêu cầu gửi này.');
    this.repair(row);
    return receipt(row);
  }

  private repair(row: SendRequestRow) {
    const key = JSON.stringify([row.account_id, row.client_request_id, row.attempt_count]);
    if (row.status !== 'sent' || row.provider_receipt_json.localPersistence === 'pending'
      || this.persisting.has(key) || this.repairing.has(key) || !this.repo.repairLocal) return;
    this.repairing.add(key);
    void this.repo.repairLocal(row).catch(() => {
      this.logger.error('send_request_local_repair_failed', { accountId: row.account_id, clientRequestId: row.client_request_id });
    }).finally(() => this.repairing.delete(key));
  }

  async send(input: SendInput, dispatch: (input: NormalizedSend, lifecycle: SendLifecycle) => Promise<SendExecution>): Promise<SendResponse> {
    const normalized = normalizeSend(input);
    if (!normalized.clientRequestId) {
      // Legacy callers retain method/result/kind and no idempotency claim.
      const execution = await dispatch(normalized, {});
      return { status: 200, body: { method: execution.method, result: execution.result, ...(execution.kind ? { kind: execution.kind } : {}) } };
    }
    let row: SendRequestRow = { account_id: normalized.accountId, client_request_id: normalized.clientRequestId,
      system_user_id: normalized.systemUserId, conversation_id: normalized.conversationId, payload_hash: normalized.payloadHash,
      status: 'sending', provider_receipt_json: {}, message_refs_json: [], error_code: null, retryable: false, attempt_count: 1 };
    let existing: SendRequestRow | undefined;
    if (normalized.retry) {
      existing = await this.repo.get(row.account_id, row.client_request_id);
      if (!existing) throw new SendRequestError(404, 'NOT_FOUND', 'Không tìm thấy yêu cầu gốc để thử lại. Giữ nguyên clientRequestId và kiểm tra trạng thái.');
    } else if (!await this.repo.claim(row)) {
      existing = await this.repo.get(row.account_id, row.client_request_id);
      if (!existing) throw new SendRequestError(503, 'REGISTRY_UNAVAILABLE', 'Không thể đọc trạng thái yêu cầu.');
    }
    if (existing) {
      if (existing.system_user_id !== row.system_user_id) throw new SendRequestError(403, 'FORBIDDEN', 'Yêu cầu thuộc người dùng khác.');
      if (existing.payload_hash !== row.payload_hash || existing.conversation_id !== row.conversation_id) {
        throw new SendRequestError(409, 'REQUEST_CONFLICT', 'clientRequestId đã được dùng cho nội dung khác.');
      }
      row = existing;
      if (!(normalized.retry && row.status === 'failed' && row.retryable)) { this.repair(row); return response(row); }
      if (!await this.repo.retry(row)) return response((await this.repo.get(row.account_id, row.client_request_id))!);
      row = { ...row, status: 'sending', attempt_count: row.attempt_count + 1, retryable: false, error_code: null };
    }
    const started = Date.now();
    const persistenceKey = JSON.stringify([row.account_id, row.client_request_id, row.attempt_count]);
    this.persisting.add(persistenceKey);
    let dispatched = false;
    let expired = false;
    const save = async (patch: Partial<SendRequestRow>) => {
      // Update in-memory evidence first: a DB outage must not erase known remote acceptance.
      Object.assign(row, patch);
      await this.repo.update(row, patch);
    };
    const acceptance = async (execution: SendExecution, settled = false) => {
      await save({ status: 'sent', retryable: false, error_code: execution.localPersistenceFailed ? 'LOCAL_PERSISTENCE_FAILED' : null,
        provider_receipt_json: { method: execution.method, kind: execution.kind,
          // Durable replay stores only the documented receipt fields, never arbitrary SDK data.
          result: { message: execution.messages.find((m) => m.kind === 'text')?.providerMessageId
            ? { msgId: execution.messages.find((m) => m.kind === 'text')!.providerMessageId } : null,
          attachment: execution.messages.filter((m) => m.kind !== 'text').map((m) => ({ msgId: m.providerMessageId })) },
          providerMessageIds: execution.providerMessageIds, acceptedAt: execution.acceptedAt,
          localPersistence: settled ? (execution.localPersistenceFailed ? 'failed' : 'complete') : 'pending' },
        message_refs_json: execution.messages.map(({ rawMessageJson: _raw, ...message }) => ({ ...message, attachments: message.attachments.map(({ localPath: _p, thumbnailLocalPath: _t, ...a }) => a) })),
      });
    };
    const finish = (async () => {
      try {
        const execution = await dispatch(normalized, { clientRequestId: row.client_request_id,
          onDispatch: () => { if (expired) throw new SendFailure('PRE_DISPATCH_FAILED', errorMessages.PRE_DISPATCH_FAILED, true, 409); dispatched = true; },
          onAccepted: acceptance });
        if (execution.status === 'sent') await acceptance(execution, true);
        else if (row.status !== 'sent') await save({ status: 'unknown', error_code: 'OUTCOME_UNKNOWN', retryable: false,
          provider_receipt_json: { method: execution.method, kind: execution.kind, providerMessageIds: execution.providerMessageIds },
          message_refs_json: execution.messages.map(({ rawMessageJson: _raw, ...m }) => m) });
        return response(row, execution);
      } catch (error) {
        if (row.status === 'sent') {
          row.error_code = 'LOCAL_PERSISTENCE_FAILED'; row.retryable = false;
          row.provider_receipt_json = { ...row.provider_receipt_json, localPersistence: 'failed' };
          await this.repo.update(row, { status: 'sent', error_code: row.error_code, retryable: false,
            provider_receipt_json: row.provider_receipt_json, message_refs_json: row.message_refs_json }).catch(() => {
            this.logger.error('send_acceptance_checkpoint_failed', { accountId: row.account_id, clientRequestId: row.client_request_id });
          });
        } else {
          const definite = !dispatched || error instanceof SendFailure;
          const patch: Partial<SendRequestRow> = { status: definite ? 'failed' : 'unknown',
            error_code: error instanceof SendFailure ? error.code : definite ? 'PRE_DISPATCH_FAILED' : 'OUTCOME_UNKNOWN',
            retryable: definite && (error instanceof SendFailure ? error.retryable : true) };
          await save(patch).catch(() => { row.status = 'unknown'; row.retryable = false; row.error_code = 'OUTCOME_UNKNOWN'; });
        }
        return response(row);
      } finally {
        this.persisting.delete(persistenceKey);
        // Repair only after the original append is finished; use the final enriched checkpoint.
        this.repair(row);
        this.logger.info('send_request_completed', { accountId: row.account_id, clientRequestId: row.client_request_id,
          attempt: row.attempt_count, status: row.status, durationMs: Date.now() - started });
      }
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<SendResponse>((resolve) => {
      timer = setTimeout(() => {
        expired = true;
        void (async () => {
          if (row.status !== 'sent') {
            await save({ status: dispatched ? 'unknown' : 'failed', error_code: dispatched ? 'OUTCOME_UNKNOWN' : 'PRE_DISPATCH_FAILED',
              retryable: !dispatched }).catch(() => { row.status = 'unknown'; row.retryable = false; });
          }
          resolve(response(row));
        })();
       }, normalized.attachment ? this.timeouts.attachment : this.timeouts.text);
      timer.unref?.();
    });
    try { return await Promise.race([finish, timeout]); }
    finally { if (timer) clearTimeout(timer); }
  }
}
