/**
 * Results drawer — slides up from the bottom. Split view: syntax-highlighted
 * generated SQL on the left, the live query result table (sortable, CSV-export)
 * on the right. Renders REAL rows returned by the MSSQL bridge.
 */
import React, { useState, useMemo } from 'react';
import { Icon, Eyebrow } from './ui.jsx';

const csvBtn = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: 550, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };

// ─── SQL syntax highlight ───────────────────────────────────────────────────
function highlightSQL(sql) {
  const KW = ['SELECT', 'TOP', 'FROM', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'JOIN', 'ON', 'WHERE', 'AND', 'OR', 'GROUP BY', 'ORDER BY', 'AS', 'DESC', 'ASC', 'BETWEEN', 'LIKE', 'HAVING'];
  const FN = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'DATEADD', 'GETDATE'];
  let html = sql.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/(--[^\n]*)/g, '<span style="color:#6b7280">$1</span>');
  html = html.replace(/('[^']*')/g, '<span style="color:#fbbf24">$1</span>');
  html = html.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#f472b6">$1</span>');
  KW.forEach(k => { html = html.replace(new RegExp('\\b' + k.replace(' ', '\\s') + '\\b', 'g'), m => `<span style="color:#60a5fa;font-weight:600">${m}</span>`); });
  FN.forEach(k => { html = html.replace(new RegExp('\\b' + k + '\\b', 'g'), `<span style="color:#34d399">${k}</span>`); });
  return html;
}

const isNum = (v) => typeof v === 'number' || (v !== '' && v != null && !isNaN(Number(v)) && typeof v !== 'boolean');

function fmtCell(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v.toLocaleString('de-DE', { maximumFractionDigits: 4 });
  return String(v);
}

function exportCSV(cols, rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[;"\n]/.test(s) ? `"${s}"` : s;
  };
  const head = cols.join(';');
  const body = rows.map(r => cols.map(c => esc(r[c])).join(';')).join('\n');
  const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `dbflow_export_${new Date().toISOString().split('T')[0]}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export default function ResultsDrawer({ open, onToggle, sql, running, results, error, executionTime }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const [copied, setCopied] = useState(false);

  const cols = results.length ? Object.keys(results[0]) : [];
  const numericCols = useMemo(() => new Set(cols.filter(c => results.every(r => r[c] == null || isNum(r[c])))), [results, cols]);

  const rows = useMemo(() => {
    if (!sortKey) return results;
    const num = numericCols.has(sortKey);
    return [...results].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1; if (bv == null) return -1;
      const cmp = num ? Number(av) - Number(bv) : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [results, sortKey, sortDir, numericCols]);

  const sort = (k) => { if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('desc'); } };
  const copy = () => { navigator.clipboard && navigator.clipboard.writeText(sql); setCopied(true); setTimeout(() => setCopied(false), 1400); };

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 70,
      height: open ? 'min(64vh, 560px)' : 60, transition: 'height .42s cubic-bezier(.4,0,.1,1)',
      background: 'rgba(10,10,13,0.9)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
      borderTop: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 -30px 80px -20px rgba(0,0,0,0.8)',
      display: 'flex', flexDirection: 'column',
    }}>
      <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 22px', height: 59, flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: '#fff', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="table" size={16} style={{ color: '#60a5fa' }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Ergebnisse</span>
        </div>
        <span style={{ fontSize: 12, color: error ? '#fb7185' : 'rgba(255,255,255,0.45)', fontFamily: "'Geist Mono', monospace" }}>
          {running ? 'läuft…' : error ? '⚠ Fehler' : results.length ? `${results.length} Zeilen${executionTime ? ` · ${executionTime}s` : ''}` : 'bereit'}
        </span>
        <div style={{ flex: 1 }} />
        {open && results.length > 0 && (
          <span onClick={(e) => { e.stopPropagation(); exportCSV(cols, rows); }} style={csvBtn}>
            <Icon name="download" size={14} /> CSV exportieren
          </span>
        )}
        <Icon name={open ? 'chevronDown' : 'chevronUp'} size={18} style={{ color: 'rgba(255,255,255,0.5)' }} />
      </button>

      {open && (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '0.82fr 1.18fr', minHeight: 0, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {/* SQL */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', flexShrink: 0 }}>
              <Eyebrow>Generiertes SQL</Eyebrow>
              <div style={{ flex: 1 }} />
              {sql && <button onClick={copy} style={{ ...csvBtn, padding: '5px 10px' }}>
                <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Kopiert' : 'Kopieren'}
              </button>}
            </div>
            <pre style={{ margin: 0, padding: '4px 18px 18px', overflow: 'auto', flex: 1, fontSize: 13, lineHeight: 1.65, fontFamily: "'Geist Mono', monospace", color: 'rgba(255,255,255,0.85)' }}
              dangerouslySetInnerHTML={{ __html: highlightSQL(sql || '-- Quelle wählen, um SQL zu generieren') }} />
          </div>
          {/* data table */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '12px 18px', flexShrink: 0 }}><Eyebrow>Datentabelle</Eyebrow></div>
            <div style={{ overflow: 'auto', flex: 1, padding: '0 12px 12px' }}>
              {error ? (
                <div style={{ padding: '16px 14px', fontSize: 13, color: '#fb7185', fontFamily: "'Geist Mono', monospace", whiteSpace: 'pre-wrap' }}>{error}</div>
              ) : results.length === 0 ? (
                <div style={{ padding: '40px 14px', fontSize: 13, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
                  {running ? 'Abfrage läuft…' : 'Noch keine Ergebnisse. „Ausführen“ klicken.'}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {cols.map(c => {
                        const right = numericCols.has(c);
                        return (
                          <th key={c} onClick={() => sort(c)} style={{
                            position: 'sticky', top: 0, textAlign: right ? 'right' : 'left', padding: '9px 14px', cursor: 'pointer',
                            background: 'rgba(20,20,24,0.96)', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap',
                            fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                            color: sortKey === c ? '#93c5fd' : 'rgba(255,255,255,0.5)', borderBottom: '1px solid rgba(255,255,255,0.1)',
                          }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexDirection: right ? 'row-reverse' : 'row' }}>
                              {c} {sortKey === c && <Icon name={sortDir === 'asc' ? 'chevronUp' : 'chevronDown'} size={12} />}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="data-row">
                        {cols.map(c => {
                          const right = numericCols.has(c);
                          const cell = fmtCell(r[c]);
                          return (
                            <td key={c} style={{
                              padding: '9px 14px', textAlign: right ? 'right' : 'left',
                              fontFamily: right ? "'Geist Mono', monospace" : 'inherit',
                              color: cell === null ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.72)',
                              whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.045)',
                            }}>{cell === null ? 'NULL' : cell}</td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
