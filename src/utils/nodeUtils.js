/**
 * Recursively collects columns from upstream nodes.
 */
export const collectUpstreamColumns = (nodeId, nodes, edges, schema) => {
  const node = nodes.find(n => n.id === nodeId);
  if (!node || !schema) return [];

  if (node.type === 'tableNode') {
    const tableName = node.data.selectedTable;
    if (!tableName) return [];
    const tableSchema = schema.tables.find(t => t.name === tableName);
    return tableSchema ? tableSchema.columns.map(c => ({ 
      tableName, 
      columnName: c.name, 
      qualified: `${tableName}.${c.name}`,
      description: c.description,
      type: c.type
    })) : [];
  }

  // If it's a JoinNode, it has two inputs: target1 and join
  if (node.type === 'joinNode') {
    const upstreamEdges = edges.filter(e => e.target === node.id);
    const u1 = upstreamEdges.find(e => e.targetHandle === 'target1')?.source;
    const u2 = upstreamEdges.find(e => e.targetHandle === 'join')?.source;

    const cols = [];
    if (u1) cols.push(...collectUpstreamColumns(u1, nodes, edges, schema));
    if (u2) cols.push(...collectUpstreamColumns(u2, nodes, edges, schema));
    return cols;
  }

  // For other nodes (Filter, Sort, etc.), they just pass through columns from their single input
  const incomingEdge = edges.find(e => e.target === node.id && e.targetHandle !== 'join');
  if (incomingEdge) {
    return collectUpstreamColumns(incomingEdge.source, nodes, edges, schema);
  }

  return [];
};
