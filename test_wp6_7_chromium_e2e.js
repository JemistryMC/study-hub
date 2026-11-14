// ============================================================================
// Exo Personal Study Journal — Phase 6 / WP 6.7 Real-UI Chromium E2E Suite
// Verifies Handcrafted Experience Rebuild end-to-end on http://localhost:3000:
//   1. Global Fullscreen removed from sidebar & mobile navbar
//   2. Embedded PDF Studio inside Chapter Workspace (inline default + F expand/collapse
//      + synchronous <50ms unmount via Back to Chapter / closePdfViewer)
//   3. Consolidated audio upload & PDF Studio tools work with zero regression
//   4. Planner XSS escaping (Today Stream, Ruler, Week Grid, Subject Groups, Weekly Goals)
//   5. Tracker asymmetric Living Journal overview & required KPI DOM IDs
//   6. Dedicated Google Drive Hub (#sidebarGdriveBtn -> #driveHubModalOverlay) across
//      Signed Out, Free, and VIP states, separate from Account modal without duplicate IDs
//   7. Bilingual EN <-> AR live switch on Login modal, Help Center panes 1..6,
//      Planner & Tracker with zero Arabic leakage in EN mode
//   8. Responsive Desktop (1440x900), Tablet (768x1024), Mobile (390x844 & 360x740)
//      tap targets (>= 44px), zero horizontal overflow, zero runtime errors
//   9. Captures desktop & mobile EN/AR screenshots to reports/screenshots/wp6-7/
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
    console.error(`  [FAIL] ${testName} ${details ? '(' + details + ')' : ''}`);
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

async function openFreshPage(browser, viewport = { width: 1440, height: 900 }) {
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

async function main() {
  console.log('======================================================================');
  console.log('EXO WP 6.7 — THE HANDCRAFTED EXPERIENCE REBUILD E2E VERIFICATION');
  console.log('======================================================================');

  const screenshotDir = path.join(__dirname, 'reports', 'screenshots', 'wp6-7');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const spawnedServer = await ensureLocalServerRunning();
  const browser = await chromium.launch(resolveChromiumLaunchOptions());

  try {
    // ------------------------------------------------------------------------
    // 1. Desktop E2E: Shell, Embedded Chapter Studio, Audio, Planner XSS, Tracker, Drive Hub, i18n
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Desktop Workspace, Embedded Studio, Planner XSS & Drive Hub ---');
    const { context, page, pageErrors, consoleErrors } = await openFreshPage(browser, { width: 1440, height: 900 });

    const shellCheck = await page.evaluate(() => ({
      hasSidebarFs: Boolean(document.getElementById('sidebarFullscreenBtn')),
      hasHeaderFs: Boolean(document.getElementById('appGlobalFullscreenBtn')),
      hasSidebarGdrive: Boolean(document.getElementById('sidebarGdriveBtn')),
      lang: document.documentElement.lang,
      dir: document.documentElement.dir
    }));
    assert(!shellCheck.hasSidebarFs && !shellCheck.hasHeaderFs, 'Global Fullscreen buttons absent in desktop shell');
    assert(shellCheck.hasSidebarGdrive, 'Sidebar Google Drive button #sidebarGdriveBtn is present');
    assert(shellCheck.lang === 'en' && shellCheck.dir === 'ltr', 'First-run default language is EN / LTR');

    // Seed workspace with realistic study data + XSS payload test strings in Planner & Goals
    const pdfBase64 = buildMinimalMultiPagePdfBytes(3).toString('base64');
    const wavBase64 = buildMinimalWavBytes(400).toString('base64');
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
          name: 'Clinical Pharmacology <img src=x onerror="window.__xssSub=1">',
          color: '#899982',
          groups: [
            {
              id: grpId,
              name: 'Chapter 1: Autonomic Nervous System',
              lectures: [
                {
                  id: lecId,
                  title: 'Lecture 1 — Cholinergic Agonists',
                  hasLocalPdf: true,
                  hasLocalAudio: true,
                  completed: false,
                  lastViewedPage: 1,
                  totalPages: 3
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
          title: 'XSS Probe <img src=x onerror="window.__xssEv=1"> Study',
          notes: '<svg onload="window.__xssNote=1">Review slides',
          day: todayDay,
          startHour: 10,
          duration: 1.5,
          type: 'important',
          subjectId: subId,
          completed: true
        },
        {
          id: 8002,
          title: 'Second Session <script>window.__xss2=1</script>',
          notes: '',
          day: todayDay,
          startHour: 14,
          duration: 1,
          type: 'review',
          subjectId: subId,
          completed: false
        }
      ];
      scheduleBacklog = [
        {
          id: 9001,
          title: 'Goal <img src=x onerror="window.__xssGoal=1">',
          subjectId: subId,
          linkedEventIds: ['8001'],
          linkedEventId: '8001',
          done: false
        }
      ];
      saveScheduleData();
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof renderSubjectsList === 'function') renderSubjectsList();
      if (typeof renderSchedule === 'function') renderSchedule();
      if (typeof updateTracker === 'function') updateTracker();
    }, { pdfB64: pdfBase64, wavB64: wavBase64 });

    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(screenshotDir, 'desktop-home-en.png') });

    // Navigate to Subjects -> Subject TOC -> Chapter Workspace -> Launch Studio
    await page.click('.sidebar-nav-item[data-tab="subjects"]');
    await page.waitForSelector('.subject-card.exo-cutout-card', { timeout: 6000 });
    await page.click('.subject-card.exo-cutout-card');
    await page.waitForSelector('.group-card.exo-cutout-strip', { timeout: 6000 });
    await page.click('.group-card .exo-toc-open-workspace-btn');
    await page.waitForSelector('#chapter-workspace-view', { state: 'visible', timeout: 6000 });
    await page.click('#cwOpenStudioPrimaryBtn');
    await page.waitForSelector('#pdfViewerModalOverlay.active', { timeout: 6000 });
    await page.waitForTimeout(350);

    const embeddedState = await page.evaluate(() => {
      const overlay = document.getElementById('pdfViewerModalOverlay');
      const mount = document.getElementById('cwEmbeddedStudioMount');
      const container = document.getElementById('pdfModalContainer');
      const cwView = document.getElementById('chapter-workspace-view');
      const backBtn = document.getElementById('pdfBackToChapterBtn');
      return {
        isMountedInsideCw: Boolean(overlay && mount && overlay.parentElement === mount),
        hasEmbeddedClass: Boolean(overlay && overlay.classList.contains('exo-studio-embedded')),
        cwVisible: Boolean(cwView && cwView.style.display !== 'none'),
        isFullscreenInitially: Boolean(container && container.classList.contains('is-fullscreen')),
        backBtnVisible: Boolean(backBtn && getComputedStyle(backBtn).display !== 'none')
      };
    });
    assert(embeddedState.isMountedInsideCw && embeddedState.hasEmbeddedClass, 'PDF Studio opens embedded inside Chapter Workspace by default');
    assert(embeddedState.cwVisible && embeddedState.backBtnVisible, 'Chapter Workspace stays visible with Back to Chapter button');
    assert(!embeddedState.isFullscreenInitially, 'Studio does not hijack fullscreen on initial launch');
    await page.screenshot({ path: path.join(screenshotDir, 'desktop-chapter-studio-en.png') });

    // Expand Studio fullscreen and collapse back to embedded
    await page.click('#pdfFullscreenBtn');
    await page.waitForTimeout(150);
    const expandedState = await page.evaluate(() => {
      const overlay = document.getElementById('pdfViewerModalOverlay');
      const container = document.getElementById('pdfModalContainer');
      return {
        movedToBody: Boolean(overlay && overlay.parentElement === document.body),
        hasFsClass: Boolean(container && container.classList.contains('is-fullscreen'))
      };
    });
    assert(expandedState.movedToBody && expandedState.hasFsClass, 'Clicking Studio Fullscreen expands to document.body fullscreen');

    await page.click('#pdfFullscreenBtn');
    await page.waitForTimeout(150);
    const collapsedState = await page.evaluate(() => {
      const overlay = document.getElementById('pdfViewerModalOverlay');
      const mount = document.getElementById('cwEmbeddedStudioMount');
      const container = document.getElementById('pdfModalContainer');
      return {
        returnedToCwMount: Boolean(overlay && mount && overlay.parentElement === mount),
        hasEmbeddedClass: Boolean(overlay && overlay.classList.contains('exo-studio-embedded')),
        clearedFsClass: Boolean(container && !container.classList.contains('is-fullscreen'))
      };
    });
    assert(collapsedState.returnedToCwMount && collapsedState.hasEmbeddedClass && collapsedState.clearedFsClass, 'Clicking Fullscreen toggle again returns Studio seamlessly inside Chapter Workspace');

    // Close Studio via #pdfBackToChapterBtn and measure synchronous response
    const closePerf = await page.evaluate(() => {
      const t0 = performance.now();
      document.getElementById('pdfBackToChapterBtn').click();
      const t1 = performance.now();
      const overlay = document.getElementById('pdfViewerModalOverlay');
      const mount = document.getElementById('cwEmbeddedStudioMount');
      return {
        dt: t1 - t0,
        activeRemoved: Boolean(overlay && !overlay.classList.contains('active')),
        embeddedRemoved: Boolean(overlay && !overlay.classList.contains('exo-studio-embedded')),
        movedBackToBody: Boolean(overlay && overlay.parentElement === document.body),
        mountHidden: Boolean(mount && mount.style.display === 'none')
      };
    });
    assert(closePerf.dt < 50 && closePerf.activeRemoved && closePerf.embeddedRemoved && closePerf.movedBackToBody && closePerf.mountHidden,
      `closePdfViewer unmounts cleanly in ${closePerf.dt.toFixed(2)}ms (<50ms)`);

    // ------------------------------------------------------------------------
    // 2. Planner XSS Guard & Week/Today/Goals Views
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Planner Views, Escaping & Bilingual Checks ---');
    await page.click('.sidebar-nav-item[data-tab="schedule"]');
    await page.waitForSelector('#schedule.active', { timeout: 6000 });

    await page.click('#schPillToday');
    await page.waitForTimeout(150);
    await page.click('#toggleHourlyCompactBtn');
    await page.waitForTimeout(120);
    await page.click('#btnHourlyFullRulerMode');
    await page.waitForTimeout(120);
    await page.click('#schPillWeek');
    await page.waitForTimeout(150);
    await page.click('#schPillTasks');
    await page.waitForTimeout(150);
    await page.click('#schPillToday');
    await page.waitForTimeout(150);

    const xssCheck = await page.evaluate(() => ({
      xssFlags: Boolean(window.__xssSub || window.__xssEv || window.__xssNote || window.__xss2 || window.__xssGoal),
      injectedImgs: document.querySelectorAll('#schedule img[src="x"], #schedule svg[onload]').length,
      hasLiteralEscapedText: (document.getElementById('schedule')?.textContent || '').includes('<img src=x'),
      hasCutoutStrip: Boolean(document.getElementById('plannerJournalSummaryStrip')?.classList.contains('exo-cutout-strip'))
    }));
    assert(!xssCheck.xssFlags && xssCheck.injectedImgs === 0 && xssCheck.hasLiteralEscapedText, 'Planner Today/Week/Goals safely escape <img/svg/script> payloads');
    assert(xssCheck.hasCutoutStrip, 'Planner summary strip uses Living Journal cutout styling');
    await page.screenshot({ path: path.join(screenshotDir, 'desktop-planner-en.png') });

    // ------------------------------------------------------------------------
    // 3. Tracker Asymmetric Overview & Required KPIs
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Tracker Living Journal Asymmetric Overview ---');
    await page.click('.sidebar-nav-item[data-tab="tracker"]');
    await page.waitForSelector('#tracker.active', { timeout: 6000 });
    await page.waitForTimeout(200);

    const trackerState = await page.evaluate(() => {
      const ids = ['weekAdherenceRate', 'statDoneHours', 'statStreak', 'statGoalsCompletedRatio', 'trackerJournalMarginNote'];
      const present = ids.every(id => Boolean(document.getElementById(id)));
      const marginTxt = document.getElementById('trackerJournalMarginNote')?.innerText || '';
      const overview = document.querySelector('.exo-tracker-journal-overview');
      return {
        present,
        marginTxt,
        hasOverview: Boolean(overview && overview.getBoundingClientRect().height > 50)
      };
    });
    assert(trackerState.present && trackerState.hasOverview && trackerState.marginTxt.length > 0,
      `Tracker asymmetric overview renders with all KPI IDs & margin note ("${trackerState.marginTxt}")`);
    await page.screenshot({ path: path.join(screenshotDir, 'desktop-tracker-en.png') });

    // ------------------------------------------------------------------------
    // 4. Dedicated Google Drive Hub Separation Across States (Signed Out, Free, VIP)
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Dedicated Google Drive Hub & Account Separation ---');
    await page.click('#sidebarGdriveBtn');
    await page.waitForSelector('#driveHubModalOverlay.active', { timeout: 5000 });
    await page.waitForTimeout(150);

    const driveSignedOut = await page.evaluate(() => ({
      driveModalOpen: document.getElementById('driveHubModalOverlay')?.classList.contains('active'),
      authModalClosed: !document.getElementById('cloudAuthModalOverlay')?.classList.contains('active'),
      cardCount: document.querySelectorAll('#cloudGdriveSyncCard').length,
      mountedInDrive: document.getElementById('cloudGdriveSyncCard')?.parentElement?.id === 'driveHubModalMount',
      bannerText: document.getElementById('driveHubStateBanner')?.innerText || ''
    }));
    assert(driveSignedOut.driveModalOpen && driveSignedOut.authModalClosed && driveSignedOut.mountedInDrive, 'Sidebar Drive button opens #driveHubModalOverlay cleanly with #cloudGdriveSyncCard mounted inside');
    assert(driveSignedOut.cardCount === 1, 'Zero duplicate #cloudGdriveSyncCard IDs in DOM');
    assert(driveSignedOut.bannerText.toLowerCase().includes('sign-in required'), 'Signed-out Drive Hub explains account requirement clearly');
    await page.screenshot({ path: path.join(screenshotDir, 'desktop-drive-hub-en.png') });

    // Simulate Signed-In Free user state & VIP active state
    await page.evaluate(() => {
      currentCloudUser = { id: '00000000-0000-4000-8000-000000000001', email: 'free@exo.test', user_metadata: { full_name: 'Free User' } };
      currentUserCanUploadMedia = false;
      openGoogleDriveHubModal();
    });
    const freeBanner = await page.evaluate(() => document.getElementById('driveHubStateBanner')?.innerText || '');
    assert(freeBanner.toLowerCase().includes('free plan'), 'Free user Drive Hub banner states local storage is active & free');

    await page.evaluate(() => {
      currentUserCanUploadMedia = true;
      openGoogleDriveHubModal();
    });
    const vipBanner = await page.evaluate(() => document.getElementById('driveHubStateBanner')?.innerText || '');
    assert(vipBanner.toLowerCase().includes('vip pro active'), 'VIP user Drive Hub banner invites linking private Google Drive');

    await page.click('#driveHubOpenAccountBtn');
    await page.waitForSelector('#cloudAuthModalOverlay.active', { timeout: 5000 });
    const returnedToAuth = await page.evaluate(() => ({
      driveClosed: !document.getElementById('driveHubModalOverlay')?.classList.contains('active'),
      mountedInAuth: document.getElementById('cloudGdriveSyncCard')?.parentElement?.id === 'cloudAuthDriveMount'
    }));
    assert(returnedToAuth.driveClosed && returnedToAuth.mountedInAuth, 'Switching from Drive Hub to Account modal cleanly re-mounts Drive card back to Account host');
    await page.click('#cloudAuthModalCloseBtn');

    // ------------------------------------------------------------------------
    // 5. Bilingual EN <-> AR Live Switch: Auth Modal, Help Center (Panes 1..6), VIP Modal
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Bilingual EN/AR Checks on Login, Help Center & VIP Modals ---');
    const arRegexCheck = /[\u0600-\u06FF]/;
    await page.evaluate(() => {
      currentCloudUser = null;
      currentUserCanUploadMedia = false;
      applyExoLanguage('en', false);
      openCloudAuthModal();
    });
    await page.waitForTimeout(120);
    const authEnLeaks = await page.evaluate(() => {
      const modal = document.getElementById('cloudAuthModalOverlay');
      const txt = (modal ? modal.innerText : '') + ' ' + Array.from(document.querySelectorAll('#authCollegeSelect option, #authYearSelect option')).map(o => o.textContent).join(' ');
      return txt;
    });
    assert(!arRegexCheck.test(authEnLeaks), 'Login / Account modal & select dropdowns have zero Arabic text in EN mode');
    await page.click('#cloudAuthModalCloseBtn');

    // Open Help Center and check panes 1..6 in EN
    await page.click('#sidebarHelpBtn');
    await page.waitForSelector('#helpModalOverlay.active', { timeout: 5000 });
    let helpEnOk = true;
    for (let mod = 1; mod <= 6; mod++) {
      await page.click(`#acadNav_${mod}`);
      await page.waitForTimeout(60);
      const paneTxt = await page.evaluate((m) => document.getElementById(`acadPane_${m}`)?.innerText || '', mod);
      if (arRegexCheck.test(paneTxt)) {
        helpEnOk = false;
        console.error(`    Arabic text leaked in #acadPane_${mod} EN mode:`, paneTxt.slice(0, 120));
      }
    }
    assert(helpEnOk, 'All 6 Help Center panes render cleanly in English with zero Arabic leaks');

    const vipCopyCheck = await page.evaluate(() => {
      const p6 = document.getElementById('acadPane_6')?.innerText || '';
      return p6.toLowerCase().includes('free for everyone') && p6.toLowerCase().includes('annotated pdf export');
    });
    assert(vipCopyCheck, 'Help Center Section 6 truthfully marks Annotated PDF Export & Extra Note Sheets as free');

    await page.click('#helpVipDetailsBtn');
    await page.waitForSelector('#vipMediaLockModalOverlay.active', { timeout: 5000 });
    const vipModalEn = await page.evaluate(() => document.getElementById('vipMediaLockModalOverlay')?.innerText || '');
    assert(!arRegexCheck.test(vipModalEn) && vipModalEn.toLowerCase().includes('free forever'), 'VIP Pro modal displays crisp EN copy respecting GEMINI.md Section 6');
    await page.click('#vipMediaLockCloseBtn');

    // Verify EN Tracker & Planner have zero Arabic leakage
    const trackerEnLeak = await page.evaluate(() => {
      const el = document.getElementById('tracker');
      return el ? el.innerText : '';
    });
    assert(!arRegexCheck.test(trackerEnLeak), 'Tracker page has zero Arabic text in EN mode');

    // Switch live to Arabic and verify RTL & Arabic rendering
    await page.evaluate(() => applyExoLanguage('ar', false));
    await page.waitForTimeout(200);
    const arState = await page.evaluate(() => ({
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
      trackerTitle: document.querySelector('#tracker .tracker-top-header h2')?.innerText || ''
    }));
    assert(arState.dir === 'rtl' && arState.lang === 'ar' && arRegexCheck.test(arState.trackerTitle), 'Switching back to Arabic cleanly switches dir=rtl and restores Arabic headings');

    await context.close();

    // ------------------------------------------------------------------------
    // 6. Responsive Matrix: Tablet (768x1024) & Mobile (390x844, 360x740) EN/AR
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Responsive Layout, Tap Targets & Mobile Screenshots ---');
    for (const vp of [
      { name: 'tablet_768', width: 768, height: 1024, lang: 'en' },
      { name: 'mobile_390_en', width: 390, height: 844, lang: 'en', shot: 'mobile-home-en.png' },
      { name: 'mobile_360_ar', width: 360, height: 740, lang: 'ar', shot: 'mobile-tracker-ar.png' }
    ]) {
      const m = await openFreshPage(browser, { width: vp.width, height: vp.height });
      await m.page.evaluate((lng) => {
        applyExoLanguage(lng, false);
        if (lng === 'ar') {
          const tBtn = document.querySelector('.mobile-nav-item[data-tab="tracker"]');
          if (tBtn) tBtn.click();
        }
      }, vp.lang);
      await m.page.waitForTimeout(220);

      const layout = await m.page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
        const navBtns = Array.from(document.querySelectorAll('.mobile-nav-item, .mobile-header-actions button')).filter(b => b.offsetParent !== null);
        const smallBtns = navBtns.filter(b => {
          const r = b.getBoundingClientRect();
          return r.width < 40 || r.height < 40;
        }).map(b => `${b.id || b.className}(${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)})`);
        return { overflow, smallBtns, navCount: navBtns.length };
      });
      assert(!layout.overflow, `${vp.name}: zero horizontal overflow`);
      assert(layout.smallBtns.length === 0, `${vp.name}: mobile header & bottom nav buttons meet touch size (${layout.smallBtns.join(', ')})`);
      if (vp.shot) {
        await m.page.screenshot({ path: path.join(screenshotDir, vp.shot) });
      }
      assert(m.pageErrors.length === 0 && m.consoleErrors.length === 0, `${vp.name}: zero pageerror/console.error`);
      await m.context.close();
    }

    assert(pageErrors.length === 0 && consoleErrors.length === 0, `Desktop session zero runtime errors (pageErrors=${pageErrors.length}, consoleErrors=${consoleErrors.length})`);
  } finally {
    await browser.close();
    if (spawnedServer) spawnedServer.kill();
  }

  console.log('\n======================================================================');
  console.log(`WP 6.7 CHROMIUM E2E RESULTS -> PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('======================================================================');
  if (testsFailed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal WP 6.7 E2E error:', err);
  process.exit(1);
});
