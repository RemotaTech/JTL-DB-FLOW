import { describe, it, expect } from 'vitest';
import { generateSql } from '../utils/queryGenerator';

// ─── Helpers ───────────────────────────────────────────────────────────────

const tableNode = (id, table, columns = [], top = null) => ({
  id,
  type: 'tableNode',
  position: { x: 0, y: 0 },
  data: { selectedTable: table, selectedColumns: columns, top },
});

const filterNode = (id, condition) => ({
  id,
  type: 'whereNode',
  position: { x: 0, y: 0 },
  data: { condition },
});

const joinNode = (id, joinType = 'INNER JOIN', joinCondition = '') => ({
  id,
  type: 'joinNode',
  position: { x: 0, y: 0 },
  data: { joinType, joinCondition },
});

const sortNode = (id, cols, dir = 'ASC') => ({
  id,
  type: 'orderByNode',
  position: { x: 0, y: 0 },
  data: { orderCols: cols, orderDirection: dir },
});

const groupNode = (id, groupBy, having = '') => ({
  id,
  type: 'groupByNode',
  position: { x: 0, y: 0 },
  data: { groupBy, having },
});

const distinctNode = (id, isDistinct = true) => ({
  id,
  type: 'distinctNode',
  position: { x: 0, y: 0 },
  data: { isDistinct },
});

const colSelectorNode = (id, selectedColumns) => ({
  id,
  type: 'columnSelector',
  position: { x: 0, y: 0 },
  data: { selectedColumns },
});

const formatterNode = (id, selectedColumn, formatValue, alias = '') => ({
  id,
  type: 'formatterNode',
  position: { x: 0, y: 0 },
  data: { selectedColumn, formatValue, alias },
});

const edge = (source, target, targetHandle = 'target1') => ({
  id: `${source}-${target}`,
  source,
  target,
  targetHandle,
  animated: true,
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('generateSql', () => {
  // ── Empty / no nodes ──────────────────────────────────────────────────────

  it('returns empty string when there are no nodes', () => {
    expect(generateSql([], [])).toBe('');
  });

  it('returns empty string when the table node has no selectedTable', () => {
    const nodes = [tableNode('t1', '')];
    expect(generateSql(nodes, [])).toBe('');
  });

  // ── Basic SELECT ──────────────────────────────────────────────────────────

  it('generates SELECT * FROM when no columns selected', () => {
    const nodes = [tableNode('t1', 'dbo.tArtikel')];
    const sql = generateSql(nodes, []);
    expect(sql).toContain('SELECT');
    expect(sql).toContain('*');
    expect(sql).toContain('[dbo].[tArtikel]');
  });

  it('generates SELECT with specific columns', () => {
    const nodes = [tableNode('t1', 'dbo.tArtikel', ['kArtikel', 'cArtNr'])];
    const sql = generateSql(nodes, []);
    expect(sql).toContain('[dbo].[tArtikel].[kArtikel]');
    expect(sql).toContain('[dbo].[tArtikel].[cArtNr]');
    expect(sql).not.toContain('*');
  });

  it('wraps schema-qualified identifiers with brackets', () => {
    const nodes = [tableNode('t1', 'Verkauf.tAuftrag', ['kAuftrag'])];
    const sql = generateSql(nodes, []);
    expect(sql).toContain('[Verkauf].[tAuftrag]');
    expect(sql).toContain('[Verkauf].[tAuftrag].[kAuftrag]');
  });

  // ── TOP clause ────────────────────────────────────────────────────────────

  it('includes TOP clause when top is set', () => {
    const nodes = [tableNode('t1', 'dbo.tArtikel', [], 100)];
    const sql = generateSql(nodes, []);
    expect(sql).toContain('TOP 100');
  });

  it('omits TOP clause when top is null', () => {
    const nodes = [tableNode('t1', 'dbo.tArtikel', [], null)];
    const sql = generateSql(nodes, []);
    expect(sql).not.toContain('TOP');
  });

  // ── WHERE clause ──────────────────────────────────────────────────────────

  it('generates WHERE clause from filter node', () => {
    const t1 = tableNode('t1', 'dbo.tArtikel', ['kArtikel']);
    const f1 = filterNode('f1', 'dbo.tArtikel.fVKNetto > 10');
    const nodes = [t1, f1];
    const edges = [edge('t1', 'f1')];
    const sql = generateSql(nodes, edges);
    expect(sql).toContain('WHERE');
    expect(sql).toContain('>');
    expect(sql).toContain('10');
  });

  it('combines multiple WHERE conditions with AND', () => {
    const t1 = tableNode('t1', 'dbo.tArtikel', ['kArtikel']);
    const f1 = filterNode('f1', 'dbo.tArtikel.kArtikel > 0');
    const f2 = filterNode('f2', 'dbo.tArtikel.fVKNetto > 5');
    const nodes = [t1, f1, f2];
    const edges = [edge('t1', 'f1'), edge('f1', 'f2')];
    const sql = generateSql(nodes, edges);
    expect(sql).toMatch(/WHERE.+AND/s);
  });

  // ── ORDER BY ─────────────────────────────────────────────────────────────

  it('generates ORDER BY clause', () => {
    const t1 = tableNode('t1', 'dbo.tArtikel', ['kArtikel']);
    const s1 = sortNode('s1', ['dbo.tArtikel.kArtikel'], 'DESC');
    const nodes = [t1, s1];
    const edges = [edge('t1', 's1')];
    const sql = generateSql(nodes, edges);
    expect(sql).toContain('ORDER BY');
    expect(sql).toContain('DESC');
  });

  it('uses ASC by default in ORDER BY', () => {
    const t1 = tableNode('t1', 'dbo.tArtikel');
    const s1 = sortNode('s1', ['dbo.tArtikel.kArtikel'], 'ASC');
    const nodes = [t1, s1];
    const edges = [edge('t1', 's1')];
    const sql = generateSql(nodes, edges);
    expect(sql).toContain('ASC');
  });

  // ── GROUP BY / HAVING ─────────────────────────────────────────────────────

  it('generates GROUP BY clause', () => {
    const t1 = tableNode('t1', 'dbo.tArtikel', ['kArtikel']);
    const g1 = groupNode('g1', 'dbo.tArtikel.kArtikel');
    const nodes = [t1, g1];
    const edges = [edge('t1', 'g1')];
    const sql = generateSql(nodes, edges);
    expect(sql).toContain('GROUP BY');
  });

  it('generates HAVING clause when having is set', () => {
    const t1 = tableNode('t1', 'dbo.tArtikel', ['kArtikel']);
    const g1 = groupNode('g1', 'dbo.tArtikel.kArtikel', 'COUNT(*) > 1');
    const nodes = [t1, g1];
    const edges = [edge('t1', 'g1')];
    const sql = generateSql(nodes, edges);
    expect(sql).toContain('HAVING');
    expect(sql).toContain('COUNT(*) > 1');
  });

  // ── DISTINCT ──────────────────────────────────────────────────────────────

  it('adds DISTINCT keyword when distinctNode is enabled', () => {
    const t1 = tableNode('t1', 'dbo.tArtikel');
    const d1 = distinctNode('d1', true);
    const nodes = [t1, d1];
    const edges = [edge('t1', 'd1')];
    const sql = generateSql(nodes, edges);
    expect(sql).toContain('SELECT DISTINCT');
  });

  it('does not add DISTINCT when distinctNode is disabled', () => {
    const t1 = tableNode('t1', 'dbo.tArtikel');
    const d1 = distinctNode('d1', false);
    const nodes = [t1, d1];
    const edges = [edge('t1', 'd1')];
    const sql = generateSql(nodes, edges);
    expect(sql).not.toContain('DISTINCT');
  });

  // ── ColumnSelector ────────────────────────────────────────────────────────

  it('uses ColumnSelector columns instead of default columns', () => {
    const t1 = tableNode('t1', 'dbo.tArtikel', ['kArtikel', 'cArtNr']);
    const cs1 = colSelectorNode('cs1', { 'dbo.tArtikel.cArtNr': 'ArtNr' });
    const nodes = [t1, cs1];
    const edges = [edge('t1', 'cs1')];
    const sql = generateSql(nodes, edges);
    expect(sql).toContain('AS [ArtNr]');
  });

  // ── Formatter node ────────────────────────────────────────────────────────

  it('applies CONVERT formatter to selected column', () => {
    const t1 = tableNode('t1', 'dbo.tArtikel', ['kArtikel']);
    const fm1 = formatterNode('fm1', 'dbo.tArtikel.kArtikel', 'CONVERT(NVARCHAR, {col})', 'IDString');
    const nodes = [t1, fm1];
    const edges = [edge('t1', 'fm1')];
    const sql = generateSql(nodes, edges);
    expect(sql).toContain('CONVERT(NVARCHAR');
    expect(sql).toContain('AS [IDString]');
  });

  // ── JOIN ─────────────────────────────────────────────────────────────────

  it('generates INNER JOIN from joinNode', () => {
    const t1 = tableNode('t1', 'dbo.tArtikel', ['kArtikel']);
    const t2 = tableNode('t2', 'dbo.tkunde', ['kKunde']);
    const j1 = joinNode('j1', 'INNER JOIN', 'dbo.tArtikel.kArtikel = dbo.tkunde.kKunde');
    const nodes = [t1, t2, j1];
    const edges = [
      edge('t1', 'j1', 'target1'),
      edge('t2', 'j1', 'join'),
    ];
    const sql = generateSql(nodes, edges);
    expect(sql).toContain('INNER JOIN');
    expect(sql).toContain('[dbo].[tkunde]');
    expect(sql).toContain('ON');
  });

  it('generates LEFT JOIN when joinType is LEFT JOIN', () => {
    const t1 = tableNode('t1', 'dbo.tArtikel');
    const t2 = tableNode('t2', 'dbo.tkunde');
    const j1 = joinNode('j1', 'LEFT JOIN', 'dbo.tArtikel.kArtikel = dbo.tkunde.kKunde');
    const nodes = [t1, t2, j1];
    const edges = [edge('t1', 'j1', 'target1'), edge('t2', 'j1', 'join')];
    const sql = generateSql(nodes, edges);
    expect(sql).toContain('LEFT JOIN');
  });

  // ── SQL clause ordering ────────────────────────────────────────────────────

  it('produces SQL clauses in correct order: SELECT FROM WHERE GROUP HAVING ORDER', () => {
    const t1 = tableNode('t1', 'dbo.tArtikel', ['kArtikel']);
    const f1 = filterNode('f1', 'dbo.tArtikel.kArtikel > 0');
    const g1 = groupNode('g1', 'dbo.tArtikel.kArtikel', 'COUNT(*) > 1');
    const s1 = sortNode('s1', ['dbo.tArtikel.kArtikel'], 'ASC');
    const nodes = [t1, f1, g1, s1];
    const edges = [edge('t1', 'f1'), edge('f1', 'g1'), edge('g1', 's1')];
    const sql = generateSql(nodes, edges);

    const selectIdx = sql.indexOf('SELECT');
    const fromIdx = sql.indexOf('FROM');
    const whereIdx = sql.indexOf('WHERE');
    const groupIdx = sql.indexOf('GROUP BY');
    const havingIdx = sql.indexOf('HAVING');
    const orderIdx = sql.indexOf('ORDER BY');

    expect(selectIdx).toBeLessThan(fromIdx);
    expect(fromIdx).toBeLessThan(whereIdx);
    expect(whereIdx).toBeLessThan(groupIdx);
    expect(groupIdx).toBeLessThan(havingIdx);
    expect(havingIdx).toBeLessThan(orderIdx);
  });
});
