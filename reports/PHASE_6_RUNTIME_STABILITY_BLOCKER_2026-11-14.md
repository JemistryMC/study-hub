# EXO — Runtime Stability Blocker & Owner Acceptance Hold
**Date:** 2026-11-14  
**Repository:** `JemistryMC/study-hub`  
**Branch:** `main`  
**Latest documentation HEAD at review start:** `0971895064b40f2917ffe4f24df021089c2c1b04`  
**Latest application source under review:** `efcc665a84790172874fbb813eea7e9da21b099e`  
**Technical CI evidence for that application source:** CI #64, run `43609175986`, `927/927 PASSED`; Pages #164, run `43609175604`, SUCCESS.

## 1. Owner's latest hands-on feedback (2026-11-14)
The owner reports repeated freezes severe enough that the entire website becomes unresponsive, preventing meaningful hands-on testing. The owner also confirms that the previous visual/design objection remains unchanged: the WP 6.7 second pass still does not meet the approved handcrafted Personal Study Journal direction or demonstrate real irregular paper-cutout artwork.

**Acceptance state:** `P0 RUNTIME STABILITY BLOCKER — OWNER TESTING BLOCKED; VISUAL/PRODUCT ACCEPTANCE PENDING; NOT APPROVED`.

This is an observed owner-side runtime failure, not a CI failure. Do not downgrade it to a cosmetic issue or claim the app is ready for acceptance.

## 2. Evidence review: what current tests do and do not establish
- CI #64's `927/927` result is valid for the suites and fixtures executed on application source `efcc665...`; it does not establish responsiveness on the owner's real browser profile, real local data volume, or deployed session.
- `test_wp6_6_chromium_e2e.js` seeds a synthetic 900-lecture dataset. Its performance assertion checks cold boot and elapsed time around direct calls to `switchView('subjects')`, `openSubject()`, `openChapterWorkspace()`, and one IndexedDB annotation save. It does not measure Long Tasks, event-loop stalls, animation-frame gaps, input-to-paint latency, layout/paint completion, or repeated real user journeys.
- The browser benchmark creates synthetic annotation data up to approximately 48.5 MB. The previously recorded largest restore took about 11.4 seconds. This is a useful stress result, but it is not a measure of ordinary navigation; it shows that large data operations deserve separate responsiveness and progress/cancellation scrutiny.
- WP 6.7's quota test injects a synthetic `QuotaExceededError`. It does not reproduce the owner's actual quota condition or establish that ordinary use is free from storage-related stalls.
- Offline Chromium and mocked Supabase/Drive paths do not prove live production service latency or behavior.

## 3. Immediate next work: P0 runtime diagnosis and stabilization
Do this before further visual implementation. Keep the application source changes narrowly scoped and evidence-led.

### Required diagnosis
1. Capture a reproducible browser trace and runtime profile for first load and repeated navigation. Measure Long Tasks (50 ms threshold), event-loop delay, animation-frame gaps, input-to-next-paint latency, layout/paint time, memory growth, and navigation completion—not only synchronous function-call duration.
2. Instrument the actual critical user journeys: Dashboard → Materials/Bookshelf → Subject → TOC → Chapter Workspace → PDF Studio → back; then Planner, Tracker, Help, and language switching. Include rapid repeated navigation, opening/closing overlays, scrolling, and ordinary save/autosave activity.
3. Test empty, moderate, and large synthetic accounts. Include the existing 900-lecture profile and a larger stress profile, but separate normal-use acceptance from deliberate 25–50 MB backup/restore stress.
4. Correlate stalls with startup hydration, whole-object JSON parse/stringify, full DOM rebuilds, expensive sorting/filtering, duplicate event handlers/timers/observers, repeated storage writes or quota reclamation, IndexedDB transactions, PDF canvas/render work, sync retry loops, and layout thrashing. These are hypotheses to test, not assumed root causes.
5. Add sanitized diagnostics that report timings, operation names, sizes/counts, and error classes only. Never log subject/lecture titles, notes, PDFs, annotation content, account identifiers, email addresses, access tokens, or other user data.

### Fix requirements
- Identify and document the root cause before describing a fix.
- Break up or defer non-critical CPU work; use incremental rendering/pagination/virtualization where the actual DOM workload requires it; avoid rebuilding unrelated screens; debounce/coalesce redundant work; eliminate duplicate listeners/timers and unbounded work; use a Worker only for pure computation that can safely move off the main thread.
- Large restore/import/export operations must not make the whole interface appear dead. Provide truthful progress and safe cancellation only if it can be implemented without weakening atomicity, integrity verification, recovery, or account isolation.
- Preserve all existing features and PDF Studio behavior. Do not solve freezes by disabling functionality, skipping validation, reducing data fidelity, silently dropping records, or weakening security.
- Do not ask the owner to clear browser storage, delete site data, reset IndexedDB, or sign out as a workaround. Do not perform destructive cleanup or migrations.

### Acceptance evidence
- Show before/after profiles and traces from the same environment and dataset.
- Report cold/warm startup, navigation-to-visible-content, input-to-next-paint, longest Long Task, frame-gap distribution, memory, and storage/IDB operation timings.
- Demonstrate that the browser remains interactive during large work and that repeated navigation does not accumulate handlers, timers, DOM nodes, or memory.
- Add deterministic Chromium regression tests for the diagnosed root cause and at least one realistic repeated-navigation workflow. Existing 900-lecture timing assertions must remain, but must not be presented as the sole responsiveness proof.
- Run lint, build, all existing tests, PostgreSQL 16 and Chromium suites. Tie results to the exact final application SHA. Distinguish mocks from live services and synthetic quota injection from a real quota reproduction.
- If the freeze cannot be reproduced in the available environment, report that explicitly, preserve the blocker, and provide safe non-sensitive diagnostics for the owner; do not declare it fixed.

## 4. Visual/design acceptance remains open and separate
The owner reiterates that the current design is still not acceptable. WP 6.7 screenshots continue to show conventional cards and panels and do not demonstrate the requested genuine `Imperfect Paper Cutouts` system. The design scope remains the approved dark editorial Personal Study Journal with selective warm-paper surfaces—not gaming/neon styling and not a generic rounded-card reskin.

After P0 runtime stabilization, the next visual pass must show actual irregular SVG paper shapes/cut edges, layered paper strips/tabs, restrained tape/hand-drawn annotations, varied composition, and meaningful workflow redesign across Materials/Bookshelf, TOC/Chapter Workspace, Planner, Tracker, Sidebar, Help, Login, and Dashboard. Each screen must be reviewed in desktop/tablet/mobile and Arabic RTL/English LTR. Screenshots alone are insufficient: demonstrate real UI workflows and state persistence.

Do not mix a large visual rewrite into the P0 performance fix. Keep visual/product acceptance pending until the owner can use the app normally and explicitly accepts the result.

## 5. Protected boundaries and ownership
No production Supabase, SQL/migrations/RLS/RPC/Auth/OAuth, Google Drive permissions, sync contracts, IndexedDB schemas, LocalStorage key schemas, account isolation, Free/VIP policy, or closed-loop business rules may change without separate explicit owner authorization. WP 6.3 Proposals A/B remain HELD. No new runtime dependency/framework, force push, or Gemini Git operation. The owner performs GitHub synchronization and retains final product approval.

## 6. Current status
- WP 6.7: technical CI gate passed; product acceptance still pending.
- Runtime: P0 blocker observed by owner; diagnosis/fix required.
- Design: still not accepted; real cutout-art direction not demonstrated.
- Overall Phase 6: **NOT APPROVED**.
