# Que_Me — SQL Query & Diagnostic Studio

**Que_Me** is an internal operations and support diagnostic tool designed to automatically generate high-performance, ready-to-run PostgreSQL queries for account investigations based on the data model in `schema.prisma`.

---

## Features

- **Top Filter Bar:**
  - **Login ID**: Numeric input with instant format verification.
  - **Vendor ID (Optional)**: Support for multi-tenant isolation matching `TradingAccount(vendorId, login)`.
  - **Date Specification**: Segmented toggle between **Single Date** and **Date Range**, with quick preset shortcuts (`Today`, `Yesterday`, `Last 7 Days`, `Last 30 Days`).
  - **Investigation Reason**: Searchable combobox organized by domain:
    - 📈 **Trading & Execution**: Order slippage & price discrepancies, rejected/cancelled orders, active open positions & floating PnL.
    - 💳 **Funds & Balances**: Deposit & withdrawal tracking, UTR bank verification, failed/rejected payment transactions.
    - ⚠️ **Risk & Liquidation**: Stop-out liquidations, margin ratio dips, daily PnL & equity reconciliations.
    - 🔒 **Security & Sessions**: Multi-device logins, IP address tracking, device type and user-agent history.
    - ⚖️ **Compliance & Audit**: Account privilege & settings change audit trail, manual dealer overrides & interventions.
    - ✨ **Custom / Freeform Prompt**: Dynamic query generator for ad-hoc prompts.

- **Split-Panel Results Viewport:**
  - **Left Panel (Investigation Context & Metadata)**:
    - Target tables joined.
    - Database indexes utilized (B-Tree).
    - Data sensitivity rating (Low, Medium, High Financial, Security/PII).
    - Diagnostic checklist with interpretation rules for support and risk teams.
  - **Right Panel (Raw SQL Viewer)**:
    - Parameter Injection Toggle: Switch between **Parameterized** (`:loginId`) and **Injected Literal** (`105423`) for instant copy-pasting into DBeaver, pgAdmin, DataGrip, or `psql`.
    - One-Click **Copy SQL** with confirmation.
    - **Download `.sql`** file.
    - Syntax highlighting and line numbers.

- **Developer & Ops Features:**
  - **Shareable Diagnosis Link**: Bidirectional URL query synchronization (`?login=100234&case=slippage-analysis&dateMode=range&from=...&to=...&mode=injected`). Teammates can open the link to restore the exact investigation state.

---

## Neon Database Integration

For details on connecting to Neon PostgreSQL, dumping production data, and executing queries directly in-studio, see the [Neon Integration Plan](file:///C:/que_me/NEON_INTEGRATION_PLAN.md).

---

## Getting Started

1. Navigate to the project directory:
   ```bash
   cd C:\Que_Me
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.
