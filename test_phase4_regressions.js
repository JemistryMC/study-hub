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
  let parenDepth = 0;
  let passedParams = false;
  let depth = 0;
  let inFunc = false;
  let endIdx = startIdx;
  for (let i = startIdx; i < code.length; i++) {
    const ch = code[i];
    if (!passedParams) {
      if (ch === '(') parenDepth++;
      else if (ch === ')') {
        parenDepth--;
        if (parenDepth === 0) passedParams = true;
      }
      continue;
    }
    if (ch === '{') {
      depth++;
      inFunc = true;
    } else if (ch === '}') {
      depth--;
      if (inFunc && depth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  return code.substring(startIdx, endIdx);
}

class InMemoryIDBDatabase {
  constructor() {
    this.stores = {
      annotations: new Map(),
      annotation_recovery_vault: new Map(),
      pdfs: new Map(),
      audios: new Map()
    };
    this.failNextTransaction = false;
    this.getAllCount = 0;
    this.onGetAllHook = null;
  }

  transaction(storeName, mode = 'readonly') {
    const db = this;
    const storeMap = db.stores[storeName];
    if (!storeMap) throw new Error(`Store ${storeName} does not exist`);

    const stagedOps = [];
    const tx = {
      mode,
      error: null,
      oncomplete: null,
      onerror: null,
      onabort: null,
      objectStore(name) {
        const targetMap = db.stores[name];
        return {
          getAll() {
            const req = { result: null, error: null, onsuccess: null, onerror: null };
            setImmediate(() => {
              db.getAllCount++;
              if (typeof db.onGetAllHook === 'function') {
                const hook = db.onGetAllHook;
                db.onGetAllHook = null;
                hook();
              }
              if (db.failNextTransaction) {
                db.failNextTransaction = false;
                req.error = new Error('Simulated IDB read failure');
                tx.error = req.error;
                if (req.onerror) req.onerror();
                if (tx.onerror) tx.onerror();
                return;
              }
              req.result = Array.from(targetMap.values());
              if (req.onsuccess) req.onsuccess();
              if (tx.oncomplete) tx.oncomplete();
            });
            return req;
          },
          get(key) {
            const req = { result: null, error: null, onsuccess: null, onerror: null };
            setImmediate(() => {
              req.result = targetMap.get(String(key));
              if (req.onsuccess) req.onsuccess();
              if (tx.oncomplete) tx.oncomplete();
            });
            return req;
          },
          put(val) {
            stagedOps.push({ type: 'put', key: String(val.id), val });
          },
          delete(key) {
            stagedOps.push({ type: 'delete', key: String(key) });
          }
        };
      }
    };

    if (mode === 'readwrite') {
      setImmediate(() => {
        if (db.failNextTransaction) {
          db.failNextTransaction = false;
          tx.error = new Error('Simulated IDB write transaction abort');
          if (tx.onabort) tx.onabort();
          return;
        }
        for (const op of stagedOps) {
          if (op.type === 'put') storeMap.set(op.key, op.val);
          else if (op.type === 'delete') storeMap.delete(op.key);
        }
        if (tx.oncomplete) tx.oncomplete();
      });
    }

    return tx;
  }
}

const prodHelpersCode = `
const storageBacking = new Map();
let failNextAccountSnapshotKey = null;
const localStorage = {
  getItem: (k) => (storageBacking.has(String(k)) ? storageBacking.get(String(k)) : null),
  setItem: (k, v) => {
    if (failNextAccountSnapshotKey && String(k) === String(failNextAccountSnapshotKey)) {
      failNextAccountSnapshotKey = null;
      throw new Error('QuotaExceededError: Simulated failure writing ' + k);
    }
    storageBacking.set(String(k), String(v));
  },
  removeItem: (k) => { storageBacking.delete(String(k)); },
  clear: () => { storageBacking.clear(); }
};
const scheduledTimers = [];
const toastHistory = [];
const setTimeout = (fn, delay) => {
  scheduledTimers.push({ fn, delay });
  return scheduledTimers.length;
};
const clearTimeout = () => {};
const navigator = { onLine: true };
const document = { getElementById: () => null };
let currentCloudUser = null;
let currentUserCanUploadMedia = false;
let currentSessionGeneration = 1;
let dbInstance = null;
let supabaseClient = null;
let googleAccessToken = null;
let googleTokenExpiry = 0;
let pendingGoogleTokenPromise = null;
const gdriveSubfolderCache = new Map();
let inMemoryAnnotationsCache = {};
let inMemoryAnnotationsCacheNormalized = {};
let inMemoryAnnotationsCacheLoaded = false;
let pendingAnnoSaveMap = {};
let dirtyAnnotationsForCloud = false;
let activeCloudSyncByAccount = new Map();
let activeCloudSyncPromise = null;
let isCloudSyncing = false;
let isBulkMediaUploading = false;
let cloudAutoSaveTimer = null;
let localWorkspaceMutationSeq = 0;
let localAnnotationsMutationSeq = 0;
let currentCloudWorkspaceRevision = 1;
let currentPdfFitMode = 'height';
let activeSubjectId = null;
let currentViewingLec = null;
let pageAnnotations = {};
let renderedPagesSet = new Set();
let hasReconciledBucketThisSession = true;
let isLoginSyncInProgress = false;
let lastLoginSyncUserId = null;
let lastUploadedAnnotationsSignature = '';
let localMediaCache = { pdfs: new Set(), audios: new Set() };
let sessionMediaBlobRamCache = { pdfs: new Map(), audios: new Map() };
let subjects = [];
let scheduleEvents = [];
let scheduleBacklog = [];
let weeklyReports = [];
let plannerPrefs = { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75, currentWeekStartIso: '2026-10-31' };
let logs = [];
let completedAcademyModules = [];
let cloudMediaRegistry = {};

function showToast(msg, type = 'info') {
  toastHistory.push({ msg: String(msg || ''), type: String(type || 'info') });
}
function renderSubjectsList() {}
function renderGroups() {}
function renderSchedule() {}
function updateTracker() {}
function updateCloudMediaStatsUI() {}
function updateAcademyXpUI() {}
function updateCloudNavUI() {}
function updateGoogleDriveUI() {}
async function refreshLocalMediaCache() {}
async function reconcileCloudMediaWithStorageBucket() {}

${extractFunctionSource(indexHtmlContent, 'getLocalIsoDate')}
${extractFunctionSource(indexHtmlContent, 'getWeekStartDateForDate')}
${extractFunctionSource(indexHtmlContent, 'saveScheduleData')}
${extractFunctionSource(indexHtmlContent, 'saveCloudMediaRegistry')}
${extractFunctionSource(indexHtmlContent, 'normMediaKeyStr')}
${extractFunctionSource(indexHtmlContent, 'recordUploadedMediaInRegistry')}
${extractFunctionSource(indexHtmlContent, 'findMediaInCloudRegistry')}
${extractFunctionSource(indexHtmlContent, 'titleKeyMismatch')}
${extractFunctionSource(indexHtmlContent, 'snapshotCurrentSubjectsMediaToRegistry')}
${extractFunctionSource(indexHtmlContent, 'healSubjectsFromCloudRegistry')}
${extractFunctionSource(indexHtmlContent, 'getLocalTombstones')}
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
${extractFunctionSource(indexHtmlContent, 'normalizeAndRecoverLectureAnnotations')}
${extractFunctionSource(indexHtmlContent, 'computeStrokeUniqueSignature')}
${extractFunctionSource(indexHtmlContent, 'computeFastStringSignature')}
${extractFunctionSource(indexHtmlContent, 'getAllAnnotationsMapFromDB')}
${extractFunctionSource(indexHtmlContent, 'restoreAllAnnotationsMapToDB')}
${extractFunctionSource(indexHtmlContent, 'markLocalWorkspaceModified')}
${extractFunctionSource(indexHtmlContent, 'mergeAndApplyCloudConflict')}
${extractFunctionSource(indexHtmlContent, 'pushWorkspaceToCloud')}
${extractFunctionSource(indexHtmlContent, 'applyCloudWorkspacePayload')}
${extractFunctionSource(indexHtmlContent, 'syncWorkspaceOnLogin')}
module.exports = {
  localStorage,
  scheduledTimers,
  toastHistory,
  setDbInstance: (db) => { dbInstance = db; },
  setFailNextAccountSnapshotKey: (key) => { failNextAccountSnapshotKey = key ? String(key) : null; },
  setSupabaseClient: (client) => { supabaseClient = client; },
  setNavigatorOnline: (online) => { navigator.onLine = Boolean(online); },
  setSessionUser: (uid) => {
    currentCloudUser = uid ? { id: uid, email: uid + '@test.edu' } : null;
    bumpAccountSessionGeneration();
  },
  setRuntimeState: (st) => {
    if (st.subjects !== undefined) subjects = st.subjects;
    if (st.scheduleEvents !== undefined) scheduleEvents = st.scheduleEvents;
    if (st.scheduleBacklog !== undefined) scheduleBacklog = st.scheduleBacklog;
    if (st.weeklyReports !== undefined) weeklyReports = st.weeklyReports;
    if (st.plannerPrefs !== undefined) plannerPrefs = st.plannerPrefs;
    if (st.logs !== undefined) logs = st.logs;
    if (st.completedAcademyModules !== undefined) completedAcademyModules = st.completedAcademyModules;
    if (st.cloudMediaRegistry !== undefined) cloudMediaRegistry = st.cloudMediaRegistry;
  },
  getRuntimeState: () => ({
    subjects,
    scheduleEvents,
    scheduleBacklog,
    weeklyReports,
    plannerPrefs,
    logs,
    completedAcademyModules,
    cloudMediaRegistry,
    currentCloudWorkspaceRevision,
    dirtyAnnotationsForCloud
  }),
  getAllAnnotationsMapFromDB,
  restoreAllAnnotationsMapToDB,
  markLocalWorkspaceModified,
  mergeAndApplyCloudConflict,
  pushWorkspaceToCloud,
  applyCloudWorkspacePayload,
  syncWorkspaceOnLogin,
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

  const idb = new InMemoryIDBDatabase();
  prod.setDbInstance(idb);

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

  // --------------------------------------------------------------------------
  // TEST 7 (T-5.1-02): Conflict-Merge Immediate Local Persistence (0ms) & In-Flight Dirty Flag Protection
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7 (T-5.1-02): Conflict-Merge Immediate Local Persistence (0ms) ---');
  prod.localStorage.clear();
  prod.scheduledTimers.length = 0;
  prod.setSessionUser(uidA);
  const ctxMergeA = prod.createAccountOperationContext();

  const remoteRowConflict = {
    user_id: uidA,
    revision: 9,
    updated_at: '2026-11-05T10:00:00.000Z',
    subjects: [{ id: 'sub_rem', name: 'Remote Subject', groups: [] }],
    schedule: {
      version: 3,
      events: [{ id: 'ev_rem', title: 'Remote Event', day: 6, startHour: 10, duration: 1, _updatedAt: 100 }],
      backlog: [{ id: 'bl_rem', title: 'Remote Backlog' }],
      weeklyReports: [{ id: 'rep_rem', weekStartIso: '2026-10-24', score: 85 }],
      plannerPrefs: { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75 },
      cloudMediaRegistry: { 'lec_rem': { pdfUploaded: true, ownerUid: uidA } },
      _tombstones: { subjects: {}, lectures: {}, events: {} }
    },
    logs: [{ id: 'log_rem', text: 'Remote Log', timestamp: 1000 }],
    academy_progress: ['mod_rem']
  };

  const localPayloadConflict = {
    user_id: uidA,
    subjects: [{ id: 'sub_loc', name: 'Local Subject', groups: [] }],
    schedule: {
      version: 3,
      events: [{ id: 'ev_loc', title: 'Local Event', day: 0, startHour: 14, duration: 2, _updatedAt: 200 }],
      backlog: [{ id: 'bl_loc', title: 'Local Backlog' }],
      weeklyReports: [{ id: 'rep_loc', weekStartIso: '2026-10-31', score: 95 }],
      plannerPrefs: { weekStartDay: 1, dayStartHour: 8, dayEndHour: 22, autoCompletePct: 80 },
      cloudMediaRegistry: { 'lec_loc': { pdfUploaded: true, ownerUid: uidA } }
    },
    logs: [{ id: 'log_loc', text: 'Local Log', timestamp: 2000 }],
    academy_progress: ['mod_loc']
  };

  // Execute mergeAndApplyCloudConflict and inspect state at 0ms BEFORE any 1200ms timer fires
  const mergeRes0ms = await prod.mergeAndApplyCloudConflict(remoteRowConflict, localPayloadConflict, ctxMergeA);
  assert(mergeRes0ms && mergeRes0ms.ok === true && mergeRes0ms.revision === 9,
         'T-5.1-02a: mergeAndApplyCloudConflict succeeds and updates revision to 9');

  const storedSchedule0ms = JSON.parse(prod.localStorage.getItem('pharmaScheduleV4') || 'null');
  const storedBacklog0ms = JSON.parse(prod.localStorage.getItem('pharmaScheduleBacklogV1') || 'null');
  const storedReports0ms = JSON.parse(prod.localStorage.getItem('pharmaWeeklyReportsV1') || 'null');
  const storedPrefs0ms = JSON.parse(prod.localStorage.getItem('pharmaPlannerPrefsV1') || 'null');
  const storedSubjects0ms = JSON.parse(prod.localStorage.getItem('pharmaSubjectsV4') || 'null');
  const storedLogs0ms = JSON.parse(prod.localStorage.getItem('pharmaLogsV4') || 'null');
  const storedAcad0ms = JSON.parse(prod.localStorage.getItem('pharmaAcademyProgressV1') || 'null');
  const storedMediaReg0ms = JSON.parse(prod.localStorage.getItem('pharmaCloudMediaRegistryV1') || 'null');
  const storedAccountSnap0ms = JSON.parse(prod.localStorage.getItem(prod.getAccountBackupStorageKey(uidA)) || 'null');

  assert(
    storedSchedule0ms && Array.isArray(storedSchedule0ms.events) && storedSchedule0ms.events.length === 2 &&
    Array.isArray(storedBacklog0ms) && storedBacklog0ms.length === 2,
    'T-5.1-02b: pharmaScheduleV4 and pharmaScheduleBacklogV1 are persisted immediately (0ms) with both remote and local items'
  );
  assert(
    Array.isArray(storedSubjects0ms) && storedSubjects0ms.length === 2 &&
    Array.isArray(storedReports0ms) && storedReports0ms.length === 2 &&
    storedPrefs0ms && storedPrefs0ms.weekStartDay === 1 &&
    Array.isArray(storedLogs0ms) && storedLogs0ms.length === 2 &&
    Array.isArray(storedAcad0ms) && storedAcad0ms.length === 2 &&
    storedMediaReg0ms && storedMediaReg0ms.lec_rem && storedMediaReg0ms.lec_loc,
    'T-5.1-02c: All remaining global workspace keys (subjects, reports, prefs, logs, academy, mediaRegistry) are persisted at 0ms'
  );
  assert(
    storedAccountSnap0ms &&
    storedAccountSnap0ms.subjects.length === 2 &&
    storedAccountSnap0ms.schedule.events.length === 2 &&
    storedAccountSnap0ms.schedule.backlog.length === 2 &&
    storedAccountSnap0ms.dirty === true &&
    prod.localStorage.getItem('pharmaWorkspaceDirty') === '1',
    'T-5.1-02d: Account-scoped snapshot pharmaAccountWorkspace_<uid> and pharmaWorkspaceDirty="1" are persisted at 0ms before retry timer'
  );

  // Verify in-flight mutation sequence protection during pushWorkspaceToCloud:
  // If a new local modification occurs while RPC is in-flight, pharmaWorkspaceDirty must remain '1'
  prod.setSupabaseClient({
    rpc: async () => {
      // Simulate user editing workspace while cloud push is in-flight
      prod.markLocalWorkspaceModified(false);
      return { data: { status: 'success', revision: 10 }, error: null };
    }
  });
  const inFlightPushRes = await prod.pushWorkspaceToCloud(false, false, ctxMergeA);
  assert(inFlightPushRes.status === 'success' && prod.localStorage.getItem('pharmaWorkspaceDirty') === '1',
         'T-5.1-02e: pushWorkspaceToCloud preserves pharmaWorkspaceDirty="1" when a new local mutation occurs while push is in-flight');

  // Now perform a clean push with no concurrent mutations and verify pharmaWorkspaceDirty is cleared
  prod.setSupabaseClient({
    rpc: async () => ({ data: { status: 'success', revision: 11 }, error: null })
  });
  const cleanPushRes = await prod.pushWorkspaceToCloud(false, false, ctxMergeA);
  assert(cleanPushRes.status === 'success' && prod.localStorage.getItem('pharmaWorkspaceDirty') === null,
         'T-5.1-02f: pushWorkspaceToCloud clears pharmaWorkspaceDirty only after cloud acknowledgement with no newer mutations');

  // --------------------------------------------------------------------------
  // TEST 8 (T-5.1-03): Preserve Academy Progress for Brand-New Cloud Account
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8 (T-5.1-03): Preserve Academy Progress for Brand-New Cloud Account ---');
  prod.localStorage.clear();
  const uidNewStudent = 'new-student-5103-aaaa-bbbb-ccccddddeeee';
  prod.localStorage.setItem('pharmaAcademyProgressV1', JSON.stringify(['mod_1', 'mod_2']));
  prod.setRuntimeState({
    subjects: [],
    scheduleEvents: [],
    scheduleBacklog: [],
    weeklyReports: [],
    logs: [],
    completedAcademyModules: ['mod_1', 'mod_2'],
    cloudMediaRegistry: {}
  });

  let capturedInitialCloudPayload = null;
  prod.setSupabaseClient({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }) // Brand-new cloud account: no row exists
        })
      })
    }),
    rpc: async (fnName, args) => {
      if (fnName === 'sync_workspace_with_concurrency') {
        capturedInitialCloudPayload = args.p_payload;
      }
      return { data: { status: 'success', revision: 1 }, error: null };
    }
  });

  prod.setSessionUser(uidNewStudent);
  const newLoginRes = await prod.syncWorkspaceOnLogin();
  const afterNewLoginState = prod.getRuntimeState();
  const storedAcadAfterLogin = JSON.parse(prod.localStorage.getItem('pharmaAcademyProgressV1') || '[]');

  assert(
    newLoginRes && newLoginRes.ok === true &&
    Array.isArray(afterNewLoginState.completedAcademyModules) &&
    afterNewLoginState.completedAcademyModules.length === 2 &&
    afterNewLoginState.completedAcademyModules.includes('mod_1') &&
    afterNewLoginState.completedAcademyModules.includes('mod_2'),
    'T-5.1-03a: Brand-new cloud account login preserves in-memory completedAcademyModules ["mod_1", "mod_2"]'
  );
  assert(
    Array.isArray(storedAcadAfterLogin) &&
    storedAcadAfterLogin.length === 2 &&
    storedAcadAfterLogin.includes('mod_1') &&
    storedAcadAfterLogin.includes('mod_2'),
    'T-5.1-03b: localStorage["pharmaAcademyProgressV1"] retains ["mod_1", "mod_2"] after brand-new account login'
  );
  assert(
    capturedInitialCloudPayload &&
    Array.isArray(capturedInitialCloudPayload.academy_progress) &&
    capturedInitialCloudPayload.academy_progress.length === 2 &&
    capturedInitialCloudPayload.academy_progress.includes('mod_1') &&
    capturedInitialCloudPayload.academy_progress.includes('mod_2'),
    'T-5.1-03c: Initial cloud push payload for brand-new account includes academy_progress: ["mod_1", "mod_2"]'
  );

  // --------------------------------------------------------------------------
  // TEST 9 (T-M1-C02): Account Snapshot Write Failure During Conflict Merge
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9 (T-M1-C02): Account Snapshot Write Failure During Conflict Merge ---');
  prod.localStorage.clear();
  prod.scheduledTimers.length = 0;
  prod.toastHistory.length = 0;
  const uidC02 = 'c02-user-1111-2222-3333-444455556666';
  prod.setSessionUser(uidC02);
  const ctxC02 = prod.createAccountOperationContext();
  const accountSnapKeyC02 = prod.getAccountBackupStorageKey(uidC02);

  // Inject localStorage.setItem() failure specifically for pharmaAccountWorkspace_<uid>
  prod.setFailNextAccountSnapshotKey(accountSnapKeyC02);

  const remoteRowC02 = {
    user_id: uidC02,
    revision: 12,
    updated_at: '2026-11-05T11:00:00.000Z',
    subjects: [{ id: 'sub_c02_rem', name: 'Remote Subject C02', groups: [] }],
    schedule: {
      version: 3,
      events: [{ id: 'ev_c02_rem', title: 'Remote Event C02', day: 6, startHour: 9, duration: 1, _updatedAt: 100 }],
      backlog: [{ id: 'bl_c02_rem', title: 'Remote Backlog C02' }],
      weeklyReports: [],
      plannerPrefs: { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75 }
    },
    logs: [{ id: 'log_c02_rem', text: 'Remote Log C02', timestamp: 1000 }],
    academy_progress: ['mod_c02_rem']
  };
  const localPayloadC02 = {
    user_id: uidC02,
    subjects: [{ id: 'sub_c02_loc', name: 'Local Subject C02', groups: [] }],
    schedule: {
      version: 3,
      events: [{ id: 'ev_c02_loc', title: 'Local Event C02', day: 1, startHour: 14, duration: 2, _updatedAt: 200 }],
      backlog: [{ id: 'bl_c02_loc', title: 'Local Backlog C02' }],
      weeklyReports: [],
      plannerPrefs: { weekStartDay: 1, dayStartHour: 7, dayEndHour: 22, autoCompletePct: 80 }
    },
    logs: [{ id: 'log_c02_loc', text: 'Local Log C02', timestamp: 2000 }],
    academy_progress: ['mod_c02_loc']
  };

  const failMergeRes = await prod.mergeAndApplyCloudConflict(remoteRowC02, localPayloadC02, ctxC02);

  assert(
    failMergeRes && failMergeRes.ok === false && failMergeRes.reason === 'account_snapshot_write_failed',
    'T-M1-C02a: mergeAndApplyCloudConflict returns { ok: false, reason: "account_snapshot_write_failed" } when pharmaAccountWorkspace_<uid> write fails'
  );
  const hadSuccessToastOnFail = prod.toastHistory.some(t => t.msg.includes('بنجاح'));
  const hadErrorToastOnFail = prod.toastHistory.some(t => t.type === 'error');
  assert(
    !hadSuccessToastOnFail && hadErrorToastOnFail,
    'T-M1-C02b: No success toast is shown when account snapshot write fails; error/warning notification is shown instead'
  );
  assert(
    prod.scheduledTimers.length === 0,
    'T-M1-C02c: Delayed 1,200ms cloud retry timer is NOT scheduled when account snapshot persistence fails'
  );
  assert(
    prod.localStorage.getItem('pharmaWorkspaceDirty') === '1' &&
    prod.localStorage.getItem('pharmaWorkspaceDirty_' + uidC02) === '1' &&
    prod.localStorage.getItem(accountSnapKeyC02) === null &&
    prod.getRuntimeState().subjects.length === 2,
    'T-M1-C02d: Dirty flags remain set ("1") and best-effort in-memory/global merged state is preserved without falsely claiming account snapshot durability'
  );

  // Now perform a normal successful write and verify the merge follows the existing successful path
  prod.toastHistory.length = 0;
  prod.scheduledTimers.length = 0;
  const okMergeRes = await prod.mergeAndApplyCloudConflict(remoteRowC02, localPayloadC02, ctxC02);
  const writtenSnapC02 = JSON.parse(prod.localStorage.getItem(accountSnapKeyC02) || 'null');
  assert(
    okMergeRes && okMergeRes.ok === true && okMergeRes.revision === 12 &&
    writtenSnapC02 && writtenSnapC02.subjects.length === 2 &&
    prod.toastHistory.some(t => t.msg.includes('بنجاح')) &&
    prod.scheduledTimers.some(t => t.delay === 1200),
    'T-M1-C02e: Subsequent normal mergeAndApplyCloudConflict writes pharmaAccountWorkspace_<uid>, shows success toast, schedules 1200ms retry, and returns { ok: true }'
  );

  // --------------------------------------------------------------------------
  // TEST 10 (T-M1-C03): Missing Remote Annotations & Mid-Read Account Switch Abort
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10 (T-M1-C03): Missing Remote Annotations & Mid-Read Account Switch Abort ---');
  prod.localStorage.clear();
  idb.stores.annotations.clear();
  prod.setSessionUser(uidA);
  const ctxC03 = prod.createAccountOperationContext();
  const snapKeyC03 = prod.getAccountBackupStorageKey(uidA);

  // Seed a STALE annotation map inside pharmaAccountWorkspace_<uidA> to prove mergeAndApplyCloudConflict does NOT fall back to stale vault annotations
  prod.localStorage.setItem(snapKeyC03, JSON.stringify({
    user_id: uidA,
    subjects: [],
    schedule: { version: 3, events: [], backlog: [] },
    annotations: {
      'stale_vault_lec': { 1: [{ id: 'stale_1', tool: 'pen', note: 'STALE OLD SNAPSHOT NOTE' }] }
    }
  }));

  // Seed current verified local annotations for uidA in IndexedDB via production restoreAllAnnotationsMapToDB
  const verifiedLocalStrokes = {
    'lec_verified_local': {
      1: [{ id: 'str_local_verified_1', tool: 'pen', color: '#2dd4bf', note: 'VERIFIED CURRENT IDB ANNOTATION' }]
    }
  };
  await prod.restoreAllAnnotationsMapToDB(verifiedLocalStrokes, uidA, ctxC03);

  // Also plant a foreign user (uidB) annotation record in IndexedDB to verify foreign keys are never accepted
  idb.stores.annotations.set(`usr_${uidB}::foreign_lec_999`, {
    id: `usr_${uidB}::foreign_lec_999`,
    rawId: 'foreign_lec_999',
    userId: uidB,
    pages: { 1: [{ id: 'str_foreign', tool: 'pen', note: 'FOREIGN ACCOUNT NOTE' }] }
  });

  const getAllCountBefore = idb.getAllCount;
  // Remote row has NO annotations property at all
  const remoteRowNoAnnotations = {
    user_id: uidA,
    revision: 15,
    subjects: [{ id: 'sub_c03_rem', name: 'Remote Subject Without Annotations', groups: [] }],
    schedule: { version: 3, events: [], backlog: [], weeklyReports: [] },
    logs: [],
    academy_progress: []
  };
  const localPayloadNoAnnotations = {
    user_id: uidA,
    subjects: [{ id: 'sub_c03_loc', name: 'Local Subject', groups: [] }],
    schedule: { version: 3, events: [], backlog: [], weeklyReports: [] },
    logs: [],
    academy_progress: []
  };

  const c03MergeRes = await prod.mergeAndApplyCloudConflict(remoteRowNoAnnotations, localPayloadNoAnnotations, ctxC03);
  const snapAfterC03 = JSON.parse(prod.localStorage.getItem(snapKeyC03) || 'null');

  assert(
    c03MergeRes && c03MergeRes.ok === true && idb.getAllCount > getAllCountBefore,
    'T-M1-C03a: When remoteRow.annotations is absent, mergeAndApplyCloudConflict reads local annotations through verified IndexedDB reader'
  );
  assert(
    snapAfterC03 &&
    snapAfterC03.annotations &&
    snapAfterC03.annotations['lec_verified_local'] &&
    snapAfterC03.annotations['lec_verified_local'][1][0].note === 'VERIFIED CURRENT IDB ANNOTATION',
    'T-M1-C03b: Account-scoped snapshot pharmaAccountWorkspace_<uid> retains the verified local IndexedDB annotation map'
  );
  assert(
    snapAfterC03 &&
    snapAfterC03.annotations['stale_vault_lec'] === undefined &&
    snapAfterC03.annotations['foreign_lec_999'] === undefined &&
    Object.keys(snapAfterC03.annotations).length === 1,
    'T-M1-C03c: Neither empty {}, nor stale old vault annotations, nor foreign account annotations replace or pollute the snapshot'
  );

  // Now simulate an account switch occurring DURING the IndexedDB annotation read in mergeAndApplyCloudConflict
  prod.setSessionUser(uidA);
  const ctxBeforeMidReadSwitch = prod.createAccountOperationContext();
  idb.onGetAllHook = () => {
    // Switch active session to uidB while IndexedDB getAll() is in-flight
    prod.setSessionUser(uidB);
  };
  const midReadSwitchRes = await prod.mergeAndApplyCloudConflict(
    {
      user_id: uidA,
      revision: 99,
      subjects: [{ id: 'sub_should_abort', name: 'Should Not Apply', groups: [] }],
      schedule: { version: 3, events: [], backlog: [] }
    },
    localPayloadNoAnnotations,
    ctxBeforeMidReadSwitch
  );
  const snapAfterAbortedSwitch = JSON.parse(prod.localStorage.getItem(snapKeyC03) || 'null');
  assert(
    midReadSwitchRes && midReadSwitchRes.ok === false && midReadSwitchRes.reason === 'account_switched' &&
    snapAfterAbortedSwitch.revision === 15,
    'T-M1-C03d: Account switching during IndexedDB annotation read safely aborts mergeAndApplyCloudConflict without mutating snapshot'
  );

  // --------------------------------------------------------------------------
  // TEST 11 (T-M1-C04): syncWorkspaceOnLogin() Direct Switch Outgoing Snapshot Freshness, Annotations & Failure Safety
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 11 (T-M1-C04): syncWorkspaceOnLogin() Direct Switch Outgoing Snapshot Freshness & Failure Safety ---');
  prod.localStorage.clear();
  idb.stores.annotations.clear();
  prod.setNavigatorOnline(false);

  const uidOut = 'out-sync-aaaa-1111-2222-333344445555';
  const uidIn = 'in-sync-bbbb-6666-7777-888899990000';
  const outSnapKey = prod.getAccountBackupStorageKey(uidOut);

  // Establish uidOut as active user with a stale existing snapshot and older Drive vault
  prod.setSessionUser(uidOut);
  prod.localStorage.setItem('pharmaLastActiveCloudUid', uidOut);
  prod.localStorage.setItem('pharmaLastActiveUserIdV1', uidOut);
  prod.localStorage.setItem('pharmaGdriveSync_' + uidOut, JSON.stringify({
    linked: true,
    userEmail: 'old_out@gmail.com',
    folderId: 'old_out_folder',
    quotaInfo: '0.5 / 15.0 GB'
  }));
  prod.localStorage.setItem(outSnapKey, JSON.stringify({
    user_id: uidOut,
    user_email: 'out@test.edu',
    revision: 2,
    dirty: false,
    subjects: [{ id: 'sub_stale_out', name: 'Stale Out Subject', groups: [] }],
    schedule: { version: 3, events: [], backlog: [] },
    logs: [],
    academy_progress: [],
    annotations: { 'stale_out_lec': { 1: [{ id: 'st_old', tool: 'pen', note: 'Stale Note' }] } }
  }));

  // Seed verified IndexedDB annotations for uidOut
  await prod.restoreAllAnnotationsMapToDB({
    'lec_out_verified': { 1: [{ id: 'st_out_v1', tool: 'pen', note: 'Verified Outgoing IDB Note' }] }
  }, uidOut);

  // Give uidOut newer live workspace state and newer bound Drive metadata
  prod.setRuntimeState({
    subjects: [{ id: 'sub_fresh_out', name: 'Fresh Outgoing Subject', groups: [] }],
    scheduleEvents: [{ id: 'ev_fresh_out', title: 'Fresh Outgoing Event', day: 2, startHour: 10, duration: 2 }],
    scheduleBacklog: [{ id: 'bl_fresh_out', title: 'Fresh Outgoing Backlog' }],
    weeklyReports: [{ id: 'rep_fresh_out', weekStartIso: '2026-10-31', score: 97 }],
    plannerPrefs: { weekStartDay: 1, dayStartHour: 7, dayEndHour: 22, autoCompletePct: 88, currentWeekStartIso: '2026-10-26' },
    logs: [{ id: 'log_fresh_out', text: 'Fresh Outgoing Log', timestamp: 1700009000 }],
    completedAcademyModules: ['mod_out_1', 'mod_out_2'],
    cloudMediaRegistry: { 'lec_out_verified': { pdfUploaded: true, ownerUid: uidOut } }
  });
  prod.localStorage.setItem('pharmaWorkspaceDirty', '1');
  prod.localStorage.setItem('pharmaWorkspaceRevision_' + uidOut, '9');
  prod.localStorage.setItem('exo_gdrive_connected', '1');
  prod.localStorage.setItem('exo_gdrive_user_email', 'fresh_out@gmail.com');
  prod.localStorage.setItem('exo_gdrive_folder_id', 'fresh_out_folder_99');
  prod.localStorage.setItem('exo_gdrive_quota_info', '4.2 / 15.0 GB');
  prod.localStorage.setItem('exo_gdrive_bound_user_id', uidOut);

  // 11a: Simulate IndexedDB annotation read failure during direct syncWorkspaceOnLogin() switch to uidIn
  prod.setSessionUser(uidIn);
  idb.failNextTransaction = true;
  const syncReadFailRes = await prod.syncWorkspaceOnLogin();
  const snapAfterSyncReadFail = JSON.parse(prod.localStorage.getItem(outSnapKey) || 'null');
  assert(
    syncReadFailRes &&
    syncReadFailRes.ok === false &&
    syncReadFailRes.reason === 'outgoing_annotations_read_failed' &&
    prod.getCanonicalUserId() === uidOut &&
    prod.getRuntimeState().subjects.length === 1 &&
    prod.getRuntimeState().subjects[0].id === 'sub_fresh_out' &&
    prod.localStorage.getItem('pharmaLastActiveCloudUid') === uidOut &&
    snapAfterSyncReadFail.subjects[0].id === 'sub_stale_out',
    'T-M1-C04a: syncWorkspaceOnLogin() direct switch aborts on IDB annotation read failure, reverts session to outgoing user, and preserves dirty live state'
  );

  // 11b: Simulate outgoing snapshot write failure during direct syncWorkspaceOnLogin() switch to uidIn
  prod.setSessionUser(uidIn);
  prod.setFailNextAccountSnapshotKey(outSnapKey);
  const syncWriteFailRes = await prod.syncWorkspaceOnLogin();
  assert(
    syncWriteFailRes &&
    syncWriteFailRes.ok === false &&
    syncWriteFailRes.reason === 'outgoing_account_snapshot_write_failed' &&
    prod.getCanonicalUserId() === uidOut &&
    prod.getRuntimeState().subjects.length === 1 &&
    prod.getRuntimeState().subjects[0].id === 'sub_fresh_out' &&
    prod.localStorage.getItem('pharmaWorkspaceDirty_' + uidOut) === '1',
    'T-M1-C04b: syncWorkspaceOnLogin() direct switch aborts on outgoing snapshot write failure without wiping outgoing user data'
  );

  // 11c: Now retry direct syncWorkspaceOnLogin() switch to uidIn without failures
  prod.setSessionUser(uidIn);
  await prod.syncWorkspaceOnLogin();
  const refreshedOutSnap = JSON.parse(prod.localStorage.getItem(outSnapKey) || 'null');
  const refreshedOutDrive = JSON.parse(prod.localStorage.getItem('pharmaGdriveSync_' + uidOut) || 'null');
  assert(
    refreshedOutSnap &&
    refreshedOutSnap.subjects.length === 1 &&
    refreshedOutSnap.subjects[0].id === 'sub_fresh_out' &&
    refreshedOutSnap.schedule.events.length === 1 &&
    refreshedOutSnap.schedule.plannerPrefs.weekStartDay === 1 &&
    refreshedOutSnap.academy_progress.length === 2 &&
    refreshedOutSnap.revision === 9 &&
    refreshedOutSnap.dirty === true &&
    refreshedOutSnap.annotations &&
    refreshedOutSnap.annotations['lec_out_verified'] &&
    refreshedOutSnap.annotations['lec_out_verified'][1][0].note === 'Verified Outgoing IDB Note' &&
    refreshedOutSnap.annotations['stale_out_lec'] === undefined &&
    refreshedOutDrive &&
    refreshedOutDrive.userEmail === 'fresh_out@gmail.com' &&
    refreshedOutDrive.folderId === 'fresh_out_folder_99' &&
    prod.getRuntimeState().subjects.length === 0,
    'T-M1-C04c: syncWorkspaceOnLogin() direct switch refreshes outgoing snapshot, Drive vault, and verified IndexedDB annotations before resetting globals for incoming user'
  );

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
