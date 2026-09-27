import type { UserSettings } from '@/types';

export const DEFAULT_USER_SETTINGS: UserSettings = {
  desktopNotification: true,
  soundEnabled: true,
  soundVolume: 80,
  notifyGroupMessages: true,
  showMessagePreview: true,
};

const STORAGE_KEY = 'zalohub_user_settings';

function loadStoredSettings(): UserSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_USER_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      desktopNotification: parsed.desktopNotification !== undefined ? Boolean(parsed.desktopNotification) : DEFAULT_USER_SETTINGS.desktopNotification,
      soundEnabled: parsed.soundEnabled !== undefined ? Boolean(parsed.soundEnabled) : DEFAULT_USER_SETTINGS.soundEnabled,
      soundVolume: typeof parsed.soundVolume === 'number' ? Math.max(0, Math.min(100, parsed.soundVolume)) : DEFAULT_USER_SETTINGS.soundVolume,
      notifyGroupMessages: parsed.notifyGroupMessages !== undefined ? Boolean(parsed.notifyGroupMessages) : DEFAULT_USER_SETTINGS.notifyGroupMessages,
      showMessagePreview: parsed.showMessagePreview !== undefined ? Boolean(parsed.showMessagePreview) : DEFAULT_USER_SETTINGS.showMessagePreview,
    };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

class NotificationService {
  private audioCtx: AudioContext | null = null;
  private settings: UserSettings = loadStoredSettings();
  private originalTitle = typeof document !== 'undefined' ? (document.title || 'ZaloHub') : 'ZaloHub';
  private flashInterval: any = null;
  private isWindowFocused = true;
  private listeners = new Set<(settings: UserSettings) => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      this.isWindowFocused = document.hasFocus();
      window.addEventListener('focus', () => {
        this.isWindowFocused = true;
        this.stopTabFlashing();
      });
      window.addEventListener('blur', () => {
        this.isWindowFocused = false;
      });
    }
  }

  public subscribe(listener: (settings: UserSettings) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.getSettings());
      } catch {}
    }
  }

  public isFocused(): boolean {
    if (typeof document === 'undefined') return true;
    return this.isWindowFocused && document.hasFocus();
  }

  public updateSettings(newSettings: Partial<UserSettings>, saveToStorage = true) {
    this.settings = { ...this.settings, ...newSettings };
    if (saveToStorage && typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      } catch {}
    }
    this.notifyListeners();
  }

  public toggleSound(): boolean {
    const nextState = !this.settings.soundEnabled;
    this.updateSettings({ soundEnabled: nextState });
    return nextState;
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
