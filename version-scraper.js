/**
 * Fetch JTL-Wawi database schemas from wawi-db.jtl-software.de into versions/<version>.json.
 *
 * By default only versions that are not in the target directory yet are fetched.
 *
 *   npm run scrape:versions                  # download missing versions
 *   npm run scrape:versions -- --dry-run     # only list what would be downloaded
 *   npm run scrape:versions -- --force       # re-download existing versions too
 *   npm run scrape:versions -- 2.1.0.0       # restrict to given versions
 *   npm run scrape:versions -- --dir ./out   # other target directory
 */
import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE_URL = 'https://wawi-db.jtl-software.de';
const DEFAULT_DIR = './versions';
const MIN_VERSION = '1.11.0.0'; // exclusive, older schemas are not supported
const VERSION_RE = /^\d+(\.\d+){1,3}$/;
const DELAY_MS = 300;
const CONCURRENCY = 20;
const RETRIES = 3;

// Returns <0, 0, >0 like Array.sort comparators ("1.11.0.0" vs "2.0.0.0").
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Which versions to download.
 * `remote` is the /int/versions payload, `have` the versions already on disk,
 * `only` an optional explicit list. Titles are validated because they end up in file names.
 */
export function selectVersions(remote, have, { force = false, only = [] } = {}) {
  const haveSet = new Set(have);
  return remote
    .map(v => String(v?.title ?? '').trim())
    .filter(t => VERSION_RE.test(t) && compareVersions(t, MIN_VERSION) > 0)
    .filter(t => !only.length || only.includes(t))
    .filter(t => force || !haveSet.has(t))
    .sort(compareVersions);
}

export function listLocalVersions(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.slice(0, -'.json'.length))
    .filter(v => VERSION_RE.test(v));
}

export function parseArgs(argv) {
  const opts = { dryRun: false, force: false, dir: DEFAULT_DIR, only: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--dir') opts.dir = argv[++i] ?? '';
    else if (VERSION_RE.test(a)) opts.only.push(a);
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!opts.dir) throw new Error('--dir needs a path');
  return opts;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry(fn) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < RETRIES) await sleep(500 * attempt);
    }
  }
  throw lastErr;
}

async function fetchVersions() {
  const response = await withRetry(() => axios.get(`${BASE_URL}/int/versions`, { timeout: 30000 }));
  if (!Array.isArray(response.data)) throw new Error('Unexpected /int/versions response (expected an array).');
  return response.data;
}

async function fetchTablesForVersion(versionTitle) {
  const response = await withRetry(() => axios.get(`${BASE_URL}/tables/${encodeURIComponent(versionTitle)}`, { timeout: 60000 }));
  const html = response.data;

  // The page embeds the version object as <tables-page :cv="{...}" rk=...
  const startMarker = '<tables-page :cv="';
  const endMarker = '" rk=';
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) throw new Error(`Could not find <tables-page :cv=" in HTML for version ${versionTitle}`);
  const valueStart = startIdx + startMarker.length;
  const endIdx = html.indexOf(endMarker, valueStart);
  if (endIdx === -1) throw new Error(`Could not find closing " rk= in HTML for version ${versionTitle}`);

  const versionData = JSON.parse(decodeHtmlEntities(html.slice(valueStart, endIdx)));
  return versionData.tables ?? versionData;
}

async function fetchColumnsForTable(tableId) {
  const response = await withRetry(() => axios.get(`${BASE_URL}/int/table-columns/${tableId}`, { timeout: 30000 }));
  return response.data;
}

// Downloads one version. Throws (and writes nothing) if any table fails, so an
// incomplete file never counts as "already present" on the next run.
async function downloadVersion(versionTitle, dir) {
  const tables = await fetchTablesForVersion(versionTitle);
  console.log(`  Found ${tables.length} tables`);

  const outputTables = [];
  for (let i = 0; i < tables.length; i += CONCURRENCY) {
    const chunk = tables.slice(i, i + CONCURRENCY);
    const rows = await Promise.all(chunk.map(async table => {
      const name = `${table.schema_name}.${table.object_name}`;
      try {
        const rawColumns = await fetchColumnsForTable(table.id);
        return {
          name,
          columns: rawColumns.map(col => ({
            name: col.column_name,
            type: col.type,
            nullable: col.is_nullable === 1,
            description: col.description ?? '',
          })),
        };
      } catch (err) {
        throw new Error(`${name}: ${err.message}`);
      }
    }));
    outputTables.push(...rows);
    process.stdout.write(`\r  [${Math.min(i + CONCURRENCY, tables.length)}/${tables.length}] tables processed...`);
    await sleep(DELAY_MS);
  }
  console.log();

  fs.mkdirSync(dir, { recursive: true });
  const outputPath = path.join(dir, `${versionTitle}.json`);
  const tmpPath = `${outputPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify({ tables: outputTables }, null, 2), 'utf-8');
  fs.renameSync(tmpPath, outputPath);
  console.log(`  Saved to ${outputPath}`);
}

export async function run(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);

  console.log('Fetching version list...');
  const remote = await fetchVersions();
  const have = listLocalVersions(opts.dir);
  const todo = selectVersions(remote, have, opts);

  console.log(`Remote: ${remote.length} versions, local (${opts.dir}): ${have.length}`);
  if (opts.only.length) {
    const unknown = opts.only.filter(v => !remote.some(r => String(r?.title ?? '').trim() === v));
    if (unknown.length) console.warn(`Not on server: ${unknown.join(', ')}`);
  }
  if (!todo.length) {
    console.log('Nothing to do, all versions are present.');
    return 0;
  }
  console.log(`${opts.dryRun ? 'Would download' : 'To download'} (${todo.length}): ${todo.join(', ')}`);
  if (opts.dryRun) return 0;

  const failed = [];
  for (const version of todo) {
    console.log(`\nProcessing version: ${version}`);
    try {
      await downloadVersion(version, opts.dir);
    } catch (err) {
      console.error(`\n  Failed ${version}: ${err.message}`);
      failed.push(version);
    }
  }

  if (failed.length) {
    console.error(`\nFailed versions (nothing written, rerun to retry): ${failed.join(', ')}`);
    return 1;
  }
  console.log('\nScraping complete!');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run().then(code => process.exit(code), err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
