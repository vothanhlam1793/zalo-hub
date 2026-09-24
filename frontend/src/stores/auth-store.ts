import { create } from 'zustand';
import { bff } from '../bff-api';
import { chatSession, readStoredCredential } from '../features/chat/model/chat-session';

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
let authEpoch = 0;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isChecking: true,

  login: async (email, password) => {
    const epoch = ++authEpoch;
    const originalToken = readStoredCredential();
    set({ isLoading: true });
    try {
      const data = await bff.authLogin(email, password, () => epoch === authEpoch && originalToken === readStoredCredential());
      if (epoch !== authEpoch) return { ok: false, error: 'Session changed' };
      chatSession.setUser(data.user.id, data.token);
      set({ user: data.user as SystemUser, isLoading: false, isChecking: false });
      return { ok: true };
    } catch (err) {
      if (epoch !== authEpoch) return { ok: false, error: 'Session changed' };
      set({ isLoading: false, isChecking: false });
      return { ok: false, error: err instanceof Error ? err.message : 'Login failed' };
    }
  },

  logout: async () => {
    authEpoch++;
    // Only explicit logout may call provider logout. Capture its request before
    // invalidating the local identity; cross-tab invalidation never calls it.
    const logout = bff.authLogout();
    chatSession.setUser('');
    set({ user: null, isLoading: false, isChecking: false });
    try {
      await logout;
    } catch { /* ignore */ }
  },

  checkSession: async () => {
    chatSession.synchronizeCredentials();
    const epoch = ++authEpoch;
    const token = readStoredCredential();
    if (!token) { chatSession.setUser(''); set({ user: null, isChecking: false }); return; }
    set({ isChecking: true });
    try {
      const data = await bff.authMe(token);
      if (epoch !== authEpoch || token !== readStoredCredential()) return;
      chatSession.setUser(data.user.id, token);
      set({ user: data.user as SystemUser, isChecking: false });
    } catch {
      if (epoch !== authEpoch) return;
      chatSession.setUser('');
      set({ user: null, isChecking: false });
    }
  },

  setUser: (user) => { authEpoch++; chatSession.setUser(user.id); set({ user, isChecking: false }); },
}));

// These listeners live with auth, not a particular dashboard/socket mount.
chatSession.subscribe(() => {
  if (!chatSession.capture().userId) {
    authEpoch++;
    useAuthStore.setState({ user: null, isLoading: false, isChecking: Boolean(readStoredCredential()) });
  }
});
let verificationScheduled = false;
function scheduleCredentialVerification() {
  if (verificationScheduled) return;
  verificationScheduled = true;
  queueMicrotask(() => {
    verificationScheduled = false;
    void useAuthStore.getState().checkSession();
  });
}
chatSession.onCredentialChange(scheduleCredentialVerification);
export function synchronizeAuthCredentials() {
  chatSession.synchronizeCredentials();
  if (!chatSession.capture().userId && readStoredCredential()) scheduleCredentialVerification();
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === 'auth_token' || event.key === null) synchronizeAuthCredentials();
  });
  window.addEventListener('focus', synchronizeAuthCredentials);
}
