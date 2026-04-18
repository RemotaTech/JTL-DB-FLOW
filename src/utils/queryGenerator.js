/**
 * Generates SQL from a ReactFlow node graph.
 *
 * Join model (new): a `joinNode` is a hub that accepts multiple incoming
 * source connections. Its `data.sourceOrder` array lists the source node ids
 * in order (index 0 = base, rest = joined). `data.joins[sourceId]` holds the
 * per-source config `{ joinType, leftCol, rightCol }`.
 */
export function generateSql(nodes, edges) {
  const tableNodes = nodes.filter(n => n.type === 'tableNode');
  if (tableNodes.length === 0) return '';

  const joinNodes = nodes.filter(n => n.type === 'joinNode');

  // Every tableNode that feeds into a joinNode (as any source) is "consumed"
  // by that join and must not be treated as an independent chain root.
  const joinedTableIds = new Set();
  edges.forEach(e => {
    const tgt = nodes.find(n => n.id === e.target);
    if (tgt?.type === 'joinNode') joinedTableIds.add(e.source);
  });

  // Primary join = the join hub whose output is NOT consumed by another
  // joinNode. (In the typical case there is exactly one.)
  const primaryJoin = joinNodes.find(jn =>
    !edges.some(e => {
      if (e.source !== jn.id) return false;
      const t = nodes.find(n => n.id === e.target);
      return t?.type === 'joinNode';
    })
  );

  // ── Helpers ───────────────────────────────────────────────────────────
  const formatId = (idStr) => {
    if (!idStr) return '';
    if (idStr.includes('=')) return idStr;
    return idStr.split('.').map(p => `[${p}]`).join('.');
  };

  // Resolve the base tableNode of a joinNode (recursively through nested joins).
  const findBaseTable = (node) => {
    if (!node) return null;
    if (node.type === 'tableNode') return node;
    if (node.type === 'joinNode') {
      const firstId = (node.data.sourceOrder || [])[0];
      return findBaseTable(nodes.find(n => n.id === firstId));
    }
    return null;
  };

  // ── Pick main / FROM node ─────────────────────────────────────────────
  let mainNode;
  if (primaryJoin) {
    mainNode = findBaseTable(primaryJoin) || tableNodes[0];
  } else {
    mainNode = tableNodes.find(n => !joinedTableIds.has(n.id)) || tableNodes[0];
  }

  const { selectedTable } = mainNode.data;
  if (!selectedTable) return '';
  const topValue  = mainNode.data.top;
  const topClause = topValue ? `TOP ${topValue} ` : '';

  // ── Walk primary join hub → emit JOIN clauses ────────────────────────
  const joinClauses = [];
  const joinedContributors = []; // tableNodes joined in — for their selectedColumns

  const emitJoinsFromHub = (jn) => {
    const order = jn.data.sourceOrder || [];
    const cfgs  = jn.data.joins || {};
    order.forEach((sid, idx) => {
      const sn = nodes.find(n => n.id === sid);
      if (!sn) return;
      if (sn.type === 'joinNode') {
        // Nested join hub: emit its joins first, then continue.
        emitJoinsFromHub(sn);
        return;
      }
      if (sn.type !== 'tableNode') return;
      if (idx === 0) return; // base table — already the FROM
      const cfg = cfgs[sid];
      if (!cfg || !cfg.leftCol || !cfg.rightCol) return;
      const jt = cfg.joinType || 'INNER JOIN';
      joinClauses.push(
        `${jt} ${formatId(sn.data.selectedTable)} ON ${formatId(cfg.leftCol)} = ${formatId(cfg.rightCol)}`
      );
      joinedContributors.push(sn);
    });
  };
  if (primaryJoin) emitJoinsFromHub(primaryJoin);

  // ── Collect columns from main + joined tables ─────────────────────────
  let allColumns = [];
  if (mainNode.data.selectedColumns?.length > 0) {
    allColumns.push(...mainNode.data.selectedColumns.map(c => `${formatId(selectedTable)}.[${c}]`));
  }
  joinedContributors.forEach(tn => {
    if (tn.data.selectedColumns?.length > 0) {
      allColumns.push(...tn.data.selectedColumns.map(c => `${formatId(tn.data.selectedTable)}.[${c}]`));
    }
  });

  // ── BFS downstream from pipeline start ────────────────────────────────
  const startNode = primaryJoin || mainNode;
  const visited = new Set([startNode.id]);
  // Mark every table consumed by a join as visited so the BFS doesn't wander
  // into those chains independently.
  joinedTableIds.forEach(tid => visited.add(tid));
  // Mark all joinNodes as visited too (handled above).
  joinNodes.forEach(jn => visited.add(jn.id));

  const getDownstream = (nodeId) =>
    edges
      .filter(e => e.source === nodeId)
      .map(e => nodes.find(n => n.id === e.target))
      .filter(Boolean);

  const queue = [...getDownstream(startNode.id)];

  const wheres   = [];
  const groupBys = [];
  const havings  = [];
  const orderBys = [];
  let   isDistinct = false;
  const customColumns = [];

  while (queue.length > 0) {
    const node = queue.shift();
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    if (node.type === 'tableNode') {
      // Standalone downstream table (legacy multi-source SELECT pattern).
      if (node.data.selectedColumns?.length > 0) {
        allColumns.push(
          ...node.data.selectedColumns.map(c => `${formatId(node.data.selectedTable)}.[${c}]`)
        );
      }
    } else if (node.type === 'whereNode') {
      if (node.data.condition) {
        // New format carries bracketed identifiers already.
        if (node.data.condition.includes('[')) {
          wheres.push(node.data.condition);
        } else {
          // Legacy single bare condition → apply formatId to the column part.
          const parts = node.data.condition.split(' ');
          if (parts.length >= 3) {
            const col = formatId(parts[0]);
            const op  = parts[1];
            const val = parts.slice(2).join(' ');
            wheres.push(`${col} ${op} ${val}`);
          } else {
            wheres.push(node.data.condition);
          }
        }
      }
    } else if (node.type === 'groupByNode') {
      if (node.data.groupBy) {
        const formattedGroups = node.data.groupBy.split(', ').map(g => formatId(g)).join(', ');
        groupBys.push(formattedGroups);
      }
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
          formattedCol = formattedCol
            .replace('{find}', replaceFind || '')
            .replace('{replace}', replaceReplace || '');
        }
        customColumns.push(alias ? `${formattedCol} AS [${alias}]` : formattedCol);
      }
    } else if (node.type === 'distinctNode') {
      if (node.data.isDistinct) isDistinct = true;
    }

    queue.push(...getDownstream(node.id));
  }

  // ── Assemble ──────────────────────────────────────────────────────────
  const selectColumns =
    customColumns.length > 0 ? customColumns : (allColumns.length > 0 ? allColumns : ['*']);
  const distinctClause = isDistinct ? 'DISTINCT ' : '';

  let sql = `SELECT ${distinctClause}${topClause}${selectColumns.join(', ')}\nFROM ${formatId(selectedTable)}`;
  if (joinClauses.length > 0) sql += '\n' + joinClauses.join('\n');
  if (wheres.length   > 0)    sql += '\nWHERE '    + wheres.map(w => w.includes('\n') ? `(${w})` : w).join(' AND ');
  if (groupBys.length > 0)    sql += '\nGROUP BY ' + groupBys.join(', ');
  if (havings.length  > 0)    sql += '\nHAVING '   + havings.join(' AND ');
  if (orderBys.length > 0)    sql += '\nORDER BY ' + orderBys.join(', ');

  return sql;
}
