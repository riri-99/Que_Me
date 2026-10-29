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
  Clock,
  X,
  Zap,
  ExternalLink
} from 'lucide-react';
import { QUERY_TEMPLATES, QueryTemplate, generateCustomQuery } from '@/lib/templates';

export default function DashboardPage() {
  // -------------------------------------------------------------
  // Filter States
  // -------------------------------------------------------------
  const [loginId, setLoginId] = useState<string>('100234');
  const [vendorId, setVendorId] = useState<string>('');
  const [dateMode, setDateMode] = useState<'single' | 'range'>('range');
  
  // Static initial defaults to avoid SSR prerender time skew
  const [startDate, setStartDate] = useState<string>('2026-10-23');
  const [endDate, setEndDate] = useState<string>('2026-10-30');
  const [activeCaseId, setActiveCaseId] = useState<string>('slippage-analysis');
  const [searchReason, setSearchReason] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('Check if leverage was modified right before stop-out');
  const [parameterized, setParameterized] = useState<boolean>(false);

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
    if (params.get('vendor')) setVendorId(params.get('vendor') || '');
    if (params.get('case')) setActiveCaseId(params.get('case') || 'slippage-analysis');
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
    if (vendorId) params.set('vendor', vendorId);
    if (activeCaseId) params.set('case', activeCaseId);
    params.set('dateMode', dateMode);
    if (startDate) params.set('from', startDate);
    if (dateMode === 'range' && endDate) params.set('to', endDate);
    params.set('mode', parameterized ? 'param' : 'injected');
    if (activeCaseId === 'custom' && customPrompt) params.set('prompt', customPrompt);

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [loginId, vendorId, activeCaseId, dateMode, startDate, endDate, parameterized, customPrompt]);

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
  // Quick Presets Handler
  // -------------------------------------------------------------
  const applyPreset = (preset: 'today' | 'yesterday' | '7days' | '30days') => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    if (preset === 'today') {
      setDateMode('single');
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'yesterday') {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      setDateMode('single');
      setStartDate(yesterday);
      setEndDate(yesterday);
    } else if (preset === '7days') {
      setDateMode('range');
      setStartDate(new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]);
      setEndDate(today);
    } else if (preset === '30days') {
      setDateMode('range');
      setStartDate(new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]);
      setEndDate(today);
    }
  };

  // -------------------------------------------------------------
  // Active Template / Custom Query Resolution
  // -------------------------------------------------------------
  const activeTemplate = useMemo(() => {
    if (activeCaseId === 'custom') return null;
    return QUERY_TEMPLATES.find((t) => t.id === activeCaseId) || QUERY_TEMPLATES[0];
  }, [activeCaseId]);

  const { generatedSql, currentMetadata } = useMemo(() => {
    if (activeCaseId === 'custom') {
      const customRes = generateCustomQuery({
        prompt: customPrompt,
        loginId,
        vendorId,
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
      vendorId,
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
  }, [activeTemplate, activeCaseId, customPrompt, loginId, vendorId, dateMode, startDate, endDate, parameterized]);

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
    const filename = `Que_Me_${activeCaseId}_login_${loginId || 'all'}_${startDate}.sql`;
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
          TOP NAVIGATION & HEADER
      ------------------------------------------------------------- */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-bold">
              Q
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  Que_Me
                </span>
                <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  SQL Diagnostic Studio
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ops & Support Query Generator for TradingAccount investigations
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------------
          TOP FILTER BAR (PHASE 2 SPEC)
      ------------------------------------------------------------- */}
      <section className="bg-slate-900 border-b border-slate-800/80 shadow-md px-6 py-4">
        <div className="max-w-7xl mx-auto space-y-3.5">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
            
            {/* 1. Login ID Input */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Login ID <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="e.g. 100234"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            {/* 2. Vendor ID Input (Optional) */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Vendor ID
                </label>
                <span className="text-[10px] text-slate-400 font-normal">Optional</span>
              </div>
              <input
                type="number"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                placeholder="All Vendors"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
              />
            </div>

            {/* 3. Date Mode & Date Range Inputs */}
            <div className="md:col-span-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Date Specification
                </label>
                {/* Segmented Control */}
                <div className="inline-flex rounded-md p-0.5 bg-slate-950 border border-slate-800 text-[11px]">
                  <button
                    onClick={() => setDateMode('single')}
                    className={`px-2 py-0.5 rounded font-medium transition-colors ${
                      dateMode === 'single'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Single Date
                  </button>
                  <button
                    onClick={() => setDateMode('range')}
                    className={`px-2 py-0.5 rounded font-medium transition-colors ${
                      dateMode === 'range'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Date Range
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono [color-scheme:dark]"
                  />
                </div>
                {dateMode === 'range' && (
                  <>
                    <span className="text-slate-500 text-xs">to</span>
                    <div className="relative flex-1">
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono [color-scheme:dark]"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 4. Reason / Use Case Dropdown */}
            <div className="md:col-span-4 relative" ref={dropdownRef}>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Investigation Case / Reason <span className="text-rose-400">*</span>
              </label>

              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <div className="flex items-center gap-2 truncate">
                  {activeCaseId === 'custom' ? (
                    <>
                      <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="font-medium text-cyan-300 truncate">Custom</span>
                    </>
                  ) : activeTemplate ? (
                    <>
                      {getCategoryIcon(activeTemplate.category)}
                      <span className="truncate font-medium">{activeTemplate.title}</span>
                    </>
                  ) : (
                    <span className="text-slate-400">Select an investigation reason...</span>
                  )}
                </div>
                <Search className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute right-0 left-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="p-2 border-b border-slate-800 bg-slate-950/80">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={searchReason}
                        onChange={(e) => setSearchReason(e.target.value)}
                        placeholder="Search use cases, tables or symptoms..."
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                      className={`px-3 py-2.5 hover:bg-slate-800/90 cursor-pointer transition-colors flex items-center gap-2.5 ${
                        activeCaseId === 'custom' ? 'bg-indigo-950/50' : ''
                      }`}
                    >
                      <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="text-xs font-semibold text-cyan-300">
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
                        className={`px-3 py-2.5 hover:bg-slate-800/90 cursor-pointer transition-colors flex items-center gap-2.5 ${
                          activeCaseId === tmpl.id ? 'bg-indigo-950/50' : ''
                        }`}
                      >
                        <div className="shrink-0">{getCategoryIcon(tmpl.category)}</div>
                        <span className="text-xs font-medium text-slate-200">
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

          {/* Quick Date Presets & Custom Prompt Expansion */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/60">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Quick Range:</span>
              <button
                onClick={() => applyPreset('today')}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-[11px]"
              >
                Today
              </button>
              <button
                onClick={() => applyPreset('yesterday')}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-[11px]"
              >
                Yesterday
              </button>
              <button
                onClick={() => applyPreset('7days')}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-[11px]"
              >
                Last 7 Days
              </button>
              <button
                onClick={() => applyPreset('30days')}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-[11px]"
              >
                Last 30 Days
              </button>
            </div>
          </div>

          {/* Custom Case Prompt Bar (If active) */}
          {activeCaseId === 'custom' && (
            <div className="bg-slate-950 p-3.5 rounded-xl border border-cyan-800/50 shadow-inner space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                  <label className="text-xs font-semibold text-cyan-300">
                    Describe what you want to investigate:
                  </label>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-cyan-400/80 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800/60 font-mono">
                  <Zap className="w-3 h-3 text-cyan-400" />
                  <span>Zero-Cost Engine Active</span>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g. check if leverage was modified right before stop-out, or find accounts sharing IP"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-sans"
                />
                {customPrompt && (
                  <button
                    type="button"
                    onClick={() => setCustomPrompt('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white transition-colors"
                    title="Clear prompt"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Quick Suggestion Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mr-1">
                  Try Scenario:
                </span>
                {[
                  'Leverage modified right before stop-out',
                  'Cross-account IP & device sharing',
                  'Execution latency > 1s and slippage spikes',
                  'Deposit, withdrawal & UTR tracking',
                  'Dealer manual overrides & adjustments',
                  'KYC status changes & document review'
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setCustomPrompt(chip)}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-700/60 transition-all flex items-center gap-1"
                  >
                    <span>{chip}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------------
          RESULTS VIEWPORT: SPLIT PANEL (PHASE 2 SPEC)
      ------------------------------------------------------------- */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* =========================================================
              LEFT PANEL: QUERY METADATA & INVESTIGATION CONTEXT
          ========================================================= */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              
              {/* Header & Scenario Badge */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  {getCategoryIcon(currentMetadata?.category || '')}
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {currentMetadata?.category} Investigation
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  {currentMetadata?.title}
                </h2>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  {currentMetadata?.description}
                </p>
              </div>

              <div className="h-px bg-slate-800" />

              {/* Tables Joined */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
                  <Database className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Target Tables Joined</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {currentMetadata?.tables.map((table) => (
                    <span
                      key={table}
                      className="text-xs font-mono px-2 py-1 rounded-md bg-slate-950 text-indigo-300 border border-indigo-900/40 flex items-center gap-1"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                      {table}
                    </span>
                  ))}
                </div>
              </div>

              {/* Indexes Utilized */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Indexes Utilized</span>
                </div>
                <div className="space-y-1">
                  {currentMetadata?.indexes.map((idx) => (
                    <div
                      key={idx}
                      className="text-[11px] font-mono px-2.5 py-1 rounded bg-slate-950 text-slate-300 border border-slate-800 flex items-center justify-between"
                    >
                      <span className="truncate">{idx}</span>
                      <span className="text-[9px] text-cyan-400 bg-cyan-950 px-1 py-0.2 rounded border border-cyan-800">
                        B-Tree
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="h-px bg-slate-800" />

              {/* Diagnostic Notes & Interpretation Tips */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
                  <Info className="w-3.5 h-3.5 text-amber-400" />
                  <span>Diagnostic Checklist & Rules</span>
                </div>
                <ul className="space-y-2">
                  {currentMetadata?.diagnosticNotes.map((note, index) => (
                    <li key={index} className="text-xs text-slate-400 flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 mt-1.5 shrink-0" />
                      <span className="leading-snug">{note}</span>
                    </li>
                  ))}
                </ul>
              </div>

            </div>
          </div>

          {/* =========================================================
              RIGHT PANEL: RAW SQL VIEWER (PHASE 2 & PHASE 4 SPEC)
          ========================================================= */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col">
            
            {/* SQL Toolbar */}
            <div className="border-b border-slate-800 bg-slate-950/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  <span>PostgreSQL Query</span>
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
                    Injected Literal ({loginId || '10001'})
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

              {/* Action Buttons: Copy, Download, Share */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopySql}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-sm active:scale-95"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'Copied!' : 'Copy SQL'}</span>
                </button>

                <button
                  onClick={handleDownloadSql}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                  title="Download as .sql file"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>.sql</span>
                </button>
              </div>
            </div>

            {/* Code Display Area */}
            <div className="relative bg-slate-950 p-4 font-mono text-[13px] leading-relaxed overflow-x-auto min-h-[460px] text-slate-100 selection:bg-indigo-600 selection:text-white">
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
