import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'https://wawi-db.jtl-software.de';
const VERSIONS_DIR = './versions';
const DELAY_MS = 300;

// Compare two version strings like "1.11.0.0"
// Returns true if versionA > versionB
function isVersionGreaterThan(versionA, versionB) {
  const partsA = versionA.split('.').map(Number);
  const partsB = versionB.split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const a = partsA[i] ?? 0;
    const b = partsB[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false; // equal, not strictly greater
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchVersions() {
  const response = await axios.get(`${BASE_URL}/int/versions`);
  return response.data;
}

async function fetchTablesForVersion(versionTitle) {
  const response = await axios.get(`${BASE_URL}/tables/${versionTitle}`);
  const html = response.data;

  // Extract the :cv attribute value between <tables-page :cv=" and " rk=
  const startMarker = '<tables-page :cv="';
  const endMarker = '" rk=';
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(`Could not find <tables-page :cv=" in HTML for version ${versionTitle}`);
  }
  const valueStart = startIdx + startMarker.length;
  const endIdx = html.indexOf(endMarker, valueStart);
  if (endIdx === -1) {
    throw new Error(`Could not find closing " rk= in HTML for version ${versionTitle}`);
  }

  const encodedJson = html.slice(valueStart, endIdx);
  const decodedJson = decodeHtmlEntities(encodedJson);
  const versionData = JSON.parse(decodedJson);
  // The :cv attribute contains the full version object: { id, title, created_at, updated_at, tables: [...] }
  const tables = versionData.tables ?? versionData;
  return tables;
}

async function fetchColumnsForTable(tableId) {
  const response = await axios.get(`${BASE_URL}/int/table-columns/${tableId}`);
  return response.data;
}

async function scrape() {
  // Ensure versions directory exists
  if (!fs.existsSync(VERSIONS_DIR)) {
    fs.mkdirSync(VERSIONS_DIR, { recursive: true });
  }

  console.log('Fetching version list...');
  const allVersions = await fetchVersions();
  console.log(`Total versions found: ${allVersions.length}`);

  const filteredVersions = allVersions.filter(v => isVersionGreaterThan(v.title, '1.11.0.0'));
  console.log(`Versions strictly > 1.11.0.0: ${filteredVersions.map(v => v.title).join(', ')}`);

  for (const version of filteredVersions) {
    const versionTitle = version.title;
    console.log(`\nProcessing version: ${versionTitle}`);

    let tables;
    try {
      tables = await fetchTablesForVersion(versionTitle);
      console.log(`  Found ${tables.length} tables`);
    } catch (err) {
      console.error(`  Failed to fetch tables for ${versionTitle}: ${err.message}`);
      continue;
    }

    const outputTables = [];
    const CONCURRENCY = 20; // Number of parallel requests at a time
    let completed = 0;

    for (let i = 0; i < tables.length; i += CONCURRENCY) {
      const chunk = tables.slice(i, i + CONCURRENCY);
      
      const chunkResults = await Promise.all(chunk.map(async (table) => {
        const tableName = `${table.schema_name}.${table.object_name}`;
        let columns = [];
        try {
          const rawColumns = await fetchColumnsForTable(table.id);
          columns = rawColumns.map(col => ({
            name: col.column_name,
            type: col.type,
            nullable: col.is_nullable === 1,
            description: col.description ?? '',
          }));
        } catch (err) {
          console.error(`\n  ERROR on ${tableName}: ${err.message}`);
        }
        return { name: tableName, columns };
      }));

      outputTables.push(...chunkResults);
      completed += chunk.length;
      process.stdout.write(`\r  [${completed}/${tables.length}] tables processed...`);
      
      await sleep(DELAY_MS);
    }
    console.log();

    const outputData = { tables: outputTables };
    const outputPath = path.join(VERSIONS_DIR, `${versionTitle}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
    console.log(`  Saved to ${outputPath}`);
  }

  console.log('\nScraping complete!');
}

scrape().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
