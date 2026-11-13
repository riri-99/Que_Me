import { NextRequest, NextResponse } from 'next/server';
import { wipeDatabase, checkDbHealth } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const overrideConn = body?.connectionString || undefined;

    const result = await wipeDatabase(overrideConn);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to wipe database.' },
        { status: 500 }
      );
    }

    const health = await checkDbHealth(overrideConn);
    return NextResponse.json({
      success: true,
      message: 'Database wiped clean successfully! Schema public is now empty.',
      tables: health.tables || []
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Error executing database wipe.' },
      { status: 500 }
    );
  }
}
