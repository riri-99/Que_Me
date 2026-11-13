import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileName = searchParams.get('fileName') || searchParams.get('filename') || '';
    if (!fileName.trim()) {
      return NextResponse.json({ exists: false, error: 'No fileName provided' }, { status: 400 });
    }

    const cleanName = path.basename(fileName.trim());
    const candidates = [
      path.join(os.homedir(), 'Downloads', cleanName),
      path.join(os.homedir(), 'Desktop', cleanName),
      path.join(os.homedir(), 'Documents', cleanName),
      path.join(process.cwd(), cleanName),
      path.join(process.cwd(), 'public', cleanName),
      fileName.trim() // in case an absolute path was passed
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        try {
          const stat = fs.statSync(candidate);
          if (stat.isFile()) {
            return NextResponse.json({
              exists: true,
              localPath: candidate,
              sizeBytes: stat.size
            });
          }
        } catch {
          // ignore stat error
        }
      }
    }

    return NextResponse.json({ exists: false });
  } catch (err: any) {
    return NextResponse.json({ exists: false, error: err.message }, { status: 500 });
  }
}
