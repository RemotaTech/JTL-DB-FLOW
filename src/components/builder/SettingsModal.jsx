/**
 * Settings modal — MSSQL connection (host/port/instance/db/user/pass) + JTL
 * version select.
 *
 * Honest about where credentials go: they are encrypted in this browser and
 * sent to the bridge at `target` with every query. On localhost that is your
 * own machine; on a hosted deployment it is that server — the modal says so.
 */
import React, { useState } from 'react';
import { Icon, Eyebrow, Btn, TextField, Modal, ModalHeader, Notice, Code, hexA, lighten, iconBtnStyle } from './ui.jsx';

function FormField({ label, icon, children, hint }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
        {icon && <Icon name={icon} size={12} style={{ color: 'rgba(255,255,255,0.35)' }} />}
        <Eyebrow style={{ fontSize: 10 }}>{label}</Eyebrow>
        {hint && <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Badge({ icon, color, children, title }) {
  return (
    <div title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 10, background: hexA(color, 0.1), border: `1px solid ${hexA(color, 0.25)}`, whiteSpace: 'nowrap' }}>
      <Icon name={icon} size={14} style={{ color: lighten(color) }} />
      <span style={{ fontSize: 12.5, fontWeight: 550, color: lighten(color) }}>{children}</span>
    </div>
  );
}

const hostPretty = (t) => { try { return new URL(t).host; } catch { return t; } };

export default function SettingsModal({
  draft, setField, version, setVersion, versions = [],
  onTest, testing, testResult, onClose, onSave, onForget, secure, hint,
  target, localTarget, bridge,
  onExportSchema, exportingSchema, exportResult, schemaSave,
}) {
  const [showPw, setShowPw] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportVersion, setExportVersion] = useState('');
  const desktop = globalThis.dbflow?.isElectron ? globalThis.dbflow : null;   // Electron-only extras
  const canTest = !!(draft.host && draft.user) && !testing && bridge !== 'offline';
  const portLooksWrong = draft.port && !/^\d{1,5}$/.test(draft.port);
  const exportVersionOk = /^\d+(\.\d+){1,3}$/.test(exportVersion.trim().replace(/^v/i, ''));
  const canExport = canTest && !exportingSchema && exportVersionOk && !portLooksWrong;
  const doExport = (overwrite = false) => onExportSchema?.(exportVersion.trim().replace(/^v/i, ''), overwrite);

  return (
    <Modal onClose={onClose} width={560} labelledBy="settings-title">
      <ModalHeader id="settings-title" icon="server" title="Datenbankverbindung" subtitle="Verbindung zu Ihrer JTL-Wawi SQL-Datenbank" onClose={onClose} />

      {hint && <Notice kind="info" style={{ marginBottom: 16 }}>{hint}</Notice>}
      {bridge === 'offline' && (
        <Notice kind="offline" title="Bridge-Server nicht erreichbar" style={{ marginBottom: 16 }}>
          Ohne Bridge kann keine Verbindung getestet werden. Starten: <Code>npm run server</Code>
        </Notice>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 12, marginBottom: 12 }}>
        <FormField label="Host / Server" icon="server"><TextField value={draft.host} onChange={(v) => setField('host', v)} mono placeholder="192.168.1.100" autoComplete="off" /></FormField>
        <FormField label="Port"><TextField value={draft.port} onChange={(v) => setField('port', v.replace(/\D/g, '').slice(0, 5))} mono placeholder="1433" inputMode="numeric" /></FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <FormField label="Instanz" hint="optional"><TextField value={draft.instance} onChange={(v) => setField('instance', v)} mono placeholder="JTLWAWI" /></FormField>
        <FormField label="Datenbank" icon="database" hint="Standard: eazybusiness"><TextField value={draft.database} onChange={(v) => setField('database', v)} mono placeholder="eazybusiness" /></FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 6 }}>
        <FormField label="Benutzer" icon="users"><TextField value={draft.user} onChange={(v) => setField('user', v)} mono placeholder="sa" autoComplete="username" /></FormField>
        <FormField label="Passwort" icon="lock">
          <TextField value={draft.password} onChange={(v) => setField('password', v)} type={showPw ? 'text' : 'password'} mono placeholder="••••••••" autoComplete="current-password"
            suffix={<button type="button" onClick={() => setShowPw(s => !s)} aria-label={showPw ? 'Passwort verbergen' : 'Passwort anzeigen'} style={{ ...iconBtnStyle, width: 24, height: 24, background: 'transparent' }}><Icon name={showPw ? 'eyeOff' : 'eye'} size={14} /></button>} />
        </FormField>
      </div>
      <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)', margin: '0 0 16px', lineHeight: 1.45 }}>
        Ein <b style={{ color: 'rgba(255,255,255,0.55)' }}>lesender</b> SQL-Benutzer genügt — DBFLOW führt ausschließlich SELECT-Abfragen aus.
        {portLooksWrong && <span style={{ color: '#fb7185' }}> Port muss eine Zahl sein.</span>}
      </p>

      <FormField label="JTL Wawi Version" hint="bestimmt das Tabellen-Schema">
        <div style={{ position: 'relative' }}>
          <select value={version} onChange={(e) => setVersion(e.target.value)} aria-label="JTL Wawi Version"
            style={{ width: '100%', appearance: 'none', height: 38, padding: '0 36px 0 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
            <option value="">Standard (schema.json)</option>
            {versions.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <Icon name="chevronDown" size={15} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
        </div>
        {onExportSchema && (
          <div style={{ marginTop: 10 }}>
            <Btn variant="glass" size="sm" icon="database" onClick={() => setShowExport(s => !s)}
              title="Tabellen und Spalten der verbundenen Datenbank als Schema-Version übernehmen">Struktur aus Datenbank übernehmen…</Btn>
            {showExport && (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <TextField value={exportVersion} onChange={setExportVersion} mono placeholder="z. B. 2.1.0.0" maxLength={16} ariaLabel="Versionsnummer für die exportierte Struktur"
                      onKeyDown={(e) => { if (e.key === 'Enter' && canExport) doExport(false); }} />
                  </div>
                  <Btn variant="primary" size="md" icon={exportingSchema ? 'spinner' : 'download'} onClick={() => doExport(false)} disabled={!canExport}>
                    {exportingSchema ? 'Lese Struktur…' : 'Übernehmen'}
                  </Btn>
                </div>
                <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)', margin: '8px 0 0', lineHeight: 1.45 }}>
                  Liest nur Tabellen- und Spaltennamen (keine Daten) mit den oben eingetragenen Zugangsdaten. Die Versionsnummer finden Sie in der Wawi unter Hilfe → Info.{' '}
                  {schemaSave ? 'Sie wird als eigene Schema-Version gespeichert.' : 'Dieser Server speichert nichts — die Datei wird heruntergeladen.'}
                  {!draft.host || !draft.user ? ' Bitte zuerst Host und Benutzer eintragen.' : ''}
                </p>
                {exportResult && (
                  <Notice kind={exportResult.ok ? 'success' : 'error'} style={{ marginTop: 10 }}
                    action={exportResult.exists ? <Btn variant="glass" size="sm" onClick={() => doExport(true)} disabled={!canExport}>Überschreiben</Btn> : undefined}>
                    {exportResult.message}
                  </Notice>
                )}
              </div>
            )}
          </div>
        )}
        {desktop && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Btn variant="glass" size="sm" icon="upload" onClick={() => desktop.schemas.import()} title="Eine <version>.json Schema-Datei hinzufügen">Schema importieren…</Btn>
            <Btn variant="glass" size="sm" icon="download" onClick={() => desktop.schemas.update()} title="Fehlende Versionen von wawi-db.jtl-software.de laden">Neue JTL-Versionen laden</Btn>
            <Btn variant="ghost" size="sm" icon="folder" onClick={() => desktop.schemas.openFolder()} title="Ordner mit eigenen Schema-Dateien öffnen">Ordner öffnen</Btn>
          </div>
        )}
      </FormField>

      {/* Where do the credentials go? */}
      <div style={{ display: 'flex', gap: 8, margin: '18px 0 8px', flexWrap: 'wrap' }}>
        <Badge icon="shield" color={secure ? '#10b981' : '#f59e0b'} title={secure ? 'Im Browser mit AES-256-GCM verschlüsselt gespeichert' : 'Kein HTTPS: nur verschleiert gespeichert'}>{secure ? 'AES-256 im Browser' : 'Nur verschleiert (kein HTTPS)'}</Badge>
        <Badge icon={localTarget ? 'lock' : 'globe'} color={localTarget ? '#3b82f6' : '#f59e0b'} title={`Zugangsdaten werden bei jeder Abfrage an ${target} gesendet`}>
          {localTarget ? 'Bleibt auf diesem Rechner' : `Gesendet an ${hostPretty(target)}`}
        </Badge>
      </div>
      {!localTarget && (
        <Notice kind="warning" style={{ marginBottom: 10 }}>
          Die Zugangsdaten werden für jede Abfrage an <b>{hostPretty(target)}</b> übertragen, damit dieser Server Ihre Datenbank abfragen kann. Wenn Sie das nicht möchten, betreiben Sie DBFLOW lokal (<Code>npm run dev:all</Code>).
        </Notice>
      )}
      {!secure && (
        <Notice kind="warning" style={{ marginBottom: 10 }}>
          Diese Seite läuft ohne HTTPS. Der Browser stellt keine echte Verschlüsselung bereit — Zugangsdaten werden nur verschleiert gespeichert. Nutzen Sie <Code>localhost</Code> oder HTTPS.
        </Notice>
      )}

      {testResult && (
        <Notice kind={testResult.ok ? 'success' : 'error'} style={{ marginTop: 8 }}>{testResult.message}</Notice>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
        <Btn variant="glass" icon={testing ? 'spinner' : testResult?.ok ? 'check' : 'zap'} onClick={onTest} disabled={!canTest}
          style={testResult?.ok ? { color: '#6ee7b7', borderColor: 'rgba(16,185,129,0.4)' } : testResult && !testResult.ok ? { color: '#fb7185', borderColor: 'rgba(244,63,94,0.4)' } : {}}>
          {testing ? 'Teste Verbindung…' : 'Verbindung testen'}
        </Btn>
        {onForget && <Btn variant="danger" icon="trash" size="md" onClick={onForget} title="Gespeicherte Zugangsdaten aus diesem Browser entfernen">Vergessen</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" onClick={onClose}>Abbrechen</Btn>
        <Btn variant="primary" icon="check" onClick={onSave} disabled={!!portLooksWrong}>Speichern</Btn>
      </div>
    </Modal>
  );
}
