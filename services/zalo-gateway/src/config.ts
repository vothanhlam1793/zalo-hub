function requiredSecret(name: string, developmentValue: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV !== 'production') return developmentValue;
  throw new Error(`${name} must be set in production`);
}

export const config = {
  port: Number(process.env.ZALO_GATEWAY_PORT ?? 3502),
  internalJwtSecret: requiredSecret('INTERNAL_JWT_SECRET', 'development-internal-jwt-secret'),
  databaseUrl: process.env.ZALO_GATEWAY_DATABASE_URL ?? 'postgresql://zalohub:zalohub@localhost:5432/zalohub',
  databaseSchema: process.env.ZALO_GATEWAY_DB_SCHEMA ?? 'zalo_gateway',
};

if (!/^[a-z_][a-z0-9_]*$/.test(config.databaseSchema)) {
  throw new Error('ZALO_GATEWAY_DB_SCHEMA must be a PostgreSQL identifier');
}
