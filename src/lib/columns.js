/**
 * Column helpers for the builder.
 * Columns of a table, as rich option objects, plus a short display label.
 */

/** Columns of a single table, as rich option objects. */
export function tableColumns(schema, tableName) {
  if (!schema?.tables || !tableName) return [];
  const t = schema.tables.find(x => x.name === tableName);
  if (!t) return [];
  return t.columns.map(c => ({
    qualified:   `${tableName}.${c.name}`,
    table:       tableName,
    name:        c.name,
    type:        c.type,
    description: c.description || '',
  }));
}

/** Short, human label for a qualified column: `dbo.tkunde.cKundenNr` → `tkunde · cKundenNr` */
export function shortLabel(qualified) {
  if (!qualified) return '';
  const parts = qualified.split('.');
  const col = parts.pop();
  const tbl = parts.pop() || '';
  return `${tbl} · ${col}`;
}
