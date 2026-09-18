import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Knex } from 'knex';
import type { GoldStore } from '../../core/store/index.js';
import type { AccountRuntimeManager } from '../account-manager.js';

export function createTagsRouter(
  store: GoldStore,
  accountManager: AccountRuntimeManager,
  broadcast: (payload: Record<string, unknown>) => void,
  requireAuth?: (req: Request, res: Response, next: NextFunction) => void,
  requireAccountAccess?: (minRole?: string) => (req: Request, res: Response, next: NextFunction) => void,
) {
  const router = Router();
  const auth = requireAuth ? [requireAuth] : [];
  const needsViewer = requireAccountAccess?.('viewer');
  const viewAny = requireAuth && needsViewer ? [requireAuth, needsViewer] : auth;

  // List all tags (optional ?accountId=...)
  router.get('/', ...viewAny, async (req, res) => {
    try {
      const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
      const tags = await store.tagRepo.listTags(accountId);
      res.json({ tags });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Create a new system tag
  router.post('/', ...viewAny, async (req, res) => {
    try {
      const { name, color, emoji, accountId, source } = req.body;
      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'Tag name la bat buoc' });
        return;
      }
      const tag = await store.tagRepo.createTag({
        name: name.trim(),
        color: color?.trim() || '#1890ff',
        emoji: emoji?.trim() || null,
        accountId: accountId?.trim() || undefined,
        source: source || 'system',
      });
      broadcast({ type: 'tag_created', tag });
      res.json({ ok: true, tag });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Delete a system tag
  router.delete('/:tagId', ...viewAny, async (req, res) => {
    try {
      const tagId = String(req.params.tagId);
      const deleted = await store.tagRepo.deleteTag(tagId);
      if (deleted) {
        broadcast({ type: 'tag_deleted', tagId });
      }
      res.json({ ok: true, deleted });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Assign tag to conversation
  router.post('/assign', ...viewAny, async (req, res) => {
    try {
      const { conversationId, tagId, accountId } = req.body;
      if (!conversationId || !tagId) {
        res.status(400).json({ error: 'conversationId va tagId la bat buoc' });
        return;
      }
      await store.tagRepo.assignTagToConversation(conversationId, tagId, 'manual');
      const tags = await store.tagRepo.getConversationTags(conversationId);
      broadcast({
        type: 'conversation_tags_updated',
        conversationId,
        accountId,
        tags,
      });
      res.json({ ok: true, conversationId, tags });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Remove tag from conversation
  router.post('/unassign', ...viewAny, async (req, res) => {
    try {
      const { conversationId, tagId, accountId } = req.body;
      if (!conversationId || !tagId) {
        res.status(400).json({ error: 'conversationId va tagId la bat buoc' });
        return;
      }
      await store.tagRepo.removeTagFromConversation(conversationId, tagId);
      const tags = await store.tagRepo.getConversationTags(conversationId);
      broadcast({
        type: 'conversation_tags_updated',
        conversationId,
        accountId,
        tags,
      });
      res.json({ ok: true, conversationId, tags });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Manual trigger sync labels from Zalo
  router.post('/sync/:accountId', ...viewAny, async (req, res) => {
    try {
      const accountId = String(req.params.accountId);
      const runtime = accountManager.getRuntime(accountId);
      if (!runtime) {
        res.status(404).json({ error: `Runtime cho account ${accountId} khong ton tai` });
        return;
      }
      const tags = await runtime.syncLabels();
      const summaries = await runtime.getConversationSummaries();
      broadcast({
        type: 'conversation_summaries',
        accountId,
        conversations: summaries,
      });
      res.json({ ok: true, tags, count: tags.length });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
