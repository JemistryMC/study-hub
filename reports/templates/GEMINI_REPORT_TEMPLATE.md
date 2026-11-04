# Gemini Engineering Report — <PHASE>

## 1. Delivery Identity

- Phase:
- Base Commit SHA:
- Local resulting commit SHA (if created):
- GitHub branch:
- GitHub code commit SHA (must contain actual modified files):
- Patch file path (if applicable):
- Report date/time:

## 2. Scope

- Requirements implemented:
- Requirements not implemented:
- Files changed:
- Historical migrations modified:
- New forward migrations added:

## 3. Test Evidence

| Command | Runtime / Version | Passed | Failed | Evidence |
| --- | --- | ---: | ---: | --- |
| | | | | |

- Full test command:
- Exact tested commit SHA:
- GitHub Actions run URL:
- PostgreSQL server version:
- Chromium / Playwright version:

## 4. Database Migration Paths

- Fresh Install (Path A):
- Existing Upgrade (Path B):
- Identity used to run each migration:
- Auth schema ownership / ACL evidence:
- Function ownership evidence:
- Rollback implications:
- Was any live Supabase project accessed? (Yes/No; explain)

## 5. Security and Compatibility

- RLS checks:
- Role membership / SET ROLE checks:
- ACL checks:
- JWT / PostgREST checks actually performed:
- Tests simulated locally only:
- Remaining limitations:

## 6. Exact Evidence

Paste relevant unedited command output or link to retained logs. Do not summarize a test as passed unless it was actually executed.

## 7. Explicit Status

Choose one:
- Implemented and locally tested
- Implemented; some tests not run
- Patch prepared but not applied to project files
- Blocked

Do not claim GitHub CI success unless the run tested the exact code commit SHA listed above.
