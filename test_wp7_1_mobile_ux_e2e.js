// ============================================================================
// Exo Personal Study Journal — WP 7.1 Real-UI Mobile-First & Help Center E2E
// Verifies across 320x720, 360x740, 360x800, 390x844, 430x932, 768x1024, 896x414:
//   1. Zero horizontal overflow & <=15.5% mobile sticky chrome height (<768px)
//   2. >=44x44px touch targets on navbar, bottom nav, modals & PDF Studio controls
//   3. Mobile More Sheet (#mobileMoreMenuBtn -> #mobileMoreSheetOverlay) & Escape restore
//   4. Landscape (896x414) workspace access & full-viewport Mobile PDF Studio + Audio
//   5. Populated Study Library -> Subject TOC -> Chapter Workspace -> Mobile Studio
//   6. Weekly Planner single-row snap #notionDaySwitcher & 2-col summary strip
//   7. Confirm Modal EN/AR localization & z-index stacking
//   8. Actionable Help Center (Quick Actions, 7-step Checklist, Guides A-G,
//      Live Troubleshooting, Bilingual Search, Empty Chips, Mobile Spotlight Tour,
//      and Contextual ? Entry Triggers)
//   9. Captures verified after screenshots into .playwright-cli/wp7-1/after/
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

const PDFJS_DETERMINISTIC_SHIM = `
(function() {
  function countPdfPagesFromData(data) {
    try {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data || []);
      const str = new TextDecoder('latin1').decode(bytes);
      const m = str.match(/\\/Type\\s*\\/Pages[^>]*\\/Count\\s+(\\d+)/);
      if (m) return Math.max(1, Number(m[1]));
      const kids = str.match(/\\/Type\\s*\\/Page\\b/g);
      if (kids && kids.length) return kids.length;
    } catch (e) {}
    return 3;
  }
  window.pdfjsLib = {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: function(opts) {
      const total = countPdfPagesFromData(opts && opts.data);
      const doc = {
        numPages: total,
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
            }
          };
        }
      };
      return { promise: Promise.resolve(doc) };
    }
  };
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

function buildMinimalMultiPagePdfBytes(pageCount = 3) {
  const objs = [];
  const kidRefs = [];
  for (let i = 0; i < pageCount; i++) kidRefs.push(`${3 + i} 0 R`);
  objs.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objs.push(`2 0 obj\n<< /Type /Pages /Kids [${kidRefs.join(' ')}] /Count ${pageCount} >>\nendobj\n`);
  for (let i = 0; i < pageCount; i++) {
    objs.push(`${3 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n`);
  }
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const o of objs) {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += o;
  }
  const xrefPos = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

function buildMinimalWavBytes(durationMs = 400) {
  const sampleRate = 8000;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    buf.writeInt16LE(Math.round(Math.sin(i * 0.25) * 6000), 44 + i * 2);
  }
  return buf;
}

async function installOfflineRoutes(page) {
  await page.route((u) => u.protocol === 'https:', async (route) => {
    const url = route.request().url();
    if (url.includes('pdf.min.js')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: PDFJS_DETERMINISTIC_SHIM });
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

async function openFreshPage(browser, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', err => pageErrors.push(String(err)));
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  await installOfflineRoutes(page);
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForSelector('#dashboard', { timeout: 10000 });
  return { context, page, pageErrors, consoleErrors };
}

async function seedRichWorkspace(page, pdfB64, wavB64) {
  await page.evaluate(async ({ pdfB64, wavB64 }) => {
    const pdfBytes = Uint8Array.from(atob(pdfB64), c => c.charCodeAt(0));
    const wavBytes = Uint8Array.from(atob(wavB64), c => c.charCodeAt(0));
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });

    const subId = 7101;
    const grpId = 7201;
    const lecId = 7301;

    if (typeof saveMediaToDB === 'function') {
      await saveMediaToDB('pdfs', lecId, pdfBlob);
      await saveMediaToDB('audios', lecId, wavBlob);
    }
    if (typeof localMediaCache !== 'undefined') {
      localMediaCache.pdfs.add(String(lecId));
      localMediaCache.audios.add(String(lecId));
    }

    subjects = [
      {
        id: subId,
        name: 'Clinical Pharmacology',
        color: '#899982',
        icon: 'fa-pills',
        isDivided: true,
        groups: [
          {
            id: grpId,
            name: 'Chapter 1: Autonomic Pharmacology',
            lectures: [
              {
                id: lecId,
                title: 'Lecture 1 — Cholinergic Agonists & Receptors',
                pdfPath: 'cholinergic-agonists.pdf',
                audioPath: 'cholinergic-lecture.wav',
                hasLocalPdf: true,
                hasLocalAudio: true,
                completed: false,
                lastViewedPage: 1,
                totalPages: 3
              },
              {
                id: 7302,
                title: 'Lecture 2 — Muscarinic Antagonists',
                hasLocalPdf: false,
                hasLocalAudio: false,
                completed: false,
                lastViewedPage: 0,
                totalPages: 0
              }
            ]
          }
        ]
      },
      {
        id: 7102,
        name: 'Pathophysiology & Therapeutics',
        color: '#7898AC',
        icon: 'fa-heart',
        isDivided: true,
        groups: [
          {
            id: 7202,
            name: 'Chapter 2: Cardiovascular Regulation',
            lectures: [
              {
                id: 7303,
                title: 'Lecture 1 — Renin-Angiotensin Axis',
                hasLocalPdf: false,
                hasLocalAudio: false,
                completed: false
              }
            ]
          }
        ]
      }
    ];
    saveSubjects();

    const todayDay = new Date().getDay();
    scheduleEvents = [
      {
        id: 8001,
        title: 'Review Cholinergic Agonists Slides',
        notes: 'Focus on nicotinic vs muscarinic selectivity',
        day: todayDay,
        startHour: 9,
        duration: 1.5,
        type: 'important',
        subjectId: subId,
        completed: true
      },
      {
        id: 8002,
        title: 'Summarize Autonomic Flashcards',
        notes: 'Annotate summary sheet',
        day: todayDay,
        startHour: 13,
        duration: 1,
        type: 'review',
        subjectId: subId,
        completed: false
      }
    ];
    scheduleBacklog = [
      {
        id: 9001,
        title: 'Master Autonomic Dose Curves',
        subjectId: subId,
        linkedEventIds: ['8001'],
        linkedEventId: '8001',
        done: false
      }
    ];
    saveScheduleData();

    logs = [
      { id: 9101, date: new Date().toISOString().slice(0, 10), text: 'Completed Cholinergic slides & audio timestamps', mood: 'focus', hours: 1.5 }
    ];
    saveLogs();

    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderSubjectsList === 'function') renderSubjectsList();
    if (typeof renderSchedule === 'function') renderSchedule();
    if (typeof updateTracker === 'function') updateTracker();
  }, { pdfB64, wavB64 });
}

async function auditShellMetrics(page, vp) {
  return page.evaluate((vpHeight) => {
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
    const navBtns = Array.from(document.querySelectorAll('.navbar-actions-group button, .mobile-nav-item')).filter(b => b.offsetParent !== null);
    const smallBtns = navBtns.filter(b => {
      const r = b.getBoundingClientRect();
      return r.width < 44 || r.height < 44;
    }).map(b => `${b.id || b.className}(${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)})`);
    const navEl = document.querySelector('.navbar');
    const bottomEl = document.getElementById('mobileBottomNav');
    const navH = (navEl && getComputedStyle(navEl).display !== 'none') ? navEl.getBoundingClientRect().height : 0;
    const bottomH = (bottomEl && getComputedStyle(bottomEl).display !== 'none') ? bottomEl.getBoundingClientRect().height : 0;
    const stickyHeight = navH + bottomH;
    const stickyRatio = vpHeight > 0 ? (stickyHeight / vpHeight) : 0;
    const svgs = Array.from(document.querySelectorAll('.navbar svg.exo-svg-icon, #mobileBottomNav svg.exo-svg-icon')).filter(el => {
      const host = el.parentElement;
      return host && host.offsetParent !== null && getComputedStyle(el).display !== 'none';
    });
    const zeroSvgs = svgs.filter(el => {
      const r = el.getBoundingClientRect();
      return r.width <= 0 || r.height <= 0;
    }).length;
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      overflow,
      smallBtns,
      navH,
      bottomH,
      stickyHeight,
      stickyRatio,
      zeroSvgs
    };
  }, vp.height);
}

async function main() {
  console.log('======================================================================');
  console.log('EXO WP 7.1 — MOBILE-FIRST UX OVERHAUL & ACTIONABLE HELP CENTER E2E');
  console.log('======================================================================');

  const screenshotDir = path.join(__dirname, '.playwright-cli', 'wp7-1', 'after');
  fs.mkdirSync(screenshotDir, { recursive: true });
  const correctiveShotDir = path.join(__dirname, 'reports', 'screenshots', 'wp7-1-corrective');
  fs.mkdirSync(correctiveShotDir, { recursive: true });

  const pdfB64 = buildMinimalMultiPagePdfBytes(3).toString('base64');
  const wavB64 = buildMinimalWavBytes(400).toString('base64');

  const spawnedServer = await ensureLocalServerRunning();
  const browser = await chromium.launch(resolveChromiumLaunchOptions());

  try {
    // ------------------------------------------------------------------------
    // 1. Multi-Viewport Responsive Audit (320px .. 896x414 landscape, EN & AR)
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Multi-Viewport Layout, Sticky Chrome & 44px Touch Targets ---');
    const viewports = [
      { name: 'xs_320_en', width: 320, height: 720, lang: 'en' },
      { name: 'sm_360_en', width: 360, height: 740, lang: 'en' },
      { name: 'sm_360_ar', width: 360, height: 740, lang: 'ar' },
      { name: 'sm_360x800_en', width: 360, height: 800, lang: 'en' },
      { name: 'mob_390_en', width: 390, height: 844, lang: 'en', shot: 'dash-390x844-en.png' },
      { name: 'mob_390_ar', width: 390, height: 844, lang: 'ar' },
      { name: 'mob_430_en', width: 430, height: 932, lang: 'en' },
      { name: 'tab_768_en', width: 768, height: 1024, lang: 'en', shot: 'tablet-768x1024-en.png' },
      { name: 'land_896_en', width: 896, height: 414, lang: 'en' },
      { name: 'land_896_ar', width: 896, height: 414, lang: 'ar' }
    ];

    for (const vp of viewports) {
      const m = await openFreshPage(browser, { width: vp.width, height: vp.height });
      await seedRichWorkspace(m.page, pdfB64, wavB64);
      await m.page.evaluate((lng) => {
        if (typeof applyExoLanguage === 'function') applyExoLanguage(lng, false);
      }, vp.lang);
      await m.page.waitForTimeout(180);

      const metrics = await auditShellMetrics(m.page, vp);
      assert(!metrics.overflow, `${vp.name}: zero horizontal overflow (${metrics.scrollWidth} <= ${metrics.innerWidth})`);
      assert(metrics.smallBtns.length === 0, `${vp.name}: header & nav controls >=44x44px (${metrics.smallBtns.join(', ')})`);
      if (vp.width < 768) {
        assert(metrics.stickyRatio <= 0.155, `${vp.name}: sticky chrome ratio ${(metrics.stickyRatio * 100).toFixed(1)}% (${Math.round(metrics.stickyHeight)}px) <= 15.5%`);
      }
      assert(metrics.zeroSvgs === 0, `${vp.name}: zero broken SVGs`);

      if (vp.shot) {
        await m.page.screenshot({ path: path.join(screenshotDir, vp.shot) });
      }
      assert(m.pageErrors.length === 0 && m.consoleErrors.length === 0, `${vp.name}: zero runtime errors`);
      await m.context.close();
    }

    // ------------------------------------------------------------------------
    // 2. Mobile More Drawer (#mobileMoreSheetOverlay), Escape & Landscape Access
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Mobile More Drawer & Short-Landscape Workspace Navigation ---');
    {
      const p390 = await openFreshPage(browser, { width: 390, height: 844 });
      await seedRichWorkspace(p390.page, pdfB64, wavB64);

      const moreBtnVisible = await p390.page.isVisible('#mobileMoreMenuBtn');
      assert(moreBtnVisible, '390x844: #mobileMoreMenuBtn is visible in mobile header');
      await p390.page.click('#mobileMoreMenuBtn');
      await p390.page.waitForTimeout(180);

      const sheetState = await p390.page.evaluate(() => {
        const sheet = document.getElementById('mobileMoreSheetOverlay');
        const bottom = document.getElementById('mobileBottomNav');
        const items = Array.from(document.querySelectorAll('#mobileMoreSheetOverlay button')).filter(b => b.offsetParent !== null);
        const small = items.filter(b => {
          const r = b.getBoundingClientRect();
          return r.width < 44 || r.height < 44;
        }).map(b => b.id || b.textContent.trim());
        return {
          active: Boolean(sheet && sheet.classList.contains('active')),
          bottomHidden: Boolean(bottom && getComputedStyle(bottom).display === 'none'),
          itemCount: items.length,
          small
        };
      });
      assert(sheetState.active && sheetState.bottomHidden, 'Opening #mobileMoreSheetOverlay hides #mobileBottomNav cleanly');
      assert(sheetState.itemCount >= 9 && sheetState.small.length === 0, `More sheet items (${sheetState.itemCount}) all meet >=44x44px (${sheetState.small.join(', ')})`);

      await p390.page.screenshot({ path: path.join(screenshotDir, 'more-drawer-390x844-en.png') });

      await p390.page.keyboard.press('Escape');
      await p390.page.waitForTimeout(150);
      const afterEsc = await p390.page.evaluate(() => {
        const sheet = document.getElementById('mobileMoreSheetOverlay');
        const bottom = document.getElementById('mobileBottomNav');
        return {
          active: Boolean(sheet && sheet.classList.contains('active')),
          bottomVisible: Boolean(bottom && getComputedStyle(bottom).display !== 'none'),
          bodyHasStuckClass: document.body.classList.contains('exo-modal-open')
        };
      });
      assert(!afterEsc.active && afterEsc.bottomVisible && !afterEsc.bodyHasStuckClass, 'Escape closes More drawer and cleanly restores #mobileBottomNav');
      assert(p390.pageErrors.length === 0 && p390.consoleErrors.length === 0, '390x844 More sheet session zero runtime errors');
      await p390.context.close();

      // Short Landscape 896x414: bottom nav hidden, More sheet enables switching Views & Modals
      const land = await openFreshPage(browser, { width: 896, height: 414 });
      await seedRichWorkspace(land.page, pdfB64, wavB64);
      const landMore = await land.page.evaluate(() => {
        const btn = document.getElementById('mobileMoreMenuBtn');
        const bottom = document.getElementById('mobileBottomNav');
        return {
          moreVisible: Boolean(btn && getComputedStyle(btn).display !== 'none'),
          bottomHidden: Boolean(bottom && getComputedStyle(bottom).display === 'none')
        };
      });
      assert(landMore.moreVisible && landMore.bottomHidden, '896x414 landscape: bottom nav tucked away cleanly and #mobileMoreMenuBtn visible');

      await land.page.click('#mobileMoreMenuBtn');
      await land.page.waitForTimeout(120);
      await land.page.click('#mobileMoreSheetNavRow button[data-tab="subjects"]');
      await land.page.waitForTimeout(150);
      const subjectsActive = await land.page.evaluate(() => document.getElementById('subjects')?.classList.contains('active'));
      assert(subjectsActive, '896x414 landscape: More drawer switches workspace cleanly to Subjects');

      await land.page.click('#mobileMoreMenuBtn');
      await land.page.waitForTimeout(120);
      await land.page.click('#mobileMoreDriveBtn');
      await land.page.waitForTimeout(150);
      const driveActive = await land.page.evaluate(() => document.getElementById('driveHubModalOverlay')?.classList.contains('active'));
      assert(driveActive, '896x414 landscape: More drawer opens Google Drive Hub cleanly');
      await land.page.keyboard.press('Escape');
      assert(land.pageErrors.length === 0 && land.consoleErrors.length === 0, '896x414 landscape session zero runtime errors');
      await land.context.close();
    }

    // ------------------------------------------------------------------------
    // 3. Populated Study Library -> Subject TOC -> Chapter Workspace -> Mobile PDF Studio + Audio
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Populated Chapter Workspace, Mobile Studio (Portrait + Landscape) & Audio ---');
    {
      const st = await openFreshPage(browser, { width: 390, height: 844 });
      await seedRichWorkspace(st.page, pdfB64, wavB64);

      await st.page.click('.mobile-nav-item[data-tab="subjects"]');
      await st.page.waitForSelector('.subject-card.exo-cutout-card', { timeout: 6000 });
      await st.page.waitForTimeout(200);
      await st.page.screenshot({ path: path.join(screenshotDir, 'subjects-populated-390x844.png') });

      await st.page.click('.subject-card.exo-cutout-card');
      await st.page.waitForSelector('.group-card .exo-toc-open-workspace-btn', { timeout: 6000 });
      await st.page.click('.group-card .exo-toc-open-workspace-btn');
      await st.page.waitForSelector('#chapter-workspace-view', { state: 'visible', timeout: 6000 });
      await st.page.waitForTimeout(220);

      const cwCheck = await st.page.evaluate(() => {
        const nav = document.querySelector('.navbar');
        const header = document.getElementById('cwHeader');
        const navRect = nav ? nav.getBoundingClientRect() : { bottom: 0 };
        const hdrRect = header ? header.getBoundingClientRect() : { top: 0 };
        return {
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          tabsCount: document.querySelectorAll('.exo-cw-tabs button, .exo-cw-tab-btn').length,
          headerTop: Math.round(hdrRect.top),
          navBottom: Math.round(navRect.bottom)
        };
      });
      assert(!cwCheck.overflow && cwCheck.tabsCount >= 2, '390x844 Chapter Workspace renders cleanly without horizontal overflow');
      assert(cwCheck.headerTop >= cwCheck.navBottom - 2, `390x844 Chapter Workspace top sits clear below .navbar (headerTop=${cwCheck.headerTop} >= navBottom=${cwCheck.navBottom})`);
      await st.page.screenshot({ path: path.join(screenshotDir, 'chapter-populated-390x844.png') });

      // Launch Studio on 390x844 mobile portrait
      await st.page.click('#cwOpenStudioPrimaryBtn');
      await st.page.waitForSelector('#pdfViewerModalOverlay.active', { timeout: 6000 });
      await st.page.waitForTimeout(450);

      const portraitStudio = await st.page.evaluate(() => {
        const overlay = document.getElementById('pdfViewerModalOverlay');
        const container = document.getElementById('pdfModalContainer');
        const navbar = document.querySelector('.navbar');
        const header = document.querySelector('.pdf-viewer-header');
        const dock = document.getElementById('pdfAnnotationToolbar');
        const r = container ? container.getBoundingClientRect() : { width: 0, height: 0, top: -1 };
        const hR = header ? header.getBoundingClientRect() : { height: 0, top: -1 };
        const dR = dock ? dock.getBoundingClientRect() : { top: 0, bottom: 0 };
        const renderedCanvases = document.querySelectorAll('.pdf-page-wrapper canvas.pdf-render-canvas').length;
        const dockBtns = dock ? Array.from(dock.querySelectorAll('button.anno-btn')).filter(b => getComputedStyle(b).display !== 'none') : [];
        const smallDockBtns = dockBtns.filter(b => {
          const br = b.getBoundingClientRect();
          return br.width < 44 || br.height < 44;
        }).map(b => `${b.id || b.title}(${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)})`);
        const headerBtns = header ? Array.from(header.querySelectorAll('button')).filter(b => b.offsetParent !== null) : [];
        const smallHeaderBtns = headerBtns.filter(b => {
          const br = b.getBoundingClientRect();
          return br.width < 44 || br.height < 44;
        }).map(b => `${b.id || b.title}(${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)})`);
        const palmVis = Boolean(document.getElementById('toolBtn_palmReject') && getComputedStyle(document.getElementById('toolBtn_palmReject')).display !== 'none');
        const noteVis = Boolean(document.getElementById('pdfToolbarExtraNoteBtn') && getComputedStyle(document.getElementById('pdfToolbarExtraNoteBtn')).display !== 'none');
        const exportVis = Boolean(document.getElementById('pdfToolbarExportPdfBtn') && getComputedStyle(document.getElementById('pdfToolbarExportPdfBtn')).display !== 'none');
        return {
          active: Boolean(overlay && overlay.classList.contains('active')),
          navbarHidden: Boolean(navbar && getComputedStyle(navbar).display === 'none'),
          headerAtTop: hR.top >= -1 && hR.top <= 4,
          containerTop: Math.round(r.top),
          fullWidth: Math.round(r.width) >= 388,
          fullHeight: Math.round(r.height) >= 840,
          headerHeight: Math.round(hR.height),
          dockBottom: Math.round(dR.bottom),
          dockAtBottom: dR.bottom > window.innerHeight - 60 && dR.top > window.innerHeight * 0.65,
          renderedCanvases,
          smallHeaderBtns,
          smallDockBtns,
          dockCount: dockBtns.length,
          palmVis,
          noteVis,
          exportVis
        };
      });
      assert(portraitStudio.active && portraitStudio.navbarHidden && portraitStudio.headerAtTop && portraitStudio.fullWidth && portraitStudio.fullHeight,
        `390x844 Studio expands full-viewport from y=0 with .navbar hidden (navbarHidden=${portraitStudio.navbarHidden}, top=${portraitStudio.containerTop}, ${portraitStudio.fullWidth}x${portraitStudio.fullHeight})`);
      assert(portraitStudio.headerHeight <= 56 && portraitStudio.smallHeaderBtns.length === 0, `390x844 Studio header (${portraitStudio.headerHeight}px) controls all >=44x44px (${portraitStudio.smallHeaderBtns.join(', ')})`);
      assert(portraitStudio.dockAtBottom, `390x844 Studio annotation toolbar anchors at viewport bottom (bottom=${portraitStudio.dockBottom}/${844})`);
      assert(portraitStudio.renderedCanvases >= 3, `390x844 Studio renders all seeded PDF slide canvases (${portraitStudio.renderedCanvases})`);
      assert(portraitStudio.smallDockBtns.length === 0 && portraitStudio.dockCount >= 10, `390x844 Studio bottom dock buttons (${portraitStudio.dockCount}) all >=44x44px (${portraitStudio.smallDockBtns.join(', ')})`);
      assert(portraitStudio.palmVis && portraitStudio.noteVis && portraitStudio.exportVis, '390x844 Studio dock exposes Palm Reject, Extra Summary Note & Export PDF buttons');

      // Test pen options flyout centering + Audio Bar toggle without overflow
      await st.page.click('#pdfTogglePenOptionsBtn');
      await st.page.waitForTimeout(120);
      const flyoutRect = await st.page.evaluate(() => {
        const f = document.getElementById('pdfPenOptionsFlyout');
        const r = f ? f.getBoundingClientRect() : null;
        return r ? { active: f.classList.contains('open'), left: r.left, right: r.right, overflow: r.right > window.innerWidth + 1 || r.left < -1 } : null;
      });
      assert(flyoutRect && flyoutRect.active && !flyoutRect.overflow, '390x844 Studio Pen Options flyout stays within mobile viewport bounds');
      await st.page.click('#pdfTogglePenOptionsBtn');

      const audioAlreadyOpen = await st.page.evaluate(() => document.getElementById('pdfAudioPlayerBar')?.classList.contains('active-audio-dock'));
      if (!audioAlreadyOpen) await st.page.click('#pdfAudioBarToggleBtn');
      await st.page.waitForTimeout(160);
      const audioBarCheck = await st.page.evaluate(() => {
        const bar = document.getElementById('pdfAudioPlayerBar');
        const btns = bar ? Array.from(bar.querySelectorAll('button')).filter(b => b.offsetParent !== null) : [];
        const small = btns.filter(b => {
          const r = b.getBoundingClientRect();
          return r.width < 44 || r.height < 44;
        }).map(b => `${b.id || b.title}(${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)})`);
        return {
          visible: Boolean(bar && getComputedStyle(bar).display !== 'none'),
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          small
        };
      });
      assert(audioBarCheck.visible && !audioBarCheck.overflow && audioBarCheck.small.length === 0, `390x844 Studio Audio bar wraps cleanly with >=44px controls (${audioBarCheck.small.join(', ')})`);

      await st.page.screenshot({ path: path.join(screenshotDir, 'studio-portrait-390x844.png') });

      // Resize to mobile landscape 896x414 and verify Studio stays full viewport cleanly
      await st.page.setViewportSize({ width: 896, height: 414 });
      await st.page.waitForTimeout(260);
      const landStudio = await st.page.evaluate(() => {
        const container = document.getElementById('pdfModalContainer');
        const navbar = document.querySelector('.navbar');
        const dock = document.getElementById('pdfAnnotationToolbar');
        const r = container ? container.getBoundingClientRect() : { width: 0, height: 0, top: -1 };
        const dR = dock ? dock.getBoundingClientRect() : { top: 0, bottom: 0 };
        return {
          width: Math.round(r.width),
          height: Math.round(r.height),
          top: Math.round(r.top),
          navbarHidden: Boolean(navbar && getComputedStyle(navbar).display === 'none'),
          dockAtBottom: dR.bottom > window.innerHeight - 60 && dR.top > window.innerHeight * 0.5,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1
        };
      });
      assert(landStudio.navbarHidden && landStudio.top >= -1 && landStudio.top <= 4 && landStudio.width >= 890 && landStudio.height >= 408 && landStudio.dockAtBottom && !landStudio.overflow,
        `896x414 landscape Studio uses full viewport from y=0 with bottom dock (${landStudio.width}x${landStudio.height}, top=${landStudio.top}, dockAtBottom=${landStudio.dockAtBottom})`);
      await st.page.screenshot({ path: path.join(screenshotDir, 'studio-landscape-896x414.png') });

      // Close Studio & verify #mobileBottomNav returns on 390x844
      await st.page.setViewportSize({ width: 390, height: 844 });
      await st.page.click('#pdfBackToChapterBtn');
      await st.page.waitForTimeout(180);
      const afterClose = await st.page.evaluate(() => {
        const overlay = document.getElementById('pdfViewerModalOverlay');
        const bottom = document.getElementById('mobileBottomNav');
        return {
          closed: Boolean(overlay && !overlay.classList.contains('active')),
          bottomRestored: Boolean(bottom && getComputedStyle(bottom).display !== 'none')
        };
      });
      assert(afterClose.closed && afterClose.bottomRestored, 'Back to Chapter closes mobile Studio cleanly and restores #mobileBottomNav');
      assert(st.pageErrors.length === 0 && st.consoleErrors.length === 0, 'Studio portrait+landscape session zero runtime errors');
      await st.context.close();
    }

    // ------------------------------------------------------------------------
    // 4. Weekly Planner Horizontal Day Switcher, Summary Strip, Tracker & Confirm Modal EN/AR
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Weekly Planner Single-Row Snap, Tracker & Confirm Modal EN/AR ---');
    {
      const pl = await openFreshPage(browser, { width: 390, height: 844 });
      await seedRichWorkspace(pl.page, pdfB64, wavB64);

      await pl.page.click('.mobile-nav-item[data-tab="schedule"]');
      await pl.page.waitForTimeout(200);
      await pl.page.click('#schPillToday');
      await pl.page.waitForTimeout(200);

      const plannerEn = await pl.page.evaluate(() => {
        const switcher = document.getElementById('notionDaySwitcher');
        const pills = switcher ? Array.from(switcher.querySelectorAll('.notion-day-pill')) : [];
        const tops = new Set(pills.map(p => Math.round(p.getBoundingClientRect().top)));
        const smallPills = pills.filter(p => p.getBoundingClientRect().height < 43.5).map(p => `${p.textContent.trim()}(${Math.round(p.getBoundingClientRect().height)})`);
        const summary = document.getElementById('plannerJournalSummaryStrip');
        const cols = summary ? getComputedStyle(summary).gridTemplateColumns.trim().split(/\s+/).length : 0;
        const schPillsSmall = Array.from(document.querySelectorAll('.sch-pill')).filter(p => p.offsetParent !== null && p.getBoundingClientRect().height < 43.5).map(p => `${p.id}(${Math.round(p.getBoundingClientRect().height)})`);
        return {
          pillCount: pills.length,
          distinctTops: tops.size,
          flexWrap: switcher ? getComputedStyle(switcher).flexWrap : '',
          smallPills,
          summaryCols: cols,
          schPillsSmall,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1
        };
      });
      assert(plannerEn.pillCount === 7 && plannerEn.distinctTops === 1 && plannerEn.flexWrap === 'nowrap', `EN Weekly Planner day switcher is single-row horizontal scroll (pills=${plannerEn.pillCount}, rows=${plannerEn.distinctTops})`);
      assert(plannerEn.smallPills.length === 0 && plannerEn.schPillsSmall.length === 0,
        `Planner segmented pills & day pills meet >=44px height (daySmall=[${plannerEn.smallPills.join(',')}], schSmall=[${plannerEn.schPillsSmall.join(',')}])`);
      assert(plannerEn.summaryCols === 2 && !plannerEn.overflow, `Planner summary strip uses compact 2-col layout (${plannerEn.summaryCols} cols) with zero overflow`);
      await pl.page.screenshot({ path: path.join(screenshotDir, 'planner-390x844-en.png') });

      // Test Confirm Modal EN localization + z-index above #mobileBottomNav
      await pl.page.evaluate(() => {
        openConfirmModal('Remove this sample item from view?', () => {}, {
          titleEn: 'Clear Session',
          confirmLabelEn: 'Delete',
          cancelLabelEn: 'Cancel'
        });
      });
      await pl.page.waitForTimeout(150);
      const confirmEn = await pl.page.evaluate(() => {
        const ov = document.getElementById('confirmModalOverlay');
        const title = document.getElementById('confirmModalTitleText')?.textContent?.trim();
        const cancelText = document.getElementById('confirmModalCancelBtn')?.textContent?.trim();
        const okBtn = document.getElementById('confirmModalBtn');
        const cancelBtn = document.getElementById('confirmModalCancelBtn');
        const z = ov ? Number(getComputedStyle(ov).zIndex || 0) : 0;
        return {
          active: Boolean(ov && ov.classList.contains('active')),
          title,
          cancelText,
          zAboveBottomNav: z >= 1200,
          okHeight: okBtn ? Math.round(okBtn.getBoundingClientRect().height) : 0,
          cancelHeight: cancelBtn ? Math.round(cancelBtn.getBoundingClientRect().height) : 0
        };
      });
      assert(confirmEn.active && confirmEn.zAboveBottomNav && confirmEn.cancelText === 'Cancel' && confirmEn.okHeight >= 44 && confirmEn.cancelHeight >= 44,
        `EN Confirm modal renders above bottom nav with >=44px buttons (cancel="${confirmEn.cancelText}", okH=${confirmEn.okHeight}, cancelH=${confirmEn.cancelHeight})`);
      await pl.page.click('#confirmModalCancelBtn');
      await pl.page.waitForTimeout(100);

      // Switch to AR RTL
      await pl.page.evaluate(() => { applyExoLanguage('ar', false); });
      await pl.page.waitForTimeout(220);
      const plannerAr = await pl.page.evaluate(() => {
        const switcher = document.getElementById('notionDaySwitcher');
        const pills = switcher ? Array.from(switcher.querySelectorAll('.notion-day-pill')) : [];
        const tops = new Set(pills.map(p => Math.round(p.getBoundingClientRect().top)));
        return {
          dir: document.documentElement.dir,
          distinctTops: tops.size,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1
        };
      });
      assert(plannerAr.dir === 'rtl' && plannerAr.distinctTops === 1 && !plannerAr.overflow, 'AR RTL Weekly Planner preserves single-row day switcher & zero horizontal overflow');
      await pl.page.screenshot({ path: path.join(screenshotDir, 'planner-390x844-ar.png') });

      // Test Confirm Modal AR localization
      await pl.page.evaluate(() => { openConfirmModal('هل تريد المتابعة؟', () => {}); });
      await pl.page.waitForTimeout(120);
      const confirmAr = await pl.page.evaluate(() => ({
        cancelText: document.getElementById('confirmModalCancelBtn')?.textContent?.trim(),
        okText: document.getElementById('confirmModalBtn')?.textContent?.trim()
      }));
      assert(confirmAr.cancelText === 'إلغاء' && /[\u0600-\u06FF]/.test(confirmAr.okText || ''), `AR Confirm modal localized cleanly (cancel="${confirmAr.cancelText}", ok="${confirmAr.okText}")`);
      await pl.page.click('#confirmModalCancelBtn');

      // Switch back to EN & Tracker screenshot
      await pl.page.evaluate(() => { applyExoLanguage('en', false); });
      await pl.page.click('.mobile-nav-item[data-tab="tracker"]');
      await pl.page.waitForTimeout(220);
      const trackerOverflow = await pl.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert(!trackerOverflow, '390x844 Tracker renders cleanly with zero horizontal overflow');
      await pl.page.screenshot({ path: path.join(screenshotDir, 'tracker-390x844-en.png') });

      assert(pl.pageErrors.length === 0 && pl.consoleErrors.length === 0, 'Planner/Tracker/Confirm session zero runtime errors');
      await pl.context.close();
    }

    // ------------------------------------------------------------------------
    // 5. Actionable Help Center (Quick Actions, Checklist, Guides, Troubleshooting,
    //    Bilingual Smart Search, Mobile Spotlight Tour, Contextual ? Triggers)
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Actionable Help Center, Troubleshooting, Smart Search & Contextual Triggers ---');
    {
      const hc = await openFreshPage(browser, { width: 390, height: 844 });
      await seedRichWorkspace(hc.page, pdfB64, wavB64);

      // Test Contextual ? buttons first (Library, Planner, Tracker)
      await hc.page.click('.mobile-nav-item[data-tab="subjects"]');
      await hc.page.waitForTimeout(150);
      await hc.page.click('#libraryHelpTriggerBtn');
      await hc.page.waitForSelector('#helpModalOverlay.active', { timeout: 5000 });
      const libHelpModule = await hc.page.evaluate(() => {
        const p = document.getElementById('acadPane_2');
        return Boolean(p && p.classList.contains('active') && getComputedStyle(p).display !== 'none');
      });
      assert(libHelpModule, 'Contextual #libraryHelpTriggerBtn opens Help Center directly at Module 2 (Study Library)');
      await hc.page.click('#helpModalCloseBtn');
      await hc.page.waitForTimeout(120);

      await hc.page.click('.mobile-nav-item[data-tab="schedule"]');
      await hc.page.waitForTimeout(150);
      await hc.page.click('#plannerHelpTriggerBtn');
      await hc.page.waitForSelector('#helpModalOverlay.active', { timeout: 5000 });
      const planHelpModule = await hc.page.evaluate(() => {
        const p = document.getElementById('acadPane_4');
        return Boolean(p && p.classList.contains('active') && getComputedStyle(p).display !== 'none');
      });
      assert(planHelpModule, 'Contextual #plannerHelpTriggerBtn opens Help Center directly at Module 4 (Weekly Planner)');
      await hc.page.click('#helpModalCloseBtn');
      await hc.page.waitForTimeout(120);

      await hc.page.click('.mobile-nav-item[data-tab="tracker"]');
      await hc.page.waitForTimeout(150);
      await hc.page.click('#trackerHelpTriggerBtn');
      await hc.page.waitForSelector('#helpModalOverlay.active', { timeout: 5000 });
      const trackHelpModule = await hc.page.evaluate(() => {
        const p = document.getElementById('acadPane_5');
        return Boolean(p && p.classList.contains('active') && getComputedStyle(p).display !== 'none');
      });
      assert(trackHelpModule, 'Contextual #trackerHelpTriggerBtn opens Help Center directly at Module 5 (Tracker & Sync)');

      // Inspect Help Modal Mobile Close Button, Quick Actions & Checklist on 390x844
      const inspectHelpCenterTouchTargets = (page) => page.evaluate(() => {
        const roundRect = (r) => r ? {
          x: Number(r.x.toFixed(2)),
          y: Number(r.y.toFixed(2)),
          width: Number(r.width.toFixed(2)),
          height: Number(r.height.toFixed(2)),
          top: Number(r.top.toFixed(2)),
          right: Number(r.right.toFixed(2)),
          bottom: Number(r.bottom.toFixed(2)),
          left: Number(r.left.toFixed(2))
        } : null;

        const closeBtn = document.getElementById('helpModalCloseBtn');
        const cRect = closeBtn ? closeBtn.getBoundingClientRect() : null;
        const cStyle = closeBtn ? getComputedStyle(closeBtn) : null;
        const cParent = closeBtn ? closeBtn.parentElement : null;
        const cParentRect = cParent ? cParent.getBoundingClientRect() : null;
        const cParentStyle = cParent ? getComputedStyle(cParent) : null;
        const headerRow = document.querySelector('#helpModalOverlay .eg-header-top-row');
        const headerRowRect = headerRow ? headerRow.getBoundingClientRect() : null;
        const headerRowStyle = headerRow ? getComputedStyle(headerRow) : null;

        let closeOverlaps = [];
        if (closeBtn && cRect && cRect.width > 0 && cRect.height > 0 && headerRow) {
          const peers = Array.from(headerRow.querySelectorAll('button, h3, p, a, input')).filter(el => el !== closeBtn && !closeBtn.contains(el) && !el.contains(closeBtn) && el.offsetParent !== null);
          for (const peer of peers) {
            const pr = peer.getBoundingClientRect();
            const ix = Math.min(cRect.right, pr.right) - Math.max(cRect.left, pr.left);
            const iy = Math.min(cRect.bottom, pr.bottom) - Math.max(cRect.top, pr.top);
            if (ix > 1 && iy > 1) {
              closeOverlaps.push({
                id: peer.id || peer.tagName,
                className: peer.className || '',
                overlapX: Number(ix.toFixed(2)),
                overlapY: Number(iy.toFixed(2)),
                rect: roundRect(pr)
              });
            }
          }
          const cx = Math.min(window.innerWidth - 1, Math.max(0, cRect.left + cRect.width / 2));
          const cy = Math.min(window.innerHeight - 1, Math.max(0, cRect.top + cRect.height / 2));
          const hitEl = document.elementFromPoint(cx, cy);
          if (hitEl && hitEl !== closeBtn && !closeBtn.contains(hitEl)) {
            closeOverlaps.push({
              hitTestBlockedBy: `${hitEl.tagName}#${hitEl.id || ''}.${hitEl.className || ''}`,
              probe: { x: Number(cx.toFixed(2)), y: Number(cy.toFixed(2)) }
            });
          }
        }

        const closeDiagnostics = {
          exists: Boolean(closeBtn),
          rect: roundRect(cRect),
          computed: cStyle ? {
            display: cStyle.display,
            position: cStyle.position,
            minWidth: cStyle.minWidth,
            minHeight: cStyle.minHeight,
            width: cStyle.width,
            height: cStyle.height,
            padding: cStyle.padding,
            flex: cStyle.flex,
            flexGrow: cStyle.flexGrow,
            flexShrink: cStyle.flexShrink,
            flexBasis: cStyle.flexBasis,
            visibility: cStyle.visibility,
            opacity: cStyle.opacity,
            boxSizing: cStyle.boxSizing
          } : null,
          parentTag: cParent ? `${cParent.tagName}.${cParent.className}` : null,
          parentRect: roundRect(cParentRect),
          parentOverflow: cParentStyle ? {
            display: cParentStyle.display,
            overflow: cParentStyle.overflow,
            overflowX: cParentStyle.overflowX,
            overflowY: cParentStyle.overflowY
          } : null,
          headerRowRect: roundRect(headerRowRect),
          headerRowStyle: headerRowStyle ? {
            display: headerRowStyle.display,
            flexWrap: headerRowStyle.flexWrap,
            overflow: headerRowStyle.overflow,
            gap: headerRowStyle.gap
          } : null,
          overlapsOtherElement: closeOverlaps.length > 0,
          overlaps: closeOverlaps
        };

        const quickContainer = document.getElementById('helpQuickActionsBar');
        const qContainerRect = quickContainer ? quickContainer.getBoundingClientRect() : null;
        const qContainerStyle = quickContainer ? getComputedStyle(quickContainer) : null;
        const quickBtns = Array.from(document.querySelectorAll('#helpQuickActionsBar button'));
        const quickActionsDiagnostics = quickBtns.map((b) => {
          const br = b.getBoundingClientRect();
          const bs = getComputedStyle(b);
          const clippedVertically = Boolean(qContainerRect && (br.top < qContainerRect.top - 1 || br.bottom > qContainerRect.bottom + 1));
          const clippedHorizontallyByParent = Boolean(
            qContainerRect &&
            qContainerStyle &&
            (qContainerStyle.overflowX === 'hidden' || qContainerStyle.overflowX === 'clip') &&
            (br.left < qContainerRect.left - 1 || br.right > qContainerRect.right + 1)
          );
          return {
            action: b.getAttribute('data-help-action') || '',
            label: (b.textContent || '').trim(),
            rect: roundRect(br),
            actualWidth: Number(br.width.toFixed(2)),
            actualHeight: Number(br.height.toFixed(2)),
            computedWidth: bs.width,
            computedHeight: bs.height,
            minWidth: bs.minWidth,
            minHeight: bs.minHeight,
            flexGrow: bs.flexGrow,
            flexShrink: bs.flexShrink,
            flexBasis: bs.flexBasis,
            padding: bs.padding,
            lineHeight: bs.lineHeight,
            whiteSpace: bs.whiteSpace,
            visibility: bs.visibility,
            opacity: bs.opacity,
            display: bs.display,
            clippedVertically,
            clippedHorizontallyByParent,
            clippedByParent: clippedVertically || clippedHorizontallyByParent
          };
        });

        const quickContainerDiagnostics = {
          exists: Boolean(quickContainer),
          rect: roundRect(qContainerRect),
          scrollWidth: quickContainer ? quickContainer.scrollWidth : 0,
          clientWidth: quickContainer ? quickContainer.clientWidth : 0,
          scrollHeight: quickContainer ? quickContainer.scrollHeight : 0,
          clientHeight: quickContainer ? quickContainer.clientHeight : 0,
          computed: qContainerStyle ? {
            display: qContainerStyle.display,
            flexDirection: qContainerStyle.flexDirection,
            flexWrap: qContainerStyle.flexWrap,
            alignItems: qContainerStyle.alignItems,
            gap: qContainerStyle.gap,
            padding: qContainerStyle.padding,
            overflow: qContainerStyle.overflow,
            overflowX: qContainerStyle.overflowX,
            overflowY: qContainerStyle.overflowY,
            height: qContainerStyle.height,
            minHeight: qContainerStyle.minHeight,
            maxHeight: qContainerStyle.maxHeight
          } : null
        };

        const quickSmallButtons = quickActionsDiagnostics.filter(item => item.actualHeight < 44);
        const quickSmall = quickSmallButtons.length;
        const checklistItems = document.querySelectorAll('#helpGettingStartedChecklistMount .exo-help-check-row').length;
        const panes = [1, 2, 3, 4, 5, 6].map(n => document.getElementById(`acadPane_${n}`)?.innerText || '').join('\n');
        const arabicInEnPanes = /[\u0600-\u06FF]/.test(panes);
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight, dir: document.documentElement.dir || 'ltr' },
          closeVisibleTopEnd: Boolean(cRect && cRect.width >= 44 && cRect.height >= 44 && cRect.top >= -1 && cRect.top < 120 && cRect.left >= -1 && cRect.right <= window.innerWidth + 1 && !closeDiagnostics.overlapsOtherElement),
          closeDiagnostics,
          quickCount: quickBtns.length,
          quickSmall,
          quickSmallButtons,
          quickContainerDiagnostics,
          quickActionsDiagnostics,
          checklistItems,
          arabicInEnPanes,
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1
        };
      });

      const settleHelpModal = async (page) => {
        await page.waitForSelector('#helpModalOverlay.active', { timeout: 5000 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.waitForTimeout(220);
      };

      await hc.page.evaluate(() => { openHelpModal(1); });
      await settleHelpModal(hc.page);
      const helpLayout = await inspectHelpCenterTouchTargets(hc.page);
      assert(
        helpLayout.closeVisibleTopEnd,
        '390x844 Help Modal Close button is pinned cleanly on top row (>=44x44px)',
        JSON.stringify({ viewport: helpLayout.viewport, close: helpLayout.closeDiagnostics })
      );
      assert(
        helpLayout.quickCount === 8 && helpLayout.quickSmall === 0,
        `Help Quick Actions Bar renders 8 actions (${helpLayout.quickCount}) all >=44px tall`,
        JSON.stringify({ viewport: helpLayout.viewport, container: helpLayout.quickContainerDiagnostics, failingButtons: helpLayout.quickSmallButtons, allButtons: helpLayout.quickActionsDiagnostics })
      );
      assert(helpLayout.checklistItems === 7, `Getting Started Checklist renders live 7 steps (got ${helpLayout.checklistItems})`);
      assert(!helpLayout.arabicInEnPanes, 'EN Help Center panes emit zero visible Arabic text (synonyms live cleanly in data-help-keywords)');
      assert(!helpLayout.overflow, `390x844 Help Modal renders with zero horizontal overflow (${helpLayout.scrollWidth} <= ${helpLayout.innerWidth})`);
      await hc.page.screenshot({ path: path.join(screenshotDir, 'help-390x844-en.png') });

      // Targeted Help Center multi-viewport touch-target & overflow matrix (320, 360, 390 EN/AR + 768 EN)
      const helpMatrixViewports = [
        { width: 320, height: 720, lang: 'en' },
        { width: 320, height: 720, lang: 'ar' },
        { width: 360, height: 740, lang: 'en' },
        { width: 360, height: 740, lang: 'ar' },
        { width: 390, height: 844, lang: 'en' },
        { width: 390, height: 844, lang: 'ar' },
        { width: 768, height: 1024, lang: 'en' }
      ];
      for (const hvp of helpMatrixViewports) {
        await hc.page.evaluate(() => { closeModal('helpModalOverlay'); });
        await hc.page.setViewportSize({ width: hvp.width, height: hvp.height });
        await hc.page.evaluate((lng) => {
          if (typeof applyExoLanguage === 'function') applyExoLanguage(lng, false);
          openHelpModal(1);
        }, hvp.lang);
        await settleHelpModal(hc.page);
        const hm = await inspectHelpCenterTouchTargets(hc.page);
        const expectedDir = hvp.lang === 'ar' ? 'rtl' : 'ltr';
        const closeOk = Boolean(
          hm.closeVisibleTopEnd &&
          hm.closeDiagnostics.computed &&
          hm.closeDiagnostics.computed.visibility === 'visible' &&
          Number(hm.closeDiagnostics.computed.opacity) >= 0.99
        );
        const quickBad = hm.quickActionsDiagnostics.filter(b =>
          b.actualHeight < 44 ||
          b.actualWidth < 44 ||
          b.visibility !== 'visible' ||
          Number(b.opacity) < 0.99 ||
          b.clippedByParent
        );
        assert(
          closeOk && hm.viewport.dir === expectedDir,
          `Help Center ${hvp.width}x${hvp.height} (${hvp.lang.toUpperCase()}): #helpModalCloseBtn pinned on top row >=44x44px unclipped (${hm.closeDiagnostics.rect?.width}x${hm.closeDiagnostics.rect?.height}, top=${hm.closeDiagnostics.rect?.top})`,
          JSON.stringify({ viewport: hm.viewport, close: hm.closeDiagnostics })
        );
        assert(
          hm.quickCount === 8 && quickBad.length === 0,
          `Help Center ${hvp.width}x${hvp.height} (${hvp.lang.toUpperCase()}): all 8 Quick Actions >=44px tall & unclipped (minH=${Math.min(...hm.quickActionsDiagnostics.map(b => b.actualHeight))}px)`,
          JSON.stringify({ viewport: hm.viewport, container: hm.quickContainerDiagnostics, badButtons: quickBad, allButtons: hm.quickActionsDiagnostics })
        );
        assert(
          !hm.overflow,
          `Help Center ${hvp.width}x${hvp.height} (${hvp.lang.toUpperCase()}): zero horizontal page overflow (${hm.scrollWidth} <= ${hm.innerWidth})`,
          JSON.stringify({ viewport: hm.viewport, scrollWidth: hm.scrollWidth, innerWidth: hm.innerWidth })
        );
      }
      // Restore 390x844 EN cleanly for remaining Section 5 assertions
      await hc.page.setViewportSize({ width: 390, height: 844 });
      await hc.page.evaluate(() => {
        if (typeof applyExoLanguage === 'function') applyExoLanguage('en', false);
        openHelpModal(1);
      });
      await settleHelpModal(hc.page);

      // Checklist progression check when backup export timestamp is recorded
      const checklistProgress = await hc.page.evaluate(() => {
        const beforeDone = deriveHelpGettingStartedChecklist(exoCollectHelpChecklistSnapshot(), true).completedCount;
        localStorage.setItem('pharmaLastBackupExportV1', String(Date.now()));
        renderHelpQuickActionsAndChecklist(true);
        const afterDone = deriveHelpGettingStartedChecklist(exoCollectHelpChecklistSnapshot(), true).completedCount;
        return { beforeDone, afterDone };
      });
      assert(checklistProgress.afterDone === checklistProgress.beforeDone + 1, `Help Checklist increments live on real milestone (${checklistProgress.beforeDone} -> ${checklistProgress.afterDone})`);

      // Smart Bilingual Search: 'shortcuts' -> pane 5; Arabic 'مزامنة' finds Sync guide in EN mode; zero-match shows suggestion chips
      const searchResults = await hc.page.evaluate(() => {
        const input = document.getElementById('helpSearchInput');
        input.value = 'shortcuts';
        filterHelpCenterContent('shortcuts');
        const shortcutsPane5Visible = document.getElementById('acadPane_5')?.style.display === 'block';
        const emptyAfterShortcuts = document.getElementById('helpSearchEmptyState')?.style.display === 'block';

        input.value = 'مزامنة';
        filterHelpCenterContent('مزامنة');
        const syncCardVisibleInEn = document.getElementById('help_sync_vs_backup')?.style.display !== 'none';

        input.value = 'zzzz_no_match_999';
        filterHelpCenterContent('zzzz_no_match_999');
        const emptyShown = document.getElementById('helpSearchEmptyState')?.style.display === 'block';
        const chipCount = document.querySelectorAll('#helpSearchEmptyState button').length;

        input.value = '';
        filterHelpCenterContent('');
        return { shortcutsPane5Visible, emptyAfterShortcuts, syncCardVisibleInEn, emptyShown, chipCount };
      });
      assert(searchResults.shortcutsPane5Visible && !searchResults.emptyAfterShortcuts, 'Help smart search matches "shortcuts" in Module 5 cleanly');
      assert(searchResults.syncCardVisibleInEn, 'Cross-language smart search matches Arabic "مزامنة" to Sync Guide even in EN mode');
      assert(searchResults.emptyShown && searchResults.chipCount >= 3, `Zero-match query displays #helpSearchEmptyState with clickable recovery chips (${searchResults.chipCount})`);

      // Live Troubleshooting in Module 6 (#acadPane_6)
      await hc.page.evaluate(() => {
        if (typeof exoRuntimeStatusState !== 'undefined') {
          exoRuntimeStatusState.lsQuotaFailedDomains = new Set(['subjects']);
        }
        renderHelpQuickActionsAndChecklist(true);
      });
      const tsActive = await hc.page.evaluate(() => {
        const quotaCard = document.getElementById('ts_quota_storage');
        const quotaBadge = quotaCard ? quotaCard.querySelector('.exo-ts-active-badge') : null;
        return Boolean(quotaCard && quotaCard.classList.contains('is-active-issue') && quotaBadge);
      });
      assert(tsActive, 'Live Troubleshooting highlights active recovery guides when quota issues are detected');

      // Quick Action execution -> switches cleanly to Planner
      await hc.page.click('#helpQuickActionsBar button[data-help-action="go_planner"]');
      await hc.page.waitForTimeout(180);
      const qaNavigated = await hc.page.evaluate(() => {
        const helpClosed = !document.getElementById('helpModalOverlay')?.classList.contains('active');
        const plannerOpen = document.getElementById('schedule')?.classList.contains('active');
        return helpClosed && plannerOpen;
      });
      assert(qaNavigated, 'Help Quick Action executes directly on real UI (closes modal -> opens Planner)');

      // Mobile Spotlight Tour falls back to #cloudNavBtn & clears #mobileBottomNav
      await hc.page.evaluate(() => { startInteractiveSpotlightTour(); });
      await hc.page.waitForTimeout(220);
      const tourState = await hc.page.evaluate(() => {
        const card = document.getElementById('spotlightTourFloatingCard');
        const bottom = document.getElementById('mobileBottomNav');
        const cloudBtn = document.getElementById('cloudNavBtn');
        const cardRect = card ? card.getBoundingClientRect() : null;
        const bottomRect = bottom ? bottom.getBoundingClientRect() : null;
        return {
          active: Boolean(card && card.classList.contains('active')),
          cloudBtnVisible: Boolean(cloudBtn && cloudBtn.offsetParent !== null),
          clearsBottomNav: Boolean(cardRect && bottomRect && cardRect.bottom <= bottomRect.top + 4)
        };
      });
      assert(tourState.active && tourState.cloudBtnVisible && tourState.clearsBottomNav, 'Mobile Spotlight Tour Step 1 targets #cloudNavBtn & positions card above #mobileBottomNav');
      await hc.page.evaluate(() => { stopInteractiveSpotlightTour(); });

      assert(hc.pageErrors.length === 0 && hc.consoleErrors.length === 0, 'Actionable Help Center session zero runtime errors');
      await hc.context.close();
    }

    // ------------------------------------------------------------------------
    // 6. Real Mobile Sticky Topbar (.navbar) Scroll & Stacking Verification
    //    Widths: 360x740 & 390x844 on populated Subjects & Planner (top -> mid -> bottom)
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Real Mobile Sticky Topbar Scroll & ElementFromPoint Hit-Testing ---');
    {
      for (const vp of [{ width: 360, height: 740, tag: '360' }, { width: 390, height: 844, tag: '390' }]) {
        const sc = await openFreshPage(browser, { width: vp.width, height: vp.height });
        await seedRichWorkspace(sc.page, pdfB64, wavB64);

        // Add extra subjects/events so page scrollHeight significantly exceeds viewport height
        await sc.page.evaluate(() => {
          for (let i = 0; i < 8; i++) {
            subjects.push({
              id: 7500 + i,
              name: `Pharmacology Module ${i + 3} — Autonomic & Clinical Block`,
              color: i % 2 === 0 ? '#899982' : '#7898AC',
              icon: 'fa-book',
              isDivided: true,
              groups: [{ id: 7600 + i, name: `Chapter ${i + 1}`, lectures: [{ id: 7700 + i, title: `Lecture ${i + 1}` }] }]
            });
          }
          saveSubjects();
          const todayDay = new Date().getDay();
          for (let i = 0; i < 10; i++) {
            scheduleEvents.push({
              id: 8500 + i,
              title: `Deep Review Block ${i + 1}`,
              day: todayDay,
              startHour: 8 + (i % 10),
              duration: 1,
              type: 'study',
              subjectId: 7101,
              completed: i % 2 === 0
            });
          }
          saveScheduleData();
          if (typeof renderSubjectsList === 'function') renderSubjectsList();
          if (typeof renderSchedule === 'function') renderSchedule();
        });

        // Switch to Subjects and test top -> mid -> bottom scroll
        await sc.page.click('.mobile-nav-item[data-tab="subjects"]');
        await sc.page.waitForSelector('.subject-card.exo-cutout-card', { timeout: 6000 });
        await sc.page.waitForTimeout(200);

        const scrollTargets = await sc.page.evaluate(() => {
          const maxScroll = Math.max(0, Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight);
          return { maxScroll, mid: Math.round(maxScroll * 0.45), bottom: Math.round(maxScroll) };
        });
        assert(scrollTargets.maxScroll > 350, `${vp.tag}: Subjects view is tall enough for real scroll (${scrollTargets.maxScroll}px)`);

        const positions = [
          { name: 'top', y: 0 },
          { name: 'mid', y: scrollTargets.mid },
          { name: 'bottom', y: scrollTargets.bottom }
        ];
        for (const pos of positions) {
          await sc.page.evaluate((scrollY) => {
            window.scrollTo(0, scrollY);
            const mc = document.querySelector('.main-content');
            if (mc && mc.scrollHeight > mc.clientHeight) mc.scrollTop = scrollY;
          }, pos.y);
          await sc.page.waitForTimeout(160);

          const hit = await sc.page.evaluate((scrollYExpected) => {
            const nav = document.querySelector('.navbar');
            const rect = nav ? nav.getBoundingClientRect() : null;
            if (!rect) return { ok: false, reason: 'no_navbar' };
            const yProbe = Math.max(4, Math.min(rect.bottom - 4, rect.top + rect.height / 2));
            const xs = [32, Math.round(window.innerWidth * 0.5), Math.max(40, window.innerWidth - 32)];
            const hits = xs.map((x) => {
              const el = document.elementFromPoint(x, yProbe);
              return {
                x,
                insideNav: Boolean(el && nav.contains(el)),
                tag: el ? `${el.tagName}#${el.id || ''}.${el.className || ''}` : 'null'
              };
            });
            return {
              ok: rect.top >= -1 && rect.top <= 8 && rect.height >= 44 && hits.every(h => h.insideNav) && (scrollYExpected === 0 || window.scrollY > 50),
              top: Math.round(rect.top),
              height: Math.round(rect.height),
              scrollY: Math.round(window.scrollY),
              hits
            };
          }, pos.y);
          assert(hit.ok, `${vp.tag} Subjects scroll (${pos.name}, y=${hit.scrollY}): .navbar pinned on top & wins elementFromPoint at left/mid/right (top=${hit.top}, h=${hit.height})`, JSON.stringify(hit));

          if (vp.tag === '360') {
            await sc.page.screenshot({ path: path.join(screenshotDir, `after-scroll-360-${pos.name}.png`) });
            await sc.page.screenshot({ path: path.join(correctiveShotDir, `sticky-topbar-360-${pos.name}.png`) });
          } else if (pos.name === 'mid') {
            await sc.page.screenshot({ path: path.join(screenshotDir, `after-scroll-390-subjects-mid.png`) });
            await sc.page.screenshot({ path: path.join(correctiveShotDir, `sticky-topbar-390-subjects.png`) });
          }
        }

        // Open card overflow menu then scroll -> verify menu auto-dismisses cleanly
        await sc.page.evaluate(() => window.scrollTo(0, 0));
        await sc.page.waitForTimeout(120);
        const menuDismissedOnScroll = await sc.page.evaluate(async () => {
          const trigger = document.querySelector('.exo-card-overflow-trigger');
          if (!trigger) return { skip: true };
          trigger.click();
          await new Promise(r => setTimeout(r, 80));
          const openedBefore = document.querySelectorAll('.exo-card-overflow-menu.open').length;
          window.scrollBy(0, 260);
          window.dispatchEvent(new Event('scroll'));
          await new Promise(r => setTimeout(r, 140));
          const openAfter = document.querySelectorAll('.exo-card-overflow-menu.open').length;
          return { skip: false, openedBefore, openAfter };
        });
        assert(menuDismissedOnScroll.skip || (menuDismissedOnScroll.openedBefore >= 1 && menuDismissedOnScroll.openAfter === 0),
          `${vp.tag}: Scrolling dismisses open .exo-card-overflow-menu (${JSON.stringify(menuDismissedOnScroll)})`);

        // Switch to Planner & scroll to bottom -> check .navbar elementFromPoint
        await sc.page.click('.mobile-nav-item[data-tab="schedule"]');
        await sc.page.waitForTimeout(220);
        await sc.page.click('#schPillToday');
        await sc.page.waitForTimeout(180);
        await sc.page.evaluate(() => {
          const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          window.scrollTo(0, maxY);
        });
        await sc.page.waitForTimeout(180);
        const plannerHit = await sc.page.evaluate(() => {
          const nav = document.querySelector('.navbar');
          const rect = nav ? nav.getBoundingClientRect() : null;
          if (!rect) return { ok: false };
          const yProbe = Math.max(4, rect.top + rect.height / 2);
          const xs = [32, Math.round(window.innerWidth * 0.5), Math.max(40, window.innerWidth - 32)];
          const allNav = xs.every(x => {
            const el = document.elementFromPoint(x, yProbe);
            return Boolean(el && nav.contains(el));
          });
          return { ok: rect.top >= -1 && rect.top <= 8 && allNav, top: Math.round(rect.top) };
        });
        assert(plannerHit.ok, `${vp.tag} Planner bottom scroll: .navbar remains pinned above content (top=${plannerHit.top})`);
        if (vp.tag === '390') {
          await sc.page.screenshot({ path: path.join(screenshotDir, 'after-scroll-390-planner-bottom.png') });
          await sc.page.screenshot({ path: path.join(correctiveShotDir, 'sticky-topbar-390-planner.png') });
        }

        assert(sc.pageErrors.length === 0 && sc.consoleErrors.length === 0, `${vp.tag} scroll session zero runtime errors`);
        await sc.context.close();
      }
    }

    // ------------------------------------------------------------------------
    // 7. PDF Studio Badge (#pdfAutoSaveStatus) Unclipped Across All Widths + Studio Regression
    // ------------------------------------------------------------------------
    console.log('\n--- 7. PDF Studio Badge (#pdfAutoSaveStatus) Multi-Width & Functional Regression ---');
    {
      const studioPage = await openFreshPage(browser, { width: 390, height: 844 });
      await seedRichWorkspace(studioPage.page, pdfB64, wavB64);

      await studioPage.page.evaluate(async () => {
        activeSubjectId = 7101;
        await openLectureDocument(7201, 7301);
      });
      await studioPage.page.waitForSelector('#pdfViewerModalOverlay.active', { timeout: 6000 });
      await studioPage.page.waitForTimeout(350);

      const studioViewports = [
        { width: 320, height: 720, lang: 'en', shot: null, cShot: 'pdf-studio-320-en.png' },
        { width: 320, height: 720, lang: 'ar', shot: null, cShot: null },
        { width: 360, height: 740, lang: 'en', shot: 'after-pdf-badge-360.png', cShot: 'pdf-studio-360-en.png' },
        { width: 360, height: 740, lang: 'ar', shot: null, cShot: null },
        { width: 390, height: 844, lang: 'en', shot: 'after-pdf-badge-390.png', cShot: 'pdf-studio-390-en.png' },
        { width: 390, height: 844, lang: 'ar', shot: null, cShot: 'pdf-studio-390-ar.png' },
        { width: 768, height: 1024, lang: 'en', shot: null, cShot: null },
        { width: 1440, height: 900, lang: 'en', shot: null, cShot: null }
      ];

      async function inspectStudioHeaderGeometry(page) {
        return page.evaluate(() => {
          const badge = document.getElementById('pdfAutoSaveStatus');
          const header = document.querySelector('.pdf-viewer-header');
          const navCap = document.querySelector('.pdf-unified-nav-capsule');
          const headerRect = header ? header.getBoundingClientRect() : { height: 0 };
          const bRect = badge ? badge.getBoundingClientRect() : { width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0 };
          const navRect = navCap ? navCap.getBoundingClientRect() : null;
          // True 2D bounding-box intersection check (direction-agnostic across LTR & RTL)
          const rawOverlapX = navRect ? (Math.min(bRect.right, navRect.right) - Math.max(bRect.left, navRect.left)) : -999;
          const rawOverlapY = navRect ? (Math.min(bRect.bottom, navRect.bottom) - Math.max(bRect.top, navRect.top)) : -999;
          const intersectX = navRect ? Math.max(0, rawOverlapX) : 0;
          const intersectY = navRect ? Math.max(0, rawOverlapY) : 0;
          const overlapArea = Math.round(intersectX * intersectY);
          const rectsIntersect = Boolean(navRect && intersectX > 1 && intersectY > 1);
          const noBadgeOverlap = !rectsIntersect;
          const bs = badge ? getComputedStyle(badge) : null;
          const ns = navCap ? getComputedStyle(navCap) : null;
          const hs = header ? getComputedStyle(header) : null;
          const visibleHeaderBtns = header ? Array.from(header.querySelectorAll('button')).filter(b => b.offsetParent !== null) : [];
          const smallHeaderBtns = visibleHeaderBtns.filter(b => {
            const r = b.getBoundingClientRect();
            return r.width < 43.5 || r.height < 43.5;
          }).map(b => `${b.id || b.title}(${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)})`);
          return {
            dir: document.documentElement.dir || 'ltr',
            visible: Boolean(badge && badge.offsetParent !== null && bs && bs.display !== 'none' && bRect.width > 20),
            notTruncatedX: Boolean(badge && badge.scrollWidth <= (badge.clientWidth + 2)),
            notTruncatedY: Boolean(badge && badge.scrollHeight <= (badge.clientHeight + 2)),
            noBadgeOverlap,
            rectsIntersect,
            intersectX: Math.round(intersectX),
            intersectY: Math.round(intersectY),
            overlapArea,
            gapX: navRect ? Math.round(-rawOverlapX) : -1,
            badgeRect: { l: Math.round(bRect.left), r: Math.round(bRect.right), t: Math.round(bRect.top), b: Math.round(bRect.bottom), w: Math.round(bRect.width), h: Math.round(bRect.height) },
            navRect: navRect ? { l: Math.round(navRect.left), r: Math.round(navRect.right), t: Math.round(navRect.top), b: Math.round(navRect.bottom), w: Math.round(navRect.width), h: Math.round(navRect.height) } : null,
            scrollW: badge ? badge.scrollWidth : -1,
            clientW: badge ? badge.clientWidth : -1,
            scrollH: badge ? badge.scrollHeight : -1,
            clientH: badge ? badge.clientHeight : -1,
            badgeText: badge ? badge.textContent.trim() : '',
            headerHeight: Math.round(headerRect.height),
            smallHeaderBtns,
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            computedStyles: {
              badge: bs ? { display: bs.display, fontSize: bs.fontSize, whiteSpace: bs.whiteSpace, maxWidth: bs.maxWidth, flex: bs.flex, padding: bs.padding } : null,
              nav: ns ? { display: ns.display, padding: ns.padding, gap: ns.gap, flexShrink: ns.flexShrink } : null,
              header: hs ? { display: hs.display, height: hs.height, padding: hs.padding, gap: hs.gap } : null
            }
          };
        });
      }

      for (const sv of studioViewports) {
        await studioPage.page.setViewportSize({ width: sv.width, height: sv.height });
        await studioPage.page.evaluate((lng) => {
          if (typeof applyExoLanguage === 'function') applyExoLanguage(lng, false);
          if (typeof updatePdfPageCounterUI === 'function') updatePdfPageCounterUI(currentActivePageNum || 1);
          if (typeof exoWp64Diagnostics !== 'undefined') {
            exoWp64Diagnostics.recordIncident('cloud_sync', { status: 401, message: 'Unauthorized' }, { domain: 'cloud_sync' });
          }
          if (typeof exoUpdatePdfAutoSaveBadge === 'function') exoUpdatePdfAutoSaveBadge();
        }, sv.lang);
        await studioPage.page.waitForTimeout(180);

        const badgeCheck = await inspectStudioHeaderGeometry(studioPage.page);

        assert(badgeCheck.visible && badgeCheck.notTruncatedX && badgeCheck.notTruncatedY && badgeCheck.noBadgeOverlap && badgeCheck.overlapArea === 0 && !badgeCheck.overflow,
          `${sv.width}x${sv.height} (${sv.lang}): #pdfAutoSaveStatus visible, unclipped & 2D non-overlapping (dir=${badgeCheck.dir}, overlapArea=${badgeCheck.overlapArea}px2, gapX=${badgeCheck.gapX}px, badge=${JSON.stringify(badgeCheck.badgeRect)}, nav=${JSON.stringify(badgeCheck.navRect)}, text="${badgeCheck.badgeText}")`, JSON.stringify(badgeCheck));
        if (sv.width < 768) {
          assert(badgeCheck.headerHeight <= 56 && badgeCheck.smallHeaderBtns.length === 0,
            `${sv.width}x${sv.height} (${sv.lang}): Studio mobile header <=56px (${badgeCheck.headerHeight}px) and header buttons >=44px (${badgeCheck.smallHeaderBtns.join(',')})`);
        }
        if (sv.shot) {
          await studioPage.page.screenshot({ path: path.join(screenshotDir, sv.shot) });
        }
        if (sv.cShot) {
          await studioPage.page.screenshot({ path: path.join(correctiveShotDir, sv.cShot) });
        }
      }

      // Also verify worst-case longest sync-issue badge ("Saved on device · Sync issue" / Arabic) on 320px & 390px EN/AR
      for (const lv of [
        { width: 320, height: 720, lang: 'en' },
        { width: 320, height: 720, lang: 'ar' },
        { width: 390, height: 844, lang: 'en' },
        { width: 390, height: 844, lang: 'ar' }
      ]) {
        await studioPage.page.setViewportSize({ width: lv.width, height: lv.height });
        await studioPage.page.evaluate((lng) => {
          currentCloudUser = { id: 'studio-geo-uid', email: 'geo@example.com' };
          if (typeof exoRuntimeStatusState !== 'undefined') exoRuntimeStatusState.localVerified = true;
          if (typeof applyExoLanguage === 'function') applyExoLanguage(lng, false);
          if (typeof updatePdfPageCounterUI === 'function') updatePdfPageCounterUI(currentActivePageNum || 1);
          if (typeof exoWp64Diagnostics !== 'undefined') {
            exoWp64Diagnostics.recordIncident('cloud_sync', { status: 401, message: 'Unauthorized' }, { domain: 'cloud_sync' });
          }
          if (typeof exoUpdatePdfAutoSaveBadge === 'function') exoUpdatePdfAutoSaveBadge();
        }, lv.lang);
        await studioPage.page.waitForTimeout(140);
        const longCheck = await inspectStudioHeaderGeometry(studioPage.page);
        assert(longCheck.visible && longCheck.notTruncatedX && longCheck.notTruncatedY && longCheck.noBadgeOverlap && longCheck.overlapArea === 0 && !longCheck.overflow && longCheck.headerHeight <= 56 && longCheck.smallHeaderBtns.length === 0,
          `${lv.width}x${lv.height} (${lv.lang}) long sync-issue badge: 2D non-overlapping, unclipped & <=56px header (overlapArea=${longCheck.overlapArea}px2, gapX=${longCheck.gapX}px, text="${longCheck.badgeText}")`, JSON.stringify(longCheck));
      }
      await studioPage.page.evaluate(() => { currentCloudUser = null; });

      // Reset diagnostic + exercise core Studio features (Pen stroke, Zoom, Extra Note Sheet, Chapter Context in More Menu)
      await studioPage.page.setViewportSize({ width: 390, height: 844 });
      await studioPage.page.evaluate(() => {
        applyExoLanguage('en', false);
        if (typeof exoWp64Diagnostics !== 'undefined') exoWp64Diagnostics.resolveIncident('cloud_sync');
      });
      await studioPage.page.evaluate(() => {
        const scroller = document.getElementById('pdfPagesScrollContainer');
        if (scroller) scroller.scrollTop = 0;
      });
      await studioPage.page.waitForTimeout(100);
      await studioPage.page.click('#toolBtn_pen');
      const canvasBox = await studioPage.page.locator('#pdfInkCanvas_1').boundingBox();
      const scrollerBox = await studioPage.page.locator('#pdfPagesScrollContainer').boundingBox();
      assert(Boolean(canvasBox && canvasBox.width > 50), 'PDF Studio renders interactive #pdfInkCanvas_1');
      if (canvasBox) {
        const startX = canvasBox.x + Math.round(canvasBox.width * 0.35);
        const startY = Math.max(canvasBox.y + 40, (scrollerBox ? scrollerBox.y : canvasBox.y) + 40);
        await studioPage.page.mouse.move(startX, startY);
        await studioPage.page.mouse.down();
        await studioPage.page.mouse.move(startX + 80, startY + 50, { steps: 5 });
        await studioPage.page.mouse.up();
      }
      const zoomBefore = await studioPage.page.textContent('#pdfZoomLevelText');
      await studioPage.page.evaluate(() => changePdfZoom(0.15));
      await studioPage.page.waitForTimeout(140);
      const zoomAfter = await studioPage.page.textContent('#pdfZoomLevelText');
      assert(zoomBefore !== zoomAfter, `PDF Zoom changes cleanly (${zoomBefore?.trim()} -> ${zoomAfter?.trim()})`);

      await studioPage.page.click('#pdfToolbarExtraNoteBtn');
      await studioPage.page.waitForTimeout(160);
      const extraSheetCreated = await studioPage.page.evaluate(() => {
        const pages = document.querySelectorAll('.pdf-page-wrapper').length;
        return pages >= 4;
      });
      assert(extraSheetCreated, 'Extra Summary Note button creates extra sheet page without VIP lock or regression');

      await studioPage.page.evaluate(() => togglePdfMoreMenu());
      await studioPage.page.waitForTimeout(120);
      const chapterMenuVisible = await studioPage.page.isVisible('#pdfMenuChapterContextBtn');
      assert(chapterMenuVisible, '#pdfMoreDropdownMenu exposes #pdfMenuChapterContextBtn on mobile');
      await studioPage.page.click('#pdfBackToChapterBtn');
      await studioPage.page.waitForTimeout(160);

      assert(studioPage.pageErrors.length === 0 && studioPage.consoleErrors.length === 0, 'PDF Studio multi-width + regression zero errors');
      await studioPage.context.close();
    }

    // ------------------------------------------------------------------------
    // 8. Help Center Anti-Fake-Progress & Reload Persistence Verification
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Help Center Checklist Anti-Fake-Progress & Reload Persistence ---');
    {
      const anti = await openFreshPage(browser, { width: 390, height: 844 });

      // 8a. Empty start -> 0/7; cycling all 6 help panes stays 0/7
      await anti.page.evaluate(() => { openHelpModal(1); });
      await anti.page.waitForTimeout(180);
      for (let p = 1; p <= 6; p++) {
        await anti.page.click(`#acadNav_${p}`);
        await anti.page.waitForTimeout(50);
      }
      const afterTabCycle = await anti.page.evaluate(() => deriveHelpGettingStartedChecklist(exoCollectHelpChecklistSnapshot(), true).completedCount);
      assert(afterTabCycle === 0, `Viewing all 6 Help Center tabs on empty state keeps checklist at 0/7 (got ${afterTabCycle})`);
      await anti.page.click('#helpModalCloseBtn');

      // 8b. loadDemoData() sample must NOT grant real checklist credit
      await anti.page.evaluate(() => {
        const origConfirm = window.openConfirmModal;
        window.openConfirmModal = (_msg, cb) => { if (typeof cb === 'function') cb(); };
        try { loadDemoData(); } finally { window.openConfirmModal = origConfirm; }
      });
      await anti.page.waitForTimeout(150);
      const demoDoneCount = await anti.page.evaluate(() => deriveHelpGettingStartedChecklist(exoCollectHelpChecklistSnapshot(), true).completedCount);
      assert(demoDoneCount === 0, `Loading sample demo data must NOT create fake checklist completion (got ${demoDoneCount}/7)`);

      // Reset cleanly to real empty workspace, then create real subject + chapter + PDF
      await anti.page.evaluate(async () => {
        subjects = [{
          id: 9201,
          name: 'Clinical Toxicology',
          color: '#899982',
          isDivided: true,
          groups: [{
            id: 9211,
            name: 'Chapter 1: Antidotes',
            lectures: [{ id: 9221, title: 'Lecture 1', pdfPath: 'tox.pdf', hasLocalPdf: true, totalPages: 3 }]
          }]
        }];
        scheduleEvents = [];
        scheduleBacklog = [];
        logs = [];
        saveSubjects();
        saveScheduleData();
        saveLogs();
      });

      // Embed real PDF blob & open Studio, change page without annotating -> gs_studio_notes MUST stay false
      await anti.page.evaluate(async (b64) => {
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        await saveMediaToDB('pdfs', 9221, new Blob([bytes], { type: 'application/pdf' }));
        activeSubjectId = 9201;
        await openLectureDocument(9211, 9221);
        stepPdfPage(1);
        await closePdfViewer();
      }, pdfB64);

      // 8c. Unlinked goal -> gs_goal stays false; Failed IDB write -> gs_studio_notes stays false; Offline sign-in -> gs_safety stays false
      const negativeStates = await anti.page.evaluate(async () => {
        // Unlinked goal
        scheduleBacklog = [{ id: 9301, title: 'Unlinked Goal', linkedEventIds: [], done: false }];
        saveScheduleData();

        // Simulate failed pending annotation save (not committed to IDB)
        if (typeof pendingAnnoSaveMap !== 'undefined') {
          pendingAnnoSaveMap['9221'] = { lecId: '9221', pages: { 1: { strokes: [{ points: [[1, 1], [5, 5]] }] } } };
        }

        // Simulate offline sign-in without remote ack
        currentCloudUser = { id: 'offline-user-uid', email: 'off@example.com' };
        if (typeof exoRuntimeStatusState !== 'undefined') {
          exoRuntimeStatusState.cloudAckConfirmed = false;
        }
        const snap = exoCollectHelpChecklistSnapshot();
        const cl = deriveHelpGettingStartedChecklist(snap, true);
        if (typeof pendingAnnoSaveMap !== 'undefined') delete pendingAnnoSaveMap['9221'];
        currentCloudUser = null;
        return Object.fromEntries(cl.steps.map(s => [s.id, s.done]));
      });
      assert(!negativeStates.gs_studio_notes, 'Page scroll + uncommitted pendingAnnoSaveMap keeps gs_studio_notes=false');
      assert(!negativeStates.gs_goal, 'Unlinked goal without linked session keeps gs_goal=false');
      assert(!negativeStates.gs_safety, 'Unacked sign-in without confirmed sync or backup export keeps gs_safety=false');

      // 8d. Real ink stroke + durable IDB commit persists across full page.reload()
      await anti.page.evaluate(async () => {
        activeSubjectId = 9201;
        await openLectureDocument(9211, 9221);
        const scroller = document.getElementById('pdfPagesScrollContainer');
        if (scroller) scroller.scrollTop = 0;
      });
      await anti.page.waitForSelector('#pdfViewerModalOverlay.active', { timeout: 6000 });
      await anti.page.waitForTimeout(300);
      await anti.page.click('#toolBtn_pen');
      const box = await anti.page.locator('#pdfInkCanvas_1').boundingBox();
      const scrollRect = await anti.page.locator('#pdfPagesScrollContainer').boundingBox();
      if (box) {
        const drawStartX = box.x + Math.round(box.width * 0.35);
        const drawStartY = Math.max(box.y + 40, (scrollRect ? scrollRect.y : box.y) + 40);
        await anti.page.mouse.move(drawStartX, drawStartY);
        await anti.page.mouse.down();
        await anti.page.mouse.move(drawStartX + 70, drawStartY + 50, { steps: 5 });
        await anti.page.mouse.up();
      }
      await anti.page.evaluate(async () => {
        await flushPendingAnnotationsSave(false);
        await closePdfViewer();
      });

      const doneBeforeReload = await anti.page.evaluate(() => {
        const snap = exoCollectHelpChecklistSnapshot();
        return Object.fromEntries(deriveHelpGettingStartedChecklist(snap, true).steps.map(s => [s.id, s.done]));
      });
      assert(doneBeforeReload.gs_studio_notes === true, 'Real durable IDB ink stroke sets gs_studio_notes=true');

      await anti.page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
      await anti.page.waitForSelector('#dashboard', { timeout: 10000 });
      await anti.page.evaluate(() => { openHelpModal(1); });
      await anti.page.waitForTimeout(320);
      const doneAfterReload = await anti.page.evaluate(() => {
        const stepRow = document.querySelector('.exo-help-check-row[data-help-step-id="gs_studio_notes"]');
        const snap = exoCollectHelpChecklistSnapshot();
        const cl = deriveHelpGettingStartedChecklist(snap, true);
        const step = cl.steps.find(s => s.id === 'gs_studio_notes');
        return {
          rowHasDone: Boolean(stepRow && stepRow.classList.contains('is-done')),
          stepDone: Boolean(step && step.done)
        };
      });
      assert(doneAfterReload.rowHasDone && doneAfterReload.stepDone, 'Real Studio annotation milestone persists accurately across full page.reload()');
      assert(anti.pageErrors.length === 0 && anti.consoleErrors.length === 0, 'Anti-fake-progress & reload session zero errors');
      await anti.context.close();
    }

    // ------------------------------------------------------------------------
    // 9. Google Drive 9-State Diagnostics UI, Secret Redaction, Sync Timestamp Reload
    //    Persistence & Complete Help Center Interactive Control Audit
    // ------------------------------------------------------------------------
    console.log('\n--- 9. Google Drive 9-State Diagnostics, Sync Timestamp Reload & Help Control Audit ---');
    {
      const drv = await openFreshPage(browser, { width: 390, height: 844 });
      await seedRichWorkspace(drv.page, pdfB64, wavB64);

      // 9a. Drive 9 states UI rendering + secret redaction check inside #driveHubModalOverlay
      const driveStatesCheck = await drv.page.evaluate(async () => {
        const results = [];
        currentCloudUser = { id: 'vip-uid-71', email: 'vip@example.com' };
        currentUserCanUploadMedia = true;
        openGoogleDriveHubModal();

        const resetDriveBase = (linked = true) => {
          localStorage.setItem('exo_gdrive_bound_user_id', 'vip-uid-71');
          if (linked) {
            localStorage.setItem('exo_gdrive_connected', '1');
            localStorage.setItem('exo_gdrive_user_email', 'doc@example.com');
            googleAccessToken = 'ya29.valid_mem_tok';
            googleTokenExpiry = Date.now() + 600000;
            googleDriveAuthState = 'connected';
          } else {
            localStorage.removeItem('exo_gdrive_connected');
            localStorage.removeItem('exo_gdrive_user_email');
            googleAccessToken = null;
            googleTokenExpiry = 0;
            googleDriveAuthState = 'disconnected';
          }
          exoDriveDiagState.lastErrorCode = '';
          exoDriveDiagState.lastErrorStatus = 0;
          exoDriveDiagState.lastErrorMessage = '';
          exoRuntimeStatusState.hasConflictPending = false;
          exoRuntimeStatusState.cloudAckConfirmed = false;
          exoRuntimeStatusState.lastCloudSyncAt = 0;
        };

        const scenarios = [
          { tag: 'not_linked', setup: () => { resetDriveBase(false); } },
          { tag: 'offline', setup: () => { resetDriveBase(true); exoDriveDiagState.lastErrorCode = 'network_error'; } },
          { tag: 'connected', setup: () => { resetDriveBase(true); } },
          { tag: 'auth_expired', setup: () => { resetDriveBase(true); googleAccessToken = null; googleTokenExpiry = 0; googleDriveAuthState = 'reauth_required'; exoDriveDiagState.lastErrorStatus = 401; exoDriveDiagState.lastErrorCode = 'token_expired'; } },
          { tag: 'permission_denied', setup: () => { resetDriveBase(true); googleAccessToken = null; googleTokenExpiry = 0; googleDriveAuthState = 'permission_denied'; exoDriveDiagState.lastErrorStatus = 403; exoDriveDiagState.lastErrorCode = 'google_account_mismatch'; } },
          { tag: 'file_access_error', setup: () => { resetDriveBase(true); exoDriveDiagState.lastErrorStatus = 404; exoDriveDiagState.lastErrorCode = 'not_found'; } },
          { tag: 'media_transfer_failed', setup: () => { resetDriveBase(true); exoDriveDiagState.lastErrorStatus = 500; exoDriveDiagState.lastErrorCode = 'gdrive_upload_failed'; exoDriveDiagState.lastErrorMessage = 'Error Bearer ya29.SECRET_TOKEN_LEAK access_token=SECRET_QRY_123 upload_id=SECRET_UP'; } },
          { tag: 'workspace_sync_issue', setup: () => { resetDriveBase(true); exoDriveDiagState.lastErrorCode = 'occ_conflict'; exoRuntimeStatusState.hasConflictPending = true; } },
          { tag: 'sync_confirmed', setup: () => {
            resetDriveBase(true);
            localStorage.removeItem('pharmaWorkspaceDirty');
            localStorage.removeItem('pharmaWorkspaceDirty_vip-uid-71');
            localStorage.removeItem('pharmaAnnotationsDirty_vip-uid-71');
            if (typeof dirtyAnnotationsForCloud !== 'undefined') dirtyAnnotationsForCloud = false;
            exoRuntimeStatusState.cloudAckConfirmed = true;
            exoRuntimeStatusState.cloudAckRevision = 9;
            exoRuntimeStatusState.lastCloudSyncAt = Date.now();
          } }
        ];

        for (const sc of scenarios) {
          sc.setup();
          updateGoogleDriveUI();
          const banner = document.getElementById('driveHubStateBanner');
          const actualState = banner ? banner.getAttribute('data-drive-diagnostic-state') : '';
          const conn = document.getElementById('driveHubConnectionBadge')?.textContent?.trim() || '';
          const sync = document.getElementById('driveHubSyncBadge')?.textContent?.trim() || '';
          const txt = banner ? banner.innerText : '';
          const leakedSecret = txt.includes('SECRET_TOKEN_LEAK') || txt.includes('SECRET_QRY_123') || txt.includes('SECRET_UP');
          results.push({ tag: sc.tag, actualState, hasBanner: Boolean(txt.length > 20), conn, sync, leakedSecret });
        }
        return results;
      });
      assert(driveStatesCheck.length === 9, `Evaluated all 9 Google Drive diagnostic states (got ${driveStatesCheck.length})`);
      for (const r of driveStatesCheck) {
        assert(r.hasBanner && r.actualState === r.tag && r.conn && r.sync && !r.leakedSecret,
          `Drive Hub scenario "${r.tag}" matches state & renders separate connection/sync pills & zero secret leakage (actual="${r.actualState}", conn="${r.conn}", sync="${r.sync}")`);
      }
      await drv.page.waitForTimeout(260);
      await drv.page.screenshot({ path: path.join(screenshotDir, 'after-drive-9states.png') });
      await drv.page.screenshot({ path: path.join(correctiveShotDir, 'help-center-drive-9states.png') });
      await drv.page.click('#driveHubModalCloseBtn');
      await drv.page.waitForTimeout(120);

      // 9b. Sync timestamp persistence across page.reload() while staying honest when Offline
      await drv.page.evaluate(() => {
        const uid = 'sync-persist-uid';
        currentCloudUser = { id: uid, email: 'sync@example.com' };
        const iso = '2026-11-18T11:22:33.000Z';
        const ms = Date.parse(iso);
        localStorage.setItem('pharmaLastCloudSyncIso_' + uid, iso);
        localStorage.setItem('pharmaCloudSyncRev_' + uid, '12');
        localStorage.setItem('pharmaWorkspaceDirty_' + uid, '1');
        localStorage.setItem('pharmaWorkspaceDirty', '1');
        exoRuntimeStatusState.lastCloudSyncAt = ms;
        exoRuntimeStatusState.cloudAckRevision = 12;
        exoRuntimeStatusState.cloudAckConfirmed = false;
      });
      await drv.context.setOffline(true);
      await drv.page.evaluate(() => {
        openCloudAuthModal();
        if (typeof exoRenderCloudAccountStatusCards === 'function') exoRenderCloudAccountStatusCards();
      });
      await drv.page.waitForTimeout(150);
      const offlineSyncUi = await drv.page.evaluate(() => {
        const badge = document.getElementById('cloudLiveSyncBadge')?.textContent?.trim() || '';
        const timeEl = document.getElementById('cloudLastSyncedTime')?.textContent?.trim() || '';
        return {
          badge,
          timeEl,
          dirtyProtected: localStorage.getItem('pharmaWorkspaceDirty_sync-persist-uid') === '1'
        };
      });
      assert(!offlineSyncUi.badge.toLowerCase().includes('synced ·') && offlineSyncUi.timeEl && !offlineSyncUi.timeEl.includes('No remote sync'),
        `Offline account card refuses false "Synced" while preserving historical confirmed timestamp ("${offlineSyncUi.timeEl}") & protecting dirty edits`);
      await drv.context.setOffline(false);
      await drv.page.click('#cloudAuthModalOverlay .icon-btn');
      await drv.page.waitForTimeout(120);

      // Verify actual page.reload preserves confirmed sync timestamp via pharmaLastCloudSyncIso_<uid>
      await drv.page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
      await drv.page.waitForSelector('#dashboard', { timeout: 10000 });
      const reloadedTs = await drv.page.evaluate(async () => {
        await handleAuthSessionChange({ id: 'sync-persist-uid', email: 'sync@example.com' }, false);
        openCloudAuthModal();
        if (typeof exoRenderCloudAccountStatusCards === 'function') exoRenderCloudAccountStatusCards();
        return {
          hydratedMs: Number(exoRuntimeStatusState.lastCloudSyncAt || 0),
          expectedMs: Date.parse('2026-11-18T11:22:33.000Z'),
          timeEl: document.getElementById('cloudLastSyncedTime')?.textContent?.trim() || ''
        };
      });
      assert(reloadedTs.hydratedMs === reloadedTs.expectedMs && reloadedTs.timeEl && !reloadedTs.timeEl.includes('No remote sync'),
        `Confirmed server sync timestamp persists across full page.reload() ("${reloadedTs.timeEl}")`);
      await drv.page.keyboard.press('Escape');
      await drv.page.waitForTimeout(120);

      // 9c. Full Help Center Control Audit + remaining Contextual ? Triggers (#cloudAuthHelpBtn, #driveHubHelpBtn, #pdfMenuHelpBtn)
      await drv.page.evaluate(() => openCloudAuthModal());
      await drv.page.waitForTimeout(120);
      await drv.page.click('#cloudAuthHelpBtn');
      await drv.page.waitForSelector('#helpModalOverlay.active', { timeout: 5000 });
      assert(await drv.page.evaluate(() => document.getElementById('acadPane_5')?.classList.contains('active')),
        '#cloudAuthHelpBtn opens Help Center directly to Pane 5');
      await drv.page.click('#helpModalCloseBtn');

      await drv.page.evaluate(() => { currentCloudUser = { id: 'vip-uid-71', email: 'vip@example.com' }; currentUserCanUploadMedia = true; openGoogleDriveHubModal(); });
      await drv.page.waitForTimeout(120);
      await drv.page.click('#driveHubHelpBtn');
      await drv.page.waitForSelector('#helpModalOverlay.active', { timeout: 5000 });
      assert(await drv.page.evaluate(() => document.getElementById('acadPane_6')?.classList.contains('active')),
        '#driveHubHelpBtn opens Help Center directly to Pane 6');
      await drv.page.click('#helpModalCloseBtn');

      await drv.page.evaluate(async () => { activeSubjectId = 7101; await openLectureDocument(7201, 7301); togglePdfMoreMenu(); });
      await drv.page.waitForTimeout(140);
      await drv.page.click('#pdfMenuHelpBtn');
      await drv.page.waitForSelector('#helpModalOverlay.active', { timeout: 5000 });
      assert(await drv.page.evaluate(() => document.getElementById('acadPane_3')?.classList.contains('active')),
        '#pdfMenuHelpBtn opens Help Center directly to Pane 3');
      await drv.page.evaluate(() => closePdfViewer());

      // Check Quick Actions Bar, Search Empty State recovery chip, VIP details button, WhatsApp href, Demo Loader, and capture checklist screenshot
      await drv.page.evaluate(() => { openHelpModal(1); });
      await drv.page.waitForTimeout(200);
      const helpControls = await drv.page.evaluate(() => {
        const wa = document.querySelector('#acadPane_6 a.whatsapp-cta-btn');
        const nextBtn = document.querySelector('#helpGettingStartedChecklistMount .exo-help-checklist-head button');
        const quickBtns = Array.from(document.querySelectorAll('#helpQuickActionsBar button[data-help-action]'));
        return {
          waHref: wa ? wa.getAttribute('href') : '',
          waTarget: wa ? wa.getAttribute('target') : '',
          waRel: wa ? wa.getAttribute('rel') : '',
          hasNextBtn: Boolean(nextBtn),
          quickIds: quickBtns.map(b => b.getAttribute('data-help-action')),
          quickCount: quickBtns.length,
          demoBtnExists: Boolean(document.getElementById('helpLoadDemoDataBtn')),
          vipBtnExists: Boolean(document.getElementById('helpVipDetailsBtn'))
        };
      });
      assert(helpControls.waHref.includes('wa.me/201552795922') && helpControls.waTarget === '_blank' && String(helpControls.waRel || '').includes('noopener') && helpControls.hasNextBtn && helpControls.quickCount === 8 && helpControls.demoBtnExists && helpControls.vipBtnExists,
        `Help Center controls (WhatsApp CTA href/target/rel, Checklist Next Step, 8 Quick Actions, Demo Loader, VIP Details) present & wired (quickCount=${helpControls.quickCount})`);
      await drv.page.screenshot({ path: path.join(screenshotDir, 'after-help-checklist.png') });
      await drv.page.evaluate(() => {
        const cl = document.getElementById('helpGettingStartedChecklistMount');
        if (cl) cl.scrollIntoView({ behavior: 'instant', block: 'start' });
      });
      await drv.page.waitForTimeout(120);
      await drv.page.screenshot({ path: path.join(correctiveShotDir, 'help-center-checklist.png') });
      await drv.page.evaluate(() => {
        const body = document.querySelector('#helpModalOverlay .eg-modal-body');
        if (body) body.scrollTop = 0;
      });

      // Navigate across ALL 6 Help Center modules via real UI clicks
      for (let modNum = 1; modNum <= 6; modNum++) {
        await drv.page.click(`#acadNav_${modNum}`);
        await drv.page.waitForTimeout(90);
        const modOk = await drv.page.evaluate((n) => {
          const pane = document.getElementById(`acadPane_${n}`);
          const nav = document.getElementById(`acadNav_${n}`);
          return Boolean(pane && pane.classList.contains('active') && nav && nav.classList.contains('active') && pane.innerText.trim().length > 40);
        }, modNum);
        assert(modOk, `Help Center Module ${modNum} (#acadNav_${modNum} -> #acadPane_${modNum}) activates via real UI click with populated content`);
      }

      // Verify WhatsApp CTA is visible & correctly targeted inside Module 6 without sending a message
      const waLive = await drv.page.evaluate(() => {
        const wa = document.querySelector('#acadPane_6 a.whatsapp-cta-btn');
        if (!wa) return { ok: false };
        const r = wa.getBoundingClientRect();
        return {
          ok: wa.offsetParent !== null && r.width > 60 && r.height >= 36 && wa.getAttribute('href') === 'https://wa.me/201552795922' && wa.getAttribute('target') === '_blank',
          href: wa.getAttribute('href')
        };
      });
      assert(waLive.ok, `Help Center WhatsApp CTA visible in Module 6 with safe target URL (${waLive.href}) — verified without sending`);

      // Test Help search empty state + real Recovery Chip click restores matching content
      await drv.page.fill('#helpSearchInput', 'zzznonexistentquery71');
      await drv.page.waitForTimeout(140);
      const emptyActive = await drv.page.evaluate(() => {
        const el = document.getElementById('helpSearchEmptyState');
        return Boolean(el && getComputedStyle(el).display !== 'none' && el.querySelector('button'));
      });
      assert(emptyActive, 'Help Center search empty state renders recovery chips on unmatched query');
      if (emptyActive) {
        await drv.page.click('#helpSearchEmptyState button');
        await drv.page.waitForTimeout(140);
        const recovered = await drv.page.evaluate(() => {
          const inp = document.getElementById('helpSearchInput');
          const el = document.getElementById('helpSearchEmptyState');
          const visiblePanes = Array.from(document.querySelectorAll('#helpModalOverlay .academy-module-pane')).filter(p => getComputedStyle(p).display !== 'none').length;
          return {
            query: inp ? inp.value : '',
            emptyHidden: !el || getComputedStyle(el).display === 'none',
            visiblePanes
          };
        });
        assert(Boolean(recovered.query && recovered.emptyHidden && recovered.visiblePanes >= 1),
          `Clicking Help search recovery chip populates query ("${recovered.query}"), hides empty state, and displays matching guide pane`);
      }

      // Verify Bilingual Search (EN & AR integrity)
      await drv.page.evaluate(() => { if (typeof applyExoLanguage === 'function') applyExoLanguage('ar', false); });
      await drv.page.waitForTimeout(120);
      await drv.page.fill('#helpSearchInput', 'نسخ');
      await drv.page.waitForTimeout(140);
      const arSearchCheck = await drv.page.evaluate(() => {
        const emptyEl = document.getElementById('helpSearchEmptyState');
        const activePane = document.querySelector('#helpModalOverlay .academy-module-pane.active');
        return {
          dir: document.documentElement.dir,
          emptyHidden: !emptyEl || getComputedStyle(emptyEl).display === 'none',
          hasArabicContent: Boolean(activePane && /[\u0600-\u06FF]/.test(activePane.innerText))
        };
      });
      assert(arSearchCheck.dir === 'rtl' && arSearchCheck.emptyHidden && arSearchCheck.hasArabicContent,
        `Help Center Arabic bilingual search ("نسخ") works cleanly in RTL mode with Arabic content`);
      await drv.page.evaluate(() => {
        if (typeof applyExoLanguage === 'function') applyExoLanguage('en', false);
        const inp = document.getElementById('helpSearchInput');
        if (inp) inp.value = '';
        if (typeof filterHelpCenterContent === 'function') filterHelpCenterContent('', true);
      });
      await drv.page.waitForTimeout(120);

      // Independently execute ALL 8 Help Center Quick Actions via real UI clicks
      const takeUserDataSnapshot = () => drv.page.evaluate(() => JSON.stringify({
        subjects: (subjects || []).map(s => ({ id: s.id, name: s.name })),
        events: (scheduleEvents || []).map(e => ({ id: e.id, title: e.title })),
        goals: (scheduleBacklog || []).map(g => ({ id: g.id, title: g.title })),
        logs: (logs || []).map(l => ({ id: l.id, text: l.text }))
      }));

      const quickActionSpecs = [
        {
          id: 'go_library',
          verify: () => drv.page.evaluate(() => ({
            ok: !document.getElementById('helpModalOverlay')?.classList.contains('active') && document.getElementById('subjects')?.classList.contains('active'),
            detail: 'subjects view active'
          }))
        },
        {
          id: 'add_session',
          waitMs: 220,
          verify: () => drv.page.evaluate(() => ({
            ok: !document.getElementById('helpModalOverlay')?.classList.contains('active') && document.getElementById('schedule')?.classList.contains('active') && document.getElementById('sessionModalOverlay')?.classList.contains('active'),
            detail: 'schedule + #sessionModalOverlay active'
          })),
          cleanup: () => drv.page.evaluate(() => closeModal('sessionModalOverlay'))
        },
        {
          id: 'go_planner',
          verify: () => drv.page.evaluate(() => ({
            ok: !document.getElementById('helpModalOverlay')?.classList.contains('active') && document.getElementById('schedule')?.classList.contains('active') && document.getElementById('schPillToday')?.classList.contains('active'),
            detail: 'schedule + Today pill active'
          }))
        },
        {
          id: 'go_goals',
          verify: () => drv.page.evaluate(() => ({
            ok: !document.getElementById('helpModalOverlay')?.classList.contains('active') && document.getElementById('schedule')?.classList.contains('active') && document.getElementById('schPillTasks')?.classList.contains('active'),
            detail: 'schedule + Weekly Goals pill active'
          }))
        },
        {
          id: 'go_tracker',
          verify: () => drv.page.evaluate(() => ({
            ok: !document.getElementById('helpModalOverlay')?.classList.contains('active') && document.getElementById('tracker')?.classList.contains('active'),
            detail: 'tracker view active'
          }))
        },
        {
          id: 'open_account',
          verify: () => drv.page.evaluate(() => ({
            ok: !document.getElementById('helpModalOverlay')?.classList.contains('active') && document.getElementById('cloudAuthModalOverlay')?.classList.contains('active'),
            detail: '#cloudAuthModalOverlay active'
          })),
          cleanup: () => drv.page.evaluate(() => closeModal('cloudAuthModalOverlay'))
        },
        {
          id: 'open_drive',
          verify: () => drv.page.evaluate(() => ({
            ok: !document.getElementById('helpModalOverlay')?.classList.contains('active') && document.getElementById('driveHubModalOverlay')?.classList.contains('active'),
            detail: '#driveHubModalOverlay active'
          })),
          cleanup: () => drv.page.evaluate(() => closeGoogleDriveHubModal())
        },
        {
          id: 'export_backup',
          waitMs: 360,
          beforeClick: () => drv.page.evaluate(() => {
            window.__wp71ExportClicks = [];
            if (!window.__wp71OrigAnchorClick) {
              window.__wp71OrigAnchorClick = HTMLAnchorElement.prototype.click;
            }
            HTMLAnchorElement.prototype.click = function() {
              if (this.download && this.download.includes('Exo_Workspace_Backup')) {
                window.__wp71ExportClicks.push(this.download);
                return;
              }
              return window.__wp71OrigAnchorClick.apply(this, arguments);
            };
          }),
          verify: () => drv.page.evaluate(() => ({
            ok: !document.getElementById('helpModalOverlay')?.classList.contains('active') && Array.isArray(window.__wp71ExportClicks) && window.__wp71ExportClicks.length >= 1 && Number(exoRuntimeStatusState.lastBackupExportedAt || 0) > 0,
            detail: `downloaded=${JSON.stringify(window.__wp71ExportClicks || [])}`
          })),
          cleanup: () => drv.page.evaluate(() => {
            if (window.__wp71OrigAnchorClick) {
              HTMLAnchorElement.prototype.click = window.__wp71OrigAnchorClick;
            }
          })
        }
      ];

      for (const qa of quickActionSpecs) {
        const beforeSnap = await takeUserDataSnapshot();
        const errBefore = drv.pageErrors.length + drv.consoleErrors.length;
        await drv.page.evaluate(() => { openHelpModal(1); });
        await drv.page.waitForSelector('#helpModalOverlay.active', { timeout: 4000 });
        if (qa.beforeClick) await qa.beforeClick();
        await drv.page.click(`#helpQuickActionsBar button[data-help-action="${qa.id}"]`);
        await drv.page.waitForTimeout(qa.waitMs || 160);
        const res = await qa.verify();
        const afterSnap = await takeUserDataSnapshot();
        const errAfter = drv.pageErrors.length + drv.consoleErrors.length;
        assert(res.ok && beforeSnap === afterSnap && errAfter === errBefore,
          `Help Quick Action [${qa.id}] executes cleanly via real click (${res.detail}), closes Help Center, zero data mutation & zero runtime errors`,
          JSON.stringify({ res, mutated: beforeSnap !== afterSnap, newErrors: errAfter - errBefore }));
        if (qa.cleanup) {
          await qa.cleanup();
          await drv.page.waitForTimeout(100);
        }
      }

      // Test Checklist Next Step button via real click (closes Help Center & routes to next incomplete step without data mutation)
      {
        const beforeSnap = await takeUserDataSnapshot();
        await drv.page.evaluate(() => { openHelpModal(1); });
        await drv.page.waitForSelector('#helpModalOverlay.active', { timeout: 4000 });
        const nextActionTarget = await drv.page.evaluate(() => {
          const btn = document.querySelector('#helpGettingStartedChecklistMount .exo-help-checklist-head button');
          return btn ? (btn.getAttribute('onclick') || '') : '';
        });
        await drv.page.click('#helpGettingStartedChecklistMount .exo-help-checklist-head button');
        await drv.page.waitForTimeout(180);
        const afterSnap = await takeUserDataSnapshot();
        const closedCleanly = await drv.page.evaluate(() => !document.getElementById('helpModalOverlay')?.classList.contains('active'));
        assert(closedCleanly && beforeSnap === afterSnap && nextActionTarget.includes('exoExecuteHelpAction'),
          `Help Checklist "Continue Next Step" button clicks cleanly (${nextActionTarget}), closes modal & mutates zero user data`);
        // Close any modal that Next Step may have opened (e.g., cloud auth / session / drive)
        await drv.page.evaluate(() => {
          ['cloudAuthModalOverlay', 'driveHubModalOverlay', 'sessionModalOverlay', 'vipMediaLockModalOverlay'].forEach(id => {
            if (typeof closeModal === 'function') closeModal(id);
          });
        });
      }

      await drv.page.evaluate(() => { openHelpModal(6); });
      await drv.page.waitForTimeout(120);
      await drv.page.click('#helpVipDetailsBtn');
      await drv.page.waitForTimeout(150);
      assert(await drv.page.evaluate(() => !document.getElementById('helpModalOverlay')?.classList.contains('active') && document.getElementById('vipMediaLockModalOverlay')?.classList.contains('active')),
        '#helpVipDetailsBtn closes Help Center & opens #vipMediaLockModalOverlay cleanly');
      await drv.page.keyboard.press('Escape');

      assert(drv.pageErrors.length === 0 && drv.consoleErrors.length === 0, 'Drive 9-state + Sync reload + Help Control audit zero runtime errors');
      await drv.context.close();

      // 9d. Isolated Context Verification for Help Center Demo Data Loader (#helpLoadDemoDataBtn)
      const demoCtx = await openFreshPage(browser, { width: 390, height: 844 });
      await demoCtx.page.evaluate(() => { openHelpModal(1); });
      await demoCtx.page.waitForSelector('#helpModalOverlay.active', { timeout: 4000 });
      await demoCtx.page.click('#helpLoadDemoDataBtn');
      await demoCtx.page.waitForSelector('#confirmModalOverlay.active', { timeout: 4000 });
      const confirmShown = await demoCtx.page.evaluate(() => document.getElementById('confirmModalOverlay')?.classList.contains('active'));
      assert(confirmShown, 'Isolated Demo Data Loader (#helpLoadDemoDataBtn) opens confirmation dialog before replacing workspace');
      await demoCtx.page.click('#confirmModalBtn');
      await demoCtx.page.waitForTimeout(260);
      const demoCheck = await demoCtx.page.evaluate(() => {
        const snap = exoCollectHelpChecklistSnapshot();
        const cl = deriveHelpGettingStartedChecklist(snap, true);
        return {
          subjectCount: (subjects || []).length,
          allDemoTagged: (subjects || []).length >= 3 && (subjects || []).every(s => s && s._isDemoSample === true),
          checklistDone: cl.completedCount
        };
      });
      assert(demoCheck.allDemoTagged && demoCheck.checklistDone === 0 && demoCtx.pageErrors.length === 0 && demoCtx.consoleErrors.length === 0,
        `Isolated Demo Data Loader populates tagged sample library (${demoCheck.subjectCount} subjects), keeps checklist at 0/7 (no fake progress) & zero runtime errors`);
      await demoCtx.context.close();
    }

  } finally {
    await browser.close();
    if (spawnedServer) spawnedServer.kill();
  }

  console.log('\n======================================================================');
  console.log(`WP 7.1 MOBILE UX & HELP CENTER E2E RESULTS -> PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('======================================================================');
  if (testsFailed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal WP 7.1 E2E error:', err);
  process.exit(1);
});
