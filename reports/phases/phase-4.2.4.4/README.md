# Phase 4.2.4.4 — Isolated Bootstrap, Clean Migration Execution & Dual-Path Proof

**Status: Awaiting local Gemini implementation.**

Acceptance requirements:
- Separate authenticated bootstrap and migration-runner connections.
- Disposable, isolated PostgreSQL 16 cluster; never mutate a shared cluster's postgres role.
- Clean Path A: 133622 and 140000 bootstrap, then 150000 and 160000 under authenticated non-superuser postgres, without pre-mutating migration outputs.
- Independent Path B: exact 4.2.3 state, then only 160000 under authenticated non-superuser postgres.
- Isolated ownership-transfer scratch experiment.
- Post-migration catalog/ACL/RLS/trigger verification in both paths.
- Complete logs tied to the exact resulting code SHA.
- No live Supabase access or production migrations.
