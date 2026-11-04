# Independent Review — Phase 4.2.4.4

**Review date:** 2026-11-04  
**Decision:** CHANGES REQUIRED — NOT APPROVED  
**Reviewed report artifact:** `reports/phases/phase-4.2.4.4/phase-4-2-4-4.patch`  
**Patch blob SHA:** `7ee3e1e807c354f23f51eede3679d53cdf4b341c`  
**Report-upload commit on main:** `910485e810d8b74fe124ce57c84d407552760ecf`  
**Expected code base:** `e30fcc2beb063e18494cd224e4267bac45b0703a`

## 1. GitHub state verified

- The Phase 4.2.4.4 artifact on `main` is a unified patch, not an applied source-code commit.
- The Phase folder contains its README and `phase-4-2-4-4.patch`; no standalone `gemini-report.md` was uploaded.
- `Deploying` remains at `e30fcc2beb063e18494cd224e4267bac45b0703a`. Comparing that head with its base returns no changed files.
- CI run [41799999484](https://github.com/JemistryMC/study-hub/actions/runs/41799999484) tested the old `Deploying` SHA `e30fcc2` and passed **288/288**.
- Run [41800393300](https://github.com/JemistryMC/study-hub/actions/runs/41800393300) is a GitHub Pages build/deployment for the report-upload commit, not a CI run for the new PostgreSQL fixture.
- Therefore, the reported **312/312** is not independently verified on GitHub or tied to a code commit containing this patch.

## 2. Blocking findings

### B1 — Connection credentials are not actually switched

The base test file still defines:

```js
function getDbUrl(dbName) {
  const url = new URL(PG16_ADMIN_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}
```

The patch calls `getDbUrl(dbName, user, password)`, but this existing function accepts and uses only `dbName`. JavaScript ignores the extra arguments.

The patch first changes the cluster-global `postgres` password to `postgres_runner_secret`, then attempts to connect `bootstrapAdminConn` using the unchanged credentials from `PG16_ADMIN_URL`. In the supplied CI configuration those credentials are `postgres:postgres`, so the bootstrap login will fail after the password change. The claimed independent `supabase_admin` and `postgres` sessions are not established by the submitted patch.

**Required:** implement and test an explicit connection builder that sets database, username, and password on a URL (or passes explicit pg Client fields), and assert `session_user`/role attributes from both successful live connections. Do not report identity evidence until the actual connections authenticate.

### B2 — Path A client is closed before the parity queries

The patch executes `await pathARunner.end()` after Path A OCC checks. Later, after Path B runs, it calls `pathARunner.query(...)` to read Path A columns, policies, and the OCC context table for parity.

A closed `pg.Client` cannot execute these later queries. Keep the Path A connection alive until all parity queries complete, or open a new authenticated Path A audit connection; close all clients in a robust `finally`.

### B3 — Disposable-cluster guard does not prove the target is disposable

The current expression accepts any of:
- `PG16_DISPOSABLE_CLUSTER === 'true'`
- `CI === 'true'`
- `GITHUB_ACTIONS` is set
- the machine has a `pg_ctl` binary

None of these by itself proves that `PG16_ADMIN_URL` points to a throwaway cluster. The code then changes global role attributes/passwords and creates a superuser.

**Required:** use a genuinely isolated PostgreSQL 16 cluster/service dedicated to this job, and make the connection target part of the verified fixture configuration. Do not treat generic CI environment variables or the presence of `pg_ctl` as proof of disposability.

### B4 — Cleanup does not restore the original cluster state

The `finally` block:
- sets `postgres` to `SUPERUSER`, rather than restoring the role's original attributes;
- does not restore the original `postgres` password;
- does not remove the newly created `supabase_auth_admin` role;
- catches every cleanup error and ignores it;
- then calls `assert(true)` regardless of whether cleanup succeeded.

Additionally, setup and role mutation happen before the `try/finally` starts. A connection failure after changing the password can bypass cleanup entirely.

**Required:** avoid modifying a shared cluster-global `postgres` role. Prefer a job-owned cluster whose bootstrap superuser is `supabase_admin`, with `postgres` created as a separate non-superuser role. Put all mutations inside cleanup-protected scope, clean each resource independently, and assert actual absence/restoration from catalogs. Do not swallow cleanup failures or use `assert(true)`.

### B5 — Warning and Auth ACL evidence is incomplete

`capturedWarnings` is populated but never inspected. The assertion before migration 160000 checks only schema `auth` ACL entries; it does not inspect object ACLs on `auth.users`, even though the migration also attempts a table grant.

**Required:** assert the relevant warning messages (where expected), inspect `aclexplode()` for both `auth.nspacl` and `auth.users.relacl`, and verify the definer role has no unintended direct privilege on either object after both migrations.

### B6 — Path B does not receive the same complete post-migration audit

Path A checks more details than Path B. Path B does not independently check all of:
- auth schema and `auth.users` ACL isolation;
- helper function `SECURITY DEFINER` and fixed `search_path`;
- RPC function `proconfig` / search_path;
- RLS policy expressions and trigger enabled state;
- direct `auth.uid()` denial and helper behavior with and without a claim under the definer role.

**Required:** run the security-critical catalog and behavior checks against both paths independently.

### B7 — “100% catalog parity” overstates the implemented comparison

The parity code compares only:
1. `user_workspaces` column metadata;
2. its RLS policy expressions;
3. `occ_active_write_context` column metadata.

It does not compare all catalog dimensions claimed in the report (constraints, indexes, triggers, function definitions/configuration/owners, grants/ACLs, RLS flags, sequences, etc.).

**Required:** either expand the parity checks to the declared dimensions or rename the result narrowly, for example “three-surface parity”, and document exactly what is not compared.

## 3. Migration history concern

The patch modifies historical migration `20261103150000_unforgeable_occ_and_role_hardening.sql` by adding temporary `CREATE` grant/revoke statements. The patch changes its blob from the known base `45336261940287c723a1433d14d8f454b9e7655f` to `45821095cb6738c71bc022c21d7770bcd3bbfadf`.

This is a historical migration change, not merely a test-fixture change. Before accepting it, provide an explicit fresh-install and already-deployed migration-history strategy, including whether any deployed database has recorded the original migration and how checksum/history validation is handled. Do not apply it to a live Supabase project.

## 4. Evidence and test totals

The only independently verified CI total for the current `Deploying` source SHA is **288/288** at `e30fcc2`. It does not contain the Phase 4.2.4.4 code. The successful Pages run on `910485e` is not evidence that the patch passed PostgreSQL tests.

Also, because B1 and B2 are deterministic execution blockers in the submitted Section 8 patch, the pasted Phase 4.2.4.4 success logs cannot be attributed to this exact patch unless the executed local source differed from the submitted patch. Reconcile that discrepancy and provide raw logs generated from the exact resulting source SHA.

## 5. Required next delivery

1. Fix B1–B7 in the local working tree.
2. Provide the exact updated `getDbUrl` implementation and corrected connection lifecycle.
3. Prove the fixture is isolated without weakening the safety guard or leaving global role/password changes behind.
4. Run the full suite from the final local working tree and retain unedited logs.
5. Reconcile the historical migration change explicitly.
6. Return a new unified patch against `e30fcc2` and state the exact source files changed.

Do not push, commit, open a PR, deploy, or apply migrations to a live Supabase project until this review is resolved.
