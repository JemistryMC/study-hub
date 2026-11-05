# Current Project Handoff

**آخر تحديث:** 2026-11-05  
**المستودع:** `JemistryMC/study-hub`

هذا الملف هو المرجع الوحيد للحالة الحالية والمرحلة النشطة. إذا خالفه تقرير تاريخي أو تعليمات مرحلة قديمة، يُتبع هذا الملف ومستند المرحلة النشطة.

## 1. حالة المستودع

- فرع العمل النشط: `main`.
- آخر `main` تم التحقق منه كبداية لمهمة Phase 5.1.3 الحالية (Base HEAD):  
  `1c65d0ac70f8d6915d2bb92086834bac51ae2fce`
- الـCommit الأب (بداية Phase 5.1.2):  
  `76f72e93d910adb755f72849acbeb52486b09636`
- خط الأساس المعتمد لـ M1 قبل رفع نموذج M2/M3/M4:  
  `2cba36cae18fbc2fa4aefcdeb02df58f5a990ac5`
- الـBlobs الأساسية عند بداية Phase 5.1.3 (`1c65d0ac70f8d6915d2bb92086834bac51ae2fce`):
  - `index.html`: `989aa725d0a624ad9845b04045e46447bfe07ac0`
  - `test_phase4_regressions.js`: `8577ebd617911b6f25a0c11e32f297cc67445962`
  - `test_phase4_1_chromium_e2e.js`: `a61dd9176c210f0a3e7d9a5056d124516d0b9e10`
  - `reports/CURRENT.md`: `2f854df9db5a93f9767a4e3e38880b66c6ef9322`
- لا تعتبر التعديلات المحلية الحالية لـ Phase 5.1.3 مرفوعة إلى GitHub حتى يراجعها المالك ويزامنها ويتحقق من الـCommit SHA الجديد على GitHub.

الفروع المرجعية:
- `Deploying`: مرجع تاريخي لخط أساس سابق، وليس فرع العمل الحالي.
- `backup/pre-gemini-security-2026-11-04`: نقطة استرجاع محمية؛ لا تحذفها أو تعدلها.

## 2. نتائج الاختبار المثبتة

### 2.1 آخر تشغيل CI موثق على GitHub (Phase 5.1.2 — Run #21)
- GitHub Actions Run #21: `42077770432`
- Run URL: `https://github.com/JemistryMC/study-hub/actions/runs/42077770432`
- Source SHA: `1c65d0ac70f8d6915d2bb92086834bac51ae2fce`
- النتيجة المثبتة في CI: **411/411 PASSED (0 failed)** موزعة كالتالي:
  - Static (`run_verification_tests.js`): **54/54 PASSED**.
  - Unit (`run_comprehensive_verification.js` **42/42** + `test_phase3_cross_account_isolation.js` **52/52** + `test_phase4_regressions.js` **70/70**): **164/164 PASSED**.
  - Embedded PostgreSQL (`test_phase4_2_postgres_integration.js` — PGlite): **41/41 PASSED**.
  - Real PostgreSQL 16 (`test_phase4_2_1_pg16_concurrency.js`): **96/96 PASSED**.
  - Real Headless Chromium + IndexedDB E2E (`test_phase4_1_chromium_e2e.js` — Scenarios A–T): **56/56 PASSED**.

### 2.2 نتائج الاختبارات المحلية لتعديلات Phase 5.1.3 الحالية (محليًا فقط قبل GitHub Sync)
- Base SHA: `1c65d0ac70f8d6915d2bb92086834bac51ae2fce` (+ التعديلات المحلية في الملفات الأربعة المصرح بها).
- `npm run lint`: **PASSED** (فحص syntax لجميع ملفات الخادم والبناء والاختبارات).
- `npm run build`: **PASSED**.
- `npm run test:static` (`run_verification_tests.js`): **54/54 PASSED**.
- `npm run test:unit`: **174/174 PASSED** موزعة كالتالي:
  - `run_comprehensive_verification.js`: **42/42 PASSED**.
  - `test_phase3_cross_account_isolation.js`: **52/52 PASSED**.
  - `test_phase4_regressions.js`: **80/80 PASSED** (شاملة 70 فحصًا سابقًا + 10 فحوصات جديدة: `TEST 15` للفحوصات `T-5.1.3-A1..A4` و`TEST 16` للفحوصات `T-5.1.3-B1..B6`).
- `npm run test:pglite` (`test_phase4_2_postgres_integration.js`): **41/41 PASSED**.
- `npm run test:e2e` (`test_phase4_1_chromium_e2e.js`): **60/60 PASSED** (السيناريوهات A إلى U في متصفح Chromium حقيقي + IndexedDB، شاملة 4 فحوصات جديدة في `TEST U`: `T-5.1.3-C1..C4`).
- `npm run test:pg16` (`test_phase4_2_1_pg16_concurrency.js`): **NOT RUN LOCALLY** (يتطلب خادم PostgreSQL 16 محلي على المنفذ `5432` غير متاح داخل حاوية AI Studio؛ يُشغّل في GitHub Actions CI).
- إجمالي الفحوصات المنفذة محليًا: **329/329 PASSED (0 failed)**.

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

الحالة: **CHANGES REQUESTED — NOT APPROVED** (مفوض جزئيًا لتنفيذ التصحيح المحدود لـ M2 + M3 + M4 ضمن Phase 5.1.2 وPhase 5.1.3).

### Phase 5.1.2 — Corrective Integration & Completion of M2 + M3 + M4

Commit:
`1c65d0ac70f8d6915d2bb92086834bac51ae2fce`

GitHub Actions Run #21:
`42077770432` (`https://github.com/JemistryMC/study-hub/actions/runs/42077770432` — `411/411 PASSED`)

الحالة: **CI VERIFIED — NOT APPROVED** (اجتاز فحوصات CI شاملة PostgreSQL 16 وChromium E2E، وطلب المالك تمريرة تصحيحية ختامية محدودة في Phase 5.1.3 قبل الاعتماد النهائي).

## 4. المرحلة النشطة

# Phase 5.1.3 — Final Corrective Pass: Causal Save Safety, Deletion Semantics & Real Annotation UI E2E

**Status: IMPLEMENTED — LOCAL TESTS ONLY (NOT CI VERIFIED, NOT APPROVED)**

**الهدف:** تمريرة تصحيحية محدودة النطاق فوق Commit `1c65d0ac70f8d6915d2bb92086834bac51ae2fce` لمعالجة ثلاث نقاط محددة دون إعادة بناء المحرك السببي:
1. منع ابتلاع أخطاء الختم السببي بصمت مع فصل حفظ البيانات المحلية عن صحة الدفع السحابي.
2. ضبط دلالات مسح الجدول والحذف الهرمي غير المدمّر وتوحيد استدعاءات شواهد الحذف (Tombstones).
3. إضافة اختبار E2E حقيقي لواجهة استوديو التعليقات التوضيحية (Annotation Studio UI) عبر أحداث المؤشر والأزرار الفعلية في Chromium.

**الملفات الأربعة الوحيدة المعدلة ضمن النطاق المصرح به:**
1. `index.html`
2. `test_phase4_regressions.js`
3. `test_phase4_1_chromium_e2e.js`
4. `reports/CURRENT.md`

**ملخص التصحيحات المنفذة في Phase 5.1.3:**

1. **Correction A — معالجة فشل الختم السببي بشكل صريح وآمن (Causal Stamping Save & Sync Safety):**
   - تحويل `autoStampTrackedWorkspaceMutations(domain, targetUid)` لتعيد عقد نتيجة مهيكلًا وصريحًا: `{ ok, domain, stampedCount, unchangedCount, failedCount, errors }`.
   - فحص الهضم السببي (`ensureEntityHasCausalMetadata`) يختم فقط السجلات الجديدة أو المعدلة أو الموسومة بـ `_needsCausalStamp === true`، مع الحفاظ على `operationId` للسجلات غير المعدلة لمنع إعادة توليد معرفات عمليات غير ضرورية عند إعادة المحاولة.
   - في `saveSubjects()` و`saveScheduleData()` و`saveLogs()`: إزالة كتل `catch (e) {}` الصامتة؛ يتم دائمًا حفظ تعديلات المستخدم محليًا في `localStorage` أولًا، وعند فشل الختم السببي تبقى حالة Workspace متسخة (`pharmaWorkspaceDirty = '1'` و`pharmaWorkspaceDirty_<uid> = '1'`) ويظهر تنبيه واضح للمستخدم عبر `notifyCausalStampingFailure()` دون كشف تفاصيل تقنية أو Stack Traces، مع عدم استدعاء الدفع السحابي التلقائي لحالة غير مكتملة الختم.
   - في `pushWorkspaceToCloud()`: التحقق الإلزامي من نتيجة `autoStampTrackedWorkspaceMutations('all', syncUserId)` قبل أي قراءة/كتابة شبكية أو استدعاء Supabase RPC؛ عند فشل الختم السببي يتوقف الدفع فورًا (Fail-Closed) ويعيد `{ status: 'error', ok: false, error: 'CAUSAL_STAMP_FAILED', reason: 'CAUSAL_STAMP_FAILED', stampResult }` مع الإبقاء على علامات الاتساخ المحلية وعدم الإقرار بأي عملية غير مرسلة.
   - الحفاظ الصارم على حظر أي تراجع إلى `Math.random()` لتوليد `deviceId` (المحفوظ لكل متصفح في `localStorage` تحت `exo_causal_device_id_v1` والمسجل لكل حساب في `pharmaDeviceRegistry_<uid>`) أو `liveTabActorId` (المولد لكل علامة تبويب في الذاكرة الحية عبر CSPRNG دون تخزينه في `sessionStorage`) أو `operationId`.
   - إضافة اختبارات الانحدار `TEST 15` (`T-5.1.3-A1` إلى `T-5.1.3-A4`) في `test_phase4_regressions.js`.

2. **Correction B — دقة دلالات مسح الجدول والحذف الهرمي غير المدمّر (Deletion Semantics & Tombstone Consistency):**
   - **سياسة مسح الجدول والـBacklog:**
     - `executeClearSchedule('study_only')` يحذف جلسات المذاكرة غير الثابتة فقط من `scheduleEvents` ويحافظ على التزامات الكلية الثابتة (`isFixed === true` أو `type === 'mandatory'`).
     - `executeClearSchedule('all')` يحذف جميع أحداث `scheduleEvents`.
     - كلا الوضعين لا يحذفان مهام `scheduleBacklog`؛ تظل مهام Backlog محفوظة بالكامل مع بياناتها السببية ما لم يحذفها المستخدم صراحةً عبر مسار حذف الـBacklog (`deleteBacklogTask`).
   - **سياسة الحذف الهرمي غير المدمّر:**
     - عند حذف مادة (`triggerDeleteSubject`) أو مجموعة (`triggerDeleteGroup`) أو محاضرة (`triggerDeleteLecture`) أو سجل ورد (`deleteContinuousSubjectWirdLog`)، يتم تسجيل شواهد الحذف (`recordTombstone()` / `recordTombstonesAtomicBatch()`) فقط للكيانات التي أُزيلت فعليًا من الشجرة الهرمية (`subjects`, `groups`, `lectures`, `wird_logs`).
     - لا يتم حذف الكيانات المستقلة العليا (`scheduleEvents`, `scheduleBacklog`, `logs`, `weeklyReports`) تلقائيًا لمجرد ارتباطها بالمادة أو المحاضرة المحذوفة؛ بدلًا من ذلك تقوم دالة `detachDeletedHierarchyReferences()` بفك المراجع الملغاة (`subjectId`, `lectureId`, `lectureIds`) مع الحفاظ الكامل على عنوان السجل وتوقيته وملاحظاته وحالة إنجازه، وختم تعديل فك الارتباط سببيًا.
   - **اتساق مسارات الحذف الفردية والجماعية:**
     - التحقق من وجود الكيان وسياق الحساب النشط قبل الحذف، وتسجيل شواهد الحذف عبر `recordTombstone()` و`recordTombstonesAtomicBatch()` قبل الإزالة من الذاكرة (مع الإجهاض الآمن Fail-Closed إذا فشلت كتابة `saveLocalTombstones()`)، وتنفيذ التنظيف المحلي المعزول لكل حساب (`cleanupDeletedLectureLocalArtifacts`) لمخازن IndexedDB (`pdfs`, `audios`, `rec_*`, `annotations`) عند حذف محاضرة أو مجموعة أو مادة.
   - إضافة اختبارات الانحدار `TEST 16` (`T-5.1.3-B1` إلى `T-5.1.3-B6`) في `test_phase4_regressions.js`.

3. **Correction C — اختبار E2E حقيقي لواجهة استوديو التعليقات التوضيحية (Real Annotation Studio UI E2E):**
   - إضافة السيناريو `TEST U` (`T-5.1.3-C1` إلى `T-5.1.3-C4`) في `test_phase4_1_chromium_e2e.js` الذي يختبر مسار الواجهة الحقيقي في Chromium:
     - فتح المادة والمحاضرة عبر نقرات DOM فعلية وتشغيل `#pdfViewerModalOverlay` و`#pdfAnnotationToolbar`.
     - اختيار أداة القلم (`#toolBtn_pen`) ورسم ضربتين فعليتين على `#pdfInkCanvas_1` باستخدام أحداث المؤشر (`page.mouse.move/down/up`) والتحقق من ختمهما سببيًا وحفظهما في IndexedDB.
     - النقر على زر التراجع الفعلي (`button[onclick="undoLastStroke()"]`) ثم رسم ضربة ثالثة ومسحها بأداة الممحاة الفعلية (`#toolBtn_eraser`) عبر السحب بالمؤشر، والتحقق من تسجيل شواهد حذف الضربات (`_deletedStrokes`).
     - فتح قائمة الخيارات الإضافية (`togglePdfMoreMenu`) والنقر على `مسح كتابات الصفحة الحالية` وتأكيد النافذة (`#confirmModalBtn`)، والتحقق من إنشاء حاجز مسح الصفحة (`_clearedAt` / `clear_page`) للصفحة 1 مع بقاء تعليقات الصفحة 2 والمحاضرة الأخرى (8822) سليمة.
     - إعادة تحميل المتصفح (`page.reload()`) وإعادة فتح المحاضرة من الواجهة والتحقق من ثبات الحالة بعد التحديث، ومنع إحياء الضربات الممسوحة عند الدمج مع نسخة قديمة، وعدم حدوث أي أخطاء `pageerror` أو `console.error`.

### حدود الاعتماد الحالية
- حالة المرحلة الحالية هي **`IMPLEMENTED — LOCAL TESTS ONLY`**.
- لم يتم التحقق من تعديلات Phase 5.1.3 بعد عبر GitHub Actions CI على GitHub (`NOT CI VERIFIED`).
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

## 6. خطوات العمل بعد Phase 5.1.3

1. مراجعة مستقلة للتعديلات المحلية في الملفات الأربعة المصرح بها.
2. قرار المالك بشأن مزامنة GitHub وتشغيل GitHub Actions CI.
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
