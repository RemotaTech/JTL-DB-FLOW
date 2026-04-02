import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Search, Download, Upload, Tag, X, Plus, ChevronDown,
  Loader2, CheckCircle2, AlertCircle, Users, ArrowUpRight, RotateCcw
} from 'lucide-react';
import { cn } from '../lib/utils';

// ─── Bot-check question pool ────────────────────────────────────────────────

const BOT_QUESTIONS = [
  { q: 'Was ist 4 + 9?',   a: '13' },
  { q: 'Was ist 15 − 7?',  a: '8'  },
  { q: 'Was ist 6 × 3?',   a: '18' },
  { q: 'Was ist 24 ÷ 4?',  a: '6'  },
  { q: 'Was ist 11 + 8?',  a: '19' },
  { q: 'Was ist 5 × 5?',   a: '25' },
];

function randomQuestion() {
  return BOT_QUESTIONS[Math.floor(Math.random() * BOT_QUESTIONS.length)];
}

// ─── Tag pill ──────────────────────────────────────────────────────────────

function TagPill({ tag, onClick, active }) {
  return (
    <button
      onClick={() => onClick?.(tag)}
      className={cn(
        'px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border',
        active
          ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
          : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10 hover:text-white/70'
      )}
    >
      {tag}
    </button>
  );
}

// ─── Flow card ─────────────────────────────────────────────────────────────

function FlowCard({ flow, onImport, importing }) {
  const tags = flow.tags ? flow.tags.split(';').filter(Boolean) : [];

  return (
    <div className="p-4 bg-white/[0.03] rounded-2xl border border-white/10 hover:border-white/20 transition-all group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm text-white/90 truncate">{flow.title}</h3>
          {flow.description && (
            <p className="text-[11px] text-white/40 mt-0.5 line-clamp-2">{flow.description}</p>
          )}
        </div>
        <button
          onClick={() => onImport(flow)}
          disabled={importing}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white rounded-xl text-[11px] font-bold transition-all border border-blue-500/20 hover:border-transparent disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
        >
          {importing
            ? <Loader2 size={12} className="animate-spin" />
            : <Download size={12} />}
          Import
        </button>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {tags.map(t => <TagPill key={t} tag={t} />)}
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 text-[10px] text-white/30">
        <span className="flex items-center gap-1">
          <Users size={10} />
          {flow.author}
        </span>
        <span className="flex items-center gap-1">
          <Download size={10} />
          {flow.downloads} downloads
        </span>
        {flow.nodeCount > 0 && (
          <span>{flow.nodeCount} nodes</span>
        )}
        <span className="ml-auto">{new Date(flow.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

// ─── HubModal ──────────────────────────────────────────────────────────────

export default function HubModal({ onClose, currentNodes, currentEdges, currentWorkflowName, onImport }) {
  const [activeTab, setActiveTab] = useState('browse');

  // Browse state
  const [flows, setFlows] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState([]);
  const [sort, setSort] = useState('downloads');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState(null);
  const [importingId, setImportingId] = useState(null);

  // Publish state
  const [pubTitle, setPubTitle] = useState(currentWorkflowName || '');
  const [pubDescription, setPubDescription] = useState('');
  const [pubTags, setPubTags] = useState('');
  const [pubAuthor, setPubAuthor] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null); // null | 'ok' | { error }

  // Bot-check state
  const [botVerified, setBotVerified] = useState(false);
  const [showBotCheck, setShowBotCheck] = useState(false);
  const [botQuestion, setBotQuestion] = useState(null);
  const [botInput, setBotInput] = useState('');
  const [botError, setBotError] = useState(false);
  const botInputRef = useRef(null);

  // Focus bot input when modal opens
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
    } catch (err) {
      setBrowseError('Community Hub nicht erreichbar. Starte den Hub-Server: npm run hub');
      setFlows([]);
    } finally {
      setBrowseLoading(false);
    }
  }, [page, search, activeTags, sort]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/hub/tags');
      if (res.ok) setAllTags(await res.json());
    } catch { /* hub offline — silently ignore */ }
  }, []);

  useEffect(() => {
    if (activeTab === 'browse') {
      fetchFlows();
      fetchTags();
    }
  }, [activeTab, fetchFlows, fetchTags]);

  // Reset page when filter changes
  useEffect(() => { setPage(1); }, [search, activeTags, sort]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const toggleTag = (tag) => {
    setActiveTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

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

  const handlePublish = async () => {
    if (!pubTitle.trim()) return;
    if (!currentNodes.length) {
      setPublishResult({ error: 'Der aktuelle Flow ist leer. Füge zuerst Nodes hinzu.' });
      return;
    }

    // Bot check gate
    if (!botVerified) {
      setBotQuestion(randomQuestion());
      setBotInput('');
      setBotError(false);
      setShowBotCheck(true);
      return;
    }

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
          flowData: { nodes: currentNodes, edges: currentEdges },
          author: pubAuthor || 'Anonymous',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler beim Veröffentlichen.');
      setPublishResult('ok');
      setPubTitle('');
      setPubDescription('');
      setPubTags('');
      setPubAuthor('');
      setBotVerified(false); // reset for next publish
    } catch (err) {
      setPublishResult({ error: err.message });
    } finally {
      setPublishing(false);
    }
  };

  const handleBotConfirm = () => {
    if (botInput.trim() === botQuestion.a) {
      setBotVerified(true);
      setShowBotCheck(false);
      // Re-call handlePublish — now botVerified will be true via the flag we just set,
      // but since React state is async we trigger the publish directly
      triggerPublishAfterVerification();
    } else {
      setBotError(true);
      setBotQuestion(randomQuestion());
      setBotInput('');
    }
  };

  // Separate publish execution that skips the bot gate (called after verified)
  const triggerPublishAfterVerification = async () => {
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
          flowData: { nodes: currentNodes, edges: currentEdges },
          author: pubAuthor || 'Anonymous',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler beim Veröffentlichen.');
      setPublishResult('ok');
      setPubTitle('');
      setPubDescription('');
      setPubTags('');
      setPubAuthor('');
      setBotVerified(false);
    } catch (err) {
      setPublishResult({ error: err.message });
    } finally {
      setPublishing(false);
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
              initial={{ scale: 0.88, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.88, opacity: 0, y: 16 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#12131e] border border-white/10 rounded-3xl shadow-2xl w-[380px] max-w-[calc(100vw-2rem)] p-7 flex flex-col gap-5"
            >
              {/* Icon + title */}
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-3xl select-none">
                  🤖
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Bist du ein Mensch?</h3>
                  <p className="text-[11px] text-white/40 mt-1">
                    Löse diese kurze Aufgabe, um zu veröffentlichen.
                  </p>
                </div>
              </div>

              {/* Question */}
              <div className="text-center">
                <p className="text-2xl font-black text-white tracking-tight">
                  {botQuestion?.q}
                </p>
              </div>

              {/* Input */}
              <div className="space-y-2">
                <input
                  ref={botInputRef}
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Deine Antwort…"
                  value={botInput}
                  onChange={e => { setBotInput(e.target.value); setBotError(false); }}
                  onKeyDown={e => e.key === 'Enter' && handleBotConfirm()}
                  className="w-full px-4 py-3 bg-[#1a1b26] rounded-xl border border-white/10 text-sm text-white text-center placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-colors"
                />
                {botError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[11px] text-red-400 text-center flex items-center justify-center gap-1"
                  >
                    <AlertCircle size={11} />
                    Falsche Antwort. Bitte versuche es erneut.
                  </motion.p>
                )}
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBotCheck(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white/50 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleBotConfirm}
                  disabled={!botInput.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  Bestätigen
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main modal ────────────────────────────────────────────────────── */}
      <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 280 }}
          className="glass w-[780px] max-h-[88vh] rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col"
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-0 border-b border-white/10 bg-white/[0.02] shrink-0">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                  <Globe size={18} className="text-blue-400" />
                </div>
                <div>
                  <h2 className="font-bold text-base text-white">Community Hub</h2>
                  <p className="text-[11px] text-white/40">Flows entdecken und teilen</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1">
              {[
                { id: 'browse', icon: <Search size={13} />, label: 'Durchsuchen' },
                { id: 'publish', icon: <Upload size={13} />, label: 'Veröffentlichen' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all border-b-2',
                    activeTab === tab.id
                      ? 'text-white border-blue-500 bg-white/5'
                      : 'text-white/40 border-transparent hover:text-white/70'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">

            {/* ── Browse Tab ─────────────────────────────────────────────── */}
            {activeTab === 'browse' && (
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {/* Filters */}
                <div className="px-6 py-4 bg-black/20 border-b border-white/5 shrink-0 space-y-3">
                  {/* Search + sort */}
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                      <input
                        type="text"
                        placeholder="Flows suchen…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-[#1a1b26] rounded-xl border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:border-blue-500/50 transition-colors"
                      />
                      {search && (
                        <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <select
                        value={sort}
                        onChange={e => setSort(e.target.value)}
                        className="appearance-none px-4 py-2.5 pr-8 bg-[#1a1b26] rounded-xl border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors cursor-pointer"
                      >
                        <option value="downloads">Beliebteste</option>
                        <option value="newest">Neueste</option>
                      </select>
                      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                    </div>
                    <button onClick={fetchFlows} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-white/40 hover:text-white transition-colors">
                      <RotateCcw size={14} />
                    </button>
                  </div>

                  {/* Tags */}
                  {allTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {allTags.slice(0, 20).map(tag => (
                        <TagPill key={tag} tag={tag} active={activeTags.includes(tag)} onClick={toggleTag} />
                      ))}
                      {activeTags.length > 0 && (
                        <button
                          onClick={() => setActiveTags([])}
                          className="px-2.5 py-1 rounded-full text-[10px] font-bold text-red-400/70 hover:text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-all"
                        >
                          ✕ Reset
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Flow list */}
                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                  {browseLoading && (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 size={24} className="animate-spin text-white/30" />
                    </div>
                  )}
                  {browseError && !browseLoading && (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                        <AlertCircle size={22} className="text-amber-400" />
                      </div>
                      <p className="text-sm text-white/50 max-w-xs leading-relaxed">{browseError}</p>
                    </div>
                  )}
                  {!browseLoading && !browseError && flows.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Globe size={28} className="text-white/20" />
                      <p className="text-sm text-white/30">Keine Flows gefunden.</p>
                    </div>
                  )}
                  {!browseLoading && flows.map(flow => (
                    <FlowCard
                      key={flow.id}
                      flow={flow}
                      onImport={handleImport}
                      importing={importingId === flow.id}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {!browseLoading && pagination.pages > 1 && (
                  <div className="px-6 py-4 border-t border-white/5 bg-black/20 shrink-0 flex items-center justify-between">
                    <span className="text-[11px] text-white/30">
                      {pagination.total} Flows gesamt
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-xs text-white/60 hover:text-white transition-all border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ← Zurück
                      </button>
                      <span className="px-3 py-1.5 text-xs text-white/40">
                        {page} / {pagination.pages}
                      </span>
                      <button
                        disabled={page >= pagination.pages}
                        onClick={() => setPage(p => p + 1)}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-xs text-white/60 hover:text-white transition-all border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Weiter →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Publish Tab ─────────────────────────────────────────────── */}
            {activeTab === 'publish' && (
              <div className="flex-1 overflow-y-auto p-6">
                <AnimatePresence mode="wait">
                  {publishResult === 'ok' ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-center justify-center py-20 gap-4 text-center"
                    >
                      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                        <CheckCircle2 size={28} className="text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-lg">Veröffentlicht!</h3>
                        <p className="text-sm text-white/40 mt-1">Dein Flow ist jetzt in der Community verfügbar.</p>
                      </div>
                      <button
                        onClick={() => { setPublishResult(null); setActiveTab('browse'); }}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold text-white transition-all"
                      >
                        <ArrowUpRight size={15} />
                        Im Hub ansehen
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="form"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-5 max-w-lg mx-auto"
                    >
                      <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/15">
                        <p className="text-[11px] text-blue-300/70 leading-relaxed">
                          Du veröffentlichst den aktuell geladenen Flow ({currentNodes.length} Nodes).
                          Stelle sicher, dass er keine sensiblen Informationen enthält.
                        </p>
                      </div>

                      {/* Error */}
                      {publishResult?.error && (
                        <div className="flex items-center gap-2 p-3 bg-red-500/10 rounded-xl border border-red-500/20 text-xs text-red-400">
                          <AlertCircle size={14} />
                          {publishResult.error}
                        </div>
                      )}

                      {/* Title */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                          Titel <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="z.B. Umsatz nach Kunde"
                          maxLength={120}
                          value={pubTitle}
                          onChange={e => setPubTitle(e.target.value)}
                          className="w-full px-4 py-3 bg-[#1a1b26] rounded-xl border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                        <p className="text-[10px] text-white/20 text-right">{pubTitle.length}/120</p>
                      </div>

                      {/* Description */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Beschreibung</label>
                        <textarea
                          placeholder="Was macht dieser Flow? Welches Problem löst er?"
                          rows={3}
                          value={pubDescription}
                          onChange={e => setPubDescription(e.target.value)}
                          className="w-full px-4 py-3 bg-[#1a1b26] rounded-xl border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
                        />
                      </div>

                      {/* Tags */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                          Tags <span className="text-white/20 font-normal">(Semikolon-getrennt)</span>
                        </label>
                        <div className="relative">
                          <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                          <input
                            type="text"
                            placeholder="sales;orders;customers"
                            value={pubTags}
                            onChange={e => setPubTags(e.target.value)}
                            className="w-full pl-9 pr-4 py-3 bg-[#1a1b26] rounded-xl border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-colors"
                          />
                        </div>
                        {pubTags && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {pubTags.split(';').filter(t => t.trim()).map((t, i) => (
                              <TagPill key={i} tag={t.trim()} />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Author */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Autor</label>
                        <input
                          type="text"
                          placeholder="Dein Name (optional)"
                          value={pubAuthor}
                          onChange={e => setPubAuthor(e.target.value)}
                          className="w-full px-4 py-3 bg-[#1a1b26] rounded-xl border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                      </div>

                      {/* Submit */}
                      <button
                        onClick={handlePublish}
                        disabled={publishing || !pubTitle.trim() || !currentNodes.length}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-blue-600/20 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                      >
                        {publishing
                          ? <><Loader2 size={15} className="animate-spin" /> Wird veröffentlicht…</>
                          : <><Upload size={15} /> Flow veröffentlichen</>}
                      </button>
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
