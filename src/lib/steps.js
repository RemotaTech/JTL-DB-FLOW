/**
 * Step model — the ordered, linear "notebook" pipeline that powers the builder.
 *
 * A report is an ordered array of typed steps that reads top-to-bottom like a
 * sentence:  Quelle → Verknüpfung → Filter → Gruppierung → Sortierung → Spalten.
 * SQL is itself a linear pipeline, so we model it directly (no 2D graph).
 *
 * Step shapes:
 *   { type:'source',  table }
 *   { type:'join',    table, fromCol, toCol, kind:'inner'|'left'|'right' }
 *   { type:'filter',  conditions:[{ field, op, value }] }
 *   { type:'group',   by:[qualified], metrics:[{ agg, field, as }] }
 *   { type:'sort',    by, dir:'asc'|'desc' }
 *   { type:'columns', visible:[qualified|alias] }
 *
 * All identifiers are schema-qualified (e.g. `Verkauf.tAuftrag.kKunde`) so the
 * generated T-SQL is unambiguous across the multi-schema JTL database.
 */
import { tableColumns } from './columns.js';

// ─── Per-step metadata (color-coded, German labels) ────────────────────────
export const STEP_META = {
  source:  { label: 'Quelle',       color: '#3b82f6', icon: 'database' },
  join:    { label: 'Verknüpfung',  color: '#a855f7', icon: 'merge'    },
  filter:  { label: 'Filter',       color: '#f59e0b', icon: 'filter'   },
  group:   { label: 'Gruppierung',  color: '#f43f5e', icon: 'layers'   },
  sort:    { label: 'Sortierung',   color: '#06b6d4', icon: 'sort'     },
  columns: { label: 'Spalten',      color: '#10b981', icon: 'columns'  },
  format:  { label: 'Formatierung', color: '#ec4899', icon: 'pencil'   },
};

// Steps the user can append/insert (source is implicit / always first).
export const ADDABLE = ['join', 'filter', 'group', 'sort', 'columns', 'format'];

// ─── Operators + aggregates ─────────────────────────────────────────────────
export const OPERATORS = ['=', '≠', '>', '<', '≥', '≤', 'enthält'];
const OP_SQL = { '=': '=', '≠': '<>', '>': '>', '<': '<', '≥': '>=', '≤': '<=', 'enthält': 'LIKE' };

// Plain-German operator labels for the non-technical builder UI.
export const OP_LABEL = { '=': 'ist gleich', '≠': 'ist nicht', '>': 'größer als', '<': 'kleiner als', '≥': 'mindestens', '≤': 'höchstens', 'enthält': 'enthält' };

export const AGGREGATES = ['Anzahl', 'Summe', 'Durchschnitt', 'Minimum', 'Maximum'];
const AGG_SQL = { Anzahl: 'COUNT', Summe: 'SUM', Durchschnitt: 'AVG', Minimum: 'MIN', Maximum: 'MAX' };

// ─── IDs + step factory ─────────────────────────────────────────────────────
let _id = 100;
export const uid = () => `s${++_id}`;

export function newStep(type) {
  const base = { id: uid(), type };
  if (type === 'join')    return { ...base, table: null, fromCol: null, toCol: null, kind: 'inner' };
  if (type === 'filter')  return { ...base, conditions: [{ field: '', op: '=', value: '' }] };
  if (type === 'group')   return { ...base, by: [], metrics: [{ agg: 'Anzahl', field: '', as: 'Anzahl' }] };
  if (type === 'sort')    return { ...base, by: '', dir: 'desc' };
  if (type === 'columns') return { ...base, visible: [] };
  if (type === 'format')  return { ...base, items: [newFormatItem()] };
  return base; // source — table assigned by caller
}

/** A single Formatierung output column: rename a field and/or compute via rules. */
export function newFormatItem() {
  return { id: uid(), field: '', as: '', rules: [], otherwise: '' };
}
/** A single Wenn-Dann rule → one CASE WHEN branch. */
export function newFormatRule() {
  return { conds: [{ field: '', op: '=', value: '' }], join: 'UND', then: '' };
}

// ─── Derived helpers ────────────────────────────────────────────────────────

/** All tables in the pipeline, in order (source first, then joins). */
export function stepsTables(steps) {
  const out = [];
  const src = steps.find(s => s.type === 'source');
  if (src && src.table) out.push(src.table);
  steps.filter(s => s.type === 'join' && s.table).forEach(j => out.push(j.table));
  return out;
}

/** Every selectable field across all tables currently in the pipeline. */
export function availableFields(schema, steps) {
  return stepsTables(steps).flatMap(t =>
    tableColumns(schema, t).map(c => ({
      value: c.qualified,
      field: c.name,
      table: t,
      type:  c.type,
    }))
  );
}

/** Output names available after a GROUP BY (group keys + metric aliases). */
export function groupOutputs(group) {
  if (!group) return [];
  const out = [];
  (group.by || []).forEach(b => out.push({ value: b, label: b.split('.').pop() }));
  (group.metrics || []).forEach(m => out.push({ value: m.as, label: m.as, alias: true }));
  return out;
}

// ─── SQL generation ─────────────────────────────────────────────────────────

/** Bracket-quote a qualified identifier: `schema.tTable.col` → `[schema].[tTable].[col]` */
function fmtId(id) {
  if (!id) return '';
  return String(id).split('.').map(p => `[${p}]`).join('.');
}

const isNumeric = (v) => v !== '' && v != null && !isNaN(Number(v));

/** Resolve a filter value to raw SQL, honoring @variables and operator. */
function resolveValue(value, op, vars) {
  // @variable token → raw SQL expression from the variables list
  if (typeof value === 'string' && value.startsWith('@')) {
    const v = (vars || []).find(x => '@' + x.name === value);
    return v ? v.value : value;
  }
  const str = String(value ?? '');
  // LIKE / "enthält" → wrap with wildcards
  if (op === 'enthält' || OP_SQL[op] === 'LIKE') {
    return `'%${str.replace(/'/g, "''")}%'`;
  }
  // qualified column reference (compare column to column): `Verkauf.tAuftrag.kKunde`
  if (/^[A-Za-z_]+\.[A-Za-z_]+\.[A-Za-z_]/.test(str)) {
    return fmtId(str);
  }
  if (isNumeric(str)) return String(Number(str));
  return `'${str.replace(/'/g, "''")}'`;
}

/** Resolve a Formatierung output value (THEN/ELSE) to SQL: @var, number or string. */
function outputLiteral(value, vars) {
  if (typeof value === 'string' && value.startsWith('@')) {
    const v = (vars || []).find(x => '@' + x.name === value);
    return v ? v.value : `'${value.replace(/'/g, "''")}'`;
  }
  const str = String(value ?? '');
  if (str === '') return "''";
  if (isNumeric(str)) return String(Number(str));
  return `'${str.replace(/'/g, "''")}'`;
}

/** One Formatierung column → a SELECT expression (rename or CASE), or null. */
function formatItemSql(item, vars) {
  const alias = (item.as && item.as.trim()) || (item.field ? String(item.field).split('.').pop() : 'Spalte');
  const rules = (item.rules || []).filter(r => (r.conds || []).some(c => c.field));
  if (rules.length === 0) {
    return item.field ? `${fmtId(item.field)} AS [${alias}]` : null;
  }
  const whens = rules.map(r => {
    const joiner = r.join === 'ODER' ? ' OR ' : ' AND ';
    const preds = (r.conds || []).filter(c => c.field)
      .map(c => `${fmtId(c.field)} ${OP_SQL[c.op] || c.op} ${resolveValue(c.value, c.op, vars)}`);
    const cond = preds.length > 1 ? `(${preds.join(joiner)})` : preds[0];
    return `WHEN ${cond} THEN ${outputLiteral(r.then, vars)}`;
  });
  const elsePart = (item.otherwise != null && String(item.otherwise) !== '') ? ` ELSE ${outputLiteral(item.otherwise, vars)}` : '';
  return `CASE ${whens.join(' ')}${elsePart} END AS [${alias}]`;
}

/**
 * Generate T-SQL from the step pipeline.
 * @param {Array} steps
 * @param {Array} vars  - [{ name, value }]
 */
export function stepsToSql(steps, vars = [], schema = null) {
  const src = steps.find(s => s.type === 'source');
  if (!src || !src.table) return '';

  const joins   = steps.filter(s => s.type === 'join');
  const filters = steps.filter(s => s.type === 'filter');
  const group   = steps.find(s => s.type === 'group');
  const sorts   = steps.filter(s => s.type === 'sort');
  const colsStep = steps.find(s => s.type === 'columns');
  const fmtStep = steps.find(s => s.type === 'format');

  // SELECT list. Spalten picks the columns (or all if none); Formatierung — the
  // last step — renames those columns and/or appends computed Wenn-Dann columns.
  // Aggregation (Gruppierung) defines its own output and takes precedence.
  const colExpr = (c) => (c.includes('.') ? fmtId(c) : `[${c}]`);
  const select = [];
  if (group) {
    (group.by || []).forEach(b => select.push('  ' + fmtId(b)));
    (group.metrics || []).forEach(m => {
      const inner = m.field ? fmtId(m.field) : '*';
      select.push(`  ${AGG_SQL[m.agg] || 'COUNT'}(${inner}) AS [${m.as || m.agg}]`);
    });
  } else {
    // base columns = Spalten selection, or null = "all"
    const baseCols = (colsStep && (colsStep.visible || []).length) ? colsStep.visible : null;

    // split Formatierung items into renames (field → alias) and computed CASE columns
    const renames = new Map();
    const computed = [];
    (fmtStep?.items || []).forEach(it => {
      const hasRules = (it.rules || []).some(r => (r.conds || []).some(c => c.field));
      if (hasRules) { const e = formatItemSql(it, vars); if (e) computed.push(e); }
      else if (it.field && it.as && it.as.trim()) renames.set(it.field, it.as.trim());
    });

    const emit = (c) => select.push('  ' + (renames.has(c) ? `${colExpr(c)} AS [${renames.get(c)}]` : colExpr(c)));
    if (baseCols) {
      baseCols.forEach(emit);
    } else if (renames.size && schema) {
      // no Spalten but renames exist → enumerate all fields so aliases apply
      availableFields(schema, steps).forEach(f => emit(f.value));
    } else {
      select.push('  *');
    }
    computed.forEach(e => select.push('  ' + e));
  }
  if (!select.length) select.push('  *');

  let sql = 'SELECT TOP 100\n' + select.join(',\n');
  sql += `\nFROM ${fmtId(src.table)}`;

  // JOINs
  joins.forEach(j => {
    if (!j.table || !j.fromCol || !j.toCol) return;
    const kind = (j.kind || 'inner').toUpperCase();
    sql += `\n${kind} JOIN ${fmtId(j.table)}\n  ON ${fmtId(j.fromCol)} = ${fmtId(j.toCol)}`;
  });

  // WHERE
  const conds = [];
  filters.forEach(f => (f.conditions || []).forEach(c => {
    if (!c.field) return;
    const op = OP_SQL[c.op] || c.op;
    conds.push(`${fmtId(c.field)} ${op} ${resolveValue(c.value, c.op, vars)}`);
  }));
  if (conds.length) sql += '\nWHERE\n  ' + conds.join('\n  AND ');

  // GROUP BY
  if (group && (group.by || []).length) {
    sql += '\nGROUP BY\n  ' + group.by.map(fmtId).join(',\n  ');
  }

  // ORDER BY
  const orderParts = [];
  sorts.forEach(s => {
    if (!s.by) return;
    const col = s.by.includes('.') ? fmtId(s.by) : `[${s.by}]`;
    orderParts.push(`${col} ${(s.dir || 'desc').toUpperCase()}`);
  });
  if (orderParts.length) sql += '\nORDER BY ' + orderParts.join(', ');

  return sql + ';';
}
