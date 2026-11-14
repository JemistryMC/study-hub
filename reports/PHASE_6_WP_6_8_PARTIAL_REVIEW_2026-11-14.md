# WP 6.8 Partial Upload Review — Runtime Stabilization
**Review date:** 2026-11-14  
**Repository:** `JemistryMC/study-hub`  
**Branch:** `main`  
**Uploaded application source:** `ebcff2fd892de30de30eb2f3668943ea3d04219b`  
**Commit:** [ebcff2f](https://github.com/JemistryMC/study-hub/commit/ebcff2fd892de30de30eb2f3668943ea3d04219b)  
**CI:** [Run #65 / 43613608259](https://github.com/JemistryMC/study-hub/actions/runs/43613608259) — SUCCESS.  
**Pages:** [Run #169 / 43613607169](https://github.com/JemistryMC/study-hub/actions/runs/43613607169) — SUCCESS.

## 1. Owner/Gemini handoff
Gemini 4 Hydrogen was cancelled after editing four files because the model quota ended. The owner uploaded the partial work to `main`.

Files changed:
- `index.html` — modified, 678 additions / 257 deletions.
- `benchmark_wp6_8_profile.js` — added, 763 lines.
- `test_wp6_8_chromium_e2e.js` — added, 528 lines.
- `test_wp6_8_unit.js` — added, 206 lines.

No WP 6.8 report, baseline profile output, package script registration, or test-runner registration was included in this upload.

## 2. CI result — success does not include WP 6.8
CI #65 completed successfully, and GitHub Pages #169 deployed the commit. The CI job log confirms the actual executed suites ended at WP 6.7:
- Static/crypto 54/54
- Comprehensive unit 42/42
- Cross-account isolation 52/52
- Phase 4 regressions 317/317
- PGlite 41/41
- PostgreSQL 16 96/96
- Legacy Chromium 167/167
- WP 6.5 Chromium 43/43
- WP 6.6 Chromium 22/22
- WP 6.7 Chromium 50/50
- Unified runner: 927/927.

**Neither `test_wp6_8_unit.js` nor `test_wp6_8_chromium_e2e.js` nor `benchmark_wp6_8_profile.js` ran in CI #65.** The commit did not modify `package.json`, `run_all_tests.js`, or `.github/workflows/ci.yml`. The existing lint script and unified test runner therefore still do not register these new files. Their syntax, behavior, test assertions and benchmark output are not covered by the reported green CI result.

CI #65 is a valid green result for the pre-existing registered test suite against the changed app source; it is not a WP 6.8 verification result.

## 3. Substantive application changes present
The `index.html` patch does contain real performance-oriented changes, not only test scaffolding:

- Adds `content-visibility: auto` and intrinsic sizing to lecture/session/log row styles.
- Unmounts heavy Planner/Tracker DOM when switching away; defers Planner/Tracker initial rendering until first visit.
- Adds view-scoped/lazy language translation for hidden views and active overlays.
- Changes Chapter Workspace resource search/filter/sort to replace only the resource list instead of re-rendering the whole Workspace.
- Builds Maps to avoid repeated linear scans for Planner goal/log linked-event lookups.
- Buckets Planner week events in one pass and adds progressive rendering for goals.
- Reduces Tracker DOM by omitting collapsed log-day bodies and limiting per-day initial cards with a Load More action.
- Defers PDF thumbnails until the drawer opens, coalesces PDF scroll detection with requestAnimationFrame, releases the temporary offscreen canvas, and evicts distant rendered page canvases for large PDFs.
- Defers HiDPI backing-store allocation for collapsed Extra Note Sheet canvases.
- Reuses a precomputed causal digest to avoid duplicate content-digest computation.
- Memoizes live clock DOM updates and skips work while Planner is inactive.

These are plausible optimizations, but the upload contains no root-cause report or before/after profile artifact. Their presence alone does not demonstrate that the owner's full-site freezes are fixed.

## 4. Blocking review findings

### 4.1 Protected recovery/closed-loop semantics changed — must resolve
The patch changes `reconcileRecoveryAndAbsentLogsWithSchedule()`, which reconciles missed/wasted-time/college-absence logs with scheduled recovery sessions.

Previously, a log used `studySessions.find(...)`: schedule order determined the first session matching either the explicit `recoveredFromLogId` or the catch-up classification. The replacement builds maps and chooses in a different priority order:
1. exact `recoveredFromLogId` map match;
2. same-subject catch-up;
3. first catch-up fallback.

That is not behaviorally equivalent to the previous first-match predicate. For example, an earlier catch-up event can previously be selected before a later event with an exact recovery reference; the new code prioritizes the exact reference. It can therefore change which scheduled session a log is linked to. The new `absentCollegeByDay` Map also overwrites earlier same-day entries, unlike the prior first-match `.find()` behavior.

This is a change to protected academic recovery/closed-loop behavior, not a safe performance-only refactor. **Restore the prior selection semantics exactly while retaining indexed lookups**, by preserving original schedule order and the original first-match predicate/precedence. Add tests proving equivalence for reordered events, duplicate day candidates, exact recovery references, same-subject and cross-subject fallback. Do not introduce a new policy.

### 4.2 Tracker filtering can hide search results across multiple days
In `renderLogs()`, the old behavior expanded all matching day groups whenever filtered mode was active. The new rule opens filtered groups only when `visibleDayKeys.length <= 5`, unless a day was already manually opened. Since filtered mode includes all matching day groups, a search or mood filter spanning more than five dates can leave the matching entries inside collapsed groups. The user may see group headings/counts but not the filtered log cards.

Preserve visible filtered results across all matching dates while still windowing the cards within each group. Add a Chromium regression with matching logs across at least six dates and another day with more than 40 records; verify the results remain discoverable and Load More reveals all records.

### 4.3 WP 6.8 tests and profiler are not integrated
Register:
- `test_wp6_8_unit.js` in `npm run lint`, `npm run test:unit`, and `run_all_tests.js`.
- `test_wp6_8_chromium_e2e.js` in `npm run lint`, `npm run test:e2e`, and `run_all_tests.js`.
- `benchmark_wp6_8_profile.js` with an explicit reproducible script (for example `benchmark:wp68`) and documented output path.

Do not count a file as a passing test until the exact command has actually executed it. Keep all existing suites intact.

### 4.4 Profiler limitations and missing evidence
The profiler is useful scaffolding, but its header overstates some metrics:
- `measureClickInteraction()` measures Playwright click/action round-trip plus waiting for two requestAnimationFrame callbacks; it is not a clean Event Timing / Interaction-to-Next-Paint measurement.
- No explicit IndexedDB operation timing wrapper is present even though the header says IDB overhead is measured.
- The profile uses offline routing and deterministic PDF.js / mocked Supabase and Google services; it is not a live production integration test.
- The default output filename is `.playwright-cli/wp6_8_before_baseline.json`, but no profile JSON or before/after comparison was committed. The profiler is added in the same upload as the performance fixes, so no genuine pre-change baseline is evidenced.

Correct metric labels or implement the actual metric, record separate pre-fix and post-fix profiles using the same environment/datasets, and retain sanitized artifacts. Clearly distinguish mocked browser evidence from deployed/live services.

## 5. Required continuation — limited remediation, not another redesign
1. Preserve the current upload as the review point; do not claim WP 6.8 is complete.
2. Correct the protected recovery-link selection regression and the filtered Tracker visibility regression.
3. Register and execute the new unit, Chromium E2E, and profiler commands.
4. Produce actual before/after traces and metrics. Do not equate the profiler's two-rAF wall time with INP. If available, use Event Timing entries for interaction latency; otherwise label the metric accurately.
5. Add tests for the exact code paths that were changed and for preserved recovery semantics.
6. Run the full registered test suite and tie the result to the final application SHA.
7. If Gemini cannot reproduce the owner freeze, say so explicitly and keep owner retest required. Do not claim closure based only on synthetic tests or Headless Chromium.
8. No additional visual redesign in WP 6.8. Design acceptance remains open.

## 6. Protected boundaries and status
No Production Supabase, SQL/Migrations/RLS/RPC/Auth/OAuth, Drive permissions, sync contracts, IndexedDB schema, LocalStorage key schema, account isolation, Free/VIP policy, or academic closed-loop behavior changes without separate explicit owner authorization. WP 6.3 Proposals A/B remain HELD. Do not force-push or modify Git history.

**Current status:** `WP 6.8 PARTIALLY UPLOADED — APP PERFORMANCE REFACTOR PRESENT; NEW SUITES NOT EXECUTED/REGISTERED; ROOT CAUSE NOT ESTABLISHED; PROTECTED RECOVERY SEMANTICS REQUIRE CORRECTION; OWNER RETEST REQUIRED. Overall Phase 6 remains NOT APPROVED.`
