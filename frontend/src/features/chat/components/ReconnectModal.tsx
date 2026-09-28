import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ReconnectModalProps {
  open: boolean;
  status: 'loading' | 'success' | 'error';
  errorMsg?: string;
  accountId?: string;
  onOpenQrLogin?: (accountId?: string) => void;
  onClose: () => void;
}

export function ReconnectModal({
  open,
  status,
  errorMsg,
  accountId,
  onOpenQrLogin,
  onClose,
}: ReconnectModalProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && status !== 'loading') onClose(); }}>
      <DialogContent className="max-w-md bg-[#0f172a] border border-white/10 text-white shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {status === 'loading' && (
              <>
                <span className="inline-block w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span>Đang kết nối lại tài khoản...</span>
              </>
            )}
            {status === 'success' && (
              <>
                <span className="text-emerald-400 text-lg">✅</span>
                <span>Kết nối lại thành công!</span>
              </>
            )}
            {status === 'error' && (
              <>
                <span className="text-amber-400 text-lg">⚠️</span>
                <span>Không thể kết nối lại tự động</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-300 pt-2 leading-relaxed">
            {status === 'loading' && 'Hệ thống đang khởi tạo session, kiểm tra mã hóa Zalo và kết nối lại luồng tin nhắn...'}
            {status === 'success' && 'Tài khoản đã hoạt động bình thường, dữ liệu hội thoại và luồng nhận tin đã sẵn sàng.'}
            {status === 'error' && (
              <div className="space-y-2">
                <div className="p-2.5 rounded bg-red-500/10 border border-red-500/20 text-red-300 text-xs break-words">
                  {errorMsg || 'Phiên đăng nhập Zalo đã hết hạn hoặc bị mở ở thiết bị khác.'}
                </div>
                <div className="text-slate-400">
                  Bạn có thể quét lại mã QR để tái cấp quyền truy cập ngay bây giờ.
                </div>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          {status === 'error' && onOpenQrLogin && (
            <Button
              type="button"
              onClick={() => {
                onClose();
                onOpenQrLogin(accountId);
              }}
              className="bg-cyan-500 hover:bg-cyan-600 text-black font-semibold text-xs h-8"
            >
              📷 Quét lại mã QR
            </Button>
          )}
          {status !== 'loading' && (
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-white/10 text-xs h-8 hover:bg-white/5"
            >
              Đóng
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
