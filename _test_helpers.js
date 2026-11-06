
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
let autoSaveTimer = null;
let isActivelyDrawingOnPdf = false;
let lastPenActivityTimeMs = 0;
function initScheduleData() {}
let mergedContinuousPdfMode = false;
function syncMergedAnnotationsToLectureRecords() {}
let dirtyAnnotationsForCloud = false;
let activeCloudSyncByAccount = new Map();
let activeCloudSyncPromise = null;
let isCloudSyncing = false;
let isBulkMediaUploading = false;
let cloudAutoSaveTimer = null;
let annotationMutationSeq = 0;
let lastUploadedAnnotationVersion = 0;
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
async function initPdfDB() { return dbInstance; }

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
${extractFunctionSource(indexHtmlContent, 'computeFullStringHash')}
${extractFunctionSource(indexHtmlContent, 'bumpAnnotationMutationVersion')}
${extractFunctionSource(indexHtmlContent, 'saveAnnotationsToDB')}
${extractFunctionSource(indexHtmlContent, 'getAnnotationsFromDB')}
${extractFunctionSource(indexHtmlContent, 'deepSanitizeBackupObject')}
${extractFunctionSource(indexHtmlContent, 'computePureSha256')}
${extractFunctionSource(indexHtmlContent, 'canonicalizeJson')}
${extractFunctionSource(indexHtmlContent, 'computeCanonicalSha256')}
${extractFunctionSource(indexHtmlContent, 'exportWorkspaceBackupV4')}
${extractFunctionSource(indexHtmlContent, 'inspectWorkspaceBackup')}
${extractFunctionSource(indexHtmlContent, 'cleanupBarrierOnPrepareFailure')}
${extractFunctionSource(indexHtmlContent, 'executeImportTransactionInternal')}
${extractFunctionSource(indexHtmlContent, 'importWorkspaceBackupV4')}
${extractFunctionSource(indexHtmlContent, 'rollbackImportFromJournal')}
${extractFunctionSource(indexHtmlContent, 'recoverPendingImportJournalIfNeeded')}
${extractFunctionSource(indexHtmlContent, 'sanitizeTechnicalErrorDetail')}
${extractFunctionSource(indexHtmlContent, 'classifySupabaseError')}
${extractFunctionSource(indexHtmlContent, 'migrateLegacyAccountAnnotationsToIDB')}
${extractFunctionSource(indexHtmlContent, 'getAllAnnotationsMapFromDB')}
${extractFunctionSource(indexHtmlContent, 'restoreAllAnnotationsMapToDB')}
${extractFunctionSource(indexHtmlContent, 'markLocalWorkspaceModified')}
${extractFunctionSource(indexHtmlContent, 'mergeAndApplyCloudConflict')}
${extractFunctionSource(indexHtmlContent, 'pushWorkspaceToCloud')}
${extractFunctionSource(indexHtmlContent, 'applyCloudWorkspacePayload')}
${extractFunctionSource(indexHtmlContent, 'flushPendingAnnotationsSave')}
${extractFunctionSource(indexHtmlContent, 'preserveUnverifiedGuestWorkspace')}
${extractFunctionSource(indexHtmlContent, 'restoreUnverifiedGuestWorkspace')}
${extractFunctionSource(indexHtmlContent, 'verifyLocalWorkspaceProvenance')}
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
    if (st.pendingAnnoSaveMap !== undefined) pendingAnnoSaveMap = st.pendingAnnoSaveMap;
    if (st.inMemoryAnnotationsCache !== undefined) inMemoryAnnotationsCache = st.inMemoryAnnotationsCache;
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
    dirtyAnnotationsForCloud,
    pendingAnnoSaveMap,
    inMemoryAnnotationsCache
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
  flushPendingAnnotationsSave,
  preserveUnverifiedGuestWorkspace,
  restoreUnverifiedGuestWorkspace,
  verifyLocalWorkspaceProvenance,
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
  computeStrokeUniqueSignature,
  computeFastStringSignature,
  computeFullStringHash,
  bumpAnnotationMutationVersion,
  saveAnnotationsToDB,
  getAnnotationsFromDB,
  deepSanitizeBackupObject,
  computePureSha256,
  canonicalizeJson,
  computeCanonicalSha256,
  exportWorkspaceBackupV4,
  inspectWorkspaceBackup,
  cleanupBarrierOnPrepareFailure,
  executeImportTransactionInternal,
  importWorkspaceBackupV4,
  rollbackImportFromJournal,
  recoverPendingImportJournalIfNeeded,
  sanitizeTechnicalErrorDetail,
  classifySupabaseError,
  migrateLegacyAccountAnnotationsToIDB,
  getAnnotationMutationSeq: () => annotationMutationSeq,
  resetAnnotationMutationSeq: () => { annotationMutationSeq = 0; lastUploadedAnnotationVersion = 0; localAnnotationsMutationSeq = 0; }
};
