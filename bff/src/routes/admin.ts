import { Router, type Response } from 'express';
import { cookieAuth } from '../middleware/auth.js';
import { backend } from '../proxy/http-client.js';
import { success, mapBackendError } from '../types/api.js';

const router = Router();

function eid(v: unknown) { return encodeURIComponent(String(v)); }

function respond(res: Response, result: Awaited<ReturnType<typeof backend.get>>, requestId?: string) {
  res.status(result.status).json(result.ok ? success(result.body, requestId) : mapBackendError(result.status, result.body, requestId));
}

router.get('/users', cookieAuth, async (req, res) => {
  respond(res, await backend.get('/api/admin/users', req.token), req.requestId);
});

router.post('/users', cookieAuth, async (req, res) => {
  respond(res, await backend.post('/api/admin/users', req.body, req.token), req.requestId);
});

router.put('/users/:id', cookieAuth, async (req, res) => {
  respond(res, await backend.put(`/api/admin/users/${eid(req.params.id)}`, req.body, req.token), req.requestId);
});

router.delete('/users/:id', cookieAuth, async (req, res) => {
  respond(res, await backend.delete(`/api/admin/users/${eid(req.params.id)}`, req.token), req.requestId);
});

router.get('/accounts/all', cookieAuth, async (req, res) => {
  respond(res, await backend.get('/api/admin/accounts/all', req.token), req.requestId);
});

router.get('/accounts/:id/entities', cookieAuth, async (req, res) => {
  respond(res, await backend.get(`/api/admin/accounts/${eid(req.params.id)}/entities`, req.token), req.requestId);
});

router.post('/accounts/:id/members', cookieAuth, async (req, res) => {
  respond(res, await backend.post(`/api/admin/accounts/${eid(req.params.id)}/members`, req.body, req.token), req.requestId);
});

router.delete('/accounts/:id/members/:userId', cookieAuth, async (req, res) => {
  respond(res, await backend.delete(`/api/admin/accounts/${eid(req.params.id)}/members/${eid(req.params.userId)}`, req.token), req.requestId);
});

router.put('/accounts/:id/members/:userId', cookieAuth, async (req, res) => {
  respond(res, await backend.put(`/api/admin/accounts/${eid(req.params.id)}/members/${eid(req.params.userId)}`, req.body, req.token), req.requestId);
});

router.put('/accounts/:id/transfer', cookieAuth, async (req, res) => {
  respond(res, await backend.put(`/api/admin/accounts/${eid(req.params.id)}/transfer`, req.body, req.token), req.requestId);
});

router.put('/accounts/:id', cookieAuth, async (req, res) => {
  respond(res, await backend.put(`/api/admin/accounts/${eid(req.params.id)}`, req.body, req.token), req.requestId);
});

router.delete('/accounts/:id', cookieAuth, async (req, res) => {
  respond(res, await backend.delete(`/api/admin/accounts/${eid(req.params.id)}`, req.token), req.requestId);
});

router.post('/accounts/:id/reconnect', cookieAuth, async (req, res) => {
  respond(res, await backend.post(`/api/admin/accounts/${eid(req.params.id)}/reconnect`, {}, req.token), req.requestId);
});

router.get('/accounts/:id/reconnect/qr', cookieAuth, async (req, res) => {
  respond(res, await backend.get(`/api/admin/accounts/${eid(req.params.id)}/reconnect/qr`, req.token), req.requestId);
});

router.post('/accounts/:id/logout', cookieAuth, async (req, res) => {
  respond(res, await backend.post(`/api/admin/accounts/${eid(req.params.id)}/logout`, {}, req.token), req.requestId);
});

router.post('/accounts/:id/sync-profile', cookieAuth, async (req, res) => {
  respond(res, await backend.post(`/api/admin/accounts/${eid(req.params.id)}/sync-profile`, {}, req.token), req.requestId);
});

router.put('/me/accounts/:id/visible', cookieAuth, async (req, res) => {
  respond(res, await backend.put(`/api/me/accounts/${eid(req.params.id)}/visible`, req.body, req.token), req.requestId);
});

router.get('/bots', cookieAuth, async (req, res) => {
  respond(res, await backend.get('/api/admin/bots', req.token), req.requestId);
});

router.post('/bots', cookieAuth, async (req, res) => {
  respond(res, await backend.post('/api/admin/bots', req.body, req.token), req.requestId);
});

router.put('/bots/:id', cookieAuth, async (req, res) => {
  respond(res, await backend.put(`/api/admin/bots/${eid(req.params.id)}`, req.body, req.token), req.requestId);
});

router.delete('/bots/:id', cookieAuth, async (req, res) => {
  respond(res, await backend.delete(`/api/admin/bots/${eid(req.params.id)}`, req.token), req.requestId);
});

export default router;
