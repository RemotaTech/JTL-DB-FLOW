/**
 * JTL Workflow Hub — entry point
 *
 * Dev   → serves community hub API on port 3002 only.
 *         MSSQL bridge runs separately on port 3001 (npm run server:dev).
 *
 * Prod  → also mounts the MSSQL bridge routes on the SAME Express app so that
 *         only ONE container / ONE port is needed on Coolify.
 *         The Vite-built frontend is served as static files.
 *
 *         A *public* hub must not become a proxy into its own network, so the
 *         bridge refuses private/loopback targets unless
 *         BRIDGE_ALLOW_PRIVATE_HOSTS=true is set explicitly.
 */
import dotenv from 'dotenv';
dotenv.config();

const isProd = process.env.NODE_ENV === 'production';
if (isProd && process.env.BRIDGE_ALLOW_PRIVATE_HOSTS === undefined) {
  process.env.BRIDGE_ALLOW_PRIVATE_HOSTS = 'false';
}

const { app: hubApp, prisma, registerFinalHandlers } = await import('./hub/app.js');
const { seedFeatured } = await import('./hub/seed.js');
const { installProcessGuards } = await import('./bridge/errors.js');
installProcessGuards();

// Seed / refresh the curated featured templates on startup (idempotent).
try {
  const n = await seedFeatured(prisma);
  console.log(`🌱  Seeded ${n} featured templates`);
} catch (err) {
  console.error('Seeding failed:', err.message);
}

let closeBridgePools = async () => {};

// ── In production, mount bridge routes BEFORE the final handlers ──────────
if (isProd) {
  const { bridgeRouter, closeAllPools, allowPrivateHosts } = await import('./bridge/app.js');
  hubApp.use(bridgeRouter);
  closeBridgePools = closeAllPools;
  console.log(`🔗  MSSQL bridge routes mounted on hub server (private hosts ${allowPrivateHosts() ? 'ALLOWED' : 'blocked'})`);
}

// ── Register static files + 404 / error handlers (must be last) ──────────
registerFinalHandlers(hubApp);

// ── Start ─────────────────────────────────────────────────────────────────
const PORT   = parseInt(process.env.HUB_PORT || '3002', 10);
const server = hubApp.listen(PORT, () => {
  const label = isProd ? 'Hub + Bridge (production)' : 'Hub';
  console.log(`✅  ${label} server running on http://localhost:${PORT}`);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('Shutting down…');
  // Force-exit if a pool refuses to close within 10s.
  setTimeout(() => process.exit(1), 10_000).unref();
  await closeBridgePools();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
