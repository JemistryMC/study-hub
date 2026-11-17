// ============================================================================
// Exo Personal Study Journal — Phase 6 / WP 6.9 Forensic Diagnostics & Freeze Fix Unit Tests
// Covers:
//   1. Fast pure-JS SHA-256 parity vs Node crypto & 1 MB throughput (< 500ms)
//   2. Burst-coalesced IDB conflict recovery migration & immutable cache O(N) speedup
//   3. Bounded 200-entry ring buffer + zero-storage-side-effect + strict secret redaction
//   4. Structural invariants for merged PDF lazy canvases, distant eviction, export yielding,
//      Thumbnails i18n guard, Drive telemetry markers, and bilingual Forensic Export buttons
// ============================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

test('WP 6.9: optimized computePureSha256 matches Node crypto SHA-256 across edge strings & hashes 1 MB quickly', () => {
  const fnSha = extractFunctionSource('computePureSha256');
  const computePureSha256 = new Function(`${fnSha}; return computePureSha256;`)();

  const vectors = [
    '',
    'abc',
    'The quick brown fox jumps over the lazy dog',
    'مساحة عمل إكسو الدراسية 2026 — Pharmacology & Clinical Pharmacy 🧪📚',
    JSON.stringify({ nested: [1, 2, true, null, 'hello\n\t"quotes"\\slash'] })
  ];
  for (const v of vectors) {
    const expected = crypto.createHash('sha256').update(v, 'utf8').digest('hex');
    assert.equal(computePureSha256(v), expected, `SHA-256 mismatch for vector len=${v.length}`);
  }

  const bigStr = 'exo_stroke_payload_abcdef0123456789_'.repeat(30000); // ~1.08 MB
  const expectedBig = crypto.createHash('sha256').update(bigStr, 'utf8').digest('hex');
  const t0 = performance.now();
  const actualBig = computePureSha256(bigStr);
  const dt = performance.now() - t0;
  assert.equal(actualBig, expectedBig, '1 MB SHA-256 must match Node crypto bit-for-bit');
  assert.ok(dt < 500, `1 MB computePureSha256 took too long: ${dt.toFixed(1)} ms`);
});

test('WP 6.9: 100 rapid conflict recovery candidates coalesce into 1 IDB migration with full payload preservation', async () => {
  const fnSanitize = extractFunctionSource('sanitizeRecordItem');
  const fnGet = extractFunctionSource('getConflictRecoveryRecords');
  const fnMerge = extractFunctionSource('mergeConflictRecoveryLists');
  const fnRecord = extractFunctionSource('recordConflictRecoveryCandidate');
  const fnMig = extractFunctionSource('migrateConflictRecoveryToIDB');
  const fnRunMig = extractFunctionSource('_runMigrateConflictRecoveryToIDB');
  const fnFlush = extractFunctionSource('flushPendingConflictRecoveryWrites');
  const fnSha = extractFunctionSource('computePureSha256');
  const fnCanonJson = extractFunctionSource('canonicalizeJson');
  const fnCanonSha = extractFunctionSource('computeCanonicalSha256');

  const lsBacking = new Map();
  const idbBacking = new Map();
  let runMigCount = 0;

  const localStorageMock = {
    get length() { return lsBacking.size; },
    getItem(k) { return lsBacking.has(k) ? lsBacking.get(k) : null; },
    setItem(k, v) { lsBacking.set(String(k), String(v)); },
    removeItem(k) { lsBacking.delete(String(k)); },
    clear() { lsBacking.clear(); }
  };

  const factory = new Function(
    'localStorage',
    'currentCloudUser',
    'inMemoryConflictRecoveryByUid',
    'conflictRecoveryIdbStateByUid',
    'conflictRecoveryQueueByUid',
    'dbInstance',
    `
    ${fnSha}
    ${fnCanonJson}
    ${fnCanonSha}
    function canonicalizeRecoveryValueForDigest(v) {
      return v === undefined ? null : v;
    }
    function normalizeCausalEnvelope(raw, scopeId, label) {
      return {
        operationId: (raw && raw.operationId) ? String(raw.operationId) : (label + '_op_' + scopeId),
        scopeId: scopeId,
        lamportClock: Number(raw && raw.lamportClock || 1),
        wallTimeMs: Number(raw && raw.wallTimeMs || 1000)
      };
    }
    function getCanonicalUserId() { return currentCloudUser ? String(currentCloudUser.id) : 'local'; }
    function getWorkspaceDomainStateKey(domain, uid) { return domain + '::' + uid; }
    function getAccountBackupStorageKey(uid) { return 'pharmaAccountWorkspace_' + uid; }
    function safeSetLocalStorageItem(k, v) { localStorage.setItem(k, v); return true; }
    const _idb = new Map();
    const _idbStores = { workspace_state: _idb };
    const _realDb = {
      objectStoreNames: { contains: (n) => n === 'workspace_state' },
      transaction(storeName, mode) {
        const storeMap = _idbStores[storeName] || _idb;
        const tx = { oncomplete: null, onerror: null, onabort: null };
        tx.objectStore = () => ({
          get(key) {
            const req = { result: storeMap.has(key) ? JSON.parse(JSON.stringify(storeMap.get(key))) : undefined };
            return req;
          },
          put(val) {
            storeMap.set(val.id, JSON.parse(JSON.stringify(val)));
            return { result: val.id };
          },
          delete(key) {
            storeMap.delete(key);
            return {};
          }
        });
        queueMicrotask(() => { if (typeof tx.oncomplete === 'function') tx.oncomplete(); });
        return tx;
      }
    };
    dbInstance = _realDb;
    async function saveWorkspaceDomainStateRecord(rec) {
      await Promise.resolve();
      _idb.set(rec.key, JSON.parse(JSON.stringify(rec)));
      return { ok: true };
    }
    async function getWorkspaceDomainStateRecord(key) {
      await Promise.resolve();
      const hit = _idb.get(key);
      return hit ? JSON.parse(JSON.stringify(hit)) : null;
    }
    async function deleteWorkspaceDomainStateRecord(key) {
      await Promise.resolve();
      _idb.delete(key);
      return true;
    }
    ${fnSanitize}
    ${fnGet}
    ${fnMerge}
    ${fnRecord}
    ${fnMig}
    ${fnRunMig}
    const _origRunMig = _runMigrateConflictRecoveryToIDB;
    _runMigrateConflictRecoveryToIDB = async function(targetUid, opCtx) {
      if (globalThis.__wp69OnRunMig) globalThis.__wp69OnRunMig(targetUid);
      return await _origRunMig(targetUid, opCtx);
    };
    ${fnFlush}
    return {
      recordConflictRecoveryCandidate,
      getConflictRecoveryRecords,
      migrateConflictRecoveryToIDB,
      flushPendingConflictRecoveryWrites,
      getIdbStore: () => _idb
    };
    `
  );

  globalThis.__wp69OnRunMig = () => { runMigCount++; };
  let api;
  try {
    api = factory(
      localStorageMock,
      { id: 'u_wp69_burst' },
      new Map(),
      new Map(),
      new Map(),
      null
    );

    const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      const lecIdx = Math.floor(i / 40) + 1;
      const pgNum = (i % 40) + 1;
      api.recordConflictRecoveryCandidate({
        scopeId: `entity:annotations:lec_${lecIdx}::page_${pgNum}`,
        entityType: 'annotations',
        entityId: `lec_${lecIdx}::page_${pgNum}`,
        reason: 'concurrent_annotation_conflict',
        losingOperationId: `lose_op_${i}`,
        winningOperationId: `win_op_${i}`,
        losingValue: {
          page: pgNum,
          localStrokes: Array.from({ length: 12 }, (_, k) => ({
            id: `s_${i}_${k}`,
            color: '#6b94c8',
            points: [[k * 3, k * 2], [k * 3 + 10, k * 2 + 8]]
          }))
        }
      }, 'u_wp69_burst');
    }
    await api.flushPendingConflictRecoveryWrites('u_wp69_burst');
    const elapsedMs = performance.now() - t0;

    assert.equal(runMigCount, 1, `Expected 100 burst candidates to coalesce into 1 IDB migration (got ${runMigCount})`);
    const recs = api.getConflictRecoveryRecords('u_wp69_burst');
    assert.equal(recs.length, 100, 'All 100 conflict recovery records must be preserved');
    assert.ok(recs.every(r => r.losingValue && Array.isArray(r.losingValue.localStrokes) && r.losingValue.localStrokes.length === 12), 'Deep stroke payloads must remain intact');
    assert.ok(elapsedMs < 1500, `100-conflict burst should finish rapidly (<1500ms), got ${elapsedMs.toFixed(1)}ms`);

    const pointerRaw = localStorageMock.getItem('pharmaConflictRecovery_u_wp69_burst');
    const pointerObj = JSON.parse(pointerRaw);
    assert.equal(pointerObj.__exoIdbMigrated, true);
    assert.equal(pointerObj.count, 100);
    assert.equal(api.getConflictRecoveryRecords('other_uid_iso').length, 0, 'Foreign UID isolation preserved');
  } finally {
    delete globalThis.__wp69OnRunMig;
    if (globalThis.__exoConflictRecoveryCoalescerByUid) globalThis.__exoConflictRecoveryCoalescerByUid.clear();
  }
});

test('WP 6.9: __exoForensicDiag enforces 200-entry ring cap, zero storage side effects, and strict PII/secret redaction', () => {
  const headMatch = indexHtml.match(/<script id="exo-forensic-diag-head">([\s\S]*?)<\/script>/);
  assert.ok(headMatch, 'Expected <script id="exo-forensic-diag-head"> in index.html');

  const listeners = new Map();
  let intervalCount = 0;
  let lsSetCalled = 0;
  const ctx = {
    Math, Date, Array, Object, String, Number, Boolean, RegExp, JSON, Error, Blob: class { constructor(parts) { this.parts = parts; } },
    performance: { now: () => 1234.5, memory: { usedJSHeapSize: 16 * 1024 * 1024 } },
    document: {
      hidden: false,
      documentElement: { lang: 'en' },
      querySelector: () => null,
      getElementsByTagName: (tag) => tag === 'canvas' ? [{ width: 612, height: 792 }, { width: 1, height: 1 }] : [{}, {}, {}],
      addEventListener: () => {}
    },
    localStorage: {
      setItem: () => { lsSetCalled++; },
      getItem: () => null
    },
    addEventListener: (ev, fn) => {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    },
    setInterval: () => { intervalCount++; return { unref: () => {} }; },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {}
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;

  vm.createContext(ctx);
  vm.runInContext(headMatch[1], ctx);

  assert.ok(ctx.__exoForensicDiag, 'window.__exoForensicDiag must initialize immediately');
  assert.equal(ctx.__exoForensicDiag.ringCapacity, 200);
  assert.equal(intervalCount, 1);

  for (let i = 0; i < 250; i++) {
    ctx.__exoForensicDiag.markSyncPhase('pull_sync', 'tick', { count: i, reason: `step_${i}` });
  }

  const secretPayload = 'Fail for student@secret.edu with Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig and ya29.a0AfH6SMabc123 at https://private.supabase.co/rest/v1/user_workspaces?apikey=sb_secret_999&access_token=tok123 from /Users/alice/Downloads/notes.pdf uuid 123e4567-e89b-12d3-a456-426614174000';
  for (const fn of (listeners.get('error') || [])) {
    fn({ message: secretPayload });
  }

  const report = ctx.exoBuildForensicDiagnosticsReport();
  assert.equal(report.schema, 'exo_forensic_diag_v1');
  assert.equal(report.privacyRedacted, true);
  assert.equal(report.storageSideEffects, false);
  assert.equal(lsSetCalled, 0, 'Diagnostics must never write to localStorage');
  assert.equal(report.channels.syncPhases.totalRecorded, 250);
  assert.equal(report.channels.syncPhases.droppedOldest, 50);
  assert.equal(report.channels.syncPhases.entries.length, 200);
  assert.equal(report.channels.syncPhases.entries[0].meta.count, 50);
  assert.equal(report.channels.syncPhases.entries[199].meta.count, 249);
  assert.equal(report.currentSnapshot.canvasCount, 2);
  assert.equal(report.currentSnapshot.allocatedCanvases, 1);

  const reportJson = JSON.stringify(report);
  for (const forbidden of [
    'student@secret.edu',
    'eyJhbGciOiJIUzI1NiJ9',
    'ya29.a0AfH6SMabc123',
    'https://private.supabase.co',
    'sb_secret_999',
    'tok123',
    '/Users/alice',
    '123e4567-e89b-12d3-a456-426614174000'
  ]) {
    assert.ok(!reportJson.includes(forbidden), `Sensitive substring leaked in forensic report: ${forbidden}`);
  }
});

test('WP 6.9: structural freeze-fix & forensic UI contracts exist cleanly in index.html', () => {
  assert.ok(/<div class="pdf-thumbnails-grid" id="pdfThumbnailsGrid" data-exo-no-i18n="1">/.test(indexHtml), '#pdfThumbnailsGrid must carry data-exo-no-i18n="1"');
  assert.ok(indexHtml.includes('id="cloudLoggedOutForensicExportBtn"'), 'Signed-out Cloud modal needs Forensic Export button');
  assert.ok(indexHtml.includes('id="cloudHubForensicExportBtn"'), 'Signed-in Cloud Hub needs Forensic Export button');
  assert.ok(indexHtml.includes('id="exoRecoveryForensicExportBtn"'), 'Recovery status modal needs Forensic Export button');
  assert.ok(indexHtml.includes("markSyncPhase('drive_upload'"), 'Drive upload must record redacted syncPhase breadcrumbs');
  assert.ok(indexHtml.includes("markSyncPhase('drive_download'"), 'Drive download must record redacted syncPhase breadcrumbs');

  const fnMergedStream = extractFunctionSource('renderMergedContinuousLecturesStream');
  assert.ok(fnMergedStream.includes('pdfCanvas.width = 1;') && fnMergedStream.includes('laserCanvas.width = 1;') && fnMergedStream.includes('hasSlideInk ? initW : 1'), 'Merged PDF stream must create lazy 1x1 canvases');

  const fnMergedSingle = extractFunctionSource('renderSingleMergedSlideAtZoom');
  assert.ok(fnMergedSingle.includes('pdfPageRenderGen[compositeKey]') && fnMergedSingle.includes('activePdfRenderTasks[compositeKey]'), 'Merged slide renderer must enforce render generation cancellation');
  assert.ok(fnMergedSingle.includes('offCanvas.width = 0') && fnMergedSingle.includes('Math.abs(rIdx - curIdx) > 16'), 'Merged slide renderer must release offscreen buffer and evict distant canvases (>16)');

  const fnExport = extractFunctionSource('exportAnnotatedSlides');
  assert.ok(fnExport.includes('offCanvas.width = 0;') && fnExport.includes('noteCanvas.width = 0;') && fnExport.includes('setTimeout(resolve, 0)'), 'exportAnnotatedSlides must free per-page canvases and yield to browser loop');
  assert.ok(fnExport.includes('willReadFrequently: true') && fnExport.includes('canvasToJpegUint8Bytes('), 'exportAnnotatedSlides must use willReadFrequently CPU export canvases and async canvasToJpegUint8Bytes');

  assert.ok(/<canvas id="schedulePdfPreviewCanvas" width="1" height="1"/.test(indexHtml), '#schedulePdfPreviewCanvas must boot lazily at 1x1 rather than allocating 27MB upfront');
  const closeModalMatch = indexHtml.match(/function closeModal\([^)]*\)\s*\{[\s\S]*?\n        \}/);
  assert.ok(closeModalMatch && closeModalMatch[0].includes("shareSchedulePdfModalOverlay") && closeModalMatch[0].includes('spCanvas.width = 1'), 'closeModal must reset #schedulePdfPreviewCanvas back to 1x1');

  const fnLoginSync = extractFunctionSource('syncWorkspaceOnLogin');
  assert.ok(fnLoginSync.includes('remoteRowMissingOnline') && fnLoginSync.includes('isCleanSyncedCloudMirror'), 'syncWorkspaceOnLogin must drop obsolete clean mirrors when cloud row is verified absent online');

  const fnPullSync = extractFunctionSource('pullWorkspaceFromCloud');
  assert.ok(fnPullSync.includes('remoteRowMissingOnline') && fnPullSync.includes('isCleanSyncedCloudMirror'), 'pullWorkspaceFromCloud must avoid resurrecting obsolete clean mirrors when cloud row is absent online');

  const fnPushSync = extractFunctionSource('pushWorkspaceToCloud');
  assert.ok(fnPushSync.includes("reason: 'stale_revision_missing_remote_row'"), 'pushWorkspaceToCloud must surface explicit error instead of offline fallback when OCC reports missing remote row');
});

test('WP 6.9: canvasToJpegUint8Bytes uses async canvas.toBlob with toDataURL fallback', async () => {
  const fnDataUrl = extractFunctionSource('dataUrlToUint8Bytes');
  const fnToJpeg = extractFunctionSource('canvasToJpegUint8Bytes');
  const canvasToJpegUint8Bytes = new Function(`${fnDataUrl}\n${fnToJpeg}\nreturn canvasToJpegUint8Bytes;`)();

  let capturedMime = '';
  let capturedQuality = 0;
  const toBlobBytes = await canvasToJpegUint8Bytes({
    toBlob(cb, mime, quality) {
      capturedMime = mime;
      capturedQuality = quality;
      cb({
        async arrayBuffer() {
          return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 42]).buffer;
        }
      });
    },
    toDataURL() {
      throw new Error('should not fall back when toBlob succeeds');
    }
  }, 0.88);
  assert.equal(capturedMime, 'image/jpeg');
  assert.equal(capturedQuality, 0.88);
  assert.deepEqual(Array.from(toBlobBytes), [0xff, 0xd8, 0xff, 0xe0, 42]);

  const rawFallback = Buffer.from([0xff, 0xd8, 1, 2, 3]).toString('base64');
  const fallbackBytes = await canvasToJpegUint8Bytes({
    toBlob(cb) { cb(null); },
    toDataURL() { return `data:image/jpeg;base64,${rawFallback}`; }
  }, 0.92);
  assert.deepEqual(Array.from(fallbackBytes), [0xff, 0xd8, 1, 2, 3]);
});

test('WP 6.9: __exoForensicDiag.recordError redacts secrets cleanly and enforces bounded ring', () => {
  const headMatch = indexHtml.match(/<script id="exo-forensic-diag-head">([\s\S]*?)<\/script>/);
  assert.ok(headMatch, 'Expected <script id="exo-forensic-diag-head"> in index.html');
  const ctx = {
    Math, Date, Array, Object, String, Number, Boolean, RegExp, JSON, Error, Blob: class { constructor(parts) { this.parts = parts; } },
    performance: { now: () => 50, memory: { usedJSHeapSize: 1024 } },
    document: { hidden: false, documentElement: { lang: 'en' }, querySelector: () => null, getElementsByTagName: () => [], addEventListener: () => {} },
    localStorage: { setItem: () => {}, getItem: () => null },
    addEventListener: () => {},
    setInterval: () => ({ unref: () => {} }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {}
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(headMatch[1], ctx);

  assert.equal(typeof ctx.__exoForensicDiag.recordError, 'function');
  for (let i = 0; i < 205; i++) {
    ctx.__exoForensicDiag.recordError('cloud_sync', `fail_${i} student@mail.org Bearer eyJhbGciOiJIUzI1NiJ9.a.b https://db.supabase.co/rest?apikey=k123`);
  }
  const rep = ctx.exoBuildForensicDiagnosticsReport();
  assert.equal(rep.channels.errors.entries.length, 200);
  const json = JSON.stringify(rep.channels.errors.entries);
  assert.ok(!json.includes('student@mail.org') && !json.includes('eyJhbGciOiJIUzI1NiJ9') && !json.includes('https://db.supabase.co'));
});

