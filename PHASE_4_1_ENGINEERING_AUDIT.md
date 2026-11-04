# Exo Academic Platform — Phase 4.1, Phase 4.2, Phase 4.2.1, Phase 4.2.3 & Phase 4.2.4 Engineering Report

**Repository:** `JemistryMC/study-hub`  
**Target Branch:** `fix/phase-4-1-account-isolation`  
**Scope:** Phase 4.1 Account Isolation & IndexedDB Integrity + Phase 4.2 Security Hardening + Phase 4.2.1 Real PostgreSQL 16 Multi-Connection Concurrency Proof & 10-Dimension Catalog Parity + Phase 4.2.3 Forward Migration Safety + Phase 4.2.4 Hosted Supabase Managed Auth Schema Compatibility

---

## 1. Unforgeable OCC RPC Redesign (Remediation of Custom GUC `exo.occ_rpc_active`)

### 1.1 Vulnerability Analysis of `current_setting('exo.occ_rpc_active', true)`
- **Problem**: In PostgreSQL, custom GUC session parameters (such as `exo.occ_rpc_active`) can be set by any non-superuser SQL session (`authenticated` or `anon`) using `SET` or `SELECT pg_catalog.set_config('exo.occ_rpc_active', 'true', true)`. Consequently, checking `current_setting('exo.occ_rpc_active', true) = 'true'` inside `enforce_workspace_write_via_rpc()` and RLS policies is forgeable if `authenticated` ever obtains direct `INSERT` or `UPDATE` privileges on `public.user_workspaces`.
- **Remediation**: Eliminated all occurrences of `exo.occ_rpc_active` across all migrations, `supabase/schema.sql`, triggers, RLS policies, and RPCs, and replaced it with a **dual-layer unforgeable database architecture**:
  1. **Dedicated `NOLOGIN` Definer Role (`exo_occ_rpc_definer`) + RLS `CURRENT_USER` Verification**:
     - Created role `exo_occ_rpc_definer` with attributes `NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`.
     - Revoked membership in `exo_occ_rpc_definer` from `anon` and `authenticated` (`REVOKE "exo_occ_rpc_definer" FROM "anon", "authenticated"`), ensuring any client attempt to run `SET ROLE exo_occ_rpc_definer` fails with `permission denied to set role`.
     - Transferred ownership of `public.sync_workspace_with_concurrency(jsonb, integer)` to `exo_occ_rpc_definer`.
     - Retained strict revocation of direct `INSERT, UPDATE, DELETE` table privileges from `authenticated` on `public.user_workspaces` (`authenticated` has only `SELECT`; `exo_occ_rpc_definer` has `SELECT, INSERT, UPDATE`).
     - Because `exo_occ_rpc_definer` has `NOBYPASSRLS`, PostgreSQL still enforces Row Level Security on `public.user_workspaces` during RPC execution.
  2. **Private Transaction Write-Context Table (`exo_internal.occ_active_write_context`) Checked by `enforce_workspace_write_via_rpc()`**:
     - Created private schema `exo_internal` and table `exo_internal.occ_active_write_context (txid xid8 NOT NULL, user_id uuid NOT NULL, write_op text NOT NULL, PRIMARY KEY (txid, user_id))` with `ENABLE ROW LEVEL SECURITY`.
     - Revoked all privileges on schema `exo_internal` and table `exo_internal.occ_active_write_context` from `PUBLIC`, `anon`, and `authenticated`; granted access exclusively to `postgres`, `service_role`, and `exo_occ_rpc_definer`.
     - Inside `public.sync_workspace_with_concurrency()`, immediately prior to executing the `UPDATE` or `INSERT` on `public.user_workspaces`, the function inserts `(pg_catalog.pg_current_xact_id(), v_uid, 'UPDATE' | 'INSERT')` into `exo_internal.occ_active_write_context`, and deletes that row **immediately after the DML statement completes**.

### 1.2 Phase 4.2.4 Hosted Supabase Managed Auth Schema Compatibility
- **Critical Limitation on Hosted Supabase**:
  - In hosted Supabase, the `auth` schema is owned by `supabase_admin`, and its objects (`auth.users`, `auth.uid()`) are owned by `supabase_auth_admin`.
  - The hosted `postgres` role has `USAGE` on `auth` without grant option (`WITHOUT GRANT OPTION`), meaning `GRANT USAGE ON SCHEMA auth TO exo_occ_rpc_definer` fails or has no effect.
  - Calling `auth.uid()` directly inside a function owned by `exo_occ_rpc_definer` causes `SQLSTATE 42501 permission denied for schema auth`.
- **Engineering Solution (Migration `20261103160000_hosted_supabase_auth_compat.sql`)**:
  - Implemented narrow helper function `exo_internal.current_request_uid()` owned by `postgres` with `SECURITY DEFINER` and `SET search_path = ''`.
  - Revoked `EXECUTE` from `PUBLIC, anon`; granted `EXECUTE` to `postgres, service_role, authenticated, exo_occ_rpc_definer`.
  - Replaced all direct calls to `auth.uid()` in `sync_workspace_with_concurrency()` and RLS policies with `exo_internal.current_request_uid()`.
  - Configured `sync_workspace_with_concurrency` with `SET search_path = pg_catalog, public, exo_internal`, completely decoupling it from schema `auth`.
  - Added Section 8 in `test_phase4_2_1_pg16_concurrency.js` modeling the managed Supabase ownership structure and proving that `sync_workspace_with_concurrency()` executes cleanly under `authenticated` without any `auth` schema grants on `exo_occ_rpc_definer`.

---

## 2. Phase 4.2.1 Multi-Connection Concurrency & 10-Point Schema Parity on PostgreSQL 16

1. **Native PostgreSQL 16 Server & Version Gate**:
   - `test_phase4_2_1_pg16_concurrency.js` connects to a real PostgreSQL 16 server (`PostgreSQL 16.15`, `server_version_num = 160015`) via `pg` TCP connections and enforces a strict version gate (`Major === 16`), while `test_phase4_2_postgres_integration.js` is retained strictly as **Embedded PostgreSQL Compatibility Tests (PGlite WASM)**.
2. **Real Multi-Connection Concurrency & Dual-Path Migration Parity (Phase 4.2.3 & 4.2.4)**:
   - Evaluated both deployment paths on native PostgreSQL 16:
     - **Path A (Fresh Install)**: `133622` -> `140000` -> `150000` -> `160000` applied in timestamp order.
     - **Path B (Live Upgrade)**: Database starts at historical Phase 4.2.3 state, then applies only `20261103160000_hosted_supabase_auth_compat.sql`.
   - Proven overlapping `SELECT ... FOR UPDATE` row-lock contention (`wait_event_type = 'Lock'`, `wait_event = 'transactionid'` observed via `pg_stat_activity` and `pg_locks` on a 3rd monitor connection), barrier-synchronized simultaneous updates, and concurrent first-time workspace creation triggering real `unique_violation` (`23505`) recovery.
3. **10-Dimension Catalog Parity (Path A vs Path B vs `supabase/schema.sql`)**:
   - Verified 100% parity across columns/defaults, PK/FK constraints, indexes, all RLS policies (including `USING` and `WITH CHECK`), triggers, event triggers, functions across public and exo_internal (`SECURITY DEFINER`, `search_path`, ACLs, bodies), table ACLs, `pg_default_acl` (`postgres` and `exo_occ_rpc_definer`), `storage.buckets`, and `exo_internal.occ_active_write_context`.

---

## 3. Separated 5-Category Test Execution Summary (288 / 288 Passing)

| Category | Test File(s) | Command | Target Runtime | Assertions | Status |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| **1. Production Crypto & Static Audit** | `run_verification_tests.js` | `npm run test:static` | Node.js Web Crypto (`index.html`) + Static SQL/SW Audit | **52** | **52 PASS / 0 FAIL** |
| **2. Pure Unit & Async Logic Isolation** | `run_comprehensive_verification.js`<br>`test_phase3_cross_account_isolation.js`<br>`test_phase4_regressions.js` | `npm run test:unit` | Node.js VM + IDB Transaction Simulator | **102**<br>(42+25+35) | **102 PASS / 0 FAIL** |
| **3. Embedded PostgreSQL Compatibility** | `test_phase4_2_postgres_integration.js` | `npm run test:pglite` | `@electric-sql/pglite` 0.5.15 (Single-Connection WASM PG 18.6) | **41** | **41 PASS / 0 FAIL** |
| **4. Real PostgreSQL 16 Concurrency, Paths & Parity** | `test_phase4_2_1_pg16_concurrency.js` | `npm run test:pg16` | **Native PostgreSQL 16.15 Server (`server_version_num=160015`)** + Multi-Connection `pg` | **51** | **51 PASS / 0 FAIL** |
| **5. Real Browser E2E & IndexedDB** | `test_phase4_1_chromium_e2e.js` | `npm run test:e2e` | **Headless Chromium (`playwright` 1.64.1) + Real IndexedDB v4** | **42** | **42 PASS / 0 FAIL** |
| **Grand Total (All 7 Suites)** | `run_all_tests.js` | `npm test` | **All Runtimes Combined** | **288** | **288 PASS / 0 FAIL** |

---

## 4. Auth Boundary Distinction & Staging Validation Procedure

### 4.1 Boundary Distinction (PostgreSQL Engine vs Supabase GoTrue Auth)
- **Engine-Level Enforcement (Fully Verified in PostgreSQL 16)**:
  - Inside the database session, `auth.uid()` reads `request.jwt.claim.sub`. Tests in `test_phase4_2_1_pg16_concurrency.js` simulate this claim via `set_config('request.jwt.claim.sub', ...)`.
  - The tests rigorously prove that an `authenticated` session cannot escalate roles, cannot tamper with payload user IDs, cannot write directly to `public.user_workspaces`, and cannot bypass OCC RPC or RLS.
- **External Gateway Enforcement (Staging / Hosted Supabase Requirement)**:
  - Local database tests do not verify cryptographic JWT signature validation (HMAC-SHA256 / RS256) performed by GoTrue Auth and PostgREST at the HTTP ingress before requests hit PostgreSQL.
  - Setting `request.jwt.claim.sub` in SQL stubs does not substitute for real gateway token verification.

### 4.2 Staging Validation Procedure
1. **Invalid/Unsigned Token Rejection**:
   - Issue an unauthenticated or tampered Bearer token to `POST /rest/v1/rpc/sync_workspace_with_concurrency`.
   - Verify PostgREST returns `401 Unauthorized` before SQL execution.
2. **Valid Authenticated User RPC Execution**:
   - Sign in via Supabase client SDK and execute `sync_workspace_with_concurrency` with valid credentials.
   - Verify `200 OK` response with `{ "status": "success", "revision": 1 }`.
3. **Direct Table REST Write Blocking**:
   - Issue `POST` or `PATCH` to `/rest/v1/user_workspaces` with the valid token.
   - Verify request is rejected with `401/403` or `400 OCC_BYPASS_FORBIDDEN` (`42501`).
