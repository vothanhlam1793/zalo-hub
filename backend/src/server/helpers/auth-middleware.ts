import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { Knex } from 'knex';

const JWT_SECRET = process.env.JWT_SECRET || 'zalohub-dev-secret-change-in-production';

export function createAuthMiddleware(knex?: Knex) {
  function requireAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization || '';
    const token = header.replace('Bearer ', '').trim();

    if (!token) {
      res.status(401).json({ error: 'Yeu cau xac thuc' });
      return;
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string; iat: number; exp: number };
      (req as any).systemUserId = payload.userId;
      next();
    } catch {
      res.status(401).json({ error: 'Token khong hop le hoac da het han' });
    }
  }

  function requireSystemRole(role: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).systemUserId;
      if (!userId) {
        res.status(401).json({ error: 'Chua xac thuc' });
        return;
      }

      if (!knex) {
        res.status(500).json({ error: 'Middleware chua duoc cau hinh store' });
        return;
      }

      const { rows } = await knex.raw('SELECT role FROM system_users WHERE id = ?', [userId]);
      const user = rows[0] as { role: string } | undefined;
      if (!user || (user.role !== role && user.role !== 'super_admin')) {
        res.status(403).json({ error: 'Khong co quyen thuc hien hanh dong nay' });
        return;
      }

      next();
    };
  }

  function requireAccountAccess(minRole?: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).systemUserId;
      if (!userId) {
        res.status(401).json({ error: 'Chua xac thuc' });
        return;
      }

      const accountId = String(req.params.accountId ?? '').trim();
      if (!accountId) {
        next();
        return;
      }

      if (!knex) {
        res.status(500).json({ error: 'Middleware chua duoc cau hinh store' });
        return;
      }

      const { rows } = await knex.raw('SELECT role FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?', [userId, accountId]);
      const mem = rows[0] as { role: string } | undefined;
      if (!mem) {
        res.status(403).json({ error: 'Khong co quyen truy cap tai khoan Zalo nay' });
        return;
      }

      if (minRole) {
        const roleRank = { master: 5, admin: 4, editor: 3, viewer: 2 } as Record<string, number>;
        if ((roleRank[mem.role] ?? 0) < (roleRank[minRole] ?? 0)) {
          res.status(403).json({ error: `Can it nhat quyen ${minRole} de thuc hien hanh dong nay` });
          return;
        }
      }

      next();
    };
  }

  async function requireAccountMaster(req: Request, res: Response, next: NextFunction) {
    const userId = (req as any).systemUserId;
    if (!userId) {
      res.status(401).json({ error: 'Chua xac thuc' });
      return;
    }
    const accountId = String(req.params.accountId ?? req.params.id ?? '').trim();
    if (!accountId) {
      res.status(400).json({ error: 'Thieu accountId' });
      return;
    }
    if (!knex) {
      res.status(500).json({ error: 'Middleware chua duoc cau hinh store' });
      return;
    }
    const { rows } = await knex.raw('SELECT role FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?', [userId, accountId]);
    const mem = rows[0] as { role: string } | undefined;
    if (!mem || mem.role !== 'master') {
      res.status(403).json({ error: 'Chi master moi co quyen thuc hien hanh dong nay' });
      return;
    }
    next();
  }

  return { requireAuth, requireSystemRole, requireAccountAccess, requireAccountMaster };
}
