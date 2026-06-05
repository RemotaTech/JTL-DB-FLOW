/**
 * Self-hosted entry point — single container, single port.
 *
 * Serves:
 *   - Vite-built frontend (dist/)
 *   - MSSQL bridge routes  (/api/query, /api/schema, /api/versions, /api/health)
 *   - Community hub routes (/api/hub/*)  — direct Prisma → Postgres, no HTTP proxy
 *
 * DATABASE_URL is baked into the image at build time (see Dockerfile.selfhost).
 * Users do not need to configure anything for the hub — it just works.
 */

import express from 'express';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

import { bridgeRouter, closeAllPools } from './bridge/app.js';
import { app as hubApp, prisma } from './hub/app.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const PORT = parseInt(process.env.PORT || '3001', 10);

// hub/app.js already creates its own Express app with middleware + hub routes.
// Mount bridge on the same app so everything runs on one port.
hubApp.use(bridgeRouter);

// ── Static frontend (Vite build) ───────────────────────────────────────────
const DIST = join(__dirname, 'dist');
if (existsSync(DIST)) {
  hubApp.use(express.static(DIST));
  hubApp.get('*path', (_req, res) => {
    res.sendFile(join(DIST, 'index.html'));
  });
} else {
  console.warn('⚠️  dist/ not found — frontend not built.');
}

// ── Start ──────────────────────────────────────────────────────────────────
const server = createServer(hubApp);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅  JTL Workflow Creator running on http://0.0.0.0:${PORT}`);
});

async function shutdown() {
  console.log('Shutting down…');
  await closeAllPools();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
