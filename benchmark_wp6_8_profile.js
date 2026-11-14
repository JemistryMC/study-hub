// ============================================================================
// EXO — Personal Study Journal | WP 6.8 Real Headless Chromium Profiler
// Measures real UI interactions, Long Tasks (>=50ms), event-loop lag, rAF
// frame gaps, Event Timing entries (where supported), action-to-second-rAF
// wall time, DOM node growth, JS heap growth, JSON/localStorage/IDB/MutationObserver
// overhead across 5 dataset tiers and 4 real user journeys (+ near-full quota test).
// Note: Uses offline mocked Supabase/Google routes + deterministic PDF.js shim.
// ============================================================================

const fs = require('fs');
const http = require('http');
const os = require('os');
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

const PROFILER_INIT_SCRIPT = `
(function() {
  // Deterministic PDF.js shim supporting arbitrary page counts from header /Count N
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

  // Runtime Profiler State
  const prof = {
    longTasks: [],
    eventTimings: [],
    eventTimingSupported: false,
    rafGaps: [],
    eventLoopDrifts: [],
    mutationsTotal: 0,
    mutationObserverBatches: 0,
    lsSetCalls: 0,
    lsSetMs: 0,
    lsSetBytes: 0,
    jsonParseCalls: 0,
    jsonParseMs: 0,
    jsonStringifyCalls: 0,
    jsonStringifyMs: 0,
    idbOpsCount: 0,
    idbTotalMs: 0,
    idbMaxOpMs: 0,
    lastRafTs: 0,
    lastBeatTs: 0,
    activePhase: 'startup',
    enabled: true
  };
  window.__wp68Prof = prof;

  // 1. Long Task & W3C Event Timing Observers
  try {
    if (typeof PerformanceObserver !== 'undefined') {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          prof.longTasks.push({
            duration: Number(entry.duration.toFixed(2)),
            startTime: Number(entry.startTime.toFixed(2)),
            phase: prof.activePhase
          });
        }
      });
      obs.observe({ entryTypes: ['longtask'] });

      if (Array.isArray(PerformanceObserver.supportedEntryTypes) && PerformanceObserver.supportedEntryTypes.includes('event')) {
        prof.eventTimingSupported = true;
        const evObs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            prof.eventTimings.push({
              name: entry.name || 'event',
              duration: Number(entry.duration.toFixed(2)),
              processingStart: entry.processingStart !== undefined ? Number(entry.processingStart.toFixed(2)) : null,
              processingEnd: entry.processingEnd !== undefined ? Number(entry.processingEnd.toFixed(2)) : null,
              phase: prof.activePhase
            });
          }
        });
        evObs.observe({ type: 'event', buffered: true, durationThreshold: 16 });
      }
    }
  } catch (e) {}

  // 2. rAF Frame Gap Loop
  function rafTick(ts) {
    if (prof.lastRafTs > 0) {
      const gap = ts - prof.lastRafTs;
      if (gap > 20) {
        prof.rafGaps.push({ gap: Number(gap.toFixed(2)), phase: prof.activePhase });
      }
    }
    prof.lastRafTs = ts;
    if (prof.enabled) requestAnimationFrame(rafTick);
  }
  requestAnimationFrame(rafTick);

  // 3. Event Loop Drift Heartbeat (20ms)
  prof.lastBeatTs = performance.now();
  setInterval(() => {
    const now = performance.now();
    const drift = Math.max(0, (now - prof.lastBeatTs) - 20);
    prof.lastBeatTs = now;
    if (drift > 15) {
      prof.eventLoopDrifts.push({ drift: Number(drift.toFixed(2)), phase: prof.activePhase });
    }
  }, 20);

  // 4. Non-invasive timing wrappers for localStorage.setItem & JSON.parse/stringify
  const origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(k, v) {
    const t0 = performance.now();
    try {
      return origSetItem.call(this, k, v);
    } finally {
      const dt = performance.now() - t0;
      prof.lsSetCalls++;
      prof.lsSetMs += dt;
      prof.lsSetBytes += String(v || '').length * 2;
    }
  };
  const origParse = JSON.parse;
  JSON.parse = function() {
    const t0 = performance.now();
    try {
      return origParse.apply(this, arguments);
    } finally {
      prof.jsonParseCalls++;
      prof.jsonParseMs += (performance.now() - t0);
    }
  };
  const origStringify = JSON.stringify;
  JSON.stringify = function() {
    const t0 = performance.now();
    try {
      return origStringify.apply(this, arguments);
    } finally {
      prof.jsonStringifyCalls++;
      prof.jsonStringifyMs += (performance.now() - t0);
    }
  };

  // 4b. Non-invasive IndexedDB operation timing wrappers
  try {
    if (typeof IDBFactory !== 'undefined' && IDBFactory.prototype && typeof IDBFactory.prototype.open === 'function') {
      const origIdbOpen = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function() {
        const t0 = performance.now();
        const req = origIdbOpen.apply(this, arguments);
        if (req && typeof req.addEventListener === 'function') {
          const done = () => {
            const dt = performance.now() - t0;
            prof.idbOpsCount++;
            prof.idbTotalMs += dt;
            if (dt > prof.idbMaxOpMs) prof.idbMaxOpMs = dt;
          };
          req.addEventListener('success', done, { once: true });
          req.addEventListener('error', done, { once: true });
        }
        return req;
      };
    }
    if (typeof IDBObjectStore !== 'undefined' && IDBObjectStore.prototype) {
      for (const methodName of ['get', 'put', 'add', 'delete', 'getAll', 'clear', 'count']) {
        const origMethod = IDBObjectStore.prototype[methodName];
        if (typeof origMethod !== 'function') continue;
        IDBObjectStore.prototype[methodName] = function() {
          const t0 = performance.now();
          const req = origMethod.apply(this, arguments);
          if (req && typeof req.addEventListener === 'function') {
            const done = () => {
              const dt = performance.now() - t0;
              prof.idbOpsCount++;
              prof.idbTotalMs += dt;
              if (dt > prof.idbMaxOpMs) prof.idbMaxOpMs = dt;
            };
            req.addEventListener('success', done, { once: true });
            req.addEventListener('error', done, { once: true });
          }
          return req;
        };
      }
    }
  } catch (e) {}

  // 5. Passive body mutation counter (to quantify domObserver pressure)
  window.addEventListener('DOMContentLoaded', () => {
    try {
      const mo = new MutationObserver((muts) => {
        prof.mutationObserverBatches++;
        prof.mutationsTotal += muts.length;
      });
      mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) {}
  });

  window.__wp68ResetCounters = function(phaseName) {
    prof.activePhase = phaseName || 'phase';
    prof.longTasks.length = 0;
    prof.eventTimings.length = 0;
    prof.rafGaps.length = 0;
    prof.eventLoopDrifts.length = 0;
    prof.mutationsTotal = 0;
    prof.mutationObserverBatches = 0;
    prof.lsSetCalls = 0;
    prof.lsSetMs = 0;
    prof.lsSetBytes = 0;
    prof.jsonParseCalls = 0;
    prof.jsonParseMs = 0;
    prof.jsonStringifyCalls = 0;
    prof.jsonStringifyMs = 0;
    prof.idbOpsCount = 0;
    prof.idbTotalMs = 0;
    prof.idbMaxOpMs = 0;
    prof.lastRafTs = performance.now();
    prof.lastBeatTs = performance.now();
  };

  window.__wp68Snapshot = function() {
    const maxLongTaskMs = prof.longTasks.reduce((m, x) => Math.max(m, x.duration), 0);
    const totalLongTaskMs = prof.longTasks.reduce((s, x) => s + x.duration, 0);
    const maxEventTimingMs = prof.eventTimings.reduce((m, x) => Math.max(m, x.duration), 0);
    const maxFrameGapMs = prof.rafGaps.reduce((m, x) => Math.max(m, x.gap), 0);
    const framesOver50 = prof.rafGaps.filter(x => x.gap >= 50).length;
    const framesOver100 = prof.rafGaps.filter(x => x.gap >= 100).length;
    const framesOver500 = prof.rafGaps.filter(x => x.gap >= 500).length;
    const maxDriftMs = prof.eventLoopDrifts.reduce((m, x) => Math.max(m, x.drift), 0);
    return {
      phase: prof.activePhase,
      longTaskCount: prof.longTasks.length,
      maxLongTaskMs: Number(maxLongTaskMs.toFixed(1)),
      totalLongTaskMs: Number(totalLongTaskMs.toFixed(1)),
      longTasksSample: prof.longTasks.slice(0, 12),
      eventTimingSupported: prof.eventTimingSupported,
      eventTimingCount: prof.eventTimings.length,
      maxEventTimingMs: Number(maxEventTimingMs.toFixed(1)),
      eventTimingSample: prof.eventTimings.slice(0, 8),
      maxFrameGapMs: Number(maxFrameGapMs.toFixed(1)),
      framesOver50,
      framesOver100,
      framesOver500,
      maxDriftMs: Number(maxDriftMs.toFixed(1)),
      mutationsTotal: prof.mutationsTotal,
      mutationObserverBatches: prof.mutationObserverBatches,
      lsSetCalls: prof.lsSetCalls,
      lsSetMs: Number(prof.lsSetMs.toFixed(2)),
      lsSetKB: Number((prof.lsSetBytes / 1024).toFixed(1)),
      jsonParseCalls: prof.jsonParseCalls,
      jsonParseMs: Number(prof.jsonParseMs.toFixed(2)),
      jsonStringifyCalls: prof.jsonStringifyCalls,
      jsonStringifyMs: Number(prof.jsonStringifyMs.toFixed(2)),
      idbOpsCount: prof.idbOpsCount,
      idbTotalMs: Number(prof.idbTotalMs.toFixed(2)),
      idbMaxOpMs: Number(prof.idbMaxOpMs.toFixed(2)),
      domNodeCount: document.querySelectorAll('*').length,
      usedJSHeapMB: (performance && performance.memory)
        ? Number((performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2))
        : null
    };
  };
})();
`;

function buildTierConfig(tierName) {
  switch (tierName) {
    case 'empty':
      return { subjectsCount: 0, chaptersPerSub: 0, lecsPerChap: 0, eventsCount: 0, logsCount: 0, goalsCount: 0, pdfPages: 5 };
    case 'medium':
      return { subjectsCount: 5, chaptersPerSub: 2, lecsPerChap: 3, eventsCount: 30, logsCount: 40, goalsCount: 12, pdfPages: 12 };
    case 'large':
      return { subjectsCount: 10, chaptersPerSub: 4, lecsPerChap: 5, eventsCount: 140, logsCount: 250, goalsCount: 40, pdfPages: 30 };
    case 'tier900':
      return { subjectsCount: 10, chaptersPerSub: 9, lecsPerChap: 10, eventsCount: 210, logsCount: 320, goalsCount: 50, pdfPages: 40 };
    case 'stress':
      return { subjectsCount: 10, chaptersPerSub: 9, lecsPerChap: 10, eventsCount: 480, logsCount: 1000, goalsCount: 90, pdfPages: 120 };
    default:
      throw new Error('Unknown tier: ' + tierName);
  }
}

async function seedDatasetInPage(page, cfg) {
  await page.evaluate(async (c) => {
    localStorage.clear();
    // Keep English first-run default explicitly clear or standard
    localStorage.setItem('exo_lang', 'en');
    const subs = [];
    let lecSeq = 1;
    let firstLecId = null;
    for (let s = 1; s <= c.subjectsCount; s++) {
      const groups = [];
      for (let g = 1; g <= c.chaptersPerSub; g++) {
        const lectures = [];
        for (let l = 1; l <= c.lecsPerChap; l++) {
          const lid = 100000 + lecSeq++;
          if (!firstLecId) firstLecId = lid;
          lectures.push({
            id: lid,
            title: `Lecture ${s}.${g}.${l}`,
            path: (s === 1 && g === 1 && l === 1) ? 'synthetic_study_slides.pdf' : '',
            audioPath: '',
            duration: 45,
            completed: l % 3 === 0,
            lastPageNum: l === 1 ? 3 : 1,
            totalPages: c.pdfPages,
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
    for (let i = 1; i <= c.goalsCount; i++) {
      goals.push({
        id: 80000 + i,
        title: `Weekly Goal ${i}`,
        done: i % 4 === 0,
        subjectId: subs.length ? subs[i % subs.length].id : '',
        linkedEventIds: [],
        duration: 1.5
      });
    }
    for (let i = 1; i <= c.eventsCount; i++) {
      const evId = 50000 + i;
      const t = evTypes[i % evTypes.length];
      const subId = subs.length ? subs[i % subs.length].id : '';
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
        subjectId: subId
      });
      if (goals.length && i <= goals.length * 2) {
        goals[i % goals.length].linkedEventIds.push(evId);
      }
    }

    const lg = [];
    const moods = ['fire', 'bolt', 'book', 'missed', 'wasted_time', 'college_absent'];
    for (let i = 1; i <= c.logsCount; i++) {
      const m = moods[i % moods.length];
      lg.push({
        id: 90000 + i,
        date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
        text: `Study record ${i}`,
        mood: m,
        subjectId: subs.length ? subs[i % subs.length].id : '',
        sourceEventId: evs.length ? evs[i % evs.length].id : undefined,
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
      const syntheticPdfBytes = new TextEncoder().encode(`%PDF-1.4\n1 0 obj<< /Type /Pages /Count ${c.pdfPages} >>endobj\n%%EOF`);
      await saveMediaToDB('pdfs', firstLecId, new Blob([syntheticPdfBytes], { type: 'application/pdf' }));
    }
  }, cfg);
}

async function measureClickInteraction(page, label, clickAction) {
  await page.evaluate((lbl) => window.__wp68ResetCounters(lbl), label);
  const t0 = await page.evaluate(() => performance.now());
  await clickAction();
  const afterPaint = await page.evaluate(async () => {
    return await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve({
            endTs: performance.now(),
            snap: window.__wp68Snapshot()
          });
        });
      });
    });
  });
  const actionToSecondFrameWallMs = Number((afterPaint.endTs - t0).toFixed(1));
  return Object.assign({ step: label, actionToSecondFrameWallMs }, afterPaint.snap);
}

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

async function profileTier(browser, tierName, targetUrl) {
  const cfg = buildTierConfig(tierName);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(PROFILER_INIT_SCRIPT);
  const page = await context.newPage();
  await installOfflineRoutes(page);
  const runtimeErrors = [];
  page.on('pageerror', (err) => runtimeErrors.push('pageerror: ' + String(err?.message || err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') runtimeErrors.push('console.error: ' + msg.text());
  });

  // First load empty to seed IDB + LS
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await seedDatasetInPage(page, cfg);

  // Measure Cold/Warm Reload Startup with seeded data
  const navStart = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#dashboard.active #dashboardContent', { timeout: 60000 });
  await page.waitForTimeout(400);
  const startupWallMs = Date.now() - navStart;
  const startupSnap = await page.evaluate(() => window.__wp68Snapshot());

  const steps = [];

  // Idle stability check (4 seconds sitting on Dashboard in EN mode)
  await page.evaluate(() => window.__wp68ResetCounters('idle_4s_dashboard'));
  await page.waitForTimeout(4000);
  steps.push(await page.evaluate(() => Object.assign({ step: 'idle_4s_dashboard', actionToSecondFrameWallMs: 4000 }, window.__wp68Snapshot())));

  // Journey 1: Dashboard -> Materials -> Subject -> TOC -> Chapter Workspace -> Search Typing -> PDF Studio -> Scroll & Draw -> Back
  steps.push(await measureClickInteraction(page, 'nav_to_subjects', async () => {
    await page.click('.sidebar-nav-item[data-tab="subjects"]');
  }));

  if (cfg.subjectsCount > 0) {
    steps.push(await measureClickInteraction(page, 'open_subject_toc', async () => {
      await page.click('.subject-card[data-subject-id]');
    }));

    // Open Chapter Workspace (first chapter button)
    const cwBtn = page.locator('#groupsContainer button:has-text("Workspace"), #groupsContainer button[onclick*="openChapterWorkspace"]').first();
    if (await cwBtn.count() > 0) {
      steps.push(await measureClickInteraction(page, 'open_chapter_workspace', async () => {
        await cwBtn.click();
        await page.waitForSelector('#chapter-workspace-view', { state: 'visible', timeout: 15000 });
      }));

      // Switch to Resources tab so #cwResourceSearchInput is present
      const resTabBtn = page.locator('#cwTabBtn_resources');
      if (await resTabBtn.count() > 0) {
        await resTabBtn.click();
        await page.waitForSelector('#cwResourceSearchInput', { timeout: 10000 });
      }

      // Test typing into #cwResourceSearchInput (real keystrokes!)
      const searchBox = page.locator('#cwResourceSearchInput');
      if (await searchBox.count() > 0) {
        await page.evaluate(() => window.__wp68ResetCounters('cw_search_typing'));
        await searchBox.click();
        const tType0 = Date.now();
        await page.keyboard.type('Lecture', { delay: 15 });
        const hasFocusAfterType = await page.evaluate(() => document.activeElement?.id === 'cwResourceSearchInput');
        const typedVal = await searchBox.inputValue();
        const typeSnap = await page.evaluate(() => window.__wp68Snapshot());
        steps.push(Object.assign({
          step: 'cw_search_typing',
          actionToSecondFrameWallMs: Date.now() - tType0,
          focusPreserved: hasFocusAfterType,
          typedValueLen: typedVal.length
        }, typeSnap));
        // Clear search filter
        await page.fill('#cwResourceSearchInput', '');
        await page.waitForTimeout(100);
      }

      // Open PDF Studio from Workspace primary button
      const openPdfBtn = page.locator('#cwOpenStudioPrimaryBtn');
      if (await openPdfBtn.count() > 0) {
        steps.push(await measureClickInteraction(page, 'open_pdf_studio', async () => {
          await openPdfBtn.click();
          await page.waitForSelector('#pdfViewerModalOverlay.active #pdfRenderCanvas_1', { timeout: 30000 });
        }));

        // Real wheel scroll + zoom + pen stroke in PDF viewer
        const scrollBox = page.locator('#pdfPagesScrollContainer');
        if (await scrollBox.count() > 0) {
          const box = await scrollBox.boundingBox();
          steps.push(await measureClickInteraction(page, 'pdf_scroll_zoom_ink', async () => {
            if (box) {
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
              for (let k = 0; k < 8; k++) {
                await page.mouse.wheel(0, 700);
                await page.waitForTimeout(25);
              }
            }
            const zoomIn = page.locator('#pdfZoomInBtn, button[onclick*="changePdfZoom("]').first();
            if (await zoomIn.count() > 0) {
              await zoomIn.click();
              await zoomIn.click();
            }
            const penBtn = page.locator('#toolBtn_pen, button[onclick*="setPdfTool(\'pen\')"]').first();
            if (await penBtn.count() > 0) await penBtn.click();
            const inkCanvas = page.locator('#pdfInkCanvas_1');
            if (await inkCanvas.count() > 0) {
              const ib = await inkCanvas.boundingBox();
              if (ib) {
                await page.mouse.move(ib.x + 60, ib.y + 60);
                await page.mouse.down();
                await page.mouse.move(ib.x + 180, ib.y + 120, { steps: 6 });
                await page.mouse.up();
              }
            }
          }));
        }

        // Back from PDF Studio
        steps.push(await measureClickInteraction(page, 'close_pdf_studio', async () => {
          const closeBtn = page.locator('#pdfBackToChapterBtn, button[onclick="closePdfViewer()"]').first();
          await closeBtn.click();
        }));
      }

      // Back to TOC / Library
      const backLibBtn = page.locator('#cwBackToLibraryBtn');
      if (await backLibBtn.count() > 0) {
        await backLibBtn.click();
        await page.waitForTimeout(100);
      }
    }
  }

  // Journey 2: Planner (Today -> Week -> Goals) -> Tracker -> Dashboard -> Help -> Back to Planner
  steps.push(await measureClickInteraction(page, 'nav_to_planner', async () => {
    await page.click('.sidebar-nav-item[data-tab="schedule"]');
  }));
  steps.push(await measureClickInteraction(page, 'planner_week_tab', async () => {
    await page.click('#schPillWeek');
  }));
  steps.push(await measureClickInteraction(page, 'planner_goals_tab', async () => {
    await page.click('#schPillTasks');
  }));
  steps.push(await measureClickInteraction(page, 'nav_to_tracker', async () => {
    await page.click('.sidebar-nav-item[data-tab="tracker"]');
  }));
  steps.push(await measureClickInteraction(page, 'nav_to_dashboard', async () => {
    await page.click('.sidebar-nav-item[data-tab="dashboard"]');
  }));
  steps.push(await measureClickInteraction(page, 'open_help_modal', async () => {
    await page.click('#sidebarHelpBtn');
  }));
  await page.click('#helpModalCloseBtn');
  await page.waitForTimeout(100);

  // Journey 3: EN <-> AR rapid switching (6 toggles across Tracker/Planner)
  steps.push(await measureClickInteraction(page, 'lang_toggle_6x', async () => {
    for (let i = 0; i < 6; i++) {
      await page.click('#sidebarLangToggleBtn');
      await page.waitForTimeout(30);
    }
  }));

  // Journey 4: 20 Rapid Navigation Cycles + Heap/DOM Leak Check
  const before20 = await page.evaluate(() => ({
    domNodes: document.querySelectorAll('*').length,
    heapMB: (performance && performance.memory) ? Number((performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2)) : null
  }));
  steps.push(await measureClickInteraction(page, 'rapid_nav_20_cycles', async () => {
    const tabs = ['subjects', 'schedule', 'tracker', 'dashboard'];
    for (let c = 0; c < 5; c++) {
      for (const tab of tabs) {
        await page.click(`.sidebar-nav-item[data-tab="${tab}"]`);
      }
    }
  }));
  const after20 = await page.evaluate(() => ({
    domNodes: document.querySelectorAll('*').length,
    heapMB: (performance && performance.memory) ? Number((performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2)) : null
  }));

  await context.close();
  return {
    tier: tierName,
    config: cfg,
    startupWallMs,
    startup: startupSnap,
    steps,
    leakCheck20Nav: {
      domBefore: before20.domNodes,
      domAfter: after20.domNodes,
      domDelta: after20.domNodes - before20.domNodes,
      heapBeforeMB: before20.heapMB,
      heapAfterMB: after20.heapMB,
      heapDeltaMB: (before20.heapMB !== null && after20.heapMB !== null)
        ? Number((after20.heapMB - before20.heapMB).toFixed(2))
        : null
    },
    runtimeErrors
  };
}

async function runQuotaNearFullCheck(browser, targetUrl) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(PROFILER_INIT_SCRIPT);
  const page = await context.newPage();
  await installOfflineRoutes(page);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  const res = await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('exo_lang', 'en');
    // Fill ~4.5 MB of unrelated dummy entries near localStorage limit safely
    const fillerChunk = 'x'.repeat(250 * 1024);
    let filledKeys = 0;
    try {
      for (let i = 0; i < 18; i++) {
        localStorage.setItem('wp68_filler_' + i, fillerChunk);
        filledKeys++;
      }
    } catch (e) {}

    window.__wp68ResetCounters('near_full_quota_save');
    const t0 = performance.now();
    let saveOutcome = null;
    try {
      subjects = Array.from({ length: 15 }, (_, idx) => ({
        id: 7000 + idx,
        name: `Quota Sub ${idx}`,
        isContinuous: false,
        groups: [{ id: 8000 + idx, name: 'Ch 1', lectures: [{ id: 9000 + idx, title: 'Lec 1', path: '', padding: 'y'.repeat(8192) }] }]
      }));
      saveOutcome = saveSubjects();
    } catch (err) {
      saveOutcome = { error: String(err?.message || err) };
    }
    const wallMs = Number((performance.now() - t0).toFixed(1));
    await new Promise(r => setTimeout(r, 100));
    const snap = window.__wp68Snapshot();
    // Cleanup filler
    for (let i = 0; i < filledKeys; i++) localStorage.removeItem('wp68_filler_' + i);
    return {
      filledKeys,
      wallMs,
      savePersisted: Boolean(saveOutcome && saveOutcome.persisted),
      snap
    };
  });
  await context.close();
  return res;
}

function parseCliArgs(argv) {
  let outPath = null;
  let targetUrl = 'http://localhost:3000';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url' && argv[i + 1]) {
      targetUrl = argv[++i];
    } else if (arg.startsWith('--url=')) {
      targetUrl = arg.slice('--url='.length);
    } else if (arg === '--out' && argv[i + 1]) {
      outPath = argv[++i];
    } else if (arg.startsWith('--out=')) {
      outPath = arg.slice('--out='.length);
    } else if (!arg.startsWith('--') && !outPath) {
      outPath = arg;
    }
  }
  return {
    targetUrl,
    outPath: outPath || path.join(__dirname, '.playwright-cli', 'wp6_8_before_baseline.json')
  };
}

async function main() {
  const { targetUrl, outPath } = parseCliArgs(process.argv.slice(2));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const isDefaultLocal3000 = targetUrl.startsWith('http://localhost:3000') || targetUrl.startsWith('http://127.0.0.1:3000');
  const spawnedServer = isDefaultLocal3000 ? await ensureLocalServerRunning() : null;
  const launchOpts = resolveChromiumLaunchOptions();
  const browser = await chromium.launch(launchOpts);

  const tiers = ['empty', 'medium', 'large', 'tier900', 'stress'];
  const report = {
    timestamp: new Date().toISOString(),
    targetUrl,
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    nodeVersion: process.version,
    chromiumVersion: browser.version(),
    environmentBoundaries: {
      supabase: 'offline_mocked_client (not live hosted Supabase Auth/PostgREST)',
      googleDriveAndGis: 'offline_mocked_gis_client (not live Google OAuth/Drive)',
      pdfRenderer: 'deterministic_pdfjs_canvas_shim (not live CDN PDF.js decoding real user binary PDFs)',
      quotaCheck: 'synthetic_localStorage_filler (simulated near-full storage quota)'
    },
    tiers: {},
    nearFullQuota: null
  };

  try {
    for (const t of tiers) {
      console.log(`\n=== Profiling Tier: ${t} (${targetUrl}) ===`);
      const tRes = await profileTier(browser, t, targetUrl);
      report.tiers[t] = tRes;
      console.log(`  Startup Wall: ${tRes.startupWallMs} ms | LongTasks: ${tRes.startup.longTaskCount} (max ${tRes.startup.maxLongTaskMs} ms) | IDB ops: ${tRes.startup.idbOpsCount}/${tRes.startup.idbTotalMs}ms | DOM: ${tRes.startup.domNodeCount}`);
      for (const s of tRes.steps) {
        console.log(
          `  [${s.step.padEnd(24)}] frame2Wall=${String(s.actionToSecondFrameWallMs).padStart(7)}ms | ` +
          `evTiming=${s.eventTimingSupported ? `${s.eventTimingCount}/${s.maxEventTimingMs}ms` : 'n/a'} | ` +
          `LT=${s.longTaskCount} (max ${s.maxLongTaskMs}ms, tot ${s.totalLongTaskMs}ms) | ` +
          `maxGap=${s.maxFrameGapMs}ms | muts=${s.mutationsTotal} | ` +
          `IDB=${s.idbOpsCount}/${s.idbTotalMs}ms | LS=${s.lsSetCalls}/${s.lsSetMs}ms | JSON=${s.jsonParseCalls}+${s.jsonStringifyCalls}/${(s.jsonParseMs + s.jsonStringifyMs).toFixed(1)}ms` +
          (s.focusPreserved !== undefined ? ` | focusOK=${s.focusPreserved}` : '')
        );
      }
      console.log(`  LeakCheck (20 nav): DOM ${tRes.leakCheck20Nav.domBefore} -> ${tRes.leakCheck20Nav.domAfter} (delta ${tRes.leakCheck20Nav.domDelta}), Heap delta=${tRes.leakCheck20Nav.heapDeltaMB} MB`);
      if (tRes.runtimeErrors.length) {
        console.log(`  Runtime Errors (${tRes.runtimeErrors.length}):`, tRes.runtimeErrors.slice(0, 3));
      }
    }

    console.log('\n=== Profiling Near-Full LocalStorage Quota Test ===');
    report.nearFullQuota = await runQuotaNearFullCheck(browser, targetUrl);
    console.log(`  Filled keys: ${report.nearFullQuota.filledKeys} | Wall: ${report.nearFullQuota.wallMs}ms | LongTasks: ${report.nearFullQuota.snap.longTaskCount} (max ${report.nearFullQuota.snap.maxLongTaskMs}ms) | IDB=${report.nearFullQuota.snap.idbOpsCount}/${report.nearFullQuota.snap.idbTotalMs}ms | lsSetCalls: ${report.nearFullQuota.snap.lsSetCalls}`);

    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`\nSaved sanitized profile -> ${outPath}`);
  } finally {
    await browser.close();
    if (spawnedServer) spawnedServer.kill();
  }
}

main().catch((err) => {
  console.error('Profiler Fatal Error:', err);
  process.exit(1);
});
