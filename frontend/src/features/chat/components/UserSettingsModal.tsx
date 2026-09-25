import { useState, useEffect } from 'react';
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
  const [settings, setSettings] = useState<UserSettings>(notificationService.getSettings());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  useEffect(() => {
    if (open) {
      setLoading(true);
      api.getUserSettings()
        .then((res) => {
          if (res.ok && res.settings) {
            setSettings(res.settings);
            notificationService.updateSettings(res.settings);
          }
        })
        .catch(() => {
          // fallback to local settings
          setSettings(notificationService.getSettings());
        })
        .finally(() => setLoading(false));

      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermission(Notification.permission);
      }
    }
  }, [open]);

  const handleToggleSound = (checked: boolean) => {
    setSettings((prev) => ({ ...prev, soundEnabled: checked }));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setSettings((prev) => ({ ...prev, soundVolume: val }));
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
    setSettings((prev) => ({ ...prev, desktopNotification: checked }));
  };

  const handleToggleGroup = (checked: boolean) => {
    setSettings((prev) => ({ ...prev, notifyGroupMessages: checked }));
  };

  const handleTogglePreview = (checked: boolean) => {
    setSettings((prev) => ({ ...prev, showMessagePreview: checked }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      notificationService.updateSettings(settings);
      const res = await api.updateUserSettings(settings);
      if (res.ok) {
        toast.success('Đã lưu cài đặt thông báo thành công');
        onOpenChange(false);
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi lưu cài đặt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span>🔔</span> Cài đặt Thông báo & Âm thanh
          </DialogTitle>
          <DialogDescription>
            Tùy chỉnh chuông báo và thông báo popup cho riêng tài khoản của bạn.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Đang tải cài đặt...</div>
        ) : (
          <div className="space-y-5 py-3">
            {/* Desktop notification */}
            <div className="flex items-start justify-between gap-4 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40">
              <div className="space-y-1">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  🖥️ Thông báo màn hình (Desktop)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Hiện thông báo góc dưới màn hình khi có tin nhắn mới (kể cả khi ẩn tab).
                </p>
                {permission === 'denied' && (
                  <p className="text-xs text-destructive font-medium mt-1">
                    ⚠️ Trình duyệt đang chặn thông báo. Hãy cho phép trên thanh địa chỉ.
                  </p>
                )}
              </div>
              <Switch
                checked={settings.desktopNotification && permission === 'granted'}
                onCheckedChange={handleToggleDesktop}
              />
            </div>

            {/* Sound notification */}
            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    🔊 Âm thanh chuông báo
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Phát tiếng chuông chime khi nhận được tin nhắn mới.
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
                    className="h-7 text-xs px-2.5 rounded-lg shrink-0"
                  >
                    ▶ Nghe thử
                  </Button>
                </div>
              )}
            </div>

            {/* Group messages toggle */}
            <div className="flex items-start justify-between gap-4 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40">
              <div className="space-y-1">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  👥 Thông báo tin nhắn Nhóm
                </Label>
                <p className="text-xs text-muted-foreground">
                  Phát chuông và thông báo khi có tin nhắn mới từ các nhóm chat.
                </p>
              </div>
              <Switch
                checked={settings.notifyGroupMessages}
                onCheckedChange={handleToggleGroup}
              />
            </div>

            {/* Message Preview */}
            <div className="flex items-start justify-between gap-4 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40">
              <div className="space-y-1">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  👁️ Xem trước nội dung tin nhắn
                </Label>
                <p className="text-xs text-muted-foreground">
                  Hiển thị nội dung tin nhắn và tên người gửi trên thông báo Desktop.
                </p>
              </div>
              <Switch
                checked={settings.showMessagePreview}
                onCheckedChange={handleTogglePreview}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={handleSave} disabled={saving || loading} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold">
            {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
