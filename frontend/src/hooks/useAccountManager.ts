import { useCallback } from 'react';
import { api, type AccountStatusSummary } from '../api';
import type { AccountSummary, Contact, ConversationSummary, Group, SessionStatus } from '../types';

function toAccountSummary(account: AccountStatusSummary): AccountSummary {
  return {
    accountId: account.accountId,
    hubAlias: account.hubAlias,
    displayName: account.account?.displayName ?? account.displayName,
    phoneNumber: account.account?.phoneNumber ?? account.phoneNumber,
    avatar: account.account?.avatar ?? account.avatar,
    isActive: account.isActive,
    hasCredential: account.hasCredential,
    runtimeLoaded: account.runtimeLoaded,
    sessionActive: account.sessionActive,
  };
}

export function useAccountManager() {
  const loadData = useCallback(async (
    accountId: string,
    status: SessionStatus | null | undefined,
    options: { refresh?: boolean } = {},
    setContacts: (c: Contact[]) => void,
    setGroups: (g: Group[]) => void,
    replaceAccountConversations: (accountId: string, c: ConversationSummary[]) => void,
    setLoadError: (e: string) => void,
  ) => {
    if (!accountId) return;
    if (!status?.sessionActive) return;
    try {
      const refresh = Boolean(options.refresh);
      const [ct, gp, cv] = await Promise.all([
        api.accountContacts(accountId, refresh),
        api.accountGroups(accountId, refresh),
        api.accountConversations(accountId),
      ]);
      setContacts(ct.contacts);
      setGroups(gp.groups);
      replaceAccountConversations(accountId, cv.conversations);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không tải được dữ liệu');
    }
  }, []);

  const handleLogout = useCallback(async (
    setStatus: (s: SessionStatus | null) => void,
    resetAll: () => void,
    clearComposer: () => void,
    clearCache: () => void,
    setLoadError: (e: string) => void,
    setStatusMsg: (m: string) => void,
    unsubscribe: () => void,
    setKnownAccounts: (a: AccountSummary[]) => void,
    setSelectedAccountId: (id: string) => void,
    activeConversationIdRef: React.MutableRefObject<string>,
    selectionTokenRef: React.MutableRefObject<number>,
  ) => {
    await api.logout().catch(() => {});
    setStatus(null);
    resetAll();
    clearComposer();
    activeConversationIdRef.current = '';
    selectionTokenRef.current += 1;
    clearCache();
    setLoadError('');
    unsubscribe();
    setStatusMsg('Đã đăng xuất.');
    api.status().then(setStatus).catch(() => {});
    api.accounts().then((result) => {
      setKnownAccounts(result.accounts.map(toAccountSummary));
      setSelectedAccountId(result.activeAccountId ?? '');
    }).catch(() => {});
  }, []);

  const handleSelectAccount = useCallback(async (
    accountId: string,
    setSelectedAccountId: (id: string) => void,
    setStatus: (s: SessionStatus | null) => void,
    setStatusMsg: (m: string) => void,
    setLoadError: (e: string) => void,
    setActiveConversationId: (id: string) => void,
    setMessages: (m: any[]) => void,
    clearActivePane: () => void,
    clearComposer: () => void,
    clearCache: () => void,
    unsubscribe: () => void,
    setKnownAccounts: (a: AccountSummary[]) => void,
    loadData: (accountId: string, status: SessionStatus | null | undefined, options?: { refresh?: boolean }) => Promise<void>,
    activeConversationIdRef: React.MutableRefObject<string>,
    selectionTokenRef: React.MutableRefObject<number>,
  ) => {
    setSelectedAccountId(accountId);
    setStatusMsg('Đang chuyển tài khoản...');
    setLoadError('');
    selectionTokenRef.current += 1;
    activeConversationIdRef.current = '';
    setActiveConversationId('');
    setMessages([]);
    clearComposer();
    clearActivePane();
    clearCache();
    unsubscribe();

    try {
      const result = await api.activateAccount(accountId);
      setStatus(result.status);
      const accountsResult = await api.accounts();
      setKnownAccounts(accountsResult.accounts.map(toAccountSummary));
      setSelectedAccountId(accountsResult.activeAccountId ?? accountId);

      if (result.status?.sessionActive) {
        await loadData(accountId, result.status, { refresh: true });
        setStatusMsg('Đã chuyển tài khoản.');
      } else {
        setStatusMsg('Tài khoản chưa active. Nhấn để đăng nhập lại bằng QR.');
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không chuyển được tài khoản');
      setStatusMsg('');
      api.status().then((s) => {
        setStatus(s);
        setSelectedAccountId(s?.account?.userId ?? accountId);
      }).catch(() => {});
      api.accounts().then((result) => {
        setKnownAccounts(result.accounts.map(toAccountSummary));
      }).catch(() => {});
    }
  }, []);

  return { loadData, handleLogout, handleSelectAccount };
}
