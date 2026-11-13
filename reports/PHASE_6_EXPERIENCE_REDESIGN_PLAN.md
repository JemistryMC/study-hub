# Phase 6 — EXO Personal Study Journal Experience Redesign
## Incremental Implementation Plan and Acceptance Gates

**Status:** IN PROGRESS — WP 6.0 AUDIT DELIVERED; GATE 6.0 OWNER REVIEW PENDING  
**Design authority:** reports/EXO_PERSONAL_STUDY_JOURNAL_DESIGN.md  
**Engineering authority:** GEMINI.md  
**Initial app-source baseline:** c74315a4580d68c61da8a0f49ec2b2f5946301e4 (verify current GitHub HEAD before every task)  
**Branch:** main. Gemini prepares work in AI Studio; the owner alone reviews and performs GitHub synchronization.

This is a full experience redesign, not a color/font refresh. Deliver it in reviewable work packages. Do not attempt a one-shot application rewrite.

## Goals
1. Apply the approved Dark Personal Study Journal identity throughout Exo.
2. Make every screen attractive, functional, and user-friendly.
3. Redesign hybrid navigation, the dashboard, library, subjects, chapter index, and remaining screens.
4. Make Chapter Workspace the unified home for all chapter resources and all existing PDF Studio tools.
5. Make save/sync/error states understandable and actionable.
6. Preserve every existing feature, data contract, account boundary, and closed-loop operation.
7. Improve usability without adding avoidable latency.

---

## WP 6.0 — Read-only baseline audit and implementation map

**Status:** IMPLEMENTED — AUDIT REPORT DELIVERED; OWNER REVIEW PENDING.  
**Deliverable:** `reports/PHASE_6_BASELINE_AUDIT.md`.  
The read-only audit task is complete. No application source/style/test changes were made in WP 6.0.

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

**Gate 6.0:** The audit report has been delivered and is awaiting owner review. No WP 6.1 implementation is authorized until the owner explicitly approves Gate 6.0.

---

## WP 6.1 — Design foundations, application shell, and dashboard

**Entry:** Owner reviews WP 6.0 mapping.

Implement design tokens and typography, global dark shell, restrained paper surfaces, hybrid navigation, desktop collapsible sidebar, purpose-built tablet/mobile navigation, correct locale persistence/switching, and the Daily Focus dashboard. Introduce shared buttons/cards/inputs/menus/tabs/status/loading/focus primitives only where safe.

Preserve every current destination, permission, event contract, and data behavior. No placeholder metrics in production. Implement RTL/LTR as each component is built. Compare performance to baseline.

**Gate 6.1:** visual and functional review, desktop/mobile, English/Arabic, navigation regression, lint/build, performance comparison.

---

## WP 6.2 — Library, Subjects, and Table of Contents

Implement the restrained Digital Bookshelf presentation; preserve the existing subject/group/chapter hierarchy; make Table of Contents the default chapter view; show chapter number, name, real status/progress, and contextual actions. Add practical search/sort/filter and optional Grid View only when it fits the current architecture.

Do not create duplicate domain entities for decorative covers. Keep chapter create/edit/reorder/delete efficient.

**Gate 6.2:** subject/resource CRUD, chapter navigation, keyboard/touch, RTL/LTR, responsive tests.

---

## WP 6.3 — Unified Chapter Workspace and resource organization

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

**Gate 6.3:** prove resource identity and relationships persist; mixed collections work; session restore behaves honestly; PDF Studio parity matrix passes; validate local durability, cloud paths, account isolation, annotations, audio pins, and exports.

---

## WP 6.4 — Notifications, dialogs, save states, and recovery guidance

Apply Explain, Guide & Recover across the app. Separate local durability from cloud sync. Show only runtime-proven states. Explain what happened, likely cause and uncertainty, data safety, next steps, and a direct recovery action only where supported and tested. Include sanitized technical details. Localize all feedback in Arabic and English.

Cover real states in current services: offline, retryable network failure, expired auth, permission denial, not found, rate/quota limits, server failures, and conflicts where applicable.

**Gate 6.4:** test every actual state/recovery path; no false Saved/Synced claims, no generic data-erasure guidance, no secret leakage.

---

## WP 6.5 — Remaining screens, screen by screen

Use the actual WP 6.0 inventory; the following is illustrative, not exhaustive: planner, tasks, backlog, projects, schedules, flashcards, evaluations, reports, logs, settings, account flows, Drive controls, backup/restore, and all other screens found in source.

Do not leave legacy-looking screens behind. Do not invent or delete product behavior for visual consistency. Preserve the existing closed-loop operations exactly unless the owner separately authorizes a business-logic change. Each screen must be bilingual, responsive, and coherent with the design system.

**Gate 6.5:** complete inventory coverage and owner review of every major screen family.

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

Stop for owner review before changes to schema/migrations/RLS/RPC/auth/OAuth/Drive permissions/cloud-sync contracts; local/IndexedDB schema, backups, account boundaries, annotation identity, deletion/recovery semantics; removing/weakening a feature/test; new runtime dependency/framework; irreversible migration; Free/VIP policy; or existing closed-loop business operations.

No Force Push, direct Gemini GitHub push, Production access, or real Google Drive actions. The owner controls sync and final approval.

## Required work-package report

Include actual repository/branch/Base SHA/worktree; scope and gate; audited/changed screens; complete file list; preserved-feature evidence; behavior changes and authorization; commands/environment/results/source SHA; tests not run; performance/accessibility/bilingual/responsive evidence; known issues and owner decisions.

Gemini must never self-declare a phase APPROVED.
