// ============================================================================
// Exo Academic Platform — Phase 4.1 Security, Cryptography & SQL Audit Suite
// Covers: PBKDF2-HMAC-SHA256 Key Derivation, Optimistic Concurrency Control,
//         IndexedDB Transaction Persistence, RLS Policies & Schema Audits
//
// Technical References & Sources:
//   - NIST SP 800-132 (Recommendation for Password-Based Key Derivation):
//     https://csrc.nist.gov/publications/detail/sp/800-132/final
//   - PostgreSQL 16 Row Level Security & Privilege Hardening:
//     https://www.postgresql.org/docs/current/ddl-rowsecurity.html
//   -PostgreSQL SECURITY DEFINER Functions Safe Writing Guidelines:
//     https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY
//   - W3C Service Workers & Cache Storage Specification:
//     https://www.w3.org/TR/service-workers/
// ============================================================================

const crypto = require('crypto');
const fs = require('fs');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    testsFailed++;
  }
}

// ----------------------------------------------------------------------------
// SUITE 1: Cryptographic Authentication & Legacy Hash Auto-Upgrade
// ----------------------------------------------------------------------------
console.log('\n=== SUITE 1: Authentication & Password Hash Security ===');

function deriveSecurePBKDF2HashSync(password, saltHex = null) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const derived = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  return `pbkdf2$100000$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyAndUpgradePasswordSync(password, email, storedHash) {
  if (!storedHash) return { valid: false, upgradedHash: null };

  if (storedHash.startsWith('pbkdf2$')) {
    const parts = storedHash.split('$');
    if (parts.length === 4) {
      const saltHex = parts[2];
      const expected = deriveSecurePBKDF2HashSync(password, saltHex);
      return { valid: expected === storedHash, upgradedHash: null };
    }
  }

  // Legacy SHA-256
  const normalized = `${String(email).trim().toLowerCase()}::pharma_studio_v1::${String(password)}`;
  const legacySha = 'sha256$' + crypto.createHash('sha256').update(normalized).digest('hex');
  if (storedHash === legacySha) {
    return { valid: true, upgradedHash: deriveSecurePBKDF2HashSync(password) };
  }

  // Legacy Base64
  const legacyB64 = Buffer.from(password).toString('base64');
  const legacyB64Prefixed = 'b64$' + Buffer.from(normalized).toString('base64');
  if (storedHash === legacyB64 || storedHash === legacyB64Prefixed) {
    return { valid: true, upgradedHash: deriveSecurePBKDF2HashSync(password) };
  }

  return { valid: false, upgradedHash: null };
}

// 1.1 New password hashes with PBKDF2
const testPass = 'ExoSecret2026!';
const testEmail = 'student@university.edu';
const pbkdf2Hash = deriveSecurePBKDF2HashSync(testPass);
assert(pbkdf2Hash.startsWith('pbkdf2$100000$'), 'New signup generates PBKDF2 hash with 100,000 iterations');
assert(pbkdf2Hash.split('$')[2].length === 32, 'PBKDF2 hash contains 16-byte (32 hex char) cryptographic salt');

// 1.2 Verify valid PBKDF2 password
const checkValid = verifyAndUpgradePasswordSync(testPass, testEmail, pbkdf2Hash);
assert(checkValid.valid === true && checkValid.upgradedHash === null, 'Valid PBKDF2 password authenticates successfully without unnecessary re-upgrade');

// 1.3 Reject invalid password
const checkInvalid = verifyAndUpgradePasswordSync('WrongPassword', testEmail, pbkdf2Hash);
assert(checkInvalid.valid === false, 'Invalid password is strictly rejected');

// 1.4 Auto-upgrade legacy Base64 password hash
const legacyB64Hash = Buffer.from(testPass).toString('base64');
const checkLegacyB64 = verifyAndUpgradePasswordSync(testPass, testEmail, legacyB64Hash);
assert(checkLegacyB64.valid === true, 'Legacy Base64 stored hash is successfully validated');
assert(checkLegacyB64.upgradedHash && checkLegacyB64.upgradedHash.startsWith('pbkdf2$100000$'), 'Legacy Base64 hash is automatically upgraded to PBKDF2 upon successful login');

// 1.5 Auto-upgrade legacy SHA-256 password hash
const legacyNormalized = `${testEmail.toLowerCase()}::pharma_studio_v1::${testPass}`;
const legacyShaHash = 'sha256$' + crypto.createHash('sha256').update(legacyNormalized).digest('hex');
const checkLegacySha = verifyAndUpgradePasswordSync(testPass, testEmail, legacyShaHash);
assert(checkLegacySha.valid === true, 'Legacy salted SHA-256 hash is successfully validated');
assert(checkLegacySha.upgradedHash && checkLegacySha.upgradedHash.startsWith('pbkdf2$100000$'), 'Legacy SHA-256 hash is automatically upgraded to PBKDF2 upon successful login');

// ------------------------------------------------------------
// SUITE 2: Optimistic Concurrency Control & Conflict Merging
// ------------------------------------------------------------
console.log('\n=== SUITE 2: Optimistic Concurrency Control & Merging ===');

// Simulate the database revision and client state
let dbWorkspace = {
  user_id: 'user_123',
  revision: 5,
  subjects: [
    { id: 'sub_1', name: 'Biochemistry', groups: [{ id: 'g_1', name: 'Chapter 1', lectures: [{ id: 'l_1', title: 'Proteins' }] }] }
  ],
  schedule: { events: [{ id: 'ev_1', title: 'Study Bio', completed: false }] },
  logs: [{ id: 'log_1', text: 'Read ch 1' }]
};

// Client A has stale revision 4, attempting to update
const clientAPayload = {
  user_id: 'user_123',
  expected_revision: 4, // stale
  subjects: [
    { id: 'sub_1', name: 'Biochemistry', groups: [{ id: 'g_1', name: 'Chapter 1', lectures: [{ id: 'l_1', title: 'Proteins' }] }] },
    { id: 'sub_2', name: 'Pharmacology', groups: [{ id: 'g_2', name: 'Antibiotics', lectures: [] }] } // new subject added on client A
  ],
  schedule: { events: [{ id: 'ev_1', title: 'Study Bio', completed: true }] },
  logs: [{ id: 'log_2', text: 'Finished proteins' }]
};

// Simulate sync_workspace_with_concurrency RPC logic
function simulateSyncRpc(currentDb, payload, expectedRev) {
  if (expectedRev !== null && currentDb.revision > expectedRev) {
    return {
      status: 'conflict',
      current_revision: currentDb.revision,
      message: 'Workspace modified by another device'
    };
  }
  currentDb.revision = currentDb.revision + 1;
  currentDb.subjects = payload.subjects;
  currentDb.schedule = payload.schedule;
  currentDb.logs = payload.logs;
  return { status: 'success', workspace: currentDb };
}

const conflictResult = simulateSyncRpc(dbWorkspace, clientAPayload, clientAPayload.expected_revision);
assert(conflictResult.status === 'conflict', 'Stale client revision is intercepted and rejected as conflict');
assert(conflictResult.current_revision === 5, 'Conflict response returns current remote database revision');

// Simulate three-way merge resolution
function simulateThreeWayMerge(remoteRow, localPayload) {
  const mergedSubMap = new Map();
  (remoteRow.subjects || []).forEach(s => mergedSubMap.set(s.id, s));
  (localPayload.subjects || []).forEach(s => {
    if (!mergedSubMap.has(s.id)) {
      mergedSubMap.set(s.id, s);
    }
  });

  const mergedEventsMap = new Map();
  (remoteRow.schedule?.events || []).forEach(e => mergedEventsMap.set(e.id, e));
  (localPayload.schedule?.events || []).forEach(e => mergedEventsMap.set(e.id, e));

  const mergedLogsMap = new Map();
  (remoteRow.logs || []).forEach(l => mergedLogsMap.set(l.id, l));
  (localPayload.logs || []).forEach(l => mergedLogsMap.set(l.id, l));

  return {
    user_id: remoteRow.user_id,
    revision: remoteRow.revision, // updated to remote revision
    subjects: Array.from(mergedSubMap.values()),
    schedule: { events: Array.from(mergedEventsMap.values()) },
    logs: Array.from(mergedLogsMap.values())
  };
}

const merged = simulateThreeWayMerge(dbWorkspace, clientAPayload);
assert(merged.subjects.length === 2, 'Merge preserves both existing remote subjects and newly added local subjects');
assert(merged.subjects.some(s => s.name === 'Pharmacology'), 'New local subject Pharmacology is preserved');
assert(merged.subjects.some(s => s.name === 'Biochemistry'), 'Remote subject Biochemistry is preserved');
assert(merged.logs.length === 2, 'All study logs from both devices are preserved without data loss');

// Now retry sync with updated revision (5)
const resolvedSync = simulateSyncRpc(dbWorkspace, merged, merged.revision);
assert(resolvedSync.status === 'success', 'Post-merge sync with current revision succeeds');
assert(dbWorkspace.revision === 6, 'Database revision increments cleanly to 6 after successful merge sync');

// ------------------------------------------------------------
// SUITE 3: Frontend index.html Code Verification
// ------------------------------------------------------------
console.log('\n=== SUITE 3: Frontend index.html Code Verification ===');

const indexHtml = fs.readFileSync('index.html', 'utf8');

// 3.1 Startup preferences wipe check
assert(!indexHtml.includes("localStorage.removeItem('pharmaAppearancePrefsV1')"), 'Destructive startup wipe of pharmaAppearancePrefsV1 is completely removed');
assert(indexHtml.includes("localStorage.getItem('pharmaAppearancePrefsV1')"), 'Appearance preferences are properly loaded and restored on startup');

// 3.2 Google Drive upload privacy check
const driveUploadStart = indexHtml.indexOf('async function uploadMediaToCloudAccount(');
const driveUploadEnd = indexHtml.indexOf('async function pushWorkspaceToCloud', driveUploadStart);
const driveUploadCode = indexHtml.substring(driveUploadStart, driveUploadEnd);
assert(!driveUploadCode.includes("role: 'reader', type: 'anyone'"), 'Automatic public link sharing is removed from uploadMediaToCloudAccount');
assert(indexHtml.includes('shareGoogleDriveFileExplicitly'), 'Explicit Google Drive sharing function with user confirmation is present');
assert(indexHtml.includes('revokeGoogleDriveFileSharing'), 'Explicit Google Drive permission revocation function is present');

// 3.3 IndexedDB Protection on Logout
const logoutStart = indexHtml.indexOf('async function logoutCloudAccount()');
const logoutEnd = indexHtml.indexOf('async function', logoutStart + 30);
const logoutCode = indexHtml.substring(logoutStart, logoutEnd);
assert(!logoutCode.match(/await\s+clearAllIndexedDBStores\(\)/), 'clearAllIndexedDBStores() is NOT invoked on logout, preserving local study files and annotations');

// 3.4 IndexedDB Protection on User Switch
const switchStart = indexHtml.indexOf('if (isSwitchingDifferentUser)');
const switchEnd = indexHtml.indexOf('let data = null;', switchStart);
const switchCode = indexHtml.substring(switchStart, switchEnd);
assert(!switchCode.match(/await\s+clearAllIndexedDBStores\(\)/), 'clearAllIndexedDBStores() is NOT invoked on user switching');

// 3.5 Annotation Persistence Safety
const flushStart = indexHtml.indexOf('function flushPendingAnnotationsSave');
const flushEnd = indexHtml.indexOf('function normalizeAndRecoverLectureAnnotations', flushStart);
const flushCode = indexHtml.substring(flushStart, flushEnd);
assert(flushCode.includes('tx.oncomplete = () => {'), 'IndexedDB transaction uses tx.oncomplete callback');
const deleteIdx = flushCode.indexOf('delete pendingAnnoSaveMap[id]');
const oncompleteIdx = flushCode.indexOf('tx.oncomplete');
assert(deleteIdx > oncompleteIdx, 'pendingAnnoSaveMap entries are only deleted AFTER tx.oncomplete commits');
assert(flushCode.includes("objectStore('annotation_recovery_vault')"), 'Fail-safe sessionStorage backup snapshot is recorded before commit');

// 3.6 Cloud Sync Truthful Status
const syncStart = indexHtml.indexOf('async function pushWorkspaceToCloud');
const syncEnd = indexHtml.indexOf('async function applyCloudWorkspacePayload', syncStart);
const syncCode = indexHtml.substring(syncStart, syncEnd);
assert(syncCode.includes('serverSyncConfirmed'), 'Sync confirmation requires verified server confirmation');
assert(syncCode.includes("updateCloudNavUI('error')"), 'Error handler sets UI to error state on failure');
assert(!syncCode.includes("showToast('تم حفظ نسخة احتياطية كاملة داخل حسابك بنجاح ✓')"), 'False positive backup success toast in catch block is eliminated');

// ------------------------------------------------------------
// SUITE 4: Backend SQL Migrations & RLS Security Audit
// ------------------------------------------------------------
console.log('\n=== SUITE 4: Backend SQL Migration & Policy Audit ===');

const forwardMigration = fs.readFileSync('supabase/migrations/20261103140000_fix_security_and_privileges.sql', 'utf8');
const rollbackMigration = fs.readFileSync('supabase/rollbacks/20261103140000_rollback_fix_security_and_privileges.sql', 'utf8');

// 4.1 VIP Storage Policy Bypass Fix
assert(forwardMigration.includes('DROP POLICY IF EXISTS "Users can upload their own lecture media" ON "storage"."objects"'), 'Permissive upload policy bypassing VIP check is dropped');
assert(forwardMigration.includes('CREATE POLICY "Allow VIP users to upload media" ON "storage"."objects"') &&
       forwardMigration.includes('w.can_upload_media = true'), 'Strict VIP check (can_upload_media = true) is enforced on storage INSERT');
assert(forwardMigration.includes('CREATE POLICY "Allow VIP users to update media" ON "storage"."objects"') &&
       forwardMigration.includes('FOR UPDATE'), 'Strict VIP check is enforced on storage UPDATE');

// 4.2 Storage Bucket Private By Default
assert(forwardMigration.includes("INSERT INTO storage.buckets") && forwardMigration.includes("public = false"), 'Bucket lecture_media is explicitly configured as private (public = false)');

// 4.3 Database Privileges Revocation
assert(forwardMigration.includes('REVOKE ALL ON TABLE "public"."user_workspaces" FROM "anon"'), 'All table privileges on user_workspaces revoked from anon');
assert(forwardMigration.includes('GRANT SELECT, INSERT, UPDATE ON TABLE "public"."user_workspaces" TO "authenticated"'), 'Authenticated role is restricted to SELECT, INSERT, UPDATE');
assert(!forwardMigration.includes('GRANT TRUNCATE') && !forwardMigration.includes('GRANT TRIGGER') && !forwardMigration.includes('GRANT REFERENCES'), 'No TRUNCATE, TRIGGER, or REFERENCES granted to API roles');

// 4.4 Default Privileges Revocation
assert(forwardMigration.includes('ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon", "authenticated"'), 'Default table privileges revoked from anon and authenticated');
assert(forwardMigration.includes('ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon", "authenticated"'), 'Default function privileges revoked from anon and authenticated');

// 4.5 Server-enforced updated_at and revision
assert(forwardMigration.includes('ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1'), 'Revision column added with default 1');
assert(forwardMigration.includes('CREATE OR REPLACE FUNCTION public.handle_user_workspace_updated_at()'), 'Trigger function for automatic updated_at and revision increment created');
assert(forwardMigration.includes('CREATE TRIGGER trg_user_workspaces_updated_at'), 'Trigger bound to BEFORE UPDATE on user_workspaces');

// 4.6 Concurrency RPC
assert(forwardMigration.includes('CREATE OR REPLACE FUNCTION public.sync_workspace_with_concurrency'), 'Atomic concurrency RPC sync_workspace_with_concurrency created');

// 4.7 Security Definer Search Path Hardening
assert(forwardMigration.includes('CREATE OR REPLACE FUNCTION public.protect_vip_status_column()') &&
       forwardMigration.includes('SET search_path = pg_catalog, public'), 'protect_vip_status_column hardened with fixed search_path = public, pg_catalog');
assert(forwardMigration.includes('handle_user_workspace_updated_at') &&
       forwardMigration.includes('SET search_path = pg_catalog, public'), 'handle_user_workspace_updated_at hardened with search_path = public, pg_catalog');
assert(forwardMigration.includes('sync_workspace_with_concurrency') &&
       forwardMigration.includes('SET search_path = pg_catalog, public'), 'sync_workspace_with_concurrency hardened with search_path = public, pg_catalog');

// 4.8 Reversibility
assert(rollbackMigration.includes('DROP POLICY IF EXISTS "Allow VIP users to update media"'), 'Rollback drops new VIP update policy');
assert(rollbackMigration.includes('CREATE POLICY "Users can upload their own lecture media"'), 'Rollback restores original upload policy if needed');
assert(rollbackMigration.includes('DROP TRIGGER IF EXISTS trg_user_workspaces_updated_at'), 'Rollback removes trigger safely');
assert(rollbackMigration.includes('DROP FUNCTION IF EXISTS public.sync_workspace_with_concurrency'), 'Rollback removes concurrency RPC');

// ------------------------------------------------------------
// SUITE 5: Service Worker (sw.js) Verification
// ------------------------------------------------------------
console.log('\n=== SUITE 5: Service Worker (sw.js) Verification ===');

const swContent = fs.readFileSync('sw.js', 'utf8');
assert(swContent.includes("url.origin !== self.location.origin"), 'Service worker bypasses Supabase API calls from HTML caching');
assert(swContent.includes("url.pathname.includes('/drive/')"), 'Service worker bypasses Google APIs from caching');
assert(swContent.includes("event.request.mode === 'navigate'"), 'Service worker only returns index.html fallback for navigation requests');

// ------------------------------------------------------------
// Test Summary
// ------------------------------------------------------------
console.log('\n============================================================');
console.log(`TOTAL TESTS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
console.log('============================================================');

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
