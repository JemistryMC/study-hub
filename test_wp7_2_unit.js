// ============================================================================
// Exo Personal Study Journal — Phase 7 / WP 7.2 Unit Tests
// Workspace-Native Resource Intake & Data Model Compatibility
// Verifies pure intake logic, URL security validation, truthful recovery copy,
// additive group.resources[] compatibility, causal resource merging, and
// structural invariants using Node's built-in test runner.
// ============================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extractFunctionSource(fnName) {
  const lineAnchorRegex = new RegExp(`(?:async\\s+)?function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n        \\}`);
  const anchored = indexHtml.match(lineAnchorRegex);
  if (anchored) return anchored[0];
  const regex = new RegExp(`(?:async\\s+)?function\\s+${fnName}\\s*\\(`);
  const match = regex.exec(indexHtml);
  assert.ok(match, `Expected function ${fnName} in index.html`);
  const start = match.index;
  const endMarker = indexHtml.indexOf('\n        }', start);
  assert.ok(endMarker > start, `Expected closing brace for ${fnName}`);
  return indexHtml.slice(start, endMarker + '\n        }'.length);
}

function loadHelpers(names) {
  const sources = names.map(n => extractFunctionSource(n)).join('\n\n');
  const factory = new Function(`${sources}\nreturn { ${names.join(', ')} };`);
  return factory();
}

test('WP 7.2: exoValidateResourceUrl accepts http/https, detects Google Drive, and blocks unsafe schemes', () => {
  const { exoValidateResourceUrl } = loadHelpers(['exoValidateResourceUrl']);

  const driveRes = exoValidateResourceUrl('https://drive.google.com/file/d/1abcXYZ/view?usp=sharing');
  assert.equal(driveRes.valid, true);
  assert.equal(driveRes.isDriveLink, true);
  assert.equal(driveRes.host, 'drive.google.com');

  const docsRes = exoValidateResourceUrl('https://docs.google.com/document/d/abc123/edit');
  assert.equal(docsRes.valid, true);
  assert.equal(docsRes.isDriveLink, true);

  const webRes = exoValidateResourceUrl('  https://pubmed.ncbi.nlm.nih.gov/123456/  ');
  assert.equal(webRes.valid, true);
  assert.equal(webRes.isDriveLink, false);
  assert.equal(webRes.host, 'pubmed.ncbi.nlm.nih.gov');
  assert.equal(webRes.normalizedUrl, 'https://pubmed.ncbi.nlm.nih.gov/123456/');

  const httpRes = exoValidateResourceUrl('http://example.org/notes');
  assert.equal(httpRes.valid, true);
  assert.equal(httpRes.isDriveLink, false);

  // Blocked schemes & invalid inputs
  assert.equal(exoValidateResourceUrl('').valid, false);
  assert.equal(exoValidateResourceUrl('').reason, 'empty');

  const jsUrl = exoValidateResourceUrl('javascript:alert(document.cookie)');
  assert.equal(jsUrl.valid, false);
  assert.equal(jsUrl.reason, 'unsafe_scheme');

  const dataUrl = exoValidateResourceUrl('data:text/html,<script>alert(1)</script>');
  assert.equal(dataUrl.valid, false);
  assert.equal(dataUrl.reason, 'unsafe_scheme');

  const fileUrl = exoValidateResourceUrl('file:///etc/passwd');
  assert.equal(fileUrl.valid, false);
  assert.equal(fileUrl.reason, 'unsafe_scheme');

  const malformed = exoValidateResourceUrl('not-a-valid-url');
  assert.equal(malformed.valid, false);
  assert.equal(malformed.reason, 'malformed');

  const ftpUrl = exoValidateResourceUrl('ftp://files.example.org/slides.pdf');
  assert.equal(ftpUrl.valid, false);
  assert.equal(ftpUrl.reason, 'unsupported_protocol');
});

test('WP 7.2: exoNormalizeChapterResourceRecord normalizes all 4 resource types cleanly', () => {
  const { exoNormalizeChapterResourceRecord } = loadHelpers(['exoNormalizeChapterResourceRecord']);
  const fixedNow = 1760000000000;

  const pdfRec = exoNormalizeChapterResourceRecord({
    id: 'res_pdf_1',
    type: 'pdf',
    title: '  Autonomic Slides  ',
    fileName: 'autonomic.pdf',
    fileSize: 4096
  }, fixedNow);
  assert.equal(pdfRec.id, 'res_pdf_1');
  assert.equal(pdfRec.type, 'pdf');
  assert.equal(pdfRec.title, 'Autonomic Slides');
  assert.equal(pdfRec.storageKey, 'res_pdf_1');
  assert.equal(pdfRec.lastPageNum, 1);
  assert.deepEqual(pdfRec.customPages, []);
  assert.deepEqual(pdfRec.bookmarkedSlides, []);
  assert.deepEqual(pdfRec.recordings, []);

  const audRec = exoNormalizeChapterResourceRecord({
    id: 'res_aud_1',
    type: 'audio',
    title: 'Section Review',
    fileName: 'review.mp3',
    fileSize: 2048
  }, fixedNow);
  assert.equal(audRec.type, 'audio');
  assert.equal(audRec.storageKey, 'res_aud_1');
  assert.equal(audRec.lastAudioSec, 0);

  const lnkRec = exoNormalizeChapterResourceRecord({
    id: 'res_lnk_1',
    type: 'link',
    title: 'Drive Handout',
    url: 'https://drive.google.com/file/d/xyz/view',
    host: 'drive.google.com',
    isDriveLink: true
  }, fixedNow);
  assert.equal(lnkRec.type, 'link');
  assert.equal(lnkRec.isDriveLink, true);

  const noteRec = exoNormalizeChapterResourceRecord({
    id: 'res_note_1',
    type: 'note',
    title: 'Drug Mnemonics',
    content: 'Beta blockers: -olol'
  }, fixedNow);
  assert.equal(noteRec.type, 'note');
  assert.equal(noteRec.content, 'Beta blockers: -olol');
});

test('WP 7.2: exoBuildResourceIntakeModel validates fields, defaults audio to independent, and preserves truthful storage notices', () => {
  const { exoValidateResourceUrl, exoBuildResourceIntakeModel } = loadHelpers([
    'exoValidateResourceUrl',
    'exoBuildResourceIntakeModel'
  ]);
  assert.ok(typeof exoValidateResourceUrl === 'function');

  // PDF auto-title from filename + valid size
  const validPdf = exoBuildResourceIntakeModel('pdf', {
    title: '',
    fileName: 'Lecture 04 Pharmacology.pdf',
    fileSize: 1024,
    fileType: 'application/pdf',
    hasFile: true
  }, { isSignedIn: true, canUploadMedia: false });
  assert.equal(validPdf.valid, true);
  assert.equal(validPdf.normalizedTitle, 'Lecture 04 Pharmacology');
  assert.equal(validPdf.storageNoticeKey, 'media_local_free_account');

  // PDF rejects non-PDF file
  const badPdf = exoBuildResourceIntakeModel('pdf', {
    title: 'Photo',
    fileName: 'image.png',
    fileSize: 5000,
    fileType: 'image/png',
    hasFile: true
  }, { isSignedIn: false, canUploadMedia: false });
  assert.equal(badPdf.valid, false);
  assert.ok(badPdf.errors.some(e => e.code === 'pdf_invalid_type'));

  // Audio defaults to independent (__independent__ -> null targetLectureId)
  const indAudio = exoBuildResourceIntakeModel('audio', {
    title: 'Quick Voice Summary',
    fileName: 'summary.mp3',
    fileSize: 4096,
    fileType: 'audio/mpeg',
    hasFile: true,
    targetLectureId: '__independent__'
  }, { isSignedIn: true, canUploadMedia: true });
  assert.equal(indAudio.valid, true);
  assert.equal(indAudio.targetLectureId, null);
  assert.equal(indAudio.storageNoticeKey, 'media_local_with_vip_drive_option');

  // Audio explicit attachment passes targetLectureId cleanly
  const linkedAudio = exoBuildResourceIntakeModel('audio', {
    title: 'Attached Rec',
    fileName: 'rec.m4a',
    fileSize: 4096,
    fileType: 'audio/mp4',
    hasFile: true,
    targetLectureId: 'lec_55'
  }, { isSignedIn: false, canUploadMedia: false });
  assert.equal(linkedAudio.valid, true);
  assert.equal(linkedAudio.targetLectureId, 'lec_55');
  assert.equal(linkedAudio.storageNoticeKey, 'media_local_guest');

  // Link rejects unsafe URL
  const badLink = exoBuildResourceIntakeModel('link', {
    title: 'Evil Link',
    url: 'javascript:void(0)'
  }, { isSignedIn: true, canUploadMedia: false });
  assert.equal(badLink.valid, false);
  assert.ok(badLink.errors.some(e => e.code === 'url_unsafe_scheme'));

  // Note requires non-empty content and title
  const emptyNote = exoBuildResourceIntakeModel('note', { title: 'Empty', content: '   ' }, { isSignedIn: false });
  assert.equal(emptyNote.valid, false);
  assert.ok(emptyNote.errors.some(e => e.code === 'note_content_required'));

  const validNote = exoBuildResourceIntakeModel('note', { title: 'Key Takeaways', content: '1. Cholinergic agonists' }, { isSignedIn: true });
  assert.equal(validNote.valid, true);
  assert.equal(validNote.storageNoticeKey, 'metadata_local_and_sync');
});

test('WP 7.2: exoEvaluateResourceSaveFeedback provides truthful Explain, Guide & Recover messages and NEVER advises clearing storage/reset', () => {
  const { exoEvaluateResourceSaveFeedback } = loadHelpers(['exoEvaluateResourceSaveFeedback']);

  const localOk = exoEvaluateResourceSaveFeedback({ ok: true, syncStatus: 'local_only' }, { isAr: false, resourceType: 'pdf' });
  assert.equal(localOk.status, 'saved_local');
  assert.match(localOk.headline, /locally/i);
  assert.doesNotMatch(localOk.headline, /synced/i);

  const syncedOk = exoEvaluateResourceSaveFeedback({ ok: true, syncStatus: 'synced' }, { isAr: false, resourceType: 'note' });
  assert.equal(syncedOk.status, 'saved_and_synced');
  assert.match(syncedOk.headline, /synced/i);

  const scenarios = [
    { outcome: { ok: false, code: 'quota_exceeded', message: 'QuotaExceededError' }, isAr: false },
    { outcome: { ok: false, code: 'quota_exceeded', message: 'QuotaExceededError' }, isAr: true },
    { outcome: { ok: false, code: 'auth_session_changed', message: 'Session changed' }, isAr: false },
    { outcome: { ok: false, code: 'invalid_pdf_blob', message: 'Bad header' }, isAr: false },
    { outcome: { ok: false, code: 'idb_write_failed', message: 'Write aborted' }, isAr: false },
    { outcome: { ok: false, code: 'idb_write_failed', message: 'Write aborted' }, isAr: true }
  ];

  const forbiddenAdvice = /clear\s+(?:browser\s+)?storage|delete\s+indexeddb|reset\s+(?:the\s+)?app|مسح\s+(?:التخزين|المتصفح|IndexedDB)|إعادة\s+ضبط\s+التطبيق/i;
  for (const s of scenarios) {
    const fb = exoEvaluateResourceSaveFeedback(s.outcome, { isAr: s.isAr, resourceType: 'pdf' });
    assert.equal(fb.tone, 'error');
    assert.ok(fb.headline.length > 5);
    assert.ok(fb.cause.length > 5);
    assert.ok(fb.dataSafetyState.length > 5);
    assert.ok(Array.isArray(fb.nextSteps) && fb.nextSteps.length >= 1);
    const allText = `${fb.headline} ${fb.cause} ${fb.dataSafetyState} ${fb.nextSteps.join(' ')}`;
    assert.equal(forbiddenAdvice.test(allText), false, `Forbidden troubleshooting advice found: ${allText}`);
  }
});

test('WP 7.2: Chapter Workspace models integrate standalone group.resources[] seamlessly while preserving legacy lectures', () => {
  const {
    buildChapterWorkspaceSummary,
    resolveResumableChapterSession,
    buildUnifiedChapterResources,
    filterAndSortChapterResources,
    buildChapterContextSnapshot,
    findChapterStudioItem
  } = loadHelpers([
    'buildChapterWorkspaceSummary',
    'resolveResumableChapterSession',
    'buildUnifiedChapterResources',
    'filterAndSortChapterResources',
    'buildChapterContextSnapshot',
    'findChapterStudioItem'
  ]);

  const sub = { id: 10, name: 'Pharmacology', examLectureIds: ['res_pdf_standalone'] };
  const group = {
    id: 101,
    name: 'Chapter 1: Autonomic',
    lectures: [], // Zero legacy lectures!
    resources: [
      { id: 'res_pdf_standalone', type: 'pdf', title: 'Autonomic PDF', storageKey: 'res_pdf_standalone', fileName: 'auto.pdf', fileSize: 5000, lastPageNum: 4, totalPages: 20, lastStudiedAt: 1000, customPages: [], bookmarkedSlides: [4], recordings: [] },
      { id: 'res_aud_standalone', type: 'audio', title: 'Chapter Audio Summary', storageKey: 'res_aud_standalone', fileName: 'summary.mp3', fileSize: 3000 },
      { id: 'res_lnk_standalone', type: 'link', title: 'Drive Reference', url: 'https://drive.google.com/file/d/123/view', host: 'drive.google.com', isDriveLink: true },
      { id: 'res_note_standalone', type: 'note', title: 'Key Drug List', content: 'Atropine blocks M receptors' }
    ]
  };

  const localPdfs = new Set(['res_pdf_standalone']);
  const localAudios = new Set(['res_aud_standalone']);

  const summary = buildChapterWorkspaceSummary(sub, group, 0, [], {}, null);
  assert.equal(summary.totalLectures, 0);
  assert.equal(summary.standaloneResourceCount, 4);
  assert.equal(summary.standalonePdfCount, 1);
  assert.equal(summary.standaloneAudioCount, 1);
  assert.equal(summary.standaloneLinkCount, 1);
  assert.equal(summary.standaloneNoteCount, 1);
  assert.equal(summary.pdfCount, 1);
  assert.equal(summary.recordingCount, 1);
  assert.equal(summary.linkCount, 1);
  assert.equal(summary.hasAnyContent, true);
  assert.deepEqual(summary.examOverlapIds, ['res_pdf_standalone']);

  // Resumable session picks standalone PDF even with zero legacy lectures!
  const resume = resolveResumableChapterSession(sub, group, localPdfs, localAudios);
  assert.equal(resume.hasLectures, true);
  assert.equal(resume.isStandaloneResource, true);
  assert.equal(resume.lecture.id, 'res_pdf_standalone');
  assert.equal(resume.pageNum, 4);
  assert.equal(resume.pdfStatus, 'local');

  // Unified resources includes all 4 standalone types + derived bookmark
  const unified = buildUnifiedChapterResources(sub, group, localPdfs, localAudios, {});
  assert.ok(unified.some(i => i.subKind === 'chapter_pdf' && i.availability === 'ready_local'));
  assert.ok(unified.some(i => i.subKind === 'standalone_audio' && i.availability === 'ready_local'));
  assert.ok(unified.some(i => i.subKind === 'standalone_link' && i.isDriveLink === true));
  assert.ok(unified.some(i => i.subKind === 'written_note' && i.noteContent.includes('Atropine')));
  assert.ok(unified.some(i => i.subKind === 'bookmark' && i.pageNum === 4));

  // Filters: 'pdf' preserves legacy compatibility (pdf+link), while 'pdf_only' and 'link' separate them cleanly
  assert.equal(filterAndSortChapterResources(unified, '', 'pdf', 'order').length, 2);
  assert.equal(filterAndSortChapterResources(unified, '', 'pdf_only', 'order').length, 1);
  assert.equal(filterAndSortChapterResources(unified, '', 'link', 'order').length, 1);
  assert.equal(filterAndSortChapterResources(unified, '', 'audio', 'order').length, 1);
  assert.equal(filterAndSortChapterResources(unified, 'Atropine', 'all', 'order').length, 1);

  // findChapterStudioItem resolves standalone PDF cleanly
  const foundStudio = findChapterStudioItem(group, 'res_pdf_standalone');
  assert.ok(foundStudio);
  assert.equal(foundStudio.isStandaloneResource, true);
  assert.equal(foundStudio.item.title, 'Autonomic PDF');
  assert.equal(findChapterStudioItem(group, 'res_aud_standalone'), null);

  // Context snapshot exposes resources cleanly
  const snap = buildChapterContextSnapshot(sub, group, group.resources[0], {}, []);
  assert.equal(snap.resources.length, 4);
});

test('WP 7.2: exoMergeChapterResourcesArrays merges concurrent additions and prevents resurrection of deleted resources', () => {
  const { exoMergeChapterResourcesArrays } = loadHelpers(['exoMergeChapterResourcesArrays']);

  const localRes = [
    { id: 'r1', type: 'note', title: 'Local Updated Note', content: 'v2', createdAt: 100, updatedAt: 500 },
    { id: 'r2', type: 'link', title: 'Local Only Link', url: 'https://example.org', createdAt: 200, updatedAt: 200 },
    { id: 'r_del', type: 'note', title: 'Stale Note on Local', content: 'old', createdAt: 100, updatedAt: 150 }
  ];
  const remoteRes = [
    { id: 'r1', type: 'note', title: 'Remote Older Note', content: 'v1', createdAt: 100, updatedAt: 300 },
    { id: 'r3', type: 'audio', title: 'Remote Only Audio', createdAt: 250, updatedAt: 250 }
  ];

  const merged = exoMergeChapterResourcesArrays(
    localRes,
    remoteRes,
    {},
    { r_del: 400 } // Deleted on remote at t=400 > local updatedAt=150
  );

  const ids = merged.resources.map(r => r.id);
  assert.deepEqual(ids, ['r1', 'r2', 'r3']);
  assert.equal(merged.resources.find(r => r.id === 'r1').title, 'Local Updated Note');
  assert.equal(merged.deletedResourceIds.r_del, 400);
});

test('WP 7.2: Structural invariants — no dummy Audio Notes lecture, legacy triggerAddLecture preserved, IDB stores & causal tombstones untouched', () => {
  const audioFlowSrc = extractFunctionSource('cwAddAudioRecordingFlow');
  assert.ok(audioFlowSrc.includes('attachAudioRecordingFileToLecture'), 'Explicit per-lecture audio attachment must remain intact');
  assert.ok(audioFlowSrc.includes('openChapterResourceIntakeModal'), 'Chapter-level audio must route to Workspace-Native Resource Intake');
  assert.equal(audioFlowSrc.includes('Audio Notes'), false, 'Must NOT create dummy Audio Notes lectures');
  assert.equal(audioFlowSrc.includes('group.lectures[0]'), false, 'Must NOT auto-attach audio to group.lectures[0]');

  const pdfFlowSrc = extractFunctionSource('cwAddPdfLectureFlow');
  assert.ok(pdfFlowSrc.includes('openChapterResourceIntakeModal'));
  assert.equal(pdfFlowSrc.includes('triggerAddLecture'), false);

  const linkFlowSrc = extractFunctionSource('cwAddWebLinkFlow');
  assert.ok(linkFlowSrc.includes('openChapterResourceIntakeModal'));
  assert.equal(linkFlowSrc.includes('triggerAddLecture'), false);

  assert.ok(indexHtml.includes('function triggerAddLecture('), 'Legacy triggerAddLecture must remain intact');
  assert.ok(indexHtml.includes('id="doubleInputModalOverlay"'), 'Legacy doubleInputModalOverlay must remain intact');
  assert.ok(indexHtml.includes("const ALLOWED_MEDIA_STORES = new Set(['pdfs', 'audios']);"), 'IndexedDB ALLOWED_MEDIA_STORES must remain unchanged');
  const tombstoneMatch = indexHtml.match(/const CAUSAL_TOMBSTONE_ENTITY_TYPES\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(tombstoneMatch, 'CAUSAL_TOMBSTONE_ENTITY_TYPES definition must exist');
  const tombstoneTypes = [...tombstoneMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(
    tombstoneTypes,
    ['subjects', 'groups', 'lectures', 'wird_logs', 'events', 'backlog', 'logs', 'weekly_reports'],
    'CAUSAL_TOMBSTONE_ENTITY_TYPES must remain unchanged'
  );
});
