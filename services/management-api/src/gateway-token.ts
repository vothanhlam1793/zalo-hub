import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { CreateGatewayTokenRequest, GatewayAccessClaims } from '@zalohub/contracts';
import { config } from './config.js';

export const gatewayTokenTtlSeconds = 60;

export function createGatewayToken(request: CreateGatewayTokenRequest): string {
  const claims: GatewayAccessClaims = {
    iss: 'management-api',
    aud: 'zalo-gateway',
    sub: request.userId,
    accountId: request.accountId,
    operation: request.operation,
    jti: crypto.randomUUID(),
  };

  return jwt.sign(claims, config.internalJwtSecret, { expiresIn: gatewayTokenTtlSeconds });
}
