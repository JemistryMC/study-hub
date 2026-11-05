# EXO — PHASE 5.1.1: DATA-SAFETY IMPLEMENTATION BLUEPRINT & EXECUTION PLAN

- **Document ID:** `EXO-P5.1.1-BLUEPRINT`
- **Phase:** `5.1.1 — Blueprint Technical Validation & Correction`
- **Status:** `CHANGES REQUESTED — DOCUMENTATION ONLY — NOT APPROVED`
- **Author:** Senior Systems Architect & Data-Integrity Engineer
- **Repository:** `JemistryMC/study-hub`
- **Active Branch:** `main`
- **Current Remote `main` SHA (Pre-Governance Sync Baseline):** `6020a78e585d415ca3d8dcdd37a024cda2614652`
- **Previous Reviewed Blueprint Commit SHA:** `1758bba343746f4b457d8793fa9389b80117bcf8`
- **Last Verified Application Source & CI SHA:** `c211d034eb074c43f74eee480b8186e58868dc80` (GitHub Actions Run `41857800822`, `335/335` passing)
- **Approved Audit Baseline:** `reports/phases/phase-5-storage-sync-audit/gemini-report.md` (Phase 5.0.2)
- **Permanent Engineering Contract:** `GEMINI.md`
- **Target File Modified in Phase 5.1.1:** `reports/phases/phase-5-storage-sync-audit/phase-5-1-implementation-blueprint.md` (Strictly Documentation-Only)

---

## 0. Executive Summary & Phase 5.1.1 Corrections Overview

This document is the corrected, implementation-ready engineering blueprint for **Phase 5.1 (Data-Safety, Local Durability, Deterministic Conflict Resolution & Crash-Recoverable Backup/Restore)** of the Exo Academic Platform.

No application source code (`index.html`, `server.js`, `sw.js`), test suites, package manifests, or database migrations have been modified in this task. All line references have been re-verified directly against `index.html` (`30,715` lines), `package.json`, `run_all_tests.js`, and `supabase/migrations/*` at the current workspace baseline.

### Summary of Technical Corrections Applied in Phase 5.1.1

1. **Exact Preservation of Original Phase 5.0.2 Findings (`F-01` through `F-15`) & Separation of New Findings (`N-01` through `N-04`):**
   - Every finding `F-01` through `F-15` retains its exact Phase 5.0.2 title, definition, verification status, severity, and line references from `reports/phases/phase-5-storage-sync-audit/gemini-report.md` (`lines 389–406`).
   - Newly identified edge cases uncovered during Phase 5.1 design are cataloged separately under `N-01` through `N-04` and cross-linked to their parent `F-*` findings without overwriting or renumbering any original audit finding.
2. **Correction of Stale/Unsupported Source Claims:**
   - Removed all references to nonexistent Google Drive functions or folder names (`uploadBlobToGoogleDrive`, `Exo_Academic_Cloud_Storage`, active multipart uploads, or automatic `role: 'reader', type: 'anyone'` sharing). Verified the actual implementation in `index.html`: `uploadBlobToGoogleDriveViaXHR()` (`27972–28094`), `uploadMediaToCloudAccount()` (`28181–28346`), root folder `'Exo_Workspace'` (`27808, 27830`), hierarchical `'Exo_Workspace/<Subject>/<Group>'` (`28251–28260`), and private-by-default uploads (`28295–28297`).
   - Recorded that `index.html:20349–20355` **already** attaches `pagehide` and `beforeunload` listeners calling `flushPendingAnnotationsSave(false)` to flush pending annotations to local IndexedDB (`annotations` + `annotation_recovery_vault`).
3. **Clock-Skew-Resilient Conflict Protocol (Zero Wall-Clock Authority):**
   - Eliminated wall-clock `Date.now()` (`_updatedAt`) and raw `_baseWorkspaceRev` comparison as conflict winners.
   - Replaced with a **Per-Field Causal Lamport Clock + Base-Workspace-Revision Ancestor Protocol** (`_fMeta[field] = { baseRev, committedRev, lc, dev, dirty }`).
   - Distinguishes **causal updates** (only one side modified field `F` after the device's `lastSyncedWorkspaceRev`) from **true concurrent updates** (both sides independently modified the exact same field `F` since `lastSyncedWorkspaceRev`). True concurrent same-field conflicts resolve deterministically via `(lc, dev)` tuple comparison without consulting `Date.now()`.
4. **Indefinite Tombstone Retention & Device-Watermark Compaction Design:**
   - Removed the unsafe `90-day / 50-revision` automatic tombstone purge rule, which could allow an offline device reconnecting after >90 days to resurrect deleted entities.
   - Phase 5.1 retains tombstones **indefinitely** by default. Compaction is architecturally specified around an explicit per-account `_deviceRegistry` watermark (`lastSeenWorkspaceRev`, `lastAckTombstoneLamport`) and owner-controlled device retirement.
5. **Crash-Recoverable Backup Import Journal & Honest Digest/Memory Design:**
   - Replaced claims of "two-phase atomic `localStorage` + IndexedDB transactions" with a **Durable IndexedDB + `localStorage` Crash-Recoverable Import Journal** (`usr_<sanitizedUid>::__import_journal_v1__` in `annotation_recovery_vault` + `pharmaImportTxState_<uid>`).
   - Required explicit user choice between **Replace Mode** and **Merge Mode**, and gated **Merge Mode** on the verified Milestone M4/M5 conflict merger rather than the defective current `mergeAndApplyCloudConflict()`.
   - Corrected SHA-256 verification to use Web Crypto's one-shot `crypto.subtle.digest('SHA-256', encodedCanonicalData)` over canonical `v4` `data` (with zero duplicate root aliases and zero FNV-1a fallback substitution for `v4` integrity verification).
   - Replaced unverified `JSON.parse()` streaming claims with an accurate memory analysis and empirical Chromium E2E measurement plan.
6. **Collision-Free Deterministic Legacy Stroke Identity:**
   - Upgraded legacy stroke ID synthesis (`st_leg_<hash>_o<occurrenceIdx>`) to include a 4-decimal geometry signature plus a **within-page occurrence ordinal (`_o0`, `_o1`, ...)** during `normalizeAndRecoverLectureAnnotations()`, preventing two intentionally identical strokes on the same page from colliding on the same ID.
7. **Verified Test Suite Filenames, Counts & Runtime Harnesses:**
   - Aligned all test plans with the actual repository suites (`54` static + `102` unit + `41` PGlite + `96` PG16 + `42` Chromium E2E = `335/335`) and actual dependencies (`express`, `@electric-sql/pglite`, `pg`, `playwright` — no `jsdom` or `fake-indexeddb`).
8. **Product Policy (`Free` vs. `VIP`) & Read-Only Supabase Preflight (`dszjmgzzqpdrdjkycvht`):**
   - Enforced the permanent `Free` vs. `VIP` contract (`GEMINI.md` Section 6), documented the four distinct media access tiers, flagged the `exportAnnotatedSlides()` comment-vs-UI-lock conflict (`index.html:25360–25361` vs. `25124–25139`) for owner decision, gated idle PDF annotation cloud sync on empirical measurements, and restricted Supabase preflight checks for `dszjmgzzqpdrdjkycvht` to read-only inspection without recommending blanket `supabase/schema.sql` execution.

---

## SECTION A — Complete Finding Traceability Matrix & Corrections

### A.1 Original Phase 5.0.2 Audit Findings (`F-01` through `F-15`) — Preserved Verbatim in Identity & Meaning

Every finding below maps 1-to-1 to the approved Phase 5.0.2 audit report (`reports/phases/phase-5-storage-sync-audit/gemini-report.md:389–406`):

| Finding ID | Exact Phase 5.0.2 Audit Title & Summary (`gemini-report.md`) | Phase 5.0.2 Status & Severity | Verified Source References (`index.html` / `supabase/*`) | PhaseDisposition | Phase 5.1 Work Package & Milestone | Target Regression Test File(s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`F-01`** | **Live Supabase database schema state is unverified** (repository migrations `20261103133622`–`20261103160000` have not been applied to live project `dszjmgzzqpdrdjkycvht`; if `user_workspaces` or `upsert_user_workspace_occ` is absent/misconfigured, `pushWorkspaceToCloud()` throws without direct-upsert fallback and retains dirty local state). | `Unknown / Owner-Side Verification Required` (`Unverified Deployment Gate`) | `index.html:26745`, `29799–29831`, `29890–29908`, `30094`, `30175`; `supabase/migrations/20261103133622` to `20261103160000` | **Phase 5.1** (`WP-8` Read-Only Preflight + Client Actionable Diagnostics) | `WP-8` / Milestone `M6` | `test_phase4_2_postgres_integration.js`, `test_phase4_2_1_pg16_concurrency.js`, `test_phase4_regressions.js` |
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

| New ID | Linked Parent Finding | Technical Description & Exact Verified Line Numbers | Severity | Phase 5.1 Work Package & Milestone |
| :--- | :--- | :--- | :--- | :--- |
| **`N-01`** | `F-02`, `F-04`, `F-14` | **Additional Un-Tombstoned Deletion & Page-Level Mutation Paths:**<br>1. `executeClearSchedule(mode)` (`index.html:15744–15758`) bulk-deletes `scheduleEvents` (`'completed'` or `'all'`) without recording `events` tombstones.<br>2. `deleteContinuousSubjectWirdLog(subId, logId)` (`index.html:12413–12420`) removes entries from `sub.wirdLogs` without recording a sub-entity tombstone (`wird_logs`).<br>3. `deleteOrHidePageFromLecture()` (`index.html:21643–21660`) and `restoreDeletedPage()` (`index.html:21662–21677`) mutate `annotations['__exo_excluded_pages__']` (`20560–20600`) without causal version metadata.<br>4. `clearExtraNotePage(pageNum)` (`index.html:25241–25253`) clears ink on extra note sheets (`extra_<id>`, lines `20512–20545`) without recording a page clear barrier.<br>5. `deleteAudioPin(event, pageNum, pinId)` (`index.html:25087–25095`) splices pins from `annotations['__exo_audio_pins__'][pageNum]` (`20670–20695`) without recording a pin tombstone. | `P2 Medium` | `WP-2` (`M2`) & `WP-4` (`M4`) |
| **`N-02`** | `F-04`, `F-05` | **512-Sample Stride Blind Spot in `computeFastStringSignature(str)` (`index.html:29658–29668`):**<br>`computeFastStringSignature` samples at most 512 characters (`const step = Math.max(1, Math.floor(len / 512))`). For serialized annotation JSON exceeding `512` bytes (e.g., `50 KB`, where `step = 97`), an in-place modification of equal character length (such as changing a 7-char stroke color `#ef4444` to `#38bdf8` or editing a floating text note without changing string length) that falls between sampled indices produces the exact same signature (`currentSig === lastUploadedAnnotationsSignature` at `29769`), skipping cloud annotation upload when `dirtyAnnotationsForCloud` is false. | `P2 Medium` | `WP-5` (`M5`) |
| **`N-03`** | `F-05` | **Open-Modal Cloud Sync Suppression vs. Local Flush Boundary (`index.html:20349–20355`, `29718–29723`):**<br>While `#pdfViewerModalOverlay` is open (`isPdfModalOpenNow === true` at `29718`), `pushWorkspaceToCloud()` suppresses `shouldSendAnnotations` (`29719–29723`) until `closePdfViewer()` (`25541`), `visibilitychange -> hidden` (`30284`), or manual force sync. Note: Local IndexedDB durability on tab close **is** already protected by `pagehide` and `beforeunload` listeners calling `flushPendingAnnotationsSave(false)` at `index.html:20349–20355`. Whether to add a long-interval idle cloud flush while PDF Studio remains open requires empirical payload and RPC latency measurement before implementation. | `P2 Medium (Measurement-Gated)` | `WP-5` (`M5` — Measurement-Gated) |
| **`N-04`** | `GEMINI.md §6` (Free vs. VIP Policy) | **Contradiction Between `exportAnnotatedSlides()` Code Comment/Execution and UI Lock Styling (`index.html:25124–25139` vs. `25360–25361`):**<br>`exportAnnotatedSlides()` (`25360–25361`) contains the comment `// Free and open for all accounts on all devices` and contains no VIP guard in its function body (`25360–25539`), so clicking `#pdfToolbarExportPdfBtn` (`7533`) or `#pdfMenuExportPdfBtn` (`7580`) executes the PDF export for Free users. However, `syncExtraNoteButtonsLockUI()` (`25124–25139`) applies `.vip-locked-extra-note` styling and a lock icon to both export buttons when `!canCurrentUserUploadMedia()`. Per `GEMINI.md` Section 6, this contradiction must not be resolved by guesswork and is escalated to the Owner in Section H.3. | `Policy Decision Required` | Escalated to Owner (Section H.3); Untouched until Owner decides |

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

## SECTION B — Clock-Skew-Resilient Conflict Resolution Protocol (`F-14`, `F-03`)

### B.1 Why Wall-Clock Timestamps (`Date.now()`) and Raw `_baseWorkspaceRev` Are Unsafe

1. **Failure of Wall-Clock `_updatedAt` (`Date.now()`):**
   - Client system clocks across laptops, tablets, and phones frequently drift by seconds, minutes, or hours (NTP misconfiguration, manual clock adjustments, timezone/DST bugs, or CMOS battery drift).
   - If Device A has a clock set 10 minutes fast (`12:10`) and edits Lecture 1 at `12:00` real time, and the user then opens Device B (accurate clock `12:05`) and edits Lecture 1 five minutes later, any LWW comparator based on `_updatedAt` (`localTs >= remoteTs`) will falsely declare Device A's stale edit (`12:10 > 12:05`) the winner, silently destroying the user's newer work on Device B.
2. **Failure of Raw Global `_baseWorkspaceRev` Comparison Across Unrelated Entities:**
   - Suppose Device A syncs at workspace `revision = 10` (`baseRev = 10`), goes offline, and edits **Subject 1's name**.
   - While Device A is offline, Device B (also starting at `revision = 10`) edits **Subject 2's name** and pushes twice (`revision = 11`, then `revision = 12`). Because Device B's full workspace payload is written at `revision = 12`, if Device B stamps ` revision = 12` onto every entity in its payload—or if the merger compares global workspace revision instead of per-field modification provenance—Device B's unmodified Subject 1 (`rev = 12`) would appear newer than Device A's modified Subject 1 (`baseRev = 10`), destroying Device A's offline edit to Subject 1!

### B.2 Architecture Trade-Off Analysis of Conflict Models

| Criterion | Option 1: Full CRDT Operation Log (Op-Log) | Option 2: Per-Entity / Per-Field Version Vectors (`{ [deviceId]: counter }`) | Option 3 (SELECTED): Per-Field Causal Lamport Clock + Base-Revision Ancestor Tracking (`_fMeta`) |
| :--- | :--- | :--- | :--- |
| **Mechanism** | Persist an ordered log of every mutation operation `(opId, lamport, deviceId, entityId, field, oldVal, newVal)` and replay on merge. | Maintain a map `{ [devA]: cA, [devB]: cB, ... }` on every mutable field of every entity. | Track per-field causal metadata `_fMeta[field] = { baseRev, committedRev, lc, dev, dirty }` anchored to Supabase's monotonic `user_workspaces.revision`. |
| **Distinguishes Causal vs. Concurrent Field Edits?** | Yes. | Yes. | **Yes.** `dirty === true` vs. `remote.committedRev > local.baseRev` determines with 100% mathematical certainty whether one side or both sides modified field `F` since the last common server revision. |
| **Immunity to Wall-Clock Skew (`Date.now()`)?** | 100% immune. | 100% immune. | **100% immune.** Wall clock is never read by any conflict comparator. |
| **Metadata Overhead in `user_workspaces` JSONB** | High (unbounded op-log growth unless compacted via complex vector watermarks). | Moderate-High (`O(Fields × Entities × Devices)` grows linearly with every browser session/device ID). | **Low & Bounded (`O(Fields × Entities)` constant size regardless of device count):** ~48 bytes per field (`{ br, cr, lc, dv, d }`). |
| **Retrofit Risk in Single-File `index.html`** | High (requires rewriting every direct array/property assignment into op-dispatchers). | Moderate. | **Low.** Can be applied cleanly at mutation helpers + a pre-push dirty-field detector that diffs against the last synced clean snapshot. |

### B.3 Detailed Specification of the Selected Model: Per-Field Causal Lamport Clock + Base-Revision Ancestor Tracking

#### 1. Device Identity & Monotonic Lamport Clock
- **Persistent Device ID (`getOrInitExoDeviceId()`):**
  - Stored in `localStorage['exo_device_id_v1']` (e.g., `'dev_' + 128-bit CSPRNG hex via `crypto.getRandomValues`). Never resets on sign-out, ensuring stable tie-breaking per browser profile.
- **Per-Account Monotonic Lamport Counter (`getNextLamportTick(uid, observedRemoteLamport = 0)`):**
  - Stored in `localStorage['pharmaLamportClock_' + sanitizeForScopedKey(uid)]` (integer initialized to `1`).
  - **Rule L1 (Local Mutation):** On every local mutation, `lc = Math.max(currentLc, 0) + 1`.
  - **Rule L2 (Remote Observation):** Whenever a cloud payload is received (`pullWorkspaceFromCloud`, `syncWorkspaceOnLogin`, or `mergeAndApplyCloudConflict`), extract `maxRemoteLc = payload.schedule?._syncClock?.maxLc || 0` and immediately advance local clock:
    `currentLc = Math.max(currentLc, maxRemoteLc) + 1`.
- **Per-Account Last Synced Server Revision (`lastSyncedWorkspaceRev`):**
  - Already tracked in memory via `currentCloudWorkspaceRevision` (`index.html:26787`) and persisted in `localStorage['pharmaWorkspaceRevision_' + sanitizeForScopedKey(uid)]` (`26815`).

#### 2. Per-Entity & Per-Field Causal Metadata (`_meta` and `_fMeta`)
Every syncable entity (`Subject`, `Group`, `Lecture`, `WirdLog`, `ScheduleEvent`, `BacklogTask`, `WeeklyReport`, `StudyLog`) and singleton settings object (`plannerPrefs`, `academyProgress`, `cloudMediaRegistry`) carries a compact `_meta` envelope:

```javascript
entity._meta = {
  createdRev: 12,           // Server revision known when entity was created
  createdLc: 41,            // Lamport clock at creation
  createdDev: 'dev_a1b2...',// Creator deviceId
  revivedGen: 0,            // Incremented only on explicit user Undelete/Restore action
  displayTs: 1730820000000, // Wall-clock timestamp ONLY for UI display; NEVER used in conflict comparison!
  f: {                      // Per-field causal state for mutable scalar fields
    name: {
      br: 12,               // baseRev: local device's lastSyncedWorkspaceRev when this local edit began
      cr: 12,               // committedRev: server revision at which this field value was last committed to Supabase
      lc: 45,               // Lamport counter when this field was last modified
      dv: 'dev_a1b2...',    // Device ID that performed this field modification
      d: true               // dirty: true if modified locally since last successful push to Supabase; false once committed
    }
  }
};
```

#### 3. Defense-in-Depth Field-Diff Detector (`stampEntityFieldMutationsBeforeSave()`)
Because `index.html` mutates some entity fields directly in UI handlers (e.g., `lec.status = newStatus` at `12625`, `sub.name = ...` at `12445`), Phase 5.1 uses a **dual-layer capture mechanism** so zero field mutations can ever be missed:
1. **Explicit Helper Stamping:** Mutation functions (`triggerEditSubject`, `triggerEditGroup`, `triggerEditLecture`, `updateStatus`, `saveStudySession`, `saveBacklogTask`, etc.) call `stampFieldModified(entity, fieldName)`.
2. **Automatic Pre-Save Shadow Diff Guard inside `saveToStorage()` (`index.html:11329`) and `saveScheduleState()` (`13109`):**
   - We maintain an in-memory clean baseline map `_lastCommittedFieldValuesByEntityId` (hydrated from the last clean pull/push).
   - Whenever `saveToStorage()` or `saveScheduleState()` runs, `reconcileDirtyFieldMeta(currentState, _lastCommittedFieldValuesByEntityId)` scans the live entities (typically `< 500` objects, taking `< 0.4 ms`). If any scalar property `entity[field] !== cleanBaseline[entity.id][field]` and `entity._meta.f[field].d !== true`, it automatically marks `entity._meta.f[field] = { br: currentCloudWorkspaceRevision || 0, cr: entity._meta.f[field]?.cr || 0, lc: nextLamportTick(), dv: getOrInitExoDeviceId(), d: true }`.
   - When `pushWorkspaceToCloud()` succeeds and receives `newServerRevision` from `upsert_user_workspace_occ`, `markAllDirtyFieldsCommitted(newServerRevision)`:
     - For every field across all entities where `fMeta.d === true`, sets `fMeta.cr = newServerRevision`, `fMeta.br = newServerRevision`, and `fMeta.d = false`.
     - Notice: **Unmodified fields on the pushing device do NOT have their `cr` bumped to `newServerRevision`!** Their `cr` remains at the server revision where *that specific field* was actually modified. This is the exact invariant that prevents a push of Subject 2 from falsely making Subject 1 look newly modified at `newServerRevision`.

#### 4. Exact Causal vs. Concurrent Field Resolution Algorithm (`resolveFieldConflict(localEntity, remoteEntity, fieldName, localBaseRev)`)

When merging `localEntity` (on a device whose last clean sync was `localBaseRev`) with `remoteEntity` (fetched from Supabase at `remoteServerRev >= localBaseRev`):

Let `L = localEntity._meta?.f?.[fieldName]` and `R = remoteEntity._meta?.f?.[fieldName]`.
- Did **Local** modify `fieldName` since its last sync?
  `localChanged = Boolean(L && L.d === true)`
- Did **Remote** modify `fieldName` after `localBaseRev`?
  `remoteChanged = Boolean(R && (R.cr > localBaseRev || (localBaseRev === 0 && R.lc > 0)))`

The conflict matrix has **four exhaustive, mutually exclusive cases**:

| Case | `localChanged` | `remoteChanged` | Causal Meaning | Deterministic Winner |
| :--- | :---: | :---: | :--- | :--- |
| **1. Neither changed** | `false` | `false` | Both devices hold the same ancestor value from `<= localBaseRev`. | Keep `remoteEntity[fieldName]` (identical to local). |
| **2. Remote-only causal update** | `false` | `true` | Local never touched `fieldName`; Remote committed an update in `(localBaseRev, remoteServerRev]`. | **Remote wins** (`remoteEntity[fieldName]`), and local adopts `R` with `d: false`. |
| **3. Local-only causal update** | `true` | `false` | Local modified `fieldName` offline/concurrently; Remote's `fieldName` has `R.cr <= localBaseRev` (untouched by Remote pushes of other fields/entities). | **Local wins** (`localEntity[fieldName]`), and retains `d: true` so the next push commits it to Supabase! |
| **4. True concurrent same-field edit** | `true` | `true` | Both devices independently modified the **exact same field** `fieldName` without observing each other's edit. | **Compare `(lc, dv)` tuple:**<br>• If `L.lc !== R.lc`: higher `lc` wins.<br>• If `L.lc === R.lc`: lexicographically larger `dv` (`String(L.dv).localeCompare(String(R.dv)) > 0`) wins.<br>• If `localEntity[fieldName] !== remoteEntity[fieldName]`, append the overridden value to `schedule._conflictAuditLog` (bounded ring buffer of last 20 concurrent field overrides) so no concurrent edit vanishes silently. |

#### 5. Delete-vs-Update & Explicit Restore Rules
- **Tombstone Entry Schema:**
  ```javascript
  tombstone = {
    id: String(entityId),
    cat: 'subjects' | 'groups' | 'lectures' | 'wird_logs' | 'events' | 'backlog' | 'weekly_reports' | 'logs',
    parentId: optionalParentId,
    br: localBaseRev,     // Server revision known by deleting device when delete occurred
    cr: committedRev,     // 0 while dirty/unpushed; set to newServerRevision when push succeeds
    lc: lamportTick,      // Lamport counter at deletion
    dv: deviceId,         // Deleting deviceId
    d: true | false,      // true until committed to Supabase
    delGen: entityRevivedGenAtDelete // Matches entity._meta.revivedGen at time of deletion
  };
  ```
- **Delete vs. Stale Record (No Concurrent Edit on Surviving Side):**
  - If one side has a tombstone `T` (`T.delGen >= entity._meta.revivedGen`) and the surviving entity on the other side has **no** field modified concurrently after `T.br` (i.e., when `T` is remote: no field on `localEntity` has `fMeta.d === true`; when `T` is local: no field on `remoteEntity` has `fMeta.cr > T.br`), **Delete wins** unambiguously.
- **Delete vs. True Concurrent Update on the Same Entity:**
  - Suppose Device A deletes Lecture `L1` while offline (`T.d = true`, `T.br = 10`, `T.lc = 15`), while Device B concurrently edits `L1.name` (`R.cr = 11 > 10`, `R.lc = 14`).
  - **Safety Rule (Data-Preservation Bias on True Concurrent Edit vs. Delete):** If an entity has a **confirmed concurrent field or annotation mutation** (`remoteChanged === true` against a local delete, or `localChanged === true` against a remote delete) at the same `revivedGen`, **Deletion beats unedited state, but a true concurrent edit vs. concurrent delete resolves by comparing the delete's `(T.lc, T.dv)` against the highest concurrent field mutation `(maxField.lc, maxField.dv)` AND recording the deleted entity snapshot in `schedule._conflictAuditLog`** so the user can restore it in one click if the delete won `(T.lc, T.dv)`.
  - **Explicit Restore / Undelete (`revivedGen`):** If a user explicitly restores an entity from backup or conflict history, `entity._meta.revivedGen = (T.delGen || 0) + 1`, which strictly supersedes any tombstone with `delGen < entity._meta.revivedGen`.

#### 6. Legacy Record Normalization (Records Without `_meta`)
When migrating or merging pre-Phase-5.1 records that lack `_meta`:
- `normalizeEntityCausalMeta(entity, knownServerRev, isLocalDirty)`:
  - Initializes `_meta.revivedGen = 0`.
  - For each mutable field `F`, sets `_meta.f[F] = { br: knownServerRev || 0, cr: knownServerRev || 0, lc: 0, dv: 'legacy_init', d: Boolean(isLocalDirty) }`.
  - If a legacy local workspace (`pharmaWorkspaceDirty === '1'`) merges against a legacy remote workspace (where neither has per-field `_meta` yet), `reconcileDirtyFieldMeta()` diffs the local entities against the per-account last-synced vault `pharmaAccountWorkspace_<uid>` (or marks fields differing from remote as `d: true, lc: 1` only where local differs from the last known snapshot), preventing wholesale blind overwrite in either direction.

#### 7. Idempotency Across Repeated OCC `409` Retries & Interaction with Supabase `user_workspaces.revision`
- **Interaction Between `user_workspaces.revision` and Entity Metadata:**
  - Supabase `user_workspaces.revision` (`BIGINT` incremented by `upsert_user_workspace_occ` in `supabase/migrations/20261103160000_phase4_2_4_least_privilege_definer_and_search_path.sql:46–137`) is the **single global commit serial number** for the account's workspace row.
  - Entity field metadata uses `user_workspaces.revision` as its **causal anchor** (`br` = base server revision observed before edit; `cr` = server revision when the field edit was committed), while `(lc, dv)` orders concurrent unpushed edits that share overlapping base revisions.
- **Idempotency Across Repeated OCC Retries (`occRetryCount = 1..3`):**
  - During `mergeAndApplyCloudConflict(cloudRow, occRetryCount, opCtx)`, the merger is a **pure, idempotent lattice join** over `(localState, remoteState, localBaseRev, remoteServerRev)`:
    - Re-running `merge(merge(L, R1), R1)` produces the **exact same state** as `merge(L, R1)` because `resolveFieldConflict` does not increment `lc` during a merge if the winning value and `(lc, dv, d)` tuple are already selected.
    - If retry `#1` merges against `remoteRev = 11` and the push races with another device that commits `remoteRev = 12`, retry `#2` runs `merge(mergedStateFrom11, remoteStateAt12)` with `localBaseRev = 11`. Fields modified locally (`d: true`) preserve `d: true` until the OCC RPC returns `status: 'ok'`, at which point `markAllDirtyFieldsCommitted(13)` transitions `d: true -> false` and `cr = 13`.

#### 8. Worked Examples Proving Clock-Skew Immunity

##### Worked Example 1: Severe Clock Skew (1 Hour) + Edits to Different Fields of the Same Lecture
- **Initial State (Synced at `serverRevision = 20`):**
  - Lecture `lec_101`: `{ id: 101, name: 'Cardiology I', status: 'not-started', _meta: { f: { name: { br: 20, cr: 20, lc: 5, dv: 'dev_A', d: false }, status: { br: 20, cr: 20, lc: 5, dv: 'dev_A', d: false } } } }`.
- **Step 1 (Device A — Wall Clock = `10:00 AM`, 1 hour FAST):**
  - User renames `lec_101.name = 'Cardiology I — Updated'` (`status` untouched).
  - Device A stamps `f.name = { br: 20, cr: 20, lc: 6, dv: 'dev_A', d: true }`.
  - Device A pushes to Supabase. `upsert_user_workspace_occ` succeeds with `expected_revision = 20 -> new revision = 21`.
  - Device A marks `f.name` committed: `f.name = { br: 21, cr: 21, lc: 6, dv: 'dev_A', d: false }`. Crucially, `f.status` was NOT dirty, so `f.status.cr` remains `20`!
- **Step 2 (Device B — Wall Clock = `09:05 AM`, 55 minutes BEHIND Device A; still at `localBaseRev = 20`):**
  - User changes `lec_101.status = 'completed'` (`name` untouched).
  - Device B stamps `f.status = { br: 20, cr: 20, lc: 6, dv: 'dev_B', d: true }`. (`f.name.d` remains `false`).
  - Device B attempts to push with `expected_revision = 20`. Supabase returns `conflict` with remote row at `revision = 21`.
- **Step 3 (Deterministic Field-Level Merge on Device B at `localBaseRev = 20`, `remoteRev = 21`):**
  - **Field `name`:** `localChanged = (L.f.name.d === true) = false`. `remoteChanged = (R.f.name.cr [21] > localBaseRev [20]) = true`. **Case 2 applies -> Remote wins:** `name = 'Cardiology I — Updated'`.
  - **Field `status`:** `localChanged = (L.f.status.d === true) = true`. `remoteChanged = (R.f.status.cr [20] > localBaseRev [20]) = false`. **Case 3 applies -> Local wins:** `status = 'completed'` (retains `d: true`).
  - **Result pushed at `revision = 22`:** `{ name: 'Cardiology I — Updated', status: 'completed' }`. Both edits are preserved with zero dependence on the 55-minute wall-clock skew!

##### Worked Example 2: Severe Clock Skew (1 Hour) + Concurrent Edits to the Exact Same Field
- **Initial State (`serverRevision = 20`, `lc = 10` on both devices):**
  - Device A (`dev_A`, clock `10:00 AM`) and Device B (`dev_B`, clock `09:00 AM`) both start at `baseRev = 20`.
- **Step 1:** Device A performs 1 edit to `lec_101.name = 'Title A'` (`f.name = { br: 20, cr: 20, lc: 11, dv: 'dev_A', d: true }`) and pushes -> committed at `revision = 21` (`cr: 21, lc: 11, dv: 'dev_A'`).
- **Step 2:** While offline, Device B performs 2 edits to `lec_101.name` (`'Draft B'` at `lc = 11`, then `'Final Title B'` at `lc = 12`, so `L.f.name = { br: 20, cr: 20, lc: 12, dv: 'dev_B', d: true }`), despite Device B's wall clock being 1 hour behind Device A.
- **Step 3 (Merge on Device B):**
  - `localChanged = true`, `remoteChanged = (21 > 20) = true` -> **Case 4 (True Concurrent Same-Field Edit)**.
  - Compare `(L.lc = 12, 'dev_B')` vs. `(R.lc = 11, 'dev_A')`. Since `12 > 11`, `'Final Title B'` wins deterministically, and `'Title A'` is recorded in `schedule._conflictAuditLog`. If both had `lc = 11`, `'dev_B' > 'dev_A'` breaks the tie identically on every device.

---

## SECTION C — Safe Tombstone Retention & Device Watermark Protocol (`F-02`, `N-01`)

### C.1 Why Fixed TTL / Revision-Delta Tombstone Purging (`90 Days / 50 Revisions`) Is Prohibited

In the Phase 5.1.0 draft, tombstones were proposed to be compacted after `90 days` AND `50 workspace revisions`. That rule is **unsafe** and violates `GEMINI.md` Section 5:
- Suppose a user deletes Subject `S1` on their laptop on Day 1 (`revision = 100`).
- Over the next 95 days, the user studies daily on their laptop (`revision` reaches `200`).
- Under a 90-day / 50-revision rule, the tombstone for `S1` would be purged on Day 91.
- On Day 100, the user powers on an old tablet or secondary browser profile that was last synced at `revision = 95` (when `S1` still existed).
- When the tablet merges its local state with the cloud row (`revision = 200`), because `S1` is absent from `_tombstones`, the merger cannot distinguish `S1` (deleted on Day 1) from a brand-new offline subject created on the tablet—and **resurrects `S1` back into the user's workspace**.

### C.2 Phase 5.1 Default Policy: Indefinite Tombstone Retention

1. **Zero Automatic TTL or Revision-Delta Compaction in Phase 5.1:**
   - Tombstones in `schedule._tombstones`, lecture page/stroke tombstones in `annotations[lecId]._deletedStrokes`, and pin tombstones in `annotations[lecId]._deletedPins` are **retained indefinitely** by default.
   - **Storage Footprint Reality Check:** Each entity tombstone is ~110 bytes of JSON (`{ id, cat, br, cr, lc, dv, delGen }`). Even if a student deletes 2,000 items over a 5-year degree, total tombstone size is `~220 KB` (`< 4.5%` of a 5 MB budget and negligible in PostgreSQL `JSONB`). Correctness and anti-resurrection strictly outweigh saving a few kilobytes.

### C.3 Device Watermark Registry & Owner-Controlled Compaction Architecture

To support safe future compaction without ever risking resurrection from an offline device, Phase 5.1 introduces the **Per-Account Device Watermark Registry (`schedule._deviceRegistry`)**:

```javascript
schedule._deviceRegistry = {
  "dev_a1b2c3d4...": {
    deviceId: "dev_a1b2c3d4...",
    lastSeenWorkspaceRev: 142,       // Highest user_workspaces.revision synced by this device
    lastAckTombstoneLc: 890,         // Highest tombstone Lamport counter observed by this device
    lastSeenDisplayIso: "2026-11-05T09:00:00.000Z"
  }
};
schedule._minActiveWorkspaceRev = 0; // Floor revision raised ONLY if owner explicitly retires an old device
```

1. **Watermark Advancement on Every Clean Sync:**
   - Whenever a device completes `applyCloudWorkspacePayload()` or a successful `pushWorkspaceToCloud()` at `serverRev`, it updates `schedule._deviceRegistry[myDeviceId] = { deviceId: myDeviceId, lastSeenWorkspaceRev: serverRev, lastAckTombstoneLc: currentMaxTombstoneLc, ... }`.
2. **Mathematical Safety Condition for Future Tombstone Compaction:**
   - A tombstone `T` (`cr: T_rev, lc: T_lc`) is **provably safe to compact** if and only if:
     - `T.d === false` (committed to Supabase at `T.cr > 0`), AND
     - `Object.keys(schedule._deviceRegistry).length > 0`, AND
     - **For every registered device `D` in `schedule._deviceRegistry`:**
       `D.lastSeenWorkspaceRev >= T.cr && D.lastAckTombstoneLc >= T.lc`.
   - Even when this condition holds, **Phase 5.1 keeps automatic compaction disabled (`ENABLE_AUTO_TOMBSTONE_COMPACTION = false`)**, exposing `canCompactTombstoneSafely(T, deviceRegistry)` as a verified pure predicate tested in `test_phase4_regressions.js`.
3. **Protection Against Unregistered / Retired Long-Offline Devices (`_minActiveWorkspaceRev`):**
   - If the owner ever explicitly retires a lost device from `_deviceRegistry` and compacts tombstones up to `rev = R_floor`, `schedule._minActiveWorkspaceRev` is set to `R_floor`.
   - If a long-offline device with `localBaseRev < remote._minActiveWorkspaceRev` ever reconnects later, the merger detects `localBaseRev < remote._minActiveWorkspaceRev`: it **refuses to blindly union local entities that existed at `<= localBaseRev`**, archives the stale device's local snapshot into the recovery vault, and prompts the user before importing any local-only entities.

### C.4 Complete Map of Deletion Sites Wired to Tombstones & Local IndexedDB Cascade Cleanup (`WP-2`)

Every deletion path in `index.html` is wired to `recordTombstone(category, id, meta)` and (for media-owning entities) local IndexedDB cleanup via `cascadeDeleteLectureLocalMedia(lec, opCtx)`:

| Deletion Handler (`index.html`) | Line Numbers | Tombstone Category & ID Recorded | Local IndexedDB (`pdfs`, `audios`, `annotations`, `annotation_recovery_vault`) & RAM Cache Cleanup | Remote Google Drive Action |
| :--- | :--- | :--- | :--- | :--- |
| `triggerDeleteSubject(id)` | `11844–11859` | `'subjects'` (`id`), plus `'groups'` (`g.id`), `'lectures'` (`l.id`), `'wird_logs'` (`w.id`), and linked `'events'` (`ev.id`) | Calls `cascadeDeleteLectureLocalMedia(lec, opCtx)` for every lecture in `sub.groups[*].lectures[*]` | **None** (Local cleanup only; remote Drive files untouched per `GEMINI.md §7`) |
| `triggerDeleteGroup(subId, groupId)` | `12465–12480` | `'groups'` (`groupId`), plus `'lectures'` (`l.id`) and linked `'events'` (`ev.id`) | Calls `cascadeDeleteLectureLocalMedia(lec, opCtx)` for every lecture in `group.lectures[*]` | **None** |
| `triggerDeleteLecture(subId, groupId, lecId)` | `12585–12604` | `'lectures'` (`lecId`) and linked `'events'` (`ev.id` where `String(ev.lectureId) === String(lecId)`) | Deletes scoped keys in `pdfs` (`lec.id`), `audios` (`lec.id` + every `rec.id` in `lec.recordings[]`), `annotations` (`lec.id`), `annotation_recovery_vault` (`lec.id`), `localMediaStatusCache`, `sessionMediaBlobRamCache`, and `cloudMediaRegistry` entry | **None** |
| `deleteContinuousSubjectWirdLog(subId, logId)` | `12413–12420` | `'wird_logs'` (`logId`, with `parentId: subId`) | N/A | **None** |
| `deleteSessionFromModal()` | `15602–15607` | `'events'` (`editingSessionId`) | N/A | **None** |
| `deleteSessionDirect(eventId)` | `15609–15622` | `'events'` (`eventId`) | N/A | **None** |
| `executeClearSchedule(mode)` | `15744–15758` | `'events'` (for every `ev.id` removed by `'completed'` or `'all'` filter) | N/A | **None** |
| `deleteEventFromPdfAdjuster(eventId)` | `17794–17811` | `'events'` (`eventId`) | N/A | **None** |
| `deleteBacklogTask(taskId)` | `15867–15872` | `'backlog'` (`taskId`) | N/A | **None** |

---

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

#### 2. Five-Stage Durable Import Journal State Machine (`usr_<sanitizedUid>::__import_journal_v1__`)

All journal records are persisted in IndexedDB `WorkspaceMediaStore.annotation_recovery_vault` under the reserved account-scoped key `usr_<sanitizedUid>::__import_journal_v1__`, mirrored by a lightweight synchronous status pointer in `localStorage['pharmaImportTxState_' + sanitizeForScopedKey(uid)]`:

```
[IDLE]
  │  (Step 1: Parse JSON, validate schema & one-shot Web Crypto SHA-256 digest in memory;
  │           pause cloud auto-sync timers & increment session operation barrier)
  ▼
[STAGE 1: JOURNAL_STAGED]
  │  Write durable record `usr_<uid>::__import_journal_v1__` to IndexedDB `annotation_recovery_vault`:
  │    - txId, uid, mode ('replace' | 'merge'), startedAtIso
  │    - preImportLocalStorageSnapshot (exact string values of all 10 workspace localStorage keys)
  │    - preImportAnnotationsMap (exact pre-import annotations map for uid from IndexedDB)
  │    - targetLocalStorageSnapshot (computed post-import string values for all 10 localStorage keys)
  │    - targetAnnotationsKeys (list of lecture IDs to be written/removed in IndexedDB `annotations`)
  │  Wait for IDBTransaction.oncomplete.
  │  Write `localStorage['pharmaImportTxState_<uid>'] = JSON.stringify({ txId, phase: 'JOURNAL_STAGED' })`.
  ▼
[STAGE 2: APPLYING_IDB_ANNOTATIONS]
  │  Update journal phase -> 'APPLYING_IDB_ANNOTATIONS'.
  │  In a single IndexedDB readwrite transaction on `annotations` + `annotation_recovery_vault`:
  │    - Write all `targetAnnotations` records (`usr_<uid>::<lecId>`).
  │    - In 'replace' mode, delete any previous `usr_<uid>::<lecId>` annotation keys not in targetAnnotations.
  │  Wait for IDBTransaction.oncomplete.
  ▼
[STAGE 3: APPLYING_LOCALSTORAGE]
  │  Update `localStorage['pharmaImportTxState_<uid>'] = JSON.stringify({ txId, phase: 'APPLYING_LOCALSTORAGE' })`.
  │  Write each key in `targetLocalStorageSnapshot` to `localStorage` inside a `try/catch (QuotaExceededError)`.
  │  Hydrate in-memory variables (`subjects`, `scheduleEvents`, `scheduleBacklog`, etc.).
  ▼
[STAGE 4: COMMITTED]
  │  Set `pharmaWorkspaceDirty = '1'`, `dirtyAnnotationsForCloud = true`.
  │  Remove `localStorage['pharmaImportTxState_<uid>']` and delete `usr_<uid>::__import_journal_v1__` from IDB.
  │  Re-render UI and schedule cloud sync.
```

#### 3. Deterministic Rollback & Boot-Time Crash Recovery (`recoverPendingImportJournalOnStartup()`)

What happens if the browser crashes, power fails, or `QuotaExceededError` occurs at **any** point?

| Failure Point | State on Next Page Load (or Immediate Catch Block) | Recovery Action Executed by `recoverPendingImportJournalOnStartup(uid)` (Runs Before `syncWorkspaceOnLogin` / UI Render) |
| :--- | :--- | :--- |
| Failure during **Stage 1** (before `JOURNAL_STAGED` completes) | Neither `annotations` nor workspace `localStorage` keys were modified. | Delete any partial `__import_journal_v1__` record and clear `pharmaImportTxState_<uid>`. Original workspace is 100% untouched. |
| Crash or error during **Stage 2** (`JOURNAL_STAGED` or `APPLYING_IDB_ANNOTATIONS`) | IndexedDB `annotations` may be partially updated; `localStorage` still holds pre-import state. | Read `preImportAnnotationsMap` and `preImportLocalStorageSnapshot` from `usr_<uid>::__import_journal_v1__`. Restore all pre-import `annotations` keys in a single IDB `readwrite` transaction, restore all `preImportLocalStorageSnapshot` keys, and remove `pharmaImportTxState_<uid>` + journal only after `IDBTransaction.oncomplete`. |
| Crash or `QuotaExceededError` during **Stage 3** (`APPLYING_LOCALSTORAGE`) | IndexedDB `annotations` has target state; `localStorage` is partially written. | **If triggered by synchronous `QuotaExceededError` in Stage 3:** Immediately roll back `localStorage` from `preImportLocalStorageSnapshot` and roll back IndexedDB `annotations` from `preImportAnnotationsMap`.<br>**If triggered by browser crash during Stage 3 and detected on next boot:** Because `usr_<uid>::__import_journal_v1__` contains the complete `preImportLocalStorageSnapshot` and `preImportAnnotationsMap`, deterministically roll back both `localStorage` and IndexedDB `annotations` to the pre-import state and notify the user that an interrupted import was safely rolled back. |
| **Catastrophic Double-Fault** (Rollback itself fails due to hardware/browser storage lock) | Rollback throws an exception. | 1. Set `window._exoImportQuarantineLock = true` and `localStorage['pharmaImportTxState_<uid>'] = { txId, phase: 'ROLLBACK_FAILED_QUARANTINE' }`.<br>2. **Block all automatic cloud pushes (`pushWorkspaceToCloud`)** so corrupted partial local state can NEVER overwrite the user's Supabase cloud row.<br>3. Keep `usr_<uid>::__import_journal_v1__` intact in IndexedDB and display a persistent Recovery Banner allowing the user to retry rollback or download `preImportSnapshot.json` directly from the journal. |

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

- **Export Path (`exportData()`):**
  - Serializing `data` via `canonicalizeBackupDataJson(dataObj)` and computing `crypto.subtle.digest('SHA-256', utf8Bytes)` holds one UTF-8 `Uint8Array` and one `Blob([headerJson, canonicalDataStr, footerJson])` in memory. For a large Tier A workspace with heavy ink annotations (`10 MB – 25 MB` of JSON), peak export RAM overhead is approximately `2.5× – 3.5×` the JSON byte length (`~25 MB – 85 MB`, well within modern browser tab limits).
- **Import Path (`importData()`):**
  - Because standard browser `JSON.parse(fileText)` parses a complete string into a JavaScript object graph in a single synchronous pass, chunked `Blob` reading does **not** avoid materializing the full parsed object graph in memory unless a custom streaming JSON tokenizer is written.
  - Therefore, rather than making unverified claims about streaming `JSON.parse`, Phase 5.1 raises the legacy hardcoded `15 MB` cap (`index.html:19075`) to a **validated `50 MB` Tier A JSON limit** (with a soft warning above `25 MB`) and includes an empirical Playwright Chromium E2E benchmark (`test_phase4_1_chromium_e2e.js`) measuring export time, SHA-256 digest time, and import peak heap usage across `1 MB`, `5 MB`, and `15 MB` synthetic annotation payloads.

---

## SECTION E — Deterministic Legacy Stroke Identity & Annotation Tombstone Protocol (`F-04`, `N-01`)

### E.1 Why Pure Geometry Hashing Collides on Duplicate Identical Strokes

In `index.html:29416–29436`, `computeStrokeUniqueSignature(s)` builds a string from tool, color, size, text, and 2-decimal rounded coordinates (`Number(pt.x).toFixed(2)`).
If a legacy annotation page contains **two intentionally identical strokes**—for example:
- Two identical checkmarks or highlight bars stamped/copied at the same coordinates, or
- Two very short single-point taps within `0.004` normalized units that quantize to the same 2-decimal `.toFixed(2)` coordinate,

then a pure geometry hash `fnv1a64(computeStrokeUniqueSignature(s))` assigns **both strokes the exact same `st.id`**! If the user subsequently erases one of the two strokes, a tombstone keyed by that colliding ID would delete **both** strokes, and merging the page array by `st.id` would silently collapse the two strokes into one.

### E.2 Collision-Free Deterministic Legacy Stroke ID Synthesis (`Geometry + 4-Decimal Precision + Within-Page Occurrence Ordinal`)

1. **For All Newly Created Strokes & Floating Text Notes (`index.html:23764, 24014, 24365`):**
   - Stamp an explicit, globally unique ID at creation time:
     `id: 'st_' + getOrInitExoDeviceId().slice(0, 12) + '_' + getNextLamportTick(uid) + '_' + randomHex(4)`
     along with `createdLc: lamportTick` and `createdDev: deviceId`.
2. **For Legacy Strokes Lacking `st.id` (`normalizeAndRecoverLectureAnnotations` at `index.html:20357`):**
   - First, upgrade `computeStrokeCanonicalGeometrySig(s)` to use **4-decimal coordinate precision** (`Number(pt.x).toFixed(4)`) across all points (first, middle quartiles, last, and point count `pts.length`), eliminating quantization collisions between nearby distinct strokes.
   - Second, while iterating the strokes array `pages[pageKey]` on a given page in canonical index order (`i = 0 .. strokes.length - 1`), track a **per-page occurrence counter map** `const sigOccurrenceMap = new Map();`:
     ```javascript
     const geomSig = computeStrokeCanonicalGeometrySig(st);
     const occOrdinal = sigOccurrenceMap.get(geomSig) || 0;
     sigOccurrenceMap.set(geomSig, occOrdinal + 1);
     if (!st.id) {
       st.id = 'st_leg_' + computeDeterministic64Hex(String(pageKey) + '::' + geomSig) + '_o' + occOrdinal;
     }
     ```
   - **Why This Guarantees Determinism AND Zero Collision:**
     - **Determinism Across Devices:** Two devices that synced the same legacy lecture prior to Phase 5.1 hold the exact same ordered array `pages[pageKey]` for those historical strokes. When both devices run `normalizeAndRecoverLectureAnnotations()`, the first identical stroke (`occOrdinal = 0`) receives `st_leg_<hash>_o0` on both devices, and the second identical stroke (`occOrdinal = 1`) receives `st_leg_<hash>_o1` on both devices.
     - **Zero Collision Between Duplicates:** Because `_o0 !== _o1`, both identical strokes retain distinct IDs (`_o0` and `_o1`). Erasing the second duplicate tombstones only `_o1`, leaving `_o0` intact.

### E.3 Per-Page Stroke Tombstones (`_deletedStrokes`), Page Clear Barriers (`_clearedAt`), and Audio Pin Tombstones (`_deletedPins`)

Within each lecture's annotation object `annotations[lecId]` (stored in IndexedDB `WorkspaceMediaStore.annotations` under `usr_<uid>::<lecId>`):

```javascript
annotations[lecId] = {
  "1": [ /* active stroke objects with unique .id, .createdLc, .createdDev */ ],
  "extra_1730001": [ /* active stroke objects on extra note sheet */ ],
  "__exo_extra_pages__": [ ... ],
  "__exo_excluded_pages__": [ ... ],
  "__exo_excluded_pages_meta__": {
    // Per-page causal metadata for page exclusion/restoration (N-01)
    "3": { excluded: true, br: 14, cr: 14, lc: 88, dv: "dev_A", d: false }
  },
  "__exo_audio_pins__": { "1": [ ... ] },
  "_deletedStrokes": {
    // Keyed by pageKey ("1", "2", "extra_1730001", etc.) -> Map of strokeId -> tombstone
    "1": {
      "st_leg_9f8a7b6c5d4e3f2a_o0": { br: 14, cr: 15, lc: 91, dv: "dev_A", d: false }
    }
  },
  "_clearedAt": {
    // Keyed by pageKey -> page-wide clear barrier
    "1": { br: 14, cr: 15, lc: 95, dv: "dev_A", d: false }
  },
  "_deletedPins": {
    // Keyed by pageKey -> Map of pinId -> tombstone (N-01)
    "1": {
      "pin_17308200_abc": { br: 14, cr: 15, lc: 96, dv: "dev_A", d: false }
    }
  }
};
```

#### Exact Wiring of All Annotation Deletion & Undo Handlers in `index.html`:
1. **Eraser (`eraseAtPoint` at `index.html:24611–24659`):**
   - Before splicing or filtering any hit stroke `st` from `annotations[p]`, record `recordStrokeTombstone(annotations, p, st.id)`.
2. **Undo (`undoLastStroke` at `index.html:24661–24698`):**
   - When `annotations[p].pop()` removes `poppedStroke`, record `recordStrokeTombstone(annotations, p, poppedStroke.id)` so a stroke that was already synced to another tab/cloud before being undone cannot be resurrected by an additive merge.
   - If the user subsequently Redoes the stroke (`redoLastStroke`), remove `stroke.id` from `_deletedStrokes[p]` and bump `stroke.createdLc = nextLamportTick()`.
3. **Clear Page (`clearCurrentPageAnnotations` at `index.html:24700–24748`) & Clear Extra Note Sheet (`clearExtraNotePage` at `index.html:25241–25253`):**
   - Record `recordStrokeTombstone(annotations, p, st.id)` for every stroke currently on page `p`, AND stamp `annotations._clearedAt[p] = { br: currentBaseRev, cr: 0, lc: nextLamportTick(), dv: myDeviceId, d: true }`.
4. **Floating Text Note Deletion (`index.html:23951, 24044, 24137, 24185`):**
   - Every floating text note deletion handler calls `recordStrokeTombstone(annotations, p, noteStroke.id)` before splicing the text note from `annotations[p]`.
5. **Audio Pin Deletion (`deleteAudioPin` at `index.html:25087–25095`):**
   - Calls `recordAudioPinTombstone(annotations, pageNum, pinId)` before splicing `annotations['__exo_audio_pins__'][pageNum]`.
6. **Lecture Page Exclusion / Restoration (`deleteOrHidePageFromLecture` at `21643` / `restoreDeletedPage` at `21662`):**
   - Stamps `annotations['__exo_excluded_pages_meta__'][pageNum] = { excluded: true|false, br: currentBaseRev, cr: 0, lc: nextLamportTick(), dv: myDeviceId, d: true }` and rebuilds `__exo_excluded_pages__` deterministically by merging per-page `__exo_excluded_pages_meta__` via `resolveFieldConflict`.

#### Exact Annotation Page Merge Algorithm (`mergeLectureAnnotationsWithTombstones(localAnn, remoteAnn, localBaseRev)`):
1. Normalize both `localAnn` and `remoteAnn` via `normalizeAndRecoverLectureAnnotations()` so every legacy stroke has its deterministic `st_leg_<hash>_o<occ>` ID.
2. Union `_deletedStrokes[p]`, `_clearedAt[p]`, and `_deletedPins[p]` across local and remote (keeping the higher `(lc, dv)` entry for any duplicate tombstone key).
3. For each page `p` (`"1"`, `"2"`, `"extra_*"`), inspect the combined stroke set `localAnn[p] ∪ remoteAnn[p]`:
   - Deduplicate by `st.id` (if a floating text note with the same `st.id` was edited in place, resolve its `text`, `x`, `y`, `color` via `(st.updatedLc || st.createdLc, st.updatedDev || st.createdDev)`).
   - **Filter Rule 1 (Explicit Stroke Tombstone):** Drop stroke `st` if `mergedDeletedStrokes[p]?.[st.id]` exists and `(tombstone.lc > (st.updatedLc || st.createdLc || 0))`.
   - **Filter Rule 2 (Page Clear Barrier):** If `mergedClearedAt[p]` exists with barrier `C`, drop any stroke `st` that was already committed at or before `C.br` (`(st.committedRev || 0) <= C.br` and `(st.createdLc || 0) < C.lc`) unless `st` was created locally after the clear barrier (`st.createdLc > C.lc`).

---

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
  │             5. Keep `pharmaWorkspaceDirty = '1'` until the subsequent `pushWorkspaceToCloud(true, 0, opCtx)` succeeds at Supabase and confirms `status === 'ok'`.
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

### F.4 Decoupling Full `annotations` from `localStorage['pharmaAccountWorkspace_<uid>']` & Fixing the 512-Sample Signature Blind Spot (`F-05`, `N-02`, `N-03`)

1. **Eliminating `localStorage` Quota Exhaustion (`F-05`):**
   - Currently, `pushWorkspaceToCloud()` (`index.html:29780–29788`) and `handleCloudSignOut()` (`29019–29059`) serialize the entire `annotationsPayload` object into `localStorage.setItem(accountKey, JSON.stringify(payload))`. Because browser `localStorage` is capped at `~5 MB` across the entire origin while IndexedDB `WorkspaceMediaStore.annotations` + `annotation_recovery_vault` already durably store every lecture's annotations with two-phase vault recovery, duplicating `annotations` into `localStorage` serves no durability purpose and guarantees `QuotaExceededError` once ink data reaches `2–4 MB`.
   - **Fix:** Store `annotations: {}` and `annotationsStoredInIndexedDB: true` inside `localStorage['pharmaAccountWorkspace_<uid>']`. On account switch or offline fallback hydration, hydrate structured workspace metadata from `pharmaAccountWorkspace_<uid>` and hydrate annotations asynchronously from IndexedDB `getAllAnnotationsMapFromDB(opCtx)` (`index.html:29166`).
2. **Replacing 512-Sample Stride Signature (`N-02`):**
   - Replace `computeFastStringSignature(str)` (`index.html:29658–29668`) with a **Full-Length 64-Bit FNV-1a Dual-State Hash (`computeFullStringContentHash64(str)`)** that scans every character (`step = 1`) in linear time (`O(N)` in V8 processes `5 MB` of JS string in `~4.5 ms`, with zero stride blind spots) combined with an explicit monotonic `annotationsMutationCounter` incremented on every stroke/note/pin/page change.
3. **Measurement-Gated Decision on Open-Modal Idle Cloud Annotation Sync (`N-03`):**
   - As verified at `index.html:20349–20355`, local IndexedDB durability on tab close is **already** protected by `pagehide` and `beforeunload` calling `flushPendingAnnotationsSave(false)`, and `visibilitychange -> hidden` (`30284`) triggers `pushWorkspaceToCloud(true)`.
   - Therefore, Phase 5.1 **does NOT blindly add a background cloud-push timer while `#pdfViewerModalOverlay` is open**. Instead, Section H.4 defines the exact empirical benchmark criteria required before enabling any open-modal idle cloud sync.

### F.5 Re-Ordered Milestone Execution Plan (`M1` through `M6`)

Notice that the milestones are strictly ordered so **foundational persistence (`M1`), tombstones (`M2`), entity conflict resolution (`M3`), and stroke tombstones (`M4`) are built and verified BEFORE dirty-login merge (`M5`) and crash-recoverable backup Replace/Merge import (`M6`)** depend on them:

| Milestone | Work Packages | Findings Resolved | Dependencies | Gate Requirement Before Next Milestone |
| :--- | :--- | :--- | :--- | :--- |
| **`M1`** | **`WP-1`:** Immediate conflict-merge `localStorage` persistence (`F-13`), sign-out global `localStorage` sanitization (`F-12`), and brand-new account login `academy_progress` preservation (`F-15`). | `F-12`, `F-13`, `F-15` | None | All existing `335/335` tests + new `M1` unit & E2E tests pass (`0` regressions). |
| **`M2`** | **`WP-2`:** Complete deletion tombstones (`subjects`, `groups`, `lectures`, `wird_logs`, `events`, `backlog`), local IndexedDB cascade cleanup (`pdfs`, `audios`, `rec_*`, `annotations`, `annotation_recovery_vault`), indefinite tombstone retention default, and `_deviceRegistry` watermark structure (`F-02`, `N-01`, partial `F-07` local cleanup). | `F-02`, `N-01` (entity level), local `F-07` cleanup | `M1` | All `M1` tests + new `M2` cascade delete & >90-day offline anti-resurrection tests pass. |
| **`M3`** | **`WP-3`:** Clock-skew-resilient Per-Field Causal Lamport Clock + Base-Revision Ancestor conflict engine (`_meta`, `_fMeta`, `reconcileDirtyFieldMeta`, `resolveFieldConflict`, `_conflictAuditLog`) replacing unstamped `_updatedAt` and hardcoded precedence (`F-14`). | `F-14` | `M1`, `M2` | All `M1–M2` tests + `M3` clock-skew (`±1 hour`), causal vs. concurrent field merge, and OCC retry idempotency tests pass. |
| **`M4`** | **`WP-4`:** Collision-free deterministic legacy stroke IDs (`st_leg_<hash>_o<occ>`), per-page `_deletedStrokes`, `_clearedAt` barriers, `_deletedPins`, and `__exo_excluded_pages_meta__` (`F-04`, `N-01` annotation level). | `F-04`, `N-01` (annotation level) | `M2`, `M3` | All `M1–M3` tests + `M4` duplicate-identical-stroke, eraser/undo/clear-page, floating text note, and audio pin anti-resurrection tests pass. |
| **`M5`** | **`WP-5` & `WP-6`:** Dirty-state login & pull reconciliation (`F-03`) wired to the verified `M3/M4` merger; decoupling full `annotations` from `localStorage['pharmaAccountWorkspace_<uid>']` (`F-05`); and full-string `step=1` content hash (`N-02`). | `F-03`, `F-05`, `N-02` | `M3`, `M4` | All `M1–M4` tests + `M5` dirty-login reconciliation, `localStorage` quota isolation, and 1-char equal-length annotation edit signature detection tests pass. |
| **`M6`** | **`WP-7` & `WP-8`:** Tier A `v4` complete JSON backup export (with one-shot Web Crypto `SHA-256` and zero duplicate root aliases), Crash-Recoverable Import Recovery Journal (`__import_journal_v1__`), explicit `Replace` vs. `Merge` modal (with `Merge` powered by `M3/M4/M5`), and actionable client diagnostics for `F-01` (`F-09`, `F-01`). | `F-09`, `F-01` (client diagnostics) | `M3`, `M4`, `M5` | Full 5-tier verification suite passes (`npm test` — `335` baseline + all new Phase 5.1 tests). |

---

## SECTION G — Corrected Test Engineering Plan & Verification Matrix

### G.1 Verified Repository Test Baseline (`335/335` Passing at Source SHA `c211d034eb074c43f74eee480b8186e58868dc80`)

Per `package.json`, `run_all_tests.js`, and `reports/CURRENT.md`, the repository has **five** verification tiers and installs only `express`, `@electric-sql/pglite`, `pg`, and `playwright` (no `jsdom` or `fake-indexeddb` packages exist in `package.json`):

| Tier | NPM Script (`package.json`) | Exact Test File(s) Executed | Runtime & Harness Technique | Verified Baseline Count |
| :--- | :--- | :--- | :--- | :---: |
| **Tier 1: Static** | `npm run test:static` | `run_verification_tests.js` | Node `fs` AST/source contract inspection of `index.html`, `server.js`, `sw.js`, and SQL migrations. | **`54 / 54`** |
| **Tier 2: Unit** | `npm run test:unit` | 1. `run_comprehensive_verification.js` (`29`)<br>2. `test_phase3_cross_account_isolation.js` (`38`)<br>3. `test_phase4_regressions.js` (`35`) | Pure Node.js using `extractFunctionSource(indexHtmlContent, funcName)` + `new Function(...)` / Node `vm` + custom in-memory `Map`-backed `MockIDBDatabase` and `localStorage` doubles built directly inside those test files. | **`102 / 102`** |
| **Tier 3: PGlite** | `npm run test:pglite` | `test_phase4_2_postgres_integration.js` | In-process PostgreSQL engine (`@electric-sql/pglite`) executing repository migrations, RLS policies, grants, triggers, and `upsert_user_workspace_occ`. | **`41 / 41`** |
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
| **`T-5.1-05`** | `test_phase4_regressions.js` | Node `vm` (`extractFunctionSource`) | **`F-02` / Section C >90-Day Offline Device Anti-Resurrection Test:** Simulates Device A deleting Subject S1 and advancing workspace revision by `+120` revisions and simulated `+180 days`, after which Device B (last synced before the deletion, `180 days` stale) reconnects and runs `mergeAndApplyCloudConflict()`. Asserts S1 tombstone is retained and S1 is **not** resurrected. Also verifies `canCompactTombstoneSafely(T, _deviceRegistry)` returns `false` while Device B's watermark lags `T.cr`. |
| **`T-5.1-06`** | `test_phase4_regressions.js` | Node `vm` (`extractFunctionSource`) | **`F-14` / Section B Clock-Skew Immunity (`±1 Hour`) & Causal vs. Concurrent Field Merge:**<br>1. Device A (wall clock `+1h` fast) edits `lec.name` and commits at `rev = 21`; Device B (wall clock `-1h` slow, `baseRev = 20`) edits `lec.status` and merges -> asserts BOTH `lec.name` (Device A) and `lec.status` (Device B) win.<br>2. Device A and Device B concurrently edit the *same* field `lec.name` with 1-hour clock skew -> asserts winner is chosen strictly by `(lc, dv)` regardless of `Date.now()`, and overridden value is logged in `_conflictAuditLog`.<br>3. Verifies idempotency: `merge(merge(L, R), R)` equals `merge(L, R)` across repeated OCC `409` retries. |
| **`T-5.1-07`** | `test_phase4_regressions.js` & `test_phase4_1_chromium_e2e.js` | Node `vm` + Playwright Chromium E2E | **`F-04` / Section E Duplicate Identical Legacy Strokes & Stroke/Page/Pin Tombstones:**<br>1. Creates a legacy page containing **two identical strokes** (identical tool, color, size, and coordinates) with no `.id`. Runs `normalizeAndRecoverLectureAnnotations()` on two independent devices -> asserts both devices assign `_o0` to the first and `_o1` to the second.<br>2. Erases `_o1` on Device A and merges with Device B -> asserts `_o1` is removed and `_o0` survives.<br>3. Tests `undoLastStroke()`, `clearCurrentPageAnnotations()`, `clearExtraNotePage()`, floating text note deletion, `deleteAudioPin()`, and `deleteOrHidePageFromLecture()` across conflict merge -> asserts zero resurrection. |
| **`T-5.1-08`** | `test_phase4_regressions.js` & `test_phase4_1_chromium_e2e.js` | Node `vm` + Playwright Chromium E2E | **`F-03` Dirty-State Login & Manual Pull Reconciliation:** Modifies subjects, schedule, and PDF annotations while offline (`pharmaWorkspaceDirty = '1'`, `dirtyAnnotationsForCloud = true`), then triggers `syncWorkspaceOnLogin()` and `pullWorkspaceFromCloud(false)` against an older cloud row. Asserts local dirty edits are merged rather than overwritten, and `pharmaWorkspaceDirty` remains `'1'` until push confirmation. |
| **`T-5.1-09`** | `test_phase4_regressions.js` | Node `vm` (`extractFunctionSource`) | **`F-05` & `N-02` `localStorage` Annotation Decoupling & 1-Char Equal-Length Signature Detection:**<br>1. Asserts `pharmaAccountWorkspace_<uid>` stores `annotationsStoredInIndexedDB: true` and does not embed the multi-MB `annotations` map in `localStorage`.<br>2. Modifies a single 7-character color code (`#ef4444` -> `#38bdf8`) inside a `100 KB` serialized annotation payload and asserts `computeFullStringContentHash64()` produces a distinct signature every time. |
| **`T-5.1-10`** | `test_phase4_1_chromium_e2e.js` | Playwright Chromium E2E (Real Web Crypto + Real IDB + Simulated Faults) | **`F-09` / Section D Tier A `v4` Backup Export, One-Shot `SHA-256` Integrity, and Crash-Recoverable Import Journal Rollback:**<br>1. Exports a complete `v4` workspace including IndexedDB `annotations`, `weeklyReports`, `plannerPrefs`, `completedAcademyModules`, `cloudMediaRegistry`, and `_tombstones`; verifies zero duplicate root aliases and valid `crypto.subtle.digest('SHA-256', ...)` digest.<br>2. Corrupts 1 byte in `data` and asserts `v4` import rejects before mutation.<br>3. Injects a fault/reload during Stage 2 (`APPLYING_IDB_ANNOTATIONS`) and Stage 3 (`APPLYING_LOCALSTORAGE` `QuotaExceededError`), reloads the page, and asserts `recoverPendingImportJournalOnStartup()` restores 100% of pre-import `localStorage` and IndexedDB `annotations`. |

---

## SECTION H — Free vs. VIP Boundaries, Media Access Matrix, Policy Escalations & Read-Only Supabase Preflight

### H.1 Permanent `Free` vs. `VIP` Entitlement Boundary (`GEMINI.md` Section 6)

Phase 5.1 strictly enforces the permanent product policy in `GEMINI.md` Section 6:
- **`Free` Baseline Capabilities (Never Gated by `can_upload_media`):**
  - Full management of subjects, groups, lectures, continuous Wird logs, study schedule, backlog tasks, weekly reports, planner preferences, and study logs.
  - Full local persistence in `localStorage` and IndexedDB (`WorkspaceMediaStore.annotations` and `annotation_recovery_vault`), including handwritten ink, floating text notes, extra note sheets (`extra_*`), page exclusion, and audio pins on locally loaded PDFs.
  - Full cloud synchronization of structured workspace data and annotations via Supabase `user_workspaces` (`upsert_user_workspace_occ`) for any authenticated user.
  - Full **Tier A Workspace & Annotations JSON Backup Export and Crash-Recoverable Import (`F-09`)**.
- **`VIP` Manual Entitlement (`public.user_workspaces.can_upload_media = TRUE`):**
  - Managed exclusively by the Owner flipping `can_upload_media` between `FALSE` and `TRUE` in `public.user_workspaces`.
  - No subscription tables, payment gateways, billing timers, or automated WhatsApp activations are ever introduced.

### H.2 Four-Way Media Access & Permission Matrix (`GEMINI.md` Section 7)

To avoid any false assumptions about Google Drive access for `Free` vs. `VIP` users, Phase 5.1 documents the four distinct media storage states in `index.html`:

| Media State | How It Is Identified in `index.html` | Who Can Open / Play / Annotate It? | Phase 5.1 Rules & Constraints |
| :--- | :--- | :--- | :--- |
| **1. Local IndexedDB Media (`pdfs` / `audios` blob present locally)** | `localMediaStatusCache.pdfs.has(String(lec.id))` or `getMediaFromDB('pdfs', lec.id)` returns a `Blob` (`index.html:21238–21244`). | **Any user (`Free` or `VIP`) on that local device**, online or offline, with full Exo PDF Studio ink, extra notes, and audio pins. | Deleting a lecture locally (`WP-2`) cleans up the local IndexedDB `pdfs`/`audios`/`rec_*` blobs on that device without deleting any remote Google Drive file. |
| **2. Public / External Direct URL (`externalUrl`)** | `lec.pdfUrl` / `lec.driveUrl` points to an external URL or a file that the owner explicitly shared outside Exo. | Accessible according to the external URL's own HTTP/sharing permissions. | Exo never automatically converts private files into public (`type: 'anyone'`) links (`index.html:28295–28297`). |
| **3. Private Google Drive File (`cloudDriveFileId` / `driveId` in `Exo_Workspace`)** | Created with private-by-default permissions (`index.html:28295–28297`). Downloaded via `downloadMediaFromCloudAccount()` (`28364–28475`) using `Authorization: Bearer <gdrive_token>`. | **Requires a valid Google OAuth token (`exo_gdrive_token`) for a Google account that has Drive permission to read that `fileId`.** A `Free` user (or another Google account) **cannot** download or view a private Drive file unless their Google account actually holds Google Drive read permission on that file. | Never claim or assume that `Free` users can download private Google Drive files without valid Google OAuth permissions. (OAuth token refresh and `401` interactive retry UX are deferred to Phase 5.2 `F-06` / `F-10`). |
| **4. Uploading / Managing Cloud Media in Google Drive (`uploadMediaToCloudAccount`, `syncAllLocalMediaToCloud`)** | Guarded by `canCurrentUserUploadMedia()` (`index.html:26789–26791`, reading server-authoritative `currentCloudWorkspaceCanUploadMedia` from `public.user_workspaces.can_upload_media`). | **`VIP` only (`can_upload_media === true`).** | Server-authoritative entitlement check (`user_workspaces.can_upload_media`) remains mandatory; users can never self-grant `can_upload_media`. |

### H.3 Escalated Product Policy Contradiction Requiring Owner Decision (`N-04` — `exportAnnotatedSlides`)

Per `GEMINI.md` Section 6 & Section 12, the following contradiction in `index.html` is documented and **held for an explicit Owner decision before any change is made to it**:
- **Evidence in `index.html`:**
  1. At `index.html:25360–25361`, `async function exportAnnotatedSlides()` is preceded by the comment:
     `// --- Export Annotated Slides to New PDF (Free and open for all accounts on all devices) ---`
     and the function body (`25360–25539`) contains **no** `canCurrentUserUploadMedia()` check. Furthermore, the toolbar button `#pdfToolbarExportPdfBtn` (`7533`) and mobile menu button `#pdfMenuExportPdfBtn` (`7580`) bind `onclick="exportAnnotatedSlides()"`, so clicking them currently executes the annotated PDF download for `Free` users.
  2. However, at `index.html:25124–25139`, `syncExtraNoteButtonsLockUI()` loops over `['pdfToolbarExportPdfBtn', 'pdfMenuExportPdfBtn']` and applies `.vip-locked-extra-note` styling, a `🔒` badge, and the tooltip `'تصدير المحاضرة مع الملاحظات كملف PDF متاح فقط في باقة VIP (Cloud Pro)'` whenever `!canCurrentUserUploadMedia()`.
- **Owner Decision Requested (Do Not Modify Until Owner Selects Option A or Option B):**
  - **Option A (Free Annotated PDF Export):** Keep `exportAnnotatedSlides()` Free as stated in the function comment at line `25360`, and remove `'pdfToolbarExportPdfBtn'` / `'pdfMenuExportPdfBtn'` from the VIP lock loop in `syncExtraNoteButtonsLockUI()` (`25124–25139`) while keeping Extra Note Sheet creation (`addExtraNotePageFromToolbar`) VIP-locked.
  - **Option B (VIP-Gated Annotated PDF Export):** Keep the VIP lock UI in `syncExtraNoteButtonsLockUI()` (`25124–25139`), update the stale comment at `25360`, and add `if (!canCurrentUserUploadMedia()) { showVipUpgradePromptModal(); return; }` at the top of `exportAnnotatedSlides()`.

### H.4 Measurement-Gated Decision Criteria for Open-Modal Idle Cloud Annotation Sync (`N-03`, `F-05`)

Because local IndexedDB durability on tab close/hide is already guaranteed by `pagehide` (`index.html:20349`), `beforeunload` (`20353`), and `visibilitychange -> hidden` (`30284`), adding a periodic cloud push while `#pdfViewerModalOverlay` remains open (`isPdfModalOpenNow === true` at `29718`) carries JSONB write-amplification risks (`F-05`).
- **Phase 5.1 Rule:** Do **not** enable an automatic open-modal cloud push timer by default in Phase 5.1.
- **Measurement Gate (for Phase 5.1 M5 / Phase 5.3 Evaluation):** In Milestone `M5`, benchmark via `test_phase4_1_chromium_e2e.js`:
  1. IndexedDB `getAllAnnotationsMapFromDB(opCtx)` read + `computeFullStringContentHash64()` time on a 50-page annotated lecture (`target < 25 ms` main-thread blocking time).
  2. Serialized `user_workspaces` JSONB payload size (`target < 1.5 MB` for background idle sync).
  - Until per-lecture delta annotation sync (`Phase 5.3` `F-05`) separates lecture annotations from the monolithic `user_workspaces` row, cloud annotation sync triggers only on: (a) `closePdfViewer()` (`25541`), (b) `visibilitychange -> hidden` (`30284`), or (c) explicit user tap on the Cloud Sync button.

### H.5 Read-Only Owner-Side Supabase Preflight Checklist (`F-01` — Project `dszjmgzzqpdrdjkycvht`)

Per `GEMINI.md` Section 4 & Section 8:
- Gemini **never** connects to live Supabase project `dszjmgzzqpdrdjkycvht` and **never** recommends running `supabase/schema.sql` as a blanket fix on an existing database.
- Before relying on live cloud sync in production, the **Owner** may run the following **strictly read-only diagnostic query** in the Supabase SQL Editor for project `dszjmgzzqpdrdjkycvht` to inspect the live schema state:

```sql
-- STRICTLY READ-ONLY DIAGNOSTIC QUERY FOR OWNER EXECUTION ON dszjmgzzqpdrdjkycvht
-- Performs zero DDL and zero DML.

-- 1. Check user_workspaces columns, types, and nullability
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_workspaces'
ORDER BY ordinal_position;

-- 2. Check RLS enabled state & forced RLS on user_workspaces
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'user_workspaces';

-- 3. Check active RLS policies on user_workspaces
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_workspaces';

-- 4. Check triggers on user_workspaces (e.g., protect_user_workspaces_entitlements, set_user_workspaces_updated_at)
SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS trigger_def
FROM pg_trigger
WHERE tgrelid = 'public.user_workspaces'::regclass AND NOT tgisinternal;

-- 5. Check upsert_user_workspace_occ RPC signature, owner (exo_occ_rpc_definer), security_definer, and search_path
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_function_result(p.oid) AS return_type,
       r.rolname AS function_owner,
       p.prosecdef AS is_security_definer,
       p.proconfig AS function_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public' AND p.proname = 'upsert_user_workspace_occ';

-- 6. Check table & column ACL grants on user_workspaces and execute grants on upsert_user_workspace_occ
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'user_workspaces';
```

#### Explicit Limits of What Existence Checks Prove (`GEMINI.md` Section 8):
- Verifying only that table `public.user_workspaces` or column `can_upload_media` exists does **not** verify:
  1. That `public.upsert_user_workspace_occ(jsonb, jsonb, jsonb, bigint)` exists with its 4-parameter `(p_subjects, p_schedule, p_logs, p_expected_revision)` signature and returns the expected JSONB `{ status, revision, updated_at, can_upload_media, ... }` contract.
  2. That `upsert_user_workspace_occ` is owned by the dedicated least-privilege definer role `exo_occ_rpc_definer` (`supabase/migrations/20261103160000_phase4_2_4_least_privilege_definer_and_search_path.sql`) with locked `search_path = public, pg_temp` and `EXECUTE` granted only to `authenticated` and `service_role`.
  3. That column-level `INSERT`/`UPDATE` privileges on `can_upload_media` are revoked from `authenticated` and `anon`, and that the `protect_user_workspaces_entitlements` trigger is enabled (`tgenabled = 'O'`).
  4. That all four RLS policies (`Users can view/insert/update/delete their own workspace` enforcing `auth.uid() = user_id`) are active.
- If the owner's read-only diagnostic output reveals any discrepancy between `dszjmgzzqpdrdjkycvht` and the repository migrations (`20261103133622` through `20261103160000`), a targeted, non-destructive forward remediation plan will be prepared based on the exact read-only query output before any SQL is executed.
