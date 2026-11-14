# EXO — Phase 6 / WP 6.6 Final Acceptance Verification & Closure Report
## Full Regression, Accessibility, Bilingual/Responsive, PDF Studio Parity & Performance Gate

**Work Package:** WP 6.6 — Final Regression, Accessibility, Bilingual/Responsive, PDF Studio Behavioral Parity & Performance Acceptance Gate  
**Repository:** `JemistryMC/study-hub`  
**Target Branch:** `main`  
**Authoritative GitHub Source Baseline (WP 6.5):** `7482dcd23db314b14f8fa09ebd473b48c09bb4ec` ([commit](https://github.com/JemistryMC/study-hub/commit/7482dcd23db314b14f8fa09ebd473b48c09bb4ec)) — GitHub Actions CI #60 (`43582133533`: `837/837 PASSED`), GitHub Pages #158 (`43582132737`: `SUCCESS`)  
**Local Workspace State:** `/app/applet` contains no `.git` metadata directory (`fatal: not a git repository`); all WP 6.6 edits are **unpushed local workspace drafts** awaiting owner inspection and GitHub synchronization.  
**WP 6.6 Current Status:** `IMPLEMENTED — LOCAL TESTS ONLY` *(Awaiting owner GitHub sync & GitHub Actions CI verification on the uploaded source SHA, plus final owner Phase 6 product review. Gemini never declares `CI VERIFIED` for unpushed edits or `APPROVED`.)*  
**Phase 6 Status:** `IN PROGRESS — WP 6.1–WP 6.5 CI VERIFIED; WP 6.6 IMPLEMENTED — LOCAL TESTS ONLY; FINAL OWNER PRODUCT REVIEW & APPROVED DECISION DEFERRED UNTIL GITHUB CI & OWNER REVIEW`

---

## 1. Executive Summary

WP 6.6 executed a comprehensive, empirical pre-release acceptance audit and targeted defect remediation pass across **EXO — Personal Study Journal** built directly upon the WP 6.5 CI-verified baseline (`7482dcd23db314b14f8fa09ebd473b48c09bb4ec`). Rather than rubber-stamping existing tests, the WP 6.6 pass probed the live rendered application across a **60-cell responsive/bilingual matrix**, **WCAG 2.1 AA color contrast calculations**, **keyboard focus management**, **PDF Studio interactive workflows on synthetic binary `%PDF-1.4` and `.wav` assets**, **`prefers-reduced-motion: reduce`**, **boot performance**, and **900-lecture heavy-dataset latency**.

### Real Defects Discovered, Fixed & Verified in WP 6.6
1. **Runtime Crash on `#toggleAnnoVisBtn` (`index.html` `toggleAnnotationsVisibility()`):** Clicking the Show/Hide Annotations button in PDF Studio threw `TypeError: Cannot set properties of null (setting 'innerText')` because the icon-only toolbar button no longer contains `#toggleAnnoVisText`. Added defensive null checks (`if (txt)`, `if (btn)`, `if (icon)`), dynamic `title`/`aria-label`, and bilingual `showToast`.
2. **32 EN-Mode Arabic Text Leaks (`index.html` `EXO_I18N_EXACT`):** Account college/academic-year `<option>` labels and PDF Studio tooltips/color swatches/audio titles/preview banner/thumbnail drawer `"المحذوفة ("` leaked Arabic text when English mode was active. Added exact English translations for all 32 detected strings.
3. **WCAG 2.1 AA Contrast Failures (`< 4.5:1`):** Replaced legacy low-contrast dark-teal tint (`rgb(32, 54, 53)` ~`4.23:1`) on `.psf-toggle-pill-btn`, `#customDurationBox`, and `#calculatedEndTimePill` with Charcoal/Sage `#B8C7B2` (`> 6.5:1`–`7.1:1`), and darkened `.slide-extra-space-btn` (`rgba(25,27,29,0.92)` + `#d8e4d3`) and `.pdf-page-badge` (`rgba(18,20,22,0.92)` + `#E5DFD3`) for crisp readability over bright white PDF slides.
4. **Modal Focus Capture, Tab Containment & Escape Focus Return (`index.html` `closeModal()` + `window.__exoModalA11yWired`):** Added a `MutationObserver` across all 20 `.glass-overlay` dialog IDs to remember the pre-open trigger element (`_exoReturnFocusEl`), move initial keyboard focus into the dialog, pull escaped `Tab` focus back inside the active dialog, and restore focus to the trigger element on `closeModal`/`Escape`.
5. **18 Unlabeled Inputs/Selects (`index.html`):** Added explicit `<label for="...">` or `aria-label` bindings across Account, PDF Studio thumbnails search, audio scrubber, Quick Jump sliders/inputs, Session Scheduler, Log modal, Schedule PDF title, Smart Subject Exam inputs, and Exam Radar date picker.
6. **Skipped Heading Levels (`h1 -> h4` / `h3`) & `< 44px` Mobile Touch Targets (`index.html`):** Repaired skipped heading tags on `#libraryTitleHeading` (`<h2>`), Dashboard `.exo-empty-hero` (`<h3>`), and Tracker `.wp65-compass-title` (`<h3>`), and enforced `min-height: 44px` on mobile (`<= 767px`) `#schedule .sfw-hour-chip` and `#subjects button.exo-lec-status-tag`.
7. **Duplicate Full-DOM i18n Pass at Startup (`index.html` `initExoI18n()`):** Added `window.__exoI18nAppliedLang` guard so `window.load` does not needlessly re-walk the entire DOM when `DOMContentLoaded` already applied the same locale.
8. **Placeholder `assert(true)` in `test_wp6_5_chromium_e2e.js` (`S7.6`):** Replaced `assert(true, 'S7.6 ...')` with concrete assertions verifying `document.documentElement.dir`, `document.documentElement.lang`, and `#sidebarLangLabel` across EN LTR <-> AR RTL toggling.

---

## 2. Hard Engineering Boundaries & Scope Compliance

- **Zero Protected Backend, Auth, Drive, Storage, or Business-Rule Changes:**
  - Zero edits to Supabase production/schema/migrations/RLS/triggers/RPCs (`sync_workspace_with_concurrency`), OCC 3-way conflict resolution, or `ROLLBACK_FAILED_QUARANTINE`.
  - Zero edits to IndexedDB stores (`WorkspaceMediaStore` v5), LocalStorage keys/isolation prefixes (`usr_<uid>::`), `annotation_recovery_vault`, durable sync journals, v4 SHA-256 backup format, or tombstones.
  - Zero edits to Google OAuth scopes (`drive.file`), token lifecycle, secret redaction, or `Private-by-Default` Drive file permissions.
  - Zero edits to Free vs. VIP policy (`can_upload_media`), Free Annotated PDF Export, Free Extra Note Sheets, or closed-loop Weekly Evaluation/Rollover logic.
- **Held Proposals Preserved:** WP 6.3 **Proposal A** (mixed-type Collections / resource schema) and **Proposal B** (multiple Extra Note Sheets per slide) remain **`HELD — NOT IMPLEMENTED`** pending separate explicit owner authorization.
- **No Phase 7 Work & No Git Operations:** Gemini performed zero `git commit`, `git push`, `git force-push`, or branch edits, added zero dependencies, and did not begin Phase 7.

---

## 3. Complete Post-Final-Edit Verification Summary

**Environment:** `Node.js v22.23.2`, `Linux 4.19.0-gvisor x64`, Headless Chromium `v155.0.8059.12` (`playwright 1.64.1`), Express local server (`http://localhost:3000`).  
**Every command below ran AFTER the final edit to application source and test files (except report/doc creation):**

| Tier / Suite | Command | Observed Result | Test Mechanism & Scope Boundary |
| :--- | :--- | :--- | :--- |
| **Syntax & Lint (`16` JS files)** | `npm run lint` & `lint_applet` | **PASSED** (`0` errors) | Real `node --check` on server, build, benchmarks & all unit/E2E/DB suites |
| **Production Build** | `npm run build` & `compile_applet` | **PASSED** | Clean production `dist/` compilation |
| **1. Crypto & Static Security** | `run_verification_tests.js` (`npm run test:static`) | **54 / 54 PASSED** | Real Node Web Crypto PBKDF2, secret hygiene, CSP/SW checks |
| **2. Comprehensive Academic Unit** | `run_comprehensive_verification.js` (`npm run test:unit`) | **42 / 42 PASSED** | Pure logic academic/schedule verification |
| **2. Cross-Account Isolation** | `test_phase3_cross_account_isolation.js` | **52 / 52 PASSED** | Account prefix/IDB isolation & boundary proofs |
| **2. Phase 4 / M5-B / M6 Regressions** | `test_phase4_regressions.js` | **317 / 317 PASSED** | OCC, fail-closed recovery, durable sync journal, tombstones |
| **2. WP 6.1–WP 6.5 Pure Unit** | `test_wp6_1_unit.js` .. `test_wp6_5_unit.js` | **25 / 25 PASSED** | Real extracted production helpers (`5+4+4+5+7`) |
| **2. WP 6.6 Pure Unit & Invariants** | `test_wp6_6_unit.js` | **5 / 5 PASSED** | Anti-`assert(true)` check on Phase 6 suites, `toggleAnnotationsVisibility` DOM harness execution, 32-key i18n coverage, 18 label bindings, A11y CSS/DOM invariants |
| **3. Embedded PGlite (WASM)** | `test_phase4_2_postgres_integration.js` (`npm run test:pglite`) | **41 / 41 PASSED** | Single-connection SQL/RLS/trigger parity in PGlite WASM |
| **4. Native PostgreSQL 16 Server** | `test_phase4_2_1_pg16_concurrency.js` (`npm test` step 4) | **FAIL Locally (`0/0` — No PG16 Daemon)** | `ECONNREFUSED 127.0.0.1:5432` in container; runs `96/96` against CI `postgres:16` service (last verified `96/96` in CI #60 on `7482dcd`) |
| **5. Legacy Chromium + IDB E2E** | `test_phase4_1_chromium_e2e.js` (`npm run test:e2e`) | **167 / 167 PASSED** | Real Chromium + real IndexedDB (`A–V`, `AA–MM`, `OO`); Supabase/Drive mocked |
| **5. WP 6.5 Real-UI Chromium E2E** | `test_wp6_5_chromium_e2e.js` | **43 / 43 PASSED** | Real Chromium (`S1–S8`), incl. strengthened concrete `S7.6` assertions; Supabase/Drive mocked |
| **5. WP 6.6 Final Acceptance E2E** | `test_wp6_6_chromium_e2e.js` (`npm run test:e2e:wp66`) | **22 / 22 PASSED** | Real Chromium + IDB: 60-cell matrix, contrast, modal Tab/Esc return, full PDF Studio parity (deterministic `pdfjsLib` shim), reduced motion, 900-lecture latency |
| **Local Runnable Suites Grand Total** | `npm test` (`14` runnable local suites) | **768 / 768 PASSED** | `npm test` exits non-zero locally strictly due to step 4 (`test_phase4_2_1_pg16_concurrency.js`) requiring PG16 on port `5432` |
| **Tier A Node Benchmark** | `npm run benchmark:node` | **5 / 5 TIERS PASSED** | `1.00 MB` .. `27.73 MB` canonicalize/SHA-256/apply |
| **Tier A Chromium Benchmark** | `npm run benchmark:browser` | **5 / 5 TIERS PASSED** | `1.01 MB` .. `48.51 MB` (`2,505` lectures) real IDB restore; **`0.00 MB` heap delta** |
| **Secret Hygiene Scan** | `grep` across all 6 modified/new code/test files | **CLEAN** | Zero API keys, JWTs, service-role keys, or private keys |

---

## 4. Feature Preservation, PDF Studio Parity & Test Mechanism Transparency

### Reality Boundary Separation (`Real` vs `Mocked` vs `Not Run Locally`)
- **Real Local Execution Verified:** Express static serving, real IndexedDB (`WorkspaceMediaStore` v5) blob & annotation persistence, real Canvas 2D ink rendering & pure-JS `%PDF` multi-page binary export (`exportAnnotatedSlides()`, `buildMultiPagePdfFromJpegs()`), real Web Audio `<audio>` + WAV Blob decoding, real DOM layout/contrast/focus/keyboard/touch events in Chromium v155, real PGlite WASM SQL/RLS/trigger checks, real Node.js Web Crypto PBKDF2 & SHA-256.
- **Deterministic Mocks Used in E2E:** Supabase Auth/PostgREST/RPC routes (`SUPABASE_CDN_MOCK` / `SUPABASE_MINIMAL_MOCK`), Google Identity Services & Drive v3 routes (`GOOGLE_GSI_MOCK`), and `PDFJS_DETERMINISTIC_SHIM` inside `test_wp6_6_chromium_e2e.js` (parses `/Count` from real `%PDF-1.4` bytes and renders slide canvases offline so CI never depends on external CDNs).
- **Not Verified Locally:**
  1. Multi-connection PostgreSQL 16 concurrency (`test_phase4_2_1_pg16_concurrency.js`) — no local PG16 daemon in container; deferred to GitHub Actions `postgres:16` service upon owner sync.
  2. Live Production Supabase & Live Google Drive OAuth/upload/download — strictly forbidden by contract without explicit live test authorization.
  3. Carry-forward WP 6.3 observation: while WP 6.6 `test_wp6_6_chromium_e2e.js` exercises full PDF Studio interaction flows (pen, undo, highlighter, laser, eraser, toggle visibility, bookmark, thumbnails, blank note page, hide/restore slide, Free Extra Note Sheet, Free PDF export, interactive Audio Pin modal, Quick Jump Esc, palm rejection) via real UI/canvas/modal actions, initial PDF & WAV fixtures are seeded into IndexedDB rather than selected through an OS native file picker dialog.

### PDF Studio Behavioral Parity Summary (`test_wp6_6_chromium_e2e.js` Section 4 — Free Account, 5-Page `%PDF-1.4` + WAV)
| Capability | Verification Result | Notes |
| :--- | :--- | :--- |
| Studio open & 5-page render | **PASSED** (`<= 3000 ms`) | Zero console/page errors |
| Page step (`stepPdfPage(1/-1)`) | **PASSED** (`1 -> 2 -> 1`) | Preserved navigation state |
| Zoom (`changePdfZoom(0.2)`) & Fit (`togglePdfFitModeQuick`) | **PASSED** | Scale updates cleanly |
| Pen ink draw & Undo (`undoLastStroke`) | **PASSED** (`1 -> 0` strokes) | Real pointer drag on `#pdfInkCanvas_1` |
| Annotation Visibility Toggle (`#toggleAnnoVisBtn`) | **PASSED** (`opacity 0 <-> 1`) | Null-safe after WP 6.6 fix; `0` errors |
| Highlighter, Laser (`#toolBtn_laser.laser-active`), Eraser | **PASSED** | All active tool modes verified |
| Bookmark slide (`toggleBookmarkCurrentSlide`) | **PASSED** | Persists in `getLectureBookmarkedSlides()` |
| Thumbnails drawer & Add Blank Note Page (`addBlankNotePageToLecture`) | **PASSED** | Appends `.custom-blank-slide` + `lec.customPages` |
| Hide & Restore slide (`deleteOrHidePageFromLecture` / `restoreDeletedPage`) | **PASSED** | Updates `lec.deletedPages` cleanly |
| Free Extra Note Sheet (`toggleExtraNoteForPage(1)`) | **PASSED** | Displays `#pdfExtraNoteWrapper_1` without VIP lock |
| Free Annotated PDF Export (`exportAnnotatedSlides()`) | **PASSED** | Produces real `application/pdf` `%PDF-` Blob; `#vipMediaLockModalOverlay` remains closed |
| Interactive Audio Timestamp Pin Modal (`addAudioTimestampPin`) | **PASSED** | Fills `#siModalInput`, saves `#siModalSaveBtn`, persists in `pageAnnotations._audioPins` |
| Quick Jump `Escape` + Shortcut Isolation in `<input>` | **PASSED** | `Escape` closes modal; pressing `b` inside `#pdfThumbSearchInput` does not trigger bookmark |
| Palm Rejection (`togglePalmRejectionMode()`) | **PASSED** | Cycles `true -> false -> true` cleanly |

---

## 5. Bilingual, Responsive (`60` Cells), Accessibility & Save-State Matrix

- **Responsive & Bilingual Matrix (`test_wp6_6_chromium_e2e.js` Section 1):** Tested `5` viewports (`1440×900`, `1280×800`, `768×1024`, `390×844`, `360×740`) × `2` languages (`EN LTR`, `AR RTL`) × `6` views (`dashboard`, `subjects`, `subject_toc`, `chapter_ws`, `schedule`, `tracker`) = **`60/60` cells with `0` horizontal overflow and `0` sidebar overlap**.
- **EN-Mode Arabic Leaks:** `0` visible Arabic characters across all `6` views & `5` viewports, and `0` Arabic leaks in `#cloudAuthCollegeSelect` / `#cloudAuthYearSelect` options.
- **Accessibility & Contrast:**
  - `.psf-toggle-pill-btn` and `#calculatedEndTimePill` verified `>= 4.5:1` WCAG AA contrast in Chromium.
  - All `18` repaired inputs/selects expose explicit `<label for>` or `aria-label` (verified in `test_wp6_6_unit.js`).
  - Zero skipped heading levels across all `6` active views.
  - Mobile (`<= 767px`) touch targets (`.sfw-hour-chip`, `button.exo-lec-status-tag`, `.psf-toggle-pill-btn`, `.smart-rec-action-btn`, `.btn-primary`) satisfy `>= 44px` height.
  - Dialog focus capture on open, `Tab` trap containment, and `Escape` focus restoration to `.sidebar-profile-card` passed.
  - `prefers-reduced-motion: reduce` collapses CSS transition duration to `<= 0.01s`.
- **Save / Sync / Error 4-State Clarity:** Verified truthful separation across UI & tests:
  1. **Local Durability (`Saved on device ✓`)** — backed strictly by IndexedDB/LocalStorage completion (`exoUpdatePdfAutoSaveBadge`, `#pdfAutoSaveStatus`).
  2. **Pending Cloud Sync** — shown while signed-in user has dirty journal entries not yet acknowledged by server.
  3. **Cloud Synced** — shown only after `sync_workspace_with_concurrency` acknowledgement.
  4. **Actionable Recovery (`#exoRecoveryModalOverlay` / WP 6.4 error taxonomy)** — explains cause, safety state, next steps, and sanitized non-secret diagnostics.

---

## 6. Post-Final-Edit Performance Metrics

### Tier A Chromium v155.0.8059.12 Restore Benchmark (`npm run benchmark:browser`)
| Payload Tier | Actual Size | JSON Parse | Canonicalize | Web Crypto SHA-256 | Preflight | IDB + Storage Restore | Heap Delta | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1 MB** (`52` lectures) | `1.01 MB` | `17.6 ms` | `76.0 ms` | `24.3 ms` | `178.1 ms` | `385.6 ms` | `0.00 MB` | **PASS** |
| **5 MB** (`258` lectures) | `5.00 MB` | `75.5 ms` | `211.4 ms` | `106.6 ms` | `752.0 ms` | `1370.2 ms` | `0.00 MB` | **PASS** |
| **15 MB** (`774` lectures) | `15.00 MB` | `199.4 ms` | `564.7 ms` | `321.7 ms` | `2001.6 ms` | `4206.8 ms` | `0.00 MB` | **PASS** |
| **25 MB** (`1,291` lectures) | `25.01 MB` | `391.3 ms` | `981.4 ms` | `559.3 ms` | `3258.8 ms` | `7252.2 ms` | `0.00 MB` | **PASS** |
| **50 MB** (`2,505` lectures) | `48.51 MB` | `631.4 ms` | `1800.3 ms` | `1029.7 ms` | `7062.6 ms` | `13864.2 ms` | `0.00 MB` | **PASS** |

- **Tier A Node.js Benchmark (`npm run benchmark:node`):** `5/5` tiers passed (`1.00 MB` canon `91.21 ms` / IDB `0.12 ms` .. `27.73 MB` canon `1369.28 ms` / IDB `0.53 ms`).
- **Heavy 900-Lecture UI Latency (`test_wp6_6_chromium_e2e.js` Section 5):** Cold boot `< 5000 ms`, Subject Library / TOC / Chapter Workspace transitions and IDB annotation save `< 500 ms` with `0` console/page errors.

---

## 7. Visual Evidence Gallery (`reports/screenshots/wp6-6/`, Synthetic Data)

Seven sanitized PNG screenshots captured via `playwright-cli` on `http://localhost:3000` (all transient `.playwright-cli/` files removed):
1. `screenshots/wp6-6/01-dashboard-desktop-en.png` — Dashboard Study Desk (`1440×900` EN LTR)
2. `screenshots/wp6-6/02-library-toc-desktop-en.png` — Subject Library & Table of Contents (`1440×900` EN LTR, `<h2>` title hierarchy)
3. `screenshots/wp6-6/03-planner-repaired-pill-en.png` — Weekly Planner (`1440×900` EN LTR, WCAG AA Sage `.psf-toggle-pill-btn`)
4. `screenshots/wp6-6/04-account-modal-en.png` — Profile & Cloud Identity modal (`1440×900` EN LTR, zero Arabic leaks & accessible inputs)
5. `screenshots/wp6-6/05-tracker-arabic-rtl-desktop.png` — Smart Compass & Reports (`1440×900` AR RTL, crisp `<h3>` card titles)
6. `screenshots/wp6-6/06-mobile-planner-390-ar.png` — Mobile Planner (`390×844` AR RTL, `0` overflow, `>= 44px` chips)
7. `screenshots/wp6-6/07-pdf-studio-desktop-en.png` — PDF Studio (`1440×900` EN LTR, high-contrast slide badge & `+ Summary Sheet`, null-safe `#toggleAnnoVisBtn`)

---

## 8. Modified & Created Files Inventory (SHA-256 Checksums)

| File | Action | Purpose | SHA-256 |
| :--- | :--- | :--- | :--- |
| `index.html` | Modified | WP 6.6 A11y (contrast, labels, heading tags, 44px mobile touch targets, modal focus trap/return), `toggleAnnotationsVisibility` null-safety, 32 EN-mode translations, `initExoI18n` boot dedup | `b8ac6d0b497a07fec6c5f2825f295e7ec88bc80edb70c901a6f98738ec25090d` |
| `package.json` | Modified | Wired `test_wp6_6_unit.js` & `test_wp6_6_chromium_e2e.js` into `lint`, `test:unit`, `test:e2e`, and added `test:e2e:wp66` | `92d8dc8660b6fc71c47c5a2722e678db36ceb7249cc164c90659e7cfa00a0e72` |
| `run_all_tests.js` | Modified | Registered `test_wp6_6_unit.js` & `test_wp6_6_chromium_e2e.js` once each in unified runner | `284cf391d0e6220595425caee1f5227846fd90d3a4dd0177ec72e8ca62d6d3ba` |
| `test_wp6_5_chromium_e2e.js` | Modified | Replaced dummy `assert(true)` in `S7.6` with concrete `dir`/`lang`/`#sidebarLangLabel` assertions | `ce993e2ff3f6c3cbc0dcf361a0c0f4b9d5f8f0b1a8e51d09673c779cd8ee95e2` |
| `test_wp6_6_unit.js` | Created | `5` `node:test` pure-logic & static invariant checks for WP 6.6 fixes | `7233bf34638a141bf3d6024bca78c41586e29dd181b9fcd8141eca2c7771fb34` |
| `test_wp6_6_chromium_e2e.js` | Created | `22`-assertion Chromium E2E acceptance suite covering 60-cell matrix, contrast, focus trap, PDF Studio parity, reduced motion, and 900-lecture latency | `dbf7c3be5892d988288c45cc644cab5bee507d155645721da34a5860974e51c6` |
| `reports/PHASE_6_WP_6_6_REPORT.md` | Created | Final WP 6.6 acceptance verification report | — |
| `reports/CURRENT.md`, `reports/README.md`, `reports/PHASE_6_EXPERIENCE_REDESIGN_PLAN.md` | Modified | Reconciled WP 6.6 status to `IMPLEMENTED — LOCAL TESTS ONLY` | — |
| `reports/screenshots/wp6-6/*.png` | Created | `7` sanitized visual verification PNGs | — |

---

## 9. Owner Review Readiness & Required Decisions

1. **GitHub Sync (Owner Controlled):** Review the local changes above and sync them to `JemistryMC/study-hub` (`main`) so GitHub Actions CI runs the complete suite **including `test_phase4_2_1_pg16_concurrency.js` (`postgres:16`)** alongside all `768` local assertions.
2. **Phase 6 Final Product Approval (`APPROVED`):** Once GitHub Actions CI passes on the uploaded source SHA, the owner holds the sole final decision to mark Phase 6 `APPROVED`.
3. **Separate Decisions Still Held (`HELD`):** WP 6.3 **Proposal A** (mixed-type Collections / resource schema) and **Proposal B** (multiple Extra Note Sheets per slide) remain unimplemented and await separate explicit owner authorization if desired in a future phase.
