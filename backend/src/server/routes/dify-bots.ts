import { Router, type Request, type Response } from 'express';
import type { DifyBotService } from '../services/dify-bot-service.js';

export function createDifyBotsRouter(
  botService: DifyBotService,
  requireAuth: (req: Request, res: Response, next: (err?: unknown) => void) => void,
  requireAdmin: (req: Request, res: Response, next: (err?: unknown) => void) => void,
) {
  const router = Router();
  router.use(requireAuth);
  router.use(requireAdmin);

  // List all bots, optionally filtered by account
  router.get('/', async (req, res) => {
    try {
      const accountId = req.query.accountId as string | undefined;
      const bots = await botService.listBots(accountId);
      res.json({ bots });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Get single bot
  router.get('/:id', async (req, res) => {
    try {
      const bot = await botService.getBot(req.params.id);
      if (!bot) {
        res.status(404).json({ error: 'Bot not found' });
        return;
      }
      res.json(bot);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Create bot
  router.post('/', async (req, res) => {
    try {
      const bot = await botService.createBot(req.body);
      res.status(201).json(bot);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Update bot
  router.put('/:id', async (req, res) => {
    try {
      const bot = await botService.updateBot(req.params.id, req.body);
      if (!bot) {
        res.status(404).json({ error: 'Bot not found' });
        return;
      }
      res.json(bot);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Delete bot
  router.delete('/:id', async (req, res) => {
    try {
      const ok = await botService.deleteBot(req.params.id);
      if (!ok) {
        res.status(404).json({ error: 'Bot not found' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
