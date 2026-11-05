# Current Project Handoff

**آخر تحديث:** 2026-11-05  
**المستودع:** `JemistryMC/study-hub`

هذا الملف هو المرجع الوحيد للحالة الحالية والمرحلة النشطة. إذا خالفه تقرير تاريخي أو تعليمات مرحلة قديمة، يُتبع هذا الملف ومستند المرحلة النشطة.

## 1. حالة المستودع

- فرع العمل النشط: `main`.
- آخر `main` تم التحقق منه كبداية لمهمة Milestone M5 Workstream A الحالية (Base HEAD):  
  `ee5cf7e2d7d2c63ad44ca87edf6461299d05efc4`
- الـCommit الأب (بداية Phase 5.1.3.1):  
  `3925b5133eef07cd165dadcfbea0b4b30a6d4b2f`
- الـBlobs الأساسية عند بداية Milestone M5 Workstream A (`ee5cf7e2d7d2c63ad44ca87edf6461299d05efc4`):
  - `index.html`: `c095b17005fa1119d79d92eacdf8354f92788dca`
  - `test_phase4_regressions.js`: `93c24d2004cdb1cf6d7d8ed2a530062da80f6f6b`
  - `test_phase4_1_chromium_e2e.js`: `416b2d5df65ebf49844fd4e00109c1eacd5cc7a0`
  - `reports/CURRENT.md`: `4adb88302ac9e3093f622bc74efe92dcab691923`
- لا تعتبر التعديلات المحلية الحالية لـ Milestone M5 Workstream A مرفوعة إلى GitHub حتى يراجعها المالك ويزامنها ويتحقق من الـCommit SHA الجديد على GitHub.

الفروع المرجعية:
- `Deploying`: مرجع تاريخي لخط أساس سابق، وليس فرع العمل الحالي.
- `backup/pre-gemini-security-2026-11-04`: نقطة استرجاع محمية؛ لا تحذفها أو تعدلها.

## 2. نتائج الاختبار المثبتة

### 2.1 آخر تشغيل CI موثق على GitHub (Phase 5.1.3.1 — Run #23)
- GitHub Actions Run #23: `42095996755`
- Run URL: `https://github.com/JemistryMC/study-hub/actions/runs/42095996755`
- Source SHA: `ee5cf7e2d7d2c63ad44ca87edf6461299d05efc4`
- النتيجة المثبتة في CI: **428/428 PASSED (0 failed)** موزعة كالتالي:
  - Static (`run_verification_tests.js`): **54/54 PASSED**.
  - Unit (`run_comprehensive_verification.js` **42/42** + `test_phase3_cross_account_isolation.js` **52/52** + `test_phase4_regressions.js` **83/83**): **177/177 PASSED**.
  - Embedded PostgreSQL (`test_phase4_2_postgres_integration.js` — PGlite): **41/41 PASSED**.
  - Real PostgreSQL 16 (`test_phase4_2_1_pg16_concurrency.js`): **96/96 PASSED**.
  - Real Headless Chromium + IndexedDB E2E (`test_phase4_1_chromium_e2e.js` — Scenarios A–U): **60/60 PASSED**.
- الحالة: **CI VERIFIED — NOT APPROVED**.

### 2.2 تشغيل CI السابق (Phase 5.1.3 — Run #22)
- GitHub Actions Run #22: `42089989335`
- Run URL: `https://github.com/JemistryMC/study-hub/actions/runs/42089989335`
- Source SHA: `3925b5133eef07cd165dadcfbea0b4b30a6d4b2f`
- النتيجة المثبتة في CI: **425/425 PASSED (0 failed)**.
- الحالة: **CI VERIFIED — NOT APPROVED**.

### 2.3 نتائج الاختبارات المحلية لتعديلات Milestone M5 Workstream A الحالية (محليًا فقط قبل GitHub Sync)
- Base SHA: `ee5cf7e2d7d2c63ad44ca87edf6461299d05efc4` (+ التعديلات المحلية في الملفات الأربعة المصرح بها فقط).
- `npm run lint`: **PASSED** (فحص syntax لجميع ملفات الخادم والبناء والاختبارات).
- `npm run build`: **PASSED**.
- `npm run test:static` (`run_verification_tests.js`): **54/54 PASSED**.
- `npm run test:unit`: **183/183 PASSED** موزعة كالتالي:
  - `run_comprehensive_verification.js`: **42/42 PASSED**.
  - `test_phase3_cross_account_isolation.js`: **52/52 PASSED**.
  - `test_phase4_regressions.js`: **89/89 PASSED** (شاملة 83 فحصًا سابقًا + 6 فحوصات جديدة في `TEST 18`: `T-5.1-08-A` حتى `T-5.1-08-F`).
- `npm run test:pglite` (`test_phase4_2_postgres_integration.js`): **41/41 PASSED**.
- `npm run test:e2e` (`test_phase4_1_chromium_e2e.js`): **64/64 PASSED** (شاملة 60 فحصًا سابقًا للسيناريوهات A–U + 4 فحوصات للسيناريو الجديد V: `Test V.1` حتى `Test V.4`).
- `npm run test:pg16` (`test_phase4_2_1_pg16_concurrency.js`): **NOT RUN LOCALLY** (يتطلب خادم PostgreSQL 16 محلي على المنفذ `5432` غير متاح داخل حاوية AI Studio؛ يُشغّل في GitHub Actions CI).
- إجمالي الفحوصات المنفذة محليًا: **342/342 PASSED (0 failed)**.

## 3. العمل المنجز والمرجع التاريخي

### Phase 4.2.x — Security, OCC, PostgreSQL 16
تقارير وملفات هذه المرحلة سجلات هندسية تاريخية. لا تجعلها المرحلة النشطة مرة أخرى ولا تعِد تنفيذها تلقائيًا.

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

### Phase 5.1.3.1 — Final Integrity Corrections (Weekly Reports & Tombstone Fail-Closed)
Commit: `ee5cf7e2d7d2c63ad44ca87edf6461299d05efc4`  
GitHub Actions Run #23: `42095996755` (`428/428 PASSED`)  
الحالة: **CI VERIFIED — NOT APPROVED**.

## 4. المرحلة النشطة

# Milestone M5 — Offline-First Lifecycle & Decoupled Annotations

**Status: IN PROGRESS — NOT APPROVED**

- مسار العمل الحالي: **M5 Workstream A — Dirty-State Login & Pull Reconciliation (F-03, T-5.1-08)**.
- مسار العمل القادم: **M5 Workstream B (F-05 Annotation Decoupling & N-02 Version-Counter Redesign)**.
- **حدود الاعتماد:** لا يُعتبر Milestone M5 مكتملاً حتى يكتمل كلا مساري العمل (M5-A وM5-B) ويجتازا المراجعة المستقلة وCI.

### الهدف من مسار M5 Workstream A:
معالجة الملاحظة F-03 في تقرير التدقيق، حيث كانت عمليتا `syncWorkspaceOnLogin()` و`pullWorkspaceFromCloud()` تقومان باستبدال أعمى للبيانات المحلية (`applyCloudWorkspacePayload`) عند تسجيل الدخول أو السحب اليدوي في وجود تعديلات محلية غير متزامنة (Dirty State)، مما يؤدي لضياع عمل المستخدم دون إنذار.

### الملفات الأربعة الوحيدة المعدلة ضمن النطاق المصرح به:
1. `index.html`
2. `test_phase4_regressions.js`
3. `test_phase4_1_chromium_e2e.js`
4. `reports/CURRENT.md`

### ملخص التعديلات المنفذة في Workstream M5-A:

1. **دالة المصالحة السببية `reconcileDirtyWorkspaceWithRemote(remoteRow, opCtx, manualNotify)`:**
   - تم بناؤها في `index.html` لتوفير مسار مصالحة آمن وموحد عند وجود تعديلات غير متزامنة.
   - تفرغ الحواشي المعلقة إلى IndexedDB عبر `flushPendingAnnotationsSave(false, opCtx)` وتُجهض العملية فورًا (Fail-Closed) في حال فشل التفريغ لحماية بيانات الرسم.
   - تقوم بختم التعديلات المحلية غير المدموغة سببيًا عبر `autoStampTrackedWorkspaceMutations('all', opCtx.uid)`.
   - تبني `localPayload` متكاملاً يحتوي على المواد، الجدول، المهام، التقارير الأسبوعية، السجلات، وشواهد الحذف المحلية.
   - تستدعي محرك الدمج السببي ثلاثي الأطراف المعتمد `mergeAndApplyCloudConflict(remoteRow, localPayload, opCtx)` الذي يحفظ عناصر الطرفين ويطبق شواهد الحذف ويدمج الحواشي بدقة.
   - إذا كان الاتصال متاحًا، تقوم برفع الحالة المدمجة عبر `pushWorkspaceToCloud(manualNotify, false, opCtx)`، ولا تُمسح أعلام الاتساخ (`pharmaWorkspaceDirty`) إلا بعد تأكيد الخادم لنجاح العملية (`p_status = 'success'`).
   - في حال فشل الرفع السحابي (انقطاع شبكة أو خطأ RPC)، تبقى البيانات المدمجة محفوظة محليًا في `localStorage` وIndexedDB ومخزن الحساب الاحتياطي، ويبقى علم الاتساخ مرفوعًا (`pharmaWorkspaceDirty = '1'`) للمحاولة لاحقًا دون إقرار سحابي كاذب.

2. **تحديث `pullWorkspaceFromCloud(manualNotify, ctx)`:**
   - يفحص أعلام الاتساخ المحلية (`hasDirtyWorkspace` و`hasDirtyAnnotations` و`hasUncommittedOps`) وأصل البيانات (`isSameOwnerOrVerifiedPreLogin`).
   - إذا وُجدت تعديلات محلية متسخة لنفس الحساب أو جلسة الضيف السابقة، يتم توجيه السحب تلقائيًا لمسار المصالحة `reconcileDirtyWorkspaceWithRemote` بدلاً من المسح الأعمى.
   - إذا كانت الحالة المحلية نظيفة تمامًا أو لحساب مختلف، يتم تطبيق السحب العادي عبر `applyCloudWorkspacePayload`.

3. **تحديث `syncWorkspaceOnLogin(ctx)`:**
   - في المسار (أ) عند وجود سجل سحابي سابق للمستخدم (`if (data)`): يفحص اتساخ الحالة المحلية وأصل الحساب.
   - في حال وجود تعديلات محلية متسخة لنفس المستخدم، يوجه التدفق إلى `reconcileDirtyWorkspaceWithRemote(data, opCtx, false)`.
   - يحافظ تمامًا على المسار (ب) المعتمد في F-15 للمستخدمين الجدد كليًا بحفظ تقدم الأكاديمية `completedAcademyModules`.
   - يحافظ على العزل التام بين الحسابات: التعديلات المتسخة للمستخدم (X) تظل معزولة في مخزنه الاحتياطي ولا تُدمج مطلقًا في جلسة المستخدم (Y) عند تبديل الحساب.

4. **تغطية الاختبارات الموسعة:**
   - **`test_phase4_regressions.js` (`TEST 18`):** 6 فحوصات دقيقة (`T-5.1-08-A` حتى `T-5.1-08-F`) تغطي تسجيل الدخول المتسخ لنفس الحساب، السحب اليدوي القسري المتسخ، أمان فشل الرفع وبقاء علم الاتساخ، نجاح إعادة المحاولة بعد تأكيد الخادم، عزل تبديل الحسابات، والحفاظ على تقدم الأكاديمية للمستخدمين الجدد.
   - **`test_phase4_1_chromium_e2e.js` (`TEST V`):** 4 فحوصات حقيقية في متصفح Chromium (`Test V.1` حتى `Test V.4`) تؤكد سلامة المصالحة الحقيقية للجدول والمواد والحواشي في IndexedDB وDOM و`localStorage` في بيئة متصفح كاملة.

### حدود الاعتماد الحالية
- حالة المرحلة الحالية هي **`IN PROGRESS — NOT APPROVED`**.
- لم يتم التحقق من تعديلات Milestone M5 Workstream A بعد عبر GitHub Actions CI على GitHub (`NOT CI VERIFIED`).
- لم يتم اعتماد المرحلة بعد (`NOT APPROVED`)؛ الاعتماد النهائي قرار المالك بعد استكمال M5-B والمراجعة المستقلة ونجاح CI.

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

## 6. خطوات العمل بعد M5 Workstream A

1. مراجعة مستقلة لتعديلات M5-A في الملفات الأربعة المصرح بها.
2. قرار المالك بشأن مزامنة GitHub وتشغيل GitHub Actions CI (Run #24).
3. بعد اعتماد M5-A، الانتقال إلى **Milestone M5 Workstream B (F-05 & N-02)**.
4. لا تنفذ M5-B أو M6 تلقائيًا.

## 7. دورة المراجعة والمزامنة

1. Gemini يقرأ `GEMINI.md` وهذا الملف ومستند المرحلة النشطة.
2. Gemini يفحص Base SHA والفرع والملفات السابقة.
3. Gemini يعدّل الملفات التي تسمح بها المرحلة فقط.
4. يعرض Gemini Diff كاملًا وقائمة الملفات والاختبارات الفعلية والقيود.
5. المالك وحده يقرر GitHub Sync.
6. بعد ظهور Commit على GitHub نتحقق من SHA والملفات والـDiff.
7. لا تعتبر المهمة APPROVED إلا بعد مراجعة مستقلة وقرار المالك.

