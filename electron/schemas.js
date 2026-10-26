/**
 * Desktop app — user-updatable JTL schema files.
 *
 * Bundled schemas ship inside the app (`versions/*.json`). Newer ones go to a
 * writable folder in the user's profile and take precedence via
 * `BRIDGE_VERSIONS_DIRS` (see bridge/app.js). Two ways to get them there:
 *   • import a `<version>.json` file (File menu / drag-and-drop in future)
 *   • fetch missing versions straight from wawi-db.jtl-software.de
 *     (same procedure as version-scraper.js, no extra dependencies)
 */
import { promises as fs, existsSync } from 'fs';
import { basename, join } from 'path';
import { listVersions, compareVersions } from '../bridge/app.js';

const BASE_URL = 'https://wawi-db.jtl-software.de';
const MIN_VERSION = '1.11.0.0';
const VERSION_RE = /^\d+(\.\d+){1,3}$/;

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Shape check for a schema file: `{ tables: [{ name, columns: [{ name, type }] }] }`. */
export function validateSchema(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.tables)) return 'Datei enthält kein „tables“-Array.';
  if (!data.tables.length) return 'Schema enthält keine Tabellen.';
  for (const t of data.tables) {
    if (!t || typeof t.name !== 'string' || !Array.isArray(t.columns)) return `Tabelle ohne Namen/Spalten: ${JSON.stringify(t).slice(0, 60)}`;
    for (const c of t.columns) if (!c || typeof c.name !== 'string') return `Spalte ohne Namen in ${t.name}.`;
  }
  return null;
}

/**
 * Copy a schema JSON into the user folder. The file name (minus .json) is the
 * version label shown in Settings; a `version` field inside the JSON wins.
 */
export async function importSchemaFile(srcPath, userDir) {
  const raw = await fs.readFile(srcPath, 'utf8');
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('Ungültiges JSON.'); }
  const problem = validateSchema(data);
  if (problem) throw new Error(problem);

  let version = typeof data.version === 'string' ? data.version.trim() : basename(srcPath).replace(/\.json$/i, '').trim();
  version = version.replace(/^v/i, '');
  if (!/^[\w.]{1,32}$/.test(version) || version.includes('..')) throw new Error(`Ungültiger Versionsname „${version}“ (erlaubt: Ziffern, Punkte, Buchstaben, _).`);

  await ensureDir(userDir);
  await fs.writeFile(join(userDir, `${version}.json`), JSON.stringify(data, null, 2), 'utf8');
  return version;
}

async function getJson(url, signal) {
  const res = await fetch(url, { signal, headers: { accept: 'application/json,text/html;q=0.9' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

function decodeHtmlEntities(str) {
  return str.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

async function fetchTablesForVersion(versionTitle, signal) {
  const res = await fetch(`${BASE_URL}/tables/${encodeURIComponent(versionTitle)}`, { signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const html = await res.text();
  const start = '<tables-page :cv="', end = '" rk=';
  const i = html.indexOf(start);
  if (i === -1) throw new Error('Tabellenliste nicht gefunden (Seitenaufbau geändert?).');
  const j = html.indexOf(end, i + start.length);
  if (j === -1) throw new Error('Tabellenliste unvollständig.');
  const data = JSON.parse(decodeHtmlEntities(html.slice(i + start.length, j)));
  return data.tables ?? data;
}

/** Versions on wawi-db.jtl-software.de that we do not have yet (bundled or user). */
export async function findMissingVersions(signal) {
  const remote = await getJson(`${BASE_URL}/int/versions`, signal);
  const have = new Set(listVersions());
  return remote
    .map(v => String(v.title || '').trim())
    .filter(t => VERSION_RE.test(t) && compareVersions(t, MIN_VERSION) > 0 && !have.has(t))
    .sort(compareVersions);
}

/**
 * Download one version's full schema into `userDir`.
 * onProgress({ version, done, total }) is called per chunk of tables.
 */
export async function downloadVersion(version, userDir, { onProgress, signal, concurrency = 12, delayMs = 250 } = {}) {
  const tables = await fetchTablesForVersion(version, signal);
  const out = [];
  for (let i = 0; i < tables.length; i += concurrency) {
    const chunk = tables.slice(i, i + concurrency);
    const rows = await Promise.all(chunk.map(async (t) => {
      const name = `${t.schema_name}.${t.object_name}`;
      try {
        const cols = await getJson(`${BASE_URL}/int/table-columns/${t.id}`, signal);
        return { name, columns: cols.map(c => ({ name: c.column_name, type: c.type, nullable: c.is_nullable === 1, description: c.description ?? '' })) };
      } catch (err) {
        if (signal?.aborted) throw err;
        return { name, columns: [] };
      }
    }));
    out.push(...rows);
    onProgress?.({ version, done: Math.min(i + concurrency, tables.length), total: tables.length });
    if (i + concurrency < tables.length) await new Promise(r => setTimeout(r, delayMs));
  }
  await ensureDir(userDir);
  const tmp = join(userDir, `${version}.json.tmp`);
  await fs.writeFile(tmp, JSON.stringify({ version, tables: out }, null, 2), 'utf8');
  await fs.rename(tmp, join(userDir, `${version}.json`));
  return out.length;
}

/** Remove a user-imported version (bundled ones cannot be deleted). */
export async function removeUserVersion(version, userDir) {
  const p = join(userDir, `${version}.json`);
  if (!existsSync(p)) return false;
  await fs.unlink(p);
  return true;
}
