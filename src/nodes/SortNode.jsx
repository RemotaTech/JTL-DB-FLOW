import React, { memo, useMemo } from 'react';
import { Handle, Position, useNodes, useEdges } from 'reactflow';
import { ChevronUp, Check, Info, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

export const SortNode = memo(({ id, data }) => {
  const { orderCols = [], orderDirection = 'ASC' } = data;
  const nodes = useNodes();
  const edges = useEdges();

  const availableColumns = useMemo(() => {
    const upstreamTables = new Set();
    const findUpstreamTables = (nodeId) => {
      const incomingEdges = edges.filter(e => e.target === nodeId);
      incomingEdges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        if (!sourceNode) return;
        if (sourceNode.type === 'tableNode' && sourceNode.data.selectedTable) {
          upstreamTables.add(sourceNode.data.selectedTable);
        }
        findUpstreamTables(sourceNode.id);
      });
    };
    findUpstreamTables(id);

    let cols = [];
    if (data.schema) {
      upstreamTables.forEach(tName => {
        const tSchema = data.schema.tables.find(t => t.name === tName);
        if (tSchema) tSchema.columns.forEach(c => cols.push(`${tName}.${c.name}`));
      });
    }
    return cols;
  }, [nodes, edges, id, data.schema]);

  const onChange = (evt) => {
    const { name, value, checked } = evt.target;
    if (name === 'orderCol') {
      const newCols = checked ? [...orderCols, value] : orderCols.filter(c => c !== value);
      data.onNodeDataChange(id, { orderCols: newCols, orderBy: `${newCols.join(', ')} ${orderDirection}` });
    } else {
      data.onNodeDataChange(id, { orderDirection: value, orderBy: `${orderCols.join(', ')} ${value}` });
    }
  };

  return (
    <div className="custom-node min-w-[180px]">
      <Handle type="target" position={Position.Left} className="!bg-emerald-500 !w-3 !h-3 !-left-1.5" />

      <div className="bg-white/5 px-4 py-3 flex items-center justify-between border-b border-white/5 drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-emerald-500/20 rounded-lg">
            <ChevronUp size={16} className="text-emerald-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white/90">Sortierung</h3>
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">ORDER BY</p>
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
        <div className="space-y-1">
          <label className="text-[10px] text-white/40 uppercase font-bold text-emerald-400">Richtung</label>
          <div className="flex gap-1 p-1 bg-white/5 rounded-lg border border-white/5">
            {['ASC', 'DESC'].map((dir) => (
              <button
                key={dir}
                onClick={() => onChange({ target: { name: 'orderDirection', value: dir } })}
                className={cn(
                  "flex-1 py-1 text-[10px] font-bold rounded-md transition-all",
                  orderDirection === dir ? "bg-emerald-500 text-white shadow-lg" : "text-white/40 hover:text-white/60"
                )}
              >
                {dir === 'ASC' ? 'AUFSTEIGEND' : 'ABSTEIGEND'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-white/40 uppercase font-bold">Spalten</label>
          <div 
            className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar"
            onWheel={(e) => e.stopPropagation()}
          >
            {availableColumns.map(col => {
              const [tName, cName] = col.split('.');
              const colDef = data.schema?.tables.find(t => t.name === tName)?.columns.find(c => c.name === cName);
              return (
                <div
                  key={col}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 group transition-colors relative"
                >
                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                    <div className={cn(
                      "w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors",
                      orderCols.includes(col) ? "border-emerald-500 bg-emerald-500/20" : "border-white/20 group-hover:border-emerald-500/50"
                    )}>
                      <input
                        type="checkbox"
                        name="orderCol"
                        value={col}
                        checked={orderCols.includes(col)}
                        onChange={onChange}
                        className="hidden"
                      />
                      {orderCols.includes(col) && <Check size={8} className="text-emerald-400" />}
                    </div>
                    <span className="text-[11px] text-white/60 group-hover:text-white/90">{col}</span>
                  </label>
                  <div 
                    title={colDef?.description || 'Keine Beschreibung verfügbar'}
                    className="p-1 cursor-help opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Info size={12} className="text-white/40 hover:text-emerald-400" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-emerald-500 !w-3 !h-3 !-right-1.5" />
    </div>
  );
});
