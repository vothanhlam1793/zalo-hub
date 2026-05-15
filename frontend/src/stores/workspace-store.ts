import { create } from 'zustand';
import type { AccountSummary } from '../types';

type SidebarTab = 'conversations' | 'contacts' | 'groups';

interface WorkspaceState {
  selectedAccountId: string;
  knownAccounts: AccountSummary[];
  sidebarTab: SidebarTab;
  query: string;

  setSelectedAccountId: (id: string) => void;
  setKnownAccounts: (accounts: AccountSummary[]) => void;
  addOrUpdateAccount: (account: AccountSummary) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setQuery: (q: string) => void;
  resetWorkspace: () => void;
}

const LS_KEY = 'zalohub_selected_account';

function loadSelectedAccountId(): string {
  try {
    return localStorage.getItem(LS_KEY) || '';
  } catch {
    return '';
  }
}

function saveSelectedAccountId(id: string) {
  try {
    if (id) localStorage.setItem(LS_KEY, id);
    else localStorage.removeItem(LS_KEY);
  } catch { /* ignore */ }
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  selectedAccountId: loadSelectedAccountId(),
  knownAccounts: [],
  sidebarTab: 'conversations' as SidebarTab,
  query: '',

  setSelectedAccountId: (id) => {
    saveSelectedAccountId(id);
    set({ selectedAccountId: id });
  },

  setKnownAccounts: (accounts) => set({ knownAccounts: accounts }),

  addOrUpdateAccount: (account) => set((state) => {
    const idx = state.knownAccounts.findIndex((a) => a.accountId === account.accountId);
    if (idx >= 0) {
      const next = [...state.knownAccounts];
      next[idx] = {
        ...next[idx],
        ...account,
      };
      return { knownAccounts: next };
    }
    return { knownAccounts: [...state.knownAccounts, account] };
  }),

  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  setQuery: (q) => set({ query: q }),

  resetWorkspace: () => {
    saveSelectedAccountId('');
    set({
      selectedAccountId: '',
      sidebarTab: 'conversations',
      query: '',
    });
  },
}));
