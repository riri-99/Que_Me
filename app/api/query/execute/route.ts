import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, executeSqlDump, executeDumpFile } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export const maxDuration = 300; // 5 minutes for large dumps

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';

  // 1. Handle Multipart Form Data (File Upload)
  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await req.formData();
      const file = formData.get('dumpFile') as File | null;
      const localFilePath = (formData.get('localFilePath') as string | null)?.trim();
      const overrideConn = (formData.get('connectionString') as string | null)?.trim() || undefined;

      // Check if localFilePath on machine is provided and valid (0 upload time)
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

      // Check if this exact file exists on disk in Downloads/Desktop to avoid redundant temp buffering
      const candidates = [
        path.join(os.homedir(), 'Downloads', file.name),
        path.join(os.homedir(), 'Desktop', file.name),
        path.join(os.homedir(), 'Documents', file.name),
        path.join(process.cwd(), file.name),
      ];
      const localMatch = candidates.find((c) => fs.existsSync(c));
      if (localMatch) {
        const result = await executeDumpFile(localMatch, overrideConn);
        return NextResponse.json(result);
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

    if (localFilePath) {
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
      return NextResponse.json(dumpResult, { status: 200 });
    }

    const result = await executeQuery(sql, overrideConn);
    return NextResponse.json(result, { status: 200 });
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
