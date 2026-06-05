/**
 * Community gallery — the detailed "Vorlagen / Community" browse experience.
 * Search, sort, tag-filter and import community reports. Each card shows its
 * icon/color, author, downloads, executions, step count and tags.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Icon, Eyebrow, Btn, TextField, hexA, lighten, MONO } from './ui.jsx';
import { listFlows, hubStats, hubTags, downloadFlow } from '../../lib/hubApi.js';

const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n ?? 0));

const SORTS = [
  { value: 'featured', label: 'Empfohlen' },
  { value: 'downloads', label: 'Beliebt' },
  { value: 'executions', label: 'Ausgeführt' },
  { value: 'newest', label: 'Neu' },
];

export default function CommunityGallery({ onClose, onImport }) {
  const [flows, setFlows] = useState([]);
  const [stats, setStats] = useState(null);
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('featured');
  const [activeTags, setActiveTags] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [importingId, setImportingId] = useState(null);

  const fetchFlows = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await listFlows({ page, limit: 12, sort, search, tags: activeTags.join(';') });
      setFlows(data.flows || []);
      setPagination(data.pagination || { total: 0, pages: 1 });
    } catch {
      setError('Community-Server nicht erreichbar.');
      setFlows([]);
    } finally {
      setLoading(false);
    }
  }, [page, sort, search, activeTags]);

  useEffect(() => { fetchFlows(); }, [fetchFlows]);
  useEffect(() => { hubStats().then(setStats).catch(() => {}); hubTags().then(setTags).catch(() => {}); }, []);
  useEffect(() => { setPage(1); }, [search, sort, activeTags]);

  const toggleTag = (t) => setActiveTags(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);

  const doImport = async (flow) => {
    setImportingId(flow.id);
    try {
      const full = await downloadFlow(flow.id); // increments downloads, returns full
      onImport(full);
    } catch {
      setError('Import fehlgeschlagen.');
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div style={{ position: 'relative', zIndex: 2, maxWidth: 1120, margin: '0 auto', padding: '28px 32px 120px' }}>
      {/* Header */}
      <div className="fade-up" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
          <Icon name="chevronRight" size={14} style={{ transform: 'rotate(180deg)' }} /> Zurück
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>Community-Berichte</h1>
          <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>Fertige Auswertungen aus der JTL-Community — importieren & ausführen.</p>
        </div>
        {stats && (
          <div style={{ display: 'flex', gap: 22 }}>
            {[['Berichte', stats.flows], ['Downloads', stats.downloads], ['Ausführungen', stats.executions]].map(([l, v]) => (
              <div key={l} style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: MONO, color: '#fff' }}>{fmt(v)}</div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="fade-up" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <TextField value={search} onChange={setSearch} placeholder="Community durchsuchen…" icon="search" style={{ height: 44 }} />
        </div>
        <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {SORTS.map(s => (
            <button key={s.value} onClick={() => setSort(s.value)} style={{
              padding: '7px 13px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 550, fontFamily: 'inherit', transition: 'all .14s',
              background: sort === s.value ? 'rgba(59,130,246,0.18)' : 'transparent',
              color: sort === s.value ? '#93c5fd' : 'rgba(255,255,255,0.55)',
            }}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Tag filter */}
      {tags.length > 0 && (
        <div className="fade-up" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
          {tags.slice(0, 16).map(t => {
            const on = activeTags.includes(t);
            return (
              <button key={t} onClick={() => toggleTag(t)} style={{
                padding: '5px 11px', borderRadius: 999, border: `1px solid ${on ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
                background: on ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.03)', color: on ? '#93c5fd' : 'rgba(255,255,255,0.5)',
                cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', transition: 'all .14s',
              }}>#{t}</button>
            );
          })}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13.5 }}>Lädt…</p>
      ) : error ? (
        <p style={{ color: lighten('#f43f5e'), fontSize: 13.5 }}>{error}</p>
      ) : flows.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13.5 }}>Keine Berichte gefunden.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
          {flows.map(f => <FlowCard key={f.id} flow={f} importing={importingId === f.id} onImport={() => doImport(f)} />)}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 26 }}>
          <Btn variant="glass" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Zurück</Btn>
          <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', fontFamily: MONO }}>{page} / {pagination.pages}</span>
          <Btn variant="glass" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>Weiter</Btn>
        </div>
      )}
    </div>
  );
}

function FlowCard({ flow, importing, onImport }) {
  const [hover, setHover] = useState(false);
  const c = flow.color || '#3b82f6';
  const tags = (flow.tags || '').split(';').filter(Boolean);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', borderRadius: 'var(--card-radius)', padding: 18, overflow: 'hidden',
        background: hover ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${hover ? hexA(c, 0.4) : 'rgba(255,255,255,0.09)'}`,
        boxShadow: hover ? `0 24px 50px -24px ${hexA(c, 0.5)}` : '0 12px 30px -22px rgba(0,0,0,0.6)',
        transition: 'all .2s ease', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(110% 70% at 100% 0%, ${hexA(c, hover ? 0.12 : 0.06)}, transparent 55%)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexA(c, 0.15), border: `1px solid ${hexA(c, 0.3)}`, color: lighten(c) }}>
          <Icon name={flow.icon || 'sparkles'} size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <h3 style={{ fontSize: 15.5, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{flow.title}</h3>
            {flow.featured && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 5, background: hexA('#f59e0b', 0.16), color: lighten('#f59e0b') }}>Empfohlen</span>}
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>von {flow.author}</div>
        </div>
      </div>

      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.5, minHeight: 38, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {flow.description || 'Keine Beschreibung.'}
      </p>

      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tags.slice(0, 4).map(t => <span key={t} style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.04)' }}>#{t}</span>)}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 'auto', paddingTop: 4 }}>
        <span style={stat}><Icon name="download" size={13} /> {fmt(flow.downloads)}</span>
        <span style={stat}><Icon name="play" size={12} /> {fmt(flow.executions)}</span>
        <span style={stat}><Icon name="layers" size={13} /> {flow.stepCount}</span>
        <div style={{ flex: 1 }} />
        <Btn variant={hover ? 'primary' : 'glass'} size="sm" icon={importing ? 'zap' : 'download'} onClick={onImport} disabled={importing}>
          {importing ? 'Lädt…' : 'Importieren'}
        </Btn>
      </div>
    </div>
  );
}

const stat = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: "'Geist Mono', monospace" };
