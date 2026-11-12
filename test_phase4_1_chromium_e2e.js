// ============================================================================
// Exo Academic Platform — Phase 4.1 & 4.2 Real Headless Chromium + IndexedDB E2E Suite
// Category: Browser E2E & Real IndexedDB Verification (with mocked network transport)
// Note: Real PostgreSQL database integration is tested separately in
//       `test_phase4_2_postgres_integration.js`.
//
// Exact Scenarios Verified in Real Chromium + IndexedDB (WorkspaceMediaStore v4):
//   - Scenario A (A.1–A.5): Overlapping Lecture IDs (`101`) Across Accounts (Annotations + PDF Blobs)
//   - Scenario B (B.1–B.3): Login / Pull Race Across Account Switch (`syncWorkspaceOnLogin` aborts on switch)
//   - Scenario C (C.1–C.4): Push / Conflict Merge Race Across Account Switch (`pushWorkspaceToCloud` & `mergeAndApplyCloudConflict`)
//   - Scenario D (D.1–D.5): Failed `annotations` Transaction Keeps Recovery Vault & Recovers Across Real Browser Reload
//   - Scenario E (E.1–E.2): Uncommitted Vault Entry for User A Never Leaks to User B Across Browser Reload
//   - Scenario F (F.1–F.3): Conflicted Key Prefix vs `userId` Metadata Quarantine (`annotations` + `pdfs`)
//   - Scenario G (G.1–G.2): Missing `userId` (`null` / omitted) Metadata Quarantine (`annotations` + `pdfs` + media cache)
//   - Scenario H (H.1–H.3): Legacy Unscoped Record Quarantine (`id="101"`) vs Provenance-Verified Migration (`id="102"`) & Idempotency
//   - Scenario I (I.1–I.5): Foreign Scoped Key (`usr_B::123`) Rejection (`CROSS_ACCOUNT_KEY_VIOLATION`) Across All Read/Write/Delete Paths
//   - Scenario J (J.1–J.2): `getAllAnnotationsMapFromDB()` Failure (`{ ok: false, error }`) Blocks Cloud Push
//   - Scenario K (K.1–K.2): Logout Annotation Flush Failure Aborts `handleCloudSignOut()` & Preserves Session/Dirty Flag
//   - Scenario L (L.1–L.2): Account Switch Automatically Flushes Outgoing Account's `pendingAnnoSaveMap` Before Switching
//   - Scenario M (M.1–M.2): Per-Account Backup Key Consistency (`pharmaAccountWorkspace_<uid>`) Across Save & Offline Pull
//   - Scenario N (N.1–N.2): Conflict Stroke Merge Preserves Distinct Strokes With Identical Tool, Color & Point Count
// ============================================================================

const fs = require('fs');
const http = require('http');
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

async function main() {
  console.log('======================================================================');
  console.log('EXO PHASE 4.1: REAL CHROMIUM + INDEXEDDB E2E VERIFICATION (A - N)');
  console.log('======================================================================\n');

  const spawnedServer = await ensureLocalServerRunning();
  const browser = await chromium.launch(resolveChromiumLaunchOptions());

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof initPdfDB === 'function' && typeof getAllAnnotationsMapFromDB === 'function');
    await page.evaluate(async () => {
      await initPdfDB();
    });

    // ========================================================================
    // TEST A: Overlapping Lecture IDs Across Accounts (Annotations + PDFs)
    // ========================================================================
    console.log('--- TEST A: Overlapping Lecture IDs Across Accounts ---');
    const resA = await page.evaluate(async () => {
      const uidA = 'user-alpha-1111-2222-3333-444455556666';
      const uidB = 'user-beta-9999-8888-7777-666655554444';
      const sharedLecId = '101';

      // Switch to User A
      await handleAuthSessionChange({ id: uidA, email: 'alpha@exo.edu', name: 'Alpha' }, false);
      const ctxA = createAccountOperationContext();

      // Save PDF and annotations for lecture 101 under User A
      const pdfBlobA = new Blob(['%PDF-1.4 ALPHA EXCLUSIVE CONTENT'], { type: 'application/pdf' });
      await saveMediaToDB('pdfs', sharedLecId, pdfBlobA, uidA, ctxA);
      await restoreAllAnnotationsMapToDB({
        [sharedLecId]: { 1: [{ id: 'st_a1', tool: 'pen', color: '#ff0000', points: [{ x: 1, y: 2 }] }] }
      }, uidA, ctxA);

      // Switch to User B
      await handleAuthSessionChange({ id: uidB, email: 'beta@exo.edu', name: 'Beta' }, false);
      const ctxB = createAccountOperationContext();

      // Before User B writes anything, verify User B sees nothing for lecture 101
      const bBeforeMap = await getAllAnnotationsMapFromDB(uidB, ctxB);
      const bBeforePdf = await getMediaFromDB('pdfs', sharedLecId, uidB, ctxB);

      // Save different PDF and annotations for lecture 101 under User B
      const pdfBlobB = new Blob(['%PDF-1.4 BETA DIFFERENT CONTENT'], { type: 'application/pdf' });
      await saveMediaToDB('pdfs', sharedLecId, pdfBlobB, uidB, ctxB);
      await restoreAllAnnotationsMapToDB({
        [sharedLecId]: { 1: [{ id: 'st_b1', tool: 'highlighter', color: '#00ff00', points: [{ x: 9, y: 9 }] }] }
      }, uidB, ctxB);

      const mapB = await getAllAnnotationsMapFromDB(uidB, ctxB);
      const readBlobB = await getMediaFromDB('pdfs', sharedLecId, uidB, ctxB);
      const textB = readBlobB ? await readBlobB.text() : null;

      // Switch back to User A and verify User A's data is untouched
      await handleAuthSessionChange({ id: uidA, email: 'alpha@exo.edu', name: 'Alpha' }, false);
      const ctxA2 = createAccountOperationContext();
      const mapA = await getAllAnnotationsMapFromDB(uidA, ctxA2);
      const readBlobA = await getMediaFromDB('pdfs', sharedLecId, uidA, ctxA2);
      const textA = readBlobA ? await readBlobA.text() : null;

      return {
        bBeforeEmpty: bBeforeMap.ok && Object.keys(bBeforeMap.verifiedMap).length === 0 && bBeforePdf === null,
        mapAOk: mapA.ok,
        mapBOk: mapB.ok,
        strokeA: mapA.verifiedMap[sharedLecId]?.[1]?.[0]?.id,
        strokeB: mapB.verifiedMap[sharedLecId]?.[1]?.[0]?.id,
        textA,
        textB
      };
    });
    assert(resA.bBeforeEmpty === true, 'Test A.1: User B sees zero annotations and zero PDFs from User A for overlapping lecture 101');
    assert(resA.mapAOk && resA.strokeA === 'st_a1', 'Test A.2: User A getAllAnnotationsMapFromDB returns only User A stroke (st_a1)');
    assert(resA.mapBOk && resA.strokeB === 'st_b1', 'Test A.3: User B getAllAnnotationsMapFromDB returns only User B stroke (st_b1)');
    assert(resA.textA === '%PDF-1.4 ALPHA EXCLUSIVE CONTENT', 'Test A.4: User A getMediaFromDB returns only User A PDF blob');
    assert(resA.textB === '%PDF-1.4 BETA DIFFERENT CONTENT', 'Test A.5: User B getMediaFromDB returns only User B PDF blob');

    // ========================================================================
    // TEST B: Login / Pull Race Across Account Switch
    // ========================================================================
    console.log('\n--- TEST B: Login / Pull Race Across Account Switch ---');
    const resB = await page.evaluate(async () => {
      const uidA = 'user-race-a-1111';
      const uidB = 'user-race-b-2222';

      await handleAuthSessionChange({ id: uidA, email: 'race_a@exo.edu', name: 'Race A' }, false);
      const ctxA = createAccountOperationContext();

      // Mock delayed Supabase response for User A
      let resolveNetworkA;
      const origClient = supabaseClient;
      const origOnLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      supabaseClient = {
        from: () => ({
          select: () => ({
            eq: (col, val) => ({
              maybeSingle: () => new Promise((resolve) => {
                resolveNetworkA = () => resolve({
                  error: null,
                  data: {
                    user_id: uidA,
                    subjects: [{ id: 'sub_leaked_from_A', name: 'Leaked Subject A', groups: [] }],
                    annotations: { '909': { 1: [{ id: 'leaked_stroke_a', tool: 'pen', points: [{ x: 1, y: 1 }] }] } },
                    updated_at: new Date().toISOString()
                  }
                });
              })
            })
          })
        })
      };

      // Start User A's login sync (in-flight)
      const syncPromiseA = syncWorkspaceOnLogin(ctxA);

      // Wait a tick so syncWorkspaceOnLogin enters the network await
      await new Promise(r => setTimeout(r, 30));

      // Now switch to User B BEFORE User A's network response arrives!
      supabaseClient = null; // Disable network for B so B initializes cleanly from local state
      await handleAuthSessionChange({ id: uidB, email: 'race_b@exo.edu', name: 'Race B' }, false);
      subjects = [{ id: 'sub_belonging_to_B', name: 'Subject B', groups: [] }];
      localStorage.setItem('pharmaSubjectsV4', JSON.stringify(subjects));

      // Now resolve User A's delayed network response while User B is active!
      resolveNetworkA();
      const syncResultA = await syncPromiseA;

      const ctxB = createAccountOperationContext();
      const bAnnos = await getAllAnnotationsMapFromDB(uidB, ctxB);

      // Restore original globals
      supabaseClient = origClient;
      if (origOnLine) Object.defineProperty(Navigator.prototype, 'onLine', origOnLine);

      return {
        syncResultA,
        activeUserId: currentCloudUser?.id,
        currentSubjectsIds: subjects.map(s => s.id),
        bHasLeakedAnno: Boolean(bAnnos.verifiedMap && bAnnos.verifiedMap['909'])
      };
    });
    assert(resB.syncResultA && resB.syncResultA.status === 'aborted' && resB.syncResultA.reason === 'account_switched',
           'Test B.1: In-flight syncWorkspaceOnLogin for User A aborts when account switches to User B');
    assert(resB.currentSubjectsIds.length === 1 && resB.currentSubjectsIds[0] === 'sub_belonging_to_B',
           'Test B.2: User A delayed payload never overwrites User B active subjects');
    assert(resB.bHasLeakedAnno === false,
           'Test B.3: User A delayed payload never writes annotations into User B IndexedDB scope');

    // ========================================================================
    // TEST C: Push / Conflict Merge Race Across Account Switch
    // ========================================================================
    console.log('\n--- TEST C: Push / Conflict Merge Race Across Account Switch ---');
    const resC = await page.evaluate(async () => {
      const uidA = 'user-push-a-1111';
      const uidB = 'user-push-b-2222';

      await handleAuthSessionChange({ id: uidA, email: 'push_a@exo.edu', name: 'Push A' }, false);
      const ctxA = createAccountOperationContext();
      subjects = [{ id: 'sub_push_a', name: 'Push A Sub', groups: [] }];

      let resolveRpcA;
      const origClient = supabaseClient;
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      supabaseClient = {
        rpc: () => new Promise((resolve) => {
          resolveRpcA = () => resolve({
            data: { status: 'conflict', current_revision: 99 },
            error: null
          });
        }),
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  user_id: uidA,
                  revision: 99,
                  subjects: [{ id: 'remote_conflict_a', name: 'Remote Conflict A', groups: [] }],
                  annotations: { '707': { 1: [{ id: 'conflict_stroke_a', tool: 'pen', points: [{ x: 5, y: 5 }] }] } }
                },
                error: null
              })
            })
          })
        })
      };

      // Start User A pushWorkspaceToCloud
      const pushPromiseA = pushWorkspaceToCloud(false, false, ctxA);
      await new Promise(r => setTimeout(r, 30));

      // Switch to User B while User A's RPC is in flight
      supabaseClient = null;
      await handleAuthSessionChange({ id: uidB, email: 'push_b@exo.edu', name: 'Push B' }, false);
      subjects = [{ id: 'sub_push_b_intact', name: 'Push B Sub', groups: [] }];

      // Simulate User B starting a sync state flag
      isCloudSyncing = true;

      // Resolve User A's RPC response now that User B is active
      resolveRpcA();
      const pushResA = await pushPromiseA;

      // Also test direct mergeAndApplyCloudConflict with stale ctxA
      const directMergeRes = await mergeAndApplyCloudConflict({
        user_id: uidA,
        revision: 100,
        subjects: [{ id: 'should_not_apply', name: 'Bad' }],
        annotations: { '808': { 1: [{ id: 'bad_stroke', tool: 'pen', points: [] }] } }
      }, { user_id: uidA, subjects: [] }, ctxA);

      const bSyncFlagStillTrue = isCloudSyncing;
      isCloudSyncing = false;
      supabaseClient = origClient;

      return {
        pushResA,
        directMergeRes,
        bSubjects: subjects.map(s => s.id),
        bSyncFlagStillTrue
      };
    });
    assert(resC.pushResA && resC.pushResA.status === 'aborted' && resC.pushResA.reason === 'account_switched',
           'Test C.1: In-flight pushWorkspaceToCloud for User A aborts after switching to User B');
    assert(resC.directMergeRes && resC.directMergeRes.ok === false,
           'Test C.2: mergeAndApplyCloudConflict rejects stale Account A context');
    assert(resC.bSubjects.length === 1 && resC.bSubjects[0] === 'sub_push_b_intact',
           'Test C.3: User B subjects remain intact after User A conflict response resolves');
    assert(resC.bSyncFlagStillTrue === true,
           'Test C.4: User A finishing push finally-block does NOT clear User B isCloudSyncing state');

    // ========================================================================
    // TEST D: Failed `annotations` Transaction Keeps Recovery Vault + Reload Recovery
    // ========================================================================
    console.log('\n--- TEST D: Failed annotations Transaction Keeps Recovery Vault & Reloads ---');
    const resD_BeforeReload = await page.evaluate(async () => {
      const uidA = 'user-vault-a-1111';
      const sessionA = { id: uidA, email: 'vault_a@exo.edu', name: 'Vault A' };
      localStorage.setItem('pharmaActiveAccountSessionV1', JSON.stringify(sessionA));
      await handleAuthSessionChange(sessionA, false);

      // Stage uncommitted stroke in pendingAnnoSaveMap
      pendingAnnoSaveMap['lec_vault_d'] = {
        1: [{ id: 'vault_stroke_d1', tool: 'pen', color: '#123456', points: [{ x: 11, y: 22 }, { x: 33, y: 44 }] }]
      };

      // Monkeypatch dbInstance.transaction so annotation_recovery_vault succeeds,
      // but the subsequent 'annotations' readwrite transaction aborts!
      const origTx = dbInstance.transaction.bind(dbInstance);
      let failAnnotationsOnce = true;
      dbInstance.transaction = function(storeNames, mode) {
        const tx = origTx(storeNames, mode);
        if (failAnnotationsOnce && storeNames === 'annotations' && mode === 'readwrite') {
          failAnnotationsOnce = false;
          const origObjectStore = tx.objectStore.bind(tx);
          tx.objectStore = function(name) {
            const store = origObjectStore(name);
            store.put = function() {
              try { tx.abort(); } catch (e) {}
            };
            return store;
          };
        }
        return tx;
      };

      const flushResult = await flushPendingAnnotationsSave(false);
      dbInstance.transaction = origTx; // Restore normal transaction

      // Verify pendingAnnoSaveMap still has lec_vault_d AND annotation_recovery_vault has usr_<A>::lec_vault_d
      const scopedVaultKey = toScopedKey('lec_vault_d', uidA);
      const vaultRecord = await new Promise((resolve) => {
        const vTx = dbInstance.transaction('annotation_recovery_vault', 'readonly');
        const req = vTx.objectStore('annotation_recovery_vault').get(scopedVaultKey);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });

      return {
        flushResult,
        pendingStillHasKey: Boolean(pendingAnnoSaveMap['lec_vault_d']),
        vaultRecordPresent: Boolean(vaultRecord && vaultRecord.id === scopedVaultKey && vaultRecord.userId === uidA)
      };
    });
    assert(resD_BeforeReload.flushResult === false, 'Test D.1: flushPendingAnnotationsSave returns false when annotations transaction aborts');
    assert(resD_BeforeReload.pendingStillHasKey === true, 'Test D.2: pendingAnnoSaveMap retains uncommitted lecture when annotations transaction fails');
    assert(resD_BeforeReload.vaultRecordPresent === true, 'Test D.3: annotation_recovery_vault preserves uncommitted record in real IndexedDB');

    // Now perform a REAL browser reload and verify initPdfDB() + recoverUncommittedAnnotations() recovers it!
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof initPdfDB === 'function');
    const resD_AfterReload = await page.evaluate(async () => {
      const uidA = 'user-vault-a-1111';
      await handleAuthSessionChange({ id: uidA, email: 'vault_a@exo.edu', name: 'Vault A' }, false);
      await initPdfDB();
      await recoverUncommittedAnnotations(createAccountOperationContext());

      const recoveredAnnos = await getAnnotationsFromDB('lec_vault_d', uidA);
      const scopedVaultKey = toScopedKey('lec_vault_d', uidA);
      const remainingVaultRecord = await new Promise((resolve) => {
        const vTx = dbInstance.transaction('annotation_recovery_vault', 'readonly');
        const req = vTx.objectStore('annotation_recovery_vault').get(scopedVaultKey);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });

      return {
        recoveredStrokeId: recoveredAnnos?.[1]?.[0]?.id || null,
        vaultCleanedUp: remainingVaultRecord === null
      };
    });
    assert(resD_AfterReload.recoveredStrokeId === 'vault_stroke_d1',
           'Test D.4: After browser reload, recoverUncommittedAnnotations restores uncommitted strokes into annotations store');
    assert(resD_AfterReload.vaultCleanedUp === true,
           'Test D.5: Committed vault entry for User A is cleaned up from annotation_recovery_vault after successful recovery');

    // ========================================================================
    // TEST E: Vault Entry for User A Does Not Leak to User B Across Reload
    // ========================================================================
    console.log('\n--- TEST E: Vault Entry for User A Does Not Leak to User B ---');
    await page.evaluate(async () => {
      const uidA = 'user-vault-a-1111';
      const uidB = 'user-vault-b-2222';
      await initPdfDB();
      const scopedKeyA = toScopedKey('lec_vault_e_secret', uidA);

      // Write an uncommitted entry for User A directly into annotation_recovery_vault
      await new Promise((resolve, reject) => {
        const tx = dbInstance.transaction('annotation_recovery_vault', 'readwrite');
        tx.objectStore('annotation_recovery_vault').put({
          id: scopedKeyA,
          rawId: 'lec_vault_e_secret',
          userId: uidA,
          pages: { 1: [{ id: 'secret_a_vault_stroke', tool: 'pen', color: '#000', points: [{ x: 7, y: 8 }] }] },
          timestamp: Date.now()
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });

      // Set active session in localStorage to User B before reload
      const sessionB = { id: uidB, email: 'vault_b@exo.edu', name: 'Vault B' };
      localStorage.setItem('pharmaActiveAccountSessionV1', JSON.stringify(sessionB));
    });

    // Reload browser while User B is the active session
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof initPdfDB === 'function');
    const resE = await page.evaluate(async () => {
      const uidA = 'user-vault-a-1111';
      const uidB = 'user-vault-b-2222';
      await handleAuthSessionChange({ id: uidB, email: 'vault_b@exo.edu', name: 'Vault B' }, false);
      await initPdfDB();
      await recoverUncommittedAnnotations(createAccountOperationContext());

      // Check if User B can see lec_vault_e_secret
      const bRead = await getAnnotationsFromDB('lec_vault_e_secret', uidB);
      const bMap = await getAllAnnotationsMapFromDB(uidB);

      // Check that User A's vault record was NOT wiped by vStore.clear() and is recoverable by User A
      await handleAuthSessionChange({ id: uidA, email: 'vault_a@exo.edu', name: 'Vault A' }, false);
      await recoverUncommittedAnnotations(createAccountOperationContext());
      const aRead = await getAnnotationsFromDB('lec_vault_e_secret', uidA);

      return {
        bReadEmpty: Object.keys(bRead).length === 0,
        bMapHasLeak: Boolean(bMap.verifiedMap && bMap.verifiedMap['lec_vault_e_secret']),
        aRecoveredStrokeId: aRead?.[1]?.[0]?.id || null
      };
    });
    assert(resE.bReadEmpty === true && resE.bMapHasLeak === false,
           'Test E.1: User A uncommitted vault entry never leaks into User B session on reload');
    assert(resE.aRecoveredStrokeId === 'secret_a_vault_stroke',
           'Test E.2: User A uncommitted vault entry is preserved (never wiped by User B reload) and recovered when User A logs in');

    // ========================================================================
    // TEST F: Conflicted Key vs userId Quarantine
    // ========================================================================
    console.log('\n--- TEST F: Conflicted Key vs userId Quarantine ---');
    const resF = await page.evaluate(async () => {
      const uidA = 'user-conf-a-1111';
      const uidB = 'user-conf-b-2222';

      // Inject conflicted records into annotations and pdfs stores
      await new Promise((resolve) => {
        const tx = dbInstance.transaction(['annotations', 'pdfs'], 'readwrite');
        tx.objectStore('annotations').put({
          id: `usr_${uidA}::conf_lec_1`,
          rawId: 'conf_lec_1',
          userId: uidB, // MISMATCH!
          pages: { 1: [{ id: 'bad_1', tool: 'pen', points: [] }] }
        });
        tx.objectStore('annotations').put({
          id: `usr_${uidB}::conf_lec_2`,
          rawId: 'conf_lec_2',
          userId: uidA, // MISMATCH!
          pages: { 1: [{ id: 'bad_2', tool: 'pen', points: [] }] }
        });
        tx.objectStore('pdfs').put({
          id: `usr_${uidA}::conf_pdf_1`,
          rawId: 'conf_pdf_1',
          userId: uidB, // MISMATCH!
          blob: new Blob(['bad pdf'], { type: 'application/pdf' })
        });
        tx.oncomplete = () => resolve(true);
      });

      await handleAuthSessionChange({ id: uidA, email: 'conf_a@exo.edu', name: 'Conf A' }, false);
      const mapA = await getAllAnnotationsMapFromDB(uidA);
      const singleAnnoA = await getAnnotationsFromDB('conf_lec_1', uidA);
      const mediaA = await getMediaFromDB('pdfs', 'conf_pdf_1', uidA);

      await handleAuthSessionChange({ id: uidB, email: 'conf_b@exo.edu', name: 'Conf B' }, false);
      const mapB = await getAllAnnotationsMapFromDB(uidB);
      const singleAnnoB = await getAnnotationsFromDB('conf_lec_2', uidB);

      return {
        aHasConf1: Boolean(mapA.verifiedMap['conf_lec_1'] || mapA.verifiedMap['conf_lec_2']),
        bHasConf2: Boolean(mapB.verifiedMap['conf_lec_1'] || mapB.verifiedMap['conf_lec_2']),
        singleAnnoAEmpty: Object.keys(singleAnnoA).length === 0,
        singleAnnoBEmpty: Object.keys(singleAnnoB).length === 0,
        mediaANull: mediaA === null,
        quarantinedCountA: mapA.quarantined.length
      };
    });
    assert(resF.aHasConf1 === false && resF.bHasConf2 === false,
           'Test F.1: Conflicted key/userId records (usr_A with userId=B and usr_B with userId=A) are quarantined from getAllAnnotationsMapFromDB');
    assert(resF.singleAnnoAEmpty === true && resF.singleAnnoBEmpty === true,
           'Test F.2: getAnnotationsFromDB quarantines conflicted records and returns {}');
    assert(resF.mediaANull === true,
           'Test F.3: getMediaFromDB quarantines conflicted PDF blob and returns null');

    // ========================================================================
    // TEST G: Missing userId Metadata Quarantine
    // ========================================================================
    console.log('\n--- TEST G: Missing userId Metadata Quarantine ---');
    const resG = await page.evaluate(async () => {
      const uidA = 'user-nouid-a-1111';
      await handleAuthSessionChange({ id: uidA, email: 'nouid_a@exo.edu', name: 'NoUid A' }, false);

      await new Promise((resolve) => {
        const tx = dbInstance.transaction(['annotations', 'pdfs'], 'readwrite');
        tx.objectStore('annotations').put({
          id: `usr_${uidA}::missing_uid_99`,
          rawId: 'missing_uid_99',
          userId: null, // MISSING userId!
          pages: { 1: [{ id: 'orphan_stroke', tool: 'pen', points: [] }] }
        });
        tx.objectStore('pdfs').put({
          id: `usr_${uidA}::missing_uid_99`,
          rawId: 'missing_uid_99',
          // userId omitted completely
          blob: new Blob(['orphan pdf'], { type: 'application/pdf' })
        });
        tx.oncomplete = () => resolve(true);
      });

      const mapA = await getAllAnnotationsMapFromDB(uidA);
      const annoRead = await getAnnotationsFromDB('missing_uid_99', uidA);
      const pdfRead = await getMediaFromDB('pdfs', 'missing_uid_99', uidA);
      await refreshLocalMediaCache();

      return {
        inVerifiedMap: Boolean(mapA.verifiedMap['missing_uid_99']),
        inQuarantined: mapA.quarantined.some(q => q.key === `usr_${uidA}::missing_uid_99`),
        annoReadEmpty: Object.keys(annoRead).length === 0,
        pdfReadNull: pdfRead === null,
        inMediaCache: localMediaCache.pdfs.has('missing_uid_99')
      };
    });
    assert(resG.inVerifiedMap === false && resG.inQuarantined === true,
           'Test G.1: Scoped record with missing userId is quarantined in getAllAnnotationsMapFromDB');
    assert(resG.annoReadEmpty === true && resG.pdfReadNull === true && resG.inMediaCache === false,
           'Test G.2: Records with missing userId are rejected by getAnnotationsFromDB, getMediaFromDB, and refreshLocalMediaCache');

    // ========================================================================
    // TEST H: Legacy Unscoped Record Quarantine & Provenance Migration
    // ========================================================================
    console.log('\n--- TEST H: Legacy Unscoped Record Quarantine & Provenance Migration ---');
    const resH = await page.evaluate(async () => {
      const uidB = 'user-legacy-b-2222';
      await handleAuthSessionChange({ id: uidB, email: 'legacy_b@exo.edu', name: 'Legacy B' }, false);

      // User B has lecture "101" and "102" in their active workspace subjects
      subjects = [{
        id: 'sub_leg',
        name: 'Legacy Sub',
        groups: [{ id: 'grp_leg', name: 'G1', lectures: [{ id: '101', title: 'L101' }, { id: '102', title: 'L102' }] }]
      }];

      // Inject:
      // 1) Anonymous unscoped record id="101" (NO userId) -> MUST BE QUARANTINED!
      // 2) Provenance-verified legacy record id="102" (userId = uidB) -> MUST BE MIGRATED!
      await new Promise((resolve) => {
        const tx = dbInstance.transaction('annotations', 'readwrite');
        tx.objectStore('annotations').put({
          id: '101',
          rawId: '101',
          pages: { 1: [{ id: 'anon_legacy_stroke', tool: 'pen', points: [] }] }
        });
        tx.objectStore('annotations').put({
          id: '102',
          rawId: '102',
          userId: uidB,
          pages: { 1: [{ id: 'verified_legacy_stroke', tool: 'pen', points: [{ x: 1, y: 1 }] }] }
        });
        tx.oncomplete = () => resolve(true);
      });

      const migRun1 = await claimAndMigrateLegacyRecords(uidB);
      const migRun2 = await claimAndMigrateLegacyRecords(uidB); // Test idempotency!

      const read101 = await getAnnotationsFromDB('101', uidB);
      const read102 = await getAnnotationsFromDB('102', uidB);

      return {
        migRun1,
        migRun2,
        read101Empty: Object.keys(read101).length === 0,
        read102Recovered: read102?.[1]?.[0]?.id === 'verified_legacy_stroke'
      };
    });
    assert(resH.read101Empty === true,
           'Test H.1: Anonymous unscoped record id="101" is strictly quarantined even when lecture 101 exists in User B subjects');
    assert(resH.read102Recovered === true && resH.migRun1.success === true && resH.migRun1.migratedCount >= 1,
           'Test H.2: Legacy record with explicit userId provenance is safely migrated to usr_<B>::102');
    assert(resH.migRun2.success === true && resH.migRun2.migratedCount === 0,
           'Test H.3: claimAndMigrateLegacyRecords is strictly idempotent on repeated execution');

    // ========================================================================
    // TEST I: Foreign Scoped Key Rejection Across All Read/Write/Delete Paths
    // ========================================================================
    console.log('\n--- TEST I: Foreign Scoped Key Rejection ---');
    const resI = await page.evaluate(async () => {
      const uidA = 'user-foreign-a-1111';
      const uidB = 'user-foreign-b-2222';

      // First create a legitimate PDF and annotation for User B under usr_<B>::123
      await handleAuthSessionChange({ id: uidB, email: 'fb@exo.edu', name: 'FB' }, false);
      await saveMediaToDB('pdfs', '123', new Blob(['User B Protected PDF'], { type: 'application/pdf' }), uidB);
      await restoreAllAnnotationsMapToDB({ '123': { 1: [{ id: 'b_stroke_123', tool: 'pen', points: [] }] } }, uidB);

      // Now switch to User A and attempt to access/overwrite/delete `usr_${uidB}::123`
      await handleAuthSessionChange({ id: uidA, email: 'fa@exo.edu', name: 'FA' }, false);
      const foreignKey = `usr_${uidB}::123`;

      let toScopedThrew = false;
      try { toScopedKey(foreignKey, uidA); } catch (e) { toScopedThrew = e.message.includes('CROSS_ACCOUNT_KEY_VIOLATION'); }

      let resolveScopedThrew = false;
      try { resolveAuthorizedScopedKey(foreignKey, uidA); } catch (e) { resolveScopedThrew = e.message.includes('CROSS_ACCOUNT_KEY_VIOLATION'); }

      const restoreForeignRes = await restoreAllAnnotationsMapToDB({
        [foreignKey]: { 1: [{ id: 'hijack', tool: 'pen', points: [] }] }
      }, uidA);

      const saveAnnoRes = saveAnnotationsToDB(foreignKey, { 1: [{ id: 'hijack2', tool: 'pen', points: [] }] }, null);
      const getAnnoForeign = await getAnnotationsFromDB(foreignKey, uidA);
      const saveMediaRes = await saveMediaToDB('pdfs', foreignKey, new Blob(['Hijack']), uidA);
      const getMediaForeign = await getMediaFromDB('pdfs', foreignKey, uidA);
      const deleteMediaRes = await deleteMediaFromDB('pdfs', foreignKey, uidA);

      // Check that User A did NOT create `usr_${uidA}::123` and User B's `usr_${uidB}::123` is still intact!
      const aCreated123 = await getAnnotationsFromDB('123', uidA);
      await handleAuthSessionChange({ id: uidB, email: 'fb@exo.edu', name: 'FB' }, false);
      const bPdfStillIntact = await getMediaFromDB('pdfs', '123', uidB);
      const bPdfText = bPdfStillIntact ? await bPdfStillIntact.text() : null;

      return {
        toScopedThrew: toScopedThrew && resolveScopedThrew,
        restoreForeignRejected: restoreForeignRes.ok === false && restoreForeignRes.error?.code === 'CROSS_ACCOUNT_KEY_VIOLATION',
        saveAnnoThrew: saveAnnoRes === false,
        getAnnoForeignEmpty: Object.keys(getAnnoForeign).length === 0,
        saveMediaThrew: saveMediaRes === false,
        getMediaForeignNull: getMediaForeign === null,
        deleteMediaThrew: deleteMediaRes === false,
        aCreated123Empty: Object.keys(aCreated123).length === 0,
        bPdfText
      };
    });
    assert(resI.toScopedThrew === true, 'Test I.1: toScopedKey throws CROSS_ACCOUNT_KEY_VIOLATION on foreign key usr_B::123');
    assert(resI.restoreForeignRejected === true && resI.aCreated123Empty === true,
           'Test I.2: restoreAllAnnotationsMapToDB rejects usr_B::123 without converting it to usr_A::123');
    assert(resI.saveAnnoThrew === true && resI.getAnnoForeignEmpty === true,
           'Test I.3: saveAnnotationsToDB and getAnnotationsFromDB reject foreign scoped key usr_B::123');
    assert(resI.saveMediaThrew === true && resI.getMediaForeignNull === true && resI.deleteMediaThrew === true,
           'Test I.4: saveMediaToDB, getMediaFromDB, and deleteMediaFromDB reject foreign scoped key usr_B::123');
    assert(resI.bPdfText === 'User B Protected PDF',
           'Test I.5: User B PDF blob remains 100% intact after rejected foreign delete attempt');

    // ========================================================================
    // TEST J: getAllAnnotationsMapFromDB() Failure Blocks Cloud Push
    // ========================================================================
    console.log('\n--- TEST J: getAllAnnotationsMapFromDB() Failure Blocks Cloud Push ---');
    const resJ = await page.evaluate(async () => {
      const uidA = 'user-db-err-a-1111';
      await handleAuthSessionChange({ id: uidA, email: 'dberr@exo.edu', name: 'DB Err' }, false);

      let rpcCalled = false;
      const origClient = supabaseClient;
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      supabaseClient = {
        rpc: async () => {
          rpcCalled = true;
          return { data: { status: 'success', revision: 2 }, error: null };
        }
      };

      // Temporarily simulate dbInstance = null to trigger DB_NOT_INITIALIZED error in getAllAnnotationsMapFromDB
      const savedDb = dbInstance;
      dbInstance = null;

      const directReadRes = await getAllAnnotationsMapFromDB(uidA);
      const pushRes = await pushWorkspaceToCloud(true, true);

      dbInstance = savedDb;
      supabaseClient = origClient;

      return {
        directReadRes,
        pushRes,
        rpcCalled
      };
    });
    assert(resJ.directReadRes.ok === false && resJ.directReadRes.error?.code === 'DB_NOT_INITIALIZED',
           'Test J.1: getAllAnnotationsMapFromDB returns { ok: false, error } when DB read cannot be performed');
    assert(resJ.pushRes.status === 'error' && resJ.pushRes.error === 'LOCAL_ANNOTATIONS_READ_ERROR' && resJ.rpcCalled === false,
           'Test J.2: pushWorkspaceToCloud immediately aborts and never calls Supabase RPC when local annotation read fails');

    // ========================================================================
    // TEST K: Logout Flush Failure Aborts Logout
    // ========================================================================
    console.log('\n--- TEST K: Logout Flush Failure Aborts Logout ---');
    const resK = await page.evaluate(async () => {
      const uidA = 'user-logout-a-1111';
      await handleAuthSessionChange({ id: uidA, email: 'logout_a@exo.edu', name: 'Logout A' }, false);
      localStorage.setItem('pharmaWorkspaceDirty', '1');
      pendingAnnoSaveMap['lec_logout_k'] = { 1: [{ id: 'st_k', tool: 'pen', points: [{ x: 1, y: 1 }] }] };

      // Force flushPendingAnnotationsSave to fail by temporarily setting dbInstance = null
      const savedDb = dbInstance;
      dbInstance = null;

      const signOutRes = await handleCloudSignOut(true);

      dbInstance = savedDb;
      // Clean up pending map by flushing now that DB is restored
      await flushPendingAnnotationsSave(false);

      return {
        signOutRes,
        stillLoggedInAsA: currentCloudUser && currentCloudUser.id === uidA,
        dirtyPreserved: localStorage.getItem('pharmaWorkspaceDirty') === '1'
      };
    });
    assert(resK.signOutRes.success === false && resK.signOutRes.reason === 'flush_failed',
           'Test K.1: handleCloudSignOut aborts and returns { success: false, reason: "flush_failed" } when annotation flush fails');
    assert(resK.stillLoggedInAsA === true && resK.dirtyPreserved === true,
           'Test K.2: Active user session and dirty flag are preserved when logout is aborted');

    // ========================================================================
    // TEST L: Account Switch Flushes Pending Annotations Before Switching
    // ========================================================================
    console.log('\n--- TEST L: Account Switch Flushes Pending Annotations Before Switching ---');
    const resL = await page.evaluate(async () => {
      const uidA = 'user-switch-flush-a';
      const uidB = 'user-switch-flush-b';

      await handleAuthSessionChange({ id: uidA, email: 'swa@exo.edu', name: 'SWA' }, false);
      // Queue uncommitted stroke for User A without calling flushPendingAnnotationsSave manually
      pendingAnnoSaveMap['lec_switch_l'] = {
        1: [{ id: 'stroke_flushed_on_switch', tool: 'pen', color: '#abcdef', points: [{ x: 42, y: 42 }] }]
      };

      // Immediately switch to User B
      await handleAuthSessionChange({ id: uidB, email: 'swb@exo.edu', name: 'SWB' }, false);
      const pendingDuringB = Object.keys(pendingAnnoSaveMap).length;
      const bReadLecL = await getAnnotationsFromDB('lec_switch_l', uidB);

      // Switch back to User A and verify stroke_flushed_on_switch was saved to IndexedDB under User A!
      await handleAuthSessionChange({ id: uidA, email: 'swa@exo.edu', name: 'SWA' }, false);
      const aReadLecL = await getAnnotationsFromDB('lec_switch_l', uidA);

      return {
        pendingDuringB,
        bReadEmpty: Object.keys(bReadLecL).length === 0,
        aSavedStrokeId: aReadLecL?.[1]?.[0]?.id || null
      };
    });
    assert(resL.pendingDuringB === 0 && resL.bReadEmpty === true,
           'Test L.1: Switching from User A to User B leaves zero pending strokes in User B session');
    assert(resL.aSavedStrokeId === 'stroke_flushed_on_switch',
           'Test L.2: User A pending strokes were automatically flushed and committed under usr_<A>::lec_switch_l before account switch completed');

    // ========================================================================
    // TEST M: Backup Key Consistency (pharmaAccountWorkspace_<uid>)
    // ========================================================================
    console.log('\n--- TEST M: Backup Key Consistency ---');
    const resM = await page.evaluate(async () => {
      const uidA = 'user-backup-uid-7777';
      const emailA = 'student_m@university.edu';

      await handleAuthSessionChange({ id: uidA, email: emailA, name: 'Student M' }, false);
      subjects = [{ id: 'sub_m_backup', name: 'Backup Consistency Subject', groups: [] }];
      await restoreAllAnnotationsMapToDB({
        'lec_m1': { 1: [{ id: 'st_m1', tool: 'pen', points: [{ x: 3, y: 4 }] }] }
      }, uidA);

      // Perform offline pushWorkspaceToCloud to write per-account local backup
      const origClient = supabaseClient;
      supabaseClient = null;
      await pushWorkspaceToCloud(false, true);

      const expectedKey = `pharmaAccountWorkspace_${uidA}`;
      const wrongEmailKey = `pharmaAccountWorkspace_${emailA}`;
      const hasUidKey = localStorage.getItem(expectedKey) !== null;
      const hasWrongEmailKey = localStorage.getItem(wrongEmailKey) !== null;

      // Clear subjects in memory, then call pullWorkspaceFromCloud() offline to verify it reads from expectedKey
      subjects = [];
      await pullWorkspaceFromCloud(false);
      const restoredSubId = subjects?.[0]?.id || null;

      supabaseClient = origClient;
      return {
        hasUidKey,
        hasWrongEmailKey,
        restoredSubId
      };
    });
    assert(resM.hasUidKey === true && resM.hasWrongEmailKey === false,
           'Test M.1: Per-account local backup uses canonical UID key (pharmaAccountWorkspace_<uid>) and never email');
    assert(resM.restoredSubId === 'sub_m_backup',
           'Test M.2: Offline pullWorkspaceFromCloud restores workspace from pharmaAccountWorkspace_<uid>');

    // ========================================================================
    // TEST N: Stroke Merge Without False Deduplication
    // ========================================================================
    console.log('\n--- TEST N: Stroke Merge Without False Deduplication ---');
    const resN = await page.evaluate(async () => {
      const uidA = 'user-merge-strokes-a';
      await handleAuthSessionChange({ id: uidA, email: 'merge@exo.edu', name: 'Merge A' }, false);
      const ctxA = createAccountOperationContext();

      // Local stroke on page 1: pen, #ff0000, 3 points at (10,10)-(20,20)-(30,30)
      await restoreAllAnnotationsMapToDB({
        'lec_merge_n': {
          1: [{ tool: 'pen', color: '#ff0000', size: 2, points: [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 }] }]
        }
      }, uidA, ctxA);

      // Remote conflict row has ANOTHER stroke on page 1 with the SAME tool ('pen'), SAME color ('#ff0000'),
      // and SAME points.length (3), but different coordinates (100,100)-(200,200)-(300,300)!
      const remoteRow = {
        user_id: uidA,
        revision: 5,
        subjects: [],
        schedule: {},
        logs: [],
        annotations: {
          'lec_merge_n': {
            1: [{ tool: 'pen', color: '#ff0000', size: 2, points: [{ x: 100, y: 100 }, { x: 200, y: 200 }, { x: 300, y: 300 }] }]
          }
        }
      };

      const mergeRes = await mergeAndApplyCloudConflict(remoteRow, { user_id: uidA, subjects: [] }, ctxA);
      const afterMap = await getAllAnnotationsMapFromDB(uidA, ctxA);
      const mergedStrokes = afterMap.verifiedMap?.['lec_merge_n']?.[1] || [];

      return {
        mergeOk: mergeRes && mergeRes.ok === true,
        strokeCount: mergedStrokes.length,
        firstPointX0: mergedStrokes[0]?.points?.[0]?.x,
        secondPointX0: mergedStrokes[1]?.points?.[0]?.x
      };
    });
    assert(resN.mergeOk === true && resN.strokeCount === 2,
           'Test N.1: mergeAndApplyCloudConflict preserves BOTH strokes when tool, color, and point count match but coordinates differ');
    assert(resN.firstPointX0 === 10 && resN.secondPointX0 === 100,
           'Test N.2: Both distinct stroke geometries ((10,10) and (100,100)) are intact in IndexedDB after conflict merge');

    // ========================================================================
    // TEST O (T-5.1-01): Sign-Out Global Workspace Sanitization, Reload & Recovery
    // ========================================================================
    console.log('\n--- TEST O (T-5.1-01): Sign-Out Global Workspace Sanitization, Reload & Recovery ---');
    await page.evaluate(async () => {
      const uidA = 'user-m1-e2e-a';
      supabaseClient = null;
      await handleAuthSessionChange({ id: uidA, email: 'm1_a@exo.edu', name: 'M1 User A' }, false);
      localStorage.setItem('pharmaLastActiveCloudUid', uidA);
      localStorage.setItem('pharmaLastActiveUserIdV1', uidA);

      subjects = [{ id: 'sub_e2e_a1', name: 'Medicinal Chemistry E2E', groups: [] }];
      localStorage.setItem('pharmaSubjectsV4', JSON.stringify(subjects));
      const curWeekStart1 = getLocalIsoDate(getWeekStartDateForDate(new Date(), 1));
      scheduleEvents = [{ id: 'ev_e2e_a1', title: 'E2E Study Session', day: 6, startHour: 10, duration: 2, isFixed: true }];
      scheduleBacklog = [{ id: 'bl_e2e_a1', title: 'E2E Backlog Item' }];
      weeklyReports = [{ id: 'rep_e2e_a1', weekStartIso: '2026-10-31', score: 90 }];
      plannerPrefs = { weekStartDay: 1, dayStartHour: 7, dayEndHour: 22, autoCompletePct: 80, currentWeekStartIso: curWeekStart1 };
      saveScheduleData(false);
      logs = [{ id: 'log_e2e_a1', text: 'E2E Log Entry', timestamp: 1700000100 }];
      localStorage.setItem('pharmaLogsV4', JSON.stringify(logs));
      completedAcademyModules = ['mod_e2e_1', 'mod_e2e_2'];
      localStorage.setItem('pharmaAcademyProgressV1', JSON.stringify(completedAcademyModules));
      cloudMediaRegistry = { 'lec_e2e_1': { pdfUploaded: true, ownerUid: uidA } };
      saveCloudMediaRegistry();
      localStorage.setItem('pharmaWorkspaceDirty', '1');

      await handleCloudSignOut(true);
    });

    // Perform real browser page reload while logged out
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof initPdfDB === 'function');

    const resO_AfterReload = await page.evaluate(async () => {
      await initPdfDB();
      const keysToCheck = [
        'pharmaSubjectsV4',
        'pharmaScheduleV4',
        'pharmaScheduleBacklogV1',
        'pharmaWeeklyReportsV1',
        'pharmaPlannerPrefsV1',
        'pharmaLogsV4',
        'pharmaAcademyProgressV1',
        'pharmaCloudMediaRegistryV1',
        'pharmaWorkspaceDirty',
        'pharmaLastActiveCloudUid'
      ];
      const nullStatus = {};
      keysToCheck.forEach(k => { nullStatus[k] = (localStorage.getItem(k) === null); });
      const allCleared = keysToCheck.every(k => nullStatus[k] === true);

      const bootMemoryEmpty = (
        Array.isArray(subjects) && subjects.length === 0 &&
        Array.isArray(scheduleEvents) && scheduleEvents.length === 0 &&
        Array.isArray(scheduleBacklog) && scheduleBacklog.length === 0 &&
        Array.isArray(weeklyReports) && weeklyReports.length === 0 &&
        Array.isArray(logs) && logs.length === 0 &&
        Array.isArray(completedAcademyModules) && completedAcademyModules.length === 0 &&
        Object.keys(cloudMediaRegistry || {}).length === 0
      );

      // Re-authenticate User A offline and verify full recovery from pharmaAccountWorkspace_<uid>
      const uidA = 'user-m1-e2e-a';
      supabaseClient = null;
      await handleAuthSessionChange({ id: uidA, email: 'm1_a@exo.edu', name: 'M1 User A' }, false);
      const syncARes = await syncWorkspaceOnLogin();

      const recoveredA = (
        subjects.length === 1 && subjects[0].id === 'sub_e2e_a1' &&
        scheduleEvents.length === 1 && scheduleEvents[0].id === 'ev_e2e_a1' &&
        scheduleBacklog.length === 1 && scheduleBacklog[0].id === 'bl_e2e_a1' &&
        weeklyReports.length === 1 &&
        logs.length === 1 &&
        completedAcademyModules.length === 2
      );
      const debugA = {
        syncARes,
        hasBackupKey: localStorage.getItem(`pharmaAccountWorkspace_${uidA}`) !== null,
        subjectsLen: subjects.length,
        eventsLen: scheduleEvents.length,
        backlogLen: scheduleBacklog.length,
        reportsLen: weeklyReports.length,
        logsLen: logs.length,
        acadLen: completedAcademyModules.length
      };

      // Sign out User A again, then log in as User B and verify zero leakage
      await handleCloudSignOut(true);
      const uidB = 'user-m1-e2e-b';
      await handleAuthSessionChange({ id: uidB, email: 'm1_b@exo.edu', name: 'M1 User B' }, false);
      const syncBRes = await syncWorkspaceOnLogin();

      const isolatedB = (
        subjects.length === 0 &&
        scheduleEvents.length === 0 &&
        scheduleBacklog.length === 0 &&
        weeklyReports.length === 0 &&
        logs.length === 0 &&
        completedAcademyModules.length === 0
      );

      return { allCleared, nullStatus, bootMemoryEmpty, recoveredA, isolatedB, debugA, syncBRes };
    });

    assert(resO_AfterReload.allCleared === true && resO_AfterReload.bootMemoryEmpty === true,
           'Test O.1 (T-5.1-01): After sign-out and real browser page reload, all 10 unscoped localStorage keys are null and in-memory workspace is empty',
           JSON.stringify(resO_AfterReload));
    assert(resO_AfterReload.recoveredA === true && resO_AfterReload.isolatedB === true,
           'Test O.2 (T-5.1-01): Re-authenticating User A recovers full workspace from pharmaAccountWorkspace_<uid> and User B sees zero User A data',
           JSON.stringify(resO_AfterReload));

    // ========================================================================
    // TEST P (T-5.1-02 & T-5.1-03): Immediate Conflict-Merge Reload (<50ms) & Brand-New Account Academy Progress
    // ========================================================================
    console.log('\n--- TEST P (T-5.1-02 & T-5.1-03): Conflict-Merge Immediate Reload & Brand-New Account Academy Progress ---');
    await page.evaluate(async () => {
      const uidConflict = 'user-m1-conflict-e2e';
      supabaseClient = null;
      await handleAuthSessionChange({ id: uidConflict, email: 'conflict@exo.edu', name: 'Conflict User' }, false);
      const ctx = createAccountOperationContext();
      const curWeekStart1 = getLocalIsoDate(getWeekStartDateForDate(new Date(), 1));

      const remoteRow = {
        user_id: uidConflict,
        revision: 7,
        subjects: [{ id: 'sub_c_rem', name: 'Remote Pharmacology', groups: [] }],
        schedule: {
          version: 3,
          events: [{ id: 'ev_c_rem', title: 'Remote Lecture Slot', day: 6, startHour: 9, duration: 1, isFixed: true, _updatedAt: 100 }],
          backlog: [{ id: 'bl_c_rem', title: 'Remote Backlog Task' }],
          weeklyReports: [{ id: 'rep_c_rem', weekStartIso: '2026-10-24', score: 88 }],
          plannerPrefs: { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75, currentWeekStartIso: curWeekStart1 },
          cloudMediaRegistry: { 'lec_c_rem': { pdfUploaded: true, ownerUid: uidConflict } },
          _tombstones: { subjects: {}, lectures: {}, events: {} }
        },
        logs: [{ id: 'log_c_rem', text: 'Remote Study Log', timestamp: 1100 }],
        academy_progress: ['mod_c_rem']
      };

      const localPayload = {
        user_id: uidConflict,
        subjects: [{ id: 'sub_c_loc', name: 'Local Biopharmaceutics', groups: [] }],
        schedule: {
          version: 3,
          events: [{ id: 'ev_c_loc', title: 'Local Lab Slot', day: 1, startHour: 13, duration: 2, isFixed: true, _updatedAt: 200 }],
          backlog: [{ id: 'bl_c_loc', title: 'Local Backlog Task' }],
          weeklyReports: [{ id: 'rep_c_loc', weekStartIso: '2026-10-31', score: 94 }],
          plannerPrefs: { weekStartDay: 1, dayStartHour: 8, dayEndHour: 22, autoCompletePct: 85, currentWeekStartIso: curWeekStart1 },
          cloudMediaRegistry: { 'lec_c_loc': { pdfUploaded: true, ownerUid: uidConflict } }
        },
        logs: [{ id: 'log_c_loc', text: 'Local Study Log', timestamp: 2200 }],
        academy_progress: ['mod_c_loc']
      };

      await mergeAndApplyCloudConflict(remoteRow, localPayload, ctx);
    });

    // Immediately reload page (<50ms, well before the 1,200ms retry timer)
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof initPdfDB === 'function');

    const resP = await page.evaluate(async () => {
      await initPdfDB();
      const uidConflict = 'user-m1-conflict-e2e';
      const storedSched = JSON.parse(localStorage.getItem('pharmaScheduleV4') || 'null');
      const storedBacklog = JSON.parse(localStorage.getItem('pharmaScheduleBacklogV1') || 'null');
      const storedSnap = JSON.parse(localStorage.getItem(`pharmaAccountWorkspace_${uidConflict}`) || 'null');

      const survivedImmediateReload = (
        Array.isArray(subjects) && subjects.length === 2 &&
        Array.isArray(scheduleEvents) && scheduleEvents.length === 2 &&
        Array.isArray(scheduleBacklog) && scheduleBacklog.length === 2 &&
        Array.isArray(weeklyReports) && weeklyReports.length === 2 &&
        plannerPrefs && plannerPrefs.weekStartDay === 1 &&
        Array.isArray(logs) && logs.length === 2 &&
        Array.isArray(completedAcademyModules) && completedAcademyModules.length === 2 &&
        cloudMediaRegistry && cloudMediaRegistry.lec_c_rem && cloudMediaRegistry.lec_c_loc &&
        storedSched && storedSched.events.length === 2 &&
        Array.isArray(storedBacklog) && storedBacklog.length === 2 &&
        storedSnap && storedSnap.subjects.length === 2 && storedSnap.schedule.events.length === 2 &&
        localStorage.getItem('pharmaWorkspaceDirty') === '1'
      );
      const debugP1 = {
        subjectsLen: subjects?.length,
        eventsLen: scheduleEvents?.length,
        backlogLen: scheduleBacklog?.length,
        reportsLen: weeklyReports?.length,
        weekStartDay: plannerPrefs?.weekStartDay,
        logsLen: logs?.length,
        acadLen: completedAcademyModules?.length,
        hasMediaReg: Boolean(cloudMediaRegistry?.lec_c_rem && cloudMediaRegistry?.lec_c_loc),
        hasStoredSched: Boolean(storedSched && storedSched.events?.length === 2),
        hasStoredBacklog: Boolean(Array.isArray(storedBacklog) && storedBacklog.length === 2),
        hasStoredSnap: Boolean(storedSnap && storedSnap.subjects?.length === 2),
        dirtyFlag: localStorage.getItem('pharmaWorkspaceDirty')
      };

      // Now test T-5.1-03 in Chromium: Brand-new cloud account preserves pre-login academy_progress ['mod_1', 'mod_2']
      const uidConflictUser = { id: uidConflict, email: 'conflict@exo.edu', name: 'Conflict User' };
      await handleAuthSessionChange(uidConflictUser, false);
      await handleCloudSignOut(true);
      completedAcademyModules = ['mod_1', 'mod_2'];
      localStorage.setItem('pharmaAcademyProgressV1', JSON.stringify(['mod_1', 'mod_2']));

      let pushedPayload = null;
      supabaseClient = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null })
            })
          })
        }),
        rpc: async (fnName, args) => {
          if (fnName === 'sync_workspace_with_concurrency') {
            pushedPayload = args.p_payload;
          }
          return { data: { status: 'success', revision: 1 }, error: null };
        },
        auth: { signOut: async () => {} }
      };

      const uidBrandNew = 'user-m1-brandnew-e2e';
      currentCloudUser = { id: uidBrandNew, email: 'brandnew@exo.edu', name: 'Brand New' };
      bumpAccountSessionGeneration();
      const brandNewSyncRes = await syncWorkspaceOnLogin();

      const storedAcad = JSON.parse(localStorage.getItem('pharmaAcademyProgressV1') || '[]');
      const brandNewAcademyPreserved = (
        Array.isArray(completedAcademyModules) &&
        completedAcademyModules.length === 2 &&
        completedAcademyModules.includes('mod_1') &&
        completedAcademyModules.includes('mod_2') &&
        storedAcad.length === 2 &&
        pushedPayload &&
        Array.isArray(pushedPayload.academy_progress) &&
        pushedPayload.academy_progress.length === 2
      );
      const debugP2 = {
        brandNewSyncRes,
        completedAcademyModules,
        storedAcad,
        pushedPayloadAcad: pushedPayload?.academy_progress
      };

      supabaseClient = null;
      return { survivedImmediateReload, brandNewAcademyPreserved, debugP1, debugP2 };
    });

    assert(resP.survivedImmediateReload === true,
           'Test P.1 (T-5.1-02): Immediate page reload (<50ms after mergeAndApplyCloudConflict, before 1200ms timer) preserves all merged categories, pharmaAccountWorkspace_<uid>, and pharmaWorkspaceDirty="1"',
           JSON.stringify(resP.debugP1));
    assert(resP.brandNewAcademyPreserved === true,
           'Test P.2 (T-5.1-03): Brand-new cloud account login preserves pre-login academy_progress ["mod_1", "mod_2"] in memory, localStorage, and initial cloud push',
           JSON.stringify(resP.debugP2));

    // =========================================================================
    // TEST Q: M1 CORRECTIVE PASS (T-M1-C01 Direct A->B Switch Tests A/B/C/D, T-M1-C02 Snapshot Write Failure, T-M1-C03 Missing Remote Annotations)
    // =========================================================================
    console.log('\n--- TEST Q: M1 Corrective Pass (T-M1-C01 Tests A/B/C/D, T-M1-C02, T-M1-C03 in Real Chromium + IndexedDB) ---');
    const resQ = await page.evaluate(async () => {
      await initPdfDB();

      // 1. T-M1-C01 (Tests A & C): Direct Account A -> Account B1 switch with STALE existing snapshot & older Drive vault
      const uidA = 'user-c01-e2e-a';
      const uidA2 = 'user-c01-e2e-a2-nosnap';
      const uidB1 = 'user-c01-e2e-b1';
      const uidB2 = 'user-c01-e2e-b2';

      await handleAuthSessionChange({ id: uidA, email: 'a@exo.edu', name: 'User A' }, false);
      const opCtxA = createAccountOperationContext(uidA);
      await restoreAllAnnotationsMapToDB({
        lec_a_e2e_verified: {
          '1': [{ id: 's_a_e2e_1', tool: 'pen', color: '#ef4444', size: 2, points: [[5, 5], [15, 15]] }]
        }
      }, uidA, opCtxA);

      // Seed STALE existing snapshot and older Drive vault for uidA
      localStorage.setItem(`pharmaGdriveSync_${uidA}`, JSON.stringify({
        linked: true,
        folderId: 'stale_folder_a_000',
        userEmail: 'stale_a@gmail.com',
        quotaInfo: '100MB / 15GB'
      }));
      localStorage.setItem(`pharmaAccountWorkspace_${uidA}`, JSON.stringify({
        user_id: uidA,
        user_email: 'a@exo.edu',
        revision: 2,
        dirty: false,
        subjects: [{ id: 1, name: 'Stale Sub A' }],
        schedule: { version: 3, events: [], backlog: [] },
        annotations: {
          stale_old_lec: { '1': [{ id: 's_stale', tool: 'pen', points: [[1, 1]] }] }
        }
      }));

      // Give User A newer live workspace data, dirty state, and newer bound Drive metadata
      currentUserCanUploadMedia = true;
      subjects = [{ id: 99, name: 'Fresh Live Sub A', groups: [] }];
      scheduleEvents = [{ id: 'ev_a_fresh', title: 'Fresh Event A', day: 1, startHour: 9, duration: 2 }];
      completedAcademyModules = ['mod_a_fresh_1', 'mod_a_fresh_2'];
      plannerPrefs = { weekStartDay: 1, dayStartHour: 8, dayEndHour: 22, autoCompletePct: 90, currentWeekStartIso: '2026-11-02' };
      localStorage.setItem('pharmaPlannerPrefsV1', JSON.stringify(plannerPrefs));
      currentPdfFitMode = 'width';
      localStorage.setItem('pharmaPdfFitMode', 'width');
      localStorage.setItem('pharmaWorkspaceDirty', '1');
      localStorage.setItem(`pharmaWorkspaceRevision_${uidA}`, '6');
      googleAccessToken = 'token-user-a-e2e';
      googleTokenExpiry = Date.now() + 3600000;
      gdriveSubfolderCache.clear();
      gdriveSubfolderCache.set('sub1', 'folder_sub_a');
      localStorage.setItem('exo_gdrive_token', 'token-user-a-e2e');
      localStorage.setItem('exo_gdrive_token_exp', String(googleTokenExpiry));
      localStorage.setItem('exo_gdrive_connected', '1');
      localStorage.setItem('exo_gdrive_folder_id', 'fresh_folder_a_e2e');
      localStorage.setItem('exo_gdrive_user_email', 'fresh_a@gmail.com');
      localStorage.setItem('exo_gdrive_quota_info', '950MB / 15GB');
      localStorage.setItem('exo_gdrive_bound_user_id', uidA);

      supabaseClient = {
        from: () => ({
          select: () => ({
            eq: (_col, val) => ({
              maybeSingle: async () => {
                if (val === uidB1) {
                  return { data: { user_id: uidB1, can_upload_media: false, revision: 1, subjects: [{ id: 2, name: 'Sub B1' }] }, error: null };
                }
                if (val === uidB2) {
                  return {
                    data: {
                      user_id: uidB2,
                      can_upload_media: true,
                      revision: 2,
                      subjects: [{ id: 3, name: 'Sub B2' }],
                      schedule: {
                        events: [],
                        backlog: [],
                        weeklyReports: [],
                        plannerPrefs: { weekStartDay: 2, dayStartHour: 7, dayEndHour: 21, autoCompletePct: 85, currentWeekStartIso: '2026-11-03' },
                        pdfFitMode: 'page'
                      }
                    },
                    error: null
                  };
                }
                return { data: null, error: null };
              }
            })
          })
        }),
        rpc: async () => ({ data: { status: 'success', revision: 1 }, error: null }),
        auth: { signOut: async () => {} }
      };

      // Case 1 (Test A & Test C): Direct A -> B1 (no saved prefs/Drive on B1)
      await handleAuthSessionChange({ id: uidB1, email: 'b1@exo.edu', name: 'User B1' }, true);
      const refreshedSnapA = JSON.parse(localStorage.getItem(`pharmaAccountWorkspace_${uidA}`) || 'null');
      const refreshedDriveA = JSON.parse(localStorage.getItem(`pharmaGdriveSync_${uidA}`) || 'null');
      const idbRecordA = await new Promise((resolve) => {
        if (!dbInstance) return resolve(null);
        try {
          const tx = dbInstance.transaction('annotations', 'readonly');
          const req = tx.objectStore('annotations').get(`usr_${uidA}::lec_a_e2e_verified`);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
      const case1Passed = (
        currentCloudUser && currentCloudUser.id === uidB1 &&
        currentUserCanUploadMedia === false &&
        plannerPrefs.weekStartDay === 6 && plannerPrefs.dayStartHour === 6 && plannerPrefs.dayEndHour === 23 && plannerPrefs.autoCompletePct === 75 &&
        JSON.parse(localStorage.getItem('pharmaPlannerPrefsV1')).weekStartDay === 6 &&
        currentPdfFitMode === 'height' && localStorage.getItem('pharmaPdfFitMode') === 'height' &&
        googleAccessToken === null && googleTokenExpiry === 0 && gdriveSubfolderCache.size === 0 &&
        localStorage.getItem('exo_gdrive_token') === null &&
        localStorage.getItem('exo_gdrive_connected') === null &&
        localStorage.getItem('exo_gdrive_folder_id') === null &&
        localStorage.getItem('exo_gdrive_user_email') === null &&
        localStorage.getItem('exo_gdrive_quota_info') === null &&
        localStorage.getItem('exo_gdrive_bound_user_id') === null &&
        isGoogleDriveTokenActive() === false &&
        isGoogleDriveAccountLinked() === false &&
        isGoogleDriveConnected() === false &&
        refreshedDriveA &&
        refreshedDriveA.userEmail === 'fresh_a@gmail.com' &&
        refreshedDriveA.folderId === 'fresh_folder_a_e2e' &&
        refreshedDriveA.quotaInfo === '950MB / 15GB' &&
        refreshedSnapA &&
        Array.isArray(refreshedSnapA.subjects) &&
        refreshedSnapA.subjects.length === 1 &&
        refreshedSnapA.subjects[0].id === 99 &&
        refreshedSnapA.schedule &&
        refreshedSnapA.schedule.plannerPrefs.weekStartDay === 1 &&
        refreshedSnapA.schedule.pdfFitMode === 'width' &&
        refreshedSnapA.schedule.gdriveSync.userEmail === 'fresh_a@gmail.com' &&
        Array.isArray(refreshedSnapA.academy_progress) &&
        refreshedSnapA.academy_progress.length === 2 &&
        refreshedSnapA.revision === 6 &&
        refreshedSnapA.dirty === true &&
        refreshedSnapA.annotationsStoredInIndexedDB === true &&
        refreshedSnapA.annotations === undefined &&
        idbRecordA &&
        idbRecordA.pages &&
        idbRecordA.pages['1'] &&
        idbRecordA.pages['1'][0] &&
        idbRecordA.pages['1'][0].id === 's_a_e2e_1'
      );

      // Case 2 (Test B & Test C): Start uidA2 with NO existing snapshot, give only non-default plannerPrefs + academyModules, switch to B2
      localStorage.removeItem(`pharmaAccountWorkspace_${uidA2}`);
      await handleAuthSessionChange({ id: uidA2, email: 'a2@exo.edu', name: 'User A2' }, false);
      subjects = [];
      scheduleEvents = [];
      scheduleBacklog = [];
      weeklyReports = [];
      logs = [];
      currentPdfFitMode = 'height';
      plannerPrefs = { weekStartDay: 3, dayStartHour: 5, dayEndHour: 20, autoCompletePct: 88, currentWeekStartIso: '2026-11-04' };
      completedAcademyModules = ['mod_a2_only_1'];
      googleAccessToken = 'token-user-a2-e2e';
      googleTokenExpiry = Date.now() + 3600000;
      localStorage.setItem('exo_gdrive_token', 'token-user-a2-e2e');
      localStorage.setItem(`pharmaGdriveSync_${uidB2}`, JSON.stringify({
        linked: true,
        folderId: 'folder_b2_e2e',
        userEmail: 'b2@gmail.com',
        quotaInfo: '100MB / 15GB'
      }));

      await handleAuthSessionChange({ id: uidB2, email: 'b2@exo.edu', name: 'User B2' }, true);
      const createdSnapA2 = JSON.parse(localStorage.getItem(`pharmaAccountWorkspace_${uidA2}`) || 'null');
      const case2Passed = (
        createdSnapA2 &&
        createdSnapA2.user_id === uidA2 &&
        createdSnapA2.schedule &&
        createdSnapA2.schedule.plannerPrefs.weekStartDay === 3 &&
        createdSnapA2.schedule.plannerPrefs.autoCompletePct === 88 &&
        Array.isArray(createdSnapA2.academy_progress) &&
        createdSnapA2.academy_progress.length === 1 &&
        createdSnapA2.academy_progress[0] === 'mod_a2_only_1' &&
        currentCloudUser && currentCloudUser.id === uidB2 &&
        currentUserCanUploadMedia === true &&
        plannerPrefs.weekStartDay === 2 && plannerPrefs.autoCompletePct === 85 &&
        currentPdfFitMode === 'page' && localStorage.getItem('pharmaPdfFitMode') === 'page' &&
        googleAccessToken === null && localStorage.getItem('exo_gdrive_token') === null &&
        localStorage.getItem('exo_gdrive_connected') === '1' &&
        localStorage.getItem('exo_gdrive_folder_id') === 'folder_b2_e2e' &&
        localStorage.getItem('exo_gdrive_user_email') === 'b2@gmail.com' &&
        localStorage.getItem('exo_gdrive_bound_user_id') === uidB2 &&
        isGoogleDriveTokenActive() === false &&
        isGoogleDriveAccountLinked() === true &&
        isGoogleDriveConnected() === true
      );

      // Case 3 (Test D): Failure paths on direct switch (1: IDB annotation read failure, 2: Account snapshot write failure)
      await handleAuthSessionChange({ id: uidA, email: 'a@exo.edu', name: 'User A' }, false);
      subjects = [{ id: 99, name: 'Fresh Live Sub A', groups: [] }, { id: 100, name: 'Unsaved Sub D', groups: [] }];
      localStorage.setItem('pharmaWorkspaceDirty', '1');

      // D.1: Simulate IDB annotation read failure by temporarily setting dbInstance = null and overriding initPdfDB
      const savedDbForD = dbInstance;
      const origInitPdfDB = initPdfDB;
      dbInstance = null;
      initPdfDB = async () => {};
      let d1Res = null;
      try {
        d1Res = await handleAuthSessionChange({ id: uidB1, email: 'b1@exo.edu', name: 'User B1' }, true);
      } finally {
        dbInstance = savedDbForD;
        initPdfDB = origInitPdfDB;
      }

      // D.2: Simulate QuotaExceededError when writing pharmaAccountWorkspace_<uidA> during direct switch
      const origSetItemForD = Storage.prototype.setItem;
      const targetSnapKeyA = getAccountBackupStorageKey(uidA);
      let failSnapA = true;
      Storage.prototype.setItem = function(k, v) {
        if (failSnapA && String(k) === targetSnapKeyA) {
          throw new DOMException('Simulated QuotaExceededError on outgoing snapshot', 'QuotaExceededError');
        }
        return origSetItemForD.call(this, k, v);
      };
      let d2Res = null;
      try {
        d2Res = await handleAuthSessionChange({ id: uidB1, email: 'b1@exo.edu', name: 'User B1' }, true);
      } finally {
        failSnapA = false;
        Storage.prototype.setItem = origSetItemForD;
      }

      // D.3: Retry switch after failure clears
      const d3Res = await handleAuthSessionChange({ id: uidB1, email: 'b1@exo.edu', name: 'User B1' }, true);
      const snapAAfterD3 = JSON.parse(localStorage.getItem(targetSnapKeyA) || 'null');
      const testDPassed = (
        d1Res && d1Res.ok === false && d1Res.reason === 'outgoing_annotations_read_failed' && d1Res.isDirty === true &&
        d2Res && d2Res.ok === false && d2Res.reason === 'outgoing_account_snapshot_write_failed' && d2Res.isDirty === true &&
        d3Res && d3Res.ok !== false &&
        currentCloudUser && currentCloudUser.id === uidB1 &&
        snapAAfterD3 &&
        Array.isArray(snapAAfterD3.subjects) && snapAAfterD3.subjects.length === 2 &&
        snapAAfterD3.annotationsStoredInIndexedDB === true &&
        snapAAfterD3.annotations === undefined
      );

      // 2. T-M1-C02 & T-M1-C03: Missing remote annotations + Snapshot write failure during conflict merge
      const uidC = 'user-c02-c03-e2e';
      await handleAuthSessionChange({ id: uidC, email: 'c@exo.edu', name: 'User C' }, false);
      const opCtxC = createAccountOperationContext(uidC);
      await restoreAllAnnotationsMapToDB({
        lec_e2e_c03: {
          '1': [{ id: 's_e2e_1', tool: 'pen', color: '#10b981', size: 2, points: [[10, 10], [20, 20]] }]
        }
      }, uidC, opCtxC);

      subjects = [{ id: 10, name: 'Local C Sub', _updatedAt: 2000, groups: [], lectures: [] }];
      const localPayloadC = {
        user_id: uidC,
        user_email: 'c@exo.edu',
        subjects: [{ id: 10, name: 'Local C Sub', _updatedAt: 2000, groups: [], lectures: [] }],
        schedule: { version: 3, events: [], backlog: [], weeklyReports: [] },
        logs: [],
        academy_progress: []
      };
      const remoteRowNoAnnos = {
        user_id: uidC,
        revision: 5,
        subjects: [{ id: 20, name: 'Remote C Sub', _updatedAt: 3000, groups: [], lectures: [] }],
        schedule: { events: [], backlog: [], weeklyReports: [] },
        logs: [],
        academy_progress: ['mod_c_1']
        // Notice: NO annotations property on remoteRowNoAnnos!
      };

      // Simulate quota failure ONLY for pharmaAccountWorkspace_<uidC>
      const origSetItem = Storage.prototype.setItem;
      const targetSnapKey = getAccountBackupStorageKey(uidC);
      let failTargetSnap = true;
      Storage.prototype.setItem = function(k, v) {
        if (failTargetSnap && String(k) === targetSnapKey) {
          throw new DOMException('Simulated QuotaExceededError on account snapshot', 'QuotaExceededError');
        }
        return origSetItem.call(this, k, v);
      };

      let c02Res = null;
      try {
        c02Res = await mergeAndApplyCloudConflict(remoteRowNoAnnos, localPayloadC, opCtxC);
      } finally {
        failTargetSnap = false;
        Storage.prototype.setItem = origSetItem;
      }

      const c02Passed = (
        c02Res &&
        c02Res.ok === false &&
        c02Res.reason === 'account_snapshot_write_failed' &&
        localStorage.getItem('pharmaWorkspaceDirty') === '1' &&
        localStorage.getItem(`pharmaWorkspaceDirty_${uidC}`) === '1' &&
        dirtyAnnotationsForCloud === true &&
        Array.isArray(subjects) && subjects.length === 2
      );

      // Now run mergeAndApplyCloudConflict again without storage failure (verifies both C02 recovery and C03 annotation preservation)
      const c03Res = await mergeAndApplyCloudConflict(remoteRowNoAnnos, localPayloadC, opCtxC);
      const savedSnapC = JSON.parse(localStorage.getItem(targetSnapKey) || 'null');
      const idbAnnosAfter = await getAllAnnotationsMapFromDB(uidC, opCtxC);
      const c03Passed = (
        c03Res &&
        c03Res.ok === true &&
        savedSnapC &&
        savedSnapC.annotationsStoredInIndexedDB === true &&
        savedSnapC.annotations === undefined &&
        idbAnnosAfter.ok === true &&
        idbAnnosAfter.verifiedMap &&
        idbAnnosAfter.verifiedMap.lec_e2e_c03 &&
        idbAnnosAfter.verifiedMap.lec_e2e_c03['1'][0].id === 's_e2e_1'
      );

      supabaseClient = null;
      return {
        case1Passed,
        case2Passed,
        testDPassed,
        c02Passed,
        c03Passed,
        debug: { d1Res, d2Res, c02Res, c03Res, hasSnapAnnos: Boolean(savedSnapC?.annotations?.lec_e2e_c03) }
      };
    });

    assert(resQ.case1Passed === true,
           'Test Q.1 (T-M1-C01 Tests A & C): Direct A->B switch refreshes stale pharmaAccountWorkspace_A and pharmaGdriveSync_A with latest data + verified IDB annotations while isolating B1',
           JSON.stringify(resQ.debug));
    assert(resQ.case2Passed === true,
           'Test Q.2 (T-M1-C01 Tests B & C): Direct switch with no prior snapshot captures non-default plannerPrefs + academyModules and restores B2 Drive metadata without token leakage',
           JSON.stringify(resQ.debug));
    assert(resQ.testDPassed === true,
           'Test Q.3 (T-M1-C01 Test D): IDB annotation read failure and outgoing snapshot write failure safely abort direct switch without losing dirty data, and subsequent retry succeeds',
           JSON.stringify(resQ.debug));
    assert(resQ.c02Passed === true,
           'Test Q.4 (T-M1-C02): Snapshot write failure during conflict merge returns { ok: false, reason: "account_snapshot_write_failed" }, keeps dirty flags set, and cancels retry timer',
           JSON.stringify(resQ.debug));
    assert(resQ.c03Passed === true,
           'Test Q.5 (T-M1-C03): Conflict merge with missing remoteRow.annotations preserves real IndexedDB annotations in both IndexedDB and pharmaAccountWorkspace_<uid>',
           JSON.stringify(resQ.debug));

    // =========================================================================
    // TEST R (Phase 5.1.2 M3): Two-Tab Same-Context Actor/Device Isolation, Auto-Stamping & Operation-ID Ack
    // =========================================================================
    console.log('\n--- TEST R (Phase 5.1.2 M3): Two-Tab Same-Context Actor/Device Isolation, Auto-Stamping & Operation-ID Ack ---');
    const page2 = await context.newPage();
    await page2.goto(page.url(), { waitUntil: 'domcontentloaded' });
    await page2.waitForFunction(() => typeof initPdfDB === 'function');

    const tab1M3 = await page.evaluate(async () => {
      const uid = 'user-m3-multitab-e2e';
      supabaseClient = null;
      await handleAuthSessionChange({ id: uid, email: 'm3@exo.edu', name: 'M3 User' }, false);
      const devId = getOrCreateDeviceId();
      const actorId = getLiveActorId();
      subjects = [{
        id: 'sub_m3_shared',
        name: 'Tab 1 Pharmacology',
        wirdLogs: [{ id: 'wird_m3_1', note: 'Tab 1 Wird' }],
        groups: [{ id: 'grp_m3_1', name: 'Tab 1 Group', lectures: [{ id: 'lec_m3_1', title: 'Tab 1 Lecture' }] }]
      }];
      scheduleEvents = [{ id: 'ev_m3_1', title: 'Tab 1 Session', day: 0, startHour: 9, duration: 2 }];
      scheduleBacklog = [{ id: 'bl_m3_1', title: 'Tab 1 Backlog' }];
      weeklyReports = [{ id: 'rep_m3_1', weekStartIso: '2026-10-31', grade: 'A' }];
      logs = [{ id: 'log_m3_1', text: 'Tab 1 Log', date: '2026-11-01' }];
      saveSubjects();
      saveScheduleData(false);
      saveLogs();
      return {
        devId,
        actorId,
        subCausal: subjects[0]._causal,
        wirdCausal: subjects[0].wirdLogs[0]._causal,
        grpCausal: subjects[0].groups[0]._causal,
        lecCausal: subjects[0].groups[0].lectures[0]._causal,
        evCausal: scheduleEvents[0]._causal,
        blCausal: scheduleBacklog[0]._causal,
        repCausal: weeklyReports[0]._causal,
        logCausal: logs[0]._causal,
        subSnapshot: JSON.parse(JSON.stringify(subjects[0]))
      };
    });

    const tab2M3 = await page2.evaluate(async (tab1SubSnap) => {
      const uid = 'user-m3-multitab-e2e';
      supabaseClient = null;
      await handleAuthSessionChange({ id: uid, email: 'm3@exo.edu', name: 'M3 User' }, false);
      const devId = getOrCreateDeviceId();
      const actorId = getLiveActorId();
      // Mutate the same subject ID concurrently in Tab 2 without observing Tab 1's in-memory counter
      const tab2Sub = stampEntityMutation({ id: 'sub_m3_shared', name: 'Tab 2 Concurrent Pharmacology', groups: [] }, 'subjects', 'sub_m3_shared', uid);
      const mergedSub = mergeEntityRecordsWithCausalEngine(tab1SubSnap, tab2Sub, 'subjects', 'sub_m3_shared', uid);
      const recoveryRecords = getConflictRecoveryRecords(uid);
      return {
        devId,
        actorId,
        tab2Dot: tab2Sub._causal.dot,
        mergedContext: mergedSub._causal.context,
        hasRecovery: recoveryRecords.some(r => r.entityId === 'sub_m3_shared' && r.reason === 'concurrent_update_tie_break')
      };
    }, tab1M3.subSnapshot);

    await page2.close();

    assert(
      tab1M3.devId === tab2M3.devId &&
      tab1M3.actorId !== tab2M3.actorId &&
      tab1M3.subCausal?.dot?.actorId === tab1M3.actorId &&
      tab2M3.tab2Dot?.actorId === tab2M3.actorId &&
      tab1M3.subCausal?.dot?.actorCounter === 1 &&
      tab2M3.tab2Dot?.actorCounter === 1 &&
      tab2M3.mergedContext?.[tab1M3.actorId] === 1 &&
      tab2M3.mergedContext?.[tab2M3.actorId] === 1 &&
      tab2M3.hasRecovery === true,
      'Test R.1 (T-5.1.2-M3-E2E): Two real Chromium tabs in the same browser context share deviceId, generate distinct CSPRNG actorIds, and merge concurrent same-scope edits with conflict recovery',
      JSON.stringify({ tab1M3, tab2M3 })
    );
    assert(
      tab1M3.subCausal?.scopeId === 'entity:subjects:sub_m3_shared' &&
      tab1M3.wirdCausal?.scopeId === 'entity:wird_logs:wird_m3_1' &&
      tab1M3.grpCausal?.scopeId === 'entity:groups:grp_m3_1' &&
      tab1M3.lecCausal?.scopeId === 'entity:lectures:lec_m3_1' &&
      tab1M3.evCausal?.scopeId === 'entity:events:ev_m3_1' &&
      tab1M3.blCausal?.scopeId === 'entity:backlog:bl_m3_1' &&
      tab1M3.repCausal?.scopeId === 'entity:weekly_reports:2026-10-31' &&
      tab1M3.logCausal?.scopeId === 'entity:logs:log_m3_1',
      'Test R.2 (T-5.1.2-M3-E2E): saveSubjects(), saveScheduleData(), and saveLogs() auto-stamp canonical entity:<pluralType>:<id> scopes across all 8 entity types in Chromium'
    );

    // =========================================================================
    // TEST S (Phase 5.1.2 M2): Real UI Deletions, Fail-Closed Tombstones, Reload Persistence & Account-Scoped IDB Cleanup
    // =========================================================================
    console.log('\n--- TEST S (Phase 5.1.2 M2): Real UI Deletions, Fail-Closed Tombstones, Reload & Account-Scoped IDB Cleanup ---');
    const preReloadM2 = await page.evaluate(async () => {
      await initPdfDB();
      const uidA = 'user-m2-del-e2e-a';
      const uidB = 'user-m2-del-e2e-b';
      supabaseClient = null;

      // Seed Account B with overlapping lecture ID lec_e2e_del_1 in real browser IndexedDB
      await handleAuthSessionChange({ id: uidB, email: 'm2b@exo.edu', name: 'M2 User B' }, false);
      const opCtxB = createAccountOperationContext(uidB);
      await saveMediaToDB('pdfs', 'lec_e2e_del_1', new Blob(['pdf-user-b'], { type: 'application/pdf' }));
      await saveMediaToDB('audios', 'rec_lec_e2e_del_1_clip1', new Blob(['aud-user-b'], { type: 'audio/webm' }));
      await restoreAllAnnotationsMapToDB({
        lec_e2e_del_1: { '1': [{ id: 'stk_b_1', tool: 'pen', points: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }] }] }
      }, uidB, opCtxB);

      // Switch to Account A and seed full hierarchy + schedule + logs + IndexedDB lecture artifacts
      await handleAuthSessionChange({ id: uidA, email: 'm2a@exo.edu', name: 'M2 User A' }, false);
      localStorage.removeItem('pharmaTombstones_' + uidA);
      const opCtxA = createAccountOperationContext(uidA);
      for (const lId of ['lec_e2e_del_1', 'lec_e2e_del_3', 'lec_e2e_del_4']) {
        await saveMediaToDB('pdfs', lId, new Blob(['pdf-user-a-' + lId], { type: 'application/pdf' }));
        await saveMediaToDB('audios', lId, new Blob(['aud-user-a-' + lId], { type: 'audio/webm' }));
        await saveMediaToDB('audios', `rec_${lId}_clip1`, new Blob(['rec-user-a-' + lId], { type: 'audio/webm' }));
      }
      await restoreAllAnnotationsMapToDB({
        lec_e2e_del_1: { '1': [{ id: 'stk_a_1', tool: 'pen', points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }] }] },
        lec_e2e_del_3: { '1': [{ id: 'stk_a_3', tool: 'pen', points: [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.5 }] }] },
        lec_e2e_del_4: { '1': [{ id: 'stk_a_4', tool: 'pen', points: [{ x: 0.3, y: 0.3 }, { x: 0.6, y: 0.6 }] }] }
      }, uidA, opCtxA);

      activeSubjectId = 'sub_e2e_del_1';
      subjects = [
        {
          id: 'sub_e2e_del_1',
          name: 'Clinical Pharmacy',
          continuousLogs: [{ id: 'wird_e2e_del_1', note: 'Chapter 1' }],
          groups: [
            {
              id: 'grp_e2e_del_1',
              name: 'Pharmacokinetics',
              lectures: [
                { id: 'lec_e2e_del_1', title: 'Clearance' },
                { id: 'lec_e2e_del_2', title: 'Volume of Distribution' }
              ]
            },
            {
              id: 'grp_e2e_del_2',
              name: 'Pharmacodynamics',
              lectures: [
                { id: 'lec_e2e_del_3', title: 'Receptor Binding' }
              ]
            }
          ]
        },
        {
          id: 'sub_e2e_del_2',
          name: 'Toxicology',
          wirdLogs: [{ id: 'wird_e2e_del_2', note: 'Antidotes' }],
          groups: [
            {
              id: 'grp_e2e_del_3',
              name: 'Heavy Metals',
              lectures: [{ id: 'lec_e2e_del_4', title: 'Chelators' }]
            }
          ]
        }
      ];
      scheduleEvents = [
        { id: 'ev_e2e_del_1', title: 'PK Study', day: 0, startHour: 9, duration: 2, type: 'study', isFixed: false, completed: true },
        { id: 'ev_e2e_clear_1', title: 'PD Study', day: 1, startHour: 11, duration: 2, type: 'study', isFixed: false, completed: true },
        { id: 'ev_e2e_fixed_1', title: 'Mandatory Lab', day: 2, startHour: 8, duration: 2, type: 'mandatory', isFixed: true }
      ];
      scheduleBacklog = [{ id: 'bl_e2e_del_1', title: 'Solve PK Problems' }];
      weeklyReports = [{ id: 'rep_e2e_del_1', weekStartIso: '2026-10-24', grade: 'A' }];
      logs = [{ id: 'log_e2e_del_1', text: 'Completed PK problems', date: '2026-10-25' }];
      saveSubjects();
      saveScheduleData(false);
      saveLogs();

      const staleRemoteRow = {
        user_id: uidA,
        revision: 10,
        subjects: JSON.parse(JSON.stringify(subjects)),
        schedule: {
          version: 3,
          events: JSON.parse(JSON.stringify(scheduleEvents)),
          backlog: JSON.parse(JSON.stringify(scheduleBacklog)),
          weeklyReports: JSON.parse(JSON.stringify(weeklyReports))
        },
        logs: JSON.parse(JSON.stringify(logs)),
        academy_progress: []
      };

      // Temporarily auto-confirm openConfirmModal for UI deletion flows
      const origOpenConfirm = openConfirmModal;
      openConfirmModal = (msg, onConfirm) => {
        if (typeof onConfirm === 'function') return onConfirm();
      };

      // 1. Test fail-closed abort when tombstone persistence throws QuotaExceededError
      const origSetItem = Storage.prototype.setItem;
      const tombKeyA = 'pharmaTombstones_' + uidA;
      let failTombWrite = true;
      Storage.prototype.setItem = function(k, v) {
        if (failTombWrite && String(k) === tombKeyA) {
          throw new DOMException('Simulated QuotaExceededError on tombstone write', 'QuotaExceededError');
        }
        return origSetItem.call(this, k, v);
      };
      try {
        await triggerDeleteLecture('grp_e2e_del_1', 'lec_e2e_del_1');
        deleteBacklogTask('bl_e2e_del_1');
      } finally {
        failTombWrite = false;
        Storage.prototype.setItem = origSetItem;
      }

      const failClosedPreserved = (
        subjects[0].groups[0].lectures.length === 2 &&
        scheduleBacklog.length === 1
      );

      // 2. Now execute real UI deletions with working storage
      deleteContinuousSubjectWirdLog('sub_e2e_del_1', 'wird_e2e_del_1');
      await triggerDeleteLecture('grp_e2e_del_1', 'lec_e2e_del_1');
      await triggerDeleteGroup('grp_e2e_del_2');
      await triggerDeleteSubject('sub_e2e_del_2');
      deleteSessionDirect(null, 'ev_e2e_del_1');
      executeClearSchedule('study_only');
      deleteBacklogTask('bl_e2e_del_1');
      triggerDeleteLog('log_e2e_del_1');
      deleteWeeklyEvaluationReport('rep_e2e_del_1');

      openConfirmModal = origOpenConfirm;

      // Save staleRemoteRow in window/sessionStorage for post-reload anti-resurrection check
      sessionStorage.setItem('test_s_stale_remote', JSON.stringify(staleRemoteRow));
      return { failClosedPreserved };
    });

    // Reload browser page and verify deletions survive reload + stale remote sync cannot resurrect deleted items + IDB cleanup is account-isolated
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof initPdfDB === 'function');

    const postReloadM2 = await page.evaluate(async () => {
      await initPdfDB();
      const uidA = 'user-m2-del-e2e-a';
      const uidB = 'user-m2-del-e2e-b';
      await handleAuthSessionChange({ id: uidA, email: 'm2a@exo.edu', name: 'M2 User A' }, false);

      const survivedReload = (
        subjects.length === 1 &&
        subjects[0].id === 'sub_e2e_del_1' &&
        subjects[0].groups.length === 1 &&
        subjects[0].groups[0].id === 'grp_e2e_del_1' &&
        subjects[0].groups[0].lectures.length === 1 &&
        subjects[0].groups[0].lectures[0].id === 'lec_e2e_del_2' &&
        (subjects[0].continuousLogs || []).length === 0 &&
        scheduleEvents.length === 1 &&
        scheduleEvents[0].id === 'ev_e2e_fixed_1' &&
        scheduleBacklog.length === 0 &&
        weeklyReports.length === 0 &&
        logs.length === 0
      );

      // Merge against pre-deletion stale remote row and verify zero resurrection
      const staleRemoteRow = JSON.parse(sessionStorage.getItem('test_s_stale_remote'));
      const opCtxA = createAccountOperationContext(uidA);
      const localPayloadNow = {
        user_id: uidA,
        subjects: JSON.parse(JSON.stringify(subjects)),
        schedule: {
          version: 3,
          events: JSON.parse(JSON.stringify(scheduleEvents)),
          backlog: JSON.parse(JSON.stringify(scheduleBacklog)),
          weeklyReports: JSON.parse(JSON.stringify(weeklyReports)),
          _tombstones: getLocalTombstones(uidA)
        },
        logs: JSON.parse(JSON.stringify(logs)),
        academy_progress: []
      };
      await mergeAndApplyCloudConflict(staleRemoteRow, localPayloadNow, opCtxA);

      const noResurrectionAfterMerge = (
        subjects.length === 1 &&
        subjects[0].id === 'sub_e2e_del_1' &&
        subjects[0].groups.length === 1 &&
        subjects[0].groups[0].lectures.length === 1 &&
        subjects[0].groups[0].lectures[0].id === 'lec_e2e_del_2' &&
        (subjects[0].continuousLogs || []).length === 0 &&
        scheduleEvents.length === 1 &&
        scheduleEvents[0].id === 'ev_e2e_fixed_1' &&
        scheduleBacklog.length === 0 &&
        weeklyReports.length === 0 &&
        logs.length === 0
      );

      // Inspect real IndexedDB stores for Account A (purged) vs Account B (preserved)
      const checkStoreHasKey = (storeName, key) => new Promise((resolve) => {
        const tx = dbInstance.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(Boolean(req.result));
        req.onerror = () => resolve(false);
      });

      const aPdf1 = await checkStoreHasKey('pdfs', toScopedKey('lec_e2e_del_1', uidA));
      const aAud1 = await checkStoreHasKey('audios', toScopedKey('lec_e2e_del_1', uidA));
      const aRec1 = await checkStoreHasKey('audios', toScopedKey('rec_lec_e2e_del_1_clip1', uidA));
      const aAnno1 = await checkStoreHasKey('annotations', toScopedKey('lec_e2e_del_1', uidA));
      const aPdf3 = await checkStoreHasKey('pdfs', toScopedKey('lec_e2e_del_3', uidA));
      const aPdf4 = await checkStoreHasKey('pdfs', toScopedKey('lec_e2e_del_4', uidA));

      const bPdf1 = await checkStoreHasKey('pdfs', toScopedKey('lec_e2e_del_1', uidB));
      const bRec1 = await checkStoreHasKey('audios', toScopedKey('rec_lec_e2e_del_1_clip1', uidB));
      const bAnno1 = await checkStoreHasKey('annotations', toScopedKey('lec_e2e_del_1', uidB));

      const idbCleanupIsolated = (
        !aPdf1 && !aAud1 && !aRec1 && !aAnno1 && !aPdf3 && !aPdf4 &&
        bPdf1 && bRec1 && bAnno1
      );

      return {
        survivedReload,
        noResurrectionAfterMerge,
        idbCleanupIsolated,
        debug: {
          subLen: subjects.length,
          grpLen: subjects[0]?.groups?.length,
          lecLen: subjects[0]?.groups?.[0]?.lectures?.length,
          contLogsLen: (subjects[0]?.continuousLogs || []).length,
          evLen: scheduleEvents.length,
          blLen: scheduleBacklog.length,
          repLen: weeklyReports.length,
          logsLen: logs.length
        }
      };
    });

    assert(
      preReloadM2.failClosedPreserved === true &&
      postReloadM2.survivedReload === true &&
      postReloadM2.noResurrectionAfterMerge === true,
      'Test S.1 (T-5.1.2-M2-E2E): UI deletions abort fail-closed on tombstone write error, persist across real browser reload, and block resurrection from stale remote sync',
      JSON.stringify({ preReloadM2, postReloadM2 })
    );
    assert(
      postReloadM2.idbCleanupIsolated === true,
      'Test S.2 (T-5.1.2-M2-E2E): Real browser IndexedDB cascade cleanup purges deleted lecture PDFs, audios, rec_* clips, and annotations for Account A while preserving Account B overlapping lecture IDs',
      JSON.stringify(postReloadM2)
    );

    // =========================================================================
    // TEST T (Phase 5.1.2 M4): Real Browser Annotation Studio Stamping, Undo/Redo, Page Clear & Legacy Stroke Merge
    // =========================================================================
    console.log('\n--- TEST T (Phase 5.1.2 M4): Real Browser Annotation Studio Stamping, Undo/Redo, Page Clear & Legacy Stroke Merge ---');
    const resT = await page.evaluate(async () => {
      await initPdfDB();
      const uidM4 = 'user-m4-anno-e2e';
      supabaseClient = null;
      await handleAuthSessionChange({ id: uidM4, email: 'm4@exo.edu', name: 'M4 User' }, false);
      const opCtxM4 = createAccountOperationContext(uidM4);
      const lecId = 'lec_m4_e2e_900';

      // 1. Seed unmigrated legacy strokes in IndexedDB and verify load/normalization populates _legacyManifest
      await restoreAllAnnotationsMapToDB({
        [lecId]: {
          '1': [
            { tool: 'pen', color: '#10b981', size: 2, points: [{ x: 0.1111, y: 0.2222 }, { x: 0.3333, y: 0.4444 }] },
            { tool: 'pen', color: '#10b981', size: 2, points: [{ x: 0.1111, y: 0.2222 }, { x: 0.3333, y: 0.4444 }] }
          ]
        }
      }, uidM4, opCtxM4);

      const loadedFromIdb = await getAllAnnotationsMapFromDB(uidM4, opCtxM4);
      const migratedPage = loadedFromIdb.verifiedMap?.[lecId];
      const legacyMigratedOnLoad = Boolean(
        migratedPage &&
        Array.isArray(migratedPage['1']) &&
        migratedPage['1'].length === 2 &&
        migratedPage['1'][0].id !== migratedPage['1'][1].id &&
        migratedPage._legacyManifest?.['1']?.__manifestOriginId__
      );

      // 2. Test 6-parameter stampAnnotationItemCausalMetadata, undo/redo supersession, audio pin deletion, extra note toggle & page clear
      const liveAnnos = JSON.parse(JSON.stringify(migratedPage));
      const newStroke = stampAnnotationItemCausalMetadata(
        { id: 'stk_e2e_live_1', tool: 'pen', color: '#3b82f6', size: 3, points: [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.6 }] },
        'stroke',
        lecId,
        '1',
        uidM4,
        liveAnnos
      );
      const newNote = stampAnnotationItemCausalMetadata(
        { id: 'note_e2e_live_1', tool: 'text', text: 'E2E Floating Note', x: 0.2, y: 0.2, size: 4 },
        'note',
        lecId,
        '1',
        uidM4,
        liveAnnos
      );
      const newPin = stampAnnotationItemCausalMetadata(
        { id: 'pin_e2e_live_1', time: 45, label: 'Important Audio Point' },
        'pin',
        lecId,
        '1',
        uidM4,
        liveAnnos
      );
      liveAnnos['1'].push(newStroke, newNote);
      liveAnnos._audioPins = { '1': [newPin] };
      const remoteBeforeEdits = JSON.parse(JSON.stringify(liveAnnos));

      // Undo newStroke then Redo newStroke
      recordAnnotationStrokeDeletion(liveAnnos, lecId, '1', newStroke, uidM4);
      liveAnnos['1'] = liveAnnos['1'].filter(s => s.id !== newStroke.id);
      const redoneStroke = stampAnnotationItemCausalMetadata(newStroke, 'stroke', lecId, '1', uidM4, liveAnnos);
      liveAnnos['1'].push(redoneStroke);

      // Delete first migrated legacy stroke, delete newNote, delete newPin, enable extra note on page 1, exclude page 2
      const deletedLegacyStrokeId = liveAnnos['1'][0].id;
      recordAnnotationStrokeDeletion(liveAnnos, lecId, '1', liveAnnos['1'][0], uidM4);
      liveAnnos['1'].shift();
      recordAnnotationStrokeDeletion(liveAnnos, lecId, '1', newNote, uidM4);
      liveAnnos['1'] = liveAnnos['1'].filter(s => s.id !== newNote.id);
      recordAudioPinDeletion(liveAnnos, lecId, '1', newPin.id, uidM4);
      liveAnnos._audioPins['1'] = [];
      recordExtraNoteToggleMutation(liveAnnos, lecId, '1', true, uidM4);
      recordExcludedPageMutation(liveAnnos, lecId, 2, true, uidM4);

      const mergedLive = mergeLectureAnnotationsWithCausalVersions(lecId, liveAnnos, remoteBeforeEdits, uidM4);
      const survivingIdsP1 = (mergedLive['1'] || []).map(s => s.id);
      const causalMergePassed = (
        survivingIdsP1.includes('stk_e2e_live_1') &&
        !survivingIdsP1.includes('note_e2e_live_1') &&
        !survivingIdsP1.includes(deletedLegacyStrokeId) &&
        survivingIdsP1.length === 2 &&
        (!mergedLive._audioPins['1'] || mergedLive._audioPins['1'].length === 0) &&
        mergedLive._extraNotes['1'] === true &&
        Array.isArray(mergedLive.__exo_excluded_pages__) &&
        mergedLive.__exo_excluded_pages__.includes(2)
      );

      // 3. Test divergent unmigrated legacy stroke arrays without shared manifest provenance
      const divLocal = { '1': [{ tool: 'pen', color: '#000', size: 2, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }] };
      const divRemote = {
        '1': [
          { tool: 'pen', color: '#000', size: 2, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] },
          { tool: 'pen', color: '#000', size: 2, points: [{ x: 0.7, y: 0.7 }, { x: 0.8, y: 0.8 }] }
        ]
      };
      const mergedDivergent = mergeLectureAnnotationsWithCausalVersions('lec_m4_div_e2e', divLocal, divRemote, uidM4);
      const recoveryList = getConflictRecoveryRecords(uidM4);
      const divergentPreserved = (
        Array.isArray(mergedDivergent['1']) &&
        mergedDivergent['1'].length === 3 &&
        recoveryList.some(r => r.entityId === 'lec_m4_div_e2e:1' && r.reason === 'divergent_legacy_stroke_ancestry')
      );

      return { legacyMigratedOnLoad, causalMergePassed, divergentPreserved };
    });

    assert(
      resT.legacyMigratedOnLoad === true && resT.causalMergePassed === true && resT.divergentPreserved === true,
      'Test T.1 (T-5.1.2-M4-E2E): Real browser IndexedDB legacy stroke migration, 6-parameter annotation stamping, undo/redo supersession, causal deletions, and divergent legacy stroke preservation all succeed',
      JSON.stringify(resT)
    );

    // =========================================================================
    // TEST U (Phase 5.1.3 Correction C): Real Annotation Studio UI E2E (Toolbar + Pointer Canvas + Undo + Eraser + Page Clear + Reload)
    // =========================================================================
    console.log('\n--- TEST U (Phase 5.1.3 Correction C): Real Annotation Studio UI E2E (Pointer Drawing, Undo, Eraser, Page Clear & Reload) ---');
    const uiScenarioPageErrors = [];
    const uiScenarioConsoleErrors = [];
    const onPageError = (err) => uiScenarioPageErrors.push(String(err && err.message ? err.message : err));
    const onConsoleMsg = (msg) => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        if (!txt.includes('favicon') && !txt.includes('ERR_NAME_NOT_RESOLVED') && !txt.includes('net::')) {
          uiScenarioConsoleErrors.push(txt);
        }
      }
    };
    page.on('pageerror', onPageError);
    page.on('console', onConsoleMsg);

    // Ensure offline-safe PDF.js document adapter is available if CDN was unreachable in headless CI
    const installOfflinePdfJsFallback = async () => {
      await page.evaluate(() => {
        const makeDeterministicDoc = () => ({
          promise: Promise.resolve({
            numPages: 2,
            getPage: async (pageNum) => ({
              pageNumber: pageNum,
              rotate: 0,
              getViewport: ({ scale = 1, rotation = 0 } = {}) => ({
                width: Math.round(600 * scale),
                height: Math.round(800 * scale),
                scale,
                rotation
              }),
              render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
              getTextContent: async () => ({ items: [] })
            })
          })
        });
        Object.defineProperty(window, 'pdfjsLib', {
          configurable: true,
          writable: true,
          value: {
            GlobalWorkerOptions: { workerSrc: '' },
            getDocument: () => makeDeterministicDoc()
          }
        });
      });
    };

    await installOfflinePdfJsFallback();

    // Seed authenticated user, subject 8801 -> group 8811 -> lecture 8821 + PDF blob in IndexedDB + unrelated page 2 / lecture 8822 annotations
    await page.evaluate(async () => {
      await initPdfDB();
      const uidU = 'user-p513-real-ui-e2e';
      supabaseClient = null;
      await handleAuthSessionChange({ id: uidU, email: 'ui_e2e@exo.edu', name: 'UI E2E Student' }, false);
      const opCtxU = createAccountOperationContext(uidU);

      subjects = [
        {
          id: 8801,
          name: 'Clinical Pharmacology Studio E2E',
          color: '#2dd4bf',
          icon: 'fa-capsules',
          isDivided: true,
          groups: [
            {
              id: 8811,
              name: 'Autonomic Nervous System',
              lectures: [
                { id: 8821, title: 'Cholinergic Agonists PDF', path: 'local:cholinergic.pdf', audioPath: '', completed: false },
                { id: 8822, title: 'Adrenergic Antagonists PDF', path: 'local:adrenergic.pdf', audioPath: '', completed: false }
              ]
            }
          ]
        }
      ];
      saveSubjects();
      backToSubjects();
      renderSubjectsList();

      const dummyPdfBytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n%%EOF\n');
      const pdfBlob = new Blob([dummyPdfBytes], { type: 'application/pdf' });
      await saveMediaToDB('pdfs', 8821, pdfBlob);

      // Seed an unrelated stroke on Page 2 of Lecture 8821 and an unrelated stroke on Lecture 8822
      const initialAnnos8821 = {};
      const p2Stroke = stampAnnotationItemCausalMetadata(
        { id: 'stk_p2_unrelated_keep', tool: 'pen', color: '#10b981', size: 3, opacity: 1, points: [{ x: 0.25, y: 0.25 }, { x: 0.45, y: 0.45 }] },
        'stroke',
        8821,
        '2',
        uidU,
        initialAnnos8821
      );
      initialAnnos8821['2'] = [p2Stroke];

      const initialAnnos8822 = {};
      const otherLecStroke = stampAnnotationItemCausalMetadata(
        { id: 'stk_lec8822_unrelated_keep', tool: 'pen', color: '#f59e0b', size: 2, opacity: 1, points: [{ x: 0.15, y: 0.15 }, { x: 0.35, y: 0.35 }] },
        'stroke',
        8822,
        '1',
        uidU,
        initialAnnos8822
      );
      initialAnnos8822['1'] = [otherLecStroke];

      await restoreAllAnnotationsMapToDB({
        '8821': initialAnnos8821,
        '8822': initialAnnos8822
      }, uidU, opCtxU);
    });

    // 1. Open Subject 8801 and Lecture 8821 through real DOM clicks
    await page.click('.subject-card[data-subject-id="8801"]');
    await page.waitForSelector('#subject-details-view', { state: 'visible' });
    await page.click('#groupsContainer .lecture-item div[onclick*="openLectureDocument(8811, 8821)"]');
    await page.waitForSelector('#pdfViewerModalOverlay.active', { state: 'visible' });
    await page.waitForSelector('#pdfInkCanvas_1', { state: 'visible' });

    // Wait until renderSinglePdfPage sizes #pdfInkCanvas_1
    await page.waitForFunction(() => {
      const c = document.getElementById('pdfInkCanvas_1');
      return Boolean(c && c.width > 100 && c.height > 100 && c.getBoundingClientRect().width > 50);
    });

    // 2. Select Pen tool via real toolbar button click and draw two distinct strokes on #pdfInkCanvas_1 using pointer events
    await page.click('#toolBtn_pen');
    const canvasBox = await page.locator('#pdfInkCanvas_1').boundingBox();

    // Draw Stroke 1 in top-left quadrant
    const s1StartX = canvasBox.x + canvasBox.width * 0.18;
    const s1StartY = canvasBox.y + canvasBox.height * 0.20;
    const s1EndX = canvasBox.x + canvasBox.width * 0.36;
    const s1EndY = canvasBox.y + canvasBox.height * 0.28;
    await page.mouse.move(s1StartX, s1StartY);
    await page.mouse.down();
    await page.mouse.move((s1StartX + s1EndX) / 2, (s1StartY + s1EndY) / 2, { steps: 4 });
    await page.mouse.move(s1EndX, s1EndY, { steps: 4 });
    await page.mouse.up();

    // Draw Stroke 2 in bottom-right quadrant
    const s2StartX = canvasBox.x + canvasBox.width * 0.58;
    const s2StartY = canvasBox.y + canvasBox.height * 0.62;
    const s2EndX = canvasBox.x + canvasBox.width * 0.78;
    const s2EndY = canvasBox.y + canvasBox.height * 0.70;
    await page.mouse.move(s2StartX, s2StartY);
    await page.mouse.down();
    await page.mouse.move((s2StartX + s2EndX) / 2, (s2StartY + s2EndY) / 2, { steps: 4 });
    await page.mouse.move(s2EndX, s2EndY, { steps: 4 });
    await page.mouse.up();

    const afterDrawState = await page.evaluate(async () => {
      await flushPendingAnnotationsSave(false);
      const p1List = Array.isArray(pageAnnotations['1']) ? pageAnnotations['1'] : [];
      const opCtxU = createAccountOperationContext(currentCloudUser.id);
      const idbMap = await getAllAnnotationsMapFromDB(currentCloudUser.id, opCtxU);
      const persistedP1 = idbMap.verifiedMap?.['8821']?.['1'] || [];
      return {
        inMemoryCount: p1List.length,
        persistedCount: persistedP1.length,
        stroke1Id: p1List[0]?.id || null,
        stroke2Id: p1List[1]?.id || null,
        allStampedCausally: p1List.length === 2 && p1List.every(s => s._causal && s._causal.operationId && s._causal.actorId && s._causal.actorCounter >= 1),
        preUndoSnapshot: JSON.parse(JSON.stringify(pageAnnotations))
      };
    });

    assert(
      afterDrawState.inMemoryCount === 2 &&
      afterDrawState.persistedCount === 2 &&
      afterDrawState.allStampedCausally === true,
      'Test U.1 (T-5.1.3-C1): Real UI pointer pen drawing on #pdfInkCanvas_1 creates and persists 2 causally stamped ink strokes in IndexedDB',
      JSON.stringify(afterDrawState)
    );

    // 3. Trigger real toolbar Undo button click to undo Stroke 2, then draw Stroke 3 and erase it with the real UI Eraser tool
    await page.click('#pdfAnnotationToolbar button[onclick="undoLastStroke()"]');
    const afterUndoState = await page.evaluate(async (undoneStrokeId) => {
      await flushPendingAnnotationsSave(false);
      const p1List = Array.isArray(pageAnnotations['1']) ? pageAnnotations['1'] : [];
      const tombMap = pageAnnotations._deletedStrokes?.['1'] || pageAnnotations.__exo_page_versions__?.['1']?.deletedStrokes || {};
      const tombEntry = undoneStrokeId ? tombMap[undoneStrokeId] : null;
      return {
        remainingCount: p1List.length,
        remainingStrokeId: p1List[0]?.id || null,
        hasUndoTombstone: Boolean(tombEntry && tombEntry.operationId && tombEntry.kind === 'delete_annotation_item')
      };
    }, afterDrawState.stroke2Id);

    // Draw Stroke 3 in bottom-right quadrant and erase it using #toolBtn_eraser pointer drag
    await page.click('#toolBtn_pen');
    await page.mouse.move(s2StartX, s2StartY);
    await page.mouse.down();
    await page.mouse.move((s2StartX + s2EndX) / 2, (s2StartY + s2EndY) / 2, { steps: 4 });
    await page.mouse.move(s2EndX, s2EndY, { steps: 4 });
    await page.mouse.up();

    const stroke3Id = await page.evaluate(() => {
      const p1List = Array.isArray(pageAnnotations['1']) ? pageAnnotations['1'] : [];
      return p1List[1]?.id || null;
    });

    await page.click('#toolBtn_eraser');
    await page.mouse.move(s2StartX - 5, s2StartY - 5);
    await page.mouse.down();
    await page.mouse.move((s2StartX + s2EndX) / 2, (s2StartY + s2EndY) / 2, { steps: 6 });
    await page.mouse.move(s2EndX + 5, s2EndY + 5, { steps: 6 });
    await page.mouse.up();

    const afterEraserState = await page.evaluate(async (erasedId) => {
      await flushPendingAnnotationsSave(false);
      const p1List = Array.isArray(pageAnnotations['1']) ? pageAnnotations['1'] : [];
      const tombMap = pageAnnotations._deletedStrokes?.['1'] || pageAnnotations.__exo_page_versions__?.['1']?.deletedStrokes || {};
      const tombEntry = erasedId ? tombMap[erasedId] : null;
      return {
        remainingCount: p1List.length,
        remainingStrokeId: p1List[0]?.id || null,
        hasErasedTombstone: Boolean(tombEntry && tombEntry.operationId && tombEntry.kind === 'delete_annotation_item')
      };
    }, stroke3Id);

    assert(
      afterUndoState.remainingCount === 1 &&
      afterUndoState.remainingStrokeId === afterDrawState.stroke1Id &&
      afterUndoState.hasUndoTombstone === true &&
      Boolean(stroke3Id) &&
      afterEraserState.remainingCount === 1 &&
      afterEraserState.remainingStrokeId === afterDrawState.stroke1Id &&
      afterEraserState.hasErasedTombstone === true,
      'Test U.2 (T-5.1.3-C2): Real UI Undo button and Eraser pointer drag remove targeted strokes on #pdfInkCanvas_1 and record causal stroke deletion tombstones',
      JSON.stringify({ afterUndoState, stroke3Id, afterEraserState })
    );

    // 4. Trigger real UI Page Clear via More Menu -> "مسح كتابات الصفحة الحالية" -> Confirm Modal (#confirmModalBtn)
    await page.click('#pdfModalContainer button[onclick="togglePdfMoreMenu(event)"]');
    await page.waitForSelector('#pdfMoreDropdownMenu.open', { state: 'visible' });
    await page.click('#pdfMoreDropdownMenu button[onclick*="clearCurrentPageAnnotations"]');
    await page.waitForSelector('#confirmModalOverlay.active', { state: 'visible' });
    await page.click('#confirmModalBtn');

    const afterClearState = await page.evaluate(async () => {
      await flushPendingAnnotationsSave(false);
      const p1List = Array.isArray(pageAnnotations['1']) ? pageAnnotations['1'] : [];
      const p2List = Array.isArray(pageAnnotations['2']) ? pageAnnotations['2'] : [];
      const clearBarrier = pageAnnotations._clearedAt?.['1'] || pageAnnotations.__exo_page_versions__?.['1']?.clearedAt || null;
      return {
        p1Count: p1List.length,
        p2Count: p2List.length,
        p2StrokeId: p2List[0]?.id || null,
        hasClearBarrier: Boolean(clearBarrier && clearBarrier.operationId && clearBarrier.kind === 'clear_page')
      };
    });

    assert(
      afterClearState.p1Count === 0 &&
      afterClearState.hasClearBarrier === true &&
      afterClearState.p2Count === 1 &&
      afterClearState.p2StrokeId === 'stk_p2_unrelated_keep',
      'Test U.3 (T-5.1.3-C3): Real UI Page Clear menu + confirmation dialog clears Page 1 with a causal clear_page barrier while preserving Page 2 annotations',
      JSON.stringify(afterClearState)
    );

    // 5. Real browser reload -> re-open Subject 8801 & Lecture 8821 via UI -> verify persistence, non-resurrection, and unrelated data survival
    await page.reload({ waitUntil: 'domcontentloaded' });
    await installOfflinePdfJsFallback();
    await page.evaluate(async () => {
      await initPdfDB();
      currentCloudUser = { id: 'user-p513-real-ui-e2e', email: 'ui_e2e@exo.edu', name: 'UI E2E Student' };
      bumpAccountSessionGeneration();
      await refreshLocalMediaCache();
      renderSubjectsList();
    });

    await page.click('.subject-card[data-subject-id="8801"]');
    await page.waitForSelector('#subject-details-view', { state: 'visible' });
    await page.click('#groupsContainer .lecture-item div[onclick*="openLectureDocument(8811, 8821)"]');
    await page.waitForSelector('#pdfViewerModalOverlay.active', { state: 'visible' });
    await page.waitForSelector('#pdfInkCanvas_1', { state: 'visible' });

    const postReloadVerification = await page.evaluate(async (stalePreClearSnapshot) => {
      const uidU = 'user-p513-real-ui-e2e';
      const opCtxU = createAccountOperationContext(uidU);
      const idbMap = await getAllAnnotationsMapFromDB(uidU, opCtxU);
      const lec8821 = idbMap.verifiedMap?.['8821'] || {};
      const lec8822 = idbMap.verifiedMap?.['8822'] || {};

      // Merge current persisted state with the stale pre-clear/pre-undo snapshot to verify non-resurrection
      const mergedAgainstStale = mergeLectureAnnotationsWithCausalVersions(8821, lec8821, stalePreClearSnapshot, uidU);
      const clearBarrier = lec8821._clearedAt?.['1'] || lec8821.__exo_page_versions__?.['1']?.clearedAt || null;

      return {
        reloadedInMemoryP1Count: (pageAnnotations['1'] || []).length,
        reloadedInMemoryP2Count: (pageAnnotations['2'] || []).length,
        reloadedInMemoryP2Id: pageAnnotations['2']?.[0]?.id || null,
        idbHasClearBarrier: Boolean(clearBarrier && clearBarrier.operationId),
        idbOtherLecturePreserved: Array.isArray(lec8822['1']) && lec8822['1'].length === 1 && lec8822['1'][0].id === 'stk_lec8822_unrelated_keep',
        mergedAgainstStaleP1Count: (mergedAgainstStale['1'] || []).length,
        mergedAgainstStaleP2Count: (mergedAgainstStale['2'] || []).length
      };
    }, afterDrawState.preUndoSnapshot);

    page.off('pageerror', onPageError);
    page.off('console', onConsoleMsg);

    assert(
      postReloadVerification.reloadedInMemoryP1Count === 0 &&
      postReloadVerification.reloadedInMemoryP2Count === 1 &&
      postReloadVerification.reloadedInMemoryP2Id === 'stk_p2_unrelated_keep' &&
      postReloadVerification.idbHasClearBarrier === true &&
      postReloadVerification.idbOtherLecturePreserved === true &&
      postReloadVerification.mergedAgainstStaleP1Count === 0 &&
      postReloadVerification.mergedAgainstStaleP2Count === 1 &&
      uiScenarioPageErrors.length === 0 &&
      uiScenarioConsoleErrors.length === 0,
      'Test U.4 (T-5.1.3-C4): Real browser reload and lecture reopen preserve cleared Page 1 barrier, block resurrection of undone/erased/cleared strokes on stale merge, preserve Page 2 and Lecture 8822 annotations, and produce zero page/console errors',
      JSON.stringify({ postReloadVerification, uiScenarioPageErrors, uiScenarioConsoleErrors })
    );

    // ========================================================================
    // TEST V: Phase 5.1 Milestone M5-A — Dirty-State Login & Manual Pull Reconciliation (F-03, T-5.1-08)
    // ========================================================================
    console.log('--- TEST V: Dirty-State Login & Manual Pull Reconciliation ---');
    const resV = await page.evaluate(async () => {
      const uidV = 'user-m5a-chromium-v1';
      await handleAuthSessionChange({ id: uidV, email: 'user_v@exo.edu', name: 'User V' }, false);
      const opCtxV = createAccountOperationContext(uidV);

      // 1. Setup local dirty workspace state with subjects, schedule, and PDF annotations
      const localSubV1 = { id: 9101, name: 'Local Offline Subject V1', _updatedAt: 2000, groups: [] };
      const localEvtV1 = { id: 9201, title: 'Local Study V1', _updatedAt: 2000, subjectId: 9101, lectureId: null, startTime: '09:00', durationMinutes: 60, dayIndex: 0 };
      subjects = [localSubV1];
      scheduleEvents = [localEvtV1];
      scheduleBacklog = [];
      logs = [];
      weeklyReports = [];
      saveSubjects();
      saveScheduleData(false);

      await restoreAllAnnotationsMapToDB({
        '9101': { '1': [{ id: 'stk_local_v1', tool: 'pen', color: '#ff0000', size: 2, points: [[10, 10], [20, 20]] }] }
      }, uidV, opCtxV);

      localStorage.setItem('pharmaWorkspaceDirty', '1');
      localStorage.setItem('pharmaWorkspaceDirty_' + uidV, '1');
      localStorage.setItem('pharmaLastActiveCloudUid', uidV);

      // Remote cloud state with overlapping revision but non-conflicting new items
      const remoteRowV1 = {
        user_id: uidV,
        user_email: uidV + '@exo.edu',
        revision: 2,
        subjects: [{ id: 9102, name: 'Remote Cloud Subject V1', _updatedAt: 1500, groups: [] }],
        schedule: {
          version: 3,
          events: [{ id: 9202, title: 'Remote Study V1', _updatedAt: 1500, subjectId: 9102, lectureId: null, startTime: '11:00', durationMinutes: 45, dayIndex: 1 }],
          backlog: [],
          plannerPrefs: { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75 },
          weeklyReports: []
        },
        logs: [],
        academy_progress: [],
        annotations: {
          [toScopedKey('9102', uidV)]: {
            '1': [{ id: 'stk_remote_v1', tool: 'highlighter', color: '#00ff00', size: 10, points: [[50, 50], [60, 60]] }]
          }
        },
        updated_at: '2026-11-05T12:00:00.000Z'
      };

      let rpcCallCountV = 0;
      let lastPushedPayloadV = null;
      const origClient = supabaseClient;
      supabaseClient = {
        from: (table) => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: remoteRowV1, error: null })
            })
          })
        }),
        rpc: async (fn, params) => {
          rpcCallCountV++;
          lastPushedPayloadV = params?.p_payload;
          return { data: { status: 'success', revision: 3 }, error: null };
        }
      };

      // V.1: syncWorkspaceOnLogin() with dirty state
      const loginSyncRes = await syncWorkspaceOnLogin(opCtxV);
      const idbMapAfterLogin = await getAllAnnotationsMapFromDB(uidV, opCtxV);
      const v1HasLocalSub = subjects.some(s => s.id === 9101);
      const v1HasRemoteSub = subjects.some(s => s.id === 9102);
      const v1HasLocalEvt = scheduleEvents.some(e => e.id === 9201);
      const v1HasRemoteEvt = scheduleEvents.some(e => e.id === 9202);
      const v1HasLocalAnno = Boolean(idbMapAfterLogin.verifiedMap?.['9101']?.['1']?.some(s => s.id === 'stk_local_v1'));
      const v1HasRemoteAnno = Boolean(idbMapAfterLogin.verifiedMap?.['9102']?.['1']?.some(s => s.id === 'stk_remote_v1'));
      const v1DirtyCleared = localStorage.getItem('pharmaWorkspaceDirty') === null && localStorage.getItem('pharmaWorkspaceDirty_' + uidV) === null;

      // V.2: Manual pull with force=true on dirty state
      const localSubV2 = { id: 9103, name: 'Local Pre-Pull Subject V2', _updatedAt: 3000, groups: [] };
      subjects.push(localSubV2);
      saveSubjects();
      localStorage.setItem('pharmaWorkspaceDirty', '1');
      localStorage.setItem('pharmaWorkspaceDirty_' + uidV, '1');

      const remoteRowV2 = {
        user_id: uidV,
        user_email: uidV + '@exo.edu',
        revision: 4,
        subjects: [
          ...subjects.filter(s => s.id !== 9103),
          { id: 9104, name: 'Remote Pulled Subject V2', _updatedAt: 2500, groups: [] }
        ],
        schedule: { version: 3, events: scheduleEvents, backlog: [], plannerPrefs: { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75 }, weeklyReports: [] },
        logs: [],
        academy_progress: [],
        annotations: {},
        updated_at: '2026-11-05T12:10:00.000Z'
      };

      supabaseClient = {
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: remoteRowV2, error: null }) }) }) }),
        rpc: async () => ({ data: { status: 'success', revision: 5 }, error: null })
      };

      const manualPullRes = await pullWorkspaceFromCloud(true, opCtxV);
      const v2HasLocalSub = subjects.some(s => s.id === 9103);
      const v2HasRemoteSub = subjects.some(s => s.id === 9104);

      // V.3: Simulated RPC error during pull reconciliation preserves dirty state
      const localSubV3 = { id: 9105, name: 'Local Edit Prior To Push Error V3', _updatedAt: 4000, groups: [] };
      subjects.push(localSubV3);
      saveSubjects();
      localStorage.setItem('pharmaWorkspaceDirty', '1');
      localStorage.setItem('pharmaWorkspaceDirty_' + uidV, '1');

      const remoteRowV3 = {
        user_id: uidV,
        user_email: uidV + '@exo.edu',
        revision: 5,
        subjects: [
          ...subjects.filter(s => s.id !== 9105),
          { id: 9106, name: 'Remote Subject V3', _updatedAt: 3500, groups: [] }
        ],
        schedule: { version: 3, events: scheduleEvents, backlog: [], plannerPrefs: { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75 }, weeklyReports: [] },
        logs: [],
        academy_progress: [],
        annotations: {},
        updated_at: '2026-11-05T12:20:00.000Z'
      };

      supabaseClient = {
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: remoteRowV3, error: null }) }) }) }),
        rpc: async () => { throw new Error('Simulated 503 Network Timeout'); }
      };

      const pullErrRes = await pullWorkspaceFromCloud(false, opCtxV);
      const v3HasLocalSub = subjects.some(s => s.id === 9105);
      const v3HasRemoteSub = subjects.some(s => s.id === 9106);
      const v3DirtyPreserved = localStorage.getItem('pharmaWorkspaceDirty') === '1' && localStorage.getItem('pharmaWorkspaceDirty_' + uidV) === '1';

      // V.4: Subsequent retry push succeeds and clears dirty state
      let retryRpcConfirmed = false;
      supabaseClient = {
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: remoteRowV3, error: null }) }) }) }),
        rpc: async () => {
          retryRpcConfirmed = true;
          return { data: { status: 'success', revision: 6 }, error: null };
        }
      };

      const retryPushRes = await pushWorkspaceToCloud(false, false, opCtxV);
      const v4DirtyCleared = localStorage.getItem('pharmaWorkspaceDirty') === null && localStorage.getItem('pharmaWorkspaceDirty_' + uidV) === null;

      // V.5: Unverified guest provenance fail-closed block and quarantine preservation
      const uidV5 = 'usr_guest_v5_target';
      const guestSubV5 = { id: 9107, name: 'Unverified Guest Chemistry V5', _updatedAt: 4500, groups: [] };
      subjects = [guestSubV5];
      localStorage.setItem('pharmaSubjectsV4', JSON.stringify([guestSubV5]));
      localStorage.setItem('pharmaWorkspaceDirty', '1');
      localStorage.removeItem('pharmaLastActiveCloudUid');
      localStorage.removeItem('pharmaLastActiveUserIdV1');
      localStorage.removeItem('exo_gdrive_bound_user_id');
      localStorage.removeItem('pharmaGuestProvenanceClaim');
      localStorage.removeItem('pharmaUnverifiedGuestWorkspace_quarantine');

      let v5RpcCalls = 0;
      const remoteRowV5 = {
        user_id: uidV5,
        user_email: uidV5 + '@exo.edu',
        revision: 2,
        subjects: [{ id: 9108, name: 'Remote User Row V5', _updatedAt: 1000, groups: [] }],
        schedule: { version: 3, events: [], backlog: [], plannerPrefs: { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75 }, weeklyReports: [] },
        logs: [],
        academy_progress: [],
        annotations: {},
        updated_at: '2026-11-05T12:25:00.000Z'
      };

      supabaseClient = {
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: remoteRowV5, error: null }) }) }) }),
        rpc: async () => {
          v5RpcCalls++;
          return { data: { status: 'success', revision: 3 }, error: null };
        }
      };

      currentCloudUser = { id: uidV5, email: uidV5 + '@exo.edu' };
      bumpAccountSessionGeneration();
      const opCtxV5 = createAccountOperationContext(uidV5);
      const loginSyncResV5 = await syncWorkspaceOnLogin(opCtxV5);
      const quarantinedV5 = JSON.parse(localStorage.getItem('pharmaUnverifiedGuestWorkspace_quarantine') || 'null');
      const v5Quarantined = Boolean(quarantinedV5 && quarantinedV5.subjects && quarantinedV5.subjects.some(s => s.id === 9107));
      const v5DirtyPreserved = localStorage.getItem('pharmaWorkspaceDirty') === '1';

      // V.6: Causal auto-stamping failure fail-closed block during pull reconciliation
      const uidV6 = 'usr_stamp_fail_v6';
      const localSubV6 = { id: 9109, name: 'Local Dirty Unstamped Sub V6', _updatedAt: 5000, groups: [] };
      subjects = [localSubV6];
      localStorage.setItem('pharmaSubjectsV4', JSON.stringify([localSubV6]));
      localStorage.setItem('pharmaWorkspaceDirty', '1');
      localStorage.setItem('pharmaWorkspaceDirty_' + uidV6, '1');
      localStorage.setItem('pharmaLastActiveCloudUid', uidV6);

      let v6RpcCalls = 0;
      const remoteRowV6 = {
        user_id: uidV6,
        user_email: uidV6 + '@exo.edu',
        revision: 1,
        subjects: [{ id: 9110, name: 'Remote Sub V6', _updatedAt: 1000, groups: [] }],
        schedule: { version: 3, events: [], backlog: [], plannerPrefs: { weekStartDay: 6, dayStartHour: 6, dayEndHour: 23, autoCompletePct: 75 }, weeklyReports: [] },
        logs: [],
        academy_progress: [],
        annotations: {},
        updated_at: '2026-11-05T12:30:00.000Z'
      };

      supabaseClient = {
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: remoteRowV6, error: null }) }) }) }),
        rpc: async () => {
          v6RpcCalls++;
          return { data: { status: 'success', revision: 2 }, error: null };
        }
      };

      currentCloudUser = { id: uidV6, email: uidV6 + '@exo.edu' };
      bumpAccountSessionGeneration();
      const opCtxV6 = createAccountOperationContext(uidV6);

      // Disable CSPRNG
      setCryptoProviderForTests(null);
      let pullResV6 = null;
      try {
        pullResV6 = await pullWorkspaceFromCloud(false, opCtxV6);
      } finally {
        setCryptoProviderForTests(undefined);
      }
      const v6DirtyPreserved = localStorage.getItem('pharmaWorkspaceDirty') === '1';

      // V.7: Durable quarantine restoration in real Chromium
      const restoreResV7 = await restoreUnverifiedGuestWorkspace(quarantinedV5.quarantineId);
      const v7Subjects = subjects;
      const v7Dirty = localStorage.getItem('pharmaWorkspaceDirty') === '1';

      // Restore client
      supabaseClient = origClient;

      return {
        loginSyncRes,
        v1HasLocalSub,
        v1HasRemoteSub,
        v1HasLocalEvt,
        v1HasRemoteEvt,
        v1HasLocalAnno,
        v1HasRemoteAnno,
        v1DirtyCleared,
        manualPullRes,
        v2HasLocalSub,
        v2HasRemoteSub,
        pullErrRes,
        v3HasLocalSub,
        v3HasRemoteSub,
        v3DirtyPreserved,
        retryPushRes,
        retryRpcConfirmed,
        v4DirtyCleared,
        loginSyncResV5,
        v5Quarantined,
        v5RpcCalls,
        v5DirtyPreserved,
        pullResV6,
        v6RpcCalls,
        v6DirtyPreserved,
        restoreResV7,
        v7Subjects,
        v7Dirty
      };
    });

    assert(
      resV.loginSyncRes &&
      resV.loginSyncRes.ok === true &&
      resV.loginSyncRes.reconciled === true &&
      resV.v1HasLocalSub === true &&
      resV.v1HasRemoteSub === true &&
      resV.v1HasLocalEvt === true &&
      resV.v1HasRemoteEvt === true &&
      resV.v1HasLocalAnno === true &&
      resV.v1HasRemoteAnno === true &&
      resV.v1DirtyCleared === true,
      'Test V.1 (T-5.1-08-A): Real Chromium page with offline dirty edits (subjects, schedule, annotations) reconciles on login, preserves local and remote items in memory and IndexedDB, and clears dirty flags upon confirmed push',
      JSON.stringify(resV)
    );

    assert(
      resV.manualPullRes &&
      resV.manualPullRes.ok === true &&
      resV.manualPullRes.reconciled === true &&
      resV.v2HasLocalSub === true &&
      resV.v2HasRemoteSub === true,
      'Test V.2 (T-5.1-08-B): Real Chromium page triggers manual pull with force=true on dirty state and reconciles safely without discarding local edits',
      JSON.stringify(resV)
    );

    assert(
      resV.pullErrRes &&
      resV.pullErrRes.reconciled === true &&
      resV.pullErrRes.status === 'reconciled_locally' &&
      resV.pullErrRes.pushResult?.status === 'error' &&
      resV.v3HasLocalSub === true &&
      resV.v3HasRemoteSub === true &&
      resV.v3DirtyPreserved === true,
      'Test V.3 (T-5.1-08-C): Simulated RPC error during pull reconciliation preserves merged local data and keeps pharmaWorkspaceDirty set in localStorage without false acknowledgment',
      JSON.stringify(resV)
    );

    assert(
      resV.retryPushRes &&
      resV.retryPushRes.status === 'success' &&
      resV.retryRpcConfirmed === true &&
      resV.v4DirtyCleared === true,
      'Test V.4 (T-5.1-08-D): Subsequent retry push persists reconciled state to cloud and clears dirty flags only after server confirms success',
      JSON.stringify(resV)
    );

    assert(
      resV.loginSyncResV5 &&
      resV.loginSyncResV5.ok === false &&
      resV.loginSyncResV5.status === 'blocked' &&
      resV.loginSyncResV5.reason === 'unverified_guest_provenance' &&
      resV.v5Quarantined === true &&
      resV.v5RpcCalls === 0 &&
      resV.v5DirtyPreserved === true,
      'Test V.5 (T-5.1-09-A): Real Chromium page with unverified guest dirty data blocks login reconciliation fail-closed, preserves guest workspace in isolated quarantine vault, and executes zero cloud pushes',
      JSON.stringify(resV)
    );

    assert(
      resV.pullResV6 &&
      resV.pullResV6.ok === false &&
      resV.pullResV6.status === 'error' &&
      resV.pullResV6.reason === 'causal_auto_stamp_failed' &&
      resV.v6RpcCalls === 0 &&
      resV.v6DirtyPreserved === true,
      'Test V.6 (T-5.1-09-E): Real Chromium page with causal auto-stamping failure aborts pull reconciliation fail-closed, keeps workspace dirty, and executes zero cloud pushes',
      JSON.stringify(resV)
    );

    assert(
      resV.restoreResV7 &&
      resV.restoreResV7.ok === true &&
      resV.restoreResV7.restored === true &&
      resV.v7Subjects?.some(s => s.id === 9107) &&
      resV.v7Dirty === true,
      'Test V.7 (T-5.1-09-C): Real Chromium page restores unverified guest workspace from quarantine vault, repopulating memory state and preserving dirty flag',
      JSON.stringify(resV)
    );

    // ========================================================================
    // SCENARIO W (M5-A.2.1): Real Reload-Based Guest Quarantine & Restoration
    // Tests complete guest persistence across 2 real browser reloads,
    // verifies all 8 categories + tombstones + conflict recovery + device
    // registry + IndexedDB annotations, plus failure injection.
    // ========================================================================
    console.log('\n--- TEST W (M5-A.2.1): Real Reload-Based Guest Quarantine & Restoration ---');

    // 1. Create a guest workspace in the page with full rich data
    const resW1 = await page.evaluate(async () => {
      // Clear previous local storage
      localStorage.clear();
      currentCloudUser = null;
      bumpAccountSessionGeneration();

      subjects = [
        { id: 9901, name: 'Guest Pharmacotherapy W', _updatedAt: 1000, groups: [] }
      ];
      scheduleEvents = [
        { id: 9902, title: 'Guest Clinical Session W', day: 1, startHour: 8, duration: 2, subjectId: 9901 }
      ];
      scheduleBacklog = [
        { id: 9903, title: 'Guest Task W' }
      ];
      const targetWeekIso = getLocalIsoDate(getWeekStartDateForDate(new Date(), 6));
      plannerPrefs = { weekStartDay: 6, dayStartHour: 7, dayEndHour: 22, autoCompletePct: 80, currentWeekStartIso: targetWeekIso };
      weeklyReports = [
        { id: 'rep_w_1', weekStartIso: targetWeekIso, score: 95 }
      ];
      logs = [
        { id: 'log_w_1', text: 'Guest Study Log W', timestamp: 1730000000000 }
      ];
      completedAcademyModules = ['mod_w1', 'mod_w2'];
      cloudMediaRegistry = { 'lec_w_1': { pdfUploaded: true, ownerUid: 'local' } };

      // Persist to local storage
      localStorage.setItem('pharmaSubjectsV4', JSON.stringify(subjects));
      localStorage.setItem('pharmaScheduleV4', JSON.stringify({
        version: 3,
        events: scheduleEvents,
        backlog: scheduleBacklog,
        plannerPrefs: plannerPrefs,
        weeklyReports: weeklyReports
      }));
      localStorage.setItem('pharmaScheduleBacklogV1', JSON.stringify(scheduleBacklog));
      localStorage.setItem('pharmaWeeklyReportsV1', JSON.stringify(weeklyReports));
      localStorage.setItem('pharmaPlannerPrefsV1', JSON.stringify(plannerPrefs));
      localStorage.setItem('pharmaLogsV4', JSON.stringify(logs));
      localStorage.setItem('pharmaAcademyProgressV1', JSON.stringify(completedAcademyModules));
      localStorage.setItem('pharmaCloudMediaRegistryV1', JSON.stringify(cloudMediaRegistry));

      // Tombstones
      const stonesW = {
        subjects: { 'sub_del_w': { id: 'sub_del_w', entityType: 'subjects', clientTimestamp: 1000, operationId: 'op_del_w1' } },
        groups: {}, lectures: {}, events: {}, logs: {}
      };
      localStorage.setItem('pharmaTombstones_local', JSON.stringify(stonesW));

      // Conflict recovery
      const recsW = [
        { recoveryId: 'rec_w_1', scopeId: 'scope_w1', losingOperationId: 'op_wl', winningOperationId: 'op_ww', candidateEnvelope: { data: 'candW' } }
      ];
      localStorage.setItem('pharmaConflictRecovery_local', JSON.stringify(recsW));

      // Device registry
      const devRegW = {
        'dev_w_test': { deviceId: 'dev_w_test', lastActorId: 'act_w1', lastSeenRevision: 1, diagnosticOnly: true, neverPurgeTombstones: true }
      };
      localStorage.setItem('pharmaDeviceRegistry_local', JSON.stringify(devRegW));

      // Write 2 guest annotations directly into IndexedDB
      if (!dbInstance) await initPdfDB();
      const aWriteOk = await new Promise((resolve) => {
        const tx = dbInstance.transaction('annotations', 'readwrite');
        const store = tx.objectStore('annotations');
        store.put({
          id: 'usr_local::lec_w_anno_1',
          rawId: 'lec_w_anno_1',
          userId: 'local',
          pages: { '1': [{ id: 'strk_w1', tool: 'pen', color: '#00ff00', points: [[10, 10], [20, 20]] }] }
        });
        store.put({
          id: 'usr_local::lec_w_anno_2',
          rawId: 'lec_w_anno_2',
          userId: 'local',
          pages: { '1': [{ id: 'strk_w2', tool: 'highlighter', color: '#ffff00', points: [[30, 30], [40, 40]] }] }
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });

      // Trigger guest quarantine
      const qRes = await preserveUnverifiedGuestWorkspace('guest_e2e_two_reload_test');

      return {
        aWriteOk,
        qRes,
        qId: qRes?.quarantineId
      };
    });

    assert(
      resW1.aWriteOk === true &&
      resW1.qRes &&
      resW1.qRes.ok === true &&
      resW1.qRes.quarantined === true &&
      resW1.qRes.counts.annotations >= 2 &&
      Boolean(resW1.qId),
      'Test W.1 (M5-A.2.1): Guest workspace with 8 categories, tombstones, conflict recovery, device registry, and 2 IndexedDB annotations triggers quarantine successfully',
      JSON.stringify(resW1)
    );

    const targetQId = resW1.qId;

    // 2. Perform Real Browser Reload #1
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // 3. Confirm that original quarantine remains accessible after Reload #1
    // And verify that after removing active LocalStorage keys, in-memory values, and live IDB annotations,
    // restoreUnverifiedGuestWorkspace reconstructs all categories from quarantine with exact match.
    const resW2 = await page.evaluate(async (qId) => {
      const snap = JSON.parse(localStorage.getItem('pharmaGuestQuarantine_' + qId) || 'null');
      const manifest = JSON.parse(localStorage.getItem('pharmaGuestQuarantine_manifest') || '[]');

      // 1. Remove active workspace LocalStorage keys
      localStorage.removeItem('pharmaSubjectsV4');
      localStorage.removeItem('pharmaScheduleV4');
      localStorage.removeItem('pharmaScheduleBacklogV1');
      localStorage.removeItem('pharmaWeeklyReportsV1');
      localStorage.removeItem('pharmaPlannerPrefsV1');
      localStorage.removeItem('pharmaLogsV4');
      localStorage.removeItem('pharmaAcademyProgressV1');
      localStorage.removeItem('pharmaCloudMediaRegistryV1');

      // 2. Remove live guest tombstone, conflict-recovery, and device-registry keys
      localStorage.removeItem('pharmaTombstones_local');
      localStorage.removeItem('pharmaConflictRecovery_local');
      localStorage.removeItem('pharmaDeviceRegistry_local');
      localStorage.removeItem('pharmaWorkspaceDirty');

      // 3. Clear corresponding in-memory values
      subjects = [];
      scheduleEvents = [];
      scheduleBacklog = [];
      plannerPrefs = {};
      weeklyReports = [];
      logs = [];
      completedAcademyModules = [];
      cloudMediaRegistry = {};
      inMemoryAnnotationsCache = {};
      pendingAnnoSaveMap = {};

      // 4. Delete the original live annotation records from IndexedDB
      if (!dbInstance) await initPdfDB();
      await new Promise((resolve) => {
        const tx = dbInstance.transaction('annotations', 'readwrite');
        tx.objectStore('annotations').delete('usr_local::lec_w_anno_1');
        tx.objectStore('annotations').delete('usr_local::lec_w_anno_2');
        tx.oncomplete = () => resolve(true);
      });

      // Now restore from the quarantine ID
      const restoreRes = await restoreUnverifiedGuestWorkspace(qId);

      // Read back all restored categories
      const restoredStones = getLocalTombstones('local');
      const restoredRecovery = getConflictRecoveryRecords('local');
      const restoredDevReg = getLocalDeviceRegistry('local');

      // Read back annotations from IndexedDB
      const idbAnnos = await new Promise((resolve) => {
        const tx = dbInstance.transaction('annotations', 'readonly');
        const store = tx.objectStore('annotations');
        const req1 = store.get('usr_local::lec_w_anno_1');
        req1.onsuccess = () => {
          const req2 = store.get('usr_local::lec_w_anno_2');
          req2.onsuccess = () => {
            resolve({
              anno1: req1.result,
              anno2: req2.result
            });
          };
        };
      });

      const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

      const expectedSubjects = [{ id: 9901, name: 'Guest Pharmacotherapy W', _updatedAt: 1000, groups: [] }];
      const expectedEvents = [{ id: 9902, title: 'Guest Clinical Session W', day: 1, startHour: 8, duration: 2, subjectId: 9901 }];
      const expectedBacklog = [{ id: 9903, title: 'Guest Task W' }];
      const targetWeekIso = getLocalIsoDate(getWeekStartDateForDate(new Date(), 6));
      const expectedPlannerPrefs = { weekStartDay: 6, dayStartHour: 7, dayEndHour: 22, autoCompletePct: 80, currentWeekStartIso: targetWeekIso };
      const expectedReports = [{ id: 'rep_w_1', weekStartIso: targetWeekIso, score: 95 }];
      const expectedLogs = [{ id: 'log_w_1', text: 'Guest Study Log W', timestamp: 1730000000000 }];
      const expectedAcademy = ['mod_w1', 'mod_w2'];
      const expectedMediaReg = { 'lec_w_1': { pdfUploaded: true, ownerUid: 'local' } };

      return {
        snapAccessible: Boolean(snap && snap.quarantineId === qId),
        manifestHasEntry: manifest.some(m => m.quarantineId === qId),
        restoreRes,
        matchSubjects: eq(subjects, expectedSubjects),
        matchEvents: eq(scheduleEvents, expectedEvents),
        matchBacklog: eq(scheduleBacklog, expectedBacklog),
        matchPlannerPrefs: eq(plannerPrefs, expectedPlannerPrefs),
        matchReports: eq(weeklyReports, expectedReports),
        matchLogs: eq(logs, expectedLogs),
        matchAcademy: eq(completedAcademyModules, expectedAcademy),
        matchMediaReg: eq(cloudMediaRegistry, expectedMediaReg),
        matchStones: restoredStones?.subjects?.['sub_del_w']?.id === 'sub_del_w' && restoredStones?.subjects?.['sub_del_w']?.operationId === 'op_del_w1',
        matchRecovery: restoredRecovery?.some(r => r.recoveryId === 'rec_w_1' && r.scopeId === 'scope_w1'),
        matchDevReg: restoredDevReg?.['dev_w_test']?.deviceId === 'dev_w_test' && restoredDevReg?.['dev_w_test']?.lastActorId === 'act_w1',
        matchAnno1: idbAnnos.anno1?.pages?.['1']?.[0]?.id === 'strk_w1' && idbAnnos.anno1?.pages?.['1']?.[0]?.color === '#00ff00',
        matchAnno2: idbAnnos.anno2?.pages?.['1']?.[0]?.id === 'strk_w2' && idbAnnos.anno2?.pages?.['1']?.[0]?.tool === 'highlighter',
        isDirty: localStorage.getItem('pharmaWorkspaceDirty') === '1'
      };
    }, targetQId);

    assert(
      resW2.snapAccessible === true &&
      resW2.manifestHasEntry === true &&
      resW2.restoreRes?.ok === true &&
      resW2.restoreRes?.restored === true &&
      resW2.matchSubjects === true &&
      resW2.matchEvents === true &&
      resW2.matchBacklog === true &&
      resW2.matchPlannerPrefs === true &&
      resW2.matchReports === true &&
      resW2.matchLogs === true &&
      resW2.matchAcademy === true &&
      resW2.matchMediaReg === true &&
      resW2.matchStones === true &&
      resW2.matchRecovery === true &&
      resW2.matchDevReg === true &&
      resW2.matchAnno1 === true &&
      resW2.matchAnno2 === true &&
      resW2.isDirty === true,
      'Test W.2 (M5-A.2.1): After Reload #1, quarantine remains accessible, restoreUnverifiedGuestWorkspace restores all 8 categories, tombstones, conflict recovery, device registry, and IndexedDB annotations with exact content verification',
      JSON.stringify(resW2)
    );

    // 4. Perform Real Browser Reload #2
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // 5. Verify restored data survives Reload #2 with exact category matching
    const resW3 = await page.evaluate(async (qId) => {
      if (!dbInstance) await initPdfDB();
      const subs = JSON.parse(localStorage.getItem('pharmaSubjectsV4') || '[]');
      const sched = JSON.parse(localStorage.getItem('pharmaScheduleV4') || '{}');
      const backlog = JSON.parse(localStorage.getItem('pharmaScheduleBacklogV1') || '[]');
      const prefs = JSON.parse(localStorage.getItem('pharmaPlannerPrefsV1') || '{}');
      const reports = JSON.parse(localStorage.getItem('pharmaWeeklyReportsV1') || '[]');
      const logsStorage = JSON.parse(localStorage.getItem('pharmaLogsV4') || '[]');
      const academy = JSON.parse(localStorage.getItem('pharmaAcademyProgressV1') || '[]');
      const mediaReg = JSON.parse(localStorage.getItem('pharmaCloudMediaRegistryV1') || '{}');
      const stones = getLocalTombstones('local');
      const recs = getConflictRecoveryRecords('local');
      const devReg = getLocalDeviceRegistry('local');

      const idbAnnos = await new Promise((resolve) => {
        const tx = dbInstance.transaction('annotations', 'readonly');
        const store = tx.objectStore('annotations');
        const req1 = store.get('usr_local::lec_w_anno_1');
        req1.onsuccess = () => {
          const req2 = store.get('usr_local::lec_w_anno_2');
          req2.onsuccess = () => {
            resolve({
              anno1: req1.result,
              anno2: req2.result
            });
          };
        };
      });

      const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

      const expectedSubjects = [{ id: 9901, name: 'Guest Pharmacotherapy W', _updatedAt: 1000, groups: [] }];
      const targetWeekIso = getLocalIsoDate(getWeekStartDateForDate(new Date(), 6));
      const expectedPlannerPrefs = { weekStartDay: 6, dayStartHour: 7, dayEndHour: 22, autoCompletePct: 80, currentWeekStartIso: targetWeekIso };
      const expectedAcademy = ['mod_w1', 'mod_w2'];
      const expectedMediaReg = { 'lec_w_1': { pdfUploaded: true, ownerUid: 'local' } };

      return {
        matchSubs: eq(subs, expectedSubjects),
        matchEvents: sched.events?.[0]?.id === 9902 && sched.events?.[0]?.title === 'Guest Clinical Session W' && sched.events?.[0]?.subjectId === 9901,
        matchBacklog: backlog?.[0]?.id === 9903 && backlog?.[0]?.title === 'Guest Task W',
        matchPrefs: eq(prefs, expectedPlannerPrefs),
        matchReports: reports?.[0]?.id === 'rep_w_1' && reports?.[0]?.weekStartIso === targetWeekIso && reports?.[0]?.score === 95,
        matchLogs: logsStorage?.some(l => l.id === 'log_w_1' && l.text === 'Guest Study Log W' && l.timestamp === 1730000000000),
        matchAcademy: eq(academy, expectedAcademy),
        matchMediaReg: eq(mediaReg, expectedMediaReg),
        matchStones: stones?.subjects?.['sub_del_w']?.id === 'sub_del_w' && stones?.subjects?.['sub_del_w']?.operationId === 'op_del_w1',
        matchRecs: recs?.some(r => r.recoveryId === 'rec_w_1' && r.scopeId === 'scope_w1'),
        matchDevReg: devReg?.['dev_w_test']?.deviceId === 'dev_w_test' && devReg?.['dev_w_test']?.lastActorId === 'act_w1',
        matchAnno1: idbAnnos.anno1?.pages?.['1']?.[0]?.id === 'strk_w1' && idbAnnos.anno1?.pages?.['1']?.[0]?.color === '#00ff00',
        matchAnno2: idbAnnos.anno2?.pages?.['1']?.[0]?.id === 'strk_w2' && idbAnnos.anno2?.pages?.['1']?.[0]?.tool === 'highlighter',
        isDirty: localStorage.getItem('pharmaWorkspaceDirty') === '1'
      };
    }, targetQId);

    assert(
      resW3.matchSubs === true &&
      resW3.matchEvents === true &&
      resW3.matchBacklog === true &&
      resW3.matchPrefs === true &&
      resW3.matchReports === true &&
      resW3.matchLogs === true &&
      resW3.matchAcademy === true &&
      resW3.matchMediaReg === true &&
      resW3.matchStones === true &&
      resW3.matchRecs === true &&
      resW3.matchDevReg === true &&
      resW3.matchAnno1 === true &&
      resW3.matchAnno2 === true &&
      resW3.isDirty === true,
      'Test W.3 (M5-A.2.1): After Reload #2, all restored workspace data, canonical tombstones, conflict recovery, device registry, and IndexedDB annotations remain intact and consistent with exact content match',
      JSON.stringify(resW3)
    );

    // 6. Failure injection tests in real Chromium
    const resW4 = await page.evaluate(async () => {
      // 6a: Missing manifest entry
      const badQId1 = 'q_bad_nomanifest_' + Date.now();
      localStorage.setItem('pharmaGuestQuarantine_' + badQId1, JSON.stringify({
        quarantineId: badQId1,
        annotationsVaultKey: 'vault_' + badQId1,
        annotationsCount: 1
      }));
      const missingManifestRes = await restoreUnverifiedGuestWorkspace(badQId1);

      // 6b: Missing vault record
      const badQId2 = 'q_bad_novault_' + Date.now();
      localStorage.setItem('pharmaGuestQuarantine_' + badQId2, JSON.stringify({
        quarantineId: badQId2,
        annotationsVaultKey: 'nonexistent_vault_' + badQId2,
        annotationsCount: 1
      }));
      const existingManifest = JSON.parse(localStorage.getItem('pharmaGuestQuarantine_manifest') || '[]');
      existingManifest.unshift({
        quarantineId: badQId2,
        annotationsVaultKey: 'nonexistent_vault_' + badQId2,
        annotationsCount: 1,
        counts: { annotations: 1 }
      });
      localStorage.setItem('pharmaGuestQuarantine_manifest', JSON.stringify(existingManifest));
      const missingVaultRes = await restoreUnverifiedGuestWorkspace(badQId2);

      return {
        missingManifestRes,
        missingVaultRes
      };
    });

    assert(
      resW4.missingManifestRes &&
      resW4.missingManifestRes.ok === false &&
      resW4.missingManifestRes.reason === 'missing_manifest_entry' &&
      resW4.missingVaultRes &&
      resW4.missingVaultRes.ok === false &&
      resW4.missingVaultRes.restored === false &&
      resW4.missingVaultRes.reason === 'missing_annotation_vault_record',
      'Test W.4 (M5-A.2.1): In real Chromium, restoreUnverifiedGuestWorkspace rejects missing manifest entry and aborts with missing_annotation_vault_record when vault record is absent',
      JSON.stringify(resW4)
    );

    // =========================================================================
    // TEST X (Milestone M5-B): Real Browser Annotation Decoupling & Mutation Version
    // =========================================================================
    console.log('\n--- TEST X (Milestone M5-B): Real Browser Annotation Decoupling & Mutation Version ---');
    const pageX = await context.newPage();
    await pageX.goto(page.url(), { waitUntil: 'domcontentloaded' });
    await pageX.waitForFunction(() => typeof initPdfDB === 'function');

    const resX = await pageX.evaluate(async () => {
      const uidX = 'user_m5b_e2e_x';
      supabaseClient = null;
      await handleAuthSessionChange({ id: uidX, email: 'userx@exo.edu', name: 'User X' }, false);
      const ctxX = createAccountOperationContext();

      // Seed 2 annotations in real IndexedDB
      await restoreAllAnnotationsMapToDB({
        'lec_x_1': { 1: [{ id: 'str_x_1', tool: 'pen', color: '#38bdf8', points: [[10, 10], [50, 50]] }] },
        'lec_x_2': { 1: [{ id: 'str_x_2', tool: 'pen', color: '#10b981', points: [[20, 20], [60, 60]] }] }
      }, uidX, ctxX);

      // Verify mutation version counter advanced
      const initialVer = annotationMutationSeq;
      bumpAnnotationMutationVersion();
      const bumpedVer = annotationMutationSeq;

      // Perform a direct switch to uidY to trigger outgoing snapshot persistence
      const uidY = 'user_m5b_e2e_y';
      await handleAuthSessionChange({ id: uidY, email: 'usery@exo.edu', name: 'User Y' }, false);

      // Inspect persisted snapshot in localStorage for uidX
      const snapXRaw = localStorage.getItem(`pharmaAccountWorkspace_${uidX}`);
      const snapX = JSON.parse(snapXRaw || 'null');

      // Hydrate uidX back and verify annotations in IndexedDB are untouched
      await handleAuthSessionChange({ id: uidX, email: 'userx@exo.edu', name: 'User X' }, false);
      const idbMapBack = await getAllAnnotationsMapFromDB(uidX);

      // Verify in-flight push concurrency with version tracking
      let capturedInFlightVer = 0;
      supabaseClient = {
        rpc: async (name, params) => {
          capturedInFlightVer = annotationMutationSeq;
          // User makes another edit while RPC is in flight:
          bumpAnnotationMutationVersion();
          return { data: { status: 'success', revision: 25 }, error: null };
        }
      };
      navigator.onLine = true;
      const pushRes = await pushWorkspaceToCloud(false, true, createAccountOperationContext());

      return {
        initialVer,
        bumpedVer,
        snapXStoredInIDB: snapX?.annotationsStoredInIndexedDB === true,
        snapXHasAnnotations: snapX?.annotations !== undefined,
        idbHasLec1: Boolean(idbMapBack?.verifiedMap?.lec_x_1),
        idbHasLec2: Boolean(idbMapBack?.verifiedMap?.lec_x_2),
        pushSuccess: pushRes?.status === 'success',
        dirtyAnnotationsRemains: dirtyAnnotationsForCloud === true,
        workspaceDirtyRemains: localStorage.getItem('pharmaWorkspaceDirty') === '1'
      };
    });

    assert(
      resX.bumpedVer > resX.initialVer &&
      resX.snapXStoredInIDB === true &&
      resX.snapXHasAnnotations === false &&
      resX.idbHasLec1 === true &&
      resX.idbHasLec2 === true,
      'Test X.1 (M5-B): Real Chromium switches account with metadata-only snapshot (annotationsStoredInIndexedDB: true, annotations: undefined) and hydrates annotations cleanly from IndexedDB',
      JSON.stringify(resX)
    );

    assert(
      resX.pushSuccess === true &&
      resX.dirtyAnnotationsRemains === true &&
      resX.workspaceDirtyRemains === true,
      'Test X.2 (M5-B): In real Chromium, annotation mutation during in-flight cloud push prevents clearing dirty flags upon response',
      JSON.stringify(resX)
    );

    // Test X.3: Real Chromium page reload with decoupled snapshot retains full IndexedDB annotations
    await pageX.reload({ waitUntil: 'domcontentloaded' });
    await pageX.waitForFunction(() => typeof initPdfDB === 'function');
    const resX3 = await pageX.evaluate(async () => {
      const uidX = 'user_m5b_e2e_x';
      await handleAuthSessionChange({ id: uidX, email: 'userx@exo.edu', name: 'User X' }, false);
      const idbMapAfterReload = await getAllAnnotationsMapFromDB(uidX);
      const snapAfterReload = JSON.parse(localStorage.getItem(`pharmaAccountWorkspace_${uidX}`) || 'null');
      return {
        snapStoredInIDB: snapAfterReload?.annotationsStoredInIndexedDB === true,
        snapHasAnnotations: snapAfterReload?.annotations !== undefined,
        idbHasLec1: Boolean(idbMapAfterReload?.verifiedMap?.lec_x_1),
        idbHasLec2: Boolean(idbMapAfterReload?.verifiedMap?.lec_x_2)
      };
    });
    assert(
      resX3.snapStoredInIDB === true &&
      resX3.snapHasAnnotations === false &&
      resX3.idbHasLec1 === true &&
      resX3.idbHasLec2 === true,
      'Test X.3 (M5-B): Real Chromium reload with decoupled metadata-only snapshot retains full IndexedDB annotations across browser reload',
      JSON.stringify(resX3)
    );

    // ============================================================================
    // TEST Y (Milestone M6): Tier A Complete Backup & Restore + Supabase Diagnostics
    // ============================================================================
    console.log('\n--- TEST Y (Milestone M6): Tier A Complete Backup & Restore + Supabase Diagnostics ---');
    const pageY = await context.newPage();
    await pageY.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await pageY.waitForFunction(() => typeof exportWorkspaceBackupV4 === 'function');

    const resY1 = await pageY.evaluate(async () => {
      const uidY = 'user_m6_e2e_y';
      await handleAuthSessionChange({ id: uidY, email: 'usery@exo.edu', name: 'User Y' }, false);
      const ctxY = createAccountOperationContext(uidY);

      // Seed subjects, schedule, logs, and IDB annotations
      subjects = [{ id: 'sub_y_1', name: 'Biochemistry E2E', chapters: [{ id: 'ch_y_1', lectures: [{ id: 'lec_y_1', name: 'Enzymes' }] }] }];
      scheduleEvents = [{ id: 'ev_y_1', title: 'Review Kinetics' }];
      logs = [{ id: 'log_y_1', duration: 45 }];
      saveSubjects();
      saveScheduleData();
      saveLogs();

      saveAnnotationsToDB('lec_y_1', {
        1: [{ id: 'str_y_1', tool: 'pen', color: '#10b981', points: [[10, 10], [20, 20]] }]
      }, null, ctxY);
      await flushPendingAnnotationsSave(false, ctxY);

      // Export v4 backup
      const backupV4 = await exportWorkspaceBackupV4(uidY, ctxY);
      const inspectRes = await inspectWorkspaceBackup(JSON.stringify(backupV4));

      return {
        schema: backupV4?.schema,
        version: backupV4?.version,
        hasSha: typeof backupV4?.integrity?.sha256 === 'string' && backupV4.integrity.sha256.length === 64,
        isValid: inspectRes?.isValid === true,
        integrityValid: inspectRes?.integrityStatus === 'valid',
        subjectsCount: inspectRes?.stats?.subjectsCount,
        annotationLecturesCount: inspectRes?.stats?.annotationLecturesCount,
        backupJson: JSON.stringify(backupV4)
      };
    });

    assert(
      resY1.schema === 'exo_workspace_backup_v4' &&
      resY1.version === 4 &&
      resY1.hasSha === true &&
      resY1.isValid === true &&
      resY1.integrityValid === true &&
      resY1.subjectsCount === 1 &&
      resY1.annotationLecturesCount === 1,
      'Test Y.1 (M6): Real Chromium exports complete v4 Tier A backup with valid canonical SHA-256 integrity checksum and matching stats',
      JSON.stringify(resY1)
    );

    // Test Y.2: Preflight modal display and Replace restore in Real Chromium
    const resY2 = await pageY.evaluate(async (backupJson) => {
      const uidY = 'user_m6_e2e_y';
      const ctxY = createAccountOperationContext(uidY);

      // Create a replace backup with distinct content
      const replaceObj = JSON.parse(backupJson);
      replaceObj.data.subjects = [{ id: 'sub_y_replaced', name: 'Molecular Biology Replaced', groups: [], chapters: [] }];
      replaceObj.data.annotations = {
        'lec_y_replaced': { 1: [{ id: 'str_y_rep', tool: 'highlighter', color: '#fbbf24', points: [[5, 5]] }] }
      };
      const canonStr = canonicalizeJson(replaceObj.data);
      replaceObj.integrity.byteLength = new TextEncoder().encode(canonStr).length;
      replaceObj.integrity.sha256 = await computeCanonicalSha256(canonStr);

      // Run Replace Restore
      const restoreRes = await importWorkspaceBackupV4(replaceObj, 'replace', uidY, ctxY);
      const idbAfter = await getAllAnnotationsMapFromDB(uidY, ctxY);

      return {
        restoreOk: restoreRes?.ok === true,
        restoreMode: restoreRes?.mode,
        restoreReason: restoreRes?.reason,
        hasReplacedSub: subjects.some(s => s.id === 'sub_y_replaced'),
        oldSubGone: !subjects.some(s => s.id === 'sub_y_1'),
        hasReplacedAnno: Boolean(idbAfter?.verifiedMap?.lec_y_replaced),
        oldAnnoGone: !Boolean(idbAfter?.verifiedMap?.lec_y_1),
        isDirty: localStorage.getItem('pharmaWorkspaceDirty') === '1',
        dirtyAnno: dirtyAnnotationsForCloud === true
      };
    }, resY1.backupJson);

    assert(
      resY2.restoreOk === true &&
      resY2.restoreMode === 'replace' &&
      resY2.hasReplacedSub === true &&
      resY2.oldSubGone === true &&
      resY2.hasReplacedAnno === true &&
      resY2.oldAnnoGone === true &&
      resY2.isDirty === true &&
      resY2.dirtyAnno === true,
      'Test Y.2 (M6): Real Chromium replace mode restore atomically replaces active workspace & IndexedDB annotations and marks workspace dirty',
      JSON.stringify(resY2)
    );

    // Test Y.3: Merge restore and Preflight modal DOM verification
    const resY3 = await pageY.evaluate(async (originalBackupJson) => {
      const uidY = 'user_m6_e2e_y';
      const ctxY = createAccountOperationContext(uidY);

      // Perform merge restore of original backup
      const mergeRes = await importWorkspaceBackupV4(originalBackupJson, 'merge', uidY, ctxY);
      const idbAfterMerge = await getAllAnnotationsMapFromDB(uidY, ctxY);

      // Verify Preflight Modal DOM elements exist
      const modalEl = document.getElementById('backupImportPreflightModalOverlay');
      const inspectMeta = await inspectWorkspaceBackup(originalBackupJson);

      return {
        mergeOk: mergeRes?.ok === true,
        mergeMode: mergeRes?.mode,
        mergeReason: mergeRes?.reason,
        hasBothSubs: subjects.some(s => s.id === 'sub_y_replaced') && subjects.some(s => s.id === 'sub_y_1'),
        hasBothAnnos: Boolean(idbAfterMerge?.verifiedMap?.lec_y_replaced) && Boolean(idbAfterMerge?.verifiedMap?.lec_y_1),
        modalExistsInDOM: Boolean(modalEl),
        inspectValid: inspectMeta?.isValid === true,
        inspectIntegrity: inspectMeta?.integrityStatus === 'valid'
      };
    }, resY1.backupJson);

    assert(
      resY3.mergeOk === true &&
      resY3.mergeMode === 'merge' &&
      resY3.hasBothSubs === true &&
      resY3.hasBothAnnos === true &&
      resY3.modalExistsInDOM === true &&
      resY3.inspectValid === true,
      'Test Y.3 (M6): Real Chromium merge restore non-destructively unites subjects and lecture annotations, and preflight modal DOM is verified',
      JSON.stringify(resY3)
    );

    // Test Y.4: Tampering fail-closed rejection and WP-8 Supabase Error Classification in Real Chromium
    const resY4 = await pageY.evaluate(async (validBackupJson) => {
      const uidY = 'user_m6_e2e_y';
      const ctxY = createAccountOperationContext(uidY);

      // Tamper backup data by modifying one character preserving byte length without updating sha256
      const tamperedObj = JSON.parse(validBackupJson);
      tamperedObj.data.schedule.events[0].id = 'ev_y_2'; // preserves byteLength, alters SHA-256
      const tamperedRes = await importWorkspaceBackupV4(tamperedObj, 'merge', uidY, ctxY);

      // WP-8 Diagnostics check in browser
      const diagOffline = classifySupabaseError(new TypeError('Failed to fetch'));
      const diagUnauthorized = classifySupabaseError({ status: 401, message: 'JWT expired' });
      const diagMissingRpc = classifySupabaseError({ status: 404, message: 'function does not exist' });
      const diagSigMismatch = classifySupabaseError({ code: '42883', message: 'function sync_workspace_with_concurrency(jsonb) does not exist with given arguments' });
      const diagRls = classifySupabaseError({ status: 403, code: '42501', message: 'violates row-level security policy' });
      const diagOcc = classifySupabaseError(null, { status: 'conflict', current_revision: 99 });
      const diagSanitized = sanitizeTechnicalErrorDetail('Error with token Bearer eyJhbGci.secret123 and password=pass123');

      return {
        tamperedOk: tamperedRes?.ok === false,
        tamperedReason: tamperedRes?.reason,
        offlineCat: diagOffline?.category,
        unauthCat: diagUnauthorized?.category,
        missingRpcCat: diagMissingRpc?.category,
        sigMismatchCat: diagSigMismatch?.category,
        rlsCat: diagRls?.category,
        occCat: diagOcc?.category,
        allPreserveDirty: diagOffline?.preservesDirty && diagUnauthorized?.preservesDirty && diagSigMismatch?.preservesDirty && diagRls?.preservesDirty,
        tokenRedacted: !diagSanitized.includes('eyJhbGci') && diagSanitized.includes('[REDACTED]'),
        passwordRedacted: !diagSanitized.includes('pass123') && diagSanitized.includes('password=[REDACTED]')
      };
    }, resY1.backupJson);

    assert(
      resY4.tamperedOk === true &&
      resY4.tamperedReason === 'INTEGRITY_MISMATCH' &&
      resY4.offlineCat === 'offline' &&
      resY4.unauthCat === 'unauthorized' &&
      resY4.missingRpcCat === 'missing_rpc' &&
      resY4.sigMismatchCat === 'function_signature_mismatch' &&
      resY4.rlsCat === 'permission_denied' &&
      resY4.occCat === 'occ_conflict' &&
      resY4.allPreserveDirty === true &&
      resY4.tokenRedacted === true &&
      resY4.passwordRedacted === true,
      'Test Y.4 (M6 WP-7 & WP-8): Real Chromium rejects tampered backup fail-closed via SHA-256 mismatch, deterministically classifies Supabase errors, and redacts secrets',
      JSON.stringify(resY4)
    );

    // Test Y.5: Real Chromium Crash Recovery across phases (PREPARE, APPLY_IDB, COMMITTED)
    const resY5 = await pageY.evaluate(async () => {
      const uidCrash = 'user_m6_e2e_crash_phases';
      await handleAuthSessionChange({ id: uidCrash, email: 'usercrash@exo.edu', name: 'User Crash' }, false);
      const ctxCrash = createAccountOperationContext(uidCrash);

      // Scenario 1: Interrupted at APPLY_IDB (pre-COMMITTED) -> Should safely roll back
      const journalKey = toScopedKey('__import_journal_v1__', uidCrash);
      localStorage.setItem('pharmaSubjectsV4', JSON.stringify([{ id: 'sub_uncommitted', name: 'مادة غير مثبتة' }]));
      localStorage.setItem('pharmaImportTxState_' + uidCrash, JSON.stringify({ phase: 'APPLY_IDB', mode: 'replace', startedAt: Date.now() }));
      localStorage.setItem('pharmaImportBarrier_' + uidCrash, JSON.stringify({ txId: 'tx_crash_1', startedAt: Date.now() }));

      await new Promise((resolve, reject) => {
        const tx = dbInstance.transaction('annotation_recovery_vault', 'readwrite');
        const store = tx.objectStore('annotation_recovery_vault');
        store.put({
          id: journalKey,
          userId: uidCrash,
          phase: 'APPLY_IDB',
          mode: 'replace',
          preImportSnapshot: {
            localStorage: {
              pharmaSubjectsV4: { existed: true, value: JSON.stringify([{ id: 'sub_durable_restored', name: 'مادة أصلية مسترجعة' }]) }
            },
            annotations: {}
          }
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      const recoverPreCommitRes = await recoverPendingImportJournalIfNeeded(uidCrash, ctxCrash);

      // Scenario 2: Interrupted at COMMITTED -> Should safely finalize
      localStorage.setItem('pharmaImportTxState_' + uidCrash, JSON.stringify({ phase: 'COMMITTED', mode: 'replace', startedAt: Date.now() }));
      localStorage.setItem('pharmaImportBarrier_' + uidCrash, JSON.stringify({ txId: 'tx_crash_2', startedAt: Date.now() }));
      await new Promise((resolve, reject) => {
        const tx = dbInstance.transaction('annotation_recovery_vault', 'readwrite');
        const store = tx.objectStore('annotation_recovery_vault');
        store.put({
          id: journalKey,
          userId: uidCrash,
          phase: 'COMMITTED',
          mode: 'replace',
          preImportSnapshot: { localStorage: {}, annotations: {} }
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      const recoverCommittedRes = await recoverPendingImportJournalIfNeeded(uidCrash, ctxCrash);

      return {
        preCommitRecovered: recoverPreCommitRes?.recovered === true,
        preCommitAction: recoverPreCommitRes?.action,
        preCommitRestoredContent: localStorage.getItem('pharmaSubjectsV4')?.includes('مادة أصلية مسترجعة'),
        preCommitBarrierCleared: localStorage.getItem('pharmaImportBarrier_' + uidCrash) === null,
        committedRecovered: recoverCommittedRes?.recovered === true,
        committedAction: recoverCommittedRes?.action,
        committedBarrierCleared: localStorage.getItem('pharmaImportBarrier_' + uidCrash) === null
      };
    });

    assert(
      resY5.preCommitRecovered === true &&
      resY5.preCommitAction === 'rolled_back' &&
      resY5.preCommitRestoredContent === true &&
      resY5.preCommitBarrierCleared === true &&
      resY5.committedRecovered === true &&
      resY5.committedAction === 'finalized' &&
      resY5.committedBarrierCleared === true,
      'Test Y.5 (M6): Real Chromium crash recovery rolls back pre-COMMITTED phase and finalizes COMMITTED phase from durable IndexedDB vault',
      JSON.stringify(resY5)
    );

    // Test Y.6: Missing journal record with pointer & corrupt journal record trigger fail-closed quarantine
    const resY6 = await pageY.evaluate(async () => {
      const uidMissing = 'user_m6_quar_missing';
      await handleAuthSessionChange({ id: uidMissing, email: 'usermissing@exo.edu', name: 'User Missing' }, false);
      const ctxMissing = createAccountOperationContext(uidMissing);

      // Case 1: LocalStorage pointer exists, but IndexedDB vault has NO journal entry -> Quarantine
      localStorage.setItem('pharmaImportTxState_' + uidMissing, JSON.stringify({ phase: 'COMMITTED', mode: 'merge', startedAt: Date.now() }));
      const missingVaultRes = await recoverPendingImportJournalIfNeeded(uidMissing, ctxMissing);

      // Case 2: IndexedDB vault has corrupt/unrecognized journal -> Quarantine (isolated user)
      const uidCorrupt = 'user_m6_quar_corrupt';
      await handleAuthSessionChange({ id: uidCorrupt, email: 'usercorrupt@exo.edu', name: 'User Corrupt' }, false);
      const ctxCorrupt = createAccountOperationContext(uidCorrupt);
      const corruptKey = toScopedKey('__import_journal_v1__', uidCorrupt);
      await new Promise((resolve, reject) => {
        const tx = dbInstance.transaction('annotation_recovery_vault', 'readwrite');
        const store = tx.objectStore('annotation_recovery_vault');
        store.put({ id: corruptKey, userId: uidCorrupt, phase: 'CORRUPTED_PHASE' });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      const corruptVaultRes = await recoverPendingImportJournalIfNeeded(uidCorrupt, ctxCorrupt);

      return {
        missingQuarantined: missingVaultRes?.quarantine === true && missingVaultRes?.reason === 'MISSING_JOURNAL_RECORD',
        missingFlagStored: localStorage.getItem('pharmaImportQuarantine_' + uidMissing) !== null,
        corruptQuarantined: corruptVaultRes?.quarantine === true && corruptVaultRes?.reason === 'CORRUPT_JOURNAL',
        corruptFlagStored: localStorage.getItem('pharmaImportQuarantine_' + uidCorrupt) !== null
      };
    });

    assert(
      resY6.missingQuarantined === true &&
      resY6.missingFlagStored === true &&
      resY6.corruptQuarantined === true &&
      resY6.corruptFlagStored === true,
      'Test Y.6 (M6): Real Chromium missing or corrupt journal in IndexedDB triggers fail-closed quarantine and locks account',
      JSON.stringify(resY6)
    );

    // Test Y.7: Cloud Push & Pull operations are strictly blocked when account import barrier or quarantine is active
    const resY7 = await pageY.evaluate(async () => {
      const uidGate = 'user_m6_e2e_gate_test';
      await handleAuthSessionChange({ id: uidGate, email: 'usergate@exo.edu', name: 'User Gate' }, false);
      const ctxGate = createAccountOperationContext(uidGate);

      // 1. Test barrier blocks push & pull
      localStorage.setItem('pharmaImportBarrier_' + uidGate, JSON.stringify({ txId: 'tx_gate_active', startedAt: Date.now() }));
      const pushBlocked = await pushWorkspaceToCloud(false, false, ctxGate);
      const pullBlocked = await pullWorkspaceFromCloud(false, ctxGate);
      localStorage.removeItem('pharmaImportBarrier_' + uidGate);

      // 2. Test quarantine blocks push & pull
      localStorage.setItem('pharmaImportQuarantine_' + uidGate, JSON.stringify({ quarantinedAt: Date.now(), reason: 'fault_injection' }));
      const pushQuarBlocked = await pushWorkspaceToCloud(false, false, ctxGate);
      const pullQuarBlocked = await pullWorkspaceFromCloud(false, ctxGate);
      localStorage.removeItem('pharmaImportQuarantine_' + uidGate);

      return {
        barrierPushBlocked: pushBlocked?.status === 'aborted' && pushBlocked?.reason === 'import_in_progress',
        barrierPullBlocked: pullBlocked?.status === 'aborted' && pullBlocked?.reason === 'import_in_progress',
        quarPushBlocked: pushQuarBlocked?.status === 'aborted' && pushQuarBlocked?.reason === 'quarantine_active',
        quarPullBlocked: pullQuarBlocked?.status === 'aborted' && pullQuarBlocked?.reason === 'quarantine_active'
      };
    });

    assert(
      resY7.barrierPushBlocked === true &&
      resY7.barrierPullBlocked === true &&
      resY7.quarPushBlocked === true &&
      resY7.quarPullBlocked === true,
      'Test Y.7 (M6): Real Chromium cloud push and pull are blocked fail-closed when account import barrier or quarantine is active',
      JSON.stringify(resY7)
    );

    console.log('\n--- TEST Z (Milestone M6 Critical Fix 9): Real Chromium Page Close/Reload Recovery & Two-Tab Competition ---');

    // Test Z.1: Interrupted APPLY_IDB -> Close Page -> Open New Page -> Natural Startup Rollback
    const uidZ1 = 'user_z1_precommit_reload';
    await pageY.evaluate(async (uid) => {
      localStorage.setItem('pharmaActiveAccountSessionV1', JSON.stringify({ id: uid, email: 'z1@exo.edu', name: 'User Z1' }));
      await handleAuthSessionChange({ id: uid, email: 'z1@exo.edu', name: 'User Z1' }, false);
      const ctx = createAccountOperationContext(uid);

      // Seed pre-import baseline
      localStorage.setItem('pharmaSubjectsV4', JSON.stringify([{ id: 'sub_z1_baseline', name: 'أصلية' }]));
      localStorage.setItem('pharmaAccountWorkspace_' + uid, JSON.stringify({ subjects: [{ id: 'sub_z1_baseline', name: 'أصلية' }] }));
      saveAnnotationsToDB('lec_z1_test', { 1: [{ id: 'str_z1_base', tool: 'pen' }] }, null, ctx);
      await flushPendingAnnotationsSave(false, ctx);

      // Construct uncommitted APPLY_IDB crash state
      const preSnapshot = {
        localStorage: {
          pharmaSubjectsV4: { existed: true, value: JSON.stringify([{ id: 'sub_z1_baseline', name: 'أصلية' }]) },
          ['pharmaAccountWorkspace_' + uid]: { existed: true, value: JSON.stringify({ subjects: [{ id: 'sub_z1_baseline', name: 'أصلية' }] }) }
        },
        annotations: {
          [toScopedKey('lec_z1_test', uid)]: { id: toScopedKey('lec_z1_test', uid), userId: uid, pages: { 1: [{ id: 'str_z1_base', tool: 'pen' }] } }
        }
      };

      // Mutate workspace in-flight
      localStorage.setItem('pharmaSubjectsV4', JSON.stringify([{ id: 'sub_z1_mutated_crash', name: 'معدلة بالخطأ' }]));
      saveAnnotationsToDB('lec_z1_test', { 1: [{ id: 'str_z1_crashed', tool: 'highlighter' }] }, null, ctx);
      await flushPendingAnnotationsSave(false, ctx);

      // Persist APPLY_IDB journal in vault & write pointer/barrier
      const jKey = toScopedKey('__import_journal_v1__', uid);
      await new Promise((resolve, reject) => {
        const tx = dbInstance.transaction('annotation_recovery_vault', 'readwrite');
        tx.objectStore('annotation_recovery_vault').put({
          id: jKey,
          txId: 'tx_z1_crash',
          userId: uid,
          phase: 'APPLY_IDB',
          mode: 'replace',
          preImportSnapshot: preSnapshot
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      localStorage.setItem('pharmaImportTxState_' + uid, JSON.stringify({ phase: 'APPLY_IDB', mode: 'replace', startedAt: Date.now() }));
      localStorage.setItem('pharmaImportBarrier_' + uid, JSON.stringify({ txId: 'tx_z1_crash', startedAt: Date.now() }));
    }, uidZ1);

    // Hard page close to simulate browser crash
    await pageY.close();

    // Reopen in fresh page within the same browser context & profile
    const pageZ1 = await context.newPage();
    await pageZ1.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await pageZ1.waitForTimeout(500);

    const resZ1 = await pageZ1.evaluate(async (uid) => {
      if (!dbInstance && typeof initPdfDB === 'function') {
        try { await initPdfDB(); } catch (e) {}
      }
      const ctx = createAccountOperationContext(uid);

      // Verify journal deleted from vault
      const jKey = toScopedKey('__import_journal_v1__', uid);
      let vaultRecord = null;
      try {
        vaultRecord = await new Promise(resolve => {
          const tx = dbInstance.transaction('annotation_recovery_vault', 'readonly');
          const req = tx.objectStore('annotation_recovery_vault').get(jKey);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });
      } catch (e) {
        vaultRecord = null;
      }

      // Verify restored annotations
      const annosRes = await getAllAnnotationsMapFromDB(uid, ctx);
      const subjectsRaw = localStorage.getItem('pharmaSubjectsV4') || '';

      return {
        pointerCleared: localStorage.getItem('pharmaImportTxState_' + uid) === null,
        barrierCleared: localStorage.getItem('pharmaImportBarrier_' + uid) === null,
        vaultCleaned: (vaultRecord === null || vaultRecord === undefined),
        vaultRecordRaw: vaultRecord,
        subjectsRestored: subjectsRaw.includes('sub_z1_baseline'),
        crashedSubjectAbsent: !subjectsRaw.includes('sub_z1_mutated_crash'),
        annotationsRestored: annosRes?.verifiedMap?.['lec_z1_test']?.[1]?.[0]?.id === 'str_z1_base'
      };
    }, uidZ1);

    assert(
      resZ1.pointerCleared === true &&
      resZ1.barrierCleared === true &&
      resZ1.vaultCleaned === true &&
      resZ1.subjectsRestored === true &&
      resZ1.crashedSubjectAbsent === true &&
      resZ1.annotationsRestored === true,
      'Test Z.1 (M6): Real Chromium close & reload automatically rolls back interrupted APPLY_IDB and restores baseline state',
      JSON.stringify(resZ1)
    );

    // Test Z.2: Interrupted COMMITTED -> Close Page -> Open New Page -> Natural Startup Finalization
    const uidZ2 = 'user_z2_committed_reload';
    await pageZ1.evaluate(async (uid) => {
      localStorage.setItem('pharmaActiveAccountSessionV1', JSON.stringify({ id: uid, email: 'z2@exo.edu', name: 'User Z2' }));
      await handleAuthSessionChange({ id: uid, email: 'z2@exo.edu', name: 'User Z2' }, false);
      const ctx = createAccountOperationContext(uid);

      // Seed committed state in IDB and localStorage
      localStorage.setItem('pharmaSubjectsV4', JSON.stringify([{ id: 'sub_z2_committed', name: 'مؤكدة' }]));
      saveAnnotationsToDB('lec_z2_test', { 1: [{ id: 'str_z2_committed', tool: 'pen' }] }, null, ctx);
      await flushPendingAnnotationsSave(false, ctx);

      // Persist COMMITTED journal in vault
      const jKey = toScopedKey('__import_journal_v1__', uid);
      await new Promise((resolve, reject) => {
        const tx = dbInstance.transaction('annotation_recovery_vault', 'readwrite');
        tx.objectStore('annotation_recovery_vault').put({
          id: jKey,
          txId: 'tx_z2_comm',
          userId: uid,
          phase: 'COMMITTED',
          mode: 'merge',
          preImportSnapshot: { localStorage: {}, annotations: {} }
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      localStorage.setItem('pharmaImportTxState_' + uid, JSON.stringify({ phase: 'COMMITTED', mode: 'merge', startedAt: Date.now() }));
      localStorage.setItem('pharmaImportBarrier_' + uid, JSON.stringify({ txId: 'tx_z2_comm', startedAt: Date.now() }));
    }, uidZ2);

    await pageZ1.close();

    const pageZ2 = await context.newPage();
    await pageZ2.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await pageZ2.waitForTimeout(500);

    const resZ2 = await pageZ2.evaluate(async (uid) => {
      const ctx = createAccountOperationContext(uid);

      const jKey = toScopedKey('__import_journal_v1__', uid);
      const vaultRecord = await new Promise(resolve => {
        const tx = dbInstance.transaction('annotation_recovery_vault', 'readonly');
        const req = tx.objectStore('annotation_recovery_vault').get(jKey);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });

      const annosRes = await getAllAnnotationsMapFromDB(uid, ctx);
      const subjectsRaw = localStorage.getItem('pharmaSubjectsV4') || '';

      return {
        pointerCleared: localStorage.getItem('pharmaImportTxState_' + uid) === null,
        barrierCleared: localStorage.getItem('pharmaImportBarrier_' + uid) === null,
        vaultCleaned: vaultRecord === null,
        committedSubjectsPreserved: subjectsRaw.includes('sub_z2_committed'),
        committedAnnotationsPreserved: annosRes?.verifiedMap?.['lec_z2_test']?.[1]?.[0]?.id === 'str_z2_committed'
      };
    }, uidZ2);

    assert(
      resZ2.pointerCleared === true &&
      resZ2.barrierCleared === true &&
      resZ2.vaultCleaned === true &&
      resZ2.committedSubjectsPreserved === true &&
      resZ2.committedAnnotationsPreserved === true,
      'Test Z.2 (M6): Real Chromium close & reload automatically finalizes COMMITTED phase and cleans all recovery artifacts',
      JSON.stringify(resZ2)
    );

    // Test Z.3: Crash window in FINALIZE (IDB deleted, pointer has phase: 'FINALIZE') -> Clean without quarantine
    const uidZ3 = 'user_z3_fin_crash_reload';
    await pageZ2.evaluate(async (uid) => {
      localStorage.setItem('pharmaActiveAccountSessionV1', JSON.stringify({ id: uid, email: 'z3@exo.edu', name: 'User Z3' }));
      await handleAuthSessionChange({ id: uid, email: 'z3@exo.edu', name: 'User Z3' }, false);
      // Journal is absent in IndexedDB vault!
      // Pointer has FINALIZE phase
      localStorage.setItem('pharmaImportTxState_' + uid, JSON.stringify({ phase: 'FINALIZE', mode: 'merge', startedAt: Date.now() }));
      localStorage.setItem('pharmaImportBarrier_' + uid, JSON.stringify({ txId: 'tx_z3', startedAt: Date.now() }));
    }, uidZ3);

    await pageZ2.close();

    const pageZ3 = await context.newPage();
    await pageZ3.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await pageZ3.waitForTimeout(500);

    const resZ3 = await pageZ3.evaluate(async (uid) => {
      return {
        pointerCleared: localStorage.getItem('pharmaImportTxState_' + uid) === null,
        barrierCleared: localStorage.getItem('pharmaImportBarrier_' + uid) === null,
        notQuarantined: localStorage.getItem('pharmaImportQuarantine_' + uid) === null,
        quarantineMapClean: !activeImportQuarantinesByAccount.has(uid)
      };
    }, uidZ3);

    assert(
      resZ3.pointerCleared === true &&
      resZ3.barrierCleared === true &&
      resZ3.notQuarantined === true &&
      resZ3.quarantineMapClean === true,
      'Test Z.3 (M6): Real Chromium close & reload during FINALIZE safely completes cleanup without false quarantine',
      JSON.stringify(resZ3)
    );

    // Test Z.4: Crash window in FINALIZE (Pointer deleted, only barrier remains) -> Clears barrier without quarantine
    const uidZ4 = 'user_z4_abandoned_barrier';
    await pageZ3.evaluate(async (uid) => {
      localStorage.setItem('pharmaActiveAccountSessionV1', JSON.stringify({ id: uid, email: 'z4@exo.edu', name: 'User Z4' }));
      await handleAuthSessionChange({ id: uid, email: 'z4@exo.edu', name: 'User Z4' }, false);
      localStorage.removeItem('pharmaImportTxState_' + uid);
      localStorage.setItem('pharmaImportBarrier_' + uid, JSON.stringify({ txId: 'tx_z4', startedAt: Date.now() }));
    }, uidZ4);

    await pageZ3.close();

    const pageZ4 = await context.newPage();
    await pageZ4.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await pageZ4.waitForTimeout(500);

    const resZ4 = await pageZ4.evaluate(async (uid) => {
      const ctx = createAccountOperationContext(uid);
      const pushRes = await pushWorkspaceToCloud(false, false, ctx);
      return {
        barrierCleared: localStorage.getItem('pharmaImportBarrier_' + uid) === null,
        notQuarantined: localStorage.getItem('pharmaImportQuarantine_' + uid) === null,
        pushNotBlockedByBarrier: pushRes?.reason !== 'import_in_progress'
      };
    }, uidZ4);

    assert(
      resZ4.barrierCleared === true &&
      resZ4.notQuarantined === true &&
      resZ4.pushNotBlockedByBarrier === true,
      'Test Z.4 (M6): Real Chromium close & reload with abandoned barrier cleans barrier safely and permits normal operations',
      JSON.stringify(resZ4)
    );

    // Test Z.5: Authoritative ROLLBACK_FAILED_QUARANTINE in vault locks account across reload and blocks sync
    const uidZ5 = 'user_z5_durable_lock';
    await pageZ4.evaluate(async (uid) => {
      localStorage.setItem('pharmaActiveAccountSessionV1', JSON.stringify({ id: uid, email: 'z5@exo.edu', name: 'User Z5' }));
      await handleAuthSessionChange({ id: uid, email: 'z5@exo.edu', name: 'User Z5' }, false);
      const jKey = toScopedKey('__import_journal_v1__', uid);
      await new Promise((resolve, reject) => {
        const tx = dbInstance.transaction('annotation_recovery_vault', 'readwrite');
        tx.objectStore('annotation_recovery_vault').put({
          id: jKey,
          txId: 'tx_z5',
          userId: uid,
          phase: 'ROLLBACK_FAILED_QUARANTINE',
          quarantineError: 'TEST_INJECTED_ROLLBACK_FAILURE'
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      localStorage.setItem('pharmaImportTxState_' + uid, JSON.stringify({ phase: 'ROLLBACK_FAILED_QUARANTINE' }));
      localStorage.setItem('pharmaImportBarrier_' + uid, JSON.stringify({ txId: 'tx_z5' }));
    }, uidZ5);

    await pageZ4.close();

    const pageZ5 = await context.newPage();
    await pageZ5.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await pageZ5.waitForTimeout(500);

    const resZ5 = await pageZ5.evaluate(async (uid) => {
      await handleAuthSessionChange({ id: uid, email: 'z5@exo.edu', name: 'User Z5' }, false);
      const ctx = createAccountOperationContext(uid);
      const pushBlocked = await pushWorkspaceToCloud(false, false, ctx);
      const pullBlocked = await pullWorkspaceFromCloud(false, ctx);
      return {
        quarantineMarkerSet: localStorage.getItem('pharmaImportQuarantine_' + uid) !== null,
        quarantineMapLocked: activeImportQuarantinesByAccount.get(uid) === true,
        pushBlockedQuarantine: pushBlocked?.status === 'aborted' && pushBlocked?.reason === 'quarantine_active',
        pullBlockedQuarantine: pullBlocked?.status === 'aborted' && pullBlocked?.reason === 'quarantine_active'
      };
    }, uidZ5);

    assert(
      resZ5.quarantineMarkerSet === true &&
      resZ5.quarantineMapLocked === true &&
      resZ5.pushBlockedQuarantine === true &&
      resZ5.pullBlockedQuarantine === true,
      'Test Z.5 (M6): Real Chromium authoritative ROLLBACK_FAILED_QUARANTINE survives reload and locks account from cloud sync',
      JSON.stringify(resZ5)
    );

    // Test Z.6: Real Two-Tab Competition in Chromium (Tab 1 blocks User A in Tab 2, but User B in Tab 2 succeeds)
    const tab1 = await context.newPage();
    const tab2 = await context.newPage();
    await tab1.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await tab2.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await tab1.waitForTimeout(300);
    await tab2.waitForTimeout(300);

    const uidA_Comp = 'user_z6_tab_comp_a';
    const uidB_Comp = 'user_z6_tab_comp_b';

    // In Tab 1: establish active import barrier and tx state for User A
    await tab1.evaluate(async (uidA) => {
      localStorage.setItem('pharmaActiveAccountSessionV1', JSON.stringify({ id: uidA, email: 'usera@exo.edu', name: 'User A' }));
      await handleAuthSessionChange({ id: uidA, email: 'usera@exo.edu', name: 'User A' }, false);
      localStorage.setItem('pharmaImportTxState_' + uidA, JSON.stringify({
        txId: 'tx_tab1_held',
        phase: 'APPLY_IDB',
        mode: 'merge',
        startedAt: Date.now()
      }));
      localStorage.setItem('pharmaImportBarrier_' + uidA, JSON.stringify({
        txId: 'tx_tab1_held',
        userId: uidA,
        startedAt: Date.now()
      }));
      activeImportBarriersByAccount.set(uidA, true);
    }, uidA_Comp);

    // In Tab 2: attempt import for User A -> MUST BE BLOCKED
    const resTab2UserA = await tab2.evaluate(async (uidA) => {
      await handleAuthSessionChange({ id: uidA, email: 'usera@exo.edu', name: 'User A' }, false);
      const ctxA = createAccountOperationContext(uidA);
      const backupData = {
        schema: 'exo_workspace_backup_v4',
        version: 4,
        accountScopeHint: 'account_' + uidA.slice(0, 8),
        data: { subjects: [], schedule: { events: [] }, logs: [], annotations: {} }
      };
      const canonicalData = canonicalizeJson(backupData.data);
      backupData.integrity = {
        algorithm: 'SHA-256',
        canonicalScope: 'data',
        sha256: await computeCanonicalSha256(canonicalData),
        byteLength: new TextEncoder().encode(canonicalData).length
      };

      const importRes = await importWorkspaceBackupV4(backupData, 'merge', uidA, ctxA);
      return {
        blocked: Boolean(importRes?.reason === 'import_in_progress' || importRes?.reason === 'quarantine_active'),
        status: importRes?.status,
        reason: importRes?.reason
      };
    }, uidA_Comp);

    // In Tab 2: switch to User B and attempt import -> MUST SUCCEED
    const resTab2UserB = await tab2.evaluate(async (uidB) => {
      await handleAuthSessionChange({ id: uidB, email: 'userb@exo.edu', name: 'User B' }, false);
      const ctxB = createAccountOperationContext(uidB);
      const backupData = {
        schema: 'exo_workspace_backup_v4',
        version: 4,
        accountScopeHint: 'account_' + uidB.slice(0, 8),
        data: {
          subjects: [{ id: 'sub_user_b_tab2', name: 'مادة مستخدم ب المستقل' }],
          schedule: { events: [] },
          logs: [],
          annotations: {}
        }
      };
      const canonicalData = canonicalizeJson(backupData.data);
      backupData.integrity = {
        algorithm: 'SHA-256',
        canonicalScope: 'data',
        sha256: await computeCanonicalSha256(canonicalData),
        byteLength: new TextEncoder().encode(canonicalData).length
      };

      const importRes = await importWorkspaceBackupV4(backupData, 'merge', uidB, ctxB);
      return {
        succeeded: importRes?.ok === true && importRes?.status === 'success',
        subjectsWritten: (localStorage.getItem('pharmaSubjectsV4') || '').includes('sub_user_b_tab2')
      };
    }, uidB_Comp);

    // Clean up barriers
    await tab1.evaluate((uidA) => {
      localStorage.removeItem('pharmaImportBarrier_' + uidA);
      localStorage.removeItem('pharmaImportTxState_' + uidA);
      activeImportBarriersByAccount.delete(uidA);
    }, uidA_Comp);

    await tab1.close();
    await tab2.close();
    await pageZ5.close();

    assert(
      resTab2UserA.blocked === true &&
      resTab2UserB.succeeded === true &&
      resTab2UserB.subjectsWritten === true,
      'Test Z.6 (M6): Two real Chromium tabs correctly serialize User A via import lock while allowing independent User B import',
      JSON.stringify({ resTab2UserA, resTab2UserB })
    );

    // ========================================================================
    // TEST AA: Real Production-Path Crash & Restart Recovery (10 Durable Phase Cases)
    // ========================================================================
    // TEST AA: Real Production-Path Crash & Restart Recovery (14 Cases)
    // ========================================================================
    console.log('\n--- TEST AA: Real Production-Path Crash & Restart Recovery (14 Cases) ---');

    const crashCases = [
      { hook: 'crashAfterPrepare', preCommit: true, name: 'AA.1: crash_after_PREPARE' },
      { hook: 'crashAfterApplyIdb', preCommit: true, name: 'AA.2: crash_after_APPLY_IDB' },
      { hook: 'crashAfterApplyLs', preCommit: true, name: 'AA.3: crash_after_APPLY_LOCALSTORAGE' },
      { hook: 'crashAfterCommitted', preCommit: false, name: 'AA.4: crash_after_COMMITTED' },
      { hook: 'crashAfterFinalizePersist', preCommit: false, name: 'AA.5: crash_after_finalize_persist' },
      { hook: 'crashAfterJournalDeleted', preCommit: false, name: 'AA.6: crash_after_journal_deleted' },
      { hook: 'crashBeforePointerCleanup', preCommit: false, name: 'AA.7: crash_before_pointer_cleanup' },
      { hook: 'crashBeforeBarrierCleanup', preCommit: false, name: 'AA.8: crash_before_barrier_cleanup' },
      { hook: 'crashDuringRollback', preCommit: true, name: 'AA.9: crash_during_rollback' },
      { hook: 'crashDuringRollbackCleanup', preCommit: true, name: 'AA.10: crash_during_rollback_cleanup' },
      { hook: 'failRollbackPointerWrite', preCommit: true, name: 'AA.11: fail_rollback_pointer_write' },
      { hook: 'crashAfterRolledBackJournal', preCommit: true, name: 'AA.12: crash_after_rolled_back_journal' },
      { hook: 'crashAfterRolledBackPointer', preCommit: true, name: 'AA.13: crash_after_rolled_back_pointer' },
      { hook: 'crashBeforeRollbackBarrierCleanup', preCommit: true, name: 'AA.14: crash_before_rollback_barrier_cleanup' }
    ];

    for (let i = 0; i < crashCases.length; i++) {
      const tc = crashCases[i];
      const testUid = `user_crash_aa_${i + 1}`;
      const pageCrash = await context.newPage();
      await pageCrash.goto('http://localhost:3000', { waitUntil: 'networkidle' });
      await pageCrash.waitForTimeout(200);

      // In Page 1: setup initial state, install testHook, call actual importWorkspaceBackupV4
      await pageCrash.evaluate(async ({ uid, hook }) => {
        await handleAuthSessionChange({ id: uid, email: `${uid}@exo.edu`, name: `Crash User ${uid}` }, false);
        const ctx = createAccountOperationContext(uid);

        // Pre-import state
        localStorage.setItem('pharmaSubjectsV4', JSON.stringify([{ id: 'sub_baseline', name: 'أصلي' }]));
        saveAnnotationsToDB('lec_orig', { 1: [{ id: 'str_orig', tool: 'pen' }] }, null, ctx);
        await flushPendingAnnotationsSave(false, ctx);

        // Target backup to import
        const targetBackup = {
          schema: 'exo_workspace_backup_v4',
          version: 4,
          accountScopeHint: 'account_' + uid.slice(0, 8),
          data: {
            subjects: [{ id: 'sub_imported', name: 'مستورد' }],
            schedule: { events: [] },
            logs: [],
            annotations: {
              'lec_imported': { 1: [{ id: 'str_imported', tool: 'highlighter' }] }
            }
          }
        };
        const canon = canonicalizeJson(targetBackup.data);
        targetBackup.integrity = {
          algorithm: 'SHA-256',
          canonicalScope: 'data',
          sha256: await computeCanonicalSha256(canon),
          byteLength: new TextEncoder().encode(canon).length
        };

        // Set hook
        window.__exoImportTestHooks = { [hook]: true };

        // For rollback crash hooks, trigger an error that causes rollback:
        const isRollbackHook = [
          'crashDuringRollback',
          'crashDuringRollbackCleanup',
          'failRollbackPointerWrite',
          'crashAfterRolledBackJournal',
          'crashAfterRolledBackPointer',
          'crashBeforeRollbackBarrierCleanup'
        ].includes(hook);
        if (isRollbackHook) {
          window.__exoImportTestHooks.failIdbApply = true;
        }

        try {
          await importWorkspaceBackupV4(targetBackup, 'replace', uid, ctx);
        } catch (e) {
          // Expected test fault crash
        }
      }, { uid: testUid, hook: tc.hook });

      // Close page immediately on crash boundary
      await pageCrash.close();

      // Open new page in same browser context (persisted IndexedDB and localStorage)
      const pageReopen = await context.newPage();
      await pageReopen.goto('http://localhost:3000', { waitUntil: 'networkidle' });
      await pageReopen.waitForTimeout(400);

      // Verify recovery in new page
      const checkRes = await pageReopen.evaluate(async ({ uid, isPreCommit }) => {
        await handleAuthSessionChange({ id: uid, email: `${uid}@exo.edu`, name: `Crash User ${uid}` }, false);
        const ctx = createAccountOperationContext(uid);

        const pointerKey = 'pharmaImportTxState_' + uid;
        const barrierKey = 'pharmaImportBarrier_' + uid;
        const quarantineKey = 'pharmaImportQuarantine_' + uid;
        const jKey = toScopedKey('__import_journal_v1__', uid);

        const vaultRecord = await new Promise(resolve => {
          if (!dbInstance) return resolve(null);
          const tx = dbInstance.transaction('annotation_recovery_vault', 'readonly');
          const req = tx.objectStore('annotation_recovery_vault').get(jKey);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });

        const annosRes = await getAllAnnotationsMapFromDB(uid, ctx);
        const subjectsRaw = localStorage.getItem('pharmaSubjectsV4') || '';

        const pointerCleared = (localStorage.getItem(pointerKey) === null);
        const barrierCleared = (localStorage.getItem(barrierKey) === null);
        const notQuarantined = (localStorage.getItem(quarantineKey) === null) && (!activeImportQuarantinesByAccount.has(uid));
        const vaultCleaned = (vaultRecord === null);

        let dataCorrect = false;
        if (isPreCommit) {
          // Pre-commit crash: rolled back to baseline
          dataCorrect = subjectsRaw.includes('sub_baseline') &&
                        Boolean(annosRes?.verifiedMap?.['lec_orig']?.[1]);
        } else {
          // Post-commit crash: committed target state preserved
          dataCorrect = subjectsRaw.includes('sub_imported') &&
                        Boolean(annosRes?.verifiedMap?.['lec_imported']?.[1]);
        }

        return {
          pointerCleared,
          barrierCleared,
          notQuarantined,
          vaultCleaned,
          dataCorrect,
          subjectsRaw,
          annosKeys: Object.keys(annosRes?.verifiedMap || {})
        };
      }, { uid: testUid, isPreCommit: tc.preCommit });

      await pageReopen.close();

      assert(
        checkRes.pointerCleared === true &&
        checkRes.barrierCleared === true &&
        checkRes.notQuarantined === true &&
        checkRes.vaultCleaned === true &&
        checkRes.dataCorrect === true,
        `Test ${tc.name}: Real Chromium restart correctly handles crash, recovers state without false quarantine`,
        JSON.stringify(checkRes)
      );
    }

    // ========================================================================
    // TEST BB: Two-Tab Competition with Real Web Lock & Mutation Queueing
    // ========================================================================
    console.log('\n--- TEST BB: Two-Tab Competition & Annotation Queueing ---');
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await tabA.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await tabB.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await tabA.waitForTimeout(300);
    await tabB.waitForTimeout(300);

    const uidCompA = 'user_bb_tab_a';
    const uidCompB = 'user_bb_tab_b';

    // In Tab A: start a real import with holdImportAfterLock
    await tabA.evaluate(async (uid) => {
      await handleAuthSessionChange({ id: uid, email: `${uid}@exo.edu`, name: 'User A' }, false);
      const ctx = createAccountOperationContext(uid);

      localStorage.setItem('pharmaSubjectsV4', JSON.stringify([{ id: 'sub_a_initial', name: 'مادة أ أولية' }]));

      const targetBackup = {
        schema: 'exo_workspace_backup_v4',
        version: 4,
        accountScopeHint: 'account_' + uid.slice(0, 8),
        data: {
          subjects: [{ id: 'sub_a_imported', name: 'مادة أ مستوردة' }],
          schedule: { events: [] },
          logs: [],
          annotations: {}
        }
      };
      const canon = canonicalizeJson(targetBackup.data);
      targetBackup.integrity = {
        algorithm: 'SHA-256',
        canonicalScope: 'data',
        sha256: await computeCanonicalSha256(canon),
        byteLength: new TextEncoder().encode(canon).length
      };

      let releaseLock;
      window.__holdLockPromise = new Promise(resolve => { releaseLock = resolve; });
      window.__releaseImportLock = releaseLock;
      window.__exoImportTestHooks = { holdImportAfterLock: window.__holdLockPromise };

      // Start import without awaiting completion
      window.__importPromise = importWorkspaceBackupV4(targetBackup, 'replace', uid, ctx);
    }, uidCompA);

    await tabA.waitForTimeout(300);

    // In Tab B: attempt import for User A -> blocked by lock
    const resTabBUserA = await tabB.evaluate(async (uid) => {
      await handleAuthSessionChange({ id: uid, email: `${uid}@exo.edu`, name: 'User A' }, false);
      const ctx = createAccountOperationContext(uid);
      const backup = {
        schema: 'exo_workspace_backup_v4',
        version: 4,
        data: { subjects: [], schedule: { events: [] }, logs: [], annotations: {} }
      };
      const canon = canonicalizeJson(backup.data);
      backup.integrity = {
        algorithm: 'SHA-256',
        canonicalScope: 'data',
        sha256: await computeCanonicalSha256(canon),
        byteLength: new TextEncoder().encode(canon).length
      };
      const impRes = await importWorkspaceBackupV4(backup, 'replace', uid, ctx);
      return {
        blocked: (impRes?.reason === 'import_in_progress' || impRes?.status === 'error'),
        reason: impRes?.reason
      };
    }, uidCompA);

    // In Tab B: attempt saveAnnotationsToDB for User A while import is held -> MUST BE QUEUED!
    const resTabBQueue = await tabB.evaluate(async (uid) => {
      const ctx = createAccountOperationContext(uid);
      const saveRes = saveAnnotationsToDB('lec_bb_concurrent', { 1: [{ id: 'str_queued_tab_b', tool: 'pen' }] }, null, ctx);
      return {
        queued: saveRes?.queued === true,
        reason: saveRes?.reason,
        queueMapHasEntry: queuedAnnotationWritesDuringImportByAccount.has(uid)
      };
    }, uidCompA);

    // In Tab B: switch to independent User B and run import -> MUST SUCCEED
    const resTabBUserB = await tabB.evaluate(async (uidB) => {
      await handleAuthSessionChange({ id: uidB, email: `${uidB}@exo.edu`, name: 'User B' }, false);
      const ctxB = createAccountOperationContext(uidB);
      const backupB = {
        schema: 'exo_workspace_backup_v4',
        version: 4,
        accountScopeHint: 'account_' + uidB.slice(0, 8),
        data: {
          subjects: [{ id: 'sub_b_indep', name: 'مادة ب المستقلة' }],
          schedule: { events: [] },
          logs: [],
          annotations: {}
        }
      };
      const canonB = canonicalizeJson(backupB.data);
      backupB.integrity = {
        algorithm: 'SHA-256',
        canonicalScope: 'data',
        sha256: await computeCanonicalSha256(canonB),
        byteLength: new TextEncoder().encode(canonB).length
      };
      const impResB = await importWorkspaceBackupV4(backupB, 'replace', uidB, ctxB);
      return {
        succeeded: impResB?.ok === true,
        status: impResB?.status,
        subjectsWritten: (localStorage.getItem('pharmaSubjectsV4') || '').includes('sub_b_indep')
      };
    }, uidCompB);

    // Now release Tab A's held lock and await its completion
    await tabA.evaluate(async () => {
      if (typeof window.__releaseImportLock === 'function') {
        window.__releaseImportLock();
      }
      return await window.__importPromise;
    });

    await tabA.waitForTimeout(400);

    // Verify User A persisted annotations directly in IndexedDB
    const userAPersistedAnno = await tabA.evaluate(async (uid) => {
      const scopedKey = toScopedKey('lec_bb_concurrent', uid);
      return await new Promise(resolve => {
        if (!dbInstance) return resolve(null);
        const tx = dbInstance.transaction('annotations', 'readonly');
        const req = tx.objectStore('annotations').get(scopedKey);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    }, uidCompA);

    await tabA.close();
    await tabB.close();

    // Close and reopen tabs, then verify queued writes survive restart and are eventually persisted
    const tabReopen = await context.newPage();
    await tabReopen.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await tabReopen.waitForTimeout(400);

    const restartVerification = await tabReopen.evaluate(async ({ uidA, uidB }) => {
      await handleAuthSessionChange({ id: uidA, email: `${uidA}@exo.edu`, name: 'User A' }, false);
      const ctxA = createAccountOperationContext(uidA);
      const annosResA = await getAllAnnotationsMapFromDB(uidA, ctxA);
      const lecAnnoA = annosResA?.verifiedMap?.['lec_bb_concurrent'];
      const strokeFound = Boolean(
        lecAnnoA && Array.isArray(lecAnnoA[1]) &&
        lecAnnoA[1].some(s => s && s.id === 'str_queued_tab_b')
      );

      // Verify User B remained isolated
      await handleAuthSessionChange({ id: uidB, email: `${uidB}@exo.edu`, name: 'User B' }, false);
      const ctxB = createAccountOperationContext(uidB);
      const annosResB = await getAllAnnotationsMapFromDB(uidB, ctxB);
      const userBIsolated = !annosResB?.verifiedMap?.['lec_bb_concurrent'];

      return { strokeFound, userBIsolated };
    }, { uidA: uidCompA, uidB: uidCompB });

    await tabReopen.close();

    assert(
      resTabBUserA.blocked === true,
      'Test BB.1: Real Chromium Tab 2 User A import is blocked by Tab 1 active import lock'
    );
    assert(
      resTabBQueue.queued === true && resTabBQueue.queueMapHasEntry === true,
      'Test BB.2: Real Chromium Tab 2 saveAnnotationsToDB queues edit safely during active import barrier'
    );
    assert(
      resTabBUserB.succeeded === true && resTabBUserB.subjectsWritten === true,
      'Test BB.3: Independent User B import succeeds concurrently without cross-account lock interference'
    );
    assert(
      userAPersistedAnno &&
      userAPersistedAnno.userId === uidCompA &&
      userAPersistedAnno.pages?.[1] !== undefined,
      'Test BB.4: Queued annotation write from Tab 2 is actually persisted into User A IndexedDB with correct ownership and content'
    );
    assert(
      restartVerification.strokeFound === true && restartVerification.userBIsolated === true,
      'Test BB.5: Persisted queued annotations survive tab close and page restart, while User B remains strictly isolated'
    );

    // ========================================================================
    // TEST CC: Real Two-Tab IDB Fallback-Lock Competition & Fencing Token
    // ========================================================================
    console.log('\n--- Test CC: Real Chromium Two-Tab IDB Fallback-Lock & Fencing Token ---');
    const tabCC1 = await context.newPage();
    const tabCC2 = await context.newPage();
    await tabCC1.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await tabCC2.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await tabCC1.waitForFunction(() => typeof initPdfDB === 'function');
    await tabCC2.waitForFunction(() => typeof initPdfDB === 'function');

    const uidCC = 'user_cc_idb_race_' + Date.now();

    // Tab 1 acquires fallback IDB lock and holds it
    const tabCC1Acquire = await tabCC1.evaluate(async (uid) => {
      await initPdfDB();
      window.__exoImportTestHooks = { forceIdbLockFallback: true };
      let acquiredToken = null;
      let holdingPromiseResolve = null;
      window.__holdIdbLock = new Promise(r => { holdingPromiseResolve = r; });
      window.__releaseIdbLock = holdingPromiseResolve;

      window.__idbLockPromise = runWithImportLock(uid, 'tx_cc1', async (token) => {
        acquiredToken = token;
        await window.__holdIdbLock;
        return { ok: true, token };
      });
      await new Promise(r => setTimeout(r, 200));
      return { token: acquiredToken };
    }, uidCC);

    // Tab 2 attempts to acquire while Tab 1 holds it
    const tabCC2TryAcquire = await tabCC2.evaluate(async (uid) => {
      await initPdfDB();
      window.__exoImportTestHooks = { forceIdbLockFallback: true };
      const res = await runWithImportLock(uid, 'tx_cc2', async (token) => {
        return { ok: true, token };
      });
      return res;
    }, uidCC);

    // Release Tab 1 lock
    await tabCC1.evaluate(async () => {
      if (typeof window.__releaseIdbLock === 'function') window.__releaseIdbLock();
      return await window.__idbLockPromise;
    });

    await tabCC1.close();
    await tabCC2.close();

    assert(
      tabCC2TryAcquire && tabCC2TryAcquire.ok === false && tabCC2TryAcquire.reason === 'import_in_progress',
      'Test CC.1: Tab 2 is blocked by active IDB fallback lock held by Tab 1'
    );

    // ========================================================================
    // TEST DD: Real Two-Tab Concurrent Queue Drain & Stroke Deduplication
    // ========================================================================
    console.log('\n--- Test DD: Real Chromium Two-Tab Concurrent Queue Drain ---');
    const tabDD1 = await context.newPage();
    const tabDD2 = await context.newPage();
    await tabDD1.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await tabDD2.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await tabDD1.waitForFunction(() => typeof initPdfDB === 'function');
    await tabDD2.waitForFunction(() => typeof initPdfDB === 'function');

    const uidDD = 'user_dd_drain_' + Date.now();

    // Tab 1 starts import and holds the active lock
    await tabDD1.evaluate(async (uid) => {
      await initPdfDB();
      await handleAuthSessionChange({ id: uid, email: `${uid}@exo.edu`, name: 'User DD' }, false);
      const ctx = createAccountOperationContext(uid);
      const targetBackup = {
        schema: 'exo_workspace_backup_v4',
        version: 4,
        data: { subjects: [{ id: 'sub_dd_orig', name: 'Original DD' }], schedule: { events: [] }, logs: [], annotations: {} }
      };
      const canon = canonicalizeJson(targetBackup.data);
      targetBackup.integrity = {
        algorithm: 'SHA-256',
        canonicalScope: 'data',
        sha256: await computeCanonicalSha256(canon),
        byteLength: new TextEncoder().encode(canon).length
      };
      let releaseLock;
      window.__holdLockPromise = new Promise(resolve => { releaseLock = resolve; });
      window.__releaseImportLock = releaseLock;
      window.__exoImportTestHooks = { holdImportAfterLock: window.__holdLockPromise };
      window.__importPromise = importWorkspaceBackupV4(targetBackup, 'replace', uid, ctx);
    }, uidDD);

    await tabDD1.waitForTimeout(300);

    // Tab 2 writes duplicate strokes and domain edits while barrier is active
    const tabDD2Writes = await tabDD2.evaluate(async (uid) => {
      await initPdfDB();
      await handleAuthSessionChange({ id: uid, email: `${uid}@exo.edu`, name: 'User DD' }, false);
      const ctx = createAccountOperationContext(uid);

      // 1. Queued annotations with duplicate strokes
      const strA = { id: 'str_dd_1', points: [10, 20, 30, 40], color: '#ff0000' };
      const qRes1 = await saveAnnotationsToDB('lec_dd_1', { 1: [strA] }, null, ctx);
      const qRes2 = await saveAnnotationsToDB('lec_dd_1', { 1: [strA, { id: 'str_dd_2', points: [50, 60], color: '#00ff00' }] }, null, ctx);

      // 2. Queued domain edit
      subjects = [{ id: 'sub_dd_queued', name: 'Queued Subject DD' }];
      const subRes = saveSubjects();

      return {
        qRes1Queued: qRes1?.queued === true,
        qRes2Queued: qRes2?.queued === true,
        subResQueued: subRes?.queued === true
      };
    }, uidDD);

    // Tab 1 releases lock, completing import and draining queues
    const tabDD1Drain = await tabDD1.evaluate(async (uid) => {
      if (typeof window.__releaseImportLock === 'function') window.__releaseImportLock();
      await window.__importPromise;

      // Check persisted annotations in IDB
      const persistedRec = await new Promise(res => {
        const tx = dbInstance.transaction('annotations', 'readonly');
        const req = tx.objectStore('annotations').get(toScopedKey('lec_dd_1', uid));
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => res(null);
      });

      return {
        persistedRec,
        subjects: JSON.parse(localStorage.getItem('pharmaSubjectsV4') || '[]')
      };
    }, uidDD);

    await tabDD1.close();
    await tabDD2.close();

    assert(
      tabDD2Writes.qRes1Queued === true && tabDD2Writes.qRes2Queued === true && tabDD2Writes.subResQueued === true,
      'Test DD.1: Tab 2 writes queued during active barrier'
    );
    assert(
      tabDD1Drain.persistedRec && Array.isArray(tabDD1Drain.persistedRec.pages?.[1]) &&
      tabDD1Drain.persistedRec.pages[1].length === 2,
      'Test DD.2: Queued annotations drained cleanly with in-batch stroke deduplication in real Chromium'
    );
    assert(
      Array.isArray(tabDD1Drain.subjects) && tabDD1Drain.subjects.some(s => s && s.id === 'sub_dd_queued'),
      'Test DD.3: Queued domain edits flushed cleanly into canonical state in real Chromium'
    );

    // ========================================================================
    // TEST EE: Real Chromium Recovery Fault Injection Hooks
    // ========================================================================
    console.log('\n--- Test EE: Real Chromium Recovery Fault Injection Hooks ---');
    const tabEE = await context.newPage();
    await tabEE.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await tabEE.waitForFunction(() => typeof initPdfDB === 'function');

    const uidEE = 'user_ee_fault_' + Date.now();

    const faultRes = await tabEE.evaluate(async (uid) => {
      await initPdfDB();
      await handleAuthSessionChange({ id: uid, email: `${uid}@exo.edu`, name: 'User EE' }, false);
      const ctx = createAccountOperationContext(uid);
      const barrierKey = 'pharmaImportBarrier_' + uid;
      localStorage.setItem(barrierKey, JSON.stringify({ txId: 'tx_ee', startedAt: Date.now() }));

      // 1. failLockQuery test hook
      window.__exoImportTestHooks = { failLockQuery: true };
      const recLockFail = await recoverPendingImportJournalIfNeeded(uid, ctx);
      window.__exoImportTestHooks = null;
      const barrierRetained1 = localStorage.getItem(barrierKey) !== null;

      // 2. failIdbLockQuery test hook
      window.__exoImportTestHooks = { failIdbLockQuery: true };
      const recIdbFail = await recoverPendingImportJournalIfNeeded(uid, ctx);
      window.__exoImportTestHooks = null;
      const barrierRetained2 = localStorage.getItem(barrierKey) !== null;

      // 3. Clean recovery clears barrier
      const recClean = await recoverPendingImportJournalIfNeeded(uid, ctx);
      const barrierCleaned = localStorage.getItem(barrierKey) === null;

      return { barrierRetained1, barrierRetained2, barrierCleaned };
    }, uidEE);

    await tabEE.close();

    assert(
      faultRes.barrierRetained1 === true && faultRes.barrierRetained2 === true && faultRes.barrierCleaned === true,
      'Test EE.1: Chromium recovery fault injection hooks verify fail-closed barrier retention on query failures'
    );

    await context.close();
  } finally {
    await browser.close();
    if (spawnedServer) {
      spawnedServer.kill();
    }
  }

  console.log('\n======================================================================');
  console.log(`TOTAL CHROMIUM E2E CHECKS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('======================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    console.log('ALL 21 MANDATORY CHROMIUM + INDEXEDDB E2E SCENARIOS (A - V) PASSED (100%).');
    process.exit(0);
  }
}

// ============================================================================
// STANDALONE TEST DD RUNNER (npm run test:dd)
// Features:
// - Overall timeout: 90 seconds
// - Per-phase timeout: 30 seconds with explicit Arabic status messages
// - Safe resource cleanup: both tabs, browser context, and browser close in finally
// ============================================================================
async function runTestDDStandalone() {
  console.log('======================================================================');
  console.log('EXO PHASE 4.1: STANDALONE TEST DD (TWO-TAB CONCURRENT DRAIN & DEDUPE)');
  console.log('======================================================================\n');

  let spawnedServer = null;
  let browser = null;
  let context = null;
  let tabDD1 = null;
  let tabDD2 = null;

  async function cleanupResources() {
    try {
      if (tabDD1 && !tabDD1.isClosed()) {
        await tabDD1.close().catch(() => {});
      }
    } catch {}
    try {
      if (tabDD2 && !tabDD2.isClosed()) {
        await tabDD2.close().catch(() => {});
      }
    } catch {}
    try {
      if (context) {
        await context.close().catch(() => {});
      }
    } catch {}
    try {
      if (browser) {
        await browser.close().catch(() => {});
      }
    } catch {}
    try {
      if (spawnedServer) {
        spawnedServer.kill();
      }
    } catch {}
  }

  const OVERALL_TIMEOUT_MS = 90000;
  let overallTimer = null;
  const overallTimeoutPromise = new Promise((_, reject) => {
    overallTimer = setTimeout(() => {
      const err = new Error(`[TIMEOUT] انتهت المهلة الإجمالية لاختبار DD (${OVERALL_TIMEOUT_MS / 1000} ثانية).`);
      err.isOverallTimeout = true;
      reject(err);
    }, OVERALL_TIMEOUT_MS);
  });
  if (typeof overallTimer?.unref === 'function') {
    overallTimer.unref();
  }

  const PHASE_TIMEOUT_MS = 30000;
  async function withPhaseTimeout(phaseName, phaseFn) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`[TIMEOUT] انتهت مهلة المرحلة (${PHASE_TIMEOUT_MS / 1000} ثانية): ${phaseName}`);
        err.isPhaseTimeout = true;
        err.phaseName = phaseName;
        reject(err);
      }, PHASE_TIMEOUT_MS);
    });
    try {
      return await Promise.race([phaseFn(), timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function executeTestDD() {
    // المرحلة 1: تشغيل الخادم والمتصفح وفتح التبويبين
    await withPhaseTimeout('المرحلة 1: تشغيل الخادم والمتصفح وفتح التبويبين (Tab 1 & Tab 2 Setup)', async () => {
      console.log('--- [المرحلة 1] تشغيل الخادم والمتصفح وفتح التبويبين ---');
      spawnedServer = await ensureLocalServerRunning();
      browser = await chromium.launch(resolveChromiumLaunchOptions());
      context = await browser.newContext();
      tabDD1 = await context.newPage();
      tabDD2 = await context.newPage();
      await tabDD1.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
      await tabDD2.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
      await tabDD1.waitForFunction(() => typeof initPdfDB === 'function');
      await tabDD2.waitForFunction(() => typeof initPdfDB === 'function');
    });

    const uidDD = 'user_dd_drain_' + Date.now();

    // المرحلة 2: التبويب 1 يبدأ الاستيراد ويحتجز القفل الحي
    await withPhaseTimeout('المرحلة 2: بدء الاستيراد في التبويب 1 واحتجاز القفل الحي (Tab 1 Start & Hold Import)', async () => {
      console.log('--- [المرحلة 2] بدء الاستيراد في التبويب 1 واحتجاز القفل الحي ---');
      await tabDD1.evaluate(async (uid) => {
        await initPdfDB();
        await handleAuthSessionChange({ id: uid, email: `${uid}@exo.edu`, name: 'User DD' }, false);
        const ctx = createAccountOperationContext(uid);
        const targetBackup = {
          schema: 'exo_workspace_backup_v4',
          version: 4,
          data: { subjects: [{ id: 'sub_dd_orig', name: 'Original DD' }], schedule: { events: [] }, logs: [], annotations: {} }
        };
        const canon = canonicalizeJson(targetBackup.data);
        targetBackup.integrity = {
          algorithm: 'SHA-256',
          canonicalScope: 'data',
          sha256: await computeCanonicalSha256(canon),
          byteLength: new TextEncoder().encode(canon).length
        };
        let releaseLock;
        window.__holdLockPromise = new Promise(resolve => { releaseLock = resolve; });
        window.__releaseImportLock = releaseLock;
        window.__exoImportTestHooks = { holdImportAfterLock: window.__holdLockPromise };
        window.__importPromise = importWorkspaceBackupV4(targetBackup, 'replace', uid, ctx);
      }, uidDD);
      await tabDD1.waitForTimeout(300);
    });

    // المرحلة 3: التبويب 2 يكتب تعديلات أثناء نشاط الحاجز
let tabDD2Writes = null;

tabDD2.on('console', msg => console.log('[Tab DD2]', msg.text()));

await withPhaseTimeout(
  'المرحلة 3: كتابة تعديلات التبويب 2 أثناء نشاط الحاجز (Tab 2 Writes During Active Barrier)',
  async () => {
    console.log('--- [المرحلة 3] كتابة تعديلات التبويب 2 أثناء نشاط الحاجز ---');

    tabDD2Writes = await tabDD2.evaluate(async (uid) => {
      console.log('[DD3] قبل initPdfDB');
      await initPdfDB();
      console.log('[DD3] بعد initPdfDB');

      console.log('[DD3] قبل handleAuthSessionChange');
      await handleAuthSessionChange(
        { id: uid, email: `${uid}@exo.edu`, name: 'User DD' },
        false
      );
      console.log('[DD3] بعد handleAuthSessionChange');

      const ctx = createAccountOperationContext(uid);

      // الكتابة الأولى للتعليقات
      const strA = {
        id: 'str_dd_1',
        points: [10, 20, 30, 40],
        color: '#ff0000'
      };

      console.log('[DD3] قبل saveAnnotationsToDB الأول');
      const qRes1 = await saveAnnotationsToDB(
        'lec_dd_1',
        { 1: [strA] },
        null,
        ctx
      );
      console.log('[DD3] بعد saveAnnotationsToDB الأول');

      // الكتابة الثانية مع ضربة مكررة وضربة جديدة
      console.log('[DD3] قبل saveAnnotationsToDB الثاني');
      const qRes2 = await saveAnnotationsToDB(
        'lec_dd_1',
        {
          1: [
            strA,
            {
              id: 'str_dd_2',
              points: [50, 60],
              color: '#00ff00'
            }
          ]
        },
        null,
        ctx
      );
      console.log('[DD3] بعد saveAnnotationsToDB الثاني');

      // تعديل المادة
      console.log('[DD3] قبل saveSubjects');
      subjects = [{ id: 'sub_dd_queued', name: 'Queued Subject DD' }];
      const subRes = saveSubjects();
      console.log('[DD3] بعد saveSubjects');

      return {
        qRes1Queued: qRes1?.queued === true,
        qRes2Queued: qRes2?.queued === true,
        subResQueued: subRes?.queued === true
      };
    }, uidDD);
  }
);

    // المرحلة 4: تحرير قفل التبويب 1 واستكمال الاستيراد وتفريغ الطوابير
    let tabDD1Drain = null;
    await withPhaseTimeout('المرحلة 4: تحرير قفل التبويب 1 واستكمال الاستيراد وتفريغ الطوابير (Tab 1 Release Lock & Drain Queues)', async () => {
      console.log('--- [المرحلة 4] تحرير قفل التبويب 1 واستكمال الاستيراد وتفريغ الطوابير ---');
      tabDD1Drain = await tabDD1.evaluate(async (uid) => {
        if (typeof window.__releaseImportLock === 'function') window.__releaseImportLock();
        await window.__importPromise;

        // Check persisted annotations in IDB
        const persistedRec = await new Promise(res => {
          const tx = dbInstance.transaction('annotations', 'readonly');
          const req = tx.objectStore('annotations').get(toScopedKey('lec_dd_1', uid));
          req.onsuccess = () => res(req.result || null);
          req.onerror = () => res(null);
        });

        return {
          persistedRec,
          subjects: JSON.parse(localStorage.getItem('pharmaSubjectsV4') || '[]')
        };
      }, uidDD);
    });

    // المرحلة 5: التحقق من نجاح الفحوصات
    await withPhaseTimeout('المرحلة 5: التحقق من نجاح الفحوصات DD.1 و DD.2 و DD.3 (Verify Assertions)', async () => {
      console.log('--- [المرحلة 5] التحقق من صحة النتائج ---');
      assert(
        tabDD2Writes && tabDD2Writes.qRes1Queued === true && tabDD2Writes.qRes2Queued === true && tabDD2Writes.subResQueued === true,
        'Test DD.1: Tab 2 writes queued during active barrier'
      );
      assert(
        tabDD1Drain && tabDD1Drain.persistedRec && Array.isArray(tabDD1Drain.persistedRec.pages?.[1]) &&
        tabDD1Drain.persistedRec.pages[1].length === 2,
        'Test DD.2: Queued annotations drained cleanly with in-batch stroke deduplication in real Chromium'
      );
      assert(
        tabDD1Drain && Array.isArray(tabDD1Drain.subjects) && tabDD1Drain.subjects.some(s => s && s.id === 'sub_dd_queued'),
        'Test DD.3: Queued domain edits flushed cleanly into canonical state in real Chromium'
      );
    });
  }

  try {
    await Promise.race([executeTestDD(), overallTimeoutPromise]);
  } catch (err) {
    console.error('\n[ERROR] فشل اختبار DD:');
    if (err.isPhaseTimeout) {
      console.error(`  السبب: ${err.message}`);
      console.error(`  المرحلة العالقة: ${err.phaseName}`);
    } else if (err.isOverallTimeout) {
      console.error(`  السبب: ${err.message}`);
    } else {
      console.error('  السبب:', err);
    }
    testsFailed++;
  } finally {
    if (overallTimer) clearTimeout(overallTimer);
    console.log('جاري إغلاق التبويبين والمتصفح ومسح الموارد...');
    await cleanupResources();
    console.log('تم إغلاق الموارد بنجاح.');
  }

  console.log('\n======================================================================');
  console.log(`TOTAL DD CHECKS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log('======================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    console.log('ALL TEST DD CHECKS PASSED (100%).');
    process.exit(0);
  }
}

const isDdOnly = process.argv.includes('--dd-only') || process.env.TEST_DD === '1';

if (isDdOnly) {
  runTestDDStandalone().catch((err) => {
    console.error('Fatal Test DD runner error:', err);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error('Fatal Chromium E2E test runner error:', err);
    process.exit(1);
  });
}
