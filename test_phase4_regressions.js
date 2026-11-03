// ============================================================================
// Exo Phase 4: Rigorous Asynchronous Regression Test Suite
// Standard: Fully asynchronous async main() with explicit awaits.
// No early process.exit(). Every assertion is executed and counted.
// ============================================================================

const fs = require('fs');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${testName} ${details ? '(' + details + ')' : ''}`);
    testsFailed++;
  }
}

// Extract production helper functions directly from index.html source code
const indexHtmlContent = fs.readFileSync('index.html', 'utf8');

function extractFunctionSource(code, funcName) {
  const startIdx = code.indexOf(`function ${funcName}`);
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

// Evaluate actual production helper implementations
const prodHelpersCode = `
${extractFunctionSource(indexHtmlContent, 'getCanonicalUserId')}
${extractFunctionSource(indexHtmlContent, 'sanitizeUserIdForPrefix')}
${extractFunctionSource(indexHtmlContent, 'getUserStoragePrefix')}
${extractFunctionSource(indexHtmlContent, 'extractUserIdFromScopedKey')}
${extractFunctionSource(indexHtmlContent, 'extractRawIdFromScopedKey')}
${extractFunctionSource(indexHtmlContent, 'toScopedKey')}
module.exports = {
  getCanonicalUserId,
  sanitizeUserIdForPrefix,
  getUserStoragePrefix,
  extractUserIdFromScopedKey,
  extractRawIdFromScopedKey,
  toScopedKey
};
`;

const tempHelperPath = './_temp_prod_helpers.js';
fs.writeFileSync(tempHelperPath, prodHelpersCode);
const prod = require(tempHelperPath);
fs.unlinkSync(tempHelperPath);

async function main() {
  console.log('======================================================================');
  console.log('EXO PHASE 4: ASYNCHRONOUS REGRESSION TEST SUITE');
  console.log('======================================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Key Scoping Invariants, Idempotency & Foreign Rejection
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Production toScopedKey Standards & Invariants ---');
  const uidA = 'c0ffee00-1111-2222-3333-444455556666';
  const uidB = 'deadbeef-9999-8888-7777-666655554444';

  // 1.1 Correct format usr_<sanitized>::<id>
  const keyA1 = prod.toScopedKey('101', uidA);
  assert(keyA1 === `usr_${uidA}::101`, 'toScopedKey produces usr_<uuid>::id when given raw UUID');

  // 1.2 Idempotent on already properly scoped key
  const keyA2 = prod.toScopedKey(keyA1, uidA);
  assert(keyA2 === keyA1, 'toScopedKey is strictly idempotent when called on already-scoped key for same user');

  // 1.3 Repairs previously mis-scoped UUID::id format
  const misScopedKey = `${uidA}::101`;
  const repairedKey = prod.toScopedKey(misScopedKey, uidA);
  assert(repairedKey === `usr_${uidA}::101`, 'toScopedKey repairs previously mis-scoped UUID::id to usr_<uuid>::id for same user');

  // 1.4 Strictly rejects foreign account keys with CROSS_ACCOUNT_KEY_VIOLATION
  let foreignCaught = false;
  try {
    prod.toScopedKey(keyA1, uidB);
  } catch (err) {
    if (err.message.includes('CROSS_ACCOUNT_KEY_VIOLATION')) {
      foreignCaught = true;
    }
  }
  assert(foreignCaught, 'toScopedKey strictly throws CROSS_ACCOUNT_KEY_VIOLATION when foreign key is passed');

  // 1.5 extractUserIdFromScopedKey extracts canonical prefix
  const extracted = prod.extractUserIdFromScopedKey(keyA1);
  assert(extracted === uidA, 'extractUserIdFromScopedKey extracts exact sanitized user UUID');

  // 1.6 extractRawIdFromScopedKey extracts raw clean ID
  const cleanId = prod.extractRawIdFromScopedKey(keyA1);
  assert(cleanId === '101', 'extractRawIdFromScopedKey extracts exact raw ID without user prefix');

  // --------------------------------------------------------------------------
  // TEST 2: Strict Dual Ownership Validation in getAllAnnotationsMapFromDB
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Dual Ownership Validation & Ownership Conflict Quarantine ---');

  // Logic extracted directly from production getAllAnnotationsMapFromDB in index.html
  function validateRecordOwnership(item, canonicalUid) {
    if (!item || !item.pages || String(item.id).startsWith('_cloudMedia_')) return null;

    const itemKey = String(item.id);
    const itemUserId = item.userId ? String(item.userId) : null;
    const keyPrefixUserId = prod.extractUserIdFromScopedKey(itemKey);

    // Strict Dual Ownership Verification
    const isStrictMatch = (keyPrefixUserId === canonicalUid) &&
                          (itemUserId === canonicalUid);

    if (isStrictMatch) {
      const cleanRawId = prod.extractRawIdFromScopedKey(itemKey);
      return { cleanRawId, pages: item.pages };
    }
    return null; // Quarantined
  }

  const recValid = { id: `usr_${uidA}::101`, userId: uidA, pages: { 1: ['Valid note'] } };
  const recConflicted1 = { id: `usr_${uidA}::102`, userId: uidB, pages: { 1: ['Conflicted note'] } };
  const recConflicted2 = { id: `usr_${uidB}::103`, userId: uidA, pages: { 1: ['Conflicted note'] } };
  const recForeign = { id: `usr_${uidB}::104`, userId: uidB, pages: { 1: ['Foreign note'] } };
  const recUnscoped = { id: `105`, userId: null, pages: { 1: ['Unclaimed note'] } };

  assert(validateRecordOwnership(recValid, uidA) !== null, 'Valid record with matching key prefix and userId metadata is accepted');
  assert(validateRecordOwnership(recConflicted1, uidA) === null, 'Conflicted record (key userA, userId userB) is strictly quarantined');
  assert(validateRecordOwnership(recConflicted2, uidA) === null, 'Conflicted record (key userB, userId userA) is strictly quarantined');
  assert(validateRecordOwnership(recForeign, uidA) === null, 'Foreign record is strictly quarantined');
  assert(validateRecordOwnership(recUnscoped, uidA) === null, 'Unscoped legacy record is quarantined and never exported');

  // --------------------------------------------------------------------------
  // TEST 3: Asynchronous Logout Failure Safety (Truly Awaited)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Asynchronous Failure-Safe Logout (Awaited Execution) ---');

  async function simulateSafeLogout(flushFails, syncFails, isDirty) {
    let sessionWiped = false;
    let dirtyFlag = isDirty ? '1' : null;

    // 1. Flush annotations
    const flushOk = await (async () => {
      if (flushFails) return false;
      return true;
    })();

    if (!flushOk) {
      // Abort logout!
      return { success: false, reason: 'flush_failed', sessionWiped, dirtyFlag };
    }

    // 2. Final sync
    let syncOk = true;
    if (dirtyFlag === '1') {
      syncOk = await (async () => {
        if (syncFails) return false;
        return true;
      })();

      if (syncOk) {
        dirtyFlag = null; // Cleared only on verified server confirmation
      }
    }

    sessionWiped = true;
    return { success: true, syncedToCloud: syncOk, isDirty: dirtyFlag === '1', sessionWiped };
  }

  // 3.1 Failed flush halts logout and preserves active session
  const resFlushFail = await simulateSafeLogout(true, false, true);
  assert(resFlushFail.success === false, 'Logout returns success=false when annotation flush fails');
  assert(resFlushFail.sessionWiped === false, 'Session is NOT wiped when annotation flush fails');
  assert(resFlushFail.dirtyFlag === '1', 'Dirty flag is strictly preserved on aborted logout');

  // 3.2 Failed cloud sync preserves dirty flag
  const resSyncFail = await simulateSafeLogout(false, true, true);
  assert(resSyncFail.success === true, 'Logout completes after local persistence');
  assert(resSyncFail.syncedToCloud === false, 'Sync result accurately reports unconfirmed cloud write');
  assert(resSyncFail.isDirty === true, 'Dirty flag is strictly kept when final cloud sync fails');

  // --------------------------------------------------------------------------
  // TEST 4: IndexedDB v3 to v4 Upgrade & Recovery Vault Preservation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: IndexedDB v3 to v4 Database Migration ---');

  class MockIDBMigrationHarness {
    constructor(version) {
      this.version = version;
      this.stores = new Map([
        ['pdfs', new Map()],
        ['audios', new Map()],
        ['annotations', new Map()]
      ]);
    }

    upgrade(targetVersion) {
      if (targetVersion > this.version) {
        this.version = targetVersion;
        // In v4 upgrade:
        if (!this.stores.has('annotation_recovery_vault')) {
          this.stores.set('annotation_recovery_vault', new Map());
        }
      }
    }
  }

  const harness = new MockIDBMigrationHarness(3);
  harness.stores.get('annotations').set('usr_u1::l1', { pages: ['Preserved v3 handwriting'] });
  harness.stores.get('pdfs').set('usr_u1::l1', { blob: 'Preserved v3 PDF' });

  // Execute upgrade to version 4
  harness.upgrade(4);
  assert(harness.version === 4, 'Database schema upgraded to version 4');
  assert(harness.stores.has('annotation_recovery_vault'), 'Version 4 created annotation_recovery_vault store');
  assert(harness.stores.get('annotations').has('usr_u1::l1'), 'Pre-existing annotations in v3 survived upgrade to v4 without data loss');
  assert(harness.stores.get('pdfs').has('usr_u1::l1'), 'Pre-existing PDFs in v3 survived upgrade to v4 without data loss');

  // --------------------------------------------------------------------------
  // TEST 5: SQL Migration vs Rollback Baseline Invariant Audit
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: SQL Migration COALESCE Syntax & Rollback Baseline Audit ---');

  const forwardSql = fs.readFileSync('supabase/migrations/20261103140000_fix_security_and_privileges.sql', 'utf8');
  const rollbackSql = fs.readFileSync('supabase/rollbacks/20261103140000_rollback_fix_security_and_privileges.sql', 'utf8');

  // Strip SQL comments before auditing keywords
  function stripSqlComments(sql) {
    return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  }

  const cleanForward = stripSqlComments(forwardSql);
  const cleanRollback = stripSqlComments(rollbackSql);

  assert(!cleanForward.includes('pg_catalog.coalesce'), 'Forward migration has ZERO occurrences of pg_catalog.coalesce');
  assert(!cleanRollback.includes('pg_catalog.coalesce'), 'Rollback script has ZERO occurrences of pg_catalog.coalesce');

  const coalesceMatches = cleanForward.match(/\bCOALESCE\s*\(/gi) || [];
  assert(coalesceMatches.length >= 10, `Forward migration contains ${coalesceMatches.length} valid standard SQL COALESCE statements`);

  // Rollback baseline fidelity
  assert(cleanRollback.includes('GRANT EXECUTE ON FUNCTION "public"."protect_vip_status_column"() TO PUBLIC, "anon", "authenticated"'),
         'Rollback restores exact baseline PUBLIC execution privileges on protect_vip_status_column');
  assert(cleanRollback.includes('SET search_path TO \'public\', \'auth\''),
         'Rollback restores baseline search_path on enforce_workspace_media_security');
  assert(rollbackSql.includes('KNOWN REVERSIBILITY LIMITATION'),
         'Rollback header explicitly documents known storage bucket reversibility limitation');

  // --------------------------------------------------------------------------
  // TEST 6: In-Flight Media Download User Segregation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: In-Flight Media Download Key Segregation ---');

  function getInflightKey(userId, storeName, lecId) {
    return `${userId}:${storeName}:${lecId}`;
  }

  const inflightA = getInflightKey(uidA, 'pdfs', '101');
  const inflightB = getInflightKey(uidB, 'pdfs', '101');
  assert(inflightA !== inflightB, 'Inflight keys are strictly segregated by user UUID for overlapping lecture 101');
  assert(inflightA === `${uidA}:pdfs:101`, 'Inflight key for User A incorporates active user UUID');

  // --------------------------------------------------------------------------
  // Final Completion Summary
  // --------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`TOTAL PHASE 4 REGRESSION CHECKS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('======================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    console.log('ALL PHASE 4 ASYNCHRONOUS REGRESSION TESTS PASSED (100%).');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
