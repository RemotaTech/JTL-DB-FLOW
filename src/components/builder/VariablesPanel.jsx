/**
 * Floating Variables panel — reusable `@tokens` injected into filter values.
 * A variable's value is raw SQL (e.g. a date expression), so merchants can
 * reuse "Letzte 30 Tage" across filters without retyping.
 */
import React from 'react';
import { Icon, Eyebrow, hexA, lighten, MONO } from './ui.jsx';

const iconBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', transition: 'all .14s' };
const addRow = (color) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: `1px dashed ${hexA(color, 0.35)}`, background: hexA(color, 0.06), color: lighten(color), fontSize: 12.5, fontWeight: 550, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .14s', whiteSpace: 'nowrap' });

export default function VariablesPanel({ vars, setVars, onClose }) {
  const update = (id, patch) => setVars(vars.map(v => v.id === id ? { ...v, ...patch } : v));
  const add = () => setVars([...vars, { id: 'v' + Date.now(), name: 'neueVariable', value: '', label: 'Beschreibung' }]);
  const remove = (id) => setVars(vars.filter(v => v.id !== id));
  return (
    <div className="float-panel" style={{
      width: 308, borderRadius: 18, padding: 16, background: 'rgba(16,16,20,0.86)',
      backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 30px 70px -20px rgba(0,0,0,0.8)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <Icon name="braces" size={15} style={{ color: '#60a5fa' }} />
        <Eyebrow color="rgba(255,255,255,0.7)">Variablen</Eyebrow>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={iconBtn}><Icon name="x" size={15} /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {vars.map(v => (
          <div key={v.id} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
              <span style={{ fontFamily: MONO, fontSize: 13, color: '#93c5fd', fontWeight: 600 }}>@{v.name}</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => remove(v.id)} style={{ ...iconBtn, width: 22, height: 22 }}><Icon name="x" size={13} /></button>
            </div>
            <input value={v.value} onChange={(e) => update(v.id, { value: e.target.value })} placeholder="Wert (SQL)"
              style={{ width: '100%', height: 32, padding: '0 10px', marginBottom: 7, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12.5, fontFamily: MONO, outline: 'none', boxSizing: 'border-box' }} />
            <input value={v.label} onChange={(e) => update(v.id, { label: e.target.value })} placeholder="Beschreibung"
              style={{ width: '100%', height: 28, padding: '0 10px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.45)', fontSize: 11.5, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        ))}
        {vars.length === 0 && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', margin: 0 }}>Noch keine Variablen.</p>}
      </div>
      <button onClick={add} style={{ ...addRow('#3b82f6'), width: '100%', justifyContent: 'center', marginTop: 12 }}>
        <Icon name="plus" size={14} /> Variable hinzufügen
      </button>
    </div>
  );
}
