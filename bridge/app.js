/**
 * JTL Workflow Creator — MSSQL Bridge
 * Express app (routes only, no listen).
 * Imported by server.js (standalone dev) and hub-server.js (production).
 */
import express from 'express';
import sql from 'mssql';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
// Versions + schema files live one level up (project root)
const ROOT = join(__dirname, '..');

// ── MSSQL connection pool cache ─────────────────────────────────────────────
const poolCache = new Map();

/**
 * Build an mssql config object from a flat connection descriptor.
 *
 * Connection strategy
 * ───────────────────
 * • Port provided  → Direct TCP (no SQL Server Browser needed).
 * • No port + instance → Browser-Service UDP 1434 resolution.
 */
export function buildMssqlConfig(conn) {
  const rawPort    = String(conn.port ?? '').trim();
  const parsedPort = parseInt(rawPort, 10);
  const hasPort    = rawPort !== '' && Number.isFinite(parsedPort) && parsedPort > 0;

  const cfg = {
    user:     conn.user,
    password: conn.password,
    server:   conn.host,
    database: conn.database || 'eazybusiness',
    options: {
      encrypt:                false,
      trustServerCertificate: true,
      enableArithAbort:       true,
    },
    pool: {
      max:               5,
      min:               0,
      idleTimeoutMillis: 30_000,
    },
  };

  if (conn.instance && !hasPort) {
    cfg.options.instanceName = conn.instance;
  } else {
    cfg.port = hasPort ? parsedPort : 1433;
  }
  return cfg;
}

function connKey(conn) {
  return `${conn.host}|${conn.port || ''}|${conn.instance || ''}|${conn.user}|${conn.database || ''}`;
}

async function getPool(conn) {
  const key = connKey(conn);
  if (poolCache.has(key)) {
    const cached = poolCache.get(key);
    if (cached.connected) return cached;
    poolCache.delete(key);
  }
  const pool = new sql.ConnectionPool(buildMssqlConfig(conn));
  pool.on('error', () => {
    console.warn(`Pool error for key "${key}", removing from cache.`);
    poolCache.delete(key);
  });
  await pool.connect();
  poolCache.set(key, pool);
  return pool;
}

/** Close all cached pools (called on graceful shutdown). */
export async function closeAllPools() {
  for (const pool of poolCache.values()) {
    try { await pool.close(); } catch { /* ignore */ }
  }
  poolCache.clear();
}

// ── Router ───────────────────────────────────────────────────────────────────
const router = express.Router();

router.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/api/versions', (_req, res) => {
  try {
    const versionsDir = join(ROOT, 'versions');
    if (!existsSync(versionsDir)) return res.json([]);
    const versions = readdirSync(versionsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort();
    res.json(versions);
  } catch (err) {
    console.error('Error reading versions:', err.message);
    res.status(500).json({ error: 'Failed to read versions directory' });
  }
});

router.get('/api/schema/:version', (req, res) => {
  try {
    const { version } = req.params;
    if (!/^[\w.]+$/.test(version))
      return res.status(400).json({ error: 'Invalid version format' });
    const versionPath = join(ROOT, 'versions', `${version}.json`);
    if (!existsSync(versionPath))
      return res.status(404).json({ error: 'Version not found' });
    res.json(JSON.parse(readFileSync(versionPath, 'utf8')));
  } catch (err) {
    console.error('Error reading version schema:', err.message);
    res.status(500).json({ error: 'Failed to read version schema' });
  }
});

router.get('/api/schema', (_req, res) => {
  try {
    res.json(JSON.parse(readFileSync(join(ROOT, 'schema.json'), 'utf8')));
  } catch (err) {
    console.error('Error reading schema:', err.message);
    res.status(500).json({ error: 'Failed to read schema' });
  }
});

/**
 * POST /api/query
 * Body: { sql: string, connectionConfig: { host, port, instance, user, password } }
 */
router.post('/api/query', async (req, res) => {
  const { sql: query, connectionConfig } = req.body;

  if (!query || typeof query !== 'string')
    return res.status(400).json({ error: 'No SQL query provided' });

  if (!query.trim().toUpperCase().startsWith('SELECT'))
    return res.status(403).json({ error: 'Only SELECT queries are allowed' });

  if (!connectionConfig?.host || !connectionConfig?.user)
    return res.status(400).json({
      error: 'No database connection configured. Please enter your MSSQL credentials in Settings.',
    });

  const conn = {
    host:     connectionConfig.host,
    port:     connectionConfig.port || '1433',
    instance: connectionConfig.instance || '',
    user:     connectionConfig.user,
    password: connectionConfig.password,
    database: connectionConfig.database || 'eazybusiness',
  };

  try {
    const pool   = await getPool(conn);
    const result = await pool.request().query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('Query execution error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export { router as bridgeRouter };
