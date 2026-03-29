import './loadEnv.js';
import http from 'http';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.js';
import crudRoutes from './routes/crud.js';
import platformConfigRoutes from './routes/platformConfig.js';
import functionsRoutes from './routes/functions.js';
import integrationsRoutes from './routes/integrations.js';
import publicStatusRoutes from './routes/publicStatus.js';
import tournamentCatalogRoutes from './routes/tournamentCatalogRoutes.js';
import tournamentJoinRoutes from './routes/tournamentJoinRoutes.js';
import systemRoutes from './routes/systemRoutes.js';
import engineRoutes from './routes/engineRoutes.js';
import paymentsRoutes, { stripeWebhookHandler } from './routes/paymentsRoutes.js';
import paystackRoutes, { paystackWebhookHandler } from './routes/paystackRoutes.js';
import flutterwaveRoutes, { flutterwaveWebhookHandler } from './routes/flutterwaveRoutes.js';
import { tenantMembershipMiddleware } from './middleware/tenantMembership.js';
import { apiWriteLimiter } from './middleware/apiWriteLimiter.js';
import { runOptionalApiSeeds } from './seed.js';
import { clientSafeErrorMessage } from './clientSafeError.js';
import { pool } from './db.js';
import { platformGateMiddleware } from './middleware/platformGate.js';
import { setRealtimeIo } from './realtime.js';
import oauthStubRoutes from './routes/oauthStub.js';
import tenantRegistrationRoutes from './routes/tenantRegistrationRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import matchEngineRoutes from './routes/matchEngineRoutes.js';
import { startPrizePayoutBullWorker } from './jobs/prizePayoutBullmq.js';

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT) || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const CORS_ORIGINS = [FRONTEND_URL, /^http:\/\/127\.0\.0\.1:\d+$/, /^http:\/\/localhost:\d+$/];

app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
  })
);

app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }), stripeWebhookHandler);
app.post('/api/paystack/webhook', express.raw({ type: 'application/json', limit: '2mb' }), paystackWebhookHandler);
app.post('/api/flutterwave/webhook', express.raw({ type: 'application/json', limit: '2mb' }), flutterwaveWebhookHandler);

app.use(express.json({ limit: '2mb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
});

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.PUBLIC_RATE_LIMIT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/health', (_req, res) => res.json({ ok: true, service: 'arena-saas-api' }));

/** Proxied at /api/health in dev; includes DB round-trip for Super Admin pulse. */
app.get('/api/health', async (_req, res) => {
  const t0 = Date.now();
  try {
    await pool.query('SELECT 1');
    const dbLatencyMs = Date.now() - t0;
    res.json({ ok: true, service: 'arena-saas-api', database: { ok: true, latency_ms: dbLatencyMs } });
  } catch (e) {
    console.error('[api/health]', e);
    res.status(503).json({ ok: false, service: 'arena-saas-api', database: { ok: false } });
  }
});

app.use('/api/public', publicLimiter, publicStatusRoutes);
app.use('/api/public', publicLimiter, tournamentCatalogRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/tenant-registration', apiWriteLimiter, platformGateMiddleware, tenantRegistrationRoutes);
app.use('/api', apiWriteLimiter);
app.use('/api', platformGateMiddleware, tournamentJoinRoutes);
app.use('/api/oauth', oauthStubRoutes);
app.use('/api/v1/platform-config', platformConfigRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/engine', platformGateMiddleware, tenantMembershipMiddleware, engineRoutes);
app.use('/api/payments', platformGateMiddleware, tenantMembershipMiddleware, paymentsRoutes);
app.use('/api/notifications', platformGateMiddleware, notificationRoutes);
app.use('/api/match-engine', platformGateMiddleware, tenantMembershipMiddleware, matchEngineRoutes);
app.use('/api/v1', platformGateMiddleware, tenantMembershipMiddleware, crudRoutes);
app.use('/api/paystack', platformGateMiddleware, paystackRoutes);
app.use('/api/flutterwave', platformGateMiddleware, flutterwaveRoutes);
app.use('/api/functions', platformGateMiddleware, functionsRoutes);
app.use('/api/integrations', platformGateMiddleware, integrationsRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: clientSafeErrorMessage(err) });
});

async function start() {
  const seedResult = await runOptionalApiSeeds();
  if (!seedResult.skipped && seedResult.summary?.length) {
    console.info('[seed]', seedResult.summary.join(' · '));
  }
  const server = http.createServer(app);
  const io = new Server(server, {
    path: '/socket.io/',
    cors: { origin: CORS_ORIGINS, credentials: true },
  });
  io.on('connection', (socket) => {
    socket.on('join-tournament', (tid) => {
      if (typeof tid === 'string' && tid) socket.join(`tournament:${tid}`);
    });
    socket.on('leave-tournament', (tid) => {
      if (typeof tid === 'string' && tid) socket.leave(`tournament:${tid}`);
    });
  });
  setRealtimeIo(io);
  startPrizePayoutBullWorker();
  server.listen(PORT, () => {
    console.log(`Arena API http://localhost:${PORT} (HTTP + Socket.io)`);
  });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
