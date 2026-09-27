import { chatSession } from './chat-session';
export type ActionReceipt = { id: string; action: string; status: string; result?: unknown };
const values = new Map<string, ActionReceipt[]>();
export const actionRecovery = {
  get: (key: string) => values.get(key) || [],
  load(key: string) {
    const rows: ActionReceipt[] = [];
    // Strict storage read: errors must propagate into the shared hydration failure.
    if (typeof localStorage !== 'undefined') for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (name?.startsWith(`composer-action:${key}:`)) rows.push({ ...JSON.parse(localStorage.getItem(name)!), status: 'unknown' });
    }
    const existing = values.get(key) || [];
    values.set(key, [...rows.filter(r => !existing.some(e => e.id === r.id)), ...existing]);
  },
  merge(key: string, rows: ActionReceipt[]) {
    const merged = new Map((values.get(key) || []).map(r => [r.id, r]));
    rows.forEach(r => {
      const previous = merged.get(r.id);
      if (previous && ['accepted', 'rejected'].includes(previous.status) && !['accepted', 'rejected'].includes(r.status)) return;
      merged.set(r.id, r);
      if (typeof localStorage !== 'undefined' && ['accepted', 'rejected'].includes(r.status)) localStorage.removeItem(`composer-action:${key}:${r.id}`);
    }); values.set(key, [...merged.values()]);
  },
  unresolved(key: string) { return (values.get(key) || []).some(r => !['accepted', 'rejected'].includes(r.status)); },
};
chatSession.subscribe(() => values.clear());
