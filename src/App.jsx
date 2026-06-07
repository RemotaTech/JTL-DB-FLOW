/**
 * DBFLOW — JTL Report Builder.
 *
 * Single-page dark glass app. Two views:
 *   empty   → onboarding (template gallery + blank-start table picker)
 *   builder → linear step pipeline + floating nav pill + results drawer
 *
 * The builder UI is design-faithful (Claude Design handoff) but wired to the
 * REAL stack: schema from the local bridge, T-SQL generated from the steps,
 * live query execution, encrypted MSSQL credentials.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { uid, newStep, stepsToSql } from './lib/steps.js';
import { loadDbConfig, saveDbConfig, EMPTY_CONFIG, isSecureContext } from './lib/crypto.js';
import { BgFX, TopBar, NavPill, PipelineHeader, Connector, AddStepButton } from './components/builder/shell.jsx';
import EmptyView from './components/builder/EmptyView.jsx';
import StepCard from './components/builder/StepCard.jsx';
import ResultsDrawer from './components/builder/ResultsDrawer.jsx';
import VariablesPanel from './components/builder/VariablesPanel.jsx';
import SettingsModal from './components/builder/SettingsModal.jsx';
import CommunityGallery from './components/builder/CommunityGallery.jsx';
import PublishModal from './components/builder/PublishModal.jsx';
import { pingExecution } from './lib/hubApi.js';
import { listLocal, saveLocal, deleteLocal } from './lib/localStore.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL ?? 'http://localhost:3001';

const DEFAULT_VARS = [
  { id: 'v1', name: 'zeitraum', value: 'DATEADD(day, -30, GETDATE())', label: 'Letzte 30 Tage' },
];

export default function App() {
  // ── view + pipeline ──────────────────────────────────────────────────────
  const [view, setView] = useState('empty');        // empty | builder | community
  const [steps, setSteps] = useState([]);
  const [title, setTitle] = useState('Neuer Bericht');
  const [editTitle, setEditTitle] = useState(false);
  const [vars, setVars] = useState(DEFAULT_VARS);
  const [reportIcon, setReportIcon] = useState('database');
  const [reportColor, setReportColor] = useState('#3b82f6');

  // ── community / local library ──────────────────────────────────────────────
  const [localReports, setLocalReports] = useState(() => listLocal());
  const [sourceHubId, setSourceHubId] = useState(null);   // hub id if imported
  const [currentLocalId, setCurrentLocalId] = useState(null);
  const [showPublish, setShowPublish] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // ── data / execution ─────────────────────────────────────────────────────
  const [schema, setSchema] = useState(null);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [executionTime, setExecutionTime] = useState(null);
  const [running, setRunning] = useState(false);
  const [drawer, setDrawer] = useState(false);

  // ── panels ───────────────────────────────────────────────────────────────
  const [showVars, setShowVars] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // ── versions + connection ────────────────────────────────────────────────
  const [availableVersions, setAvailableVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(localStorage.getItem('jtl_wawi_version') || '');
  const [dbConfig, setDbConfig] = useState({ ...EMPTY_CONFIG });
  const [dbConfigDraft, setDbConfigDraft] = useState({ ...EMPTY_CONFIG });
  const [testingConn, setTestingConn] = useState(false);
  const [connTestResult, setConnTestResult] = useState(null); // null | 'ok' | 'error'

  const scrollRef = useRef(null);

  // ── generated SQL ────────────────────────────────────────────────────────
  const generatedSql = useMemo(() => stepsToSql(steps, vars, schema), [steps, vars, schema]);

  // ── effects: config + schema ─────────────────────────────────────────────
  useEffect(() => {
    loadDbConfig().then(cfg => { setDbConfig(cfg); setDbConfigDraft(cfg); });
  }, []);

  useEffect(() => {
    fetch(`${BRIDGE_URL}/api/versions`)
      .then(r => r.json())
      .then(d => setAvailableVersions(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const endpoint = selectedVersion ? `${BRIDGE_URL}/api/schema/${selectedVersion}` : `${BRIDGE_URL}/api/schema`;
    fetch(endpoint)
      .then(r => r.json())
      .then(setSchema)
      .catch(() => {
        fetch(`${BRIDGE_URL}/api/schema`).then(r => r.json()).then(setSchema).catch(() => {});
      });
  }, [selectedVersion]);

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
        next.push(ns); // always append the format step at the very end
      } else if (atIndex == null) {
        // insert before a trailing "columns" step, and always before "format"
        let at = next.length;
        if (fi >= 0) at = fi;
        const ci = next.findIndex(x => x.type === 'columns');
        if (type !== 'columns' && ci >= 0 && ci < at) at = ci;
        next.splice(at, 0, ns);
      } else {
        // explicit position, but never after the format step
        next.splice(fi >= 0 ? Math.min(atIndex, fi) : atIndex, 0, ns);
      }
      return next;
    });
  };

  // ── query execution ──────────────────────────────────────────────────────
  const executeQuery = async (sqlArg) => {
    const sql = sqlArg ?? generatedSql;
    if (!sql) return;
    setRunning(true);
    setDrawer(true);
    setError(null);
    const t0 = performance.now();
    try {
      const connPayload = (dbConfig.host && dbConfig.user) ? dbConfig : undefined;
      const res = await fetch(`${BRIDGE_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, connectionConfig: connPayload }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Abfrage fehlgeschlagen'); setResults([]); }
      else {
        setResults(Array.isArray(data) ? data : []);
        // Count a real execution of an imported community report.
        if (sourceHubId) pingExecution(sourceHubId);
      }
      setExecutionTime(((performance.now() - t0) / 1000).toFixed(3));
    } catch (err) {
      setError(err.message || 'Verbindung zum Server fehlgeschlagen');
      setResults([]);
    } finally {
      setRunning(false);
    }
  };

  // ── onboarding actions ───────────────────────────────────────────────────
  const openTemplate = (tpl) => {
    const built = tpl.build();
    setTitle(tpl.title);
    setSteps(built);
    setReportIcon(tpl.icon || 'database'); setReportColor(tpl.color || '#3b82f6');
    setSourceHubId(null); setCurrentLocalId(null);
    setView('builder');
    setResults([]); setError(null);
    // auto-run the template against the live DB
    setTimeout(() => executeQuery(stepsToSql(built, vars, schema)), 200);
  };
  const startBlank = (table) => {
    setTitle('Neuer Bericht');
    setSteps([{ id: uid(), type: 'source', table }]);
    setReportIcon('database'); setReportColor('#3b82f6');
    setSourceHubId(null); setCurrentLocalId(null);
    setView('builder');
    setDrawer(false); setResults([]); setError(null);
  };

  // ── community import + local library ───────────────────────────────────────
  const importFromHub = (full) => {
    const built = full.flowData?.steps || [];
    const v = full.flowData?.vars || [];
    setTitle(full.title || 'Community-Bericht');
    setSteps(built); setVars(v);
    setReportIcon(full.icon || 'database'); setReportColor(full.color || '#3b82f6');
    setSourceHubId(full.id); setCurrentLocalId(null);
    setView('builder');
    setResults([]); setError(null);
    setTimeout(() => executeQuery(stepsToSql(built, v, schema)), 200);
  };

  const openLocal = (r) => {
    setTitle(r.title || 'Bericht');
    setSteps(r.steps || []); setVars(r.vars || []);
    setReportIcon(r.icon || 'database'); setReportColor(r.color || '#3b82f6');
    setSourceHubId(r.hubId || null); setCurrentLocalId(r.id);
    setView('builder');
    setDrawer(false); setResults([]); setError(null);
  };

  const saveCurrent = () => {
    if (!steps.some(s => s.type === 'source' && s.table)) return;
    const rec = saveLocal({ id: currentLocalId, title, icon: reportIcon, color: reportColor, steps, vars, hubId: sourceHubId });
    setCurrentLocalId(rec.id);
    setLocalReports(listLocal());
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  };

  const deleteLocalReport = (id) => {
    deleteLocal(id);
    setLocalReports(listLocal());
    if (id === currentLocalId) setCurrentLocalId(null);
  };

  // ── connection test + save ───────────────────────────────────────────────
  const testConnection = async () => {
    setTestingConn(true); setConnTestResult(null);
    try {
      const res = await fetch(`${BRIDGE_URL}/api/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: 'SELECT 1 AS test', connectionConfig: dbConfigDraft }),
      });
      setConnTestResult(res.ok ? 'ok' : 'error');
    } catch { setConnTestResult('error'); }
    finally { setTestingConn(false); }
  };

  const applySettings = async () => {
    localStorage.setItem('jtl_wawi_version', selectedVersion);
    await saveDbConfig(dbConfigDraft);
    setDbConfig(dbConfigDraft);
    setConnTestResult(null);
    setShowSettings(false);
  };

  const openSettings = () => { setDbConfigDraft({ ...dbConfig }); setConnTestResult(null); setShowSettings(true); };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div ref={scrollRef} style={{ position: 'relative', height: '100dvh', overflowY: 'auto', overflowX: 'hidden', background: '#050505' }}>
      <BgFX />

      {view === 'empty' && (
        <div style={{ position: 'relative', zIndex: 2 }}>
          <TopBar onSettings={openSettings} onHub={() => setView('community')} />
          <EmptyView
            schema={schema} onTemplate={openTemplate} onBlank={startBlank}
            onOpenCommunity={() => setView('community')}
            localReports={localReports} onOpenLocal={openLocal} onDeleteLocal={deleteLocalReport}
          />
        </div>
      )}

      {view === 'community' && (
        <div style={{ position: 'relative', zIndex: 2 }}>
          <TopBar onSettings={openSettings} />
          <CommunityGallery onClose={() => setView('empty')} onImport={importFromHub} />
        </div>
      )}

      {view === 'builder' && (
        <div style={{ position: 'relative', zIndex: 2 }}>
          {/* Floating top nav pill */}
          <div style={{ position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 80 }}>
            <NavPill
              title={title} setTitle={setTitle} editTitle={editTitle} setEditTitle={setEditTitle}
              onHome={() => setView('empty')} onRun={() => executeQuery()} running={running}
              onSettings={openSettings} showVars={showVars} setShowVars={setShowVars}
              onSave={saveCurrent} onPublish={() => setShowPublish(true)} saved={savedFlash}
            />
          </div>

          {/* Variables floating panel */}
          {showVars && (
            <div style={{ position: 'fixed', top: 84, right: 24, zIndex: 75 }}>
              <VariablesPanel vars={vars} setVars={setVars} onClose={() => setShowVars(false)} />
            </div>
          )}

          {/* Pipeline column */}
          <div style={{ maxWidth: 720, margin: '0 auto', padding: `108px 28px ${drawer ? 'min(64vh,560px)' : '120px'}`, transition: 'padding .42s cubic-bezier(.4,0,.1,1)' }}>
            <PipelineHeader steps={steps} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {steps.map((s, i) => (
                <React.Fragment key={s.id}>
                  {i > 0 && <Connector steps={steps} onInsert={(type) => addStep(type, i)} />}
                  <div className="step-enter" style={{ animationDelay: `${i * 0.04}s` }}>
                    <StepCard schema={schema} step={s} steps={steps} index={i}
                      onChange={(p) => patchStep(s.id, p)} onRemove={() => removeStep(s.id)}
                      canRemove={s.type !== 'source'} />
                  </div>
                </React.Fragment>
              ))}
              {steps.length > 0 && <Connector terminal />}
              <AddStepButton steps={steps} onAdd={(type) => addStep(type)} />
            </div>
          </div>

          <ResultsDrawer open={drawer} onToggle={() => setDrawer(d => !d)} sql={generatedSql}
            running={running} results={results} error={error} executionTime={executionTime} />
        </div>
      )}

      {showSettings && (
        <SettingsModal
          draft={dbConfigDraft}
          setField={(k, v) => setDbConfigDraft(p => ({ ...p, [k]: v }))}
          version={selectedVersion} setVersion={setSelectedVersion} versions={availableVersions}
          onTest={testConnection} testing={testingConn} testResult={connTestResult}
          onClose={() => setShowSettings(false)} onSave={applySettings}
          secure={isSecureContext()}
        />
      )}

      {showPublish && (
        <PublishModal
          steps={steps} vars={vars}
          defaultTitle={title} defaultIcon={reportIcon} defaultColor={reportColor}
          onClose={() => setShowPublish(false)}
        />
      )}
    </div>
  );
}
