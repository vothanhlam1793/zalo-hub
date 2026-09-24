import { api, ApiError, SEND_TIMEOUT_MS } from '../../../api';
import type { Message, SendReceipt } from '../../../types';
import { useChatStore } from '../../../stores/chat-store';
import { useComposerStore } from '../../../stores/composer-store';
import { chatSession, parseConversationKey } from './chat-session';
import { canRetry, canReleasePreview } from './message-reconciliation';
import { ManualSendQueue } from './manual-send-queue';

type Intent = { key: string; localId: string; requestId: string; text: string; file?: File; preview?: string; session: ReturnType<typeof chatSession.capture> };
const intents = new Map<string, Intent>();
const attempts = new Map<string, number>();
const controllers = new Set<AbortController>();
const polling = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const rows = (key: string) => useChatStore.getState().byConversation[key]?.messages || [];
const queue = new ManualSendQueue((key) => rows(key).some((m) => m.delivery === 'unknown' || m.delivery === 'sending'));
const patch = (intent: Intent, data: Partial<Message>) => {
  if (chatSession.valid(intent.session)) useChatStore.getState().patchMessage(intent.key, intent.localId, data);
};

function accept(key: string, requestId: string, receipt: SendReceipt) {
  if (receipt.clientRequestId !== requestId) return;
  useChatStore.getState().receiptForKey(key, receipt);
  void queue.resume(key);
}

export async function querySendStatus(key: string, requestId: string): Promise<boolean> {
  const session = chatSession.capture();
  const [user, account] = parseConversationKey(key);
  if (user !== session.userId || !user) return false;
  const attempt = attempts.get(requestId) || 0;
  const controller = new AbortController();
  controllers.add(controller);
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const result = await api.sendRequest(account, requestId, controller.signal, session);
    if (chatSession.valid(session) && (attempt === (attempts.get(requestId) || 0) || result.receipt.status === 'sent')) accept(key, requestId, result.receipt);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      if (chatSession.valid(session)) {
        const target = rows(key).find((m) => m.clientRequestId === requestId);
        if (target && target.delivery !== 'sent') {
          useChatStore.getState().patchMessage(key, target.localId || target.id, {
            delivery: 'failed',
            retryable: true,
            errorCode: 'NOT_FOUND_ON_SERVER',
            errorText: 'Tin nhắn chưa được ghi nhận trên máy chủ.',
          });
          void queue.resume(key);
        }
      }
      return false;
    }
    return !(error instanceof ApiError && [400, 401, 403].includes(error.status));
  } finally { clearTimeout(timeout); controllers.delete(controller); }
}

function poll(key: string, requestId: string) {
  const id = JSON.stringify([key, requestId]);
  if (polling.has(id)) return;
  polling.add(id);
  const session = chatSession.capture();
  const deadline = Date.now() + 30_000;
  const tick = async () => {
    if (!chatSession.valid(session)) { polling.delete(id); return; }
    const retry = await querySendStatus(key, requestId);
    const unresolved = rows(key).some((m) => m.clientRequestId === requestId && (m.delivery === 'unknown' || m.delivery === 'sending'));
    if (retry && unresolved && Date.now() < deadline && chatSession.valid(session)) timers.set(id, setTimeout(tick, 2_000));
    else { polling.delete(id); timers.delete(id); }
  };
  timers.set(id, setTimeout(tick, 2_000));
}

async function dispatch(intent: Intent, retry = false) {
  if (!chatSession.valid(intent.session)) return;
  attempts.set(intent.requestId, (attempts.get(intent.requestId) || 0) + 1);
  const [, account, conversation] = parseConversationKey(intent.key);
  patch(intent, { delivery: 'sending', errorText: undefined, errorCode: undefined, retryable: false });
  const controller = new AbortController();
  controllers.add(controller);
  const timeout = setTimeout(() => controller.abort(), intent.file ? SEND_TIMEOUT_MS.attachment : SEND_TIMEOUT_MS.text);
  try {
    const params = { clientRequestId: intent.requestId, retry };
    const result = intent.file
      ? await api.accountSendAttachment(account, conversation, intent.file, intent.text, params, controller.signal, intent.session)
      : await api.accountSendText(account, conversation, intent.text, params, controller.signal, intent.session);
    if (!chatSession.valid(intent.session)) return;
    if (result.receipt) accept(intent.key, intent.requestId, result.receipt);
    else patch(intent, { delivery: 'unknown', errorText: 'Chưa nhận được xác nhận từ máy chủ.' });
  } catch (error) {
    if (!chatSession.valid(intent.session)) return;
    if (error instanceof ApiError && error.receipt) accept(intent.key, intent.requestId, error.receipt);
    else if (error instanceof ApiError && [400, 401, 403, 404, 413, 415, 422].includes(error.status)) {
      patch(intent, { delivery: 'failed', retryable: error.status === 404, errorCode: error.code || String(error.status), errorText: error.message });
      void queue.resume(intent.key);
    } else patch(intent, { delivery: 'unknown', retryable: false, errorText: 'Chưa xác nhận kết quả gửi. Hãy kiểm tra trạng thái.' });
  } finally {
    clearTimeout(timeout);
    controllers.delete(controller);
  }
  if (chatSession.valid(intent.session) && rows(intent.key).some((m) => m.clientRequestId === intent.requestId && (m.delivery === 'sending' || m.delivery === 'unknown'))) poll(intent.key, intent.requestId);
}

export function submitMessage(key: string, text: string, file?: File): Message | undefined {
  const session = chatSession.capture();
  if (!chatSession.valid(session) || parseConversationKey(key)[0] !== session.userId || (!text.trim() && !file)) return;
  const [, account, conversation] = parseConversationKey(key);
  const requestId = crypto.randomUUID();
  const localId = `pending-${requestId}`;
  const preview = file ? URL.createObjectURL(file) : undefined;
  const kind = file ? file.type.startsWith('image/') ? 'image' : 'file' : 'text';
  const message: Message = {
    id: localId, localId, clientRequestId: requestId, delivery: 'queued',
    conversationId: conversation, conversationType: conversation.startsWith('group:') ? 'group' : 'direct',
    threadId: conversation.slice(conversation.indexOf(':') + 1),
    text, kind, direction: 'outgoing', isSelf: true, timestamp: new Date().toISOString(),
    localFile: file ? { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified } : undefined,
    attachments: file ? [{ id: localId, type: kind, url: preview, fileName: file.name, mimeType: file.type, size: file.size }] : [],
  };
  const intent: Intent = { key, localId, requestId, text, file, preview, session };
  intents.set(requestId, intent);
  // The authoritative pending commit happens synchronously, before any dispatch.
  useChatStore.getState().mergeForKey(key, [message]);
  useChatStore.getState().updateConversationSummaryLocal(account, message);
  useComposerStore.getState().updateDraft(key, { text: '', attachFile: null, missingFileName: undefined });
  queue.enqueue(key, requestId, () => dispatch(intent));
  return message;
}

export function cancelQueued(key: string, message: Message) {
  if (!message.clientRequestId) return;
  const current = rows(key).find((m) => (m.localId || m.id) === (message.localId || message.id));
  if (!current || current.delivery === 'sent') return;
  queue.cancel(key, message.clientRequestId);
  const intent = intents.get(message.clientRequestId);
  if (intent?.preview) URL.revokeObjectURL(intent.preview);
  intents.delete(message.clientRequestId);
  useChatStore.getState().removeMessage(key, message.localId || message.id);
  void queue.resume(key);
}

export function retryMessage(key: string, message: Message, reselected?: File) {
  if (!canRetry(message)) return;
  const current = rows(key).find((m) => m.localId === message.localId);
  if (!current || !canRetry(current)) return;
  const requestId = message.clientRequestId!;
  let intent = intents.get(requestId);
  if (!intent) {
    if (message.localFile) {
      const meta = message.localFile;
      if (!reselected || reselected.name !== meta.name || reselected.size !== meta.size || reselected.type !== meta.type) {
        useChatStore.getState().patchMessage(key, message.localId || message.id, { errorText: 'Chọn lại đúng tệp gốc để thử lại cùng yêu cầu.', attachmentNeedsReselect: true });
        return;
      }
    }
    intent = { key, requestId, localId: message.localId || message.id, text: message.text, file: reselected, session: chatSession.capture() };
    intents.set(requestId, intent);
  }
  patch(intent, { delivery: 'queued', attachmentNeedsReselect: false });
  const captured = intent;
  const isRetry = message.errorCode !== 'NOT_FOUND_ON_SERVER';
  queue.enqueue(key, requestId, () => dispatch(captured, isRetry));
}

export function restoreDraft(key: string, message: Message) {
  const current = rows(key).find((m) => (m.localId || m.id) === (message.localId || message.id));
  if (message.delivery !== 'failed' || current?.delivery !== 'failed') return;
  const composer = useComposerStore.getState();
  const existing = composer.drafts[key];
  // Never replace a newer draft with an earlier failed send.
  if (existing?.text || existing?.attachFile) {
    if (composer.activeKey === key) composer.setStatusMsg('Bản nháp hiện tại chưa trống. Hãy lưu hoặc gửi trước khi khôi phục.');
    return;
  }
  composer.updateDraft(key, { text: message.text, attachFile: intents.get(message.clientRequestId || '')?.file || null,
    missingFileName: message.localFile?.name });
}

export function recheckUnresolved() {
  for (const [key, entry] of Object.entries(useChatStore.getState().byConversation)) {
    for (const m of entry.messages) if (m.clientRequestId && (m.delivery === 'sending' || m.delivery === 'unknown')) {
      void querySendStatus(key, m.clientRequestId);
      poll(key, m.clientRequestId);
    }
    void queue.resume(key);
  }
}

// Reconciliation may arrive over WS before the POST completes. Release only
// replaced previews; keep missing canonical media and file bytes within this tab.
useChatStore.subscribe((state) => {
  for (const intent of intents.values()) {
    const messages = state.byConversation[intent.key]?.messages || [];
    const own = messages.filter((m) => m.clientRequestId === intent.requestId);
    if (intent.preview && canReleasePreview(own, intent.localId, intent.preview)) {
      URL.revokeObjectURL(intent.preview); intent.preview = undefined; intent.file = undefined;
    }
    if (!intent.preview && own.length && own.every((m) => m.delivery === 'sent')) intents.delete(intent.requestId);
    void queue.resume(intent.key);
  }
});
chatSession.subscribe(() => {
  queue.clear();
  controllers.forEach((controller) => controller.abort()); controllers.clear();
  timers.forEach(clearTimeout); timers.clear(); polling.clear();
  intents.forEach((intent) => { if (intent.preview) URL.revokeObjectURL(intent.preview); }); intents.clear();
  attempts.clear();
});
