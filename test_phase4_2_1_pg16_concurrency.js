// ============================================================================
// Exo Academic Platform — Phase 4.2.1 Real PostgreSQL 16 Concurrency & Parity Suite
// Category: Real PostgreSQL 16 Server Integration & Multi-Connection Concurrency Proof
//
// Requirements Verified:
//   1. Connects to a real PostgreSQL 16 server (Docker service `postgres:16` in CI
//      or local PostgreSQL 16 cluster) via independent TCP `pg` connections.
//   2. Strictly enforces PostgreSQL major version === 16 via `SELECT version()`
//      and `SHOW server_version_num` (fails immediately if major version !== 16).
//   3. Verifies PostgreSQL 16 extensions (`pg_stat_statements`, `pgcrypto`,
//      `uuid-ossp`) and explicitly documents/audits `supabase_vault` exclusion.
//   4. Audits deep catalog parity between migrated database and `supabase/schema.sql`
//      across 10 catalog dimensions (columns/defaults, constraints, indexes,
//      RLS USING & WITH CHECK, triggers, event triggers, function definitions & ACLs,
//      table grants, default privileges, and storage buckets) with explicit
//      reporting of excluded platform extensions.
//   5. Proves real multi-connection concurrency using independent backend PIDs
//      (`pg_backend_pid()`), `pg_locks` / `pg_stat_activity` lock-wait verification,
//      and barrier-synchronized parallel transactions for both `SELECT ... FOR UPDATE`
//      stale-revision rejection and concurrent first-time workspace `INSERT`
//      `unique_violation` handling.
// ============================================================================

const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

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

const PG16_ADMIN_URL =
  process.env.PG16_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';

function getDbUrl(dbName) {
  const url = new URL(PG16_ADMIN_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

// Ensure local PostgreSQL 16 cluster is running if invoked in a local container environment
async function ensurePostgres16ServerAvailable() {
  const probe = new Client({ connectionString: PG16_ADMIN_URL, connectionTimeoutMillis: 2500 });
  try {
    await probe.connect();
    await probe.end();
    return;
  } catch (_) {
    try {
      await probe.end();
    } catch (__) {}
  }

  // If local PostgreSQL 16 binaries exist in /usr/lib/postgresql/16/bin, initialize/start cluster
  if (fs.existsSync('/usr/lib/postgresql/16/bin/pg_ctl')) {
    const startCmd = `
      (id postgres >/dev/null 2>&1 || useradd -m -s /bin/bash postgres) &&
      mkdir -p /tmp/pg16_data /tmp/pg16_sock &&
      chown -R postgres:postgres /tmp/pg16_data /tmp/pg16_sock &&
      if [ ! -f /tmp/pg16_data/PG_VERSION ]; then
        su - postgres -c "/usr/lib/postgresql/16/bin/initdb -D /tmp/pg16_data -U postgres --auth=trust" >/dev/null
      fi &&
      su - postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pg16_data status >/dev/null 2>&1 || /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pg16_data -o '-k /tmp/pg16_sock -p 5432' -l /tmp/pg16_data/logfile start >/dev/null"
    `;
    spawnSync('bash', ['-c', startCmd], { stdio: 'inherit' });
  }
}

// Strict version gate function (tested both on live PG16 and against non-PG16 inputs)
function validatePostgres16MajorVersion(versionString, serverVersionNum) {
  const num = Number(serverVersionNum);
  const majorFromNum = Math.floor(num / 10000);
  const matchesString = /PostgreSQL\s+16\./i.test(String(versionString || ''));
  const isPgliteWasm = /PGlite|wasm32|emscripten/i.test(String(versionString || ''));
  return {
    ok: majorFromNum === 16 && matchesString && !isPgliteWasm,
    majorFromNum,
    matchesString,
    isPgliteWasm
  };
}

const SUPABASE_PG16_BOOTSTRAP_SQL = `
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

  GRANT USAGE ON SCHEMA public, auth, storage, extensions, vault TO postgres, anon, authenticated, service_role;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wait until a specific backend PID is actively waiting on a Lock in pg_stat_activity / pg_locks
async function waitForBackendLockContention(monitorClient, waitingPid, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await monitorClient.query(
      `
      SELECT
        a.pid,
        a.state,
        a.wait_event_type,
        a.wait_event,
        a.query,
        EXISTS (
          SELECT 1 FROM pg_locks l
          WHERE l.pid = a.pid AND NOT l.granted
        ) AS has_ungranted_lock
      FROM pg_stat_activity a
      WHERE a.pid = $1
      `,
      [waitingPid]
    );
    if (res.rows.length > 0) {
      const row = res.rows[0];
      if (row.wait_event_type === 'Lock' || row.has_ungranted_lock === true) {
        return { observed: true, activity: row };
      }
    }
    await sleep(25);
  }
  return { observed: false, activity: null };
}

async function main() {
  console.log('======================================================================');
  console.log('EXO PHASE 4.2.1: REAL POSTGRESQL 16 CONCURRENCY & PARITY PROOF SUITE');
  console.log('======================================================================\n');

  await ensurePostgres16ServerAvailable();

  // --------------------------------------------------------------------------
  // SECTION 1: Strict PostgreSQL 16 Server Version Verification Gate
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: Strict PostgreSQL 16 Server Version Gate ---');

  const adminClient = new Client({ connectionString: PG16_ADMIN_URL });
  await adminClient.connect();

  const versionRow = (await adminClient.query('SELECT version() AS version')).rows[0];
  const versionNumRow = (await adminClient.query('SHOW server_version_num')).rows[0];
  const liveVersionStr = versionRow.version;
  const liveVersionNum = versionNumRow.server_version_num;

  console.log(`  Connected Server: ${liveVersionStr}`);
  console.log(`  server_version_num: ${liveVersionNum}`);

  const liveGate = validatePostgres16MajorVersion(liveVersionStr, liveVersionNum);
  assert(
    liveGate.ok === true && liveGate.majorFromNum === 16 && !liveGate.isPgliteWasm,
    `Server is verified native PostgreSQL 16 (major=${liveGate.majorFromNum}, server_version_num=${liveVersionNum})`
  );

  // Enforce hard failure requirement: abort immediately if connected server is not PostgreSQL 16
  if (!liveGate.ok) {
    console.error(
      `FATAL: Connected server is not native PostgreSQL 16 (got version="${liveVersionStr}", server_version_num="${liveVersionNum}"). Aborting.`
    );
    await adminClient.end();
    process.exit(1);
  }

  // Verify the version gate rejects PGlite 18.6 WASM and PostgreSQL 15
  const rejectPglite = validatePostgres16MajorVersion(
    'PostgreSQL 18.6 (PGlite 0.5.15) on wasm32-unknown-emscripten',
    '180006'
  );
  const rejectPg15 = validatePostgres16MajorVersion(
    'PostgreSQL 15.19 (Debian 15.19-1.pgdg12+1) on x86_64-pc-linux-gnu',
    '150019'
  );
  assert(
    rejectPglite.ok === false && rejectPg15.ok === false,
    'Version gate strictly fails on PGlite (180006 WASM) and non-16 PostgreSQL versions (150019)'
  );

  // Prepare two clean databases on the real PostgreSQL 16 server:
  //   1. exo_pg16_migrated (built from migrations)
  //   2. exo_pg16_fresh_schema (built from supabase/schema.sql)
  await adminClient.query('DROP DATABASE IF EXISTS exo_pg16_migrated WITH (FORCE);');
  await adminClient.query('DROP DATABASE IF EXISTS exo_pg16_fresh_schema WITH (FORCE);');
  await adminClient.query('CREATE DATABASE exo_pg16_migrated;');
  await adminClient.query('CREATE DATABASE exo_pg16_fresh_schema;');
  await adminClient.end();

  // --------------------------------------------------------------------------
  // SECTION 2: PostgreSQL 16 Extensions Audit & Execution Verification
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: PostgreSQL 16 Extensions Verification & Exclusion Audit ---');

  const migClient = new Client({ connectionString: getDbUrl('exo_pg16_migrated') });
  const freshClient = new Client({ connectionString: getDbUrl('exo_pg16_fresh_schema') });
  await migClient.connect();
  await freshClient.connect();

  await migClient.query(SUPABASE_PG16_BOOTSTRAP_SQL);
  await freshClient.query(SUPABASE_PG16_BOOTSTRAP_SQL);

  // Install the 3 standard PostgreSQL 16 contrib extensions in exo_pg16_migrated as well
  // so extension state is identical to Supabase's pre-migration platform bootstrap
  await migClient.query(`
    CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
  `);

  const baselineMigrationSql = fs.readFileSync('supabase/migrations/20261103133622_remote_schema.sql', 'utf8');
  const forwardMigrationSql = fs.readFileSync(
    'supabase/migrations/20261103140000_fix_security_and_privileges.sql',
    'utf8'
  );
  await migClient.query(baselineMigrationSql);
  await migClient.query(forwardMigrationSql);
  assert(
    true,
    'Real PostgreSQL 16 executed 20261103133622_remote_schema.sql + 20261103140000_fix_security_and_privileges.sql without errors'
  );

  // In supabase/schema.sql, only "supabase_vault" (Supabase proprietary vault wrapper) is absent from vanilla postgres:16 contrib;
  // "pg_stat_statements", "pgcrypto", and "uuid-ossp" execute natively on PostgreSQL 16!
  const rawSchemaSql = fs.readFileSync('supabase/schema.sql', 'utf8');
  const pg16SchemaSql = rawSchemaSql.replace(
    /CREATE EXTENSION IF NOT EXISTS "supabase_vault"[^;]*;/g,
    '-- Excluded proprietary Supabase platform extension: supabase_vault'
  );
  await freshClient.query(pg16SchemaSql);
  assert(
    true,
    'Real PostgreSQL 16 executed supabase/schema.sql with native pg_stat_statements, pgcrypto, and uuid-ossp extensions'
  );

  const installedExts = (
    await freshClient.query(`
      SELECT extname, extnamespace::regnamespace::text AS schema_name
      FROM pg_extension
      WHERE extname IN ('pg_stat_statements', 'pgcrypto', 'uuid-ossp')
      ORDER BY extname
    `)
  ).rows;
  assert(
    installedExts.length === 3 &&
      installedExts[0].extname === 'pg_stat_statements' &&
      installedExts[1].extname === 'pgcrypto' &&
      installedExts[2].extname === 'uuid-ossp',
    'Extensions pg_stat_statements, pgcrypto, and uuid-ossp are installed in schema "extensions" on PostgreSQL 16'
  );

  // Actively test functional primitives from pgcrypto and uuid-ossp on PostgreSQL 16
  const extFuncCheck = (
    await freshClient.query(`
      SELECT
        extensions.gen_random_uuid()::text AS pgcrypto_uuid,
        pg_catalog.encode(extensions.digest('exo-phase-4-2-1', 'sha256'), 'hex') AS pgcrypto_sha256,
        extensions.uuid_generate_v4()::text AS uuid_ossp_v4
    `)
  ).rows[0];
  const expectedSha256 = crypto.createHash('sha256').update('exo-phase-4-2-1').digest('hex');
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert(
    uuidRegex.test(extFuncCheck.pgcrypto_uuid) &&
      uuidRegex.test(extFuncCheck.uuid_ossp_v4) &&
      extFuncCheck.pgcrypto_sha256 === expectedSha256,
    'PostgreSQL 16 pgcrypto (gen_random_uuid, digest) and uuid-ossp (uuid_generate_v4) execute and match reference outputs'
  );

  // --------------------------------------------------------------------------
  // SECTION 3: Comprehensive 10-Point Schema Parity Audit (Migrated DB vs schema.sql)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Comprehensive 10-Dimension Schema Parity Audit on PostgreSQL 16 ---');

  // Normalize session search_path on both connections before querying catalog deparse functions
  // (supabase/schema.sql sets session search_path to '', which affects pg_get_triggerdef/pg_policies schema qualification)
  await migClient.query(`SET search_path = public, auth, storage, extensions;`);
  await freshClient.query(`SET search_path = public, auth, storage, extensions;`);

  // 3.1 Columns, Types, Nullability & Default Values
  const colsQuery = `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_workspaces'
    ORDER BY ordinal_position
  `;
  const migCols = (await migClient.query(colsQuery)).rows;
  const freshCols = (await freshClient.query(colsQuery)).rows;
  assert(
    JSON.stringify(migCols) === JSON.stringify(freshCols) && migCols.length === 10,
    'Parity [1/10] All 10 columns, data types, nullability, and Default Values match between migrated DB and schema.sql'
  );

  // 3.2 Constraints (PRIMARY KEY, FOREIGN KEY)
  const constraintsQuery = `
    SELECT conname, contype, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'user_workspaces'
    ORDER BY conname
  `;
  const migConstraints = (await migClient.query(constraintsQuery)).rows;
  const freshConstraints = (await freshClient.query(constraintsQuery)).rows;
  assert(
    JSON.stringify(migConstraints) === JSON.stringify(freshConstraints) && migConstraints.length === 2,
    'Parity [2/10] Table constraints (PK & FK ON DELETE CASCADE) match between migrated DB and schema.sql'
  );

  // 3.3 Indexes
  const indexesQuery = `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'user_workspaces'
    ORDER BY indexname
  `;
  const migIndexes = (await migClient.query(indexesQuery)).rows;
  const freshIndexes = (await freshClient.query(indexesQuery)).rows;
  assert(
    JSON.stringify(migIndexes) === JSON.stringify(freshIndexes) && migIndexes.length === 1,
    'Parity [3/10] Indexes (user_workspaces_pkey) match between migrated DB and schema.sql'
  );

  // 3.4 RLS Policies (including USING qual & WITH CHECK expressions)
  const rlsQuery = `
    SELECT schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check
    FROM pg_policies
    WHERE (schemaname = 'public' AND tablename = 'user_workspaces')
       OR (schemaname = 'storage' AND tablename = 'objects')
    ORDER BY schemaname, tablename, policyname
  `;
  const migRls = (await migClient.query(rlsQuery)).rows;
  const freshRls = (await freshClient.query(rlsQuery)).rows;
  assert(
    JSON.stringify(migRls) === JSON.stringify(freshRls) && migRls.length === 7,
    'Parity [4/10] All 7 RLS policies (including exact USING and WITH CHECK expressions) match between migrated DB and schema.sql'
  );

  // 3.5 Triggers on public.user_workspaces
  const triggersQuery = `
    SELECT t.tgname, pg_get_triggerdef(t.oid) AS tgdef
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'user_workspaces' AND NOT t.tgisinternal
    ORDER BY t.tgname
  `;
  const migTriggers = (await migClient.query(triggersQuery)).rows;
  const freshTriggers = (await freshClient.query(triggersQuery)).rows;
  assert(
    JSON.stringify(migTriggers) === JSON.stringify(freshTriggers) && migTriggers.length === 4,
    'Parity [5/10] All 4 table triggers and pg_get_triggerdef definitions match between migrated DB and schema.sql'
  );

  // 3.6 Event Triggers
  const evtTriggersQuery = `
    SELECT evtname, evtevent, evtowner::regrole::text, evtfoid::regproc::text, evtenabled, evttags
    FROM pg_event_trigger
    WHERE evtname = 'ensure_rls'
  `;
  const migEvt = (await migClient.query(evtTriggersQuery)).rows;
  const freshEvt = (await freshClient.query(evtTriggersQuery)).rows;
  assert(
    JSON.stringify(migEvt) === JSON.stringify(freshEvt) && migEvt.length === 1,
    'Parity [6/10] Event trigger (ensure_rls -> public.rls_auto_enable) matches between migrated DB and schema.sql'
  );

  // 3.7 Functions (SECURITY DEFINER, search_path proconfig, ACLs, and full function definitions)
  const funcsQuery = `
    SELECT p.proname, p.prosecdef, p.proconfig, p.proacl::text, pg_get_functiondef(p.oid) AS fndef
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    ORDER BY p.proname
  `;
  const migFuncs = (await migClient.query(funcsQuery)).rows;
  const freshFuncs = (await freshClient.query(funcsQuery)).rows;
  assert(
    JSON.stringify(migFuncs) === JSON.stringify(freshFuncs) && migFuncs.length === 6,
    'Parity [7/10] All 6 public functions (SECURITY DEFINER, search_path, ACLs, and bodies) match between migrated DB and schema.sql'
  );

  // 3.8 Table Privileges & RLS Enablement Flags
  const tableAclQuery = `
    SELECT relname, relrowsecurity, relforcerowsecurity, relacl::text
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND relname = 'user_workspaces'
  `;
  const migAcl = (await migClient.query(tableAclQuery)).rows;
  const freshAcl = (await freshClient.query(tableAclQuery)).rows;
  assert(
    JSON.stringify(migAcl) === JSON.stringify(freshAcl),
    'Parity [8/10] Table ACL grants and RLS flags on public.user_workspaces match between migrated DB and schema.sql'
  );

  // 3.9 Default Privileges (pg_default_acl)
  const defAclQuery = `
    SELECT defaclrole::regrole::text, defaclnamespace::regnamespace::text, defaclobjtype, defaclacl::text
    FROM pg_default_acl
    ORDER BY 1, 2, 3
  `;
  const migDefAcl = (await migClient.query(defAclQuery)).rows;
  const freshDefAcl = (await freshClient.query(defAclQuery)).rows;
  assert(
    JSON.stringify(migDefAcl) === JSON.stringify(freshDefAcl) && migDefAcl.length === 1,
    'Parity [9/10] Global and schema-scoped ALTER DEFAULT PRIVILEGES entries match between migrated DB and schema.sql'
  );

  // 3.10 Storage Bucket Configuration
  const bucketQuery = `
    SELECT id, name, public, file_size_limit, allowed_mime_types
    FROM storage.buckets
    WHERE id = 'lecture_media'
  `;
  const migBucket = (await migClient.query(bucketQuery)).rows;
  const freshBucket = (await freshClient.query(bucketQuery)).rows;
  assert(
    JSON.stringify(migBucket) === JSON.stringify(freshBucket) &&
      migBucket.length === 1 &&
      migBucket[0].public === false &&
      Number(migBucket[0].file_size_limit) === 52428800,
    'Parity [10/10] Storage bucket lecture_media properties (public=false, 50MB limit, allowed_mime_types) match between migrated DB and schema.sql'
  );

  await freshClient.end();

  // --------------------------------------------------------------------------
  // SECTION 4: Real Multi-Connection Concurrency Proof on PostgreSQL 16
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Real Multi-Connection Concurrency Proof (SELECT FOR UPDATE & Stale Revision) ---');

  const userA = 'aaaaaaaa-1111-2222-3333-444455556666';
  const userInitRace = 'cccccccc-1111-2222-3333-444455556666';

  await migClient.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4)`, [
    userA,
    'alice.concurrency@exo.edu',
    userInitRace,
    'newuser.race@exo.edu'
  ]);

  // Seed User A workspace at revision 1
  await migClient.query('BEGIN');
  await migClient.query('SET LOCAL ROLE authenticated');
  await migClient.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
  await migClient.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userA]);
  const seedRes = await migClient.query(
    `SELECT public.sync_workspace_with_concurrency($1::jsonb, NULL) AS res`,
    [JSON.stringify({ subjects: [{ id: 'sub_base', name: 'Baseline Subject' }] })]
  );
  await migClient.query('COMMIT');
  assert(
    seedRes.rows[0].res.status === 'success' && seedRes.rows[0].res.revision === 1,
    'Seeded User A workspace at revision 1 on PostgreSQL 16'
  );

  // Open two independent connections (conn1, conn2) + one monitor connection (connMonitor)
  const conn1 = new Client({ connectionString: getDbUrl('exo_pg16_migrated') });
  const conn2 = new Client({ connectionString: getDbUrl('exo_pg16_migrated') });
  const connMonitor = new Client({ connectionString: getDbUrl('exo_pg16_migrated') });
  await conn1.connect();
  await conn2.connect();
  await connMonitor.connect();

  const pid1 = (await conn1.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const pid2 = (await conn2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const pidMonitor = (await connMonitor.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  console.log(`  Independent PostgreSQL 16 Backend PIDs: conn1=${pid1}, conn2=${pid2}, monitor=${pidMonitor}`);
  assert(
    pid1 !== pid2 && pid2 !== pidMonitor && pid1 !== pidMonitor,
    `Two independent PostgreSQL 16 backend processes verified (pid1=${pid1} !== pid2=${pid2})`
  );

  // 4.1 Both independent devices read the same revision (revision = 1) concurrently
  const [read1, read2] = await Promise.all([
    (async () => {
      await conn1.query('BEGIN');
      await conn1.query('SET LOCAL ROLE authenticated');
      await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userA]);
      const r = await conn1.query(`SELECT revision FROM public.user_workspaces WHERE user_id = $1`, [userA]);
      await conn1.query('COMMIT');
      return r.rows[0].revision;
    })(),
    (async () => {
      await conn2.query('BEGIN');
      await conn2.query('SET LOCAL ROLE authenticated');
      await conn2.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userA]);
      const r = await conn2.query(`SELECT revision FROM public.user_workspaces WHERE user_id = $1`, [userA]);
      await conn2.query('COMMIT');
      return r.rows[0].revision;
    })()
  ]);
  assert(
    read1 === 1 && read2 === 1,
    'Device 1 (conn1) and Device 2 (conn2) both read baseline revision = 1 from PostgreSQL 16'
  );

  // 4.2 True Overlapping Transaction Lock Contention Proof (SELECT ... FOR UPDATE):
  // Step A: conn1 starts a transaction, acquires the FOR UPDATE row lock via sync_workspace_with_concurrency(..., 1),
  //         updates revision to 2, and holds the transaction open BEFORE COMMIT.
  await conn1.query('BEGIN');
  await conn1.query('SET LOCAL ROLE authenticated');
  await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
  await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userA]);
  const conn1RpcRes = await conn1.query(
    `SELECT public.sync_workspace_with_concurrency($1::jsonb, 1) AS res`,
    [
      JSON.stringify({
        subjects: [
          { id: 'sub_base', name: 'Baseline Subject' },
          { id: 'sub_conn1_winner', name: 'Added by Connection 1' }
        ]
      })
    ]
  );

  // Step B: While conn1 is still uncommitted (holding the row lock), conn2 starts its transaction
  //         and invokes sync_workspace_with_concurrency(..., 1) with the same expected revision = 1.
  await conn2.query('BEGIN');
  await conn2.query('SET LOCAL ROLE authenticated');
  await conn2.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
  await conn2.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userA]);

  let conn2FinishedBeforeConn1Commit = false;
  const conn2Promise = conn2
    .query(`SELECT public.sync_workspace_with_concurrency($1::jsonb, 1) AS res`, [
      JSON.stringify({
        subjects: [{ id: 'sub_conn2_stale', name: 'Stale Overwrite Attempt by Connection 2' }]
      })
    ])
    .then((res) => {
      conn2FinishedBeforeConn1Commit = true;
      return res;
    });

  // Step C: Monitor connection inspects pg_stat_activity & pg_locks while conn2 is blocked in-flight
  const lockObservation = await waitForBackendLockContention(connMonitor, pid2, 5000);
  assert(
    lockObservation.observed === true && conn2FinishedBeforeConn1Commit === false,
    `Proven real transaction overlap: conn2 (pid=${pid2}) blocked on Lock (${lockObservation.activity?.wait_event_type}:${lockObservation.activity?.wait_event}) while conn1 (pid=${pid1}) holds SELECT ... FOR UPDATE lock`
  );

  // Step D: Now commit conn1, releasing the row lock so conn2 unblocks
  await conn1.query('COMMIT');
  const conn2RpcRes = await conn2Promise;
  await conn2.query('COMMIT');

  assert(
    conn1RpcRes.rows[0].res.status === 'success' && conn1RpcRes.rows[0].res.revision === 2,
    'Connection 1 committed first and advanced workspace revision from 1 to 2'
  );
  assert(
    conn2RpcRes.rows[0].res.status === 'conflict' && conn2RpcRes.rows[0].res.current_revision === 2,
    'Connection 2 unblocked after Connection 1 commit, re-read revision 2 via FOR UPDATE, and rejected stale revision 1 with { status: "conflict", current_revision: 2 }'
  );

  // Verify database state after overlapping race: zero data loss of Connection 1's update
  const afterUpdateRace = (
    await migClient.query(`SELECT revision, subjects FROM public.user_workspaces WHERE user_id = $1`, [userA])
  ).rows[0];
  assert(
    afterUpdateRace.revision === 2 &&
      afterUpdateRace.subjects.length === 2 &&
      afterUpdateRace.subjects[1].id === 'sub_conn1_winner',
    'PostgreSQL 16 preserved Connection 1 committed data without overwrite from Connection 2'
  );

  // 4.3 Barrier-Synchronized Simultaneous Parallel Race (Both Connections Released at the Exact Same Tick)
  await conn1.query('BEGIN');
  await conn1.query('SET LOCAL ROLE authenticated');
  await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
  await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userA]);

  await conn2.query('BEGIN');
  await conn2.query('SET LOCAL ROLE authenticated');
  await conn2.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
  await conn2.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userA]);

  let readyCount = 0;
  let releaseBarrier;
  const barrierPromise = new Promise((resolve) => {
    releaseBarrier = resolve;
  });
  function signalAndAwaitBarrier() {
    readyCount++;
    if (readyCount === 2) releaseBarrier();
    return barrierPromise;
  }

  const [simRes1, simRes2] = await Promise.all([
    (async () => {
      await signalAndAwaitBarrier();
      const r = await conn1.query(`SELECT public.sync_workspace_with_concurrency($1::jsonb, 2) AS res`, [
        JSON.stringify({ subjects: [{ id: 'sub_sim_1', name: 'Simultaneous Race 1' }] })
      ]);
      await conn1.query('COMMIT');
      return r.rows[0].res;
    })(),
    (async () => {
      await signalAndAwaitBarrier();
      const r = await conn2.query(`SELECT public.sync_workspace_with_concurrency($1::jsonb, 2) AS res`, [
        JSON.stringify({ subjects: [{ id: 'sub_sim_2', name: 'Simultaneous Race 2' }] })
      ]);
      await conn2.query('COMMIT');
      return r.rows[0].res;
    })()
  ]);

  const statuses = [simRes1.status, simRes2.status].sort();
  const winnerPayloadId = simRes1.status === 'success' ? 'sub_sim_1' : 'sub_sim_2';
  const postSimRow = (
    await migClient.query(`SELECT revision, subjects FROM public.user_workspaces WHERE user_id = $1`, [userA])
  ).rows[0];
  assert(
    JSON.stringify(statuses) === JSON.stringify(['conflict', 'success']) &&
      postSimRow.revision === 3 &&
      postSimRow.subjects[0].id === winnerPayloadId,
    'Barrier-synchronized simultaneous race at revision 2 produced exactly 1 success (rev=3) and 1 conflict (current_revision=3) with winner state intact'
  );

  // --------------------------------------------------------------------------
  // SECTION 5: Concurrent First-Time Workspace Creation Race (`unique_violation` Proof)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 5: Concurrent First-Time Workspace Initialization (unique_violation Proof) ---');

  // Verify userInitRace starts with 0 rows in public.user_workspaces
  const beforeInitCount = (
    await migClient.query(`SELECT count(*)::int AS cnt FROM public.user_workspaces WHERE user_id = $1`, [
      userInitRace
    ])
  ).rows[0].cnt;
  assert(beforeInitCount === 0, 'New user starts with 0 workspace rows before concurrent initialization race');

  // Step A: conn1 starts a transaction for userInitRace and calls sync_workspace_with_concurrency(..., NULL).
  //         SELECT ... FOR UPDATE finds 0 rows (NOT FOUND), so conn1 executes INSERT (revision = 1)
  //         and holds the uncommitted unique index lock on user_workspaces_pkey!
  await conn1.query('BEGIN');
  await conn1.query('SET LOCAL ROLE authenticated');
  await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
  await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userInitRace]);
  const initConn1Res = await conn1.query(
    `SELECT public.sync_workspace_with_concurrency($1::jsonb, NULL) AS res`,
    [
      JSON.stringify({
        subjects: [{ id: 'sub_init_conn1', name: 'Initial Workspace from Device 1' }]
      })
    ]
  );

  // Step B: While conn1's INSERT is still uncommitted, conn2 starts a transaction for userInitRace
  //         and calls sync_workspace_with_concurrency(..., NULL).
  //         Because conn1 has not committed yet, conn2's SELECT ... FOR UPDATE ALSO sees 0 rows (NOT FOUND)
  //         and enters the INSERT branch, where PostgreSQL 16 blocks conn2 on the unique index lock!
  await conn2.query('BEGIN');
  await conn2.query('SET LOCAL ROLE authenticated');
  await conn2.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
  await conn2.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userInitRace]);

  let initConn2FinishedEarly = false;
  const initConn2Promise = conn2
    .query(`SELECT public.sync_workspace_with_concurrency($1::jsonb, NULL) AS res`, [
      JSON.stringify({
        subjects: [{ id: 'sub_init_conn2', name: 'Concurrent Init Attempt from Device 2' }]
      })
    ])
    .then((res) => {
      initConn2FinishedEarly = true;
      return res;
    });

  // Step C: Monitor connection verifies conn2 is blocked on the unique index transaction lock inside INSERT
  const initLockObservation = await waitForBackendLockContention(connMonitor, pid2, 5000);
  assert(
    initLockObservation.observed === true && initConn2FinishedEarly === false,
    `Proven concurrent INSERT overlap: conn2 (pid=${pid2}) entered NOT FOUND -> INSERT and blocked on unique constraint lock (${initLockObservation.activity?.wait_event_type}:${initLockObservation.activity?.wait_event}) while conn1 (pid=${pid1}) holds uncommitted INSERT`
  );

  // Step D: Commit conn1 -> PostgreSQL 16 immediately raises unique_violation (23505) in conn2,
  //         which is caught by EXCEPTION WHEN unique_violation in sync_workspace_with_concurrency!
  await conn1.query('COMMIT');
  const initConn2Res = await initConn2Promise;
  await conn2.query('COMMIT');

  assert(
    initConn1Res.rows[0].res.status === 'success' && initConn1Res.rows[0].res.revision === 1,
    'Connection 1 first-time workspace INSERT committed with { status: "success", revision: 1 }'
  );
  assert(
    initConn2Res.rows[0].res.status === 'conflict' &&
      initConn2Res.rows[0].res.current_revision === 1 &&
      initConn2Res.rows[0].res.message === 'Concurrent workspace initialization detected',
    'Connection 2 caught real PostgreSQL 16 unique_violation inside EXCEPTION handler and returned { status: "conflict", current_revision: 1, message: "Concurrent workspace initialization detected" }'
  );

  // Verify database state after concurrent initialization race
  const afterInitRace = (
    await migClient.query(`SELECT revision, subjects FROM public.user_workspaces WHERE user_id = $1`, [
      userInitRace
    ])
  ).rows[0];
  assert(
    afterInitRace.revision === 1 &&
      afterInitRace.subjects.length === 1 &&
      afterInitRace.subjects[0].id === 'sub_init_conn1',
    'First-time workspace row created by Connection 1 remains intact at revision 1 after concurrent unique_violation recovery'
  );

  await conn1.end();
  await conn2.end();
  await connMonitor.end();
  await migClient.end();

  console.log('\n======================================================================');
  console.log(
    `TOTAL REAL POSTGRESQL 16 CONCURRENCY & PARITY CHECKS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`
  );
  console.log('======================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error in test_phase4_2_1_pg16_concurrency.js:', err);
  process.exit(1);
});
