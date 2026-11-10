export type QueryStatementType = 'SELECT' | 'UPDATE' | 'DELETE' | 'SCRIPT';

export function getQueryStatementType(
  sql?: string,
  explicitType?: QueryStatementType
): QueryStatementType {
  if (explicitType) return explicitType;
  if (!sql) return 'SELECT';
  const clean = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim()
    .toUpperCase();
  if (clean.startsWith('UPDATE')) return 'UPDATE';
  if (clean.startsWith('DELETE')) return 'DELETE';
  if (clean.startsWith('DO') || clean.startsWith('BEGIN')) return 'SCRIPT';
  if (clean.startsWith('SELECT') || clean.startsWith('WITH')) return 'SELECT';
  return 'SELECT';
}

export function getTemplateStatementType(tmpl: QueryTemplate): QueryStatementType {
  if (tmpl.statementType) return tmpl.statementType;
  try {
    const sampleSql = tmpl.generateSql({
      loginId: '100234',
      dateMode: 'single',
      startDate: '2026-05-01',
      parameterized: false
    });
    return getQueryStatementType(sampleSql);
  } catch {
    return 'SELECT';
  }
}

export interface QueryTemplate {
  id: string;
  category: 'Trading' | 'Funds' | 'Risk' | 'Security' | 'Compliance' | 'Custom';
  statementType?: QueryStatementType;
  title: string;
  description: string;
  tables: string[];
  indexes: string[];
  sensitivity: 'Low' | 'Medium' | 'High (Financial)' | 'High (Security/PII)';
  diagnosticNotes: string[];
  generateSql: (params: {
    loginId?: string;
    dateMode: 'single' | 'range';
    startDate: string;
    endDate?: string;
    parameterized: boolean;
  }) => string;
  isUserScript?: boolean;
}

export interface UserCustomScript {
  id: string;
  category: 'Trading' | 'Funds' | 'Risk' | 'Security' | 'Compliance' | 'Custom';
  statementType?: QueryStatementType;
  title: string;
  description: string;
  tables: string[];
  indexes?: string[];
  sensitivity?: 'Low' | 'Medium' | 'High (Financial)' | 'High (Security/PII)';
  diagnosticNotes?: string[];
  sql: string;
  createdAt: string;
  updatedAt: string;
}

export const QUERY_TEMPLATES: QueryTemplate[] = [
  // =================================================================
  // GIST TEMPLATES: ACCOUNT MAINTENANCE & EXECUTION AUDIT
  // =================================================================
  {
    id: 'remove-demo-live-accounts',
    category: 'Compliance',
    title: 'Remove the word "demo" from all live accounts',
    description: 'Cleans up live account names across your database. When users switch from a practice demo account to a real money account, the word "demo" often stays stuck in their account name. This query safely finds all real live accounts, removes the word "demo" wherever it appears, fixes double spaces, and updates the timestamp.',
    tables: ['TradingAccount'],
    indexes: ['TradingAccount_type_idx', 'TradingAccount_name_idx'],
    sensitivity: 'High (Security/PII)',
    diagnosticNotes: [
      'Only updates accounts marked as "LIVE" that contain the word "demo".',
      'Safely removes the word without cutting into other letters (case-insensitive).',
      'Cleans redundant whitespace with TRIM and REGEXP_REPLACE(\\s+, " ").'
    ],
    generateSql: () => {
      return `-- =====================================================================
-- Scenario: Remove the word "demo" from all the live accounts
-- Target: TradingAccount (type = 'LIVE' and name ILIKE '%demo%')
-- =====================================================================

UPDATE "TradingAccount"
    SET
        "name" = TRIM(
            REGEXP_REPLACE(
                REGEXP_REPLACE("name", '\\ydemo\\y', '', 'gi'),
                '\\s+', ' ', 'g'
            )
        ),
        "updatedAt" = NOW()
    WHERE "type" = 'LIVE'
      AND "name" ILIKE '%demo%';`;
    }
  },
  {
    id: 'orders-closed-sl-tp',
    category: 'Trading',
    title: 'Orders Closed by Exit Triggers (SL/TP)',
    description: 'Shows every trade that was closed automatically because the price reached the client\'s safety limits: Stop Loss (maximum loss limit) or Take Profit (target gain limit). Useful when a client asks why their trade closed.',
    tables: ['TradingAccount', 'Order'],
    indexes: ['TradingAccount_login_key', 'Order_accountId_idx', 'Order_filledAt_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Confirms whether the trade closed due to an automatic price trigger or a manual button click.',
      'Shows the requested price limit versus the exact price the trade exited at.',
      'Audits the closing order ID, quantity, and exact exit timestamp.'
    ],
    generateSql: ({ loginId, dateMode, startDate, endDate, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 130599);
      const dateClause = dateMode === 'single'
        ? (parameterized ? 'o."filledAt"::date = :startDate::date' : `o."filledAt"::date = '${startDate}'::date`)
        : (parameterized 
            ? 'o."filledAt" >= :startDate::timestamp AND o."filledAt" <= :endDate::timestamp' 
            : `o."filledAt" >= '${startDate} 00:00:00' AND o."filledAt" <= '${endDate || startDate} 23:59:59'`);

      return `-- =====================================================================
-- Scenario: Orders Closed by Exit Triggers (SL/TP)
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT
    ta."login"           AS "accountLogin",
    o."id"               AS "closingOrderId",
    o."orderType",
    o."executionType",
    o."priceSource",     -- 'SL_TRIGGER', 'TP_TRIGGER'
    o."reason",          -- 'SL', 'TP'
    o."referencePositionId",
    o."filledQuantity",
    o."averagePrice"     AS "executedPrice",
    o."filledAt"
FROM "TradingAccount" ta
JOIN "Order" o
    ON o."accountId" = ta."id"
WHERE ta."login" = ${loginVal}
  AND (
      o."reason" IN ('SL', 'TP')
      OR o."orderType" IN ('STOP_LOSS', 'TAKE_PROFIT')
      OR o."priceSource" IN ('SL_TRIGGER', 'TP_TRIGGER')
  )
  AND o."status" = 'FILLED'
  AND ${dateClause}
ORDER BY o."filledAt" DESC;`;
    }
  },
  {
    id: 'market-execution-orders',
    category: 'Trading',
    title: 'Market Execution Orders & Position Audit',
    description: 'Gives a complete history of instant trades where the customer clicked Buy or Sell to enter the market immediately. Shows order entry price, final close price, close reason, and whether the client made or lost money.',
    tables: ['TradingAccount', 'Order', 'Position', 'Instrument'],
    indexes: ['TradingAccount_login_key', 'Order_accountId_idx', 'Position_openedByOrderId_idx', 'Position_closedAt_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Connects the initial order request directly to the resulting trade outcome and final dollar profit/loss.',
      'Audits close reasons such as USER (manual close), SL, TP, or STOP_OUT.',
      'Useful for investigating trade disputes and verifying execution results.'
    ],
    generateSql: ({ loginId, dateMode, startDate, endDate, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 130599);
      const dateClause = dateMode === 'single'
        ? (parameterized ? 'p."closedAt"::date = :startDate::date' : `p."closedAt"::date = '${startDate}'::date`)
        : (parameterized 
            ? 'p."closedAt" >= :startDate::timestamp AND p."closedAt" <= :endDate::timestamp' 
            : `p."closedAt" >= '${startDate} 00:00:00' AND p."closedAt" <= '${endDate || startDate} 23:59:59'`);

      return `-- =====================================================================
-- Scenario: Market Execution Orders & Position Realized PnL
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT
    ta."login"                 AS "accountLogin",
    o."id"                     AS "orderId",
    COALESCE(i."symbol", o."externalSymbol") AS "symbol",
    o."orderType",
    o."executionType",
    o."quantity"               AS "orderedQuantity",
    o."averagePrice"           AS "executedOrderPrice",
    o."sl"                     AS "orderStopLoss",
    o."tp"                     AS "orderTakeProfit",
    o."filledAt"               AS "orderFilledAt",
    p."id"                     AS "positionId",
    p."openPrice"              AS "positionOpenPrice",
    p."closePrice"             AS "closeExecutionPrice",
    p."closeReason"            AS "closeReason", -- USER, SL, TP, STOP_OUT, etc.
    p."closedAt"               AS "positionClosedAt",
    p."closedPnl"              AS "realizedPnl"
FROM "TradingAccount" ta
JOIN "Order" o
    ON o."accountId" = ta."id"
JOIN "Position" p
    ON p."openedByOrderId" = o."id"
    AND p."accountId" = ta."id"
LEFT JOIN "Instrument" i
    ON i."id" = o."instrumentId"
WHERE ta."login" = ${loginVal}
  AND (
      o."executionType" = 'MARKET'
      OR (o."executionType" IS NULL AND o."orderType" IN ('BUY', 'SELL'))
  )
  AND ${dateClause}
ORDER BY p."closedAt" DESC;`;
    }
  },
  {
    id: 'limit-orders-audit',
    category: 'Trading',
    title: 'Limit Orders & Position Execution Audit',
    description: 'Checks all "Limit Orders"—trades set to execute in the future only if the price reaches a better, specified rate. Shows which orders are still waiting, which ones got filled, and whether the client got their requested price or better.',
    tables: ['TradingAccount', 'Order', 'Position', 'Instrument'],
    indexes: ['TradingAccount_login_key', 'Order_accountId_idx', 'Position_openedByOrderId_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Monitors pending trades waiting for the market to reach a specific price.',
      'Compares the client\'s requested entry price against the final execution fill.',
      'Tracks final profit or loss once the filled trade was eventually closed.'
    ],
    generateSql: ({ loginId, dateMode, startDate, endDate, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 130599);
      const dateClause = dateMode === 'single'
        ? (parameterized ? 'p."closedAt"::date = :startDate::date' : `p."closedAt"::date = '${startDate}'::date`)
        : (parameterized 
            ? 'p."closedAt" >= :startDate::timestamp AND p."closedAt" <= :endDate::timestamp' 
            : `p."closedAt" >= '${startDate} 00:00:00' AND p."closedAt" <= '${endDate || startDate} 23:59:59'`);

      return `-- =====================================================================
-- Scenario: Limit Orders & Position Execution Audit
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT
    ta."login"                 AS "accountLogin",
    o."id"                     AS "orderId",
    COALESCE(i."symbol", o."externalSymbol") AS "symbol",
    o."orderType",
    o."executionType",
    o."quantity"               AS "orderedQuantity",
    o."price"                  AS "limitPrice",
    o."averagePrice"           AS "executedOrderPrice",
    o."sl"                     AS "orderStopLoss",
    o."tp"                     AS "orderTakeProfit",
    o."filledAt"               AS "orderFilledAt",
    p."id"                     AS "positionId",
    p."openPrice"              AS "positionOpenPrice",
    p."closePrice"             AS "closeExecutionPrice",
    p."closeReason"            AS "closeReason",
    p."closedAt"               AS "positionClosedAt",
    p."closedPnl"              AS "realizedPnl"
FROM "TradingAccount" ta
JOIN "Order" o
    ON o."accountId" = ta."id"
JOIN "Position" p
    ON p."openedByOrderId" = o."id"
    AND p."accountId" = ta."id"
LEFT JOIN "Instrument" i
    ON i."id" = o."instrumentId"
WHERE ta."login" = ${loginVal}
  AND (
      o."executionType" = 'LIMIT'
      OR o."orderType" IN ('BUY_LIMIT', 'SELL_LIMIT')
  )
  AND ${dateClause}
ORDER BY p."closedAt" DESC;`;
    }
  },
  {
    id: 'stop-limit-orders-audit',
    category: 'Trading',
    title: 'Stop Limit Orders & Trigger Audit',
    description: 'Audits two-step pending trades (Stop-Limit orders). These orders wake up when the market hits a trigger price, then attempt to fill within an acceptable price limit. Shows the trigger price, the limit boundary, the final filled price, and the trade outcome.',
    tables: ['TradingAccount', 'Order', 'Position', 'Instrument'],
    indexes: ['TradingAccount_login_key', 'Order_accountId_idx', 'Position_openedByOrderId_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Verifies that the trading system correctly triggered the order when the market crossed the threshold.',
      'Checks if the order was filled within the customer\'s specified maximum price limit.',
      'Useful during rapid price jumps or economic news announcements.'
    ],
    generateSql: ({ loginId, dateMode, startDate, endDate, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 130599);
      const dateClause = dateMode === 'single'
        ? (parameterized ? 'p."closedAt"::date = :startDate::date' : `p."closedAt"::date = '${startDate}'::date`)
        : (parameterized 
            ? 'p."closedAt" >= :startDate::timestamp AND p."closedAt" <= :endDate::timestamp' 
            : `p."closedAt" >= '${startDate} 00:00:00' AND p."closedAt" <= '${endDate || startDate} 23:59:59'`);

      return `-- =====================================================================
-- Scenario: Stop Limit Orders & Trigger Audit
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT
    ta."login"                 AS "accountLogin",
    o."id"                     AS "orderId",
    COALESCE(i."symbol", o."externalSymbol") AS "symbol",
    o."orderType",
    o."executionType",
    o."quantity"               AS "orderedQuantity",
    o."triggerPrice"           AS "stopTriggerPrice",
    o."stopLimitPrice"         AS "limitPrice",
    o."averagePrice"           AS "executedOrderPrice",
    o."sl"                     AS "orderStopLoss",
    o."tp"                     AS "orderTakeProfit",
    o."filledAt"               AS "orderFilledAt",
    p."id"                     AS "positionId",
    p."openPrice"              AS "positionOpenPrice",
    p."closePrice"             AS "closeExecutionPrice",
    p."closeReason"            AS "closeReason",
    p."closedAt"               AS "positionClosedAt",
    p."closedPnl"              AS "realizedPnl"
FROM "TradingAccount" ta
JOIN "Order" o
    ON o."accountId" = ta."id"
JOIN "Position" p
    ON p."openedByOrderId" = o."id"
    AND p."accountId" = ta."id"
LEFT JOIN "Instrument" i
    ON i."id" = o."instrumentId"
WHERE ta."login" = ${loginVal}
  AND (
      o."executionType" = 'STOP_LIMIT'
      OR o."orderType" IN ('BUY_STOP_LIMIT', 'SELL_STOP_LIMIT')
  )
  AND ${dateClause}
ORDER BY p."closedAt" DESC;`;
    }
  },
  {
    id: 'find-transaction-deal-footprint',
    category: 'Funds',
    title: 'Find Balance Transaction & Deal Footprint',
    description: 'Tracks down the entire history of a specific deposit, withdrawal, or balance correction. It reveals every financial record created across the database—including balance adjustments, credit deals, and ledger rows—so you know exactly how the money moved.',
    tables: ['FundTransaction', 'TradingAccount', 'Deal'],
    indexes: ['FundTransaction_accountId_idx', 'Deal_accountId_idx', 'TradingAccount_login_key'],
    sensitivity: 'High (Financial)',
    diagnosticNotes: [
      'Traces a money transfer from the user\'s account through the entire internal ledger.',
      'Shows all linked balance updates and credit events associated with the transaction.',
      'Essential to check before attempting to cancel or reverse any deposit or credit.'
    ],
    generateSql: ({ loginId, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 123456);
      return `-- =====================================================================
-- Scenario: Find FundTransaction & Linked Deal Footprint
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT
    ft.id AS "fundTransactionId",
    ft."accountId",
    ta.login,
    ft.amount,
    ft."operationType",
    ft."transactionType",
    ft."staffId",
    ft."ledgerTransactionId",
    ft."createdAt",
    d.id AS "dealId",
    d."positionId"
FROM "FundTransaction" ft
JOIN "TradingAccount" ta ON ta.id = ft."accountId"
LEFT JOIN "Deal" d ON d."accountId" = ft."accountId"
    AND d."dealType"::text IN ('BALANCE', 'CREDIT', 'CHARGE', 'CORRECTION', 'BONUS')
    AND d.profit = ft.amount
    AND ABS(EXTRACT(EPOCH FROM (d."createdAt" - ft."createdAt"))) < 10
WHERE ta.login = ${loginVal}
ORDER BY ft."createdAt" DESC
LIMIT 10;`;
    }
  },
  {
    id: 'atomic-balance-cleanup',
    category: 'Funds',
    title: 'Atomic Balance & Footprint Cleanup Script',
    description: 'A safe, all-in-one cleanup script designed to cancel an incorrect deposit or mistaken credit. It automatically adjusts the customer\'s balance back to what it should be, removes the erroneous ledger entries, and updates internal staff records in a single safe database step.',
    tables: ['FundTransaction', 'Deal', 'Position', 'LedgerEntry', 'LedgerTransaction', 'TradingAccount', 'StaffWallet'],
    indexes: ['FundTransaction_id_key', 'Deal_id_key', 'Position_id_key'],
    sensitivity: 'High (Financial)',
    diagnosticNotes: [
      'Runs inside an all-or-nothing database transaction: if any part fails, everything cancels safely.',
      'Deducts the mistaken credit amount from the account balance.',
      'Deletes or reverses the linked deal and ledger records so financial reports stay accurate.'
    ],
    generateSql: ({ parameterized }) => {
      const ftIdVal = parameterized ? ':fundTransactionId' : 'YOUR_FUND_TRANSACTION_ID';
      return `-- =====================================================================
-- Scenario: Atomic SQL Balance Cleanup & Reversion Script
-- Target: FundTransaction ID = '${ftIdVal}'
-- Caution: Run within a verified administrative session
-- =====================================================================

DO $$
DECLARE
    v_ft_id TEXT := '${ftIdVal}'; -- <-- Set your FundTransaction ID here
    v_account_id TEXT;
    v_amount NUMERIC;
    v_staff_id TEXT;
    v_ledger_tx_id TEXT;
    v_op_type TEXT;
    v_created_at TIMESTAMPTZ;
    v_deal_id INT;
    v_position_id INT;
BEGIN
    -- 1. Fetch FundTransaction details
    SELECT "accountId", amount, "staffId", "ledgerTransactionId", "operationType"::text, "createdAt"
    INTO v_account_id, v_amount, v_staff_id, v_ledger_tx_id, v_op_type, v_created_at
    FROM "FundTransaction"
    WHERE id = v_ft_id;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'FundTransaction with ID % not found.', v_ft_id;
    END IF;

    -- 2. Find the linked Deal and Position
    SELECT d.id, d."positionId"
    INTO v_deal_id, v_position_id
    FROM "Deal" d
    WHERE d."accountId" = v_account_id
      AND d.profit = v_amount
      AND d.reason::text = 'ADMIN'
      AND d."dealType"::text IN ('BALANCE', 'CREDIT', 'CHARGE', 'CORRECTION', 'BONUS')
      AND ABS(EXTRACT(EPOCH FROM (d."createdAt" - v_created_at))) < 10
    ORDER BY d.id DESC
    LIMIT 1;

    -- 3. Delete Deal first (foreign key to Position)
    IF v_deal_id IS NOT NULL THEN
        DELETE FROM "Deal" WHERE id = v_deal_id;
    END IF;

    -- 4. Delete Position
    IF v_position_id IS NOT NULL THEN
        DELETE FROM "Position" WHERE id = v_position_id;
    END IF;

    -- 5. Delete Ledger entries & LedgerTransaction
    DELETE FROM "LedgerEntry"
    WHERE "referenceId" = v_ft_id
       OR ("ledgerTransactionId" IS NOT NULL AND "ledgerTransactionId" = v_ledger_tx_id);

    IF v_ledger_tx_id IS NOT NULL THEN
        DELETE FROM "LedgerTransaction" WHERE id = v_ledger_tx_id;
    END IF;

    -- 6. Delete FundTransaction
    DELETE FROM "FundTransaction" WHERE id = v_ft_id;

    -- 7. Revert TradingAccount figures
    IF v_op_type IN ('CREDIT', 'BONUS') THEN
        UPDATE "TradingAccount"
        SET credit = credit - v_amount,
            equity = equity - v_amount,
            "freeMargin" = "freeMargin" - v_amount,
            "updatedAt" = NOW()
        WHERE id = v_account_id;
    ELSE
        UPDATE "TradingAccount"
        SET balance = balance - v_amount,
            equity = equity - v_amount,
            "freeMargin" = "freeMargin" - v_amount,
            "updatedAt" = NOW()
        WHERE id = v_account_id;
    END IF;

    -- 8. Refund StaffWallet (if this was a deposit deducted from staff balance)
    IF v_staff_id IS NOT NULL AND v_amount > 0 AND v_op_type NOT IN ('CREDIT', 'BONUS') THEN
        UPDATE "StaffWallet"
        SET balance = balance + v_amount,
            "updatedAt" = NOW()
        WHERE "staffId" = v_staff_id;
    END IF;

    RAISE NOTICE 'Successfully removed balance entry footprint for Account ID: %, Amount: %', v_account_id, v_amount;
END $$;`;
    }
  },
  // 1. TRADING & EXECUTION
  {
    id: 'slippage-analysis',
    category: 'Trading',
    title: 'Order Slippage & Execution Discrepancy',
    description: 'Measures the difference between the price the customer saw when they clicked "Trade" and the actual price their order got filled at. Calculates this price difference (slippage) in points and shows how many milliseconds it took to execute.',
    tables: ['TradingAccount', 'Order', 'Deal', 'Instrument'],
    indexes: ['TradingAccount_login_key', 'Order_accountId_idx', 'Deal_orderId_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Highlights orders that suffered negative price slippage (worse fill than requested).',
      'Measures execution delay: longer delays during news events often lead to price differences.',
      'Helps answer customer tickets complaining that they received a different price than expected.'
    ],
    generateSql: ({ loginId, dateMode, startDate, endDate, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      const dateClause = dateMode === 'single'
        ? (parameterized ? 'o."createdAt"::date = :startDate::date' : `o."createdAt"::date = '${startDate}'::date`)
        : (parameterized 
            ? 'o."createdAt" >= :startDate::timestamp AND o."createdAt" <= :endDate::timestamp' 
            : `o."createdAt" >= '${startDate} 00:00:00' AND o."createdAt" <= '${endDate || startDate} 23:59:59'`);

      return `-- =====================================================================
-- Scenario: Order Slippage & Execution Discrepancy
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    ta.currency AS account_currency,
    o.id AS order_id,
    o."orderType",
    o."externalSymbol" AS symbol,
    o."orderVolume" AS ordered_volume,
    d.id AS deal_id,
    d.volume AS filled_volume,
    d."requestedPrice",
    d."executionPrice",
    ROUND((d."executionPrice" - d."requestedPrice")::numeric, 5) AS slippage_points,
    d.entry AS deal_entry,
    o."createdAt" AS order_placed_at,
    d."createdAt" AS deal_executed_at,
    ROUND(EXTRACT(EPOCH FROM (d."createdAt" - o."createdAt"))::numeric, 3) AS execution_latency_sec
FROM "TradingAccount" ta
JOIN "Order" o ON o."accountId" = ta.id
JOIN "Deal" d ON d."orderId" = o.id
WHERE ta.login = ${loginVal}
  AND ${dateClause}
ORDER BY d."createdAt" DESC;`;
    }
  },
  {
    id: 'rejected-orders',
    category: 'Trading',
    title: 'Rejected, Cancelled & Expired Orders',
    description: 'Lists all trades that could not be completed, along with the plain-language reason why the system rejected or cancelled them—such as not having enough money in the account, the market being closed, or the order expiring.',
    tables: ['TradingAccount', 'Order', 'ExecutionEvent'],
    indexes: ['TradingAccount_login_key', 'Order_accountId_idx', 'ExecutionEvent_orderId_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Shows the exact error code returned by the trading engine or liquidity gateway.',
      'Helps support teams immediately tell a customer why their trade was declined.',
      'Filters out filled trades to focus strictly on failed or cancelled attempts.'
    ],
    generateSql: ({ loginId, dateMode, startDate, endDate, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      const dateClause = dateMode === 'single'
        ? (parameterized ? 'o."createdAt"::date = :startDate::date' : `o."createdAt"::date = '${startDate}'::date`)
        : (parameterized 
            ? 'o."createdAt" >= :startDate::timestamp AND o."createdAt" <= :endDate::timestamp' 
            : `o."createdAt" >= '${startDate} 00:00:00' AND o."createdAt" <= '${endDate || startDate} 23:59:59'`);

      return `-- =====================================================================
-- Scenario: Rejected & Cancelled Orders Investigation
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    o.id AS order_id,
    o."externalSymbol" AS symbol,
    o."orderType",
    o."orderStatus",
    o."orderVolume",
    o."orderPrice",
    o."priceCurrent",
    ee."eventType",
    ee."reason" AS rejection_reason,
    ee."status" AS execution_status,
    ee."createdAt" AS event_timestamp,
    o."createdAt" AS order_created_at
FROM "TradingAccount" ta
JOIN "Order" o ON o."accountId" = ta.id
LEFT JOIN "ExecutionEvent" ee ON ee."orderId" = o.id
WHERE ta.login = ${loginVal}
  AND o."orderStatus" IN ('CANCELLED', 'REJECTED', 'EXPIRED')
  AND ${dateClause}
ORDER BY o."createdAt" DESC;`;
    }
  },
  {
    id: 'open-positions-pnl',
    category: 'Trading',
    title: 'Open Positions & Real-Time Floating PnL',
    description: 'A live snapshot of all trades currently active and open in the market right now. Shows how much money each trade is currently making or losing (floating profit/loss), overnight holding fees (swaps), commission costs, and required margin.',
    tables: ['TradingAccount', 'Position', 'Instrument'],
    indexes: ['TradingAccount_login_key', 'Position_accountId_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Real-time view of current open risk for the account.',
      'Shows overnight holding fees (swaps) accumulated on trades kept open across days.',
      'Sorted by largest floating gain or loss so you can spot high-risk trades instantly.'
    ],
    generateSql: ({ loginId, dateMode, startDate, endDate, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      const dateClause = dateMode === 'single'
        ? (parameterized ? 'p."createdAt"::date <= :startDate::date' : `p."createdAt"::date <= '${startDate}'::date`)
        : (parameterized 
            ? 'p."createdAt" >= :startDate::timestamp AND p."createdAt" <= :endDate::timestamp' 
            : `p."createdAt" >= '${startDate} 00:00:00' AND p."createdAt" <= '${endDate || startDate} 23:59:59'`);

      return `-- =====================================================================
-- Scenario: Open Positions & Floating PnL Snapshot
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    ta.leverage AS account_leverage,
    p.id AS position_id,
    p."externalSymbol" AS symbol,
    p."positionType",
    p.volume,
    p."openPrice",
    p.sl AS stop_loss,
    p.tp AS take_profit,
    p.swap AS accrued_swap,
    p.commission AS position_commission,
    p."floatingPnl",
    p."realizedPnl",
    p."createdAt" AS position_opened_at,
    p."updatedAt" AS last_updated_at
FROM "TradingAccount" ta
JOIN "Position" p ON p."accountId" = ta.id
WHERE ta.login = ${loginVal}
  AND p.volume > 0
  AND ${dateClause}
ORDER BY p."createdAt" DESC;`;
    }
  },

  // 2. FUNDS & BALANCES
  {
    id: 'fund-transfers',
    category: 'Funds',
    title: 'Deposit, Withdrawal & UTR Tracking',
    description: 'A detailed bank and payment log showing every deposit and withdrawal. Displays the payment method (bank transfer, credit card, crypto), reference numbers (like bank UTR codes), approval status, and which staff member approved the payout.',
    tables: ['TradingAccount', 'FundTransaction', 'Staff', 'BankAccount'],
    indexes: ['TradingAccount_login_key', 'FundTransaction_accountId_createdAt_idx', 'FundTransaction_utrNumber_key'],
    sensitivity: 'High (Financial)',
    diagnosticNotes: [
      'Complete history of money coming into and going out of the account.',
      'Includes bank transaction reference / UTR numbers to match with bank statements.',
      'Identifies which team member approved or processed each withdrawal.'
    ],
    generateSql: ({ loginId, dateMode, startDate, endDate, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      const dateClause = dateMode === 'single'
        ? (parameterized ? 'ft."createdAt"::date = :startDate::date' : `ft."createdAt"::date = '${startDate}'::date`)
        : (parameterized 
            ? 'ft."createdAt" >= :startDate::timestamp AND ft."createdAt" <= :endDate::timestamp' 
            : `ft."createdAt" >= '${startDate} 00:00:00' AND ft."createdAt" <= '${endDate || startDate} 23:59:59'`);

      return `-- =====================================================================
-- Scenario: Deposit, Withdrawal & UTR Verification
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    ta.currency AS account_currency,
    ft.id AS transaction_id,
    ft."transactionType",
    ft."operationType",
    ft.amount,
    ft.status,
    ft."utrNumber",
    ft."paymentMode",
    ft."paymentProvider",
    ft."currentBalance" AS balance_after_tx,
    ft.commission,
    ft.remarks,
    st.name AS approved_by_staff,
    ft."processedAt",
    ft."createdAt" AS requested_at
FROM "TradingAccount" ta
JOIN "FundTransaction" ft ON ft."accountId" = ta.id
LEFT JOIN "Staff" st ON st.id = ft."processedByStaffId"
WHERE ta.login = ${loginVal}
  AND ${dateClause}
ORDER BY ft."createdAt" DESC;`;
    }
  },
  {
    id: 'failed-funds',
    category: 'Funds',
    title: 'Failed & Rejected Fund Transactions',
    description: 'Finds all deposits or withdrawals that failed, got cancelled, or were rejected. Shows the error code, payment gateway message, and whether money was returned to the customer\'s balance.',
    tables: ['TradingAccount', 'FundTransaction'],
    indexes: ['TradingAccount_login_key', 'FundTransaction_accountId_createdAt_idx'],
    sensitivity: 'High (Financial)',
    diagnosticNotes: [
      'Quickly identifies why a deposit failed (e.g., card expired, bank declined, incorrect reference).',
      'Checks if a failed withdrawal was safely refunded back to the client\'s trading balance.',
      'Helps support agents resolve payment issues while talking to the customer.'
    ],
    generateSql: ({ loginId, dateMode, startDate, endDate, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      const dateClause = dateMode === 'single'
        ? (parameterized ? 'ft."createdAt"::date = :startDate::date' : `ft."createdAt"::date = '${startDate}'::date`)
        : (parameterized 
            ? 'ft."createdAt" >= :startDate::timestamp AND ft."createdAt" <= :endDate::timestamp' 
            : `ft."createdAt" >= '${startDate} 00:00:00' AND ft."createdAt" <= '${endDate || startDate} 23:59:59'`);

      return `-- =====================================================================
-- Scenario: Failed & Rejected Fund Transactions
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    ft.id AS transaction_id,
    ft."transactionType",
    ft.amount,
    ft.status,
    ft."failureCode",
    ft."failureMessage",
    ft."reversalOfId",
    ft."externalReference",
    ft."paymentProvider",
    ft.remarks,
    ft."createdAt" AS failed_at
FROM "TradingAccount" ta
JOIN "FundTransaction" ft ON ft."accountId" = ta.id
WHERE ta.login = ${loginVal}
  AND ft.status IN ('FAILED', 'REJECTED', 'CANCELLED')
  AND ${dateClause}
ORDER BY ft."createdAt" DESC;`;
    }
  },

  // 3. RISK & LIQUIDATION
  {
    id: 'stopout-liquidation',
    category: 'Risk',
    title: 'Forced Trade Closures When Money Runs Out (Stop-Out & Liquidations)',
    description: 'Investigates when an account runs out of money to keep its trades open. When account equity drops too low, the trading system automatically closes trades to protect against debt. This query shows every automatic forced closure, the account balance at that moment, and how low the funds dropped.',
    tables: ['TradingAccount', 'MarginLog', 'Position'],
    indexes: ['TradingAccount_login_key', 'MarginLog_accountId_createdAt_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Shows when account funds fell below the safety limit (often 50% or 100%), triggering forced trade closures.',
      'Compares actual account value (equity) against the minimum money required to keep trades running (used margin).',
      'Helps explain to a customer why their trades were automatically closed by the system.'
    ],
    generateSql: ({ loginId, dateMode, startDate, endDate, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      const dateClause = dateMode === 'single'
        ? (parameterized ? 'ml."createdAt"::date = :startDate::date' : `ml."createdAt"::date = '${startDate}'::date`)
        : (parameterized 
            ? 'ml."createdAt" >= :startDate::timestamp AND ml."createdAt" <= :endDate::timestamp' 
            : `ml."createdAt" >= '${startDate} 00:00:00' AND ml."createdAt" <= '${endDate || startDate} 23:59:59'`);

      return `-- =====================================================================
-- Scenario: Stop-Out & Margin Call Liquidations
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    ta.leverage AS account_leverage,
    ml.id AS margin_log_id,
    ml."marginLevel" AS margin_level_pct,
    ml."usedMargin",
    ml."freeMargin",
    ml.equity,
    ml.balance,
    ml."eventType",
    ml."createdAt" AS logged_at
FROM "TradingAccount" ta
JOIN "MarginLog" ml ON ml."accountId" = ta.id
WHERE ta.login = ${loginVal}
  AND (ml."eventType" IN ('MARGIN_CALL', 'STOP_OUT', 'LIQUIDATION') OR ml."marginLevel" <= 50.0)
  AND ${dateClause}
ORDER BY ml."createdAt" DESC;`;
    }
  },
  {
    id: 'daily-pnl-history',
    category: 'Risk',
    title: 'Daily Balance & Profit Calendar (Day-by-Day Financial History)',
    description: 'A day-by-day financial calendar for an account. Shows closing balance, account value, deposits, withdrawals, daily trading profit or loss, overnight holding fees (swaps), and trading commissions for each day.',
    tables: ['TradingAccount', 'DailyPnL'],
    indexes: ['TradingAccount_login_key', 'DailyPnL_accountId_date_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Daily breakdown showing how the account balance and equity grew or shrank day-by-day.',
      'Checks if daily balance changes match: starting balance + deposits - withdrawals + trading profit - fees.',
      'Ideal for generating periodic customer account statements or answering client balance questions.'
    ],
    generateSql: ({ loginId, dateMode, startDate, endDate, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      const dateClause = dateMode === 'single'
        ? (parameterized ? 'dp."date"::date = :startDate::date' : `dp."date"::date = '${startDate}'::date`)
        : (parameterized 
            ? 'dp."date" >= :startDate::date AND dp."date" <= :endDate::date' 
            : `dp."date" >= '${startDate}'::date AND dp."date" <= '${endDate || startDate}'::date`);

      return `-- =====================================================================
-- Scenario: Daily PnL & Equity History
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    dp."date",
    dp.balance AS closing_balance,
    dp.equity AS closing_equity,
    dp."realizedPnL",
    dp."unrealizedPnL",
    dp."depositWithdrawal" AS net_funding,
    dp."swapTotal",
    dp."commissionTotal"
FROM "TradingAccount" ta
JOIN "DailyPnL" dp ON dp."accountId" = ta.id
WHERE ta.login = ${loginVal}
  AND ${dateClause}
ORDER BY dp."date" DESC;`;
    }
  },

  // 4. SECURITY & SESSIONS
  {
    id: 'active-sessions-ip',
    category: 'Security',
    title: 'Login Security History (Devices, IP Locations & Active Logins)',
    description: 'Tracks every time the user logged into their account, what device they used (mobile app, desktop browser), their internet IP address, and whether the login session is still active. Helps spot unauthorized logins or account sharing.',
    tables: ['TradingAccount', 'Session'],
    indexes: ['TradingAccount_login_key', 'Session_accountId_idx'],
    sensitivity: 'High (Security/PII)',
    diagnosticNotes: [
      'Spots logins from different cities or countries within a short time (impossible travel).',
      'Shows whether the client logged in using an iPhone, Android, web browser, or automated script.',
      'Verifies if old or suspicious login sessions are still active or properly expired.'
    ],
    generateSql: ({ loginId, dateMode, startDate, endDate, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      const dateClause = dateMode === 'single'
        ? (parameterized ? 's."createdAt"::date = :startDate::date' : `s."createdAt"::date = '${startDate}'::date`)
        : (parameterized 
            ? 's."createdAt" >= :startDate::timestamp AND s."createdAt" <= :endDate::timestamp' 
            : `s."createdAt" >= '${startDate} 00:00:00' AND s."createdAt" <= '${endDate || startDate} 23:59:59'`);

      return `-- =====================================================================
-- Scenario: Device Logins, IP Tracking & User-Agent History
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    s.id AS session_id,
    s."ipAddress",
    s."deviceType",
    s."userAgent",
    s."isActive",
    s."createdAt" AS session_started_at,
    s."expiresAt" AS session_expires_at
FROM "TradingAccount" ta
JOIN "Session" s ON s."accountId" = ta.id
WHERE ta.login = ${loginVal}
  AND ${dateClause}
ORDER BY s."createdAt" DESC;`;
    }
  },

  // 5. COMPLIANCE & AUDIT
  {
    id: 'account-audit-trail',
    category: 'Compliance',
    title: 'Account Settings History & Staff Changes (Audit Trail)',
    description: 'A security log showing every change made to the account settings—such as password resets, changes to leverage limits, switching to read-only mode, or profile updates. Reveals who made each change and what the value was before and after.',
    tables: ['TradingAccount', 'AuditLog'],
    indexes: ['TradingAccount_login_key', 'AuditLog_entity_entityId_idx', 'AuditLog_createdAt_idx'],
    sensitivity: 'High (Security/PII)',
    diagnosticNotes: [
      'Captures exact before-and-after values (for example, leverage changed from 1:100 to 1:500).',
      'Shows whether the change was made by a support staff member, the client themselves, or an automatic system rule.',
      'Crucial for investigating client complaints about unexpected setting changes before trading losses.'
    ],
    generateSql: ({ loginId, dateMode, startDate, endDate, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      const dateClause = dateMode === 'single'
        ? (parameterized ? 'al."createdAt"::date = :startDate::date' : `al."createdAt"::date = '${startDate}'::date`)
        : (parameterized 
            ? 'al."createdAt" >= :startDate::timestamp AND al."createdAt" <= :endDate::timestamp' 
            : `al."createdAt" >= '${startDate} 00:00:00' AND al."createdAt" <= '${endDate || startDate} 23:59:59'`);

      return `-- =====================================================================
-- Scenario: Account Settings & Privilege Audit Trail
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    al.id AS audit_id,
    al."actorType",
    al."actorId",
    al.action,
    al.entity,
    al."entityId",
    al.before,
    al.after,
    al."metadata",
    al."createdAt" AS changed_at
FROM "TradingAccount" ta
JOIN "AuditLog" al ON (al.entity = 'TradingAccount' AND al."entityId" = ta.id::text)
WHERE ta.login = ${loginVal}
  AND ${dateClause}
ORDER BY al."createdAt" DESC;`;
    }
  },
  {
    id: 'dealer-interventions',
    category: 'Compliance',
    title: 'Manual Staff Overrides & Dealer Actions',
    description: 'Shows any manual adjustments made by dealing desk staff or support managers. Lists trades that were manually reviewed, price quotes adjusted, orders manually rejected, or special approvals given by staff instead of the automatic system.',
    tables: ['TradingAccount', 'DealerIntervention', 'DealerAction', 'Staff'],
    indexes: ['TradingAccount_login_key', 'DealerIntervention_accountId_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Reveals if a customer trade was held for manual review by a staff member before being filled.',
      'Shows the staff member\'s name and the specific action taken (accepted, requoted at a new price, or rejected).',
      'Essential for handling client disputes where manual human intervention is suspected.'
    ],
    generateSql: ({ loginId, dateMode, startDate, endDate, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      const dateClause = dateMode === 'single'
        ? (parameterized ? 'di."createdAt"::date = :startDate::date' : `di."createdAt"::date = '${startDate}'::date`)
        : (parameterized 
            ? 'di."createdAt" >= :startDate::timestamp AND di."createdAt" <= :endDate::timestamp' 
            : `di."createdAt" >= '${startDate} 00:00:00' AND di."createdAt" <= '${endDate || startDate} 23:59:59'`);

      return `-- =====================================================================
-- Scenario: Dealer Overrides & Manual Interventions
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    di.id AS intervention_id,
    di.type AS intervention_type,
    di.reason,
    di.status,
    st.name AS assigned_dealer_name,
    da.action AS dealer_action_taken,
    da."createdAt" AS action_timestamp,
    di."createdAt" AS request_timestamp
FROM "TradingAccount" ta
JOIN "DealerIntervention" di ON di."accountId" = ta.id
LEFT JOIN "Staff" st ON st.id = di."assignedToStaffId"
LEFT JOIN "DealerAction" da ON da."interventionId" = di.id
WHERE ta.login = ${loginVal}
  AND ${dateClause}
ORDER BY di."createdAt" DESC;`;
    }
  },

  // =================================================================
  // RECONCILIATION, MULTI-ACCOUNT ABUSE & REMEDIATION (NEW SUITE)
  // =================================================================
  {
    id: 'balance-equity-drift',
    category: 'Risk',
    title: 'Account Math Check (Balance vs. Equity Drift)',
    description: 'Checks if the account numbers add up correctly: Account Equity should always equal the Cash Balance plus the live profit or loss on all open trades. If the numbers don\'t match, this query flags the account as an anomaly caused by stuck trades, pricing glitches, or quote disconnects.',
    tables: ['TradingAccount', 'Position'],
    indexes: ['TradingAccount_login_key', 'Position_accountId_idx'],
    sensitivity: 'High (Financial)',
    diagnosticNotes: [
      'Flags accounts where recorded equity differs from (Balance + Open Trade Profit/Loss) by more than 5 cents ($0.05).',
      'Catches system glitches where a trade didn\'t update equity properly or price delays froze calculations.',
      'Helps support and risk desks prevent incorrect automatic liquidations.'
    ],
    generateSql: ({ loginId, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      return `-- =====================================================================
-- Scenario: Live Balance vs. Equity Drift Detection
-- Target: TradingAccount login = ${loginVal} (or all accounts with discrepancy)
-- =====================================================================

WITH PositionAggregates AS (
    SELECT
        p."accountId",
        COUNT(p.id)                               AS open_position_count,
        COALESCE(SUM(p."floatingPnL"), 0.00)      AS total_floating_pnl,
        COALESCE(SUM(p.swap), 0.00)              AS total_swap,
        COALESCE(SUM(p.commission), 0.00)        AS total_commission
    FROM "Position" p
    WHERE p.volume > 0
    GROUP BY p."accountId"
)
SELECT
    ta.login                                    AS account_login,
    ta.name                                     AS account_name,
    ta.status                                   AS account_status,
    ta.currency                                 AS currency,
    ta.balance                                  AS recorded_balance,
    ta.equity                                   AS recorded_equity,
    COALESCE(pa.open_position_count, 0)         AS active_positions,
    COALESCE(pa.total_floating_pnl, 0.00)       AS live_floating_pnl,
    ROUND(ta.balance + COALESCE(pa.total_floating_pnl, 0.00), 2) AS expected_equity,
    ROUND(ta.equity - (ta.balance + COALESCE(pa.total_floating_pnl, 0.00)), 2) AS equity_drift,
    CASE
        WHEN ABS(ta.equity - (ta.balance + COALESCE(pa.total_floating_pnl, 0.00))) > 0.05 THEN 'DESYNC_ANOMALY'
        ELSE 'SYNCHRONIZED'
    END                                         AS sync_status
FROM "TradingAccount" ta
LEFT JOIN PositionAggregates pa ON pa."accountId" = ta.id
WHERE (
    ta.login = ${loginVal}
    OR ABS(ta.equity - (ta.balance + COALESCE(pa.total_floating_pnl, 0.00))) > 0.05
)
ORDER BY ABS(ta.equity - (ta.balance + COALESCE(pa.total_floating_pnl, 0.00))) DESC;`;
    }
  },
  {
    id: 'nbp-eligibility-deficits',
    category: 'Funds',
    title: 'Negative Balance Protection (NBP) & Accounts in Debt',
    description: 'Finds client accounts that have fallen below zero ($0.00) due to extreme price jumps (such as over weekends or high-volatility news). Identifies accounts that qualify for Negative Balance Protection—a standard safety guarantee where the broker cancels client debt so they don\'t owe money.',
    tables: ['TradingAccount', 'FundTransaction', 'Position'],
    indexes: ['TradingAccount_login_key', 'FundTransaction_accountId_idx'],
    sensitivity: 'High (Financial)',
    diagnosticNotes: [
      'Finds all accounts with a negative cash balance (balance < $0.00).',
      'Checks if the client still has open trades running before approving debt forgiveness.',
      'Excludes accounts that already had their negative balance forgiven in the last 14 days.'
    ],
    generateSql: ({ loginId, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      return `-- =====================================================================
-- Scenario: Negative Balance Protection (NBP) Eligibility & Unprocessed Deficits
-- Target: TradingAccount (balance < 0 and no unprocessed/completed NBP credit)
-- =====================================================================

SELECT
    ta.id                                       AS account_id,
    ta.login                                    AS account_login,
    ta.name                                     AS account_name,
    ta.status                                   AS account_status,
    ta.currency                                 AS currency,
    ta.balance                                  AS deficit_balance,
    ta.equity                                   AS current_equity,
    (
        SELECT COUNT(*)
        FROM "Position" p
        WHERE p."accountId" = ta.id AND p.volume > 0
    )                                           AS open_positions,
    (
        SELECT COUNT(*)
        FROM "FundTransaction" ft
        WHERE ft."accountId" = ta.id
          AND ft.type = 'NEGATIVE_BALANCE_PROTECTION'
          AND ft.status IN ('PENDING', 'PROCESSING', 'COMPLETED')
    )                                           AS existing_nbp_adjustments,
    ta."createdAt"                              AS account_created_at
FROM "TradingAccount" ta
WHERE ta.balance < 0.00
  AND (
      ta.login = ${loginVal}
      OR ta.status != 'CLOSED'
  )
  AND NOT EXISTS (
      SELECT 1
      FROM "FundTransaction" ft
      WHERE ft."accountId" = ta.id
        AND ft.type = 'NEGATIVE_BALANCE_PROTECTION'
        AND ft.status IN ('PENDING', 'PROCESSING', 'COMPLETED')
        AND ft."createdAt" >= NOW() - INTERVAL '14 days'
  )
ORDER BY ta.balance ASC;`;
    }
  },
  {
    id: 'cash-ledger-reconciliation',
    category: 'Funds',
    title: 'Total Cash Audit (Money In/Out vs. Recorded Balance)',
    description: 'An independent audit that recalculates the customer\'s balance from scratch. Adds up all deposits, subtracts all withdrawals, adds realized trade profits, and subtracts all fees and commissions. Compares this calculated sum directly against the stored balance to catch any missing money or database errors.',
    tables: ['TradingAccount', 'FundTransaction', 'Deal', 'Position'],
    indexes: ['TradingAccount_login_key', 'FundTransaction_accountId_idx', 'Deal_accountId_idx'],
    sensitivity: 'High (Financial)',
    diagnosticNotes: [
      'Calculates theoretical balance: (Deposits - Withdrawals + Credits) + Trade Profits - Commissions - Holding Fees.',
      'Compares theoretical balance against the recorded balance to reveal any mathematical difference.',
      'Catches unrecorded deposits, database synchronization errors, or unauthorized manual balance adjustments.'
    ],
    generateSql: ({ loginId, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      return `-- =====================================================================
-- Scenario: Full Cash Ledger vs. Account Balance Reconciliation
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

WITH LedgerFundTxs AS (
    SELECT
        ft."accountId",
        COALESCE(SUM(CASE WHEN ft.type = 'DEPOSIT' AND ft.status = 'COMPLETED' THEN ft.amount ELSE 0 END), 0.00) AS total_deposits,
        COALESCE(SUM(CASE WHEN ft.type = 'WITHDRAWAL' AND ft.status = 'COMPLETED' THEN ft.amount ELSE 0 END), 0.00) AS total_withdrawals,
        COALESCE(SUM(CASE WHEN ft.type = 'CREDIT_CORRECTION' AND ft.status = 'COMPLETED' THEN ft.amount ELSE 0 END), 0.00) AS total_credits,
        COALESCE(SUM(CASE WHEN ft.type = 'NEGATIVE_BALANCE_PROTECTION' AND ft.status = 'COMPLETED' THEN ft.amount ELSE 0 END), 0.00) AS total_nbp
    FROM "FundTransaction" ft
    GROUP BY ft."accountId"
),
LedgerDeals AS (
    SELECT
        d."accountId",
        COALESCE(SUM(
            CASE 
                WHEN d.entry IN ('OUT', 'IN_OUT') THEN (d."executionPrice" - d."requestedPrice") * d.volume
                ELSE 0.00 
            END
        ), 0.00) AS total_realized_profit
    FROM "Deal" d
    GROUP BY d."accountId"
),
LedgerPositions AS (
    SELECT
        p."accountId",
        COALESCE(SUM(p.swap), 0.00) AS total_swaps,
        COALESCE(SUM(p.commission), 0.00) AS total_commissions
    FROM "Position" p
    GROUP BY p."accountId"
)
SELECT
    ta.login                                    AS account_login,
    ta.name                                     AS account_name,
    ta.balance                                  AS recorded_balance,
    COALESCE(lft.total_deposits, 0.00)          AS total_deposits,
    COALESCE(lft.total_withdrawals, 0.00)       AS total_withdrawals,
    COALESCE(lft.total_credits, 0.00)           AS total_credits,
    COALESCE(lft.total_nbp, 0.00)               AS total_nbp_adjustments,
    COALESCE(ld.total_realized_profit, 0.00)    AS total_realized_deal_profit,
    COALESCE(lp.total_swaps, 0.00)              AS total_swaps_charged,
    COALESCE(lp.total_commissions, 0.00)        AS total_commissions_charged,
    ROUND(
        (COALESCE(lft.total_deposits, 0) - COALESCE(lft.total_withdrawals, 0) + COALESCE(lft.total_credits, 0) + COALESCE(lft.total_nbp, 0))
        + COALESCE(ld.total_realized_profit, 0) 
        - COALESCE(lp.total_commissions, 0) 
        - COALESCE(lp.total_swaps, 0),
        2
    )                                           AS calculated_theoretical_balance,
    ROUND(
        ta.balance - (
            (COALESCE(lft.total_deposits, 0) - COALESCE(lft.total_withdrawals, 0) + COALESCE(lft.total_credits, 0) + COALESCE(lft.total_nbp, 0))
            + COALESCE(ld.total_realized_profit, 0) 
            - COALESCE(lp.total_commissions, 0) 
            - COALESCE(lp.total_swaps, 0)
        ),
        2
    )                                           AS balance_discrepancy
FROM "TradingAccount" ta
LEFT JOIN LedgerFundTxs lft ON lft."accountId" = ta.id
LEFT JOIN LedgerDeals ld ON ld."accountId" = ta.id
LEFT JOIN LedgerPositions lp ON lp."accountId" = ta.id
WHERE ta.login = ${loginVal}
ORDER BY ABS(ta.balance) DESC;`;
    }
  },
  {
    id: 'stranded-positions-suspended-accounts',
    category: 'Risk',
    title: 'Stranded Live Trades on Frozen / Suspended Accounts',
    description: 'High-priority risk check: Finds accounts that were suspended, locked, or put into read-only mode by support or compliance, but still have active live trades running in the market. Because the customer is locked out and cannot manage or close these trades, they face uncontrolled risk.',
    tables: ['TradingAccount', 'Position', 'User'],
    indexes: ['TradingAccount_type_idx', 'Position_accountId_idx'],
    sensitivity: 'High (Financial)',
    diagnosticNotes: [
      'High operational risk: Customer account is locked or suspended, but live trades remain open in the market.',
      'The customer cannot close or manage these trades due to account login restrictions.',
      'Requires immediate review by risk desk to close trades or protect against further losses.'
    ],
    generateSql: ({ loginId, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      return `-- =====================================================================
-- Scenario: Suspended / Read-Only Accounts with Stranded Open Positions
-- Target: TradingAccount status IN ('SUSPENDED', 'READ_ONLY') with active positions
-- =====================================================================

SELECT
    ta.login                                    AS account_login,
    ta.name                                     AS account_name,
    ta.status                                   AS account_status,
    u.email                                     AS client_email,
    p.id                                        AS position_id,
    p."externalSymbol"                          AS symbol,
    p.side                                      AS side,
    p.volume                                    AS lot_size,
    p."openPrice"                               AS open_price,
    p."currentPrice"                            AS current_price,
    p."floatingPnL"                             AS floating_pnl,
    p."createdAt"                               AS position_opened_at,
    ROUND(EXTRACT(EPOCH FROM (NOW() - p."createdAt")) / 3600::numeric, 1) AS hours_stranded
FROM "TradingAccount" ta
JOIN "User" u ON u.id = ta."userId"
JOIN "Position" p ON p."accountId" = ta.id
WHERE ta.status IN ('SUSPENDED', 'READ_ONLY')
  AND p.volume > 0
  AND (
      ta.login = ${loginVal}
      OR ${loginVal} = 100234
  )
ORDER BY ABS(p."floatingPnL") DESC, p."createdAt" ASC;`;
    }
  },
  {
    id: 'dormant-accounts-positive-balance',
    category: 'Compliance',
    title: 'Dormant Accounts with Positive Cash Balance (Inactive 90+ Days)',
    description: 'Finds active accounts holding real money that have had zero trades and no user logins for over 90, 180, or 365 days. Used for compliance reporting of unclaimed client money and applying inactivity fees if permitted.',
    tables: ['TradingAccount', 'Deal', 'UserSession'],
    indexes: ['TradingAccount_login_key', 'Deal_accountId_idx', 'UserSession_userId_idx'],
    sensitivity: 'Low',
    diagnosticNotes: [
      'Lists accounts with cash balances (> $0.00) where the user hasn\'t logged in or traded for at least 90 days.',
      'Calculates the exact number of days since the user\'s last trade or login session.',
      'Helps compliance teams contact customers or handle unclaimed funds according to financial regulations.'
    ],
    generateSql: ({ loginId, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      return `-- =====================================================================
-- Scenario: Dormant / Abandoned Accounts with Positive Withdrawable Balance
-- Target: TradingAccount (status = 'ACTIVE', balance > 0, inactive > 90 days)
-- =====================================================================

WITH LastActivity AS (
    SELECT
        ta.id                                   AS account_id,
        MAX(d."createdAt")                      AS last_deal_time,
        MAX(us."createdAt")                     AS last_session_time
    FROM "TradingAccount" ta
    LEFT JOIN "Deal" d ON d."accountId" = ta.id
    LEFT JOIN "UserSession" us ON us."userId" = ta."userId"
    GROUP BY ta.id
)
SELECT
    ta.login                                    AS account_login,
    ta.name                                     AS account_name,
    ta.status                                   AS account_status,
    ta.currency                                 AS currency,
    ta.balance                                  AS dormant_balance,
    la.last_deal_time                           AS last_trade_executed,
    la.last_session_time                        AS last_user_login,
    GREATEST(la.last_deal_time, la.last_session_time, ta."createdAt") AS last_known_activity,
    EXTRACT(DAY FROM NOW() - GREATEST(la.last_deal_time, la.last_session_time, ta."createdAt"))::int AS days_dormant
FROM "TradingAccount" ta
JOIN LastActivity la ON la.account_id = ta.id
WHERE ta.status = 'ACTIVE'
  AND ta.balance > 0.00
  AND (
      GREATEST(la.last_deal_time, la.last_session_time, ta."createdAt") < NOW() - INTERVAL '90 days'
      OR GREATEST(la.last_deal_time, la.last_session_time, ta."createdAt") IS NULL
  )
  AND (
      ta.login = ${loginVal}
      OR ${loginVal} = 100234
  )
ORDER BY ta.balance DESC
LIMIT 100;`;
    }
  },
  {
    id: 'consolidated-portfolio-exposure',
    category: 'Risk',
    title: 'Combined Multi-Account Overview for One User (Global Exposure)',
    description: 'Combines all trading accounts owned by the same person into a single overview. Adds up their total cash balance, combined equity, and all active open trades across every account to show the person\'s true total financial position.',
    tables: ['TradingAccount', 'User', 'Position'],
    indexes: ['TradingAccount_userId_idx', 'Position_accountId_idx'],
    sensitivity: 'High (Financial)',
    diagnosticNotes: [
      'Combines all separate logins and accounts belonging to the same registered person.',
      'Shows overall cash balance, total equity, and net trade directions across all their accounts.',
      'Catches clients trying to get around single-account maximum trade size limits by spreading trades across multiple accounts.'
    ],
    generateSql: ({ loginId, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);
      return `-- =====================================================================
-- Scenario: Consolidated Multi-Account Portfolio & Global Exposure
-- Target: All accounts sharing the same User.id as login = ${loginVal}
-- =====================================================================

WITH TargetUser AS (
    SELECT "userId" 
    FROM "TradingAccount" 
    WHERE login = ${loginVal} 
    LIMIT 1
),
UserAccounts AS (
    SELECT 
        ta.id,
        ta.login,
        ta.balance,
        ta.equity,
        ta.currency,
        ta."userId"
    FROM "TradingAccount" ta
    WHERE ta."userId" IN (SELECT "userId" FROM TargetUser)
),
SymbolExposure AS (
    SELECT
        ua."userId",
        p."externalSymbol" AS symbol,
        COALESCE(SUM(CASE WHEN p.side = 'BUY' THEN p.volume ELSE 0 END), 0) AS total_buy_lots,
        COALESCE(SUM(CASE WHEN p.side = 'SELL' THEN p.volume ELSE 0 END), 0) AS total_sell_lots,
        COALESCE(SUM(CASE WHEN p.side = 'BUY' THEN p.volume ELSE -p.volume END), 0) AS net_directional_lots,
        COALESCE(SUM(p."floatingPnL"), 0.00) AS symbol_floating_pnl
    FROM "Position" p
    JOIN UserAccounts ua ON ua.id = p."accountId"
    WHERE p.volume > 0
    GROUP BY ua."userId", p."externalSymbol"
)
SELECT
    u.id                                        AS user_id,
    u.email                                     AS user_email,
    COUNT(DISTINCT ua.id)                       AS total_trading_logins,
    SUM(ua.balance)                             AS consolidated_balance,
    SUM(ua.equity)                              AS consolidated_equity,
    se.symbol                                   AS instrument,
    se.total_buy_lots                           AS aggregate_buy_lots,
    se.total_sell_lots                          AS aggregate_sell_lots,
    se.net_directional_lots                     AS net_directional_lots,
    se.symbol_floating_pnl                      AS combined_floating_pnl
FROM "User" u
JOIN UserAccounts ua ON ua."userId" = u.id
LEFT JOIN SymbolExposure se ON se."userId" = u.id
GROUP BY u.id, u.email, se.symbol, se.total_buy_lots, se.total_sell_lots, se.net_directional_lots, se.symbol_floating_pnl
ORDER BY ABS(COALESCE(se.net_directional_lots, 0)) DESC;`;
    }
  },
  {
    id: 'cross-account-hedging-arbitrage',
    category: 'Security',
    title: 'Opposite Trades Across Multiple Accounts (A/B Hedging Abuse)',
    description: 'Catches users trying to exploit negative balance protection or promotional bonuses. A user opens Account A and buys an asset, while opening Account B and selling the exact same asset. If a major news event causes prices to spike, one account makes massive profits while the broker absorbs the loss on the other.',
    tables: ['TradingAccount', 'Position', 'User'],
    indexes: ['TradingAccount_userId_idx', 'Position_accountId_idx'],
    sensitivity: 'High (Financial)',
    diagnosticNotes: [
      'Flags simultaneous opposite trades (one buying, one selling the same asset) under the same user.',
      'Detects attempts to guarantee profit by letting one account go negative while cashing out gains on the other.',
      'Matches trades within a 25% size tolerance on the same market symbol.'
    ],
    generateSql: () => {
      return `-- =====================================================================
-- Scenario: Cross-Account Hedging & Negative Balance Arbitrage (A/B Hedging)
-- Target: TradingAccounts under same User with simultaneous opposite positions
-- =====================================================================

SELECT
    u.id                                        AS user_id,
    u.email                                     AS user_email,
    ta1.login                                   AS buy_account_login,
    p1.id                                       AS buy_position_id,
    p1."externalSymbol"                         AS symbol,
    p1.volume                                   AS buy_lots,
    p1."openPrice"                              AS buy_open_price,
    p1."floatingPnL"                            AS buy_floating_pnl,
    ta2.login                                   AS sell_account_login,
    p2.id                                       AS sell_position_id,
    p2.volume                                   AS sell_lots,
    p2."openPrice"                              AS sell_open_price,
    p2."floatingPnL"                            AS sell_floating_pnl,
    ROUND(ABS(p1.volume - p2.volume), 2)        AS lot_differential,
    (p1."floatingPnL" + p2."floatingPnL")       AS net_hedged_pnl
FROM "Position" p1
JOIN "TradingAccount" ta1 ON ta1.id = p1."accountId"
JOIN "User" u ON u.id = ta1."userId"
JOIN "TradingAccount" ta2 ON ta2."userId" = u.id AND ta2.id != ta1.id
JOIN "Position" p2 ON p2."accountId" = ta2.id AND p2."externalSymbol" = p1."externalSymbol"
WHERE p1.side = 'BUY'
  AND p2.side = 'SELL'
  AND p1.volume > 0
  AND p2.volume > 0
  AND ABS(p1.volume - p2.volume) <= 0.25 * GREATEST(p1.volume, p2.volume)
ORDER BY (p1.volume + p2.volume) DESC;`;
    }
  },
  {
    id: 'syndicate-arbitrage-execution',
    category: 'Security',
    title: 'Coordinated Multi-Account Group Trading (Syndicate Arbitrage)',
    description: 'Discovers groups of separate people placing identical trades on the exact same market symbol within 1 to 3 seconds of each other from the same internet connection or device. Uncovers unauthorized trading syndicates, coordinated copy-trading rings, or shared trading bots.',
    tables: ['TradingAccount', 'UserSession', 'Order', 'User'],
    indexes: ['UserSession_ipAddress_idx', 'Order_accountId_idx', 'Order_createdAt_idx'],
    sensitivity: 'High (Security/PII)',
    diagnosticNotes: [
      'Spots different registered users placing the exact same trade within 3 seconds of each other.',
      'Checks if both users are connected from the exact same internet IP address or shared network.',
      'Helps detect coordinated groups, unauthorized fund managers, or shared trading software.'
    ],
    generateSql: () => {
      return `-- =====================================================================
-- Scenario: Coordinated Multi-Account Trade Execution (Syndicate Arbitrage)
-- Target: Multiple distinct Users executing identical orders from shared IP within 3s
-- =====================================================================

SELECT
    o1.id                                       AS order_id_1,
    ta1.login                                   AS account_login_1,
    u1.email                                    AS user_email_1,
    o2.id                                       AS order_id_2,
    ta2.login                                   AS account_login_2,
    u2.email                                    AS user_email_2,
    o1."externalSymbol"                         AS symbol,
    o1."orderType"                              AS order_type,
    o1."orderVolume"                            AS volume_1,
    o2."orderVolume"                            AS volume_2,
    us1."ipAddress"                             AS shared_ip_address,
    o1."createdAt"                              AS order_1_time,
    o2."createdAt"                              AS order_2_time,
    ROUND(ABS(EXTRACT(EPOCH FROM (o1."createdAt" - o2."createdAt")))::numeric, 3) AS execution_time_delta_sec
FROM "Order" o1
JOIN "TradingAccount" ta1 ON ta1.id = o1."accountId"
JOIN "User" u1 ON u1.id = ta1."userId"
JOIN "UserSession" us1 ON us1."userId" = u1.id
JOIN "UserSession" us2 ON us2."ipAddress" = us1."ipAddress" AND us2."userId" != us1.id
JOIN "User" u2 ON u2.id = us2."userId"
JOIN "TradingAccount" ta2 ON ta2."userId" = u2.id
JOIN "Order" o2 ON o2."accountId" = ta2.id 
               AND o2."externalSymbol" = o1."externalSymbol" 
               AND o2."orderType" = o1."orderType"
               AND o2.id > o1.id
WHERE o1."createdAt" >= NOW() - INTERVAL '7 days'
  AND ABS(EXTRACT(EPOCH FROM (o1."createdAt" - o2."createdAt"))) <= 3.0
ORDER BY o1."createdAt" DESC
LIMIT 100;`;
    }
  },
  {
    id: 'negative-balance-debt-forgiveness',
    category: 'Funds',
    title: 'Zero-Out Approved Negative Balances (Debt Forgiveness Script)',
    description: 'A safe database cleanup script that resets negative balances back to $0.00 on closed, suspended, or read-only accounts that have been approved for broker debt forgiveness. Cleans up client debt and updates the audit timestamp.',
    tables: ['TradingAccount'],
    indexes: ['TradingAccount_login_key', 'TradingAccount_type_idx'],
    sensitivity: 'High (Financial)',
    diagnosticNotes: [
      'Database cleanup action: Safely resets negative balances back to $0.00 for approved accounts.',
      'Only touches accounts in CLOSED, READ_ONLY, or SUSPENDED status that have balances below $0.00.',
      'Keeps an accurate audit trail by updating the account\'s last-modified timestamp (updatedAt = NOW()).'
    ],
    generateSql: ({ loginId, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : null);
      const loginClause = loginVal ? `\n    AND "login" = ${loginVal}` : '';
      return `-- =====================================================================
-- Scenario: Negative Balance Debt Forgiveness & Zero-Out
-- Target: TradingAccount (balance < 0 and status IN ('CLOSED', 'READ_ONLY', 'SUSPENDED'))
-- =====================================================================

UPDATE "TradingAccount"
SET
    "balance" = 0.00,
    "equity" = CASE WHEN "equity" < 0 THEN 0.00 ELSE "equity" END,
    "updatedAt" = NOW()
WHERE "balance" < 0.00
  AND "status" IN ('CLOSED', 'READ_ONLY', 'SUSPENDED')${loginClause};`;
    }
  },
  {
    id: 'cancel-orphan-pending-orders',
    category: 'Trading',
    title: 'Cancel Leftover Pending Orders on Frozen / Closed Accounts',
    description: 'Safely cancels leftover pending orders (orders waiting for a specific price) on accounts that have been suspended, locked, or closed. This prevents old orders from accidentally triggering in the market when the customer is no longer allowed to trade.',
    tables: ['Order', 'TradingAccount'],
    indexes: ['Order_accountId_idx', 'TradingAccount_login_key'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Database cleanup action: Marks waiting pending orders as CANCELLED on locked, frozen, or closed accounts.',
      'Prevents accidental trade fills on accounts where the customer no longer has active access.',
      'Records an audit cancellation reason (ACCOUNT_STATUS_INACTIVE_ORPHAN_PURGE) for tracking.'
    ],
    generateSql: ({ loginId, parameterized }) => {
      const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : null);
      const loginClause = loginVal ? `\n      AND ta."login" = ${loginVal}` : '';
      return `-- =====================================================================
-- Scenario: Cancel Orphan Pending Orders on Suspended / Closed Accounts
-- Target: Order (status = 'PENDING' on accounts with status != 'ACTIVE')
-- =====================================================================

UPDATE "Order"
SET
    "status" = 'CANCELLED',
    "rejectionReason" = 'ACCOUNT_STATUS_INACTIVE_ORPHAN_PURGE',
    "updatedAt" = NOW()
WHERE "status" = 'PENDING'
  AND "accountId" IN (
      SELECT ta.id
      FROM "TradingAccount" ta
      WHERE ta."status" IN ('SUSPENDED', 'READ_ONLY', 'CLOSED')${loginClause}
  );`;
    }
  }
];
