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
        if (payload.step === 'completed') {
          setSyncing(false);
          toast.success(payload.message || 'Đồng bộ tin nhắn 14 ngày thành công!');
          if (onSyncSuccess) onSyncSuccess();
        } else if (payload.step === 'error') {
          setSyncing(false);
          toast.error(payload.error || payload.message || 'Đồng bộ thất bại');
        }
      }
    },
  });

  const activeAccount = accounts.find((a) => a.accountId === (targetAccountId || selectedAccountId)) || accounts[0];

  const handleStartSync = async () => {
    if (!activeAccount) {
      toast.error('Vui lòng chọn tài khoản Zalo cần đồng bộ');
      return;
    }

    setSyncing(true);
    setProgress({
      type: 'ws_sync_progress',
      accountId: activeAccount.accountId,
      step: 'connecting',
      percent: 10,
      message: 'Đang kết nối phiên Zalo Web ngầm...',
    });

    try {
      await bff.syncAll(activeAccount.accountId);
    } catch (err: any) {
      setSyncing(false);
      setProgress(null);
      toast.error(err?.message || 'Không thể gửi yêu cầu đồng bộ. Vui lòng kiểm tra lại kết nối tài khoản.');
    }
  };

  const isWaitingConfirm = progress?.step === 'waiting_phone_confirm';
  const isImporting = progress?.step === 'importing';
  const isCompleted = progress?.step === 'completed';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!syncing) { onOpenChange(v); setProgress(null); } }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span>📲</span> Đồng bộ Tin nhắn từ Điện thoại (14 Ngày)
          </DialogTitle>
          <DialogDescription>
            Kéo trọn vẹn toàn bộ lịch sử tin nhắn, nhóm chat, danh bạ 14 ngày gần nhất từ Zalo Cloud vào ZaloHub.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
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
                    onClick={() => setTargetAccountId(acc.accountId)}
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

          {/* Guide Steps / Waiting for Mobile Confirmation Notification */}
          {isWaitingConfirm ? (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2 animate-pulse">
              <div className="text-sm font-bold text-amber-500 flex items-center gap-2">
                <span className="text-base">📱</span> VUI LÒNG MỞ ZALO TRÊN ĐIỆN THOẠI
              </div>
              <p className="text-xs text-foreground leading-relaxed">
                Hệ thống đang gửi tín hiệu đồng bộ. Nếu Zalo trên điện thoại hiện thông báo hoặc popup <strong>"Đồng bộ tin nhắn lên máy tính"</strong>, hãy bấm <strong>"ĐỒNG BỘ NGAY"</strong>.
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 space-y-1.5">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <span>💡</span> Cơ chế Đồng bộ & Bù Đắp:
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tự động đối soát và nạp toàn bộ tin nhắn 14 ngày từ Zalo Cloud. Mọi khoảng trống tin nhắn do mất mạng hoặc thoát nick sẽ được bù đắp đầy đủ.
              </p>
            </div>
          )}

          {/* Realtime Progress Bar & Status */}
          {progress && (
            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-blue-500 flex items-center gap-1.5">
                  {isCompleted ? '✅ Đã hoàn tất' : syncing ? '⏳ Đang tiến hành...' : 'Thông báo'}
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
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => { onOpenChange(false); setProgress(null); }}
            disabled={syncing}
          >
            {isCompleted ? 'Đóng' : 'Hủy'}
          </Button>
          <Button
            onClick={handleStartSync}
            disabled={syncing || !activeAccount}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2"
          >
            {syncing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Đang xử lý...
              </>
            ) : isCompleted ? (
              <>
                <span>🔄</span> Đồng bộ lại
              </>
            ) : (
              <>
                <span>🔄</span> Bắt đầu Đồng bộ 14 ngày
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
