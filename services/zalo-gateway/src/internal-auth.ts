import jwt from 'jsonwebtoken';
import type { GatewayAccessClaims, GatewayOperation } from '@zalohub/contracts';
import { config } from './config.js';

export function requireGatewayOperation(operations: GatewayOperation[]) {
  return (req: { get(name: string): string | undefined }, res: { status(code: number): { json(body: unknown): void } }, next: () => void) => {
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
      next();
    } catch {
      res.status(401).json({ error: 'Invalid internal gateway token' });
    }
  };
}
