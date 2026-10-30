import { NextResponse } from 'next/server';
import { generateCustomQuery } from '@/lib/templates';

const SCHEMA_SYSTEM_INSTRUCTION = `
You are the principal SQL diagnostic architect for "Que_Me", an operational diagnostic platform for a CFD/Forex brokerage.
Your mission is to generate high-performance, ready-to-run PostgreSQL 15+ diagnostic queries based on natural language briefs provided by operations, risk, and support teams.

SCHEMA CONTEXT (Prisma PostgreSQL models):
1. TradingAccount:
   - id: Int @id
   - login: Int (Unique account identifier)
   - userId: Int (References User.id)
   - name: String
   - status: String ('ACTIVE', 'READ_ONLY', 'SUSPENDED', 'CLOSED')
   - balance: Decimal (Deposited cash balance)
   - equity: Decimal (Balance + floating PnL - margin)
   - leverage: Int (e.g. 100, 200, 500)
   - currency: String (e.g. 'USD', 'EUR')
   - createdAt: DateTime
   - Indexes: TradingAccount_login_key, TradingAccount_userId_idx

2. User:
   - id: Int @id
   - email: String
   - kycStatus: String ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED')
   - isVerified: Boolean
   - createdAt: DateTime

3. UserSession:
   - id: Int @id
   - userId: Int
   - ipAddress: String
   - deviceFingerprint: String
   - userAgent: String
   - createdAt: DateTime
   - Indexes: UserSession_userId_idx, UserSession_ipAddress_idx

4. Order:
   - id: Int @id
   - accountId: Int (References TradingAccount.id)
   - externalSymbol: String (e.g. 'EURUSD', 'XAUUSD', 'BTCUSD')
   - orderType: String ('BUY', 'SELL')
   - orderVolume: Decimal (Lots)
   - status: String ('PENDING', 'FILLED', 'REJECTED', 'CANCELLED', 'EXPIRED')
   - rejectionCode: String?
   - rejectionReason: String?
   - createdAt: DateTime
   - Indexes: Order_accountId_idx, Order_createdAt_idx

5. Deal:
   - id: Int @id
   - orderId: Int (References Order.id)
   - accountId: Int (References TradingAccount.id)
   - volume: Decimal
   - requestedPrice: Decimal
   - executionPrice: Decimal
   - entry: String ('IN', 'OUT', 'IN_OUT')
   - comment: String? (Contains 'so', 'stop_out', 'dealer', etc.)
   - createdAt: DateTime
   - Indexes: Deal_orderId_idx, Deal_accountId_idx, Deal_createdAt_idx

6. Position:
   - id: Int @id
   - accountId: Int (References TradingAccount.id)
   - externalSymbol: String
   - volume: Decimal
   - side: String ('BUY', 'SELL')
   - openPrice: Decimal
   - currentPrice: Decimal
   - floatingPnL: Decimal
   - swap: Decimal
   - commission: Decimal
   - createdAt: DateTime
   - Indexes: Position_accountId_idx

7. FundTransaction:
   - id: Int @id
   - accountId: Int (References TradingAccount.id)
   - type: String ('DEPOSIT', 'WITHDRAWAL', 'CREDIT_CORRECTION', 'NEGATIVE_BALANCE_PROTECTION')
   - status: String ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED')
   - amount: Decimal
   - currency: String
   - paymentMethod: String (e.g. 'WIRE', 'CRYPTO', 'CREDIT_CARD', 'UPI')
   - paymentProvider: String
   - externalReference: String?
   - utrNumber: String?
   - comment: String?
   - staffId: Int?
   - createdAt: DateTime
   - completedAt: DateTime?
   - Indexes: FundTransaction_accountId_idx, FundTransaction_utr_idx

8. AuditLog:
   - id: Int @id
   - accountId: Int (References TradingAccount.id)
   - staffId: Int? (References Staff.id)
   - actionType: String ('UPDATE', 'OVERRIDE', 'CREDIT_ADJUSTMENT')
   - tableName: String
   - fieldName: String (e.g. 'leverage', 'spread_markup', 'status')
   - oldValue: String?
   - newValue: String?
   - reason: String?
   - createdAt: DateTime
   - Indexes: AuditLog_accountId_idx

9. KycDocument & KycStateHistory:
   - KycDocument: id, userId, documentType, documentNumber, status, rejectionReason, createdAt
   - KycStateHistory: id, userId, staffId, fromStatus, toStatus, reason, createdAt

10. SupportTicket & SupportTicketMessage:
    - SupportTicket: id, accountId, subject, status, priority, category, creatorStaffId, assigneeStaffId, createdAt, updatedAt
    - SupportTicketMessage: id, ticketId, senderType, message, createdAt

11. Staff:
    - id: Int @id
    - name: String
    - email: String
    - role: String ('DEALER', 'SUPPORT_AGENT', 'RISK_MANAGER', 'COMPLIANCE_OFFICER')

12. ExecutionEvent:
    - id: Int @id
    - orderId: Int
    - status: String
    - gatewayMessage: String
    - createdAt: DateTime

13. Instrument:
    - id: Int @id
    - symbol: String
    - digits: Int
    - contractSize: Decimal
    - spread: Decimal

STRICT RULES FOR SQL GENERATION:
1. SAFE SQL GENERATION:
   - For diagnostic, investigation, and analytical inquiries: Generate clean SELECT or WITH ... SELECT queries.
   - For administrative remediation, cleanup, or update requests (e.g. "remove demo from all live accounts", "reverse balance entry"): Generate the targeted UPDATE or DELETE statement, but it MUST ALWAYS include an explicit, safe WHERE clause to target only the specified records.
   - NEVER output DROP, TRUNCATE, ALTER, GRANT, REVOKE, or catastrophic DDL commands!
2. TARGET SCOPE & ACCOUNT FILTERING:
   - If the user brief specifies a single target account: filter ta.login = <loginVal> (where ta is "TradingAccount").
   - If the user brief asks about "all accounts", "all live accounts", "all users", or across accounts: filter by the requested criteria (e.g. ta.status = 'ACTIVE' or "type" = 'LIVE' and name patterns) and include a sensible LIMIT if non-mutating.
3. DATE FILTERING: Apply the user's date criteria if relevant:
   - If single date: target_tbl."createdAt"::date = <dateVal>::date
   - If date range: target_tbl."createdAt" >= <fromVal> AND target_tbl."createdAt" <= <toVal>
4. PARAMETERIZATION:
   - If parameterized is true: Use placeholders like :loginId, :startDate, :endDate.
   - If parameterized is false: Inject the literal values directly into the query.
5. PERFORMANCE: Always leverage index columns (TradingAccount_login_key, Order_accountId_idx, Deal_orderId_idx). Add a sensible LIMIT (e.g. LIMIT 100 or 200) when querying non-aggregated detail rows.
6. Always quote mixed-case table and column names in double quotes (e.g. "TradingAccount" ta, o."externalSymbol", d."executionPrice", "FundTransaction" ft).

OUTPUT FORMAT:
Respond with a strict JSON object (no markdown code blocks, just raw JSON):
{
  "sql": "-- Clean, formatted, commented PostgreSQL query...",
  "tables": ["TradingAccount", "Order", "Deal"],
  "indexes": ["TradingAccount_login_key", "Order_accountId_idx"],
  "sensitivity": "Low" | "Medium" | "High (Financial)" | "High (Security/PII)",
  "diagnosticNotes": [
    "Concrete observation rule 1 for ops team.",
    "Concrete observation rule 2 for ops team."
  ]
}
`;

function sanitizeAndValidateSql(sql: string): { isValid: boolean; error?: string } {
  // 1. Strip comments (single-line and multi-line) so words in comments don't cause false positives
  const withoutComments = sql
    .replace(/--[^\r\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // 2. Strip string literals so words inside quotes don't match
  const withoutStrings = withoutComments.replace(/'(?:''|[^'])*'/g, "''");

  // 3. Check for actual destructive DDL commands
  const destructiveTokens = [
    /\bDROP\s+(?:TABLE|DATABASE|INDEX|VIEW|SCHEMA)\b/i,
    /\bALTER\s+TABLE\b/i,
    /\bTRUNCATE\s+(?:TABLE)?\b/i,
    /\bEXEC\s+/i,
    /\bGRANT\s+/i,
    /\bREVOKE\s+/i,
    /\bCREATE\s+(?:TABLE|DATABASE|INDEX|VIEW|FUNCTION|PROCEDURE)\b/i
  ];

  for (const regex of destructiveTokens) {
    if (regex.test(withoutStrings)) {
      return { isValid: false, error: 'Destructive DDL mutation detected in query statement.' };
    }
  }

  // 4. Must start with an allowed SQL keyword: SELECT, WITH, UPDATE, DELETE, DO, or BEGIN
  const clean = withoutStrings.trim().toUpperCase();
  const allowedStarts = ['SELECT', 'WITH', 'UPDATE', 'DELETE', 'DO', 'BEGIN'];
  const hasAllowedStart = allowedStarts.some(prefix => clean.startsWith(prefix));
  if (!hasAllowedStart) {
    return { isValid: false, error: 'Query must start with SELECT, WITH, UPDATE, or DELETE.' };
  }

  // 5. If UPDATE or DELETE, mandate a WHERE clause to prevent accidental full-table wipes
  if ((clean.startsWith('UPDATE') || clean.startsWith('DELETE')) && !clean.includes('WHERE')) {
    return { isValid: false, error: 'Mutation queries (UPDATE/DELETE) must contain a WHERE clause for safety.' };
  }

  return { isValid: true };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      prompt,
      loginId,
      dateMode = 'range',
      startDate,
      endDate,
      parameterized = false
    } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    // If no API key is provided, gracefully use our deterministic schema engine
    if (!groqApiKey && !geminiApiKey) {
      const fallbackResult = generateCustomQuery({
        prompt,
        loginId: loginId || '100234',
        dateMode,
        startDate: startDate || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
        endDate: endDate || new Date().toISOString().split('T')[0],
        parameterized
      });

      return NextResponse.json({
        sql: fallbackResult.sql,
        tables: fallbackResult.metadata.tables,
        indexes: fallbackResult.metadata.indexes,
        sensitivity: fallbackResult.metadata.sensitivity,
        diagnosticNotes: fallbackResult.metadata.diagnosticNotes || [
          'Generated via deterministic schema engine.',
          'Set GROQ_API_KEY in Vercel to unlock ultra-fast Groq Llama 3.3 AI query synthesis.'
        ],
        isAiGenerated: false,
        notice: 'GROQ_API_KEY not configured in environment. Generated using offline zero-cost schema engine.'
      });
    }

    const targetLoginDesc = loginId ? loginId : '100234';

    const userPromptContent = `
INVESTIGATION BRIEF: "${prompt}"

RUNTIME PARAMETERS:
- Target Login: ${targetLoginDesc}
- Date Mode: ${dateMode}
- Start Date: ${startDate || '2026-10-23'}
- End Date: ${endDate || '2026-10-30'}
- Mode: ${parameterized ? 'Parameterized statement (use :loginId, :startDate, :endDate)' : 'Injected literal values (use raw numbers and strings directly)'}

Generate the exact PostgreSQL 15+ diagnostic query and return JSON.`;

    let responseText: string | undefined;
    let aiEngineName = 'Groq (Llama 3.3 70B)';

    // 1. Primary: Groq Cloud API
    if (groqApiKey) {
      aiEngineName = 'Groq (Llama 3.3 70B)';
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqApiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: SCHEMA_SYSTEM_INSTRUCTION
            },
            {
              role: 'user',
              content: userPromptContent
            }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      });

      if (!groqResponse.ok) {
        const errorText = await groqResponse.text();
        console.error('Groq API call failed:', errorText);

        // If Gemini is also available, try Gemini fallback, otherwise fallback to local generator
        if (geminiApiKey) {
          console.warn('Groq failed, attempting fallback to Gemini...');
          return callGeminiFallback({
            geminiApiKey,
            userPromptContent,
            prompt,
            loginId,
            dateMode,
            startDate,
            endDate,
            parameterized
          });
        }

        const fallbackResult = generateCustomQuery({
          prompt,
          loginId: loginId || '100234',
          dateMode,
          startDate: startDate || '2026-10-23',
          endDate: endDate || '2026-10-30',
          parameterized
        });

        return NextResponse.json({
          sql: fallbackResult.sql,
          tables: fallbackResult.metadata.tables,
          indexes: fallbackResult.metadata.indexes,
          sensitivity: fallbackResult.metadata.sensitivity,
          diagnosticNotes: fallbackResult.metadata.diagnosticNotes || [
            'Groq API request encountered an error.',
            'Deterministic fallback engine provided this query.'
          ],
          isAiGenerated: false,
          notice: 'Groq API temporary error. Returned fallback query.'
        });
      }

      const data = await groqResponse.json();
      responseText = data?.choices?.[0]?.message?.content;
    } else if (geminiApiKey) {
      // Secondary: Gemini 2.0 Flash
      return callGeminiFallback({
        geminiApiKey,
        userPromptContent,
        prompt,
        loginId,
        dateMode,
        startDate,
        endDate,
        parameterized
      });
    }

    if (!responseText) {
      throw new Error('Empty response received from AI engine.');
    }

    const parsed = JSON.parse(responseText);

    // SQL Safety & Read-Only Check
    const validation = sanitizeAndValidateSql(parsed.sql || '');
    if (!validation.isValid) {
      console.warn('AI generated invalid SQL, falling back:', validation.error);
      const fallbackResult = generateCustomQuery({
        prompt,
        loginId: loginId || '100234',
        dateMode,
        startDate: startDate || '2026-10-23',
        endDate: endDate || '2026-10-30',
        parameterized
      });

      return NextResponse.json({
        sql: fallbackResult.sql,
        tables: fallbackResult.metadata.tables,
        indexes: fallbackResult.metadata.indexes,
        sensitivity: fallbackResult.metadata.sensitivity,
        diagnosticNotes: [
          `AI output rejected by safety guardrail (${validation.error}).`,
          'Used safe deterministic fallback query.'
        ],
        isAiGenerated: false
      });
    }

    return NextResponse.json({
      sql: parsed.sql,
      tables: Array.isArray(parsed.tables) ? parsed.tables : ['TradingAccount'],
      indexes: Array.isArray(parsed.indexes) ? parsed.indexes : ['TradingAccount_login_key'],
      sensitivity: parsed.sensitivity || 'Medium',
      diagnosticNotes: Array.isArray(parsed.diagnosticNotes) ? parsed.diagnosticNotes : [
        `AI synthesized query tailored to investigation prompt via ${aiEngineName}.`,
        'Review execution plan (EXPLAIN ANALYZE) for production queries.'
      ],
      isAiGenerated: true,
      aiEngine: aiEngineName
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown server error';
    console.error('API /api/generate-query error:', errorMsg);

    return NextResponse.json(
      { error: 'Failed to generate custom query.', details: errorMsg },
      { status: 500 }
    );
  }
}

async function callGeminiFallback({
  geminiApiKey,
  userPromptContent,
  prompt,
  loginId,
  dateMode,
  startDate,
  endDate,
  parameterized
}: {
  geminiApiKey: string;
  userPromptContent: string;
  prompt: string;
  loginId?: string;
  dateMode: 'single' | 'range';
  startDate?: string;
  endDate?: string;
  parameterized: boolean;
}) {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

  const geminiResponse = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userPromptContent }] }],
      systemInstruction: { parts: [{ text: SCHEMA_SYSTEM_INSTRUCTION }] },
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
    })
  });

  if (!geminiResponse.ok) {
    const fallbackResult = generateCustomQuery({
      prompt,
      loginId: loginId || '100234',
      dateMode,
      startDate: startDate || '2026-10-23',
      endDate: endDate || '2026-10-30',
      parameterized
    });

    return NextResponse.json({
      sql: fallbackResult.sql,
      tables: fallbackResult.metadata.tables,
      indexes: fallbackResult.metadata.indexes,
      sensitivity: fallbackResult.metadata.sensitivity,
      diagnosticNotes: fallbackResult.metadata.diagnosticNotes || [
        'AI request exceeded rate limit or failed.',
        'Fallback engine provided the response.'
      ],
      isAiGenerated: false,
      notice: 'AI temporary error. Returned fallback query.'
    });
  }

  const data = await geminiResponse.json();
  const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!responseText) throw new Error('Empty response from Gemini.');
  const parsed = JSON.parse(responseText);

  const validation = sanitizeAndValidateSql(parsed.sql || '');
  if (!validation.isValid) {
    const fallbackResult = generateCustomQuery({
      prompt,
      loginId: loginId || '100234',
      dateMode,
      startDate: startDate || '2026-10-23',
      endDate: endDate || '2026-10-30',
      parameterized
    });
    return NextResponse.json({
      sql: fallbackResult.sql,
      tables: fallbackResult.metadata.tables,
      indexes: fallbackResult.metadata.indexes,
      sensitivity: fallbackResult.metadata.sensitivity,
      diagnosticNotes: ['AI output rejected by safety guardrail.', 'Used safe fallback query.'],
      isAiGenerated: false
    });
  }

  return NextResponse.json({
    sql: parsed.sql,
    tables: Array.isArray(parsed.tables) ? parsed.tables : ['TradingAccount'],
    indexes: Array.isArray(parsed.indexes) ? parsed.indexes : ['TradingAccount_login_key'],
    sensitivity: parsed.sensitivity || 'Medium',
    diagnosticNotes: Array.isArray(parsed.diagnosticNotes) ? parsed.diagnosticNotes : [
      'Gemini AI synthesized query.',
      'Review execution plan (EXPLAIN ANALYZE).'
    ],
    isAiGenerated: true,
    aiEngine: 'Gemini 2.0 Flash'
  });
}
