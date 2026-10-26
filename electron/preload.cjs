/**
 * Desktop app — preload (runs in the renderer with contextIsolation ON).
 *
 * Exposes a tiny, explicit `window.dbflow` API. The renderer never gets Node or
 * raw ipcRenderer. Everything here is optional for the web build: the React
 * code checks `globalThis.dbflow` and falls back to browser behaviour.
 */
const { contextBridge, ipcRenderer } = require('electron');

const argFlag = (name) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};

const on = (channel) => (cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('dbflow', {
  isElectron: true,
  platform: process.platform,
  appVersion: argFlag('dbflow-app-version'),
  /** Hub the renderer should talk to (overrides VITE_HUB_URL baked at build time). */
  hubUrl: argFlag('dbflow-hub-url'),

  // ── schema versions ──────────────────────────────────────────────────────
  schemas: {
    import:       ()  => ipcRenderer.invoke('dbflow:schemas:import'),
    openFolder:   ()  => ipcRenderer.invoke('dbflow:schemas:openFolder'),
    update:       ()  => ipcRenderer.invoke('dbflow:schemas:update'),
    remove:       (v) => ipcRenderer.invoke('dbflow:schemas:remove', String(v)),
    userVersions: ()  => ipcRenderer.invoke('dbflow:schemas:userVersions'),
  },
  /** Fired whenever the set of schema files changed — re-fetch /api/versions. */
  onVersionsChanged: on('dbflow:versions-changed'),
  /** Main process wants to show a toast: { kind, text, ms }. */
  onToast: on('dbflow:toast'),

  // ── app updates ──────────────────────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('dbflow:updates:check'),

  // ── OS-keychain backed key store (safeStorage) for the credential key ────
  keyStore: {
    get:    (k)    => ipcRenderer.invoke('dbflow:keystore:get', String(k)),
    set:    (k, v) => ipcRenderer.invoke('dbflow:keystore:set', String(k), String(v)),
    remove: (k)    => ipcRenderer.invoke('dbflow:keystore:remove', String(k)),
  },
});
