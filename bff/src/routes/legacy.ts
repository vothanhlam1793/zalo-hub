import { Router } from 'express';
import { cookieAuth, optionalAuth } from '../middleware/auth.js';
import { backend } from '../proxy/http-client.js';
import { success, mapBackendError } from '../types/api.js';

const router = Router();

router.get('/status', optionalAuth, async (req, res) => {
  const result = await backend.get('/api/status', req.token);
  res.status(result.status).json(result.ok ? success(result.body, req.requestId) : mapBackendError(result.status, result.body, req.requestId));
});

router.get('/accounts', optionalAuth, async (req, res) => {
  const result = await backend.get('/api/accounts', req.token);
  res.status(result.status).json(result.ok ? success(result.body, req.requestId) : mapBackendError(result.status, result.body, req.requestId));
});

router.get('/account/:accountId/status', optionalAuth, async (req, res) => {
  const result = await backend.get(`/api/accounts/${encodeURIComponent(String(req.params.accountId))}/status`, req.token);
  res.status(result.status).json(result.ok ? success(result.body, req.requestId) : mapBackendError(result.status, result.body, req.requestId));
});

router.post('/login/start', cookieAuth, async (req, res) => {
  const result = await backend.post('/api/login/start', {}, req.token);
  res.status(result.status).json(result.ok ? success(result.body, req.requestId) : mapBackendError(result.status, result.body, req.requestId));
});

router.get('/login/qr', optionalAuth, async (req, res) => {
  const result = await backend.get('/api/login/qr', req.token);
  res.status(result.status).json(result.ok ? success(result.body, req.requestId) : mapBackendError(result.status, result.body, req.requestId));
});

router.post('/account/:accountId/restart', cookieAuth, async (req, res) => {
  const result = await backend.post(`/api/accounts/${encodeURIComponent(String(req.params.accountId))}/restart`, undefined, req.token);
  res.status(result.status).json(result.ok ? success(result.body, req.requestId) : mapBackendError(result.status, result.body, req.requestId));
});

router.put('/account/:accountId/profile', cookieAuth, async (req, res) => {
  const result = await backend.put(`/api/accounts/${encodeURIComponent(String(req.params.accountId))}/profile`, req.body, req.token);
  res.status(result.status).json(result.ok ? success(result.body, req.requestId) : mapBackendError(result.status, result.body, req.requestId));
});

router.post('/sync-history', cookieAuth, async (req, res) => {
  const { accountId, conversationId, beforeMessageId, timeoutMs } = req.body as {
    accountId?: string; conversationId?: string; beforeMessageId?: string; timeoutMs?: number;
  };
  if (!accountId || !conversationId) {
    res.status(400).json({ ok: false, code: 'VALIDATION_MISSING_FIELD', message: 'Thieu accountId hoac conversationId' });
    return;
  }
  const result = await backend.post(
    `/api/accounts/${encodeURIComponent(accountId)}/conversations/sync-history`,
    { conversationId, beforeMessageId, timeoutMs },
    req.token,
  );
  res.status(result.status).json(result.ok ? success(result.body, req.requestId) : mapBackendError(result.status, result.body, req.requestId));
});

router.post('/mobile-sync', cookieAuth, async (req, res) => {
  const { accountId } = req.body as { accountId?: string };
  if (!accountId) {
    res.status(400).json({ ok: false, code: 'VALIDATION_MISSING_FIELD', message: 'Thieu accountId' });
    return;
  }
  const result = await backend.post(`/api/accounts/${encodeURIComponent(accountId)}/mobile-sync`, {}, req.token);
  res.status(result.status).json(result.ok ? success(result.body, req.requestId) : mapBackendError(result.status, result.body, req.requestId));
});

router.post('/mobile-sync-thread', cookieAuth, async (req, res) => {
  const { accountId, threadId, threadType, timeoutMs } = req.body as {
    accountId?: string; threadId?: string; threadType?: string; timeoutMs?: number;
  };
  if (!accountId || !threadId) {
    res.status(400).json({ ok: false, code: 'VALIDATION_MISSING_FIELD', message: 'Thieu accountId hoac threadId' });
    return;
  }
  const result = await backend.post(
    `/api/accounts/${encodeURIComponent(accountId)}/mobile-sync-thread`,
    { threadId, threadType: threadType || 'direct', timeoutMs },
    req.token,
  );
  res.status(result.status).json(result.ok ? success(result.body, req.requestId) : mapBackendError(result.status, result.body, req.requestId));
});

router.post('/sync-all', cookieAuth, async (req, res) => {
  const { accountId } = req.body as { accountId?: string };
  if (!accountId) {
    res.status(400).json({ ok: false, code: 'VALIDATION_MISSING_FIELD', message: 'Thieu accountId' });
    return;
  }
  const result = await backend.post(`/api/accounts/${encodeURIComponent(accountId)}/sync-all`, {}, req.token);
  res.status(result.status).json(result.ok ? success(result.body, req.requestId) : mapBackendError(result.status, result.body, req.requestId));
});

export default router;
