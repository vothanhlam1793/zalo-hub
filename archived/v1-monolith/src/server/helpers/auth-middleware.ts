import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { GoldStore } from '../../core/store.js';

const JWT_SECRET = process.env.JWT_SECRET || 'zalohub-dev-secret-change-in-production';

export function createAuthMiddleware(store?: GoldStore) {
  function requireAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization || '';
    const token = header.replace('Bearer ', '').trim();

    if (!token) {
      res.status(401).json({ error: 'Yêu cầu xác thực' });
      return;
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string; iat: number; exp: number };
      (req as any).systemUserId = payload.userId;
      next();
    } catch {
      res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
    }
  }

  function requireSystemRole(role: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).systemUserId;
      if (!userId) {
        res.status(401).json({ error: 'Chưa xác thực' });
        return;
      }

      if (!store) {
        res.status(500).json({ error: 'Middleware chưa được cấu hình store' });
        return;
      }

      const user = store.getDb().prepare('SELECT role FROM system_users WHERE id = ?').get(userId) as { role: string } | undefined;
      if (!user || user.role !== role) {
        res.status(403).json({ error: 'Không có quyền thực hiện hành động này' });
        return;
      }

      next();
    };
  }

  function requireAccountAccess(minRole?: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).systemUserId;
      if (!userId) {
        res.status(401).json({ error: 'Chưa xác thực' });
        return;
      }

      const accountId = String(req.params.accountId ?? '').trim();
      if (!accountId) {
        next();
        return;
      }

      if (!store) {
        res.status(500).json({ error: 'Middleware chưa được cấu hình store' });
        return;
      }

      const mem = store.getDb().prepare('SELECT role FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?').get(userId, accountId) as { role: string } | undefined;
      if (!mem) {
        res.status(403).json({ error: 'Khong co quyen truy cap tai khoan Zalo nay' });
        return;
      }

      if (minRole) {
        const roleRank = { owner: 4, manager: 3, agent: 2, viewer: 1 } as Record<string, number>;
        if ((roleRank[mem.role] ?? 0) < (roleRank[minRole] ?? 0)) {
          res.status(403).json({ error: `Can it nhat quyen ${minRole} de thuc hien hanh dong nay` });
          return;
        }
      }

      next();
    };
  }

  return { requireAuth, requireSystemRole, requireAccountAccess };
}
