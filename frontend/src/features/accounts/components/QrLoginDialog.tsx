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
  const [status, setStatus] = useState('Đang tạo mã QR...');
  const [progress, setProgress] = useState<SyncProgressPayload | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isReconnect = Boolean(accountId);

  useWebSocket({
    onSyncProgress: (payload) => {
      if (!accountId || payload.accountId === accountId || payload.accountId === 'new_login') {
        setProgress(payload);
        if (payload.step === 'qr_ready' && payload.qrCode) {
          setQrCode(payload.qrCode);
          setStatus(isReconnect ? 'Quét QR bằng Zalo trên điện thoại để kết nối' : 'Quét QR bằng Zalo để thêm tài khoản');
        } else if (payload.step === 'completed') {
          setStatus('✅ Đăng nhập hoàn tất!');
          setTimeout(() => {
            onSuccess();
            onOpenChange(false);
          }, 1500);
        } else if (payload.step === 'error') {
          setStatus(payload.message || 'Đăng nhập thất bại');
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
    setStatus('Đang tạo mã QR Zalo...');

    const startFn = isReconnect
      ? () => bff.reconnectStart(accountId!)
      : () => bff.loginStart();

    const qrFn = isReconnect
      ? () => bff.reconnectQr(accountId!)
      : () => bff.loginQr();

    startFn().then(() => {
      // Poll exclusively for the QR image code until scanned
      timerRef.current = setInterval(async () => {
        try {
          const qr = await qrFn();
          if (qr.qrCode) {
            setQrCode(qr.qrCode);
            setStatus(isReconnect ? 'Quét QR bằng Zalo trên điện thoại để kết nối' : 'Quét QR bằng Zalo để thêm tài khoản');
          }
        } catch {
          // keep polling
        }
      }, 1000);
    }).catch(() => setStatus('Lỗi tạo QR'));

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [open, isReconnect, accountId]);

  const isStreamingOrImporting = progress && (
    (progress.step as string) === 'receiving_chunks' ||
    (progress.step as string) === 'unpacking_db' ||
    (progress.step as string) === 'importing_postgres' ||
    progress.step === 'completed'
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!progress || progress.step === 'completed' || progress.step === 'error') onOpenChange(v); }}>
      <DialogContent className="bg-[#111] border-[var(--border)] max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[#eee] flex items-center gap-2 text-base">
            <span>📲</span> {isReconnect ? 'Đăng nhập lại & Bắt kịp tin nhắn' : 'Thêm tài khoản Zalo'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Quét mã QR bằng Zalo trên điện thoại. Hệ thống sẽ tự động bắt kịp tin nhắn gần đây sau khi kết nối.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {/* VIEW 1: HIỂN THỊ MÃ QR */}
          {!isStreamingOrImporting && (
            <>
              {qrCode ? (
                <div className="flex flex-col items-center gap-2.5 animate-in fade-in zoom-in duration-200">
                  <img
                    src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR Code"
                    className="w-52 h-52 rounded-xl border border-[var(--border)] bg-white p-2 shadow-lg object-contain"
                  />
                  <p className="text-[11px] text-muted-foreground text-center max-w-[260px]">
                    Mở app Zalo trên điện thoại để quét mã QR đăng nhập.
                  </p>
                </div>
              ) : (
                <div className="w-52 h-52 rounded-xl border border-[var(--border)] bg-[#0d1015] flex flex-col items-center justify-center text-muted-foreground text-xs gap-2">
                  <span className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span>Đang tải mã QR...</span>
                </div>
              )}
            </>
          )}

          {/* VIEW 2: HIỂN THỊ THANH TIẾN TRÌNH STREAM DỮ LIỆU THẬT */}
          {isStreamingOrImporting && progress && (
            <div className="w-full p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-blue-500">
                  {progress.step === 'completed'
                    ? '✅ Hoàn tất'
                    : (progress.step as string) === 'receiving_chunks'
                    ? '⚡ Đang truyền tin nhắn...'
                    : '📦 Đang nạp database...'}
                </span>
                <span className="font-mono font-bold text-foreground">{progress.percent}%</span>
              </div>
              <Progress value={progress.percent} className="h-2 bg-[var(--muted)]" />
              <p className="text-xs text-foreground leading-relaxed font-medium">
                {progress.message || 'Đang đối soát dữ liệu...'}
              </p>
              {progress.current ? (
                <div className="text-[11px] font-mono text-muted-foreground bg-[var(--muted)]/50 p-2 rounded">
                  Đã nhận: <strong className="text-foreground">{progress.current.toLocaleString()}</strong> tin nhắn
                </div>
              ) : null}
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
