/** Desktop app — German application menu. */
import { Menu, shell, app } from 'electron';

export function buildMenu({ onImportSchema, onOpenSchemaFolder, onUpdateSchemas, onCheckUpdates, hubUrl, repoUrl }) {
  const isMac = process.platform === 'darwin';
  const tpl = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about', label: `Über ${app.name}` },
        { type: 'separator' },
        { label: 'Nach Updates suchen…', click: onCheckUpdates },
        { type: 'separator' },
        { role: 'services' }, { type: 'separator' },
        { role: 'hide', label: `${app.name} ausblenden` }, { role: 'hideOthers', label: 'Andere ausblenden' }, { role: 'unhide', label: 'Alle einblenden' },
        { type: 'separator' },
        { role: 'quit', label: `${app.name} beenden` },
      ],
    }] : []),
    {
      label: 'Datei',
      submenu: [
        { label: 'Schema-Datei importieren…', accelerator: 'CmdOrCtrl+I', click: onImportSchema },
        { label: 'Neue JTL-Versionen laden', click: onUpdateSchemas },
        { label: 'Schema-Ordner öffnen', click: onOpenSchemaFolder },
        { type: 'separator' },
        ...(isMac ? [{ role: 'close', label: 'Fenster schließen' }] : [
          { label: 'Nach Updates suchen…', click: onCheckUpdates },
          { type: 'separator' },
          { role: 'quit', label: 'Beenden' },
        ]),
      ],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo', label: 'Widerrufen' }, { role: 'redo', label: 'Wiederholen' }, { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' }, { role: 'copy', label: 'Kopieren' }, { role: 'paste', label: 'Einfügen' },
        { role: 'selectAll', label: 'Alles auswählen' },
      ],
    },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'reload', label: 'Neu laden' }, { role: 'forceReload', label: 'Neu laden (ohne Cache)' },
        { role: 'toggleDevTools', label: 'Entwicklertools' }, { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom zurücksetzen' }, { role: 'zoomIn', label: 'Vergrößern' }, { role: 'zoomOut', label: 'Verkleinern' },
        { type: 'separator' }, { role: 'togglefullscreen', label: 'Vollbild' },
      ],
    },
    { label: 'Fenster', role: 'windowMenu' },
    {
      label: 'Hilfe', role: 'help',
      submenu: [
        { label: 'Community Hub öffnen', enabled: !!hubUrl, click: () => shell.openExternal(hubUrl) },
        { label: 'GitHub / Dokumentation', click: () => shell.openExternal(repoUrl) },
        { label: 'Problem melden', click: () => shell.openExternal(`${repoUrl}/issues`) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}
