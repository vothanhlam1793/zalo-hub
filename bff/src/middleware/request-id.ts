import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestId(req: Request, _res: Response, next: NextFunction) {
  req.requestId = (req.headers['x-request-id'] as string) || randomUUID();
  next();
}
