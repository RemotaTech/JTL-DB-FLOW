/**
 * JTL Workflow Creator — MSSQL Bridge (standalone dev entry point)
 * Run with: node server.js  OR  node --watch server.js
 *
 * In production (Coolify) the bridge routes are mounted directly on the
 * hub-server instead — see hub-server.js. Self-hosting uses selfhost-server.js.
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { bridgeRouter, closeAllPools } from './bridge/app.js';
import { notFound, errorHandler, installProcessGuards } from './bridge/errors.js';

dotenv.config();
installProcessGuards();

const app = express();

// ── Security & performance ─────────────────────────────────────────────────
// API-only server: no HTML is served, so a CSP is irrelevant here.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000', 'http://127.0.0.1:5173']),
  credentials: false,
}));
app.use(express.json({ limit: '256kb' }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      300,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Zu viele Anfragen — bitte kurz warten.' },
}));

// ── Bridge routes ──────────────────────────────────────────────────────────
app.use(bridgeRouter);

// ── Error handlers ─────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start (skipped under test — supertest binds its own port) ──────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
if (process.env.NODE_ENV !== 'test') {
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
}

// Exported for tests
export { buildMssqlConfig } from './bridge/app.js';
export { app };
