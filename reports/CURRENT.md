# Current Project Handoff

**آخر تحديث:** 2026-11-05  
**المستودع:** `JemistryMC/study-hub`

هذا الملف هو المرجع الوحيد للحالة الحالية والمرحلة النشطة. إذا خالفه تقرير تاريخي أو تعليمات مرحلة قديمة، يُتبع هذا الملف ومستند المرحلة النشطة.

## 1. حالة المستودع

- فرع العمل النشط: `main`.
- آخر `main` تم التحقق منه كبداية لمهمة Phase 5.1.3.1 الحالية (Base HEAD):  
  `3925b5133eef07cd165dadcfbea0b4b30a6d4b2f`
- الـCommit الأب (بداية Phase 5.1.3):  
  `1c65d0ac70f8d6915d2bb92086834bac51ae2fce`
- الـBlobs الأساسية عند بداية Phase 5.1.3.1 (`3925b5133eef07cd165dadcfbea0b4b30a6d4b2f`):
  - `index.html`: `3e516e5e6bb44cea698b6c3d2c45752eef3317d3`
  - `test_phase4_regressions.js`: `867d2dabcd1add5f7095bbfeb16d9629ebf7b663`
  - `test_phase4_1_chromium_e2e.js`: `416b2d5df65ebf49844fd4e00109c1eacd5cc7a0`
  - `reports/CURRENT.md`: `f9c05acc4381759b64e5bd2f0ec86b45fae17cc7`
- لا تعتبر التعديلات المحلية الحالية لـ Phase 5.1.3.1 مرفوعة إلى GitHub حتى يراجعها المالك ويزامنها ويتحقق من الـCommit SHA الجديد على GitHub.

الفروع المرجعية:
- `Deploying`: مرجع تاريخي لخط أساس سابق، وليس فرع العمل الحالي.
- `backup/pre-gemini-security-2026-11-04`: نقطة استرجاع محمية؛ لا تحذفها أو تعدلها.

## 2. نتائج الاختبار المثبتة

### 2.1 آخر تشغيل CI موثق على GitHub (Phase 5.1.3 — Run #22)
- GitHub Actions Run #22: `42089989335`
- Run URL: `https://github.com/JemistryMC/study-hub/actions/runs/42089989335`
- Source SHA: `3925b5133eef07cd165dadcfbea0b4b30a6d4b2f`
- النتيجة المثبتة في CI: **425/425 PASSED (0 failed)** موزعة كالتالي:
  - Static (`run_verification_tests.js`): **54/54 PASSED**.
  - Unit (`run_comprehensive_verification.js` **42/42** + `test_phase3_cross_account_isolation.js` **52/52** + `test_phase4_regressions.js` **80/80**): **174/174 PASSED**.
  - Embedded PostgreSQL (`test_phase4_2_postgres_integration.js` — PGlite): **41/41 PASSED**.
  - Real PostgreSQL 16 (`test_phase4_2_1_pg16_concurrency.js`): **96/96 PASSED**.
  - Real Headless Chromium + IndexedDB E2E (`test_phase4_1_chromium_e2e.js` — Scenarios A–U): **60/60 PASSED**.

### 2.2 تشغيل CI السابق (Phase 5.1.2 — Run #21)
- GitHub Actions Run #21: `42077770432`
- Run URL: `https://github.com/JemistryMC/study-hub/actions/runs/42077770432`
- Source SHA: `1c65d0ac70f8d6915d2bb92086834bac51ae2fce`
- النتيجة المثبتة في CI: **411/411 PASSED (0 failed)**.
- الحالة: **CI VERIFIED — NOT APPROVED**.

### 2.3 نتائج الاختبارات المحلية لتعديلات Phase 5.1.3.1 الحالية (محليًا فقط قبل GitHub Sync)
- Base SHA: `3925b5133eef07cd165dadcfbea0b4b30a6d4b2f` (+ التعديلات المحلية في الملفات الثلاثة المصرح بها فقط).
- `npm run lint`: **PASSED** (فحص syntax لجميع ملفات الخادم والبناء والاختبارات).
- `npm run build`: **PASSED**.
- `npm run test:static` (`run_verification_tests.js`): **54/54 PASSED**.
- `npm run test:unit`: **177/177 PASSED** موزعة كالتالي:
  - `run_comprehensive_verification.js`: **42/42 PASSED**.
  - `test_phase3_cross_account_isolation.js`: **52/52 PASSED**.
  - `test_phase4_regressions.js`: **83/83 PASSED** (شاملة 80 فحصًا سابقًا + 3 فحوصات جديدة في `TEST 17`: `T-5.1.3.1-A1` و`T-5.1.3.1-B1` و`T-5.1.3.1-B2`).
- `npm run test:pglite` (`test_phase4_2_postgres_integration.js`): **41/41 PASSED**.
- `npm run test:e2e` (`test_phase4_1_chromium_e2e.js`): **60/60 PASSED** (الملف لم يُعدل مطلقًا وظل مطابقًا للـBaseline blob `416b2d5df65ebf49844fd4e00109c1eacd5cc7a0`).
- `npm run test:pg16` (`test_phase4_2_1_pg16_concurrency.js`): **NOT RUN LOCALLY** (يتطلب خادم PostgreSQL 16 محلي على المنفذ `5432` غير متاح داخل حاوية AI Studio؛ يُشغّل في GitHub Actions CI).
- إجمالي الفحوصات المنفذة محليًا: **332/332 PASSED (0 failed)**.

## 3. العمل المنجز والمرجع التاريخي

### Phase 4.2.x — Security, OCC, PostgreSQL 16

تقارير وملفات هذه المرحلة سجلات هندسية تاريخية. لا تجعلها المرحلة النشطة مرة أخرى ولا تعِد تنفيذها تلقائيًا. ارجع إليها فقط عندما تتطلب Phase حالية دليلًا أو سياقًا محددًا منها.

### Phase 5.0 — Storage, Sync & Google Drive Audit

تقرير التدقيق المرجعي موجود في:
`reports/phases/phase-5-storage-sync-audit/gemini-report.md` (Commit: `1758bba343746f4b457d8793fa9389b80117bcf8`).

### Phase 5.1.0 / 5.1.1 — Implementation Blueprint

المستند: `reports/phases/phase-5-storage-sync-audit/phase-5-1-implementation-blueprint.md` (Commit: `6020a78e585d415ca3d8dcdd37a024cda2614652`).
الحالة: **CHANGES REQUESTED — NOT APPROVED**.

### Phase 5.1.2 — Corrective Integration of M2 + M3 + M4

Commit: `1c65d0ac70f8d6915d2bb92086834bac51ae2fce`  
GitHub Actions Run #21: `42077770432` (`411/411 PASSED`)  
الحالة: **CI VERIFIED — NOT APPROVED**.

### Phase 5.1.3 — Causal Save Safety, Deletion Semantics & Real Annotation UI E2E

Commit: `3925b5133eef07cd165dadcfbea0b4b30a6d4b2f`  
GitHub Actions Run #22: `42089989335` (`425/425 PASSED`)  
الحالة: **CI VERIFIED — NOT APPROVED**.

## 4. المرحلة النشطة

# Phase 5.1.3.1 — Final Integrity Corrections: Weekly Report References, Tombstone Fail-Closed Coverage & Accurate Handoff

**Status: IN PROGRESS — NOT APPROVED**

**الهدف:** متابعة تصحيحية محدودة النطاق ومحددة بدقة فوق Commit `3925b5133eef07cd165dadcfbea0b4b30a6d4b2f` (Run #22: `425/425`) لمعالجة تكامل علاقات التقارير الأسبوعية وسد فجوات تغطية الفشل المغلق في مسارات الحذف، وتصحيح مصطلحات تسليم الـHandoff:
1. الحفاظ الكامل على التقارير الأسبوعية وأهدافها المؤرشفة (`archivedGoals`) عند حذف المواد مع فك مراجع المواد الملغاة فقط وختم التعديل سببيًا وحفظه محليًا.
2. فرض الإجهاض الآمن المغلق (Fail-Closed) في جميع مسارات الحذف إذا كان مساعد حفظ شواهد الحذف غير متاح أو فشل في الحفظ، مع إضافة تغطية حقن الفشل لـ `deleteSessionDirect` و`deleteEventFromPdfAdjuster`.
3. تصحيح التوصيفات التقنية في التوثيق: استخدام المفتاح الفعلي لمعرف الجهاز (`exo_installation_device_id_v1`)، ومسار معرف الفاعل الحي في الذاكرة (`liveTabActorId`)، والمساعدات الفعلية لشواهد الحذف (`recordTombstone()` و`recordTombstonesAtomicBatch()`) دون الإشارة لمساعد وهمي.

**الملفات الثلاثة الوحيدة المعدلة ضمن النطاق المصرح به:**
1. `index.html`
2. `test_phase4_regressions.js`
3. `reports/CURRENT.md`

*(ملاحظة: ملف `test_phase4_1_chromium_e2e.js` لم يُمس وظل مطابقًا للـBaseline blob `416b2d5df65ebf49844fd4e00109c1eacd5cc7a0`)*.

**ملخص التصحيحات المنفذة في Phase 5.1.3.1:**

1. **Correction A — الحفاظ على علاقات التقارير الأسبوعية (Weekly Report Relationship Preservation):**
   - تم تحديث دالة `detachDeletedHierarchyReferences()` في `index.html` لتشمل فحص مصفوفة `weeklyReports`:
     - يتم الحفاظ التام على كل تقرير أسبوعي (`weeklyReports[]`) وكل هدف مؤرشف (`weeklyReports[].archivedGoals[]`).
     - يتم الحفاظ على كافة الحقول النصية وحقول الحالة التي أنشأها المستخدم (`id`, `title`, `text`, `date`, `notes`, `done`, `duration`, `weekStartIso`).
     - عند حذف مادة دراسية مرجعية، يتم فقط فك ارتباط المادة الملغاة بجعل `goal.subjectId = ''` (وكذلك `rep.subjectId = ''` إذا وُجد) دون حذف الهدف أو التقرير ودون تسجيل شاهد حذف للتقرير.
     - يتم وسم التقرير المعدل وتحديث بصمته السببية عبر استدعاء `stampEntityMutation(rep, 'weekly_reports', rep.weekStartIso || rep.id)` ضمن البنية السببية المعتمدة.
     - يتم حفظ التقرير المعدل فورًا عبر `saveScheduleData()` في التخزين المحلي (`pharmaWeeklyReportsV1` و`pharmaScheduleV4.weeklyReports`).
     - التقارير الأسبوعية غير المرتبطة بالمادة المحذوفة تظل سليمة تمامًا دون تعديل أو إعادة ختم غير ضرورية.

2. **Correction B — تغطية الإجهاض المغلق في مسارات الحذف (Fail-Closed Deletion Coverage):**
   - تم فحص وتأكيد جميع مسارات الحذف في `index.html` (`triggerDeleteSubject`, `deleteContinuousSubjectWirdLog`, `triggerDeleteGroup`, `triggerDeleteLecture`, `deleteSessionDirect`, `executeClearSchedule`, `deleteBacklogTask`, `triggerDeleteLog`, `deleteEventFromPdfAdjuster`, `markMissedSessionDoneOffline`, `finalizeWeekAndArchiveReport`, `deleteWeeklyEvaluationReport`):
     - جميع هذه المسارات تشترط توفر مساعد حفظ الشواهد الفعلي (`recordTombstone` أو `recordTombstonesAtomicBatch`) ونجاحه الفعلي قبل الإقدام على أي إزالة محلية للكيان من الذاكرة أو التخزين.
     - في حال عدم توفر المساعد أو فشل الحفظ في `localStorage`، تُجهض العملية فورًا (Fail-Closed) مع إظهار رسالة خطأ للمستخدم عبر `showToast`، وبقاء الكيان المستهدف وسجلاته الفرعية سليمة 100%، وعدم إصدار أي إشعار نجاح زائف.
   - تمت إضافة فحوصات انحدار دقيقة في `test_phase4_regressions.js` (`TEST 17`):
     - `T-5.1.3.1-A1`: فحص فك ارتباط `subjectId` في `archivedGoals` مع بقاء محتوى الهدف المؤرشف وختم التقرير الأسبوعي سببيًا وحفظه في `localStorage`.
     - `T-5.1.3.1-B1`: حقن فشل تخزين الشواهد أثناء `deleteSessionDirect` والتأكد من بقاء الجلسة المستهدفة وملاحظاتها وبيانات Workspace التابعة سليمة دون حذف، والتأكد من عدم ظهور إشعار نجاح، ثم إعادة المحاولة بنجاح بعد استعادة التخزين.
     - `T-5.1.3.1-B2`: حقن فشل تخزين الشواهد أثناء `deleteEventFromPdfAdjuster` والتأكد من بقاء الجلسة المستهدفة في جدول الـPDF وملاحظاتها سليمة، ثم إعادة المحاولة بنجاح بعد استعادة التخزين.

3. **Correction C — دقة التسليم والتوصيف التقني (Accurate Handoff & Technical Details):**
   - مفتاح معرف الجهاز على مستوى التثبيت في التخزين المحلي هو `exo_installation_device_id_v1` (المسجل لكل حساب في `pharmaDeviceRegistry_<uid>`).
   - معرف الفاعل لعلامة التبويب الحية يُولّد عبر CSPRNG ويُحتفظ به في الذاكرة الحية فقط تحت `liveTabActorId` دون حفظه في `sessionStorage`.
   - دوال شواهد الحذف الفعلية في الكود هي `recordTombstone()` و`recordTombstonesAtomicBatch()` (ولا وجود لدالة باسم `saveLocalTombstones()`).
   - الفصل التام بين حفظ التعديلات محليًا وصحة المزامنة السحابية: يتم حفظ تعديل المستخدم دائمًا في `localStorage` أولًا، وإذا فشل الختم السببي يُوسم الـWorkspace بالاتساخ ويُخطر المستخدم مع منع الـPush السحابي حتى ينجح الختم السببي.

### حدود الاعتماد الحالية
- حالة المرحلة الحالية هي **`IN PROGRESS — NOT APPROVED`**.
- لم يتم التحقق من تعديلات Phase 5.1.3.1 بعد عبر GitHub Actions CI على GitHub (`NOT CI VERIFIED`).
- لم يتم اعتماد المرحلة بعد (`NOT APPROVED`)؛ الاعتماد النهائي قرار المالك بعد المراجعة المستقلة ونجاح CI.

## 5. سياسة المنتج والحسابات

### Free

يظل الحفظ المحلي الأساسي وبيانات Workspace الأكاديمية ومزامنة البيانات والـannotations الأساسية عبر Supabase متاحة للمستخدم المسجل عندما تكون الخدمة مهيأة وتنجح صلاحياتها. لا تجعل VIP شرطًا للحفظ الأكاديمي الأساسي.

- Annotated PDF Export مجاني لمستخدمي Free وVIP.
- Extra Note Sheet مجاني لمستخدمي Free وVIP، ويسمح بإنشاء عدة Note Sheets. لا تطبق قفل VIP على إنشاء هذه الأوراق أو الوصول إليها، ولا تخترع حدًا عدديًا غير معتمد.

### VIP

الاستحقاق يدوي من المالك باستخدام:
- الجدول: `public.user_workspaces`
- العمود: `can_upload_media`
- المالك يغيّر القيمة يدويًا بين FALSE وTRUE.

لا يوجد في النطاق الحالي نظام اشتراكات أو دفع آلي. WhatsApp قناة تواصل فقط، وليس تفعيلًا آليًا. `can_upload_media` بوابة ميزات وسائط/ميزات مميزة محددة، وليست بوابة حفظ Workspace الأساسي أو Annotated PDF Export أو Extra Note Sheet. هذه الوظيفتان متاحتان لـFree، بما في ذلك إنشاء عدة Note Sheets.

### Supabase وGoogle Drive

- المستخدم أكد أن migrations الخاصة بـExo لم تُطبق بعد على مشروع Supabase الفعلي.
- المستخدم أكد وجود `public.user_workspaces` وعمود `can_upload_media`، لكن ذلك لا يثبت سلامة بقية schema أو RPC أو RLS أو grants أو triggers.
- لا توجد مراجعة شاملة حديثة للـlive schema؛ اعتبرها غير معروفة.
- Project ref الظاهر في تقرير Phase 5.0.2 والكود: `dszjmgzzqpdrdjkycvht`. لا تستخدم معرّفًا مختلفًا من وثيقة غير موثقة.
- لا توجد موافقة للاتصال الحي أو تنفيذ migrations.
- Google Drive media workflow منفصل عن Core Workspace sync. لا تفترض أن الملفات الخاصة متاحة لـFree أو أن روابط Drive عامة.

## 6. خطوات العمل بعد Phase 5.1.3.1

1. مراجعة مستقلة للتعديلات المحلية في الملفات الثلاثة المصرح بها.
2. قرار المالك بشأن مزامنة GitHub وتشغيل GitHub Actions CI (Run #23).
3. التحقق من نتائج CI الفعلية (بما في ذلك PostgreSQL 16 الحقيقي وChromium E2E) على الـCommit الجديد بعد المزامنة.
4. قرار المالك بالاعتماد (`APPROVED`) أو طلب تعديلات إضافية (`CHANGES REQUESTED`).

لا تنفذ المرحلة التالية تلقائيًا.

## 7. دورة المراجعة والمزامنة

1. Gemini يقرأ `GEMINI.md` وهذا الملف ومستند المرحلة النشطة.
2. Gemini يفحص Base SHA والفرع والملفات السابقة.
3. Gemini يعدّل الملفات التي تسمح بها المرحلة فقط.
4. يعرض Gemini Diff كاملًا وقائمة الملفات والاختبارات الفعلية والقيود.
5. المالك وحده يقرر GitHub Sync.
6. بعد ظهور Commit على GitHub نتحقق من SHA والملفات والـDiff.
7. لا تعتبر المهمة APPROVED إلا بعد مراجعة مستقلة وقرار المالك.
