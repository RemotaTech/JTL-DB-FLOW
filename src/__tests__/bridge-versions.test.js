/**
 * Schema version lookup across multiple directories (BRIDGE_VERSIONS_DIRS).
 * The desktop app prepends a user-writable folder; files there must show up
 * in /api/versions and win over bundled files with the same name.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, delimiter } from 'path';
import request from 'supertest';
import express from 'express';

vi.mock('mssql', () => ({ default: { ConnectionPool: class {} } }));

const { bridgeRouter, listVersions, resolveVersionFile, compareVersions } = await import('../../bridge/app.js');

let dirA, dirB;
beforeAll(() => {
  dirA = mkdtempSync(join(tmpdir(), 'dbflow-vers-a-'));
  dirB = mkdtempSync(join(tmpdir(), 'dbflow-vers-b-'));
  writeFileSync(join(dirA, '9.9.9.9.json'), JSON.stringify({ tables: [{ name: 'dbo.A', columns: [] }] }));
  writeFileSync(join(dirA, '1.11.1.0.json'), JSON.stringify({ tables: [{ name: 'dbo.Override', columns: [] }] }));
  writeFileSync(join(dirB, '1.11.10.0.json'), JSON.stringify({ tables: [{ name: 'dbo.B', columns: [] }] }));
  process.env.BRIDGE_VERSIONS_DIRS = [dirA, dirB].join(delimiter);
});
afterAll(() => {
  delete process.env.BRIDGE_VERSIONS_DIRS;
  rmSync(dirA, { recursive: true, force: true });
  rmSync(dirB, { recursive: true, force: true });
});

describe('compareVersions', () => {
  it('sorts dotted versions numerically', () => {
    expect(['1.11.10.0', '1.11.9.0', '2.0.0.0', '1.11.1.0'].sort(compareVersions)).toEqual(['1.11.1.0', '1.11.9.0', '1.11.10.0', '2.0.0.0']);
  });
});

describe('versions across dirs', () => {
  it('merges extra dirs with the bundled folder, de-duplicated and sorted', () => {
    const v = listVersions();
    expect(v).toContain('9.9.9.9');
    expect(v).toContain('1.11.10.0');
    expect(v).toContain('2.0.0.0');                       // bundled
    expect(v.filter(x => x === '1.11.1.0')).toHaveLength(1);
    expect(v.indexOf('1.11.9.0') < v.indexOf('1.11.10.0') || !v.includes('1.11.9.0')).toBe(true);
  });

  it('first directory wins for duplicate names', () => {
    expect(resolveVersionFile('1.11.1.0')).toBe(join(dirA, '1.11.1.0.json'));
    expect(resolveVersionFile('nope')).toBeNull();
  });

  it('serves user schema through the router', async () => {
    const app = express().use(bridgeRouter);
    const list = await request(app).get('/api/versions');
    expect(list.status).toBe(200);
    expect(list.body).toContain('9.9.9.9');
    const one = await request(app).get('/api/schema/9.9.9.9');
    expect(one.status).toBe(200);
    expect(one.body.tables[0].name).toBe('dbo.A');
    const ov = await request(app).get('/api/schema/1.11.1.0');
    expect(ov.body.tables[0].name).toBe('dbo.Override');
    expect((await request(app).get('/api/schema/..%2Fx')).status).toBe(400);
  });
});
