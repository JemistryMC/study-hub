# EXO — WP 7.1 Corrective Pass Report
## Final Mobile UX, Sticky Topbar Scroll, Anti-Fake-Progress Help Center & Google Drive Diagnostics

**التاريخ:** 2026-11-18  
**المستودع:** `JemistryMC/study-hub`  
**فرع العمل:** `main`  
**Base Commit SHA (المرفوع على GitHub وقت الاستلام):** `6f53e2aed8c335195f1cf338776bb4249b5aeb1f` (GitHub Actions **CI #74** `SUCCESS` / Pages #187) *(ملاحظة بيئة: مساحة العمل المحلية `/app/applet` لا تحتوي على مجلد `.git`؛ تم التوثيق ببصمات SHA-256 الفعلية للملفات النهائية).*  
**الحالة الحالية:** **`IMPLEMENTED — LOCAL TESTS ONLY (PENDING OWNER REVIEW & CI); P0 PRODUCTION SUPABASE RPC STILL OPEN; PHASE 6 NOT APPROVED`**

---

## 1. ملخص النطاق والملفات المعدلة والمضافة

التزم هذا التمرير التصحيحي بالملاحظات الأربع التي منعت اعتماد WP 7.1 دون توسيع نطاق المشروع، ودون أي تعديلات على قاعدة البيانات أو ملفات SQL/Migrations أو سياسة Free/VIP أو أسرار البيئة أو تنفيذ `git commit`/`git push`:

| الملف | الحالة | SHA-256 النهائي | الحجم / الأسطر | الملخص |
| :--- | :--- | :--- | :--- | :--- |
| `/index.html` | معدّل | `490553b836308a959b5a04585c1a11f3b19862499ab57bf92d90189cd22cf3bc` | `4,014,460` بايت (`65,864` سطرًا) | إصلاح شارة PDF والاستوديو، التمرير والثبات الفعلي للشريط العلوي على الموبايل، منع التقدم الوهمي في Help Center، نماذج تشخيص Drive التسعة وتنقيح الأسرار وحفظ توقيت المزامنة عبر Reload. |
| `/dist/index.html` | مبنيّ (`npm run build`) | `490553b836308a959b5a04585c1a11f3b19862499ab57bf92d90189cd22cf3bc` | `4,014,460` بايت (`65,864` سطرًا) | نسخة الإنتاج المبنية والمطابقة بايت لبايت لـ `/index.html`. |
| `/test_wp7_1_unit.js` | مضاف | `b8968d5a5a6d9277b3dc75b5baf76bba03417497cb72aac19d42d7d02cbf0013` | `16,064` بايت (`329` سطرًا) | `10` اختبارات `node:test` نقية لدوال Help Search والـ Checklist الصارمة و`exoHasRealAnnotationContent` وتشخيصات Drive التسعة وميزانية الموبايل. |
| `/test_wp7_1_mobile_ux_e2e.js` | مضاف | `88c64a67986cf18c2eb4d711cdb901ce1935a3010e1254e48961d67512088063` | `85,781` بايت (`1,584` سطرًا) | `150` تحقق Chromium E2E فعليًا عبر شاشات `320px` حتى `1440px` واختبار تمرير الموبايل بـ `elementFromPoint` ومنع التقدم الوهمي وحالات Drive التسعة. |
| `/package.json` و`/run_all_tests.js` | محدث | `package.json`: `9f0bff53...`<br>`run_all_tests.js`: `bdc2d4a1...` | `37` / `189` سطرًا | تسجيل `test_wp7_1_unit.js` و`test_wp7_1_mobile_ux_e2e.js` في `lint` و`test:unit` و`test:e2e` و`run_all_tests.js`. |
| `/reports/PHASE_7_1_MOBILE_UX_AND_HELP_CENTER_REPORT.md` و`/reports/CURRENT.md` | مضاف / محدث | — | — | هذا التقرير وتحديث ملخص التسليم في أعلى `CURRENT.md`. |

- **سلامة الصور التاريخية:** تم الحفاظ على `reports/screenshots/wp6-7/` (`34` ملفًا) و`reports/screenshots/wp7-0/` (`10` ملفات) دون مساس؛ وحُفظت لقطات التحقق الجديدة في `.playwright-cli/wp7-1/after/` (المتجاهل في `.gitignore`).

---

## 2. السبب الجذري والإصلاحات المطبقة للملاحظات الأربع (مع إصلاحات التوافق)

### البند (1): إصلاح قصّ شارة PDF (`#pdfAutoSaveStatus`) واستعادة نجاح اختبارات التراجع وCI
- **الأسباب الجذرية:**
  1. ترتيب CSS في استعلام `@media (max-width: 375px)` كان موضوعًا قبل قاعدة `.pdf-header-left-actions .anno-btn, #pdfAudioBarToggleBtn` (`44px`), ما جعل قاعدة `44px` تغلب قاعدة الإخفاء على عرض `320px`–`360px` وتدفع `.pdf-unified-nav-capsule` لمزاحمة `#pdfAutoSaveStatus`.
  2. قيود `max-width` / `overflow: hidden` / `text-overflow: ellipsis` كانت تقصّ نص `#pdfAutoSaveStatus` داخل `.pdf-viewer-header`.
  3. في أثناء التحقق الشامل من التراجع، استلزم اختبار `test_wp6_7_chromium_e2e.js:537` وجود عبارة `'Free Plan'` داخل بانر الباقة المجانية في `deriveGoogleDriveDiagnosticsModel()`، كما تطلّب `Test LL.3` (`test_phase4_1_chromium_e2e.js:7449`) عدم اعتراض `.toast` لنقرات العناصر تحته.
- **الإصلاحات في `index.html`:**
  - تثبيت `min-width: max-content; max-width: none; width: max-content; overflow: visible; text-overflow: clip; white-space: nowrap;` على `.pdf-viewer-header #pdfAutoSaveStatus` (`lines 8043–8058`, `8092–8106`, `8124–8134`) مع ضبط التباعد الدقيق لعرض `<= 345px` (`lines 8199–8208`).
  - نقل `@media (max-width: 375px) { .pdf-viewer-header #pdfAutoSaveStatus / #pdfAudioBarToggleBtn }` إلى ما بعد تعريفات الأزرار الأساسية (`lines 8196–8198`) دون المساس ببقية أزرار الاستوديو أو خيارات شريط الصوت في القائمة.
  - الحفاظ على صياغة `'Free Plan Active — Local Storage Ready (Drive Optional)'` في `deriveGoogleDriveDiagnosticsModel()` (`line 19424`).
- **نتيجة التحقق:** الشارة مرئية بالكامل (`scrollWidth <= clientWidth + 2`) دون قصّ أو تداخل على `320x720`, `360x740`, `390x844` (EN & AR), `768x1024`, `1440x900`؛ رأس الاستوديو على الموبايل `<= 56px` وكل أزرار الرأس وأشرطة الأدوات `>= 44x44px`؛ ونجاح `test_phase4_1_chromium_e2e.js` (**`167/167`**) و`test_wp6_7_chromium_e2e.js` (**`51/51`**).

### البند (2): إثبات ثبات الشريط العلوي (`.navbar`) أثناء التمرير الحقيقي على الموبايل
- **الأسباب الجذرية:**
  1. وجود `height`/`overflow` مقيدة أو سياق تكديس أعلى في `.main-content` و`.view-section.active` كان يمنع التثبيت الموثوق لـ `.navbar` أو يسمح بمرور البطاقات فوقه أثناء التمرير.
  2. إغلاق القوائم المنسدلة عند التمرير (`closeMenusOnScroll`) كان يُغلق القائمة إذا حرّك Playwright الصفحة بمقدار ضئيل عبر `scrollIntoViewIfNeeded()`, بينما يتعين إغلاقها عند التمرير الحقيقي لمسافة (`>= 200px` أو اختفاء الزر).
  3. حاوية `.toast` كانت تلتقط أحداث المؤشر (`pointer-events: auto` ضمنيًا) فوق عناصر التفاعل السفلى.
- **الإصلاحات في `index.html`:**
  - ضبط حاوية التمرير ضمن `@media (max-width: 860px)` ليكون `html, body { height: auto; min-height: 100dvh; overflow-x: clip; overflow-y: visible; }` (`lines 6024`, `7840–7844`)، وإسناد `position: relative; z-index: 1; transform: none;` على `.main-content` و`.view-section.active` (`lines 7845–7853`).
  - تثبيت `.navbar` بخاصية `position: sticky; top: 0; z-index: 999; isolation: isolate; background: #16181A;` مع مراعاة الحواف الآمنة `padding-top: calc(4px + var(--safe-top))` (`lines 7854–7867`)، وتوسيط `#appLangToggleBtn` عند `<= 380px` (`lines 7906–7913`).
  - إبقاء طبقات النوافذ المنبثقة فوق الشريط العلوي (`z-index: 4000`, `line 5280`)، وضبط `.toast { pointer-events: none; }` مع `.toast button, .toast a { pointer-events: auto; }` (`lines 2297–2302`)، وصقل `closeMenusOnScroll` (`lines 25183–25198` عبر شرط `delta < 200 && triggerStillVisible`).
- **نتيجة التحقق:** اختبار التمرير الحقيقي داخل Chromium عند `360x740` و`390x844` (أعلى `top` ← منتصف `mid` ← أسفل `bottom` في كل من **Subjects** و**Planner**) أثبت عبر `document.elementFromPoint` في اليسار والمنتصف واليمين أن `.navbar` يظل مثبتًا عند `top=0` ويفوز باختبار الضرب فوق كل المحتوى دون اختفاء أو تغطية، مع لقطات بصرية موثقة (`after-scroll-360-top/mid/bottom.png`, `after-scroll-390-subjects-mid.png`, `after-scroll-390-planner-bottom.png`).

### البند (3): منع التقدم الوهمي في قائمة خطوات البدء بـ Help Center وإثبات الحفظ الدائم
- **السبب الجذري:** كان يمكن لبعض الإشارات السطحية (مثل كائن صفحة فارغ، أو بيانات العينة `loadDemoData()`، أو أهداف غير مربوطة بجلسات، أو تسجيل دخول محلي/أوفلاين غير مؤكد السحابة) أو بقاء التعديلات في الذاكرة دون حفظ IndexedDB فعلي أن تضلل حساب الإنجاز.
- **الإصلاحات في `index.html`:**
  - دالة `exoHasRealAnnotationContent(pagesMap)` (`lines 19536–19552`) تتحقق فعليًا من وجود `strokes`, `paths`, `texts`, `items`, `lines`, أو `isExtraSheet === true`، وتستبعد الكائنات الفارغة.
  - متابعة المحاضرات الموثّقة الحفظ في IndexedDB عبر `exoPersistedAnnotationLecturesByUid` وتخزينها لكل حساب في `pharmaPersistedAnnoCountV1_<uid>` عند الحفظ الفعلي (`lines 40994–41017`) والقراءة (`lines 54325–54365`) والاستعادة (`lines 54513–54530`).
  - دالة `exoCollectHelpChecklistSnapshot()` (`lines 47481–47594`) و`deriveHelpGettingStartedChecklist()` (`lines 19958–20033`):
    - تستبعد بيانات العينة (`_isDemoSample`) وسجلات الغياب التلقائية (`mood !== 'missed' && mood !== 'absent'`).
    - لا تحسب `gs_studio_notes` إلا بعد الحفظ الدائم الفعلي في IndexedDB (وليس بتمرير صفحات PDF أو وجود عناصر عالقة في `pendingAnnoSaveMap`).
    - تشترط `linkedGoalCount > 0` لخطوة `gs_goal`.
    - تشترط تأكيد مزامنة من الخادم (`cloudAckConfirmed && !isLocalFallbackUser && isOnline`) أو تصدير نسخة احتياطية فعليًا لخطوة `gs_safety`.
- **نتيجة التحقق:** في `test_wp7_1_unit.js` وفي Chromium E2E (`Section 8`): تبقى القائمة `0/7` بعد التنقل بين التبويبات الستة أو تحميل `loadDemoData()`؛ وتبقى الخطوات `false` مع تصفح PDF و`pendingAnnoSaveMap` وأهداف غير مربوطة ودخول أوفلاين؛ ثم تصبح `gs_studio_notes = true` بعد رسم ضربة قلم حقيقية وتفريغ `flushPendingAnnotationsSave(false)`، وتستمر `true` بعد `page.reload()` الكامل.

### البند (4): تشخيصات Google Drive التسعة، ثبات توقيت المزامنة عبر Reload، وتدقيق أزرار Help Center
- **الإصلاحات في `index.html`:**
  - تغطية جميع الحالات التسع في `deriveGoogleDriveDiagnosticsModel()` (`lines 19337–19534`): `not_linked`, `connected`, `auth_expired` (`401`), `permission_denied` (`403`), `file_access_error` (`404`), `offline`, `media_transfer_failed` (`422`/`429`/`5xx`), `workspace_sync_issue` (`OCC conflict`/`sync failed`), و`sync_confirmed` — مع فصل شارة **Connection** عن شارة **Sync** (`renderDriveHubStateBanner()` في `lines 50160–50201`) وتنقيح الرموز والروابط السرية (`Bearer [REDACTED]`, `ya29.[REDACTED]`, `access_token=[REDACTED]`, `upload_id=[REDACTED]`).
  - ضمان ظهور `#driveHubModalOverlay` (`z-index: 4000`, `opacity: 1` في `lines 5280, 12629–12647`).
  - استعادة توقيت آخر مزامنة مؤكدة على الخادم عبر `pharmaLastCloudSyncIso_<uid>` أثناء تهيئة الجلسة (`lines 49402–49426`) مع الإبقاء الصادق على شارة `Offline` وعدم الادعاء بـ `Synced` أثناء انقطاع الشبكة أو وجود تعديلات محلية غير مزامنة.
  - التحقق من أزرار `?` السياقية (`#libraryHelpTriggerBtn` ← Pane 2، `#plannerHelpTriggerBtn` ← Pane 4، `#trackerHelpTriggerBtn` ← Pane 5، `#cloudAuthHelpBtn` ← Pane 5، `#driveHubHelpBtn` ← Pane 6، `#pdfMenuHelpBtn` ← Pane 3) وشريط الإجراءات السريعة الثمانية وزر WhatsApp و`#helpLoadDemoDataBtn` و`#helpVipDetailsBtn` ورقائق استرداد البحث الفارغ.

---

## 3. مصفوفة الاختبارات الفعلية المنفذة على البصمة النهائية (`490553b8...`)

جميع الأوامر التالية شُغّلت فعليًا على نسخة `/index.html` و`/dist/index.html` ذات SHA-256 `490553b836308a959b5a04585c1a11f3b19862499ab57bf92d90189cd22cf3bc`:

| الفئة / الأمر | الحالة | النتيجة الفعلية | ملاحظات البيئة |
| :--- | :--- | :--- | :--- |
| `npm run lint` (`lint_applet`) | **PASS** | `25` ملف JS بدون أخطاء | فحص syntax (`node --check`) |
| `npm run build` (`compile_applet`) | **PASS** | `dist/index.html === index.html` (`4,014,460` بايت) | متطابقان ببصمة SHA-256 |
| `npm run test:static` (`run_verification_tests.js`) | **PASS** | **`54 / 54`** | Static & Web Crypto audit |
| `node run_comprehensive_verification.js` | **PASS** | **`42 / 42`** | منطق وأمان شامل |
| `node test_phase3_cross_account_isolation.js` | **PASS** | **`52 / 52`** | عزل الحسابات |
| `node test_phase4_regressions.js` | **PASS** | **`317 / 317`** | تراجعات المرحلة الرابعة |
| `node --test test_wp6_1..9_unit.js test_wp7_1_unit.js` | **PASS** | **`69 / 69`** (`5+4+4+5+7+5+13+10+6+10`) | تشمل **`10/10`** لـ `test_wp7_1_unit.js` |
| `npm run test:pglite` (`test_phase4_2_postgres_integration.js`) | **PASS** | **`41 / 41`** | PGlite WASM |
| `node test_phase4_1_chromium_e2e.js` | **PASS** | **`167 / 167`** (سيناريوهات `A–V, AA–MM, OO`) | Chromium محلي مع mocks |
| `node test_wp6_5_chromium_e2e.js` | **PASS** | **`43 / 43`** | Chromium محلي مع mocks |
| `node test_wp6_6_chromium_e2e.js` | **PASS** | **`22 / 22`** | Chromium محلي مع mocks |
| `node test_wp6_7_chromium_e2e.js` | **PASS** | **`51 / 51`** | Chromium محلي مع mocks |
| `node test_wp6_8_chromium_e2e.js` | **PASS** | **`21 / 21`** | Chromium محلي مع mocks |
| `node test_wp6_9_chromium_e2e.js` | **PASS** | **`22 / 22`** | Chromium محلي مع mocks |
| `node test_wp7_1_mobile_ux_e2e.js` | **PASS** | **`150 / 150`** | Mobile UX, Scroll, Checklist, Drive 9-state |
| **إجمالي التحققات المنفذة محليًا** | **PASS** | **`1,051 / 1,051` (`0` إخفاق)** | `465` static/reg + `69` unit + `41` PGlite + `476` Chromium E2E |
| `npm run benchmark:node` (`benchmark_tier_a.js`) | **PASS** | **`5 / 5` Tiers (`1 MB`..`50 MB / 27.73 MB`)** | `Integrity: PASSED` على `490553b8...` |
| `npm run test:pg16` (`test_phase4_2_1_pg16_concurrency.js`) | **NOT RUN (بيئة)** | `ECONNREFUSED 127.0.0.1:5432` | لا يوجد خادم PostgreSQL 16 محلي؛ يُشغّل في GitHub Actions CI (`96` تحققًا). |

---

## 4. الأدلة البصرية (Screenshots & Visual Inspection)

تم فحص جميع اللقطات الـ **`20`** المولدة تحت `.playwright-cli/wp7-1/after/` (غير متتبعة في Git بموجب `.gitignore`):
- **شارة PDF والوضعان الطولي والعرضي:** `after-pdf-badge-360.png`, `after-pdf-badge-390.png`, `studio-portrait-390x844.png`, `studio-landscape-896x414.png`.
- **إثبات التمرير الحقيقي للشريط العلوي (`.navbar`):** `after-scroll-360-top.png`, `after-scroll-360-mid.png`, `after-scroll-360-bottom.png`, `after-scroll-390-subjects-mid.png`, `after-scroll-390-planner-bottom.png`.
- **تشخيصات Drive والـ Help Center والشاشات المتجاوبة:** `after-drive-9states.png`, `after-help-checklist.png`, `dash-390x844-en.png`, `more-drawer-390x844-en.png`, `subjects-populated-390x844.png`, `chapter-populated-390x844.png`, `planner-390x844-en.png`, `planner-390x844-ar.png`, `tracker-390x844-en.png`, `help-390x844-en.png`, `tablet-768x1024-en.png`.

---

## 5. القيود والمخاطر وقرارات المالك المتبقية

1. **التحقق المحلي مقابل CI الموثق:** نتيجة `1,051/1,051` هي نتيجة **محلية فقط** (`IMPLEMENTED — LOCAL TESTS ONLY`) حتى يراجع المالك التغييرات ويرفعها إلى `main` ويعمل GitHub Actions CI لتنفيذ `test:pg16` (`postgres:16`) وكامل `npm test`.
2. **حدود المحاكاة في E2E:** اختبارات Chromium المحلية تستخدم اعتراض شبكة محليًا (`page.route`) لـ Supabase وGoogle Identity Services (`gsi/client`) و`PDFJS_DETERMINISTIC_SHIM`، ولا تثبت اتصال OAuth حيًا بحساب Google حقيقي.
3. **بند P0 المفتوح في Production Supabase (`PGRST202`):** لم تتصل هذه الجولة بقاعدة Supabase Production ولا تزال حالة تنفيذ `public.sync_workspace_with_concurrency` الحية **غير متحقق منها (`NOT VERIFIED LIVE`)** وتخضع لخطة الفحص للقراءة فقط الموثقة في `reports/PHASE_6_WP_7_0_6_REPORT.md` (§6).
4. **ملاحظة المزامنة إلى GitHub:** لم يتم تنفيذ أي `commit` أو `push` من بيئة العمل؛ وتخلو الملفات المعدلة من أي أسرار أو مفاتيح `.env`.
