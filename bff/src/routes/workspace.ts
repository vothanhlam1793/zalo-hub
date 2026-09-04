import { Router } from 'express';
import { cookieAuth } from '../middleware/auth.js';
import { backend } from '../proxy/http-client.js';
import { success, mapBackendError } from '../types/api.js';

const router = Router();

router.post('/init', cookieAuth, async (req, res) => {
  const [statusRes, accountsRes, myAccountsRes] = await Promise.all([
    backend.get('/api/status', req.token),
    backend.get('/api/accounts', req.token),
    backend.get('/api/me/accounts', req.token),
  ]);

  const status = statusRes.ok ? statusRes.body : null;
  const accounts = accountsRes.ok ? accountsRes.body : null;
  const myAccounts = myAccountsRes.ok ? myAccountsRes.body : null;

  if (statusRes.ok || accountsRes.ok || myAccountsRes.ok) {
    res.json(success({ status, accounts, myAccounts }, req.requestId));
    return;
  }

  res.status(502).json(mapBackendError(statusRes.status, statusRes.body, req.requestId));
});

router.post('/load-account', cookieAuth, async (req, res) => {
  const { accountId, refresh } = req.body as { accountId?: string; refresh?: boolean };
  if (!accountId) {
    res.status(400).json({ ok: false, code: 'VALIDATION_MISSING_FIELD', message: 'Thieu accountId' });
    return;
  }

  const qs = refresh ? '?refresh=1' : '';
  const [contactsRes, groupsRes, conversationsRes] = await Promise.all([
    backend.get(`/api/accounts/${encodeURIComponent(accountId)}/contacts${qs}`, req.token),
    backend.get(`/api/accounts/${encodeURIComponent(accountId)}/groups${qs}`, req.token),
    backend.get(`/api/accounts/${encodeURIComponent(accountId)}/conversations`, req.token),
  ]);

  const contacts = contactsRes.ok ? contactsRes.body : null;
  const groups = groupsRes.ok ? groupsRes.body : null;
  const conversations = conversationsRes.ok ? conversationsRes.body : null;

  if (contactsRes.ok || groupsRes.ok || conversationsRes.ok) {
    res.json(success({ contacts, groups, conversations }, req.requestId));
    return;
  }

  const firstError = [contactsRes, groupsRes, conversationsRes].find(r => !r.ok);
  res.status(firstError?.status ?? 502).json(mapBackendError(firstError?.status ?? 502, firstError?.body ?? {}, req.requestId));
});

router.post('/account/activate', cookieAuth, async (req, res) => {
  const { accountId } = req.body as { accountId?: string };
  if (!accountId) {
    res.status(400).json({ ok: false, code: 'VALIDATION_MISSING_FIELD', message: 'Thieu accountId' });
    return;
  }

  const result = await backend.post('/api/accounts/activate', { accountId }, req.token);
  if (!result.ok) {
    res.status(result.status).json(mapBackendError(result.status, result.body, req.requestId));
    return;
  }

  res.json(success(result.body, req.requestId));
});

router.get('/me/accounts', cookieAuth, async (req, res) => {
  const result = await backend.get('/api/me/accounts', req.token);
  if (!result.ok) {
    res.status(result.status).json(mapBackendError(result.status, result.body, req.requestId));
    return;
  }
  res.json(success(result.body, req.requestId));
});

export default router;
