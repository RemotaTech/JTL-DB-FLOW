/**
 * Self-hosted entry point — single container, single port.
 *
 * Serves:
 *   - Vite-built frontend (dist/)
 *   - MSSQL bridge routes  (/api/query, /api/schema, /api/versions, /api/health)
 *   - Community hub routes (/api/hub/*)  — direct Prisma → Postgres, no HTTP proxy
 *
 * Self-hosters usually talk to a SQL Server on their LAN, so private hosts
 * are allowed here by default (override with BRIDGE_ALLOW_PRIVATE_HOSTS=false).
 */
import dotenv from 'dotenv';
dotenv.config();
process.env.BRIDGE_ALLOW_PRIVATE_HOSTS ??= 'true';

const { bridgeRouter, closeAllPools } = await import('./bridge/app.js');
const { app: hubApp, prisma, registerFinalHandlers } = await import('./hub/app.js');
const { seedFeatured } = await import('./hub/seed.js');
const { installProcessGuards } = await import('./bridge/errors.js');
installProcessGuards();

const PORT = parseInt(process.env.PORT || '3001', 10);

try {
  const n = await seedFeatured(prisma);
  console.log(`🌱  Seeded ${n} featured templates`);
} catch (err) {
  console.error('Seeding failed (hub will still serve):', err.message);
}

// hub/app.js already creates its own Express app with middleware + hub routes.
// Mount bridge on the same app so everything runs on one port, then the
// static frontend + JSON 404/error tail.
hubApp.use(bridgeRouter);
registerFinalHandlers(hubApp);

const server = hubApp.listen(PORT, '0.0.0.0', () => {
  console.log(`✅  JTL Workflow Creator running on http://0.0.0.0:${PORT}`);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('Shutting down…');
  setTimeout(() => process.exit(1), 10_000).unref();
  await closeAllPools();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
