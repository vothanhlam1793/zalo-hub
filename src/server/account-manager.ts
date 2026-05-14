import { GoldLogger } from '../core/logger.js';
import { GoldRuntime } from '../core/runtime.js';
import { GoldStore } from '../core/store.js';
import type { GoldAccountRecord, GoldConversationMessage } from '../core/types.js';

export type AccountMessageEvent = {
  accountId: string;
  message: GoldConversationMessage;
};

export class AccountRuntimeManager {
  private readonly registryStore = new GoldStore();
  private readonly runtimes = new Map<string, GoldRuntime>();
  private readonly runtimeStartPromises = new Map<string, Promise<GoldRuntime>>();
  private readonly messageListeners = new Set<(event: AccountMessageEvent) => void>();

  constructor(private readonly logger: GoldLogger) {}

  listAccounts(): GoldAccountRecord[] {
    return this.registryStore.listAccounts();
  }

  getRegistryStore() {
    return this.registryStore;
  }

  onConversationMessage(listener: (event: AccountMessageEvent) => void) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  getRuntime(accountId: string) {
    return this.runtimes.get(accountId);
  }

  hasRuntime(accountId: string) {
    return this.runtimes.has(accountId.trim());
  }

  getPrimaryAccountId() {
    return this.registryStore.getCurrentAccountId();
  }

  activatePrimaryAccount(accountId: string) {
    this.registryStore.activateAccount(accountId);
  }

  stopRuntime(accountId: string) {
    this.runtimes.delete(accountId.trim());
    this.runtimeStartPromises.delete(accountId.trim());
  }

  getPrimaryRuntime() {
    const accountId = this.getPrimaryAccountId();
    if (!accountId) {
      return undefined;
    }
    return this.runtimes.get(accountId);
  }

  async ensureRuntime(accountId: string) {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      throw new Error('accountId la bat buoc');
    }

    const existing = this.runtimes.get(normalizedAccountId);
    if (existing) {
      return existing;
    }

    const activeStart = this.runtimeStartPromises.get(normalizedAccountId);
    if (activeStart) {
      return activeStart;
    }

    const startPromise = (async () => {
      const store = new GoldStore();
      const runtime = new GoldRuntime(store, this.logger, { boundAccountId: normalizedAccountId });
      runtime.onConversationMessage((message) => {
        for (const listener of this.messageListeners) {
          listener({ accountId: normalizedAccountId, message });
        }
      });
      await runtime.startBoundAccount();
      this.runtimes.set(normalizedAccountId, runtime);
      this.logger.info('account_runtime_ready', { accountId: normalizedAccountId });
      return runtime;
    })();

    this.runtimeStartPromises.set(normalizedAccountId, startPromise);

    try {
      return await startPromise;
    } finally {
      this.runtimeStartPromises.delete(normalizedAccountId);
    }
  }

  async warmStartAllAccounts() {
    const accounts = this.listAccounts().filter((account) => this.registryStore.getCredentialForAccount(account.accountId));
    await Promise.all(accounts.map(async (account) => {
      try {
        await this.ensureRuntime(account.accountId);
      } catch (error) {
        this.logger.error('account_runtime_warm_start_failed', {
          accountId: account.accountId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }));
  }

  async ensurePrimaryRuntime() {
    const accountId = this.getPrimaryAccountId();
    if (!accountId) {
      return undefined;
    }
    return this.ensureRuntime(accountId);
  }

  getRuntimeStatus(accountId: string) {
    const runtime = this.getRuntime(accountId);
    const account = this.registryStore.listAccounts().find((entry) => entry.accountId === accountId);
    return {
      accountId,
      displayName: account?.displayName,
      phoneNumber: account?.phoneNumber,
      hasCredential: Boolean(this.registryStore.getCredentialForAccount(accountId)),
      runtimeLoaded: Boolean(runtime),
      sessionActive: runtime?.isSessionActive() ?? false,
      listener: runtime?.getListenerState(),
      account: runtime?.getCurrentAccount(),
      qrCodeAvailable: Boolean(runtime?.getCurrentQrCode()),
    };
  }

  listAccountStatuses() {
    return this.listAccounts().map((account) => this.getRuntimeStatus(account.accountId));
  }
}
