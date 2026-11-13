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
