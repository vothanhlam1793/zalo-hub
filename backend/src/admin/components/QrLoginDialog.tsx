import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { api } from "../api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
  accountId?: string;
}

export function QrLoginDialog({ open, onOpenChange, onSuccess, accountId }: Props) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isReconnect = Boolean(accountId);

  const loadFreshQr = (force = false) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setQrCode(null);
    setRefreshing(true);
    setStatus("Đang tạo QR mới...");

    const startFn = isReconnect
      ? () => api.reconnectStart(accountId!)
      : () => api.loginStart(force);

    const qrFn = isReconnect
      ? () => api.reconnectQr(accountId!)
      : () => api.loginQr();

    startFn().then(() => {
      timerRef.current = setInterval(async () => {
        try {
          const qr = await qrFn();
          if (qr.qrCode) {
            setQrCode(qr.qrCode);
            setRefreshing(false);
            setStatus("Quét mã QR bằng Zalo để đăng nhập");
          }
          const st = (await api.status()) as any;
          const isLoggedIn = Boolean(
            st?.loggedIn ||
            st?.sessionActive ||
            st?.account?.userId ||
            st?.status?.loggedIn
          );
          if (isLoggedIn) {
            if (timerRef.current) clearInterval(timerRef.current);
            setStatus("Đăng nhập thành công!");
            setTimeout(() => { onSuccess(); onOpenChange(false); }, 1000);
          }
        } catch { /* polling */ }
      }, 1000);
    }).catch(() => {
      setStatus("Lỗi tạo QR");
      setRefreshing(false);
    });
  };

  useEffect(() => {
    if (!open) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      if (!isReconnect) {
        api.loginCancel().catch(() => {});
      }
      return;
    }

    loadFreshQr(true);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      if (!isReconnect) {
        api.loginCancel().catch(() => {});
      }
    };
  }, [open, isReconnect, accountId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111] border-white/10 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[#eee]">
            {isReconnect ? "Đăng nhập lại tài khoản Zalo" : "Thêm tài khoản Zalo"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {qrCode ? (
            <div className="flex flex-col items-center gap-2">
              <img src={qrCode} alt="QR Code" className="w-48 h-48 rounded-lg border border-white/10 bg-white p-1" />
              <button
                type="button"
                onClick={() => loadFreshQr(true)}
                disabled={refreshing}
                className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 transition disabled:opacity-50"
              >
                {refreshing ? "Đang tạo mã mới..." : "🔄 Đổi mã QR mới"}
              </button>
            </div>
          ) : (
            <div className="w-48 h-48 rounded-lg border border-white/10 bg-[#0d1015] flex items-center justify-center text-muted-foreground text-sm">
              Đang tạo QR...
            </div>
          )}
          <p className="text-[13px] text-muted-foreground text-center">{status}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
