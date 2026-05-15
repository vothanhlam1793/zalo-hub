import { GoldLogger } from '../core/logger.js';
import { GoldRuntime } from '../core/runtime.js';
import { GoldStore } from '../core/store.js';
import type { Knex } from 'knex';
import type { GoldAccountRecord, GoldConversationMessage } from '../core/types.js';

export type AccountMessageEvent = {
  accountId: string;
  message: GoldConversationMessage;
};

export class AccountRuntimeManager {
  private readonly registryStore: GoldStore;
  private readonly runtimes = new Map<string, GoldRuntime>();
  private readonly runtimeStartPromises = new Map<string, Promise<GoldRuntime>>();
  private readonly messageListeners = new Set<(event: AccountMessageEvent) => void>();
  private readonly watchdogCooldownUntil = new Map<string, number>();
  private readonly lastRecoveryState = new Map<string, {
    at: string;
    action: 'restart_listener' | 'relogin' | 'skip';
    reason: string;
    ok: boolean;
    error?: string;
  }>();
  private broadcast: ((payload: Record<string, unknown>) => void) | undefined;
  private watchdogRunning = false;

  constructor(private readonly logger: GoldLogger, private readonly knex: Knex) {
    this.registryStore = new GoldStore(knex);
    setInterval(() => {
      void this.watchRuntimes();
    }, 30_000).unref();
  }

  setBroadcast(fn: (payload: Record<string, unknown>) => void) {
    this.broadcast = fn;
  }

  async listAccounts(): Promise<GoldAccountRecord[]> {
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

  async activatePrimaryAccount(accountId: string) {
    await this.registryStore.activateAccount(accountId);
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

  getPreferredRuntime() {
    const primaryRuntime = this.getPrimaryRuntime();
    if (primaryRuntime) {
      return primaryRuntime;
    }

    for (const runtime of this.runtimes.values()) {
      if (runtime.isSessionActive()) {
        return runtime;
      }
    }

    return this.runtimes.values().next().value as GoldRuntime | undefined;
  }

  getPreferredAccountId() {
    const primaryAccountId = this.getPrimaryAccountId();
    if (primaryAccountId) {
      return primaryAccountId;
    }

    return this.runtimes.keys().next().value as string | undefined;
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
      const store = new GoldStore(this.knex);
      const runtime = new GoldRuntime(store, this.logger, { boundAccountId: normalizedAccountId });
      runtime.onConversationMessage((message) => {
        for (const listener of this.messageListeners) {
          listener({ accountId: normalizedAccountId, message });
        }
      });
      await runtime.startBoundAccount();
      this.runtimes.set(normalizedAccountId, runtime);
      this.logger.info('account_runtime_ready', { accountId: normalizedAccountId });

      void this.backgroundSyncAfterLogin(runtime, normalizedAccountId);

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
    const allAccounts = await this.listAccounts();
    const accountCreds = await Promise.all(allAccounts.map(async (account) => ({
      account,
      hasCred: Boolean(await this.registryStore.getCredentialForAccount(account.accountId)),
    })));
    const accounts = accountCreds.filter(({ hasCred }) => hasCred).map(({ account }) => account);
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

  private async watchRuntimes() {
    if (this.watchdogRunning) {
      return;
    }
    this.watchdogRunning = true;
    try {
      const now = Date.now();
      const allAccounts = await this.listAccounts();
      const accountCreds = await Promise.all(allAccounts.map(async (account) => ({
        account,
        hasCred: Boolean(await this.registryStore.getCredentialForAccount(account.accountId)),
      })));
      const accounts = accountCreds.filter(({ hasCred }) => hasCred).map(({ account }) => account);

      for (const account of accounts) {
        const accountId = account.accountId.trim();
        const cooldownUntil = this.watchdogCooldownUntil.get(accountId) ?? 0;
        if (cooldownUntil > now) {
          continue;
        }

        const runtime = this.runtimes.get(accountId) ?? await this.ensureRuntime(accountId).catch((error) => {
          this.logger.error('account_runtime_watchdog_ensure_failed', {
            accountId,
            error: error instanceof Error ? error.message : String(error),
          });
          return undefined;
        });
        if (!runtime || !(await runtime.hasCredential())) {
          continue;
        }

        const listener = runtime.getListenerState();
        const disconnectedTooLong = listener.connected === false
          && Boolean(listener.started)
          && Boolean(listener.lastEventAt)
          && (now - Date.parse(listener.lastEventAt as string)) > 60_000;
        const shouldRestartListener = !listener.started || disconnectedTooLong;
        const shouldRelogin = !runtime.isSessionActive();

        if (!shouldRestartListener && !shouldRelogin) {
          continue;
        }

        this.watchdogCooldownUntil.set(accountId, now + 120_000);
        const reason = shouldRelogin
          ? 'session_inactive'
          : !listener.started
            ? 'listener_not_started'
            : 'listener_disconnected';

        try {
          if (shouldRelogin) {
            await runtime.loginWithStoredCredential();
            this.lastRecoveryState.set(accountId, { at: new Date().toISOString(), action: 'relogin', reason, ok: true });
            this.logger.info('account_runtime_watchdog_relogin_ok', { accountId, reason });
          } else {
            runtime.restartListener();
            this.lastRecoveryState.set(accountId, { at: new Date().toISOString(), action: 'restart_listener', reason, ok: true });
            this.logger.info('account_runtime_watchdog_restart_listener_ok', { accountId, reason });
          }
        } catch (error) {
          this.lastRecoveryState.set(accountId, {
            at: new Date().toISOString(),
            action: shouldRelogin ? 'relogin' : 'restart_listener',
            reason,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
          this.logger.error('account_runtime_watchdog_recover_failed', {
            accountId,
            reason,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      this.watchdogRunning = false;
    }
  }

  async syncAccountAfterLogin(accountId: string) {
    const runtime = this.runtimes.get(accountId.trim());
    if (!runtime) {
      this.logger.info('account_sync_no_runtime', { accountId });
      return;
    }
    if (!runtime.isSessionActive()) {
      this.logger.info('account_sync_no_session', { accountId });
      return;
    }
    void this.backgroundSyncAfterLogin(runtime, accountId);
  }

  private async backgroundSyncAfterLogin(runtime: GoldRuntime, accountId: string) {
    try {
      this.broadcast?.({ type: 'ws_sync_status', accountId, status: 'loading' });
      this.logger.info('account_auto_sync_starting', { accountId });

      await runtime.listFriends().catch(() => undefined);
      await runtime.listGroups().catch(() => undefined);
      this.logger.info('account_auto_sync_loaded_contacts', { accountId });

      this.broadcast?.({ type: 'ws_sync_status', accountId, status: 'syncing' });
      const result = await runtime.mobileSyncAllAccountConversations({ perThreadTimeoutMs: 10_000, maxTotalTimeMs: 120_000 });

      const totalHistoryMsgs = result.results?.reduce((s: number, x: any) => s + (x.historyResult?.remoteCount || 0), 0) ?? 0;
      this.logger.info('account_auto_sync_completed', { accountId, requ18Received: result.requ18Received, historyMsgs: totalHistoryMsgs });

      this.broadcast?.({
        type: 'ws_sync_status',
        accountId,
        status: 'done',
        requ18Received: result.requ18Received,
        requ18Inserted: result.requ18Inserted,
        historySynced: result.historySynced,
        historyMsgs: totalHistoryMsgs,
      });
    } catch (error) {
      this.logger.info('account_auto_sync_skipped', { accountId, reason: error instanceof Error ? error.message : String(error) });
      this.broadcast?.({ type: 'ws_sync_status', accountId, status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }

  async ensurePrimaryRuntime() {
    const accountId = this.getPrimaryAccountId() ?? this.runtimes.keys().next().value;
    if (!accountId) {
      return undefined;
    }
    return this.ensureRuntime(accountId);
  }

  async getRuntimeStatus(accountId: string) {
    const runtime = this.getRuntime(accountId);
    const accounts = await this.registryStore.listAccounts();
    const account = accounts.find((entry) => entry.accountId === accountId);
    const currentAccount = await runtime?.getCurrentAccount();
    return {
      accountId,
      displayName: account?.displayName,
      phoneNumber: account?.phoneNumber,
      hasCredential: Boolean(await this.registryStore.getCredentialForAccount(accountId)),
      runtimeLoaded: Boolean(runtime),
      sessionActive: runtime?.isSessionActive() ?? false,
      listener: runtime?.getListenerState(),
      watchdog: this.lastRecoveryState.get(accountId),
      account: currentAccount,
      qrCodeAvailable: Boolean(runtime?.getCurrentQrCode()),
    };
  }

  async listAccountStatuses() {
    const accounts = await this.listAccounts();
    return Promise.all(accounts.map((account) => this.getRuntimeStatus(account.accountId)));
  }
}
