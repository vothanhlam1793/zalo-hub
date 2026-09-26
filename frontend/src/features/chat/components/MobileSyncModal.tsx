import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { bff } from '@/bff-api';
import { useWebSocket } from '@/features/realtime/useWebSocket';
import { toast } from 'sonner';
import type { AccountSummary, SyncProgressPayload } from '@/types';

interface MobileSyncModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountSummary[];
  selectedAccountId?: string;
  onSyncSuccess?: () => void;
}

export function MobileSyncModal({ open, onOpenChange, accounts, selectedAccountId, onSyncSuccess }: MobileSyncModalProps) {
  const [targetAccountId, setTargetAccountId] = useState<string>(selectedAccountId || accounts[0]?.accountId || '');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgressPayload | null>(null);

  // Sync selectedAccountId if changed externally
  useEffect(() => {
    if (selectedAccountId) {
      setTargetAccountId(selectedAccountId);
    }
  }, [selectedAccountId]);

  // Hook into WebSocket progress updates
  useWebSocket({
    onSyncProgress: (payload) => {
      if (payload.accountId === targetAccountId) {
        setProgress(payload);
        if (payload.step === 'scanned') {
          setQrCode(null);
        } else if (payload.step === 'completed') {
          setSyncing(false);
          setQrCode(null);
          toast.success(payload.message || 'Đồng bộ tin nhắn 14 ngày thành công!');
          if (onSyncSuccess) onSyncSuccess();
        } else if (payload.step === 'error') {
          setSyncing(false);
          setQrCode(null);
          toast.error(payload.error || payload.message || 'Đồng bộ thất bại');
        }
      }
    },
  });

  const activeAccount = accounts.find((a) => a.accountId === (targetAccountId || selectedAccountId)) || accounts[0];

  const handleStartQrSync = async () => {
    if (!activeAccount) {
      toast.error('Vui lòng chọn tài khoản Zalo cần đồng bộ');
      return;
    }

    setLoadingQr(true);
    setSyncing(true);
    setQrCode(null);
    setProgress({
      type: 'ws_sync_progress',
      accountId: activeAccount.accountId,
      step: 'connecting',
      percent: 15,
      message: 'Đang tạo mã QR đồng bộ từ Zalo Web...',
    });

    try {
      const res = await bff.startReSyncQr(activeAccount.accountId);
      if (res.ok && res.qrCode) {
        setQrCode(res.qrCode);
        setProgress({
          type: 'ws_sync_progress',
          accountId: activeAccount.accountId,
          step: 'waiting_phone_confirm',
          percent: 25,
          message: 'Vui lòng dùng Zalo trên điện thoại quét mã QR bên dưới và chọn Đồng bộ ngay.',
        });
      }
    } catch (err: any) {
      setSyncing(false);
      setQrCode(null);
      setProgress(null);
      toast.error(err?.message || 'Không thể tạo mã QR đồng bộ. Vui lòng thử lại.');
    } finally {
      setLoadingQr(false);
    }
  };

  const handleCancel = async () => {
    if (activeAccount && syncing) {
      await bff.cancelReSyncQr(activeAccount.accountId).catch(() => {});
    }
    setSyncing(false);
    setQrCode(null);
    setProgress(null);
    onOpenChange(false);
  };

  const isWaitingScan = Boolean(qrCode);
  const isImporting = progress?.step === 'importing' || progress?.step === 'importing_db';
  const isCompleted = progress?.step === 'completed';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!syncing) { onOpenChange(v); setQrCode(null); setProgress(null); } }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span>📲</span> Đồng bộ Tin nhắn từ Điện thoại (14 Ngày)
          </DialogTitle>
          <DialogDescription>
            Quét mã QR để điện thoại đẩy trọn vẹn 100% lịch sử tin nhắn 14 ngày gần nhất từ Zalo Cloud vào ZaloHub.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Account Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Tài khoản Zalo cần đồng bộ
            </Label>
            <div className="grid grid-cols-1 gap-2">
              {accounts.map((acc) => {
                const isSelected = (targetAccountId || activeAccount?.accountId) === acc.accountId;
                return (
                  <button
                    key={acc.accountId}
                    type="button"
                    disabled={syncing}
                    onClick={() => { setTargetAccountId(acc.accountId); setQrCode(null); setProgress(null); }}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                        : 'border-[var(--border)] bg-[var(--muted)]/30 hover:bg-[var(--muted)]/60'
                    } ${syncing ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-500 flex items-center justify-center font-bold text-sm shrink-0">
                        {acc.displayName ? acc.displayName[0].toUpperCase() : 'Z'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">
                          {acc.displayName || acc.phoneNumber || acc.accountId}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          ID: {acc.accountId} {acc.phoneNumber ? `• ${acc.phoneNumber}` : ''}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center shrink-0">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* QR Code Container */}
          {qrCode && (
            <div className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-blue-500/40 bg-blue-500/5 space-y-3 animate-in fade-in zoom-in duration-300">
              <div className="p-2.5 bg-white rounded-xl shadow-md">
                <img src={qrCode} alt="QR Code Đồng bộ" className="w-48 h-48 rounded-lg object-contain" />
              </div>
              <div className="text-center space-y-1">
                <div className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1.5">
                  <span>📱</span> MỞ ZALO TRÊN ĐIỆN THOẠI QUÉT MÃ QR NÀY
                </div>
                <p className="text-[11px] text-muted-foreground max-w-[340px] leading-relaxed">
                  Nhớ chọn <strong className="text-foreground">"Đồng bộ tin nhắn lên máy tính"</strong> khi điện thoại hỏi xác nhận.
                </p>
              </div>
            </div>
          )}

          {/* Progress Bar & Status */}
          {progress && !qrCode && (
            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-blue-500 flex items-center gap-1.5">
                  {isCompleted ? '✅ Đã hoàn tất' : syncing ? '⏳ Đang đồng bộ...' : 'Thông báo'}
                </span>
                <span className="font-mono font-bold text-foreground">{progress.percent}%</span>
              </div>

              <Progress value={progress.percent} className="h-2.5 bg-[var(--muted)]" />

              <div className="text-xs text-muted-foreground leading-relaxed">
                {progress.message || 'Đang xử lý dữ liệu...'}
              </div>

              {progress.total ? (
                <div className="text-[11px] text-muted-foreground font-mono">
                  {progress.current !== undefined
                    ? `Đối soát: ${progress.current.toLocaleString()} / ${progress.total.toLocaleString()} tin nhắn`
                    : `Tổng cộng: ${progress.total.toLocaleString()} tin nhắn`}
                </div>
              ) : null}
            </div>
          )}

          {/* Intro Tip when idle */}
          {!syncing && !progress && !qrCode && (
            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 space-y-1.5">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <span>💡</span> Bù đắp toàn bộ tin nhắn bị hụt:
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Khi quét mã QR, Zalo Cloud sẽ chuyển toàn bộ tin nhắn 14 ngày về. Hệ thống sẽ tự động đối soát và nạp thêm các tin bị thiếu (như đoạn 15:52) vào database.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={loadingQr}
          >
            {isCompleted ? 'Đóng' : 'Hủy'}
          </Button>
          {!qrCode && !isImporting && (
            <Button
              onClick={handleStartQrSync}
              disabled={syncing || !activeAccount}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2"
            >
              {loadingQr ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang tạo QR...
                </>
              ) : isCompleted ? (
                <>
                  <span>🔄</span> Đồng bộ lại
                </>
              ) : (
                <>
                  <span>📲</span> Tạo mã QR Đồng bộ 14 ngày
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
