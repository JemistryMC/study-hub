# Current Project Handoff

**آخر تحديث:** 2026-11-05  
**المستودع:** `JemistryMC/study-hub`

هذا الملف هو المرجع الوحيد للحالة الحالية والمرحلة النشطة. إذا خالفه تقرير تاريخي أو تعليمات مرحلة قديمة، يُتبع هذا الملف ومستند المرحلة النشطة.

## 1. حالة المستودع

- فرع العمل النشط: `main`.
- خط الأساس المثبت لبداية المهمة الحالية (Required Starting Baseline HEAD):  
  `fea9c96b35193355253458de1128d61349cf28e7` (Commit البداية لـ M5-A.2.1 Final Acceptance Patch بعد نجاح CI Run #28: 459/459).
- تشغيلات CI السابقة المعتمدة:
  - M5-A.1: GitHub Actions Run #25 (Run ID: `42105196599`, Source SHA: `e16943d176a851561275d75e28a5f73ce9ec4fc9`) — **448/448 PASSED**.
  - M5-A.2: GitHub Actions Run #27 (Source SHA: `041a6476e0d77b6812ea3a519576dfd326cc44a8`) — **450/450 PASSED**.
  - M5-A.2.1 (Baseline): GitHub Actions Run #28 (Source SHA: `fea9c96b35193355253458de1128d61349cf28e7`) — **459/459 PASSED, CI SUCCESS**.
- الملفات المعدلة ضمن النطاق المصرح به لمهمة M5-A.2.1 Final Acceptance Patch:
  - `index.html`
  - `test_phase4_regressions.js`
  - `test_phase4_1_chromium_e2e.js`
  - `reports/CURRENT.md`
- لم يُعدّل ملف `test_phase3_cross_account_isolation.js` لعدم وجود عيوب فيه واجتيازه التام 52/52 في كافة التشغيلات.
- لم يُعد إنشاء الملف المحذوف سابقًا `_temp_test_debug.js`.
- لا تعتبر التعديلات المحلية الحالية لـ Milestone M5-A.2.1 Final Acceptance Patch مرفوعة إلى GitHub حتى يراجعها المالك ويزامنها ويتحقق من الـCommit SHA الجديد على GitHub.

الفروع المرجعية:
- `Deploying`: مرجع تاريخي لخط أساس سابق، وليس فرع العمل الحالي.
- `backup/pre-gemini-security-2026-11-04`: نقطة استرجاع محمية؛ لا تحذفها أو تعدلها.

## 2. نتائج الاختبار المثبتة

### 2.1 تشغيل CI المثبت لـ M5-A.2.1 Baseline (Run #28)
- GitHub Actions Run #28
- Source SHA: `fea9c96b35193355253458de1128d61349cf28e7`
- النتيجة المثبتة في CI: **459/459 PASSED (0 failed)** بنسبة نجاح 100%.
- الحالة: **CI VERIFIED — NOT APPROVED**.

### 2.2 تشغيل CI المثبت لـ M5-A.2 (Run #27)
- GitHub Actions Run #27
- Source SHA: `041a6476e0d77b6812ea3a519576dfd326cc44a8`
- النتيجة المثبتة في CI: **450/450 PASSED (0 failed)**.
- الحالة: **CI VERIFIED — NOT APPROVED**.

### 2.3 تشغيل CI المثبت لـ M5-A.1 (Run #25)
- GitHub Actions Run #25: `42105196599`
- Run URL: `https://github.com/JemistryMC/study-hub/actions/runs/42105196599`
- Source SHA: `e16943d176a851561275d75e28a5f73ce9ec4fc9`
- النتيجة المثبتة في CI: **448/448 PASSED (0 failed)**.
- الحالة: **CI VERIFIED — NOT APPROVED**.

### 2.4 نتائج الاختبارات المحلية لتعديلات M5-A.2.1 Final Acceptance Patch الحالية
- Base SHA: `fea9c96b35193355253458de1128d61349cf28e7`.
- `npm run lint`: **PASSED** (Syntax check لجميع ملفات الخادم والبناء والاختبارات دون أخطاء).
- `npm run build`: **PASSED**.
- `npm run test:static` (`run_verification_tests.js`): **54/54 PASSED**.
- `npm run test:unit`: **201/201 PASSED** موزعة كالتالي:
  - `run_comprehensive_verification.js`: **42/42 PASSED**.
  - `test_phase3_cross_account_isolation.js`: **52/52 PASSED**.
  - `test_phase4_regressions.js`: **107/107 PASSED** (شاملة الفحوصات الثمانية لـ Test J: `T-5.1-09-J1` إلى `J8`).
- `npm run test:pglite` (`test_phase4_2_postgres_integration.js`): **41/41 PASSED**.
- `npm run test:e2e` (`test_phase4_1_chromium_e2e.js`): **71/71 PASSED** (شاملة السيناريوهات الكاملة A–V والسيناريو W المعزز مع مسح المخزن الفعال والتحقق التام من الفئات الـ12 بعد Reload #1 وReload #2).
- `npm run test:pg16` (`test_phase4_2_1_pg16_concurrency.js`): **NOT RUN LOCALLY** (يتطلب خادم PostgreSQL 16 مخصص على المنفذ `5432`؛ يُشغّل في GitHub Actions CI متوقعًا 96 فحصًا إضافيًا بإجمالي 463).
- إجمالي الفحوصات المنفذة محليًا: **367/367 PASSED (0 failed)**.

## 3. العمل المنجز والمرجع التاريخي

### Phase 4.2.x — Security, OCC, PostgreSQL 16
سجلات تاريخية مثبتة.

### Phase 5.0 — Storage, Sync & Google Drive Audit
تقرير التدقيق المرجعي في `reports/phases/phase-5-storage-sync-audit/gemini-report.md`.

### Phase 5.1.0 / 5.1.1 — Implementation Blueprint
المستند: `reports/phases/phase-5-storage-sync-audit/phase-5-1-implementation-blueprint.md`.

### Milestone M5-A.1 — Provenance & Fail-Closed Reconciliation
Commit: `e16943d176a851561275d75e28a5f73ce9ec4fc9`  
GitHub Actions Run #25: `448/448 PASSED`  
الحالة: **CI VERIFIED — NOT APPROVED**.

### Milestone M5-A.2 — Test Harness Compatibility & CI Restoration
Commit: `041a6476e0d77b6812ea3a519576dfd326cc44a8`  
GitHub Actions Run #27: `450/450 PASSED`  
الحالة: **CI VERIFIED — NOT APPROVED**.

### Milestone M5-A.2.1 — Baseline CI Verification
Commit: `fea9c96b35193355253458de1128d61349cf28e7`  
GitHub Actions Run #28: `459/459 PASSED, CI SUCCESS`  
الحالة: **CI VERIFIED — NOT APPROVED**.

## 4. المرحلة النشطة

# Milestone M5-A.2.1 — Final Acceptance Patch

**Status: IMPLEMENTED — LOCAL TESTS ONLY (IN PROGRESS — NOT APPROVED)**

- مسار العمل الحالي: **M5-A.2.1 Final Acceptance Patch (سلامة البيان الموثق Manifest Integrity، التحقق الإيجابي الإلزامي من IndexedDB، واختبار Chromium المعزز عبر عمليتي Reload مع مسح المخزن الفعال والتحقق التام من الفئات الـ12)**.
- مسار العمل القادم: **Milestone M5 Workstream B (F-05 Annotation Decoupling & N-02 Version-Counter Redesign)**.
- **حدود الاعتماد:** لا يُعتبر Milestone M5 مكتملاً حتى يكتمل كلا مساري العمل (M5-A ومسار M5-B) ويجتازا المراجعة المستقلة وCI.

### التصحيحات المنفذة في Final Acceptance Patch:

1. **سلامة وتماسك البيان الموثق Manifest Integrity:**
   - إيقاف الاقتطاع الصامت للبيان الموثق إلى 50 مدخلة في `preserveUnverifiedGuestWorkspace` والحفاظ على كافة المدخلات الصالحة القائمة دون بتر.
   - التحقق الصارم من مدخلة البيان الموثق المطابقة لـ `quarantineId` في `restoreUnverifiedGuestWorkspace`، والتحقق التام من مطابقة معرّف العزل، وعدد الحواشي المتوقع، ومفتاح الخزنة `annotationsVaultKey`.
   - رفض المدخلات المفقودة أو غير المتطابقة أو الفاسدة fail-closed برمز `missing_manifest_entry` أو `manifest_verification_mismatch`.
   - التحقق الإيجابي من نجاح حفظ اللقطة والبيان الموثق في LocalStorage عبر القراءة المباشرة قبل إعلان النجاح.
   - إضافة اختبار حقن الفشل لفشل حفظ البيان الموثق في LocalStorage (`T-5.1-09-J5`) مع التأكد من بقاء لقطات العزل السابقة قابلة للاستعادة دون إتلافها.

2. **التحقق الإيجابي الإلزامي من جاهزية IndexedDB:**
   - فتح وتهيئة قاعدة IndexedDB عبر المسار الحقيقي للتطبيق `initPdfDB()` عند عدم توفر `dbInstance`.
   - إلزامية توفر المخزنين `annotations` و`annotation_recovery_vault` وفحص السجلات الملتزمة وسجلات التعافي قبل البت في أن الضيف يملك 0 حواشٍ.
   - إذا تعذر فتح أو قراءة قاعدة البيانات، يتم الإجهاض الصارم fail-closed برمز `quarantine_persistence_failed`، ولا يُستنتج أبدًا خلو الحواشي من قاعدة بيانات غير متاحة.
   - إضافة فحوصات:
     - قاعدة البيانات غير متاحة مع وجود حواشٍ معلقة (`T-5.1-09-J1`).
     - قاعدة البيانات غير متاحة مع عدم وجود حواشٍ معلقة (`T-5.1-09-J2`).
     - التحقق الناجح من خلو المخازن الحقيقي (`T-5.1-09-J3`).
     - الحفاظ على الحواشي الملتزمة والتحقق الإيجابي منها في الخزنة (`T-5.1-09-J4`).

3. **تعزيز سيناريو Chromium E2E (Scenario W) عبر عمليتي Reload:**
   - مسح مفاتيح LocalStorage النشطة للفئات الثماني (المواد، الجدول، المهام، التفضيلات، التقارير، السجلات، الأكاديمية، سجل الوسائط) ومسح مفاتيح Causal Engine الفعالة (شواهد القبور، سجل التعافي، سجل الأجهزة، علامة dirty) وتفريغ الذاكرة وحذف الحواشي الحية من IndexedDB قبل بدء الاستعادة، مع الإبقاء الحصري على لقطة العزل والبيان وسجل الخزنة.
   - بعد الاستعادة (Reload #1)، مطابقة كافة الفئات الـ12 بدقة ضد المحتوى الأصلي المتوقع.
   - بعد إعادة التحميل الثانية (Reload #2)، مطابقة الفئات الـ12 مجددًا ضد المحتوى الأصلي، بما يثبت أن الاستعادة اعتمدت كليًا على لقطة العزل وسجل الخزنة وليس على بيانات متبقية في LocalStorage.
   - إضافة فحوصات حقن الفشل في Chromium الحقيقي (`Test W.4`) لرفض البيان المفقود وغياب سجل الخزنة fail-closed.

### الملفات الأربعة الوحيدة المعدلة ضمن النطاق المصرح به:
1. `index.html`
2. `test_phase4_regressions.js`
3. `test_phase4_1_chromium_e2e.js`
4. `reports/CURRENT.md`

### حدود الاعتماد الحالية
- حالة المرحلة الحالية هي **`IMPLEMENTED — LOCAL TESTS ONLY (IN PROGRESS — NOT APPROVED)`**.
- لم يتم اعتماد المرحلة بعد (`NOT APPROVED`)؛ الاعتماد النهائي قرار المالك بعد استكمال M5-B والمراجعة المستقلة ونجاح CI.

## 5. سياسة المنتج والحسابات

### Free
الحفظ المحلي الأساسي وبيانات Workspace الأكاديمية ومزامنة البيانات والـannotations الأساسية عبر Supabase متاحة للمستخدم المسجل عندما تكون الخدمة مهيأة وتنجح صلاحياتها.
- **Annotated PDF Export مجاني** لمستخدمي Free وVIP.
- **Extra Note Sheet مجاني** لمستخدمي Free وVIP، ويسمح بإنشاء عدة Note Sheets؛ لا تجعل `can_upload_media` شرطًا لإنشاء الورقة أو الوصول إليها.

### VIP
الاستحقاق يدوي من المالك باستخدام:
- الجدول: `public.user_workspaces`
- العمود: `can_upload_media`
- المالك يغيّر القيمة يدويًا بين FALSE وTRUE لمنح أو إلغاء استحقاق رفع الوسائط ومزامنة Google Drive.

## 6. خطوات العمل بعد M5-A.2.1 Final Acceptance Patch

1. مراجعة مستقلة لتعديلات Final Acceptance Patch في الملفات الأربعة المصرح بها.
2. قرار المالك بشأن مزامنة GitHub وتشغيل GitHub Actions CI (متوقع نجاح 463 فحصًا).
3. بعد اعتماد M5-A وتجميدها، الانتقال مباشرة إلى **Milestone M5 Workstream B (F-05 & N-02)**.
4. لا تنفذ M5-B تلقائيًا.

## 7. دورة المراجعة والمزامنة

1. Gemini يقرأ `GEMINI.md` وهذا الملف ومستند المرحلة النشطة.
2. Gemini يفحص Base SHA والفرع والملفات السابقة.
3. Gemini يعدّل الملفات التي تسمح بها المرحلة فقط.
4. يعرض Gemini Diff كاملًا وقائمة الملفات والاختبارات الفعلية والقيود.
5. المالك وحده يقرر GitHub Sync.
6. بعد ظهور Commit على GitHub نتحقق من SHA والملفات والـDiff.
7. لا تعتبر المهمة APPROVED إلا بعد مراجعة مستقلة وقرار المالك.
