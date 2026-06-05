/**
 * Settings modal — MSSQL connection (host/port/instance/db/user/pass) + JTL
 * version select. Credentials are encrypted in localStorage and only ever sent
 * to the local bridge (localhost:3001) — never to any remote server.
 */
import React from 'react';
import { Icon, Eyebrow, Btn, TextField, hexA, lighten } from './ui.jsx';

const overlay = { position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' };
const iconBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', transition: 'all .14s' };

function FormField({ label, icon, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
        {icon && <Icon name={icon} size={12} style={{ color: 'rgba(255,255,255,0.35)' }} />}
        <Eyebrow style={{ fontSize: 10 }}>{label}</Eyebrow>
      </div>
      {children}
    </div>
  );
}

function Badge({ icon, color, children }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 10, background: hexA(color, 0.1), border: `1px solid ${hexA(color, 0.25)}`, whiteSpace: 'nowrap' }}>
      <Icon name={icon} size={14} style={{ color: lighten(color) }} />
      <span style={{ fontSize: 12.5, fontWeight: 550, color: lighten(color) }}>{children}</span>
    </div>
  );
}

export default function SettingsModal({
  draft, setField, version, setVersion, versions = [],
  onTest, testing, testResult, onClose, onSave, secure,
}) {
  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} className="modal-in" style={{
        width: 'min(540px, 92vw)', maxHeight: '90vh', overflowY: 'auto', borderRadius: 22, padding: 28,
        background: 'rgba(18,18,22,0.94)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
        border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 40px 100px -20px rgba(0,0,0,0.85)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa' }}>
            <Icon name="server" size={21} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 19, fontWeight: 600, margin: '0 0 3px', letterSpacing: '-0.01em' }}>Datenbankverbindung</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Verbindung zu Ihrer JTL-Wawi SQL-Datenbank</p>
          </div>
          <button onClick={onClose} style={iconBtn}><Icon name="x" size={17} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 12, marginBottom: 12 }}>
          <FormField label="Host / Server" icon="server"><TextField value={draft.host} onChange={(v) => setField('host', v)} mono placeholder="192.168.1.100" /></FormField>
          <FormField label="Port"><TextField value={draft.port} onChange={(v) => setField('port', v)} mono placeholder="1433" /></FormField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <FormField label="Instanz (optional)"><TextField value={draft.instance} onChange={(v) => setField('instance', v)} mono placeholder="SQLS" /></FormField>
          <FormField label="Datenbank" icon="database"><TextField value={draft.database} onChange={(v) => setField('database', v)} mono placeholder="eazybusiness" /></FormField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
          <FormField label="Benutzer" icon="users"><TextField value={draft.user} onChange={(v) => setField('user', v)} mono placeholder="sa" /></FormField>
          <FormField label="Passwort" icon="lock"><TextField value={draft.password} onChange={(v) => setField('password', v)} type="password" mono placeholder="••••••••" /></FormField>
        </div>

        <FormField label="JTL Wawi Version">
          <div style={{ position: 'relative' }}>
            <select value={version} onChange={(e) => setVersion(e.target.value)}
              style={{ width: '100%', appearance: 'none', height: 38, padding: '0 36px 0 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
              <option value="">Standard (schema.json)</option>
              {versions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <Icon name="chevronDown" size={15} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
          </div>
        </FormField>

        <div style={{ display: 'flex', gap: 10, margin: '18px 0 22px', flexWrap: 'wrap' }}>
          <Badge icon="shield" color={secure ? '#10b981' : '#f59e0b'}>{secure ? 'AES-256-GCM' : 'XOR (kein HTTPS)'}</Badge>
          <Badge icon="lock" color="#3b82f6">Nur im Browser</Badge>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Btn variant="glass" icon={testResult === 'ok' ? 'check' : 'zap'} onClick={onTest}
            disabled={testing || !draft.host || !draft.user}
            style={testResult === 'ok' ? { color: '#6ee7b7', borderColor: 'rgba(16,185,129,0.4)' } : testResult === 'error' ? { color: '#fb7185', borderColor: 'rgba(244,63,94,0.4)' } : {}}>
            {testing ? 'Teste Verbindung…' : testResult === 'ok' ? 'Verbindung erfolgreich' : testResult === 'error' ? 'Verbindung fehlgeschlagen' : 'Verbindung testen'}
          </Btn>
          <div style={{ flex: 1 }} />
          <Btn variant="ghost" onClick={onClose}>Abbrechen</Btn>
          <Btn variant="primary" icon="check" onClick={onSave}>Speichern</Btn>
        </div>
      </div>
    </div>
  );
}
