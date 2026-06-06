import type { Request, Response, NextFunction } from 'express';
import type { DifyBotService, DifyBotConfig } from '../services/dify-bot-service.js';

// Extend Express Request to hold the resolved bot
declare global {
  namespace Express {
    interface Request {
      difyBot?: DifyBotConfig;
    }
  }
}

export function createBotAuth(botService: DifyBotService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    const bot = await botService.findByToken(token);
    if (!bot) {
      res.status(401).json({ error: 'Invalid bot token' });
      return;
    }

    req.difyBot = bot;
    next();
  };
}
