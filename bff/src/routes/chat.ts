import { Router } from 'express';
import { cookieAuth } from '../middleware/auth.js';
import { backend } from '../proxy/http-client.js';
import { success, mapBackendError } from '../types/api.js';

const router = Router();

router.post('/open-conversation', cookieAuth, async (req, res) => {
  const { accountId, conversationId, since, before, limit } = req.body as {
    accountId?: string; conversationId?: string;
    since?: string; before?: string; limit?: number;
  };
  if (!accountId || !conversationId) {
    res.status(400).json({ ok: false, code: 'VALIDATION_MISSING_FIELD', message: 'Thieu accountId hoac conversationId' });
    return;
  }

  const params = new URLSearchParams();
  if (since) params.set('since', since);
  if (before) params.set('before', before);
  if (limit) params.set('limit', String(limit));
  const suffix = params.size > 0 ? `?${params.toString()}` : '';

  const [messagesRes, metadataRes] = await Promise.all([
    backend.get(
      `/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`,
      req.token,
    ),
    backend.post(
      `/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/sync-metadata`,
      {},
      req.token,
    ),
  ]);

  const messages = messagesRes.ok ? messagesRes.body : null;
  const metadata = metadataRes.ok ? metadataRes.body : null;

  if (messagesRes.ok || metadataRes.ok) {
    res.json(success({ messages, metadata }, req.requestId));
    return;
  }

  res.status(502).json(mapBackendError(messagesRes.status, messagesRes.body, req.requestId));
});

router.get('/conversations/:accountId/messages/:conversationId', cookieAuth, async (req, res) => {
  const accountId = String(req.params.accountId);
  const conversationId = String(req.params.conversationId);
  const { since, before, limit } = req.query;

  const params = new URLSearchParams();
  if (since) params.set('since', String(since));
  if (before) params.set('before', String(before));
  if (limit) params.set('limit', String(limit));
  const suffix = params.size > 0 ? `?${params.toString()}` : '';

  const result = await backend.get(
    `/api/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`,
    req.token,
  );

  if (!result.ok) {
    res.status(result.status).json(mapBackendError(result.status, result.body, req.requestId));
    return;
  }

  res.json(success(result.body, req.requestId));
});

router.get('/conversations/:accountId', cookieAuth, async (req, res) => {
  const accountId = String(req.params.accountId);
  const result = await backend.get(`/api/accounts/${encodeURIComponent(accountId)}/conversations`, req.token);

  if (!result.ok) {
    res.status(result.status).json(mapBackendError(result.status, result.body, req.requestId));
    return;
  }

  res.json(success(result.body, req.requestId));
});

export default router;
