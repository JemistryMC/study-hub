// ============================================================================
// Exo Academic Platform — WP 6.1 Pure Logic Unit Tests (node:test)
// Tests extracted production i18n & locale-detection functions from index.html
// ============================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extractI18nEngineSection(html) {
  const startMarker = '<script id="exo-i18n-engine">';
  const endMarker = '</script>';
  const start = html.indexOf(startMarker);
  assert.notEqual(start, -1, 'exo-i18n-engine script block must exist in index.html');
  const bodyStart = start + startMarker.length;
  const end = html.indexOf(endMarker, bodyStart);
  assert.notEqual(end, -1, 'exo-i18n-engine closing script tag must exist');
  return html.slice(bodyStart, end);
}

function createTestI18nSandbox(initialStorage = {}) {
  const store = new Map(Object.entries(initialStorage));
  const localStorageMock = {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: (k) => { store.delete(String(k)); }
  };
  const noop = () => {};
  const windowMock = { addEventListener: noop };
  const docMock = {
    readyState: 'loading',
    addEventListener: noop,
    documentElement: { lang: 'en', dir: 'ltr' },
    querySelectorAll: () => [],
    getElementById: () => null
  };
  function MutationObserverMock() {
    this.observe = noop;
  }

  const engineSrc = extractI18nEngineSection(indexHtml);
  const runner = new Function(
    'window',
    'document',
    'localStorage',
    'MutationObserver',
    'NodeFilter',
    engineSrc + '\nreturn { exoTranslateText: window.exoTranslateText };'
  );
  runner(windowMock, docMock, localStorageMock, MutationObserverMock, { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 });

  // Also extract detectDefaultExoLanguage directly for direct testing
  const detectFnMatch = engineSrc.match(/function detectDefaultExoLanguage\(\)\s*\{[\s\S]*?\n\s{8}\}/);
  assert.ok(detectFnMatch, 'detectDefaultExoLanguage must exist in exo-i18n-engine');
  const detectRunner = new Function('localStorage', `${detectFnMatch[0]}; return detectDefaultExoLanguage;`);
  const detectDefaultExoLanguage = detectRunner(localStorageMock);

  return {
    exoTranslateText: windowMock.exoTranslateText,
    detectDefaultExoLanguage,
    store
  };
}

test('WP 6.1: detectDefaultExoLanguage defaults to en on first run and honors saved preference', () => {
  const unset = createTestI18nSandbox({});
  assert.equal(unset.detectDefaultExoLanguage(), 'en');

  const savedAr = createTestI18nSandbox({ exoAppLang: 'ar' });
  assert.equal(savedAr.detectDefaultExoLanguage(), 'ar');

  const savedEn = createTestI18nSandbox({ exoAppLang: 'en' });
  assert.equal(savedEn.detectDefaultExoLanguage(), 'en');

  const invalidVal = createTestI18nSandbox({ exoAppLang: 'fr' });
  assert.equal(invalidVal.detectDefaultExoLanguage(), 'en');
});

test('WP 6.1: exoTranslateText preserves URLs, emails, filenames, numbers, and unknown Arabic words', () => {
  const { exoTranslateText } = createTestI18nSandbox();

  const mixed = exoTranslateText('راجع Lecture_1.pdf على https://example.com/path/a.pdf مع التنظيم الخلوي و student@exo.edu');
  assert.ok(mixed.includes('Lecture_1.pdf'), 'Filename must be preserved');
  assert.ok(mixed.includes('https://example.com/path/a.pdf'), 'URL must be preserved');
  assert.ok(mixed.includes('student@exo.edu'), 'Email must be preserved');
  assert.ok(mixed.includes('الخلوي'), 'Unknown Arabic word must not be stripped');

  assert.equal(exoTranslateText('📖 ص 2/10 (20%)'), '📖 p. 2/10 (20%)');
  assert.equal(exoTranslateText('المركز'), 'Study Hub');
});

test('WP 6.1: index.html does not monkey-patch CanvasRenderingContext2D.prototype', () => {
  assert.equal(indexHtml.includes('CanvasRenderingContext2D.prototype.fillText ='), false);
  assert.equal(indexHtml.includes('CanvasRenderingContext2D.prototype.measureText ='), false);
});

function extractDashboardHelper(fnName) {
  const match = indexHtml.match(new RegExp(`function ${fnName}\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\s{8}\\}`));
  assert.ok(match, `${fnName} must exist in index.html`);
  return new Function(`${match[0]}; return ${fnName};`)();
}

test('WP 6.1: selectLatestResumableLecture selects only the most recent genuinely resumable incomplete lecture', () => {
  const selectLatestResumableLecture = extractDashboardHelper('selectLatestResumableLecture');

  assert.equal(selectLatestResumableLecture([]), null);

  const unstartedOnly = [
    {
      id: 1,
      name: 'Pharmacology',
      groups: [
        {
          id: 10,
          name: 'Unit 1',
          lectures: [
            { id: 101, title: 'Unopened', completed: false },
            { id: 102, title: 'Completed with page', completed: true, lastPageNum: 5, totalPages: 10, lastStudiedAt: 9000 }
          ]
        }
      ]
    }
  ];
  assert.equal(selectLatestResumableLecture(unstartedOnly), null);

  const mixedSubjects = [
    {
      id: 1,
      name: 'Pharmacology',
      groups: [
        {
          id: 10,
          name: 'Unit 1',
          lectures: [
            { id: 101, title: 'Older Bookmark', completed: false, lastPageNum: 3, totalPages: 12, lastStudiedAt: 1000 },
            { id: 102, title: 'Audio Only Resume', completed: false, lastAudioSec: 45, lastStudiedAt: 5000 }
          ]
        }
      ]
    },
    {
      id: 2,
      name: 'Biochemistry',
      groups: [
        {
          id: 20,
          name: 'Unit 2',
          lectures: [
            { id: 201, title: 'Latest Active Slide', completed: false, lastPageNum: 4, totalPages: 10, lastStudiedAt: 8000 },
            { id: 202, title: 'Completed Newer', completed: true, lastPageNum: 8, totalPages: 8, lastStudiedAt: 99999 }
          ]
        }
      ]
    }
  ];
  const picked = selectLatestResumableLecture(mixedSubjects);
  assert.ok(picked);
  assert.equal(picked.lec.id, 201);
  assert.equal(picked.sub.id, 2);
});

test('WP 6.1: formatDashHourLabel formats 12-hour English times cleanly', () => {
  const formatDashHourLabel = extractDashboardHelper('formatDashHourLabel');
  assert.equal(formatDashHourLabel(0, true), '12:00 AM');
  assert.equal(formatDashHourLabel(9.5, true), '9:30 AM');
  assert.equal(formatDashHourLabel(12, true), '12:00 PM');
  assert.equal(formatDashHourLabel(15.25, true), '3:15 PM');
});

