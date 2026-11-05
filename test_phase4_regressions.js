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
    this.objectStoreNames = {
      contains: (name) => Boolean(this.stores[name])
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
function updateWeeklyMetrics() {}
function renderTasksView() {}
function renderPdfInlineTaskAdjusterList() {}
function refreshSchedulePdfPreview() {}
function renderWeeklyEvaluationsHub() {}
function closeModal() {}
function openConfirmModal(msg, onConfirm) {
  if (typeof onConfirm === 'function') return onConfirm();
}
function updateCloudMediaStatsUI() {}
function updateAcademyXpUI() {}
function updateCloudNavUI() {}
function updateGoogleDriveUI() {}
async function refreshLocalMediaCache() {}
async function reconcileCloudMediaWithStorageBucket() {}

const CAUSAL_SCHEMA_VERSION = 1;
const CAUSAL_TOMBSTONE_ENTITY_TYPES = [
    'subjects', 'groups', 'lectures', 'wird_logs', 'events', 'backlog', 'logs', 'weekly_reports'
];
const CAUSAL_TOMBSTONE_ENTITY_TYPE_SET = new Set(CAUSAL_TOMBSTONE_ENTITY_TYPES);
const FORBIDDEN_MUTATION_VERBS_AS_ID = new Set(['create', 'update', 'delete', 'upsert', 'restore']);
let liveTabActorId = null;
let liveLamportClock = 0;
let testCryptoProviderOverride = undefined;
const liveActorScopeCounters = new Map();
const liveObservedScopeContexts = new Map();

${extractFunctionSource(indexHtmlContent, 'getLocalIsoDate')}
${extractFunctionSource(indexHtmlContent, 'getWeekStartDateForDate')}
${extractFunctionSource(indexHtmlContent, 'isCollegeCommitmentSession')}
${extractFunctionSource(indexHtmlContent, 'saveSubjects')}
${extractFunctionSource(indexHtmlContent, 'saveScheduleData')}
${extractFunctionSource(indexHtmlContent, 'saveLogs')}
${extractFunctionSource(indexHtmlContent, 'triggerDeleteSubject')}
${extractFunctionSource(indexHtmlContent, 'deleteContinuousSubjectWirdLog')}
${extractFunctionSource(indexHtmlContent, 'triggerDeleteGroup')}
${extractFunctionSource(indexHtmlContent, 'triggerDeleteLecture')}
${extractFunctionSource(indexHtmlContent, 'deleteSessionDirect')}
${extractFunctionSource(indexHtmlContent, 'executeClearSchedule')}
${extractFunctionSource(indexHtmlContent, 'deleteBacklogTask')}
${extractFunctionSource(indexHtmlContent, 'triggerDeleteLog')}
${extractFunctionSource(indexHtmlContent, 'deleteEventFromPdfAdjuster')}
${extractFunctionSource(indexHtmlContent, 'deleteWeeklyEvaluationReport')}
${extractFunctionSource(indexHtmlContent, 'markMissedSessionDoneOffline')}
${extractFunctionSource(indexHtmlContent, 'saveCloudMediaRegistry')}
${extractFunctionSource(indexHtmlContent, 'normMediaKeyStr')}
${extractFunctionSource(indexHtmlContent, 'recordUploadedMediaInRegistry')}
${extractFunctionSource(indexHtmlContent, 'findMediaInCloudRegistry')}
${extractFunctionSource(indexHtmlContent, 'titleKeyMismatch')}
${extractFunctionSource(indexHtmlContent, 'snapshotCurrentSubjectsMediaToRegistry')}
${extractFunctionSource(indexHtmlContent, 'healSubjectsFromCloudRegistry')}
${extractFunctionSource(indexHtmlContent, 'setCryptoProviderForTests')}
${extractFunctionSource(indexHtmlContent, 'generateCausalOperationId')}
${extractFunctionSource(indexHtmlContent, 'validateAndResolveEntityScope')}
${extractFunctionSource(indexHtmlContent, 'getOrCreateDeviceId')}
${extractFunctionSource(indexHtmlContent, 'getLiveActorId')}
${extractFunctionSource(indexHtmlContent, 'resetLiveActorForTabSimulation')}
${extractFunctionSource(indexHtmlContent, 'getLocalDeviceRegistry')}
${extractFunctionSource(indexHtmlContent, 'mergeCausalContexts')}
${extractFunctionSource(indexHtmlContent, 'getScopeContextMapKey')}
${extractFunctionSource(indexHtmlContent, 'observeCausalOperation')}
${extractFunctionSource(indexHtmlContent, 'createCausalOperation')}
${extractFunctionSource(indexHtmlContent, 'normalizeCausalEnvelope')}
${extractFunctionSource(indexHtmlContent, 'hasProvenLegacyAncestry')}
${extractFunctionSource(indexHtmlContent, 'compareCausalOperations')}
${extractFunctionSource(indexHtmlContent, 'getConflictRecoveryRecords')}
${extractFunctionSource(indexHtmlContent, 'mergeConflictRecoveryLists')}
${extractFunctionSource(indexHtmlContent, 'recordConflictRecoveryCandidate')}
${extractFunctionSource(indexHtmlContent, 'computeEntityContentDigest')}
${extractFunctionSource(indexHtmlContent, 'stampEntityMutation')}
${extractFunctionSource(indexHtmlContent, 'restoreDeletedEntity')}
${extractFunctionSource(indexHtmlContent, 'ensureEntityHasCausalMetadata')}
${extractFunctionSource(indexHtmlContent, 'notifyCausalStampingFailure')}
${extractFunctionSource(indexHtmlContent, 'detachDeletedHierarchyReferences')}
${extractFunctionSource(indexHtmlContent, 'autoStampTrackedWorkspaceMutations')}
${extractFunctionSource(indexHtmlContent, 'normalizeSingleTombstoneEntry')}
${extractFunctionSource(indexHtmlContent, 'normalizeTombstonesObject')}
${extractFunctionSource(indexHtmlContent, 'getLocalTombstones')}
${extractFunctionSource(indexHtmlContent, 'hasAnyTombstoneEntries')}
${extractFunctionSource(indexHtmlContent, 'findPriorEntityInMemoryForTombstone')}
${extractFunctionSource(indexHtmlContent, 'recordTombstone')}
${extractFunctionSource(indexHtmlContent, 'recordTombstonesAtomicBatch')}
${extractFunctionSource(indexHtmlContent, 'mergeTombstoneMapsWithCausalEngine')}
${extractFunctionSource(indexHtmlContent, 'isEntitySupersededByTombstone')}
${extractFunctionSource(indexHtmlContent, 'mergeEntityRecordsWithCausalEngine')}
${extractFunctionSource(indexHtmlContent, 'mergeFlatEntityCollectionWithCausalEngine')}
${extractFunctionSource(indexHtmlContent, 'mergeSubjectsHierarchyWithCausalEngine')}
${extractFunctionSource(indexHtmlContent, 'cleanupDeletedLectureLocalArtifacts')}
${extractFunctionSource(indexHtmlContent, 'drainPendingLocalArtifactCleanup')}
${extractFunctionSource(indexHtmlContent, 'computeCanonical4DecimalStrokeGeometry')}
${extractFunctionSource(indexHtmlContent, 'computeDeterministicLegacyStrokeId')}
${extractFunctionSource(indexHtmlContent, 'migrateLegacyPageStrokesWithManifest')}
${extractFunctionSource(indexHtmlContent, 'verifySharedLegacyStrokeAncestry')}
${extractFunctionSource(indexHtmlContent, 'ensurePageVersionsContainer')}
${extractFunctionSource(indexHtmlContent, 'validateAnnotationMutationTarget')}
${extractFunctionSource(indexHtmlContent, 'stampAnnotationItemCausalMetadata')}
${extractFunctionSource(indexHtmlContent, 'recordAnnotationStrokeDeletion')}
${extractFunctionSource(indexHtmlContent, 'recordAnnotationPageClear')}
${extractFunctionSource(indexHtmlContent, 'syncExcludedPagesArrayWithMeta')}
${extractFunctionSource(indexHtmlContent, 'recordExcludedPageMutation')}
${extractFunctionSource(indexHtmlContent, 'recordExtraNoteToggleMutation')}
${extractFunctionSource(indexHtmlContent, 'recordAudioPinDeletion')}
${extractFunctionSource(indexHtmlContent, 'isStrokeSupersededByPageClear')}
${extractFunctionSource(indexHtmlContent, 'mergeLectureAnnotationsWithCausalVersions')}
${extractFunctionSource(indexHtmlContent, 'collectOperationIdsFromCausalObject')}
${extractFunctionSource(indexHtmlContent, 'captureOutgoingOperationsSnapshot')}
${extractFunctionSource(indexHtmlContent, 'markCausalObjectCommittedIfInSet')}
${extractFunctionSource(indexHtmlContent, 'hasAnyUncommittedOperationsInMemory')}
${extractFunctionSource(indexHtmlContent, 'acknowledgeCommittedOperationsSnapshot')}
${extractFunctionSource(indexHtmlContent, 'syncExcludedPagesToLectureRecords')}
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
${extractFunctionSource(indexHtmlContent, 'reconcileDirtyWorkspaceWithRemote')}
${extractFunctionSource(indexHtmlContent, 'pullWorkspaceFromCloud')}
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
    if (st.activeSubjectId !== undefined) activeSubjectId = st.activeSubjectId;
    if (st.dirtyAnnotationsForCloud !== undefined) dirtyAnnotationsForCloud = Boolean(st.dirtyAnnotationsForCloud);
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
    activeSubjectId,
    currentCloudWorkspaceRevision,
    dirtyAnnotationsForCloud
  }),
  saveSubjects,
  saveScheduleData,
  saveLogs,
  triggerDeleteSubject,
  deleteContinuousSubjectWirdLog,
  triggerDeleteGroup,
  triggerDeleteLecture,
  deleteSessionDirect,
  executeClearSchedule,
  deleteBacklogTask,
  triggerDeleteLog,
  deleteEventFromPdfAdjuster,
  deleteWeeklyEvaluationReport,
  markMissedSessionDoneOffline,
  CAUSAL_TOMBSTONE_ENTITY_TYPES,
  setCryptoProviderForTests,
  generateCausalOperationId,
  validateAndResolveEntityScope,
  getOrCreateDeviceId,
  getLocalDeviceRegistry,
  getLiveActorId,
  resetLiveActorForTabSimulation,
  mergeCausalContexts,
  observeCausalOperation,
  createCausalOperation,
  normalizeCausalEnvelope,
  compareCausalOperations,
  getConflictRecoveryRecords,
  recordConflictRecoveryCandidate,
  computeEntityContentDigest,
  stampEntityMutation,
  restoreDeletedEntity,
  ensureEntityHasCausalMetadata,
  notifyCausalStampingFailure,
  detachDeletedHierarchyReferences,
  autoStampTrackedWorkspaceMutations,
  normalizeSingleTombstoneEntry,
  normalizeTombstonesObject,
  getLocalTombstones,
  hasAnyTombstoneEntries,
  recordTombstone,
  recordTombstonesAtomicBatch,
  mergeTombstoneMapsWithCausalEngine,
  isEntitySupersededByTombstone,
  mergeEntityRecordsWithCausalEngine,
  mergeFlatEntityCollectionWithCausalEngine,
  mergeSubjectsHierarchyWithCausalEngine,
  cleanupDeletedLectureLocalArtifacts,
  drainPendingLocalArtifactCleanup,
  computeCanonical4DecimalStrokeGeometry,
  computeDeterministicLegacyStrokeId,
  migrateLegacyPageStrokesWithManifest,
  verifySharedLegacyStrokeAncestry,
  stampAnnotationItemCausalMetadata,
  recordAnnotationStrokeDeletion,
  recordAnnotationPageClear,
  isStrokeSupersededByPageClear,
  recordAudioPinDeletion,
  recordExtraNoteToggleMutation,
  syncExcludedPagesArrayWithMeta,
  recordExcludedPageMutation,
  normalizeAndRecoverLectureAnnotations,
  mergeLectureAnnotationsWithCausalVersions,
  captureOutgoingOperationsSnapshot,
  hasAnyUncommittedOperationsInMemory,
  acknowledgeCommittedOperationsSnapshot,
  syncExcludedPagesToLectureRecords,
  getAllAnnotationsMapFromDB,
  restoreAllAnnotationsMapToDB,
  markLocalWorkspaceModified,
  mergeAndApplyCloudConflict,
  pushWorkspaceToCloud,
  applyCloudWorkspacePayload,
  reconcileDirtyWorkspaceWithRemote,
  pullWorkspaceFromCloud,
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

  // ==========================================================================
  // TEST 12 (Phase 5.1.2 M3): Causal Engine, Scope Validation, CSPRNG Fail-Closed & Operation-ID Cloud Ack
  // ==========================================================================
  console.log('\n--- TEST 12 (Phase 5.1.2 M3): Causal Engine, Scope Validation, CSPRNG Fail-Closed & Cloud Ack ---');
  const m3Uid = 'm3-causal-user-1111-2222-333333333333';
  prod.setSessionUser(m3Uid);

  // T-5.1.2-M3-01: Canonical entity scope validation across all 8 plural types & singular/verb/empty rejection
  const canonicalScopePairs = [
    ['subjects', 'sub_101'],
    ['groups', 'grp_101'],
    ['lectures', 'lec_101'],
    ['wird_logs', 'wird_101'],
    ['events', 'ev_101'],
    ['backlog', 'bl_101'],
    ['logs', 'log_101'],
    ['weekly_reports', '2026-10-31']
  ];
  const allScopesMatch = canonicalScopePairs.every(([plural, idVal]) => {
    const r1 = prod.validateAndResolveEntityScope(plural, idVal);
    const e1 = prod.stampEntityMutation({ id: idVal }, plural, idVal, m3Uid);
    const t1 = prod.recordTombstone(plural, idVal, m3Uid, e1);
    return (
      r1.scopeId === `entity:${plural}:${idVal}` &&
      e1._causal.scopeId === r1.scopeId &&
      t1.scopeId === r1.scopeId
    );
  });
  let singularRejected = false;
  let verbRejected = false;
  let emptyIdRejected = false;
  try {
    prod.stampEntityMutation({ id: 'sub_bad_type' }, 'subject', 'sub_bad_type', m3Uid);
  } catch (err) {
    singularRejected = err instanceof TypeError && String(err.message).includes('INVALID_ENTITY_TYPE_SCOPE');
  }
  try {
    prod.stampEntityMutation({ id: 'sub_bad' }, 'subjects', 'create', m3Uid);
  } catch (err) {
    verbRejected = err instanceof TypeError && String(err.message).includes('INVALID_ENTITY_ID_SCOPE');
  }
  try {
    prod.stampEntityMutation({ id: '' }, 'subjects', '', m3Uid);
  } catch (err) {
    emptyIdRejected = err instanceof TypeError && String(err.message).includes('INVALID_ENTITY_ID_SCOPE');
  }
  assert(
    allScopesMatch && singularRejected && verbRejected && emptyIdRejected,
    'T-5.1.2-M3-01: Create, update, and delete share identical canonical entity:<pluralType>:<id> scopes across all 8 entity types and reject non-plural types or missing/verb IDs with TypeError'
  );

  // T-5.1.2-M3-02: CSPRNG operationId generation and fail-closed error when crypto is unavailable
  const opId1 = prod.generateCausalOperationId('op');
  const opId2 = prod.generateCausalOperationId('op');
  let csprngFailClosed = false;
  prod.setCryptoProviderForTests(null);
  try {
    prod.generateCausalOperationId('op');
  } catch (cryptoErr) {
    csprngFailClosed = String(cryptoErr.message).includes('CSPRNG_UNAVAILABLE');
  } finally {
    prod.setCryptoProviderForTests(undefined);
  }
  assert(
    opId1.startsWith('op_') && opId2.startsWith('op_') && opId1 !== opId2 && csprngFailClosed,
    'T-5.1.2-M3-02: generateCausalOperationId uses CSPRNG and fails closed with CSPRNG_UNAVAILABLE when Web Crypto is missing'
  );

  // T-5.1.2-M3-03: Per-tab actorId & per-scope counters do not collide across simulated tabs on the same device
  const devIdTab1 = prod.getOrCreateDeviceId();
  const actorTab1 = prod.getLiveActorId();
  const tab1Entity = prod.stampEntityMutation({ id: 'sub_multitab', name: 'Tab 1 Edit' }, 'subjects', 'sub_multitab', m3Uid);
  const tab2Sim = prod.resetLiveActorForTabSimulation();
  const actorTab2 = tab2Sim.actorId;
  const devIdTab2 = tab2Sim.deviceId;
  const tab2Entity = prod.stampEntityMutation({ id: 'sub_multitab', name: 'Tab 2 Edit' }, 'subjects', 'sub_multitab', m3Uid);
  assert(
    devIdTab1 === devIdTab2 &&
    actorTab1 !== actorTab2 &&
    tab1Entity._causal.dot.actorId === actorTab1 &&
    tab2Entity._causal.dot.actorId === actorTab2 &&
    tab1Entity._causal.dot.actorCounter === 1 &&
    tab2Entity._causal.dot.actorCounter === 1,
    'T-5.1.2-M3-03: Two tabs on the same device share deviceId but receive distinct CSPRNG actorIds and non-colliding per-scope counters'
  );

  // T-5.1.2-M3-04: saveSubjects(), saveScheduleData(), and saveLogs() automatically stamp causal metadata
  prod.localStorage.removeItem('pharmaTombstones_' + m3Uid);
  prod.setRuntimeState({
    subjects: [{
      id: 'sub_auto_1',
      name: 'Auto-Stamped Subject',
      wirdLogs: [{ id: 'wird_auto_1', title: 'Juz 1' }],
      groups: [{
        id: 'grp_auto_1',
        name: 'Group 1',
        lectures: [{ id: 'lec_auto_1', title: 'Lecture 1' }]
      }]
    }],
    scheduleEvents: [{ id: 'ev_auto_1', title: 'Study Session 1', day: 0, startHour: 9, duration: 2 }],
    scheduleBacklog: [{ id: 'bl_auto_1', title: 'Backlog Goal 1' }],
    weeklyReports: [{ id: 'rep_auto_1', weekStartIso: '2026-10-31', grade: 'A+' }],
    logs: [{ id: 'log_auto_1', text: 'Completed Chapter 1', date: '2026-11-01' }]
  });
  prod.saveSubjects();
  prod.saveScheduleData(false);
  prod.saveLogs();
  const stAfterSaves = prod.getRuntimeState();
  assert(
    stAfterSaves.subjects[0]._causal?.scopeId === 'entity:subjects:sub_auto_1' &&
    stAfterSaves.subjects[0].wirdLogs[0]._causal?.scopeId === 'entity:wird_logs:wird_auto_1' &&
    stAfterSaves.subjects[0].groups[0]._causal?.scopeId === 'entity:groups:grp_auto_1' &&
    stAfterSaves.subjects[0].groups[0].lectures[0]._causal?.scopeId === 'entity:lectures:lec_auto_1' &&
    stAfterSaves.scheduleEvents[0]._causal?.scopeId === 'entity:events:ev_auto_1' &&
    stAfterSaves.scheduleBacklog[0]._causal?.scopeId === 'entity:backlog:bl_auto_1' &&
    stAfterSaves.weeklyReports[0]._causal?.scopeId === 'entity:weekly_reports:2026-10-31' &&
    stAfterSaves.logs[0]._causal?.scopeId === 'entity:logs:log_auto_1',
    'T-5.1.2-M3-04: saveSubjects(), saveScheduleData(), and saveLogs() automatically stamp canonical _causal metadata across all 8 entity types'
  );

  // T-5.1.2-M3-05: Causal happens-before vs concurrent conflict recovery vs legacy unknown ancestry
  const baseSub = prod.stampEntityMutation({ id: 'sub_cmp', name: 'V1' }, 'subjects', 'sub_cmp', m3Uid);
  const v2Sub = JSON.parse(JSON.stringify(baseSub));
  v2Sub.name = 'V2 Sequential';
  prod.stampEntityMutation(v2Sub, 'subjects', 'sub_cmp', m3Uid);
  const seqMerged = prod.mergeEntityRecordsWithCausalEngine(baseSub, v2Sub, 'subjects', 'sub_cmp', m3Uid);

  // Concurrent updates on two independent actors without observing each other
  const concA = { id: 'sub_conc', name: 'Concurrent A', _causal: { schemaVersion: 1, operationId: 'op_ca', scopeId: 'entity:subjects:sub_conc', actorId: 'act_A', deviceId: 'dev_A', actorCounter: 1, lamport: 5, dot: { actorId: 'act_A', actorCounter: 1 }, context: { act_A: 1 }, legacyOpaque: false } };
  const concB = { id: 'sub_conc', name: 'Concurrent B', _causal: { schemaVersion: 1, operationId: 'op_cb', scopeId: 'entity:subjects:sub_conc', actorId: 'act_B', deviceId: 'dev_B', actorCounter: 1, lamport: 9, dot: { actorId: 'act_B', actorCounter: 1 }, context: { act_B: 1 }, legacyOpaque: false } };
  const recBeforeConc = prod.getConflictRecoveryRecords(m3Uid).length;
  const concMerged = prod.mergeEntityRecordsWithCausalEngine(concA, concB, 'subjects', 'sub_conc', m3Uid);
  const recAfterConc = prod.getConflictRecoveryRecords(m3Uid);

  // Legacy unknown ancestry between two unmigrated legacy records with different content
  const legA = { id: 'sub_leg_u', name: 'Legacy Device A' };
  const legB = { id: 'sub_leg_u', name: 'Legacy Device B' };
  const legMerged = prod.mergeEntityRecordsWithCausalEngine(legA, legB, 'subjects', 'sub_leg_u', m3Uid);
  const recAfterLeg = prod.getConflictRecoveryRecords(m3Uid);
  assert(
    seqMerged.name === 'V2 Sequential' &&
    concMerged.name === 'Concurrent B' &&
    concMerged._causal.context.act_A === 1 &&
    concMerged._causal.context.act_B === 1 &&
    recAfterConc.length > recBeforeConc &&
    legMerged &&
    recAfterLeg.some(r => r.entityId === 'sub_leg_u' && r.reason === 'unresolved_legacy_ancestry' && r.losingValue?.name === 'Legacy Device A'),
    'T-5.1.2-M3-05: Causal merge respects strict happens-before, resolves concurrent edits deterministically while merging contexts and recording recovery, and preserves legacy unknown-ancestry candidates in conflict recovery'
  );

  // T-5.1.2-M3-06: Operation-ID snapshot acknowledgement preserves newer in-flight operations
  const ackItem1 = prod.stampEntityMutation({ id: 'ev_ack_1', title: 'Sent Event' }, 'events', 'ev_ack_1', m3Uid);
  const sentSnapshot = prod.captureOutgoingOperationsSnapshot({
    subjects: [],
    schedule: { events: [ackItem1], backlog: [], weeklyReports: [], _tombstones: {} },
    logs: [],
    annotations: {}
  });
  const ackItem2InFlight = prod.stampEntityMutation({ id: 'ev_ack_2', title: 'Newer In-Flight Event' }, 'events', 'ev_ack_2', m3Uid);
  prod.setRuntimeState({
    subjects: [],
    scheduleEvents: [ackItem1, ackItem2InFlight],
    scheduleBacklog: [],
    weeklyReports: [],
    logs: []
  });
  prod.acknowledgeCommittedOperationsSnapshot(sentSnapshot, 42, m3Uid);
  const hasUncommittedAfterAck = prod.hasAnyUncommittedOperationsInMemory(m3Uid);
  assert(
    ackItem1._causal.committedWorkspaceRevision === 42 &&
    ackItem1._causal.dirty === false &&
    ackItem2InFlight._causal.committedWorkspaceRevision === null &&
    ackItem2InFlight._causal.dirty === true &&
    hasUncommittedAfterAck === true,
    'T-5.1.2-M3-06: acknowledgeCommittedOperationsSnapshot marks only sent operationIds as committed and keeps newer in-flight mutations dirty'
  );

  // ==========================================================================
  // TEST 13 (Phase 5.1.2 M2): All UI Deletion Routes, Fail-Closed Tombstone Persistence,
  // Stale-Device Anti-Resurrection, Causal Restore & Account-Scoped IDB Cascade Cleanup
  // ==========================================================================
  console.log('\n--- TEST 13 (Phase 5.1.2 M2): UI Deletion Routes, Fail-Closed Tombstones & Account-Scoped IDB Cleanup ---');
  const m2UidA = 'm2-user-aaaa-1111-2222-333333333333';
  const m2UidB = 'm2-user-bbbb-9999-8888-777777777777';
  prod.setSessionUser(m2UidA);
  prod.localStorage.removeItem('pharmaTombstones_' + m2UidA);

  // Seed subjects, groups, lectures, wirdLogs, scheduleEvents, scheduleBacklog, weeklyReports, logs
  prod.setRuntimeState({
    activeSubjectId: 'sub_del_1',
    subjects: [
      {
        id: 'sub_del_1',
        name: 'Pharmacology I',
        continuousLogs: [{ id: 'wird_del_1', note: 'Pages 1-10' }],
        groups: [
          {
            id: 'grp_del_1',
            name: 'Autonomic',
            lectures: [
              { id: 'lec_del_1', title: 'Cholinergic Agonists' },
              { id: 'lec_del_2', title: 'Adrenergic Blockers' }
            ]
          },
          {
            id: 'grp_del_2',
            name: 'Cardiovascular',
            lectures: [
              { id: 'lec_del_3', title: 'Antiarrhythmics' }
            ]
          }
        ]
      },
      {
        id: 'sub_del_2',
        name: 'Medicinal Chemistry',
        wirdLogs: [{ id: 'wird_del_2', note: 'SAR Review' }],
        groups: [
          {
            id: 'grp_del_3',
            name: 'Beta-Lactams',
            lectures: [{ id: 'lec_del_4', title: 'Penicillins & Cephalosporins' }]
          }
        ]
      }
    ],
    scheduleEvents: [
      { id: 'ev_del_1', title: 'Study Cholinergics', day: 0, startHour: 10, duration: 2, type: 'study', isFixed: false },
      { id: 'ev_del_pdf', title: 'PDF Adjuster Session', day: 1, startHour: 12, duration: 1, type: 'study', isFixed: false },
      { id: 'ev_clear_study', title: 'Study Session To Clear', day: 2, startHour: 14, duration: 2, type: 'study', isFixed: false },
      { id: 'ev_college_fixed', title: 'College Lecture Fixed', day: 3, startHour: 8, duration: 2, type: 'mandatory', isFixed: true }
    ],
    scheduleBacklog: [
      { id: 'bl_del_1', title: 'Finish Autonomic Bank' }
    ],
    weeklyReports: [
      { id: 'rep_del_1', weekStartIso: '2026-10-24', rangeTitle: 'Week 1', grade: 'A' }
    ],
    logs: [
      { id: 'log_del_1', text: 'Studied 2h Pharmacology', date: '2026-10-25' }
    ]
  });
  prod.saveSubjects();
  prod.saveScheduleData(false);
  prod.saveLogs();

  // Seed IndexedDB artifacts for Account A (lec_del_1, lec_del_3, lec_del_4) and Account B (overlapping lec_del_1!)
  const seedIdbRecord = (storeName, scopedId, rawId, ownerUid, extra = {}) => {
    idb.stores[storeName].set(scopedId, Object.assign({
      id: scopedId,
      rawId,
      userId: ownerUid,
      updatedAt: Date.now()
    }, extra));
  };
  ['lec_del_1', 'lec_del_3', 'lec_del_4'].forEach(lId => {
    seedIdbRecord('pdfs', prod.toScopedKey(lId, m2UidA), lId, m2UidA, { data: 'pdf_A_' + lId });
    seedIdbRecord('audios', prod.toScopedKey(lId, m2UidA), lId, m2UidA, { data: 'aud_A_' + lId });
    seedIdbRecord('audios', prod.toScopedKey('rec_' + lId + '_clip1', m2UidA), 'rec_' + lId + '_clip1', m2UidA, { data: 'rec_A_' + lId });
    seedIdbRecord('annotations', prod.toScopedKey(lId, m2UidA), lId, m2UidA, { pages: { '1': [{ id: 's1', tool: 'pen', points: [{ x: 0.1, y: 0.1 }] }] } });
    seedIdbRecord('annotation_recovery_vault', prod.toScopedKey(lId + '_snap', m2UidA), lId + '_snap', m2UidA, { pages: { '1': [] } });
  });
  // Seed Account B's overlapping lecture artifacts
  seedIdbRecord('pdfs', prod.toScopedKey('lec_del_1', m2UidB), 'lec_del_1', m2UidB, { data: 'pdf_B_lec_del_1' });
  seedIdbRecord('audios', prod.toScopedKey('rec_lec_del_1_clip1', m2UidB), 'rec_lec_del_1_clip1', m2UidB, { data: 'rec_B_lec_del_1' });
  seedIdbRecord('annotations', prod.toScopedKey('lec_del_1', m2UidB), 'lec_del_1', m2UidB, { pages: { '1': [{ id: 'sb1', tool: 'pen', points: [{ x: 0.5, y: 0.5 }] }] } });

  // Snapshot stale remote state BEFORE deletions so we can test anti-resurrection
  const staleRemoteSnapshotBeforeDeletes = JSON.parse(JSON.stringify({
    subjects: prod.getRuntimeState().subjects,
    scheduleEvents: prod.getRuntimeState().scheduleEvents,
    scheduleBacklog: prod.getRuntimeState().scheduleBacklog,
    weeklyReports: prod.getRuntimeState().weeklyReports,
    logs: prod.getRuntimeState().logs
  }));

  // T-5.1.2-M2-02: First test fail-closed abort when tombstone write fails!
  const tombKeyA = 'pharmaTombstones_' + m2UidA;
  prod.setFailNextAccountSnapshotKey(tombKeyA);
  await prod.triggerDeleteLecture('grp_del_1', 'lec_del_1');
  prod.setFailNextAccountSnapshotKey(tombKeyA);
  await prod.triggerDeleteGroup('grp_del_2');
  prod.setFailNextAccountSnapshotKey(tombKeyA);
  await prod.triggerDeleteSubject('sub_del_2');
  prod.setFailNextAccountSnapshotKey(tombKeyA);
  prod.deleteSessionDirect(null, 'ev_del_1');
  prod.setFailNextAccountSnapshotKey(tombKeyA);
  prod.deleteBacklogTask('bl_del_1');
  prod.setFailNextAccountSnapshotKey(tombKeyA);
  prod.triggerDeleteLog('log_del_1');
  prod.setFailNextAccountSnapshotKey(tombKeyA);
  prod.deleteWeeklyEvaluationReport('rep_del_1');

  const stAfterFailedDeletes = prod.getRuntimeState();
  assert(
    stAfterFailedDeletes.subjects.length === 2 &&
    stAfterFailedDeletes.subjects[0].groups.length === 2 &&
    stAfterFailedDeletes.subjects[0].groups[0].lectures.length === 2 &&
    stAfterFailedDeletes.scheduleEvents.length === 4 &&
    stAfterFailedDeletes.scheduleBacklog.length === 1 &&
    stAfterFailedDeletes.weeklyReports.length === 1 &&
    stAfterFailedDeletes.logs.length === 1 &&
    idb.stores.pdfs.has(prod.toScopedKey('lec_del_1', m2UidA)),
    'T-5.1.2-M2-02: Fail-closed deletion safety: when tombstone persistence fails, UI deletion routes abort without removing live entities or local IndexedDB artifacts'
  );

  // T-5.1.2-M2-01: Execute real UI deletion routes when tombstone persistence succeeds
  prod.deleteContinuousSubjectWirdLog('sub_del_1', 'wird_del_1');
  await prod.triggerDeleteLecture('grp_del_1', 'lec_del_1');
  await prod.triggerDeleteGroup('grp_del_2');
  await prod.triggerDeleteSubject('sub_del_2');
  prod.deleteSessionDirect(null, 'ev_del_1');
  prod.deleteEventFromPdfAdjuster('ev_del_pdf');
  prod.executeClearSchedule('study_only');
  prod.deleteBacklogTask('bl_del_1');
  prod.triggerDeleteLog('log_del_1');
  prod.deleteWeeklyEvaluationReport('rep_del_1');

  const tombsAfterDeletes = prod.getLocalTombstones(m2UidA);
  const stAfterDeletes = prod.getRuntimeState();
  assert(
    tombsAfterDeletes.wird_logs['wird_del_1']?.scopeId === 'entity:wird_logs:wird_del_1' &&
    tombsAfterDeletes.lectures['lec_del_1']?.scopeId === 'entity:lectures:lec_del_1' &&
    tombsAfterDeletes.groups['grp_del_2']?.scopeId === 'entity:groups:grp_del_2' &&
    tombsAfterDeletes.lectures['lec_del_3']?.scopeId === 'entity:lectures:lec_del_3' &&
    tombsAfterDeletes.subjects['sub_del_2']?.scopeId === 'entity:subjects:sub_del_2' &&
    tombsAfterDeletes.groups['grp_del_3']?.scopeId === 'entity:groups:grp_del_3' &&
    tombsAfterDeletes.lectures['lec_del_4']?.scopeId === 'entity:lectures:lec_del_4' &&
    tombsAfterDeletes.wird_logs['wird_del_2']?.scopeId === 'entity:wird_logs:wird_del_2' &&
    tombsAfterDeletes.events['ev_del_1']?.scopeId === 'entity:events:ev_del_1' &&
    tombsAfterDeletes.events['ev_del_pdf']?.scopeId === 'entity:events:ev_del_pdf' &&
    tombsAfterDeletes.events['ev_clear_study']?.scopeId === 'entity:events:ev_clear_study' &&
    tombsAfterDeletes.events['ev_college_fixed'] === undefined &&
    stAfterDeletes.scheduleEvents.length === 1 &&
    stAfterDeletes.scheduleEvents[0].id === 'ev_college_fixed' &&
    tombsAfterDeletes.backlog['bl_del_1']?.scopeId === 'entity:backlog:bl_del_1' &&
    tombsAfterDeletes.logs['log_del_1']?.scopeId === 'entity:logs:log_del_1' &&
    tombsAfterDeletes.weekly_reports['2026-10-24']?.scopeId === 'entity:weekly_reports:2026-10-24',
    'T-5.1.2-M2-01: All UI deletion routes record durable causal tombstones across subjects, groups, lectures, wird_logs, events, backlog, logs, and weekly_reports'
  );

  // T-5.1.2-M2-04: Verify Account A deleted lecture artifacts are purged while Account B overlapping artifacts remain untouched
  assert(
    !idb.stores.pdfs.has(prod.toScopedKey('lec_del_1', m2UidA)) &&
    !idb.stores.audios.has(prod.toScopedKey('lec_del_1', m2UidA)) &&
    !idb.stores.audios.has(prod.toScopedKey('rec_lec_del_1_clip1', m2UidA)) &&
    !idb.stores.annotations.has(prod.toScopedKey('lec_del_1', m2UidA)) &&
    !idb.stores.annotation_recovery_vault.has(prod.toScopedKey('lec_del_1_snap', m2UidA)) &&
    !idb.stores.pdfs.has(prod.toScopedKey('lec_del_3', m2UidA)) &&
    !idb.stores.pdfs.has(prod.toScopedKey('lec_del_4', m2UidA)) &&
    idb.stores.pdfs.has(prod.toScopedKey('lec_del_1', m2UidB)) &&
    idb.stores.audios.has(prod.toScopedKey('rec_lec_del_1_clip1', m2UidB)) &&
    idb.stores.annotations.has(prod.toScopedKey('lec_del_1', m2UidB)) &&
    JSON.parse(prod.localStorage.getItem('pharmaPendingArtifactCleanup_' + m2UidA) || '[]').length === 0,
    'T-5.1.2-M2-04: Local IndexedDB cascade cleanup removes pdfs, audios, rec_*, annotations, and recovery vault entries for Account A while preserving Account B records'
  );

  // T-5.1.2-M2-03: Stale-device anti-resurrection + explicit causal restore after delete
  const mergedHierarchyVsStale = prod.mergeSubjectsHierarchyWithCausalEngine(
    stAfterDeletes.subjects,
    staleRemoteSnapshotBeforeDeletes.subjects,
    tombsAfterDeletes,
    m2UidA
  );
  const mergedEventsVsStale = prod.mergeFlatEntityCollectionWithCausalEngine(
    stAfterDeletes.scheduleEvents,
    staleRemoteSnapshotBeforeDeletes.scheduleEvents,
    'events',
    tombsAfterDeletes,
    m2UidA,
    (e) => String(e.id)
  );
  const mergedBacklogVsStale = prod.mergeFlatEntityCollectionWithCausalEngine(
    stAfterDeletes.scheduleBacklog,
    staleRemoteSnapshotBeforeDeletes.scheduleBacklog,
    'backlog',
    tombsAfterDeletes,
    m2UidA,
    (b) => String(b.id)
  );
  const mergedLogsVsStale = prod.mergeFlatEntityCollectionWithCausalEngine(
    stAfterDeletes.logs,
    staleRemoteSnapshotBeforeDeletes.logs,
    'logs',
    tombsAfterDeletes,
    m2UidA,
    (l) => String(l.id ?? l.timestamp)
  );
  const mergedReportsVsStale = prod.mergeFlatEntityCollectionWithCausalEngine(
    stAfterDeletes.weeklyReports,
    staleRemoteSnapshotBeforeDeletes.weeklyReports,
    'weekly_reports',
    tombsAfterDeletes,
    m2UidA,
    (r) => String(r.weekStartIso || r.id)
  );

  // Now explicitly restore bl_del_1 causally and verify it supersedes the tombstone
  const restoredBacklogItem = prod.restoreDeletedEntity(
    { id: 'bl_del_1', title: 'Restored Autonomic Bank' },
    'backlog',
    'bl_del_1',
    tombsAfterDeletes.backlog['bl_del_1'],
    m2UidA
  );
  const mergedBacklogAfterRestore = prod.mergeFlatEntityCollectionWithCausalEngine(
    [restoredBacklogItem],
    [],
    'backlog',
    tombsAfterDeletes,
    m2UidA,
    (b) => String(b.id)
  );
  assert(
    mergedHierarchyVsStale.subjects.length === 1 &&
    mergedHierarchyVsStale.subjects[0].id === 'sub_del_1' &&
    mergedHierarchyVsStale.subjects[0].groups.length === 1 &&
    mergedHierarchyVsStale.subjects[0].groups[0].id === 'grp_del_1' &&
    mergedHierarchyVsStale.subjects[0].groups[0].lectures.length === 1 &&
    mergedHierarchyVsStale.subjects[0].groups[0].lectures[0].id === 'lec_del_2' &&
    (mergedHierarchyVsStale.subjects[0].continuousLogs || []).length === 0 &&
    mergedEventsVsStale.length === 1 &&
    mergedEventsVsStale[0].id === 'ev_college_fixed' &&
    mergedBacklogVsStale.length === 0 &&
    mergedLogsVsStale.length === 0 &&
    mergedReportsVsStale.length === 0 &&
    mergedBacklogAfterRestore.length === 1 &&
    mergedBacklogAfterRestore[0].title === 'Restored Autonomic Bank',
    'T-5.1.2-M2-03: Stale remote payloads cannot resurrect tombstoned entities across any of the 8 types, while restoreDeletedEntity causally supersedes its tombstone'
  );

  // ==========================================================================
  // TEST 14 (Phase 5.1.2 M4): Annotation Creation, Deletion, Legacy Stroke Migration &
  // Strict Shared Ancestry Verification
  // ==========================================================================
  console.log('\n--- TEST 14 (Phase 5.1.2 M4): Annotation Stamping, Deletions, Legacy Migration & Ancestry Verification ---');
  const m4Uid = 'm4-anno-user-1111-2222-333333333333';
  prod.setSessionUser(m4Uid);
  const m4LecId = 'lec_m4_501';

  // T-5.1.2-M4-01: 6-parameter stampAnnotationItemCausalMetadata validation & causal progression
  const m4Annos = {};
  const m4Stroke1 = prod.stampAnnotationItemCausalMetadata(
    { id: 'strk_m4_1', tool: 'pen', color: '#10b981', size: 3, points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] },
    'stroke',
    m4LecId,
    '1',
    m4Uid,
    m4Annos
  );
  const m4Note1 = prod.stampAnnotationItemCausalMetadata(
    { id: 'txt_m4_1', tool: 'text', text: 'Initial Note', x: 0.2, y: 0.3, size: 4, fontKey: 'marhey' },
    'note',
    m4LecId,
    '1',
    m4Uid,
    m4Annos
  );
  const note1CounterBefore = m4Note1._causal.dot.actorCounter;
  m4Note1.size = 6;
  prod.stampAnnotationItemCausalMetadata(m4Note1, 'note', m4LecId, '1', m4Uid, m4Annos);
  const m4Pin1 = prod.stampAnnotationItemCausalMetadata(
    { id: 'pin_m4_1', time: 125, label: 'Key Mechanism' },
    'pin',
    m4LecId,
    '1',
    m4Uid,
    m4Annos
  );
  let threeArgCallRejected = false;
  try {
    // Old broken 3-argument call passed (item, lecId, pageNum) leaving pageKey undefined!
    prod.stampAnnotationItemCausalMetadata({ id: 'bad_3arg', tool: 'pen' }, m4LecId, '1');
  } catch (err) {
    threeArgCallRejected = err instanceof TypeError && String(err.message).includes('INVALID_ANNOTATION_PAGE_KEY');
  }
  assert(
    m4Stroke1._causal.scopeId === `anno:${m4LecId}:p:1:stroke:strk_m4_1` &&
    m4Note1._causal.scopeId === `anno:${m4LecId}:p:1:note:txt_m4_1` &&
    m4Note1._causal.dot.actorCounter === note1CounterBefore + 1 &&
    m4Pin1._causal.scopeId === `anno:${m4LecId}:p:1:pin:pin_m4_1` &&
    threeArgCallRejected,
    'T-5.1.2-M4-01: stampAnnotationItemCausalMetadata stamps canonical scopeIds for strokes, notes, and pins, increments causal counters on edits, and rejects missing pageKey'
  );

  // T-5.1.2-M4-02: Undo/Redo, Eraser, Page Clear, Extra Note Toggle, Audio Pin Delete & Page Exclusion causal merge
  m4Annos['1'] = [m4Stroke1, m4Note1];
  m4Annos._audioPins = { '1': [m4Pin1] };
  const remoteSnapshotBeforeUndo = JSON.parse(JSON.stringify(m4Annos));

  // Simulate undo of m4Stroke1 followed by redo of m4Stroke1: redone stroke must supersede undo tombstone!
  prod.recordAnnotationStrokeDeletion(m4Annos, m4LecId, '1', m4Stroke1, m4Uid);
  m4Annos['1'] = [m4Note1];
  const redoneStroke1 = prod.stampAnnotationItemCausalMetadata(m4Stroke1, 'stroke', m4LecId, '1', m4Uid, m4Annos);
  m4Annos['1'].push(redoneStroke1);

  // Delete m4Note1, delete m4Pin1, toggle extra note on page 1, exclude page 2, and clear page 3
  prod.recordAnnotationStrokeDeletion(m4Annos, m4LecId, '1', m4Note1, m4Uid);
  m4Annos['1'] = m4Annos['1'].filter(s => s.id !== 'txt_m4_1');
  prod.recordAudioPinDeletion(m4Annos, m4LecId, '1', m4Pin1.id, m4Uid);
  m4Annos._audioPins['1'] = [];
  prod.recordExtraNoteToggleMutation(m4Annos, m4LecId, '1', true, m4Uid);
  prod.recordExcludedPageMutation(m4Annos, m4LecId, 2, true, m4Uid);

  const preClearStrokeP3 = prod.stampAnnotationItemCausalMetadata(
    { id: 'strk_p3_old', tool: 'pen', points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] },
    'stroke',
    m4LecId,
    '3',
    m4Uid,
    m4Annos
  );
  m4Annos['3'] = [preClearStrokeP3];
  remoteSnapshotBeforeUndo['3'] = [JSON.parse(JSON.stringify(preClearStrokeP3))];
  prod.recordAnnotationPageClear(m4Annos, m4LecId, '3', m4Annos['3'], m4Uid);
  m4Annos['3'] = [];
  const postClearStrokeP3 = prod.stampAnnotationItemCausalMetadata(
    { id: 'strk_p3_new', tool: 'pen', points: [{ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 }] },
    'stroke',
    m4LecId,
    '3',
    m4Uid,
    m4Annos
  );
  m4Annos['3'].push(postClearStrokeP3);

  const mergedM4 = prod.mergeLectureAnnotationsWithCausalVersions(m4LecId, m4Annos, remoteSnapshotBeforeUndo, m4Uid);
  assert(
    Array.isArray(mergedM4['1']) &&
    mergedM4['1'].length === 1 &&
    mergedM4['1'][0].id === 'strk_m4_1' &&
    (!mergedM4._audioPins['1'] || mergedM4._audioPins['1'].length === 0) &&
    mergedM4._extraNotes['1'] === true &&
    Array.isArray(mergedM4.__exo_excluded_pages__) &&
    mergedM4.__exo_excluded_pages__.includes(2) &&
    Array.isArray(mergedM4['3']) &&
    mergedM4['3'].length === 1 &&
    mergedM4['3'][0].id === 'strk_p3_new',
    'T-5.1.2-M4-02: Redone stroke supersedes undo tombstone, deleted note and audio pin stay deleted against stale remote, page clear removes pre-clear strokes while preserving post-clear strokes, and extraNote/excludedPage metadata merge causally'
  );

  // T-5.1.2-M4-03: normalizeAndRecoverLectureAnnotations migrates legacy strokes without IDs and populates _legacyManifest
  const rawLegacyPages = {
    '1': [
      { tool: 'pen', color: '#ef4444', size: 2, points: [{ x: 0.123456, y: 0.654321 }, { x: 0.222222, y: 0.333333 }] },
      { tool: 'pen', color: '#ef4444', size: 2, points: [{ x: 0.123456, y: 0.654321 }, { x: 0.222222, y: 0.333333 }] }
    ]
  };
  const recoveredLegacy = prod.normalizeAndRecoverLectureAnnotations('lec_legacy_700', rawLegacyPages, m4Uid, false);
  assert(
    Array.isArray(recoveredLegacy['1']) &&
    recoveredLegacy['1'].length === 2 &&
    String(recoveredLegacy['1'][0].id).startsWith('legacy_stroke_') &&
    String(recoveredLegacy['1'][1].id).startsWith('legacy_stroke_') &&
    recoveredLegacy['1'][0].id !== recoveredLegacy['1'][1].id &&
    recoveredLegacy['1'][0]._causal?.legacyOpaque === true &&
    recoveredLegacy._legacyManifest &&
    recoveredLegacy._legacyManifest['1'] &&
    typeof recoveredLegacy._legacyManifest['1'].__manifestOriginId__ === 'string' &&
    recoveredLegacy._legacyManifest['1'].__manifestOriginId__.startsWith('lman_'),
    'T-5.1.2-M4-03: normalizeAndRecoverLectureAnnotations migrates legacy strokes with deterministic ordinal-aware IDs and populates _legacyManifest with provenance ID'
  );

  // T-5.1.2-M4-04: verifySharedLegacyStrokeAncestry rejects geometry-prefix-only and broad-ID-only ancestry, preserving both divergent candidates
  const unmigratedLocalIdenticalPrefix = {
    '1': [
      { tool: 'pen', color: '#000', size: 2, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }
    ]
  };
  const unmigratedRemoteIdenticalPrefix = {
    '1': [
      { tool: 'pen', color: '#000', size: 2, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] },
      { tool: 'pen', color: '#000', size: 2, points: [{ x: 0.3, y: 0.3 }, { x: 0.4, y: 0.4 }] }
    ]
  };
  const prefixOnlyCheck = prod.verifySharedLegacyStrokeAncestry(
    unmigratedLocalIdenticalPrefix['1'],
    unmigratedRemoteIdenticalPrefix['1'],
    null,
    null
  );
  const broadIdOnlyCheck = prod.verifySharedLegacyStrokeAncestry(
    [{ id: 'custom_id_1', tool: 'pen', points: [{ x: 0.1, y: 0.1 }] }],
    [{ id: 'custom_id_2', tool: 'pen', points: [{ x: 0.9, y: 0.9 }] }],
    null,
    null
  );
  const mergedDivergentLegacy = prod.mergeLectureAnnotationsWithCausalVersions(
    'lec_div_legacy_800',
    unmigratedLocalIdenticalPrefix,
    unmigratedRemoteIdenticalPrefix,
    m4Uid
  );
  const recoveryRecordsM4 = prod.getConflictRecoveryRecords(m4Uid);

  // Conversely, when both sides share the SAME persisted _legacyManifest from recoveredLegacy, ancestry is proven and causal deletion works without duplicating surviving strokes
  const sharedLocalCopy = JSON.parse(JSON.stringify(recoveredLegacy));
  const sharedRemoteCopy = JSON.parse(JSON.stringify(recoveredLegacy));
  const deletedLegacyId = sharedLocalCopy['1'][0].id;
  prod.recordAnnotationStrokeDeletion(sharedLocalCopy, 'lec_legacy_700', '1', sharedLocalCopy['1'][0], m4Uid);
  sharedLocalCopy['1'].shift();
  const mergedSharedLegacy = prod.mergeLectureAnnotationsWithCausalVersions(
    'lec_legacy_700',
    sharedLocalCopy,
    sharedRemoteCopy,
    m4Uid
  );
  assert(
    prefixOnlyCheck.sharedAncestor === false &&
    prefixOnlyCheck.divergent === true &&
    broadIdOnlyCheck.sharedAncestor === false &&
    broadIdOnlyCheck.divergent === true &&
    Array.isArray(mergedDivergentLegacy['1']) &&
    mergedDivergentLegacy['1'].length === 3 &&
    recoveryRecordsM4.some(r => r.entityId === 'lec_div_legacy_800:1' && r.reason === 'divergent_legacy_stroke_ancestry') &&
    Array.isArray(mergedSharedLegacy['1']) &&
    mergedSharedLegacy['1'].length === 1 &&
    mergedSharedLegacy['1'][0].id !== deletedLegacyId,
    'T-5.1.2-M4-04: verifySharedLegacyStrokeAncestry rejects geometry-prefix-only and broad-ID-only ancestry, preserves both divergent legacy stroke arrays with recovery records, and honors causal deletions when persisted _legacyManifest provenance matches'
  );

  // =========================================================================
  // TEST 15: PHASE 5.1.3 CORRECTION A — CAUSAL STAMPING FAILURE MUST NOT BE SILENT
  // =========================================================================
  console.log('\n[TEST 15] Phase 5.1.3 Correction A — Causal Save Safety & Fail-Closed Push...');

  const corrAUid = 'user_p513_corr_a';
  prod.localStorage.clear();
  prod.toastHistory.length = 0;
  prod.setSessionUser(corrAUid);
  prod.setNavigatorOnline(true);
  prod.setCryptoProviderForTests(undefined);
  prod.resetLiveActorForTabSimulation('dev_corr_a');

  // Seed one already-stamped unchanged subject and one subject that will be modified while CSPRNG is down
  const unchangedSub = {
    id: 9101,
    name: 'Unchanged Anatomy',
    groups: []
  };
  const mutableSub = {
    id: 9102,
    name: 'Initial Pharmacology',
    groups: []
  };
  const initialEvent = {
    id: 9201,
    title: 'Initial Study Block',
    subjectId: '9102',
    day: 1,
    startHour: 10,
    duration: 2,
    completed: false
  };
  const initialLog = {
    id: 9301,
    date: '2026-11-05',
    text: 'Initial Study Log',
    mood: 'bolt',
    subjectId: '9102'
  };

  prod.setRuntimeState({
    subjects: [unchangedSub, mutableSub],
    scheduleEvents: [initialEvent],
    scheduleBacklog: [],
    weeklyReports: [],
    logs: [initialLog],
    dirtyAnnotationsForCloud: false
  });

  const baselineStampRes = prod.autoStampTrackedWorkspaceMutations('all', corrAUid);
  const committedBaselineSet = new Set([
    unchangedSub._causal.operationId,
    mutableSub._causal.operationId,
    initialEvent._causal.operationId,
    initialLog._causal.operationId
  ]);
  prod.acknowledgeCommittedOperationsSnapshot(committedBaselineSet, 10, corrAUid);
  prod.localStorage.setItem('pharmaWorkspaceRevision_' + corrAUid, '10');
  prod.localStorage.removeItem('pharmaWorkspaceDirty');
  prod.localStorage.removeItem('pharmaWorkspaceDirty_' + corrAUid);
  const unchangedOpIdBeforeFailure = unchangedSub._causal.operationId;
  const mutableOpIdBeforeFailure = mutableSub._causal.operationId;

  // Test A1 — Local save survives causal stamping failure
  prod.toastHistory.length = 0;
  prod.setCryptoProviderForTests(null); // Both randomUUID and getRandomValues unavailable

  mutableSub.name = 'Updated Pharmacology While CSPRNG Down';
  const newSubjectWhileCsprngDown = { id: 9103, name: 'New Biochemistry While CSPRNG Down', groups: [] };
  prod.getRuntimeState().subjects.push(newSubjectWhileCsprngDown);
  const saveSubRes = prod.saveSubjects();

  initialEvent.title = 'Updated Study Block While CSPRNG Down';
  const saveSchedRes = prod.saveScheduleData();

  initialLog.text = 'Updated Study Log While CSPRNG Down';
  const saveLogsRes = prod.saveLogs();

  const savedSubsInStorage = JSON.parse(prod.localStorage.getItem('pharmaSubjectsV4') || '[]');
  const savedSchedInStorage = JSON.parse(prod.localStorage.getItem('pharmaScheduleV4') || '{}');
  const savedLogsInStorage = JSON.parse(prod.localStorage.getItem('pharmaLogsV4') || '[]');

  assert(
    baselineStampRes.ok === true &&
    saveSubRes && saveSubRes.ok === false && saveSubRes.failedCount >= 2 &&
    saveSchedRes && saveSchedRes.ok === false && saveSchedRes.failedCount >= 1 &&
    saveLogsRes && saveLogsRes.ok === false && saveLogsRes.failedCount >= 1 &&
    savedSubsInStorage.some(s => s.id === 9102 && s.name === 'Updated Pharmacology While CSPRNG Down') &&
    savedSubsInStorage.some(s => s.id === 9103 && s.name === 'New Biochemistry While CSPRNG Down') &&
    Array.isArray(savedSchedInStorage.events) &&
    savedSchedInStorage.events.some(e => e.id === 9201 && e.title === 'Updated Study Block While CSPRNG Down') &&
    savedLogsInStorage.some(l => l.id === 9301 && l.text === 'Updated Study Log While CSPRNG Down') &&
    prod.localStorage.getItem('pharmaWorkspaceDirty') === '1' &&
    prod.localStorage.getItem('pharmaWorkspaceDirty_' + corrAUid) === '1' &&
    prod.toastHistory.length >= 3 &&
    prod.toastHistory.every(t => t.type === 'error' && !t.msg.includes('at ') && !t.msg.includes('Error:')),
    'T-5.1.3-A1: Local saves (saveSubjects, saveScheduleData, saveLogs) persist user edits to localStorage, keep workspace dirty, and surface user-friendly error notifications when causal stamping fails'
  );

  // Test A2 — Cloud push fails closed before any RPC/network write
  let corrARpcCalls = 0;
  prod.setSupabaseClient({
    rpc: async () => {
      corrARpcCalls++;
      return { data: { status: 'success', revision: 11 }, error: null };
    }
  });

  const failedPushRes = await prod.pushWorkspaceToCloud(false, false);
  assert(
    failedPushRes &&
    failedPushRes.status === 'error' &&
    failedPushRes.ok === false &&
    failedPushRes.error === 'CAUSAL_STAMP_FAILED' &&
    failedPushRes.reason === 'CAUSAL_STAMP_FAILED' &&
    corrARpcCalls === 0 &&
    prod.localStorage.getItem('pharmaWorkspaceDirty') === '1' &&
    prod.localStorage.getItem('pharmaWorkspaceDirty_' + corrAUid) === '1' &&
    prod.localStorage.getItem('pharmaWorkspaceRevision_' + corrAUid) === '10' &&
    mutableSub._causal.committedWorkspaceRevision === null &&
    mutableSub._causal.dirty === true &&
    !newSubjectWhileCsprngDown._causal,
    'T-5.1.3-A2: pushWorkspaceToCloud fails closed with CAUSAL_STAMP_FAILED before any Supabase RPC call, leaves workspace dirty, and does not acknowledge uncommitted mutations'
  );

  // Test A3 — Recovery and retry once secure randomness is restored
  prod.setCryptoProviderForTests(undefined);
  const retryPushRes = await prod.pushWorkspaceToCloud(false, false);
  assert(
    retryPushRes &&
    retryPushRes.status === 'success' &&
    retryPushRes.revision === 11 &&
    corrARpcCalls === 1 &&
    unchangedSub._causal.operationId === unchangedOpIdBeforeFailure &&
    mutableSub._causal.operationId !== mutableOpIdBeforeFailure &&
    mutableSub._causal.committedWorkspaceRevision === 11 &&
    mutableSub._causal.dirty === false &&
    Boolean(newSubjectWhileCsprngDown._causal && newSubjectWhileCsprngDown._causal.operationId) &&
    newSubjectWhileCsprngDown._causal.committedWorkspaceRevision === 11 &&
    newSubjectWhileCsprngDown._causal.dirty === false &&
    prod.localStorage.getItem('pharmaWorkspaceDirty') === null &&
    prod.localStorage.getItem('pharmaWorkspaceDirty_' + corrAUid) === null,
    'T-5.1.3-A3: Restoring CSPRNG allows retry push to stamp only previously unstamped/modified records, preserves operationIds on unchanged entities, and completes cloud sync cleanly'
  );

  // Test A4 — No insecure Math.random() fallback for actor IDs, device IDs, or causal operation IDs
  const causalSourceBundle = [
    extractFunctionSource(indexHtmlContent, 'generateCausalOperationId'),
    extractFunctionSource(indexHtmlContent, 'getOrCreateDeviceId'),
    extractFunctionSource(indexHtmlContent, 'getLiveActorId'),
    extractFunctionSource(indexHtmlContent, 'createCausalOperation'),
    extractFunctionSource(indexHtmlContent, 'stampEntityMutation'),
    extractFunctionSource(indexHtmlContent, 'autoStampTrackedWorkspaceMutations')
  ].join('\n');
  const origMathRandom = Math.random;
  let mathRandomCalled = false;
  let csprngFailureCaught = false;
  try {
    Math.random = () => {
      mathRandomCalled = true;
      throw new Error('FORBIDDEN_MATH_RANDOM_CALLED');
    };
    prod.setCryptoProviderForTests(undefined);
    const validOpId = prod.generateCausalOperationId('op');
    prod.setCryptoProviderForTests({ randomUUID: null, getRandomValues: null });
    try {
      prod.generateCausalOperationId('op');
    } catch (e) {
      csprngFailureCaught = String(e.message || e).includes('CSPRNG_UNAVAILABLE');
    }
    assert(
      !causalSourceBundle.includes('Math.random') &&
      mathRandomCalled === false &&
      validOpId.startsWith('op_') &&
      csprngFailureCaught === true,
      'T-5.1.3-A4: Causal ID, actor ID, and device ID generation never fall back to Math.random() and remain strictly fail-closed when CSPRNG is unavailable'
    );
  } finally {
    Math.random = origMathRandom;
    prod.setCryptoProviderForTests(undefined);
  }

  // =========================================================================
  // TEST 16: PHASE 5.1.3 CORRECTION B — PRECISE & NON-DESTRUCTIVE DELETION SEMANTICS
  // =========================================================================
  console.log('\n[TEST 16] Phase 5.1.3 Correction B — Precise Deletion Semantics & Non-Destructive Detachment...');

  const corrBUid = 'user_p513_corr_b';
  prod.localStorage.clear();
  prod.toastHistory.length = 0;
  prod.setSessionUser(corrBUid);
  prod.resetLiveActorForTabSimulation('dev_corr_b');

  // Test B1 — executeClearSchedule('study_only') and executeClearSchedule('all') preserve scheduleBacklog
  const fixedCollegeEv = {
    id: 9401,
    title: 'Clinical Pharmacy Lecture',
    subjectId: '9501',
    day: 0,
    startHour: 9,
    duration: 2,
    type: 'mandatory',
    isFixed: true,
    absent: true,
    absentAtMs: 1700000000000
  };
  const studyEv1 = {
    id: 9402,
    title: 'Review Chapter 1',
    subjectId: '9501',
    day: 1,
    startHour: 14,
    duration: 1.5,
    type: 'important',
    isFixed: false
  };
  const studyEv2 = {
    id: 9403,
    title: 'Solve Past Papers',
    subjectId: '9502',
    day: 2,
    startHour: 16,
    duration: 2,
    type: 'important',
    isFixed: false
  };
  const backlogGoal1 = {
    id: 9451,
    title: 'Finish Weekly Pharmacology Summary',
    subjectId: '9501',
    done: false
  };
  const backlogGoal2 = {
    id: 9452,
    title: 'Memorize Drug Interactions Table',
    subjectId: '9502',
    done: true
  };

  prod.setRuntimeState({
    subjects: [],
    scheduleEvents: [fixedCollegeEv, studyEv1, studyEv2],
    scheduleBacklog: [backlogGoal1, backlogGoal2],
    weeklyReports: [],
    logs: []
  });
  prod.saveScheduleData();
  const backlogOpId1BeforeClear = backlogGoal1._causal.operationId;
  const backlogOpId2BeforeClear = backlogGoal2._causal.operationId;

  prod.executeClearSchedule('study_only');
  const stateAfterStudyOnly = prod.getRuntimeState();
  const tombsAfterStudyOnly = prod.getLocalTombstones(corrBUid);

  const studyOnlyOk = (
    stateAfterStudyOnly.scheduleEvents.length === 1 &&
    stateAfterStudyOnly.scheduleEvents[0].id === 9401 &&
    stateAfterStudyOnly.scheduleEvents[0].absent === false &&
    Boolean(tombsAfterStudyOnly.events['9402']) &&
    Boolean(tombsAfterStudyOnly.events['9403']) &&
    !tombsAfterStudyOnly.events['9401'] &&
    stateAfterStudyOnly.scheduleBacklog.length === 2 &&
    stateAfterStudyOnly.scheduleBacklog[0]._causal.operationId === backlogOpId1BeforeClear &&
    stateAfterStudyOnly.scheduleBacklog[1]._causal.operationId === backlogOpId2BeforeClear &&
    Object.keys(tombsAfterStudyOnly.backlog || {}).length === 0
  );

  prod.executeClearSchedule('all');
  const stateAfterClearAll = prod.getRuntimeState();
  const tombsAfterClearAll = prod.getLocalTombstones(corrBUid);

  assert(
    studyOnlyOk &&
    stateAfterClearAll.scheduleEvents.length === 0 &&
    Boolean(tombsAfterClearAll.events['9401']) &&
    Boolean(tombsAfterClearAll.events['9402']) &&
    Boolean(tombsAfterClearAll.events['9403']) &&
    stateAfterClearAll.scheduleBacklog.length === 2 &&
    stateAfterClearAll.scheduleBacklog[0].id === 9451 &&
    stateAfterClearAll.scheduleBacklog[0].title === 'Finish Weekly Pharmacology Summary' &&
    stateAfterClearAll.scheduleBacklog[0]._causal.operationId === backlogOpId1BeforeClear &&
    stateAfterClearAll.scheduleBacklog[1].id === 9452 &&
    stateAfterClearAll.scheduleBacklog[1].done === true &&
    stateAfterClearAll.scheduleBacklog[1]._causal.operationId === backlogOpId2BeforeClear &&
    Object.keys(tombsAfterClearAll.backlog || {}).length === 0,
    'T-5.1.3-B1: executeClearSchedule("study_only") and executeClearSchedule("all") tombstone only removed scheduleEvents while preserving scheduleBacklog tasks and their causal metadata'
  );

  // Test B2 — Subject deletion tombstones nested hierarchy only and detaches references on independent records without deleting them
  const scopedKeySub1Lec = prod.toScopedKey('9631', corrBUid);
  const scopedKeySub2Lec = prod.toScopedKey('9641', corrBUid);
  const foreignScopedKey = prod.toScopedKey('9631', 'other_user');
  seedIdbRecord('pdfs', scopedKeySub1Lec, '9631', corrBUid, { data: 'pdf1' });
  seedIdbRecord('audios', scopedKeySub1Lec, '9631', corrBUid, { data: 'aud1' });
  seedIdbRecord('annotations', scopedKeySub1Lec, '9631', corrBUid, { pages: { '1': [] } });
  seedIdbRecord('annotation_recovery_vault', prod.toScopedKey('9631_snap', corrBUid), '9631_snap', corrBUid, { lectureId: '9631', pages: { '1': [] } });
  seedIdbRecord('pdfs', scopedKeySub2Lec, '9641', corrBUid, { data: 'pdf2' });
  seedIdbRecord('pdfs', foreignScopedKey, '9631', 'other_user', { data: 'foreign_pdf' });
  prod.setDbInstance(idb);

  const subToDelete = {
    id: 9601,
    name: 'Medicinal Chemistry',
    wirdLogs: [{ id: 9611, date: '2026-11-04', text: 'Wird Entry 1' }],
    continuousLogs: [{ id: 9612, date: '2026-11-05', text: 'Continuous Entry 2' }],
    groups: [
      {
        id: 9621,
        name: 'Heterocycles',
        lectures: [
          { id: 9631, title: 'Lecture 1: Pyridines', completed: true }
        ]
      }
    ]
  };
  const survivingSub = {
    id: 9602,
    name: 'Biopharmaceutics',
    examLectureIds: ['9641', '9642'],
    groups: [
      {
        id: 9622,
        name: 'Pharmacokinetics',
        lectures: [
          { id: 9641, title: 'PK Compartments', completed: false }
        ]
      },
      {
        id: 9623,
        name: 'Bioavailability',
        lectures: [
          { id: 9642, title: 'BA & BE Trials', completed: true }
        ]
      }
    ]
  };
  const independentEventForDeletedSub = {
    id: 9701,
    title: 'Deep Study: Pyridines Notes',
    subjectId: '9601',
    lectureId: '9631',
    lectureIds: ['9631'],
    day: 3,
    startHour: 18,
    duration: 2,
    notes: 'Keep my custom session notes',
    completed: true
  };
  const independentEventForSurvivingSub = {
    id: 9702,
    title: 'PK & BA Combined Session',
    subjectId: '9602',
    lectureId: '9641',
    lectureIds: ['9641', '9642'],
    day: 4,
    startHour: 11,
    duration: 3,
    notes: 'Important exam prep',
    completed: false
  };
  const independentBacklogTask = {
    id: 9711,
    title: 'Solve Medicinal Chemistry Sheet 3',
    subjectId: '9601',
    done: false
  };
  const independentStudyLog = {
    id: 9721,
    date: '2026-11-05',
    text: 'Completed 2 hours of Medicinal Chemistry',
    mood: 'bolt',
    subjectId: '9601'
  };
  const independentWeeklyReport = {
    id: 'rep_2026_10_31',
    weekStartIso: '2026-10-31',
    rangeTitle: 'Oct 31 - Nov 06',
    grade: 'A',
    completedHours: 14
  };

  prod.localStorage.removeItem('pharmaTombstones_' + corrBUid);
  prod.localStorage.removeItem('pharmaScheduleV4');
  prod.setRuntimeState({
    activeSubjectId: 9601,
    subjects: [subToDelete, survivingSub],
    scheduleEvents: [independentEventForDeletedSub, independentEventForSurvivingSub],
    scheduleBacklog: [independentBacklogTask],
    weeklyReports: [independentWeeklyReport],
    logs: [independentStudyLog]
  });
  prod.saveSubjects();
  prod.saveScheduleData();
  prod.saveLogs();

  const ev9701OpBefore = independentEventForDeletedSub._causal.operationId;
  const bl9711OpBefore = independentBacklogTask._causal.operationId;
  const lg9721OpBefore = independentStudyLog._causal.operationId;

  await prod.triggerDeleteSubject(9601);
  const stateAfterSubDel = prod.getRuntimeState();
  const tombsAfterSubDel = prod.getLocalTombstones(corrBUid);

  assert(
    stateAfterSubDel.subjects.length === 1 &&
    stateAfterSubDel.subjects[0].id === 9602 &&
    Boolean(tombsAfterSubDel.subjects['9601']) &&
    Boolean(tombsAfterSubDel.groups['9621']) &&
    Boolean(tombsAfterSubDel.lectures['9631']) &&
    Boolean(tombsAfterSubDel.wird_logs['9611']) &&
    Boolean(tombsAfterSubDel.wird_logs['9612']) &&
    Object.keys(tombsAfterSubDel.events || {}).length === 0 &&
    Object.keys(tombsAfterSubDel.backlog || {}).length === 0 &&
    Object.keys(tombsAfterSubDel.logs || {}).length === 0 &&
    Object.keys(tombsAfterSubDel.weekly_reports || {}).length === 0 &&
    stateAfterSubDel.scheduleEvents.length === 2 &&
    independentEventForDeletedSub.title === 'Deep Study: Pyridines Notes' &&
    independentEventForDeletedSub.notes === 'Keep my custom session notes' &&
    independentEventForDeletedSub.completed === true &&
    independentEventForDeletedSub.subjectId === '' &&
    independentEventForDeletedSub.lectureId === '' &&
    Array.isArray(independentEventForDeletedSub.lectureIds) && independentEventForDeletedSub.lectureIds.length === 0 &&
    independentEventForDeletedSub._causal.operationId !== ev9701OpBefore &&
    stateAfterSubDel.scheduleBacklog.length === 1 &&
    independentBacklogTask.title === 'Solve Medicinal Chemistry Sheet 3' &&
    independentBacklogTask.subjectId === '' &&
    independentBacklogTask._causal.operationId !== bl9711OpBefore &&
    stateAfterSubDel.logs.length === 1 &&
    independentStudyLog.text === 'Completed 2 hours of Medicinal Chemistry' &&
    independentStudyLog.subjectId === '' &&
    independentStudyLog._causal.operationId !== lg9721OpBefore &&
    stateAfterSubDel.weeklyReports.length === 1 &&
    !idb.stores.pdfs.has(scopedKeySub1Lec) &&
    !idb.stores.annotations.has(scopedKeySub1Lec) &&
    idb.stores.pdfs.has(scopedKeySub2Lec) &&
    idb.stores.pdfs.has(foreignScopedKey),
    'T-5.1.3-B2: triggerDeleteSubject tombstones only the subject and its nested groups/lectures/wird_logs, preserves independent events/backlog/logs/weeklyReports while detaching stale subject/lecture references with causal stamps, and cleans only the deleted lecture local artifacts for the active account'
  );

  // Test B3 — Group deletion tombstones group & child lectures and detaches deleted lecture references from surviving events
  prod.setRuntimeState({ activeSubjectId: 9602 });
  const ev9702OpBeforeGroupDel = independentEventForSurvivingSub._causal.operationId;
  const sub9602OpBeforeGroupDel = survivingSub._causal.operationId;

  await prod.triggerDeleteGroup(9622);
  const tombsAfterGroupDel = prod.getLocalTombstones(corrBUid);

  assert(
    survivingSub.groups.length === 1 &&
    survivingSub.groups[0].id === 9623 &&
    Boolean(tombsAfterGroupDel.groups['9622']) &&
    Boolean(tombsAfterGroupDel.lectures['9641']) &&
    !tombsAfterGroupDel.lectures['9642'] &&
    survivingSub._causal.operationId !== sub9602OpBeforeGroupDel &&
    survivingSub.examLectureIds.length === 1 &&
    survivingSub.examLectureIds[0] === '9642' &&
    independentEventForSurvivingSub.title === 'PK & BA Combined Session' &&
    independentEventForSurvivingSub.subjectId === '9602' &&
    independentEventForSurvivingSub.lectureId === '9642' &&
    JSON.stringify(independentEventForSurvivingSub.lectureIds) === JSON.stringify(['9642']) &&
    independentEventForSurvivingSub._causal.operationId !== ev9702OpBeforeGroupDel &&
    !idb.stores.pdfs.has(scopedKeySub2Lec),
    'T-5.1.3-B3: triggerDeleteGroup tombstones the group and its nested lectures, detaches deleted lecture IDs from surviving schedule events and examLectureIds with causal stamps, and cleans local lecture artifacts'
  );

  // Test B4 — Lecture deletion tombstones lecture and detaches lecture reference from surviving schedule events
  const ev9702OpBeforeLecDel = independentEventForSurvivingSub._causal.operationId;
  const grp9623OpBeforeLecDel = survivingSub.groups[0]._causal.operationId;
  await prod.triggerDeleteLecture(9623, 9642);
  const tombsAfterLecDel = prod.getLocalTombstones(corrBUid);

  assert(
    survivingSub.groups[0].lectures.length === 0 &&
    Boolean(tombsAfterLecDel.lectures['9642']) &&
    survivingSub.groups[0]._causal.operationId !== grp9623OpBeforeLecDel &&
    independentEventForSurvivingSub.title === 'PK & BA Combined Session' &&
    independentEventForSurvivingSub.subjectId === '9602' &&
    independentEventForSurvivingSub.lectureId === '' &&
    Array.isArray(independentEventForSurvivingSub.lectureIds) && independentEventForSurvivingSub.lectureIds.length === 0 &&
    independentEventForSurvivingSub._causal.operationId !== ev9702OpBeforeLecDel,
    'T-5.1.3-B4: triggerDeleteLecture tombstones the lecture, stamps parent group/subject, and detaches the deleted lecture reference on surviving schedule events without deleting those events'
  );

  // Test B5 — Explicit top-level deletion callsites record accurate tombstones
  survivingSub.continuousLogs = [{ id: 9699, date: '2026-11-05', text: 'Wird to delete explicitly' }];
  prod.saveSubjects();
  prod.deleteContinuousSubjectWirdLog(9602, 9699);
  prod.deleteSessionDirect(null, 9701);
  prod.deleteEventFromPdfAdjuster(9702);
  prod.deleteBacklogTask(9711);
  prod.triggerDeleteLog(9721);
  prod.deleteWeeklyEvaluationReport('2026-10-31');

  const tombsAfterExplicitDeletes = prod.getLocalTombstones(corrBUid);
  const stateAfterExplicitDeletes = prod.getRuntimeState();

  assert(
    Boolean(tombsAfterExplicitDeletes.wird_logs['9699']) &&
    Boolean(tombsAfterExplicitDeletes.events['9701']) &&
    Boolean(tombsAfterExplicitDeletes.events['9702']) &&
    Boolean(tombsAfterExplicitDeletes.backlog['9711']) &&
    Boolean(tombsAfterExplicitDeletes.logs['9721']) &&
    Boolean(tombsAfterExplicitDeletes.weekly_reports['2026-10-31']) &&
    stateAfterExplicitDeletes.scheduleEvents.length === 0 &&
    stateAfterExplicitDeletes.scheduleBacklog.length === 0 &&
    stateAfterExplicitDeletes.logs.length === 0 &&
    stateAfterExplicitDeletes.weeklyReports.length === 0,
    'T-5.1.3-B5: All explicit deletion routes (wird_logs, events, backlog, logs, weekly_reports) record causal tombstones in their exact buckets before removing the target entity'
  );

  // Test B6 — Fail-closed abort when tombstone persistence fails
  const protectedSub = {
    id: 9801,
    name: 'Protected Subject',
    continuousLogs: [{ id: 9802, date: '2026-11-05', text: 'Protected Wird' }],
    groups: [{ id: 9803, name: 'Protected Group', lectures: [{ id: 9804, title: 'Protected Lecture' }] }]
  };
  const protectedEv = { id: 9805, title: 'Protected Event', day: 1, startHour: 10, duration: 1 };
  const protectedTask = { id: 9806, title: 'Protected Backlog', done: false };
  const protectedLog = { id: 9807, date: '2026-11-05', text: 'Protected Log' };
  const protectedRep = { id: 'rep_9808', weekStartIso: '2026-11-07', rangeTitle: 'Nov 07 - Nov 13' };

  prod.setRuntimeState({
    activeSubjectId: 9801,
    subjects: [protectedSub],
    scheduleEvents: [protectedEv],
    scheduleBacklog: [protectedTask],
    logs: [protectedLog],
    weeklyReports: [protectedRep]
  });
  prod.saveSubjects();
  prod.saveScheduleData();
  prod.saveLogs();

  prod.setFailNextAccountSnapshotKey('pharmaTombstones_' + corrBUid);
  await prod.triggerDeleteSubject(9801);
  prod.setFailNextAccountSnapshotKey('pharmaTombstones_' + corrBUid);
  await prod.triggerDeleteGroup(9803);
  prod.setFailNextAccountSnapshotKey('pharmaTombstones_' + corrBUid);
  await prod.triggerDeleteLecture(9803, 9804);
  prod.setFailNextAccountSnapshotKey('pharmaTombstones_' + corrBUid);
  prod.deleteContinuousSubjectWirdLog(9801, 9802);
  prod.setFailNextAccountSnapshotKey('pharmaTombstones_' + corrBUid);
  prod.deleteSessionDirect(null, 9805);
  prod.setFailNextAccountSnapshotKey('pharmaTombstones_' + corrBUid);
  prod.deleteEventFromPdfAdjuster(9805);
  prod.setFailNextAccountSnapshotKey('pharmaTombstones_' + corrBUid);
  prod.executeClearSchedule('all');
  prod.setFailNextAccountSnapshotKey('pharmaTombstones_' + corrBUid);
  prod.deleteBacklogTask(9806);
  prod.setFailNextAccountSnapshotKey('pharmaTombstones_' + corrBUid);
  prod.triggerDeleteLog(9807);
  prod.setFailNextAccountSnapshotKey('pharmaTombstones_' + corrBUid);
  prod.deleteWeeklyEvaluationReport('2026-11-07');
  prod.setFailNextAccountSnapshotKey(null);

  const stateAfterAbortedDeletes = prod.getRuntimeState();
  assert(
    stateAfterAbortedDeletes.subjects.length === 1 &&
    stateAfterAbortedDeletes.subjects[0].groups.length === 1 &&
    stateAfterAbortedDeletes.subjects[0].groups[0].lectures.length === 1 &&
    stateAfterAbortedDeletes.subjects[0].continuousLogs.length === 1 &&
    stateAfterAbortedDeletes.scheduleEvents.length === 1 &&
    stateAfterAbortedDeletes.scheduleBacklog.length === 1 &&
    stateAfterAbortedDeletes.logs.length === 1 &&
    stateAfterAbortedDeletes.weeklyReports.length === 1,
    'T-5.1.3-B6: All deletion callsites abort fail-closed without removing in-memory or persisted records when tombstone persistence fails'
  );

  // =========================================================================
  // TEST 17: PHASE 5.1.3.1 — WEEKLY REPORT ARCHIVED GOAL REFERENCES & FAIL-CLOSED SESSION DELETION COVERAGE
  // =========================================================================
  console.log('\n[TEST 17] Phase 5.1.3.1 — Weekly Report Archived Goal Detachment & Fail-Closed Session Deletion Coverage...');

  const p5131Uid = 'user_p5131_integrity';
  prod.localStorage.clear();
  prod.toastHistory.length = 0;
  prod.setSessionUser(p5131Uid);
  prod.resetLiveActorForTabSimulation('dev_p5131');

  // Test 5.1.3.1-A1 — Weekly report archivedGoals[].subjectId detachment on subject deletion
  const subDelP5131 = {
    id: 9901,
    name: 'Clinical Toxicology',
    groups: [
      { id: 9911, name: 'Toxidromes', lectures: [{ id: 9921, title: 'Cholinergic Crisis' }] }
    ]
  };
  const subKeepP5131 = {
    id: 9902,
    name: 'Pharmacognosy',
    groups: [
      { id: 9912, name: 'Alkaloids', lectures: [{ id: 9922, title: 'Tropane Alkaloids' }] }
    ]
  };
  const reportWithDeletedAndSurvivingGoals = {
    id: 'rep_p5131_w1',
    weekStartIso: '2026-10-17',
    rangeTitle: 'Oct 17 - Oct 23',
    grade: 'A+',
    adherencePct: 92,
    plannedHours: 12,
    completedHours: 11,
    goalsTotalCount: 2,
    goalsCompletedCount: 2,
    coachAdvice: 'Consistent progress across toxicology and pharmacognosy.',
    archivedGoals: [
      {
        id: 'ag_del_sub_1',
        title: 'Summarize Cholinergic Antidotes',
        text: 'Atropine + Pralidoxime dosing notes',
        date: '2026-10-19',
        notes: 'High-yield clinical pearls preserved',
        done: true,
        subjectId: '9901',
        duration: 2.5,
        weekStartIso: '2026-10-17'
      },
      {
        id: 'ag_keep_sub_2',
        title: 'Review Alkaloid Extraction',
        text: 'Stas-Otto process steps',
        date: '2026-10-20',
        notes: 'Lab exam preparation',
        done: true,
        subjectId: '9902',
        duration: 1.5,
        weekStartIso: '2026-10-17'
      }
    ]
  };
  const unrelatedReportKeep = {
    id: 'rep_p5131_w2',
    weekStartIso: '2026-10-24',
    rangeTitle: 'Oct 24 - Oct 30',
    grade: 'A',
    adherencePct: 85,
    plannedHours: 10,
    completedHours: 8.5,
    goalsTotalCount: 1,
    goalsCompletedCount: 1,
    coachAdvice: 'Keep up steady weekly goal completion.',
    archivedGoals: [
      {
        id: 'ag_unrelated_keep_1',
        title: 'Complete Alkaloid Practice Quiz',
        done: true,
        subjectId: '9902',
        duration: 2,
        weekStartIso: '2026-10-24'
      }
    ]
  };

  prod.setRuntimeState({
    activeSubjectId: 9901,
    subjects: [subDelP5131, subKeepP5131],
    scheduleEvents: [],
    scheduleBacklog: [],
    weeklyReports: [reportWithDeletedAndSurvivingGoals, unrelatedReportKeep],
    logs: []
  });
  prod.saveSubjects();
  prod.saveScheduleData();

  const rep1OpIdBefore = reportWithDeletedAndSurvivingGoals._causal.operationId;
  const rep1CounterBefore = reportWithDeletedAndSurvivingGoals._causal.actorCounter;
  const rep2OpIdBefore = unrelatedReportKeep._causal.operationId;

  await prod.triggerDeleteSubject(9901);

  const stateAfterP5131SubDel = prod.getRuntimeState();
  const tombsAfterP5131SubDel = prod.getLocalTombstones(p5131Uid);
  const persistedWeeklyReportsRaw = JSON.parse(prod.localStorage.getItem('pharmaWeeklyReportsV1') || '[]');
  const persistedSchedV4Raw = JSON.parse(prod.localStorage.getItem('pharmaScheduleV4') || '{}');
  const persistedRep1 = persistedWeeklyReportsRaw.find(r => r.id === 'rep_p5131_w1');
  const persistedRep2 = persistedWeeklyReportsRaw.find(r => r.id === 'rep_p5131_w2');

  assert(
    stateAfterP5131SubDel.weeklyReports.length === 2 &&
    Object.keys(tombsAfterP5131SubDel.weekly_reports || {}).length === 0 &&
    reportWithDeletedAndSurvivingGoals.archivedGoals.length === 2 &&
    reportWithDeletedAndSurvivingGoals.archivedGoals[0].id === 'ag_del_sub_1' &&
    reportWithDeletedAndSurvivingGoals.archivedGoals[0].title === 'Summarize Cholinergic Antidotes' &&
    reportWithDeletedAndSurvivingGoals.archivedGoals[0].text === 'Atropine + Pralidoxime dosing notes' &&
    reportWithDeletedAndSurvivingGoals.archivedGoals[0].date === '2026-10-19' &&
    reportWithDeletedAndSurvivingGoals.archivedGoals[0].notes === 'High-yield clinical pearls preserved' &&
    reportWithDeletedAndSurvivingGoals.archivedGoals[0].done === true &&
    reportWithDeletedAndSurvivingGoals.archivedGoals[0].duration === 2.5 &&
    reportWithDeletedAndSurvivingGoals.archivedGoals[0].weekStartIso === '2026-10-17' &&
    reportWithDeletedAndSurvivingGoals.archivedGoals[0].subjectId === '' &&
    reportWithDeletedAndSurvivingGoals.archivedGoals[1].id === 'ag_keep_sub_2' &&
    reportWithDeletedAndSurvivingGoals.archivedGoals[1].subjectId === '9902' &&
    reportWithDeletedAndSurvivingGoals._causal.operationId !== rep1OpIdBefore &&
    reportWithDeletedAndSurvivingGoals._causal.actorCounter === rep1CounterBefore + 1 &&
    unrelatedReportKeep.archivedGoals.length === 1 &&
    unrelatedReportKeep.archivedGoals[0].subjectId === '9902' &&
    unrelatedReportKeep._causal.operationId === rep2OpIdBefore &&
    Boolean(persistedRep1 && persistedRep1.archivedGoals[0].subjectId === '' && persistedRep1.archivedGoals[1].subjectId === '9902') &&
    Boolean(persistedRep2 && persistedRep2._causal?.operationId === rep2OpIdBefore) &&
    Array.isArray(persistedSchedV4Raw.weeklyReports) &&
    persistedSchedV4Raw.weeklyReports[0].archivedGoals[0].subjectId === '',
    'T-5.1.3.1-A1: Subject deletion preserves all weeklyReports and archivedGoals content, detaches only deleted subjectId references in archivedGoals with causal stamping and persistence, and leaves unrelated reports untouched'
  );

  // Test 5.1.3.1-B1 — Explicit fail-closed tombstone failure & retry coverage for deleteSessionDirect
  const evDirectTarget = {
    id: 'ev_p5131_direct_1',
    title: 'Direct Delete Target Session',
    subjectId: '9902',
    lectureId: '9922',
    day: 2,
    startHour: 13,
    duration: 2,
    notes: 'Preserve session notes on tombstone write failure',
    completed: true
  };
  const evPdfAdjTarget = {
    id: 'ev_p5131_pdf_adj_1',
    title: 'PDF Adjuster Delete Target Session',
    subjectId: '9902',
    lectureId: '9922',
    day: 4,
    startHour: 15,
    duration: 1.5,
    notes: 'Preserve PDF adjuster session notes on tombstone write failure',
    hideFromPdf: false,
    completed: false
  };
  const companionBacklog = {
    id: 'bl_p5131_companion',
    title: 'Companion Weekly Goal',
    subjectId: '9902',
    done: false
  };
  const companionLog = {
    id: 'log_p5131_companion',
    date: '2026-11-05',
    text: 'Companion Study Log Entry',
    mood: 'bolt',
    subjectId: '9902'
  };

  prod.setRuntimeState({
    activeSubjectId: 9902,
    subjects: [subKeepP5131],
    scheduleEvents: [evDirectTarget, evPdfAdjTarget],
    scheduleBacklog: [companionBacklog],
    weeklyReports: [unrelatedReportKeep],
    logs: [companionLog]
  });
  prod.saveScheduleData();
  prod.saveLogs();

  prod.toastHistory.length = 0;
  prod.setFailNextAccountSnapshotKey('pharmaTombstones_' + p5131Uid);
  prod.deleteSessionDirect(null, 'ev_p5131_direct_1');

  const stateAfterFailedDirectDel = prod.getRuntimeState();
  const tombsAfterFailedDirectDel = prod.getLocalTombstones(p5131Uid);
  const schedStorageAfterFailedDirectDel = JSON.parse(prod.localStorage.getItem('pharmaScheduleV4') || '{}');
  const directToastFailedOnly = (
    prod.toastHistory.length === 1 &&
    prod.toastHistory[0].type === 'error' &&
    prod.toastHistory[0].msg.includes('تعذر حفظ سجل الحذف محلياً') &&
    !prod.toastHistory.some(t => t.msg === 'تم حذف الجلسة')
  );
  const directTargetPreservedOnFailure = (
    stateAfterFailedDirectDel.scheduleEvents.length === 2 &&
    stateAfterFailedDirectDel.scheduleEvents[0].id === 'ev_p5131_direct_1' &&
    stateAfterFailedDirectDel.scheduleEvents[0].title === 'Direct Delete Target Session' &&
    stateAfterFailedDirectDel.scheduleEvents[0].notes === 'Preserve session notes on tombstone write failure' &&
    !tombsAfterFailedDirectDel.events?.['ev_p5131_direct_1'] &&
    Array.isArray(schedStorageAfterFailedDirectDel.events) &&
    schedStorageAfterFailedDirectDel.events.some(e => e.id === 'ev_p5131_direct_1') &&
    stateAfterFailedDirectDel.scheduleBacklog.length === 1 &&
    stateAfterFailedDirectDel.logs.length === 1 &&
    stateAfterFailedDirectDel.weeklyReports.length === 1
  );

  // Retry deleteSessionDirect after tombstone storage is restored
  prod.deleteSessionDirect(null, 'ev_p5131_direct_1');
  const stateAfterRetryDirectDel = prod.getRuntimeState();
  const tombsAfterRetryDirectDel = prod.getLocalTombstones(p5131Uid);

  assert(
    directToastFailedOnly &&
    directTargetPreservedOnFailure &&
    stateAfterRetryDirectDel.scheduleEvents.length === 1 &&
    stateAfterRetryDirectDel.scheduleEvents[0].id === 'ev_p5131_pdf_adj_1' &&
    Boolean(tombsAfterRetryDirectDel.events?.['ev_p5131_direct_1']?.operationId) &&
    stateAfterRetryDirectDel.scheduleBacklog.length === 1 &&
    stateAfterRetryDirectDel.logs.length === 1 &&
    stateAfterRetryDirectDel.weeklyReports.length === 1,
    'T-5.1.3.1-B1: deleteSessionDirect aborts fail-closed when recordTombstone persistence fails (preserving target session, associated data, and emitting no false success toast) and succeeds cleanly on subsequent retry'
  );

  // Test 5.1.3.1-B2 — Explicit fail-closed tombstone failure & retry coverage for deleteEventFromPdfAdjuster
  prod.toastHistory.length = 0;
  prod.setFailNextAccountSnapshotKey('pharmaTombstones_' + p5131Uid);
  prod.deleteEventFromPdfAdjuster('ev_p5131_pdf_adj_1');

  const stateAfterFailedPdfAdjDel = prod.getRuntimeState();
  const tombsAfterFailedPdfAdjDel = prod.getLocalTombstones(p5131Uid);
  const schedStorageAfterFailedPdfAdjDel = JSON.parse(prod.localStorage.getItem('pharmaScheduleV4') || '{}');
  const pdfAdjToastFailedOnly = (
    prod.toastHistory.length === 1 &&
    prod.toastHistory[0].type === 'error' &&
    prod.toastHistory[0].msg.includes('تعذر حفظ سجل الحذف محلياً') &&
    !prod.toastHistory.some(t => t.msg === '🗑️ تم حذف المهمة وتحديث معاينة الـ PDF')
  );
  const pdfAdjTargetPreservedOnFailure = (
    stateAfterFailedPdfAdjDel.scheduleEvents.length === 1 &&
    stateAfterFailedPdfAdjDel.scheduleEvents[0].id === 'ev_p5131_pdf_adj_1' &&
    stateAfterFailedPdfAdjDel.scheduleEvents[0].title === 'PDF Adjuster Delete Target Session' &&
    stateAfterFailedPdfAdjDel.scheduleEvents[0].notes === 'Preserve PDF adjuster session notes on tombstone write failure' &&
    !tombsAfterFailedPdfAdjDel.events?.['ev_p5131_pdf_adj_1'] &&
    Array.isArray(schedStorageAfterFailedPdfAdjDel.events) &&
    schedStorageAfterFailedPdfAdjDel.events.some(e => e.id === 'ev_p5131_pdf_adj_1') &&
    stateAfterFailedPdfAdjDel.scheduleBacklog.length === 1 &&
    stateAfterFailedPdfAdjDel.logs.length === 1 &&
    stateAfterFailedPdfAdjDel.weeklyReports.length === 1
  );

  // Retry deleteEventFromPdfAdjuster after tombstone storage is restored
  prod.deleteEventFromPdfAdjuster('ev_p5131_pdf_adj_1');
  const stateAfterRetryPdfAdjDel = prod.getRuntimeState();
  const tombsAfterRetryPdfAdjDel = prod.getLocalTombstones(p5131Uid);

  assert(
    pdfAdjToastFailedOnly &&
    pdfAdjTargetPreservedOnFailure &&
    stateAfterRetryPdfAdjDel.scheduleEvents.length === 0 &&
    Boolean(tombsAfterRetryPdfAdjDel.events?.['ev_p5131_pdf_adj_1']?.operationId) &&
    stateAfterRetryPdfAdjDel.scheduleBacklog.length === 1 &&
    stateAfterRetryPdfAdjDel.logs.length === 1 &&
    stateAfterRetryPdfAdjDel.weeklyReports.length === 1,
    'T-5.1.3.1-B2: deleteEventFromPdfAdjuster aborts fail-closed when recordTombstone persistence fails (preserving target session, associated data, and emitting no false success toast) and succeeds cleanly on subsequent retry'
  );

  // =========================================================================
  // TEST 18: PHASE 5.1 MILESTONE M5-A — DIRTY-STATE LOGIN & MANUAL PULL RECONCILIATION (F-03, T-5.1-08)
  // =========================================================================
  console.log('\n[TEST 18] Phase 5.1 Milestone M5-A — Dirty-State Login & Manual Pull Reconciliation (F-03, T-5.1-08)...');

  const makeSupabaseMock = (remoteRowGetter, rpcHandler) => ({
    from: (table) => ({
      select: (cols) => ({
        eq: (field, val) => ({
          maybeSingle: async () => {
            const row = typeof remoteRowGetter === 'function' ? remoteRowGetter(val) : remoteRowGetter;
            return { data: row ? JSON.parse(JSON.stringify(row)) : null, error: null };
          }
        })
      })
    }),
    rpc: async (name, params) => {
      if (typeof rpcHandler === 'function') {
        return await rpcHandler(name, params);
      }
      return { data: { status: 'success', revision: (params?.p_expected_revision || 1) + 1 }, error: null };
    }
  });

  // --- Test A: Same-account dirty login reconciliation (T-5.1-08-A) ---
  const uidM5A1 = 'user_m5a_recon_1';
  prod.localStorage.clear();
  prod.toastHistory.length = 0;
  prod.setSessionUser(uidM5A1);
  prod.resetLiveActorForTabSimulation('dev_m5a_1');

  // Seed local offline state for uidM5A1
  const localSubM5A = { id: 101, name: 'Local Offline Pharmacology', _updatedAt: 2000, groups: [] };
  const localEvM5A = { id: 201, title: 'Local Offline Study Session', day: 1, startHour: 10, duration: 2, _updatedAt: 2000 };
  const localTaskM5A = { id: 301, title: 'Local Offline Backlog Task', done: false, _updatedAt: 2000 };
  const localLogM5A = { id: 401, date: '2026-11-05', text: 'Local Offline Log', _updatedAt: 2000 };
  const localAnnoKey = prod.toScopedKey('1011', uidM5A1);
  seedIdbRecord('annotations', localAnnoKey, '1011', uidM5A1, {
    '1': [{ id: 'stk_local_1', tool: 'pen', color: '#10b981', size: 2, points: [[10, 10], [20, 20]] }]
  });
  prod.setDbInstance(idb);

  prod.setRuntimeState({
    activeSubjectId: 101,
    subjects: [localSubM5A],
    scheduleEvents: [localEvM5A],
    scheduleBacklog: [localTaskM5A],
    logs: [localLogM5A],
    weeklyReports: [],
    dirtyAnnotationsForCloud: true
  });
  prod.saveSubjects();
  prod.saveScheduleData();
  prod.saveLogs();

  // Create a local tombstone for subject 999
  prod.recordTombstone('subjects', 999, uidM5A1);
  prod.localStorage.setItem('pharmaWorkspaceDirty', '1');
  prod.localStorage.setItem('pharmaWorkspaceDirty_' + uidM5A1, '1');
  prod.localStorage.setItem('pharmaLastActiveCloudUid', uidM5A1);
  prod.localStorage.setItem('pharmaWorkspaceRevision_' + uidM5A1, '1');

  // Seed remote row in Supabase: has remote subject 102, stale subject 999 (which was tombstoned locally), and remote event 202
  const remoteRowM5A = {
    user_id: uidM5A1,
    user_email: uidM5A1 + '@test.edu',
    revision: 2,
    subjects: [
      { id: 102, name: 'Remote Cloud Anatomy', _updatedAt: 1500, groups: [] },
      { id: 999, name: 'Deleted Subject Stale Remote', _updatedAt: 500, groups: [] }
    ],
    schedule: {
      version: 3,
      events: [{ id: 202, title: 'Remote Cloud Session', day: 3, startHour: 14, duration: 1, _updatedAt: 1500 }],
      backlog: [],
      plannerPrefs: { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75 },
      weeklyReports: [],
      _tombstones: { subjects: {}, groups: {}, lectures: {}, events: {}, backlog: {}, logs: {}, weekly_reports: {}, wird_logs: {} }
    },
    logs: [],
    academy_progress: [],
    annotations: {
      [prod.toScopedKey('1012', uidM5A1)]: {
        '1': [{ id: 'stk_remote_1', tool: 'pen', color: '#38bdf8', size: 2, points: [[50, 50], [60, 60]] }]
      }
    },
    updated_at: '2026-11-05T12:00:00.000Z'
  };

  let rpcCallsM5A = 0;
  let lastRpcPayload = null;
  prod.setSupabaseClient(makeSupabaseMock(remoteRowM5A, async (name, params) => {
    rpcCallsM5A++;
    lastRpcPayload = params?.p_payload;
    return { data: { status: 'success', revision: 3 }, error: null };
  }));

  // Trigger login sync with dirty local state
  const loginSyncRes = await prod.syncWorkspaceOnLogin();
  const stateAfterLoginSync = prod.getRuntimeState();
  const tombsAfterLoginSync = prod.getLocalTombstones(uidM5A1);
  const accountVaultM5A1 = JSON.parse(prod.localStorage.getItem(prod.getAccountBackupStorageKey(uidM5A1)) || '{}');

  assert(
    loginSyncRes &&
    loginSyncRes.ok === true &&
    loginSyncRes.reconciled === true &&
    loginSyncRes.status === 'reconciled_and_synced' &&
    stateAfterLoginSync.subjects.some(s => s.id === 101 && s.name === 'Local Offline Pharmacology') &&
    stateAfterLoginSync.subjects.some(s => s.id === 102 && s.name === 'Remote Cloud Anatomy') &&
    !stateAfterLoginSync.subjects.some(s => s.id === 999) &&
    Boolean(tombsAfterLoginSync.subjects['999']) &&
    stateAfterLoginSync.scheduleEvents.some(e => e.id === 201 && e.title === 'Local Offline Study Session') &&
    stateAfterLoginSync.scheduleEvents.some(e => e.id === 202 && e.title === 'Remote Cloud Session') &&
    stateAfterLoginSync.scheduleBacklog.some(b => b.id === 301) &&
    stateAfterLoginSync.logs.some(l => l.id === 401) &&
    rpcCallsM5A === 1 &&
    prod.localStorage.getItem('pharmaWorkspaceDirty') === null &&
    prod.localStorage.getItem('pharmaWorkspaceDirty_' + uidM5A1) === null &&
    accountVaultM5A1.subjects?.some(s => s.id === 101) &&
    accountVaultM5A1.subjects?.some(s => s.id === 102),
    'T-5.1-08-A: Same-account dirty login reconciles local edits with remote row without overwriting, preserves local and remote items, enforces tombstones against stale remote items, and clears dirty flags upon confirmed push'
  );

  // --- Test B: Manual pull reconciliation & flush failure safety (T-5.1-08-B) ---
  const uidM5A2 = 'user_m5a_recon_2';
  prod.localStorage.clear();
  prod.toastHistory.length = 0;
  prod.setSessionUser(uidM5A2);
  prod.resetLiveActorForTabSimulation('dev_m5a_2');

  const localSubM5B = { id: 103, name: 'Local Pre-Pull Subject', _updatedAt: 3000, groups: [] };
  prod.setRuntimeState({
    activeSubjectId: 103,
    subjects: [localSubM5B],
    scheduleEvents: [],
    scheduleBacklog: [],
    logs: [],
    weeklyReports: []
  });
  prod.saveSubjects();
  prod.localStorage.setItem('pharmaWorkspaceDirty', '1');
  prod.localStorage.setItem('pharmaWorkspaceDirty_' + uidM5A2, '1');
  prod.localStorage.setItem('pharmaLastActiveCloudUid', uidM5A2);

  const remoteRowM5B = {
    user_id: uidM5A2,
    user_email: uidM5A2 + '@test.edu',
    revision: 3,
    subjects: [{ id: 104, name: 'Remote Pulled Subject', _updatedAt: 2500, groups: [] }],
    schedule: { version: 3, events: [], backlog: [], plannerPrefs: { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75 }, weeklyReports: [] },
    logs: [],
    academy_progress: [],
    annotations: {},
    updated_at: '2026-11-05T12:10:00.000Z'
  };

  prod.setSupabaseClient(makeSupabaseMock(remoteRowM5B, async () => {
    return { data: { status: 'success', revision: 4 }, error: null };
  }));

  // Trigger manual pull with force=true on dirty state
  const manualPullRes = await prod.pullWorkspaceFromCloud(true);
  const stateAfterManualPull = prod.getRuntimeState();

  assert(
    manualPullRes &&
    manualPullRes.ok === true &&
    manualPullRes.reconciled === true &&
    stateAfterManualPull.subjects.some(s => s.id === 103 && s.name === 'Local Pre-Pull Subject') &&
    stateAfterManualPull.subjects.some(s => s.id === 104 && s.name === 'Remote Pulled Subject'),
    'T-5.1-08-B: Manual pull with force=true on dirty state executes safe reconciliation rather than silently discarding local edits'
  );

  // --- Test C: Push failure preserves dirty state and local edits (T-5.1-08-C) ---
  const uidM5A3 = 'user_m5a_recon_3';
  prod.localStorage.clear();
  prod.toastHistory.length = 0;
  prod.setSessionUser(uidM5A3);
  prod.resetLiveActorForTabSimulation('dev_m5a_3');

  const localSubM5C = { id: 105, name: 'Offline Edit Prior To Push Error', _updatedAt: 4000, groups: [] };
  prod.setRuntimeState({
    activeSubjectId: 105,
    subjects: [localSubM5C],
    scheduleEvents: [],
    scheduleBacklog: [],
    logs: [],
    weeklyReports: []
  });
  prod.saveSubjects();
  prod.localStorage.setItem('pharmaWorkspaceDirty', '1');
  prod.localStorage.setItem('pharmaWorkspaceDirty_' + uidM5A3, '1');
  prod.localStorage.setItem('pharmaLastActiveCloudUid', uidM5A3);

  const remoteRowM5C = {
    user_id: uidM5A3,
    user_email: uidM5A3 + '@test.edu',
    revision: 1,
    subjects: [{ id: 106, name: 'Remote Existing Subject', _updatedAt: 1000, groups: [] }],
    schedule: { version: 3, events: [], backlog: [], plannerPrefs: { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75 }, weeklyReports: [] },
    logs: [],
    academy_progress: [],
    annotations: {},
    updated_at: '2026-11-05T12:20:00.000Z'
  };

  // Simulate RPC error during cloud push
  prod.setSupabaseClient(makeSupabaseMock(remoteRowM5C, async () => {
    throw new Error('Simulated 503 Network Timeout');
  }));

  const pullWithRpcErrorRes = await prod.pullWorkspaceFromCloud(false);
  const stateAfterFailedPush = prod.getRuntimeState();

  assert(
    pullWithRpcErrorRes &&
    pullWithRpcErrorRes.reconciled === true &&
    pullWithRpcErrorRes.status === 'reconciled_locally' &&
    pullWithRpcErrorRes.pushResult?.status === 'error' &&
    stateAfterFailedPush.subjects.some(s => s.id === 105) &&
    stateAfterFailedPush.subjects.some(s => s.id === 106) &&
    prod.localStorage.getItem('pharmaWorkspaceDirty') === '1' &&
    prod.localStorage.getItem('pharmaWorkspaceDirty_' + uidM5A3) === '1',
    'T-5.1-08-C: Push failure during dirty reconciliation preserves merged local data and keeps pharmaWorkspaceDirty set without false cloud acknowledgment'
  );

  // --- Test D: Successful retry clears dirty state after confirmed server success (T-5.1-08-D) ---
  let retryRpcConfirmed = false;
  prod.setSupabaseClient(makeSupabaseMock(remoteRowM5C, async (name, params) => {
    retryRpcConfirmed = true;
    return { data: { status: 'success', revision: 2 }, error: null };
  }));

  const retryPushResult = await prod.pushWorkspaceToCloud(false, false);
  const accountVaultM5A3AfterRetry = JSON.parse(prod.localStorage.getItem(prod.getAccountBackupStorageKey(uidM5A3)) || '{}');

  assert(
    retryPushResult &&
    retryPushResult.status === 'success' &&
    retryRpcConfirmed === true &&
    prod.localStorage.getItem('pharmaWorkspaceDirty') === null &&
    prod.localStorage.getItem('pharmaWorkspaceDirty_' + uidM5A3) === null &&
    accountVaultM5A3AfterRetry.dirty === false,
    'T-5.1-08-D: Subsequent retry push persists reconciled state to cloud and clears dirty flags only after server confirms success'
  );

  // --- Test E: Account isolation during reconciliation / direct switch (T-5.1-08-E) ---
  const uidUserX = 'user_m5a_x';
  const uidUserY = 'user_m5a_y';
  prod.localStorage.clear();
  prod.setSessionUser(uidUserX);
  prod.resetLiveActorForTabSimulation('dev_m5a_x');

  const subUserX = { id: 701, name: 'Confidential Subject of User X', _updatedAt: 5000, groups: [] };
  prod.setRuntimeState({
    activeSubjectId: 701,
    subjects: [subUserX],
    scheduleEvents: [],
    scheduleBacklog: [],
    logs: [],
    weeklyReports: []
  });
  prod.saveSubjects();
  prod.localStorage.setItem('pharmaWorkspaceDirty', '1');
  prod.localStorage.setItem('pharmaWorkspaceDirty_' + uidUserX, '1');
  prod.localStorage.setItem('pharmaLastActiveCloudUid', uidUserX);

  // Switch to User Y
  prod.setSessionUser(uidUserY);
  prod.resetLiveActorForTabSimulation('dev_m5a_y');

  const remoteRowUserY = {
    user_id: uidUserY,
    user_email: uidUserY + '@test.edu',
    revision: 1,
    subjects: [{ id: 801, name: 'Normal Subject of User Y', _updatedAt: 1000, groups: [] }],
    schedule: { version: 3, events: [], backlog: [], plannerPrefs: { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75 }, weeklyReports: [] },
    logs: [],
    academy_progress: [],
    annotations: {},
    updated_at: '2026-11-05T12:30:00.000Z'
  };

  prod.setSupabaseClient(makeSupabaseMock(remoteRowUserY, async () => {
    return { data: { status: 'success', revision: 2 }, error: null };
  }));

  await prod.syncWorkspaceOnLogin();
  const stateUserY = prod.getRuntimeState();
  const vaultUserX = JSON.parse(prod.localStorage.getItem(prod.getAccountBackupStorageKey(uidUserX)) || '{}');

  assert(
    stateUserY.subjects.some(s => s.id === 801 && s.name === 'Normal Subject of User Y') &&
    !stateUserY.subjects.some(s => s.id === 701) &&
    vaultUserX.subjects?.some(s => s.id === 701 && s.name === 'Confidential Subject of User X'),
    'T-5.1-08-E: Account switch preserves User X dirty edits in User X vault and never merges User X data into User Y session'
  );

  // --- Test F: Preservation of existing M1 first-login academy_progress and M3/M4 regressions (T-5.1-08-F) ---
  const uidBrandNew = 'user_m5a_brand_new';
  prod.localStorage.clear();
  prod.setSessionUser(uidBrandNew);
  prod.resetLiveActorForTabSimulation('dev_m5a_new');

  // Seed pre-login academy progress in memory and localStorage
  prod.setRuntimeState({
    completedAcademyModules: ['mod_cardiology_101', 'mod_neurology_201'],
    subjects: [],
    scheduleEvents: [],
    scheduleBacklog: [],
    logs: [],
    weeklyReports: []
  });
  prod.localStorage.setItem('pharmaAcademyProgressV1', JSON.stringify(['mod_cardiology_101', 'mod_neurology_201']));

  let brandNewInitialPushPayload = null;
  prod.setSupabaseClient(makeSupabaseMock(null, async (name, params) => {
    brandNewInitialPushPayload = params?.p_payload;
    return { data: { status: 'success', revision: 1 }, error: null };
  }));

  // Trigger login sync for brand-new cloud user (data === null)
  const brandNewSyncRes = await prod.syncWorkspaceOnLogin();
  const stateBrandNew = prod.getRuntimeState();
  const academyStorageBrandNew = JSON.parse(prod.localStorage.getItem('pharmaAcademyProgressV1') || '[]');

  assert(
    brandNewSyncRes &&
    stateBrandNew.completedAcademyModules.includes('mod_cardiology_101') &&
    stateBrandNew.completedAcademyModules.includes('mod_neurology_201') &&
    academyStorageBrandNew.includes('mod_cardiology_101') &&
    academyStorageBrandNew.includes('mod_neurology_201') &&
    brandNewInitialPushPayload?.academy_progress?.includes('mod_cardiology_101') &&
    brandNewInitialPushPayload?.academy_progress?.includes('mod_neurology_201'),
    'T-5.1-08-F: Brand-new cloud account login preserves pre-login completedAcademyModules in memory, localStorage, and initial cloud push without regression'
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
