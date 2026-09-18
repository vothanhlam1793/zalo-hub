import type { AccountSummary, Contact, ConversationSummary, Group, HistorySyncResult, Message, SessionStatus } from './types';
import { api } from './api';

export type { AccountStatusSummary } from './api';

export const bff = {
  authLogin: async (email: string, password: string) => {
    const res = await api.authLogin(email, password);
    localStorage.setItem('auth_token', res.token);
    return { user: { ...res.user, role: (res.user as any).role || 'user' } };
  },

  authLogout: async () => {
    await api.logout().catch(() => {});
    localStorage.removeItem('auth_token');
    return { ok: true };
  },

  authMe: async () => {
    const token = localStorage.getItem('auth_token') || '';
    const res = await api.authMe(token);
    return { user: { ...res.user, role: (res.user as any).role || 'user' } };
  },

  workspaceInit: async () => {
    const [status, accs, myAccs] = await Promise.all([
      api.status().catch(() => null),
      api.accounts().catch(() => null),
      api.myAccounts().catch(() => null),
    ]);
    return {
      status,
      accounts: accs,
      myAccounts: myAccs,
    };
  },

  workspaceLoadAccount: async (accountId: string, refresh = false) => {
    const [contacts, groups, conversations] = await Promise.all([
      api.accountContacts(accountId, refresh).catch(() => ({ contacts: [] })),
      api.accountGroups(accountId, refresh).catch(() => ({ groups: [] })),
      api.accountConversations(accountId).catch(() => ({ conversations: [] })),
    ]);
    return {
      contacts,
      groups,
      conversations,
    };
  },

  chatOpenConversation: async (accountId: string, conversationId: string, options: { since?: string; before?: string; limit?: number } = {}) => {
    const [messages, metadata] = await Promise.all([
      api.accountMessages(accountId, conversationId, options).catch(() => null),
      api.accountSyncMetadata(accountId, conversationId).catch(() => null),
    ]);
    return { messages, metadata };
  },

  chatGetMessages: (accountId: string, conversationId: string, options: { since?: string; before?: string; limit?: number } = {}) =>
    api.accountMessages(accountId, conversationId, options),

  tagsList: (accountId?: string) => api.listTags(accountId),
  tagCreate: (data: { name: string; color?: string; emoji?: string; source?: string; accountId?: string }) => api.createTag(data),
  tagDelete: (tagId: string) => api.deleteTag(tagId),
  tagAssign: (conversationId: string, tagId: string, accountId?: string) => api.assignTag(conversationId, tagId, accountId),
  tagUnassign: (conversationId: string, tagId: string, accountId?: string) => api.unassignTag(conversationId, tagId, accountId),
  tagsSync: (accountId: string) => api.syncTags(accountId),

  chatGetConversations: (accountId: string) =>
    api.accountConversations(accountId),

  send: (params: {
    accountId: string; conversationId: string;
    text?: string; type?: string; caption?: string;
    stickerId?: string; catId?: string;
  }, file?: File) => {
    if (file) {
      return api.accountSendAttachment(params.accountId, params.conversationId, file, params.caption);
    }
    if (params.type === 'sticker' && params.stickerId && params.catId) {
      return api.accountSendSticker(params.accountId, params.conversationId, params.stickerId, params.catId);
    }
    return api.accountSend(params.accountId, params.conversationId, params.text || '');
  },

  sendTyping: (accountId: string, conversationId: string, isTyping: boolean) =>
    api.accountSendTyping(accountId, conversationId, isTyping),

  sendReaction: (accountId: string, conversationId: string, messageId: string, cliMsgId: string, icon: string) =>
    api.accountAddReaction(accountId, conversationId, messageId, cliMsgId, icon),

  updateReadState: (accountId: string, conversationId: string, readAt: string) =>
    api.accountUpdateReadState(accountId, conversationId, readAt),

  forwardMessage: (accountId: string, conversationId: string, messageId: string, toThreadId: string, toType: string) =>
    api.accountForwardMessage(accountId, conversationId, messageId, toThreadId, toType),

  createPoll: (accountId: string, groupId: string, question: string, options: string[]) =>
    api.accountCreatePoll(accountId, groupId, question, options),

  loginStart: () => api.loginStart(),
  loginQr: () => api.loginQr(),
  reconnectStart: (accountId: string) => api.reconnectStart(accountId),
  reconnectQr: (accountId: string) => api.reconnectQr(accountId),
  activateAccount: (accountId: string) => api.activateAccount(accountId),
  updateAccountProfile: (accountId: string, updates: { displayName?: string; hubAlias?: string }) =>
    api.updateAccountProfile(accountId, updates),

  syncHistory: (accountId: string, conversationId: string, options: { beforeMessageId?: string; timeoutMs?: number } = {}) =>
    api.accountSyncHistory(accountId, conversationId, options.beforeMessageId, options.timeoutMs),

  mobileSync: (accountId: string) => api.accountMobileSync(accountId),
  mobileSyncThread: (accountId: string, threadId: string, threadType: 'direct' | 'group', timeoutMs?: number) =>
    api.accountMobileSyncThread(accountId, threadId, threadType, timeoutMs),
  syncAll: (accountId: string) => api.accountSyncAll(accountId),
  restartAccount: (accountId: string) => api.accountRestart(accountId),

  myAccounts: () => api.myAccounts(),
  setAccountVisible: (accountId: string, visible: boolean) => api.setAccountVisible(accountId, visible),
  adminUsers: () => api.adminUsers(),
  adminCreateUser: (email: string, password: string, displayName: string) =>
    api.adminCreateUser(email, password, displayName),
  adminUpdateUser: (userId: string, updates: { role?: string; displayName?: string; password?: string; type?: string }) =>
    api.adminUpdateUser(userId, updates),
  adminDeleteUser: (userId: string) => api.adminDeleteUser(userId),

  status: () => api.status(),
  accounts: () => api.accounts(),
  accountStatus: (accountId: string) => api.accountStatus(accountId),

  adminAllAccounts: () => api.adminAllAccounts(),
  adminAccountEntities: (accountId: string) => api.adminAccountEntities(accountId),
  adminAddMember: (accountId: string, email: string, role: string) =>
    api.adminAddMember(accountId, email, role),
  adminRemoveMember: (accountId: string, userId: string) =>
    api.adminRemoveMember(accountId, userId),
  adminUpdateMemberRole: (accountId: string, userId: string, role: string) =>
    api.adminUpdateMemberRole(accountId, userId, role),
  adminTransferMaster: (accountId: string, userId: string) =>
    api.adminTransferMaster(accountId, userId),
  adminDeleteAccount: (accountId: string) => api.adminDeleteAccount(accountId),
  adminLogoutAccount: (accountId: string) => api.adminLogoutAccount(accountId),
  adminUpdateAccount: (accountId: string, updates: { hubAlias?: string }) =>
    api.adminUpdateAccount(accountId, updates),
  adminSyncAccountProfile: (accountId: string) => api.adminSyncAccountProfile(accountId),

  adminBots: () => api.adminBots(),
  adminBotCreate: (data: Record<string, unknown>) => api.adminBotCreate(data),
  adminBotUpdate: (id: string, data: Record<string, unknown>) => api.adminBotUpdate(id, data),
  adminBotDelete: (id: string) => api.adminBotDelete(id),
};
