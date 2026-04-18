import React, { memo, useMemo, useEffect } from 'react';
import { Handle, Position, useNodes, useEdges } from 'reactflow';
import { Filter, Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useRefs, resolveRef, isRef } from '../lib/refs';
import RefFieldWrapper from '../components/RefFieldWrapper';

// ─── Type helpers ──────────────────────────────────────────────────────────

/**
 * Map SQL column type to broad category used for UI + SQL build.
 */
function getTypeCategory(sqlType) {
  const t = (sqlType || '').toUpperCase();
  if (
    t.startsWith('DATETIME') || t === 'DATE' || t === 'SMALLDATETIME' ||
    t === 'TIME' || t === 'DATETIMEOFFSET'
  ) return 'date';
  if (t === 'BIT') return 'bit';
  if (
    t.startsWith('INT') || t === 'BIGINT' || t === 'SMALLINT' || t === 'TINYINT' ||
    t.startsWith('DECIMAL') || t.startsWith('NUMERIC') || t.startsWith('FLOAT') ||
    t.startsWith('MONEY') || t.startsWith('SMALLMONEY') || t === 'REAL'
  ) return 'number';
  return 'text';
}

// ─── Operator catalog (user-friendly German) ───────────────────────────────

/**
 * Every operator defined once. Key = stable internal id, label = German UI text,
 * hint = short helper, needsValue = shows value input, needsValue2 = second input (BETWEEN).
 */
const OPERATORS = {
  eq:             { label: 'Ist gleich',           hint: 'Genau dieser Wert',                       needsValue: true  },
  ne:             { label: 'Ist ungleich',         hint: 'Alles außer diesem Wert',                 needsValue: true  },
  lt:             { label: 'Kleiner als',          hint: 'Wert ist kleiner',                        needsValue: true  },
  le:             { label: 'Kleiner oder gleich',  hint: 'Wert ist kleiner oder gleich',            needsValue: true  },
  gt:             { label: 'Größer als',           hint: 'Wert ist größer',                         needsValue: true  },
  ge:             { label: 'Größer oder gleich',   hint: 'Wert ist größer oder gleich',             needsValue: true  },
  between:        { label: 'Zwischen',             hint: 'Wert liegt zwischen zwei Grenzen',        needsValue: true, needsValue2: true },
  notBetween:     { label: 'Nicht zwischen',       hint: 'Wert liegt NICHT zwischen den Grenzen',   needsValue: true, needsValue2: true },
  in:             { label: 'In Liste',             hint: 'Einer der Werte (Komma getrennt)',        needsValue: true  },
  notIn:          { label: 'Nicht in Liste',       hint: 'Keiner der Werte (Komma getrennt)',       needsValue: true  },
  contains:       { label: 'Enthält',              hint: 'Text enthält diese Zeichen',              needsValue: true  },
  notContains:    { label: 'Enthält nicht',        hint: 'Text enthält diese Zeichen NICHT',        needsValue: true  },
  beginsWith:     { label: 'Beginnt mit',          hint: 'Text beginnt mit…',                       needsValue: true  },
  notBeginsWith:  { label: 'Beginnt nicht mit',    hint: 'Text beginnt NICHT mit…',                 needsValue: true  },
  endsWith:       { label: 'Endet mit',            hint: 'Text endet mit…',                         needsValue: true  },
  notEndsWith:    { label: 'Endet nicht mit',      hint: 'Text endet NICHT mit…',                   needsValue: true  },
  isEmpty:        { label: 'Ist leer',             hint: 'Feld ist leer oder hat keinen Wert',      needsValue: false },
  isNotEmpty:     { label: 'Ist nicht leer',       hint: 'Feld hat irgendeinen Wert',               needsValue: false },
  isNull:         { label: 'Ist NULL (kein Wert)', hint: 'Kein Eintrag in der Datenbank',           needsValue: false },
  isNotNull:      { label: 'Hat einen Wert',       hint: 'Irgendein Eintrag ist gesetzt',           needsValue: false },
};

// Operator lists per field category — ordered by likely usage.
const OPERATORS_BY_CAT = {
  text: [
    'eq', 'ne',
    'contains', 'notContains',
    'beginsWith', 'notBeginsWith',
    'endsWith', 'notEndsWith',
    'in', 'notIn',
    'isEmpty', 'isNotEmpty',
    'isNull', 'isNotNull',
  ],
  number: [
    'eq', 'ne',
    'lt', 'le', 'gt', 'ge',
    'between', 'notBetween',
    'in', 'notIn',
    'isNull', 'isNotNull',
  ],
  date: [
    'eq', 'ne',
    'lt', 'le', 'gt', 'ge',
    'between', 'notBetween',
    'isNull', 'isNotNull',
  ],
  bit: ['eq'],
};

// Map legacy raw-SQL ops to new keys (migration for old saved workflows).
const LEGACY_OP_MAP = {
  '=':            'eq',
  '<>':           'ne',
  '<':            'lt',
  '<=':           'le',
  '>':            'gt',
  '>=':           'ge',
  'BETWEEN':      'between',
  'LIKE':         'contains',
  'NOT LIKE':     'notContains',
  'IS NULL':      'isNull',
  'IS NOT NULL':  'isNotNull',
};

const normalizeOp = (op) => OPERATORS[op] ? op : (LEGACY_OP_MAP[op] || 'eq');

const DATE_PLACEHOLDER_BY_TYPE = (sqlType = '') => {
  const t = sqlType.toUpperCase();
  if (t === 'DATE') return 'JJJJ-MM-TT';
  if (t === 'TIME') return 'HH:MM:SS';
  return 'JJJJ-MM-TT HH:MM:SS';
};

// ─── SQL builders ──────────────────────────────────────────────────────────

function fmtCol(col) {
  return col.split('.').map(p => `[${p}]`).join('.');
}

// Escape single quotes in string values (basic SQL hardening).
function escStr(v) {
  return String(v ?? '').replace(/'/g, "''");
}

function quoteForCat(v, cat) {
  if (cat === 'number' || cat === 'bit') return String(v);
  return `'${escStr(v)}'`;
}

// Parse a comma separated IN list, honoring type quoting.
function buildInList(raw, cat) {
  return String(raw || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s !== '')
    .map(s => quoteForCat(s, cat))
    .join(', ');
}

function buildConditionSQL(c, colMeta, refs) {
  if (!c.col) return null;
  const fc  = fmtCol(c.col);
  const cat = colMeta[c.col]?.category || 'text';
  const op  = normalizeOp(c.op);
  const def = OPERATORS[op];
  if (!def) return null;

  // Value-less ops
  if (op === 'isNull')     return `${fc} IS NULL`;
  if (op === 'isNotNull')  return `${fc} IS NOT NULL`;
  if (op === 'isEmpty')    return `(${fc} IS NULL OR ${fc} = '')`;
  if (op === 'isNotEmpty') return `(${fc} IS NOT NULL AND ${fc} <> '')`;

  // Resolve ref tokens to their live values before building SQL.
  const v1 = resolveRef(c.val, refs);
  const v2 = resolveRef(c.val2, refs);

  // No value entered → skip
  if (def.needsValue && (v1 === '' || v1 == null)) return null;
  if (def.needsValue2 && (v2 === '' || v2 == null)) return null;

  switch (op) {
    case 'eq':  return `${fc} = ${quoteForCat(v1, cat)}`;
    case 'ne':  return `${fc} <> ${quoteForCat(v1, cat)}`;
    case 'lt':  return `${fc} < ${quoteForCat(v1, cat)}`;
    case 'le':  return `${fc} <= ${quoteForCat(v1, cat)}`;
    case 'gt':  return `${fc} > ${quoteForCat(v1, cat)}`;
    case 'ge':  return `${fc} >= ${quoteForCat(v1, cat)}`;
    case 'between':
      return `${fc} BETWEEN ${quoteForCat(v1, cat)} AND ${quoteForCat(v2, cat)}`;
    case 'notBetween':
      return `${fc} NOT BETWEEN ${quoteForCat(v1, cat)} AND ${quoteForCat(v2, cat)}`;
    case 'in': {
      const list = buildInList(v1, cat);
      return list ? `${fc} IN (${list})` : null;
    }
    case 'notIn': {
      const list = buildInList(v1, cat);
      return list ? `${fc} NOT IN (${list})` : null;
    }
    case 'contains':      return `${fc} LIKE '%${escStr(v1)}%'`;
    case 'notContains':   return `${fc} NOT LIKE '%${escStr(v1)}%'`;
    case 'beginsWith':    return `${fc} LIKE '${escStr(v1)}%'`;
    case 'notBeginsWith': return `${fc} NOT LIKE '${escStr(v1)}%'`;
    case 'endsWith':      return `${fc} LIKE '%${escStr(v1)}'`;
    case 'notEndsWith':   return `${fc} NOT LIKE '%${escStr(v1)}'`;
    default: return null;
  }
}

function buildWhereString(conditions, colMeta, refs) {
  return conditions
    .map((c, i) => {
      const sql = buildConditionSQL(c, colMeta, refs);
      if (!sql) return null;
      return i === 0 ? sql : `${c.logic || 'AND'} ${sql}`;
    })
    .filter(Boolean)
    .join('\n  ');
}

// ─── Empty condition factory ────────────────────────────────────────────────

const emptyCondition = () => ({
  col:   '',
  op:    'eq',
  val:   '',
  val2:  '',
  logic: 'AND',
});

// ─── Value Input (type-aware) ───────────────────────────────────────────────

function ValueInput({ cat, sqlType, op, val, val2, onChange, onChange2, colLabel }) {
  const def = OPERATORS[op];
  if (!def || !def.needsValue) return null;

  const base = 'px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[11px] text-white/70 focus:outline-none focus:border-amber-500/50 w-full';

  // suggested variable names: "<column>_<role>".
  const sName  = colLabel ? `${colLabel.split('.').pop()}` : 'Wert';
  const sName1 = colLabel ? `${sName}_von` : 'von';
  const sName2 = colLabel ? `${sName}_bis` : 'bis';

  // When a value is bound to a ref we don't want to feed the token into a
  // number/date input (it'd just show as empty). RefFieldWrapper handles the
  // chip rendering when bound; the raw input below is only shown when unbound.
  const safeVal  = isRef(val)  ? '' : (val  ?? '');
  const safeVal2 = isRef(val2) ? '' : (val2 ?? '');

  // Bit fields: always Ja / Nein.
  if (cat === 'bit') {
    return (
      <RefFieldWrapper value={val} onChange={onChange} suggestedName={sName}>
        <select value={safeVal || '1'} onChange={e => onChange(e.target.value)} className={base}>
          <option value="1" className="bg-[#1a1b26]">Ja (1)</option>
          <option value="0" className="bg-[#1a1b26]">Nein (0)</option>
        </select>
      </RefFieldWrapper>
    );
  }

  // IN / NOT IN → comma-separated list.
  if (op === 'in' || op === 'notIn') {
    return (
      <div className="space-y-1">
        <RefFieldWrapper value={val} onChange={onChange} suggestedName={`${sName}_liste`}>
          <input
            type="text"
            placeholder="Wert1, Wert2, Wert3"
            value={safeVal}
            onChange={e => onChange(e.target.value)}
            className={base}
          />
        </RefFieldWrapper>
        <p className="text-[9px] text-amber-400/50">Werte mit Komma trennen</p>
      </div>
    );
  }

  // BETWEEN / NOT BETWEEN → two inputs.
  if (op === 'between' || op === 'notBetween') {
    const inputType = cat === 'number' ? 'number' : 'text';
    const ph1 = cat === 'date' ? DATE_PLACEHOLDER_BY_TYPE(sqlType) : 'Von';
    const ph2 = cat === 'date' ? DATE_PLACEHOLDER_BY_TYPE(sqlType) : 'Bis';
    return (
      <div className="space-y-1">
        <RefFieldWrapper value={val} onChange={onChange} suggestedName={sName1}>
          <input type={inputType} placeholder={ph1} value={safeVal}  onChange={e => onChange(e.target.value)}  className={base} />
        </RefFieldWrapper>
        <div className="text-center text-[10px] text-white/30">bis</div>
        <RefFieldWrapper value={val2} onChange={onChange2} suggestedName={sName2}>
          <input type={inputType} placeholder={ph2} value={safeVal2} onChange={e => onChange2(e.target.value)} className={base} />
        </RefFieldWrapper>
      </div>
    );
  }

  if (cat === 'date') {
    const ph = DATE_PLACEHOLDER_BY_TYPE(sqlType);
    return (
      <div className="space-y-1">
        <RefFieldWrapper value={val} onChange={onChange} suggestedName={sName}>
          <input type="text" placeholder={ph} value={safeVal} onChange={e => onChange(e.target.value)} className={base} />
        </RefFieldWrapper>
        <p className="text-[9px] text-amber-400/40">Format: {ph}</p>
      </div>
    );
  }

  if (cat === 'number') {
    return (
      <RefFieldWrapper value={val} onChange={onChange} suggestedName={sName}>
        <input type="number" placeholder="Zahl" value={safeVal} onChange={e => onChange(e.target.value)} className={base} />
      </RefFieldWrapper>
    );
  }

  // Text: LIKE-family shows preview hint.
  const isLike = ['contains','notContains','beginsWith','notBeginsWith','endsWith','notEndsWith'].includes(op);
  return (
    <div className="space-y-1">
      <RefFieldWrapper value={val} onChange={onChange} suggestedName={sName}>
        <input
          type="text"
          placeholder="Wert eingeben…"
          value={safeVal}
          onChange={e => onChange(e.target.value)}
          className={base}
        />
      </RefFieldWrapper>
      {isLike && !isRef(val) && (
        <p className="text-[9px] text-amber-400/40">
          Sucht nach:{' '}
          <span className="font-mono text-amber-300/70">
            {op === 'contains'      && `*${val || '…'}*`}
            {op === 'notContains'   && `nicht *${val || '…'}*`}
            {op === 'beginsWith'    && `${val || '…'}*`}
            {op === 'notBeginsWith' && `nicht ${val || '…'}*`}
            {op === 'endsWith'      && `*${val || '…'}`}
            {op === 'notEndsWith'   && `nicht *${val || '…'}`}
          </span>
        </p>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export const FilterNode = memo(({ id, data }) => {
  const { filterConditions = [] } = data;
  const nodes = useNodes();
  const edges = useEdges();
  const { refs } = useRefs();

  // ── Collect upstream columns WITH type info ─────────────────────────────
  const { colList, colMeta } = useMemo(() => {
    const upstreamTables = new Set();
    const findUpstream = (nodeId) => {
      edges.filter(e => e.target === nodeId).forEach(edge => {
        const src = nodes.find(n => n.id === edge.source);
        if (!src) return;
        if (src.type === 'tableNode' && src.data.selectedTable)
          upstreamTables.add(src.data.selectedTable);
        if (src.type === 'joinNode') {
          // joinNode aggregates multiple tables — walk its sources
          const order = src.data.sourceOrder || [];
          order.forEach(sid => {
            const sn = nodes.find(n => n.id === sid);
            if (sn?.type === 'tableNode' && sn.data.selectedTable) {
              upstreamTables.add(sn.data.selectedTable);
            }
          });
        }
        findUpstream(src.id);
      });
    };
    findUpstream(id);

    const list = [];
    const meta = {};

    if (data.schema) {
      upstreamTables.forEach(tName => {
        const tSchema = data.schema.tables.find(t => t.name === tName);
        if (!tSchema) return;
        tSchema.columns.forEach(c => {
          const col = `${tName}.${c.name}`;
          const category = getTypeCategory(c.type);
          list.push({ col, label: col, type: c.type, category });
          meta[col] = { type: c.type, category };
        });
      });
    }
    return { colList: list, colMeta: meta };
  }, [nodes, edges, id, data.schema]);

  // Compiled SQL condition — recomputes whenever conditions / columns / refs
  // change. Pushed into node data (for queryGenerator) via effect below.
  const condition = useMemo(
    () => buildWhereString(filterConditions, colMeta, refs),
    [filterConditions, colMeta, refs]
  );

  useEffect(() => {
    if ((data.condition || '') !== condition) {
      data.onNodeDataChange(id, { condition });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condition]);

  // ── Condition CRUD helpers ──────────────────────────────────────────────
  const updateConditions = (next) => {
    data.onNodeDataChange(id, {
      filterConditions: next,
      condition: buildWhereString(next, colMeta, refs),
    });
  };

  const addCondition    = () => updateConditions([...filterConditions, emptyCondition()]);
  const removeCondition = (idx) => updateConditions(filterConditions.filter((_, i) => i !== idx));
  const patchCondition  = (idx, patch) => {
    const next = filterConditions.map((c, i) => i === idx ? { ...c, ...patch } : c);
    updateConditions(next);
  };

  // When column changes, reset op/val to sensible defaults for the new type.
  const onColChange = (idx, col) => {
    const cat = colMeta[col]?.category || 'text';
    const defaultOp  = OPERATORS_BY_CAT[cat][0];
    const defaultVal = cat === 'bit' ? '1' : '';
    patchCondition(idx, { col, op: defaultOp, val: defaultVal, val2: '' });
  };

  const onOpChange = (idx, op) => {
    const c = filterConditions[idx];
    const cat = colMeta[c.col]?.category || 'text';
    const defaultVal = cat === 'bit' ? '1' : '';
    patchCondition(idx, { op, val: defaultVal, val2: '' });
  };

  return (
    <div className="custom-node min-w-[280px]">
      <Handle type="target" position={Position.Left} className="!bg-amber-500 !w-3 !h-3 !-left-1.5" />

      {/* Header */}
      <div className="bg-white/5 px-4 py-3 flex items-center justify-between border-b border-white/5 drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-amber-500/20 rounded-lg">
            <Filter size={16} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white/90">Filter</h3>
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">NUR DIESE ZEILEN ANZEIGEN</p>
          </div>
        </div>
        <button
          onClick={() => data.onDeleteNode(id)}
          className="p-1 text-white/20 hover:text-red-400 transition-colors"
        >
          <Plus size={18} className="rotate-45" />
        </button>
      </div>

      {/* Conditions */}
      <div className="p-4 space-y-3">
        {filterConditions.length === 0 && (
          <p className="text-[10px] text-white/25 italic text-center py-2">
            Noch keine Bedingungen. Klicke auf „+ Bedingung hinzufügen".
          </p>
        )}

        {filterConditions.map((c, idx) => {
          const cat     = colMeta[c.col]?.category || 'text';
          const sqlType = colMeta[c.col]?.type || '';
          const ops     = OPERATORS_BY_CAT[cat] || OPERATORS_BY_CAT.text;
          const opKey   = normalizeOp(c.op);
          const opDef   = OPERATORS[opKey];

          return (
            <div key={idx} className="space-y-2 bg-white/[0.03] rounded-xl p-3 border border-white/5">
              {/* AND/OR toggle for rows after first */}
              {idx > 0 && (
                <div className="flex gap-1 mb-1">
                  {[{k:'AND',l:'UND'},{k:'OR',l:'ODER'}].map(({k,l}) => (
                    <button
                      key={k}
                      onClick={() => patchCondition(idx, { logic: k })}
                      className={cn(
                        'px-2.5 py-0.5 rounded text-[10px] font-bold border transition-all',
                        (c.logic || 'AND') === k
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : 'bg-white/5 text-white/30 border-white/10 hover:text-white/60'
                      )}
                    >
                      {l}
                    </button>
                  ))}
                  <button
                    onClick={() => removeCondition(idx)}
                    className="ml-auto p-1 text-white/20 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
              {idx === 0 && (
                <div className="flex justify-end">
                  <button
                    onClick={() => removeCondition(idx)}
                    className="p-1 text-white/20 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}

              {/* Column selector */}
              <div>
                <label className="text-[9px] text-white/30 uppercase font-bold mb-1 block">Feld</label>
                <select
                  value={c.col}
                  onChange={e => onColChange(idx, e.target.value)}
                  className="w-full px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[11px] text-white/70 focus:outline-none"
                >
                  <option value="">Feld wählen…</option>
                  {colList.map(({ col, label, type }) => (
                    <option key={col} value={col} className="bg-[#1a1b26]">
                      {label}{type ? ` (${type})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Operator selector (German) */}
              <div>
                <label className="text-[9px] text-white/30 uppercase font-bold mb-1 block">Bedingung</label>
                <select
                  value={opKey}
                  onChange={e => onOpChange(idx, e.target.value)}
                  disabled={!c.col}
                  className="w-full px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[11px] text-amber-400 font-bold focus:outline-none disabled:opacity-40"
                >
                  {ops.map(key => (
                    <option key={key} value={key} className="bg-[#1a1b26]">
                      {OPERATORS[key].label}
                    </option>
                  ))}
                </select>
                {opDef?.hint && (
                  <p className="text-[9px] text-white/35 mt-1">{opDef.hint}</p>
                )}
              </div>

              {/* Value input (type-aware) */}
              <ValueInput
                cat={cat}
                sqlType={sqlType}
                op={opKey}
                val={c.val}
                val2={c.val2}
                colLabel={c.col}
                onChange={v => patchCondition(idx, { val: v })}
                onChange2={v => patchCondition(idx, { val2: v })}
              />
            </div>
          );
        })}

        {/* Add condition button */}
        <button
          onClick={addCondition}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-amber-500/20 text-[11px] text-amber-400/60 hover:text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all"
        >
          <Plus size={13} />
          Bedingung hinzufügen
        </button>

        {/* SQL preview */}
        {condition && (
          <div className="pt-1 px-2 py-1.5 bg-amber-500/5 rounded text-[10px] font-mono text-amber-200/60 border border-amber-500/10 break-all whitespace-pre-wrap">
            {condition}
          </div>
        )}
        {!condition && filterConditions.length > 0 && (
          <div className="px-2 py-1.5 bg-white/[0.02] rounded text-[10px] font-mono text-white/20 border border-white/5">
            -- Bitte Feld und Wert ausfüllen --
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-amber-500 !w-3 !h-3 !-right-1.5" />
    </div>
  );
});
