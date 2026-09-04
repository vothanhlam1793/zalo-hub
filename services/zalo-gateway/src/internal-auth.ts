import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { GatewayAccessClaims, GatewayOperation } from '@zalohub/contracts';
import { config } from './config.js';

export function requireGatewayOperation(operations: GatewayOperation[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authorization = req.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
    if (!token) {
      res.status(401).json({ error: 'Missing internal gateway token' });
      return;
    }

    try {
      const claims = jwt.verify(token, config.internalJwtSecret, {
        issuer: 'management-api',
        audience: 'zalo-gateway',
      }) as GatewayAccessClaims;
      if (!operations.includes(claims.operation)) {
        res.status(403).json({ error: 'Gateway operation not permitted' });
        return;
      }
      res.locals.gatewayClaims = claims;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid internal gateway token' });
    }
  };
}
