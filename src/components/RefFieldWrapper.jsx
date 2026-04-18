import React from 'react';
import { Link2, X } from 'lucide-react';
import { isRef, refIdOf, refToken, useRefs } from '../lib/refs';

/**
 * Wraps any value input with a "pin" button on the right. Clicking the pin
 * turns the current value into a named Variable (Ref) editable from the
 * top-right Variables panel. If the wrapped value is already a ref token
 * the input is replaced with a chip showing the variable name + live value.
 *
 * Props:
 *  - value           current field value (may be a raw string or "@ref:<id>")
 *  - onChange(v)     update field value
 *  - suggestedName   used as variable name when creating a new ref
 *  - children        the plain input element (used when not bound)
 */
export default function RefFieldWrapper({ value, onChange, suggestedName, children }) {
  const { refs, createRef } = useRefs();
  const bound = isRef(value);
  const ref   = bound ? refs?.[refIdOf(value)] : null;

  // Ref got deleted from the panel but the token is still here → treat as
  // unbound with empty value so the user can re-enter something.
  if (bound && !ref) {
    return (
      <div className="flex items-stretch gap-1">
        <div className="flex-1 px-2 py-1.5 bg-red-500/10 rounded border border-red-500/30 text-[11px] text-red-300 italic">
          Variable gelöscht
        </div>
        <button
          onClick={() => onChange('')}
          title="Zurücksetzen"
          className="px-1.5 rounded bg-white/5 border border-white/10 text-white/40 hover:text-red-400"
        >
          <X size={11} />
        </button>
      </div>
    );
  }

  if (bound && ref) {
    return (
      <div className="flex items-stretch gap-1">
        <div className="flex-1 px-2 py-1.5 bg-indigo-500/10 rounded border border-indigo-500/30 text-[11px] text-indigo-300 font-mono flex items-center gap-2 min-w-0">
          <Link2 size={11} className="shrink-0" />
          <span className="truncate font-bold">{`{{${ref.name}}}`}</span>
          <span className="ml-auto text-[9px] text-white/50 truncate">
            {ref.value ? `= ${ref.value}` : '(leer)'}
          </span>
        </div>
        <button
          onClick={() => onChange('')}
          title="Verknüpfung lösen — Wert wieder direkt eingeben"
          className="px-1.5 rounded bg-white/5 border border-white/10 text-white/40 hover:text-red-400 hover:border-red-500/30 flex items-center"
        >
          <X size={11} />
        </button>
      </div>
    );
  }

  // Not bound — show the raw input + pin button.
  return (
    <div className="flex items-stretch gap-1">
      <div className="flex-1 min-w-0">{children}</div>
      <button
        type="button"
        onClick={() => {
          const currentValue = typeof value === 'string' ? value : '';
          const id = createRef(suggestedName, currentValue);
          if (id) onChange(refToken(id));
        }}
        title="Als Variable speichern (oben rechts editierbar)"
        className="px-1.5 rounded bg-white/5 border border-white/10 text-white/40 hover:text-indigo-400 hover:border-indigo-500/30 shrink-0 flex items-center"
      >
        <Link2 size={11} />
      </button>
    </div>
  );
}
