export const gatewayOperations = [
  'onboarding.manage',
  'accounts.read',
  'accounts.manage',
  'chat.read',
  'chat.write',
] as const;

export type GatewayOperation = (typeof gatewayOperations)[number];

export type GatewayAccessClaims = {
  iss: 'management-api';
  aud: 'zalo-gateway';
  sub: string;
  accountId?: string;
  operation: GatewayOperation;
  jti: string;
};

export type CreateGatewayTokenRequest = {
  userId: string;
  accountId?: string;
  operation: GatewayOperation;
};

export type CreateGatewayTokenResponse = {
  token: string;
  expiresInSeconds: number;
};

export type ServiceHealth = {
  ok: true;
  service: string;
  timestamp: string;
};

export type EventEnvelope<TType extends string, TPayload> = {
  id: string;
  type: TType;
  occurredAt: string;
  payload: TPayload;
};
