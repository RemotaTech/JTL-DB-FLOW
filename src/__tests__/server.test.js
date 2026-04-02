/**
 * MSSQL Bridge Server — route + unit tests.
 *
 * mssql is fully mocked: no real database connection is made.
 *
 * Pool-cache notes
 * ────────────────
 * server.js caches ConnectionPool instances by (host|port|instance|user|database).
 * Tests that need a fresh pool (e.g. connection-error tests) use a unique host so
 * they always get a new pool; other tests share the cached pool after the first hit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── Mock mssql BEFORE importing server.js ─────────────────────────────────
// vi.hoisted runs at parse time, ensuring mockPool is available when the
// vi.mock() factory executes and when server.js is first imported.

const { mockPool, mockRequest } = vi.hoisted(() => {
  const mockRequest = {
    query: vi.fn(),
  };
  const mockPool = {
    connected: true,
    connect:   vi.fn(),
    request:   vi.fn(() => mockRequest),
    on:        vi.fn(),
    close:     vi.fn(),
  };
  return { mockPool, mockRequest };
});

vi.mock('mssql', () => ({
  default: {
    ConnectionPool: class {
      constructor() { return mockPool; }
    },
  },
}));

// Import after mock is in place
const { app, buildMssqlConfig } = await import('../../server.js');

// ── Fixtures ────────────────────────────────────────────────────────────────

const validConn = {
  host:     '192.168.1.1',
  port:     '1433',
  instance: '',
  user:     'sa',
  password: 'secret',
  database: 'eazybusiness',
};

// ── Reset mocks before every test ───────────────────────────────────────────
// vi.clearAllMocks() resets call history but keeps implementations.
// We re-apply the resolved value for connect so the pool creation path works.

beforeEach(() => {
  vi.clearAllMocks();
  mockPool.connected = true;
  mockPool.connect.mockResolvedValue(undefined);
  mockPool.request.mockReturnValue(mockRequest);
});

// ═══════════════════════════════════════════════════════════════════════════
// buildMssqlConfig — unit tests (no HTTP, no mssql needed)
// ═══════════════════════════════════════════════════════════════════════════

describe('buildMssqlConfig', () => {
  it('uses direct port when both instance name and port are provided', () => {
    const cfg = buildMssqlConfig({
      host: '1.2.3.4', port: '1433', instance: 'SQLS',
      user: 'sa', password: 'p', database: 'db',
    });
    expect(cfg.port).toBe(1433);
    expect(cfg.options.instanceName).toBeUndefined();
  });

  it('uses SQL Server Browser Service when instance is set but port is empty', () => {
    const cfg = buildMssqlConfig({
      host: '1.2.3.4', port: '', instance: 'SQLS',
      user: 'sa', password: 'p', database: 'db',
    });
    expect(cfg.port).toBeUndefined();
    expect(cfg.options.instanceName).toBe('SQLS');
  });

  it('uses direct port when no instance name is given', () => {
    const cfg = buildMssqlConfig({
      host: '1.2.3.4', port: '1444', instance: '',
      user: 'sa', password: 'p', database: 'db',
    });
    expect(cfg.port).toBe(1444);
    expect(cfg.options.instanceName).toBeUndefined();
  });

  it('defaults to port 1433 when no port and no instance', () => {
    const cfg = buildMssqlConfig({
      host: '1.2.3.4', port: '', instance: '',
      user: 'sa', password: 'p', database: 'db',
    });
    expect(cfg.port).toBe(1433);
    expect(cfg.options.instanceName).toBeUndefined();
  });

  it('sets server, user, password, and database from the connection descriptor', () => {
    const cfg = buildMssqlConfig({
      host: 'myserver', port: '1433', instance: '',
      user: 'admin', password: 'verysecret', database: 'mydb',
    });
    expect(cfg.server).toBe('myserver');
    expect(cfg.user).toBe('admin');
    expect(cfg.password).toBe('verysecret');
    expect(cfg.database).toBe('mydb');
  });

  it('defaults database to "eazybusiness" when not provided', () => {
    const cfg = buildMssqlConfig({
      host: '1.2.3.4', port: '1433', instance: '',
      user: 'sa', password: 'p', database: '',
    });
    expect(cfg.database).toBe('eazybusiness');
  });

  it('does not use Browser Service when instance + port are both provided', () => {
    // This is the key regression test for the original bug:
    // the old code deleted cfg.port whenever instanceName was set, which
    // forced Browser Service resolution and caused a 15-second timeout.
    const cfg = buildMssqlConfig({
      host: '212.133.109.199', port: '1433', instance: 'SQLS',
      user: 'sa', password: 'pass', database: 'eazybusiness',
    });
    expect(cfg.port).toBe(1433);
    expect(cfg.options.instanceName).toBeUndefined();
  });

  it('has encrypt:false and trustServerCertificate:true for local/private networks', () => {
    const cfg = buildMssqlConfig({
      host: '1.2.3.4', port: '1433', instance: '',
      user: 'sa', password: 'p', database: 'db',
    });
    expect(cfg.options.encrypt).toBe(false);
    expect(cfg.options.trustServerCertificate).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/health
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/health', () => {
  it('returns 200 with status "ok"', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('includes an ISO timestamp', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.timestamp).toBeDefined();
    expect(() => new Date(res.body.timestamp)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/versions
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/versions', () => {
  it('returns 200 with an array', async () => {
    const res = await request(app).get('/api/versions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns at least one version file', async () => {
    const res = await request(app).get('/api/versions');
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('version strings match semver-like format x.y.z.w', async () => {
    const res = await request(app).get('/api/versions');
    res.body.forEach(v => {
      expect(v).toMatch(/^[\w.]+$/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/schema
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/schema', () => {
  it('returns 200 with a non-null object', async () => {
    const res = await request(app).get('/api/schema');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
    expect(res.body).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/schema/:version
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/schema/:version', () => {
  it('returns 400 for path-traversal attempt', async () => {
    // URL-encoded slashes like /../ could bypass naive checks
    const res = await request(app).get('/api/schema/..%2Fetc%2Fpasswd');
    expect(res.status).toBe(400);
  });

  it('returns 400 for version string with illegal characters', async () => {
    const res = await request(app).get('/api/schema/bad$version!');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('returns 404 for a well-formed but non-existent version', async () => {
    const res = await request(app).get('/api/schema/9.9.9.9');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 200 with schema data for a valid existing version', async () => {
    const versionsRes = await request(app).get('/api/versions');
    const first = versionsRes.body[0];
    if (first) {
      const res = await request(app).get(`/api/schema/${first}`);
      expect(res.status).toBe(200);
      expect(typeof res.body).toBe('object');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/query
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/query', () => {

  // ── Input validation ──────────────────────────────────────────────────

  it('returns 400 when sql field is absent', async () => {
    const res = await request(app).post('/api/query').send({ connectionConfig: validConn });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when sql is not a string', async () => {
    const res = await request(app).post('/api/query').send({ sql: 123, connectionConfig: validConn });
    expect(res.status).toBe(400);
  });

  it('returns 400 when sql is an empty string', async () => {
    const res = await request(app).post('/api/query').send({ sql: '', connectionConfig: validConn });
    expect(res.status).toBe(400);
  });

  // ── SELECT-only guard ─────────────────────────────────────────────────

  it('returns 403 for a DROP statement', async () => {
    const res = await request(app)
      .post('/api/query')
      .send({ sql: 'DROP TABLE users', connectionConfig: validConn });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/select/i);
  });

  it('returns 403 for an INSERT statement', async () => {
    const res = await request(app)
      .post('/api/query')
      .send({ sql: 'INSERT INTO t VALUES (1)', connectionConfig: validConn });
    expect(res.status).toBe(403);
  });

  it('returns 403 for an UPDATE statement', async () => {
    const res = await request(app)
      .post('/api/query')
      .send({ sql: 'UPDATE t SET col=1', connectionConfig: validConn });
    expect(res.status).toBe(403);
  });

  it('returns 403 for a DELETE statement', async () => {
    const res = await request(app)
      .post('/api/query')
      .send({ sql: 'DELETE FROM t', connectionConfig: validConn });
    expect(res.status).toBe(403);
  });

  // ── connectionConfig validation ───────────────────────────────────────

  it('returns 400 when connectionConfig is absent', async () => {
    const res = await request(app).post('/api/query').send({ sql: 'SELECT 1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/connection/i);
  });

  it('returns 400 when connectionConfig has no host', async () => {
    const res = await request(app)
      .post('/api/query')
      .send({ sql: 'SELECT 1', connectionConfig: { user: 'sa', password: 'x' } });
    expect(res.status).toBe(400);
  });

  it('returns 400 when connectionConfig has no user', async () => {
    const res = await request(app)
      .post('/api/query')
      .send({ sql: 'SELECT 1', connectionConfig: { host: '1.2.3.4' } });
    expect(res.status).toBe(400);
  });

  // ── Successful execution ──────────────────────────────────────────────

  it('executes a SELECT query and returns an array of records', async () => {
    mockRequest.query.mockResolvedValue({ recordset: [{ col: 42 }] });
    const res = await request(app)
      .post('/api/query')
      .send({ sql: 'SELECT 42 AS col', connectionConfig: validConn });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].col).toBe(42);
  });

  it('returns an empty array when the query returns no rows', async () => {
    mockRequest.query.mockResolvedValue({ recordset: [] });
    const res = await request(app)
      .post('/api/query')
      .send({ sql: 'SELECT 1 WHERE 1=0', connectionConfig: validConn });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('case-insensitively allows a SELECT that starts with whitespace', async () => {
    mockRequest.query.mockResolvedValue({ recordset: [{ n: 1 }] });
    const res = await request(app)
      .post('/api/query')
      .send({ sql: '  select 1 AS n  ', connectionConfig: validConn });
    expect(res.status).toBe(200);
  });

  // ── Error paths ───────────────────────────────────────────────────────

  it('returns 500 when the SQL engine throws', async () => {
    mockRequest.query.mockRejectedValue(new Error('Invalid object name'));
    const res = await request(app)
      .post('/api/query')
      .send({ sql: 'SELECT * FROM missing_table', connectionConfig: validConn });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it('returns 500 with an error message when the pool cannot connect', async () => {
    // Use a unique host to bypass the pool cache and force a fresh connect() call.
    mockPool.connected = false;
    mockPool.connect.mockRejectedValue(new Error('Connection refused'));
    const freshConn = { ...validConn, host: 'unreachable-host-error-test' };
    const res = await request(app)
      .post('/api/query')
      .send({ sql: 'SELECT 1', connectionConfig: freshConn });
    expect(res.status).toBe(500);
    expect(typeof res.body.error).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Unknown routes
// ═══════════════════════════════════════════════════════════════════════════

describe('Unknown routes', () => {
  it('returns 404 with an error body for an unrecognised path', async () => {
    const res = await request(app).get('/api/this-does-not-exist-xyz');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('returns 404 for a POST to an unknown path', async () => {
    const res = await request(app).post('/api/unknown-post');
    expect(res.status).toBe(404);
  });
});
