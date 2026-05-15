import { create } from "zustand";
import { api } from "../api";

interface SystemUser {
  id: string;
  email: string;
  displayName: string;
  type: string;
  role: string;
}

interface AuthState {
  user: SystemUser | null;
  token: string | null;
  isChecking: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem("auth_token"),
  isChecking: true,

  login: async (email, password) => {
    const res = await api.authLogin(email, password);
    localStorage.setItem("auth_token", res.token);
    set({ token: res.token, user: res.user });
  },

  logout: () => {
    api.authLogout().catch(() => {});
    localStorage.removeItem("auth_token");
    set({ token: null, user: null });
  },

  checkSession: async () => {
    const token = get().token;
    if (!token) {
      set({ isChecking: false });
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.exp * 1000 < Date.now()) {
        localStorage.removeItem("auth_token");
        set({ token: null, user: null, isChecking: false });
        return;
      }
      const res = await api.authMe();
      set({ user: res.user, isChecking: false });
    } catch {
      localStorage.removeItem("auth_token");
      set({ token: null, user: null, isChecking: false });
    }
  },
}));
