import { ApiError, composerRequest } from '../../../api';
import { ensureConversationRecovered, useComposerStore } from '../../../stores/composer-store';
import { actionRecovery } from './action-recovery';
import { conversationRecovery } from './conversation-recovery';
import { useChatStore } from '../../../stores/chat-store';
import { clientDb } from '../../../lib/client-db';
import { canReleasePreview } from './message-reconciliation';
import { chatSession, parseConversationKey } from './chat-session';
import { createLocalMediaPreview, revokeLocalMediaPreview } from './local-media-preview';
import { batchActions, freezeBatch, unresolvedBatch, type Batch, type ComposerCapabilities, type DraftAttachment, type Stage } from './composer-types';
import { sanitizeMentions } from './mention-utils';

const controllers = new Set<AbortController>();
const busy = new Set<string>();
const cancelled = new Set<string>();
const previews = new Map<string, string>();
const polls = new Map<string, ReturnType<typeof setTimeout>>();
const statusVersions = new Map<string, number>();
let activeUploads = 0;
const waiting: Array<() => void> = [];
const draft = (key: string) => useComposerStore.getState().drafts[key];
const update = (key: string, patch: Parameters<ReturnType<typeof useComposerStore.getState>['updateDraft']>[1]) => useComposerStore.getState().updateDraft(key, patch);
const entry = (key: string, id?: string) => id ? draft(key)?.outbox?.find(e => e.batch.payload.clientBatchId === id) : draft(key);
function updateBatch(key: string, id: string | undefined, batch: NonNullable<ReturnType<typeof draft>['batch']>) {
  if (id) update(key, { outbox: draft(key)?.outbox?.map(e => e.batch.payload.clientBatchId === id ? { ...e, batch } : e) });
  else update(key, { batch });
}
export async function archiveComposerBatch(key: string) {
  if (busy.has(key)) throw new Error('Đợi thao tác hiện tại hoàn tất.');
  const current = draft(key); if (!current?.batch) return;
  busy.add(key); const session = chatSession.capture();
  try {
    const statusKey = key + current.batch.payload.clientBatchId;
    statusVersions.set(statusKey, (statusVersions.get(statusKey) || 0) + 1);
    const outbox = [...(current.outbox || []), { batch: current.batch, attachments: current.attachments }];
    const saved = await clientDb.saveComposer(key, { version: 2, text: '', attachments: [], outbox, recoveredDrafts: current.recoveredDrafts });
    if (!chatSession.valid(session)) return;
    if (!saved) throw new Error('Không lưu được hộp gửi. Bản nháp vẫn được giữ nguyên.');
    if (draft(key)?.revision !== current.revision) {
      // Preserve edits racing the disk commit, without putting old IDs back in the draft.
      update(key, { batch: undefined, outbox });
      return;
    }
    update(key, { text: '', attachments: [], batch: undefined, outbox, attachFile: null, replyingTo: null, mentions: undefined });
  } finally { busy.delete(key); }
}
function attachment(key: string, id: string, patch: Partial<DraftAttachment>) {
  const current = draft(key); if (!current) return;
  update(key, { attachments: current.attachments.map(item => item.id === id ? { ...item, ...patch } : item) });
}
async function request<T>(key: string, path: string, options: RequestInit = {}, timeout = 30_000) {
  const session = chatSession.capture();
  const [user, account, conversation] = parseConversationKey(key);
  if (!chatSession.valid(session) || user !== session.userId) throw new Error('Phiên đăng nhập đã thay đổi.');
  const controller = new AbortController(); controllers.add(controller);
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await composerRequest<T>(account, conversation, path, { ...options, signal: controller.signal }, session); }
  finally { clearTimeout(timer); controllers.delete(controller); }
}
export const getComposerCapabilities = (key: string) => request<ComposerCapabilities>(key, '/capabilities');
export async function abandonComposerFailures(key: string, id?: string) {
  const batch = entry(key, id)?.batch;
  if (!batch?.result || busy.has(key)) return;
  busy.add(key);
  try {
    for (const item of batch.result.items.filter(i => i.status === 'failed')) {
      await request(key, `/staging/${item.stagingId}/abandon`, { method: 'POST' });
    }
  } finally { busy.delete(key); await queryComposerBatch(key, id); }
}
export function addComposerFiles(key: string, files: File[], capabilities: ComposerCapabilities) {
  const current = draft(key);
  if (current?.batch) throw new Error('Hoàn tất đợt gửi hiện tại trước khi thêm tệp.');
  const existing = current?.attachments || [];
  if (files.length + existing.length > Math.min(10, capabilities.maxBatchItems)) throw new Error(`Tối đa ${Math.min(10, capabilities.maxBatchItems)} tệp.`);
  if (files.some(file => file.size > Math.min(52428800, capabilities.maxFileBytes))) throw new Error('Tệp vượt giới hạn dung lượng (tối đa 50 MB).');
  update(key, { attachments: [...existing, ...files.map(file => ({ id: crypto.randomUUID(), file, name: file.name,
    size: file.size, type: file.type, lastModified: file.lastModified, caption: '', upload: 'local' as const }))] });
  // Automatically start background staging immediately without requiring user to click "Chuẩn bị tệp"
  void stageComposer(key).catch(() => {});
}
export async function removeComposerFile(key: string, id: string) {
  if (draft(key)?.batch) return;
  const item = draft(key)?.attachments.find(item => item.id === id);
  cancelled.add(id);
  update(key, { attachments: draft(key)?.attachments.filter(item => item.id !== id) || [] });
  // An in-flight upload may finish, but can never enter a send. Delete its returned stage below.
  if (item?.stage) await request(key, `/staging/${item.stage.id}`, { method: 'DELETE' }).catch(() => {});
}
export async function stageComposer(key: string) {
  if (busy.has(key) || draft(key)?.batch) return;
  const session = chatSession.capture(); busy.add(key);
  try {
    const caps = await getComposerCapabilities(key);
    if (!caps.staging || !caps.batch) throw new Error('Máy chủ chưa hỗ trợ gửi nhiều tệp.');
    const items = draft(key)?.attachments || [];
    // Global two-slot semaphore also bounds uploads across conversation switches.
    await Promise.all(items.map(async item => {
      if (item.stage?.status === 'ready') return;
      if (!item.file) { attachment(key, item.id, { upload: 'missing' }); return; }
      if (item.size > caps.maxFileBytes) { attachment(key, item.id, { upload: 'failed', error: 'Tệp quá lớn.' }); return; }
      if (activeUploads >= Math.min(2, caps.uploadConcurrency)) await new Promise<void>(resolve => waiting.push(resolve));
      else activeUploads++;
      try {
        if (!chatSession.valid(session) || cancelled.has(item.id)) return;
        attachment(key, item.id, { upload: 'uploading', error: undefined });
        const body = new FormData(); body.append('file', item.file, item.name);
        const { staging } = await request<{ staging: Stage }>(key, '/staging', { method: 'POST', body }, 120_000);
        if (!chatSession.valid(session)) return;
        if (cancelled.has(item.id) || !draft(key)?.attachments.some(a => a.id === item.id)) {
          await request(key, `/staging/${staging.id}`, { method: 'DELETE' }).catch(() => {}); return;
        }
        attachment(key, item.id, { stage: staging, upload: staging.status === 'ready' ? 'ready' : 'failed' });
      } catch (error) { if (chatSession.valid(session)) attachment(key, item.id, { upload: 'failed', error: String(error) }); }
      finally { const next = waiting.shift(); if (next) next(); else activeUploads--; }
    }));
  } finally { busy.delete(key); }
}
function optimistic(key: string, id?: string) {
  const current = entry(key, id); if (!current?.batch) return;
  const batchId = current.batch.payload.clientBatchId;
  const [, account, conversation] = parseConversationKey(key);
  current.batch.payload.items.forEach((item, index) => {
    const file = current.attachments[index];
    const id = `pending-${item.clientRequestId}`;
    let url = previews.get(id);
    if (!url && file?.file) { url = createLocalMediaPreview(file.file); previews.set(id, url); }
    const existing = useChatStore.getState().byConversation[key]?.messages.find(m => m.clientRequestId === item.clientRequestId);
    if (existing) {
      if (url && existing.delivery !== 'sent') useChatStore.getState().patchMessage(key, existing.localId || existing.id, {
        composerBatchId: batchId, attachments: existing.attachments.map(a => ({ ...a, url: a.url && !a.url.startsWith('blob:') ? a.url : url })),
      });
      return;
    }
    const kind = file.type.startsWith('image/') ? 'image' as const : file.type.startsWith('video/') ? 'video' as const : 'file' as const;
    const message = { id, localId: id, clientRequestId: item.clientRequestId, composerBatchId: batchId,
      delivery: 'queued' as const, retryable: false, conversationId: conversation,
      conversationType: conversation.startsWith('group:') ? 'group' as const : 'direct' as const,
      threadId: conversation.slice(conversation.indexOf(':') + 1), text: item.caption, kind,
      direction: 'outgoing' as const, isSelf: true, timestamp: new Date().toISOString(),
      attachments: [{ id, type: kind, url, fileName: file.name, mimeType: file.type, size: file.size }] };
    useChatStore.getState().mergeForKey(key, [message]);
    useChatStore.getState().updateConversationSummaryLocal(account, message);
  });
}
function mergeBatch(key: string, batch: Batch, id?: string) {
  const current = entry(key, id)?.batch;
  if (!current || current.payload.clientBatchId !== batch.clientBatchId) return;
  updateBatch(key, id, { ...current, result: batch, error: undefined });
  optimistic(key, id);
  batch.items.forEach(item => {
    if (item.receipt && item.receipt.clientRequestId === item.clientRequestId) {
      useChatStore.getState().receiptForKey(key, item.receipt);
      const rows = useChatStore.getState().byConversation[key]?.messages || [];
      rows.filter(row => row.clientRequestId === item.clientRequestId).forEach(row => useChatStore.getState().patchMessage(key, row.localId || row.id, { composerBatchId: batch.clientBatchId, retryable: false }));
    }
    else useChatStore.getState().patchMessage(key, `pending-${item.clientRequestId}`, {
      delivery: item.status, retryable: false, errorText: item.error?.message,
    });
  });
}
export async function queryComposerBatch(key: string, id?: string) {
  if (busy.has(key)) return;
  const current = entry(key, id)?.batch; if (!current) return;
  const statusKey = key + current.payload.clientBatchId;
  const version = (statusVersions.get(statusKey) || 0) + 1; statusVersions.set(statusKey, version);
  try {
    const { batch } = await request<{ batch: Batch }>(key, `/batches/${current.payload.clientBatchId}`);
    if (statusVersions.get(statusKey) === version) mergeBatch(key, batch, id);
  } catch (error) {
    if (entry(key, id)?.batch === current) updateBatch(key, id, { ...current, error: error instanceof ApiError && error.status === 404
      ? 'Máy chủ chưa ghi nhận. Có thể tiếp tục với cùng mã yêu cầu.' : 'Chưa xác nhận trạng thái. Không gửi lại tự động.' });
  }
}
export function pollComposerBatch(key: string) {
  if (polls.has(key)) return;
  let attempt = 0;
  const session = chatSession.capture();
  const tick = async () => {
    if (!chatSession.valid(session)) { polls.delete(key); return; }
    await queryComposerBatch(key);
    const result = draft(key)?.batch?.result;
    if (++attempt < 6 && (!result || result.items.some(item => item.status === 'sending' || item.status === 'unknown'))) {
      polls.set(key, setTimeout(tick, Math.min(8000, 2000 * (attempt + 1))));
    } else polls.delete(key);
  };
  polls.set(key, setTimeout(tick, 2000));
}
export async function sendComposerBatch(key: string, retry = false, id?: string) {
  if (busy.has(key)) return;
  const session = chatSession.capture(); busy.add(key);
  let newlyFrozen: string | undefined;
  try {
    await ensureConversationRecovered(key);
    if (!chatSession.valid(session) || !conversationRecovery.ready(key)) throw new Error('Chưa khôi phục xong dữ liệu hội thoại.');
    const own = entry(key, id)?.batch;
    const competing = [draft(key)?.batch, ...(draft(key)?.outbox || []).map(e => e.batch)]
      .some(b => b !== own && unresolvedBatch(b));
    const legacyPending = useChatStore.getState().byConversation[key]?.messages.some(m => !m.composerBatchId && (own ? ['sending', 'unknown'] : ['queued', 'sending', 'unknown']).includes(m.delivery || ''));
    if (competing || legacyPending || actionRecovery.unresolved(key)) throw new Error('Đợt gửi trước chưa xác nhận. Có thể soạn nháp; kiểm tra đợt cũ trước khi gửi.');
    let current = draft(key); if (!current) return;
    if (!id && !current.batch) {
      const caps = await getComposerCapabilities(key);
      if ((current.replyingTo || current.mentions?.length) && !caps.attachmentContext) throw new Error('Máy chủ chưa hỗ trợ trả lời/tag với tệp.');
      if (current.replyingTo && !current.text.trim() && !current.attachments[0]?.caption.trim()) throw new Error('Trả lời với tệp cần chú thích.');
      if (!caps.batch || current.attachments.length > caps.maxBatchItems) throw new Error('Không hỗ trợ số lượng tệp này.');
      const stages = await Promise.all(current.attachments.map(item => item.stage
        ? request<{ staging: Stage }>(key, `/staging/${item.stage.id}`) : Promise.reject(new Error('Hãy tải tệp lên trước.'))));
      if (stages.some(({ staging }) => staging.status !== 'ready' || Date.parse(staging.expiresAt) <= Date.now())) throw new Error('Tệp đã hết hạn. Bỏ tệp và thêm lại trước khi gửi.');
      // Do not freeze an earlier revision while the user is editing.
      if (draft(key)?.revision !== current.revision) throw new Error('Bản nháp đã thay đổi. Hãy gửi lại.');
      if (useChatStore.getState().byConversation[key]?.messages.some(m => !m.composerBatchId && ['queued', 'sending', 'unknown'].includes(m.delivery || ''))) throw new Error('Tin nhắn trước chưa hoàn tất.');
      const sanitizedMentions = sanitizeMentions(current.text, current.mentions);
      if (sanitizedMentions?.length !== current.mentions?.length) {
        update(key, { mentions: sanitizedMentions });
        current = draft(key)!;
      }
      const payload = freezeBatch(current.attachments, current.text, sanitizedMentions, current.replyingTo?.id);
      if (payload.items.some(item => item.caption.length > 20000)) throw new Error('Chú thích tối đa 20.000 ký tự.');
      update(key, { batch: { payload } }); current = draft(key)!;
      newlyFrozen = payload.clientBatchId;
      // Persist intent before POST. If storage fails, never risk losing immutable IDs on reload.
      const saved = await clientDb.saveComposer(key, { version: 2, text: current.text, attachments: current.attachments,
        mentions: current.mentions, replyingTo: current.replyingTo, batch: current.batch, outbox: current.outbox, recoveredDrafts: current.recoveredDrafts });
      if (!chatSession.valid(session)) return;
      if (!saved) { update(key, { batch: undefined }); throw new Error('Không lưu được mã gửi an toàn. Giải phóng dung lượng trình duyệt trước khi gửi.'); }
    }
    const batch = entry(key, id)?.batch; if (!batch) return;
    if (retry && !batchActions(batch.result).retry) return;
    // Invalidate any GET started before this explicit mutation.
    const statusKey = key + batch.payload.clientBatchId;
    statusVersions.set(statusKey, (statusVersions.get(statusKey) || 0) + 1);
    optimistic(key, id);
    if (!conversationRecovery.ready(key) || actionRecovery.unresolved(key)) throw new Error('Công cụ gửi trước chưa xác nhận.');
    const result = await request<{ batch: Batch }>(key, '/batches', { method: 'POST', body: JSON.stringify({ ...batch.payload, ...(retry ? { retry: true } : {}) }) }, 120_000);
    mergeBatch(key, result.batch, id);
    // Clear draft attachments and text immediately after successful submission so user can type next message
    if (!id) {
      update(key, { text: '', attachments: [], batch: undefined, attachFile: null, replyingTo: null, mentions: undefined });
      void clientDb.saveComposer(key, { version: 2, text: '', attachments: [], outbox: draft(key)?.outbox || [], recoveredDrafts: draft(key)?.recoveredDrafts });
    }
  } catch (error) {
    if (chatSession.valid(session)) {
      const batch = entry(key, id)?.batch;
      if (!id && batch && batch.payload.clientBatchId === newlyFrozen && error instanceof ApiError && error.status === 400 && error.code === 'BATCH_VALIDATION_REJECTED') {
        for (const item of batch.payload.items) useChatStore.getState().removeMessage(key, `pending-${item.clientRequestId}`);
        update(key, { batch: undefined });
        useComposerStore.getState().setStatusMsg(String(error));
      } else if (batch) updateBatch(key, id, { ...batch, error: String(error) });
      else useComposerStore.getState().setStatusMsg(String(error));
    }
  } finally { busy.delete(key); if (chatSession.valid(session) && draft(key)?.batch) pollComposerBatch(key); }
}
chatSession.subscribe(() => {
  controllers.forEach(controller => controller.abort()); polls.forEach(clearTimeout); polls.clear();
  previews.forEach(revokeLocalMediaPreview); previews.clear(); cancelled.clear(); statusVersions.clear();
});
useChatStore.subscribe(state => {
  for (const [id, url] of previews) {
    const own = Object.values(state.byConversation).flatMap(entry => entry.messages.filter(message => message.localId === id || message.id === id || message.clientRequestId === id.slice(8)));
    if (canReleasePreview(own, id, url)) { revokeLocalMediaPreview(url); previews.delete(id); }
  }
});
