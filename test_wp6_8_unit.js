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

test('WP 6.8 (Priority 1): reconcileRecoveryAndAbsentLogsWithSchedule matches exact efcc665 schedule-order semantics across all edge cases', () => {
  const fnCol = extractFunctionSource('isCollegeCommitmentSession');
  const fnWasted = extractFunctionSource('isWastedTimeSession');
  const fnPersonal = extractFunctionSource('isPersonalNeutralSession');
  const fnParseDay = extractFunctionSource('parseDayIdxFromArabicLogText');
  const fnReconcile = extractFunctionSource('reconcileRecoveryAndAbsentLogsWithSchedule');

  // Exact verbatim efcc665 baseline reference implementation (from commit efcc665a84790172874fbb813eea7e9da21b099e)
  const baselineReferenceSource = `
    function baselineReconcile() {
      if (!Array.isArray(logs)) return;
      let logsChanged = false;
      const beforeLen = logs.length;
      logs = logs.filter(l => {
        if (l && l.mood === 'missed' && l.text) {
          const txt = String(l.text);
          if (txt.includes('وقت ضائع') || txt.includes('لعب وتضييع وقت')) return false;
        }
        return true;
      });
      if (logs.length !== beforeLen) logsChanged = true;

      const studySessions = scheduleEvents.filter(e => !isCollegeCommitmentSession(e) && !isWastedTimeSession(e) && !isPersonalNeutralSession(e));
      logs.forEach(log => {
        if (!log) return;
        if (log.mood === 'missed' || log.mood === 'wasted_time') {
          const existingIds = (Array.isArray(log.linkedRecoveryEventIds) ? log.linkedRecoveryEventIds : (log.linkedRecoveryEventId ? [log.linkedRecoveryEventId] : []))
            .filter(id => studySessions.some(e => String(e.id) === String(id)));
          if (existingIds.length > 0) {
            log.linkedRecoveryEventIds = existingIds;
            log.linkedRecoveryEventId = existingIds[0];
            return;
          }
          const matchedCatchup = studySessions.find(ev => {
            if (String(ev.recoveredFromLogId) === String(log.id)) return true;
            const t = String(ev.title || '').toLowerCase();
            const n = String(ev.notes || '').toLowerCase();
            const isCatchupTask = ev.type === 'catchup' || t.includes('تعويض') || n.includes('تعويض') || n.includes('إنقاذ');
            if (!isCatchupTask) return false;
            if (log.subjectId && ev.subjectId && String(log.subjectId) === String(ev.subjectId)) return true;
            if (!log.subjectId && log.mood === 'wasted_time') return true;
            return isCatchupTask;
          });
          if (matchedCatchup) {
            log.linkedRecoveryEventId = matchedCatchup.id;
            log.linkedRecoveryEventIds = [matchedCatchup.id];
            log.linkedRecoveryTitle = matchedCatchup.title;
            logsChanged = true;
          } else {
            log.linkedRecoveryEventId = null;
            log.linkedRecoveryEventIds = [];
          }
        } else if (log.mood === 'college_absent') {
          const inferredDay = (log.absentDayIdx !== undefined && log.absentDayIdx !== null)
            ? Number(log.absentDayIdx)
            : parseDayIdxFromArabicLogText(log.text);
          const absentColEv = scheduleEvents.find(e => isCollegeCommitmentSession(e) && e.absent && (String(e.id) === String(log.sourceEventId) || (inferredDay !== null && Number(e.day) === inferredDay)));
          const targetDay = absentColEv ? Number(absentColEv.day) : inferredDay;
          const manualIds = (Array.isArray(log.linkedRecoveryEventIds) ? log.linkedRecoveryEventIds : (log.linkedRecoveryEventId ? [log.linkedRecoveryEventId] : []))
            .filter(id => studySessions.some(e => String(e.id) === String(id)));
          const dayStudyIds = targetDay !== null
            ? studySessions.filter(e => Number(e.day) === targetDay || (e.notes && e.notes.includes('استغلال وقت غياب'))).map(e => e.id)
            : [];
          const combinedIds = Array.from(new Set([...manualIds.map(String), ...dayStudyIds.map(String)]));
          if (combinedIds.length !== (log.linkedRecoveryEventIds ? log.linkedRecoveryEventIds.length : 0)) {
            log.linkedRecoveryEventIds = combinedIds;
            log.linkedRecoveryEventId = combinedIds[0] || null;
            logsChanged = true;
          }
        }
      });
      if (logsChanged) saveLogs();
    }
  `;

  function runImpl(useBaseline, rawLogs, rawEvents) {
    let saveCalls = 0;
    const sandbox = new Function('initialLogs', 'initialEvents', 'onSave', `
      let logs = JSON.parse(JSON.stringify(initialLogs));
      const scheduleEvents = JSON.parse(JSON.stringify(initialEvents));
      function saveLogs() { onSave(); }
      ${fnCol}
      ${fnWasted}
      ${fnPersonal}
      ${fnParseDay}
      ${useBaseline ? baselineReferenceSource : fnReconcile}
      ${useBaseline ? 'baselineReconcile();' : 'reconcileRecoveryAndAbsentLogsWithSchedule();'}
      return logs;
    `);
    const resultLogs = sandbox(rawLogs, rawEvents, () => { saveCalls++; });
    return { logs: resultLogs, saveCalls };
  }

  // Case A: Reordered catchups — earlier cross-subject catchup vs later exact recoveredFromLogId
  // Original .find() picks the FIRST catchup in schedule order!
  const eventsCaseA = [
    { id: 101, title: 'خطة تعويض عامة', type: 'catchup', subjectId: 20, day: 1 },
    { id: 102, title: 'تعويض مباشر للمحاضرة', type: 'study', subjectId: 10, recoveredFromLogId: 5001, day: 2 }
  ];
  const logsCaseA = [
    { id: 5001, mood: 'missed', subjectId: 10, text: 'محاضرة فائتة' },
    { id: 5002, mood: 'wasted_time', text: 'تضييع وقت' }
  ];
  assert.deepEqual(
    runImpl(false, logsCaseA, eventsCaseA),
    runImpl(true, logsCaseA, eventsCaseA),
    'Reordered earlier catchup vs later exact recoveredFromLogId must match baseline .find() order identically'
  );
  // Flip order: exact recoveredFromLogId first -> exact recoveredFromLogId wins
  const eventsCaseAFlipped = [eventsCaseA[1], eventsCaseA[0]];
  assert.deepEqual(
    runImpl(false, logsCaseA, eventsCaseAFlipped),
    runImpl(true, logsCaseA, eventsCaseAFlipped),
    'Exact recoveredFromLogId appearing earlier in scheduleEvents must win identically'
  );

  // Case B: No catchup events -> exact recoveredFromLogId vs cross-subject study vs unlinked
  const eventsCaseB = [
    { id: 201, title: 'Normal study', type: 'study', subjectId: 10, day: 1 },
    { id: 202, title: 'إنقاذ سريع', type: 'study', subjectId: 99, day: 3 }
  ];
  const logsCaseB = [
    { id: 6001, mood: 'missed', subjectId: 10, text: 'فائتة بدون ربط' },
    { id: 6002, mood: 'missed', text: 'مهمة لم تتم في يومها: وقت ضائع' } // bogus log must be filtered
  ];
  const resB = runImpl(false, logsCaseB, eventsCaseB);
  assert.deepEqual(resB, runImpl(true, logsCaseB, eventsCaseB), 'Bogus log filtering and cross-subject catchup fallback must match baseline');
  assert.equal(resB.logs.length, 1);

  // Case C: Multiple same-day absent college commitments + interleaved day study & 'استغلال وقت غياب' notes
  const eventsCaseC = [
    { id: 's_invest_early', title: 'Early Absent Exploit', type: 'study', day: 5, notes: 'استغلال وقت غياب مبكر' },
    { id: 'c_day2_first', title: 'College AM', type: 'mandatory', isFixed: true, absent: true, day: 2 },
    { id: 'c_dup_id', title: 'College PM (diff day)', type: 'mandatory', isFixed: true, absent: true, day: 4 },
    { id: 'c_dup_id', title: 'College Dup ID Later', type: 'mandatory', isFixed: true, absent: true, day: 6 },
    { id: 's_day2_a', title: 'Day 2 Session A', type: 'review', day: 2 },
    { id: 's_invest_mid', title: 'Mid Absent Exploit', type: 'practice', day: 3, notes: 'استغلال وقت غياب متوسط' },
    { id: 's_day2_b', title: 'Day 2 Session B', type: 'review', day: 2 },
    { id: 's_manual', title: 'Manual Link', type: 'review', day: 6 }
  ];
  const logsCaseC = [
    { id: 7001, mood: 'college_absent', absentDayIdx: 2, sourceEventId: 'c_dup_id', linkedRecoveryEventId: 's_manual', text: 'غياب يوم' },
    { id: 7002, mood: 'college_absent', absentDayIdx: null, sourceEventId: 'missing', text: 'غياب بدون يوم محدد' }
  ];
  assert.deepEqual(
    runImpl(false, logsCaseC, eventsCaseC),
    runImpl(true, logsCaseC, eventsCaseC),
    'Multiple same-day absent commitments, sourceEventId vs inferredDay order, and interleaved study IDs must match baseline 100%'
  );

  // Case D: Existing linked IDs still present vs stale linked IDs removed
  const eventsCaseD = [
    { id: 'e_valid', title: 'Valid Study', type: 'study', day: 1 },
    { id: 'e_catch', title: 'Catchup Later', type: 'catchup', day: 2 }
  ];
  const logsCaseD = [
    { id: 8001, mood: 'missed', linkedRecoveryEventIds: ['e_deleted', 'e_valid'], text: 'Log 1' },
    { id: 8002, mood: 'missed', linkedRecoveryEventIds: ['e_deleted_only'], text: 'Log 2' }
  ];
  assert.deepEqual(
    runImpl(false, logsCaseD, eventsCaseD),
    runImpl(true, logsCaseD, eventsCaseD),
    'Existing valid linked IDs retention and stale IDs fallback must match baseline'
  );
});

test('WP 6.8 (Priority 2): renderLogs opens all filtered date groups regardless of >5 day count while preserving dayCardLimit', () => {
  const fnLogs = extractFunctionSource('renderLogs');
  assert.ok(fnLogs.includes('const isOpen = isFilteredMode || openLogDateAccordions.has(dKey);'),
    'Filtered search/mood/category mode must open every matching date group even when >5 days match');
  assert.ok(!fnLogs.includes('isFilteredMode && visibleDayKeys.length <= 5'),
    'Must not hide filtered matches when visibleDayKeys.length > 5');
  assert.ok(fnLogs.includes('const visibleDayItems = dayItems.slice(0, dayCardLimit);'),
    'Per-day progressive windowing (dayCardLimit) must remain active');
});

test('WP 6.8: PDF container skips heavy MutationObserver subtree walk & keeps active Studio localized on language switch', () => {
  assert.ok(indexHtml.includes('id="pdfPagesScrollContainer" data-exo-no-i18n="1"'),
    'pdfPagesScrollContainer must opt out of domObserver walks across 100+ page placeholders');
  const fnApply = extractFunctionSource('applyExoLanguage');
  assert.ok(fnApply.includes('syncExtraNoteButtonsLockUI()'),
    'applyExoLanguage must re-sync active PDF Studio extra-note buttons/headers when switching language');
});

