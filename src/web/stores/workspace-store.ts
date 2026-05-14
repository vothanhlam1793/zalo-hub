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

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  selectedAccountId: '',
  knownAccounts: [],
  sidebarTab: 'conversations' as SidebarTab,
  query: '',

  setSelectedAccountId: (id) => set({ selectedAccountId: id }),

  setKnownAccounts: (accounts) => set({ knownAccounts: accounts }),

  addOrUpdateAccount: (account) => set((state) => {
    const idx = state.knownAccounts.findIndex((a) => a.accountId === account.accountId);
    if (idx >= 0) {
      const next = [...state.knownAccounts];
      next[idx] = account;
      return { knownAccounts: next };
    }
    return { knownAccounts: [...state.knownAccounts, account] };
  }),

  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  setQuery: (q) => set({ query: q }),

  resetWorkspace: () => set({
    selectedAccountId: '',
    sidebarTab: 'conversations',
    query: '',
  }),
}));
