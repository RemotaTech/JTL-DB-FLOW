import React, { memo, useMemo, useEffect } from 'react';
import { Handle, Position, useNodes, useEdges } from 'reactflow';
import { GitMerge, ChevronDown, Info, Plus, AlertTriangle, Link2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Collect columns available from a source node (table or upstream join). */
function collectColumnsFromNode(node, nodes, schema) {
  if (!node || !schema) return [];
  if (node.type === 'tableNode') {
    const tName = node.data.selectedTable;
    if (!tName) return [];
    const ts = schema.tables.find(t => t.name === tName);
    return ts
      ? ts.columns.map(c => ({
          tableName: tName,
          columnName: c.name,
          qualified: `${tName}.${c.name}`,
          type: c.type,
        }))
      : [];
  }
  if (node.type === 'joinNode') {
    const order = node.data.sourceOrder || [];
    return order.flatMap(sid => {
      const sn = nodes.find(n => n.id === sid);
      return collectColumnsFromNode(sn, nodes, schema);
    });
  }
  return [];
}

/** Short display label for a source node. */
function sourceLabel(node) {
  if (!node) return '??';
  if (node.type === 'tableNode') return node.data.selectedTable || 'Tabelle?';
  if (node.type === 'joinNode') return 'Verknüpfung';
  return node.type;
}

const JOIN_TYPES = [
  { key: 'INNER JOIN', label: 'Nur Übereinstimmungen',     short: 'INNER' },
  { key: 'LEFT JOIN',  label: 'Alle links + Passende',     short: 'LEFT'  },
  { key: 'RIGHT JOIN', label: 'Alle rechts + Passende',    short: 'RIGHT' },
  { key: 'FULL JOIN',  label: 'Alle, egal ob passend',     short: 'FULL'  },
];

// ─── Main ──────────────────────────────────────────────────────────────────

export const JoinNode = memo(({ id, data }) => {
  const [showInfo, setShowInfo] = React.useState(false);
  const nodes = useNodes();
  const edges = useEdges();

  // Incoming source node ids in edge creation order (stable enough).
  const incomingIds = useMemo(() => {
    return edges
      .filter(e => e.target === id)
      .map(e => e.source);
  }, [edges, id]);

  // Sync sourceOrder with actual incoming edges: preserve existing order,
  // append new sources, drop removed ones. Also prune stale join entries.
  useEffect(() => {
    const currentOrder = data.sourceOrder || [];
    const kept    = currentOrder.filter(sid => incomingIds.includes(sid));
    const added   = incomingIds.filter(sid => !kept.includes(sid));
    const nextOrder = [...kept, ...added];

    const currentJoins = data.joins || {};
    const nextJoins = {};
    nextOrder.forEach(sid => {
      if (currentJoins[sid]) nextJoins[sid] = currentJoins[sid];
    });

    const orderChanged = nextOrder.length !== currentOrder.length ||
      nextOrder.some((v, i) => v !== currentOrder[i]);
    const joinsChanged = Object.keys(nextJoins).length !== Object.keys(currentJoins).length;

    if (orderChanged || joinsChanged) {
      data.onNodeDataChange(id, { sourceOrder: nextOrder, joins: nextJoins });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingIds.join('|')]);

  const sourceOrder = data.sourceOrder || [];
  const joins       = data.joins || {};

  // Resolve sources to node objects + columns.
  const resolvedSources = useMemo(() => {
    return sourceOrder.map(sid => {
      const node = nodes.find(n => n.id === sid);
      const cols = collectColumnsFromNode(node, nodes, data.schema);
      return { id: sid, node, cols };
    });
  }, [sourceOrder, nodes, data.schema]);

  // Validation: count of joins configured vs needed.
  const needed     = Math.max(0, sourceOrder.length - 1);
  const configured = sourceOrder.slice(1).filter(sid => {
    const j = joins[sid];
    return j && j.leftCol && j.rightCol;
  }).length;
  const isComplete = needed > 0 && configured === needed;

  const updateJoin = (sid, patch) => {
    const prev = joins[sid] || { joinType: 'INNER JOIN', leftCol: '', rightCol: '' };
    data.onNodeDataChange(id, {
      joins: { ...joins, [sid]: { ...prev, ...patch } },
    });
  };

  // Suggestion: matching column names between two sides (k-prefix first).
  const suggest = (leftCols, rightCols) => {
    const out = [];
    leftCols.forEach(l => {
      rightCols.forEach(r => {
        if (l.columnName === r.columnName) {
          out.push({ left: l.qualified, right: r.qualified, col: l.columnName });
        }
      });
    });
    out.sort((a, b) => {
      const aK = a.col.toLowerCase().startsWith('k');
      const bK = b.col.toLowerCase().startsWith('k');
      return (bK ? 1 : 0) - (aK ? 1 : 0);
    });
    return out;
  };

  return (
    <div className="custom-node min-w-[320px]">
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!bg-purple-500 !w-3 !h-3 !-left-1.5"
        title="Tabellen / Auswahlen hier anschließen"
      />

      {/* Header */}
      <div className="bg-white/5 px-4 py-3 flex items-center justify-between border-b border-white/5 drag-handle cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowInfo(!showInfo)}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              showInfo ? 'bg-purple-500 text-white' : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
            )}
            title="Hilfe"
          >
            <Info size={14} />
          </button>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
              Verknüpfung
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/50 font-normal">
                {sourceOrder.length} Tabelle{sourceOrder.length === 1 ? '' : 'n'}
              </span>
            </h3>
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
              TABELLEN ZUSAMMENFÜHREN
            </p>
          </div>
        </div>
        <button
          onClick={() => data.onDeleteNode(id)}
          className="p-1 text-white/20 hover:text-red-400 transition-colors"
        >
          <Plus size={18} className="rotate-45" />
        </button>
      </div>

      {/* Info panel */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-purple-500/5 border-b border-white/5"
          >
            <div className="p-4 space-y-2 text-[10px] text-white/60 leading-relaxed">
              <p className="text-white/70">
                Schließe <b>mehrere Tabellen</b> an. Die erste angeschlossene Tabelle ist die
                Basis. Für jede weitere Tabelle wählst du ein Feld, das mit einem Feld einer
                schon angeschlossenen Tabelle übereinstimmt.
              </p>
              <div className="pt-2 space-y-1">
                {JOIN_TYPES.map(t => (
                  <div key={t.key} className="flex gap-2">
                    <span className="font-bold text-purple-400 shrink-0 w-12">{t.short}:</span>
                    <span>{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body */}
      <div className="p-4 space-y-3">
        {sourceOrder.length === 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-200/70">
              Noch keine Tabellen angeschlossen. Verbinde eine oder mehrere Tabellen mit dem
              linken Eingang.
            </p>
          </div>
        )}

        {sourceOrder.length === 1 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
            <AlertTriangle size={14} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-blue-200/70">
              Nur eine Tabelle angeschlossen — schließe mindestens eine weitere an, um sie zu
              verknüpfen.
            </p>
          </div>
        )}

        {/* Base source */}
        {resolvedSources.length > 0 && (
          <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-purple-300/80">
                  Basis
                </span>
                <span className="text-[12px] font-semibold text-white/90">
                  {sourceLabel(resolvedSources[0].node)}
                </span>
              </div>
              <span className="text-[9px] text-white/40">{resolvedSources[0].cols.length} Felder</span>
            </div>
          </div>
        )}

        {/* Each subsequent source → one join config */}
        {resolvedSources.slice(1).map((src, i) => {
          const priorCols = resolvedSources
            .slice(0, i + 1)
            .flatMap(s => s.cols);
          const rightCols = src.cols;
          const cfg       = joins[src.id] || { joinType: 'INNER JOIN', leftCol: '', rightCol: '' };
          const suggestions = suggest(priorCols, rightCols);
          const complete    = !!cfg.leftCol && !!cfg.rightCol;

          return (
            <div
              key={src.id}
              className={cn(
                'rounded-xl border p-3 space-y-3',
                complete
                  ? 'border-purple-500/30 bg-purple-500/5'
                  : 'border-amber-500/30 bg-amber-500/5'
              )}
            >
              {/* Header row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Link2 size={12} className="text-purple-400 shrink-0" />
                  <span className="text-[12px] font-semibold text-white/90 truncate">
                    {sourceLabel(src.node)}
                  </span>
                </div>
                <span className="text-[9px] text-white/40 shrink-0">
                  {src.cols.length} Felder
                </span>
              </div>

              {/* Join type */}
              <div>
                <label className="text-[9px] text-white/40 uppercase font-bold mb-1 block">
                  Verknüpfungs-Typ
                </label>
                <div className="grid grid-cols-4 gap-1 p-1 bg-white/5 rounded-lg border border-white/5">
                  {JOIN_TYPES.map(t => (
                    <button
                      key={t.key}
                      onClick={() => updateJoin(src.id, { joinType: t.key })}
                      title={t.label}
                      className={cn(
                        'py-1 text-[10px] font-bold rounded-md transition-all',
                        cfg.joinType === t.key
                          ? 'bg-purple-500 text-white shadow-lg'
                          : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                      )}
                    >
                      {t.short}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick suggestions */}
              {suggestions.length > 0 && !complete && (
                <div>
                  <label className="text-[9px] text-white/40 uppercase font-bold mb-1 block">
                    Vorschläge (gleiche Feldnamen)
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {suggestions.slice(0, 4).map(s => (
                      <button
                        key={`${s.left}=${s.right}`}
                        onClick={() =>
                          updateJoin(src.id, { leftCol: s.left, rightCol: s.right })
                        }
                        className="px-2 py-1 rounded-md bg-purple-500/10 border border-purple-500/20 text-[9px] font-mono text-purple-300 hover:bg-purple-500/20 transition-colors"
                      >
                        {s.col}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual field pickers */}
              <div className="space-y-2 bg-black/20 p-2 rounded-lg border border-white/5">
                <div>
                  <label className="text-[9px] text-white/40 uppercase font-bold mb-1 block">
                    Feld aus bereits verknüpften Tabellen
                  </label>
                  <div className="relative">
                    <select
                      value={cfg.leftCol || ''}
                      onChange={e => updateJoin(src.id, { leftCol: e.target.value })}
                      className="w-full appearance-none px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[10px] text-white/80 focus:outline-none focus:border-purple-500/50"
                    >
                      <option value="">Feld wählen…</option>
                      {priorCols.map(c => (
                        <option key={c.qualified} value={c.qualified} className="bg-[#1a1b26]">
                          {c.qualified}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                  </div>
                </div>

                <div className="text-center text-[11px] font-bold text-purple-400">=</div>

                <div>
                  <label className="text-[9px] text-white/40 uppercase font-bold mb-1 block">
                    Feld aus „{sourceLabel(src.node)}"
                  </label>
                  <div className="relative">
                    <select
                      value={cfg.rightCol || ''}
                      onChange={e => updateJoin(src.id, { rightCol: e.target.value })}
                      className="w-full appearance-none px-2 py-1.5 bg-white/5 rounded border border-white/5 text-[10px] text-white/80 focus:outline-none focus:border-purple-500/50"
                    >
                      <option value="">Feld wählen…</option>
                      {rightCols.map(c => (
                        <option key={c.qualified} value={c.qualified} className="bg-[#1a1b26]">
                          {c.qualified}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                  </div>
                </div>
              </div>

              {!complete && (
                <p className="text-[9px] text-amber-400/80 italic">
                  Bitte beide Felder wählen — sonst bleibt diese Tabelle ohne Verknüpfung.
                </p>
              )}
            </div>
          );
        })}

        {/* Status */}
        {sourceOrder.length >= 2 && (
          <div
            className={cn(
              'text-center text-[10px] font-bold py-1 rounded-md',
              isComplete
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            )}
          >
            {isComplete
              ? `✓ ${configured} von ${needed} Verknüpfungen konfiguriert`
              : `⚠ ${configured} von ${needed} Verknüpfungen konfiguriert`}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-purple-500 !w-3 !h-3 !-right-1.5" />
    </div>
  );
});
