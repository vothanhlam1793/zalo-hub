import { Router } from 'express';
import { cookieAuth } from '../middleware/auth.js';
import { backend } from '../proxy/http-client.js';
import { success, mapBackendError } from '../types/api.js';
import { COOKIE_NAME } from '../config.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ ok: false, code: 'VALIDATION_MISSING_FIELD', message: 'Vui long nhap email va mat khau' });
    return;
  }

  const result = await backend.post('/api/auth/login', { email, password });
  if (!result.ok) {
    res.status(result.status).json(mapBackendError(result.status, result.body, req.requestId));
    return;
  }

  const data = result.body as { token: string; user: Record<string, unknown> };
  res.cookie(COOKIE_NAME, data.token, {
    httpOnly: true,
    secure: req.protocol === 'https',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  res.json(success({ user: data.user }, req.requestId));
});

router.post('/logout', cookieAuth, async (req, res) => {
  const result = await backend.post('/api/auth/logout', {}, req.token);
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: false, sameSite: 'lax', path: '/' });
  res.json(success({ ok: true }, req.requestId));
});

router.get('/me', cookieAuth, async (req, res) => {
  const result = await backend.get('/api/auth/me', req.token);
  if (!result.ok) {
    res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: false, sameSite: 'lax', path: '/' });
    res.status(result.status).json(mapBackendError(result.status, result.body, req.requestId));
    return;
  }

  const data = result.body as { token: string; user: Record<string, unknown> };
  res.json(success({ user: data.user }, req.requestId));
});

export default router;
