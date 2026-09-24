import { useCallback, useRef } from 'react';
import { bff, type AccountStatusSummary } from '../bff-api';
import type { AccountSummary, Contact, ConversationSummary, Group, SessionStatus } from '../types';
import { chatSession } from '../features/chat/model/chat-session';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useComposerStore } from '../stores/composer-store';
import { clientDb } from '../lib/client-db';
import { useChatStore } from '../stores/chat-store';

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
  const loadTokens = useRef(new Map<string, number>());
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
    const session = chatSession.capture();
    const token = (loadTokens.current.get(accountId) || 0) + 1;
    loadTokens.current.set(accountId, token);
    const current = () => chatSession.valid(session) && loadTokens.current.get(accountId) === token;
    const active = () => current() && useWorkspaceStore.getState().selectedAccountId === accountId;
    try {
      const refresh = Boolean(options.refresh);
      // Stored sidebar history must not wait on provider metadata/reconnection.
      let fresh = false;
      const snapshot = useChatStore.getState().conversationsByAccount[accountId];
      void clientDb.getConversations(accountId).then((rows) => {
        if (active() && !fresh && rows.length && useChatStore.getState().conversationsByAccount[accountId] === snapshot) replaceAccountConversations(accountId, rows);
      });
      const summaries = bff.chatGetConversations(accountId).then((result) => {
        if (!current()) return;
        fresh = true;
        replaceAccountConversations(accountId, result.conversations);
        void clientDb.saveConversations(accountId, result.conversations);
      });
      void bff.workspaceLoadMetadata(accountId, refresh).then((result) => {
        if (!active()) return;
        if (result.contacts) setContacts(result.contacts.contacts);
        if (result.groups) setGroups(result.groups.groups);
      }).catch(() => {});
      await summaries;
      if (active()) setLoadError('');
    } catch (error) {
      if (active()) setLoadError(error instanceof Error ? error.message : 'Khong tai duoc du lieu');
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
    chatSession.setUser('');
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
    const session = chatSession.capture();
    setStatusMsg('Dang chuyen tai khoan...');
    setLoadError('');
    selectionTokenRef.current += 1;
    const token = selectionTokenRef.current;
    const active = () => chatSession.valid(session) && token === selectionTokenRef.current && useWorkspaceStore.getState().selectedAccountId === accountId;
    activeConversationIdRef.current = '';
    setActiveConversationId('');
    setMessages([]);
    useComposerStore.getState().selectKey('');
    clearActivePane();
    unsubscribe();
    setStatus(null);
    void loadData(accountId, null);

    try {
      const result = await bff.activateAccount(accountId);
      if (!active()) return;
      setStatus(result.status);
      const accountsResult = await bff.workspaceInit();
      if (!active()) return;
      if (accountsResult.accounts) {
        setKnownAccounts(accountsResult.accounts.accounts.map(toAccountSummary));
      }

      if (result.status?.sessionActive) {
        await loadData(accountId, result.status, { refresh: true });
        if (active()) setStatusMsg('Da chuyen tai khoan.');
      } else {
        setStatusMsg('Tai khoan chua active. Nhan de dang nhap lai bang QR.');
      }
    } catch (error) {
      if (!active()) return;
      setLoadError(error instanceof Error ? error.message : 'Khong chuyen duoc tai khoan');
      setStatusMsg('');
      bff.workspaceInit().then((r) => {
        if (!active()) return;
        if (r.accounts) {
          setKnownAccounts(r.accounts.accounts.map(toAccountSummary));
        }
      }).catch(() => {});
    }
  }, []);

  return { loadData, handleLogout, handleSelectAccount };
}
