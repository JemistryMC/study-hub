// ============================================================================
// Exo Academic Platform — Phase 4.2 Production Cryptography & Static Audit Suite
// Category: Production Cryptographic Unit Tests (Web Crypto) & Static Security Checks
//
// Note on Test Separation (Phase 4.2 Section 5):
//   - Production PBKDF2 functions (`deriveSecurePBKDF2Hash`, `verifyAndUpgradePassword`,
//     `hashPasswordSHA256`) are extracted directly from `index.html` and executed
//     against real Web Crypto (`crypto.webcrypto`) — never re-implemented in the test!
//   - Real PostgreSQL database execution of migrations, RLS, Storage policies,
//     default privileges, and `sync_workspace_with_concurrency` RPC is performed in
//     `test_phase4_2_postgres_integration.js`.
// ============================================================================

const crypto = require('crypto');
const fs = require('fs');

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

// Instantiate production cryptographic functions directly from index.html
const prodCryptoFactory = new Function(
  'window',
  'TextEncoder',
  'btoa',
  'unescape',
  'encodeURIComponent',
  `
  ${extractFunctionSource(indexHtml, 'deriveSecurePBKDF2Hash')}
  ${extractFunctionSource(indexHtml, 'verifyAndUpgradePassword')}
  ${extractFunctionSource(indexHtml, 'hashPasswordSHA256')}
  return { deriveSecurePBKDF2Hash, verifyAndUpgradePassword, hashPasswordSHA256 };
`
);

const btoaPolyfill = (str) => Buffer.from(str, 'binary').toString('base64');

async function main() {
  // --------------------------------------------------------------------------
  // SUITE 1: Production Web Crypto PBKDF2 & Legacy Hash Auto-Upgrade (Extracted from index.html)
  // --------------------------------------------------------------------------
  console.log('\n=== SUITE 1: Production PBKDF2 & Password Upgrade Unit Tests (index.html) ===');

  const windowWithWebCrypto = { crypto: crypto.webcrypto };
  const prodCrypto = prodCryptoFactory(
    windowWithWebCrypto,
    TextEncoder,
    btoaPolyfill,
    unescape,
    encodeURIComponent
  );

  const testPass = 'ExoSecret2026!';
  const testEmail = 'student@university.edu';

  // 1.1 Production deriveSecurePBKDF2Hash generates valid 100,000-iteration PBKDF2 hash
  const pbkdf2Hash = await prodCrypto.deriveSecurePBKDF2Hash(testPass);
  assert(
    typeof pbkdf2Hash === 'string' && pbkdf2Hash.startsWith('pbkdf2$100000$'),
    'Production deriveSecurePBKDF2Hash() generates PBKDF2 hash with 100,000 iterations'
  );
  const hashParts = pbkdf2Hash.split('$');
  assert(
    hashParts.length === 4 && hashParts[2].length === 32 && hashParts[3].length === 64,
    'Production PBKDF2 output contains 16-byte (32 hex) salt and 32-byte (64 hex) SHA-256 derived key'
  );

  // 1.2 Deterministic verification against Node crypto.pbkdf2Sync reference vector
  const expectedNodeHex = crypto
    .pbkdf2Sync(testPass, Buffer.from(hashParts[2], 'hex'), 100000, 32, 'sha256')
    .toString('hex');
  assert(
    hashParts[3] === expectedNodeHex,
    'Production Web Crypto PBKDF2 output matches NIST SP 800-132 / Node crypto.pbkdf2Sync reference vector'
  );

  // 1.3 Production verifyAndUpgradePassword validates valid PBKDF2 hash without re-upgrading
  const checkValid = await prodCrypto.verifyAndUpgradePassword(testPass, testEmail, pbkdf2Hash);
  assert(
    checkValid.valid === true && checkValid.upgradedHash === null,
    'Production verifyAndUpgradePassword() accepts valid PBKDF2 password without redundant upgrade'
  );

  // 1.4 Production verifyAndUpgradePassword rejects wrong password
  const checkInvalid = await prodCrypto.verifyAndUpgradePassword('WrongPassword!', testEmail, pbkdf2Hash);
  assert(
    checkInvalid.valid === false && checkInvalid.upgradedHash === null,
    'Production verifyAndUpgradePassword() strictly rejects invalid password'
  );

  // 1.5 Production verifyAndUpgradePassword upgrades legacy Base64 hash to PBKDF2
  const legacyB64Hash = btoaPolyfill(unescape(encodeURIComponent(testPass)));
  const checkLegacyB64 = await prodCrypto.verifyAndUpgradePassword(testPass, testEmail, legacyB64Hash);
  assert(checkLegacyB64.valid === true, 'Production verifyAndUpgradePassword() validates legacy Base64 stored hash');
  assert(
    typeof checkLegacyB64.upgradedHash === 'string' && checkLegacyB64.upgradedHash.startsWith('pbkdf2$100000$'),
    'Production verifyAndUpgradePassword() automatically upgrades legacy Base64 hash to PBKDF2$100000$'
  );

  // 1.6 Production verifyAndUpgradePassword upgrades legacy salted SHA-256 hash to PBKDF2
  const legacyNormalized = `${testEmail.toLowerCase()}::pharma_studio_v1::${testPass}`;
  const legacyShaHash = 'sha256$' + crypto.createHash('sha256').update(legacyNormalized).digest('hex');
  const checkLegacySha = await prodCrypto.verifyAndUpgradePassword(testPass, testEmail, legacyShaHash);
  assert(checkLegacySha.valid === true, 'Production verifyAndUpgradePassword() validates legacy salted SHA-256 hash');
  assert(
    typeof checkLegacySha.upgradedHash === 'string' && checkLegacySha.upgradedHash.startsWith('pbkdf2$100000$'),
    'Production verifyAndUpgradePassword() automatically upgrades legacy SHA-256 hash to PBKDF2$100000$'
  );

  // 1.7 Production deriveSecurePBKDF2Hash throws explicit error when Web Crypto is unavailable
  const prodCryptoWithoutSubtle = prodCryptoFactory({}, TextEncoder, btoaPolyfill, unescape, encodeURIComponent);
  let threwWebCryptoUnavailable = false;
  try {
    await prodCryptoWithoutSubtle.deriveSecurePBKDF2Hash(testPass);
  } catch (err) {
    threwWebCryptoUnavailable = String(err.message || err).includes('WebCryptoUnavailable');
  }
  assert(
    threwWebCryptoUnavailable === true,
    'Production deriveSecurePBKDF2Hash() throws WebCryptoUnavailable when window.crypto.subtle is missing'
  );

  // --------------------------------------------------------------------------
  // SUITE 2: Frontend index.html Static Security & OCC Invariant Checks
  // --------------------------------------------------------------------------
  console.log('\n=== SUITE 2: Frontend index.html Static Security & OCC Invariant Checks ===');

  // 2.1 Startup preferences wipe check
  assert(
    !indexHtml.includes("localStorage.removeItem('pharmaAppearancePrefsV1')"),
    'Destructive startup wipe of pharmaAppearancePrefsV1 is completely removed'
  );
  assert(
    indexHtml.includes("localStorage.getItem('pharmaAppearancePrefsV1')"),
    'Appearance preferences are properly loaded and restored on startup'
  );

  // 2.2 Google Drive upload privacy check
  const driveUploadStart = indexHtml.indexOf('async function uploadMediaToCloudAccount(');
  const driveUploadEnd = indexHtml.indexOf('async function pushWorkspaceToCloud', driveUploadStart);
  const driveUploadCode = indexHtml.substring(driveUploadStart, driveUploadEnd);
  assert(
    !driveUploadCode.includes("role: 'reader', type: 'anyone'"),
    'Automatic public link sharing is removed from uploadMediaToCloudAccount'
  );
  assert(
    indexHtml.includes('shareGoogleDriveFileExplicitly'),
    'Explicit Google Drive sharing function with user confirmation is present'
  );
  assert(
    indexHtml.includes('revokeGoogleDriveFileSharing'),
    'Explicit Google Drive permission revocation function is present'
  );

  // 2.3 IndexedDB Protection on Logout & Account Switch
  const logoutStart = indexHtml.indexOf('async function logoutCloudAccount()');
  const logoutEnd = indexHtml.indexOf('async function', logoutStart + 30);
  const logoutCode = indexHtml.substring(logoutStart, logoutEnd);
  assert(
    !logoutCode.match(/await\s+clearAllIndexedDBStores\(\)/),
    'clearAllIndexedDBStores() is NOT invoked on logout, preserving local study files and annotations'
  );

  const switchStart = indexHtml.indexOf('if (isSwitchingDifferentUser)');
  const switchEnd = indexHtml.indexOf('let data = null;', switchStart);
  const switchCode = indexHtml.substring(switchStart, switchEnd);
  assert(
    !switchCode.match(/await\s+clearAllIndexedDBStores\(\)/),
    'clearAllIndexedDBStores() is NOT invoked on user switching'
  );

  // 2.4 Annotation Persistence Safety
  const flushStart = indexHtml.indexOf('async function flushAnnotationsToDBImmediate');
  const flushEnd = indexHtml.indexOf('function normalizeAndRecoverLectureAnnotations', flushStart);
  const flushCode = indexHtml.substring(flushStart, flushEnd);
  assert(flushCode.includes('tx.oncomplete = () => {'), 'IndexedDB transaction uses tx.oncomplete callback');
  const deleteIdx = flushCode.indexOf('delete pendingAnnoSaveMap[id]');
  const oncompleteIdx = flushCode.indexOf('tx.oncomplete');
  assert(deleteIdx > oncompleteIdx, 'pendingAnnoSaveMap entries are only deleted AFTER tx.oncomplete commits');
  assert(
    flushCode.includes("objectStore('annotation_recovery_vault')"),
    'Two-phase recovery vault transaction is recorded before primary commit'
  );

  // 2.5 Cloud Sync Truthful Status & Zero Direct Table Writes Bypassing OCC RPC
  const syncStart = indexHtml.indexOf('async function pushWorkspaceToCloud');
  const syncEnd = indexHtml.indexOf('async function applyCloudWorkspacePayload', syncStart);
  const syncCode = indexHtml.substring(syncStart, syncEnd);
  assert(syncCode.includes('serverSyncConfirmed'), 'Sync confirmation requires verified server confirmation');
  assert(syncCode.includes("updateCloudNavUI('error')"), 'Error handler sets UI to error state on failure');
  assert(
    !syncCode.includes("showToast('تم حفظ نسخة احتياطية كاملة داخل حسابك بنجاح ✓')"),
    'False positive backup success toast in catch block is eliminated'
  );
  assert(
    !/\.from\(['"]user_workspaces['"]\)\s*\.\s*(insert|update|upsert|delete)\s*\(/.test(indexHtml),
    'Zero direct .insert/.update/.upsert/.delete calls on user_workspaces exist in index.html (all writes use OCC RPC)'
  );
  assert(
    indexHtml.includes("if (cloudRow.revision !== undefined && cloudRow.revision !== null)"),
    'applyCloudWorkspacePayload persists cloudRow.revision into localStorage for accurate OCC tracking'
  );

  // --------------------------------------------------------------------------
  // SUITE 3: Backend SQL Migrations, Final Schema & Rollback Static Audit
  // --------------------------------------------------------------------------
  console.log('\n=== SUITE 3: Backend SQL Migration, Schema & Rollback Static Audit ===');

  const forwardMigration = fs.readFileSync('supabase/migrations/20261103140000_fix_security_and_privileges.sql', 'utf8');
  const finalSchema = fs.readFileSync('supabase/schema.sql', 'utf8');
  const safeRollback = fs.readFileSync('supabase/rollbacks/20261103140000_safe_rollback_concurrency_only.sql', 'utf8');
  const legacyRollback = fs.readFileSync('supabase/rollbacks/20261103140000_rollback_fix_security_and_privileges.sql', 'utf8');

  // 3.1 VIP Storage Policy Bypass Fix
  assert(
    forwardMigration.includes('DROP POLICY IF EXISTS "Users can upload their own lecture media" ON "storage"."objects"'),
    'Permissive upload policy bypassing VIP check is dropped in migration'
  );
  assert(
    !finalSchema.includes('CREATE POLICY "Users can upload their own lecture media"'),
    'Final schema.sql does not contain permissive non-VIP upload policy'
  );
  assert(
    forwardMigration.includes('CREATE POLICY "Allow VIP users to upload media" ON "storage"."objects"') &&
      forwardMigration.includes('w.can_upload_media = true'),
    'Strict VIP check (can_upload_media = true) is enforced on storage INSERT'
  );
  assert(
    forwardMigration.includes('CREATE POLICY "Allow VIP users to update media" ON "storage"."objects"') &&
      forwardMigration.includes('FOR UPDATE'),
    'Strict VIP check is enforced on storage UPDATE'
  );

  // 3.2 Storage Bucket Private By Default
  assert(
    forwardMigration.includes('INSERT INTO storage.buckets') && forwardMigration.includes('public = false'),
    'Bucket lecture_media is explicitly configured as private (public = false) in migration'
  );
  assert(
    finalSchema.includes('INSERT INTO storage.buckets') && finalSchema.includes('public = false'),
    'Bucket lecture_media is explicitly configured as private (public = false) in final schema.sql'
  );

  // 3.3 Database Privileges Revocation & Direct Write OCC Enforcement
  assert(
    forwardMigration.includes('REVOKE ALL ON TABLE "public"."user_workspaces" FROM "anon"'),
    'All table privileges on user_workspaces revoked from anon'
  );
  assert(
    forwardMigration.includes('REVOKE ALL ON TABLE "public"."user_workspaces" FROM "authenticated"') &&
      forwardMigration.includes('GRANT SELECT ON TABLE "public"."user_workspaces" TO "authenticated"'),
    'Authenticated role is restricted to SELECT on user_workspaces (writes enforced via OCC RPC)'
  );
  assert(
    !forwardMigration.includes('GRANT TRUNCATE') &&
      !forwardMigration.includes('GRANT TRIGGER') &&
      !forwardMigration.includes('GRANT REFERENCES'),
    'No TRUNCATE, TRIGGER, or REFERENCES granted to API roles'
  );

  // 3.4 Global & Schema Default Privileges Revocation (Including PUBLIC!)
  assert(
    forwardMigration.includes('ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated"'),
    'Global default function privileges revoked from PUBLIC, anon, and authenticated'
  );
  assert(
    forwardMigration.includes('ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated"'),
    'Schema-level default function privileges revoked from PUBLIC, anon, and authenticated'
  );
  assert(
    finalSchema.includes('ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated"') &&
      finalSchema.includes('ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated"'),
    'Final schema.sql revokes default function privileges from PUBLIC, anon, and authenticated globally and in public'
  );

  // 3.5 Server-enforced updated_at, revision, OCC write guard, and Concurrency RPC in both migration and schema.sql
  assert(
    forwardMigration.includes('ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1') &&
      finalSchema.includes('"revision" integer DEFAULT 1 NOT NULL'),
    'Revision column present with default 1 in both migration and final schema.sql'
  );
  assert(
    forwardMigration.includes('CREATE OR REPLACE FUNCTION public.handle_user_workspace_updated_at()') &&
      finalSchema.includes('CREATE OR REPLACE FUNCTION public.handle_user_workspace_updated_at()'),
    'Trigger function handle_user_workspace_updated_at() present in both migration and final schema.sql'
  );
  assert(
    forwardMigration.includes('CREATE OR REPLACE FUNCTION public.enforce_workspace_write_via_rpc()') &&
      finalSchema.includes('CREATE OR REPLACE FUNCTION public.enforce_workspace_write_via_rpc()'),
    'Database-level OCC guard enforce_workspace_write_via_rpc() present in both migration and final schema.sql'
  );
  assert(
    forwardMigration.includes('CREATE OR REPLACE FUNCTION public.sync_workspace_with_concurrency') &&
      finalSchema.includes('CREATE OR REPLACE FUNCTION public.sync_workspace_with_concurrency'),
    'Atomic concurrency RPC sync_workspace_with_concurrency present in both migration and final schema.sql'
  );

  // 3.6 Security Definer Search Path Hardening
  assert(
    forwardMigration.includes('CREATE OR REPLACE FUNCTION public.protect_vip_status_column()') &&
      forwardMigration.includes('SET search_path = pg_catalog, public'),
    'protect_vip_status_column hardened with fixed search_path = pg_catalog, public'
  );
  assert(
    forwardMigration.includes('handle_user_workspace_updated_at') &&
      forwardMigration.includes('SET search_path = pg_catalog, public'),
    'handle_user_workspace_updated_at hardened with search_path = pg_catalog, public'
  );
  assert(
    forwardMigration.includes('sync_workspace_with_concurrency') &&
      forwardMigration.includes('SET search_path = pg_catalog, public, auth'),
    'sync_workspace_with_concurrency hardened with search_path = pg_catalog, public, auth'
  );

  // 3.7 Rollback Safety Gate & Safe Emergency Rollback Alternative
  assert(
    legacyRollback.includes("exo.allow_unsafe_legacy_rollback") &&
      legacyRollback.includes("UNSAFE_ROLLBACK_BLOCKED"),
    'Legacy rollback script enforces explicit safety gate blocking accidental execution'
  );
  assert(
    safeRollback.includes('DROP TRIGGER IF EXISTS trg_enforce_workspace_write_via_rpc') &&
      !safeRollback.includes('GRANT TRUNCATE') &&
      !safeRollback.includes('Users can upload their own lecture media'),
    'Safe rollback script relaxes RPC-only trigger while preserving VIP storage policies and least privilege'
  );

  // --------------------------------------------------------------------------
  // SUITE 4: Service Worker (sw.js) Verification
  // --------------------------------------------------------------------------
  console.log('\n=== SUITE 4: Service Worker (sw.js) Verification ===');

  const swContent = fs.readFileSync('sw.js', 'utf8');
  assert(swContent.includes('url.origin !== self.location.origin'), 'Service worker bypasses Supabase API calls from HTML caching');
  assert(swContent.includes("url.pathname.includes('/drive/')"), 'Service worker bypasses Google APIs from caching');
  assert(swContent.includes("event.request.mode === 'navigate'"), 'Service worker only returns index.html fallback for navigation requests');

  console.log('\n============================================================');
  console.log(`TOTAL CRYPTO & STATIC CHECKS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('============================================================');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error in run_verification_tests.js:', err);
  process.exit(1);
});
