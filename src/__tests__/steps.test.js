import { describe, it, expect } from 'vitest';
import { stepsToSql, stepIssues, pipelineIssues, uid, reidSteps, ROW_LIMIT } from '../lib/steps.js';

const schema = { tables: [
  { name: 'Verkauf.tAuftrag', columns: [{ name: 'kAuftrag', type: 'INT' }, { name: 'kKunde', type: 'INT' }, { name: 'dErstellt', type: 'DATETIME' }] },
  { name: 'dbo.tkunde', columns: [{ name: 'kKunde', type: 'INT' }, { name: 'cKundenNr', type: 'NVARCHAR' }] },
] };

describe('stepsToSql', () => {
  it('returns empty without a source', () => {
    expect(stepsToSql([])).toBe('');
    expect(stepsToSql([{ type: 'source', table: '' }])).toBe('');
  });
  it('generates a bracket-quoted TOP query with join, filter, sort', () => {
    const sql = stepsToSql([
      { id: '1', type: 'source', table: 'Verkauf.tAuftrag' },
      { id: '2', type: 'join', table: 'dbo.tkunde', fromCol: 'Verkauf.tAuftrag.kKunde', toCol: 'dbo.tkunde.kKunde', kind: 'left' },
      { id: '3', type: 'filter', conditions: [{ field: 'Verkauf.tAuftrag.dErstellt', op: '≥', value: '@zeitraum' }, { field: 'dbo.tkunde.cKundenNr', op: 'enthält', value: "O'Neil" }] },
      { id: '4', type: 'sort', by: 'Verkauf.tAuftrag.dErstellt', dir: 'desc' },
    ], [{ name: 'zeitraum', value: 'DATEADD(day, -30, GETDATE())' }], schema);
    expect(sql).toContain(`SELECT TOP ${ROW_LIMIT}`);
    expect(sql).toContain('LEFT JOIN [dbo].[tkunde]');
    expect(sql).toContain('[Verkauf].[tAuftrag].[dErstellt] >= DATEADD(day, -30, GETDATE())');
    expect(sql).toContain("[dbo].[tkunde].[cKundenNr] LIKE '%O''Neil%'");
    expect(sql).toContain('ORDER BY [Verkauf].[tAuftrag].[dErstellt] DESC');
    expect(sql.endsWith(';')).toBe(true);
  });
  it('escapes closing brackets in identifiers and aliases', () => {
    const sql = stepsToSql([
      { id: '1', type: 'source', table: 'dbo.t]x' },
      { id: '2', type: 'group', by: ['dbo.t]x.a'], metrics: [{ agg: 'Anzahl', field: '', as: 'n] FROM y --' }] },
    ]);
    expect(sql).toContain('FROM [dbo].[t]]x]');
    expect(sql).toContain('COUNT(*) AS [n]] FROM y --]');
    expect(sql).not.toMatch(/\[n\] FROM/);
  });
  it('skips incomplete joins and filters instead of emitting broken SQL', () => {
    const sql = stepsToSql([
      { id: '1', type: 'source', table: 'dbo.tkunde' },
      { id: '2', type: 'join', table: null },
      { id: '3', type: 'filter', conditions: [{ field: '', op: '=', value: '1' }] },
    ]);
    expect(sql).not.toContain('JOIN');
    expect(sql).not.toContain('WHERE');
  });
});

describe('stepIssues', () => {
  const steps = [{ id: '1', type: 'source', table: 'dbo.tkunde' }];
  it('reports missing pieces in German', () => {
    expect(stepIssues({ type: 'source', table: '' }, [], schema)).toEqual(['Tabelle wählen']);
    expect(stepIssues({ type: 'join', table: 'x' }, steps, schema)).toEqual(['Schlüssel wählen']);
    expect(stepIssues({ type: 'filter', conditions: [{ field: '', op: '=', value: '' }] }, steps, schema)).toEqual(['Bedingung 1: Feld wählen']);
    expect(stepIssues({ type: 'filter', conditions: [{ field: 'dbo.tkunde.cKundenNr', op: '=', value: '' }] }, steps, schema)).toEqual(['Bedingung 1: Wert eingeben']);
    expect(stepIssues({ type: 'filter', conditions: [{ field: 'dbo.tkunde.zzz', op: '=', value: '1' }] }, steps, schema)).toEqual(['Bedingung 1: Feld nicht verfügbar']);
    expect(stepIssues({ type: 'sort', by: '' }, steps, schema)).toEqual(['Feld wählen']);
    expect(stepIssues({ type: 'group', by: [], metrics: [] }, steps, schema)).toEqual(['Feld oder Kennzahl wählen']);
  });
  it('is quiet for complete steps and counts across the pipeline', () => {
    const ok = [
      { id: '1', type: 'source', table: 'dbo.tkunde' },
      { id: '2', type: 'filter', conditions: [{ field: 'dbo.tkunde.cKundenNr', op: '=', value: 'A' }] },
      { id: '3', type: 'sort', by: 'dbo.tkunde.cKundenNr' },
    ];
    expect(pipelineIssues(ok, schema)).toBe(0);
    expect(pipelineIssues([...ok, { id: '4', type: 'join', table: null }], schema)).toBe(1);
  });
});

describe('ids', () => {
  it('uid is unique across many calls', () => {
    const ids = new Set(Array.from({ length: 5000 }, uid));
    expect(ids.size).toBe(5000);
  });
  it('reidSteps replaces every id including format items', () => {
    const out = reidSteps([{ id: 's101', type: 'format', items: [{ id: 's102', field: 'a' }] }]);
    expect(out[0].id).not.toBe('s101');
    expect(out[0].items[0].id).not.toBe('s102');
  });
});
