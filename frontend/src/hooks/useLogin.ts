import { useCallback, useRef, useState } from 'react';
import { api } from '../api';
import type { AccountSummary, SessionStatus } from '../types';

export function useLogin() {
  const [qrCode, setQrCode] = useState('');
  const [loginPolling, setLoginPolling] = useState(false);
  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshQr = useCallback(async () => {
    try {
      const r = await api.loginQr();
      setQrCode(r.qrCode ?? '');
    } catch {
      setQrCode('');
    }
  }, []);

  const startLogin = useCallback(async (
    targetAccountId: string | undefined,
    knownAccounts: AccountSummary[],
    onAccountReady: (accountId: string, status: SessionStatus) => void,
    setStatusMsg: (msg: string) => void,
    setLoadError: (err: string) => void,
    setStatus: (s: SessionStatus | null) => void,
    setKnownAccounts: (accs: AccountSummary[]) => void,
    setSelectedAccountId: (id: string) => void,
    loadData: (accountId: string, s?: SessionStatus) => void,
  ) => {
    setLoadError('');
    setStatusMsg(targetAccountId ? 'Đang mở QR đăng nhập lại...' : 'Đang mở QR thêm tài khoản...');
    const knownAccountIds = new Set(knownAccounts.map((account) => account.accountId));
    await api.loginStart();
    await refreshQr();
    if (loginPollRef.current) clearInterval(loginPollRef.current);
    setLoginPolling(true);
    loginPollRef.current = setInterval(async () => {
      try {
        const s = await api.status();
        setStatus(s);
        api.accounts().then((result) => {
          setKnownAccounts(result.accounts);
          const newlyReadyAccount = result.accounts.find((account) => account.sessionActive && !knownAccountIds.has(account.accountId));
          const targetBecameReady = targetAccountId
            ? result.accounts.find((account) => account.accountId === targetAccountId && account.sessionActive)
            : undefined;
          if (newlyReadyAccount || targetBecameReady) {
            clearInterval(loginPollRef.current!);
            loginPollRef.current = null;
            setLoginPolling(false);
            const readyId = newlyReadyAccount?.accountId ?? targetBecameReady!.accountId;
            setSelectedAccountId(readyId);
            api.activateAccount(readyId).catch(() => {});
            setStatusMsg(newlyReadyAccount ? 'Đã thêm tài khoản mới.' : 'Đã đăng nhập lại tài khoản.');
            onAccountReady(readyId, s);
            return;
          }
        }).catch(() => {});
        await refreshQr();
      } catch {
        // ignore
      }
    }, 1500);
  }, [refreshQr]);

  const cancelLogin = useCallback(() => {
    if (loginPollRef.current) {
      clearInterval(loginPollRef.current);
      loginPollRef.current = null;
    }
    setLoginPolling(false);
    setQrCode('');
  }, []);

  return { qrCode, loginPolling, startLogin, cancelLogin, refreshQr };
}
