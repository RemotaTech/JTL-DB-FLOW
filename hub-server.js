/**
 * JTL Workflow Hub — entry point
 *
 * Dev   → serves community hub API on port 3002 only.
 *         MSSQL bridge runs separately on port 3001 (npm run server:dev).
 *
 * Prod  → also mounts the MSSQL bridge routes on the SAME Express app so that
 *         only ONE container / ONE port is needed on Coolify.
 *         The Vite-built frontend is served as static files.
 */
import dotenv from 'dotenv';
import { app as hubApp, prisma, registerFinalHandlers } from './hub/app.js';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';
let closeBridgePools = async () => {};

// ── In production, mount bridge routes BEFORE the final handlers ──────────
if (isProd) {
  const { bridgeRouter, closeAllPools } = await import('./bridge/app.js');
  hubApp.use(bridgeRouter);
  closeBridgePools = closeAllPools;
  console.log('🔗  MSSQL bridge routes mounted on hub server');
}

// ── Register static files + 404 / error handlers (must be last) ──────────
registerFinalHandlers(hubApp);

// ── Start ─────────────────────────────────────────────────────────────────
const PORT   = parseInt(process.env.HUB_PORT || '3002', 10);
const server = hubApp.listen(PORT, () => {
  const label = isProd ? 'Hub + Bridge (production)' : 'Hub';
  console.log(`✅  ${label} server running on http://localhost:${PORT}`);
});

async function shutdown() {
  console.log('Shutting down…');
  await closeBridgePools();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
