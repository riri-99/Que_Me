import { neon, Pool } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';

// In-memory runtime override if set via the Studio UI
let runtimeConnectionString: string | null = null;

export function setRuntimeConnectionString(conn: string | null) {
  runtimeConnectionString = conn ? conn.trim() : null;
}

export function getConnectionString(): string | null {
  if (runtimeConnectionString) {
    return runtimeConnectionString;
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) {
    return process.env.DATABASE_URL.trim();
  }
  if (process.env.NEON_DATABASE_URL && process.env.NEON_DATABASE_URL.trim()) {
    return process.env.NEON_DATABASE_URL.trim();
  }
  // Try reading from .env.local if present
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

export function maskConnectionString(conn: string): string {
  try {
    const url = new URL(conn);
    return `${url.protocol}//${url.username}:••••••@${url.host}${url.pathname}`;
  } catch {
    return conn.replace(/:([^@]+)@/, ':••••••@');
  }
}

export function saveConnectionStringToEnv(conn: string) {
  const trimmed = conn.trim();
  setRuntimeConnectionString(trimmed);
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
      if (/DATABASE_URL=.*/.test(content)) {
        content = content.replace(/DATABASE_URL=.*/, `DATABASE_URL="${trimmed}"`);
      } else {
        content += `\nDATABASE_URL="${trimmed}"\n`;
      }
    } else {
      content = `# Neon PostgreSQL Connection\nDATABASE_URL="${trimmed}"\n`;
    }
    fs.writeFileSync(envPath, content, 'utf8');
  } catch (err) {
    console.error('Failed to write .env.local:', err);
  }
}

export function removeConnectionStringFromEnv() {
  setRuntimeConnectionString(null);
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      content = content.replace(/DATABASE_URL=.*/g, '');
      fs.writeFileSync(envPath, content, 'utf8');
    }
  } catch (err) {
    console.error('Failed to update .env.local:', err);
  }
}

export function getDbClient(overrideConn?: string) {
  const conn = overrideConn?.trim() || getConnectionString();
  if (!conn) {
    throw new Error('DATABASE_URL is not configured. Please connect your Neon database in Settings.');
  }
  return neon(conn, { fullResults: true });
}

export interface QueryColumnMeta {
  name: string;
  dataTypeID?: number;
}

export interface QueryExecutionResult {
  success: boolean;
  command?: string;
  columns?: QueryColumnMeta[];
  rows?: Array<Record<string, any>>;
  rowCount?: number;
  executionTimeMs?: number;
  error?: string;
  code?: string;
  position?: number;
  detail?: string;
  hint?: string;
}

export async function executeQuery(
  sql: string,
  overrideConn?: string
): Promise<QueryExecutionResult> {
  const trimmedSql = sql.trim();
  if (!trimmedSql) {
    return {
      success: false,
      error: 'Query string is empty.'
    };
  }

  const conn = overrideConn?.trim() || getConnectionString();
  if (!conn) {
    return {
      success: false,
      error: 'DATABASE_URL is not configured. Please connect your Neon database in Settings.'
    };
  }

  const startTime = performance.now();
  try {
    let rawResult: any;

    // Use Pool for transaction support (BEGIN; ...; ROLLBACK;) and multi-statement queries
    const pool = new Pool({ connectionString: conn });
    try {
      rawResult = await pool.query(trimmedSql);
    } finally {
      await pool.end();
    }

    const duration = Math.round((performance.now() - startTime) * 10) / 10;

    // When multi-statement (e.g. BEGIN; <user-query>; ROLLBACK;):
    // rawResult is an array of statement results.
    // We locate the primary statement result that returned rows or was the user's primary command
    let result = rawResult;
    if (Array.isArray(rawResult)) {
      const primary = [...rawResult].reverse().find(
        (r: any) => r.command !== 'ROLLBACK' && r.command !== 'BEGIN'
      );
      result = primary || rawResult[rawResult.length - 1];
    }

    const columns: QueryColumnMeta[] = (result?.fields || []).map((f: any) => ({
      name: f.name,
      dataTypeID: f.dataTypeID
    }));

    const rows: Array<Record<string, any>> = result?.rows || [];
    const rowCount = typeof result?.rowCount === 'number' ? result.rowCount : rows.length;
    const command = result?.command || (trimmedSql.split(/\s+/)[0]?.toUpperCase() || 'QUERY');

    return {
      success: true,
      command,
      columns,
      rows,
      rowCount,
      executionTimeMs: duration
    };
  } catch (err: any) {
    const duration = Math.round((performance.now() - startTime) * 10) / 10;
    return {
      success: false,
      error: err.message || 'An error occurred while executing the query.',
      code: err.code,
      position: err.position ? Number(err.position) : undefined,
      detail: err.detail,
      hint: err.hint,
      executionTimeMs: duration
    };
  }
}

export interface DumpExecutionResult {
  success: boolean;
  statementsExecuted?: number;
  tables?: NeonTableInfo[];
  executionTimeMs?: number;
  error?: string;
  code?: string;
  detail?: string;
}

export async function executeSqlDump(
  sql: string,
  overrideConn?: string
): Promise<DumpExecutionResult> {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { success: false, error: 'SQL dump file is empty.' };
  }

  const startTime = performance.now();
  try {
    const client = getDbClient(overrideConn);
    await client.query(trimmed);
    const duration = Math.round((performance.now() - startTime) * 10) / 10;

    const health = await checkNeonHealth(overrideConn);

    const stmts = trimmed
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    return {
      success: true,
      statementsExecuted: Math.max(stmts.length, 1),
      tables: health.tables || [],
      executionTimeMs: duration
    };
  } catch (err: any) {
    const duration = Math.round((performance.now() - startTime) * 10) / 10;
    return {
      success: false,
      error: err.message || 'An error occurred while executing the SQL dump.',
      code: err.code,
      detail: err.detail,
      executionTimeMs: duration
    };
  }
}

export interface DumpFileResult {
  success: boolean;
  message?: string;
  durationMs?: number;
  tables?: NeonTableInfo[];
  error?: string;
  output?: string;
}

export async function executeDumpFile(
  filePath: string,
  overrideConn?: string
): Promise<DumpFileResult> {
  const conn = overrideConn?.trim() || getConnectionString();
  if (!conn) {
    return {
      success: false,
      error: 'No Neon connection string configured. Please connect your Neon DB first.'
    };
  }

  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      error: `Dump file not found on disk: ${filePath}`
    };
  }

  const startTime = performance.now();

  // Find psql executable
  let psqlCmd = 'psql';
  const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const winPsql = path.join(progFiles, 'PostgreSQL', '18', 'bin', 'psql.exe');
  if (fs.existsSync(winPsql)) {
    psqlCmd = winPsql;
  }

  return new Promise((resolve) => {
    execFile(
      psqlCmd,
      [conn, '-f', filePath],
      {
        maxBuffer: 50 * 1024 * 1024,
        env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
        windowsHide: true
      },
      async (err, stdout, stderr) => {
        const duration = Math.round((performance.now() - startTime) * 10) / 10;
        const health = await checkNeonHealth(conn);
        const outputSummary = (stdout || '').slice(-2000);

        if (err && (!health.tables || health.tables.length === 0)) {
          return resolve({
            success: false,
            error: stderr || err.message || 'psql dump execution failed.',
            output: outputSummary,
            durationMs: duration
          });
        }

        return resolve({
          success: true,
          message: `Database populated successfully! Loaded ${health.tables?.length || 0} tables.`,
          durationMs: duration,
          tables: health.tables || [],
          output: outputSummary
        });
      }
    );
  });
}

export interface NeonTableInfo {
  name: string;
  count: string;
}

export interface HealthCheckResult {
  connected: boolean;
  database?: string;
  version?: string;
  host?: string;
  maskedUrl?: string;
  latencyMs?: number;
  tables?: NeonTableInfo[];
  error?: string;
}

export async function checkNeonHealth(overrideConn?: string): Promise<HealthCheckResult> {
  const conn = overrideConn?.trim() || getConnectionString();
  if (!conn) {
    return {
      connected: false,
      tables: [],
      error: 'No database connection string configured.'
    };
  }

  const startTime = performance.now();
  try {
    const client = neon(conn, { fullResults: true });
    const res: any = await client.query('SELECT current_database() as database, version(), now() as server_time;');
    const latency = Math.round((performance.now() - startTime) * 10) / 10;
    const row = res?.rows?.[0] || {};

    let host = 'Neon PostgreSQL';
    try {
      const parsed = new URL(conn);
      host = parsed.host;
    } catch {
      // ignore
    }

    // Fetch tables from public schema in Neon
    let tables: NeonTableInfo[] = [];
    try {
      const tableRes: any = await client.query(`
        SELECT 
          c.relname AS table_name,
          c.reltuples::bigint AS estimated_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname = 'public'
        ORDER BY c.relname;
      `);
      const formatCount = (num: number) => {
        if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
        if (num >= 1_000) return (num / 1_000).toFixed(0) + 'K';
        return String(Math.max(num, 0));
      };
      tables = (tableRes?.rows || []).map((r: any) => ({
        name: r.table_name,
        count: formatCount(Number(r.estimated_count || 0))
      }));
    } catch {
      // ignore table query failure
    }

    return {
      connected: true,
      database: row.database || 'neondb',
      version: row.version ? row.version.split(' on ')[0] : 'PostgreSQL 16+',
      host,
      maskedUrl: maskConnectionString(conn),
      latencyMs: latency,
      tables
    };
  } catch (err: any) {
    const latency = Math.round((performance.now() - startTime) * 10) / 10;
    return {
      connected: false,
      tables: [],
      latencyMs: latency,
      error: err.message || 'Connection test failed.'
    };
  }
}
