import { NextRequest, NextResponse } from 'next/server';
import { checkNeonHealth } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const testConn = url.searchParams.get('testConn') || undefined;
    const health = await checkNeonHealth(testConn);
    return NextResponse.json(health, { status: health.connected ? 200 : 200 });
  } catch (err: any) {
    return NextResponse.json(
      { connected: false, error: err.message || 'Internal server error while checking database health.' },
      { status: 500 }
    );
  }
}
