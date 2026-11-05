// ============================================================================
// Exo Academic Platform — Phase 4.1 Cross-Account Isolation Test Suite
// Directly executes production functions from index.html against a realistic
// IndexedDB transaction harness to verify strict dual-ownership, foreign key
// rejection (`CROSS_ACCOUNT_KEY_VIOLATION`), explicit result contracts,
// transaction-safe RAM cache updates, and zero cross-account data leakage.
//
// Technical References & Sources:
//   - W3C Indexed Database API 3.0 (§4.3 Transaction Lifetime):
//     https://www.w3.org/TR/IndexedDB-3/#transaction-lifetime-concept
//   - MDN Web Docs — IDBTransaction.oncomplete / onabort:
//     https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction
//   - OWASP Multi-Tenant Client Storage Isolation Guidelines:
//     https://owasp.org/www-project-web-security-testing-guide/
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

// Create an in-memory IndexedDB harness that mirrors real IDBTransaction / IDBRequest semantics
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
let failNextAccountSnapshotWrite = false;
const localStorage = {
  getItem: (k) => (storageBacking.has(String(k)) ? storageBacking.get(String(k)) : null),
  setItem: (k, v) => {
    if (failNextAccountSnapshotWrite && String(k).startsWith('pharmaAccountWorkspace_')) {
      failNextAccountSnapshotWrite = false;
      throw new Error('QuotaExceededError: Simulated account snapshot write failure');
    }
    storageBacking.set(String(k), String(v));
  },
  removeItem: (k) => { storageBacking.delete(String(k)); },
  clear: () => { storageBacking.clear(); }
};
const navigator = { onLine: false };
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
let isolatedPendingAnnotationsByUser = {};
let realtimeChannel = null;
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

function clearTimeout() {}
function showToast() {}
function renderSubjectsList() {}
function renderGroups() {}
function backToSubjects() { activeSubjectId = null; }
function renderSchedule() {}
function updateTracker() {}
function updateCloudMediaStatsUI() {}
function updateAcademyXpUI() {}
function updateCloudNavUI() {}
function updateGoogleDriveUI() {}
function setupRealtimeWorkspaceSubscription() {}
async function refreshLocalMediaCache() {}
async function reconcileCloudMediaWithStorageBucket() {}
async function flushPendingAnnotationsSave(triggerCloudImmediately = false, opCtx = null) {
  const keys = Object.keys(pendingAnnoSaveMap);
  if (keys.length === 0) return true;
  if (!dbInstance) return false;
  const ctx = resolveAccountOperationContext(opCtx);
  if (!ctx || !ctx.ok || !ctx.authorized) return false;
  const toRestore = {};
  for (const k of keys) {
    const rawId = extractRawIdFromScopedKey(k);
    toRestore[rawId] = pendingAnnoSaveMap[k];
  }
  const res = await restoreAllAnnotationsMapToDB(toRestore, ctx.uid, ctx);
  if (!res || !res.ok) return false;
  pendingAnnoSaveMap = {};
  return true;
}

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
${extractFunctionSource(indexHtmlContent, 'initScheduleData')}
${extractFunctionSource(indexHtmlContent, 'saveScheduleData')}
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
${extractFunctionSource(indexHtmlContent, 'computeFastStringSignature')}
${extractFunctionSource(indexHtmlContent, 'getAllAnnotationsMapFromDB')}
${extractFunctionSource(indexHtmlContent, 'restoreAllAnnotationsMapToDB')}
${extractFunctionSource(indexHtmlContent, 'isGoogleDriveTokenActive')}
${extractFunctionSource(indexHtmlContent, 'isGoogleDriveAccountLinked')}
${extractFunctionSource(indexHtmlContent, 'isGoogleDriveConnected')}
${extractFunctionSource(indexHtmlContent, 'handleAuthSessionChange')}
${extractFunctionSource(indexHtmlContent, 'handleCloudSignOut')}
${extractFunctionSource(indexHtmlContent, 'pushWorkspaceToCloud')}
${extractFunctionSource(indexHtmlContent, 'preserveUnverifiedGuestWorkspace')}
${extractFunctionSource(indexHtmlContent, 'restoreUnverifiedGuestWorkspace')}
${extractFunctionSource(indexHtmlContent, 'verifyLocalWorkspaceProvenance')}
${extractFunctionSource(indexHtmlContent, 'applyCloudWorkspacePayload')}
${extractFunctionSource(indexHtmlContent, 'syncWorkspaceOnLogin')}

module.exports = {
  localStorage,
  setFailNextAccountSnapshotWrite: (v) => { failNextAccountSnapshotWrite = Boolean(v); },
  setSessionUser: (uid) => {
    currentCloudUser = uid ? { id: uid, email: uid + '@test.edu' } : null;
    bumpAccountSessionGeneration();
  },
  setDbInstance: (db) => { dbInstance = db; },
  getInMemoryCache: () => inMemoryAnnotationsCache,
  clearInMemoryCache: () => { inMemoryAnnotationsCache = {}; inMemoryAnnotationsCacheNormalized = {}; },
  setWorkspaceState: (state) => {
    if (state.subjects !== undefined) { subjects = state.subjects; localStorage.setItem('pharmaSubjectsV4', JSON.stringify(subjects)); }
    if (state.scheduleEvents !== undefined) scheduleEvents = state.scheduleEvents;
    if (state.scheduleBacklog !== undefined) scheduleBacklog = state.scheduleBacklog;
    if (state.weeklyReports !== undefined) weeklyReports = state.weeklyReports;
    if (state.plannerPrefs !== undefined) plannerPrefs = state.plannerPrefs;
    if (state.scheduleEvents !== undefined || state.scheduleBacklog !== undefined || state.weeklyReports !== undefined || state.plannerPrefs !== undefined) {
      saveScheduleData(false);
    }
    if (state.currentPdfFitMode !== undefined) {
      currentPdfFitMode = state.currentPdfFitMode;
      localStorage.setItem('pharmaPdfFitMode', currentPdfFitMode);
    }
    if (state.currentUserCanUploadMedia !== undefined) {
      currentUserCanUploadMedia = Boolean(state.currentUserCanUploadMedia);
    }
    if (state.googleAccessToken !== undefined) {
      googleAccessToken = state.googleAccessToken;
      if (state.googleAccessToken) localStorage.setItem('exo_gdrive_token', state.googleAccessToken);
      else localStorage.removeItem('exo_gdrive_token');
    }
    if (state.googleTokenExpiry !== undefined) {
      googleTokenExpiry = Number(state.googleTokenExpiry || 0);
      if (googleTokenExpiry > 0) localStorage.setItem('exo_gdrive_token_exp', String(googleTokenExpiry));
      else localStorage.removeItem('exo_gdrive_token_exp');
    }
    if (state.logs !== undefined) { logs = state.logs; localStorage.setItem('pharmaLogsV4', JSON.stringify(logs)); }
    if (state.completedAcademyModules !== undefined) { completedAcademyModules = state.completedAcademyModules; localStorage.setItem('pharmaAcademyProgressV1', JSON.stringify(completedAcademyModules)); }
    if (state.cloudMediaRegistry !== undefined) { cloudMediaRegistry = state.cloudMediaRegistry; saveCloudMediaRegistry(); }
    if (state.pendingAnnoSaveMap !== undefined) { pendingAnnoSaveMap = state.pendingAnnoSaveMap; }
    if (state.dirtyAnnotationsForCloud !== undefined) { dirtyAnnotationsForCloud = Boolean(state.dirtyAnnotationsForCloud); }
    if (state.dirty) localStorage.setItem('pharmaWorkspaceDirty', '1');
  },
  getWorkspaceState: () => ({
    currentCloudUser,
    currentUserCanUploadMedia,
    currentPdfFitMode,
    googleAccessToken,
    googleTokenExpiry,
    dirtyAnnotationsForCloud,
    pendingAnnoSaveMap,
    subjects,
    scheduleEvents,
    scheduleBacklog,
    weeklyReports,
    plannerPrefs,
    logs,
    completedAcademyModules,
    cloudMediaRegistry
  }),
  CAUSAL_TOMBSTONE_ENTITY_TYPES,
  normalizeSingleTombstoneEntry,
  normalizeTombstonesObject,
  getLocalTombstones,
  recordTombstone,
  recordTombstonesAtomicBatch,
  validateAndResolveEntityScope,
  CAUSAL_TOMBSTONE_ENTITY_TYPES,
  stampEntityMutation,
  restoreDeletedEntity,
  cleanupDeletedLectureLocalArtifacts,
  drainPendingLocalArtifactCleanup,
  initScheduleData,
  isGoogleDriveTokenActive,
  isGoogleDriveAccountLinked,
  isGoogleDriveConnected,
  handleAuthSessionChange,
  handleCloudSignOut,
  preserveUnverifiedGuestWorkspace,
  restoreUnverifiedGuestWorkspace,
  verifyLocalWorkspaceProvenance,
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
  getAllAnnotationsMapFromDB,
  restoreAllAnnotationsMapToDB
};
`;

const tempHelperPath = './_temp_iso_helpers.js';
fs.writeFileSync(tempHelperPath, prodHelpersCode);
const prod = require(tempHelperPath);
fs.unlinkSync(tempHelperPath);

async function main() {
  console.log('======================================================================');
  console.log('TEST SUITE: CROSS-ACCOUNT ANNOTATION ISOLATION & LEAKAGE PREVENTION');
  console.log('======================================================================\n');

  const idb = new InMemoryIDBDatabase();
  prod.setDbInstance(idb);

  const userA_Id = 'aaaaaaaa-1111-2222-3333-444455556666';
  const userB_Id = 'bbbbbbbb-9999-8888-7777-666655554444';
  const sharedLectureId = 'lecture_101'; // OVERLAPPING LECTURE ID

  // SCENARIO 1: User A draws private annotations on Lecture 101
  console.log('--- SCENARIO 1: User A Creates Annotations on Lecture 101 ---');
  prod.setSessionUser(userA_Id);
  const userA_Strokes = {
    1: [{ tool: 'pen', color: '#ff0000', note: 'CONFIDENTIAL: User A Private Exam Notes' }]
  };
  const restoreARes = await prod.restoreAllAnnotationsMapToDB({ [sharedLectureId]: userA_Strokes }, userA_Id);
  assert(restoreARes.ok === true && restoreARes.restoredCount === 1, 'restoreAllAnnotationsMapToDB returns { ok: true, restoredCount: 1 } for User A');

  // Verify User A's export via real production getAllAnnotationsMapFromDB
  const exportUserA = await prod.getAllAnnotationsMapFromDB(userA_Id);
  assert(exportUserA.ok === true, 'getAllAnnotationsMapFromDB returns { ok: true } for User A');
  assert(exportUserA.verifiedMap[sharedLectureId] !== undefined, 'User A export contains Lecture 101 annotations');
  assert(exportUserA.verifiedMap[sharedLectureId][1][0].note === 'CONFIDENTIAL: User A Private Exam Notes', 'User A export contains correct private note');

  // SCENARIO 2: User A logs out, User B logs in on the SAME device
  console.log('\n--- SCENARIO 2: User B Logs In on the Same Device & Syncs ---');
  prod.clearInMemoryCache();
  prod.setSessionUser(userB_Id);

  const exportUserB_BeforeDraw = await prod.getAllAnnotationsMapFromDB(userB_Id);
  assert(exportUserB_BeforeDraw.ok === true, 'getAllAnnotationsMapFromDB returns { ok: true } for User B');
  assert(Object.keys(exportUserB_BeforeDraw.verifiedMap).length === 0, 'User B export is COMPLETELY EMPTY (Zero records from User A leaked!)');
  assert(exportUserB_BeforeDraw.verifiedMap[sharedLectureId] === undefined, 'User A Lecture 101 annotations are NOT visible to User B');

  // SCENARIO 3: User B draws their OWN annotations on Lecture 101
  console.log('\n--- SCENARIO 3: User B Draws Own Annotations on Overlapping Lecture 101 ---');
  const userB_Strokes = {
    1: [{ tool: 'highlighter', color: '#ffff00', note: 'User B Organic Chemistry Notes' }]
  };
  const restoreBRes = await prod.restoreAllAnnotationsMapToDB({ [sharedLectureId]: userB_Strokes }, userB_Id);
  assert(restoreBRes.ok === true, 'User B restores own annotations on overlapping Lecture 101');

  const exportUserB_AfterDraw = await prod.getAllAnnotationsMapFromDB(userB_Id);
  assert(exportUserB_AfterDraw.verifiedMap[sharedLectureId] !== undefined, 'User B export contains Lecture 101');
  assert(exportUserB_AfterDraw.verifiedMap[sharedLectureId][1][0].note === 'User B Organic Chemistry Notes', 'User B export contains ONLY User B note');

  // Switch back to User A and verify User A's export is STILL intact and untouched!
  prod.setSessionUser(userA_Id);
  const exportUserA_Check = await prod.getAllAnnotationsMapFromDB(userA_Id);
  assert(exportUserA_Check.verifiedMap[sharedLectureId][1][0].note === 'CONFIDENTIAL: User A Private Exam Notes', 'User A annotations remain 100% intact and uncorrupted by User B');

  // SCENARIO 4: Conflicting Key Prefix vs Stored userId Metadata & Missing userId Quarantine
  console.log('\n--- SCENARIO 4: Conflicted Key vs Metadata & Missing userId Quarantine ---');
  idb.stores.annotations.set(`usr_${userA_Id}::spoofed_lec`, {
    id: `usr_${userA_Id}::spoofed_lec`,
    rawId: 'spoofed_lec',
    userId: userB_Id, // Mismatched!
    pages: { 1: ['Malicious injection'] }
  });
  idb.stores.annotations.set(`usr_${userB_Id}::corrupted_lec`, {
    id: `usr_${userB_Id}::corrupted_lec`,
    rawId: 'corrupted_lec',
    userId: userA_Id, // Mismatched!
    pages: { 1: ['Corrupted injection'] }
  });
  idb.stores.annotations.set(`usr_${userA_Id}::missing_uid_lec`, {
    id: `usr_${userA_Id}::missing_uid_lec`,
    rawId: 'missing_uid_lec',
    userId: null, // Missing userId metadata!
    pages: { 1: ['Missing userId injection'] }
  });

  prod.setSessionUser(userA_Id);
  const checkUserA_Conflict = await prod.getAllAnnotationsMapFromDB(userA_Id);
  assert(checkUserA_Conflict.verifiedMap['spoofed_lec'] === undefined, 'Spoofed record (key userA, userId userB) is strictly quarantined from User A export');
  assert(checkUserA_Conflict.verifiedMap['corrupted_lec'] === undefined, 'Corrupted record (key userB, userId userA) is strictly quarantined from User A export');
  assert(checkUserA_Conflict.verifiedMap['missing_uid_lec'] === undefined, 'Record with missing userId (null) is strictly quarantined from User A export');

  prod.setSessionUser(userB_Id);
  const checkUserB_Conflict = await prod.getAllAnnotationsMapFromDB(userB_Id);
  assert(checkUserB_Conflict.verifiedMap['spoofed_lec'] === undefined, 'Spoofed record is strictly quarantined from User B export');
  assert(checkUserB_Conflict.verifiedMap['corrupted_lec'] === undefined, 'Corrupted record is strictly quarantined from User B export');

  // SCENARIO 5: Foreign Scoped Key Rejection in restoreAllAnnotationsMapToDB
  console.log('\n--- SCENARIO 5: Foreign Scoped Key Rejection & Transaction-Safe Cache Update ---');
  prod.setSessionUser(userA_Id);
  prod.clearInMemoryCache();
  const foreignKeyAttempt = await prod.restoreAllAnnotationsMapToDB({
    [`usr_${userB_Id}::hijack_999`]: { 1: [{ tool: 'pen', note: 'Hijack attempt' }] }
  }, userA_Id);
  assert(foreignKeyAttempt.ok === false && foreignKeyAttempt.error.code === 'CROSS_ACCOUNT_KEY_VIOLATION',
         'restoreAllAnnotationsMapToDB strictly rejects foreign scoped key usr_B::hijack_999 when User A is active');
  assert(!idb.stores.annotations.has(`usr_${userA_Id}::hijack_999`),
         'Foreign scoped key was NEVER converted to usr_A::hijack_999 in IndexedDB');

  // Test failed write transaction does NOT pollute inMemoryAnnotationsCache
  idb.failNextTransaction = true;
  const abortedRestore = await prod.restoreAllAnnotationsMapToDB({
    'tx_fail_lec': { 1: [{ tool: 'pen', note: 'Should not enter cache' }] }
  }, userA_Id);
  assert(abortedRestore.ok === false, 'Aborted IDB transaction returns { ok: false }');
  assert(prod.getInMemoryCache()[`usr_${userA_Id}::tx_fail_lec`] === undefined,
         'inMemoryAnnotationsCache is NOT updated when IndexedDB transaction aborts');

  // SCENARIO 6: Remote Restoration with Ownership Scoping
  console.log('\n--- SCENARIO 6: Remote Restoration Prevents Reintroducing Unscoped Records ---');
  prod.setSessionUser(userB_Id);
  const remoteCloudPayloadForUserB = {
    'lecture_101': { 1: [{ tool: 'pen', note: 'Restored from Beta Cloud' }] },
    'lecture_202': { 1: [{ tool: 'text', note: 'Beta Chapter 2 Notes' }] }
  };
  const restoreValidB = await prod.restoreAllAnnotationsMapToDB(remoteCloudPayloadForUserB, userB_Id);
  assert(restoreValidB.ok === true && restoreValidB.restoredCount === 2, 'Valid restoration for User B commits cleanly');

  const scopedLec101 = prod.toScopedKey('lecture_101', userB_Id);
  const storedItem = idb.stores.annotations.get(scopedLec101);
  assert(storedItem && storedItem.userId === userB_Id, 'Restored record has explicit userId = User B');
  assert(storedItem.id.startsWith('usr_' + userB_Id), 'Restored record has account-scoped key prefix');
  assert(!idb.stores.annotations.has('lecture_101'), 'No unscoped raw lecture ID record was created in the database');

  // SCENARIO 7: Explicit Error Contract on DB Read Failure
  console.log('\n--- SCENARIO 7: Explicit Error Contract on DB Read Failure ---');
  idb.failNextTransaction = true;
  const failedRead = await prod.getAllAnnotationsMapFromDB(userB_Id);
  assert(failedRead.ok === false && failedRead.error && failedRead.error.code === 'IDB_READ_ERROR',
         'getAllAnnotationsMapFromDB returns { ok: false, error } on IndexedDB failure instead of empty {}');

  // SCENARIO 8 (T-5.1-01): Sign-Out Global Workspace Sanitization, Account Recovery & User B Isolation
  console.log('\n--- SCENARIO 8 (T-5.1-01): Sign-Out Global Workspace Sanitization & Account Recovery ---');
  prod.localStorage.clear();
  prod.setSessionUser(userA_Id);
  prod.localStorage.setItem('pharmaLastActiveCloudUid', userA_Id);
  prod.localStorage.setItem('pharmaLastActiveUserIdV1', userA_Id);
  prod.setWorkspaceState({
    subjects: [{ id: 'sub_a_m1', name: 'Clinical Pharmacology A', groups: [{ id: 'g_a1', name: 'Unit 1', lectures: [{ id: 'lec_a1', name: 'Lecture 1' }] }] }],
    scheduleEvents: [{ id: 'ev_a1', title: 'Study Block A', day: 6, startHour: 9, duration: 2 }],
    scheduleBacklog: [{ id: 'bl_a1', title: 'Backlog Task A' }],
    weeklyReports: [{ id: 'rep_a1', weekStartIso: '2026-10-31', score: 92 }],
    plannerPrefs: { weekStartDay: 1, dayStartHour: 7, dayEndHour: 22, autoCompletePct: 80, currentWeekStartIso: '2026-10-26' },
    logs: [{ id: 'log_a1', text: 'Completed Lecture 1', timestamp: 1700000001 }],
    completedAcademyModules: ['mod_a1', 'mod_a2'],
    cloudMediaRegistry: { 'lec_a1': { pdfUploaded: true, ownerUid: userA_Id } },
    dirty: true
  });

  // First test failure path: if localStorage account snapshot write fails during sign-out, do NOT discard dirty data!
  prod.setFailNextAccountSnapshotWrite(true);
  const abortedSignOut = await prod.handleCloudSignOut(true);
  assert(abortedSignOut.success === false && abortedSignOut.isDirty === true,
         'T-5.1-01a: handleCloudSignOut aborts and preserves dirty state when account snapshot write fails');
  assert(prod.localStorage.getItem('pharmaSubjectsV4') !== null && prod.getWorkspaceState().subjects.length === 1,
         'T-5.1-01b: Aborted sign-out does not wipe global localStorage or in-memory workspace state');

  // Now perform normal sign-out for User A
  const okSignOut = await prod.handleCloudSignOut(true);
  assert(okSignOut.success === true && okSignOut.backupSuccess === true,
         'T-5.1-01c: handleCloudSignOut succeeds after persisting account-scoped snapshot pharmaAccountWorkspace_<uid>');

  const clearedGlobalKeys = [
    'pharmaSubjectsV4',
    'pharmaScheduleV4',
    'pharmaScheduleBacklogV1',
    'pharmaWeeklyReportsV1',
    'pharmaPlannerPrefsV1',
    'pharmaLogsV4',
    'pharmaAcademyProgressV1',
    'pharmaCloudMediaRegistryV1',
    'pharmaWorkspaceDirty',
    'pharmaLastActiveCloudUid'
  ];
  const allUnscopedCleared = clearedGlobalKeys.every(k => prod.localStorage.getItem(k) === null);
  assert(allUnscopedCleared,
         'T-5.1-01d: All 10 designated unscoped global workspace keys are cleared (null) on sign-out');

  // Simulate page reload boot while logged out: initScheduleData() must NOT re-populate pharmaPlannerPrefsV1
  prod.initScheduleData();
  assert(prod.localStorage.getItem('pharmaPlannerPrefsV1') === null && prod.localStorage.getItem('pharmaSubjectsV4') === null,
         'T-5.1-01e: Logged-out boot (initScheduleData) leaves unscoped global localStorage keys null');

  const postLogoutState = prod.getWorkspaceState();
  assert(
    postLogoutState.subjects.length === 0 &&
    postLogoutState.scheduleEvents.length === 0 &&
    postLogoutState.scheduleBacklog.length === 0 &&
    postLogoutState.weeklyReports.length === 0 &&
    postLogoutState.logs.length === 0 &&
    postLogoutState.completedAcademyModules.length === 0 &&
    Object.keys(postLogoutState.cloudMediaRegistry).length === 0,
    'T-5.1-01f: All in-memory workspace arrays and registries are empty while logged out'
  );

  // Re-authenticate User A and verify full recovery from pharmaAccountWorkspace_<uidA>
  prod.setSessionUser(userA_Id);
  await prod.syncWorkspaceOnLogin();
  const recoveredStateA = prod.getWorkspaceState();
  assert(
    recoveredStateA.subjects.length === 1 &&
    recoveredStateA.subjects[0].id === 'sub_a_m1' &&
    recoveredStateA.scheduleEvents.length === 1 &&
    recoveredStateA.scheduleBacklog.length === 1 &&
    recoveredStateA.weeklyReports.length === 1 &&
    recoveredStateA.plannerPrefs.weekStartDay === 1 &&
    recoveredStateA.logs.length === 1 &&
    recoveredStateA.completedAcademyModules.length === 2,
    'T-5.1-01g: Re-authenticating User A restores all workspace categories from pharmaAccountWorkspace_<uidA>'
  );

  // Sign out User A again, then authenticate brand-new User C and verify zero User A data leaks
  await prod.handleCloudSignOut(true);
  const userC_Id = 'c3c3c3c3-0000-4444-8888-ffffffffffff';
  prod.setSessionUser(userC_Id);
  await prod.syncWorkspaceOnLogin();
  const stateUserC = prod.getWorkspaceState();
  assert(
    stateUserC.subjects.length === 0 &&
    stateUserC.scheduleEvents.length === 0 &&
    stateUserC.scheduleBacklog.length === 0 &&
    stateUserC.weeklyReports.length === 0 &&
    stateUserC.logs.length === 0 &&
    stateUserC.completedAcademyModules.length === 0,
    'T-5.1-01h: Subsequent login by User C sees zero leftover workspace data from User A'
  );

  // SCENARIO 9 (T-M1-C01): Direct Account A-to-B Switch Without Calling handleCloudSignOut()
  // Covers Mandatory Tests A, B, C, and D
  console.log('\n--- SCENARIO 9 (T-M1-C01): Direct Account A-to-B Switch (Stale Snapshot Refresh, Trigger Conditions, Drive Vault Refresh & Failure Safety) ---');
  prod.localStorage.clear();
  idb.stores.annotations.clear();

  // ==========================================================================
  // TEST A & TEST C (Part 1): Existing Stale Snapshot + Existing Older Drive Vault
  // ==========================================================================
  const futureExpA = Date.now() + 3600 * 1000;
  await prod.handleAuthSessionChange({ id: userA_Id, email: 'user_a@exo.edu', name: 'User A' }, false);

  // Seed an OLDER, STALE pharmaAccountWorkspace_<userA_Id> snapshot and an OLDER pharmaGdriveSync_<userA_Id> vault
  prod.localStorage.setItem('pharmaGdriveSync_' + userA_Id, JSON.stringify({
    linked: true,
    userEmail: 'stale_old_drive_a@gmail.com',
    folderId: 'stale_folder_A_000',
    quotaInfo: '1.1 / 15.0 GB'
  }));
  prod.localStorage.setItem(prod.getAccountBackupStorageKey(userA_Id), JSON.stringify({
    user_id: userA_Id,
    user_email: 'user_a@exo.edu',
    can_upload_media: false,
    revision: 3,
    dirty: false,
    subjects: [{ id: 'sub_stale_old_a', name: 'Stale Old Subject A', groups: [] }],
    schedule: {
      version: 3,
      events: [{ id: 'ev_stale_old_a', title: 'Stale Event', day: 6, startHour: 6, duration: 1 }],
      backlog: [],
      plannerPrefs: { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75, currentWeekStartIso: '2026-10-10' },
      weeklyReports: [],
      pdfFitMode: 'height',
      cloudMediaRegistry: {},
      gdriveSync: {
        linked: true,
        userEmail: 'stale_old_drive_a@gmail.com',
        folderId: 'stale_folder_A_000',
        quotaInfo: '1.1 / 15.0 GB'
      }
    },
    logs: [],
    academy_progress: [],
    annotations: {
      'stale_deleted_lec': { 1: [{ id: 'str_stale_0', tool: 'pen', note: 'STALE SNAPSHOT ANNOTATION' }] }
    }
  }));

  // Now give User A NEWER live workspace data, dirty flag, verified IndexedDB annotations, and pending annotations
  await prod.restoreAllAnnotationsMapToDB({
    [sharedLectureId]: userA_Strokes
  }, userA_Id);

  prod.setWorkspaceState({
    subjects: [{ id: 'sub_direct_a_fresh', name: 'Fresh Medicinal Chemistry A', groups: [] }],
    scheduleEvents: [{ id: 'ev_direct_a_fresh', title: 'Fresh Lab A', day: 1, startHour: 10, duration: 2 }],
    scheduleBacklog: [{ id: 'bl_direct_a_fresh', title: 'Fresh Task A' }],
    weeklyReports: [{ id: 'rep_direct_a_fresh', weekStartIso: '2026-10-26', score: 95 }],
    plannerPrefs: { weekStartDay: 1, dayStartHour: 8, dayEndHour: 20, autoCompletePct: 90, currentWeekStartIso: '2026-10-26' },
    currentPdfFitMode: 'width',
    currentUserCanUploadMedia: true,
    googleAccessToken: 'ya29.secret_token_user_A',
    googleTokenExpiry: futureExpA,
    logs: [{ id: 'log_direct_a_fresh', text: 'Studied Fresh MedChem', timestamp: 1700005000 }],
    completedAcademyModules: ['mod_direct_a1', 'mod_direct_a2'],
    cloudMediaRegistry: { 'lec_direct_a_fresh': { pdfUploaded: true, ownerUid: userA_Id } },
    pendingAnnoSaveMap: {
      'lec_pending_flush_a': { 1: [{ id: 'str_pending_a', tool: 'pen', note: 'Flushed Pending Note A' }] }
    },
    dirty: true
  });
  prod.localStorage.setItem('pharmaWorkspaceRevision_' + userA_Id, '7');
  // Newer live Google Drive metadata bound to User A
  prod.localStorage.setItem('exo_gdrive_connected', '1');
  prod.localStorage.setItem('exo_gdrive_user_email', 'user_a_fresh_drive@gmail.com');
  prod.localStorage.setItem('exo_gdrive_folder_id', 'folder_A_fresh_777');
  prod.localStorage.setItem('exo_gdrive_quota_info', '9.8 / 15.0 GB');
  prod.localStorage.setItem('exo_gdrive_bound_user_id', userA_Id);

  assert(
    prod.getWorkspaceState().currentUserCanUploadMedia === true &&
    prod.isGoogleDriveTokenActive() === true &&
    prod.isGoogleDriveAccountLinked() === true &&
    prod.isGoogleDriveConnected() === true,
    'T-M1-C01a: Pre-switch User A has active VIP entitlement, Google OAuth token, and newer live workspace/Drive state'
  );

  // Switch directly from User A to User B1 (no saved workspace or Drive configuration) WITHOUT calling handleCloudSignOut()
  const userB1_EmptyId = 'b1111111-0000-4444-8888-111111111111';
  await prod.handleAuthSessionChange({ id: userB1_EmptyId, email: 'user_b1_empty@exo.edu', name: 'User B1 Empty' }, true);
  const stateB1 = prod.getWorkspaceState();
  const storedPrefsB1 = JSON.parse(prod.localStorage.getItem('pharmaPlannerPrefsV1') || 'null');

  assert(
    stateB1.plannerPrefs.weekStartDay === 6 &&
    stateB1.plannerPrefs.dayStartHour === 6 &&
    stateB1.plannerPrefs.dayEndHour === 23 &&
    stateB1.plannerPrefs.autoCompletePct === 75 &&
    storedPrefsB1 && storedPrefsB1.weekStartDay === 6 &&
    stateB1.currentPdfFitMode === 'height' &&
    prod.localStorage.getItem('pharmaPdfFitMode') === 'height',
    'T-M1-C01b (Test A): Direct switch to unconfigured User B1 resets plannerPrefs and currentPdfFitMode ("height") to platform defaults'
  );
  assert(
    stateB1.googleAccessToken === null &&
    stateB1.googleTokenExpiry === 0 &&
    prod.isGoogleDriveTokenActive() === false &&
    prod.isGoogleDriveAccountLinked() === false &&
    prod.isGoogleDriveConnected() === false &&
    prod.localStorage.getItem('exo_gdrive_token') === null &&
    prod.localStorage.getItem('exo_gdrive_token_exp') === null &&
    prod.localStorage.getItem('exo_gdrive_connected') === null &&
    prod.localStorage.getItem('exo_gdrive_folder_id') === null &&
    prod.localStorage.getItem('exo_gdrive_user_email') === null &&
    prod.localStorage.getItem('exo_gdrive_quota_info') === null &&
    prod.localStorage.getItem('exo_gdrive_bound_user_id') === null,
    'T-M1-C01c (Test A): User A Google token, expiry, and all 7 exo_gdrive_* global keys are cleared before User B1 becomes active'
  );
  assert(
    stateB1.currentUserCanUploadMedia === false &&
    stateB1.subjects.length === 0 &&
    stateB1.scheduleEvents.length === 0 &&
    stateB1.scheduleBacklog.length === 0 &&
    stateB1.weeklyReports.length === 0 &&
    stateB1.logs.length === 0 &&
    stateB1.completedAcademyModules.length === 0 &&
    Object.keys(stateB1.cloudMediaRegistry).length === 0,
    'T-M1-C01d (Test A): User B1 does not inherit User A VIP entitlement, workspace data, or cloud media registry'
  );

  // Verify User A's stale snapshot and Drive vault were REFRESHED with all latest live changes and verified IndexedDB annotations
  const vaultAAfterB1 = JSON.parse(prod.localStorage.getItem(prod.getAccountBackupStorageKey(userA_Id)) || 'null');
  const gdriveVaultAAfterB1 = JSON.parse(prod.localStorage.getItem('pharmaGdriveSync_' + userA_Id) || 'null');
  assert(
    vaultAAfterB1 &&
    vaultAAfterB1.subjects.length === 1 &&
    vaultAAfterB1.subjects[0].id === 'sub_direct_a_fresh' &&
    vaultAAfterB1.schedule.events.length === 1 &&
    vaultAAfterB1.schedule.events[0].id === 'ev_direct_a_fresh' &&
    vaultAAfterB1.schedule.backlog.length === 1 &&
    vaultAAfterB1.schedule.backlog[0].id === 'bl_direct_a_fresh' &&
    vaultAAfterB1.schedule.weeklyReports.length === 1 &&
    vaultAAfterB1.schedule.weeklyReports[0].id === 'rep_direct_a_fresh' &&
    vaultAAfterB1.schedule.plannerPrefs.weekStartDay === 1 &&
    vaultAAfterB1.schedule.plannerPrefs.autoCompletePct === 90 &&
    vaultAAfterB1.schedule.pdfFitMode === 'width' &&
    vaultAAfterB1.schedule.cloudMediaRegistry['lec_direct_a_fresh'] !== undefined &&
    vaultAAfterB1.logs.length === 1 &&
    vaultAAfterB1.logs[0].id === 'log_direct_a_fresh' &&
    vaultAAfterB1.academy_progress.length === 2 &&
    vaultAAfterB1.can_upload_media === true &&
    vaultAAfterB1.revision === 7 &&
    vaultAAfterB1.dirty === true,
    'T-M1-C01e (Test A): Stale pharmaAccountWorkspace_A is refreshed with all of User A latest live workspace fields, revision, and dirty state'
  );
  const idbRecordA = idb.records.get('usr_' + userA_Id + '::' + sharedLectureId);
  const idbPendingA = idb.records.get('usr_' + userA_Id + '::lec_pending_flush_a');
  assert(
    vaultAAfterB1 &&
    vaultAAfterB1.annotationsStoredInIndexedDB === true &&
    vaultAAfterB1.annotations === undefined &&
    idbRecordA &&
    idbRecordA[1][0].note === 'CONFIDENTIAL: User A Private Exam Notes' &&
    idbPendingA &&
    idbPendingA[1][0].note === 'Flushed Pending Note A' &&
    idb.records.get('usr_' + userA_Id + '::stale_deleted_lec') === undefined,
    'T-M1-C01f (Test A): Refreshed pharmaAccountWorkspace_A preserves User A verified IndexedDB annotations (including flushed pending strokes) instead of writing annotations: {} or keeping stale snapshot annotations'
  );
  assert(
    gdriveVaultAAfterB1 &&
    gdriveVaultAAfterB1.linked === true &&
    gdriveVaultAAfterB1.userEmail === 'user_a_fresh_drive@gmail.com' &&
    gdriveVaultAAfterB1.folderId === 'folder_A_fresh_777' &&
    gdriveVaultAAfterB1.quotaInfo === '9.8 / 15.0 GB' &&
    gdriveVaultAAfterB1.token === undefined &&
    vaultAAfterB1.schedule.gdriveSync.linked === true &&
    vaultAAfterB1.schedule.gdriveSync.userEmail === 'user_a_fresh_drive@gmail.com' &&
    vaultAAfterB1.schedule.gdriveSync.folderId === 'folder_A_fresh_777' &&
    vaultAAfterB1.schedule.gdriveSync.quotaInfo === '9.8 / 15.0 GB',
    'T-M1-C01g (Test C): Existing pharmaGdriveSync_<uidA> and pharmaAccountWorkspace_A.schedule.gdriveSync are refreshed with User A latest bound Drive metadata without storing any OAuth token'
  );

  // ==========================================================================
  // TEST B: No Existing Snapshot — Only Non-Default plannerPrefs & completedAcademyModules
  // ==========================================================================
  const userA2_PrefsOnlyId = 'a2222222-1111-4444-8888-222222222222';
  await prod.handleAuthSessionChange({ id: userA2_PrefsOnlyId, email: 'user_a2@exo.edu', name: 'User A2 Prefs Only' }, false);
  assert(
    prod.localStorage.getItem(prod.getAccountBackupStorageKey(userA2_PrefsOnlyId)) === null,
    'T-M1-C01h (Test B Prep): User A2 starts with no existing pharmaAccountWorkspace_A2 snapshot'
  );
  // Give User A2 ONLY non-default plannerPrefs and completedAcademyModules (empty subjects, events, logs, default pdfFitMode)
  prod.setWorkspaceState({
    plannerPrefs: { weekStartDay: 2, dayStartHour: 5, dayEndHour: 21, autoCompletePct: 85, currentWeekStartIso: '2026-10-27' },
    completedAcademyModules: ['mod_only_1', 'mod_only_2']
  });
  // Switch directly from User A2 to User B1 without calling handleCloudSignOut()
  await prod.handleAuthSessionChange({ id: userB1_EmptyId, email: 'user_b1_empty@exo.edu', name: 'User B1 Empty' }, true);
  const snapA2 = JSON.parse(prod.localStorage.getItem(prod.getAccountBackupStorageKey(userA2_PrefsOnlyId)) || 'null');
  assert(
    snapA2 !== null &&
    snapA2.user_id === userA2_PrefsOnlyId &&
    snapA2.schedule &&
    snapA2.schedule.plannerPrefs &&
    snapA2.schedule.plannerPrefs.weekStartDay === 2 &&
    snapA2.schedule.plannerPrefs.dayStartHour === 5 &&
    snapA2.schedule.plannerPrefs.dayEndHour === 21 &&
    snapA2.schedule.plannerPrefs.autoCompletePct === 85 &&
    Array.isArray(snapA2.academy_progress) &&
    snapA2.academy_progress.length === 2 &&
    snapA2.academy_progress[0] === 'mod_only_1',
    'T-M1-C01i (Test B): Outgoing user with no prior snapshot and only non-default plannerPrefs + completedAcademyModules has snapshot created on direct switch'
  );

  // ==========================================================================
  // TEST C (Part 2): Foreign Drive Metadata Rejection & Configured User B2 Restoration
  // ==========================================================================
  // Return to User A and verify all refreshed data + verified annotations restore cleanly
  await prod.handleAuthSessionChange({ id: userA_Id, email: 'user_a@exo.edu', name: 'User A' }, true);
  assert(
    prod.getWorkspaceState().currentUserCanUploadMedia === true &&
    prod.getWorkspaceState().currentPdfFitMode === 'width' &&
    prod.getWorkspaceState().plannerPrefs.weekStartDay === 1 &&
    prod.getWorkspaceState().subjects.length === 1 &&
    prod.getWorkspaceState().subjects[0].id === 'sub_direct_a_fresh' &&
    prod.localStorage.getItem('exo_gdrive_user_email') === 'user_a_fresh_drive@gmail.com' &&
    prod.localStorage.getItem('exo_gdrive_folder_id') === 'folder_A_fresh_777',
    'T-M1-C01j (Test A/C Verify): Returning to User A restores refreshed snapshot and refreshed Drive metadata'
  );

  // Plant foreign-bound Drive metadata in global localStorage while User A is active to verify User A vault ignores foreign metadata
  prod.localStorage.setItem('exo_gdrive_connected', '1');
  prod.localStorage.setItem('exo_gdrive_user_email', 'foreign_intruder@gmail.com');
  prod.localStorage.setItem('exo_gdrive_folder_id', 'foreign_folder_666');
  prod.localStorage.setItem('exo_gdrive_bound_user_id', 'foreign-uid-9999');
  prod.setWorkspaceState({
    googleAccessToken: 'ya29.foreign_or_live_token_must_not_leak',
    googleTokenExpiry: futureExpA
  });

  // Seed User B2's saved workspace and Drive configuration (omitting quotaInfo on B2 to prove A's quotaInfo is never mixed in)
  const userB2_ConfigId = 'b2222222-0000-4444-8888-222222222222';
  prod.localStorage.setItem('pharmaGdriveSync_' + userB2_ConfigId, JSON.stringify({
    linked: true,
    userEmail: 'user_b2_drive@gmail.com',
    folderId: 'folder_B2_drive_999'
  }));
  prod.localStorage.setItem(prod.getAccountBackupStorageKey(userB2_ConfigId), JSON.stringify({
    user_id: userB2_ConfigId,
    can_upload_media: true,
    subjects: [{ id: 'sub_direct_b2', name: 'Pharmacokinetics B2', groups: [] }],
    schedule: {
      version: 3,
      events: [{ id: 'ev_direct_b2', title: 'PK Seminar B2', day: 0, startHour: 11, duration: 2 }],
      backlog: [{ id: 'bl_direct_b2', title: 'Backlog B2' }],
      plannerPrefs: { weekStartDay: 0, dayStartHour: 5, dayEndHour: 21, autoCompletePct: 85, currentWeekStartIso: '2026-10-25' },
      weeklyReports: [{ id: 'rep_direct_b2', weekStartIso: '2026-10-25', score: 96 }],
      pdfFitMode: 'custom',
      cloudMediaRegistry: { 'lec_direct_b2': { pdfUploaded: true, ownerUid: userB2_ConfigId } },
      gdriveSync: {
        linked: true,
        userEmail: 'user_b2_drive@gmail.com',
        folderId: 'folder_B2_drive_999'
      }
    },
    logs: [{ id: 'log_direct_b2', text: 'B2 Log', timestamp: 1700002000 }],
    academy_progress: ['mod_b2_1', 'mod_b2_2', 'mod_b2_3'],
    annotations: {}
  }));

  // Direct switch from User A to User B2 without calling handleCloudSignOut()
  await prod.handleAuthSessionChange({ id: userB2_ConfigId, email: 'user_b2@exo.edu', name: 'User B2 Configured' }, true);
  const stateB2 = prod.getWorkspaceState();
  const gdriveVaultAAfterForeignAttempt = JSON.parse(prod.localStorage.getItem('pharmaGdriveSync_' + userA_Id) || 'null');
  const snapAAfterForeignAttempt = JSON.parse(prod.localStorage.getItem(prod.getAccountBackupStorageKey(userA_Id)) || 'null');
  assert(
    gdriveVaultAAfterForeignAttempt.userEmail === 'user_a_fresh_drive@gmail.com' &&
    snapAAfterForeignAttempt.schedule.gdriveSync.userEmail === 'user_a_fresh_drive@gmail.com',
    'T-M1-C01k (Test C): Foreign-bound exo_gdrive_* metadata is never written into outgoing User A Drive vault or workspace snapshot'
  );
  assert(
    stateB2.plannerPrefs.weekStartDay === 0 &&
    stateB2.plannerPrefs.dayStartHour === 5 &&
    stateB2.plannerPrefs.dayEndHour === 21 &&
    stateB2.plannerPrefs.autoCompletePct === 85 &&
    stateB2.currentPdfFitMode === 'custom' &&
    prod.localStorage.getItem('pharmaPdfFitMode') === 'custom',
    'T-M1-C01l (Test C): Direct switch to configured User B2 restores B2 plannerPrefs and PDF fit mode ("custom")'
  );
  assert(
    prod.localStorage.getItem('exo_gdrive_connected') === '1' &&
    prod.localStorage.getItem('exo_gdrive_user_email') === 'user_b2_drive@gmail.com' &&
    prod.localStorage.getItem('exo_gdrive_folder_id') === 'folder_B2_drive_999' &&
    prod.localStorage.getItem('exo_gdrive_bound_user_id') === userB2_ConfigId &&
    prod.localStorage.getItem('exo_gdrive_quota_info') === null &&
    stateB2.googleAccessToken === null &&
    prod.localStorage.getItem('exo_gdrive_token') === null &&
    prod.isGoogleDriveAccountLinked() === true &&
    prod.isGoogleDriveConnected() === true,
    'T-M1-C01m (Test C): User B2 Drive metadata is restored with zero User A metadata (quotaInfo/token) mixed in'
  );
  assert(
    stateB2.currentUserCanUploadMedia === true &&
    stateB2.subjects.length === 1 && stateB2.subjects[0].id === 'sub_direct_b2' &&
    stateB2.cloudMediaRegistry['lec_direct_b2'] !== undefined &&
    stateB2.cloudMediaRegistry['lec_direct_a_fresh'] === undefined,
    'T-M1-C01n (Test C): User B2 receives its own VIP entitlement, subjects, and cloud media registry with zero User A records'
  );

  // ==========================================================================
  // TEST D: Failure Paths During Direct Account Switch
  //   (1) IndexedDB annotation read failure
  //   (2) Account snapshot localStorage write failure
  // ==========================================================================
  await prod.handleAuthSessionChange({ id: userA_Id, email: 'user_a@exo.edu', name: 'User A' }, true);
  prod.setWorkspaceState({
    subjects: [
      { id: 'sub_direct_a_fresh', name: 'Fresh Medicinal Chemistry A', groups: [] },
      { id: 'sub_unsaved_d', name: 'Unsaved Subject Before Failure D', groups: [] }
    ],
    dirty: true
  });

  // D.1: Simulate IndexedDB annotation read failure during direct A -> B1 switch
  idb.failNextTransaction = true;
  const failReadSwitchRes = await prod.handleAuthSessionChange({ id: userB1_EmptyId, email: 'user_b1_empty@exo.edu', name: 'User B1 Empty' }, true);
  const snapAAfterReadFail = JSON.parse(prod.localStorage.getItem(prod.getAccountBackupStorageKey(userA_Id)) || 'null');
  assert(
    failReadSwitchRes &&
    failReadSwitchRes.ok === false &&
    failReadSwitchRes.reason === 'outgoing_annotations_read_failed' &&
    failReadSwitchRes.isDirty === true,
    'T-M1-C01o (Test D.1): Direct switch aborts with { ok: false, reason: "outgoing_annotations_read_failed" } when IndexedDB annotation read fails'
  );
  assert(
    prod.getWorkspaceState().currentCloudUser.id === userA_Id &&
    prod.getWorkspaceState().subjects.length === 2 &&
    prod.localStorage.getItem('pharmaWorkspaceDirty') === '1' &&
    prod.localStorage.getItem('pharmaWorkspaceDirty_' + userA_Id) === '1' &&
    snapAAfterReadFail &&
    snapAAfterReadFail.annotations &&
    snapAAfterReadFail.annotations[sharedLectureId] !== undefined,
    'T-M1-C01p (Test D.1): On IDB annotation read failure, outgoing dirty workspace is NOT reset, currentCloudUser stays User A, and existing snapshot annotations are NOT overwritten with {}'
  );

  // D.2: Simulate Account Snapshot Write Failure (QuotaExceededError) during direct A -> B1 switch
  prod.setFailNextAccountSnapshotWrite(true);
  const failWriteSwitchRes = await prod.handleAuthSessionChange({ id: userB1_EmptyId, email: 'user_b1_empty@exo.edu', name: 'User B1 Empty' }, true);
  assert(
    failWriteSwitchRes &&
    failWriteSwitchRes.ok === false &&
    failWriteSwitchRes.reason === 'outgoing_account_snapshot_write_failed' &&
    failWriteSwitchRes.isDirty === true &&
    prod.getWorkspaceState().currentCloudUser.id === userA_Id &&
    prod.getWorkspaceState().subjects.length === 2 &&
    prod.localStorage.getItem('pharmaWorkspaceDirty') === '1' &&
    prod.localStorage.getItem('pharmaWorkspaceDirty_' + userA_Id) === '1',
    'T-M1-C01q (Test D.2): On account snapshot write failure, direct switch aborts without wiping User A in-memory/global workspace or dirty flags'
  );

  // D.3: Once failure conditions clear, retrying the direct switch to User B1 succeeds and preserves all of User A's unsaved changes + annotations
  const retrySwitchRes = await prod.handleAuthSessionChange({ id: userB1_EmptyId, email: 'user_b1_empty@exo.edu', name: 'User B1 Empty' }, true);
  const snapAAfterRetry = JSON.parse(prod.localStorage.getItem(prod.getAccountBackupStorageKey(userA_Id)) || 'null');
  assert(
    retrySwitchRes &&
    retrySwitchRes.ok !== false &&
    prod.getWorkspaceState().currentCloudUser.id === userB1_EmptyId &&
    prod.getWorkspaceState().subjects.length === 0 &&
    snapAAfterRetry &&
    snapAAfterRetry.subjects.length === 2 &&
    snapAAfterRetry.subjects[1].id === 'sub_unsaved_d' &&
    snapAAfterRetry.annotations &&
    snapAAfterRetry.annotations[sharedLectureId] !== undefined &&
    snapAAfterRetry.dirty === true,
    'T-M1-C01r (Test D.3): Retrying the switch after failure clears succeeds, refreshes pharmaAccountWorkspace_A with both subjects and verified annotations, and isolates User B1'
  );

  // ==========================================================================
  // SCENARIO 8 (Phase 5.1.2 Step 4): Regression Verification for Real
  // normalizeTombstonesObject() & getLocalTombstones() Dependency Chain
  // ==========================================================================
  console.log('\n--- SCENARIO 8: Real normalizeTombstonesObject() & getLocalTombstones() Normalization ---');
  const normTestUid = 'user-tombstone-norm-verify';
  prod.localStorage.setItem('pharmaTombstones_' + normTestUid, JSON.stringify({
    subjects: ['sub_legacy_arr_1', 'sub_legacy_arr_2'],
    lectures: {
      lec_bool_1: true,
      lec_num_2: 1700000123,
      lec_false_ignored: false
    },
    events: 'not_an_object_or_array',
    logs: null
  }));
  const normalizedStones = prod.getLocalTombstones(normTestUid);
  const directNormalized = prod.normalizeTombstonesObject({
    subjects: ['sub_legacy_arr_1', 'sub_legacy_arr_2'],
    lectures: { lec_bool_1: true, lec_num_2: 1700000123, lec_false_ignored: false },
    events: 'not_an_object_or_array',
    logs: null
  }, normTestUid);
  const idempotentReNormalized = prod.normalizeTombstonesObject(normalizedStones, normTestUid);
  assert(
    normalizedStones &&
    prod.CAUSAL_TOMBSTONE_ENTITY_TYPES.every(t => normalizedStones[t] && typeof normalizedStones[t] === 'object' && !Array.isArray(normalizedStones[t])) &&
    normalizedStones.subjects['sub_legacy_arr_1'] &&
    normalizedStones.subjects['sub_legacy_arr_1'].scopeId === 'entity:subjects:sub_legacy_arr_1' &&
    normalizedStones.subjects['sub_legacy_arr_1'].kind === 'delete' &&
    normalizedStones.subjects['sub_legacy_arr_2'] &&
    normalizedStones.lectures['lec_bool_1'] &&
    normalizedStones.lectures['lec_bool_1'].scopeId === 'entity:lectures:lec_bool_1' &&
    normalizedStones.lectures['lec_num_2'] &&
    normalizedStones.lectures['lec_num_2'].legacyOpaque === true &&
    normalizedStones.lectures['lec_false_ignored'] === undefined &&
    Object.keys(normalizedStones.events).length === 0 &&
    directNormalized.subjects['sub_legacy_arr_1'].scopeId === normalizedStones.subjects['sub_legacy_arr_1'].scopeId &&
    directNormalized.lectures['lec_num_2'].legacyOpaque === true &&
    JSON.stringify(normalizedStones) === JSON.stringify(idempotentReNormalized),
    'T-5.1.2-CI-01: getLocalTombstones() and normalizeTombstonesObject() exercise real source normalization across legacy arrays, boolean/timestamp maps, and malformed buckets'
  );

  console.log('\n======================================================================');
  console.log(`TOTAL PHASE 4.1 ISOLATION TESTS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('======================================================================\n');

  if (testsFailed > 0) process.exit(1);
  else process.exit(0);
}

main().catch(err => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
