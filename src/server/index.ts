import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { GoldLogger } from '../core/logger.js';
import { GoldRuntime } from '../core/runtime.js';
import { GoldStore } from '../core/store.js';
import { AccountRuntimeManager } from './account-manager.js';
import { createWsHandler } from './ws/handler.js';
import { createSystemRouter } from './routes/system.js';
import { createAuthRouter } from './routes/auth.js';
import { createAccountsRouter } from './routes/accounts.js';
import { createLegacyRouter } from './routes/legacy.js';
import { createMediaRouter } from './routes/media.js';
import { getEmptyStatus } from './helpers/status.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gold4ClientDir = path.resolve(__dirname, '../../dist/web');

const logger = new GoldLogger();
const loginStore = new GoldStore();
const loginRuntime = new GoldRuntime(loginStore, logger);
const accountManager = new AccountRuntimeManager(logger);
const app = express();
const port = Number(process.env.GOLD2_PORT ?? 3399);
const server = createServer(app);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

let loginPromise: Promise<void> | undefined;

const { broadcast } = createWsHandler(server, accountManager);

// Global middleware
app.use(express.json({ limit: '12mb' }));
app.use((_, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(gold4ClientDir));

// Mount routers
app.use('/api', createSystemRouter(logger, accountManager, () => loginPromise));
app.use('/api', createAuthRouter(logger, loginRuntime, loginStore, accountManager, broadcast, () => loginPromise, (p) => { loginPromise = p; }, getEmptyStatus));
app.use('/api/accounts', createAccountsRouter(logger, accountManager, broadcast, upload));
app.use('/api', createLegacyRouter(logger, accountManager, broadcast, upload));
app.use('/media', createMediaRouter());

// SPA fallback
app.get('*', (_req, res) => {
  const target = path.join(gold4ClientDir, 'index.html');
  res.sendFile(target);
});

server.listen(port, () => {
  console.log(`gold-2-web running at http://localhost:${port}`);
  void accountManager.warmStartAllAccounts();
});
