/**
 * Community Hub API client.
 *
 * All requests are relative to `/api/hub` — in dev Vite proxies that to the
 * hub server (:3002); in production the hub serves the frontend from the same
 * origin, so no base URL is needed.
 */
const HUB = '/api/hub';

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
