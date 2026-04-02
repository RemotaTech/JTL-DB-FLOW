import React, { memo, useMemo } from 'react';
import { Handle, Position, useNodes, useEdges } from 'reactflow';
import { Sparkles, ChevronDown, Info, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { collectUpstreamColumns } from '../utils/nodeUtils';

const FORMAT_OPTIONS = {
  DATE: [
    { label: 'Datum (DD.MM.YYYY)', value: 'CONVERT(VARCHAR(10), {col}, 104)' },
    { label: 'Datum (YYYY-MM-DD)', value: 'CONVERT(VARCHAR(10), {col}, 120)' },
    { label: 'Datum & Zeit', value: 'CONVERT(VARCHAR(16), {col}, 120)' },
  ],
  NUMBER: [
    { label: 'Dezimal (2 Stellen)', value: 'CAST({col} AS DECIMAL(18, 2))' },
    { label: 'Ganzzahl', value: 'CAST({col} AS INT)' },
    { label: 'Prozent (*100)', value: 'CAST(({col} * 100) AS DECIMAL(18, 2)) + \'%\'' },
  ],
  STRING: [
    { label: 'GROSSBUCHSTABEN', value: 'UPPER({col})' },
    { label: 'kleinbuchstaben', value: 'LOWER({col})' },
    { label: 'Trimmen (L+R)', value: 'LTRIM(RTRIM({col}))' },
    { label: 'Ersetzen', value: 'REPLACE({col}, \'{find}\', \'{replace}\')' },
  ]
};

const getColumnCategory = (type) => {
  if (!type) return 'STRING';
  const t = type.toUpperCase();
  if (t.includes('DATE') || t.includes('TIME')) return 'DATE';
  if (t.includes('INT') || t.includes('DECIMAL') || t.includes('NUMERIC') || t.includes('FLOAT') || t.includes('REAL') || t.includes('MONEY')) return 'NUMBER';
  return 'STRING';
};

export const FormatterNode = memo(({ id, data }) => {
  const { selectedColumn = '', formatValue = '', alias = '', replaceFind = '', replaceReplace = '', schema } = data;
  const nodes = useNodes();
  const edges = useEdges();

  const upstreamColumns = useMemo(() => {
    const incomingEdge = edges.find(e => e.target === id);
    if (!incomingEdge || !schema) return [];
    return collectUpstreamColumns(incomingEdge.source, nodes, edges, schema);
  }, [id, nodes, edges, schema]);

  const selectedColObj = useMemo(() => upstreamColumns.find(c => c.qualified === selectedColumn), [upstreamColumns, selectedColumn]);
  const colCategory = useMemo(() => getColumnCategory(selectedColObj?.type), [selectedColObj]);

  const onColumnChange = (e) => {
    data.onNodeDataChange(id, { selectedColumn: e.target.value, formatValue: '' });
  };

  const onFormatChange = (e) => {
    data.onNodeDataChange(id, { formatValue: e.target.value });
  };

  const onAliasChange = (e) => {
    data.onNodeDataChange(id, { alias: e.target.value });
  };

  const onReplaceChange = (field, value) => {
    data.onNodeDataChange(id, { [field]: value });
  };

  const isReplace = formatValue.startsWith('REPLACE');

  return (
    <div className="custom-node min-w-[240px]">
      <Handle type="target" position={Position.Left} className="!bg-pink-500 !w-3 !h-3 !-left-1.5" />
      
      <div className="bg-white/5 px-4 py-3 flex items-center justify-between border-b border-white/5 drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-pink-500/20 rounded-lg">
            <Sparkles size={16} className="text-pink-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white/90">Formatierung</h3>
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">CAST / CONVERT</p>
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
        {/* Column Selection */}
        <div className="space-y-1">
          <label className="text-[10px] text-white/40 uppercase font-bold">Spalte wählen</label>
          <div className="relative">
            <select
              value={selectedColumn}
              onChange={onColumnChange}
              className="w-full appearance-none px-3 py-2 bg-white/5 rounded-lg border border-white/5 text-xs text-white/80 focus:outline-none focus:border-pink-500/50"
            >
              <option value="">Wählen...</option>
              {upstreamColumns.map(c => (
                <option key={c.qualified} value={c.qualified} className="bg-[#1a1b26]">{c.qualified}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
          </div>
          {selectedColObj && (
             <div className="flex items-center justify-between px-1 mt-1">
               <span className="text-[9px] text-pink-400 font-bold uppercase">{selectedColObj.type}</span>
               {selectedColObj.description && <span className="text-[9px] text-white/30 italic">Hat Info</span>}
             </div>
          )}
        </div>

        {/* Format Selection - Dynamic based on category */}
        <div className="space-y-1">
          <label className="text-[10px] text-white/40 uppercase font-bold">
            {selectedColumn ? `${colCategory}-Optionen` : 'Formatierungswert'}
          </label>
          <div className="relative">
            <select
              value={formatValue}
              onChange={onFormatChange}
              disabled={!selectedColumn}
              className="w-full appearance-none px-3 py-2 bg-white/5 rounded-lg border border-white/5 text-xs text-white/80 focus:outline-none focus:border-pink-500/50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <option value="">Wählen...</option>
              {(FORMAT_OPTIONS[colCategory] || []).map(opt => (
                <option key={opt.value} value={opt.value} className="bg-[#1a1b26] text-white/80">
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
          </div>
        </div>

        {/* Replace Specific Inputs */}
        {isReplace && (
          <div className="grid grid-cols-2 gap-2 p-2 bg-black/20 rounded-lg border border-white/5">
            <div className="space-y-1">
              <label className="text-[9px] text-white/40 uppercase font-bold">Suchen</label>
              <input
                type="text"
                value={replaceFind}
                onChange={(e) => onReplaceChange('replaceFind', e.target.value)}
                placeholder="Text..."
                className="w-full px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[10px] text-white/80 focus:outline-none focus:border-pink-500/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-white/40 uppercase font-bold">Ersetzen</label>
              <input
                type="text"
                value={replaceReplace}
                onChange={(e) => onReplaceChange('replaceReplace', e.target.value)}
                placeholder="Neu..."
                className="w-full px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[10px] text-white/80 focus:outline-none focus:border-pink-500/50"
              />
            </div>
          </div>
        )}

        {/* Alias */}
        <div className="space-y-1">
          <label className="text-[10px] text-white/40 uppercase font-bold">Alias (AS)</label>
          <input
            type="text"
            value={alias}
            onChange={onAliasChange}
            placeholder="Neuer Name..."
            className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/5 text-xs text-white/80 focus:outline-none focus:border-pink-500/50"
          />
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-pink-500 !w-3 !h-3 !-right-1.5" />
    </div>
  );
});
