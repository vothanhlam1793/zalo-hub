import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { notificationService } from '@/features/notifications/notification-service';
import { chatSession } from '@/features/chat/model/chat-session';
import { getAccountDisplayName, getInitial } from '@/utils';
import type { AccountSummary, UserSettings } from '@/types';
import { toast } from 'sonner';

interface UserSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts?: Array<AccountSummary & { isActive?: boolean; sessionActive?: boolean; phoneNumber?: string; visible?: boolean }>;
  onReorderAccounts?: (newOrder: string[]) => void;
}

export function UserSettingsModal({ open, onOpenChange, accounts = [], onReorderAccounts }: UserSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'notifications' | 'account_order'>('notifications');
  const [settings, setSettings] = useState<UserSettings>(() => notificationService.getSettings());
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [localAccountOrder, setLocalAccountOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('zalohub_account_order');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const permissionGeneration = useRef(0);
  useEffect(() => notificationService.subscribe(setSettings), []);
  useEffect(() => () => { permissionGeneration.current++; }, [open]);

  // Sync with service whenever modal opens or settings change externally
  useEffect(() => {
    if (open) {
      setSettings(notificationService.getSettings());
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermission(Notification.permission);
      }
      try {
        const saved = localStorage.getItem('zalohub_account_order');
        if (saved) {
          setLocalAccountOrder(JSON.parse(saved));
        } else if (accounts.length > 0) {
          setLocalAccountOrder(accounts.map((a) => a.accountId));
        }
      } catch { /* ignore */ }
      // Background sync from server
      void notificationService.loadSettings();
    }
  }, [open, accounts]);

  // Sorted list of accounts based on local ordering
  const orderedAccounts = [...accounts].sort((a, b) => {
    const idxA = localAccountOrder.indexOf(a.accountId);
    const idxB = localAccountOrder.indexOf(b.accountId);
    const orderA = idxA >= 0 ? idxA : 9999;
    const orderB = idxB >= 0 ? idxB : 9999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.displayName || a.accountId).localeCompare(b.displayName || b.accountId);
  });

  const handleMove = (accountId: string, direction: 'up' | 'down') => {
    const currentList = orderedAccounts.map((a) => a.accountId);
    const idx = currentList.indexOf(accountId);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === currentList.length - 1) return;

    const nextList = [...currentList];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const temp = nextList[idx];
    nextList[idx] = nextList[targetIdx];
    nextList[targetIdx] = temp;

    setLocalAccountOrder(nextList);
    onReorderAccounts?.(nextList);
    toast.success('Đã cập nhật thứ tự tài khoản!');
  };

  // Unified auto-save handler (instant local + background API)
  const applySettingsChange = useCallback((patch: Partial<UserSettings>) => {
    permissionGeneration.current++;
    notificationService.saveSettings(patch);
  }, []);

  const handleToggleSound = (checked: boolean) => {
    applySettingsChange({ soundEnabled: checked });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    applySettingsChange({ soundVolume: val });
  };

  const handleTestSound = () => {
    notificationService.playChime(settings.soundVolume);
  };

  const handleToggleDesktop = async (checked: boolean) => {
    const session = chatSession.capture();
    const generation = ++permissionGeneration.current;
    if (checked && permission !== 'granted') {
      const result = await notificationService.requestNotificationPermission();
      if (!chatSession.valid(session) || generation !== permissionGeneration.current) return;
      setPermission(result);
      if (result !== 'granted') {
        toast.error('Trình duyệt chưa cho phép quyền hiển thị thông báo. Vui lòng kiểm tra cài đặt trình duyệt.');
        return;
      }
    }
    applySettingsChange({ desktopNotification: checked });
  };

  const handleToggleGroup = (checked: boolean) => {
    applySettingsChange({ notifyGroupMessages: checked });
  };

  const handleTogglePreview = (checked: boolean) => {
    applySettingsChange({ showMessagePreview: checked });
  };

  // Quick Meeting Mode: toggle silence across sound & desktop
  const isMeetingMode = !settings.soundEnabled && !settings.desktopNotification;
  const handleToggleMeetingMode = () => {
    if (isMeetingMode) {
      applySettingsChange({ soundEnabled: true, desktopNotification: true });
      toast.success('Đã tắt Chế độ họp. Thông báo âm thanh đã được bật lại.');
    } else {
      applySettingsChange({ soundEnabled: false, desktopNotification: false });
      toast.info('Đã bật Chế độ họp. Toàn bộ chuông và popup thông báo đã được tắt.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span>⚙️</span> Cài đặt & Tùy chỉnh
          </DialogTitle>
          <DialogDescription>
            Tùy chỉnh thông báo âm thanh và vị trí cố định của các tài khoản Zalo.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid grid-cols-2 w-full mb-3 bg-[var(--muted)]/60">
            <TabsTrigger value="notifications" className="text-xs">🔔 Thông báo & Âm thanh</TabsTrigger>
            <TabsTrigger value="account_order" className="text-xs">📱 Thứ tự Tài khoản ({accounts.length})</TabsTrigger>
          </TabsList>

          {activeTab === 'notifications' && (
            <div className="space-y-3.5 py-1 max-h-[60vh] overflow-y-auto pr-1">
              {/* Quick Meeting Mode Banner */}
              <div className={`p-3 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                isMeetingMode
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                  : 'border-[var(--border)] bg-[var(--muted)]/40 text-[var(--foreground)]'
              }`}>
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <span>{isMeetingMode ? '🔕' : '🎙️'}</span>
                    <span>Chế độ cuộc họp (Yên lặng tức thì)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Tắt nhanh toàn bộ âm thanh và popup ngoài màn hình khi cần tập trung.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={isMeetingMode ? 'default' : 'outline'}
                  onClick={handleToggleMeetingMode}
                  className={`shrink-0 text-xs font-semibold h-8 rounded-lg ${
                    isMeetingMode ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''
                  }`}
                >
                  {isMeetingMode ? 'Đang yên lặng' : 'Bật yên lặng'}
                </Button>
              </div>

              {/* Desktop notification */}
              <div className="flex items-start justify-between gap-4 p-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer" onClick={() => handleToggleDesktop(!settings.desktopNotification)}>
                    🖥️ Thông báo màn hình (Desktop Popup)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Hiện popup góc màn hình khi có tin nhắn mới (kể cả ở tab khác).
                  </p>
                  {permission === 'denied' && (
                    <p className="text-[11px] text-destructive font-medium mt-1">
                      ⚠️ Trình duyệt đang chặn thông báo. Hãy cho phép quyền Notification trên thanh địa chỉ.
                    </p>
                  )}
                </div>
                <Switch
                  checked={settings.desktopNotification && permission === 'granted'}
                  onCheckedChange={handleToggleDesktop}
                />
              </div>

              {/* Sound notification */}
              <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer" onClick={() => handleToggleSound(!settings.soundEnabled)}>
                      🔊 Âm thanh chuông báo (Chime)
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Phát tiếng chuông nhẹ nhàng khi nhận được tin nhắn mới.
                    </p>
                  </div>
                  <Switch
                    checked={settings.soundEnabled}
                    onCheckedChange={handleToggleSound}
                  />
                </div>

                {settings.soundEnabled && (
                  <div className="pt-2 border-t border-[var(--border)]/60 flex items-center gap-3">
                    <span className="text-xs font-medium text-muted-foreground w-16">Âm lượng:</span>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={settings.soundVolume}
                      onChange={handleVolumeChange}
                      className="flex-1 accent-blue-600 h-1.5 bg-[var(--border)] rounded-lg cursor-pointer"
                    />
                    <span className="text-xs font-bold w-9 text-right">{settings.soundVolume}%</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleTestSound}
                      className="h-7 text-xs px-2.5 rounded-lg shrink-0 hover:bg-blue-500/10 hover:text-blue-600"
                    >
                      ▶ Nghe thử
                    </Button>
                  </div>
                )}
              </div>

              {/* Group messages toggle */}
              <div className="flex items-start justify-between gap-4 p-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer" onClick={() => handleToggleGroup(!settings.notifyGroupMessages)}>
                    👥 Thông báo tin nhắn Nhóm
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Phát chuông cho các nhóm chat. Tắt đi nếu bạn chỉ muốn nghe chuông tin 1-1.
                  </p>
                </div>
                <Switch
                  checked={settings.notifyGroupMessages}
                  onCheckedChange={handleToggleGroup}
                />
              </div>

              {/* Message Preview */}
              <div className="flex items-start justify-between gap-4 p-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer" onClick={() => handleTogglePreview(!settings.showMessagePreview)}>
                    👁️ Xem trước nội dung tin nhắn
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Hiển thị nội dung tin nhắn và tên người gửi trên popup ngoài màn hình.
                  </p>
                </div>
                <Switch
                  checked={settings.showMessagePreview}
                  onCheckedChange={handleTogglePreview}
                />
              </div>
            </div>
          )}

          {activeTab === 'account_order' && (
            <div className="space-y-3 py-1">
              <div className="text-xs text-muted-foreground bg-blue-500/10 text-blue-600 dark:text-blue-400 p-2.5 rounded-xl border border-blue-500/20 flex items-center gap-2">
                <span>💡</span>
                <span>Thứ tự bên dưới tương ứng với vị trí hiển thị từ trên xuống dưới trên thanh Mini-Sidebar bên trái.</span>
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {orderedAccounts.map((account, idx) => {
                  const label = getAccountDisplayName(account);
                  const isTop = idx === 0;
                  const isBottom = idx === orderedAccounts.length - 1;

                  return (
                    <div
                      key={account.accountId}
                      className="flex items-center justify-between p-3 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--accent)]/30 transition-colors gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-6 h-6 rounded-full bg-[var(--muted)] border border-[var(--border)] inline-flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                          {idx + 1}
                        </span>

                        <Avatar className="w-9 h-9 rounded-xl shrink-0">
                          {account.avatar ? <img src={account.avatar} alt={label} className="w-full h-full object-cover rounded-xl" /> : null}
                          <AvatarFallback className="bg-gradient-to-br from-[#4f7aff] to-[#5fd4ff] text-[#08101d] text-xs font-extrabold rounded-xl">
                            {getInitial(label)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-[var(--foreground)] truncate flex items-center gap-1.5">
                            <span className="truncate">{label}</span>
                            {account.hubAlias && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 font-normal shrink-0">
                                {account.hubAlias}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {account.phoneNumber ? `📞 ${account.phoneNumber}` : account.accountId}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isTop}
                          onClick={() => handleMove(account.accountId, 'up')}
                          className="h-8 w-8 p-0 rounded-lg text-xs"
                          title="Di chuyển lên trên"
                        >
                          ▲
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isBottom}
                          onClick={() => handleMove(account.accountId, 'down')}
                          className="h-8 w-8 p-0 rounded-lg text-xs"
                          title="Di chuyển xuống dưới"
                        >
                          ▼
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Tabs>

        <DialogFooter className="flex items-center justify-between sm:justify-between w-full border-t border-[var(--border)] pt-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <span className="text-emerald-500 font-bold">✓</span> Tự động lưu cấu hình cố định
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="rounded-lg h-8 px-4">
            Xong
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
