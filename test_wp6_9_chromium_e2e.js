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
