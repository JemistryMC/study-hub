## Change summary

Describe exactly what changed. Distinguish source-code changes from reports, patches, generated files, and documentation.

## Commit identity

- Base commit SHA:
- Head commit SHA:
- Branch:
- Phase:
- Gemini report path (if applicable):

## Files and database impact

- [ ] Application source files changed
- [ ] Test files changed
- [ ] Supabase migrations changed
- [ ] Historical migration modified (explain why and upgrade implications)
- [ ] Documentation or report only
- List all changed files:

## Verification evidence

- Exact test commands:
- GitHub Actions run URL:
- Exact tested HEAD SHA:
- PostgreSQL version:
- Actual totals (paste exact logs):
- Tests not executed / limitations:

## Migration safety

- [ ] Fresh install path verified
- [ ] Existing upgrade path verified
- [ ] Rollback implications reviewed
- [ ] No production Supabase migration was executed
- [ ] Staging evidence attached where required

## Security and release checklist

- [ ] No secrets, tokens, or .env files included
- [ ] Diff independently reviewed
- [ ] CI passed on this exact code SHA
- [ ] This PR contains actual project file changes (not only a patch artifact)
- [ ] No production deployment is being requested implicitly

## Review decision

Leave merge approval to the repository owner after independent review.
