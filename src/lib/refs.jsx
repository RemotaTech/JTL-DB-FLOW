/**
 * Variable / "Ref" system.
 *
 * A ref is a named placeholder whose value the user edits from a floating
 * top-right panel. Any input field can be "pinned" → its current value gets
 * extracted into a ref, and the field's stored value becomes the token
 * "@ref:<id>". At SQL build time (or anywhere else) resolveRef() swaps the
 * token for the live value.
 *
 * Refs live in a React Context so that updates from the panel re-render
 * consuming nodes without having to rewrite every node's data payload.
 */

import React, { createContext, useContext } from 'react';

export const REF_PREFIX = '@ref:';

export const isRef     = (v) => typeof v === 'string' && v.startsWith(REF_PREFIX);
export const refIdOf   = (v) => (isRef(v) ? v.slice(REF_PREFIX.length) : null);
export const refToken  = (id) => `${REF_PREFIX}${id}`;

export const resolveRef = (v, refs) => {
  if (!isRef(v)) return v;
  const id = refIdOf(v);
  return refs?.[id]?.value ?? '';
};

const sanitizeName = (s) => {
  const cleaned = String(s || '')
    .replace(/[^a-zA-Z0-9_äöüÄÖÜß]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return cleaned || 'Variable';
};

export const uniqueRefName = (base, refs) => {
  const taken = new Set(Object.values(refs || {}).map((r) => r.name));
  const name  = sanitizeName(base);
  if (!taken.has(name)) return name;
  let i = 2;
  while (taken.has(`${name}${i}`)) i++;
  return `${name}${i}`;
};

// ─── Context ───────────────────────────────────────────────────────────────

const RefsContext = createContext({
  refs: {},
  createRef: () => null,
  updateRef: () => {},
  renameRef: () => {},
  deleteRef: () => {},
  setAllRefs: () => {},
});

export const useRefs = () => useContext(RefsContext);

export function RefsProvider({ children, value }) {
  return <RefsContext.Provider value={value}>{children}</RefsContext.Provider>;
}
