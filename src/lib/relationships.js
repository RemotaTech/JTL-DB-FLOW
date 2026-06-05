/**
 * JTL foreign-key inference from naming convention.
 *
 * JTL-Wawi schema is ruthlessly consistent:
 *   - Table  <schema>.t<Name>   has primary key  k<Name>
 *   - A column k<X> (other than the table's own PK) is a foreign key that
 *     references table t<X> on its primary key k<X>.
 *
 * Example:
 *   Verkauf.tAuftrag has column kKunde  →  joins dbo.tkunde ON kKunde = kKunde
 *
 * There is no explicit FK metadata in schema.json, so we derive the whole
 * relationship graph from column names. This is what makes "pick a related
 * table and the join builds itself" possible.
 */

/** Strip schema prefix + leading `t`, lowercased. `Verkauf.tAuftrag` → `auftrag` */
function baseName(tableName) {
  const bare = tableName.includes('.') ? tableName.split('.').pop() : tableName;
  return bare.replace(/^t/i, '').toLowerCase();
}

/** A column is a key column if it looks like `k<Something>`. */
function isKeyColumn(col) {
  return /^k[A-Z]/.test(col);
}

/** The key column a table is keyed on, by convention: `k` + base name. */
function pkColumnFor(tableName) {
  const bare = tableName.includes('.') ? tableName.split('.').pop() : tableName;
  const name = bare.replace(/^t/i, '');
  return 'k' + name; // e.g. tAuftrag → kAuftrag
}

/**
 * Build a lookup from a key column name (e.g. "kKunde") to the table it
 * identifies (e.g. "dbo.tkunde"), using the base-name convention.
 */
function buildKeyToTable(schema) {
  const map = new Map(); // base name (lowercase) → full table name
  for (const t of schema.tables) {
    map.set(baseName(t.name), t.name);
  }
  return map;
}

/**
 * Return all inferred relationships in the schema.
 *
 * @returns {Array<{from, fromCol, to, toCol}>}
 */
export function inferRelationships(schema) {
  if (!schema?.tables) return [];
  const keyToTable = buildKeyToTable(schema);
  const rels = [];

  for (const t of schema.tables) {
    const ownPk = pkColumnFor(t.name).toLowerCase();
    for (const col of t.columns) {
      if (!isKeyColumn(col.name)) continue;
      if (col.name.toLowerCase() === ownPk) continue; // own PK, not an FK

      // FK column kX → target base name "x"
      const targetBase = col.name.slice(1).toLowerCase();
      const targetTable = keyToTable.get(targetBase);
      if (!targetTable || targetTable === t.name) continue;

      rels.push({
        from:    t.name,
        fromCol: `${t.name}.${col.name}`,
        to:      targetTable,
        toCol:   `${targetTable}.${col.name}`, // FK col name == target PK name
      });
    }
  }
  return rels;
}

/**
 * Tables reachable (joinable) from a given table, in BOTH directions:
 *   - tables this table points to (its FK columns)
 *   - tables that point back to this table (reverse FKs)
 *
 * @returns {Array<{table, fromCol, toCol, direction}>}
 *          `table` is the related table name; from/to cols are the join keys.
 */
export function relatedTables(schema, tableName, alreadyJoined = []) {
  if (!schema?.tables || !tableName) return [];
  const rels = inferRelationships(schema);
  const joined = new Set(alreadyJoined);
  const out = [];
  const seen = new Set();

  for (const r of rels) {
    let rel = null;
    if (r.from === tableName && r.to !== tableName) {
      rel = { table: r.to, fromCol: r.fromCol, toCol: r.toCol, direction: 'out' };
    } else if (r.to === tableName && r.from !== tableName) {
      rel = { table: r.from, fromCol: r.toCol, toCol: r.fromCol, direction: 'in' };
    }
    if (!rel) continue;
    if (joined.has(rel.table)) continue;
    const dedupeKey = `${rel.table}|${rel.fromCol}|${rel.toCol}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(rel);
  }
  return out;
}

/**
 * Outgoing joins from a table: every `k<X>` foreign-key column it carries that
 * points to an existing table `t<X>`. This is the clean "what can I join from
 * here" set — driven purely by the table's key columns (no noisy reverse
 * fan-out of every child table that references this one).
 *
 * One entry PER FK column (not per target) — a table may reach the same target
 * through several key columns, and the caller decides how to present that.
 *
 * @returns {Array<{table, fromCol, toCol, via}>}
 */
export function outgoingJoins(schema, tableName, exclude = []) {
  if (!schema?.tables || !tableName) return [];
  const t = schema.tables.find(x => x.name === tableName);
  if (!t) return [];
  const keyToTable = buildKeyToTable(schema);
  const ownPk = pkColumnFor(tableName).toLowerCase();
  const ex = new Set(exclude);
  const out = [];

  for (const col of t.columns) {
    if (!isKeyColumn(col.name)) continue;
    if (col.name.toLowerCase() === ownPk) continue; // own PK, not an FK

    const targetBase = col.name.slice(1).toLowerCase();
    const target = keyToTable.get(targetBase);
    if (!target || target === tableName) continue;
    if (ex.has(target)) continue;

    out.push({
      table:   target,
      fromCol: `${tableName}.${col.name}`,
      toCol:   `${target}.${col.name}`,
      via:     col.name,
    });
  }
  return out;
}

/**
 * Find a direct join path between two specific tables (if one exists).
 * Returns { fromCol, toCol } oriented so fromCol belongs to `fromTable`.
 */
export function findJoin(schema, fromTable, toTable) {
  const rels = inferRelationships(schema);
  for (const r of rels) {
    if (r.from === fromTable && r.to === toTable) {
      return { fromCol: r.fromCol, toCol: r.toCol };
    }
    if (r.from === toTable && r.to === fromTable) {
      return { fromCol: r.toCol, toCol: r.fromCol };
    }
  }
  return null;
}

export { baseName, pkColumnFor };
