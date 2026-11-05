# Exo Academic Platform — Phase 5.0 (Revised 5.0.2): Storage, Synchronization & Google Drive Architecture Audit

- **Repository:** `JemistryMC/study-hub`
- **Active Branch:** `main`
- **Verified Base SHA (`main`):** `c211d034eb074c43f74eee480b8186e58868dc80`
- **Workspace Verification:** 51/51 tracked repository files verified against `c211d034eb074c43f74eee480b8186e58868dc80` (`0` modified source files, `0` deleted files)
- **Reviewed `index.html` Size:** `32,324` logical lines (`32,323` newline delimiters; no final newline; `3,286,646` bytes)
- **Latest Verified CI Run on Base SHA:** GitHub Actions Run `41857800822` (`SUCCESS`)
  - **Static & Crypto (`run_verification_tests.js`):** `54/54`
  - **Unit (`run_comprehensive_verification.js` + `test_phase3_cross_account_isolation.js` + `test_phase4_regressions.js`):** `102/102`
  - **PGlite (`test_phase4_2_postgres_integration.js`):** `41/41`
  - **PostgreSQL 16 (`test_phase4_2_1_pg16_concurrency.js`):** `96/96`
  - **Headless Chromium E2E (`test_phase4_1_chromium_e2e.js`):** `42/42`
  - **Total Verified Assertions:** `335/335`
- **Task Classification:** Audit & Discovery Report Only (Zero source code, schema, migration, or test modifications; zero live service connections)

---

## 1. Executive Summary (Plain Language)

Exo is an offline-first, single-page academic study studio (`index.html`, 32,324 logical lines — 32,323 newline delimiters, no final newline) served as static files by `server.js` and cached for offline use by `sw.js`. It uses a **four-tier client-centric storage architecture**:

1. **Browser `localStorage` & `sessionStorage`:** Stores active workspace metadata (`pharmaSubjectsV4`, `pharmaScheduleV4`, `pharmaScheduleBacklogV1`, `pharmaPlannerPrefsV1`, `pharmaWeeklyReportsV1`, `pharmaLogsV4`, `pharmaAcademyProgressV1`), a per-account local fallback snapshot (`pharmaAccountWorkspace_<uid>`), a media upload fingerprint registry (`pharmaCloudMediaRegistryV1`), per-account deletion tombstones (`pharmaTombstones_<uid>`), and Google Drive OAuth2 connection state (`exo_gdrive_token`, `exo_gdrive_token_exp`, `pharmaGdriveSync_<uid>`).
2. **Browser IndexedDB (`WorkspaceMediaStore`, v4):** Stores binary lecture media (`pdfs` and `audios` object stores) and tablet handwriting/text annotations (`annotations` object store plus write-ahead crash recovery store `annotation_recovery_vault`). All records enforce a strict dual-ownership contract (`id = "usr_<sanitizedUid>::<rawId>"` and `record.userId = "<canonicalUid>"`).
3. **Supabase Cloud (`auth.users`, `public.user_workspaces`, dormant `storage.buckets['lecture_media']`):** Provides user authentication and stores the user's structured workspace—and, when synchronized, the map of all lecture annotations—inside a single row per user in `public.user_workspaces`, written via the Optimistic Concurrency Control (OCC) RPC `public.sync_workspace_with_concurrency(p_payload, p_expected_revision)`.
4. **Google Drive REST API v3 (Client-Side GIS OAuth2):** Serves as the active cloud binary store for lecture PDFs and primary lecture audio recordings under a folder hierarchy (`Exo_Workspace/<Subject>/<Group>`).

### Key Takeaways for the Owner

- **What is verified and strong today:**
  - **Cross-account local isolation (Phase 4.1)** is verified by automated unit and Chromium E2E tests: `createAccountOperationContext()` (`index.html:19358`) binds asynchronous work to a monotonic session generation epoch, IndexedDB reads and writes enforce dual ownership (`hasStrictDualRecordOwnership`, `index.html:19473`), foreign-prefixed keys throw `CROSS_ACCOUNT_KEY_VIOLATION` (`index.html:19457`), and uncommitted ink strokes flush through a two-phase write-ahead vault (`annotation_recovery_vault` -> `annotations`, `index.html:20205–20347`).
  - **PostgreSQL 16 schema and OCC security (Phase 4.2.4.4.1)** is verified in CI (`96/96` PostgreSQL 16 checks): direct table mutations on `public.user_workspaces` are blocked by privilege revocation and trigger enforcement (`trg_enforce_workspace_write_via_rpc`), requiring writes to pass through the `exo_occ_rpc_definer` RPC.
- **What requires attention before or during Phase 5 implementation:**
  1. **Unverified Live Supabase Deployment State (`F-01`, Owner-Side Verification Required):** The owner confirmed that the repository's SQL migrations have not been applied to the live Supabase project (`dszjmgzzqpdrdjkycvht`). Because this audit did not connect to live Supabase, it is unknown whether the live database already has a manually created schema matching `sync_workspace_with_concurrency` or whether schema alignment is still needed. In the actual client code (`index.html:29799–29811`), `pushWorkspaceToCloud()` calls `sync_workspace_with_concurrency` and throws on RPC errors (`throw rpcErr;`) without any direct-table `.upsert()` fallback—so if the RPC or schema is unavailable on the live database, cloud sync fails with `'error'` and retains dirty local state (`pharmaWorkspaceDirty = '1'`), subject to local persistence limitations.
  2. **UI Deletions Never Record Tombstones or Clean Up Local IndexedDB Media (`F-02`, Confirmed `P1`):** `recordTombstone()` (`index.html:29407`) and `deleteMediaFromDB()` (`index.html:19913`) have **zero call sites** in `index.html`, and no `groups` or `backlog` tombstone category exists (`index.html:29404`). Deleting a subject, group, lecture, or schedule session leaves orphaned blobs and annotations in local IndexedDB and allows deleted items to resurrect during conflict merges.
  3. **Login & Cloud Pull Overwrite Unsynced Offline Edits (`F-03`, Confirmed `P1`):** `syncWorkspaceOnLogin()` (`index.html:30168–30200`) and `pullWorkspaceFromCloud()` (`index.html:30093–30114`) unconditionally call `applyCloudWorkspacePayload()`, replacing local state and clearing `pharmaWorkspaceDirty` (`index.html:30065`) even when the same user has unsynced offline edits.
  4. **Incomplete Conflict Merge Rules, Missing Version Ordering & Stroke Resurrection (`F-04`, `F-14`, Confirmed `P1`) Plus Stale Global Schedule Keys After Merge (`F-13`, Confirmed `P2`):** Despite its comment, `mergeAndApplyCloudConflict()` (`index.html:29439–29652`) is a two-way heuristic merge with no common ancestor snapshot: it performs an additive-only union of strokes (resurrecting erased/undone ink, `F-04`), combines hardcoded local/remote merge precedence with `_updatedAt` checks where `_updatedAt` is **never stamped** by any edit handler (and where wall-clock `Date.now()` alone would still be vulnerable to device clock skew, `F-14`), and updates `scheduleEvents`/`scheduleBacklog` in memory without immediately persisting the global `pharmaScheduleV4` or `pharmaScheduleBacklogV1` keys (`F-13`, leaving a 1,200ms durability window before the per-account vault `pharmaAccountWorkspace_<uid>` is written at `29779–29788` and leaving global boot keys stale).
  5. **Google Drive OAuth Token Storage, Partial `401` Handling & `drive.readonly` Scope Trade-Off (`F-06`, Confirmed `P1`):** The raw GIS bearer token is persisted in `localStorage['exo_gdrive_token']` (`index.html:27508, 27592`). While `ensureGoogleAccessToken(false)` (`index.html:27541–27543`) attempts a non-interactive GIS request (with a 2.5s timeout) and upload initiation (`27998`) and interactive downloads (`28395`) have specific `401` retry branches, normal lecture opens call `downloadMediaFromCloudAccount` with `interactive = false` (`21382`), bypassing the `401` retry. Narrowing the scope from `drive.readonly` + `drive.file` to `drive.file` is desirable for least privilege but requires an explicit product decision regarding the Drive privacy scanner (`auditAndManageGoogleDrivePermissions`, `27288`) and external Drive links (`12543`), where Google Picker (`google.picker` / `PickerBuilder`, not currently implemented in `index.html`) is a proposed future integration option.
  6. **Scalability Risk in Per-Account `localStorage` Vault & Monolithic `annotations` Sync (`F-05`, Confirmed `P2` Risk):** Annotations are conditionally included in cloud pushes (`index.html:29719–29773`), but `pushWorkspaceToCloud()` (`29780–29788`) and `handleCloudSignOut()` (`29019–29054`) reserialize the full workspace—including previously backed-up `annotations`—into `localStorage['pharmaAccountWorkspace_<uid>']`. Representative payload measurements should guide whether `localStorage` vault decoupling alone is sufficient or whether per-lecture cloud storage is warranted later.
  7. **Secondary Recordings (`rec_*`), Drive Re-Upload Duplicates, Backup Completeness Tiers & Post-Logout Keys (`F-07`–`F-12`, `F-15`, Confirmed `P2`/`P3`):** Secondary audio recordings (`lec.recordings[]`) are saved to IndexedDB (`21506`) but never uploaded/downloaded; `uploadMediaToCloudAccount()` (`28181`) ignores `forceReplace` (`12575`) and always `POST`s a new Drive file; `exportData()` (`19051`) omits annotations and several workspace fields (requiring an honest distinction between Tier A Workspace State JSON Backups and Tier B Full Media ZIP Archives, alongside reconsidering the 15 MB import cap at `19075`); `handleCloudSignOut()` (`29104`) leaves unscoped `localStorage` keys populated; and the new-account branch of `syncWorkspaceOnLogin()` (`30203`) omits `academy_progress`.

---

## 2. Verified Current Architecture

### 2.1 High-Level Component & Runtime Topology

Exo runs as a zero-build static web application (`build.js` performs JavaScript syntax verification only) served by a Node.js static file server (`server.js`) and cached by a Service Worker (`sw.js`).

```
+---------------------------------------------------------------------------------------------------+
|                     BROWSER CLIENT (index.html: 32,324 logical lines / 32,323 \n + sw.js)         |
|                                                                                                   |
|  +-----------------------------+   +------------------------------+   +------------------------+  |
|  | Module 1-3: Core Hub,       |   | Module 4: exo-pdf-audio-     |   | Module 5: exo-academy- |  |
|  | Schedule & Tracker          |   | studio.js (Lines 19239-25581)|   | guide.js (25584-26128) |  |
|  | (Lines 10930 - 19236)       |   | - IndexedDB v4 Media & Annos |   +------------------------+  |
|  | - Subjects, Groups, Lecs    |   | - Two-Phase Recovery Vault   |                               |
|  | - Weekly Schedule & Backlog |   | - PDF.js Canvas + Silk Ink   |   +------------------------+  |
|  | - Study Logs & Exam Radar   |   | - Merged Multi-Lec Stream    |   | Module 6: exo-cloud-   |  |
|  | - 300 DPI Schedule PDF Gen  |   | - Multi-Recording Audio Dock |   | sync.js (26131-31922)  |  |
|  | - JSON Export / Import      |   | - Audio Player & Pinning     |   +-----------+------------+  |
|  +--------------+--------------+   +--------------+---------------+               |               |
|                 |                                 |                               |               |
|                 v                                 v                               v               |
|  +-----------------------------+   +------------------------------+   +------------------------+  |
|  | Browser localStorage        |   | Browser IndexedDB            |   | In-Memory Caches       |  |
|  | - pharmaSubjectsV4          |   | DB: WorkspaceMediaStore (v4) |   | - sessionMediaBlobRam  |  |
|  | - pharmaScheduleV4          |   | - pdfs (usr_<uid>::<lecId>)  |   |   (20-item FIFO on put)|  |
|  | - pharmaLogsV4              |   | - audios (usr_<uid>::<id>)   |   | - localMediaCache      |  |
|  | - pharmaAccountWorkspace_*  |   | - annotations (scoped key)   |   | - inMemoryAnnotations  |  |
|  | - exo_gdrive_token (OAuth)  |   | - annotation_recovery_vault  |   | - pendingAnnoSaveMap   |  |
|  +-----------------------------+   +------------------------------+   +------------------------+  |
+-----------------|---------------------------------|-------------------------------|---------------+
                  |                                 |                               |
                  | HTTPS (REST / RPC / Auth)       | HTTPS (Drive API v3 XHR/Fetch)|
                  v                                 v                               |
+-----------------------------------+   +-------------------------------------------+
| SUPABASE CLOUD                    |   | GOOGLE DRIVE REST API v3                  |
| Project: dszjmgzzqpdrdjkycvht     |   | OAuth Client: 814351723102-...            |
| - GoTrue Auth (JWT Session)       |   | - GIS Token Flow (drive.readonly + file)  |
| - Postgres: public.user_workspaces|   | - Hierarchy: Exo_Workspace/<Sub>/<Group>  |
| - RPC: sync_workspace_with_       |   | - Resumable Upload Session + XHR PUT      |
|        concurrency(jsonb, int)    |   | - Authenticated alt=media + Public/Iframe |
| - Storage: lecture_media (dormant)|   |   Fallbacks                               |
+-----------------------------------+   +-------------------------------------------+
```

### 2.2 Service Worker (`sw.js`) & HTTP Server (`server.js`) Behavior
- **`server.js` (`lines 1–68`):** Static Node `http.createServer` listening on `0.0.0.0:3000`. Serves `.html`, `.js`, and `.json` with `Cache-Control: no-store, no-cache, must-revalidate` and static binary/font assets with `public, max-age=86400`. Contains no backend API routes, database connections, or OAuth secret exchange endpoints.
- **`sw.js` (`lines 1–102`):** Implements cache `exo-study-cache-v4`:
  - **Explicitly bypasses** all requests to `supabase.co`, `googleapis.com`, `accounts.google.com`, `gstatic.com`, and `googleusercontent.com` (`sw.js:65–72`).
  - Uses **Network-First with Cache Fallback** for HTML navigation (`index.html`, `sw.js:75–86`).
  - Uses **Cache-First with Background Update (`stale-while-revalidate`)** for same-origin static assets and CDN libraries (`sw.js:89–100`).

---

## 3. Data Inventory & Storage Mapping

| Data Category | Current Storage | Write Path | Read Path | Sync Behavior | Persistence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Subjects, Groups/Chapters & Lecture Metadata** (titles, completion status, Ebbinghaus spaced repetition `reviewCount`/`lastStudiedAt`, reading bookmarks `lastPageNum`/`lastAudioSec`, exam radar `examDate`/`examTitle`/`examLectureIds`, custom blank pages `customPages`, hidden pages `deletedPages`, continuous subject `continuousBookmark`/`continuousLogs`, Drive metadata `cloudPdfDriveId`/`cloudAudioDriveId`) | **Primary Local:** `localStorage['pharmaSubjectsV4']`<br>**Per-Account Local Vault:** `localStorage['pharmaAccountWorkspace_<uid>']`<br>**Cloud:** `public.user_workspaces.subjects` (`jsonb`) | `saveSubjects()` (`index.html:11377`) writes `pharmaSubjectsV4` and calls `markLocalWorkspaceModified()` -> 4,000ms debounced `pushWorkspaceToCloud()` (`index.html:29684–29688`) -> `sync_workspace_with_concurrency` RPC (`index.html:29799`) | Initialized at boot from `localStorage['pharmaSubjectsV4']` (`index.html:11256`); overwritten on login/pull by `applyCloudWorkspacePayload()` (`index.html:29981–29984`) | Synced automatically (4s debounce on edit, on `online` at `30269`, and on `visibilitychange` -> `hidden` at `30278`). Merged in `mergeAndApplyCloudConflict()` (`index.html:29528–29572`). | Durable locally (`localStorage`) & in Supabase (`user_workspaces.subjects`), except `pharmaSubjectsV4` is an unscoped key left populated after `handleCloudSignOut()` (`29104`). |
| **2. Lecture PDF Binary Files** | **Primary Local:** IndexedDB `WorkspaceMediaStore` -> `pdfs` store (`keyPath: 'id'`, key `usr_<sanitizedUid>::<lecId>`) + RAM `sessionMediaBlobRamCache.pdfs`<br>**Cloud:** Google Drive (`Exo_Workspace/<Subject>/<Group>/<Title>.pdf`); legacy download fallback for Supabase Storage `lecture_media` | `saveMediaToDB('pdfs', lecId, blob)` (`index.html:19986–20053`) writes to IndexedDB `pdfs` and caches in `sessionMediaBlobRamCache.pdfs` (capped at 20 entries on write, `20030`). Cloud upload via `uploadMediaToCloudAccount('pdfs', lecObj, blob)` (`index.html:28181`) -> `uploadBlobToGoogleDriveViaXHR()` (`index.html:27972`). | `getMediaFromDB('pdfs', lecId)` (`index.html:20055–20133`) checks `sessionMediaBlobRamCache.pdfs` (validating `%PDF-` via `isValidPdfBlob` at `20075`) then IndexedDB `pdfs` with `hasStrictDualRecordOwnership()` (`20102`). If missing locally, `openLectureDocument()` (`index.html:21382`) calls `downloadMediaFromCloudAccount('pdfs', lec)` (`index.html:28364`), falling back to Google Drive `/preview` iframe (`index.html:21398`). | **Manual or Opt-In Auto-Upload** (requires VIP `can_upload_media === true` + linked Google Drive + active GIS token). Note: `validateFileCloudSizeLimit()` (`index.html:27440–27447`) returns `{ allowed: true, maxMB: 9999 }`, bypassing `VIP_MEDIA_LIMITS_CONFIG` (`26792`). | Durable in IndexedDB per-account (`usr_<uid>::<lecId>`) and in Google Drive. Never deleted by `triggerDeleteLecture` (`12585`). |
| **3. Primary Lecture Audio Recording** | **Primary Local:** IndexedDB `WorkspaceMediaStore` -> `audios` store (`keyPath: 'id'`, key `usr_<sanitizedUid>::<lecId>`) + RAM `sessionMediaBlobRamCache.audios`<br>**Cloud:** Google Drive (`Exo_Workspace/<Subject>/<Group>/<Title> (تسجيل صوتي).<ext>`) | `saveMediaToDB('audios', lecId, blob)` (`index.html:19986`). Cloud upload via `uploadMediaToCloudAccount('audios', lecObj, blob)` (`index.html:28181`). | `getMediaFromDB('audios', lecId)` (`index.html:20055`), called by `openLectureDocument()` (`index.html:21329`). If missing locally, calls `downloadMediaFromCloudAccount('audios', lec)` (`21331`). | Same as PDFs (VIP gated, Google Drive backed). | Durable in IndexedDB per-account (`usr_<uid>::<lecId>`) and in Google Drive. |
| **4. Additional Lecture Audio Recordings (`lec.recordings[]`)** | **Metadata:** `lec.recordings` array inside `subjects` (`localStorage['pharmaSubjectsV4']` & Supabase `subjects` JSONB)<br>**Binary Blob:** IndexedDB `audios` store under `usr_<sanitizedUid>::rec_<timestamp>` | `addRecordingToCurrentLecture()` (`index.html:21496–21533`) creates `recId = 'rec_' + Date.now()`, calls `saveMediaToDB('audios', recId, file)` (`21506`), and pushes metadata to `lec.recordings` (`21508`). | `switchLectureRecording(recId)` (`index.html:21535–21566`) calls `getMediaFromDB('audios', rec.dbKey \|\| rec.id)` (`21551`). | **Metadata syncs** (inside `subjects` JSONB), **but binary audio blobs for `rec_*` NEVER sync to Google Drive or Supabase!** Upload/download paths (`28528, 28576, 28667, 28816`) only query `getMediaFromDB('audios', lec.id)`. | **Local-device only for binaries.** On a second device, `lec.recordings` lists the recording names, but selecting a `rec_*` item cannot fetch its audio from the cloud. |
| **5. PDF Ink Annotations, Text Boxes, Extra Note Sheets & Audio Timestamp Pins** | **Write-Ahead Crash Buffer:** IndexedDB `annotation_recovery_vault` + legacy `sessionStorage['_exoPendingAnnoRecoverable_']`<br>**Primary Local:** IndexedDB `annotations` store (`usr_<sanitizedUid>::<lecId>`) + `inMemoryAnnotationsCache`<br>**Per-Account Local Backup:** `localStorage['pharmaAccountWorkspace_<uid>'].annotations`<br>**Cloud:** `public.user_workspaces.annotations` (`jsonb`) | `saveAnnotationsToDB()` (`index.html:20438`) queues in `pendingAnnoSaveMap` and triggers 350ms idle autosave -> `flushPendingAnnotationsSave()` (`index.html:20205`):<br>1. Commit to `annotation_recovery_vault` (`20254`)<br>2. Commit to `annotations` (`20280`)<br>3. Update `pendingAnnoSaveMap` & `inMemoryAnnotationsCache` (`20309`)<br>4. Delete from `annotation_recovery_vault` (`20321`). | `getAnnotationsFromDB(lecId)` (`index.html:20484`) reads `inMemoryAnnotationsCache[scopedId]` or IndexedDB `annotations` with `hasStrictDualRecordOwnership()` (`20526`) and normalizes via `normalizeAndRecoverLectureAnnotations()` (`20357`). Bulk read for sync via `getAllAnnotationsMapFromDB()` (`index.html:29131`). | **Conditional inclusion** in `pushWorkspaceToCloud()` (`index.html:29718–29773`): sent only when `forceIncludeAnnotations \|\| manualNotify \|\| (dirtyAnnotationsForCloud && !isPdfModalOpenNow)` AND FNV-1a signature (`computeFastStringSignature`, `29658`) differs from `lastUploadedAnnotationsSignature` (`29769`). When omitted, the server RPC preserves existing `user_workspaces.annotations` (`supabase/schema.sql:237`). | Durable in IndexedDB (`annotations` + `annotation_recovery_vault`) and Supabase `user_workspaces.annotations`. **Excluded** from manual JSON `exportData()` (`19051`). |
| **6. Weekly Schedule Events, Backlog Goals, Planner Preferences & Weekly Evaluation Reports** | **Primary Local (Unscoped Boot Keys):** `localStorage['pharmaScheduleV4']`, `localStorage['pharmaScheduleBacklogV1']`, `localStorage['pharmaPlannerPrefsV1']`, `localStorage['pharmaWeeklyReportsV1']`<br>**Per-Account Local Vault:** `localStorage['pharmaAccountWorkspace_<uid>'].schedule`<br>**Cloud:** `public.user_workspaces.schedule` (`jsonb`) | `saveScheduleData(syncToCloud = true)` (`index.html:13093–13107`) writes all 4 `localStorage` keys and calls `markLocalWorkspaceModified(false)` -> 4s debounced `pushWorkspaceToCloud()`. | Bootstrapped in `initScheduleData()` (`index.html:13042–13091`) from `pharmaScheduleV4`; updated from cloud/vault in `applyCloudWorkspacePayload()` (`index.html:29986–30036`). | Synced inside `payload.schedule` (`version: 3`, containing `events`, `backlog`, `plannerPrefs`, `weeklyReports`, `pdfFitMode`, `cloudMediaRegistry`, `_tombstones`, `gdriveSync`). Merged in `mergeAndApplyCloudConflict()` (`29574–29609`), which omits immediately writing `pharmaScheduleV4` and `pharmaScheduleBacklogV1`, though the delayed `pushWorkspaceToCloud()` after `1,200ms` (`29645–29649`) writes the merged schedule to `pharmaAccountWorkspace_<uid>` (`29779–29788`) before the RPC (`F-13`). | Durable in `localStorage` and Supabase `user_workspaces.schedule`, except for the `1,200ms` window / stale global boot keys after a conflict merge (`F-13`) and in `exportData()` (which omits `weeklyReports` and `plannerPrefs`). |
| **7. Study Logs & Activity History (`logs`)** | **Primary Local:** `localStorage['pharmaLogsV4']`<br>**Cloud:** `public.user_workspaces.logs` (`jsonb`) | `saveLogs()` (`index.html:15902`) writes `pharmaLogsV4` and calls `markLocalWorkspaceModified()`. | Loaded at boot (`index.html:11257`); overwritten on pull (`index.html:30037–30038`). | Synced on every `pushWorkspaceToCloud()`. Merged by `l.id \|\| l.timestamp` in `mergeAndApplyCloudConflict()` (`index.html:29611–29617`). | Durable in `localStorage` and Supabase `user_workspaces.logs`. |
| **8. Interactive Academy Progress (`completedAcademyModules`)** | **Primary Local:** `localStorage['pharmaAcademyProgressV1']`<br>**Cloud:** `public.user_workspaces.academy_progress` (`jsonb`) | Persisted to `pharmaAcademyProgressV1` when completing academy modules. | Loaded at boot (`index.html:25586`); overwritten on pull (`index.html:30040–30042`). | Synced in `payload.academy_progress`. Merged via `Set` union in `mergeAndApplyCloudConflict()` (`index.html:29620–29623`). **Bug (`F-15`):** New-account branch of `syncWorkspaceOnLogin()` (`index.html:30203–30210`) omits `academy_progress`, resetting it to `[]`. | Durable in `localStorage` and Supabase `user_workspaces.academy_progress` (except on first login of a brand-new cloud account, `F-15`). |
| **9. Cloud Media Upload Fingerprint Registry (`cloudMediaRegistry`)** | **Primary Local:** `localStorage['pharmaCloudMediaRegistryV1']`<br>**Cloud:** `public.user_workspaces.schedule.cloudMediaRegistry` | `recordUploadedMediaInRegistry()` (`index.html:26348–26380`) and `saveCloudMediaRegistry()` (`index.html:26338–26342`). | Loaded at boot (`index.html:26334`); merged on cloud pull (`index.html:29977–29980`) and conflict (`index.html:29626–29629`). | Embedded inside `schedule.cloudMediaRegistry` JSONB. Used by `healSubjectsFromCloudRegistry()` (`index.html:26446–26488`) to restore `cloudPdfUploaded`/`cloudAudioUploaded` flags. | Durable in `localStorage` and Supabase `schedule.cloudMediaRegistry`. |
| **10. Deletion Tombstones (`pharmaTombstones_<uid>`)** | **Primary Local:** `localStorage['pharmaTombstones_<uid>']`<br>**Cloud:** `public.user_workspaces.schedule._tombstones` | `recordTombstone(entityType, id, targetUid)` (`index.html:29407–29413`) — **zero call sites in `index.html` (`F-02`)!** | `getLocalTombstones(targetUid)` (`index.html:29402–29405`), read during `pushWorkspaceToCloud()` (`29740`) and `mergeAndApplyCloudConflict()` (`29452`). | Included in `payload.schedule._tombstones` and unioned during `mergeAndApplyCloudConflict()` (`index.html:29456–29460`), **but never populated by UI deletions** and lacks a `groups` category. | Stored per-UID in `localStorage` and in `schedule._tombstones`, but currently inactive in normal UI workflows (`F-02`). |
| **11. Authentication Sessions & Local Multi-Account Fallback Vault** | **Supabase Auth:** `localStorage['sb-dszjmgzzqpdrdjkycvht-auth-token']` (managed by `@supabase/supabase-js`)<br>**Local Fallback Vault:** `localStorage['pharmaAccountsRegistryV1']` (PBKDF2 hashes), `localStorage['pharmaActiveAccountSessionV1']`, `localStorage['pharmaAccountWorkspace_<uid>']`, `localStorage['pharmaWorkspaceRevision_<uid>']` | Supabase SDK (`persistSession: true, autoRefreshToken: true`, `index.html:26153`) or local fallback `handleCloudEmailAuth()` (`index.html:28903–28959`). | `initSupabaseCloudEngine()` (`index.html:26149–26183`) calls `supabaseClient.auth.getSession()` and registers `onAuthStateChange`. | Supabase Auth tokens refresh via Supabase GoTrue; local fallback accounts exist only in the local browser when `supabaseClient` is unavailable. | Persistent in `localStorage`. Active session cleared on `handleCloudSignOut()` (`index.html:29087–29090`), while `pharmaAccountWorkspace_<uid>` is retained as an offline backup. |
| **12. Google Drive Connection & OAuth2 Token State** | **Local Active Keys:** `exo_gdrive_token`, `exo_gdrive_token_exp`, `exo_gdrive_connected`, `exo_gdrive_user_email`, `exo_gdrive_folder_id`, `exo_gdrive_quota_info`, `exo_gdrive_bound_user_id`, `exo_gdrive_custom_client_id`<br>**Per-Account Local:** `pharmaGdriveSync_<uid>`<br>**Cloud:** `public.user_workspaces.schedule.gdriveSync` | `ensureGoogleAccessToken()` (`index.html:27460–27554`), `trySilentGoogleDriveConnection()` (`index.html:27576–27608`), `fetchGoogleDriveUserInfo()` (`index.html:27698–27726`), `ensureExoGoogleDriveFolder()` (`index.html:27792–27842`). | Read on startup (`index.html:27452–27453`) and restored on account switch/pull in `handleAuthSessionChange()` (`index.html:26293–26304`) and `applyCloudWorkspacePayload()` (`index.html:30007–30020`). | Non-sensitive link metadata (`linked`, `userEmail`, `folderId`, `quotaInfo`) syncs across devices inside `schedule.gdriveSync`. The raw OAuth bearer token (`exo_gdrive_token`) stays in local `localStorage` only and expires after ~59 minutes (`27507`). | Link metadata is durable in Supabase; access token is ephemeral (~3,540s TTL) and revoked/deleted on logout (`index.html:29073–29084`). |
| **13. UI & Appearance Preferences** | **Local Only (except `pdfFitMode` & `specialty`):** `pharmaAppearancePrefsV1`, `exo_sidebar_collapsed`, `exo_pdf_night_mode`, `pharmaPalmRejectV1`, `pharmaSubjectSortModeV1`, `pharmaHideOnboardingV2`, `pharmaWeekGroupSubV1`, `pharmaHourlyModeV2`, `pharmaWeekBoardHorizV1`, `exoAppLang`, `pharmaUserSpecialtyTitleV1`, `pharmaPdfFitMode` | Written directly to `localStorage` by their respective UI toggle functions. | Read from `localStorage` during module initialization. | Only `pdfFitMode` (in `schedule.pdfFitMode`) and `specialty` (in Supabase `auth.users.user_metadata.specialty`) sync to the cloud. All other UI layout/theme toggles are browser-local. | Persistent in `localStorage` per browser profile. |

---

## 4. IndexedDB Audit (`WorkspaceMediaStore` v4)

### 4.1 Database Initialization, Schema & Object Stores
- **Database Name & Version:** `'WorkspaceMediaStore'`, version `4` (`indexedDB.open('WorkspaceMediaStore', 4)` at `index.html:19703`).
- **Initialization Function:** `initPdfDB()` (`index.html:19696–19779`).
  - Handles `onupgradeneeded` (`index.html:19710–19726`) by creating missing object stores (`pdfs`, `audios`, `annotations`, `annotation_recovery_vault`), all with `{ keyPath: 'id' }` and **no secondary indexes**.
  - Handles `onblocked` (`index.html:19728–19732`) by clearing `dbReadyPromise` and resolving `null`.
  - Registers `openedDb.onversionchange` and `openedDb.onclose` (`index.html:19736–19750`) to close and reset `dbInstance` cleanly if another tab upgrades the schema.
  - Inside `req.onsuccess` (`index.html:19734–19769`), sequentially awaits two startup tasks before resolving `dbInstance`:
    1. `recoverUncommittedAnnotations(openedDb)` (`index.html:19756, 19781–19897`)
    2. `refreshLocalMediaCache()` (`index.html:19763, 19625–19670`)
  - *Note on Legacy Migration Helper:* `claimAndMigrateLegacyRecords(targetUserId, opCtx)` (`index.html:19525–19623`) is defined as an account-scoped helper (and exercised in automated tests) but is not automatically invoked inside `initPdfDB()`.

### 4.2 Record Schemas & Dual-Ownership Key Structure
Every record in `pdfs`, `audios`, `annotations`, and `annotation_recovery_vault` uses a composite primary key (`id`) constructed by `toScopedKey(rawId, rawUserId)` (`index.html:19436–19463`):
- **Scoped Key Format:** `usr_<sanitizedUid>::<rawId>` where `sanitizeUserIdForPrefix(rawUserId)` (`index.html:19345–19347`) replaces non-`[a-zA-Z0-9_-]` characters with `_`. When logged out, `getCanonicalUserId()` (`index.html:19331–19343`) returns `'local'`, yielding `usr_local::<rawId>`.
- **Strict Dual-Ownership Verification (`hasStrictDualRecordOwnership`, `index.html:19473–19483`):**
  A record is trusted for read or export **only if** both conditions hold:
  1. `extractUserIdFromScopedKey(itemKey) === sanitizeUserIdForPrefix(canonicalUid)` (the primary key prefix matches the active user).
  2. `item.userId && String(item.userId) === String(canonicalUid)` (the internal `userId` property is non-empty and equals the raw canonical user ID).
- **Foreign Key Rejection (`toScopedKey` / `resolveAuthorizedScopedKey`, `index.html:19449–19471`):**
  If a caller passes a key prefixed with another user's scope (e.g., `usr_userB::101` while `userA` is active), `toScopedKey()` throws `CROSS_ACCOUNT_KEY_VIOLATION` (`index.html:19457`) before raw ID extraction can strip the foreign prefix.

| Object Store | Record Shape | Typical Payload Size |
| :--- | :--- | :--- |
| `pdfs` | `{ id: "usr_<uid>::<lecId>", rawId: "<lecId>", userId: "<uid>", blob: Blob, updatedAt: number }` | $1\text{ MB} - 50+\text{ MB}$ per lecture PDF |
| `audios` | `{ id: "usr_<uid>::<lecId_or_recId>", rawId: "<lecId_or_recId>", userId: "<uid>", blob: Blob, updatedAt: number }` | $5\text{ MB} - 100+\text{ MB}$ per lecture audio |
| `annotations` | `{ id: "usr_<uid>::<lecId>", rawId: "<lecId>", userId: "<uid>", pages: { [pageNum]: Stroke[], ["note_" + pageNum]: Stroke[], _extraNotes: {}, _audioPins: {} }, updatedAt: number }` | $5\text{ KB} - 2\text{ MB}$ per annotated lecture |
| `annotation_recovery_vault` | Identical to `annotations`: `{ id, rawId, userId, pages, updatedAt }` | Transient write-ahead log (cleared on primary commit) |

### 4.3 Two-Phase Annotation Commit & Crash Recovery (`flushPendingAnnotationsSave`)
Located at `index.html:20205–20347`:
1. **Step 1 (Write-Ahead Vault):** Writes all dirty lecture annotation entries in `pendingAnnoSaveMap` into `annotation_recovery_vault` in a `readwrite` transaction and awaits `vTx.oncomplete` (`index.html:20254–20277`). If `vTx` errors or aborts, the function returns `false` immediately without touching the primary store.
2. **Step 2 (Primary Store Commit):** Writes the entries into `annotations` and awaits `tx.oncomplete` (`index.html:20280–20306`). If `tx` fails or aborts, it leaves the entries inside `annotation_recovery_vault` for crash recovery on next boot (`recoverUncommittedAnnotations`, `index.html:19781`) and returns `false`.
3. **Step 3 (In-Memory Cleanup):** Deletes entries from `pendingAnnoSaveMap` **only if** `pendingAnnoSaveMap[id] === snapshotMap[id]` (`index.html:20309–20313`), preventing a race where a user draws a new stroke while the IndexedDB transaction is in flight.
4. **Step 4 (Vault Cleanup):** Deletes the committed keys from `annotation_recovery_vault` (`index.html:20321–20332`).

### 4.4 IndexedDB & Memory Findings
1. **Orphaned Blobs & Annotations on UI Deletion (`F-02`, Confirmed `P1`):**
   - `deleteMediaFromDB(storeName, id, targetUserIdOrCtx, opCtx)` (`index.html:19913–19984`) is **never called anywhere in `index.html`** (it has zero production call sites).
   - Furthermore, `ALLOWED_MEDIA_STORES` (`index.html:19911`) only permits `'pdfs'` and `'audios'`; there is no `deleteAnnotationsFromDB(lecId)` function. When a lecture, group, or subject is deleted in the UI, its PDF blob, primary and secondary audio blobs (`rec_*`), and annotation strokes remain permanently orphaned in IndexedDB.
2. **Full-Store `getAll()` Scans (`F-11`, Confirmed `P3`):**
   - `refreshLocalMediaCache()` (`index.html:19635–19636`) and `getAllAnnotationsMapFromDB()` (`index.html:29166`) execute `store.getAll()` across the entire object store without an `IDBKeyRange` prefix bound (`IDBKeyRange.bound("usr_<uid>::", "usr_<uid>::\uffff")`) or secondary `userId` index. In `refreshLocalMediaCache()`, full records (including `Blob` references) are materialized when only keys/ownership metadata are needed.
3. **RAM Blob Cache Entry Cap vs. Byte Budget & Read-Path Insertion (`F-11`, Confirmed `P3`):**
   - `sessionMediaBlobRamCache` (`index.html:19694`) is a `{ pdfs: new Map(), audios: new Map() }` cache.
   - Contrary to being unbounded by count on write, `saveMediaToDB()` (`index.html:20028–20034`) caps `sessionMediaBlobRamCache[storeName]` at **20 entries** using FIFO eviction (`sessionMediaBlobRamCache[storeName].keys().next().value`).
   - However:
     1. It has **no byte-based memory budget** (20 large PDF or audio blobs can still represent hundreds of megabytes in memory).
     2. Eviction is **FIFO** rather than true **LRU** because `getMediaFromDB()` (`index.html:20072–20085`) does not refresh key order on cache hit.
     3. `getMediaFromDB()` (`index.html:20113–20115`) inserts blobs into `sessionMediaBlobRamCache[storeName]` on an IndexedDB read hit **without** checking `if (sessionMediaBlobRamCache[storeName].size > 20)`.
4. **Residual Unscoped `clearAllIndexedDBStores()` Helper (`index.html:19672–19691`):**
   - Defined at `index.html:19672–19691` and calls `.clear()` on `pdfs`, `audios`, and `annotations`. Although it has no active production call sites, leaving an unscoped wipe helper in global scope is unnecessary technical debt.

---

## 5. Supabase Architecture Audit

### 5.1 Client Configuration & Authentication Lifecycle
- **Project URL & Publishable Anon Key (`index.html:26134–26135`):**
  - `SUPABASE_PROJECT_URL = 'https://dszjmgzzqpdrdjkycvht.supabase.co'`
  - `SUPABASE_ANON_PUBLIC_KEY = 'sb_publishable_VqY0YX2ubbc7GUODQRq6Dw_POLClYbX'`
  - The publishable anon key is intended for browser clients, provided Row Level Security (RLS), table privilege revocations, and RPC guards are active on the database.
- **Initialization (`initSupabaseCloudEngine`, `index.html:26149–26183`):**
  - Creates the Supabase client with `{ auth: { persistSession: true, autoRefreshToken: true } }` (`26152–26154`).
  - Calls `supabaseClient.auth.getSession()` once on startup and registers `supabaseClient.auth.onAuthStateChange()` (`26157–26171`).
  - Deduplicates the initial login sync via `initialSessionHandled` (`index.html:26156–26167`) so `SIGNED_IN` firing immediately after `getSession()` does not pull the workspace twice.
- **Built-In Local Fallback Auth (`index.html:28903–28959`):**
  - When `supabaseClient` is unavailable, Exo falls back to a local browser account registry (`pharmaAccountsRegistryV1`) using Web Crypto `PBKDF2-HMAC-SHA256` with 100,000 iterations and a 16-byte random salt (`deriveSecurePBKDF2Hash`, `index.html:11150–11186`) and client-side rate limiting (`index.html:28936–28939`).

### 5.2 Database Schema, RLS, Triggers & OCC RPC in Repository (`supabase/`)
Across `supabase/schema.sql` (`lines 1–460`) and `supabase/migrations/`:
1. **`20261103133622_remote_schema.sql`:** Baseline table `public.user_workspaces`, `rls_auto_enable()`, `enforce_workspace_media_security()`, `protect_vip_status_column()`, and initial RLS/storage policies.
2. **`20261103140000_fix_security_and_privileges.sql`:** Adds `revision integer NOT NULL DEFAULT 1`, `handle_user_workspace_updated_at()` trigger, revokes direct `INSERT, UPDATE, DELETE, TRUNCATE` on `public.user_workspaces` from `anon` and `authenticated` (granting only `SELECT` to `authenticated`), and enforces private VIP policies on `storage.objects` (`lecture_media`).
3. **`20261103150000_unforgeable_occ_and_role_hardening.sql`:** Creates dedicated `NOLOGIN` role `exo_occ_rpc_definer` and private schema `exo_internal` with transaction-local context table `exo_internal.occ_active_write_context`, transfers ownership of `public.sync_workspace_with_concurrency(jsonb, integer)` to `exo_occ_rpc_definer`, and enforces RPC-only writes in `public.enforce_workspace_write_via_rpc()`.
4. **`20261103160000_hosted_supabase_auth_compat.sql`:** Adds `exo_internal.current_request_uid()` owned by `postgres` (`SECURITY DEFINER SET search_path = ''`) so `exo_occ_rpc_definer` does not require `GRANT USAGE ON SCHEMA auth` on hosted Supabase.

### 5.3 Deployment Readiness vs. Live Production Supabase (`F-01`)
- **What is known:**
  - The frontend (`index.html:29799`) writes to Supabase exclusively via `supabaseClient.rpc('sync_workspace_with_concurrency', { p_payload: payload, p_expected_revision: expectedRev })` and reads `revision` and `can_upload_media` from `public.user_workspaces` (`index.html:26806, 30058, 30095, 30170`).
  - The owner confirmed that the repository migration files (`20261103133622`–`20261103160000`) have not been executed as formal migrations against the live Supabase project.
- **What is NOT proven (Explicit Unknown):**
  - Without connecting to the live Supabase database (which is strictly prohibited in this task), the absence of applied repository migration files **does not prove** that the live database is broken or missing `public.user_workspaces`, `revision`, `sync_workspace_with_concurrency`, or RLS policies—those objects may or may not have been created manually via the Supabase SQL Editor during earlier phases.
  - Therefore, this item is classified as **Unverified Deployment Compatibility / Owner-Side Verification Required**, not as a confirmed `P0` database failure.

### 5.4 Supabase Disk IO & Bandwidth Optimizations Present in `index.html`
- **Realtime WAL Listener Disabled (`setupRealtimeWorkspaceSubscription`, `index.html:30260–30267`):** Removes any `postgres_changes` channel to avoid `wal2json` decoding of large JSONB rows on Supabase Nano instances.
- **4-Second Debounce & Conditional Annotation Inclusion (`markLocalWorkspaceModified` at `29671–29689`, `pushWorkspaceToCloud` at `29718–29773`):**
  - Rapid workspace edits are coalesced by a **4,000ms (4-second)** debounce timer (`cloudAutoSaveTimer`, `index.html:29684–29688`).
  - `payload.annotations` is included in `pushWorkspaceToCloud()` **only** when `forceIncludeAnnotations || manualNotify || (dirtyAnnotationsForCloud && !isPdfModalOpenNow)` (`index.html:29719–29723`) AND `manualNotify || forceIncludeAnnotations || currentSig !== lastUploadedAnnotationsSignature` (`index.html:29769`).
  - When `p_payload` omits `'annotations'`, `sync_workspace_with_concurrency` (`supabase/schema.sql:237`) preserves the existing `public.user_workspaces.annotations` column via `CASE WHEN p_payload ? 'annotations' ...`.
- **Lightweight Timestamp Polling (`pullWorkspaceFromCloudIfNewer`, `index.html:30233–30258`):** When the tab becomes visible after $>15\text{ minutes}$ and `pharmaWorkspaceDirty !== '1'` (`index.html:30288`), queries only `SELECT updated_at, can_upload_media` before pulling the full row.

### 5.5 Dormant Supabase Storage (`lecture_media` Bucket)
- All active media uploads in `uploadMediaToCloudAccount()` (`index.html:28181–28346`) go exclusively to Google Drive.
- `reconcileCloudMediaWithStorageBucket()` (`index.html:26491–26494`) is stubbed to call `healSubjectsFromCloudRegistry(targetUid)` and return `false`, while `_legacy_disabled_reconcileCloudMediaWithStorageBucket()` (`index.html:26495`) and `uploadToSupabaseStorageViaXHR()` (`index.html:28096`) are unreferenced dead code.
- `downloadMediaFromCloudAccount()` (`index.html:28456–28489`) retains a legacy fallback (`1b`) that attempts to download from `lecture_media` if a lecture has a non-`gdrive:` `cloudPath` without a Drive file ID.

---

## 6. Google Drive Integration Audit

### 6.1 OAuth 2.0 Flow, Client ID & Scope Trade-Offs
- **Client ID (`index.html:11111, 27559–27566`):** `814351723102-oqltucr4nf5pkk68hq8um08ev8040au0.apps.googleusercontent.com` (overridable via `localStorage['exo_gdrive_custom_client_id']`).
- **Library & Flow (`ensureGoogleAccessToken` at `index.html:27460–27554`, `trySilentGoogleDriveConnection` at `index.html:27576–27608`):**
  Uses Google Identity Services (`google.accounts.oauth2.initTokenClient`) — the browser-only implicit token flow.
- **Scopes Requested (`index.html:27502, 27586`):**
  ```text
  https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file
  ```
- **Technical Trade-Off of `drive.readonly` vs. `drive.file` (`F-06`):**
  - `drive.file` (non-sensitive scope) grants full read/write/update/share access to all folders and files created by Exo (`Exo_Workspace/<Subject>/<Group>/*`) or explicitly selected via a future Google Picker integration.
  - `drive.readonly` (restricted scope) grants read access to the user's entire Google Drive.
  - **Existing features in `index.html` that rely on `drive.readonly`:**
    1. **Drive Privacy Scanner (`auditAndManageGoogleDrivePermissions`, `index.html:27288–27375`):** Queries `files?q=trashed%20%3D%20false&fields=files(id,name,permissions)&pageSize=50` (`index.html:27316–27319`) to inspect up to 50 files across the user's entire Google Drive for `type === 'anyone'` public links. Under `drive.file` alone, this endpoint only returns files created/opened by Exo.
    2. **External Google Drive Links (`triggerAddLecture` / `triggerEditLecture`, `index.html:12484, 12543–12556`):** If a user pastes a `drive.google.com/file/d/<id>/view` URL for a private file stored in their Google Drive that was **not** uploaded through Exo, `downloadMediaFromCloudAccount()` (`index.html:28392`) can only download its binary bytes via `alt=media` if `drive.readonly` is present; otherwise it falls back to the `/preview` iframe at `index.html:21398`. *(Note on Google Picker Status: `index.html` currently has **zero** `google.picker` or `PickerBuilder` references. Integrating Google Picker API so users can select external Drive files to grant per-file `drive.file` access is a **proposed future integration option**, not an existing feature or working fallback in the current codebase.)*
  - Therefore, removing `drive.readonly` cannot be done blindly; it requires an explicit owner product decision on whether to scope the privacy scanner to Exo-created files and whether external Drive files should be supported via a future Google Picker integration or the `/preview` iframe.

### 6.2 Token Persistence, Non-Interactive Renewal & HTTP `401` Retry Paths
- **Raw Access Token in `localStorage` (`index.html:27452–27453, 27508–27509, 27592–27593`):**
  - Stores the raw bearer token in `localStorage['exo_gdrive_token']` and its expiration timestamp (`Date.now() + (expiresIn * 1000) - 60000`, ~59 minutes) in `localStorage['exo_gdrive_token_exp']`.
  - Because the browser-only GIS `initTokenClient` flow does not issue a `refresh_token`, tokens expire after ~1 hour.
- **How `ensureGoogleAccessToken(interactive)` Actually Behaves (`index.html:27460–27554`):**
  1. If `isGoogleDriveTokenActive()` (`27456`) or a non-expired `localStorage['exo_gdrive_token']` (`27464–27471`) exists, it resolves immediately with the cached token.
  2. Otherwise, it initializes `googleTokenClient` (`27500–27539`) and:
     - When `interactive === false` (`index.html:27541–27543`), it **does** attempt a non-interactive GIS request: `googleTokenClient.requestAccessToken({ prompt: '', hint: hint })` with a `2,500ms` timeout (`setTimeout(() => finish(null), 2500)`).
     - When `interactive === true` (`index.html:27544–27546`), it calls `googleTokenClient.requestAccessToken({ prompt: hint ? '' : 'select_account', hint: hint })`.
- **Where HTTP `401` Retry Exists vs. Where It Is Missing:**
  - **Present in Upload Initiation (`uploadBlobToGoogleDriveViaXHR`, `index.html:27998–28014`):** If the initial `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable` returns `initRes.status === 401`, it clears `googleAccessToken` and `localStorage['exo_gdrive_token']`, calls `await ensureGoogleAccessToken(true)`, and retries the `POST` once.
  - **Conditionally Present in Download (`downloadMediaFromCloudAccount`, `index.html:28395–28404`):** If `GET /drive/v3/files/${driveId}?alt=media` returns `res.status === 401 && interactive`, it clears the token, calls `await ensureGoogleAccessToken(true)`, and retries once. **However**, `downloadMediaFromCloudAccount(storeName, lecObj, interactive = false)` defaults `interactive` to `false`, and all callers (`openLectureDocument` at `21331, 21382` and `downloadAllCloudMediaToLocal` at `28809, 28819`) omit the 3rd argument—so `interactive` is always `false` in production calls, meaning the `401` retry branch at `28395` is never reached!
  - **Absent Elsewhere:** There is no universal `fetch` wrapper; `ensureExoGoogleDriveFolder()` (`27792`), `ensureSubfolderInGoogleDrive()` (`27739`), `fetchGoogleDriveUserInfo()` (`27698`), `downloadBlobFromGoogleDrive()` (`27949`), `shareGoogleDriveFileExplicitly()` (`27227`), `revokeGoogleDriveFileSharing()` (`27257`), and `auditAndManageGoogleDrivePermissions()` (`27288`) do not retry on `401`.

### 6.3 Folder Hierarchy Resolution (`Exo_Workspace/<Subject>/<Group>`)
- **Root Folder (`ensureExoGoogleDriveFolder`, `index.html:27792–27842`):**
  1. Verifies `localStorage['exo_gdrive_folder_id']` via `GET /drive/v3/files/${cachedFolderId}?fields=id,trashed` (`27797`).
  2. Queries Drive for `name = 'Exo_Workspace' and mimeType = 'application/vnd.google-apps.folder' and trashed = false` (`27808`).
  3. Creates `Exo_Workspace` via `POST /drive/v3/files` if not found (`27823`), or falls back to `'root'` (`27841`).
- **Subfolders (`ensureSubfolderInGoogleDrive`, `index.html:27739–27790`):**
  - Caches folder IDs in memory via `gdriveSubfolderCache` (`${parentFolderId}:${cleanName}`, `index.html:27729, 27744`).
  - Queries Drive by sanitized folder name (`name = '${safeQueryName}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, `27752`), creating a new folder if no match is found (`27768`).
  - **Folder Identity Weakness (`F-08`):** Because `sub` and `group` objects do not store a persistent `driveFolderId`, folder identity is tied to the current display name. Renaming a subject or group does not immediately create a duplicate folder on its own, but if the user subsequently uploads a new lecture file under the renamed subject/group, `ensureSubfolderInGoogleDrive()` searches for the new name, finds no match, and creates a second folder under the new name while leaving previously uploaded files in the old folder.

### 6.4 Upload Pipeline (`uploadBlobToGoogleDriveViaXHR` & `uploadMediaToCloudAccount`)
Located at `index.html:27972–28094` and `28181–28346`:
1. **VIP Check & Size Validation (`index.html:28183–28186, 28656, 28686`):**
   - `uploadMediaToCloudAccount()` calls `verifyVipStatusFromServer()` (`26797`) and `checkCloudMediaUploadPermission()`.
   - Note on file size limits: Although `VIP_MEDIA_LIMITS_CONFIG` (`index.html:26792–26795`) defines `maxPdfSizeMB: 25` and `maxAudioSizeMB: 35`, `validateFileCloudSizeLimit()` (`index.html:27440–27447`) actually returns `{ allowed: true, fileSizeMB, maxMB: 9999, typeAr }`, so no client-side size limit is enforced on Google Drive uploads.
2. **Single-Execution Resumable Upload (`index.html:27986–28089`):**
   - Initiates a resumable upload session (`POST https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`, `27986`), reads the `Location` header (`uploadUrl`, `28021`), and streams the blob via `xhr.open('PUT', uploadUrl, true)` (`28033`) with live speed/progress callbacks (`28036–28061`).
   - **Limitation (`F-08`):** The resumable session URL (`uploadUrl`) is kept only as a local variable inside `uploadBlobToGoogleDriveViaXHR()`. If the browser tab reloads or the connection drops mid-upload, the session URL is lost and a retry starts a new `POST` session from byte 0.
3. **`forceReplace` Ignored on Lecture Edit (`F-08`, `index.html:12575–12576` vs. `28181–28346`):**
   - When a user replaces a lecture's PDF or audio in `triggerEditLecture()`, lines `12575–12576` pass `{ forceReplace: true }` in `queueMeta`.
   - However, `uploadMediaToCloudAccount()` (`index.html:28210–28212`) only reads `queueMeta?.index`, `queueMeta?.total`, and `queueMeta?.deferWorkspaceSync`, completely ignoring `queueMeta?.forceReplace`. It always calls `uploadBlobToGoogleDriveViaXHR()`, which executes `POST` to create a brand-new Drive file and overwrites `lecObj.cloudPdfDriveId` / `lecObj.cloudAudioDriveId` with the new file ID (`28301, 28308`), leaving the previous Drive file orphaned in the folder.

### 6.5 Download & `/preview` Iframe Fallback (`downloadMediaFromCloudAccount` & `openLectureDocument`)
Located at `index.html:28364–28513` and `21373–21426`:
1. **Local Check & In-Flight Deduplication (`index.html:28367–28374`):** Checks `getMediaFromDB(storeName, lecObj.id)` first and deduplicates concurrent downloads via `inFlightMediaDownloads`.
2. **Method A — Authenticated Drive API (`index.html:28384–28423`):** Calls `ensureGoogleAccessToken(interactive)` (where `interactive` is `false` by default) and fetches `https://www.googleapis.com/drive/v3/files/${driveId}?alt=media` with `Authorization: Bearer ${token}`, validating PDF headers via `isValidPdfBlob()` (`28409`) before saving to IndexedDB (`saveMediaToDB`).
3. **Method B — Unauthenticated Public Endpoints (`index.html:28426–28450`):** Loops through 3 public download URLs (`drive.usercontent.google.com/download`, `drive.google.com/uc`, `docs.google.com/uc`). Because uploaded files are private by default (`index.html:28295`), Method B fails with CORS/HTML redirects unless the file was explicitly shared publicly.
4. **Method C — Google Drive `/preview` Iframe Fallback (`F-10`, `index.html:21394–21403`):**
   - If `downloadMediaFromCloudAccount('pdfs', lec)` returns `null` (e.g., on a second device when `ensureGoogleAccessToken(false)` cannot obtain a token non-interactively), `openLectureDocument()` hides `scrollContainer` (`#pdfPagesScrollContainer`) and sets `iframe.src = "https://drive.google.com/file/d/${cloudDriveFileId}/preview"`.
   - **Impact:** While the PDF is visible inside Google's embedded previewer, **all Exo Studio canvas features**—existing handwriting annotations, pen/highlighter/text tools, extra blank note pages, audio timestamp pins, and merged continuous mode—are bypassed and hidden without an in-viewer prompt to activate Google Drive.

---

## 7. Synchronization Lifecycle & Data-Flow Diagrams

### 7.1 Startup & Login Synchronization Flow (`initSupabaseCloudEngine` -> `handleAuthSessionChange` -> `syncWorkspaceOnLogin`)

```
[Browser Page Load]
        |
        +---> 1. Boot Local State from unscoped localStorage keys
        |        |-- subjects (pharmaSubjectsV4, line 11256)
        |        |-- logs (pharmaLogsV4, line 11257)
        |        |-- scheduleEvents, scheduleBacklog, plannerPrefs, weeklyReports (initScheduleData, line 13042)
        |        +-- completedAcademyModules (pharmaAcademyProgressV1, line 25586)
        |
        +---> 2. initPdfDB() (index.html:19696)
        |        |-- Open IndexedDB "WorkspaceMediaStore" (v4)
        |        |-- recoverUncommittedAnnotations(openedDb) (line 19756) -> Commit verified vault records
        |        +-- refreshLocalMediaCache() (line 19763)                -> Populate localMediaCache Sets
        |
        +---> 3. initSupabaseCloudEngine() (index.html:26149)
                 |-- supabaseClient.auth.getSession()
                 +-- handleAuthSessionChange(user, shouldInitialSync = true) (index.html:26221)
                        |-- Flush any pendingAnnoSaveMap under previous UID (or isolate in isolatedPendingAnnotationsByUser)
                        |-- bumpAccountSessionGeneration() -> Increment currentSessionGeneration
                        |-- Clear in-memory caches (inMemoryAnnotationsCache, sessionMediaBlobRamCache, localMediaCache)
                        |-- Restore Google Drive link metadata from localStorage['pharmaGdriveSync_' + uid]
                        |-- syncWorkspaceOnLogin(activeCtx) (index.html:30123)
                               |-- Check pharmaLastActiveUserIdV1: if switching user, wipe global localStorage arrays
                               |-- Fetch remote row: SELECT * FROM public.user_workspaces WHERE user_id = uid
                               |     (Fallback if offline: read localStorage['pharmaAccountWorkspace_' + uid])
                               |-- If remote row exists (line 30191):
                               |     +-- applyCloudWorkspacePayload(data, false, opCtx) (index.html:29934)
                               |           |-- [BUG F-03] Overwrites local state even if pharmaWorkspaceDirty === '1'!
                               |           |-- 1. restoreAllAnnotationsMapToDB(cloudRow.annotations, uid, opCtx)
                               |           |-- 2. Merge cloudMediaRegistry & healSubjectsFromCloudRegistry(uid)
                               |           |-- 3. Overwrite subjects, schedule, logs, academy_progress in RAM + localStorage
                               |           |-- 4. Persist currentCloudWorkspaceRevision = cloudRow.revision
                               |           +-- 5. Clear pharmaWorkspaceDirty (line 30065) & re-render UI
                               +-- If brand-new account (no remote row, line 30201):
                                     |-- [BUG F-15] Omits academy_progress in applyCloudWorkspacePayload call (line 30203)
                                     +-- pushWorkspaceToCloud(false, false, opCtx) (line 30214)
```

### 7.2 Local Edit, Tablet Ink Drawing & Cloud Push Lifecycle

```
+--------------------------------------------------------------------------------------------------+
| PATH A: Metadata Edit (Subject / Lecture / Schedule / Log)                                       |
+--------------------------------------------------------------------------------------------------+
  User Action -> saveSubjects() (11377) / saveScheduleData() (13093) / saveLogs() (15902)
      |
      +--> Write to localStorage (pharmaSubjectsV4 / pharmaScheduleV4 / pharmaLogsV4)
      +--> markLocalWorkspaceModified(includeAnnotations = false) (index.html:29671)
              |-- Increment localWorkspaceMutationSeq
              |-- Set localStorage['pharmaWorkspaceDirty'] = '1'
              |-- Start 4,000ms debounce timer (cloudAutoSaveTimer, line 29684)
              v
      pushWorkspaceToCloud(manualNotify=false, forceIncludeAnnotations=false, scheduledCtx) (29691)
              |-- Build payload (subjects, schedule, logs, academy_progress, updated_at)
              |-- Conditional annotation inclusion (lines 29718-29773):
              |     shouldSendAnnotations = forceIncludeAnnotations || manualNotify ||
              |                             (dirtyAnnotationsForCloud && !isPdfModalOpenNow)
              |     Attach payload.annotations ONLY if signature changed or forced/manual
              |-- Reserialize local vault backup to localStorage['pharmaAccountWorkspace_' + uid] (29780-29788)
              |     (Copies existingVault.annotations even on lightweight pushes -> F-05 quota risk)
              |-- Call RPC: supabaseClient.rpc('sync_workspace_with_concurrency', {
              |       p_payload: payload,
              |       p_expected_revision: expectedRev
              |   }) (line 29799)
              |-- Case 1: status === 'success' (line 29828)
              |     |-- Update pharmaWorkspaceRevision_<uid> = rpcRes.revision
              |     |-- Clear pharmaWorkspaceDirty (if localWorkspaceMutationSeq unchanged)
              |-- Case 2: status === 'conflict' (line 29814)
              |     |-- Fetch latest row from public.user_workspaces
              |     |-- Run mergeAndApplyCloudConflict(freshRemote, payload, opCtx) (line 29825)
              |     |     [BUG F-02] UI deletions never recorded tombstones -> deleted items resurrect
              |     |     [BUG F-04] Additive stroke union -> erased/undone strokes resurrect
              |     |     [BUG F-13] Updates scheduleEvents/Backlog in RAM without updating global pharmaScheduleV4
              |     |                (persisted 1,200ms later to pharmaAccountWorkspace_<uid> at 29779-29788)
              |     |     [BUG F-14] Hardcoded local/remote precedence + reads unstamped _updatedAt (29534, 29542, 29583)
              |     |-- Schedule follow-up pushWorkspaceToCloud() after 1,200ms (line 29645)

+--------------------------------------------------------------------------------------------------+
| PATH B: Tablet Ink / Annotation Drawing in PDF Studio                                            |
+--------------------------------------------------------------------------------------------------+
  Pointer Up on Canvas -> saveAnnotationsToDB(lecId, pagesData, pageKey, opCtx) (index.html:20438)
      |
      +--> Store in inMemoryAnnotationsCache[scopedId] & pendingAnnoSaveMap[scopedId]
      +--> Start 350ms idle timer (waits until !isActivelyDrawingOnPdf && idle >= 300ms, line 20466)
              v
      flushPendingAnnotationsSave(triggerCloudImmediately = false, ctx) (index.html:20205)
              |-- Tx 1: Write entries to IndexedDB 'annotation_recovery_vault' (await vTx.oncomplete)
              |-- Tx 2: Write entries to IndexedDB 'annotations' (await tx.oncomplete)
              |-- Remove committed entries from pendingAnnoSaveMap
              |-- Tx 3: Delete committed entries from 'annotation_recovery_vault'
              |-- Set dirtyAnnotationsForCloud = true
              v
      When User Closes PDF Viewer (closePdfViewer, line 25541) OR Hides Tab (visibilitychange, line 30284):
              |-- flushPendingAnnotationsSave(true) / pushWorkspaceToCloud(false, true, visCtx)
              +-- Reads verified map via getAllAnnotationsMapFromDB(uid, opCtx) and pushes full annotations JSONB
```

---

## 8. Security, Data-Integrity & Reliability Findings

### 8.1 Revised Severity Summary Table (`F-01` – `F-15`)

| ID | Status | Severity | Subsystem | Finding Title | Primary Source References |
| :--- | :---: | :---: | :--- | :--- | :--- |
| **F-01** | **Unknown** (Owner-Side Verification Required) | **Unverified Deployment Gate** *(Reclassified from P0)* | Supabase / Deployment | Repository migrations (`20261103133622`–`20261103160000`) have not been applied to live Supabase; live schema state is unverified; RPC errors throw without direct-upsert fallback | `supabase/migrations/*`, `index.html:29799–29811, 29890–29908` |
| **F-02** | **Confirmed** (Local) / **Unverified** (Remote Drive) | **P1 (High)** | Sync / Tombstones & IDB Cleanup | Zero UI call sites for `recordTombstone()` and `deleteMediaFromDB()`, missing `groups`/`backlog` tombstones, and permanent local IndexedDB media/annotation orphaning | `index.html:11844, 12465, 12585, 15609, 15867, 17794, 19913, 29402–29413` |
| **F-03** | **Confirmed** | **P1 (High)** | Sync / Login & Pull | `syncWorkspaceOnLogin()` and `pullWorkspaceFromCloud()` unconditionally overwrite local dirty state (`pharmaWorkspaceDirty === '1'`) via `applyCloudWorkspacePayload()` | `index.html:29934–30081, 30083–30121, 30167–30201` |
| **F-04** | **Confirmed** | **P1 (High)** | Sync / Conflict Merge & Annotations | `mergeAndApplyCloudConflict()` has no shared base/ancestor snapshot and uses additive-only stroke union, resurrecting erased or undone (`Ctrl+Z`) ink strokes | `index.html:24611, 24661, 29416–29520` |
| **F-14** *(Elevated)* | **Confirmed** | **P1 (High)** | Sync / Conflict Determinism & Versioning | `mergeAndApplyCloudConflict()` combines hardcoded local/remote precedence with `_updatedAt` comparisons that are never stamped (and where wall-clock `Date.now()` alone is not clock-skew safe) | `index.html:11377, 12535, 15596, 29534, 29542, 29547–29568, 29583, 29590–29616` |
| **F-06** | **Confirmed** | **P1 (High)** | Google Drive / OAuth2 | Raw access token stored in `localStorage['exo_gdrive_token']`, no refresh token in browser GIS flow, `401` retry bypassed when `interactive=false`, and `drive.readonly` scope trade-offs | `index.html:12543, 27288, 27452, 27460–27608, 27998, 28386–28404` |
| **F-13** *(Elevated)* | **Confirmed** | **P2 (Medium-High)** *(Reclassified from P1)* | Sync / Conflict Merge Schedule Persistence | `mergeAndApplyCloudConflict()` omits immediate global `pharmaScheduleV4`/`pharmaScheduleBacklogV1` writes; relies on a delayed 1,200ms push to write `pharmaAccountWorkspace_<uid>`, leaving a 1.2s durability window and stale global boot keys | `index.html:13042–13107, 29574–29609, 29644–29651, 29779–29788` |
| **F-05** | **Risk** (Measurements Required) | **P2 (Medium-High)** *(Downgraded from P1)* | Storage / Scalability | Conditional cloud annotation sync + unconditional reserialization of `annotations` into `localStorage['pharmaAccountWorkspace_<uid>']` creates `localStorage` quota and JSONB write-amplification risk | `index.html:29019–29059, 29684, 29718–29788` |
| **F-07** | **Confirmed** | **P2 (Medium)** | Media Sync / Multi-Audio | Secondary lecture recordings (`lec.recordings[]` with `rec_<timestamp>` keys) are saved in IndexedDB `audios` but never uploaded or downloaded by cloud media sync | `index.html:21496–21566, 28528, 28576, 28667, 28816` |
| **F-08** | **Confirmed** | **P2 (Medium)** | Google Drive / Upload & Folders | `uploadMediaToCloudAccount()` ignores `queueMeta.forceReplace` and always `POST`s a new Drive file; resumable `uploadUrl` is not persisted across reloads; folder lookup by name is vulnerable to rename/orphaning | `index.html:12575–12576, 27739–27790, 27986–28089, 28181–28346` |
| **F-09** | **Confirmed** | **P2 (Medium)** | Backup / Export-Import Completeness | `exportData()` omits `annotations`, `weeklyReports`, `plannerPrefs`, `academy_progress`, and `cloudMediaRegistry`; requires distinguishing Tier A Workspace State JSON Backup from Tier B Full Media Archive (ZIP) and revisiting the 15 MB import cap | `index.html:13093–13107, 19051–19118` |
| **F-10** | **Confirmed** | **P2 (Medium)** | Google Drive / Studio UX | When `downloadMediaFromCloudAccount()` returns `null`, `openLectureDocument()` falls back to Google Drive `/preview` iframe, bypassing all Exo Studio ink, note sheets, and audio pins | `index.html:21374–21403, 28383–28453` |
| **F-12** | **Confirmed** | **P2 (Medium)** *(Upgraded from P3)* | Multi-Account / Sign-Out Privacy | `handleCloudSignOut()` resets in-memory arrays but leaves unscoped global `localStorage` keys (`pharmaSubjectsV4`, `pharmaScheduleV4`, `pharmaLogsV4`, etc.) populated, leaking data on reload | `index.html:11256–11263, 13042, 25586, 29104–29110` |
| **F-15** *(Elevated)* | **Confirmed** | **P2 (Medium)** | Sync / New-Account Login | Brand-new account branch of `syncWorkspaceOnLogin()` omits `academy_progress` when calling `applyCloudWorkspacePayload()`, resetting local `completedAcademyModules` to `[]` | `index.html:30040–30042, 30201–30216` |
| **F-11** | **Confirmed** | **P3 (Low)** | IndexedDB & Memory | `refreshLocalMediaCache()` and `getAllAnnotationsMapFromDB()` use full-store `getAll()` scans; `sessionMediaBlobRamCache` is capped at 20 entries (FIFO on write) but lacks a byte budget and read-path eviction | `index.html:19625–19670, 19694, 20028–20034, 20072–20115, 29166` |

---

### 8.2 Detailed Evidence for Every Main Finding (`F-01` – `F-15`)

#### `F-01` — Live Supabase Deployment Readiness
- **Status:** `Unknown (Owner-Side Verification Required)`
- **Severity:** **Unverified Deployment Gate** *(reclassified from confirmed P0 database failure because live database state has not been inspected and manual schema setup may already exist)*.
- **Exact Source References:**
  - `index.html:29799–29811` (`pushWorkspaceToCloud` calling `supabaseClient.rpc('sync_workspace_with_concurrency', { p_payload: payload, p_expected_revision: expectedRev })` and throwing `if (rpcErr) { console.error(...); throw rpcErr; }`)
  - `index.html:29890–29908` (`catch (err)` handler setting `localStorage.setItem('pharmaWorkspaceDirty', '1')`, updating UI to `'error'`, and returning `{ status: 'error', error: err.message || 'sync_failed' }`)
  - `index.html:26804–26808` (`verifyVipStatusFromServer`), `30058–30061` (`applyCloudWorkspacePayload`), `30094–30098` (`pullWorkspaceFromCloud`), `30169–30173` (`syncWorkspaceOnLogin`)
  - `supabase/schema.sql:1–460` and `supabase/migrations/20261103133622_*.sql` through `20261103160000_*.sql`
- **Actual Current Behavior:**
  - The client code exclusively writes workspace changes through the RPC `public.sync_workspace_with_concurrency(p_payload, p_expected_revision)` (`index.html:29799`) and reads `revision` and `can_upload_media` from `public.user_workspaces`.
  - When `sync_workspace_with_concurrency` returns an error (`rpcErr`), `pushWorkspaceToCloud()` **throws `rpcErr` immediately (`index.html:29810`)—it does NOT fall back to a direct `.upsert()` on `public.user_workspaces`**.
  - The owner confirmed that the repository's migration files have not been applied to the current Supabase project (`dszjmgzzqpdrdjkycvht`). However, without querying the live database, this does not prove whether the live database lacks those objects or already has a manually created schema.
- **Data-Loss, Privacy, or Reliability Impact:**
  - If the live database lacks `public.sync_workspace_with_concurrency(jsonb, integer)` or the expected `public.user_workspaces` schema, `pushWorkspaceToCloud()` fails with `status: 'error'` (`index.html:29908`) and retains the dirty local state (`pharmaWorkspaceDirty = '1'` at `29895` and the pre-RPC `pharmaAccountWorkspace_<uid>` snapshot at `29787`), subject to the current local persistence limitations (`F-03` login/pull overwrite if a partial remote row exists, `F-05` `localStorage` vault quota limits, and `F-12` unscoped keys). If the live database has an older schema without `20261103140000`–`20261103160000`, direct table `INSERT`/`UPDATE`/`DELETE` privileges or non-VIP storage policies may still be open to authenticated clients.
- **Missing Test Coverage:**
  - All 96 PostgreSQL 16 tests (`test_phase4_2_1_pg16_concurrency.js`) and 41 PGlite tests (`test_phase4_2_postgres_integration.js`) verify the repository's SQL files against disposable test databases; they cannot verify the external hosted Supabase instance.
- **Recommended Correction (Owner-Side, Outside This Task):**
  - Before or alongside Phase 5 rollouts, the owner can run a read-only catalog inspection on the Supabase SQL Editor, back up any existing rows in `public.user_workspaces`, and apply the consolidated repository schema/migrations if any objects are missing.

---

#### `F-02` — UI Deletion Handlers Never Call `recordTombstone()` or `deleteMediaFromDB()`
- **Status:** `Confirmed` (for zero UI call sites, missing group/backlog tombstones, and local IndexedDB orphaning) / `Unverified` (for actual orphaned files currently present in the owner's remote Google Drive).
- **Severity:** **P1 (High)** — directly causes deleted items to resurrect on conflict merge and permanently leaks local IndexedDB storage.
- **Exact Source References:**
  - `index.html:29402–29405` (`getLocalTombstones(targetUid)`)
  - `index.html:29407–29413` (`recordTombstone(entityType, id, targetUid)`)
  - `index.html:19911–19984` (`ALLOWED_MEDIA_STORES`, `deleteMediaFromDB(storeName, id, targetUserIdOrCtx, opCtx)`)
  - `index.html:11844–11849` (`triggerDeleteSubject(id, event)`)
  - `index.html:12465–12472` (`triggerDeleteGroup(groupId)`)
  - `index.html:12585–12594` (`triggerDeleteLecture(groupId, lecId)`)
  - `index.html:15602–15617` (`deleteSessionFromModal()`, `deleteSessionDirect(event, eventId)`)
  - `index.html:17794–17801` (`deleteEventFromPdfAdjuster(eventId)`)
  - `index.html:15867–15873` (`deleteBacklogTask(taskId)`)
- **Actual Current Behavior:**
  1. `recordTombstone()` and `deleteMediaFromDB()` have **zero call sites** in `index.html`.
  2. `triggerDeleteSubject`, `triggerDeleteGroup`, `triggerDeleteLecture`, `deleteSessionDirect`, `deleteEventFromPdfAdjuster`, and `deleteBacklogTask` only filter the in-memory array (`subjects`, `sub.groups`, `group.lectures`, `scheduleEvents`, `scheduleBacklog`) and call `saveSubjects()` or `saveScheduleData()`.
  3. `getLocalTombstones()` (`29404`) and `mergeAndApplyCloudConflict()` (`29456–29460, 29550–29567`) only define tombstone maps for `subjects`, `lectures`, and `events`—there is no tombstone category for `groups` (chapters) or `backlog` tasks.
  4. `ALLOWED_MEDIA_STORES` (`19911`) only includes `'pdfs'` and `'audios'`; no helper exists to delete a deleted lecture's record from the `annotations` or `annotation_recovery_vault` object stores.
- **Data-Loss, Privacy, or Reliability Impact:**
  - **Zombie Resurrection:** Any subject, group, lecture, schedule event, or backlog goal deleted on one device will resurrect whenever `mergeAndApplyCloudConflict()` runs against a remote revision that still contains that item.
  - **Confirmed Local IndexedDB Orphaning:** Deleting a lecture, group, or subject leaves its `usr_<uid>::<lecId>` PDF blob, primary audio blob, secondary `usr_<uid>::rec_*` audio blobs, and `annotations` record in IndexedDB indefinitely.
  - **Remote Google Drive Files:** Remote files in `Exo_Workspace` are also never removed when a lecture is deleted locally, though the exact number of existing orphaned files in the owner's Google Drive is unverified.
- **Missing Test Coverage:**
  - `run_comprehensive_verification.js` tests conflict tombstone filtering by passing a manually constructed tombstone object into an isolated test harness, which masked the fact that UI delete handlers in `index.html` never invoke `recordTombstone()` or `deleteMediaFromDB()`.
- **Recommended Correction:**
  - Wire `recordTombstone()` into all UI deletion handlers (`triggerDeleteSubject`, `triggerDeleteGroup`, `triggerDeleteLecture`, `deleteSessionDirect`, `deleteEventFromPdfAdjuster`, `deleteBacklogTask`) and extend tombstone support to `groups` and `backlog`.
  - Wire local IndexedDB cleanup (`deleteMediaFromDB('pdfs', lec.id)`, `deleteMediaFromDB('audios', lec.id)`, secondary `rec.dbKey` audio deletions, and a new `deleteAnnotationsFromDB(lec.id)`) into lecture, group, and subject deletion handlers.
  - **Keep local deletion separate from remote Google Drive deletion:** Do **not** automatically trash or delete remote Google Drive files during local deletion without an explicit user prompt or a durable two-stage deletion protocol, so an accidental local delete or sync conflict never destroys the user's cloud PDF/audio backup.

---

#### `F-03` — Login & Cloud Pull Unconditionally Overwrite Unsynced Offline Edits
- **Status:** `Confirmed`
- **Severity:** **P1 (High)** — confirmed silent loss of offline edits when reconnecting or logging in.
- **Exact Source References:**
  - `index.html:30123–30230` (`syncWorkspaceOnLogin(ctx)`, specifically lines `30167–30201`)
  - `index.html:30083–30121` (`pullWorkspaceFromCloud(manualNotify, ctx)`, specifically lines `30093–30114`)
  - `index.html:29934–30081` (`applyCloudWorkspacePayload(cloudRow, showSuccessToast, ctx)`, specifically lines `29948–29968`, `29981–30041`, and `30065`)
- **Actual Current Behavior:**
  - When the user opens or reloads Exo while online, `initSupabaseCloudEngine()` (`26157`) -> `handleAuthSessionChange(user, true)` (`26321`) -> `syncWorkspaceOnLogin(activeCtx)` (`30123`) fetches the remote row from `public.user_workspaces` (`30169–30177`).
  - Even if `!isSwitchingDifferentUser` (`30146`) is true and the user has unsynced local offline modifications (`localStorage.getItem('pharmaWorkspaceDirty') === '1'` or `dirtyAnnotationsForCloud === true`), `syncWorkspaceOnLogin()` (`30192`) and `pullWorkspaceFromCloud()` (`30114`) unconditionally call `applyCloudWorkspacePayload(data, ...)`.
  - `applyCloudWorkspacePayload()` overwrites IndexedDB annotations for every lecture present in `cloudRow.annotations` (`29949`), overwrites `subjects`, `scheduleEvents`, `scheduleBacklog`, `weeklyReports`, `logs`, and `completedAcademyModules` in memory and in `localStorage` (`29981–30041`), and then executes `localStorage.removeItem('pharmaWorkspaceDirty')` (`30065`).
- **Data-Loss, Privacy, or Reliability Impact:**
  - Any subjects, lectures, schedule sessions, study logs, or annotations created or edited while offline (or when a previous tab closed before the 4-second debounce completed) are overwritten by the older cloud snapshot on the next page load/login, and the dirty flag is cleared so those offline edits are permanently lost.
- **Missing Test Coverage:**
  - No unit or Chromium E2E test simulates making offline edits (`pharmaWorkspaceDirty === '1'`) followed by `syncWorkspaceOnLogin()` or `pullWorkspaceFromCloud()` when an older remote row exists.
- **Recommended Correction:**
  - In `syncWorkspaceOnLogin()` and `pullWorkspaceFromCloud()`, check whether the active user (`!isSwitchingDifferentUser`) has `localStorage.getItem('pharmaWorkspaceDirty') === '1'` or `dirtyAnnotationsForCloud === true` (or uncommitted vault entries).
  - **Important Dependency:** Do **not** simply route dirty login state into the current `mergeAndApplyCloudConflict()` function as-is; first fix the conflict merge defects (`F-02`, `F-04`, `F-13`, `F-14`) so merging local dirty state with the remote row is deterministic and persists all merged keys before pushing the unified state via `pushWorkspaceToCloud()`.

---

#### `F-04` — Erased / Undone PDF Strokes Resurrect & `mergeAndApplyCloudConflict()` Lacks a Shared Base Snapshot
- **Status:** `Confirmed`
- **Severity:** **P1 (High)** — causes erased/undone handwriting and text annotations to reappear after conflict resolution.
- **Exact Source References:**
  - `index.html:29438–29520` (`mergeAndApplyCloudConflict(remoteRow, localPayload, ctx)`, specifically lines `29490–29508`)
  - `index.html:29416–29436` (`computeStrokeUniqueSignature(s)`)
  - `index.html:24611–24659` (`eraseAtPoint(pageNum, normX, normY)`)
  - `index.html:24661–24698` (`undoLastStroke(explicitTargetKey)`)
  - `index.html:24700–24714` (`clearCurrentPageAnnotations()`)
  - `index.html:23951, 24044, 24137, 24185` (floating text note deletion)
- **Actual Current Behavior:**
  - Although the comment at `index.html:29438` describes `mergeAndApplyCloudConflict()` as `"Genuine Three-Way Non-Destructive Conflict Resolution"`, the function only compares **two** states (`remoteRow` and `localPayload` / local IndexedDB) without a common ancestor snapshot (`baseRevision`).
  - For annotations (`index.html:29493–29506`), it iterates over each page `pNum` in `rPages` and appends any remote stroke `rs` whose `computeStrokeUniqueSignature(rs)` is not in the local `strokeSigSet`.
  - When a user erases a stroke (`eraseAtPoint`), undoes a stroke (`undoLastStroke`), clears a page (`clearCurrentPageAnnotations`), or deletes a text box, the stroke is spliced/filtered out of `pageAnnotations[pageNum]` without recording any stroke-deletion tombstone.
- **Data-Loss, Privacy, or Reliability Impact:**
  - Whenever an OCC conflict occurs (or if conflict merge is invoked during dirty-login reconciliation), every stroke or text box that existed in `remoteRow.annotations` and was erased, undone, or modified locally is re-inserted into `mergedPages[pNum]`, corrupting the user's edited slide notes.
- **Missing Test Coverage:**
  - Scenario N in `test_phase4_1_chromium_e2e.js` only verifies that two newly added strokes with distinct coordinates are both preserved; no test covers erasing, undoing, or clearing strokes prior to a conflict merge.
- **Recommended Correction:**
  - Assign a stable unique `id` to each created stroke/text item (which `computeStrokeUniqueSignature` at `29418` already supports via `if (s.id) return "id:" + s.id`) and record erased/undone/cleared stroke signatures or IDs in a per-lecture/per-page tombstone list (e.g., `pages._deletedStrokes = { [sigOrId]: timestamp }`) so `mergeAndApplyCloudConflict()` filters out deleted strokes from both sides before computing the union.

---

#### `F-13` *(Elevated)* — `mergeAndApplyCloudConflict()` Omits Immediate Global `pharmaScheduleV4` & `pharmaScheduleBacklogV1` Writes (Delayed `1,200ms` Vault Snapshot Only)
- **Status:** `Confirmed`
- **Severity:** **P2 (Medium-High — Conditional Data-Loss / Stale Global Boot Key Window)** *(reclassified from unconditional P1 because the delayed `pushWorkspaceToCloud()` call scheduled after `1,200ms` writes the merged schedule into the per-account vault `pharmaAccountWorkspace_<uid>` before the network RPC; data loss or stale state occurs under specific timing, quota, or boot-hydration conditions detailed below)*.
- **Exact Source References:**
  - `index.html:29574–29609` (`mergeAndApplyCloudConflict` Steps 4–6)
  - `index.html:29644–29651` (post-merge `setTimeout(..., 1200)` scheduling `pushWorkspaceToCloud(false, false, opCtx)`)
  - `index.html:29728–29747` and `29779–29788` (`pushWorkspaceToCloud` building `payload.schedule` from in-memory `scheduleEvents` / `scheduleBacklog` and writing `localStorage.setItem('pharmaAccountWorkspace_' + syncUserId, JSON.stringify(lightweightVaultCopy))` inside `try { ... } catch (quotaErr) {}`)
  - `index.html:11258` (`scheduleBacklog` top-level boot read from `pharmaScheduleBacklogV1`) and `13042–13107` (`initScheduleData()` reading `pharmaScheduleV4` at boot; `saveScheduleData()` persisting `pharmaPlannerPrefsV1`, `pharmaWeeklyReportsV1`, `pharmaScheduleV4`, and `pharmaScheduleBacklogV1`)
- **Actual Current Behavior (Global Keys vs. Per-Account Vault Snapshot):**
  1. **Immediate Global Keys Omitted in `mergeAndApplyCloudConflict()` (`index.html:29574–29609`):**
     - Step 3 writes `pharmaSubjectsV4` (`29572`), Step 5 writes `pharmaWeeklyReportsV1` (`29604`), Step 6 writes `pharmaPlannerPrefsV1` (`29608`), Step 7 writes `pharmaLogsV4` (`29617`), and Step 8 writes `pharmaAcademyProgressV1` (`29623`).
     - Step 4 (`29574–29596`), however, updates `scheduleEvents = Array.from(eventMap.values())` (`29588`) and `scheduleBacklog = Array.from(backlogMap.values())` (`29595`) in memory **without** updating the unscoped/global `localStorage` keys `pharmaScheduleV4` or `pharmaScheduleBacklogV1`.
  2. **Delayed Per-Account Vault Write After `1,200ms` (`index.html:29644–29651` & `29779–29788`):**
     - Merged schedule data is **not** completely unpersisted across the entire lifecycle: at lines `29645–29649`, `mergeAndApplyCloudConflict()` schedules `pushWorkspaceToCloud(false, false, opCtx)` via `setTimeout(..., 1200)`.
     - When that timer fires `1,200ms` later, `pushWorkspaceToCloud()` constructs `payload.schedule` (`29732–29747`) from the merged in-memory `scheduleEvents` and `scheduleBacklog` and writes `lightweightVaultCopy` to the per-account vault snapshot `localStorage['pharmaAccountWorkspace_' + syncUserId]` (`29779–29787`) before invoking `supabaseClient.rpc('sync_workspace_with_concurrency', ...)` (`29799`).
     - Note, however, that `pushWorkspaceToCloud()` still does **not** update the unscoped global keys `pharmaScheduleV4` or `pharmaScheduleBacklogV1`.
- **Data-Loss, Stale Boot Hydration & Dirty-Pull Interaction Impact:**
  1. **The `1,200ms` Durability Window (`index.html:29645–29649`):** Because `mergeAndApplyCloudConflict()` displays the success toast at line `29642` (`"🔄 تم دمج تعديلاتك..."`) before the `1,200ms` timer fires, if the user closes or reloads the tab within `1.2 seconds` of the merge (or switches accounts so `!opCtx.isCurrent()`), neither `pharmaScheduleV4` nor `pharmaAccountWorkspace_<uid>` nor Supabase receives the merged `scheduleEvents` and `scheduleBacklog`.
  2. **Silent Quota Failure on `pharmaAccountWorkspace_<uid>` (`index.html:29780–29788`):** The per-account vault write copies `existingVault.annotations` onto `lightweightVaultCopy` (`29784–29786`) and wraps `localStorage.setItem(accountKey, ...)` in an empty `catch (quotaErr) {}` (`29788`). If `localStorage` quota is exceeded (per `F-05`) and the network RPC fails or is offline, the merged schedule is lost from both the per-account vault and the global schedule keys.
  3. **Incorrect Initial Boot Hydration & Interaction with Dirty-Login / Dirty-Pull Protection (`F-03`):**
     - On every page load, synchronous boot (`index.html:11258, 13042–13091`) hydrates `scheduleEvents` and `scheduleBacklog` from the global `pharmaScheduleV4` and `pharmaScheduleBacklogV1` keys—not from `pharmaAccountWorkspace_<uid>`.
     - Until async `syncWorkspaceOnLogin()` completes and calls `applyCloudWorkspacePayload()` (`30028–30035`), the UI renders the **stale pre-merge schedule**.
     - Crucially, this interacts directly with `F-03`: if the post-merge network RPC at `29799` failed (setting `pharmaWorkspaceDirty = '1'` at `29895`) and `syncWorkspaceOnLogin()` / `pullWorkspaceFromCloud()` is modified in Phase 5.1 to preserve dirty local state by merging the in-memory `scheduleEvents` / `scheduleBacklog` hydrated at boot, reading those variables from the stale `pharmaScheduleV4` would re-introduce the pre-merge schedule and discard the previously merged remote events!
- **Missing Test Coverage:**
  - Existing conflict merge tests check in-memory arrays immediately after `mergeAndApplyCloudConflict()` without verifying `localStorage.getItem('pharmaScheduleV4')` or `localStorage.getItem('pharmaScheduleBacklogV1')`.
- **Recommended Correction:**
  - Retain immediate global schedule persistence inside `mergeAndApplyCloudConflict()`: write `pharmaScheduleV4` and `pharmaScheduleBacklogV1` (or call `saveScheduleData(false)`) synchronously at lines `29588–29609` immediately after computing `scheduleEvents`, `scheduleBacklog`, `weeklyReports`, and `plannerPrefs`.

---

#### `F-14` *(Elevated)* — Hardcoded Local/Remote Merge Precedence, Unstamped `_updatedAt`, and Lack of a Clock-Skew-Safe Conflict Ordering Protocol
- **Status:** `Confirmed`
- **Severity:** **P1 (High)** — breaks deterministic conflict resolution across subjects, groups, lectures, schedule events, and backlog tasks during OCC merges, and cannot be solved safely by wall-clock `Date.now()` timestamps alone.
- **Exact Source References:**
  - Hardcoded local/remote precedence in `mergeAndApplyCloudConflict()` (no timestamp or revision check at all):
    - `index.html:29547–29568` (existing subject `rSub` and existing group `rg`: remote top-level properties `sub.name`, `sub.examDate`, `rg.name`, etc. are kept in place while only child arrays are merged)
    - `index.html:29557–29565` (lectures inside a matching group: `rg.lectures` added to `lecMap`, then `g.lectures` unconditionally overwrites `lecMap.set(l.id, l)`)
    - `index.html:29590–29595` (`scheduleBacklog`: `localBacklog` unconditionally overwrites `remoteBacklog` via `backlogMap.set(b.id, b)`)
    - `index.html:29598–29603` (`weeklyReports`: `localReports` unconditionally overwrites `remoteReports`)
    - `index.html:29607` (`plannerPrefs`: `Object.assign({}, remoteRow.schedule?.plannerPrefs, localPayload.schedule?.plannerPrefs)`)
    - `index.html:29611–29616` (`logs`: `localLogs` unconditionally overwrites `remoteLogs` with matching `id || timestamp`)
  - Missing `_updatedAt` comparisons where `_updatedAt` is read in `mergeAndApplyCloudConflict()` but never stamped:
    - `index.html:29534` (`const isDeletedLocally = unifiedTombstones.subjects[subId] && (!s._updatedAt || s._updatedAt < unifiedTombstones.subjects[subId]);`)
    - `index.html:29542` (`const isDeletedRemotely = unifiedTombstones.subjects[subId] && (!s._updatedAt || s._updatedAt < unifiedTombstones.subjects[subId]);`)
    - `index.html:29583` (`if (!eventMap.has(e.id) || (e._updatedAt && e._updatedAt > (eventMap.get(e.id)._updatedAt || 0)))`)
  - Modification handlers that never stamp any version or timestamp metadata:
    - `index.html:11377` (`saveSubjects`), `11819–11837` (`addSubject`), `12446–12583` (`triggerAddGroup`, `triggerEditGroup`, `triggerAddLecture`, `triggerEditLecture`), `19180–19233` (`refreshLectureSpacedRepetition`, `toggleLectureCompleted`), `21429–21452` (`persistCurrentLectureReadingBookmark`), `15520–15600` (`saveSessionFromModal`), `15619–15705` (`toggleCompleteSession`).
- **Actual Current Behavior (Distinguishing Hardcoded Precedence vs. Unstamped `_updatedAt`):**
  1. **Where `_updatedAt` Is Read But Never Written (`index.html:29534, 29542, 29583`):** Across all `32,324` logical lines (`32,323` newline delimiters) of `index.html`, the property `_updatedAt` appears **only** on lines `29534`, `29542`, and `29583`. No mutation handler ever writes `_updatedAt`. Consequently, at line `29583`, `(e._updatedAt && ...)` is always falsy, so for any schedule event present in both `remoteEvents` and `localEvents`, **the remote event always overwrites the local event**—discarding local completion status, studied minutes, or time-slot moves.
  2. **Where Merge Precedence Is Hardcoded Without Any Version Check (`index.html:29547–29568, 29590–29616`):**
     - **Lectures (`29557–29564`):** Local `g.lectures` is iterated second and unconditionally executes `lecMap.set(l.id, l)`. Thus, **the local lecture always overwrites the remote lecture**—discarding remote completion flags, Ebbinghaus `reviewCount`, reading bookmarks (`lastPageNum`), or newly attached `cloudPdfDriveId`/`cloudAudioDriveId`.
     - **Subject & Group Metadata (`29547–29568`):** Remote `rSub` and `rg` objects are retained as the container objects, so **remote subject/group properties always overwrite local edits** (such as renaming a group or updating an exam date locally).
     - **Backlog, Weekly Reports & Planner Prefs (`29590–29608`):** Local items unconditionally overwrite remote items of the same ID.
- **Why Wall-Clock `_updatedAt = Date.now()` Alone Is NOT a Complete Conflict Protocol:**
  - Local device clocks (e.g., between a tablet, phone, and desktop browser) can drift, differ across time-sync states, or be manually adjusted by the user.
  - Relying solely on `Date.now()` Last-Write-Wins (LWW) does **not** establish a reliable causal cross-device ordering: a device whose wall clock is skewed behind by even a few seconds or minutes will systematically lose conflict comparisons against an earlier edit made on a device whose clock is ahead, or a future-skewed timestamp (`_updatedAt`) can permanently pin an entity against legitimate subsequent edits and deletion tombstones.
- **Missing Test Coverage:**
  - Unit tests in `run_comprehensive_verification.js` pass synthetic objects with hand-written `_updatedAt` properties and do not test concurrent edits under clock skew, delete-vs-update conflicts, or legacy records lacking revision metadata.
- **Recommended Correction (Design Specification — Do Not Implement in Phase 5.0.2):**
  - Rather than relying on raw `Date.now()` timestamps alone, design a **deterministic, clock-skew-resilient per-entity versioning protocol** (such as **per-entity logical revisions / Lamport-style counters** `{ _rev: integer, _baseWorkspaceRev: integer, _deviceId: string, _updatedAt: number }`):
    1. **Monotonic Logical Counter Advancement:** Whenever an entity (subject, group, lecture, schedule event, backlog item, or weekly report) is mutated locally, increment its logical revision relative to the highest known revision (`entity._rev = Math.max(Number(entity._rev) || 0, Number(currentCloudWorkspaceRevision) || 0) + 1`), record `_baseWorkspaceRev = Number(currentCloudWorkspaceRevision) || 0`, stamp a persistent per-browser `_deviceId`, and record `_updatedAt = Date.now()` strictly as a secondary tie-breaker/audit hint.
    2. **Handling Concurrent Edits Across Devices:**
       - If only one side advanced beyond `_baseWorkspaceRev` (causal dominance), select the causally newer entity state.
       - If both local and remote entities were concurrently modified since their common workspace revision, apply **field-level / monotonic rules** for non-conflicting or cumulative fields (e.g., preserve sticky media IDs via `cloudMediaRegistry`, take `Math.max` for monotonic counters when appropriate, merge child collections recursively) and resolve scalar field collisions deterministically by higher logical `_rev`, breaking exact `_rev` ties via a deterministic tuple (`_rev`, bounded HLC/counter, lexicographic `_deviceId`) so two devices merging the same two payloads always produce identical state regardless of wall-clock skew.
    3. **Handling Deletion-vs-Update Conflicts:**
       - Record deletion tombstones as structured version entries `{ rev: nextLogicalRev, baseWorkspaceRev: currentCloudWorkspaceRevision, deviceId, deletedAtMs: Date.now() }` rather than a bare `Date.now()` integer.
       - During merge, a tombstone suppresses an entity if the entity lacks a revision or has `(entity._rev || 0) <= tombstone.rev`; an entity only survives a tombstone if it carries an explicit causal mutation with `entity._rev > tombstone.rev` created after observing the tombstone's workspace revision.
    4. **Handling Missing Legacy Timestamps / Revisions:**
       - Normalize any pre-existing legacy entity lacking `_rev` (and/or `_updatedAt`) to `{ _rev: 0, _baseWorkspaceRev: 0 }` during load/merge. If an unversioned legacy entity (`_rev === 0`) conflicts with a versioned entity (`_rev > 0`), the versioned entity (`_rev > 0`) wins deterministically; if both are unversioned (`_rev === 0`), apply a documented, deterministic field-level merge and assign `_rev = (currentCloudWorkspaceRevision || 1)` upon completion.

---

#### `F-06` — Google Drive OAuth2 Token Persistence, Partial `401` Retry & `drive.readonly` Scope Trade-Off
- **Status:** `Confirmed`
- **Severity:** **P1 (High)** — raw bearer token persisted in `localStorage`, incomplete `401` recovery on default non-interactive download paths, and over-broad OAuth scope requiring an explicit product trade-off decision.
- **Exact Source References:**
  - `index.html:27452–27458` (`googleAccessToken`, `googleTokenExpiry`, `isGoogleDriveTokenActive()`)
  - `index.html:27460–27554` (`ensureGoogleAccessToken(interactive = true)`)
  - `index.html:27576–27608` (`trySilentGoogleDriveConnection(emailHint = '')`)
  - `index.html:27972–28094` (`uploadBlobToGoogleDriveViaXHR`, specifically `27998–28014` for `401` retry)
  - `index.html:28364–28513` (`downloadMediaFromCloudAccount(storeName, lecObj, interactive = false)`, specifically `28384–28404`)
  - `index.html:21331, 21382` (`openLectureDocument` calling `downloadMediaFromCloudAccount` without `interactive = true`)
  - `index.html:27288–27375` (`auditAndManageGoogleDrivePermissions`) & `12543–12556` (`triggerEditLecture` external Drive link extraction)
- **Actual Current Behavior:**
  1. **Raw Bearer Token in `localStorage`:** `ensureGoogleAccessToken()` (`27508`) and `trySilentGoogleDriveConnection()` (`27592`) store the raw Google OAuth2 access token in `localStorage['exo_gdrive_token']`.
  2. **Non-Interactive GIS Request (`ensureGoogleAccessToken(false)`):** When `interactive === false` and the cached token is missing or expired, `ensureGoogleAccessToken(false)` (`27541–27543`) does **not** return immediately; it initializes `googleTokenClient` and invokes `googleTokenClient.requestAccessToken({ prompt: '', hint: hint })` with a `2,500ms` timeout (`setTimeout(() => finish(null), 2500)`).
  3. **No Persistent Refresh Token:** Because Exo uses the browser-only GIS implicit token model (`initTokenClient`), no OAuth2 `refresh_token` is issued. Once the ~1-hour access token expires, silent renewal depends on active Google browser cookies and third-party iframe/popup rules.
  4. **Specific `401` Retry Paths (Not Universal):**
     - `uploadBlobToGoogleDriveViaXHR()` (`27998–28014`) retries the upload initiation `POST` once on `HTTP 401` via `await ensureGoogleAccessToken(true)`.
     - `downloadMediaFromCloudAccount()` (`28395–28404`) only retries on `HTTP 401` when `interactive === true`. Because `openLectureDocument()` (`21331, 21382`) and `downloadAllCloudMediaToLocal()` (`28809, 28819`) call `downloadMediaFromCloudAccount(storeName, lec)` with the default `interactive = false`, an unexpected `401` during lecture open is not retried interactively.
     - Other Drive API calls (`ensureExoGoogleDriveFolder` at `27792`, `ensureSubfolderInGoogleDrive` at `27739`, `fetchGoogleDriveUserInfo` at `27698`, `downloadBlobFromGoogleDrive` at `27949`) have no `401` retry.
  5. **`drive.readonly` Scope Trade-Off & Google Picker Status:** Requesting `https://www.googleapis.com/auth/drive.readonly` alongside `drive.file` (`27502, 27586`) grants read access to the user's entire Google Drive. In the current codebase, `drive.readonly` enables `auditAndManageGoogleDrivePermissions()` (`27316`, which scans up to 50 files across the user's Drive) and direct `alt=media` downloads of external Drive URLs pasted into `triggerEditLecture()` (`12543`) that were not uploaded by Exo. Note that **Google Picker (`google.picker` / `PickerBuilder`) is not currently implemented anywhere in `index.html`**; using Google Picker to grant per-file `drive.file` access to external Drive files is strictly a **proposed future integration option**, not an existing feature or working fallback.
- **Data-Loss, Privacy, or Reliability Impact:**
  - Storing `exo_gdrive_token` in `localStorage` persists the bearer token on disk across browser restarts. (Note: moving it to `sessionStorage` limits lifetime to the tab session, though `sessionStorage` remains accessible to same-origin JavaScript if an XSS vulnerability ever occurred; keeping the token in a module-scoped closure or memory with explicit re-auth on reload is more defensive).
  - Retaining `drive.readonly` exposes the user's entire Drive to any compromise of the token and triggers Google's Restricted Scope verification requirements if the OAuth client is published externally.
- **Missing Test Coverage:**
  - Zero automated tests mock `google.accounts.oauth2.initTokenClient` or `googleapis.com/drive/v3` to verify `ensureGoogleAccessToken(false)`, `401` token refresh retry, or scope behavior.
- **Recommended Correction:**
  - Keep `googleAccessToken` in memory (or short-lived `sessionStorage` with clear documentation that it is a persistence reduction rather than an XSS defense) rather than `localStorage`.
  - Add a shared authenticated Google Drive request helper that handles `401` token invalidation consistently.
  - Present the owner with an explicit product decision on whether to retain the current OAuth scope or narrow it in a future phase to `https://www.googleapis.com/auth/drive.file` by scoping `auditAndManageGoogleDrivePermissions()` to `Exo_Workspace` files and handling external non-Exo Drive links via a future Google Picker integration (proposed future option) or the `/preview` iframe.

---

#### `F-05` — Conditional Cloud Annotation Sync, Per-Account `localStorage` Vault Reserialization & JSONB Write Amplification
- **Status:** `Confirmed (Scalability Risk — Representative Measurements Required)`
- **Severity:** **P2 (Medium-High Scalability Risk)** *(reclassified from immediate P1 failure because annotation sync is conditional and actual overflow thresholds depend on the owner's handwriting volume)*.
- **Exact Source References:**
  - `index.html:29671–29689` (`markLocalWorkspaceModified(includeAnnotations = false)` with `4000ms` debounce at `29684–29688`)
  - `index.html:29718–29773` (conditional annotation inclusion in `pushWorkspaceToCloud`)
  - `index.html:29779–29788` (per-account local vault write in `pushWorkspaceToCloud`)
  - `index.html:29019–29059` (per-account local vault write in `handleCloudSignOut`)
  - `supabase/schema.sql:237` (`sync_workspace_with_concurrency` preserving `annotations` when `NOT (p_payload ? 'annotations')`)
- **Actual Current Behavior:**
  1. **4-Second Automatic Debounce:** `markLocalWorkspaceModified()` (`29684–29688`) schedules `pushWorkspaceToCloud(false, false, scheduledCtx)` after **4,000ms (4 seconds)**.
  2. **Conditional Annotation Inclusion in Network Payload (`29718–29773`):** `pushWorkspaceToCloud()` does **not** include annotations on every cloud push. It evaluates `shouldSendAnnotations = Boolean(forceIncludeAnnotations || manualNotify || (dirtyAnnotationsForCloud && !isPdfModalOpenNow))` (`29719–29723`). When true, it reads `getAllAnnotationsMapFromDB()`, computes `computeFastStringSignature(serializedAnnos)` (`29768`), and attaches `payload.annotations` only if `manualNotify || forceIncludeAnnotations || currentSig !== lastUploadedAnnotationsSignature` (`29769`).
  3. **Per-Account `localStorage` Backup Reserialization (`29780–29788` & `29019–29054`):** Even during a lightweight 4-second metadata push where `payload.annotations` is omitted from the network RPC call, lines `29782–29787` read `existingVault` from `localStorage['pharmaAccountWorkspace_' + syncUserId]`, copy `existingVault.annotations` onto `lightweightVaultCopy.annotations`, and reserialize the entire object back to `localStorage` (silently catching any `quotaErr` at `29788`). On sign-out (`29019–29059`), `handleCloudSignOut()` also writes the full `annotations` map into `localStorage['pharmaAccountWorkspace_' + canonicalUid]` and sets `localVaultBackupOk = false` (displaying a warning toast at `29066`) if `localStorage.setItem` throws.
  4. **Supabase JSONB Full-Column Rewrite When Annotations Are Sent:** Whenever annotations *are* sent (e.g., on `closePdfViewer()` at `25541`, tab `visibilitychange` -> `hidden` at `30284`, or manual sync), the entire verified `annotations` map across all annotated lectures is sent in `p_payload.annotations` and written to `public.user_workspaces.annotations`.
- **Data-Loss, Privacy, or Reliability Impact:**
  - **Distinction 1 — Browser `localStorage` Quota Risk:** Storing a duplicate copy of all IndexedDB annotations inside `localStorage['pharmaAccountWorkspace_<uid>']` competes with the browser's origin `localStorage` quota and causes repeated synchronous `JSON.parse` / `JSON.stringify` work on every 4-second metadata save. Because IndexedDB (`annotations` store) already persists per-user annotations durably on disk, duplicating `annotations` inside `localStorage['pharmaAccountWorkspace_<uid>']` is redundant.
  - **Distinction 2 — Supabase JSONB Write Amplification:** Sending all lectures' annotations in a single JSONB column scales with the total semester handwriting volume rather than the single lecture just edited. Whether this requires a dedicated per-lecture table (`public.lecture_annotations`) should be decided based on representative measurements of the owner's actual annotation payload sizes.
- **Missing Test Coverage:**
  - No test measures `pharmaAccountWorkspace_<uid>` serialization size or verifies behavior when `localStorage.setItem(accountKey, ...)` throws `QuotaExceededError` during `handleCloudSignOut()`.
- **Recommended Correction:**
  - Decouple `annotations` from `localStorage['pharmaAccountWorkspace_<uid>']` (keeping the `localStorage` vault strictly for lightweight structured metadata `subjects`, `schedule`, `logs`, and `academy_progress`, while relying on the already-scoped IndexedDB `annotations` store—or an IndexedDB `workspaces` store—for local annotation durability).
  - Measure real annotation payload sizes in the owner's workspace before deciding whether to partition `public.user_workspaces.annotations` into a separate Supabase table.

---

#### `F-07` — Secondary Multi-Audio Recordings (`rec_*`) Are Stored in IndexedDB But Never Synced to Cloud
- **Status:** `Confirmed`
- **Severity:** **P2 (Medium)** — secondary audio recordings added via the studio dropdown cannot be played on a second device.
- **Exact Source References:**
  - `index.html:21467–21566` (`renderLectureRecordingsSelector`, `addRecordingToCurrentLecture`, `switchLectureRecording`)
  - `index.html:28515–28602` (`uploadSingleLectureMediaToCloud`, `uploadCurrentViewingLectureMediaToCloud`)
  - `index.html:28604–28778` (`syncAllLocalMediaToCloud`, specifically `28667`)
  - `index.html:28780–28836` (`downloadAllCloudMediaToLocal`, specifically `28816`)
- **Actual Current Behavior:**
  - `addRecordingToCurrentLecture()` (`index.html:21505–21516`) generates `const recId = 'rec_' + Date.now()`, stores the audio `File` in IndexedDB `audios` under `recId` (`saveMediaToDB('audios', recId, file)`), and pushes `{ id: recId, name, fileName, dbKey: recId, createdAt }` into `lec.recordings`.
  - All cloud media upload and download functions (`uploadSingleLectureMediaToCloud` at `28528`, `uploadCurrentViewingLectureMediaToCloud` at `28576`, `syncAllLocalMediaToCloud` at `28667`, `downloadAllCloudMediaToLocal` at `28816`, and `openLectureDocument` at `21329`) only read/write `getMediaFromDB('audios', lec.id)` and never iterate `lec.recordings`.
- **Data-Loss, Privacy, or Reliability Impact:**
  - Because `lec.recordings` metadata is inside `subjects`, the recording titles sync to Supabase and appear in the selector dropdown on other devices (or after clearing browser cache), but selecting any `rec_*` recording fails silently because its binary audio blob was never uploaded to Google Drive.
- **Missing Test Coverage:**
  - Zero tests cover `addRecordingToCurrentLecture()`, `switchLectureRecording()`, or cloud synchronization of `lec.recordings[]`.
- **Recommended Correction:**
  - Extend `uploadMediaToCloudAccount`, `syncAllLocalMediaToCloud`, `downloadAllCloudMediaToLocal`, and `switchLectureRecording` to upload and download each recording entry in `lec.recordings[]` (storing `cloudAudioUploaded`, `cloudAudioDriveId`, `cloudAudioPath`, and `cloudAudioSize` on each recording object in `lec.recordings`).

---

#### `F-08` — Google Drive File Replacement (`forceReplace` Ignored), Non-Persisted Resumable URL & Folder-Name Lookup
- **Status:** `Confirmed`
- **Severity:** **P2 (Medium)** — creates duplicate files in Google Drive when replacing lecture media, restarts interrupted uploads from byte 0 on reload, and ties folder identity to mutable display names.
- **Exact Source References:**
  - `index.html:12575–12576` (`triggerEditLecture` passing `{ forceReplace: true }`)
  - `index.html:28181–28346` (`uploadMediaToCloudAccount` ignoring `queueMeta.forceReplace`)
  - `index.html:27972–28094` (`uploadBlobToGoogleDriveViaXHR` initiating `POST /upload/drive/v3/files?uploadType=resumable` at `27986` and `PUT` to `uploadUrl` at `28033`)
  - `index.html:27729–27790` (`gdriveSubfolderCache`, `ensureSubfolderInGoogleDrive`)
- **Actual Current Behavior:**
  1. **`forceReplace` Ignored:** `triggerEditLecture()` (`12575–12576`) passes `{ forceReplace: true }` to `uploadMediaToCloudAccount()`, which ignores that property and always calls `uploadBlobToGoogleDriveViaXHR()` to execute `POST /upload/drive/v3/files?uploadType=resumable`, creating a new Drive file and leaving the previous `cloudPdfDriveId`/`cloudAudioDriveId` file in the folder.
  2. **Single-Execution Resumable Upload:** `uploadBlobToGoogleDriveViaXHR()` uses Google Drive's resumable upload protocol (`uploadType=resumable`) within a single function call, but `uploadUrl` (`28021`) is not persisted to `sessionStorage`/`localStorage`. If an upload is interrupted by a page reload or network drop, the session URL is not resumed via a `Content-Range` byte-offset query.
  3. **Folder Lookup by Display Name:** `ensureSubfolderInGoogleDrive()` (`27739–27790`) queries Google Drive by sanitized subject/group name (`27752`) rather than persisting a `driveFolderId` on `sub` and `group`. While renaming a subject/group does not immediately create a new folder, uploading a new file after a rename creates a new folder under the new name rather than using or renaming the original folder.
- **Data-Loss, Privacy, or Reliability Impact:**
  - Replacing a lecture's PDF or audio leaves duplicate files with identical names in the user's Google Drive folder, and renaming subjects/chapters followed by new uploads splits files across old and new folder names.
- **Missing Test Coverage:**
  - No automated tests cover `triggerEditLecture` media replacement or `ensureSubfolderInGoogleDrive`.
- **Recommended Correction:**
  - When `queueMeta?.forceReplace` is true (or when `lecObj.cloudPdfDriveId` / `lecObj.cloudAudioDriveId` already exists), update the existing Drive file via `PATCH https://www.googleapis.com/upload/drive/v3/files/${existingDriveId}?uploadType=resumable` (falling back to `POST` only if `404 Not Found`).
  - Persist `driveFolderId` on `sub` and `group` objects when folders are created/resolved.

---

#### `F-09` — Incomplete Manual Backup/Restore Coverage, Missing Tier Distinction (State JSON vs. Media Archive) & 15 MB Import Cap
- **Status:** `Confirmed`
- **Severity:** **P2 (Medium)** — manual JSON backup files omit all PDF handwriting/annotations and several workspace settings, exclude binary PDF/audio blobs, and enforce a hardcoded 15 MB import limit (`index.html:19075`).
- **Exact Source References:**
  - `index.html:19051–19068` (`exportData()`)
  - `index.html:19072–19118` (`importData(event)`, specifically `if (file.size > 15 * 1024 * 1024)` at `19075` and `reader.readAsText(file)` at `19117`)
  - `index.html:13093–13107` (`saveScheduleData(syncToCloud = true)`)
- **Actual Current Behavior:**
  1. `exportData()` (`19051–19060`) serializes only `{ subjects, schedule: { version: 2, events: scheduleEvents, backlog: scheduleBacklog }, logs }`. It excludes IndexedDB `annotations` (all tablet ink strokes, text notes, extra note pages, and audio pins), `weeklyReports`, `plannerPrefs`, `completedAcademyModules`, `cloudMediaRegistry`, and `_tombstones`, as well as all binary PDF and audio blobs stored in IndexedDB (`pdfs` and `audios`).
  2. When importing a standard exported file (which includes `data.schedule`), `importData()` (`19091–19102`) executes `saveScheduleData()` (`19101`), which calls `markLocalWorkspaceModified(false)` (`13105`) and therefore **does** trigger a 4-second debounced metadata sync to the cloud.
  3. However, if a backup file omits `data.schedule` (containing only `subjects` or `logs`), `markLocalWorkspaceModified()` is not called.
  4. Furthermore, `importData()` rejects any file over **15 MB** (`if (file.size > 15 * 1024 * 1024)` at `index.html:19075`) and loads the entire file into a single string via `FileReader.readAsText(file)` (`19117`).
- **Data-Loss, Privacy, or Reliability Impact:**
  - A user who relies on `exportData()` before clearing browser storage or switching devices loses all tablet handwriting annotations, weekly evaluation reports, planner preferences, and academy progress upon restoring the JSON file—and still does not have local copies of un-uploaded binary PDFs or secondary `rec_*` audio recordings.
- **Missing Test Coverage:**
  - Zero tests verify `exportData()` and `importData()` round-trip completeness or large-file boundary behavior.
- **Recommended Correction (Honest Two-Tier Backup Definition):**
  - Do **not** label a metadata-plus-annotations JSON file a "100% lossless full workspace backup" when binary PDFs and audio recordings remain outside the JSON file. Explicitly distinguish two backup tiers:
    - **Tier A — Workspace State Backup (`.json`, Implemented First in Phase 5.1):**
      - Contains all structured workspace metadata (`subjects`, `schedule` including `events`, `backlog`, `plannerPrefs`, `weeklyReports`, `cloudMediaRegistry`, `_tombstones`, `logs`, `academy_progress`) **plus** verified IndexedDB `annotations` (ink strokes, text notes, extra note sheets, audio pins, and `_deletedStrokes`).
      - Explicitly does **not** embed binary PDF/audio blobs (though it preserves `cloudMediaRegistry` and `cloudPdfDriveId`/`cloudAudioDriveId` pointers so Google Drive media can re-hydrate).
      - Because semester-long handwriting annotations can exceed 15 MB in JSON form, reconsider and raise the 15 MB import limit (`19075`) for Tier A (e.g., to 50–100 MB with chunked/streaming or worker-assisted JSON parsing and strict schema validation) and ensure `importData()` calls `markLocalWorkspaceModified(Boolean(data.annotations))` regardless of which keys are present.
    - **Tier B — Full Media Archive (`.exo.zip` / Versioned Archive Container, Separate Future Capability):**
      - Required for a genuinely self-contained full restoration that includes binary lecture files without relying on Google Drive or pre-existing IndexedDB blobs.
      - Uses a versioned archive format (e.g., ZIP container) containing:
        1. `manifest.json` (`formatVersion`, `exportedAtIso`, `ownerUid`, stable lecture/recording ID mapping, byte sizes, and SHA-256 checksums for every included file).
        2. `workspace_state.json` (the complete Tier A Workspace State Backup).
        3. `media/pdfs/<lecId>.pdf` and `media/audios/<lecId_or_recId>.<ext>` binary files streamed out of IndexedDB (`WorkspaceMediaStore`).
      - Because a Full Media Archive with PDFs and audio recordings can range from hundreds of megabytes to several gigabytes, Tier B import **cannot** use `FileReader.readAsText()` or a 15 MB file-size gate; it must read binary entries from the archive via `Blob.slice()` / streaming ZIP reader, verify SHA-256 checksums against `manifest.json`, and write each blob directly to IndexedDB via `saveMediaToDB()`.

---

#### `F-10` — Google Drive `/preview` Iframe Fallback Disables Exo Studio Ink & Audio Pins
- **Status:** `Confirmed`
- **Severity:** **P2 (Medium)** — cross-device PDF viewing silently degrades to a read-only iframe when no active GIS access token is available.
- **Exact Source References:**
  - `index.html:21251–21426` (`openLectureDocument`, specifically lines `21374–21403`)
  - `index.html:28364–28453` (`downloadMediaFromCloudAccount`)
- **Actual Current Behavior:**
  - When `openLectureDocument()` finds no local PDF in IndexedDB (`21374`) and calls `downloadMediaFromCloudAccount('pdfs', lec)` (`21382`, with `interactive = false`), if `ensureGoogleAccessToken(false)` (`28386`) cannot obtain a token non-interactively within `2500ms` (`27543`) and the private file cannot be fetched from public URLs (`28426–28450`), `downloadMediaFromCloudAccount()` returns `null`.
  - Lines `21394–21403` then hide `#pdfPagesScrollContainer` and display `<iframe id="pdfViewerIframe" src="https://drive.google.com/file/d/${cloudDriveFileId}/preview">`.
- **Data-Loss, Privacy, or Reliability Impact:**
  - When the `/preview` iframe is shown, the student's existing annotations (even though already synced into IndexedDB from Supabase!) are hidden, and the pen, highlighter, text editor, extra blank note pages, audio pins, and merged continuous mode cannot be used on the PDF until the binary PDF blob is downloaded via an active Google Drive token.
- **Missing Test Coverage:**
  - No Chromium E2E test covers opening a cloud-backed lecture when `getMediaFromDB('pdfs', lec.id)` is `null`.
- **Recommended Correction:**
  - When `openLectureDocument()` detects a Drive-backed PDF that is missing locally and `isGoogleDriveTokenActive()` is false, display a clear action banner/button in the PDF Studio header allowing the user to click once (`ensureGoogleAccessToken(true)` -> `downloadMediaFromCloudAccount('pdfs', lec, true)`) to download the PDF into IndexedDB and immediately switch from `/preview` to the interactive Exo PDF.js annotation canvas.

---

#### `F-12` — Unscoped Global `localStorage` Keys Remain Populated After `handleCloudSignOut()`
- **Status:** `Confirmed`
- **Severity:** **P2 (Medium)** *(upgraded from P3 because reloading the page after sign-out visibly re-hydrates the signed-out user's private workspace into the logged-out UI)*.
- **Exact Source References:**
  - `index.html:28974–29128` (`handleCloudSignOut`, specifically lines `29104–29110`)
  - `index.html:11256–11263` (`subjects`, `logs`, `scheduleBacklog` boot initialization)
  - `index.html:13042–13091` (`initScheduleData` boot initialization)
  - `index.html:25586` (`completedAcademyModules` boot initialization)
  - `index.html:26334` (`cloudMediaRegistry` boot initialization)
- **Actual Current Behavior:**
  - During sign-out, `handleCloudSignOut()` backs up the user's workspace into `localStorage['pharmaAccountWorkspace_' + canonicalUid]` (`29052`) and resets the in-memory arrays (`subjects = []`, `scheduleEvents = []`, `scheduleBacklog = []`, `weeklyReports = []`, `logs = []`, `completedAcademyModules = []` at `29104–29109`), then re-renders the UI (`29112–29116`).
  - However, it **never removes or resets** the unscoped global `localStorage` keys: `pharmaSubjectsV4`, `pharmaScheduleV4`, `pharmaScheduleBacklogV1`, `pharmaWeeklyReportsV1`, `pharmaPlannerPrefsV1`, `pharmaLogsV4`, `pharmaAcademyProgressV1`, or `pharmaCloudMediaRegistryV1`.
- **Data-Loss, Privacy, or Reliability Impact:**
  - Immediately after signing out, the UI appears empty because the in-memory arrays were cleared. However, **as soon as the browser tab is reloaded while logged out**, the top-level boot code (`11256, 13043, 25586`) reads `pharmaSubjectsV4`, `pharmaScheduleV4`, `pharmaLogsV4`, and `pharmaAcademyProgressV1` from `localStorage` and displays the signed-out user's subjects, lectures, schedule, and study logs in the unauthenticated view!
- **Missing Test Coverage:**
  - Existing logout tests in `test_phase4_1_chromium_e2e.js` verify `handleCloudSignOut()` return values and IndexedDB isolation without reloading the page while logged out to inspect `subjects` and `scheduleEvents`.
- **Recommended Correction:**
  - In `handleCloudSignOut()`, once `localVaultBackupOk` is confirmed, clear or reset the unscoped working keys (`pharmaSubjectsV4`, `pharmaScheduleV4`, `pharmaScheduleBacklogV1`, `pharmaWeeklyReportsV1`, `pharmaLogsV4`, `pharmaAcademyProgressV1`, `pharmaCloudMediaRegistryV1`) so reloading while logged out renders a clean anonymous state while preserving `pharmaAccountWorkspace_<uid>` and scoped IndexedDB records for the user's next login.

---

#### `F-15` *(Elevated)* — Brand-New Account Branch of `syncWorkspaceOnLogin()` Omits `academy_progress`
- **Status:** `Confirmed`
- **Severity:** **P2 (Medium)** — resets locally completed Academy modules (`completedAcademyModules`) to `[]` when signing into a new cloud account that has no remote row yet.
- **Exact Source References:**
  - `index.html:30201–30216` (`syncWorkspaceOnLogin` `else` branch when `!data`)
  - `index.html:30040–30042` (`applyCloudWorkspacePayload` overwriting `completedAcademyModules`)
- **Actual Current Behavior:**
  - When a user logs into a brand-new account that has neither a remote row in `public.user_workspaces` nor a local `pharmaAccountWorkspace_<uid>` snapshot (`!data` at `30201`), `syncWorkspaceOnLogin()` calls `applyCloudWorkspacePayload({ user_id: opCtx.uid, can_upload_media: false, subjects: subjects, schedule: { ... }, logs: logs, annotations: {} }, false, opCtx)` (`30203–30210`).
  - Because `academy_progress` is omitted from that object literal, `applyCloudWorkspacePayload()` at line `30040` evaluates `completedAcademyModules = Array.isArray(cloudRow.academy_progress) ? cloudRow.academy_progress : []`, overwriting `completedAcademyModules` with `[]` and saving `'[]'` to `localStorage['pharmaAcademyProgressV1']` (`30041`) before `pushWorkspaceToCloud()` runs at `30214`.
- **Data-Loss, Privacy, or Reliability Impact:**
  - Any Academy onboarding/guide modules completed before creating or logging into a new cloud account are wiped to `[]` on initial login.
- **Missing Test Coverage:**
  - No test exercises the `!data` new-account branch of `syncWorkspaceOnLogin()` with non-empty `completedAcademyModules`.
- **Recommended Correction:**
  - Include `academy_progress: isSwitchingDifferentUser ? [] : (completedAcademyModules || [])` in the object passed to `applyCloudWorkspacePayload()` at `index.html:30203–30210` (and clear `completedAcademyModules = []` / `pharmaAcademyProgressV1` inside the `if (isSwitchingDifferentUser)` block at `30149–30165`).

---

#### `F-11` — IndexedDB Full-Store `getAll()` Scans & FIFO Entry-Capped RAM Blob Cache
- **Status:** `Confirmed`
- **Severity:** **P3 (Low)** — performance and memory optimization opportunity under large multi-lecture workloads.
- **Exact Source References:**
  - `index.html:19625–19670` (`refreshLocalMediaCache`, specifically `19635–19636` calling `getAll()` on `pdfs` and `audios`)
  - `index.html:29131–29254` (`getAllAnnotationsMapFromDB`, specifically `29166` calling `store.getAll()`)
  - `index.html:19525–19623` (`claimAndMigrateLegacyRecords`, specifically `19581, 19584, 19587`)
  - `index.html:19694` (`sessionMediaBlobRamCache = { pdfs: new Map(), audios: new Map() }`)
  - `index.html:20028–20034` (`saveMediaToDB` 20-entry FIFO eviction)
  - `index.html:20072–20085, 20113–20115` (`getMediaFromDB` cache read and uncapped cache insertion)
- **Actual Current Behavior:**
  1. `refreshLocalMediaCache()` (`19635–19636`) and `getAllAnnotationsMapFromDB()` (`29166`) use `store.getAll()` across the entire object store and filter records in JavaScript via `hasStrictDualRecordOwnership()`.
  2. `sessionMediaBlobRamCache.pdfs` and `sessionMediaBlobRamCache.audios` (`19694`) are **capped at 20 entries** during `saveMediaToDB()` (`20030–20033`), which evicts the oldest inserted key (`sessionMediaBlobRamCache[storeName].keys().next().value`).
  3. However, `getMediaFromDB()` (`20113–20115`) inserts blobs into `sessionMediaBlobRamCache[storeName]` on an IndexedDB read hit **without** enforcing the `size > 20` cap, does not update Map key order on cache hit (`20073`, making eviction FIFO rather than true LRU), and enforces no byte-size budget.
- **Data-Loss, Privacy, or Reliability Impact:**
  - Does not cause data loss, but opening more than 20 pre-existing lectures from IndexedDB in a single session bypasses the 20-entry cap on `getMediaFromDB()`, and `refreshLocalMediaCache()` deserializes all `pdfs`/`audios` records when only key/ownership verification is needed.
- **Missing Test Coverage:**
  - No test verifies `sessionMediaBlobRamCache` eviction on `getMediaFromDB()` read hits or byte-budget bounds.
- **Recommended Correction:**
  - Enforce the entry-count and a byte-size LRU cap in a shared `putInSessionMediaRamCache(storeName, scopedKey, blob)` helper called by both `saveMediaToDB()` and `getMediaFromDB()`, and refresh entry order on cache hit.
  - Use `IDBKeyRange.bound(activePrefix, activePrefix + '\uffff')` on the primary key in `refreshLocalMediaCache()` and `getAllAnnotationsMapFromDB()` to scan only the active user's key prefix.

---

## 9. Specific Implementation Gaps Summary

For quick engineering reference, the concrete code-level gaps identified in `index.html` are:

1. **Zero UI Call Sites for `recordTombstone()` (`index.html:29407`) & `deleteMediaFromDB()` (`index.html:19913`):** Neither function is called by `triggerDeleteSubject` (`11844`), `triggerDeleteGroup` (`12465`), `triggerDeleteLecture` (`12585`), `deleteSessionDirect` (`15609`), `deleteEventFromPdfAdjuster` (`17794`), or `deleteBacklogTask` (`15867`), and no `deleteAnnotationsFromDB()` function exists (`F-02`).
2. **Missing `groups` and `backlog` Tombstone Categories (`index.html:29404, 29456–29460`):** `getLocalTombstones()` only initializes `{"subjects":{},"lectures":{},"events":{}}` (`F-02`).
3. **Dirty Offline State Ignored on Login/Pull (`index.html:30093–30114, 30168–30200`):** `syncWorkspaceOnLogin()` and `pullWorkspaceFromCloud()` call `applyCloudWorkspacePayload()` without checking `pharmaWorkspaceDirty === '1'` or `dirtyAnnotationsForCloud`, and `applyCloudWorkspacePayload()` clears `pharmaWorkspaceDirty` at line `30065` (`F-03`).
4. **No Stroke-Deletion Tombstones in `mergeAndApplyCloudConflict()` (`index.html:29496–29505`):** Additive-only union over `computeStrokeUniqueSignature()` resurrects erased/undone strokes (`F-04`).
5. **Omitted Immediate `pharmaScheduleV4` & `pharmaScheduleBacklogV1` Global Writes in `mergeAndApplyCloudConflict()` (`index.html:29588, 29595, 29645–29649, 29779–29788`):** Merged `scheduleEvents` and `scheduleBacklog` are updated in RAM and only written `1,200ms` later to the per-account vault `pharmaAccountWorkspace_<uid>` (`29787`, inside an empty `catch (quotaErr) {}`), leaving the global boot keys `pharmaScheduleV4` and `pharmaScheduleBacklogV1` stale until a subsequent schedule edit or cloud pull (`F-13`).
6. **Hardcoded Merge Precedence, Unstamped `_updatedAt`, and No Clock-Skew-Safe Ordering Protocol (`index.html:29534, 29542, 29547–29568, 29583, 29590–29616`):** Entity and event edit handlers never stamp `_updatedAt` or logical revisions, while `mergeAndApplyCloudConflict()` mixes unstamped `_updatedAt` checks (causing remote schedule events to always overwrite local events) with hardcoded order-dependent overwrites (causing local lectures to always overwrite remote lectures and remote subject/group fields to overwrite local fields) (`F-14`).
7. **Unscoped `localStorage` Keys Left Behind on `handleCloudSignOut()` (`index.html:29104–29110`):** Reloading the page while logged out re-hydrates the signed-out user's data from `pharmaSubjectsV4`, `pharmaScheduleV4`, `pharmaLogsV4`, and `pharmaAcademyProgressV1` (`F-12`).
8. **New-Account Branch of `syncWorkspaceOnLogin()` Omits `academy_progress` (`index.html:30203–30210`):** Resets `completedAcademyModules` to `[]` at line `30040` (`F-15`).
9. **Secondary Audio Recordings (`rec_*`) Omitted from Cloud Media Sync (`index.html:21505, 28528, 28576, 28667, 28816`):** Only `lec.id` is uploaded/downloaded (`F-07`).
10. **`queueMeta.forceReplace` Ignored in `uploadMediaToCloudAccount()` (`index.html:12575 vs. 28210`):** Editing a lecture's PDF/audio creates a new Google Drive file via `POST` instead of updating via `PATCH` (`F-08`).
11. **`interactive = false` Default in `downloadMediaFromCloudAccount()` (`index.html:21382, 28364, 28395`):** Prevents the `401` token refresh retry at line `28395` from running when opening a lecture (`F-06`, `F-10`).
12. **Incomplete `exportData()` / `importData()` & 15 MB Cap (`index.html:19051–19118`):** Excludes `annotations`, `weeklyReports`, `plannerPrefs`, `completedAcademyModules`, `cloudMediaRegistry`, and `_tombstones`, excludes binary PDF/audio blobs, and enforces a 15 MB limit at line `19075` (`F-09`).

---

## 10. Recommended Target Architecture

To preserve the existing application without a rewrite while closing every confirmed data-loss, privacy, and sync defect, we recommend keeping the existing four-tier architecture with the following clarified responsibilities:

| Layer | Target Responsibility & Refinements |
| :--- | :--- |
| **1. Browser IndexedDB (`WorkspaceMediaStore` v4/v5)** | **Authoritative Local Store for Binary Media, Annotations & Per-Account Workspace Backups:**<br>- `pdfs` & `audios`: Scoped binary blobs (`usr_<uid>::<lecId>` and `usr_<uid>::<recId>`), cleaned up locally via `deleteMediaFromDB()` when a lecture/group/subject is deleted.<br>- `annotations` & `annotation_recovery_vault`: Scoped per-lecture annotations (`usr_<uid>::<lecId>`) with per-page stroke deletion tombstones (`_deletedStrokes`) and a `deleteAnnotationsFromDB()` cleanup helper on lecture deletion.<br>- Prefix-bounded `IDBKeyRange.bound("usr_<uid>::", "usr_<uid>::\uffff")` queries in `refreshLocalMediaCache()` and `getAllAnnotationsMapFromDB()`. |
| **2. Browser `localStorage` & Memory** | **Lightweight Metadata Cache & Session State:**<br>- Active working metadata (`pharmaSubjectsV4`, `pharmaScheduleV4`, `pharmaLogsV4`, etc.) cleared on `handleCloudSignOut()` so logged-out reloads remain clean, and updated synchronously inside `mergeAndApplyCloudConflict()`.<br>- Per-account backup `pharmaAccountWorkspace_<uid>` restricted to structured metadata (`subjects`, `schedule`, `logs`, `academy_progress`) without duplicating multi-megabyte IndexedDB `annotations`.<br>- `pharmaTombstones_<uid>` expanded to track `subjects`, `groups`, `lectures`, `events`, `backlog`, and `recordings` with logical revision metadata.<br>- Active Google OAuth access token held in memory (or short-lived `sessionStorage` if reload persistence within a single tab is desired, recognizing that `sessionStorage` is not an XSS barrier). |
| **3. Supabase Auth & PostgreSQL (`public.user_workspaces`)** | **Authoritative Cloud Metadata, Auth & OCC Coordinator:**<br>- Continues using `public.user_workspaces` and `public.sync_workspace_with_concurrency(p_payload, p_expected_revision)`.<br>- **Optional, Measurement-Driven Extension:** Only if representative measurements of the owner's handwriting data show `user_workspaces.annotations` approaching multi-megabyte payloads that degrade sync latency, introduce an optional per-lecture table (`public.lecture_annotations`) while preserving backward compatibility. |
| **4. Google Drive (`Exo_Workspace/<Subject>/<Group>`)** | **Cloud Binary Store for PDFs & All Lecture Audio Recordings (`lec.id` + `lec.recordings[]`):**<br>- Update existing Drive files in-place via `PATCH /upload/drive/v3/files/${driveId}?uploadType=resumable` when replacing lecture media (`forceReplace`).<br>- Persist `driveFolderId` on `sub` and `group` objects to prevent folder splitting on rename.<br>- Sync secondary recordings in `lec.recordings[]` (`rec_*`).<br>- Keep local deletion separate from remote Drive deletion (never auto-trash Drive files without explicit user confirmation).<br>- Scope reduction (`drive.readonly` -> `drive.file`) gated on an explicit owner product decision regarding the Drive privacy scanner and external Drive links (where Google Picker is a proposed future integration option, not an existing feature). |

---

## 11. Proposed Implementation Phases & Dependencies

The roadmap below places **local data integrity and loss prevention first**, before Google Drive enhancements or optional performance/scalability work, and keeps live Supabase inspection/migration strictly separate as an owner-controlled external gate.

### Phase 5.1 — Local Data Integrity, Loss Prevention & Deterministic Conflict Merge (`P1` / `P2` Core Priority)
- **Scope (100% Local Code & Automated Tests — No Live Service Connections):**
  1. **Tier A Workspace State Backup/Restore (`F-09` — Explicit Phase 5.1 Scope):**
     - Upgrade `exportData()` and `importData()` to round-trip **Tier A (Workspace State Backup)**: `subjects`, `schedule` (`events`, `backlog`, `plannerPrefs`, `weeklyReports`, `cloudMediaRegistry`, `_tombstones`), `logs`, `academy_progress`, and verified IndexedDB `annotations` (`pages`, `_extraNotes`, `_audioPins`, `_deletedStrokes`), and explicitly call `markLocalWorkspaceModified(Boolean(data.annotations))` on import.
     - Reconsider and raise the 15 MB import limit (`index.html:19075`) so large annotation backups are not rejected.
     - Explicitly document in UI/reports that Tier A backs up all structured state, study history, and tablet annotations (plus `cloudMediaRegistry` Drive pointers), while binary PDFs and audio blobs remain in IndexedDB/Google Drive (leaving **Tier B Full Media ZIP Archive** with manifest, binary media files, stable IDs, and SHA-256 checksums as a separate archive capability).
  2. **Clock-Skew-Resilient Logical Versioning & Immediate Conflict Merge Schedule Persistence (`F-13`, `F-14`):**
     - Implement a deterministic per-entity logical versioning protocol (e.g., monotonic logical revision `_rev` + `_baseWorkspaceRev` + `_deviceId` tie-breaker, with `_updatedAt` retained only as a display/audit timestamp) across all subject, group, lecture, schedule event, backlog, and weekly report creation/edit handlers.
     - Update `mergeAndApplyCloudConflict()` to resolve concurrent edits, deletion-vs-update conflicts, and legacy unversioned records (`_rev: 0`) deterministically without relying on device wall-clock accuracy, and synchronously persist `pharmaScheduleV4` and `pharmaScheduleBacklogV1` (`saveScheduleData(false)`) inside `mergeAndApplyCloudConflict()`.
  3. **Wire UI Deletions to Versioned Tombstones & Local IndexedDB Cleanup (`F-02`):**
     - Add `groups` and `backlog` categories to `getLocalTombstones()` and `mergeAndApplyCloudConflict()`.
     - Call `recordTombstone()` (recording the deletion's logical revision metadata) in `triggerDeleteSubject`, `triggerDeleteGroup`, `triggerDeleteLecture`, `deleteSessionDirect`, `deleteEventFromPdfAdjuster`, and `deleteBacklogTask`.
     - Call `deleteMediaFromDB('pdfs', ...)`, `deleteMediaFromDB('audios', ...)` (including `lec.recordings[]`), and a new `deleteAnnotationsFromDB(...)` when deleting lectures, groups, or subjects locally—**without** automatically trashing remote Google Drive files.
  4. **Stroke Deletion Tombstones (`F-04`):** Record erased, undone (`Ctrl+Z`), and cleared stroke/text IDs or signatures in per-page `_deletedStrokes` so `mergeAndApplyCloudConflict()` never resurrects erased annotations.
  5. **Dirty-Login / Dirty-Pull Protection & New-Account `academy_progress` Fix (`F-03`, `F-15`):**
     - In `syncWorkspaceOnLogin()` and `pullWorkspaceFromCloud()`, if `!isSwitchingDifferentUser` and local state is dirty (`pharmaWorkspaceDirty === '1'` or `dirtyAnnotationsForCloud === true`), merge the remote row with local state via the hardened `mergeAndApplyCloudConflict()` and push the unified result rather than overwriting local edits with `applyCloudWorkspacePayload()`.
     - Preserve `academy_progress: completedAcademyModules` in the brand-new account branch of `syncWorkspaceOnLogin()` (`index.html:30203`).
  6. **Sign-Out `localStorage` Hygiene & Vault Decoupling (`F-12`, `F-05`):**
     - Clear unscoped working keys (`pharmaSubjectsV4`, `pharmaScheduleV4`, `pharmaScheduleBacklogV1`, `pharmaWeeklyReportsV1`, `pharmaLogsV4`, `pharmaAcademyProgressV1`, `pharmaCloudMediaRegistryV1`) on `handleCloudSignOut()` so reloading while logged out never leaks the previous user's data.
     - Stop duplicating full IndexedDB `annotations` inside `localStorage['pharmaAccountWorkspace_<uid>']` during `pushWorkspaceToCloud()` and `handleCloudSignOut()` (relying on the already-scoped IndexedDB `annotations` store for local annotation durability).

### Phase 5.2 — Google Drive Reliability, Multi-Recording Sync & Studio UX (`P1`/`P2` Priority)
- **Scope:**
  1. **In-Place File Replacement (`PATCH`) & Folder ID Persistence (`F-08`):**
     - Honor `queueMeta.forceReplace` (and existing `cloudPdfDriveId`/`cloudAudioDriveId`) by using `PATCH /upload/drive/v3/files/${driveId}?uploadType=resumable` to update replaced files in place without creating duplicates.
     - Persist `driveFolderId` on `sub` and `group` objects and cache active resumable `uploadUrl` sessions in `sessionStorage` for byte-range recovery.
  2. **Secondary Audio Recordings (`lec.recordings[]`) Cloud Sync (`F-07`):**
     - Extend upload and download pipelines to sync all `rec_*` recordings in `lec.recordings[]`.
  3. **Token Storage, `401` Recovery & Studio Re-Auth Prompt (`F-06`, `F-10`):**
     - Remove raw `exo_gdrive_token` persistence from long-lived `localStorage`.
     - Ensure `401` responses across Drive operations trigger token cleanup and interactive re-auth when initiated by a user action, and add an explicit one-click "Activate Google Drive to Enable Ink & Studio Tools" banner when `openLectureDocument()` falls back to the `/preview` iframe.
  4. **Product Decision Gate on OAuth Scope (`F-06`):**
     - If the owner chooses in a future step to drop `drive.readonly` in favor of `drive.file` only, scope `auditAndManageGoogleDrivePermissions()` to `Exo_Workspace` files and handle external non-Exo Drive links via a proposed future Google Picker integration (`google.picker` / `PickerBuilder`, not currently implemented) or `/preview`.
  5. **Optional Tier B Full Media Archive (`.exo.zip` with Manifest & Checksums, `F-09`):**
     - If the owner desires a standalone local archive containing binary PDFs and audio blobs alongside Tier A Workspace State JSON, implement streaming ZIP export/import with `manifest.json`, stable IDs, and SHA-256 checksums without the 15 MB `FileReader.readAsText` restriction.

### Phase 5.3 — IndexedDB Prefix Range Queries & RAM Cache Byte Budget (`P3` Optimization)
- **Scope:**
  1. Replace unindexed `store.getAll()` in `refreshLocalMediaCache()` and `getAllAnnotationsMapFromDB()` with prefix-bounded `IDBKeyRange.bound(activePrefix, activePrefix + '\uffff')` queries (`F-11`).
  2. Enforce true LRU order, the 20-entry cap on `getMediaFromDB()` read insertions, and a byte-size budget on `sessionMediaBlobRamCache` (`F-11`).
  3. Remove the unused `clearAllIndexedDBStores()` helper (`index.html:19672`).

### Optional Gate — Owner-Controlled Supabase Schema Verification & Measurement-Driven Annotation Partitioning (`F-01`, `F-05`)
- **Owner-Side Database Verification (`F-01`):** Whenever the owner wishes to verify or update the live Supabase project (`dszjmgzzqpdrdjkycvht`), the owner can export any existing rows in `public.user_workspaces` and apply the repository's verified schema (`supabase/schema.sql` / migrations `20261103133622`–`20261103160000`).
- **Optional Per-Lecture Annotation Table (`F-05`):** Only if representative measurements of the owner's actual `annotations` JSONB payload show multi-megabyte rows causing noticeable cloud push latency after Phase 5.1's `localStorage` decoupling, design an optional forward migration for per-lecture annotation storage.

---

## 12. Data-Preservation & Rollback Strategy

1. **Tier A Workspace State Backup First (Phase 5.1 Step 1):**
   - Upgrading `exportData()` / `importData()` to produce a complete **Tier A Workspace State Backup** (all structured metadata, schedule, weekly reports, planner preferences, logs, academy progress, `cloudMediaRegistry` pointers, tombstones, and verified IndexedDB `annotations`, with an updated size limit) is the very first implementation step in Phase 5.1. Binary PDFs and audio blobs remain preserved in IndexedDB (`WorkspaceMediaStore`) and Google Drive (or in a Tier B Full Media ZIP Archive when exported).
2. **Non-Destructive Local vs. Remote Deletion Separation:**
   - Local UI deletions will clean up local IndexedDB stores (`pdfs`, `audios`, `annotations`) and record sync tombstones, but will **never** automatically delete or trash files in the user's Google Drive (`Exo_Workspace`) unless the user explicitly invokes a dedicated cloud-file deletion action.
3. **Backward-Compatible IndexedDB & `localStorage` Schemas:**
   - Existing `WorkspaceMediaStore` v4 object stores (`pdfs`, `audios`, `annotations`, `annotation_recovery_vault`) and dual-ownership keys (`usr_<uid>::<rawId>`) remain 100% compatible without destructive store recreation.
4. **Git Recovery Baselines:**
   - Branch `backup/pre-gemini-security-2026-11-04` (`348d5d6dc2ebe2ce8d67a394671fa99320199975`), reference branch `Deploying`, and verified `main` commit `c211d034eb074c43f74eee480b8186e58868dc80` remain untouched.

---

## 13. Required Acceptance Criteria (For Subsequent Implementation Phases)

1. **Tier A Workspace State Backup Round-Trip & Honest Media Boundary (`F-09`):**
   - In Phase 5.1, `exportData()` -> `importData()` round-trips the complete **Tier A Workspace State Backup** (`subjects`, `schedule` including `events`, `backlog`, `plannerPrefs`, `weeklyReports`, `cloudMediaRegistry`, `_tombstones`, `logs`, `completedAcademyModules`, and all per-lecture IndexedDB `annotations`), supports annotation payloads exceeding the legacy 15 MB cap, marks the workspace dirty for cloud sync, and clearly distinguishes Tier A (Workspace State JSON) from Tier B (Full Media Archive with binary PDF/audio files, manifest, and SHA-256 checksums).
2. **Offline Dirty-State Preservation on Login/Pull (`F-03`, `F-15`):**
   - When `pharmaWorkspaceDirty === '1'` or `dirtyAnnotationsForCloud === true` for the active user, `syncWorkspaceOnLogin()` and `pullWorkspaceFromCloud()` preserve local offline edits alongside remote changes without wiping `completedAcademyModules` on new accounts.
3. **Clock-Skew-Resilient Conflict Merge & Immediate Global Schedule Persistence (`F-13`, `F-14`):**
   - Modifying any subject, group, lecture, schedule event, backlog task, or weekly report advances its deterministic logical version metadata (`_rev`, `_baseWorkspaceRev`, `_deviceId`), and `mergeAndApplyCloudConflict()` produces identical, deterministic merge outcomes under simulated device clock skew (e.g., local clock $\pm 1\text{ hour}$ vs. remote clock), concurrent updates to the same entity, deletion-versus-update conflicts, and legacy unversioned records (`_rev: 0`), while synchronously persisting both `localStorage['pharmaScheduleV4']` and `localStorage['pharmaScheduleBacklogV1']` without waiting for the `1,200ms` post-merge timer.
4. **End-to-End Deletion Tombstone & Local IndexedDB Cleanup Proof (`F-02`):**
   - Deleting a subject, group, lecture, schedule event, or backlog task records a versioned tombstone in `pharmaTombstones_<uid>`, removes associated `pdfs`, `audios` (including `lec.recordings[]`), and `annotations` from local IndexedDB, prevents resurrection during `mergeAndApplyCloudConflict()`, and leaves remote Google Drive files untouched unless explicitly requested.
5. **Stroke Erasure & Undo Persistence Across Conflict Merges (`F-04`):**
   - Erasing a stroke (`eraseAtPoint`), undoing a stroke (`undoLastStroke`), or clearing a page (`clearCurrentPageAnnotations`) on Device A and running `mergeAndApplyCloudConflict()` against a remote payload that still contains that stroke does not resurrect the erased stroke.
6. **Sign-Out Reload Privacy Isolation (`F-12`):**
   - After `handleCloudSignOut()`, reloading the page while logged out results in empty `subjects`, `scheduleEvents`, `scheduleBacklog`, `weeklyReports`, `logs`, and `completedAcademyModules` in the logged-out UI while preserving the user's scoped IndexedDB records and per-account vault for future login.
7. **Google Drive Deduplication & Multi-Recording Sync (`F-07`, `F-08`):**
   - Replacing a lecture's PDF or audio updates (`PATCH`) the existing Google Drive file ID rather than creating a duplicate file, and secondary recordings in `lec.recordings[]` (`rec_*`) upload and download across devices.
8. **Full Verification Suite Pass (`335/335` Existing + New Regression Tests):**
   - All 5 tiers in `npm test` pass with zero failures.

---

## 14. Existing & Missing Test Coverage

### 14.1 Verified Existing Test Coverage on Base SHA `c211d034eb074c43f74eee480b8186e58868dc80` (`335/335` Total)

Per GitHub Actions Run `41857800822` on commit `c211d034eb074c43f74eee480b8186e58868dc80`, the 5 verification tiers execute the following exact assertion counts:

| Verification Tier | Suite File(s) | Verified Assertions | What It Currently Verifies |
| :--- | :--- | :---: | :--- |
| **1. Static & Cryptographic Checks** (`npm run test:static`) | `run_verification_tests.js` | **`54/54`** | Extracts `deriveSecurePBKDF2Hash` & `verifyAndUpgradePassword` from `index.html`; verifies 100k-iteration Web Crypto PBKDF2-HMAC-SHA256 against reference vectors, legacy SHA-256/Base64 auto-upgrade, and static security invariants across `index.html` and SQL migrations. |
| **2. Unit & Async Logic Isolation** (`npm run test:unit`) | `run_comprehensive_verification.js` (`29`)<br>`test_phase3_cross_account_isolation.js` (`38`)<br>`test_phase4_regressions.js` (`35`) | **`102/102`** | Verifies scoped-key helpers (`toScopedKey`, `resolveAuthorizedScopedKey`, `hasStrictDualRecordOwnership`, `hasVerifiedLegacyProvenance`), account operation context epochs (`createAccountOperationContext`), `getAllAnnotationsMapFromDB` / `restoreAllAnnotationsMapToDB` contracts, `computeStrokeUniqueSignature`, and mock OCC conflict helpers. |
| **3. Embedded PostgreSQL (PGlite WASM)** (`npm run test:pglite`) | `test_phase4_2_postgres_integration.js` | **`41/41`** | Executes `schema.sql` and migrations in PGlite; verifies RLS policies, function privileges, `ALTER DEFAULT PRIVILEGES`, `sync_workspace_with_concurrency` OCC behavior, VIP column protection trigger, and safe rollback SQL. |
| **4. Real PostgreSQL 16 Server & Concurrency** (`npm run test:pg16`) | `test_phase4_2_1_pg16_concurrency.js` | **`96/96`** | Verifies disposable cluster isolation (6 regression checks), executes Path A (`schema.sql`) and Path B (incremental migrations), verifies 10-dimension catalog/ACL/RLS/trigger/function parity, multi-connection barrier concurrency (`Promise.all` across two `pg.Client` connections), and negative security boundaries. |
| **5. Real Headless Chromium + IndexedDB E2E** (`npm run test:e2e`) | `test_phase4_1_chromium_e2e.js` | **`42/42`** | Runs `index.html` served by `server.js` in headless Chromium (Scenarios A–N): verifies `WorkspaceMediaStore` v4 creation, two-phase `annotation_recovery_vault` commit/abort, account switching mid-sync, legacy record quarantine, foreign key rejection, failed DB read blocking cloud push, failed flush aborting logout, and additive stroke geometry merge. |
| **Total (`npm test`)** | `run_all_tests.js` (All 7 suite files across 5 tiers) | **`335/335`** | Full repository verification suite on commit `c211d034eb074c43f74eee480b8186e58868dc80`. |

### 14.2 Missing Test Coverage (Gaps That Allowed `F-02`–`F-15` to Escape)
1. **UI Deletion -> Tombstone & Local IndexedDB Cleanup E2E Test (`F-02`):**
   - Existing unit tests in `run_comprehensive_verification.js` pass a synthetic tombstone map into an isolated helper rather than invoking `triggerDeleteSubject()`, `triggerDeleteGroup()`, `triggerDeleteLecture()`, `deleteSessionDirect()`, or `deleteBacklogTask()` in `index.html`.
2. **Offline Dirty Edit Followed by Online `syncWorkspaceOnLogin()` / `pullWorkspaceFromCloud()` E2E Test (`F-03`, `F-15`):**
   - No test simulates local edits with `pharmaWorkspaceDirty === '1'` followed by login/pull when an older remote row exists, nor tests `completedAcademyModules` preservation on initial new-account login.
3. **Stroke Erasure / Undo Conflict Merge Test (`F-04`):**
   - Scenario N in `test_phase4_1_chromium_e2e.js` tests merging two newly added strokes, but no test verifies that `eraseAtPoint()`, `undoLastStroke()`, or `clearCurrentPageAnnotations()` prevents erased strokes from resurrecting during `mergeAndApplyCloudConflict()`.
4. **Post-Merge Immediate Global `pharmaScheduleV4` Persistence & Clock-Skew-Safe Logical Versioning Test (`F-13`, `F-14`):**
   - No test verifies that `localStorage['pharmaScheduleV4']` and `localStorage['pharmaScheduleBacklogV1']` are updated synchronously inside `mergeAndApplyCloudConflict()` (before the `1,200ms` post-merge timer), or tests conflict resolution under clock skew, concurrent updates, delete-vs-update, and legacy unversioned items.
5. **Sign-Out Followed by Page Reload E2E Test (`F-12`):**
   - No Chromium E2E test reloads `index.html` after `handleCloudSignOut()` to assert that `subjects`, `scheduleEvents`, and `logs` remain empty while logged out.
6. **Google Drive Mock XHR / Fetch & Multi-Recording Sync E2E Test (`F-06`, `F-07`, `F-08`, `F-10`):**
   - Zero automated tests intercept `googleapis.com/drive/v3` and `googleapis.com/upload/drive/v3` to verify `uploadMediaToCloudAccount` (`forceReplace`), `downloadMediaFromCloudAccount` (`401` retry), or `lec.recordings[]` (`rec_*`) cloud sync.
7. **Tier A Workspace State Backup (`exportData()` / `importData()`) Round-Trip Test (`F-09`):**
   - No test verifies backup export and import across annotations, weekly reports, planner preferences, and academy progress, or tests payloads larger than the 15 MB threshold.

---

## 15. Exact Source-Code References (Verified Against `index.html`, 32,324 Logical Lines; 32,323 Newline Delimiters; No Final Newline)

| Component / Finding | File Path | Function / Symbol Name | Verified Line Numbers |
| :--- | :--- | :--- | :--- |
| Google OAuth2 Web Client ID constant | `/index.html` | `GOOGLE_CLIENT_ID` | `11111–11112` |
| PBKDF2-HMAC-SHA256 password hashing & upgrade | `/index.html` | `deriveSecurePBKDF2Hash`, `verifyAndUpgradePassword` | `11150–11224` |
| Boot initialization of `subjects`, `logs`, `scheduleBacklog` | `/index.html` | Top-level state declarations | `11256–11263` |
| Save subjects & trigger 4s cloud auto-save (no `_updatedAt`) | `/index.html` | `saveSubjects()` | `11377` |
| UI Delete Subject (missing `recordTombstone` & IDB cleanup) | `/index.html` | `triggerDeleteSubject(id, event)` | `11844–11849` |
| Continuous subject log deletion | `/index.html` | `deleteContinuousSubjectWirdLog(subId, logId)` | `12413–12420` |
| UI Add / Edit / Delete Group (missing `recordTombstone` & IDB cleanup) | `/index.html` | `triggerAddGroup`, `triggerEditGroup`, `triggerDeleteGroup` | `12446–12472` |
| UI Add / Edit / Delete Lecture (`forceReplace: true` at `12575`) | `/index.html` | `triggerAddLecture`, `triggerEditLecture`, `triggerDeleteLecture` | `12474–12594` |
| Boot initialization of schedule (`pharmaScheduleV4`) | `/index.html` | `initScheduleData()` | `13042–13091` |
| Save schedule, backlog, plannerPrefs, weeklyReports | `/index.html` | `saveScheduleData(syncToCloud = true)` | `13093–13107` |
| UI Delete Schedule Session (missing `recordTombstone`) | `/index.html` | `deleteSessionFromModal`, `deleteSessionDirect` | `15602–15617` |
| UI Delete Backlog Goal (missing `recordTombstone`) | `/index.html` | `deleteBacklogTask(taskId)` | `15867–15873` |
| Save study logs | `/index.html` | `saveLogs()` | `15902` |
| UI Delete Schedule Event from PDF Adjuster (missing `recordTombstone`) | `/index.html` | `deleteEventFromPdfAdjuster(eventId)` | `17794–17801` |
| Manual JSON Export & Import (`15MB` check at `19075`, `saveScheduleData` at `19101`) | `/index.html` | `exportData()`, `importData(event)` | `19051–19118` |
| Ebbinghaus spaced repetition & lecture completion | `/index.html` | `refreshLectureSpacedRepetition`, `toggleLectureCompleted` | `19180–19233` |
| Local media cache Set declaration | `/index.html` | `localMediaCache` | `19288` |
| Account operation context & session generation epoch | `/index.html` | `bumpAccountSessionGeneration`, `getCanonicalUserId`, `createAccountOperationContext`, `resolveAccountOperationContext` | `19326–19402` |
| Per-account `localStorage` backup key helper | `/index.html` | `getAccountBackupStorageKey` | `19404–19407` |
| Scoped key & dual-ownership validators | `/index.html` | `extractUserIdFromScopedKey`, `extractRawIdFromScopedKey`, `toScopedKey`, `resolveAuthorizedScopedKey`, `hasStrictDualRecordOwnership`, `hasVerifiedLegacyProvenance` | `19409–19511` |
| Legacy unscoped record migration with provenance check | `/index.html` | `claimAndMigrateLegacyRecords` | `19525–19623` |
| Local media cache scan (`tx.objectStore(...).getAll()`) | `/index.html` | `refreshLocalMediaCache` | `19625–19670` |
| Unscoped IndexedDB store wipe helper (unused) | `/index.html` | `clearAllIndexedDBStores` | `19672–19691` |
| RAM Blob cache declaration (`pdfs` & `audios` Maps) | `/index.html` | `sessionMediaBlobRamCache` | `19694` |
| IndexedDB v4 initialization (`WorkspaceMediaStore`) | `/index.html` | `initPdfDB` | `19696–19779` |
| Write-ahead vault & legacy `sessionStorage` crash recovery | `/index.html` | `recoverUncommittedAnnotations` | `19781–19897` |
| PDF magic-byte validator (`%PDF-`) | `/index.html` | `isValidPdfBlob` | `19900–19909` |
| IndexedDB media delete / save (20-item FIFO cap at `20030`) / get | `/index.html` | `deleteMediaFromDB`, `saveMediaToDB`, `getMediaFromDB` | `19913–20133` |
| Two-phase annotation flush (`annotation_recovery_vault` -> `annotations`) | `/index.html` | `flushPendingAnnotationsSave` | `20205–20347` |
| Annotation normalization & stroke point compaction | `/index.html` | `normalizeAndRecoverLectureAnnotations` | `20357–20436` |
| Idle 350ms debounced annotation save & scoped DB reader | `/index.html` | `saveAnnotationsToDB`, `getAnnotationsFromDB` | `20438–20556` |
| Open lecture PDF/audio & Drive `/preview` iframe fallback (`21398`) | `/index.html` | `openLectureDocument` | `21251–21426` |
| Secondary lecture audio recordings (`lec.recordings[]`, `rec_*`) | `/index.html` | `renderLectureRecordingsSelector`, `addRecordingToCurrentLecture`, `switchLectureRecording` | `21467–21566` |
| Eraser, stroke undo (`Ctrl+Z`), and page clear handlers | `/index.html` | `eraseAtPoint`, `undoLastStroke`, `clearCurrentPageAnnotations` | `24611–24714` |
| Close PDF viewer & immediate cloud annotation flush | `/index.html` | `closePdfViewer` | `25537–25580` |
| Interactive Academy progress boot initialization | `/index.html` | `completedAcademyModules` | `25586` |
| Supabase URL, Anon Key & client initialization | `/index.html` | `SUPABASE_PROJECT_URL`, `SUPABASE_ANON_PUBLIC_KEY`, `initSupabaseCloudEngine` | `26134–26183` |
| Auth session transition & pending annotation isolation | `/index.html` | `handleAuthSessionChange` | `26221–26332` |
| Cloud media fingerprint registry & healing | `/index.html` | `recordUploadedMediaInRegistry`, `findMediaInCloudRegistry`, `healSubjectsFromCloudRegistry`, `reconcileCloudMediaWithStorageBucket` | `26334–26494` |
| VIP config constants & server status check | `/index.html` | `VIP_MEDIA_LIMITS_CONFIG`, `verifyVipStatusFromServer` | `26792–26815` |
| Google Drive explicit sharing & privacy scanner (`drive.readonly`) | `/index.html` | `shareGoogleDriveFileExplicitly`, `revokeGoogleDriveFileSharing`, `auditAndManageGoogleDrivePermissions` | `27227–27385` |
| Cloud file size check (returns `allowed: true, maxMB: 9999`) | `/index.html` | `validateFileCloudSizeLimit` | `27440–27447` |
| Google Drive OAuth2 GIS token client, `ensureGoogleAccessToken`, silent connect | `/index.html` | `isGoogleDriveTokenActive`, `ensureGoogleAccessToken`, `trySilentGoogleDriveConnection`, `connectGoogleDriveAccount`, `disconnectGoogleDriveAccount` | `27450–27696` |
| Google Drive user info & folder resolution (`Exo_Workspace/<Sub>/<Group>`) | `/index.html` | `fetchGoogleDriveUserInfo`, `ensureSubfolderInGoogleDrive`, `ensureExoGoogleDriveFolder` | `27698–27842` |
| Google Drive XHR resumable upload (`401` retry at `27998`) | `/index.html` | `uploadBlobToGoogleDriveViaXHR` | `27972–28094` |
| Cloud media upload & download orchestrators (`401` retry at `28395`) | `/index.html` | `uploadMediaToCloudAccount`, `downloadMediaFromCloudAccount` | `28181–28513` |
| Single & bulk media upload/download queues (only `lec.id` audio) | `/index.html` | `uploadSingleLectureMediaToCloud`, `uploadCurrentViewingLectureMediaToCloud`, `syncAllLocalMediaToCloud`, `downloadAllCloudMediaToLocal` | `28515–28836` |
| Cloud/local email authentication & sign-out (`localStorage` keys left at `29104`) | `/index.html` | `handleCloudEmailAuth`, `handleCloudSignOut` | `28851–29128` |
| Bulk account-scoped annotation reader (`store.getAll()` at `29166`) & writer | `/index.html` | `getAllAnnotationsMapFromDB`, `restoreAllAnnotationsMapToDB` | `29131–29393` |
| Deletion tombstones, stroke signature & conflict merge (`1,200ms` push at `29645`) | `/index.html` | `getLocalTombstones`, `recordTombstone`, `computeStrokeUniqueSignature`, `mergeAndApplyCloudConflict` | `29402–29652` |
| 4s debounced cloud push (`pharmaAccountWorkspace_<uid>` at `29779–29788`, RPC at `29799`) | `/index.html` | `computeFastStringSignature`, `markLocalWorkspaceModified`, `pushWorkspaceToCloud` | `29658–29932` |
| Cloud payload application, pull, login sync & 100-byte timestamp poll | `/index.html` | `applyCloudWorkspacePayload`, `pullWorkspaceFromCloud`, `syncWorkspaceOnLogin`, `pullWorkspaceFromCloudIfNewer` | `29934–30258` |
| Disabled Realtime WAL subscription & online/visibility listeners | `/index.html` | `setupRealtimeWorkspaceSubscription`, `online`/`offline`/`visibilitychange` listeners | `30260–30294` |

---

## 16. Explicit Unknowns & Assumptions

To strictly separate proven code facts from external deployment unknowns and unmeasured runtime properties:

1. **Exact Live Schema & Data State of Supabase Project `dszjmgzzqpdrdjkycvht` (`Unknown`):**
   - No connection or query was made to the live Supabase project during this audit.
   - Although repository migrations (`20261103133622`–`20261103160000`) have not been formally applied, it is unknown whether `public.user_workspaces`, `revision`, `sync_workspace_with_concurrency`, or RLS policies were manually created in the Supabase Dashboard, or whether live rows currently exist in `public.user_workspaces`.
2. **Volume of Existing Annotations, Blobs & Orphaned Files in the Owner's Active Environment (`Unknown`):**
   - The byte size of `annotations` currently stored in the owner's browser IndexedDB (`WorkspaceMediaStore`), the size of `localStorage['pharmaAccountWorkspace_<uid>']`, and whether orphaned PDF/audio files already exist in the owner's Google Drive `Exo_Workspace` folder cannot be determined from repository source code alone.
3. **Google Cloud Console OAuth Client Configuration (`Unknown`):**
   - The publishing status ("Testing" vs. "In Production") and registered Authorized JavaScript Origins of Google OAuth Client ID `814351723102-oqltucr4nf5pkk68hq8um08ev8040au0.apps.googleusercontent.com` reside in the owner's Google Cloud Console outside this repository.

---

## 17. Complete Report File Inventory

### 17.1 Workspace Parity & Modification Summary
- **Repository:** `JemistryMC/study-hub`
- **Branch:** `main`
- **Verified Base Commit SHA:** `c211d034eb074c43f74eee480b8186e58868dc80`
- **Modified Existing Tracked Files:** `0`
- **Deleted Tracked Files:** `0`
- **Audit Report File Updated:** `1`
  - `/reports/phases/phase-5-storage-sync-audit/gemini-report.md`

### 17.2 Audited Repository Files Inspected
1. `/GEMINI.md`
2. `/README.md`
3. `/reports/CURRENT.md`
4. `/reports/README.md`
5. `/reports/phases/phase-4.2.4.4.1/README.md`
6. `/reports/phases/phase-4.2.4.4.1/gemini-report.md`
7. `/reports/audits/DATABASE_AUDIT_AR.md`
8. `/reports/audits/PHASE_4_1_ENGINEERING_AUDIT.md`
9. `/index.html` (`32,324` logical lines; `32,323` newline delimiters; no final newline)
10. `/server.js`
11. `/sw.js`
12. `/package.json`
13. `/supabase/schema.sql`
14. `/supabase/migrations/20261103133622_remote_schema.sql`
15. `/supabase/migrations/20261103140000_fix_security_and_privileges.sql`
16. `/supabase/migrations/20261103150000_unforgeable_occ_and_role_hardening.sql`
17. `/supabase/migrations/20261103160000_hosted_supabase_auth_compat.sql`
18. `/supabase/rollbacks/20261103140000_safe_rollback_concurrency_only.sql`
19. `/supabase/rollbacks/20261103140000_rollback_fix_security_and_privileges.sql`
20. `/run_all_tests.js`
21. `/run_verification_tests.js`
22. `/run_comprehensive_verification.js`
23. `/test_phase3_cross_account_isolation.js`
24. `/test_phase4_regressions.js`
25. `/test_phase4_2_postgres_integration.js`
26. `/test_phase4_2_1_pg16_concurrency.js`
27. `/test_phase4_1_chromium_e2e.js`
