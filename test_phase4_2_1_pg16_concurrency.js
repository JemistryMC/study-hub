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
const os = require('os');
const net = require('net');
const path = require('path');
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

const DEFAULT_PG16_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
let activePg16AdminUrl = process.env.PG16_DATABASE_URL || DEFAULT_PG16_URL;
let ephemeralClusterState = null;

// B1 Fix: Explicitly set pathname (database), username, and password on the target URL
function getDbUrl(dbName, user, password, baseUrlOverride) {
  const url = new URL(baseUrlOverride || activePg16AdminUrl);
  url.pathname = `/${dbName}`;
  if (user !== undefined) {
    url.username = encodeURIComponent(user);
  }
  if (password !== undefined) {
    url.password = encodeURIComponent(password);
  }
  return url.toString();
}

function isLoopbackHost(hostname) {
  const h = String(hostname || '')
    .toLowerCase()
    .split('/')[0];
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
}

function isForbiddenRemoteHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return (
    h.includes('supabase.co') ||
    h.includes('supabase.com') ||
    h.includes('pooler.supabase') ||
    h.includes('amazonaws.com') ||
    h.includes('neon.tech')
  );
}

function canonicalizeExistingPath(targetPath) {
  if (!targetPath) return null;
  try {
    return fs.realpathSync(String(targetPath));
  } catch (_) {
    return null;
  }
}

function findAvailableLocalPort(preferredPort = 55432) {
  return new Promise((resolve, reject) => {
    const tryPort = (portToTry) => {
      const srv = net.createServer();
      srv.unref();
      srv.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && portToTry !== 0) {
          tryPort(0);
        } else {
          reject(err);
        }
      });
      srv.listen(portToTry, '127.0.0.1', () => {
        const addr = srv.address();
        const chosenPort = addr && typeof addr === 'object' ? addr.port : preferredPort;
        srv.close(() => resolve(chosenPort));
      });
    };
    tryPort(preferredPort);
  });
}

// Inspect live PostgreSQL server metadata to verify whether a candidate URL is a dedicated disposable cluster
// where supabase_admin is the bootstrap superuser (OID 10) and postgres (OID > 10) can be altered to NOSUPERUSER.
// Never relies on environment flags (such as PG16_DISPOSABLE_CLUSTER) as a substitute for server-observed evidence.
async function inspectCandidateCluster(connectionString) {
  const parsed = new URL(connectionString);
  if (!isLoopbackHost(parsed.hostname) || isForbiddenRemoteHost(parsed.hostname)) {
    return {
      reachable: false,
      disposable: false,
      reason: `Host "${parsed.hostname}" is not a local loopback address or matches a forbidden remote host`
    };
  }

  const probe = new Client({ connectionString, connectionTimeoutMillis: 2500 });
  try {
    await probe.connect();
    const meta = (
      await probe.query(`
        SELECT
          inet_server_addr()::text AS server_addr,
          inet_server_port() AS server_port,
          current_setting('cluster_name', true) AS cluster_name,
          current_setting('data_directory') AS data_dir,
          current_user,
          session_user,
          (SELECT rolname FROM pg_roles WHERE oid = 10) AS bootstrap_superuser,
          (SELECT oid::int FROM pg_roles WHERE rolname = 'postgres') AS postgres_role_oid
      `)
    ).rows[0];

    const nonTestDbs = (
      await probe.query(`
        SELECT datname
        FROM pg_database
        WHERE datistemplate = false
          AND datname NOT IN ('postgres', 'supabase_admin')
          AND datname NOT LIKE 'exo_pg16_%'
      `)
    ).rows.map((r) => r.datname);

    const hasDisposableClusterName = meta.cluster_name === 'exo_disposable_pg16';
    const serverDataDirReal = canonicalizeExistingPath(meta.data_dir);
    const expectedEphemeralDataDirReal =
      ephemeralClusterState !== null ? canonicalizeExistingPath(ephemeralClusterState.dataDir) : null;
    const hasVerifiedEphemeralDataDir =
      serverDataDirReal !== null &&
      expectedEphemeralDataDirReal !== null &&
      serverDataDirReal === expectedEphemeralDataDirReal;
    const hasServerObservedDisposableIdentity =
      isLoopbackHost(meta.server_addr || '127.0.0.1') &&
      !isForbiddenRemoteHost(meta.server_addr || '') &&
      (hasDisposableClusterName || hasVerifiedEphemeralDataDir) &&
      meta.bootstrap_superuser === 'supabase_admin' &&
      nonTestDbs.length === 0;

    if (
      hasServerObservedDisposableIdentity &&
      meta.postgres_role_oid === null &&
      meta.session_user === 'supabase_admin'
    ) {
      await probe.query(
        `CREATE ROLE postgres WITH SUPERUSER INHERIT CREATEDB CREATEROLE LOGIN NOREPLICATION NOBYPASSRLS PASSWORD 'postgres';`
      );
      meta.postgres_role_oid = (
        await probe.query(`SELECT oid::int AS oid FROM pg_roles WHERE rolname = 'postgres'`)
      ).rows[0].oid;
    }

    await probe.end();

    // PostgreSQL (src/backend/commands/user.c:868) forbids ALTER ROLE ... NOSUPERUSER on BOOTSTRAP_SUPERUSERID (OID 10).
    // Therefore, a cluster can only run Hosted Supabase non-superuser postgres tests if postgres is NOT OID 10.
    const postgresCanBeDemoted =
      meta.postgres_role_oid !== null && Number(meta.postgres_role_oid) > 10;

    const disposable = hasServerObservedDisposableIdentity && postgresCanBeDemoted;

    return {
      reachable: true,
      disposable,
      meta,
      nonTestDbs,
      reason: disposable
        ? `Verified disposable cluster (cluster_name="${meta.cluster_name}", data_dir="${meta.data_dir}", bootstrap_superuser="${meta.bootstrap_superuser}", postgres_oid=${meta.postgres_role_oid}, nonTestDbs=0)`
        : `Server at ${parsed.hostname}:${parsed.port || 5432} failed server-side disposable verification (cluster_name="${meta.cluster_name}", bootstrap_superuser="${meta.bootstrap_superuser}", postgres_oid=${meta.postgres_role_oid}, nonTestDbs=${JSON.stringify(nonTestDbs)})`
    };
  } catch (err) {
    try {
      await probe.end();
    } catch (_) {}
    return {
      reachable: false,
      disposable: false,
      reason: err.message
    };
  }
}

// B3 Fix: Provision a genuinely isolated ephemeral PostgreSQL 16 cluster via initdb -U supabase_admin + pg_ctl
// inside a unique, securely created temporary directory owned exclusively by the current test run.
// Never stops or deletes any other process's directory and never uses wildcard cleanup.
async function ensurePostgres16ServerAvailable() {
  const initialCheck = await inspectCandidateCluster(activePg16AdminUrl);
  if (initialCheck.reachable && initialCheck.disposable) {
    activePg16AdminUrl = getDbUrl('postgres', 'postgres', 'postgres', activePg16AdminUrl);
    return initialCheck;
  }

  // If local PostgreSQL 16 binaries exist, spin up an isolated ephemeral cluster on an available loopback port
  // and a unique mkdtempSync directory owned solely by this run.
  if (fs.existsSync('/usr/lib/postgresql/16/bin/pg_ctl') && fs.existsSync('/usr/lib/postgresql/16/bin/initdb')) {
    const preferredPort = Number(process.env.EXO_EPHEMERAL_PG16_PORT || 55432);
    const ephemeralPort = await findAvailableLocalPort(preferredPort);
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), `exo_pg16_disposable_${process.pid}_`));
    const dataDir = path.join(baseDir, 'data');
    const sockDir = path.join(baseDir, 'sock');
    const logFile = path.join(baseDir, 'postgres.log');

    ephemeralClusterState = {
      baseDir,
      dataDir,
      sockDir,
      ephemeralPort,
      clusterStarted: false
    };

    const startCmd = `
      (id postgres >/dev/null 2>&1 || useradd -m -s /bin/bash postgres) &&
      mkdir -p "${dataDir}" "${sockDir}" &&
      chown -R postgres:postgres "${baseDir}" &&
      chmod 700 "${dataDir}" "${sockDir}" &&
      su - postgres -c "/usr/lib/postgresql/16/bin/initdb -D '${dataDir}' -U supabase_admin -c cluster_name=exo_disposable_pg16 --auth-local=trust --auth-host=scram-sha-256" >/dev/null &&
      su - postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -w -D '${dataDir}' -o '-h 127.0.0.1 -p ${ephemeralPort} -k ${sockDir} -c cluster_name=exo_disposable_pg16' -l '${logFile}' start" >/dev/null &&
      su - postgres -c "/usr/lib/postgresql/16/bin/psql -h '${sockDir}' -p ${ephemeralPort} -U supabase_admin -d postgres -c \\"ALTER ROLE supabase_admin WITH PASSWORD 'supabase_admin_disposable_pass'; CREATE ROLE postgres WITH SUPERUSER INHERIT CREATEDB CREATEROLE LOGIN NOREPLICATION NOBYPASSRLS PASSWORD 'postgres';\\"" >/dev/null
    `;
    const res = spawnSync('bash', ['-c', startCmd], { stdio: 'inherit' });
    if (res.status !== 0) {
      throw new Error(`Failed to initialize ephemeral PostgreSQL 16 cluster in ${baseDir}`);
    }

    ephemeralClusterState.clusterStarted = true;
    activePg16AdminUrl = `postgresql://postgres:postgres@127.0.0.1:${ephemeralPort}/postgres`;

    const verifyEphemeral = await inspectCandidateCluster(activePg16AdminUrl);
    if (!verifyEphemeral.reachable || !verifyEphemeral.disposable) {
      throw new Error(`Ephemeral PostgreSQL 16 cluster failed isolation check: ${verifyEphemeral.reason}`);
    }
    return verifyEphemeral;
  }

  throw new Error(
    `Refusing to run destructive PostgreSQL 16 role/database tests: ${initialCheck.reason}. ` +
      `Provide a dedicated disposable PostgreSQL 16 instance (initialized with -U supabase_admin and cluster_name=exo_disposable_pg16) or install postgresql-16 locally so an ephemeral cluster can be created.`
  );
}

// Independently inspect pg_ctl status and postmaster.pid to determine whether PostgreSQL is still running in dataDir.
// pg_ctl status exit code 3 = "pg_ctl: no server running"; exit code 0 = server is running.
function inspectEphemeralClusterRunningStatus(dataDir) {
  if (!dataDir || !fs.existsSync(dataDir)) {
    return {
      running: false,
      confirmedStopped: true,
      exitCode: 4,
      detail: 'data_directory does not exist'
    };
  }
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    return {
      running: false,
      confirmedStopped: true,
      exitCode: 4,
      detail: 'PG_VERSION absent (cluster was never initialized in data_directory)'
    };
  }

  const statusRes = spawnSync(
    'bash',
    ['-c', `su - postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D '${dataDir}' status"`],
    { encoding: 'utf8' }
  );
  const statusOutput = String(statusRes.stdout || statusRes.stderr || '').trim();
  const pidFileExists = fs.existsSync(path.join(dataDir, 'postmaster.pid'));
  const confirmedStopped = statusRes.status === 3 && !pidFileExists;

  return {
    running: statusRes.status === 0 || pidFileExists,
    confirmedStopped,
    exitCode: statusRes.status,
    detail: statusOutput || `pg_ctl status exit=${statusRes.status}, postmaster.pid=${pidFileExists}`
  };
}

function teardownEphemeralPostgres16Cluster() {
  if (!ephemeralClusterState) {
    return {
      ephemeralUsed: false,
      baseDir: null,
      dataDir: null,
      stopped: true,
      dirRemoved: true,
      directoryPreserved: false,
      errors: []
    };
  }

  const { baseDir, dataDir, clusterStarted } = ephemeralClusterState;
  ephemeralClusterState = null;
  const errors = [];
  let stopped = false;
  let dirRemoved = false;
  let directoryPreserved = false;

  const hasInitializedCluster = Boolean(dataDir && fs.existsSync(path.join(dataDir, 'PG_VERSION')));
  if (hasInitializedCluster) {
    // 1. Attempt controlled pg_ctl stop on this run's exact dataDir
    const stopRes = spawnSync(
      'bash',
      ['-c', `su - postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -w -D '${dataDir}' -m fast stop"`],
      { encoding: 'utf8' }
    );
    if (stopRes.status !== 0 && clusterStarted) {
      errors.push(
        `pg_ctl stop failed (status=${stopRes.status}): ${String(stopRes.stderr || stopRes.stdout || '').trim()}`
      );
    }

    // 2. Independently inspect cluster status (whether pg_ctl stop succeeded or failed) before any directory deletion
    const statusCheck = inspectEphemeralClusterRunningStatus(dataDir);
    if (!statusCheck.confirmedStopped) {
      stopped = false;
      directoryPreserved = true;
      errors.push(
        `Refusing to delete ephemeral cluster directory ${baseDir} because PostgreSQL shutdown could not be confirmed (${statusCheck.detail})`
      );
      return {
        ephemeralUsed: true,
        baseDir,
        dataDir,
        stopped,
        dirRemoved,
        directoryPreserved,
        errors
      };
    }
    stopped = true;
  } else {
    const statusCheck = inspectEphemeralClusterRunningStatus(dataDir);
    if (!statusCheck.confirmedStopped) {
      stopped = false;
      directoryPreserved = true;
      errors.push(
        `Refusing to delete ephemeral cluster directory ${baseDir} because cluster status could not be confirmed stopped (${statusCheck.detail})`
      );
      return {
        ephemeralUsed: true,
        baseDir,
        dataDir,
        stopped,
        dirRemoved,
        directoryPreserved,
        errors
      };
    }
    stopped = true;
  }

  // 3. Delete ONLY the exact owned baseDir after confirming the server is conclusively stopped
  const tmpRootReal = canonicalizeExistingPath(os.tmpdir());
  const baseDirReal = canonicalizeExistingPath(baseDir);
  const isOwnedTmpChild =
    tmpRootReal !== null &&
    baseDirReal !== null &&
    path.dirname(baseDirReal) === tmpRootReal &&
    path.basename(baseDirReal).startsWith(`exo_pg16_disposable_${process.pid}_`);

  if (!isOwnedTmpChild) {
    directoryPreserved = true;
    errors.push(`Refusing to delete directory outside owned temporary prefix: ${baseDir}`);
    return {
      ephemeralUsed: true,
      baseDir,
      dataDir,
      stopped,
      dirRemoved,
      directoryPreserved,
      errors
    };
  }

  try {
    fs.rmSync(baseDirReal, { recursive: true, force: false });
  } catch (rmErr) {
    errors.push(`Failed removing stopped ephemeral cluster directory ${baseDirReal}: ${rmErr.message}`);
  }

  dirRemoved = !fs.existsSync(baseDir) && !fs.existsSync(dataDir);
  if (!dirRemoved) {
    errors.push(`Ephemeral cluster directory still exists after removal: ${baseDir}`);
  }

  return {
    ephemeralUsed: true,
    baseDir,
    dataDir,
    stopped,
    dirRemoved,
    directoryPreserved,
    errors
  };
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

  const clusterInfo = await ensurePostgres16ServerAvailable();

  // --------------------------------------------------------------------------
  // SECTION 1: Strict PostgreSQL 16 Server Version Verification Gate
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: Strict PostgreSQL 16 Server Version Gate ---');

  const adminClient = new Client({ connectionString: activePg16AdminUrl });
  await adminClient.connect();

  const versionRow = (await adminClient.query('SELECT version() AS version')).rows[0];
  const versionNumRow = (await adminClient.query('SHOW server_version_num')).rows[0];
  const liveVersionStr = versionRow.version;
  const liveVersionNum = versionNumRow.server_version_num;

  console.log(`  Connected Server: ${liveVersionStr}`);
  console.log(`  server_version_num: ${liveVersionNum}`);
  console.log(`  Disposable Cluster Verification: ${clusterInfo.reason}`);

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
    teardownEphemeralPostgres16Cluster();
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

  // Prepare clean databases on the real PostgreSQL 16 server:
  //   1. exo_pg16_fresh_install (Path A: 133622 + 140000 + 150000 + 160000 in timestamp order)
  //   2. exo_pg16_existing_upgrade (Path B: starts at historical Phase 4.2.3 state, then applies only 160000)
  //   3. exo_pg16_fresh_schema (Canonical baseline from supabase/schema.sql)
  await adminClient.query('DROP DATABASE IF EXISTS exo_pg16_fresh_install WITH (FORCE);');
  await adminClient.query('DROP DATABASE IF EXISTS exo_pg16_existing_upgrade WITH (FORCE);');
  await adminClient.query('DROP DATABASE IF EXISTS exo_pg16_fresh_schema WITH (FORCE);');
  await adminClient.query('DROP DATABASE IF EXISTS exo_pg16_hosted_supabase_fixture WITH (FORCE);');
  await adminClient.query('CREATE DATABASE exo_pg16_fresh_install;');
  await adminClient.query('CREATE DATABASE exo_pg16_existing_upgrade;');
  await adminClient.query('CREATE DATABASE exo_pg16_fresh_schema;');
  await adminClient.end();

  // --------------------------------------------------------------------------
  // SECTION 2: PostgreSQL 16 Deployment Paths & Extensions Audit
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: PostgreSQL 16 Deployment Paths (Path A: Fresh Install, Path B: Existing Upgrade) ---');

  const pathAClient = new Client({ connectionString: getDbUrl('exo_pg16_fresh_install') });
  const pathBClient = new Client({ connectionString: getDbUrl('exo_pg16_existing_upgrade') });
  const freshClient = new Client({ connectionString: getDbUrl('exo_pg16_fresh_schema') });
  await pathAClient.connect();
  await pathBClient.connect();
  await freshClient.connect();

  await pathAClient.query(SUPABASE_PG16_BOOTSTRAP_SQL);
  await pathBClient.query(SUPABASE_PG16_BOOTSTRAP_SQL);
  await freshClient.query(SUPABASE_PG16_BOOTSTRAP_SQL);

  // Install the 3 standard PostgreSQL 16 contrib extensions in both migrated databases
  const contribExtsSql = `
    CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
  `;
  await pathAClient.query(contribExtsSql);
  await pathBClient.query(contribExtsSql);

  const baselineMigrationSql = fs.readFileSync('supabase/migrations/20261103133622_remote_schema.sql', 'utf8');
  const phase421HistoricalMigrationSql = fs.readFileSync(
    'supabase/migrations/20261103140000_fix_security_and_privileges.sql',
    'utf8'
  );
  const phase422ForwardMigrationSql = fs.readFileSync(
    'supabase/migrations/20261103150000_unforgeable_occ_and_role_hardening.sql',
    'utf8'
  );
  const phase424ForwardMigrationSql = fs.readFileSync(
    'supabase/migrations/20261103160000_hosted_supabase_auth_compat.sql',
    'utf8'
  );

  // Path A — Fresh installation:
  // Apply all migrations in timestamp order: 133622 -> 140000 -> 150000 -> 160000
  await pathAClient.query(baselineMigrationSql);
  await pathAClient.query(phase421HistoricalMigrationSql);
  await pathAClient.query(phase422ForwardMigrationSql);
  await pathAClient.query(phase424ForwardMigrationSql);
  assert(
    true,
    'Path A (Fresh Install): Cleanly executed migrations in timestamp order (133622 + 140000 + 150000 + 160000)'
  );

  // Path B — Existing database upgrade:
  // First, construct the EXACT historical Phase 4.2.3 database state (133622 + 140000 + 150000):
  await pathBClient.query(baselineMigrationSql);
  await pathBClient.query(phase421HistoricalMigrationSql);
  await pathBClient.query(phase422ForwardMigrationSql);
  // Verify database is at historical Phase 4.2.3 state (owns sync_workspace, has auth in search_path)
  const preUpgradeCheck = (
    await pathBClient.query(`
      SELECT
        p.proowner::regrole::text AS owner,
        p.proconfig::text AS proconfig,
        pg_get_functiondef(p.oid) AS fndef
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'sync_workspace_with_concurrency'
    `)
  ).rows[0];
  assert(
    preUpgradeCheck.owner === 'exo_occ_rpc_definer' && preUpgradeCheck.proconfig.includes('auth'),
    'Path B (Pre-Upgrade): Successfully verified existing database state at Phase 4.2.3 (owned by exo_occ_rpc_definer with auth in search_path)'
  );

  // Now apply ONLY the new forward migration (20261103160000) to upgrade the live database:
  await pathBClient.query(phase424ForwardMigrationSql);
  assert(
    true,
    'Path B (Existing Upgrade): Cleanly applied 20261103160000 forward migration on top of historical Phase 4.2.3 database'
  );

  // Reference Database — Fresh schema bootstrap from supabase/schema.sql
  const rawSchemaSql = fs.readFileSync('supabase/schema.sql', 'utf8');
  const pg16SchemaSql = rawSchemaSql.replace(
    /CREATE EXTENSION IF NOT EXISTS "supabase_vault"[^;]*;/g,
    '-- Excluded proprietary Supabase platform extension: supabase_vault'
  );
  await freshClient.query(pg16SchemaSql);
  assert(
    true,
    'Reference Database: Cleanly executed supabase/schema.sql on native PostgreSQL 16'
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
  // SECTION 3: Comprehensive 10-Point Schema Parity Audit (Path A vs Path B vs schema.sql)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Comprehensive 10-Dimension Schema Parity Audit on PostgreSQL 16 ---');

  // Normalize session search_path on all connections before querying catalog deparse functions
  // (supabase/schema.sql sets session search_path to '', which affects pg_get_triggerdef/pg_policies schema qualification)
  await pathAClient.query(`SET search_path = public, auth, storage, extensions;`);
  await pathBClient.query(`SET search_path = public, auth, storage, extensions;`);
  await freshClient.query(`SET search_path = public, auth, storage, extensions;`);

  // 3.1 Columns, Types, Nullability & Default Values
  const colsQuery = `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_workspaces'
    ORDER BY ordinal_position
  `;
  const pathACols = (await pathAClient.query(colsQuery)).rows;
  const pathBCols = (await pathBClient.query(colsQuery)).rows;
  const freshCols = (await freshClient.query(colsQuery)).rows;
  assert(
    JSON.stringify(pathACols) === JSON.stringify(freshCols) &&
      JSON.stringify(pathBCols) === JSON.stringify(freshCols) &&
      pathACols.length === 10,
    'Parity [1/10] All 10 columns, data types, nullability, and Default Values match across Path A, Path B, and schema.sql'
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
  const pathAConstraints = (await pathAClient.query(constraintsQuery)).rows;
  const pathBConstraints = (await pathBClient.query(constraintsQuery)).rows;
  const freshConstraints = (await freshClient.query(constraintsQuery)).rows;
  assert(
    JSON.stringify(pathAConstraints) === JSON.stringify(freshConstraints) &&
      JSON.stringify(pathBConstraints) === JSON.stringify(freshConstraints) &&
      pathAConstraints.length === 2,
    'Parity [2/10] Table constraints (PK & FK ON DELETE CASCADE) match across Path A, Path B, and schema.sql'
  );

  // 3.3 Indexes
  const indexesQuery = `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'user_workspaces'
    ORDER BY indexname
  `;
  const pathAIndexes = (await pathAClient.query(indexesQuery)).rows;
  const pathBIndexes = (await pathBClient.query(indexesQuery)).rows;
  const freshIndexes = (await freshClient.query(indexesQuery)).rows;
  assert(
    JSON.stringify(pathAIndexes) === JSON.stringify(freshIndexes) &&
      JSON.stringify(pathBIndexes) === JSON.stringify(freshIndexes) &&
      pathAIndexes.length === 1,
    'Parity [3/10] Indexes (user_workspaces_pkey) match across Path A, Path B, and schema.sql'
  );

  // 3.4 RLS Policies (including USING qual & WITH CHECK expressions)
  const rlsQuery = `
    SELECT schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check
    FROM pg_policies
    WHERE (schemaname = 'public' AND tablename = 'user_workspaces')
       OR (schemaname = 'storage' AND tablename = 'objects')
    ORDER BY schemaname, tablename, policyname
  `;
  const pathARls = (await pathAClient.query(rlsQuery)).rows;
  const pathBRls = (await pathBClient.query(rlsQuery)).rows;
  const freshRls = (await freshClient.query(rlsQuery)).rows;
  assert(
    JSON.stringify(pathARls) === JSON.stringify(freshRls) &&
      JSON.stringify(pathBRls) === JSON.stringify(freshRls) &&
      pathARls.length === 7,
    'Parity [4/10] All 7 RLS policies (including exact USING and WITH CHECK expressions) match across Path A, Path B, and schema.sql'
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
  const pathATriggers = (await pathAClient.query(triggersQuery)).rows;
  const pathBTriggers = (await pathBClient.query(triggersQuery)).rows;
  const freshTriggers = (await freshClient.query(triggersQuery)).rows;
  assert(
    JSON.stringify(pathATriggers) === JSON.stringify(freshTriggers) &&
      JSON.stringify(pathBTriggers) === JSON.stringify(freshTriggers) &&
      pathATriggers.length === 4,
    'Parity [5/10] All 4 table triggers and pg_get_triggerdef definitions match across Path A, Path B, and schema.sql'
  );

  // 3.6 Event Triggers
  const evtTriggersQuery = `
    SELECT evtname, evtevent, evtowner::regrole::text, evtfoid::regproc::text, evtenabled, evttags
    FROM pg_event_trigger
    WHERE evtname = 'ensure_rls'
  `;
  const pathAEvt = (await pathAClient.query(evtTriggersQuery)).rows;
  const pathBEvt = (await pathBClient.query(evtTriggersQuery)).rows;
  const freshEvt = (await freshClient.query(evtTriggersQuery)).rows;
  assert(
    JSON.stringify(pathAEvt) === JSON.stringify(freshEvt) &&
      JSON.stringify(pathBEvt) === JSON.stringify(freshEvt) &&
      pathAEvt.length === 1,
    'Parity [6/10] Event trigger (ensure_rls -> public.rls_auto_enable) matches across Path A, Path B, and schema.sql'
  );

  // 3.7 Functions (SECURITY DEFINER, search_path proconfig, ACLs, and full function definitions)
  const funcsQuery = `
    SELECT n.nspname, p.proname, p.prosecdef, p.proconfig, p.proacl::text, pg_get_functiondef(p.oid) AS fndef
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname IN ('public', 'exo_internal')
    ORDER BY n.nspname, p.proname
  `;
  const pathAFuncs = (await pathAClient.query(funcsQuery)).rows;
  const pathBFuncs = (await pathBClient.query(funcsQuery)).rows;
  const freshFuncs = (await freshClient.query(funcsQuery)).rows;
  assert(
    JSON.stringify(pathAFuncs) === JSON.stringify(freshFuncs) &&
      JSON.stringify(pathBFuncs) === JSON.stringify(freshFuncs) &&
      pathAFuncs.length === 7,
    'Parity [7/10] All 7 functions across public & exo_internal (SECURITY DEFINER, search_path, ACLs, and bodies) match across Path A, Path B, and schema.sql'
  );

  // 3.8 Table Privileges & RLS Enablement Flags
  const tableAclQuery = `
    SELECT relname, relrowsecurity, relforcerowsecurity, relacl::text
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND relname = 'user_workspaces'
  `;
  const pathAAcl = (await pathAClient.query(tableAclQuery)).rows;
  const pathBAcl = (await pathBClient.query(tableAclQuery)).rows;
  const freshAcl = (await freshClient.query(tableAclQuery)).rows;
  assert(
    JSON.stringify(pathAAcl) === JSON.stringify(freshAcl) &&
      JSON.stringify(pathBAcl) === JSON.stringify(freshAcl),
    'Parity [8/10] Table ACL grants and RLS flags on public.user_workspaces match across Path A, Path B, and schema.sql'
  );

  // 3.9 Default Privileges (pg_default_acl)
  const defAclQuery = `
    SELECT defaclrole::regrole::text, defaclnamespace::regnamespace::text, defaclobjtype, defaclacl::text
    FROM pg_default_acl
    ORDER BY 1, 2, 3
  `;
  const pathADefAcl = (await pathAClient.query(defAclQuery)).rows;
  const pathBDefAcl = (await pathBClient.query(defAclQuery)).rows;
  const freshDefAcl = (await freshClient.query(defAclQuery)).rows;
  assert(
    JSON.stringify(pathADefAcl) === JSON.stringify(freshDefAcl) &&
      JSON.stringify(pathBDefAcl) === JSON.stringify(freshDefAcl) &&
      pathADefAcl.length >= 2,
    'Parity [9/10] Global and schema-scoped ALTER DEFAULT PRIVILEGES entries (postgres & exo_occ_rpc_definer) match across Path A, Path B, and schema.sql'
  );

  // 3.10 Storage Bucket Configuration & Internal OCC Write-Context Schema Parity
  const bucketQuery = `
    SELECT id, name, public, file_size_limit, allowed_mime_types
    FROM storage.buckets
    WHERE id = 'lecture_media'
  `;
  const pathABucket = (await pathAClient.query(bucketQuery)).rows;
  const pathBBucket = (await pathBClient.query(bucketQuery)).rows;
  const freshBucket = (await freshClient.query(bucketQuery)).rows;
  const internalCtxQuery = `
    SELECT c.relname, c.relrowsecurity, c.relacl::text, pg_get_constraintdef(con.oid) AS condef
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_constraint con ON con.conrelid = c.oid
    WHERE n.nspname = 'exo_internal' AND c.relname = 'occ_active_write_context'
    ORDER BY con.conname
  `;
  const pathAInternal = (await pathAClient.query(internalCtxQuery)).rows;
  const pathBInternal = (await pathBClient.query(internalCtxQuery)).rows;
  const freshInternal = (await freshClient.query(internalCtxQuery)).rows;
  assert(
    JSON.stringify(pathABucket) === JSON.stringify(freshBucket) &&
      JSON.stringify(pathBBucket) === JSON.stringify(freshBucket) &&
      JSON.stringify(pathAInternal) === JSON.stringify(freshInternal) &&
      JSON.stringify(pathBInternal) === JSON.stringify(freshInternal) &&
      pathABucket.length === 1 &&
      pathABucket[0].public === false &&
      Number(pathABucket[0].file_size_limit) === 52428800,
    'Parity [10/10] Storage bucket lecture_media and private exo_internal.occ_active_write_context schema match across Path A, Path B, and schema.sql'
  );

  // 3.11 Hosted Supabase Auth Identity Helper & Privileges Isolation Audit
  const helperProc = (
    await pathBClient.query(`
      SELECT
        p.proname,
        p.prosecdef,
        p.proowner::regrole::text AS owner,
        p.proconfig,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
        has_function_privilege('exo_occ_rpc_definer', p.oid, 'EXECUTE') AS definer_exec,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'exo_internal' AND p.proname = 'current_request_uid'
    `)
  ).rows[0];
  assert(
    helperProc &&
      helperProc.prosecdef === true &&
      helperProc.owner === 'postgres' &&
      Array.isArray(helperProc.proconfig) &&
      helperProc.proconfig.some((c) => c === 'search_path=""' || c === 'search_path=') &&
      helperProc.anon_exec === false &&
      helperProc.auth_exec === true &&
      helperProc.definer_exec === true &&
      helperProc.service_exec === true,
    'Phase 4.2.4 Catalog Audit: exo_internal.current_request_uid() is SECURITY DEFINER, owned by postgres, search_path="", anon EXECUTE revoked, authenticated/definer granted'
  );

  const definerRoleAttrs = (
    await pathBClient.query(`
      SELECT rolname, rolcanlogin, rolinherit, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
      FROM pg_roles
      WHERE rolname = 'exo_occ_rpc_definer'
    `)
  ).rows[0];
  assert(
    definerRoleAttrs &&
      definerRoleAttrs.rolcanlogin === false &&
      definerRoleAttrs.rolinherit === false &&
      definerRoleAttrs.rolcreaterole === false &&
      definerRoleAttrs.rolcreatedb === false &&
      definerRoleAttrs.rolreplication === false &&
      definerRoleAttrs.rolbypassrls === false,
    'Definer Role Security Attributes: exo_occ_rpc_definer has NOLOGIN, NOINHERIT, NOCREATEROLE, NOCREATEDB, NOREPLICATION, NOBYPASSRLS'
  );

  const unauthMembers = (
    await pathBClient.query(`
      SELECT r.rolname AS member, m.rolname AS target_role
      FROM pg_auth_members am
      JOIN pg_roles r ON am.member = r.oid
      JOIN pg_roles m ON am.roleid = m.oid
      WHERE (m.rolname = 'exo_occ_rpc_definer' OR r.rolname = 'exo_occ_rpc_definer')
        AND r.rolname IN ('anon', 'authenticated')
    `)
  ).rows;
  assert(
    unauthMembers.length === 0,
    'Role Membership Isolation: Neither anon nor authenticated is a member of exo_occ_rpc_definer in pg_auth_members'
  );

  const definerAuthCheck = (
    await pathBClient.query(`
      SELECT
        has_schema_privilege('exo_occ_rpc_definer', 'auth', 'USAGE') AS definer_auth_usage,
        has_table_privilege('exo_occ_rpc_definer', 'auth.users', 'SELECT') AS definer_users_select
    `)
  ).rows[0];
  assert(
    definerAuthCheck.definer_auth_usage === false && definerAuthCheck.definer_users_select === false,
    'Phase 4.2.4 Privilege Audit: exo_occ_rpc_definer possesses NO USAGE on schema auth and NO SELECT on auth.users'
  );

  const directAuthCalls = (
    await pathBClient.query(`
      SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'sync_workspace_with_concurrency'
        AND pg_get_functiondef(p.oid) ~* 'auth\\.uid\\(\\)'
    `)
  ).rows;
  assert(
    directAuthCalls.length === 0,
    'Phase 4.2.4 Function Audit: sync_workspace_with_concurrency contains 0 direct calls to auth.uid(), routing through exo_internal.current_request_uid()'
  );

  // Close Path A client and reference fresh client; proceed with Path B (live upgraded DB) for concurrency & security suites
  await pathAClient.end();
  await freshClient.end();
  const migClient = pathBClient;

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
  const conn1 = new Client({ connectionString: getDbUrl('exo_pg16_existing_upgrade') });
  const conn2 = new Client({ connectionString: getDbUrl('exo_pg16_existing_upgrade') });
  const connMonitor = new Client({ connectionString: getDbUrl('exo_pg16_existing_upgrade') });
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

  // --------------------------------------------------------------------------
  // SECTION 6: Custom GUC Forgery Attack & Unforgeable OCC RPC Proof on PostgreSQL 16
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 6: Custom GUC Forgery Attack (exo.occ_rpc_active) & Unforgeable OCC RPC Proof ---');

  const userB = 'bbbbbbbb-1111-2222-3333-444455556666';
  const userNoWorkspace = 'dddddddd-1111-2222-3333-444455556666';
  await migClient.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4)`, [
    userB,
    'bob.victim@exo.edu',
    userNoWorkspace,
    'dave.noworkspace@exo.edu'
  ]);

  // Seed User B workspace at revision 1 so we can prove zero cross-account leakage after attacks
  await conn2.query('BEGIN');
  await conn2.query('SET LOCAL ROLE authenticated');
  await conn2.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
  await conn2.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userB]);
  const seedUserBRes = await conn2.query(
    `SELECT public.sync_workspace_with_concurrency($1::jsonb, NULL) AS res`,
    [JSON.stringify({ subjects: [{ id: 'sub_b_protected', name: 'Bob Protected Subject' }] })]
  );
  await conn2.query('COMMIT');
  assert(
    seedUserBRes.rows[0].res.status === 'success' && seedUserBRes.rows[0].res.revision === 1,
    'Seeded User B workspace at revision 1 on PostgreSQL 16 for cross-account isolation verification'
  );

  // 6.1 Temporarily grant INSERT, UPDATE on public.user_workspaces to authenticated from admin connection (migClient)
  //     to test the exact forgery attack scenario where authenticated attempts to forge exo.occ_rpc_active = 'true'
  await migClient.query(`GRANT INSERT, UPDATE ON TABLE public.user_workspaces TO authenticated;`);

  // Attack 1: Authenticated session sets exo.occ_rpc_active = 'true' manually and attempts direct UPDATE on own row
  let forgedUpdateError = null;
  let forgedGucValue = null;
  try {
    await conn1.query('BEGIN');
    await conn1.query('SET LOCAL ROLE authenticated');
    await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
    await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userA]);
    const gucRes = await conn1.query(`SELECT pg_catalog.set_config('exo.occ_rpc_active', 'true', true) AS val`);
    forgedGucValue = gucRes.rows[0].val;
    await conn1.query(
      `UPDATE public.user_workspaces SET subjects = '[{"id":"forged_guc_hijack"}]'::jsonb WHERE user_id = $1`,
      [userA]
    );
    await conn1.query('COMMIT');
  } catch (err) {
    forgedUpdateError = err;
    await conn1.query('ROLLBACK');
  }
  assert(
    forgedGucValue === 'true' &&
      forgedUpdateError !== null &&
      forgedUpdateError.code === '42501' &&
      String(forgedUpdateError.message).includes('OCC_BYPASS_FORBIDDEN'),
    'Forged GUC Attack Blocked (UPDATE): Setting exo.occ_rpc_active = "true" in authenticated session with temporary UPDATE grant is rejected with OCC_BYPASS_FORBIDDEN (42501)'
  );

  // Attack 2: Authenticated session sets exo.occ_rpc_active = 'true' manually and attempts direct INSERT
  let forgedInsertError = null;
  try {
    await conn1.query('BEGIN');
    await conn1.query('SET LOCAL ROLE authenticated');
    await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
    await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userNoWorkspace]);
    await conn1.query(`SELECT pg_catalog.set_config('exo.occ_rpc_active', 'true', true)`);
    await conn1.query(
      `INSERT INTO public.user_workspaces (user_id, subjects, revision) VALUES ($1, '[{"id":"forged_insert"}]'::jsonb, 99)`,
      [userNoWorkspace]
    );
    await conn1.query('COMMIT');
  } catch (err) {
    forgedInsertError = err;
    await conn1.query('ROLLBACK');
  }
  assert(
    forgedInsertError !== null &&
      forgedInsertError.code === '42501' &&
      String(forgedInsertError.message).includes('OCC_BYPASS_FORBIDDEN'),
    'Forged GUC Attack Blocked (INSERT): Setting exo.occ_rpc_active = "true" in authenticated session with temporary INSERT grant is rejected with OCC_BYPASS_FORBIDDEN (42501)'
  );

  // Attack 3: Authenticated session (session_user = authenticated) attempts SET ROLE exo_occ_rpc_definer
  //           or direct write to exo_internal.occ_active_write_context
  let setDefinerRoleError = null;
  try {
    await conn1.query('BEGIN');
    await conn1.query('SET LOCAL SESSION AUTHORIZATION authenticated');
    await conn1.query('SET LOCAL ROLE exo_occ_rpc_definer');
    await conn1.query('COMMIT');
  } catch (err) {
    setDefinerRoleError = err;
    await conn1.query('ROLLBACK');
  }
  let forgeInternalTableError = null;
  try {
    await conn1.query('BEGIN');
    await conn1.query('SET LOCAL SESSION AUTHORIZATION authenticated');
    await conn1.query(
      `INSERT INTO exo_internal.occ_active_write_context (txid, user_id, write_op) VALUES (pg_catalog.pg_current_xact_id(), $1, 'UPDATE')`,
      [userA]
    );
    await conn1.query('COMMIT');
  } catch (err) {
    forgeInternalTableError = err;
    await conn1.query('ROLLBACK');
  }
  assert(
    setDefinerRoleError !== null &&
      String(setDefinerRoleError.message).includes('permission denied to set role') &&
      forgeInternalTableError !== null &&
      String(forgeInternalTableError.message).includes('permission denied'),
    'Role & Internal Context Forgery Blocked: authenticated cannot SET ROLE exo_occ_rpc_definer or access schema exo_internal'
  );

  // Attack 4: Same-Transaction Piggyback Attack — Authenticated session calls valid sync_workspace_with_concurrency()
  //           and then attempts a direct UPDATE in the SAME transaction right after the RPC returns
  let piggybackError = null;
  try {
    await conn1.query('BEGIN');
    await conn1.query('SET LOCAL ROLE authenticated');
    await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
    await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userA]);
    await conn1.query(`SELECT public.sync_workspace_with_concurrency($1::jsonb, 3) AS res`, [
      JSON.stringify({ subjects: [{ id: 'sub_legit_before_piggyback', name: 'Legit RPC Step' }] })
    ]);
    // Attempt direct UPDATE in the exact same transaction (same txid!)
    await conn1.query(
      `UPDATE public.user_workspaces SET subjects = '[{"id":"piggyback_hijack"}]'::jsonb WHERE user_id = $1`,
      [userA]
    );
    await conn1.query('COMMIT');
  } catch (err) {
    piggybackError = err;
    await conn1.query('ROLLBACK');
  }
  assert(
    piggybackError !== null &&
      piggybackError.code === '42501' &&
      String(piggybackError.message).includes('OCC_BYPASS_FORBIDDEN'),
    'Same-Transaction Piggyback Attack Blocked: Direct UPDATE immediately following sync_workspace_with_concurrency() in the same transaction is rejected'
  );

  // Attack 5: Independent Second Layer Proof — Even if trg_enforce_workspace_write_via_rpc is temporarily disabled,
  //           the RLS policy WITH CHECK (CURRENT_USER = 'exo_occ_rpc_definer') independently blocks direct UPDATE with forged GUC
  await migClient.query(`ALTER TABLE public.user_workspaces DISABLE TRIGGER trg_enforce_workspace_write_via_rpc;`);
  let rlsBlockedForgedError = null;
  try {
    await conn1.query('BEGIN');
    await conn1.query('SET LOCAL ROLE authenticated');
    await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
    await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userA]);
    await conn1.query(`SELECT pg_catalog.set_config('exo.occ_rpc_active', 'true', true)`);
    await conn1.query(
      `UPDATE public.user_workspaces SET subjects = '[{"id":"rls_bypass_attempt"}]'::jsonb WHERE user_id = $1`,
      [userA]
    );
    await conn1.query('COMMIT');
  } catch (err) {
    rlsBlockedForgedError = err;
    await conn1.query('ROLLBACK');
  } finally {
    await migClient.query(`ALTER TABLE public.user_workspaces ENABLE TRIGGER trg_enforce_workspace_write_via_rpc;`);
  }
  assert(
    rlsBlockedForgedError !== null &&
      rlsBlockedForgedError.code === '42501' &&
      String(rlsBlockedForgedError.message).includes('row-level security policy'),
    'Independent RLS Layer Proven: Even with trigger temporarily disabled and exo.occ_rpc_active = "true", RLS WITH CHECK (CURRENT_USER = exo_occ_rpc_definer) rejects direct UPDATE (42501)'
  );

  // 6.2 Authorized update via sync_workspace_with_concurrency() in authenticated session succeeds normally
  await conn1.query('BEGIN');
  await conn1.query('SET LOCAL ROLE authenticated');
  await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
  await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userA]);
  const legitRpcAfterAttacks = await conn1.query(
    `SELECT public.sync_workspace_with_concurrency($1::jsonb, 3) AS res`,
    [
      JSON.stringify({
        subjects: [{ id: 'sub_legit_rev4', name: 'Authorized RPC Update After Forgery Blocks' }]
      })
    ]
  );
  await conn1.query('COMMIT');
  assert(
    legitRpcAfterAttacks.rows[0].res.status === 'success' && legitRpcAfterAttacks.rows[0].res.revision === 4,
    'Authorized sync_workspace_with_concurrency() update succeeds for User A (revision 3 -> 4)'
  );

  // Restore strict table privilege revocation on public.user_workspaces
  await migClient.query(`REVOKE INSERT, UPDATE ON TABLE public.user_workspaces FROM authenticated;`);

  // Verify User B row was completely unaffected by all forgery attempts and User A updates
  const userBAfterForgeryTests = (
    await migClient.query(`SELECT revision, subjects, user_email FROM public.user_workspaces WHERE user_id = $1`, [
      userB
    ])
  ).rows[0];
  assert(
    userBAfterForgeryTests.revision === 1 &&
      userBAfterForgeryTests.subjects.length === 1 &&
      userBAfterForgeryTests.subjects[0].id === 'sub_b_protected' &&
      userBAfterForgeryTests.user_email === 'bob.victim@exo.edu',
    'Cross-account isolation intact: User B workspace remained untouched at revision 1 throughout all forgery tests'
  );

  // --------------------------------------------------------------------------
  // SECTION 7: auth.uid() Identity Binding & Anti-Spoofing Proof on PostgreSQL 16
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 7: auth.uid() Identity Binding & Anti-Spoofing Verification ---');

  // 7.1 Payload Spoofing Test: User A passes User B's user_id, User B's email, can_upload_media=true, and revision=999
  //     inside p_payload to sync_workspace_with_concurrency().
  await conn1.query('BEGIN');
  await conn1.query('SET LOCAL ROLE authenticated');
  await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
  await conn1.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [userA]);
  const spoofPayloadRes = await conn1.query(
    `SELECT public.sync_workspace_with_concurrency($1::jsonb, 4) AS res`,
    [
      JSON.stringify({
        user_id: userB,
        user_email: 'bob.victim@exo.edu',
        can_upload_media: true,
        revision: 999,
        subjects: [{ id: 'sub_spoof_test', name: 'Bound Strictly to auth.uid()' }]
      })
    ]
  );
  await conn1.query('COMMIT');

  const userAAfterSpoof = (
    await migClient.query(
      `SELECT user_id, user_email, can_upload_media, revision, subjects FROM public.user_workspaces WHERE user_id = $1`,
      [userA]
    )
  ).rows[0];
  const userBAfterSpoof = (
    await migClient.query(
      `SELECT user_id, user_email, can_upload_media, revision, subjects FROM public.user_workspaces WHERE user_id = $1`,
      [userB]
    )
  ).rows[0];
  assert(
    spoofPayloadRes.rows[0].res.status === 'success' &&
      userAAfterSpoof.revision === 5 &&
      userAAfterSpoof.user_email === 'alice.concurrency@exo.edu' &&
      userAAfterSpoof.can_upload_media === false &&
      userBAfterSpoof.revision === 1 &&
      userBAfterSpoof.subjects[0].id === 'sub_b_protected',
    'Identity Anti-Spoofing Proven: sync_workspace_with_concurrency ignores spoofed user_id/user_email/can_upload_media in payload, enforces auth.uid() and auth.users email, and never touches User B'
  );

  // 7.2 Role Escalation Prevention: Verify authenticated (session_user = authenticated) cannot escalate to postgres or service_role
  let escalatePostgresErr = null;
  try {
    await conn1.query('BEGIN');
    await conn1.query('SET LOCAL SESSION AUTHORIZATION authenticated');
    await conn1.query('SET LOCAL ROLE postgres');
    await conn1.query('COMMIT');
  } catch (err) {
    escalatePostgresErr = err;
    await conn1.query('ROLLBACK');
  }
  let escalateServiceRoleErr = null;
  try {
    await conn1.query('BEGIN');
    await conn1.query('SET LOCAL SESSION AUTHORIZATION authenticated');
    await conn1.query('SET LOCAL ROLE service_role');
    await conn1.query('COMMIT');
  } catch (err) {
    escalateServiceRoleErr = err;
    await conn1.query('ROLLBACK');
  }
  assert(
    escalatePostgresErr !== null &&
      String(escalatePostgresErr.message).includes('permission denied to set role') &&
      escalateServiceRoleErr !== null &&
      String(escalateServiceRoleErr.message).includes('permission denied to set role'),
    'Role Escalation Blocked: authenticated session cannot SET ROLE to postgres or service_role'
  );

  await conn1.end();
  await conn2.end();
  await connMonitor.end();
  await migClient.end();

  // --------------------------------------------------------------------------
  // SECTION 8: Faithful Hosted-Supabase Non-Superuser Fixture, Dual-Path Audits & Cleanup Proof (Phase 4.2.4.4.1)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 8: Faithful Hosted Supabase Non-Superuser Fixture & Dual-Path Proof (B1-B7) ---');

  async function safeCloseClient(client) {
    if (!client) return;
    try {
      await client.end();
    } catch (_) {}
  }

  let initialSuperConn = null;
  let bootstrapAdminConn = null;
  let scratchBootstrap = null;
  let scratchRunner = null;
  let pathABootstrap = null;
  let pathARunner = null;
  let pathBBootstrap = null;
  let pathBRunner = null;

  const BOOTSTRAP_ADMIN_USER = 'supabase_admin';
  const BOOTSTRAP_ADMIN_PASS = 'supabase_admin_disposable_pass';
  const RUNNER_POSTGRES_USER = 'postgres';
  const RUNNER_POSTGRES_PASS = 'postgres_runner_disposable_pass';

  try {
    // B3 Verification: Confirm live connection target is the verified disposable PostgreSQL 16 instance
    initialSuperConn = new Client({ connectionString: getDbUrl('postgres', 'postgres', 'postgres') });
    await initialSuperConn.connect();

    const targetClusterAudit = (
      await initialSuperConn.query(`
        SELECT
          inet_server_addr()::text AS server_addr,
          inet_server_port() AS server_port,
          current_setting('cluster_name', true) AS cluster_name,
          current_setting('data_directory') AS data_dir,
          (SELECT rolname FROM pg_roles WHERE oid = 10) AS bootstrap_superuser,
          (SELECT oid::int FROM pg_roles WHERE rolname = 'postgres') AS postgres_role_oid,
          (
            SELECT count(*)::int
            FROM pg_database
            WHERE datistemplate = false
              AND datname NOT IN ('postgres', 'supabase_admin')
              AND datname NOT LIKE 'exo_pg16_%'
          ) AS foreign_db_count,
          session_user,
          current_user
      `)
    ).rows[0];

    const targetDataDirReal = canonicalizeExistingPath(targetClusterAudit.data_dir);
    const expectedEphemeralDirReal =
      ephemeralClusterState !== null ? canonicalizeExistingPath(ephemeralClusterState.dataDir) : null;
    const hasVerifiedEphemeralDir =
      targetDataDirReal !== null &&
      expectedEphemeralDirReal !== null &&
      targetDataDirReal === expectedEphemeralDirReal;

    const isVerifiedDisposableTarget =
      isLoopbackHost(targetClusterAudit.server_addr || '127.0.0.1') &&
      !isForbiddenRemoteHost(targetClusterAudit.server_addr || '') &&
      (targetClusterAudit.cluster_name === 'exo_disposable_pg16' || hasVerifiedEphemeralDir) &&
      targetClusterAudit.bootstrap_superuser === 'supabase_admin' &&
      Number(targetClusterAudit.postgres_role_oid) > 10 &&
      Number(targetClusterAudit.foreign_db_count) === 0;

    assert(
      isVerifiedDisposableTarget === true,
      `B3 Disposable Target Verified: loopback=${targetClusterAudit.server_addr || '127.0.0.1'}:${targetClusterAudit.server_port}, cluster_name="${targetClusterAudit.cluster_name}", bootstrap_superuser="${targetClusterAudit.bootstrap_superuser}", postgres_oid=${targetClusterAudit.postgres_role_oid}, foreign_db_count=${targetClusterAudit.foreign_db_count}, data_dir="${targetClusterAudit.data_dir}"`
    );

    if (!isVerifiedDisposableTarget) {
      throw new Error('Aborting Section 8: target PostgreSQL 16 instance failed server-side disposable isolation verification.');
    }

    // Clean up databases and cluster-global role from Sections 2-7 before starting Section 8
    // so Path A (Fresh Install) starts from a genuinely clean state where exo_occ_rpc_definer does not pre-exist
    await initialSuperConn.query('DROP DATABASE IF EXISTS exo_pg16_fresh_install WITH (FORCE);');
    await initialSuperConn.query('DROP DATABASE IF EXISTS exo_pg16_existing_upgrade WITH (FORCE);');
    await initialSuperConn.query('DROP DATABASE IF EXISTS exo_pg16_fresh_schema WITH (FORCE);');
    await initialSuperConn.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'exo_occ_rpc_definer') THEN
          REASSIGN OWNED BY exo_occ_rpc_definer TO postgres;
          DROP OWNED BY exo_occ_rpc_definer;
          DROP ROLE exo_occ_rpc_definer;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
          CREATE ROLE supabase_admin WITH SUPERUSER CREATEDB CREATEROLE LOGIN PASSWORD '${BOOTSTRAP_ADMIN_PASS}';
        ELSE
          ALTER ROLE supabase_admin WITH SUPERUSER CREATEDB CREATEROLE LOGIN PASSWORD '${BOOTSTRAP_ADMIN_PASS}';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
          CREATE ROLE supabase_auth_admin NOLOGIN;
        END IF;
      END
      $$;
    `);
    await safeCloseClient(initialSuperConn);
    initialSuperConn = null;

    // B1 Fix: Connect via distinct authenticated TCP connection as supabase_admin (with its own distinct password)
    bootstrapAdminConn = new Client({
      connectionString: getDbUrl('postgres', BOOTSTRAP_ADMIN_USER, BOOTSTRAP_ADMIN_PASS)
    });
    await bootstrapAdminConn.connect();

    const bootstrapSessionIdentity = (
      await bootstrapAdminConn.query(`
        SELECT
          session_user,
          current_user,
          r.rolsuper,
          r.rolcreatedb,
          r.rolcreaterole,
          r.rolcanlogin
        FROM pg_roles r
        WHERE r.rolname = current_user
      `)
    ).rows[0];

    assert(
      bootstrapSessionIdentity.session_user === 'supabase_admin' &&
        bootstrapSessionIdentity.current_user === 'supabase_admin' &&
        bootstrapSessionIdentity.rolsuper === true &&
        bootstrapSessionIdentity.rolcanlogin === true,
      'B1 Bootstrap Connection Identity: authenticated as session_user=supabase_admin, current_user=supabase_admin, rolsuper=true'
    );

    // Demote postgres to match Hosted Supabase migration runner attributes (NOSUPERUSER CREATEDB CREATEROLE LOGIN)
    // with its own distinct password so bootstrap and runner connections cannot share credentials
    await bootstrapAdminConn.query(`
      ALTER ROLE postgres WITH NOSUPERUSER CREATEDB CREATEROLE LOGIN PASSWORD '${RUNNER_POSTGRES_PASS}';
    `);

    const demotedPostgresCatalog = (
      await bootstrapAdminConn.query(`
        SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin
        FROM pg_roles
        WHERE rolname = 'postgres'
      `)
    ).rows[0];

    assert(
      demotedPostgresCatalog.rolname === 'postgres' &&
        demotedPostgresCatalog.rolsuper === false &&
        demotedPostgresCatalog.rolcreatedb === true &&
        demotedPostgresCatalog.rolcreaterole === true &&
        demotedPostgresCatalog.rolcanlogin === true,
      'B1 Hosted Migration Runner Role Attributes: postgres configured with rolsuper=false, rolcreatedb=true, rolcreaterole=true, rolcanlogin=true'
    );

    // Helper: Provision a hosted-Supabase-like database using ONLY the supabase_admin bootstrap connection,
    // without touching any objects created by migrations 150000 or 160000.
    async function provisionHostedDatabaseBootstrap(dbName) {
      await bootstrapAdminConn.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`);
      await bootstrapAdminConn.query(`CREATE DATABASE ${dbName} OWNER postgres;`);

      const dbBootstrapConn = new Client({
        connectionString: getDbUrl(dbName, BOOTSTRAP_ADMIN_USER, BOOTSTRAP_ADMIN_PASS)
      });
      dbBootstrapConn.on('error', () => {});
      await dbBootstrapConn.connect();

      try {
        const idRow = (
          await dbBootstrapConn.query(`
            SELECT session_user, current_user, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS rolsuper
          `)
        ).rows[0];
        if (idRow.session_user !== 'supabase_admin' || idRow.current_user !== 'supabase_admin' || idRow.rolsuper !== true) {
          throw new Error(`Bootstrap connection on ${dbName} failed identity check: ${JSON.stringify(idRow)}`);
        }

        await dbBootstrapConn.query(SUPABASE_PG16_BOOTSTRAP_SQL);
        await dbBootstrapConn.query(`
          CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
          CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
          CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
        `);

        // Configure realistic Hosted Supabase managed auth schema ownership & ACLs BEFORE migrations run:
        // - Schema auth owned by supabase_admin
        // - Table auth.users and function auth.uid() owned by supabase_auth_admin
        // - Role postgres has USAGE on schema auth WITHOUT GRANT OPTION (is_grantable = false)
        // - Role postgres has SELECT on table auth.users WITHOUT GRANT OPTION (is_grantable = false)
        await dbBootstrapConn.query(`
          ALTER SCHEMA auth OWNER TO supabase_admin;
          ALTER TABLE auth.users OWNER TO supabase_auth_admin;
          ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
          ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;

          REVOKE ALL ON SCHEMA auth FROM PUBLIC, postgres, anon, authenticated, service_role;
          GRANT USAGE ON SCHEMA auth TO supabase_auth_admin, postgres, service_role, anon, authenticated;

          REVOKE ALL ON TABLE auth.users FROM PUBLIC, postgres, anon, authenticated, service_role;
          GRANT SELECT ON TABLE auth.users TO supabase_auth_admin, postgres, service_role, anon, authenticated;

          ALTER SCHEMA public OWNER TO postgres;
          GRANT ALL ON SCHEMA public TO postgres;
          GRANT ALL ON SCHEMA extensions TO postgres;
          GRANT ALL ON SCHEMA storage TO postgres;
          GRANT ALL ON TABLE storage.buckets TO postgres;
          GRANT ALL ON TABLE storage.objects TO postgres;
          GRANT anon, authenticated, service_role TO postgres;
        `);

        // B5 Pre-Migration Verification: Inspect BOTH auth schema ACL and auth.users table ACL via aclexplode()
        const preAuthSchemaAcl = (
          await dbBootstrapConn.query(`
            SELECT
              n.nspowner::regrole::text AS schema_owner,
              a.grantor::regrole::text AS grantor,
              a.grantee::regrole::text AS grantee,
              a.privilege_type,
              a.is_grantable
            FROM pg_namespace n,
            LATERAL aclexplode(n.nspacl) a
            WHERE n.nspname = 'auth'
          `)
        ).rows;

        const preAuthUsersTableAcl = (
          await dbBootstrapConn.query(`
            SELECT
              c.relowner::regrole::text AS table_owner,
              a.grantor::regrole::text AS grantor,
              a.grantee::regrole::text AS grantee,
              a.privilege_type,
              a.is_grantable
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace,
            LATERAL aclexplode(c.relacl) a
            WHERE n.nspname = 'auth' AND c.relname = 'users'
          `)
        ).rows;

        const pgSchemaUsage = preAuthSchemaAcl.find(
          (r) => r.grantee === 'postgres' && r.privilege_type === 'USAGE'
        );
        const pgUsersSelect = preAuthUsersTableAcl.find(
          (r) => r.grantee === 'postgres' && r.privilege_type === 'SELECT'
        );

        assert(
          preAuthSchemaAcl.length > 0 &&
            preAuthSchemaAcl[0].schema_owner === 'supabase_admin' &&
            pgSchemaUsage !== undefined &&
            pgSchemaUsage.is_grantable === false &&
            preAuthUsersTableAcl.length > 0 &&
            preAuthUsersTableAcl[0].table_owner === 'supabase_auth_admin' &&
            pgUsersSelect !== undefined &&
            pgUsersSelect.is_grantable === false,
          `B5 Pre-Migration Auth ACL (${dbName}): auth owned by supabase_admin, auth.users owned by supabase_auth_admin, postgres has USAGE on auth (is_grantable=false) and SELECT on auth.users (is_grantable=false)`
        );

        // Apply baseline migrations 133622 (which creates event trigger ensure_rls requiring superuser) and 140000 in bootstrap
        await dbBootstrapConn.query(baselineMigrationSql);
        await dbBootstrapConn.query(phase421HistoricalMigrationSql);

        // Revoke superuser-granted PUBLIC ACL on schema public (=UC/supabase_admin) and transfer baseline public objects
        // to postgres (matching hosted Supabase state prior to 150000)
        await dbBootstrapConn.query(`
          REVOKE ALL ON SCHEMA public FROM PUBLIC, anon, authenticated, postgres, service_role;
          ALTER SCHEMA public OWNER TO postgres;
          ALTER FUNCTION public.handle_user_workspace_updated_at() OWNER TO postgres;
          ALTER FUNCTION public.enforce_workspace_write_via_rpc() OWNER TO postgres;
          ALTER FUNCTION public.sync_workspace_with_concurrency(jsonb, integer) OWNER TO postgres;
          ALTER FUNCTION public.enforce_workspace_media_security() OWNER TO postgres;
          ALTER FUNCTION public.protect_vip_status_column() OWNER TO postgres;
          ALTER TABLE public.user_workspaces OWNER TO postgres;

          CREATE SCHEMA IF NOT EXISTS supabase_migrations AUTHORIZATION postgres;
          CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
            version text PRIMARY KEY,
            statements text[],
            name text
          );
          ALTER TABLE supabase_migrations.schema_migrations OWNER TO postgres;
        `);
        await dbBootstrapConn.query('BEGIN');
        await dbBootstrapConn.query('SET LOCAL ROLE postgres');
        await dbBootstrapConn.query(`
          GRANT ALL ON SCHEMA public TO postgres;
          GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
        `);
        await dbBootstrapConn.query('COMMIT');

        const baselineStateCheck = (
          await dbBootstrapConn.query(`
            SELECT
              (SELECT count(*)::int FROM pg_event_trigger WHERE evtname = 'ensure_rls') AS evt_count,
              (SELECT c.relowner::regrole::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'user_workspaces') AS table_owner
          `)
        ).rows[0];

        assert(
          baselineStateCheck.evt_count === 1 && baselineStateCheck.table_owner === 'postgres',
          `Bootstrap Baseline Verified (${dbName}): 133622 (ensure_rls event trigger) and 140000 applied; public.user_workspaces owned by postgres`
        );

        return dbBootstrapConn;
      } catch (err) {
        await safeCloseClient(dbBootstrapConn);
        throw err;
      }
    }

    // ------------------------------------------------------------------------
    // 8.1 Isolated Scratch Experiment: Reproduce 42501 Without CREATE on public
    // ------------------------------------------------------------------------
    scratchBootstrap = await provisionHostedDatabaseBootstrap('exo_pg16_scratch_experiment');
    await safeCloseClient(scratchBootstrap);
    scratchBootstrap = null;

    scratchRunner = new Client({
      connectionString: getDbUrl('exo_pg16_scratch_experiment', RUNNER_POSTGRES_USER, RUNNER_POSTGRES_PASS)
    });
    await scratchRunner.connect();

    const scratchRunnerId = (
      await scratchRunner.query(`
        SELECT session_user, current_user, r.rolsuper, r.rolcreaterole, r.rolcreatedb
        FROM pg_roles r
        WHERE r.rolname = current_user
      `)
    ).rows[0];
    assert(
      scratchRunnerId.session_user === 'postgres' &&
        scratchRunnerId.current_user === 'postgres' &&
        scratchRunnerId.rolsuper === false &&
        scratchRunnerId.rolcreaterole === true,
      'B1 Scratch Runner Identity: connected directly as session_user=postgres, current_user=postgres, rolsuper=false (no SET ROLE used)'
    );

    await scratchRunner.query(`
      DROP ROLE IF EXISTS exo_scratch_probe_definer;
      CREATE ROLE exo_scratch_probe_definer NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      REVOKE exo_scratch_probe_definer FROM postgres;
      REVOKE ALL ON SCHEMA public FROM PUBLIC, anon, authenticated;
      GRANT USAGE ON SCHEMA public TO exo_scratch_probe_definer;
    `);

    let missingSetRoleError = null;
    try {
      await scratchRunner.query('BEGIN');
      await scratchRunner.query(
        'ALTER FUNCTION public.sync_workspace_with_concurrency(jsonb, integer) OWNER TO exo_scratch_probe_definer'
      );
      await scratchRunner.query('COMMIT');
    } catch (err) {
      missingSetRoleError = err;
      await scratchRunner.query('ROLLBACK');
    }

    assert(
      missingSetRoleError !== null &&
        missingSetRoleError.code === '42501' &&
        String(missingSetRoleError.message).includes('must be able to SET ROLE "exo_scratch_probe_definer"'),
      'Isolated Scratch Proof: non-superuser postgres attempting ALTER FUNCTION OWNER TO without role membership fails with SQLSTATE 42501'
    );

    await scratchRunner.query('GRANT exo_scratch_probe_definer TO postgres');

    let missingCreateError = null;
    try {
      await scratchRunner.query('BEGIN');
      await scratchRunner.query(
        'ALTER FUNCTION public.sync_workspace_with_concurrency(jsonb, integer) OWNER TO exo_scratch_probe_definer'
      );
      await scratchRunner.query('COMMIT');
    } catch (err) {
      missingCreateError = err;
      await scratchRunner.query('ROLLBACK');
    }

    assert(
      missingCreateError !== null &&
        missingCreateError.code === '42501' &&
        String(missingCreateError.message).includes('permission denied for schema public'),
      'Isolated Scratch Proof: non-superuser postgres attempting ALTER FUNCTION OWNER TO with role membership but without CREATE on schema public fails with SQLSTATE 42501 (permission denied for schema public)'
    );

    await scratchRunner.query('GRANT CREATE ON SCHEMA public TO exo_scratch_probe_definer');
    await scratchRunner.query(
      'ALTER FUNCTION public.sync_workspace_with_concurrency(jsonb, integer) OWNER TO exo_scratch_probe_definer'
    );
    await scratchRunner.query('REVOKE CREATE ON SCHEMA public FROM exo_scratch_probe_definer');

    const scratchTransferVerify = (
      await scratchRunner.query(`
        SELECT
          p.proowner::regrole::text AS func_owner,
          has_schema_privilege('exo_scratch_probe_definer', 'public', 'CREATE') AS has_create,
          has_schema_privilege('exo_scratch_probe_definer', 'public', 'USAGE') AS has_usage
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sync_workspace_with_concurrency'
      `)
    ).rows[0];
    assert(
      scratchTransferVerify.func_owner === 'exo_scratch_probe_definer' &&
        scratchTransferVerify.has_create === false &&
        scratchTransferVerify.has_usage === true,
      'Isolated Scratch Proof: temporary GRANT CREATE + ALTER FUNCTION OWNER TO + immediate REVOKE CREATE succeeds under non-superuser postgres'
    );

    await safeCloseClient(scratchRunner);
    scratchRunner = null;

    // ------------------------------------------------------------------------
    // 8.2 Shared Full Security Audit Helper for BOTH Path A and Path B (B5 & B6)
    // ------------------------------------------------------------------------
    async function runFullHostedPostMigrationAudit(runnerConn, pathLabel, seedEmailPrefix) {
      // 1. Verify active connection identity is genuinely non-superuser postgres
      const connIdentity = (
        await runnerConn.query(`
          SELECT session_user, current_user, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolcanlogin
          FROM pg_roles r
          WHERE r.rolname = current_user
        `)
      ).rows[0];
      assert(
        connIdentity.session_user === 'postgres' &&
          connIdentity.current_user === 'postgres' &&
          connIdentity.rolsuper === false &&
          connIdentity.rolcreatedb === true &&
          connIdentity.rolcreaterole === true &&
          connIdentity.rolcanlogin === true,
        `${pathLabel} [B1/B6 Identity]: verified session_user=postgres, current_user=postgres, rolsuper=false`
      );

      // 2. Verify pg_auth_members membership & SET LOCAL ROLE capability (Requirement 4A)
      const authMembers = (
        await runnerConn.query(`
          SELECT
            m.roleid::regrole::text AS role_name,
            m.member::regrole::text AS member_name
          FROM pg_auth_members m
          WHERE m.roleid = 'exo_occ_rpc_definer'::regrole
        `)
      ).rows;
      const postgresIsMember = authMembers.some((r) => r.member_name === 'postgres');
      const anonOrAuthIsMember = authMembers.some(
        (r) => r.member_name === 'anon' || r.member_name === 'authenticated'
      );

      let setLocalRoleWorked = false;
      let definerActiveUser = null;
      await runnerConn.query('BEGIN');
      await runnerConn.query('SET LOCAL ROLE "exo_occ_rpc_definer"');
      definerActiveUser = (await runnerConn.query('SELECT session_user, current_user')).rows[0];
      await runnerConn.query('ROLLBACK');
      setLocalRoleWorked =
        definerActiveUser.session_user === 'postgres' &&
        definerActiveUser.current_user === 'exo_occ_rpc_definer';

      assert(
        postgresIsMember === true && anonOrAuthIsMember === false && setLocalRoleWorked === true,
        `${pathLabel} [B6 Role Membership & SET ROLE]: postgres is member of exo_occ_rpc_definer, anon/authenticated excluded, SET LOCAL ROLE verified`
      );

      // 3. Verify exo_occ_rpc_definer role attributes
      const definerRoleRow = (
        await runnerConn.query(`
          SELECT rolname, rolsuper, rolcanlogin, rolinherit, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
          FROM pg_roles
          WHERE rolname = 'exo_occ_rpc_definer'
        `)
      ).rows[0];
      assert(
        definerRoleRow &&
          definerRoleRow.rolsuper === false &&
          definerRoleRow.rolcanlogin === false &&
          definerRoleRow.rolinherit === false &&
          definerRoleRow.rolcreaterole === false &&
          definerRoleRow.rolcreatedb === false &&
          definerRoleRow.rolreplication === false &&
          definerRoleRow.rolbypassrls === false,
        `${pathLabel} [B6 Definer Role Hardening]: exo_occ_rpc_definer has NOLOGIN, NOINHERIT, NOSUPERUSER, NOCREATEROLE, NOCREATEDB, NOBYPASSRLS`
      );

      // 4. Verify schema public ACL via aclexplode() (Requirement 4E)
      const publicAclRows = (
        await runnerConn.query(`
          SELECT
            a.grantor::regrole::text AS grantor,
            a.grantee::regrole::text AS grantee,
            a.privilege_type,
            a.is_grantable
          FROM pg_namespace n,
          LATERAL aclexplode(n.nspacl) a
          WHERE n.nspname = 'public' AND a.grantee = 'exo_occ_rpc_definer'::regrole
        `)
      ).rows;
      const publicPrivFlags = (
        await runnerConn.query(`
          SELECT
            has_schema_privilege('exo_occ_rpc_definer', 'public', 'USAGE') AS has_usage,
            has_schema_privilege('exo_occ_rpc_definer', 'public', 'CREATE') AS has_create
        `)
      ).rows[0];
      assert(
        publicAclRows.length === 1 &&
          publicAclRows[0].privilege_type === 'USAGE' &&
          publicAclRows[0].is_grantable === false &&
          publicPrivFlags.has_usage === true &&
          publicPrivFlags.has_create === false,
        `${pathLabel} [B6 Public Schema ACL]: aclexplode confirms exo_occ_rpc_definer has USAGE (is_grantable=false) and zero CREATE on public`
      );

      // 5. B5 & B6: Verify BOTH schema auth ACL and table auth.users ACL via aclexplode()
      const authSchemaAclRows = (
        await runnerConn.query(`
          SELECT
            a.grantor::regrole::text AS grantor,
            a.grantee::regrole::text AS grantee,
            a.privilege_type,
            a.is_grantable
          FROM pg_namespace n,
          LATERAL aclexplode(n.nspacl) a
          WHERE n.nspname = 'auth'
        `)
      ).rows;

      const authUsersTableAclRows = (
        await runnerConn.query(`
          SELECT
            a.grantor::regrole::text AS grantor,
            a.grantee::regrole::text AS grantee,
            a.privilege_type,
            a.is_grantable
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace,
          LATERAL aclexplode(c.relacl) a
          WHERE n.nspname = 'auth' AND c.relname = 'users'
        `)
      ).rows;

      const authPrivFlags = (
        await runnerConn.query(`
          SELECT
            has_schema_privilege('exo_occ_rpc_definer', 'auth', 'USAGE') AS definer_auth_usage,
            has_schema_privilege('exo_occ_rpc_definer', 'auth', 'CREATE') AS definer_auth_create,
            has_table_privilege('exo_occ_rpc_definer', 'auth.users', 'SELECT') AS definer_users_select
        `)
      ).rows[0];

      const pgAuthSchemaEntry = authSchemaAclRows.find(
        (r) => r.grantee === 'postgres' && r.privilege_type === 'USAGE'
      );
      const pgAuthUsersEntry = authUsersTableAclRows.find(
        (r) => r.grantee === 'postgres' && r.privilege_type === 'SELECT'
      );
      const definerAuthSchemaEntries = authSchemaAclRows.filter(
        (r) => r.grantee === 'exo_occ_rpc_definer'
      );
      const definerAuthUsersEntries = authUsersTableAclRows.filter(
        (r) => r.grantee === 'exo_occ_rpc_definer'
      );

      assert(
        pgAuthSchemaEntry !== undefined &&
          pgAuthSchemaEntry.is_grantable === false &&
          pgAuthUsersEntry !== undefined &&
          pgAuthUsersEntry.is_grantable === false &&
          definerAuthSchemaEntries.length === 0 &&
          definerAuthUsersEntries.length === 0 &&
          authPrivFlags.definer_auth_usage === false &&
          authPrivFlags.definer_auth_create === false &&
          authPrivFlags.definer_users_select === false,
        `${pathLabel} [B5/B6 Auth Schema & auth.users ACL]: postgres has non-grantable USAGE/SELECT; exo_occ_rpc_definer has 0 ACL entries on auth and auth.users`
      );

      // 6. Verify helper function exo_internal.current_request_uid() catalog metadata & ACLs
      const helperAudit = (
        await runnerConn.query(`
          SELECT
            p.proowner::regrole::text AS func_owner,
            p.prosecdef,
            p.proconfig,
            has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
            has_function_privilege('exo_occ_rpc_definer', p.oid, 'EXECUTE') AS definer_exec,
            has_function_privilege('postgres', p.oid, 'EXECUTE') AS postgres_exec,
            has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'exo_internal' AND p.proname = 'current_request_uid'
        `)
      ).rows[0];
      assert(
        helperAudit &&
          helperAudit.func_owner === 'postgres' &&
          helperAudit.prosecdef === true &&
          Array.isArray(helperAudit.proconfig) &&
          helperAudit.proconfig.some((c) => c === 'search_path=""' || c === 'search_path=') &&
          helperAudit.anon_exec === false &&
          helperAudit.auth_exec === true &&
          helperAudit.definer_exec === true &&
          helperAudit.postgres_exec === true &&
          helperAudit.service_exec === true,
        `${pathLabel} [B6 Helper Function Audit]: exo_internal.current_request_uid() owned by postgres, SECURITY DEFINER, search_path="", anon revoked`
      );

      // 7. Verify RPC function public.sync_workspace_with_concurrency(jsonb, integer) metadata & proconfig
      const rpcAudit = (
        await runnerConn.query(`
          SELECT
            p.proowner::regrole::text AS func_owner,
            p.prosecdef,
            p.proconfig,
            pg_get_functiondef(p.oid) AS fndef,
            has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'sync_workspace_with_concurrency'
        `)
      ).rows[0];
      assert(
        rpcAudit &&
          rpcAudit.func_owner === 'exo_occ_rpc_definer' &&
          rpcAudit.prosecdef === true &&
          Array.isArray(rpcAudit.proconfig) &&
          rpcAudit.proconfig.includes('search_path=pg_catalog, public, exo_internal') &&
          !rpcAudit.proconfig.some((c) => c.includes('auth')) &&
          !/auth\.uid\(\)/i.test(rpcAudit.fndef) &&
          /exo_internal\.current_request_uid\(\)/i.test(rpcAudit.fndef) &&
          rpcAudit.anon_exec === false &&
          rpcAudit.auth_exec === true,
        `${pathLabel} [B6 RPC Function Audit]: sync_workspace_with_concurrency owned by exo_occ_rpc_definer, SECURITY DEFINER, search_path excludes auth, 0 auth.uid() calls`
      );

      // 8. Verify RLS state and policy expressions on public.user_workspaces
      await runnerConn.query(`SET search_path = public, auth, storage, extensions;`);
      const rlsTableState = (
        await runnerConn.query(`
          SELECT c.relrowsecurity, c.relforcerowsecurity
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'user_workspaces'
        `)
      ).rows[0];
      const workspacePolicies = (
        await runnerConn.query(`
          SELECT policyname, cmd, qual, with_check
          FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'user_workspaces'
          ORDER BY policyname
        `)
      ).rows;
      const allPoliciesUseHelper =
        workspacePolicies.length === 3 &&
        workspacePolicies.every(
          (p) =>
            String(p.qual || p.with_check || '').includes('exo_internal.current_request_uid()') &&
            !String(p.qual || '').includes('auth.uid()') &&
            !String(p.with_check || '').includes('auth.uid()')
        );
      const writePoliciesEnforceDefiner = workspacePolicies
        .filter((p) => p.cmd === 'INSERT' || p.cmd === 'UPDATE')
        .every((p) => String(p.with_check || '').includes('exo_occ_rpc_definer'));

      assert(
        rlsTableState.relrowsecurity === true &&
          allPoliciesUseHelper === true &&
          writePoliciesEnforceDefiner === true,
        `${pathLabel} [B6 RLS State & Policies]: relrowsecurity=true, all 3 user_workspaces policies use exo_internal.current_request_uid() and enforce exo_occ_rpc_definer on writes`
      );

      // 9. Verify trigger enabled state (tgenabled = 'O') on public.user_workspaces
      const triggerStates = (
        await runnerConn.query(`
          SELECT t.tgname, t.tgenabled
          FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'user_workspaces' AND NOT t.tgisinternal
          ORDER BY t.tgname
        `)
      ).rows;
      assert(
        triggerStates.length === 4 &&
          triggerStates.every((t) => t.tgenabled === 'O') &&
          triggerStates.map((t) => t.tgname).join(',') ===
            'trg_enforce_workspace_media_security,trg_enforce_workspace_write_via_rpc,trg_protect_vip_status,trg_user_workspaces_updated_at',
        `${pathLabel} [B6 Trigger State]: all 4 security and timestamp triggers on public.user_workspaces are present and enabled (tgenabled='O')`
      );

      // 10. Verify runtime behavior under SET LOCAL ROLE "exo_occ_rpc_definer":
      //     (a) Direct auth.uid() is denied with 42501
      //     (b) exo_internal.current_request_uid() resolves valid claim UUID
      //     (c) exo_internal.current_request_uid() returns NULL when claim is absent
      let directAuthUidErr = null;
      try {
        await runnerConn.query('BEGIN');
        await runnerConn.query('SET LOCAL ROLE "exo_occ_rpc_definer"');
        await runnerConn.query('SELECT auth.uid()');
        await runnerConn.query('COMMIT');
      } catch (err) {
        directAuthUidErr = err;
        await runnerConn.query('ROLLBACK');
      }
      assert(
        directAuthUidErr !== null &&
          directAuthUidErr.code === '42501' &&
          String(directAuthUidErr.message).includes('permission denied for schema auth'),
        `${pathLabel} [B6 Direct auth.uid() Denial]: exo_occ_rpc_definer cannot call auth.uid() directly (SQLSTATE 42501)`
      );

      const testClaimUuid = '11112222-3333-4444-5555-666677778888';
      await runnerConn.query('BEGIN');
      await runnerConn.query('SET LOCAL ROLE "exo_occ_rpc_definer"');
      await runnerConn.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [testClaimUuid]);
      const withClaimRow = (
        await runnerConn.query(`SELECT exo_internal.current_request_uid() AS uid`)
      ).rows[0];
      await runnerConn.query('COMMIT');

      await runnerConn.query('BEGIN');
      await runnerConn.query('SET LOCAL ROLE "exo_occ_rpc_definer"');
      const withoutClaimRow = (
        await runnerConn.query(`SELECT exo_internal.current_request_uid() AS uid`)
      ).rows[0];
      await runnerConn.query('COMMIT');

      assert(
        withClaimRow.uid === testClaimUuid && withoutClaimRow.uid === null,
        `${pathLabel} [B6 Helper Runtime Behavior]: exo_internal.current_request_uid() under exo_occ_rpc_definer resolves valid claim UUID and returns NULL without claim`
      );

      // 11. Verify end-to-end OCC RPC create (rev 1), update (rev 2), stale conflict, and direct DML block
      const testUserUuid =
        seedEmailPrefix === 'path_a'
          ? 'aaaaaaaa-aaaa-4444-8888-111111111111'
          : 'bbbbbbbb-bbbb-4444-8888-222222222222';

      // Insert test user into auth.users using a temporary superuser query on the target database
      // (since auth.users is owned by supabase_auth_admin and postgres only has SELECT on auth.users)
      const seedAuthConn = new Client({
        connectionString: getDbUrl(
          seedEmailPrefix === 'path_a' ? 'exo_pg16_path_a_fresh' : 'exo_pg16_path_b_upgrade',
          BOOTSTRAP_ADMIN_USER,
          BOOTSTRAP_ADMIN_PASS
        )
      });
      await seedAuthConn.connect();
      await seedAuthConn.query(
        `INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
        [testUserUuid, `${seedEmailPrefix}.audit@exo.edu`]
      );
      await safeCloseClient(seedAuthConn);

      await runnerConn.query('BEGIN');
      await runnerConn.query('SET LOCAL ROLE authenticated');
      await runnerConn.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
      await runnerConn.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [testUserUuid]);
      const rpcCreate = (
        await runnerConn.query(`SELECT public.sync_workspace_with_concurrency($1::jsonb, NULL) AS res`, [
          JSON.stringify({ subjects: [{ id: 'sub_1', name: 'Initial Subject' }] })
        ])
      ).rows[0].res;
      await runnerConn.query('COMMIT');

      await runnerConn.query('BEGIN');
      await runnerConn.query('SET LOCAL ROLE authenticated');
      await runnerConn.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
      await runnerConn.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [testUserUuid]);
      const rpcUpdate = (
        await runnerConn.query(`SELECT public.sync_workspace_with_concurrency($1::jsonb, 1) AS res`, [
          JSON.stringify({ subjects: [{ id: 'sub_1', name: 'Updated Subject' }] })
        ])
      ).rows[0].res;
      const rpcConflict = (
        await runnerConn.query(`SELECT public.sync_workspace_with_concurrency($1::jsonb, 1) AS res`, [
          JSON.stringify({ subjects: [{ id: 'sub_stale', name: 'Stale Subject' }] })
        ])
      ).rows[0].res;
      await runnerConn.query('COMMIT');

      let directUpdateErr = null;
      try {
        await runnerConn.query('BEGIN');
        await runnerConn.query('SET LOCAL ROLE authenticated');
        await runnerConn.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
        await runnerConn.query(`SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)`, [testUserUuid]);
        await runnerConn.query(`UPDATE public.user_workspaces SET revision = 99 WHERE user_id = $1`, [
          testUserUuid
        ]);
        await runnerConn.query('COMMIT');
      } catch (err) {
        directUpdateErr = err;
        await runnerConn.query('ROLLBACK');
      }

      // Clean up the test workspace row and auth.users row so catalog/data comparisons remain clean
      const cleanSeedConn = new Client({
        connectionString: getDbUrl(
          seedEmailPrefix === 'path_a' ? 'exo_pg16_path_a_fresh' : 'exo_pg16_path_b_upgrade',
          BOOTSTRAP_ADMIN_USER,
          BOOTSTRAP_ADMIN_PASS
        )
      });
      await cleanSeedConn.connect();
      await cleanSeedConn.query(`DELETE FROM auth.users WHERE id = $1`, [testUserUuid]);
      await safeCloseClient(cleanSeedConn);

      assert(
        rpcCreate.status === 'success' &&
          rpcCreate.revision === 1 &&
          rpcUpdate.status === 'success' &&
          rpcUpdate.revision === 2 &&
          rpcConflict.status === 'conflict' &&
          rpcConflict.current_revision === 2 &&
          directUpdateErr !== null &&
          directUpdateErr.code === '42501',
        `${pathLabel} [B6 End-to-End OCC & Bypass Protection]: create (rev 1), update (rev 2), stale conflict (rev 2), and direct UPDATE denial (42501) verified`
      );
    }

    // ------------------------------------------------------------------------
    // 8.3 Path A (Fresh Install): Clean Sequential Execution Under Non-Superuser postgres
    // ------------------------------------------------------------------------
    console.log('\n  [Section 8.3] Path A (Fresh Install): Clean Sequential Execution Under Non-Superuser postgres');
    pathABootstrap = await provisionHostedDatabaseBootstrap('exo_pg16_path_a_fresh');
    await safeCloseClient(pathABootstrap);
    pathABootstrap = null;

    pathARunner = new Client({
      connectionString: getDbUrl('exo_pg16_path_a_fresh', RUNNER_POSTGRES_USER, RUNNER_POSTGRES_PASS)
    });
    await pathARunner.connect();

    const capturedWarningsPathA = [];
    pathARunner.on('notice', (msg) => {
      if (msg && msg.message) {
        capturedWarningsPathA.push(msg.message);
      }
    });

    // Execute migration 150000 and forward migration 160000 sequentially under non-superuser postgres
    await pathARunner.query(phase422ForwardMigrationSql);
    await pathARunner.query(phase424ForwardMigrationSql);

    // B5 Fix: Assert on capturedWarnings from migration 150000 when postgres lacks WITH GRANT OPTION on auth / auth.users
    const emittedNoPrivWarning = capturedWarningsPathA.some((w) =>
      /no privileges were granted/i.test(w)
    );
    assert(
      Array.isArray(capturedWarningsPathA) && emittedNoPrivWarning === true,
      `B5 Warning Audit (Path A): captured ${capturedWarningsPathA.length} PostgreSQL notice(s) including "no privileges were granted" when non-grantable auth GRANTs in 150000 ran under non-superuser postgres`
    );

    // Run full independent security audit on Path A
    await runFullHostedPostMigrationAudit(pathARunner, 'Path A (Fresh Install)', 'path_a');

    // ------------------------------------------------------------------------
    // 8.4 Path B (Existing Upgrade): Documented Pre-Upgrade Phase 4.2.3 Snapshot
    //                                Upgraded via Forward Migration 160000 Only
    // ------------------------------------------------------------------------
    // Historical Limitation & Snapshot Rationale:
    //   The original unedited `20261103150000_unforgeable_occ_and_role_hardening.sql` (commit e30fcc2,
    //   blob 45336261940287c723a1433d14d8f454b9e7655f) omitted `GRANT CREATE ON SCHEMA "public" TO "exo_occ_rpc_definer"`
    //   prior to `ALTER FUNCTION ... OWNER TO "exo_occ_rpc_definer"`. As proven in Section 8.1 above,
    //   once `20261103140000` revokes PUBLIC CREATE on `public`, that unedited `150000` script cannot
    //   complete under a non-superuser `postgres` role (it fails at line 316 with SQLSTATE 42501); in
    //   Phase 4.2.3 (`e30fcc2`), it only succeeded in tests because `postgres` had `SUPERUSER`.
    //   Therefore, rather than injecting an ad-hoc `GRANT CREATE` around the unedited `150000` file and
    //   claiming a non-superuser historical replay, `provisionPhase423PreUpgradeSnapshot` constructs a
    //   documented, independently reproducible pre-upgrade catalog snapshot representing an existing
    //   database after Phase 4.2.3 (`133622`, `140000`, and `150000` recorded in `schema_migrations`,
    //   with `sync_workspace_with_concurrency` owned by `exo_occ_rpc_definer` and still referencing
    //   `auth.uid()`, and `exo_occ_rpc_definer` lacking `auth` schema USAGE in Hosted Supabase).
    //   Then `pathBRunner` (non-superuser `postgres`) applies ONLY `20261103160000_hosted_supabase_auth_compat.sql`.
    console.log('\n  [Section 8.4] Path B (Existing Upgrade): Documented Pre-Upgrade Phase 4.2.3 Snapshot Upgraded via Forward Migration 160000');
    pathBBootstrap = await provisionHostedDatabaseBootstrap('exo_pg16_path_b_upgrade');

    const PHASE_4_2_3_PRE_UPGRADE_SNAPSHOT_SQL = `
      INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
        ('20261103133622', 'remote_schema'),
        ('20261103140000', 'fix_security_and_privileges'),
        ('20261103150000', 'unforgeable_occ_and_role_hardening')
      ON CONFLICT (version) DO NOTHING;

      REVOKE "exo_occ_rpc_definer" FROM "anon", "authenticated";
      GRANT "exo_occ_rpc_definer" TO "postgres";

      CREATE SCHEMA IF NOT EXISTS "exo_internal" AUTHORIZATION "postgres";
      REVOKE ALL ON SCHEMA "exo_internal" FROM PUBLIC, "anon", "authenticated";
      GRANT USAGE ON SCHEMA "exo_internal" TO "postgres", "service_role", "exo_occ_rpc_definer";

      CREATE TABLE IF NOT EXISTS "exo_internal"."occ_active_write_context" (
        "txid" xid8 NOT NULL,
        "user_id" uuid NOT NULL,
        "write_op" text NOT NULL,
        CONSTRAINT "occ_active_write_context_pkey" PRIMARY KEY ("txid", "user_id"),
        CONSTRAINT "occ_active_write_context_op_check" CHECK ("write_op" IN ('INSERT', 'UPDATE'))
      );

      ALTER TABLE "exo_internal"."occ_active_write_context" OWNER TO "postgres";
      ALTER TABLE "exo_internal"."occ_active_write_context" ENABLE ROW LEVEL SECURITY;

      REVOKE ALL ON TABLE "exo_internal"."occ_active_write_context" FROM PUBLIC, "anon", "authenticated";
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "exo_internal"."occ_active_write_context" TO "postgres", "service_role", "exo_occ_rpc_definer";

      DROP POLICY IF EXISTS "occ_rpc_definer_manage_write_context" ON "exo_internal"."occ_active_write_context";
      CREATE POLICY "occ_rpc_definer_manage_write_context" ON "exo_internal"."occ_active_write_context"
        FOR ALL
        TO "postgres", "service_role", "exo_occ_rpc_definer"
        USING (true)
        WITH CHECK (true);

      GRANT USAGE ON SCHEMA "public" TO "exo_occ_rpc_definer";
      REVOKE ALL ON TABLE "public"."user_workspaces" FROM "exo_occ_rpc_definer";
      GRANT SELECT, INSERT, UPDATE ON TABLE "public"."user_workspaces" TO "exo_occ_rpc_definer";

      ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" REVOKE ALL ON TABLES FROM PUBLIC, "anon", "authenticated";
      ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" REVOKE ALL ON SEQUENCES FROM PUBLIC, "anon", "authenticated";
      ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated";
      ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" IN SCHEMA "public" REVOKE ALL ON TABLES FROM PUBLIC, "anon", "authenticated";
      ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM PUBLIC, "anon", "authenticated";
      ALTER DEFAULT PRIVILEGES FOR ROLE "exo_occ_rpc_definer" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated";

      DROP POLICY IF EXISTS "Users can view own workspace" ON "public"."user_workspaces";
      CREATE POLICY "Users can view own workspace" ON "public"."user_workspaces"
        FOR SELECT
        TO "authenticated", "exo_occ_rpc_definer"
        USING ((auth.uid() = user_id));

      DROP POLICY IF EXISTS "Users can insert own workspace" ON "public"."user_workspaces";
      CREATE POLICY "Users can insert own workspace" ON "public"."user_workspaces"
        FOR INSERT
        TO "authenticated", "exo_occ_rpc_definer"
        WITH CHECK (
          (auth.uid() = user_id)
          AND (CURRENT_USER = 'exo_occ_rpc_definer'::name)
        );

      DROP POLICY IF EXISTS "Users can update own workspace" ON "public"."user_workspaces";
      CREATE POLICY "Users can update own workspace" ON "public"."user_workspaces"
        FOR UPDATE
        TO "authenticated", "exo_occ_rpc_definer"
        USING ((auth.uid() = user_id))
        WITH CHECK (
          (auth.uid() = user_id)
          AND (CURRENT_USER = 'exo_occ_rpc_definer'::name)
        );

      GRANT EXECUTE ON FUNCTION public.handle_user_workspace_updated_at() TO "exo_occ_rpc_definer";

CREATE OR REPLACE FUNCTION public.enforce_workspace_write_via_rpc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, exo_internal
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM exo_internal.occ_active_write_context c
    WHERE c.txid = pg_catalog.pg_current_xact_id()
      AND c.user_id = NEW.user_id
      AND c.write_op = TG_OP
  ) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL
     OR pg_catalog.current_setting('request.jwt.claim.role', true) IN ('anon', 'authenticated')
     OR current_user IN ('anon', 'authenticated')
     OR session_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'OCC_BYPASS_FORBIDDEN: Direct INSERT or UPDATE on public.user_workspaces is prohibited; use sync_workspace_with_concurrency(p_payload, p_expected_revision)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

      ALTER FUNCTION public.enforce_workspace_write_via_rpc() OWNER TO "postgres";
      REVOKE ALL ON FUNCTION public.enforce_workspace_write_via_rpc() FROM PUBLIC, "anon", "authenticated";
      GRANT EXECUTE ON FUNCTION public.enforce_workspace_write_via_rpc() TO "postgres", "service_role", "exo_occ_rpc_definer";

      DROP TRIGGER IF EXISTS trg_enforce_workspace_write_via_rpc ON public.user_workspaces;
      CREATE TRIGGER trg_enforce_workspace_write_via_rpc
        BEFORE INSERT OR UPDATE ON public.user_workspaces
        FOR EACH ROW
        EXECUTE FUNCTION public.enforce_workspace_write_via_rpc();

      CREATE OR REPLACE FUNCTION public.sync_workspace_with_concurrency(
        p_payload jsonb,
        p_expected_revision integer DEFAULT NULL
      )
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public, auth, exo_internal
      AS $$
      DECLARE
        v_uid uuid := auth.uid();
      BEGIN
        IF v_uid IS NULL THEN
          RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
        END IF;
        RETURN jsonb_build_object('status', 'legacy_phase_4_2_3');
      END;
      $$;
    `;

    // Construct the Phase 4.2.3 pre-upgrade objects under postgres, then transfer RPC ownership via
    // bootstrap superuser (reflecting Phase 4.2.3's superuser ownership transfer without granting CREATE on public)
    await pathBBootstrap.query('BEGIN');
    await pathBBootstrap.query('SET LOCAL ROLE postgres');
    await pathBBootstrap.query(PHASE_4_2_3_PRE_UPGRADE_SNAPSHOT_SQL);
    await pathBBootstrap.query('RESET ROLE');
    await pathBBootstrap.query(
      'ALTER FUNCTION public.sync_workspace_with_concurrency(jsonb, integer) OWNER TO "exo_occ_rpc_definer";'
    );
    await pathBBootstrap.query('SET LOCAL ROLE postgres');
    await pathBBootstrap.query(`
      REVOKE ALL ON FUNCTION public.sync_workspace_with_concurrency(jsonb, integer) FROM PUBLIC, "anon";
      GRANT EXECUTE ON FUNCTION public.sync_workspace_with_concurrency(jsonb, integer) TO "authenticated", "service_role", "postgres", "exo_occ_rpc_definer";
    `);
    await pathBBootstrap.query('COMMIT');

    // Verify pre-upgrade Phase 4.2.3 snapshot invariants before closing pathBBootstrap
    const preUpgradePathBState = (
      await pathBBootstrap.query(`
        SELECT
          p.proowner::regrole::text AS rpc_owner,
          p.proconfig::text AS rpc_proconfig,
          pg_get_functiondef(p.oid) AS rpc_def,
          (
            SELECT count(*)::int
            FROM pg_proc hp
            JOIN pg_namespace hn ON hn.oid = hp.pronamespace
            WHERE hn.nspname = 'exo_internal' AND hp.proname = 'current_request_uid'
          ) AS helper_count
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sync_workspace_with_concurrency'
      `)
    ).rows[0];

    await safeCloseClient(pathBBootstrap);
    pathBBootstrap = null;

    assert(
      preUpgradePathBState.rpc_owner === 'exo_occ_rpc_definer' &&
        preUpgradePathBState.rpc_proconfig.includes('auth') &&
        /auth\.uid\(\)/i.test(preUpgradePathBState.rpc_def) &&
        preUpgradePathBState.helper_count === 0,
      'Path B Pre-Upgrade Snapshot Verified: Phase 4.2.3 state has sync_workspace_with_concurrency owned by exo_occ_rpc_definer calling auth.uid() directly, and 0 exo_internal.current_request_uid() helper'
    );

    // Connect as non-superuser postgres migration runner and apply ONLY forward migration 160000
    pathBRunner = new Client({
      connectionString: getDbUrl('exo_pg16_path_b_upgrade', RUNNER_POSTGRES_USER, RUNNER_POSTGRES_PASS)
    });
    await pathBRunner.connect();

    // Prove that before 160000 is applied on Path B, calling the Phase 4.2.3 RPC as authenticated fails with 42501 (permission denied for schema auth)
    let preUpgradeRpcErr = null;
    try {
      await pathBRunner.query('BEGIN');
      await pathBRunner.query('SET LOCAL ROLE authenticated');
      await pathBRunner.query(`SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)`);
      await pathBRunner.query(
        `SELECT pg_catalog.set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4444-8888-222222222222', true)`
      );
      await pathBRunner.query(`SELECT public.sync_workspace_with_concurrency('{}'::jsonb, NULL)`);
      await pathBRunner.query('COMMIT');
    } catch (err) {
      preUpgradeRpcErr = err;
      await pathBRunner.query('ROLLBACK');
    }
    assert(
      preUpgradeRpcErr !== null &&
        preUpgradeRpcErr.code === '42501' &&
        String(preUpgradeRpcErr.message).includes('permission denied for schema auth'),
      'Path B Pre-Upgrade Failure Reproduced: Phase 4.2.3 RPC fails with SQLSTATE 42501 (permission denied for schema auth) in Hosted Supabase before applying 160000'
    );

    await pathBRunner.query(phase424ForwardMigrationSql);
    await pathBRunner.query(`
      INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES ('20261103160000', 'hosted_supabase_auth_compat')
      ON CONFLICT (version) DO NOTHING;
    `);

    const recordedMigrations = (
      await pathBRunner.query(`
        SELECT version FROM supabase_migrations.schema_migrations ORDER BY version
      `)
    ).rows.map((r) => r.version);
    assert(
      JSON.stringify(recordedMigrations) ===
        JSON.stringify(['20261103133622', '20261103140000', '20261103150000', '20261103160000']),
      'Path B Migration History: existing database with pre-recorded 150000 upgrades cleanly by applying only forward migration 160000'
    );

    // B6 Fix: Run the exact same full security audit independently on Path B!
    await runFullHostedPostMigrationAudit(pathBRunner, 'Path B (Existing Upgrade)', 'path_b');

    // ------------------------------------------------------------------------
    // 8.5 B2 & B7 Fix: Full 10-Surface Catalog Parity Between Path A and Path B
    //                  While Both pathARunner and pathBRunner Remain Open
    // ------------------------------------------------------------------------
    console.log('\n  [Section 8.5] Full 10-Surface Catalog Parity Between Hosted Path A and Path B');
    await pathARunner.query(`SET search_path = public, auth, storage, extensions;`);
    await pathBRunner.query(`SET search_path = public, auth, storage, extensions;`);

    const s8ColsA = (await pathARunner.query(colsQuery)).rows;
    const s8ColsB = (await pathBRunner.query(colsQuery)).rows;
    const s8ConstraintsA = (await pathARunner.query(constraintsQuery)).rows;
    const s8ConstraintsB = (await pathBRunner.query(constraintsQuery)).rows;
    const s8IndexesA = (await pathARunner.query(indexesQuery)).rows;
    const s8IndexesB = (await pathBRunner.query(indexesQuery)).rows;
    const s8RlsA = (await pathARunner.query(rlsQuery)).rows;
    const s8RlsB = (await pathBRunner.query(rlsQuery)).rows;
    const s8TriggersA = (await pathARunner.query(triggersQuery)).rows;
    const s8TriggersB = (await pathBRunner.query(triggersQuery)).rows;
    const s8EvtA = (await pathARunner.query(evtTriggersQuery)).rows;
    const s8EvtB = (await pathBRunner.query(evtTriggersQuery)).rows;
    const s8FuncsA = (await pathARunner.query(funcsQuery)).rows;
    const s8FuncsB = (await pathBRunner.query(funcsQuery)).rows;
    const s8TableAclA = (await pathARunner.query(tableAclQuery)).rows;
    const s8TableAclB = (await pathBRunner.query(tableAclQuery)).rows;
    const s8DefAclA = (await pathARunner.query(defAclQuery)).rows;
    const s8DefAclB = (await pathBRunner.query(defAclQuery)).rows;
    const s8BucketA = (await pathARunner.query(bucketQuery)).rows;
    const s8BucketB = (await pathBRunner.query(bucketQuery)).rows;
    const s8InternalA = (await pathARunner.query(internalCtxQuery)).rows;
    const s8InternalB = (await pathBRunner.query(internalCtxQuery)).rows;

    const tenSurfaceParityMatches =
      JSON.stringify(s8ColsA) === JSON.stringify(s8ColsB) &&
      JSON.stringify(s8ConstraintsA) === JSON.stringify(s8ConstraintsB) &&
      JSON.stringify(s8IndexesA) === JSON.stringify(s8IndexesB) &&
      JSON.stringify(s8RlsA) === JSON.stringify(s8RlsB) &&
      JSON.stringify(s8TriggersA) === JSON.stringify(s8TriggersB) &&
      JSON.stringify(s8EvtA) === JSON.stringify(s8EvtB) &&
      JSON.stringify(s8FuncsA) === JSON.stringify(s8FuncsB) &&
      JSON.stringify(s8TableAclA) === JSON.stringify(s8TableAclB) &&
      JSON.stringify(s8DefAclA) === JSON.stringify(s8DefAclB) &&
      JSON.stringify(s8BucketA) === JSON.stringify(s8BucketB) &&
      JSON.stringify(s8InternalA) === JSON.stringify(s8InternalB);

    assert(
      tenSurfaceParityMatches === true,
      'B2 & B7 Hosted Dual-Path 10-Surface Catalog Parity: Path A (Fresh Install) and Path B (Existing Upgrade) are 100% identical across all 10 catalog dimensions (columns, constraints, indexes, 7 RLS policies, 4 triggers, event trigger, 7 functions, table ACLs, default ACLs, storage & internal write-context)'
    );
  } finally {
    // B2 & B4 Fix: Close all inner connections safely and perform verified catalog + ephemeral cluster cleanup
    await safeCloseClient(scratchRunner);
    await safeCloseClient(scratchBootstrap);
    await safeCloseClient(pathARunner);
    await safeCloseClient(pathABootstrap);
    await safeCloseClient(pathBRunner);
    await safeCloseClient(pathBBootstrap);
    await safeCloseClient(initialSuperConn);

    const cleanupErrors = [];
    let cleanupVerifyResult = null;

    try {
      if (!bootstrapAdminConn) {
        try {
          bootstrapAdminConn = new Client({
            connectionString: getDbUrl('postgres', BOOTSTRAP_ADMIN_USER, BOOTSTRAP_ADMIN_PASS)
          });
          await bootstrapAdminConn.connect();
        } catch (_) {
          await safeCloseClient(bootstrapAdminConn);
          bootstrapAdminConn = new Client({
            connectionString: getDbUrl('postgres', 'postgres', 'postgres')
          });
          await bootstrapAdminConn.connect();
        }
      }

      const dbsToDrop = [
        'exo_pg16_scratch_experiment',
        'exo_pg16_path_a_fresh',
        'exo_pg16_path_b_upgrade',
        'exo_pg16_hosted_supabase_fixture',
        'exo_pg16_fresh_install',
        'exo_pg16_existing_upgrade',
        'exo_pg16_fresh_schema'
      ];

      for (const dbName of dbsToDrop) {
        try {
          await bootstrapAdminConn.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`);
        } catch (err) {
          cleanupErrors.push(`Failed dropping database ${dbName}: ${err.message}`);
        }
      }

      // Restore all postgres role attributes and original password before dropping temporary roles
      try {
        await bootstrapAdminConn.query(
          `ALTER ROLE postgres WITH SUPERUSER INHERIT CREATEDB CREATEROLE LOGIN NOREPLICATION NOBYPASSRLS PASSWORD 'postgres';`
        );
      } catch (err) {
        cleanupErrors.push(`Failed restoring postgres role: ${err.message}`);
      }

      const rolesToDrop = [
        'exo_scratch_probe_definer',
        'exo_occ_rpc_definer',
        'supabase_auth_admin',
        'anon',
        'authenticated',
        'service_role'
      ];

      for (const roleName of rolesToDrop) {
        try {
          await bootstrapAdminConn.query(`
            DO $$
            BEGIN
              IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN
                EXECUTE 'REASSIGN OWNED BY ${roleName} TO postgres';
                EXECUTE 'DROP OWNED BY ${roleName}';
                EXECUTE 'DROP ROLE ${roleName}';
              END IF;
            END
            $$;
          `);
        } catch (err) {
          cleanupErrors.push(`Failed dropping role ${roleName}: ${err.message}`);
        }
      }

      // B4 Catalog Verification: Query pg_database and all relevant pg_roles attributes to prove cleanup succeeded
      const remainingTestDbs = (
        await bootstrapAdminConn.query(`
          SELECT datname FROM pg_database WHERE datname LIKE 'exo_pg16_%' ORDER BY datname
        `)
      ).rows.map((r) => r.datname);

      const remainingTempRoles = (
        await bootstrapAdminConn.query(`
          SELECT rolname FROM pg_roles
          WHERE rolname IN (
            'exo_scratch_probe_definer',
            'exo_occ_rpc_definer',
            'supabase_auth_admin',
            'anon',
            'authenticated',
            'service_role'
          )
          ORDER BY rolname
        `)
      ).rows.map((r) => r.rolname);

      const postgresRestored = (
        await bootstrapAdminConn.query(`
          SELECT
            rolname,
            rolsuper,
            rolinherit,
            rolcreaterole,
            rolcreatedb,
            rolcanlogin,
            rolreplication,
            rolbypassrls,
            oid::int AS role_oid
          FROM pg_roles
          WHERE rolname = 'postgres'
        `)
      ).rows[0];

      const supabaseAdminRow = (
        await bootstrapAdminConn.query(`
          SELECT rolsuper, oid::int AS role_oid FROM pg_roles WHERE rolname = 'supabase_admin'
        `)
      ).rows[0];

      cleanupVerifyResult = {
        remainingTestDbs,
        remainingTempRoles,
        postgresRestored,
        supabaseAdminRow
      };
    } catch (err) {
      cleanupErrors.push(`Cleanup verification connection error: ${err.message}`);
    } finally {
      await safeCloseClient(bootstrapAdminConn);
      bootstrapAdminConn = null;
    }

    // If supabase_admin was not the initdb bootstrap superuser (OID 10), drop it via restored postgres superuser
    if (
      cleanupVerifyResult &&
      cleanupVerifyResult.supabaseAdminRow &&
      cleanupVerifyResult.supabaseAdminRow.role_oid !== 10
    ) {
      let finalPostgresConn = null;
      try {
        finalPostgresConn = new Client({
          connectionString: getDbUrl('postgres', 'postgres', 'postgres')
        });
        await finalPostgresConn.connect();
        await finalPostgresConn.query(`
          DO $$
          BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin' AND oid <> 10) THEN
              REASSIGN OWNED BY supabase_admin TO postgres;
              DROP OWNED BY supabase_admin;
              DROP ROLE supabase_admin;
            END IF;
          END
          $$;
        `);
      } catch (err) {
        cleanupErrors.push(`Failed dropping non-bootstrap supabase_admin role: ${err.message}`);
      } finally {
        await safeCloseClient(finalPostgresConn);
      }
    }

    const pr = cleanupVerifyResult && cleanupVerifyResult.postgresRestored;
    const allPostgresAttrsRestored =
      Boolean(pr) &&
      pr.rolsuper === true &&
      pr.rolinherit === true &&
      pr.rolcreaterole === true &&
      pr.rolcreatedb === true &&
      pr.rolcanlogin === true &&
      pr.rolreplication === false &&
      pr.rolbypassrls === false;

    const ephemeralTeardown = teardownEphemeralPostgres16Cluster();
    if (ephemeralTeardown.errors.length > 0) {
      cleanupErrors.push(...ephemeralTeardown.errors);
    }

    assert(
      cleanupErrors.length === 0 &&
        cleanupVerifyResult !== null &&
        cleanupVerifyResult.remainingTestDbs.length === 0 &&
        cleanupVerifyResult.remainingTempRoles.length === 0 &&
        allPostgresAttrsRestored === true &&
        ephemeralTeardown.stopped === true &&
        ephemeralTeardown.dirRemoved === true &&
        ephemeralTeardown.directoryPreserved === false,
      'B4 Catalog & Ephemeral Cluster Cleanup Integrity: all 7 exo_pg16_* databases and all 6 temporary roles removed from catalogs, all 7 postgres role attributes restored (rolsuper=true, rolinherit=true, rolcreaterole=true, rolcreatedb=true, rolcanlogin=true, rolreplication=false, rolbypassrls=false), and ephemeral cluster confirmed stopped before owned data_dir removal',
      cleanupErrors.join('; ') || JSON.stringify({ cleanupVerifyResult, ephemeralTeardown })
    );
  }

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
  const td = teardownEphemeralPostgres16Cluster();
  if (td && (td.errors.length > 0 || !td.stopped || !td.dirRemoved)) {
    console.error(
      `Ephemeral cluster teardown failed (stopped=${td.stopped}, dirRemoved=${td.dirRemoved}, directoryPreserved=${td.directoryPreserved}, baseDir=${td.baseDir}):`,
      td.errors
    );
  }
  console.error('Fatal error in test_phase4_2_1_pg16_concurrency.js:', err);
  process.exit(1);
});

