import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import type { GoldRuntime } from '../../core/runtime.js';
import type { GoldStore } from '../../core/store.js';
import type { GoldLogger } from '../../core/logger.js';
import type { AccountRuntimeManager } from '../account-manager.js';
import { createAuthMiddleware } from '../helpers/auth-middleware.js';

const JWT_SECRET = process.env.JWT_SECRET || 'zalohub-dev-secret-change-in-production';

export function createSystemAuthRouter(
  logger: GoldLogger,
  loginRuntime: GoldRuntime,
  loginStore: GoldStore,
  accountManager: AccountRuntimeManager,
  broadcast: (payload: Record<string, unknown>) => void,
  getLoginPromise: () => Promise<void> | undefined,
  setLoginPromise: (p: Promise<void> | undefined) => void,
  getEmptyStatus: (loginInProgress?: boolean) => Record<string, unknown>,
) {
  const router = Router();
  const { requireAuth, requireSystemRole, requireAccountAccess } = createAuthMiddleware(loginStore);

  function passwordHash(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  function verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const computed = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  }

  function createSession(userId: string): { token: string; expiresAt: string } {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
    loginStore.getDb().prepare(
      'INSERT INTO system_sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
    ).run(token, userId, expiresAt);
    return { token, expiresAt };
  }

  router.post('/auth/login', (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ error: 'Email và mật khẩu là bắt buộc' });
        return;
      }

      const user = loginStore.getDb().prepare(
        'SELECT id, email, display_name, type, password_hash FROM system_users WHERE email = ?'
      ).get(email) as { id: string; email: string; display_name: string; type: string; password_hash: string } | undefined;

      if (!user || !verifyPassword(password, user.password_hash)) {
        res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
        return;
      }

      const { token } = createSession(user.id);
      logger.info('system_user_login', { userId: user.id, email });

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          type: user.type,
        },
      });
    } catch (error) {
      logger.error('system_user_login_error', { error: String(error) });
      res.status(500).json({ error: 'Lỗi máy chủ' });
    }
  });

  router.post('/auth/logout', requireAuth, (req, res) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      loginStore.getDb().prepare('DELETE FROM system_sessions WHERE token = ?').run(token);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Lỗi máy chủ' });
    }
  });

  router.get('/auth/me', requireAuth, (req, res) => {
    const userId = (req as any).systemUserId as string;
    if (!userId) {
      res.status(401).json({ error: 'Chưa xác thực' });
      return;
    }

    const user = loginStore.getDb().prepare(
      'SELECT id, email, display_name, type, role FROM system_users WHERE id = ?'
    ).get(userId) as { id: string; email: string; display_name: string; type: string; role: string } | undefined;

    if (!user) {
      res.status(401).json({ error: 'Người dùng không tồn tại' });
      return;
    }

    const memberships = loginStore.getDb().prepare(
      'SELECT account_id, role FROM zalo_account_memberships WHERE user_id = ?'
    ).all(userId) as Array<{ account_id: string; role: string }>;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        type: user.type,
        role: user.role,
      },
      memberships,
    });
  });

  return { router, requireAuth, requireSystemRole, requireAccountAccess };
}
