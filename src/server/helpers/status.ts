import type { GoldRuntime } from '../../core/runtime.js';

export function getEmptyStatus(loginInProgress = false) {
  return {
    hasCredential: false,
    sessionActive: false,
    friendCacheCount: 0,
    qrCodeAvailable: false,
    account: undefined,
    listener: { connected: false, started: false },
    loginInProgress,
    loggedIn: false,
  };
}

export function getStatus(
  accountManager: { getPrimaryRuntime(): GoldRuntime | undefined },
  loginPromiseFn: () => Promise<void> | undefined,
) {
  const primaryRuntime = accountManager.getPrimaryRuntime();
  if (!primaryRuntime) {
    return getEmptyStatus(Boolean(loginPromiseFn()));
  }
  return getStatusForRuntime(primaryRuntime, Boolean(loginPromiseFn()));
}

export function getStatusForRuntime(targetRuntime: GoldRuntime, loginInProgress = false) {
  const account = targetRuntime.getCurrentAccount();
  return {
    hasCredential: targetRuntime.hasCredential(),
    sessionActive: targetRuntime.isSessionActive(),
    friendCacheCount: targetRuntime.getFriendCache().length,
    qrCodeAvailable: Boolean(targetRuntime.getCurrentQrCode()),
    account,
    listener: targetRuntime.getListenerState(),
    loginInProgress,
    loggedIn: Boolean(targetRuntime.hasCredential() || targetRuntime.isSessionActive() || account?.userId || account?.displayName),
  };
}
