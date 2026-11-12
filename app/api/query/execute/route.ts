import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, executeSqlDump, executeDumpFile } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';

  // 1. Handle Multipart Form Data (File Upload)
  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await req.formData();
      const file = formData.get('dumpFile') as File | null;
      const localFilePath = (formData.get('localFilePath') as string | null)?.trim();
      const overrideConn = (formData.get('connectionString') as string | null)?.trim() || undefined;

      // If localFilePath on machine is provided and valid, execute directly (0 upload time)
      if (localFilePath && fs.existsSync(localFilePath)) {
        const result = await executeDumpFile(localFilePath, overrideConn);
        return NextResponse.json(result);
      }

      if (!file) {
        return NextResponse.json(
          { success: false, error: 'No dump file or local file path provided.' },
          { status: 400 }
        );
      }

      // Stream file directly to a temporary path on disk
      const tempDir = os.tmpdir();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const tempPath = path.join(tempDir, `neon_dump_${Date.now()}_${safeName}`);

      const fileStream = file.stream();
      const writeStream = fs.createWriteStream(tempPath);
      await pipeline(Readable.fromWeb(fileStream as any), writeStream);

      // Execute via psql
      const result = await executeDumpFile(tempPath, overrideConn);

      // Clean up temporary file
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // ignore
      }

      return NextResponse.json(result);
    } catch (err: any) {
      return NextResponse.json(
        {
          success: false,
          error: err.message || 'Error processing uploaded dump file.'
        },
        { status: 500 }
      );
    }
  }

  // 2. Handle Application/JSON
  try {
    const body = await req.json();
    const sql = body?.sql || '';
    const overrideConn = body?.connectionString || undefined;
    const localFilePath = body?.localFilePath?.trim();
    const isDump = Boolean(body?.isDump);

    if (localFilePath && fs.existsSync(localFilePath)) {
      const result = await executeDumpFile(localFilePath, overrideConn);
      return NextResponse.json(result);
    }

    if (!sql || !sql.trim()) {
      return NextResponse.json(
        { success: false, error: 'SQL query cannot be empty.' },
        { status: 400 }
      );
    }

    if (isDump) {
      const dumpResult = await executeSqlDump(sql, overrideConn);
      return NextResponse.json(dumpResult, { status: dumpResult.success ? 200 : 200 });
    }

    const result = await executeQuery(sql, overrideConn);
    return NextResponse.json(result, { status: result.success ? 200 : 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Server error while executing query.'
      },
      { status: 500 }
    );
  }
}
