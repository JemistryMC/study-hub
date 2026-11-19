// ============================================================================
// Exo Personal Study Journal — Phase 7 / WP 7.1 Unit Tests
// Tests pure WP 7.1 helpers extracted from index.html via node:test:
//   1. exoNormalizeHelpSearchText (Arabic diacritic & letter normalization)
//   2. exoExpandHelpSearchQuery (bilingual AR/EN synonym clusters)
//   3. buildHelpQuickActionsList (8 quick action pills in EN/AR)
//   4. buildActionableHelpCatalog (Sections A-G with EN zero-Arabic-leak check)
//   5. deriveHelpGettingStartedChecklist (live 7-step progress tracking)
//   6. deriveHelpTroubleshootingRecommendations (sorting, safety notes, no cache wipe)
//   8. deriveGoogleDriveDiagnosticsModel (all 9 Drive states, dual badges, redaction)
//   9. exoHasRealAnnotationContent (strict ink/text/extra-sheet truthiness)
//  10. deriveAcademyGuideMetrics (6 aligned help modules + closed-loop stations)
// ============================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extractFunctionSource(fnName) {
  const regex = new RegExp(`function\\s+${fnName}\\s*\\(`);
  const match = regex.exec(indexHtml);
  assert.ok(match, `Expected function ${fnName} in index.html`);
  const start = match.index;
  const endMarker = indexHtml.indexOf('\n        }', start);
  assert.ok(endMarker > start, `Expected closing brace for ${fnName}`);
  return indexHtml.slice(start, endMarker + '\n        }'.length);
}

const helpersFactory = new Function(`
  ${extractFunctionSource('exoNormalizeHelpSearchText')}
  ${extractFunctionSource('exoExpandHelpSearchQuery')}
  ${extractFunctionSource('buildHelpQuickActionsList')}
  ${extractFunctionSource('buildActionableHelpCatalog')}
  ${extractFunctionSource('deriveHelpGettingStartedChecklist')}
  ${extractFunctionSource('deriveHelpTroubleshootingRecommendations')}
  ${extractFunctionSource('exoComputeMobileViewportBudget')}
  ${extractFunctionSource('deriveGoogleDriveDiagnosticsModel')}
  ${extractFunctionSource('exoHasRealAnnotationContent')}
  ${extractFunctionSource('deriveAcademyGuideMetrics')}
  return {
    exoNormalizeHelpSearchText,
    exoExpandHelpSearchQuery,
    buildHelpQuickActionsList,
    buildActionableHelpCatalog,
    deriveHelpGettingStartedChecklist,
    deriveHelpTroubleshootingRecommendations,
    exoComputeMobileViewportBudget,
    deriveGoogleDriveDiagnosticsModel,
    exoHasRealAnnotationContent,
    deriveAcademyGuideMetrics
  };
`);

const h = helpersFactory();

test('WP 7.1: exoNormalizeHelpSearchText normalizes Arabic Alef, Yeh, Teh Marbuta and diacritics', () => {
  assert.equal(h.exoNormalizeHelpSearchText('المُزَامَنَةُ'), 'المزامنه');
  assert.equal(h.exoNormalizeHelpSearchText('أهداف إضافية إلى'), 'اهداف اضافيه الي');
  assert.equal(h.exoNormalizeHelpSearchText('  PDF & Audio  '), 'pdf & audio');
});

test('WP 7.1: exoExpandHelpSearchQuery expands bilingual AR/EN synonyms and handles empty queries', () => {
  const emptyRes = h.exoExpandHelpSearchQuery('   ');
  assert.equal(emptyRes.normalized, '');
  assert.deepEqual(emptyRes.tokens, []);

  const syncEn = h.exoExpandHelpSearchQuery('sync');
  assert.ok(syncEn.tokens.includes('cloud'));
  assert.ok(syncEn.tokens.includes('supabase'));
  assert.ok(syncEn.tokens.includes('مزامنه'));

  const pdfAr = h.exoExpandHelpSearchQuery('تصدير الورقة');
  assert.ok(pdfAr.tokens.includes('pdf'));
  assert.ok(pdfAr.tokens.includes('export'));

  const kbEn = h.exoExpandHelpSearchQuery('shortcuts');
  assert.ok(kbEn.tokens.includes('keyboard'));
  assert.ok(kbEn.tokens.includes('اختصارات'));
});

test('WP 7.1: buildHelpQuickActionsList returns 8 localized quick actions in EN & AR', () => {
  const enList = h.buildHelpQuickActionsList(true);
  const arList = h.buildHelpQuickActionsList(false);
  assert.equal(enList.length, 8);
  assert.equal(arList.length, 8);
  const arRegex = /[\u0600-\u06FF]/;
  for (const item of enList) {
    assert.ok(item.id && item.label && item.icon);
    assert.ok(!arRegex.test(item.label), `EN quick action leaked Arabic: ${item.label}`);
  }
  for (const item of arList) {
    assert.ok(arRegex.test(item.label), `AR quick action missing Arabic: ${item.label}`);
  }
});

test('WP 7.1: buildActionableHelpCatalog covers Guides A-G cleanly with EN zero-Arabic visible text', () => {
  const enCatalog = h.buildActionableHelpCatalog(true);
  const arCatalog = h.buildActionableHelpCatalog(false);
  assert.ok(enCatalog.length >= 8);
  assert.equal(enCatalog.length, arCatalog.length);

  const codes = new Set(enCatalog.map(g => g.sectionCode));
  for (const requiredCode of ['A', 'B', 'C', 'D', 'E', 'G']) {
    assert.ok(codes.has(requiredCode), `Missing guide sectionCode ${requiredCode}`);
  }

  const arRegex = /[\u0600-\u06FF]/;
  for (const g of enCatalog) {
    assert.ok(g.paneNum >= 1 && g.paneNum <= 6);
    assert.ok(g.whenToUse && Array.isArray(g.steps) && g.steps.length >= 2 && g.expectedOutcome && g.actionId && g.actionLabel);
    const visibleEn = [g.title, g.whenToUse, ...g.steps, g.expectedOutcome, g.actionLabel].join(' ');
    assert.ok(!arRegex.test(visibleEn), `EN catalog guide "${g.id}" leaked Arabic in visible strings`);
    assert.ok(Array.isArray(g.keywords) && g.keywords.length > 0, `Guide "${g.id}" needs bilingual search keywords`);
  }

  const policyGuide = enCatalog.find(g => g.id === 'help_policy_developer');
  assert.ok(policyGuide);
  assert.ok(policyGuide.steps.join(' ').toLowerCase().includes('free for everyone'));
  assert.ok(policyGuide.steps.join(' ').toLowerCase().includes('annotated pdf export'));
});

test('WP 7.1: deriveHelpGettingStartedChecklist computes 0/7 empty vs 7/7 verified milestones & blocks fake progress', () => {
  const emptyChecklist = h.deriveHelpGettingStartedChecklist({}, true);
  assert.equal(emptyChecklist.totalCount, 7);
  assert.equal(emptyChecklist.completedCount, 0);
  assert.equal(emptyChecklist.progressPct, 0);
  assert.equal(emptyChecklist.nextIncompleteActionId, 'go_library');

  // Negative anti-fake-progress checks: unlinked goals, offline unacked sign-in, 0 persisted annotations
  const antiFake = h.deriveHelpGettingStartedChecklist({
    subjectCount: 1,
    chapterCount: 1,
    resourceCount: 1,
    hasStudioNotesOrBookmark: false,
    persistedAnnotationCount: 0,
    sessionCount: 1,
    goalCount: 3,
    linkedGoalCount: 0,
    logCount: 1,
    isSignedIn: true,
    hasRemoteSync: false,
    hasExportedBackup: false
  }, true);
  const stepMap = Object.fromEntries(antiFake.steps.map(s => [s.id, s]));
  assert.equal(stepMap.gs_studio_notes.done, false, 'Page view alone without real persisted notes must keep gs_studio_notes incomplete');
  assert.equal(stepMap.gs_goal.done, false, 'Unlinked weekly goal (linkedGoalCount=0) must keep gs_goal incomplete');
  assert.equal(stepMap.gs_safety.done, false, 'Offline/unacked sign-in without backup export must keep gs_safety incomplete');
  assert.equal(antiFake.completedCount, 4);

  const partialChecklist = h.deriveHelpGettingStartedChecklist({
    subjectCount: 2,
    chapterCount: 3,
    resourceCount: 1,
    hasStudioNotesOrBookmark: true,
    persistedAnnotationCount: 1,
    sessionCount: 0,
    goalCount: 0,
    linkedGoalCount: 0,
    logCount: 0,
    isSignedIn: false,
    hasRemoteSync: false
  }, false);
  assert.equal(partialChecklist.completedCount, 3);
  assert.equal(partialChecklist.progressPct, 43);
  assert.equal(partialChecklist.nextIncompleteActionId, 'add_session');

  const fullChecklist = h.deriveHelpGettingStartedChecklist({
    subjectCount: 3,
    chapterCount: 4,
    resourceCount: 4,
    hasStudioNotesOrBookmark: true,
    persistedAnnotationCount: 1,
    sessionCount: 5,
    goalCount: 2,
    linkedGoalCount: 2,
    logCount: 3,
    isSignedIn: true,
    hasRemoteSync: true
  }, true);
  assert.equal(fullChecklist.completedCount, 7);
  assert.equal(fullChecklist.progressPct, 100);
  assert.equal(fullChecklist.nextIncompleteActionId, 'go_dashboard');
});

test('WP 7.1: exoHasRealAnnotationContent distinguishes empty/placeholder maps from real persisted annotations', () => {
  assert.equal(h.exoHasRealAnnotationContent(null), false);
  assert.equal(h.exoHasRealAnnotationContent({}), false);
  assert.equal(h.exoHasRealAnnotationContent({ 1: {} }), false);
  assert.equal(h.exoHasRealAnnotationContent({ 1: { strokes: [], paths: [], texts: [], items: [], lines: [] } }), false);
  assert.equal(h.exoHasRealAnnotationContent({ 1: { strokes: [{ points: [[10, 10], [20, 20]] }] } }), true);
  assert.equal(h.exoHasRealAnnotationContent({ 2: { texts: [{ text: 'Important receptor' }] } }), true);
  assert.equal(h.exoHasRealAnnotationContent({ 3: { isExtraSheet: true, strokes: [] } }), true);
});

test('WP 7.1: deriveHelpTroubleshootingRecommendations prioritizes active conditions and upholds GEMINI.md safety rules', () => {
  const recList = h.deriveHelpTroubleshootingRecommendations({
    hasQuotaWarning: true,
    hasPreviewFallbackPdf: true,
    hasConflict: false,
    hasPendingLocalChanges: false,
    subjectCount: 1,
    isSignedIn: true
  }, true);
  assert.equal(recList.length, 4);
  assert.ok(recList[0].active === true && recList[1].active === true, 'Active diagnostics sort to top');
  assert.ok(recList[2].active === false && recList[3].active === false, 'Inactive diagnostics follow after active ones');

  for (const item of recList) {
    assert.ok(item.dataSafetyNote && item.steps.length >= 2 && item.actionId);
    const fullText = [item.title, item.symptom, item.dataSafetyNote, ...item.steps].join(' ').toLowerCase();
    assert.ok(!fullText.includes('clear browser cache'), 'Must never advise wiping browser storage');
    assert.ok(!fullText.includes('reset the app'), 'Must never advise resetting app');
  }
});

test('WP 7.1: deriveGoogleDriveDiagnosticsModel covers all 9 states, separates connection/sync badges, and redacts secrets', () => {
  const arRegex = /[\u0600-\u06FF]/;
  const cases = [
    {
      expect: 'not_linked',
      opts: { isSignedIn: true, hasVipEntitlement: true, isOnline: true, isLinked: false, authState: 'disconnected' }
    },
    {
      expect: 'connected',
      opts: { isSignedIn: true, hasVipEntitlement: true, isOnline: true, isLinked: true, authState: 'connected', syncStatus: 'idle', email: 'doc@example.com' }
    },
    {
      expect: 'auth_expired',
      opts: { isSignedIn: true, hasVipEntitlement: true, isOnline: true, isLinked: true, authState: 'reauth_required', lastErrorStatus: 401 }
    },
    {
      expect: 'permission_denied',
      opts: { isSignedIn: true, hasVipEntitlement: true, isOnline: true, isLinked: true, authState: 'permission_denied', lastErrorStatus: 403, lastErrorCode: 'google_account_mismatch', email: 'saved@example.com' }
    },
    {
      expect: 'file_access_error',
      opts: { isSignedIn: true, hasVipEntitlement: true, isOnline: true, isLinked: true, authState: 'connected', lastErrorStatus: 404, lastErrorCode: 'not_found' }
    },
    {
      expect: 'offline',
      opts: { isSignedIn: true, hasVipEntitlement: true, isOnline: false, isLinked: true, authState: 'connected', hasConfirmedSync: true, lastConfirmedSyncLabel: '12:30' }
    },
    {
      expect: 'media_transfer_failed',
      opts: {
        isSignedIn: true,
        hasVipEntitlement: true,
        isOnline: true,
        isLinked: true,
        authState: 'connected',
        lastErrorStatus: 500,
        lastErrorCode: 'gdrive_upload_failed',
        lastErrorMessage: 'Bearer ya29.superSecretTokenXYZ access_token=tok123 upload_id=up99 failed https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=up99'
      }
    },
    {
      expect: 'workspace_sync_issue',
      opts: { isSignedIn: true, hasVipEntitlement: true, isOnline: true, isLinked: true, authState: 'connected', syncStatus: 'conflict', lastErrorCode: 'occ_conflict' }
    },
    {
      expect: 'sync_confirmed',
      opts: { isSignedIn: true, hasVipEntitlement: true, isOnline: true, isLinked: true, authState: 'connected', syncStatus: 'synced', hasConfirmedSync: true, cloudRevision: 7, lastConfirmedSyncLabel: '14:15' }
    }
  ];

  const seenStates = new Set();
  for (const c of cases) {
    const enModel = h.deriveGoogleDriveDiagnosticsModel(c.opts, true);
    const arModel = h.deriveGoogleDriveDiagnosticsModel(c.opts, false);
    assert.equal(enModel.diagnosticState, c.expect, `Expected state ${c.expect}`);
    seenStates.add(enModel.diagnosticState);
    assert.ok(enModel.connectionBadge && enModel.connectionBadge.label, `${c.expect}: connectionBadge present`);
    assert.ok(enModel.syncBadge && enModel.syncBadge.label, `${c.expect}: syncBadge present`);
    assert.notEqual(enModel.connectionBadge.label, enModel.syncBadge.label, `${c.expect}: connection & sync badges remain distinct`);
    assert.ok(enModel.title && enModel.whatHappened && enModel.dataSafetyNote, `${c.expect}: diagnostic fields complete`);
    const enBlob = [enModel.title, enModel.whatHappened, enModel.cause, enModel.dataSafetyNote, enModel.nextActionLabel, enModel.connectionBadge.label, enModel.syncBadge.label, enModel.redactedDetail].join(' ');
    assert.ok(!arRegex.test(enBlob), `${c.expect}: EN diagnostics leaked Arabic`);
    assert.ok(arRegex.test(arModel.title), `${c.expect}: AR diagnostics must be localized`);
  }
  assert.equal(seenStates.size, 9, 'All 9 Google Drive diagnostic states must be covered');

  // Verify offline keeps historical timestamp on syncBadge without falsely claiming Online/Synced
  const offlineSynced = h.deriveGoogleDriveDiagnosticsModel(cases[5].opts, true);
  assert.equal(offlineSynced.connectionBadge.label, 'Offline');
  assert.ok(offlineSynced.syncBadge.label.includes('Offline') && offlineSynced.syncBadge.label.includes('12:30'));

  // Verify token/secret redaction
  const redactedModel = h.deriveGoogleDriveDiagnosticsModel(cases[6].opts, true);
  assert.ok(!redactedModel.redactedDetail.includes('superSecretTokenXYZ'), 'Bearer ya29 token must be redacted');
  assert.ok(!redactedModel.redactedDetail.includes('tok123'), 'access_token query secret must be redacted');
  assert.ok(!redactedModel.redactedDetail.includes('up99'), 'upload_id secret must be redacted');
  assert.ok(redactedModel.redactedDetail.includes('[REDACTED]'));
});

test('WP 7.1: deriveAcademyGuideMetrics aligns all 6 Help Center module titles cleanly', () => {
  const en = h.deriveAcademyGuideMetrics(3, 6, true);
  const ar = h.deriveAcademyGuideMetrics(3, 6, false);
  assert.equal(en.panes.length, 6);
  assert.equal(en.panes[0].title, 'Overview & Closed Loop');
  assert.equal(en.panes[2].title, 'Chapter Workspace & Studio');
  assert.equal(en.panes[5].title, 'Troubleshoot, VIP & Support');
  assert.equal(ar.panes.length, 6);
  assert.equal(en.closedLoopStations[0].label, 'Weekly Goals');
  assert.equal(en.closedLoopStations[4].label, 'Evaluate & Rollover');
});

test('WP 7.1: exoComputeMobileViewportBudget enforces 15.5% sticky chrome budget and >=44px hitboxes', () => {
  const good390 = h.exoComputeMobileViewportBudget(390, 844, 50, 52, [
    { id: 'mobileMoreMenuBtn', width: 44, height: 44 },
    { id: 'cloudNavBtn', width: 112, height: 44 }
  ]);
  assert.equal(good390.withinMobileChromeCap, true);
  assert.equal(good390.undersizedCount, 0);
  assert.ok(good390.stickyRatio <= 0.155);

  const bad320 = h.exoComputeMobileViewportBudget(320, 720, 62, 56, [
    { id: 'smallBtn', width: 32, height: 32 }
  ]);
  assert.equal(bad320.withinMobileChromeCap, false);
  assert.equal(bad320.undersizedCount, 1);

  const tablet768 = h.exoComputeMobileViewportBudget(768, 1024, 110, 0, [
    { id: 'tabBtn', width: 48, height: 44 }
  ]);
  assert.equal(tablet768.withinMobileChromeCap, true);
  assert.equal(tablet768.undersizedCount, 0);
});
