import { describe, it, expect } from 'vitest';
import { collectUpstreamColumns } from '../utils/nodeUtils';

// ─── Minimal schema fixture ────────────────────────────────────────────────

const schema = {
  tables: [
    {
      name: 'dbo.tArtikel',
      columns: [
        { name: 'kArtikel', type: 'int', description: 'Primary key' },
        { name: 'cArtNr', type: 'nvarchar', description: 'Article number' },
        { name: 'fVKNetto', type: 'float', description: 'Net sales price' },
      ],
    },
    {
      name: 'dbo.tkunde',
      columns: [
        { name: 'kKunde', type: 'int', description: 'Customer PK' },
        { name: 'cKundenNr', type: 'nvarchar', description: 'Customer number' },
      ],
    },
  ],
};

// ─── Node + edge fixtures ──────────────────────────────────────────────────

const mkNode = (id, type, data = {}) => ({ id, type, position: { x: 0, y: 0 }, data });
const mkEdge = (source, target, targetHandle = 'target1') => ({ id: `${source}-${target}`, source, target, targetHandle });

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('collectUpstreamColumns', () => {
  it('returns columns for a standalone TableNode', () => {
    const nodes = [mkNode('t1', 'tableNode', { selectedTable: 'dbo.tArtikel' })];
    const result = collectUpstreamColumns('t1', nodes, [], schema);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ tableName: 'dbo.tArtikel', columnName: 'kArtikel' });
    expect(result[0].qualified).toBe('dbo.tArtikel.kArtikel');
  });

  it('returns empty array when node is not found', () => {
    const result = collectUpstreamColumns('nonexistent', [], [], schema);
    expect(result).toEqual([]);
  });

  it('returns empty array when TableNode has no selectedTable', () => {
    const nodes = [mkNode('t1', 'tableNode', { selectedTable: '' })];
    const result = collectUpstreamColumns('t1', nodes, [], schema);
    expect(result).toEqual([]);
  });

  it('returns empty array when table is not in schema', () => {
    const nodes = [mkNode('t1', 'tableNode', { selectedTable: 'dbo.Unknown' })];
    const result = collectUpstreamColumns('t1', nodes, [], schema);
    expect(result).toEqual([]);
  });

  it('returns columns from both sides of a JoinNode', () => {
    const nodes = [
      mkNode('t1', 'tableNode', { selectedTable: 'dbo.tArtikel' }),
      mkNode('t2', 'tableNode', { selectedTable: 'dbo.tkunde' }),
      mkNode('j1', 'joinNode', {}),
    ];
    const edges = [
      mkEdge('t1', 'j1', 'target1'),
      mkEdge('t2', 'j1', 'join'),
    ];
    const result = collectUpstreamColumns('j1', nodes, edges, schema);
    const tableNames = result.map(c => c.tableName);
    expect(tableNames).toContain('dbo.tArtikel');
    expect(tableNames).toContain('dbo.tkunde');
    expect(result).toHaveLength(5); // 3 from tArtikel + 2 from tkunde
  });

  it('passes through columns from a filter node (single upstream)', () => {
    const nodes = [
      mkNode('t1', 'tableNode', { selectedTable: 'dbo.tArtikel' }),
      mkNode('f1', 'whereNode', { condition: 'kArtikel > 0' }),
    ];
    const edges = [mkEdge('t1', 'f1')];
    const result = collectUpstreamColumns('f1', nodes, edges, schema);
    expect(result).toHaveLength(3);
    expect(result[0].tableName).toBe('dbo.tArtikel');
  });

  it('passes through columns from a sort node', () => {
    const nodes = [
      mkNode('t1', 'tableNode', { selectedTable: 'dbo.tArtikel' }),
      mkNode('s1', 'orderByNode', {}),
    ];
    const edges = [mkEdge('t1', 's1')];
    const result = collectUpstreamColumns('s1', nodes, edges, schema);
    expect(result).toHaveLength(3);
  });

  it('returns empty array when no schema is provided', () => {
    const nodes = [mkNode('t1', 'tableNode', { selectedTable: 'dbo.tArtikel' })];
    const result = collectUpstreamColumns('t1', nodes, [], null);
    expect(result).toEqual([]);
  });

  it('each result has required fields: tableName, columnName, qualified, type, description', () => {
    const nodes = [mkNode('t1', 'tableNode', { selectedTable: 'dbo.tArtikel' })];
    const result = collectUpstreamColumns('t1', nodes, [], schema);
    result.forEach(col => {
      expect(col).toHaveProperty('tableName');
      expect(col).toHaveProperty('columnName');
      expect(col).toHaveProperty('qualified');
      expect(col).toHaveProperty('type');
      expect(col).toHaveProperty('description');
    });
  });
});
