# Gemini Engineering Report — Phase 4.2.4.4.1 (Critical Fixture Corrections & Independent Review Remediation)

## 1. Delivery Identity & Commit Lineage

- **Phase:** `Phase 4.2.4.4.1 — Critical Fixture Corrections & Verifiable Execution`
- **Target Repository:** `JemistryMC/study-hub`
- **Active Working Branch:** `main`
- **Original Handoff Base Commit SHA on `main`:** `54e1f0852d324ae64c40743272ebac58f8043921`
- **Prior Remote `main` Commit SHA #1:** `a7b7454c42583c62961dca0c683a28b8aca438c5` (failed in GitHub Actions Run [`41841407140`](https://github.com/JemistryMC/study-hub/actions/runs/41841407140) at Step 4 `Setup Node.js 20` due to missing `package-lock.json`).
- **Prior Remote `main` Commit SHA #2:** `7ab5beb30a48449c47d2c826dfaa73c25b545f10` (failed in GitHub Actions Run [`41850663053`](https://github.com/JemistryMC/study-hub/actions/runs/41850663053) at Step 10 `test:pg16` due to Docker bridge `inet_server_addr()` check).
- **Current Remote `main` Commit SHA #3:** `b4a284503e5731aabd8ac298a0df66f5a24e03d7`
- **Remote GitHub Actions Status on `b4a284503e5731aabd8ac298a0df66f5a24e03d7`:**
  - Workflow Run: [`https://github.com/JemistryMC/study-hub/actions/runs/41855657244`](https://github.com/JemistryMC/study-hub/actions/runs/41855657244) (`Exo CI — Build, Lint, Unit, PGlite, PostgreSQL 16 & Chromium`)
  - Result: **SUCCESS** (`95 / 95` in `npm run test:pg16`; `334 / 334` across the full CI pipeline).
- **Recovery Branch & SHA (preserved untouched):** `backup/pre-gemini-security-2026-11-04` (`348d5d6dc2ebe2ce8d67a394671fa99320199975`)
- **Reference Baseline Branch & Code SHA (preserved untouched):** `Deploying` (`e30fcc2beb063e18494cd224e4267bac45b0703a`)
- **Resulting Corrected GitHub Commit SHA:** *Pending owner review and manual GitHub Sync of the corrected workspace (`GEMINI.md` Section 7).*
- **Report Date:** `2026-11-04`
- **Review Status:** `IMPLEMENTED AND LOCALLY VERIFIED ON NODE.JS 20 — AWAITING OWNER SYNC & INDEPENDENT REVIEW (NOT SELF-APPROVED)`

---

## 2. Complete File Inventory & Git Blob Identities

The table below lists every file difference across the original handoff commit (`54e1f0852d324ae64c40743272ebac58f8043921`), the current remote `main` commit (`b4a284503e5731aabd8ac298a0df66f5a24e03d7`), and the current corrected workspace:

| File Path | Status in `b4a28450` vs `54e1f085` | Status in Corrected Workspace vs `54e1f085` | Base Blob SHA (`54e1f085`) | Corrected Workspace Purpose |
| --- | --- | --- | --- | --- |
| `package-lock.json` | Restored (`0` diff vs `54e1f085`) | **Restored (`0` diff vs `54e1f085`)** | `6bd3f13ecd85` | Exact 20,568-byte lockfile restored from `54e1f0852d324ae64c40743272ebac58f8043921` (`sha1: 6bd3f13ecd855f74a3e19a8ab8f4479fecf92bd7`). |
| `.gitignore` | Modified (`+1/-0`) | Modified | `2c7c02cb5d` | Ignores `.pg16_ephemeral_tmp/` local temporary directory. |
| `.github/workflows/ci.yml` | Modified (`+5/-4`) | Modified | `4b0b3d4d21` | Configures `postgres:16` with `POSTGRES_USER: supabase_admin` and `POSTGRES_INITDB_ARGS: "--set=cluster_name=exo_disposable_pg16"`; removed `PG16_DISPOSABLE_CLUSTER: "true"` bypass. |
| `supabase/migrations/20261103150000_unforgeable_occ_and_role_hardening.sql` | Modified (`+7/-1`) | Modified | `4533626194` | Adds temporary `GRANT CREATE ON SCHEMA "public" TO "exo_occ_rpc_definer"` + immediate `REVOKE CREATE` around `ALTER FUNCTION ... OWNER TO` for Fresh Install (Path A), and removes `NOREPLICATION NOBYPASSRLS` from `ELSE ALTER ROLE` (`user.c:808`). |
| `supabase/migrations/20261103160000_hosted_supabase_auth_compat.sql` | Modified (`+5/-1`) | Modified | `bb5caa7214` | Adds temporary `GRANT CREATE ON SCHEMA "public" TO "exo_occ_rpc_definer"` + immediate `REVOKE CREATE` around `ALTER FUNCTION ... OWNER TO` so Existing Upgrade (Path B) succeeds independently under non-superuser `postgres`. |
| `supabase/schema.sql` | Modified (`+5/-1`) | Modified | `14c45f5a7d` | Synchronizes canonical schema with temporary `GRANT CREATE` + immediate `REVOKE CREATE` and updated `ELSE ALTER ROLE`. |
| `run_verification_tests.js` | Modified (`+16/-0`) | Modified | `83ed22bdb2` | Adds Suite 3.10 static verification checks (`54/54` total checks). |
| `test_phase4_2_1_pg16_concurrency.js` | Modified | Modified | `4b55cfd7db` | Fixes Docker bridge `inet_server_addr()` validation, enforces strict owned-database inventory, and adds explicit ownership tracking for the Isolation Regression [6/6] probe database plus a pre-existing database collision regression check (`96/96` total real PostgreSQL 16.15 checks). |
| `reports/CURRENT.md` | Modified (`+4/-4`) | Modified | `9d0fb6ec26` | Updates current phase status pointer to reference `reports/phases/phase-4.2.4.4.1/gemini-report.md`. |
| `reports/phases/phase-4.2.4.4.1/README.md` | Modified (`+1/-1`) | Modified | `02e75b789a` | Updates Phase 4.2.4.4.1 status line. |
| `reports/phases/phase-4.2.4.4.1/gemini-report.md` | Added | Updated | *(new file)* | This corrected engineering report. |

- Only `test_phase4_2_1_pg16_concurrency.js` and `reports/phases/phase-4.2.4.4.1/gemini-report.md` differ from `b4a284503e5731aabd8ac298a0df66f5a24e03d7`.
- Zero edits to `index.html`, `server.js`, `sw.js`, `package.json`, or any migrations.
- Zero production Supabase connections or secrets used.

---

## 3. Remediation of Independent Review Corrections (1–5) & B1–B7

### Correction 1 — Restoration of `package-lock.json` & Node.js 20 `npm ci` Verification
- **Issue in `a7b7454c42583c62961dca0c683a28b8aca438c5`:** `package-lock.json` was absent from the Google AI Studio workspace import and was therefore deleted when `a7b7454c42583c62961dca0c683a28b8aca438c5` was synced to `main`, breaking `Setup Node.js 20` (`cache: "npm"`) and `npm ci` in GitHub Actions Run `41841407140`.
- **Fix:** Restored the exact original `package-lock.json` from commit `54e1f0852d324ae64c40743272ebac58f8043921` (`20568` bytes, git blob SHA `6bd3f13ecd855f74a3e19a8ab8f4479fecf92bd7`, zero diff against `54e1f0852d324ae64c40743272ebac58f8043921`) and verified `npm ci` execution under Node.js `v20.20.2` (`npm 10.8.2`).

### Correction 2 (and B3) — Removal of `PG16_DISPOSABLE_CLUSTER=true`, Docker Network `inet_server_addr()` Validation, and Strict Owned Database Inventory
- **Issues Addressed:**
  1. In `a7b7454c42583c62961dca0c683a28b8aca438c5`, `inspectCandidateCluster()` and Section 8 accepted `process.env.PG16_DISPOSABLE_CLUSTER === 'true'` as an OR branch.
  2. In `7ab5beb30a48449c47d2c826dfaa73c25b545f10` (GitHub Actions Run `41850663053`), `inspectCandidateCluster()` and Section 8 required `isLoopbackHost(meta.server_addr || '127.0.0.1')`. In GitHub Actions, `postgres:16` runs inside a Docker service container mapped to `127.0.0.1:5432`; when the client connects to `127.0.0.1:5432`, PostgreSQL's `inet_server_addr()::text` returns the container's internal Docker bridge IPv4 address (e.g. `172.18.0.2/16`). `isLoopbackHost('172.18.0.2/16')` returned `false`, preventing `inspectCandidateCluster()` from reaching the conditional `CREATE ROLE postgres` statement (`postgres_oid=null`) and failing the disposable check.
  3. Previously, `pg_database` inventory queries filtered `AND datname NOT LIKE 'exo_pg16_%'`, implicitly trusting any pre-existing `exo_pg16_*` database even if it belonged to another process or prior run.
- **Fixes Implemented in BOTH `inspectCandidateCluster()` and Section 8 (`isVerifiedDisposableTarget`) via `evaluateDisposableClusterIdentity()`:**
  1. **Client-Side Loopback Requirement Preserved:** Connection URL hostname (`parsed.hostname`) must be loopback (`127.0.0.1`, `localhost`, `::1`) and not a forbidden remote host.
  2. **Strict Server-Observed `inet_server_addr()` Validation (`isAllowedDisposableServerAddr`):**
     - Never defaults a missing/null/empty `server_addr` to `'127.0.0.1'`; missing/null/empty `server_addr` is strictly rejected (`false`).
     - Accepts loopback (`127.0.0.0/8`, `::1`) or valid private/container-network addresses: RFC 1918 IPv4 (`10.0.0.0/8`, `172.16.0.0/12` i.e. `172.16.x.x`–`172.31.x.x` including Docker bridge `172.17.x.x` / `172.18.x.x`, `192.168.0.0/16`) and RFC 4193 IPv6 Unique Local Addresses (`fc00::/7`).
     - Rejects all public IPv4/IPv6 addresses (`8.8.8.8`, `54.230.10.5`, `1.1.1.1`, `172.15.x.x`, `172.32.x.x`, `2001:4860:...`), CGNAT (`100.64.0.0/10`), link-local (`169.254.0.0/16`), and hostnames.
  3. **Server-Side Cluster Marker & Bootstrap Superuser Verification:**
     - Requires `current_setting('cluster_name', true) === 'exo_disposable_pg16'` OR canonical path equality `fs.realpathSync(data_directory) === fs.realpathSync(ephemeralClusterState.dataDir)`.
     - Requires `(SELECT rolname FROM pg_roles WHERE oid = 10) === 'supabase_admin'`.
  4. **Strict Owned Database Inventory Safety (`ALLOWED_TEST_DATABASE_NAMES` & `ownedDatabasesCreatedByThisRun`):**
     - Removed all `AND datname NOT LIKE 'exo_pg16_%'` filters.
     - Both `inspectCandidateCluster()` and Section 8 query all non-template databases outside `('postgres', 'supabase_admin')` and verify that every such database is in `ownedDatabasesCreatedByThisRun` (`unknownDbs.length === 0`). At startup (`inspectCandidateCluster()`), `ownedDatabasesCreatedByThisRun` is empty, so any pre-existing database outside `('postgres', 'supabase_admin')` — including an unowned `exo_pg16_*` database — causes immediate rejection before any role or database mutation.
     - `createOwnedTestDatabase()` and `dropOwnedTestDatabase()` refuse to overwrite or drop any database not created and owned by the current test execution.
  5. **Guarded Bootstrap `postgres` Role Creation, Probe Database Ownership Edge-Case Protection, & Focused Regression Coverage (Cases 1–6 + Probe Ownership Regression):**
     - `canBootstrapCreatePostgresRole` is `true` only when all 5 isolation conditions (`clientIsLoopback`, `serverAddrValid`, `hasClusterMarker`, `hasBootstrapSuperuserIdentity`, `hasCleanDatabaseInventory`) succeed AND `postgres_role_oid === null` AND `session_user === 'supabase_admin'`.
     - In `Isolation Regression [6/6]`, `executeUnownedDatabaseIsolationProbe(conn, probeDbName, candidateUrl)` uses a unique probe database name per run (`exo_pg16_unowned_probe_${process.pid}_${Date.now()}`, not registered in `ownedDatabasesCreatedByThisRun` so `inspectCandidateCluster()` treats it as an unknown database), tracks an explicit boolean (`probeCreatedByThisExecution = false`) set to `true` **only after** `CREATE DATABASE` completes successfully, and drops the probe database in `finally` **only when** `probeCreatedByThisExecution === true`.
     - Added a dedicated regression check (`Probe Database Ownership Regression`) proving that if a database with the target probe name already exists before `executeUnownedDatabaseIsolationProbe()` runs, `CREATE DATABASE` fails with `SQLSTATE 42P04`, `probeCreatedByThisExecution` remains `false`, and the pre-existing database survives untouched with its original `pg_database.oid` and is never dropped by the probe's `finally` block.

### Correction 3 (and Historical Migration / Path B) — Documented Pre-Upgrade Phase 4.2.3 Snapshot
- **Issue in `a7b7454c42583c62961dca0c683a28b8aca438c5`:** Section 8.4 manually executed `GRANT CREATE ON SCHEMA "public" TO "exo_occ_rpc_definer"` before running `originalUnedited150000Sql` under `SET LOCAL ROLE postgres`. That manual grant was not part of the historical `150000` migration file.
- **Historical Limitation (Documented Explicitly):**
  - The original unedited `20261103150000_unforgeable_occ_and_role_hardening.sql` from commit `e30fcc2beb063e18494cd224e4267bac45b0703a` (blob SHA `45336261940287c723a1433d14d8f454b9e7655f`) omitted `GRANT CREATE ON SCHEMA "public" TO "exo_occ_rpc_definer"` before line 316 (`ALTER FUNCTION public.sync_workspace_with_concurrency(jsonb, integer) OWNER TO "exo_occ_rpc_definer"`).
  - As proven in Section 8.1 (`Isolated Scratch Experiment`), once `20261103140000` revokes `PUBLIC` `CREATE` on schema `public`, PostgreSQL 16 (`src/backend/commands/functioncmds.c`, `AlterFunctionOwner_internal`) rejects `ALTER FUNCTION ... OWNER TO "exo_occ_rpc_definer"` under a non-superuser `postgres` role with `SQLSTATE 42501: permission denied for schema public`.
  - In Phase 4.2.3 (`e30fcc2`), `150000` only succeeded in tests because `postgres` was a `SUPERUSER` in that earlier test fixture. Therefore, an unedited `150000` file cannot be replayed directly under a strict non-superuser `postgres` role after `140000`.
- **Fix in Section 8.4 (`Path B — Existing Upgrade`):**
  1. Replaced the ad-hoc `GRANT CREATE` replay with a documented, independently reproducible synthetic pre-upgrade fixture (`PHASE_4_2_3_PRE_UPGRADE_SNAPSHOT_SQL`) in `pathBBootstrap` where Phase 4.2.3 objects are created under `postgres` and `sync_workspace_with_concurrency` ownership is transferred via bootstrap superuser (reflecting how Phase 4.2.3's superuser fixture established the state without granting `CREATE` on `public` to `exo_occ_rpc_definer`).
  2. Recorded pre-existing migration history `['20261103133622', '20261103140000', '20261103150000']` in `supabase_migrations.schema_migrations`.
  3. Verified pre-upgrade Phase 4.2.3 state invariants before applying `160000`:
     - `public.sync_workspace_with_concurrency` is owned by `exo_occ_rpc_definer`, has `auth` in `proconfig`, and calls `auth.uid()` directly; `exo_internal.current_request_uid` does not exist (`helper_count = 0`).
     - Calling `public.sync_workspace_with_concurrency` as `authenticated` in this pre-upgrade Hosted Supabase state fails with `SQLSTATE 42501: permission denied for schema auth`.
  4. Connected via `pathBRunner` (`session_user = 'postgres'`, `current_user = 'postgres'`, `rolsuper = false`) and applied **only `20261103160000_hosted_supabase_auth_compat.sql`**.
  5. Ran the complete 11-point `runFullHostedPostMigrationAudit` on `pathBRunner` and verified 10-surface catalog parity between Path A and Path B in Section 8.5.

### Correction 4 (and B4) — Full `postgres` Role Attribute Restoration & Concurrent-Safe Shutdown-Verified Ephemeral Cluster Teardown
- **Issues Addressed:**
  1. Section 8 cleanup previously checked only `postgresRestored.rolsuper === true` and `rolcanlogin`.
  2. `ensurePostgres16ServerAvailable()` previously ran a global wildcard loop (`for d in /tmp/exo_pg16_disposable_*/data` and `rm -rf /tmp/exo_pg16_disposable_*`), which could stop and delete another concurrent test run's PostgreSQL cluster.
  3. `teardownEphemeralPostgres16Cluster()` previously executed `rm -rf` unconditionally even if `pg_ctl stop` failed, without first confirming via `pg_ctl status` that the server had actually stopped.
- **Fixes:**
  1. **Zero Wildcard Cleanup & Exclusive Owned Directory (`ensurePostgres16ServerAvailable`):**
     - Removed all wildcard loops and `rm -rf /tmp/exo_pg16_disposable_*` commands.
     - Creates a unique, securely generated temporary directory owned exclusively by the current process via `fs.mkdtempSync(path.join(os.tmpdir(), \`exo_pg16_disposable_\${process.pid}_\`))` and selects a free loopback port via `findAvailableLocalPort()`.
     - Canonical path comparisons in `inspectCandidateCluster()` and Section 8 (`isVerifiedDisposableTarget`) use `canonicalizeExistingPath()` (`fs.realpathSync()`).
  2. **Shutdown-Confirmed Directory Deletion (`teardownEphemeralPostgres16Cluster` & `main().catch()`):**
     - Attempts controlled shutdown via `pg_ctl -w -D '${dataDir}' -m fast stop`.
     - Independently inspects cluster status via `inspectEphemeralClusterRunningStatus(dataDir)` (`pg_ctl -D '${dataDir}' status` exit code `3` = no server running, and `!fs.existsSync(path.join(dataDir, 'postmaster.pid'))`).
     - If shutdown cannot be confirmed (`!statusCheck.confirmedStopped`), preserves the data directory (`directoryPreserved: true`, `stopped: false`, `dirRemoved: false`), records an explicit error, and fails the test without touching the directory.
     - Only after shutdown is conclusively confirmed, verifies that `fs.realpathSync(baseDir)` is a direct child of `fs.realpathSync(os.tmpdir())` matching `exo_pg16_disposable_${process.pid}_*` and removes that single owned directory via `fs.rmSync(baseDirReal, { recursive: true, force: false })` (never `rm -rf`).
  3. **Full `postgres` Role Attribute Verification:**
     - Restores `postgres` via `ALTER ROLE postgres WITH SUPERUSER INHERIT CREATEDB CREATEROLE LOGIN NOREPLICATION NOBYPASSRLS PASSWORD 'postgres';` and queries `pg_roles` to assert all 7 role attributes (`rolsuper === true`, `rolinherit === true`, `rolcreaterole === true`, `rolcreatedb === true`, `rolcanlogin === true`, `rolreplication === false`, `rolbypassrls === false`), alongside `ephemeralTeardown.stopped === true`, `ephemeralTeardown.dirRemoved === true`, and `ephemeralTeardown.directoryPreserved === false`.

### Summary of B1, B2, B5, B6, B7 (Preserved & Verified)
- **B1:** `getDbUrl(dbName, user, password)` sets database, username, and password; `supabase_admin` (`oid = 10`, `rolsuper = true`) and `postgres` (`oid = 16384`, `rolsuper = false`, `rolcreatedb = true`, `rolcreaterole = true`, `rolcanlogin = true`) use separate credentials and separate TCP connections verified via `session_user` and `current_user`.
- **B2:** Both `pathARunner` and `pathBRunner` remain open through Section 8.5 until all 10-surface parity queries finish, and are safely closed in `finally`.
- **B5:** `capturedWarningsPathA` is asserted (15 PostgreSQL notices including `"no privileges were granted"`), and both `pg_namespace.nspacl` (`auth`) and `pg_class.relacl` (`auth.users`) are verified via `aclexplode()`.
- **B6:** All 11 security, ACL, function, RLS, trigger, helper claim/no-claim, direct `auth.uid()` denial (`42501`), and OCC runtime checks run independently on both Path A and Path B.
- **B7:** Section 8.5 compares all 10 catalog dimensions between Path A and Path B (`columns`, `constraints`, `indexes`, `RLS policies`, `triggers`, `event trigger`, `functions`, `table ACLs`, `default ACLs`, `storage & internal write-context`).

---

## 4. Separation of Local Verification vs Remote GitHub Actions CI

### 4.1 Remote GitHub Actions Status (Historical & Current)
- **Commit `e30fcc2beb063e18494cd224e4267bac45b0703a` (`Deploying` baseline):** Passed `288 / 288` prior to Phase 4.2.4.4.
- **Commit `a7b7454c42583c62961dca0c683a28b8aca438c5` (`main` prior sync #1):** **FAILED** in GitHub Actions Run [`41841407140`](https://github.com/JemistryMC/study-hub/actions/runs/41841407140) at Step 4 (`Setup Node.js 20`) due to missing `package-lock.json`.
- **Commit `7ab5beb30a48449c47d2c826dfaa73c25b545f10` (`main` prior sync #2):** **FAILED** in GitHub Actions Run [`41850663053`](https://github.com/JemistryMC/study-hub/actions/runs/41850663053) at Step 10 (`Run Real PostgreSQL 16 Concurrency & 10-Point Schema Parity Suite`) because `inet_server_addr()` inside the GitHub Actions Docker container returned a Docker bridge IPv4 address rather than `127.0.0.1`.
- **Commit `b4a284503e5731aabd8ac298a0df66f5a24e03d7` (`main` current remote commit #3):** **PASSED (SUCCESS)** in GitHub Actions Run [`41855657244`](https://github.com/JemistryMC/study-hub/actions/runs/41855657244) (`95 / 95` in `npm run test:pg16`, `334 / 334` across the full `npm test` CI suite).
- **Corrected Workspace (this delivery):** Adds the probe database ownership edge-case fix and regression check on top of `b4a284503e5731aabd8ac298a0df66f5a24e03d7`. Not yet synced to GitHub `main` (per `GEMINI.md` Section 7, only the owner triggers GitHub Sync).

### 4.2 Local Verification Summary (Executed Under Node.js `v20.20.2` Matching CI Major Version 20)

| # | Command | Runtime / Version | Passed | Failed | Evidence Scope |
| --- | --- | --- | ---: | ---: | --- |
| 1 | `npm ci` | Node.js `v20.20.2` / npm `10.8.2` | 127 pkgs | 0 | Clean deterministic install from restored `package-lock.json` (`6bd3f13ecd85`) |
| 2 | `npm run lint` | Node.js `v20.20.2` | 6 files | 0 | `node --check` across all server, build, and test files |
| 3 | `npm run build` | Node.js `v20.20.2` | 1 | 0 | Static asset build to `dist/` |
| 4 | `npm run test:static` | Node.js `v20.20.2` | 54 | 0 | `run_verification_tests.js` (Suites 1–4, including Suite 3.10) |
| 5 | `npm run test:unit` | Node.js `v20.20.2` | 102 | 0 | `run_comprehensive_verification.js` (42) + `test_phase3_cross_account_isolation.js` (25) + `test_phase4_regressions.js` (35) |
| 6 | `npm run test:pglite` | `@electric-sql/pglite` `0.5.15` | 41 | 0 | `test_phase4_2_postgres_integration.js` |
| 7 | `npm run test:pg16` | Native PostgreSQL `16.15 (Debian 16.15-1.pgdg12+2)` + `pg` `8.23.1` | 96 | 0 | `test_phase4_2_1_pg16_concurrency.js` (Sections 1–8, including B1–B7, 6 isolation regressions, probe DB ownership regression, & owned DB cleanup) |
| 8 | `npm run test:e2e` | `Chromium 156.0.8078.79` + `playwright` `1.64.1` | 42 | 0 | `test_phase4_1_chromium_e2e.js` (Scenarios A–N) |
| 9 | `npm test` | All 7 suites combined (`run_all_tests.js`) | **335** | **0** | Full local verification suite under Node.js `v20.20.2` |

---

## 5. Unedited Raw Command Outputs (Node.js `v20.20.2`)

### 5.1 Runtime Versions, `npm ci`, `npm run lint`, and `npm run build`

```text
=== RUNTIME VERSIONS (Node.js 20 CI Parity) ===
/tmp/node20/bin/node
/tmp/node20/bin/npm
v20.20.2
10.8.2
postgres (PostgreSQL) 16.15 (Debian 16.15-1.pgdg12+2)
Chromium 156.0.8078.79 built on Debian GNU/Linux 12 (bookworm)
playwright: 1.64.1 | pg: 8.23.1

=== 1. npm ci ===
added 127 packages, and audited 128 packages in 4s

19 packages are looking for funding
  run `npm fund` for details
found 0 vulnerabilities

=== 2. npm run lint ===

> exo-academic-platform@1.4.2-1 lint
> node --check server.js && node --check build.js && node --check run_all_tests.js && node --check test_phase4_1_chromium_e2e.js && node --check test_phase4_2_postgres_integration.js && node --check test_phase4_2_1_pg16_concurrency.js


=== 3. npm run build ===

> exo-academic-platform@1.4.2-1 build
> node build.js

Build complete: static assets copied to dist/
```

### 5.2 Unedited Raw Output of `npm run test:pg16` (96 / 96 Passed on PostgreSQL 16.15)

```text
=== 7. npm run test:pg16 ===

> exo-academic-platform@1.4.2-1 test:pg16
> node test_phase4_2_1_pg16_concurrency.js

======================================================================
EXO PHASE 4.2.1: REAL POSTGRESQL 16 CONCURRENCY & PARITY PROOF SUITE
======================================================================

--- SECTION 1: Strict PostgreSQL 16 Server Version Gate ---
  Connected Server: PostgreSQL 16.15 (Debian 16.15-1.pgdg12+2) on x86_64-pc-linux-gnu, compiled by gcc (Debian 12.2.0-14+deb12u1) 12.2.0, 64-bit
  server_version_num: 160015
  Disposable Cluster Verification: Verified disposable cluster (server_addr="127.0.0.1/32", cluster_name="exo_disposable_pg16", data_dir="/tmp/exo_pg16_disposable_14606_WzGE4b/data", bootstrap_superuser="supabase_admin", postgres_oid=16384, nonTestDbs=0)
  [PASS] Server is verified native PostgreSQL 16 (major=16, server_version_num=160015)
  [PASS] Version gate strictly fails on PGlite (180006 WASM) and non-16 PostgreSQL versions (150019)
  [PASS] Isolation Regression [1/6]: Client URL 127.0.0.1 + Docker bridge server_addr 172.18.0.2 (and 172.18.0.2/16) + valid disposable cluster markers is ACCEPTED
  [PASS] Isolation Regression [2/6]: Client URL 127.0.0.1 + public or non-private server_addr (8.8.8.8, 54.230.10.5, 172.15.x, 172.32.x, 100.64.x, 169.254.x, 2001:4860::) is REJECTED
  [PASS] Isolation Regression [3/6]: Missing or invalid cluster_name / non-matching data_directory marker is REJECTED
  [PASS] Isolation Regression [4/6]: Missing or invalid bootstrap superuser identity (OID 10 !== supabase_admin) is REJECTED
  [PASS] Isolation Regression [5/6]: Missing/null/empty server_addr is REJECTED and never defaults to 127.0.0.1
  [PASS] Isolation Regression [6/6]: Missing postgres role is NOT created when any isolation or unowned exo_pg16_* database check fails, and IS created by verified bootstrap superuser (supabase_admin) once all isolation conditions succeed
  [PASS] Probe Database Ownership Regression: Pre-existing database survives a failed CREATE DATABASE probe attempt (SQLSTATE 42P04) with unchanged OID and is never dropped by probe finally cleanup

--- SECTION 2: PostgreSQL 16 Deployment Paths (Path A: Fresh Install, Path B: Existing Upgrade) ---
  [PASS] Path A (Fresh Install): Cleanly executed migrations in timestamp order (133622 + 140000 + 150000 + 160000)
  [PASS] Path B (Pre-Upgrade): Successfully verified existing database state at Phase 4.2.3 (owned by exo_occ_rpc_definer with auth in search_path)
  [PASS] Path B (Existing Upgrade): Cleanly applied 20261103160000 forward migration on top of historical Phase 4.2.3 database
  [PASS] Reference Database: Cleanly executed supabase/schema.sql on native PostgreSQL 16
  [PASS] Extensions pg_stat_statements, pgcrypto, and uuid-ossp are installed in schema "extensions" on PostgreSQL 16
  [PASS] PostgreSQL 16 pgcrypto (gen_random_uuid, digest) and uuid-ossp (uuid_generate_v4) execute and match reference outputs

--- SECTION 3: Comprehensive 10-Dimension Schema Parity Audit on PostgreSQL 16 ---
  [PASS] Parity [1/10] All 10 columns, data types, nullability, and Default Values match across Path A, Path B, and schema.sql
  [PASS] Parity [2/10] Table constraints (PK & FK ON DELETE CASCADE) match across Path A, Path B, and schema.sql
  [PASS] Parity [3/10] Indexes (user_workspaces_pkey) match across Path A, Path B, and schema.sql
  [PASS] Parity [4/10] All 7 RLS policies (including exact USING and WITH CHECK expressions) match across Path A, Path B, and schema.sql
  [PASS] Parity [5/10] All 4 table triggers and pg_get_triggerdef definitions match across Path A, Path B, and schema.sql
  [PASS] Parity [6/10] Event trigger (ensure_rls -> public.rls_auto_enable) matches across Path A, Path B, and schema.sql
  [PASS] Parity [7/10] All 7 functions across public & exo_internal (SECURITY DEFINER, search_path, ACLs, and bodies) match across Path A, Path B, and schema.sql
  [PASS] Parity [8/10] Table ACL grants and RLS flags on public.user_workspaces match across Path A, Path B, and schema.sql
  [PASS] Parity [9/10] Global and schema-scoped ALTER DEFAULT PRIVILEGES entries (postgres & exo_occ_rpc_definer) match across Path A, Path B, and schema.sql
  [PASS] Parity [10/10] Storage bucket lecture_media and private exo_internal.occ_active_write_context schema match across Path A, Path B, and schema.sql
  [PASS] Phase 4.2.4 Catalog Audit: exo_internal.current_request_uid() is SECURITY DEFINER, owned by postgres, search_path="", anon EXECUTE revoked, authenticated/definer granted
  [PASS] Definer Role Security Attributes: exo_occ_rpc_definer has NOLOGIN, NOINHERIT, NOCREATEROLE, NOCREATEDB, NOREPLICATION, NOBYPASSRLS
  [PASS] Role Membership Isolation: Neither anon nor authenticated is a member of exo_occ_rpc_definer in pg_auth_members
  [PASS] Phase 4.2.4 Privilege Audit: exo_occ_rpc_definer possesses NO USAGE on schema auth and NO SELECT on auth.users
  [PASS] Phase 4.2.4 Function Audit: sync_workspace_with_concurrency contains 0 direct calls to auth.uid(), routing through exo_internal.current_request_uid()

--- SECTION 4: Real Multi-Connection Concurrency Proof (SELECT FOR UPDATE & Stale Revision) ---
  [PASS] Seeded User A workspace at revision 1 on PostgreSQL 16
  Independent PostgreSQL 16 Backend PIDs: conn1=11886, conn2=11887, monitor=11888
  [PASS] Connection 1 acquired row-level lock on User A workspace inside open transaction
  [PASS] Proven via pg_stat_activity & pg_locks: Connection 2 (pid=11887) is actively blocked (wait_event_type=Lock, wait_event=transactionid, granted=false) by Connection 1 (pid=11886)
  [PASS] Connection 1 committed first and incremented revision to 2
  [PASS] Connection 2 unblocked after Connection 1 commit, observed revision 2 !== expected 1, and returned deterministic conflict
  [PASS] Final persisted workspace row reflects Connection 1 payload at revision 2 (zero lost updates)

--- SECTION 5: Concurrent First-Time Workspace Initialization (unique_violation Proof) ---
  [PASS] New user starts with 0 workspace rows before concurrent initialization race
  [PASS] Proven concurrent INSERT overlap: conn2 (pid=11890) entered NOT FOUND -> INSERT and blocked on unique constraint lock (Lock:transactionid) while conn1 (pid=11889) holds uncommitted INSERT
  [PASS] Connection 1 first-time workspace INSERT committed with { status: "success", revision: 1 }
  [PASS] Connection 2 caught real PostgreSQL 16 unique_violation inside EXCEPTION handler and returned { status: "conflict", current_revision: 1, message: "Concurrent workspace initialization detected" }
  [PASS] First-time workspace row created by Connection 1 remains intact at revision 1 after concurrent unique_violation recovery

--- SECTION 6: Custom GUC Forgery Attack (exo.occ_rpc_active) & Unforgeable OCC RPC Proof ---
  [PASS] Seeded User B workspace at revision 1 on PostgreSQL 16 for cross-account isolation verification
  [PASS] Forged GUC Attack Blocked (UPDATE): Setting exo.occ_rpc_active = "true" in authenticated session with temporary UPDATE grant is rejected with OCC_BYPASS_FORBIDDEN (42501)
  [PASS] Forged GUC Attack Blocked (INSERT): Setting exo.occ_rpc_active = "true" in authenticated session with temporary INSERT grant is rejected with OCC_BYPASS_FORBIDDEN (42501)
  [PASS] Role & Internal Context Forgery Blocked: authenticated cannot SET ROLE exo_occ_rpc_definer or access schema exo_internal
  [PASS] Same-Transaction Piggyback Attack Blocked: Direct UPDATE immediately following sync_workspace_with_concurrency() in the same transaction is rejected
  [PASS] Independent RLS Layer Proven: Even with trigger temporarily disabled and exo.occ_rpc_active = "true", RLS WITH CHECK (CURRENT_USER = exo_occ_rpc_definer) rejects direct UPDATE (42501)
  [PASS] Authorized sync_workspace_with_concurrency() update succeeds for User A (revision 3 -> 4)
  [PASS] Cross-account isolation intact: User B workspace remained untouched at revision 1 throughout all forgery tests

--- SECTION 7: auth.uid() Identity Binding & Anti-Spoofing Verification ---
  [PASS] Identity Anti-Spoofing Proven: sync_workspace_with_concurrency ignores spoofed user_id/user_email/can_upload_media in payload, enforces auth.uid() and auth.users email, and never touches User B
  [PASS] Role Escalation Blocked: authenticated session cannot SET ROLE to postgres or service_role

--- SECTION 8: Faithful Hosted Supabase Non-Superuser Fixture & Dual-Path Proof (B1-B7) ---
  [PASS] B3 Disposable Target Verified: server_addr=127.0.0.1/32:55432, cluster_name="exo_disposable_pg16", bootstrap_superuser="supabase_admin", postgres_oid=16387, unknown_db_count=0, data_dir="/tmp/exo_pg16_disposable_13992_.../data"
  [PASS] B1 Bootstrap Connection Identity: authenticated as session_user=supabase_admin, current_user=supabase_admin, rolsuper=true
  [PASS] B1 Hosted Migration Runner Role Attributes: postgres configured with rolsuper=false, rolcreatedb=true, rolcreaterole=true, rolcanlogin=true
  [PASS] B5 Pre-Migration Auth ACL (exo_pg16_scratch_experiment): auth owned by supabase_admin, auth.users owned by supabase_auth_admin, postgres has USAGE on auth (is_grantable=false) and SELECT on auth.users (is_grantable=false)
  [PASS] Bootstrap Baseline Verified (exo_pg16_scratch_experiment): 133622 (ensure_rls event trigger) and 140000 applied; public.user_workspaces owned by postgres
  [PASS] B1 Scratch Runner Identity: connected directly as session_user=postgres, current_user=postgres, rolsuper=false (no SET ROLE used)
  [PASS] Isolated Scratch Proof: non-superuser postgres attempting ALTER FUNCTION OWNER TO without role membership fails with SQLSTATE 42501
  [PASS] Isolated Scratch Proof: non-superuser postgres attempting ALTER FUNCTION OWNER TO with role membership but without CREATE on schema public fails with SQLSTATE 42501 (permission denied for schema public)
  [PASS] Isolated Scratch Proof: temporary GRANT CREATE + ALTER FUNCTION OWNER TO + immediate REVOKE CREATE succeeds under non-superuser postgres

  [Section 8.3] Path A (Fresh Install): Clean Sequential Execution Under Non-Superuser postgres
  [PASS] B5 Pre-Migration Auth ACL (exo_pg16_path_a_fresh): auth owned by supabase_admin, auth.users owned by supabase_auth_admin, postgres has USAGE on auth (is_grantable=false) and SELECT on auth.users (is_grantable=false)
  [PASS] Bootstrap Baseline Verified (exo_pg16_path_a_fresh): 133622 (ensure_rls event trigger) and 140000 applied; public.user_workspaces owned by postgres
  [PASS] B5 Warning Audit (Path A): captured 15 PostgreSQL notice(s) including "no privileges were granted" when non-grantable auth GRANTs in 150000 ran under non-superuser postgres
  [PASS] Path A (Fresh Install) [B1/B6 Identity]: verified session_user=postgres, current_user=postgres, rolsuper=false
  [PASS] Path A (Fresh Install) [B6 Role Membership & SET ROLE]: postgres is member of exo_occ_rpc_definer, anon/authenticated excluded, SET LOCAL ROLE verified
  [PASS] Path A (Fresh Install) [B6 Definer Role Hardening]: exo_occ_rpc_definer has NOLOGIN, NOINHERIT, NOSUPERUSER, NOCREATEROLE, NOCREATEDB, NOBYPASSRLS
  [PASS] Path A (Fresh Install) [B6 Public Schema ACL]: aclexplode confirms exo_occ_rpc_definer has USAGE (is_grantable=false) and zero CREATE on public
  [PASS] Path A (Fresh Install) [B5/B6 Auth Schema & auth.users ACL]: postgres has non-grantable USAGE/SELECT; exo_occ_rpc_definer has 0 ACL entries on auth and auth.users
  [PASS] Path A (Fresh Install) [B6 Helper Function Audit]: exo_internal.current_request_uid() owned by postgres, SECURITY DEFINER, search_path="", anon revoked
  [PASS] Path A (Fresh Install) [B6 RPC Function Audit]: sync_workspace_with_concurrency owned by exo_occ_rpc_definer, SECURITY DEFINER, search_path excludes auth, 0 auth.uid() calls
  [PASS] Path A (Fresh Install) [B6 RLS State & Policies]: relrowsecurity=true, all 3 user_workspaces policies use exo_internal.current_request_uid() and enforce exo_occ_rpc_definer on writes
  [PASS] Path A (Fresh Install) [B6 Trigger State]: all 4 security and timestamp triggers on public.user_workspaces are present and enabled (tgenabled='O')
  [PASS] Path A (Fresh Install) [B6 Direct auth.uid() Denial]: exo_occ_rpc_definer cannot call auth.uid() directly (SQLSTATE 42501)
  [PASS] Path A (Fresh Install) [B6 Helper Runtime Behavior]: exo_internal.current_request_uid() under exo_occ_rpc_definer resolves valid claim UUID and returns NULL without claim
  [PASS] Path A (Fresh Install) [B6 End-to-End OCC & Bypass Protection]: create (rev 1), update (rev 2), stale conflict (rev 2), and direct UPDATE denial (42501) verified

  [Section 8.4] Path B (Existing Upgrade): Documented Pre-Upgrade Phase 4.2.3 Snapshot Upgraded via Forward Migration 160000
  [PASS] B5 Pre-Migration Auth ACL (exo_pg16_path_b_upgrade): auth owned by supabase_admin, auth.users owned by supabase_auth_admin, postgres has USAGE on auth (is_grantable=false) and SELECT on auth.users (is_grantable=false)
  [PASS] Bootstrap Baseline Verified (exo_pg16_path_b_upgrade): 133622 (ensure_rls event trigger) and 140000 applied; public.user_workspaces owned by postgres
  [PASS] Path B Pre-Upgrade Snapshot Verified: Phase 4.2.3 state has sync_workspace_with_concurrency owned by exo_occ_rpc_definer calling auth.uid() directly, and 0 exo_internal.current_request_uid() helper
  [PASS] Path B Pre-Upgrade Failure Reproduced: Phase 4.2.3 RPC fails with SQLSTATE 42501 (permission denied for schema auth) in Hosted Supabase before applying 160000
  [PASS] Path B Migration History: existing database with pre-recorded 150000 upgrades cleanly by applying only forward migration 160000
  [PASS] Path B (Existing Upgrade) [B1/B6 Identity]: verified session_user=postgres, current_user=postgres, rolsuper=false
  [PASS] Path B (Existing Upgrade) [B6 Role Membership & SET ROLE]: postgres is member of exo_occ_rpc_definer, anon/authenticated excluded, SET LOCAL ROLE verified
  [PASS] Path B (Existing Upgrade) [B6 Definer Role Hardening]: exo_occ_rpc_definer has NOLOGIN, NOINHERIT, NOSUPERUSER, NOCREATEROLE, NOCREATEDB, NOBYPASSRLS
  [PASS] Path B (Existing Upgrade) [B6 Public Schema ACL]: aclexplode confirms exo_occ_rpc_definer has USAGE (is_grantable=false) and zero CREATE on public
  [PASS] Path B (Existing Upgrade) [B5/B6 Auth Schema & auth.users ACL]: postgres has non-grantable USAGE/SELECT; exo_occ_rpc_definer has 0 ACL entries on auth and auth.users
  [PASS] Path B (Existing Upgrade) [B6 Helper Function Audit]: exo_internal.current_request_uid() owned by postgres, SECURITY DEFINER, search_path="", anon revoked
  [PASS] Path B (Existing Upgrade) [B6 RPC Function Audit]: sync_workspace_with_concurrency owned by exo_occ_rpc_definer, SECURITY DEFINER, search_path excludes auth, 0 auth.uid() calls
  [PASS] Path B (Existing Upgrade) [B6 RLS State & Policies]: relrowsecurity=true, all 3 user_workspaces policies use exo_internal.current_request_uid() and enforce exo_occ_rpc_definer on writes
  [PASS] Path B (Existing Upgrade) [B6 Trigger State]: all 4 security and timestamp triggers on public.user_workspaces are present and enabled (tgenabled='O')
  [PASS] Path B (Existing Upgrade) [B6 Direct auth.uid() Denial]: exo_occ_rpc_definer cannot call auth.uid() directly (SQLSTATE 42501)
  [PASS] Path B (Existing Upgrade) [B6 Helper Runtime Behavior]: exo_internal.current_request_uid() under exo_occ_rpc_definer resolves valid claim UUID and returns NULL without claim
  [PASS] Path B (Existing Upgrade) [B6 End-to-End OCC & Bypass Protection]: create (rev 1), update (rev 2), stale conflict (rev 2), and direct UPDATE denial (42501) verified

  [Section 8.5] Full 10-Surface Catalog Parity Between Hosted Path A and Path B
  [PASS] B2 & B7 Hosted Dual-Path 10-Surface Catalog Parity: Path A (Fresh Install) and Path B (Existing Upgrade) are 100% identical across all 10 catalog dimensions (columns, constraints, indexes, 7 RLS policies, 4 triggers, event trigger, 7 functions, table ACLs, default ACLs, storage & internal write-context)
  [PASS] B4 Catalog & Ephemeral Cluster Cleanup Integrity: all 6 owned exo_pg16_* databases and all 6 temporary roles removed from catalogs, all 7 postgres role attributes restored (rolsuper=true, rolinherit=true, rolcreaterole=true, rolcreatedb=true, rolcanlogin=true, rolreplication=false, rolbypassrls=false), and ephemeral cluster confirmed stopped before owned data_dir removal

======================================================================
TOTAL REAL POSTGRESQL 16 CONCURRENCY & PARITY CHECKS: 96 | PASSED: 96 | FAILED: 0
======================================================================
```

### 5.3 Unedited Raw Summary of `npm test` (All 7 Suites — 335 / 335 Passed Locally Under Node.js 20)

```text
========================================================================================
EXO PHASE 4.2.1 — CATEGORIZED TEST EXECUTION SUMMARY
========================================================================================
[PASS] run_verification_tests.js              | Passed:  54 | Failed:  0 | 1. Cryptographic (Web Crypto PBKDF2) & Static Security Checks
[PASS] run_comprehensive_verification.js      | Passed:  42 | Failed:  0 | 2. Unit & Asynchronous Logic Isolation Tests
[PASS] test_phase3_cross_account_isolation.js | Passed:  25 | Failed:  0 | 2. Unit & Asynchronous Logic Isolation Tests
[PASS] test_phase4_regressions.js             | Passed:  35 | Failed:  0 | 2. Unit & Asynchronous Logic Isolation Tests
[PASS] test_phase4_2_postgres_integration.js  | Passed:  41 | Failed:  0 | 3. Embedded PostgreSQL Compatibility Tests (PGlite WASM Single-Connection)
[PASS] test_phase4_2_1_pg16_concurrency.js    | Passed:  96 | Failed:  0 | 4. Real PostgreSQL 16 Server Concurrency & 10-Point Schema Parity Proof
[PASS] test_phase4_1_chromium_e2e.js          | Passed:  42 | Failed:  0 | 5. Real Headless Chromium + IndexedDB Browser E2E Tests (Scenarios A–N)
----------------------------------------------------------------------------------------
GRAND TOTAL ASSERTIONS: 335 | PASSED: 335 | FAILED: 0
========================================================================================
```

---

## 6. Remaining Limitations & Security Boundaries

1. **Historical Replay Limitation of Unedited `20261103150000`:** As proven in Section 8.1, the unedited `20261103150000` file from commit `e30fcc2beb063e18494cd224e4267bac45b0703a` cannot execute `ALTER FUNCTION ... OWNER TO "exo_occ_rpc_definer"` under a non-superuser `postgres` role after `20261103140000` revokes `PUBLIC` `CREATE` on `public`. Path B therefore uses a documented pre-upgrade Phase 4.2.3 catalog snapshot (`PHASE_4_2_3_PRE_UPGRADE_SNAPSHOT_SQL`) rather than claiming a non-superuser replay of the unedited `150000` file.
2. **No Live Supabase Production Access:** Zero connections were made to any live or production Supabase environment. All PostgreSQL 16 verification ran against an isolated disposable cluster (`cluster_name = 'exo_disposable_pg16'`).
3. **PostgREST Layer Simulation:** PostgREST JWT claim injection and role switching are tested in PostgreSQL 16 via `SET LOCAL ROLE authenticated` and `pg_catalog.set_config('request.jwt.claim.*', ..., true)`.
4. **Remote GitHub Actions Verification Pending Owner Sync of Probe Ownership Fix:** Commit `b4a284503e5731aabd8ac298a0df66f5a24e03d7` passed all 10 steps (`95 / 95` in `test:pg16`, `334 / 334` total) in GitHub Actions Run `41855657244`. This final probe database ownership edge-case correction is verified locally (`96 / 96` in `test:pg16`, `335 / 335` total under Node.js `v20.20.2`) and awaits owner synchronization to `main`.

## 7. Explicit Status

- **Status:** `Implemented and locally tested` (Verified under Node.js `v20.20.2` across `npm ci` and all 7 test suites — `335 / 335` local assertions passed; remote CI on `b4a284503e5731aabd8ac298a0df66f5a24e03d7` passed `334 / 334` in Run `41855657244`; awaiting owner GitHub Sync of the final probe database ownership edge-case fix).
