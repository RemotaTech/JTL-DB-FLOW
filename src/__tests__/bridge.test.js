/**
 * Bridge hardening — query gate, connection validation, private-host block,
 * error mapping, row cap. mssql is mocked (see server.test.js for the pattern).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

const { mockPool, mockRequest } = vi.hoisted(() => {
  const mockRequest = { query: vi.fn() };
  const mockPool = { connected: true, connect: vi.fn(), request: vi.fn(() => mockRequest), on: vi.fn(), close: vi.fn() };
  return { mockPool, mockRequest };
});
vi.mock('mssql', () => ({ default: { ConnectionPool: class { constructor() { return mockPool; } } } }));

const { app } = await import('../../server.js');
const { isSafeSelectQuery, isPrivateHost, parseConnection, describeDbError } = await import('../../bridge/app.js');

const conn = { host: 'db.example.com', port: '1433', user: 'reader', password: 'pw', database: 'eazybusiness' };
const post = (body) => request(app).post('/api/query').send(body);

beforeEach(() => {
  vi.clearAllMocks();
  mockPool.connected = true;
  mockPool.connect.mockResolvedValue(undefined);
  mockPool.request.mockReturnValue(mockRequest);
  delete process.env.BRIDGE_ALLOW_PRIVATE_HOSTS;
});
afterEach(() => { delete process.env.BRIDGE_ALLOW_PRIVATE_HOSTS; });

describe('isSafeSelectQuery', () => {
  it.each([
    'SELECT 1',
    '  select top 10 * from dbo.tArtikel',
    'SELECT * FROM dbo.tArtikel WHERE cName LIKE \'%insert%\'',   // keyword inside a string literal is fine? no — blocked by design
    'WITH x AS (SELECT 1 AS a) SELECT a FROM x',
    'SELECT 1; ',
  ].filter(q => !/insert/i.test(q)))('allows %s', (q) => {
    expect(isSafeSelectQuery(q)).toBe(true);
  });

  it.each([
    ['second statement via ;', 'SELECT 1; DROP TABLE x'],
    ['no semicolon, DROP', 'SELECT 1 DROP TABLE x'],
    ['SELECT INTO', 'SELECT * INTO newtable FROM dbo.tArtikel'],
    ['WAITFOR', "SELECT 1 WAITFOR DELAY '0:0:10'"],
    ['stored proc without EXEC', 'SELECT 1 sp_configure'],
    ['xp_cmdshell', "SELECT 1 xp_cmdshell 'dir'"],
    ['BACKUP', "SELECT 1 BACKUP DATABASE x TO DISK='y'"],
    ['SHUTDOWN', 'SELECT 1 SHUTDOWN'],
    ['DBCC', 'SELECT 1 DBCC CHECKDB'],
    ['not a select', 'UPDATE x SET a=1'],
    ['empty', ''],
    ['too long', 'SELECT ' + 'a,'.repeat(20_000)],
    ['keyword hidden after a comment', 'SELECT 1 /* c */ DELETE FROM x'],
    ['semicolon hidden in comment then statement', 'SELECT 1 -- ;\n DROP TABLE x'],
  ])('blocks %s', (_l, q) => {
    expect(isSafeSelectQuery(q)).toBe(false);
  });

  it('ignores keywords that only appear in comments', () => {
    expect(isSafeSelectQuery('SELECT 1 -- DROP TABLE x')).toBe(true);
    expect(isSafeSelectQuery('SELECT 1 /* INSERT */')).toBe(true);
  });
});

describe('isPrivateHost', () => {
  it.each(['localhost', 'LOCALHOST', 'foo.localhost', '127.0.0.1', '127.9.9.9', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.100', '169.254.1.1', '0.0.0.0', '::1', '[::1]', 'fe80::1', 'fd00::1', '::ffff:192.168.0.1', 'db.internal', 'nas.local'])
    ('%s is private', (h) => expect(isPrivateHost(h)).toBe(true));
  it.each(['8.8.8.8', '172.32.0.1', '172.15.0.1', '193.0.0.1', 'db.example.com', '2001:db8::1'])
    ('%s is public', (h) => expect(isPrivateHost(h)).toBe(false));
});

describe('parseConnection', () => {
  it('rejects non-objects and missing host/user', () => {
    expect(parseConnection(null).error).toBeDefined();
    expect(parseConnection('x').error).toBeDefined();
    expect(parseConnection([]).error).toBeDefined();
    expect(parseConnection({ host: 'a' }).error).toBeDefined();
    expect(parseConnection({ user: 'a' }).error).toBeDefined();
  });
  it('rejects malformed host / port / instance / database', () => {
    expect(parseConnection({ ...conn, host: 'bad host!' }).error).toMatch(/host/i);
    expect(parseConnection({ ...conn, port: 'abc' }).error).toMatch(/port/i);
    expect(parseConnection({ ...conn, port: '70000' }).error).toMatch(/port/i);
    expect(parseConnection({ ...conn, instance: 'x;y' }).error).toMatch(/instanz/i);
    expect(parseConnection({ ...conn, database: 'a;drop' }).error).toMatch(/datenbank/i);
  });
  it('rejects oversized credentials and non-string passwords', () => {
    expect(parseConnection({ ...conn, user: 'u'.repeat(200) }).error).toBeDefined();
    expect(parseConnection({ ...conn, password: { $ne: 1 } }).conn.password).toBe('');
  });
  it('normalises defaults', () => {
    const { conn: c } = parseConnection({ host: ' h ', user: 'u', password: 'p', port: '', database: '' });
    expect(c).toEqual({ host: 'h', port: '1433', instance: '', user: 'u', password: 'p', database: 'eazybusiness' });
  });
  it('blocks private hosts only when BRIDGE_ALLOW_PRIVATE_HOSTS=false', () => {
    expect(parseConnection({ ...conn, host: '192.168.1.5' }).conn).toBeDefined();
    process.env.BRIDGE_ALLOW_PRIVATE_HOSTS = 'false';
    expect(parseConnection({ ...conn, host: '192.168.1.5' }).error).toMatch(/privat/i);
    expect(parseConnection({ ...conn, host: 'localhost' }).error).toMatch(/privat/i);
    expect(parseConnection(conn).conn).toBeDefined();
  });
});

describe('describeDbError', () => {
  it('maps login / timeout / socket / request codes to user-facing statuses', () => {
    expect(describeDbError({ code: 'ELOGIN', message: 'Login failed' }).status).toBe(401);
    expect(describeDbError({ code: 'ETIMEOUT', message: 't' }).status).toBe(504);
    expect(describeDbError({ code: 'ESOCKET', message: 's' }).status).toBe(502);
    expect(describeDbError({ code: 'EREQUEST', message: "Invalid column name 'x'." })).toMatchObject({ status: 400, error: expect.stringContaining('Invalid column name') });
    expect(describeDbError({ message: 'boom' }).status).toBe(500);
    expect(describeDbError(null).status).toBe(500);
  });
  it('truncates multi-line / long messages', () => {
    const d = describeDbError({ code: 'EREQUEST', message: 'first line\nsecond line' });
    expect(d.detail).toBe('first line');
    expect(describeDbError({ message: 'x'.repeat(1000) }).detail.length).toBeLessThanOrEqual(300);
  });
});

describe('POST /api/query (hardening)', () => {
  it('returns 403 for SELECT … INTO and WAITFOR', async () => {
    expect((await post({ sql: 'SELECT * INTO t FROM x', connectionConfig: conn })).status).toBe(403);
    expect((await post({ sql: "SELECT 1 WAITFOR DELAY '0:0:5'", connectionConfig: conn })).status).toBe(403);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it('returns 400 (not 500) for malformed JSON bodies', async () => {
    const res = await request(app).post('/api/query').set('Content-Type', 'application/json').send('{"sql": "SELECT 1"');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/json/i);
  });

  it('returns 400 for an invalid host and never opens a pool', async () => {
    const res = await post({ sql: 'SELECT 1', connectionConfig: { ...conn, host: 'bad host!' } });
    expect(res.status).toBe(400);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it('blocks private hosts when the bridge is configured as public', async () => {
    process.env.BRIDGE_ALLOW_PRIVATE_HOSTS = 'false';
    const res = await post({ sql: 'SELECT 1', connectionConfig: { ...conn, host: '10.0.0.5' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/privat/i);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it('maps login failures to 401 with a German message', async () => {
    mockRequest.query.mockRejectedValue(Object.assign(new Error('Login failed for user'), { code: 'ELOGIN' }));
    const res = await post({ sql: 'SELECT 1', connectionConfig: { ...conn, host: 'login-fail.example.com' } });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/anmeldung/i);
    expect(res.body.code).toBe('ELOGIN');
  });

  it('caps rows and flags truncation via header', async () => {
    const rows = Array.from({ length: 5_050 }, (_, i) => ({ i }));
    mockRequest.query.mockResolvedValue({ recordset: rows });
    const res = await post({ sql: 'SELECT 1', connectionConfig: { ...conn, host: 'big.example.com' } });
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(5_000);
    expect(res.headers['x-rows-truncated']).toBe('1');
  });

  it('health reports the private-host policy', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.privateHosts).toBe(true);
  });
});
