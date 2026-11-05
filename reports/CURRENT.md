# Current Project Handoff

**آخر تحديث:** 2026-11-05  
**المستودع:** `JemistryMC/study-hub`

هذا الملف هو المرجع الوحيد للحالة الحالية والمرحلة النشطة. إذا خالفه تقرير تاريخي أو تعليمات مرحلة قديمة، يُتبع هذا الملف ومستند المرحلة النشطة.

## 1. حالة المستودع

- فرع العمل النشط: `main`.
- خط الأساس المثبت لبداية المهمة الحالية (Required Starting Baseline HEAD):  
  `041a6476e0d77b6812ea3a519576dfd326cc44a8` (Commit البداية لـ M5-A.2.1 بعد نجاح تشغيل CI Run #27).
- Commit السابق لـ M5-A.1 المعتمد عبر CI:  
  `e16943d176a851561275d75e28a5f73ce9ec4fc9` (GitHub Actions Run #25: 448/448 PASSED).
- الملفات المعدلة ضمن النطاق المصرح به لمهمة M5-A.2.1:
  - `index.html`
  - `test_phase4_regressions.js`
  - `test_phase4_1_chromium_e2e.js`
  - `reports/CURRENT.md`
- لم يُعدّل ملف `test_phase3_cross_account_isolation.js` لعدم وجود عيوب فيه واجتيازه التام 52/52 في Run #27 ومحليًا.
- لم يُعد إنشاء الملف المحذوف سابقًا `_temp_test_debug.js`.
- لا تعتبر التعديلات المحلية الحالية لـ Milestone M5-A.2.1 مرفوعة إلى GitHub حتى يراجعها المالك ويزامنها ويتحقق من الـCommit SHA الجديد على GitHub.

الفروع المرجعية:
- `Deploying`: مرجع تاريخي لخط أساس سابق، وليس فرع العمل الحالي.
- `backup/pre-gemini-security-2026-11-04`: نقطة استرجاع محمية؛ لا تحذفها أو تعدلها.

## 2. نتائج الاختبار المثبتة

### 2.1 تشغيل CI المثبت لـ M5-A.2 (Run #27)
- GitHub Actions Run #27
- Source SHA: `041a6476e0d77b6812ea3a519576dfd326cc44a8`
- النتيجة المثبتة في CI: **450/450 PASSED (0 failed)** بنسبة نجاح 100%.
- الحالة: **CI VERIFIED — NOT APPROVED**.

### 2.2 تشغيل CI المثبت لـ M5-A.1 (Run #25)
- GitHub Actions Run #25: `42105196599`
- Run URL: `https://github.com/JemistryMC/study-hub/actions/runs/42105196599`
- Source SHA: `e16943d176a851561275d75e28a5f73ce9ec4fc9`
- النتيجة المثبتة في CI: **448/448 PASSED (0 failed)**.
- الحالة: **CI VERIFIED — NOT APPROVED**.

### 2.3 نتائج الاختبارات المحلية لتعديلات Milestone M5-A.2.1 الحالية
- Base SHA: `041a6476e0d77b6812ea3a519576dfd326cc44a8`.
- `npm run lint`: **PASSED** (Syntax check لجميع ملفات الخادم والبناء والاختبارات دون أخطاء).
- `npm run build`: **PASSED**.
- `npm run test:static` (`run_verification_tests.js`): **54/54 PASSED**.
- `npm run test:unit`: **197/197 PASSED** موزعة كالتالي:
  - `run_comprehensive_verification.js`: **42/42 PASSED**.
  - `test_phase3_cross_account_isolation.js`: **52/52 PASSED**.
  - `test_phase4_regressions.js`: **103/103 PASSED** (شاملة الفحوصات الجديدة لـ M5-A.2.1: `T-5.1-09-C1`, `T-5.1-09-J1` إلى `J4`).
- `npm run test:pglite` (`test_phase4_2_postgres_integration.js`): **41/41 PASSED**.
- `npm run test:e2e` (`test_phase4_1_chromium_e2e.js`): **71/71 PASSED** (شاملة السيناريوهات الكاملة A–V والسيناريو الجديد W المعتمد على عمليتي reload حقيقيتين واختبارات حقن الفشل: `Test W.1` إلى `Test W.4`).
- `npm run test:pg16` (`test_phase4_2_1_pg16_concurrency.js`): **NOT RUN LOCALLY** (يتطلب خادم PostgreSQL 16 مخصص على المنفذ `5432`؛ يُشغّل في GitHub Actions CI متوقعًا 96 فحصًا إضافيًا بإجمالي 459).
- إجمالي الفحوصات المنفذة محليًا: **363/363 PASSED (0 failed)**.

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

## 4. المرحلة النشطة

# Milestone M5-A.2.1 — Final Durable Guest Recovery Completion

**Status: IMPLEMENTED — LOCAL TESTS ONLY (IN PROGRESS — NOT APPROVED)**

- مسار العمل الحالي: **M5-A.2.1 (إكمال متانة وصدقية عزل واستعادة مساحة عمل الضيف، التحقق الإيجابي من IndexedDB، واستعادة شواهد القبور وسجلات التعافي وسجل الأجهزة إلى مخازنها القياسية)**.
- مسار العمل القادم: **Milestone M5 Workstream B (F-05 Annotation Decoupling & N-02 Version-Counter Redesign)**.
- **حدود الاعتماد:** لا يُعتبر Milestone M5 مكتملاً حتى يكتمل كلا مساري العمل (M5-A ومسار M5-B) ويجتازا المراجعة المستقلة وCI.

### التصحيحات المنفذة في M5-A.2.1:

1. **تصحيح العزل الإيجابي في IndexedDB (Correction A):**
   - في `preserveUnverifiedGuestWorkspace`: إلزامية وجود `dbInstance` والمخازن `annotations` و`annotation_recovery_vault` عند الحاجة لحفظ الحواشي أو التحقق من وجودها.
   - قراءة الحواشي الملتزمة وحواشي الخزنة غير الملتزمة الخاصة بـ `local` والحواشي غير الملتزمة في الذاكرة مع العزل الصارم ضد بيانات أي حساب مصادق آخر.
   - كتابة سجل العزل في `annotation_recovery_vault` وانتظار اكتمال المعاملة `tx.oncomplete` وقراءة السجل فورًا للتأكد من تطابق العدد والمحتوى؛ وفي حال فشل المعاملة أو تعذر القراءة الإيجابية يتم الإجهاض برمز `quarantine_persistence_failed` دون ادعاء نجاح كاذب ودون إتلاف البيانات المتسخة المحلية.

2. **استعادة البيانات إلى مخازنها القياسية الحقيقية (Correction B):**
   - في `restoreUnverifiedGuestWorkspace`: استعادة شواهد القبور السببية `_tombstones` إلى المفتاح القياسي `pharmaTombstones_local` مع التطبيع الكامل، دون اختراع دوال وهمية.
   - استعادة سجلات التعافي من النزاع `_conflictRecovery` إلى `pharmaConflictRecovery_local`.
   - استعادة سجل الأجهزة `_deviceRegistry` إلى `pharmaDeviceRegistry_local` مع دمج السجلات القائمة وعدم نسبها للمستخدم المصادق.

3. **التحقق من استعادة الحواشي قبل إعلان النجاح (Correction C):**
   - التحقق من البيان الموثق (manifest entry) ووجود سجل الخزنة ومطابقة عدد الحواشي المتوقع.
   - كتابة الحواشي إلى مخزن `annotations` مع انتظار اكتمال المعاملة `tx.oncomplete` وقراءة الحواشي المستعادة للتأكد من هويتها وتطابقها؛ وإذا تعذر أي فحص يتم الإجهاض الصريح مع الاحتفاظ بسجل العزل كاملاً للاستعادة لاحقاً دون ادعاء نجاح كاذب.

4. **اختبارات Chromium E2E الحقيقية عبر عمليتي Reload (Correction D):**
   - إضافة السيناريو `Test W` في `test_phase4_1_chromium_e2e.js`: إنشاء مساحة عمل غنية بالبيانات مع شواهد قبور وسجلات تعافي وسجل أجهزة وحواشي في IndexedDB، وتفعيل العزل، ثم إعادة تحميل الصفحة مرتين والتأكد من بقاء واستعادة كافة الفئات والحواشي وسجلات Causal Engine بنجاح 100%.

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

## 6. خطوات العمل بعد M5-A.2.1

1. مراجعة مستقلة لتعديلات M5-A.2.1 في الملفات الأربعة المصرح بها.
2. قرار المالك بشأن مزامنة GitHub وتشغيل GitHub Actions CI (Run #28 متوقع).
3. بعد اعتماد M5-A، الانتقال إلى **Milestone M5 Workstream B (F-05 & N-02)**.
4. لا تنفذ M5-B تلقائيًا.

## 7. دورة المراجعة والمزامنة

1. Gemini يقرأ `GEMINI.md` وهذا الملف ومستند المرحلة النشطة.
2. Gemini يفحص Base SHA والفرع والملفات السابقة.
3. Gemini يعدّل الملفات التي تسمح بها المرحلة فقط.
4. يعرض Gemini Diff كاملًا وقائمة الملفات والاختبارات الفعلية والقيود.
5. المالك وحده يقرر GitHub Sync.
6. بعد ظهور Commit على GitHub نتحقق من SHA والملفات والـDiff.
7. لا تعتبر المهمة APPROVED إلا بعد مراجعة مستقلة وقرار المالك.

