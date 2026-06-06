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
    let token: string | undefined;

    // X-Bot-Token header (for Dify Custom Tool via apiKey auth)
    const botToken = req.headers['x-bot-token'];
    if (typeof botToken === 'string' && botToken.length > 0) {
      token = botToken;
    }

    // Fallback: Authorization Bearer
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      res.status(401).json({ error: 'Missing X-Bot-Token header' });
      return;
    }

    const bot = await botService.findByToken(token);
    if (!bot) {
      res.status(401).json({ error: 'Invalid bot token' });
      return;
    }

    req.difyBot = bot;
    next();
  };
}
