/**
 * Community Hub API client.
 *
 * By default, requests go to `/api/hub` on the current origin — in dev Vite
 * proxies that to the local hub server (:3002); in a self-hosted deployment
 * the hub serves the frontend from the same origin, so no base URL is needed.
 *
 * Set VITE_HUB_URL at build time to point at a different hub instead (e.g.
 * a publicly hosted hub) — for example when running the frontend locally
 * without standing up your own Postgres-backed hub server.
 */
const HUB = `${import.meta.env.VITE_HUB_URL || ''}/api/hub`;

async function json(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

const post = (url, body) =>
  json(url, { method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });

/** Browse community reports. params: { page, limit, sort, search, tags, featured } */
export const listFlows = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''));
  return json(`${HUB}/flows?${q}`);
};

/** Full report incl. flowData. */
export const getFlow = (id) => json(`${HUB}/flows/${id}`);

/** Download → increments the counter, returns the full flow. */
export const downloadFlow = (id) => post(`${HUB}/flows/${id}/download`);

/** Publish a new report. body: { title, description, tags, icon, color, flowData:{steps,vars}, author } */
export const publishFlow = (body) => post(`${HUB}/flows`, body);

/** Fire-and-forget execution ping (counts real runs of an imported report). */
export const pingExecution = (id) => { post(`${HUB}/flows/${id}/execute`).catch(() => {}); };

/** Aggregate community numbers. */
export const hubStats = () => json(`${HUB}/stats`);

/** All tags across the hub. */
export const hubTags = () => json(`${HUB}/tags`);
