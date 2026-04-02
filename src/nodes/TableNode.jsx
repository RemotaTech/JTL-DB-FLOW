import React, { memo, useMemo, useState, useRef, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { Table, ChevronDown, Check, Info, Search, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

export const TableNode = memo(({ id, data }) => {
  const { schema, selectedTable, selectedColumns = [], top } = data;
  const tables = schema?.tables || [];

  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync input text with selected value when dropdown is closed
  useEffect(() => {
    if (!isOpen) {
      if (selectedTable) {
        const parts = selectedTable.split('.');
        setSearchTerm(parts.length > 1 ? parts.slice(1).join('.') : selectedTable);
      } else {
        setSearchTerm('');
      }
    }
  }, [selectedTable, isOpen]);

  const groupedTables = useMemo(() => {
    const term = searchTerm.toLowerCase();
    
    let all = tables.map(t => {
      let schemaName = 'dbo';
      let displayName = t.name;
      if (t.name.includes('.')) {
        const parts = t.name.split('.');
        schemaName = parts[0];
        displayName = parts.slice(1).join('.');
      }
      return { ...t, schemaName, displayName };
    });

    if (term && isOpen) {
      all = all.filter(t => t.displayName.toLowerCase().includes(term));
      
      // Sort: Exact match first, then starts with, then rest
      all.sort((a, b) => {
        const aName = a.displayName.toLowerCase();
        const bName = b.displayName.toLowerCase();
        if (aName === term) return -1;
        if (bName === term) return 1;
        const aStarts = aName.startsWith(term) ? 1 : 0;
        const bStarts = bName.startsWith(term) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;
        return aName.localeCompare(bName);
      });
    } else {
      all.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    const groups = {};
    all.forEach(t => {
      if (!groups[t.schemaName]) groups[t.schemaName] = [];
      groups[t.schemaName].push(t);
    });

    // Keys sorted alphabetically
    const sortedGroups = {};
    Object.keys(groups).sort().forEach(k => {
      sortedGroups[k] = groups[k];
    });

    return sortedGroups;
  }, [tables, searchTerm, isOpen]);

  const onChange = (evt) => {
    const { name, value, checked } = evt.target;
    if (name === 'column') {
      const newCols = checked
        ? [...selectedColumns, value]
        : selectedColumns.filter(c => c !== value);
      data.onNodeDataChange(id, { selectedColumns: newCols });
    } else if (name === 'top') {
      data.onNodeDataChange(id, { top: value });
    }
  };

  const selectTable = (tableName) => {
    data.onNodeDataChange(id, { selectedTable: tableName, selectedColumns: [] });
    setIsOpen(false);
  };

  const currentTable = tables.find(t => t.name === selectedTable);

  return (
    <div className="custom-node min-w-[220px]">
      <div className="bg-white/5 px-4 py-3 flex items-center justify-between border-b border-white/5 drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-blue-500/20 rounded-lg">
            <Table size={16} className="text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white/90">Tabellenauswahl</h3>
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">FROM / SELECT</p>
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
        <div className="space-y-1 relative" ref={dropdownRef}>
          <label className="text-[10px] text-white/40 uppercase font-bold">Tabellenname</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Suchen..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              className="w-full pl-9 pr-8 py-2 bg-white/5 rounded-lg border border-white/5 text-sm text-white/80 focus:outline-none focus:border-blue-500/50"
            />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <ChevronDown size={14} className={cn("absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition-transform cursor-pointer", isOpen && "rotate-180")} onClick={() => setIsOpen(!isOpen)} />
          </div>

          {isOpen && (
            <div className="absolute z-50 w-full mt-1 bg-[#1a1b26] border border-white/10 rounded-lg shadow-2xl max-h-60 overflow-y-auto custom-scrollbar text-sm">
              {Object.keys(groupedTables).length === 0 ? (
                <div className="p-3 text-center text-xs text-white/40">Keine Tabelle gefunden</div>
              ) : (
                Object.entries(groupedTables).map(([schemaKey, schemaTables]) => (
                  <div key={schemaKey}>
                    <div className="px-3 py-1.5 bg-white/5 text-[10px] font-bold uppercase tracking-wider text-white/40 sticky top-0 z-10 backdrop-blur-md">
                      {schemaKey}
                    </div>
                    {schemaTables.map(t => (
                      <div
                        key={t.name}
                        onClick={() => selectTable(t.name)}
                        className={cn(
                          "px-3 py-2 cursor-pointer transition-colors text-xs flex items-center justify-between",
                          selectedTable === t.name ? "bg-blue-500/20 text-blue-400 font-bold" : "text-white/80 hover:bg-white/10"
                        )}
                      >
                        {t.displayName}
                        {selectedTable === t.name && <Check size={12} />}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {selectedTable && (
          <div className="space-y-2">
            <label className="text-[10px] text-white/40 uppercase font-bold">Spalten</label>
            <div 
              className="space-y-1 max-h-[150px] overflow-y-auto pr-1"
              onWheel={(e) => e.stopPropagation()}
            >
              {currentTable?.columns.map((col) => (
                <div
                  key={col.name}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 group transition-colors relative"
                >
                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                    <div className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                      selectedColumns.includes(col.name) ? "border-blue-500 bg-blue-500/20" : "border-white/20 group-hover:border-blue-500/50"
                    )}>
                      <input
                        type="checkbox"
                        name="column"
                        value={col.name}
                        checked={selectedColumns.includes(col.name)}
                        onChange={onChange}
                        className="hidden"
                      />
                      {selectedColumns.includes(col.name) && <Check size={10} className="text-blue-400" />}
                    </div>
                    <span className={cn(
                      "text-xs transition-colors",
                      selectedColumns.includes(col.name) ? "text-white/90" : "text-white/60 group-hover:text-white/90"
                    )}>{col.name}</span>
                  </label>
                  <div className="relative group/info">
                    <button 
                      type="button"
                      className="p-1 cursor-help hover:bg-white/5 rounded-md transition-colors"
                    >
                      <Info size={12} className="text-white/20 group-hover/info:text-blue-400 transition-colors" />
                    </button>
                    <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 border border-white/10 rounded shadow-xl opacity-0 group-hover/info:opacity-100 pointer-events-none transition-opacity z-[100] text-[10px] text-white/80 leading-relaxed backdrop-blur-md shadow-black">
                      {col.description || 'Keine Beschreibung verfügbar'}
                      <div className="absolute top-full right-2 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-white/5 space-y-2">
              <label className="text-[10px] text-white/40 uppercase font-bold px-1">Abfrage begrenzen (Optional)</label>
              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                {[10, 100, 1000].map((val) => (
                  <button
                    key={val}
                    onClick={() => data.onNodeDataChange(id, { top: top === val ? null : val })}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                      top === val 
                        ? "bg-white text-black shadow-lg shadow-white/10" 
                        : "text-white/40 hover:text-white/60 hover:bg-white/5"
                    )}
                  >
                    {val === 1000 ? '1K' : val}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-blue-500 !w-3 !h-3 !-right-1.5" />
    </div>
  );
});
