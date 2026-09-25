import type { UserSettings } from '@/types';

export const DEFAULT_USER_SETTINGS: UserSettings = {
  desktopNotification: true,
  soundEnabled: true,
  soundVolume: 80,
  notifyGroupMessages: true,
  showMessagePreview: true,
};

class NotificationService {
  private audioCtx: AudioContext | null = null;
  private settings: UserSettings = { ...DEFAULT_USER_SETTINGS };
  private originalTitle = document.title || 'ZaloHub';
  private flashInterval: any = null;
  private isWindowFocused = true;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        this.isWindowFocused = true;
        this.stopTabFlashing();
      });
      window.addEventListener('blur', () => {
        this.isWindowFocused = false;
      });
    }
  }

  public updateSettings(newSettings: Partial<UserSettings>) {
    this.settings = { ...this.settings, ...newSettings };
  }

  public getSettings(): UserSettings {
    return { ...this.settings };
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!this.audioCtx) {
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Play a clean, modern, pleasant double-chime using Web Audio API
   */
  public playChime(customVolume?: number) {
    const volumePercent = customVolume !== undefined ? customVolume : (this.settings.soundEnabled ? this.settings.soundVolume : 0);
    if (volumePercent <= 0) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const gainNode = ctx.createGain();
      const masterVolume = (volumePercent / 100) * 0.15; // smooth master scaling

      gainNode.gain.setValueAtTime(0, now);
      gainNode.connect(ctx.destination);

      // First tone (G5 - 783.99 Hz)
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(784, now);
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(masterVolume, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc1.connect(gainNode);
      osc1.start(now);
      osc1.stop(now + 0.2);

      // Second tone (C6 - 1046.50 Hz)
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1046.5, now + 0.1);

      const gainNode2 = ctx.createGain();
      gainNode2.gain.setValueAtTime(0, now + 0.1);
      gainNode2.gain.linearRampToValueAtTime(masterVolume * 1.1, now + 0.12);
      gainNode2.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      gainNode2.connect(ctx.destination);
      osc2.connect(gainNode2);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.45);
    } catch {
      // ignore audio context restrictions
    }
  }

  public async requestNotificationPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    if (Notification.permission === 'granted') {
      return 'granted';
    }
    try {
      return await Notification.requestPermission();
    } catch {
      return 'denied';
    }
  }

  public showDesktopNotification(title: string, body: string, icon?: string, onClick?: () => void) {
    if (!this.settings.desktopNotification) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const notif = new Notification(title, {
        body: this.settings.showMessagePreview ? body : 'Có tin nhắn mới',
        icon: icon || '/favicon.ico',
        silent: true, // We handle audio ourselves with fine volume control
      });

      if (onClick) {
        notif.onclick = () => {
          window.focus();
          onClick();
          notif.close();
        };
      } else {
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      }

      // Auto close after 5 seconds
      setTimeout(() => notif.close(), 5000);
    } catch {
      // ignore
    }
  }

  public startTabFlashing(message: string) {
    if (this.isWindowFocused) return;
    if (this.flashInterval) return;

    let isOriginal = false;
    this.originalTitle = document.title;

    this.flashInterval = setInterval(() => {
      document.title = isOriginal ? this.originalTitle : `🔔 ${message}`;
      isOriginal = !isOriginal;
    }, 1000);
  }

  public stopTabFlashing() {
    if (this.flashInterval) {
      clearInterval(this.flashInterval);
      this.flashInterval = null;
      document.title = this.originalTitle;
    }
  }
}

export const notificationService = new NotificationService();
