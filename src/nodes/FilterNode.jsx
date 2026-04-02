import React, { memo, useMemo } from 'react';
import { Handle, Position, useNodes, useEdges } from 'reactflow';
import { Filter, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

export const FilterNode = memo(({ id, data }) => {
  const { condition = '' } = data;
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

  const onUpdate = (col, op, val) => {
    data.onNodeDataChange(id, {
      filterCol: col,
      filterOp: op,
      filterVal: val,
      condition: `${col} ${op} ${op === 'LIKE' ? `'%${val}%'` : `'${val}'`}`
    });
  };

  return (
    <div className="custom-node min-w-[220px]">
      <Handle type="target" position={Position.Left} className="!bg-amber-500 !w-3 !h-3 !-left-1.5" />

      <div className="bg-white/5 px-4 py-3 flex items-center justify-between border-b border-white/5 drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-amber-500/20 rounded-lg">
            <Filter size={16} className="text-amber-400" />
          </div>
          <div className="flex-1">
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

      <div className="p-4 space-y-3">
        <div className="space-y-2">
          <label className="text-[10px] text-white/40 uppercase font-bold">Spalte</label>
          <select
            value={data.filterCol || ''}
            onChange={(e) => onUpdate(e.target.value, data.filterOp || '=', data.filterVal || '')}
            className="w-full px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[11px] text-white/70 focus:outline-none"
          >
            <option value="">Spalte wählen...</option>
            {availableColumns.map(c => <option key={c} value={c} className="bg-[#1a1b26]">{c}</option>)}
          </select>

          <div className="flex gap-2">
            <select
              value={data.filterOp || '='}
              onChange={(e) => onUpdate(data.filterCol || '', e.target.value, data.filterVal || '')}
              className="w-1/3 px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[11px] text-amber-400 font-bold focus:outline-none"
            >
              <option value="=">=</option>
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value="LIKE">LIKE</option>
              <option value="<>">!=</option>
            </select>
            <input
              type="text"
              placeholder="Wert"
              value={data.filterVal || ''}
              onChange={(e) => onUpdate(data.filterCol || '', data.filterOp || '=', e.target.value)}
              className="flex-1 px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[11px] text-white/70 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="pt-2 px-2 py-1.5 bg-amber-500/5 rounded text-[10px] font-mono text-amber-200/60 border border-amber-500/10">
            {condition || '-- FILTER ERSTELLEN --'}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-amber-500 !w-3 !h-3 !-right-1.5" />
    </div>
  );
});
