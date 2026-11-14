// ============================================================================
// Exo Academic Platform — WP 6.6 Final Regression, A11y & i18n Unit Tests
// Covers WP 6.6 static invariants and extracted runtime helpers using node:test:
//   - Zero `assert(true)` placeholders in test suites
//   - toggleAnnotationsVisibility null-safety & accessible bilingual toggle
//   - EXO_I18N_EXACT coverage for all 32 formerly leaked EN-mode Arabic strings
//   - Accessible label / aria-label bindings for all 18 WP 6.6 controls
//   - Heading hierarchy (`h1 -> h2 -> h3`), AA contrast tokens & 44px touch CSS
//   - Modal MutationObserver focus-return + Tab trap & initExoI18n dedup guard
// ============================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('WP 6.6: zero dummy assert(true) placeholders remain in any Phase 6 test suite', () => {
  const testFiles = fs.readdirSync(__dirname).filter(f => /^test_wp6_.*\.js$/.test(f) && f !== 'test_wp6_6_unit.js');
  assert.ok(testFiles.length >= 6, 'Expected WP 6.x test suites in workspace');
  const forbiddenPattern = new RegExp('\\bassert\\s*\\(\\s*true\\b');
  for (const file of testFiles) {
    const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.ok(
      !forbiddenPattern.test(src),
      `Placeholder assert(true) is forbidden in ${file}`
    );
  }
});

test('WP 6.6: toggleAnnotationsVisibility is null-safe when #toggleAnnoVisText is absent and updates aria-label/title cleanly', () => {
  const fnMatch = indexHtml.match(/function toggleAnnotationsVisibility\(\)\s*\{[\s\S]*?\n        \}/);
  assert.ok(fnMatch, 'toggleAnnotationsVisibility must exist in index.html');
  assert.ok(fnMatch[0].includes('if (txt) txt.innerText'), 'Must guard missing #toggleAnnoVisText');
  assert.ok(fnMatch[0].includes("btn.setAttribute('aria-label', lbl)"), 'Must update accessible aria-label');

  // Execute the real extracted function against a minimal DOM harness without #toggleAnnoVisText
  const classes = new Set();
  const attrs = {};
  const iconEl = { className: 'fa-solid fa-eye' };
  const btnEl = {
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c)
    },
    setAttribute: (k, v) => { attrs[k] = v; }
  };
  const canvasMock = {
    style: { opacity: '1' },
    classList: { contains: () => false },
    querySelectorAll: () => []
  };
  const toasts = [];
  const docMock = {
    getElementById: (id) => (id === 'toggleAnnoVisBtn' ? btnEl : (id === 'toggleAnnoVisIcon' ? iconEl : null)),
    querySelectorAll: () => [canvasMock]
  };

  const runner = new Function(
    'document',
    'exoGetLang',
    'showToast',
    `let annotationsVisible = true; ${fnMatch[0]}; return { toggleAnnotationsVisibility, getVisible: () => annotationsVisible };`
  );
  const api = runner(docMock, () => 'en', (msg) => toasts.push(msg));

  assert.doesNotThrow(() => api.toggleAnnotationsVisibility(), 'First toggle must not throw when #toggleAnnoVisText is null');
  assert.equal(api.getVisible(), false);
  assert.equal(canvasMock.style.opacity, '0');
  assert.equal(iconEl.className, 'fa-solid fa-eye-slash');
  assert.equal(attrs['aria-label'], 'Show annotations');
  assert.ok(classes.has('toggle-hidden'));

  assert.doesNotThrow(() => api.toggleAnnotationsVisibility(), 'Second toggle must restore visibility cleanly');
  assert.equal(api.getVisible(), true);
  assert.equal(canvasMock.style.opacity, '1');
  assert.equal(iconEl.className, 'fa-solid fa-eye');
  assert.equal(attrs['aria-label'], 'Hide annotations');
  assert.ok(!classes.has('toggle-hidden'));
  assert.equal(toasts.length, 2);
});

test('WP 6.6: EXO_I18N_EXACT covers all 32 formerly leaked EN-mode Arabic strings across Account and PDF Studio', () => {
  const requiredExactKeys = [
    '💊 كلية الصيدلة',
    '🩺 كلية الطب البشري',
    '🦷 كلية طب الأسنان',
    '🏃‍♂️ كلية العلاج الطبيعي',
    '💉 كلية التمريض',
    '🔬 كلية العلوم',
    '📐 كلية الهندسة',
    '🎓 تخصص أكاديمي آخر',
    'الفرقة الأولى',
    'الفرقة الثانية',
    'الفرقة الثالثة',
    'الفرقة الرابعة',
    'الفرقة الخامسة',
    'سنة الامتياز / دراسات',
    'انتقال سريع لسلايد',
    'تبديل ملء العرض / الارتفاع',
    'تمييز السلايد كمهم للاختبار (B)',
    'فهرس ومصغرات السلايدات (M)',
    'فهرس ومصغرات السلايدات',
    'مشغل الريكورد الصوتي',
    'عرض صفحتين جنباً إلى جنب',
    'الانتقال للسلايد المهم التالي ⭐',
    'إغلاق العارض (Esc)',
    'وضع المعاينة فقط: فعّل Google Drive لتحميل الـ PDF وتفعيل أدوات القلم والاستوديو.',
    'قلم للكتابة السلسة',
    'أحمر',
    'أزرق',
    'أخضر',
    'أصفر',
    'بنفسجي',
    'لون مخصص',
    'إغلاق الفهرس (M)',
    'المحذوفة (',
    'المحذوفة',
    'تشغيل / إيقاف مؤقت (مسافة)',
    'ترجيع 5 ثوانٍ',
    'إخفاء مشغل الصوت'
  ];
  for (const k of requiredExactKeys) {
    assert.ok(indexHtml.includes(`"${k}":`), `Missing EXO_I18N_EXACT translation for "${k}"`);
  }
});

test('WP 6.6: all 18 repaired form controls expose explicit <label for="..."> or aria-label bindings', () => {
  const controlsWithAriaOrFor = [
    'cloudAuthEmail',
    'cloudAuthPassword',
    'pdfThumbSearchInput',
    'audioScrubber',
    'qjPageSlider',
    'qjNumberInput',
    'sessionSubjectSelect',
    'sessionDaySelect',
    'sessionStartHourSelect',
    'sessionDurationSelect',
    'sessionCustomHoursInput',
    'sessionNotesInput',
    'logSubjectSelect',
    'logMoodSelect',
    'pdfScheduleCustomTitleInput',
    'smartSubjectExamTitleInput',
    'smartSubjectExamDateInput',
    'examRadarDateInput'
  ];
  for (const id of controlsWithAriaOrFor) {
    const hasFor = indexHtml.includes(`for="${id}"`);
    const idPos = indexHtml.indexOf(`id="${id}"`);
    assert.ok(idPos !== -1, `Control #${id} must exist in index.html`);
    const tagSlice = indexHtml.slice(Math.max(0, idPos - 120), idPos + 240);
    const hasAria = /aria-label=/.test(tagSlice);
    assert.ok(hasFor || hasAria, `Control #${id} must have a matching <label for> or aria-label`);
  }
});

test('WP 6.6: heading hierarchy, AA contrast tokens, mobile 44px touch CSS, modal focus return, and boot i18n guard are wired', () => {
  assert.ok(indexHtml.includes('<h2 id="libraryTitleHeading"'), 'Library title must use <h2> after <h1>');
  assert.ok(!indexHtml.includes('<h3 id="libraryTitleHeading"'), 'Old skipped <h3> on library title must not remain');
  assert.ok(indexHtml.includes('.exo-empty-hero h3'), 'Dashboard empty hero CSS must target h3');
  assert.ok(indexHtml.includes('<h3 class="wp65-compass-title"'), 'Tracker Smart Compass title must use <h3>');

  // WCAG AA contrast fixes (removed legacy low-contrast teal pill)
  assert.ok(!indexHtml.includes('rgb(32, 54, 53)'), 'Legacy low-contrast teal rgb(32,54,53) must not appear');
  assert.ok(indexHtml.includes('.psf-toggle-pill-btn {') && indexHtml.includes('color: #B8C7B2;'), '.psf-toggle-pill-btn must use high-contrast Sage #B8C7B2');
  assert.ok(indexHtml.includes('id="calculatedEndTimePill" style="font-weight: 800; color: #B8C7B2;"'), '#calculatedEndTimePill must use #B8C7B2');

  // Mobile 44px touch targets
  assert.ok(indexHtml.includes('#schedule .sfw-hour-chip'), 'Mobile 44px rule must cover #schedule .sfw-hour-chip');
  assert.ok(indexHtml.includes('#subjects button.exo-lec-status-tag'), 'Mobile 44px rule must cover #subjects button.exo-lec-status-tag');

  // Modal focus observer + Tab trap + deduplicated boot i18n pass
  assert.ok(indexHtml.includes('window.__exoModalA11yWired = true'), 'Modal focus MutationObserver & Tab trap must be wired');
  assert.ok(indexHtml.includes('if (!topActive.contains(document.activeElement))'), 'Tab trap must pull escaped focus back inside active dialog');
  assert.ok(indexHtml.includes('window.__exoI18nAppliedLang = targetLang'), 'initExoI18n load hook must skip duplicate same-language pass');
});
