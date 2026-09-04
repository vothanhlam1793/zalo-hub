import { create } from 'zustand';
import { bff } from '../bff-api';

interface SystemUser {
  id: string;
  email: string;
  displayName: string;
  type: 'human' | 'ai_bot';
  role?: string;
}

interface AuthState {
  user: SystemUser | null;
  isLoading: boolean;
  isChecking: boolean;

  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  setUser: (user: SystemUser) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isChecking: true,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const data = await bff.authLogin(email, password);
      set({ user: data.user as SystemUser, isLoading: false, isChecking: false });
      return { ok: true };
    } catch (err) {
      set({ isLoading: false, isChecking: false });
      return { ok: false, error: err instanceof Error ? err.message : 'Login failed' };
    }
  },

  logout: async () => {
    try {
      await bff.authLogout();
    } catch { /* ignore */ }
    set({ user: null });
  },

  checkSession: async () => {
    try {
      const data = await bff.authMe();
      set({ user: data.user as SystemUser, isChecking: false });
    } catch {
      set({ user: null, isChecking: false });
    }
  },

  setUser: (user) => set({ user, isChecking: false }),
}));
