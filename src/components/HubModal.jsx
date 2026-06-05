import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Download, Upload, X, ChevronDown, Loader2, CheckCircle2,
  AlertCircle, RotateCcw,
} from 'lucide-react';
import { cn } from '../lib/utils';

// ─── Bot-check question pool ───────────────────────────────────────────────

const BOT_QUESTIONS = [
  { q: '4 + 9',   a: '13' },
  { q: '15 − 7',  a: '8'  },
  { q: '6 × 3',   a: '18' },
  { q: '24 ÷ 4',  a: '6'  },
  { q: '11 + 8',  a: '19' },
  { q: '5 × 5',   a: '25' },
];
const randomQuestion = () => BOT_QUESTIONS[Math.floor(Math.random() * BOT_QUESTIONS.length)];

// ─── Helpers ───────────────────────────────────────────────────────────────

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1)  return 'heute';
  if (days < 2)  return 'gestern';
  if (days < 7)  return `vor ${days} Tagen`;
  if (days < 30) return `vor ${Math.floor(days / 7)} Wochen`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─── Tag pill (slim) ───────────────────────────────────────────────────────

function Tag({ tag, onClick, active }) {
  return (
    <button
      onClick={() => onClick?.(tag)}
      className={cn(
        'px-2 py-0.5 rounded text-[10px] transition-colors',
        active
          ? 'bg-blue-500/20 text-blue-300'
          : 'text-white/40 hover:text-white/70 hover:bg-white/5',
        onClick && 'cursor-pointer'
      )}
    >
      #{tag}
    </button>
  );
}

// ─── Flow row (informative, minimal chrome) ────────────────────────────────

function FlowRow({ flow, onImport, importing }) {
  const tags = flow.tags ? flow.tags.split(';').filter(Boolean) : [];
  return (
    <div className="group flex items-start gap-4 py-4 border-b border-white/5 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-white truncate">{flow.title}</h3>
          <span className="text-[10px] text-white/30">von {flow.author || 'Anonym'}</span>
        </div>
        {flow.description && (
          <p className="text-xs text-white/50 mt-1 line-clamp-2 leading-relaxed">
            {flow.description}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2 text-[10px] text-white/35">
          <span className="flex items-center gap-1">
            <Download size={10} /> {flow.downloads}
          </span>
          {flow.nodeCount > 0 && <span>{flow.nodeCount} Nodes</span>}
          <span>{fmtDate(flow.createdAt)}</span>
          {tags.length > 0 && (
            <div className="flex gap-1 ml-auto">
              {tags.slice(0, 3).map(t => <Tag key={t} tag={t} />)}
              {tags.length > 3 && <span className="text-[10px] text-white/25">+{tags.length - 3}</span>}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={() => onImport(flow)}
        disabled={importing}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-blue-500 text-white/70 hover:text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
      >
        {importing
          ? <Loader2 size={12} className="animate-spin" />
          : <Download size={12} />}
        Import
      </button>
    </div>
  );
}

// ─── HubModal ──────────────────────────────────────────────────────────────

export default function HubModal({ onClose, currentPipeline, currentWorkflowName, onImport }) {
  // Rough "size" of the current report — number of configured steps. Used for
  // the publish guard (empty report) and the context summary line.
  const stepCount = currentPipeline
    ? (currentPipeline.source ? 1 : 0)
      + (currentPipeline.joins?.length || 0)
      + (currentPipeline.filters?.length || 0)
      + (currentPipeline.groupBy?.length || 0)
      + (currentPipeline.having?.length || 0)
      + (currentPipeline.sort?.length || 0)
      + (currentPipeline.columns?.length || 0)
    : 0;
  const [activeTab, setActiveTab] = useState('browse');

  // Browse state
  const [flows, setFlows]             = useState([]);
  const [allTags, setAllTags]         = useState([]);
  const [search, setSearch]           = useState('');
  const [activeTags, setActiveTags]   = useState([]);
  const [sort, setSort]               = useState('downloads');
  const [page, setPage]               = useState(1);
  const [pagination, setPagination]   = useState({ total: 0, pages: 1 });
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError]     = useState(null);
  const [importingId, setImportingId]     = useState(null);

  // Publish state
  const [pubTitle, setPubTitle]             = useState(currentWorkflowName || '');
  const [pubDescription, setPubDescription] = useState('');
  const [pubTags, setPubTags]               = useState('');
  const [pubAuthor, setPubAuthor]           = useState('');
  const [publishing, setPublishing]         = useState(false);
  const [publishResult, setPublishResult]   = useState(null); // null | 'ok' | { error }

  // Bot-check state
  const [showBotCheck, setShowBotCheck] = useState(false);
  const [botQuestion, setBotQuestion]   = useState(null);
  const [botInput, setBotInput]         = useState('');
  const [botError, setBotError]         = useState(false);
  const botInputRef = useRef(null);

  useEffect(() => {
    if (showBotCheck && botInputRef.current) {
      setTimeout(() => botInputRef.current?.focus(), 50);
    }
  }, [showBotCheck]);

  // ── Fetch flows ──────────────────────────────────────────────────────────

  const fetchFlows = useCallback(async () => {
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const params = new URLSearchParams({ page, limit: '12', sort });
      if (search) params.set('search', search);
      if (activeTags.length > 0) params.set('tags', activeTags.join(';'));
      const res = await fetch(`/api/hub/flows?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFlows(data.flows || []);
      setPagination(data.pagination || { total: 0, pages: 1 });
    } catch {
      setBrowseError('Hub-Server nicht erreichbar. Starte ihn mit: npm run hub');
      setFlows([]);
    } finally {
      setBrowseLoading(false);
    }
  }, [page, search, activeTags, sort]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/hub/tags');
      if (res.ok) setAllTags(await res.json());
    } catch { /* hub offline — silent */ }
  }, []);

  useEffect(() => {
    if (activeTab === 'browse') { fetchFlows(); fetchTags(); }
  }, [activeTab, fetchFlows, fetchTags]);

  useEffect(() => { setPage(1); }, [search, activeTags, sort]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const toggleTag = (tag) =>
    setActiveTags(p => (p.includes(tag) ? p.filter(t => t !== tag) : [...p, tag]));

  const handleImport = async (flow) => {
    setImportingId(flow.id);
    try {
      const res = await fetch(`/api/hub/flows/${flow.id}/download`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const full = await res.json();
      onImport(full.flowData, full.title);
    } catch {
      alert('Fehler beim Importieren des Flows.');
    } finally {
      setImportingId(null);
    }
  };

  // Single publish request — called from handlePublish after the bot check.
  const doPublish = async () => {
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch('/api/hub/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: pubTitle,
          description: pubDescription,
          tags: pubTags,
          flowData: { pipeline: currentPipeline },
          author: pubAuthor || 'Anonymous',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler beim Veröffentlichen.');
      setPublishResult('ok');
      setPubTitle(''); setPubDescription(''); setPubTags(''); setPubAuthor('');
    } catch (err) {
      setPublishResult({ error: err.message });
    } finally {
      setPublishing(false);
    }
  };

  const handlePublish = () => {
    if (!pubTitle.trim()) return;
    if (!currentPipeline?.source) {
      setPublishResult({ error: 'Der aktuelle Bericht ist leer. Wähle zuerst eine Quelle.' });
      return;
    }
    setBotQuestion(randomQuestion());
    setBotInput('');
    setBotError(false);
    setShowBotCheck(true);
  };

  const handleBotConfirm = () => {
    if (botInput.trim() === botQuestion.a) {
      setShowBotCheck(false);
      doPublish();
    } else {
      setBotError(true);
      setBotQuestion(randomQuestion());
      setBotInput('');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Bot-check overlay ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showBotCheck && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[700] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowBotCheck(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#12131e] border border-white/10 rounded-2xl shadow-2xl w-[340px] max-w-[calc(100vw-2rem)] p-6 space-y-5"
            >
              <div className="text-center">
                <p className="text-xs text-white/50 mb-3">Kurze Sicherheitsfrage</p>
                <p className="text-3xl font-bold text-white tracking-tight">
                  {botQuestion?.q} <span className="text-white/30">= ?</span>
                </p>
              </div>

              <input
                ref={botInputRef}
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Antwort"
                value={botInput}
                onChange={e => { setBotInput(e.target.value); setBotError(false); }}
                onKeyDown={e => e.key === 'Enter' && handleBotConfirm()}
                className={cn(
                  'w-full px-4 py-3 bg-[#1a1b26] rounded-lg border text-base text-white text-center placeholder-white/20 focus:outline-none transition-colors',
                  botError ? 'border-red-500/50' : 'border-white/10 focus:border-blue-500/50'
                )}
              />
              {botError && (
                <p className="text-xs text-red-400 text-center -mt-2">
                  Falsch. Neue Aufgabe versuchen.
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowBotCheck(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleBotConfirm}
                  disabled={!botInput.trim()}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40"
                >
                  Bestätigen
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main modal ──────────────────────────────────────────────────── */}
      <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          className="bg-[#0c0d14] w-[720px] max-h-[85vh] rounded-2xl overflow-hidden border border-white/10 flex flex-col shadow-2xl"
        >
          {/* Header — flat, no decoration */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div>
              <h2 className="text-sm font-semibold text-white">Community Hub</h2>
              <p className="text-[11px] text-white/40">
                {pagination.total > 0
                  ? `${pagination.total} Flows geteilt`
                  : 'Flows entdecken & teilen'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {/* Tabs inline with header */}
              {[
                { id: 'browse',  icon: <Search size={13} />,  label: 'Durchsuchen' },
                { id: 'publish', icon: <Upload size={13} />,  label: 'Teilen'      },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    activeTab === tab.id
                      ? 'bg-white/10 text-white'
                      : 'text-white/40 hover:text-white/70'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
              <button
                onClick={onClose}
                className="ml-1 p-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">

            {/* ── Browse ─────────────────────────────────────────────── */}
            {activeTab === 'browse' && (
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {/* Filters — single compact row */}
                <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="text"
                      placeholder="Suchen…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full pl-8 pr-8 py-2 bg-white/5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:bg-white/10 transition-colors"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <select
                      value={sort}
                      onChange={e => setSort(e.target.value)}
                      className="appearance-none pl-3 pr-8 py-2 bg-white/5 rounded-lg text-xs text-white/80 focus:outline-none cursor-pointer"
                    >
                      <option value="downloads">Beliebt</option>
                      <option value="newest">Neu</option>
                    </select>
                    <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                  </div>
                  <button
                    onClick={fetchFlows}
                    title="Aktualisieren"
                    className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>

                {/* Active tag filter — only show when tags selected or available */}
                {(allTags.length > 0 || activeTags.length > 0) && (
                  <div className="px-5 py-2 border-b border-white/5 flex items-center gap-2 overflow-x-auto scrollbar-none">
                    <span className="text-[10px] text-white/30 shrink-0">Tags:</span>
                    {allTags.slice(0, 15).map(tag => (
                      <Tag
                        key={tag}
                        tag={tag}
                        active={activeTags.includes(tag)}
                        onClick={toggleTag}
                      />
                    ))}
                    {activeTags.length > 0 && (
                      <button
                        onClick={() => setActiveTags([])}
                        className="shrink-0 text-[10px] text-red-400/70 hover:text-red-400"
                      >
                        zurücksetzen
                      </button>
                    )}
                  </div>
                )}

                {/* List */}
                <div className="flex-1 overflow-y-auto px-5">
                  {browseLoading && (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 size={20} className="animate-spin text-white/30" />
                    </div>
                  )}
                  {browseError && !browseLoading && (
                    <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
                      <AlertCircle size={20} className="text-amber-400/70" />
                      <p className="text-xs text-white/50 max-w-xs">{browseError}</p>
                    </div>
                  )}
                  {!browseLoading && !browseError && flows.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 gap-2">
                      <Search size={20} className="text-white/20" />
                      <p className="text-xs text-white/30">Keine Flows gefunden</p>
                    </div>
                  )}
                  {!browseLoading && flows.map(flow => (
                    <FlowRow
                      key={flow.id}
                      flow={flow}
                      onImport={handleImport}
                      importing={importingId === flow.id}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {!browseLoading && pagination.pages > 1 && (
                  <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[11px] text-white/30">
                      Seite {page} von {pagination.pages} · {pagination.total} gesamt
                    </span>
                    <div className="flex gap-1">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}
                        className="px-2.5 py-1 text-xs text-white/60 hover:text-white hover:bg-white/5 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ←
                      </button>
                      <button
                        disabled={page >= pagination.pages}
                        onClick={() => setPage(p => p + 1)}
                        className="px-2.5 py-1 text-xs text-white/60 hover:text-white hover:bg-white/5 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Publish ────────────────────────────────────────────── */}
            {activeTab === 'publish' && (
              <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                  {publishResult === 'ok' ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-center justify-center py-20 gap-3 text-center px-5"
                    >
                      <CheckCircle2 size={32} className="text-emerald-400" />
                      <div>
                        <h3 className="font-semibold text-white">Veröffentlicht</h3>
                        <p className="text-xs text-white/40 mt-1">Dein Flow ist jetzt in der Community.</p>
                      </div>
                      <button
                        onClick={() => { setPublishResult(null); setActiveTab('browse'); }}
                        className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white transition-colors"
                      >
                        Zur Liste
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="form"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-5 space-y-4 max-w-lg mx-auto"
                    >
                      {/* Context summary */}
                      <div className="flex items-center justify-between text-xs text-white/50 pb-3 border-b border-white/5">
                        <span>Aktueller Bericht</span>
                        <span className="text-white/80 font-medium">
                          {currentWorkflowName || 'Unbenannt'} · {stepCount} Schritte
                        </span>
                      </div>

                      {publishResult?.error && (
                        <div className="flex items-start gap-2 p-3 bg-red-500/5 rounded-lg border border-red-500/20 text-xs text-red-300">
                          <AlertCircle size={13} className="shrink-0 mt-0.5" />
                          {publishResult.error}
                        </div>
                      )}

                      {/* Title */}
                      <div>
                        <div className="flex items-baseline justify-between mb-1">
                          <label className="text-xs text-white/60">
                            Titel <span className="text-red-400">*</span>
                          </label>
                          <span className="text-[10px] text-white/25">{pubTitle.length}/120</span>
                        </div>
                        <input
                          type="text"
                          placeholder="z.B. Umsatz nach Kunde"
                          maxLength={120}
                          value={pubTitle}
                          onChange={e => setPubTitle(e.target.value)}
                          className="w-full px-3 py-2 bg-white/5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:bg-white/10 transition-colors"
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label className="text-xs text-white/60 block mb-1">Beschreibung</label>
                        <textarea
                          placeholder="Was macht dieser Flow?"
                          rows={3}
                          value={pubDescription}
                          onChange={e => setPubDescription(e.target.value)}
                          className="w-full px-3 py-2 bg-white/5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:bg-white/10 transition-colors resize-none"
                        />
                      </div>

                      {/* Tags */}
                      <div>
                        <label className="text-xs text-white/60 block mb-1">
                          Tags <span className="text-white/30">(Semikolon-getrennt)</span>
                        </label>
                        <input
                          type="text"
                          placeholder="sales; orders; customers"
                          value={pubTags}
                          onChange={e => setPubTags(e.target.value)}
                          className="w-full px-3 py-2 bg-white/5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:bg-white/10 transition-colors"
                        />
                        {pubTags && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {pubTags.split(';').filter(t => t.trim()).map((t, i) => (
                              <Tag key={i} tag={t.trim()} />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Author */}
                      <div>
                        <label className="text-xs text-white/60 block mb-1">
                          Autor <span className="text-white/30">(optional)</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Dein Name"
                          value={pubAuthor}
                          onChange={e => setPubAuthor(e.target.value)}
                          className="w-full px-3 py-2 bg-white/5 rounded-lg text-sm text-white placeholder-white/25 focus:outline-none focus:bg-white/10 transition-colors"
                        />
                      </div>

                      {/* Submit */}
                      <button
                        onClick={handlePublish}
                        disabled={publishing || !pubTitle.trim() || !currentPipeline?.source}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {publishing
                          ? <><Loader2 size={14} className="animate-spin" /> Wird veröffentlicht…</>
                          : <><Upload size={14} /> Veröffentlichen</>}
                      </button>

                      <p className="text-[10px] text-white/30 text-center leading-relaxed">
                        Stelle sicher, dass der Flow keine sensiblen Daten enthält.
                        Zugangsdaten werden niemals mit veröffentlicht.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </>
  );
}
