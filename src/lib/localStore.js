/**
 * Local report library — saved to the browser (localStorage).
 *
 * A local report holds the full pipeline so it can be reopened offline:
 *   { id, title, icon, color, steps, vars, hubId?, updatedAt }
 * `hubId` links a report back to its community origin (for execution counts).
 */
const KEY = 'dbflow_local_reports';

export function listLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')) : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** Insert or update a report (by id). Returns the saved record. */
export function saveLocal(report) {
  const list = listLocal();
  const rec = { ...report, updatedAt: new Date().toISOString() };
  if (!rec.id) rec.id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const idx = list.findIndex(r => r.id === rec.id);
  if (idx >= 0) list[idx] = rec; else list.push(rec);
  writeAll(list);
  return rec;
}

export function deleteLocal(id) {
  writeAll(listLocal().filter(r => r.id !== id));
}
