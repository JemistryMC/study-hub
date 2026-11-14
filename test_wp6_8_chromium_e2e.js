// ============================================================================
// Exo Personal Study Journal — Phase 6 / WP 6.8 Runtime Stabilization Chromium E2E
// Real Headless Chromium + IndexedDB stress-tier E2E verification:
//   1. Bounded startup & idle stability on stress dataset (900 lecs, 480 events, 1000 logs)
//   2. Chapter Workspace search input preserves focus & value across rapid typing
//   3. 120-page PDF Studio: deferred thumbnails, lazy Extra Note HiDPI canvas sizing,
//      scroll + zoom + pen stroke + synchronous closePdfViewer (<50ms)
//   4. Planner Week O(N) bucketing & Goals progressive windowing (#exoShowMoreGoalsBtn)
//   5. Tracker 1,000-log collapsed accordion omission + accurate full-set KPI (#statTotalLogs)
//      + offscreen DOM unmounting on view switch
//   6. View-scoped EN <-> AR translation translates hidden views & modals lazily on arrival
//   7. 20 rapid navigation cycles end-to-end with zero DOM/heap leak & zero runtime errors
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

const STRESS_INIT_SCRIPT = `
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
    return 5;
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

  window.__wp68E2E = { longTasks: [], bodyMutations: 0 };
  try {
    if (typeof PerformanceObserver !== 'undefined') {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__wp68E2E.longTasks.push(Number(entry.duration.toFixed(1)));
        }
      }).observe({ entryTypes: ['longtask'] });
    }
  } catch (e) {}
  window.addEventListener('DOMContentLoaded', () => {
    try {
      new MutationObserver((muts) => {
        window.__wp68E2E.bodyMutations += muts.length;
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) {}
  });
})();
`;

const SUPABASE_MINIMAL_MOCK = `
(function() {
  window.supabase = {
    createClient: function() {
      return {
        auth: {
          getSession: async function() { return { data: { session: null }, error: null }; },
          onAuthStateChange: function() { return { data: { subscription: { unsubscribe: function() {} } } }; }
        },
        from: function() {
          return { select: function() { return this; }, eq: function() { return this; }, maybeSingle: async function() { return { data: null, error: null }; } };
        },
        rpc: async function() { return { data: null, error: null }; }
      };
    }
  };
})();
`;

const GOOGLE_MINIMAL_MOCK = `
(function() {
  window.google = { accounts: { oauth2: { initTokenClient: function() { return { requestAccessToken: function() {} }; } } } };
})();
`;

async function installOfflineRoutes(page) {
  await page.route((u) => u.protocol === 'https:', async (route) => {
    const url = route.request().url();
    if (url.includes('pdf.min.js')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* shimmed via initScript */' });
    }
    if (url.includes('@supabase/supabase-js')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: SUPABASE_MINIMAL_MOCK });
    }
    if (url.includes('accounts.google.com/gsi/client')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: GOOGLE_MINIMAL_MOCK });
    }
    if (url.startsWith('https://fonts.googleapis.com') || url.includes('font-awesome') || url.endsWith('.css')) {
      return route.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed css */' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function seedStressDataset(page) {
  await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('exo_lang', 'en');
    const subs = [];
    let lecSeq = 1;
    let firstLecId = null;
    for (let s = 1; s <= 10; s++) {
      const groups = [];
      for (let g = 1; g <= 9; g++) {
        const lectures = [];
        for (let l = 1; l <= 10; l++) {
          const lid = 100000 + lecSeq++;
          if (!firstLecId) firstLecId = lid;
          lectures.push({
            id: lid,
            title: `Lecture ${s}.${g}.${l}`,
            path: (s === 1 && g === 1 && l === 1) ? 'stress_120_slides.pdf' : '',
            audioPath: '',
            duration: 45,
            completed: l % 3 === 0,
            lastPageNum: l === 1 ? 3 : 1,
            totalPages: 120,
            lastStudiedAt: (s === 1 && g === 1 && l === 1) ? Date.now() - 3600000 : 0,
            reviewCount: l % 3 === 0 ? 1 : 0
          });
        }
        groups.push({ id: 20000 + s * 100 + g, name: `Chapter ${g}`, lectures });
      }
      subs.push({ id: 1000 + s, name: `Course ${s}`, isContinuous: false, groups });
    }

    const evs = [];
    const evTypes = ['important', 'practice', 'review', 'catchup', 'urgent', 'mandatory', 'wasted'];
    const goals = [];
    for (let i = 1; i <= 90; i++) {
      goals.push({
        id: 80000 + i,
        title: `Weekly Goal ${i}`,
        done: i % 4 === 0,
        subjectId: subs[i % subs.length].id,
        linkedEventIds: [],
        duration: 1.5
      });
    }
    for (let i = 1; i <= 480; i++) {
      const evId = 50000 + i;
      const t = evTypes[i % evTypes.length];
      evs.push({
        id: evId,
        title: `Session ${i}`,
        day: i % 7,
        startHour: 7 + (i % 14),
        duration: 1,
        type: t,
        isFixed: t === 'mandatory',
        absent: t === 'mandatory' && i % 2 === 0,
        completed: i % 3 === 0,
        missed: t !== 'mandatory' && t !== 'wasted' && i % 5 === 0,
        subjectId: subs[i % subs.length].id
      });
      if (i <= goals.length * 2) {
        goals[i % goals.length].linkedEventIds.push(evId);
      }
    }

    const lg = [];
    const moods = ['fire', 'bolt', 'book', 'missed', 'wasted_time', 'college_absent'];
    for (let i = 1; i <= 1000; i++) {
      const m = moods[i % moods.length];
      lg.push({
        id: 90000 + i,
        date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
        text: `Study record ${i}`,
        mood: m,
        subjectId: subs[i % subs.length].id,
        sourceEventId: evs[i % evs.length].id,
        absentDayIdx: m === 'college_absent' ? (i % 7) : undefined
      });
    }

    localStorage.setItem('pharmaSubjectsV4', JSON.stringify(subs));
    localStorage.setItem('pharmaScheduleV4', JSON.stringify({
      events: evs,
      backlog: goals,
      weeklyReports: [],
      plannerPrefs: { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75 }
    }));
    localStorage.setItem('pharmaLogsV4', JSON.stringify(lg));

    if (firstLecId && typeof saveMediaToDB === 'function') {
      if (!dbInstance && typeof initPdfDB === 'function') await initPdfDB();
      const syntheticPdfBytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj<< /Type /Pages /Count 120 >>endobj\n%%EOF');
      await saveMediaToDB('pdfs', firstLecId, new Blob([syntheticPdfBytes], { type: 'application/pdf' }));
    }
  });
}

async function main() {
  console.log('======================================================================');
  console.log('EXO WP 6.8 — P0 RUNTIME STABILIZATION & FREEZE REGRESSION E2E');
  console.log('======================================================================');

  const spawnedServer = await ensureLocalServerRunning();
  const browser = await chromium.launch(resolveChromiumLaunchOptions());

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(STRESS_INIT_SCRIPT);
    const page = await context.newPage();
    await installOfflineRoutes(page);

    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', err => pageErrors.push(String(err)));
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(250);
    await seedStressDataset(page);

    console.log('\n--- 1. Stress Startup & Idle Clock Stability ---');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#dashboard.active #dashboardContent', { timeout: 25000 });
    await page.waitForTimeout(300);

    const startupMetrics = await page.evaluate(() => ({
      maxLT: window.__wp68E2E.longTasks.reduce((m, x) => Math.max(m, x), 0),
      ltCount: window.__wp68E2E.longTasks.length,
      domCount: document.querySelectorAll('*').length
    }));
    assert(startupMetrics.maxLT < 250 && startupMetrics.domCount < 4500,
      `Stress startup renders bounded DOM (${startupMetrics.domCount} nodes) with max LongTask ${startupMetrics.maxLT}ms`);

    await page.evaluate(() => { window.__wp68E2E.longTasks.length = 0; window.__wp68E2E.bodyMutations = 0; });
    await page.waitForTimeout(3500);
    const idleMetrics = await page.evaluate(() => ({
      bodyMutations: window.__wp68E2E.bodyMutations,
      ltCount: window.__wp68E2E.longTasks.length
    }));
    assert(idleMetrics.bodyMutations <= 2 && idleMetrics.ltCount === 0,
      `Idle dashboard (3.5s) triggers <=2 DOM mutations (got ${idleMetrics.bodyMutations}) & 0 LongTasks`);

    console.log('\n--- 2. Chapter Workspace In-Place Search Input Focus & Filtering ---');
    await page.click('.sidebar-nav-item[data-tab="subjects"]');
    await page.click('.subject-card[data-subject-id]');
    await page.waitForSelector('#groupsContainer .exo-toc-open-workspace-btn', { timeout: 10000 });
    await page.locator('#groupsContainer .exo-toc-open-workspace-btn').first().click();
    await page.waitForSelector('#chapter-workspace-view', { state: 'visible', timeout: 10000 });
    await page.click('#cwTabBtn_resources');
    await page.waitForSelector('#cwResourceSearchInput', { timeout: 10000 });

    await page.click('#cwResourceSearchInput');
    await page.keyboard.type('Lecture 1.1.2', { delay: 15 });
    const cwSearchRes = await page.evaluate(() => ({
      focused: document.activeElement?.id === 'cwResourceSearchInput',
      val: document.getElementById('cwResourceSearchInput')?.value || '',
      visibleRows: document.querySelectorAll('#cwResourcesList .cw-resource-card').length
    }));
    assert(cwSearchRes.focused && cwSearchRes.val === 'Lecture 1.1.2' && cwSearchRes.visibleRows === 1,
      `CW search preserves focus (${cwSearchRes.focused}), exact text ("${cwSearchRes.val}"), & filters to ${cwSearchRes.visibleRows} row`);
    await page.fill('#cwResourceSearchInput', '');

    console.log('\n--- 3. 120-Page PDF Studio Deferred Thumbs, Lazy Extra Note Canvas & Ink ---');
    await page.evaluate(() => { window.__wp68E2E.longTasks.length = 0; });
    await page.click('#cwOpenStudioPrimaryBtn');
    await page.waitForSelector('#pdfViewerModalOverlay.active #pdfRenderCanvas_1', { timeout: 25000 });
    await page.waitForTimeout(200);

    const pdfInitState = await page.evaluate(() => {
      const thumbCards = document.querySelectorAll('#pdfThumbnailsList .pdf-thumb-card').length;
      const collapsedNoteCanvas = document.getElementById('pdfInkCanvas_note_1');
      return {
        thumbCards,
        collapsedW: collapsedNoteCanvas ? collapsedNoteCanvas.width : -1,
        collapsedH: collapsedNoteCanvas ? collapsedNoteCanvas.height : -1,
        maxLT: window.__wp68E2E.longTasks.reduce((m, x) => Math.max(m, x), 0)
      };
    });
    assert(pdfInitState.thumbCards === 0 && pdfInitState.collapsedW === 1 && pdfInitState.collapsedH === 1,
      `120-page PDF defers closed thumbnails (${pdfInitState.thumbCards}) & keeps collapsed Extra Note canvases at 1x1 (${pdfInitState.collapsedW}x${pdfInitState.collapsedH})`);
    assert(pdfInitState.maxLT < 300, `120-page PDF open avoids freeze (maxLT=${pdfInitState.maxLT}ms)`);

    // Open Extra Note Sheet for page 1 and verify lazy HiDPI canvas sizing before drawing
    await page.evaluate(() => toggleExtraNoteForPage(1));
    await page.waitForTimeout(120);
    const noteOpenedState = await page.evaluate(() => {
      const wrapper = document.getElementById('pdfExtraNoteWrapper_1');
      const canvas = document.getElementById('pdfInkCanvas_note_1');
      return {
        visible: wrapper ? wrapper.style.display === 'block' : false,
        w: canvas ? canvas.width : 0,
        h: canvas ? canvas.height : 0
      };
    });
    assert(noteOpenedState.visible && noteOpenedState.w > 100 && noteOpenedState.h > 100,
      `Opening Extra Note Sheet lazily resizes HiDPI canvas (${noteOpenedState.w}x${noteOpenedState.h})`);

    // Draw stroke & close Studio synchronously
    await page.click('#toolBtn_pen');
    const inkBox = await page.locator('#pdfInkCanvas_1').boundingBox();
    if (inkBox) {
      await page.mouse.move(inkBox.x + 50, inkBox.y + 50);
      await page.mouse.down();
      await page.mouse.move(inkBox.x + 150, inkBox.y + 110, { steps: 5 });
      await page.mouse.up();
    }
    const closePerf = await page.evaluate(() => {
      const t0 = performance.now();
      document.getElementById('pdfBackToChapterBtn').click();
      return { dt: performance.now() - t0, closed: !document.getElementById('pdfViewerModalOverlay').classList.contains('active') };
    });
    assert(closePerf.closed && closePerf.dt < 50, `PDF Studio unmounts synchronously in ${closePerf.dt.toFixed(1)}ms (<50ms)`);

    console.log('\n--- 4. Planner Week Bucketing & Goals Windowing + Load More ---');
    await page.click('.sidebar-nav-item[data-tab="schedule"]');
    await page.evaluate(() => { window.__wp68E2E.longTasks.length = 0; });
    await page.click('#schPillWeek');
    await page.waitForTimeout(150);
    const weekState = await page.evaluate(() => ({
      dayCols: document.querySelectorAll('#calendarInteractiveWrapper .fluid-day-col').length,
      maxLT: window.__wp68E2E.longTasks.reduce((m, x) => Math.max(m, x), 0)
    }));
    assert(weekState.dayCols === 7 && weekState.maxLT < 400,
      `Planner 480-event Week view renders 7 columns smoothly (maxLT=${weekState.maxLT}ms)`);

    await page.click('#schPillTasks');
    await page.waitForTimeout(150);
    const goalsInitial = await page.evaluate(() => ({
      cardCount: document.querySelectorAll('#tasksBacklogList .backlog-goal-card').length,
      hasMoreBtn: Boolean(document.getElementById('exoShowMoreGoalsBtn'))
    }));
    assert(goalsInitial.cardCount <= 40 && goalsInitial.hasMoreBtn,
      `Planner Goals initially windows 90 items cleanly (rendered=${goalsInitial.cardCount}, showMore=${goalsInitial.hasMoreBtn})`);

    await page.click('#exoShowMoreGoalsBtn');
    await page.waitForTimeout(120);
    const goalsExpanded = await page.evaluate(() => document.querySelectorAll('#tasksBacklogList .backlog-goal-card').length);
    assert(goalsExpanded > goalsInitial.cardCount, `Clicking #exoShowMoreGoalsBtn loads more goals (${goalsInitial.cardCount} -> ${goalsExpanded})`);

    console.log('\n--- 5. Tracker 1,000-Log Collapsed Accordion Windowing & Offscreen Unmount ---');
    await page.click('.sidebar-nav-item[data-tab="tracker"]');
    await page.waitForTimeout(200);
    const trackerState = await page.evaluate(() => ({
      statTotalLogs: document.getElementById('statTotalLogs')?.innerText || '',
      accordionGroups: document.querySelectorAll('#logsContainer .log-day-group').length,
      collapsedBodies: Array.from(document.querySelectorAll('#logsContainer .log-day-group:not(.open) .log-day-body')).length,
      renderedLogCards: document.querySelectorAll('#logsContainer .log-item-actionable').length
    }));
    assert(trackerState.statTotalLogs === '1000' && trackerState.accordionGroups > 10 && trackerState.collapsedBodies === 0,
      `Tracker computes KPI across all 1000 logs (stat=${trackerState.statTotalLogs}) with 0 collapsed body DOM nodes (rendered cards=${trackerState.renderedLogCards})`);

    await page.click('.sidebar-nav-item[data-tab="dashboard"]');
    await page.waitForTimeout(100);
    const unmountedState = await page.evaluate(() => ({
      logsChildren: document.getElementById('logsContainer')?.children.length || 0,
      calChildren: document.getElementById('calendarInteractiveWrapper')?.children.length || 0
    }));
    assert(unmountedState.logsChildren === 0 && unmountedState.calChildren === 0,
      `Switching back to Dashboard unmounts inactive Tracker & Schedule subtrees (logs=${unmountedState.logsChildren}, cal=${unmountedState.calChildren})`);

    console.log('\n--- 6. View-Scoped EN <-> AR Lazy Translation Across Hidden Views & Modals ---');
    await page.click('#sidebarLangToggleBtn'); // EN -> AR while on Dashboard
    await page.waitForTimeout(150);
    await page.click('.sidebar-nav-item[data-tab="tracker"]');
    await page.waitForTimeout(150);
    const arTrackerHeading = await page.evaluate(() => ({
      dir: document.documentElement.dir,
      heading: document.querySelector('#tracker .tracker-top-header h2')?.innerText || ''
    }));
    assert(arTrackerHeading.dir === 'rtl' && /[\u0600-\u06FF]/.test(arTrackerHeading.heading),
      `Hidden Tracker lazily renders Arabic when activated after EN->AR toggle (dir=${arTrackerHeading.dir})`);

    await page.click('#sidebarLangToggleBtn'); // AR -> EN while on Tracker
    await page.waitForTimeout(150);
    await page.click('.sidebar-nav-item[data-tab="schedule"]');
    await page.waitForTimeout(150);
    await page.click('#sidebarHelpBtn');
    await page.waitForSelector('#helpModalOverlay.active', { timeout: 5000 });
    await page.waitForTimeout(100);
    const enLeakCheck = await page.evaluate(() => {
      const schText = document.getElementById('schedule')?.innerText || '';
      const helpText = document.getElementById('helpModalOverlay')?.innerText || '';
      return {
        dir: document.documentElement.dir,
        schHasArabic: /[\u0600-\u06FF]/.test(schText),
        helpHasArabic: /[\u0600-\u06FF]/.test(helpText)
      };
    });
    assert(enLeakCheck.dir === 'ltr' && !enLeakCheck.schHasArabic && !enLeakCheck.helpHasArabic,
      `Switching back to EN lazily translates Planner & newly opened Help Center with 0 Arabic leaks`);
    await page.click('#helpModalCloseBtn');

    console.log('\n--- 7. 20 Rapid View Cycles Leak & Stability Check ---');
    await page.click('.sidebar-nav-item[data-tab="dashboard"]');
    await page.waitForTimeout(100);
    const before20 = await page.evaluate(() => ({
      dom: document.querySelectorAll('*').length,
      heap: performance.memory ? performance.memory.usedJSHeapSize / (1024 * 1024) : 0
    }));
    const tabs = ['subjects', 'schedule', 'tracker', 'dashboard'];
    for (let c = 0; c < 5; c++) {
      for (const tab of tabs) {
        await page.click(`.sidebar-nav-item[data-tab="${tab}"]`);
      }
    }
    await page.waitForTimeout(150);
    const after20 = await page.evaluate(() => ({
      dom: document.querySelectorAll('*').length,
      heap: performance.memory ? performance.memory.usedJSHeapSize / (1024 * 1024) : 0
    }));
    const domDelta = Math.abs(after20.dom - before20.dom);
    const heapDelta = after20.heap - before20.heap;
    assert(domDelta <= 20 && heapDelta < 15,
      `20 rapid view cycles leave balanced DOM delta (${domDelta} nodes) & bounded JS heap (${heapDelta.toFixed(2)} MB)`);
    assert(pageErrors.length === 0 && consoleErrors.length === 0,
      `Zero pageerror (${pageErrors.length}) & console.error (${consoleErrors.length}) across full stress session`);

    await context.close();
  } finally {
    await browser.close();
    if (spawnedServer) spawnedServer.kill();
  }

  console.log('\n======================================================================');
  console.log(`WP 6.8 CHROMIUM E2E RESULTS -> PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('======================================================================');
  if (testsFailed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal WP 6.8 E2E error:', err);
  process.exit(1);
});
