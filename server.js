/**
 * JTL Workflow Creator — MSSQL Bridge (standalone dev entry point)
 * Run with: node server.js  OR  node --watch server.js
 *
 * In production (Coolify) the bridge routes are mounted directly on the
 * hub-server instead — see hub-server.js.
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { bridgeRouter, closeAllPools } from './bridge/app.js';

dotenv.config();

const app = express();

// ── Security & performance ─────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:3000',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      300,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests, please try again later.' },
}));

// ── Bridge routes ──────────────────────────────────────────────────────────
app.use(bridgeRouter);

// ── Error handlers ─────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT   = parseInt(process.env.PORT || '3001', 10);
const server = app.listen(PORT, () => {
  console.log(`✅  MSSQL bridge server running on http://localhost:${PORT}`);
});

async function shutdown() {
  console.log('Shutting down MSSQL bridge server…');
  await closeAllPools();
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

// Exported for tests
export { buildMssqlConfig } from './bridge/app.js';
export { app };
