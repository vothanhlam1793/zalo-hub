import { Router } from 'express';
import type { Knex } from 'knex';
import * as ZaloApi from 'zalo-api-final';
import type { GoldRuntime } from '../../core/runtime.js';
import type { GoldLogger } from '../../core/logger.js';
import type { AccountRuntimeManager } from '../account-manager.js';
import { createAuthMiddleware } from '../helpers/auth-middleware.js';
import type { GoldStoredCredential } from '../../core/types.js';
import { PlaywrightQrLogin } from '../../core/playwright-qr.js';
import { IndexedDbImporter } from '../../core/indexeddb-importer.js';

const { Zalo } = ZaloApi as {
  Zalo: new (options?: Record<string, unknown>) => any;
};

export function parseCookieInput(raw: unknown): Array<{ name: string; value: string; domain?: string; path?: string }> {
  if (Array.isArray(raw)) {
    return raw.map((c: any) => ({
      name: String(c.name || c.key || ''),
      value: String(c.value || ''),
      domain: String(c.domain || 'chat.zalo.me'),
      path: String(c.path || '/'),
    })).filter((c) => c.name && c.value);
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parseCookieInput(parsed);
      } catch {}
    }

    return trimmed.split(';').map((pair) => {
      const idx = pair.indexOf('=');
      if (idx === -1) return null;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (!name || !value) return null;
      return {
        name,
        value,
        domain: 'chat.zalo.me',
        path: '/',
      };
    }).filter(Boolean) as Array<{ name: string; value: string; domain?: string; path?: string }>;
  }

  return [];
}

export function createAuthRouter(
  logger: GoldLogger,
  loginRuntime: GoldRuntime,
  knex: Knex,
  accountManager: AccountRuntimeManager,
  broadcast: (payload: Record<string, unknown>) => void,
  getLoginPromise: () => Promise<void> | undefined,
  setLoginPromise: (p: Promise<void> | undefined) => void,
  getEmptyStatus: (loginInProgress?: boolean) => Record<string, unknown>,
) {
  const router = Router();
  const { requireAuth } = createAuthMiddleware(knex);
  const indexedDbImporter = new IndexedDbImporter(knex, logger);
  let globalQrHandler: PlaywrightQrLogin | null = null;
  let currentQrImage: string | null = null;

  // POST /api/login/cookie — Direct Cookie / Session Import
  router.post('/login/cookie', requireAuth, async (req, res) => {
    const userId = (req as any).systemUserId as string;
    try {
      const rawCookie = req.body?.cookie;
      const userAgent = String(req.body?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
      
      const parsedCookies = parseCookieInput(rawCookie);
      if (!parsedCookies.length) {
        res.status(400).json({ error: 'Chuỗi Cookie không hợp lệ hoặc rỗng. Vui lòng kiểm tra lại.' });
        return;
      }

      logger.info('cookie_login_started', { userId, cookieCount: parsedCookies.length });

      const crypto = await import('node:crypto');
      const imei = `${crypto.randomUUID()}-${crypto.createHash('md5').update(userAgent).digest('hex')}`;

      const zalo = new Zalo({ selfListen: false, checkUpdate: false, logging: false } as any);
      let api: any;
      try {
        api = await zalo.login({
          cookie: parsedCookies,
          imei,
          userAgent,
        } as any);
      } catch (loginErr) {
        logger.error('cookie_login_verification_failed', { error: String(loginErr) });
        res.status(400).json({ error: `Cookie Zalo không hợp lệ hoặc đã hết hạn: ${loginErr instanceof Error ? loginErr.message : String(loginErr)}` });
        return;
      }

      let accountId: string | undefined;
      let displayName: string | undefined;
      let avatar: string | undefined;
      let phoneNumber: string | undefined;

      try {
        const info = await api.fetchAccountInfo?.().catch(() => null);
        accountId = String(info?.userId || info?.uid || api.userId || '').trim();
        displayName = String(info?.displayName || info?.name || 'Tài khoản Zalo').trim();
        avatar = String(info?.avatar || '').trim();
        phoneNumber = String(info?.phoneNumber || info?.phone || '').trim();
      } catch {
        accountId = String(api?.userId || '').trim();
      }

      if (!accountId) {
        res.status(400).json({ error: 'Đăng nhập thành công nhưng không lấy được ID tài khoản Zalo.' });
        return;
      }

      const credential: GoldStoredCredential = {
        cookie: JSON.stringify(parsedCookies),
        imei,
        userAgent,
      };

      await knex('accounts')
        .insert({
          account_id: accountId,
          display_name: displayName,
          avatar,
          phone_number: phoneNumber,
          last_login_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        })
        .onConflict('account_id')
        .merge({
          display_name: displayName,
          avatar,
          phone_number: phoneNumber,
          last_login_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        });

      await knex('account_sessions')
        .insert({
          account_id: accountId,
          cookie_json: JSON.stringify(parsedCookies),
          imei,
          user_agent: userAgent,
          is_active: 1,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        })
        .onConflict('account_id')
        .merge({
          cookie_json: JSON.stringify(parsedCookies),
          imei,
          user_agent: userAgent,
          is_active: 1,
          updated_at: knex.fn.now(),
        });

      const { rows: existingMem } = await knex.raw(
        'SELECT role FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?',
        [userId, accountId]
      );
      if (existingMem.length === 0) {
        await knex.raw(
          'INSERT INTO zalo_account_memberships (user_id, account_id, role) VALUES (?, ?, ?)',
          [userId, accountId, 'master']
        );
        logger.info('cookie_login_master_assigned', { userId, accountId });
      }

      await accountManager.activatePrimaryAccount(accountId);
      await accountManager.ensureRuntime(accountId).catch((error) => {
        logger.error('cookie_login_runtime_ensure_failed', {
          accountId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      broadcast({
        type: 'session_state',
        accountId,
        status: { loggedIn: true, sessionActive: true, account: { userId: accountId, displayName, avatar, phoneNumber } },
      });

      void accountManager.syncAccountAfterLogin(accountId);

      logger.info('cookie_login_succeeded', { userId, accountId, displayName });

      res.json({
        ok: true,
        account: {
          accountId,
          displayName,
          avatar,
          phoneNumber,
        },
      });
    } catch (err) {
      logger.error('cookie_login_unexpected_error', { error: String(err) });
      res.status(500).json({ error: `Lỗi máy chủ khi xử lý cookie: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  // POST /api/login/cancel — Explicitly abort previous QR session
  router.post('/login/cancel', requireAuth, (_req, res) => {
    try {
      currentQrImage = null;
      setLoginPromise(undefined);
      try {
        loginRuntime.releaseTransientSession();
      } catch {}
      logger.info('login_qr_session_cancelled');
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Cannot cancel session' });
    }
  });

  router.post('/login/start', requireAuth, (req, res) => {
    const userId = (req as any).systemUserId as string;
    const force = Boolean(req.body?.force);

    let loginPromise = getLoginPromise();
    if (force && loginPromise) {
      logger.info('native_login_force_refresh_requested', { userId });
      currentQrImage = null;
      setLoginPromise(undefined);
      try {
        loginRuntime.releaseTransientSession();
      } catch {}
      loginPromise = undefined;
    }

    if (!loginPromise) {
      logger.info('native_login_start_requested', { userId, force });
      currentQrImage = null;

      // Luôn dọn sạch transient session cũ trước khi mở phiên QR mới
      try {
        loginRuntime.releaseTransientSession();
      } catch {}

      loginPromise = (async () => {
        await loginRuntime.loginByQr({
          onQr: (qrBase64: string) => {
            currentQrImage = qrBase64;
            logger.info('native_qr_ready', { qrLength: qrBase64.length });
            broadcast({
              type: 'ws_sync_progress',
              accountId: 'new_login',
              step: 'qr_ready',
              percent: 25,
              qrCode: qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`,
              message: 'Mã QR đã sẵn sàng. Vui lòng quét bằng Zalo trên điện thoại.',
            });
          },
        });

        const currentAccount = await loginRuntime.getCurrentAccount();
        const accountId = currentAccount?.userId;
        if (accountId && userId) {
          // 1. Assign membership if needed
          const { rows: existing } = await knex.raw('SELECT role FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?', [userId, accountId]);
          if (existing.length === 0) {
            const existingAcc = await knex.raw('SELECT 1 FROM accounts WHERE account_id = ?', [accountId]);
            if (existingAcc.rows.length === 0) {
              await knex.raw('INSERT INTO zalo_account_memberships (user_id, account_id, role) VALUES (?, ?, ?)', [userId, accountId, 'master']);
            } else {
              await knex.raw('INSERT INTO zalo_account_memberships (user_id, account_id, role) VALUES (?, ?, ?)', [userId, accountId, 'viewer']);
            }
            logger.info('gold2_auto_membership_assigned', { userId, accountId });
          }

          // 2. Ensure runtime and notify clients
          await accountManager.activatePrimaryAccount(accountId);
          await accountManager.ensureRuntime(accountId).catch((error) => {
            logger.error('gold2_account_runtime_start_failed_after_qr', {
              accountId,
              error: error instanceof Error ? error.message : String(error),
            });
          });

          await loginRuntime.closeMessageListener().catch(() => undefined);
          loginRuntime.releaseTransientSession();
          void accountManager.syncAccountAfterLogin(accountId);

          broadcast({
            type: 'ws_sync_progress',
            accountId,
            step: 'completed',
            percent: 100,
            message: '🎉 Đăng nhập thành công!',
          });
        }
        logger.info('native_login_completed', { accountId });
      })()
        .catch((error) => {
          logger.error('native_login_failed', error);
          broadcast({
            type: 'ws_sync_progress',
            accountId: 'new_login',
            step: 'error',
            percent: 0,
            message: 'Đăng nhập thất bại hoặc hết thời gian quét QR',
          });
          throw error;
        })
        .finally(() => {
          currentQrImage = null;
          setLoginPromise(undefined);
          try {
            loginRuntime.releaseTransientSession();
          } catch {}
        });

      setLoginPromise(loginPromise);
    }

    res.json({ started: true, qrCodeAvailable: Boolean(loginRuntime.getCurrentQrCode() || currentQrImage) });
  });

  router.get('/login/qr', (_req, res) => {
    if (!currentQrImage) {
      res.json({ qrCode: null, ready: false });
      return;
    }
    const dataUrl = currentQrImage.startsWith('data:') ? currentQrImage : `data:image/png;base64,${currentQrImage}`;
    res.json({ qrCode: dataUrl, ready: true });
  });

  router.post('/logout', (_req, res) => {
    void (async () => {
      const accountId = accountManager.getPrimaryAccountId();
      const primaryRuntime = accountId ? accountManager.getRuntime(accountId) : undefined;

      if (primaryRuntime) {
        const result = primaryRuntime.logout();
        logger.info('gold2_logout_completed', { accountId, via: 'primary_runtime' });
        broadcast({ type: 'session_state', accountId, status: getEmptyStatus(Boolean(getLoginPromise())) });
        res.json(result);
        return;
      }

      const result = loginRuntime.logout();
      logger.info('gold2_logout_completed', { via: 'login_runtime_fallback' });
      res.json(result);
    })();
  });

  return router;
}
