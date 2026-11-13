// ============================================================================
// Exo Academic Platform — WP 6.4 Pure Logic Unit Tests (node:test)
// Tests extracted production Explain, Guide & Recover helpers:
//   - Secret redaction (`exoRedactDiagnosticText`, `sanitizeTechnicalErrorDetail`)
//   - Retry-After parsing (`exoParseRetryAfterSeconds`)
//   - Incident classification & bilingual recovery guidance (`classifyWorkspaceIncident`, `classifySupabaseError`)
//   - 2-axis Local Durability vs Cloud Sync truth model (`deriveWorkspaceSaveSyncModel`)
//   - PDF Studio header save/sync badge state (`deriveStudioSaveBadgeState`)
// ============================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extractTopLevelHelper(fnName, deps = {}) {
  const match = indexHtml.match(new RegExp(`function ${fnName}\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\s{8}\\}`));
  assert.ok(match, `${fnName} must exist in index.html`);
  const depKeys = Object.keys(deps);
  const depVals = Object.values(deps);
  return new Function(...depKeys, `${match[0]}; return ${fnName};`)(...depVals);
}

test('WP 6.4: exoRedactDiagnosticText and sanitizeTechnicalErrorDetail redact JWTs, Drive tokens, credentials, emails, query strings, and file paths', () => {
  const exoRedactDiagnosticText = extractTopLevelHelper('exoRedactDiagnosticText');
  const sanitizeTechnicalErrorDetail = extractTopLevelHelper('sanitizeTechnicalErrorDetail');

  const rawLeak = [
    'Auth failed Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc_sig123',
    'Drive ya29.a0AfB_bySecretTokenValue12345',
    'apikey=super_secret_supabase_key&access_token=tok_xyz',
    'Basic dXNlcjpwYXNz',
    'password=MySecretPassword! user: student.name@pharma.edu.eg',
    'https://api.example.com/upload?token=secretQuery123&expires=999',
    'at pushWorkspace (file:///Users/owner/dev/exo/index.html:4200:12)',
    'X'.repeat(500)
  ].join(' | ');

  for (const redactor of [exoRedactDiagnosticText, sanitizeTechnicalErrorDetail]) {
    const clean = redactor(rawLeak);
    assert.ok(!clean.includes('eyJhbGci'), 'JWT must be redacted');
    assert.ok(!clean.includes('ya29.a0AfB'), 'Google Drive OAuth token must be redacted');
    assert.ok(!clean.includes('super_secret_supabase_key'), 'apikey must be redacted');
    assert.ok(!clean.includes('tok_xyz'), 'access_token must be redacted');
    assert.ok(!clean.includes('dXNlcjpwYXNz'), 'Basic auth payload must be redacted');
    assert.ok(!clean.includes('MySecretPassword'), 'Password must be redacted');
    assert.ok(!clean.includes('student.name@pharma.edu.eg'), 'Email must be redacted');
    assert.ok(!clean.includes('secretQuery123'), 'URL query string must be redacted');
    assert.ok(!clean.includes('/Users/owner/dev/exo'), 'Local filesystem path/stack must be redacted');
    assert.ok(clean.length <= 320, 'Redacted string length must be bounded');
  }

  assert.equal(exoRedactDiagnosticText(null), '');
  assert.ok(exoRedactDiagnosticText({ message: 'Token ya29.abcSecret', details: 'email a@b.co' }).includes('ya29.[REDACTED]'));
});

test('WP 6.4: exoParseRetryAfterSeconds parses numeric headers, HTTP dates, and message hints safely', () => {
  const exoParseRetryAfterSeconds = extractTopLevelHelper('exoParseRetryAfterSeconds');

  assert.equal(exoParseRetryAfterSeconds({ retryAfterSec: 42 }), 42);
  assert.equal(exoParseRetryAfterSeconds({ headers: { get: (k) => (k.toLowerCase() === 'retry-after' ? '27' : '') } }), 27);
  assert.equal(exoParseRetryAfterSeconds({ headers: { 'Retry-After': '9999' } }), 3600);

  const futureDate = new Date(Date.now() + 30000).toUTCString();
  const parsedFuture = exoParseRetryAfterSeconds({ headers: { 'Retry-After': futureDate } });
  assert.ok(parsedFuture >= 20 && parsedFuture <= 35, `Expected ~30s, got ${parsedFuture}`);

  assert.equal(exoParseRetryAfterSeconds({ message: '429 Too Many Requests; Retry-After: 18' }), 18);
  assert.equal(exoParseRetryAfterSeconds({ message: 'generic error' }), 0);
});

test('WP 6.4: classifyWorkspaceIncident handles all failure classes, certainty labels, Drive/Supabase contexts, redaction, and safe guidance', () => {
  const exoRedactDiagnosticText = extractTopLevelHelper('exoRedactDiagnosticText');
  const exoParseRetryAfterSeconds = extractTopLevelHelper('exoParseRetryAfterSeconds');
  const classifyWorkspaceIncident = extractTopLevelHelper('classifyWorkspaceIncident', {
    exoRedactDiagnosticText,
    exoParseRetryAfterSeconds
  });

  const cases = [
    { name: 'offline_msg', err: new Error('TypeError: Failed to fetch'), ctx: { domain: 'cloud_sync' }, expectedCat: 'offline', expectedCertainty: 'likely' },
    { name: 'rate_limited_429', err: { status: 429, headers: { 'Retry-After': '33' }, message: 'Too Many Requests' }, ctx: { domain: 'cloud_sync' }, expectedCat: 'rate_limited', expectedRetrySec: 33 },
    { name: 'timeout_504', err: { status: 504, message: 'Gateway timeout' }, ctx: { domain: 'cloud_sync' }, expectedCat: 'timeout' },
    { name: 'unauthorized_cloud', err: { status: 401, message: 'JWT expired eyJhbGciOiJIUzI1NiJ9.abc123456.sig' }, ctx: { domain: 'cloud_sync' }, expectedCat: 'unauthorized', expectAction: 'sign_in' },
    { name: 'unauthorized_drive', err: { status: 401, message: 'Invalid Google Drive token ya29.secretToken99' }, ctx: { domain: 'drive_media' }, expectedCat: 'unauthorized', expectAction: 'activate_drive' },
    { name: 'permission_403_rls', err: { status: 403, code: '42501', message: 'permission denied for row-level security' }, ctx: { domain: 'cloud_sync' }, expectedCat: 'permission_denied' },
    { name: 'quota_exceeded', err: { name: 'QuotaExceededError', message: 'QuotaExceededError DOMException' }, ctx: { domain: 'subjects' }, expectedCat: 'quota_exceeded', expectedSeverity: 'critical' },
    { name: 'idb_write_failed', err: new Error('IDB_PERSIST_FAILED'), ctx: { domain: 'subjects', idbFailed: true }, expectedCat: 'idb_write_failed', expectedSeverity: 'critical' },
    { name: 'idb_read_failed', err: new Error('DURABLE_JOURNAL_READ_FAILED'), ctx: { domain: 'cloud_sync', idbFailed: true, isRead: true }, expectedCat: 'idb_read_failed', expectedSeverity: 'critical' },
    { name: 'storage_unavailable', err: { name: 'SecurityError', message: 'storage blocked' }, ctx: { diag: { reason: 'storage_unavailable' } }, expectedCat: 'storage_unavailable' },
    { name: 'quarantined', err: new Error('rollback_failed_quarantine'), ctx: { domain: 'import' }, expectedCat: 'quarantined', expectedSeverity: 'critical' },
    { name: 'occ_conflict', err: new Error('OCC conflict'), ctx: { rpcResponse: { status: 'conflict' } }, expectedCat: 'occ_conflict', expectAction: 'review_conflicts' },
    { name: 'conflict_needs_review', err: new Error('conflict_merge_failed'), ctx: { domain: 'cloud_sync' }, expectedCat: 'conflict_needs_review' },
    { name: 'drive_not_found_404', err: { status: 404, message: 'File not found' }, ctx: { domain: 'drive_media' }, expectedCat: 'not_found' },
    { name: 'missing_rpc_404', err: { status: 404, code: 'PGRST202', message: 'Could not find the function sync_workspace_with_concurrency' }, ctx: { domain: 'cloud_sync' }, expectedCat: 'missing_rpc' },
    { name: 'signature_mismatch', err: { code: '42883', message: 'function signature mismatch' }, ctx: { domain: 'cloud_sync' }, expectedCat: 'function_signature_mismatch' },
    { name: 'schema_cache', err: { code: 'PGRST204', message: 'Could not find in schema cache' }, ctx: { domain: 'cloud_sync' }, expectedCat: 'postgrest_schema_cache' },
    { name: 'invalid_payload', err: { code: '22P02', status: 400, message: 'invalid input syntax' }, ctx: { domain: 'cloud_sync' }, expectedCat: 'invalid_payload' },
    { name: 'causal_stamp_failed', err: new Error('CAUSAL_AUTO_STAMP_FAILED'), ctx: { domain: 'cloud_sync' }, expectedCat: 'causal_stamp_failed' },
    { name: 'server_error_502', err: { status: 502, message: '502 Bad Gateway' }, ctx: { domain: 'cloud_sync' }, expectedCat: 'server_error' },
    { name: 'unknown_fallback', err: new Error('Something strange happened'), ctx: { domain: 'cloud_sync' }, expectedCat: 'unknown', expectedCertainty: 'unknown' }
  ];

  for (const tc of cases) {
    const inc = classifyWorkspaceIncident(tc.err, tc.ctx.rpcResponse || null, tc.ctx);
    assert.equal(inc.category, tc.expectedCat, `${tc.name}: expected category ${tc.expectedCat}, got ${inc.category}`);
    if (tc.expectedCertainty) assert.equal(inc.certainty, tc.expectedCertainty, `${tc.name}: certainty mismatch`);
    if (tc.expectedSeverity) assert.equal(inc.severity, tc.expectedSeverity, `${tc.name}: severity mismatch`);
    if (tc.expectedRetrySec) assert.equal(inc.retryAfterSec, tc.expectedRetrySec, `${tc.name}: retryAfterSec mismatch`);
    if (tc.expectAction) assert.ok(inc.recoveryActionIds.includes(tc.expectAction), `${tc.name}: missing recovery action ${tc.expectAction}`);

    // Bilingual completeness & zero raw secrets
    assert.ok(inc.titleEn && inc.titleAr, `${tc.name}: requires both EN & AR titles`);
    assert.ok(inc.whatHappenedEn && inc.whatHappenedAr, `${tc.name}: requires both EN & AR explanation`);
    assert.ok(inc.causeEn && inc.causeAr, `${tc.name}: requires both EN & AR cause`);
    assert.ok(inc.localSafetyEn && inc.localSafetyAr, `${tc.name}: requires both EN & AR local safety`);
    assert.ok(inc.cloudSafetyEn && inc.cloudSafetyAr, `${tc.name}: requires both EN & AR cloud safety`);
    assert.ok(Array.isArray(inc.stepsEn) && inc.stepsEn.length >= 1, `${tc.name}: requires stepsEn`);
    assert.ok(Array.isArray(inc.stepsAr) && inc.stepsAr.length >= 1, `${tc.name}: requires stepsAr`);
    assert.ok(!inc.technicalDetail.includes('eyJhbGci') && !inc.technicalDetail.includes('ya29.secretToken99'), `${tc.name}: secrets must be redacted`);

    // Must never advise destructive browser storage wipe
    const joinedSteps = [...inc.stepsEn, ...inc.stepsAr].join(' | ');
    assert.ok(!/clear browser storage|delete indexeddb|wipe localstorage|reset the app|امسح المتصفح|احذف ذاكرة المتصفح/i.test(joinedSteps),
      `${tc.name}: guidance must never advise destructive browser storage clearing`);
  }

  // Verify classifySupabaseError also supports 429 rate limiting while remaining self-contained
  const sanitizeTechnicalErrorDetail = extractTopLevelHelper('sanitizeTechnicalErrorDetail');
  const classifySupabaseError = extractTopLevelHelper('classifySupabaseError', { sanitizeTechnicalErrorDetail });
  const sup429 = classifySupabaseError({ status: 429, message: 'Too many requests' });
  assert.equal(sup429.category, 'rate_limited');
  assert.equal(sup429.preservesDirty, true);
});

test('WP 6.4: deriveWorkspaceSaveSyncModel strictly separates Local Durability from Cloud Sync and never guesses Synced', () => {
  const deriveWorkspaceSaveSyncModel = extractTopLevelHelper('deriveWorkspaceSaveSyncModel');

  // 1. Online & logged in WITHOUT server acknowledgement -> must NEVER say synced
  const unconfirmed = deriveWorkspaceSaveSyncModel({
    isLoggedIn: true,
    hasRemoteClient: true,
    isOnline: true,
    localVerified: true,
    cloudAckConfirmed: false,
    hasDirtyWorkspace: false
  });
  assert.equal(unconfirmed.local.state, 'saved_local');
  assert.notEqual(unconfirmed.cloud.state, 'synced');
  assert.equal(unconfirmed.cloud.state, 'unknown');

  // 2. LocalStorage quota overflow saved cleanly via IndexedDB fallback while cloud failed offline
  const lsOverflowIdbSaved = deriveWorkspaceSaveSyncModel({
    isLoggedIn: true,
    hasRemoteClient: true,
    isOnline: false,
    localVerified: true,
    idbPersisted: true,
    localMethod: 'idb_fallback',
    localStorageFailed: true,
    hasDirtyWorkspace: true
  });
  assert.equal(lsOverflowIdbSaved.local.state, 'saved_local');
  assert.ok(lsOverflowIdbSaved.local.labelEn.includes('IndexedDB'));
  assert.ok(lsOverflowIdbSaved.local.labelAr.includes('IndexedDB'));
  assert.equal(lsOverflowIdbSaved.cloud.state, 'offline');
  assert.ok(lsOverflowIdbSaved.cloud.labelEn.includes('Sync pending'));

  // 3. Total local persistence failure -> local_failed even if stale flags existed
  const totalLocalFail = deriveWorkspaceSaveSyncModel({
    isLoggedIn: true,
    hasRemoteClient: true,
    isOnline: true,
    localVerified: true,
    localSaveFailed: true,
    hasDirtyWorkspace: true
  });
  assert.equal(totalLocalFail.local.state, 'local_failed');
  assert.equal(totalLocalFail.cloud.state, 'pending_sync');

  // 4. Explicit activeErrorCategory='offline' even when navigator.onLine appears true
  const networkDropWhileOnline = deriveWorkspaceSaveSyncModel({
    isLoggedIn: true,
    hasRemoteClient: true,
    isOnline: true,
    localVerified: true,
    activeErrorCategory: 'offline',
    hasDirtyAnnotations: true
  });
  assert.equal(networkDropWhileOnline.cloud.state, 'offline');
  assert.equal(networkDropWhileOnline.local.state, 'saved_local');

  // 5. Rate limited countdown
  const rateLimited = deriveWorkspaceSaveSyncModel({
    isLoggedIn: true,
    hasRemoteClient: true,
    isOnline: true,
    localVerified: true,
    rateLimitUntilMs: 50000,
    nowMs: 25000
  });
  assert.equal(rateLimited.cloud.state, 'rate_limited');
  assert.ok(rateLimited.cloud.labelEn.includes('25s'));

  // 6. Quarantined blocks cloud even if clean flags absent
  const quarantined = deriveWorkspaceSaveSyncModel({
    isLoggedIn: true,
    hasRemoteClient: true,
    isOnline: true,
    localVerified: true,
    isQuarantined: true
  });
  assert.equal(quarantined.cloud.state, 'quarantined');

  // 7. Confirmed server ACK -> synced with revision
  const syncedOk = deriveWorkspaceSaveSyncModel({
    isLoggedIn: true,
    hasRemoteClient: true,
    isOnline: true,
    localVerified: true,
    cloudAckConfirmed: true,
    cloudRevision: 14,
    hasDirtyWorkspace: false,
    hasDirtyAnnotations: false
  });
  assert.equal(syncedOk.local.state, 'saved_local');
  assert.equal(syncedOk.cloud.state, 'synced');
  assert.ok(syncedOk.cloud.labelEn.includes('v14'));

  // 8. Logged out vs Local-only account
  const loggedOut = deriveWorkspaceSaveSyncModel({ isLoggedIn: false, localVerified: true });
  assert.equal(loggedOut.cloud.state, 'logged_out');
  const localOnly = deriveWorkspaceSaveSyncModel({ isLoggedIn: true, isLocalOnlyAccount: true, localVerified: true });
  assert.equal(localOnly.cloud.state, 'local_only');
});

test('WP 6.4: deriveStudioSaveBadgeState distinguishes local device saving, failure, preview-only, local+sync issue, and verified sync', () => {
  const deriveStudioSaveBadgeState = extractTopLevelHelper('deriveStudioSaveBadgeState');

  assert.equal(deriveStudioSaveBadgeState({ localSaveFailed: true }).state, 'local_save_failed');
  assert.equal(deriveStudioSaveBadgeState({ localSaving: true }).state, 'saving_device');
  assert.equal(deriveStudioSaveBadgeState({ hasPendingLocalEdits: true }).state, 'pending_edits');
  assert.equal(deriveStudioSaveBadgeState({ isPreviewOnly: true }).state, 'preview_only');

  const idbOnly = deriveStudioSaveBadgeState({ localVerified: true, lastLocalMethod: 'idb_fallback' });
  assert.equal(idbOnly.state, 'idb_backup_saved');
  assert.ok(idbOnly.labelEn.includes('IndexedDB'));

  const deviceSafeSyncErr = deriveStudioSaveBadgeState({
    isLoggedIn: true,
    isLocalOnlyAccount: false,
    localVerified: true,
    activeErrorCategory: 'unauthorized'
  });
  assert.equal(deviceSafeSyncErr.state, 'sync_failed');
  assert.ok(deviceSafeSyncErr.labelEn.includes('Saved on device'));

  const synced = deriveStudioSaveBadgeState({
    isLoggedIn: true,
    isOnline: true,
    localVerified: true,
    cloudAckConfirmed: true,
    hasDirtyWorkspace: false,
    hasDirtyAnnotations: false
  });
  assert.equal(synced.state, 'synced_device');
  assert.equal(deriveStudioSaveBadgeState({}).state, 'ready');
});
