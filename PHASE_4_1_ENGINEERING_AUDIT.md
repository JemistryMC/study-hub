# Exo Academic Platform — Phase 4.1, Phase 4.2 & Phase 4.2.1 Engineering Audit & Verification Report

**Repository:** `JemistryMC/study-hub`  
**Target Branch:** `fix/phase-4-1-account-isolation`  
**Scope:** Phase 4.1 Account Isolation & IndexedDB Integrity + Phase 4.2 Security Hardening + Phase 4.2.1 Real PostgreSQL 16 Multi-Connection Concurrency Proof, 10-Dimension Catalog Parity & CI Reproducibility

---

## 1. Phase 4.2.1 Engineering Corrections & Verification Proofs

### 1.1 Explicit Separation Between Embedded PGlite and Native PostgreSQL 16
- **Finding Addressed**: `@electric-sql/pglite@0.5.15` is a single-connection WebAssembly build compiled from PostgreSQL 18.6 (`server_version_num = 180006` on `wasm32-unknown-emscripten`). Therefore, PGlite cannot prove compatibility with PostgreSQL 16 (`server_version_num = 16xxxx`) and cannot test multi-connection lock contention.
- **Correction Executed**:
  1. Retained `test_phase4_2_postgres_integration.js` (41 checks) strictly as **Category 3: Embedded PostgreSQL Compatibility Tests (PGlite WASM Single-Connection)** and removed all claims describing PGlite as PostgreSQL 16.
  2. Added `test_phase4_2_1_pg16_concurrency.js` (29 checks) as **Category 4: Real PostgreSQL 16 Server Concurrency & 10-Point Schema Parity Proof**, connecting via `pg` TCP sockets to a real `PostgreSQL 16` server (`postgres:16` service container in `.github/workflows/ci.yml` and local `PostgreSQL 16.15` server).
  3. Implemented a hard version gate at the start of `test_phase4_2_1_pg16_concurrency.js` executing `SELECT version()` and `SHOW server_version_num`, verifying `Math.floor(Number(server_version_num) / 10000) === 16` and `/PostgreSQL\s+16\./i.test(version)` and immediately failing if run against PGlite (`180006`) or any non-16 server.
  4. **Real PG16 Compatibility Bug Caught & Fixed**: Executing `supabase/migrations/20261103133622_remote_schema.sql` on real PostgreSQL 16.15 immediately exposed `GRANT ... MAINTAIN ... ON TABLE "public"."user_workspaces"`, which is a PostgreSQL 17+ privilege keyword that PGlite 18.6 accepted silently but PostgreSQL 16 rejected (`ERROR: unrecognized privilege type "maintain"`). Removed `MAINTAIN` from `20261103133622_remote_schema.sql` so all migrations execute cleanly on real PostgreSQL 16.

### 1.2 Real Multi-Connection Concurrency Proof on PostgreSQL 16 (`test_phase4_2_1_pg16_concurrency.js`)
Using three independent `pg.Client` TCP connections (`conn1`, `conn2`, `connMonitor`) with verified distinct backend process IDs (`SELECT pg_backend_pid()` -> `pid1 !== pid2 !== pidMonitor`):
1. **Overlapping `SELECT ... FOR UPDATE` Row-Lock Contention & Stale Revision Rejection**:
   - Both `conn1` and `conn2` read the same baseline workspace revision (`revision = 1`).
   - `conn1` (`pid1`) begins a transaction (`BEGIN`), sets `ROLE authenticated` and `request.jwt.claim.sub`, and calls `public.sync_workspace_with_concurrency(payload1, 1)`, acquiring the `FOR UPDATE` row lock on `public.user_workspaces` and updating `revision` to `2` while holding the transaction open before `COMMIT`.
   - While `conn1` holds the row lock, `conn2` (`pid2`) starts its own transaction and invokes `public.sync_workspace_with_concurrency(payload2, 1)` with stale `p_expected_revision = 1`.
   - `connMonitor` (`pidMonitor`) queries `pg_stat_activity` and `pg_locks`, proving that `pid2` is actively blocked in-flight (`wait_event_type = 'Lock'`, `wait_event = 'transactionid'`, `granted = false` in `pg_locks`) while `pid1` holds the uncommitted lock.
   - `conn1` then executes `COMMIT`. `conn2` immediately unblocks, re-reads the committed tuple (`revision = 2`) via `SELECT ... FOR UPDATE`, detects `p_expected_revision (1) <> v_current_rev (2)`, and returns `{ status: "conflict", current_revision: 2 }` without overwriting `conn1`'s data.
2. **Barrier-Synchronized Simultaneous Parallel Update Race**:
   - Both `conn1` and `conn2` synchronize at an in-memory `Promise` barrier after `BEGIN` so both TCP sockets dispatch `SELECT public.sync_workspace_with_concurrency(..., 2)` at the exact same tick.
   - Verified that exactly one connection succeeds (`status = 'success'`, `revision = 3`) and the other receives `{ status: 'conflict', current_revision: 3 }`, with zero data corruption.
3. **Concurrent First-Time Workspace Creation & `unique_violation` Recovery Proof**:
   - For a brand-new user with 0 rows in `public.user_workspaces`:
   - `conn1` (`pid1`) starts `BEGIN` and calls `sync_workspace_with_concurrency(init1, NULL)`. `SELECT ... FOR UPDATE` sees `NOT FOUND`, so `conn1` executes `INSERT INTO public.user_workspaces` (revision 1) and holds the uncommitted unique index lock on `user_workspaces_pkey`.
   - While `conn1` is still uncommitted, `conn2` (`pid2`) starts `BEGIN` and calls `sync_workspace_with_concurrency(init2, NULL)`. Because `conn1` has not committed yet, `conn2`'s `SELECT ... FOR UPDATE` also sees `NOT FOUND` and enters the `INSERT` block, blocking on `user_workspaces_pkey` (`wait_event_type = 'Lock'`, `wait_event = 'transactionid'`).
   - `connMonitor` verifies in `pg_stat_activity` and `pg_locks` that `conn2` is blocked inside the concurrent `INSERT`.
   - `conn1` commits (`COMMIT`). PostgreSQL 16 raises `unique_violation` (`23505`) inside `conn2`, which is caught by `EXCEPTION WHEN unique_violation` in `sync_workspace_with_concurrency()`, re-reading `v_current_rev = 1` via `SELECT ... FOR UPDATE` and returning `{ status: "conflict", current_revision: 1, message: "Concurrent workspace initialization detected" }` without losing `conn1`'s initial workspace.

### 1.3 Audit of the 4 Extensions & 10-Dimension Catalog Parity (`schema.sql` vs Migrations)
- **Extensions Audit**:
  1. `pg_stat_statements` (`SCHEMA extensions`): Native PostgreSQL 16 contrib extension — **installed and verified on PostgreSQL 16**; skipped in PGlite WASM.
  2. `pgcrypto` (`SCHEMA extensions`): Native PostgreSQL 16 contrib extension — **installed and functionally verified on PostgreSQL 16** (`extensions.gen_random_uuid()`, `extensions.digest()`); skipped in PGlite WASM.
  3. `uuid-ossp` (`SCHEMA extensions`): Native PostgreSQL 16 contrib extension — **installed and functionally verified on PostgreSQL 16** (`extensions.uuid_generate_v4()`); skipped in PGlite WASM.
  4. `supabase_vault` (`SCHEMA vault`): Proprietary Supabase Managed Cloud extension (not part of upstream `postgres:16` contrib and not referenced by any Exo table, function, trigger, or RLS policy) — **explicitly documented as excluded** in both standalone `postgres:16` and PGlite WASM.
- **10-Dimension Catalog Parity Verified on PostgreSQL 16 (`test_phase4_2_1_pg16_concurrency.js`)**:
  - Added `REVOKE ALL ON TABLE "public"."user_workspaces" FROM "service_role"` prior to `GRANT SELECT, INSERT, UPDATE, DELETE` in `20261103140000_fix_security_and_privileges.sql` so `relacl` matches `supabase/schema.sql` identically.
  - Verified exact catalog equality between `exo_pg16_migrated` and `exo_pg16_fresh_schema` across:
    1. Columns, types, nullability, and `column_default` (`information_schema.columns` — all 10 columns).
    2. Constraints (`PRIMARY KEY` and `FOREIGN KEY ... ON DELETE CASCADE` via `pg_get_constraintdef`).
    3. Indexes (`user_workspaces_pkey` via `pg_indexes`).
    4. All 7 RLS policies on `public.user_workspaces` and `storage.objects` including `permissive`, `roles`, `cmd`, `USING` (`qual`), and `WITH CHECK` (`with_check`).
    5. All 4 table triggers on `public.user_workspaces` (`pg_get_triggerdef`).
    6. Event trigger `ensure_rls` (`pg_event_trigger`).
    7. All 6 public functions (`prosecdef`, `proconfig` `search_path`, `proacl`, and `pg_get_functiondef`).
    8. Table privileges (`relacl`, `relrowsecurity`, `relforcerowsecurity`).
    9. Default privileges (`pg_default_acl`).
    10. Storage bucket `lecture_media` properties (`public = false`, `file_size_limit = 52428800`, `allowed_mime_types`).

### 1.4 Deterministic Lockfile (`package-lock.json`) & GitHub Actions CI (`.github/workflows/ci.yml`)
- Generated and committed `package-lock.json` with pinned `devDependencies` (`"@electric-sql/pglite": "0.5.15"`, `"pg": "8.23.1"`, `"playwright": "1.64.1"`).
- Updated `.github/workflows/ci.yml` to:
  1. Provision a real `postgres:16` Docker service container with `pg_isready` healthchecks on port `5432`.
  2. Install dependencies deterministically via `npm ci` (instead of `npm install`).
  3. Run each independent test category (`npm run test:static`, `npm run test:unit`, `npm run test:pglite`, `npm run test:pg16`, `npm run test:e2e`) AND execute `npm test` to verify `run_all_tests.js`.

---

## 2. Separated 5-Category Test Execution Summary

| Category | Test File(s) | Command | Target Runtime | Assertions | Status |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **1. Production Crypto & Static Audit** | `run_verification_tests.js` | `npm run test:static` | Node.js Web Crypto (`index.html`) + Static SQL/SW Audit | **49** | **49 PASS / 0 FAIL** |
| **2. Pure Unit & Async Logic Isolation** | `run_comprehensive_verification.js`<br>`test_phase3_cross_account_isolation.js`<br>`test_phase4_regressions.js` | `npm run test:unit` | Node.js VM + IDB Transaction Simulator | **102**<br>(42+25+35) | **102 PASS / 0 FAIL** |
| **3. Embedded PostgreSQL Compatibility** | `test_phase4_2_postgres_integration.js` | `npm run test:pglite` | `@electric-sql/pglite` 0.5.15 (Single-Connection WASM PG 18.6) | **41** | **41 PASS / 0 FAIL** |
| **4. Real PostgreSQL 16 Concurrency & Parity** | `test_phase4_2_1_pg16_concurrency.js` | `npm run test:pg16` | **Native PostgreSQL 16.15 Server (`server_version_num=160015`)** + Multi-Connection `pg` | **29** | **29 PASS / 0 FAIL** |
| **5. Real Browser E2E & IndexedDB** | `test_phase4_1_chromium_e2e.js` | `npm run test:e2e` | **Headless Chromium (`playwright` 1.64.1) + Real IndexedDB v4** | **42** | **42 PASS / 0 FAIL** |
| **Grand Total (All 7 Suites)** | `run_all_tests.js` | `npm test` | **All Runtimes Combined** | **263** | **263 PASS / 0 FAIL** |

---

## 3. Clean-Environment Setup & Verification Commands

```bash
# 1. Deterministic dependency installation from package-lock.json
npm ci

# 2. Install Headless Chromium for Playwright E2E
npm run test:setup

# 3. Verify syntax & lint checks across all server, build, and test scripts
npm run lint

# 4. Run production static asset build
npm run build

# 5. Run each verification tier independently
npm run test:static   # Tier 1: Production Web Crypto PBKDF2 & Static SQL/SW Checks (49 checks)
npm run test:unit     # Tier 2: Pure Unit & Async Logic Isolation Suites (102 checks)
npm run test:pglite   # Tier 3: Embedded PostgreSQL Compatibility Suite — PGlite WASM (41 checks)
npm run test:pg16     # Tier 4: Real PostgreSQL 16 Multi-Connection Concurrency & 10-Point Parity (29 checks)
npm run test:e2e      # Tier 5: Real Headless Chromium + IndexedDB E2E Suite (42 checks)

# 6. Run the unified categorized test runner
npm test
```
