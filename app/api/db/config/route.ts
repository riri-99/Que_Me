import { NextRequest, NextResponse } from 'next/server';
import { 
  getConnectionString, 
  maskConnectionString, 
  saveConnectionStringToEnv, 
  removeConnectionStringFromEnv, 
  checkNeonHealth 
} from '@/lib/db';

export async function GET() {
  const conn = getConnectionString();
  if (!conn) {
    return NextResponse.json({
      hasConnection: false,
      maskedUrl: null
    });
  }

  return NextResponse.json({
    hasConnection: true,
    maskedUrl: maskConnectionString(conn)
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const connectionString = (body?.connectionString || '').trim();

    if (!connectionString) {
      return NextResponse.json(
        { success: false, error: 'Connection string is required.' },
        { status: 400 }
      );
    }

    // Verify connection health first
    const testResult = await checkNeonHealth(connectionString);
    if (!testResult.connected) {
      return NextResponse.json(
        {
          success: false,
          error: testResult.error || 'Connection failed. Please verify your Neon host, username, and password.',
          latencyMs: testResult.latencyMs
        },
        { status: 400 }
      );
    }

    // Save to .env.local and runtime
    saveConnectionStringToEnv(connectionString);

    return NextResponse.json({
      success: true,
      message: 'Neon database connected and saved successfully.',
      database: testResult.database,
      version: testResult.version,
      host: testResult.host,
      maskedUrl: testResult.maskedUrl,
      latencyMs: testResult.latencyMs,
      tables: testResult.tables || []
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to save database configuration.' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  removeConnectionStringFromEnv();
  return NextResponse.json({
    success: true,
    message: 'Database connection removed.'
  });
}
