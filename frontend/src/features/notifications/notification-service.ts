import type { UserSettings } from '@/types';
import { api } from '@/api';
import { chatSession } from '@/features/chat/model/chat-session';
import { messagePreview } from '@/features/chat/model/message-preview';
import type { WsConversationNotificationPayload } from '@/features/realtime/useWebSocket';

export const DEFAULT_USER_SETTINGS: UserSettings = {
  desktopNotification: true,
  soundEnabled: true,
  soundVolume: 80,
  notifyGroupMessages: true,
  showMessagePreview: true,
};

const storageKey = () => `zalohub_user_settings:${chatSession.capture().userId}`;

function loadStoredSettings(): UserSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_USER_SETTINGS };
  try {
    const raw = localStorage.getItem(storageKey());
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

export class NotificationService {
  private audioCtx: AudioContext | null = null;
  private settings: UserSettings = loadStoredSettings();
  private originalTitle = typeof document !== 'undefined' ? (document.title || 'ZaloHub') : 'ZaloHub';
  private flashInterval: any = null;
  private isWindowFocused = true;
  private listeners = new Set<(settings: UserSettings) => void>();
  private seen = new Set<string>();
  private revision = 0;
  private loadGeneration = 0;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private saveQueue: Promise<void> = Promise.resolve();
  private pendingSave = false;
  private desktops = new Map<Notification, ReturnType<typeof setTimeout>>();

  constructor() {
    chatSession.subscribe(() => {
      this.revision++;
      this.loadGeneration++;
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
      this.saveQueue = Promise.resolve();
      this.pendingSave = false;
      this.seen.clear();
      this.stopTabFlashing();
      for (const [notification, timer] of this.desktops) { clearTimeout(timer); notification.close(); }
      this.desktops.clear();
      this.settings = loadStoredSettings();
      this.notifyListeners();
    });
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
    this.revision++;
    this.settings = { ...this.settings, ...newSettings };
    // Remove any already visible private preview immediately when disabled.
    if (!this.settings.showMessagePreview) {
      this.stopTabFlashing();
      for (const [notification, timer] of this.desktops) { clearTimeout(timer); notification.close(); }
      this.desktops.clear();
    }
    if (saveToStorage && typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey(), JSON.stringify(this.settings));
      } catch {}
    }
    this.notifyListeners();
  }

  public async loadSettings() {
    const session = chatSession.capture();
    if (!chatSession.valid(session) || this.pendingSave) return;
    const generation = ++this.loadGeneration;
    const revision = this.revision;
    try {
      const res = await api.getUserSettings();
      if (chatSession.valid(session) && generation === this.loadGeneration && revision === this.revision
        && res.ok && res.settings) this.updateSettings(res.settings);
    } catch { /* local settings remain usable offline */ }
  }

  public saveSettings(patch: Partial<UserSettings>) {
    const session = chatSession.capture();
    if (!chatSession.valid(session)) return;
    this.updateSettings(patch);
    this.pendingSave = true;
    const revision = this.revision;
    const next = this.getSettings();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      // Serialize writes so a slower older save cannot overwrite the latest.
      this.saveQueue = this.saveQueue.then(async () => {
        if (!chatSession.valid(session) || revision !== this.revision) return;
        try { await api.updateUserSettings(next); } catch { /* retain local preference */ }
        if (chatSession.valid(session) && revision === this.revision) this.pendingSave = false;
      });
    }, 400);
  }

  public notifyMessage(event: WsConversationNotificationPayload, context: {
    activeAccountId: string; activeConversationId: string;
    conversation?: { isMuted?: boolean; muteUntil?: number | null; title?: string; avatar?: string };
    onClick?: () => void;
  }) {
    if (!chatSession.valid(chatSession.capture()) || !event.accountId || !event.conversationId || !event.messageId) return;
    const key = JSON.stringify([event.accountId, event.conversationId, event.messageId]);
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size > 10_000) this.seen.delete(this.seen.values().next().value!);
    const conv = context.conversation;
    if (event.isMuted && (event.muteUntil == null || event.muteUntil === -1 || event.muteUntil > Date.now())) return;
    if (conv?.isMuted && (conv.muteUntil == null || conv.muteUntil === -1 || conv.muteUntil > Date.now())) return;
    if (event.kind === 'reaction' || (event.conversationType === 'group' && !this.settings.notifyGroupMessages)) return;
    if (context.activeAccountId === event.accountId && context.activeConversationId === event.conversationId && this.isFocused()) return;
    this.playChime();
    const title = this.settings.showMessagePreview ? event.senderName || conv?.title || 'Tin nhắn mới' : 'ZaloHub';
    const body = messagePreview(event, this.settings);
    const session = chatSession.capture();
    this.showDesktopNotification(title, body, this.settings.showMessagePreview ? conv?.avatar : undefined,
      () => { if (chatSession.valid(session)) context.onClick?.(); });
    this.startTabFlashing(this.settings.showMessagePreview ? `${title}: ${body}` : body);
  }

  public toggleSound(): boolean {
    const nextState = !this.settings.soundEnabled;
    this.saveSettings({ soundEnabled: nextState });
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
      const notif = new Notification(this.settings.showMessagePreview ? title : 'ZaloHub', {
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
      this.desktops.set(notif, setTimeout(() => { notif.close(); this.desktops.delete(notif); }, 5000));
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
      document.title = isOriginal ? this.originalTitle : `🔔 ${this.settings.showMessagePreview ? message : 'Tin nhắn mới'}`;
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
