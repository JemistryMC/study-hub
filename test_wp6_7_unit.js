// ============================================================================
// Exo Personal Study Journal — Phase 6 / WP 6.7 Handcrafted Rebuild Unit Tests
// Covers WP 6.7 invariants using node:test:
//   1. Global Fullscreen button removed from desktop sidebar & mobile header
//   2. Embedded Chapter Studio mount (#cwEmbeddedStudioMount), mountPdfStudioInWorkspace,
//      closePdfViewer synchronous unmount & fullscreen reset
//   3. Consolidated audio helper attachAudioRecordingFileToLecture shared cleanly
//   4. Planner HTML escaping (escapeHtml) in Single Card, Week Grid, Today Modes A/B, Tasks
//   5. Tracker asymmetric overview preserves all core KPI DOM IDs & #trackerJournalMarginNote
//   6. Sidebar #sidebarGdriveBtn -> #driveHubModalOverlay + mountGdriveCardHost('cloud' | 'drive')
//   7. GEMINI.md §6 Free/VIP policy truth in #vipMediaLockModalOverlay & #acadPane_6
//   8. Bilingual updater updateWp67BilingualStaticUI covers Auth, Drive, VIP, Help, Planner, Tracker
// ============================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('WP 6.7: Global Fullscreen buttons are removed from sidebar & mobile navbar', () => {
  assert.ok(!indexHtml.includes('id="sidebarFullscreenBtn"'), 'Desktop sidebar must not contain #sidebarFullscreenBtn');
  assert.ok(!indexHtml.includes('id="appGlobalFullscreenBtn"'), 'Mobile navbar must not contain #appGlobalFullscreenBtn');
  assert.ok(indexHtml.includes('id="pdfFullscreenBtn"'), 'PDF Studio internal fullscreen toggle must remain present');
});

test('WP 6.7: Chapter Workspace embeds PDF Studio inline and closePdfViewer unmounts synchronously', () => {
  assert.ok(indexHtml.includes('id="cwEmbeddedStudioMount"'), 'Chapter Workspace must include #cwEmbeddedStudioMount');
  assert.ok(indexHtml.includes('function mountPdfStudioInWorkspace('), 'mountPdfStudioInWorkspace helper must exist');
  assert.ok(indexHtml.includes('.exo-studio-embedded'), 'Embedded studio CSS class must exist');

  const closeMatch = indexHtml.match(/function closePdfViewer\(\)\s*\{[\s\S]*?\n        \}/);
  assert.ok(closeMatch, 'closePdfViewer must exist');
  const closeBody = closeMatch[0];
  assert.ok(closeBody.includes("classList.remove('active', 'exo-studio-embedded', 'is-fullscreen')"), 'closePdfViewer must clear active/embedded/fullscreen classes synchronously');
  assert.ok(closeBody.includes('document.body.appendChild(pdfOverlayEl)'), 'closePdfViewer must return #pdfViewerModalOverlay back to document.body');
  assert.ok(closeBody.includes("cwStudioMount.style.display = 'none'"), 'closePdfViewer must hide #cwEmbeddedStudioMount');
  const activePos = closeBody.indexOf('pdfOverlayEl.classList.remove');
  const flushPos = closeBody.indexOf('flushPendingAnnotationsSave');
  assert.ok(activePos > 0 && flushPos > activePos, 'closePdfViewer must remove active state BEFORE flushPendingAnnotationsSave');
});

test('WP 6.7: Audio attachment logic is consolidated into attachAudioRecordingFileToLecture', () => {
  assert.ok(indexHtml.includes('async function attachAudioRecordingFileToLecture('), 'Shared attachAudioRecordingFileToLecture must exist');
  const cwFlow = indexHtml.match(/function cwAddAudioRecordingFlow\([\s\S]*?\n        \}/);
  const studioFlow = indexHtml.match(/function addRecordingToCurrentLecture\([\s\S]*?\n        \}/);
  assert.ok(cwFlow && cwFlow[0].includes('attachAudioRecordingFileToLecture'), 'Chapter Workspace audio flow must delegate to shared helper');
  assert.ok(studioFlow && studioFlow[0].includes('attachAudioRecordingFileToLecture'), 'Studio audio flow must delegate to shared helper');
});

test('WP 6.7: Planner cards, Week grid, Today timeline & Weekly Goals escape user strings with escapeHtml', () => {
  const singleCardFn = indexHtml.match(/function renderSingleFluidSessionCardHtml\([\s\S]*?\n        \}/);
  assert.ok(singleCardFn, 'renderSingleFluidSessionCardHtml must exist');
  assert.ok(!singleCardFn[0].includes('${ev.title}'), 'renderSingleFluidSessionCardHtml must not interpolate raw ev.title');
  assert.ok(!singleCardFn[0].includes('${subjectName}'), 'renderSingleFluidSessionCardHtml must not interpolate raw subjectName');
  assert.ok(!singleCardFn[0].includes('${ev.notes}'), 'renderSingleFluidSessionCardHtml must not interpolate raw ev.notes');
  assert.ok(singleCardFn[0].includes('${safeTitle}'), 'renderSingleFluidSessionCardHtml must render escaped safeTitle');
  assert.ok(singleCardFn[0].includes('${escapeHtml(subjectName)}'), 'renderSingleFluidSessionCardHtml must escape subjectName');
  assert.ok(singleCardFn[0].includes('${escapeHtml(ev.notes)}'), 'renderSingleFluidSessionCardHtml must escape ev.notes');

  const weekGridFn = indexHtml.match(/function renderWeekGrid\(\)\s*\{[\s\S]*?\n        \}/);
  assert.ok(weekGridFn, 'renderWeekGrid must exist');
  assert.ok(!weekGridFn[0].includes('${ev.title}'), 'renderWeekGrid must not interpolate raw ev.title');
  assert.ok(!weekGridFn[0].includes('${subName}'), 'renderWeekGrid must not interpolate raw subName');

  const todayFn = indexHtml.match(/function renderTodayView\([\s\S]*?\n        \}/);
  assert.ok(todayFn, 'renderTodayView must exist');
  assert.ok(!todayFn[0].includes('${ev.title}'), 'renderTodayView must not interpolate raw ev.title');
  assert.ok(!todayFn[0].includes('${subName}'), 'renderTodayView must not interpolate raw subName');
  assert.ok(!todayFn[0].includes('${ev.notes}'), 'renderTodayView must not interpolate raw ev.notes');

  const tasksFn = indexHtml.match(/function renderTasksView\([^)]*\)\s*\{[\s\S]*?\n        \}/);
  assert.ok(tasksFn, 'renderTasksView must exist');
  assert.ok(!tasksFn[0].includes('${item.title}'), 'renderTasksView must not interpolate raw item.title');
  assert.ok(!tasksFn[0].includes('${ev.title}'), 'renderTasksView must not interpolate raw ev.title');
});

test('WP 6.7: Tracker asymmetric Living Journal overview preserves all required KPI DOM IDs', () => {
  const requiredIds = [
    'weekAdherenceRate',
    'statEfficiencyLabel',
    'statDoneHours',
    'statPlannedHours',
    'weekProgressBar',
    'weekRemainingStudyTxt',
    'trackerJournalMarginNote',
    'statStreak',
    'statStreakMsg',
    'statGoalsCompletedRatio',
    'statGoalsLinkedBadge',
    'statGoalsTimeSub'
  ];
  for (const id of requiredIds) {
    assert.ok(indexHtml.includes(`id="${id}"`), `Tracker must preserve #${id}`);
  }
  assert.ok(indexHtml.includes('exo-tracker-journal-overview'), 'Tracker must render asymmetric .exo-tracker-journal-overview');
});

test('WP 6.7: Dedicated Google Drive Hub modal is Single Source of Truth with Account modal link', () => {
  assert.ok(indexHtml.includes('id="sidebarGdriveBtn"'), 'Sidebar must include #sidebarGdriveBtn');
  assert.ok(indexHtml.includes('onclick="openGoogleDriveHubModal()"'), 'Sidebar Drive button must open #driveHubModalOverlay');
  assert.ok(indexHtml.includes('id="driveHubModalOverlay"'), 'Dedicated #driveHubModalOverlay must exist');
  assert.ok(indexHtml.includes("'driveHubModalOverlay'"), 'Modal a11y dialogIds must include driveHubModalOverlay');
  assert.ok(indexHtml.includes('function ensureDriveCardMountedInHub('), 'Single-hub guard ensureDriveCardMountedInHub must exist');
  assert.ok(indexHtml.includes('id="cloudAccountDriveSummaryBox"'), 'Account modal must show compact #cloudAccountDriveSummaryBox');
  assert.ok(indexHtml.includes('id="btnAccountManageGoogleDrive"'), 'Account modal must provide #btnAccountManageGoogleDrive button');
  assert.ok(!indexHtml.includes('id="cloudTabDriveBtn"'), 'Account modal must NOT duplicate Google Drive tab (#cloudTabDriveBtn)');
  assert.ok(!indexHtml.includes('id="cloudAuthDriveMount"'), 'Account modal must NOT contain duplicate #cloudAuthDriveMount');
  // Ensure #cloudGdriveSyncCard appears only once in HTML and lives inside #driveHubModalMount
  const matches = indexHtml.match(/id="cloudGdriveSyncCard"/g) || [];
  assert.equal(matches.length, 1, 'There must be exactly one #cloudGdriveSyncCard instance in DOM');
  const driveOverlayStart = indexHtml.indexOf('id="driveHubModalOverlay"');
  const cardPos = indexHtml.indexOf('id="cloudGdriveSyncCard"');
  assert.ok(driveOverlayStart > 0 && cardPos > driveOverlayStart, '#cloudGdriveSyncCard must reside permanently inside #driveHubModalOverlay');
});

test('WP 6.7: VIP modal and Help Center comply truthfully with GEMINI.md Section 6 Free vs VIP policy', () => {
  const vipModalMatch = indexHtml.match(/id="vipMediaLockModalOverlay"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*(?=\n\s*<!-- Single Input Modal -->)/);
  assert.ok(vipModalMatch, 'VIP modal block must exist');
  const vipHtml = vipModalMatch[0];
  assert.ok(!vipHtml.includes('تصدير PDF مع كتاباتك غير متاح بدون VIP'), 'VIP modal must not claim Annotated PDF Export requires VIP');
  assert.ok(!vipHtml.includes('أوراق التلخيص مقفلة'), 'VIP modal must not claim Extra Note Sheets are locked behind VIP');
  assert.ok(vipHtml.includes('تصدير PDF المشروح'), 'VIP modal must explicitly clarify Annotated PDF Export is free');

  const syncPolicyMatch = indexHtml.match(/function syncExtraNoteButtonsLockUI\(\)\s*\{[\s\S]*?\n        \}/);
  assert.ok(syncPolicyMatch && syncPolicyMatch[0].includes('GEMINI.md Section 6'), 'Extra note & export buttons must remain unlocked per GEMINI.md Section 6');
});

test('WP 6.7: updateWp67BilingualStaticUI handles Auth, Drive, VIP, Help, Planner & Tracker cleanly', () => {
  assert.ok(indexHtml.includes('function updateWp67BilingualStaticUI(targetLang)'), 'updateWp67BilingualStaticUI must exist');
  assert.ok(indexHtml.includes('function renderExoHelpCenter('), 'renderExoHelpCenter must exist');
  const applyLangMatch = indexHtml.match(/function applyExoLanguage\([\s\S]*?\n        \}/);
  assert.ok(applyLangMatch && applyLangMatch[0].includes('updateWp65StaticLabels(targetLang)'), 'applyExoLanguage must invoke static label updaters');
  const wp65Match = indexHtml.match(/function updateWp65StaticLabels\(targetLang\)\s*\{[\s\S]*?\n        \}/);
  assert.ok(wp65Match && wp65Match[0].includes('updateWp67BilingualStaticUI(targetLang)'), 'updateWp65StaticLabels must invoke updateWp67BilingualStaticUI');
});

test('WP 6.7 Step B: Per-domain LS quota tracking prevents tiny domain saves from resetting quota toast suppression', () => {
  assert.ok(indexHtml.includes('lsQuotaFailedDomains: new Set()'), 'exoRuntimeStatusState must track per-domain quota failures');
  assert.ok(indexHtml.includes('lsQuotaNotifiedEpisode: false'), 'exoRuntimeStatusState must track single-episode quota notification');
  const subFn = indexHtml.match(/function saveSubjects\(\)\s*\{[\s\S]*?\n        \}/)?.[0] || '';
  const schFn = indexHtml.match(/function saveScheduleData\([^)]*\)\s*\{[\s\S]*?\n        \}/)?.[0] || '';
  const logFn = indexHtml.match(/function saveLogs\(\)\s*\{[\s\S]*?\n        \}/)?.[0] || '';
  for (const [label, fnBody] of [['saveSubjects', subFn], ['saveScheduleData', schFn], ['saveLogs', logFn]]) {
    assert.ok(fnBody.includes('dbReadyPromise'), `${label} must treat in-flight dbReadyPromise as active IDB fallback`);
    assert.ok(fnBody.includes('lsQuotaFailedDomains.add('), `${label} must add only its own domain to lsQuotaFailedDomains`);
    assert.ok(fnBody.includes('lsQuotaFailedDomains.delete('), `${label} must delete only its own domain on LS success`);
    assert.ok(fnBody.includes('exoReclaimSafeLocalStorageSpace'), `${label} must invoke exoReclaimSafeLocalStorageSpace on quota fallback`);
  }
});

test('WP 6.7 Step B: cloudMediaRegistry deduplicates entries with __ref pointers and batches bulk snapshots', () => {
  assert.ok(indexHtml.includes('function resolveCloudMediaRegistryEntry('), 'resolveCloudMediaRegistryEntry helper must exist');
  assert.ok(indexHtml.includes('function compactCloudMediaRegistry('), 'compactCloudMediaRegistry helper must exist');
  const recFn = indexHtml.match(/function recordUploadedMediaInRegistry\([\s\S]*?\n        \}/)?.[0] || '';
  const snapFn = indexHtml.match(/function snapshotCurrentSubjectsMediaToRegistry\([\s\S]*?\n        \}/)?.[0] || '';
  const healFn = indexHtml.match(/function healSubjectsFromCloudRegistry\([\s\S]*?\n        \}/)?.[0] || '';
  assert.ok(recFn.includes('{ __ref: idKey }'), 'recordUploadedMediaInRegistry must store compact __ref pointers for secondary keys');
  assert.ok(recFn.includes('opts.skipSave'), 'recordUploadedMediaInRegistry must support skipSave batching');
  assert.ok(snapFn.includes('skipSave: true') && snapFn.includes('if (registryChanged)'), 'snapshotCurrentSubjectsMediaToRegistry must batch saves');
  assert.ok(healFn.includes('skipSave: true') && healFn.includes('if (registryChanged)'), 'healSubjectsFromCloudRegistry must batch saves');
});

test('WP 6.7 Step B: pointer fast-path compacts embedded _conflictRecovery and reclamation scans all raw recovery keys', () => {
  const migFn = indexHtml.match(/async function _runMigrateConflictRecoveryToIDB\([\s\S]*?\n        \}/)?.[0] || '';
  assert.ok(migFn.includes('embeddedSnapArray || embeddedSchedArray'), 'Pointer fast-path must detect embedded _conflictRecovery');
  assert.ok(migFn.includes('compactAccountAndScheduleConflictRecoveryInLS(targetUid)'), 'Pointer fast-path must compact embedded _conflictRecovery');
  const reclaimFn = indexHtml.match(/function exoReclaimSafeLocalStorageSpace\([\s\S]*?\n        \}/)?.[0] || '';
  assert.ok(reclaimFn.includes("k.startsWith('pharmaConflictRecovery_')"), 'exoReclaimSafeLocalStorageSpace must scan oversized raw pharmaConflictRecovery_* keys');
});

test('WP 6.7 Steps C-D: Inline SVG symbol library, toast position away from clock, and Studio cleanups', () => {
  const requiredIcons = [
    'exo-ico-book', 'exo-ico-layers', 'exo-ico-calendar', 'exo-ico-chart',
    'exo-ico-drive', 'exo-ico-globe', 'exo-ico-help', 'exo-ico-cloud',
    'exo-ico-pen', 'exo-ico-highlighter', 'exo-ico-eraser', 'exo-ico-text',
    'exo-ico-laser', 'exo-ico-undo', 'exo-ico-eye', 'exo-ico-eye-slash',
    'exo-ico-note', 'exo-ico-search', 'exo-ico-audio', 'exo-ico-expand', 'exo-ico-compress'
  ];
  for (const ico of requiredIcons) {
    assert.ok(indexHtml.includes(`id="${ico}"`), `SVG <symbol id="${ico}"> must exist for offline icons`);
  }
  assert.ok(indexHtml.includes('.toast-container'), 'Toast container CSS must exist');
  const toastCssMatch = indexHtml.match(/\.toast-container\s*\{[^}]*\}/);
  assert.ok(toastCssMatch && toastCssMatch[0].includes('inset-inline-end:') && toastCssMatch[0].includes('bottom:'), 'Desktop .toast-container must sit at bottom-end away from sidebar clock');

  const recSelFn = indexHtml.match(/function renderLectureRecordingsSelector\([\s\S]*?\n        \}/)?.[0] || '';
  assert.ok(recSelFn && !recSelFn.includes('__add_new__'), 'renderLectureRecordingsSelector must not duplicate + Add Audio with __add_new__ option');

  const toggleAnnoFn = indexHtml.match(/function toggleAnnotationsVisibility\(\)\s*\{[\s\S]*?\n        \}/)?.[0] || '';
  assert.ok(toggleAnnoFn.includes('#exo-ico-eye') && toggleAnnoFn.includes('#exo-ico-eye-slash'), 'toggleAnnotationsVisibility must update SVG <use> href cleanly');
  assert.ok(toggleAnnoFn.includes("icon.className = 'fa-solid fa-eye'"), 'toggleAnnotationsVisibility must keep mock fallback compatibility');

  assert.ok(indexHtml.includes('function renderExtraNoteHeaderHTML('), 'renderExtraNoteHeaderHTML helper must exist');
});

test('WP 6.7 Steps E-F: TASK_TYPE_ARCHITECTURE hintEn, Goal Linker escaping, Help search & no Help fullscreen', () => {
  const archMatch = indexHtml.match(/const TASK_TYPE_ARCHITECTURE = \{[\s\S]*?\};\s*\n\s*function getTaskTypeMeta[\s\S]*?\n        \}/);
  assert.ok(archMatch, 'TASK_TYPE_ARCHITECTURE and getTaskTypeMeta must exist');
  const runner = new Function('exoGetLang', `${archMatch[0]}; return { getTaskTypeMeta };`);
  const enMeta = runner(() => 'en').getTaskTypeMeta('important');
  const arMeta = runner(() => 'ar').getTaskTypeMeta('important');
  assert.ok(enMeta.label === 'Study & Notes' && !/[\u0600-\u06FF]/.test(enMeta.hint), 'EN getTaskTypeMeta must return English hint without Arabic');
  assert.ok(/[\u0600-\u06FF]/.test(arMeta.hint), 'AR getTaskTypeMeta must preserve Arabic hint');

  const linkerFn = indexHtml.match(/function renderGoalTaskLinkerModalContent\(\)\s*\{[\s\S]*?\n        \}/)?.[0] || '';
  assert.ok(linkerFn.includes('escapeHtml(subName)') && linkerFn.includes('escapeHtml(goal.title'), 'renderGoalTaskLinkerModalContent must escape subName and goal.title');

  assert.ok(indexHtml.includes('id="helpCenterContent"'), 'Rebuilt Help Center must contain #helpCenterContent');
  assert.ok(indexHtml.includes('id="helpFooterCloseBtn"'), 'Rebuilt Help Center must contain #helpFooterCloseBtn');
  assert.ok(indexHtml.includes('id="helpSupportLink"'), 'Rebuilt Help Center must contain #helpSupportLink');
  assert.ok(indexHtml.includes('function buildExoHelpCenterModel('), 'buildExoHelpCenterModel helper must exist');
  assert.ok(!indexHtml.includes('id="helpSearchInput"'), 'Legacy Help search clutter must be removed');
  assert.ok(!indexHtml.includes('id="acadPane_1"'), 'Legacy 6-tab Academy panes must be removed');
  assert.ok(!indexHtml.includes('helpFullscreenBtn'), 'Help modal must not include a fullscreen button');
});


