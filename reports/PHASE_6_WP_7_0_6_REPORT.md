# EXO — WP 7.0.6 Continuation Report (CI #74 Verification, Drive Consolidation, 44px Touch Targets & P0 Supabase RPC Audit)

**Date:** 2026-11-18  
**Repository:** `JemistryMC/study-hub`  
**Branch:** `main`  
**Latest Pushed Code Commit SHA:** `6f53e2aed8c335195f1cf338776bb4249b5aeb1f`  
**Previous Verified Code Commit SHA:** `396110060942a8fa2362b28aba28ba637719ef82`  
**WP 7.0 Design Baseline Commit SHA:** `d8208815ef06b3f025dec41d1f333840c808ccaf`  
**Local `index.html` & `dist/index.html` SHA-256:** `388141784259db02863e3f9ffcea8606445fac2d425d562774330dfecf2cd664` (`63,656` lines, `3,866,796` bytes — byte-identical to `6f53e2aed8c335195f1cf338776bb4249b5aeb1f`)  
**Local `test_wp6_7_chromium_e2e.js` SHA-256:** `9d60dab45fd9d0993f4ddabf402cfb9d30178ac119a2724cb467e17df0c820ca` (byte-identical to `6f53e2aed8c335195f1cf338776bb4249b5aeb1f`)  
**Status:** `CI VERIFIED (WP 7.0.6 CODE); P0 PRODUCTION SUPABASE RPC STILL OPEN — NOT VERIFIED LIVE; PHASE 6 NOT APPROVED`

---

## 1. Scope & Files Changed

### Code & Asset Delta in Latest Pushed Commit (`6f53e2aed8c335195f1cf338776bb4249b5aeb1f`)
1. `index.html` (`+17` lines):
   - `.auth-luxury-hero > div:first-child { min-width: 0; flex: 1 1 auto; }` and `.auth-luxury-hero .icon-btn { flex-shrink: 0; }` (`lines 7238–7239`) to prevent modal hero/close-button clipping.
   - Touch-target enforcement inside `@media (hover: none), (max-width: 1024px)` (`lines 10279–10293`):
     - `.exo-card-overflow-item`: `min-height: 44px !important; padding: 9px 12px !important;`
     - `#driveHubModalOverlay button, #cloudAuthModalOverlay button:not(.auth-pass-toggle-btn)`: `min-height: 44px !important;`
     - `#driveHubModalCloseBtn, #cloudAuthModalCloseBtn`: `min-width: 44px !important; width: 44px !important; height: 44px !important; flex-shrink: 0 !important;`
2. `test_wp6_7_chromium_e2e.js` (`+2 / -2` lines):
   - Relocated runtime WP 6.7 Chromium screenshot output from `reports/screenshots/wp6-7/` to `.playwright-cli/wp6-7/` (which is gitignored in `.gitignore`).
3. `reports/screenshots/wp6-7/` (`7` PNG artifacts updated in commit `6f53e2ae` prior to relocation):
   - `desktop-chapter-studio-en.png`, `desktop-drive-hub-en.png`, `desktop-home-en.png`, `desktop-planner-en.png`, `desktop-tracker-en.png`, `mobile-home-en.png`, `mobile-tracker-ar.png`.

### Documentation Updates Added in This Continuation Workspace (Pending Owner Sync)
- `reports/CURRENT.md` — updated top handoff section with CI #74, WP 7.0.6 status, and P0 Supabase RPC status.
- `reports/PHASE_6_WP_7_0_DESIGN_REPORT.md` — added continuation reconciliation note linking to CI #73, CI #74, and this report.
- `reports/PHASE_6_WP_7_0_6_REPORT.md` — this report.
- **No application code, test scripts, SQL, or migrations were modified in this continuation pass.**

---

## 2. CI #73 vs. CI #74 Verification Results (Strictly Separated by SHA)

### 2.1 Previous Commit Baseline — CI #73 (`396110060942a8fa2362b28aba28ba637719ef82`)
- **Run:** GitHub Actions CI #73 (`44292533009`) — **SUCCESS** (`completed` at `2026-11-18T11:18:28Z`).
- **Recovered Exact Assertion Counts (Valid for `39611006` only):**
  - Static Security: `54/54`
  - Comprehensive Verification: `42/42`
  - Phase 3 Account Isolation: `52/52`
  - Phase 4 Regression: `317/317`
  - WP 6.1–6.9 Unit Suites: `59/59` (included in unified runner total)
  - PGlite: `41/41`
  - PostgreSQL 16: `96/96`
  - Phase 4.1 Chromium: `167/167`
  - WP 6.5 Chromium: `43/43`
  - WP 6.6 Chromium: `22/22`
  - WP 6.7 Chromium: `51/51`
  - WP 6.8 Chromium: `21/21`
  - WP 6.9 Chromium: `22/22`
  - **Unified Runner (`npm test`):** **`987/987` assertions passed**.

### 2.2 Latest Pushed Commit — CI #74 (`6f53e2aed8c335195f1cf338776bb4249b5aeb1f`)
- **Run:** GitHub Actions CI #74 ([`44299401863`](https://github.com/JemistryMC/study-hub/actions/runs/44299401863)) — **`status: "completed"`, `conclusion: "success"`** (`2026-11-18T11:57:45Z` → `2026-11-18T12:06:12Z`).
- **GitHub Pages Deployment:** Pages #187 ([`44299401274`](https://github.com/JemistryMC/study-hub/actions/runs/44299401274)) — **`status: "completed"`, `conclusion: "success"`**.
- **Step-by-Step Outcome on `6f53e2aed8c335195f1cf338776bb4249b5aeb1f`:**
  - Step 7 — Run Syntax & Lint Verification (`npm run lint`): **success**
  - Step 8 — Run Production Build (`npm run build`): **success**
  - Step 9 — 1. Production Cryptography & Static Security Audit (`npm run test:static`): **success**
  - Step 10 — 2. Pure Unit & Asynchronous Logic Isolation Suites (`npm run test:unit`): **success**
  - Step 11 — 3. Embedded PostgreSQL Compatibility Suite (`npm run test:pglite`): **success**
  - Step 12 — 4. Real PostgreSQL 16 Concurrency & 10-Point Schema Parity Suite (`npm run test:pg16`): **success**
  - Step 13 — 5. Real Headless Chromium + IndexedDB Browser E2E Suite (`npm run test:e2e`): **success**
  - Step 14 — 6. Verify Unified Test Runner (`npm test -> run_all_tests.js`): **success** (`12:03:48Z` → `12:06:07Z`)
- **Honest Log Boundary:** Unauthenticated GitHub REST API queries return step statuses/conclusions but do not expose raw downloadable log archives; therefore, CI #74 is confirmed **`success`** across every step (including PostgreSQL 16, Chromium E2E, and `npm test`), while the `987/987` numeric count above is cited strictly for CI #73 (`39611006`).

### 2.3 Local Targeted Verification (Executed Against Byte-Identical `6f53e2ae` Workspace)
- `npm run lint`: **PASS** (`21` JS files).
- `node --test test_wp6_7_unit.js`: **PASS** (`13/13` tests passed).
- Targeted Headless Chromium (`chrome-headless-shell`) touch-target measurement on `http://localhost:3000`: **PASS** (see Section 4).

---

## 3. Google Drive Consolidation Status

- **Single Canonical Hub Verified:**
  - `#driveHubModalOverlay` (`openGoogleDriveHubModal()` at `index.html:48232`) is the sole owner/host of `#cloudGdriveSyncCard` inside `#driveHubModalMount` (guarded by `ensureDriveCardMountedInHub()` at `index.html:48159`).
  - Sidebar action `#sidebarGdriveBtn` (`index.html:14170`) opens `#driveHubModalOverlay` directly for Drive OAuth, Media Vault (`Exo_Workspace`), VIP entitlement status (`can_upload_media`), privacy audit, and media upload/download.
  - Account & Sync modal (`#cloudAuthModalOverlay`) contains **no duplicate Drive tab** (`#cloudTabDriveBtn` and `#cloudAuthDriveMount` are absent) and renders only `#cloudAccountDriveSummaryBox` (`index.html:15134`) plus a single `#btnAccountManageGoogleDrive` button (`index.html:15147`) that navigates cleanly into `#driveHubModalOverlay`.
- **Verification Coverage & Boundary:**
  - Verified by `test_wp6_7_unit.js` (`Test 6`, `13/13` pass locally), `test_wp6_7_chromium_e2e.js` (CI #73 `51/51`, CI #74 `success`), and visual inspection of `.playwright-cli/wp706/after-mobile-account.png` & `.playwright-cli/wp706/after-mobile-drivehub.png`.
  - **Important Distinction:** Automated tests use mocked Drive/OAuth/Supabase state (`currentCloudUser`, `currentUserCanUploadMedia`); live Google account OAuth (`drive.file` scope) authorization against a real Google account is **not** exercised in headless CI and requires owner manual testing on the deployed site.

---

## 4. Touch Target Verification (`>= 44px` Across Tablet & Mobile)

Measured in headless Chromium on `http://localhost:3000` (after modal open transition settled) on byte-identical `6f53e2ae`:

| Viewport | Surface / Selector | Measured Size (px) | Status |
| :--- | :--- | :--- | :--- |
| **Mobile (`390x844`)** | Library `.exo-card-overflow-trigger` | `44 × 44` | PASS (`>= 44px`) |
| **Mobile (`390x844`)** | Library `.exo-card-overflow-item` (4 items) | `163 × 44` | PASS (`>= 44px`) |
| **Mobile (`390x844`)** | `#driveHubModalCloseBtn` | `44 × 44` | PASS (`>= 44px`) |
| **Mobile (`390x844`)** | Drive Hub visible buttons (`#btnConnectGoogleDrive`, `#driveHubOpenAccountBtn`, `#driveHubDoneBtn`) | `132×44`, `214×44`, `65×44` | PASS (`>= 44px`, `overflowX: false`) |
| **Mobile (`390x844`)** | `#cloudAuthModalCloseBtn` | `44 × 44` | PASS (`>= 44px`) |
| **Mobile (`390x844`)** | Account modal buttons (`#authTabLogin`, `#authTabSignup`, `#cloudAuthSubmitBtn`, `#cloudLoggedOutForensicExportBtn`) | `159×44`, `159×44`, `334×46`, `205×44` | PASS (`>= 44px`, `overflowX: false`) |
| **Tablet (`768x1024`)** | Library `.exo-card-overflow-trigger` & 4 menu items | `44 × 44`, `163 × 44` | PASS (`>= 44px`) |
| **Tablet (`768x1024`)** | Drive Hub close & visible buttons | `44 × 44`, `>= 44px` | PASS (`>= 44px`, `overflowX: false`) |
| **Tablet (`768x1024`)** | Account modal close & visible buttons (settled post-transition) | `44 × 44`, `247×44`, `247×44`, `510×46.08`, `206.89×44` | PASS (`>= 44px`, `overflowX: false`) |

---

## 5. Screenshot Integrity Status

- **WP 6.7 Runtime Relocation:** `test_wp6_7_chromium_e2e.js` (`lines 16, 244`) writes runtime captures to `.playwright-cli/wp6-7/` (`7` PNG files), which is ignored by `.gitignore` (`line 3`). Future E2E runs will **not** dirty or overwrite tracked screenshot artifacts under `reports/screenshots/wp6-7/`.
- **Curated WP 7.0 Screenshots:** `reports/screenshots/wp7-0/` remains intact with `10` curated PNG files (`dashboard-ar-desktop.png`, `dashboard-en-desktop.png`, `library-ar-desktop.png`, `library-en-desktop.png`, `mobile-ar.png`, `modal-help-ar-desktop.png`, `planner-en-desktop.png`, `studio-en-desktop.png`, `tracker-en-desktop.png`, `workspace-en-desktop.png`).
- **Historical WP 6.7 Directory:** `reports/screenshots/wp6-7/` (`34` files, `7` of which were updated in commit `6f53e2ae`) was left completely untouched in this continuation pass.

---

## 6. P0 — Production Supabase `PGRST202` Diagnosis & Verification Plan

### 6.1 Contract Comparison (Frontend vs. Canonical Migration)
1. **Frontend RPC Invocation (`index.html:57966–57969`):**
   ```js
   const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc('sync_workspace_with_concurrency', {
       p_payload: payload,
       p_expected_revision: expectedRev
   });
   ```
   Client diagnostics (`classifySupabaseError` at `index.html:36098–36107`, `classifyWorkspaceIncident` at `index.html:36539–36566`) classify HTTP `404` / `PGRST202` as `ERR_MISSING_RPC` (`missing_rpc`), keep `pharmaWorkspaceDirty` and durable IDB dirty journals intact (`preservesDirty: true`), and instruct the user to export a local JSON backup and avoid signing out.
2. **Canonical Migration Definition (`supabase/migrations/20261103160000_hosted_supabase_auth_compat.sql:109–248`):**
   ```sql
   CREATE OR REPLACE FUNCTION public.sync_workspace_with_concurrency(
     p_payload jsonb,
     p_expected_revision integer DEFAULT NULL
   )
   RETURNS jsonb
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = pg_catalog, public, exo_internal
   ```
   - Owned by `exo_occ_rpc_definer` (`NOLOGIN NOINHERIT NOBYPASSRLS`).
   - Resolves request UID strictly via `exo_internal.current_request_uid()` (owned by `postgres`, `SET search_path = ''`, returning `auth.uid()`), eliminating direct `auth` schema grants on `exo_occ_rpc_definer`.
   - `EXECUTE` revoked from `PUBLIC, anon`; granted to `authenticated, service_role, postgres, exo_occ_rpc_definer`.
   - Protected by `exo_internal.occ_active_write_context` + `trg_enforce_workspace_write_via_rpc` + RLS policies (`Users can view own workspace`, `Users can insert own workspace`, `Users can update own workspace`) requiring `CURRENT_USER = 'exo_occ_rpc_definer'::name` for writes.
3. **Frontend/Migration Alignment:** Parameter names (`p_payload`, `p_expected_revision`) and types (`jsonb`, `integer DEFAULT NULL`) match **1:1**. The `PGRST202` error is **not** caused by a frontend parameter typo.

### 6.2 Actual Hosted Production Status & Why `PGRST202` Happens
- **Live Hosted Supabase Access in This Environment:** **UNAVAILABLE** (`NO_DB_ENV_VARS`, no `supabase` CLI / `psql`, and `GEMINI.md` §4 prohibits unauthorized production DB access).
- **Production Verification Status:** **`NOT VERIFIED`** — cloud synchronization is **NOT** proven fixed in production.
- **Proven Likely Root Causes of `PGRST202` on Hosted Supabase:**
  1. Migrations `20261103140000_fix_security_and_privileges.sql`, `20261103150000_unforgeable_occ_and_role_hardening.sql`, and/or `20261103160000_hosted_supabase_auth_compat.sql` were **not applied** to the hosted Supabase database (or only `20261103133622_remote_schema.sql` is applied).
  2. Or `public.sync_workspace_with_concurrency` exists with an unexpected signature or lacks `EXECUTE` privilege for `authenticated` (causing PostgREST to omit it from the caller's OpenAPI schema cache).
  3. Or the function was created/altered manually without reloading PostgREST (`NOTIFY pgrst, 'reload schema';`).

### 6.3 Owner-Executable Read-Only Inspection SQL (Run First in Supabase SQL Editor)
> **Safe: `SELECT` only — zero writes, zero DDL, zero DML, preserves all existing workspace rows.**

```sql
-- 1. Applied Supabase migration history
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;

-- 2. Function signature, owner, SECURITY DEFINER, search_path & role EXECUTE grants
SELECT
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS full_arguments,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_get_function_result(p.oid) AS return_type,
    r.rolname AS owner_role,
    p.prosecdef AS is_security_definer,
    p.proconfig AS function_config,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE (n.nspname = 'public' AND p.proname IN (
        'sync_workspace_with_concurrency',
        'enforce_workspace_write_via_rpc',
        'handle_user_workspace_updated_at',
        'enforce_workspace_media_security',
        'protect_vip_status_column'
      ))
   OR (n.nspname = 'exo_internal' AND p.proname = 'current_request_uid')
ORDER BY n.nspname, p.proname;

-- 3. Role exo_occ_rpc_definer & exo_internal schema/table verification
SELECT rolname, rolsuper, rolinherit, rolcanlogin, rolbypassrls
FROM pg_roles
WHERE rolname = 'exo_occ_rpc_definer';

SELECT nspname, pg_get_userbyid(nspowner) AS owner_role,
       has_schema_privilege('authenticated', oid, 'USAGE') AS auth_usage,
       has_schema_privilege('exo_occ_rpc_definer', oid, 'USAGE') AS definer_usage
FROM pg_namespace
WHERE nspname IN ('public', 'exo_internal');

-- 4. public.user_workspaces columns, RLS policies, grants & triggers
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_workspaces'
ORDER BY ordinal_position;

SELECT tablename, rowsecurity,
       has_table_privilege('authenticated', 'public.user_workspaces', 'SELECT') AS auth_select,
       has_table_privilege('authenticated', 'public.user_workspaces', 'INSERT') AS auth_insert,
       has_table_privilege('authenticated', 'public.user_workspaces', 'UPDATE') AS auth_update,
       has_table_privilege('authenticated', 'public.user_workspaces', 'DELETE') AS auth_delete
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'user_workspaces';

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_workspaces'
ORDER BY policyname;

SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public' AND event_object_table = 'user_workspaces'
ORDER BY trigger_name;
```

### 6.4 Safe Remediation Decision Tree & Live Acceptance Gate
1. **Before touching production:** Owner exports a local `.json` backup from the browser (`Export Backup`) to safeguard any unsynced local workspace.
2. **If `sync_workspace_with_concurrency(p_payload jsonb, p_expected_revision integer DEFAULT NULL)` already exists with `exo_occ_rpc_definer` owner, `SECURITY DEFINER`, `authenticated_execute = true`, and `exo_internal.current_request_uid()` present:** run `NOTIFY pgrst, 'reload schema';` only.
3. **If migrations `20261103140000`–`20261103160000` are missing:** apply only the missing forward migrations in strict chronological order (`20261103140000` → `20261103150000` → `20261103160000`, never resetting DB or applying full `supabase/schema.sql` over existing data), then run `NOTIFY pgrst, 'reload schema';`.
4. **Live Acceptance Required to Close P0:**
   - Real authenticated `POST /rest/v1/rpc/sync_workspace_with_concurrency` succeeds (`200 OK`, `status: "success"`, `revision` returned).
   - Existing workspace row update advances `revision` (or initializes at `1` for new user) without losing existing rows.
   - Stale `p_expected_revision` returns `status: "conflict"` with `current_revision` (OCC verified live).
   - Authenticated `SELECT` readback from `public.user_workspaces` returns persisted changes.

---

## 7. Remaining Risks

1. **P0 Cloud Sync (`PGRST202`) Live Status Unknown:** Until the read-only SQL check and live authenticated RPC acceptance run on the hosted Supabase project, cloud workspace sync remains **unverified in production**.
2. **Live Google Drive OAuth & Hosted Pages Runtime:** CI #74 verifies mocked OAuth flows in Chromium; real Google OAuth (`drive.file`), Drive upload/download, and real user workspace performance on the deployed GitHub Pages site (`Pages #187`) still require owner verification.
3. **Local Environment PG16 Parity:** Local sandbox lacks a PostgreSQL 16 server (`ECONNREFUSED 127.0.0.1:5432`); real PostgreSQL 16 verification relies on GitHub Actions CI (`postgres:16` service container, passed in CI #73 and CI #74).
