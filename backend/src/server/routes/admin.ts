import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Knex } from 'knex';
import type { GoldStore } from '../../core/store.js';
import type { GoldLogger } from '../../core/logger.js';
import type { AccountRuntimeManager } from '../account-manager.js';

export function createAdminRouter(
  logger: GoldLogger,
  store: GoldStore,
  knex: Knex,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireSystemRole: (role: string) => (req: Request, res: Response, next: NextFunction) => void,
  _requireAccountAccess: (minRole?: string) => (req: Request, res: Response, next: NextFunction) => void,
  requireAccountMaster: (req: Request, res: Response, next: NextFunction) => void,
  accountManager?: AccountRuntimeManager,
) {
  const router = Router();
  const requireAdminOrSuper = requireSystemRole('admin');

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

      try { accountManager?.stopRuntime(accountId); } catch {}

      // Create a fresh runtime directly — do NOT call ensureRuntime which
      // would attempt loginWithStoredCredential (stale cookie) before QR.
      const { GoldRuntime } = await import('../../core/runtime/index.js');
      const { GoldStore } = await import('../../core/store/index.js');
      const freshRuntime = new GoldRuntime(new GoldStore(knex), logger, { boundAccountId: accountId });
      // Register in manager so the /reconnect/qr poll can find it
      (accountManager as any)?.runtimes?.set(accountId, freshRuntime);

      // Kick off QR login in background — do NOT await
      freshRuntime.loginByQr({ onQr: () => {} }).catch((err) => {
        logger.error('reconnect_qr_failed', { accountId, error: err instanceof Error ? err.message : String(err) });
      });

      // Give loginQR a moment to generate the QR before responding
      await new Promise((r) => setTimeout(r, 2000));

      res.json({ started: true });
    } catch (err) {
      res.status(500).json({ error: 'Reconnect that bai' });
    }
  });

  router.get('/admin/accounts/:id/reconnect/qr', requireAuth, async (req: Request, res: Response) => {
    const accountId = String(req.params.id).trim();
    const runtime = accountManager?.getRuntime(accountId);
    if (!runtime) {
      res.json({ qrCode: null, ready: false });
      return;
    }
    const qrCode = runtime.getCurrentQrCode();
    if (!qrCode) {
      res.json({ qrCode: null, ready: false });
      return;
    }
    res.json({ qrCode, ready: true });
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
