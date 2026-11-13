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
        const isAnnotationsWriteTx = (storeNames === 'annotations' || (Array.isArray(storeNames) && storeNames.includes('annotations'))) && mode === 'readwrite';
        if (failAnnotationsOnce && isAnnotationsWriteTx) {
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

      // 1. Temporarily set dbInstance = null to verify direct getAllAnnotationsMapFromDB DB_NOT_INITIALIZED (Test J.1)
      const savedDb = dbInstance;
      const origProtoTx = IDBDatabase.prototype.transaction;
      dbInstance = null;

      const directReadRes = await getAllAnnotationsMapFromDB(uidA);

      // 2. Inject a genuine IndexedDB read failure on the 'annotations' store while allowing
      // readDurableCloudSyncJournal() inside pushWorkspaceToCloud() to automatically reopen IndexedDB via initPdfDB() (Test J.2)
      let reopenedAutomatically = false;
      let pushRes = null;
      try {
        IDBDatabase.prototype.transaction = function (storeNames, mode) {
          const names = Array.isArray(storeNames) ? storeNames : [storeNames];
          if (names.length === 1 && names[0] === 'annotations' && (!mode || mode === 'readonly')) {
            const fakeErr = new DOMException('Simulated IndexedDB annotations read failure', 'NotReadableError');
            const fakeTx = {
              mode: 'readonly',
              error: fakeErr,
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore() {
                return {
                  getAll() {
                    const req = { result: null, error: fakeErr, onsuccess: null, onerror: null };
                    queueMicrotask(() => {
                      if (typeof req.onerror === 'function') req.onerror({ target: req });
                      if (typeof fakeTx.onerror === 'function') fakeTx.onerror({ target: fakeTx });
                    });
                    return req;
                  }
                };
              }
            };
            return fakeTx;
          }
          return origProtoTx.apply(this, arguments);
        };

        pushRes = await pushWorkspaceToCloud(true, true);
        reopenedAutomatically = Boolean(dbInstance !== null);
      } finally {
        IDBDatabase.prototype.transaction = origProtoTx;
        if (dbInstance && dbInstance !== savedDb) {
          try { dbInstance.close(); } catch (e) {}
        }
        dbInstance = savedDb;
        supabaseClient = origClient;
      }

      return {
        directReadRes,
        reopenedAutomatically,
        pushRes,
        rpcCalled
      };
    });
    assert(resJ.directReadRes.ok === false && resJ.directReadRes.error?.code === 'DB_NOT_INITIALIZED',
           'Test J.1: getAllAnnotationsMapFromDB returns { ok: false, error } when DB read cannot be performed');
    assert(resJ.reopenedAutomatically === true && resJ.pushRes.status === 'error' && resJ.pushRes.error === 'LOCAL_ANNOTATIONS_READ_ERROR' && resJ.pushRes.details?.code === 'IDB_READ_ERROR' && resJ.rpcCalled === false,
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

      // 1. Test fail-closed abort when tombstone persistence throws QuotaExceededError across both LocalStorage and IndexedDB (Case C/D)
      const origSetItem = Storage.prototype.setItem;
      const origTxS = dbInstance.transaction.bind(dbInstance);
      const tombKeyA = 'pharmaTombstones_' + uidA;
      let failTombWrite = true;
      Storage.prototype.setItem = function(k, v) {
        if (failTombWrite && String(k) === tombKeyA) {
          throw new DOMException('Simulated QuotaExceededError on tombstone write', 'QuotaExceededError');
        }
        return origSetItem.call(this, k, v);
      };
      dbInstance.transaction = function(storeNames, mode) {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        if (failTombWrite && mode === 'readwrite' && names.includes('workspace_state')) {
          const tx = origTxS(storeNames, mode);
          queueMicrotask(() => {
            try { tx.abort(); } catch (e) {}
          });
          return tx;
        }
        return origTxS(storeNames, mode);
      };
      try {
        await triggerDeleteLecture('grp_e2e_del_1', 'lec_e2e_del_1');
        deleteBacklogTask('bl_e2e_del_1');
      } finally {
        failTombWrite = false;
        Storage.prototype.setItem = origSetItem;
        dbInstance.transaction = origTxS;
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

    // 1. Navigate from Today Dashboard to Subjects, then open Subject 8801 and Lecture 8821 through real DOM clicks
    await page.click('.sidebar-nav-item[data-tab="subjects"]');
    await page.waitForSelector('#subjects.view-section.active', { state: 'visible' });
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

    await page.click('.sidebar-nav-item[data-tab="subjects"]');
    await page.waitForSelector('#subjects.view-section.active', { state: 'visible' });
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

    // ------------------------------------------------------------------------
    // TEST FF: Phase A Acceptance Gap Closure — Real Supabase Startup Session
    // Restoration, Durable IDB Dirty Journal, RPC Failure/Confirmation Across
    // Reloads, Dirty-Marker Quota Failure, and Chapter Add/Delete Durability
    // ------------------------------------------------------------------------
    console.log('\n--- TEST FF: Real Supabase Session Restoration, Durable Dirty Journal & Reload Survival in Chromium ---');
    const uidFF = 'ff001122-3344-4556-8778-99aabbccddee';
    const contextFF = await browser.newContext();

    // Block CDN @supabase/supabase-js from overwriting our pre-startup mocked window.supabase
    await contextFF.route('**/*supabase*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: '/* Mocked Supabase CDN for E2E */'
      });
    });

    // Install mocked window.supabase.createClient BEFORE application startup in the fresh context
    await contextFF.addInitScript((syntheticUid) => {
      if (!localStorage.getItem('__exo_ff_initialized')) {
        localStorage.setItem('__exo_ff_initialized', '1');
        localStorage.setItem('pharmaLastActiveCloudUid', syntheticUid);
        localStorage.setItem('pharmaLastActiveUserIdV1', syntheticUid);
        localStorage.setItem('pharmaWorkspaceRevision_' + syntheticUid, '2');
        localStorage.setItem('__exo_mock_rpc_mode', 'fail');
        localStorage.setItem('__exo_mock_remote_row', JSON.stringify({
          user_id: syntheticUid,
          user_email: 'ff@exo.edu',
          can_upload_media: false,
          revision: 2,
          subjects: [{
            id: 8801,
            name: 'Pharmacology FF',
            groups: [{
              id: 8810,
              name: 'Autonomic',
              lectures: [
                { id: 7701, title: 'Lec B', completed: false },
                { id: 7702, title: 'Lec A', completed: false }
              ]
            }]
          }],
          schedule: { version: 3, events: [], backlog: [], weeklyReports: [] },
          logs: [],
          academy_progress: [],
          annotations: {},
          updated_at: '2026-11-01T10:00:00.000Z'
        }));
      }

      const syntheticSession = {
        access_token: 'synthetic-jwt-token-ff',
        refresh_token: 'synthetic-refresh-token-ff',
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: syntheticUid,
          email: 'ff@exo.edu',
          user_metadata: { full_name: 'Student FF' }
        }
      };

      window.__exoMockSupabaseStats = {
        createClientCalls: 0,
        getSessionCalls: 0,
        onAuthStateChangeCalls: 0,
        selectCalls: 0,
        rpcCalls: 0,
        lastRpcPayload: null
      };

      window.supabase = {
        createClient: function () {
          window.__exoMockSupabaseStats.createClientCalls++;
          const authListeners = [];
          return {
            auth: {
              getSession: async function () {
                window.__exoMockSupabaseStats.getSessionCalls++;
                return { data: { session: syntheticSession }, error: null };
              },
              onAuthStateChange: function (cb) {
                window.__exoMockSupabaseStats.onAuthStateChangeCalls++;
                if (typeof cb === 'function') {
                  authListeners.push(cb);
                  setTimeout(() => {
                    try { cb('INITIAL_SESSION', syntheticSession); } catch (e) {}
                    try { cb('SIGNED_IN', syntheticSession); } catch (e) {}
                  }, 5);
                }
                return { data: { subscription: { unsubscribe: () => {} } } };
              }
            },
            channel: function () {
              const ch = {
                on: () => ch,
                subscribe: () => ch
              };
              return ch;
            },
            removeChannel: function () {},
            from: function (tableName) {
              return {
                select: function () {
                  return {
                    eq: function () {
                      return {
                        maybeSingle: async function () {
                          window.__exoMockSupabaseStats.selectCalls++;
                          const mode = localStorage.getItem('__exo_mock_select_mode') || 'ok';
                          if (mode === 'error') {
                            return { data: null, error: { code: '503', status: 503, message: 'Service Unavailable' } };
                          }
                          const rawRow = localStorage.getItem('__exo_mock_remote_row');
                          return { data: rawRow ? JSON.parse(rawRow) : null, error: null };
                        }
                      };
                    }
                  };
                }
              };
            },
            rpc: async function (fnName, args) {
              window.__exoMockSupabaseStats.rpcCalls++;
              window.__exoMockSupabaseStats.lastRpcPayload = args?.p_payload || null;
              const rpcMode = localStorage.getItem('__exo_mock_rpc_mode') || 'success';
              if (rpcMode === 'fail') {
                return {
                  data: null,
                  error: { code: '503', status: 503, message: 'Simulated RPC Failure' }
                };
              }
              const nextRev = Number(args?.p_expected_revision || 2) + 1;
              if (args?.p_payload) {
                const updatedRemote = Object.assign({}, args.p_payload, {
                  user_id: syntheticUid,
                  revision: nextRev,
                  annotations: args.p_payload.annotations || {}
                });
                try {
                  localStorage.setItem('__exo_mock_remote_row', JSON.stringify(updatedRemote));
                } catch (e) {}
              }
              return {
                data: { status: 'success', revision: nextRev },
                error: null
              };
            }
          };
        }
      };
    }, uidFF);

    const tabFF = await contextFF.newPage();
    await tabFF.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await tabFF.waitForFunction(() => Boolean(
      window.__exoSupabaseStartupState &&
      window.__exoSupabaseStartupState.settled === true &&
      typeof currentCloudUser === 'object' &&
      currentCloudUser &&
      currentCloudUser.id === 'ff001122-3344-4556-8778-99aabbccddee'
    ));

    // Step 1: Verify real startup path ran automatically without manual currentCloudUser assignment
    const ffStartupCheck = await tabFF.evaluate(async (uid) => {
      await initPdfDB();
      // Write handwritten strokes, text note, audio pin, and multiple Extra Note Sheets, then run idle flush (false)
      const scopedLecKey = toScopedKey('7701', uid);
      pendingAnnoSaveMap[scopedLecKey] = {
        '1': [
          stampAnnotationItemCausalMetadata({ id: 'ff_pen_1', tool: 'pen', color: '#2dd4bf', size: 2, points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] }, 'stroke', '7701', '1', uid),
          stampAnnotationItemCausalMetadata({ id: 'ff_txt_1', tool: 'text', text: 'Chromium text note', x: 0.4, y: 0.5, color: '#ffffff', fontSize: 15 }, 'note', '7701', '1', uid)
        ],
        _audioPins: {
          '1': [stampAnnotationItemCausalMetadata({ id: 'ff_pin_1', page: 1, audioTime: 18.2, label: 'Pin 18s', x: 0.2, y: 0.2 }, 'pin', '7701', '1', uid)]
        },
        _extraNotes: { '1': true, '1__s2': true },
        'note_1': [stampAnnotationItemCausalMetadata({ id: 'ff_sheet1_s', tool: 'pen', color: '#f43f5e', size: 2, points: [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.5 }] }, 'stroke', '7701', 'note_1', uid)],
        'note_1__s2': [stampAnnotationItemCausalMetadata({ id: 'ff_sheet2_s', tool: 'pen', color: '#10b981', size: 3, points: [{ x: 0.3, y: 0.3 }, { x: 0.6, y: 0.6 }] }, 'stroke', '7701', 'note_1__s2', uid)]
      };
      const idleFlushOk = await flushPendingAnnotationsSave(false);
      const durableJournal = await readDurableCloudSyncJournal(uid);
      const annoDirtyAfterIdle = localStorage.getItem('pharmaAnnotationsDirty_' + uid) === '1';

      // Reorder lectures via moveLectureInGroup
      activeSubjectId = 8801;
      saveSubjects();
      const digestBeforeReorder = subjects[0].groups[0]._causalDigest;
      moveLectureInGroup(8810, 7702, -1, null);
      const digestAfterReorder = subjects[0].groups[0]._causalDigest;

      return {
        startupState: window.__exoSupabaseStartupState,
        restoredUid: currentCloudUser?.id || null,
        idleFlushOk,
        annoDirtyAfterIdle,
        durableHasDirtyAnnos: Boolean(durableJournal && durableJournal.hasDirtyAnnotations),
        durableLectureIds: durableJournal?.annoJournal?.lectureIds || [],
        digestChanged: Boolean(digestBeforeReorder && digestAfterReorder && digestBeforeReorder !== digestAfterReorder),
        orderAfterMove: subjects[0].groups[0].lectures.map(l => l.id).join(',')
      };
    }, uidFF);

    assert(
      ffStartupCheck.startupState.createClientCalled === true &&
      ffStartupCheck.startupState.getSessionCalled === true &&
      ffStartupCheck.startupState.onAuthStateChangeRegistered === true &&
      ffStartupCheck.startupState.handleAuthSessionChangeCalled === true &&
      ffStartupCheck.startupState.syncWorkspaceOnLoginCalled === true &&
      ffStartupCheck.restoredUid === uidFF,
      'Test FF.1 (Gap 2): Fresh browser context runs real initSupabaseCloudEngine -> getSession -> handleAuthSessionChange -> syncWorkspaceOnLogin startup flow'
    );
    assert(
      ffStartupCheck.idleFlushOk === true &&
      ffStartupCheck.annoDirtyAfterIdle === true &&
      ffStartupCheck.durableHasDirtyAnnos === true &&
      ffStartupCheck.durableLectureIds.includes('7701') &&
      ffStartupCheck.digestChanged === true &&
      ffStartupCheck.orderAfterMove === '7702,7701',
      'Test FF.2 (Gap 1): Idle annotation flush commits annotations and durable IndexedDB cloud_sync_journal entry in the same transaction',
      JSON.stringify(ffStartupCheck)
    );

    // Step 2 (Gap 2 & Gap 3): Reload #1 where mocked remote row has older revision (2) and annotations: {},
    // and first RPC attempt FAILS (__exo_mock_rpc_mode === 'fail').
    // Do NOT assign currentCloudUser manually after reload!
    await tabFF.reload({ waitUntil: 'domcontentloaded' });
    await tabFF.waitForFunction(() => Boolean(
      window.__exoSupabaseStartupState &&
      window.__exoSupabaseStartupState.settled === true &&
      window.__exoSupabaseStartupState.syncWorkspaceOnLoginCalled === true
    ));

    const ffAfterReload1FailedRpc = await tabFF.evaluate(async (uid) => {
      const reloadedAnnos = await getAnnotationsFromDB('7701', uid);
      const durableJournal = await readDurableCloudSyncJournal(uid);
      const navBtn = document.getElementById('cloudNavBtn');
      return {
        currentUidWithoutManualAssign: currentCloudUser?.id || null,
        startupState: window.__exoSupabaseStartupState,
        rpcCalls: window.__exoMockSupabaseStats?.rpcCalls || 0,
        hasStroke: Boolean(reloadedAnnos?.['1']?.some(s => s.id === 'ff_pen_1')),
        hasText: Boolean(reloadedAnnos?.['1']?.some(s => s.id === 'ff_txt_1')),
        hasPin: Boolean(reloadedAnnos?._audioPins?.['1']?.some(p => p.id === 'ff_pin_1')),
        hasExtraSheets: Boolean(
          reloadedAnnos?._extraNotes?.['1'] &&
          reloadedAnnos?._extraNotes?.['1__s2'] &&
          reloadedAnnos?.['note_1']?.length === 1 &&
          reloadedAnnos?.['note_1__s2']?.length === 1
        ),
        reorderedIds: subjects[0]?.groups?.[0]?.lectures?.map(l => l.id).join(',') || '',
        durableJournalStillDirty: Boolean(durableJournal.hasDirtyAnnotations),
        lsDirtyStillPending: localStorage.getItem('pharmaWorkspaceDirty_' + uid) === '1',
        uiHasErrorClass: Boolean(navBtn && navBtn.classList.contains('error')),
        uiHasSyncedClass: Boolean(navBtn && navBtn.classList.contains('synced'))
      };
    }, uidFF);

    assert(
      ffAfterReload1FailedRpc.currentUidWithoutManualAssign === uidFF &&
      ffAfterReload1FailedRpc.startupState.syncWorkspaceOnLoginCalled === true &&
      ffAfterReload1FailedRpc.hasStroke === true &&
      ffAfterReload1FailedRpc.hasText === true &&
      ffAfterReload1FailedRpc.hasPin === true &&
      ffAfterReload1FailedRpc.hasExtraSheets === true &&
      ffAfterReload1FailedRpc.reorderedIds === '7702,7701',
      'Test FF.3 (Gap 2): Real Chromium reload restores Supabase session automatically without manual currentCloudUser assignment and preserves strokes, text notes, audio pins, multiple Extra Note Sheets, and lecture order against remote annotations: {}'
    );
    assert(
      ffAfterReload1FailedRpc.rpcCalls >= 1 &&
      ffAfterReload1FailedRpc.durableJournalStillDirty === true &&
      ffAfterReload1FailedRpc.lsDirtyStillPending === true &&
      ffAfterReload1FailedRpc.uiHasErrorClass === true &&
      ffAfterReload1FailedRpc.uiHasSyncedClass === false,
      'Test FF.4 (Gap 3): When first RPC attempt fails during reload reconciliation, durable annotation dirty journal and workspace dirty state remain pending and UI shows error'
    );

    // Step 3 (Gap 3): Switch RPC mode to 'success', trigger retry push, verify revision confirmation & journal clear,
    // then perform a SECOND full reload and verify zero duplication/corruption/deletion.
    const ffAfterRpcSuccess = await tabFF.evaluate(async (uid) => {
      localStorage.setItem('__exo_mock_rpc_mode', 'success');
      const pushRes = await pushWorkspaceToCloud(false, false);
      const durableJournal = await readDurableCloudSyncJournal(uid);
      const navBtn = document.getElementById('cloudNavBtn');
      return {
        pushStatus: pushRes?.status || null,
        confirmedRevision: pushRes?.revision || null,
        durableJournalCleared: durableJournal.hasDirtyAnnotations === false && durableJournal.hasDirtyWorkspace === false,
        lsDirtyCleared: localStorage.getItem('pharmaAnnotationsDirty_' + uid) === null && localStorage.getItem('pharmaWorkspaceDirty_' + uid) === null,
        uiHasSyncedClass: Boolean(navBtn && navBtn.classList.contains('synced'))
      };
    }, uidFF);

    assert(
      ffAfterRpcSuccess.pushStatus === 'success' &&
      ffAfterRpcSuccess.confirmedRevision === 3 &&
      ffAfterRpcSuccess.durableJournalCleared === true &&
      ffAfterRpcSuccess.lsDirtyCleared === true &&
      ffAfterRpcSuccess.uiHasSyncedClass === true,
      'Test FF.5 (Gap 3): Subsequent successful RPC confirms revision 3, clears durable IndexedDB journal and localStorage dirty markers, and sets UI to synced'
    );

    // Second full reload after RPC confirmation
    await tabFF.reload({ waitUntil: 'domcontentloaded' });
    await tabFF.waitForFunction(() => Boolean(
      window.__exoSupabaseStartupState &&
      window.__exoSupabaseStartupState.settled === true &&
      window.__exoSupabaseStartupState.syncWorkspaceOnLoginCalled === true
    ));

    const ffAfterSecondReload = await tabFF.evaluate(async (uid) => {
      const reloadedAnnos = await getAnnotationsFromDB('7701', uid);
      const p1Items = Array.isArray(reloadedAnnos?.['1']) ? reloadedAnnos['1'] : [];
      const pins1 = Array.isArray(reloadedAnnos?._audioPins?.['1']) ? reloadedAnnos._audioPins['1'] : [];
      return {
        p1Count: p1Items.length,
        penCount: p1Items.filter(i => i.id === 'ff_pen_1').length,
        txtCount: p1Items.filter(i => i.id === 'ff_txt_1').length,
        pinCount: pins1.filter(p => p.id === 'ff_pin_1').length,
        sheet1Count: (reloadedAnnos?.['note_1'] || []).length,
        sheet2Count: (reloadedAnnos?.['note_1__s2'] || []).length
      };
    }, uidFF);

    assert(
      ffAfterSecondReload.p1Count === 2 &&
      ffAfterSecondReload.penCount === 1 &&
      ffAfterSecondReload.txtCount === 1 &&
      ffAfterSecondReload.pinCount === 1 &&
      ffAfterSecondReload.sheet1Count === 1 &&
      ffAfterSecondReload.sheet2Count === 1,
      'Test FF.6 (Gap 3): Second full reload after RPC confirmation does not duplicate, corrupt, or delete any annotations or Extra Note Sheets'
    );

    // Step 4 (Gap 4): QuotaExceededError on localStorage dirty markers (`pharmaAnnotationsDirty_<uid>`)
    // while IndexedDB annotation write succeeds -> reload with stale remote `annotations: {}` and failing RPC
    await tabFF.evaluate(async (uid) => {
      // Reset mocked remote row to empty annotations and failing RPC so reload tests reconciliation under quota-failed dirty marker
      const rawRemote = JSON.parse(localStorage.getItem('__exo_mock_remote_row') || '{}');
      rawRemote.annotations = {};
      rawRemote.revision = 3;
      localStorage.setItem('__exo_mock_remote_row', JSON.stringify(rawRemote));
      localStorage.setItem('__exo_mock_rpc_mode', 'fail');
      localStorage.removeItem('pharmaAnnotationsDirty_' + uid);
      localStorage.removeItem('pharmaWorkspaceDirty_' + uid);
      localStorage.removeItem('pharmaWorkspaceDirty');

      const origSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(k).includes('Dirty')) {
          const err = new DOMException('QuotaExceededError: Simulated dirty marker quota failure', 'QuotaExceededError');
          throw err;
        }
        return origSetItem.call(this, k, v);
      };
      try {
        const scopedKey = toScopedKey('7702', uid);
        pendingAnnoSaveMap[scopedKey] = {
          '1': [stampAnnotationItemCausalMetadata({ id: 'ff_quota_survivor_stroke', tool: 'pen', color: '#38bdf8', size: 2, points: [{ x: 0.15, y: 0.25 }, { x: 0.45, y: 0.55 }] }, 'stroke', '7702', '1', uid)]
        };
        await flushPendingAnnotationsSave(false);
      } finally {
        Storage.prototype.setItem = origSetItem;
      }
    }, uidFF);

    await tabFF.reload({ waitUntil: 'domcontentloaded' });
    await tabFF.waitForFunction(() => Boolean(
      window.__exoSupabaseStartupState &&
      window.__exoSupabaseStartupState.settled === true &&
      window.__exoSupabaseStartupState.syncWorkspaceOnLoginCalled === true
    ));

    const ffGap4AfterReload = await tabFF.evaluate(async (uid) => {
      const annos7702 = await getAnnotationsFromDB('7702', uid);
      const durableJournal = await readDurableCloudSyncJournal(uid);
      const navBtn = document.getElementById('cloudNavBtn');
      return {
        survivedQuotaReload: Boolean(annos7702?.['1']?.some(s => s.id === 'ff_quota_survivor_stroke')),
        journalHasPendingAnno: Boolean(durableJournal.hasDirtyAnnotations),
        noFalseSyncedUi: !Boolean(navBtn && navBtn.classList.contains('synced'))
      };
    }, uidFF);

    assert(
      ffGap4AfterReload.survivedQuotaReload === true &&
      ffGap4AfterReload.journalHasPendingAnno === true &&
      ffGap4AfterReload.noFalseSyncedUi === true,
      'Test FF.7 (Gap 4): When localStorage dirty marker throws QuotaExceededError, IndexedDB cloud_sync_journal preserves the local annotation across reload and mocked Supabase login without displaying a false synced status'
    );

    // Step 4b (Finding 1): Missing cloud_sync_journal store, transaction onerror, and transaction onabort
    // combined with failed localStorage dirty-marker writes and stale remote annotations: {} in real Chromium
    const ffJournalFailClosed = await tabFF.evaluate(async (uid) => {
      // Simulate lost localStorage dirty markers (as if QuotaExceededError prevented their write) and reset in-memory dirty flag
      localStorage.removeItem('pharmaAnnotationsDirty_' + uid);
      localStorage.removeItem('pharmaWorkspaceDirty_' + uid);
      localStorage.removeItem('pharmaWorkspaceDirty');
      dirtyAnnotationsForCloud = false;

      const staleRemoteRow = {
        user_id: uid,
        user_email: 'ff.session.user@exo-test.edu',
        can_upload_media: false,
        subjects: [],
        schedule: { version: 3, events: [], backlog: [], weeklyReports: [] },
        logs: [],
        annotations: {},
        revision: 1
      };

      // 1. Missing cloud_sync_journal store (override DOMStringList.prototype.contains so IDBDatabase.objectStoreNames getter returns false in Chromium)
      const origProtoContains = DOMStringList.prototype.contains;
      DOMStringList.prototype.contains = function (name) {
        if (String(name) === 'cloud_sync_journal') return false;
        return origProtoContains.call(this, name);
      };
      let missingStoreRes = null;
      try {
        const containsReturnsFalse = dbInstance.objectStoreNames.contains('cloud_sync_journal') === false;
        const loginRes = await syncWorkspaceOnLogin();
        const pullRes = await pullWorkspaceFromCloud(false);
        const applyRes = await applyCloudWorkspacePayload(staleRemoteRow, false);
        const pushRes = await pushWorkspaceToCloud(false, false);
        const annosAfter = await getAnnotationsFromDB('7702', uid);
        const navBtn = document.getElementById('cloudNavBtn');
        missingStoreRes = {
          containsReturnsFalse,
          allAbortedFailClosed: Boolean(
            containsReturnsFalse &&
            loginRes?.ok === false && loginRes?.status === 'error' && loginRes?.reason === 'durable_journal_read_failed' &&
            pullRes?.ok === false && pullRes?.status === 'error' && pullRes?.reason === 'durable_journal_read_failed' &&
            applyRes?.ok === false && applyRes?.status === 'error' && applyRes?.reason === 'durable_journal_read_failed' &&
            pushRes?.ok === false && pushRes?.status === 'error' && pushRes?.reason === 'durable_journal_read_failed'
          ),
          survived: Boolean(annosAfter?.['1']?.some(s => s.id === 'ff_quota_survivor_stroke')),
          uiError: Boolean(navBtn && navBtn.classList.contains('error') && !navBtn.classList.contains('synced'))
        };
      } finally {
        DOMStringList.prototype.contains = origProtoContains;
      }

      // 2. cloud_sync_journal readonly transaction onerror
      localStorage.removeItem('pharmaAnnotationsDirty_' + uid);
      localStorage.removeItem('pharmaWorkspaceDirty_' + uid);
      localStorage.removeItem('pharmaWorkspaceDirty');
      dirtyAnnotationsForCloud = false;
      const origTx = dbInstance.transaction.bind(dbInstance);
      dbInstance.transaction = function (storeNames, mode) {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        if (names.includes('cloud_sync_journal') && (!mode || mode === 'readonly')) {
          const fakeTx = {
            mode: 'readonly',
            error: new DOMException('Simulated journal readonly tx error', 'UnknownError'),
            oncomplete: null,
            onerror: null,
            onabort: null,
            objectStore() {
              return {
                get() {
                  const req = { result: null, error: fakeTx.error, onsuccess: null, onerror: null };
                  setTimeout(() => {
                    if (typeof req.onerror === 'function') req.onerror({ target: req });
                    if (typeof fakeTx.onerror === 'function') fakeTx.onerror({ target: fakeTx });
                  }, 0);
                  return req;
                }
              };
            }
          };
          return fakeTx;
        }
        return origTx(storeNames, mode);
      };
      let txErrorRes = null;
      try {
        const loginRes = await syncWorkspaceOnLogin();
        const pullRes = await pullWorkspaceFromCloud(false);
        const annosAfter = await getAnnotationsFromDB('7702', uid);
        const navBtn = document.getElementById('cloudNavBtn');
        txErrorRes = {
          abortedFailClosed: Boolean(
            loginRes?.status === 'error' && loginRes?.journalReason === 'journal_tx_error' &&
            pullRes?.status === 'error' && pullRes?.journalReason === 'journal_tx_error'
          ),
          survived: Boolean(annosAfter?.['1']?.some(s => s.id === 'ff_quota_survivor_stroke')),
          uiError: Boolean(navBtn && navBtn.classList.contains('error'))
        };
      } finally {
        dbInstance.transaction = origTx;
      }

      // 3. cloud_sync_journal readonly transaction onabort (deterministic abort on real IDBTransaction before completion)
      localStorage.removeItem('pharmaAnnotationsDirty_' + uid);
      localStorage.removeItem('pharmaWorkspaceDirty_' + uid);
      localStorage.removeItem('pharmaWorkspaceDirty');
      dirtyAnnotationsForCloud = false;
      let onabortFiredCount = 0;
      dbInstance.transaction = function (storeNames, mode) {
        const tx = origTx(storeNames, mode);
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        if (names.includes('cloud_sync_journal') && (!mode || mode === 'readonly')) {
          tx.addEventListener('abort', () => {
            onabortFiredCount++;
          });
          queueMicrotask(() => {
            try { tx.abort(); } catch (e) {}
          });
        }
        return tx;
      };
      let txAbortRes = null;
      try {
        const directJournalRes = await readDurableCloudSyncJournal(uid);
        const loginRes = await syncWorkspaceOnLogin();
        const pullRes = await pullWorkspaceFromCloud(false);
        const applyRes = await applyCloudWorkspacePayload(staleRemoteRow, false);
        const pushRes = await pushWorkspaceToCloud(false, false);
        const annosAfter = await getAnnotationsFromDB('7702', uid);
        const navBtn = document.getElementById('cloudNavBtn');
        txAbortRes = {
          onabortFiredCount,
          directJournalOk: directJournalRes?.ok,
          directJournalReason: directJournalRes?.reason,
          abortedFailClosed: Boolean(
            onabortFiredCount >= 5 &&
            directJournalRes?.ok === false && directJournalRes?.reason === 'journal_tx_aborted' &&
            loginRes?.status === 'error' && loginRes?.journalReason === 'journal_tx_aborted' &&
            pullRes?.status === 'error' && pullRes?.journalReason === 'journal_tx_aborted' &&
            applyRes?.status === 'error' && applyRes?.journalReason === 'journal_tx_aborted' &&
            pushRes?.status === 'error' && pushRes?.journalReason === 'journal_tx_aborted'
          ),
          survived: Boolean(annosAfter?.['1']?.some(s => s.id === 'ff_quota_survivor_stroke')),
          uiError: Boolean(navBtn && navBtn.classList.contains('error') && !navBtn.classList.contains('synced'))
        };
      } finally {
        dbInstance.transaction = origTx;
      }

      return { missingStoreRes, txErrorRes, txAbortRes };
    }, uidFF);

    assert(
      ffJournalFailClosed.missingStoreRes.allAbortedFailClosed === true &&
      ffJournalFailClosed.missingStoreRes.survived === true &&
      ffJournalFailClosed.missingStoreRes.uiError === true,
      'Test FF.7b (Finding 1): Missing cloud_sync_journal store fails closed across syncWorkspaceOnLogin, pullWorkspaceFromCloud, applyCloudWorkspacePayload, and pushWorkspaceToCloud in real Chromium'
    );
    assert(
      ffJournalFailClosed.txErrorRes.abortedFailClosed === true &&
      ffJournalFailClosed.txErrorRes.survived === true &&
      ffJournalFailClosed.txErrorRes.uiError === true,
      'Test FF.7c (Finding 1): cloud_sync_journal transaction onerror fails closed and preserves local annotations against stale remote annotations:{} in real Chromium'
    );
    assert(
      ffJournalFailClosed.txAbortRes.abortedFailClosed === true &&
      ffJournalFailClosed.txAbortRes.survived === true &&
      ffJournalFailClosed.txAbortRes.uiError === true,
      'Test FF.7d (Finding 1): cloud_sync_journal transaction onabort fails closed and preserves local annotations against stale remote annotations:{} in real Chromium'
    );

    // Step 5 (Finding 2): Inject workspace_state IDB transaction failure (onerror) and abort (onabort)
    // under pharmaSubjectsV4 QuotaExceededError, verify truthful idbPersisted=false, open modal retention,
    // no duplicate Chapter on retry, and real UI click + reload without manually awaiting idbPersistPromise
    const ffChapterErrorAndAbort = await tabFF.evaluate(async (uid) => {
      localStorage.setItem('__exo_mock_rpc_mode', 'success');
      await pushWorkspaceToCloud(false, false);

      activeSubjectId = 8801;
      window.__origSetItemFF = Storage.prototype.setItem;
      window.__origDbTxFF = dbInstance.transaction.bind(dbInstance);
      window.__wsTxFaultMode = 'onerror'; // 'onerror' -> 'onabort' -> 'none'

      Storage.prototype.setItem = function (k, v) {
        if (String(k) === 'pharmaSubjectsV4') {
          throw new DOMException('QuotaExceededError: Simulated pharmaSubjectsV4 quota failure', 'QuotaExceededError');
        }
        return window.__origSetItemFF.call(this, k, v);
      };

      dbInstance.transaction = function (storeNames, mode) {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        if (names.includes('workspace_state') && mode === 'readwrite') {
          if (window.__wsTxFaultMode === 'onerror') {
            const fakeTx = {
              mode: 'readwrite',
              error: new DOMException('Simulated workspace_state write error', 'UnknownError'),
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore() {
                return {
                  put() {
                    const req = { result: null, error: fakeTx.error, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      if (typeof req.onerror === 'function') req.onerror({ target: req });
                      if (typeof fakeTx.onerror === 'function') fakeTx.onerror({ target: fakeTx });
                    }, 0);
                    return req;
                  }
                };
              }
            };
            return fakeTx;
          }
          if (window.__wsTxFaultMode === 'onabort') {
            const realTx = window.__origDbTxFF(storeNames, mode);
            queueMicrotask(() => {
              try { realTx.abort(); } catch (e) {}
            });
            return realTx;
          }
        }
        return window.__origDbTxFF(storeNames, mode);
      };

      // Open Add Chapter dialog via production triggerAddGroup()
      triggerAddGroup();
      const inputEl = document.getElementById('siModalInput');
      if (inputEl) inputEl.value = 'Durable IDB Chapter 99';

      // Attempt 1: pharmaSubjectsV4 throws QuotaExceededError AND workspace_state IDB tx fires onerror
      const attempt1Res = await saveSingleInputModal();
      const diagAfterAttempt1 = getLastStorageFailureDiagnostics();
      const overlayAfterAttempt1 = document.getElementById('singleInputModalOverlay')?.classList.contains('active');
      const countAfterAttempt1 = (subjects.find(s => Number(s.id) === 8801)?.groups || []).filter(g => g.name === 'Durable IDB Chapter 99').length;

      // Attempt 2 (Retry on still-open modal): pharmaSubjectsV4 throws QuotaExceededError AND workspace_state IDB tx aborts (onabort)
      window.__wsTxFaultMode = 'onabort';
      const attempt2Res = await saveSingleInputModal();
      const overlayAfterAttempt2 = document.getElementById('singleInputModalOverlay')?.classList.contains('active');
      const countAfterAttempt2 = (subjects.find(s => Number(s.id) === 8801)?.groups || []).filter(g => g.name === 'Durable IDB Chapter 99').length;

      // Prepare Attempt 3: allow workspace_state IDB transaction to succeed while pharmaSubjectsV4 STILL throws QuotaExceededError
      window.__wsTxFaultMode = 'none';

      return {
        attempt1IdbPersisted: attempt1Res?.idbPersisted,
        attempt1ModalClosed: attempt1Res?.modalClosed,
        overlayAfterAttempt1: Boolean(overlayAfterAttempt1),
        countAfterAttempt1,
        failedKey: diagAfterAttempt1?.failedKey || null,
        errorName: diagAfterAttempt1?.errorName || null,
        attempt2IdbPersisted: attempt2Res?.idbPersisted,
        attempt2ModalClosed: attempt2Res?.modalClosed,
        overlayAfterAttempt2: Boolean(overlayAfterAttempt2),
        countAfterAttempt2
      };
    }, uidFF);

    assert(
      ffChapterErrorAndAbort.attempt1IdbPersisted === false &&
      ffChapterErrorAndAbort.attempt1ModalClosed === false &&
      ffChapterErrorAndAbort.overlayAfterAttempt1 === true &&
      ffChapterErrorAndAbort.countAfterAttempt1 === 1 &&
      ffChapterErrorAndAbort.failedKey === 'pharmaSubjectsV4' &&
      ffChapterErrorAndAbort.errorName === 'QuotaExceededError',
      'Test FF.8 (Finding 2): When pharmaSubjectsV4 fails and workspace_state IDB transaction fires onerror, idbPersisted is false, modal remains open, and in-memory Chapter is preserved'
    );

    assert(
      ffChapterErrorAndAbort.attempt2IdbPersisted === false &&
      ffChapterErrorAndAbort.attempt2ModalClosed === false &&
      ffChapterErrorAndAbort.overlayAfterAttempt2 === true &&
      ffChapterErrorAndAbort.countAfterAttempt2 === 1,
      'Test FF.8b (Finding 2): When retry aborts in workspace_state IDB transaction (onabort), idbPersisted is false, modal stays open, and duplicate Chapter creation is prevented'
    );

    // Attempt 3: Actual Playwright UI click on #siModalSaveBtn while pharmaSubjectsV4 still fails,
    // waiting ONLY for the modal UI to close (without manually awaiting idbPersistPromise inside the test!),
    // then deleting Chapter 8810 via actual UI click on #confirmModalBtn, and reloading immediately!
    await tabFF.click('#siModalSaveBtn');
    await tabFF.waitForFunction(() => {
      const el = document.getElementById('singleInputModalOverlay');
      return Boolean(el && !el.classList.contains('active'));
    });

    await tabFF.evaluate(() => {
      triggerDeleteGroup(8810);
    });
    await tabFF.click('#confirmModalBtn');
    await tabFF.waitForFunction(() => {
      const el = document.getElementById('confirmModalOverlay');
      return Boolean(el && !el.classList.contains('active'));
    });

    // Restore Storage.prototype.setItem before reload
    await tabFF.evaluate(() => {
      if (window.__origSetItemFF) Storage.prototype.setItem = window.__origSetItemFF;
      if (window.__origDbTxFF && dbInstance) dbInstance.transaction = window.__origDbTxFF;
    });

    // Reload page in Chromium and verify added Chapter 99 is present (exactly once!) and deleted Chapter 8810 does NOT reappear!
    await tabFF.reload({ waitUntil: 'domcontentloaded' });
    await tabFF.waitForFunction(() => Boolean(
      window.__exoSupabaseStartupState &&
      window.__exoSupabaseStartupState.settled === true &&
      window.__exoSupabaseStartupState.syncWorkspaceOnLoginCalled === true
    ));

    const ffChapterAfterReload = await tabFF.evaluate(async () => {
      const sub8801 = subjects.find(s => s && Number(s.id) === 8801);
      const groupNames = (sub8801?.groups || []).map(g => g.name);
      const chapter99Count = groupNames.filter(n => n === 'Durable IDB Chapter 99').length;
      const hasOldDeletedGroup = (sub8801?.groups || []).some(g => Number(g.id) === 8810);
      return {
        groupNames,
        hasNewChapter99: chapter99Count === 1,
        chapter99Count,
        hasOldDeletedGroup
      };
    });

    assert(
      ffChapterAfterReload.hasNewChapter99 === true &&
      ffChapterAfterReload.chapter99Count === 1 &&
      ffChapterAfterReload.hasOldDeletedGroup === false,
      'Test FF.9 (Finding 2): After actual UI click on #siModalSaveBtn and #confirmModalBtn followed by immediate Chromium reload (without manually awaiting idbPersistPromise), Chapter 99 survives without duplicates and deleted Chapter 8810 does not reappear'
    );

    await tabFF.close();
    await contextFF.close();

    // =========================================================================
    // TEST GG: STABILITY & RESPONSIVENESS SPRINT — END-TO-END SAVE LIFECYCLE,
    // NAVIGATION & PDF CLOSE LATENCY, MODAL INPUT PRESERVATION & OFFLINE->ONLINE SYNC
    // =========================================================================
    console.log('\n--- Test GG: Stability & Responsiveness Sprint E2E Verification ---');
    const contextGG = await browser.newContext();
    await contextGG.route('**/*', (route) => {
      const reqUrl = route.request().url();
      if (reqUrl.startsWith('http://127.0.0.1:') || reqUrl.startsWith('http://localhost:')) {
        return route.continue();
      }
      return route.abort();
    });

    const uidGG1 = 'b0770000-1111-4222-8333-444455550001';
    const uidGG2 = 'b0770000-1111-4222-8333-444455550002';
    const tabGG = await contextGG.newPage();
    await tabGG.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await tabGG.waitForFunction(() => Boolean(window.__exoSupabaseStartupState && window.__exoSupabaseStartupState.settled === true));

    // GG.1: Complete End-to-End Save Lifecycle Across All Domains + Page Reload
    const gg1CreateAndEdit = await tabGG.evaluate(async (uid) => {
      await initPdfDB();
      await handleAuthSessionChange({ id: uid, email: 'gg1@exo.edu', name: 'GG1 Student' }, false);
      subjects = [];
      scheduleEvents = [];
      scheduleBacklog = [];
      weeklyReports = [];
      logs = [];

      // 1. Create Subject via Smart Subject Modal
      openSmartSubjectModal();
      document.getElementById('smartSubjectNameInput').value = 'Clinical Pharmacokinetics GG';
      document.getElementById('smartSubjectExamTitleInput').value = 'Midterm Exam';
      document.getElementById('smartSubjectExamDateInput').value = '2026-12-15';
      saveSmartSubjectModal();
      const createdSub = subjects[0];
      openSubject(createdSub.id);

      // 2. Create Group & Chapter via triggerAddGroup + saveSingleInputModal
      triggerAddGroup();
      document.getElementById('siModalInput').value = 'Chapter 1: Clearance & Volume';
      await saveSingleInputModal();

      triggerAddGroup();
      document.getElementById('siModalInput').value = 'Chapter 2: Renal Elimination';
      await saveSingleInputModal();

      const ch1 = createdSub.groups.find(g => g.name === 'Chapter 1: Clearance & Volume');

      // 3. Add two Lectures via triggerAddLecture
      triggerAddLecture(ch1.id);
      document.getElementById('diModalInput1').value = 'Lec 1: Hepatic Clearance';
      document.getElementById('diModalInput2').value = 'https://example.com/hepatic.pdf';
      await document.getElementById('diModalSaveBtn').onclick();

      triggerAddLecture(ch1.id);
      document.getElementById('diModalInput1').value = 'Lec 2: Temp To Delete';
      document.getElementById('diModalInput2').value = 'https://example.com/temp.pdf';
      await document.getElementById('diModalSaveBtn').onclick();

      const lec1 = ch1.lectures.find(l => l.title === 'Lec 1: Hepatic Clearance');
      const lecTemp = ch1.lectures.find(l => l.title === 'Lec 2: Temp To Delete');

      // 4. Edit Lecture 1 via triggerEditLecture
      triggerEditLecture(ch1.id, lec1.id);
      document.getElementById('diModalInput1').value = 'Lec 1: Hepatic & Intrinsic Clearance (Updated)';
      document.getElementById('diModalInput2').value = 'https://example.com/hepatic_v2.pdf';
      await document.getElementById('diModalSaveBtn').onclick();

      // 5. Delete temporary Lecture 2 via triggerDeleteLecture
      triggerDeleteLecture(ch1.id, lecTemp.id);
      await document.getElementById('confirmModalBtn').onclick();

      // 6. Save Schedule Session, Backlog Task, Study Log, and Weekly Report
      document.getElementById('sessionEditId').value = '';
      document.getElementById('sessionTitleInput').value = 'PK Clearance Deep Study';
      populateSubjectDropdowns();
      document.getElementById('sessionSubjectSelect').value = String(createdSub.id);
      document.getElementById('sessionDaySelect').value = '2';
      document.getElementById('sessionStartHourSelect').value = '14';
      document.getElementById('sessionTypeSelect').value = 'important';
      document.getElementById('sessionNotesInput').value = 'Solve practice problems 1-10';
      saveSession();

      document.getElementById('newTaskTitle').value = 'Finish Clearance Problem Set';
      document.getElementById('newTaskSubject').value = String(createdSub.id);
      addBacklogTask();

      triggerAddLogPro();
      document.getElementById('logTextInput').value = 'Completed Hepatic Clearance derivations';
      document.getElementById('logSubjectSelect').value = String(createdSub.id);
      document.getElementById('logMoodSelect').value = 'fire';
      saveLogPro();

      weeklyReports.push({
        id: 'rep_gg_1',
        weekStartIso: '2026-11-08',
        completionRate: 92,
        totalPlannedHours: 12,
        totalCompletedHours: 11,
        archivedGoals: [{ id: 'ag_gg_1', title: 'Archived Goal GG', done: true }]
      });
      saveScheduleData();

      // 7. Add PDF Annotation & Reading Bookmark
      await openLectureDocument(ch1.id, lec1.id);
      currentActivePageNum = 4;
      totalPdfPages = 18;
      pageAnnotations[1] = [{
        id: 'stroke_gg1_1',
        tool: 'pen',
        color: '#2dd4bf',
        size: 3,
        points: [{ x: 12, y: 18 }, { x: 64, y: 82 }]
      }];
      saveAnnotationsToDB(lec1.id, pageAnnotations);
      await closePdfViewer();

      return {
        subjectId: createdSub.id,
        ch1Id: ch1.id,
        lec1Id: lec1.id,
        deletedLecId: lecTemp.id
      };
    }, uidGG1);

    // Reload page and verify all created/edited/deleted items survive reload and workspace restoration
    await tabGG.reload({ waitUntil: 'domcontentloaded' });
    await tabGG.waitForFunction(() => typeof initPdfDB === 'function' && typeof subjects !== 'undefined');

    const gg1PostReload = await tabGG.evaluate(async ({ uid, ids }) => {
      await initPdfDB();
      await handleAuthSessionChange({ id: uid, email: 'gg1@exo.edu', name: 'GG1 Student' }, false);
      await migrateAndHydrateWorkspaceFromIDB(uid);

      const sub = subjects.find(s => String(s.id) === String(ids.subjectId));
      const ch1 = sub ? (sub.groups || []).find(g => String(g.id) === String(ids.ch1Id)) : null;
      const ch2 = sub ? (sub.groups || []).find(g => g.name === 'Chapter 2: Renal Elimination') : null;
      const lec1 = ch1 ? (ch1.lectures || []).find(l => String(l.id) === String(ids.lec1Id)) : null;
      const deletedStillGone = ch1 ? !(ch1.lectures || []).some(l => String(l.id) === String(ids.deletedLecId)) : false;
      const annos = await getAnnotationsFromDB(ids.lec1Id, uid);

      return {
        subFound: Boolean(sub && sub.name === 'Clinical Pharmacokinetics GG'),
        ch1Found: Boolean(ch1),
        ch2Found: Boolean(ch2),
        lec1Updated: Boolean(lec1 && lec1.title === 'Lec 1: Hepatic & Intrinsic Clearance (Updated)' && lec1.path === 'https://example.com/hepatic_v2.pdf'),
        bookmarkSaved: Boolean(lec1 && lec1.lastPageNum === 4 && lec1.totalPages === 18),
        deletedStillGone,
        sessionSaved: scheduleEvents.some(e => e.title === 'PK Clearance Deep Study' && e.notes === 'Solve practice problems 1-10'),
        backlogSaved: scheduleBacklog.some(b => b.title === 'Finish Clearance Problem Set'),
        logSaved: logs.some(l => l.text === 'Completed Hepatic Clearance derivations'),
        reportSaved: weeklyReports.some(r => r.id === 'rep_gg_1' && r.completionRate === 92),
        annoSaved: Boolean(annos && Array.isArray(annos[1]) && annos[1].some(st => st.id === 'stroke_gg1_1'))
      };
    }, { uid: uidGG1, ids: gg1CreateAndEdit });

    assert(
      gg1PostReload.subFound &&
      gg1PostReload.ch1Found &&
      gg1PostReload.ch2Found &&
      gg1PostReload.lec1Updated &&
      gg1PostReload.bookmarkSaved &&
      gg1PostReload.deletedStillGone &&
      gg1PostReload.sessionSaved &&
      gg1PostReload.backlogSaved &&
      gg1PostReload.logSaved &&
      gg1PostReload.reportSaved &&
      gg1PostReload.annoSaved,
      'Test GG.1: Complete end-to-end save & reload lifecycle preserves Subject, Groups, Chapters, added/edited/deleted Lectures, Schedule, Backlog, Logs, Weekly Reports, PDF Bookmarks, and Annotations across browser reload'
    );

    // GG.2 & GG.3: Navigation Responsiveness + PDF Viewer Instant Open/Close & Escape Key Support
    const gg2And3Perf = await tabGG.evaluate(async (ids) => {
      const tNav1 = performance.now();
      switchView('schedule');
      const navScheduleMs = performance.now() - tNav1;
      const scheduleActive = document.getElementById('schedule')?.classList.contains('active');

      const tNav2 = performance.now();
      switchView('tracker');
      const navTrackerMs = performance.now() - tNav2;
      const trackerActive = document.getElementById('tracker')?.classList.contains('active');

      const tNav3 = performance.now();
      switchView('subjects');
      const navSubjectsMs = performance.now() - tNav3;
      const subjectsActive = document.getElementById('subjects')?.classList.contains('active');

      openSubject(ids.subjectId);
      const openPromise = openLectureDocument(ids.ch1Id, ids.lec1Id);
      const modalVisibleImmediately = document.getElementById('pdfViewerModalOverlay')?.classList.contains('active');
      await openPromise;

      // Test closing via closePdfViewer() button handler
      const overlay = document.getElementById('pdfViewerModalOverlay');
      const tCloseBtn = performance.now();
      const closePromise = closePdfViewer();
      const closedSynchronouslyOnCall = !overlay.classList.contains('active');
      const hideMsBtn = performance.now() - tCloseBtn;
      await closePromise;
      const closedAfterBtn = closedSynchronouslyOnCall && !overlay.classList.contains('active');

      // Reopen and test closing via Escape key
      await openLectureDocument(ids.ch1Id, ids.lec1Id);
      const openBeforeEsc = overlay.classList.contains('active');
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      const closedAfterEsc = !overlay.classList.contains('active');

      return {
        navScheduleMs,
        navTrackerMs,
        navSubjectsMs,
        scheduleActive,
        trackerActive,
        subjectsActive,
        modalVisibleImmediately,
        hideMsBtn,
        closedAfterBtn,
        openBeforeEsc,
        closedAfterEsc
      };
    }, gg1CreateAndEdit);

    assert(
      gg2And3Perf.scheduleActive &&
      gg2And3Perf.trackerActive &&
      gg2And3Perf.subjectsActive &&
      gg2And3Perf.navScheduleMs < 150 &&
      gg2And3Perf.navTrackerMs < 150 &&
      gg2And3Perf.navSubjectsMs < 150,
      'Test GG.2: Main view navigation (subjects <-> schedule <-> tracker) switches cleanly and renders in under 150ms'
    );

    assert(
      gg2And3Perf.modalVisibleImmediately === true &&
      gg2And3Perf.closedAfterBtn === true &&
      gg2And3Perf.hideMsBtn < 50 &&
      gg2And3Perf.openBeforeEsc === true &&
      gg2And3Perf.closedAfterEsc === true,
      'Test GG.3: PDF Viewer shows immediately on open and hides visually in under 50ms on both close button and Escape key'
    );

    // GG.4: Modal Input Preservation When Both LocalStorage and IndexedDB Fail
    const gg4InputPreservation = await tabGG.evaluate(async () => {
      const origSetItem = Storage.prototype.setItem;
      const origTx = dbInstance.transaction.bind(dbInstance);
      try {
        Storage.prototype.setItem = function(k, v) {
          if (String(k) === 'pharmaSubjectsV4' || String(k) === 'pharmaLogsV4') {
            const err = new Error('QuotaExceededError: Simulated full storage');
            err.name = 'QuotaExceededError';
            throw err;
          }
          return origSetItem.call(this, k, v);
        };
        dbInstance.transaction = function(storeNames, mode) {
          const names = Array.isArray(storeNames) ? storeNames : [storeNames];
          if (mode === 'readwrite' && names.includes('workspace_state')) {
            const tx = origTx(storeNames, mode);
            queueMicrotask(() => {
              try { tx.abort(); } catch (e) {}
            });
            return tx;
          }
          return origTx(storeNames, mode);
        };

        openSmartSubjectModal();
        document.getElementById('smartSubjectNameInput').value = 'Unsaved Subject Input Must Stay';
        await saveSmartSubjectModal();
        const subModalStillOpen = document.getElementById('smartSubjectModalOverlay')?.classList.contains('active');
        const subInputPreserved = document.getElementById('smartSubjectNameInput')?.value === 'Unsaved Subject Input Must Stay';

        triggerAddLogPro();
        document.getElementById('logTextInput').value = 'Unsaved Study Log Input Must Stay';
        await saveLogPro();
        const logModalStillOpen = document.getElementById('addLogModalOverlay')?.classList.contains('active');
        const logInputPreserved = document.getElementById('logTextInput')?.value === 'Unsaved Study Log Input Must Stay';

        return {
          subModalStillOpen: Boolean(subModalStillOpen),
          subInputPreserved: Boolean(subInputPreserved),
          logModalStillOpen: Boolean(logModalStillOpen),
          logInputPreserved: Boolean(logInputPreserved)
        };
      } finally {
        Storage.prototype.setItem = origSetItem;
        dbInstance.transaction = origTx;
        subjects = subjects.filter(s => s.name !== 'Unsaved Subject Input Must Stay');
        logs = logs.filter(l => l.text !== 'Unsaved Study Log Input Must Stay');
        pendingSmartSubjectDraftObj = null;
        closeModal('smartSubjectModalOverlay');
        closeModal('addLogModalOverlay');
      }
    });

    assert(
      gg4InputPreservation.subModalStillOpen === true &&
      gg4InputPreservation.subInputPreserved === true &&
      gg4InputPreservation.logModalStillOpen === true &&
      gg4InputPreservation.logInputPreserved === true,
      'Test GG.4: Add Subject and Add Log modals stay open and preserve user input text when both LocalStorage and IndexedDB writes fail'
    );

    // GG.5: Offline Save Indicator -> Online Reconnect Sync + Cross-Account Isolation
    const gg5OfflineAndIsolation = await tabGG.evaluate(async ({ uid1, uid2 }) => {
      // Simulate offline save for uid1
      updateCloudNavUI('offline');
      const offlineNavText = document.getElementById('cloudNavText')?.innerText || '';
      const offlineBadgeText = document.getElementById('cloudLiveSyncBadge')?.innerText || '';

      updateCloudNavUI('pending');
      const pendingNavText = document.getElementById('cloudNavText')?.innerText || '';

      // Switch to Account 2 (uid2) and verify zero data leakage from uid1
      await handleAuthSessionChange({ id: uid2, email: 'gg2@exo.edu', name: 'GG2 Isolated User' }, false);
      const uid2SubjectsCount = subjects.length;
      const uid2EventsCount = scheduleEvents.length;
      const uid2LogsCount = logs.length;

      // Switch back to Account 1 (uid1) and verify Account 1's data is restored intact
      await handleAuthSessionChange({ id: uid1, email: 'gg1@exo.edu', name: 'GG1 Student' }, false);
      const uid1RestoredSub = subjects.some(s => s.name === 'Clinical Pharmacokinetics GG');

      return {
        offlineShowsSavedLocally: offlineNavText.includes('تم الحفظ محليًا — المزامنة معلقة') && offlineBadgeText.includes('تم الحفظ محليًا — المزامنة معلقة'),
        pendingShowsSavedLocally: pendingNavText.includes('تم الحفظ محليًا — المزامنة معلقة'),
        uid2Isolated: uid2SubjectsCount === 0 && uid2EventsCount === 0 && uid2LogsCount === 0,
        uid1RestoredSub
      };
    }, { uid1: uidGG1, uid2: uidGG2 });

    assert(
      gg5OfflineAndIsolation.offlineShowsSavedLocally === true &&
      gg5OfflineAndIsolation.pendingShowsSavedLocally === true &&
      gg5OfflineAndIsolation.uid2Isolated === true &&
      gg5OfflineAndIsolation.uid1RestoredSub === true,
      'Test GG.5: Offline/pending states display clear Arabic local-save indicator, and switching accounts enforces strict isolation while preserving each account workspace'
    );

    await tabGG.close();
    await contextGG.close();

    // =========================================================================
    // TEST HH: P0 Storage Quota Exhaustion (~5.06 MiB), 7-Step Verified Conflict
    // Recovery Migration to IndexedDB, Durable Tombstone Cases A/B/C/D, Reload
    // Non-Resurrection, Cloud Sync Non-Resurrection, and Cross-Account Isolation
    // =========================================================================
    console.log('\n--- TEST HH: P0 Storage Pressure (~5.06 MiB), 7-Step Conflict Recovery IDB Migration & Durable Tombstones (Cases A/B/C/D) ---');
    const contextHH = await browser.newContext();
    const tabHH = await contextHH.newPage();
    await tabHH.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await tabHH.waitForFunction(() => typeof window.saveSubjects === 'function' && typeof window.migrateConflictRecoveryToIDB === 'function');

    const uidHH1 = 'hh100000-1111-4222-8333-444455550001';
    const uidHH2 = 'hh200000-2222-4333-8444-555566660002';

    // HH.1 & HH.2: Seed ~3.83 MiB pharmaConflictRecovery_<uid> + ~1.12 MiB pharmaAccountWorkspace_<uid> (~5.06 MiB total),
    // run privacy-safe diagnostics, test interrupted STAGED crash recovery, then complete 7-step verified migration
    const hh1And2Migration = await tabHH.evaluate(async ({ uid1, uid2 }) => {
      await handleAuthSessionChange({ id: uid1, email: 'hh1@exo.edu', name: 'HH1 Student' }, false);

      // Seed foreign account (uid2) conflict recovery record
      const foreignRecs = [{
        recoveryId: 'crec_hh2_isolated',
        userId: uid2,
        entityType: 'subjects',
        entityId: 'sub_hh2_1',
        reason: 'concurrent_entity_tie_break',
        status: 'unresolved',
        recordedAtIso: '2026-11-05T10:00:00.000Z',
        losingOperationId: 'op_hh2_lose_1',
        winningOperationId: 'op_hh2_win_1',
        losingValue: { id: 'sub_hh2_1', name: 'Isolated Account 2 Subject' }
      }];
      localStorage.setItem('pharmaConflictRecovery_' + uid2, JSON.stringify(foreignRecs));

      // Build realistic ~3.83 MiB bloated conflict recovery payload with duplicates + nested hierarchy bloat
      const heavyPad = 'P'.repeat(24000);
      const uniqueChunkCount = 40;
      const bloatedRecords = [];
      for (let i = 0; i < uniqueChunkCount; i++) {
        const baseLosingValue = {
          id: 8000 + i,
          name: 'Confidential Subject Title ' + i,
          groups: [
            {
              id: 8100 + i,
              name: 'Confidential Group ' + i,
              lectures: [
                { id: 8200 + i, name: 'Lec ' + i, notesPad: heavyPad + '_' + i }
              ]
            }
          ]
        };
        // Push 3 duplicate copies per losingOperationId with different winningOperationIds (~120 records -> ~3.0+ MiB)
        for (let dup = 0; dup < 3; dup++) {
          bloatedRecords.push({
            recoveryId: `crec_hh1_${i}_dup_${dup}`,
            userId: uid1,
            entityType: i % 2 === 0 ? 'subjects' : 'groups',
            entityId: String(8000 + i),
            scopeId: `entity:${i % 2 === 0 ? 'subjects' : 'groups'}:${8000 + i}`,
            reason: i % 3 === 0 ? 'delete_superseded_concurrent_or_stale_entity' : 'concurrent_entity_tie_break',
            status: i % 5 === 0 ? 'resolved' : 'unresolved',
            recordedAtIso: new Date(1762000000000 + i * 60000 + dup * 1000).toISOString(),
            losingOperationId: `op_lose_hh1_${i}`,
            winningOperationId: `op_win_hh1_${i}_v${dup}`,
            losingValue: baseLosingValue
          });
        }
      }

      const bloatedConflictStr = JSON.stringify(bloatedRecords);
      localStorage.setItem('pharmaConflictRecovery_' + uid1, bloatedConflictStr);

      // Seed ~1.1 MiB pharmaAccountWorkspace_<uid1> containing embedded _conflictRecovery slice
      const initialSubjects = [
        {
          id: 9001,
          name: 'Clinical Pharmacology HH',
          icon: 'fa-capsules',
          color: '#38bdf8',
          groups: [
            { id: 9101, name: 'Chapter 1: Autonomic Drugs', lectures: [{ id: 9201, name: 'Cholinergic Agonists' }] },
            { id: 9102, name: 'Chapter 2: Cardiovascular', lectures: [{ id: 9202, name: 'Beta Blockers' }] },
            { id: 9103, name: 'Chapter 3: CNS Pharmacology', lectures: [{ id: 9203, name: 'Anesthetics' }] }
          ]
        }
      ];
      subjects = JSON.parse(JSON.stringify(initialSubjects));
      activeSubjectId = 9001;
      localStorage.setItem('pharmaSubjectsV4', JSON.stringify(subjects));

      const bloatedAccountSnap = {
        user_id: uid1,
        user_email: 'hh1@exo.edu',
        subjects: subjects,
        schedule: {
          version: 3,
          events: [],
          backlog: [],
          weeklyReports: [],
          _conflictRecovery: bloatedRecords.slice(0, 36)
        },
        logs: [],
        annotationsStoredInIndexedDB: true,
        revision: 1
      };
      localStorage.setItem('pharmaAccountWorkspace_' + uid1, JSON.stringify(bloatedAccountSnap));

      // Compute total LocalStorage bytes before migration
      let totalLsBytesBefore = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || '';
        totalLsBytesBefore += (k.length + v.length);
      }
      const conflictKeyBytesBefore = (localStorage.getItem('pharmaConflictRecovery_' + uid1) || '').length;
      const accountSnapBytesBefore = (localStorage.getItem('pharmaAccountWorkspace_' + uid1) || '').length;

      // Measure saveSubjects() latency under extreme LocalStorage pressure before migration
      const tSaveBefore0 = performance.now();
      const saveBeforeRes = saveSubjects();
      await saveBeforeRes.idbPersistPromise;
      const saveSubjectsMsBefore = performance.now() - tSaveBefore0;

      // Run privacy-safe diagnostic inspector
      const diagBefore = inspectConflictRecoveryDiagnostics(uid1);
      const diagSerialized = JSON.stringify(diagBefore);

      // Simulate crash right after STAGED write in IndexedDB before LocalStorage compaction
      window.__exoConflictMigrationTestHooks = {
        afterStage: () => {
          throw new Error('SIMULATED_CHROMIUM_CRASH_AFTER_STAGE');
        }
      };
      const crashMigRes = await migrateConflictRecoveryToIDB(uid1);
      window.__exoConflictMigrationTestHooks = null;
      const sourceIntactAfterCrash = (localStorage.getItem('pharmaConflictRecovery_' + uid1) || '').length === conflictKeyBytesBefore;

      // Now resume migration and verify 7-step completion
      const tMig0 = performance.now();
      const migRes = await migrateConflictRecoveryToIDB(uid1);
      const migrationMs = performance.now() - tMig0;

      let totalLsBytesAfter = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || '';
        totalLsBytesAfter += (k.length + v.length);
      }
      const conflictKeyBytesAfter = (localStorage.getItem('pharmaConflictRecovery_' + uid1) || '').length;
      const accountSnapBytesAfter = (localStorage.getItem('pharmaAccountWorkspace_' + uid1) || '').length;
      const pointerObj = JSON.parse(localStorage.getItem('pharmaConflictRecovery_' + uid1) || 'null');
      const activeRecsAfter = getConflictRecoveryRecords(uid1);
      const foreignIntact = localStorage.getItem('pharmaConflictRecovery_' + uid2) === JSON.stringify(foreignRecs);

      return {
        totalLsBytesBefore,
        conflictKeyBytesBefore,
        accountSnapBytesBefore,
        saveSubjectsMsBefore,
        diagOk: diagBefore?.ok === true,
        diagTotalRecords: diagBefore?.totalRecords,
        diagUniqueRecords: diagBefore?.uniqueRecords,
        diagDuplicateRecords: diagBefore?.duplicateRecords,
        diagZeroPersonalLeak: !diagSerialized.includes('Confidential Subject Title') && !diagSerialized.includes('Confidential Group'),
        crashAbortedCleanly: crashMigRes?.ok === false && sourceIntactAfterCrash === true,
        migOk: migRes?.ok === true && migRes?.migrated === true && migRes?.recoveredFromInterruptedStage === true,
        migRecordCount: migRes?.recordCount,
        migrationMs,
        totalLsBytesAfter,
        conflictKeyBytesAfter,
        accountSnapBytesAfter,
        pointerValid: pointerObj?.__exoIdbMigrated === true && pointerObj?.count === uniqueChunkCount,
        activeRecsCount: activeRecsAfter.length,
        foreignIntact
      };
    }, { uid1: uidHH1, uid2: uidHH2 });

    console.log(`  [HH Metrics] LocalStorage Before: ${(hh1And2Migration.totalLsBytesBefore / 1024).toFixed(1)} KiB (ConflictKey: ${(hh1And2Migration.conflictKeyBytesBefore / 1024).toFixed(1)} KiB, AccountSnap: ${(hh1And2Migration.accountSnapBytesBefore / 1024).toFixed(1)} KiB)`);
    console.log(`  [HH Metrics] LocalStorage After : ${(hh1And2Migration.totalLsBytesAfter / 1024).toFixed(1)} KiB (ConflictKey: ${hh1And2Migration.conflictKeyBytesAfter} B, AccountSnap: ${(hh1And2Migration.accountSnapBytesAfter / 1024).toFixed(1)} KiB) | Migration Time: ${hh1And2Migration.migrationMs.toFixed(1)} ms`);

    assert(
      hh1And2Migration.conflictKeyBytesBefore > 2500000 &&
      hh1And2Migration.accountSnapBytesBefore > 700000 &&
      hh1And2Migration.diagOk === true &&
      hh1And2Migration.diagTotalRecords === 120 &&
      hh1And2Migration.diagUniqueRecords === 40 &&
      hh1And2Migration.diagDuplicateRecords === 80 &&
      hh1And2Migration.diagZeroPersonalLeak === true,
      'Test HH.1: Privacy-safe inspectConflictRecoveryDiagnostics accurately diagnoses >2.5 MiB conflict bloat (120 total / 40 unique / 80 duplicates) with zero personal title leakage'
    );

    assert(
      hh1And2Migration.crashAbortedCleanly === true &&
      hh1And2Migration.migOk === true &&
      hh1And2Migration.migRecordCount === 40 &&
      hh1And2Migration.pointerValid === true &&
      hh1And2Migration.conflictKeyBytesAfter < 350 &&
      hh1And2Migration.accountSnapBytesAfter < 15000 &&
      hh1And2Migration.totalLsBytesAfter < 50000 &&
      hh1And2Migration.activeRecsCount === 40 &&
      hh1And2Migration.foreignIntact === true,
      'Test HH.2: 7-step verified migrateConflictRecoveryToIDB recovers from interrupted STAGED crash, verifies SHA-256, compacts LocalStorage from ~4+ MiB to <50 KiB, preserves all 40 unique recovery records, and isolates foreign accounts'
    );

    // HH.3, HH.4 & HH.5: Test triggerEditGroup, triggerDeleteGroup Case B (LS QuotaExceededError + IDB tx.oncomplete success),
    // and triggerDeleteGroup Cases C & D (both LS and IDB fail/abort -> fail-closed preservation)
    const hh3To5Ops = await tabHH.evaluate(async (uid1) => {
      const origOpenConfirm = openConfirmModal;
      openConfirmModal = (msg, onConfirm) => {
        if (typeof onConfirm === 'function') return onConfirm();
      };

      // HH.3: Edit Chapter 1 title after migration and measure latency
      const tEdit0 = performance.now();
      triggerEditGroup(9101);
      const editInput = document.getElementById('siModalInput');
      if (editInput) editInput.value = 'Chapter 1: Autonomic Pharmacology (Updated)';
      const editRes = await saveSingleInputModal();
      const editGroupMs = performance.now() - tEdit0;

      // HH.4 (Case B): Simulate QuotaExceededError on pharmaTombstones_<uid1> and pharmaSubjectsV4 in LocalStorage while IndexedDB succeeds
      const origSetItem = Storage.prototype.setItem;
      let simulateLsQuotaOnDelete = true;
      Storage.prototype.setItem = function(k, v) {
        if (simulateLsQuotaOnDelete && (String(k) === 'pharmaTombstones_' + uid1 || String(k) === 'pharmaSubjectsV4')) {
          throw new DOMException('QuotaExceededError: Simulated LocalStorage full during delete', 'QuotaExceededError');
        }
        return origSetItem.call(this, k, v);
      };

      let delCaseBRes = null;
      let deleteCaseBMs = 0;
      try {
        const tDel0 = performance.now();
        delCaseBRes = await triggerDeleteGroup(9102); // Deletes Chapter 2 (id: 9102, lecture: 9202)
        deleteCaseBMs = performance.now() - tDel0;
      } finally {
        simulateLsQuotaOnDelete = false;
        Storage.prototype.setItem = origSetItem;
      }

      const groupsAfterCaseB = subjects[0].groups.map(g => g.id);
      const tombsAfterCaseB = getLocalTombstones(uid1);
      const idbTombAfterCaseB = await readWorkspaceDomainFromIDB('tombstones', uid1);
      const journalAfterCaseB = await readDurableCloudSyncJournal(uid1);

      // HH.5 (Cases C & D): Simulate BOTH LocalStorage QuotaExceededError AND IndexedDB readwrite transaction abort
      const origTx = dbInstance.transaction.bind(dbInstance);
      let simulateBothFail = true;
      Storage.prototype.setItem = function(k, v) {
        if (simulateBothFail && (String(k) === 'pharmaTombstones_' + uid1 || String(k) === 'pharmaSubjectsV4')) {
          throw new DOMException('QuotaExceededError: Simulated total storage failure', 'QuotaExceededError');
        }
        return origSetItem.call(this, k, v);
      };
      dbInstance.transaction = function(storeNames, mode) {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        if (simulateBothFail && mode === 'readwrite' && names.includes('workspace_state')) {
          const tx = origTx(storeNames, mode);
          queueMicrotask(() => {
            try { tx.abort(); } catch (e) {}
          });
          return tx;
        }
        return origTx(storeNames, mode);
      };

      let delCaseDRes = null;
      try {
        delCaseDRes = await triggerDeleteGroup(9103); // Attempts to delete Chapter 3 (id: 9103, lecture: 9203)
      } finally {
        simulateBothFail = false;
        Storage.prototype.setItem = origSetItem;
        dbInstance.transaction = origTx;
        openConfirmModal = origOpenConfirm;
      }

      const groupsAfterCaseD = subjects[0].groups.map(g => g.id);
      const tombsAfterCaseD = getLocalTombstones(uid1);

      // Idempotency check on already-deleted 9102
      const prevOpId9102 = tombsAfterCaseB.groups['9102']?.operationId;
      const idempRes = await recordTombstoneDurable('groups', 9102, uid1);

      return {
        editOk: Boolean(editRes?.ok === true || editRes?.durablePersisted === true) && subjects[0].groups[0].name === 'Chapter 1: Autonomic Pharmacology (Updated)',
        editGroupMs,
        delCaseBOk: Boolean(delCaseBRes && delCaseBRes.durablePersisted === true && delCaseBRes.tombstoneDurablePersisted === true),
        deleteCaseBMs,
        groupsAfterCaseB,
        tomb9102InMem: Boolean(tombsAfterCaseB.groups?.['9102']) && Boolean(tombsAfterCaseB.lectures?.['9202']),
        tomb9102InIDB: Boolean(idbTombAfterCaseB?.found && idbTombAfterCaseB?.record?.payload?.groups?.['9102']),
        journalDirtyAfterCaseB: Boolean(journalAfterCaseB?.hasDirtyWorkspace),
        delCaseDAborted: Boolean(delCaseDRes && delCaseDRes.ok === false && delCaseDRes.durablePersisted === false),
        groupsAfterCaseD,
        noTomb9103OnAbort: !tombsAfterCaseD.groups?.['9103'] && !tombsAfterCaseD.lectures?.['9203'],
        idempotentOpIdMatch: Boolean(idempRes?.ok && idempRes?.tombstone?.operationId === prevOpId9102)
      };
    }, uidHH1);

    console.log(`  [HH Metrics] triggerEditGroup: ${hh3To5Ops.editGroupMs.toFixed(1)} ms | triggerDeleteGroup (Case B IDB Fallback): ${hh3To5Ops.deleteCaseBMs.toFixed(1)} ms`);

    assert(
      hh3To5Ops.editOk === true &&
      hh3To5Ops.editGroupMs < 200,
      'Test HH.3: triggerEditGroup succeeds and updates DOM in under 200ms after conflict recovery migration'
    );

    assert(
      hh3To5Ops.delCaseBOk === true &&
      hh3To5Ops.groupsAfterCaseB.length === 2 &&
      !hh3To5Ops.groupsAfterCaseB.includes(9102) &&
      hh3To5Ops.tomb9102InMem === true &&
      hh3To5Ops.tomb9102InIDB === true &&
      hh3To5Ops.journalDirtyAfterCaseB === true &&
      hh3To5Ops.idempotentOpIdMatch === true,
      'Test HH.4 (Case B): When LocalStorage throws QuotaExceededError on pharmaTombstones_<uid>, triggerDeleteGroup durably persists tombstones in IndexedDB on tx.oncomplete, marks cloud_sync_journal dirty, and is idempotent on retry'
    );

    assert(
      hh3To5Ops.delCaseDAborted === true &&
      hh3To5Ops.groupsAfterCaseD.length === 2 &&
      hh3To5Ops.groupsAfterCaseD.includes(9103) &&
      hh3To5Ops.noTomb9103OnAbort === true,
      'Test HH.5 (Cases C & D): When both LocalStorage and IndexedDB fail or abort (tx.onabort), triggerDeleteGroup aborts fail-closed, preserves Chapter 3 and its lectures, and leaves zero partial tombstones'
    );

    // HH.6 & HH.7: Reload page in real Chromium -> verify deleted Chapter 2 (9102) does NOT resurrect,
    // edited Chapter 1 & surviving Chapter 3 are restored, 40 conflict recovery records are hydrated from IDB,
    // and Cloud Sync with stale remote payload containing Chapter 2 does NOT resurrect Chapter 2
    await tabHH.reload({ waitUntil: 'domcontentloaded' });
    await tabHH.waitForFunction(() => typeof window.migrateAndHydrateWorkspaceFromIDB === 'function');

    const hh6And7ReloadAndSync = await tabHH.evaluate(async (uid1) => {
      await handleAuthSessionChange({ id: uid1, email: 'hh1@exo.edu', name: 'HH1 Student' }, false);
      await migrateAndHydrateWorkspaceFromIDB(uid1);

      const groupsAfterReload = (subjects[0]?.groups || []).map(g => ({ id: g.id, name: g.name }));
      const tombsAfterReload = getLocalTombstones(uid1);
      const conflictRecsAfterReload = getConflictRecoveryRecords(uid1);

      // Now simulate incoming stale Cloud Sync payload that still has deleted Chapter 2 (9102)
      const staleCloudRow = {
        user_id: uid1,
        user_email: 'hh1@exo.edu',
        revision: 2,
        subjects: [
          {
            id: 9001,
            name: 'Clinical Pharmacology HH',
            groups: [
              { id: 9101, name: 'Chapter 1: Autonomic Pharmacology (Updated)', lectures: [{ id: 9201, name: 'Cholinergic Agonists' }] },
              { id: 9102, name: 'Chapter 2: Cardiovascular (Stale Remote)', lectures: [{ id: 9202, name: 'Beta Blockers' }] },
              { id: 9103, name: 'Chapter 3: CNS Pharmacology', lectures: [{ id: 9203, name: 'Anesthetics' }] }
            ]
          }
        ],
        schedule: { version: 3, events: [], backlog: [], weeklyReports: [], _tombstones: {} },
        logs: [],
        annotations: {}
      };
      await applyCloudWorkspacePayload(staleCloudRow, false);
      const groupsAfterCloudSync = (subjects[0]?.groups || []).map(g => g.id);

      return {
        groupsAfterReload,
        tomb9102AfterReload: Boolean(tombsAfterReload.groups?.['9102']),
        conflictRecsCountAfterReload: conflictRecsAfterReload.length,
        groupsAfterCloudSync
      };
    }, uidHH1);

    assert(
      hh6And7ReloadAndSync.groupsAfterReload.length === 2 &&
      hh6And7ReloadAndSync.groupsAfterReload[0].name === 'Chapter 1: Autonomic Pharmacology (Updated)' &&
      !hh6And7ReloadAndSync.groupsAfterReload.some(g => g.id === 9102) &&
      hh6And7ReloadAndSync.tomb9102AfterReload === true &&
      hh6And7ReloadAndSync.conflictRecsCountAfterReload === 40 &&
      hh6And7ReloadAndSync.groupsAfterCloudSync.length === 2 &&
      !hh6And7ReloadAndSync.groupsAfterCloudSync.includes(9102),
      'Test HH.6 & HH.7: After real Chromium reload and stale Cloud Sync, tombstoned Chapter 2 never resurrects, updated Chapter 1 and Chapter 3 persist, and all 40 conflict recovery records hydrate from IndexedDB'
    );

    await tabHH.close();
    await contextHH.close();

    // =========================================================================
    // TEST II: P0.1 Durable Conflict Recovery & Atomic Deletion Rollback Hardening
    // Covers P0-A (Zero Premature Pointer / Serialized Queue / Pointer Validation),
    // P0-B (Non-Destructive Staged Compaction + Reload Healing),
    // P0-C (Verifiable Tombstone Rollback + Mandatory Uncommitted Tombstone Crash Scenario),
    // and P0-D (Full Deep losingValue Preservation + Semantic Digest Disambiguation)
    // =========================================================================
    console.log('\n--- TEST II: P0.1 Durable Conflict Recovery, Staged Compaction & Atomic Deletion Rollback Hardening ---');
    const contextII = await browser.newContext();
    const tabII = await contextII.newPage();
    await tabII.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await tabII.waitForFunction(() =>
      typeof window.recordConflictRecoveryCandidate === 'function' &&
      typeof window.compactAccountAndScheduleConflictRecoveryInLS === 'function' &&
      typeof window.recordTombstonesAtomicBatch === 'function'
    );

    const uidII1 = 'ii100000-1111-4222-8333-444455550001';

    // II.1 (P0-A & P0-D): Deep losingValue preservation, semantic digest collision disambiguation,
    // and durable conflict recovery persistence after IDB migration
    const ii1DeepAndDurable = await tabII.evaluate(async (uid) => {
      await handleAuthSessionChange({ id: uid, email: 'ii1@exo.edu', name: 'II1 Student' }, false);

      // Two conflict candidates with identical root fields & IDs but different nested lectures
      const recA = recordConflictRecoveryCandidate({
        userId: uid,
        entityType: 'subjects',
        entityId: 'sub_ii_deep_1',
        reason: 'concurrent_entity_tie_break',
        losingOperationId: 'op_ii_lose_same',
        winningOperationId: 'op_ii_win_same',
        losingValue: {
          id: 'sub_ii_deep_1',
          name: 'Identical Root Title',
          color: '#38bdf8',
          _canonicalGeomOrdinal: 77,
          _needsCausalStamp: true,
          groups: [{
            id: 'grp_ii_1',
            name: 'Group Alpha',
            lectures: [{ id: 'lec_ii_1', title: 'Lecture Version 1', notes: 'Important notes V1' }]
          }],
          wirdLogs: [{ id: 'w_ii_1', pages: 12 }],
          continuousLogs: [{ id: 'c_ii_1', minutes: 45 }]
        }
      });

      const recB = recordConflictRecoveryCandidate({
        userId: uid,
        entityType: 'subjects',
        entityId: 'sub_ii_deep_1',
        reason: 'concurrent_entity_tie_break',
        losingOperationId: 'op_ii_lose_same',
        winningOperationId: 'op_ii_win_same',
        losingValue: {
          id: 'sub_ii_deep_1',
          name: 'Identical Root Title',
          color: '#38bdf8',
          groups: [{
            id: 'grp_ii_1',
            name: 'Group Alpha',
            lectures: [{ id: 'lec_ii_1', title: 'Lecture Version 2 (Modified)', notes: 'Important notes V2' }]
          }],
          wirdLogs: [{ id: 'w_ii_1', pages: 20 }],
          continuousLogs: [{ id: 'c_ii_1', minutes: 60 }]
        }
      });

      // Flush initial IDB migration queue
      await flushPendingConflictRecoveryWrites(uid);
      const migInitial = await migrateConflictRecoveryToIDB(uid);
      const pointerBeforeThird = JSON.parse(localStorage.getItem('pharmaConflictRecovery_' + uid) || 'null');

      // Now add a 3rd candidate AFTER migration is active
      const recC = recordConflictRecoveryCandidate({
        userId: uid,
        entityType: 'groups',
        entityId: 'grp_ii_new_3',
        reason: 'delete_superseded_concurrent_or_stale_entity',
        losingOperationId: 'op_ii_lose_3',
        winningOperationId: 'op_ii_win_3',
        losingValue: {
          id: 'grp_ii_new_3',
          name: 'Newly Added Group After Migration',
          lectures: [{ id: 'lec_ii_3', title: 'Nested Lecture 3' }]
        }
      });

      const syncDurablePersisted = recC.durablePersisted;
      const pointerImmediatelyAfterCall = JSON.parse(localStorage.getItem('pharmaConflictRecovery_' + uid) || 'null');
      const pointerNotPrematurelyIncremented = pointerImmediatelyAfterCall?.count === 2;

      // Wait for async IDB persistence to complete
      const idbPersistRes = await recC.idbPersistPromise;
      const pointerAfterIdbComplete = JSON.parse(localStorage.getItem('pharmaConflictRecovery_' + uid) || 'null');

      return {
        distinctRecoveryIds: Boolean(recA?.recoveryId && recB?.recoveryId && recA.recoveryId !== recB.recoveryId),
        transientStripped: recA?.losingValue?._canonicalGeomOrdinal === undefined && recA?.losingValue?._needsCausalStamp === undefined,
        nestedPreserved: recA?.losingValue?.groups?.[0]?.lectures?.[0]?.notes === 'Important notes V1' &&
          recB?.losingValue?.groups?.[0]?.lectures?.[0]?.notes === 'Important notes V2' &&
          recA?.losingValue?.wirdLogs?.[0]?.pages === 12 &&
          recB?.losingValue?.continuousLogs?.[0]?.minutes === 60,
        migInitialCount: migInitial?.recordCount,
        pointerBeforeCount: pointerBeforeThird?.count,
        syncDurablePersisted,
        pointerNotPrematurelyIncremented,
        idbPersistOk: Boolean(idbPersistRes?.ok && idbPersistRes?.durablePersisted === true),
        pointerAfterCount: pointerAfterIdbComplete?.count
      };
    }, uidII1);

    // Reload page in real Chromium to verify all 3 records (including recC added after migration) survive reload from IDB
    await tabII.reload({ waitUntil: 'domcontentloaded' });
    await tabII.waitForFunction(() => typeof window.migrateConflictRecoveryToIDB === 'function');

    const ii1PostReload = await tabII.evaluate(async (uid) => {
      await handleAuthSessionChange({ id: uid, email: 'ii1@exo.edu', name: 'II1 Student' }, false);
      const migAfterReload = await migrateConflictRecoveryToIDB(uid);
      const recs = getConflictRecoveryRecords(uid);
      return {
        migAfterReloadCount: migAfterReload?.recordCount,
        recsCount: recs.length,
        hasRecC: recs.some(r => r.entityId === 'grp_ii_new_3' && r.losingValue?.lectures?.[0]?.title === 'Nested Lecture 3'),
        hasBothDisambiguated: recs.filter(r => r.entityId === 'sub_ii_deep_1').length === 2
      };
    }, uidII1);

    assert(
      ii1DeepAndDurable.distinctRecoveryIds === true &&
      ii1DeepAndDurable.transientStripped === true &&
      ii1DeepAndDurable.nestedPreserved === true &&
      ii1DeepAndDurable.migInitialCount === 2 &&
      ii1DeepAndDurable.syncDurablePersisted === false &&
      ii1DeepAndDurable.pointerNotPrematurelyIncremented === true &&
      ii1DeepAndDurable.idbPersistOk === true &&
      ii1DeepAndDurable.pointerAfterCount === 3 &&
      ii1PostReload.recsCount === 3 &&
      ii1PostReload.hasRecC === true &&
      ii1PostReload.hasBothDisambiguated === true,
      'Test II.1 (P0-A & P0-D): Deep losingValue hierarchies are preserved, semantic digest disambiguates identical root fields, and post-migration conflict records report durablePersisted=false until IDB completes and survive browser reload'
    );

    // II.2 (P0-A Pointer Validation, Concurrent Updates & Readback Verification Failure)
    const ii2PointerAndConcurrency = await tabII.evaluate(async (uid) => {
      const storageKey = 'pharmaConflictRecovery_' + uid;
      const validPtr = JSON.parse(localStorage.getItem(storageKey));

      // 1. Pointer count mismatch
      localStorage.setItem(storageKey, JSON.stringify({ ...validPtr, count: 999 }));
      inMemoryConflictRecoveryByUid.delete(uid);
      const resCountMismatch = await migrateConflictRecoveryToIDB(uid);

      // 2. Pointer SHA-256 mismatch
      localStorage.setItem(storageKey, JSON.stringify({ ...validPtr, sha256: '0'.repeat(64) }));
      inMemoryConflictRecoveryByUid.delete(uid);
      const resShaMismatch = await migrateConflictRecoveryToIDB(uid);

      // 3. Readback verification failure hook (force re-migration with tampered pointer so Step 5 readback is reached)
      localStorage.setItem(storageKey, JSON.stringify({ ...validPtr, count: 777 }));
      window.__exoConflictMigrationTestHooks = { failReadback: true };
      const resReadbackFail = await migrateConflictRecoveryToIDB(uid);
      window.__exoConflictMigrationTestHooks = null;
      await migrateConflictRecoveryToIDB(uid);

      // 4. Concurrent updates for the same account
      const p1 = recordConflictRecoveryCandidate({
        userId: uid,
        entityType: 'subjects',
        entityId: 'sub_conc_1',
        reason: 'concurrent_entity_tie_break',
        losingOperationId: 'op_conc_lose_1',
        winningOperationId: 'op_conc_win_1',
        losingValue: { id: 'sub_conc_1', name: 'Concurrent 1' }
      }).idbPersistPromise;

      const p2 = recordConflictRecoveryCandidate({
        userId: uid,
        entityType: 'subjects',
        entityId: 'sub_conc_2',
        reason: 'concurrent_entity_tie_break',
        losingOperationId: 'op_conc_lose_2',
        winningOperationId: 'op_conc_win_2',
        losingValue: { id: 'sub_conc_2', name: 'Concurrent 2' }
      }).idbPersistPromise;

      await Promise.all([p1, p2]);
      const finalRecs = getConflictRecoveryRecords(uid);
      const finalPtr = JSON.parse(localStorage.getItem(storageKey) || 'null');

      return {
        countMismatchRevalidated: resCountMismatch?.ok === true && resCountMismatch?.recordCount === 3 && resCountMismatch?.pointerMismatchRecovered === true,
        shaMismatchRevalidated: resShaMismatch?.ok === true && resShaMismatch?.recordCount === 3 && resShaMismatch?.pointerMismatchRecovered === true,
        readbackFailAborted: resReadbackFail?.ok === false && resReadbackFail?.reason === 'idb_readback_verification_failed',
        concurrentBothSaved: finalRecs.length === 5 &&
          finalRecs.some(r => r.entityId === 'sub_conc_1') &&
          finalRecs.some(r => r.entityId === 'sub_conc_2') &&
          finalPtr?.count === 5
      };
    }, uidII1);

    assert(
      ii2PointerAndConcurrency.countMismatchRevalidated === true &&
      ii2PointerAndConcurrency.shaMismatchRevalidated === true &&
      ii2PointerAndConcurrency.readbackFailAborted === true &&
      ii2PointerAndConcurrency.concurrentBothSaved === true,
      'Test II.2 (P0-A): Fast-hydration detects pointer count/SHA-256 mismatches, aborts on readback verification failure, and serializes concurrent per-UID updates without overwriting'
    );

    // II.3 (P0-B Non-Destructive LocalStorage Compaction + Interrupted STAGING Healing Across Reload)
    const ii3SetupAndFaults = await tabII.evaluate(async (uid) => {
      const accountKey = 'pharmaAccountWorkspace_' + uid;
      const scheduleKey = 'pharmaScheduleV4';

      const fullAccountSnap = {
        user_id: uid,
        user_email: 'ii1@exo.edu',
        revision: 9,
        subjects: [{ id: 9901, name: 'Protected Subject II', groups: [{ id: 9911, name: 'Protected Ch 1', lectures: [] }] }],
        schedule: {
          version: 3,
          events: [{ id: 'ev_ii_1', title: 'Exam Prep' }],
          backlog: [{ id: 'bl_ii_1', title: 'Review Notes' }],
          weeklyReports: [{ id: 'wr_ii_1', completionRate: 98 }],
          plannerPrefs: { startHour: 7 },
          _conflictRecovery: [{ recoveryId: 'bloated_1', losingValue: { pad: 'X'.repeat(5000) } }]
        },
        logs: [{ id: 'lg_ii_1', text: 'Studied 3 hours' }]
      };
      const fullScheduleSnap = {
        version: 3,
        events: [{ id: 'ev_ii_1', title: 'Exam Prep' }],
        backlog: [{ id: 'bl_ii_1', title: 'Review Notes' }],
        weeklyReports: [{ id: 'wr_ii_1', completionRate: 98 }],
        plannerPrefs: { startHour: 7 },
        _conflictRecovery: [{ recoveryId: 'bloated_1', losingValue: { pad: 'X'.repeat(5000) } }]
      };

      const origAccRaw = JSON.stringify(fullAccountSnap);
      const origSchRaw = JSON.stringify(fullScheduleSnap);
      localStorage.setItem(accountKey, origAccRaw);
      localStorage.setItem(scheduleKey, origSchRaw);

      let removeItemCallsOnProtectedKeys = 0;
      const origRemove = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function(k) {
        if (k === accountKey || k === scheduleKey || k === 'pharmaConflictRecovery_' + uid) {
          removeItemCallsOnProtectedKeys++;
        }
        return origRemove.call(this, k);
      };

      try {
        // 1. Staging failure
        window.__exoCompactionTestHooks = { failStagingWrite: true };
        const resStageFail = await compactAccountAndScheduleConflictRecoveryInLS(uid);

        // 2. Replacement write failure
        window.__exoCompactionTestHooks = { failReplacementWrite: true };
        const resWriteFail = await compactAccountAndScheduleConflictRecoveryInLS(uid);
        const intactAfterWriteFail = localStorage.getItem(accountKey) === origAccRaw && localStorage.getItem(scheduleKey) === origSchRaw;

        // 3. Readback corruption -> automatic restore of original value
        window.__exoCompactionTestHooks = { corruptReadback: true };
        const resReadbackFail = await compactAccountAndScheduleConflictRecoveryInLS(uid);
        const intactAfterReadbackFail = localStorage.getItem(accountKey) === origAccRaw && localStorage.getItem(scheduleKey) === origSchRaw;

        // 4. Simulate crash/reload while compaction is in STAGING phase
        window.__exoCompactionTestHooks = { abortDuringCompaction: true };
        const resAbortedMid = await compactAccountAndScheduleConflictRecoveryInLS(uid);
        window.__exoCompactionTestHooks = null;

        return {
          stageFailAborted: resStageFail?.ok === false && resStageFail?.reason === 'compaction_staging_write_failed',
          writeFailAborted: resWriteFail?.ok === false && intactAfterWriteFail === true,
          readbackFailRestored: resReadbackFail?.ok === false && intactAfterReadbackFail === true,
          abortedMidStage: resAbortedMid?.ok === false && resAbortedMid?.reason === 'simulated_abort_during_compaction',
          removeItemCallsOnProtectedKeys
        };
      } finally {
        Storage.prototype.removeItem = origRemove;
      }
    }, uidII1);

    // Reload browser while compaction staging record is in 'STAGING' phase -> verify healing + normal compaction
    await tabII.reload({ waitUntil: 'domcontentloaded' });
    await tabII.waitForFunction(() => typeof window.migrateAndHydrateWorkspaceFromIDB === 'function');

    const ii3PostReloadAndCompact = await tabII.evaluate(async (uid) => {
      await handleAuthSessionChange({ id: uid, email: 'ii1@exo.edu', name: 'II1 Student' }, false);
      await migrateAndHydrateWorkspaceFromIDB(uid);

      const stagingAfterHeal = await readWorkspaceDomainFromIDB('compaction_staging', uid);
      const healedPhase = stagingAfterHeal?.record?.phase;

      // Now run normal non-destructive compaction
      const compRes = await compactAccountAndScheduleConflictRecoveryInLS(uid);
      const compactedAcc = JSON.parse(localStorage.getItem('pharmaAccountWorkspace_' + uid) || 'null');
      const compactedSch = JSON.parse(localStorage.getItem('pharmaScheduleV4') || 'null');

      return {
        healedPhaseOk: healedPhase === 'RECOVERED' || healedPhase === 'COMMITTED',
        compOk: compRes?.ok === true,
        accConflictStripped: Array.isArray(compactedAcc?.schedule?._conflictRecovery) && compactedAcc.schedule._conflictRecovery.length === 0,
        schConflictStripped: Array.isArray(compactedSch?._conflictRecovery) && compactedSch._conflictRecovery.length === 0,
        accFieldsPreserved: compactedAcc?.revision === 9 &&
          compactedAcc?.subjects?.[0]?.name === 'Protected Subject II' &&
          compactedAcc?.schedule?.events?.[0]?.id === 'ev_ii_1' &&
          compactedAcc?.schedule?.backlog?.[0]?.id === 'bl_ii_1' &&
          compactedAcc?.schedule?.weeklyReports?.[0]?.id === 'wr_ii_1' &&
          compactedAcc?.logs?.[0]?.id === 'lg_ii_1',
        schFieldsPreserved: compactedSch?.events?.[0]?.id === 'ev_ii_1' &&
          compactedSch?.backlog?.[0]?.id === 'bl_ii_1' &&
          compactedSch?.weeklyReports?.[0]?.id === 'wr_ii_1' &&
          compactedSch?.plannerPrefs?.startHour === 7
      };
    }, uidII1);

    assert(
      ii3SetupAndFaults.stageFailAborted === true &&
      ii3SetupAndFaults.writeFailAborted === true &&
      ii3SetupAndFaults.readbackFailRestored === true &&
      ii3SetupAndFaults.abortedMidStage === true &&
      ii3SetupAndFaults.removeItemCallsOnProtectedKeys === 0 &&
      ii3PostReloadAndCompact.healedPhaseOk === true &&
      ii3PostReloadAndCompact.compOk === true &&
      ii3PostReloadAndCompact.accConflictStripped === true &&
      ii3PostReloadAndCompact.schConflictStripped === true &&
      ii3PostReloadAndCompact.accFieldsPreserved === true &&
      ii3PostReloadAndCompact.schFieldsPreserved === true,
      'Test II.3 (P0-B): Staged LocalStorage compaction never calls removeItem on protected keys, restores original values on write/readback fault, heals interrupted STAGING across reload, and preserves all workspace/schedule fields'
    );

    // II.4 (P0-C Verifiable Tombstone Rollback & Mandatory Missing Crash Scenario)
    const ii4RollbackAndCrashSetup = await tabII.evaluate(async (uid) => {
      const origOpenConfirm = openConfirmModal;
      openConfirmModal = (msg, onConfirm) => {
        if (typeof onConfirm === 'function') return onConfirm();
      };

      subjects = [{
        id: 9901,
        name: 'Protected Subject II',
        groups: [
          { id: 9911, name: 'Chapter 1: Must Never Disappear', lectures: [{ id: 9921, name: 'Lecture 1' }] },
          { id: 9912, name: 'Chapter 2: Surviving Chapter', lectures: [] }
        ]
      }];
      activeSubjectId = 9901;
      const saveInit = saveSubjects();
      await saveInit.idbPersistPromise;

      const origSetItem = Storage.prototype.setItem;
      const origTx = dbInstance.transaction.bind(dbInstance);

      try {
        // 1. Normal rollback verification: tombstone write succeeds in IDB, saveSubjects fails in both LS and IDB, rollbackDurable succeeds and verifies
        let failSubjectsOnly = true;
        Storage.prototype.setItem = function(k, v) {
          if (failSubjectsOnly && String(k) === 'pharmaSubjectsV4') {
            throw new DOMException('QuotaExceededError', 'QuotaExceededError');
          }
          return origSetItem.call(this, k, v);
        };
        let blockSubjectsIdb = true;
        dbInstance.transaction = function(storeNames, mode) {
          const names = Array.isArray(storeNames) ? storeNames : [storeNames];
          const tx = origTx(storeNames, mode);
          if (blockSubjectsIdb && mode === 'readwrite' && names.includes('workspace_state')) {
            const origStore = tx.objectStore.bind(tx);
            tx.objectStore = function(sName) {
              const st = origStore(sName);
              if (sName === 'workspace_state') {
                const origPut = st.put.bind(st);
                st.put = function(val, key) {
                  if (val && val.domain === 'subjects') {
                    queueMicrotask(() => { try { tx.abort(); } catch (e) {} });
                  }
                  return origPut(val, key);
                };
              }
              return st;
            };
          }
          return tx;
        };

        const delRollbackVerifiedRes = await triggerDeleteGroup(9911);
        failSubjectsOnly = false;
        blockSubjectsIdb = false;

        // 2. Mandatory Missing Scenario:
        // - Tombstone write fails in LS (QuotaExceededError) and succeeds in IDB (with pendingDeleteTx)
        // - saveSubjects() fails in both LS and IDB
        // - rollbackDurable() ALSO fails in IDB (failIdbRestore: true)
        let failLsTombAndSub = true;
        Storage.prototype.setItem = function(k, v) {
          if (failLsTombAndSub && (String(k) === 'pharmaTombstones_' + uid || String(k) === 'pharmaSubjectsV4')) {
            throw new DOMException('QuotaExceededError', 'QuotaExceededError');
          }
          return origSetItem.call(this, k, v);
        };
        blockSubjectsIdb = true;
        window.__exoTombstoneRollbackTestHooks = { failIdbRestore: true };

        const delDoubleFailRes = await triggerDeleteGroup(9911);

        window.__exoTombstoneRollbackTestHooks = null;
        failLsTombAndSub = false;
        blockSubjectsIdb = false;

        // Inspect raw IDB tombstones record before reload: it still has the unrolled-back tombstone + pendingDeleteTx!
        const rawIdbBeforeReload = await readWorkspaceDomainFromIDB('tombstones', uid);

        return {
          normalRollbackOk: delRollbackVerifiedRes?.ok === false &&
            delRollbackVerifiedRes?.rollbackVerified === true &&
            delRollbackVerifiedRes?.rollbackResult?.localStorageRestored === true &&
            delRollbackVerifiedRes?.rollbackResult?.idbRestored === true,
          doubleFailDetected: delDoubleFailRes?.ok === false &&
            delDoubleFailRes?.rollbackVerified === false &&
            delDoubleFailRes?.recoverableFailClosed === true &&
            delDoubleFailRes?.rollbackResult?.idbRestored === false,
          rawIdbHasPendingDeleteTxBeforeReload: rawIdbBeforeReload?.record?.pendingDeleteTx?.phase === 'PENDING_ENTITY_COMMIT' &&
            Boolean(rawIdbBeforeReload?.record?.payload?.groups?.['9911'])
        };
      } finally {
        window.__exoTombstoneRollbackTestHooks = null;
        Storage.prototype.setItem = origSetItem;
        dbInstance.transaction = origTx;
        openConfirmModal = origOpenConfirm;
      }
    }, uidII1);

    // Now perform a REAL browser reload in Chromium followed by stale Cloud Sync
    await tabII.reload({ waitUntil: 'domcontentloaded' });
    await tabII.waitForFunction(() => typeof window.migrateAndHydrateWorkspaceFromIDB === 'function');

    const ii4PostReloadAndSync = await tabII.evaluate(async (uid) => {
      await handleAuthSessionChange({ id: uid, email: 'ii1@exo.edu', name: 'II1 Student' }, false);
      await migrateAndHydrateWorkspaceFromIDB(uid);

      const groupsAfterReload = (subjects[0]?.groups || []).map(g => g.id);
      const tombsAfterReload = getLocalTombstones(uid);
      const rawIdbAfterReload = await readWorkspaceDomainFromIDB('tombstones', uid);

      // Simulate Cloud Sync with remote payload containing Chapter 9911
      const remoteRow = {
        user_id: uid,
        user_email: 'ii1@exo.edu',
        revision: 12,
        subjects: [{
          id: 9901,
          name: 'Protected Subject II',
          groups: [
            { id: 9911, name: 'Chapter 1: Must Never Disappear', lectures: [{ id: 9921, name: 'Lecture 1' }] },
            { id: 9912, name: 'Chapter 2: Surviving Chapter', lectures: [] }
          ]
        }],
        schedule: { version: 3, events: [], backlog: [], weeklyReports: [], _tombstones: {} },
        logs: [],
        annotations: {}
      };
      await applyCloudWorkspacePayload(remoteRow, false);
      const groupsAfterCloudSync = (subjects[0]?.groups || []).map(g => g.id);

      return {
        ch9911PresentAfterReload: groupsAfterReload.includes(9911) && groupsAfterReload.includes(9912),
        uncommittedTombHealedInMem: !tombsAfterReload.groups?.['9911'] && !tombsAfterReload.lectures?.['9921'],
        uncommittedTombHealedInIDB: !rawIdbAfterReload?.record?.payload?.groups?.['9911'] &&
          rawIdbAfterReload?.record?.pendingDeleteTx === null,
        ch9911PresentAfterCloudSync: groupsAfterCloudSync.includes(9911) && groupsAfterCloudSync.includes(9912)
      };
    }, uidII1);

    assert(
      ii4RollbackAndCrashSetup.normalRollbackOk === true &&
      ii4RollbackAndCrashSetup.doubleFailDetected === true &&
      ii4RollbackAndCrashSetup.rawIdbHasPendingDeleteTxBeforeReload === true &&
      ii4PostReloadAndSync.ch9911PresentAfterReload === true &&
      ii4PostReloadAndSync.uncommittedTombHealedInMem === true &&
      ii4PostReloadAndSync.uncommittedTombHealedInIDB === true &&
      ii4PostReloadAndSync.ch9911PresentAfterCloudSync === true,
      'Test II.4 (P0-C Mandatory Missing Scenario): Verified rollbackDurable() on normal failure, and when both saveSubjects() and IDB tombstone rollback fail, reload + Cloud Sync automatically heal the uncommitted pendingDeleteTx tombstone and preserve the visible entity'
    );

    await tabII.close();
    await contextII.close();

    // ========================================================================
    // TEST JJ: Phase 5.2 Google Drive Reliability, OAuth Security, Resumable
    //          Uploads, Stable Folder IDs, Secondary Recordings & Studio Reactivation
    // ========================================================================
    console.log('\n--- TEST JJ: Phase 5.2 Google Drive Reliability, OAuth, Resumable Uploads, Folder IDs, Recordings & Studio Reactivation ---');
    const contextJJ = await browser.newContext();
    const tabJJ = await contextJJ.newPage();
    const uidJJ = 'e52jj000-1111-4222-8333-444455556666';

    const driveMockState = {
      ucCalls: 0,
      postCalls: [],
      patchCalls: [],
      putRanges: [],
      failChunk2Once: true,
      return403Download: false,
      silentShouldFail: true,
      validPdfBytes: Buffer.from(
        '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'
      )
    };

    await tabJJ.route('https://www.googleapis.com/**', async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();
      const headers = req.headers();

      if (url.includes('/drive/v3/about')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: { emailAddress: 'jj.student@gmail.com' }, storageQuota: { limit: '16106127360', usage: '1073741824' } })
        });
      }
      if (method === 'GET' && url.includes('/drive/v3/files?q=')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
      }
      if (method === 'GET' && url.includes('?alt=media')) {
        if (driveMockState.return403Download) {
          return route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message: 'Forbidden', errors: [{ reason: 'insufficientFilePermissions' }] } })
          });
        }
        if (url.includes('1MockJJSecAudioId00000000001')) {
          return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from([10, 20, 30, 40, 50, 60, 70, 80]) });
        }
        return route.fulfill({ status: 200, contentType: 'application/pdf', body: driveMockState.validPdfBytes });
      }
      if (method === 'GET' && /\/drive\/v3\/files\/fld_/.test(url)) {
        const match = url.match(/\/drive\/v3\/files\/(fld_[^?]+)/);
        const fId = match ? match[1] : 'fld_root_jj';
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: fId, name: fId, mimeType: 'application/vnd.google-apps.folder', trashed: false, parents: fId === 'fld_grp_jj' ? ['fld_sub_jj'] : ['fld_root_jj'] })
        });
      }
      if (method === 'POST' && url.includes('/drive/v3/files') && !url.includes('uploadType=resumable')) {
        const bodyJson = JSON.parse(req.postData() || '{}');
        driveMockState.postCalls.push({ kind: 'folder', name: bodyJson.name });
        const fId = bodyJson.name === 'Exo_Workspace' ? 'fld_root_jj' : ((bodyJson.parents || []).includes('fld_sub_jj') ? 'fld_grp_jj' : 'fld_sub_jj');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: fId, name: bodyJson.name }) });
      }
      if (method === 'POST' && url.includes('uploadType=resumable')) {
        driveMockState.postCalls.push({ kind: 'upload_init', url });
        return route.fulfill({
          status: 200,
          headers: {
            Location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=up_jj_session_1',
            'Access-Control-Expose-Headers': 'Location'
          },
          body: ''
        });
      }
      if (method === 'PATCH' && /\/drive\/v3\/files\/fld_/.test(url)) {
        const bodyJson = JSON.parse(req.postData() || '{}');
        driveMockState.patchCalls.push({ url, body: bodyJson });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'fld_sub_jj', name: bodyJson.name }) });
      }
      if (method === 'PUT' && url.includes('upload_id=up_jj_session_1')) {
        const cr = headers['content-range'] || headers['Content-Range'] || '';
        driveMockState.putRanges.push(cr);
        if (cr.startsWith('bytes */')) {
          return route.fulfill({
            status: 308,
            headers: { Range: 'bytes=0-19', 'Access-Control-Expose-Headers': 'Range' },
            body: ''
          });
        }
        const m = cr.match(/bytes (\d+)-(\d+)\/(\d+)/);
        if (m) {
          const start = Number(m[1]);
          const end = Number(m[2]);
          const total = Number(m[3]);
          if (driveMockState.failChunk2Once && start > 0 && end + 1 < total) {
            driveMockState.failChunk2Once = false;
            return route.fulfill({ status: 500, body: 'Simulated Mid-Upload Crash' });
          }
          if (end + 1 < total) {
            return route.fulfill({
              status: 308,
              headers: { Range: `bytes=0-${end}`, 'Access-Control-Expose-Headers': 'Range' },
              body: ''
            });
          }
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: '1MockJJUploadedFileId0000001', name: 'JJ_File' })
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await tabJJ.route('https://drive.google.com/**', async (route) => {
      if (route.request().url().includes('/uc')) driveMockState.ucCalls++;
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Preview</body></html>' });
    });

    await tabJJ.route('https://accounts.google.com/**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* mocked GIS in E2E */' });
    });

    await tabJJ.route('**/*supabase*', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* mocked Supabase CDN in E2E */' });
    });

    await tabJJ.addInitScript((syntheticUid) => {
      window.__exoDriveChunkSizeBytes = 20;
      window.__exoDriveRetryDelayMs = 5;
      window.__jjSilentFail = true;
      window.__jjTokenSeq = 0;

      const jjSession = {
        access_token: 'synthetic-jwt-jj',
        refresh_token: 'synthetic-refresh-jj',
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: syntheticUid,
          email: 'jj.student@exo.edu',
          user_metadata: { full_name: 'JJ Student' }
        }
      };

      window.supabase = {
        createClient: () => ({
          auth: {
            getSession: async () => ({ data: { session: jjSession }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
          },
          channel: () => {
            const ch = { on: () => ch, subscribe: () => ch };
            return ch;
          },
          removeChannel: () => {},
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    user_id: syntheticUid,
                    user_email: 'jj.student@exo.edu',
                    can_upload_media: true,
                    revision: 1,
                    subjects: JSON.parse(localStorage.getItem('pharmaSubjectsV4') || '[]'),
                    schedule: {
                      version: 3,
                      events: [],
                      backlog: [],
                      weeklyReports: [],
                      gdriveSync: { linked: true, userEmail: 'jj.student@gmail.com', folderId: 'fld_root_jj' }
                    },
                    logs: [],
                    academy_progress: [],
                    annotations: {}
                  },
                  error: null
                })
              })
            })
          }),
          rpc: async () => ({ data: { ok: true, status: 'ok', revision: 2 }, error: null })
        })
      };

      window.google = {
        accounts: {
          oauth2: {
            initTokenClient: (cfg) => ({
              requestAccessToken: (reqOpts) => {
                setTimeout(() => {
                  if (reqOpts && reqOpts.prompt === 'none' && window.__jjSilentFail) {
                    cfg.callback({ error: 'interaction_required' });
                  } else {
                    window.__jjTokenSeq++;
                    cfg.callback({
                      access_token: 'ya29.jj_mem_tok_' + window.__jjTokenSeq,
                      expires_in: 3600,
                      scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file'
                    });
                  }
                }, 10);
              }
            }),
            revoke: () => {}
          }
        }
      };
    }, uidJJ);

    await tabJJ.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await tabJJ.waitForFunction(() => typeof initPdfDB === 'function' && typeof ensureGoogleAccessToken === 'function' && window.__exoSupabaseStartupState && window.__exoSupabaseStartupState.settled);

    // JJ.1: Legacy token cleanup on load + 5-state card + in-memory only token
    const jj1Setup = await tabJJ.evaluate(async (uid) => {
      await initPdfDB();
      localStorage.setItem('exo_gdrive_token', 'ya29.stale_legacy_ls_token');
      localStorage.setItem('exo_gdrive_token_exp', String(Date.now() + 999999));
      cleanupLegacyGoogleTokenStorage();

      await handleAuthSessionChange({ id: uid, email: 'jj.student@exo.edu', name: 'JJ Student' }, false);
      currentUserCanUploadMedia = true;
      verifyVipStatusFromServer = async () => true;
      pushWorkspaceToCloud = async () => ({ ok: true });

      localStorage.setItem('exo_gdrive_connected', '1');
      localStorage.setItem('exo_gdrive_user_email', 'jj.student@gmail.com');
      localStorage.setItem('exo_gdrive_bound_user_id', uid);

      const silentTok = await ensureGoogleAccessToken(false);
      const stateReauth = getGoogleDriveAuthState();
      const badgeReauth = document.getElementById('gdriveStatusBadge')?.innerText || '';

      window.__jjSilentFail = false;
      const interactiveTok = await ensureGoogleAccessToken(true);
      const stateConnected = getGoogleDriveAuthState();

      return {
        legacyRemoved: localStorage.getItem('exo_gdrive_token') === null && localStorage.getItem('exo_gdrive_token_exp') === null,
        silentTokNull: silentTok === null,
        stateReauth,
        badgeHasText: badgeReauth.length > 0,
        interactiveTokOk: Boolean(interactiveTok),
        stateConnected,
        stillZeroLsToken: localStorage.getItem('exo_gdrive_token') === null
      };
    }, uidJJ);

    // JJ.2: Interrupted chunked upload -> sessionStorage descriptor (no token) -> reload -> resume without duplicate POST
    const jj2Interrupt = await tabJJ.evaluate(async (uid) => {
      subjects = [{
        id: 'subJJ',
        name: 'JJ Pharmacology',
        groups: [{
          id: 'grpJJ',
          name: 'JJ Chapter 1',
          lectures: [{ id: 'lecJJ1', title: 'Chunked Lec', recordings: [] }]
        }]
      }];
      activeSubjectId = 'subJJ';
      localStorage.setItem('pharmaSubjectsV4', JSON.stringify(subjects));
      const pdfBytes = new Uint8Array(55).fill(66);
      pdfBytes.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a], 0);
      const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
      await saveMediaToDB('pdfs', 'lecJJ1', pdfBlob);
      const upFailRes = await uploadMediaToCloudAccount('pdfs', subjects[0].groups[0].lectures[0], pdfBlob, false, { deferWorkspaceSync: true });
      const desc = getGoogleDriveResumableDescriptor(uid, 'pdfs', 'lecJJ1');
      const rawDesc = sessionStorage.getItem(getGoogleDriveResumableSessionKey(uid, 'pdfs', 'lecJJ1')) || '';
      const idbBlobStillThere = await getMediaFromDB('pdfs', 'lecJJ1');
      return {
        upFailOk: upFailRes.ok === false,
        hasDesc: Boolean(desc && desc.uploadUrl && desc.uploadUrl.includes('up_jj_session_1')),
        noTokenInSession: !rawDesc.includes('ya29.'),
        idbBlobKept: Boolean(idbBlobStillThere && idbBlobStillThere.size === 55),
        subFolderId: subjects[0].driveFolderId || '',
        grpFolderId: subjects[0].groups[0].driveFolderId || ''
      };
    }, uidJJ);

    // Reload page while keeping sessionStorage intact and verify resume + stable folder rename
    await tabJJ.reload({ waitUntil: 'domcontentloaded' });
    await tabJJ.waitForFunction(() => typeof initPdfDB === 'function' && typeof resumePendingDriveUpload === 'function' && window.__exoSupabaseStartupState && window.__exoSupabaseStartupState.settled);

    const jj2And3PostReload = await tabJJ.evaluate(async (uid) => {
      await initPdfDB();
      await handleAuthSessionChange({ id: uid, email: 'jj.student@exo.edu', name: 'JJ Student' }, false);
      currentUserCanUploadMedia = true;
      verifyVipStatusFromServer = async () => true;
      pushWorkspaceToCloud = async () => ({ ok: true });
      subjects = JSON.parse(localStorage.getItem('pharmaSubjectsV4') || '[]');
      activeSubjectId = 'subJJ';
      localStorage.setItem('exo_gdrive_connected', '1');
      localStorage.setItem('exo_gdrive_user_email', 'jj.student@gmail.com');
      localStorage.setItem('exo_gdrive_bound_user_id', uid);
      localStorage.setItem('exo_gdrive_folder_id', 'fld_root_jj');

      const tokenAfterReload = isGoogleDriveTokenActive();
      window.__jjSilentFail = false;
      await ensureGoogleAccessToken(true);

      updateGoogleDriveUI();
      const resumableHtml = document.getElementById('gdriveResumableNotice')?.innerHTML || '';
      const resumeRes = await resumePendingDriveUpload('pdfs', 'lecJJ1');
      const descAfterResume = getGoogleDriveResumableDescriptor(uid, 'pdfs', 'lecJJ1');

      // JJ.3: Rename subject using persisted driveFolderId
      const sub = subjects[0];
      sub.name = 'JJ Pharmacology Renamed';
      const renameRes = await syncRenamedSubjectDriveFolder(sub, 'JJ Pharmacology');

      return {
        tokenClearedOnReload: tokenAfterReload === false,
        resumableBannerListed: resumableHtml.includes('Chunked Lec') || resumableHtml.includes('lecJJ1'),
        resumeOk: Boolean(resumeRes && resumeRes.ok && resumeRes.driveFileId === '1MockJJUploadedFileId0000001'),
        descCleared: descAfterResume === null,
        renameOk: Boolean(renameRes && renameRes.ok),
        subFolderIdPreserved: sub.driveFolderId === 'fld_sub_jj'
      };
    }, uidJJ);

    const jjUploadInitCount = driveMockState.postCalls.filter(c => c.kind === 'upload_init').length;
    const jjUsedProbe = driveMockState.putRanges.includes('bytes */55');
    const jjRenamedFolder = driveMockState.patchCalls.some(c => c.body && c.body.name === 'JJ Pharmacology Renamed');

    // JJ.4: Secondary audio recording cloud download on switch in Chromium
    const jj4SecRec = await tabJJ.evaluate(async () => {
      const lec = {
        id: 'lecJJ2',
        title: 'Multi Rec Lec',
        recordings: [
          { id: 'lecJJ2', dbKey: 'lecJJ2', name: 'Main' },
          { id: 'rec_lecJJ2_sec1', dbKey: 'rec_lecJJ2_sec1', name: 'Section Audio', cloudAudioUploaded: true, cloudAudioDriveId: '1MockJJSecAudioId00000000001' }
        ]
      };
      subjects[0].groups[0].lectures.push(lec);
      currentViewingLec = { lec, groupId: 'grpJJ', subjectId: 'subJJ' };
      const swRes = await switchLectureRecording('rec_lecJJ2_sec1');
      const dlBlob = await getMediaFromDB('audios', 'rec_lecJJ2_sec1');
      const audioSrc = document.getElementById('lectureAudioElement')?.src || '';
      return {
        swOk: Boolean(swRes && swRes.ok),
        blobSavedSize: dlBlob ? dlBlob.size : 0,
        audioSrcSet: audioSrc.startsWith('blob:')
      };
    });

    // JJ.5: PDF Studio /preview + click #pdfDriveReactivateBtn -> PDF.js canvas + IDB + preserved annotations/page/zoom + non-looping 403
    await tabJJ.evaluate(async () => {
      // Simulate lost Drive token + silent refresh failure + no local PDF blob so openLectureDocument enters /preview fallback with reactivate banner
      window.__jjSilentFail = true;
      setGoogleDriveAuthState('reauth_required', 'expired');
      window.pdfjsLib = {
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 3,
            getPage: async () => ({
              getViewport: ({ scale }) => ({ width: 400 * scale, height: 600 * scale }),
              render: () => ({ promise: Promise.resolve() })
            })
          })
        })
      };
      const lecPdf = {
        id: 'lecJJ3',
        title: 'Studio Reactivate Lec',
        cloudPdfUploaded: true,
        cloudPdfDriveId: '1MockJJStudioPdfId0000000003',
        lastPageNum: 2,
        recordings: []
      };
      subjects[0].groups[0].lectures.push(lecPdf);
      await openLectureDocument('grpJJ', 'lecJJ3');
      // Set explicit active page/zoom & annotations in memory to verify preservation across reactivation
      currentActivePageNum = 2;
      currentPdfZoom = 1.4;
      pageAnnotations = { 2: [{ id: 'jj_anno_2', tool: 'pen', color: '#e11d48', points: [{ x: 0.2, y: 0.3 }] }] };
    });

    const jjBannerVisibleBeforeClick = await tabJJ.locator('#pdfDriveReactivateBanner').isVisible();
    await tabJJ.click('#pdfDriveReactivateBtn');
    await tabJJ.waitForFunction(() => {
      const b = document.getElementById('pdfDriveReactivateBanner');
      return b && b.style.display === 'none' && typeof currentPdfDoc !== 'undefined' && currentPdfDoc !== null;
    });

    const jj5AfterClick = await tabJJ.evaluate(async () => {
      const idbPdf = await getMediaFromDB('pdfs', 'lecJJ3');
      return {
        bannerHidden: document.getElementById('pdfDriveReactivateBanner')?.style.display === 'none',
        iframeHidden: document.getElementById('pdfViewerIframe')?.style.display === 'none',
        scrollShown: document.getElementById('pdfPagesScrollContainer')?.style.display === 'flex',
        preservedPage: currentActivePageNum === 2,
        preservedZoom: Math.abs(currentPdfZoom - 1.4) < 0.01,
        preservedAnnos: Boolean(pageAnnotations[2] && pageAnnotations[2][0].id === 'jj_anno_2'),
        idbSavedOk: Boolean(idbPdf && idbPdf.size > 20)
      };
    });

    // JJ.5b: Verify 403 does not fall back to /uc and keeps banner in non-looping permission_denied state
    driveMockState.return403Download = true;
    const jj5ErrorState = await tabJJ.evaluate(async () => {
      await deleteMediaFromDB('pdfs', 'lecJJ3');
      sessionMediaBlobRamCache.pdfs.clear();
      const res = await reactivateDriveFromPdfStudio();
      const banner = document.getElementById('pdfDriveReactivateBanner');
      const msg = document.getElementById('pdfDriveReactivateMsg')?.innerText || '';
      const btn = document.getElementById('pdfDriveReactivateBtn');
      return {
        okFalse: res.ok === false && res.status === 403,
        bannerShown: banner && banner.style.display === 'flex',
        btnReenabled: btn && btn.disabled === false,
        has403Msg: msg.includes('403')
      };
    });

    assert(
      jj1Setup.legacyRemoved && jj1Setup.silentTokNull && jj1Setup.stateReauth === 'reauth_required' &&
      jj1Setup.badgeHasText && jj1Setup.interactiveTokOk && jj1Setup.stateConnected === 'connected' && jj1Setup.stillZeroLsToken,
      'Test JJ.1: Legacy token keys wiped on startup, token kept strictly in memory, silent refresh avoids popup, and 5-state Drive UI updates cleanly'
    );
    assert(
      jj2Interrupt.upFailOk && jj2Interrupt.hasDesc && jj2Interrupt.noTokenInSession && jj2Interrupt.idbBlobKept &&
      jj2And3PostReload.tokenClearedOnReload && jj2And3PostReload.resumableBannerListed &&
      jj2And3PostReload.resumeOk && jj2And3PostReload.descCleared &&
      jjUploadInitCount === 1 && jjUsedProbe,
      'Test JJ.2: Interrupted chunked upload stores token-free sessionStorage descriptor, survives reload, resumes via bytes */total without duplicate POST, and clears on completion'
    );
    assert(
      jj2Interrupt.subFolderId === 'fld_sub_jj' && jj2Interrupt.grpFolderId === 'fld_grp_jj' &&
      jj2And3PostReload.renameOk && jj2And3PostReload.subFolderIdPreserved && jjRenamedFolder,
      'Test JJ.3: Subject & Group persist stable driveFolderId and rename existing verified Drive folder via PATCH'
    );
    assert(
      jj4SecRec.swOk && jj4SecRec.blobSavedSize === 8 && jj4SecRec.audioSrcSet,
      'Test JJ.4: Secondary audio recording downloads from Drive on switch, persists in IDB, and wires <audio> src cleanly'
    );
    assert(
      jjBannerVisibleBeforeClick &&
      jj5AfterClick.bannerHidden && jj5AfterClick.iframeHidden && jj5AfterClick.scrollShown &&
      jj5AfterClick.preservedPage && jj5AfterClick.preservedZoom && jj5AfterClick.preservedAnnos && jj5AfterClick.idbSavedOk &&
      jj5ErrorState.okFalse && jj5ErrorState.bannerShown && jj5ErrorState.btnReenabled && jj5ErrorState.has403Msg &&
      driveMockState.ucCalls === 0,
      'Test JJ.5: Clicking #pdfDriveReactivateBtn in /preview switches to PDF.js + IDB preserving page/zoom/annotations, and 403 stays fail-closed with zero /uc fallback'
    );

    await tabJJ.close();
    await contextJJ.close();

    // ========================================================================
    // TEST KK: WP 6.1 Design Foundations, Hybrid Shell, Bilingual Engine & Today Dashboard
    // ========================================================================
    console.log('\n--- TEST KK: WP 6.1 Foundations, Shell, Bilingual Engine & Today Dashboard ---');
    const contextKK = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageKK = await contextKK.newPage();
    const kkErrors = [];
    const kkFailedUrls = [];
    pageKK.on('pageerror', err => kkErrors.push('pageerror: ' + err.message));
    pageKK.on('console', msg => {
      if (msg.type() === 'error') kkErrors.push('console.error: ' + msg.text());
    });
    pageKK.on('requestfailed', req => {
      kkFailedUrls.push(req.url() + ' -> ' + (req.failure()?.errorText || 'failed'));
    });

    await pageKK.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await pageKK.waitForFunction(() => typeof renderDashboard === 'function' && typeof window.applyExoLanguage === 'function');

    // KK.1: First-run English default, simplified Today landing active, clock populated immediately, tokens accurate, native Canvas prototype, zero clutter
    const kk1State = await pageKK.evaluate(() => {
      const html = document.documentElement;
      const bodyStyle = getComputedStyle(document.body);
      const primaryVal = getComputedStyle(html).getPropertyValue('--primary').trim().toLowerCase();
      const bgVal = getComputedStyle(html).getPropertyValue('--bg-color').trim().toLowerCase();
      const dashActive = document.getElementById('dashboard')?.classList.contains('active');
      const subjActive = document.getElementById('subjects')?.classList.contains('active');
      const clockTxt = document.getElementById('sidebarClockTime')?.innerText.trim();
      const dateTxt = document.getElementById('sidebarClockDate')?.innerText.trim();
      const nativeCanvas = CanvasRenderingContext2D.prototype.fillText.toString().includes('[native code]');
      const overflowX = document.documentElement.scrollWidth > window.innerWidth;
      const sidebarRect = document.getElementById('exoAppSidebar')?.getBoundingClientRect();
      const emptyBtns = document.querySelectorAll('#dashboardContent .exo-empty-actions button').length;
      const hasScheduleEmptyBtn = Boolean(document.getElementById('dashEmptyScheduleBtn'));
      const noClutterCards =
        !document.getElementById('exoDailyProgressHeading') &&
        !document.getElementById('exoWeeklyOverviewHeading') &&
        !document.getElementById('exoJournalNotesHeading') &&
        !document.getElementById('exoQuickAccessHeading') &&
        !document.getElementById('exoContinueStudyingSection');
      return {
        lang: html.lang,
        dir: html.dir,
        primaryVal,
        bgVal,
        dashActive,
        subjActive,
        clockTxt,
        dateTxt,
        nativeCanvas,
        overflowX,
        sidebarLeft: sidebarRect ? Math.round(sidebarRect.left) : -1,
        emptyBtns,
        hasScheduleEmptyBtn,
        noClutterCards,
        bodyFont: bodyStyle.fontFamily
      };
    });

    assert(
      kk1State.lang === 'en' &&
      kk1State.dir === 'ltr' &&
      kk1State.primaryVal === '#899982' &&
      kk1State.bgVal === '#191b1d' &&
      kk1State.dashActive === true &&
      kk1State.subjActive === false &&
      kk1State.clockTxt && kk1State.clockTxt !== '--:--' &&
      kk1State.dateTxt && kk1State.dateTxt !== '--' &&
      kk1State.nativeCanvas === true &&
      kk1State.overflowX === false &&
      kk1State.sidebarLeft === 0 &&
      kk1State.emptyBtns === 1 &&
      kk1State.hasScheduleEmptyBtn === true &&
      kk1State.noClutterCards === true,
      'Test KK.1: First-run defaults to EN LTR on simplified Today Dashboard with Ink/Sage tokens, single empty-state CTA, zero clutter cards, live clock, and native Canvas prototype',
      JSON.stringify(kk1State)
    );

    // KK.2: Populate real subject/lecture/session/log -> verify Today's plan heading count + progress track, single genuine Continue Studying item, p. X/Y badge, and session completion persistence
    const kk2State = await pageKK.evaluate(() => {
      const todayIdx = new Date().getDay();
      subjects = [
        {
          id: 9901,
          name: 'فارماكولوجي — Pharmacology 101',
          groups: [
            {
              id: 9911,
              name: 'Unit 1',
              lectures: [
                { id: 9921, title: 'Cholinergic Drugs', path: 'Cholinergic_1.pdf', completed: false, lastPageNum: 2, totalPages: 10, lastStudiedAt: Date.now() - 120000 },
                { id: 9922, title: 'Adrenergic Drugs', path: 'Adrenergic_2.pdf', completed: true, lastStudiedAt: Date.now() - 86400000 * 3, reviewCount: 1 },
                { id: 9923, title: 'Unstarted Lecture', path: '', completed: false }
              ]
            }
          ]
        }
      ];
      scheduleEvents = [
        { id: 9931, title: 'Review Cholinergic', subjectId: 9901, day: todayIdx, startHour: 10, duration: 1.5, type: 'important', completed: false }
      ];
      logs = [
        { id: 9941, date: new Date().toLocaleDateString('ar-EG'), text: 'Finished Lecture_1.pdf summary & الخلوي notes', mood: 'fire', subjectId: 9901 }
      ];
      saveSubjects();
      saveScheduleData();
      saveLogs();
      renderDashboard();
      updateSidebarUI();

      const ratioBefore = document.getElementById('dashTodayRatioPill')?.innerText.trim() || '';
      const hasMiniProgress = Boolean(document.querySelector('#exoTodayPlanSection .exo-today-mini-track'));
      const badgeBefore = document.getElementById('sidebarTodayCountBadge')?.innerText.trim() || '';
      const continueItems = document.querySelectorAll('#exoContinueStudyingSection .exo-dash-list-item');
      const dashHtml = document.getElementById('dashboardContent')?.innerHTML || '';
      const noClutterCards =
        !document.getElementById('exoDailyProgressHeading') &&
        !document.getElementById('exoWeeklyOverviewHeading') &&
        !document.getElementById('exoJournalNotesHeading') &&
        !document.getElementById('exoQuickAccessHeading');
      return {
        ratioBefore,
        hasMiniProgress,
        badgeBefore,
        continueCount: continueItems.length,
        continueTitle: continueItems[0]?.querySelector('.exo-dash-item-title')?.innerText.trim() || '',
        hasPageBadgeEn: dashHtml.includes('p. 2/10 (20%)'),
        noAmBug: !dashHtml.includes('AM 2/10'),
        hasRealSubName: dashHtml.includes('فارماكولوجي — Pharmacology 101'),
        noClutterCards
      };
    });

    await pageKK.click('#dashboardContent .exo-paper-check');
    const kk2AfterToggle = await pageKK.evaluate(() => ({
      completed: Boolean(scheduleEvents[0]?.completed),
      ratioAfter: document.getElementById('dashTodayRatioPill')?.innerText.trim() || '',
      badgeAfter: document.getElementById('sidebarTodayCountBadge')?.innerText.trim() || '',
      persistedCompleted: JSON.parse(localStorage.getItem('pharmaScheduleV4') || '{}')?.events?.[0]?.completed === true
    }));

    assert(
      kk2State.ratioBefore === '0 / 1 done' &&
      kk2State.hasMiniProgress === true &&
      kk2State.badgeBefore === '1' &&
      kk2State.continueCount === 1 &&
      kk2State.continueTitle === 'Cholinergic Drugs' &&
      kk2State.hasPageBadgeEn === true &&
      kk2State.noAmBug === true &&
      kk2State.hasRealSubName === true &&
      kk2State.noClutterCards === true &&
      kk2AfterToggle.completed === true &&
      kk2AfterToggle.ratioAfter === '1 / 1 done' &&
      kk2AfterToggle.badgeAfter === '0' &&
      kk2AfterToggle.persistedCompleted === true,
      'Test KK.2: Simplified Today Dashboard renders real session heading progress, single genuine resume item, p. 2/10 badge, zero clutter cards, and persists session completion',
      JSON.stringify({ kk2State, kk2AfterToggle })
    );

    // KK.3: Live language switch preserves active screen, visible card title & RTL arrows, unsaved search input, URLs/emails/filenames/unknown Arabic words, and persists choice across reload
    await pageKK.click('.sidebar-nav-item[data-tab="subjects"]');
    await pageKK.waitForSelector('#subjects.view-section.active', { state: 'visible' });

    // Step 3a: Before filtering, verify visible subject card title & RTL move arrows across EN -> AR -> EN
    await pageKK.click('#sidebarLangToggleBtn'); // Switch EN -> AR
    const kk3VisibleAr = await pageKK.evaluate(() => {
      const subTitle = document.querySelector('.subject-card[data-subject-id="9901"] h3')?.innerText || '';
      const sidebarRect = document.getElementById('exoAppSidebar')?.getBoundingClientRect();
      return {
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        saved: localStorage.getItem('exoAppLang'),
        subjectsStillActive: document.getElementById('subjects')?.classList.contains('active'),
        subTitle,
        sidebarRight: sidebarRect ? Math.round(sidebarRect.right) : -1,
        vw: window.innerWidth,
        clockHasText: Boolean(document.getElementById('sidebarClockTime')?.innerText.trim()),
        reorderHasFlip: document.querySelectorAll('.subject-card[data-subject-id="9901"] .move-btn i.exo-rtl-flip').length === 2
      };
    });

    await pageKK.click('#sidebarLangToggleBtn'); // Switch AR -> EN
    const kk3VisibleEn = await pageKK.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      saved: localStorage.getItem('exoAppLang'),
      subjectsStillActive: document.getElementById('subjects')?.classList.contains('active'),
      subTitle: document.querySelector('.subject-card[data-subject-id="9901"] h3')?.innerText || '',
      reorderHasFlip: document.querySelectorAll('.subject-card[data-subject-id="9901"] .move-btn i.exo-rtl-flip').length === 2
    }));

    // Step 3b: Type non-matching Arabic+URL query into #searchSubjectInput, verify unsaved input & underlying model preserved across EN -> AR -> EN, then clear search and verify card reappears intact
    await pageKK.fill('#searchSubjectInput', 'شابتر 2 — https://example.com/a.pdf');
    await pageKK.click('#sidebarLangToggleBtn'); // EN -> AR while search input is non-empty
    const kk3SearchAr = await pageKK.evaluate(() => ({
      lang: document.documentElement.lang,
      subjectsStillActive: document.getElementById('subjects')?.classList.contains('active'),
      searchVal: document.getElementById('searchSubjectInput')?.value || '',
      modelName: subjects.find(s => s.id === 9901)?.name || ''
    }));

    await pageKK.click('#sidebarLangToggleBtn'); // AR -> EN while search input is non-empty
    const kk3SearchEn = await pageKK.evaluate(() => ({
      lang: document.documentElement.lang,
      subjectsStillActive: document.getElementById('subjects')?.classList.contains('active'),
      searchVal: document.getElementById('searchSubjectInput')?.value || '',
      modelName: subjects.find(s => s.id === 9901)?.name || '',
      trMixed: exoTranslateText('راجع ملف Lecture_1.pdf على https://example.com/doc.pdf مع التنظيم الخلوي و student@exo.edu')
    }));

    await pageKK.fill('#searchSubjectInput', '');
    const kk3Cleared = await pageKK.evaluate(() => ({
      subTitle: document.querySelector('.subject-card[data-subject-id="9901"] h3')?.innerText || '',
      reorderHasFlip: document.querySelectorAll('.subject-card[data-subject-id="9901"] .move-btn i.exo-rtl-flip').length === 2
    }));

    // Step 3c: Reload with 'ar' persisted to verify saved locale is NOT overwritten by EN default
    await pageKK.evaluate(() => applyExoLanguage('ar', true));
    await pageKK.reload({ waitUntil: 'domcontentloaded' });
    await pageKK.waitForFunction(() => typeof applyExoLanguage === 'function');
    const kk3ReloadAr = await pageKK.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      saved: localStorage.getItem('exoAppLang'),
      dashActive: document.getElementById('dashboard')?.classList.contains('active')
    }));

    assert(
      kk3VisibleAr.lang === 'ar' && kk3VisibleAr.dir === 'rtl' && kk3VisibleAr.saved === 'ar' &&
      kk3VisibleAr.subjectsStillActive === true &&
      kk3VisibleAr.subTitle === 'فارماكولوجي — Pharmacology 101' &&
      kk3VisibleAr.sidebarRight === kk3VisibleAr.vw &&
      kk3VisibleAr.clockHasText === true &&
      kk3VisibleAr.reorderHasFlip === true &&
      kk3VisibleEn.lang === 'en' && kk3VisibleEn.dir === 'ltr' && kk3VisibleEn.saved === 'en' &&
      kk3VisibleEn.subjectsStillActive === true &&
      kk3VisibleEn.subTitle === 'فارماكولوجي — Pharmacology 101' &&
      kk3VisibleEn.reorderHasFlip === true &&
      kk3SearchAr.lang === 'ar' && kk3SearchAr.subjectsStillActive === true &&
      kk3SearchAr.searchVal === 'شابتر 2 — https://example.com/a.pdf' &&
      kk3SearchAr.modelName === 'فارماكولوجي — Pharmacology 101' &&
      kk3SearchEn.lang === 'en' && kk3SearchEn.subjectsStillActive === true &&
      kk3SearchEn.searchVal === 'شابتر 2 — https://example.com/a.pdf' &&
      kk3SearchEn.modelName === 'فارماكولوجي — Pharmacology 101' &&
      kk3SearchEn.trMixed.includes('Lecture_1.pdf') &&
      kk3SearchEn.trMixed.includes('https://example.com/doc.pdf') &&
      kk3SearchEn.trMixed.includes('student@exo.edu') &&
      kk3SearchEn.trMixed.includes('الخلوي') &&
      kk3Cleared.subTitle === 'فارماكولوجي — Pharmacology 101' &&
      kk3Cleared.reorderHasFlip === true &&
      kk3ReloadAr.lang === 'ar' && kk3ReloadAr.dir === 'rtl' && kk3ReloadAr.saved === 'ar' && kk3ReloadAr.dashActive === true,
      'Test KK.3: Live language toggle preserves visible card & RTL arrows, unsaved search input, user text, URLs/emails/filenames/unknown Arabic words, RTL sidebar alignment, and saved locale across reload',
      JSON.stringify({ kk3VisibleAr, kk3VisibleEn, kk3SearchAr, kk3SearchEn, kk3Cleared, kk3ReloadAr })
    );

    // KK.4: Responsive Tablet (834x1112) & Mobile (390x844) + touch targets >= 44px + reduced motion + PDF Studio regression + zero console/request errors
    await pageKK.evaluate(() => applyExoLanguage('en', true));
    await pageKK.setViewportSize({ width: 834, height: 1112 });
    const kk4Tablet = await pageKK.evaluate(() => {
      const navDisplay = getComputedStyle(document.querySelector('.navbar')).display;
      const navItemsDisplay = getComputedStyle(document.querySelector('.navbar .nav-items')).display;
      const mobileDisplay = getComputedStyle(document.getElementById('mobileBottomNav')).display;
      const navBtns = Array.from(document.querySelectorAll('.navbar .nav-items button'));
      const minH = Math.min(...navBtns.map(b => b.getBoundingClientRect().height));
      return {
        navDisplay,
        navItemsDisplay,
        mobileDisplay,
        minH,
        overflowX: document.documentElement.scrollWidth > window.innerWidth
      };
    });

    await pageKK.setViewportSize({ width: 390, height: 844 });
    await pageKK.emulateMedia({ reducedMotion: 'reduce' });
    const kk4Mobile = await pageKK.evaluate(() => {
      const sideDisplay = getComputedStyle(document.getElementById('exoAppSidebar')).display;
      const mobNav = document.getElementById('mobileBottomNav');
      const mobDisplay = getComputedStyle(mobNav).display;
      const mobBtns = Array.from(mobNav.querySelectorAll('.mobile-nav-item'));
      const minMobH = Math.min(...mobBtns.map(b => b.getBoundingClientRect().height));
      const dashCheckRect = document.querySelector('#dashboardContent .exo-paper-check')?.getBoundingClientRect();
      const topActionBtns = Array.from(document.querySelectorAll('.navbar-actions-group button, .navbar-actions-group .icon-btn'));
      const minTopActionH = topActionBtns.length ? Math.min(...topActionBtns.map(b => b.getBoundingClientRect().height)) : 44;
      return {
        sideDisplay,
        mobDisplay,
        tabCount: mobBtns.length,
        minMobH,
        dashCheckH: dashCheckRect ? dashCheckRect.height : 0,
        minTopActionH,
        overflowX: document.documentElement.scrollWidth > window.innerWidth
      };
    });

    // Verify Resume from Continue Studying opens Subjects & PDF Studio cleanly and closes cleanly
    await pageKK.click('#exoContinueStudyingSection .exo-dash-list-item');
    await pageKK.waitForSelector('#pdfViewerModalOverlay.active', { state: 'visible' });
    const kk4StudioOpened = await pageKK.evaluate(() => ({
      active: document.getElementById('pdfViewerModalOverlay')?.classList.contains('active'),
      title: document.getElementById('pdfViewerTitle')?.innerText || ''
    }));
    await pageKK.click('#pdfViewerModalOverlay button[onclick*="closePdfViewer"]');
    const kk4StudioClosed = await pageKK.evaluate(() => !document.getElementById('pdfViewerModalOverlay')?.classList.contains('active'));

    assert(
      kk4Tablet.navDisplay !== 'none' && kk4Tablet.navItemsDisplay !== 'none' && kk4Tablet.mobileDisplay === 'none' &&
      kk4Tablet.minH >= 44 && kk4Tablet.overflowX === false &&
      kk4Mobile.sideDisplay === 'none' && kk4Mobile.mobDisplay === 'flex' && kk4Mobile.tabCount === 4 &&
      kk4Mobile.minMobH >= 44 && kk4Mobile.dashCheckH >= 44 && kk4Mobile.minTopActionH >= 44 && kk4Mobile.overflowX === false &&
      kk4StudioOpened.active === true && kk4StudioClosed === true &&
      kkErrors.length === 0 && kkFailedUrls.length === 0,
      'Test KK.4: Tablet (834x1112) & Mobile (390x844) hybrid navigation, >=44px touch targets, reduced motion, zero horizontal overflow, PDF Studio resume/close regression, and zero console/network errors',
      JSON.stringify({ kk4Tablet, kk4Mobile, kk4StudioOpened, kk4StudioClosed, kkErrors, kkFailedUrls })
    );

    await pageKK.close();
    await contextKK.close();

    // =========================================================================
    // TEST LL: WP 6.2 DIGITAL BOOKSHELF, SUBJECT/CHAPTER CRUD, TABLE OF CONTENTS,
    // BILINGUAL LIVE SWITCH & RESPONSIVE / PDF STUDIO REGRESSION
    // =========================================================================
    console.log('\n--- TEST LL: WP 6.2 Digital Bookshelf, Library & Table of Contents ---');
    const contextLL = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageLL = await contextLL.newPage();
    const llErrors = [];
    const llFailedUrls = [];
    pageLL.on('pageerror', err => llErrors.push('pageerror: ' + err.message));
    pageLL.on('console', msg => {
      if (msg.type() === 'error') llErrors.push('console.error: ' + msg.text());
    });
    pageLL.on('requestfailed', req => {
      llFailedUrls.push(req.url() + ' -> ' + (req.failure()?.errorText || 'failed'));
    });

    await pageLL.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await pageLL.waitForFunction(() => typeof renderSubjectsList === 'function' && typeof renderGroups === 'function' && typeof window.applyExoLanguage === 'function');

    // Seed clean synthetic study library (courses + continuous track + exam radar + planned hours)
    await pageLL.evaluate(() => {
      const futureDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      subjects = [
        {
          id: 8801,
          name: 'Pharmacology I — علم الأدوية',
          color: '#899982',
          icon: 'fa-capsules',
          isDivided: true,
          examTitle: 'Midterm Quiz',
          examDate: futureDate,
          examLectureIds: [88101, 88102],
          groups: [
            {
              id: 8811,
              name: 'Autonomic Pharmacology',
              lectures: [
                { id: 88101, title: 'Cholinergic Agonists', path: 'Cholinergic.pdf', completed: true, lastStudiedAt: Date.now() - 86400000 * 4, reviewCount: 1 },
                { id: 88102, title: 'Muscarinic Antagonists', path: '', completed: false }
              ]
            },
            {
              id: 8812,
              name: 'Cardiovascular Agents',
              lectures: [
                { id: 88103, title: 'Antihypertensive Drugs', path: 'HTN.pdf', completed: false, lastPageNum: 5, totalPages: 12, lastStudiedAt: Date.now() - 60000 }
              ]
            }
          ]
        },
        {
          id: 8802,
          name: 'Organic Chemistry',
          color: '#7898AC',
          icon: 'fa-flask-vial',
          isDivided: true,
          groups: [
            {
              id: 8821,
              name: 'Stereochemistry',
              lectures: [
                { id: 88201, title: 'Enantiomers & Chirality', path: '', completed: true }
              ]
            }
          ]
        },
        {
          id: 8803,
          name: 'Daily Quran Track — الورد اليومي',
          color: '#D7B96F',
          icon: 'fa-book-quran',
          isDivided: false,
          continuousBookmark: 'Surah Al-Baqarah p. 24',
          continuousLogs: [{ id: 88301, date: '13/11/2026', text: 'Reviewed 2 pages' }],
          groups: []
        }
      ];
      scheduleEvents = [
        { id: 8891, title: 'Pharm Session', subjectId: 8801, day: new Date().getDay(), startHour: 10, duration: 3, type: 'important', completed: false }
      ];
      saveSubjects();
      saveScheduleData();
      renderSubjectsList();
    });

    await pageLL.click('.sidebar-nav-item[data-tab="subjects"]');
    await pageLL.waitForSelector('#subjects.view-section.active', { state: 'visible' });

    // LL.1: Bookshelf default rendering, real counts, Shelf/List toggle, Filter & Sort
    const ll1Shelf = await pageLL.evaluate(() => {
      const card = document.querySelector('#mainSubjectsGrid .subject-card[data-subject-id="8801"]');
      const cardBg = card ? getComputedStyle(card).backgroundColor : '';
      return {
        lang: document.documentElement.lang,
        shelfActive: document.getElementById('libViewShelfBtn')?.classList.contains('active'),
        isList: document.getElementById('mainSubjectsGrid')?.classList.contains('is-list-view'),
        cardCount: document.querySelectorAll('#mainSubjectsGrid .subject-card').length,
        cardBg,
        ribbonSubs: document.getElementById('ribbonTotalSubjects')?.innerText.trim(),
        ribbonLecs: document.getElementById('ribbonTotalLectures')?.innerText.trim(),
        ribbonDone: document.getElementById('ribbonDoneLectures')?.innerText.trim(),
        ribbonPct: document.getElementById('ribbonSemesterProgress')?.innerText.trim(),
        hasExamBadge: Boolean(card?.querySelector('.exo-book-exam-strip'))
      };
    });

    await pageLL.click('#libViewListBtn');
    const ll1ListOn = await pageLL.evaluate(() => ({
      listActive: document.getElementById('libViewListBtn')?.classList.contains('active'),
      isList: document.getElementById('mainSubjectsGrid')?.classList.contains('is-list-view'),
      savedView: localStorage.getItem('exoLibraryViewModeV1')
    }));
    await pageLL.click('#libViewShelfBtn');

    await pageLL.selectOption('#subjectFilterSelect', 'continuous');
    const ll1FilterCont = await pageLL.evaluate(() =>
      Array.from(document.querySelectorAll('#mainSubjectsGrid .subject-card')).map(c => c.getAttribute('data-subject-id'))
    );
    await pageLL.selectOption('#subjectFilterSelect', 'courses');
    await pageLL.selectOption('#subjectSortOrderSelect', 'progress_desc');
    const ll1SortedCourses = await pageLL.evaluate(() =>
      Array.from(document.querySelectorAll('#mainSubjectsGrid .subject-card')).map(c => c.getAttribute('data-subject-id'))
    );
    await pageLL.selectOption('#subjectFilterSelect', 'all');
    await pageLL.selectOption('#subjectSortOrderSelect', 'custom');
    await pageLL.fill('#searchSubjectInput', 'Organic');
    const ll1Search = await pageLL.evaluate(() =>
      Array.from(document.querySelectorAll('#mainSubjectsGrid .subject-card')).map(c => c.getAttribute('data-subject-id'))
    );
    await pageLL.fill('#searchSubjectInput', '');

    assert(
      ll1Shelf.lang === 'en' &&
      ll1Shelf.shelfActive === true &&
      ll1Shelf.isList === false &&
      ll1Shelf.cardCount === 3 &&
      ll1Shelf.cardBg === 'rgb(41, 43, 45)' &&
      ll1Shelf.ribbonSubs === '3 books' &&
      ll1Shelf.ribbonLecs === '4 lectures' &&
      ll1Shelf.ribbonDone === '2 done' &&
      ll1Shelf.ribbonPct === '50%' &&
      ll1Shelf.hasExamBadge === true &&
      ll1ListOn.listActive === true && ll1ListOn.isList === true && ll1ListOn.savedView === 'list' &&
      JSON.stringify(ll1FilterCont) === JSON.stringify(['8803']) &&
      JSON.stringify(ll1SortedCourses) === JSON.stringify(['8802', '8801']) &&
      JSON.stringify(ll1Search) === JSON.stringify(['8802']),
      'Test LL.1: Digital Bookshelf defaults to Shelf view with Charcoal covers (#292b2d), real counts, Shelf/List toggle, Filter, Sort, and Search',
      JSON.stringify({ ll1Shelf, ll1ListOn, ll1FilterCont, ll1SortedCourses, ll1Search })
    );

    // LL.2: Subject CRUD + reorder + reload persistence
    await pageLL.click('#addSubjectPrimaryBtn');
    await pageLL.waitForSelector('#smartSubjectModalOverlay.active', { state: 'visible' });
    await pageLL.fill('#smartSubjectNameInput', 'Clinical Pharmacy');
    await pageLL.click('#smartSubjectModalOverlay button[onclick*="saveSmartSubjectModal"]');
    await pageLL.waitForFunction(() => !document.getElementById('smartSubjectModalOverlay')?.classList.contains('active'));

    const ll2CreatedId = await pageLL.evaluate(() => {
      const s = subjects.find(x => x.name === 'Clinical Pharmacy');
      return s ? s.id : null;
    });
    assert(ll2CreatedId !== null, 'Test LL.2a: Created book Clinical Pharmacy exists in subjects model');

    // Move created book (at index 0) down by 1 position using UI move-btn, then edit its name
    await pageLL.click(`.subject-card[data-subject-id="${ll2CreatedId}"] button[onclick*="moveSubjectOrder(${ll2CreatedId}, 1"]`);
    await pageLL.click(`.subject-card[data-subject-id="${ll2CreatedId}"] button[onclick*="triggerEditSubject(${ll2CreatedId}"]`);
    await pageLL.waitForSelector('#smartSubjectModalOverlay.active', { state: 'visible' });
    await pageLL.fill('#smartSubjectNameInput', 'Clinical Therapeutics');
    await pageLL.click('#smartSubjectModalOverlay button[onclick*="saveSmartSubjectModal"]');
    await pageLL.waitForFunction(() => !document.getElementById('smartSubjectModalOverlay')?.classList.contains('active'));

    await pageLL.reload({ waitUntil: 'domcontentloaded' });
    await pageLL.waitForFunction(() => typeof renderSubjectsList === 'function');
    await pageLL.click('.sidebar-nav-item[data-tab="subjects"]');
    await pageLL.waitForSelector('#subjects.view-section.active', { state: 'visible' });

    const ll2AfterReload = await pageLL.evaluate((cid) => {
      const ids = Array.from(document.querySelectorAll('#mainSubjectsGrid .subject-card')).map(c => Number(c.getAttribute('data-subject-id')));
      const renamedCard = document.querySelector(`.subject-card[data-subject-id="${cid}"] h3`)?.innerText.trim() || '';
      return { ids, renamedCard, indexOfEdited: ids.indexOf(cid) };
    }, ll2CreatedId);

    assert(
      ll2AfterReload.renamedCard === 'Clinical Therapeutics' && ll2AfterReload.indexOfEdited === 1,
      'Test LL.2: Subject create, reorder, edit, and reload persistence work via Library UI',
      JSON.stringify(ll2AfterReload)
    );

    // Clean up temporary created book via direct UI delete confirmation if needed or leave clean 3 subjects
    await pageLL.evaluate((cid) => {
      subjects = subjects.filter(s => s.id !== cid);
      saveSubjects();
      renderSubjectsList();
    }, ll2CreatedId);

    // LL.3: Open Book -> Table of Contents default view, TOC filter/search, Grid toggle, Collapse/Expand, Chapter CRUD & reorder, Lecture complete toggle, Back to Library
    await pageLL.click('.subject-card[data-subject-id="8801"]');
    await pageLL.waitForSelector('#subject-details-view', { state: 'visible' });

    const ll3InitialToc = await pageLL.evaluate(() => ({
      activeTitle: document.getElementById('activeSubjectTitle')?.innerText.trim(),
      tocBtnActive: document.getElementById('tocViewTocBtn')?.classList.contains('active'),
      isGrid: document.getElementById('groupsContainer')?.classList.contains('is-grid-view'),
      chapterNums: Array.from(document.querySelectorAll('#groupsContainer .exo-toc-chapter-num')).map(el => el.innerText.trim()),
      lecCount: document.querySelectorAll('#groupsContainer .lecture-item').length,
      hasExamBanner: Boolean(document.querySelector('#groupsContainer .exo-toc-exam-banner'))
    }));

    // Test TOC status filter (completed vs all) & search
    await pageLL.selectOption('#tocStatusFilterSelect', 'completed');
    const ll3CompletedFilter = await pageLL.evaluate(() => ({
      chapters: document.querySelectorAll('#groupsContainer .group-card').length,
      lectures: document.querySelectorAll('#groupsContainer .lecture-item').length
    }));
    await pageLL.selectOption('#tocStatusFilterSelect', 'all');
    await pageLL.fill('#tocSearchInput', 'Muscarinic');
    const ll3SearchFilter = await pageLL.evaluate(() => ({
      chapters: document.querySelectorAll('#groupsContainer .group-card').length,
      chapterNum: document.querySelector('#groupsContainer .exo-toc-chapter-num')?.innerText.trim() || ''
    }));
    await pageLL.fill('#tocSearchInput', '');

    // Toggle Grid mode and back to Table of Contents (verify lecture title & actions never overlap inside Grid cards)
    await pageLL.click('#tocViewGridBtn');
    const ll3GridMode = await pageLL.evaluate(() => {
      const lec = document.querySelector('#groupsContainer .lecture-item');
      const titleBox = lec?.querySelector('div[onclick*="openLectureDocument"]')?.getBoundingClientRect();
      const actBox = lec?.querySelector('.card-actions')?.getBoundingClientRect();
      const noOverlap = Boolean(titleBox && actBox && actBox.top >= titleBox.bottom - 2);
      return {
        gridBtnActive: document.getElementById('tocViewGridBtn')?.classList.contains('active'),
        isGrid: document.getElementById('groupsContainer')?.classList.contains('is-grid-view'),
        noOverlap
      };
    });
    await pageLL.click('#tocViewTocBtn');

    // Collapse All & Expand All chapters
    await pageLL.click('#tocExpandAllBtn');
    const ll3CollapsedAll = await pageLL.evaluate(() =>
      Array.from(document.querySelectorAll('#groupsContainer .group-card')).every(c => c.classList.contains('collapsed'))
    );
    await pageLL.click('#tocExpandAllBtn');
    const ll3ExpandedAll = await pageLL.evaluate(() =>
      Array.from(document.querySelectorAll('#groupsContainer .group-card')).every(c => !c.classList.contains('collapsed'))
    );

    // Move Chapter 1 down via UI reorder button, then move back up
    await pageLL.click('#groupCard_8811 button[onclick*="moveGroupOrder(8811, 1"]');
    const ll3AfterChapterMove = await pageLL.evaluate(() =>
      Array.from(document.querySelectorAll('#groupsContainer .group-card')).map(c => c.id)
    );
    await pageLL.click('#groupCard_8811 button[onclick*="moveGroupOrder(8811, -1"]');

    // Create, rename, and delete a chapter via SingleInputModal / ConfirmModal UI
    await pageLL.click('#addSubjectGroupBtn');
    await pageLL.waitForSelector('#singleInputModalOverlay.active', { state: 'visible' });
    await pageLL.fill('#siModalInput', 'Endocrine Unit');
    await pageLL.click('#siModalSaveBtn');
    await pageLL.waitForFunction(() => !document.getElementById('singleInputModalOverlay')?.classList.contains('active'));
    const ll3NewGrpId = await pageLL.evaluate(() => {
      const sub = subjects.find(s => s.id === 8801);
      const grp = sub?.groups?.find(g => g.name === 'Endocrine Unit');
      return grp ? grp.id : null;
    });
    assert(ll3NewGrpId !== null, 'Test LL.3a: New chapter Endocrine Unit created via UI modal');

    await pageLL.click(`#groupCard_${ll3NewGrpId} button[onclick*="triggerEditGroup(${ll3NewGrpId})"]`);
    await pageLL.waitForSelector('#singleInputModalOverlay.active', { state: 'visible' });
    await pageLL.fill('#siModalInput', 'Endocrine & Thyroid');
    await pageLL.click('#siModalSaveBtn');
    await pageLL.waitForFunction(() => !document.getElementById('singleInputModalOverlay')?.classList.contains('active'));
    const ll3RenamedGrpTitle = await pageLL.evaluate((gid) =>
      document.querySelector(`#groupCard_${gid} .exo-toc-chapter-titles h3`)?.innerText.trim() || ''
    , ll3NewGrpId);

    // Toggle completion on lecture 88102 (preserves Smart Study closed-loop prompt when linked to an active schedule event)
    await pageLL.click('#groupCard_8811 .lecture-item:nth-child(2) .exo-lec-check-btn');
    const ll3SmartVerifyShown = await pageLL.evaluate(() => {
      const m = document.getElementById('smartStudyVerifyModalOverlay');
      return Boolean(m && m.classList.contains('active'));
    });
    if (ll3SmartVerifyShown) {
      await pageLL.click('#smartVerifyBtnComplete');
      await pageLL.waitForFunction(() => !document.getElementById('smartStudyVerifyModalOverlay')?.classList.contains('active'));
    }
    const ll3HeroAfterCheck = await pageLL.evaluate(() => document.getElementById('subjectHeroStatsRow')?.innerText.trim() || '');

    // Delete temporary chapter via ConfirmModal
    await pageLL.click(`#groupCard_${ll3NewGrpId} button[onclick*="triggerDeleteGroup(${ll3NewGrpId})"]`);
    await pageLL.waitForSelector('#confirmModalOverlay.active', { state: 'visible' });
    await pageLL.click('#confirmModalBtn');
    await pageLL.waitForFunction((gid) => !document.getElementById(`groupCard_${gid}`), ll3NewGrpId);

    assert(
      ll3InitialToc.activeTitle === 'Pharmacology I — علم الأدوية' &&
      ll3InitialToc.tocBtnActive === true &&
      ll3InitialToc.isGrid === false &&
      JSON.stringify(ll3InitialToc.chapterNums) === JSON.stringify(['01', '02']) &&
      ll3InitialToc.lecCount === 3 &&
      ll3InitialToc.hasExamBanner === true &&
      ll3CompletedFilter.chapters === 1 && ll3CompletedFilter.lectures === 1 &&
      ll3SearchFilter.chapters === 1 && ll3SearchFilter.chapterNum === '01' &&
      ll3GridMode.gridBtnActive === true && ll3GridMode.isGrid === true && ll3GridMode.noOverlap === true &&
      ll3CollapsedAll === true && ll3ExpandedAll === true &&
      JSON.stringify(ll3AfterChapterMove) === JSON.stringify(['groupCard_8812', 'groupCard_8811']) &&
      ll3RenamedGrpTitle === 'Endocrine & Thyroid' &&
      ll3HeroAfterCheck.includes('67%'),
      'Test LL.3: Table of Contents default view, numbered chapters (01/02), TOC search & status filter, Grid toggle without overlap, Collapse/Expand All, chapter reorder/CRUD, and lecture completion updates work cleanly',
      JSON.stringify({ ll3InitialToc, ll3CompletedFilter, ll3SearchFilter, ll3GridMode, ll3CollapsedAll, ll3ExpandedAll, ll3AfterChapterMove, ll3RenamedGrpTitle, ll3HeroAfterCheck })
    );

    // LL.4: Live EN <-> AR switch inside TOC & Library preserving active subject, search inputs, RTL icons, non-overlapping RTL sidebar, and reload locale
    await pageLL.fill('#tocSearchInput', 'Cholinergic');
    await pageLL.click('#sidebarLangToggleBtn'); // EN -> AR inside Subject Details
    const ll4TocAr = await pageLL.evaluate(() => {
      const mainRect = document.querySelector('.main-content')?.getBoundingClientRect();
      const sideRect = document.getElementById('exoAppSidebar')?.getBoundingClientRect();
      return {
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        detailsVisible: getComputedStyle(document.getElementById('subject-details-view')).display !== 'none',
        activeTitle: document.getElementById('activeSubjectTitle')?.innerText.trim(),
        tocSearchVal: document.getElementById('tocSearchInput')?.value || '',
        backFlip: Boolean(document.querySelector('#backToSubjectsBtn i.exo-rtl-flip')),
        noSidebarOverlap: Boolean(mainRect && sideRect && mainRect.right <= sideRect.left + 1)
      };
    });
    await pageLL.fill('#tocSearchInput', '');

    await pageLL.click('#backToSubjectsBtn');
    await pageLL.waitForSelector('#subjects-list-view', { state: 'visible' });
    await pageLL.fill('#searchSubjectInput', 'Organic');
    await pageLL.click('#sidebarLangToggleBtn'); // AR -> EN inside Library
    const ll4LibEn = await pageLL.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      listVisible: getComputedStyle(document.getElementById('subjects-list-view')).display !== 'none',
      searchVal: document.getElementById('searchSubjectInput')?.value || '',
      heading: document.getElementById('libraryTitleHeading')?.innerText.trim()
    }));
    await pageLL.fill('#searchSubjectInput', '');

    assert(
      ll4TocAr.lang === 'ar' && ll4TocAr.dir === 'rtl' &&
      ll4TocAr.detailsVisible === true &&
      ll4TocAr.activeTitle === 'Pharmacology I — علم الأدوية' &&
      ll4TocAr.tocSearchVal === 'Cholinergic' &&
      ll4TocAr.backFlip === true &&
      ll4TocAr.noSidebarOverlap === true &&
      ll4LibEn.lang === 'en' && ll4LibEn.dir === 'ltr' &&
      ll4LibEn.listVisible === true &&
      ll4LibEn.searchVal === 'Organic' &&
      ll4LibEn.heading === 'Study Library',
      'Test LL.4: Live EN <-> AR language switching preserves active Subject Details/TOC, Library view, unsaved search filters, RTL icon flips, zero RTL sidebar overlap, and bilingual headings',
      JSON.stringify({ ll4TocAr, ll4LibEn })
    );

    // LL.5: Responsive viewport matrix (Desktop 1440x900, Tablet 834x1112, Mobile 390x844 EN/AR), >=44px touch targets, reduced motion, PDF Studio click/close regression, zero console/request errors
    await pageLL.emulateMedia({ reducedMotion: 'reduce' });
    await pageLL.setViewportSize({ width: 834, height: 1112 });
    const ll5Tablet = await pageLL.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      minCardBtnH: Math.min(...Array.from(document.querySelectorAll('#subjects .card-actions-always .icon-btn')).map(b => b.getBoundingClientRect().height))
    }));

    await pageLL.setViewportSize({ width: 390, height: 844 });
    const ll5MobileLibEn = await pageLL.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      minCardBtnH: Math.min(...Array.from(document.querySelectorAll('#subjects .card-actions-always .icon-btn')).map(b => b.getBoundingClientRect().height))
    }));

    await pageLL.click('.subject-card[data-subject-id="8801"]');
    await pageLL.waitForSelector('#subject-details-view', { state: 'visible' });
    const ll5MobileTocEn = await pageLL.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      minOpenBtnH: Math.min(...Array.from(document.querySelectorAll('#groupsContainer .lec-mobile-study-btn')).map(b => b.getBoundingClientRect().height)),
      minCheckH: Math.min(...Array.from(document.querySelectorAll('#groupsContainer .exo-lec-check-btn')).map(b => b.getBoundingClientRect().height))
    }));

    // Switch to Arabic on Mobile 390x844
    await pageLL.evaluate(() => applyExoLanguage('ar', true));
    const ll5MobileTocAr = await pageLL.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      overflowX: document.documentElement.scrollWidth > window.innerWidth
    }));

    // Click preserved .lecture-item div[onclick*="openLectureDocument(...)"] and verify PDF Studio opens & closes cleanly
    await pageLL.click('#groupsContainer .lecture-item div[onclick*="openLectureDocument(8811, 88101)"]');
    await pageLL.waitForSelector('#pdfViewerModalOverlay.active', { state: 'visible' });
    const ll5StudioOpen = await pageLL.evaluate(() => document.getElementById('pdfViewerModalOverlay')?.classList.contains('active'));
    await pageLL.click('#pdfViewerModalOverlay button[onclick*="closePdfViewer"]');
    const ll5StudioClose = await pageLL.evaluate(() => !document.getElementById('pdfViewerModalOverlay')?.classList.contains('active'));

    assert(
      ll5Tablet.overflowX === false && ll5Tablet.minCardBtnH >= 44 &&
      ll5MobileLibEn.overflowX === false && ll5MobileLibEn.minCardBtnH >= 44 &&
      ll5MobileTocEn.overflowX === false && ll5MobileTocEn.minOpenBtnH >= 44 && ll5MobileTocEn.minCheckH >= 44 &&
      ll5MobileTocAr.lang === 'ar' && ll5MobileTocAr.dir === 'rtl' && ll5MobileTocAr.overflowX === false &&
      ll5StudioOpen === true && ll5StudioClose === true &&
      llErrors.length === 0 && llFailedUrls.length === 0,
      'Test LL.5: Tablet/Mobile EN/AR layouts have zero horizontal overflow, >=44px touch targets, preserved PDF Studio open/close flow, and zero console/network errors',
      JSON.stringify({ ll5Tablet, ll5MobileLibEn, ll5MobileTocEn, ll5MobileTocAr, ll5StudioOpen, ll5StudioClose, llErrors, llFailedUrls })
    );

    await pageLL.close();
    await contextLL.close();

    // =========================================================================
    // TEST MM: WP 6.3 UNIFIED CHAPTER WORKSPACE, INTEGRATED PDF STUDIO DRAWER,
    // REAL INTERACTIONS, CROSS-ACCOUNT ISOLATION, LIVE EN<->AR & RESPONSIVE
    // =========================================================================
    console.log('\n--- TEST MM: WP 6.3 Chapter Workspace & Integrated Study Studio ---');
    const contextMM = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageMM = await contextMM.newPage();
    const mmErrors = [];
    const mmFailedUrls = [];
    pageMM.on('pageerror', err => mmErrors.push('pageerror: ' + err.message));
    pageMM.on('console', msg => {
      if (msg.type() === 'error') mmErrors.push('console.error: ' + msg.text());
    });
    pageMM.on('requestfailed', req => {
      mmFailedUrls.push(req.url() + ' -> ' + (req.failure()?.errorText || 'failed'));
    });

    await pageMM.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await pageMM.waitForFunction(() =>
      typeof openChapterWorkspace === 'function' &&
      typeof renderChapterWorkspace === 'function' &&
      typeof togglePdfChapterContextDrawer === 'function' &&
      typeof saveMediaToDB === 'function'
    );

    // Seed valid synthetic multi-chapter course + real 2-page PDF + real WAV audio + schedule event in IndexedDB
    await pageMM.evaluate(async () => {
      function makeTwoPagePdfBytes() {
        const objs = [
          '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
          '2 0 obj\n<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>\nendobj\n',
          '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R /Resources << >> >>\nendobj\n',
          '4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n',
          '5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 6 0 R /Resources << >> >>\nendobj\n',
          '6 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n'
        ];
        let body = '%PDF-1.4\n';
        const offsets = [0];
        for (const o of objs) {
          offsets.push(body.length);
          body += o;
        }
        const xrefStart = body.length;
        let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
        for (let i = 1; i < offsets.length; i++) {
          xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
        }
        body += xref + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
        return new Blob([body], { type: 'application/pdf' });
      }
      function makeSilentWavBlob(seconds = 3) {
        const sr = 8000;
        const len = sr * seconds;
        const buf = new ArrayBuffer(44 + len);
        const dv = new DataView(buf);
        const str = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
        str(0, 'RIFF'); dv.setUint32(4, 36 + len, true); str(8, 'WAVE');
        str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
        dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr, true);
        dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
        str(36, 'data'); dv.setUint32(40, len, true);
        return new Blob([buf], { type: 'audio/wav' });
      }

      if (!dbInstance) await initPdfDB();
      await saveMediaToDB('pdfs', 89101, makeTwoPagePdfBytes());
      await saveMediaToDB('audios', 89101, makeSilentWavBlob(4));
      await saveMediaToDB('audios', 'rec_mm_sec', makeSilentWavBlob(3));
      localMediaCache.pdfs.add('89101');
      localMediaCache.audios.add('89101');
      localMediaCache.audios.add('rec_mm_sec');

      subjects = [
        {
          id: 8901,
          name: 'Clinical Pharmacology — الفارما الإكلينيكية',
          color: '#899982',
          icon: 'fa-capsules',
          isDivided: true,
          groups: [
            {
              id: 8911,
              name: 'Autonomic Systems — الجهاز العصبي',
              lectures: [
                {
                  id: 89101,
                  title: 'Cholinergic Drugs',
                  path: 'cholinergics.pdf',
                  audioPath: 'cholinergic_main.wav',
                  completed: false,
                  lastPageNum: 2,
                  totalPages: 2,
                  lastAudioSec: 12,
                  lastStudiedAt: Date.now() - 10000,
                  recordings: [
                    { id: 'rec_default_89101', name: 'Main Lecture Audio', dbKey: '89101' },
                    { id: 'rec_mm_sec', name: 'TA Section Recap', dbKey: 'rec_mm_sec' }
                  ],
                  activeRecordingIndex: 0
                }
              ]
            },
            {
              id: 8912,
              name: 'Cardiovascular Agents',
              lectures: [
                { id: 89102, title: 'Beta Blockers Ref', path: 'https://example.org/beta-blockers', completed: false }
              ]
            },
            {
              id: 8913,
              name: 'Empty Practice Unit',
              lectures: []
            }
          ]
        }
      ];
      scheduleEvents = [
        { id: 8991, title: 'Study: Autonomic Systems', subjectId: 8901, lectureId: 89101, day: new Date().getDay(), startHour: 11, duration: 2, completed: false }
      ];
      saveSubjects();
      saveScheduleData();
      renderSubjectsList();
    });

    await pageMM.click('.sidebar-nav-item[data-tab="subjects"]');
    await pageMM.waitForSelector('#subjects.view-section.active', { state: 'visible' });
    await pageMM.click('.subject-card[data-subject-id="8901"]');
    await pageMM.waitForSelector('#subject-details-view', { state: 'visible' });

    // MM.1: Open Empty Chapter Workspace via TOC CTA -> test skippable first-entry setup
    await pageMM.click('#groupCard_8913 .exo-toc-open-workspace-btn');
    await pageMM.waitForSelector('#chapter-workspace-view', { state: 'visible' });
    const mm1EmptySetup = await pageMM.evaluate(() => ({
      setupVisible: Boolean(document.getElementById('cwFirstEntrySetupCard')),
      cwVisible: getComputedStyle(document.getElementById('chapter-workspace-view')).display !== 'none',
      tocHidden: getComputedStyle(document.getElementById('subject-details-view')).display === 'none',
      activeTitle: document.getElementById('cwActiveChapterTitle')?.innerText.trim()
    }));
    await pageMM.click('#cwSkipSetupBtn');
    const mm1AfterSkip = await pageMM.evaluate(() => ({
      setupHidden: getComputedStyle(document.getElementById('cwFirstEntrySetup')).display === 'none',
      tabCount: document.querySelectorAll('#cwTabsRow .exo-cw-tab-btn').length
    }));
    assert(
      mm1EmptySetup.setupVisible === true &&
      mm1EmptySetup.cwVisible === true &&
      mm1EmptySetup.tocHidden === true &&
      mm1EmptySetup.activeTitle === 'Empty Practice Unit' &&
      mm1AfterSkip.setupHidden === true &&
      mm1AfterSkip.tabCount === 4,
      'Test MM.1: Opening empty chapter enters Chapter Workspace with optional skippable first-entry setup and immediate workspace access after Skip',
      JSON.stringify({ mm1EmptySetup, mm1AfterSkip })
    );

    // MM.2: Switch to Chapter 01 via #cwChapterSwitcherSelect -> Resume Notice -> Open Study Studio -> Chapter Context Drawer + Drawer Mutual Exclusion + Annotate/Note/Bookmark/Pin + Fast Return
    await pageMM.selectOption('#cwChapterSwitcherSelect', '8911');
    await pageMM.waitForFunction(() => document.getElementById('cwActiveChapterTitle')?.innerText.includes('Autonomic Systems'));
    const mm2OverviewBefore = await pageMM.evaluate(() => ({
      hasResumeNotice: Boolean(document.getElementById('cwPartialRestoreNotice')?.innerText.includes('zoom')),
      hasHonestNotice: Boolean(document.getElementById('cwHonestFormatNotice')),
      metaRow: document.getElementById('cwHeaderMetaRow')?.innerText.trim() || ''
    }));

    await pageMM.click('#cwOpenStudioPrimaryBtn');
    await pageMM.waitForSelector('#pdfViewerModalOverlay.active', { state: 'visible' });
    // Wait briefly for PDF rendering / fallback setup
    await pageMM.waitForTimeout(350);

    const mm2StudioState = await pageMM.evaluate(() => {
      const backBtn = document.getElementById('pdfBackToChapterBtn');
      const ctxBtn = document.getElementById('pdfChapterContextToggleBtn');
      const pagesWrap = document.getElementById('pdfPagesScrollContainer');
      const wrapBoxBefore = pagesWrap ? pagesWrap.getBoundingClientRect() : null;
      return {
        backVisible: Boolean(backBtn && getComputedStyle(backBtn).display !== 'none'),
        ctxVisible: Boolean(ctxBtn && getComputedStyle(ctxBtn).display !== 'none'),
        wrapWBefore: wrapBoxBefore ? wrapBoxBefore.width : 0,
        savedPageLoaded: typeof currentActivePageNum !== 'undefined' ? currentActivePageNum : 0
      };
    });

    // Open Chapter Context Drawer and confirm non-destructive slide-over width + mutual exclusion with Thumbnails drawer
    await pageMM.click('#pdfChapterContextToggleBtn');
    const mm2DrawerOpen = await pageMM.evaluate(() => {
      const drawer = document.getElementById('pdfChapterContextDrawer');
      const pagesWrap = document.getElementById('pdfPagesScrollContainer');
      return {
        isOpen: Boolean(drawer && drawer.classList.contains('open')),
        ctxText: drawer?.innerText || '',
        wrapWAfter: pagesWrap ? pagesWrap.getBoundingClientRect().width : 0
      };
    });

    // Click Thumbnails drawer -> must close Chapter Context drawer automatically (no overlapping drawers!)
    await pageMM.click('#pdfThumbnailsToggleBtn');
    const mm2MutualExclusion = await pageMM.evaluate(() => ({
      thumbsOpen: Boolean(document.getElementById('pdfThumbnailsDrawer')?.classList.contains('open')),
      ctxClosed: !document.getElementById('pdfChapterContextDrawer')?.classList.contains('open')
    }));
    await pageMM.click('#pdfThumbnailsToggleBtn'); // close thumbnails

    // Add real slide Bookmark, Extra Summary Sheet flag + stroke, Blank Page, and Audio Pin via Studio state helpers
    await pageMM.evaluate(async () => {
      if (typeof toggleBookmarkForPage === 'function') {
        toggleBookmarkForPage(2);
      } else {
        const sub = subjects.find(s => s.id === 8901);
        sub.groups[0].lectures[0].bookmarkedSlides = [2];
      }
      if (typeof toggleExtraNoteForPage === 'function') {
        toggleExtraNoteForPage(1);
      }
      if (!pageAnnotations._extraNotes) pageAnnotations._extraNotes = {};
      pageAnnotations._extraNotes['1'] = true;
      pageAnnotations['note_1'] = [{ id: 'mm_s1', tool: 'pen', color: '#899982', size: 3, points: [{ x: 20, y: 20 }, { x: 80, y: 40 }] }];
      if (!Array.isArray(pageAnnotations._audioPins)) pageAnnotations._audioPins = [];
      pageAnnotations._audioPins.push({ id: 'pin_mm_1', timeSec: 2, page: 1, note: 'Receptor Affinity Mechanism' });

      const sub = subjects.find(s => s.id === 8901);
      const lec = sub.groups[0].lectures[0];
      if (!Array.isArray(lec.customPages)) lec.customPages = [];
      lec.customPages.push({ id: 'cp_mm_1', title: 'Autonomic Mindmap Sheet', afterPage: 1 });
      saveSubjects();
      await saveAnnotationsToDB(89101, pageAnnotations);
      if (typeof renderPdfChapterContextDrawer === 'function') renderPdfChapterContextDrawer();
    });

    // Click Back to Chapter Studio header button and measure close latency
    const mm2CloseTiming = await pageMM.evaluate(() => {
      const t0 = performance.now();
      document.getElementById('pdfBackToChapterBtn').click();
      const closeMs = performance.now() - t0;
      const overlay = document.getElementById('pdfViewerModalOverlay');
      const cwView = document.getElementById('chapter-workspace-view');
      return {
        closeMs,
        overlayClosed: !overlay?.classList.contains('active'),
        cwStillVisible: Boolean(cwView && getComputedStyle(cwView).display !== 'none'),
        metaRowAfter: document.getElementById('cwHeaderMetaRow')?.innerText.trim() || ''
      };
    });

    assert(
      mm2OverviewBefore.hasResumeNotice === true &&
      mm2OverviewBefore.hasHonestNotice === true &&
      mm2StudioState.backVisible === true &&
      mm2StudioState.ctxVisible === true &&
      mm2DrawerOpen.isOpen === true &&
      mm2DrawerOpen.ctxText.includes('Cholinergic Drugs') &&
      mm2DrawerOpen.ctxText.includes('TA Section Recap') &&
      Math.abs(mm2DrawerOpen.wrapWAfter - mm2StudioState.wrapWBefore) < 2 &&
      mm2MutualExclusion.thumbsOpen === true && mm2MutualExclusion.ctxClosed === true &&
      mm2CloseTiming.closeMs < 50 &&
      mm2CloseTiming.overlayClosed === true &&
      mm2CloseTiming.cwStillVisible === true,
      'Test MM.2: Chapter switcher, Resume Study Studio, non-shrinking slide-over Chapter Context Drawer, drawer mutual exclusion, and <50ms return to Chapter Workspace all pass',
      JSON.stringify({ mm2OverviewBefore, mm2StudioState, mm2DrawerOpen, mm2MutualExclusion, mm2CloseTiming })
    );

    // MM.3: Resources, Audio & Pins, and Notes & Sheets tabs; Search/Filter/Sort; Add Web Link via UI; Reload Durability; Preview Audio & Studio Jump
    await pageMM.waitForTimeout(150);
    await pageMM.click('#cwTabBtn_resources');
    await pageMM.waitForSelector('#cwResourceSearchInput', { state: 'visible' });

    await pageMM.fill('#cwResourceSearchInput', 'Receptor Affinity');
    const mm3SearchPin = await pageMM.evaluate(() => document.querySelectorAll('#cwResourcesList .exo-cw-res-row').length);
    await pageMM.fill('#cwResourceSearchInput', '');
    await pageMM.selectOption('#cwResourceFilterSelect', 'audio');
    const mm3FilterAudio = await pageMM.evaluate(() => document.querySelectorAll('#cwResourcesList .exo-cw-res-row').length);
    await pageMM.selectOption('#cwResourceFilterSelect', 'all');
    await pageMM.selectOption('#cwResourceSortSelect', 'notes_first');
    const mm3SortNotesFirst = await pageMM.evaluate(() => {
      const firstRow = document.querySelector('#cwResourcesList .exo-cw-res-row');
      return Boolean(firstRow && firstRow.classList.contains('is-note'));
    });

    // Add Web Link via Chapter Workspace Add Menu -> real UI modal
    await pageMM.click('#cwAddResourceBtn');
    await pageMM.waitForSelector('#cwAddResourceMenu.open', { state: 'visible' });
    await pageMM.click('#cwAddLinkMenuBtn');
    await pageMM.waitForSelector('#doubleInputModalOverlay.active', { state: 'visible' });
    await pageMM.fill('#diModalInput1', 'Goodman & Gilman Summary');
    await pageMM.fill('#diModalInput2', 'https://example.org/goodman-summary');
    await pageMM.click('#diModalSaveBtn');
    await pageMM.waitForFunction(() => !document.getElementById('doubleInputModalOverlay')?.classList.contains('active'));

    // Check Audio & Pins tab + Notes & Sheets tab counts and Audio Preview bar
    await pageMM.click('#cwTabBtn_audio');
    const mm3AudioTab = await pageMM.evaluate(() => document.querySelectorAll('#cwBody .exo-cw-res-row').length);
    await pageMM.click('#cwBody .exo-cw-res-row button[onclick*="cwPlayAudioPreview"]');
    const mm3PreviewActive = await pageMM.evaluate(() => document.getElementById('cwAudioPreviewBar')?.classList.contains('active'));
    await pageMM.click('#cwAudioPreviewBar button[onclick*="cwStopAudioPreview"]');

    await pageMM.click('#cwTabBtn_notes');
    const mm3NotesTabCount = await pageMM.evaluate(() => document.querySelectorAll('#cwBody .exo-cw-res-row').length);

    // Reload browser and confirm added Web Link + Notes/Pins survive cleanly
    await pageMM.reload({ waitUntil: 'domcontentloaded' });
    await pageMM.waitForFunction(() => typeof openChapterWorkspace === 'function');
    await pageMM.click('.sidebar-nav-item[data-tab="subjects"]');
    await pageMM.click('.subject-card[data-subject-id="8901"]');
    await pageMM.click('#groupCard_8911 .exo-toc-open-workspace-btn');
    await pageMM.waitForFunction(() =>
      document.getElementById('chapter-workspace-view') &&
      getComputedStyle(document.getElementById('chapter-workspace-view')).display !== 'none'
    );
    await pageMM.waitForTimeout(150);
    await pageMM.click('#cwTabBtn_resources');
    const mm3AfterReload = await pageMM.evaluate(() => ({
      text: document.getElementById('cwResourcesList')?.innerText || '',
      hasLink: (document.getElementById('cwResourcesList')?.innerText || '').includes('Goodman & Gilman Summary'),
      hasPin: (document.getElementById('cwResourcesList')?.innerText || '').includes('Receptor Affinity Mechanism')
    }));

    assert(
      mm3SearchPin === 1 &&
      mm3FilterAudio === 2 &&
      mm3SortNotesFirst === true &&
      mm3AudioTab === 3 && // 2 recordings + 1 pin
      mm3PreviewActive === true &&
      mm3NotesTabCount >= 3 && // blank sheet + extra sheet + pin + bookmark
      mm3AfterReload.hasLink === true &&
      mm3AfterReload.hasPin === true,
      'Test MM.3: Unified Resources search/filter/sort, Add Web Link via UI modal, Audio preview, Notes/Sheets index, and reload persistence all pass',
      JSON.stringify({ mm3SearchPin, mm3FilterAudio, mm3SortNotesFirst, mm3AudioTab, mm3PreviewActive, mm3NotesTabCount, mm3AfterReload })
    );

    // MM.4: Cross-account isolation in Chapter Workspace cache & IndexedDB annotations
    const mm4Isolation = await pageMM.evaluate(async () => {
      const uidB = 'user-mm-isolated-b-9999';
      await handleAuthSessionChange({ id: uidB, email: 'mmb@exo.edu', name: 'User B' }, false);
      subjects = [
        {
          id: 8901,
          name: 'Account B Course',
          isDivided: true,
          groups: [{ id: 8911, name: 'Account B Chapter', lectures: [{ id: 89101, title: 'Shared ID Lec B', path: '' }] }]
        }
      ];
      activeSubjectId = 8901;
      activeChapterWorkspaceGroupId = 8911;
      activeChapterWorkspaceTab = 'notes';
      await openChapterWorkspace(8911);
      await new Promise(r => setTimeout(r, 120));
      const notesRowsInB = document.querySelectorAll('#cwBody .exo-cw-res-row').length;
      return { notesRowsInB };
    });
    assert(
      mm4Isolation.notesRowsInB === 0,
      'Test MM.4: Switching accounts with overlapping lecture/chapter IDs isolates Chapter Workspace annotations cache & shows zero cross-account notes/pins',
      JSON.stringify(mm4Isolation)
    );

    // Restore guest/synthetic state for bilingual & responsive checks
    await pageMM.evaluate(async () => {
      await handleAuthSessionChange(null, false);
      localStorage.setItem('exoAppLang', 'en');
      applyExoLanguage('en', true);
      subjects = [
        {
          id: 8901,
          name: 'Clinical Pharmacology — الفارما الإكلينيكية',
          color: '#899982',
          icon: 'fa-capsules',
          isDivided: true,
          groups: [
            {
              id: 8911,
              name: 'Autonomic Systems — الجهاز العصبي',
              lectures: [
                {
                  id: 89101,
                  title: 'Cholinergic Drugs',
                  path: 'cholinergics.pdf',
                  audioPath: 'cholinergic_main.wav',
                  completed: false,
                  bookmarkedSlides: [2],
                  customPages: [{ id: 'cp_mm_1', title: 'Autonomic Mindmap Sheet', afterPage: 1 }]
                }
              ]
            }
          ]
        }
      ];
      activeSubjectId = 8901;
      openChapterWorkspace(8911);
      switchChapterWorkspaceTab('resources');
    });

    // MM.5: Live EN <-> AR switch inside Chapter Workspace (preserving active tab & search input) + inside Studio Context Drawer
    await pageMM.fill('#cwResourceSearchInput', 'Cholinergic');
    await pageMM.click('#sidebarLangToggleBtn'); // EN -> AR
    const mm5Ar = await pageMM.evaluate(() => {
      const mainRect = document.querySelector('.main-content')?.getBoundingClientRect();
      const sideRect = document.getElementById('exoAppSidebar')?.getBoundingClientRect();
      return {
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        searchVal: document.getElementById('cwResourceSearchInput')?.value || '',
        noSidebarOverlap: Boolean(mainRect && sideRect && mainRect.right <= sideRect.left + 1),
        arTabText: document.getElementById('cwTabBtn_resources')?.innerText || ''
      };
    });
    await pageMM.click('#sidebarLangToggleBtn'); // AR -> EN
    const mm5En = await pageMM.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      searchVal: document.getElementById('cwResourceSearchInput')?.value || '',
      enTabText: document.getElementById('cwTabBtn_resources')?.innerText || ''
    }));
    await pageMM.fill('#cwResourceSearchInput', '');

    assert(
      mm5Ar.lang === 'ar' && mm5Ar.dir === 'rtl' &&
      mm5Ar.searchVal === 'Cholinergic' &&
      mm5Ar.noSidebarOverlap === true &&
      mm5Ar.arTabText.includes('الموارد') &&
      mm5En.lang === 'en' && mm5En.dir === 'ltr' &&
      mm5En.searchVal === 'Cholinergic' &&
      mm5En.enTabText.includes('Resources'),
      'Test MM.5: Live EN <-> AR switching inside Chapter Workspace preserves active tab, unsaved search filter, RTL layout, and zero sidebar overlap',
      JSON.stringify({ mm5Ar, mm5En })
    );

    // MM.6: Responsive viewport matrix (1440x900, 834x1112, 390x844 EN/AR) + reduced motion + >=44px touch targets + zero console/network errors
    await pageMM.emulateMedia({ reducedMotion: 'reduce' });
    await pageMM.click('#cwTabBtn_overview');
    const mm6Desktop = await pageMM.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > window.innerWidth
    }));
    await pageMM.setViewportSize({ width: 834, height: 1112 });
    const mm6Tablet = await pageMM.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      minTabH: Math.min(...Array.from(document.querySelectorAll('#cwTabsRow .exo-cw-tab-btn')).map(b => b.getBoundingClientRect().height))
    }));
    await pageMM.setViewportSize({ width: 390, height: 844 });
    const mm6MobileEn = await pageMM.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      minTabH: Math.min(...Array.from(document.querySelectorAll('#cwTabsRow .exo-cw-tab-btn')).map(b => b.getBoundingClientRect().height)),
      primaryBtnH: document.getElementById('cwOpenStudioPrimaryBtn')?.getBoundingClientRect().height || 0
    }));
    await pageMM.evaluate(() => applyExoLanguage('ar', true));
    const mm6MobileAr = await pageMM.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      overflowX: document.documentElement.scrollWidth > window.innerWidth
    }));

    assert(
      mm6Desktop.overflowX === false &&
      mm6Tablet.overflowX === false && mm6Tablet.minTabH >= 44 &&
      mm6MobileEn.overflowX === false && mm6MobileEn.minTabH >= 44 && mm6MobileEn.primaryBtnH >= 44 &&
      mm6MobileAr.lang === 'ar' && mm6MobileAr.dir === 'rtl' && mm6MobileAr.overflowX === false &&
      mmErrors.length === 0 && mmFailedUrls.length === 0,
      'Test MM.6: Responsive Desktop/Tablet/Mobile EN/AR viewports for Chapter Workspace have zero horizontal overflow, >=44px touch targets, reduced-motion support, and zero console/network errors',
      JSON.stringify({ mm6Desktop, mm6Tablet, mm6MobileEn, mm6MobileAr, mmErrors, mmFailedUrls })
    );

    await pageMM.close();
    await contextMM.close();
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
    console.log('ALL 23 MANDATORY CHROMIUM + INDEXEDDB E2E SCENARIOS (A - V, AA - MM) PASSED (100%).');
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
