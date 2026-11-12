# Finalized Implementation Plan: Neon DB Integration & In-Studio Query Execution

Based on your exact requirements:
- ✅ **All query types allowed**: Full support for `SELECT`, `UPDATE`, `DELETE`, `INSERT`, `CREATE`, `DROP`, `ALTER`, and multi-statement scripts.
- ✅ **No default row cap**: Entire result sets are retrieved and streamed without forced `LIMIT` constraints (using efficient client-side virtualized rendering to handle thousands of rows smoothly).
- ✅ **No credentials yet**: Studio will include a live **Connection Settings Modal** where you can paste your Neon connection string directly in the UI (and save to `.env.local`), alongside instant connection ping testing.

---

## 1. System Architecture

```mermaid
flowchart TD
    subgraph Browser ["Que_Me Studio UI"]
        UI["Studio Dashboard"]
        ConnBadge["Connection Pill (Connected / Disconnected)"]
        ConnModal["Neon Connection Settings Modal\n(Enter / Test DATABASE_URL)"]
        Editor["SQL Query Editor + 'Run Query' (Ctrl+Enter)"]
        ResultsGrid["Uncapped Interactive Results Grid\n(Virtual Scroll, Search, CSV Export, Affected Rows)"]
    end

    subgraph Backend ["Next.js App Router Backend"]
        HealthRoute["GET /api/db/health\n(Pings Neon & returns DB name/version)"]
        ConfigRoute["POST /api/db/config\n(Tests & saves connection credentials)"]
        QueryRoute["POST /api/query/execute\n(Executes any SQL, tracks timing & row counts)"]
    end

    subgraph NeonCloud ["Neon PostgreSQL Cloud"]
        Pooler["Neon Connection Pooler\n(aws.neon.tech:5432)"]
        RestoredDump["Production Dump Database\n(TradingAccount, Orders, Deals, etc.)"]
    end

    ConnBadge -->|Click to Configure| ConnModal
    ConnModal -->|Test & Save URL| ConfigRoute
    ConfigRoute -->|Validate Connection| Pooler
    HealthRoute -->|Periodic Ping| Pooler
    Editor -->|Submit Query (Any Type)| QueryRoute
    QueryRoute -->|Unrestricted Query Execution| Pooler
    Pooler --> RestoredDump
    Pooler -->|Result Rows / Affected Count / Errors| QueryRoute
    QueryRoute -->|Data Payload & Metrics| ResultsGrid
```

---

## 2. Neon Setup & Prod Dump Workflow (For when you have your DB ready)

### Step 1: Create Free/Pro Neon Project
1. Go to [neon.tech](https://neon.tech) and create a project (e.g., `que-me-diagnostics`).
2. Select your cloud provider and region closest to your operations.
3. Note your connection string format:
   ```text
   postgresql://[user]:[password]@[endpoint]-pooler.[region].aws.neon.tech/[dbname]?sslmode=require
   ```

### Step 2: Dump Your Production Database
Run this in your terminal to create a fast, compressed dump of your production database:
```bash
# Export compressed custom dump from your production database
pg_dump -h <PROD_HOST> -p 5432 -U <PROD_USER> -d <PROD_DB> -Fc -f prod_database.dump
```

### Step 3: Restore Dump into Neon
Restore the dump directly to your Neon branch:
```bash
# Restore directly into Neon PostgreSQL
pg_restore -h <NEON_ENDPOINT>.aws.neon.tech -p 5432 -U <NEON_USER> -d <NEON_DB> \
  --no-owner --no-privileges prod_database.dump
```
> [!TIP]
> Neon also supports instant copy-on-write branching! If you want to experiment with risky `UPDATE` or `DELETE` scripts, you can create a test branch in Neon in seconds without touching your main dump branch.

---

## 3. Step-by-Step Technical Implementation in Que_Me

### Step 3.1: Install Driver & Setup Client
Install Neon's serverless package:
```bash
npm install @neondatabase/serverless
```
Create `lib/db.ts`:
- Supports connection pooling and direct connection via `DATABASE_URL`.
- Provides dynamic runtime fallback so the connection string can be supplied via environment variable or updated directly through the studio UI.

### Step 3.2: Backend API Routes
1. **`GET /api/db/health`**:
   - Tests if database connection is active.
   - Returns host, database name, Postgres version, and roundtrip ping in milliseconds.
2. **`POST /api/db/config`**:
   - Allows users to test and store their `DATABASE_URL` directly from the studio UI.
3. **`POST /api/query/execute`**:
   - Receives raw SQL from the editor.
   - Executes with high-resolution execution timer (`performance.now()`).
   - For `SELECT`: returns all column definitions, all raw rows without artificial limit caps, and row count.
   - For `UPDATE`/`DELETE`/`INSERT`/`DDL`: returns `rowCount` (affected rows) and execution status.
   - Detailed error handler returning Postgres error code (`42P01`, `42601`, etc.), error line, and descriptive message.

### Step 3.3: Frontend Studio Enhancements
1. **Header Connection Pill**:
   - Shows live connection status:
     - 🟢 `Connected to Neon (dbname • 42ms)`
     - 🔴 `No Database Connected (Click to Setup)`
   - Clicking opens the **Neon Connection Settings Modal**.
2. **Neon Connection Settings Modal**:
   - Input for `DATABASE_URL` with format helper.
   - **Test Connection** button showing instant live ping and version.
   - **Save & Connect** button.
   - Clear instructions on where to get the URL from Neon.
3. **"Run Query" Action Bar**:
   - Integrated primary **Run Query** button with `Ctrl + Enter` (Windows) / `Cmd + Enter` (Mac) keyboard shortcut.
   - Real-time loading indicator with execution timer (`Running... 1.2s`).
   - Cancel / Abort query button.
4. **Interactive Uncapped Results Panel**:
   - Integrated below the SQL Editor or in a multi-mode tab `[ Editor | Results | Preview ]`.
   - **For SELECT Queries**:
     - Virtualized scrollable grid that renders thousands of rows effortlessly without DOM lag.
     - Column sorting (ascending/descending).
     - Filter search box within results.
     - Data formatting: Monospace numbers, colored boolean badges (`true`/`false`), formatted timestamps, and italic `NULL` badges.
     - **Export to CSV** button and **Copy JSON** button.
   - **For Mutations (`UPDATE`/`DELETE`/`INSERT`)**:
     - Clean success banner: `Query executed successfully. 42 rows affected in 18ms.`
   - **For Errors**:
     - Visual callout displaying PostgreSQL error line, code, and exact error hint.
5. **Full Mobile & Desktop Responsiveness**:
   - Maintained all existing desktop box defaults while ensuring the table scroll and action buttons behave seamlessly on phone screens.
