import { useState } from 'react';
import type { Message } from '../../../../types';
import { canRetry } from '../../model/message-reconciliation';

export interface DeliveryActions {
  onRetryMessage?: (message: Message, file?: File) => void;
  onQueryMessage?: (message: Message) => void;
  onCancelMessage?: (message: Message) => void;
  onRestoreDraft?: (message: Message) => void;
}

export function MessageDeliveryIndicator({ message, ...actions }: { message: Message } & DeliveryActions) {
  const [showErrorPopover, setShowErrorPopover] = useState(false);
  const delivery = message.delivery;
  if (!delivery) return null;

  // 1. Sending / Queued: Tròn rỗng (hoặc viền xoay nhẹ)
  if (delivery === 'queued' || delivery === 'sending') {
    return (
      <span
        className="inline-flex items-center justify-center shrink-0 cursor-pointer"
        title="Đang gửi tin nhắn..."
        onClick={() => actions.onQueryMessage?.(message)}
      >
        <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-current border-t-transparent animate-spin opacity-80" />
      </span>
    );
  }

  // 2. Sent: Tròn đặc thành công (nhỏ gọn tinh tế)
  if (delivery === 'sent') {
    return (
      <span
        className="inline-flex items-center justify-center shrink-0"
        title="Đã gửi thành công"
      >
        <span className="w-2 h-2 rounded-full bg-blue-500/80 dark:bg-blue-400/80" />
      </span>
    );
  }

  // 3. Failed: Tròn đỏ thất bại (bấm để xem lỗi và thử lại)
  if (delivery === 'failed' || delivery === 'unknown') {
    const actionClass = 'underline underline-offset-2 px-1.5 py-0.5 rounded text-[11px] hover:bg-red-500/10';
    return (
      <div className="relative inline-flex items-center">
        <button
          type="button"
          onClick={() => setShowErrorPopover(!showErrorPopover)}
          className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-500/30 cursor-pointer animate-pulse shrink-0"
          title="Gửi chưa thành công. Bấm để thử lại"
        />

        {showErrorPopover && (
          <div className="absolute bottom-full right-0 mb-1.5 w-48 p-2.5 rounded-xl bg-[var(--card)] border border-[var(--border)] text-[11px] shadow-xl z-30 flex flex-col gap-1.5 text-[var(--foreground)]">
            <div className="font-semibold text-rose-500">⚠️ Chưa gửi được</div>
            {message.errorText && <div className="text-muted-foreground text-[10px] leading-tight">{message.errorText}</div>}
            <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-[var(--border)]">
              {canRetry(message) && (
                <button type="button" className={actionClass} onClick={() => { setShowErrorPopover(false); actions.onRetryMessage?.(message); }}>
                  Thử lại
                </button>
              )}
              <button type="button" className={actionClass} onClick={() => { setShowErrorPopover(false); actions.onCancelMessage?.(message); }}>
                Hủy
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// Giữ export backward compatible nếu có nơi khác import
export { MessageDeliveryIndicator as MessageDeliveryStatus };
