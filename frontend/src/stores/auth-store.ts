import { create } from 'zustand';
import { api } from '../api';

interface SystemUser {
  id: string;
  email: string;
  displayName: string;
  type: 'human' | 'ai_bot';
  role?: string;
}

interface AuthState {
  user: SystemUser | null;
  token: string | null;
  isLoading: boolean;
  isChecking: boolean;

  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  checkSession: () => Promise<void>;
}

function decodeJwt(token: string): { userId: string; exp: number } | null {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return { userId: decoded.userId, exp: decoded.exp };
  } catch {
    return null;
  }
}

function loadFromStorage(): { user: SystemUser | null; token: string | null } {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) return { user: null, token: null };
    const jwt = decodeJwt(token);
    if (!jwt || jwt.exp * 1000 < Date.now()) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      return { user: null, token: null };
    }
    const raw = localStorage.getItem('auth_user');
    const user: SystemUser | null = raw ? JSON.parse(raw) : null;
    return { user, token };
  } catch {
    return { user: null, token: null };
  }
}

export const useAuthStore = create<AuthState>((set, get) => {
  const stored = loadFromStorage();
  return {
    user: stored.user,
    token: stored.token,
    isLoading: false,
    isChecking: stored.token ? false : true,

    login: async (email, password) => {
      set({ isLoading: true });
      try {
        const r = await api.authLogin(email, password);
        localStorage.setItem('auth_token', r.token);
        localStorage.setItem('auth_user', JSON.stringify(r.user));
        set({ user: r.user, token: r.token, isLoading: false, isChecking: false });
        return { ok: true };
      } catch (err) {
        set({ isLoading: false, isChecking: false });
        return { ok: false, error: err instanceof Error ? err.message : 'Login failed' };
      }
    },

    logout: () => {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      set({ user: null, token: null });
    },

    checkSession: async () => {
      const stored = loadFromStorage();
      if (!stored.token) {
        set({ isChecking: false });
        return;
      }
      try {
        const r = await api.authMe(stored.token);
        localStorage.setItem('auth_token', r.token);
        localStorage.setItem('auth_user', JSON.stringify(r.user));
        set({ user: r.user, token: r.token, isChecking: false });
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        set({ user: null, token: null, isChecking: false });
      }
    },
  };
});
