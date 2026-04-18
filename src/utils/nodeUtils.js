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

  // A JoinNode is now a hub: it accepts N incoming source connections.
  // Collect columns from every source listed in data.sourceOrder (in order,
  // so base table's columns come first). Fall back to raw edges if sourceOrder
  // is missing (unsynced).
  if (node.type === 'joinNode') {
    const order = (node.data.sourceOrder && node.data.sourceOrder.length > 0)
      ? node.data.sourceOrder
      : edges.filter(e => e.target === node.id).map(e => e.source);
    const cols = [];
    order.forEach(sid => {
      cols.push(...collectUpstreamColumns(sid, nodes, edges, schema));
    });
    return cols;
  }

  // For other nodes (Filter, Sort, etc.), pass through columns from single input.
  const incomingEdge = edges.find(e => e.target === node.id);
  if (incomingEdge) {
    return collectUpstreamColumns(incomingEdge.source, nodes, edges, schema);
  }

  return [];
};
