import { chatSession } from './chat-session';
export type RecoveryState = 'idle' | 'loading' | 'ready' | 'error';
const states = new Map<string, RecoveryState>();
const listeners = new Set<(key: string) => void>();
/** Shared prerequisite: BOTH durable draft and message cache have been merged. */
export const conversationRecovery = {
  state: (key: string): RecoveryState => states.get(key) || 'idle',
  ready: (key: string) => states.get(key) === 'ready',
  set(key: string, state: RecoveryState) { states.set(key, state); listeners.forEach(listener => listener(key)); },
  subscribe(listener: (key: string) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
chatSession.subscribe(() => states.clear());
