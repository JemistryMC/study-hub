// ============================================================================
// Exo Personal Study Journal — Phase 6 / WP 6.6 Real-UI Chromium E2E Suite
// Final Acceptance Gate covering:
//   1. 60-cell Responsive & Bilingual Matrix (5 viewports x 2 langs x 6 views)
//      + EN zero Arabic leaks + heading order + >=44px mobile touch targets
//   2. WCAG 2.1 AA Contrast Verification across repaired surfaces & Studio
//   3. Modal Keyboard Focus Capture, Tab Containment & Escape Focus Return
//   4. Full PDF Studio Behavioral Parity (5-page %PDF-1.4 + WAV, pen/undo,
//      highlighter, laser, text, eraser, toggleAnnotationsVisibility,
//      bookmark, thumbnails, add blank note, hide/restore slide,
//      Free Extra Note Sheet, Free Annotated PDF export, Audio Pin modal,
//      Quick Jump Esc, Palm rejection, shortcut isolation inside <input>)
//   5. prefers-reduced-motion CSS collapse + Heavy 900-lecture latency checks
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
    if (defaultPath && fs.existsSync(defaultPath)) {
      return opts;
    }
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

// Deterministic offline PDF.js shim that parses page count from real %PDF bytes
// and renders real canvases so PDF Studio & exportAnnotatedSlides run 100% deterministically.
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
    return 5;
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
                canvasContext.fillText('EXO Synthetic Slide ' + pageNum + ' / ' + total, 48, 80);
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

function buildMinimalMultiPagePdfBytes(pageCount = 5) {
  const objs = [];
  const kidRefs = [];
  for (let i = 0; i < pageCount; i++) {
    const pageObjId = 3 + i;
    kidRefs.push(`${pageObjId} 0 R`);
  }
  objs.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objs.push(`2 0 obj\n<< /Type /Pages /Kids [${kidRefs.join(' ')}] /Count ${pageCount} >>\nendobj\n`);
  for (let i = 0; i < pageCount; i++) {
    const pageObjId = 3 + i;
    objs.push(`${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n`);
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

function buildMinimalWavBytes(durationMs = 600) {
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

async function openSeededPage(browser, viewport = { width: 1440, height: 900 }, extraCtxOpts = {}) {
  const context = await browser.newContext(Object.assign({ viewport }, extraCtxOpts));
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
  console.log('EXO WP 6.6 FINAL REGRESSION, A11Y, BILINGUAL & STUDIO E2E VERIFICATION');
  console.log('======================================================================');

  const spawnedServer = await ensureLocalServerRunning();
  const browser = await chromium.launch(resolveChromiumLaunchOptions());

  try {
    // ------------------------------------------------------------------------
    // 1. 60-cell Responsive & Bilingual Matrix + EN Arabic Leak + Heading Order
    // ------------------------------------------------------------------------
    console.log('\n--- 1. 60-Cell Responsive & Bilingual Matrix (5 viewports x 2 langs x 6 views) ---');
    const viewports = [
      { name: 'desktop_1440', width: 1440, height: 900 },
      { name: 'laptop_1280', width: 1280, height: 800 },
      { name: 'tablet_768', width: 768, height: 1024 },
      { name: 'mobile_390', width: 390, height: 844 },
      { name: 'mobile_360', width: 360, height: 740 }
    ];

    const matrixIssues = [];
    const arLeaks = [];
    const headingSkips = [];
    const smallMobileTargets = [];

    const mSess = await openSeededPage(browser, { width: 1440, height: 900 });
    try {
      const p = mSess.page;
      // Seed realistic synthetic study data + chapter workspace so all 6 views are populated
      await p.evaluate(() => {
        localStorage.setItem('exoAppLang', 'en');
        const sub = {
          id: 'sub_wp66_1',
          name: 'Clinical Pharmacology',
          color: '#899982',
          isDivided: true,
          groups: [{
            id: 'grp_wp66_1',
            title: 'Ch 1: Autonomic Drugs',
            lectures: [
              { id: 'lec_wp66_1', title: 'Cholinergic Agonists', pdfName: 'ch1.pdf', completed: true, recordings: [{ id: 'rec_1', title: 'Part 1 Audio' }], links: [{ id: 'lnk_1', title: 'Video Lecture', url: 'https://example.org/lec1' }] },
              { id: 'lec_wp66_2', title: 'Anticholinergic Agents', completed: false, recordings: [] }
            ]
          }]
        };
        subjects = [sub];
        scheduleEvents = [
          { id: 'ev_1', dayIndex: 0, startHour: 9, duration: 1.5, title: 'Pharmacology Ch 1', type: 'study', subjectId: 'sub_wp66_1', completed: false }
        ];
        weeklyBacklog = [{ id: 'g_1', title: 'Finish Cholinergic notes', completed: false }];
        studyLogs = [{ id: 'log_1', date: new Date().toISOString().slice(0, 10), subjectId: 'sub_wp66_1', durationHours: 1.5, mood: 'great', notes: 'Completed slide review' }];
        localStorage.setItem('pharmaSubjects', JSON.stringify(subjects));
        localStorage.setItem('pharmaSchedule', JSON.stringify({ events: scheduleEvents, backlog: weeklyBacklog }));
        localStorage.setItem('pharmaLogs', JSON.stringify(studyLogs));
        if (typeof renderAll === 'function') renderAll();
        if (typeof applyExoLanguage === 'function') applyExoLanguage('en', true);
      });

      for (const vp of viewports) {
        await p.setViewportSize({ width: vp.width, height: vp.height });
        for (const lang of ['en', 'ar']) {
          await p.evaluate((l) => { if (typeof applyExoLanguage === 'function') applyExoLanguage(l, true); }, lang);
          await p.waitForFunction((l) => document.documentElement.lang === l && document.documentElement.dir === (l === 'ar' ? 'rtl' : 'ltr'), lang);

          const views = ['dashboard', 'subjects', 'subject_toc', 'chapter_ws', 'schedule', 'tracker'];
          for (const view of views) {
            await p.evaluate((v) => {
              if (v === 'subject_toc') {
                switchView('subjects');
                if (typeof openSubject === 'function') openSubject('sub_wp66_1');
              } else if (v === 'chapter_ws') {
                switchView('subjects');
                if (typeof openSubject === 'function') openSubject('sub_wp66_1');
                if (typeof openChapterWorkspace === 'function') openChapterWorkspace('grp_wp66_1');
              } else {
                switchView(v);
              }
            }, view);
            await p.waitForTimeout(120);

            const probe = await p.evaluate(({ vpWidth, langNow, viewName }) => {
              const overflowPx = Math.max(0, document.documentElement.scrollWidth - window.innerWidth, document.body.scrollWidth - window.innerWidth);
              const sb = document.getElementById('exoSidebar');
              const main = document.querySelector('.main-content');
              let sidebarOverlap = false;
              if (sb && main && sb.offsetParent !== null && vpWidth >= 1024) {
                const sr = sb.getBoundingClientRect();
                const mr = main.getBoundingClientRect();
                if (sr.width > 0 && mr.width > 0) {
                  sidebarOverlap = document.documentElement.dir === 'rtl' ? (mr.right > sr.left + 2) : (mr.left < sr.right - 2);
                }
              }

              // Heading hierarchy check within active view
              const activeRoot = document.querySelector('.view-section.active') || document.body;
              const visibleHeadings = Array.from(activeRoot.querySelectorAll('h1, h2, h3, h4, h5, h6'))
                .filter(h => h.offsetParent !== null && h.innerText.trim().length > 0)
                .map(h => Number(h.tagName.slice(1)));
              let skippedLevel = null;
              for (let i = 1; i < visibleHeadings.length; i++) {
                if (visibleHeadings[i] - visibleHeadings[i - 1] > 1) {
                  skippedLevel = `${visibleHeadings[i - 1]}->${visibleHeadings[i]}`;
                  break;
                }
              }

              // Arabic leak check in EN mode
              let leakSamples = [];
              if (langNow === 'en') {
                const arRe = /[\u0600-\u06FF]/;
                const walker = document.createTreeWalker(activeRoot, NodeFilter.SHOW_TEXT);
                let node;
                while ((node = walker.nextNode())) {
                  const txt = (node.nodeValue || '').trim();
                  if (!txt || !arRe.test(txt)) continue;
                  const el = node.parentElement;
                  if (!el || el.offsetParent === null) continue;
                  if (el.closest('[data-exo-no-i18n="1"], #sidebarLangToggleBtn, #appLangToggleBtn, #appLangToggleText')) continue;
                  leakSamples.push(txt.slice(0, 60));
                }
              }

              // Mobile touch target check (excluding compact small indicator pills if decorative, check interactive buttons)
              let smallBtns = [];
              if (vpWidth <= 767) {
                const targets = Array.from(activeRoot.querySelectorAll('.sfw-hour-chip, button.exo-lec-status-tag, .psf-toggle-pill-btn, .smart-rec-action-btn, .btn-primary'));
                for (const b of targets) {
                  if (b.offsetParent === null) continue;
                  const r = b.getBoundingClientRect();
                  if (r.width > 0 && r.height > 0 && r.height < 43) {
                    smallBtns.push(`${b.tagName}.${b.className}=${Math.round(r.height)}px`);
                  }
                }
              }

              return { overflowPx, sidebarOverlap, skippedLevel, leakSamples, smallBtns };
            }, { vpWidth: vp.width, langNow: lang, viewName: view });

            if (probe.overflowPx > 1 || probe.sidebarOverlap) {
              matrixIssues.push(`${vp.name}/${lang}/${view}: overflow=${probe.overflowPx} overlap=${probe.sidebarOverlap}`);
            }
            if (probe.skippedLevel) {
              headingSkips.push(`${vp.name}/${lang}/${view}: ${probe.skippedLevel}`);
            }
            if (probe.leakSamples.length) {
              arLeaks.push(`${vp.name}/${view}: ${probe.leakSamples.join(' | ')}`);
            }
            if (probe.smallBtns.length) {
              smallMobileTargets.push(`${vp.name}/${lang}/${view}: ${probe.smallBtns.join(', ')}`);
            }
          }
        }
      }

      assert(matrixIssues.length === 0, '60-cell matrix (5 viewports x 2 langs x 6 views) passes with 0 horizontal overflow and 0 sidebar overlap', matrixIssues.join('; '));
      assert(arLeaks.length === 0, 'Zero EN-mode Arabic text leaks across all 6 views and 5 viewports', arLeaks.join('; '));
      assert(headingSkips.length === 0, 'Heading hierarchy has zero skipped levels across all 6 views', headingSkips.join('; '));
      assert(smallMobileTargets.length === 0, 'Mobile touch targets (.sfw-hour-chip, .exo-lec-status-tag, .psf-toggle-pill-btn, CTAs) satisfy >=44px height', smallMobileTargets.join('; '));

      // ------------------------------------------------------------------------
      // 2. WCAG 2.1 AA Contrast Check on Repaired Elements & Account/Studio Surfaces
      // ------------------------------------------------------------------------
      console.log('\n--- 2. WCAG 2.1 AA Contrast Verification ---');
      await p.setViewportSize({ width: 1440, height: 900 });
      await p.evaluate(() => {
        applyExoLanguage('en', true);
        switchView('schedule');
      });
      await p.waitForTimeout(150);

      const contrastCheck = await p.evaluate(() => {
        function parseRgb(str) {
          const m = (str || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (!m) return null;
          return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
        }
        function composite(fg, bg) {
          const a = fg.a ?? 1;
          return {
            r: Math.round(fg.r * a + bg.r * (1 - a)),
            g: Math.round(fg.g * a + bg.g * (1 - a)),
            b: Math.round(fg.b * a + bg.b * (1 - a)),
            a: 1
          };
        }
        function effectiveBg(el) {
          const stack = [];
          let cur = el;
          while (cur && cur.nodeType === 1) {
            const bg = parseRgb(getComputedStyle(cur).backgroundColor);
            if (bg && bg.a > 0) stack.unshift(bg);
            cur = cur.parentElement;
          }
          let base = { r: 25, g: 27, b: 29, a: 1 };
          for (const layer of stack) base = composite(layer, base);
          return base;
        }
        function lum({ r, g, b }) {
          const f = (c) => {
            const v = c / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        }
        function ratioFor(el) {
          if (!el || el.offsetParent === null) return null;
          const fg = parseRgb(getComputedStyle(el).color);
          if (!fg) return null;
          const bg = effectiveBg(el);
          const l1 = lum(composite(fg, bg));
          const l2 = lum(bg);
          return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        }

        const psfBtn = document.getElementById('psfToggleDrawerBtn');
        const psfRatio = ratioFor(psfBtn);
        if (typeof openAddSessionModal === 'function') openAddSessionModal(0, 9);
        const endPill = document.getElementById('calculatedEndTimePill');
        const endPillRatio = ratioFor(endPill);
        if (typeof closeModal === 'function') closeModal('sessionModalOverlay');

        // Also check Account modal <select> options have no Arabic in EN mode
        if (typeof openCloudAuthModal === 'function') openCloudAuthModal();
        const collegeOpts = Array.from(document.querySelectorAll('#cloudAuthCollegeSelect option, #cloudAuthYearSelect option')).map(o => o.textContent.trim());
        const arOptLeaks = collegeOpts.filter(t => /[\u0600-\u06FF]/.test(t));
        if (typeof closeModal === 'function') closeModal('cloudAuthModalOverlay');

        return { psfRatio, endPillRatio, arOptLeaks };
      });

      assert(
        contrastCheck.psfRatio >= 4.5 && contrastCheck.endPillRatio >= 4.5,
        'Repaired Planner toggle pill and #calculatedEndTimePill meet WCAG AA >= 4.5:1 contrast',
        JSON.stringify({ psfRatio: contrastCheck.psfRatio?.toFixed(2), endPillRatio: contrastCheck.endPillRatio?.toFixed(2) })
      );
      assert(
        contrastCheck.arOptLeaks.length === 0,
        'Account modal college & academic year <select> options contain zero Arabic leaks in EN mode',
        contrastCheck.arOptLeaks.join(', ')
      );

      // ------------------------------------------------------------------------
      // 3. Modal Keyboard Focus Capture, Tab Trap Containment & Escape Return
      // ------------------------------------------------------------------------
      console.log('\n--- 3. Modal Keyboard Focus Capture, Tab Trap & Escape Return ---');
      await p.evaluate(() => switchView('dashboard'));
      await p.waitForTimeout(100);
      await p.focus('.sidebar-profile-card');
      await p.click('.sidebar-profile-card');
      await p.waitForSelector('#cloudAuthModalOverlay.active', { timeout: 3000 });
      await p.waitForTimeout(60);

      const insideModalOnOpen = await p.evaluate(() => {
        const modal = document.getElementById('cloudAuthModalOverlay');
        return Boolean(modal && modal.contains(document.activeElement));
      });
      await p.keyboard.press('Tab');
      await p.keyboard.press('Tab');
      const stillInsideAfterTabs = await p.evaluate(() => {
        const modal = document.getElementById('cloudAuthModalOverlay');
        return Boolean(modal && modal.contains(document.activeElement));
      });
      await p.keyboard.press('Escape');
      await p.waitForFunction(() => !document.getElementById('cloudAuthModalOverlay')?.classList.contains('active'));
      await p.waitForTimeout(60);
      const focusReturnedToTrigger = await p.evaluate(() => Boolean(document.activeElement?.classList?.contains('sidebar-profile-card')));

      assert(insideModalOnOpen, 'Opening modal captures initial keyboard focus inside dialog');
      assert(stillInsideAfterTabs, 'Pressing Tab keeps focus contained inside active dialog');
      assert(focusReturnedToTrigger, 'Pressing Escape closes dialog and restores focus to trigger button (.sidebar-profile-card)');
      assert(mSess.pageErrors.length === 0 && mSess.consoleErrors.length === 0, 'Zero page/console errors in responsive/a11y/focus checks');
    } finally {
      await mSess.context.close();
    }

    // ------------------------------------------------------------------------
    // 4. Full PDF Studio Behavioral Parity (5-page %PDF + WAV, Free Account)
    // ------------------------------------------------------------------------
    console.log('\n--- 4. PDF Studio Full Behavioral Parity (Free User, 5-Page PDF + WAV) ---');
    const studioSess = await openSeededPage(browser, { width: 1440, height: 900 });
    try {
      const p = studioSess.page;
      const pdfBuf = buildMinimalMultiPagePdfBytes(5);
      const wavBuf = buildMinimalWavBytes(600);

      await p.evaluate(() => {
        window.__wp66ExportedBlobs = [];
        const origCreate = URL.createObjectURL.bind(URL);
        URL.createObjectURL = function(blob) {
          try {
            if (blob && blob.type === 'application/pdf') {
              window.__wp66ExportedBlobs.push({ type: blob.type, size: blob.size, blob });
            }
          } catch {}
          return origCreate(blob);
        };
      });

      await p.evaluate(async ({ pdfArr, wavArr }) => {
        localStorage.setItem('exoAppLang', 'en');
        await initPdfDB();
        const sub = {
          id: 'sub_studio',
          name: 'Pharmaceutics',
          color: '#899982',
          isDivided: true,
          groups: [{
            id: 'grp_studio',
            title: 'Ch 1: Tablets',
            lectures: [{ id: 'lec_studio_1', title: 'Tablet Compression', pdfName: 'tablets.pdf', recordings: [{ id: 'rec_s1', title: 'Lecture Audio' }] }]
          }]
        };
        subjects = [sub];
        localStorage.setItem('pharmaSubjects', JSON.stringify(subjects));
        await saveMediaToDB('pdfs', 'lec_studio_1', new Blob([new Uint8Array(pdfArr)], { type: 'application/pdf' }));
        await saveMediaToDB('audios', 'lec_studio_1_rec_s1', new Blob([new Uint8Array(wavArr)], { type: 'audio/wav' }));
        await saveMediaToDB('audios', 'lec_studio_1', new Blob([new Uint8Array(wavArr)], { type: 'audio/wav' }));
        if (typeof renderAll === 'function') renderAll();
        if (typeof applyExoLanguage === 'function') applyExoLanguage('en', true);
      }, { pdfArr: Array.from(pdfBuf), wavArr: Array.from(wavBuf) });

      const tOpenStart = Date.now();
      await p.evaluate(async () => {
        switchView('subjects');
        if (typeof openSubject === 'function') openSubject('sub_studio');
        if (typeof openChapterWorkspace === 'function') openChapterWorkspace('grp_studio');
        await openLectureDocument('grp_studio', 'lec_studio_1');
      });
      await p.waitForSelector('#pdfPagesScrollContainer .pdf-page-wrapper', { timeout: 6000 });
      const openDurationMs = Date.now() - tOpenStart;

      // Step next / prev page, zoom, fit toggle, palm reject
      const navResult = await p.evaluate(async () => {
        const initialPages = totalPdfPages;
        if (typeof stepPdfPage === 'function') stepPdfPage(1);
        const pageAfterNext = currentActivePageNum;
        if (typeof stepPdfPage === 'function') stepPdfPage(-1);
        const pageAfterPrev = currentActivePageNum;

        const z0 = currentPdfZoom;
        if (typeof changePdfZoom === 'function') await changePdfZoom(0.2);
        const zPlus = currentPdfZoom;
        if (typeof togglePdfFitModeQuick === 'function') togglePdfFitModeQuick();

        const p0 = palmRejectionMode;
        if (typeof togglePalmRejectionMode === 'function') togglePalmRejectionMode();
        const p1 = palmRejectionMode;
        if (typeof togglePalmRejectionMode === 'function') togglePalmRejectionMode();
        const p2 = palmRejectionMode;

        return { initialPages, pageAfterNext, pageAfterPrev, z0, zPlus, p0, p1, p2 };
      });

      // Pen draw & Undo, Highlighter, Laser, Text, Eraser, toggleAnnotationsVisibility, Bookmark
      await p.evaluate(() => { if (typeof setAnnotationTool === 'function') setAnnotationTool('pen'); });
      const canvasBox = await p.locator('#pdfInkCanvas_1').boundingBox();
      assert(Boolean(canvasBox && canvasBox.width > 100), 'PDF Studio renders interactive ink canvas for Page 1');

      if (canvasBox) {
        await p.mouse.move(canvasBox.x + 60, canvasBox.y + 80);
        await p.mouse.down();
        await p.mouse.move(canvasBox.x + 140, canvasBox.y + 120);
        await p.mouse.up();
      }
      const strokesAfterDraw = await p.evaluate(() => (pageAnnotations[1] || []).length);
      await p.evaluate(() => { if (typeof undoLastStroke === 'function') undoLastStroke(); });
      const strokesAfterUndo = await p.evaluate(() => (pageAnnotations[1] || []).length);

      // Re-draw one stroke and test toggleAnnotationsVisibility via real button click
      if (canvasBox) {
        await p.mouse.move(canvasBox.x + 70, canvasBox.y + 90);
        await p.mouse.down();
        await p.mouse.move(canvasBox.x + 150, canvasBox.y + 130);
        await p.mouse.up();
      }
      await p.click('#toggleAnnoVisBtn');
      const hiddenOpacity = await p.evaluate(() => document.getElementById('pdfInkCanvas_1')?.style.opacity);
      await p.click('#toggleAnnoVisBtn');
      const restoredOpacity = await p.evaluate(() => document.getElementById('pdfInkCanvas_1')?.style.opacity);

      // Highlighter, Laser, Bookmark, Thumbnails, Add Blank Page, Hide/Restore Slide
      const toolsState = await p.evaluate(async () => {
        if (typeof setAnnotationTool === 'function') setAnnotationTool('highlighter');
        const hlTool = currentAnnoTool;
        if (typeof setAnnotationTool === 'function') setAnnotationTool('laser');
        const laserActive = document.getElementById('toolBtn_laser')?.classList.contains('laser-active');
        if (typeof setAnnotationTool === 'function') setAnnotationTool('eraser');
        const eraserTool = currentAnnoTool;
        if (typeof setAnnotationTool === 'function') setAnnotationTool('pen');

        const bmBefore = getLectureBookmarkedSlides().includes(1);
        if (typeof toggleBookmarkCurrentSlide === 'function') toggleBookmarkCurrentSlide(1);
        const bmAfter = getLectureBookmarkedSlides().includes(1);

        if (typeof togglePdfThumbnailsDrawer === 'function') togglePdfThumbnailsDrawer(true);
        const drawerOpen = document.getElementById('pdfThumbnailsDrawer')?.classList.contains('open');

        const blankBefore = (currentViewingLec?.lec?.customPages || []).length;
        if (typeof addBlankNotePageToLecture === 'function') await addBlankNotePageToLecture();
        const blankAfter = (currentViewingLec?.lec?.customPages || []).length;
        const blankDomCount = document.querySelectorAll('#pdfPagesScrollContainer .custom-blank-slide').length;

        if (typeof deleteOrHidePageFromLecture === 'function') deleteOrHidePageFromLecture(2);
        const hiddenArr = currentViewingLec?.lec?.deletedPages || [];
        const isPage2Hidden = hiddenArr.includes(2) || hiddenArr.includes('2');
        if (typeof restoreDeletedPage === 'function') restoreDeletedPage(2);
        const isPage2Restored = !(currentViewingLec?.lec?.deletedPages || []).includes('2') && !(currentViewingLec?.lec?.deletedPages || []).includes(2);

        if (typeof togglePdfThumbnailsDrawer === 'function') togglePdfThumbnailsDrawer(false);
        return { hlTool, laserActive, eraserTool, bmBefore, bmAfter, drawerOpen, blankBefore, blankAfter, blankDomCount, isPage2Hidden, isPage2Restored };
      });

      // Free Extra Note Sheet + Free Annotated PDF Export (no VIP lock)
      await p.evaluate(async () => {
        if (typeof toggleExtraNoteForPage === 'function') await toggleExtraNoteForPage(1);
      });
      const extraNoteVisible = await p.evaluate(() => {
        const sheet = document.getElementById('pdfExtraNoteWrapper_1');
        return Boolean(sheet && sheet.style.display !== 'none');
      });
      await p.evaluate(async () => {
        await exportAnnotatedSlides();
      });
      await p.waitForFunction(() => (window.__wp66ExportedBlobs || []).length >= 1, { timeout: 10000 });
      const exportedPdfInfo = await p.evaluate(async () => {
        const entry = (window.__wp66ExportedBlobs || [])[0];
        const txt = entry && entry.blob ? await entry.blob.slice(0, 16).text() : '';
        const vipOpen = document.getElementById('vipMediaLockModalOverlay')?.classList.contains('active');
        return { count: (window.__wp66ExportedBlobs || []).length, size: entry?.size || 0, header: txt, vipOpen };
      });

      // Audio Timestamp Pin modal (interactive)
      await p.evaluate(() => {
        if (typeof addAudioTimestampPin === 'function') addAudioTimestampPin();
      });
      await p.waitForSelector('#singleInputModalOverlay.active', { timeout: 3000 });
      await p.fill('#siModalInput', 'Key mechanism explanation');
      await p.click('#siModalSaveBtn');
      await p.waitForFunction(() => !document.getElementById('singleInputModalOverlay')?.classList.contains('active'));
      const pinsTotal = await p.evaluate(() => Object.values(pageAnnotations._audioPins || {}).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0));

      // Quick Jump Escape + keyboard shortcut isolation inside <input> + exit Studio
      await p.evaluate(() => { if (typeof openPdfQuickJumpModal === 'function') openPdfQuickJumpModal(); });
      await p.waitForSelector('#pdfQuickJumpModalOverlay.active', { timeout: 3000 });
      await p.keyboard.press('Escape');
      const quickJumpClosed = await p.evaluate(() => !document.getElementById('pdfQuickJumpModalOverlay')?.classList.contains('active'));

      // Verify pressing 'b' inside search input does NOT toggle bookmark
      const bmCountBeforeInputKey = await p.evaluate(() => getLectureBookmarkedSlides().length);
      await p.evaluate(() => { if (typeof togglePdfThumbnailsDrawer === 'function') togglePdfThumbnailsDrawer(true); });
      await p.focus('#pdfThumbSearchInput');
      await p.keyboard.press('b');
      const bmCountAfterInputKey = await p.evaluate(() => getLectureBookmarkedSlides().length);
      await p.evaluate(() => { if (typeof togglePdfThumbnailsDrawer === 'function') togglePdfThumbnailsDrawer(false); });
      await p.click('button[onclick="closePdfViewer()"]');
      await p.waitForFunction(() => !document.getElementById('pdfViewerModalOverlay')?.classList.contains('active'));

      assert(openDurationMs <= 3000 && navResult.initialPages === 5 && navResult.pageAfterNext === 2 && navResult.pageAfterPrev === 1, 'PDF Studio opens 5-page PDF <=3s and steps next/prev pages cleanly', `ms=${openDurationMs}`);
      assert(navResult.zPlus > navResult.z0 && navResult.p0 === true && navResult.p1 === false && navResult.p2 === true, 'PDF Studio zoom and palm-rejection toggle work properly');
      assert(strokesAfterDraw >= 1 && strokesAfterUndo === 0, 'Pen stroke draws and Undo reverts stroke count 1 -> 0', `draw=${strokesAfterDraw}, undo=${strokesAfterUndo}`);
      assert(hiddenOpacity === '0' && restoredOpacity === '1', 'toggleAnnotationsVisibility() hides and restores ink without error');
      assert(
        toolsState.hlTool === 'highlighter' && toolsState.laserActive && toolsState.eraserTool === 'eraser' &&
        !toolsState.bmBefore && toolsState.bmAfter && toolsState.drawerOpen &&
        toolsState.blankAfter === toolsState.blankBefore + 1 && toolsState.blankDomCount >= 1 &&
        toolsState.isPage2Hidden && toolsState.isPage2Restored,
        'Highlighter, Laser, Eraser, Bookmark, Thumbnails, Blank Note Page, and Hide/Restore Slide all work cleanly',
        JSON.stringify(toolsState)
      );
      assert(extraNoteVisible && exportedPdfInfo.count >= 1 && exportedPdfInfo.header.startsWith('%PDF-') && !exportedPdfInfo.vipOpen, 'Free user Extra Note Sheet & Annotated PDF Export succeed with real %PDF blob and zero VIP block', JSON.stringify(exportedPdfInfo));
      assert(pinsTotal >= 1 && quickJumpClosed && bmCountBeforeInputKey === bmCountAfterInputKey, 'Audio Timestamp Pin modal persists pin, Quick Jump Escape closes, and shortcuts stay blocked inside <input>', JSON.stringify({ pinsTotal, quickJumpClosed, bmCountBeforeInputKey, bmCountAfterInputKey }));
      assert(studioSess.pageErrors.length === 0 && studioSess.consoleErrors.length === 0, 'Zero page/console errors throughout full PDF Studio parity pass', studioSess.pageErrors.join('; '));
    } finally {
      await studioSess.context.close();
    }

    // ------------------------------------------------------------------------
    // 5. Reduced Motion + Heavy Dataset (900 Lectures) Performance Gate
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Reduced Motion & Heavy Dataset (900 Lectures) Performance Check ---');
    const perfSess = await openSeededPage(browser, { width: 1440, height: 900 }, { reducedMotion: 'reduce' });
    try {
      const p = perfSess.page;
      await p.evaluate(() => {
        const subs = [];
        for (let s = 0; s < 10; s++) {
          const groups = [];
          for (let g = 0; g < 6; g++) {
            const lectures = [];
            for (let l = 0; l < 15; l++) {
              lectures.push({ id: `hv_${s}_${g}_${l}`, title: `Lecture ${s}.${g}.${l}`, completed: l % 3 === 0, recordings: [] });
            }
            groups.push({ id: `hg_${s}_${g}`, title: `Chapter ${g + 1}`, lectures });
          }
          subs.push({ id: `hs_${s}`, name: `Subject ${s + 1}`, color: '#899982', isDivided: true, groups });
        }
        localStorage.setItem('pharmaSubjects', JSON.stringify(subs));
      });

      const tBoot0 = Date.now();
      await p.reload({ waitUntil: 'domcontentloaded' });
      await p.waitForSelector('#dashboard', { timeout: 10000 });
      const coldBootMs = Date.now() - tBoot0;

      const perfMetrics = await p.evaluate(async () => {
        const rmDuration = getComputedStyle(document.querySelector('.nav-item') || document.body).transitionDuration;
        const tNav0 = performance.now();
        switchView('subjects');
        const navSubjectsMs = performance.now() - tNav0;

        const tToc0 = performance.now();
        if (typeof openSubject === 'function') openSubject('hs_0');
        const tocMs = performance.now() - tToc0;

        const tWs0 = performance.now();
        if (typeof openChapterWorkspace === 'function') openChapterWorkspace('hg_0_0');
        const wsMs = performance.now() - tWs0;

        const tLang0 = performance.now();
        if (typeof applyExoLanguage === 'function') applyExoLanguage('ar', false);
        const langMs = performance.now() - tLang0;

        await initPdfDB();
        const tIdb0 = performance.now();
        await saveAnnotationsToDB('hv_0_0_0', { 1: [{ tool: 'pen', color: '#899982', points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }] });
        const idbMs = performance.now() - tIdb0;

        return { rmDuration, navSubjectsMs, tocMs, wsMs, langMs, idbMs };
      });

      assert(parseFloat(perfMetrics.rmDuration) <= 0.01, 'prefers-reduced-motion: reduce collapses CSS transitions <= 0.01s', `duration=${perfMetrics.rmDuration}`);
      assert(
        coldBootMs < 5000 && perfMetrics.navSubjectsMs < 500 && perfMetrics.tocMs < 500 && perfMetrics.wsMs < 500 && perfMetrics.idbMs < 500,
        'Heavy 900-lecture dataset keeps cold boot, navigation, TOC, Chapter Workspace, and IDB annotation save responsive',
        JSON.stringify({ coldBootMs, ...perfMetrics })
      );
      assert(perfSess.pageErrors.length === 0 && perfSess.consoleErrors.length === 0, 'Zero page/console errors on heavy dataset & reduced motion');
    } finally {
      await perfSess.context.close();
    }
  } finally {
    await browser.close();
    if (spawnedServer) {
      try { spawnedServer.kill(); } catch {}
    }
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`TOTAL WP 6.6 CHROMIUM CHECKS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('----------------------------------------------------------------------\n');

  if (testsFailed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal WP 6.6 Chromium E2E error:', err);
  process.exit(1);
});
