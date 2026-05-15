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

export async function getStatus(
  accountManager: { getPrimaryRuntime(): GoldRuntime | undefined; getPreferredRuntime?: () => GoldRuntime | undefined },
  loginPromiseFn: () => Promise<void> | undefined,
) {
  const primaryRuntime = accountManager.getPrimaryRuntime() ?? accountManager.getPreferredRuntime?.();
  if (!primaryRuntime) {
    return getEmptyStatus(Boolean(loginPromiseFn()));
  }
  return getStatusForRuntime(primaryRuntime, Boolean(loginPromiseFn()));
}

export async function getStatusForRuntime(targetRuntime: GoldRuntime, loginInProgress = false) {
  const account = await targetRuntime.getCurrentAccount();
  const friendCache = await targetRuntime.getFriendCache();
  return {
    hasCredential: await targetRuntime.hasCredential(),
    sessionActive: targetRuntime.isSessionActive(),
    friendCacheCount: friendCache.length,
    qrCodeAvailable: Boolean(targetRuntime.getCurrentQrCode()),
    account,
    listener: targetRuntime.getListenerState(),
    loginInProgress,
    loggedIn: Boolean(await targetRuntime.hasCredential() || targetRuntime.isSessionActive() || account?.userId || account?.displayName),
  };
}
