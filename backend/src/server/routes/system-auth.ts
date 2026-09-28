import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import type { Knex } from 'knex';
import type { GoldLogger } from '../../core/logger.js';
import { createAuthMiddleware } from '../helpers/auth-middleware.js';

const JWT_SECRET = process.env.JWT_SECRET || 'zalohub-dev-secret-change-in-production';

export function createSystemAuthRouter(
  logger: GoldLogger,
  knex: Knex,
) {
  const router = Router();
  const { requireAuth, requireSystemRole, requireAccountAccess, requireAccountMaster } = createAuthMiddleware(knex);

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

  async function createSession(userId: string): Promise<{ token: string; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
    await knex.raw('INSERT INTO system_sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [token, userId, expiresAt]);
    return { token, expiresAt };
  }

  router.post('/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ error: 'Email va mat khau la bat buoc' });
        return;
      }

      const { rows } = await knex.raw(
        'SELECT id, email, display_name, type, role, password_hash FROM system_users WHERE email = ?',
        [email]
      );
      const user = rows[0] as { id: string; email: string; display_name: string; type: string; role: string; password_hash: string } | undefined;

      if (!user || !verifyPassword(password, user.password_hash)) {
        res.status(401).json({ error: 'Email hoac mat khau khong dung' });
        return;
      }

      const { token } = await createSession(user.id);
      logger.info('system_user_login', { userId: user.id, email });

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          type: user.type,
          role: user.role,
        },
      });
    } catch (error) {
      logger.error('system_user_login_error', { error: String(error) });
      res.status(500).json({ error: 'Loi may chu' });
    }
  });

  router.post('/auth/logout', requireAuth, async (req, res) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      await knex.raw('DELETE FROM system_sessions WHERE token = ?', [token]);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Loi may chu' });
    }
  });

  router.get('/auth/me', requireAuth, async (req, res) => {
    const userId = (req as any).systemUserId as string;
    if (!userId) {
      res.status(401).json({ error: 'Chua xac thuc' });
      return;
    }

    const { rows: userRows } = await knex.raw(
      'SELECT id, email, display_name, type, role FROM system_users WHERE id = ?',
      [userId]
    );
    const user = userRows[0] as { id: string; email: string; display_name: string; type: string; role: string } | undefined;

    if (!user) {
      res.status(401).json({ error: 'Nguoi dung khong ton tai' });
      return;
    }

    const { rows: memberRows } = await knex.raw(
      'SELECT account_id, role FROM zalo_account_memberships WHERE user_id = ?',
      [userId]
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        type: user.type,
        role: user.role,
      },
      memberships: memberRows as Array<{ account_id: string; role: string }>,
    });
  });

  // --- User notification settings ---
  router.get('/user/settings', requireAuth, async (req, res) => {
    const userId = (req as any).systemUserId as string;
    try {
      const { rows } = await knex.raw('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
      const row = rows[0];
      if (!row) {
        res.json({
          settings: {
            userId,
            desktopNotification: true,
            soundEnabled: true,
            soundVolume: 80,
            notifyGroupMessages: true,
            showMessagePreview: true,
          }
        });
        return;
      }
      res.json({
        settings: {
          id: row.id,
          userId: row.user_id,
          desktopNotification: Boolean(row.desktop_notification),
          soundEnabled: Boolean(row.sound_enabled),
          soundVolume: Number(row.sound_volume ?? 80),
          notifyGroupMessages: Boolean(row.notify_group_messages),
          showMessagePreview: Boolean(row.show_message_preview),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      });
    } catch (err) {
      res.status(500).json({ error: 'Khong the lay cai dat nguoi dung' });
    }
  });

  router.put('/user/settings', requireAuth, async (req, res) => {
    const userId = (req as any).systemUserId as string;
    const body = req.body || {};
    try {
      const { rows: existingRows } = await knex.raw('SELECT id FROM user_settings WHERE user_id = ?', [userId]);
      const existing = existingRows[0];
      if (existing) {
        await knex('user_settings').where('user_id', userId).update({
          ...(body.desktopNotification !== undefined ? { desktop_notification: Boolean(body.desktopNotification) } : {}),
          ...(body.soundEnabled !== undefined ? { sound_enabled: Boolean(body.soundEnabled) } : {}),
          ...(body.soundVolume !== undefined ? { sound_volume: Math.max(0, Math.min(100, Number(body.soundVolume))) } : {}),
          ...(body.notifyGroupMessages !== undefined ? { notify_group_messages: Boolean(body.notifyGroupMessages) } : {}),
          ...(body.showMessagePreview !== undefined ? { show_message_preview: Boolean(body.showMessagePreview) } : {}),
          updated_at: knex.fn.now(),
        });
      } else {
        await knex('user_settings').insert({
          user_id: userId,
          desktop_notification: body.desktopNotification !== undefined ? Boolean(body.desktopNotification) : true,
          sound_enabled: body.soundEnabled !== undefined ? Boolean(body.soundEnabled) : true,
          sound_volume: body.soundVolume !== undefined ? Number(body.soundVolume) : 80,
          notify_group_messages: body.notifyGroupMessages !== undefined ? Boolean(body.notifyGroupMessages) : true,
          show_message_preview: body.showMessagePreview !== undefined ? Boolean(body.showMessagePreview) : true,
        });
      }
      const { rows } = await knex.raw('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
      const row = rows[0];
      res.json({
        ok: true,
        settings: {
          id: row.id,
          userId: row.user_id,
          desktopNotification: Boolean(row.desktop_notification),
          soundEnabled: Boolean(row.sound_enabled),
          soundVolume: Number(row.sound_volume ?? 80),
          notifyGroupMessages: Boolean(row.notify_group_messages),
          showMessagePreview: Boolean(row.show_message_preview),
        }
      });
    } catch (err) {
      res.status(500).json({ error: 'Khong the cap nhat cai dat nguoi dung' });
    }
  });

  return { router, requireAuth, requireSystemRole, requireAccountAccess, requireAccountMaster };
}
