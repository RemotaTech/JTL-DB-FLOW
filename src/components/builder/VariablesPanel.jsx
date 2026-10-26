/**
 * Floating Variables panel — reusable `@tokens` injected into filter values.
 *
 * A variable's value is a SQL expression (typically a date), so merchants can
 * reuse "Letzte 30 Tage" across filters without retyping. Non-technical users
 * pick from presets; the raw expression stays editable for power users.
 */
import React, { useState } from 'react';
import { Icon, Eyebrow, Dropdown, MenuItem, hexA, lighten, MONO, iconBtnStyle } from './ui.jsx';
import { sanitizeVar } from '../../lib/validate.js';

const addRow = (color) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: `1px dashed ${hexA(color, 0.35)}`, background: hexA(color, 0.06), color: lighten(color), fontSize: 12.5, fontWeight: 550, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .14s', whiteSpace: 'nowrap' });

/** Ready-made expressions — the 90 % case for a merchant. */
export const PRESETS = [
  { label: 'Heute',            value: 'CAST(GETDATE() AS date)' },
  { label: 'Gestern',          value: 'CAST(DATEADD(day, -1, GETDATE()) AS date)' },
  { label: 'Letzte 7 Tage',    value: 'DATEADD(day, -7, GETDATE())' },
  { label: 'Letzte 30 Tage',   value: 'DATEADD(day, -30, GETDATE())' },
  { label: 'Letzte 90 Tage',   value: 'DATEADD(day, -90, GETDATE())' },
  { label: 'Letzte 12 Monate', value: 'DATEADD(month, -12, GETDATE())' },
  { label: 'Monatsanfang',     value: 'DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)' },
  { label: 'Jahresanfang',     value: 'DATEFROMPARTS(YEAR(GETDATE()), 1, 1)' },
];

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export default function VariablesPanel({ vars, setVars, onClose }) {
  const update = (id, patch) => setVars(vars.map(v => v.id === id ? { ...v, ...patch } : v));
  const remove = (id) => setVars(vars.filter(v => v.id !== id));
  const add = () => {
    let n = 1, name = 'variable';
    while (vars.some(v => v.name === name)) name = `variable${++n}`;
    setVars([...vars, { id: 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, value: '', label: '' }]);
  };

  return (
    <div className="float-panel" role="region" aria-label="Variablen" style={{
      width: 320, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100dvh - 110px)', overflowY: 'auto', borderRadius: 18, padding: 16, background: 'rgba(16,16,20,0.9)',
      backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 30px 70px -20px rgba(0,0,0,0.8)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <Icon name="braces" size={15} style={{ color: '#60a5fa' }} />
        <Eyebrow color="rgba(255,255,255,0.7)">Variablen</Eyebrow>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={iconBtnStyle} aria-label="Schließen"><Icon name="x" size={15} /></button>
      </div>
      <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', margin: '0 0 12px', lineHeight: 1.45 }}>
        In Filtern als <span style={{ fontFamily: MONO, color: '#93c5fd' }}>@name</span> einsetzbar — z. B. für Zeiträume.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {vars.map(v => <VarCard key={v.id} v={v} vars={vars} update={update} remove={remove} />)}
        {vars.length === 0 && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', margin: 0 }}>Noch keine Variablen.</p>}
      </div>
      <button onClick={add} style={{ ...addRow('#3b82f6'), width: '100%', justifyContent: 'center', marginTop: 12 }}>
        <Icon name="plus" size={14} /> Variable hinzufügen
      </button>
    </div>
  );
}

function VarCard({ v, vars, update, remove }) {
  const [editName, setEditName] = useState(false);
  const [draft, setDraft] = useState(v.name);
  const dup = vars.some(o => o.id !== v.id && o.name === draft);
  const nameOk = NAME_RE.test(draft) && !dup;
  const valueOk = v.value === '' || !!sanitizeVar({ name: 'x', value: v.value }, () => 'x');
  const preset = PRESETS.find(p => p.value === v.value);

  const commitName = () => {
    if (nameOk) update(v.id, { name: draft });
    else setDraft(v.name);
    setEditName(false);
  };

  return (
    <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: `1px solid ${valueOk ? 'rgba(255,255,255,0.08)' : 'rgba(244,63,94,0.4)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
        {editName ? (
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} onBlur={commitName} maxLength={40}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setDraft(v.name); setEditName(false); } }}
            aria-label="Variablenname"
            style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: nameOk ? '#93c5fd' : '#fb7185', background: 'rgba(0,0,0,0.3)', border: `1px solid ${nameOk ? 'rgba(59,130,246,0.5)' : 'rgba(244,63,94,0.5)'}`, borderRadius: 7, padding: '3px 8px', outline: 'none', width: 150 }} />
        ) : (
          <button onClick={() => { setDraft(v.name); setEditName(true); }} title="Name ändern" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: MONO, fontSize: 13, color: '#93c5fd', fontWeight: 600 }}>
            @{v.name} <Icon name="pencil" size={11} style={{ color: 'rgba(255,255,255,0.35)' }} />
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => remove(v.id)} style={{ ...iconBtnStyle, width: 22, height: 22 }} className="del" title="Variable entfernen" aria-label="Variable entfernen"><Icon name="x" size={13} /></button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 7 }}>
        <input value={v.value} onChange={(e) => update(v.id, { value: e.target.value, label: PRESETS.find(p => p.value === e.target.value)?.label ?? v.label })} placeholder="SQL-Ausdruck, z. B. GETDATE()" maxLength={300} aria-label="Wert (SQL)"
          style={{ flex: 1, minWidth: 0, height: 32, padding: '0 10px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12.5, fontFamily: MONO, outline: 'none', boxSizing: 'border-box' }} />
        <Dropdown width={210} align="right" trigger={(open) => (
          <button title="Vorlage wählen" aria-label="Vorlage wählen" style={{ ...iconBtnStyle, width: 32, height: 32, color: open ? '#93c5fd' : 'rgba(255,255,255,0.6)' }}><Icon name="sparkles" size={14} /></button>
        )}>
          {(close) => PRESETS.map(p => (
            <MenuItem key={p.label} active={preset?.label === p.label} onClick={() => { update(v.id, { value: p.value, label: p.label }); close(); }}>{p.label}</MenuItem>
          ))}
        </Dropdown>
      </div>
      {!valueOk && <div style={{ fontSize: 11, color: '#fb7185', marginBottom: 6 }}>Ungültig: Semikolons, Kommentare und schreibende Befehle sind nicht erlaubt.</div>}
      <input value={v.label || ''} onChange={(e) => update(v.id, { label: e.target.value })} placeholder="Beschreibung (optional)" maxLength={80} aria-label="Beschreibung"
        style={{ width: '100%', height: 28, padding: '0 10px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.45)', fontSize: 11.5, outline: 'none', boxSizing: 'border-box' }} />
    </div>
  );
}
