import React, { memo, useMemo } from 'react';
import { Handle, Position, useNodes, useEdges } from 'reactflow';
import { GitMerge, ChevronDown, Info, Plus, HelpCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export const JoinNode = memo(({ id, data }) => {
  const [showInfo, setShowInfo] = React.useState(false);
  const { joinType = 'INNER JOIN', joinCondition = '' } = data;
  const nodes = useNodes();
  const edges = useEdges();

  const { leftColumns, rightColumns, suggestedJoins } = useMemo(() => {
    const incomingEdges = edges.filter(e => e.target === id);
    const source1Id = incomingEdges.find(e => e.targetHandle === 'target1')?.source;
    const source2Id = incomingEdges.find(e => e.targetHandle === 'join')?.source;

    if (!source1Id || !source2Id || !data.schema) {
      return { leftColumns: [], rightColumns: [], suggestedJoins: [] };
    }

    const collectColumns = (nodeId) => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return [];

      if (node.type === 'tableNode') {
        const tableName = node.data.selectedTable;
        if (!tableName) return [];
        const tableSchema = data.schema.tables.find(t => t.name === tableName);
        return tableSchema ? tableSchema.columns.map(c => ({ 
          tableName, 
          columnName: c.name, 
          qualified: `${tableName}.${c.name}` 
        })) : [];
      }

      if (node.type === 'joinNode') {
        const upstreamEdges = edges.filter(e => e.target === node.id);
        const u1 = upstreamEdges.find(e => e.targetHandle === 'target1')?.source;
        const u2 = upstreamEdges.find(e => e.targetHandle === 'join')?.source;
        return [...collectColumns(u1), ...collectColumns(u2)];
      }

      return [];
    };

    const leftCols = collectColumns(source1Id);
    const rightCols = collectColumns(source2Id);

    if (leftCols.length === 0 || rightCols.length === 0) {
      return { leftColumns: leftCols, rightColumns: rightCols, suggestedJoins: [] };
    }

    let suggestions = [];
    leftCols.forEach(l => {
      rightCols.forEach(r => {
        if (l.columnName === r.columnName) {
          suggestions.push(`${l.qualified} = ${r.qualified}`);
        }
      });
    });

    suggestions.sort((a, b) => {
      const aIsId = a.toLowerCase().includes('.k');
      const bIsId = b.toLowerCase().includes('.k');
      return bIsId - aIsId;
    });

    return { leftColumns: leftCols, rightColumns: rightCols, suggestedJoins: suggestions };
  }, [nodes, edges, id, data.schema]);

  const onChange = (evt) => {
    const { name, value } = evt.target;
    data.onNodeDataChange(id, { [name]: value });
  };

  return (
    <div className="custom-node min-w-[200px]">
      <Handle type="target" position={Position.Left} id="target1" className="!bg-purple-500 !w-3 !h-3 !-left-1.5 !top-[30%]" />
      <Handle type="target" position={Position.Left} id="join" className="!bg-blue-400 !w-3 !h-3 !-left-1.5 !top-[70%]" title="Zu verknüpfende Tabelle" />

      <div className="bg-white/5 px-4 py-3 flex items-center justify-between border-b border-white/5 drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              showInfo ? "bg-purple-500 text-white" : "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
            )}
          >
            <Info size={14} />
          </button>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white/90">Verknüpfung</h3>
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">RELATIONALE VERKNÜPFUNG</p>
          </div>
        </div>
        <button 
          onClick={() => data.onDeleteNode(id)}
          className="p-1 text-white/20 hover:text-red-400 transition-colors"
        >
          <Plus size={18} className="rotate-45" />
        </button>
      </div>

      <AnimatePresence>
        {showInfo && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-purple-500/5 border-b border-white/5"
          >
            <div className="p-4 space-y-2 text-[10px] text-white/60 leading-relaxed">
              <div className="flex gap-2">
                <span className="font-bold text-purple-400 shrink-0">INNER:</span>
                <span>Nur Zeilen, die in beiden Tabellen eine Übereinstimmung haben.</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-purple-400 shrink-0">LEFT:</span>
                <span>Alle Zeilen der linken Tabelle + passende Zeilen der rechten.</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-purple-400 shrink-0">RIGHT:</span>
                <span>Alle Zeilen der rechten Tabelle + passende Zeilen der linken.</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-4 space-y-3">
        <div className="flex gap-1 p-1 bg-white/5 rounded-lg border border-white/5">
          {['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN'].map((type) => (
            <button
              key={type}
              onClick={() => data.onNodeDataChange(id, { joinType: type })}
              className={cn(
                "flex-1 py-1 text-[10px] font-bold rounded-md transition-all",
                joinType === type ? "bg-purple-500 text-white shadow-lg" : "text-white/40 hover:text-white/60 hover:bg-white/5"
              )}
            >
              {type.split(' ')[0]}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-white/40 uppercase font-bold">ON-Bedingung</label>
            <button 
              onClick={() => data.onNodeDataChange(id, { isCustom: !data.isCustom })}
              className="text-[9px] font-bold uppercase tracking-widest text-purple-400/80 hover:text-purple-400 transition-colors"
            >
              {data.isCustom ? 'Automatisch' : 'Manuell'}
            </button>
          </div>

          {!data.isCustom ? (
            <div className="relative">
              <select
                name="joinCondition"
                value={joinCondition}
                onChange={onChange}
                className="w-full appearance-none px-3 py-2 bg-white/5 rounded-lg border border-white/5 text-xs font-mono text-purple-300/80 focus:outline-none focus:border-purple-500/50"
              >
                <option value="">Automatisch erkennen...</option>
                {suggestedJoins.map(s => <option key={s} value={s} className="bg-[#1a1b26]">{s}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              {suggestedJoins.length === 0 && (
                <p className="text-[9px] text-amber-400/80 italic mt-1">Verbinde zwei Tabellen, um Schlüssel zu finden</p>
              )}
            </div>
          ) : (
            <div className="space-y-2 bg-black/20 p-2 rounded-lg border border-white/5">
              <div className="relative">
                <select
                  value={data.customLeft || ''}
                  onChange={(e) => {
                    const newLeft = e.target.value;
                    data.onNodeDataChange(id, { 
                      customLeft: newLeft, 
                      joinCondition: newLeft && data.customRight ? `${newLeft} = ${data.customRight}` : '' 
                    });
                  }}
                  className="w-full appearance-none px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[10px] text-white/80 focus:outline-none focus:border-purple-500/50"
                >
                  <option value="">Linke Spalte...</option>
                  {leftColumns.map(c => <option key={c.qualified} value={c.qualified} className="bg-[#1a1b26]">{c.qualified}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              </div>
              <div className="text-center text-[10px] font-bold text-white/40">=</div>
              <div className="relative">
                <select
                  value={data.customRight || ''}
                  onChange={(e) => {
                    const newRight = e.target.value;
                    data.onNodeDataChange(id, { 
                      customRight: newRight, 
                      joinCondition: data.customLeft && newRight ? `${data.customLeft} = ${newRight}` : '' 
                    });
                  }}
                  className="w-full appearance-none px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[10px] text-white/80 focus:outline-none focus:border-purple-500/50"
                >
                  <option value="">Rechte Spalte...</option>
                  {rightColumns.map(c => <option key={c.qualified} value={c.qualified} className="bg-[#1a1b26]">{c.qualified}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              </div>
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-purple-500 !w-3 !h-3 !-right-1.5" />
    </div>
  );
});
