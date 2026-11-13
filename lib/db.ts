import { Pool, PoolConfig } from 'pg';
import fs from 'fs';
import path from 'path';
import os from 'os';
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
  if (process.env.POSTGRES_URL && process.env.POSTGRES_URL.trim()) {
    return process.env.POSTGRES_URL.trim();
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
      content = `# PostgreSQL Connection\nDATABASE_URL="${trimmed}"\n`;
    }
    fs.writeFileSync(envPath, content, 'utf8');
  } catch {
    // Read-only filesystem on serverless platforms (Vercel/AWS Lambda) - connection is safely passed in requests
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
  } catch {
    // Read-only filesystem on serverless platforms
  }
}

export function getPoolConfig(connectionString: string): PoolConfig {
  let isLocal = false;
  try {
    const url = new URL(connectionString);
    if (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1' ||
      url.hostname.endsWith('.local')
    ) {
      isLocal = true;
    }
  } catch {
    // ignore URL parse errors
  }

  const hasSslRequire = /sslmode=(require|verify-full|verify-ca)/i.test(connectionString);
  const hasSslDisable = /sslmode=disable/i.test(connectionString);

  if (hasSslDisable || (isLocal && !hasSslRequire)) {
    return {
      connectionString,
      connectionTimeoutMillis: 10000
    };
  }

  return {
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000
  };
}

export function detectDbProvider(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const host = url.hostname.toLowerCase();
    if (host.includes('neon.tech')) return 'Neon PostgreSQL';
    if (host.includes('supabase.co') || host.includes('supabase.com')) return 'Supabase PostgreSQL';
    if (host.includes('rds.amazonaws.com')) return 'AWS RDS PostgreSQL';
    if (host.includes('gcp') || host.includes('cloudsql')) return 'GCP Cloud SQL';
    if (host.includes('railway')) return 'Railway PostgreSQL';
    if (host.includes('render.com')) return 'Render PostgreSQL';
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'Local PostgreSQL';
    return 'PostgreSQL Database';
  } catch {
    return 'PostgreSQL Database';
  }
}

export function getDbClient(overrideConn?: string) {
  const conn = overrideConn?.trim() || getConnectionString();
  if (!conn) {
    throw new Error('DATABASE_URL is not configured. Please connect your PostgreSQL database in Settings.');
  }
  return new Pool(getPoolConfig(conn));
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
      error: 'DATABASE_URL is not configured. Please connect your PostgreSQL database in Settings.'
    };
  }

  const startTime = performance.now();
  let pool: Pool | null = null;
  try {
    pool = new Pool(getPoolConfig(conn));
    const rawResult: any = await pool.query(trimmedSql);
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
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
  }
}

export async function wipeDatabase(
  overrideConn?: string
): Promise<{ success: boolean; error?: string }> {
  const conn = overrideConn?.trim() || getConnectionString();
  if (!conn) {
    return { success: false, error: 'No database connection configured.' };
  }
  let pool: Pool | null = null;
  try {
    pool = new Pool(getPoolConfig(conn));
    // Clear all existing data, tables, views, sequences, and enums in public schema
    await pool.query(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        -- 1. Try clean schema drop & recreate
        BEGIN
          EXECUTE 'DROP SCHEMA IF EXISTS public CASCADE';
          EXECUTE 'CREATE SCHEMA public';
          EXECUTE 'GRANT ALL ON SCHEMA public TO CURRENT_USER';
          EXECUTE 'GRANT ALL ON SCHEMA public TO PUBLIC';
          RETURN;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;

        -- 2. Fallback if schema-level drop is restricted: drop all objects in public
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
        FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.viewname) || ' CASCADE';
        END LOOP;
        FOR r IN (SELECT matviewname FROM pg_matviews WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP MATERIALIZED VIEW IF EXISTS public.' || quote_ident(r.matviewname) || ' CASCADE';
        END LOOP;
        FOR r IN (SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e') LOOP
          EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
        END LOOP;
        FOR r IN (SELECT sequencename FROM pg_sequences WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(r.sequencename) || ' CASCADE';
        END LOOP;
      END $$;
    `);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to wipe database before dump:', err);
    return { success: false, error: err.message || 'Failed to wipe database.' };
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
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

  const conn = overrideConn?.trim() || getConnectionString();
  if (!conn) {
    return {
      success: false,
      error: 'DATABASE_URL is not configured. Please connect your PostgreSQL database first.'
    };
  }

  // Always wipe database cleanly before repopulating from dump
  const wipeResult = await wipeDatabase(conn);
  if (!wipeResult.success) {
    return {
      success: false,
      error: `Failed to clear existing database before dump: ${wipeResult.error}`
    };
  }

  const startTime = performance.now();
  let pool: Pool | null = null;
  try {
    pool = new Pool(getPoolConfig(conn));
    await pool.query(trimmed);
    const duration = Math.round((performance.now() - startTime) * 10) / 10;

    const health = await checkDbHealth(overrideConn);

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
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
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
      error: 'No PostgreSQL connection string configured. Please connect your database first.'
    };
  }

  // Resolve file path (check exact path, Downloads, Desktop, current directory)
  let resolvedPath = filePath.trim();
  if (!fs.existsSync(resolvedPath)) {
    const filename = path.basename(resolvedPath);
    const candidates = [
      path.join(os.homedir(), 'Downloads', filename),
      path.join(os.homedir(), 'Desktop', filename),
      path.join(os.homedir(), 'Documents', filename),
      path.join(process.cwd(), filename),
    ];
    const found = candidates.find((c) => fs.existsSync(c));
    if (found) {
      resolvedPath = found;
    } else {
      return {
        success: false,
        error: `Dump file not found on disk: ${filePath}`
      };
    }
  }

  // Always wipe database cleanly before repopulating from dump
  const wipeResult = await wipeDatabase(conn);
  if (!wipeResult.success) {
    return {
      success: false,
      error: `Failed to clear existing database before dump: ${wipeResult.error}`
    };
  }

  const startTime = performance.now();

  // Find psql executable
  let psqlCmd = 'psql';
  const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const candidatePsqls = [
    path.join(progFiles, 'PostgreSQL', '18', 'bin', 'psql.exe'),
    path.join(progFiles, 'PostgreSQL', '17', 'bin', 'psql.exe'),
    path.join(progFiles, 'PostgreSQL', '16', 'bin', 'psql.exe'),
    path.join(progFilesX86, 'PostgreSQL', '18', 'bin', 'psql.exe'),
    path.join(progFilesX86, 'PostgreSQL', '17', 'bin', 'psql.exe'),
    path.join(progFilesX86, 'PostgreSQL', '16', 'bin', 'psql.exe'),
  ];
  for (const candidate of candidatePsqls) {
    if (fs.existsSync(candidate)) {
      psqlCmd = candidate;
      break;
    }
  }

  return new Promise((resolve) => {
    execFile(
      psqlCmd,
      [conn, '-f', resolvedPath],
      {
        maxBuffer: 50 * 1024 * 1024,
        env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
        windowsHide: true
      },
      async (err, stdout, stderr) => {
        const duration = Math.round((performance.now() - startTime) * 10) / 10;
        const health = await checkDbHealth(conn);
        const outputSummary = (stdout || '').slice(-2000);

        if (err && (!health.tables || health.tables.length === 0)) {
          // Fallback for Vercel/serverless environments without psql CLI:
          // Try executing the SQL statements directly via pg Pool
          try {
            const rawContent = fs.readFileSync(resolvedPath, 'utf8');
            if (!rawContent.includes('FROM stdin;')) {
              const fallbackPool = new Pool(getPoolConfig(conn));
              try {
                await fallbackPool.query(rawContent);
                const postHealth = await checkDbHealth(conn);
                return resolve({
                  success: true,
                  message: `Database wiped clean and populated successfully via PostgreSQL engine! Loaded ${postHealth.tables?.length || 0} tables.`,
                  durationMs: Math.round((performance.now() - startTime) * 10) / 10,
                  tables: postHealth.tables || [],
                  output: 'Executed SQL dump directly via PostgreSQL client engine.'
                });
              } finally {
                await fallbackPool.end().catch(() => {});
              }
            }
          } catch (fallbackErr: any) {
            console.error('SQL direct execution fallback failed:', fallbackErr);
          }

          return resolve({
            success: false,
            error: stderr || err.message || 'psql dump execution failed.',
            output: outputSummary,
            durationMs: duration
          });
        }

        return resolve({
          success: true,
          message: `Database wiped clean and populated successfully! Loaded ${health.tables?.length || 0} tables.`,
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
  provider?: string;
  maskedUrl?: string;
  latencyMs?: number;
  tables?: NeonTableInfo[];
  isVercel?: boolean;
  isServerless?: boolean;
  error?: string;
}

export async function checkDbHealth(overrideConn?: string): Promise<HealthCheckResult> {
  const conn = overrideConn?.trim() || getConnectionString();
  if (!conn) {
    return {
      connected: false,
      tables: [],
      error: 'No database connection string configured.'
    };
  }

  const startTime = performance.now();
  let pool: Pool | null = null;
  try {
    pool = new Pool(getPoolConfig(conn));
    const res: any = await pool.query('SELECT current_database() as database, version(), now() as server_time;');
    const latency = Math.round((performance.now() - startTime) * 10) / 10;
    const row = res?.rows?.[0] || {};

    let host = 'PostgreSQL Database';
    try {
      const parsed = new URL(conn);
      host = parsed.host;
    } catch {
      // ignore
    }

    const provider = detectDbProvider(conn);
    const isVercel = Boolean(process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV);
    const isServerless = isVercel || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

    // Fetch tables from public schema in PostgreSQL
    let tables: NeonTableInfo[] = [];
    try {
      const tableRes: any = await pool.query(`
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
      database: row.database || 'postgres',
      version: row.version ? row.version.split(' on ')[0] : 'PostgreSQL 16+',
      host,
      provider,
      maskedUrl: maskConnectionString(conn),
      latencyMs: latency,
      tables,
      isVercel,
      isServerless
    };
  } catch (err: any) {
    const latency = Math.round((performance.now() - startTime) * 10) / 10;
    return {
      connected: false,
      tables: [],
      latencyMs: latency,
      error: err.message || 'Connection test failed.'
    };
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
  }
}

export const checkNeonHealth = checkDbHealth;
