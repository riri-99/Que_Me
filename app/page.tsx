'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Database, 
  Search, 
  Copy, 
  Check, 
  Download, 
  Calendar, 
  ShieldAlert, 
  Layers, 
  Terminal, 
  TrendingUp, 
  CreditCard, 
  AlertTriangle, 
  ShieldCheck, 
  Scale, 
  Sparkles,
  Info,
  X,
  Zap,
  Loader2,
  ChevronDown,
  ExternalLink
} from 'lucide-react';
import { QUERY_TEMPLATES, QueryTemplate, generateCustomQuery } from '@/lib/templates';

export default function DashboardPage() {
  // -------------------------------------------------------------
  // Filter States
  // -------------------------------------------------------------
  const [loginId, setLoginId] = useState<string>('100234');
  const [dateMode, setDateMode] = useState<'single' | 'range'>('range');
  
  // Static initial defaults to avoid SSR prerender time skew
  const [startDate, setStartDate] = useState<string>('2026-10-23');
  const [endDate, setEndDate] = useState<string>('2026-10-30');
  const [activeCaseId, setActiveCaseId] = useState<string>('remove-demo-live-accounts');
  const [searchReason, setSearchReason] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('Check if leverage was modified right before stop-out');
  const [parameterized, setParameterized] = useState<boolean>(false);

  // AI & Custom Query States
  const [customQueryResult, setCustomQueryResult] = useState<{
    sql: string;
    tables: string[];
    indexes: string[];
    sensitivity: string;
    diagnosticNotes: string[];
    isAiGenerated?: boolean;
    aiEngine?: string;
    notice?: string;
  } | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);

  // UI States
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------
  // Sync state from / to URL query params (Phase 4 requirement)
  // -------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const last7DaysStr = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const params = new URLSearchParams(window.location.search);
    
    if (params.get('login')) setLoginId(params.get('login') || '');
    if (params.get('case')) setActiveCaseId(params.get('case') || 'remove-demo-live-accounts');
    if (params.get('dateMode') === 'single' || params.get('dateMode') === 'range') {
      setDateMode(params.get('dateMode') as 'single' | 'range');
    }
    setStartDate(params.get('from') || last7DaysStr);
    setEndDate(params.get('to') || todayStr);
    if (params.get('mode') === 'param') setParameterized(true);
    if (params.get('mode') === 'injected') setParameterized(false);
    if (params.get('prompt')) setCustomPrompt(params.get('prompt') || '');
  }, []);

  // Update URL whenever relevant parameters change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (loginId) params.set('login', loginId);
    if (activeCaseId) params.set('case', activeCaseId);
    params.set('dateMode', dateMode);
    if (startDate) params.set('from', startDate);
    if (dateMode === 'range' && endDate) params.set('to', endDate);
    params.set('mode', parameterized ? 'param' : 'injected');
    if (activeCaseId === 'custom' && customPrompt) params.set('prompt', customPrompt);

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [loginId, activeCaseId, dateMode, startDate, endDate, parameterized, customPrompt]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // -------------------------------------------------------------
  // Active Template / Custom Query Resolution
  // -------------------------------------------------------------
  const activeTemplate = useMemo(() => {
    if (activeCaseId === 'custom') return null;
    return QUERY_TEMPLATES.find((t) => t.id === activeCaseId) || QUERY_TEMPLATES[0];
  }, [activeCaseId]);

  const { generatedSql, currentMetadata } = useMemo(() => {
    if (activeCaseId === 'custom') {
      if (customQueryResult) {
        return {
          generatedSql: customQueryResult.sql,
          currentMetadata: {
            title: customQueryResult.isAiGenerated ? 'AI-Synthesized Diagnostic Query' : 'Custom Diagnostic Query',
            description: `Generated for scenario: "${customPrompt}"`,
            category: 'Custom',
            tables: customQueryResult.tables,
            indexes: customQueryResult.indexes,
            sensitivity: customQueryResult.sensitivity,
            diagnosticNotes: customQueryResult.diagnosticNotes
          }
        };
      }

      const customRes = generateCustomQuery({
        prompt: customPrompt,
        loginId,
        dateMode,
        startDate,
        endDate,
        parameterized
      });
      return {
        generatedSql: customRes.sql,
        currentMetadata: {
          title: 'Custom Diagnostic Query',
          description: `Generated for scenario: "${customPrompt}"`,
          category: 'Custom',
          tables: customRes.metadata.tables,
          indexes: customRes.metadata.indexes,
          sensitivity: customRes.metadata.sensitivity,
          diagnosticNotes: customRes.metadata.diagnosticNotes && customRes.metadata.diagnosticNotes.length > 0
            ? customRes.metadata.diagnosticNotes
            : [
                'Ad-hoc generated query tailored to your freeform investigation brief.',
                'Always inspect EXPLAIN ANALYZE on production databases prior to running large joins.'
              ]
        }
      };
    }

    if (!activeTemplate) {
      return { generatedSql: '', currentMetadata: null };
    }

    const sql = activeTemplate.generateSql({
      loginId,
      dateMode,
      startDate,
      endDate,
      parameterized
    });

    return {
      generatedSql: sql,
      currentMetadata: {
        title: activeTemplate.title,
        description: activeTemplate.description,
        category: activeTemplate.category,
        tables: activeTemplate.tables,
        indexes: activeTemplate.indexes,
        sensitivity: activeTemplate.sensitivity,
        diagnosticNotes: activeTemplate.diagnosticNotes
      }
    };
  }, [activeTemplate, activeCaseId, customPrompt, loginId, dateMode, startDate, endDate, parameterized, customQueryResult]);

  // Filtered list of templates in dropdown
  const filteredTemplates = useMemo(() => {
    if (!searchReason) return QUERY_TEMPLATES;
    const q = searchReason.toLowerCase();
    return QUERY_TEMPLATES.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.tables.some((tbl) => tbl.toLowerCase().includes(q))
    );
  }, [searchReason]);

  // -------------------------------------------------------------
  // Clipboard & Download Actions
  // -------------------------------------------------------------
  const handleCopySql = async () => {
    if (!generatedSql) return;
    await navigator.clipboard.writeText(generatedSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleDownloadSql = () => {
    if (!generatedSql) return;
    const filename = `Que_Me_${activeCaseId}_login_${loginId || '100234'}_${startDate}.sql`;
    const blob = new Blob([generatedSql], { type: 'text/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // -------------------------------------------------------------
  // AI / Custom Query Generation Dispatcher
  // -------------------------------------------------------------
  const handleGenerateCustomQuery = async (overridePrompt?: string) => {
    const targetPrompt = overridePrompt !== undefined ? overridePrompt : customPrompt;
    if (!targetPrompt.trim()) return;

    setIsGeneratingAi(true);
    try {
      const res = await fetch('/api/generate-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: targetPrompt,
          loginId,
          dateMode,
          startDate,
          endDate,
          parameterized
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.details || errData?.error || `API responded with status: ${res.status}`);
      }
      const data = await res.json();
      setCustomQueryResult({
        sql: data.sql,
        tables: data.tables || ['TradingAccount'],
        indexes: data.indexes || ['TradingAccount_login_key'],
        sensitivity: data.sensitivity || 'Medium',
        diagnosticNotes: data.diagnosticNotes || [],
        isAiGenerated: data.isAiGenerated ?? true,
        aiEngine: data.aiEngine,
        notice: data.notice
      });
    } catch (err) {
      console.error('AI generation fallback triggered:', err);
      const fallback = generateCustomQuery({
        prompt: targetPrompt,
        loginId,
        dateMode,
        startDate,
        endDate,
        parameterized
      });
      setCustomQueryResult({
        sql: fallback.sql,
        tables: fallback.metadata.tables,
        indexes: fallback.metadata.indexes,
        sensitivity: fallback.metadata.sensitivity,
        diagnosticNotes: fallback.metadata.diagnosticNotes || [],
        isAiGenerated: false,
        notice: 'Offline schema engine used.'
      });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Category Icon Resolver
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Trading':
        return <TrendingUp className="w-4 h-4 text-emerald-400" />;
      case 'Funds':
        return <CreditCard className="w-4 h-4 text-blue-400" />;
      case 'Risk':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'Security':
        return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      case 'Compliance':
        return <Scale className="w-4 h-4 text-purple-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-cyan-400" />;
    }
  };


  return (
    <div className="flex flex-col min-h-screen">
      {/* -------------------------------------------------------------
          TOP BAR: INTEGRATED STUDIO CONTROLS (EXPANDED VERTICAL HEIGHT)
      ------------------------------------------------------------- */}
      <header 
        style={{ minHeight: '100px', paddingTop: '2px', paddingBottom: '2px' }}
        className="border-b border-slate-800 bg-slate-900/95 backdrop-blur sticky top-0 z-40 w-full px-6 sm:px-10 flex flex-col justify-center shadow-lg"
      >
        <div className="w-full flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          
          {/* Brand Logo & Studio Identity */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-bold text-base">
              Q
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-bold text-xl tracking-wide bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                  Que_Me
                </span>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                  Studio
                </span>
              </div>
            </div>
          </div>

          {/* Centered Controls Bar: Login ID, Date Spec, Use Case */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 flex-1">
            
            {/* 1. Login ID Input */}
            <div className="flex items-center gap-2.5 bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-2 focus-within:border-indigo-500 transition-colors shadow-sm">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Login:</label>
              <input
                type="number"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="100234"
                className="w-28 bg-transparent text-sm text-white placeholder-slate-600 focus:outline-none font-mono"
              />
              {loginId && (
                <button
                  type="button"
                  onClick={() => setLoginId('')}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                  title="Clear login"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 2. Date Spec with Single / Range Toggle */}
            <div className="flex items-center gap-2.5 bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-1.5 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:inline-block">Date:</span>
              <div className="inline-flex rounded-lg p-0.5 bg-slate-900 text-xs">
                <button
                  type="button"
                  onClick={() => setDateMode('single')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    dateMode === 'single'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Single Date"
                >
                  Single
                </button>
                <button
                  type="button"
                  onClick={() => setDateMode('range')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    dateMode === 'range'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Date Range"
                >
                  Range
                </button>
              </div>

              <div className="flex items-center gap-2 px-1">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-xs sm:text-sm text-white focus:outline-none font-mono [color-scheme:dark]"
                />
                {dateMode === 'range' && (
                  <>
                    <span className="text-slate-400 text-xs font-mono uppercase">to</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="bg-transparent text-xs sm:text-sm text-white focus:outline-none font-mono [color-scheme:dark]"
                    />
                  </>
                )}
              </div>
            </div>

            {/* 3. Reason / Use Case Dropdown */}
            <div className="relative min-w-[340px] md:min-w-[440px] lg:min-w-[500px] max-w-[620px] flex-1" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full bg-slate-950 border border-slate-700/80 hover:border-slate-600 rounded-xl px-4 py-2.5 text-sm text-left flex items-center justify-between text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors shadow-sm group"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">Use Case:</span>
                  {activeCaseId === 'custom' ? (
                    <div className="flex items-center gap-1.5 truncate">
                      <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="font-medium text-cyan-300 truncate">Custom</span>
                    </div>
                  ) : activeTemplate ? (
                    <div className="flex items-center gap-1.5 truncate">
                      {getCategoryIcon(activeTemplate.category)}
                      <span className="truncate font-medium text-slate-100">{activeTemplate.title}</span>
                    </div>
                  ) : (
                    <span className="text-slate-400">Select investigation reason...</span>
                  )}
                </div>
                <Search className="w-4 h-4 text-slate-400 group-hover:text-slate-200 shrink-0 ml-2" />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute right-0 left-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="p-2.5 border-b border-slate-800 bg-slate-950/80">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        value={searchReason}
                        onChange={(e) => setSearchReason(e.target.value)}
                        placeholder="Search use cases, tables or symptoms..."
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-9 pr-3.5 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
                    {/* Custom Option */}
                    <div
                      onClick={() => {
                        setActiveCaseId('custom');
                        setIsDropdownOpen(false);
                      }}
                      className={`px-4 py-3 hover:bg-slate-800/90 cursor-pointer transition-colors flex items-center gap-3 ${
                        activeCaseId === 'custom' ? 'bg-indigo-950/50' : ''
                      }`}
                    >
                      <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="text-sm font-semibold text-cyan-300">
                        Custom
                      </span>
                    </div>

                    {/* Preset Templates */}
                    {filteredTemplates.map((tmpl) => (
                      <div
                        key={tmpl.id}
                        onClick={() => {
                          setActiveCaseId(tmpl.id);
                          setIsDropdownOpen(false);
                        }}
                        className={`px-4 py-3 hover:bg-slate-800/90 cursor-pointer transition-colors flex items-center gap-3 ${
                          activeCaseId === tmpl.id ? 'bg-indigo-950/50' : ''
                        }`}
                      >
                        <div className="shrink-0">{getCategoryIcon(tmpl.category)}</div>
                        <span className="text-sm font-medium text-slate-200">
                          {tmpl.title}
                        </span>
                      </div>
                    ))}

                    {filteredTemplates.length === 0 && (
                      <div className="p-4 text-center text-xs text-slate-500">
                        No preset templates match "{searchReason}". Try selecting Custom above!
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* -------------------------------------------------------------
          RESULTS VIEWPORT: TWO MATCHING EXPANSIVE PANELS (SKETCH SPEC)
      ------------------------------------------------------------- */}
      <main className="flex-1 w-full max-w-[1850px] mx-auto px-4 sm:px-6 py-4 flex flex-col">
        {/* Custom Case Prompt Bar (Shifts panels down when active) */}
        {activeCaseId === 'custom' && (
          <div 
            style={{ padding: '26px 30px', marginBottom: '36px' }}
            className="w-full bg-slate-950 rounded-2xl border border-cyan-800/60 shadow-xl flex flex-col"
          >
            {/* Headline Row with status indicator */}
            <div style={{ marginBottom: '18px' }} className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                <label className="text-sm font-semibold text-cyan-300 tracking-wide">
                  Custom Prompt Here:
                </label>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-cyan-400/90 bg-cyan-950/80 px-2.5 py-0.5 rounded-full border border-cyan-800/60 font-mono">
                <Zap className="w-3 h-3 text-cyan-400" />
                <span>
                  {isGeneratingAi
                    ? 'Synthesizing with Groq Llama 3.3...'
                    : customQueryResult?.isAiGenerated
                    ? (customQueryResult.aiEngine || 'Groq Llama 3.3 AI Synthesized')
                    : 'Groq LPU Engine Ready'}
                </span>
              </div>
            </div>

            {/* Input & Action Button Row */}
            <div className="flex items-center gap-3.5 sm:gap-4">
              {/* Integrated Input Box with Cross Icon inside at the very end */}
              <div 
                style={{ padding: '4px 16px', minHeight: '50px' }}
                className="flex-1 flex items-center bg-slate-900 border border-slate-700/80 rounded-xl focus-within:ring-2 focus-within:ring-cyan-500 focus-within:border-cyan-500/80 shadow-inner transition-all"
              >
                <input
                  type="text"
                  value={customPrompt}
                  onChange={(e) => {
                    setCustomPrompt(e.target.value);
                    setCustomQueryResult(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleGenerateCustomQuery();
                    }
                  }}
                  style={{ padding: '10px 4px' }}
                  placeholder="e.g. Find accounts with leverage changes 5m before stop-out, or find accounts sharing IP"
                  className="flex-1 bg-transparent text-sm sm:text-base text-white placeholder-slate-500 focus:outline-none font-sans min-w-0"
                />
                {customPrompt && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPrompt('');
                      setCustomQueryResult(null);
                    }}
                    style={{ padding: '6px', marginLeft: '8px' }}
                    className="text-slate-400 hover:text-white transition-colors shrink-0 flex items-center justify-center rounded-lg hover:bg-slate-800"
                    title="Clear prompt"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleGenerateCustomQuery()}
                disabled={isGeneratingAi || !customPrompt.trim()}
                style={{ padding: '14px 24px', minHeight: '50px' }}
                className="rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold text-sm flex items-center gap-2 shadow-md shadow-cyan-950/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {isGeneratingAi ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Synthesizing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-cyan-200" />
                    <span>Generate Query</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Suggestion Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-3">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mr-1">
                Try Scenario:
              </span>
              {[
                'Remove demo from all live accounts',
                'Leverage modified right before stop-out',
                'Cross-account IP & device sharing',
                'Execution latency > 1s and slippage spikes',
                'Deposit, withdrawal & UTR tracking'
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    setCustomPrompt(chip);
                    setCustomQueryResult(null);
                    handleGenerateCustomQuery(chip);
                  }}
                  className="text-xs px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-700/60 transition-all flex items-center gap-1.5"
                >
                  <span>{chip}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-stretch">
          
          {/* =========================================================
              LEFT PANEL: USE CASE DESCRIPTION (SPACIOUS SQUARE)
          ========================================================= */}
          <div className="lg:col-span-5 flex flex-col justify-center items-center py-6">
            <div 
              style={{ minHeight: '120px', width: '60%', maxWidth: '540px', aspectRatio: '1 / 1' }}
              className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            >
              
              {/* Header: "use case description v" */}
              <div 
                style={{ padding: '18px 28px' }}
                className="border-b border-slate-800 bg-slate-950/80 px-7 py-4.5 flex items-center justify-between shrink-0"
              >
                <div className="flex items-center gap-3">
                  {getCategoryIcon(currentMetadata?.category || '')}
                  <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300 font-subheading">
                    Use Case
                  </span>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-500" />
              </div>

              {/* Main Content Area: Centered, Generously Spaced */}
              <div 
                style={{ padding: '36px 32px' }}
                className="flex-1 flex flex-col justify-between"
              >
                
                {/* 1. Case Title & Description */}
                <div style={{ marginBottom: '24px' }}>
                  <h2 
                    style={{ marginBottom: '14px' }}
                    className="text-2xl sm:text-3xl font-bold text-white tracking-normal leading-snug font-heading"
                  >
                    {currentMetadata?.title}
                  </h2>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-body">
                    {currentMetadata?.description}
                  </p>
                </div>

                {/* Divider with clear vertical margins */}
                <div 
                  style={{ marginTop: '16px', marginBottom: '24px' }}
                  className="w-full h-px bg-slate-800"
                />

                {/* 2. Target Tables Joined */}
                <div>
                  <div 
                    style={{ marginBottom: '14px' }}
                    className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-slate-300 font-subheading"
                  >
                    <Database className="w-4 h-4 text-indigo-400" />
                    <span>Target Tables</span>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {currentMetadata?.tables.map((table) => (
                      <span
                        key={table}
                        style={{ padding: '8px 16px' }}
                        className="text-xs sm:text-sm font-mono rounded-xl bg-slate-950 text-indigo-300 border border-indigo-900/40 flex items-center gap-2 shadow-sm"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                        {table}
                      </span>
                    ))}
                  </div>
                </div>

              </div>

            </div>
          </div>

          {/* =========================================================
              RIGHT PANEL: > SQL QUERY (SKETCH SPEC)
          ========================================================= */}
          <div className={`lg:col-span-7 flex flex-col ${activeCaseId === 'custom' ? 'pt-2 sm:pt-3' : ''}`}>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex-1 flex flex-col">
              
              {/* Header: "SQL query" with Actions */}
              <div className="border-b border-slate-800 bg-slate-950/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 font-mono tracking-tight">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <span>SQL query</span>
                  </div>

                  {/* Parameter Injection Toggle */}
                  <div className="inline-flex rounded-lg p-0.5 bg-slate-900 border border-slate-800 text-xs">
                    <button
                      onClick={() => setParameterized(false)}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                        !parameterized
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Substitute live values directly into SQL (ready to paste in DBeaver/psql)"
                    >
                      Injected Literal ({loginId || '100234'})
                    </button>
                    <button
                      onClick={() => setParameterized(true)}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                        parameterized
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Keep prepared statement parameters (:loginId, :startDate)"
                    >
                      Parameterized (:loginId)
                    </button>
                  </div>
                </div>

                {/* Action Buttons: Copy, Download */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopySql}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-sm active:scale-95"
                  >
                    {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSql ? 'Copied!' : 'Copy'}</span>
                  </button>

                  <button
                    onClick={handleDownloadSql}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                    title="Download as .sql file"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    
                  </button>
                </div>
              </div>

              {/* Code Display Area (Fills remaining height) */}
              <div className="flex-1 relative bg-slate-950 p-4 font-mono text-[13px] leading-relaxed overflow-auto min-h-[500px] text-slate-100 selection:bg-indigo-600 selection:text-white">
                <pre className="whitespace-pre">
                  {generatedSql.split('\n').map((line, idx) => (
                    <div key={idx} className="table-row">
                      <span className="table-cell select-none text-slate-600 pr-4 text-right text-xs">
                        {idx + 1}
                      </span>
                      <span className="table-cell">
                        {formatSqlLine(line)}
                      </span>
                    </div>
                  ))}
                </pre>
              </div>

              {/* Footer Status Bar */}
              <div className="border-t border-slate-800/80 bg-slate-950 px-4 py-2.5 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <div className="flex items-center gap-3">
                  <span>Dialect: PostgreSQL 15+</span>
                  <span>•</span>
                  <span>Mode: {parameterized ? 'PREPARED_STMT' : 'LITERAL_INJECTION'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-slate-400">Query Validated</span>
                </div>
              </div>

            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

// -------------------------------------------------------------
// Lightweight syntax colorizer for SQL lines
// -------------------------------------------------------------
function formatSqlLine(line: string): React.ReactNode {
  if (line.trim().startsWith('--')) {
    return <span className="text-slate-500 italic">{line}</span>;
  }

  // Tokens regex for SQL highlighting
  const regex = /(\b(?:SELECT|FROM|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|WHERE|AND|OR|ORDER BY|GROUP BY|DESC|ASC|LIMIT|ROUND|EXTRACT|EPOCH|IN|COUNT|AS|NOT|NULL|IS)\b)|(:[a-zA-Z_]+)|('[^']*')|(\b\d+(\.\d+)?\b)/gi;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.substring(lastIndex, match.index));
    }

    const [full, keyword, param, stringLit, numberLit] = match;

    if (keyword) {
      parts.push(
        <span key={match.index} className="text-indigo-400 font-semibold">
          {full}
        </span>
      );
    } else if (param) {
      parts.push(
        <span key={match.index} className="text-cyan-300 font-bold bg-cyan-950/60 px-1 rounded">
          {full}
        </span>
      );
    } else if (stringLit) {
      parts.push(
        <span key={match.index} className="text-emerald-400">
          {full}
        </span>
      );
    } else if (numberLit) {
      parts.push(
        <span key={match.index} className="text-amber-300">
          {full}
        </span>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push(line.substring(lastIndex));
  }

  return parts.length > 0 ? parts : line;
}
