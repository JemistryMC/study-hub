// ============================================================================
// Exo Personal Study Journal — Phase 7 / WP 7.1 & Rebuilt Help Center Unit Tests
// Tests pure helpers extracted from index.html via node:test:
//   1. buildExoHelpCenterModel (5 calm sections, EN/AR bilingual integrity, Free/VIP truth,
//      local-save vs cloud-sync honesty, zero dangerous reset/clear-storage advice)
//   2. resolveExoHelpTarget (neutral open vs contextual ? triggers)
//   3. exoHasRealAnnotationContent (strict ink/text/extra-sheet truthiness)
//   4. deriveGoogleDriveDiagnosticsModel (all 9 Drive states, dual badges, redaction)
//   5. exoComputeMobileViewportBudget (15.5% sticky chrome cap & >=44px hitboxes)
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
  ${extractFunctionSource('buildExoHelpCenterModel')}
  ${extractFunctionSource('resolveExoHelpTarget')}
  ${extractFunctionSource('exoComputeMobileViewportBudget')}
  ${extractFunctionSource('deriveGoogleDriveDiagnosticsModel')}
  ${extractFunctionSource('exoHasRealAnnotationContent')}
  return {
    buildExoHelpCenterModel,
    resolveExoHelpTarget,
    exoComputeMobileViewportBudget,
    deriveGoogleDriveDiagnosticsModel,
    exoHasRealAnnotationContent
  };
`);

const h = helpersFactory();

function collectAllModelText(model) {
  const parts = [
    model.header.title, model.header.subtitle, model.header.closeLabel, model.header.supportLabel,
    model.intro.text,
    model.startHere.title, model.startHere.subtitle,
    ...model.startHere.steps.flatMap(s => [s.title, s.desc, s.actionLabel || '']),
    model.guide.title, model.guide.subtitle,
    ...model.guide.groups.flatMap(g => [
      g.title,
      ...g.items.flatMap(it => [it.title, it.summary || '', it.lead || '', ...(it.steps || []), it.outcome || '', it.note || '', it.safety || '', it.actionLabel || '', it.secondaryActionLabel || ''])
    ]),
    model.sync.title, model.sync.subtitle,
    ...model.sync.items.flatMap(it => [it.title, it.summary || '', it.lead || '', ...(it.steps || []), it.outcome || '', it.note || '', it.safety || '', it.actionLabel || '']),
    model.faq.title, model.faq.subtitle,
    ...model.faq.items.flatMap(it => [it.title, it.summary || '', it.lead || '', ...(it.steps || []), it.outcome || '', it.note || '', it.safety || '', it.actionLabel || ''])
  ];
  return parts.join('\n');
}

test('Help Center: buildExoHelpCenterModel defines the exact 5-section editorial structure in EN and AR', () => {
  const en = h.buildExoHelpCenterModel(true);
  const ar = h.buildExoHelpCenterModel(false);
  const arRegex = /[\u0600-\u06FF]/;

  // 1. Intro & Start Here (3 numbered steps)
  assert.ok(en.intro.text.length > 20 && en.intro.text.length < 360, 'EN intro should be 1-2 concise sentences');
  assert.ok(ar.intro.text.length > 20 && ar.intro.text.length < 360, 'AR intro should be 1-2 concise sentences');
  assert.equal(en.startHere.id, 'helpSectionStartHere');
  assert.equal(en.startHere.steps.length, 3);
  assert.equal(ar.startHere.steps.length, 3);
  assert.deepEqual(en.startHere.steps.map(s => s.num), [1, 2, 3]);

  // 2. App Sections Guide (5 logical groups, 10 topics)
  assert.equal(en.guide.id, 'helpSectionGuide');
  assert.equal(en.guide.groups.length, 5);
  assert.equal(ar.guide.groups.length, 5);
  const enTopics = en.guide.groups.flatMap(g => g.items);
  const arTopics = ar.guide.groups.flatMap(g => g.items);
  assert.equal(enTopics.length, 10);
  assert.equal(arTopics.length, 10);
  assert.deepEqual(enTopics.map(t => t.id), arTopics.map(t => t.id), 'EN and AR guide item IDs must stay 1:1 aligned');

  // 3. Sync & Data Protection (4 clear items)
  assert.equal(en.sync.id, 'helpSectionSync');
  assert.equal(en.sync.items.length, 4);
  assert.equal(ar.sync.items.length, 4);
  assert.deepEqual(en.sync.items.map(t => t.id), ar.sync.items.map(t => t.id));

  // 4. Common Questions & Troubleshooting (6 real items)
  assert.equal(en.faq.id, 'helpSectionFaq');
  assert.equal(en.faq.items.length, 6);
  assert.equal(ar.faq.items.length, 6);
  assert.deepEqual(en.faq.items.map(t => t.id), ar.faq.items.map(t => t.id));

  // Strict bilingual purity: zero Arabic characters in EN model, full Arabic in AR model
  const enBlob = collectAllModelText(en);
  const arBlob = collectAllModelText(ar);
  assert.ok(!arRegex.test(enBlob), 'EN Help Center model must contain zero Arabic characters');
  assert.ok(arRegex.test(ar.header.title) && arRegex.test(ar.intro.text) && arRegex.test(ar.startHere.title), 'AR Help Center model must be natively localized in Arabic');
  for (const item of [...arTopics, ...ar.sync.items, ...ar.faq.items]) {
    assert.ok(arRegex.test(item.title), `AR item "${item.id}" title must be Arabic`);
  }
});

test('Help Center: upholds GEMINI.md §6 Free vs VIP policy and §13.4 truthful data-safety rules', () => {
  const en = h.buildExoHelpCenterModel(true);
  const ar = h.buildExoHelpCenterModel(false);
  const enAllLower = collectAllModelText(en).toLowerCase();
  const arAll = collectAllModelText(ar);

  // Free vs VIP accuracy
  const driveTopicEn = en.guide.groups.flatMap(g => g.items).find(it => it.id === 'topic_drive');
  assert.ok(driveTopicEn, 'topic_drive must exist');
  assert.equal(driveTopicEn.secondaryActionId, 'open_vip');
  assert.equal(driveTopicEn.secondaryButtonId, 'helpVipDetailsBtn');
  assert.ok(enAllLower.includes('annotated pdf export'), 'Must explicitly confirm Annotated PDF Export is free');
  assert.ok(enAllLower.includes('extra note sheets') || enAllLower.includes('extra note sheet'), 'Must explicitly confirm multiple Extra Note Sheets are free');
  assert.ok(enAllLower.includes('manual') && enAllLower.includes('vip'), 'Must explain VIP activation is manual');
  assert.ok(!enAllLower.includes('annotated pdf export requires vip'), 'Must never claim Annotated PDF Export requires VIP');

  // Local durable save vs confirmed cloud sync distinction + zero destructive reset/wipe advice
  const syncBlobEn = en.sync.items.map(it => [it.title, it.summary, it.lead, ...(it.steps || []), it.safety || ''].join(' ')).join(' ').toLowerCase();
  assert.ok(syncBlobEn.includes('device') || syncBlobEn.includes('locally'), 'Must distinguish local device save');
  assert.ok(syncBlobEn.includes('cloud') && syncBlobEn.includes('confirm'), 'Must explain cloud sync requires server confirmation');
  // Every mention of clearing browser storage must be an explicit warning against doing so
  assert.ok(enAllLower.includes('never clear browser storage') && enAllLower.includes('do not clear browser storage'),
    'Help Center must explicitly warn users NOT to clear browser storage');
  assert.ok(!/(?<!never\s)(?<!do not\s)(?<!don't\s)clear browser (cache|storage)|delete indexeddb|wipe localstorage|reset the app/i.test(enAllLower),
    'Help Center must never advise clearing browser storage, wiping IndexedDB/LocalStorage, or resetting the app');
  for (const forbiddenAr of ['جرب مسح بيانات المتصفح', 'قم بمسح ذاكرة المتصفح', 'احذف IndexedDB', 'إعادة ضبط التطبيق بالكامل']) {
    assert.ok(!arAll.includes(forbiddenAr), `Arabic Help Center must never advise "${forbiddenAr}"`);
  }
});

test('Help Center: resolveExoHelpTarget maps neutral and contextual ? triggers accurately', () => {
  assert.deepEqual(h.resolveExoHelpTarget(null), { sectionId: 'helpSectionStartHere', itemId: null });
  assert.deepEqual(h.resolveExoHelpTarget(''), { sectionId: 'helpSectionStartHere', itemId: null });
  assert.deepEqual(h.resolveExoHelpTarget(1), { sectionId: 'helpSectionStartHere', itemId: null });
  assert.deepEqual(h.resolveExoHelpTarget(2), { sectionId: 'helpSectionGuide', itemId: 'topic_library' });
  assert.deepEqual(h.resolveExoHelpTarget(3), { sectionId: 'helpSectionGuide', itemId: 'topic_studio' });
  assert.deepEqual(h.resolveExoHelpTarget(4), { sectionId: 'helpSectionGuide', itemId: 'topic_planner' });
  assert.deepEqual(h.resolveExoHelpTarget(5), { sectionId: 'helpSectionGuide', itemId: 'topic_tracker' });
  assert.deepEqual(h.resolveExoHelpTarget('sync'), { sectionId: 'helpSectionSync', itemId: 'sync_how' });
  assert.deepEqual(h.resolveExoHelpTarget('drive'), { sectionId: 'helpSectionGuide', itemId: 'topic_drive' });
  assert.deepEqual(h.resolveExoHelpTarget('backup'), { sectionId: 'helpSectionSync', itemId: 'sync_drive_vs_backup' });
  assert.deepEqual(h.resolveExoHelpTarget('faq_pdf_preview'), { sectionId: 'helpSectionFaq', itemId: 'faq_pdf_preview' });
  assert.deepEqual(h.resolveExoHelpTarget('unknown_token'), { sectionId: 'helpSectionStartHere', itemId: null });
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
