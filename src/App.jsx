import React, { useState, useCallback, useMemo, useEffect } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Panel,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import { TableNode, JoinNode, FilterNode, SortNode, AggregateNode, ColumnSelectorNode, DistinctNode, FormatterNode } from './nodes';
import {
  Database, Play, Code, Layers, Settings, ChevronUp, ChevronDown,
  Plus, GitMerge, Filter, ListOrdered, Save, FolderOpen, FilePlus,
  Trash2, Library, ListChecks, Sparkles, HelpCircle, MousePointer,
  Move, Globe, Loader2, Eye, EyeOff, CheckCircle2, XCircle, Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './lib/utils';
import { generateSql } from './utils/queryGenerator';
import HubModal from './components/HubModal';
import { loadDbConfig, saveDbConfig, clearDbConfig, EMPTY_CONFIG, isSecureContext } from './lib/crypto';

// In dev Vite proxies /api → localhost:3001 so BRIDGE_URL stays empty.
// In production (app hosted on Coolify) the MSSQL bridge still runs on the
// user's own machine, so we point directly to http://localhost:3001.
const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL ?? 'http://localhost:3001';

const nodeTypes = {
  tableNode: TableNode,
  joinNode: JoinNode,
  whereNode: FilterNode,
  orderByNode: SortNode,
  groupByNode: AggregateNode,
  columnSelector: ColumnSelectorNode,
  distinctNode: DistinctNode,
  formatterNode: FormatterNode,
};

// ─── Component ─────────────────────────────────────────────────────────────

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [schema, setSchema] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [availableVersions, setAvailableVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(localStorage.getItem('jtl_wawi_version') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [canZoom, setCanZoom] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [executionTime, setExecutionTime] = useState(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  // MSSQL connection config — encrypted in localStorage, decrypted async on mount
  const [dbConfig, setDbConfig] = useState({ ...EMPTY_CONFIG });
  const [dbConfigDraft, setDbConfigDraft] = useState({ ...EMPTY_CONFIG });
  const [configReady, setConfigReady] = useState(false); // true once decryption resolves
  const [showPassword, setShowPassword] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [connTestResult, setConnTestResult] = useState(null); // null | 'ok' | 'error'

  // Workflow State
  const [showWorkflowsModal, setShowWorkflowsModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showHub, setShowHub] = useState(false);
  const [workflows, setWorkflows] = useState(() => {
    const saved = localStorage.getItem('jtl_workflows');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentWorkflowName, setCurrentWorkflowName] = useState('');

  // ── Workflow CRUD ──────────────────────────────────────────────────────

  const saveWorkflow = () => {
    let name = currentWorkflowName;
    if (!name) {
      name = prompt('Bitte geben Sie einen Namen für den Workflow ein:');
      if (!name) return;
    }
    const newWorkflow = {
      id: Date.now().toString(),
      name,
      nodes,
      edges,
      updatedAt: new Date().toISOString(),
    };
    let updatedWorkflows;
    const existingIndex = workflows.findIndex(w => w.name === name);
    if (existingIndex >= 0) {
      updatedWorkflows = [...workflows];
      updatedWorkflows[existingIndex] = newWorkflow;
    } else {
      updatedWorkflows = [...workflows, newWorkflow];
    }
    setWorkflows(updatedWorkflows);
    localStorage.setItem('jtl_workflows', JSON.stringify(updatedWorkflows));
    setCurrentWorkflowName(name);
    alert('Workflow gespeichert!');
  };

  const loadWorkflow = (wf) => {
    setNodes(wf.nodes || []);
    setEdges(wf.edges || []);
    setCurrentWorkflowName(wf.name);
    setShowWorkflowsModal(false);
  };

  const deleteWorkflow = (id) => {
    if (confirm('Möchten Sie diesen Workflow wirklich löschen?')) {
      const updated = workflows.filter(w => w.id !== id);
      setWorkflows(updated);
      localStorage.setItem('jtl_workflows', JSON.stringify(updated));
      if (currentWorkflowName === workflows.find(w => w.id === id)?.name) {
        setCurrentWorkflowName('');
      }
    }
  };

  const newWorkflow = () => {
    if (confirm('Möchten Sie wirklich einen neuen Workflow beginnen? Ungespeicherte Änderungen gehen verloren.')) {
      setNodes([]);
      setEdges([]);
      setCurrentWorkflowName('');
      setResults([]);
      setError(null);
    }
  };

  // ── Schema loading ─────────────────────────────────────────────────────

  // Decrypt and load stored MSSQL config on mount
  useEffect(() => {
    loadDbConfig().then(cfg => {
      setDbConfig(cfg);
      setDbConfigDraft(cfg);
      setConfigReady(true);
    });
  }, []);

  useEffect(() => {
    fetch(`${BRIDGE_URL}/api/versions`)
      .then(res => res.json())
      .then(data => setAvailableVersions(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    const endpoint = selectedVersion
      ? `${BRIDGE_URL}/api/schema/${selectedVersion}`
      : `${BRIDGE_URL}/api/schema`;
    fetch(endpoint)
      .then(res => res.json())
      .then(data => setSchema(data))
      .catch(err => {
        console.error('Failed to load version schema', err);
        fetch(`${BRIDGE_URL}/api/schema`)
          .then(res => res.json())
          .then(data => setSchema(data))
          .catch(console.error);
      });
  }, [selectedVersion]);

  // ── Node management ────────────────────────────────────────────────────

  const onDeleteNode = useCallback((nodeId) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
  }, [setNodes, setEdges]);

  const onNodeDataChange = useCallback((nodeId, newData) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node
      )
    );
  }, [setNodes]);

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, animated: true }, eds));
  }, [setEdges]);

  const addNode = useCallback((type) => {
    let position = { x: 100 + Math.random() * 400, y: 100 + Math.random() * 300 };
    if (reactFlowInstance) {
      position = reactFlowInstance.project({
        x: window.innerWidth / 2 - 100,
        y: window.innerHeight / 2 - 50,
      });
    }
    const id = `${type}-${Date.now()}`;
    setNodes((nds) => nds.concat({
      id,
      type,
      position,
      data: {
        schema,
        onNodeDataChange,
        onDeleteNode,
        joinType: type === 'joinNode' ? 'INNER JOIN' : undefined,
        orderDirection: type === 'orderByNode' ? 'ASC' : undefined,
      },
      dragHandle: '.drag-handle',
    }));
  }, [schema, onNodeDataChange, onDeleteNode, setNodes, reactFlowInstance]);

  // ── SQL generation ─────────────────────────────────────────────────────

  const generatedSql = useMemo(() => generateSql(nodes, edges), [nodes, edges]);

  // ── Query execution ────────────────────────────────────────────────────

  const executeQuery = async () => {
    if (!generatedSql) return;
    setLoading(true);
    setShowPreview(true);
    setError(null);
    const startTime = performance.now();
    try {
      // connectionConfig is included so the local server uses the user-supplied
      // credentials. Credentials are stored only in localStorage — they are sent
      // to localhost:3001 (same machine) and never to the hub server.
      const connPayload = (dbConfig.host && dbConfig.user) ? dbConfig : undefined;
      const res = await fetch(`${BRIDGE_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: generatedSql, connectionConfig: connPayload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Query failed');
        setResults([]);
      } else {
        setResults(Array.isArray(data) ? data : []);
      }
      setExecutionTime(((performance.now() - startTime) / 1000).toFixed(3));
    } catch (err) {
      console.error(err);
      setError(err.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // ── Connection test ────────────────────────────────────────────────────

  const testConnection = async () => {
    setTestingConn(true);
    setConnTestResult(null);
    try {
      const res = await fetch(`${BRIDGE_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: 'SELECT 1 AS test',
          connectionConfig: dbConfigDraft,
        }),
      });
      setConnTestResult(res.ok ? 'ok' : 'error');
    } catch {
      setConnTestResult('error');
    } finally {
      setTestingConn(false);
    }
  };

  // ── Sorting ────────────────────────────────────────────────────────────

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortedResults = useMemo(() => {
    if (!sortConfig.key) return results;
    return [...results].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [results, sortConfig]);

  // ── CSV export ─────────────────────────────────────────────────────────

  const downloadCsv = () => {
    if (!results.length) return;
    const headers = Object.keys(results[0]);
    const csvContent = [
      headers.join(','),
      ...results.map(row =>
        headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = String(val).replace(/"/g, '""');
          return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
        }).join(',')
      ),
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: `jtl_export_${new Date().toISOString().split('T')[0]}.csv`,
      style: 'display:none',
    });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ── Settings save ──────────────────────────────────────────────────────

  const applySettings = async () => {
    localStorage.setItem('jtl_wawi_version', selectedVersion);
    await saveDbConfig(dbConfigDraft);   // AES-256-GCM encrypt → localStorage
    setDbConfig(dbConfigDraft);
    setConnTestResult(null);
    setShowSettings(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-screen relative bg-[#050505] text-white overflow-hidden font-sans">
      <ReactFlowProvider>
        <div className="absolute inset-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onNodeMouseEnter={() => setCanZoom(false)}
            onNodeMouseLeave={() => setCanZoom(true)}
            nodeTypes={nodeTypes}
            zoomOnScroll={canZoom}
            fitView
          >
            <Background color="#1a1a1a" gap={20} />

            {/* ── Top Navigation Bar ──────────────────────────────────── */}
            <Panel position="top-center" className="mt-4">
              <div className="glass px-6 py-3 rounded-full flex items-center justify-between w-[1060px] shadow-2xl border border-white/10 transition-all duration-500">
                {/* Logo */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <Database size={14} className="text-white" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm tracking-tight text-white leading-tight">
                      JTL<span className="text-white/40 font-medium">FLOW</span>
                    </span>
                    {currentWorkflowName && (
                      <span className="text-[10px] text-blue-400 font-medium">{currentWorkflowName}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Library dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setShowLibrary(!showLibrary)}
                      className={cn(
                        'flex items-center gap-2 text-xs font-bold px-4 py-1.5 rounded-full transition-all border',
                        showLibrary
                          ? 'bg-white/10 border-white/20 text-white'
                          : 'border-transparent text-white/60 hover:text-white'
                      )}
                    >
                      <Library size={14} />
                      Bibliothek
                      <ChevronDown size={12} className={cn('transition-transform', showLibrary && 'rotate-180')} />
                    </button>

                    <AnimatePresence>
                      {showLibrary && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setShowLibrary(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute top-full mt-3 left-0 w-56 glass rounded-2xl p-2 shadow-2xl border border-white/10 z-20 flex flex-col gap-1"
                          >
                            <button
                              onClick={() => { newWorkflow(); setShowLibrary(false); }}
                              className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 text-xs font-semibold text-white/60 hover:text-white transition-all text-left group/btn"
                            >
                              <div className="p-2 bg-blue-500/10 rounded-lg group-hover/btn:bg-blue-500/20 transition-colors text-blue-400">
                                <FilePlus size={14} />
                              </div>
                              Neu erstellen
                            </button>
                            <button
                              onClick={() => { setShowWorkflowsModal(true); setShowLibrary(false); }}
                              className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 text-xs font-semibold text-white/60 hover:text-white transition-all text-left group/btn"
                            >
                              <div className="p-2 bg-purple-500/10 rounded-lg group-hover/btn:bg-purple-500/20 transition-colors text-purple-400">
                                <FolderOpen size={14} />
                              </div>
                              Workflows öffnen
                            </button>
                            <div className="h-[1px] bg-white/5 my-1" />
                            <button
                              onClick={() => { saveWorkflow(); setShowLibrary(false); }}
                              className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 text-xs font-semibold text-white/60 hover:text-white transition-all text-left group/btn"
                            >
                              <div className="p-2 bg-emerald-500/10 rounded-lg group-hover/btn:bg-emerald-500/20 transition-colors text-emerald-400">
                                <Save size={14} />
                              </div>
                              Speichern
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="h-4 w-[1px] bg-white/10" />

                  {/* Community Hub button */}
                  <button
                    onClick={() => setShowHub(true)}
                    className="flex items-center gap-2 text-xs font-bold px-4 py-1.5 rounded-full border border-transparent text-white/60 hover:text-white hover:bg-white/5 transition-all"
                  >
                    <Globe size={14} className="text-blue-400" />
                    Community
                  </button>

                  <div className="h-4 w-[1px] bg-white/10" />

                  {/* Settings */}
                  <button
                    onClick={() => {
                      setDbConfigDraft({ ...dbConfig });
                      setConnTestResult(null);
                      setShowSettings(true);
                    }}
                    className="flex items-center gap-2 text-[10px] font-bold text-white/40 hover:text-white transition-colors px-3 py-1.5 rounded-full hover:bg-white/5"
                  >
                    <Settings size={14} />
                    SETTINGS
                  </button>

                  <div className="h-4 w-[1px] bg-white/10" />

                  {/* Run */}
                  <button
                    onClick={executeQuery}
                    disabled={loading || !generatedSql}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-full text-[10px] font-black tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Play size={10} className="fill-current" />}
                    {loading ? 'RUNNING' : 'RUN'}
                  </button>
                </div>
              </div>
            </Panel>

            {/* ── Settings Modal ──────────────────────────────────────── */}
            <AnimatePresence>
              {showSettings && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="glass w-[480px] rounded-3xl overflow-hidden shadow-2xl border border-white/10 max-h-[90vh] flex flex-col"
                  >
                    {/* Header */}
                    <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02] shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
                          <Settings size={16} className="text-white/60" />
                        </div>
                        <h2 className="text-base font-bold">Einstellungen</h2>
                      </div>
                      <button
                        onClick={() => setShowSettings(false)}
                        className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-white"
                      >
                        <Plus size={16} className="rotate-45" />
                      </button>
                    </div>

                    {/* Body */}
                    <div className="p-6 space-y-6 overflow-y-auto flex-1">

                      {/* JTL Version */}
                      <section className="space-y-3">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                          JTL Wawi Version
                        </label>
                        <div className="relative">
                          <select
                            value={selectedVersion}
                            onChange={e => setSelectedVersion(e.target.value)}
                            className="w-full appearance-none px-4 py-3 bg-[#1a1b26] rounded-xl border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500/50"
                          >
                            <option value="">Standard (schema.json)</option>
                            {availableVersions.map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                          <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                        </div>
                        <p className="text-[10px] text-white/30 italic">
                          Die Änderung der Version lädt das entsprechende Datenbankschema.
                        </p>
                      </section>

                      {/* MSSQL Connection */}
                      <section className="space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                            MSSQL Verbindung
                          </label>
                          <span className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-bold border border-violet-500/20">
                            <Lock size={9} />
                            {isSecureContext() ? 'AES-256-GCM' : 'XOR-Obfuskierung'}
                          </span>
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                            NUR BROWSER
                          </span>
                        </div>

                        {/* HTTPS warning — only shown on insecure origins */}
                        {!isSecureContext() && (
                          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                            <span className="text-amber-400 mt-0.5 shrink-0">⚠️</span>
                            <p className="text-[10px] text-amber-300/80 leading-relaxed">
                              <strong className="text-amber-300">Kein HTTPS erkannt.</strong>{' '}
                              AES-256-GCM ist auf unsicheren Verbindungen nicht verfügbar.
                              Zugangsdaten werden stattdessen mit XOR verschleiert gespeichert.
                              Bitte HTTPS in Coolify aktivieren für vollständige Verschlüsselung.
                            </p>
                          </div>
                        )}

                        <p className="text-[10px] text-white/30 italic -mt-1">
                          Zugangsdaten werden verschlüsselt im Browser gespeichert. Der Schlüssel liegt nur im Sitzungsspeicher und verlässt niemals den Browser.
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[10px] text-white/40 font-semibold uppercase tracking-widest">DB_HOST</label>
                            <input
                              type="text"
                              placeholder="192.168.1.100"
                              value={dbConfigDraft.host}
                              onChange={e => setDbConfigDraft(p => ({ ...p, host: e.target.value }))}
                              className="w-full px-3 py-2.5 bg-[#1a1b26] rounded-xl border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-colors"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] text-white/40 font-semibold uppercase tracking-widest">DB_PORT</label>
                            <input
                              type="text"
                              placeholder="1433"
                              value={dbConfigDraft.port}
                              onChange={e => setDbConfigDraft(p => ({ ...p, port: e.target.value }))}
                              className="w-full px-3 py-2.5 bg-[#1a1b26] rounded-xl border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-colors"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[10px] text-white/40 font-semibold uppercase tracking-widest">
                              DB_INSTANCE <span className="normal-case text-white/20">(optional)</span>
                            </label>
                            <input
                              type="text"
                              placeholder="SQLS"
                              value={dbConfigDraft.instance}
                              onChange={e => setDbConfigDraft(p => ({ ...p, instance: e.target.value }))}
                              className="w-full px-3 py-2.5 bg-[#1a1b26] rounded-xl border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-colors"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] text-white/40 font-semibold uppercase tracking-widest">DB_NAME</label>
                            <input
                              type="text"
                              placeholder="eazybusiness"
                              value={dbConfigDraft.database}
                              onChange={e => setDbConfigDraft(p => ({ ...p, database: e.target.value }))}
                              className="w-full px-3 py-2.5 bg-[#1a1b26] rounded-xl border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-colors"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[10px] text-white/40 font-semibold uppercase tracking-widest">DB_USER</label>
                            <input
                              type="text"
                              placeholder="sa"
                              value={dbConfigDraft.user}
                              onChange={e => setDbConfigDraft(p => ({ ...p, user: e.target.value }))}
                              className="w-full px-3 py-2.5 bg-[#1a1b26] rounded-xl border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-colors"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] text-white/40 font-semibold uppercase tracking-widest">DB_PASS</label>
                            <div className="relative">
                              <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                value={dbConfigDraft.password}
                                onChange={e => setDbConfigDraft(p => ({ ...p, password: e.target.value }))}
                                className="w-full px-3 py-2.5 pr-10 bg-[#1a1b26] rounded-xl border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-colors"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(s => !s)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                              >
                                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Connection test feedback */}
                        {connTestResult && (
                          <div className={cn(
                            'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold',
                            connTestResult === 'ok'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          )}>
                            {connTestResult === 'ok'
                              ? <><CheckCircle2 size={14} /> Verbindung erfolgreich!</>
                              : <><XCircle size={14} /> Verbindung fehlgeschlagen.</>}
                          </div>
                        )}

                        {/* Test button */}
                        <button
                          onClick={testConnection}
                          disabled={testingConn || !dbConfigDraft.host || !dbConfigDraft.user}
                          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-white/60 hover:text-white transition-all border border-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {testingConn ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                          Verbindung testen
                        </button>
                      </section>
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-white/10 bg-white/[0.02] shrink-0 flex items-center justify-end gap-3">
                      <button
                        onClick={() => setShowSettings(false)}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-white/40 hover:text-white transition-all border border-white/10"
                      >
                        Abbrechen
                      </button>
                      <button
                        onClick={applySettings}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white transition-all shadow-lg shadow-blue-600/20"
                      >
                        Speichern
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* ── Workflows Modal ─────────────────────────────────────── */}
            <AnimatePresence>
              {showWorkflowsModal && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="glass w-[520px] rounded-3xl overflow-hidden shadow-2xl border border-white/10 max-h-[80vh] flex flex-col"
                  >
                    <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02] shrink-0">
                      <h2 className="text-base font-bold">Gespeicherte Workflows</h2>
                      <button
                        onClick={() => setShowWorkflowsModal(false)}
                        className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-white"
                      >
                        <Plus size={16} className="rotate-45" />
                      </button>
                    </div>
                    <div className="p-6 space-y-3 overflow-y-auto flex-1">
                      {workflows.length === 0 ? (
                        <p className="text-sm text-center text-white/30 py-10 italic">
                          Keine gespeicherten Workflows vorhanden.
                        </p>
                      ) : (
                        workflows.map(wf => (
                          <div key={wf.id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                            <div>
                              <div className="font-bold text-sm text-white/90">{wf.name}</div>
                              <div className="text-[10px] text-white/30 mt-0.5">
                                {new Date(wf.updatedAt).toLocaleString()}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => loadWorkflow(wf)}
                                className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-500/30 transition-colors"
                              >
                                Öffnen
                              </button>
                              <button
                                onClick={() => deleteWorkflow(wf.id)}
                                className="p-1.5 text-red-400/50 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* ── Left Sidebar ────────────────────────────────────────── */}
            <Panel position="left" className="ml-4 top-1/2 -translate-y-1/2">
              <div className="glass p-2 rounded-2xl flex flex-col gap-2 shadow-2xl border border-white/10">
                {[
                  { type: 'tableNode', icon: <Database size={18} />, label: 'Tabelle', color: 'text-blue-400' },
                  { type: 'joinNode', icon: <GitMerge size={18} />, label: 'Verknüpfung', color: 'text-purple-400' },
                  { type: 'whereNode', icon: <Filter size={18} />, label: 'Filter', color: 'text-amber-400' },
                  { type: 'orderByNode', icon: <ListOrdered size={18} />, label: 'Sortierung', color: 'text-emerald-400' },
                  { type: 'columnSelector', icon: <ListChecks size={18} />, label: 'Spaltenauswahl', color: 'text-emerald-500' },
                  { type: 'groupByNode', icon: <Layers size={18} className="rotate-90" />, label: 'Gruppierung', color: 'text-rose-400' },
                  { type: 'distinctNode', icon: <Layers size={18} />, label: 'Eindeutig', color: 'text-amber-500' },
                  { type: 'formatterNode', icon: <Sparkles size={18} />, label: 'Formatierung', color: 'text-pink-400' },
                ].map((item) => (
                  <button
                    key={item.type}
                    onClick={() => addNode(item.type)}
                    className="w-12 h-12 rounded-xl flex items-center justify-center glass-hover transition-all group relative"
                  >
                    <div className={cn('transition-transform group-hover:scale-110', item.color)}>
                      {item.icon}
                    </div>
                    <span className="absolute left-16 bg-black/80 text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10 uppercase tracking-widest z-50">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </Panel>

            {/* ── Canvas Help ─────────────────────────────────────────── */}
            <Panel position="top-right" style={{ top: '50%', transform: 'translateY(-50%)' }} className="mr-6 z-[200]">
              <div className="relative group/help">
                <div className="w-10 h-10 rounded-full glass flex items-center justify-center text-white/40 hover:text-white border border-white/10 hover:border-white/20 transition-all cursor-help shadow-2xl">
                  <HelpCircle size={20} />
                </div>
                <div className="absolute bottom-full right-0 mb-4 w-64 glass rounded-3xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 opacity-0 group-hover/help:opacity-100 translate-y-2 group-hover/help:translate-y-0 pointer-events-none transition-all duration-300 z-50">
                  <div className="space-y-4">
                    {[
                      { icon: <MousePointer size={14} />, color: 'bg-blue-500/20 text-blue-400', title: 'Navigation', desc: 'Klicken & Ziehen zum Bewegen' },
                      { icon: <Sparkles size={14} />, color: 'bg-purple-500/20 text-purple-400', title: 'Zoom', desc: 'Mausrad zum Vergrößern' },
                      { icon: <Move size={14} />, color: 'bg-emerald-500/20 text-emerald-400', title: 'Nodes', desc: 'Header ziehen zum Bewegen' },
                    ].map(({ icon, color, title, desc }) => (
                      <div key={title} className="flex items-center gap-3">
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color)}>{icon}</div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-white uppercase tracking-wider">{title}</span>
                          <span className="text-[11px] text-white/60">{desc}</span>
                        </div>
                      </div>
                    ))}
                    <div className="h-[1px] bg-white/5" />
                    <p className="text-[10px] text-white/30 italic text-center leading-tight">
                      Mausrad über Nodes steuert nur die Listen innerhalb der Box.
                    </p>
                  </div>
                </div>
              </div>
            </Panel>

            {/* ── Bottom Preview Panel ─────────────────────────────────── */}
            <div className={cn(
              'absolute bottom-0 left-0 right-0 z-[100] transition-all duration-500 ease-in-out',
              showPreview ? 'h-[400px]' : 'h-12'
            )}>
              <div className="h-full glass border-t border-white/10 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] flex flex-col">
                {/* Panel header */}
                <div className="h-12 flex items-center justify-between px-6 bg-white/5 border-b border-white/10 shrink-0">
                  <div className="flex items-center gap-6">
                    <button onClick={() => setShowPreview(!showPreview)} className="flex items-center gap-2 group">
                      <Code size={14} className="text-blue-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/60 group-hover:text-white transition-colors">
                        SQL View
                      </span>
                      <ChevronUp size={14} className={cn('text-white/20 transition-transform', showPreview && 'rotate-180')} />
                    </button>
                    <div className="h-4 w-[1px] bg-white/10" />
                    <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-white/40">
                      <div className="flex items-center gap-2">
                        <Database size={14} className="text-emerald-400" />
                        <span>{results.length} Zeilen</span>
                      </div>
                      {executionTime && (
                        <span className="lowercase font-mono text-[9px] text-white/20">({executionTime}s)</span>
                      )}
                      {error && (
                        <span className="text-red-400 normal-case font-mono text-[9px] truncate max-w-[300px]">
                          ⚠ {error}
                        </span>
                      )}
                    </div>
                  </div>
                  {results.length > 0 && (
                    <button
                      onClick={downloadCsv}
                      className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-lg text-[10px] font-bold transition-all border border-emerald-500/20 active:scale-95"
                    >
                      <FilePlus size={14} />
                      CSV EXPORT
                    </button>
                  )}
                </div>

                {/* Panel content */}
                <div className="flex-1 overflow-hidden grid grid-cols-2 divide-x divide-white/5 min-h-0">
                  {/* SQL preview */}
                  <div className="p-6 bg-black/20 overflow-auto font-mono text-xs">
                    <pre className="text-blue-200/80 leading-relaxed whitespace-pre-wrap">
                      {generatedSql || '-- Workflow erstellen, um SQL zu generieren'}
                    </pre>
                  </div>

                  {/* Results table */}
                  <div className="overflow-auto bg-black/40">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-[#0a0a0a] z-10 border-b border-white/10">
                        <tr>
                          {results.length > 0 && Object.keys(results[0]).map(h => (
                            <th
                              key={h}
                              onClick={() => handleSort(h)}
                              className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/40 whitespace-nowrap cursor-pointer hover:bg-white/5 transition-colors group"
                            >
                              <div className="flex items-center gap-2">
                                {h}
                                <div className={cn(
                                  'opacity-0 group-hover:opacity-100 transition-opacity',
                                  sortConfig.key === h && 'opacity-100 text-blue-400'
                                )}>
                                  {sortConfig.key === h && sortConfig.direction === 'desc'
                                    ? <ChevronDown size={10} />
                                    : <ChevronUp size={10} />}
                                </div>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {sortedResults.length > 0
                          ? sortedResults.map((row, i) => (
                            <tr key={i} className="hover:bg-white/5 transition-colors">
                              {Object.values(row).map((val, j) => (
                                <td key={j} className="px-4 py-3 text-xs text-white/60 font-mono whitespace-nowrap">
                                  {val === null || val === undefined ? <span className="text-white/20 italic">NULL</span> : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))
                          : (
                            <tr>
                              <td className="px-6 py-10 text-xs text-white/30 italic">
                                {error ? `Fehler: ${error}` : 'Noch keine Ergebnisse. Abfrage ausführen, um Daten anzuzeigen.'}
                              </td>
                            </tr>
                          )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </ReactFlow>
        </div>
      </ReactFlowProvider>

      {/* ── Community Hub Modal ──────────────────────────────────── */}
      <AnimatePresence>
        {showHub && (
          <HubModal
            onClose={() => setShowHub(false)}
            currentNodes={nodes}
            currentEdges={edges}
            currentWorkflowName={currentWorkflowName}
            onImport={(flowData, name) => {
              if (confirm(`Workflow "${name}" importieren? Ungespeicherte Änderungen gehen verloren.`)) {
                setNodes(flowData.nodes || []);
                setEdges(flowData.edges || []);
                setCurrentWorkflowName(name);
                setShowHub(false);
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
