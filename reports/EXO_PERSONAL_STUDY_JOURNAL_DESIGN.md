# EXO — Personal Study Journal
## Product Experience & Visual Design Contract

**Status:** APPROVED DESIGN DIRECTION — IMPLEMENTATION NOT YET STARTED  
**Source baseline at handoff:** c74315a4580d68c61da8a0f49ec2b2f5946301e4 (verify actual GitHub HEAD before every task)  
**Scope:** All user-facing screens, navigation, components, interactions, feedback states, and responsive layouts.

This is the authoritative owner-approved visual and UX direction for the Exo redesign. It does not override the engineering, security, data-integrity, or release rules in GEMINI.md.

## 1. Product identity and governing principle

**EXO — Personal Study Journal**  
**Tagline:** Your personal space to learn, plan & grow.

Exo should feel like a thoughtfully designed personal study journal combined with a modern academic workspace: part study notebook, part digital library, part capable productivity application.

**Beautiful by design. Functional by nature.** Visual appeal, functionality, and user-friendliness are co-equal requirements. If decoration conflicts with clarity, performance, accessibility, or task completion, simplify or remove it.

The book/journal metaphor is a design language, not a requirement to make every feature imitate a physical book.

### Explicitly rejected
- No gaming identity, Deadlock-inspired gaming motifs, gamer dashboards, tier/rank badges, neon, or cyberpunk treatment.
- Deadlock was referenced only for paper-like texture/layering; its gaming style is explicitly rejected.
- No excessive grunge, scratches, torn edges, stickers, tape, stamps, or scrapbook clutter.
- Do not make every card a literal sheet of paper.
- No page-flip animation as a default navigation mechanism.
- Do not sacrifice readability, PDF workspace area, or performance for visual effects.
- Reference websites are inspiration for selected qualities only; do not copy their identity or layouts.

## 2. Approved art direction

**Primary:** Refined Journal. **Secondary:** restrained Expressive Journal details.  
**Overall:** Dark Personal Study Journal with tactile paper elements.

Use a dark charcoal/ink environment as the app-wide identity. Introduce warm light-paper surfaces selectively where they improve reading hierarchy, content grouping, or the feeling of opening a journal page.

Visual language:
- Subtle paper grain, layered surfaces, soft natural shadows, and restrained depth.
- Editorial headings, notebook-like margins, numbered chapters, bookmarks, index tabs, and occasional handwritten-style annotations.
- Hand-drawn details and paper-cut shapes may add personality but must never obscure content.
- Distinct personalities for different areas, unified by shared tokens and components.
- Strong hierarchy, comfortable whitespace, readable density, clear interactive states.

### Approved color palette

| Token | Hex | Role |
|---|---|---|
| Ink Black | #191B1D | Main dark background |
| Charcoal | #292B2D | Dark surfaces and panels |
| Warm Paper | #F0E6D4 | Light reading surfaces and selected cards |
| Sage Green | #899982 | Primary brand accent |
| Muted Blue | #7898AC | Supporting accent |
| Terracotta | #C47D60 | Supporting accent |
| Warm Gold | #D7B96F | Supporting accent/highlights |

Sage Green is the primary identity accent. Blue, Terracotta, and Gold are supporting accents, not colors to scatter uniformly. Define separate semantic tokens for success, warning, error, information, disabled, focus, and selection. Never communicate meaning by color alone. Verify contrast for each text/control pairing; palette values are not automatically accessible in every use.

## 3. Typography

| Use | English | Arabic |
|---|---|---|
| Main UI, controls, body, tables | Manrope | IBM Plex Sans Arabic |
| Selected editorial/book/chapter headings | Lora | Noto Naskh Arabic |
| Handwritten character | Rare decorative details only | Rare decorative details only |

Main UI fonts must support long-session reading. Editorial fonts are accents, not dense body text or controls. Handwritten styles must not carry essential instructions, statuses, numbers, or dense content. Test Arabic shaping, punctuation, mixed scripts, numerals, line height, and long titles. Check licenses, local availability, font size, offline/PWA behavior, and loading performance before adding assets or external requests. Provide robust fallbacks.

## 4. Language, locale, and direction

- English is the default on first launch only when no saved language preference exists.
- Arabic and English are both first-class supported languages.
- Persist the user's language choice; never overwrite an existing preference with the default.
- English uses LTR; Arabic uses RTL with intentional reflow, not blind mirroring.
- Language switching must not unnecessarily reload the app, discard unsaved input, reset the current screen, or lose resource/workspace context.
- Localize navigation, dialogs, toasts, validation, empty/loading/error states, tooltips, accessibility labels, and recovery guidance.
- Handle mixed-language text, URLs, emails, filenames, numbers, dates, and technical terms correctly.
- Respect locale formatting and explicit user preferences for dates, time, and numbers.
- Evaluate direction-sensitive controls (media, PDF navigation, code, progress) individually; do not blindly flip them.

## 5. Global shell and navigation

**Approved:** Hybrid Navigation.

Desktop: clear collapsible sidebar, obvious current destination, contextual tabs/index where useful, dominant workspace area, easy-to-find search and quick actions.

Tablet/mobile: recompose navigation for available space; do not squeeze desktop navigation into a narrow viewport. Keep frequent destinations and core actions reachable, with adequate touch targets.

The journal metaphor may inform tabs, bookmarks, and hierarchy, but may not make navigation slower or harder.

## 6. Dashboard

**Approved (Owner Simplified Today Direction):** Daily Focus first — answering one question: *"What should I study today, and where can I continue from?"* The Today dashboard is a calm, focused starting point, not a multi-card metrics board.

Desired hierarchy:
1. **Minimal header**: Greeting and current formatted date; no large decorative stat blocks or button clusters.
2. **Today's plan**: Today's real scheduled study sessions only, preserving working completion interaction, with completion count and tiny progress indicator inside the section heading (`done / total`), at most a compact inline urgent indication backed by existing data when applicable, and one concise empty state with one primary action to schedule a session when none exist.
3. **Continue studying**: One compact item for the single most recent genuinely resumable incomplete lecture/resource using persisted reading/session state, preserving resume navigation and last-page behavior (omitted or kept minimal when none exists).

Separate Dashboard cards for Daily Progress, Weekly Overview, Journal Notes/Reflection, and Quick Access are excluded from the Today screen while preserving the underlying Planner and Tracker views and existing closed-loop operations. Never fabricate counts, progress, completion, or activity. Desktop/mobile composition adapts cleanly while retaining function.

## 7. Library, subjects, and chapter index

### Library / Digital Bookshelf
Use restrained book-cover treatments for subjects, with subject name and a simple motif/color. The library must remain searchable and efficient, not a decorative bookshelf. Provide practical list/grid choices when useful, plus clear search, sorting, filtering, and create/edit actions.

### Subject / Table of Contents
**Table of Contents is the approved default chapter view.** Show chapter number, name, progress/status, and clear open action. Make row interaction predictable; keep rename/reorder/delete discoverable without clutter. Include useful search/sort/filter. Grid View may be optional but must not replace the default Table of Contents. Prioritize scanability over book decoration.

## 8. Unified Chapter Workspace

**Core decision:** Chapter Workspace is the umbrella environment for everything related to one chapter. PDF Studio is integrated inside it, not a separate product competing with it.

### First entry and resource setup
When a chapter is opened for the first time, offer a unified way to add or link resources. This must be progressive and skippable: start with one resource, add several, or enter the workspace and add later. Never block chapter access because setup is incomplete.

Intended resource categories (verify actual support before promising previews/playback):
- PDFs and documents.
- Multiple audio recordings.
- Video files and external video links.
- Website/reference URLs.
- Written notes and text.
- Images, slides, and other supported attachments.

Offer one entry point for upload, paste-link, or create-note actions where appropriate.

### Resource organization
- A unified resource index for the entire chapter.
- User-defined mixed-type Collections; a collection may contain different resource kinds.
- Add, rename, move, and reorganize later without losing resource identity, annotations, history, or links.
- Type filters, search, sort, and an ungrouped-resources view.
- Collections are organizational metadata; do not duplicate binary files or fragile-copy underlying resources.
- Preserve stable IDs and existing relationships. Inspect current data models before migrations or persistence changes.

### Chapter Overview and resuming
The overview should show chapter/subject identity, resources and collections, real progress, last activity, and quick add actions. Show Continue/Resume Last Session when a valid resumable session exists.

Restore the last resource and supported work context (e.g. PDF page, zoom/position, relevant tool state) only where safely persisted and verified. Explain when a session can only be partially restored. Preserve chapter context when moving among resources. Distinguish local save from cloud sync.

### Workspace sections and PDF Studio
Exact tabs/panels must be finalized after inspecting the actual app. Intended sections may include Overview, Resources/Collections, Notes, Recordings, linked references, activity, and contextual tools. Use contextual panels/split views without crowding the main work area.

Audit and preserve every existing PDF Studio capability. At minimum inspect and retain the current behavior for PDF loading/viewing, page navigation, zoom/fit, drawing/handwriting/highlighting, annotations/comments, annotation persistence/account isolation/recovery, audio pins, Extra Note Sheets (including multiple sheets), import/export and annotated export, resource/local/cache/Drive handling, session restoration, save/sync feedback, keyboard, pointer, and touch interactions. This list is not guaranteed exhaustive: actual source and tests are authoritative. Keep Annotated PDF Export and multiple Extra Note Sheets under the existing Free/VIP policy. Do not reduce the PDF canvas area for decoration.

Desired enhancements such as unified resource search, quick notes, linked references, and chapter activity should use existing models where possible. Do not introduce unsafe storage migrations or duplicate existing functionality.

## 9. Save states, notifications, errors, and recovery

**Approved principle: Explain, Guide & Recover.** Do not tell the user something is wrong without explaining what happened and what they can safely do next.

Treat local durability and cloud synchronization as separate state dimensions. Possible states include Saving, Saved on this device, Sync pending, Offline, Sync failed, Authentication required, Conflict requires review, and Fully synchronized.

Show states only when supported by runtime evidence:
- Do not say locally Saved before the relevant durable write has completed and been verified.
- Do not say Synced before the remote service acknowledges the operation.
- If unknown, say unknown; do not imply safety without proof.

Every actionable error should communicate in the user's language:
1. What happened.
2. The cause, or best-supported likely cause with uncertainty.
3. Whether changes are locally saved, remotely synchronized, pending, or uncertain.
4. Recommended safe next steps.
5. A direct action when a safe recovery action is implemented and tested.
6. Optional expandable technical detail with secrets and personal content redacted.

Actions may include retry, reconnect account, restore connection, review conflict versions, or reopen/download a resource only when supported by the actual implementation.

Never show only a vague error/raw stack trace; never claim data is safe without evidence; never use “Try again” as the only instruction when another action is required; never tell users to clear browser storage, reset the app, delete IndexedDB/LocalStorage, or remove files as generic troubleshooting; never silently overwrite conflicts or discard pending changes; never expose OAuth tokens, JWTs, API keys, private URLs, or personal content.

Toasts, modals, confirmations, validation, loading, empty, conflict, and recovery UI follow this rule. Keep the first explanation concise, with optional detail for diagnosis.

## 10. Motion and interaction

Use subtle purposeful motion for hierarchy and feedback. All controls must communicate hover, focus, pressed, disabled, loading, and relevant success/error states. Tactile/pressed-paper behavior is optional and restrained. Avoid continuous animation, heavy parallax, expensive blur, WebGL/canvas decoration, layout thrashing, or motion that delays tasks. Respect prefers-reduced-motion. Motion must never delay navigation, saving, chapter opening, or PDF work.

## 11. Responsive design, accessibility, and performance

Support desktop, tablet, mobile, English, and Arabic. Use semantic controls, logical keyboard flow, visible focus, accessible names, and useful touch targets. Never rely on color alone. Verify contrast on Ink/Charcoal and Warm Paper surfaces, zoom/resizing, long strings, and PDF canvas/annotation interactions. Prefer optimized CSS/SVG and existing project capabilities. Add packages only with justification and permission under GEMINI.md. Establish before/after performance evidence; avoid oversized textures, repeated DOM decoration, expensive effects, and heavy animation. Do not reintroduce UI lag.

## 12. Engineering boundaries

This document approves design direction, not destructive rewrites.

Before code changes, audit every screen, route/panel, component, dialog, toast, context menu, empty/loading/error state, and responsive variant. Map existing DOM IDs, selectors, classes, data attributes, delegated events, inline handlers, function entry points, state stores, persistence paths, service integrations, and relevant tests. Capture representative visual baselines without personal data.

Implement incrementally by screen/system. Preserve existing IDs, event wiring, handlers, data contracts, storage formats, account boundaries, permissions, integrations, and feature behavior unless a separate reviewed task authorizes a change. Keep visual work separate from data model, OAuth, Google Drive, Supabase, RLS, and sync-engine changes. No database schema/migrations in a visual-only task. Never remove or weaken tests. If the current code conflicts with this brief or a UI change requires changing storage/auth/sync/business rules, document the dependency and stop for owner review.

## 13. Acceptance standard

At minimum:
- All existing screens/workflows are mapped; no existing feature disappears unintentionally.
- Personal Study Journal direction is coherent throughout.
- English is first-run default only when no saved preference exists; Arabic is fully supported.
- RTL/LTR are intentionally designed and tested.
- Navigation and primary tasks are easy to discover and complete.
- Chapter resources, collections, resume behavior, and integrated PDF Studio preserve data and work with real app state.
- Save/sync states are truthful and actionable; recovery is safe.
- Desktop/tablet/mobile, accessibility, and reduced-motion checks pass.
- Existing security, storage, account isolation, cloud, PDF, regression, and E2E tests remain passing.
- Performance is compared with the pre-redesign baseline.
- Evidence is tied to exact source SHA and environment.
- Owner reviews and approves; Gemini never self-approves.

**Authority:** This file governs visual/UX direction. GEMINI.md governs engineering safety and permissions. reports/CURRENT.md governs active phase and next authorized action.
