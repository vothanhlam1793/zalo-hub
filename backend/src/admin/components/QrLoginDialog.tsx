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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isReconnect = Boolean(accountId);

  useEffect(() => {
    if (!open) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    setQrCode(null);
    setStatus("Đang tạo QR...");

    const startFn = isReconnect
      ? () => api.reconnectStart(accountId!)
      : () => api.loginStart();

    const qrFn = isReconnect
      ? () => api.reconnectQr(accountId!)
      : () => api.loginQr();

    startFn().then(() => {
      timerRef.current = setInterval(async () => {
        try {
          const qr = await qrFn();
          if (qr.qrCode) {
            setQrCode(qr.qrCode);
            setStatus("Quét mã QR bằng Zalo để đăng nhập");
          }
          const st = await api.status();
          if ((st as any).status?.loggedIn) {
            if (timerRef.current) clearInterval(timerRef.current);
            setStatus("Đăng nhập thành công!");
            setTimeout(() => { onSuccess(); onOpenChange(false); }, 1000);
          }
        } catch { /* polling */ }
      }, 2000);
    }).catch(() => setStatus("Lỗi tạo QR"));

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [open]);

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
            <img src={qrCode} alt="QR Code" className="w-48 h-48 rounded-lg border border-white/10" />
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
