# EXO — WP 7.1 Verification & Corrective Pass Report
## Mobile UX, Sticky Topbar Scroll, Anti-Fake-Progress Help Center, Touch Targets & Google Drive Diagnostics

**آخر تحديث:** 2026-11-19  
**المستودع:** `JemistryMC/study-hub`  
**فرع العمل:** `main`  
**Previous Documentation-Only Sync:** `7f8967af08c432353c756dd93c0b0a3dbb271282` (`2026-11-19T10:35:02Z`) — آخر مزامنة توثيقية سابقة للتقريرين؛ **GitHub Pages #193:** [`44507018990`](https://github.com/JemistryMC/study-hub/actions/runs/44507018990) — **`COMPLETED / SUCCESS`** (`2026-11-19T10:35:46Z`). *(هذا مرجع تاريخي للمزامنة السابقة وليس تعريفًا لـ Latest Repository HEAD؛ ولا يُنسب CI #78 إليه).*  
**Latest Source Commit (آخر Commit للتطبيق والاختبارات — CI-Verified):** `5d9464b45170de5b6942cdfcf577e1308d21497d` (`2026-11-19T10:07:28Z`)  
**GitHub Actions CI #78 (على Source Commit `5d9464b4`):** [`44502700226`](https://github.com/JemistryMC/study-hub/actions/runs/44502700226) (Job `135486281406`) — **`COMPLETED / SUCCESS`** (`2026-11-19T10:07:30Z` → `2026-11-19T10:17:29Z`)  
**GitHub Pages #192 (على Source Commit `5d9464b4`):** [`44502699882`](https://github.com/JemistryMC/study-hub/actions/runs/44502699882) — **`COMPLETED / SUCCESS`** (`2026-11-19T10:07:30Z` → `2026-11-19T10:08:15Z`)  
**Base Commit SHA السابق (WP 7.0.6):** `6f53e2aed8c335195f1cf338776bb4249b5aeb1f` (CI #74 `44299401863` `SUCCESS` / Pages #187)  
**الحالة الحالية:** **`CI VERIFIED (5d9464b4) — TECHNICAL GATE PASSED; OWNER REVIEW & ACCEPTANCE PENDING (NOT APPROVED); P0 PRODUCTION SUPABASE RPC STILL OPEN; PHASE 6 NOT APPROVED`**

---

## 1. تسلسل الرفع ونتائج CI من WP 7.0.6 حتى آخر مزامنة توثيقية سابقة (`7f8967af`)

| Commit SHA | التاريخ (UTC) | GitHub Actions CI | GitHub Pages | الملاحظة |
| :--- | :--- | :--- | :--- | :--- |
| `6f53e2ae` | `2026-11-18T11:57:40Z` | **CI #74** (`44299401863`): `SUCCESS` | #187: `SUCCESS` | خط أساس WP 7.0.6 |
| `bb5ec928` | `2026-11-18T14:55:41Z` | **CI #75** (`44329699774`): `FAILURE` | #189: `SUCCESS` | أول رفع لـ WP 7.1 |
| `ed00c870` | `2026-11-19T07:18:19Z` | **CI #76** (`44478583935`): `FAILURE` | #190: `SUCCESS` | تمريرة تصحيحية أولى |
| `ba544310` | `2026-11-19T09:28:39Z` | **CI #77** (`44496770459`): `FAILURE` | #191: `SUCCESS` | اجتاز إصلاح هندسة PDF؛ أوقف الفحص تراجع أهداف اللمس في Help Center |
| **`5d9464b4`** | `2026-11-19T10:07:28Z` | **CI #78** (`44502700226`): **`SUCCESS`** | **#192: `SUCCESS`** | **Latest Source Commit:** إصلاح `#helpModalCloseBtn` وأزرار Quick Actions + مصفوفة 7 شاشات EN/AR + نجاح كامل لكل خطوات CI |
| **`7f8967af`** | `2026-11-19T10:35:02Z` | *لم يُشغَّل مقصودًا (`paths-ignore`)* | **#193 (`44507018990`): `SUCCESS`** | **Previous Documentation-Only Sync:** رفع تحديثات التقريرين دون تغيير المصدر أو الاختبارات؛ ليس مرجعًا لـ Repository HEAD الحالي |

---

## 2. تطابق ملفات Source Commit `5d9464b45170de5b6942cdfcf577e1308d21497d` (التحقق من البصمات)

*(ملاحظة بيئة: مساحة العمل `/app/applet` لا تحتوي على `.git`؛ تم إثبات تطابق ملفات المصدر والاختبارات المحلية مع Latest Source Commit `5d9464b4` عبر حساب `git blob SHA-1` ومقارنته مباشرة باستجابة GitHub API).*

| الملف | Git Blob SHA-1 (محلي = GitHub `5d9464b4`) | SHA-256 | الحجم / الأسطر | الملخص |
| :--- | :--- | :--- | :--- | :--- |
| `/index.html` | `8bea6c475df687dff861043474d368a6099c301f` | `64d1f476627275b44d4a7ceb6aa0b1655379b7f4b5800fe20ef51c23ce8ed774` | `4,017,892` بايت (`65,952` سطرًا) | إصلاح شارة PDF والاستوديو، التمرير والثبات الفعلي لـ `.navbar` على الموبايل، منع التقدم الوهمي في Help Center، نماذج تشخيص Drive التسعة، وتثبيت أهداف اللمس `>= 44×44px` في `#helpModalCloseBtn` و`#helpQuickActionsBar`. |
| `/dist/index.html` | — (`npm run build`) | `64d1f476627275b44d4a7ceb6aa0b1655379b7f4b5800fe20ef51c23ce8ed774` | `4,017,892` بايت (`65,952` سطرًا) | نسخة الإنتاج المبنية والمطابقة بايت لبايت لـ `/index.html`. |
| `/server.js` | `4dcb3e644f5cfc8946a5e924ebabf4172e21af90` | `0b254a96400d63a5d8c35ae495faa86cc2916316695b683da47ffad1ee072f85` | `3,747` بايت | معالجة أخطاء المستمع و`streamFile` وتحليل URL بأمان. |
| `/test_wp7_1_mobile_ux_e2e.js` | `7bfdfa59e4e499d20a135b37aa6a2c4675474ea4` | `d957630407b7ac29fdba503111aff512af491e201307a7f88a74b6411e12ebea` | `114,963` بايت (`2,098` سطرًا) | تغطية شاملة لـ Mobile UX وهندسة PDF وتمرير `.navbar` ومنع التقدم الوهمي وحالات Drive التسعة ومصفوفة Help Center الجديدة عبر 7 شاشات EN/AR. |
| `/test_wp7_1_unit.js` | `fa0d23e6be8c6b0dd4a1542b76cd9710b8b0bcd9` | `b8968d5a5a6d9277b3dc75b5baf76bba03417497cb72aac19d42d7d02cbf0013` | `16,064` بايت (`329` سطرًا) | اختبارات `node:test` نقية للبحث والـ Checklist و`exoHasRealAnnotationContent` وتشخيصات Drive التسعة وميزانية الموبايل. |
| `/package.json` و`/run_all_tests.js` | `5dd1badd...` / `ba0155cb...` | `9f0bff53...` / `bdc2d4a1...` | `37` / `189` سطرًا | تسجيل `test_wp7_1_unit.js` و`test_wp7_1_mobile_ux_e2e.js` في `lint` و`test:unit` و`test:e2e` والمنفذ الموحد `npm test`. |
| `reports/screenshots/wp7-1-corrective/*.png` | محدّثة في `5d9464b4` | — | `11` ملفًا | لقطات مرجعية محدثة لـ `help-center-checklist.png` و`help-center-drive-9states.png` و`pdf-studio-390-ar.png` وبقية شاشات WP 7.1 (مع الحفاظ على `wp6-7/` و`wp7-0/`). |

---

## 3. نتائج GitHub Actions CI #78 الفعلية (`44502700226` على `5d9464b45170de5b6942cdfcf577e1308d21497d`)

النتائج التالية مأخوذة مباشرة من GitHub Actions API للتشغيل [`44502700226`](https://github.com/JemistryMC/study-hub/actions/runs/44502700226) (Job [`135486281406`](https://github.com/JemistryMC/study-hub/actions/runs/44502700226/job/135486281406)، فرع `main`، commit `5d9464b45170de5b6942cdfcf577e1308d21497d`):

| الخطوة | اسم الخطوة في CI #78 | الأمر المنفّذ (`.github/workflows/ci.yml`) | الحالة | النتيجة | التوقيت (UTC) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `[1]–[6]` | Setup, Postgres 16 container, Checkout, Node 20, `npm ci`, Playwright Chromium | `npm ci`, `npm run test:setup` | `completed` | **`success`** | `10:07:33Z → 10:11:06Z` |
| `[7]` | Run Syntax & Lint Verification | `npm run lint` | `completed` | **`success`** | `10:11:06Z → 10:11:07Z` |
| `[8]` | Run Production Build | `npm run build` | `completed` | **`success`** | `10:11:07Z → 10:11:07Z` |
| `[9]` | 1. Run Production Cryptography & Static Security Audit | `npm run test:static` | `completed` | **`success`** | `10:11:07Z → 10:11:07Z` |
| `[10]` | 2. Run Pure Unit & Asynchronous Logic Isolation Suites | `npm run test:unit` | `completed` | **`success`** | `10:11:07Z → 10:11:09Z` |
| `[11]` | 3. Run Embedded PostgreSQL Compatibility Suite (PGlite WASM) | `npm run test:pglite` | `completed` | **`success`** | `10:11:09Z → 10:11:13Z` |
| `[12]` | 4. Run Real PostgreSQL 16 Concurrency & 10-Point Schema Parity Suite | `npm run test:pg16` | `completed` | **`success`** | `10:11:13Z → 10:11:14Z` |
| `[13]` | 5. Run Real Headless Chromium + IndexedDB Browser E2E Suite | `npm run test:e2e` | `completed` | **`success`** | `10:11:14Z → 10:14:16Z` |
| `[14]` | 6. Verify Unified Test Runner (`npm test -> run_all_tests.js`) | `npm test` | `completed` | **`success`** | `10:14:16Z → 10:17:25Z` |
| `[26]–[29]` | Post Setup, Post Checkout, Stop containers, Complete job | — | `completed` | **`success`** | `10:17:25Z → 10:17:28Z` |

- **الخلاصة الرسمية لـ CI #78:** `status: "completed"`, `conclusion: "success"` (`0` خطوات فاشلة).
- **ملاحظة شفافية حول السجلات الخام:** نقطة نهاية GitHub API لتنزيل السجلات النصية الخام (`.../jobs/135486281406/logs`) تُرجع `403` بدون رمز وصول إداري، ونقطة العرض الداخلية تعيد `404` دون جلسة دخول؛ لذلك لا يُنقل أي رقم تفصيلي غير مشاهد من stdout داخل Runner. يثبت نجاح الخطوتين `[13]` (`npm run test:e2e`) و`[14]` (`npm test`) بـ `conclusion: "success"` أن `test_wp7_1_mobile_ux_e2e.js` (ببصمة `7bfdfa59...` المطابقة لـ `5d9464b4`) خرج بـ `testsFailed === 0` عبر جميع التحققات بما فيها مصفوفة Help Center ذات السبع شاشات.

---

## 4. إصلاح أهداف اللمس في Help Center (`5d9464b4`) والقياسات الفعلية لمصفوفة الشاشات السبع

### التغييرات المنفذة في `5d9464b4` (`index.html`):
- تثبيت `#helpModalCloseBtn` على `min-width: 44px; min-height: 44px; width: 44px; height: 44px; flex: 0 0 44px; padding: 0; box-sizing: border-box;` وضبط `#helpModalOverlay .eg-header-top-row` (`align-items: flex-start`) و`> div:first-child` (`flex: 1 1 calc(100% - 56px); min-width: 0`).
- إزالة التحويل الهندسي `transform: none !important;` على `#helpModalOverlay .eg-studio-modal` (`transition: opacity 0.14s ease`) لتفادي القياسات المشوهة أثناء الانتقال، وضبط `padding: 0; overflow: hidden; border: none;` على الشاشات `<= 767px`.
- تثبيت `.exo-help-quick-strip` (`flex-wrap: nowrap; align-items: stretch; overflow-x: auto; overflow-y: hidden;`) و`.exo-help-quick-btn` (`flex: 0 0 auto; flex-shrink: 0; min-width: 44px; min-height: 44px; padding: 10px 14px; line-height: 1.25; white-space: nowrap`).

### القياسات الفعلية (قياس Chromium محلي للقراءة فقط على نفس `index.html` المطابق لـ `5d9464b4`, SHA-256 `64d1f476...`):

| الشاشة واللغة | الاتجاه | `scrollWidth / innerWidth` | `#helpModalCloseBtn` (`W × H`, `top`, `hitOk`) | أزرار Quick Actions الـ 8 (`MinW–MaxW × H`, `clipped`) |
| :--- | :--- | :--- | :--- | :--- |
| `320×720 EN` | `ltr` | `320 / 320` (0 overflow) | `44 × 44 px` (`top=12`, `left=262..306`, `hitOk=true`) | `8/8` — `96.19–145.31 × 44 px` (`clipped=false`) |
| `320×720 AR` | `rtl` | `320 / 320` (0 overflow) | `44 × 44 px` (`top=12`, `left=14..58`, `hitOk=true`) | `8/8` — `99.72–144.02 × 44 px` (`clipped=false`) |
| `360×740 EN` | `ltr` | `360 / 360` (0 overflow) | `44 × 44 px` (`top=12`, `left=302..346`, `hitOk=true`) | `8/8` — `96.19–145.31 × 44 px` (`clipped=false`) |
| `360×740 AR` | `rtl` | `360 / 360` (0 overflow) | `44 × 44 px` (`top=12`, `left=14..58`, `hitOk=true`) | `8/8` — `99.72–144.02 × 44 px` (`clipped=false`) |
| `390×844 EN` | `ltr` | `390 / 390` (0 overflow) | `44 × 44 px` (`top=12`, `left=332..376`, `hitOk=true`) | `8/8` — `96.19–145.31 × 44 px` (`clipped=false`) |
| `390×844 AR` | `rtl` | `390 / 390` (0 overflow) | `44 × 44 px` (`top=12`, `left=14..58`, `hitOk=true`) | `8/8` — `99.72–144.02 × 44 px` (`clipped=false`) |
| `768×1024 EN` | `ltr` | `768 / 768` (0 overflow) | `44 × 44 px` (`top=86.2`, `left=669.63..713.63`, `hitOk=true`) | `8/8` — `96.19–145.31 × 44 px` (`clipped=false`) |

**تفصيل أبعاد الأزرار الثمانية (`data-help-action`, الارتفاع `44.00 px` في جميع الحالات، `visibility: visible`, `opacity: 1`):**
- **EN:** `go_library` (`130.78×44`), `add_session` (`127.25×44`), `go_planner` (`116.91×44`), `go_goals` (`132.42×44`), `go_tracker` (`96.19×44`), `open_account` (`145.31×44`), `open_drive` (`118.92×44`), `export_backup` (`139.97×44`).
- **AR:** `go_library` (`121.72×44`), `add_session` (`109.72×44`), `go_planner` (`99.72×44`), `go_goals` (`119.72×44`), `go_tracker` (`130.72×44`), `open_account` (`139.72×44`), `open_drive` (`115.88×44`), `export_backup` (`144.02×44`).

---

## 5. ملخص بنود WP 7.1 الأساسية المحفوظة في `5d9464b4`

1. **إصلاح هندسة PDF واستعادة التوافق (`#pdfAutoSaveStatus`):** إزالة القصّ والتداخل عبر `320x720`, `360x740`, `390x844` (EN/AR), `768x1024`, `1440x900`، والحفاظ على `'Free Plan'` في `deriveGoogleDriveDiagnosticsModel()` وحماية `.toast` (`pointer-events: none`).
2. **ثبات الشريط العلوي (`.navbar`) بالتمرير الحقيقي على الموبايل (`360x740` و`390x844`):** `html, body { overflow-y: visible; overflow-x: clip; }` و`.navbar { position: sticky; top: 0; z-index: 999; isolation: isolate; }` مع التحقق عبر `elementFromPoint` في **Subjects** و**Planner**.
3. **منع التقدم الوهمي في Help Center وإثبات الحفظ عبر `page.reload()`:** `exoHasRealAnnotationContent()` وتتبع IndexedDB الموثّق لكل حساب (`exoPersistedAnnotationLecturesByUid` / `pharmaPersistedAnnoCountV1_<uid>`) مع استبعاد `_isDemoSample` وسجلات `missed`/`absent` والأهداف غير المربوطة و`pendingAnnoSaveMap` والدخول غير المؤكد.
4. **تشخيصات Google Drive التسعة وتوقيت المزامنة وتدقيق أزرار Help:** الحالات التسع مع فصل شارتَي Connection وSync وتنقيح الأسرار (`[REDACTED]`)، واستعادة `pharmaLastCloudSyncIso_<uid>` عبر Reload دون ادعاء `Synced` أثناء Offline، وتغطية أزرار `?` السياقية والإجراءات الثمانية.

*(ملاحظة تاريخية: السجل المحلي السابق بتاريخ 2026-11-18 على `index.html` SHA-256 `490553b836308a959b5a04585c1a11f3b19862499ab57bf92d90189cd22cf3bc` كان قد سجّل `1,051/1,051` محليًا بدون `pg16`؛ وقد حُلّ محلّه الآن commit `5d9464b45170de5b6942cdfcf577e1308d21497d` الذي اجتاز CI #78 شاملًا PostgreSQL 16 وChromium E2E و`npm test`).*

---

## 6. القيود والمخاطر وقرارات المالك المتبقية

1. **التمييز بين `CI VERIFIED` و`APPROVED`:** اجتياز CI #78 (`44502700226`) هو تحقق تقني (`CI VERIFIED`) فقط ولا يُعلن اعتماد WP 7.1 أو Phase 6؛ يظل الفحص البصري والمنتجي والاعتماد قرارًا حصريًا للمالك.
2. **حدود المحاكاة في E2E:** اختبارات Chromium (في CI ومحليًا) تستخدم اعتراض شبكة (`page.route`) لـ Supabase وGoogle Identity Services (`gsi/client`) و`PDFJS_DETERMINISTIC_SHIM`، ولا تثبت اتصال OAuth حيًا بحساب Google حقيقي.
3. **بند P0 المفتوح في Production Supabase (`PGRST202`):** لم تتصل هذه الجولة بقاعدة Supabase Production ولا تزال حالة تنفيذ `public.sync_workspace_with_concurrency` الحية **`OPEN (NOT VERIFIED LIVE)`** وفق خطة الفحص للقراءة فقط الموثقة في `reports/PHASE_6_WP_7_0_6_REPORT.md` (§6).
4. **الفصل بين آخر مزامنة توثيقية سابقة وSource Commit:** تم رفع تحديثات التقريرين سابقًا في Documentation-Only Commit `7f8967af08c432353c756dd93c0b0a3dbb271282` (`2026-11-19T10:35:02Z`) مع نجاح **GitHub Pages #193** (`44507018990`). ونظرًا لاستثناء `reports/**` و`**/*.md` عبر `paths-ignore` في `.github/workflows/ci.yml`، فإن عدم تشغيل CI جديد على هذا التحديث التوثيقي كان مقصودًا. يظل إثبات **CI #78** (`44502700226`) مرتبطًا حصرًا بـ **Latest Source Commit** `5d9464b45170de5b6942cdfcf577e1308d21497d`، ولا يُنسب إلى أي تحديث توثيقي. يقتصر هذا التصحيح على البيانات الوصفية في ملفَي التقرير فقط، دون تغيير ملفات المصدر أو الاختبارات أو SQL أو أسرار البيئة.

