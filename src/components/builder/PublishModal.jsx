/**
 * Publish modal — share the current report to the community hub.
 * The author picks a title, description, tags, an icon and an accent color so
 * the report stands out in the gallery.
 */
import React, { useState } from 'react';
import { Icon, Eyebrow, Btn, TextField, hexA, lighten } from './ui.jsx';
import { publishFlow } from '../../lib/hubApi.js';

const overlay = { position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' };
const iconBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' };
const fieldInput = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 13.5, fontFamily: 'inherit', outline: 'none' };

const ICONS = ['cart', 'users', 'package', 'trending', 'grid', 'rotate', 'userPlus', 'layers', 'database', 'table', 'filter', 'sort', 'columns', 'sparkles', 'factory', 'xCircle', 'listOrdered', 'zap', 'shield', 'merge'];
const COLORS = ['#3b82f6', '#a855f7', '#f59e0b', '#f43f5e', '#06b6d4', '#10b981', '#ec4899', '#6366f1', '#f97316', '#14b8a6'];

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <Eyebrow style={{ fontSize: 10 }}>{label}</Eyebrow>
      {children}
    </div>
  );
}

export default function PublishModal({ steps, vars, defaultTitle, defaultIcon, defaultColor, onClose, onPublished }) {
  const [title, setTitle] = useState(defaultTitle && defaultTitle !== 'Neuer Bericht' ? defaultTitle : '');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [author, setAuthor] = useState('');
  const [icon, setIcon] = useState(defaultIcon || 'sparkles');
  const [color, setColor] = useState(defaultColor || '#3b82f6');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const hasSource = steps.some(s => s.type === 'source' && s.table);

  const submit = async () => {
    if (!title.trim() || !hasSource) return;
    setBusy(true); setError(null);
    try {
      await publishFlow({ title, description, tags, icon, color, author, flowData: { steps, vars } });
      setDone(true);
      onPublished?.();
    } catch (e) {
      setError(e.message || 'Veröffentlichen fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} className="modal-in" style={{
        width: 'min(560px, 94vw)', maxHeight: '90vh', overflowY: 'auto', borderRadius: 22, padding: 26,
        background: 'rgba(18,18,22,0.95)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
        border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 40px 100px -20px rgba(0,0,0,0.85)',
      }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 8px' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexA('#10b981', 0.15), border: `1px solid ${hexA('#10b981', 0.3)}`, color: lighten('#10b981') }}>
              <Icon name="check" size={28} />
            </div>
            <h2 style={{ fontSize: 19, fontWeight: 600, margin: '0 0 6px' }}>Veröffentlicht!</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.5)', margin: '0 0 20px' }}>Dein Bericht ist jetzt in der Community verfügbar.</p>
            <Btn variant="primary" icon="check" onClick={onClose}>Fertig</Btn>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 22 }}>
              <div style={{ width: 44, height: 44, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexA(color, 0.15), border: `1px solid ${hexA(color, 0.3)}`, color: lighten(color), transition: 'all .2s' }}>
                <Icon name={icon} size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 19, fontWeight: 600, margin: '0 0 3px', letterSpacing: '-0.01em' }}>In Community veröffentlichen</h2>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Teile diesen Bericht mit der JTL-Community</p>
              </div>
              <button onClick={onClose} style={iconBtn}><Icon name="x" size={17} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="Titel *">
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="z. B. Umsatz nach Kategorie" style={fieldInput} />
              </Field>
              <Field label="Beschreibung">
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Was wertet dieser Bericht aus?" style={{ ...fieldInput, resize: 'vertical', lineHeight: 1.5 }} />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Tags (mit ; trennen)">
                  <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="umsatz; kunden" style={fieldInput} />
                </Field>
                <Field label="Autor (optional)">
                  <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Dein Name" style={fieldInput} />
                </Field>
              </div>

              <Field label="Symbol">
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {ICONS.map(n => {
                    const on = n === icon;
                    return (
                      <button key={n} onClick={() => setIcon(n)} style={{
                        width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .14s',
                        background: on ? hexA(color, 0.18) : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${on ? hexA(color, 0.5) : 'rgba(255,255,255,0.08)'}`,
                        color: on ? lighten(color) : 'rgba(255,255,255,0.5)',
                      }}>
                        <Icon name={n} size={17} />
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Farbe">
                <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                  {COLORS.map(c => {
                    const on = c === color;
                    return (
                      <button key={c} onClick={() => setColor(c)} style={{
                        width: 30, height: 30, borderRadius: 999, cursor: 'pointer', background: c, transition: 'all .14s',
                        border: on ? '2px solid #fff' : '2px solid transparent', boxShadow: on ? `0 0 0 2px ${hexA(c, 0.6)}` : 'none',
                      }} />
                    );
                  })}
                </div>
              </Field>

              {error && (
                <div style={{ padding: '10px 12px', borderRadius: 10, background: hexA('#f43f5e', 0.1), border: `1px solid ${hexA('#f43f5e', 0.3)}`, color: lighten('#f43f5e'), fontSize: 12.5 }}>{error}</div>
              )}
              {!hasSource && (
                <div style={{ fontSize: 12, color: lighten('#f59e0b') }}>Der Bericht braucht zuerst eine Quelltabelle.</div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <p style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: 0 }}>Es werden keine Zugangsdaten geteilt — nur die Berichtsstruktur.</p>
                <Btn variant="ghost" onClick={onClose}>Abbrechen</Btn>
                <Btn variant="primary" icon={busy ? 'zap' : 'globe'} disabled={busy || !title.trim() || !hasSource} onClick={submit}>
                  {busy ? 'Veröffentliche…' : 'Veröffentlichen'}
                </Btn>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
