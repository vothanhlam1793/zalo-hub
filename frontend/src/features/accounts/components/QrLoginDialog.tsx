import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useWebSocket } from '@/features/realtime/useWebSocket';
import { bff } from '@/bff-api';
import type { SyncProgressPayload } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
  accountId?: string;
}

export function QrLoginDialog({ open, onOpenChange, onSuccess, accountId }: Props) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState('Đang tạo QR...');
  const [progress, setProgress] = useState<SyncProgressPayload | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isReconnect = Boolean(accountId);

  useWebSocket({
    onSyncProgress: (payload) => {
      if (!accountId || payload.accountId === accountId || payload.accountId === 'new_login') {
        setProgress(payload);
        if (payload.step === 'scanned') {
          setQrCode(null);
        } else if (payload.step === 'completed') {
          setStatus('✅ Đăng nhập & đồng bộ 14 ngày hoàn tất 100%!');
          setTimeout(() => {
            onSuccess();
            onOpenChange(false);
          }, 1500);
        }
      }
    },
  });

  useEffect(() => {
    if (!open) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setQrCode(null);
      setProgress(null);
      return;
    }

    setQrCode(null);
    setProgress(null);
    setStatus('Đang tạo mã QR chuẩn Zalo Web...');

    const startFn = isReconnect
      ? () => bff.reconnectStart(accountId!)
      : () => bff.loginStart();

    const qrFn = isReconnect
      ? () => bff.reconnectQr(accountId!)
      : () => bff.loginQr();

    startFn().then(() => {
      timerRef.current = setInterval(async () => {
        try {
          const qr = await qrFn();
          if (qr.qrCode) {
            setQrCode(qr.qrCode);
            setStatus(isReconnect ? 'Quét QR bằng Zalo và chọn "Đồng bộ ngay"' : 'Quét QR bằng Zalo để thêm tài khoản');
          }
          const st = await bff.accountStatus(accountId ?? '');
          if (st.loggedIn && st.sessionActive && (!progress || progress.step === 'completed')) {
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
            setStatus('Đăng nhập thành công!');
            setTimeout(() => { onSuccess(); onOpenChange(false); }, 1200);
          }
        } catch {
          // keep polling
        }
      }, 2000);
    }).catch(() => setStatus('Lỗi tạo QR'));

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [open, isReconnect, accountId, onOpenChange, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111] border-[var(--border)] max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[#eee] flex items-center gap-2 text-base">
            <span>📲</span> {isReconnect ? 'Đăng nhập lại & Đồng bộ 14 ngày' : 'Thêm tài khoản Zalo & Đồng bộ'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Quét mã QR 1 lần duy nhất để kết nối và tự động nạp toàn bộ lịch sử trò chuyện.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {qrCode && !progress?.step ? (
            <div className="flex flex-col items-center gap-2.5 animate-in fade-in zoom-in duration-200">
              <img
                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                alt="QR Code"
                className="w-48 h-48 rounded-xl border border-[var(--border)] bg-white p-2 shadow-lg"
              />
              <p className="text-[11px] text-muted-foreground text-center max-w-[260px]">
                Nhớ chọn <strong className="text-foreground">"Đồng bộ tin nhắn lên máy tính"</strong> trên điện thoại.
              </p>
            </div>
          ) : progress ? (
            <div className="w-full p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-blue-500">
                  {progress.step === 'completed' ? '✅ Hoàn tất' : '⚡ Đang đồng bộ...'}
                </span>
                <span className="font-mono font-bold text-foreground">{progress.percent}%</span>
              </div>
              <Progress value={progress.percent} className="h-2 bg-[var(--muted)]" />
              <p className="text-xs text-foreground leading-relaxed">
                {progress.message || 'Đang đối soát dữ liệu...'}
              </p>
            </div>
          ) : (
            <div className="w-48 h-48 rounded-xl border border-[var(--border)] bg-[#0d1015] flex flex-col items-center justify-center text-muted-foreground text-xs gap-2">
              <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span>Đang tạo mã QR...</span>
            </div>
          )}

          <p className="text-[12px] text-muted-foreground text-center font-medium">
            {progress?.message || status}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
