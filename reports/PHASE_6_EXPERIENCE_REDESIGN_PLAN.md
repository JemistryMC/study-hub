# Phase 6 — EXO Personal Study Journal Experience Redesign
## Incremental Implementation Plan and Acceptance Gates

**Status:** IN PROGRESS — WP 6.1–WP 6.4 CI VERIFIED (WP 6.3 retains explicit authorization-boundary limitations); **WP 6.5 ACTIVE**; **WP 6.6 INACTIVE**; FINAL OWNER PRODUCT REVIEW AT PHASE 6 COMPLETION  
**Design authority:** reports/EXO_PERSONAL_STUDY_JOURNAL_DESIGN.md  
**Engineering authority:** GEMINI.md  
**Initial app-source baseline:** c74315a4580d68c61da8a0f49ec2b2f5946301e4 (verify current GitHub HEAD before every task)  
**Branch:** main. Gemini prepares work in AI Studio; the owner alone reviews and performs GitHub synchronization.

This is a full experience redesign, not a color/font refresh. Deliver it in reviewable work packages. Do not attempt a one-shot application rewrite.

## Work-package progression and final review model

The owner has directed that there will be **no separate owner-approval checkpoint after every Work Package**. Execute WP 6.1 through WP 6.6 in the documented order. Each package must still meet its own technical acceptance criteria, receive independent engineering verification, and pass GitHub Actions CI on its exact uploaded source SHA before the next package begins. The owner may provide corrections, change priorities, or pause work at any time. The owner’s formal product review and final `APPROVED` decision are deferred until the complete Phase 6 scope is delivered. This progression policy does not grant permission for protected changes that still require explicit separate authorization (Production access, Supabase/SQL/RLS/RPC/Auth, OAuth/Drive permissions, storage/schema/account-isolation changes, Free/VIP policy, or closed-loop business rules).

## Goals
1. Apply the approved Dark Personal Study Journal identity throughout Exo.
2. Make every screen attractive, functional, and user-friendly.
3. Redesign hybrid navigation, the dashboard, library, subjects, chapter index, and remaining screens.
4. Make Chapter Workspace the unified home for all chapter resources and all existing PDF Studio tools.
5. Make save/sync/error states understandable and actionable.
6. Preserve every existing feature, data contract, account boundary, and closed-loop operation.
7. Improve usability without adding avoidable latency.

## Owner feedback and experience-redesign acceptance standard (2026-11-13)

The owner explicitly noted that the application still feels more like a visual skin than a substantive experience redesign. This is an open Phase 6 product-quality concern, not a rejection of WP 6.2 and not permission to discard the approved visual identity.

From WP 6.3 onward, **visual changes alone do not satisfy a Work Package**. Before implementation, Gemini must document:
- The current user journey and the target user journey, step by step.
- The user friction being removed and the decisions/actions becoming easier.
- The actual interaction and state transitions being changed.
- The existing data entities and persistence paths involved, plus the exact contracts that must remain untouched.

After implementation, demonstrate:
- A real end-to-end user task through the UI, not only screenshots or isolated helper tests.
- The expected state/data outcome after the action and, where applicable, after reload/session resume.
- Keyboard/touch, bilingual RTL/LTR and responsive behavior.
- A before/after workflow comparison and evidence that steps, context switching, duplicate work, or recovery burden materially improve.

Clearly label each change as **visual**, **interaction**, or **workflow/data behavior**. Do not claim a full experience redesign from CSS, labels, cards, or mock data alone. If a package cannot change a real workflow within its authorized scope, state that limitation and propose a scoped technical adjustment rather than disguising a skin pass as a functional redesign. Preserve existing business rules and persistence/security contracts; protected changes still require separate explicit authorization.

---

## WP 6.0 — Read-only baseline audit and implementation map

**Status:** APPROVED — OWNER ACCEPTED GATE 6.0 ON 2026-11-13.  
**Deliverable:** `reports/PHASE_6_BASELINE_AUDIT.md`.  
The read-only audit task is complete and accepted by the owner. No application source/style/test changes were made in WP 6.0.

Required work:
- Verify repository, main branch, actual HEAD, worktree state, and source SHA.
- Read README.md, GEMINI.md, reports/CURRENT.md, this plan, and the design contract.
- Inventory every screen, nested screen, panel, route, navigation item, shared component, modal, toast, context menu, empty/loading/error state, and responsive variant.
- Inspect current CSS/theme tokens, font loading, breakpoints, motion, RTL/LTR, and persisted language behavior.
- Map Dashboard, Library, Subjects, Table of Contents, Chapter Workspace, all PDF Studio tools, planner/tasks/projects, schedule, flashcards, reports/logs, settings, account/backup/Drive surfaces, and every additional screen actually found in source.
- For Chapter Workspace, trace current subject/group/chapter/lecture/resource models, file/audio relationships, IndexedDB/local/cloud paths, Google Drive pathways, and session restore behavior.
- Trace notification/error/save/sync implementations. Identify which statuses are backed by durable local writes and actual remote acknowledgements.
- Find the existing closed-loop operational behavior in source and tests; document it exactly. Do not substitute an assumed cycle.
- Record DOM IDs, selectors, classes, data attributes, event listeners/delegation, inline handlers, function entry points, state stores, and tests that UI changes must preserve.
- Capture/document representative visual baselines in desktop and mobile, English and Arabic where supported. Never expose personal/sensitive data.
- Run safe, non-destructive baseline checks only.

Deliverables: create one documentation-only audit report at `reports/PHASE_6_BASELINE_AUDIT.md` containing:
1. Complete screen/component inventory.
2. Current-to-target design mapping.
3. PDF Studio control-by-control preservation matrix.
4. Resource model and persistence-path map.
5. Save/sync/error-state truth table.
6. Bilingual/responsive baseline matrix.
7. Risks, hot files, and interaction dependencies.
8. File-by-file proposed implementation sequence with change boundaries.
9. Actual baseline tests/build/lint/performance results tied to exact SHA.

**Gate 6.0:** APPROVED BY OWNER on 2026-11-13. WP 6.1 implementation is now authorized within its documented scope.

---

## WP 6.1 — Design foundations, application shell, and simplified Today dashboard

**Entry:** WP 6.0 read-only audit was accepted; WP 6.1 has now passed CI Run #53 on Source SHA `86fda9824880c00268db117f1ab8780b106f6fe0`. WP 6.1 is technically complete.

Implement design tokens and typography, global dark shell, restrained paper surfaces, hybrid navigation, desktop collapsible sidebar, purpose-built tablet/mobile navigation, correct locale persistence/switching (`en` first-run default when unset; `ar`/`en` persisted choice preserved), and the **simplified Today dashboard** (minimal greeting/date header, single primary "Today's plan" section with heading completion count + tiny progress indicator and single-CTA empty state, plus at most one compact "Continue studying" item using persisted reading/session state — excluding separate Daily Progress, Weekly Overview, Journal Notes, and Quick Access cards). Introduce shared buttons/cards/inputs/menus/tabs/status/loading/focus primitives only where safe.

Preserve every current destination, permission, event contract, and data behavior. No placeholder metrics in production. Implement RTL/LTR as each component is built. Compare performance to baseline.

**WP 6.1 Evidence:** CI Run #53 (`43450226930`) SUCCESS on `86fda9824880c00268db117f1ab8780b106f6fe0`; unified `npm test` = `755/755`, PostgreSQL 16 = `96/96`, Chromium E2E = `148/148`. GitHub Pages Run #146 (`43450226479`) SUCCESS on the same SHA. WP 6.1 is `CI VERIFIED`; overall Phase 6 owner review is deferred until all work packages are complete.

---

## WP 6.2 — Library, Subjects, and Table of Contents

**Status:** `CI VERIFIED — TECHNICALLY COMPLETE` on source SHA `70d1a8446cf9bf2a84af2035788bf7db56e4d589`. GitHub Actions CI Run #54 (`43458938490`) passed `766/766`, including PostgreSQL 16 `96/96`, Chromium E2E `155/155`, and PGlite `41/41`; Pages Run #149 (`43458937476`) succeeded. The final Phase 6 product approval remains deferred.

Implement the restrained Digital Bookshelf presentation; preserve the existing subject/group/chapter hierarchy; make Table of Contents the default chapter view; show chapter number, name, real status/progress, and contextual actions. Add practical search/sort/filter and optional Grid View only when it fits the current architecture.

Do not create duplicate domain entities for decorative covers. Keep chapter create/edit/reorder/delete efficient.

**Gate 6.2:** PASSED — GitHub Actions CI Run #54 (`43458938490`) on `70d1a8446cf9bf2a84af2035788bf7db56e4d589`; unified `766/766`, real PostgreSQL 16 `96/96`, Chromium E2E `155/155`; Pages Run #149 (`43458937476`) SUCCESS.

---

## WP 6.3 — Unified Chapter Workspace and resource organization

**Status:** `CI VERIFIED — CORE IMPLEMENTATION PASSED WITH DECLARED LIMITATIONS` on source SHA `c97499e35c006236854a2a43982fb4923e77d838` (CI Run #55 `43467239963`: `776/776`; Pages Run #151 `43467237937`: SUCCESS). Proposal A (mixed-type Collections/resource schema) and Proposal B (multiple Extra Note Sheets per slide) remain **HELD — NOT IMPLEMENTED** pending separate explicit owner authorization. The current package does not claim these capabilities as delivered.  
**Deliverable & Evidence:** `reports/PHASE_6_WP_6_3_REPORT.md` + `reports/screenshots/wp6-3/*.png` (`8` sanitized screenshots).  
**Local Post-Final-Edit Results:** `680/680` local assertions passed (`npm run lint`, `npm run build`, `54/54` static security, `42/42` comprehensive unit, `52/52` cross-account isolation, `317/317` Phase 4 regressions, `5/5` WP 6.1 unit, `4/4` WP 6.2 unit, `4/4` WP 6.3 unit, `41/41` PGlite, `161/161` Chromium E2E incl. `Test MM.1–MM.6`), plus `5/5` Tier A Node benchmarks and `1440×900` Chromium latency checks. `npm run test:pg16` was not run locally (no local PostgreSQL 16 server) and remains deferred to GitHub Actions CI. Both schema-expanding designs (**Proposal A**: 13-area Chapter Workspace Resource Model & Mixed-Type Collections; **Proposal B**: 10-area Multiple Extra Note Sheets) are documented in `reports/PHASE_6_WP_6_3_REPORT.md` Section 6 with status `HELD FOR SEPARATE OWNER REVIEW — NOT IMPLEMENTED IN CODE`.

Implement:
- First-entry resource setup from one place; progressive and skippable, with later additions allowed.
- Verified resource support for PDFs/documents, multiple audio recordings, video/web links, written notes, images/slides, and other existing attachment types.
- User-defined mixed-type Collections.
- Unified resource index, type filters, search/sort, and ungrouped resources.
- Chapter Overview with real resources, progress, last activity, and Resume/Continue when available.
- Context-aware panels/split view that retain chapter context.
- Quick Notes, linked references, chapter activity, and resource search where compatible with current models.
- Session resume only for safely persisted state; explain partially restorable sessions.

### PDF Studio — mandatory feature preservation
Before changing it, create a control-by-control parity matrix against the current app. Integrate the full existing PDF Studio into Chapter Workspace without dropping any viewer, navigation, zoom/fit, drawing, handwriting, highlighting, annotation/comment, annotation persistence/isolation/recovery, audio pin, Extra Note Sheet (including multiple sheets), import/export, annotated export, local/cache/Drive resource handling, session restore, save/sync, keyboard, pointer, or touch capability found in source. The list is not guaranteed exhaustive; source and tests are authoritative.

Keep Annotated PDF Export and multiple Extra Note Sheets within the current Free/VIP policy. Do not change OAuth, Drive upload permissions, sync engine, account isolation, or storage semantics to achieve a visual integration. Do not reduce PDF canvas area for decoration.

**Gate 6.3:** GitHub Actions CI PASSED on `c97499e35c006236854a2a43982fb4923e77d838` (`776/776`; real PostgreSQL 16 `96/96`; Chromium E2E `161/161`) + Pages #151 SUCCESS. Core Workspace/Study Studio integration is CI verified. Held Proposals A/B are excluded from delivered scope until separately authorized. E2E coverage limitation: MM.2 directly seeds some annotation/bookmark/pin/custom-page fixtures and PDF/WAV IDB blobs; MM.3 adds a web link via UI and tests audio preview. UI-driven creation of every resource type is not yet fully demonstrated.

---

## WP 6.4 — Notifications, dialogs, save states, and recovery guidance

**Status:** `CI VERIFIED — TECHNICALLY COMPLETE` on Source SHA `d7010ff03ac8db3f401f4a4a38a822dca760709d` (GitHub Actions CI #56 `43480486440`: `787/787`; GitHub Pages #153 `43480485880`: SUCCESS). Implemented Explain, Guide & Recover separating Local Durability from Cloud Synchronization across tested incident states without new LS keys/IDB stores or altering protected sync/auth/schema/Free-VIP contracts. Carry-forward of WP 6.3 UI-evidence gap preserved honestly. Final product acceptance remains deferred to Phase 6 completion.  
**Deliverable & Evidence:** `reports/PHASE_6_WP_6_4_REPORT.md` + `reports/screenshots/wp6-4/*.png` (`13` sanitized screenshots).  
**Local Post-Final-Edit Results:** `691/691` local assertions passed (`npm run lint`, `npm run build`, `54/54` static security, `42/42` comprehensive unit, `52/52` cross-account isolation, `317/317` Phase 4 regressions, `5/5` WP 6.1 unit, `4/4` WP 6.2 unit, `4/4` WP 6.3 unit, `5/5` WP 6.4 unit, `41/41` PGlite, `167/167` Chromium E2E incl. `Test OO.1–OO.10` + `GG.4–GG.5`), plus `5/5` Node Tier A benchmarks. `npm run test:pg16` was not run locally (`ECONNREFUSED 127.0.0.1:5432`) and remains queued for GitHub Actions CI.

Apply Explain, Guide & Recover across the app. Separate local durability from cloud sync. Show only runtime-proven states. Explain what happened, likely cause and uncertainty, data safety, next steps, and a direct recovery action only where supported and tested. Include sanitized technical details. Localize all feedback in Arabic and English.

Cover real states in current services: offline, retryable network failure, expired auth, permission denial, not found, rate/quota limits, server failures, and conflicts where applicable.

**Gate 6.4:** PASSED — GitHub Actions CI #56 (`43480486440`) succeeded on exact uploaded Source SHA `d7010ff03ac8db3f401f4a4a38a822dca760709d` with `787/787` assertions, including PostgreSQL 16.16 `96/96`, Chromium E2E `167/167`, and WP 6.4 unit `5/5`; GitHub Pages #153 (`43480485880`) also succeeded. WP 6.5 is unlocked; final product review remains deferred to Phase 6 completion.

---

## WP 6.5 — Remaining screens, screen by screen

**Status:** `ACTIVE / AUTHORIZED TO PROCEED` — WP 6.4 CI Gate passed on exact uploaded Source SHA. Proceed with remaining screens and their real end-to-end workflows.  

Use the actual WP 6.0 inventory; the following is illustrative, not exhaustive: planner, tasks, backlog, projects, schedules, flashcards, evaluations, reports, logs, settings, account flows, Drive controls, backup/restore, and all other screens found in source.

Do not leave legacy-looking screens behind. Do not invent or delete product behavior for visual consistency. Preserve the existing closed-loop operations exactly unless the owner separately authorizes a business-logic change. Each screen must be bilingual, responsive, and coherent with the design system.

**Gate 6.5:** complete inventory coverage and independent engineering review of every major screen family, with responsive/accessibility/regression evidence. Owner review is deferred to the overall Phase 6 final review.

---

## WP 6.6 — Full regression, accessibility, and performance acceptance

Run the real scripts from package.json and existing workflows; do not invent commands. Required evidence:
- Current full regression, security, account isolation, storage, cloud, PostgreSQL, and Chromium E2E checks.
- Lint and production build.
- English/Arabic smoke tests and RTL/LTR viewport matrix.
- PDF Studio parity matrix.
- Save/sync/error/recovery scenarios.
- Keyboard, focus, accessible names, contrast, touch targets, reduced motion.
- Before/after performance on heavy screens and navigation/resource workflows.
- Console errors, unhandled rejections, and broken-action checks.

Tie every result to source SHA, command, environment, and actual output. Distinguish local tests from GitHub Actions; CI VERIFIED is not APPROVED.

**Gate 6.6:** submit full diff, evidence, limitations, screenshots/baseline comparisons, and file-by-file checklist. Stop for owner review.

---

## Global stop conditions

Stop and obtain explicit separate owner authorization before changes to schema/migrations/RLS/RPC/auth/OAuth/Drive permissions/cloud-sync contracts; local/IndexedDB schema, backups, account boundaries, annotation identity, deletion/recovery semantics; removing/weakening a feature/test; new runtime dependency/framework; irreversible migration; Free/VIP policy; or existing closed-loop business operations. This restriction is independent of the no-per-Work-Package approval workflow.

No Force Push, direct Gemini GitHub push, Production access, or real Google Drive actions. The owner controls GitHub sync and retains the final Phase 6 approval decision; no per-Work-Package owner approval checkpoint is required.

## Required work-package report

Include actual repository/branch/Base SHA/worktree; scope and gate; audited/changed screens; complete file list; preserved-feature evidence; behavior changes and authorization; commands/environment/results/source SHA; tests not run; performance/accessibility/bilingual/responsive evidence; known issues and owner decisions.

Gemini must never self-declare a phase APPROVED.
