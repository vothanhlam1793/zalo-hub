// Independent of React/auth/API to avoid dependency cycles. Every async task captures
// this epoch, not just a user ID (logout/login as the same user is a new session).
let userId = '';
let generation = 0;
let credential = '';
const listeners = new Set<(oldUser: string) => void>();
const credentialListeners = new Set<() => void>();
export interface ChatSessionSnapshot { userId: string; generation: number; token: string }
export function readStoredCredential(): string {
  try { return localStorage.getItem('auth_token') || ''; } catch { return ''; }
}
function replace(next: string, token: string) {
  if (next === userId && token === credential) return;
  const old = userId;
  userId = next;
  credential = token;
  generation++;
  listeners.forEach((listener) => listener(old));
}
function synchronizeCredentials() {
  if (userId && credential !== readStoredCredential()) {
    // Synchronous invalidation also runs from API/cache boundaries, before the
    // browser has delivered the cross-tab storage/focus event.
    replace('', '');
    credentialListeners.forEach((listener) => listener());
    return false;
  }
  return true;
}
export const chatSession = {
  capture: (): ChatSessionSnapshot => {
    synchronizeCredentials();
    return { userId, generation, token: credential };
  },
  valid: (session: ChatSessionSnapshot) => {
    synchronizeCredentials();
    return Boolean(userId) && session.userId === userId && session.generation === generation && session.token === credential;
  },
  synchronizeCredentials,
  setUser(next: string, token = next ? readStoredCredential() : '') { replace(next, token); },
  onCredentialChange(listener: () => void) {
    credentialListeners.add(listener);
    return () => { credentialListeners.delete(listener); };
  },
  subscribe(listener: (oldUser: string) => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
export const conversationKey = (user: string, account: string, conversation: string) =>
  JSON.stringify([user, account, conversation]);
export const parseConversationKey = (key: string): [string, string, string] => JSON.parse(key);
