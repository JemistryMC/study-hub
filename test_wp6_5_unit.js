// ============================================================================
// Exo Academic Platform — WP 6.5 Pure Logic Unit Tests (node:test)
// Tests extracted production WP 6.5 view-model helpers across all 8 screens:
//   - Smart Planner today summary (`derivePlannerTodaySummary`)
//   - Smart Compass Why-it-matters & Next-action (`deriveCompassPriorityMeta`)
//   - Backup & Restore SHA-256 + Merge vs Replace (`deriveBackupComparisonSummary`)
//   - Google Drive Private-by-Default & media summary (`deriveDrivePrivacyAndMediaSummary`)
//   - Schedule PDF Export summary & edition switching (`deriveSchedulePdfExportSummary`)
//   - Academy & Help Guide progress & 5-station loop (`deriveAcademyGuideMetrics`)
//   - Bilingual Spotlight Tour step resolution (`exoResolveSpotlightTourSteps`)
// ============================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extractTopLevelHelper(fnName, deps = {}) {
  const match = indexHtml.match(new RegExp(`function ${fnName}\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\s{8}\\}`));
  assert.ok(match, `${fnName} must exist in index.html`);
  const depKeys = Object.keys(deps);
  const depVals = Object.values(deps);
  return new Function(...depKeys, `${match[0]}; return ${fnName};`)(...depVals);
}

test('WP 6.5: derivePlannerTodaySummary summarizes remaining sessions, wasted time, unlinked goals, and EN/AR copy', () => {
  const derivePlannerTodaySummary = extractTopLevelHelper('derivePlannerTodaySummary');

  const events = [
    { id: 'e1', dayIndex: 2, startHour: 9, duration: 1.5, title: 'Pharmacology Ch1', type: 'study', completed: true, goalId: 'g1' },
    { id: 'e2', dayIndex: 2, startHour: 14.5, duration: 2, title: 'Med Chem Review', type: 'review', completed: false, goalId: 'g1' },
    { id: 'e3', dayIndex: 2, startHour: 18, duration: 1, title: 'Scrolling', type: 'wasted', completed: false },
    { id: 'e4', dayIndex: 4, startHour: 10, duration: 3, title: 'Other Day', type: 'study', completed: false }
  ];
  const backlog = [
    { id: 'g1', title: 'Linked Goal', completed: false },
    { id: 'g2', title: 'Unlinked Goal', completed: false },
    { id: 'g3', title: 'Done Goal', completed: true }
  ];

  const enSummary = derivePlannerTodaySummary(events, backlog, 2, true);
  assert.equal(enSummary.totalSessionsCount, 2);
  assert.equal(enSummary.completedSessionsCount, 1);
  assert.equal(enSummary.remainingHours, 2);
  assert.equal(enSummary.wastedHours, 1);
  assert.equal(enSummary.unlinkedGoalsCount, 1);
  assert.equal(enSummary.completionPct, 50);
  assert.equal(enSummary.nextSession.id, 'e2');
  assert.match(enSummary.headline, /1\/2 sessions complete/);
  assert.match(enSummary.nextStepLabel, /Med Chem Review/);
  assert.match(enSummary.nextStepLabel, /2:30 PM/);

  const arSummary = derivePlannerTodaySummary(events, backlog, 2, false);
  assert.match(arSummary.headline, /اكتملت 1 من 2/);
  assert.match(arSummary.nextStepLabel, /التالي: Med Chem Review/);

  const emptySummary = derivePlannerTodaySummary([], [], 0, true);
  assert.equal(emptySummary.totalSessionsCount, 0);
  assert.equal(emptySummary.completionPct, 0);
  assert.match(emptySummary.headline, /Open study day/);
});

test('WP 6.5: deriveCompassPriorityMeta supplies Why-it-matters and Next-action in EN and AR for every priority kind', () => {
  const deriveCompassPriorityMeta = extractTopLevelHelper('deriveCompassPriorityMeta');

  const kinds = [
    ['wasted_time', { hours: 3.5 }],
    ['upcoming_exam', { subjectName: 'Pharmacology', daysLeft: 4 }],
    ['spaced_repetition', { subjectName: 'Anatomy', count: 3 }],
    ['neglected_subject', { subjectName: 'Biochemistry' }],
    ['lagging_subject', { subjectName: 'Microbiology', ratioPct: 24 }],
    ['today_pending', { count: 2, hours: 3 }],
    ['unlinked_goals', { count: 4 }],
    ['review_balance', { ratioPct: 12 }],
    ['all_balanced', {}]
  ];

  for (const [kind, ctx] of kinds) {
    const enMeta = deriveCompassPriorityMeta(kind, ctx, true);
    const arMeta = deriveCompassPriorityMeta(kind, ctx, false);
    assert.ok(enMeta.badge && enMeta.title && enMeta.why && enMeta.nextAction, `${kind} EN incomplete`);
    assert.ok(arMeta.badge && arMeta.title && arMeta.why && arMeta.nextAction, `${kind} AR incomplete`);
    assert.notEqual(enMeta.why, enMeta.nextAction, `${kind} why vs nextAction must be distinct`);
    assert.ok(['danger', 'warning', 'info', 'success'].includes(enMeta.tone));
  }
});

test('WP 6.5: deriveBackupComparisonSummary handles verified, tampered, legacy signatures and missing-annotations replace guard', () => {
  const deriveBackupComparisonSummary = extractTopLevelHelper('deriveBackupComparisonSummary');

  const verified = deriveBackupComparisonSummary(
    {
      integrityStatus: 'verified',
      validSignature: true,
      hasIntegrityHash: true,
      formatVersion: '4.0',
      canReplace: true,
      totalSubjects: 5,
      totalEvents: 12,
      totalLogs: 20,
      totalBacklog: 4
    },
    { subjects: 2, events: 4, logs: 7 },
    true
  );
  assert.equal(verified.integrityState, 'verified');
  assert.match(verified.integrityLabel, /SHA-256/);
  assert.equal(verified.merge.recommended, true);
  assert.equal(verified.replace.allowed, true);
  assert.equal(verified.backupCounts.subjects, 5);
  assert.equal(verified.localCounts.subjects, 2);

  const tamperedBlocked = deriveBackupComparisonSummary(
    {
      integrityStatus: 'tampered',
      validSignature: false,
      hasIntegrityHash: true,
      canReplace: false,
      totalSubjects: 3,
      totalEvents: 1
    },
    { subjects: 4, events: 9, logs: 10 },
    false
  );
  assert.equal(tamperedBlocked.integrityState, 'tampered');
  assert.equal(tamperedBlocked.replace.allowed, false);
  assert.ok(tamperedBlocked.replace.blockedReason.includes('الرسومات') || tamperedBlocked.replace.blockedReason.includes('الملاحظات'));

  const legacy = deriveBackupComparisonSummary(
    { formatVersion: 'legacy', totalSubjects: 1 },
    { subjects: 1 },
    true
  );
  assert.equal(legacy.integrityState, 'legacy');
  assert.match(legacy.integrityLabel, /Legacy/);
});

test('WP 6.5: deriveDrivePrivacyAndMediaSummary accurately reports Private-by-Default posture without exaggerating Free or offline access', () => {
  const deriveDrivePrivacyAndMediaSummary = extractTopLevelHelper('deriveDrivePrivacyAndMediaSummary');

  const vipConnected = deriveDrivePrivacyAndMediaSummary({
    isConnected: true,
    hasVipEntitlement: true,
    tokenExpired: false,
    isOnline: true,
    cloudPdfCount: 4,
    cloudAudioCount: 2,
    localOnlyCount: 3,
    totalCloudBytes: 5 * 1024 * 1024
  }, true);
  assert.equal(vipConnected.stateTone, 'ok');
  assert.equal(vipConnected.privacyBadge, 'Private-by-Default');
  assert.equal(vipConnected.totalCloudFiles, 6);
  assert.equal(vipConnected.mbUsed, '5.0');
  assert.equal(vipConnected.canAuditPermissions, true);
  assert.match(vipConnected.mediaSummaryLine, /6 Drive synced/);
  assert.match(vipConnected.privacyDetail, /Never public/);

  const freeUser = deriveDrivePrivacyAndMediaSummary({
    isConnected: false,
    hasVipEntitlement: false,
    localOnlyCount: 7
  }, false);
  assert.equal(freeUser.stateTone, 'info');
  assert.equal(freeUser.canAuditPermissions, false);
  assert.match(freeUser.privacyBadge, /خاص افتراضيًا/);
  assert.match(freeUser.nextActionHint, /مجانًا/);

  const expiredOffline = deriveDrivePrivacyAndMediaSummary({
    isConnected: true,
    hasVipEntitlement: true,
    tokenExpired: true,
    isOnline: true
  }, true);
  assert.equal(expiredOffline.stateTone, 'warning');
  assert.equal(expiredOffline.canAuditPermissions, false);
});

test('WP 6.5: deriveSchedulePdfExportSummary builds Printable Paper vs Digital Dark configuration summaries and active page labels', () => {
  const deriveSchedulePdfExportSummary = extractTopLevelHelper('deriveSchedulePdfExportSummary');

  const specs = [
    { labelEn: 'Executive Summary', labelAr: 'الملخص التنفيذي' },
    { labelEn: 'Sat - Mon', labelAr: 'السبت - الاثنين' },
    { labelEn: 'Tue - Thu', labelAr: 'الثلاثاء - الخميس' }
  ];

  const printable = deriveSchedulePdfExportSummary(
    { styleMode: 'pearl_editorial', preset: 'scheduled', title: 'Midterm Sprint', subtitle: 'Week 6', isZoomed: true },
    specs,
    1,
    true
  );
  assert.equal(printable.styleMode, 'pearl_editorial');
  assert.equal(printable.totalPages, 3);
  assert.equal(printable.activePageNumber, 2);
  assert.equal(printable.activePageLabel, 'Sat - Mon');
  assert.match(printable.editionLabel, /Printable Paper/);
  assert.match(printable.zoomLabel, /Zoomed/);
  assert.match(printable.configSummaryText, /3 pages · 300 DPI/);

  const darkAr = deriveSchedulePdfExportSummary(
    { styleMode: 'dark_luxury', preset: 'overview', isZoomed: false },
    specs,
    99,
    false
  );
  assert.equal(darkAr.activePageNumber, 3);
  assert.equal(darkAr.activePageLabel, 'الثلاثاء - الخميس');
  assert.match(darkAr.editionLabel, /النسخة الرقمية الداكنة/);
  assert.match(darkAr.configSummaryText, /300 DPI/);
});

test('WP 6.5: deriveAcademyGuideMetrics & exoResolveSpotlightTourSteps preserve 6-pane guide, 5-station loop, and valid DOM selectors', () => {
  const deriveAcademyGuideMetrics = extractTopLevelHelper('deriveAcademyGuideMetrics');
  const exoResolveSpotlightTourSteps = extractTopLevelHelper('exoResolveSpotlightTourSteps');

  const m = deriveAcademyGuideMetrics(4, 6, true);
  assert.equal(m.activeModule, 4);
  assert.equal(m.progressPct, 67);
  assert.equal(m.panes.length, 6);
  assert.equal(m.closedLoopStations.length, 5);
  assert.equal(m.closedLoopStations[0].label, 'Weekly Goals');
  assert.equal(m.closedLoopStations[4].label, 'Evaluate & Rollover');

  const mAr = deriveAcademyGuideMetrics(99, 6, false);
  assert.equal(mAr.activeModule, 6);
  assert.equal(mAr.closedLoopStations[0].label, 'الأهداف الأسبوعية');

  const enSteps = exoResolveSpotlightTourSteps(true);
  const arSteps = exoResolveSpotlightTourSteps(false);
  assert.equal(enSteps.length, 5);
  assert.equal(arSteps.length, 5);
  for (const s of [...enSteps, ...arSteps]) {
    assert.ok(s.view && s.selector && s.title && s.desc);
    const idMatch = s.selector.match(/^#([A-Za-z0-9_-]+)/);
    assert.ok(idMatch, `Spotlight selector ${s.selector} should target an explicit DOM id`);
    assert.ok(indexHtml.includes(`id="${idMatch[1]}"`), `Target element id="${idMatch[1]}" must exist in index.html`);
  }
});
