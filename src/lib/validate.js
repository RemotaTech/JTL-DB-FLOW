/**
 * Flow validation + sanitisation — shared by the hub server (on publish) and
 * the frontend (on import / restore from storage).
 *
 * A flow is `{ steps: Step[], vars?: Var[] }`. Steps are user-authored data
 * that ends up in generated T-SQL, so every string that becomes an identifier
 * or a literal is bounded and shape-checked here. The bridge's SELECT-only
 * gate is the second line of defence; this is the first.
 *
 * Pure JS, no DOM / Node APIs — safe to import from both sides.
 */

export const STEP_TYPES = ['source', 'join', 'filter', 'group', 'sort', 'columns', 'format'];
export const JOIN_KINDS = ['inner', 'left', 'right'];
export const OPS        = ['=', '≠', '>', '<', '≥', '≤', 'enthält'];
export const AGGS       = ['Anzahl', 'Summe', 'Durchschnitt', 'Minimum', 'Maximum'];

export const LIMITS = {
  steps:      40,
  conditions: 20,
  groupBy:    20,
  metrics:    20,
  columns:    200,
  formatItems: 40,
  rules:      20,
  vars:       30,
  identifier: 200,   // `schema.table.column`
  literal:    500,   // filter / then / else values
  alias:      80,
  varName:    40,
  varValue:   300,
  varLabel:   80,
  flowBytes:  256 * 1024,
};

// `schema.tTable` / `schema.tTable.col` / alias — letters, digits, _ and dots,
// German umlauts allowed for aliases that reference group outputs.
const IDENT_RE = /^[\p{L}\p{N}_ .\-#%()]+$/u;
// Variable names are strict: `@name` tokens must be unambiguous in the UI.
const VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

// Anything that could smuggle a second statement or a comment through a
// variable value (which is spliced into SQL verbatim).
const VAR_VALUE_BAD = /;|--|\/\*|\*\/|\b(EXEC|EXECUTE|INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|MERGE|GRANT|REVOKE|CREATE|INTO|WAITFOR|SHUTDOWN|BACKUP|RESTORE|RECONFIGURE|DBCC|BULK|KILL|DENY|OPENROWSET|OPENQUERY|OPENDATASOURCE|xp_\w+|sp_\w+)\b/i;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str   = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const ident = (v) => { const s = str(v, LIMITS.identifier).trim(); return s && IDENT_RE.test(s) ? s : ''; };
const lit   = (v) => (typeof v === 'number' ? String(v) : str(v, LIMITS.literal));
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const arr   = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

function cond(c) {
  if (!isObj(c)) return null;
  return { field: ident(c.field), op: oneOf(c.op, OPS, '='), value: lit(c.value) };
}

function formatRule(r) {
  if (!isObj(r)) return null;
  return {
    conds: arr(r.conds, LIMITS.conditions).map(cond).filter(Boolean),
    join:  r.join === 'ODER' ? 'ODER' : 'UND',
    then:  lit(r.then),
  };
}

function formatItem(it, id) {
  if (!isObj(it)) return null;
  return {
    id,
    field:     ident(it.field),
    as:        str(it.as, LIMITS.alias),
    rules:     arr(it.rules, LIMITS.rules).map(formatRule).filter(Boolean),
    otherwise: lit(it.otherwise),
  };
}

/**
 * Sanitise one step. Returns `null` for unknown/malformed steps.
 * `nextId` must return a fresh, unique id — ids from foreign flows are never
 * trusted (they collide with locally generated ones).
 */
export function sanitizeStep(s, nextId) {
  if (!isObj(s) || !STEP_TYPES.includes(s.type)) return null;
  const base = { id: nextId(), type: s.type };
  switch (s.type) {
    case 'source':
      return { ...base, table: ident(s.table) };
    case 'join':
      return { ...base, table: ident(s.table), fromCol: ident(s.fromCol), toCol: ident(s.toCol), kind: oneOf(s.kind, JOIN_KINDS, 'inner') };
    case 'filter':
      return { ...base, conditions: arr(s.conditions, LIMITS.conditions).map(cond).filter(Boolean) };
    case 'group':
      return {
        ...base,
        by:      arr(s.by, LIMITS.groupBy).map(ident).filter(Boolean),
        metrics: arr(s.metrics, LIMITS.metrics).filter(isObj).map(m => ({ agg: oneOf(m.agg, AGGS, 'Anzahl'), field: ident(m.field), as: str(m.as, LIMITS.alias) })),
      };
    case 'sort':
      return { ...base, by: ident(s.by), dir: s.dir === 'asc' ? 'asc' : 'desc' };
    case 'columns':
      return { ...base, visible: arr(s.visible, LIMITS.columns).map(ident).filter(Boolean) };
    case 'format':
      return { ...base, items: arr(s.items, LIMITS.formatItems).map(it => formatItem(it, nextId())).filter(Boolean) };
    default:
      return null;
  }
}

/** Sanitise a variable. Values that could break out of a single SELECT are dropped. */
export function sanitizeVar(v, nextId) {
  if (!isObj(v)) return null;
  const name = str(v.name, LIMITS.varName).trim();
  if (!VAR_NAME_RE.test(name)) return null;
  const value = str(v.value, LIMITS.varValue).trim();
  if (VAR_VALUE_BAD.test(value)) return null;
  return { id: nextId(), name, value, label: str(v.label, LIMITS.varLabel) };
}

/**
 * Sanitise a whole flow. Always returns `{ steps, vars }`; throws nothing.
 * Unknown steps are dropped, duplicate single-instance steps are collapsed to
 * the first occurrence, the source step is forced to position 0, and the
 * format step (if any) to the end — the invariants the builder relies on.
 */
export function sanitizeFlow(flow, nextId = defaultId()) {
  const raw = isObj(flow) ? flow : {};
  const seen = new Set();
  const steps = [];
  for (const s of arr(raw.steps, LIMITS.steps)) {
    const clean = sanitizeStep(s, nextId);
    if (!clean) continue;
    if (clean.type !== 'join') {
      if (seen.has(clean.type)) continue;
      seen.add(clean.type);
    }
    steps.push(clean);
  }
  const src = steps.filter(s => s.type === 'source');
  const fmt = steps.filter(s => s.type === 'format');
  const mid = steps.filter(s => s.type !== 'source' && s.type !== 'format');
  const ordered = [...src, ...mid, ...fmt];

  const names = new Set();
  const vars = [];
  for (const v of arr(raw.vars, LIMITS.vars)) {
    const clean = sanitizeVar(v, nextId);
    if (!clean || names.has(clean.name)) continue;
    names.add(clean.name);
    vars.push(clean);
  }
  return { steps: ordered, vars };
}

/** True when the flow has a usable source table (the minimum to publish/run). */
export function hasSource(flow) {
  return !!(flow?.steps || []).find(s => s?.type === 'source' && s.table);
}

/** Byte size guard for JSON payloads (hub publish). */
export function flowTooLarge(flow) {
  try { return JSON.stringify(flow).length > LIMITS.flowBytes; } catch { return true; }
}

function defaultId() {
  let n = 0;
  const tag = Math.random().toString(36).slice(2, 6);
  return () => `s${tag}${(++n).toString(36)}`;
}
