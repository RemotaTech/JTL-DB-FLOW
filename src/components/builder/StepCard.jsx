/**
 * Pipeline step cards with per-step inline editors — wired to the real JTL
 * schema. Source/Join pickers read schema.tables; joins auto-resolve their FK
 * columns from the JTL `k<Name>` naming convention (see lib/relationships).
 */
import React, { useState } from 'react';
import {
  Icon, Eyebrow, Chip, Dropdown, MenuItem, hexA, lighten, MONO,
} from './ui.jsx';
import {
  STEP_META, OPERATORS, OP_LABEL, AGGREGATES, availableFields, groupOutputs, stepsTables,
  newFormatItem, newFormatRule,
} from '../../lib/steps.js';
import { outgoingJoins } from '../../lib/relationships.js';

// Qualified `dbo.tkunde.cKundenNr` → { field:'cKundenNr', table:'tkunde' }
function splitQualified(q) {
  const parts = String(q || '').split('.');
  return { field: parts.pop() || '', table: parts.pop() || '' };
}
// `Verkauf.tAuftrag` → `tAuftrag`
const shortTable = (name) => String(name || '').split('.').pop();

// ─── pickers ────────────────────────────────────────────────────────────────
function pickerStyle(open, color) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 11px', height: 34,
    background: open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${open ? hexA(color || '#3b82f6', 0.5) : 'rgba(255,255,255,0.1)'}`,
    borderRadius: 9, cursor: 'pointer', fontSize: 13, color: '#fff', fontFamily: 'inherit',
    transition: 'all .14s', whiteSpace: 'nowrap',
  };
}

const searchInputStyle = {
  width: '100%', height: 32, padding: '0 10px', marginBottom: 6, boxSizing: 'border-box',
  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
  color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none',
};

/** Filterable option list used inside a Dropdown (auto-search for long lists). */
function OptionList({ options, value, onChange, close, mono, renderItem }) {
  const [q, setQ] = useState('');
  const show = options.length > 8;
  const ql = q.trim().toLowerCase();
  const f = ql ? options.filter(o => String(o.label ?? o.value ?? o).toLowerCase().includes(ql)) : options;
  return (
    <>
      {show && (
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen…"
          onClick={(e) => e.stopPropagation()} style={searchInputStyle} />
      )}
      {f.map(o => (
        <MenuItem key={o.value ?? o} mono={mono} active={(o.value ?? o) === value} icon={o.icon} iconColor={o.color}
          onClick={() => { onChange(o.value ?? o); close(); }}>
          {renderItem ? renderItem(o) : (o.label ?? o)}
        </MenuItem>
      ))}
      {f.length === 0 && <div style={{ padding: '10px', fontSize: 12.5, color: 'rgba(255,255,255,0.4)' }}>Nichts gefunden</div>}
    </>
  );
}

function FieldPicker({ schema, steps, value, onChange, color, placeholder = 'Feld wählen', fields: fieldsOverride }) {
  const fields = fieldsOverride || availableFields(schema, steps);
  const cur = fields.find(f => f.value === value);
  const curParts = cur ? splitQualified(cur.value) : null;
  return (
    <Dropdown width={280} trigger={(open) => (
      <button style={pickerStyle(open, color)}>
        {curParts ? (
          <span style={{ fontFamily: MONO, fontSize: 12.5, color: '#fff' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>{curParts.table}.</span>{curParts.field}
          </span>
        ) : <span style={{ color: 'rgba(255,255,255,0.45)' }}>{placeholder}</span>}
        <Icon name="chevronDown" size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
      </button>
    )}>
      {(close) => fields.length ? (
        <OptionList close={close} value={value} mono
          onChange={onChange}
          options={fields.map(f => ({ value: f.value, label: `${splitQualified(f.value).table}.${splitQualified(f.value).field}` }))}
          renderItem={(o) => { const p = splitQualified(o.value); return <><span style={{ color: 'rgba(255,255,255,0.4)' }}>{p.table}.</span>{p.field}</>; }}
        />
      ) : <div style={{ padding: '10px', fontSize: 12.5, color: 'rgba(255,255,255,0.4)' }}>Zuerst Quelle wählen</div>}
    </Dropdown>
  );
}

function SimplePicker({ options, value, onChange, color, render, width = 180 }) {
  return (
    <Dropdown width={width} trigger={(open) => (
      <button style={pickerStyle(open, color)}>
        <span>{render ? render(value) : (value || '—')}</span>
        <Icon name="chevronDown" size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
      </button>
    )}>
      {(close) => <OptionList close={close} options={options} value={value} onChange={onChange} />}
    </Dropdown>
  );
}

// ─── per-step editor bodies ─────────────────────────────────────────────────
function SourceBody({ schema, step, onChange, color }) {
  const tables = (schema?.tables || []).map(t => ({ value: t.name, label: t.name }));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={bodyLabel}>Daten aus</span>
      <SimplePicker color={color} width={260} value={step.table} options={tables}
        render={(v) => (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Icon name="database" size={15} style={{ color: lighten(color) }} />
            <span style={{ fontFamily: MONO, fontSize: 12.5 }}>{v || 'Tabelle wählen'}</span>
          </span>
        )}
        onChange={(v) => onChange({ table: v })}
      />
    </div>
  );
}

function JoinBody({ schema, step, steps, onChange, color }) {
  // Every outgoing FK (k*) edge from any table already in the pipeline.
  const inPipe = stepsTables(steps);
  const otherTables = inPipe.filter(t => t !== step.table); // already joined / source
  const raw = inPipe.flatMap(t => outgoingJoins(schema, t));

  // Candidates = group edges by target table (not already joined). Each target
  // keeps its list of possible key columns so we can let the user choose.
  const byTarget = new Map();
  raw.forEach(e => {
    if (otherTables.includes(e.table)) return;
    const arr = byTarget.get(e.table) || [];
    if (!arr.some(k => k.fromCol === e.fromCol)) arr.push({ fromCol: e.fromCol, toCol: e.toCol, via: e.via });
    byTarget.set(e.table, arr);
  });
  const cands = [...byTarget.entries()]
    .map(([table, keys]) => ({ table, keys }))
    .sort((a, b) => shortTable(a.table).localeCompare(shortTable(b.table)));

  // Key columns available for the CURRENTLY selected target.
  const selKeys = [];
  if (step.table) {
    raw.forEach(e => { if (e.table === step.table && !selKeys.some(k => k.fromCol === e.fromCol)) selKeys.push({ fromCol: e.fromCol, toCol: e.toCol, via: e.via }); });
    if (selKeys.length === 0 && step.fromCol) selKeys.push({ fromCol: step.fromCol, toCol: step.toCol, via: splitQualified(step.fromCol).field });
  }

  const pickTable = (table) => {
    const c = cands.find(x => x.table === table);
    const k = c?.keys[0];
    onChange(k ? { table, fromCol: k.fromCol, toCol: k.toCol } : { table });
  };
  const pickKey = (fromCol) => {
    const k = selKeys.find(x => x.fromCol === fromCol);
    if (k) onChange({ fromCol: k.fromCol, toCol: k.toCol });
  };
  const keyLabel = (k) => `${splitQualified(k.fromCol).table}.${k.via}`;
  const fkCol = step.fromCol ? splitQualified(step.fromCol).field : null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={bodyLabel}>Verbinde mit</span>
      <Dropdown width={320} trigger={(open) => (
        <button style={pickerStyle(open, color)}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Icon name="merge" size={15} style={{ color: lighten(color) }} />
            <span style={{ fontFamily: MONO, fontSize: 12.5 }}>{step.table ? shortTable(step.table) : 'Tabelle wählen'}</span>
          </span>
          <Icon name="chevronDown" size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
        </button>
      )}>
        {(close) => cands.length ? (
          <OptionList close={close} value={step.table} mono
            onChange={pickTable}
            options={cands.map(c => ({ value: c.table, label: `${shortTable(c.table)} ${c.keys.map(k => k.via).join(' ')}` }))}
            renderItem={(o) => {
              const c = cands.find(x => x.table === o.value);
              const n = c?.keys.length || 0;
              return (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                  <span>{shortTable(o.value)}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: n > 1 ? lighten(color) : 'rgba(255,255,255,0.4)' }}>
                    {n > 1 ? `${n} Schlüssel` : `über ${c.keys[0].via}`}
                  </span>
                </span>
              );
            }}
          />
        ) : <div style={{ padding: '10px', fontSize: 12.5, color: 'rgba(255,255,255,0.4)' }}>Keine verknüpfbaren Tabellen (keine k-Spalten)</div>}
      </Dropdown>

      {/* "über" — fixed chip for a single key, a picker when several exist */}
      {step.table && selKeys.length > 1 ? (
        <>
          <span style={bodyLabel}>über</span>
          <Dropdown width={260} trigger={(open) => (
            <button style={pickerStyle(open, color)}>
              <span style={{ fontFamily: MONO, fontSize: 12.5 }}>{fkCol || 'Schlüssel wählen'}</span>
              <Icon name="chevronDown" size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
            </button>
          )}>
            {(close) => (
              <OptionList close={close} mono value={step.fromCol} onChange={pickKey}
                options={selKeys.map(k => ({ value: k.fromCol, label: keyLabel(k) }))} />
            )}
          </Dropdown>
        </>
      ) : fkCol ? (
        <><span style={bodyLabel}>über</span><Chip color={color} mono>{fkCol}</Chip></>
      ) : null}

      <SimplePicker color={color} width={170} value={step.kind || 'inner'}
        options={[{ value: 'inner', label: 'Nur Treffer (inner)' }, { value: 'left', label: 'Alle links (left)' }]}
        render={(v) => v === 'left' ? 'Alle links' : 'Nur Treffer'}
        onChange={(v) => onChange({ kind: v })}
      />
    </div>
  );
}

function ValueInput({ value, onChange }) {
  const isVar = typeof value === 'string' && value.startsWith('@');
  if (isVar) {
    return (
      <Chip color="#3b82f6" mono onClick={() => onChange('')}>
        <Icon name="braces" size={12} /> {value}
      </Chip>
    );
  }
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Wert"
      style={{ width: 130, height: 34, padding: '0 11px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: '#fff', fontSize: 13, fontFamily: MONO, outline: 'none' }} />
  );
}

function FilterBody({ schema, step, steps, onChange, color }) {
  const conds = step.conditions || [];
  const setCond = (i, patch) => onChange({ conditions: conds.map((c, idx) => idx === i ? { ...c, ...patch } : c) });
  const remove = (i) => onChange({ conditions: conds.filter((_, idx) => idx !== i) });
  const add = () => onChange({ conditions: [...conds, { field: '', op: '=', value: '' }] });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {conds.map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ ...bodyLabel, width: 28 }}>{i === 0 ? 'Wo' : 'und'}</span>
          <FieldPicker schema={schema} steps={steps} value={c.field} color={color} onChange={(v) => setCond(i, { field: v })} />
          <SimplePicker color={color} width={140} value={c.op} options={OPERATORS} onChange={(v) => setCond(i, { op: v })} />
          <ValueInput value={c.value} onChange={(v) => setCond(i, { value: v })} />
          <button onClick={() => remove(i)} style={iconBtn}><Icon name="x" size={14} /></button>
        </div>
      ))}
      <button onClick={add} style={addRow(color)}><Icon name="plus" size={14} /> Bedingung hinzufügen</button>
    </div>
  );
}

function GroupBody({ schema, step, steps, onChange, color }) {
  const by = step.by || [];
  const metrics = step.metrics || [];
  const fields = availableFields(schema, steps);
  const addBy = (v) => { if (!by.includes(v)) onChange({ by: [...by, v] }); };
  const removeBy = (v) => onChange({ by: by.filter(x => x !== v) });
  const setMetric = (i, patch) => onChange({ metrics: metrics.map((m, idx) => idx === i ? { ...m, ...patch } : m) });
  const removeMetric = (i) => onChange({ metrics: metrics.filter((_, idx) => idx !== i) });
  const addMetric = () => onChange({ metrics: [...metrics, { agg: 'Anzahl', field: '', as: 'Wert' }] });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ ...bodyLabel, width: 70 }}>Gruppiere</span>
        {by.map(b => <Chip key={b} color={color} mono onRemove={() => removeBy(b)}>{splitQualified(b).field}</Chip>)}
        <Dropdown width={280} trigger={() => <button style={addRow(color)}><Icon name="plus" size={14} /> Feld</button>}>
          {(close) => (
            <OptionList close={close} mono onChange={addBy}
              options={fields.filter(f => !by.includes(f.value)).map(f => ({ value: f.value, label: `${splitQualified(f.value).table}.${splitQualified(f.value).field}` }))}
              renderItem={(o) => { const p = splitQualified(o.value); return <><span style={{ color: 'rgba(255,255,255,0.4)' }}>{p.table}.</span>{p.field}</>; }}
            />
          )}
        </Dropdown>
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span style={bodyLabel}>Berechne</span>
        {metrics.map((m, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <SimplePicker color={color} width={150} value={m.agg} options={AGGREGATES} onChange={(v) => setMetric(i, { agg: v })} />
            <span style={bodyLabel}>von</span>
            <FieldPicker schema={schema} steps={steps} value={m.field} color={color} placeholder="alle (∗)" onChange={(v) => setMetric(i, { field: v })} />
            <span style={bodyLabel}>als</span>
            <input value={m.as} onChange={(e) => setMetric(i, { as: e.target.value })}
              style={{ width: 130, height: 34, padding: '0 11px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: lighten(color), fontSize: 13, fontWeight: 550, outline: 'none' }} />
            <button onClick={() => removeMetric(i)} style={iconBtn}><Icon name="x" size={14} /></button>
          </div>
        ))}
        <button onClick={addMetric} style={addRow(color)}><Icon name="plus" size={14} /> Kennzahl hinzufügen</button>
      </div>
    </div>
  );
}

function SortBody({ schema, step, steps, onChange, color }) {
  const grp = steps.find(s => s.type === 'group');
  const opts = grp
    ? groupOutputs(grp).map(o => ({ value: o.value, label: o.label }))
    : availableFields(schema, steps).map(f => ({ value: f.value, label: splitQualified(f.value).field }));
  const render = (v) => {
    if (!v) return 'Feld wählen';
    const o = opts.find(x => x.value === v);
    return o ? o.label : (v.includes('.') ? splitQualified(v).field : v);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={bodyLabel}>Sortiere nach</span>
      <SimplePicker color={color} width={200} value={step.by} options={opts.length ? opts : [{ value: '', label: '—' }]}
        render={render} onChange={(v) => onChange({ by: v })} />
      <div style={{ display: 'flex', gap: 4, padding: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)' }}>
        {[{ k: 'desc', l: 'Absteigend' }, { k: 'asc', l: 'Aufsteigend' }].map(d => (
          <button key={d.k} onClick={() => onChange({ dir: d.k })} style={{
            padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 550, fontFamily: 'inherit', transition: 'all .14s',
            background: (step.dir || 'desc') === d.k ? hexA(color, 0.2) : 'transparent',
            color: (step.dir || 'desc') === d.k ? lighten(color) : 'rgba(255,255,255,0.5)',
          }}>{d.l}</button>
        ))}
      </div>
    </div>
  );
}

function ColumnsBody({ schema, step, steps, onChange, color }) {
  const grp = steps.find(s => s.type === 'group');

  // Build groups: { title, icon, items:[{value,label}] }, grouped by source table.
  let groups;
  if (grp) {
    const byT = {};
    (grp.by || []).forEach(b => { const t = splitQualified(b).table; (byT[t] = byT[t] || []).push({ value: b, label: splitQualified(b).field }); });
    groups = Object.entries(byT).map(([title, items]) => ({ title, icon: 'database', items }));
    const aggs = (grp.metrics || []).map(m => ({ value: m.as, label: m.as }));
    if (aggs.length) groups.push({ title: 'Kennzahlen', icon: 'layers', items: aggs });
  } else {
    const fields = availableFields(schema, steps);
    const order = stepsTables(steps);
    const byT = new Map();
    fields.forEach(f => { if (!byT.has(f.table)) byT.set(f.table, []); byT.get(f.table).push({ value: f.value, label: splitQualified(f.value).field }); });
    groups = order.filter(t => byT.has(t)).map(t => ({ title: shortTable(t), icon: 'database', items: byT.get(t) }));
  }

  const allVals = groups.flatMap(g => g.items.map(i => i.value));
  const explicit = (step.visible || []).length > 0;
  const visible = explicit ? step.visible : allVals;
  const toggle = (v) => {
    const base = explicit ? step.visible : allVals;
    onChange({ visible: base.includes(v) ? base.filter(x => x !== v) : [...base, v] });
  };

  if (allVals.length === 0) {
    return <span style={{ ...bodyLabel, fontStyle: 'italic' }}>Zuerst Quelle wählen</span>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <span style={bodyLabel}>Sichtbare Spalten · {visible.length}/{allVals.length}</span>
      {groups.map(g => (
        <ColumnGroup key={g.title} group={g} visible={visible} explicit={explicit} color={color} toggle={toggle} />
      ))}
    </div>
  );
}

/** One collapsible per-table group of column chips. Collapsed by default to
 *  save space — header shows the selection summary; expand to choose fields. */
function ColumnGroup({ group, visible, explicit, color, toggle }) {
  const [open, setOpen] = useState(false);
  const onItems = group.items.filter(i => visible.includes(i.value));

  return (
    <div style={{ position: 'relative', borderRadius: 13, background: 'rgba(255,255,255,0.022)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px',
        background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      }}>
        <Icon name={group.icon} size={12} style={{ color: lighten(color) }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: lighten(color), fontFamily: MONO }}>{group.title}</span>
        <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', fontFamily: MONO }}>{onItems.length}/{group.items.length}</span>
        <div style={{ flex: 1 }} />
        {!open && (
          <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
            {!explicit ? 'Alle Spalten' : onItems.length ? onItems.map(i => i.label).join(', ') : 'keine'}
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 7, background: hexA(color, 0.12), color: lighten(color), flexShrink: 0 }}>
          <Icon name={open ? 'minus' : 'plus'} size={13} />
        </span>
      </button>
      {/* Animated reveal — grid-rows 0fr↔1fr expands height smoothly, no JS measuring */}
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows .3s cubic-bezier(.4,0,.1,1)' }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 12px 12px',
            opacity: open ? 1 : 0, transform: open ? 'none' : 'translateY(-4px)',
            transition: 'opacity .25s ease, transform .25s ease',
          }}>
            {group.items.map(a => {
              const on = visible.includes(a.value);
              return (
                <button key={a.value} onClick={() => toggle(a.value)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 999,
                  fontSize: 12.5, fontWeight: 550, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .14s',
                  background: on ? hexA(color, 0.14) : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${on ? hexA(color, 0.3) : 'rgba(255,255,255,0.08)'}`,
                  color: on ? lighten(color) : 'rgba(255,255,255,0.4)',
                }}>
                  <Icon name={on ? 'check' : 'plus'} size={12} />{a.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Formatierung: rename fields + Wenn-Dann (CASE) computed columns ─────────
const OP_OPTS = OPERATORS.map(o => ({ value: o, label: OP_LABEL[o] || o }));

function aliasInput(value, onChange, color, placeholder) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: 160, height: 34, padding: '0 11px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: lighten(color), fontSize: 13, fontWeight: 550, fontFamily: 'inherit', outline: 'none' }} />
  );
}

function JoinToggle({ value, onChange, color }) {
  return (
    <div style={{ display: 'flex', gap: 3, padding: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
      {['UND', 'ODER'].map(j => (
        <button key={j} onClick={() => onChange(j)} style={{
          padding: '3px 9px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', transition: 'all .14s',
          background: (value || 'UND') === j ? hexA(color, 0.2) : 'transparent',
          color: (value || 'UND') === j ? lighten(color) : 'rgba(255,255,255,0.45)',
        }}>{j}</button>
      ))}
    </div>
  );
}

function FormatBody({ schema, step, steps, onChange, color }) {
  const items = step.items || [];

  // Formatierung operates on the fields chosen in Spalten (all if none selected).
  const colsStep = steps.find(s => s.type === 'columns');
  const allFields = availableFields(schema, steps);
  const visible = colsStep ? (colsStep.visible || []) : [];
  const scopedFields = visible.length ? allFields.filter(f => visible.includes(f.value)) : allFields;

  const setItem = (i, patch) => onChange({ items: items.map((it, idx) => idx === i ? { ...it, ...patch } : it) });
  const removeItem = (i) => onChange({ items: items.filter((_, idx) => idx !== i) });
  const addItem = () => onChange({ items: [...items, newFormatItem()] });

  const setRule = (i, ri, patch) => setItem(i, { rules: (items[i].rules || []).map((r, idx) => idx === ri ? { ...r, ...patch } : r) });
  const addRule = (i) => setItem(i, { rules: [...(items[i].rules || []), newFormatRule()] });
  const removeRule = (i, ri) => setItem(i, { rules: (items[i].rules || []).filter((_, idx) => idx !== ri) });
  const setCond = (i, ri, ci, patch) => { const r = items[i].rules[ri]; setRule(i, ri, { conds: (r.conds || []).map((c, idx) => idx === ci ? { ...c, ...patch } : c) }); };
  const addCond = (i, ri) => { const r = items[i].rules[ri]; setRule(i, ri, { conds: [...(r.conds || []), { field: '', op: '=', value: '' }] }); };
  const removeCond = (i, ri, ci) => { const r = items[i].rules[ri]; setRule(i, ri, { conds: (r.conds || []).filter((_, idx) => idx !== ci) }); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((it, i) => {
        const rules = it.rules || [];
        const hasRules = rules.length > 0;
        return (
          <div key={it.id || i} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 13, background: 'rgba(255,255,255,0.022)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {/* header: field (rename) + display name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              {!hasRules && <>
                <span style={bodyLabel}>Feld</span>
                <FieldPicker schema={schema} steps={steps} fields={scopedFields} value={it.field} color={color} onChange={(v) => setItem(i, { field: v })} />
              </>}
              <span style={bodyLabel}>{hasRules ? 'Neue Spalte' : 'Anzeigen als'}</span>
              {aliasInput(it.as, (v) => setItem(i, { as: v }), color, hasRules ? 'Spaltenname' : 'Neuer Name')}
              <div style={{ flex: 1 }} />
              <button onClick={() => removeItem(i)} style={iconBtn} title="Entfernen"><Icon name="trash" size={15} /></button>
            </div>

            {/* Wenn-Dann rules */}
            {rules.map((r, ri) => (
              <div key={ri} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 10, borderLeft: `2px solid ${hexA(color, 0.3)}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ ...bodyLabel, color: lighten(color), fontWeight: 600 }}>{ri === 0 ? 'Wenn' : 'Sonst wenn'}</span>
                  {(r.conds || []).map((c, ci) => (
                    <React.Fragment key={ci}>
                      {ci > 0 && <JoinToggle value={r.join} onChange={(j) => setRule(i, ri, { join: j })} color={color} />}
                      <FieldPicker schema={schema} steps={steps} fields={scopedFields} value={c.field} color={color} onChange={(v) => setCond(i, ri, ci, { field: v })} />
                      <SimplePicker color={color} width={150} value={c.op} options={OP_OPTS} render={(v) => OP_LABEL[v] || v} onChange={(v) => setCond(i, ri, ci, { op: v })} />
                      <ValueInput value={c.value} onChange={(v) => setCond(i, ri, ci, { value: v })} />
                      {(r.conds.length > 1) && <button onClick={() => removeCond(i, ri, ci)} style={iconBtn}><Icon name="x" size={14} /></button>}
                    </React.Fragment>
                  ))}
                  <button onClick={() => addCond(i, ri)} style={addRow(color)}><Icon name="plus" size={13} /> und / oder</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ ...bodyLabel, color: lighten(color), fontWeight: 600 }}>dann</span>
                  {aliasInput(r.then, (v) => setRule(i, ri, { then: v }), color, 'Ausgabe-Text')}
                  <button onClick={() => removeRule(i, ri)} style={iconBtn} title="Regel entfernen"><Icon name="trash" size={14} /></button>
                </div>
              </div>
            ))}

            {hasRules && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={bodyLabel}>Sonst</span>
                {aliasInput(it.otherwise, (v) => setItem(i, { otherwise: v }), color, 'Standard-Text')}
              </div>
            )}

            <button onClick={() => addRule(i)} style={addRow(color)}>
              <Icon name="plus" size={14} /> {hasRules ? 'weitere Regel' : 'Wenn-Dann-Regel'}
            </button>
          </div>
        );
      })}
      <button onClick={addItem} style={addRow(color)}><Icon name="plus" size={14} /> Spalte hinzufügen</button>
    </div>
  );
}

const BODIES = { source: SourceBody, join: JoinBody, filter: FilterBody, group: GroupBody, sort: SortBody, columns: ColumnsBody, format: FormatBody };

// ─── the card ───────────────────────────────────────────────────────────────
export default function StepCard({ schema, step, steps, index, onChange, onRemove, canRemove }) {
  const meta = STEP_META[step.type];
  const Body = BODIES[step.type];
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', borderRadius: 'var(--card-radius)', padding: '16px 18px',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025))',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: hover ? '0 20px 50px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)' : '0 14px 40px -22px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', transition: 'box-shadow .2s, transform .2s', overflow: 'hidden',
      }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${meta.color}, ${hexA(meta.color, 0.3)})` }} />
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 80% at 0% 0%, ${hexA(meta.color, 0.06)}, transparent 50%)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, position: 'relative' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hexA(meta.color, 0.14), border: `1px solid ${hexA(meta.color, 0.3)}`, color: lighten(meta.color),
          boxShadow: `inset 0 1px 0 ${hexA(meta.color, 0.2)}`,
        }}>
          <Icon name={meta.icon} size={19} />
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Eyebrow color={lighten(meta.color)}>{meta.label}</Eyebrow>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontFamily: MONO }}>{String(index + 1).padStart(2, '0')}</span>
            {canRemove && <button onClick={onRemove} style={{ ...iconBtn, opacity: hover ? 1 : 0.3 }} className="del" title="Entfernen"><Icon name="trash" size={15} /></button>}
          </div>
          <Body schema={schema} step={step} steps={steps} onChange={onChange} color={meta.color} />
        </div>
      </div>
    </div>
  );
}

const bodyLabel = { fontSize: 12.5, color: 'rgba(255,255,255,0.42)', fontWeight: 500, whiteSpace: 'nowrap' };
const iconBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', transition: 'all .14s' };
const addRow = (color) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 9, border: `1px dashed ${hexA(color, 0.35)}`, background: hexA(color, 0.06), color: lighten(color), fontSize: 12.5, fontWeight: 550, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .14s', whiteSpace: 'nowrap' });
