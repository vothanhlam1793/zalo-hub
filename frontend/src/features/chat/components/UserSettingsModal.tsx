import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { api } from '@/api';
import { notificationService, DEFAULT_USER_SETTINGS } from '@/features/notifications/notification-service';
import type { UserSettings } from '@/types';
import { toast } from 'sonner';

interface UserSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserSettingsModal({ open, onOpenChange }: UserSettingsModalProps) {
  const [settings, setSettings] = useState<UserSettings>(() => notificationService.getSettings());
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const saveTimeoutRef = useRef<any>(null);

  // Sync with service whenever modal opens or settings change externally
  useEffect(() => {
    if (open) {
      setSettings(notificationService.getSettings());
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermission(Notification.permission);
      }
      // Background sync from server
      api.getUserSettings()
        .then((res) => {
          if (res.ok && res.settings) {
            setSettings(res.settings);
            notificationService.updateSettings(res.settings);
          }
        })
        .catch(() => {});
    }
  }, [open]);

  // Unified auto-save handler (instant local + background API)
  const applySettingsChange = useCallback((patch: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      // Instant local persistence
      notificationService.updateSettings(next);

      // Debounced backend save
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        api.updateUserSettings(next).catch(() => {});
      }, 400);

      return next;
    });
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
    if (checked && permission !== 'granted') {
      const result = await notificationService.requestNotificationPermission();
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span>🔔</span> Cài đặt Thông báo & Âm thanh
          </DialogTitle>
          <DialogDescription>
            Cấu hình cách ZaloHub thông báo trên trình duyệt của bạn (Cấp ứng dụng).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Quick Meeting Mode Banner */}
          <div className={`p-3.5 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
            isMeetingMode
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200'
              : 'border-[var(--border)] bg-[var(--muted)]/40 text-[var(--foreground)]'
          }`}>
            <div className="space-y-0.5">
              <div className="text-sm font-semibold flex items-center gap-2">
                <span>{isMeetingMode ? '🔕' : '🎙️'}</span>
                <span>Chế độ cuộc họp (Yên lặng tức thì)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Tắt nhanh toàn bộ âm thanh và popup ngoài màn hình khi cần tập trung hoặc đang họp.
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
          <div className="flex items-start justify-between gap-4 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30">
            <div className="space-y-1">
              <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer" onClick={() => handleToggleDesktop(!settings.desktopNotification)}>
                🖥️ Thông báo màn hình (Desktop Popup)
              </Label>
              <p className="text-xs text-muted-foreground">
                Hiện popup góc màn hình khi có tin nhắn mới (kể cả khi đang làm việc ở tab khác).
              </p>
              {permission === 'denied' && (
                <p className="text-xs text-destructive font-medium mt-1">
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
          <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 space-y-3.5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer" onClick={() => handleToggleSound(!settings.soundEnabled)}>
                  🔊 Âm thanh chuông báo (Chime)
                </Label>
                <p className="text-xs text-muted-foreground">
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
          <div className="flex items-start justify-between gap-4 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30">
            <div className="space-y-1">
              <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer" onClick={() => handleToggleGroup(!settings.notifyGroupMessages)}>
                👥 Thông báo tin nhắn Nhóm
              </Label>
              <p className="text-xs text-muted-foreground">
                Phát chuông cho các nhóm chat. Tắt đi nếu bạn chỉ muốn nghe chuông tin nhắn khách hàng 1-1.
              </p>
            </div>
            <Switch
              checked={settings.notifyGroupMessages}
              onCheckedChange={handleToggleGroup}
            />
          </div>

          {/* Message Preview */}
          <div className="flex items-start justify-between gap-4 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30">
            <div className="space-y-1">
              <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer" onClick={() => handleTogglePreview(!settings.showMessagePreview)}>
                👁️ Xem trước nội dung tin nhắn
              </Label>
              <p className="text-xs text-muted-foreground">
                Hiển thị nội dung tin nhắn và tên người gửi trên popup ngoài màn hình.
              </p>
            </div>
            <Switch
              checked={settings.showMessagePreview}
              onCheckedChange={handleTogglePreview}
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between w-full border-t border-[var(--border)] pt-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <span className="text-emerald-500 font-bold">✓</span> Tự động lưu mọi thay đổi tức thì
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="rounded-lg h-8 px-4">
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
