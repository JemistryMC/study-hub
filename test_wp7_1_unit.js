// ============================================================================
// Exo Personal Study Journal — Phase 7 / WP 7.1 Unit Tests
// Tests pure WP 7.1 helpers extracted from index.html via node:test:
//   1. exoNormalizeHelpSearchText (Arabic diacritic & letter normalization)
//   2. exoExpandHelpSearchQuery (bilingual AR/EN synonym clusters)
//   3. buildHelpQuickActionsList (8 quick action pills in EN/AR)
//   4. buildActionableHelpCatalog (Sections A-G with EN zero-Arabic-leak check)
//   5. deriveHelpGettingStartedChecklist (live 7-step progress tracking)
//   6. deriveHelpTroubleshootingRecommendations (sorting, safety notes, no cache wipe)
//   7. exoComputeMobileViewportBudget (<= 15.5% chrome cap & >= 44px touch targets)
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
  return {
    exoNormalizeHelpSearchText,
    exoExpandHelpSearchQuery,
    buildHelpQuickActionsList,
    buildActionableHelpCatalog,
    deriveHelpGettingStartedChecklist,
    deriveHelpTroubleshootingRecommendations,
    exoComputeMobileViewportBudget
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

test('WP 7.1: deriveHelpGettingStartedChecklist computes 0/7 empty vs 7/7 completed progress cleanly', () => {
  const emptyChecklist = h.deriveHelpGettingStartedChecklist({}, true);
  assert.equal(emptyChecklist.totalCount, 7);
  assert.equal(emptyChecklist.completedCount, 0);
  assert.equal(emptyChecklist.progressPct, 0);
  assert.equal(emptyChecklist.nextIncompleteActionId, 'go_library');

  const partialChecklist = h.deriveHelpGettingStartedChecklist({
    subjectCount: 2,
    chapterCount: 3,
    resourceCount: 1,
    hasStudioNotesOrBookmark: true,
    sessionCount: 0,
    goalCount: 0,
    logCount: 0,
    isSignedIn: false
  }, false);
  assert.equal(partialChecklist.completedCount, 3);
  assert.equal(partialChecklist.progressPct, 43);
  assert.equal(partialChecklist.nextIncompleteActionId, 'add_session');

  const fullChecklist = h.deriveHelpGettingStartedChecklist({
    subjectCount: 3,
    chapterCount: 4,
    resourceCount: 4,
    hasStudioNotesOrBookmark: true,
    sessionCount: 5,
    goalCount: 2,
    logCount: 3,
    isSignedIn: true
  }, true);
  assert.equal(fullChecklist.completedCount, 7);
  assert.equal(fullChecklist.progressPct, 100);
  assert.equal(fullChecklist.nextIncompleteActionId, 'go_dashboard');
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
