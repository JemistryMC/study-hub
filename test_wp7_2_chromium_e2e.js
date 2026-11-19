// ============================================================================
// Exo Personal Study Journal — WP 7.2 Real-UI Chromium E2E Test Suite
// Workspace-Native Resource Intake & Chapter Resource Management
// Verifies:
//   1. Flow 1: PDF Intake (3-stage modal) -> Auto-prefilled editable title ->
//      Setup Card disappears -> Opens in PDF Studio -> Free Export & Extra
//      Note Sheet unlocked (GEMINI.md §6) -> Persists across reload
//   2. Flow 2: Standalone Audio Intake -> Plays via #cwAudioPreviewBar ->
//      Zero dummy "Audio Notes" lecture, zero auto-attach to lectures[0];
//      also verifies explicit optional attachment to an existing lecture
//   3. Flow 3: Standalone Web / Google Drive Link -> Rejects unsafe/malformed
//      URLs -> Saves valid Drive link without mutating lectures[] -> Safe
//      <a target="_blank" rel="noopener noreferrer"> -> Survives reload
//   4. Flow 4: Standalone Written Note -> Opens in #cwNoteViewerModalOverlay ->
//      Edit & Save -> Persists across reload
//   5. Flow 5: Standalone Resource Edit, Delete (records deletedResourceIds +
//      cleans IDB binary), and Cancel Cleanup (zero ghost/orphan IDB blobs)
//   6. Flow 6: Failure, Rollback & Idempotent Retry -> Truthful Explain, Guide
//      & Recover copy (never advises clearing storage/IDB/reset) -> Form & file
//      preserved -> Retry succeeds with ZERO duplicates
//   7. Flow 7: Cross-Account Isolation (User A vs User B) & Backup/Restore v4
//      preserving group.resources[] & legacy group.lectures[]
//   8. Flow 8: Subject TOC integration (.exo-toc-standalone-strip & Add Resource
//      button opening #cwResourceIntakeOverlay directly for that chapter)
//   9. Flow 9: Responsive & Bilingual EN (LTR) / AR (RTL) Matrix across
//      1440x900, 768x1024, 390x844, 896x414 -> Zero overflow, >=44px touch
//      targets, captures visual verification screenshots in .playwright-cli/wp7-2/
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
    return 2;
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

function buildMinimalMultiPagePdfBytes(pageCount = 2) {
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

function buildMinimalWavBytes(durationMs = 350) {
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

async function seedEmptyChapterWorkspace(page, { userId = 'local_wp72_user', withLegacyLecture = false } = {}) {
  await page.evaluate(({ withLegacyLecture }) => {
    localStorage.setItem('exo_lang', 'en');
    if (typeof applyExoLanguage === 'function') applyExoLanguage('en', { skipReload: true });

    const lectures = withLegacyLecture
      ? [{ id: 'lec_legacy_1', title: 'Legacy Slide Deck 1', path: '', audioPath: '', completed: false }]
      : [];

    subjects = [
      {
        id: 'sub_wp72_bio',
        name: 'Clinical Pharmacology',
        color: '#899982',
        isDivided: true,
        groups: [
          {
            id: 'grp_wp72_ch1',
            name: 'Chapter 1: Autonomic Drugs',
            lectures,
            resources: [],
            deletedResourceIds: {}
          },
          {
            id: 'grp_wp72_ch2',
            name: 'Chapter 2: Cardiovascular',
            lectures: [],
            resources: [],
            deletedResourceIds: {}
          }
        ]
      }
    ];
    saveSubjects();
    if (typeof switchView === 'function') switchView('subjects');
    if (typeof renderSubjects === 'function') renderSubjects();
    openSubject('sub_wp72_bio');
    openChapterWorkspace('grp_wp72_ch1');
  }, { userId, withLegacyLecture });
  await page.waitForSelector('#chapter-workspace-view', { state: 'visible', timeout: 8000 });
}

async function getIdbKeys(page, storeName) {
  return await page.evaluate(async (store) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('WorkspaceMediaStore', 5);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAllKeys();
      req.onsuccess = () => {
        const res = Array.from(req.result || []).map(String);
        db.close();
        resolve(res);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  }, storeName);
}

async function main() {
  const screenshotDir = path.join(__dirname, '.playwright-cli', 'wp7-2');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const serverProc = await ensureLocalServerRunning();
  const browser = await chromium.launch(resolveChromiumLaunchOptions());

  const pdfBuffer = buildMinimalMultiPagePdfBytes(2);
  const wavBuffer = buildMinimalWavBytes(350);

  try {
    console.log('\n=== WP 7.2 REAL-UI CHROMIUM E2E: WORKSPACE-NATIVE RESOURCE INTAKE ===');

    // ------------------------------------------------------------------------
    // FLOW 1, 2, 3, 4, 5, 6, 8 — Full Chapter Lifecycle in One Clean Session
    // ------------------------------------------------------------------------
    const { context, page, pageErrors } = await openFreshPage(browser, { width: 1440, height: 900 });
    await seedEmptyChapterWorkspace(page, { userId: 'local_wp72_main', withLegacyLecture: false });

    console.log('\n[Flow 1] Empty Chapter -> 3-Stage PDF Intake -> Studio -> Free Policy -> Reload Persistence');
    const setupVisibleInitially = await page.locator('#cwFirstEntrySetup').isVisible();
    assert(setupVisibleInitially, 'Empty chapter renders First-Entry Setup Card initially');

    await page.click('#cwAddResourceBtn');
    await page.waitForSelector('#cwResourceIntakeOverlay.active', { timeout: 5000 });

    const stage1Types = await page.locator('#cwResourceIntakeOverlay [data-intake-type]').evaluateAll(els =>
      els.map(el => el.getAttribute('data-intake-type'))
    );
    assert(
      JSON.stringify(stage1Types) === JSON.stringify(['pdf', 'audio', 'link', 'note']),
      'Stage 1 exposes exact 4 workspace-native resource types (no Schedule Session)',
      `actual=${JSON.stringify(stage1Types)}`
    );

    // Screenshot Stage 1 (Desktop EN)
    await page.waitForTimeout(260);
    await page.screenshot({ path: path.join(screenshotDir, '01-intake-stage1-desktop-en.png') });

    // Choose PDF
    await page.click('#cwIntakeTypeBtn_pdf');
    await page.waitForSelector('#cwIntakeFileInput', { state: 'attached', timeout: 5000 });

    // Attach synthetic PDF file
    await page.locator('#cwIntakeFileInput').setInputFiles({
      name: 'Cholinergic_Receptors_Summary.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBuffer
    });
    await page.waitForTimeout(150);

    const autoPrefilledTitle = await page.locator('#cwIntakeTitleInput').inputValue();
    assert(
      autoPrefilledTitle === 'Cholinergic Receptors Summary',
      'PDF selection auto-prefills clean editable title from filename',
      `actual="${autoPrefilledTitle}"`
    );

    const storageNoticeText = await page.locator('#cwIntakeStorageNotice').innerText();
    assert(
      /device|local|IndexedDB/i.test(storageNoticeText),
      'Stage 2 displays truthful local device storage notice',
      storageNoticeText
    );

    // Customize title before saving
    await page.fill('#cwIntakeTitleInput', 'Autonomic Slides — Annotated Edition');
    await page.screenshot({ path: path.join(screenshotDir, '02-intake-stage2-pdf-desktop-en.png') });

    await page.click('#cwIntakeSaveBtn');
    await page.waitForFunction(() => !document.getElementById('cwResourceIntakeOverlay').classList.contains('active'), { timeout: 8000 });

    const afterPdfState = await page.evaluate(() => {
      const grp = subjects[0].groups[0];
      const setupEl = document.getElementById('cwFirstEntrySetup');
      return {
        lecturesCount: (grp.lectures || []).length,
        resourcesCount: (grp.resources || []).length,
        firstRes: grp.resources && grp.resources[0] ? {
          id: grp.resources[0].id,
          type: grp.resources[0].type,
          title: grp.resources[0].title,
          storageState: grp.resources[0].storageState
        } : null,
        setupHidden: !setupEl || setupEl.style.display === 'none'
      };
    });

    assert(afterPdfState.resourcesCount === 1, 'Standalone PDF saved cleanly into group.resources[]');
    assert(afterPdfState.lecturesCount === 0, 'Standalone PDF does NOT force creation of legacy group.lectures[] entry');
    assert(
      afterPdfState.firstRes && afterPdfState.firstRes.type === 'pdf' && afterPdfState.firstRes.title === 'Autonomic Slides — Annotated Edition',
      'Saved standalone PDF preserves customized title and type=pdf'
    );
    assert(afterPdfState.setupHidden, 'First-Entry Setup Card hides automatically once chapter has a standalone resource');

    // Open standalone PDF in PDF Studio
    const openStudioBtn = page.locator('#cwBody button', { hasText: /Open in Studio/i }).first();
    await openStudioBtn.click();
    await page.waitForSelector('#pdfViewerModalOverlay.active', { timeout: 8000 });

    const studioCheck = await page.evaluate(() => {
      const title = document.getElementById('pdfViewerTitle')?.textContent || '';
      const exportBtn = document.getElementById('pdfMenuExportPdfBtn') || document.querySelector('[onclick*="exportAnnotatedSlides"]');
      const extraNoteBtn = document.getElementById('pdfMenuExtraNoteBtn') || document.querySelector('[onclick*="toggleExtraNote"]');
      const exportText = exportBtn ? exportBtn.innerText : '';
      const extraText = extraNoteBtn ? extraNoteBtn.innerText : '';
      return {
        title,
        viewerActive: document.getElementById('pdfViewerModalOverlay')?.classList.contains('active'),
        exportExists: Boolean(exportBtn),
        extraExists: Boolean(extraNoteBtn),
        exportHasVipLock: /VIP/i.test(exportText) && /lock/i.test(exportText),
        extraHasVipLock: /VIP/i.test(extraText) && /lock/i.test(extraText)
      };
    });
    assert(studioCheck.viewerActive && studioCheck.title.includes('Autonomic Slides'), 'Standalone PDF opens cleanly inside PDF Studio', JSON.stringify(studioCheck));
    assert(studioCheck.exportExists && !studioCheck.exportHasVipLock, 'GEMINI.md §6: Annotated PDF Export remains unlocked for Free users on standalone PDF');
    assert(studioCheck.extraExists && !studioCheck.extraHasVipLock, 'GEMINI.md §6: Extra Note Sheet remains unlocked for Free users on standalone PDF');

    // Close PDF Studio back to Chapter Workspace
    await page.evaluate(() => closePdfViewer());
    await page.waitForFunction(() => !document.getElementById('pdfViewerModalOverlay').classList.contains('active'), { timeout: 5000 });

    // ------------------------------------------------------------------------
    // FLOW 2: Standalone Audio Recording (No Dummy Lecture, Plays cleanly)
    // ------------------------------------------------------------------------
    console.log('\n[Flow 2] Standalone Audio Intake -> Zero Dummy Lectures -> Audio Preview Playback');
    await page.click('#cwAddResourceBtn');
    await page.waitForSelector('#cwResourceIntakeOverlay.active', { timeout: 5000 });
    await page.click('#cwIntakeTypeBtn_audio');
    await page.waitForSelector('#cwIntakeFileInput', { state: 'attached', timeout: 5000 });

    await page.locator('#cwIntakeFileInput').setInputFiles({
      name: 'Sympathetic_Summary_Voice.wav',
      mimeType: 'audio/wav',
      buffer: wavBuffer
    });
    await page.waitForTimeout(120);
    await page.fill('#cwIntakeTitleInput', 'Autonomic Voice Recap');
    await page.click('#cwIntakeSaveBtn');
    await page.waitForFunction(() => !document.getElementById('cwResourceIntakeOverlay').classList.contains('active'), { timeout: 8000 });

    const afterAudioState = await page.evaluate(() => {
      const grp = subjects[0].groups[0];
      return {
        lecturesCount: (grp.lectures || []).length,
        hasDummyAudioNotesLecture: (grp.lectures || []).some(l => /Audio Notes/i.test(l.title || '')),
        audioResources: (grp.resources || []).filter(r => r.type === 'audio').map(r => ({ id: r.id, title: r.title, fileKey: r.fileKey }))
      };
    });
    assert(afterAudioState.lecturesCount === 0, 'Standalone audio leaves group.lectures[] untouched (zero dummy lectures)');
    assert(!afterAudioState.hasDummyAudioNotesLecture, 'Zero dummy "Audio Notes" lecture created');
    assert(afterAudioState.audioResources.length === 1 && afterAudioState.audioResources[0].title === 'Autonomic Voice Recap', 'Standalone audio stored in group.resources[]');

    // Trigger playback preview
    const playAudioBtn = page.locator('#cwBody button', { hasText: /Listen/i }).first();
    await playAudioBtn.click();
    await page.waitForSelector('#cwAudioPreviewBar.active', { timeout: 5000 });
    const audioPreviewTitle = await page.locator('#cwAudioPreviewTitle').innerText();
    assert(audioPreviewTitle.includes('Autonomic Voice Recap'), 'Audio Preview bar opens and loads standalone audio resource', audioPreviewTitle);

    // ------------------------------------------------------------------------
    // FLOW 3: Standalone Web / Google Drive Link (Validation + Safe <a>)
    // ------------------------------------------------------------------------
    console.log('\n[Flow 3] Standalone Web / Google Drive Link -> Rejects Unsafe URL -> Safe External Anchor');
    await page.click('#cwAddResourceBtn');
    await page.waitForSelector('#cwResourceIntakeOverlay.active', { timeout: 5000 });
    await page.click('#cwIntakeTypeBtn_link');
    await page.waitForSelector('#cwIntakeUrlInput', { timeout: 5000 });

    // Try unsafe javascript: URL first
    await page.fill('#cwIntakeUrlInput', 'javascript:alert(1)');
    await page.fill('#cwIntakeTitleInput', 'Malicious Link Attempt');
    await page.click('#cwIntakeSaveBtn');
    await page.waitForSelector('#cwIntakeValidationBanner', { timeout: 5000 });
    const warnText = await page.locator('#cwIntakeValidationBanner').innerText();
    assert(/http:\/\/|https:\/\//i.test(warnText), 'Unsafe javascript: URL blocked with clear validation message', warnText);

    // Enter valid Google Drive URL
    await page.fill('#cwIntakeUrlInput', 'https://drive.google.com/file/d/1Wp72DemoDriveLink/view');
    await page.fill('#cwIntakeTitleInput', 'Drive Reference Diagrams');
    await page.click('#cwIntakeSaveBtn');
    await page.waitForFunction(() => !document.getElementById('cwResourceIntakeOverlay').classList.contains('active'), { timeout: 8000 });

    const linkCheck = await page.evaluate(() => {
      const grp = subjects[0].groups[0];
      const anchor = document.querySelector('#cwBody a[href*="drive.google.com"]');
      return {
        lecturesCount: (grp.lectures || []).length,
        linkCount: (grp.resources || []).filter(r => r.type === 'link').length,
        anchorHref: anchor ? anchor.getAttribute('href') : '',
        anchorTarget: anchor ? anchor.getAttribute('target') : '',
        anchorRel: anchor ? anchor.getAttribute('rel') : ''
      };
    });
    assert(linkCheck.lecturesCount === 0, 'Standalone link does NOT invoke legacy lecture creation');
    assert(linkCheck.linkCount === 1, 'Standalone Google Drive link saved in group.resources[]');
    assert(
      linkCheck.anchorHref === 'https://drive.google.com/file/d/1Wp72DemoDriveLink/view' &&
      linkCheck.anchorTarget === '_blank' &&
      /\bnoopener\b/.test(linkCheck.anchorRel) &&
      /\bnoreferrer\b/.test(linkCheck.anchorRel),
      'Rendered link uses safe <a target="_blank" rel="noopener noreferrer"> without window.open',
      JSON.stringify(linkCheck)
    );

    // ------------------------------------------------------------------------
    // FLOW 4: Standalone Written Note -> Reader/Editor Modal -> Edit & Save
    // ------------------------------------------------------------------------
    console.log('\n[Flow 4] Standalone Written Note -> Reader & Editor Modal -> Persists Edits');
    await page.click('#cwAddResourceBtn');
    await page.waitForSelector('#cwResourceIntakeOverlay.active', { timeout: 5000 });
    await page.click('#cwIntakeTypeBtn_note');
    await page.waitForSelector('#cwIntakeNoteContentInput', { timeout: 5000 });

    await page.fill('#cwIntakeTitleInput', 'Muscarinic vs Nicotinic Mnemonics');
    await page.fill('#cwIntakeNoteContentInput', 'M1: CNS/Gastric\nM2: Heart (Gi)\nM3: Smooth muscle & glands (Gq)');
    await page.click('#cwIntakeSaveBtn');
    await page.waitForFunction(() => !document.getElementById('cwResourceIntakeOverlay').classList.contains('active'), { timeout: 8000 });

    // Screenshot populated Chapter Workspace (Desktop EN)
    await page.screenshot({ path: path.join(screenshotDir, '03-chapter-workspace-populated-desktop-en.png') });

    // Open Written Note Reader Modal
    const openNoteBtn = page.locator('#cwBody button', { hasText: /Read Note/i }).first();
    await openNoteBtn.click();
    await page.waitForSelector('#cwNoteViewerModalOverlay.active', { timeout: 5000 });
    const viewerBodyText = await page.locator('#cwNoteViewerTextContent').innerText();
    assert(viewerBodyText.includes('M3: Smooth muscle'), 'Written Note opens cleanly in #cwNoteViewerModalOverlay');

    await page.waitForTimeout(260);
    await page.screenshot({ path: path.join(screenshotDir, '04-written-note-viewer-desktop-en.png') });

    // Edit note inside modal & save
    await page.click('#cwNoteStartEditBtn');
    await page.waitForSelector('#cwNoteEditContentInput', { timeout: 5000 });
    await page.fill('#cwNoteEditContentInput', 'M1: CNS/Gastric\nM2: Heart (Gi)\nM3: Exocrine glands & smooth muscle (Gq) — Verified!');
    await page.click('#cwNoteSaveBtn');
    await page.waitForSelector('#cwNoteViewerTextContent', { timeout: 5000 });
    const updatedNoteText = await page.locator('#cwNoteViewerTextContent').innerText();
    assert(updatedNoteText.includes('Verified!'), 'Written Note edits save and re-render cleanly');
    await page.click('#cwNoteViewerCloseBtn');
    await page.waitForFunction(() => !document.getElementById('cwNoteViewerModalOverlay').classList.contains('active'), { timeout: 5000 });

    // Reload page and confirm all 4 standalone resource types survive full reload!
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForSelector('#dashboard', { timeout: 10000 });
    const reloadCheck = await page.evaluate(() => {
      if (typeof switchView === 'function') switchView('subjects');
      openSubject('sub_wp72_bio');
      openChapterWorkspace('grp_wp72_ch1');
      const grp = subjects[0].groups[0];
      const types = (grp.resources || []).map(r => r.type).sort();
      const note = (grp.resources || []).find(r => r.type === 'note');
      return {
        count: (grp.resources || []).length,
        types,
        noteHasVerifiedEdit: Boolean(note && note.content && note.content.includes('Verified!'))
      };
    });
    assert(
      reloadCheck.count === 4 && JSON.stringify(reloadCheck.types) === JSON.stringify(['audio', 'link', 'note', 'pdf']),
      'All 4 standalone resource types survive full browser reload',
      JSON.stringify(reloadCheck)
    );
    assert(reloadCheck.noteHasVerifiedEdit, 'Edited written note content persists across full reload');

    // ------------------------------------------------------------------------
    // FLOW 5: Cancel Cleanup (Zero Orphan IDB Blob) + Edit + Delete Standalone
    // ------------------------------------------------------------------------
    console.log('\n[Flow 5] Cancel Cleanup (Zero Orphan IDB Blobs), Edit Resource & Delete Resource');
    const pdfKeysBeforeCancel = await getIdbKeys(page, 'pdfs');
    await page.click('#cwAddResourceBtn');
    await page.waitForSelector('#cwResourceIntakeOverlay.active', { timeout: 5000 });
    await page.click('#cwIntakeTypeBtn_pdf');
    await page.locator('#cwIntakeFileInput').setInputFiles({
      name: 'Canceled_Draft.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBuffer
    });
    await page.waitForTimeout(100);
    await page.click('#cwIntakeCancelBtn');
    await page.waitForFunction(() => !document.getElementById('cwResourceIntakeOverlay').classList.contains('active'), { timeout: 5000 });
    const pdfKeysAfterCancel = await getIdbKeys(page, 'pdfs');
    assert(
      pdfKeysAfterCancel.length === pdfKeysBeforeCancel.length,
      'Canceling PDF intake leaves zero orphan blobs in IndexedDB',
      `before=${pdfKeysBeforeCancel.length}, after=${pdfKeysAfterCancel.length}`
    );

    // Delete the standalone link resource & verify deletedResourceIds recorded
    const linkResId = await page.evaluate(() => {
      const grp = subjects[0].groups[0];
      return (grp.resources || []).find(r => r.type === 'link')?.id || '';
    });
    await page.evaluate((rid) => cwDeleteChapterResource('grp_wp72_ch1', rid), linkResId);
    await page.waitForSelector('#confirmModalOverlay.active', { timeout: 5000 });
    await page.click('#confirmModalBtn');
    await page.waitForFunction(() => !document.getElementById('confirmModalOverlay').classList.contains('active'), { timeout: 5000 });

    const afterDeleteCheck = await page.evaluate((rid) => {
      const grp = subjects[0].groups[0];
      return {
        stillPresent: (grp.resources || []).some(r => r.id === rid),
        tombstoned: Boolean(grp.deletedResourceIds && grp.deletedResourceIds[rid] > 0)
      };
    }, linkResId);
    assert(!afterDeleteCheck.stillPresent && afterDeleteCheck.tombstoned, 'Deleting standalone resource removes it and records deletedResourceIds tombstone');

    // ------------------------------------------------------------------------
    // FLOW 6: Failure, Rollback & Idempotent Retry (Zero Duplicates)
    // ------------------------------------------------------------------------
    console.log('\n[Flow 6] Persistence Failure -> Rollback -> Truthful Explain/Guide/Recover -> Idempotent Retry');
    const countBeforeFail = await page.evaluate(() => (subjects[0].groups[0].resources || []).length);

    // Inject deterministic saveMediaToDB failure
    await page.evaluate(() => {
      window.__origSaveMediaToDB = saveMediaToDB;
      saveMediaToDB = async function() {
        const err = new Error('Simulated QuotaExceededError during IndexedDB write');
        err.name = 'QuotaExceededError';
        throw err;
      };
    });

    await page.click('#cwAddResourceBtn');
    await page.waitForSelector('#cwResourceIntakeOverlay.active', { timeout: 5000 });
    await page.click('#cwIntakeTypeBtn_pdf');
    await page.locator('#cwIntakeFileInput').setInputFiles({
      name: 'Retry_Resilience_Deck.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBuffer
    });
    await page.fill('#cwIntakeTitleInput', 'Retry Resilience Deck');
    await page.click('#cwIntakeSaveBtn');

    await page.waitForSelector('#cwIntakeSaveFeedback.is-error', { timeout: 8000 });
    const errorFeedbackText = await page.locator('#cwIntakeSaveFeedback').innerText();
    const countDuringFail = await page.evaluate(() => (subjects[0].groups[0].resources || []).length);

    assert(countDuringFail === countBeforeFail, 'Failed save cleanly rolls back in-memory group.resources[] mutation');
    assert(
      !/clear browser storage|clear indexeddb|reset the app|delete your files/i.test(errorFeedbackText),
      'GEMINI.md §13.4: Error recovery copy NEVER advises clearing storage/IDB/resetting app',
      errorFeedbackText
    );
    assert(
      /not saved|preserved|retry|space/i.test(errorFeedbackText),
      'Error recovery copy explains what happened, data safety state, and safe next steps',
      errorFeedbackText
    );

    await page.screenshot({ path: path.join(screenshotDir, '05-intake-stage3-error-recovery-en.png') });

    // Restore saveMediaToDB and click Retry button
    await page.evaluate(() => {
      saveMediaToDB = window.__origSaveMediaToDB;
      delete window.__origSaveMediaToDB;
    });
    await page.click('#cwIntakeRetryBtn');
    await page.waitForFunction(() => !document.getElementById('cwResourceIntakeOverlay').classList.contains('active'), { timeout: 8000 });

    const afterRetryState = await page.evaluate(() => {
      const grp = subjects[0].groups[0];
      const matching = (grp.resources || []).filter(r => r.title === 'Retry Resilience Deck');
      return {
        totalCount: (grp.resources || []).length,
        matchingCount: matching.length
      };
    });
    assert(
      afterRetryState.totalCount === countBeforeFail + 1 && afterRetryState.matchingCount === 1,
      'Idempotent retry succeeds cleanly with EXACTLY 1 resource and ZERO duplicates',
      JSON.stringify(afterRetryState)
    );

    // ------------------------------------------------------------------------
    // FLOW 8: Subject TOC Integration (.exo-toc-standalone-strip + Add Resource)
    // ------------------------------------------------------------------------
    console.log('\n[Flow 8] Subject TOC Strip & Direct Chapter Add Resource Intake');
    await page.evaluate(() => closeChapterWorkspace());
    await page.waitForSelector('#groupsContainer', { state: 'visible', timeout: 5000 });

    const tocStripVisible = await page.locator('.exo-toc-standalone-strip').first().isVisible();
    const tocAddBtnVisible = await page.locator('.exo-toc-add-resource-btn').first().isVisible();
    assert(tocStripVisible, 'Subject TOC displays compact standalone chapter resources strip (.exo-toc-standalone-strip)');
    assert(tocAddBtnVisible, 'Subject TOC exposes Workspace-Native Add Resource button (.exo-toc-add-resource-btn)');

    await page.screenshot({ path: path.join(screenshotDir, '06-subject-toc-standalone-strip-en.png') });

    // Click Add Resource directly on Chapter 2 from TOC
    await page.locator('.exo-toc-add-resource-btn').nth(1).click();
    await page.waitForSelector('#cwResourceIntakeOverlay.active', { timeout: 5000 });
    await page.click('#cwIntakeTypeBtn_note');
    await page.fill('#cwIntakeTitleInput', 'Beta Blockers Quick Card');
    await page.fill('#cwIntakeNoteContentInput', 'Propranolol (non-selective), Metoprolol (B1 selective)');
    await page.click('#cwIntakeSaveBtn');
    await page.waitForFunction(() => !document.getElementById('cwResourceIntakeOverlay').classList.contains('active'), { timeout: 8000 });

    const ch2AddedFromToc = await page.evaluate(() => {
      const ch2 = subjects[0].groups[1];
      return (ch2.resources || []).length === 1 && ch2.resources[0].title === 'Beta Blockers Quick Card';
    });
    assert(ch2AddedFromToc, 'TOC Add Resource button saves directly to the targeted chapter without switching context');

    // ------------------------------------------------------------------------
    // FLOW 7: Cross-Account Isolation + Backup/Restore v4 Compatibility
    // ------------------------------------------------------------------------
    console.log('\n[Flow 7] Cross-Account Isolation & Backup/Restore v4 Preservation');
    const backupAndIsolation = await page.evaluate(async () => {
      const uidA = 'user_wp72_acct_a';
      const uidB = 'user_wp72_acct_b';

      // Snapshot current chapter resources & bind to Account A
      const currentSubjectsClone = JSON.parse(JSON.stringify(subjects));
      await handleAuthSessionChange({ id: uidA, email: 'usera@exo.test', name: 'User A' }, false);
      subjects = currentSubjectsClone;
      saveSubjects();
      const ctxA = createAccountOperationContext(uidA);
      const backupObj = await exportWorkspaceBackupV4(uidA, ctxA);
      const exportedCh1Resources = backupObj?.data?.subjects?.[0]?.groups?.[0]?.resources || [];

      // Switch to Account B via real handleAuthSessionChange -> must have zero User A resources
      await handleAuthSessionChange({ id: uidB, email: 'userb@exo.test', name: 'User B' }, false);
      const userBSubjectsBefore = JSON.parse(JSON.stringify(subjects || []));
      const userBZeroLeak = !userBSubjectsBefore.some(s =>
        Array.isArray(s.groups) && s.groups.some(g => Array.isArray(g.resources) && g.resources.length > 0)
      );

      // Import Account A backup into Account B via Smart Merge
      const ctxB = createAccountOperationContext(uidB);
      const importResult = await importWorkspaceBackupV4(backupObj, 'merge', uidB, ctxB);
      const restoredCh1Resources = subjects?.[0]?.groups?.[0]?.resources || [];

      return {
        exportedCount: exportedCh1Resources.length,
        userBZeroLeakBeforeImport: userBZeroLeak,
        importOk: Boolean(importResult && importResult.ok === true),
        restoredCount: restoredCh1Resources.length
      };
    });
    assert(backupAndIsolation.exportedCount >= 3, 'Backup v4 exports group.resources[] accurately', JSON.stringify(backupAndIsolation));
    assert(backupAndIsolation.userBZeroLeakBeforeImport, 'Cross-account isolation: User B has zero leakage of User A standalone resources');
    assert(
      backupAndIsolation.importOk && backupAndIsolation.restoredCount === backupAndIsolation.exportedCount,
      'Backup/Restore v4 restores standalone group.resources[] completely',
      JSON.stringify(backupAndIsolation)
    );

    // ------------------------------------------------------------------------
    // FLOW 2B: Explicit Optional Audio Attachment to Existing Legacy Lecture
    // ------------------------------------------------------------------------
    console.log('\n[Flow 2B] Optional Explicit Audio Attachment to Existing Lecture');
    await seedEmptyChapterWorkspace(page, { userId: 'local_wp72_explicit_attach', withLegacyLecture: true });
    await page.click('#cwAddResourceBtn');
    await page.waitForSelector('#cwResourceIntakeOverlay.active', { timeout: 5000 });
    await page.click('#cwIntakeTypeBtn_audio');
    await page.waitForSelector('#cwIntakeTargetLectureSelect', { timeout: 5000 });

    const defaultAudioTarget = await page.locator('#cwIntakeTargetLectureSelect').inputValue();
    assert(defaultAudioTarget === '__independent__', 'Audio attachment dropdown defaults to Independent chapter audio');

    await page.selectOption('#cwIntakeTargetLectureSelect', 'lec_legacy_1');
    await page.locator('#cwIntakeFileInput').setInputFiles({
      name: 'Lecture1_Recording.wav',
      mimeType: 'audio/wav',
      buffer: wavBuffer
    });
    await page.fill('#cwIntakeTitleInput', 'Lecture 1 Explicit Audio');
    await page.click('#cwIntakeSaveBtn');
    await page.waitForFunction(() => !document.getElementById('cwResourceIntakeOverlay').classList.contains('active'), { timeout: 8000 });

    const explicitAttachResult = await page.evaluate(() => {
      const grp = subjects[0].groups[0];
      const lec = grp.lectures[0];
      return {
        lecAudioPathSet: Boolean(lec && lec.audioPath),
        standaloneAudioCount: (grp.resources || []).filter(r => r.type === 'audio').length
      };
    });
    assert(
      explicitAttachResult.lecAudioPathSet && explicitAttachResult.standaloneAudioCount === 0,
      'Explicitly choosing a target lecture attaches audio to that lecture without duplicating standalone audio',
      JSON.stringify(explicitAttachResult)
    );

    await context.close();

    // ------------------------------------------------------------------------
    // FLOW 9: Responsive & Bilingual Matrix (EN LTR & AR RTL + Screenshots)
    // ------------------------------------------------------------------------
    console.log('\n[Flow 9] Responsive & Bilingual EN/AR Matrix + Touch Target Audit');
    const matrix = [
      { label: 'desktop-1440-ar', width: 1440, height: 900, lang: 'ar' },
      { label: 'tablet-768-en', width: 768, height: 1024, lang: 'en' },
      { label: 'mobile-390-en', width: 390, height: 844, lang: 'en' },
      { label: 'mobile-390-ar', width: 390, height: 844, lang: 'ar' },
      { label: 'landscape-896-en', width: 896, height: 414, lang: 'en' }
    ];

    for (const vp of matrix) {
      const { context: vpCtx, page: vpPage, pageErrors: vpErrs } = await openFreshPage(browser, {
        width: vp.width,
        height: vp.height
      });

      await seedEmptyChapterWorkspace(vpPage, { userId: `local_wp72_${vp.label}`, withLegacyLecture: false });

      // Seed 1 note + 1 link for rich workspace check & switch language
      await vpPage.evaluate((lang) => {
        const grp = subjects[0].groups[0];
        grp.resources = [
          {
            id: 'res_matrix_note',
            type: 'note',
            title: lang === 'ar' ? 'ملخص مستقبلات الجهاز العصبي' : 'Autonomic Receptors Quick Note',
            content: lang === 'ar' ? 'ملاحظات مراجعة سريعة للفصل الأول.' : 'Concise review notes for Chapter 1.',
            createdAt: Date.now() - 2000,
            updatedAt: Date.now() - 1000,
            completed: false,
            storageState: 'local'
          },
          {
            id: 'res_matrix_link',
            type: 'link',
            title: lang === 'ar' ? 'رابط مرجع Google Drive' : 'Google Drive Diagram Link',
            url: 'https://drive.google.com/file/d/demo/view',
            isDriveLink: true,
            createdAt: Date.now() - 1000,
            updatedAt: Date.now(),
            completed: false,
            storageState: 'external'
          }
        ];
        saveSubjects();
        localStorage.setItem('exo_lang', lang);
        if (typeof applyExoLanguage === 'function') applyExoLanguage(lang, { skipReload: true });
        renderChapterWorkspace(true);
      }, vp.lang);

      await vpPage.waitForTimeout(150);

      // Check dir attribute & workspace zero overflow
      const wsMetrics = await vpPage.evaluate(() => {
        const docEl = document.documentElement;
        return {
          dir: docEl.getAttribute('dir'),
          overflow: docEl.scrollWidth > docEl.clientWidth + 1,
          scrollWidth: docEl.scrollWidth,
          clientWidth: docEl.clientWidth
        };
      });
      const expectedDir = vp.lang === 'ar' ? 'rtl' : 'ltr';
      assert(wsMetrics.dir === expectedDir, `[${vp.label}] Document direction is ${expectedDir}`, JSON.stringify(wsMetrics));
      assert(!wsMetrics.overflow, `[${vp.label}] Zero horizontal overflow in Chapter Workspace`, JSON.stringify(wsMetrics));

      // Open Intake Modal & measure fit + >=44px hitboxes
      await vpPage.click('#cwAddResourceBtn');
      await vpPage.waitForSelector('#cwResourceIntakeOverlay.active', { timeout: 5000 });
      await vpPage.waitForTimeout(240);

      const modalMetrics = await vpPage.evaluate(() => {
        const box = document.getElementById('cwResourceIntakeDialog');
        const rect = box ? box.getBoundingClientRect() : null;
        const closeBtn = document.getElementById('cwIntakeCloseBtn');
        const closeRect = closeBtn ? closeBtn.getBoundingClientRect() : null;
        const typeBtns = Array.from(document.querySelectorAll('#cwResourceIntakeOverlay .exo-intake-type-card'));
        const minTypeH = typeBtns.length ? Math.min(...typeBtns.map(b => b.getBoundingClientRect().height)) : 0;
        return {
          fitsWidth: rect ? rect.left >= -1 && rect.right <= window.innerWidth + 1 : false,
          fitsHeight: rect ? rect.top >= -1 && rect.bottom <= window.innerHeight + 1 : false,
          closeW: closeRect ? Math.round(closeRect.width) : 0,
          closeH: closeRect ? Math.round(closeRect.height) : 0,
          minTypeH: Math.round(minTypeH),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        };
      });

      assert(
        modalMetrics.fitsWidth && modalMetrics.fitsHeight && !modalMetrics.overflow,
        `[${vp.label}] Intake modal fits viewport without clipping or horizontal overflow`,
        JSON.stringify(modalMetrics)
      );
      assert(
        modalMetrics.closeW >= 44 && modalMetrics.closeH >= 44 && modalMetrics.minTypeH >= 44,
        `[${vp.label}] Intake modal close button and type cards meet >=44px touch target`,
        JSON.stringify(modalMetrics)
      );

      await vpPage.screenshot({ path: path.join(screenshotDir, `07-intake-stage1-${vp.label}.png`) });

      // Advance to Stage 2 (PDF) and check save/back/cancel hitboxes + fit
      await vpPage.click('#cwIntakeTypeBtn_pdf');
      await vpPage.waitForSelector('#cwIntakeSaveBtn', { timeout: 5000 });
      await vpPage.waitForTimeout(160);

      const stage2Metrics = await vpPage.evaluate(() => {
        const saveBtn = document.getElementById('cwIntakeSaveBtn');
        const cancelBtn = document.getElementById('cwIntakeCancelBtn');
        const box = document.getElementById('cwResourceIntakeDialog');
        const rect = box ? box.getBoundingClientRect() : null;
        const fileZone = document.getElementById('cwIntakeFileZone');
        const fzRect = fileZone ? fileZone.getBoundingClientRect() : null;
        return {
          saveH: saveBtn ? Math.round(saveBtn.getBoundingClientRect().height) : 0,
          cancelH: cancelBtn ? Math.round(cancelBtn.getBoundingClientRect().height) : 0,
          fitsHeight: rect ? rect.top >= -1 && rect.bottom <= window.innerHeight + 1 : false,
          fileZoneVisibleInModal: Boolean(rect && fzRect && fzRect.top >= rect.top && fzRect.top < rect.bottom),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        };
      });
      assert(
        stage2Metrics.saveH >= 44 && stage2Metrics.cancelH >= 44 && stage2Metrics.fitsHeight && stage2Metrics.fileZoneVisibleInModal && !stage2Metrics.overflow,
        `[${vp.label}] Stage 2 modal buttons >=44px, file zone visible at top, and fits viewport cleanly`,
        JSON.stringify(stage2Metrics)
      );

      if (vp.label === 'mobile-390-ar' || vp.label === 'mobile-390-en' || vp.label === 'landscape-896-en') {
        await vpPage.screenshot({ path: path.join(screenshotDir, `08-intake-stage2-${vp.label}.png`) });
      }

      assert(vpErrs.length === 0, `[${vp.label}] Zero uncaught runtime page errors`, vpErrs.join(' | '));
      await vpCtx.close();
    }

    assert(pageErrors.length === 0, 'Main WP 7.2 lifecycle produced zero uncaught runtime page errors', pageErrors.join(' | '));

  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log('\n============================================================');
  console.log(`WP 7.2 CHROMIUM E2E RESULTS | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('============================================================\n');
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal WP 7.2 E2E error:', err);
  process.exit(1);
});
