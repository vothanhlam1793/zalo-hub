import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { GoldStore } from '../../core/store.js';
import type { GoldLogger } from '../../core/logger.js';
import type { AccountRuntimeManager } from '../account-manager.js';

export function createAdminRouter(
  logger: GoldLogger,
  store: GoldStore,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireAdmin: (req: Request, res: Response, next: NextFunction) => void,
  accountManager?: AccountRuntimeManager,
) {
  const router = Router();
  router.use(requireAuth);
  router.use(requireAdmin);
  const db = store.getDb();

  function passwordHash(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  router.get('/admin/users', (_req, res) => {
    try {
      const users = db.prepare('SELECT id, email, display_name, type, role FROM system_users').all() as Array<{ id: string; email: string; display_name: string; type: string; role: string }>;
      const result = users.map((u) => {
        const memberships = db.prepare('SELECT account_id, role FROM zalo_account_memberships WHERE user_id = ?').all(u.id) as Array<{ account_id: string; role: string }>;
        return { id: u.id, email: u.email, displayName: u.display_name, type: u.type, role: u.role, memberships };
      });
      res.json({ users: result });
    } catch (err) {
      res.status(500).json({ error: 'Loi tai danh sach' });
    }
  });

  router.post('/admin/users', (req, res) => {
    try {
      const { email, password, displayName } = req.body || {};
      if (!email || !password || !displayName) {
        res.status(400).json({ error: 'Thieu thong tin' });
        return;
      }
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO system_users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)')
        .run(id, email, passwordHash(password), displayName);
      res.json({ ok: true, id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg.includes('UNIQUE') ? 'Email da ton tai' : msg });
    }
  });

  router.put('/admin/users/:id', (req, res) => {
    try {
      const userId = req.params.id;
      const { displayName, role, type, password } = req.body || {};
      const sets: string[] = [];
      const vals: string[] = [];

      if (displayName !== undefined) { sets.push('display_name = ?'); vals.push(displayName); }
      if (role !== undefined) { sets.push('role = ?'); vals.push(role); }
      if (type !== undefined) { sets.push('type = ?'); vals.push(type); }
      if (password) {
        sets.push('password_hash = ?');
        vals.push(passwordHash(password));
      }

      if (sets.length === 0) { res.status(400).json({ error: 'Khong co thay doi' }); return; }

      vals.push(userId);
      db.prepare(`UPDATE system_users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Cap nhat that bai' });
    }
  });

  router.delete('/admin/users/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM system_users WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Xoa that bai' });
    }
  });

  router.put('/admin/memberships', (req, res) => {
    try {
      const { userId, accountId, role } = req.body || {};
      if (!userId || !accountId) {
        res.status(400).json({ error: 'Thieu thong tin' });
        return;
      }
      db.prepare('DELETE FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?').run(userId, accountId);
      if (role) {
        db.prepare('INSERT OR REPLACE INTO zalo_account_memberships (user_id, account_id, role) VALUES (?, ?, ?)').run(userId, accountId, role);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Cap nhat that bai' });
    }
  });

  router.delete('/admin/accounts/:id', (req, res) => {
    void (async () => {
      try {
        const accountId = req.params.id;
        try { accountManager?.stopRuntime(accountId); } catch {}
        db.prepare('DELETE FROM zalo_account_memberships WHERE account_id = ?').run(accountId);
        db.prepare('DELETE FROM account_sessions WHERE account_id = ?').run(accountId);
        db.prepare('DELETE FROM accounts WHERE account_id = ?').run(accountId);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: 'Xoa account that bai' });
      }
    })();
  });

  router.post('/admin/accounts/:id/logout', (req, res) => {
    void (async () => {
      try {
        const accountId = req.params.id;
        try { accountManager?.stopRuntime(accountId); } catch {}
        db.prepare('UPDATE account_sessions SET is_active = 0 WHERE account_id = ?').run(accountId);
        db.prepare('DELETE FROM account_sessions WHERE account_id = ?').run(accountId);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: 'Logout that bai' });
      }
    })();
  });

  router.put('/admin/accounts/:id', (req, res) => {
    try {
      const accountId = req.params.id;
      const hubAlias = typeof req.body?.hubAlias === 'string' ? req.body.hubAlias.trim() : '';
      store.updateAccountProfile(accountId, { hubAlias: hubAlias || undefined });
      const account = store.listAccounts().find((entry) => entry.accountId === accountId);
      res.json({ ok: true, account });
    } catch (err) {
      res.status(500).json({ error: 'Cap nhat alias account that bai' });
    }
  });

  router.post('/admin/accounts/:id/sync-profile', (req, res) => {
    void (async () => {
      try {
        const accountId = req.params.id;
        const runtime = await accountManager?.ensureRuntime(accountId);
        if (!runtime) {
          res.status(404).json({ error: 'Khong tim thay runtime account' });
          return;
        }
        if (!runtime.isSessionActive()) {
          await runtime.loginWithStoredCredential();
        }
        const profile = await runtime.fetchAccountInfo();
        const account = store.listAccounts().find((entry) => entry.accountId === accountId);
        res.json({ ok: true, profile, account });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Sync profile account that bai' });
      }
    })();
  });

  return router;
}
