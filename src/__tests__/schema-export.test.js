/**
 * POST /api/schema/export — reads the catalog of the connected DB and either
 * stores `<version>.json` (BRIDGE_SCHEMA_WRITE_DIR) or returns the schema.
 * mssql is mocked (same pattern as bridge.test.js).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const { mockPool, mockRequest } = vi.hoisted(() => {
  process.env.BRIDGE_EXPORT_RATE_LIMIT = '1000';   // the real limit (6/min) would trip over this file's many requests
  const mockRequest = { query: vi.fn() };
  const mockPool = { connected: true, connect: vi.fn(), request: vi.fn(() => mockRequest), on: vi.fn(), close: vi.fn() };
  return { mockPool, mockRequest };
});
vi.mock('mssql', () => ({ default: { ConnectionPool: class { constructor() { return mockPool; } } } }));

const { app } = await import('../../server.js');

const conn = { host: 'db.example.com', port: '1433', user: 'reader', password: 'pw', database: 'eazybusiness' };
const post = (body) => request(app).post('/api/schema/export').send(body);

const rows = [
  { schema_name: 'dbo', table_name: 'tArtikel', column_name: 'kArtikel', type_name: 'int', max_length: 4, precision: 10, scale: 0, is_nullable: false, description: 'PK' },
  { schema_name: 'dbo', table_name: 'tArtikel', column_name: 'cArtNr', type_name: 'nvarchar', max_length: 200, precision: 0, scale: 0, is_nullable: true, description: null },
];

let dir;
beforeEach(() => {
  vi.clearAllMocks();
  mockPool.connected = true;
  mockPool.connect.mockResolvedValue(undefined);
  mockPool.request.mockReturnValue(mockRequest);
  mockRequest.query.mockResolvedValue({ recordset: rows });
  dir = mkdtempSync(join(tmpdir(), 'dbflow-export-'));
});
afterEach(() => {
  delete process.env.BRIDGE_SCHEMA_WRITE_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/schema/export — validation', () => {
  it.each(['', 'abc', '../x', '2', '1.2.3.4.5'])('rejects version %j', async (version) => {
    const res = await post({ connectionConfig: conn, version });
    expect(res.status).toBe(400);
    expect(mockRequest.query).not.toHaveBeenCalled();
  });

  it('rejects a missing connection', async () => {
    const res = await post({ version: '2.1.0.0' });
    expect(res.status).toBe(400);
  });

  it('maps DB errors like /api/query', async () => {
    mockRequest.query.mockRejectedValue(Object.assign(new Error('Login failed'), { code: 'ELOGIN' }));
    const res = await post({ connectionConfig: conn, version: '2.1.0.0' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ELOGIN');
  });

  it('422 when the database has no tables', async () => {
    mockRequest.query.mockResolvedValue({ recordset: [] });
    const res = await post({ connectionConfig: conn, version: '2.1.0.0' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('EMPTY');
  });
});

describe('POST /api/schema/export — without write dir', () => {
  it('returns the schema for download and writes nothing', async () => {
    const res = await post({ connectionConfig: conn, version: 'v2.1.0.0' });
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(false);
    expect(res.body.version).toBe('2.1.0.0');
    expect(res.body.schema.tables[0]).toEqual({
      name: 'dbo.tArtikel',
      columns: [
        { name: 'kArtikel', type: 'INT', nullable: false, description: 'PK' },
        { name: 'cArtNr', type: 'NVARCHAR(100)', nullable: true, description: '' },
      ],
    });
  });

  it('health says saving is off', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.schemaSave).toBe(false);
  });
});

describe('POST /api/schema/export — with BRIDGE_SCHEMA_WRITE_DIR', () => {
  it('stores <version>.json atomically and lists it', async () => {
    process.env.BRIDGE_SCHEMA_WRITE_DIR = dir;
    const res = await post({ connectionConfig: conn, version: '7.7.7.7' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ saved: true, version: '7.7.7.7', tables: 1, columns: 2 });

    const file = join(dir, '7.7.7.7.json');
    expect(existsSync(file)).toBe(true);
    expect(readdirSync(dir).filter(f => f.endsWith('.tmp'))).toEqual([]);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    expect(saved.version).toBe('7.7.7.7');
    expect(saved.tables).toHaveLength(1);

    const versions = await request(app).get('/api/versions');
    expect(versions.body).toContain('7.7.7.7');
    expect((await request(app).get('/api/health')).body.schemaSave).toBe(true);
  });

  it('409 EXISTS unless overwrite is set', async () => {
    process.env.BRIDGE_SCHEMA_WRITE_DIR = dir;
    writeFileSync(join(dir, '7.7.7.8.json'), JSON.stringify({ tables: [{ name: 'dbo.Old', columns: [] }] }));

    const res = await post({ connectionConfig: conn, version: '7.7.7.8' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EXISTS');
    expect(mockRequest.query).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(join(dir, '7.7.7.8.json'), 'utf8')).tables[0].name).toBe('dbo.Old');

    const ok = await post({ connectionConfig: conn, version: '7.7.7.8', overwrite: true });
    expect(ok.status).toBe(200);
    expect(JSON.parse(readFileSync(join(dir, '7.7.7.8.json'), 'utf8')).tables[0].name).toBe('dbo.tArtikel');
  });

  it('treats bundled versions as existing', async () => {
    process.env.BRIDGE_SCHEMA_WRITE_DIR = dir;
    const res = await post({ connectionConfig: conn, version: '2.0.0.0' });
    expect(res.status).toBe(409);
  });
});
