import type { Message, SendReceipt } from '../../../types';

/** Exact, namespace-qualified aliases only; arbitrary provider IDs are opaque. */
export function observedProviderIds(message: Message, accountId: string): string[] {
  const ids = message.providerMessageId ? [message.providerMessageId] : [];
  if (message.id.startsWith(`${accountId}::`)) ids.push(message.id.slice(accountId.length + 2));
  return [...new Set(ids.filter(Boolean))];
}
export function messageAliases(message: Message, accountId: string): string[] {
  const aliases = [`stored:${message.id}`];
  // The sole known storage convention is `${accountId}::${providerId}`.
  aliases.push(...observedProviderIds(message, accountId).map((id) => `provider:${id}`));
  if (message.cliMsgId) aliases.push(`client:${message.cliMsgId}`);
  return aliases;
}

function mediaKind(message: Message): string | undefined {
  if (message.localFile) return message.localFile.type.startsWith('image/') ? 'image' : 'file';
  const type = message.attachments?.[0]?.type || message.kind;
  return type === 'text' || type === 'reaction' || type === 'poll' ? undefined : type;
}
function sameMedia(placeholder: Message, canonical: Message): boolean {
  const expected = mediaKind(placeholder);
  const actual = mediaKind(canonical);
  if (!expected) return !actual;
  return actual === expected || (expected === 'file' && ['file', 'video', 'voice'].includes(actual || ''));
}
function canClaimPlaceholder(placeholder: Message, canonical: Message): boolean {
  // Text-only pending fixtures/old clients can still gain canonical enrichment;
  // a File intent, however, must reserve its local key for its media, not caption.
  return !mediaKind(placeholder) || sameMedia(placeholder, canonical);
}

function combine(old: Message, fresh: Message, stale = false): Message {
  const preferred = stale ? old : fresh;
  const fallback = stale ? fresh : old;
  const compatibleMedia = sameMedia(old, fresh);
  const fallbackAttachments = compatibleMedia ? fallback.attachments : [];
  const attachments = preferred.attachments?.length ? preferred.attachments.map((att, i) => ({
    ...fallbackAttachments?.find((item) => item.id === att.id), ...att,
    // Keep the tab preview until actual media replaces it.
    url: att.url || fallbackAttachments?.[i]?.url,
  })) : fallbackAttachments;
  return {
    ...fallback, ...preferred,
    // Even an old snapshot can identify a local placeholder, but not undo a
    // canonical identity or overwrite a newer reaction/media projection.
    id: old.id.startsWith('pending-') && !fresh.id.startsWith('pending-') ? fresh.id : preferred.id,
    providerMessageId: preferred.providerMessageId || fallback.providerMessageId,
    cliMsgId: preferred.cliMsgId || fallback.cliMsgId,
    senderId: preferred.senderId || fallback.senderId,
    senderName: preferred.senderName || fallback.senderName,
    rawMessageJson: preferred.rawMessageJson || fallback.rawMessageJson,
    localId: old.localId || old.id,
    clientRequestId: old.clientRequestId || fresh.clientRequestId,
    attachments,
    localFile: compatibleMedia ? preferred.localFile || fallback.localFile : preferred.localFile,
    attachmentNeedsReselect: compatibleMedia ? preferred.attachmentNeedsReselect ?? fallback.attachmentNeedsReselect : undefined,
    quote: preferred.quote || fallback.quote,
    reactions: preferred.reactions ?? fallback.reactions,
    delivery: old.delivery === 'sent' ? 'sent' : preferred.delivery || fallback.delivery,
  };
}

export function mergeMessages(base: Message[], incoming: Message[], accountId: string, stale = false): Message[] {
  let next = [...base];
  for (const message of incoming) {
    const aliases = messageAliases(message, accountId);
    const providerIds = observedProviderIds(message, accountId);
    const conflictingProvider = (old: Message) => {
      const oldIds = observedProviderIds(old, accountId);
      return oldIds.length > 0 && providerIds.length > 0 && !oldIds.some((id) => providerIds.includes(id));
    };
    const exact = next.filter((old) => (message.localId && old.localId === message.localId)
      || messageAliases(old, accountId).some((alias) => aliases.includes(alias) && (!alias.startsWith('client:') || !conflictingProvider(old))));
    // A delayed cache read of an old placeholder must not resurrect it after a
    // receipt has joined that request to its canonical row(s).
    if (stale && message.id.startsWith('pending-') && message.clientRequestId) {
      const confirmed = next.find((old) => old.clientRequestId === message.clientRequestId && !old.id.startsWith('pending-') && canClaimPlaceholder(message, old));
      if (confirmed) continue;
    }
    // A request may emit caption + image. Request correlation can claim only an
    // unresolved placeholder, never another real provider message of that request.
    const pending = message.clientRequestId && next.find((old) =>
      old.clientRequestId === message.clientRequestId && old.id.startsWith('pending-') && !conflictingProvider(old) && canClaimPlaceholder(old, message));
    const target = pending || exact[0];
    if (!target) {
      next.push({ ...message, localId: message.localId || message.id });
      continue;
    }
    let merged = target;
    for (const duplicate of exact) if (duplicate !== target) merged = combine(merged, duplicate, stale);
    merged = combine(merged, message, stale);
    // A trusted canonical echo proves acceptance, never recipient delivery.
    if (message.clientRequestId && !message.id.startsWith('pending-')) merged.delivery = 'sent';
    const removed = new Set([...exact, target]);
    next = next.filter((old) => !removed.has(old));
    next.push(merged);
  }
  return next.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || (a.localId || a.id).localeCompare(b.localId || b.id));
}

/** Only the row that inherited this preview's stable local key can release it. */
export function canReleasePreview(messages: Message[], localId: string, preview: string): boolean {
  const media = messages.find((m) => m.localId === localId && !m.id.startsWith('pending-'));
  return Boolean(media?.delivery === 'sent' && media.attachments.some((a) => a.url && !a.url.startsWith('blob:'))
    && !messages.some((m) => m.attachments.some((a) => a.url === preview || a.thumbnailUrl === preview)));
}

export function applyReceipt(base: Message[], receipt: SendReceipt): Message[] {
  const canonical = receipt.messages.filter((m) => m.conversationId === receipt.conversationId)
    .map((m) => ({ ...m, clientRequestId: receipt.clientRequestId, delivery: 'sent' as const }));
  let next = mergeMessages(base, canonical, receipt.accountId);
  // An accepted response can have observed IDs before local history is repaired.
  // Join only a single observed ID to a single placeholder; never invent an ID.
  if (!canonical.length && receipt.status === 'sent' && receipt.providerMessageIds.length === 1) {
    const placeholder = next.find((m) => m.clientRequestId === receipt.clientRequestId && m.id.startsWith('pending-'));
    if (placeholder) next = mergeMessages(next, [{ ...placeholder, providerMessageId: receipt.providerMessageIds[0] }], receipt.accountId);
  }
  return next.map((m) => m.clientRequestId !== receipt.clientRequestId ? m : {
    ...m,
    delivery: m.delivery === 'sent' ? 'sent' : receipt.status,
    errorCode: receipt.error?.code,
    errorText: receipt.error?.message,
    retryable: m.delivery === 'sent' ? false : receipt.status === 'failed' && receipt.error?.retryable === true,
  });
}

export function recoverMessage(message: Message): Message {
  if (!message.delivery || message.delivery === 'sent') return message;
  if (message.delivery === 'queued') {
    return {
      ...message,
      delivery: 'failed',
      retryable: false,
      errorCode: 'UNSENT_RELOAD',
      errorText: 'Chưa được gửi trước khi tải lại trang.',
      attachmentNeedsReselect: Boolean(message.localFile),
    };
  }
  return {
    ...message,
    delivery: message.delivery === 'sending' ? 'unknown' : message.delivery,
    attachmentNeedsReselect: Boolean(message.localFile),
  };
}

export function canRetry(message: Message): boolean {
  return message.delivery === 'failed' && message.retryable === true && Boolean(message.clientRequestId);
}
