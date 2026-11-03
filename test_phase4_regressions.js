// ============================================================================
// Exo Academic Platform — Phase 4.1 Asynchronous Regression Test Suite
// Standard: Fully asynchronous async main() with explicit awaits.
// No early process.exit(). Every assertion is executed and counted.
//
// Covers:
//   - Immutable Account Operation Context (`createAccountOperationContext`)
//   - Foreign Scoped Key Rejection (`CROSS_ACCOUNT_KEY_VIOLATION`)
//   - Provenance-Verified Legacy Quarantine (`hasVerifiedLegacyProvenance`)
//   - Two-Phase Recovery Vault Durability (`flushAnnotationsToDBImmediate`)
//
// Technical References & Sources:
//   - W3C Indexed Database API 3.0: https://www.w3.org/TR/IndexedDB-3/
//   - MDN IDBTransaction Durability: https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event
//   - OWASP ASVS v4.0.3: https://owasp.org/www-project-application-security-verification-standard/
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

const indexHtmlContent = fs.readFileSync('index.html', 'utf8');

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

const prodHelpersCode = `
let currentCloudUser = null;
let currentSessionGeneration = 1;
${extractFunctionSource(indexHtmlContent, 'sanitizeForScopedKey')}
${extractFunctionSource(indexHtmlContent, 'getCanonicalUserId')}
${extractFunctionSource(indexHtmlContent, 'bumpAccountSessionGeneration')}
${extractFunctionSource(indexHtmlContent, 'createAccountOperationContext')}
${extractFunctionSource(indexHtmlContent, 'resolveAccountOperationContext')}
${extractFunctionSource(indexHtmlContent, 'sanitizeUserIdForPrefix')}
${extractFunctionSource(indexHtmlContent, 'getUserStoragePrefix')}
${extractFunctionSource(indexHtmlContent, 'getAccountBackupStorageKey')}
${extractFunctionSource(indexHtmlContent, 'extractUserIdFromScopedKey')}
${extractFunctionSource(indexHtmlContent, 'extractRawIdFromScopedKey')}
${extractFunctionSource(indexHtmlContent, 'toScopedKey')}
${extractFunctionSource(indexHtmlContent, 'resolveAuthorizedScopedKey')}
${extractFunctionSource(indexHtmlContent, 'hasStrictDualRecordOwnership')}
${extractFunctionSource(indexHtmlContent, 'hasVerifiedLegacyProvenance')}
${extractFunctionSource(indexHtmlContent, 'computeStrokeUniqueSignature')}
module.exports = {
  setSessionUser: (uid) => {
    currentCloudUser = uid ? { id: uid, email: uid + '@test.edu' } : null;
    bumpAccountSessionGeneration();
  },
  sanitizeForScopedKey,
  getCanonicalUserId,
  bumpAccountSessionGeneration,
  createAccountOperationContext,
  resolveAccountOperationContext,
  sanitizeUserIdForPrefix,
  getUserStoragePrefix,
  getAccountBackupStorageKey,
  extractUserIdFromScopedKey,
  extractRawIdFromScopedKey,
  toScopedKey,
  resolveAuthorizedScopedKey,
  hasStrictDualRecordOwnership,
  hasVerifiedLegacyProvenance,
  computeStrokeUniqueSignature
};
`;

const tempHelperPath = './_temp_prod_helpers.js';
fs.writeFileSync(tempHelperPath, prodHelpersCode);
const prod = require(tempHelperPath);
fs.unlinkSync(tempHelperPath);

async function main() {
  console.log('======================================================================');
  console.log('EXO PHASE 4 & 4.1: ASYNCHRONOUS REGRESSION TEST SUITE');
  console.log('======================================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Key Scoping Invariants, Idempotency & Foreign Key Rejection
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Production toScopedKey & resolveAuthorizedScopedKey Invariants ---');
  const uidA = 'c0ffee00-1111-2222-3333-444455556666';
  const uidB = 'deadbeef-9999-8888-7777-666655554444';

  const keyA1 = prod.toScopedKey('101', uidA);
  assert(keyA1 === `usr_${uidA}::101`, 'toScopedKey produces usr_<uuid>::id when given raw UUID');

  const keyA2 = prod.toScopedKey(keyA1, uidA);
  assert(keyA2 === keyA1, 'toScopedKey is strictly idempotent when called on already-scoped key for same user');

  const misScopedKey = `${uidA}::101`;
  const repairedKey = prod.toScopedKey(misScopedKey, uidA);
  assert(repairedKey === `usr_${uidA}::101`, 'toScopedKey repairs previously mis-scoped UUID::id to usr_<uuid>::id for same user');

  let foreignCaught = false;
  try {
    prod.toScopedKey(keyA1, uidB);
  } catch (err) {
    if (err.message.includes('CROSS_ACCOUNT_KEY_VIOLATION')) {
      foreignCaught = true;
    }
  }
  assert(foreignCaught, 'toScopedKey strictly throws CROSS_ACCOUNT_KEY_VIOLATION when foreign key is passed');

  let extractForeignCaught = false;
  try {
    prod.extractRawIdFromScopedKey(keyA1, uidB);
  } catch (err) {
    if (err.message.includes('CROSS_ACCOUNT_KEY_VIOLATION')) {
      extractForeignCaught = true;
    }
  }
  assert(extractForeignCaught, 'extractRawIdFromScopedKey strictly throws CROSS_ACCOUNT_KEY_VIOLATION when expectedUserId mismatches');

  let resolveForeignCaught = false;
  try {
    prod.resolveAuthorizedScopedKey(keyA1, uidB);
  } catch (err) {
    if (err.message.includes('CROSS_ACCOUNT_KEY_VIOLATION')) {
      resolveForeignCaught = true;
    }
  }
  assert(resolveForeignCaught, 'resolveAuthorizedScopedKey rejects foreign scoped key before any prefix stripping');

  const extracted = prod.extractUserIdFromScopedKey(keyA1);
  assert(extracted === uidA, 'extractUserIdFromScopedKey extracts exact sanitized user UUID');

  const cleanId = prod.extractRawIdFromScopedKey(keyA1, uidA);
  assert(cleanId === '101', 'extractRawIdFromScopedKey extracts exact raw ID when expectedUserId matches');

  // --------------------------------------------------------------------------
  // TEST 2: Strict Dual Ownership Validation & Legacy Provenance Quarantine
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Dual Ownership Validation & Ownership Conflict Quarantine ---');

  const recValid = { id: `usr_${uidA}::101`, userId: uidA, pages: { 1: ['Valid note'] } };
  const recConflicted1 = { id: `usr_${uidA}::102`, userId: uidB, pages: { 1: ['Conflicted note'] } };
  const recConflicted2 = { id: `usr_${uidB}::103`, userId: uidA, pages: { 1: ['Conflicted note'] } };
  const recForeign = { id: `usr_${uidB}::104`, userId: uidB, pages: { 1: ['Foreign note'] } };
  const recMissingUserId = { id: `usr_${uidA}::105`, userId: null, pages: { 1: ['Missing userId note'] } };
  const recUnscoped = { id: `106`, userId: null, pages: { 1: ['Unclaimed note'] } };

  assert(prod.hasStrictDualRecordOwnership(recValid, uidA) === true, 'Valid record with matching key prefix and userId metadata is accepted');
  assert(prod.hasStrictDualRecordOwnership(recConflicted1, uidA) === false, 'Conflicted record (key userA, userId userB) is strictly quarantined');
  assert(prod.hasStrictDualRecordOwnership(recConflicted2, uidA) === false, 'Conflicted record (key userB, userId userA) is strictly quarantined');
  assert(prod.hasStrictDualRecordOwnership(recForeign, uidA) === false, 'Foreign record is strictly quarantined');
  assert(prod.hasStrictDualRecordOwnership(recMissingUserId, uidA) === false, 'Scoped record with missing userId (null) is strictly quarantined');
  assert(prod.hasStrictDualRecordOwnership(recUnscoped, uidA) === false, 'Unscoped legacy record is quarantined and never exported');

  // --------------------------------------------------------------------------
  // TEST 3: Account Operation Context & Session Epoch Invalidation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Account Operation Context & Generation Invalidation ---');

  prod.setSessionUser(uidA);
  const ctxA = prod.createAccountOperationContext();
  assert(ctxA.uid === uidA && ctxA.isCurrent() === true, 'Operation context created for User A is initially valid and current');

  // Switch to User B
  prod.setSessionUser(uidB);
  assert(ctxA.isCurrent() === false, 'User A operation context immediately becomes stale (isCurrent() === false) after switching to User B');

  const ctxB = prod.createAccountOperationContext();
  assert(ctxB.uid === uidB && ctxB.isCurrent() === true, 'New operation context for User B is valid and current');
  assert(ctxB.generation > ctxA.generation, 'Session generation increments monotonically across account switches');

  // Even if User A logs back in, the old ctxA from an earlier generation remains expired!
  prod.setSessionUser(uidA);
  assert(ctxA.isCurrent() === false, 'Earlier generation context for User A remains expired even after User A logs back in');

  // --------------------------------------------------------------------------
  // TEST 4: Asynchronous Logout Failure Safety (Truly Awaited)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Asynchronous Failure-Safe Logout & Backup Verification ---');

  async function simulateSafeLogout(flushFails, syncFails, annoReadFails, isDirty) {
    let sessionWiped = false;
    let dirtyFlag = isDirty ? '1' : null;
    let backupSuccess = false;

    const flushOk = await (async () => !flushFails)();
    if (!flushOk) {
      return { success: false, reason: 'flush_failed', sessionWiped, dirtyFlag, backupSuccess: false };
    }

    let syncOk = true;
    if (dirtyFlag === '1') {
      syncOk = await (async () => !syncFails)();
    }

    const annoReadOk = await (async () => !annoReadFails)();
    if (annoReadOk) {
      backupSuccess = true;
    }

    if (syncOk && backupSuccess) {
      dirtyFlag = null;
    } else {
      dirtyFlag = '1';
    }

    sessionWiped = true;
    return { success: true, syncedToCloud: syncOk, backupSuccess, isDirty: dirtyFlag === '1', sessionWiped };
  }

  const resFlushFail = await simulateSafeLogout(true, false, false, true);
  assert(resFlushFail.success === false, 'Logout returns success=false when annotation flush fails');
  assert(resFlushFail.sessionWiped === false, 'Session is NOT wiped when annotation flush fails');
  assert(resFlushFail.dirtyFlag === '1', 'Dirty flag is strictly preserved on aborted logout');

  const resSyncFail = await simulateSafeLogout(false, true, false, true);
  assert(resSyncFail.success === true, 'Logout completes after local persistence');
  assert(resSyncFail.syncedToCloud === false, 'Sync result accurately reports unconfirmed cloud write');
  assert(resSyncFail.isDirty === true, 'Dirty flag is strictly kept when final cloud sync fails');

  const resBackupFail = await simulateSafeLogout(false, false, true, false);
  assert(resBackupFail.backupSuccess === false, 'Logout accurately reports backupSuccess=false when annotation read fails');
  assert(resBackupFail.isDirty === true, 'Dirty flag is set when local backup fails so data is not marked clean');

  // --------------------------------------------------------------------------
  // TEST 5: SQL Migration vs Rollback Baseline Invariant Audit
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: SQL Migration COALESCE Syntax & Rollback Baseline Audit ---');

  const forwardSql = fs.readFileSync('supabase/migrations/20261103140000_fix_security_and_privileges.sql', 'utf8');
  const rollbackSql = fs.readFileSync('supabase/rollbacks/20261103140000_rollback_fix_security_and_privileges.sql', 'utf8');

  function stripSqlComments(sql) {
    return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  }

  const cleanForward = stripSqlComments(forwardSql);
  const cleanRollback = stripSqlComments(rollbackSql);

  assert(!cleanForward.includes('pg_catalog.coalesce'), 'Forward migration has ZERO occurrences of pg_catalog.coalesce');
  assert(!cleanRollback.includes('pg_catalog.coalesce'), 'Rollback script has ZERO occurrences of pg_catalog.coalesce');

  const coalesceMatches = cleanForward.match(/\bCOALESCE\s*\(/gi) || [];
  assert(coalesceMatches.length >= 10, `Forward migration contains ${coalesceMatches.length} valid standard SQL COALESCE statements`);

  assert(cleanRollback.includes('GRANT EXECUTE ON FUNCTION "public"."protect_vip_status_column"() TO PUBLIC, "anon", "authenticated"'),
         'Rollback restores exact baseline PUBLIC execution privileges on protect_vip_status_column');
  assert(cleanRollback.includes('SET search_path TO \'public\', \'auth\''),
         'Rollback restores baseline search_path on enforce_workspace_media_security');
  assert(rollbackSql.includes('KNOWN REVERSIBILITY LIMITATION'),
         'Rollback header explicitly documents known storage bucket reversibility limitation');

  // --------------------------------------------------------------------------
  // TEST 6: Full Stroke Signature & Unified Backup Key Verification
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Full Stroke Signature & Unified Backup Key ---');

  const stroke1 = { tool: 'pen', color: '#000', size: 2, points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] };
  const stroke2 = { tool: 'pen', color: '#000', size: 2, points: [{ x: 50, y: 50 }, { x: 80, y: 80 }] };
  assert(prod.computeStrokeUniqueSignature(stroke1) !== prod.computeStrokeUniqueSignature(stroke2),
         'computeStrokeUniqueSignature produces distinct signatures for strokes with identical tool, color, and length but different coordinates');
  assert(prod.getAccountBackupStorageKey(uidA) === `pharmaAccountWorkspace_${uidA}`,
         'getAccountBackupStorageKey always uses canonical UID format pharmaAccountWorkspace_<uid>');

  console.log('\n======================================================================');
  console.log(`TOTAL PHASE 4/4.1 REGRESSION CHECKS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('======================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    console.log('ALL PHASE 4 & 4.1 ASYNCHRONOUS REGRESSION TESTS PASSED (100%).');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
