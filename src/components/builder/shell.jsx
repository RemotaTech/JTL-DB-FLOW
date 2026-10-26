/**
 * Builder chrome — background ambience, logo, top bar (empty view), floating
 * nav pill (builder view), pipeline breadcrumb, step connectors, add-step,
 * bridge-offline banner and toasts.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Icon, Btn, Eyebrow, Dropdown, MenuItem, Notice, Code, lighten, hexA } from './ui.jsx';
import { STEP_META, ADDABLE } from '../../lib/steps.js';

// ─── Background ambience ────────────────────────────────────────────────────
export function BgFX() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '34px 34px', maskImage: 'radial-gradient(ellipse 70% 60% at 50% 30%, #000, transparent)', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 30%, #000, transparent)' }} />
    </div>
  );
}

// ─── Logo ───────────────────────────────────────────────────────────────────
export function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px -2px rgba(59,130,246,0.6)' }}>
        <Icon name="database" size={16} style={{ color: '#fff' }} />
      </div>
      <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>DBFLOW</span>
    </div>
  );
}

/** Green/amber dot: is a database connection configured? */
function ConnDot({ connected }) {
  return <span title={connected ? 'Verbindung konfiguriert' : 'Keine Verbindung konfiguriert'} style={{ width: 7, height: 7, borderRadius: 999, background: connected ? '#34d399' : '#f59e0b', boxShadow: `0 0 0 3px ${hexA(connected ? '#10b981' : '#f59e0b', 0.2)}`, flexShrink: 0 }} />;
}

// ─── Top bar (empty / onboarding view) ──────────────────────────────────────
export function TopBar({ onSettings, onHub, connected }) {
  return (
    <div className="top-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '20px 28px', position: 'relative', zIndex: 5 }}>
      <Logo />
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {onHub && <Btn variant="ghost" icon="globe" size="sm" onClick={onHub} title="Community"><span className="pill-label">Community</span></Btn>}
        <Btn variant="ghost" icon="settings" size="sm" onClick={onSettings} title="Verbindung">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span className="pill-label">Verbindung</span> <ConnDot connected={connected} /></span>
        </Btn>
      </div>
    </div>
  );
}

// ─── Bridge offline banner ──────────────────────────────────────────────────
export function BridgeBanner({ status, onRetry, style = {} }) {
  if (status !== 'offline') return null;
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 28px', ...style }}>
      <Notice kind="offline" title="Bridge-Server nicht erreichbar"
        action={<Btn variant="glass" size="sm" icon="rotate" onClick={onRetry}>Erneut prüfen</Btn>}>
        Schema und Abfragen laufen über den lokalen Bridge-Server. Starten Sie ihn mit <Code>npm run server</Code> (oder <Code>npm run dev:all</Code>) und prüfen Sie erneut.
      </Notice>
    </div>
  );
}

// ─── Toast ──────────────────────────────────────────────────────────────────
export function Toast({ toast }) {
  if (!toast) return null;
  const color = { success: '#10b981', error: '#f43f5e', warning: '#f59e0b', info: '#3b82f6' }[toast.kind] || '#3b82f6';
  const icon  = { success: 'check', error: 'xCircle', warning: 'warning', info: 'info' }[toast.kind] || 'info';
  return (
    <div key={toast.key} role="status" className="modal-in" style={{
      position: 'fixed', left: '50%', bottom: 76, transform: 'translateX(-50%)', zIndex: 120,
      display: 'inline-flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 12, maxWidth: 'min(520px, 92vw)',
      background: 'rgba(16,16,20,0.94)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      border: `1px solid ${hexA(color, 0.4)}`, boxShadow: '0 20px 50px -16px rgba(0,0,0,0.7)', fontSize: 13, color: '#fff',
    }}>
      <Icon name={icon} size={15} style={{ color: lighten(color) }} />
      <span>{toast.text}</span>
    </div>
  );
}

// ─── Nav pill (builder view) ────────────────────────────────────────────────
const pillBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 34, height: 34, borderRadius: 10, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .14s', flexShrink: 0 };

export function NavPill({ title, setTitle, editTitle, setEditTitle, onHome, onRun, onCancel, running, onSettings, showVars, setShowVars, onSave, onPublish, saved, dirty, issues = 0, connected }) {
  const beforeEdit = useRef(title);
  useEffect(() => { if (editTitle) beforeEdit.current = title; }, [editTitle]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => { if (!title.trim()) setTitle(beforeEdit.current || 'Neuer Bericht'); setEditTitle(false); };
  const cancel = () => { setTitle(beforeEdit.current); setEditTitle(false); };
  const runTitle = !connected ? 'Zuerst Verbindung einrichten' : issues ? `${issues} Schritt(e) unvollständig — Abfrage läuft mit dem, was vollständig ist` : 'Ausführen (⌘/Strg + Enter)';

  return (
    <div className="nav-pill" style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: 7, borderRadius: 16,
      background: 'rgba(16,16,20,0.82)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)',
      border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 20px 50px -16px rgba(0,0,0,0.7)',
    }}>
      <button onClick={onHome} style={pillBtn} title="Startseite" aria-label="Startseite">
        <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="database" size={14} style={{ color: '#fff' }} />
        </div>
      </button>
      <div className="pill-sep" style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)' }} />
      {editTitle ? (
        <input autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
          aria-label="Berichtstitel"
          style={{ width: 200, height: 32, padding: '0 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(59,130,246,0.5)', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', outline: 'none' }} />
      ) : (
        <button className="pill-title" onClick={() => setEditTitle(true)} style={{ ...pillBtn, gap: 8, padding: '0 12px', height: 32, minWidth: 0 }} title="Titel bearbeiten">
          <span style={{ fontSize: 14, fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          {dirty && <span title="Ungespeicherte Änderungen" style={{ width: 6, height: 6, borderRadius: 999, background: '#f59e0b', flexShrink: 0 }} />}
          <Icon name="pencil" size={13} style={{ color: 'rgba(255,255,255,0.35)' }} />
        </button>
      )}
      <div className="pill-sep" style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)' }} />
      <button onClick={() => setShowVars(v => !v)} style={{ ...pillBtn, gap: 7, padding: '0 12px', height: 34, color: showVars ? '#93c5fd' : 'rgba(255,255,255,0.7)', background: showVars ? 'rgba(59,130,246,0.14)' : 'transparent' }} title="Variablen">
        <Icon name="braces" size={15} /> <span className="pill-label" style={{ fontSize: 13, fontWeight: 550 }}>Variablen</span>
      </button>
      <button onClick={onSettings} style={{ ...pillBtn, width: 34, height: 34, position: 'relative' }} title="Verbindung" aria-label="Verbindung">
        <Icon name="settings" size={16} />
        {!connected && <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 999, background: '#f59e0b', border: '2px solid rgba(16,16,20,0.9)' }} />}
      </button>
      {onSave && <button onClick={onSave} style={{ ...pillBtn, width: 34, height: 34, color: saved ? '#6ee7b7' : 'rgba(255,255,255,0.7)' }} title="Lokal speichern (⌘/Strg + S)" aria-label="Lokal speichern"><Icon name={saved ? 'check' : 'folder'} size={16} /></button>}
      {onPublish && <button onClick={onPublish} style={{ ...pillBtn, width: 34, height: 34 }} title="In Community veröffentlichen" aria-label="In Community veröffentlichen"><Icon name="globe" size={16} /></button>}
      {running ? (
        <Btn variant="glass" icon="stop" size="md" onClick={onCancel} style={{ marginLeft: 2 }} title="Abfrage abbrechen">Abbrechen</Btn>
      ) : (
        <Btn variant="primary" icon={connected ? 'play' : 'settings'} size="md" onClick={onRun} style={{ marginLeft: 2, position: 'relative' }} title={runTitle}>
          {connected ? 'Ausführen' : 'Verbinden'}
          {issues > 0 && connected && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'rgba(0,0,0,0.25)', color: '#fde68a' }}>{issues}</span>}
        </Btn>
      )}
    </div>
  );
}

// ─── Pipeline breadcrumb ────────────────────────────────────────────────────
export function PipelineHeader({ steps, issues = 0 }) {
  return (
    <div style={{ marginBottom: 22, paddingLeft: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Eyebrow>Abfrage-Pipeline</Eyebrow>
        {issues > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#fde68a' }}>
            <Icon name="warning" size={12} /> {issues} unvollständig
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {steps.map((s, i) => {
          const m = STEP_META[s.type];
          if (!m) return null;
          return (
            <React.Fragment key={s.id}>
              {i > 0 && <Icon name="chevronRight" size={13} style={{ color: 'rgba(255,255,255,0.22)' }} />}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: lighten(m.color), fontWeight: 550 }}>
                <Icon name={m.icon} size={13} /> {m.label}
              </span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Connector between cards ────────────────────────────────────────────────
// join (Verknüpfung) may repeat; every other step type is single-instance.
const isTaken = (type, steps) => type !== 'join' && steps.some(s => s.type === type);

function StepMenu({ steps, onPick, close }) {
  return ADDABLE.map(type => {
    const m = STEP_META[type];
    const taken = isTaken(type, steps);
    return <MenuItem key={type} icon={m.icon} iconColor={lighten(m.color)} disabled={taken} right={taken ? 'hinzugefügt' : undefined} onClick={() => { onPick(type); close(); }}>{m.label}</MenuItem>;
  });
}

export function Connector({ terminal, onInsert, steps = [] }) {
  const [hover, setHover] = useState(false);
  const h = terminal ? 26 : 30;
  const lineColor = 'rgba(255,255,255,0.16)';
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ height: h, marginLeft: 37, position: 'relative', display: 'flex', justifyContent: 'center', width: 0 }}>
      <div style={{ width: 0, height: '100%', borderLeft: `2px solid ${lineColor}` }} />
      {!terminal && (
        <div style={{ position: 'absolute', top: '50%', left: 0, transform: 'translate(-50%,-50%)', width: 9, height: 9, borderRadius: '50%', background: '#0a0a0d', border: '2px solid rgba(255,255,255,0.3)' }} />
      )}
      {!terminal && onInsert && (
        <div style={{ position: 'absolute', top: '50%', left: 0, transform: 'translate(-50%,-50%)', opacity: hover ? 1 : 0, transition: 'opacity .15s', zIndex: 5 }}>
          <Dropdown align="left" width={190} trigger={() => (
            <button aria-label="Schritt hier einfügen" style={{ width: 22, height: 22, borderRadius: '50%', background: '#3b82f6', border: '2px solid #0a0a0d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px -2px rgba(59,130,246,0.6)' }}>
              <Icon name="plus" size={13} />
            </button>
          )}>
            {(close) => <StepMenu steps={steps} onPick={onInsert} close={close} />}
          </Dropdown>
        </div>
      )}
    </div>
  );
}

// ─── Add-step button (end of pipeline) ──────────────────────────────────────
export function AddStepButton({ onAdd, steps = [] }) {
  return (
    <Dropdown align="left" width={220} trigger={(open) => (
      <button style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '15px 18px', borderRadius: 'var(--card-radius)', width: '100%',
        background: open ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.022)', cursor: 'pointer', fontFamily: 'inherit',
        border: `1.5px dashed ${open ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.14)'}`, color: 'rgba(255,255,255,0.6)', transition: 'all .16s',
      }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', color: '#60a5fa' }}>
          <Icon name="plus" size={19} />
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>Schritt hinzufügen</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.4)' }}>Verknüpfung, Filter, Gruppierung …</div>
        </div>
      </button>
    )}>
      {(close) => <StepMenu steps={steps} onPick={onAdd} close={close} />}
    </Dropdown>
  );
}
