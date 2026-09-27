import { Router, type Request, type Response, type RequestHandler } from 'express';
import multer from 'multer';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Knex } from 'knex';
import type { GoldLogger } from '../../core/logger.js';
import { canUserAccessConversation } from '../helpers/conversation-access.js';
import { ComposerService, parseBatch, type ComposerScope } from '../services/composer-service.js';
import { MAX_FILE_BYTES } from '../services/composer-object-store.js';
import { SendRequestError } from '../services/send-request-service.js';

export function createComposerRouter(db: Knex, service: ComposerService, logger: Pick<GoldLogger, 'error'>) {
  const router = Router({ mergeParams: true });
  let uploads = 0;
  const userUploads = new Map<string, number>();
  const error = (res: Response, e: unknown) => {
    if (e instanceof SendRequestError) res.status(e.status).json({ code: e.code, error: e.message });
    else {
      logger.error('composer_request_failed', { code: 'COMPOSER_UNAVAILABLE' });
      res.status(503).json({ code: 'COMPOSER_UNAVAILABLE', error: 'Composer temporarily unavailable. Query the same IDs before retrying.' });
    }
  };
  const scope = (req: Request): ComposerScope => ({ account_id: String(req.params.accountId),
    system_user_id: (req as Request & { systemUserId: string }).systemUserId, conversation_id: String(req.query.conversationId) });
  // Defense in depth: authorization remains mandatory even when parent optional middleware is absent.
  router.use((req, res, next) => {
    void (async () => {
      const s = scope(req);
      if (!s.system_user_id) throw new SendRequestError(401, 'UNAUTHENTICATED', 'Authentication required.');
      if (typeof req.query.conversationId !== 'string' || !/^(direct|group):[^\s:]+$/.test(s.conversation_id) || s.conversation_id.length > 255) {
        throw new SendRequestError(400, 'INVALID_TARGET', 'conversationId query is required.');
      }
      const user = await db('system_users').where({ id: s.system_user_id }).first();
      const membership = await db('zalo_account_memberships').where({ user_id: s.system_user_id, account_id: s.account_id }).first();
      if (user?.role !== 'super_admin' && !['editor', 'admin', 'master'].includes(membership?.role)) {
        throw new SendRequestError(403, 'FORBIDDEN', 'Account editor access required.');
      }
      if (!await canUserAccessConversation(db, s.system_user_id, s.account_id, s.conversation_id)) {
        throw new SendRequestError(403, 'FORBIDDEN', 'Conversation access denied.');
      }
      next();
    })().catch(e => error(res, e));
  });
  const route = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res) => {
    void fn(req, res).catch(e => error(res, e));
  };
  router.get('/capabilities', (_req, res) => res.json({ version: 1, staging: true, batch: true, nativeAlbum: false,
    maxFileBytes: MAX_FILE_BYTES, maxBatchItems: 10, uploadConcurrency: 2, ttlSeconds: 86400, attachmentContext: true,
    // Session-dependent extension capabilities live behind the same scoped auth boundary.
    extensionsCapabilitiesPath: '/tools/capabilities',
    extensions: { voice: false, location: false } }));
  router.post('/staging', route(async (req, res) => {
    const s = scope(req);
    const userKey = `${s.account_id}:${s.system_user_id}`;
    if (uploads >= 4 || (userUploads.get(userKey) ?? 0) >= 2) throw new SendRequestError(429, 'UPLOAD_CAPACITY', 'Upload concurrency exceeded.');
    uploads++; userUploads.set(userKey, (userUploads.get(userKey) ?? 0) + 1);
    let directory: string | undefined;
    try {
      directory = await mkdtemp(join(tmpdir(), 'zalohub-composer-'));
      const upload = multer({ dest: directory, limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0, parts: 2 } }).single('file');
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { req.destroy(); reject(new SendRequestError(408, 'UPLOAD_TIMEOUT', 'Upload timed out.')); }, 120_000);
        upload(req, res, e => { clearTimeout(timer); e ? reject(e) : resolve(); });
      }).catch(e => {
        if (e instanceof multer.MulterError) throw new SendRequestError(e.code === 'LIMIT_FILE_SIZE' ? 413 : 400, 'INVALID_ATTACHMENT', 'Invalid multipart upload.');
        throw e;
      });
      if (!req.file) throw new SendRequestError(400, 'INVALID_ATTACHMENT', 'Exactly one file is required.');
      res.status(201).json({ staging: await service.upload(s, req.file) });
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => logger.error('composer_temp_cleanup_failed', {}));
      uploads--; const remaining = (userUploads.get(userKey) ?? 1) - 1;
      if (remaining) userUploads.set(userKey, remaining); else userUploads.delete(userKey);
    }
  }));
  router.get('/staging', route(async (req, res) => res.json({ items: await service.list(scope(req)) })));
  router.get('/staging/:id', route(async (req, res) => res.json({ staging: await service.getStage(scope(req), String(req.params.id)) })));
  router.delete('/staging/:id', route(async (req, res) => { await service.remove(scope(req), String(req.params.id)); res.json({ ok: true }); }));
  router.post('/cleanup', route(async (req, res) => res.json({ deleted: await service.cleanup(scope(req)) })));
  router.post('/staging/:id/abandon', route(async (req, res) => {
    await service.remove(scope(req), String(req.params.id), false, true); res.json({ ok: true });
  }));
  router.post('/batches', route(async (req, res) => {
    const s = scope(req);
    let input: ReturnType<typeof parseBatch>;
    try { input = parseBatch(req.body); await service.createBatch(s, input); }
    catch (e) {
      // Only a synchronous validation rejection before reservation/execute is safe
      // for a NEW client intent to unlock. Never relabel transport/DB ambiguity.
      if (e instanceof SendRequestError && e.status === 400) throw new SendRequestError(400, 'BATCH_VALIDATION_REJECTED', e.message);
      throw e;
    }
    // Durable reservation precedes execution; a lost HTTP response cannot lose child IDs.
    void service.execute(s, input).catch(() => logger.error('composer_batch_execution_failed', { accountId: s.account_id, clientBatchId: input.clientBatchId }));
    res.setHeader('Retry-After', '2');
    res.status(202).json({ batch: await service.getBatch(s, input.clientBatchId) });
  }));
  router.get('/batches/:id', route(async (req, res) => res.json({ batch: await service.getBatch(scope(req), String(req.params.id)) })));
  return router;
}
