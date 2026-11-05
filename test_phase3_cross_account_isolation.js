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

function showToast() {}
function renderSubjectsList() {}
function renderGroups() {}
function backToSubjects() { activeSubjectId = null; }
function renderSchedule() {}
function updateTracker() {}
function updateCloudMediaStatsUI() {}
function updateAcademyXpUI() {}
function updateCloudNavUI() {}
async function refreshLocalMediaCache() {}
async function reconcileCloudMediaWithStorageBucket() {}
async function flushPendingAnnotationsSave() { return Object.keys(pendingAnnoSaveMap).length === 0; }
async function handleAuthSessionChange(user) {
  currentCloudUser = user || null;
  bumpAccountSessionGeneration();
}

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
${extractFunctionSource(indexHtmlContent, 'computeFastStringSignature')}
${extractFunctionSource(indexHtmlContent, 'getAllAnnotationsMapFromDB')}
${extractFunctionSource(indexHtmlContent, 'restoreAllAnnotationsMapToDB')}
${extractFunctionSource(indexHtmlContent, 'handleCloudSignOut')}
${extractFunctionSource(indexHtmlContent, 'pushWorkspaceToCloud')}
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
    if (state.logs !== undefined) { logs = state.logs; localStorage.setItem('pharmaLogsV4', JSON.stringify(logs)); }
    if (state.completedAcademyModules !== undefined) { completedAcademyModules = state.completedAcademyModules; localStorage.setItem('pharmaAcademyProgressV1', JSON.stringify(completedAcademyModules)); }
    if (state.cloudMediaRegistry !== undefined) { cloudMediaRegistry = state.cloudMediaRegistry; saveCloudMediaRegistry(); }
    if (state.dirty) localStorage.setItem('pharmaWorkspaceDirty', '1');
  },
  getWorkspaceState: () => ({
    currentCloudUser,
    subjects,
    scheduleEvents,
    scheduleBacklog,
    weeklyReports,
    plannerPrefs,
    logs,
    completedAcademyModules,
    cloudMediaRegistry
  }),
  initScheduleData,
  handleCloudSignOut,
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
