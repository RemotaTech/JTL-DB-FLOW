/**
 * JTL Workflow Creator — MSSQL Bridge
 * Express router (routes only, no listen).
 * Imported by server.js (standalone dev), selfhost-server.js and hub-server.js.
 *
 * Threat model
 * ────────────
 * The bridge receives *user-supplied* MSSQL credentials with every request
 * and runs *user-supplied* SQL against that server. It never stores anything.
 * Guards, in order:
 *   1. connectionConfig is shape/length checked (no giant strings, no objects)
 *   2. optional private-network block (BRIDGE_ALLOW_PRIVATE_HOSTS) so a
 *      publicly hosted bridge cannot be used to poke at its own LAN
 *   3. SQL must be ONE read-only SELECT — no `;`, no DML/DDL/exec keywords
 *   4. connect + request timeouts, row cap, per-IP rate limit
 *   5. pools cached by a SHA-256 of the descriptor — the password never
 *      appears in a Map key or a log line
 */
import express from 'express';
import sql from 'mssql';
import rateLimit from 'express-rate-limit';
import { createHash } from 'crypto';
import { isIP } from 'net';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, delimiter, resolve } from 'path';
import { COLUMNS_QUERY, VERSION_RE, buildSchema } from './schemaExport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
// Versions + schema files live one level up (project root)
const ROOT = join(__dirname, '..');

/**
 * Directories that hold JTL schema files (`<version>.json`), searched in order.
 * Default: `<root>/versions`. `BRIDGE_VERSIONS_DIRS` (path.delimiter-separated)
 * prepends extra folders — the desktop app points it at a user-writable folder
 * so newer schema JSONs can be dropped in without rebuilding. The first folder
 * that holds a given version wins. Read at request time so tests can flip it.
 */
export function versionsDirs() {
  const extra = String(process.env.BRIDGE_VERSIONS_DIRS || '')
    .split(delimiter).map(s => s.trim()).filter(Boolean);
  const write = schemaWriteDir();
  return [...new Set([...(write ? [write] : []), ...extra, join(ROOT, 'versions')])];
}

/**
 * Folder where `POST /api/schema/export` may store exported schemas, or null
 * (default) when saving on the server is disabled. Only trusted single-user
 * setups set it (desktop app, self-hosted); a public hub never does.
 */
export function schemaWriteDir() {
  const d = String(process.env.BRIDGE_SCHEMA_WRITE_DIR || '').trim();
  return d ? resolve(d) : null;
}

/** Sorted, de-duplicated list of available schema versions across all dirs. */
export function listVersions() {
  const names = new Set();
  for (const dir of versionsDirs()) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith('.json')) names.add(f.slice(0, -5));
  }
  return [...names].sort(compareVersions);
}

/** Natural sort for dotted versions ("1.11.10.0" after "1.11.9.0"); falls back to string order. */
export function compareVersions(a, b) {
  const pa = a.split('.'), pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = parseInt(pa[i] ?? '0', 10), y = parseInt(pb[i] ?? '0', 10);
    if (Number.isNaN(x) || Number.isNaN(y)) return a.localeCompare(b);
    if (x !== y) return x - y;
  }
  return 0;
}

/** Absolute path of a version file, or null when no dir has it. */
export function resolveVersionFile(version) {
  for (const dir of versionsDirs()) {
    const p = join(dir, `${version}.json`);
    if (existsSync(p)) return p;
  }
  return null;
}

// ── Tunables (env) ───────────────────────────────────────────────────────────
const envInt = (k, d) => { const n = parseInt(process.env[k] ?? '', 10); return Number.isFinite(n) && n > 0 ? n : d; };
const CONNECT_TIMEOUT_MS = envInt('BRIDGE_CONNECT_TIMEOUT_MS', 15_000);
const REQUEST_TIMEOUT_MS = envInt('BRIDGE_REQUEST_TIMEOUT_MS', 60_000);
const MAX_ROWS           = envInt('BRIDGE_MAX_ROWS', 5_000);
const MAX_SQL_LEN        = envInt('BRIDGE_MAX_SQL_LEN', 20_000);

/**
 * Whether the bridge may connect to loopback / private / link-local hosts.
 * Default: allowed (local dev + self-hosting talk to LAN SQL Servers).
 * A publicly hosted hub sets BRIDGE_ALLOW_PRIVATE_HOSTS=false.
 * Read at request time so tests and entry points can flip it.
 */
export function allowPrivateHosts() {
  const v = String(process.env.BRIDGE_ALLOW_PRIVATE_HOSTS ?? 'true').toLowerCase();
  return !(v === 'false' || v === '0' || v === 'no');
}

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
    connectionTimeout: CONNECT_TIMEOUT_MS,
    requestTimeout:    REQUEST_TIMEOUT_MS,
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

/** Cache key: SHA-256 over the descriptor so the password is never a Map key or log token. */
function connKey(conn) {
  const raw = JSON.stringify([conn.host, conn.port || '', conn.instance || '', conn.user, conn.password, conn.database || '']);
  return createHash('sha256').update(raw).digest('hex');
}

/** Safe-to-log label for a connection (no secrets). */
const connLabel = (conn) => `${conn.user}@${conn.host}${conn.port ? ':' + conn.port : ''}${conn.instance ? '\\' + conn.instance : ''}/${conn.database || 'eazybusiness'}`;

async function getPool(conn) {
  const key = connKey(conn);
  if (poolCache.has(key)) {
    const cached = poolCache.get(key);
    if (cached.connected) return cached;
    poolCache.delete(key);
  }
  const pool = new sql.ConnectionPool(buildMssqlConfig(conn));
  const label = connLabel(conn);
  pool.on('error', (err) => {
    console.warn(`Pool error for ${label}: ${err?.message || err} — dropping from cache.`);
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

// ── Connection descriptor validation ────────────────────────────────────────

const HOST_RE     = /^[A-Za-z0-9.\-_:\[\]]{1,253}$/;   // hostname, IPv4, or [IPv6]
const INSTANCE_RE = /^[A-Za-z0-9_$#]{0,64}$/;
const DB_RE       = /^[\p{L}\p{N}_\-$#. ]{0,128}$/u;

/** Loopback / private / link-local literal addresses (no DNS resolution). */
export function isPrivateHost(host) {
  const h = String(host).trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const kind = isIP(h);
  if (kind === 4) {
    const [a, b] = h.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (kind === 6) {
    if (h === '::' || h === '::1') return true;
    if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) return true; // fe80::/10
    if (h.startsWith('fc') || h.startsWith('fd')) return true;  // fc00::/7
    if (h.startsWith('::ffff:')) return isPrivateHost(h.slice(7)); // v4-mapped
    return false;
  }
  return false;
}

/**
 * Validate + normalise a connection descriptor from the request body.
 * Returns `{ conn }` or `{ error }` (German, user-facing).
 */
export function parseConnection(cc) {
  if (!cc || typeof cc !== 'object' || Array.isArray(cc)) return { error: 'Keine Datenbankverbindung konfiguriert. Bitte Zugangsdaten unter „Verbindung“ eintragen.' };
  const s = (v) => (typeof v === 'string' ? v.trim() : (typeof v === 'number' ? String(v) : ''));
  const host = s(cc.host), user = s(cc.user), password = typeof cc.password === 'string' ? cc.password : '';
  const port = s(cc.port), instance = s(cc.instance), database = s(cc.database);

  if (!host || !user) return { error: 'Keine Datenbankverbindung konfiguriert. Bitte Zugangsdaten unter „Verbindung“ eintragen.' };
  if (!HOST_RE.test(host)) return { error: 'Ungültiger Host.' };
  if (port && !/^\d{1,5}$/.test(port)) return { error: 'Ungültiger Port.' };
  if (port && parseInt(port, 10) > 65535) return { error: 'Ungültiger Port.' };
  if (!INSTANCE_RE.test(instance)) return { error: 'Ungültiger Instanzname.' };
  if (!DB_RE.test(database)) return { error: 'Ungültiger Datenbankname.' };
  if (user.length > 128 || password.length > 256) return { error: 'Benutzername oder Passwort zu lang.' };
  if (!allowPrivateHosts() && isPrivateHost(host)) {
    return { error: 'Dieser Bridge-Server darf keine privaten/lokalen Adressen ansprechen. Bitte die Bridge lokal starten (npm run server).' };
  }
  return { conn: { host, port: port || '1433', instance, user, password, database: database || 'eazybusiness' } };
}

// ── Query safety ─────────────────────────────────────────────────────────────

// Anything that is not a plain read. T-SQL does not require `;` between
// statements, so keywords are blocked anywhere in the text — not just at the
// start. `INTO` blocks `SELECT … INTO newtable`; `WAITFOR` blocks time-based
// probing / DoS; `sp_`/`xp_` cover stored procedures reachable without EXEC.
const DANGEROUS_KEYWORDS =
  /\b(EXEC|EXECUTE|INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|MERGE|GRANT|REVOKE|DENY|CREATE|INTO|WAITFOR|SHUTDOWN|BACKUP|RESTORE|RECONFIGURE|DBCC|BULK|KILL|WRITETEXT|UPDATETEXT|OPENROWSET|OPENQUERY|OPENDATASOURCE|xp_\w+|sp_\w+)\b/i;

/** Strip line (`--`) and block comments so they can neither hide nor fake tokens. */
function stripComments(q) {
  return q.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

export function isSafeSelectQuery(query) {
  if (typeof query !== 'string' || query.length > MAX_SQL_LEN) return false;
  const trimmed = stripComments(query).trim().replace(/;+\s*$/, '');
  if (!/^(SELECT|WITH)\b/i.test(trimmed)) return false;
  if (trimmed.includes(';')) return false;
  if (DANGEROUS_KEYWORDS.test(trimmed)) return false;
  return true;
}

/** Map mssql/tedious error codes to a German, user-facing message + HTTP status. */
export function describeDbError(err) {
  const code = err?.code || err?.originalError?.code || '';
  const msg  = String(err?.message || 'Unbekannter Fehler').split('\n')[0].slice(0, 300);
  switch (code) {
    case 'ELOGIN':   return { status: 401, error: 'Anmeldung fehlgeschlagen — Benutzername oder Passwort falsch, oder der Benutzer hat keinen Zugriff auf die Datenbank.', detail: msg, code };
    case 'ETIMEOUT': return { status: 504, error: 'Zeitüberschreitung — der SQL Server antwortet nicht (Firewall? Port? Instanzname?).', detail: msg, code };
    case 'ESOCKET':
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
    case 'EHOSTUNREACH': return { status: 502, error: 'SQL Server nicht erreichbar — Host/Port prüfen und ob TCP/IP am Server aktiviert ist.', detail: msg, code };
    case 'EINSTLOOKUP': return { status: 502, error: 'Instanz nicht gefunden — SQL Server Browser läuft nicht oder UDP 1434 ist blockiert. Tipp: Port direkt eintragen.', detail: msg, code };
    case 'EREQUEST':  return { status: 400, error: `SQL-Fehler: ${msg}`, detail: msg, code };
    default:          return { status: 500, error: `Abfrage fehlgeschlagen: ${msg}`, detail: msg, code: code || undefined };
  }
}

const queryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Abfragen — bitte kurz warten.' },
});

const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: envInt('BRIDGE_EXPORT_RATE_LIMIT', 6),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Exporte — bitte kurz warten.' },
});

// ── Router ───────────────────────────────────────────────────────────────────
const router = express.Router();

router.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), privateHosts: allowPrivateHosts(), schemaSave: !!schemaWriteDir() });
});

router.get('/api/versions', (_req, res) => {
  try {
    res.json(listVersions());
  } catch (err) {
    console.error('Error reading versions:', err.message);
    res.status(500).json({ error: 'Versionsliste konnte nicht gelesen werden' });
  }
});

router.get('/api/schema/:version', (req, res) => {
  try {
    const { version } = req.params;
    if (!/^[\w.]{1,32}$/.test(version) || version.includes('..'))
      return res.status(400).json({ error: 'Ungültiges Versionsformat' });
    const versionPath = resolveVersionFile(version);
    if (!versionPath)
      return res.status(404).json({ error: 'Version nicht gefunden' });
    res.json(JSON.parse(readFileSync(versionPath, 'utf8')));
  } catch (err) {
    console.error('Error reading version schema:', err.message);
    res.status(500).json({ error: 'Schema konnte nicht gelesen werden' });
  }
});

router.get('/api/schema', (_req, res) => {
  try {
    res.json(JSON.parse(readFileSync(join(ROOT, 'schema.json'), 'utf8')));
  } catch (err) {
    console.error('Error reading schema:', err.message);
    res.status(500).json({ error: 'Schema konnte nicht gelesen werden' });
  }
});

/**
 * POST /api/query
 * Body: { sql: string, connectionConfig: { host, port, instance, user, password, database } }
 * Response: array of rows (capped at BRIDGE_MAX_ROWS). Header `X-Rows-Truncated: 1` when capped.
 */
router.post('/api/query', queryLimiter, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const query = body.sql;

  if (!query || typeof query !== 'string')
    return res.status(400).json({ error: 'Keine SQL-Abfrage übergeben' });

  if (!isSafeSelectQuery(query))
    return res.status(403).json({ error: 'Nur eine einzelne, lesende SELECT-Abfrage ist erlaubt' });

  const parsed = parseConnection(body.connectionConfig);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const conn = parsed.conn;

  try {
    const pool   = await getPool(conn);
    const result = await pool.request().query(query);
    const rows   = Array.isArray(result.recordset) ? result.recordset : [];
    if (rows.length > MAX_ROWS) res.set('X-Rows-Truncated', '1');
    res.json(rows.slice(0, MAX_ROWS));
  } catch (err) {
    const d = describeDbError(err);
    console.error(`Query error (${connLabel(conn)}) [${d.code || '-'}]: ${d.detail}`);
    res.status(d.status).json({ error: d.error, code: d.code });
  }
});

/**
 * POST /api/schema/export
 * Body: { connectionConfig, version, overwrite?: boolean }
 * Reads table/column structure of the connected database (fixed catalog query,
 * no user SQL) and stores it as `<version>.json` when BRIDGE_SCHEMA_WRITE_DIR is
 * set → `{ saved: true, version, tables, columns }`. Otherwise it returns the
 * schema itself → `{ saved: false, version, schema }` so the client can offer a download.
 * 409 `EXISTS` when that version is already known and `overwrite` is not set.
 */
router.post('/api/schema/export', exportLimiter, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const version = typeof body.version === 'string' ? body.version.trim().replace(/^v/i, '') : '';
  if (!VERSION_RE.test(version))
    return res.status(400).json({ error: 'Ungültige Versionsnummer (Beispiel: 2.1.0.0).' });

  const parsed = parseConnection(body.connectionConfig);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const conn = parsed.conn;

  const dir = schemaWriteDir();
  if (dir && !body.overwrite && resolveVersionFile(version))
    return res.status(409).json({ error: `Version ${version} existiert bereits.`, code: 'EXISTS' });

  try {
    const pool = await getPool(conn);
    const rows = (await pool.request().query(COLUMNS_QUERY)).recordset ?? [];
    const schema = { version, ...buildSchema(rows) };
    if (!schema.tables.length)
      return res.status(422).json({ error: 'Keine Tabellen gefunden — falsche Datenbank oder fehlende Berechtigung (VIEW DEFINITION)?', code: 'EMPTY' });

    if (!dir) return res.json({ saved: false, version, schema });

    mkdirSync(dir, { recursive: true });
    const target = join(dir, `${version}.json`);
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, JSON.stringify(schema, null, 2), 'utf8');
    renameSync(tmp, target);
    res.json({ saved: true, version, tables: schema.tables.length, columns: rows.length });
  } catch (err) {
    const d = describeDbError(err);
    console.error(`Schema export error (${connLabel(conn)}) [${d.code || '-'}]: ${d.detail}`);
    res.status(d.status).json({ error: d.error, code: d.code });
  }
});

export { router as bridgeRouter };
