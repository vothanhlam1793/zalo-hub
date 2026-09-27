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
  if (message.composerBatchId && delivery !== 'sent') return <span className="text-[10px]" title="Dùng bảng trạng thái đợt gửi trong khung soạn tin để kiểm tra/tiếp tục.">{delivery === 'sending' ? 'Đang gửi qua Zalo' : delivery === 'queued' ? 'Chờ tiếp tục' : delivery === 'unknown' ? 'Chưa rõ kết quả' : 'Tệp lỗi · xem đợt gửi'}</span>;

  // 1. Sending / Queued: Tròn xoay nhẹ, bấm vào để kiểm tra hoặc gửi lại/hủy nếu bị treo
  if (delivery === 'queued' || delivery === 'sending') {
    return (
      <div className="relative inline-flex items-center">
        <button
          type="button"
          onClick={() => setShowErrorPopover(!showErrorPopover)}
          className="inline-flex items-center justify-center shrink-0 cursor-pointer p-0.5 hover:opacity-100 opacity-80 transition"
          title="Đang gửi tin nhắn... Bấm để tùy chọn"
        >
          <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" />
        </button>

        {showErrorPopover && (
          <div className="absolute bottom-full right-0 mb-2 w-52 p-2.5 rounded-xl bg-[var(--card)] border border-[var(--border)] text-[11px] shadow-2xl z-30 flex flex-col gap-1.5 text-[var(--foreground)]">
            <div className="font-semibold flex items-center gap-1 text-amber-500">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              Đang gửi tin nhắn...
            </div>
            <div className="text-muted-foreground text-[10px] leading-tight">
              Nếu tin nhắn bị treo lâu, bạn có thể gửi lại hoặc hủy.
            </div>
            <div className="flex items-center gap-1.5 mt-1 pt-1.5 border-t border-[var(--border)]">
              <button
                type="button"
                className="flex-1 py-1 px-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 text-center transition text-[11px]"
                onClick={() => {
                  setShowErrorPopover(false);
                  actions.onRetryMessage?.(message);
                }}
              >
                🔄 Gửi lại
              </button>
              <button
                type="button"
                className="py-1 px-2 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground transition text-[11px]"
                onClick={() => {
                  setShowErrorPopover(false);
                  actions.onCancelMessage?.(message);
                }}
              >
                Hủy
              </button>
            </div>
          </div>
        )}
      </div>
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
    return (
      <div className="relative inline-flex items-center">
        <button
          type="button"
          onClick={() => setShowErrorPopover(!showErrorPopover)}
          className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-500/30 cursor-pointer animate-pulse shrink-0"
          title="Gửi chưa thành công. Bấm để thử lại"
        />

        {showErrorPopover && (
          <div className="absolute bottom-full right-0 mb-2 w-56 p-2.5 rounded-xl bg-[var(--card)] border border-[var(--border)] text-[11px] shadow-2xl z-30 flex flex-col gap-1.5 text-[var(--foreground)]">
            <div className="font-semibold text-rose-500 flex items-center gap-1">
              <span>⚠️</span> Gửi chưa thành công
            </div>
            <div className="text-muted-foreground text-[10px] leading-tight break-words">
              {message.errorText || 'Không nhận được phản hồi từ máy chủ.'}
            </div>
            <div className="flex flex-col gap-1 mt-1.5 pt-1.5 border-t border-[var(--border)]">
              {canRetry(message) && (
                <button
                  type="button"
                  className="w-full py-1 px-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 text-center transition text-[11px] flex items-center justify-center gap-1"
                  onClick={() => {
                    setShowErrorPopover(false);
                    actions.onRetryMessage?.(message);
                  }}
                >
                  <span>🔄</span> Gửi lại ngay
                </button>
              )}
              <div className="flex items-center gap-1">
                {actions.onRestoreDraft && (
                  <button
                    type="button"
                    className="flex-1 py-1 px-2 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground text-center transition text-[10px]"
                    onClick={() => {
                      setShowErrorPopover(false);
                      actions.onRestoreDraft?.(message);
                    }}
                  >
                    ✏️ Soạn lại
                  </button>
                )}
                <button
                  type="button"
                  className="flex-1 py-1 px-2 rounded-md bg-muted hover:bg-muted/80 text-rose-500 text-center transition text-[10px]"
                  onClick={() => {
                    setShowErrorPopover(false);
                    actions.onCancelMessage?.(message);
                  }}
                >
                  🗑️ Xóa bỏ
                </button>
              </div>
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
