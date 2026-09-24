import type { GoldConversationMessage, GoldMessageKind } from '../types.js';

export interface SendExecution {
  method: string;
  result: unknown;
  kind?: GoldMessageKind;
  status: 'sent' | 'unknown';
  messages: GoldConversationMessage[];
  providerMessageIds: string[];
  acceptedAt?: string;
  localPersistenceFailed?: boolean;
}

export interface SendLifecycle {
  clientRequestId?: string;
  /** Called immediately before entering the SDK. May reject to prevent dispatch. */
  onDispatch?: () => void;
  /** Durable acceptance checkpoint; MUST precede optional local persistence. */
  onAccepted?: (execution: SendExecution) => Promise<void>;
}

export class SendFailure extends Error {
  constructor(public readonly code: string, message: string, public readonly retryable: boolean,
    public readonly httpStatus = 422) { super(message); }
}

export function providerId(value: unknown): string | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
  // SDK uses numeric IDs. Reject sentinels, unsafe rounded numbers and object coercion.
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value;
  return undefined;
}

/** Evidence: SDK dist/apis/sendMessage.{d.ts,js}, not upload photoId/fileId. */
export function parseSendMessageReceipt(result: unknown) {
  const value = result as { message?: { msgId?: unknown } | null; attachment?: Array<{ msgId?: unknown }> } | null;
  const slots: Array<{ id: string; attachment: boolean }> = [];
  if (!value || typeof value !== 'object' || !Array.isArray(value.attachment)
    || !(value.message === null || (typeof value.message === 'object' && value.message))) {
    return { accepted: false, slots };
  }
  let valid = true;
  if (value.message !== null) {
    const id = providerId(value.message.msgId);
    if (id) slots.push({ id, attachment: false }); else valid = false;
  }
  for (const item of value.attachment) {
    const id = providerId(item?.msgId);
    if (id) slots.push({ id, attachment: true }); else valid = false;
  }
  // A repeated identity in different roles is not evidence of two messages. Keep its
  // observed ID, but omit ambiguous DTOs and never claim aggregate acceptance.
  const byId = new Map<string, typeof slots[number]>();
  const ambiguous = new Set<string>();
  for (const slot of slots) {
    const previous = byId.get(slot.id);
    if (previous && previous.attachment !== slot.attachment) { valid = false; ambiguous.add(slot.id); }
    else byId.set(slot.id, slot); // same-role repeats represent one identity
  }
  return { accepted: valid && slots.length > 0,
    slots: [...byId.values()].filter((slot) => !ambiguous.has(slot.id)),
    observedIds: [...byId.keys()] };
}
