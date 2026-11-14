// ============================================================================
// Exo Personal Study Journal — Phase 6 / WP 6.8 P0 Runtime Stabilization Unit Tests
// Verifies pure logic, memoization, indexing, lazy canvas sizing, and
// structural runtime freeze regressions using Node's built-in test runner:
//   1. Causal digest deduplication (stampEntityMutation precomputedDigest reuse)
//   2. O(1) indexed Map lookups (getGoalLinkedEventsList & getLogLinkedScheduleEvents)
//   3. Lazy Extra Note Sheet sizing (1x1 collapsed canvases + deferred resize)
//   4. View-scoped i18n & dirty-view invalidation (applyExoLanguage & switchView)
//   5. In-place Chapter Workspace search/filter (preserves #cwResourceSearchInput focus)
//   6. PDF Studio render/scroll memory guards (rAF scroll, drawer guard, offCanvas cleanup, windowing)
//   7. Live clock string memoization & inactive subtree skip
//   8. Planner & Tracker list windowing + single-pass day bucketing
// ============================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extractFunctionSource(fnName) {
  const lineAnchorRegex = new RegExp(`(?:async\\s+)?function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n        \\}`);
  const anchored = indexHtml.match(lineAnchorRegex);
  if (anchored) return anchored[0];
  const regex = new RegExp(`(?:async\\s+)?function\\s+${fnName}\\s*\\(`);
  const match = regex.exec(indexHtml);
  assert.ok(match, `Expected function ${fnName} in index.html`);
  const start = match.index;
  const endMarker = indexHtml.indexOf('\n        }', start);
  assert.ok(endMarker > start, `Expected closing brace for ${fnName}`);
  return indexHtml.slice(start, endMarker + '\n        }'.length);
}

test('WP 6.8: ensureEntityHasCausalMetadata passes precomputedDigest to stampEntityMutation without double digest computation', () => {
  const fnValidate = extractFunctionSource('validateAndResolveEntityScope');
  const fnDigest = extractFunctionSource('computeEntityContentDigest');
  const fnObserve = extractFunctionSource('observeCausalOperation');
  const fnCreateOp = extractFunctionSource('createCausalOperation');
  const fnStamp = extractFunctionSource('stampEntityMutation');
  const fnEnsure = extractFunctionSource('ensureEntityHasCausalMetadata');

  let digestCallCount = 0;
  const runner = new Function(
    'currentCloudUser',
    'getOrCreateDeviceId',
    'getLiveActorId',
    'generateCausalOperationId',
    'getScopeContextMapKey',
    `
    const CAUSAL_TOMBSTONE_ENTITY_TYPES = ['subjects', 'groups', 'lectures', 'wird_logs', 'events', 'backlog', 'logs', 'weekly_reports'];
    const CAUSAL_TOMBSTONE_ENTITY_TYPE_SET = new Set(CAUSAL_TOMBSTONE_ENTITY_TYPES);
    const FORBIDDEN_MUTATION_VERBS_AS_ID = new Set(['create', 'update', 'delete', 'upsert', 'restore']);
    let liveTabActorId = 'actor_wp68';
    let liveLamportClock = 0;
    const liveActorScopeCounters = new Map();
    const liveObservedScopeContexts = new Map();
    let _digestHook = null;
    ${fnValidate}
    ${fnDigest}
    const _realDigest = computeEntityContentDigest;
    computeEntityContentDigest = function(obj) {
      if (_digestHook) _digestHook();
      return _realDigest(obj);
    };
    ${fnObserve}
    ${fnCreateOp}
    ${fnStamp}
    ${fnEnsure}
    return {
      run: (entity, hook) => {
        _digestHook = hook;
        return ensureEntityHasCausalMetadata(entity, 'lectures', entity.id, 'u1');
      },
      directStamp: (entity) => stampEntityMutation(entity, 'lectures', entity.id, 'u1')
    };
    `
  );

  const api = runner(
    { id: 'u1' },
    () => 'dev_wp68',
    () => 'actor_wp68',
    () => 'op-' + Math.random().toString(16).slice(2, 10),
    (uid, scopeId) => String(uid || 'local') + '::' + String(scopeId || 'global')
  );

  const entityA = { id: 101, title: 'Pharmacology Intro', completed: false };
  const res1 = api.run(entityA, () => { digestCallCount++; });
  assert.equal(res1.status, 'stamped');
  assert.equal(digestCallCount, 1, 'Initial stamp must compute content digest once (not twice)');

  // Verify standalone stampEntityMutation without precomputedDigest computes identical _causalDigest
  const entityB = { id: 101, title: 'Pharmacology Intro', completed: false };
  api.directStamp(entityB);
  assert.equal(entityA._causalDigest, entityB._causalDigest, 'Precomputed digest must match standalone digest identically');

  // Unchanged second pass reuses digest cleanly with 1 digest check
  digestCallCount = 0;
  const res2 = api.run(entityA, () => { digestCallCount++; });
  assert.equal(res2.status, 'unchanged');
  assert.equal(digestCallCount, 1);
});

test('WP 6.8: getGoalLinkedEventsList & getLogLinkedScheduleEvents support O(1) indexed Map lookups', () => {
  const fnGoal = extractFunctionSource('getGoalLinkedEventsList');
  const fnLog = extractFunctionSource('getLogLinkedScheduleEvents');

  const api = new Function(
    'scheduleEvents',
    `
    ${fnGoal}
    ${fnLog}
    return { getGoalLinkedEventsList, getLogLinkedScheduleEvents };
    `
  )([]);

  const ev1 = { id: 501, title: 'Cardio Review', type: 'review', isFixed: false };
  const ev2 = { id: 502, title: 'Fixed Lab', type: 'mandatory', isFixed: true };
  const evMap = new Map([['501', ev1], ['502', ev2]]);

  // O(1) Map lookup works even when scheduleEvents global is empty
  const goalRes = api.getGoalLinkedEventsList({ linkedEventIds: ['501', 502], linkedEventId: '501' }, evMap);
  assert.equal(goalRes.length, 1);
  assert.equal(goalRes[0].id, 501, 'Must filter mandatory/fixed sessions and deduplicate');

  const logRes = api.getLogLinkedScheduleEvents({ linkedRecoveryEventIds: ['501', '999'] }, evMap);
  assert.equal(logRes.length, 1);
  assert.equal(logRes[0].id, 501);
});

test('WP 6.8: Collapsed Extra Note Sheets defer full HiDPI canvas backing until opened', () => {
  const fnBuild = extractFunctionSource('buildExtraNoteSheetDOM');
  const fnSync = extractFunctionSource('syncExtraNoteSheetSize');
  const fnToggle = extractFunctionSource('toggleExtraNoteForPage');

  assert.ok(fnBuild.includes('isOpened ? Math.max(1, Math.floor(widthPx * noteDpr)) : 1'),
    'Collapsed Extra Note Sheet must allocate 1x1 stub canvases until opened');
  assert.ok(fnBuild.includes('sheet.dataset.pendingWidth'),
    'Extra Note Sheet must store pending dimensions in dataset');
  assert.ok(fnSync.includes("if (sheet.style.display === 'none') {\n                return;"),
    'syncExtraNoteSheetSize must skip canvas resize + redraw while collapsed');
  assert.ok(fnToggle.includes('sheet.dataset.pendingWidth') && fnToggle.includes('redrawPageAnnotations(noteKey)'),
    'toggleExtraNoteForPage must restore exact HiDPI dimensions and redraw before showing');
});

test('WP 6.8: applyExoLanguage & switchView use view-scoped i18n and dirty view invalidation', () => {
  const fnApply = extractFunctionSource('applyExoLanguage');
  const fnSwitch = extractFunctionSource('switchView');

  assert.ok(indexHtml.includes('function exoTranslateSubtreeIfNeeded(rootEl, lang)'),
    'Lazy subtree translator exoTranslateSubtreeIfNeeded must exist');
  assert.ok(fnApply.includes('activeRoots.push(sec)') && fnApply.includes("window._exoDirtyViews[sec.id] = true"),
    'applyExoLanguage must translate only active views/overlays and mark hidden views dirty');
  assert.ok(fnApply.includes('updateWp65StaticLabels(targetLang)'),
    'applyExoLanguage must still invoke updateWp65StaticLabels');
  assert.ok(fnSwitch.includes('window.exoTranslateSubtreeIfNeeded(target, activeLangNow)'),
    'switchView must lazily translate stale newly activated views');
  assert.ok(fnSwitch.includes("calWrap.innerHTML = ''") && fnSwitch.includes("logsWrap.innerHTML = ''"),
    'switchView must unmount heavy schedule/tracker DOM when switching away');
});

test('WP 6.8: Chapter Workspace resource search/filter updates #cwResourcesList in place without wiping focus', () => {
  const fnInPlace = extractFunctionSource('updateChapterWorkspaceResourcesInPlace');
  const fnRenderCw = extractFunctionSource('renderChapterWorkspace');
  const fnPreload = extractFunctionSource('preloadChapterWorkspaceAnnotations');

  assert.ok(fnInPlace.includes("getElementById('cwResourcesList')"),
    'updateChapterWorkspaceResourcesInPlace must target #cwResourcesList directly');
  assert.ok(fnRenderCw.includes('updateChapterWorkspaceResourcesInPlace()'),
    'CW search/filter/sort handlers must call updateChapterWorkspaceResourcesInPlace instead of full renderChapterWorkspace');
  assert.ok(fnPreload.includes("document.activeElement.id === 'cwResourceSearchInput'"),
    'Async annotation preload must preserve active #cwResourceSearchInput focus');
});

test('WP 6.8: PDF Studio guards thumbnails, coalesces scroll with rAF, releases offCanvas, and evicts distant pages', () => {
  const fnThumbs = extractFunctionSource('renderPdfThumbnailsList');
  const fnScroll = extractFunctionSource('attachPdfScrollActivePageDetector');
  const fnRenderPage = extractFunctionSource('renderSinglePdfPage');

  assert.ok(fnThumbs.includes('!thumbDrawer || !thumbDrawer.classList.contains(\'open\')'),
    'renderPdfThumbnailsList must defer building 100+ mini-canvases while drawer is closed');
  assert.ok(fnScroll.includes('requestAnimationFrame'),
    'attachPdfScrollActivePageDetector must coalesce scroll detection via requestAnimationFrame');
  assert.ok(fnRenderPage.includes('offCanvas.width = 0;') && fnRenderPage.includes('offCanvas.height = 0;'),
    'renderSinglePdfPage must release temporary offCanvas pixel buffer immediately after blitting');
  assert.ok(fnRenderPage.includes('renderedPagesSet.delete(renderedP)') && fnRenderPage.includes('totalPdfPages > 36'),
    'renderSinglePdfPage must evict distant rendered PDF bitmaps on huge decks while preserving ink/annotations');
});

test('WP 6.8: Live clock memoizes DOM updates & Tracker/Planner use single-pass indexing and windowing', () => {
  const fnClock = extractFunctionSource('updateLiveTimeSyncBanner');
  const fnWeek = extractFunctionSource('renderWeekGrid');
  const fnTasks = extractFunctionSource('renderTasksView');
  const fnLogs = extractFunctionSource('renderLogs');

  assert.ok(fnClock.includes('data-exo-no-i18n') && fnClock.includes('updateLiveTimeSyncBanner._cache'),
    'updateLiveTimeSyncBanner must protect clock spans from MutationObserver/i18n and memoize outputs');
  assert.ok(fnClock.includes("!scheduleSec.classList.contains('active')"),
    'updateLiveTimeSyncBanner must skip inactive #schedule banner queries on 1s ticks');
  assert.ok(fnWeek.includes('const eventsByDay = new Map()'),
    'renderWeekGrid must bucket scheduleEvents in a single O(N) pass');
  assert.ok(fnTasks.includes('exoShowMoreGoalsBtn') && fnTasks.includes('eventByIdMap'),
    'renderTasksView must use indexed Map lookups and progressive list windowing');
  assert.ok(fnLogs.includes('if (isOpen)') && fnLogs.includes('window.exoLogsDayRenderLimit'),
    'renderLogs must skip rendering collapsed day-group HTML and window open groups cleanly');
});
