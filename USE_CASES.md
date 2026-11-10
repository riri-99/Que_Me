# Que_Me — Complete Diagnostic & Operational Use Cases Directory

This document lists all **27 built-in operational diagnostics, financial reconciliation audits, risk monitors, abuse detection, and remediation use cases** available in the `Que_Me` brokerage studio.

---

## Quick Reference Index (All 27 Use Cases)

| # | ID | Category | Query Type | Title | Target Tables | Primary Purpose |
|---|---|---|---|---|---|---|
| 1 | `remove-demo-live-accounts` | Compliance | `UPDATE` | Remove the word "demo" from all live accounts | `TradingAccount` | Strips the word "demo" and extra spaces from live accounts |
| 2 | `orders-closed-sl-tp` | Trading | `SELECT` | Orders Closed by Exit Triggers (SL/TP) | `TradingAccount`, `Order` | Audits orders closed by Stop Loss or Take Profit |
| 3 | `market-execution-orders` | Trading | `SELECT` | Market Execution Orders & Position Audit | `TradingAccount`, `Order`, `Position`, `Instrument` | Tracks instant market orders, execution price, and realized profit/loss |
| 4 | `limit-orders-audit` | Trading | `SELECT` | Limit Orders & Position Execution Audit | `TradingAccount`, `Order`, `Position`, `Instrument` | Audits pending vs filled limit orders and execution price differences |
| 5 | `stop-limit-orders-audit` | Trading | `SELECT` | Stop Limit Orders & Trigger Audit | `TradingAccount`, `Order`, `Position`, `Instrument` | Audits stop-limit trigger prices vs actual fill prices |
| 6 | `find-transaction-deal-footprint` | Funds | `SELECT` | Find Balance Transaction & Deal Footprint | `FundTransaction`, `TradingAccount`, `Deal` | Traces linked balance deals, ledger entries, and position footprints |
| 7 | `atomic-balance-cleanup` | Funds | `SCRIPT` | Atomic Balance & Footprint Cleanup Script | `FundTransaction`, `Deal`, `Position`, `LedgerEntry`, etc. | Safely reverts errant deposits/credits and cleans all ledger traces |
| 8 | `slippage-analysis` | Trading | `SELECT` | Order Slippage & Execution Discrepancy | `TradingAccount`, `Order`, `Deal`, `Instrument` | Measures price slippage between order submission and execution fill |
| 9 | `rejected-orders` | Trading | `SELECT` | Rejected, Cancelled & Expired Orders | `TradingAccount`, `Order`, `ExecutionEvent` | Inspects why orders failed (timeouts, margin, LP rejections) |
| 10 | `open-positions-pnl` | Trading | `SELECT` | Open Positions & Real-Time Floating PnL | `TradingAccount`, `Position`, `Instrument` | Live snapshot of open market trades, floating PnL, swaps, and margin |
| 11 | `fund-transfers` | Funds | `SELECT` | Deposit, Withdrawal & UTR Tracking | `TradingAccount`, `FundTransaction`, `Staff`, `BankAccount` | Audits bank deposits, crypto/wire payouts, and UTR reference codes |
| 12 | `failed-funds` | Funds | `SELECT` | Failed & Rejected Fund Transactions | `TradingAccount`, `FundTransaction` | Discovers why client deposits or withdrawal requests failed |
| 13 | `stopout-liquidation` | Risk | `SELECT` | Stop-Out & Margin Call Liquidations | `TradingAccount`, `MarginLog`, `Position` | Reviews margin stop-outs and automated position liquidations |
| 14 | `daily-pnl-history` | Risk | `SELECT` | Daily PnL & Equity Timeline | `TradingAccount`, `DailyPnL` | Historical daily balance, equity, and realized/floating PnL changes |
| 15 | `active-sessions-ip` | Security | `SELECT` | Device Logins, IP & User-Agent History | `TradingAccount`, `Session` | Detects account sharing, overseas logins, and suspicious IP switches |
| 16 | `account-audit-trail` | Compliance | `SELECT` | Account Settings & Privilege Audit Trail | `TradingAccount`, `AuditLog` | Audits staff overrides, leverage updates, and password resets |
| 17 | `dealer-interventions` | Compliance | `SELECT` | Dealer Overrides & Interventions | `TradingAccount`, `DealerIntervention`, `DealerAction`, `Staff` | Tracks manual dealer quote updates, spread adjustments, and trade edits |
| 18 | `balance-equity-drift` | Risk | `SELECT` | Live Balance vs. Equity Drift Detection | `TradingAccount`, `Position` | Flags financial math bugs where equity != balance + floating PnL |
| 19 | `nbp-eligibility-deficits` | Funds | `SELECT` | Negative Balance Protection (NBP) Eligibility | `TradingAccount`, `FundTransaction`, `Position` | Finds accounts in negative balance waiting for NBP credit zero-out |
| 20 | `cash-ledger-reconciliation` | Funds | `SELECT` | Full Cash Ledger vs. Account Balance Reconciliation | `TradingAccount`, `FundTransaction`, `Deal`, `Position` | Audits (Deposits - Withdrawals + Profits - Fees) against saved balance |
| 21 | `stranded-positions-suspended-accounts` | Risk | `SELECT` | Suspended / Read-Only Accounts with Stranded Positions | `TradingAccount`, `Position`, `User` | Finds open trades left on frozen accounts where clients cannot close them |
| 22 | `dormant-accounts-positive-balance` | Compliance | `SELECT` | Dormant / Abandoned Accounts with Positive Balance | `TradingAccount`, `Deal`, `UserSession` | Finds accounts with money that have had zero activity for >90 days |
| 23 | `consolidated-portfolio-exposure` | Risk | `SELECT` | Consolidated Multi-Account Portfolio & Global Exposure | `TradingAccount`, `User`, `Position` | Combines all logins under one user to see their true total risk |
| 24 | `cross-account-hedging-arbitrage` | Security | `SELECT` | Cross-Account Hedging & Negative Balance Arbitrage | `TradingAccount`, `Position`, `User` | Catches users buying on Account A and selling on Account B to game NBP |
| 25 | `syndicate-arbitrage-execution` | Security | `SELECT` | Coordinated Multi-Account Trade Execution | `TradingAccount`, `UserSession`, `Order`, `User` | Catches separate users copying identical orders from the same IP in <3s |
| 26 | `negative-balance-debt-forgiveness` | Funds | `UPDATE` | Negative Balance Debt Forgiveness & Zero-Out | `TradingAccount` | Remediation script to write off and zero out closed deficit accounts |
| 27 | `cancel-orphan-pending-orders` | Trading | `UPDATE` | Cancel Orphan Pending Orders on Inactive Accounts | `Order`, `TradingAccount` | Cancels leftover pending orders on frozen, suspended, or closed accounts |

---

## Detailed Use Cases by Category

### Category 1: Trading & Order Execution (7 Use Cases)

#### 1. Orders Closed by Exit Triggers (SL/TP)
- **ID**: `orders-closed-sl-tp`
- **Tables**: `TradingAccount`, `Order`
- **Simple Description**: Shows all trades closed automatically because the price hit the client's Stop Loss or Take Profit.
- **Why it matters**: Resolves client tickets claiming *"my trade closed too early"* or *"slippage on stop loss"* by showing the exact trigger source, fill price, and timestamp.

#### 2. Market Execution Orders & Position Audit
- **ID**: `market-execution-orders`
- **Tables**: `TradingAccount`, `Order`, `Position`, `Instrument`
- **Simple Description**: Details every instant market order, its opening price, closing price, close reason, and final profit or loss.
- **Why it matters**: Provides a complete trade audit trail for dealer desk review and client dispute resolution.

#### 3. Limit Orders & Position Execution Audit
- **ID**: `limit-orders-audit`
- **Tables**: `TradingAccount`, `Order`, `Position`, `Instrument`
- **Simple Description**: Checks pending and executed limit orders, comparing the requested limit price to the actual fill price.
- **Why it matters**: Verifies that pending limit orders received favorable or equal execution without negative slippage.

#### 4. Stop Limit Orders & Trigger Audit
- **ID**: `stop-limit-orders-audit`
- **Tables**: `TradingAccount`, `Order`, `Position`, `Instrument`
- **Simple Description**: Tracks two-stage stop-limit orders, auditing the trigger price, the limit boundary, and the final fill price.
- **Why it matters**: Ensures the trading engine correctly converted the stop trigger into a valid limit order during fast market conditions.

#### 5. Order Slippage & Execution Discrepancy
- **ID**: `slippage-analysis`
- **Tables**: `TradingAccount`, `Order`, `Deal`, `Instrument`
- **Simple Description**: Compares the price the trader saw on screen with the price the order actually filled at, showing positive/negative slippage in points.
- **Why it matters**: Evaluates liquidity provider (LP) quality, execution speed, and investigates client complaints about bad fills during news events.

#### 6. Rejected, Cancelled & Expired Orders
- **ID**: `rejected-orders`
- **Tables**: `TradingAccount`, `Order`, `ExecutionEvent`
- **Simple Description**: Lists all trades that failed to fill, along with the exact system error code (e.g. *Insufficient Margin*, *Off Quotes*, *Market Closed*).
- **Why it matters**: Helps support staff explain instantly why a customer's trade was declined.

#### 7. Cancel Orphan Pending Orders on Suspended / Closed Accounts
- **ID**: `cancel-orphan-pending-orders`
- **Tables**: `Order`, `TradingAccount`
- **Simple Description**: Remediation query that cancels leftover pending buy/sell limit orders on accounts that were frozen, suspended, or closed.
- **Why it matters**: Prevents "ghost fills" where the market moves, fills an old pending order, and opens a position on an account the client is banned from managing.

---

### Category 2: Funds, Balances & Ledger Reconciliation (7 Use Cases)

#### 8. Deposit, Withdrawal & UTR Tracking
- **ID**: `fund-transfers`
- **Tables**: `TradingAccount`, `FundTransaction`, `Staff`, `BankAccount`
- **Simple Description**: Complete financial statement showing every incoming deposit, outgoing withdrawal, bank account number, and bank UTR / transaction reference.
- **Why it matters**: Essential for finance teams to locate missing bank wire transfers or verify payment gateway receipts.

#### 9. Failed & Rejected Fund Transactions
- **ID**: `failed-funds`
- **Tables**: `TradingAccount`, `FundTransaction`
- **Simple Description**: Lists deposits or withdrawals that errored out or were rejected, showing gateway failure codes and bank messages.
- **Why it matters**: Allows support to quickly diagnose payment processor drops, 3D-Secure failures, or anti-money-laundering (AML) holds.

#### 10. Find Balance Transaction & Deal Footprint
- **ID**: `find-transaction-deal-footprint`
- **Tables**: `FundTransaction`, `TradingAccount`, `Deal`
- **Simple Description**: Finds every balance credit, debit deal, ledger entry, and position associated with a specific deposit or manual adjustment.
- **Why it matters**: Discovers the complete ripple effect across the database before touching or reversing an errant balance adjustment.

#### 11. Atomic Balance & Footprint Cleanup Script
- **ID**: `atomic-balance-cleanup`
- **Tables**: `FundTransaction`, `Deal`, `Position`, `LedgerEntry`, `TradingAccount`, `StaffWallet`
- **Simple Description**: Safe PostgreSQL transaction block that reverts an incorrect deposit or bonus, adjusts the account balance, and cleans all linked ledger entries in one atomic step.
- **Why it matters**: Eliminates human errors when correcting duplicate deposits or fraudulent card charges.

#### 12. Negative Balance Protection (NBP) Eligibility & Unprocessed Deficits
- **ID**: `nbp-eligibility-deficits`
- **Tables**: `TradingAccount`, `FundTransaction`, `Position`
- **Simple Description**: Finds client accounts that ended up in negative balance (owing money after slippage or weekend gap) that haven't received their regulatory zero-out credit yet.
- **Why it matters**: Required by regulations (ESMA, FCA, ASIC) protecting retail clients from owing negative debt to brokers.

#### 13. Full Cash Ledger vs. Account Balance Reconciliation
- **ID**: `cash-ledger-reconciliation`
- **Tables**: `TradingAccount`, `FundTransaction`, `Deal`, `Position`
- **Simple Description**: Calculates `(All Deposits - Withdrawals + Realized Profits - Swaps - Commissions)` and checks if it perfectly matches the account's recorded balance.
- **Why it matters**: Flags unauthorized manual balance edits, double-credited funds, or database desync errors.

#### 14. Negative Balance Debt Forgiveness & Zero-Out
- **ID**: `negative-balance-debt-forgiveness`
- **Tables**: `TradingAccount`
- **Simple Description**: Safe remediation update script that sets `balance = 0.00` on closed or suspended deficit accounts approved for debt forgiveness.
- **Why it matters**: Cleans up broker bad debt on terminated accounts without touching active accounts.

---

### Category 3: Risk Management & Position Exposure (6 Use Cases)

#### 15. Open Positions & Real-Time Floating PnL
- **ID**: `open-positions-pnl`
- **Tables**: `TradingAccount`, `Position`, `Instrument`
- **Simple Description**: Live monitor of all currently active market trades, current profit/loss, margin usage, and overnight interest (swap) charges.
- **Why it matters**: Gives risk managers instant visibility into an account's live market danger.

#### 16. Stop-Out & Margin Call Liquidations
- **ID**: `stopout-liquidation`
- **Tables**: `TradingAccount`, `MarginLog`, `Position`
- **Simple Description**: Investigates the exact moment an account ran out of margin and the automated liquidation engine force-closed positions.
- **Why it matters**: Defends against client claims that *"the broker stopped me out unfairly"* by proving the margin level dipped below 50%/20% threshold.

#### 17. Daily PnL & Equity Timeline
- **ID**: `daily-pnl-history`
- **Tables**: `TradingAccount`, `DailyPnL`
- **Simple Description**: Day-by-day historical snapshot of account balance, equity, deposits, withdrawals, and trading profits over time.
- **Why it matters**: Audits client account growth and detects sudden anomalous equity jumps.

#### 18. Live Balance vs. Equity Drift Detection
- **ID**: `balance-equity-drift`
- **Tables**: `TradingAccount`, `Position`
- **Simple Description**: Checks if `equity == balance + floating PnL`. Flags any account where the numbers don't add up.
- **Why it matters**: Catches mark-to-market software bugs, stuck trade calculations, or disconnected pricing quotes before they trigger false margin calls.

#### 19. Suspended / Read-Only Accounts with Stranded Open Positions
- **ID**: `stranded-positions-suspended-accounts`
- **Tables**: `TradingAccount`, `Position`, `User`
- **Simple Description**: Finds accounts that compliance locked or suspended, but that still have live market trades running.
- **Why it matters**: Severe liability: If a frozen client cannot manage their trades and the market crashes, the broker is legally liable. Dealer desk must liquidate or hedge stranded lots.

#### 20. Consolidated Multi-Account Portfolio & Global Exposure
- **ID**: `consolidated-portfolio-exposure`
- **Tables**: `TradingAccount`, `User`, `Position`
- **Simple Description**: Groups all logins owned by the same person together to calculate their total combined balance, equity, and net lots on each currency pair.
- **Why it matters**: Catches high-risk traders who bypass single-account lot limits (e.g. max 20 lots) by opening 5 separate accounts with 20 lots each.

---

### Category 4: Security, Fraud & Abuse Detection (3 Use Cases)

#### 21. Device Logins, IP & User-Agent History
- **ID**: `active-sessions-ip`
- **Tables**: `TradingAccount`, `Session`
- **Simple Description**: Shows where the client logged in from: IP address, country, browser, and device fingerprint.
- **Why it matters**: Proves unauthorized access or catches traders sharing accounts with illegal account managers.

#### 22. Cross-Account Hedging & Negative Balance Arbitrage (A/B Hedging)
- **ID**: `cross-account-hedging-arbitrage`
- **Tables**: `TradingAccount`, `Position`, `User`
- **Simple Description**: Catches when one user opens a BUY trade on Account 1 and an equal SELL trade on Account 2 on the same currency pair.
- **Why it matters**: A major fraud scheme where the user exploits Negative Balance Protection: one account blows up to negative (which the broker forgives), while the other account doubles in profit, guaranteeing risk-free stolen money.

#### 23. Coordinated Multi-Account Trade Execution (Syndicate Arbitrage)
- **ID**: `syndicate-arbitrage-execution`
- **Tables**: `TradingAccount`, `UserSession`, `Order`, `User`
- **Simple Description**: Finds different registered users who execute the exact same trade within 1–3 seconds from the same IP address or Wi-Fi network.
- **Why it matters**: Uncovers coordinated trading syndicates, latency arbitrage bot rings, or unregistered collective investment schemes.

---

### Category 5: Compliance, Governance & Maintenance (4 Use Cases)

#### 24. Remove the word "demo" from all live accounts
- **ID**: `remove-demo-live-accounts`
- **Tables**: `TradingAccount`
- **Simple Description**: Cleans up live account names by removing the word "demo" and extra spaces left over from account migrations.
- **Why it matters**: Ensures clean client records and prevents reporting live trading accounts as demo accounts in compliance audits.

#### 25. Account Settings & Privilege Audit Trail
- **ID**: `account-audit-trail`
- **Tables**: `TradingAccount`, `AuditLog`
- **Simple Description**: History of all administrative changes made to an account: leverage adjustments, password resets, email changes, and staff who made them.
- **Why it matters**: Tracks internal staff accountability and investigates unauthorized account overrides.

#### 26. Dealer Overrides & Interventions
- **ID**: `dealer-interventions`
- **Tables**: `TradingAccount`, `DealerIntervention`, `DealerAction`, `Staff`
- **Simple Description**: Shows every manual change made by a human dealer, such as manual order execution, spread markups, or manual trade price corrections.
- **Why it matters**: Regulatory requirement for proving fair dealing and transparency during regulatory investigations.

#### 27. Dormant / Abandoned Accounts with Positive Withdrawable Balance
- **ID**: `dormant-accounts-positive-balance`
- **Tables**: `TradingAccount`, `Deal`, `UserSession`
- **Simple Description**: Lists all accounts that have real money sitting in them but have had zero logins or trades for >90/180/365 days.
- **Why it matters**: Required for unclaimed property regulatory audits and calculating monthly dormancy maintenance fee schedules.

---

## How to Access and Tweak Any Use Case

1. **Preset Dropdown**: Click the **Use Case** dropdown at the top of the studio to instantly load any of the 27 pre-built queries.
2. **Search by Keyword**: Type any word (e.g. *drift*, *stranded*, *reconcile*, *syndicate*, *dormant*) into the dropdown search box.
3. **Editable Query Editor**: Once loaded, click directly into the SQL query area to tweak parameters, adjust clauses, or use **Find & Replace** (<kbd>Ctrl+F</kbd>).
4. **Save as Custom Script**: Click **Save as Script** to persist your modified version in `localStorage` under **My Saved Scripts**.
5. **AI Prompt Generator**: Type natural language questions in the **Custom Prompt** bar (e.g. *"find accounts where equity does not match balance"*), and the engine will synthesize the corresponding query automatically.
