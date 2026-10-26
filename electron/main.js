/**
 * DBFLOW desktop — Electron main process.
 *
 * What runs where
 * ───────────────
 *   main      → this file: window, menu, IPC, in-process bridge server
 *               (electron/server.js), schema updates (electron/schemas.js),
 *               app auto-update (electron-updater)
 *   renderer  → the unchanged Vite build from dist/, loaded from
 *               http://127.0.0.1:<random port> so `/api/*` is same-origin
 *   preload   → electron/preload.cjs exposes `window.dbflow` (contextBridge)
 *
 * Schema files: bundled `versions/*.json` + `<userData>/versions/*.json`
 * (BRIDGE_VERSIONS_DIRS). Users drop newer JTL schema JSONs there, import
 * them via the File menu, or fetch missing ones from JTL directly.
 */
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell, nativeTheme } from 'electron';
import { promises as fs, existsSync, readFileSync } from 'fs';
import { dirname, join, delimiter } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');                       // app root (inside app.asar when packaged)

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const REPO_URL = 'https://github.com/RemotaTech/JTL-DB-FLOW';
const DEFAULT_HUB = 'https://db-flow.remotatech.com';
const DEV_URL = process.env.ELECTRON_DEV_URL || '';     // e.g. http://localhost:5173 (npm run electron:dev)

const userData = app.getPath('userData');
const USER_VERSIONS_DIR = join(userData, 'versions');
const SETTINGS_FILE = join(userData, 'settings.json');
const KEYSTORE_FILE = join(userData, 'keystore.json');

// Desktop app always talks to the user's own LAN SQL Server.
process.env.BRIDGE_ALLOW_PRIVATE_HOSTS ??= 'true';
process.env.BRIDGE_VERSIONS_DIRS = [USER_VERSIONS_DIR, process.env.BRIDGE_VERSIONS_DIRS].filter(Boolean).join(delimiter);
// "Struktur aus Datenbank übernehmen" (Settings) saves next to imported/downloaded schemas.
process.env.BRIDGE_SCHEMA_WRITE_DIR = USER_VERSIONS_DIR;

// ── settings.json ({ hubUrl }) ────────────────────────────────────────────
function readSettings() {
  try { return JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')) || {}; } catch { return {}; }
}
const settings = readSettings();
const HUB_URL = (process.env.DBFLOW_HUB_URL || settings.hubUrl || DEFAULT_HUB).replace(/\/+$/, '');

// ── single instance ───────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let server = null;
let origin = '';

const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };
const toast = (kind, text, ms = 3000) => send('dbflow:toast', { kind, text, ms });
const versionsChanged = () => send('dbflow:versions-changed', {});

// ── window ────────────────────────────────────────────────────────────────
async function createWindow() {
  nativeTheme.themeSource = 'dark';
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 900, minHeight: 600,
    title: 'DBFLOW — JTL Report Builder',
    backgroundColor: '#050505',
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      additionalArguments: [`--dbflow-hub-url=${HUB_URL}`, `--dbflow-app-version=${pkg.version}`],
    },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });

  // Keep navigation inside the app; open everything else in the system browser.
  const allowed = new Set([origin, DEV_URL].filter(Boolean).map(u => new URL(u).origin));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    try { if (!allowed.has(new URL(url).origin)) { e.preventDefault(); shell.openExternal(url); } } catch { e.preventDefault(); }
  });

  await win.loadURL(DEV_URL || origin);
}

// ── schema actions (menu + IPC) ───────────────────────────────────────────
let schemas; // lazy ESM import (keeps startup snappy)
const loadSchemas = async () => (schemas ??= await import('./schemas.js'));

async function importSchema() {
  const { importSchemaFile } = await loadSchemas();
  const r = await dialog.showOpenDialog(win, {
    title: 'JTL-Schema importieren', buttonLabel: 'Importieren',
    filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile', 'multiSelections'],
  });
  if (r.canceled || !r.filePaths.length) return { imported: [], errors: [] };
  const imported = [], errors = [];
  for (const p of r.filePaths) {
    try { imported.push(await importSchemaFile(p, USER_VERSIONS_DIR)); }
    catch (err) { errors.push(`${p.split(/[\\/]/).pop()}: ${err.message}`); }
  }
  if (imported.length) { versionsChanged(); toast('success', `Schema importiert: ${imported.join(', ')}`); }
  if (errors.length) toast('error', errors.join(' · '), 6000);
  return { imported, errors };
}

let updating = false;
async function updateSchemas() {
  if (updating) { toast('info', 'Schema-Aktualisierung läuft bereits…'); return { started: false }; }
  updating = true;
  const { findMissingVersions, downloadVersion } = await loadSchemas();
  try {
    toast('info', 'Suche neue JTL-Wawi Versionen…', 2500);
    const missing = await findMissingVersions();
    if (!missing.length) { toast('success', 'Alle bekannten JTL-Versionen sind bereits vorhanden.'); return { added: [] }; }
    const added = [];
    for (const v of missing) {
      try {
        let last = 0;
        await downloadVersion(v, USER_VERSIONS_DIR, {
          onProgress: ({ done, total }) => { if (done - last >= 60 || done === total) { last = done; toast('info', `Lade ${v}: ${done}/${total} Tabellen…`, 2500); } },
        });
        added.push(v);
        versionsChanged();
      } catch (err) {
        toast('error', `Version ${v} konnte nicht geladen werden: ${err.message}`, 6000);
      }
    }
    if (added.length) toast('success', `Neue Versionen geladen: ${added.join(', ')}`, 5000);
    return { added };
  } catch (err) {
    toast('error', `Aktualisierung fehlgeschlagen: ${err.message}`, 6000);
    return { error: err.message };
  } finally {
    updating = false;
  }
}

async function openSchemaFolder() {
  await fs.mkdir(USER_VERSIONS_DIR, { recursive: true });
  await shell.openPath(USER_VERSIONS_DIR);
}

// ── app auto-update (GitHub Releases) ─────────────────────────────────────
let autoUpdater = null;
function setupAutoUpdater() {
  // Only real installers carry app-update.yml; `electron-builder --dir` output does not.
  if (!app.isPackaged || !existsSync(join(process.resourcesPath, 'app-update.yml'))) return;
  try {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available',   (i) => toast('info', `Update ${i.version} wird heruntergeladen…`, 4000));
    autoUpdater.on('update-downloaded',  async (i) => {
      const r = await dialog.showMessageBox(win, {
        type: 'info', buttons: ['Jetzt neu starten', 'Später'], defaultId: 0, cancelId: 1,
        message: `DBFLOW ${i.version} ist bereit.`, detail: 'Das Update wird beim Neustart installiert.',
      });
      if (r.response === 0) autoUpdater.quitAndInstall();
    });
    autoUpdater.on('error', (e) => console.warn('autoUpdater:', e?.message || e));
    autoUpdater.checkForUpdates().catch(() => {});
  } catch (err) {
    console.warn('electron-updater unavailable:', err.message);
  }
}
async function checkForUpdates() {
  if (!autoUpdater) { toast('info', 'Update-Prüfung nur in der installierten App verfügbar.'); return { available: false }; }
  try {
    const r = await autoUpdater.checkForUpdates();
    const latest = r?.updateInfo?.version;
    if (!latest || latest === pkg.version) toast('success', `DBFLOW ${pkg.version} ist aktuell.`);
    return { available: !!latest && latest !== pkg.version, latest };
  } catch (err) {
    toast('error', `Update-Prüfung fehlgeschlagen: ${err.message}`, 5000);
    return { error: err.message };
  }
}

// ── key store (safeStorage → OS keychain / DPAPI / libsecret) ────────────
async function readKeystore() { try { return JSON.parse(await fs.readFile(KEYSTORE_FILE, 'utf8')) || {}; } catch { return {}; } }
async function writeKeystore(obj) { await fs.mkdir(userData, { recursive: true }); await fs.writeFile(KEYSTORE_FILE, JSON.stringify(obj), { mode: 0o600 }); }
const keystoreOk = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };

// ── IPC ───────────────────────────────────────────────────────────────────
ipcMain.handle('dbflow:schemas:import',       () => importSchema());
ipcMain.handle('dbflow:schemas:openFolder',   () => openSchemaFolder());
ipcMain.handle('dbflow:schemas:update',       () => updateSchemas());
ipcMain.handle('dbflow:schemas:userVersions', async () => {
  try { return (await fs.readdir(USER_VERSIONS_DIR)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)); } catch { return []; }
});
ipcMain.handle('dbflow:schemas:remove', async (_e, v) => {
  if (!/^[\w.]{1,32}$/.test(v) || v.includes('..')) return false;
  const { removeUserVersion } = await loadSchemas();
  const ok = await removeUserVersion(v, USER_VERSIONS_DIR);
  if (ok) versionsChanged();
  return ok;
});
ipcMain.handle('dbflow:updates:check', () => checkForUpdates());

ipcMain.handle('dbflow:keystore:get', async (_e, k) => {
  if (!keystoreOk()) return null;
  const b64 = (await readKeystore())[k];
  if (!b64) return null;
  try { return safeStorage.decryptString(Buffer.from(b64, 'base64')); } catch { return null; }
});
ipcMain.handle('dbflow:keystore:set', async (_e, k, v) => {
  if (!keystoreOk()) return false;
  const store = await readKeystore();
  store[k] = safeStorage.encryptString(v).toString('base64');
  await writeKeystore(store);
  return true;
});
ipcMain.handle('dbflow:keystore:remove', async (_e, k) => {
  const store = await readKeystore();
  if (k in store) { delete store[k]; await writeKeystore(store); }
  return true;
});

// ── lifecycle ─────────────────────────────────────────────────────────────
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(async () => {
  app.setAppUserModelId('com.remotatech.dbflow');
  await fs.mkdir(USER_VERSIONS_DIR, { recursive: true }).catch(() => {});

  const { startServer } = await import('./server.js');
  // Dev: fixed port 3001 so Vite's /api proxy reaches this bridge. Prod: random loopback port.
  const started = await startServer({ distDir: join(ROOT, 'dist'), port: DEV_URL ? 3001 : 0, hubUrl: HUB_URL });
  server = started.server; origin = started.origin;
  console.log(`DBFLOW bridge+static on ${origin}${DEV_URL ? ` (renderer from ${DEV_URL})` : ''}`);

  const { buildMenu } = await import('./menu.js');
  buildMenu({ onImportSchema: importSchema, onOpenSchemaFolder: openSchemaFolder, onUpdateSchemas: updateSchemas, onCheckUpdates: checkForUpdates, hubUrl: HUB_URL, repoUrl: REPO_URL });

  await createWindow();
  setupAutoUpdater();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('before-quit', async () => {
  try { const { closeAllPools } = await import(pathToFileURL(join(ROOT, 'bridge/app.js')).href); await closeAllPools(); } catch { /* ignore */ }
  server?.close();
});
