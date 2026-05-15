import express from 'express';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import knexLib, { type Knex } from 'knex';

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
import { createAdminRouter } from './routes/admin.js';
import { getEmptyStatus } from './helpers/status.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminDir = path.resolve(__dirname, '../../dist/admin');

async function main() {
  const env = process.env.NODE_ENV || 'development';
  const config: Knex.Config = {
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgresql://zalohub:zalohub@localhost:5432/zalohub',
    pool: { min: 2, max: env === 'production' ? 20 : 10 },
    migrations: {
      directory: './db/migrations',
      extension: env === 'production' ? 'js' : 'ts',
    },
  };
  const knex = knexLib(config);

  await knex.migrate.latest();

  const logger = new GoldLogger();
  const loginStore = new GoldStore(knex);
  const loginRuntime = new GoldRuntime(loginStore, logger);
  const accountManager = new AccountRuntimeManager(logger, knex);
  const app = express();
  const port = Number(process.env.GOLD2_PORT ?? 3399);
  const server = createServer(app);

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  let loginPromise: Promise<void> | undefined;

  const { broadcast } = createWsHandler(server, accountManager, knex);
  accountManager.setBroadcast(broadcast);

  app.use(express.json({ limit: '12mb' }));
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  app.use('/admin', express.static(adminDir));
  app.get('/admin', (_req, res) => {
    res.sendFile(path.join(adminDir, 'index.html'));
  });

  app.use('/api', createSystemRouter(logger, accountManager, () => loginPromise));
  app.use('/api', createAuthRouter(logger, loginRuntime, knex, accountManager, broadcast, () => loginPromise, (p) => { loginPromise = p; }, getEmptyStatus));
  const systemAuth = createSystemAuthRouter(logger, knex);
  app.use('/api', systemAuth.router);
  app.use('/api/accounts', createAccountsRouter(logger, accountManager, broadcast, upload, systemAuth.requireAuth, systemAuth.requireAccountAccess));
  app.use('/api', createLegacyRouter(logger, accountManager, broadcast, upload));
  app.use('/api', createAdminRouter(logger, loginStore, knex, systemAuth.requireAuth, systemAuth.requireSystemRole, systemAuth.requireAccountAccess, systemAuth.requireAccountMaster, accountManager));

  server.listen(port, '0.0.0.0', async () => {
    console.log(`zalohub-backend running at http://localhost:${port}`);

    const { rows: existingRows } = await knex.raw('SELECT id, role FROM system_users WHERE email = ?', ['admin@zalohub.local']);
    const existing = existingRows[0] as { id: string; role: string } | undefined;
    if (!existing) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync('admin123', salt, 64).toString('hex');
      const id = crypto.randomUUID();
      await knex.raw('INSERT INTO system_users (id, email, password_hash, display_name, type, role) VALUES (?, ?, ?, ?, ?, ?)', [id, 'admin@zalohub.local', `${salt}:${hash}`, 'Super Admin', 'human', 'super_admin']);
      console.log('Seeded super_admin: admin@zalohub.local / admin123');
    } else if (existing.role !== 'super_admin') {
      await knex.raw('UPDATE system_users SET role = ? WHERE id = ?', ['super_admin', existing.id]);
      console.log('Upgraded admin to super_admin');
    }

    setTimeout(() => {
      accountManager.warmStartAllAccounts().catch((err) => {
        console.error('warmStart failed:', err);
      });
    }, 2000);
  });
}

main().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
