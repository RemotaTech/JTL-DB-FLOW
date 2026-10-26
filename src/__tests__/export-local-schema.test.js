/**
 * export-local-schema.js: type formatting, grouping, argument parsing (no database).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('mssql', () => ({ default: { ConnectionPool: class {} } }));

const { formatType, buildSchema, parseArgs } = await import('../../export-local-schema.js');

const col = (type_name, extra = {}) => ({ type_name, max_length: 4, precision: 10, scale: 0, ...extra });

describe('formatType', () => {
  it('matches the scraper format', () => {
    expect(formatType(col('int'))).toBe('INT');
    expect(formatType(col('nvarchar', { max_length: 200 }))).toBe('NVARCHAR(100)'); // bytes -> chars
    expect(formatType(col('nvarchar', { max_length: -1 }))).toBe('NVARCHAR(MAX)');
    expect(formatType(col('varchar', { max_length: 50 }))).toBe('VARCHAR(50)');
    expect(formatType(col('varbinary', { max_length: -1 }))).toBe('VARBINARY(MAX)');
    expect(formatType(col('decimal', { precision: 25, scale: 13 }))).toBe('DECIMAL(25, 13)');
    expect(formatType(col('datetime2', { scale: 7 }))).toBe('DATETIME2(7)');
    expect(formatType(col('timestamp'))).toBe('TIMESTAMP');
  });
});

describe('buildSchema', () => {
  it('groups rows by schema.table in order and normalises fields', () => {
    const rows = [
      { schema_name: 'dbo', table_name: 'tArtikel', column_name: 'kArtikel', ...col('int'), is_nullable: false, description: 'PK' },
      { schema_name: 'dbo', table_name: 'tArtikel', column_name: 'cArtNr', ...col('nvarchar', { max_length: 200 }), is_nullable: true, description: null },
      { schema_name: 'Verkauf', table_name: 'tAuftrag', column_name: 'kAuftrag', ...col('int'), is_nullable: 0, description: null },
    ];
    expect(buildSchema(rows)).toEqual({
      tables: [
        { name: 'dbo.tArtikel', columns: [
          { name: 'kArtikel', type: 'INT', nullable: false, description: 'PK' },
          { name: 'cArtNr', type: 'NVARCHAR(100)', nullable: true, description: '' },
        ] },
        { name: 'Verkauf.tAuftrag', columns: [{ name: 'kAuftrag', type: 'INT', nullable: false, description: '' }] },
      ],
    });
  });
});

describe('parseArgs', () => {
  it('parses flags and uses env fallbacks', () => {
    const o = parseArgs(['--version', 'v2.1.0.0', '--user', 'sa'], { DB_HOST: 'srv', DB_NAME: '' });
    expect(o).toMatchObject({ host: 'srv', user: 'sa', version: '2.1.0.0', database: 'eazybusiness', dir: './versions', force: false });
  });

  it('rejects bad version, missing host/user, unknown flags', () => {
    expect(() => parseArgs(['--host', 'h', '--user', 'u', '--version', '../x'], {})).toThrow(/version/);
    expect(() => parseArgs(['--user', 'u', '--version', '2.0.0.0'], {})).toThrow(/host/);
    expect(() => parseArgs(['--host', 'h', '--version', '2.0.0.0'], {})).toThrow(/user/);
    expect(() => parseArgs(['--nope'], {})).toThrow(/Unknown argument/);
    expect(() => parseArgs(['--host'], {})).toThrow(/needs a value/);
  });
});
