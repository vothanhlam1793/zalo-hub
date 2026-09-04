import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { PORT } from './config.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { createWsGateway } from './proxy/ws-gateway.js';
import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspace.js';
import chatRoutes from './routes/chat.js';
import composerRoutes from './routes/composer.js';
import adminRoutes from './routes/admin.js';
import legacyRoutes from './routes/legacy.js';

const app = express();

app.set('trust proxy', true);

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser());
app.use(requestId);

app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/bff/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.use('/bff/auth', authRoutes);
app.use('/bff/workspace', workspaceRoutes);
app.use('/bff/chat', chatRoutes);
app.use('/bff/chat', composerRoutes);
app.use('/bff/admin', adminRoutes);
app.use('/bff', legacyRoutes);

app.use(notFound);
app.use(errorHandler);

const server = createServer(app);
createWsGateway(server);

server.listen(PORT, () => {
  console.log(`[zalohub-bff] listening on :${PORT} (HTTP + WS)`);
  console.log(`[zalohub-bff] backend → ${process.env.BACKEND_URL || 'http://localhost:3399'}`);
});
