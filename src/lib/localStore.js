/**
 * Local report library + working draft — saved to the browser (localStorage).
 *
 * A local report holds the full pipeline so it can be reopened offline:
 *   { id, title, icon, color, steps, vars, hubId?, updatedAt }
 * `hubId` links a report back to its community origin (for execution counts).
 *
 * Every write is guarded: a full/blocked storage (private mode, quota) must
 * never crash the builder — callers get `null` / `false` and show a hint.
 */
const KEY       = 'dbflow_local_reports';
const DRAFT_KEY = 'dbflow_draft';
const MAX_REPORTS = 200;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

export function listLocal() {
  const arr = read(KEY, []);
  return Array.isArray(arr)
    ? arr.filter(r => r && typeof r === 'object').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    : [];
}

/** Insert or update a report (by id). Returns the saved record, or `null` when storage refused. */
export function saveLocal(report) {
  const list = listLocal();
  const rec = { ...report, updatedAt: new Date().toISOString() };
  if (!rec.id) rec.id = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const idx = list.findIndex(r => r.id === rec.id);
  if (idx >= 0) list[idx] = rec; else list.unshift(rec);
  return write(KEY, list.slice(0, MAX_REPORTS)) ? rec : null;
}

export function deleteLocal(id) {
  return write(KEY, listLocal().filter(r => r.id !== id));
}

// ── Working draft (survives reloads / accidental tab close) ────────────────
export function loadDraft() {
  const d = read(DRAFT_KEY, null);
  return d && typeof d === 'object' && Array.isArray(d.steps) && d.steps.length ? d : null;
}
export function saveDraft(draft) { return write(DRAFT_KEY, { ...draft, savedAt: new Date().toISOString() }); }
export function clearDraft()     { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } }

/** Small settings values (version pick etc.). */
export function getPref(key, fallback = '') { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
export function setPref(key, value)         { try { localStorage.setItem(key, value); } catch { /* ignore */ } }
