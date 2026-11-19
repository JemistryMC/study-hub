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
      await hc.page.evaluate(() => { openHelpModal(1); });
      await hc.page.waitForTimeout(180);
      const helpLayout = await hc.page.evaluate(() => {
        const closeBtn = document.getElementById('helpModalCloseBtn');
        const cRect = closeBtn ? closeBtn.getBoundingClientRect() : null;
        const quickBtns = Array.from(document.querySelectorAll('#helpQuickActionsBar button'));
        const quickSmall = quickBtns.filter(b => b.getBoundingClientRect().height < 44).length;
        const checklistItems = document.querySelectorAll('#helpGettingStartedChecklistMount .exo-help-check-row').length;
        const panes = [1, 2, 3, 4, 5, 6].map(n => document.getElementById(`acadPane_${n}`)?.innerText || '').join('\n');
        const arabicInEnPanes = /[\u0600-\u06FF]/.test(panes);
        return {
          closeVisibleTopEnd: Boolean(cRect && cRect.width >= 44 && cRect.height >= 44 && cRect.top < 120 && cRect.right <= window.innerWidth + 1),
          quickCount: quickBtns.length,
          quickSmall,
          checklistItems,
          arabicInEnPanes,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1
        };
      });
      assert(helpLayout.closeVisibleTopEnd, '390x844 Help Modal Close button is pinned cleanly on top row (>=44x44px)');
      assert(helpLayout.quickCount === 8 && helpLayout.quickSmall === 0, `Help Quick Actions Bar renders 8 actions (${helpLayout.quickCount}) all >=44px tall`);
      assert(helpLayout.checklistItems === 7, `Getting Started Checklist renders live 7 steps (got ${helpLayout.checklistItems})`);
      assert(!helpLayout.arabicInEnPanes, 'EN Help Center panes emit zero visible Arabic text (synonyms live cleanly in data-help-keywords)');
      assert(!helpLayout.overflow, '390x844 Help Modal renders with zero horizontal overflow');
      await hc.page.screenshot({ path: path.join(screenshotDir, 'help-390x844-en.png') });

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
          } else if (pos.name === 'mid') {
            await sc.page.screenshot({ path: path.join(screenshotDir, `after-scroll-390-subjects-mid.png`) });
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
        { width: 320, height: 720, lang: 'en', shot: null },
        { width: 360, height: 740, lang: 'en', shot: 'after-pdf-badge-360.png' },
        { width: 390, height: 844, lang: 'en', shot: 'after-pdf-badge-390.png' },
        { width: 390, height: 844, lang: 'ar', shot: null },
        { width: 768, height: 1024, lang: 'en', shot: null },
        { width: 1440, height: 900, lang: 'en', shot: null }
      ];

      for (const sv of studioViewports) {
        await studioPage.page.setViewportSize({ width: sv.width, height: sv.height });
        await studioPage.page.evaluate((lng) => {
          if (typeof applyExoLanguage === 'function') applyExoLanguage(lng, false);
          if (typeof exoWp64Diagnostics !== 'undefined') {
            exoWp64Diagnostics.recordIncident('cloud_sync', { status: 401, message: 'Unauthorized' }, { domain: 'cloud_sync' });
          }
          if (typeof exoRefreshStudioSaveBadge === 'function') exoRefreshStudioSaveBadge();
        }, sv.lang);
        await studioPage.page.waitForTimeout(180);

        const badgeCheck = await studioPage.page.evaluate(() => {
          const badge = document.getElementById('pdfAutoSaveStatus');
          const header = document.querySelector('.pdf-viewer-header');
          const navCap = document.querySelector('.pdf-unified-nav-capsule');
          const headerRect = header ? header.getBoundingClientRect() : { height: 0 };
          const bRect = badge ? badge.getBoundingClientRect() : { width: 0, height: 0, right: 0, left: 0 };
          const navRect = navCap ? navCap.getBoundingClientRect() : null;
          const isRtl = document.documentElement.dir === 'rtl';
          const noBadgeOverlap = !navRect || (isRtl ? (navRect.right <= bRect.left + 1) : (bRect.right <= navRect.left + 1));
          const bs = badge ? getComputedStyle(badge) : null;
          const visibleHeaderBtns = header ? Array.from(header.querySelectorAll('button')).filter(b => b.offsetParent !== null) : [];
          const smallHeaderBtns = visibleHeaderBtns.filter(b => {
            const r = b.getBoundingClientRect();
            return r.width < 43.5 || r.height < 43.5;
          }).map(b => `${b.id || b.title}(${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)})`);
          return {
            visible: Boolean(badge && badge.offsetParent !== null && bs && bs.display !== 'none' && bRect.width > 20),
            notTruncated: Boolean(badge && badge.scrollWidth <= (badge.clientWidth + 2)),
            noBadgeOverlap,
            badgeRight: Math.round(bRect.right),
            navLeft: navRect ? Math.round(navRect.left) : -1,
            scrollW: badge ? badge.scrollWidth : -1,
            clientW: badge ? badge.clientWidth : -1,
            badgeText: badge ? badge.textContent.trim() : '',
            headerHeight: Math.round(headerRect.height),
            smallHeaderBtns,
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1
          };
        });

        assert(badgeCheck.visible && badgeCheck.notTruncated && badgeCheck.noBadgeOverlap && !badgeCheck.overflow,
          `${sv.width}x${sv.height} (${sv.lang}): #pdfAutoSaveStatus visible, unclipped & non-overlapping (${badgeCheck.scrollW}<=${badgeCheck.clientW}+2, right=${badgeCheck.badgeRight}<=nav=${badgeCheck.navLeft}, text="${badgeCheck.badgeText}")`, JSON.stringify(badgeCheck));
        if (sv.width < 768) {
          assert(badgeCheck.headerHeight <= 56 && badgeCheck.smallHeaderBtns.length === 0,
            `${sv.width}x${sv.height}: Studio mobile header <=56px (${badgeCheck.headerHeight}px) and header buttons >=44px (${badgeCheck.smallHeaderBtns.join(',')})`);
        }
        if (sv.shot) {
          await studioPage.page.screenshot({ path: path.join(screenshotDir, sv.shot) });
        }
      }

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

      // Check Quick Actions Bar, Search Empty State recovery chip, VIP details button, WhatsApp href, Demo Loader, and capture after-help-checklist.png
      await drv.page.evaluate(() => { openHelpModal(1); });
      await drv.page.waitForTimeout(200);
      const helpControls = await drv.page.evaluate(() => {
        const wa = document.querySelector('#acadPane_6 a.whatsapp-cta-btn');
        const nextBtn = document.querySelector('#helpGettingStartedChecklistMount .exo-help-checklist-head button');
        const quickBtns = Array.from(document.querySelectorAll('#helpQuickActionsBar button[data-help-action]'));
        return {
          waHref: wa ? wa.getAttribute('href') : '',
          hasNextBtn: Boolean(nextBtn),
          quickCount: quickBtns.length,
          demoBtnExists: Boolean(document.getElementById('helpLoadDemoDataBtn')),
          vipBtnExists: Boolean(document.getElementById('helpVipDetailsBtn'))
        };
      });
      assert(helpControls.waHref.includes('wa.me/201552795922') && helpControls.hasNextBtn && helpControls.quickCount === 8 && helpControls.demoBtnExists && helpControls.vipBtnExists,
        `Help Center controls (WhatsApp CTA, Checklist Next Step, 8 Quick Actions, Demo Loader, VIP Details) present & wired (quickCount=${helpControls.quickCount})`);
      await drv.page.screenshot({ path: path.join(screenshotDir, 'after-help-checklist.png') });

      // Test Help search empty state + recovery chip reset
      await drv.page.fill('#helpSearchInput', 'zzznonexistentquery71');
      await drv.page.waitForTimeout(120);
      const emptyActive = await drv.page.evaluate(() => {
        const el = document.getElementById('helpSearchEmptyState');
        return Boolean(el && getComputedStyle(el).display !== 'none' && el.querySelector('button'));
      });
      assert(emptyActive, 'Help Center search empty state renders recovery chips on unmatched query');
      if (emptyActive) {
        await drv.page.click('#helpSearchEmptyState button');
        await drv.page.waitForTimeout(120);
      }

      // Test Quick Action button navigation cleanly closes Help Center & opens Library
      await drv.page.click('#helpQuickActionsBar button[data-help-action="go_library"]');
      await drv.page.waitForTimeout(150);
      assert(await drv.page.evaluate(() => !document.getElementById('helpModalOverlay')?.classList.contains('active') && document.getElementById('subjects')?.classList.contains('active')),
        'Help Quick Action (go_library) closes Help Center & opens Subjects Library');

      await drv.page.evaluate(() => { openHelpModal(6); });
      await drv.page.waitForTimeout(120);
      await drv.page.click('#helpVipDetailsBtn');
      await drv.page.waitForTimeout(150);
      assert(await drv.page.evaluate(() => document.getElementById('vipMediaLockModalOverlay')?.classList.contains('active')),
        '#helpVipDetailsBtn opens #vipMediaLockModalOverlay cleanly');
      await drv.page.keyboard.press('Escape');

      assert(drv.pageErrors.length === 0 && drv.consoleErrors.length === 0, 'Drive 9-state + Sync reload + Help Control audit zero runtime errors');
      await drv.context.close();
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
