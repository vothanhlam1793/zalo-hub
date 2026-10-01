import type { Message, MessageMention, SendReceipt } from '../../../types';
import { sanitizeMentions } from './mention-utils';

export interface ComposerCapabilities {
  version: number; staging: boolean; batch: boolean; nativeAlbum: boolean;
  maxFileBytes: number; maxBatchItems: number; uploadConcurrency: number; ttlSeconds: number;
  attachmentContext?: boolean;
}
export interface Stage {
  id: string; fileName: string; mimeType: string; size: number;
  status: 'uploading' | 'ready' | 'expired' | 'deleted'; expiresAt: string;
}
export interface BatchPayload {
  clientBatchId: string;
  items: Array<{ stagingId: string; clientRequestId: string; caption: string; mentions?: MessageMention[]; quoteMessageId?: string }>;
}
export interface Batch extends BatchPayload {
  status: 'queued' | 'sending' | 'sent' | 'partial' | 'failed' | 'unknown';
  items: Array<BatchPayload['items'][number] & {
    status: 'queued' | 'sending' | 'sent' | 'failed' | 'unknown'; retryable: boolean;
    providerMessageIds: string[]; receipt?: SendReceipt; error?: { code: string; message: string };
  }>;
}
export interface DraftAttachment {
  id: string; name: string; size: number; type: string; lastModified: number;
  file?: Blob; caption: string; stage?: Stage;
  upload: 'local' | 'uploading' | 'ready' | 'failed' | 'missing'; error?: string;
}
export interface StoredComposer {
  version: 2; text: string; attachments: DraftAttachment[];
  mentions?: MessageMention[]; replyingTo?: Message | null;
  batch?: { payload: BatchPayload; result?: Batch; error?: string };
  outbox?: OutboxEntry[];
  recoveredDrafts?: Array<{ text: string; mentions?: MessageMention[]; replyingTo?: Message | null }>;
}
export interface OutboxEntry { batch: NonNullable<StoredComposer['batch']>; attachments: DraftAttachment[] }
export function unresolvedBatch(batch: StoredComposer['batch']) {
  return Boolean(batch && (!batch.result || batch.result.items.some(i => i.status === 'unknown' || i.status === 'sending' || i.status === 'queued')));
}
export function migrateComposer(value: Partial<StoredComposer> & { fileName?: string } | null): StoredComposer {
  const text = value?.text || '';
  const mentions = sanitizeMentions(text, value?.mentions);
  return { version: 2, text, mentions, replyingTo: value?.replyingTo, recoveredDrafts: value?.recoveredDrafts,
    batch: value?.batch, outbox: value?.outbox || [], attachments: (value?.attachments || (value?.fileName ? [{
      id: crypto.randomUUID(), name: value.fileName, size: 0, type: '', lastModified: 0,
      caption: '', upload: 'missing' as const,
    }] : [])).map(item => ({ ...item, upload: item.upload === 'uploading' ? 'local' : item.upload,
      ...(!item.file && !item.stage ? { upload: 'missing' as const } : {}) })) };
}
export function batchActions(batch?: Batch) {
  return { resume: Boolean(batch?.items.some(item => item.status === 'queued')),
    retry: Boolean(batch?.items.some(item => item.status === 'failed' && item.retryable)) };
}
export function freezeBatch(attachments: DraftAttachment[], text: string, mentions?: MessageMention[], quoteMessageId?: string): BatchPayload {
  if (!attachments.length || attachments.some(item => item.stage?.status !== 'ready')) throw new Error('Tệp chưa sẵn sàng.');
  const firstCaption = [text, attachments[0].caption].filter(Boolean).join('\n');
  const validFirstMentions = sanitizeMentions(firstCaption, mentions);

  return { clientBatchId: crypto.randomUUID(), items: attachments.map((item, index) => {
    const caption = [index === 0 ? text : '', item.caption].filter(Boolean).join('\n');
    return {
      stagingId: item.stage!.id,
      clientRequestId: crypto.randomUUID(),
      caption,
      ...(index === 0 && validFirstMentions?.length ? { mentions: validFirstMentions } : {}),
      ...(index === 0 && quoteMessageId ? { quoteMessageId } : {}),
    };
  }) };
}
