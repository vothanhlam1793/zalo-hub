import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Knex } from 'knex';
import type { GoldStore } from '../../core/store.js';
import type { GoldLogger } from '../../core/logger.js';
import type { AccountRuntimeManager } from '../account-manager.js';
import { PlaywrightQrLogin } from '../../core/playwright-qr.js';
import { IndexedDbImporter } from '../../core/indexeddb-importer.js';

export function createAdminRouter(
  logger: GoldLogger,
  store: GoldStore,
  knex: Knex,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireSystemRole: (role: string) => (req: Request, res: Response, next: NextFunction) => void,
  _requireAccountAccess: (minRole?: string) => (req: Request, res: Response, next: NextFunction) => void,
  requireAccountMaster: (req: Request, res: Response, next: NextFunction) => void,
  accountManager?: AccountRuntimeManager,
  broadcast?: (payload: Record<string, unknown>) => void,
) {
  const router = Router();
  const requireAdminOrSuper = requireSystemRole('admin');
  const indexedDbImporter = new IndexedDbImporter(knex, logger);
  const activeReconnectSessions = new Map<string, { handler: PlaywrightQrLogin; qrCode: string | null }>();

  function passwordHash(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  // ---- SYSTEM USERS (super_admin / admin only) ----
  router.get('/admin/users', requireAuth, requireAdminOrSuper, async (_req: Request, res: Response) => {
    try {
      const { rows: users } = await knex.raw('SELECT id, email, display_name, type, role FROM system_users');
      const result = await Promise.all(users.map(async (u: any) => {
        const { rows: memberships } = await knex.raw('SELECT account_id, role FROM zalo_account_memberships WHERE user_id = ?', [u.id]);
        return { id: u.id, email: u.email, displayName: u.display_name, type: u.type, role: u.role, memberships };
      }));
      res.json({ users: result });
    } catch (err) {
      res.status(500).json({ error: 'Loi tai danh sach' });
    }
  });

  router.post('/admin/users', requireAuth, requireAdminOrSuper, async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email ?? '');
      const password = String(req.body?.password ?? '');
      const displayName = String(req.body?.displayName ?? '');
      if (!email || !password || !displayName) {
        res.status(400).json({ error: 'Thieu thong tin' });
        return;
      }
      const id = crypto.randomUUID();
      await knex.raw('INSERT INTO system_users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)', [id, email, passwordHash(password), displayName]);
      res.json({ ok: true, id });
    } catch (err: any) {
      res.status(400).json({ error: (err?.message ?? '').includes('unique') ? 'Email da ton tai' : 'Loi tao user' });
    }
  });

  router.put('/admin/users/:id', requireAuth, requireAdminOrSuper, async (req: Request, res: Response) => {
    try {
      const userId = String(req.params.id);
      const body: Record<string, any> = req.body || {};
      const updates: string[] = [];
      const vals: any[] = [];

      if (body.displayName !== undefined) { updates.push('display_name = ?'); vals.push(String(body.displayName)); }
      if (body.role !== undefined) { updates.push('role = ?'); vals.push(String(body.role)); }
      if (body.type !== undefined) { updates.push('type = ?'); vals.push(String(body.type)); }
      if (body.password) {
        updates.push('password_hash = ?');
        vals.push(passwordHash(String(body.password)));
      }
      if (updates.length === 0) { res.status(400).json({ error: 'Khong co thay doi' }); return; }

      vals.push(userId);
      await knex.raw(`UPDATE system_users SET ${updates.join(', ')} WHERE id = ?`, vals);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Cap nhat that bai' });
    }
  });

  router.delete('/admin/users/:id', requireAuth, requireAdminOrSuper, async (req: Request, res: Response) => {
    try {
      await knex.raw('DELETE FROM system_users WHERE id = ?', [String(req.params.id)]);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Xoa that bai' });
    }
  });

  // ---- USER TAG PERMISSIONS (admin or master) ----
  router.get('/admin/users/:id/tag-permissions', requireAuth, async (req: Request, res: Response) => {
    try {
      const targetUserId = String(req.params.id);
      const accountId = req.query.accountId ? String(req.query.accountId) : undefined;
      let query = 'SELECT account_id, tag_id FROM user_tag_permissions WHERE user_id = ?';
      const params: any[] = [targetUserId];
      if (accountId) {
        query += ' AND account_id = ?';
        params.push(accountId);
      }
      const { rows } = await knex.raw(query, params);
      res.json({ permissions: rows });
    } catch (err) {
      res.status(500).json({ error: 'Lỗi tải phân quyền tag' });
    }
  });

  router.put('/admin/users/:id/tag-permissions', requireAuth, async (req: Request, res: Response) => {
    try {
      const targetUserId = String(req.params.id);
      const accountId = String(req.body?.accountId ?? '');
      const tagIds: string[] = Array.isArray(req.body?.tagIds) ? req.body.tagIds : [];

      if (!accountId) {
        res.status(400).json({ error: 'Thiếu accountId' });
        return;
      }

      // Authorization check: Caller must be admin, super_admin, or master/admin of this account
      const callerUserId = (req as any).systemUserId as string;
      const { rows: callerUser } = await knex.raw('SELECT role FROM system_users WHERE id = ?', [callerUserId]);
      const systemRole = callerUser[0]?.role;

      const { rows: callerMem } = await knex.raw(
        'SELECT role FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?',
        [callerUserId, accountId],
      );
      const accountRole = callerMem[0]?.role;

      const isAllowed =
        systemRole === 'super_admin' ||
        systemRole === 'admin' ||
        accountRole === 'master' ||
        accountRole === 'admin';

      if (!isAllowed) {
        res.status(403).json({ error: 'Không có quyền cấu hình tag permissions cho account này' });
        return;
      }

      await knex.transaction(async (trx) => {
        await trx.raw('DELETE FROM user_tag_permissions WHERE user_id = ? AND account_id = ?', [targetUserId, accountId]);
        for (const tid of tagIds) {
          if (tid) {
            await trx.raw(
              'INSERT INTO user_tag_permissions (user_id, account_id, tag_id) VALUES (?, ?, ?)',
              [targetUserId, accountId, tid],
            );
          }
        }
      });

      res.json({ ok: true, userId: targetUserId, accountId, tagIds });
    } catch (err) {
      res.status(500).json({ error: 'Cập nhật phân quyền tag thất bại' });
    }
  });

  // ---- SUPER ADMIN: all Zalo accounts view ----
  router.get('/admin/accounts/all', requireAuth, requireAdminOrSuper, async (_req: Request, res: Response) => {
    try {
      const accounts = await store.listAccounts();
      const result = await Promise.all(accounts.map(async (acc) => {
        const { rows: members } = await knex.raw(
          'SELECT m.user_id, m.role, u.display_name, u.email FROM zalo_account_memberships m LEFT JOIN system_users u ON u.id = m.user_id WHERE m.account_id = ?',
          [acc.accountId]
        );
        const masters = members.filter((m: any) => m.role === 'master').map((m: any) => ({ userId: m.user_id, displayName: m.display_name, email: m.email }));
        return { ...acc, master: masters[0] || null, memberCount: members.length };
      }));
      res.json({ accounts: result });
    } catch (err) {
      res.status(500).json({ error: 'Loi tai danh sach account' });
    }
  });

  // ---- MY ACCOUNTS (any authenticated user) ----
  router.get('/me/accounts', requireAuth, async (req: Request, res: Response) => {
    const userId = String((req as any).systemUserId ?? '');
    try {
      const { rows: memberships } = await knex.raw(
        'SELECT m.account_id, m.role, m.visible, a.display_name, a.phone_number, a.avatar, a.hub_alias FROM zalo_account_memberships m LEFT JOIN accounts a ON a.account_id = m.account_id WHERE m.user_id = ?',
        [userId]
      );

      const result = await Promise.all(memberships.map(async (m: any) => {
        const runtimeStatus = await accountManager?.getRuntimeStatus(m.account_id).catch(() => undefined);
        return {
          accountId: m.account_id,
          role: m.role,
          visible: m.visible !== 0,
          displayName: m.hub_alias || m.display_name,
          phoneNumber: m.phone_number,
          avatar: m.avatar,
          hasSession: Boolean(runtimeStatus?.sessionActive),
        };
      }));

      res.json({ accounts: result });
    } catch (err) {
      res.status(500).json({ error: 'Loi tai danh sach account' });
    }
  });

  router.put('/me/accounts/:id/visible', requireAuth, async (req: Request, res: Response) => {
    const userId = String((req as any).systemUserId ?? '');
    const accountId = String(req.params.id);
    const visible = req.body?.visible === false || req.body?.visible === 0 ? 0 : 1;
    try {
      const { rows } = await knex.raw(
        'SELECT 1 FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?',
        [userId, accountId]
      );
      if (rows.length === 0) {
        res.status(404).json({ error: 'Khong tim thay account' });
        return;
      }
      await knex.raw(
        'UPDATE zalo_account_memberships SET visible = ? WHERE user_id = ? AND account_id = ?',
        [visible, userId, accountId]
      );
      res.json({ ok: true, visible: visible !== 0 });
    } catch (err) {
      res.status(500).json({ error: 'Cap nhat visible that bai' });
    }
  });

  // ---- ACCOUNT MEMBERSHIP MANAGEMENT (master only) ----
  router.post('/admin/accounts/:id/members', requireAuth, requireAccountMaster, async (req: Request, res: Response) => {
    try {
      const accountId = String(req.params.id);
      const email = String(req.body?.email ?? '');
      const role = String(req.body?.role ?? '');
      if (!email || !role) { res.status(400).json({ error: 'Thieu email hoac role' }); return; }
      const validRoles = ['viewer', 'editor', 'admin', 'master'];
      if (!validRoles.includes(role)) { res.status(400).json({ error: 'Role khong hop le' }); return; }

      const { rows: users } = await knex.raw('SELECT id FROM system_users WHERE email = ?', [email]);
      if (users.length === 0) { res.status(404).json({ error: 'Khong tim thay user' }); return; }
      const userId = users[0].id;

      const { rows: existing } = await knex.raw('SELECT 1 FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?', [userId, accountId]);
      if (existing.length > 0) {
        await knex.raw('UPDATE zalo_account_memberships SET role = ? WHERE user_id = ? AND account_id = ?', [role, userId, accountId]);
      } else {
        await knex.raw('INSERT INTO zalo_account_memberships (user_id, account_id, role) VALUES (?, ?, ?)', [userId, accountId, role]);
      }
      res.json({ ok: true, userId, role });
    } catch (err) {
      res.status(500).json({ error: 'Them member that bai' });
    }
  });

  router.delete('/admin/accounts/:id/members/:userId', requireAuth, requireAccountMaster, async (req: Request, res: Response) => {
    try {
      const accountId = String(req.params.id);
      const userId = String(req.params.userId);
      const { rows: masterRows } = await knex.raw('SELECT user_id FROM zalo_account_memberships WHERE account_id = ? AND role = ?', [accountId, 'master']);
      if (masterRows.length > 0 && masterRows[0].user_id === userId) {
        res.status(400).json({ error: 'Khong the xoa master. Dung chuyen quyen master truoc.' });
        return;
      }
      await knex.raw('DELETE FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?', [userId, accountId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Xoa member that bai' });
    }
  });

  router.put('/admin/accounts/:id/members/:userId', requireAuth, requireAccountMaster, async (req: Request, res: Response) => {
    try {
      const accountId = String(req.params.id);
      const targetUserId = String(req.params.userId);
      const role = String(req.body?.role ?? '');
      if (!['viewer', 'editor', 'admin', 'master'].includes(role)) { res.status(400).json({ error: 'Role khong hop le' }); return; }

      const { rows } = await knex.raw('SELECT role FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?', [targetUserId, accountId]);
      if (rows.length === 0) { res.status(404).json({ error: 'Khong tim thay member' }); return; }

      await knex.raw('UPDATE zalo_account_memberships SET role = ? WHERE user_id = ? AND account_id = ?', [role, targetUserId, accountId]);
      res.json({ ok: true, role });
    } catch (err) {
      res.status(500).json({ error: 'Cap nhat role that bai' });
    }
  });

  router.put('/admin/accounts/:id/transfer', requireAuth, requireAccountMaster, async (req: Request, res: Response) => {
    try {
      const accountId = String(req.params.id);
      const currentUserId = String((req as any).systemUserId ?? '');
      const newMasterId = String(req.body?.userId ?? '');
      if (!newMasterId) { res.status(400).json({ error: 'Thieu userId' }); return; }

      const { rows } = await knex.raw('SELECT role FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?', [newMasterId, accountId]);
      if (rows.length === 0) { res.status(404).json({ error: 'User chua duoc share account nay' }); return; }

      await knex.raw('UPDATE zalo_account_memberships SET role = ? WHERE user_id = ? AND account_id = ?', ['master', newMasterId, accountId]);
      await knex.raw('UPDATE zalo_account_memberships SET role = ? WHERE user_id = ? AND account_id = ?', ['admin', currentUserId, accountId]);
      res.json({ ok: true, newMasterId, previousMasterRole: 'admin' });
    } catch (err) {
      res.status(500).json({ error: 'Chuyen quyen master that bai' });
    }
  });

  // ---- ACCOUNT ENTITIES (all conversations: groups + contacts + recent chats) ----
  router.get('/admin/accounts/:id/entities', requireAuth, async (req: Request, res: Response) => {
    const accountId = String(req.params.id).trim();
    try {
      const runtime = await accountManager?.ensureRuntime(accountId);
      if (!runtime) {
        res.status(404).json({ error: 'Khong tim thay runtime account' });
        return;
      }

      const seen = new Set<string>();
      const entities: Array<{ id: string; name: string; type: 'group' | 'contact' | 'conversation' }> = [];

      try {
        const groups = await runtime.listGroups();
        for (const g of groups) {
          const id = `group:${g.groupId}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const name = g.displayName || g.groupId || id;
          if (id && name) entities.push({ id, name, type: 'group' });
        }
      } catch {}

      try {
        const contacts = await runtime.listContacts();
        for (const c of contacts) {
          const id = String(c.userId || c.id || '');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const name = c.displayName || c.userId || id;
          if (id && name) entities.push({ id, name, type: 'contact' });
        }
      } catch {}

      try {
        const conversations = await runtime.listConversations();
        for (const conv of conversations) {
          const id = String(conv.id || conv.threadId || '');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const name = conv.title || id;
          const type = id.startsWith('group:') ? 'group' as const : 'contact' as const;
          if (id && name) entities.push({ id, name, type });
        }
      } catch {}

      res.json({ accountId, entities });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Loi lay entities' });
    }
  });

  // ---- RECONNECT (authenticated, member of account) ----
  router.post('/admin/accounts/:id/reconnect', requireAuth, async (req: Request, res: Response) => {
    const userId = String((req as any).systemUserId ?? '');
    const accountId = String(req.params.id).trim();
    try {
      const { rows } = await knex.raw(
        'SELECT role FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?',
        [userId, accountId]
      );
      if (rows.length === 0) {
        res.status(403).json({ error: 'Khong co quyen reconnect tai khoan nay' });
        return;
      }

      logger.info('playwright_reconnect_start_requested', { accountId, userId });

      // 1. Teardown active session immediately so frontend & runtime know we are in QR mode
      try { accountManager?.stopRuntime(accountId); } catch {}
      await knex('account_sessions')
        .where({ account_id: accountId })
        .update({ is_active: 0, updated_at: knex.fn.now() })
        .catch(() => undefined);

      broadcast?.({
        type: 'session_state',
        accountId,
        status: { loggedIn: false, sessionActive: false, qrCodeAvailable: true },
      });

      // 2. Clean existing reconnect handler if any
      const existing = activeReconnectSessions.get(accountId);
      if (existing) {
        void existing.handler.cancel().catch(() => {});
        activeReconnectSessions.delete(accountId);
      }

      const qrHandler = new PlaywrightQrLogin(logger, indexedDbImporter);
      activeReconnectSessions.set(accountId, { handler: qrHandler, qrCode: null });

      setImmediate(async () => {
        try {
          const qrBase64 = await qrHandler.start();
          const sess = activeReconnectSessions.get(accountId);
          if (sess) sess.qrCode = qrBase64;

          broadcast?.({
            type: 'ws_sync_progress',
            accountId,
            step: 'qr_ready',
            percent: 15,
            message: 'Mã QR đã sẵn sàng. Vui lòng quét bằng Zalo trên điện thoại.',
          });

          const loginRes = await qrHandler.waitForLoginAndImport(180_000, (prog) => {
            if (prog.step === 'waiting_phone_confirm' || prog.step === 'receiving_chunks') {
              const currentSess = activeReconnectSessions.get(accountId);
              if (currentSess) currentSess.qrCode = null;
            }
            broadcast?.({
              type: 'ws_sync_progress',
              accountId,
              ...prog,
            });
          });

          if (loginRes.cookies.length > 0) {
            const cookiesJson = JSON.stringify(loginRes.cookies);
            await knex('account_sessions')
              .where({ account_id: accountId })
              .update({
                cookie_json: cookiesJson,
                is_active: 1,
                updated_at: knex.fn.now(),
              });

            await accountManager?.restartRuntime(accountId).catch(() => undefined);
            const runtime = accountManager?.getRuntime(accountId);
            if (runtime) {
              const summaries = await runtime.getConversationSummaries().catch(() => []);
              broadcast?.({ type: 'conversation_summaries', accountId, conversations: summaries });
              void accountManager?.syncAccountAfterLogin(accountId);
            }
          }
        } catch (err) {
          logger.error('playwright_reconnect_failed', { accountId, error: String(err) });
          broadcast?.({
            type: 'ws_sync_progress',
            accountId,
            step: 'error',
            percent: 0,
            message: 'Đăng nhập lại thất bại hoặc hết thời gian quét QR',
          });
        } finally {
          await qrHandler.cleanup().catch(() => {});
          activeReconnectSessions.delete(accountId);
        }
      });

      // Brief wait to allow Playwright to produce the first QR code
      await new Promise((r) => setTimeout(r, 2000));

      res.json({ started: true });
    } catch (err) {
      res.status(500).json({ error: 'Reconnect that bai' });
    }
  });

  router.get('/admin/accounts/:id/reconnect/qr', requireAuth, async (req: Request, res: Response) => {
    const accountId = String(req.params.id).trim();
    const sess = activeReconnectSessions.get(accountId);
    if (!sess || !sess.qrCode) {
      res.json({ qrCode: null, ready: false });
      return;
    }
    res.json({ qrCode: `data:image/png;base64,${sess.qrCode}`, ready: true });
  });

  // ---- ACCOUNT MANAGEMENT (master only) ----
  router.delete('/admin/accounts/:id', requireAuth, requireAccountMaster, async (req: Request, res: Response) => {
    try {
      const accountId = String(req.params.id);
      try { accountManager?.stopRuntime(accountId); } catch {}
      await knex.raw('DELETE FROM zalo_account_memberships WHERE account_id = ?', [accountId]);
      await knex.raw('DELETE FROM account_sessions WHERE account_id = ?', [accountId]);
      await knex.raw('DELETE FROM accounts WHERE account_id = ?', [accountId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Xoa account that bai' });
    }
  });

  router.post('/admin/accounts/:id/logout', requireAuth, requireAccountMaster, async (req: Request, res: Response) => {
    try {
      const accountId = String(req.params.id);
      try { accountManager?.stopRuntime(accountId); } catch {}
      await knex.raw('UPDATE account_sessions SET is_active = 0 WHERE account_id = ?', [accountId]);
      await knex.raw('DELETE FROM account_sessions WHERE account_id = ?', [accountId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Logout that bai' });
    }
  });

  router.put('/admin/accounts/:id', requireAuth, requireAccountMaster, async (req: Request, res: Response) => {
    try {
      const accountId = String(req.params.id);
      const hubAlias = String(req.body?.hubAlias ?? '').trim();
      await store.updateAccountProfile(accountId, { hubAlias: hubAlias || undefined });
      const accounts = await store.listAccounts();
      const account = accounts.find((entry) => entry.accountId === accountId);
      res.json({ ok: true, account });
    } catch (err) {
      res.status(500).json({ error: 'Cap nhat alias account that bai' });
    }
  });

  router.post('/admin/accounts/:id/sync-profile', requireAuth, requireAccountMaster, async (req: Request, res: Response) => {
    try {
      const accountId = String(req.params.id);
      const runtime = await accountManager?.ensureRuntime(accountId);
      if (!runtime) { res.status(404).json({ error: 'Khong tim thay runtime account' }); return; }
      if (!runtime.isSessionActive()) await runtime.loginWithStoredCredential();
      const profile = await runtime.fetchAccountInfo();
      const accounts = await store.listAccounts();
      const account = accounts.find((entry) => entry.accountId === accountId);
      res.json({ ok: true, profile, account });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Sync profile account that bai' });
    }
  });

  return router;
}
