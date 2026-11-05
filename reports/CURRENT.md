# Current Project Handoff

**آخر تحديث:** 2026-11-05  
**المستودع:** `JemistryMC/study-hub`

هذا الملف هو المرجع الوحيد للحالة الحالية والمرحلة النشطة. إذا خالفه تقرير تاريخي أو تعليمات مرحلة قديمة، يُتبع هذا الملف ومستند المرحلة النشطة.

## 1. حالة المستودع

- فرع العمل النشط: `main`.
- خط الأساس المثبت لبداية المهمة الحالية (Required Starting Baseline HEAD):  
  `9a96ab0b5cc92c21061b1b8d02dca558b57e221f` (Commit لـ Milestone M5-A.2 المتعثر في تشغيل CI Run #26).
- Commit البداية لـ M5-A.1 المعتمد عبر CI:  
  `e16943d176a851561275d75e28a5f73ce9ec4fc9` (GitHub Actions Run #25: 448/448 PASSED).
- الملفات المعدلة ضمن النطاق المصرح به لمهمة التصحيح M5-A.2:
  - `index.html`
  - `test_phase3_cross_account_isolation.js`
  - `test_phase4_regressions.js`
  - `test_phase4_1_chromium_e2e.js`
  - `reports/CURRENT.md`
- الملفات المحذوفة المصرح بها:
  - تم حذف الملف التجريبي العرضي `_temp_test_debug.js` نهائيًا.
- لا تعتبر التعديلات المحلية الحالية لـ Milestone M5-A.2 مرفوعة إلى GitHub حتى يراجعها المالك ويزامنها ويتحقق من الـCommit SHA الجديد على GitHub.

الفروع المرجعية:
- `Deploying`: مرجع تاريخي لخط أساس سابق، وليس فرع العمل الحالي.
- `backup/pre-gemini-security-2026-11-04`: نقطة استرجاع محمية؛ لا تحذفها أو تعدلها.

## 2. نتائج الاختبار المثبتة

### 2.1 آخر تشغيل CI ناجح ومثبت على GitHub (Milestone M5-A.1 — Run #25)
- GitHub Actions Run #25: `42104593921`
- Run URL: `https://github.com/JemistryMC/study-hub/actions/runs/42104593921`
- Source SHA: `e16943d176a851561275d75e28a5f73ce9ec4fc9`
- النتيجة المثبتة في CI: **448/448 PASSED (0 failed)** موزعة كالتالي:
  - Static Security (`run_verification_tests.js`): **54/54 PASSED**.
  - Unit Verification (`run_comprehensive_verification.js`): **42/42 PASSED**.
  - Phase 4.1 Cross-Account Isolation (`test_phase3_cross_account_isolation.js`): **52/52 PASSED**.
  - Asynchronous Regression (`test_phase4_regressions.js`): **97/97 PASSED**.
  - Embedded PostgreSQL (`test_phase4_2_postgres_integration.js` — PGlite): **41/41 PASSED**.
  - Real PostgreSQL 16 Concurrency (`test_phase4_2_1_pg16_concurrency.js`): **96/96 PASSED**.
  - Headless Chromium + IndexedDB Browser E2E (`test_phase4_1_chromium_e2e.js` — Scenarios A–V): **66/66 PASSED**.
- الحالة: **CI VERIFIED — NOT APPROVED**.

### 2.2 تشغيل CI المتعثر (Milestone M5-A.2 — Run #26)
- GitHub Actions Run #26
- Source SHA: `9a96ab0b5cc92c21061b1b8d02dca558b57e221f`
- سبب التعثر في CI:
  فشل الفحص `T-M1-C01r (Test D.3)` في `test_phase3_cross_account_isolation.js` برسالة:
  `syncWorkspaceOnLogin aborted: verifyLocalWorkspaceProvenance is unavailable (fail-closed)`
- السبب الجذري: بيئة الاختبار المعزولة في `test_phase3_cross_account_isolation.js` لم تكن تستخرج وتُصدّر الدوال الإنتاجية `verifyLocalWorkspaceProvenance` و`preserveUnverifiedGuestWorkspace` و`restoreUnverifiedGuestWorkspace` من `index.html`، مما جعل الفحص الأمني الإيجابي يفشل fail-closed تلقائيًا داخل بيئة الاختبار.
- الحل: تم تصدير واستخراج الدوال الإنتاجية الحقيقية بالكامل إلى بيئة الاختبار وتزويد `InMemoryIDBDatabase` بـ `objectStoreNames`، واجتاز الفحص بنجاح 52/52 دون أي إضعاف لضوابط الإنتاج.

### 2.3 نتائج الاختبارات المحلية لتعديلات Milestone M5-A.2 التصحيحية الحالية
- Base SHA: `9a96ab0b5cc92c21061b1b8d02dca558b57e221f`.
- `npm run lint`: **PASSED** (Syntax check لجميع ملفات الخادم والبناء والاختبارات دون أخطاء).
- `npm run build`: **PASSED**.
- `npm run test:static` (`run_verification_tests.js`): **54/54 PASSED**.
- `npm run test:unit`: **192/192 PASSED** موزعة كالتالي:
  - `run_comprehensive_verification.js`: **42/42 PASSED**.
  - `test_phase3_cross_account_isolation.js`: **52/52 PASSED** (اجتاز بالكامل بعد تزويده بالدوال الإنتاجية).
  - `test_phase4_regressions.js`: **98/98 PASSED** (شاملة الفحوصات التسعة `T-5.1-09-A` حتى `T-5.1-09-I`).
- `npm run test:pglite` (`test_phase4_2_postgres_integration.js`): **41/41 PASSED**.
- `npm run test:e2e` (`test_phase4_1_chromium_e2e.js`): **67/67 PASSED** (شاملة السيناريوهات الكاملة A–V بعد إضافة استعادة مساحة عمل الضيف `Test V.7`).
- `npm run test:pg16` (`test_phase4_2_1_pg16_concurrency.js`): **NOT RUN LOCALLY** (يتطلب خادم PostgreSQL 16 مخصص على المنفذ `5432`؛ يُشغّل في GitHub Actions CI متوقعًا 96 فحصًا إضافيًا بإجمالي 449).
- إجمالي الفحوصات المنفذة محليًا: **354/354 PASSED (0 failed)**.

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

## 4. المرحلة النشطة

# Milestone M5-A.2 — Quarantine Recovery, Test Harness Compatibility & CI Restoration

**Status: IMPLEMENTED — LOCAL TESTS ONLY (IN PROGRESS — NOT APPROVED)**

- مسار العمل الحالي: **M5-A.2 التصحيحي (استعادة مساحة عمل الضيف المعزولة، تكامل بيئة الاختبارات، وتصحيح انقطاع CI)**.
- مسار العمل القادم: **Milestone M5 Workstream B (F-05 Annotation Decoupling & N-02 Version-Counter Redesign)**.
- **حدود الاعتماد:** لا يُعتبر Milestone M5 مكتملاً حتى يكتمل كلا مساري العمل (M5-A ومسار M5-B) ويجتازا المراجعة المستقلة وCI.

### التصحيحات المنفذة في M5-A.2:

1. **حل انقطاع CI في تشغيل Run #26:**
   - فحص بيئة الاختبار `test_phase3_cross_account_isolation.js` وإضافة استخراج وتصدير الدوال الإنتاجية الحقيقية: `verifyLocalWorkspaceProvenance` و`preserveUnverifiedGuestWorkspace` و`restoreUnverifiedGuestWorkspace` مع دعم `objectStoreNames` في `InMemoryIDBDatabase`.
   - نجاح الفحص `T-M1-C01r (Test D.3)` ومرور جميع اختبارات العزل 52/52 محليًا.

2. **تعزيز الإغلاق الآمن لعزل بيانات الضيف (Fail-Closed Quarantine Persistence):**
   - في `preserveUnverifiedGuestWorkspace`: التأكد التام من إجهاض العزل إذا فشل تفريغ الحواشي المعلقة أو تعطلت معاملات IndexedDB لكتابة `annotation_recovery_vault`، مع إرجاع سبب الفشل الصريح `quarantine_persistence_failed` وإبقاء البيانات متسخة محليًا دون مساس.

3. **استعادة مساحة عمل الضيف القابلة للتحقق (Verifiable Guest Quarantine Restoration):**
   - في `restoreUnverifiedGuestWorkspace`: التحقق من نجاح معاملات الكتابة لـ IndexedDB قبل إرجاع النجاح، واستعادة كافة الحقول الأكاديمية الثمانية، وشواهد القبور السببية `_tombstones` وسجلات التعافي `_conflictRecovery` وسجل الأجهزة `_deviceRegistry`، مع رفع علم الاتساخ للمزامنة اللاحقة.

4. **حذف الملفات المؤقتة غير المصرح بها:**
   - تم حذف `_temp_test_debug.js` بالكامل لتطهير المستودع والالتزام الصارم بالنطاق المصرح به.

### الملفات الخمسة الوحيدة المعدلة ضمن النطاق المصرح به:
1. `index.html`
2. `test_phase3_cross_account_isolation.js`
3. `test_phase4_regressions.js`
4. `test_phase4_1_chromium_e2e.js`
5. `reports/CURRENT.md`

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

## 6. خطوات العمل بعد M5-A.2

1. مراجعة مستقلة لتعديلات M5-A.2 في الملفات الخمسة المصرح بها.
2. قرار المالك بشأن مزامنة GitHub وتشغيل GitHub Actions CI (Run #27).
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

