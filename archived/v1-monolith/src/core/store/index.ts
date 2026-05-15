import { existsSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir } from '../media-store.js';
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
import { GoldStoreSchema } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(dataDir, 'gold-4.sqlite');

function ensureDataDir() {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

export class GoldStore {
  private readonly db: DatabaseSync;
  private readonly accountRepo: GoldAccountRepo;
  private readonly contactRepo: GoldContactRepo;
  private readonly groupRepo: GoldGroupRepo;
  private readonly messageRepo: GoldMessageRepo;
  private readonly conversationRepo: GoldConversationRepo;
  private readonly schema: GoldStoreSchema;

  constructor() {
    ensureDataDir();
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec('PRAGMA journal_mode = WAL');

    this.schema = new GoldStoreSchema(this.db);
    this.schema.migrate();

    this.accountRepo = new GoldAccountRepo(this.db);
    const resolveAccountId = (accountId?: string) => this.accountRepo.resolveAccountId(accountId);
    const requireAccountId = (accountId?: string) => this.accountRepo.requireAccountId(accountId);
    const runInTransaction = (work: () => void) => this.accountRepo.runInTransaction(work);

    this.contactRepo = new GoldContactRepo(this.db, resolveAccountId, requireAccountId, runInTransaction);
    this.groupRepo = new GoldGroupRepo(this.db, resolveAccountId, requireAccountId, runInTransaction);

    const getGroupDisplayName = (groupId: string, accountId?: string) =>
      this.groupRepo.getGroupDisplayName(groupId, undefined, accountId);
    const getGroupAvatar = (groupId: string, accountId?: string) =>
      this.groupRepo.getGroupAvatar(groupId, undefined, accountId);
    const getFriendDisplayName = (friendId: string, accountId?: string) =>
      this.contactRepo.getFriendDisplayName(friendId, undefined, accountId);
    const getFriendAvatar = (friendId: string, accountId?: string) =>
      this.contactRepo.getFriendAvatar(friendId, undefined, accountId);

    this.conversationRepo = new GoldConversationRepo(
      this.db,
      resolveAccountId,
      getGroupDisplayName,
      getGroupAvatar,
      getFriendDisplayName,
      getFriendAvatar,
    );

    const upsertConversation = (accountId: string, conversationId: string, messages: GoldConversationMessage[]) =>
      this.conversationRepo.upsertConversation(accountId, conversationId, messages);

    this.messageRepo = new GoldMessageRepo(this.db, resolveAccountId, requireAccountId);

    this.accountRepo.importLegacyStateIfNeeded(
      (friends) => this.contactRepo.replaceFriends(this.accountRepo.activeAccountId, friends),
      (conversationId, messages) =>
        this.messageRepo.replaceConversationMessages(
          this.accountRepo.activeAccountId,
          conversationId,
          messages,
          upsertConversation,
        ),
    );

    this.schema.backfillConversationColumns(this.accountRepo.activeAccountId);
  }

  getDb(): DatabaseSync {
    return this.db;
  }

  // --- Account methods ---

  getCredential() {
    return this.accountRepo.getCredential();
  }

  getCredentialForAccount(accountId: string) {
    return this.accountRepo.getCredentialForAccount(accountId);
  }

  setCredential(credential: GoldStoredCredential) {
    return this.accountRepo.setCredential(credential);
  }

  setCredentialForAccount(accountId: string, credential: GoldStoredCredential) {
    return this.accountRepo.setCredentialForAccount(accountId, credential);
  }

  setActiveAccount(account: GoldAccountRecord) {
    return this.accountRepo.setActiveAccount(account);
  }

  getCurrentAccountId() {
    return this.accountRepo.getCurrentAccountId();
  }

  activateAccount(accountId: string) {
    return this.accountRepo.activateAccount(accountId);
  }

  updateActiveAccountProfile(profile: { hubAlias?: string; displayName?: string; phoneNumber?: string; avatar?: string }) {
    return this.accountRepo.updateActiveAccountProfile(profile);
  }

  updateAccountProfile(accountId: string | undefined, profile: { hubAlias?: string; displayName?: string; phoneNumber?: string; avatar?: string }) {
    return this.accountRepo.updateAccountProfile(accountId, profile);
  }

  getActiveAccount() {
    return this.accountRepo.getActiveAccount();
  }

  listAccounts(): GoldAccountRecord[] {
    return this.accountRepo.listAccounts();
  }

  clearSession() {
    return this.accountRepo.clearSession();
  }

  clearSessionForAccount(accountId?: string) {
    return this.accountRepo.clearSessionForAccount(accountId);
  }

  clearAll() {
    return this.accountRepo.clearAll();
  }

  save() {
    return this.accountRepo.save();
  }

  // --- Contact methods ---

  listContacts() {
    return this.contactRepo.listContacts(this.accountRepo.activeAccountId);
  }

  listContactsByAccount(accountId?: string) {
    return this.contactRepo.listContactsByAccount(accountId);
  }

  listFriends() {
    return this.contactRepo.listFriends(this.accountRepo.activeAccountId);
  }

  replaceContacts(friends: Omit<GoldContactRecord, 'id'>[]) {
    return this.contactRepo.replaceContacts(this.accountRepo.activeAccountId, friends);
  }

  replaceContactsByAccount(accountId: string | undefined, friends: Omit<GoldContactRecord, 'id'>[]) {
    return this.contactRepo.replaceContactsByAccount(accountId, friends);
  }

  upsertContact(contact: Omit<GoldContactRecord, 'id'>) {
    return this.contactRepo.upsertContact(this.accountRepo.activeAccountId, contact);
  }

  upsertContactByAccount(accountId: string | undefined, contact: Omit<GoldContactRecord, 'id'>) {
    return this.contactRepo.upsertContactByAccount(accountId, contact);
  }

  replaceFriends(friends: Omit<GoldContactRecord, 'id'>[]) {
    return this.contactRepo.replaceFriends(this.accountRepo.activeAccountId, friends);
  }

  // --- Group methods ---

  listGroups(): GoldGroupRecord[] {
    return this.groupRepo.listGroups(this.accountRepo.activeAccountId);
  }

  listGroupsByAccount(accountId?: string): GoldGroupRecord[] {
    return this.groupRepo.listGroupsByAccount(accountId);
  }

  replaceGroups(groups: Omit<GoldGroupRecord, 'id'>[]) {
    return this.groupRepo.replaceGroups(this.accountRepo.activeAccountId, groups);
  }

  replaceGroupsByAccount(accountId: string | undefined, groups: Omit<GoldGroupRecord, 'id'>[]) {
    return this.groupRepo.replaceGroupsByAccount(accountId, groups);
  }

  upsertGroup(group: Omit<GoldGroupRecord, 'id'>) {
    return this.groupRepo.upsertGroup(this.accountRepo.activeAccountId, group);
  }

  upsertGroupByAccount(accountId: string | undefined, group: Omit<GoldGroupRecord, 'id'>) {
    return this.groupRepo.upsertGroupByAccount(accountId, group);
  }

  // --- Message methods ---

  listConversationMessages(conversationId: string, options: { before?: string; limit?: number } = {}): GoldConversationMessage[] {
    return this.messageRepo.listConversationMessages(this.accountRepo.activeAccountId, conversationId, options);
  }

  listConversationMessagesByAccount(accountId: string | undefined, conversationId: string, options: { before?: string; limit?: number } = {}): GoldConversationMessage[] {
    return this.messageRepo.listConversationMessagesByAccount(accountId, conversationId, options);
  }

  hasMessageByProviderId(conversationId: string, providerMessageId: string) {
    return this.messageRepo.hasMessageByProviderId(this.accountRepo.activeAccountId, conversationId, providerMessageId);
  }

  hasMessageByProviderIdForAccount(accountId: string | undefined, conversationId: string, providerMessageId: string) {
    return this.messageRepo.hasMessageByProviderIdForAccount(accountId, conversationId, providerMessageId);
  }

  replaceConversationMessages(conversationId: string, messages: GoldConversationMessage[]): GoldConversationMessage[] {
    const upsertConversation = (accountId: string, convId: string, msgs: GoldConversationMessage[]) =>
      this.conversationRepo.upsertConversation(accountId, convId, msgs);
    return this.messageRepo.replaceConversationMessages(this.accountRepo.activeAccountId, conversationId, messages, upsertConversation);
  }

  replaceConversationMessagesByAccount(accountId: string | undefined, conversationId: string, messages: GoldConversationMessage[]): GoldConversationMessage[] {
    const upsertConversation = (acctId: string, convId: string, msgs: GoldConversationMessage[]) =>
      this.conversationRepo.upsertConversation(acctId, convId, msgs);
    return this.messageRepo.replaceConversationMessagesByAccount(accountId, conversationId, messages, upsertConversation);
  }

  appendConversationMessage(message: GoldConversationMessage): GoldConversationMessage[] {
    const upsertConversation = (accountId: string, convId: string, msgs: GoldConversationMessage[]) =>
      this.conversationRepo.upsertConversation(accountId, convId, msgs);
    return this.messageRepo.appendConversationMessage(this.accountRepo.activeAccountId, message, upsertConversation);
  }

  // --- Conversation methods ---

  listConversationSummaries(): GoldConversationSummary[] {
    return this.conversationRepo.listConversationSummaries(this.accountRepo.activeAccountId);
  }

  listConversationSummariesByAccount(accountId?: string): GoldConversationSummary[] {
    return this.conversationRepo.listConversationSummariesByAccount(accountId);
  }

  canonicalizeConversationData() {
    const runInTransaction = (work: () => void) => this.accountRepo.runInTransaction(work);
    return this.conversationRepo.canonicalizeConversationDataForAccount(
      this.accountRepo.activeAccountId,
      runInTransaction,
    );
  }

  canonicalizeConversationDataForAccount(accountId?: string) {
    const runInTransaction = (work: () => void) => this.accountRepo.runInTransaction(work);
    return this.conversationRepo.canonicalizeConversationDataForAccount(accountId, runInTransaction);
  }

  enrichConversationMessageSenders(conversationId: string): GoldConversationMessage[] {
    const listMessages = (accountId: string | undefined, convId: string) =>
      this.messageRepo.listConversationMessagesByAccount(accountId, convId);
    const listGroups = (accountId?: string) =>
      this.groupRepo.listGroupsByAccount(accountId);
    const listContacts = (accountId?: string) =>
      this.contactRepo.listContactsByAccount(accountId);
    const replaceMessages = (accountId: string | undefined, convId: string, messages: GoldConversationMessage[]) => {
      const upsertConversation = (acctId: string, cId: string, msgs: GoldConversationMessage[]) =>
        this.conversationRepo.upsertConversation(acctId, cId, msgs);
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

  enrichConversationMessageSendersByAccount(accountId: string | undefined, conversationId: string): GoldConversationMessage[] {
    const listMessages = (acctId: string | undefined, convId: string) =>
      this.messageRepo.listConversationMessagesByAccount(acctId, convId);
    const listGroups = (acctId?: string) =>
      this.groupRepo.listGroupsByAccount(acctId);
    const listContacts = (acctId?: string) =>
      this.contactRepo.listContactsByAccount(acctId);
    const replaceMessages = (acctId: string | undefined, convId: string, messages: GoldConversationMessage[]) => {
      const upsertConversation = (aId: string, cId: string, msgs: GoldConversationMessage[]) =>
        this.conversationRepo.upsertConversation(aId, cId, msgs);
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
