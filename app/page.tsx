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
  Info,
  X,
  Zap,
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
  Pencil,
  Play,
  Loader2,
  Wifi,
  WifiOff,
  Table,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Server,
  Cloud,
  Upload,
  FileCode,
  Lock,
  RefreshCw
} from 'lucide-react';
import { 
  QUERY_TEMPLATES, 
  QueryTemplate, 
  UserCustomScript, 
  QueryStatementType,
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
  const [activeCaseId, setActiveCaseId] = useState<string>('');
  const [searchReason, setSearchReason] = useState<string>('');
  const [parameterized, setParameterized] = useState<boolean>(false);

  // UI States
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // User Custom Scripts state (persisted in localStorage)
  const [savedCustomScripts, setSavedCustomScripts] = useState<UserCustomScript[]>([]);

  // SQL Editor States
  const [editorSql, setEditorSql] = useState<string>('BEGIN;\n\n-- Write the query here\n\nROLLBACK;\n');
  const [isCustomEdited, setIsCustomEdited] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor');

  // Left Panel Explorer States
  const [tableSearchQuery, setTableSearchQuery] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  // Dump SQL File States (Populate DB directly from .sql file - Zero-Memory OOM Safe)
  const dumpFileInputRef = useRef<HTMLInputElement>(null);
  const [isDumpModalOpen, setIsDumpModalOpen] = useState<boolean>(false);
  const [selectedDumpFile, setSelectedDumpFile] = useState<File | null>(null);
  const [localDumpPathInput, setLocalDumpPathInput] = useState<string>('');
  const [dumpFileMeta, setDumpFileMeta] = useState<{
    name: string;
    size: string;
    sizeBytes: number;
    preview: string;
    isLargeFile?: boolean;
  } | null>(null);
  const [isPopulatingDb, setIsPopulatingDb] = useState<boolean>(false);
  const [dumpResultStatus, setDumpResultStatus] = useState<{
    success?: boolean;
    message?: string;
    tablesCount?: number;
    durationMs?: number;
    output?: string;
  } | null>(null);

  // PostgreSQL Database Connection States
  const [activeConnUrl, setActiveConnUrl] = useState<string>('');
  const [dbHealth, setDbHealth] = useState<{
    connected: boolean;
    database?: string;
    version?: string;
    host?: string;
    provider?: string;
    maskedUrl?: string;
    latencyMs?: number;
    tables?: Array<{ name: string; count: string }>;
    error?: string;
  }>({ connected: false });
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(true);
  const [isConnModalOpen, setIsConnModalOpen] = useState<boolean>(false);
  const [inputConnUrl, setInputConnUrl] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [savedDatabases, setSavedDatabases] = useState<Array<{
    id: string;
    name: string;
    url: string;
    provider: string;
    lastConnected: string;
  }>>([]);
  const [connTestStatus, setConnTestStatus] = useState<{
    testing: boolean;
    success?: boolean;
    message?: string;
    latencyMs?: number;
  }>({ testing: false });
  const [isSavingConn, setIsSavingConn] = useState<boolean>(false);

  // Query Execution States
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [execElapsed, setExecElapsed] = useState<number>(0);
  const [queryResult, setQueryResult] = useState<{
    success: boolean;
    command?: string;
    columns?: Array<{ name: string; dataTypeID?: number }>;
    rows?: Array<Record<string, any>>;
    rowCount?: number;
    executionTimeMs?: number;
    error?: string;
    code?: string;
    position?: number;
    detail?: string;
    hint?: string;
    executedAt?: string;
  } | null>(null);

  // Results Viewport Filtering & Sorting
  const [resultSearchQuery, setResultSearchQuery] = useState<string>('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [rowsPerPage, setRowsPerPage] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [copiedResultJson, setCopiedResultJson] = useState<boolean>(false);
  const [tableBoxHeight, setTableBoxHeight] = useState<'standard' | 'tall'>('standard');

  // Timer Ref
  const execTimerRef = useRef<NodeJS.Timeout | null>(null);

  /*
  // Find & Replace States (Commented out)
  const [showFindReplace, setShowFindReplace] = useState<boolean>(false);
  const [findText, setFindText] = useState<string>('');
  const [replaceText, setReplaceText] = useState<string>('');
  const [findStatus, setFindStatus] = useState<string>('');
  */

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

    // Load saved database connection string for serverless (Vercel) persistence
    try {
      const savedConn = localStorage.getItem('que_me_db_connection_url');
      if (savedConn && savedConn.trim()) {
        setActiveConnUrl(savedConn.trim());
        setInputConnUrl(savedConn.trim());
      }
    } catch {
      // ignore
    }

    // Load recent / saved database connections for quick switching directly on web
    try {
      const storedDbs = localStorage.getItem('que_me_saved_databases');
      if (storedDbs) {
        const parsed = JSON.parse(storedDbs);
        if (Array.isArray(parsed)) {
          setSavedDatabases(parsed);
        }
      }
    } catch {
      // ignore
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
      setActiveCaseId('');
    }
    if (params.get('dateMode') === 'single' || params.get('dateMode') === 'range') {
      setDateMode(params.get('dateMode') as 'single' | 'range');
    }
    setStartDate(params.get('from') || last7DaysStr);
    setEndDate(params.get('to') || todayStr);
    if (params.get('mode') === 'param') setParameterized(true);
    if (params.get('mode') === 'injected') setParameterized(false);
  }, []);


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
  // Active Template / Custom Script Resolution
  // -------------------------------------------------------------
  const activeUserScript = useMemo(() => {
    return savedCustomScripts.find((s) => s.id === activeCaseId) || null;
  }, [savedCustomScripts, activeCaseId]);

  const activeTemplate = useMemo(() => {
    if (!activeCaseId || activeUserScript) return null;
    return QUERY_TEMPLATES.find((t) => t.id === activeCaseId) || null;
  }, [activeCaseId, activeUserScript]);

  // Helper to ensure every query has editable BEGIN; and ROLLBACK;
  const wrapWithTransaction = (sqlText: string): string => {
    const trimmed = (sqlText || '').trim();
    if (!trimmed || trimmed === '-- Write the query here') {
      return 'BEGIN;\n\n-- Write the query here\n\nROLLBACK;\n';
    }
    const upper = trimmed.toUpperCase();
    if (upper.startsWith('BEGIN;') && upper.includes('ROLLBACK;')) {
      return `${trimmed}\n`;
    }
    return `BEGIN;\n\n${trimmed}\n\nROLLBACK;\n`;
  };

  const { generatedSql, currentMetadata } = useMemo(() => {
    if (activeUserScript) {
      let sql = activeUserScript.sql;
      if (!parameterized && loginId) {
        sql = sql.replace(/:loginId\b/g, loginId);
      }
      return {
        generatedSql: wrapWithTransaction(sql),
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

    if (!activeTemplate) {
      return { generatedSql: 'BEGIN;\n\n-- Write the query here\n\nROLLBACK;\n', currentMetadata: null };
    }

    const sql = activeTemplate.generateSql({
      loginId,
      dateMode,
      startDate,
      endDate,
      parameterized
    });

    return {
      generatedSql: wrapWithTransaction(sql),
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
  }, [activeTemplate, activeUserScript, loginId, dateMode, startDate, endDate, parameterized]);

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

  // Check Database health on load (supports local env or client-persisted connection for Vercel)
  const fetchDbHealth = async (overrideUrl?: string) => {
    setIsCheckingHealth(true);
    const connToTest = overrideUrl || activeConnUrl || (typeof window !== 'undefined' ? localStorage.getItem('que_me_db_connection_url') : null) || undefined;
    try {
      const url = connToTest ? `/api/db/health?testConn=${encodeURIComponent(connToTest)}` : '/api/db/health';
      const res = await fetch(url);
      const data = await res.json();
      setDbHealth(data);
      if (data.maskedUrl && !inputConnUrl) {
        setInputConnUrl(data.maskedUrl.includes('••••••') ? '' : data.maskedUrl);
      }
    } catch {
      setDbHealth({ connected: false, tables: [], error: 'Failed to contact database health endpoint' });
    } finally {
      setIsCheckingHealth(false);
    }
  };

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('que_me_db_connection_url') : null;
    fetchDbHealth(saved || undefined);
  }, []);

  const startExecTimer = () => {
    const startTime = Date.now();
    setExecElapsed(0);
    if (execTimerRef.current) clearInterval(execTimerRef.current);
    execTimerRef.current = setInterval(() => {
      setExecElapsed(Number(((Date.now() - startTime) / 1000).toFixed(1)));
    }, 100);
  };

  const stopExecTimer = () => {
    if (execTimerRef.current) {
      clearInterval(execTimerRef.current);
      execTimerRef.current = null;
    }
  };

  // Run SQL Query (User has full editable control over BEGIN; ... ROLLBACK; transaction block)
  const handleExecuteQuery = async () => {
    if (isExecuting) return;
    const userSql = (editorSql || generatedSql || '').trim();
    if (!userSql || userSql === '-- Write the query here' || userSql === 'BEGIN;\n\n-- Write the query here\n\nROLLBACK;') return;

    if (!dbHealth.connected) {
      setIsConnModalOpen(true);
      return;
    }

    // Pass query directly as edited by the user
    const sqlToRun = userSql;
    const connToSend = activeConnUrl || (typeof window !== 'undefined' ? localStorage.getItem('que_me_db_connection_url') : null) || undefined;

    setIsExecuting(true);
    startExecTimer();

    try {
      const res = await fetch('/api/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: sqlToRun,
          connectionString: connToSend
        })
      });
      const data = await res.json();
      setQueryResult({
        ...data,
        executedAt: new Date().toLocaleTimeString()
      });
      setCurrentPage(1);
      setResultSearchQuery('');
      setSortColumn(null);
    } catch (err: any) {
      setQueryResult({
        success: false,
        error: err.message || 'Network error executing query.',
        executedAt: new Date().toLocaleTimeString()
      });
    } finally {
      stopExecTimer();
      setIsExecuting(false);
    }
  };

  // Table selection from Explorer -> Write query in editor with editable BEGIN; and ROLLBACK;
  const handleSelectTable = (tableName: string) => {
    setSelectedTable(tableName);
    const sql = `BEGIN;\n\nSELECT * FROM "${tableName}" LIMIT 50;\n\nROLLBACK;\n`;
    setEditorSql(sql);
    setIsCustomEdited(true);
  };

  // Filtered tables list from Neon DB
  const filteredTables = useMemo(() => {
    if (!dbHealth.connected || !dbHealth.tables) return [];
    if (!tableSearchQuery.trim()) return dbHealth.tables;
    const q = tableSearchQuery.toLowerCase();
    return dbHealth.tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [dbHealth.connected, dbHealth.tables, tableSearchQuery]);

  // Handle selecting a .sql dump file to populate Neon DB (Zero-Memory OOM Safe)
  const handleDumpFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formatSize = (bytes: number) => {
      if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
      if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
      if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return bytes + ' B';
    };

    try {
      // CRITICAL: NEVER call reader.readAsText(file) on large dumps!
      // Read ONLY first 4KB as preview to preserve browser memory and prevent renderer OOM crash
      const previewSlice = file.slice(0, 4096);
      const previewText = await previewSlice.text();
      const previewLines = previewText.split('\n').slice(0, 15).join('\n');

      setSelectedDumpFile(file);
      setLocalDumpPathInput('');
      setDumpFileMeta({
        name: file.name,
        size: formatSize(file.size),
        sizeBytes: file.size,
        preview: previewLines,
        isLargeFile: file.size > 10 * 1024 * 1024
      });
      setDumpResultStatus(null);
      setIsDumpModalOpen(true);
    } catch (err: any) {
      console.error('Failed to read dump file preview:', err);
    } finally {
      e.target.value = '';
    }
  };

  // Populate Neon DB with the chosen .sql dump file
  const handlePopulateDatabaseWithDump = async () => {
    if ((!selectedDumpFile && !localDumpPathInput.trim()) || isPopulatingDb) return;

    if (!dbHealth.connected) {
      setIsConnModalOpen(true);
      return;
    }

    setIsPopulatingDb(true);
    setDumpResultStatus(null);

    try {
      const formData = new FormData();
      if (selectedDumpFile) {
        formData.append('dumpFile', selectedDumpFile);
      }
      if (localDumpPathInput.trim()) {
        formData.append('localFilePath', localDumpPathInput.trim());
      }
      const connToSend = activeConnUrl || (typeof window !== 'undefined' ? localStorage.getItem('que_me_db_connection_url') : null) || undefined;
      if (connToSend) {
        formData.append('connectionString', connToSend);
      }

      const res = await fetch('/api/query/execute', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        setDumpResultStatus({
          success: true,
          message: data.message || 'Database successfully populated with tables and rows!',
          tablesCount: data.tables?.length || 0,
          durationMs: data.durationMs || data.executionTimeMs,
          output: data.output
        });
        if (data.tables) {
          setDbHealth((prev) => ({ ...prev, tables: data.tables }));
        }
        await fetchDbHealth();
        setScriptSaveToast(`Database populated! ${data.tables?.length || ''} tables loaded.`);
        setTimeout(() => setScriptSaveToast(''), 4000);
      } else {
        setDumpResultStatus({
          success: false,
          message: data.error || 'Failed to populate database with SQL dump.'
        });
      }
    } catch (err: any) {
      setDumpResultStatus({
        success: false,
        message: err.message || 'Network error while executing dump against Neon DB.'
      });
    } finally {
      setIsPopulatingDb(false);
    }
  };

  // Global Ctrl+Enter shortcut listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleExecuteQuery();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [editorSql, generatedSql, dbHealth.connected, isExecuting]);

  // Connection Management Handlers
  const handleTestConnection = async () => {
    if (!inputConnUrl.trim()) return;
    setConnTestStatus({ testing: true });
    try {
      const res = await fetch(`/api/db/health?testConn=${encodeURIComponent(inputConnUrl.trim())}`);
      const data = await res.json();
      if (data.connected) {
        setConnTestStatus({
          testing: false,
          success: true,
          message: `Connected to "${data.database}" (${data.version}) in ${data.latencyMs}ms`,
          latencyMs: data.latencyMs
        });
      } else {
        setConnTestStatus({
          testing: false,
          success: false,
          message: data.error || 'Connection failed. Please check credentials.'
        });
      }
    } catch (err: any) {
      setConnTestStatus({
        testing: false,
        success: false,
        message: err.message || 'Connection test request failed.'
      });
    }
  };

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputConnUrl.trim()) return;
    setIsSavingConn(true);
    try {
      const res = await fetch('/api/db/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: inputConnUrl.trim() })
      });
      const data = await res.json();
      if (data.success) {
        const savedUrl = inputConnUrl.trim();
        setActiveConnUrl(savedUrl);
        try {
          localStorage.setItem('que_me_db_connection_url', savedUrl);
        } catch {
          // ignore
        }
        const newDbEntry = {
          id: String(Date.now()),
          name: data.database || 'PostgreSQL DB',
          url: savedUrl,
          provider: data.provider || 'PostgreSQL',
          lastConnected: new Date().toLocaleDateString()
        };
        setSavedDatabases((prev) => {
          const filtered = prev.filter((d) => d.url !== savedUrl);
          const updated = [newDbEntry, ...filtered].slice(0, 10);
          try {
            localStorage.setItem('que_me_saved_databases', JSON.stringify(updated));
          } catch {}
          return updated;
        });

        setDbHealth({
          connected: true,
          database: data.database,
          version: data.version,
          host: data.host,
          provider: data.provider,
          maskedUrl: data.maskedUrl,
          latencyMs: data.latencyMs,
          tables: data.tables || []
        });
        setIsConnModalOpen(false);
        setScriptSaveToast(`Connected to "${data.database}"! Loaded ${data.tables?.length || 0} tables.`);
        setTimeout(() => setScriptSaveToast(''), 3000);
      } else {
        setConnTestStatus({
          testing: false,
          success: false,
          message: data.error || 'Could not save connection.'
        });
      }
    } catch (err: any) {
      setConnTestStatus({
        testing: false,
        success: false,
        message: err.message || 'Failed to save connection.'
      });
    } finally {
      setIsSavingConn(false);
    }
  };

  const handleSwitchDatabase = async (targetUrl: string) => {
    if (!targetUrl.trim() || isSavingConn) return;
    setInputConnUrl(targetUrl.trim());
    setIsSavingConn(true);
    setConnTestStatus({ testing: true, message: 'Switching active database...' });
    try {
      const res = await fetch('/api/db/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: targetUrl.trim() })
      });
      const data = await res.json();
      if (data.success) {
        const savedUrl = targetUrl.trim();
        setActiveConnUrl(savedUrl);
        try {
          localStorage.setItem('que_me_db_connection_url', savedUrl);
        } catch {}

        const newDbEntry = {
          id: String(Date.now()),
          name: data.database || 'PostgreSQL DB',
          url: savedUrl,
          provider: data.provider || 'PostgreSQL',
          lastConnected: new Date().toLocaleDateString()
        };
        setSavedDatabases((prev) => {
          const filtered = prev.filter((d) => d.url !== savedUrl);
          const updated = [newDbEntry, ...filtered].slice(0, 10);
          try {
            localStorage.setItem('que_me_saved_databases', JSON.stringify(updated));
          } catch {}
          return updated;
        });

        setDbHealth({
          connected: true,
          database: data.database,
          version: data.version,
          host: data.host,
          provider: data.provider,
          maskedUrl: data.maskedUrl,
          latencyMs: data.latencyMs,
          tables: data.tables || []
        });
        setSelectedTable(null);
        setQueryResult(null);
        setIsConnModalOpen(false);
        setScriptSaveToast(`Switched to "${data.database}"! Loaded ${data.tables?.length || 0} tables.`);
        setTimeout(() => setScriptSaveToast(''), 3000);
      } else {
        setConnTestStatus({
          testing: false,
          success: false,
          message: data.error || 'Could not switch to selected database.'
        });
      }
    } catch (err: any) {
      setConnTestStatus({
        testing: false,
        success: false,
        message: err.message || 'Failed to switch database.'
      });
    } finally {
      setIsSavingConn(false);
    }
  };

  const handleRemoveSavedDb = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSavedDatabases((prev) => {
      const updated = prev.filter((d) => d.id !== id);
      try {
        localStorage.setItem('que_me_saved_databases', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleDisconnect = async () => {
    try {
      setActiveConnUrl('');
      try {
        localStorage.removeItem('que_me_db_connection_url');
      } catch {
        // ignore
      }
      await fetch('/api/db/config', { method: 'DELETE' });
      setDbHealth({ connected: false, tables: [] });
      setSelectedTable(null);
      setInputConnUrl('');
      setConnTestStatus({ testing: false });
      setIsConnModalOpen(false);
      setScriptSaveToast('Disconnected from PostgreSQL database.');
      setTimeout(() => setScriptSaveToast(''), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  // CSV Export & Copy Handlers
  const handleDownloadCsv = () => {
    if (!queryResult || !queryResult.rows || queryResult.rows.length === 0) return;
    const cols = queryResult.columns?.map((c) => c.name) || Object.keys(queryResult.rows[0]);
    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerRow = cols.join(',');
    const bodyRows = queryResult.rows.map((row) => cols.map((c) => escapeCsv(row[c])).join(','));
    const csvContent = [headerRow, ...bodyRows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `query_result_${activeCaseId}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyResultJson = async () => {
    if (!queryResult || !queryResult.rows) return;
    await navigator.clipboard.writeText(JSON.stringify(queryResult.rows, null, 2));
    setCopiedResultJson(true);
    setTimeout(() => setCopiedResultJson(false), 2000);
  };

  // Results filtering and sorting
  const filteredAndSortedRows = useMemo(() => {
    if (!queryResult || !queryResult.rows) return [];
    let list = [...queryResult.rows];

    // Search filter across all columns
    if (resultSearchQuery.trim()) {
      const q = resultSearchQuery.toLowerCase();
      list = list.filter((row) => {
        return Object.values(row).some((v) => {
          if (v === null || v === undefined) return false;
          return String(v).toLowerCase().includes(q);
        });
      });
    }

    // Column sort
    if (sortColumn) {
      list.sort((a, b) => {
        const valA = a[sortColumn];
        const valB = b[sortColumn];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }
        const strA = String(valA);
        const strB = String(valB);
        return sortDirection === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });
    }

    return list;
  }, [queryResult, resultSearchQuery, sortColumn, sortDirection]);

  const paginatedRows = useMemo(() => {
    if (rowsPerPage === 0) return filteredAndSortedRows;
    const start = (currentPage - 1) * rowsPerPage;
    return filteredAndSortedRows.slice(start, start + rowsPerPage);
  }, [filteredAndSortedRows, currentPage, rowsPerPage]);

  const totalPages = rowsPerPage === 0 ? 1 : Math.ceil(filteredAndSortedRows.length / rowsPerPage);

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
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecuteQuery();
    /*
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setShowFindReplace((prev) => !prev);
    */
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      handleOpenSaveAsScript();
    }
  };

  const handleRevertSql = () => {
    setEditorSql(generatedSql);
    setIsCustomEdited(false);
  };

  /*
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
  */

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
      setScriptFormDescription('Custom SQL diagnostic script.');
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
    const userSql = (editorSql || generatedSql || '').trim();
    await navigator.clipboard.writeText(userSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleDownloadSql = () => {
    const userSql = (editorSql || generatedSql || '').trim();
    const caseName = activeCaseId || 'custom_query';
    const filename = `Que_Me_${caseName}_${Date.now()}.sql`;
    const blob = new Blob([userSql], { type: 'text/sql;charset=utf-8;' });
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
    setActiveCaseId('');
    setEditorSql('BEGIN;\n\n-- Write the query here\n\nROLLBACK;\n');
    setSearchReason('');
    setParameterized(false);
    setIsDropdownOpen(false);
    setIsCustomEdited(false);
    setSelectedTable(null);
    setTableSearchQuery('');
    setDumpFileMeta(null);
    setSelectedDumpFile(null);
    setLocalDumpPathInput('');
    setDumpResultStatus(null);
    setTableBoxHeight('standard');
    // setShowFindReplace(false);
    setViewMode('editor');

    setIsResetting(true);
    setTimeout(() => setIsResetting(false), 1200);
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
        return <Terminal className="w-4 h-4 text-cyan-400" />;
    }
  };


  return (
    <div className="flex flex-col min-h-screen">
      {/* -------------------------------------------------------------
          TOP BAR: INTEGRATED STUDIO CONTROLS
      ------------------------------------------------------------- */}
      <header 
        style={{ minHeight: '76px', paddingTop: '4px', paddingBottom: '4px' }}
        className="border-b border-slate-800 bg-slate-900/95 backdrop-blur sticky top-0 z-40 w-full px-3.5 sm:px-6 xl:px-8 py-2.5 flex flex-col justify-center shadow-lg"
      >
        <div className="w-full flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          
          {/* Brand Logo & Studio Identity */}
          <div className="flex items-center justify-between sm:justify-start gap-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-bold text-sm sm:text-base">
                Q
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-heading font-bold text-lg sm:text-xl tracking-wide bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                    Que_Me
                  </span>
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                    Studio
                  </span>
                </div>
              </div>
            </div>

            {/* PostgreSQL DB Connection Pill & Direct Web Switcher */}
            <button
              type="button"
              onClick={() => setIsConnModalOpen(true)}
              className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-mono border transition-all shadow-sm group ${
                isCheckingHealth
                  ? 'bg-slate-950/70 border-slate-700 text-slate-400'
                  : dbHealth.connected
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400 hover:border-emerald-400 hover:bg-emerald-950/60'
                  : 'bg-rose-950/30 border-rose-500/30 text-rose-300 hover:border-rose-400 hover:bg-rose-950/50'
              }`}
              title="Change database URL"
            >
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${
                  isCheckingHealth
                    ? 'bg-slate-500 animate-ping'
                    : dbHealth.connected
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-rose-400'
                }`} />
                <Database className="w-3.5 h-3.5 opacity-80" />
              </div>
              <div className="flex items-center gap-1.5 text-left">
                <span className="font-semibold text-[11px] sm:text-xs">
                  {isCheckingHealth ? 'Checking...' : dbHealth.connected ? (dbHealth.provider ? `${dbHealth.provider.replace(' PostgreSQL', '')}: ${dbHealth.database}` : (dbHealth.database || 'PostgreSQL')) : 'No DB Connected'}
                </span>
                {dbHealth.connected && dbHealth.latencyMs !== undefined && (
                  <span className="text-[10px] text-emerald-500/80 hidden md:inline">
                    • {dbHealth.latencyMs}ms
                  </span>
                )}
                <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 group-hover:bg-indigo-500/30 transition-colors ml-1">
                  Change DB
                </span>
              </div>
            </button>
          </div>

          {/* Right Controls Bar: Use Case Dropdown Combobox + Actions */}
          <div className="flex items-center gap-2.5 sm:gap-3 flex-1 max-w-full md:max-w-2xl lg:max-w-3xl ml-0 md:ml-4">

            {/* 3. Reason / Use Case Dropdown */}
            <div className="relative w-full sm:w-auto min-w-0 sm:min-w-[340px] md:min-w-[440px] lg:min-w-[500px] max-w-full sm:max-w-[620px] flex-1" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full bg-slate-950 border border-slate-700/80 hover:border-slate-600 rounded-xl px-3.5 sm:px-4 py-2.5 text-sm text-left flex items-center justify-between text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors shadow-sm group"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">Use Case:</span>
                  {activeUserScript ? (
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
                    <span className="text-slate-400">Select a use case...</span>
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
                    {/* Action Header: Write New Script */}
                    <div className="p-2 bg-slate-950/60">
                      <div
                        onClick={() => {
                          setIsDropdownOpen(false);
                          handleOpenCreateNewScript();
                        }}
                        className="w-full px-3 py-2 rounded-lg hover:bg-emerald-900/40 cursor-pointer transition-colors flex items-center justify-center gap-2 border border-emerald-900/40 bg-emerald-950/30 text-emerald-300 font-semibold text-xs"
                      >
                        <Plus className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Write New Script</span>
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
                        No preset templates match "{searchReason}".
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* 3b. Quick "+ New Script" button */}
              <button
                type="button"
                onClick={handleOpenCreateNewScript}
                className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 hover:border-emerald-500 text-emerald-400 hover:text-emerald-300 text-xs font-semibold hover:bg-slate-800 transition-all shadow-sm active:scale-95 shrink-0"
                title="Write a new custom SQL script from scratch"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="inline">New Script</span>
              </button>

              {/* 4. Reset to Default Button */}
              <button
                type="button"
                onClick={handleResetAll}
                className="flex items-center gap-2 px-3 sm:px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 hover:border-slate-500 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold transition-all shadow-sm active:scale-95 shrink-0 group"
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
        </div>
      </header>

      {/* -------------------------------------------------------------
          MAIN APPLICATION VIEWPORT
      ------------------------------------------------------------- */}
      <main className="flex-1 w-full max-w-[1920px] mx-auto px-3.5 sm:px-6 py-3.5 sm:py-4 flex flex-col">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-stretch">
          
          {/* =========================================================
              LEFT PANEL: TABLES EXPLORER & DUMP CONTEXT / USE CASE GUIDE
          ========================================================= */}
          <div className="lg:col-span-4 xl:col-span-4 flex flex-col">
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col h-[580px] sm:h-[640px] lg:h-[calc(100vh-130px)] lg:max-h-[820px]">
              
              {/* Header / Toolbar Panel: ONLY Dump SQL File */}
              <div className="border-b border-slate-800 bg-slate-950/80 px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400">
                    <Table className="w-4 h-4" />
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Database Tables
                  </span>
                  {dbHealth.connected && dbHealth.tables && dbHealth.tables.length > 0 && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold">
                      {dbHealth.tables.length}
                    </span>
                  )}
                </div>

                {/* Only this one thing for the toolbar: Dump SQL File */}
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={dumpFileInputRef}
                    onChange={handleDumpFileSelected}
                    accept=".sql,.dump,.txt"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!dbHealth.connected) {
                        setIsConnModalOpen(true);
                      } else {
                        dumpFileInputRef.current?.click();
                      }
                    }}
                    disabled={isPopulatingDb}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-md shadow-indigo-950/40 transition-all active:scale-95 disabled:opacity-50"
                    title="Upload and execute a .sql dump file to populate PostgreSQL database"
                  >
                    {isPopulatingDb ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-white" />
                    )}
                    <span>{isPopulatingDb ? 'Populating...' : 'Dump SQL File'}</span>
                  </button>
                </div>
              </div>

              {/* Panel Content: Tables Explorer */}
              <div className="flex-1 min-h-0 flex flex-col p-3 sm:p-4 overflow-hidden">
                  {dbHealth.connected && dbHealth.tables && dbHealth.tables.length > 0 ? (
                    <div className="flex-1 min-h-0 flex flex-col">
                      {/* Search Tables Filter Bar */}
                      <div className="relative mb-2.5 shrink-0">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                        <input
                          type="text"
                          value={tableSearchQuery}
                          onChange={(e) => setTableSearchQuery(e.target.value)}
                          placeholder="Search database tables..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                        />
                        {tableSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setTableSearchQuery('')}
                            className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Sticky Sub-Header: Tables count & Est. Rows */}
                      <div className="px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-slate-500 flex items-center justify-between shrink-0 mb-1 border-b border-slate-800/60 pb-1.5">
                        <span>Tables ({filteredTables.length})</span>
                        <span>Est. Rows</span>
                      </div>

                      {/* Tables List: Dedicated scrollable viewport with its own scrollbar */}
                      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1.5 custom-scrollbar">
                        {filteredTables.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-500">
                            No tables matching "{tableSearchQuery}".
                          </div>
                        ) : (
                          filteredTables.map((tbl) => {
                            const isSelected = selectedTable === tbl.name;
                            return (
                              <div
                                key={tbl.name}
                                onClick={() => handleSelectTable(tbl.name)}
                                className={`w-full px-3 py-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                                  isSelected
                                    ? 'bg-indigo-950/70 border-indigo-500/50 shadow-sm'
                                    : 'bg-slate-950/60 hover:bg-slate-800/80 border-slate-800/80 hover:border-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 mr-2">
                                  <div className={`p-1.5 rounded-lg shrink-0 ${
                                    isSelected
                                      ? 'bg-indigo-600/30 text-indigo-300'
                                      : 'bg-slate-900 text-slate-400 group-hover:text-indigo-400'
                                  }`}>
                                    <Table className="w-3.5 h-3.5" />
                                  </div>
                                  <span className={`font-mono text-xs truncate ${
                                    isSelected ? 'text-white font-bold' : 'text-slate-200 group-hover:text-white'
                                  }`}>
                                    {tbl.name}
                                  </span>
                                </div>
                                <div className="shrink-0 flex items-center gap-1.5">
                                  <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-400 font-semibold group-hover:text-emerald-400 group-hover:border-emerald-500/30">
                                    {tbl.count}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : !dbHealth.connected ? (
                    /* NOT CONNECTED STATE: Per user prompt, tables are NOT loaded when disconnected */
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center my-auto">
                      <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 mb-3.5">
                        <WifiOff className="w-7 h-7" />
                      </div>
                      <h4 className="text-sm sm:text-base font-bold text-white font-heading mb-1.5">
                        No Tables Loaded
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed max-w-xs mb-4">
                        Database tables are fetched dynamically from your connected PostgreSQL database. Connect any database (Neon, Supabase, RDS, Localhost) to explore tables.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsConnModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
                      >
                        <Database className="w-4 h-4" />
                        <span>Connect PostgreSQL Database</span>
                      </button>
                    </div>
                  ) : (
                    /* CONNECTED BUT 0 TABLES */
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center my-auto">
                      <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
                        <Upload className="w-6 h-6" />
                      </div>
                      <h4 className="text-xs sm:text-sm font-semibold text-slate-200 mb-1">
                        Ready for SQL Dump
                      </h4>
                      <p className="text-xs text-slate-400 max-w-xs mb-3">
                        Connected to <span className="text-emerald-400 font-mono">{dbHealth.database}</span>. Click "Dump SQL File" above to populate this database with your tables and rows.
                      </p>
                      <button
                        type="button"
                        onClick={() => dumpFileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all active:scale-95"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Select .sql Dump File</span>
                      </button>
                    </div>
                  )}
                </div>

            </div>
          </div>

          {/* =========================================================
              RIGHT PANEL: TWO-TIER STACKED LAYOUT
              TOP CARD: SELECTED TABLES WRITE A QUERY (SQL EDITOR)
              BOTTOM CARD: DEDICATED RESULT BOX (LIVE RESULTS)
          ========================================================= */}
          <div className="lg:col-span-8 xl:col-span-8 flex flex-col gap-4">
            
            {/* -------------------------------------------------------
                TOP CARD: "Selected tables write a query" (SQL Editor)
            ------------------------------------------------------- */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col">
              
              {/* Header: Query Editor Actions & Statement Badge */}
              <div className="border-b border-slate-800 bg-slate-950/80 px-3.5 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 font-mono tracking-tight mr-1">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <span className="uppercase">Query Editor</span>
                  </div>
                  {selectedTable && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
                      table: {selectedTable}
                    </span>
                  )}
                  {renderStatementBadge(isCustomEdited ? getQueryStatementType(editorSql) : currentMetadata?.statementType)}

                  {/* Primary RUN QUERY Button */}
                  <button
                    type="button"
                    onClick={handleExecuteQuery}
                    disabled={isExecuting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-all shadow-md shadow-emerald-950/40 active:scale-95 shrink-0"
                    title="Execute query against Neon DB (Ctrl + Enter)"
                  >
                    {isExecuting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current text-white" />
                    )}
                    <span>{isExecuting ? `Running (${execElapsed}s)...` : 'Run Query'}</span>
                    <span className="hidden xl:inline text-[10px] opacity-75 font-mono ml-0.5"></span>
                  </button>

                  {/* Mode: Interactive Editor vs Syntax Preview */}
                  <div className="inline-flex rounded-lg p-0.5 bg-slate-900 border border-slate-800 text-xs shadow-inner">
                    <button
                      type="button"
                      onClick={() => setViewMode('editor')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                        viewMode === 'editor'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Interactive code editor with line numbers"
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

                  {/* Custom Edited Revert Button */}
                  {isCustomEdited && (
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                        <Pencil className="w-3 h-3" />
                        <span className="hidden sm:inline">Edited</span>
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
                </div>

                {/* Right side: Save Script, Copy, Download */}
                <div className="flex items-center gap-2 shrink-0">
                  {activeUserScript ? (
                    <button
                      type="button"
                      onClick={handleUpdateCurrentScript}
                      disabled={!isCustomEdited}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white transition-colors shadow-sm active:scale-95"
                      title="Save modifications to this script"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Save Changes</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleOpenSaveAsScript}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition-all shadow-sm active:scale-95"
                      title="Save as custom reusable script"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Save Script</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-sm active:scale-95"
                  >
                    {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSql ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadSql}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                    title="Download as .sql file"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Editor / Preview Body with Fully Editable BEGIN; and ROLLBACK; */}
              <div className="flex flex-col bg-slate-950 overflow-hidden">
                {/* Middle Editable / Preview Query Area (Expanded Vertical Height) */}
                {viewMode === 'editor' ? (
                  <div className="flex relative bg-slate-950 h-[480px] sm:h-[560px] lg:h-[620px] overflow-hidden">
                    {/* Line Numbers Gutter */}
                    <div
                      ref={lineNumbersRef}
                      className="select-none py-2 px-2 sm:px-3 text-right font-mono text-xs sm:text-[13px] leading-[22px] text-slate-600 bg-slate-950 border-r border-slate-800/70 shrink-0 overflow-hidden"
                      style={{ minWidth: '38px' }}
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
                        setIsCustomEdited(true);
                      }}
                      onScroll={handleScrollSync}
                      onKeyDown={handleEditorKeyDown}
                      spellCheck={false}
                      wrap="off"
                      placeholder="-- Write the query here"
                      className="flex-1 bg-transparent p-2 font-mono text-xs sm:text-[13px] leading-[22px] text-slate-100 placeholder-slate-600 focus:outline-none resize-none overflow-auto custom-scrollbar selection:bg-indigo-600 selection:text-white"
                      style={{ tabSize: 2 }}
                    />
                  </div>
                ) : (
                  <div className="relative bg-slate-950 p-2 font-mono text-xs sm:text-[13px] leading-relaxed overflow-auto custom-scrollbar h-[480px] sm:h-[560px] lg:h-[620px] text-slate-100 selection:bg-indigo-600 selection:text-white">
                    <pre className="whitespace-pre">
                      {(editorSql || 'BEGIN;\n\n-- Write the query here\n\nROLLBACK;\n').split('\n').map((line, idx) => (
                        <div key={idx} className="table-row">
                          <span className="table-cell select-none text-slate-600 pr-3 text-right text-xs" style={{ minWidth: '38px' }}>
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
              </div>

              {/* Editor Sub-Status Bar */}
              <div className="border-t border-slate-800/80 bg-slate-950 px-3.5 py-1.5 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-500 font-mono">
                <div className="flex items-center gap-2.5">
                  <span>{editorSql.split('\n').length} lines</span>
                  <span>•</span>
                  <span>{editorSql.length} chars</span>
                </div>
                {isCustomEdited ? (
                  <span className="text-amber-400 font-sans font-semibold flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> Custom Query
                  </span>
                ) : activeTemplate ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Preset Validated
                  </span>
                ) : (
                  <span className="text-slate-400 flex items-center gap-1">
                    <Terminal className="w-3 h-3 text-indigo-400" /> Ready to Edit
                  </span>
                )}
              </div>
            </div>

            {/* -------------------------------------------------------
                BOTTOM CARD: DEDICATED "RESULT BOX" (LIVE QUERY OUTPUT)
            ------------------------------------------------------- */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col">
              
              {/* Header: Result Box Title & Viewport Controls */}
              <div className="border-b border-slate-800 bg-slate-950/80 px-3.5 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 font-mono tracking-tight">
                    <Table className="w-4 h-4 text-emerald-400" />
                    <span>RESULT</span>
                  </div>
                  {queryResult && queryResult.success && (
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <span className="text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25">
                        {queryResult.rows ? queryResult.rows.length : (queryResult.rowCount || 0)} rows
                      </span>
                      {queryResult.executionTimeMs !== undefined && (
                        <span className="text-slate-400">
                          in {queryResult.executionTimeMs}ms
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Result Controls (Search Filter, Height Toggle, Page Size, CSV, JSON) */}
                {queryResult && queryResult.success && queryResult.rows && queryResult.rows.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Live Search Filter */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
                      <input
                        type="text"
                        value={resultSearchQuery}
                        onChange={(e) => {
                          setResultSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder="Search in results..."
                        className="bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-7 py-1 text-xs text-slate-200 placeholder-slate-500 w-28 sm:w-36 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                      {resultSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setResultSearchQuery('')}
                          className="absolute right-2 top-1.5 text-slate-500 hover:text-slate-300"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Table Box Height Selector: Standard vs Tall */}
                    <div className="hidden sm:flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[11px] font-mono">
                      <span className="text-slate-500 px-1 text-[10px] uppercase">Box:</span>
                      {(['standard', 'tall'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setTableBoxHeight(mode)}
                          className={`px-2 py-0.5 rounded text-[11px] capitalize transition-colors ${
                            tableBoxHeight === mode
                              ? 'bg-emerald-600 text-white font-semibold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title={`${mode.toUpperCase()} table box height with separate scrollbar`}
                        >
                          {mode === 'standard' ? 'Standard' : 'Tall'}
                        </button>
                      ))}
                    </div>

                    {/* Page Size Selector */}
                    <div className="hidden md:flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[11px] font-mono">
                      <span className="text-slate-500 px-1 text-[10px] uppercase">Page:</span>
                      {[50, 100, 250, 0].map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => {
                            setRowsPerPage(sz);
                            setCurrentPage(1);
                          }}
                          className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                            rowsPerPage === sz
                              ? 'bg-indigo-600 text-white font-semibold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {sz === 0 ? 'All' : sz}
                        </button>
                      ))}
                    </div>

                    {/* Download CSV */}
                    <button
                      type="button"
                      onClick={handleDownloadCsv}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white transition-colors text-xs"
                      title="Download results as CSV"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="hidden sm:inline">CSV</span>
                    </button>

                    {/* Copy JSON */}
                    <button
                      type="button"
                      onClick={handleCopyResultJson}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white transition-colors text-xs"
                      title="Copy result rows as JSON"
                    >
                      {copiedResultJson ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span className="hidden sm:inline">{copiedResultJson ? 'Copied' : 'JSON'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Result Box Body Content */}
              <div className="p-3 sm:p-4 flex flex-col bg-slate-950">
                {isExecuting ? (
                  /* State 1: Executing */
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 mb-4 animate-pulse">
                      <Loader2 className="w-7 h-7 animate-spin" />
                    </div>
                    <h4 className="text-base font-bold text-white font-heading mb-1">
                      Executing Query ...
                    </h4>
                    <p className="text-xs text-slate-400 max-w-sm mb-3">
                      Streaming uncapped result rows from your restored database.
                    </p>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 font-mono text-xs text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>Elapsed: {execElapsed}s</span>
                    </div>
                  </div>
                ) : !dbHealth.connected ? (
                  /* State 2: Disconnected */
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto max-w-md mx-auto">
                    <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 mb-4">
                      <WifiOff className="w-7 h-7" />
                    </div>
                    <h4 className="text-base font-bold text-white font-heading mb-1.5">
                      PostgreSQL Database Not Connected
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                      Connect your Database.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsConnModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
                    >
                      <Database className="w-4 h-4" />
                      <span>Connect PostgreSQL Database</span>
                    </button>
                  </div>
                ) : !queryResult ? (
                  /* State 3: Ready, No Query Executed Yet */
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto max-w-md mx-auto">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 mb-4">
                      <Play className="w-7 h-7 ml-0.5 fill-current" />
                    </div>
                    <h4 className="text-base font-bold text-white font-heading mb-1.5">
                      Ready to Execute
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                      Connected to <span className="text-emerald-400 font-mono">{dbHealth.database}</span>. Click "Run Query" or press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-slate-300">Ctrl + Enter</kbd> to execute this query live.
                    </p>
                    <button
                      type="button"
                      onClick={handleExecuteQuery}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Run Query Now</span>
                    </button>
                  </div>
                ) : !queryResult.success ? (
                  /* State 4: Query Failed */
                  <div className="my-auto max-w-xl mx-auto w-full">
                    <div className="bg-rose-950/40 border border-rose-800/80 rounded-2xl p-5 shadow-xl text-left">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                          <AlertCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-rose-200 font-mono uppercase tracking-wide">
                            PostgreSQL Execution Error
                          </h4>
                          {queryResult.code && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              Error Code: {queryResult.code}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="bg-slate-950/80 border border-rose-900/40 rounded-xl p-3.5 mb-3 font-mono text-xs text-rose-300 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                        {queryResult.error}
                      </div>

                      {queryResult.hint && (
                        <div className="text-xs text-slate-300 mb-3 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                          <span className="font-semibold text-amber-400">Hint: </span>
                          {queryResult.hint}
                        </div>
                      )}

                      {queryResult.detail && (
                        <div className="text-xs text-slate-400 mb-3 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                          <span className="font-semibold text-slate-300">Detail: </span>
                          {queryResult.detail}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-rose-900/30 text-xs">
                        <span className="text-slate-500 font-mono text-[11px]">
                          Failed in {queryResult.executionTimeMs}ms • {queryResult.executedAt}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : !queryResult.rows || queryResult.rows.length === 0 ? (
                  /* State 5: Mutation Success (0 rows returned) */
                  <div className="my-auto max-w-md mx-auto w-full text-center">
                    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 mx-auto mb-3">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <h4 className="text-base font-bold text-white font-heading mb-1">
                        Query Executed Successfully
                      </h4>
                      <p className="text-xs text-slate-400 mb-4">
                        Statement executed without returning row data.
                      </p>

                      <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono mb-2 text-left">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Command:</span>
                          <span className="text-slate-200 font-semibold">{queryResult.command}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Affected Rows:</span>
                          <span className="text-emerald-400 font-semibold">{queryResult.rowCount}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Duration:</span>
                          <span className="text-slate-200">{queryResult.executionTimeMs} ms</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Executed:</span>
                          <span className="text-slate-400">{queryResult.executedAt}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* State 6: Interactive Data Table Grid (Compact Box with Separate Scrollbar) */
                  <div className="flex flex-col min-h-0">
                    <div
                      className={`overflow-auto custom-scrollbar rounded-xl border border-slate-800 bg-slate-950/60 shadow-inner ${
                        tableBoxHeight === 'tall'
                          ? 'h-[480px] sm:h-[540px]'
                          : 'h-[360px] sm:h-[400px]'
                      }`}
                    >
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-300 font-mono text-[11px] uppercase tracking-wider z-10 shadow-sm">
                          <tr>
                            <th className="py-2.5 px-3 w-12 text-center text-slate-500 bg-slate-900 border-r border-slate-800/80 select-none sticky left-0 z-20">
                              #
                            </th>
                            {(queryResult.columns && queryResult.columns.length > 0
                              ? queryResult.columns.map((c) => c.name)
                              : Object.keys(queryResult.rows[0])
                            ).map((colName) => (
                              <th
                                key={colName}
                                onClick={() => {
                                  if (sortColumn === colName) {
                                    if (sortDirection === 'asc') setSortDirection('desc');
                                    else setSortColumn(null);
                                  } else {
                                    setSortColumn(colName);
                                    setSortDirection('asc');
                                  }
                                }}
                                className="py-2.5 px-3.5 hover:bg-slate-800/80 cursor-pointer select-none transition-colors border-r border-slate-800/60 group"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className={sortColumn === colName ? 'text-indigo-400 font-bold' : ''}>
                                    {colName}
                                  </span>
                                  <span className="text-slate-500 group-hover:text-slate-300">
                                    {sortColumn === colName ? (
                                      sortDirection === 'asc' ? (
                                        <ArrowUp className="w-3 h-3 text-indigo-400" />
                                      ) : (
                                        <ArrowDown className="w-3 h-3 text-indigo-400" />
                                      )
                                    ) : (
                                      <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100" />
                                    )}
                                  </span>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[12px]">
                          {paginatedRows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={
                                  (queryResult.columns?.length || Object.keys(queryResult.rows[0]).length) + 1
                                }
                                className="py-8 text-center text-slate-500 italic"
                              >
                                No rows match "{resultSearchQuery}".
                              </td>
                            </tr>
                          ) : (
                            paginatedRows.map((row, rowIdx) => {
                              const absoluteIdx = (currentPage - 1) * (rowsPerPage || paginatedRows.length) + rowIdx + 1;
                              const cols =
                                queryResult.columns && queryResult.columns.length > 0
                                  ? queryResult.columns.map((c) => c.name)
                                  : Object.keys(queryResult.rows![0]);

                              return (
                                <tr
                                  key={rowIdx}
                                  className="odd:bg-slate-950 even:bg-slate-900/30 hover:bg-indigo-950/30 transition-colors"
                                >
                                  <td className="py-2 px-3 text-center text-[10px] text-slate-600 bg-slate-950/50 border-r border-slate-800/60 select-none">
                                    {absoluteIdx}
                                  </td>
                                  {cols.map((col) => {
                                    const val = row[col];
                                    return (
                                      <td
                                        key={col}
                                        className="py-2 px-3.5 border-r border-slate-800/40 text-slate-200 truncate max-w-[280px]"
                                        title={val !== null && val !== undefined ? String(val) : 'NULL'}
                                      >
                                        {val === null || val === undefined ? (
                                          <span className="text-slate-600 italic text-[11px]">NULL</span>
                                        ) : typeof val === 'boolean' ? (
                                          <span
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                              val
                                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                            }`}
                                          >
                                            {String(val)}
                                          </span>
                                        ) : typeof val === 'object' ? (
                                          <span className="text-cyan-300 text-xs">
                                            {JSON.stringify(val)}
                                          </span>
                                        ) : typeof val === 'number' ? (
                                          <span className="text-emerald-300 font-semibold">
                                            {val}
                                          </span>
                                        ) : (
                                          <span>{String(val)}</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Navigation */}
                    {rowsPerPage > 0 && totalPages > 1 && (
                      <div className="pt-2.5 flex items-center justify-between text-xs text-slate-400 font-mono shrink-0">
                        <div>
                          Showing {(currentPage - 1) * rowsPerPage + 1} to{' '}
                          {Math.min(currentPage * rowsPerPage, filteredAndSortedRows.length)} of{' '}
                          {filteredAndSortedRows.length} rows
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={currentPage <= 1}
                            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                            className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 text-slate-200 transition-colors"
                          >
                            Prev
                          </button>
                          <span className="px-2 text-slate-300">
                            {currentPage} / {totalPages}
                          </span>
                          <button
                            type="button"
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                            className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 text-slate-200 transition-colors"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Result Box Status Bar */}
              <div className="border-t border-slate-800/80 bg-slate-950 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-[11px] text-slate-500 font-mono">
                {queryResult ? (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="text-slate-300">DB: {dbHealth.database || 'Neon'}</span>
                    <span>•</span>
                    <span className={queryResult.success ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                      {queryResult.success ? `${queryResult.command || 'QUERY'} SUCCESS` : 'FAILED'}
                    </span>
                    <span>•</span>
                    <span>{queryResult.rowCount} rows</span>
                    <span>•</span>
                    <span>{queryResult.executionTimeMs} ms</span>
                    <span>•</span>
                    <span>{queryResult.executedAt}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Status: Idle</span>
                    <span>•</span>
                    <span>Connected to {dbHealth.provider || 'PostgreSQL'}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0">
                  <span className={`w-2 h-2 rounded-full ${dbHealth.connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  <span className="text-slate-400">{dbHealth.connected ? (dbHealth.host || 'Connected') : 'Disconnected'}</span>
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3.5 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0">
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

            <form onSubmit={handleSaveScriptSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
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

      {/* =========================================================
          NEON DATABASE CONNECTION SETTINGS MODAL
      ========================================================= */}
      {isConnModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3.5 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white font-bold text-sm">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">
                    Database Connection Hub
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsConnModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveConnection} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 text-slate-200">
              {/* Active Connection Pill / Card if connected */}
              {dbHealth.connected && (
                <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <div>
                      <div className="font-semibold text-emerald-300 font-mono">
                        Active DB: {dbHealth.database} ({dbHealth.provider || 'PostgreSQL'})
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono truncate max-w-xs">
                        {dbHealth.host} • {dbHealth.version} ({dbHealth.latencyMs}ms)
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-700/60 text-rose-300 text-xs font-medium transition-colors shrink-0"
                  >
                    Disconnect
                  </button>
                </div>
              )}

              {/* Saved Databases / Quick Switcher (1-Click Switch) */}
              {savedDatabases.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-300">
                    <span className="flex items-center gap-1.5 font-mono">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      Saved Databases
                    </span>
                    
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                    {savedDatabases.map((sdb) => {
                      const isActive = dbHealth.connected && (activeConnUrl === sdb.url || dbHealth.database === sdb.name);
                      return (
                        <div
                          key={sdb.id}
                          onClick={() => !isActive && handleSwitchDatabase(sdb.url)}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 transition-all text-xs ${
                            isActive
                              ? 'bg-emerald-950/40 border-emerald-500/40 cursor-default'
                              : 'bg-slate-950/70 border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900 cursor-pointer group'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`p-1.5 rounded-lg shrink-0 ${
                              isActive ? 'bg-emerald-600/20 text-emerald-400' : 'bg-slate-900 text-slate-400 group-hover:text-indigo-400'
                            }`}>
                              <Database className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-white font-mono flex items-center gap-1.5 truncate">
                                <span>{sdb.name}</span>
                                <span className="text-[10px] font-sans px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                                  {sdb.provider}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono truncate">
                                {sdb.url.replace(/:([^@]+)@/, ':••••••@')}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isActive ? (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                                Active ✓
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSwitchDatabase(sdb.url);
                                }}
                                disabled={isSavingConn}
                                className="text-[10px] font-mono px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-sm transition-colors"
                              >
                                Switch DB
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => handleRemoveSavedDb(e, sdb.id)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                              title="Remove from saved databases list"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Connection String Input (Change Database) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Database Connection String
                  </label>
                  {/* Provider Quick Templates */}
                  <div className="flex items-center gap-1.5 text-[10px] font-mono">
                    
                  </div>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={inputConnUrl}
                    onChange={(e) => setInputConnUrl(e.target.value)}
                    placeholder="postgresql://user:password@host:5432/dbname?sslmode=require"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3.5 pr-10 py-2.5 text-xs sm:text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <Eye className="w-4 h-4" /> : <Eye className="w-4 h-4 opacity-50" />}
                  </button>
                </div>
                
              </div>

              {/* Test Status Feedback Alert */}
              {connTestStatus.testing ? (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2.5 text-xs text-slate-300 font-mono">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>{connTestStatus.message || 'Testing connection to PostgreSQL database...'}</span>
                </div>
              ) : connTestStatus.message ? (
                <div
                  className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-mono ${
                    connTestStatus.success
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {connTestStatus.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{connTestStatus.message}</span>
                </div>
              ) : null}

             

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={!inputConnUrl.trim() || connTestStatus.testing}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                >
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Test Connection</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsConnModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!inputConnUrl.trim() || isSavingConn}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white font-semibold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    {isSavingConn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>{isSavingConn ? 'Connecting...' : dbHealth.connected ? 'Switch & Connect Database' : 'Connect Database'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          DUMP SQL FILE & POPULATE DATABASE MODAL
      ========================================================= */}
      {isDumpModalOpen && dumpFileMeta && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3.5 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-bold text-sm">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">
                    Populate Neon DB from SQL Dump
                  </h3>
                  <p className="text-xs text-slate-400">
                    Execute your .sql dump file to build tables and load records
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isPopulatingDb) {
                    setIsDumpModalOpen(false);
                    setDumpFileMeta(null);
                    setSelectedDumpFile(null);
                    setDumpResultStatus(null);
                  }
                }}
                disabled={isPopulatingDb}
                className="text-slate-400 hover:text-white transition-colors disabled:opacity-30"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 text-slate-200 text-xs">
              
              {/* Target DB Banner */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${dbHealth.connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  <span className="text-slate-400">Target Database:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{dbHealth.database || 'postgres'} ({dbHealth.provider || 'PostgreSQL'})</span>
                </div>
                <span className="font-mono text-[11px] text-slate-500 truncate max-w-[200px]">{dbHealth.host}</span>
              </div>

              {/* Dump File Metadata Card */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between font-mono text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="font-semibold text-slate-100 truncate">{dumpFileMeta.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-slate-400 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px]">
                      {dumpFileMeta.size}
                    </span>
                    <span className="text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono font-semibold">
                      psql Native
                    </span>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-slate-500 text-[10px] uppercase">Execution Mode:</span>
                  <span className="text-cyan-300 font-semibold">Zero-Heap Streaming (OOM Safe)</span>
                </div>

                {/* Local file path option for instant zero-upload speed */}
                <div className="pt-2 border-t border-slate-800/80">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-mono mb-1">
                    Local Path (Optional - skip HTTP upload for instant execution):
                  </label>
                  <input
                    type="text"
                    value={localDumpPathInput}
                    onChange={(e) => setLocalDumpPathInput(e.target.value)}
                    placeholder="e.g. C:\Users\Srishika\Downloads\dump-production-202611121626.sql"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Code Preview */}
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono block mb-1">
                    Dump File Preview (First 15 lines):
                  </span>
                  <pre className="bg-slate-900/90 rounded-lg p-2.5 font-mono text-[11px] text-slate-300 border border-slate-800 overflow-x-auto max-h-28 text-left leading-relaxed">
                    {dumpFileMeta.preview}
                  </pre>
                </div>
              </div>

              {/* Execution Status / Alerts */}
              {isPopulatingDb ? (
                <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-center gap-3 text-xs text-indigo-200">
                  <Loader2 className="w-5 h-5 animate-spin text-cyan-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Populating Database...</div>
                    <div className="text-[11px] text-slate-300">
                      Executing SQL dump via native PostgreSQL engine against target database. Processing types, tables, and rows...
                    </div>
                  </div>
                </div>
              ) : dumpResultStatus?.success ? (
                <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 space-y-1.5 text-xs text-emerald-200">
                  <div className="flex items-center gap-2 font-semibold text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Database Successfully Populated!</span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono">
                    Loaded {dumpResultStatus.tablesCount || dbHealth.tables?.length || 0} tables into PostgreSQL database in {dumpResultStatus.durationMs ? `${(dumpResultStatus.durationMs / 1000).toFixed(1)}s` : 'completed'}.
                  </div>
                </div>
              ) : dumpResultStatus?.success === false ? (
                <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 space-y-1.5 text-xs text-rose-200">
                  <div className="flex items-center gap-2 font-semibold text-rose-300">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Dump Execution Failed</span>
                  </div>
                  <div className="text-[11px] text-rose-300 font-mono whitespace-pre-wrap bg-slate-950 p-2 rounded border border-rose-900/40">
                    {dumpResultStatus.message}
                  </div>
                </div>
              ) : null}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsDumpModalOpen(false);
                    setDumpFileMeta(null);
                    setSelectedDumpFile(null);
                    setDumpResultStatus(null);
                  }}
                  disabled={isPopulatingDb}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors disabled:opacity-40"
                >
                  {dumpResultStatus?.success ? 'Close' : 'Cancel'}
                </button>

                {!dumpResultStatus?.success ? (
                  <button
                    type="button"
                    onClick={handlePopulateDatabaseWithDump}
                    disabled={isPopulatingDb || !dbHealth.connected}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95 disabled:opacity-40"
                  >
                    {isPopulatingDb ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Play className="w-4 h-4 fill-current text-white" />
                    )}
                    <span>{isPopulatingDb ? 'Populating Database...' : 'Populate Database'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDumpModalOpen(false);
                      setDumpFileMeta(null);
                      setSelectedDumpFile(null);
                      setDumpResultStatus(null);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
                  >
                    <Check className="w-4 h-4" />
                    <span>Done & Explore Tables</span>
                  </button>
                )}
              </div>

            </div>
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
