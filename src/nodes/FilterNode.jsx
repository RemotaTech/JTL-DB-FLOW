import React, { memo, useMemo } from 'react';
import { Handle, Position, useNodes, useEdges } from 'reactflow';
import { Filter, Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

// ─── Type helpers ──────────────────────────────────────────────────────────

/**
 * Map a SQL column type string to a broad category used for UI and SQL generation.
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
  return 'text'; // NVARCHAR, VARCHAR, CHAR, UNIQUEIDENTIFIER, etc.
}

const OPERATORS_BY_CAT = {
  text:   ['=', '<>', 'LIKE', 'NOT LIKE', 'IS NULL', 'IS NOT NULL'],
  number: ['=', '<>', '>', '<', '>=', '<=', 'BETWEEN', 'IS NULL', 'IS NOT NULL'],
  date:   ['=', '<>', '>', '<', '>=', '<=', 'BETWEEN', 'IS NULL', 'IS NOT NULL'],
  bit:    ['='],
};

const DATE_PLACEHOLDER_BY_TYPE = (sqlType = '') => {
  const t = sqlType.toUpperCase();
  if (t === 'DATE') return 'YYYY-MM-DD';
  if (t === 'TIME') return 'HH:MM:SS';
  return 'YYYY-MM-DD HH:MM:SS';
};

// ─── SQL builders ──────────────────────────────────────────────────────────

function fmtCol(col) {
  // col is like "dbo.tArtikel.kArtikel"
  return col.split('.').map(p => `[${p}]`).join('.');
}

function buildConditionSQL(c, colMeta) {
  if (!c.col) return null;
  const fc = fmtCol(c.col);
  const cat = colMeta[c.col]?.category || 'text';

  if (c.op === 'IS NULL')     return `${fc} IS NULL`;
  if (c.op === 'IS NOT NULL') return `${fc} IS NOT NULL`;
  if (c.op === 'BETWEEN') {
    const q = cat === 'number' ? '' : "'";
    return `${fc} BETWEEN ${q}${c.val}${q} AND ${q}${c.val2}${q}`;
  }
  if (c.op === 'LIKE' || c.op === 'NOT LIKE') {
    return `${fc} ${c.op} '%${c.val}%'`;
  }
  if (cat === 'number') return `${fc} ${c.op} ${c.val}`;
  if (cat === 'bit')    return `${fc} = ${c.val}`;
  return `${fc} ${c.op} '${c.val}'`;
}

function buildWhereString(conditions, colMeta) {
  return conditions
    .filter(c => c.col && (c.op === 'IS NULL' || c.op === 'IS NOT NULL' || c.val !== ''))
    .map((c, i) => {
      const sql = buildConditionSQL(c, colMeta);
      if (!sql) return null;
      return i === 0 ? sql : `${c.logic} ${sql}`;
    })
    .filter(Boolean)
    .join('\n  ');
}

// ─── Empty condition factory ────────────────────────────────────────────────

const emptyCondition = () => ({
  col:   '',
  op:    '=',
  val:   '',
  val2:  '',
  logic: 'AND',
});

// ─── Value Input (type-aware) ───────────────────────────────────────────────

function ValueInput({ cat, sqlType, op, val, val2, onChange, onChange2 }) {
  const noInput = op === 'IS NULL' || op === 'IS NOT NULL';
  if (noInput) return null;

  const base = 'px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[11px] text-white/70 focus:outline-none focus:border-amber-500/50 w-full';

  if (cat === 'bit') {
    return (
      <select value={val} onChange={e => onChange(e.target.value)} className={base}>
        <option value="1" className="bg-[#1a1b26]">1 (Wahr)</option>
        <option value="0" className="bg-[#1a1b26]">0 (Falsch)</option>
      </select>
    );
  }

  if (cat === 'date') {
    const ph = DATE_PLACEHOLDER_BY_TYPE(sqlType);
    if (op === 'BETWEEN') {
      return (
        <div className="flex gap-1 items-center">
          <input
            type="text"
            placeholder={ph}
            value={val}
            onChange={e => onChange(e.target.value)}
            className={base}
          />
          <span className="text-[10px] text-white/30 shrink-0">bis</span>
          <input
            type="text"
            placeholder={ph}
            value={val2}
            onChange={e => onChange2(e.target.value)}
            className={base}
          />
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <input
          type="text"
          placeholder={ph}
          value={val}
          onChange={e => onChange(e.target.value)}
          className={base}
        />
        <p className="text-[9px] text-amber-400/40">Format: {ph}</p>
      </div>
    );
  }

  if (cat === 'number') {
    if (op === 'BETWEEN') {
      return (
        <div className="flex gap-1 items-center">
          <input
            type="number"
            placeholder="Von"
            value={val}
            onChange={e => onChange(e.target.value)}
            className={base}
          />
          <span className="text-[10px] text-white/30 shrink-0">bis</span>
          <input
            type="number"
            placeholder="Bis"
            value={val2}
            onChange={e => onChange2(e.target.value)}
            className={base}
          />
        </div>
      );
    }
    return (
      <input
        type="number"
        placeholder="Zahl"
        value={val}
        onChange={e => onChange(e.target.value)}
        className={base}
      />
    );
  }

  // text
  if (op === 'LIKE' || op === 'NOT LIKE') {
    return (
      <div className="space-y-1">
        <input
          type="text"
          placeholder="Suchtext"
          value={val}
          onChange={e => onChange(e.target.value)}
          className={base}
        />
        <p className="text-[9px] text-amber-400/40">
          Wird zu: <span className="font-mono">LIKE '%{val || '…'}%'</span>
        </p>
      </div>
    );
  }

  return (
    <input
      type="text"
      placeholder="Wert"
      value={val}
      onChange={e => onChange(e.target.value)}
      className={base}
    />
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export const FilterNode = memo(({ id, data }) => {
  const { filterConditions = [] } = data;
  const nodes = useNodes();
  const edges = useEdges();

  // ── Collect upstream columns WITH type info ─────────────────────────────
  const { colList, colMeta } = useMemo(() => {
    const upstreamTables = new Set();
    const findUpstream = (nodeId) => {
      edges.filter(e => e.target === nodeId).forEach(edge => {
        const src = nodes.find(n => n.id === edge.source);
        if (!src) return;
        if (src.type === 'tableNode' && src.data.selectedTable)
          upstreamTables.add(src.data.selectedTable);
        findUpstream(src.id);
      });
    };
    findUpstream(id);

    const list = [];       // [{ col, label, type, category }]
    const meta = {};       // col → { type, category, sqlType }

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

  // ── Condition CRUD helpers ──────────────────────────────────────────────
  const updateConditions = (next) => {
    data.onNodeDataChange(id, {
      filterConditions: next,
      condition: buildWhereString(next, colMeta),
    });
  };

  const addCondition    = () => updateConditions([...filterConditions, emptyCondition()]);
  const removeCondition = (idx) => updateConditions(filterConditions.filter((_, i) => i !== idx));
  const patchCondition  = (idx, patch) => {
    const next = filterConditions.map((c, i) => i === idx ? { ...c, ...patch } : c);
    updateConditions(next);
  };

  // When column changes, reset op/val to sensible defaults for the new type
  const onColChange = (idx, col) => {
    const cat = colMeta[col]?.category || 'text';
    const defaultOp  = OPERATORS_BY_CAT[cat][0];
    const defaultVal = cat === 'bit' ? '1' : '';
    patchCondition(idx, { col, op: defaultOp, val: defaultVal, val2: '' });
  };

  // When operator changes, reset val if switching away from/to BETWEEN
  const onOpChange = (idx, op) => {
    const c = filterConditions[idx];
    const cat = colMeta[c.col]?.category || 'text';
    const defaultVal = cat === 'bit' ? '1' : '';
    patchCondition(idx, { op, val: defaultVal, val2: '' });
  };

  const condition = buildWhereString(filterConditions, colMeta);

  return (
    <div className="custom-node min-w-[260px]">
      <Handle type="target" position={Position.Left} className="!bg-amber-500 !w-3 !h-3 !-left-1.5" />

      {/* Header */}
      <div className="bg-white/5 px-4 py-3 flex items-center justify-between border-b border-white/5 drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-amber-500/20 rounded-lg">
            <Filter size={16} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white/90">Filter</h3>
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">WHERE-KLAUSEL</p>
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
            Noch keine Bedingungen — klicke unten auf „+".
          </p>
        )}

        {filterConditions.map((c, idx) => {
          const cat     = colMeta[c.col]?.category || 'text';
          const sqlType = colMeta[c.col]?.type || '';
          const ops     = OPERATORS_BY_CAT[cat] || OPERATORS_BY_CAT.text;

          return (
            <div key={idx} className="space-y-2 bg-white/[0.03] rounded-xl p-3 border border-white/5">
              {/* AND/OR toggle for rows after first */}
              {idx > 0 && (
                <div className="flex gap-1 mb-1">
                  {['AND', 'OR'].map(l => (
                    <button
                      key={l}
                      onClick={() => patchCondition(idx, { logic: l })}
                      className={cn(
                        'px-2.5 py-0.5 rounded text-[10px] font-bold border transition-all',
                        c.logic === l
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
                <label className="text-[9px] text-white/30 uppercase font-bold mb-1 block">Spalte</label>
                <select
                  value={c.col}
                  onChange={e => onColChange(idx, e.target.value)}
                  className="w-full px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[11px] text-white/70 focus:outline-none"
                >
                  <option value="">Spalte wählen…</option>
                  {colList.map(({ col, label, type }) => (
                    <option key={col} value={col} className="bg-[#1a1b26]">
                      {label}{type ? ` (${type})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Operator selector */}
              <div>
                <label className="text-[9px] text-white/30 uppercase font-bold mb-1 block">Operator</label>
                <select
                  value={c.op}
                  onChange={e => onOpChange(idx, e.target.value)}
                  className="w-full px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[11px] text-amber-400 font-bold focus:outline-none"
                >
                  {ops.map(op => (
                    <option key={op} value={op} className="bg-[#1a1b26]">{op}</option>
                  ))}
                </select>
              </div>

              {/* Value input (type-aware) */}
              <ValueInput
                cat={cat}
                sqlType={sqlType}
                op={c.op}
                val={c.val}
                val2={c.val2}
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
            -- Bitte Spalte und Wert ausfüllen --
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-amber-500 !w-3 !h-3 !-right-1.5" />
    </div>
  );
});
