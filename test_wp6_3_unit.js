// ============================================================================
// Exo Academic Platform — WP 6.3 Pure Logic Unit Tests (node:test)
// Tests extracted production Chapter Workspace & Study Studio Integration helpers
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

test('WP 6.3: buildChapterWorkspaceSummary aggregates lectures, PDFs, links, recordings, sheets, pins, bookmarks, exam overlap, and sessions', () => {
  const buildChapterWorkspaceSummary = extractTopLevelHelper('buildChapterWorkspaceSummary');

  const empty = buildChapterWorkspaceSummary(null, null, 0, [], {}, null);
  assert.equal(empty.chapterIndexLabel, '01');
  assert.equal(empty.totalLectures, 0);
  assert.equal(empty.pct, 0);
  assert.equal(empty.totalNotesAssets, 0);

  const sub = {
    id: 'sub_pharm',
    name: 'Pharmacology',
    examLectureIds: [101, 999]
  };
  const group = {
    id: 'grp_autonomic',
    name: 'Autonomic Systems',
    lectures: [
      {
        id: 101,
        title: 'Cholinergics',
        path: 'cholinergics.pdf',
        completed: true,
        isDueMock: true,
        recordings: [
          { id: 'r1', name: 'Main Lecture' },
          { id: 'r2', name: 'Section Review' }
        ],
        customPages: [{ id: 'cp1', title: 'Summary Map', afterPage: 2 }],
        bookmarkedSlides: [2, 5]
      },
      {
        id: 102,
        title: 'External Reference Video/Doc',
        path: 'https://example.org/pharma-notes',
        completed: false,
        audioPath: 'https://cdn.example.org/lec2.mp3'
      },
      {
        id: 103,
        title: 'Cloud Driven PDF Lecture',
        path: '',
        cloudPdfUploaded: true,
        completed: false
      },
      {
        id: 104,
        title: 'Unattached Placeholder',
        path: '',
        completed: false
      }
    ]
  };

  const annotationsMap = {
    '101': {
      '1': [{ type: 'pen', points: [] }],
      '2': [{ type: 'highlight', points: [] }],
      'note_2': [{ type: 'pen', points: [] }],
      '_extraNotes': { '2': true, '4': true },
      '_audioPins': [
        { id: 'pin1', timeSec: 45, page: 2, note: 'Key mechanism' },
        { id: 'pin2', timeSec: 120, page: 5, note: 'Side effects' }
      ]
    }
  };

  const events = [
    { id: 'e1', subjectId: 'sub_pharm', lectureId: 101, title: 'Review Lec 1', duration: 1.5, completed: true },
    { id: 'e2', subjectId: 'sub_pharm', title: 'Study Autonomic Systems', duration: 2.0, completed: false },
    { id: 'e3', subjectId: 'other_sub', lectureId: 101, title: 'Ignore cross subject', duration: 4, completed: true }
  ];

  const sum = buildChapterWorkspaceSummary(sub, group, 2, events, annotationsMap, (lec) => ({ isDue: Boolean(lec.isDueMock) }));
  assert.equal(sum.chapterIndexLabel, '03');
  assert.equal(sum.totalLectures, 4);
  assert.equal(sum.doneLectures, 1);
  assert.equal(sum.pct, 25);
  assert.equal(sum.pdfCount, 2); // 101 local path + 103 cloudPdfUploaded
  assert.equal(sum.linkCount, 1); // 102 http link
  assert.equal(sum.missingPdfCount, 1); // 104 empty
  assert.equal(sum.recordingCount, 3); // 2 recordings on 101 + 1 audioPath on 102
  assert.equal(sum.blankPageCount, 1);
  assert.equal(sum.extraSheetCount, 2); // pages 2 and 4
  assert.equal(sum.audioPinCount, 2);
  assert.equal(sum.bookmarkedSlideCount, 2);
  assert.equal(sum.annotatedSlidesCount, 2);
  assert.equal(sum.totalNotesAssets, 7); // 1 blank + 2 extra + 2 pins + 2 bookmarks
  assert.equal(sum.reviewDueCount, 1);
  assert.equal(sum.plannedSessionsCount, 2);
  assert.equal(sum.completedSessionsCount, 1);
  assert.equal(sum.plannedHours, 3.5);
  assert.deepEqual(sum.examOverlapIds, ['101']);
});

test('WP 6.3: resolveResumableChapterSession prioritizes resumable incomplete study position and reports honest reset keys', () => {
  const resolveResumableChapterSession = extractTopLevelHelper('resolveResumableChapterSession');

  const empty = resolveResumableChapterSession({}, { lectures: [] }, new Set(), new Set());
  assert.equal(empty.hasLectures, false);
  assert.equal(empty.hasResumeState, false);
  assert.deepEqual(empty.transientResetKeys, ['zoom', 'activeTool']);

  const group = {
    id: 'g1',
    lectures: [
      { id: 1, title: 'Lec 1 Done', completed: true, lastPageNum: 9, lastStudiedAt: 9999999, path: 'l1.pdf' },
      { id: 2, title: 'Lec 2 Active', completed: false, lastPageNum: 4, totalPages: 12, lastAudioSec: 88, lastStudiedAt: 5000, path: 'l2.pdf', cloudAudioUploaded: true },
      { id: 3, title: 'Lec 3 Unstarted', completed: false, path: 'https://docs.example.org/l3' }
    ]
  };

  const res = resolveResumableChapterSession({ id: 's1' }, group, new Set(['2']), new Set());
  assert.equal(res.hasLectures, true);
  assert.equal(res.lecture.id, 2);
  assert.equal(res.hasResumeState, true);
  assert.equal(res.resumeSource, 'page');
  assert.equal(res.pageNum, 4);
  assert.equal(res.totalPages, 12);
  assert.equal(res.audioSec, 88);
  assert.equal(res.pdfStatus, 'local');
  assert.equal(res.audioStatus, 'cloud_pending');
  assert.deepEqual(res.transientResetKeys, ['zoom', 'activeTool']);

  // Fallback when no progress timestamps exist: pick first incomplete lecture
  const unstartedRes = resolveResumableChapterSession(
    { id: 's1' },
    { id: 'g2', lectures: [{ id: 10, completed: true }, { id: 11, completed: false, path: 'https://example.com/note' }] },
    new Set(),
    new Set()
  );
  assert.equal(unstartedRes.lecture.id, 11);
  assert.equal(unstartedRes.hasResumeState, false);
  assert.equal(unstartedRes.resumeSource, 'next_incomplete');
  assert.equal(unstartedRes.pdfStatus, 'web_link');
});

test('WP 6.3: buildUnifiedChapterResources and filterAndSortChapterResources unify chapter items cleanly without mutating inputs', () => {
  const buildUnifiedChapterResources = extractTopLevelHelper('buildUnifiedChapterResources');
  const filterAndSortChapterResources = extractTopLevelHelper('filterAndSortChapterResources');

  const group = {
    id: 'g_chem',
    name: 'Organic Reactions',
    lectures: [
      {
        id: 201,
        title: 'Alkenes — الألكينات',
        path: 'alkenes.pdf',
        completed: true,
        lastPageNum: 5,
        totalPages: 20,
        recordings: [
          { id: 'rec_default_201', name: 'Main Audio', dbKey: '201' },
          { id: 'rec_sec_2', name: 'TA Section Recap', dbKey: 'rec_sec_2', cloudAudioUploaded: true }
        ],
        customPages: [{ id: 'cp_a', title: 'Mechanism Sheet', afterPage: 3 }],
        bookmarkedSlides: [5]
      },
      {
        id: 202,
        title: 'Alkynes Reference Link',
        path: 'https://example.org/alkynes',
        completed: false
      }
    ]
  };
  const annMap = {
    '201': {
      '_extraNotes': { '5': true },
      'note_5': [{ type: 'pen' }],
      '_audioPins': [{ id: 'p1', page: 5, timeSec: 135, note: 'Markovnikov Rule' }]
    }
  };

  const unified = buildUnifiedChapterResources({ id: 's1' }, group, new Set(['201']), new Set(['201']), annMap);
  assert.equal(unified.length, 8);
  assert.deepEqual(
    unified.map(r => r.subKind),
    ['lecture_pdf', 'primary_audio', 'secondary_audio', 'blank_page', 'extra_sheet', 'audio_pin', 'bookmark', 'web_link']
  );

  const origUids = unified.map(r => r.uid);

  // Filter checks
  assert.equal(filterAndSortChapterResources(unified, 'Markovnikov', 'all', 'order').length, 1);
  assert.equal(filterAndSortChapterResources(unified, 'الألكينات', 'audio', 'order').length, 2);
  assert.equal(filterAndSortChapterResources(unified, '', 'pdf', 'order').length, 2);
  assert.equal(filterAndSortChapterResources(unified, '', 'note', 'order').length, 4);
  assert.equal(filterAndSortChapterResources(unified, '', 'needs_action', 'order').length, 1); // secondary cloud audio

  // Sort checks
  const notesFirst = filterAndSortChapterResources(unified, '', 'all', 'notes_first');
  assert.equal(notesFirst[0].kind, 'note');
  const incompleteFirst = filterAndSortChapterResources(unified, '', 'all', 'incomplete');
  assert.equal(incompleteFirst[0].lectureId, 202);
  const alphaSorted = filterAndSortChapterResources(unified, '', 'all', 'title');
  assert.ok(alphaSorted.length === unified.length);

  // Pure function check (original array intact)
  assert.deepEqual(unified.map(r => r.uid), origUids);
});

test('WP 6.3: buildChapterContextSnapshot extracts studio drawer materials, bookmarks, extra notes, pins, and sessions', () => {
  const buildChapterContextSnapshot = extractTopLevelHelper('buildChapterContextSnapshot');

  const sub = { id: 'sub1', name: 'Biochemistry' };
  const grp = {
    id: 'grp1',
    name: 'Glycolysis',
    lectures: [
      {
        id: 1,
        title: 'Glycolysis Part 1',
        recordings: [{ id: 'r1', name: 'Rec 1' }],
        bookmarkedSlides: [7, 2],
        customPages: [{ id: 'cp1', title: 'ATP Yield' }]
      },
      { id: 2, title: 'Glycolysis Regulation' }
    ]
  };
  const activeLec = grp.lectures[0];
  const ann = {
    'note_3': [{ type: 'pen' }],
    '_extraNotes': { '1': true, '3': false },
    '_audioPins': [
      { id: 'p2', timeSec: 200, page: 7, note: 'PFK-1' },
      { id: 'p1', timeSec: 40, page: 2, note: 'Hexokinase' }
    ]
  };
  const events = [
    { id: 'ev1', subjectId: 'sub1', title: 'Review Glycolysis', duration: 1.5, completed: false },
    { id: 'ev2', subjectId: 'sub2', title: 'Other Glycolysis', duration: 2, completed: true }
  ];

  const snap = buildChapterContextSnapshot(sub, grp, activeLec, ann, events);
  assert.equal(snap.subjectName, 'Biochemistry');
  assert.equal(snap.chapterName, 'Glycolysis');
  assert.equal(snap.lectures.length, 2);
  assert.equal(snap.recordings.length, 1);
  assert.deepEqual(snap.bookmarkedSlides, [2, 7]);
  assert.deepEqual(snap.extraNotePages, [1, 3]);
  assert.deepEqual(snap.audioPins.map(p => p.id), ['p1', 'p2']);
  assert.equal(snap.chapterSessions.length, 1);
  assert.equal(snap.chapterSessions[0].id, 'ev1');
});
