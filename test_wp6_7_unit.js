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

  const tasksFn = indexHtml.match(/function renderTasksView\(\)\s*\{[\s\S]*?\n        \}/);
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

test('WP 6.7: Dedicated Google Drive Hub modal separates Drive from Account while preventing duplicate IDs', () => {
  assert.ok(indexHtml.includes('id="sidebarGdriveBtn"'), 'Sidebar must include #sidebarGdriveBtn');
  assert.ok(indexHtml.includes('onclick="openGoogleDriveHubModal()"'), 'Sidebar Drive button must open #driveHubModalOverlay');
  assert.ok(indexHtml.includes('id="driveHubModalOverlay"'), 'Dedicated #driveHubModalOverlay must exist');
  assert.ok(indexHtml.includes("'driveHubModalOverlay'"), 'Modal a11y dialogIds must include driveHubModalOverlay');
  assert.ok(indexHtml.includes('function mountGdriveCardHost('), 'Single-instance host mover mountGdriveCardHost must exist');
  assert.ok(indexHtml.includes('function switchCloudHubSection('), 'Cloud account modal tab switcher switchCloudHubSection must exist');
  // Ensure #cloudGdriveSyncCard appears only once in HTML (no duplicate IDs)
  const matches = indexHtml.match(/id="cloudGdriveSyncCard"/g) || [];
  assert.equal(matches.length, 1, 'There must be exactly one #cloudGdriveSyncCard instance in DOM');
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
  assert.ok(indexHtml.includes('function renderAcademyLocalizedBodies(isEn)'), 'renderAcademyLocalizedBodies must exist');
  const applyLangMatch = indexHtml.match(/function applyExoLanguage\([\s\S]*?\n        \}/);
  assert.ok(applyLangMatch && applyLangMatch[0].includes('updateWp65StaticLabels(targetLang)'), 'applyExoLanguage must invoke static label updaters');
  const wp65Match = indexHtml.match(/function updateWp65StaticLabels\(targetLang\)\s*\{[\s\S]*?\n        \}/);
  assert.ok(wp65Match && wp65Match[0].includes('updateWp67BilingualStaticUI(targetLang)'), 'updateWp65StaticLabels must invoke updateWp67BilingualStaticUI');
});
