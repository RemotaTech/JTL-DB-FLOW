/**
 * DBFLOW — JTL Report Builder.
 *
 * Single-page dark glass app. Three views:
 *   empty      → onboarding (template gallery + blank-start table picker)
 *   community  → hub marketplace
 *   builder    → linear step pipeline + floating nav pill + results drawer
 *
 * Wired to the real stack: schema from the bridge, T-SQL generated from the
 * steps, live query execution, encrypted MSSQL credentials.
 *
 * Resilience rules that live here:
 *   • every network call goes through fetchJson (timeouts, German messages)
 *   • the working pipeline is auto-saved as a draft and restored on reload
 *   • anything imported (hub, localStorage) is sanitised + re-id'd first
 *   • destructive actions (delete, discard unsaved work) ask first
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { uid, newStep, stepsToSql, pipelineIssues } from './lib/steps.js';
import { sanitizeFlow, hasSource } from './lib/validate.js';
import { loadDbConfig, saveDbConfig, clearDbConfig, EMPTY_CONFIG, isSecureContext } from './lib/crypto.js';
import { fetchJson, postJson } from './lib/http.js';
import { BgFX, TopBar, NavPill, PipelineHeader, Connector, AddStepButton, BridgeBanner, Toast } from './components/builder/shell.jsx';
import { ConfirmDialog } from './components/builder/ui.jsx';
import EmptyView from './components/builder/EmptyView.jsx';
import StepCard from './components/builder/StepCard.jsx';
import ResultsDrawer from './components/builder/ResultsDrawer.jsx';
import VariablesPanel from './components/builder/VariablesPanel.jsx';
import SettingsModal from './components/builder/SettingsModal.jsx';
import CommunityGallery from './components/builder/CommunityGallery.jsx';
import PublishModal from './components/builder/PublishModal.jsx';
import { pingExecution } from './lib/hubApi.js';
import { listLocal, saveLocal, deleteLocal, loadDraft, saveDraft, clearDraft, getPref, setPref } from './lib/localStore.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL ?? '';
/** Where credentials + queries are sent. Same-origin unless VITE_BRIDGE_URL is set. */
const bridgeTarget = () => BRIDGE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
const isLocalTarget = () => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(bridgeTarget());

const DEFAULT_VARS = [
  { id: 'v1', name: 'zeitraum', value: 'DATEADD(day, -30, GETDATE())', label: 'Letzte 30 Tage' },
];
const DEFAULT_TITLE = 'Neuer Bericht';

const snapshot = (o) => JSON.stringify({ t: o.title, s: o.steps, v: o.vars, i: o.icon, c: o.color });

export default function App() {
  // ── view + pipeline ──────────────────────────────────────────────────────
  // Draft is sanitised ONCE (sanitize re-ids steps, so two calls would diverge).
  const draft = useMemo(() => {
    const d = loadDraft();
    return d ? { ...d, ...sanitizeFlow(d, uid) } : null;
  }, []);
  const [view, setView] = useState(draft ? 'builder' : 'empty');   // empty | builder | community
  const [steps, setSteps] = useState(() => draft ? draft.steps : []);
  const [title, setTitle] = useState(draft?.title || DEFAULT_TITLE);
  const [editTitle, setEditTitle] = useState(false);
  const [vars, setVars] = useState(() => draft ? draft.vars : DEFAULT_VARS);
  const [reportIcon, setReportIcon] = useState(draft?.icon || 'database');
  const [reportColor, setReportColor] = useState(draft?.color || '#3b82f6');

  // ── community / local library ──────────────────────────────────────────────
  const [localReports, setLocalReports] = useState(() => listLocal());
  const [sourceHubId, setSourceHubId] = useState(draft?.hubId || null);   // hub id if imported
  const [currentLocalId, setCurrentLocalId] = useState(draft?.localId || null);
  const [showPublish, setShowPublish] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  // Snapshot at last save/open → dirty detection. Ids change on restore, so a
  // clean draft is re-baselined against its sanitised form instead of the old string.
  const savedRef = useRef(draft && !draft.wasDirty
    ? snapshot({ title: draft.title || DEFAULT_TITLE, steps: draft.steps, vars: draft.vars, icon: draft.icon || 'database', color: draft.color || '#3b82f6' })
    : '');

  // ── data / execution ─────────────────────────────────────────────────────
  const [schema, setSchema] = useState(null);
  const [results, setResults] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState(null);
  const [executionTime, setExecutionTime] = useState(null);
  const [running, setRunning] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const abortRef = useRef(null);

  // ── bridge health ────────────────────────────────────────────────────────
  const [bridge, setBridge] = useState('checking');   // checking | ok | offline

  // ── panels / dialogs ─────────────────────────────────────────────────────
  const [showVars, setShowVars] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsHint, setSettingsHint] = useState(null);
  const [confirm, setConfirm] = useState(null);       // { title, message, danger, onConfirm }
  const [toast, setToast] = useState(null);           // { kind, text }

  // ── versions + connection ────────────────────────────────────────────────
  const [availableVersions, setAvailableVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(() => getPref('jtl_wawi_version'));
  const [dbConfig, setDbConfig] = useState({ ...EMPTY_CONFIG });
  const [dbConfigDraft, setDbConfigDraft] = useState({ ...EMPTY_CONFIG });
  const [testingConn, setTestingConn] = useState(false);
  const [connTestResult, setConnTestResult] = useState(null); // null | { ok, message }
  const [schemaSave, setSchemaSave] = useState(false);          // bridge may store exported schemas itself
  const [exportingSchema, setExportingSchema] = useState(false);
  const [exportResult, setExportResult] = useState(null);       // null | { ok, message, exists? }

  const scrollRef = useRef(null);
  const hasConnection = !!(dbConfig.host && dbConfig.user);

  // ── derived ──────────────────────────────────────────────────────────────
  const generatedSql = useMemo(() => stepsToSql(steps, vars, schema), [steps, vars, schema]);
  const issues = useMemo(() => pipelineIssues(steps, schema), [steps, schema]);
  const current = { title, steps, vars, icon: reportIcon, color: reportColor };
  const dirty = hasSource({ steps }) && snapshot(current) !== savedRef.current;

  const toastTimer = useRef(null);
  const notify = useCallback((kind, text, ms = 2200) => {
    setToast({ kind, text, key: Date.now() });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  // ── effects: config, bridge health, versions, schema ─────────────────────
  useEffect(() => {
    loadDbConfig().then(cfg => { setDbConfig(cfg); setDbConfigDraft(cfg); }).catch(() => {});
  }, []);

  const checkBridge = useCallback(async () => {
    const r = await fetchJson(`${BRIDGE_URL}/api/health`, {}, { timeoutMs: 6000 });
    setBridge(r.ok ? 'ok' : 'offline');
    setSchemaSave(!!(r.ok && r.data?.schemaSave));
    return r.ok;
  }, []);

  useEffect(() => {
    let alive = true, timer = null;
    const loop = async () => {
      const ok = await checkBridge();
      if (!alive) return;
      timer = window.setTimeout(loop, ok ? 60_000 : 8_000);   // poll faster while offline
    };
    loop();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [checkBridge]);

  const loadVersions = useCallback(() =>
    fetchJson(`${BRIDGE_URL}/api/versions`).then(r => setAvailableVersions(r.ok && Array.isArray(r.data) ? r.data : [])), []);

  useEffect(() => {
    if (bridge !== 'ok') return;
    loadVersions();
  }, [bridge, loadVersions]);

  // Desktop app (Electron): schema files changed on disk / main process wants a toast.
  useEffect(() => {
    const d = globalThis.dbflow;
    if (!d?.isElectron) return;
    const offV = d.onVersionsChanged?.(() => loadVersions());
    const offT = d.onToast?.((t) => { if (t?.text) notify(t.kind || 'info', t.text, t.ms || 3000); });
    return () => { offV?.(); offT?.(); };
  }, [loadVersions, notify]);

  useEffect(() => {
    if (bridge !== 'ok') return;
    let alive = true;
    (async () => {
      const primary = selectedVersion ? `${BRIDGE_URL}/api/schema/${encodeURIComponent(selectedVersion)}` : `${BRIDGE_URL}/api/schema`;
      let r = await fetchJson(primary);
      if (!r.ok && selectedVersion) {
        r = await fetchJson(`${BRIDGE_URL}/api/schema`);
        if (alive && r.ok) notify('warning', `Schema-Version „${selectedVersion}“ nicht gefunden — Standard-Schema geladen.`, 4000);
      }
      if (alive && r.ok && r.data?.tables) setSchema(r.data);
    })();
    return () => { alive = false; };
  }, [selectedVersion, bridge, notify]);

  // ── draft autosave (debounced) ───────────────────────────────────────────
  useEffect(() => {
    if (view !== 'builder') return;
    const t = window.setTimeout(() => {
      if (!steps.length) { clearDraft(); return; }
      saveDraft({ view, title, steps, vars, icon: reportIcon, color: reportColor, hubId: sourceHubId, localId: currentLocalId, wasDirty: dirty });
    }, 400);
    return () => window.clearTimeout(t);
  }, [view, title, steps, vars, reportIcon, reportColor, sourceHubId, currentLocalId, dirty]);

  // ── keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (view !== 'builder' || !mod) return;
      if (e.key === 'Enter') { e.preventDefault(); executeQuery(); }
      if (e.key.toLowerCase() === 's') { e.preventDefault(); saveCurrent(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── pipeline editing ─────────────────────────────────────────────────────
  const patchStep = (id, patch) => setSteps(s => s.map(x => x.id === id ? { ...x, ...patch } : x));
  const removeStep = (id) => setSteps(s => s.filter(x => x.id !== id));
  const addStep = (type, atIndex) => {
    const ns = newStep(type);
    setSteps(s => {
      // Single-instance guard: only 'join' (Verknüpfung) may appear more than once.
      if (type !== 'join' && s.some(x => x.type === type)) return s;
      const next = [...s];
      const fi = next.findIndex(x => x.type === 'format'); // Formatierung stays last
      if (type === 'format') {
        next.push(ns);
      } else if (atIndex == null) {
        // insert before a trailing "columns" step, and always before "format"
        let at = next.length;
        if (fi >= 0) at = fi;
        const ci = next.findIndex(x => x.type === 'columns');
        if (type !== 'columns' && ci >= 0 && ci < at) at = ci;
        next.splice(at, 0, ns);
      } else {
        next.splice(fi >= 0 ? Math.min(atIndex, fi) : atIndex, 0, ns);
      }
      return next;
    });
  };

  // ── query execution ──────────────────────────────────────────────────────
  const executeQuery = async (sqlArg, cfgArg) => {
    const sql = sqlArg ?? generatedSql;
    const cfg = cfgArg ?? dbConfig;
    if (!sql) { notify('warning', 'Zuerst eine Quelltabelle wählen.'); return; }
    if (!(cfg.host && cfg.user)) {
      setSettingsHint('Zum Ausführen werden die Zugangsdaten Ihrer JTL-Wawi Datenbank benötigt.');
      openSettings();
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setRunning(true); setDrawer(true); setError(null); setTruncated(false);
    const t0 = performance.now();
    const r = await postJson(`${BRIDGE_URL}/api/query`, { sql, connectionConfig: cfg }, { timeoutMs: 90_000, signal: ctrl.signal });
    if (ctrl !== abortRef.current) return;   // superseded by a newer run
    setExecutionTime(((performance.now() - t0) / 1000).toFixed(2));
    if (r.ok) {
      setResults(Array.isArray(r.data) ? r.data : []);
      setTruncated(r.headers?.get('X-Rows-Truncated') === '1');
      if (sourceHubId) pingExecution(sourceHubId);
    } else {
      setResults([]);
      setError(r.aborted ? null : r.error);
      if (r.status === 0 && !r.aborted) checkBridge();
    }
    setRunning(false);
  };
  const cancelQuery = () => { abortRef.current?.abort(); setRunning(false); };

  // ── open something (with unsaved-work guard) ─────────────────────────────
  const load = ({ title: t, steps: s, vars: v, icon, color, hubId = null, localId = null, run = false }) => {
    setTitle(t); setSteps(s); setVars(v);
    setReportIcon(icon || 'database'); setReportColor(color || '#3b82f6');
    setSourceHubId(hubId); setCurrentLocalId(localId);
    savedRef.current = snapshot({ title: t, steps: s, vars: v, icon: icon || 'database', color: color || '#3b82f6' });
    setView('builder'); setShowVars(false);
    setResults([]); setError(null); setTruncated(false); setDrawer(false);
    if (run) window.setTimeout(() => executeQuery(stepsToSql(s, v, schema)), 150);
  };
  const guarded = (fn) => {
    if (!dirty) return fn();
    setConfirm({
      title: 'Ungespeicherte Änderungen',
      message: `„${title}“ wurde noch nicht gespeichert. Trotzdem fortfahren? Die Änderungen gehen verloren.`,
      confirmLabel: 'Verwerfen', danger: true,
      onConfirm: () => { setConfirm(null); fn(); },
    });
  };

  const openTemplate = (tpl) => guarded(() => {
    const built = tpl.build();
    load({ title: tpl.title, steps: built, vars, icon: tpl.icon, color: tpl.color, run: hasConnection });
  });
  const startBlank = (table) => guarded(() => {
    load({ title: DEFAULT_TITLE, steps: [{ id: uid(), type: 'source', table }], vars: DEFAULT_VARS, icon: 'database', color: '#3b82f6' });
  });
  const importFromHub = (full) => guarded(() => {
    const clean = sanitizeFlow(full?.flowData, uid);
    if (!hasSource(clean)) { notify('error', 'Dieser Community-Bericht enthält keine gültige Quelltabelle.'); return; }
    load({ title: full.title || 'Community-Bericht', steps: clean.steps, vars: clean.vars, icon: full.icon, color: full.color, hubId: full.id, run: hasConnection });
  });
  const openLocal = (r) => guarded(() => {
    const clean = sanitizeFlow(r, uid);
    load({ title: r.title || 'Bericht', steps: clean.steps, vars: clean.vars, icon: r.icon, color: r.color, hubId: r.hubId || null, localId: r.id });
  });
  const goHome = () => { setView('empty'); setShowVars(false); };

  // ── local library ────────────────────────────────────────────────────────
  const saveCurrent = () => {
    if (!hasSource({ steps })) { notify('warning', 'Zuerst eine Quelltabelle wählen.'); return; }
    const rec = saveLocal({ id: currentLocalId, title, icon: reportIcon, color: reportColor, steps, vars, hubId: sourceHubId });
    if (!rec) { notify('error', 'Speichern fehlgeschlagen — Browser-Speicher voll oder gesperrt.'); return; }
    setCurrentLocalId(rec.id);
    setLocalReports(listLocal());
    savedRef.current = snapshot(current);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
    notify('success', 'Bericht gespeichert.');
  };

  const deleteLocalReport = (id) => {
    const rec = localReports.find(r => r.id === id);
    setConfirm({
      title: 'Bericht löschen?',
      message: `„${rec?.title || 'Bericht'}“ wird dauerhaft aus diesem Browser entfernt.`,
      confirmLabel: 'Löschen', danger: true,
      onConfirm: () => {
        setConfirm(null);
        deleteLocal(id);
        setLocalReports(listLocal());
        if (id === currentLocalId) setCurrentLocalId(null);
        notify('success', 'Bericht gelöscht.');
      },
    });
  };

  // ── connection test + save ───────────────────────────────────────────────
  const testConnection = async () => {
    setTestingConn(true); setConnTestResult(null);
    const r = await postJson(`${BRIDGE_URL}/api/query`, { sql: 'SELECT 1 AS test', connectionConfig: dbConfigDraft }, { timeoutMs: 30_000 });
    setConnTestResult(r.ok ? { ok: true, message: 'Verbindung erfolgreich' } : { ok: false, message: r.error });
    if (r.status === 0) checkBridge();
    setTestingConn(false);
  };

  // Read the structure of the connected database and use it as a schema version.
  const exportSchema = async (versionName, overwrite = false) => {
    setExportingSchema(true); setExportResult(null);
    const r = await postJson(`${BRIDGE_URL}/api/schema/export`,
      { connectionConfig: dbConfigDraft, version: versionName, overwrite }, { timeoutMs: 120_000 });
    if (r.ok && r.data?.saved) {
      await loadVersions();
      setSelectedVersion(r.data.version);
      setExportResult({ ok: true, message: `Version ${r.data.version} gespeichert (${r.data.tables} Tabellen, ${r.data.columns} Spalten) und ausgewählt.` });
    } else if (r.ok && r.data?.schema) {
      const blob = new Blob([JSON.stringify(r.data.schema, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: `${r.data.version}.json` }).click();
      URL.revokeObjectURL(url);
      setExportResult({ ok: true, message: `${r.data.version}.json heruntergeladen. Dieser Server speichert nichts — Datei in den Ordner „versions“ der Bridge legen.` });
    } else {
      setExportResult({ ok: false, message: r.error, exists: r.code === 'EXISTS' });
      if (r.status === 0) checkBridge();
    }
    setExportingSchema(false);
  };

  const applySettings = async () => {
    setPref('jtl_wawi_version', selectedVersion);
    try {
      await saveDbConfig(dbConfigDraft);
    } catch {
      notify('error', 'Zugangsdaten konnten nicht gespeichert werden (Browser-Speicher gesperrt).', 4000);
    }
    setDbConfig(dbConfigDraft);
    setConnTestResult(null); setSettingsHint(null);
    setShowSettings(false);
  };

  const forgetCredentials = () => {
    clearDbConfig();
    setDbConfig({ ...EMPTY_CONFIG }); setDbConfigDraft({ ...EMPTY_CONFIG });
    setConnTestResult(null);
    notify('success', 'Zugangsdaten aus diesem Browser entfernt.');
  };

  const openSettings = () => { setDbConfigDraft({ ...dbConfig }); setConnTestResult(null); setShowSettings(true); };
  const closeSettings = () => { setShowSettings(false); setSettingsHint(null); };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div ref={scrollRef} style={{ position: 'relative', height: '100dvh', overflowY: 'auto', overflowX: 'hidden', background: '#050505' }}>
      <BgFX />

      {view === 'empty' && (
        <div style={{ position: 'relative', zIndex: 2 }}>
          <TopBar onSettings={openSettings} onHub={() => setView('community')} connected={hasConnection} />
          <BridgeBanner status={bridge} onRetry={checkBridge} />
          <EmptyView
            schema={schema} bridge={bridge} onTemplate={openTemplate} onBlank={startBlank}
            onOpenCommunity={() => setView('community')}
            localReports={localReports} onOpenLocal={openLocal} onDeleteLocal={deleteLocalReport}
            draft={steps.length > 0 ? { ...current, dirty } : null} onResume={() => setView('builder')}
          />
        </div>
      )}

      {view === 'community' && (
        <div style={{ position: 'relative', zIndex: 2 }}>
          <TopBar onSettings={openSettings} connected={hasConnection} />
          <CommunityGallery onClose={() => setView('empty')} onImport={importFromHub} />
        </div>
      )}

      {view === 'builder' && (
        <div style={{ position: 'relative', zIndex: 2 }}>
          {/* Floating top nav pill */}
          <div className="nav-wrap" style={{ position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 80 }}>
            <NavPill
              title={title} setTitle={setTitle} editTitle={editTitle} setEditTitle={setEditTitle}
              onHome={goHome} onRun={() => executeQuery()} onCancel={cancelQuery} running={running}
              onSettings={openSettings} showVars={showVars} setShowVars={setShowVars}
              onSave={saveCurrent} onPublish={() => setShowPublish(true)} saved={savedFlash} dirty={dirty}
              issues={issues} connected={hasConnection}
            />
          </div>

          {/* Variables floating panel */}
          {showVars && (
            <div style={{ position: 'fixed', top: 84, right: 24, zIndex: 75 }}>
              <VariablesPanel vars={vars} setVars={setVars} onClose={() => setShowVars(false)} />
            </div>
          )}

          {/* Pipeline column */}
          <div className="pipeline-col" style={{ maxWidth: 720, margin: '0 auto', padding: `108px 28px ${drawer ? 'min(64vh,560px)' : '120px'}`, transition: 'padding .42s cubic-bezier(.4,0,.1,1)' }}>
            <BridgeBanner status={bridge} onRetry={checkBridge} style={{ marginBottom: 18 }} />
            <PipelineHeader steps={steps} issues={issues} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {steps.map((s, i) => (
                <React.Fragment key={s.id}>
                  {i > 0 && <Connector steps={steps} onInsert={(type) => addStep(type, i)} />}
                  <div className="step-enter" style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}>
                    <StepCard schema={schema} step={s} steps={steps} index={i} vars={vars}
                      onChange={(p) => patchStep(s.id, p)} onRemove={() => removeStep(s.id)}
                      canRemove={s.type !== 'source'} onOpenVars={() => setShowVars(true)} />
                  </div>
                </React.Fragment>
              ))}
              {steps.length > 0 && <Connector terminal />}
              <AddStepButton steps={steps} onAdd={(type) => addStep(type)} />
            </div>
          </div>

          <ResultsDrawer open={drawer} onToggle={() => setDrawer(d => !d)} sql={generatedSql}
            running={running} results={results} error={error} executionTime={executionTime}
            truncated={truncated} onCancel={cancelQuery} onRun={() => executeQuery()} connected={hasConnection} onSettings={openSettings} />
        </div>
      )}

      {showSettings && (
        <SettingsModal
          draft={dbConfigDraft}
          setField={(k, v) => { setDbConfigDraft(p => ({ ...p, [k]: v })); setConnTestResult(null); }}
          version={selectedVersion} setVersion={setSelectedVersion} versions={availableVersions}
          onTest={testConnection} testing={testingConn} testResult={connTestResult}
          onExportSchema={exportSchema} exportingSchema={exportingSchema} exportResult={exportResult} schemaSave={schemaSave}
          onClose={closeSettings} onSave={applySettings} onForget={hasConnection ? forgetCredentials : null}
          secure={isSecureContext()} hint={settingsHint}
          target={bridgeTarget()} localTarget={isLocalTarget()} bridge={bridge}
        />
      )}

      {showPublish && (
        <PublishModal
          steps={steps} vars={vars}
          defaultTitle={title} defaultIcon={reportIcon} defaultColor={reportColor}
          onClose={() => setShowPublish(false)}
          onPublished={() => notify('success', 'In der Community veröffentlicht.')}
        />
      )}

      {confirm && (
        <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />
      )}

      <Toast toast={toast} />
    </div>
  );
}
