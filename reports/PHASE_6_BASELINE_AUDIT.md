# EXO — Phase 6 (WP 6.0) Read-Only Baseline Audit & Full UI/UX Implementation Mapping

**Deliverable Scope:** WP 6.0 Read-Only Baseline Audit & Implementation Mapping  
**Repository:** `JemistryMC/study-hub` (`main` branch)  
**Status:** `IMPLEMENTED — READY FOR GATE 6.0 OWNER REVIEW`  
**Scope Compliance:** Zero edits made to `index.html`, CSS, JS, tests, schemas, SQL/migrations, Auth/OAuth/Drive/Sync, build configuration, dependencies, or pre-existing documentation files. Only this report (`/reports/PHASE_6_BASELINE_AUDIT.md`) was created, and gitignored visual baseline captures were stored under `.playwright-cli/`.

---

## 1. Repository, Branch, Commit SHAs & Environment State Discrepancy

| Item | Verified Authoritative Value | Notes / Evidence |
| :--- | :--- | :--- |
| **Authoritative Repository** | `JemistryMC/study-hub` | Checked against GitHub REST API & `git ls-remote` |
| **Active Target Branch** | `main` | `Deploying` and `backup/pre-gemini-security-2026-11-04` untouched |
| **Current GitHub `main` HEAD** | `72b1922feeff42b5a9a40399ca6b0b799590f912` | `docs: define Phase 6 baseline audit deliverable` |
| **Authoritative Source SHA (Last App Code)** | `c74315a4580d68c61da8a0f49ec2b2f5946301e4` | `feat: implement Google Drive reliability and OAuth` |
| **Latest GitHub Actions CI Run (on `c74315a4`)** | CI Run `#51` (`43425435306`, `success`) | Followed by 7 docs-only commits (`e3c7ca37` → `72b1922f`) |
| **Latest GitHub Pages Deployment** | Pages Run `#133` (`43432549596`, `success`) | Verified live deployment of current `main` |
| **Docs-Only Delta (`c74315a4..72b1922f`)** | 7 commits, zero app/test/SQL diffs | Verified via GitHub Compare API: only `README.md`, `GEMINI.md`, `reports/*` changed |

### Local AI Studio Workspace Discrepancy (Documented Before Execution)
1. **No `.git` Metadata Locally:** Running `git status` in `/app/applet` returns `fatal: not a git repository`. Local integrity was verified by comparing SHA-256 checksums and file contents against GitHub `c74315a4` / `72b1922f`.
2. **Application, Test & Build Parity:** All runtime, build, service worker, SQL, and test files in `/app/applet` (`index.html` [47,393 lines, 4,165,394 bytes], `package.json`, `server.js`, `build.js`, `sw.js`, `manifest.json`, `run_all_tests.js`, `run_verification_tests.js`, `run_comprehensive_verification.js`, `test_phase3_cross_account_isolation.js`, `test_phase4_regressions.js`, `test_phase4_1_chromium_e2e.js`, `test_phase4_2_postgres_integration.js`, `test_phase4_2_1_pg16_concurrency.js`, `benchmark_tier_a.js`, `benchmark_chromium_tier_a.js`) match Authoritative Source SHA `c74315a4580d68c61da8a0f49ec2b2f5946301e4` byte-for-byte.
3. **Workspace Docs State:** At the start of WP 6.0, local `README.md`, `GEMINI.md`, `reports/CURRENT.md`, and `reports/README.md` lagged behind GitHub `72b1922f`; the authoritative Phase 6 documents were read from GitHub `main`, and the owner subsequently synchronized `GEMINI.md`, `README.md`, `reports/CURRENT.md`, `reports/README.md`, `reports/EXO_PERSONAL_STUDY_JOURNAL_DESIGN.md`, and `reports/PHASE_6_EXPERIENCE_REDESIGN_PLAN.md` locally in `/app/applet` for Gate 6.0 review. Zero application, test, SQL, build, or dependency files were modified in this audit or reconciliation pass; the local app runtime remains byte-for-byte aligned with Authoritative Source SHA `c74315a4580d68c61da8a0f49ec2b2f5946301e4`.

---

## 2. Worktree & Environment Status

- **Runtime Environment:** Linux `4.19.0-gvisor` (`x64`), `Node.js v22.23.2`, `playwright-cli 0.1.22`, Chromium `v155.0.8059.12` (headless), Express dev server on `http://localhost:3000`.
- **PostgreSQL 16 Local Daemon:** Not installed (`which postgres pg_isready psql` returned none). Embedded PGlite (`@electric-sql/pglite`) runs locally.
- **Files Modified:** **0 existing files modified.**
- **Files Added:**
  - `/reports/PHASE_6_BASELINE_AUDIT.md` (this single WP 6.0 deliverable)
  - `.playwright-cli/*` (gitignored baseline screenshots, DOM snapshots, and console logs captured during inspection; zero tracked binary clutter).
- **Generated Build Artifact:** `dist/` updated by `npm run build` (`build.js` copies 6 static assets); `dist/` is gitignored.

---

## 3. Complete Screen & Component Inventory

### 3.1 Global Application Shell (`index.html` L8308–8438, L10990–11009)
| Component | DOM ID / Selector | Current Implementation & Behavior |
| :--- | :--- | :--- |
| **Desktop Collapsible Sidebar** | `#exoAppSidebar` (`aside.exo-sidebar`) | Fixed right-hand rail in RTL (`255px` expanded, `72px` collapsed via `exo_sidebar_collapsed`); auto-hidden at `<=900px`. Contains brand logo (`L8314` base64 PNG), collapse button (`#sidebarCollapseBtn`), account card (`#cloudNavBtn` -> `#cloudNavAvatar`, `#cloudNavName`, `#cloudNavText`, `#cloudLiveSyncBadge`), 3 primary nav items (`[data-nav="subjects"]`, `[data-nav="schedule"]`, `[data-nav="tracker"]` with `#sidebarBadgeSubjects` & `#sidebarBadgeSchedule`), utility buttons (`#sidebarDriveBtn`, `#appLangToggleBtn`, `#sidebarFullscreenBtn`, `#sidebarHelpBtn`), and bottom clock (`#sidebarClockTime`, `#sidebarClockDate`). |
| **Tablet/Mobile Top Navbar** | `.navbar` (`L8404`) | Hidden on desktop (`>=901px`), visible `<=900px`. Displays brand logo (`L8407` base64 PNG), mobile language button, fullscreen button, `#cloudNavBtn` duplicate/mobile trigger, help button, and top nav tabs (`.nav-links`). |
| **Mobile Bottom Nav** | `.mobile-bottom-nav` (`L10990`) | Fixed bottom bar shown at `<=768px` with 3 tabs: Study Hub (`#subjects`), Planner (`#schedule`), Log & Reports (`#tracker`). |
| **Toast Stack** | `#toastBox` (created/appended dynamically by `showToast()` L11358) | Transient notification toasts (`success` / `error` / info). |

### 3.2 Top-Level Views (`3` `.view-section` Roots Only)
Currently **no dedicated Dashboard (`Today`), Projects, or Flashcards views exist**. Initial load opens directly into `#subjects`.

1. **View 1: Subjects Hub (`#subjects`, `L8440–8531`) — Active on First Load**
   - **Header & Summary Ribbon:** Subject count, total files, completed count, overall % progress bar; search input (`#subjectSearchInput`), sort select (`#subjectSortSelect` — Custom, Highest, Lowest, Most Scheduled, Alphabetical), `+ Add Subject` button (`openSmartSubjectModal()`).
   - **New-User Onboarding Banner:** `#onboardingQuickStartBanner` (`renderNewUserOnboardingHub()` L12667) with 5 1-click preset pills (Pharmacology, Biochemistry, Pharmaceutics, Microbiology & Immunology, Organic Chemistry), Add Custom Subject, Load Demo Data (`tryDemoMode()`), and Complete Guide Tour.
   - **Subjects Grid (`#subjectsGrid`):** Drag-reorderable cards (`subject-card`) with color/icon badge, order pill (`#1`, `#2`), move left/right arrow buttons, edit/delete buttons, group/lecture/scheduled-hours summary, and progress bar.
   - **Nested Subject Details Sub-View (`#subject-details-view`, `L8497–8530`):** Replaces `#subjectsGrid` when `openSubject(id)` runs:
     - Back button (`backToSubjects()`), editable title (`#currentSubjectTitle`), **Exam / Quiz Radar** button (`openSubjectExamRadarModal`), **Merge Lectures & Audio** drawer toggle (`toggleSubjectMergeLecturesDrawer`), `+ New Chapter` button (`triggerAddGroup`).
     - Optional **Exam Radar Banner** (`L13734`) with readiness %, **Exam Cram Mode** launcher (`launchSubjectExamCramMode`), and quick review scheduler.
     - **Divided Subject Mode** (`isSubjectDivided(sub) === true`): Expandable `.group-card` chapter accordions containing numbered, drag-sortable `.lecture-item` rows with completion checkbox, clickable title (`openLectureDocument`), status pills (Local/Cloud PDF, Local/Cloud Audio, Reading Progress `%`, Spaced Repetition badge), Cloud upload/download button, SR refresh button, edit/delete buttons, and mobile `Start Study` CTA.
     - **Continuous / Undivided Subject Mode** (`isSubjectDivided(sub) === false`, e.g., Holy Quran / continuous reading): Continuous bookmark tracker (`saveContinuousSubjectBookmark`), daily Wird log list (`addContinuousSubjectWirdLog`, `deleteContinuousSubjectWirdLog`), quick schedule button (`scheduleSessionForContinuousSubject`).

2. **View 2: Smart Planner (`#schedule`, `L8533–8806`)**
   - Header controls: Subview switcher (`subview-today` [default active], `subview-week`, `subview-tasks` Weekly Goals/Backlog), `+ Add Session`, `Export PDF` (`openShareSchedulePdfModal()`).
   - **Today Subview (`#subview-today`):** 7-day selector strip (`getOrderedWeekDays()`), completion counter pill, view-mode toggles (`Hourly Timeline` vs `Compact Cards`), interactive hour slots with `+ HH:00` quick-add buttons, session cards (time range, duration, type badge, subject badge, completion toggle, edit/delete/wasted-time actions).
   - **Week Grid Subview (`#subview-week`):** Full 7-day horizontal or grouped-by-subject weekly board (`pharmaWeekBoardHorizV1` / `pharmaWeekGroupSubV1`), drag/edit support.
   - **Weekly Goals / Backlog Subview (`#subview-tasks`):** Priority backlog tasks (`#newTaskTitle`, `#newTaskSubject`, priority selector), filter pills, and Goal-to-Session Linker (`openGoalTaskLinkerModal`).
   - **Collapsible Planner Preferences (`L8719–8806`):** Week start day (`weekStartDay`), day start/end hours (`dayStartHour`/`dayEndHour`), auto-complete threshold % (`autoCompletePct`), Manual Week Evaluation & Rollover trigger (`triggerManualWeekEvaluationAndRollover`), Reset Week modal trigger (`#clearScheduleModalOverlay`).

3. **View 3: Log, Compass & Smart Analytics (`#tracker`, `L8808–9086`)**
   - **Smart Compass ("البوصلة الذكية"):** Actionable priority cards (due Spaced Repetition lectures, subjects missing weekly scheduled hours, unlinked backlog goals, upcoming scheduled sessions, absent/wasted recovery prompts).
   - **4 Top KPI Cards:** Study Streak (`calculateStreak`), Effective Study Hours vs Planned, Weekly Goals Achievement, Weekly Commitment Index %.
   - **Loggers & Analytics Panels:** `+ Log Achievement` (`#addLogModalOverlay`), Wasted Time / College Absence quick recovery loggers (`openLogRecoveryLinkerModal`), Subject Mastery breakdown table, Weekly Time Distribution & Day-load breakdown, Weekly Evaluation Archive Hub (`renderWeeklyEvaluationsHub`), plus Backup Export/Import (`exportWorkspaceBackupV4` / `triggerImport`) & Cloud Sync / Google Drive management panels.

### 3.3 Modals, Overlays & Drawers (`17` Modals + Sub-Drawers)
| Modal Overlay ID | Purpose | Key Triggers / Notes |
| :--- | :--- | :--- |
| `#cloudAuthModalOverlay` (`L9090`) | Supabase sign-in/up, profile info, manual Push/Pull, Drive OAuth connect/disconnect/folder & file stats, VIP status badge | `#cloudNavBtn`, `openCloudAuthModal()` |
| `#vipMediaLockModalOverlay` (`L9305`) | VIP Pro plan showcase (Monthly / Full Term), feature list, WhatsApp manual activation CTA | `openVipUpgradeModal()`, `checkVipFeatureAccess()` |
| `#singleInputModalOverlay` (`L9385`) | Generic single-field prompt (Add/Rename Subject or Chapter/Group) | `openSingleInputModal()` |
| `#doubleInputModalOverlay` (`L9402`) | Add/Edit Lecture (`title`, local/URL PDF path, local/URL audio path, device pickers) | `triggerAddLecture()`, `triggerEditLecture()` |
| `#pdfViewerModalOverlay` (`L9448`) | Fullscreen PDF & Audio Studio (see Section 5 for full control matrix) | `openLectureDocument()`, `openMergedSubjectLecturesStudio()` |
| `#pdfQuickJumpModalOverlay` (`L9861`) | Slider & numeric page jump modal inside PDF Studio | Clicking page indicator in Studio header |
| `#helpModalOverlay` (`L9902`) | Interactive 6-pane Academy & Guide (`#acadPane_1..6`) + Demo data loader + `#spotlightTourFloatingCard` | `#sidebarHelpBtn` |
| `#clearScheduleModalOverlay` (`L10343`) | Clear study sessions only vs clear entire schedule (with confirmation/tombstones) | Planner settings |
| `#confirmModalOverlay` (`L10366`) | Destructive action confirmation (`#confirmModalBtn`) | Deletes across subjects/chapters/lectures/sessions |
| `#backupImportPreflightModalOverlay` (`L10384`) | Tier-A JSON backup inspection (counts, diff preview, SHA-256 checksum, Smart Merge vs Full Replace) | `showBackupImportPreflightModal()` |
| `#sessionModalOverlay` (`L10443`) | Create/edit scheduled session (title, 4 task types, subject, multi-lecture linker, day, start time, duration/open-ended, notes, wasted toggle) | `openSessionModal()` |
| `#addLogModalOverlay` (`L10588`) | Log daily achievement / study note (text, optional subject, mood level) | `openAddLogModal()` |
| `#shareSchedulePdfModalOverlay` (`L10620`) | Ultra-HD 300 DPI Weekly Schedule PDF Exporter (Printable Paper vs Digital Dark edition, custom title/subtitle, day selection, live zoom preview, share/download) | `openShareSchedulePdfModal()` |
| `#smartStudyVerifyModalOverlay` (`L10722`) | Prompted when live studio study session finishes against matching planned task | `showSmartStudyVerificationPrompt()` |
| `#goalTaskLinkerModalOverlay` (`L10762`) | Link weekly backlog goals to one or more scheduled tasks | `openGoalTaskLinkerModal()` |
| `#weeklyReportModalOverlay` (`L10796`) | Graded weekly evaluation summary modal | `openWeeklyReportSummaryModal()` |
| `#smartSubjectModalOverlay` (`L10831`) | Create/edit subject with divided vs continuous mode, color swatches, icon picker, optional Exam Radar setup | `openSmartSubjectModal()` |
| `#subjectExamRadarModalOverlay` (`L10920`) | Configure exam title, date, and included lectures for Exam Cram Mode | `openSubjectExamRadarModal()` |
| `#logRecoveryLinkerModalOverlay` (`L10962`) | Link recovery/absent log entry to a scheduled make-up session | `openLogRecoveryLinkerModal()` |

### 3.4 Hidden Compatibility DOM Nodes (`display: none` Must-Audit List)
Code and tests reference hidden legacy nodes kept in `index.html` to avoid breaking JS event listeners or DOM lookups:
- Academy/Legacy Studio compat: `#sb3InkCanvas`, `#sb2CheckBtn`.
- Hidden PDF toolbar/header compat controls: `#pdfFitHeightBtn`, `#pdfNightModeBtn`, `#toolBtn_laserPause`, `#toolBtn_palmReject`, `#pdfToolbarExtraNoteBtn`, `#pdfToolbarExportPdfBtn`, `#pdfDockPosToggleBtn`, `#audioAttachBtn`, `#mergedAudioBarPickerWrap`, `#pdfMoreMenuRecordAudioBtn` / secondary menu duplicates.
- Hidden Form/Planner compat controls: `#newSubjectName`, `#smartSubjectPresetsBox`, `#pdfScheduleScopeSelect`, `#weekStudyHours`.

---

## 4. Existing-to-Target Design Mapping (`EXO_PERSONAL_STUDY_JOURNAL_DESIGN.md`)

| Dimension | Current Baseline (`index.html`) | Target Design Contract | Migration Notes / Preservation Rules |
| :--- | :--- | :--- | :--- |
| **Theme & Palette** | Deep navy `#090d16` / `#0f1624` / `#131c2e`, glowing teal `#2dd4bf`, `--terracotta` wrongly set to sky `#0284c7`, harsh drop shadows | **Dark Personal Study Journal** (Refined Journal primary, restrained Expressive Journal details):<br>• `Ink Black`: `#191B1D` (Main dark background)<br>• `Charcoal`: `#292B2D` (Dark surfaces & panels)<br>• `Warm Paper`: `#F0E6D4` (Light reading surfaces & selected cards)<br>• `Sage Green`: `#899982` (**Primary brand accent**)<br>• `Muted Blue`: `#7898AC` (Supporting accent)<br>• `Terracotta`: `#C47D60` (Supporting accent)<br>• `Warm Gold`: `#D7B96F` (Supporting accent/highlights) | Keep semantic token names in `:root` updated cleanly; define dedicated semantic tokens (success, warning, error, info, disabled, focus, selection); never rely on color alone; verify >=4.5:1 contrast on both Ink/Charcoal and Warm Paper. |
| **Typography** | Loads 12 Google Fonts (`Cairo`, `Tajawal`, `Outfit`, `Plus Jakarta Sans`, `IBM Plex Sans Arabic`, etc.); applies broad font rules globally | All 4 approved families:<br>• **English UI:** `Manrope`<br>• **Arabic UI:** `IBM Plex Sans Arabic`<br>• **English Editorial:** `Lora`<br>• **Arabic Editorial:** `Noto Naskh Arabic`<br>• **Handwritten styles:** Rare decorative accents only | Editorial serif fonts are accents (book/chapter headings), never dense body text or controls; handwritten styles must never carry essential instructions, statuses, or numbers; test Arabic shaping, mixed scripts, numerals, and offline/PWA font fallbacks. |
| **Surface & Badge Discipline** | Heavy `.studio-pill` chips everywhere (`#1`, `#2`, counts, SR tags, file tags, hour slots, day tabs), glowing gradients | **Calm tactile surfaces**: remove excessive decorative pill styling while retaining useful and readable functional status badges; hairline borders, soft natural shadows, restrained paper layering | Do **not** apply a literal "zero pills" ban where concise functional status badges aid scanability; strictly avoid gaming/Deadlock/neon/cyberpunk/excessive grunge clutter. |
| **Brand Assets & Bloat** | 4 inline ~260 KB base64 PNG logos (`L14, L15, L8314, L8407` ≈ 1.06 MB of HTML); triggers `ERR_INVALID_URL` in Chromium | **Conditionally Approved (WP 6.1):** Verify existing assets (`favicon.png`, `icon-192.png`, `icon-512.png`, `build.js`, `manifest.json`, `sw.js`) and GitHub Pages `./` base paths first; reuse valid assets / crisp SVG cleanly | Must preserve dimensions, loading, PWA/offline caching (`sw.js`), and visual identity; do not swap unverified paths; record before/after HTML size and console-error comparison. |
| **Top-Level Navigation** | Only 3 `.view-section` pages (`#subjects` default, `#schedule`, `#tracker`); no Home/Dashboard; no Projects or Flashcards; dual desktop sidebar + `.navbar` + `.mobile-bottom-nav` | **Approved Hybrid Navigation:** Daily-Focus **Today / Dashboard** landing view (WP 6.1) + **Digital Bookshelf / Subjects & Table of Contents** (WP 6.2) + **Unified Chapter Workspace** with integrated **PDF Studio** (WP 6.3) + **Planner / Analytics / Remaining Existing Screens** (WP 6.5) | Preserve `#subjects`, `#schedule`, `#tracker`, `switchView()`, and all E2E selectors/hooks compatibly. **Do NOT create standalone Projects or Flashcards modules** by assumption (none exist today; separate approval required if ever desired). |
| **Default Language** | `detectDefaultExoLanguage()` checks browser `navigator.languages` and falls back to `'ar'` for Arabic locales | **Approved:** **English (`'en'`) as first-run default only when no saved preference exists** (`exoAppLang`); preserve user choice without overwriting Arabic preference | Replace regex/MutationObserver corruption (`"AM 2/10"`) with structured bilingual translation; protect dynamic content, canvas labels, filenames, URLs, mixed scripts, user text, dates, and technical values. |

---

## 5. PDF & Audio Studio — Feature-by-Feature Preservation Matrix

Every capability below is verified in `exo-mod-pdf-audio-studio` (`L23816–31918`) and HTML (`L9448–9880`) and **MUST be preserved 100%** during Phase 6 redesign:

| Group | Control / Feature | DOM ID / Trigger | Current Function / Behavior |
| :--- | :--- | :--- | :--- |
| **Header Left (Actions)** | Close Studio | `#pdfCloseBtn` (`closePdfViewer()`) | Flushes pending annotations, stops audio/tracking, triggers smart-study verify if linked, closes in `<50ms` (`Test GG.3`); `Escape` bound |
| | More Options Dropdown | `#pdfMoreMenuBtn`, `#pdfMoreDropdownMenu` | Contains Theme (`togglePdfNightMode`), Thumbnails (`togglePdfThumbnailsDrawer`), Bookmark (`toggleBookmarkCurrentSlide`), Extra Note (`toggleExtraNoteForPage`), Blank Page (`addBlankNotePageToLecture`), Download PDF (`downloadCurrentViewingPdfToDisk`), Export Annotated PDF (`exportAnnotatedSlides`), Upload/Sync Drive (`uploadCurrentViewingLectureMediaToCloud`), Attach Audio (`triggerPickAudioForCurrent`), Open External Tab (`#pdfOpenInTabBtn`), Fullscreen (`togglePdfFullscreen`), Clear Page Annotations (`clearCurrentPageAnnotations`) |
| | Annotation Dock Toggle | `#pdfDockToggleBtn` | Collapses/expands right vertical floating tool dock (`dock-collapsed` + `#pdfMobileDockFloatingTriggerBtn` restore FAB) |
| | Audio Bar Toggle | `#pdfAudioToggleBtn` | Toggles `#pdfAudioPlayerBar` bottom dock (`active-audio-dock`) |
| | Thumbnails & Bookmark | `#pdfThumbnailsBtn`, `#pdfBookmarkSlideBtn` | Quick access to thumbnail sidebar & slide bookmark toggle |
| **Header Center (Nav/Zoom)** | Page Stepper & Quick Jump | Prev/Next buttons, `#pdfPageCounterBtn` | Steps page (`stepPdfPage(±1)`), opens `#pdfQuickJumpModalOverlay` slider/input |
| | Zoom & Fit Controls | `#pdfZoomInBtn`, `#pdfZoomOutBtn`, `#pdfZoomLabelBtn`, `#pdfFitWidthBtn` | `changePdfZoom(±0.15)`, `setPdfFitMode('width'|'height')` (`pharmaPdfFitMode`), preserves active scroll page on zoom |
| | Fullscreen | `#pdfFullscreenBtn` | Exactly 32px icon-only button (`togglePdfFullscreen()`) |
| **Header Right (Title/State)** | Title, Sync Badge & Auto-Save | `#pdfViewerTitle`, `#pdfAutoSaveStatus` | Displays active lecture title and silent local save feedback (`تم الحفظ ✓`) |
| **Context Banners & Bars** | Drive Reactivate Banner | `#pdfDriveReactivateBanner`, `#pdfDriveReactivateMsg`, `#pdfDriveReactivateBtn` | Shown when viewing Drive `/preview` iframe (`P5.2-R7` / `Test JJ.5`); downloads blob to IDB, renders PDF.js preserving page/zoom/annotations |
| | Merged Multi-Lecture Bar | `#pdfMergedLecturesBar`, `#mergedLectureAddSelect`, `#mergedContinuousModeBtn` | Combines multiple lectures in one continuous stream (`openMergedSubjectLecturesStudio`) or Exam Cram Mode |
| **Floating Vertical Dock** | Tool Selection | `#pdfAnnotationToolbar`: Pan (`pan`), Pen (`pen`), Highlighter (`highlighter`), Eraser (`eraser`), Text Box (`text`), Laser (`laser`) | Default `'pan'` on open to prevent accidental touch scribbles; supports stylus/mouse/touch |
| | Color & Stroke Flyout | `#pdfPenOptionsBtn`, `#pdfActiveColorDot`, `#pdfPenOptionsFlyout` | Color swatches, stroke width slider, opacity; closes cleanly on tool/canvas interaction |
| | Canvas Utilities | Undo (`undoLastAnnotation()`), Visibility Toggle (`toggleAnnotationsVisibility()`), Collapse (`togglePdfDock()`) | Zero-reflow cached `getBoundingClientRect()` (`L29538`) for stylus latency; Palm Rejection (`pharmaPalmRejectV1`) |
| **Thumbnails Drawer** | Slide Thumbnails & Page Ops | `#pdfThumbnailsDrawer` | Renders miniature previews; hide/exclude slide (`deleteOrHidePageFromLecture`), restore (`restoreDeletedPage`), add blank grid note page (`addBlankNotePageToLecture`) |
| **Canvas Stack & Extra Notes** | Render + Ink + Laser + Text Layers | `#pdfPagesScrollContainer`, `#pdfInkCanvas_{p}`, `#pdfLaserCanvas_{p}`, `#pdfTextLayer_{p}` | Normalized `[0..1]` stroke coordinates invariant to zoom/DPR; floating textarea editor (`commitOrCloseFloatingTextEditor`) |
| | Extra Note Sheet per Slide | `#pdfExtraNoteWrapper_{p}`, `toggleExtraNoteForPage(p)` | Independent ruled sheet below slide (`note_${p}`) with its own ink/laser/text canvas; **Free for all users** (`syncExtraNoteButtonsLockUI` keeps unlocked) |
| | Direct PDF Binary Export | `exportAnnotatedSlides()` | Flattens slides + ink + text + Extra Note Sheets into downloadable PDF; **Free for all users** (`L31680`) |
| **Audio Player Bar** | Playback, Boost, Pins & Multi-Rec | `#pdfAudioPlayerBar`, `#lectureAudioElement` | Play/Pause, `-5s` / `+5s` seek, range scrubber, playback speed cycle, **300% WebAudio Volume Booster** (`ensureAudioBoostGraph`), **Audio Timestamp Pins** (`_audioPins` per page linking timestamps to slides), **Secondary Recordings Selector** (`renderLectureRecordingsSelector`, `switchLectureRecording`) |
| **Fallback / Web Embed** | Web URL Iframe & Picker Fallback | `#pdfViewerIframe`, `#pdfFallbackBox` | Safe HTTP/HTTPS embed (or Drive `/preview`), or local file re-link prompt when IDB cache empty |
| **Keyboard Shortcuts** | Global PDF Studio Keybindings (`L32185+`) | `ArrowUp`/`PageUp`, `ArrowDown`/`PageDown`, `Home`/`End`, `ArrowLeft`/`ArrowRight` (±5s audio), `H`/`V` (fit height), `W` (fit width), `+`/`=` & `-`/`_`, `F` (fullscreen), `Z` (zen), `M`/`T` (thumbnails), `Escape` | Must keep 100% functional and properly gated when typing in text inputs or `#pdfTextLayer` floating textarea (`L30218`) |

---

## 6. Resource Model & Persistence-Path Map

### 6.1 Academic Domain Objects & Resources (`subjects`, `scheduleEvents`, `scheduleBacklog`, `logs`, `weeklyReports`)
- **Subject (`pharmaSubjectsV4`):** `{ id, name, color, icon, isDivided?, continuousBookmark?, wirdLogs?: [], examRadar?: { title, date, lectureIds[] }, driveFolderId?, groups: [], _updatedAt, _opNonce }`
- **Group / Chapter:** `{ id, name, driveFolderId?, lectures: [], _updatedAt }`
- **Lecture / Resource Item:**
  - Core fields: `{ id, title, completed, completedAt?, lastPageNum?, totalPages?, bookmarkedPages?: [], customPages?: [{ id: 'custom_*', afterPage, title }], deletedPages?: [], srStage?, srNextReview?, srLastReviewed?, _updatedAt }`
  - **PDF Resource:** `path` (filename or `http(s)://` URL), `cloudPdfUploaded`, `cloudPdfFileId`, `cloudPdfDriveId`, `cloudPdfSize`, `cloudPdfNeedsReplace`
  - **Primary Audio Resource:** `audioPath`, `cloudAudioUploaded`, `cloudAudioFileId`, `cloudAudioDriveId`, `cloudAudioSize`, `cloudAudioNeedsReplace`
  - **Secondary Audio Recordings (`recordings[]`):** `[{ id: 'rec_*', title, dbKey: 'rec_*', audioPath, cloudAudioUploaded, cloudAudioDriveId, cloudAudioSize, cloudAudioNeedsReplace, createdAt }]`, `activeRecordingIndex`. (Checked via `isSecondaryAudioRecording(lec, rec)` `L33162`).
  - **Verified Current Schema Gap:** There are currently **no separate `links[]`, `collections[]`, `flashcards[]`, or `projects[]` entities** on a lecture/chapter — web links are only supported as `lec.path` (single PDF URL) or `lec.audioPath` (single URL), and handwritten/text notes live inside `pageAnnotations`. By contrast, the approved **product-level Chapter Workspace direction** introduces unified multi-type resources (multiple PDFs/docs, multiple recordings, video resources/links, website/reference URLs, written notes, images/slides/attachments), user-defined mixed-type Collections without duplicating binaries, and Chapter Overview + Resume Last Session — which therefore require an owner-reviewed **Resource Model & Migration/Compatibility Proposal** in WP 6.3 before any persistence changes.
- **Annotations Object (`pageAnnotations[lecId]`):**
  - Numeric slide keys `'1'`, `'2'`, ... -> arrays of stroke/text objects (`{ tool, color, size, opacity, points: [{x,y}], text?, x?, y?, sig? }`)
  - Blank note pages: `'custom_<ts>'`
  - Extra Note Sheets: `'note_<pageNum>'` + `_extraNotes: { [pageNum]: boolean }` (**Note:** currently supports **one** sheet per slide key `note_${pageNum}`. The product requirement to support **multiple Extra Note Sheets** kept Free while preserving legacy `note_<pageNum>` readability is approved, **but no specific schema extension is approved yet** — a backward-compatible technical design must be reviewed by the owner prior to implementation.)
  - Excluded pages metadata: `_excludedPages`
  - Audio Timestamp Pins: `_audioPins: { [pageNum]: [{ id, time, label }] }`
  - Causal tombstones/clear markers: `_meta`, `_clearedPages`

### 6.2 Multi-Tier Persistence Architecture
| Storage Tier | Store / Key Name | Contents & Isolation Scope |
| :--- | :--- | :--- |
| **IndexedDB v5 (`WorkspaceMediaStore`, `L24293`)** | 1. `pdfs`<br>2. `audios`<br>3. `annotations`<br>4. `annotation_recovery_vault`<br>5. `workspace_state`<br>6. `cloud_sync_journal` | Account-scoped keys (`toScopedKey(rawId, uid)`) with dual ownership verification (`hasStrictDualRecordOwnership(item, uid)`). Binary media blobs live in `pdfs`/`audios` (lecture IDs + `rec_*` secondary keys). `workspace_state` & `cloud_sync_journal` guarantee durable fallback/dirty tracking when `localStorage` hits quota. |
| **LocalStorage (~50 keys)** | Domain: `pharmaSubjectsV4`, `pharmaScheduleV4`, `pharmaScheduleBacklogV1`, `pharmaLogsV4`, `pharmaWeeklyReportsV1`, `pharmaPlannerPrefsV1`, `pharmaAcademyProgressV1`, `pharmaCloudMediaRegistryV1`<br>UI/Prefs: `exoAppLang`, `pharmaAppearancePrefsV1`, `exo_sidebar_collapsed`, `pharmaHideOnboardingV2`, `pharmaSubjectSortModeV1`, `pharmaPdfFitMode`, `exo_pdf_night_mode`, `pharmaPalmRejectV1`, `pharmaWeekGroupSubV1`, `pharmaHourlyModeV2`, `pharmaWeekBoardHorizV1`, `pharmaAutoUploadMediaCloudV1`, `pharmaUserSpecialtyTitleV1`<br>Auth/Sync/Safety (`uid`-scoped `_<uid>` or `_local`): `pharmaActiveAccountSessionV1`, `pharmaPreviousLocalAccountSessionV1`, `pharmaAccountsRegistryV1`, `pharmaLastActiveCloudUid`, `pharmaLastActiveUserIdV1`, `pharmaWorkspaceRevision_<uid>`, `pharmaWorkspaceDirty`, `pharmaWorkspaceDirty_<uid>`, `pharmaAnnotationsDirty_<uid>`, `pharmaWorkspaceUpdatedAt`, `pharmaLastCloudSyncIso`, `pharmaTombstones_<uid>`, `pharmaConflictRecovery_<uid>`, `pharmaDeviceRegistry_<uid>`, `exo_installation_device_id_v1`, `pharmaAccountWorkspace_<uid>`, `pharmaPendingArtifactCleanup_<uid>`, `pharmaImportTxState_<uid>`, `pharmaImportBarrier_<uid>`, `pharmaImportQuarantine_<uid>`, `pharmaImportQueuedAnnos_<uid>`, `pharmaPendingDomainWrites_<uid>`, `pharmaQuarantinedAnnoWrites_<uid>`, `pharmaQuarantinedDomainWrites_<uid>`, `pharmaGuestProvenanceClaim`, `pharmaUnverifiedGuestWorkspace_quarantine`, `pharmaVerifiedPreLoginOwner`, `pharmaGuestQuarantine_manifest`, `pharmaGuestQuarantine_<id>`, `_exoPendingAnnoRecoverable_<uid>`, `_exoPendingAnnoBackup_<uid>`<br>Google Drive Meta (NO secrets/tokens): `exo_gdrive_connected`, `exo_gdrive_user_email`, `exo_gdrive_folder_id`, `exo_gdrive_quota_info`, `exo_gdrive_bound_user_id`, `exo_gdrive_custom_client_id`, `pharmaGdriveSync_<uid>` | Legacy Drive token keys (`exo_gdrive_token`, `exo_gdrive_token_exp`) are purged on startup (`Test JJ.1`); live Google OAuth token is strictly **in-memory only**. |
| **SessionStorage** | `exo_gdrive_resumable_<uid>_<mediaType>_<id>` | Token-free resumable upload descriptors (`sessionUri`, `fingerprint`, `fileSize`) surviving page reload (`P5.2-R4` / `Test JJ.2`). |
| **Supabase Postgres (`public.user_workspaces`)** | `user_id` (PK), `user_email`, `subjects`, `schedule`, `logs`, `academy_progress`, `annotations`, `revision`, `can_upload_media` (VIP), `updated_at` | Writes blocked directly (`REVOKE INSERT/UPDATE/DELETE`); **must** pass through `public.sync_workspace_with_concurrency(payload, p_expected_revision)` RPC guarded by `exo_occ_rpc_definer` & `exo_internal.current_request_uid()`. Realtime WAL subscription disabled (`L45224`) to preserve Nano Disk IO budget; foreground freshness checked via lightweight timestamp polling (`pullWorkspaceFromCloudIfNewer`). |
| **Google Drive (User Account, Private-by-Default)** | `Exo` root folder (`exo_gdrive_folder_id`) -> Subject folders (`sub.driveFolderId`) -> Chapter/Group folders (`group.driveFolderId`) -> PDF & Audio binary files | Client-side OAuth2 via GIS (`drive.file` + `userinfo.email`). Chunked resumable XHR uploads (`uploadBlobToGoogleDriveViaXHRL`) + authenticated blob fetch (`downloadMediaFromCloudAccountDetailed`). Never sets `anyone` public permissions automatically (`shareGoogleDriveFileExplicitly` requires explicit user action). |

---

## 7. Chapter Workspace Current-State Audit

- **Gap Today:** There is **no dedicated Chapter Workspace screen**. Clicking a subject opens `#subject-details-view` where chapters (`.group-card`) are flat collapsible accordions (`toggleGroupAccordion`) listing lecture rows (`renderGroups()` L13590). Opening any lecture jumps straight into full-screen `#pdfViewerModalOverlay`, disconnecting the reader from chapter-level tasks, exams, notes overview, and external links.
- **What Exists at Chapter (`group`) Level:**
  - Ordered list of `lectures[]` (`moveLectureInGroup`, `autoSortLecturesInGroup`, drag-and-drop reorder)
  - Progress ratio (`gDone / g.lectures.length`)
  - Optional `driveFolderId` for Google Drive hierarchy
  - Per-lecture PDF, Primary Audio, Secondary Recordings (`rec_*`), Spaced Repetition state, Reading Bookmark (`lastPageNum`), and Annotations/Extra Notes in IDB
- **What Must Be Built in WP 6.3 (Unified Chapter Workspace & Integrated PDF Studio):**
  - A dedicated **Chapter Workspace** umbrella screen entered from a subject's Table of Contents chapter row while keeping `#subject-details-view` & `.lecture-item` IDs/triggers compatible.
  - **Progressive, Skippable First-Entry Setup & Unified Add/Link Entry Point:** Opening a chapter for the first time offers one place to upload, paste a link, or create a note, while allowing immediate entry into the workspace and later additions without blocking access.
  - **Approved Product-Level Resource Scope (verify actual preview/playback support & engineering design):** Multiple PDFs/documents, multiple audio recordings, video files and external video links, website/reference URLs, written notes/text, and images/slides/attachments — organized via **user-defined mixed-type Collections** (metadata referencing stable IDs without duplicating binary blobs), a **unified resource index** with type filters, search, sort, and an ungrouped-resources view.
  - **Chapter Overview & Session Resume:** Chapter/subject identity, resources and collections, real progress, last activity, quick-add actions, and **Continue / Resume Last Session** restoring last resource + supported work context (e.g., PDF page, zoom/position, tool state) only where safely persisted and verified (explaining partial restoration honestly).
  - **Integrated PDF Studio & Free Multi-Sheet Notes:** Embed **100% of existing PDF Studio tools** inside Chapter Workspace (Section 5 parity matrix) without reducing PDF canvas area for decoration, alongside Chapter Notes, Recordings, linked Schedule Sessions/Goals, and Exam Radar / Spaced Repetition context (do **not** invent a standalone Flashcards module).
  - **Mandatory Pre-Implementation Design Gate:** Before modifying any persistence format or schema in WP 6.3, Gemini MUST submit and obtain owner review for both (1) the **Chapter Workspace Resource Model & Migration/Compatibility Proposal** and (2) the **Backward-Compatible Multiple Extra Note Sheets Technical Design** (see Section 18.4).

---

## 8. Save, Sync & Error-State Truth Table

| State | (a) Trigger | (b) Local Durability Truth | (c) Remote / Server Truth | (d) Current UI Indicator (`updateCloudNavUI` `L32559` + Toasts/Banners) | (e) Failure / Retry / Rollback Behavior | (f) WP 6 Redesign Requirement |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Saving in Progress** | `saveSubjects()`, `flushAnnotationsToDBImmediate()`, `pushWorkspaceToCloud()` | In-flight until `localStorage.setItem` returns + IDB `tx.oncomplete` resolves (`workspace_state` / `annotations` + `cloud_sync_journal`) | RPC `sync_workspace_with_concurrency` in flight; not committed remotely yet | `#cloudNavBtn.syncing` ("جاري الحفظ...") + `#cloudLiveSyncBadge` spinner; `#pdfAutoSaveStatus` spinner in Studio | Async op guarded by `AccountOperationContext` epoch/session-gen so logout/switch discards stale writes | Calm inline serif/sans status chip without jitter; block false "Saved" until IDB `tx.oncomplete` |
| **2. Locally Saved (`local_only` / durable)** | Unauthenticated save, or after IDB `tx.oncomplete` before cloud push | **Confirmed durable** in `localStorage` and/or IndexedDB `workspace_state` / `annotations` + `annotation_recovery_vault` | Guest: none. Logged in: pending until RPC ack | Guest: `#cloudNavBtn` hard-drive icon (`محلي`); Studio `#pdfAutoSaveStatus` checkmark | If **both** LS (`QuotaExceededError`) and IDB (`onerror`/`onabort`) fail -> `idbPersistPromise` reports `false`, modal stays open preserving user text (`Test FF.8`, `GG.4`) | Clear distinction between *Saved locally on this device* vs *Synced to Cloud*; never say "Synced" on local-only commit |
| **3. Sync Pending** | Local edit while logged in (`pharmaWorkspaceDirty=1` or IDB `cloud_sync_journal` dirty) or offline queue | Durable locally + `cloud_sync_journal` entry committed in same IDB tx (`Test FF.2`) | Server holds older `revision`; local changes queued | `#cloudNavBtn` amber cloud-up ("تم الحفظ محليًا — المزامنة معلقة") | Survives reload even if `localStorage` dirty flag hits `QuotaExceededError` (`Test FF.7`); auto-flushed on `visibilitychange(hidden)`, `online`, or login reconcile | Persistent unobtrusive Pending indicator with one-click "Sync Now" action |
| **4. Offline** | `navigator.onLine === false` or `ERR_OFFLINE` network error (`classifySupabaseError` `L23567`) | Full local read/write in LS + IDB (`sw.js` serves shell offline) | Unreachable | `#cloudNavBtn` amber cloud + `#cloudLiveSyncBadge` wifi icon ("محفوظ محلياً — المزامنة معلقة (أوفلاين)") | `preservesDirty: true`; `window 'online'` listener automatically triggers `pushWorkspaceToCloud` (`L45233`) | Dedicated quiet Offline status banner in shell & Studio; never interrupt active writing with blocking modal |
| **5. Sync Failure (Server / Schema / RLS / Signature)** | `classifySupabaseError`: `42883` (`ERR_SIG_MISMATCH`), `PGRST202`/`404` (`ERR_MISSING_RPC`), `PGRST200`/`204` (`ERR_SCHEMA_CACHE`), `403`/`42501` (`ERR_PERMISSION_DENIED`), `400`/`22P02`/`23514` (`ERR_INVALID_PAYLOAD`), `5xx` (`ERR_SERVER_ERROR`), IDB read fail (`LOCAL_ANNOTATIONS_READ_ERROR`) | Local changes remain 100% intact; `dirty` flags & `cloud_sync_journal` preserved | Server row **unchanged** (`Test FF.4`, `PGlite Sec 6`) | `#cloudNavBtn.error` red warning ("تعذر المزامنة ⚠️ — محفوظ محلياً") + Arabic error toast | Fail-closed: aborts push before overwriting remote (`LOCAL_ANNOTATIONS_READ_ERROR`); `canRetry` distinguishes transient (`5xx`, `PGRST200`) vs fatal (`42883`, `403`) | Actionable non-alarmist Error Drawer/Detail in Account view showing exact recovery button (`Retry` vs `Check Session`) without raw stack traces |
| **6. Auth Expiry (401 / JWT)** | HTTP `401`, `PGRST301`, `jwt expired`, `auth session missing` (`ERR_UNAUTHORIZED` `L23574`) | Local workspace & annotations preserved with `dirty` intact | Rejected by PostgREST / RLS | `#cloudNavBtn.error` + toast prompting re-login in Cloud Modal | `canRetry: false` until user re-authenticates; `AccountOperationContext` prevents mixing sessions | Clean inline Re-authenticate banner preserving current screen & unsynced work |
| **7. OCC Conflict** | RPC returns `{ status: 'conflict', current_revision }` (`ERR_OCC_CONFLICT` `L23644`) | Local state held in memory + conflict recovery candidate stored in IDB (`_conflictRecovery` + SHA-256 verification) | Remote row untouched at newer `revision` | Console log + conflict resolution runs automatically, updates to `synced` if clean | `mergeAndApplyCloudConflict()` runs 3-way non-destructive union using unified tombstones + full stroke geometry signatures, then re-pushes at `current_revision` | Transparent "Merged changes from another device" summary notice + Conflict Recovery inspector access |
| **8. Failed Drive Upload / Download** | Drive 401/403, network drop mid-upload, quota/size error (`uploadBlobToGoogleDriveViaXHRL` / `downloadMediaFromCloudAccountDetailed`) | Local blob in IDB remains intact; interrupted chunked upload saves token-free descriptor in `sessionStorage` (`exo_gdrive_resumable_*`) | Partial Drive upload session paused (`bytes */total`); private folder permissions intact | `#gdriveStatusBadge` 5-state UI, `#gdriveResumableNotice`, `#pdfDriveReactivateBanner` (in Studio) | 401 triggers silent GIS token refresh or `reauth_required` banner; 403 stays fail-closed with zero `/uc` public fallback (`Test JJ.5`); chunked upload probes offset via `Content-Range` without duplicate POST (`Test JJ.2`) | Surface clear per-resource Drive badge & Studio `#pdfDriveReactivateBanner` styled cleanly in Warm Charcoal palette |
| **9. Rollback / Quarantine / Fail-Closed Guard** | (a) Backup Import TX crash/failure,<br>(b) Dual LS+IDB failure on chapter/subject delete (`pendingDeleteTx`),<br>(c) Foreign/anonymous legacy IDB record | (a) Import Barrier + Quarantine holds partial writes,<br>(b) `rollbackDurable()` restores deleted entity & clears partial tombstone,<br>(c) Unverified legacy records quarantined | Server untouched | Toast error + modal kept open; `pharmaImportBarrier_` blocks concurrent tabs (`BroadcastChannel` + IDB lock) | If both `saveSubjects` AND IDB tombstone rollback fail, next reload/Cloud Sync detects `pendingDeleteTx` and auto-heals visible entity (`Test II.4`) | Never silently swallow rollback errors; expose clean Recovery status if quarantine exists |
| **10. Recovery / Retry** | Page reload (`initPdfDB` -> `recoverUncommittedAnnotations` -> `recoverPendingImportJournalIfNeeded` -> `migrateAndHydrateWorkspaceFromIDB`), `online` event, manual Push/Pull | Hydrates crash-interrupted annotations from `annotation_recovery_vault`, staged compaction (`STAGING` -> `COMMITTED`), and 7-step IDB conflict migration | Reconciles via `syncWorkspaceOnLogin` using `cloud_sync_journal` | Sync badge updates only after server confirms `revision` (`Test FF.5`) | Fail-closed if `cloud_sync_journal` store missing/errors (`Test FF.7b/c/d`), protecting local annotations against stale remote `{}` | Keep startup recovery sequence asynchronous yet non-blocking where possible; preserve every test hook |

---

## 9. Language (`ar`/`en`) & Responsive Baseline Matrix

### 9.1 Bilingual & i18n Baseline (`#exo-i18n-engine`, `L46992–47373` & `L8263–8304`)
- **Persistence Key:** `localStorage.getItem('exoAppLang')` (`'ar'` | `'en'`). (**Not** `exo_lang`.)
- **First-Run Default Discrepancy:** `detectDefaultExoLanguage()` (`L47140`) inspects `navigator.languages` / `navigator.language` with `'ar'` fallback at `L47147`, returning `'ar'` for Arabic browser locales. Target Design Contract requires **English (`'en'`) as first-run default** unless user explicitly switches to Arabic.
- **Translation Mechanism:** Global `MutationObserver` + `TreeWalker` (`walkAndTranslateDOM`) mutating DOM text nodes & `placeholder`/`title`/`aria-label` attributes using `EXO_I18N_EXACT` + regex replacements, plus patching `CanvasRenderingContext2D.prototype.fillText` and `measureText`.
- **Concrete Rendered Bugs Observed in Chromium (`base-desktop-en-*.png`, `base-mobile-en-hub.png`, snapshot `page-*.yml`):**
  1. **Corrupted Label Substitutions:** Reading progress `"ص 2/10 (20%)"` was translated to **`"AM 2/10 (20%)"`** because `"ص"` matched the morning-time `"ص" -> "AM"` regex!
  2. **Broken Grammar / Machine-Translated English:** `"Hub study"`, `"Log and reports"`, `"Guide platform"`, `"1 sections • 1 from 2 Completed Lecture"`, `"Due for Review #2 (ago 1 day)"`, `"In progress the update..."`, Help Center `"Exo: handle academic the locked (The Closed Loop)"`, `"⚡ sheet Unlimited"`, `"This edition all data academic..."`.
  3. **Broken LTR Arrow Icons (`L8284`):** `#exo-ltr-i18n-styles` globally overrides `.fa-arrow-left::before { content: "\f061"; }`. On subject order-move buttons (`<-` and `->`), **both buttons visually point right (`->` `->`) in English mode** (`base-desktop-en-hub.png`).
  4. **Mixed Numerals & Spacing:** Missing space before `%` (`Overall Progress33%` in EN, `الإنجاز الكلي 33%` vs badge wrap on mobile).
  5. **Performance Overhead:** `MutationObserver` re-scans dynamic DOM mutations across a 47k-line page and builds up to 6,000 regex cache entries at runtime.

### 9.2 Responsive Matrix (Baseline `26` `@media` Queries Across `14+` Scattered Breakpoints)
Scattered breakpoints in `index.html`: `1280px`, `1279px`, `1200px`, `1024px`, `992px`, `960px`, `901px`, `900px`, `860px`, `820px`, `768px`, `680px`, `640px`, `600px`, `460px`, `max-height: 500px/560px`, `(hover: none), (pointer: coarse)`.

| Viewport Tier | Shell & Navigation | Content Grid & Controls | PDF Studio Behavior |
| :--- | :--- | :--- | :--- |
| **Desktop (`1440x900`)** | `#exoAppSidebar` fixed (`255px` / `72px` collapsed); `.navbar` hidden (`>=901px`) | 2–3 col grids; Compass left an orphan 4th card on row 2 in `#tracker`; `#subjects` shows huge void below 2 cards | Fullscreen overlay, 3-zone header, right vertical dock (`44px` wide, `padding-right: 68px` scroll clearance), `#pdfAudioPlayerBar` bottom |
| **Tablet (`768–1024px`)** | At `<=900px` sidebar hides (`L8027`), `.navbar` appears; top links compete with language/auth/help pills | Mixed breakpoints (`992`, `960`, `860`, `820`) cause inconsistent wrapping | Dock & scroll padding tighten at `<=768px` (`right: 8px`, `padding-right: 55px`) |
| **Mobile Portrait (`390x844`)** | `.navbar` at top (no direct Google Drive icon visible in `.navbar`!), `.mobile-bottom-nav` (3 tabs) fixed at bottom | Header + search + sort + `+ Add Subject` stack vertically consuming ~40% of initial viewport; RTL sort label crowds chevron; progress line wraps awkwardly | Dock auto-collapses (`dock-collapsed`, `L27250`) to `#pdfMobileDockFloatingTriggerBtn` FAB; default fit `width` |
| **Mobile Landscape (`<=560px` height)** | Condensed `.navbar` | Tight vertical scrolling | Special media rules (`L7127, L7150, L7205, L7260`) shrink header & force `currentPdfFitMode = 'height'` (`L27297`) |

---

## 10. Closed-Loop Operations Map

1. **Academic 5-Stage Closed Loop (Documented in `#acadPane_1`, Implemented Across Modules):**
   - *Organize* (`#subjects` -> Subject -> Chapter -> Lecture PDF + Audio + Links) → *Plan* (`#schedule` session linked to `lectureIds[]` & `subjectId`) → *Execute in Live Studio* (`openLectureDocument` starts `startLiveLectureStudyTracking` live study timer matching today's sessions) → *Auto-Close & Ebbinghaus Retention* (completing lecture/session triggers `#smartStudyVerifyModalOverlay` + `getSpacedRepetitionInfo` Ebbinghaus intervals `[1, 3, 7, 14, 30]` days) → *Compass, Evaluation & Recovery* (`#tracker` Compass surfaces due SR reviews, neglected subjects, missed/wasted sessions, Weekly Evaluation rollover).
2. **Exam Radar → Cram Mode Loop:**
   - `openSubjectExamRadarModal()` stores `{ title, date, lectureIds }` → `getSubjectExamRadarInfo()` computes readiness % & urgency badge → `launchSubjectExamCramMode()` launches all exam lectures merged in PDF Studio with bookmarks, recordings, and extra notes.
3. **Wasted Time & College Absence → Recovery → Goal Linker → Weekly Rollover Loop:**
   - `markSessionAsWastedTime()` / `recoverWastedSessionWithCatchup()` / `actionInvestAbsentFromLog()` → `openLogRecoveryLinkerModal()` / `openGoalTaskLinkerModal()` links make-up tasks back to `#schedule` → `checkWeeklyCycleAndRollover()` / `finalizeWeekAndArchiveReport()` archives weekly report, records atomic tombstones for auto-rollover events, and resets week cleanly. All closed-loop operations, links, and existing permission checks (`triggerManualWeekEvaluationAndRollover()` at `L46530`) remain preserved unchanged during visual redesign unless separately authorized by the owner (see Section 13.1 & 18.3).
4. **Local Durability, Crash Recovery & Cloud OCC Sync Loop:**
   - User write → LS snapshot + IDB `tx.oncomplete` (`workspace_state` / `annotations` + `annotation_recovery_vault` + `cloud_sync_journal`) → `pushWorkspaceToCloud()` calls `sync_workspace_with_concurrency(payload, expected_revision)` → on `conflict`, `mergeAndApplyCloudConflict()` performs 3-way union (unified tombstones + full stroke signatures) & records verified conflict recovery in IDB → re-pushes at server revision → clears `cloud_sync_journal` & dirty flags only on server ack.
5. **Backup Preflight & 5-Phase Atomic Import Loop:**
   - `inspectWorkspaceBackup()` verifies v4 JSON & SHA-256 → `showBackupImportPreflightModal()` → `runWithImportLock()` acquires BroadcastChannel/IDB lock + fencing token → writes `pharmaImportBarrier_` + `pharmaImportTxState_` → queues concurrent tab edits (`pharmaImportQueuedAnnos_` / `pharmaPendingDomainWrites_`) → commits or executes `rollbackImportFromJournal()` -> drains queue on release.

---

## 11. DOM, Event, Function, State, Service & Test Dependency Map

### 11.1 Critical DOM Selectors & `window.*` Contracts Asserted by Tests
All redesign work **MUST preserve or cleanly adapt** these exact contracts used across the 7 test suites (especially `test_phase4_1_chromium_e2e.js` [144 checks] and `test_phase4_regressions.js` [317 checks]):

- **Static DOM IDs/Selectors Asserted in `test_phase4_1_chromium_e2e.js` (`47` selectors):**
  - Navigation/Shell: `#subjects`, `#schedule`, `#tracker`, `#subject-details-view`, `#cloudNavBtn`, `#cloudNavText`, `#cloudLiveSyncBadge`, `#gdriveStatusBadge`, `#gdriveResumableNotice`
  - PDF Studio: `#pdfViewerModalOverlay`, `#pdfViewerModalOverlay.active`, `#pdfPagesScrollContainer`, `#pdfViewerIframe`, `#pdfInkCanvas_1`, `#pdfMoreDropdownMenu.open`, `#lectureAudioElement`, `#pdfDriveReactivateBanner`, `#pdfDriveReactivateMsg`, `#pdfDriveReactivateBtn`
  - Modals & Form Inputs: `#singleInputModalOverlay`, `#siModalInput`, `#siModalSaveBtn` (clicked via selector), `#doubleInputModalOverlay`, `#diModalInput1`, `#diModalInput2`, `#diModalSaveBtn`, `#confirmModalOverlay`, `#confirmModalOverlay.active`, `#confirmModalBtn`, `#backupImportPreflightModalOverlay`, `#smartSubjectModalOverlay`, `#smartSubjectNameInput`, `#smartSubjectExamTitleInput`, `#smartSubjectExamDateInput`, `#sessionModalOverlay`, `#sessionEditId`, `#sessionTitleInput`, `#sessionSubjectSelect`, `#sessionDaySelect`, `#sessionStartHourSelect`, `#sessionTypeSelect`, `#sessionNotesInput`, `#newTaskTitle`, `#newTaskSubject`, `#addLogModalOverlay`, `#logTextInput`, `#logSubjectSelect`, `#logMoodSelect`
- **`window.*` Functions & Test Hooks Asserted in Automated Suites (`28+` symbols):**
  - App functions extracted directly from `index.html` by regex/brace-matching in Node suites (`run_verification_tests.js`, `run_comprehensive_verification.js`, `test_phase3_cross_account_isolation.js`, `test_phase4_regressions.js`, `test_phase4_2_postgres_integration.js`): `deriveSecurePBKDF2Hash`, `verifyAndUpgradePassword`, `hashPasswordSHA256`, `sanitizeForScopedKey`, `getCanonicalUserId`, `sanitizeUserIdForPrefix`, `getUserStoragePrefix`, `getAccountBackupStorageKey`, `extractUserIdFromScopedKey`, `extractRawIdFromScopedKey`, `toScopedKey`, `resolveAuthorizedScopedKey`, `hasStrictDualRecordOwnership`, `hasVerifiedLegacyProvenance`, `computeStrokeUniqueSignature`, `saveSubjects`, `migrateConflictRecoveryToIDB`, `migrateAndHydrateWorkspaceFromIDB`, `recordConflictRecoveryCandidate`, `compactAccountAndScheduleConflictRecoveryInLS`, `recordTombstonesAtomicBatch`, `uploadMediaToCloudAccount`, `logoutCloudAccount`, `flushAnnotationsToDBImmediate`, `pushWorkspaceToCloud`, `applyCloudWorkspacePayload`, `pullWorkspaceFromCloud`, `handleAuthSessionChange`, `reactivateDriveFromPdfStudio`, `triggerDeleteGroup`, `triggerEditGroup`, `switchLectureRecording`, etc.
  - Test hook objects: `window.__exoImportTestHooks`, `window.__exoConflictMigrationTestHooks`, `window.__exoCompactionTestHooks`, `window.__exoTombstoneRollbackTestHooks`, `window.__exoSupabaseStartupState`, `window.__allowIdbTombstoneFallbackOnSnapshotKeyFail`, `window.__exoDriveChunkSizeBytes`, `window.__exoDriveRetryDelayMs`.
- **Static Regex / Security Assertions (`run_verification_tests.js` & `run_comprehensive_verification.js`):**
  - `index.html` must NOT contain `localStorage.removeItem('pharmaAppearancePrefsV1')`, `role: 'reader', type: 'anyone'` inside `uploadMediaToCloudAccount`, `clearAllIndexedDBStores()` inside logout/switch, direct `.from('user_workspaces').insert/update/upsert/delete`, false toast `'تم حفظ نسخة احتياطية كاملة داخل حسابك بنجاح ✓'` in catch block, or `return 'legacy$' + btoa`.
  - `sw.js` must retain `STATIC_ASSET_ALLOWLIST`, origin isolation, `/drive/` + `/storage/` + `/auth/` cache bypass, and `'exo-workspace-cache-'` prefix purge guard.

### 11.2 External Service Integrations & Build Files
- **CDN Dependencies (`index.html` L22, L8248–8250):** Font Awesome `6.4.0`, Google Fonts CSS, Google Identity Services (`accounts.google.com/gsi/client`), Supabase JS v2 (`@supabase/supabase-js@2`), PDF.js `3.11.174` + worker blob cache (`L8252–8260`).
- **Build & Serving:** `build.js` copies `index.html`, `manifest.json`, `sw.js`, `favicon.png`, `icon-192.png`, `icon-512.png` to `dist/`. `server.js` serves static files on `PORT=3000` with SPA fallback.

---

## 12. Visual Baseline Audit & Rendered Screenshots

8 synthetic-data screenshots were captured via headless Chromium (`playwright-cli --browser=chromium`) against `http://localhost:3000` and stored in gitignored `.playwright-cli/`:
1. `.playwright-cli/base-desktop-ar-hub.png` (`1440x900`, AR, `#subjects`)
2. `.playwright-cli/base-desktop-ar-planner.png` (`1440x900`, AR, `#schedule`)
3. `.playwright-cli/base-desktop-ar-tracker.png` (`1440x900`, AR, `#tracker`)
4. `.playwright-cli/base-desktop-ar-studio.png` (`1440x900`, AR, `#pdfViewerModalOverlay` open)
5. `.playwright-cli/base-desktop-en-hub.png` (`1440x900`, EN LTR, `#subjects`)
6. `.playwright-cli/base-desktop-en-subject-detail.png` (`1440x900`, EN LTR, `#subject-details-view`)
7. `.playwright-cli/base-mobile-en-hub.png` (`390x844`, EN LTR, `#subjects`)
8. `.playwright-cli/base-mobile-ar-hub.png` (`390x844`, AR RTL, `#subjects`)

### Concrete Defects Verified in Visual Renders & Console Logs
1. **Startup Console Error (`net::ERR_INVALID_URL`) & Iframe Sandbox Warning:** Every load emits `[ERROR] Failed to load resource: net::ERR_INVALID_URL @ data:image/png;base64,...` from malformed/oversized inline icon data URIs (`L14–15`), plus a sandbox warning (`allow-scripts` + `allow-same-origin`) on `#pdfViewerIframe`.
2. **Sidebar Clock Stuck at `--:-- / جاري التحديث...`:** Both AR and EN desktop captures show `--:--` and `"جاري التحديث..."` / `"In progress the update..."` after reload because the sidebar clock widget does not render immediately on startup (`L8375–8376`).
3. **Broken Double Right-Arrows in EN LTR (`base-desktop-en-hub.png`, `base-mobile-en-hub.png`):** `#exo-ltr-i18n-styles` (`L8284`) overrides `.fa-arrow-left::before` to `\f061` (right arrow), turning Subject #1/#2 left/right reorder buttons into two identical right-pointing arrows (`->` `->`).
4. **Severe Runtime i18n String Corruption (`base-desktop-en-*.png` & snapshot):** Regex translation converts Arabic page abbreviation `"ص 2/10 (20%)"` into **`"AM 2/10 (20%)"`**, renders `"Hub study"`, `"1 sections • 1 from 2 Completed Lecture"`, `"Overall Progress33%"` (missing space), `"Due for Review #2 (ago 1 day)"`, and mangles Help Center copy (`"Exo: handle academic the locked"`, `"System play study no your study..."`).
5. **Orphan Card & Empty Void Layouts:** On Desktop (`1440x900`), `#subjects` with 2 subjects shows massive empty dark space below with no Today/Dashboard summary; `#tracker` Compass renders 3 top cards + 1 orphan 4th card alone on row 2 leaving 66% empty horizontal gap.
6. **Excessive Decorative Pill Styling & Visual Noise:** Header tabs, available timeline hours, day tabs, order badges (`#1`), metadata tags, and Lecture status items are saturated with rounded glowing `.studio-pill` chips and `#2dd4bf` drop shadows. The redesign removes excessive decorative pill styling in favor of calm Dark Personal Study Journal surfaces while retaining useful, readable functional status badges.
7. **Mobile Viewport Crowding (`390x844`):** On `#subjects`, stacked title/summary + full-width search + full-width sort select + `+ Add Subject` pill eat ~40% of initial vertical screen height before the first subject card; Google Drive trigger is missing from `.navbar` on mobile; RTL sort dropdown label (`"ترتيبي الخاص"`) crowds the dropdown chevron.

---

## 13. Risks, Policy Contradictions & Code Hotspots

1. **Unresolved VIP / Free Policy & Copy Inconsistencies (Preserved Untouched Unless Separately Approved):**
   - *Verified Free Already:* `exportAnnotatedSlides()` (`L31680`) and `toggleExtraNoteForPage()` / `syncExtraNoteButtonsLockUI()` (`L31525` / `L31411`) are already unlocked and free for all accounts, and MUST remain Free.
   - **Observed Unresolved Code Lock (`L46530` — NOT Approved for Change):** `triggerManualWeekEvaluationAndRollover()` enforces `if (!currentUserCanUploadMedia) { checkVipFeatureAccess('إصدار تقارير التقييم الأسبوعي التفصيلية الفورية'); return; }`. Although `GEMINI.md` Sec 6 reserves `can_upload_media` for Drive media upload and approved pro extras, **removing this VIP gate is NOT approved during the Phase 6 visual redesign**. Preserve the existing gate and permissions verbatim unless a separate owner decision authorizes changing it.
   - **Observed Stale VIP Modal, Help Copy & Price Text (`L9314`, `L9338–9349`, `L10307–10309`, `#exo-i18n-engine` — NOT Approved for Change):** `#vipMediaLockModalOverlay` and `#acadPane_6` still list *"Export & Print Annotated Lectures as PDF"*, *"Unlimited Summary Sheets"*, and *"Instant Weekly Evaluation Reports"* in VIP copy, and `#exo-i18n-engine` / HTML exhibit a `199` vs `249` EGP text discrepancy. Documented as an **open product-policy/copy inconsistency**; do **not** modify Free/VIP entitlements, feature lists, or pricing copy without explicit separate owner approval.
   - **Note (`L34031`):** `handleAmbientSoundChange` has a comment `POMODORO AMBIENT FOCUS SOUNDSCAPES (VIP PRO)` but runs free locally without gating.
2. **Multiple Extra Note Sheets (`note_${pageNum}`):** Currently `buildExtraNoteSheetDOM(pageNum)` allows only **one** sheet per slide (`pdfExtraNoteWrapper_${pageNum}`). Product requirement to allow **multiple** Extra Note Sheets (kept Free, preserving legacy `note_<pageNum>` readability) is approved, **but no specific schema change is approved for implementation yet** (do **not** implement schema edits during WP 6.1). A backward-compatible technical design covering stable IDs, ordering, legacy hydration, annotated export, annotations/recovery vault, Cloud OCC merge, backup/import, account isolation, and tests must be submitted for owner review first.
3. **47,393-Line Single-File Monolith & Test Coupling:** Node verification suites parse `index.html` with `extractFunctionSource(indexHtml, '<fnName>')` using literal brace-matching on `function <name>(` / `async function <name>(`. Moving core domain, sync, IDB, account-isolation, or crypto functions out of `index.html` **would immediately break `test:static`, `test:unit`, `test:pglite`, and `test:regressions`**. Keep all tested core functions inside `index.html` compatible with existing extraction harnesses; any test-harness refactoring would require a separate reviewed task.
4. **CSS `!important` & Breakpoint Fragmentation:** `L23–8304` contains dense `!important` overrides (`L7992–8224`) across 26 `@media` blocks. Restyling without consolidating breakpoints (`>=1025px` Desktop, `768–1024px` Tablet, `<=767px` Mobile, `<=560px` height Landscape) will cause cascade wars.
5. **Inline Icon Data URI Bloat (~1.06 MB) — Conditionally Approved for WP 6.1:** Four ~260 KB base64 PNG strings inside `index.html` (`L14, L15, L8314, L8407`) slow parsing and emit `ERR_INVALID_URL`. Cleanup is conditionally approved for WP 6.1 **only after verifying** actual assets (`favicon.png`, `icon-192.png`, `icon-512.png`, `build.js`, `manifest.json`, `sw.js`), GitHub Pages relative base paths (`./` vs `/`), offline/PWA behavior, dimensions, and recording before/after payload size and console-error comparisons.

---

## 14. File-by-File Proposed Implementation Sequence (Aligned to WP 6.1 – WP 6.6)

> **Constraint Notes:**
> 1. All core logic functions extracted via `extractFunctionSource(indexHtml, ...)` MUST remain compatible inside `/index.html` (do not refactor test harnesses unless separately authorized).
> 2. Strictly adhere to the exact work-package boundaries in `reports/PHASE_6_EXPERIENCE_REDESIGN_PLAN.md`: **WP 6.1** (Foundations, Shell, Bilingual, Dashboard), **WP 6.2** (Library, Subjects, Table of Contents), **WP 6.3** (Unified Chapter Workspace, Resource Organization, Collections, Session Resume & full **PDF Studio Integration**), **WP 6.4** (Notifications, Save/Sync Truth, Error Explanation & Recovery), **WP 6.5** (Remaining Existing Screens), **WP 6.6** (Full Regression, Accessibility, Responsive, Bilingual & Performance Acceptance).

| Work Package | Target Files / `index.html` Regions | Concrete Engineering Scope & Boundaries |
| :--- | :--- | :--- |
| **WP 6.1 — Design Foundations, Application Shell, Hybrid Navigation, Typography, Bilingual Foundation & Daily-Focus Dashboard** | `/index.html` (`L1–100`, CSS `L23–8304`, Shell `L8308–8438` & `L10990–11009`, new Today/Dashboard landing view, `#exo-i18n-engine` `L46992–47373`), `/manifest.json` (only if asset/theme metadata verified compatible with `build.js` & `sw.js`) | 1. **Design Tokens & Typography:** Apply exact palette (`Ink Black #191B1D`, `Charcoal #292B2D`, `Warm Paper #F0E6D4`, `Sage Green #899982` primary accent, `Muted Blue #7898AC`, `Terracotta #C47D60`, `Warm Gold #D7B96F`) + all 4 fonts (`Manrope`, `IBM Plex Sans Arabic`, `Lora`, `Noto Naskh Arabic`) with restrained handwritten accents; consolidate 26 `@media` blocks into Desktop/Tablet/Mobile/Landscape tiers; remove excessive `.studio-pill` saturation while keeping readable functional badges.<br>2. **Hybrid Navigation & Daily-Focus Dashboard:** Collapsible desktop sidebar, purpose-built tablet/mobile nav, and **Today / Dashboard** landing view (welcome/date, Today's Focus priorities, real daily progress, weekly overview, Continue Studying, journal reflection, quick access) while preserving `#subjects`, `#schedule`, `#tracker`, and `switchView(...)` compatibility.<br>3. **Bilingual Foundation & Conditionally Approved Assets:** Set `detectDefaultExoLanguage()` first-run default to `'en'` only when `exoAppLang` is unset (never overwrite `'ar'`), fix LTR `.fa-arrow-left` flip bug, replace fragile regex corruption (`"AM 2/10"`) protecting dynamic content/canvas/filenames/user text/dates/technical values, initialize sidebar clock immediately, and perform bounded brand/icon asset cleanup only after verifying `favicon.png`, `icon-192.png`, `icon-512.png`, GitHub Pages `./` paths, `sw.js`, dimensions, and before/after metrics. **Do NOT implement Extra Note Sheet schema changes in WP 6.1.** |
| **WP 6.2 — Digital Bookshelf, Subjects & Table of Contents** | `/index.html` (Library/Subjects `#subjects`, `#subject-details-view`, `exo-mod-core-hub` `L11667–13984`, `#smartSubjectModalOverlay`) | 1. Restrained **Digital Bookshelf** presentation for subjects (book-cover motif/color, search, sort, filter, practical list/grid toggle) without creating duplicate domain entities.<br>2. Make **Table of Contents** the default chapter view inside `#subject-details-view` (chapter number, name, real progress/status, clear open/create/rename/reorder/delete controls), preserving `#subject-details-view`, `.lecture-item`, continuous/undivided subject mode, and Subject/Group/Lecture CRUD compatibility. |
| **WP 6.3 — Unified Chapter Workspace, Resource Organization, Collections, Session Resume & Complete PDF Studio Integration** | `/index.html` (New Chapter Workspace container + `#pdfViewerModalOverlay` `L9448–9880`, CSS `L8032–8246`, `exo-mod-pdf-audio-studio` `L23816–31918`) | 1. **Mandatory Stop Gate Before Persistence Edits:** Submit & obtain owner approval for (a) **Chapter Workspace Resource Model & Migration/Compatibility Proposal** (all 13 required items in Section 18.4) and (b) **Backward-Compatible Multiple Extra Note Sheets Technical Design** (all 10 required items in Section 18.4) before modifying schemas or persistence paths.<br>2. **Unified Chapter Workspace:** Progressive, skippable first-entry resource setup + single add/link entry point; verified support for multiple PDFs/docs, multiple recordings, video resources/links, website URLs, written notes, images/slides; user-defined mixed-type **Collections** (no binary duplication); unified resource index + filters/search/sort/ungrouped view; Chapter Overview + **Continue / Resume Last Session** for safely persisted state only (honest partial-restore explanation).<br>3. **Complete PDF Studio Integration:** Embed 100% of existing PDF Studio controls, shortcuts, zoom/fit, canvases, ink/laser/text, audio boost/pins/recordings, Extra Note Sheets, and Annotated PDF Export inside Chapter Workspace without shrinking canvas area or changing OAuth/Drive/sync/isolation/Free-VIP policy. |
| **WP 6.4 — Notifications, Save/Sync States, Error Explanation & Recovery Guidance** | `/index.html` (`L9090–9384`, `exo-mod-cloud-sync` `L32468–45270`, `#toastBox`, conflict/recovery dialogs & banners) | 1. Apply **Explain, Guide & Recover** across all notifications, modals, toasts, banners, offline/auth/permission/not-found/quota/server/conflict states (`Section 8` Truth Table).<br>2. Strictly separate local durability (*Saved on this device* after verified IDB/LS write) from remote sync (*Synced* only after RPC ack); localize all guidance in AR/EN; include redacted technical details and direct safe recovery actions only where implemented and tested; never advise generic storage deletion or overwrite conflicts silently. |
| **WP 6.5 — Remaining Existing Application Screens** | `/index.html` (`#schedule` `L8533–8806`, `#tracker` `L8808–9086`, `exo-mod-smart-planner`, `exo-mod-tracker-analytics`, `#cloudAuthModalOverlay`, `#backupImportPreflightModalOverlay`, `#helpModalOverlay`, `#shareSchedulePdfModalOverlay`, Settings/Account/Drive/Logs) | 1. Restyle **existing** screens screen-by-screen: Planner (`Today` timeline, `Week` board, `Weekly Goals / Backlog`), Tracker & Compass (fix orphan 4th card grid alignment), Weekly Reports/Logs, Account & Cloud Sync, Google Drive controls, Backup/Restore Preflight, Schedule PDF Export, Settings, and Academy Guide (`#helpModalOverlay`) in AR/EN + Desktop/Tablet/Mobile.<br>2. **Explicit Exclusions:** Preserve exact existing closed-loop operations (Section 10); do **not** invent standalone Projects or Flashcards screens; do **not** unlock `L46530` or edit `#vipMediaLockModalOverlay` / `#acadPane_6` / `199` vs `249` pricing without separate owner approval. |
| **WP 6.6 — Full Regression, Accessibility, Responsive, Bilingual & Performance Acceptance** | `/sw.js`, `/build.js`, verification & Playwright capture passes (no unapproved test weakening) | Run real `package.json` suites (`lint`, `build`, `test:static`, comprehensive unit, cross-account isolation, regressions, `test:pglite`, `test:e2e`, `benchmark:node`, `benchmark:browser`), AR/EN & Desktop/Tablet/Mobile visual matrix, PDF Studio parity matrix, save/sync/recovery verification, keyboard/focus/contrast/touch/reduced-motion accessibility checks, and before/after performance comparison tied to exact Source SHA for Gate 6.6 + CI handoff. |

---

## 15. Baseline Verification Results (Exact Source SHA `c74315a4580d68c61da8a0f49ec2b2f5946301e4`)

### 15.1 Local Unmodified Verification Executed in `/app/applet`
Environment: `Node.js v22.23.2` on `Linux 4.19.0-gvisor (x64)`, Chromium `v155.0.8059.12` (headless).

| Command / Suite | Verification Tier | Result | Assertions Passed / Failed |
| :--- | :--- | :--- | :--- |
| `npm run lint` (`node --check` across 8 JS files) | Syntax / Lint | **PASS** | Exit `0` |
| `npm run build` (`node build.js`) | Static Bundle (`dist/`) | **PASS** | `6` static assets copied cleanly |
| `npm run test:static` (`run_verification_tests.js`) | Web Crypto PBKDF2 + Static Security & SQL Checks | **PASS** | **54 / 54** (`0` failed) |
| `node run_comprehensive_verification.js` | Unit: Concurrency, 3-Way Merge, IDB Partition, SW, Crypto | **PASS** | **42 / 42** (`0` failed) |
| `node test_phase3_cross_account_isolation.js` | Unit: Cross-Account Isolation & Quarantine | **PASS** | **52 / 52** (`0` failed) |
| `node test_phase4_regressions.js` | Unit/Async Regressions (Phase 4–5.2 Drive/P0.1) | **PASS** | **317 / 317** (`0` failed) |
| `npm run test:pglite` (`test_phase4_2_postgres_integration.js`) | Embedded PGlite WASM Migrations, RLS, RPC, Storage | **PASS** | **41 / 41** (`0` failed) |
| `npm run test:e2e` (`test_phase4_1_chromium_e2e.js`) | Real Headless Chromium + IndexedDB E2E (Scenarios A–JJ) | **PASS** | **144 / 144** (`0` failed) |
| **Local Executed Total (6 Test Suites)** | **All Local Tiers Excluding PG16 Server** | **PASS** | **650 / 650 (`100%`)** |

#### Baseline Performance Benchmarks (`benchmark:node` & `benchmark:browser` on Unmodified Code)
| Tier | Node `benchmark_tier_a.js` Size | Node Canon | Node SHA-256 | Node IDB Apply | Chromium `benchmark_chromium_tier_a.js` Size | Chromium Parse | Chromium Canon | Chromium SHA-256 | Chromium Preflight | Chromium IDB+LS Restore | Heap Delta |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1 MB** | 1.00 MB (21 lec) | 95.09 ms | 6.65 ms | 0.18 ms | 1.01 MB (52 lec) | 17.6 ms | 91.4 ms | 33.6 ms | 187.0 ms | 423.9 ms (`PASS`) | 0.00 MB |
| **5 MB** | 5.01 MB (95 lec) | 317.28 ms | 26.61 ms | 0.39 ms | 5.00 MB (258 lec) | 49.4 ms | 222.2 ms | 104.5 ms | 693.4 ms | 1774.1 ms (`PASS`) | 0.00 MB |
| **15 MB** | 15.01 MB (276 lec) | 999.72 ms | 78.79 ms | 0.33 ms | 15.00 MB (774 lec) | 210.6 ms | 603.3 ms | 304.0 ms | 2319.9 ms | 4755.1 ms (`PASS`) | 0.00 MB |
| **25 MB** | 25.01 MB (458 lec) | 1551.97 ms | 132.63 ms | 0.53 ms | 25.01 MB (1291 lec) | 365.8 ms | 1124.2 ms | 508.4 ms | 3432.6 ms | 7928.0 ms (`PASS`) | 0.00 MB |
| **50 MB** | 27.73 MB (500 lec) | 1670.03 ms | 141.92 ms | 0.57 ms | 48.51 MB (2505 lec) | 1158.0 ms | 2089.0 ms | 965.3 ms | 8128.5 ms | 18647.2 ms (`PASS`) | 0.00 MB |

*(Note: 50 MB guard in Chromium preflight rejects >50 MB payloads fail-closed with `FILE_TOO_LARGE`.)*

### 15.2 Upstream GitHub CI Evidence (Separate from Local Execution)
- **GitHub Actions CI Run `#51`** (`43425435306`, status `success`) ran directly on Source SHA `c74315a4580d68c61da8a0f49ec2b2f5946301e4`.
- **GitHub Pages Run `#133`** (`43432549596`, status `success`) verified live deployment at HEAD `72b1922f`.
- **Important:** Today's local WP 6.0 run proves baseline readiness locally (`650/650`) and does **not** constitute a new `CI VERIFIED` status for future WP 6.1–6.6 changes; every Phase 6 implementation commit will require its own fresh local + GitHub Actions CI verification.

---

## 16. Tests Not Run Locally & Reasons

| Suite | Command | Status | Exact Reason Not Executed Locally |
| :--- | :--- | :--- | :--- |
| `test_phase4_2_1_pg16_concurrency.js` | `npm run test:pg16` | **NOT RUN LOCALLY** | The AI Studio container has no PostgreSQL 16 server binary or running daemon (`which postgres pg_isready psql` returned none). Real PostgreSQL 16 multi-connection concurrency & 10-point schema parity are covered by GitHub Actions CI (`ci.yml`), previously passing on Source SHA `c74315a4` in CI Run `#51` (`43425435306`). |

---

## 17. Remaining Open Decisions & Gate 6.0 Handoff Status

Following Gate 6.0 reconciliation (detailed in **Section 18**), **WP 6.1** can proceed strictly within its visual/shell/bilingual bounds once authorized by the owner, while the following unresolved technical proposals and policy items remain explicitly held for separate owner review:

1. **Unresolved VIP Gate & Copy Inconsistencies (Preserved Unchanged for Now):** Owner decision on whether to unlock `triggerManualWeekEvaluationAndRollover()` (`L46530`), update `#vipMediaLockModalOverlay` / `#acadPane_6` feature copy, and resolve the `199` vs `249` EGP price mismatch (none of these are approved for modification during visual redesign).
2. **WP 6.3 Unified Chapter Workspace Resource Model & Migration/Compatibility Proposal:** Must be authored, reviewed, and approved **before** any new resource persistence/collection schema (`links[]`, `collections[]`, video/image attachments, multi-resource linking) is implemented.
3. **Backward-Compatible Multiple Extra Note Sheets Technical Design:** Must be authored, reviewed, and approved **before** modifying `pageAnnotations` / `note_<pageNum>` storage, recovery vault, export, or OCC merge logic (must **not** be implemented in WP 6.1).
4. **WP 6.1 Brand/Icon Asset & Base-Path Check:** Verify `favicon.png`, `icon-192.png`, `icon-512.png`, `build.js`, `manifest.json`, `sw.js`, GitHub Pages `./` subpath compatibility, dimensions, offline/PWA behavior, and before/after size & console error comparisons before replacing inline icon data URIs.
5. **Standalone Projects / Flashcards Modules:** Confirmed absent in current source; out of scope for Phase 6 visual redesign unless separately scoped and approved by the owner in a dedicated product task.

---

## 18. Gate 6.0 Reconciliation & Owner Decision Register

### 18.1 Approved Decisions
- **Product Identity & Visual Tokens (`EXO_PERSONAL_STUDY_JOURNAL_DESIGN.md`):** Dark Personal Study Journal (`Refined Journal` primary, restrained `Expressive Journal` details) using exact palette `Ink Black #191B1D`, `Charcoal #292B2D`, `Warm Paper #F0E6D4`, `Sage Green #899982` (Primary Brand Accent), `Muted Blue #7898AC`, `Terracotta #C47D60`, and `Warm Gold #D7B96F`, plus all four fonts (`Manrope`, `IBM Plex Sans Arabic`, `Lora`, `Noto Naskh Arabic`) and rare decorative handwritten accents. Remove excessive decorative pill styling while retaining useful, readable functional status badges.
- **Exact WP 6.1–6.6 Plan Boundaries (`PHASE_6_EXPERIENCE_REDESIGN_PLAN.md`):**
  - `WP 6.1`: Design Foundations, Shell, Hybrid Nav, Typography, Bilingual Foundation, and Daily-Focus Dashboard.
  - `WP 6.2`: Digital Bookshelf, Subjects, and Table of Contents.
  - `WP 6.3`: Unified Chapter Workspace, Resource Organization, Collections, Session Resume, and complete **PDF Studio Integration** (inside Chapter Workspace, not WP 6.4 or standalone).
  - `WP 6.4`: Notifications, Save/Sync States, Error Explanation, and Recovery Guidance.
  - `WP 6.5`: Remaining Existing Application Screens.
  - `WP 6.6`: Full Regression, Accessibility, Responsive, Bilingual, and Performance Acceptance.
- **A. First-Run Language & Deterministic Bilingual Rendering:** English (`'en'`) as first-run default only when `exoAppLang` has no saved preference; never overwrite an existing `'ar'` preference with browser defaults; replace fragile regex/DOM-mangling with structured bilingual rendering while protecting dynamic content, canvas labels, filenames, URLs, mixed-script strings, user-entered text, dates, and technical values.
- **B. Hybrid Navigation & Selector Compatibility:** Preserve `#subjects`, `#schedule`, `#tracker`, `switchView()`, and existing tested selectors/hooks compatibly while introducing the Today/Dashboard view (WP 6.1) and Unified Chapter Workspace (WP 6.3).
- **C. Core Function & Test Extraction Compatibility:** Keep domain, sync, IndexedDB, account-isolation, and crypto functions inside `index.html` compatible with existing `extractFunctionSource(...)` test harnesses; preserve all closed-loop operations (`Section 10`) and their exact rules/semantics.
- **Product-Level Chapter Workspace & Multi-Sheet Notes Direction (Subject to Technical Proposals Below):** Unified Chapter Workspace supporting progressive/skippable first-entry setup, unified add/link entry, multiple PDFs/docs, multiple recordings, video resources/links, website/reference URLs, written notes, images/slides/attachments, user-defined mixed-type Collections (without duplicating binaries), unified resource index/filter/search, Chapter Overview + verified Resume Last Session, full integrated PDF Studio, and Free multiple Extra Note Sheets preserving legacy `note_<pageNum>` readability.

### 18.2 Conditional Approvals
- **D. Bounded Brand / Icon Asset Cleanup (WP 6.1):** Replacing the 4x ~260 KB inline base64 icon data URIs (`ERR_INVALID_URL`) is conditionally approved for WP 6.1 **only if** Gemini first verifies existing repo assets (`favicon.png`, `icon-192.png`, `icon-512.png`), `build.js`, `manifest.json`, `sw.js`, and GitHub Pages relative subpath (`./` vs `/`) compatibility; preserves dimensions, visual identity, and PWA offline caching; avoids unverified paths; and documents before/after size and console-error comparisons.

### 18.3 Changes Explicitly NOT Approved
- **F. Weekly Evaluation VIP Gate (`L46530`), Free/VIP Entitlements & Pricing Copy:** Do **NOT** remove the VIP gate on `triggerManualWeekEvaluationAndRollover()` (`L46530`), do **NOT** modify Free/VIP entitlements, and do **NOT** edit `#vipMediaLockModalOverlay`, `#acadPane_6`, or `199` vs `249` EGP pricing text during the Phase 6 visual redesign. Preserve current behavior and permissions unchanged unless separately authorized.
- **G. Standalone Projects or Flashcards Modules:** Do **NOT** create new standalone Projects or Flashcards screens/entities by assumption inside the visual redesign (no such modules exist in current source; Exo currently uses Spaced Repetition, Exam Radar, Exam Cram Mode, and Weekly Goals/Backlog).
- **Premature Schema / Test-Harness Changes:** Do **NOT** implement `note_<p>_<sheetId>`, `_extraNoteSheets`, `links[]`, or `collections[]` schemas during WP 6.1 or prior to owner review of the formal technical proposals; do **NOT** rewrite existing test harnesses (`extractFunctionSource(...)`) without separate authorization.

### 18.4 Technical Proposals Required Before Implementation
*(Mandatory stop-for-owner-review deliverables before any persistence, schema, or asset-path change is coded)*

1. **WP 6.3 Chapter Workspace Resource Model & Migration/Compatibility Proposal** — MUST cover all 13 areas before adding/modifying resource or collection persistence:
   1. Stable resource IDs and supported resource types (`pdf`, `audio`, `video`, `link`, `note`, `image`/attachment).
   2. Explicit relationship between subject, chapter (`group`), and lecture/resource entities.
   3. Multiple recordings per lecture/chapter (`recordings[]` / secondary keys).
   4. URLs and link safety (protocol allowlisting, XSS/iframe sandboxing boundaries).
   5. Local files and IndexedDB binary blobs (`pdfs` / `audios` stores).
   6. Google Drive IDs and private-by-default permissions (`driveFolderId`, `cloud*FileId`/`DriveId`).
   7. Backwards-compatible handling of legacy lecture fields (`path`, `audioPath`, `recordings[]`, `customPages[]`).
   8. User-defined mixed-type Collections as organizational metadata **without** duplicating underlying binary blobs.
   9. Workspace JSON Backup / Import / Export (`exo_workspace_backup_v4` schema, canonicalization, SHA-256 integrity, zero-binary invariant).
   10. Cloud OCC 3-way conflict merge & conflict recovery (`_conflictRecovery`, unified tombstones).
   11. Strict account isolation & dual record ownership (`hasStrictDualRecordOwnership`, UID-scoped keys/IDs).
   12. Existing user data migration & safe fail-closed rollback/recovery.
   13. Complete verification & test strategy across static, isolation, regression, PGlite/PG16, and Chromium E2E suites.

2. **Backward-Compatible Multiple Extra Note Sheets Technical Design** — MUST be reviewed before changing Extra Note Sheet persistence (and MUST NOT be implemented in WP 6.1); MUST cover all 10 areas:
   1. Stable sheet IDs.
   2. Deterministic sheet ordering.
   3. Legacy `note_<pageNum>` hydration & readability.
   4. Annotated PDF export (`exportAnnotatedSlides`) across multiple sheets per slide.
   5. Annotation persistence & flushing (`pageAnnotations`, IDB `annotations`).
   6. Annotation recovery vault (`annotation_recovery_vault`).
   7. Cloud OCC 3-way conflict merge & full stroke geometry signatures.
   8. Backup export / preflight / crash-recoverable 5-phase atomic import.
   9. Account isolation & UID scoping.
   10. Concrete regression & E2E tests verifying compatibility before rollout.

3. **WP 6.1 Asset & Base-Path Verification Check** — Pre-edit verification of `favicon.png`, `icon-192.png`, `icon-512.png`, `build.js`, `manifest.json`, and `sw.js` for GitHub Pages `./` compatibility, dimensions, offline caching, and before/after size & console comparison before replacing inline icon data URIs.

### 18.5 Remaining Open Owner Decisions
1. **Disposition of Unresolved Policy/Copy Mismatches:** Whether and in which separate task to authorize unlocking `triggerManualWeekEvaluationAndRollover()` (`L46530`) and updating `#vipMediaLockModalOverlay` / `#acadPane_6` / `199` vs `249` EGP pricing copy.
2. **Future Approval of Technical Design Proposals:** Owner review of the **Multiple Extra Note Sheets Technical Design** and **WP 6.3 Chapter Workspace Resource Model & Migration/Compatibility Proposal** prior to any persistence edits.
3. **Future Scope Decision on Projects / Flashcards:** Whether dedicated Projects or Flashcards features will ever be specified separately outside the Phase 6 visual redesign.

