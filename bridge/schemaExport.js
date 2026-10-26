/**
 * Read the table/column structure of a connected JTL-Wawi database and shape it
 * like the files in `versions/` (`{ tables: [{ name, columns: [...] }] }`).
 * Shared by the bridge (`POST /api/schema/export`) and `export-local-schema.js`.
 *
 * The query is fixed (no user SQL) and only touches sys.* catalog views.
 */

export const VERSION_RE = /^\d+(\.\d+){1,3}$/;

export const COLUMNS_QUERY = `
SELECT s.name  AS schema_name,
       t.name  AS table_name,
       c.name  AS column_name,
       ty.name AS type_name,
       c.max_length, c.precision, c.scale, c.is_nullable,
       CAST(ep.value AS NVARCHAR(4000)) AS description
FROM sys.tables t
JOIN sys.schemas s  ON s.schema_id = t.schema_id
JOIN sys.columns c  ON c.object_id = t.object_id
JOIN sys.types   ty ON ty.user_type_id = c.system_type_id   -- alias types (sysname) resolve to their base type
LEFT JOIN sys.extended_properties ep
       ON ep.class = 1 AND ep.major_id = c.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
WHERE t.is_ms_shipped = 0
ORDER BY s.name, t.name, c.column_id`;

/** sys.columns row -> "NVARCHAR(100)", "DECIMAL(25, 13)", "DATETIME2(7)", "INT" ... */
export function formatType(row) {
  const t = String(row.type_name).toUpperCase();
  switch (t) {
    case 'NVARCHAR':
    case 'NCHAR':
      return row.max_length === -1 ? `${t}(MAX)` : `${t}(${row.max_length / 2})`; // max_length is in bytes
    case 'VARCHAR':
    case 'CHAR':
    case 'VARBINARY':
    case 'BINARY':
      return row.max_length === -1 ? `${t}(MAX)` : `${t}(${row.max_length})`;
    case 'DECIMAL':
    case 'NUMERIC':
      return `${t}(${row.precision}, ${row.scale})`;
    case 'DATETIME2':
    case 'DATETIMEOFFSET':
      return `${t}(${row.scale})`;
    case 'ROWVERSION':
      return 'TIMESTAMP';
    default:
      return t;
  }
}

/** Flat, ordered query rows -> `{ tables: [{ name: "schema.table", columns: [...] }] }`. */
export function buildSchema(rows) {
  const tables = new Map();
  for (const r of rows) {
    const name = `${r.schema_name}.${r.table_name}`;
    if (!tables.has(name)) tables.set(name, { name, columns: [] });
    tables.get(name).columns.push({
      name: r.column_name,
      type: formatType(r),
      nullable: r.is_nullable === true || r.is_nullable === 1,
      description: r.description ?? '',
    });
  }
  return { tables: [...tables.values()] };
}
