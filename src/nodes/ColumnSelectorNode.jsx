import React, { memo, useMemo, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Handle, Position, useNodes, useEdges } from 'reactflow';
import { ListChecks, Check, Info, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { collectUpstreamColumns } from '../utils/nodeUtils';

// ─── Cursor-following tooltip portal ───────────────────────────────────────
// Rendered into document.body to escape ReactFlow's transform stacking context.

function CursorTooltip({ text, x, y }) {
  if (!text) return null;
  return ReactDOM.createPortal(
    <div
      style={{ left: x + 14, top: y + 14 }}
      className="fixed z-[9999] max-w-[200px] px-2.5 py-2 bg-[#0e0f1a] border border-white/15 rounded-lg shadow-2xl text-[10px] text-white/80 leading-relaxed pointer-events-none"
    >
      {text}
    </div>,
    document.body
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

export const ColumnSelectorNode = memo(({ id, data }) => {
  const { selectedColumns = {}, schema } = data;
  const nodes = useNodes();
  const edges = useEdges();

  // Tooltip state
  const [tooltip, setTooltip] = useState({ text: null, x: 0, y: 0 });

  const showTooltip = useCallback((text, e) => {
    setTooltip({ text, x: e.clientX, y: e.clientY });
  }, []);

  const moveTooltip = useCallback((e) => {
    setTooltip(t => t.text ? { ...t, x: e.clientX, y: e.clientY } : t);
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltip({ text: null, x: 0, y: 0 });
  }, []);

  const upstreamColumns = useMemo(() => {
    const incomingEdge = edges.find(e => e.target === id);
    if (!incomingEdge || !schema) return [];
    return collectUpstreamColumns(incomingEdge.source, nodes, edges, schema);
  }, [id, nodes, edges, schema]);

  const toggleColumn = (qualified) => {
    const newSelected = { ...selectedColumns };
    if (newSelected[qualified] !== undefined) {
      delete newSelected[qualified];
    } else {
      newSelected[qualified] = '';
    }
    data.onNodeDataChange(id, { selectedColumns: newSelected });
  };

  const updateAlias = (qualified, alias) => {
    const newSelected = { ...selectedColumns, [qualified]: alias };
    data.onNodeDataChange(id, { selectedColumns: newSelected });
  };

  return (
    <>
      <CursorTooltip text={tooltip.text} x={tooltip.x} y={tooltip.y} />

      <div className="custom-node min-w-[280px]">
        <Handle type="target" position={Position.Left} className="!bg-emerald-500 !w-3 !h-3 !-left-1.5" />

        <div className="bg-white/5 px-4 py-3 flex items-center justify-between border-b border-white/5 drag-handle cursor-grab active:cursor-grabbing">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-emerald-500/20 rounded-lg">
              <ListChecks size={16} className="text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white/90">Spaltenauswahl</h3>
              <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">SELECT COLUMNS AS ...</p>
            </div>
          </div>
          <button
            onClick={() => data.onDeleteNode(id)}
            className="p-1 text-white/20 hover:text-red-400 transition-colors"
          >
            <Plus size={18} className="rotate-45" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {upstreamColumns.length === 0 ? (
            <p className="text-[10px] text-amber-400/80 italic text-center py-4">
              Verbinden Sie eine Quelle, um Spalten zu wählen
            </p>
          ) : (
            <div
              className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar"
              onWheel={(e) => e.stopPropagation()}
            >
              {upstreamColumns.map((col) => {
                const isSelected = selectedColumns[col.qualified] !== undefined;
                return (
                  <div key={col.qualified} className="flex flex-col gap-1 p-2 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <div
                          className={cn(
                            'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                            isSelected ? 'border-emerald-500 bg-emerald-500/20' : 'border-white/20'
                          )}
                          onClick={() => toggleColumn(col.qualified)}
                        >
                          {isSelected && <Check size={10} className="text-emerald-400" />}
                        </div>
                        <span className={cn(
                          'text-[10px] font-mono flex-1',
                          isSelected ? 'text-white/90 font-bold' : 'text-white/40'
                        )}>
                          {col.qualified}
                        </span>
                      </label>

                      {/* Info icon — tooltip follows cursor via portal */}
                      <button
                        type="button"
                        className="p-1 cursor-help hover:bg-white/5 rounded-md transition-colors"
                        onMouseEnter={(e) => showTooltip(col.description || 'Keine Beschreibung verfügbar', e)}
                        onMouseMove={moveTooltip}
                        onMouseLeave={hideTooltip}
                      >
                        <Info size={10} className="text-white/20 hover:text-emerald-400 transition-colors" />
                      </button>
                    </div>

                    {isSelected && (
                      <div className="flex items-center gap-2 mt-1 pl-6">
                        <span className="text-[9px] font-bold text-white/20 uppercase italic">AS</span>
                        <input
                          type="text"
                          placeholder="Alias..."
                          value={selectedColumns[col.qualified] || ''}
                          onChange={(e) => updateAlias(col.qualified, e.target.value)}
                          className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-[10px] text-emerald-300 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Handle type="source" position={Position.Right} className="!bg-emerald-500 !w-3 !h-3 !-right-1.5" />
      </div>
    </>
  );
});
