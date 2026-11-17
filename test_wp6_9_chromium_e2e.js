// ============================================================================
// Exo Personal Study Journal — Phase 6 / WP 6.9 Forensic Diagnostics & Freeze Fix E2E
// Real Headless Chromium + IndexedDB (offline-mocked Supabase/Drive/PDF.js shim):
//   1. Bounded forensic diagnostics + strict PII/secret redaction + UI export
//      buttons (#cloudLoggedOutForensicExportBtn, #cloudHubForensicExportBtn,
//      #exoRecoveryForensicExportBtn) with zero LS/IDB schema writes
//   2. Probe C Freeze Regression: signed-in OCC merge of 3x40 = 120 divergent
//      page annotation conflicts completes fast without main-thread hang
//   3. Probe A & E Canvas/Export Regression: 120-page merged continuous stream
//      bounds initial canvas allocation (<= 24) & distant slide eviction,
//      and 40-page exportAnnotatedSlides yields per page and frees canvases
//   4. Clean-Slate Recovery & Canvas Release: cleared-cloud non-resurrection,
//      dirty draft preservation, OCC missing-remote-row explicit error, and
//      lazy #schedulePdfPreviewCanvas 1x1 boot & close release
//   5. Heavy Tier D Interactive Navigation, EN/AR Toggle & Studio Stress
// ============================================================================

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

function resolveChromiumLaunchOptions() {
  const opts = { headless: true };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    opts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    return opts;
  }
  try {
    const defaultPath = chromium.executablePath();
    if (defaultPath && fs.existsSync(defaultPath)) return opts;
  } catch {}
  const fallbackPaths = [
    '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome'
  ];
  for (const candidate of fallbackPaths) {
    if (fs.existsSync(candidate)) {
      opts.executablePath = candidate;
      break;
    }
  }
  return opts;
}

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${testName}${details ? ' (' + details + ')' : ''}`);
    testsFailed++;
  }
}

function checkServerListening(port = 3000) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureLocalServerRunning() {
  const alreadyUp = await checkServerListening(3000);
  if (alreadyUp) return null;
  const proc = spawn('node', ['server.js'], { cwd: __dirname, stdio: 'ignore' });
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (await checkServerListening(3000)) return proc;
  }
  throw new Error('Failed to start local server on port 3000');
}

const WP69_INIT_SCRIPT = `
(function() {
  function countPdfPagesFromData(data) {
    try {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data || []);
      const str = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 4096)));
      const m = str.match(/\\/Count\\s+(\\d+)/);
      if (m) return Math.max(1, Number(m[1]));
      const kids = str.match(/\\/Type\\s*\\/Page\\b/g);
      if (kids && kids.length) return kids.length;
    } catch (e) {}
    return 40;
  }
  window.pdfjsLib = {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: function(opts) {
      const total = countPdfPagesFromData(opts && opts.data);
      const doc = {
        numPages: total,
        destroy: async function() {},
        getPage: async function(pageNum) {
          return {
            rotate: 0,
            getViewport: function({ scale }) {
              const s = Number(scale) || 1;
              return { width: Math.round(612 * s), height: Math.round(792 * s) };
            },
            render: function({ canvasContext, viewport }) {
              if (canvasContext) {
                canvasContext.fillStyle = '#ffffff';
                canvasContext.fillRect(0, 0, viewport.width, viewport.height);
                canvasContext.fillStyle = '#191B1D';
                canvasContext.font = 'bold 20px sans-serif';
                canvasContext.fillText('EXO Slide ' + pageNum + ' / ' + total, 48, 80);
              }
              return { promise: Promise.resolve() };
            },
            getTextContent: async function() {
              return { items: [{ str: 'Slide ' + pageNum, transform: [12, 0, 0, 12, 48, 700], width: 90, height: 14 }] };
            }
          };
        }
      };
      return { promise: Promise.resolve(doc), destroy: async function() {} };
    }
  };
  window.PDFLib = {
    PDFDocument: {
      create: async function() {
        const pages = [];
        return {
          embedPng: async function() { return { width: 612, height: 792 }; },
          addPage: function(size) {
            const p = { size, drawImage: function() {} };
            pages.push(p);
            return p;
          },
          save: async function() {
            return new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, pages.length & 0xff]);
          }
        };
      }
    }
  };
  window.supabase = {
    createClient: function() {
      return {
        auth: {
          getSession: async function() { return { data: { session: null }, error: null }; },
          onAuthStateChange: function() { return { data: { subscription: { unsubscribe: function() {} } } }; }
        },
        from: function() {
          return {
            select: function() { return this; },
            eq: function() { return this; },
            maybeSingle: async function() { return { data: null, error: null }; }
          };
        },
        rpc: async function() { return { data: { status: 'synced', new_revision: 2 }, error: null }; }
      };
    }
  };
})();
`;

async function run() {
  let serverProc = null;
  let browser = null;
  try {
    serverProc = await ensureLocalServerRunning();
    browser = await chromium.launch(resolveChromiumLaunchOptions());
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });

    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith('http://localhost:3000') || url.startsWith('http://127.0.0.1:3000') || url.startsWith('data:') || url.startsWith('blob:')) {
        await route.continue();
        return;
      }
      if (url.includes('supabase.co') || url.includes('googleapis.com') || url.includes('accounts.google.com')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.abort();
    });

    await context.addInitScript(WP69_INIT_SCRIPT);
    const page = await context.newPage();

    const pageErrors = [];
    page.on('pageerror', (err) => {
      if (!err.message.includes('WP69_SYNTHETIC_ERR')) {
        pageErrors.push(err.message);
      }
    });

    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof exoExportForensicDiagnosticsJson === 'function' && typeof mergeAndApplyCloudConflict === 'function');

    // =========================================================================
    // CASE 1: Forensic Diagnostics & Secret Redaction + UI Export Buttons
    // =========================================================================
    console.log('\n[WP 6.9 E2E] Case 1: Forensic diagnostics capture, secret redaction & UI exports');
    const downloads = [];
    page.on('download', (dl) => downloads.push(dl));

    const diagRes = await page.evaluate(async () => {
      const lsBefore = Object.keys(localStorage).sort();
      setTimeout(() => {
        throw new Error('WP69_SYNTHETIC_ERR student@secret.edu Bearer eyJhbGciOiJIUzI1NiJ9.aaa.bbb ya29.secretToken999 https://private.example.com/?apikey=mykey123 /Users/alice/doc.pdf 123e4567-e89b-12d3-a456-426614174000');
      }, 0);
      await new Promise(r => setTimeout(r, 80));

      const report = window.exoBuildForensicDiagnosticsReport();
      const lsAfterBuild = Object.keys(localStorage).sort();

      // Open Cloud modal logged out and click export button
      openCloudAuthModal();
      const loggedOutBtn = document.getElementById('cloudLoggedOutForensicExportBtn');
      const loggedOutVisible = Boolean(loggedOutBtn && loggedOutBtn.offsetParent !== null);
      if (loggedOutBtn) loggedOutBtn.click();
      await new Promise(r => setTimeout(r, 60));
      closeModal('cloudAuthModalOverlay');

      // Open Recovery modal and click export button
      if (typeof openExoRecoveryModal === 'function') openExoRecoveryModal('');
      const recBtn = document.getElementById('exoRecoveryForensicExportBtn');
      const recVisible = Boolean(recBtn && recBtn.offsetParent !== null);
      if (recBtn) recBtn.click();
      await new Promise(r => setTimeout(r, 60));
      closeModal('exoRecoveryModalOverlay');

      return {
        reportJson: JSON.stringify(report),
        schema: report.schema,
        storageSideEffects: report.storageSideEffects,
        privacyRedacted: report.privacyRedacted,
        lsUnchanged: JSON.stringify(lsBefore) === JSON.stringify(lsAfterBuild),
        errCount: report.channels.errors.entries.length,
        loggedOutVisible,
        recVisible
      };
    });

    assert(diagRes.schema === 'exo_forensic_diag_v1', 'Forensic report schema equals exo_forensic_diag_v1');
    assert(diagRes.storageSideEffects === false && diagRes.lsUnchanged, 'Building forensic report introduces zero localStorage schema side effects');
    assert(diagRes.privacyRedacted === true && diagRes.errCount >= 1, 'Synthetic uncaught error recorded cleanly in error ring buffer');
    assert(diagRes.loggedOutVisible && diagRes.recVisible, 'Forensic export buttons visible in Cloud Auth modal and Recovery modal');
    assert(downloads.length >= 2 && downloads[0].suggestedFilename().startsWith('exo-forensic-diagnostics-'), `UI export buttons trigger forensic .json downloads (count=${downloads.length})`);

    let leaked = [];
    for (const secret of ['student@secret.edu', 'eyJhbGciOiJIUzI1NiJ9', 'ya29.secretToken999', 'https://private.example.com', 'mykey123', '/Users/alice', '123e4567-e89b-12d3-a456-426614174000']) {
      if (diagRes.reportJson.includes(secret)) leaked.push(secret);
    }
    assert(leaked.length === 0, 'Forensic diagnostic export leaks zero PII/tokens/URLs/paths', `leaked=${leaked.join(',')}`);

    // Test Arabic label localization for logged-out button
    await page.evaluate(() => {
      if (typeof applyExoLanguage === 'function') applyExoLanguage('ar');
    });
    const arExportLbl = await page.locator('#cloudLoggedOutForensicExportBtn .exo-forensic-export-lbl').textContent();
    assert(arExportLbl.includes('تصدير سجل التشخيص'), `Forensic export label localized cleanly in AR (${arExportLbl})`);
    await page.evaluate(() => {
      if (typeof applyExoLanguage === 'function') applyExoLanguage('en');
    });

    // =========================================================================
    // CASE 2: Probe C Regression — 120-Page OCC Conflict Merge & IDB Migration
    // =========================================================================
    console.log('\n[WP 6.9 E2E] Case 2: Probe C OCC conflict merge (3x40 = 120 divergent pages)');
    const probeC = await page.evaluate(async () => {
      const uid = 'wp69_user_probe_c';
      await handleAuthSessionChange({ id: uid, email: 'probe@exo.local' }, 'SIGNED_IN');

      const buildAnns = (tag) => {
        const map = {};
        for (let l = 1; l <= 3; l++) {
          const pages = {};
          for (let p = 1; p <= 40; p++) {
            pages[String(p)] = Array.from({ length: 12 }, (_, sIdx) => ({
              tool: 'pen',
              color: tag === 'local' ? '#6b94c8' : '#d7b96f',
              size: 3,
              points: [{ x: 0.1 + sIdx * 0.01, y: 0.2 }, { x: 0.5 + sIdx * 0.01, y: 0.6 }, { x: 0.9, y: 0.8 }]
            }));
          }
          map[`lec_pc_${l}`] = pages;
        }
        return map;
      };

      subjects = [{
        id: 'sub_pc_1',
        name: 'Pharmacology',
        groups: [{
          id: 'grp_pc_1',
          name: 'Chapter 1',
          lectures: [1, 2, 3].map(l => ({ id: `lec_pc_${l}`, title: `Lec ${l}`, completed: false }))
        }]
      }];

      await restoreAllAnnotationsMapToDB(buildAnns('local'), uid);
      const localPayload = {
        user_id: uid,
        subjects,
        schedule: { version: 3, events: [], backlog: [], weeklyReports: [] },
        logs: []
      };
      const remoteRow = {
        user_id: uid,
        revision: 5,
        updated_at: new Date().toISOString(),
        subjects,
        schedule: { version: 3, events: [], backlog: [], weeklyReports: [] },
        logs: [],
        annotations: buildAnns('cloud')
      };

      const t0 = performance.now();
      await mergeAndApplyCloudConflict(remoteRow, localPayload);
      await flushPendingConflictRecoveryWrites(uid);
      const durMs = Math.round(performance.now() - t0);

      const recs = getConflictRecoveryRecords(uid);
      const report = window.exoBuildForensicDiagnosticsReport();
      const migPhases = report.channels.syncPhases.entries.filter(e => e.phase === 'conflict_recovery_migration');

      return {
        durMs,
        recCount: recs.length,
        migCommitted: migPhases.some(p => p.status === 'committed'),
        hubVisibleWhenOpen: (() => {
          openCloudAuthModal();
          const btn = document.getElementById('cloudHubForensicExportBtn');
          const ok = Boolean(btn && btn.offsetParent !== null);
          closeModal('cloudAuthModalOverlay');
          return ok;
        })()
      };
    });

    assert(probeC.durMs < 8000, `120-page OCC conflict merge + IDB migration completed cleanly (${probeC.durMs} ms < 8000 ms)`);
    assert(probeC.recCount === 120, `All 120 conflict recovery records preserved across IDB migration (got ${probeC.recCount})`);
    assert(probeC.migCommitted, 'Forensic syncPhases logged conflict_recovery_migration committed');
    assert(probeC.hubVisibleWhenOpen, 'Signed-in Cloud Hub shows Forensic Export button');

    // =========================================================================
    // CASE 3: Probe A & Probe E Regression — 120p Merged Stream & 40p Export
    // =========================================================================
    console.log('\n[WP 6.9 E2E] Case 3: Probe A (120p merged canvas memory) & Probe E (40p export yield/cleanup)');
    const probeAE = await page.evaluate(async () => {
      const uid = 'wp69_user_probe_c';
      await handleAuthSessionChange({ id: uid, email: 'probe@exo.local' }, 'SIGNED_IN');

      function makeDummyPdfBlob(pageCount) {
        const body = `%PDF-1.4\n1 0 obj << /Type /Pages /Count ${pageCount} >> endobj\n%%EOF`;
        return new Blob([new TextEncoder().encode(body)], { type: 'application/pdf' });
      }

      const lecs = [1, 2, 3].map(i => ({ id: `lec_m_${i}`, title: `Merged Lec ${i}`, hasPdf: true, completed: false }));
      subjects = [{ id: 'sub_pa', name: 'Cardiology', groups: [{ id: 'grp_pa', name: 'Unit 1', lectures: lecs }] }];
      for (const l of lecs) {
        await saveMediaToDB('pdfs', l.id, makeDummyPdfBlob(40));
      }
      localMediaCache.pdfs = new Set(lecs.map(l => l.id));

      await openMergedSubjectLecturesStudio(['lec_m_1', 'lec_m_2', 'lec_m_3'], 'sub_pa');
      await new Promise(r => setTimeout(r, 250));
      const snapInitial = window.__exoForensicDiag.captureCanvasSnapshot('wp69_merged_open');

      await changePdfZoom(0.25);
      await new Promise(r => setTimeout(r, 120));
      const key115 = mergedSlideKeysOrder[114];
      await renderSingleMergedSlideAtZoom(key115);
      await new Promise(r => setTimeout(r, 120));
      const snapAfterJump = window.__exoForensicDiag.captureCanvasSnapshot('wp69_merged_jump_115');

      closePdfViewer();
      await new Promise(r => setTimeout(r, 80));
      const snapClosed = window.__exoForensicDiag.captureCanvasSnapshot('wp69_merged_closed');

      // Now open 40-page single lecture & export annotated PDF (Probe E)
      activeSubjectId = 'sub_pa';
      await openLectureDocument('grp_pa', 'lec_m_1');
      await new Promise(r => setTimeout(r, 200));
      const ltStartCount = window.__exoForensicDiag.rings.longTasks.totalCount();
      const expT0 = performance.now();
      await exportAnnotatedSlides();
      const expMs = Math.round(performance.now() - expT0);
      await new Promise(r => setTimeout(r, 50));
      const ltEntries = window.__exoForensicDiag.rings.longTasks.toArray().slice(Math.max(0, window.__exoForensicDiag.rings.longTasks.toArray().length - (window.__exoForensicDiag.rings.longTasks.totalCount() - ltStartCount)));
      const maxExpLt = ltEntries.reduce((m, e) => Math.max(m, e.durMs || 0), 0);
      closePdfViewer();

      const reportAfter = window.exoBuildForensicDiagnosticsReport();
      const exportDone = reportAfter.channels.syncPhases.entries.some(e => e.phase === 'pdf_export' && e.status === 'done');

      return {
        initAlloc: snapInitial.allocatedCanvases,
        initMb: snapInitial.estimatedCanvasRgbaMB,
        jumpAlloc: snapAfterJump.allocatedCanvases,
        closedPdfWrapperCount: document.querySelectorAll('#pdfPagesScrollContainer .pdf-page-wrapper').length,
        expMs,
        maxExpLt,
        exportDone
      };
    });

    assert(probeAE.initAlloc <= 24 && probeAE.initMb < 45, `120-page merged stream bounds initial canvas allocation (alloc=${probeAE.initAlloc}, ${probeAE.initMb} MB vs prior 360/402.7 MB)`);
    assert(probeAE.jumpAlloc <= 30, `Distant canvas eviction bounds allocation after jumping to slide 115 (alloc=${probeAE.jumpAlloc})`);
    assert(probeAE.closedPdfWrapperCount === 0, 'closePdfViewer clears PDF DOM cleanly');
    assert(probeAE.exportDone && probeAE.maxExpLt < 1500, `40-page exportAnnotatedSlides completed & stayed non-blocking (wall=${probeAE.expMs}ms, maxLT=${probeAE.maxExpLt}ms vs prior 4226ms)`);

    // =========================================================================
    // CASE 4: Cleared-Cloud Non-Resurrection, OCC Missing-Row Error & Lazy Schedule Canvas
    // =========================================================================
    console.log('\n[WP 6.9 E2E] Case 4: Cleared-cloud isolation, OCC rev=0 error & lazy schedule canvas');
    const case4 = await page.evaluate(async () => {
      if (typeof initDB === 'function') await initDB();

      const schedCanvas = document.getElementById('schedulePdfPreviewCanvas');
      const schedBootW = schedCanvas ? schedCanvas.width : -1;
      const schedBootH = schedCanvas ? schedCanvas.height : -1;
      if (typeof openShareSchedulePdfModal === 'function') openShareSchedulePdfModal();
      await new Promise(r => setTimeout(r, 60));
      const schedOpenW = schedCanvas ? schedCanvas.width : -1;
      if (typeof closeModal === 'function') closeModal('shareSchedulePdfModalOverlay');
      await new Promise(r => setTimeout(r, 40));
      const schedClosedW = schedCanvas ? schedCanvas.width : -1;

      const repInit = window.exoBuildForensicDiagnosticsReport();
      const migEntries = repInit.channels.syncPhases.entries.filter(e => e.phase === 'conflict_recovery_migration');
      const migClosedCleanly = migEntries.some(e => e.status === 'skipped' || e.status === 'committed' || e.status === 'aborted');

      const uidClean = 'wp69_e2e_clean_wipe';
      const committedSub = {
        id: 'old_pre_wipe_sub',
        name: 'Pre-Wipe Ghost Subject',
        groups: [],
        _causal: {
          operationId: 'op_clean_1',
          scopeId: 'entity:subjects:old_pre_wipe_sub',
          lamportClock: 3,
          wallTimeMs: 1700000000000,
          dirty: false,
          committedWorkspaceRevision: 15
        }
      };
      localStorage.setItem('pharmaLastActiveCloudUid', uidClean);
      localStorage.setItem('pharmaLastActiveUserIdV1', uidClean);
      localStorage.setItem('pharmaWorkspaceRevision_' + uidClean, '15');
      localStorage.setItem('pharmaAccountWorkspace_' + uidClean, JSON.stringify({
        schemaVersion: 2,
        user_id: uidClean,
        revision: 15,
        dirty: false,
        annotationsStoredInIndexedDB: true,
        subjects: [committedSub],
        schedule: { version: 3, events: [], backlog: [], weeklyReports: [] },
        logs: []
      }));

      supabaseClient = {
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
        rpc: async () => ({ data: { status: 'success', revision: 1 }, error: null })
      };
      subjects = [JSON.parse(JSON.stringify(committedSub))];
      scheduleEvents = [];
      scheduleBacklog = [];
      logs = [];

      await handleAuthSessionChange({ id: uidClean, email: 'clean_e2e@exo.local' }, true);
      await new Promise(r => setTimeout(r, 120));
      const cleanResurrected = subjects.length;
      const revResetTo = localStorage.getItem('pharmaWorkspaceRevision_' + uidClean);

      // OCC conflict with current_revision: 0 and freshRemote: null must return explicit error (not offline)
      supabaseClient.rpc = async () => ({ data: { status: 'conflict', current_revision: 0 }, error: null });
      localStorage.setItem('pharmaWorkspaceRevision_' + uidClean, '15');
      subjects = [{ id: 'fresh_post_wipe', name: 'New Post-Wipe Subject', groups: [] }];
      localStorage.setItem('pharmaWorkspaceDirty', '1');
      localStorage.setItem('pharmaWorkspaceDirty_' + uidClean, '1');
      const occMissingRes = await pushWorkspaceToCloud(false, false);

      // Dirty local work must still be preserved when cloud row is absent
      const uidDirty = 'wp69_e2e_dirty_keep';
      supabaseClient.rpc = async () => ({ data: { status: 'success', revision: 1 }, error: null });
      localStorage.setItem('pharmaLastActiveCloudUid', uidDirty);
      localStorage.setItem('pharmaLastActiveUserIdV1', uidDirty);
      localStorage.setItem('pharmaWorkspaceRevision_' + uidDirty, '15');
      localStorage.setItem('pharmaWorkspaceDirty_' + uidDirty, '1');
      localStorage.setItem('pharmaAccountWorkspace_' + uidDirty, JSON.stringify({
        schemaVersion: 2,
        user_id: uidDirty,
        revision: 15,
        dirty: true,
        annotationsStoredInIndexedDB: true,
        subjects: [committedSub],
        schedule: { version: 3, events: [], backlog: [], weeklyReports: [] },
        logs: []
      }));
      subjects = [JSON.parse(JSON.stringify(committedSub))];
      await handleAuthSessionChange({ id: uidDirty, email: 'dirty_e2e@exo.local' }, true);
      await new Promise(r => setTimeout(r, 100));
      const dirtyPreservedLen = subjects.length;

      await handleAuthSessionChange(null, false);
      supabaseClient = null;
      localStorage.clear();
      subjects = [];
      scheduleEvents = [];
      scheduleBacklog = [];
      logs = [];

      return {
        schedBootW,
        schedBootH,
        schedOpenW,
        schedClosedW,
        migClosedCleanly,
        cleanResurrected,
        revResetTo,
        occMissingRes,
        dirtyPreservedLen
      };
    });

    assert(case4.schedBootW === 1 && case4.schedBootH === 1 && case4.schedOpenW > 1000 && case4.schedClosedW === 1, `Schedule PDF preview canvas boots lazily (1x1), renders when open (${case4.schedOpenW}), and resets on close (${case4.schedClosedW})`);
    assert(case4.migClosedCleanly, 'conflict_recovery_migration syncPhase transitions cleanly to terminal state');
    assert(case4.cleanResurrected === 0 && case4.revResetTo === '1', `Cleared cloud drops clean pre-wipe mirror without resurrection (subjects=${case4.cleanResurrected}, rev=${case4.revResetTo})`);
    assert(case4.occMissingRes && case4.occMissingRes.status === 'error' && case4.occMissingRes.reason === 'stale_revision_missing_remote_row', `OCC missing-remote-row returns explicit error instead of offline fallback (${JSON.stringify(case4.occMissingRes)})`);
    assert(case4.dirtyPreservedLen === 1, 'Dirty unsynced local draft is preserved on empty cloud');

    // =========================================================================
    // CASE 5: Heavy Tier D Interactive Navigation, EN/AR Toggle & Studio Stress
    // =========================================================================
    console.log('\n[WP 6.9 E2E] Case 5: Tier D interactive view/language stress & Studio open/close');
    const case5 = await page.evaluate(async () => {
      const stressSubs = Array.from({ length: 15 }, (_, s) => ({
        id: `sub_s_${s}`,
        name: `Subject ${s + 1}`,
        groups: [{
          id: `grp_s_${s}`,
          name: `Chapter ${s + 1}`,
          lectures: Array.from({ length: 20 }, (_, l) => ({
            id: `lec_s_${s}_${l}`,
            title: `Lecture ${s + 1}.${l + 1}`,
            completed: l % 3 === 0,
            hasPdf: l === 0
          }))
        }]
      }));
      const stressEvents = Array.from({ length: 240 }, (_, i) => ({
        id: `ev_s_${i}`,
        title: `Study Block ${i + 1}`,
        day: i % 7,
        startHour: 8 + (i % 10),
        duration: 1.5,
        subjectId: `sub_s_${i % 15}`,
        completed: i % 2 === 0
      }));
      const stressLogs = Array.from({ length: 400 }, (_, i) => ({
        id: `log_s_${i}`,
        date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
        subjectId: `sub_s_${i % 15}`,
        durationMinutes: 45,
        notes: `Review notes #${i + 1}`
      }));

      subjects = stressSubs;
      scheduleEvents = stressEvents;
      logs = stressLogs;
      localMediaCache.pdfs.add('lec_s_0_0');
      const pdfStr = '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Count 5 >> endobj\n%%EOF';
      await saveMediaToDB('pdfs', 'lec_s_0_0', new Blob([new TextEncoder().encode(pdfStr)], { type: 'application/pdf' }));

      const ltStart = window.__exoForensicDiag.rings.longTasks.totalCount();
      const t0 = performance.now();

      for (const tab of ['today', 'subjects', 'schedule', 'tracker']) {
        const navEl = document.querySelector(`.sidebar-nav-item[data-tab="${tab}"]`);
        switchView(tab, navEl);
        await new Promise(r => setTimeout(r, 30));
      }
      for (const lang of ['ar', 'en', 'ar', 'en']) {
        applyExoLanguage(lang);
        await new Promise(r => setTimeout(r, 30));
      }

      activeSubjectId = 'sub_s_0';
      for (let k = 0; k < 3; k++) {
        await openLectureDocument('grp_s_0', 'lec_s_0_0');
        await new Promise(r => setTimeout(r, 60));
        closePdfViewer();
        await new Promise(r => setTimeout(r, 30));
      }

      const wallMs = Math.round(performance.now() - t0);
      await new Promise(r => setTimeout(r, 50));
      const ltDelta = window.__exoForensicDiag.rings.longTasks.totalCount() - ltStart;
      const newLts = ltDelta > 0 ? window.__exoForensicDiag.rings.longTasks.toArray().slice(-ltDelta) : [];
      const maxLt = newLts.reduce((m, e) => Math.max(m, e.durMs || 0), 0);
      const finalSnap = window.__exoForensicDiag.captureCanvasSnapshot('wp69_case5_end');

      return {
        wallMs,
        maxLt,
        allocAfter: finalSnap.allocatedCanvases,
        mbAfter: finalSnap.estimatedCanvasRgbaMB,
        lang: document.documentElement.lang,
        dir: document.documentElement.dir
      };
    });

    assert(case5.maxLt < 1500 && case5.allocAfter <= 6 && case5.lang === 'en' && case5.dir === 'ltr', `Tier D interactive stress & Studio open/close stayed responsive (wall=${case5.wallMs}ms, maxLT=${case5.maxLt}ms, alloc=${case5.allocAfter}, ${case5.mbAfter} MB)`);
    assert(pageErrors.length === 0, `Zero unexpected uncaught page errors (${pageErrors.join('; ')})`);

    await context.close();
  } catch (err) {
    console.error('[WP 6.9 E2E] Fatal Error:', err);
    testsFailed++;
  } finally {
    if (browser) await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log(`\nPASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  process.exit(testsFailed > 0 ? 1 : 0);
}

run();
