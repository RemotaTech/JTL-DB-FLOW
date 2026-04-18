import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Trash2, Braces } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRefs } from '../lib/refs';

/**
 * Floating top-right panel that lists every Variable (Ref) the user has
 * pinned. From here the user renames, edits or deletes the variables —
 * changes propagate instantly to every field bound to that variable.
 */
export default function VariablesPanel() {
  const { refs, updateRef, renameRef, deleteRef } = useRefs();
  const [open, setOpen] = useState(true);
  const entries = Object.entries(refs || {});
  if (entries.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-40 w-72 rounded-xl border border-indigo-500/30 bg-[#1a1b26]/95 backdrop-blur shadow-2xl shadow-indigo-500/10">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-indigo-500/20">
            <Braces size={12} className="text-indigo-300" />
          </div>
          <span className="text-xs font-semibold text-white/90">Variablen</span>
          <span className="text-[10px] text-white/40">({entries.length})</span>
        </div>
        {open ? (
          <ChevronUp size={12} className="text-white/40" />
        ) : (
          <ChevronDown size={12} className="text-white/40" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/5 p-3 space-y-2 max-h-[60vh] overflow-auto">
              <p className="text-[10px] text-white/40 italic mb-1 leading-relaxed">
                Werte hier ändern — alle Filter, die diese Variable nutzen,
                übernehmen den neuen Wert automatisch.
              </p>
              {entries.map(([id, r]) => (
                <div
                  key={id}
                  className="bg-white/[0.03] rounded-lg p-2 space-y-1.5 border border-white/5"
                >
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={r.name}
                      onChange={(e) => renameRef(id, e.target.value)}
                      placeholder="Name"
                      className="flex-1 min-w-0 px-2 py-1 bg-white/5 rounded border border-white/5 text-[11px] text-indigo-300 font-mono font-bold focus:outline-none focus:border-indigo-500/50"
                    />
                    <button
                      onClick={() => deleteRef(id)}
                      title="Variable löschen"
                      className="p-1 text-white/30 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Wert…"
                    value={r.value || ''}
                    onChange={(e) => updateRef(id, { value: e.target.value })}
                    className="w-full px-2 py-1 bg-white/5 rounded border border-white/5 text-[11px] text-white/80 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
