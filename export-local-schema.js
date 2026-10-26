/**
 * Export the table/column structure of a locally installed JTL-Wawi database
 * into versions/<version>.json (same format the scraper writes and DB FLOW loads).
 * Use this when wawi-db.jtl-software.de is not reachable or a version is not published yet.
 *
 * Read-only: only queries sys.* catalog views.
 *
 *   DB_PASSWORD=... npm run export:schema -- --host localhost --user sa --version 2.1.0.0
 *
 * Options (env fallback in brackets):
 *   --host <host>        [DB_HOST]      required
 *   --user <user>        [DB_USER]      required
 *   --version <x.y.z.w>                 required, file name of the schema (see Wawi "Hilfe > Info")
 *   --port <port>        [DB_PORT]      direct TCP; otherwise --instance via SQL Browser
 *   --instance <name>    [DB_INSTANCE]
 *   --database <name>    [DB_NAME]      default: eazybusiness
 *   --dir <path>                        default: ./versions
 *   --force                             overwrite an existing file
 * The password is read from DB_PASSWORD only (keeps it out of the shell history).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sql from 'mssql';
import { buildMssqlConfig } from './bridge/app.js';
import { COLUMNS_QUERY, VERSION_RE, formatType, buildSchema } from './bridge/schemaExport.js';

// Re-exported so existing imports/tests keep working.
export { formatType, buildSchema };

export function parseArgs(argv, env = process.env) {
  const opts = {
    host: env.DB_HOST, port: env.DB_PORT, instance: env.DB_INSTANCE,
    user: env.DB_USER, database: env.DB_NAME || 'eazybusiness',
    version: '', dir: './versions', force: false,
  };
  const value = (i, flag) => {
    if (argv[i] === undefined || argv[i].startsWith('--')) throw new Error(`${flag} needs a value`);
    return argv[i];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') opts.force = true;
    else if (['--host', '--port', '--instance', '--user', '--database', '--version', '--dir'].includes(a)) {
      opts[a.slice(2)] = value(++i, a);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  opts.version = opts.version.replace(/^v/i, '');
  if (!VERSION_RE.test(opts.version)) throw new Error('--version is required and must look like 2.1.0.0');
  if (!opts.host) throw new Error('--host (or DB_HOST) is required');
  if (!opts.user) throw new Error('--user (or DB_USER) is required');
  return opts;
}

export async function run(argv = process.argv.slice(2), env = process.env) {
  const opts = parseArgs(argv, env);
  if (!env.DB_PASSWORD) throw new Error('Set the password via the DB_PASSWORD environment variable.');

  const target = path.join(opts.dir, `${opts.version}.json`);
  if (fs.existsSync(target) && !opts.force) {
    throw new Error(`${target} exists already (use --force to overwrite).`);
  }

  const pool = new sql.ConnectionPool(buildMssqlConfig({
    host: opts.host, port: opts.port, instance: opts.instance,
    user: opts.user, password: env.DB_PASSWORD, database: opts.database,
  }));
  console.log(`Connecting to ${opts.user}@${opts.host}/${opts.database} ...`);
  let rows;
  try {
    await pool.connect();
    rows = (await pool.request().query(COLUMNS_QUERY)).recordset;
  } finally {
    await pool.close().catch(() => {});
  }

  const schema = buildSchema(rows);
  if (!schema.tables.length) throw new Error('No tables found (wrong database, or missing VIEW DEFINITION permission?).');
  const withDesc = rows.filter(r => r.description).length;

  fs.mkdirSync(opts.dir, { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: opts.version, ...schema }, null, 2), 'utf-8');
  fs.renameSync(tmp, target);
  console.log(`Saved ${schema.tables.length} tables, ${rows.length} columns (${withDesc} with description) to ${target}`);
  if (!withDesc) console.log('Note: the database has no MS_Description comments, so column descriptions are empty.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run().then(() => process.exit(0), err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
