import { Router, type Request, type Response } from 'express';
import type { Knex } from 'knex';
import { canUserAccessConversation } from '../helpers/conversation-access.js';
import { SendRequestError, validateRequestId } from '../services/send-request-service.js';
import { actionView, DbActionStore, ExtendedToolsService, parseAction, prepareAction, toolCapabilities } from '../services/extended-tools-service.js';
import type { ComposerScope } from '../services/composer-service.js';
export function stickerKeyword(value: unknown) {
  const query = typeof value === 'string' ? value.trim() : '';
  if (!query || query.length > 100) throw new SendRequestError(400, 'INVALID_QUERY', 'Enter a sticker search keyword (1–100 characters).');
  return query;
}

export function createExtendedToolsRouter(db: Knex, getApi: (account: string) => any) {
  const router = Router({ mergeParams: true });
  const store = new DbActionStore(db), service = new ExtendedToolsService(store);
  let inFlight = 0;
  const scope = (req: Request): ComposerScope => ({ account_id: String(req.params.accountId),
    system_user_id: (req as any).systemUserId, conversation_id: String(req.query.conversationId) });
  const error = (res: Response, e: unknown) => res.status(e instanceof SendRequestError ? e.status : 503)
    .json({ ...((e as any)?.reserved === false ? { reserved: false, dispatched: false } : {}), code: e instanceof SendRequestError ? e.code : 'TOOLS_UNAVAILABLE', error: e instanceof SendRequestError ? e.message : 'Tools unavailable. Query the existing action ID; do not resend.' });
  const authorize = async (s: ComposerScope) => {
    if (!s.system_user_id) throw new SendRequestError(401, 'UNAUTHENTICATED', 'Authentication required.');
    if (!/^(direct|group):[^\s:]{1,200}$/.test(s.conversation_id)) throw new SendRequestError(400, 'INVALID_TARGET', 'Invalid conversation.');
    const user = await db('system_users').where({ id: s.system_user_id }).first();
    const member = await db('zalo_account_memberships').where({ user_id: s.system_user_id, account_id: s.account_id }).first();
    if ((user?.role !== 'super_admin' && !['editor', 'admin', 'master'].includes(member?.role)) ||
      !await canUserAccessConversation(db, s.system_user_id, s.account_id, s.conversation_id)) throw new SendRequestError(403, 'FORBIDDEN', 'Conversation editor access required.');
  };
  router.use((req, res, next) => { void authorize(scope(req)).then(() => next()).catch(e => error(res, e)); });
  const route = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) => {
    if (req.method !== 'GET' && !req.path.endsWith('/recover') && inFlight >= 8) { error(res, Object.assign(new SendRequestError(429, 'TOOL_CAPACITY', 'Tool capacity reached.'), { reserved: false, dispatched: false })); return; }
    inFlight++;
    void fn(req, res).catch(e => error(res, e)).finally(() => { inFlight--; });
  };
  router.get('/capabilities', route(async (req, res) => res.json(toolCapabilities(getApi(scope(req).account_id), scope(req).conversation_id))));
  router.get('/stickers', route(async (req, res) => {
    const api = getApi(scope(req).account_id);
    if (!toolCapabilities(api, scope(req).conversation_id).sticker) throw new SendRequestError(409, 'UNSUPPORTED', 'Sticker catalogue unavailable.');
    const query = stickerKeyword(req.query.q);
    const ids = (await api.getStickers(query)).slice(0, 40);
    const details = ids.length ? await api.getStickersDetail(ids) : [];
    res.json({ stickers: details.map((s: any) => ({ id: s.id, text: s.text, url: /^https:\/\//.test(s.stickerUrl) ? s.stickerUrl : undefined })) });
  }));
  router.get('/actions', route(async (req, res) => {
    // Never hide an unresolved barrier behind the recent-history limit.
    const pending = await db('composer_actions').where(scope(req)).whereIn('status', ['pending', 'unknown']).orderBy('created_at', 'desc');
    const terminal = await db('composer_actions').where(scope(req)).whereIn('status', ['accepted', 'rejected']).orderBy('created_at', 'desc').limit(50);
    res.json({ actions: [...pending, ...terminal].map(actionView) });
  }));
  router.get('/actions/:id', route(async (req, res) => res.json(actionView(await store.get(scope(req), validateRequestId(String(req.params.id)))))));
  router.post('/actions/:id/recover', route(async (req, res) => res.json(actionView(await store.recover(scope(req), validateRequestId(String(req.params.id)))))));
  router.post('/actions', route(async (req, res) => {
    const s = scope(req), input = parseAction(req.body);
    // Replays must not depend on source messages or a still-connected SDK.
    let existing: any;
    try { existing = await store.get(s, input.id); } catch (e) { if (!(e instanceof SendRequestError && e.status === 404)) throw e; }
    if (existing) { res.json(await service.execute(s, input, async () => { throw new Error('Replay cannot dispatch'); })); return; }
    res.status(202).json(await service.execute(s, input, async () => { throw new Error('Unprepared action'); }, async () => {
      await authorize(s);
      if (input.action === 'forward') await authorize({ ...s, conversation_id: String(input.payload.target) });
      return prepareAction(db, s, input, getApi(s.account_id), target => authorize({ ...s, conversation_id: target }));
    }));
  }));
  return router;
}
