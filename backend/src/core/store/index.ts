import knexConstructor from 'knex';
import type { Knex } from 'knex';
import type {
  GoldAccountRecord,
  GoldContactRecord,
  GoldConversationMessage,
  GoldConversationSummary,
  GoldGroupRecord,
  GoldStoredCredential,
} from '../types.js';
import { GoldAccountRepo } from './account-repo.js';
import { GoldContactRepo } from './contact-repo.js';
import { GoldConversationRepo } from './conversation-repo.js';
import { GoldGroupRepo } from './group-repo.js';
import { GoldMessageRepo } from './message-repo.js';

function createKnexConfig(env: string): Knex.Config {
  return {
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgresql://zalohub:zalohub@localhost:5432/zalohub',
    pool: { min: 2, max: env === 'production' ? 20 : 10 },
    migrations: {
      directory: './db/migrations',
      extension: env === 'production' ? 'js' : 'ts',
    },
  };
}

export class GoldStore {
  private readonly knex: Knex;
  readonly accountRepo: GoldAccountRepo;
  private readonly contactRepo: GoldContactRepo;
  private readonly groupRepo: GoldGroupRepo;
  private readonly messageRepo: GoldMessageRepo;
  private readonly conversationRepo: GoldConversationRepo;

  constructor(knex?: Knex) {
    this.knex = knex ?? knexConstructor(createKnexConfig(process.env.NODE_ENV || 'development'));
    this.accountRepo = new GoldAccountRepo(this.knex);

    const resolveAccountId = (accountId?: string) => this.accountRepo.resolveAccountId(accountId);
    const requireAccountId = (accountId?: string) => this.accountRepo.requireAccountId(accountId);

    this.contactRepo = new GoldContactRepo(this.knex, resolveAccountId, requireAccountId);
    this.groupRepo = new GoldGroupRepo(this.knex, resolveAccountId, requireAccountId);

    const getGroupDisplayName = async (groupId: string, accountId?: string) =>
      this.groupRepo.getGroupDisplayName(groupId, undefined, accountId);
    const getGroupAvatar = async (groupId: string, accountId?: string) =>
      this.groupRepo.getGroupAvatar(groupId, undefined, accountId);
    const getFriendDisplayName = async (friendId: string, accountId?: string) =>
      this.contactRepo.getFriendDisplayName(friendId, undefined, accountId);
    const getFriendAvatar = async (friendId: string, accountId?: string) =>
      this.contactRepo.getFriendAvatar(friendId, undefined, accountId);

    this.conversationRepo = new GoldConversationRepo(
      this.knex,
      resolveAccountId,
      getGroupDisplayName,
      getGroupAvatar,
      getFriendDisplayName,
      getFriendAvatar,
    );

    this.messageRepo = new GoldMessageRepo(this.knex, resolveAccountId, requireAccountId);
  }

  async init() {
    if (!this.knex) return;
    await this.knex.migrate.latest();
    await this.accountRepo.init();
  }

  getKnex(): Knex {
    return this.knex;
  }

  // --- Account methods ---

  async getCredential() {
    return this.accountRepo.getCredential();
  }

  async getCredentialForAccount(accountId: string) {
    return this.accountRepo.getCredentialForAccount(accountId);
  }

  async setCredential(credential: GoldStoredCredential) {
    return this.accountRepo.setCredential(credential);
  }

  async setCredentialForAccount(accountId: string, credential: GoldStoredCredential) {
    return this.accountRepo.setCredentialForAccount(accountId, credential);
  }

  async setActiveAccount(account: GoldAccountRecord) {
    return this.accountRepo.setActiveAccount(account);
  }

  getCurrentAccountId() {
    return this.accountRepo.getCurrentAccountId();
  }

  async activateAccount(accountId: string) {
    return this.accountRepo.activateAccount(accountId);
  }

  async updateActiveAccountProfile(profile: { hubAlias?: string; displayName?: string; phoneNumber?: string; avatar?: string }) {
    return this.accountRepo.updateActiveAccountProfile(profile);
  }

  async updateAccountProfile(accountId: string | undefined, profile: { hubAlias?: string; displayName?: string; phoneNumber?: string; avatar?: string }) {
    return this.accountRepo.updateAccountProfile(accountId, profile);
  }

  async getActiveAccount() {
    return this.accountRepo.getActiveAccount();
  }

  async listAccounts(): Promise<GoldAccountRecord[]> {
    return this.accountRepo.listAccounts();
  }

  async clearSession() {
    return this.accountRepo.clearSession();
  }

  async clearSessionForAccount(accountId?: string) {
    return this.accountRepo.clearSessionForAccount(accountId);
  }

  async clearAll() {
    return this.accountRepo.clearAll();
  }

  async save() {
    return this.accountRepo.save();
  }

  // --- Contact methods ---

  async listContacts() {
    return this.contactRepo.listContacts(this.accountRepo.activeAccountId);
  }

  async listContactsByAccount(accountId?: string) {
    return this.contactRepo.listContactsByAccount(accountId);
  }

  async listFriends() {
    return this.contactRepo.listFriends(this.accountRepo.activeAccountId);
  }

  async replaceContacts(friends: Omit<GoldContactRecord, 'id'>[]) {
    return this.contactRepo.replaceContacts(this.accountRepo.activeAccountId, friends);
  }

  async replaceContactsByAccount(accountId: string | undefined, friends: Omit<GoldContactRecord, 'id'>[]) {
    return this.contactRepo.replaceContactsByAccount(accountId, friends);
  }

  async upsertContact(contact: Omit<GoldContactRecord, 'id'>) {
    return this.contactRepo.upsertContact(this.accountRepo.activeAccountId, contact);
  }

  async upsertContactByAccount(accountId: string | undefined, contact: Omit<GoldContactRecord, 'id'>) {
    return this.contactRepo.upsertContactByAccount(accountId, contact);
  }

  async replaceFriends(friends: Omit<GoldContactRecord, 'id'>[]) {
    return this.contactRepo.replaceFriends(this.accountRepo.activeAccountId, friends);
  }

  // --- Group methods ---

  async listGroups(): Promise<GoldGroupRecord[]> {
    return this.groupRepo.listGroups(this.accountRepo.activeAccountId);
  }

  async listGroupsByAccount(accountId?: string): Promise<GoldGroupRecord[]> {
    return this.groupRepo.listGroupsByAccount(accountId);
  }

  async replaceGroups(groups: Omit<GoldGroupRecord, 'id'>[]) {
    return this.groupRepo.replaceGroups(this.accountRepo.activeAccountId, groups);
  }

  async replaceGroupsByAccount(accountId: string | undefined, groups: Omit<GoldGroupRecord, 'id'>[]) {
    return this.groupRepo.replaceGroupsByAccount(accountId, groups);
  }

  async upsertGroup(group: Omit<GoldGroupRecord, 'id'>) {
    return this.groupRepo.upsertGroup(this.accountRepo.activeAccountId, group);
  }

  async upsertGroupByAccount(accountId: string | undefined, group: Omit<GoldGroupRecord, 'id'>) {
    return this.groupRepo.upsertGroupByAccount(accountId, group);
  }

  // --- Message methods ---

  async listConversationMessages(conversationId: string, options: { before?: string; limit?: number } = {}): Promise<GoldConversationMessage[]> {
    return this.messageRepo.listConversationMessages(this.accountRepo.activeAccountId, conversationId, options);
  }

  async listConversationMessagesByAccount(accountId: string | undefined, conversationId: string, options: { before?: string; limit?: number } = {}): Promise<GoldConversationMessage[]> {
    return this.messageRepo.listConversationMessagesByAccount(accountId, conversationId, options);
  }

  async hasMessageByProviderId(conversationId: string, providerMessageId: string) {
    return this.messageRepo.hasMessageByProviderId(this.accountRepo.activeAccountId, conversationId, providerMessageId);
  }

  async hasMessageByProviderIdForAccount(accountId: string | undefined, conversationId: string, providerMessageId: string) {
    return this.messageRepo.hasMessageByProviderIdForAccount(accountId, conversationId, providerMessageId);
  }

  async replaceConversationMessages(conversationId: string, messages: GoldConversationMessage[]): Promise<GoldConversationMessage[]> {
    const upsertConversation = (accountId: string, convId: string, msgs: GoldConversationMessage[], trx?: Knex.Transaction) =>
      this.conversationRepo.upsertConversation(accountId, convId, msgs, trx);
    return this.messageRepo.replaceConversationMessages(this.accountRepo.activeAccountId, conversationId, messages, upsertConversation);
  }

  async replaceConversationMessagesByAccount(accountId: string | undefined, conversationId: string, messages: GoldConversationMessage[]): Promise<GoldConversationMessage[]> {
    const upsertConversation = (acctId: string, convId: string, msgs: GoldConversationMessage[], trx?: Knex.Transaction) =>
      this.conversationRepo.upsertConversation(acctId, convId, msgs, trx);
    return this.messageRepo.replaceConversationMessagesByAccount(accountId, conversationId, messages, upsertConversation);
  }

  async appendConversationMessage(message: GoldConversationMessage): Promise<GoldConversationMessage[]> {
    const upsertConversation = (accountId: string, convId: string, msgs: GoldConversationMessage[], trx?: Knex.Transaction) =>
      this.conversationRepo.upsertConversation(accountId, convId, msgs, trx);
    return this.messageRepo.appendConversationMessage(this.accountRepo.activeAccountId, message, upsertConversation);
  }

  async updateMessageReactions(accountId: string, providerMessageId: string, reactions: { emoji: string; count: number; userIds?: string[] }[]) {
    return this.messageRepo.updateMessageReactions(accountId, providerMessageId, reactions);
  }

  // --- Conversation methods ---

  async listConversationSummaries(): Promise<GoldConversationSummary[]> {
    return this.conversationRepo.listConversationSummaries(this.accountRepo.activeAccountId);
  }

  async listConversationSummariesByAccount(accountId?: string): Promise<GoldConversationSummary[]> {
    return this.conversationRepo.listConversationSummariesByAccount(accountId);
  }

  async canonicalizeConversationData() {
    return this.conversationRepo.canonicalizeConversationDataForAccount(
      this.accountRepo.activeAccountId,
    );
  }

  async canonicalizeConversationDataForAccount(accountId?: string) {
    return this.conversationRepo.canonicalizeConversationDataForAccount(accountId);
  }

  async enrichConversationMessageSenders(conversationId: string): Promise<GoldConversationMessage[]> {
    const listMessages = async (accountId: string | undefined, convId: string) =>
      this.messageRepo.listConversationMessagesByAccount(accountId, convId);
    const listGroups = async (accountId?: string) =>
      this.groupRepo.listGroupsByAccount(accountId);
    const listContacts = async (accountId?: string) =>
      this.contactRepo.listContactsByAccount(accountId);
    const replaceMessages = async (accountId: string | undefined, convId: string, messages: GoldConversationMessage[]) => {
      const upsertConversation = (acctId: string, cId: string, msgs: GoldConversationMessage[], trx?: Knex.Transaction) =>
        this.conversationRepo.upsertConversation(acctId, cId, msgs, trx);
      return this.messageRepo.replaceConversationMessagesByAccount(accountId, convId, messages, upsertConversation);
    };
    return this.conversationRepo.enrichConversationMessageSenders(
      this.accountRepo.activeAccountId,
      conversationId,
      listMessages,
      listGroups,
      listContacts,
      replaceMessages,
    );
  }

  async enrichConversationMessageSendersByAccount(accountId: string | undefined, conversationId: string): Promise<GoldConversationMessage[]> {
    const listMessages = async (acctId: string | undefined, convId: string) =>
      this.messageRepo.listConversationMessagesByAccount(acctId, convId);
    const listGroups = async (acctId?: string) =>
      this.groupRepo.listGroupsByAccount(acctId);
    const listContacts = async (acctId?: string) =>
      this.contactRepo.listContactsByAccount(acctId);
    const replaceMessages = async (acctId: string | undefined, convId: string, messages: GoldConversationMessage[]) => {
      const upsertConversation = (aId: string, cId: string, msgs: GoldConversationMessage[], trx?: Knex.Transaction) =>
        this.conversationRepo.upsertConversation(aId, cId, msgs, trx);
      return this.messageRepo.replaceConversationMessagesByAccount(acctId, convId, messages, upsertConversation);
    };
    return this.conversationRepo.enrichConversationMessageSendersByAccount(
      accountId,
      conversationId,
      listMessages,
      listGroups,
      listContacts,
      replaceMessages,
    );
  }
}
