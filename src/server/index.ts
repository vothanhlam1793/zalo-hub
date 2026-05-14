import express from 'express';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason instanceof Error ? reason.message : String(reason));
});

process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error.message, error.stack?.slice(0, 200));
});

import { GoldLogger } from '../core/logger.js';
import { GoldRuntime } from '../core/runtime.js';
import { GoldStore } from '../core/store.js';
import { AccountRuntimeManager } from './account-manager.js';
import { createWsHandler } from './ws/handler.js';
import { createSystemRouter } from './routes/system.js';
import { createAuthRouter } from './routes/auth.js';
import { createSystemAuthRouter } from './routes/system-auth.js';
import { createAccountsRouter } from './routes/accounts.js';
import { createLegacyRouter } from './routes/legacy.js';
import { createMediaRouter } from './routes/media.js';
import { createAdminRouter } from './routes/admin.js';
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
accountManager.setBroadcast(broadcast);

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
const systemAuth = createSystemAuthRouter(logger, loginRuntime, loginStore, accountManager, broadcast, () => loginPromise, (p) => { loginPromise = p; }, getEmptyStatus);
app.use('/api', systemAuth.router);
app.use('/api/accounts', createAccountsRouter(logger, accountManager, broadcast, upload, systemAuth.requireAuth, systemAuth.requireAccountAccess));
app.use('/api', createLegacyRouter(logger, accountManager, broadcast, upload));
app.use('/media', createMediaRouter());
app.use('/api', createAdminRouter(logger, loginStore, systemAuth.requireAuth, systemAuth.requireSystemRole('admin'), accountManager));

// SPA fallback
app.get('*', (_req, res) => {
  const target = path.join(gold4ClientDir, 'index.html');
  res.sendFile(target);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`gold-2-web running at http://localhost:${port}`);

  const db = loginStore.getDb();
  const existing = db.prepare('SELECT id, role FROM system_users WHERE email = ?').get('admin@zalohub.local') as { id: string; role: string } | undefined;
  let adminUserId: string;
  if (!existing) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync('admin123', salt, 64).toString('hex');
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO system_users (id, email, password_hash, display_name, type, role) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, 'admin@zalohub.local', `${salt}:${hash}`, 'Admin', 'human', 'admin');
    console.log('Seeded admin user: admin@zalohub.local / admin123');
    adminUserId = id;
  } else {
    adminUserId = existing.id;
    if (existing.role !== 'admin') {
      db.prepare('UPDATE system_users SET role = ? WHERE id = ?').run('admin', adminUserId);
      console.log('Updated admin role to admin');
    }
  }

  // Auto-assign all existing Zalo accounts to admin as owner
  const accounts = db.prepare('SELECT account_id FROM accounts').all() as Array<{ account_id: string }>;
  for (const acc of accounts) {
    const hasMembership = db.prepare('SELECT 1 FROM zalo_account_memberships WHERE user_id = ? AND account_id = ?').get(adminUserId, acc.account_id);
    if (!hasMembership) {
      db.prepare('INSERT INTO zalo_account_memberships (user_id, account_id, role) VALUES (?, ?, ?)').run(adminUserId, acc.account_id, 'owner');
      console.log(`Assigned admin to account: ${acc.account_id}`);
    }
  }

  // warmStart deferred to avoid blocking or crashing
  setTimeout(() => {
    accountManager.warmStartAllAccounts().catch((err) => {
      console.error('warmStart failed:', err);
    });
  }, 2000);
});
