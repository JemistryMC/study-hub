# Current Project Handoff

**آخر تحديث:** 2026-11-05  
**المستودع:** `JemistryMC/study-hub`

هذا الملف هو المرجع الوحيد للحالة الحالية والمرحلة النشطة. إذا خالفه تقرير تاريخي أو تعليمات مرحلة قديمة، يُتبع هذا الملف ومستند المرحلة النشطة.

## 1. حالة المستودع

- فرع العمل النشط: `main`.
- آخر `main` تم التحقق منه كبداية لمهمة Phase 5.1.2 الحالية (Base HEAD):  
  `76f72e93d910adb755f72849acbeb52486b09636`
- الـCommit الأب (آخر خط أساس معتمد لـ M1 قبل رفع نموذج M2/M3/M4 الأولي):  
  `2cba36cae18fbc2fa4aefcdeb02df58f5a990ac5`
- الـCommit `76f72e93d910adb755f72849acbeb52486b09636` عدّل `index.html` فقط (`2acc4bf5a7e73ef01b3a096de4a0b8fc7cfa9421`) من نموذج `study-hub (6).zip` الأولي دون تحديث ملفات الاختبار، مما أدى إلى فشل CI في `test_phase3_cross_account_isolation.js` بسبب `ReferenceError: normalizeTombstonesObject is not defined`.
- لا تعتبر التعديلات المحلية الحالية مرفوعة إلى GitHub حتى يراجعها المالك ويزامنها ويتحقق من الـCommit SHA الجديد على GitHub.

الفروع المرجعية:
- `Deploying`: مرجع تاريخي لخط أساس سابق، وليس فرع العمل الحالي.
- `backup/pre-gemini-security-2026-11-04`: نقطة استرجاع محمية؛ لا تحذفها أو تعدلها.

## 2. نتائج الاختبار المثبتة

### 2.1 آخر تشغيل CI تاريخي موثق (قبل Phase 5.1.2)
- GitHub Actions Run: `41857800822`
- Source SHA: `c211d034eb074c43f74eee480b8186e58868dc80`
- Static: **54/54** | Unit: **102/102** | PGlite: **41/41** | PostgreSQL 16: **96/96** | Chromium E2E: **42/42** (الإجمالي: **335/335**).

### 2.2 نتائج الاختبارات المحلية لتعديلات Phase 5.1.2 الحالية (محليًا فقط قبل GitHub Sync)
- Base SHA: `76f72e93d910adb755f72849acbeb52486b09636` (+ التعديلات المحلية في الملفات الخمسة المصرح بها).
- `npm run lint`: **PASSED** (فحص syntax لجميع ملفات الخادم والبناء والاختبارات).
- `npm run test:static` (`run_verification_tests.js`): **54/54 PASSED**.
- `npm run test:unit`: **164/164 PASSED** موزعة كالتالي:
  - `run_comprehensive_verification.js`: **42/42 PASSED**.
  - `test_phase3_cross_account_isolation.js`: **52/52 PASSED** (شاملة `T-5.1.2-CI-01`).
  - `test_phase4_regressions.js`: **70/70 PASSED** (شاملة `TEST 12` M3 و`TEST 13` M2 و`TEST 14` M4).
- `npm run test:pglite` (`test_phase4_2_postgres_integration.js`): **41/41 PASSED**.
- `npm run test:e2e` (`test_phase4_1_chromium_e2e.js`): **56/56 PASSED** (السيناريوهات A إلى T في متصفح Chromium حقيقي + IndexedDB).
- `npm run test:pg16` (`test_phase4_2_1_pg16_concurrency.js`): **NOT RUN LOCALLY** (يتطلب خادم PostgreSQL 16 محلي على المنفذ `5432` غير متاح داخل حاوية AI Studio؛ يُشغّل في GitHub Actions CI).
- إجمالي الفحوصات المنفذة محليًا: **315/315 PASSED**.

## 3. العمل المنجز والمرجع التاريخي

### Phase 4.2.x — Security, OCC, PostgreSQL 16

تقارير وملفات هذه المرحلة سجلات هندسية تاريخية. لا تجعلها المرحلة النشطة مرة أخرى ولا تعِد تنفيذها تلقائيًا. ارجع إليها فقط عندما تتطلب Phase حالية دليلًا أو سياقًا محددًا منها.

### Phase 5.0 — Storage, Sync & Google Drive Audit

تقرير التدقيق المرجعي موجود في:
`reports/phases/phase-5-storage-sync-audit/gemini-report.md`

تم رفع التقرير إلى `main` في Commit:
`1758bba343746f4b457d8793fa9389b80117bcf8`

يحتوي التقرير على findings مرقمة F-01 إلى F-15. معاني هذه المعرفات مرتبطة بالتقرير الأصلي ولا يجوز إعادة استخدام أرقامها لمعانٍ مختلفة. عند إضافة findings جديدة استخدم معرفات منفصلة مثل N-01 وما بعدها، مع Traceability صريحة.

### Phase 5.1.0 / 5.1.1 — Implementation Blueprint

المستند الحالي:
`reports/phases/phase-5-storage-sync-audit/phase-5-1-implementation-blueprint.md`

Commit:
`6020a78e585d415ca3d8dcdd37a024cda2614652`

الحالة: **CHANGES REQUESTED — NOT APPROVED** (مفوض جزئيًا لتنفيذ التصحيح المحدود لـ M2 + M3 + M4 فقط ضمن Phase 5.1.2).

## 4. المرحلة النشطة

# Phase 5.1.2 — Corrective Integration & Completion of M2 + M3 + M4

**Status: IMPLEMENTED — LOCAL TESTS ONLY (NOT CI VERIFIED, NOT APPROVED)**

**الهدف:** استكمال وتصحيح تكامل M2 (Entity Tombstones & Local Deletion) وM3 (Causal Engine & Legacy Safety) وM4 (Annotation Creation, Deletion & Merge) فوق النموذج الأولي الموجود في `76f72e93d910adb755f72849acbeb52486b09636` دون المساس بخط الأساس المعتمد لـ M1.

**الملفات الخمسة الوحيدة المعدلة ضمن النطاق المصرح به:**
1. `index.html`
2. `test_phase3_cross_account_isolation.js`
3. `test_phase4_regressions.js`
4. `test_phase4_1_chromium_e2e.js`
5. `reports/CURRENT.md`

**ملخص التصحيحات المنفذة في Phase 5.1.2:**
1. **إصلاح فشل CI في `test_phase3_cross_account_isolation.js`:** استخراج سلسلة الاعتماديات الحقيقية الكاملة لدالة `getLocalTombstones()` من `index.html` إلى بيئة الاختبار المعزولة (`getCanonicalTombstoneBucketName`, `getEmptyTombstonesMap`, `normalizeTombstoneRecord`, `normalizeTombstonesObject`) وإضافة فحص الانحدار `T-5.1.2-CI-01`.
2. **M3 — محرك السببية وسلامة البيانات القديمة (Causal Engine & Legacy Safety):**
   - توحيد صيغ نطاقات الكيانات (`entity:<pluralBucket>:<id>`) عبر دالة `getCanonicalEntityCausalScope()` في `stampEntityMutation()` و`recordEntityTombstone()` و`autoStampTrackedWorkspaceMutations()`.
   - فصل `deviceId` (لكل متصفح/ملف تعريف في `localStorage`) عن `actorId` (لكل علامة تبويب عبر `sessionStorage` + CSPRNG) لمنع التصادم السببي المزيف بين تبويبتين لنفس الحساب على نفس الجهاز.
   - حماية التعديلات القديمة غير الموسومة (`legacy unstamped mutations`) عبر البصمات القانونية (`_legacyBaseDigest`) بحيث لا تسحق بيانات قديمة بعيدة تعديلًا محليًا غير موسوم، مع حفظ كلا النسختين في `pharmaConflictRecovery_<uid>` عند التعارض.
   - الختم التلقائي الكامل (`autoStampTrackedWorkspaceMutations`) لجميع الفئات الثماني (`subjects`, `groups`, `lectures`, `wird_logs`, `events`, `backlog`, `weekly_reports`, `logs`) عند الحفظ المحلي وقبل الدفع السحابي.
3. **M2 — شواهد الحذف (Tombstones) والحذف المحلي الآمن:**
   - الحذف الآمن (Fail-closed) لجميع الفئات الثماني عبر مسارات الحذف الفردية والجماعية والهرمية (`saveLocalTombstones()` يعيد `false` عند فشل الكتابة ويوقف الحذف دون فقدان البيانات أو إنشاء يتامى).
   - دعم الاسترجاع المحلي (`restoreDeletedEntity`) بتوليد عملية سببية جديدة (`supersedes: [tombstone.opId]`) تتغلب على شاهد الحذف السابق.
   - التنظيف المحلي المعزول لكل حساب (`cleanupDeletedLectureLocalArtifacts`) لمخازن IndexedDB (`pdfs`, `audios` شاملاً `rec_<lecId>_*`, `annotations`، وذاكرة التخزين المؤقت) دون المساس بحسابات أخرى أو حذف ملفات Google Drive البعيدة.
4. **M4 — إنشاء وحذف ودمج التعليقات التوضيحية (Annotations):**
   - توحيد توقيع `stampAnnotationItemCausal(item, lecId, pageKey, itemKind, targetUid, extraSupersedes)` (6 معاملات) عبر جميع مواضع الرسم والـUndo/Redo واللصق وتغيير الحجم والملاحظات والدبابيس الصوتية.
   - الختم السببي لحذف الضربات الفردية ومسح الصفحة وأوراق الملاحظات الإضافية واستبعاد صفحات الـPDF وإعادتها والدبابيس الصوتية.
   - ترحيل الضربات القديمة غير الموسومة بمعرّفات حتمية تحافظ على الترتيب (`_canonicalGeomOrdinal`) وسجل `_legacyManifest` لمنع فقدان الضربات المكررة عمدًا أو سحق التعديلات القديمة المتباينة أثناء الدمج.

### حدود الاعتماد الحالية
- حالة المرحلة الحالية هي **`IMPLEMENTED — LOCAL TESTS ONLY`**.
- لم يتم التحقق منها بعد عبر GitHub Actions CI على GitHub (`NOT CI VERIFIED`).
- لم يتم اعتماد M2 أو M3 أو M4 بعد (`NOT APPROVED`)؛ الاعتماد النهائي قرار المالك بعد المراجعة المستقلة ونجاح CI.

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

## 6. خطوات العمل بعد Phase 5.1.2

1. مراجعة مستقلة للتعديلات المحلية في الملفات الخمسة.
2. قرار المالك بشأن مزامنة GitHub وتشغيل GitHub Actions CI.
3. التحقق من نتائج CI الفعلية (بما في ذلك PostgreSQL 16 الحقيقي) على الـCommit الجديد بعد المزامنة.
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

