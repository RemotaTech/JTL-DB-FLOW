/**
 * Empty / onboarding screen — template gallery + "start blank" table picker.
 * Templates load a runnable real-schema pipeline; blank tiles seed a source.
 */
import React, { useState, useMemo } from 'react';
import { Icon, Eyebrow, TextField, hexA, lighten, MONO } from './ui.jsx';
import { availableTemplates, templateSteps } from '../../lib/reportTemplates.js';

// Group tables by their schema prefix (`Amazon.tFoo` → "Amazon").
function groupBySchema(tables) {
  const map = {};
  for (const t of tables) {
    const schema = t.name.includes('.') ? t.name.split('.')[0] : 'dbo';
    (map[schema] = map[schema] || []).push(t.name);
  }
  return map;
}

export default function EmptyView({ schema, onTemplate, onBlank, onOpenCommunity, localReports = [], onOpenLocal, onDeleteLocal }) {
  const [q, setQ] = useState('');
  const templates = availableTemplates(schema);
  const list = templates.filter(t => (t.title + t.desc + t.tag).toLowerCase().includes(q.toLowerCase()));
  const tables = schema?.tables || [];

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '76px 32px 120px' }}>
      <div className="fade-up" style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', marginBottom: 22, whiteSpace: 'nowrap' }}>
          <Icon name="sparkles" size={13} style={{ color: '#60a5fa' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#93c5fd', letterSpacing: '0.01em' }}>Berichte ohne SQL — einfach zusammenklicken</span>
        </div>
        <h1 style={{ fontSize: 42, fontWeight: 600, letterSpacing: '-0.025em', margin: '0 0 14px', lineHeight: 1.08 }}>Was möchten Sie auswerten?</h1>
        <p style={{ fontSize: 16.5, color: 'rgba(255,255,255,0.5)', margin: 0, maxWidth: 540, marginInline: 'auto', lineHeight: 1.5 }}>
          Wählen Sie eine Vorlage oder starten Sie leer. DBFLOW baut die Abfrage für Ihre JTL-Wawi Schritt für Schritt auf.
        </p>
        <div style={{ maxWidth: 460, margin: '28px auto 0' }}>
          <TextField value={q} onChange={setQ} placeholder="Vorlagen durchsuchen…" icon="search" style={{ height: 46 }} />
        </div>
      </div>

      {/* Meine Berichte — locally saved reports */}
      {localReports.length > 0 && (
        <div className="fade-up" style={{ animationDelay: '.03s', marginBottom: 40 }}>
          <Eyebrow style={{ marginBottom: 16 }}>Meine Berichte</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {localReports.map(r => <LocalCard key={r.id} report={r} onOpen={() => onOpenLocal(r)} onDelete={() => onDeleteLocal(r.id)} />)}
          </div>
        </div>
      )}

      <div className="fade-up" style={{ animationDelay: '.05s' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <Eyebrow>Vorlagen</Eyebrow>
          <div style={{ flex: 1 }} />
          {onOpenCommunity && (
            <button onClick={onOpenCommunity} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', color: '#93c5fd', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 550 }}>
              <Icon name="globe" size={13} /> Community · mehr anzeigen
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {list.map((t) => <TemplateCard key={t.id} t={t} onClick={() => onTemplate(t)} />)}
          {list.length === 0 && <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)' }}>Keine passenden Vorlagen.</p>}
        </div>
      </div>

      <div className="fade-up" style={{ animationDelay: '.12s', marginTop: 44 }}>
        <Eyebrow style={{ marginBottom: 16 }}>Leer starten · Tabelle wählen</Eyebrow>
        <TableBrowser tables={tables} onPick={onBlank} />
      </div>
    </div>
  );
}

function TemplateCard({ t, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        textAlign: 'left', padding: 20, borderRadius: 'var(--card-radius)', cursor: 'pointer', position: 'relative', overflow: 'hidden',
        background: hover ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.035)',
        border: `1px solid ${hover ? hexA(t.color, 0.4) : 'rgba(255,255,255,0.09)'}`,
        boxShadow: hover ? `0 24px 50px -22px ${hexA(t.color, 0.5)}` : '0 12px 30px -20px rgba(0,0,0,0.6)',
        transform: hover ? 'translateY(-3px)' : 'none', transition: 'all .2s ease', fontFamily: 'inherit', color: '#fff',
      }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(110% 70% at 100% 0%, ${hexA(t.color, hover ? 0.13 : 0.07)}, transparent 55%)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 38 }}>
        <div style={{ width: 44, height: 44, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexA(t.color, 0.15), border: `1px solid ${hexA(t.color, 0.3)}`, color: lighten(t.color) }}>
          <Icon name={t.icon} size={22} />
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>{t.tag}</span>
      </div>
      <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 6px', letterSpacing: '-0.01em' }}>{t.title}</h3>
      <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', lineHeight: 1.5 }}>{t.desc}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: hover ? lighten(t.color) : 'rgba(255,255,255,0.4)', fontWeight: 550, transition: 'color .2s' }}>
        <Icon name="layers" size={13} /> {templateSteps(t)} Schritte
        <div style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, transform: hover ? 'translateX(2px)' : 'none', transition: 'transform .2s' }}>Öffnen <Icon name="chevronRight" size={14} /></span>
      </div>
    </button>
  );
}

function LocalCard({ report, onOpen, onDelete }) {
  const [hover, setHover] = useState(false);
  const c = report.color || '#3b82f6';
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={onOpen}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, cursor: 'pointer',
        background: hover ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.035)',
        border: `1px solid ${hover ? hexA(c, 0.4) : 'rgba(255,255,255,0.09)'}`, transition: 'all .16s',
      }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexA(c, 0.14), border: `1px solid ${hexA(c, 0.3)}`, color: lighten(c) }}>
        <Icon name={report.icon || 'database'} size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report.title || 'Unbenannt'}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          {(report.steps?.length || 0)} Schritte{report.hubId ? ' · aus Community' : ''}
        </div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Löschen"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', opacity: hover ? 1 : 0.4 }} className="del">
        <Icon name="trash" size={15} />
      </button>
    </div>
  );
}

// ─── Table browser — schema categories (left) + search + grouped grid ───────
function TableBrowser({ tables, onPick }) {
  const [active, setActive] = useState('__all');
  const [q, setQ] = useState('');

  const groups = useMemo(() => groupBySchema(tables), [tables]);
  const groupNames = useMemo(() => Object.keys(groups).sort((a, b) => a.localeCompare(b)), [groups]);

  const query = q.trim().toLowerCase();
  const visible = useMemo(() => tables.filter(t => {
    const schema = t.name.includes('.') ? t.name.split('.')[0] : 'dbo';
    if (active !== '__all' && schema !== active) return false;
    if (query && !t.name.toLowerCase().includes(query)) return false;
    return true;
  }), [tables, active, query]);

  if (tables.length === 0) {
    return <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)' }}>Schema wird geladen…</p>;
  }

  const catBtn = (key, label, count) => {
    const on = active === key;
    return (
      <button key={key} onClick={() => setActive(key)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
          padding: '8px 11px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 13, fontWeight: on ? 600 : 500, transition: 'all .14s',
          background: on ? 'rgba(59,130,246,0.14)' : 'transparent',
          border: `1px solid ${on ? 'rgba(59,130,246,0.3)' : 'transparent'}`,
          color: on ? '#93c5fd' : 'rgba(255,255,255,0.6)',
        }}>
        <Icon name={key === '__all' ? 'grid' : 'database'} size={14} style={{ color: on ? '#60a5fa' : 'rgba(255,255,255,0.4)' }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 11, fontFamily: MONO, color: 'rgba(255,255,255,0.35)' }}>{count}</span>
      </button>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 16, alignItems: 'start' }}>
      {/* category sidebar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: 8, borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', maxHeight: 460, overflowY: 'auto', position: 'sticky', top: 12 }}>
        <div style={{ padding: '4px 8px 8px' }}><Eyebrow>Schemata</Eyebrow></div>
        {catBtn('__all', 'Alle Tabellen', tables.length)}
        {groupNames.map(g => catBtn(g, g, groups[g].length))}
      </div>

      {/* search + grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <TextField value={q} onChange={setQ} placeholder="Tabelle suchen…" icon="search" />
          </div>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: MONO, whiteSpace: 'nowrap' }}>
            {visible.length} {visible.length === 1 ? 'Tabelle' : 'Tabellen'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
          {visible.map(t => <BlankTile key={t.name} name={t.name} onClick={() => onPick(t.name)} />)}
          {visible.length === 0 && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', gridColumn: '1 / -1' }}>Keine Tabelle gefunden.</p>}
        </div>
      </div>
    </div>
  );
}

function BlankTile({ name, onClick }) {
  const [hover, setHover] = useState(false);
  const label = name.split('.').pop();
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', width: '100%', minWidth: 0,
        background: hover ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.035)',
        border: `1px solid ${hover ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.09)'}`,
        color: '#fff', transition: 'all .16s', transform: hover ? 'translateY(-2px)' : 'none',
      }}>
      <Icon name="table" size={17} style={{ color: hover ? '#60a5fa' : 'rgba(255,255,255,0.55)' }} />
      <div style={{ textAlign: 'left', minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
      </div>
    </button>
  );
}
