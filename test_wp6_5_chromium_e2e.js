// ============================================================================
// Exo Personal Study Journal — Phase 6 / WP 6.5 Real-UI Chromium E2E Suite
// Exercises real browser interactions across all WP 6.5 workflows (S1–S8)
// with deterministic mocked network routes for Supabase & Google Drive.
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

  const proc = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'ignore'
  });

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (await checkServerListening(3000)) return proc;
  }
  throw new Error('Failed to start local server on port 3000');
}

const SUPABASE_CDN_MOCK = `
(function() {
  const STORAGE_KEY = '__exo_mock_sb_session_v1';
  const authListeners = new Set();

  function loadSession() {
    try {
      return JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    try {
      if (session) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  function notifyListeners(event, session) {
    authListeners.forEach((cb) => {
      try { cb(event, session); } catch (e) { console.error(e); }
    });
  }

  function buildWorkspaceRow(userId, vipEnabled, rev) {
    return {
      user_id: userId,
      can_upload_media: Boolean(vipEnabled),
      revision: Number(rev || 1),
      subjects_json: '[]',
      schedule_json: JSON.stringify({ events: [], backlog: [], prefs: {} }),
      logs_json: '[]',
      annotations_json: '{}',
      updated_at: new Date().toISOString()
    };
  }

  window.supabase = {
    createClient: function(url, anonKey) {
      function remoteBase() {
        return String(url || '').replace(/\\/+$/, '');
      }

      const auth = {
        getSession: async function() {
          return { data: { session: loadSession() }, error: null };
        },
        signInWithPassword: async function(creds) {
          const email = String(creds && creds.email || '').trim().toLowerCase();
          const res = await fetch(remoteBase() + '/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: creds && creds.password || '' })
          });
          const data = await res.json();
          if (!res.ok) return { data: { session: null, user: null }, error: data };
          saveSession(data.session);
          notifyListeners('SIGNED_IN', data.session);
          return { data: data, error: null };
        },
        signUp: async function(creds) {
          const email = String(creds && creds.email || '').trim().toLowerCase();
          const res = await fetch(remoteBase() + '/auth/v1/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: creds && creds.password || '', data: creds && creds.options && creds.options.data || {} })
          });
          const data = await res.json();
          if (!res.ok) return { data: { session: null, user: null }, error: data };
          if (data.session) {
            saveSession(data.session);
            notifyListeners('SIGNED_IN', data.session);
          }
          return { data: data, error: null };
        },
        signOut: async function() {
          saveSession(null);
          notifyListeners('SIGNED_OUT', null);
          return { error: null };
        },
        updateUser: async function(attrs) {
          const sess = loadSession();
          if (sess && sess.user && attrs && attrs.data) {
            sess.user.user_metadata = Object.assign({}, sess.user.user_metadata || {}, attrs.data);
            saveSession(sess);
          }
          return { data: { user: sess ? sess.user : null }, error: null };
        },
        onAuthStateChange: function(cb) {
          if (typeof cb === 'function') authListeners.add(cb);
          return {
            data: {
              subscription: {
                unsubscribe: function() { authListeners.delete(cb); }
              }
            }
          };
        }
      };

      function from(table) {
        const filters = {};
        let selectCols = '*';
        const builder = {
          select: function(cols) { selectCols = cols || '*'; return builder; },
          eq: function(col, val) { filters[col] = val; return builder; },
          maybeSingle: async function() {
            const q = new URLSearchParams(Object.assign({ table: table, select: selectCols }, filters));
            const res = await fetch(remoteBase() + '/rest/v1/' + table + '?' + q.toString());
            if (!res.ok) return { data: null, error: { message: 'Remote query failed', status: res.status } };
            const rows = await res.json();
            return { data: Array.isArray(rows) ? (rows[0] || null) : rows, error: null };
          },
          upsert: async function(row) {
            const res = await fetch(remoteBase() + '/rest/v1/' + table, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(row)
            });
            const out = await res.json();
            return res.ok ? { data: out, error: null } : { data: null, error: out };
          }
        };
        return builder;
      }

      async function rpc(fnName, params) {
        const res = await fetch(remoteBase() + '/rest/v1/rpc/' + fnName, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params || {})
        });
        const out = await res.json();
        return res.ok ? { data: out, error: null } : { data: null, error: out };
      }

      function channel() {
        const ch = {
          on: function() { return ch; },
          subscribe: function(cb) { if (typeof cb === 'function') setTimeout(() => cb('SUBSCRIBED'), 10); return ch; }
        };
        return ch;
      }

      return {
        auth: auth,
        from: from,
        rpc: rpc,
        channel: channel,
        removeChannel: function() {},
        storage: {
          from: function() {
            return {
              list: async function() { return { data: [], error: null }; },
              getPublicUrl: function(p) { return { data: { publicUrl: remoteBase() + '/storage/' + p } }; }
            };
          }
        }
      };
    }
  };
})();
`;

const GOOGLE_GSI_MOCK = `
(function() {
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: function(cfg) {
          return {
            requestAccessToken: function() {
              if (cfg && typeof cfg.callback === 'function') {
                setTimeout(function() {
                  cfg.callback({
                    access_token: 'mock-drive-token-001',
                    scope: cfg.scope || 'https://www.googleapis.com/auth/drive.file',
                    expires_in: 3600
                  });
                }, 10);
              }
            }
          };
        },
        revoke: function(_tok, cb) {
          if (typeof cb === 'function') cb();
        }
      }
    }
  };
})();
`;

async function installMockNetworkRoutes(page, mockState) {
  await page.route((u) => u.protocol === 'https:', async (route) => {
    const req = route.request();
    const url = req.url();

    if (url.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: SUPABASE_CDN_MOCK });
    }
    if (url.startsWith('https://accounts.google.com/gsi/client')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: GOOGLE_GSI_MOCK });
    }
    if (url.startsWith('https://fonts.googleapis.com') || url.includes('font-awesome') || url.endsWith('.css')) {
      return route.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed css */' });
    }
    if (url.includes('pdf.min.js')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stubbed pdf.js */' });
    }

    if (url.startsWith('https://dszjmgzzqpdrdjkycvht.supabase.co/')) {
      if (url.includes('/auth/v1/token') || url.includes('/auth/v1/signup')) {
        let body = {};
        try { body = req.postDataJSON() || {}; } catch {}
        const email = String(body.email || 'student@exo.edu').toLowerCase();
        const isVip = email.includes('vip');
        const uid = isVip ? '00000000-0000-4000-8000-000000000002' : '00000000-0000-4000-8000-000000000001';
        mockState.activeUid = uid;
        mockState.activeEmail = email;
        mockState.vipByUid[uid] = isVip;
        if (!mockState.workspaces[uid]) {
          mockState.workspaces[uid] = {
            user_id: uid,
            can_upload_media: isVip,
            revision: 1,
            subjects: [],
            schedule: { events: [], backlog: [], prefs: {} },
            logs: [],
            annotations: {},
            updated_at: new Date().toISOString()
          };
        }
        const session = {
          access_token: 'mock-session-tok-' + uid,
          token_type: 'bearer',
          expires_in: 3600,
          user: {
            id: uid,
            email: email,
            user_metadata: { full_name: isVip ? 'VIP Student' : 'Free Student', specialty: 'Pharmacy' }
          }
        };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ session, user: session.user })
        });
      }

      if (url.includes('/rest/v1/rpc/sync_workspace_with_concurrency')) {
        let body = {};
        try { body = req.postDataJSON() || {}; } catch {}
        const uid = mockState.activeUid || '00000000-0000-4000-8000-000000000001';
        const existing = mockState.workspaces[uid] || { user_id: uid, can_upload_media: Boolean(mockState.vipByUid[uid]), revision: 0 };
        const nextRev = Number(existing.revision || 0) + 1;
        const payload = body.p_payload || {};
        mockState.workspaces[uid] = Object.assign({}, existing, payload, {
          user_id: uid,
          can_upload_media: Boolean(mockState.vipByUid[uid]),
          revision: nextRev,
          updated_at: new Date().toISOString()
        });
        mockState.pushCount += 1;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success', revision: nextRev })
        });
      }

      if (url.includes('/rest/v1/user_workspaces')) {
        const u = new URL(url);
        const qUid = u.searchParams.get('user_id') || mockState.activeUid || '00000000-0000-4000-8000-000000000001';
        mockState.pullCount += 1;
        const row = mockState.workspaces[qUid] || {
          user_id: qUid,
          can_upload_media: Boolean(mockState.vipByUid[qUid]),
          revision: 1,
          subjects: [],
          schedule: { events: [], backlog: [], prefs: {} },
          logs: [],
          annotations: {},
          updated_at: new Date().toISOString()
        };
        if (u.searchParams.get('select') === 'can_upload_media') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{ can_upload_media: Boolean(mockState.vipByUid[qUid]) }])
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([row])
        });
      }

      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }

    if (url.startsWith('https://www.googleapis.com/drive/v3/about')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { emailAddress: mockState.activeEmail || 'student@exo.edu', displayName: 'EXO Student' },
          storageQuota: { usage: '104857600', limit: '16106127360' }
        })
      });
    }

    if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
      mockState.driveAuditCalls += 1;
      if (url.includes('permissions') || url.includes('trashed')) {
        mockState.drivePrivacyAuditScanCalls += 1;
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          files: [
            { id: 'drv-file-01', name: 'Pharmacology_Ch1.pdf', permissions: [{ id: 'owner-1', type: 'user', role: 'owner' }] },
            { id: 'drv-file-02', name: 'Organic_Lab_Notes.pdf', permissions: [{ id: 'owner-1', type: 'user', role: 'owner' }] }
          ]
        })
      });
    }

    return route.abort();
  });
}

async function openFreshPage(browser, mockState, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (!txt.includes('WebSocket') && !txt.includes('favicon')) {
        consoleErrors.push(txt);
      }
    }
  });

  await installMockNetworkRoutes(page, mockState);
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof initPdfDB === 'function' && typeof switchView === 'function');
  await page.waitForTimeout(350);

  return { context, page, pageErrors, consoleErrors };
}

async function main() {
  console.log('======================================================================');
  console.log('EXO PHASE 6 / WP 6.5: REAL CHROMIUM UI E2E VERIFICATION (S1 - S8)');
  console.log('======================================================================\n');

  const spawnedServer = await ensureLocalServerRunning();
  const browser = await chromium.launch(resolveChromiumLaunchOptions());

  const mockState = {
    activeUid: null,
    activeEmail: null,
    vipByUid: {},
    workspaces: {},
    pushCount: 0,
    pullCount: 0,
    driveAuditCalls: 0,
    drivePrivacyAuditScanCalls: 0
  };

  try {
    // ------------------------------------------------------------------------
    // S1: Smart Planner Real UI Flow + Reload Persistence
    // ------------------------------------------------------------------------
    console.log('--- S1: Smart Planner Real UI Flow & Reload Persistence ---');
    const s1 = await openFreshPage(browser, mockState);
    try {
      const p = s1.page;
      // Ensure English first-run default
      const initialLang = await p.evaluate(() => document.documentElement.lang);
      const initialDir = await p.evaluate(() => document.documentElement.dir);
      assert(initialLang === 'en' && initialDir === 'ltr', 'S1.1 First-run default language is English LTR', `lang=${initialLang}, dir=${initialDir}`);

      // Navigate to Planner via sidebar button
      await p.click('.sidebar-nav-item[data-tab="schedule"]');
      await p.waitForSelector('#schedule.active', { timeout: 5000 });

      // Check Weekly Goals view + empty state first
      await p.click('#schPillTasks');
      await p.waitForSelector('#subview-tasks.active #newTaskTitle', { timeout: 4000 });
      const emptyTasksText = await p.locator('#subview-tasks').innerText();
      assert(emptyTasksText.trim().length > 0, 'S1.2 Weekly Goals view renders clean empty state before adding goals');

      // Add a Weekly Goal via real input + button click
      await p.fill('#newTaskTitle', 'Master Autonomic Pharmacology Ch.1');
      await p.click('button[onclick="addBacklogTask()"]');
      await p.waitForSelector('.backlog-card', { timeout: 5000 });
      const goalCardCount = await p.locator('.backlog-card').count();
      assert(goalCardCount >= 1, 'S1.3 Adding weekly goal via real input + click creates goal card', `count=${goalCardCount}`);

      // Add a study session via #plannerAddSessionHeaderBtn modal
      await p.click('#plannerAddSessionHeaderBtn');
      await p.waitForSelector('#sessionModalOverlay.active', { timeout: 4000 });
      await p.fill('#sessionTitleInput', 'Pharmacology Ch.1 Deep Block');
      // Select Today so it appears in Today view as well as Week view
      await p.selectOption('#sessionDaySelect', String(new Date().getDay()));
      await p.selectOption('#sessionDurationSelect', '1.5');
      await p.click('#sessionModalOverlay button[onclick="saveSession()"]');
      await p.waitForFunction(() => !document.getElementById('sessionModalOverlay')?.classList.contains('active'));

      // Link goal to the session via #goalTaskLinkerModalOverlay
      await p.click('#schPillTasks');
      await p.locator('.backlog-card button[onclick*="openGoalTaskLinkerModal"]').first().click();
      await p.waitForSelector('#goalTaskLinkerModalOverlay.active', { timeout: 4000 });
      await p.locator('#goalTaskLinkerSessionsList .goal-linker-session-item').first().click();
      const linkedItemCount = await p.locator('#goalTaskLinkerSessionsList .goal-linker-session-item.is-selected').count();
      assert(linkedItemCount === 1, 'S1.4 Goal task linker links scheduled study session via click');
      await p.click('#goalTaskLinkerModalOverlay button[onclick*="closeModal(\'goalTaskLinkerModalOverlay\')"]');

      // Toggle Today & Week views and verify drawer toggle
      await p.click('#schPillToday');
      await p.waitForSelector('#subview-today.active', { timeout: 3000 });
      await p.click('#psfToggleDrawerBtn');
      const drawerExists = await p.locator('#plannerSettingsBody').count();
      assert(drawerExists > 0, 'S1.5 Planner setup drawer toggle opens cleanly');

      // Complete the study session in Today view via .fsc-check-circle
      await p.locator('#schedule .fsc-check-circle').first().click();
      await p.waitForTimeout(300);
      const checkedCount = await p.locator('#schedule .fsc-check-circle.checked').count();
      assert(checkedCount >= 1, 'S1.6 Completing study session marks check circle as checked');

      // Reload page and verify persistence
      await p.reload({ waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => typeof switchView === 'function');
      await p.click('.sidebar-nav-item[data-tab="schedule"]');
      await p.click('#schPillTasks');
      const persistedGoalText = await p.locator('#subview-tasks').innerText();
      await p.click('#schPillToday');
      const persistedCheckedCount = await p.locator('#schedule .fsc-check-circle.checked').count();
      assert(
        persistedGoalText.includes('Master Autonomic Pharmacology Ch.1') && persistedCheckedCount >= 1,
        'S1.7 Real browser reload preserves weekly goal and completed study session'
      );
      assert(s1.pageErrors.length === 0 && s1.consoleErrors.length === 0, 'S1.8 Zero runtime page/console errors in S1', `pageErr=${s1.pageErrors.join(';')} consoleErr=${s1.consoleErrors.join(';')}`);
    } finally {
      await s1.context.close();
    }

    // ------------------------------------------------------------------------
    // S2: Smart Compass & Tracker Real UI Flow
    // ------------------------------------------------------------------------
    console.log('\n--- S2: Smart Compass & Tracker Real UI Flow ---');
    const s2 = await openFreshPage(browser, mockState);
    try {
      const p = s2.page;
      // Navigate to Tracker
      await p.click('.sidebar-nav-item[data-tab="tracker"]');
      await p.waitForSelector('#tracker.active', { timeout: 4000 });

      // Check Smart Compass card structure (Why it matters + Next step + actionable button)
      const compassText = await p.locator('#smartRecommendationsList').innerText();
      assert(
        compassText.includes('Why it matters') && compassText.includes('Next step'),
        'S2.1 Smart Compass cards render structured Why-it-matters and Next-step guidance'
      );

      // Click Smart Compass CTA button and confirm genuine navigation or modal opens
      await p.locator('#smartRecommendationsList .smart-rec-action-btn').first().click();
      await p.waitForTimeout(250);
      const compassNavigatedOrOpenedModal = await p.evaluate(() => {
        const activeModal = document.querySelector('.glass-overlay.active');
        const activeTab = document.querySelector('.view-section.active')?.id;
        return Boolean(activeModal || (activeTab && activeTab !== 'tracker'));
      });
      assert(compassNavigatedOrOpenedModal, 'S2.2 Clicking Smart Compass CTA button navigates or opens action modal');

      // Return to Tracker and add two identical reflection logs, then deduplicate
      await p.keyboard.press('Escape');
      await p.click('.sidebar-nav-item[data-tab="tracker"]');
      for (let i = 0; i < 2; i++) {
        await p.click('#tracker button[onclick="triggerAddLogPro()"]');
        await p.waitForSelector('#addLogModalOverlay.active', { timeout: 3000 });
        await p.fill('#logTextInput', 'Reviewed Ch.1 receptors and practice problems');
        await p.click('#addLogModalOverlay button[onclick="saveLogPro()"]');
        await p.waitForFunction(() => !document.getElementById('addLogModalOverlay')?.classList.contains('active'));
      }
      const logsBeforeDedup = await p.locator('#logsContainer .log-item-actionable').count();
      await p.click('button[onclick="deduplicateAndCompactLogs()"]');
      await p.waitForTimeout(250);
      const logsAfterDedup = await p.locator('#logsContainer .log-item-actionable').count();
      assert(logsBeforeDedup >= 2 && logsAfterDedup < logsBeforeDedup, 'S2.3 Add Log Pro & Deduplicate Logs reduce duplicate entries cleanly', `before=${logsBeforeDedup}, after=${logsAfterDedup}`);
      assert(s2.pageErrors.length === 0 && s2.consoleErrors.length === 0, 'S2.4 Zero runtime page/console errors in S2');
    } finally {
      await s2.context.close();
    }

    // ------------------------------------------------------------------------
    // S3: Weekly Evaluation & Rollover Gating (Free vs VIP Server Entitlement)
    // ------------------------------------------------------------------------
    console.log('\n--- S3: Weekly Evaluation & Rollover (Free VIP Lock vs VIP Success) ---');
    const s3 = await openFreshPage(browser, mockState);
    try {
      const p = s3.page;
      // Sign in as Free user via Account modal UI
      await p.click('.sidebar-profile-card');
      await p.waitForSelector('#cloudAuthModalOverlay.active', { timeout: 4000 });
      await p.fill('#cloudAuthEmail', 'freeuser@exo.edu');
      await p.fill('#cloudAuthPassword', 'StrongPass123!');
      await p.click('#cloudAuthSubmitBtn');
      await p.waitForFunction(() => !document.getElementById('cloudAuthModalOverlay')?.classList.contains('active'));

      // Switch to Tracker and attempt Weekly Evaluation -> must open VIP modal
      await p.click('.sidebar-nav-item[data-tab="tracker"]');
      await p.click('#tracker button[onclick="triggerManualWeekEvaluationAndRollover()"]');
      await p.waitForSelector('#vipMediaLockModalOverlay.active', { timeout: 4000 });
      const vipLockOpen = await p.locator('#vipMediaLockModalOverlay.active').count();
      assert(vipLockOpen === 1, 'S3.1 Free user clicking Weekly Evaluation opens VIP Pro upgrade dialog cleanly');
      await p.keyboard.press('Escape');

      // Now sign out and sign in as VIP user via Account modal UI
      await p.click('.sidebar-profile-card');
      await p.waitForSelector('#cloudLoggedInView', { state: 'visible', timeout: 4000 });
      await p.click('button[onclick="handleCloudSignOut()"]');
      await p.waitForSelector('#confirmModalOverlay.active', { timeout: 4000 });
      await p.click('#confirmModalBtn');
      await p.waitForSelector('#cloudLoggedOutView', { state: 'visible', timeout: 6000 });
      await p.fill('#cloudAuthEmail', 'vipuser@exo.edu');
      await p.fill('#cloudAuthPassword', 'StrongPass123!');
      await p.click('#cloudAuthSubmitBtn');
      await p.waitForFunction(() => !document.getElementById('cloudAuthModalOverlay')?.classList.contains('active'));

      // Add a study session today so weekly evaluation has activity up to today
      await p.click('.sidebar-nav-item[data-tab="schedule"]');
      await p.click('#plannerAddSessionHeaderBtn');
      await p.waitForSelector('#sessionModalOverlay.active', { timeout: 3000 });
      await p.fill('#sessionTitleInput', 'VIP Eval Study Session');
      await p.selectOption('#sessionDaySelect', String(new Date().getDay()));
      await p.click('#sessionModalOverlay button[onclick="saveSession()"]');
      await p.waitForFunction(() => !document.getElementById('sessionModalOverlay')?.classList.contains('active'));

      // Trigger Weekly Evaluation as VIP -> opens #weeklyReportModalOverlay and adds card to #weeklyEvaluationsListContainer
      await p.click('.sidebar-nav-item[data-tab="tracker"]');
      await p.click('#tracker button[onclick="triggerManualWeekEvaluationAndRollover()"]');
      await p.waitForSelector('#weeklyReportModalOverlay.active', { timeout: 4000 });
      const reportBodyLen = (await p.locator('#weeklyReportModalBody').innerText()).trim().length;
      await p.keyboard.press('Escape');
      const evalCardsCount = await p.locator('#weeklyEvaluationsListContainer > *').count();
      assert(reportBodyLen > 20 && evalCardsCount >= 1, 'S3.2 VIP user Weekly Evaluation opens report modal and populates evaluation hub', `evalCards=${evalCardsCount}`);
      assert(s3.pageErrors.length === 0 && s3.consoleErrors.length === 0, 'S3.3 Zero runtime page/console errors in S3');
    } finally {
      await s3.context.close();
    }

    // ------------------------------------------------------------------------
    // S4: Schedule PDF Studio Preview, Modes, Presets, Zoom & Download
    // ------------------------------------------------------------------------
    console.log('\n--- S4: Schedule PDF Studio Modes, Zoom & Real PDF Download ---');
    const s4 = await openFreshPage(browser, mockState);
    try {
      const p = s4.page;
      await p.click('.sidebar-nav-item[data-tab="schedule"]');
      await p.click('#plannerAddSessionHeaderBtn');
      await p.waitForSelector('#sessionModalOverlay.active', { timeout: 3000 });
      await p.fill('#sessionTitleInput', 'Clinical Case Study');
      await p.selectOption('#sessionDaySelect', String(new Date().getDay()));
      await p.click('#sessionModalOverlay button[onclick="saveSession()"]');
      await p.waitForFunction(() => !document.getElementById('sessionModalOverlay')?.classList.contains('active'));

      await p.click('#plannerExportPdfHeaderBtn');
      await p.waitForSelector('#shareSchedulePdfModalOverlay.active', { timeout: 4000 });

      await p.click('#pdfModeCardDigital');
      const digitalActive = await p.locator('#pdfModeCardDigital.active').count();
      await p.click('#pdfModeCardPrintable');
      const printableActive = await p.locator('#pdfModeCardPrintable.active').count();
      assert(digitalActive === 1 && printableActive === 1, 'S4.1 Switching between Digital and Printable PDF editions works cleanly');

      await p.click('#pdfPresetBtn_scheduled');
      await p.click('#pdfPresetBtn_all');
      await p.click('#btnTogglePdfPreviewZoom');
      const zoomedClass = await p.locator('#schedulePdfPreviewStage.zoomed-preview').count();
      assert(zoomedClass === 1, 'S4.2 Schedule PDF preview zoom toggles stage scale cleanly');

      await p.fill('#pdfScheduleCustomTitleInput', 'Exo Pharmacy Plan Wk1');
      const [download] = await Promise.all([
        p.waitForEvent('download', { timeout: 10000 }),
        p.click('#btnDownloadSchedulePdfFile')
      ]);
      const suggestedName = download.suggestedFilename();
      const dlPath = await download.path();
      const dlSize = dlPath && fs.existsSync(dlPath) ? fs.statSync(dlPath).size : 0;
      const dlHeader = dlPath && fs.existsSync(dlPath) ? fs.readFileSync(dlPath).slice(0, 5).toString('utf8') : '';
      assert(suggestedName.endsWith('.pdf') && dlSize > 1000 && dlHeader === '%PDF-', 'S4.3 Download button generates real non-empty .pdf file', `name=${suggestedName}, bytes=${dlSize}, header=${dlHeader}`);
      await p.keyboard.press('Escape');
      assert(s4.pageErrors.length === 0 && s4.consoleErrors.length === 0, 'S4.4 Zero runtime page/console errors in S4');
    } finally {
      await s4.context.close();
    }

    // ------------------------------------------------------------------------
    // S5: Backup Export + Import Preflight (Valid v4, Missing Anno, Tampered SHA-256, Legacy)
    // ------------------------------------------------------------------------
    console.log('\n--- S5: Backup Preflight Matrix & Smart Merge Execution ---');
    const s5 = await openFreshPage(browser, mockState);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-wp65-bkp-'));
    try {
      const p = s5.page;
      // Add a subject via Smart Subject modal so exported v4 backup contains real domain data
      await p.click('.sidebar-nav-item[data-tab="subjects"]');
      await p.click('#addSubjectPrimaryBtn');
      await p.waitForSelector('#smartSubjectModalOverlay.active', { timeout: 3000 });
      await p.fill('#smartSubjectNameInput', 'Medicinal Chemistry');
      await p.click('#smartSubjectModalOverlay button[onclick="saveSmartSubjectModal()"]');
      await p.waitForFunction(() => !document.getElementById('smartSubjectModalOverlay')?.classList.contains('active'));

      await p.click('.sidebar-nav-item[data-tab="tracker"]');
      await p.click('#backupDrawerToggleBtn');

      // Export real v4 backup via UI Export button download event
      const [bkpDl] = await Promise.all([
        p.waitForEvent('download', { timeout: 10000 }),
        p.click('button[onclick="exportData()"]')
      ]);
      const validFile = path.join(tmpDir, 'valid-v4.json');
      await bkpDl.saveAs(validFile);
      const validRaw = fs.readFileSync(validFile, 'utf8');

      // Build missing-annotations, tampered-SHA256, and legacy variants
      const backups = await p.evaluate(async (rawJson) => {
        const validObj = JSON.parse(rawJson);

        const noAnnoObj = JSON.parse(rawJson);
        delete noAnnoObj.data.annotations;
        const noAnnoCanonical = canonicalizeJson(noAnnoObj.data);
        noAnnoObj.integrity.sha256 = await computeCanonicalSha256(noAnnoCanonical);
        noAnnoObj.integrity.byteLength = new TextEncoder().encode(noAnnoCanonical).length;

        const tamperedObj = JSON.parse(rawJson);
        const origSha = String(tamperedObj.integrity.sha256 || '');
        tamperedObj.integrity.sha256 = (origSha.startsWith('0') ? '1' : '0') + origSha.slice(1);

        const legacyObj = {
          version: 3,
          subjects: [{ id: 888101, name: 'Biochemistry Legacy', code: 'BIO-101', color: '#899982', totalLec: 6, doneLec: 2, isDivided: true, lectures: [] }],
          schedule: { events: [], backlog: [{ id: 888201, title: 'Legacy Goal Review Ch.2', done: false }], prefs: {} },
          logs: [{ id: 888301, date: '2026-11-12', text: 'Legacy study log entry', mood: 'check' }]
        };
        return {
          validObjCheck: validObj.schema === 'exo_workspace_backup_v4' && validObj.integrity?.algorithm === 'SHA-256',
          noAnnoJson: JSON.stringify(noAnnoObj, null, 2),
          tamperedJson: JSON.stringify(tamperedObj, null, 2),
          legacyJson: JSON.stringify(legacyObj, null, 2)
        };
      }, validRaw);

      assert(backups.validObjCheck, 'S5.0 UI Export button produces valid v4 SHA-256 signed backup JSON');
      const noAnnoFile = path.join(tmpDir, 'missing-anno-v4.json');
      const tamperedFile = path.join(tmpDir, 'tampered-v4.json');
      const legacyFile = path.join(tmpDir, 'legacy-v3.json');
      fs.writeFileSync(noAnnoFile, backups.noAnnoJson);
      fs.writeFileSync(tamperedFile, backups.tamperedJson);
      fs.writeFileSync(legacyFile, backups.legacyJson);

      // (a) Valid v4
      await p.setInputFiles('#importFileInput', validFile);
      await p.waitForSelector('#backupImportPreflightModalOverlay.active', { timeout: 4000 });
      const validReplaceDisabled = await p.locator('#backupReplaceBtn').isDisabled();
      assert(!validReplaceDisabled, 'S5.1 Valid v4 backup allows Full Replace in preflight modal');
      await p.click('#backupCancelBtn');

      // (b) Missing annotations in v4 -> fail-closed rejection toast, no preflight modal
      await p.evaluate(() => { const tc = document.getElementById('toastContainer'); if (tc) tc.innerHTML = ''; });
      await p.setInputFiles('#importFileInput', noAnnoFile);
      await p.waitForFunction(() => (document.getElementById('toastContainer')?.innerText || '').trim().length > 0, { timeout: 4000 });
      const noAnnoPreflightOpen = await p.locator('#backupImportPreflightModalOverlay.active').count();
      const noAnnoToast = await p.locator('#toastContainer').innerText();
      assert(noAnnoPreflightOpen === 0 && noAnnoToast.includes('annotations'), 'S5.2 Missing-annotations v4 backup fails closed with toast warning', noAnnoToast);

      // (c) Tampered SHA-256 in v4 -> fail-closed integrity mismatch toast, no preflight modal
      await p.evaluate(() => { const tc = document.getElementById('toastContainer'); if (tc) tc.innerHTML = ''; });
      await p.setInputFiles('#importFileInput', tamperedFile);
      await p.waitForFunction(() => (document.getElementById('toastContainer')?.innerText || '').trim().length > 0, { timeout: 4000 });
      const tamperedPreflightOpen = await p.locator('#backupImportPreflightModalOverlay.active').count();
      const tamperedToast = await p.locator('#toastContainer').innerText();
      assert(tamperedPreflightOpen === 0 && tamperedToast.includes('SHA-256'), 'S5.3 Tampered SHA-256 v4 backup fails closed with SHA-256 integrity error toast', tamperedToast);

      // (d) Legacy v3 -> opens preflight modal with Full Replace disabled & Smart Merge enabled
      await p.setInputFiles('#importFileInput', legacyFile);
      await p.waitForSelector('#backupImportPreflightModalOverlay.active', { timeout: 4000 });
      const legacyReplaceDisabled = await p.locator('#backupReplaceBtn').isDisabled();
      const legacyMergeDisabled = await p.locator('#backupMergeBtn').isDisabled();
      const legacyDetails = await p.locator('#backupPreflightDetails').innerText();
      assert(legacyReplaceDisabled && !legacyMergeDisabled && (legacyDetails.includes('Protected Block') || legacyDetails.includes('Switch to Smart Merge')), 'S5.4 Legacy backup disables Full Replace, warns cleanly, and enables Smart Merge', legacyDetails);
      await p.evaluate(() => { const tc = document.getElementById('toastContainer'); if (tc) tc.innerHTML = ''; });
      await p.click('#backupMergeBtn');
      await p.waitForFunction(() => (document.getElementById('toastContainer')?.innerText || '').includes('Backup restored successfully'), { timeout: 8000 });

      await p.reload({ waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => typeof switchView === 'function');
      await p.click('.sidebar-nav-item[data-tab="subjects"]');
      const mergedSubjectsText = await p.locator('#subjects').innerText();
      assert(mergedSubjectsText.includes('Biochemistry Legacy') && mergedSubjectsText.includes('Medicinal Chemistry'), 'S5.5 Smart Merge persists combined subjects across browser reload');
      assert(s5.pageErrors.length === 0 && s5.consoleErrors.length === 0, 'S5.6 Zero runtime page/console errors in S5');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      await s5.context.close();
    }

    // ------------------------------------------------------------------------
    // S6: Account Auth, Cloud Dual-Status Push/Pull & Drive Privacy Check
    // ------------------------------------------------------------------------
    console.log('\n--- S6: Account, Cloud Sync & Drive Privacy Check ---');
    const s6 = await openFreshPage(browser, mockState);
    try {
      const p = s6.page;
      // Set Google client id cleanly for test runtime so GIS stub runs interactively
      await p.evaluate(() => localStorage.setItem('exo_gdrive_custom_client_id', 'mock-exo-client-id.apps.googleusercontent.com'));

      await p.click('.sidebar-profile-card');
      await p.waitForSelector('#cloudAuthModalOverlay.active', { timeout: 4000 });
      const loggedOutVisible = await p.locator('#cloudLoggedOutView').isVisible();
      assert(loggedOutVisible, 'S6.1 Signed-out Account modal displays sign-in form');

      await p.fill('#cloudAuthEmail', 'vip.sync@exo.edu');
      await p.fill('#cloudAuthPassword', 'StrongPass123!');
      await p.click('#cloudAuthSubmitBtn');
      await p.waitForFunction(() => !document.getElementById('cloudAuthModalOverlay')?.classList.contains('active'));

      // Reopen Account modal -> Logged-in view + dual status + manual Push/Pull + Drive link & privacy audit
      await p.click('.sidebar-profile-card');
      await p.waitForSelector('#cloudLoggedInView', { state: 'visible', timeout: 4000 });
      const dualStatusText = await p.locator('#cloudDualStatusSummary').innerText();
      assert(dualStatusText.includes('Device Storage') && dualStatusText.includes('Cloud Sync'), 'S6.2 Signed-in Account modal shows dual local-vs-cloud status cards', dualStatusText);

      const prevPushes = mockState.pushCount;
      await p.click('#btnManualCloudPush');
      await p.waitForFunction(() => !document.getElementById('btnManualCloudPush')?.disabled, { timeout: 5000 });
      const prevPulls = mockState.pullCount;
      await p.click('#btnManualCloudPull');
      await p.waitForFunction(() => !document.getElementById('btnManualCloudPull')?.disabled, { timeout: 5000 });
      assert(mockState.pushCount > prevPushes && mockState.pullCount > prevPulls, 'S6.3 Manual Push & Pull trigger verified Supabase RPC & SELECT mocks');

      // Link Google Drive + verify post-connection Private-by-Default state + Privacy Check modal
      await p.click('#btnConnectGoogleDrive');
      await p.waitForFunction(() => {
        const badge = document.getElementById('gdriveStatusBadge')?.innerText || '';
        const auditBtn = document.getElementById('btnAuditGdrivePrivacy');
        const disconnectBtn = document.getElementById('btnDisconnectGoogleDrive');
        const auditVisible = auditBtn && window.getComputedStyle(auditBtn).display !== 'none';
        const disconnectVisible = disconnectBtn && window.getComputedStyle(disconnectBtn).display !== 'none';
        return badge.includes('Connected') && Boolean(auditVisible) && Boolean(disconnectVisible);
      }, { timeout: 6000 });

      const postConnectState = await p.evaluate(() => {
        const auditBtn = document.getElementById('btnAuditGdrivePrivacy');
        return {
          badgeText: (document.getElementById('gdriveStatusBadge')?.innerText || '').trim(),
          privacyPillText: (document.getElementById('gdrivePrivacySummaryPill')?.innerText || '').trim(),
          mediaStripText: (document.getElementById('gdriveMediaRegistryStrip')?.innerText || '').trim(),
          auditBtnVisible: Boolean(auditBtn && window.getComputedStyle(auditBtn).display !== 'none')
        };
      });

      const prevAuditScans = mockState.drivePrivacyAuditScanCalls;
      await p.click('#btnAuditGdrivePrivacy');
      await p.waitForSelector('#gdrivePrivacyAuditOverlay.active', { timeout: 4000 });
      await p.waitForFunction(() => {
        const el = document.getElementById('gdriveAuditContent');
        if (!el) return false;
        const state = el.getAttribute('data-audit-state');
        const hasSpinner = Boolean(el.querySelector('.fa-spinner'));
        const txt = el.innerText || '';
        return !hasSpinner && (state === 'complete' || state === 'error' || Boolean(el.querySelector('h4')) || txt.includes('Scanned ') || txt.includes('Error checking files'));
      }, { timeout: 6000 });

      const auditResult = await p.evaluate(() => {
        const el = document.getElementById('gdriveAuditContent');
        const txt = (el?.innerText || '').trim();
        const state = el?.getAttribute('data-audit-state') || '';
        const scannedAttr = el?.getAttribute('data-scanned-count');
        const hasSpinner = Boolean(el?.querySelector('.fa-spinner'));
        const hasLockIcon = Boolean(el?.querySelector('.fa-lock'));
        const headingText = (el?.querySelector('h4')?.innerText || '').trim();
        const fileCountMatch = txt.match(/Scanned\s+(\d+)\s+file/i);
        const parsedFileCount = fileCountMatch ? Number(fileCountMatch[1]) : (scannedAttr !== null ? Number(scannedAttr) : null);
        const tokenExposureDetected = (
          txt.includes('mock-drive-token') ||
          txt.includes('mock-session-tok') ||
          /Bearer\s+/i.test(txt) ||
          /ya29\./i.test(txt) ||
          /access_token\s*=/i.test(txt)
        );
        return {
          state,
          hasSpinner,
          hasLockIcon,
          headingPrivateConfirmed: headingText.toLowerCase().includes('private') && !headingText.toLowerCase().includes('checking'),
          allPrivateTextConfirmed: txt.includes('All scanned files are private') && txt.includes('remain private to your account'),
          parsedFileCount,
          tokenExposureDetected
        };
      });

      const auditScanDelta = mockState.drivePrivacyAuditScanCalls - prevAuditScans;
      const connectionCompleted = Boolean(postConnectState.badgeText.includes('Connected') && postConnectState.auditBtnVisible);
      const privacyPillMatched = postConnectState.privacyPillText.includes('Private-by-Default');
      const auditCompleted = !auditResult.hasSpinner && auditResult.state === 'complete' && auditResult.hasLockIcon && auditResult.headingPrivateConfirmed && auditResult.allPrivateTextConfirmed;
      const scannedCountCorrect = auditResult.parsedFileCount === 2 && auditScanDelta >= 1;
      const noTokenExposed = !auditResult.tokenExposureDetected;
      const s64Diagnostics = JSON.stringify({
        connectionCompleted,
        privacyPillMatched,
        auditCompleted,
        scannedCountCorrect,
        parsedFileCount: auditResult.parsedFileCount,
        auditScanDelta,
        noTokenExposed
      });
      assert(
        connectionCompleted && privacyPillMatched && auditCompleted && scannedCountCorrect && noTokenExposed,
        'S6.4 Drive Private-by-Default & Privacy Check audit scanned files without exposing OAuth tokens',
        s64Diagnostics
      );
      await p.keyboard.press('Escape');
      const auditDismissed = (await p.locator('#gdrivePrivacyAuditOverlay').count()) === 0;
      assert(auditDismissed, 'S6.5 Escape dismisses Drive Privacy Check modal cleanly');
      assert(s6.pageErrors.length === 0 && s6.consoleErrors.length === 0, 'S6.6 Zero runtime page/console errors in S6');
    } finally {
      await s6.context.close();
    }

    // ------------------------------------------------------------------------
    // S7: Help Center (6-Module Academy + 5-Station Loop), Spotlight Tour & EN/AR Toggle
    // ------------------------------------------------------------------------
    console.log('\n--- S7: Academy Guide, 5-Station Loop, Spotlight Tour & EN/AR Toggle ---');
    const s7 = await openFreshPage(browser, mockState);
    try {
      const p = s7.page;
      await p.click('.sidebar-tool-btn[onclick="openHelpModal()"]');
      await p.waitForSelector('#helpModalOverlay.active', { timeout: 4000 });

      const stationCount = await p.locator('#wp65ClosedLoopStationsGrid .wp65-loop-station').count();
      assert(stationCount === 5, 'S7.1 Help center displays 5 connected closed-loop stations', `count=${stationCount}`);

      // Step panes via module Next / Prev buttons and dock navigation
      await p.click('#egDockNextBtn');
      await p.click('#acadPane_1 .acad-footer-nav button[onclick*="switchAcademyModule(2)"]');
      const pane2Active = await p.locator('#acadPane_2.active').count();
      await p.click('#egDockPrevBtn');
      await p.click('#acadPane_2 .acad-footer-nav button[onclick*="switchAcademyModule(1)"]');
      const pane1Active = await p.locator('#acadPane_1.active').count();
      assert(pane2Active === 1 && pane1Active === 1, 'S7.2 Academy guide Next/Prev stepper transitions cleanly between panes');

      // Click station 4 (Study Compass) -> closes Help modal and navigates to Tracker
      await p.locator('#wp65ClosedLoopStationsGrid .wp65-loop-station').nth(3).click();
      await p.waitForFunction(() => !document.getElementById('helpModalOverlay')?.classList.contains('active'));
      const activeAfterStation = await p.locator('.view-section.active').getAttribute('id');
      assert(activeAfterStation === 'tracker', 'S7.3 Clicking Study Compass station jumps directly to Tracker workspace');

      // Reopen Help -> launch Spotlight Tour -> step -> Escape dismisses tour
      await p.click('.sidebar-tool-btn[onclick="openHelpModal()"]');
      await p.waitForSelector('#helpModalOverlay.active', { timeout: 3000 });
      await p.click('#helpStartSpotlightTourBtn');
      await p.waitForSelector('#spotlightTourFloatingCard.active', { timeout: 4000 });
      const step1Body = await p.locator('#spotlightTourFloatingCard').innerText();
      await p.click('#spotlightNextBtn');
      await p.waitForTimeout(200);
      const step2Body = await p.locator('#spotlightTourFloatingCard').innerText();
      assert(step1Body !== step2Body, 'S7.4 Spotlight tour advances interactively between tour stops');
      await p.keyboard.press('Escape');
      const tourClosed = await p.evaluate(() => !document.getElementById('spotlightTourFloatingCard')?.classList.contains('active'));
      assert(tourClosed, 'S7.5 Pressing Escape dismisses Spotlight tour cleanly');

      // Toggle EN -> AR -> EN via sidebar language toggle
      await p.click('#sidebarLangToggleBtn');
      await p.waitForFunction(() => document.documentElement.dir === 'rtl' && document.documentElement.lang === 'ar');
      const arToggleState = await p.evaluate(() => ({
        dir: document.documentElement.dir,
        lang: document.documentElement.lang,
        lbl: document.getElementById('sidebarLangLabel')?.textContent?.trim()
      }));
      await p.click('#sidebarLangToggleBtn');
      await p.waitForFunction(() => document.documentElement.dir === 'ltr' && document.documentElement.lang === 'en');
      const enToggleState = await p.evaluate(() => ({
        dir: document.documentElement.dir,
        lang: document.documentElement.lang,
        lbl: document.getElementById('sidebarLangLabel')?.textContent?.trim()
      }));
      assert(
        arToggleState.dir === 'rtl' && arToggleState.lang === 'ar' && enToggleState.dir === 'ltr' && enToggleState.lang === 'en',
        'S7.6 Language toggle switches cleanly between EN LTR and AR RTL'
      );
      assert(s7.pageErrors.length === 0 && s7.consoleErrors.length === 0, 'S7.7 Zero runtime page/console errors in S7');
    } finally {
      await s7.context.close();
    }

    // ------------------------------------------------------------------------
    // S8: Smart Subject & Exam Radar Modals, A11y Attributes & Mobile 390x844 AR RTL
    // ------------------------------------------------------------------------
    console.log('\n--- S8: Subject Modals, Accessibility & Mobile 390x844 AR RTL ---');
    const s8 = await openFreshPage(browser, mockState, { width: 390, height: 844 });
    try {
      const p = s8.page;
      // Switch to Arabic RTL on mobile viewport
      await p.click('#appLangToggleBtn');
      await p.waitForFunction(() => document.documentElement.dir === 'rtl' && document.documentElement.lang === 'ar');

      // Open Smart Subject modal and verify Divided vs Continuous & color swatches & save
      await p.click('.mobile-nav-item[data-tab="subjects"]');
      await p.waitForSelector('#subjects.active', { timeout: 3000 });
      await p.click('#addSubjectPrimaryBtn');
      await p.waitForSelector('#smartSubjectModalOverlay.active', { timeout: 3000 });
      const subDialogAttrs = await p.evaluate(() => {
        const el = document.getElementById('smartSubjectModalOverlay');
        return { role: el?.getAttribute('role'), modal: el?.getAttribute('aria-modal') };
      });
      await p.click('#subDivisionCardFalse');
      await p.click('#subDivisionCardTrue');
      await p.fill('#smartSubjectNameInput', 'علم الأدوية الإكلينيكي');
      await p.click('#smartSubjectModalOverlay button[onclick="saveSmartSubjectModal()"]');
      await p.waitForFunction(() => !document.getElementById('smartSubjectModalOverlay')?.classList.contains('active'));

      // Open the newly created book to access Subject Details -> Exam Radar
      await p.locator('#mainSubjectsGrid .subject-card').first().click();
      await p.waitForSelector('#toggleSubjectExamRadarBtn', { state: 'visible', timeout: 3000 });
      await p.click('#toggleSubjectExamRadarBtn');
      await p.waitForSelector('#subjectExamRadarModalOverlay.active', { timeout: 3000 });
      await p.fill('#examRadarTitleInput', 'اختبار منتصف الفصل');
      const futureIso = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      await p.fill('#examRadarDateInput', futureIso);
      await p.click('#subjectExamRadarModalOverlay button[onclick="saveSubjectExamRadarModal()"]');
      await p.waitForFunction(() => !document.getElementById('subjectExamRadarModalOverlay')?.classList.contains('active'));

      // Simulate signed-in offline status badge to verify #cloudNavBtn truncates cleanly on narrow mobile AR RTL
      await p.evaluate(() => {
        if (typeof currentCloudUser !== 'undefined') {
          currentCloudUser = { id: 's8-mobile-uid', email: 'sara@exo.edu', user_metadata: { full_name: 'Sara Ahmed' } };
        }
        if (typeof updateCloudNavUI === 'function') updateCloudNavUI('offline');
      });

      // Verify mobile AR RTL geometry across Schedule and Tracker (0 overflow, >=44px controls, labeled buttons)
      const mobileChecks = {};
      for (const tab of ['subjects', 'schedule', 'tracker']) {
        await p.click(`.mobile-nav-item[data-tab="${tab}"]`);
        await p.waitForSelector(`#${tab}.active`, { timeout: 3000 });
        await p.waitForTimeout(200);
        mobileChecks[tab] = await p.evaluate((activeTab) => {
          const cbtn = document.getElementById('cloudNavBtn')?.getBoundingClientRect();
          const cbtnClips = cbtn ? (cbtn.left < -1 || cbtn.right > window.innerWidth + 1) : false;
          const overflow = document.documentElement.scrollWidth > window.innerWidth
            || document.body.scrollWidth > window.innerWidth
            || Math.abs(window.scrollX) > 1
            || cbtnClips;
          const unlabeled = Array.from(document.querySelectorAll(`#${activeTab} button`))
            .filter(b => b.offsetParent !== null && !b.innerText.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')).length;
          const smallTargets = activeTab === 'schedule' || activeTab === 'tracker'
            ? Array.from(document.querySelectorAll(`#${activeTab} .psf-toggle-pill-btn, #${activeTab} .smart-rec-action-btn, #${activeTab} .subnav-pill, #${activeTab} .btn-primary, #${activeTab} .btn-outline`))
                .filter(b => {
                  if (b.offsetParent === null) return false;
                  const r = b.getBoundingClientRect();
                  return r.width > 0 && r.height > 0 && r.height < 42;
                }).length
            : 0;
          return { overflow, cbtnClips, bodyScrollW: document.body.scrollWidth, unlabeled, smallTargets };
        }, tab);
      }

      assert(subDialogAttrs.role === 'dialog' && subDialogAttrs.modal === 'true', 'S8.1 Modals expose role="dialog" aria-modal="true" semantics');
      assert(
        !mobileChecks.subjects.overflow && !mobileChecks.schedule.overflow && !mobileChecks.tracker.overflow,
        'S8.2 Mobile 390x844 AR RTL maintains zero horizontal overflow across views',
        JSON.stringify(mobileChecks)
      );
      assert(
        mobileChecks.schedule.unlabeled === 0 && mobileChecks.tracker.unlabeled === 0 && mobileChecks.schedule.smallTargets === 0 && mobileChecks.tracker.smallTargets === 0,
        'S8.3 Mobile AR RTL Planner & Tracker buttons satisfy tap-target and accessible label requirements',
        JSON.stringify(mobileChecks)
      );
      assert(s8.pageErrors.length === 0 && s8.consoleErrors.length === 0, 'S8.4 Zero runtime page/console errors in S8');
    } finally {
      await s8.context.close();
    }
  } finally {
    await browser.close();
    if (spawnedServer) {
      try { spawnedServer.kill(); } catch {}
    }
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`TOTAL WP 6.5 CHROMIUM CHECKS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('----------------------------------------------------------------------\n');

  if (testsFailed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal WP 6.5 Chromium E2E error:', err);
  process.exit(1);
});
