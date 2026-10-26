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
import { OPS, AGGS } from './validate.js';

/** Hard row cap baked into every generated query (`SELECT TOP n`). */
export const ROW_LIMIT = 100;

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
export const OPERATORS = OPS;
const OP_SQL = { '=': '=', '≠': '<>', '>': '>', '<': '<', '≥': '>=', '≤': '<=', 'enthält': 'LIKE' };

// Plain-German operator labels for the non-technical builder UI.
export const OP_LABEL = { '=': 'ist gleich', '≠': 'ist nicht', '>': 'größer als', '<': 'kleiner als', '≥': 'mindestens', '≤': 'höchstens', 'enthält': 'enthält' };

export const AGGREGATES = AGGS;
const AGG_SQL = { Anzahl: 'COUNT', Summe: 'SUM', Durchschnitt: 'AVG', Minimum: 'MIN', Maximum: 'MAX' };

// ─── IDs + step factory ─────────────────────────────────────────────────────
// Ids must be unique across *sessions* and *machines*: steps are persisted to
// localStorage and imported from the hub, so a plain counter collides (two
// cards sharing `s101` → one patch edits both). Random suffix fixes that.
let _seq = 0;
export const uid = () => `s${Date.now().toString(36)}${(++_seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Re-id every step (and nested format items) of a foreign pipeline. */
export function reidSteps(steps) {
  return (steps || []).map(s => {
    const n = { ...s, id: uid() };
    if (s.type === 'format') n.items = (s.items || []).map(it => ({ ...it, id: uid() }));
    return n;
  });
}

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

/** Bracket-quote one identifier part; `]` is the only char that needs escaping in T-SQL brackets. */
const br = (p) => `[${String(p).replace(/]/g, ']]')}]`;

/** Bracket-quote a qualified identifier: `schema.tTable.col` → `[schema].[tTable].[col]` */
function fmtId(id) {
  if (!id) return '';
  return String(id).split('.').map(br).join('.');
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
    return item.field ? `${fmtId(item.field)} AS ${br(alias)}` : null;
  }
  const whens = rules.map(r => {
    const joiner = r.join === 'ODER' ? ' OR ' : ' AND ';
    const preds = (r.conds || []).filter(c => c.field)
      .map(c => `${fmtId(c.field)} ${OP_SQL[c.op] || c.op} ${resolveValue(c.value, c.op, vars)}`);
    const cond = preds.length > 1 ? `(${preds.join(joiner)})` : preds[0];
    return `WHEN ${cond} THEN ${outputLiteral(r.then, vars)}`;
  });
  const elsePart = (item.otherwise != null && String(item.otherwise) !== '') ? ` ELSE ${outputLiteral(item.otherwise, vars)}` : '';
  return `CASE ${whens.join(' ')}${elsePart} END AS ${br(alias)}`;
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
  const colExpr = (c) => (c.includes('.') ? fmtId(c) : br(c));
  const select = [];
  if (group) {
    (group.by || []).forEach(b => select.push('  ' + fmtId(b)));
    (group.metrics || []).forEach(m => {
      const inner = m.field ? fmtId(m.field) : '*';
      select.push(`  ${AGG_SQL[m.agg] || 'COUNT'}(${inner}) AS ${br(m.as || m.agg)}`);
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

    const emit = (c) => select.push('  ' + (renames.has(c) ? `${colExpr(c)} AS ${br(renames.get(c))}` : colExpr(c)));
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

  let sql = `SELECT TOP ${ROW_LIMIT}\n` + select.join(',\n');
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
    const col = s.by.includes('.') ? fmtId(s.by) : br(s.by);
    orderParts.push(`${col} ${(s.dir || 'desc').toUpperCase()}`);
  });
  if (orderParts.length) sql += '\nORDER BY ' + orderParts.join(', ');

  return sql + ';';
}

// ─── Step completeness ──────────────────────────────────────────────────────
// Incomplete steps are silently skipped by stepsToSql; the builder surfaces
// them instead so a merchant knows *why* a filter had no effect.

/** Plain-German problems with one step, or `[]` when it is complete. */
export function stepIssues(step, steps = [], schema = null) {
  const out = [];
  const known = schema?.tables ? new Set(availableFields(schema, steps).map(f => f.value)) : null;
  const fieldOk = (f) => !!f && (!known || known.has(f) || !f.includes('.'));
  switch (step.type) {
    case 'source':
      if (!step.table) out.push('Tabelle wählen');
      else if (schema?.tables && !schema.tables.some(t => t.name === step.table)) out.push(`Tabelle „${step.table}“ nicht im Schema`);
      break;
    case 'join':
      if (!step.table) out.push('Tabelle wählen');
      else if (!step.fromCol || !step.toCol) out.push('Schlüssel wählen');
      break;
    case 'filter': {
      const conds = step.conditions || [];
      if (!conds.length) out.push('Bedingung hinzufügen');
      conds.forEach((c, i) => {
        if (!c.field) out.push(`Bedingung ${i + 1}: Feld wählen`);
        else if (!fieldOk(c.field)) out.push(`Bedingung ${i + 1}: Feld nicht verfügbar`);
        else if (String(c.value ?? '') === '') out.push(`Bedingung ${i + 1}: Wert eingeben`);
      });
      break;
    }
    case 'group': {
      const metrics = step.metrics || [];
      if (!(step.by || []).length && !metrics.length) out.push('Feld oder Kennzahl wählen');
      metrics.forEach((m, i) => {
        if (m.agg !== 'Anzahl' && !m.field) out.push(`Kennzahl ${i + 1}: Feld wählen`);
        if (!(m.as || '').trim()) out.push(`Kennzahl ${i + 1}: Name vergeben`);
      });
      break;
    }
    case 'sort':
      if (!step.by) out.push('Feld wählen');
      break;
    case 'format':
      (step.items || []).forEach((it, i) => {
        const hasRules = (it.rules || []).length > 0;
        if (!hasRules && !it.field) out.push(`Spalte ${i + 1}: Feld wählen`);
        if (hasRules && !(it.as || '').trim()) out.push(`Spalte ${i + 1}: Spaltenname vergeben`);
        (it.rules || []).forEach((r, ri) => {
          if (!(r.conds || []).some(c => c.field)) out.push(`Spalte ${i + 1}, Regel ${ri + 1}: Feld wählen`);
        });
      });
      break;
    default:
      break;
  }
  return out;
}

/** Total issue count across the pipeline (for the run button / header). */
export function pipelineIssues(steps = [], schema = null) {
  return steps.reduce((n, s) => n + stepIssues(s, steps, schema).length, 0);
}
