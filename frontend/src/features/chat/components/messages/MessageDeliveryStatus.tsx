import type { Message } from '../../../../types';
import { canRetry } from '../../model/message-reconciliation';

export interface DeliveryActions {
  onRetryMessage?: (message: Message, file?: File) => void;
  onQueryMessage?: (message: Message) => void;
  onCancelMessage?: (message: Message) => void;
  onRestoreDraft?: (message: Message) => void;
}
const labels = {
  queued: 'Chờ gửi', sending: 'Đang gửi…', sent: 'Đã gửi',
  failed: 'Gửi chưa thành công', unknown: 'Chưa xác nhận kết quả gửi',
};
export function MessageDeliveryStatus({ message, ...actions }: { message: Message } & DeliveryActions) {
  if (!message.delivery) return null;
  const actionClass = 'underline underline-offset-2 px-2 py-2 rounded focus-visible:outline focus-visible:outline-2';
  return <div className="text-xs mt-1 text-slate-300 break-words">
    <span role="status" aria-live="polite">{message.delivery === 'sent' ? '✓ ' : ''}{labels[message.delivery]}</span>
    {message.errorText && message.delivery !== 'sent' && <div className="text-amber-200">{message.errorText}</div>}
    {message.attachmentNeedsReselect && message.delivery === 'failed' && <div>Chọn lại tệp: {message.localFile?.name}</div>}
    {message.delivery === 'queued' && <button type="button" className={actionClass} onClick={() => actions.onCancelMessage?.(message)}>Hủy trước khi gửi</button>}
    {(message.delivery === 'unknown' || message.delivery === 'sending') && <button type="button" className={actionClass} onClick={() => actions.onQueryMessage?.(message)}>Kiểm tra trạng thái</button>}
    {canRetry(message) && (message.attachmentNeedsReselect ? <label className={actionClass}>
      Chọn lại tệp và thử lại
      <input type="file" className="block max-w-full text-xs" aria-label="Chọn lại đúng tệp gốc để thử lại" onChange={(e) => {
        if (e.target.files?.[0]) actions.onRetryMessage?.(message, e.target.files[0]);
        e.target.value = '';
      }} />
    </label> : <button type="button" className={actionClass} onClick={() => actions.onRetryMessage?.(message)}>Thử lại</button>)}
    {message.delivery === 'failed' && <button type="button" className={actionClass} onClick={() => actions.onRestoreDraft?.(message)}>Khôi phục bản nháp</button>}
    {message.delivery === 'failed' && <button type="button" className={actionClass} onClick={() => actions.onCancelMessage?.(message)}>Hủy bỏ</button>}
  </div>;
}
