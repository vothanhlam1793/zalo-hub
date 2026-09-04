import { useCallback } from 'react';
import { bff, type AccountStatusSummary } from '../bff-api';
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
      const result = await bff.workspaceLoadAccount(accountId, refresh);
      if (result.contacts) setContacts(result.contacts.contacts);
      if (result.groups) setGroups(result.groups.groups);
      if (result.conversations) replaceAccountConversations(accountId, result.conversations.conversations);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Khong tai duoc du lieu');
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
    await bff.authLogout().catch(() => {});
    setStatus(null);
    resetAll();
    clearComposer();
    activeConversationIdRef.current = '';
    selectionTokenRef.current += 1;
    clearCache();
    setLoadError('');
    unsubscribe();
    setStatusMsg('Da dang xuat.');
    bff.workspaceInit().then((result) => {
      if (result.status) setStatus(result.status);
      if (result.accounts) {
        setKnownAccounts(result.accounts.accounts.map(toAccountSummary));
        setSelectedAccountId(result.accounts.activeAccountId ?? '');
      }
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
    setStatusMsg('Dang chuyen tai khoan...');
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
      const result = await bff.activateAccount(accountId);
      setStatus(result.status);
      const accountsResult = await bff.workspaceInit();
      if (accountsResult.accounts) {
        setKnownAccounts(accountsResult.accounts.accounts.map(toAccountSummary));
        setSelectedAccountId(accountsResult.accounts.activeAccountId ?? accountId);
      }

      if (result.status?.sessionActive) {
        await loadData(accountId, result.status, { refresh: true });
        setStatusMsg('Da chuyen tai khoan.');
      } else {
        setStatusMsg('Tai khoan chua active. Nhan de dang nhap lai bang QR.');
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Khong chuyen duoc tai khoan');
      setStatusMsg('');
      bff.workspaceInit().then((r) => {
        if (r.status) setStatus(r.status);
        if (r.accounts) {
          setKnownAccounts(r.accounts.accounts.map(toAccountSummary));
          setSelectedAccountId(r.accounts.activeAccountId ?? accountId);
        }
      }).catch(() => {});
    }
  }, []);

  return { loadData, handleLogout, handleSelectAccount };
}
