import type { Request, Response, NextFunction } from 'express';
import { ErrorCode, error } from '../types/api.js';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  console.error(`[BFF ERROR] ${req.method} ${req.path}:`, err.message);
  res.status(500).json(
    error(ErrorCode.SERVER_INTERNAL, 'Loi may chu noi bo', err.message, req.requestId),
  );
}

export function notFound(req: Request, res: Response) {
  res.status(404).json(
    error(ErrorCode.VALIDATION_INVALID, `Khong tim thay: ${req.method} ${req.path}`, undefined, req.requestId),
  );
}
