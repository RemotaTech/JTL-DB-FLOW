import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { Layers, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

export const DistinctNode = memo(({ id, data }) => {
  const { isDistinct = false } = data;

  return (
    <div className="custom-node min-w-[160px]">
      <Handle type="target" position={Position.Left} className="!bg-amber-400 !w-3 !h-3 !-left-1.5" />
      
      <div className="bg-white/5 px-4 py-3 flex items-center justify-between border-b border-white/5 drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-amber-400/20 rounded-lg">
            <Layers size={16} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white/90">Eindeutig</h3>
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">SELECT DISTINCT</p>
          </div>
        </div>
        <button 
          onClick={() => data.onDeleteNode(id)}
          className="p-1 text-white/20 hover:text-red-400 transition-colors"
        >
          <Plus size={18} className="rotate-45" />
        </button>
      </div>

      <div className="p-4">
        <button
          onClick={() => data.onNodeDataChange(id, { isDistinct: !isDistinct })}
          className={cn(
            "w-full py-2 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-2",
            isDistinct 
              ? "bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-500/20" 
              : "bg-white/5 border-white/10 text-white/40 hover:text-white/60 hover:bg-white/10"
          )}
        >
          {isDistinct ? 'AKTIVIERT' : 'DEAKTIVIERT'}
        </button>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-amber-400 !w-3 !h-3 !-right-1.5" />
    </div>
  );
});
