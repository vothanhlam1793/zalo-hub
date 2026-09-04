import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { JWT_SECRET } from '../config.js';
import { ErrorCode, error } from '../types/api.js';

declare global {
  namespace Express {
    interface Request {
      systemUserId?: string;
      token?: string;
    }
  }
}

interface JwtPayload {
  userId: string;
  iat: number;
  exp: number;
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function cookieAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.zalohub_token as string | undefined;
  if (!token) {
    res.status(401).json(error(ErrorCode.AUTH_NOT_AUTHENTICATED, 'Vui long dang nhap'));
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.clearCookie('zalohub_token', { httpOnly: true, secure: false, sameSite: 'lax' });
    res.status(401).json(error(ErrorCode.AUTH_TOKEN_EXPIRED, 'Phien dang nhap het han, vui long dang nhap lai'));
    return;
  }

  req.systemUserId = payload.userId;
  req.token = token;
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.zalohub_token as string | undefined;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.systemUserId = payload.userId;
      req.token = token;
    }
  }
  next();
}
