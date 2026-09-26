import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { bff } from '@/bff-api';
import { toast } from 'sonner';
import type { AccountSummary } from '@/types';

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
  const [syncProgress, setSyncProgress] = useState<string | null>(null);

  // Update targetAccountId when selectedAccountId or open changes
  const activeAccount = accounts.find((a) => a.accountId === (targetAccountId || selectedAccountId)) || accounts[0];

  const handleStartSync = async () => {
    if (!activeAccount) {
      toast.error('Vui lòng chọn tài khoản Zalo cần đồng bộ');
      return;
    }

    setSyncing(true);
    setSyncProgress('Đang gửi tín hiệu đồng bộ tới máy chủ Zalo...');

    try {
      // Step 1: Trigger full account sync (including mobile request & cloud sync)
      await bff.syncAll(activeAccount.accountId);
      
      setSyncProgress('Đang quét và bù đắp tin nhắn gần đây từ Zalo Cloud...');
      toast.success(`Đã kích hoạt đồng bộ tin nhắn cho tài khoản ${activeAccount.displayName || activeAccount.phoneNumber || activeAccount.accountId}`);
      
      if (onSyncSuccess) {
        onSyncSuccess();
      }
      
      setTimeout(() => {
        setSyncing(false);
        setSyncProgress(null);
        onOpenChange(false);
      }, 1500);
    } catch (err: any) {
      setSyncProgress(null);
      setSyncing(false);
      toast.error(err?.message || 'Không thể gửi yêu cầu đồng bộ. Vui lòng kiểm tra lại kết nối tài khoản.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span>📲</span> Đồng bộ Tin nhắn từ Điện thoại
          </DialogTitle>
          <DialogDescription>
            Tải về và làm mới toàn bộ lịch sử tin nhắn, danh bạ, nhóm chat từ Zalo vào ZaloHub.
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
                    onClick={() => setTargetAccountId(acc.accountId)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                        : 'border-[var(--border)] bg-[var(--muted)]/30 hover:bg-[var(--muted)]/60'
                    }`}
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

          {/* Guide Steps */}
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2.5">
            <div className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
              <span>💡</span> Hướng dẫn Đồng bộ:
            </div>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>Đảm bảo điện thoại của bạn đang mở ứng dụng <strong>Zalo</strong>.</li>
              <li>Bấm nút <strong>"Bắt đầu Đồng bộ"</strong> bên dưới.</li>
              <li>Nếu trên điện thoại hiện thông báo hoặc popup yêu cầu xác nhận, hãy chọn <strong>"Đồng bộ ngay"</strong>.</li>
            </ol>
          </div>

          {/* Progress Status */}
          {syncProgress && (
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-500 flex items-center gap-2 animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
              {syncProgress}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={syncing}>
            Đóng
          </Button>
          <Button
            onClick={handleStartSync}
            disabled={syncing || !activeAccount}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2"
          >
            {syncing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Đang đồng bộ...
              </>
            ) : (
              <>
                <span>🔄</span> Bắt đầu Đồng bộ ngay
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
