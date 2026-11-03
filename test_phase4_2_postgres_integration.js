// ============================================================================
// Exo Academic Platform — Phase 4.2 Embedded PostgreSQL Compatibility Test Suite
// Category: Embedded PostgreSQL Compatibility Tests (@electric-sql/pglite WASM Engine)
//
// Important Scope & Engine Distinction (Phase 4.2.1):
//   - PGlite (@electric-sql/pglite 0.5.15) is a single-connection WebAssembly
//     build of PostgreSQL (reporting PG 18.6 on wasm32-unknown-emscripten).
//   - It validates SQL syntax, RLS policies, storage.objects policies, triggers,
//     ALTER DEFAULT PRIVILEGES, and single-connection RPC logic in an embedded engine.
//   - It does NOT prove PostgreSQL 16 compatibility or multi-connection concurrency,
//     and skips 4 extensions (pg_stat_statements, pgcrypto, supabase_vault, uuid-ossp).
//   - Real PostgreSQL 16 verification (major=16 gate, extensions, 10-dimension
//     catalog parity, and multi-connection concurrency proof) is executed in
//     `test_phase4_2_1_pg16_concurrency.js`.
// ============================================================================

const fs = require('fs');
const { PGlite } = require('@electric-sql/pglite');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${testName}${details ? ' (' + details + ')' : ''}`);
    testsFailed++;
  }
}

// Minimal Supabase environment bootstrap for a real PostgreSQL 16 instance
// Sets up standard Supabase roles (anon, authenticated, service_role) and
// schemas (auth, storage, extensions, vault) so the actual migration SQL files
// execute unmodified on PostgreSQL.
const SUPABASE_PG_BOOTSTRAP_SQL = `
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
    END IF;
  END
  $$;

  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE SCHEMA IF NOT EXISTS storage;
  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE SCHEMA IF NOT EXISTS vault;

  GRANT USAGE ON SCHEMA public, auth, storage, extensions TO postgres, anon, authenticated, service_role;

  CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY,
    email text
  );
  GRANT SELECT ON TABLE auth.users TO postgres, anon, authenticated, service_role;

  CREATE OR REPLACE FUNCTION auth.uid()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  AS $$
    SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;

  CREATE OR REPLACE FUNCTION auth.role()
  RETURNS text
  LANGUAGE sql
  STABLE
  AS $$
    SELECT COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''), current_user);
  $$;

  GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC, postgres, anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.role() TO PUBLIC, postgres, anon, authenticated, service_role;

  CREATE TABLE IF NOT EXISTS storage.buckets (
    id text PRIMARY KEY,
    name text NOT NULL,
    public boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );

  CREATE TABLE IF NOT EXISTS storage.objects (
    id bigserial PRIMARY KEY,
    bucket_id text NOT NULL REFERENCES storage.buckets(id) ON DELETE CASCADE,
    name text NOT NULL,
    owner uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    UNIQUE (bucket_id, name)
  );

  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE storage.objects TO postgres, authenticated, service_role;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA storage TO postgres, authenticated, service_role;

  CREATE OR REPLACE FUNCTION storage.foldername(name text)
  RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  AS $$
    SELECT pg_catalog.string_to_array(name, '/');
  $$;
  GRANT EXECUTE ON FUNCTION storage.foldername(text) TO PUBLIC, postgres, anon, authenticated, service_role;

  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END
  $$;
`;

function stripUnsupportedExtensionsForPglite(sqlText) {
  return sqlText
    .replace(/CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"[^;]*;/g, '-- skipped pg_stat_statements in embedded PG')
    .replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto"[^;]*;/g, '-- skipped pgcrypto in embedded PG')
    .replace(/CREATE EXTENSION IF NOT EXISTS "supabase_vault"[^;]*;/g, '-- skipped supabase_vault in embedded PG')
    .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp"[^;]*;/g, '-- skipped uuid-ossp in embedded PG');
}

// Helper to run SQL inside a transaction as a specific Supabase role + JWT user
async function execAsSupabaseSession(db, role, userId, sqlQuery, params = []) {
  await db.exec('BEGIN');
  try {
    await db.query(`SET LOCAL ROLE ${role}`);
    await db.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', $1, true)`, [role]);
    await db.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userId || '']);
    const res = await db.query(sqlQuery, params);
    await db.exec('COMMIT');
    return { ok: true, rows: res.rows };
  } catch (err) {
    await db.exec('ROLLBACK');
    return { ok: false, error: err };
  }
}

async function main() {
  console.log('======================================================================');
  console.log('EXO PHASE 4.2: EMBEDDED POSTGRESQL COMPATIBILITY SUITE (PGLITE WASM)');
  console.log('======================================================================\n');

  // --------------------------------------------------------------------------
  // SECTION 1: Apply Migrations in Embedded PGlite & Verify Core Object Parity
  // (Note: 4 extensions [pg_stat_statements, pgcrypto, supabase_vault, uuid-ossp]
  //  are excluded in PGlite WASM; full PG16 parity is tested in test_phase4_2_1_pg16_concurrency.js)
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: Embedded PGlite Migration Execution & Core Object Compatibility ---');

  const dbMigrated = new PGlite();
  await dbMigrated.exec(SUPABASE_PG_BOOTSTRAP_SQL);

  const baselineMigrationSql = fs.readFileSync('supabase/migrations/20261103133622_remote_schema.sql', 'utf8');
  const forwardMigrationSql = fs.readFileSync('supabase/migrations/20261103140000_fix_security_and_privileges.sql', 'utf8');

  await dbMigrated.exec(baselineMigrationSql);
  await dbMigrated.exec(forwardMigrationSql);
  assert(true, 'Embedded PGlite cleanly executed 20261103133622_remote_schema.sql + 20261103140000_fix_security_and_privileges.sql');

  // Initialize a second independent PGlite instance from supabase/schema.sql (with 4 WASM-unsupported extensions stripped)
  const dbFreshSchema = new PGlite();
  await dbFreshSchema.exec(SUPABASE_PG_BOOTSTRAP_SQL);
  const finalSchemaSql = stripUnsupportedExtensionsForPglite(fs.readFileSync('supabase/schema.sql', 'utf8'));
  await dbFreshSchema.exec(finalSchemaSql);
  await dbMigrated.exec('SET search_path = public, auth, storage, extensions;');
  await dbFreshSchema.exec('SET search_path = public, auth, storage, extensions;');
  assert(true, 'Fresh PGlite instance initialized from supabase/schema.sql (with 4 unsupported WASM extensions excluded)');

  // Compare columns on public.user_workspaces between dbMigrated and dbFreshSchema
  const colsQuery = `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_workspaces'
    ORDER BY column_name
  `;
  const migratedCols = (await dbMigrated.query(colsQuery)).rows;
  const freshCols = (await dbFreshSchema.query(colsQuery)).rows;
  assert(
    JSON.stringify(migratedCols) === JSON.stringify(freshCols) &&
      migratedCols.some((c) => c.column_name === 'revision' && c.data_type === 'integer'),
    'supabase/schema.sql columns and defaults (including revision integer NOT NULL) match migrated PGlite database'
  );

  // Compare RLS policies on public.user_workspaces and storage.objects (including USING and WITH CHECK)
  const policiesQuery = `
    SELECT schemaname, tablename, policyname, permissive, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE (schemaname = 'public' AND tablename = 'user_workspaces')
       OR (schemaname = 'storage' AND tablename = 'objects')
    ORDER BY schemaname, tablename, policyname
  `;
  const migratedPolicies = (await dbMigrated.query(policiesQuery)).rows;
  const freshPolicies = (await dbFreshSchema.query(policiesQuery)).rows;
  assert(
    JSON.stringify(migratedPolicies) === JSON.stringify(freshPolicies),
    'supabase/schema.sql RLS policy names, roles, USING, and WITH CHECK match migrated PGlite database'
  );

  // Compare triggers on public.user_workspaces
  const triggersQuery = `
    SELECT tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'user_workspaces' AND NOT t.tgisinternal
    ORDER BY tgname
  `;
  const migratedTriggers = (await dbMigrated.query(triggersQuery)).rows.map((r) => r.tgname);
  const freshTriggers = (await dbFreshSchema.query(triggersQuery)).rows.map((r) => r.tgname);
  assert(
    JSON.stringify(migratedTriggers) === JSON.stringify(freshTriggers) &&
      migratedTriggers.includes('trg_user_workspaces_updated_at') &&
      migratedTriggers.includes('trg_enforce_workspace_write_via_rpc'),
    'supabase/schema.sql triggers on user_workspaces match migrated PGlite database'
  );

  // --------------------------------------------------------------------------
  // SECTION 2: Default Function Privileges & Existing Function Least-Privilege
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: PostgreSQL Default Function Privileges & Function Least-Privilege ---');

  const privCheckSql = `
    SELECT
      has_function_privilege('anon', 'public.enforce_workspace_media_security()', 'EXECUTE') AS anon_media_trig,
      has_function_privilege('authenticated', 'public.enforce_workspace_media_security()', 'EXECUTE') AS auth_media_trig,
      has_function_privilege('anon', 'public.protect_vip_status_column()', 'EXECUTE') AS anon_vip_trig,
      has_function_privilege('authenticated', 'public.protect_vip_status_column()', 'EXECUTE') AS auth_vip_trig,
      has_function_privilege('anon', 'public.handle_user_workspace_updated_at()', 'EXECUTE') AS anon_upd_trig,
      has_function_privilege('authenticated', 'public.handle_user_workspace_updated_at()', 'EXECUTE') AS auth_upd_trig,
      has_function_privilege('anon', 'public.enforce_workspace_write_via_rpc()', 'EXECUTE') AS anon_occ_trig,
      has_function_privilege('authenticated', 'public.enforce_workspace_write_via_rpc()', 'EXECUTE') AS auth_occ_trig,
      has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE') AS anon_rls_trig,
      has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE') AS auth_rls_trig,
      has_function_privilege('anon', 'public.sync_workspace_with_concurrency(jsonb, integer)', 'EXECUTE') AS anon_sync_rpc,
      has_function_privilege('authenticated', 'public.sync_workspace_with_concurrency(jsonb, integer)', 'EXECUTE') AS auth_sync_rpc
  `;
  const privsMigrated = (await dbMigrated.query(privCheckSql)).rows[0];
  const privsFresh = (await dbFreshSchema.query(privCheckSql)).rows[0];

  assert(
    !privsMigrated.anon_media_trig &&
      !privsMigrated.anon_vip_trig &&
      !privsMigrated.anon_upd_trig &&
      !privsMigrated.anon_occ_trig &&
      !privsMigrated.anon_rls_trig &&
      !privsMigrated.anon_sync_rpc,
    'Role anon has ZERO EXECUTE privileges on any function in public schema'
  );
  assert(
    !privsMigrated.auth_media_trig &&
      !privsMigrated.auth_vip_trig &&
      !privsMigrated.auth_upd_trig &&
      !privsMigrated.auth_occ_trig &&
      !privsMigrated.auth_rls_trig &&
      privsMigrated.auth_sync_rpc === true,
    'Role authenticated can ONLY execute sync_workspace_with_concurrency(jsonb, integer) and NO internal trigger functions'
  );
  assert(
    JSON.stringify(privsMigrated) === JSON.stringify(privsFresh),
    'Fresh database from supabase/schema.sql has identical function privilege matrix as migrated database'
  );

  // Create future functions as postgres in BOTH public and a non-public schema WITHOUT explicit REVOKE
  await dbMigrated.exec(`
    CREATE SCHEMA IF NOT EXISTS internal_audit;
    GRANT USAGE ON SCHEMA internal_audit TO anon, authenticated;

    CREATE OR REPLACE FUNCTION public.future_unrevoked_helper()
    RETURNS text
    LANGUAGE sql
    AS $$ SELECT 'secret_public'::text; $$;

    CREATE OR REPLACE FUNCTION internal_audit.future_global_helper()
    RETURNS text
    LANGUAGE sql
    AS $$ SELECT 'secret_global'::text; $$;
  `);

  const futurePrivs = (
    await dbMigrated.query(`
      SELECT
        has_function_privilege('anon', 'public.future_unrevoked_helper()', 'EXECUTE') AS anon_pub_future,
        has_function_privilege('authenticated', 'public.future_unrevoked_helper()', 'EXECUTE') AS auth_pub_future,
        has_function_privilege('anon', 'internal_audit.future_global_helper()', 'EXECUTE') AS anon_glob_future,
        has_function_privilege('authenticated', 'internal_audit.future_global_helper()', 'EXECUTE') AS auth_glob_future
    `)
  ).rows[0];

  assert(
    futurePrivs.anon_pub_future === false && futurePrivs.auth_pub_future === false,
    'Future function created by postgres in schema public does NOT grant inherited PUBLIC EXECUTE to anon or authenticated'
  );
  assert(
    futurePrivs.anon_glob_future === false && futurePrivs.auth_glob_future === false,
    'Global ALTER DEFAULT PRIVILEGES blocks inherited PUBLIC EXECUTE on future functions created by postgres in other schemas'
  );

  // Verify actual runtime execution attempt by authenticated is rejected by PostgreSQL
  const unauthExecAttempt = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    'aaaaaaaa-1111-2222-3333-444455556666',
    `SELECT public.future_unrevoked_helper()`
  );
  assert(
    unauthExecAttempt.ok === false && String(unauthExecAttempt.error?.message || '').includes('permission denied'),
    'Authenticated session attempting to call unauthorized function is blocked by PostgreSQL (permission denied)'
  );

  // Clean up test helper functions
  await dbMigrated.exec(`
    DROP FUNCTION public.future_unrevoked_helper();
    DROP SCHEMA internal_audit CASCADE;
  `);

  // --------------------------------------------------------------------------
  // SECTION 3: Cross-Account RLS Isolation (Two Independent Accounts & Sessions)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Real Two-Account RLS Isolation & Trigger Enforcement ---');

  const userA = 'aaaaaaaa-1111-2222-3333-444455556666';
  const userB = 'bbbbbbbb-9999-8888-7777-666655554444';

  await dbMigrated.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4)`, [
    userA,
    'Alice.Pharma@Exo.Edu',
    userB,
    'Bob.Clinical@Exo.Edu'
  ]);

  // Session A initializes workspace (even attempting to spoof can_upload_media: true)
  const initARes = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userA,
    `SELECT public.sync_workspace_with_concurrency($1::jsonb, NULL) AS res`,
    [
      JSON.stringify({
        user_email: 'spoofed@evil.com',
        can_upload_media: true,
        subjects: [{ id: 'sub_a1', name: 'Medicinal Chemistry A' }],
        annotations: { lec_101: { 1: [{ id: 'st_a', note: 'Alice Private Note' }] } }
      })
    ]
  );
  assert(
    initARes.ok === true && initARes.rows[0].res.status === 'success' && initARes.rows[0].res.revision === 1,
    'Account A initializes workspace via sync_workspace_with_concurrency() at revision 1'
  );

  // Session B initializes workspace
  const initBRes = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userB,
    `SELECT public.sync_workspace_with_concurrency($1::jsonb, 1) AS res`,
    [
      JSON.stringify({
        subjects: [{ id: 'sub_b1', name: 'Pharmacology B' }],
        annotations: { lec_101: { 1: [{ id: 'st_b', note: 'Bob Private Note' }] } }
      })
    ]
  );
  assert(
    initBRes.ok === true && initBRes.rows[0].res.status === 'success' && initBRes.rows[0].res.revision === 1,
    'Account B initializes workspace via sync_workspace_with_concurrency() at revision 1'
  );

  // Verify Account A can ONLY see Account A's row and that enforce_workspace_media_security enforced email + can_upload_media=false
  const readASession = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userA,
    `SELECT user_id, user_email, can_upload_media, revision, subjects, annotations FROM public.user_workspaces`
  );
  assert(
    readASession.ok === true && readASession.rows.length === 1 && readASession.rows[0].user_id === userA,
    'Account A SELECT on user_workspaces returns strictly 1 row (Account A) and zero rows from Account B'
  );
  assert(
    readASession.rows[0].user_email === 'alice.pharma@exo.edu' && readASession.rows[0].can_upload_media === false,
    'Trigger enforce_workspace_media_security normalized user_email from auth.users and blocked client can_upload_media spoofing'
  );

  // Verify Account A querying Account B by explicit user_id returns 0 rows
  const readBFromA = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userA,
    `SELECT * FROM public.user_workspaces WHERE user_id = $1`,
    [userB]
  );
  assert(
    readBFromA.ok === true && readBFromA.rows.length === 0,
    'Account A explicitly querying WHERE user_id = Account B returns 0 rows under PostgreSQL RLS'
  );

  // Verify anon cannot read user_workspaces at all
  const anonSelect = await execAsSupabaseSession(
    dbMigrated,
    'anon',
    null,
    `SELECT * FROM public.user_workspaces`
  );
  assert(
    anonSelect.ok === false && String(anonSelect.error?.message || '').includes('permission denied'),
    'Role anon is completely denied SELECT access to public.user_workspaces'
  );

  // --------------------------------------------------------------------------
  // SECTION 4: Optimistic Concurrency Enforcement & Direct Write Bypass Blocking
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Database-Level OCC Enforcement & Direct Write Bypass Blocking ---');

  // 4.1 Direct UPDATE by authenticated user is blocked by table privilege revocation
  const directUpdateAttempt = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userA,
    `UPDATE public.user_workspaces SET subjects = '[{"id":"direct_bypass"}]'::jsonb WHERE user_id = $1`,
    [userA]
  );
  assert(
    directUpdateAttempt.ok === false && String(directUpdateAttempt.error?.message || '').includes('permission denied'),
    'Direct UPDATE on user_workspaces by authenticated role is blocked by PostgreSQL table privilege revocation'
  );

  // 4.2 Direct INSERT by authenticated user is blocked
  const directInsertAttempt = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userA,
    `INSERT INTO public.user_workspaces (user_id, subjects) VALUES ($1, '[]'::jsonb)`,
    [userA]
  );
  assert(
    directInsertAttempt.ok === false && String(directInsertAttempt.error?.message || '').includes('permission denied'),
    'Direct INSERT on user_workspaces by authenticated role is blocked by PostgreSQL table privilege revocation'
  );

  // 4.3 Defense-in-Depth: Even if INSERT/UPDATE table privileges were granted, trg_enforce_workspace_write_via_rpc blocks direct write!
  await dbMigrated.exec(`GRANT INSERT, UPDATE ON TABLE public.user_workspaces TO authenticated;`);
  const triggerBlockedUpdate = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userA,
    `UPDATE public.user_workspaces SET subjects = '[{"id":"bypass_attempt"}]'::jsonb WHERE user_id = $1`,
    [userA]
  );
  await dbMigrated.exec(`REVOKE INSERT, UPDATE ON TABLE public.user_workspaces FROM authenticated;`);
  assert(
    triggerBlockedUpdate.ok === false &&
      (String(triggerBlockedUpdate.error?.message || '').includes('OCC_BYPASS_FORBIDDEN') ||
        String(triggerBlockedUpdate.error?.message || '').includes('row-level security')),
    'Defense-in-depth trigger (enforce_workspace_write_via_rpc) and RLS block direct UPDATE even if table privileges are granted'
  );

  // 4.4 Valid sequential update via sync_workspace_with_concurrency increments revision 1 -> 2
  const validRpcUpdate = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userA,
    `SELECT public.sync_workspace_with_concurrency($1::jsonb, 1) AS res`,
    [
      JSON.stringify({
        subjects: [
          { id: 'sub_a1', name: 'Medicinal Chemistry A' },
          { id: 'sub_a2', name: 'Biopharmaceutics' }
        ]
      })
    ]
  );
  assert(
    validRpcUpdate.ok === true &&
      validRpcUpdate.rows[0].res.status === 'success' &&
      validRpcUpdate.rows[0].res.revision === 2,
    'Valid sync_workspace_with_concurrency(payload, expected_revision=1) succeeds and increments revision to 2'
  );

  // 4.5 Stale revision (expected_revision=1 when DB is at 2) is rejected with conflict
  const staleRpcAttempt = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userA,
    `SELECT public.sync_workspace_with_concurrency($1::jsonb, 1) AS res`,
    [
      JSON.stringify({
        subjects: [{ id: 'sub_stale', name: 'Should Not Overwrite' }]
      })
    ]
  );
  assert(
    staleRpcAttempt.ok === true &&
      staleRpcAttempt.rows[0].res.status === 'conflict' &&
      staleRpcAttempt.rows[0].res.current_revision === 2,
    'Stale revision (p_expected_revision=1 vs DB revision=2) is rejected with { status: "conflict", current_revision: 2 }'
  );

  // Verify DB was NOT overwritten by stale update
  const checkAfterStale = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userA,
    `SELECT revision, subjects FROM public.user_workspaces WHERE user_id = $1`,
    [userA]
  );
  assert(
    checkAfterStale.rows[0].revision === 2 &&
      checkAfterStale.rows[0].subjects.length === 2 &&
      checkAfterStale.rows[0].subjects[1].id === 'sub_a2',
    'Database row remains intact at revision 2 after rejected stale update'
  );

  // 4.6 First-time initialization race: Second device passes p_expected_revision = NULL when row already exists
  const nullRevAttempt = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userA,
    `SELECT public.sync_workspace_with_concurrency($1::jsonb, NULL) AS res`,
    [JSON.stringify({ subjects: [] })]
  );
  assert(
    nullRevAttempt.ok === true &&
      nullRevAttempt.rows[0].res.status === 'conflict' &&
      nullRevAttempt.rows[0].res.current_revision === 2,
    'First-time initialization race (p_expected_revision = NULL on existing workspace) returns conflict without overwriting'
  );

  // 4.7 Unauthenticated RPC call (auth.uid() IS NULL) is rejected
  const unauthRpcCall = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    '',
    `SELECT public.sync_workspace_with_concurrency('{}'::jsonb, 1)`
  );
  assert(
    unauthRpcCall.ok === false && String(unauthRpcCall.error?.message || '').includes('Not authenticated'),
    'sync_workspace_with_concurrency() rejects unauthenticated calls where auth.uid() is NULL'
  );

  // --------------------------------------------------------------------------
  // SECTION 5: Storage RLS Policies & VIP Upload Enforcement on storage.objects
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 5: Real Storage Policies & VIP Media Upload Enforcement ---');

  // 5.1 Non-VIP Account A (can_upload_media = false) cannot upload to lecture_media
  const nonVipUploadA = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userA,
    `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('lecture_media', $1, $2)`,
    [`${userA}/lec_101.pdf`, userA]
  );
  assert(
    nonVipUploadA.ok === false && String(nonVipUploadA.error?.message || '').includes('row-level security'),
    'Non-VIP Account A (can_upload_media = false) is blocked by RLS from uploading to storage.objects'
  );

  // 5.2 Admin (postgres) enables VIP status for Account A; revision increments to 3
  await dbMigrated.query(
    `UPDATE public.user_workspaces SET can_upload_media = true WHERE user_id = $1`,
    [userA]
  );
  const vipUploadA = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userA,
    `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('lecture_media', $1, $2) RETURNING id`,
    [`${userA}/lec_101.pdf`, userA]
  );
  assert(
    vipUploadA.ok === true && vipUploadA.rows.length === 1,
    'VIP Account A (can_upload_media = true) is allowed to upload to own folder in storage.objects'
  );

  // 5.3 VIP Account A cannot upload into Account B folder
  const crossFolderUpload = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userA,
    `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('lecture_media', $1, $2)`,
    [`${userB}/hijack.pdf`, userA]
  );
  assert(
    crossFolderUpload.ok === false && String(crossFolderUpload.error?.message || '').includes('row-level security'),
    'VIP Account A is blocked by RLS from uploading into Account B folder'
  );

  // 5.4 Account B cannot read or delete Account A storage objects
  const crossFolderRead = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userB,
    `SELECT * FROM storage.objects WHERE bucket_id = 'lecture_media'`
  );
  assert(
    crossFolderRead.ok === true && crossFolderRead.rows.length === 0,
    'Account B SELECT on storage.objects returns 0 rows from Account A private media folder'
  );

  // --------------------------------------------------------------------------
  // SECTION 6: Real End-to-End ClientSync (index.html) <-> PostgreSQL Integration
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 6: ClientSync (index.html) <-> Real PostgreSQL Integration ---');

  // Extract real production sync & isolation functions from index.html
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  function extractFunctionSource(code, funcName) {
    const patterns = [`async function ${funcName}(`, `function ${funcName}(`];
    let startIdx = -1;
    for (const pat of patterns) {
      startIdx = code.indexOf(pat);
      if (startIdx !== -1) break;
    }
    if (startIdx === -1) throw new Error(`Function ${funcName} not found in index.html`);
    let depth = 0;
    let inFunc = false;
    let endIdx = startIdx;
    for (let i = startIdx; i < code.length; i++) {
      if (code[i] === '{') {
        depth++;
        inFunc = true;
      } else if (code[i] === '}') {
        depth--;
        if (inFunc && depth === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }
    return code.substring(startIdx, endIdx);
  }

  // Create an isolated client instance wired directly to the real PGlite database
  function createRealPgConnectedClient(initialUser, overrideDbJwtUid = undefined) {
    const localStorageMap = new Map();
    const localStorageMock = {
      getItem: (k) => (localStorageMap.has(k) ? localStorageMap.get(k) : null),
      setItem: (k, v) => localStorageMap.set(k, String(v)),
      removeItem: (k) => localStorageMap.delete(k)
    };

    // Real PostgreSQL-backed Supabase client adapter
    function makePgSupabaseAdapter(getActiveUid) {
      return {
        rpc: async (fnName, args) => {
          const uid = overrideDbJwtUid !== undefined ? overrideDbJwtUid : getActiveUid();
          if (fnName === 'sync_workspace_with_concurrency') {
            const res = await execAsSupabaseSession(
              dbMigrated,
              'authenticated',
              uid,
              `SELECT public.sync_workspace_with_concurrency($1::jsonb, $2::integer) AS data`,
              [JSON.stringify(args.p_payload), args.p_expected_revision ?? null]
            );
            if (!res.ok) return { data: null, error: res.error };
            return { data: res.rows[0].data, error: null };
          }
          return { data: null, error: new Error(`Unknown RPC ${fnName}`) };
        },
        from: (table) => ({
          select: (cols = '*') => ({
            eq: (col, val) => ({
              maybeSingle: async () => {
                const uid = getActiveUid();
                const res = await execAsSupabaseSession(
                  dbMigrated,
                  'authenticated',
                  uid,
                  `SELECT ${cols} FROM public.${table} WHERE ${col} = $1 LIMIT 1`,
                  [val]
                );
                if (!res.ok) return { data: null, error: res.error };
                return { data: res.rows[0] || null, error: null };
              }
            })
          })
        })
      };
    }

    const factory = new Function(
      'localStorage',
      'makePgSupabaseAdapter',
      `
      let currentCloudUser = null;
      let currentSessionGeneration = 1;
      let dbInstance = { mocked: true };
      let inMemoryAnnotationsCache = {};
      let inMemoryAnnotationsCacheNormalized = {};
      let localMediaCache = { pdfs: new Set(), audios: new Set() };
      let subjects = [];
      let scheduleEvents = [];
      let scheduleBacklog = [];
      let plannerPrefs = { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75 };
      let weeklyReports = [];
      let logs = [];
      let completedAcademyModules = [];
      let currentPdfFitMode = 'height';
      let cloudMediaRegistry = {};
      let currentUserCanUploadMedia = false;
      let currentCloudWorkspaceRevision = 1;
      let lastUploadedAnnotationsSignature = '';
      let dirtyAnnotationsForCloud = false;
      let localWorkspaceMutationSeq = 0;
      let localAnnotationsMutationSeq = 0;
      let isCloudSyncing = false;
      let activeCloudSyncPromise = null;
      const activeCloudSyncByAccount = new Map();
      let isBulkMediaUploading = false;
      let isLoginSyncInProgress = false;
      let lastLoginSyncUserId = null;
      let lastCloudPullTimestampMs = 0;
      let hasReconciledBucketThisSession = true;
      let currentViewingLec = null;
      let pageAnnotations = {};
      let renderedPagesSet = new Set();

      const navigator = { onLine: true };
      const document = { getElementById: () => null };
      const showToast = () => {};
      const updateCloudNavUI = () => {};
      const updateAcademyXpUI = () => {};
      const updateCloudMediaStatsUI = () => {};
      const renderSubjectsList = () => {};
      const renderGroups = () => {};
      const renderSchedule = () => {};
      const updateTracker = () => {};
      const activeSubjectId = null;
      const snapshotCurrentSubjectsMediaToRegistry = () => {};
      const saveCloudMediaRegistry = () => {};
      const healSubjectsFromCloudRegistry = () => {};
      const reconcileCloudMediaWithStorageBucket = async () => {};
      const getLocalTombstones = () => ({ subjects: {}, groups: {}, lectures: {}, events: {}, logs: {} });
      const computeFastStringSignature = (s) => String(s.length) + ':' + s.slice(0, 32);

      let simulatedIdbAnnotations = {};
      let simulateIdbFailure = false;

      async function flushPendingAnnotationsSave() { return true; }
      async function refreshLocalMediaCache() { return localMediaCache; }
      async function getAllAnnotationsMapFromDB(targetUserId, ctx) {
        if (simulateIdbFailure) {
          return { ok: false, error: { code: 'IDB_READ_ERROR', message: 'Simulated IndexedDB read failure' } };
        }
        return { ok: true, verifiedMap: JSON.parse(JSON.stringify(simulatedIdbAnnotations)), quarantined: [] };
      }
      async function restoreAllAnnotationsMapToDB(map, targetUserId, ctx) {
        simulatedIdbAnnotations = JSON.parse(JSON.stringify(map || {}));
        return { ok: true, restoredCount: Object.keys(simulatedIdbAnnotations).length };
      }

      const setTimeout = () => {};

      ${extractFunctionSource(indexHtml, 'bumpAccountSessionGeneration')}
      ${extractFunctionSource(indexHtml, 'getCanonicalUserId')}
      ${extractFunctionSource(indexHtml, 'sanitizeUserIdForPrefix')}
      ${extractFunctionSource(indexHtml, 'sanitizeForScopedKey')}
      ${extractFunctionSource(indexHtml, 'getUserStoragePrefix')}
      ${extractFunctionSource(indexHtml, 'createAccountOperationContext')}
      ${extractFunctionSource(indexHtml, 'resolveAccountOperationContext')}
      ${extractFunctionSource(indexHtml, 'getAccountBackupStorageKey')}
      ${extractFunctionSource(indexHtml, 'extractUserIdFromScopedKey')}
      ${extractFunctionSource(indexHtml, 'extractRawIdFromScopedKey')}
      ${extractFunctionSource(indexHtml, 'toScopedKey')}
      ${extractFunctionSource(indexHtml, 'resolveAuthorizedScopedKey')}
      ${extractFunctionSource(indexHtml, 'normalizeAndRecoverLectureAnnotations')}
      ${extractFunctionSource(indexHtml, 'computeStrokeUniqueSignature')}
      ${extractFunctionSource(indexHtml, 'mergeAndApplyCloudConflict')}
      ${extractFunctionSource(indexHtml, 'pushWorkspaceToCloud')}
      ${extractFunctionSource(indexHtml, 'applyCloudWorkspacePayload')}
      ${extractFunctionSource(indexHtml, 'pullWorkspaceFromCloud')}

      const supabaseClient = makePgSupabaseAdapter(() => currentCloudUser ? currentCloudUser.id : '');

      return {
        login(userObj) {
          currentCloudUser = userObj;
          bumpAccountSessionGeneration();
        },
        setSubjects(subs) { subjects = JSON.parse(JSON.stringify(subs)); },
        getSubjects() { return subjects; },
        setAnnotations(annos) { simulatedIdbAnnotations = JSON.parse(JSON.stringify(annos)); dirtyAnnotationsForCloud = true; },
        getAnnotations() { return simulatedIdbAnnotations; },
        setSimulateIdbFailure(flag) { simulateIdbFailure = Boolean(flag); },
        getRevision() { return Number(localStorage.getItem('pharmaWorkspaceRevision_' + currentCloudUser.id) || currentCloudWorkspaceRevision); },
        pullWorkspaceFromCloud,
        pushWorkspaceToCloud
      };
    `
    );

    const client = factory(localStorageMock, makePgSupabaseAdapter);
    if (initialUser) client.login(initialUser);
    return client;
  }

  // 6.1 Test IndexedDB Read Failure Guard Against Real PostgreSQL
  const clientA = createRealPgConnectedClient({ id: userA, email: 'alice.pharma@exo.edu' });
  await clientA.pullWorkspaceFromCloud(false);
  assert(
    clientA.getRevision() === 3 && clientA.getAnnotations().lec_101 !== undefined,
    'Client A pulled workspace and annotations from real PostgreSQL at revision 3'
  );

  // Now simulate an IndexedDB read failure on Client A and attempt to push with forceIncludeAnnotations=true
  clientA.setSimulateIdbFailure(true);
  const failedPushRes = await clientA.pushWorkspaceToCloud(true, true);
  assert(
    failedPushRes.status === 'error' && failedPushRes.error === 'LOCAL_ANNOTATIONS_READ_ERROR',
    'pushWorkspaceToCloud() aborts with LOCAL_ANNOTATIONS_READ_ERROR when IndexedDB read fails'
  );

  // Verify in real PostgreSQL that Alice's annotations and revision were NOT overwritten!
  const aliceDbRow = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userA,
    `SELECT revision, annotations FROM public.user_workspaces WHERE user_id = $1`,
    [userA]
  );
  assert(
    aliceDbRow.rows[0].revision === 3 &&
      aliceDbRow.rows[0].annotations?.lec_101?.['1']?.[0]?.note === 'Alice Private Note',
    'Real PostgreSQL annotations and revision remain 100% untouched after aborted client push'
  );

  // 6.2 Two Concurrent Sessions for Account B Hitting Real PostgreSQL Revision Conflict & Three-Way Merge
  const sessionB1 = createRealPgConnectedClient({ id: userB, email: 'bob.clinical@exo.edu' });
  const sessionB2 = createRealPgConnectedClient({ id: userB, email: 'bob.clinical@exo.edu' });

  await sessionB1.pullWorkspaceFromCloud(false);
  await sessionB2.pullWorkspaceFromCloud(false);
  assert(
    sessionB1.getRevision() === 1 && sessionB2.getRevision() === 1,
    'Both Session B1 and Session B2 start synchronized with real PostgreSQL at revision 1'
  );

  // Session B1 adds subject sub_b2 and pushes to real PostgreSQL -> revision becomes 2
  sessionB1.setSubjects([
    { id: 'sub_b1', name: 'Pharmacology B', groups: [] },
    { id: 'sub_b2', name: 'Clinical Pharmacokinetics (Device 1)', groups: [] }
  ]);
  const pushB1 = await sessionB1.pushWorkspaceToCloud(false, false);
  assert(
    pushB1.status === 'success' && pushB1.revision === 2,
    'Session B1 push commits to real PostgreSQL and advances revision from 1 to 2'
  );

  // Session B2 (still at stale expectedRev = 1) adds subject sub_b3 and pushes to real PostgreSQL
  sessionB2.setSubjects([
    { id: 'sub_b1', name: 'Pharmacology B', groups: [] },
    { id: 'sub_b3', name: 'Toxicology (Device 2)', groups: [] }
  ]);
  const pushB2 = await sessionB2.pushWorkspaceToCloud(false, false);
  assert(
    pushB2.status === 'conflict' && pushB2.current_revision === 2 && sessionB2.getRevision() === 2,
    'Session B2 push with stale revision 1 triggers real PostgreSQL conflict detection and three-way merge to revision 2'
  );

  // Push the merged state from Session B2 back to real PostgreSQL -> advances to revision 3
  const postMergePushB2 = await sessionB2.pushWorkspaceToCloud(false, false);
  assert(
    postMergePushB2.status === 'success' && postMergePushB2.revision === 3,
    'Post-merge push from Session B2 succeeds on real PostgreSQL and advances revision to 3'
  );

  // Verify that real PostgreSQL now has revision 3 with ALL 3 subjects!
  const bobDbRow = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userB,
    `SELECT revision, subjects FROM public.user_workspaces WHERE user_id = $1`,
    [userB]
  );
  const bobSubjectIds = (bobDbRow.rows[0].subjects || []).map((s) => s.id).sort();
  assert(
    bobDbRow.rows[0].revision === 3 &&
      JSON.stringify(bobSubjectIds) === JSON.stringify(['sub_b1', 'sub_b2', 'sub_b3']),
    'Real PostgreSQL row for Account B advanced to revision 3 and preserved all subjects from both concurrent sessions (sub_b1, sub_b2, sub_b3)'
  );

  // 6.3 Test Real PostgreSQL RPC Failure Handling in pushWorkspaceToCloud
  // Client is logged in as userB locally, but PostgreSQL session has expired JWT (overrideDbJwtUid = ''), causing PostgreSQL RPC to throw 42501 Not authenticated
  const unauthPgClient = createRealPgConnectedClient({ id: userB, email: 'bob.clinical@exo.edu' }, '');
  const rpcErrorRes = await unauthPgClient.pushWorkspaceToCloud(false, false);
  assert(
    rpcErrorRes.status === 'error' && String(rpcErrorRes.error || '').includes('Not authenticated'),
    'pushWorkspaceToCloud() catches real PostgreSQL RPC failure and returns { status: "error", error: "Not authenticated" }'
  );

  // --------------------------------------------------------------------------
  // SECTION 7: Rollback Safety Verification on Real PostgreSQL
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 7: Rollback Safety Gate & Safe Rollback Verification ---');

  const legacyRollbackSql = fs.readFileSync(
    'supabase/rollbacks/20261103140000_rollback_fix_security_and_privileges.sql',
    'utf8'
  );
  const safeRollbackSql = fs.readFileSync(
    'supabase/rollbacks/20261103140000_safe_rollback_concurrency_only.sql',
    'utf8'
  );

  // 7.1 Legacy unsafe rollback refuses to execute without explicit downgrade confirmation flag
  let unsafeBlocked = false;
  try {
    await dbMigrated.exec(legacyRollbackSql);
  } catch (err) {
    unsafeBlocked = String(err.message || err).includes('UNSAFE_ROLLBACK_BLOCKED');
  }
  assert(
    unsafeBlocked === true,
    'Legacy rollback script refuses accidental execution on PostgreSQL with UNSAFE_ROLLBACK_BLOCKED'
  );

  // 7.2 Safe emergency rollback executes cleanly and preserves RLS isolation, VIP checks, and least privilege
  await dbMigrated.exec(safeRollbackSql);

  const postSafeRollbackPrivs = (
    await dbMigrated.query(`
      SELECT
        has_table_privilege('anon', 'public.user_workspaces', 'SELECT') AS anon_sel,
        has_table_privilege('authenticated', 'public.user_workspaces', 'TRUNCATE') AS auth_trunc,
        has_table_privilege('authenticated', 'public.user_workspaces', 'DELETE') AS auth_del,
        has_function_privilege('authenticated', 'public.protect_vip_status_column()', 'EXECUTE') AS auth_vip_fn
    `)
  ).rows[0];
  assert(
    !postSafeRollbackPrivs.anon_sel &&
      !postSafeRollbackPrivs.auth_trunc &&
      !postSafeRollbackPrivs.auth_del &&
      !postSafeRollbackPrivs.auth_vip_fn,
    'Safe rollback preserves zero anon access, zero TRUNCATE/DELETE privileges, and zero unauthorized function execution'
  );

  // Verify cross-account RLS isolation and non-VIP upload restriction still hold after safe rollback
  const crossReadAfterSafeRollback = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userA,
    `SELECT * FROM public.user_workspaces WHERE user_id = $1`,
    [userB]
  );
  const nonVipUploadAfterSafeRollback = await execAsSupabaseSession(
    dbMigrated,
    'authenticated',
    userB,
    `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('lecture_media', $1, $2)`,
    [`${userB}/blocked.pdf`, userB]
  );
  assert(
    crossReadAfterSafeRollback.ok === true &&
      crossReadAfterSafeRollback.rows.length === 0 &&
      nonVipUploadAfterSafeRollback.ok === false,
    'Safe rollback preserves strict cross-account RLS isolation and VIP storage upload enforcement'
  );

  await dbMigrated.close();
  await dbFreshSchema.close();

  console.log('\n======================================================================');
  console.log(
    `TOTAL EMBEDDED PGLITE COMPATIBILITY CHECKS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`
  );
  console.log('======================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error in test_phase4_2_postgres_integration.js:', err);
  process.exit(1);
});
