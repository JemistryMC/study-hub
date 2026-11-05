# EXO — PHASE 5.1.1: DATA-SAFETY IMPLEMENTATION BLUEPRINT & EXECUTION PLAN

- **Document ID:** `EXO-P5.1.1-BLUEPRINT`
- **Phase:** `5.1.1 — Blueprint Technical Validation & Correction`
- **Status:** `CHANGES REQUESTED — DOCUMENTATION ONLY — NOT APPROVED`
- **Author:** Senior Systems Architect & Data-Integrity Engineer
- **Repository:** `JemistryMC/study-hub`
- **Active Branch:** `main`
- **Phase 5.1.1 Workspace Base SHA (after governance alignment):** `9c3e89c9cc85861cb5ea6da884e475f8c4181fb2`
- **Blueprint draft reviewed/corrected in this pass:** `2e9c2b0bb0699f55107a4520f2aa6b6d03ac0ca0`
- **Original Phase 5.1.0 Blueprint Commit SHA:** `6020a78e585d415ca3d8dcdd37a024cda2614652`
- **Phase 5.0.2 Audit Commit SHA:** `1758bba343746f4b457d8793fa9389b80117bcf8`
- **Last Verified Application Source & CI SHA:** `c211d034eb074c43f74eee480b8186e58868dc80` (GitHub Actions Run `41857800822`, `335/335` passing)
- **Approved Audit Baseline:** `reports/phases/phase-5-storage-sync-audit/gemini-report.md` (Phase 5.0.2)
- **Permanent Engineering Contract:** `GEMINI.md`
- **Target File Modified in Phase 5.1.1:** `reports/phases/phase-5-storage-sync-audit/phase-5-1-implementation-blueprint.md` (Strictly Documentation-Only)

---

## 0. Executive Summary & Phase 5.1.1 Corrections Overview

This document is a corrected **design proposal for independent review** for Phase 5.1 (Data Safety, Local Durability, Conflict Resolution, and Backup/Restore). It is **not implementation authorization** and remains NOT APPROVED until the owner accepts the design.

No application source code (`index.html`, `server.js`, `sw.js`), test suites, package manifests, or database migrations have been modified in this task. **Pinned source baseline:** `index.html` at Source SHA `c211d034eb074c43f74eee480b8186e58868dc80`, blob `b0b4cd11f9568809490740190ecda9012db1debc` (3,286,646 bytes). The prior audit records 32,324 logical lines, while the Gemini workspace report records 30,715. This discrepancy is unresolved. Numeric line references below are inherited evidence pointers, not a claim that every line was independently re-numbered in the Gemini workspace. Before implementation, regenerate line numbers from the exact pinned blob with a reproducible script and prefer function/symbol names alongside line references.

### Summary of Technical Corrections Applied in Phase 5.1.1

1. **Exact Preservation of Original Phase 5.0.2 Findings (`F-01` through `F-15`) & Separation of New Findings (`N-01` through `N-04`):**
   - Every finding `F-01` through `F-15` retains its audit ID, title, definition, verification status, severity, and original meaning from `reports/phases/phase-5-storage-sync-audit/gemini-report.md`. Source line pointers are carried forward as reported and are **not** claimed as re-numbered; the source line-count discrepancy documented above must be resolved before implementation.
   - Newly identified edge cases uncovered during Phase 5.1 design are cataloged separately under `N-01` through `N-04` and cross-linked to their parent `F-*` findings without overwriting or renumbering any original audit finding.
2. **Correction of Stale/Unsupported Source Claims:**
   - Removed all references to nonexistent Google Drive functions or folder names (`uploadBlobToGoogleDrive`, `Exo_Academic_Cloud_Storage`, active multipart uploads, or automatic `role: 'reader', type: 'anyone'` sharing). Verified the actual implementation in `index.html`: `uploadBlobToGoogleDriveViaXHR()` (`27972–28094`), `uploadMediaToCloudAccount()` (`28181–28346`), root folder `'Exo_Workspace'` (`27808, 27830`), hierarchical `'Exo_Workspace/<Subject>/<Group>'` (`28251–28260`), and private-by-default uploads (`28295–28297`).
   - Recorded that `index.html:20349–20355` **already** attaches `pagehide` and `beforeunload` listeners calling `flushPendingAnnotationsSave(false)` as a best-effort last-chance attempt to flush pending annotations to local IndexedDB (`annotations` + `annotation_recovery_vault`); it is not a hard durability guarantee.
3. **Clock-Skew-Resilient Conflict Protocol (Zero Wall-Clock Authority):**
   - Eliminated wall-clock `Date.now()` (`_updatedAt`) and raw `_baseWorkspaceRev` comparison as conflict winners.
   - Replaced with a **per-scope dotted-version + causal-context proposal** using a distinct `actorId` per live tab/document, a scope-local actor counter, a unique `operationId`, and causal context for the exact entity/field/annotation scope.
   - Causal order is proved by one operation's context containing the other's dot. Only truly concurrent operations use the deterministic `(lamport, deviceId, actorId, operationId)` tie-break. `user_workspaces.revision` remains the row-level OCC token only; it is not causal ancestry.
4. **Indefinite Tombstone Retention & Device-Watermark Compaction Design:**
   - Removed the unsafe `90-day / 50-revision` automatic tombstone purge rule, which could allow an offline device reconnecting after >90 days to resurrect deleted entities.
   - Phase 5.1 retains tombstones **indefinitely**. `_deviceRegistry` is diagnostic only; no compaction predicate or deletion protocol is approved. Scalar Lamport acknowledgements and row revisions do not prove that every tombstone was observed. Any later compaction requires a separately reviewed protocol.
5. **Crash-Recoverable Backup Import Journal & Honest Digest/Memory Design:**
   - Replaced claims of "two-phase atomic `localStorage` + IndexedDB transactions" with a **Durable IndexedDB + `localStorage` Crash-Recoverable Import Journal** (`usr_<sanitizedUid>::__import_journal_v1__` in `annotation_recovery_vault` + `pharmaImportTxState_<uid>`).
   - Required explicit user choice between **Replace Mode** and **Merge Mode**, and gated **Merge Mode** on the verified Milestone M4/M5 conflict merger rather than the defective current `mergeAndApplyCloudConflict()`.
   - Corrected SHA-256 verification to use Web Crypto's one-shot `crypto.subtle.digest('SHA-256', encodedCanonicalData)` over canonical `v4` `data` (with zero duplicate root aliases and zero FNV-1a fallback substitution for `v4` integrity verification).
   - Replaced unverified `JSON.parse()` streaming claims with an accurate memory analysis and empirical Chromium E2E measurement plan.
6. **Legacy Stroke Identity With an Explicit Shared-Ancestor Requirement:**
   - Geometry plus an occurrence ordinal is only a deterministic migration aid when replicas share the same immutable ordered legacy page snapshot. A persisted identity manifest is created once from that ancestor. If the arrays diverged or no common ancestor can be proven, preserve both candidates and require recovery; do not claim collision-free identity for indistinguishable legacy objects.
7. **Verified Test Suite Filenames, Counts & Runtime Harnesses:**
   - Aligned all test plans with the actual repository suites (`54` static + `102` unit + `41` PGlite + `96` PG16 + `42` Chromium E2E = `335/335`) and actual dependencies (`express`, `@electric-sql/pglite`, `pg`, `playwright` — no `jsdom` or `fake-indexeddb`).
8. **Product Policy (`Free` vs. `VIP`) & Read-Only Supabase Preflight (`dszjmgzzqpdrdjkycvht`):**
   - Enforced the permanent `Free` vs. `VIP` contract (`GEMINI.md` Section 6), documented the four distinct media access tiers, recorded the Owner's decision that Annotated PDF Export is a Free capability and specified removal of only its two VIP UI locks while retaining VIP gates on designated premium tools, gated idle PDF annotation cloud sync on empirical measurements, and restricted Supabase preflight checks for `dszjmgzzqpdrdjkycvht` to read-only inspection without recommending blanket `supabase/schema.sql` execution.

---

## SECTION A — Complete Finding Traceability Matrix & Corrections

### A.1 Original Phase 5.0.2 Audit Findings (`F-01` through `F-15`) — IDs and Audit Meaning Retained

Every finding below maps to the corresponding row in the Phase 5.0.2 audit report (`reports/phases/phase-5-storage-sync-audit/gemini-report.md:389–406`). Original audit source pointers are preserved as reported; numeric line references must be re-anchored to the pinned source blob before implementation.

| Finding ID | Exact Phase 5.0.2 Audit Title & Summary (`gemini-report.md`) | Phase 5.0.2 Status & Severity | Audit Source Pointers (re-anchor before implementation) | PhaseDisposition | Phase 5.1 Work Package & Milestone | Target Regression Test File(s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`F-01`** | **Live Supabase database schema state is unverified** (repository migrations `20261103133622`–`20261103160000` have not been applied to live project `dszjmgzzqpdrdjkycvht`; RPC failures in the current sync path throw without a direct-upsert fallback and retain dirty local state). The actual repository RPC is `public.sync_workspace_with_concurrency(jsonb, integer)`; earlier draft RPC naming/arity was incorrect. | `Unknown / Owner-Side Verification Required` (`Unverified Deployment Gate`) | `index.html:26745`, `29799–29831`, `29890–29908`, `30094`, `30175`; `supabase/migrations/20261103133622` to `20261103160000` | **Phase 5.1** (`WP-8` Read-Only Preflight + Client Actionable Diagnostics) | `WP-8` / Milestone `M6` | `test_phase4_2_postgres_integration.js`, `test_phase4_2_1_pg16_concurrency.js`, `test_phase4_regressions.js` |
| **`F-02`** | **Zero UI call sites for `recordTombstone()` and `deleteMediaFromDB()`** (deleting subjects, groups, lectures, schedule events, or backlog tasks never records tombstones—causing cloud resurrection on conflict merge—and never deletes local IndexedDB `pdfs`, `audios`, `rec_*`, or `annotations`—causing permanent storage bloat). | `Confirmed` (Local & Tombstones) / `Unverified` (Remote Drive Policy) (`P1 High`) | `index.html:11844`, `12465`, `12585`, `15602`, `15609`, `15867`, `17794`, `19913`, `29404`, `29407` | **Phase 5.1** (Local IDB cascade + Tombstones); Remote Drive deletion explicitly out-of-scope / owner-gated | `WP-2` / Milestone `M2` | `test_phase4_regressions.js`, `test_phase4_1_chromium_e2e.js` |
| **`F-03`** | **`syncWorkspaceOnLogin()` and `pullWorkspaceFromCloud()` unconditionally overwrite local dirty state** (`pharmaWorkspaceDirty === '1'` or `dirtyAnnotationsForCloud === true`) via `applyCloudWorkspacePayload()`, which also clears `pharmaWorkspaceDirty` at line `30065`. | `Confirmed` (`P1 High`) | `index.html:29934–30081`, `30065`, `30083–30121`, `30167–30201` | **Phase 5.1** | `WP-6` / Milestone `M5` | `test_phase4_regressions.js`, `test_phase4_1_chromium_e2e.js` |
| **`F-04`** | **Additive-only annotation stroke union (`mergeAndApplyCloudConflict()`) resurrects erased, undone, or cleared ink strokes and deleted floating text notes** because no shared ancestor or per-stroke/per-page deletion tombstone exists. | `Confirmed` (`P1 High`) | `index.html:23951`, `24044`, `24137`, `24185`, `24611`, `24661`, `24700`, `29416–29520` | **Phase 5.1** | `WP-4` / Milestone `M4` | `test_phase4_regressions.js`, `test_phase4_1_chromium_e2e.js` |
| **`F-05`** | **Conditional cloud annotation sync + unconditional `localStorage['pharmaAccountWorkspace_<uid>']` annotation reserialization** creates `localStorage` quota exhaustion (`QuotaExceededError`) and JSONB write-amplification risk as annotation history grows. | `Risk — Measurements Required` (`P2 Medium-High`) | `index.html:29019–29059`, `29718–29788` | **Phase 5.1** (Stop duplicating full `annotations` inside `localStorage` backup key + measured gate for PDF idle sync) & **Phase 5.3** (Delta table) | `WP-5` / Milestone `M5` | `test_phase4_regressions.js`, `test_phase4_1_chromium_e2e.js` |
| **`F-06`** | **Google Drive OAuth2 token persistence in `localStorage['exo_gdrive_token']`, no refresh token in GIS implicit flow, `401` retry bypassed when `interactive = false` (`downloadMediaFromCloudAccount`), and `drive.readonly` vs. `drive.file` scope trade-offs.** | `Confirmed` (`P1 High`) | `index.html:12543`, `21331`, `21382`, `27288`, `27452`, `27460–27608`, `28364`, `28395–28404`, `28809`, `28819` | **Deferred to Phase 5.2** (Google Drive OAuth & Media Pipeline Phase) | Deferred (`Phase 5.2`) | N/A in Phase 5.1 (Existing behaviour preserved untouched) |
| **`F-07`** | **Secondary lecture audio recordings (`lec.recordings[]` with `rec_<timestamp>` keys) are stored in local IndexedDB `audios` (`21506`) but omitted from cloud media upload/download sync (`28528–28820`).** | `Confirmed` (`P2 Medium`) | `index.html:21496–21566`, `28528`, `28576`, `28667`, `28816` | **Deferred to Phase 5.2** (Cloud Drive sync for `rec_*`); **Local delete cleanup included in Phase 5.1 (`WP-2`)** | Local cleanup in `WP-2` (`M2`); Drive sync in `Phase 5.2` | `test_phase4_regressions.js` (local `rec_*` cascade cleanup on lecture delete) |
| **`F-08`** | **Google Drive file replacement (`forceReplace` ignored, always `POST`s new Drive file), non-persisted resumable `uploadUrl` across reloads, and display-name folder splitting on subject/group rename.** | `Confirmed` (`P2 Medium`) | `index.html:12575–12576`, `27739–27790`, `27972–28094`, `28181–28346` | **Deferred to Phase 5.2** | Deferred (`Phase 5.2`) | N/A in Phase 5.1 |
| **`F-09`** | **Incomplete manual JSON backup/restore (`exportData` / `importData`)** omits IndexedDB `annotations`, `weeklyReports`, `plannerPrefs`, `completedAcademyModules`, `cloudMediaRegistry`, and `_tombstones`; enforces a 15 MB file cap; and fails to mark workspace dirty if `data.schedule` is absent. | `Confirmed` (`P2 Medium`) | `index.html:19051–19118` | **Phase 5.1** (Tier A Complete Workspace State + Annotations JSON Backup & Crash-Recoverable Import Journal); **Phase 5.2/5.3** (Tier B Full Media ZIP) | `WP-7` / Milestone `M6` | `test_phase4_regressions.js`, `test_phase4_1_chromium_e2e.js` |
| **`F-10`** | **Google Drive `/preview` iframe fallback on download failure (`openLectureDocument`)** bypasses Exo Studio ink, extra note sheets, and audio pins without an in-viewer re-auth/retry banner. | `Confirmed` (`P2 Medium`) | `index.html:21374–21403` | **Deferred to Phase 5.2** | Deferred (`Phase 5.2`) | N/A in Phase 5.1 |
| **`F-11`** | **Unbounded full-store `store.getAll()` IndexedDB scans (`refreshLocalMediaCache`, `getAllAnnotationsMapFromDB`), 20-entry FIFO `sessionMediaBlobRamCache` without byte budget or read-path eviction, and unused `clearAllIndexedDBStores()`.** | `Confirmed` (`P3 Low`) | `index.html:19625–19675`, `19694`, `20028–20034`, `20072`, `20113–20115`, `29166` | **Deferred to Phase 5.3** | Deferred (`Phase 5.3`) | N/A in Phase 5.1 |
| **`F-12`** | **`handleCloudSignOut()` leaves unscoped global `localStorage` keys populated**, causing page reload while logged out to re-hydrate the signed-out user's private workspace into the logged-out UI. | `Confirmed` (`P2 Medium`) | `index.html:11256`, `13042`, `25586`, `26334`, `29019–29125` | **Phase 5.1** | `WP-1` / Milestone `M1` | `test_phase3_cross_account_isolation.js`, `test_phase4_1_chromium_e2e.js` |
| **`F-13`** | **`mergeAndApplyCloudConflict()` updates `scheduleEvents` and `scheduleBacklog` in memory without immediately writing global `pharmaScheduleV4` or `pharmaScheduleBacklogV1`**, relying on the delayed `1,200ms` `pushWorkspaceToCloud()` timer to write `pharmaAccountWorkspace_<uid>` and leaving global boot keys stale on reload. | `Confirmed` (`P2 Medium-High`) | `index.html:13042–13107`, `29574–29609`, `29644–29651`, `29779–29788` | **Phase 5.1** | `WP-1` / Milestone `M1` | `test_phase4_regressions.js`, `test_phase4_1_chromium_e2e.js` |
| **`F-14`** | **Unstamped `_updatedAt` fields and hardcoded local/remote merge precedence in `mergeAndApplyCloudConflict()`** (remote subject/group scalars and schedule events always win; local lectures, backlog, reports, and logs always win; no clock-skew-resilient versioning). | `Confirmed` (`P1 High`) | `index.html:29527–29624` | **Phase 5.1** | `WP-3` / Milestone `M3` | `test_phase4_regressions.js`, `test_phase4_1_chromium_e2e.js` |
| **`F-15`** | **Brand-new account branch of `syncWorkspaceOnLogin()` omits `academy_progress`** when calling `applyCloudWorkspacePayload()`, wiping pre-login `completedAcademyModules` and `localStorage['pharmaAcademyProgressV1']` to `[]`. | `Confirmed` (`P2 Medium`) | `index.html:30040`, `30201–30216` | **Phase 5.1** | `WP-1` / Milestone `M1` | `test_phase4_regressions.js`, `test_phase4_1_chromium_e2e.js` |

---

### A.2 Additional Technical Findings Identified During Phase 5.1 Design (`N-01` through `N-04`)

To maintain strict traceability without altering `F-01`–`F-15`, additional sub-defects discovered while designing the Phase 5.1 fixes are assigned `N-*` identifiers and linked to their parent `F-*` findings:

| New ID | Linked Parent Finding | Technical Description & Source Pointers (re-anchor before implementation) | Severity | Phase 5.1 Work Package & Milestone |
| :--- | :--- | :--- | :--- | :--- |
| **`N-01`** | `F-02`, `F-04`, `F-14` | **Additional Un-Tombstoned Deletion & Page-Level Mutation Paths:**<br>1. `executeClearSchedule(mode)` (`index.html:15744–15758`) bulk-deletes `scheduleEvents` (`'completed'` or `'all'`) without recording `events` tombstones.<br>2. `deleteContinuousSubjectWirdLog(subId, logId)` (`index.html:12413–12420`) removes entries from `sub.wirdLogs` without recording a sub-entity tombstone (`wird_logs`).<br>3. `deleteOrHidePageFromLecture()` (`index.html:21643–21660`) and `restoreDeletedPage()` (`index.html:21662–21677`) mutate `annotations['__exo_excluded_pages__']` (`20560–20600`) without causal version metadata.<br>4. `clearExtraNotePage(pageNum)` (`index.html:25241–25253`) clears ink on extra note sheets (`extra_<id>`, lines `20512–20545`) without recording a page clear barrier.<br>5. `deleteAudioPin(event, pageNum, pinId)` (`index.html:25087–25095`) splices pins from `annotations['__exo_audio_pins__'][pageNum]` (`20670–20695`) without recording a pin tombstone. | `P2 Medium` | `WP-2` (`M2`) & `WP-4` (`M4`) |
| **`N-02`** | `F-04`, `F-05` | **512-Sample Stride Blind Spot in `computeFastStringSignature(str)` (`index.html:29658–29668`):**<br>`computeFastStringSignature` samples at most 512 characters (`const step = Math.max(1, Math.floor(len / 512))`). For serialized annotation JSON exceeding `512` bytes (e.g., `50 KB`, where `step = 97`), an in-place modification of equal character length (such as changing a 7-char stroke color `#ef4444` to `#38bdf8` or editing a floating text note without changing string length) that falls between sampled indices produces the exact same signature (`currentSig === lastUploadedAnnotationsSignature` at `29769`), skipping cloud annotation upload when `dirtyAnnotationsForCloud` is false. | `P2 Medium` | `WP-5` (`M5`) |
| **`N-03`** | `F-05` | **Open-Modal Cloud Sync Suppression vs. Local Flush Boundary (`index.html:20349–20355`, `29718–29723`):**<br>While `#pdfViewerModalOverlay` is open (`isPdfModalOpenNow === true` at `29718`), `pushWorkspaceToCloud()` suppresses `shouldSendAnnotations` (`29719–29723`) until `closePdfViewer()` (`25541`), `visibilitychange -> hidden` (`30284`), or manual force sync. Note: The source registers best-effort `pagehide` and `beforeunload` callbacks that attempt `flushPendingAnnotationsSave(false)` at `index.html:20349–20355`; these callbacks are not a hard durability guarantee. Normal writes must await successful IndexedDB transactions. Whether to add a long-interval idle cloud flush while PDF Studio remains open requires empirical payload and RPC latency measurement before implementation. | `P2 Medium (Measurement-Gated)` | `WP-5` (`M5` — Measurement-Gated) |
| **`N-04`** | `GEMINI.md §6` (Free vs. VIP Policy) | **Annotated PDF Export Has an Inconsistent VIP UI Lock:**<br>`exportAnnotatedSlides()` (`25360–25539`) is Free and has no VIP guard, consistent with the Owner's decision. The toolbar button `#pdfToolbarExportPdfBtn` (`7533`) and mobile menu button `#pdfMenuExportPdfBtn` (`7580`) are nevertheless given VIP lock styling by `syncExtraNoteButtonsLockUI()` (`25124–25139`). The mismatch is a UI entitlement defect, not a reason to gate the export function. | `Owner Decision: FREE` | `WP-9` / UI-only correction: remove these two export buttons from the VIP lock list; add Free-user E2E coverage. Do not change `exportAnnotatedSlides()` or gate core annotation persistence. |

---

### A.3 Explicit Correction of Previously Stated Source Inaccuracies

To ensure zero ambiguity for reviewers and implementers, the following facts have been verified directly against `index.html`:

1. **Google Drive Upload Architecture (`index.html:27792–28346`):**
   - The active upload transport is `uploadBlobToGoogleDriveViaXHR(blob, fileName, mimeType, folderId, onProgress, mediaId, appProperties)` (`index.html:27972–28094`), invoked by `uploadMediaToCloudAccount(storeName, lectureObj, explicitBlob, onProgress, queueMeta)` (`index.html:28181–28346`).
   - It uses the **Google Drive v3 Resumable Upload protocol**: step 1 initiates a session via `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink,webContentLink,size,mimeType,appProperties` (`27986–28014`), and step 2 streams the binary `Blob` via `xhr.open('PUT', uploadUrl, true)` (`28033`).
   - The active root folder name is `'Exo_Workspace'` (`ensureExoFolderInGoogleDrive` at `index.html:27792–27858`, specifically lines `27808` and `27830`), with nested subject and group subfolders `'Exo_Workspace/<SubjectName>/<GroupName>'` resolved via `ensureSubfolderInGoogleDrive()` (`27739–27790`, called at `28251–28260`).
   - Uploaded files are **private by default**: lines `28295–28297` explicitly confirm:
     `// Privacy & Security Fix: Uploaded files remain private to the user's account by default. Automatic public link-sharing ('anyone') is completely disabled to prevent unauthorized exposure.`
2. **Existing Local Lifecycle Flush Listeners (`index.html:20349–20355`):**
   - `index.html` already registers `window.addEventListener('pagehide', () => { flushPendingAnnotationsSave(false); })` (`20349–20351`) and `window.addEventListener('beforeunload', () => { flushPendingAnnotationsSave(false); })` (`20353–20355`), which flush active PDF annotations to local IndexedDB (`annotations` + `annotation_recovery_vault`). Phase 5.1 preserves these listeners intact.

---

## SECTION B — Causal Conflict Resolution Protocol (No Wall-Clock or Global-Revision Causality)

### B.1 Non-Negotiable Invariants

1. `Date.now()`, `_updatedAt`, and wall-clock timestamps are display/diagnostic values only. They never select a winner.
2. `user_workspaces.revision` is an account-row optimistic-concurrency token used by the RPC to serialize writes and detect stale payloads. It is **not** proof that one particular field or annotation operation causally follows another.
3. A dirty flag is transport state ("this operation has not been acknowledged by the server"), not causal ancestry.
4. A Lamport scalar orders events consistently but does not, by itself, prove whether two events are causally related or concurrent.
5. Causal-vs-concurrent decisions require explicit operation identity and causal context for the exact merge scope.
6. An operation acknowledged by a successful cloud push is not the same as every operation that happens to be dirty when the response arrives. Only operations included in the exact sent snapshot may be marked committed.

### B.2 Per-Scope Dotted Version + Causal Context

Use a version record for each conflict scope (a mutable entity, a particular entity field, or an annotation page/pin scope). The metadata must make the scope explicit:

```javascript
version = {
  scopeId: "lecture:lec_101:field:name",
  dot: {
    actorId: "tab_<random-128-bit-id>",  // unique per live document/tab
    actorCounter: 4,                    // monotonic within this actor + scope
    deviceId: "dev_<installation-id>",  // stable installation identity
    operationId: "<random-128-bit-id>",  // unique for this mutation
    lamport: 42                         // tie-break aid, not causal proof
  },
  context: {
    "tab_actor_A": 3,
    "tab_actor_B": 1
  },
  committedWorkspaceRevision: 21,       // transport acknowledgement only; null while unacknowledged
  dirty: true
};
```

- A new top-level document/tab gets a fresh random `actorId`; two tabs on the same installation may share `deviceId`, but must never share an actor ID or actor counter. Do not persist/reuse a tab actor ID across independently opened documents. A BFCache-restored same document may retain its in-memory actor.
- Counters are scoped to the same merge object (for example, one entity or one annotation page), not one installation-wide counter reused across unrelated objects. This prevents an operation on an unrelated field/entity from being mistaken as evidence that a particular field operation was observed.
- Each mutation receives a cryptographically random `operationId` (for example `crypto.randomUUID()` where supported, with a CSPRNG-backed fallback). Never derive operation identity solely from a content hash.
- Within one document, increment `actorCounter` synchronously for each operation in the same scope. Because each tab has a distinct actor ID, simultaneous writes from two tabs cannot reuse the same dot.
- When editing a scope, the new operation's `context` is the merged causal context of the exact scope version(s) the editor has actually observed. The operation then adds its own actor dot.
- On observing a remote operation for that scope, merge its context and advance the local Lamport value to at least the maximum observed Lamport value before producing a later operation.
- Use the installation `deviceId` for installation identity/diagnostics, not as the sole actor identity or sole tie-breaker for same-installation tabs.

### B.3 Exact Causal Comparison and Deterministic Concurrent Tie-Breaking

For two operations A and B in the same scope:

- A happens-before B only when `B.context[A.dot.actorId] >= A.dot.actorCounter`.
- B happens-before A only when `A.context[B.dot.actorId] >= B.dot.actorCounter`.
- If neither context contains the other's dot, the operations are concurrent.
- If both refer to the same `operationId`, they are the same operation and must be idempotently deduplicated.
- If A causally precedes B, B wins. If B causally precedes A, A wins.
- Only for concurrent operations, choose a deterministic winner by lexicographically comparing the normalized tuple `(lamport, deviceId, actorId, operationId)`. Preserve the losing value and its operation metadata in a bounded, account-scoped conflict-recovery log so a user can inspect or restore it.
- Merge causal contexts by taking the maximum counter for each actor **within the same scope**. Do not discard causal context entries merely because a device has not been seen recently.
- `committedWorkspaceRevision` is set only as a server acknowledgement for an operation included in the accepted payload. It is not part of the happens-before test.

The causal context, not `committedWorkspaceRevision`, is the evidence that separates causality from concurrency. The server revision remains useful for the OCC request and for recording when an operation was accepted by the server.

### B.4 Cross-Tab, Multi-Device, and Push-Acknowledgement Rules

1. **Two tabs on the same browser profile:** each tab has a distinct `actorId`; simultaneous edits therefore create distinct dots even when `deviceId` is shared. Test with two Playwright pages in the same browser context, not only two isolated browser contexts.
2. **Two independent devices:** each uses its own device/actor identities. A device that has not observed another operation cannot claim a causal relationship with it.
3. **No scalar localStorage Lamport allocator:** do not depend on read-increment-write in `localStorage` as an atomic cross-tab counter. Per-scope actor counters are tab-local; operation IDs prevent identity collisions. If a shared counter is ever introduced, allocation must be serialized with a real cross-tab atomic primitive and tested under simultaneous writes.
4. **Snapshot the exact outgoing operation set:** before a push, capture the serialized payload and the operation IDs/dots included in it. When the OCC RPC succeeds, mark only those captured operations acknowledged at the returned server revision. Edits made after payload capture remain dirty and must be pushed later. Do not call a broad `markAllDirtyFieldsCommitted()` that clears operations created after the sent snapshot.
5. **OCC conflict retry:** fetch the current row, merge using operation causal contexts, build a new immutable outgoing snapshot, and retry with the returned server revision. Repeated retries must not create new operation IDs or increment counters merely because a merge was replayed.
6. **Idempotency test:** replaying the same operation set twice must not duplicate entities, strokes, tombstones, or conflict-log entries. Merge order permutations must converge to the same state for the same set of operations.

### B.5 Delete-vs-Update, Restore, and Legacy Data

- Entity deletion is itself a versioned operation with `dot`, `context`, `operationId`, `dirty`, and server-ack metadata. Do not compare its `lc` or row revision alone with an entity update.
- If the delete causally follows the last entity update it observed, deletion wins.
- If an update causally follows the delete (the editor explicitly observed the deletion state and performed a restore/recreate action), the new operation may supersede the tombstone.
- If delete and update are concurrent, apply an explicitly chosen **remove-wins** policy for the live entity while retaining the full losing entity snapshot and operation metadata in a recoverable conflict record. The user can explicitly restore it, creating a new operation whose causal context includes the tombstone. Do not silently discard the update.
- Distinguish restore/recreate from reusing an old entity ID. A restore must create a new version/generation that references the tombstone it supersedes.
- Legacy records without causal metadata have no provable causal ancestry. Do not fabricate certainty by assigning the current global revision to every field. Preserve the pre-migration snapshot, mark the record `legacyOpaque`, and use a conservative migration path: compare against the saved per-account ancestor snapshot where one is demonstrably available; otherwise preserve both conflicting candidates and require an explicit deterministic recovery/owner decision rather than silently overwriting either side.

### B.6 Worked Causality Cases (Independent of Clock Skew)

- **Different fields:** Device A edits `lecture.name`; Device B edits `lecture.status` without seeing A. The operations target distinct scopes, so both field values are retained.
- **Same field, causal edit:** Device B first receives A's field operation, then edits the same field. B's context contains A's dot, so B wins because it causally follows A—not because its wall clock or server revision is larger.
- **Same field, concurrent edit:** A and B both edit from contexts that do not include the other's dot. The deterministic concurrent tuple selects the same winner on all replicas, while the losing value remains recoverable.
- **Two tabs on one device:** Two tabs edit the same field without observing each other's operation. Their actor IDs differ, so they are correctly treated as concurrent even though their installation device ID is identical.
- **Clock skew:** Set system clocks to +1 hour and -1 hour. The result must be identical to the zero-skew case because wall-clock values are not read by the comparator.

### B.7 Verification Gate Before M3

M3 cannot be marked implemented or accepted until tests cover: causal-before/concurrent-after relations; two same-origin tabs; two independent devices; actor restart; duplicated delivery; reordered delivery; simultaneous edits of different and identical fields; delete-vs-update; explicit restore; legacy records without ancestry; in-flight push followed by a new local edit; and repeated OCC 409 retries. These are proposed tests, not existing passing tests.

## SECTION C — Tombstone Retention and Safe Deletion Semantics

### C.1 Phase 5.1 Default: Retain Indefinitely

- Entity tombstones in `schedule._tombstones`, stroke tombstones, page-clear barriers, excluded-page operations, and audio-pin tombstones are retained indefinitely in Phase 5.1.
- No automatic TTL, age-based, revision-count, storage-pressure, or background compaction is permitted in this phase.
- Local deletion and cloud deletion are separate actions. M2 may cascade-delete the current account's local IndexedDB blobs/annotations according to the verified ownership key; it must not delete remote Google Drive files.
- A deleted entity must remain absent when an old device reconnects, unless a user performs an explicit restore operation that creates a new causally linked version.

### C.2 Why a Scalar Lamport Acknowledgement Is Not a Safe Compaction Proof

The former `lastAckTombstoneLc` scalar is insufficient as a general proof that a device has observed every tombstone:
- Lamport values order operations but do not identify which operation(s) a device has actually received.
- A device may observe a high Lamport value from one operation without having received every unrelated tombstone with a lower value, unless the protocol additionally proves complete snapshot coverage and no omitted tombstones.
- `lastSeenWorkspaceRev` is a row-level OCC revision, not per-tombstone acknowledgement or causal ancestry.
- A device that is removed from a registry cannot be assumed permanently retired unless the product has an explicit owner-controlled retirement/recovery process and the client refuses unsafe stale restores.

Therefore Phase 5.1 must not implement or expose a purportedly verified `canCompactTombstoneSafely(T, registry)` predicate based only on `lastSeenWorkspaceRev` and `lastAckTombstoneLc`.

### C.3 Device Registry Is Diagnostic Only in Phase 5.1

The optional `schedule._deviceRegistry` may record:
- stable installation/device ID;
- last successful server revision observed;
- last successful sync time for UI/diagnostics only;
- client/app version and a user-visible device label.

These values help explain stale devices; they do **not** authorize tombstone deletion. Do not use last-seen timestamps as a compaction condition.

### C.4 Conditions for Any Future Compaction

Tombstone compaction is deferred to a separately reviewed phase. A future proposal must prove all of the following before deleting any tombstone:
1. Every operation/tombstone has a stable unique operation ID and causal identity.
2. Every non-retired active actor/device has acknowledged a server snapshot that is proven to contain that exact tombstone or a durable deletion summary that subsumes it.
3. The server-side snapshot/ack protocol cannot skip tombstones through partial payloads, field omission, or stale merge.
4. Device retirement is an explicit, owner-controlled action with a clear warning that an offline device may no longer restore unsynced data.
5. A client below the retirement floor is blocked from blindly merging stale state; it must perform a safe re-bootstrap or explicit recovery.
6. The protocol is tested with long-offline devices, lost devices, reinstalls, browser storage clearing, partial sync, and concurrent delete/restore.

Until this is designed, reviewed, and tested, the only approved behavior is indefinite retention.

### C.5 Required Deletion Tests

Tombstone tests must include an old device reconnecting after 180 days and after many workspace revisions; two tabs deleting/updating the same entity; delete-vs-restore; duplicate delivery; missing/partial device registry; lost device; and local-only cleanup failure. Assertions must prove no stale entity, stroke, page, pin, or recording is resurrected.

## SECTION D — Crash-Recoverable Backup & Restore Architecture (`F-09`)

### D.1 Honest Separation of Backup Tiers (`Tier A` vs. `Tier B`)

Per `GEMINI.md` Section 5 & Section 6, backup/restore is a **Free** baseline data-protection feature (`can_upload_media` is never required). We explicitly distinguish:

1. **Tier A — Complete Workspace State & Annotations JSON Backup (Phase 5.1 Scope — `schema: 'exo_workspace_backup_v4'`):**
   - Exports and imports **100% of structured academic state and vector ink/annotation data**:
     - `subjects` (including groups, lectures, `wirdLogs`, `recordings` metadata, `_meta`)
     - `logs` (`studyLogs`)
     - `schedule` (`events`, `backlog`, `weeklyReports`, `plannerPrefs`, `academyProgress`, `cloudMediaRegistry`, `_tombstones`, `_deviceRegistry`, `_syncClock`)
     - `annotations` (all account-scoped records from IndexedDB `WorkspaceMediaStore.annotations`, including vector ink strokes, floating text notes, extra note sheets `extra_*`, `__exo_excluded_pages__`, `__exo_audio_pins__`, `_deletedStrokes`, `_clearedAt`, `_deletedPins`)
   - **What Tier A Does NOT Contain:** Raw binary PDF files (`WorkspaceMediaStore.pdfs`) and raw binary audio recordings (`WorkspaceMediaStore.audios`), which can total `500 MB – 5 GB` and cannot be practically embedded inside a single JSON string. Tier A preserves `cloudMediaRegistry` and lecture Drive metadata (`driveId`, `audioDriveId`, `pdfFileName`, `audioFileName`, `recordings[]`) so cloud-linked media remains linked.
2. **Tier B — Full Binary Media Archive (`pdfs` + `audios` + `Tier A JSON` streamed ZIP/TAR bundle — Phase 5.2 / 5.3 Scope):**
   - Streamed multi-blob archive packaging binary `pdfs` and `audios` blobs alongside `workspace.json`. Explicitly deferred to Phase 5.2/5.3 and clearly labeled in the UI so users know Tier A backs up all academic data, schedules, and handwritten PDF annotations/notes, while binary PDF/audio files must remain in local storage or Google Drive.

### D.2 Why `localStorage` + IndexedDB Cannot Be "Atomic" & How the Crash-Recoverable Import Journal Works

Browser storage provides **no cross-engine transaction** spanning `window.localStorage` (synchronous key-value storage) and `window.indexedDB` (asynchronous transactional object stores). If the tab crashes, is closed by the user, or hits `QuotaExceededError` after `localStorage` is updated but before IndexedDB transactions commit (or vice versa), a naive "two-phase" function leaves the workspace split across two incompatible states.

To make backup import **provably crash-recoverable across page reloads, tab crashes, and storage failures**, Phase 5.1 implements a **Persistent Write-Ahead Import Recovery Journal**:

#### 1. Explicit User Choice Between `Replace Mode` and `Merge Mode`
- `importData(input)` (`index.html:19072`) no longer silently overwrites the workspace.
- After parsing and validating the backup file in memory, Exo opens a dedicated **Backup Import Confirmation Modal** showing:
  - Backup schema version (`v1`–`v4`), export timestamp, subject/lecture/event/annotation counts, and SHA-256 verification status.
  - Two explicit user-selectable radio modes (neither executes without confirmation):
    1. **`Merge with Current Workspace (Recommended — Non-Destructive)`:** Merges imported subjects, groups, lectures, schedule events, backlog, logs, and annotations with current local state using the **verified Milestone M3/M4/M5 causal conflict engine** (`mergeAndApplyCloudConflict` / `mergeAnnotationsPayloadsWithTombstones`). *Architectural Gate:* Merge Mode calls the new deterministic M3/M4 merger and is implemented in Milestone `M6` **after** `M3` and `M4` are verified.
    2. **`Replace Current Workspace (Full Restore)`:** Replaces current workspace state for the active account with the backup payload after staging a full rollback snapshot in the Import Recovery Journal.

#### 2. Durable Import Journal and Five-Stage State Machine

**The IndexedDB journal is the recovery source of truth.** The `localStorage` pointer is only a fast hint; startup recovery must not depend on it being present.

The journal is stored in `WorkspaceMediaStore.annotation_recovery_vault` under an account-scoped reserved key such as `usr_<sanitizedUid>::__import_journal_v1__`. Before implementation, inspect the actual object-store keyPath/schema and use a compatible key; do not assume `put(value, key)` is valid without checking the existing store definition.

The transaction captures:
- `txId`, authenticated `uid`, chosen mode, schema version, creation time, and a monotonically advancing journal phase;
- exact pre-import values for every Exo-managed localStorage key that may be written or removed, represented as `{ key, existed, rawValue }` so absence is distinguishable from an empty string;
- exact pre-import records/keys from every IndexedDB store that the import will mutate, including account-scoped annotations and any metadata/tombstone records;
- the target localStorage key set and target IndexedDB record set;
- the list of keys to delete in Replace Mode (managed keys absent from the backup);
- the backup digest result and a manifest of the data counts/ownership checks.

**Stage 1 — PREPARE / JOURNAL_STAGED**
1. Parse and structurally validate the backup, verify the mandatory v4 SHA-256 digest, validate account scoping, and let the user choose Replace or Merge.
2. Build the complete target state without mutating current user data.
3. Pause cloud pushes and set a session operation barrier.
4. In a durable IndexedDB transaction, persist the complete rollback journal and wait for `transaction.oncomplete`. If this journal write fails (including quota exhaustion), abort the import before changing any application state.
5. Only after the journal is committed, write the optional `localStorage['pharmaImportTxState_<uid>']` pointer. If that pointer write fails, the journal remains discoverable by startup scan.

**Stage 2 — APPLY_IDB**
- In one IndexedDB readwrite transaction covering every affected store plus the journal store, apply the target annotations/records and update the journal phase.
- Replace Mode deletes only Exo-managed account-scoped keys absent from the target manifest; it must not clear unrelated accounts or unrelated origin data.
- The journal phase and annotation writes must commit in the same IndexedDB transaction. If the transaction aborts, the previous annotation state remains authoritative.

**Stage 3 — APPLY_LOCALSTORAGE**
- Apply the target values for all managed localStorage keys.
- In Replace Mode, remove each managed workspace key that is absent from the target manifest; writing only present keys would leave stale values behind.
- Keep the journal intact throughout this non-transactional sequence. Record both present and absent pre-import keys so a partial write can be reversed exactly.
- Do not enable cloud sync or expose a partially imported workspace to another account/session.

**Stage 4 — COMMITTED**
- Only after Stage 2 and every Stage 3 localStorage write/removal has completed successfully, persist the `COMMITTED` marker in the IndexedDB journal and wait for transaction completion.
- This is the logical commit point. A crash before this marker causes rollback; a crash after it causes recovery to finish cleanup rather than undo the completed import.

**Stage 5 — FINALIZE / CLEANUP**
1. Remove the localStorage status pointer.
2. Delete the committed journal record in a durable IndexedDB transaction.
3. Re-hydrate application state, clear the operation barrier, and schedule cloud sync only after all recovery/finalization checks pass.
4. If the process crashes after the pointer is removed but before journal deletion, startup sees the committed IndexedDB journal and finishes cleanup.

#### 3. Startup Recovery, Account Isolation, and Failure Handling

- Run recovery before workspace hydration, `syncWorkspaceOnLogin()`, any cloud pull/push, and any UI path that can overwrite local data.
- On startup, scan the recovery vault for pending import journal records for the authenticated UID **even when the localStorage pointer is missing**. The pointer may accelerate lookup but is not authoritative.
- Never trust `accountScopeHint` in the imported backup as the authenticated UID. Bind journal and writes to the UID from the active authenticated session.
- If a different account is active, do not replay another UID's journal into the current workspace. Keep it pending for that UID and block unsafe sync for the affected account until recovery can run under the matching identity.
- If a journal exists without a pointer, recover from the journal. If a pointer exists but its journal is missing or corrupt, do not assume the workspace is safe: quarantine cloud pushes and present a recovery/error path.
- **Crash before journal commit:** no application data was changed; abort safely.
- **Crash after journal commit but before IDB apply:** roll back/clear the prepared transaction after verifying that target writes never began.
- **Crash during Stage 2:** the annotation writes and phase update share one IDB transaction, so either both commit or neither does. If the transaction aborts, the previous annotation state remains authoritative.
- **Crash during Stage 3:** restore all captured localStorage key/value/existence states and the full pre-import IndexedDB snapshot from the still-present journal.
- **Crash after Stage 4 COMMITTED:** do not roll back; complete Stage 5 cleanup.
- If rollback fails, retain the journal, persist `ROLLBACK_FAILED_QUARANTINE` in IndexedDB, set a localStorage pointer as an additional hint, and block automatic cloud push on every startup until the user retries recovery or exports the preserved pre-import snapshot. An in-memory flag alone is not sufficient.
- Rollback itself must be idempotent. Do not delete the journal or pre-import snapshot until successful rollback is durably confirmed.
- Before journaling, estimate required storage and ensure the full rollback snapshot can be written. If quota prevents durable journaling, do not start import or partially apply data.
- Keep backups account-scoped and validate every IndexedDB key prefix. A rollback or import must never write `usr_A::` records while UID B is active.

**Merge Mode Gate:** Merge Mode remains unavailable until the causal entity merger (M3), annotation merger (M4), and dirty-state reconciliation (M5) have passed their required tests. Until then, offer Replace only with a full recoverable snapshot, or defer import; never call the current known-unsafe `mergeAndApplyCloudConflict()` as a substitute.

### D.3 Canonical `v4` Digest Specification (One-Shot Web Crypto `SHA-256`, Zero Duplicate Root Keys, Zero FNV-1a Substitution)

1. **No Duplicate Root Aliases in `v4` Export Payload:**
   - A `v4` backup file has the following strict structure (storing payload data **once** under `data`—never duplicating `subjects`/`schedule`/`logs` at the root):
     ```json
     {
       "schema": "exo_workspace_backup_v4",
       "version": 4,
       "exportedAt": "2026-11-05T09:00:00.000Z",
       "accountScopeHint": "usr_a1b2c3d4",
       "integrity": {
         "algorithm": "SHA-256",
         "canonicalScope": "data",
         "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
         "byteLength": 418290
       },
       "data": {
         "annotations": { ... },
         "logs": [ ... ],
         "schedule": { ... },
         "subjects": [ ... ]
       }
     }
     ```
   - **Backward Compatibility for Legacy `v1`–`v3` Files:**
     - `importData()` checks `const isV4 = (parsed && parsed.version === 4 && parsed.schema === 'exo_workspace_backup_v4');`.
     - If `isV4` is true, it reads exclusively from `parsed.data`.
     - If `parsed.version < 4` (or `parsed.version` is absent and root `parsed.subjects` / `parsed.schedule` exist), it treats the file as a legacy `v1`–`v3` backup (which predates `integrity.sha256`), displays a clear notice in the Import Confirmation Modal (`"Legacy Backup Format (v1–v3) — No SHA-256 checksum present"`), and normalizes entities via `normalizeEntityCausalMeta()`.
2. **One-Shot `crypto.subtle.digest('SHA-256', buffer)` Verification:**
   - Web Crypto's `crypto.subtle.digest('SHA-256', buffer)` is a **one-shot API** that accepts a single `ArrayBuffer` or `Uint8Array` (it does not support streaming `update()` chunks).
   - **Canonical Serialization (`canonicalizeBackupDataJson(dataObj)`):**
     - Recursively sorts object keys lexicographically (arrays preserve element order) and serializes `dataObj` into a canonical UTF-8 JSON string `canonicalDataStr`, then encodes it via `new TextEncoder().encode(canonicalDataStr)`.
   - **Verification Rule for `v4` Backups:**
     - On `v4` import, `integrity.algorithm === 'SHA-256'` and a 64-hex-character `integrity.sha256` are **mandatory**.
     - If `integrity` is missing, malformed, or `window.crypto?.subtle` is unavailable (or the computed SHA-256 hex digest does not match `integrity.sha256`), **`v4` import is rejected before Stage 1 (`JOURNAL_STAGED`)**.
     - **No FNV-1a Fallback for Integrity:** FNV-1a is a non-cryptographic hash with a 32/64-bit state space that has trivial collisions and is **never** used as a substitute for `SHA-256` in backup integrity verification.
     - **Security Scope Distinction:** Unkeyed `SHA-256` detects **accidental file truncation, bit rot, or encoding corruption**; it is not a MAC against an adversary who modifies both `data` and `integrity.sha256`. Hence `importData` still runs full structural schema validation and account-scope key sanitization (`toScopedKey(lecId, activeUid)`) on every imported record.

### D.4 Honest Memory Analysis & Empirical Measurement Plan for Backup Export/Import

- **Export Path (`exportData()`):** Canonical JSON serialization, UTF-8 encoding, one-shot `crypto.subtle.digest('SHA-256', bytes)`, and Blob creation can temporarily hold several representations of the payload. Do not publish a fixed peak-RAM multiplier without measuring the target browsers and payload shapes.
- **Import Path (`importData()`):** `JSON.parse(fileText)` materializes a complete JavaScript object graph synchronously. Chunked Blob reading alone does not make that parse streaming or eliminate the object graph.
- The existing source import limit is `15 MB` at the cited `importData()` location. Keep the current limit until empirical tests justify changing it. Do **not** claim a supported `50 MB` limit based on tests that only cover up to `15 MB`.
- M6 measurement must cover representative `1 MB`, `5 MB`, `15 MB`, `25 MB`, and `50 MB` files, including real annotation object shapes and IndexedDB journal snapshots. Record export duration, encode/digest duration, parse duration, peak heap, IDB write time, localStorage write/rollback time, and failure recovery.
- A larger cap can be proposed only after these measurements pass on supported low-end and desktop browsers and show that the full pre-import recovery journal fits within quota. Keep any cap increase as a separately reviewed change.

## SECTION E — Deterministic Legacy Stroke Identity & Annotation Tombstone Protocol (`F-04`, `N-01`)

### E.1 Why Pure Geometry Hashing Collides on Duplicate Identical Strokes

In `index.html:29416–29436`, `computeStrokeUniqueSignature(s)` builds a string from tool, color, size, text, and 2-decimal rounded coordinates (`Number(pt.x).toFixed(2)`).
If a legacy annotation page contains **two intentionally identical strokes**—for example:
- Two identical checkmarks or highlight bars stamped/copied at the same coordinates, or
- Two very short single-point taps within `0.004` normalized units that quantize to the same 2-decimal `.toFixed(2)` coordinate,

then a pure geometry hash `fnv1a64(computeStrokeUniqueSignature(s))` assigns **both strokes the exact same `st.id`**! If the user subsequently erases one of the two strokes, a tombstone keyed by that colliding ID would delete **both** strokes, and merging the page array by `st.id` would silently collapse the two strokes into one.

### E.2 Deterministic Legacy Stroke Identity With an Explicit Shared-Ancestor Requirement

1. **New strokes and floating text notes:** stamp a unique operation ID and causal version metadata at creation time. The ID must not be a geometry hash alone.
2. **Legacy strokes without `.id`:** a geometry signature at four-decimal precision plus an occurrence ordinal can provide a deterministic mapping only when both replicas start from the same immutable ordered legacy page snapshot.
3. Create a per-lecture/page legacy identity manifest once, from that verified common ancestor. Persist the mapping and never recompute IDs after assignment.
4. If two replicas have diverged, reordered the legacy array, or cannot prove a common ordered ancestor, geometry + occurrence ordinal does **not** prove that a particular duplicate stroke on one replica is the same duplicate on another. Preserve both candidate versions and require a safe conflict/recovery decision; do not silently map a deletion to an arbitrary duplicate.
5. The manifest migration must be idempotent, account-scoped, and covered by tests for byte-identical duplicate strokes, reordered arrays, one-side deletion, concurrent edits, and legacy data without an ancestor manifest.

**Identity limitation:** two fully identical legacy objects with no original IDs contain no intrinsic field that can distinguish their identities after independent reorderings. No hash or ordinal can recover information that was never stored. The implementation must expose this limitation rather than claim absolute zero collision across arbitrary divergent histories.

### E.3 Per-Page Stroke, Page-Clear, Excluded-Page, and Audio-Pin Causal Operations

Within each lecture's account-scoped annotation object `annotations[lecId]` (IndexedDB `WorkspaceMediaStore.annotations`, key scoped to `usr_<uid>::<lecId>`), every mutable annotation object and deletion must carry a version in the same causal model defined in Section B.

A representative version envelope:

```javascript
const version = {
  scopeId: "annotation:<lectureId>:page:<pageKey>",
  dot: {
    actorId: "tab_<random-id>",
    actorCounter: 12,
    deviceId: "dev_<installation-id>",
    operationId: "<random-operation-id>",
    lamport: 30
  },
  context: { "tab_actor_A": 11, "tab_actor_B": 4 },
  committedWorkspaceRevision: null,
  dirty: true
};
```

The example is illustrative. Generate a distinct operation ID for every mutation and capture causal context from the exact merge scope (lecture + page + target object); never reuse the same version instance for unrelated objects.

```javascript
annotations[lecId] = {
  "1": [
    { id: "st_<unique-id>", createdVersion: version, latestVersion: version, /* geometry and style */ }
  ],
  "extra_1730001": [ /* versioned extra-note strokes */ ],
  "__exo_extra_pages__": [ /* existing page descriptors */ ],
  "__exo_excluded_pages__": [ /* derived compatibility view */ ],
  "__exo_excluded_pages_meta__": {
    "3": { excluded: true, version: { /* unique causal operation version */ } }
  },
  "__exo_audio_pins__": { "1": [ /* active pins with per-pin version metadata */ ] },
  "_deletedStrokes": {
    "1": {
      "stroke_id": {
        operationId: "<delete-operation-id>",
        version: { /* causal delete operation version */ }
      }
    }
  },
  "_clearedAt": {
    "1": { version: { /* causal page-clear operation version */ } }
  },
  "_deletedPins": {
    "1": {
      "pin_id": {
        operationId: "<delete-operation-id>",
        version: { /* causal pin-delete operation version */ }
      }
    }
  }
};
```

#### Exact Wiring of Annotation Mutation and Deletion Paths

1. **Eraser (`eraseAtPoint`):** before removing a hit stroke, create a unique delete operation with a context derived from the latest version of that stroke/page scope and record it in `_deletedStrokes[pageKey][strokeId]`.
2. **Undo (`undoLastStroke`):** if undo removes a previously shared stroke, record a causal delete operation just like eraser. If the user redoes/restores it, create a new stroke version whose context includes the tombstone dot; do not merely remove the tombstone or bump a scalar Lamport field.
3. **Clear page / clear extra-note page:** create a page-clear operation with its own dot/context and store it in `_clearedAt[pageKey]`. Keep prior stroke versions recoverable until the merge result is durably saved.
4. **Floating text note deletion/edit:** use versioned operations for edits and deletion; resolve edits by causal context and concurrent tie-break, not by `updatedLc` or `createdLc` alone.
5. **Audio-pin deletion/edit:** store a versioned operation per pin; delete operations reference the exact pin ID and causal context.
6. **Lecture page hide/restore:** store `{ excluded, version }` under `__exo_excluded_pages_meta__[pageKey]`; rebuild the legacy `__exo_excluded_pages__` view from the merged versioned records. A restore must causally observe the prior exclusion operation.
7. These helpers must receive an operation/version produced at the mutation boundary (for example `recordStrokeTombstone(annotations, pageKey, strokeId, deleteVersion)`); do not have deletion helpers fabricate a causal context after the original object has already been removed.

#### Exact Annotation Page Merge Algorithm (`mergeLectureAnnotationsWithCausalVersions(localAnn, remoteAnn, mergeContext)`)

1. Normalize both annotation snapshots and apply the persisted legacy identity manifest only where a common ordered ancestor has been verified (Section E.2).
2. Union active objects and tombstone operations by stable `operationId`; duplicate delivery of the same operation is idempotent. Merge causal contexts within the same scope.
3. For each page, compare the latest active stroke version with its corresponding delete operation:
   - a delete causally following the stroke version removes it;
   - a restore causally following a delete keeps the restored version;
   - a concurrent edit/delete applies the documented remove-wins policy and preserves the losing version in the recoverable conflict log.
4. Treat a page-clear operation as a causal barrier in that page scope. Strokes observed by the clear are removed; causally later new strokes survive; concurrent stroke-vs-clear resolves remove-wins with the losing snapshot retained.
5. Apply equivalent comparisons to floating text, excluded-page state, extra-note pages, and audio pins. Do not use `lc`, `br`, `cr`, `createdLc`, or `updatedLc` alone to select a winner.
6. The merge function must be deterministic, idempotent under duplicate delivery, and independent of wall-clock time and global workspace revision ordering.

## SECTION F — End-to-End State Machines & Milestone Execution Order

### F.1 Dirty-State Login & Manual Pull Reconciliation State Machine (`F-03`, `F-15`)

Currently, `syncWorkspaceOnLogin()` (`index.html:30167–30201`) and `pullWorkspaceFromCloud()` (`30083–30121`) fetch `user_workspaces` and pass `data` directly into `applyCloudWorkspacePayload(data)` (`29934–30081`), which overwrites `subjects`, `scheduleEvents`, `scheduleBacklog`, `studyLogs`, and IndexedDB `annotations` and clears `pharmaWorkspaceDirty` at line `30065`.

Phase 5.1 replaces this with a **Dirty-Aware Login & Pull State Machine**:

```
[syncWorkspaceOnLogin(user) / pullWorkspaceFromCloud(force=false)]
  │
  ├─► Step 0: Run `recoverPendingImportJournalOnStartup(user.id)`
  │     (Ensures any interrupted backup import is rolled back before cloud sync runs)
  │
  ├─► Step 1: Inspect Local Dirty & Provenance State for `user.id`:
  │     `hasDirtyWorkspace = (localStorage.getItem('pharmaWorkspaceDirty') === '1')`
  │     `hasDirtyAnnotations = (dirtyAnnotationsForCloud === true)`
  │     `localOwnerUid = localStorage.getItem('pharmaLastActiveCloudUid')`
  │     `isSameOwnerOrVerifiedPreLogin = (localOwnerUid === user.id || (!localOwnerUid && hasVerifiedPreLoginGuestProvenance()))`
  │
  ├─► Step 2: Fetch Remote `user_workspaces` Row for `user.id`
  │
  ├───► Branch A: Remote Row EXISTS (`data !== null`)
  │       │
  │       ├─► Subcase A1: `(!hasDirtyWorkspace && !hasDirtyAnnotations) || !isSameOwnerOrVerifiedPreLogin`
  │       │     Clean fast-path pull: Call `applyCloudWorkspacePayload(data, { opCtx })`.
  │       │
  │       └─► Subcase A2: `(hasDirtyWorkspace || hasDirtyAnnotations) && isSameOwnerOrVerifiedPreLogin`
  │             DO NOT call `applyCloudWorkspacePayload(data)` directly!
  │             1. Flush any active in-memory PDF annotations to IndexedDB (`flushPendingAnnotationsSave(true)`).
  │             2. Reconcile dirty field metadata (`reconcileDirtyFieldMeta()`).
  │             3. Invoke `await mergeAndApplyCloudConflict(data, 0, opCtx)` (using Milestone M3/M4 causal field & stroke-tombstone merger).
  │             4. Persist merged state immediately to BOTH `pharmaAccountWorkspace_<uid>` AND global keys (`pharmaSubjectsV4`, `pharmaScheduleV4`, `pharmaScheduleBacklogV1`, etc.) (fixing `F-13`).
  │             5. Keep `pharmaWorkspaceDirty = '1'` until the subsequent `pushWorkspaceToCloud(true, 0, opCtx)` succeeds at Supabase and confirms `status === 'success'` (the return value in the checked-in RPC migration).
  │
  └───► Branch B: Remote Row DOES NOT EXIST (`!data`, Brand-New Cloud Account — `F-15` Fix)
          │
          ├─► Include `academy_progress: completedAcademyModules` in the initial payload passed to `applyCloudWorkspacePayload()` at `index.html:30203–30210` so pre-login `completedAcademyModules` is NEVER wiped to `[]` by line `30040`!
          └─► Push initial workspace to Supabase (`pushWorkspaceToCloud(true, 0, opCtx)`).
```

### F.2 Complete Sign-Out Global `localStorage` Sanitization State Machine (`F-12`)

In `handleCloudSignOut()` (`index.html:29019–29125`):
1. Flush pending annotations (`await flushPendingAnnotationsSave(false)`) and save the outgoing user's account-scoped metadata snapshot to `localStorage['pharmaAccountWorkspace_' + sanitizeForScopedKey(outgoingUid)]` (**excluding** the raw `annotations` map once `WP-5` decouples `annotations` from `localStorage`, preventing `QuotaExceededError` on sign-out).
2. Increment session generation barrier (`bumpAccountSessionGeneration('cloud_sign_out')`).
3. **Explicitly clear all unscoped global workspace keys from `localStorage`** before resetting in-memory arrays (`index.html:29104–29110`):
   - `localStorage.removeItem('pharmaSubjectsV4')`
   - `localStorage.removeItem('pharmaScheduleV4')`
   - `localStorage.removeItem('pharmaScheduleBacklogV1')`
   - `localStorage.removeItem('pharmaWeeklyReportsV1')`
   - `localStorage.removeItem('pharmaPlannerPrefsV1')`
   - `localStorage.removeItem('pharmaLogsV4')`
   - `localStorage.removeItem('pharmaAcademyProgressV1')`
   - `localStorage.removeItem('pharmaCloudMediaRegistryV1')`
   - `localStorage.removeItem('pharmaWorkspaceDirty')`
   - `localStorage.removeItem('pharmaLastActiveCloudUid')`
4. Reset in-memory state (`subjects = []`, `scheduleEvents = []`, `scheduleBacklog = []`, `weeklyReports = []`, `studyLogs = []`, `completedAcademyModules = []`, `cloudMediaRegistry = {}`, `annotations = {}`, `sessionMediaBlobRamCache.clear()`) and re-render. Reloading the page while logged out will now see an empty logged-out state with zero leakage of the previous user's data.

### F.3 Immediate Conflict-Merge Local Persistence (`F-13`)

Inside `mergeAndApplyCloudConflict()` (`index.html:29574–29635`):
- Immediately after computing the merged `subjects`, `scheduleEvents`, `scheduleBacklog`, `weeklyReports`, `plannerPrefs`, `studyLogs`, `completedAcademyModules`, `cloudMediaRegistry`, `_tombstones`, and `_deviceRegistry`:
  1. Synchronously call `saveToStorage(false)` and `saveScheduleState({ markDirty: false })` so `localStorage['pharmaSubjectsV4']`, `localStorage['pharmaScheduleV4']`, `localStorage['pharmaScheduleBacklogV1']`, `localStorage['pharmaWeeklyReportsV1']`, `localStorage['pharmaPlannerPrefsV1']`, `localStorage['pharmaLogsV4']`, `localStorage['pharmaAcademyProgressV1']`, and `localStorage['pharmaCloudMediaRegistryV1']` are updated **at `0 ms`**, eliminating the `1,200 ms` durability gap and ensuring `loadScheduleState()` (`13042–13107`) never reads stale pre-merge schedule data on reload.
  2. Synchronously update the per-account metadata vault `localStorage['pharmaAccountWorkspace_' + sanitizeForScopedKey(uid)]`.
  3. Set `localStorage.setItem('pharmaWorkspaceDirty', '1')` so that if the user closes the tab within the `1,200 ms` retry window before the OCC retry push completes, the next boot knows the merged local state still needs to be pushed to Supabase.

### F.4 Decoupling Full `annotations` From `localStorage`, Fixing Change Detection, and Measuring Idle Sync (`F-05`, `N-02`, `N-03`)

1. **Remove the full annotation payload from the per-account localStorage vault (`F-05`):**
   - Store structured workspace metadata and an explicit `annotationsStoredInIndexedDB: true` marker in `pharmaAccountWorkspace_<uid>`; do not serialize the full annotations map into localStorage.
   - Hydrate annotations asynchronously from the account-scoped IndexedDB store under the active UID and operation context.
   - Preserve a verified fallback/recovery path if IndexedDB is unavailable; do not silently treat missing annotations as an empty valid workspace.
   - Browser localStorage quota varies by browser, device, origin usage, and private-browsing mode. Do not state a universal quota or infer a specific failure threshold without measurement.
2. **Fix the 512-sample signature blind spot (`N-02`):**
   - A full-length non-cryptographic hash may be used as a cache/change-detection hint, but it is not collision-free and is not a security digest.
   - Correct dirty-state tracking must come from a monotonic mutation/version counter incremented on every stroke, text note, pin, page, undo, erase, and clear mutation path.
   - If any mutation path can bypass that counter, fix the path or compare the exact relevant version/data; a hash match alone must never prove that no edit occurred.
   - Remove unverified throughput claims. Measure scan/hash time on representative low-end and desktop devices during M5.
3. **Measurement-gated open-modal cloud sync (`N-03`):**
   - Do not add a periodic cloud upload while the PDF modal is open until payload size, RPC duration, failure/retry volume, and user-impact are measured.
   - The existing `pagehide`/`beforeunload` listeners are best-effort last-chance flushes, not a hard durability guarantee. Local durability must come from awaiting successful IndexedDB write transactions on mutation paths, not from relying on unload events.
   - Keep cloud pushes limited to the verified existing close/visibility/manual paths until measurements and a separate decision authorize more frequent synchronization.

### F.5 Re-Ordered Milestone Execution Plan (`M1` through `M6`)

Notice that the milestones are strictly ordered so **foundational persistence (`M1`), tombstones (`M2`), entity conflict resolution (`M3`), and stroke tombstones (`M4`) are built and verified BEFORE dirty-login merge (`M5`) and crash-recoverable backup Replace/Merge import (`M6`)** depend on them:

| Milestone | Work Packages | Findings Resolved | Dependencies | Gate Requirement Before Next Milestone |
| :--- | :--- | :--- | :--- | :--- |
| **`M1`** | **`WP-1`:** Immediate conflict-merge `localStorage` persistence (`F-13`), sign-out global `localStorage` sanitization (`F-12`), and brand-new account login `academy_progress` preservation (`F-15`). | `F-12`, `F-13`, `F-15` | None | All existing `335/335` tests + new `M1` unit & E2E tests pass (`0` regressions). |
| **`M2`** | **`WP-2`:** Complete deletion tombstones (`subjects`, `groups`, `lectures`, `wird_logs`, `events`, `backlog`), local IndexedDB cascade cleanup (`pdfs`, `audios`, `rec_*`, `annotations`, `annotation_recovery_vault`), indefinite tombstone retention, and a diagnostic-only `_deviceRegistry` that does not authorize compaction (`F-02`, `N-01`, partial `F-07` local cleanup). | `F-02`, `N-01` (entity level), local `F-07` cleanup | `M1` | All `M1` tests + new `M2` cascade delete & >90-day offline anti-resurrection tests pass. |
| **`M3`** | **`WP-3`:** Per-scope dotted-version / causal-context engine with actor IDs per live tab, scope-local counters, unique operation IDs, explicit causal comparison, deterministic concurrent tie-breaks, and exact outgoing-operation snapshot acknowledgements. Workspace revision remains the OCC token only (`F-14`). | `F-14` | `M1`, `M2` | All `M1–M2` tests + `M3` clock-skew (`±1 hour`), causal vs. concurrent field merge, and OCC retry idempotency tests pass. |
| **`M4`** | **`WP-4`:** Legacy stroke identity manifest only for a verified common ordered ancestor; fail-safe recovery when no common base exists; causal stroke/page/pin tombstones and versioned excluded-page state (`F-04`, `N-01` annotation level). | `F-04`, `N-01` (annotation level) | `M2`, `M3` | All `M1–M3` tests + `M4` duplicate-identical-stroke, eraser/undo/clear-page, floating text note, and audio pin anti-resurrection tests pass. |
| **`M5`** | **`WP-5` & `WP-6`:** Dirty-state login & pull reconciliation (`F-03`) wired to the verified `M3/M4` merger; decoupling full `annotations` from `localStorage['pharmaAccountWorkspace_<uid>']` (`F-05`); and complete mutation/version-counter coverage for annotation dirty state (`N-02`). A full-string non-cryptographic hash may remain only as a secondary hint. | `F-03`, `F-05`, `N-02` | `M3`, `M4` | All `M1–M4` tests + `M5` dirty-login reconciliation, `localStorage` quota isolation, and 1-char equal-length annotation edit signature detection tests pass. |
| **`M6`** | **`WP-7` & `WP-8`:** Tier A `v4` complete JSON backup export (with one-shot Web Crypto `SHA-256` and zero duplicate root aliases), Crash-Recoverable Import Recovery Journal (`__import_journal_v1__`), explicit `Replace` vs. `Merge` modal (with `Merge` powered by `M3/M4/M5`), and actionable client diagnostics for `F-01` (`F-09`, `F-01`). | `F-09`, `F-01` (client diagnostics) | `M3`, `M4`, `M5` | Full 5-tier verification suite passes (`npm test` — `335` baseline + all new Phase 5.1 tests). |

---

## SECTION G — Corrected Test Engineering Plan & Verification Matrix

### G.1 Verified Repository Test Baseline (`335/335` Passing at Source SHA `c211d034eb074c43f74eee480b8186e58868dc80`)

Per `package.json`, `run_all_tests.js`, and `reports/CURRENT.md`, the repository has **five** verification tiers and installs only `express`, `@electric-sql/pglite`, `pg`, and `playwright` (no `jsdom` or `fake-indexeddb` packages exist in `package.json`):

| Tier | NPM Script (`package.json`) | Exact Test File(s) Executed | Runtime & Harness Technique | Verified Baseline Count |
| :--- | :--- | :--- | :--- | :---: |
| **Tier 1: Static** | `npm run test:static` | `run_verification_tests.js` | Node `fs` AST/source contract inspection of `index.html`, `server.js`, `sw.js`, and SQL migrations. | **`54 / 54`** |
| **Tier 2: Unit** | `npm run test:unit` | 1. `run_comprehensive_verification.js` (`29`)<br>2. `test_phase3_cross_account_isolation.js` (`38`)<br>3. `test_phase4_regressions.js` (`35`) | Pure Node.js using `extractFunctionSource(indexHtmlContent, funcName)` + `new Function(...)` / Node `vm` + custom in-memory `Map`-backed `MockIDBDatabase` and `localStorage` doubles built directly inside those test files. | **`102 / 102`** |
| **Tier 3: PGlite** | `npm run test:pglite` | `test_phase4_2_postgres_integration.js` | In-process PostgreSQL engine (`@electric-sql/pglite`) executing repository migrations, RLS policies, grants, triggers, and `sync_workspace_with_concurrency`. | **`41 / 41`** |
| **Tier 4: PG16** | `npm run test:pg16` | `test_phase4_2_1_pg16_concurrency.js` | Real PostgreSQL 16 service container (`pg` client Pool) testing true multi-connection OCC race conditions, 10-point schema parity, and 6/6 cluster isolation guards. | **`96 / 96`** |
| **Tier 5: E2E** | `npm run test:e2e` | `test_phase4_1_chromium_e2e.js` | Headless Chromium via `playwright` against running `server.js`, executing real browser `localStorage`, real browser `indexedDB`, real Web Crypto `crypto.subtle.digest('SHA-256', ...)`, and multi-context browser tabs. | **`42 / 42`** |
| **Aggregate** | `npm test` | `run_all_tests.js` | Sequentially runs Tiers 1, 2, 3, 4, and 5 and fails hard on any non-zero exit code. | **`335 / 335`** |

### G.2 Exact New Phase 5.1 Regression Tests Mapped to Existing Suite Files

All new Phase 5.1 tests will be added directly to the existing test files (`test_phase4_regressions.js`, `test_phase3_cross_account_isolation.js`, `test_phase4_1_chromium_e2e.js`, and `run_verification_tests.js`) without adding any npm dependencies:

| Test ID | Target Suite File | Harness / Environment | Exact Assertion & Failure Mode Prevented |
| :--- | :--- | :--- | :--- |
| **`T-5.1-01`** | `test_phase3_cross_account_isolation.js` & `test_phase4_1_chromium_e2e.js` | Node `vm` + Playwright Chromium E2E | **`F-12` Sign-Out Global `localStorage` Sanitization:** User A logs in, populates subjects/schedule/backlog/reports/logs/academyProgress, signs out (`handleCloudSignOut`), and reloads the page while logged out. Asserts all 10 unscoped global `localStorage` keys are `null` and logged-out UI renders `0` subjects/events from User A. |
| **`T-5.1-02`** | `test_phase4_regressions.js` & `test_phase4_1_chromium_e2e.js` | Node `vm` + Playwright Chromium E2E | **`F-13` `0 ms` Conflict-Merge Persistence:** Simulates `mergeAndApplyCloudConflict()` where remote adds Event E1 and local adds Event E2, then immediately reloads at `< 50 ms` (before the `1,200 ms` push timer fires). Asserts `localStorage['pharmaScheduleV4']`, `localStorage['pharmaScheduleBacklogV1']`, and `pharmaAccountWorkspace_<uid>` contain both E1 and E2 immediately after merge. |
| **`T-5.1-03`** | `test_phase4_regressions.js` | Node `vm` (`extractFunctionSource`) | **`F-15` Brand-New Account `academy_progress` Preservation:** Populates pre-login `completedAcademyModules = ['mod_1', 'mod_2']`, simulates `syncWorkspaceOnLogin()` with `data = null` (new cloud row), and asserts `completedAcademyModules` and `localStorage['pharmaAcademyProgressV1']` remain `['mod_1', 'mod_2']`. |
| **`T-5.1-04`** | `test_phase4_regressions.js` & `test_phase4_1_chromium_e2e.js` | Node `vm` (`MockIDBDatabase`) + Playwright Chromium E2E | **`F-02` / `N-01` Full Deletion Tombstone & Local IDB Cascade:** Exercises `triggerDeleteSubject`, `triggerDeleteGroup`, `triggerDeleteLecture` (with primary `pdfs`, primary `audios`, secondary `lec.recordings[]` `rec_*`, `annotations`, and `annotation_recovery_vault`), `deleteContinuousSubjectWirdLog`, `deleteSessionFromModal`, `deleteSessionDirect`, `executeClearSchedule('completed' / 'all')`, `deleteEventFromPdfAdjuster`, and `deleteBacklogTask`. Asserts every tombstone category is recorded and `0` orphaned local IDB keys remain for the deleted lecture(s). |
| **`T-5.1-05`** | `test_phase4_regressions.js` & `test_phase4_1_chromium_e2e.js` | Node `vm` + Playwright Chromium E2E | **`F-02` / Section C 180-Day Offline Device Anti-Resurrection:** Simulates Device A deleting Subject S1, then advancing 120 workspace revisions and 180 simulated days. Device B reconnects with a snapshot from before the deletion. Asserts the tombstone is still present and S1 is not resurrected. No compaction predicate is invoked because Phase 5.1 does not implement or authorize tombstone compaction. |
| **`T-5.1-06`** | `test_phase4_regressions.js` & `test_phase4_1_chromium_e2e.js` | Node `vm` + Playwright Chromium E2E | **`F-14` / Section B Causal Context, Concurrent Same-Field Merge, and Clock-Skew Immunity:**<br>1. Device A edits `lecture.name`; Device B observes that operation and edits the same field -> asserts B's causal operation wins.<br>2. Two independent devices edit the same field from contexts that do not contain each other's dot -> asserts identical replicas choose the same deterministic concurrent tuple winner and preserve the losing value in recovery.<br>3. Two tabs in one Playwright browser context concurrently edit the same field -> asserts distinct actor IDs/operation IDs and deterministic convergence even though installation `deviceId` is shared.<br>4. Runs with +1h/-1h wall-clock skew and asserts the same result.<br>5. Creates a push snapshot, edits the field again while the request is in flight, then acknowledges the first snapshot -> asserts the later operation remains dirty.<br>6. Replays/reorders duplicate operations and OCC 409 responses -> asserts idempotent convergence without generating new operation IDs during merge. |
| **`T-5.1-07`** | `test_phase4_regressions.js` & `test_phase4_1_chromium_e2e.js` | Node `vm` + Playwright Chromium E2E | **`F-04` / Section E Legacy Duplicate Identity & Annotation Causal Tombstones:**<br>1. Two identical legacy strokes under the same verified common ordered ancestor receive manifest-backed stable identities on both devices.<br>2. Reorder/diverge the legacy arrays before a manifest exists -> asserts the migration does not claim identity, does not arbitrarily map a deletion, and preserves both candidates for recovery.<br>3. Erase one identified stroke while another device edits/clears concurrently -> asserts causal ordering or remove-wins concurrency policy is applied consistently, with the losing snapshot recoverable.<br>4. Tests undo, page clear, extra-note-page clear, floating-text delete, audio-pin delete, and page hide/restore across conflict merge -> asserts no silent resurrection. |
| **`T-5.1-08`** | `test_phase4_regressions.js` & `test_phase4_1_chromium_e2e.js` | Node `vm` + Playwright Chromium E2E | **`F-03` Dirty-State Login & Manual Pull Reconciliation:** Modifies subjects, schedule, and PDF annotations while offline (`pharmaWorkspaceDirty = '1'`, `dirtyAnnotationsForCloud = true`), then triggers `syncWorkspaceOnLogin()` and `pullWorkspaceFromCloud(false)` against an older cloud row. Asserts local dirty edits are merged rather than overwritten, and `pharmaWorkspaceDirty` remains `'1'` until push confirmation. |
| **`T-5.1-09`** | `test_phase4_regressions.js` | Node `vm` (`extractFunctionSource`) | **`F-05` & `N-02` `localStorage` Annotation Decoupling & 1-Char Equal-Length Signature Detection:**<br>1. Asserts `pharmaAccountWorkspace_<uid>` stores `annotationsStoredInIndexedDB: true` and does not embed the multi-MB `annotations` map in `localStorage`.<br>2. Modifies a single 7-character color code (`#ef4444` -> `#38bdf8`) inside a `100 KB` serialized annotation payload and asserts `computeFullStringContentHash64()` produces a distinct signature every time. |
| **`T-5.1-10`** | `test_phase4_1_chromium_e2e.js` | Playwright Chromium E2E (Real Web Crypto + Real IDB + Simulated Faults) | **`F-09` / Section D Tier A `v4` Backup Export, One-Shot `SHA-256` Integrity, and Crash-Recoverable Import Journal Rollback:**<br>1. Exports a complete `v4` workspace including IndexedDB `annotations`, `weeklyReports`, `plannerPrefs`, `completedAcademyModules`, `cloudMediaRegistry`, and `_tombstones`; verifies zero duplicate root aliases and valid `crypto.subtle.digest('SHA-256', ...)` digest.<br>2. Corrupts 1 byte in `data` and asserts `v4` import rejects before mutation.<br>3. Injects a fault/reload during Stage 2 (`APPLYING_IDB_ANNOTATIONS`) and Stage 3 (`APPLYING_LOCALSTORAGE` `QuotaExceededError`), reloads the page, and asserts `recoverPendingImportJournalOnStartup()` restores 100% of pre-import `localStorage` and IndexedDB `annotations`. |

---

## SECTION H — Free vs. VIP Boundaries, Media Access Matrix, Policy Escalations & Read-Only Supabase Preflight

### H.1 Permanent `Free` vs. `VIP` Entitlement Boundary (`GEMINI.md` Section 6)

Phase 5.1 preserves the owner-approved product policy:

- **Free baseline capabilities (never gated by `can_upload_media`):**
  - Core management of subjects, groups, lectures, study schedule, backlog, logs, and other core workspace entities.
  - Local persistence and core Supabase synchronization of workspace metadata and annotations for authenticated users when the backend is configured and the request succeeds.
  - Handwritten ink on regular lecture pages, floating text notes, blank note pages through the separate Free `addBlankNotePageToLecture` path, and audio pins on locally available PDFs.
  - Tier A backup/export and recovery of the user's workspace and stored annotation data. Backup protection must not be withheld because a stored item was created while the account had VIP.
- **VIP-only features:** Google Drive media upload/management and explicitly designated premium academic tools. The additional extra-note-sheet/margin-summary workflow (for example, `toggleExtraNoteForPage`) remains VIP-gated. Do not confuse it with the separate Free blank-note-page flow.
- **Data preservation on entitlement change:** Revoking `can_upload_media` must not delete existing notes, annotations, or workspace data. Whether an existing VIP-only sheet remains editable after revocation is a product decision; do not invent new access behavior in a storage/sync milestone.
- **Manual entitlement:** The owner manually changes `public.user_workspaces.can_upload_media` between FALSE and TRUE. Do not create a subscription table, payment flow, billing timer, expiration process, or automated WhatsApp activation.

### H.2 Four-Way Media Access & Permission Matrix (`GEMINI.md` Section 7)

| Media State | How It Is Identified in `index.html` | Who Can Open / Play / Annotate It? | Phase 5.1 Rules & Constraints |
| :--- | :--- | :--- | :--- |
| **1. Local IndexedDB Media (`pdfs` / `audios` blob present locally)** | `localMediaStatusCache.pdfs.has(String(lec.id))` or `getMediaFromDB('pdfs', lec.id)` returns a `Blob`. | Any account on that local app installation that is authorized to access the active workspace may use core PDF Studio ink and audio pins while the local blob exists. The VIP extra-note-sheet workflow remains separately gated. | Deleting a lecture in M2 may clean account-scoped local IndexedDB records including primary/secondary audio and annotations. This does not delete a remote Google Drive file. |
| **2. Public / External Direct URL (`externalUrl`)** | `lec.pdfUrl` / `lec.driveUrl` points to an external URL or a file explicitly shared outside Exo. | Access follows the external service's own URL and sharing permissions. | Exo must not convert a private file into an `anyone` link as a default behavior. |
| **3. Private Google Drive File (`cloudDriveFileId` / `driveId` in `Exo_Workspace`)** | Created with private-by-default permissions in the verified upload path. | Requires a valid Google OAuth token for a Google account that has permission to read that specific Drive file. Free entitlement does not grant Drive permission. | Never claim that Free users or another Google account can open a private file without the relevant Google Drive ACL. OAuth refresh and interactive 401 UX remain deferred to Phase 5.2. |
| **4. Uploading / Managing Cloud Media in Google Drive** | `uploadMediaToCloudAccount` / bulk upload orchestration checks the server-authoritative VIP entitlement. | VIP only when `public.user_workspaces.can_upload_media = true`; the owner controls that value manually. | Do not make core Workspace or annotation persistence depend on this flag. Keep uploads private by default and remote deletion out of Phase 5.1. |

### H.3 Owner Decision Recorded — Annotated PDF Export Is Free (`N-04`)

<badge color="success">Owner decision: FREE</badge>

The Owner has decided that Annotated PDF Export remains available to Free and VIP users. The feature exports a portable/printable copy of work the user created; it is a convenience and portability capability, not a premium academic tool. The canonical annotation data remains stored through Exo's normal persistence paths, and the ability to export a copy should not be used as an entitlement gate over the user's own notes.

**Evidence in the current source baseline:**
1. `exportAnnotatedSlides()` (`index.html:25360–25539`) has no `canCurrentUserUploadMedia()` guard, and its source comment explicitly says it is Free for all accounts.
2. The toolbar button `#pdfToolbarExportPdfBtn` and mobile menu button `#pdfMenuExportPdfBtn` bind to `exportAnnotatedSlides()`.
3. `syncExtraNoteButtonsLockUI()` (`index.html:25124–25139`) nevertheless includes both export buttons in the VIP lock loop. That styling is inconsistent with the selected product policy.

**Authorized product-policy resolution (documentation decision only):**
- Keep `exportAnnotatedSlides()` available to Free and VIP. Do not add a VIP guard to the function.
- In a separately approved source implementation task, remove only `pdfToolbarExportPdfBtn` and `pdfMenuExportPdfBtn` from the VIP lock list in `syncExtraNoteButtonsLockUI()`; retain their normal click handlers.
- Keep the distinct VIP gate on the additional Extra Note Sheet / margin-summary workflow (for example `toggleExtraNoteForPage` / `addExtraNotePageFromToolbar`) and any other explicitly designated premium academic tools.
- Do not alter annotation persistence, backup/restore, cloud sync, or stored note data as part of this UI correction.
- Add a regression test proving a Free user sees no VIP lock/tooltip on either Annotated PDF Export button and can invoke the export. Also assert VIP-only Extra Note Sheet creation remains locked for Free users and available to VIP users.

This records the owner's product decision only. It does **not** approve Phase 5.1 implementation, authorize a source-code change in this commit, or resolve any other open milestone gate.

### H.4 Measurement-Gated Decision Criteria for Open-Modal Idle Cloud Annotation Sync (`N-03`, `F-05`)

Because local IndexedDB flush on tab close/hide is attempted by `pagehide` (`index.html:20349`), `beforeunload` (`20353`), and `visibilitychange -> hidden` (`30284`), adding a periodic cloud push while `#pdfViewerModalOverlay` remains open (`isPdfModalOpenNow === true` at `29718`) carries JSONB write-amplification risks (`F-05`).
- **Phase 5.1 Rule:** Do **not** enable an automatic open-modal cloud push timer by default in Phase 5.1.
- **Measurement Gate (for Phase 5.1 M5 / Phase 5.3 Evaluation):** In Milestone `M5`, benchmark via `test_phase4_1_chromium_e2e.js`:
  1. IndexedDB `getAllAnnotationsMapFromDB(opCtx)` read + `computeFullStringContentHash64()` time on a 50-page annotated lecture (`target < 25 ms` main-thread blocking time).
  2. Serialized `user_workspaces` JSONB payload size (`target < 1.5 MB` for background idle sync).
  - Until per-lecture delta annotation sync (`Phase 5.3` `F-05`) separates lecture annotations from the monolithic `user_workspaces` row, cloud annotation sync triggers only on: (a) `closePdfViewer()` (`25541`), (b) `visibilitychange -> hidden` (`30284`), or (c) explicit user tap on the Cloud Sync button.

### H.5 Read-Only Owner-Side Supabase Preflight Checklist (`F-01` — Project `dszjmgzzqpdrdjkycvht`)

The checked-in migrations define the repository contract as follows. This is **not** proof that the live project currently has this state:
- Table: `public.user_workspaces`.
- OCC RPC: `public.sync_workspace_with_concurrency(p_payload jsonb, p_expected_revision integer DEFAULT NULL)`.
- Return type: `jsonb`; the RPC returns a JSON status/revision payload.
- `revision` is declared `integer` in the repository migrations, not `bigint`.
- The final RPC owner is `exo_occ_rpc_definer` in `20261103160000_hosted_supabase_auth_compat.sql`.
- RPC search path is `pg_catalog, public, exo_internal`.
- Identity helper is `exo_internal.current_request_uid()`, owned by `postgres`, `SECURITY DEFINER`, with `search_path = ''`.
- The final migration defines three `user_workspaces` RLS policies (SELECT, INSERT, UPDATE). Do not claim a DELETE policy exists unless live catalog output proves one.
- The relevant migration files are exactly:
  - `20261103133622_remote_schema.sql`
  - `20261103140000_fix_security_and_privileges.sql`
  - `20261103150000_unforgeable_occ_and_role_hardening.sql`
  - `20261103160000_hosted_supabase_auth_compat.sql`

**Owner-only, read-only inspection.** Gemini is not authorized to connect to the live project. The owner may choose to run these SELECT-only catalog queries in Supabase SQL Editor for `dszjmgzzqpdrdjkycvht`. They perform no DDL or DML. Missing objects return no row; these are diagnostic queries, not repair scripts.

```sql
-- 1. Exact public.user_workspaces columns, types, nullability and defaults.
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_workspaces'
ORDER BY ordinal_position;

-- 2. RLS enabled/forced state. No row means the table is absent.
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'user_workspaces';

-- 3. Actual policies, including command, roles, USING and WITH CHECK.
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename = 'user_workspaces'
ORDER BY policyname;

-- 4. Workspace triggers. to_regclass avoids an error if the table is absent.
SELECT t.tgname, t.tgenabled, pg_catalog.pg_get_triggerdef(t.oid) AS trigger_def
FROM pg_catalog.pg_trigger AS t
WHERE t.tgrelid = pg_catalog.to_regclass('public.user_workspaces')
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- 5. Actual OCC RPC signature, owner, SECURITY DEFINER flag and configuration.
SELECT p.oid::regprocedure AS function_signature,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_catalog.pg_get_function_result(p.oid) AS return_type,
       r.rolname AS function_owner,
       p.prosecdef AS is_security_definer,
       p.proconfig AS function_configuration
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles AS r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname = 'sync_workspace_with_concurrency';

-- 6. Effective ACL entries for the actual OCC RPC, including PUBLIC if present.
SELECT p.oid::regprocedure AS function_signature,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
       a.privilege_type,
       a.is_grantable
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
) AS a
LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = a.grantee
WHERE n.nspname = 'public'
  AND p.proname = 'sync_workspace_with_concurrency'
ORDER BY grantee, a.privilege_type;

-- 7. Hosted-auth identity helper and its owner/configuration.
SELECT p.oid::regprocedure AS function_signature,
       r.rolname AS function_owner,
       p.prosecdef AS is_security_definer,
       p.proconfig AS function_configuration,
       p.proacl AS function_acl
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles AS r ON r.oid = p.proowner
WHERE n.nspname = 'exo_internal'
  AND p.proname = 'current_request_uid';

-- 8. Table-level and can_upload_media column-level grants.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'user_workspaces'
ORDER BY grantee, privilege_type;

SELECT grantee, privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'user_workspaces'
  AND column_name = 'can_upload_media'
ORDER BY grantee, privilege_type;
```

#### What These Read-Only Checks Do Not Prove

- The exact runtime behavior of PostgREST/Supabase Auth or the live RPC under an authenticated request.
- That the client sends the expected `p_payload` and `p_expected_revision` parameters or correctly handles the returned JSONB `status`, `revision`, and `updated_at`.
- That every function body, trigger branch, RLS expression, role membership, default privilege, and hosted managed-role boundary matches the repository migrations.
- That existing rows or manually-created objects are compatible with the current client.
- That historical `335/335` CI results validate the live Supabase project.

If the owner supplies read-only query output, compare it with the exact four migration files above and the client callsite. Only then prepare a narrowly scoped, non-destructive forward-remediation proposal. Do not execute it or produce runnable production DDL without separate explicit owner approval.

