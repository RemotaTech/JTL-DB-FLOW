/**
 * Generates SQL from a ReactFlow node graph.
 * We traverse the graph starting from TableNodes (SELECT).
 */
export function generateSql(nodes, edges) {
  // Find all TableNodes (starting points)
  const tableNodes = nodes.filter(n => n.type === 'tableNode');
  if (tableNodes.length === 0) return '';

  // The true main node is a tableNode NOT connected to any 'join' handle
  const joinedTableNodeIds = new Set(
    edges.filter(e => e.targetHandle === 'join').map(e => e.source)
  );
  const mainNode = tableNodes.find(n => !joinedTableNodeIds.has(n.id)) || tableNodes[0];

  const { selectedTable } = mainNode.data;
  if (!selectedTable) return '';
  const topValue = mainNode.data.top;
  const topClause = topValue ? `TOP ${topValue} ` : '';

  // Helper to safely format identifiers like dbo.tArtikel -> [dbo].[tArtikel]
  const formatId = (idStr) => {
    if (!idStr) return '';
    if (idStr.includes('=')) return idStr; // Skip if it's already a full condition
    return idStr.split('.').map(part => `[${part}]`).join('.');
  };

  // Helper to find downstream nodes
  const getDownstream = (nodeId) => {
    const outgoingEdges = edges.filter(e => e.source === nodeId);
    // Ignore edges going to a 'join' handle because that indicates this node is a secondary table
    const validEdges = outgoingEdges.filter(e => e.targetHandle !== 'join');
    return validEdges.map(e => nodes.find(n => n.id === e.target)).filter(Boolean);
  };

  const visited = new Set([mainNode.id]);
  const queue = [...getDownstream(mainNode.id)];

  let joins = [];
  let wheres = [];
  let groupBys = [];
  let havings = [];
  let orderBys = [];
  let allColumns = [];

  // Add primary node columns
  if (mainNode.data.selectedColumns?.length > 0) {
    allColumns.push(...mainNode.data.selectedColumns.map(c => `${formatId(selectedTable)}.[${c}]`));
  }

  let isDistinct = false;
  let customColumns = [];

  while (queue.length > 0) {
    const node = queue.shift();
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    if (node.type === 'tableNode') {
      // Columns from standalone TableNodes that aren't the main node
      if (node.id !== mainNode.id && node.data.selectedColumns?.length > 0) {
         allColumns.push(...node.data.selectedColumns.map(c => `${formatId(node.data.selectedTable)}.[${c}]`));
      }
    } else if (node.type === 'joinNode') {
      const { joinType = 'INNER JOIN', joinCondition } = node.data;
      const joinedEdge = edges.find(e => e.target === node.id && e.targetHandle === 'join');
      const joinedTableNodeId = joinedEdge?.source;
      const joinedTableNode = nodes.find(n => n.id === joinedTableNodeId);
      const joinedTable = joinedTableNode?.data.selectedTable;
      
      if (joinedTable && joinCondition) {
        let safeCondition = joinCondition;
        if (safeCondition.includes(' = ')) {
          const parts = safeCondition.split(' = ');
          safeCondition = `${formatId(parts[0])} = ${formatId(parts[1])}`;
        }
        joins.push(`${joinType} ${formatId(joinedTable)} ON ${safeCondition}`);
        if (joinedTableNode.data.selectedColumns?.length > 0) {
          allColumns.push(...joinedTableNode.data.selectedColumns.map(c => `${formatId(joinedTable)}.[${c}]`));
        }
      }
    } else if (node.type === 'whereNode') {
      if (node.data.condition) {
        const parts = node.data.condition.split(' ');
        if (parts.length >= 3) {
          const col = formatId(parts[0]);
          const op = parts[1];
          const val = parts.slice(2).join(' ');
          wheres.push(`${col} ${op} ${val}`);
        } else {
          wheres.push(node.data.condition);
        }
      }
    } else if (node.type === 'groupByNode') {
      if (node.data.groupBy) {
        const formattedGroups = node.data.groupBy.split(', ').map(g => formatId(g)).join(', ');
        groupBys.push(formattedGroups);
      }
      // Support new structured havingConditions array as well as legacy plain string
      if (node.data.havingConditions?.length > 0) {
        const havingStr = node.data.havingConditions
          .map((c, i) => {
            const colPart = c.col === '*' ? '*' : formatId(c.col);
            const expr    = `${c.fn}(${colPart}) ${c.op} ${c.value}`;
            return i === 0 ? expr : `${c.logic} ${expr}`;
          })
          .join(' ');
        havings.push(havingStr);
      } else if (node.data.having) {
        havings.push(node.data.having);
      }
    } else if (node.type === 'orderByNode') {
      if (node.data.orderCols?.length > 0) {
        const formattedCols = node.data.orderCols.map(c => formatId(c)).join(', ');
        orderBys.push(`${formattedCols} ${node.data.orderDirection}`);
      }
    } else if (node.type === 'columnSelector') {
      if (node.data.selectedColumns) {
         Object.entries(node.data.selectedColumns).forEach(([qualified, alias]) => {
            const formatted = formatId(qualified);
            customColumns.push(alias ? `${formatted} AS [${alias}]` : formatted);
         });
      }
    } else if (node.type === 'formatterNode') {
      const { selectedColumn, formatValue, alias, replaceFind, replaceReplace } = node.data;
      if (selectedColumn && formatValue) {
        let formattedCol = formatValue.replace('{col}', formatId(selectedColumn));
        if (formatValue.includes('{find}')) {
          formattedCol = formattedCol.replace('{find}', replaceFind || '').replace('{replace}', replaceReplace || '');
        }
        customColumns.push(alias ? `${formattedCol} AS [${alias}]` : formattedCol);
      }
    } else if (node.type === 'distinctNode') {
      if (node.data.isDistinct) isDistinct = true;
    }

    queue.push(...getDownstream(node.id));
  }

  const selectColumns = customColumns.length > 0 ? customColumns : (allColumns.length > 0 ? allColumns : ['*']);
  const distinctClause = isDistinct ? 'DISTINCT ' : '';
  
  let sql = `SELECT ${distinctClause}${topClause}${selectColumns.join(', ')}\nFROM ${formatId(selectedTable)}`;

  if (joins.length > 0) sql += '\n' + joins.join('\n');
  if (wheres.length > 0) sql += '\nWHERE ' + wheres.join(' AND ');
  if (groupBys.length > 0) sql += '\nGROUP BY ' + groupBys.join(', ');
  if (havings.length > 0) sql += '\nHAVING ' + havings.join(' AND ');
  if (orderBys.length > 0) sql += '\nORDER BY ' + orderBys.join(', ');

  return sql;
}
