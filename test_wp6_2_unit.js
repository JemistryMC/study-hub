// ============================================================================
// Exo Academic Platform — WP 6.2 Pure Logic Unit Tests (node:test)
// Tests extracted production Digital Bookshelf & Table of Contents helpers
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

test('WP 6.2: buildBookshelfStats aggregates divided courses, continuous tracks, chapters, lectures, and planned hours accurately', () => {
  const buildBookshelfStats = extractTopLevelHelper('buildBookshelfStats');

  const empty = buildBookshelfStats([], []);
  assert.equal(empty.totalSubjects, 0);
  assert.equal(empty.totalChapters, 0);
  assert.equal(empty.totalLectures, 0);
  assert.equal(empty.doneLectures, 0);
  assert.equal(empty.semesterPct, 0);
  assert.deepEqual(empty.items, []);

  const subjects = [
    {
      id: 1,
      name: 'Pharmacology I',
      isDivided: true,
      groups: [
        {
          id: 11,
          name: 'Autonomic',
          lectures: [
            { id: 101, title: 'Cholinergics', completed: true },
            { id: 102, title: 'Adrenergics', completed: false }
          ]
        },
        {
          id: 12,
          name: 'Cardiovascular',
          lectures: [
            { id: 103, title: 'Antihypertensives', completed: true }
          ]
        }
      ]
    },
    {
      id: 2,
      name: 'Daily Quran Wird',
      isDivided: false,
      groups: []
    }
  ];

  const events = [
    { id: 501, subjectId: 1, duration: 2.5, completed: true },
    { id: 502, subjectId: '1', duration: 1.5, completed: false },
    { id: 503, subjectId: 2, duration: 1, completed: true }
  ];

  const stats = buildBookshelfStats(subjects, events);
  assert.equal(stats.totalSubjects, 2);
  assert.equal(stats.totalChapters, 2);
  assert.equal(stats.totalLectures, 3);
  assert.equal(stats.doneLectures, 2);
  assert.equal(stats.semesterPct, 67);
  assert.equal(stats.items[0].progressPct, 67);
  assert.equal(stats.items[0].scheduledHours, 4);
  assert.equal(stats.items[0].doneSessions, 1);
  assert.equal(stats.items[1].chapterCount, 0);
  assert.equal(stats.items[1].progressPct, 0);
  assert.equal(stats.items[1].scheduledHours, 1);
  assert.equal(stats.items[1].doneSessions, 1);
});

test('WP 6.2: filterAndSortBookshelfItems filters by query and category and sorts without mutating input array', () => {
  const buildBookshelfStats = extractTopLevelHelper('buildBookshelfStats');
  const filterAndSortBookshelfItems = extractTopLevelHelper('filterAndSortBookshelfItems');

  const subs = [
    {
      id: 1,
      name: 'Organic Chemistry',
      isDivided: true,
      groups: [{ id: 10, name: 'G1', lectures: [{ id: 1, completed: true }, { id: 2, completed: true }] }]
    },
    {
      id: 2,
      name: 'Biochemistry — الكيمياء الحيوية',
      isDivided: true,
      groups: [{ id: 20, name: 'G2', lectures: [{ id: 3, completed: true }, { id: 4, completed: false }] }]
    },
    {
      id: 3,
      name: 'Algorithm Practice',
      isDivided: false,
      groups: []
    }
  ];
  const events = [
    { id: 1, subjectId: 2, duration: 5, completed: false },
    { id: 2, subjectId: 1, duration: 1, completed: true }
  ];

  const { items } = buildBookshelfStats(subs, events);
  const origIds = items.map(i => i.sub.id);

  assert.deepEqual(
    filterAndSortBookshelfItems(items, 'الكيمياء', 'all', 'custom').map(i => i.sub.id),
    [2]
  );
  assert.deepEqual(
    filterAndSortBookshelfItems(items, 'BIOCHEMISTRY', 'courses', 'custom').map(i => i.sub.id),
    [2]
  );
  assert.deepEqual(
    filterAndSortBookshelfItems(items, '', 'continuous', 'custom').map(i => i.sub.id),
    [3]
  );
  assert.deepEqual(
    filterAndSortBookshelfItems(items, '', 'in_progress', 'custom').map(i => i.sub.id),
    [2, 3]
  );
  assert.deepEqual(
    filterAndSortBookshelfItems(items, '', 'courses', 'progress_desc').map(i => i.sub.id),
    [1, 2]
  );
  assert.deepEqual(
    filterAndSortBookshelfItems(items, '', 'courses', 'progress_asc').map(i => i.sub.id),
    [2, 1]
  );
  assert.deepEqual(
    filterAndSortBookshelfItems(items, '', 'all', 'hours_desc').map(i => i.sub.id),
    [2, 1, 3]
  );
  assert.deepEqual(
    filterAndSortBookshelfItems(items, '', 'all', 'alpha').map(i => i.sub.name),
    ['Algorithm Practice', 'Biochemistry — الكيمياء الحيوية', 'Organic Chemistry']
  );

  // Input order preserved (pure function)
  assert.deepEqual(items.map(i => i.sub.id), origIds);
});

test('WP 6.2: formatChapterIndexNumber produces clean zero-padded 2-digit index labels', () => {
  const formatChapterIndexNumber = extractTopLevelHelper('formatChapterIndexNumber');
  assert.equal(formatChapterIndexNumber(0), '01');
  assert.equal(formatChapterIndexNumber(8), '09');
  assert.equal(formatChapterIndexNumber(9), '10');
  assert.equal(formatChapterIndexNumber(-3), '01');
});

test('WP 6.2: filterTocChapters preserves original chapter numbers and filters cleanly by chapter title, lecture title, and status', () => {
  const formatChapterIndexNumber = extractTopLevelHelper('formatChapterIndexNumber');
  const filterTocChapters = extractTopLevelHelper('filterTocChapters', { formatChapterIndexNumber });

  const groups = [
    {
      id: 100,
      name: 'Chapter 1: Foundations',
      lectures: [
        { id: 1, title: 'Receptor Theory', completed: true, isReviewDue: false },
        { id: 2, title: 'Dose Response', completed: true, isReviewDue: true }
      ]
    },
    {
      id: 200,
      name: 'Chapter 2: Autonomic Nervous System',
      lectures: [
        { id: 3, title: 'Muscarinic Agonists', completed: false, isReviewDue: false }
      ]
    },
    {
      id: 300,
      name: 'Chapter 3: Empty Unit',
      lectures: []
    }
  ];

  const allRows = filterTocChapters(groups, '', 'all', l => Boolean(l.isReviewDue));
  assert.equal(allRows.length, 3);
  assert.equal(allRows[0].indexLabel, '01');
  assert.equal(allRows[0].pct, 100);
  assert.equal(allRows[1].indexLabel, '02');
  assert.equal(allRows[1].pct, 0);
  assert.equal(allRows[2].indexLabel, '03');

  // Searching by lecture title keeps chapter 02 with its original 02 chapter index
  const lecMatch = filterTocChapters(groups, 'Muscarinic', 'all', l => Boolean(l.isReviewDue));
  assert.equal(lecMatch.length, 1);
  assert.equal(lecMatch[0].indexLabel, '02');
  assert.equal(lecMatch[0].visibleLectures.length, 1);

  // Searching by chapter name retains all lectures inside that matching chapter
  const grpMatch = filterTocChapters(groups, 'Foundations', 'all', l => Boolean(l.isReviewDue));
  assert.equal(grpMatch.length, 1);
  assert.equal(grpMatch[0].visibleLectures.length, 2);

  // Status filters
  const incompleteRows = filterTocChapters(groups, '', 'incomplete', l => Boolean(l.isReviewDue));
  assert.deepEqual(incompleteRows.map(r => r.group.id), [200, 300]);

  const completedRows = filterTocChapters(groups, '', 'completed', l => Boolean(l.isReviewDue));
  assert.deepEqual(completedRows.map(r => r.group.id), [100]);

  const reviewDueRows = filterTocChapters(groups, '', 'review_due', l => Boolean(l.isReviewDue));
  assert.deepEqual(reviewDueRows.map(r => r.group.id), [100]);
  assert.deepEqual(reviewDueRows[0].visibleLectures.map(l => l.id), [2]);
});
