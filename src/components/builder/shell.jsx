/**
 * Builder chrome — background ambience, logo, top bar (empty view), floating
 * nav pill (builder view), pipeline breadcrumb, step connectors, add-step.
 * Ported from the Claude Design handoff.
 */
import React, { useState } from 'react';
import { Icon, Btn, Eyebrow, Dropdown, MenuItem, lighten } from './ui.jsx';
import { STEP_META, ADDABLE } from '../../lib/steps.js';

// ─── Background ambience ────────────────────────────────────────────────────
export function BgFX() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: '-12%', left: '12%', width: 620, height: 620, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.16), transparent 68%)', filter: 'blur(30px)' }} />
      <div style={{ position: 'absolute', bottom: '-18%', right: '6%', width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.11), transparent 70%)', filter: 'blur(30px)' }} />
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

// ─── Top bar (empty / onboarding view) ──────────────────────────────────────
export function TopBar({ onSettings, onHub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px', position: 'relative', zIndex: 5 }}>
      <Logo />
      <div style={{ display: 'flex', gap: 8 }}>
        {onHub && <Btn variant="ghost" icon="globe" size="sm" onClick={onHub}>Community</Btn>}
        <Btn variant="ghost" icon="settings" size="sm" onClick={onSettings}>Verbindung</Btn>
      </div>
    </div>
  );
}

// ─── Nav pill (builder view) ────────────────────────────────────────────────
const pillBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 34, height: 34, borderRadius: 10, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .14s' };

export function NavPill({ title, setTitle, editTitle, setEditTitle, onHome, onRun, running, onSettings, showVars, setShowVars, onSave, onPublish, saved }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: 7, borderRadius: 16,
      background: 'rgba(16,16,20,0.82)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)',
      border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 20px 50px -16px rgba(0,0,0,0.7)',
    }}>
      <button onClick={onHome} style={pillBtn} title="Startseite">
        <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="database" size={14} style={{ color: '#fff' }} />
        </div>
      </button>
      <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)' }} />
      {editTitle ? (
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => setEditTitle(false)}
          onKeyDown={(e) => e.key === 'Enter' && setEditTitle(false)}
          style={{ width: 200, height: 32, padding: '0 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(59,130,246,0.5)', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', outline: 'none' }} />
      ) : (
        <button onClick={() => setEditTitle(true)} style={{ ...pillBtn, gap: 8, padding: '0 12px', height: 32 }}>
          <span style={{ fontSize: 14, fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          <Icon name="pencil" size={13} style={{ color: 'rgba(255,255,255,0.35)' }} />
        </button>
      )}
      <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)' }} />
      <button onClick={() => setShowVars(v => !v)} style={{ ...pillBtn, gap: 7, padding: '0 12px', height: 34, color: showVars ? '#93c5fd' : 'rgba(255,255,255,0.7)', background: showVars ? 'rgba(59,130,246,0.14)' : 'transparent' }}>
        <Icon name="braces" size={15} /> <span style={{ fontSize: 13, fontWeight: 550 }}>Variablen</span>
      </button>
      <button onClick={onSettings} style={{ ...pillBtn, width: 34, height: 34 }} title="Verbindung"><Icon name="settings" size={16} /></button>
      {onSave && <button onClick={onSave} style={{ ...pillBtn, width: 34, height: 34, color: saved ? '#6ee7b7' : 'rgba(255,255,255,0.7)' }} title="Lokal speichern"><Icon name={saved ? 'check' : 'folder'} size={16} /></button>}
      {onPublish && <button onClick={onPublish} style={{ ...pillBtn, width: 34, height: 34 }} title="In Community veröffentlichen"><Icon name="globe" size={16} /></button>}
      <Btn variant="primary" icon="play" size="md" onClick={onRun} style={{ marginLeft: 2 }}>{running ? 'Läuft…' : 'Ausführen'}</Btn>
    </div>
  );
}

// ─── Pipeline breadcrumb ────────────────────────────────────────────────────
export function PipelineHeader({ steps }) {
  return (
    <div style={{ marginBottom: 22, paddingLeft: 4 }}>
      <Eyebrow style={{ marginBottom: 8 }}>Abfrage-Pipeline</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {steps.map((s, i) => {
          const m = STEP_META[s.type];
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
            <button style={{ width: 22, height: 22, borderRadius: '50%', background: '#3b82f6', border: '2px solid #0a0a0d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px -2px rgba(59,130,246,0.6)' }}>
              <Icon name="plus" size={13} />
            </button>
          )}>
            {(close) => ADDABLE.map(type => {
              const m = STEP_META[type];
              const taken = isTaken(type, steps);
              return <MenuItem key={type} icon={m.icon} iconColor={lighten(m.color)} disabled={taken} right={taken ? 'hinzugefügt' : undefined} onClick={() => { onInsert(type); close(); }}>{m.label}</MenuItem>;
            })}
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
      {(close) => ADDABLE.map(type => {
        const m = STEP_META[type];
        const taken = isTaken(type, steps);
        return <MenuItem key={type} icon={m.icon} iconColor={lighten(m.color)} disabled={taken} right={taken ? 'hinzugefügt' : undefined} onClick={() => { onAdd(type); close(); }}>{m.label}</MenuItem>;
      })}
    </Dropdown>
  );
}
