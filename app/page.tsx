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
  RotateCcw,
  ExternalLink,
  Plus,
  Save,
  BookmarkPlus,
  Trash2,
  Edit3,
  Undo2,
  Replace,
  Eye,
  Code2,
  Pencil
} from 'lucide-react';
import { 
  QUERY_TEMPLATES, 
  QueryTemplate, 
  UserCustomScript, 
  QueryStatementType,
  generateCustomQuery,
  getQueryStatementType,
  getTemplateStatementType
} from '@/lib/templates';

const CATEGORY_ORDER: Array<'Trading' | 'Funds' | 'Risk' | 'Security' | 'Compliance'> = [
  'Trading',
  'Funds',
  'Risk',
  'Security',
  'Compliance'
];

const CATEGORY_META: Record<'Trading' | 'Funds' | 'Risk' | 'Security' | 'Compliance', { label: string; count: number }> = {
  Trading: { label: 'Trading & Execution', count: 7 },
  Funds: { label: 'Funds & Reconciliation', count: 7 },
  Risk: { label: 'Risk & Exposure', count: 6 },
  Security: { label: 'Security & Abuse Detection', count: 3 },
  Compliance: { label: 'Compliance & Governance', count: 4 }
};

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
  const [customPrompt, setCustomPrompt] = useState<string>('remove the word "demo" from all the live accounts');
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
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // User Custom Scripts state (persisted in localStorage)
  const [savedCustomScripts, setSavedCustomScripts] = useState<UserCustomScript[]>([]);

  // SQL Editor States
  const [editorSql, setEditorSql] = useState<string>('');
  const [isCustomEdited, setIsCustomEdited] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor');

  // Find & Replace States
  const [showFindReplace, setShowFindReplace] = useState<boolean>(false);
  const [findText, setFindText] = useState<string>('');
  const [replaceText, setReplaceText] = useState<string>('');
  const [findStatus, setFindStatus] = useState<string>('');

  // Script Modal States (Save as Script / Create New Script)
  const [isScriptModalOpen, setIsScriptModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'create' | 'save_as'>('save_as');
  const [scriptFormTitle, setScriptFormTitle] = useState<string>('');
  const [scriptFormCategory, setScriptFormCategory] = useState<'Trading' | 'Funds' | 'Risk' | 'Security' | 'Compliance' | 'Custom'>('Custom');
  const [scriptFormDescription, setScriptFormDescription] = useState<string>('');
  const [scriptFormTables, setScriptFormTables] = useState<string>('TradingAccount');
  const [scriptSaveToast, setScriptSaveToast] = useState<string>('');

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const prevCaseIdRef = useRef<string>(activeCaseId);

  // -------------------------------------------------------------
  // Sync state from / to URL query params (Phase 4 requirement) & localStorage
  // -------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load saved custom scripts from localStorage
    try {
      const stored = localStorage.getItem('que_me_custom_user_scripts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSavedCustomScripts(parsed);
        }
      }
    } catch (err) {
      console.error('Failed to load custom scripts from localStorage', err);
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const last7DaysStr = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const params = new URLSearchParams(window.location.search);
    
    if (params.get('login')) setLoginId(params.get('login') || '');
    const caseParam = params.get('case');
    if (caseParam && caseParam !== 'slippage-analysis') {
      setActiveCaseId(caseParam);
    } else {
      setActiveCaseId('remove-demo-live-accounts');
    }
    if (params.get('dateMode') === 'single' || params.get('dateMode') === 'range') {
      setDateMode(params.get('dateMode') as 'single' | 'range');
    }
    setStartDate(params.get('from') || last7DaysStr);
    setEndDate(params.get('to') || todayStr);
    if (params.get('mode') === 'param') setParameterized(true);
    if (params.get('mode') === 'injected') setParameterized(false);
    const promptParam = params.get('prompt');
    if (promptParam) setCustomPrompt(promptParam);
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
  const activeUserScript = useMemo(() => {
    return savedCustomScripts.find((s) => s.id === activeCaseId) || null;
  }, [savedCustomScripts, activeCaseId]);

  const activeTemplate = useMemo(() => {
    if (activeCaseId === 'custom' || activeUserScript) return null;
    return QUERY_TEMPLATES.find((t) => t.id === activeCaseId) || QUERY_TEMPLATES[0];
  }, [activeCaseId, activeUserScript]);

  const { generatedSql, currentMetadata } = useMemo(() => {
    if (activeUserScript) {
      let sql = activeUserScript.sql;
      if (!parameterized && loginId) {
        sql = sql.replace(/:loginId\b/g, loginId);
      }
      return {
        generatedSql: sql,
        currentMetadata: {
          title: activeUserScript.title,
          description: activeUserScript.description,
          category: activeUserScript.category,
          statementType: activeUserScript.statementType || getQueryStatementType(sql),
          tables: activeUserScript.tables,
          indexes: activeUserScript.indexes || [],
          sensitivity: activeUserScript.sensitivity || 'Medium',
          diagnosticNotes: activeUserScript.diagnosticNotes && activeUserScript.diagnosticNotes.length > 0
            ? activeUserScript.diagnosticNotes
            : ['User-defined custom diagnostic and operational script.']
        }
      };
    }

    if (activeCaseId === 'custom') {
      if (customQueryResult) {
        return {
          generatedSql: customQueryResult.sql,
          currentMetadata: {
            title: customQueryResult.isAiGenerated ? 'AI-Synthesized Diagnostic Query' : 'Custom Diagnostic Query',
            description: `Generated for scenario: "${customPrompt}"`,
            category: 'Custom' as const,
            statementType: getQueryStatementType(customQueryResult.sql),
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
          category: 'Custom' as const,
          statementType: getQueryStatementType(customRes.sql),
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
        statementType: activeTemplate.statementType || getTemplateStatementType(activeTemplate),
        tables: activeTemplate.tables,
        indexes: activeTemplate.indexes,
        sensitivity: activeTemplate.sensitivity,
        diagnosticNotes: activeTemplate.diagnosticNotes
      }
    };
  }, [activeTemplate, activeUserScript, activeCaseId, customPrompt, loginId, dateMode, startDate, endDate, parameterized, customQueryResult]);

  // Sync generatedSql into editorSql when template or parameters change
  useEffect(() => {
    if (prevCaseIdRef.current !== activeCaseId || !isCustomEdited) {
      setEditorSql(generatedSql);
      setIsCustomEdited(false);
      prevCaseIdRef.current = activeCaseId;
    }
  }, [generatedSql, activeCaseId, isCustomEdited]);

  // Synchronized scrolling between line numbers and textarea
  const handleScrollSync = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Keyboard shortcut & Tab indentation in editor
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      const newVal = val.substring(0, start) + '  ' + val.substring(end);
      setEditorSql(newVal);
      setIsCustomEdited(newVal !== generatedSql);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setShowFindReplace((prev) => !prev);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      handleOpenSaveAsScript();
    }
  };

  const handleRevertSql = () => {
    setEditorSql(generatedSql);
    setIsCustomEdited(false);
  };

  // Find & Replace Handlers
  const handleReplaceAll = () => {
    if (!findText) return;
    const current = editorSql;
    const occurrences = current.split(findText).length - 1;
    if (occurrences === 0) {
      setFindStatus('No matches found');
      setTimeout(() => setFindStatus(''), 3000);
      return;
    }
    const updated = current.split(findText).join(replaceText);
    setEditorSql(updated);
    setIsCustomEdited(updated !== generatedSql);
    setFindStatus(`Replaced ${occurrences} occurrence${occurrences > 1 ? 's' : ''}`);
    setTimeout(() => setFindStatus(''), 3000);
  };

  const handleReplaceNext = () => {
    if (!findText) return;
    const current = editorSql;
    const index = current.indexOf(findText);
    if (index === -1) {
      setFindStatus('No match found');
      setTimeout(() => setFindStatus(''), 3000);
      return;
    }
    const updated = current.substring(0, index) + replaceText + current.substring(index + findText.length);
    setEditorSql(updated);
    setIsCustomEdited(updated !== generatedSql);
    setFindStatus('1 occurrence replaced');
    setTimeout(() => setFindStatus(''), 3000);
  };

  // Script Management Handlers
  const handleOpenSaveAsScript = () => {
    setModalMode('save_as');
    if (activeUserScript) {
      setScriptFormTitle(activeUserScript.title + ' (Copy)');
      setScriptFormCategory(activeUserScript.category);
      setScriptFormDescription(activeUserScript.description);
      setScriptFormTables(activeUserScript.tables.join(', '));
    } else if (activeTemplate) {
      let suggestedTitle = activeTemplate.title;
      if (activeTemplate.id === 'remove-demo-live-accounts' && !editorSql.includes('demo') && editorSql.includes('the')) {
        suggestedTitle = 'Remove the word "the" from all live accounts';
      } else if (isCustomEdited) {
        suggestedTitle = `${activeTemplate.title} (Custom)`;
      }
      setScriptFormTitle(suggestedTitle);
      setScriptFormCategory(activeTemplate.category);
      setScriptFormDescription(
        activeTemplate.id === 'remove-demo-live-accounts' && editorSql.includes('the')
          ? 'Updates TradingAccount records by regex-stripping the word "the" and redundant whitespace from all live account names.'
          : activeTemplate.description
      );
      setScriptFormTables(activeTemplate.tables.join(', '));
    } else {
      setScriptFormTitle('Custom Diagnostic Script');
      setScriptFormCategory('Custom');
      setScriptFormDescription(customPrompt ? `Scenario: ${customPrompt}` : 'Custom SQL diagnostic script.');
      setScriptFormTables('TradingAccount');
    }
    setIsScriptModalOpen(true);
  };

  const handleOpenCreateNewScript = () => {
    setModalMode('create');
    setScriptFormTitle('New Custom Script');
    setScriptFormCategory('Custom');
    setScriptFormDescription('Operational diagnostic and remediation script.');
    setScriptFormTables('TradingAccount');
    setIsScriptModalOpen(true);
  };

  const handleSaveScriptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scriptFormTitle.trim()) return;

    const tablesArray = scriptFormTables
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const now = new Date().toISOString();
    let targetSql = editorSql || generatedSql;

    if (modalMode === 'create' && !targetSql.trim()) {
      targetSql = `-- =====================================================================
-- Scenario: ${scriptFormTitle}
-- Target: TradingAccount
-- =====================================================================

SELECT 
    ta.login, 
    ta.name, 
    ta.balance, 
    ta.equity 
FROM "TradingAccount" ta 
LIMIT 50;`;
    }

    const scriptId = `user-script-${Date.now()}`;
    const newScript: UserCustomScript = {
      id: scriptId,
      title: scriptFormTitle.trim(),
      category: scriptFormCategory,
      description: scriptFormDescription.trim() || 'Custom operational script.',
      tables: tablesArray.length > 0 ? tablesArray : ['TradingAccount'],
      sql: targetSql,
      createdAt: now,
      updatedAt: now
    };

    const updatedScripts = [newScript, ...savedCustomScripts];
    setSavedCustomScripts(updatedScripts);
    try {
      localStorage.setItem('que_me_custom_user_scripts', JSON.stringify(updatedScripts));
    } catch (err) {
      console.error('Failed to save script to localStorage', err);
    }

    setIsScriptModalOpen(false);
    setActiveCaseId(scriptId);
    setEditorSql(targetSql);
    setIsCustomEdited(false);

    setScriptSaveToast(`Script "${newScript.title}" saved!`);
    setTimeout(() => setScriptSaveToast(''), 3000);
  };

  const handleUpdateCurrentScript = () => {
    if (!activeUserScript) return;
    const now = new Date().toISOString();
    const updatedScripts = savedCustomScripts.map((s) => {
      if (s.id === activeUserScript.id) {
        return {
          ...s,
          sql: editorSql,
          updatedAt: now
        };
      }
      return s;
    });
    setSavedCustomScripts(updatedScripts);
    try {
      localStorage.setItem('que_me_custom_user_scripts', JSON.stringify(updatedScripts));
    } catch (err) {
      console.error('Failed to update script in localStorage', err);
    }
    setIsCustomEdited(false);
    setScriptSaveToast(`Changes saved to "${activeUserScript.title}"!`);
    setTimeout(() => setScriptSaveToast(''), 3000);
  };

  const handleDeleteUserScript = (e: React.MouseEvent, scriptId: string) => {
    e.stopPropagation();
    const target = savedCustomScripts.find((s) => s.id === scriptId);
    const confirmName = target ? target.title : 'this script';
    if (!window.confirm(`Are you sure you want to delete "${confirmName}"?`)) {
      return;
    }
    const updated = savedCustomScripts.filter((s) => s.id !== scriptId);
    setSavedCustomScripts(updated);
    try {
      localStorage.setItem('que_me_custom_user_scripts', JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to update localStorage after script deletion', err);
    }
    if (activeCaseId === scriptId) {
      setActiveCaseId('remove-demo-live-accounts');
    }
  };

  // Statement badge helper (select, update, delete, script)
  const renderStatementBadge = (type?: QueryStatementType) => {
    const safeType = type || 'SELECT';
    switch (safeType) {
      case 'SELECT':
        return (
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/25 shrink-0 tracking-wide uppercase">
            select
          </span>
        );
      case 'UPDATE':
        return (
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25 shrink-0 tracking-wide uppercase">
            update
          </span>
        );
      case 'DELETE':
        return (
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/25 shrink-0 tracking-wide uppercase">
            delete
          </span>
        );
      case 'SCRIPT':
        return (
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/25 shrink-0 tracking-wide uppercase">
            script
          </span>
        );
      default:
        return null;
    }
  };

  // Filtered and category-grouped list of templates in dropdown
  const groupedTemplates = useMemo(() => {
    const q = searchReason.trim().toLowerCase();
    const filtered = !q
      ? QUERY_TEMPLATES
      : QUERY_TEMPLATES.filter((t) => {
          const stmt = t.statementType || getTemplateStatementType(t);
          return (
            t.title.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            t.category.toLowerCase().includes(q) ||
            stmt.toLowerCase().includes(q) ||
            t.tables.some((tbl) => tbl.toLowerCase().includes(q))
          );
        });

    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      label: CATEGORY_META[cat]?.label || cat,
      templates: filtered.filter((t) => t.category === cat)
    })).filter((group) => group.templates.length > 0);
  }, [searchReason]);

  // -------------------------------------------------------------
  // Clipboard & Download Actions
  // -------------------------------------------------------------
  const handleCopySql = async () => {
    const textToCopy = editorSql || generatedSql;
    if (!textToCopy) return;
    await navigator.clipboard.writeText(textToCopy);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleDownloadSql = () => {
    const textToDownload = editorSql || generatedSql;
    if (!textToDownload) return;
    const filename = `Que_Me_${activeCaseId}_login_${loginId || '100234'}_${startDate}.sql`;
    const blob = new Blob([textToDownload], { type: 'text/sql;charset=utf-8;' });
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
  // Reset Everything to Default
  // -------------------------------------------------------------
  const handleResetAll = () => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const last7DaysStr = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    setLoginId('100234');
    setDateMode('range');
    setStartDate(last7DaysStr);
    setEndDate(todayStr);
    setActiveCaseId('remove-demo-live-accounts');
    setSearchReason('');
    setCustomPrompt('remove the word "demo" from all the live accounts');
    setCustomQueryResult(null);
    setParameterized(false);
    setIsDropdownOpen(false);
    setIsCustomEdited(false);
    setShowFindReplace(false);
    setViewMode('editor');

    setIsResetting(true);
    setTimeout(() => setIsResetting(false), 1200);
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
                    <div className="flex items-center gap-2 truncate">
                      <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="font-medium text-cyan-300 truncate">Custom</span>
                      {renderStatementBadge(currentMetadata?.statementType)}
                    </div>
                  ) : activeUserScript ? (
                    <div className="flex items-center gap-2 truncate">
                      {getCategoryIcon(activeUserScript.category)}
                      <span className="truncate font-medium text-emerald-300">{activeUserScript.title}</span>
                      {renderStatementBadge(activeUserScript.statementType || getQueryStatementType(editorSql || activeUserScript.sql))}
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                        Script
                      </span>
                    </div>
                  ) : activeTemplate ? (
                    <div className="flex items-center gap-2 truncate">
                      {getCategoryIcon(activeTemplate.category)}
                      <span className="truncate font-medium text-slate-100">{activeTemplate.title}</span>
                      {renderStatementBadge(activeTemplate.statementType || getTemplateStatementType(activeTemplate))}
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
                        placeholder="Search use cases, statement type (select, update), tables..."
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-9 pr-3.5 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
                    {/* Action Header: Custom Prompt & Write New Script */}
                    <div className="p-2 grid grid-cols-2 gap-2 bg-slate-950/60">
                      <div
                        onClick={() => {
                          setActiveCaseId('custom');
                          setIsDropdownOpen(false);
                        }}
                        className={`px-3 py-2 rounded-lg hover:bg-slate-800/90 cursor-pointer transition-colors flex items-center gap-2 ${
                          activeCaseId === 'custom' ? 'bg-indigo-950/60 border border-indigo-700/60' : 'border border-slate-800'
                        }`}
                      >
                        <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span className="text-xs font-semibold text-cyan-300">
                          Custom Prompt
                        </span>
                      </div>

                      <div
                        onClick={() => {
                          setIsDropdownOpen(false);
                          handleOpenCreateNewScript();
                        }}
                        className="px-3 py-2 rounded-lg hover:bg-slate-800/90 cursor-pointer transition-colors flex items-center gap-2 border border-emerald-900/40 bg-emerald-950/20 hover:bg-emerald-900/30"
                      >
                        <Plus className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="text-xs font-semibold text-emerald-300">
                          + Write New Script
                        </span>
                      </div>
                    </div>

                    {/* Section: My Saved Scripts */}
                    {savedCustomScripts.length > 0 && (
                      <div className="py-1">
                        <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-950/40 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <BookmarkPlus className="w-3.5 h-3.5 text-emerald-400" />
                            <span>My Saved Scripts ({savedCustomScripts.length})</span>
                          </span>
                        </div>
                        {savedCustomScripts
                          .filter(
                            (s) =>
                              !searchReason ||
                              s.title.toLowerCase().includes(searchReason.toLowerCase()) ||
                              s.description.toLowerCase().includes(searchReason.toLowerCase()) ||
                              (s.statementType && s.statementType.toLowerCase().includes(searchReason.toLowerCase())) ||
                              s.tables.some((tbl) => tbl.toLowerCase().includes(searchReason.toLowerCase()))
                          )
                          .map((script) => (
                            <div
                              key={script.id}
                              onClick={() => {
                                setActiveCaseId(script.id);
                                setIsDropdownOpen(false);
                              }}
                              className={`px-4 py-2.5 hover:bg-slate-800/90 cursor-pointer transition-colors flex items-center justify-between group ${
                                activeCaseId === script.id ? 'bg-indigo-950/50' : ''
                              }`}
                            >
                              <div className="flex items-center gap-2.5 truncate mr-2">
                                <div className="shrink-0">{getCategoryIcon(script.category)}</div>
                                <span className="text-xs sm:text-sm font-medium text-slate-200 truncate">
                                  {script.title}
                                </span>
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5">
                                {renderStatementBadge(script.statementType || getQueryStatementType(script.sql))}
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                                  Saved Script
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteUserScript(e, script.id)}
                                  className="text-slate-500 hover:text-rose-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                                  title="Delete saved script"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Section: Preset Templates Grouped by Category */}
                    {groupedTemplates.map((group) => (
                      <div key={group.category} className="py-1">
                        <div className="px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-950/70 border-y border-slate-800/80 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                          <span className="flex items-center gap-1.5 font-mono text-slate-300">
                            {getCategoryIcon(group.category)}
                            <span>{group.label}</span>
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                            {group.templates.length}
                          </span>
                        </div>
                        <div className="divide-y divide-slate-800/40">
                          {group.templates.map((tmpl) => {
                            const stmtType = tmpl.statementType || getTemplateStatementType(tmpl);
                            const isSelected = activeCaseId === tmpl.id;
                            return (
                              <div
                                key={tmpl.id}
                                onClick={() => {
                                  setActiveCaseId(tmpl.id);
                                  setIsDropdownOpen(false);
                                }}
                                className={`px-4 py-2.5 hover:bg-slate-800/90 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                                  isSelected ? 'bg-indigo-950/60 border-l-2 border-indigo-400 pl-3.5' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2.5 truncate mr-2">
                                  <span className={`text-xs sm:text-sm font-medium truncate ${
                                    isSelected ? 'text-white font-semibold' : 'text-slate-200'
                                  }`}>
                                    {tmpl.title}
                                  </span>
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                  {renderStatementBadge(stmtType)}
                                  {isSelected && (
                                    <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {groupedTemplates.length === 0 && (
                      <div className="p-4 text-center text-xs text-slate-500">
                        No preset templates match "{searchReason}". Try selecting Custom above!
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 3b. Quick "+ New Script" button */}
            <button
              type="button"
              onClick={handleOpenCreateNewScript}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 hover:border-emerald-500 text-emerald-400 hover:text-emerald-300 text-xs font-semibold hover:bg-slate-800 transition-all shadow-sm active:scale-95 shrink-0"
              title="Write a new custom SQL script from scratch"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Script</span>
            </button>

            {/* 4. Reset to Default Button */}
            <button
              type="button"
              onClick={handleResetAll}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 hover:border-slate-500 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold transition-all shadow-sm active:scale-95 shrink-0 group"
              title="Reset all filters, dates, and query selections back to default"
            >
              {isResetting ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5 text-slate-400 group-hover:-rotate-90 transition-transform duration-200" />
              )}
              <span className={isResetting ? 'text-emerald-400 font-semibold' : ''}>
                {isResetting ? 'Reset Done' : 'Reset'}
              </span>
            </button>

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
                  placeholder="e.g. remove the word &quot;demo&quot; from all the live accounts, or find accounts sharing IP"
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

           
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-stretch">
          
          {/* =========================================================
              LEFT PANEL: USE CASE DESCRIPTION & PLAIN-ENGLISH AUDIT GUIDE
          ========================================================= */}
          <div className={`lg:col-span-5 flex flex-col ${activeCaseId === 'custom' ? 'pt-2 sm:pt-3' : ''}`}>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex-1 flex flex-col">
              
              {/* Header: "Use Case Overview" */}
              <div className="border-b border-slate-800 bg-slate-950/80 px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  {getCategoryIcon(currentMetadata?.category || '')}
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
                    Use Case Overview
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {currentMetadata?.statementType && renderStatementBadge(currentMetadata.statementType)}
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase font-semibold">
                    {currentMetadata?.category}
                  </span>
                  {currentMetadata?.sensitivity && (
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      currentMetadata.sensitivity.includes('High') 
                        ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' 
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}>
                      {currentMetadata.sensitivity}
                    </span>
                  )}
                </div>
              </div>

              {/* Main Content Area: Spacious, Scrollable, Minimal Jargon */}
              <div className="flex-1 p-5 sm:p-6 overflow-y-auto flex flex-col gap-5 text-slate-200">
                
                {/* 1. Case Title & Plain-Language Description */}
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug mb-3 font-heading">
                    {currentMetadata?.title}
                  </h2>
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 shadow-inner">
                    <div className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5 font-mono">
                      <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>What this query does</span>
                    </div>
                    <p className="text-sm text-slate-200 leading-relaxed font-sans">
                      {currentMetadata?.description}
                    </p>
                  </div>
                </div>

                {/* 2. Key Checkpoints / What to look for */}
                {currentMetadata?.diagnosticNotes && currentMetadata.diagnosticNotes.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-1.5 font-mono">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>What to look for in the results</span>
                    </div>
                    <ul className="space-y-2 bg-slate-950/40 border border-slate-800/60 rounded-xl p-3.5 text-xs text-slate-300 font-sans">
                      {currentMetadata.diagnosticNotes.map((note, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                          <span className="leading-relaxed">{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 3. Target Database Tables */}
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 font-mono">
                    <Database className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>Database Tables Checked</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {currentMetadata?.tables.map((table) => (
                      <span
                        key={table}
                        className="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-950 text-indigo-300 border border-indigo-900/40 flex items-center gap-1.5 shadow-sm"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                        {table}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 4. Custom User Script Indicator Badge if active */}
                {activeUserScript && (
                  <div className="mt-auto pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>Custom Saved Script</span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Updated: {new Date(activeUserScript.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}

              </div>

            </div>
          </div>

          {/* =========================================================
              RIGHT PANEL: > SQL QUERY (EDITABLE CODE EDITOR + ACTIONS)
          ========================================================= */}
          <div className={`lg:col-span-7 flex flex-col ${activeCaseId === 'custom' ? 'pt-2 sm:pt-3' : ''}`}>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex-1 flex flex-col">
              
              {/* Header: "SQL query" with Actions */}
              <div className="border-b border-slate-800 bg-slate-950/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 font-mono tracking-tight mr-1">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <span>SQL query</span>
                  </div>
                  {renderStatementBadge(isCustomEdited ? getQueryStatementType(editorSql) : currentMetadata?.statementType)}

                  {/* View Mode Toggle: Interactive Editor vs Syntax Preview */}
                  <div className="inline-flex rounded-lg p-0.5 bg-slate-900 border border-slate-800 text-xs shadow-inner">
                    <button
                      type="button"
                      onClick={() => setViewMode('editor')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                        viewMode === 'editor'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Interactive code editor with live editing and line numbers"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>Editor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('preview')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                        viewMode === 'preview'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Syntax-highlighted preview"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>
                  </div>

                  {/* Find & Replace Toggle Button */}
                  <button
                    type="button"
                    onClick={() => setShowFindReplace(!showFindReplace)}
                    className={`px-2.5 py-1 text-xs rounded-lg border flex items-center gap-1.5 transition-colors ${
                      showFindReplace
                        ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                    }`}
                    title="Find & Replace in query (e.g. replace 'demo' with 'the')"
                  >
                    <Replace className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden sm:inline">Find & Replace</span>
                  </button>

                  {/* Custom Edited Badge & Revert Button */}
                  {isCustomEdited && (
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                        <Pencil className="w-3 h-3" />
                        <span>Edited</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleRevertSql}
                        className="text-xs text-slate-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors"
                        title="Revert query back to generated template"
                      >
                        <Undo2 className="w-3 h-3" />
                        <span>Revert</span>
                      </button>
                    </div>
                  )}

                  {/* Parameter Injection Toggle */}
                  <div className="inline-flex rounded-lg p-0.5 bg-slate-900 border border-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setParameterized(false)}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                        !parameterized
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Substitute live values directly into SQL (ready to paste in DBeaver/psql)"
                    >
                      Injected ({loginId || '100234'})
                    </button>
                    <button
                      type="button"
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

                {/* Action Buttons: Save Script, Copy, Download */}
                <div className="flex items-center gap-2">
                  {activeUserScript ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleUpdateCurrentScript}
                        disabled={!isCustomEdited}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white transition-colors shadow-sm active:scale-95"
                        title="Save modifications to this script"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Changes</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenSaveAsScript}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                        title="Save as a separate script copy"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Save As Copy</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleOpenSaveAsScript}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition-all shadow-sm active:scale-95"
                      title="Save this tweaked query as a new reusable script"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>Save as Script</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-sm active:scale-95"
                  >
                    {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSql ? 'Copied!' : 'Copy'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadSql}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                    title="Download as .sql file"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Find & Replace Bar */}
              {showFindReplace && (
                <div className="bg-slate-950/95 border-b border-slate-800/90 px-4 py-2.5 flex flex-wrap items-center gap-3 text-xs shadow-inner">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-mono text-[11px] uppercase tracking-wider">Find:</span>
                    <input
                      type="text"
                      value={findText}
                      onChange={(e) => setFindText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleReplaceNext();
                        }
                      }}
                      placeholder="e.g. demo"
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 font-mono text-xs w-32 sm:w-40 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-mono text-[11px] uppercase tracking-wider">Replace:</span>
                    <input
                      type="text"
                      value={replaceText}
                      onChange={(e) => setReplaceText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleReplaceAll();
                        }
                      }}
                      placeholder="e.g. the"
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 font-mono text-xs w-32 sm:w-40 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleReplaceAll}
                      disabled={!findText}
                      className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium text-xs transition-colors shadow-sm"
                    >
                      Replace All
                    </button>
                    <button
                      type="button"
                      onClick={handleReplaceNext}
                      disabled={!findText}
                      className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 text-slate-200 font-medium text-xs transition-colors"
                    >
                      Replace Next
                    </button>
                    {findStatus && (
                      <span className="text-cyan-300 font-mono text-xs ml-1 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded">
                        {findStatus}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowFindReplace(false)}
                      className="text-slate-500 hover:text-slate-300 ml-auto p-1"
                      title="Close Find & Replace"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Code Display Area (Editable Textarea with Line Numbers, or Syntax Preview) */}
              {viewMode === 'editor' ? (
                <div className="flex-1 flex relative bg-slate-950 min-h-[500px] overflow-hidden">
                  {/* Line Numbers Gutter */}
                  <div
                    ref={lineNumbersRef}
                    className="select-none py-4 px-3 text-right font-mono text-[13px] leading-[22px] text-slate-600 bg-slate-950 border-r border-slate-800/70 shrink-0 overflow-hidden"
                    style={{ minWidth: '48px' }}
                  >
                    {editorSql.split('\n').map((_, idx) => (
                      <div key={idx} className="h-[22px]">
                        {idx + 1}
                      </div>
                    ))}
                  </div>

                  {/* Editable Code Textarea */}
                  <textarea
                    ref={textareaRef}
                    value={editorSql}
                    onChange={(e) => {
                      setEditorSql(e.target.value);
                      setIsCustomEdited(e.target.value !== generatedSql);
                    }}
                    onScroll={handleScrollSync}
                    onKeyDown={handleEditorKeyDown}
                    spellCheck={false}
                    wrap="off"
                    placeholder="Type, edit, or tweak your SQL query here..."
                    className="flex-1 bg-transparent p-4 font-mono text-[13px] leading-[22px] text-slate-100 placeholder-slate-600 focus:outline-none resize-none overflow-auto selection:bg-indigo-600 selection:text-white"
                    style={{ tabSize: 2 }}
                  />
                </div>
              ) : (
                <div className="flex-1 relative bg-slate-950 p-4 font-mono text-[13px] leading-relaxed overflow-auto min-h-[500px] text-slate-100 selection:bg-indigo-600 selection:text-white">
                  <pre className="whitespace-pre">
                    {(editorSql || generatedSql).split('\n').map((line, idx) => (
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
              )}

              {/* Footer Status Bar */}
              <div className="border-t border-slate-800/80 bg-slate-950 px-4 py-2.5 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <div className="flex items-center gap-3">
                  <span>Dialect: PostgreSQL 15+</span>
                  <span>•</span>
                  <span>Mode: {parameterized ? 'PREPARED_STMT' : 'LITERAL_INJECTION'}</span>
                  <span>•</span>
                  <span>{editorSql.split('\n').length} lines</span>
                  <span>•</span>
                  <span>{editorSql.length} chars</span>
                </div>
                <div className="flex items-center gap-2">
                  {isCustomEdited ? (
                    <span className="text-amber-400 font-sans font-semibold flex items-center gap-1">
                      <Pencil className="w-3 h-3" /> Custom Tweaks Active
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="text-slate-400">Query Validated</span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

        </div>
      </main>

      {/* =========================================================
          SAVE AS SCRIPT / WRITE NEW SCRIPT MODAL
      ========================================================= */}
      {isScriptModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-2.5">
                <BookmarkPlus className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white font-heading">
                  {modalMode === 'create' ? 'Write New Custom Script' : 'Save as Custom Script'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsScriptModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveScriptSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Script Title *
                </label>
                <input
                  type="text"
                  required
                  value={scriptFormTitle}
                  onChange={(e) => setScriptFormTitle(e.target.value)}
                  placeholder="e.g. Remove the word 'the' from all live accounts"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Category
                  </label>
                  <select
                    value={scriptFormCategory}
                    onChange={(e) => setScriptFormCategory(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
                  >
                    <option value="Compliance">Compliance</option>
                    <option value="Trading">Trading</option>
                    <option value="Funds">Funds</option>
                    <option value="Risk">Risk</option>
                    <option value="Security">Security</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Target Tables
                  </label>
                  <input
                    type="text"
                    value={scriptFormTables}
                    onChange={(e) => setScriptFormTables(e.target.value)}
                    placeholder="TradingAccount, Order"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={scriptFormDescription}
                  onChange={(e) => setScriptFormDescription(e.target.value)}
                  placeholder="What does this query investigate, audit, or remediate?"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsScriptModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm shadow-md transition-all active:scale-95 flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Script</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {scriptSaveToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2.5 text-sm font-semibold animate-in fade-in slide-in-from-bottom-3 duration-200">
          <Check className="w-4 h-4" />
          <span>{scriptSaveToast}</span>
        </div>
      )}
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
