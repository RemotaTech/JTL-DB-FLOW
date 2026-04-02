import React, { memo, useMemo } from 'react';
import { Handle, Position, useNodes, useEdges } from 'reactflow';
import { Layers, Check, Info, Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

const AGG_FUNCTIONS = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
const OPERATORS     = ['>', '<', '=', '>=', '<=', '<>'];
const LOGIC_OPS     = ['AND', 'OR'];

const emptyCondition = () => ({
  fn:    'COUNT',
  col:   '*',
  op:    '>',
  value: '0',
  logic: 'AND',        // used for every condition after the first
});

export const AggregateNode = memo(({ id, data }) => {
  const { groupByColumns = [], havingConditions = [] } = data;
  const nodes = useNodes();
  const edges  = useEdges();

  /* ── upstream columns ──────────────────────────────────────────── */
  const availableColumns = useMemo(() => {
    const upstreamTables = new Set();
    const findUpstream = (nodeId) => {
      edges
        .filter(e => e.target === nodeId)
        .forEach(edge => {
          const src = nodes.find(n => n.id === edge.source);
          if (!src) return;
          if (src.type === 'tableNode' && src.data.selectedTable)
            upstreamTables.add(src.data.selectedTable);
          findUpstream(src.id);
        });
    };
    findUpstream(id);

    const cols = [];
    if (data.schema) {
      upstreamTables.forEach(tName => {
        const tSchema = data.schema.tables.find(t => t.name === tName);
        if (tSchema) tSchema.columns.forEach(c => cols.push(`${tName}.${c.name}`));
      });
    }
    return cols;
  }, [nodes, edges, id, data.schema]);

  /* ── helpers ───────────────────────────────────────────────────── */
  const buildHavingString = (conditions) =>
    conditions
      .map((c, i) => {
        const colPart = c.col === '*' ? '*' : `[${c.col.replace(/\./g, '].[')}]`;
        const expr    = `${c.fn}(${colPart}) ${c.op} ${c.value}`;
        return i === 0 ? expr : `${c.logic} ${expr}`;
      })
      .join(' ');

  const updateConditions = (next) => {
    data.onNodeDataChange(id, {
      havingConditions: next,
      having: buildHavingString(next),
    });
  };

  /* ── GROUP BY checkboxes ───────────────────────────────────────── */
  const onGroupByChange = (evt) => {
    const { value, checked } = evt.target;
    const newCols = checked
      ? [...groupByColumns, value]
      : groupByColumns.filter(c => c !== value);
    data.onNodeDataChange(id, {
      groupByColumns: newCols,
      groupBy: newCols.join(', '),
    });
  };

  /* ── HAVING condition handlers ─────────────────────────────────── */
  const addCondition = () => updateConditions([...havingConditions, emptyCondition()]);

  const removeCondition = (idx) =>
    updateConditions(havingConditions.filter((_, i) => i !== idx));

  const updateCondition = (idx, field, value) => {
    const next = havingConditions.map((c, i) =>
      i === idx ? { ...c, [field]: value } : c
    );
    updateConditions(next);
  };

  const havingPreview = havingConditions.length > 0
    ? `HAVING ${buildHavingString(havingConditions)}`
    : '-- HAVING HINZUFÜGEN --';

  /* ── render ────────────────────────────────────────────────────── */
  return (
    <div className="custom-node min-w-[240px]">
      <Handle type="target" position={Position.Left} className="!bg-rose-500 !w-3 !h-3 !-left-1.5" />

      {/* header */}
      <div className="bg-white/5 px-4 py-3 flex items-center justify-between border-b border-white/5 drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-rose-500/20 rounded-lg">
            <Layers size={16} className="text-rose-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white/90">Gruppierung</h3>
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">GROUP BY / HAVING</p>
          </div>
        </div>
        <button
          onClick={() => data.onDeleteNode(id)}
          className="p-1 text-white/20 hover:text-red-400 transition-colors"
        >
          <Plus size={18} className="rotate-45" />
        </button>
      </div>

      <div className="p-4 space-y-4">

        {/* ── GROUP BY ── */}
        <div className="space-y-1">
          <label className="text-[10px] text-white/40 uppercase font-bold">Gruppieren nach</label>
          <div
            className="space-y-1 max-h-[130px] overflow-y-auto pr-1"
            onWheel={e => e.stopPropagation()}
          >
            {availableColumns.length === 0 && (
              <p className="text-[10px] text-white/20 italic px-2">Tabelle verbinden…</p>
            )}
            {availableColumns.map(col => {
              const [tName, cName] = col.split('.');
              const colDef = data.schema?.tables.find(t => t.name === tName)?.columns.find(c => c.name === cName);
              return (
                <div
                  key={col}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 group transition-colors"
                >
                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                    <div className={cn(
                      'w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors',
                      groupByColumns.includes(col)
                        ? 'border-rose-500 bg-rose-500/20'
                        : 'border-white/20 group-hover:border-rose-500/50'
                    )}>
                      <input
                        type="checkbox"
                        name="groupByColumn"
                        value={col}
                        checked={groupByColumns.includes(col)}
                        onChange={onGroupByChange}
                        className="hidden"
                      />
                      {groupByColumns.includes(col) && (
                        <Check size={8} className="text-rose-400" />
                      )}
                    </div>
                    <span className="text-[11px] text-white/60 group-hover:text-white/90">{col}</span>
                  </label>
                  {colDef?.description && (
                    <div title={colDef.description} className="p-1 cursor-help opacity-0 group-hover:opacity-100 transition-opacity">
                      <Info size={12} className="text-white/40 hover:text-rose-400" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* divider */}
        <div className="h-px bg-white/5" />

        {/* ── HAVING ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-rose-400 uppercase font-bold">Having-Bedingung</label>
            <button
              onClick={addCondition}
              className="flex items-center gap-1 px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-[10px] font-bold transition-colors border border-rose-500/20"
            >
              <Plus size={10} /> Hinzufügen
            </button>
          </div>

          <div
            className="space-y-2 max-h-[200px] overflow-y-auto pr-1"
            onWheel={e => e.stopPropagation()}
          >
            {havingConditions.length === 0 && (
              <p className="text-[10px] text-white/20 italic px-1">Noch keine Bedingung…</p>
            )}

            {havingConditions.map((cond, idx) => (
              <div key={idx} className="space-y-1.5 p-2 rounded-lg bg-white/5 border border-white/5">

                {/* AND / OR toggle — only from index 1 */}
                {idx > 0 && (
                  <div className="flex gap-1">
                    {LOGIC_OPS.map(l => (
                      <button
                        key={l}
                        onClick={() => updateCondition(idx, 'logic', l)}
                        className={cn(
                          'flex-1 py-0.5 rounded text-[10px] font-bold transition-colors',
                          cond.logic === l
                            ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                            : 'bg-white/5 text-white/30 hover:text-white/60 border border-white/5'
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                )}

                {/* Agg function selector */}
                <div className="flex gap-1 flex-wrap">
                  {AGG_FUNCTIONS.map(fn => (
                    <button
                      key={fn}
                      onClick={() => updateCondition(idx, 'fn', fn)}
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-bold transition-colors',
                        cond.fn === fn
                          ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                          : 'bg-white/5 text-white/30 hover:text-white/60 border border-white/5'
                      )}
                    >
                      {fn}
                    </button>
                  ))}
                </div>

                {/* Column selector */}
                <select
                  value={cond.col}
                  onChange={e => updateCondition(idx, 'col', e.target.value)}
                  className="w-full px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[11px] text-white/70 focus:outline-none focus:border-rose-500/50"
                >
                  <option value="*" className="bg-[#1a1b26]">* (alle Zeilen)</option>
                  {availableColumns.map(c => (
                    <option key={c} value={c} className="bg-[#1a1b26]">{c}</option>
                  ))}
                </select>

                {/* Operator + value */}
                <div className="flex gap-1.5">
                  <select
                    value={cond.op}
                    onChange={e => updateCondition(idx, 'op', e.target.value)}
                    className="w-1/3 px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[11px] text-rose-400 font-bold focus:outline-none"
                  >
                    {OPERATORS.map(op => (
                      <option key={op} value={op} className="bg-[#1a1b26]">{op}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={cond.value}
                    onChange={e => updateCondition(idx, 'value', e.target.value)}
                    placeholder="Wert"
                    className="flex-1 px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[11px] text-white/70 focus:outline-none focus:border-rose-500/50"
                  />
                  <button
                    onClick={() => removeCondition(idx)}
                    className="p-1.5 text-white/20 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* live preview */}
          <div className="px-2 py-1.5 bg-rose-500/5 rounded text-[10px] font-mono text-rose-200/50 border border-rose-500/10 break-all leading-relaxed">
            {havingPreview}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-rose-500 !w-3 !h-3 !-right-1.5" />
    </div>
  );
});
