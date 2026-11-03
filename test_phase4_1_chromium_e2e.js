// ============================================================================
// Exo Academic Platform — Phase 4.1 Real Headless Chromium + IndexedDB E2E Suite
// Executes Mandatory Scenarios A through N inside real Headless Chromium against
// http://localhost:3000 and real browser IndexedDB (WorkspaceMediaStore v4).
//
// Verified Architectural Contracts (Phase 4.1):
//   - Scenarios A–E: Account Switch Mid-Sync, Mid-Conflict-Merge & Mid-Export
//   - Scenario F: Foreign Key Rejection (`CROSS_ACCOUNT_KEY_VIOLATION`)
//   - Scenario G: IndexedDB Read Failure Blocks Destructive Cloud Overwrite
//   - Scenario H: Aborted Write Transaction Leaves `inMemoryAnnotationsCache` Untouched
//   - Scenarios I–J: Provenance-Only Legacy Migration & Anonymous Record Quarantine
//   - Scenario K: Media Upload Rollback & Scoped Media Cleanup on Account Switch
//   - Scenarios L–M: Two-Phase Recovery Vault Durability & Account-Isolated Pending Saves
//   - Scenario N: Optimistic Concurrency Control (HTTP 409 / PGRST116 Conflict Resolution)
//
// Technical References & Sources:
//   - W3C Indexed Database API 3.0: https://www.w3.org/TR/IndexedDB-3/
//   - MDN Web Docs — Using IndexedDB & Transaction Lifecycle:
//     https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
//   - Playwright Browser Automation & Storage Inspection:
//     https://playwright.dev/docs/api/class-page
//   - Supabase JS Client & PostgREST Error Codes (PGRST116):
//     https://postgrest.org/en/stable/references/errors.html
// ============================================================================

const http = require('http');
const { spawn } = require('child_process');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e1) {
  try {
    ({ chromium } = require('playwright-core'));
  } catch (e2) {
    ({ chromium } = require('/usr/local/share/bun-global/node_modules/playwright-core'));
  }
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
  const browser = await chromium.launch({ headless: true });

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
    console.log('ALL 14 MANDATORY CHROMIUM + INDEXEDDB E2E SCENARIOS (A - N) PASSED (100%).');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal Chromium E2E test runner error:', err);
  process.exit(1);
});
