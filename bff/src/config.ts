export const PORT = parseInt(process.env.BFF_PORT ?? '3401', 10);
export const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:3399').replace(/\/$/, '');
export const JWT_SECRET = process.env.JWT_SECRET || 'zalohub-dev-secret-change-in-production';
export const COOKIE_NAME = 'zalohub_token';
export const REQUEST_TIMEOUT_MS = 30_000;
