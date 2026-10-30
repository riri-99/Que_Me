export interface QueryTemplate {
  id: string;
  category: 'Trading' | 'Funds' | 'Risk' | 'Security' | 'Compliance';
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
}

export const QUERY_TEMPLATES: QueryTemplate[] = [
  // =================================================================
  // GIST TEMPLATES: ACCOUNT MAINTENANCE & EXECUTION AUDIT
  // =================================================================
  {
    id: 'remove-demo-live-accounts',
    category: 'Compliance',
    title: 'Remove the word "demo" from all live accounts',
    description: 'Updates TradingAccount records by regex-stripping the word "demo" and redundant whitespace from all live account names.',
    tables: ['TradingAccount'],
    indexes: ['TradingAccount_type_idx', 'TradingAccount_name_idx'],
    sensitivity: 'High (Security/PII)',
    diagnosticNotes: [
      'Executes regex replacement with word boundary check \\ydemo\\y case-insensitively.',
      'Cleans redundant whitespace with TRIM and REGEXP_REPLACE(\\s+, " ").',
      'Only updates records with "type" = "LIVE" containing "demo".'
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
    description: 'Identifies all orders closed by Stop Loss or Take Profit execution price sources and exit reasons.',
    tables: ['TradingAccount', 'Order'],
    indexes: ['TradingAccount_login_key', 'Order_accountId_idx', 'Order_filledAt_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Filters by priceSource in (SL_TRIGGER, TP_TRIGGER) or order reason in (SL, TP).',
      'Audits closingOrderId, orderType, filledQuantity, and executed price (averagePrice).'
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
    description: 'Audits market execution orders, linked position execution prices, close reasons, and realized PnL.',
    tables: ['TradingAccount', 'Order', 'Position', 'Instrument'],
    indexes: ['TradingAccount_login_key', 'Order_accountId_idx', 'Position_openedByOrderId_idx', 'Position_closedAt_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Filters for executionType = MARKET or standard BUY/SELL order types.',
      'Joins Position on openedByOrderId to track openPrice, closePrice, closeReason, and realizedPnl.'
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
    description: 'Examines pending and executed limit orders, requested limit price vs executed price, and position outcomes.',
    tables: ['TradingAccount', 'Order', 'Position', 'Instrument'],
    indexes: ['TradingAccount_login_key', 'Order_accountId_idx', 'Position_openedByOrderId_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Filters for executionType = LIMIT or orderType in (BUY_LIMIT, SELL_LIMIT).',
      'Audits limitPrice vs averagePrice to detect positive or negative execution delta.'
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
    description: 'Audits stop-limit orders including stopTriggerPrice, stopLimitPrice, executedOrderPrice, and position PnL.',
    tables: ['TradingAccount', 'Order', 'Position', 'Instrument'],
    indexes: ['TradingAccount_login_key', 'Order_accountId_idx', 'Position_openedByOrderId_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Filters for executionType = STOP_LIMIT or orderType in (BUY_STOP_LIMIT, SELL_STOP_LIMIT).',
      'Inspects stopTriggerPrice vs limitPrice and execution latency.'
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
    description: 'Locates FundTransaction details, linked balance/credit deals, positions, and ledger entries for an account.',
    tables: ['FundTransaction', 'TradingAccount', 'Deal'],
    indexes: ['FundTransaction_accountId_idx', 'Deal_accountId_idx', 'TradingAccount_login_key'],
    sensitivity: 'High (Financial)',
    diagnosticNotes: [
      'Joins FundTransaction to Deal where dealType in (BALANCE, CREDIT, CHARGE, CORRECTION, BONUS).',
      'Correlates deal profit with fund transaction amount within a 10-second epoch window.'
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
    description: 'Atomic PL/pgSQL transaction script to delete linked Deal, Position, Ledger entries, and revert TradingAccount balance and StaffWallet.',
    tables: ['FundTransaction', 'Deal', 'Position', 'LedgerEntry', 'LedgerTransaction', 'TradingAccount', 'StaffWallet'],
    indexes: ['FundTransaction_id_key', 'Deal_id_key', 'Position_id_key'],
    sensitivity: 'High (Financial)',
    diagnosticNotes: [
      'Executes within an atomic DO $$ BEGIN ... END $$; transaction block.',
      'Cascades deletion: Deal -> Position -> LedgerEntry -> LedgerTransaction -> FundTransaction.',
      'Reverts TradingAccount figures and refunds StaffWallet if applicable.'
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
    description: 'Compares requested prices against actual execution prices on executed deals to detect slippage, execution latency, and routing performance.',
    tables: ['TradingAccount', 'Order', 'Deal', 'Instrument'],
    indexes: ['TradingAccount_login_key', 'Order_accountId_idx', 'Deal_orderId_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Positive slippage_points indicates execution above requested price (favorable or unfavorable depending on BUY/SELL).',
      'High latency between o."createdAt" and d."createdAt" may point to LP routing delays.',
      'Check if deal volume matches full order volume or represents a partial fill.'
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
    description: 'Finds all non-filled orders with system rejection codes, dealer cancellations, or timeout errors.',
    tables: ['TradingAccount', 'Order', 'ExecutionEvent'],
    indexes: ['TradingAccount_login_key', 'Order_accountId_idx', 'ExecutionEvent_orderId_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'ExecutionEvent logs contain internal error messages from the liquidity bridge/gateway.',
      'Common rejection causes include INSUFFICIENT_MARGIN, OFF_QUOTES, or MARKET_CLOSED.',
      'Cross-check if order was manually rejected by dealer or automated risk filter.'
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
    description: 'Retrieves active open positions, floating PnL, overnight swap fees, commission charges, and margin commitments.',
    tables: ['TradingAccount', 'Position', 'Instrument'],
    indexes: ['TradingAccount_login_key', 'Position_accountId_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'floatingPnl represents mark-to-market unrealized profit or loss at the latest tick.',
      'Check swap and commission fees if user disputes balance reductions while holding open trades.',
      'Verify if position sl (Stop Loss) or tp (Take Profit) were properly placed.'
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
    description: 'Details all incoming deposits, outgoing withdrawals, bank account references, UTR numbers, and approval staff.',
    tables: ['TradingAccount', 'FundTransaction', 'Staff', 'BankAccount'],
    indexes: ['TradingAccount_login_key', 'FundTransaction_accountId_createdAt_idx', 'FundTransaction_utrNumber_key'],
    sensitivity: 'High (Financial)',
    diagnosticNotes: [
      'Use utrNumber to cross-verify bank settlement records or payment gateway webhooks.',
      'currentBalance shows the exact account balance recorded right after this transaction settled.',
      'Check processedByStaffId to audit manual backoffice approvals.'
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
    description: 'Diagnoses failed deposits and withdrawals, displaying failure error codes, gateway messages, and reversal linkages.',
    tables: ['TradingAccount', 'FundTransaction'],
    indexes: ['TradingAccount_login_key', 'FundTransaction_accountId_createdAt_idx'],
    sensitivity: 'High (Financial)',
    diagnosticNotes: [
      'failureCode and failureMessage contain error payloads returned from the payment gateway.',
      'reversalOfId links compensatory transactions created when a transaction rolled back.',
      'Useful for resolving customer deposit credit delays or banking gateway timeouts.'
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
    title: 'Stop-Out & Margin Call Liquidations',
    description: 'Investigates account liquidations, margin ratio dips below stop-out threshold, and automatic system position liquidations.',
    tables: ['TradingAccount', 'MarginLog', 'Position'],
    indexes: ['TradingAccount_login_key', 'MarginLog_accountId_createdAt_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Margin level under 100% triggers margin call; under 50% triggers stop-out liquidation.',
      'Inspect equity vs usedMargin at the precise moment of liquidation.',
      'Cross-check if sudden market volatility or widening spreads reduced free margin.'
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
    title: 'Daily PnL & Equity Timeline',
    description: 'Inspects end-of-day equity, balance, floating PnL, deposit/withdrawal net flows, and commission/swap totals.',
    tables: ['TradingAccount', 'DailyPnL'],
    indexes: ['TradingAccount_login_key', 'DailyPnL_accountId_date_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Provides a day-by-day accounting reconciliation of user balance movements.',
      'Verify if balance change equals (realizedPnL + depositWithdrawal - swapTotal - commissionTotal).',
      'Useful for reconciling periodic account statements and client disputes.'
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
    title: 'Device Logins, IP & User-Agent History',
    description: 'Tracks user sessions, client device types, IP addresses, and token expirations to detect unauthorized access or account sharing.',
    tables: ['TradingAccount', 'Session'],
    indexes: ['TradingAccount_login_key', 'Session_accountId_idx'],
    sensitivity: 'High (Security/PII)',
    diagnosticNotes: [
      'Check for multiple distinct ipAddress entries within short time frames (impossible travel).',
      'deviceType and userAgent help confirm if access was via mobile app, desktop web, or automated bot.',
      'Examine isActive and expiresAt to verify whether stale sessions are still valid.'
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
    title: 'Account Settings & Privilege Audit Trail',
    description: 'Audit logs for leverage adjustments, password resets, read-only status changes, and administrative modifications.',
    tables: ['TradingAccount', 'AuditLog'],
    indexes: ['TradingAccount_login_key', 'AuditLog_entity_entityId_idx', 'AuditLog_createdAt_idx'],
    sensitivity: 'High (Security/PII)',
    diagnosticNotes: [
      'The before and after JSON columns capture full attribute deltas (e.g. leverage 100 -> 500).',
      'actorType and actorId reveal who executed the change (e.g. STAFF vs SYSTEM).',
      'Critical for investigating complaints of unauthorized parameter changes before trading losses.'
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
    title: 'Dealer Overrides & Interventions',
    description: 'Reveals manual dealer actions, quote adjustments, execution routings, or manual order cancellations performed by staff.',
    tables: ['TradingAccount', 'DealerIntervention', 'DealerAction', 'Staff'],
    indexes: ['TradingAccount_login_key', 'DealerIntervention_accountId_idx'],
    sensitivity: 'Medium',
    diagnosticNotes: [
      'Identifies whether an order was routed through a manual dealing desk before fill.',
      'Check dealer_action_taken (e.g. REQUOTE, ACCEPT, REJECT) and dealer comments.',
      'Essential for audit and trade dispute resolution.'
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
  }
];

export function generateCustomQuery({
  prompt,
  loginId,
  dateMode,
  startDate,
  endDate,
  parameterized
}: {
  prompt: string;
  loginId?: string;
  dateMode: 'single' | 'range';
  startDate: string;
  endDate?: string;
  parameterized: boolean;
}): { sql: string; metadata: { tables: string[]; indexes: string[]; sensitivity: string; diagnosticNotes?: string[] } } {
  const p = prompt.toLowerCase();
  const loginVal = parameterized ? ':loginId' : (loginId ? Number(loginId) : 100234);

  const buildDateClause = (tblAlias: string) => {
    return dateMode === 'single'
      ? (parameterized ? `${tblAlias}."createdAt"::date = :startDate::date` : `${tblAlias}."createdAt"::date = '${startDate}'::date`)
      : (parameterized 
          ? `${tblAlias}."createdAt" >= :startDate::timestamp AND ${tblAlias}."createdAt" <= :endDate::timestamp` 
          : `${tblAlias}."createdAt" >= '${startDate} 00:00:00' AND ${tblAlias}."createdAt" <= '${endDate || startDate} 23:59:59'`);
  };

  // 1. LEVERAGE & STOP-OUT / LIQUIDATION RISK
  if (
    p.includes('leverage') || 
    p.includes('stop-out') || 
    p.includes('stopout') || 
    p.includes('margin call') || 
    p.includes('liquidation') || 
    p.includes('closeout')
  ) {
    return {
      metadata: {
        tables: ['TradingAccount', 'AuditLog', 'Deal', 'Staff'],
        indexes: ['TradingAccount_login_key', 'AuditLog_accountId_idx', 'Deal_accountId_idx'],
        sensitivity: 'High (Financial)',
        diagnosticNotes: [
          'seconds_to_liquidation < 300 indicates leverage was altered immediately prior to margin stop-out.',
          'Verify modified_by_staff to identify whether modification was triggered by automated risk tiering or dealer manual input.',
          'Cross-examine equity level at the exact timestamp of leverage adjustment.'
        ]
      },
      sql: `-- =====================================================================
-- Custom Query: Leverage Adjustment Prior to Stop-Out Liquidation
-- Prompt: "${prompt}"
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    ta.currency AS account_currency,
    al.id AS audit_id,
    al."fieldName" AS field_changed,
    al."oldValue" AS previous_leverage,
    al."newValue" AS updated_leverage,
    al."createdAt" AS leverage_changed_at,
    COALESCE(st.name, 'AUTOMATED_RISK_ENGINE') AS modified_by,
    d.id AS liquidation_deal_id,
    d."externalSymbol" AS symbol,
    d.volume AS liquidated_lots,
    d."executionPrice" AS closeout_price,
    d.comment AS deal_comment,
    d."createdAt" AS liquidation_time,
    ROUND(EXTRACT(EPOCH FROM (d."createdAt" - al."createdAt"))::numeric, 2) AS seconds_to_liquidation
FROM "TradingAccount" ta
JOIN "AuditLog" al ON al."accountId" = ta.id AND al."fieldName" = 'leverage'
LEFT JOIN "Staff" st ON st.id = al."staffId"
JOIN "Deal" d ON d."accountId" = ta.id 
  AND (d.comment ILIKE '%so%' OR d.comment ILIKE '%stop%' OR d.comment ILIKE '%liquid%' OR d.comment ILIKE '%closeout%')
WHERE ta.login = ${loginVal}
  AND ${buildDateClause('al')}
  AND d."createdAt" >= al."createdAt"
ORDER BY al."createdAt" DESC, d."createdAt" ASC;`
    };
  }

  // 2. CROSS-ACCOUNT IP / DEVICE COLLISION & SYBIL DETECTION
  if (
    p.includes('ip') || 
    p.includes('device') || 
    p.includes('session') || 
    p.includes('collision') || 
    p.includes('multi') || 
    p.includes('fingerprint') || 
    p.includes('fraud') || 
    p.includes('agent')
  ) {
    return {
      metadata: {
        tables: ['TradingAccount', 'UserSession', 'User'],
        indexes: ['TradingAccount_login_key', 'UserSession_ipAddress_idx', 'UserSession_deviceFingerprint_idx'],
        sensitivity: 'High (Security/PII)',
        diagnosticNotes: [
          'Reveals accounts operating under identical IP addresses or hardware fingerprints.',
          'Useful for unmasking multi-accounting, unauthorized account access, and rebate arbitrage rings.',
          'Shared IP alone may indicate VPN or public Wi-Fi; identical device fingerprint indicates same machine.'
        ]
      },
      sql: `-- =====================================================================
-- Custom Query: Cross-Account IP & Device Sharing Collision
-- Prompt: "${prompt}"
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

WITH target_sessions AS (
    SELECT DISTINCT us."ipAddress", us."deviceFingerprint"
    FROM "TradingAccount" ta
    JOIN "UserSession" us ON us."userId" = ta."userId"
    WHERE ta.login = ${loginVal}
      AND ${buildDateClause('us')}
)
SELECT 
    ${loginVal} AS target_login,
    other_ta.login AS colliding_account_login,
    other_u.email AS colliding_user_email,
    other_u."kycStatus" AS colliding_kyc_status,
    us."ipAddress" AS shared_ip,
    us."deviceFingerprint" AS shared_device_hash,
    us."userAgent" AS client_user_agent,
    us."createdAt" AS session_time
FROM target_sessions ts
JOIN "UserSession" us ON (us."ipAddress" = ts."ipAddress" OR us."deviceFingerprint" = ts."deviceFingerprint")
JOIN "User" other_u ON other_u.id = us."userId"
JOIN "TradingAccount" other_ta ON other_ta."userId" = other_u.id
WHERE other_ta.login != ${loginVal}
ORDER BY us."createdAt" DESC
LIMIT 100;`
    };
  }

  // 3. EXECUTION LATENCY, DELAYS & SLIPPAGE SPIKES
  if (
    p.includes('slippage') || 
    p.includes('latency') || 
    p.includes('delay') || 
    p.includes('slow') || 
    p.includes('spread') || 
    p.includes('execution speed') || 
    p.includes('off quote')
  ) {
    return {
      metadata: {
        tables: ['TradingAccount', 'Order', 'Deal', 'Instrument'],
        indexes: ['TradingAccount_login_key', 'Order_accountId_idx', 'Deal_orderId_idx'],
        sensitivity: 'Medium',
        diagnosticNotes: [
          'Calculates execution latency in seconds between order submission and LP fill confirmation.',
          'Filters for latency outliers (> 1.0s) and significant slippage points.',
          'Helpful for verifying client execution complaints during volatile market events.'
        ]
      },
      sql: `-- =====================================================================
-- Custom Query: Execution Latency & High Slippage Outliers
-- Prompt: "${prompt}"
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    o.id AS order_id,
    o."externalSymbol" AS symbol,
    o."orderType",
    o."orderVolume" AS requested_volume,
    d.id AS deal_id,
    d.volume AS filled_volume,
    d."requestedPrice",
    d."executionPrice",
    ROUND((d."executionPrice" - d."requestedPrice")::numeric, 5) AS slippage_points,
    ROUND(EXTRACT(EPOCH FROM (d."createdAt" - o."createdAt"))::numeric, 3) AS latency_seconds,
    o."createdAt" AS order_placed_at,
    d."createdAt" AS deal_executed_at
FROM "TradingAccount" ta
JOIN "Order" o ON o."accountId" = ta.id
JOIN "Deal" d ON d."orderId" = o.id
WHERE ta.login = ${loginVal}
  AND ${buildDateClause('o')}
  AND (
      ROUND(EXTRACT(EPOCH FROM (d."createdAt" - o."createdAt"))::numeric, 3) > 1.000 
      OR ABS(d."executionPrice" - d."requestedPrice") > 0.00050
  )
ORDER BY latency_seconds DESC, slippage_points DESC
LIMIT 100;`
    };
  }

  // 4. DEPOSIT, WITHDRAWAL & UTR / BANK TRACKING
  if (
    p.includes('deposit') || 
    p.includes('withdrawal') || 
    p.includes('payout') || 
    p.includes('utr') || 
    p.includes('wire') || 
    p.includes('bank') || 
    p.includes('fund') || 
    p.includes('payment')
  ) {
    return {
      metadata: {
        tables: ['TradingAccount', 'FundTransaction', 'Staff'],
        indexes: ['TradingAccount_login_key', 'FundTransaction_accountId_idx', 'FundTransaction_utr_idx'],
        sensitivity: 'High (Financial)',
        diagnosticNotes: [
          'Lists all incoming and outgoing funds transactions with UTR banking codes and gateway references.',
          'Cross-reference bank_utr against treasury statements for missing credit escalations.',
          'Inspect approved_by_staff for transactions requiring manual AML or risk sign-off.'
        ]
      },
      sql: `-- =====================================================================
-- Custom Query: Deposit, Withdrawal & UTR Tracking
-- Prompt: "${prompt}"
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    ta.balance AS account_balance,
    ft.id AS transaction_id,
    ft.type AS tx_type,
    ft.status AS tx_status,
    ft.amount,
    ft.currency,
    ft."paymentMethod",
    ft."paymentProvider",
    ft."externalReference" AS gateway_ref,
    ft."utrNumber" AS bank_utr,
    ft.comment,
    ft."createdAt" AS initiated_at,
    ft."completedAt" AS processed_at,
    st.name AS approved_by_staff
FROM "TradingAccount" ta
JOIN "FundTransaction" ft ON ft."accountId" = ta.id
LEFT JOIN "Staff" st ON st.id = ft."staffId"
WHERE ta.login = ${loginVal}
  AND ${buildDateClause('ft')}
ORDER BY ft."createdAt" DESC;`
    };
  }

  // 5. DEALER & STAFF MANUAL INTERVENTIONS / OVERRIDES
  if (
    p.includes('dealer') || 
    p.includes('manual') || 
    p.includes('override') || 
    p.includes('staff') || 
    p.includes('admin') || 
    p.includes('intervention') || 
    p.includes('adjustment') || 
    p.includes('bonus')
  ) {
    return {
      metadata: {
        tables: ['TradingAccount', 'AuditLog', 'Staff'],
        indexes: ['TradingAccount_login_key', 'AuditLog_accountId_idx'],
        sensitivity: 'High (Security/PII)',
        diagnosticNotes: [
          'Examines backoffice manual actions performed on the client account.',
          'Includes changes to credit bonuses, spread markups, leverage, or manual balance corrections.',
          'Crucial for internal audit disputes regarding staff conduct or dealer errors.'
        ]
      },
      sql: `-- =====================================================================
-- Custom Query: Manual Dealer Overrides & Staff Interventions
-- Prompt: "${prompt}"
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    al.id AS audit_id,
    al."actionType",
    al."tableName",
    al."fieldName",
    al."oldValue",
    al."newValue",
    al."reason" AS intervention_reason,
    st.name AS staff_name,
    st.email AS staff_email,
    st.role AS staff_role,
    al."createdAt" AS adjusted_at
FROM "TradingAccount" ta
JOIN "AuditLog" al ON al."accountId" = ta.id
JOIN "Staff" st ON st.id = al."staffId"
WHERE ta.login = ${loginVal}
  AND ${buildDateClause('al')}
ORDER BY al."createdAt" DESC;`
    };
  }

  // 6. ORDER REJECTIONS & CANCELLATION FAILURES
  if (
    p.includes('reject') || 
    p.includes('cancel') || 
    p.includes('expired') || 
    p.includes('failed order') || 
    p.includes('rejection')
  ) {
    return {
      metadata: {
        tables: ['TradingAccount', 'Order', 'ExecutionEvent'],
        indexes: ['TradingAccount_login_key', 'Order_accountId_idx', 'ExecutionEvent_orderId_idx'],
        sensitivity: 'Medium',
        diagnosticNotes: [
          'Uncovers failed execution attempts with rejection codes and bridge status notes.',
          'Check bridge_detail for LP error codes (INSUFFICIENT_MARGIN, MARKET_CLOSED, OFF_QUOTES).',
          'Helps determine if the failure was client error or LP bridge disconnect.'
        ]
      },
      sql: `-- =====================================================================
-- Custom Query: Order Rejections, Cancellations & Bridge Errors
-- Prompt: "${prompt}"
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    o.id AS order_id,
    o."externalSymbol" AS symbol,
    o."orderType",
    o."orderVolume" AS requested_volume,
    o.status AS order_status,
    o."rejectionCode",
    o."rejectionReason",
    ee."gatewayMessage" AS bridge_detail,
    o."createdAt" AS order_timestamp
FROM "TradingAccount" ta
JOIN "Order" o ON o."accountId" = ta.id
LEFT JOIN "ExecutionEvent" ee ON ee."orderId" = o.id AND ee.status = 'REJECTED'
WHERE ta.login = ${loginVal}
  AND o.status IN ('REJECTED', 'CANCELLED', 'EXPIRED')
  AND ${buildDateClause('o')}
ORDER BY o."createdAt" DESC;`
    };
  }

  // 7. KYC & DOCUMENT VERIFICATION AUDIT
  if (p.includes('kyc') || p.includes('document') || p.includes('verify') || p.includes('passport') || p.includes('id')) {
    return {
      metadata: {
        tables: ['TradingAccount', 'User', 'KycDocument', 'KycStateHistory'],
        indexes: ['TradingAccount_login_key', 'User_id_idx', 'KycStateHistory_userId_idx'],
        sensitivity: 'High (Security/PII)',
        diagnosticNotes: [
          'Chronicles user verification status changes and staff approval history.',
          'Inspect reason for document rejection codes (EXPIRED_DOC, BLURRY, ADDRESS_MISMATCH).',
          'Correlate verification dates against trade and withdrawal approvals.'
        ]
      },
      sql: `-- =====================================================================
-- Custom Query: KYC Documents & State Verification History
-- Prompt: "${prompt}"
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    u.id AS user_id,
    u.email,
    u."kycStatus",
    u."isVerified",
    ksh."fromStatus",
    ksh."toStatus",
    ksh."reason" AS state_change_reason,
    st.name AS reviewed_by_staff,
    ksh."createdAt" AS change_timestamp
FROM "TradingAccount" ta
JOIN "User" u ON u.id = ta."userId"
LEFT JOIN "KycStateHistory" ksh ON ksh."userId" = u.id
LEFT JOIN "Staff" st ON st.id = ksh."staffId"
WHERE ta.login = ${loginVal}
ORDER BY ksh."createdAt" DESC;`
    };
  }

  // 8. SUPPORT TICKETS & CLIENT INQUIRIES
  if (p.includes('ticket') || p.includes('support') || p.includes('complaint') || p.includes('inquiry')) {
    return {
      metadata: {
        tables: ['TradingAccount', 'SupportTicket', 'SupportTicketMessage', 'Staff'],
        indexes: ['TradingAccount_login_key', 'SupportTicket_accountId_idx'],
        sensitivity: 'Medium',
        diagnosticNotes: [
          'Displays support inquiries raised by or on behalf of this trading account.',
          'Examine ticket resolution times and communication logs with staff.',
          'Useful when correlating trading losses to formal client complaints.'
        ]
      },
      sql: `-- =====================================================================
-- Custom Query: Support Tickets & Inquiries
-- Prompt: "${prompt}"
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    stk.id AS ticket_id,
    stk.subject,
    stk.status AS ticket_status,
    stk.priority,
    stk.category,
    creator.name AS created_by_staff,
    assignee.name AS assigned_to_staff,
    stk."createdAt",
    stk."updatedAt"
FROM "TradingAccount" ta
JOIN "SupportTicket" stk ON stk."accountId" = ta.id
LEFT JOIN "Staff" creator ON creator.id = stk."creatorStaffId"
LEFT JOIN "Staff" assignee ON assignee.id = stk."assigneeStaffId"
WHERE ta.login = ${loginVal}
ORDER BY stk."createdAt" DESC;`
    };
  }

  // 9. OPEN POSITIONS & FLOATING PNL EXPOSURE
  if (p.includes('position') || p.includes('floating') || p.includes('unrealized') || p.includes('lots')) {
    return {
      metadata: {
        tables: ['TradingAccount', 'Position', 'Instrument'],
        indexes: ['TradingAccount_login_key', 'Position_accountId_idx'],
        sensitivity: 'Medium',
        diagnosticNotes: [
          'Snapshot of active open market exposure across all currency pairs.',
          'Identifies positions with extreme drawdown or abnormal swap accumulations.',
          'Sorted by absolute floating PnL volatility.'
        ]
      },
      sql: `-- =====================================================================
-- Custom Query: Active Open Positions & Floating PnL
-- Prompt: "${prompt}"
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    p.id AS position_id,
    p."externalSymbol" AS symbol,
    p.volume AS open_lots,
    p.side,
    p."openPrice",
    p."currentPrice",
    p."floatingPnL",
    p.swap,
    p.commission,
    p."createdAt" AS position_opened_at
FROM "TradingAccount" ta
JOIN "Position" p ON p."accountId" = ta.id
WHERE ta.login = ${loginVal}
  AND p.volume > 0
ORDER BY ABS(p."floatingPnL") DESC;`
    };
  }

  // 10. ACCOUNT NAME / DEMO / LIVE ACCOUNT CLEANUP OR INSPECTION
  if (
    p.includes('demo') ||
    p.includes('name') ||
    p.includes('rename') ||
    p.includes('clean') ||
    p.includes('live') ||
    p.includes('remove')
  ) {
    const isLiveFilter = p.includes('live') || p.includes('active');
    const statusClause = isLiveFilter ? `ta.status = 'ACTIVE'` : `1 = 1`;
    const targetFilter = p.includes('all') 
      ? (p.includes('demo') ? `${statusClause} AND ta.name ILIKE '%demo%'` : statusClause) 
      : `${statusClause} AND (ta.login = ${loginVal} OR ta.name ILIKE '%demo%')`;

    return {
      metadata: {
        tables: ['TradingAccount', 'User'],
        indexes: ['TradingAccount_login_key', 'User_id_idx'],
        sensitivity: 'Low',
        diagnosticNotes: [
          'Diagnostic inspection query to identify accounts matching naming criteria before making administrative updates.',
          'proposed_cleaned_name demonstrates safe preview of string replacement using REPLACE().',
          'Review account balances and open positions before applying bulk status or name changes.'
        ]
      },
      sql: `-- =====================================================================
-- Custom Query: Account Name & Live Status Inspection
-- Prompt: "${prompt}"
-- Target: TradingAccount inspection (Diagnostic Preview)
-- =====================================================================

SELECT 
    ta.id AS account_id,
    ta.login AS account_login,
    ta.name AS current_name,
    TRIM(REPLACE(REPLACE(ta.name, 'demo', ''), 'DEMO', '')) AS proposed_cleaned_name,
    ta.status AS account_status,
    ta.currency,
    ta.balance,
    ta.equity,
    u.email AS user_email,
    ta."createdAt" AS created_at
FROM "TradingAccount" ta
JOIN "User" u ON u.id = ta."userId"
WHERE ${targetFilter}
ORDER BY ta."createdAt" DESC
LIMIT 100;`
    };
  }

  // 11. GENERAL FALLBACK AD-HOC INVESTIGATION
  return {
    metadata: {
      tables: ['TradingAccount', 'Order', 'Deal', 'FundTransaction', 'AuditLog'],
      indexes: ['TradingAccount_login_key', 'Order_accountId_idx', 'Deal_accountId_idx'],
      sensitivity: 'Medium',
      diagnosticNotes: [
        'Deterministic zero-cost ad-hoc diagnostic query synthesized from your prompt.',
        'Runs safe read-only SELECT statement with aggregate activity counts across orders, deals, and fund transactions.',
        'Use the quick suggestion chips above to jump into specialized investigation scenarios.'
      ]
    },
    sql: `-- =====================================================================
-- Custom Ad-Hoc Diagnostic Query
-- Prompt: "${prompt}"
-- Target: TradingAccount login = ${loginVal}
-- =====================================================================

SELECT 
    ta.login AS account_login,
    ta.name AS account_name,
    ta.status AS account_status,
    ta.balance,
    ta.equity,
    ta.leverage,
    ta.currency,
    ta."createdAt" AS registered_at,
    (SELECT COUNT(*) FROM "Order" o WHERE o."accountId" = ta.id AND ${buildDateClause('o')}) AS total_orders,
    (SELECT COUNT(*) FROM "Deal" d WHERE d."accountId" = ta.id AND ${buildDateClause('d')}) AS total_deals,
    (SELECT COUNT(*) FROM "FundTransaction" ft WHERE ft."accountId" = ta.id AND ${buildDateClause('ft')}) AS total_fund_txs,
    (SELECT COUNT(*) FROM "Position" p WHERE p."accountId" = ta.id AND p.volume > 0) AS active_open_positions
FROM "TradingAccount" ta
WHERE ta.login = ${loginVal}
LIMIT 1;`
  };
}
