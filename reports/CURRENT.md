# Current Project Handoff

**آخر تحديث:** 2026-11-05  
**المستودع:** `JemistryMC/study-hub`

هذا الملف هو المرجع الوحيد للحالة الحالية والمرحلة النشطة. إذا خالفه تقرير تاريخي أو تعليمات مرحلة قديمة، يُتبع هذا الملف ومستند المرحلة النشطة.

## 1. حالة المستودع

- فرع العمل النشط: `main`.
- آخر `main` تم التحقق منه كبداية لمهمة Milestone M5-A.1 الحالية (Base HEAD):  
  `37806ed47bc9ea01ff88f64b11cc63008a05cdb2`
- الـCommit الأب (بداية Milestone M5 Workstream A):  
  `ee5cf7e2d7d2c63ad44ca87edf6461299d05efc4`
- الـBlobs الأساسية عند بداية Milestone M5-A.1 (`37806ed47bc9ea01ff88f64b11cc63008a05cdb2`):
  - `index.html`: `116021f5de9c61d35ea68349747e30a152e1889f`
  - `test_phase4_regressions.js`: `5ce5a2024f0c0ae9599a3fb79db3ff41865cedaf`
  - `test_phase4_1_chromium_e2e.js`: `4c824c57717a7fa18f86049304a2617cb6b83566`
  - `reports/CURRENT.md`: `27fe406337b4a3a9a15165adbc36f0ff8517f249`
- لا تعتبر التعديلات المحلية الحالية لـ Milestone M5-A.1 مرفوعة إلى GitHub حتى يراجعها المالك ويزامنها ويتحقق من الـCommit SHA الجديد على GitHub.

الفروع المرجعية:
- `Deploying`: مرجع تاريخي لخط أساس سابق، وليس فرع العمل الحالي.
- `backup/pre-gemini-security-2026-11-04`: نقطة استرجاع محمية؛ لا تحذفها أو تعدلها.

## 2. نتائج الاختبار المثبتة

### 2.1 آخر تشغيل CI موثق على GitHub (Milestone M5 Workstream A — Run #24)
- GitHub Actions Run #24: `42099610871`
- Run URL: `https://github.com/JemistryMC/study-hub/actions/runs/42099610871`
- Source SHA: `37806ed47bc9ea01ff88f64b11cc63008a05cdb2`
- النتيجة المثبتة في CI: **438/438 PASSED (0 failed)** موزعة كالتالي:
  - Static (`run_verification_tests.js`): **54/54 PASSED**.
  - Unit (`run_comprehensive_verification.js` **42/42** + `test_phase3_cross_account_isolation.js` **52/52** + `test_phase4_regressions.js` **89/89**): **183/183 PASSED**.
  - Embedded PostgreSQL (`test_phase4_2_postgres_integration.js` — PGlite): **41/41 PASSED**.
  - Real PostgreSQL 16 (`test_phase4_2_1_pg16_concurrency.js`): **96/96 PASSED**.
  - Real Headless Chromium + IndexedDB E2E (`test_phase4_1_chromium_e2e.js` — Scenarios A–V): **64/64 PASSED**.
- الحالة: **CI VERIFIED — NOT APPROVED**.

### 2.2 تشغيل CI السابق (Phase 5.1.3.1 — Run #23)
- GitHub Actions Run #23: `42095996755`
- Run URL: `https://github.com/JemistryMC/study-hub/actions/runs/42095996755`
- Source SHA: `ee5cf7e2d7d2c63ad44ca87edf6461299d05efc4`
- النتيجة المثبتة في CI: **428/428 PASSED (0 failed)**.
- الحالة: **CI VERIFIED — NOT APPROVED**.

### 2.3 نتائج الاختبارات المحلية لتعديلات Milestone M5-A.1 الحالية (محليًا فقط قبل GitHub Sync)
- Base SHA: `37806ed47bc9ea01ff88f64b11cc63008a05cdb2` (+ التعديلات المحلية في الملفات الأربعة المصرح بها فقط).
- `npm run lint`: **PASSED** (فحص syntax لجميع ملفات الخادم والبناء والاختبارات).
- `npm run build`: **PASSED**.
- `npm run test:static` (`run_verification_tests.js`): **54/54 PASSED**.
- `npm run test:unit`: **191/191 PASSED** موزعة كالتالي:
  - `run_comprehensive_verification.js`: **42/42 PASSED**.
  - `test_phase3_cross_account_isolation.js`: **52/52 PASSED**.
  - `test_phase4_regressions.js`: **97/97 PASSED** (شاملة 89 فحصًا سابقًا + 8 فحوصات جديدة في `TEST 19`: `T-5.1-09-A` حتى `T-5.1-09-H`).
- `npm run test:pglite` (`test_phase4_2_postgres_integration.js`): **41/41 PASSED**.
- `npm run test:e2e` (`test_phase4_1_chromium_e2e.js`): **66/66 PASSED** (شاملة 64 فحصًا سابقًا للسيناريوهات A–V + فحصين إضافيين في السيناريو V: `Test V.5` و`Test V.6`).
- `npm run test:pg16` (`test_phase4_2_1_pg16_concurrency.js`): **NOT RUN LOCALLY** (يتطلب خادم PostgreSQL 16 محلي على المنفذ `5432` غير متاح داخل حاوية AI Studio؛ يُشغّل في GitHub Actions CI متوقعًا 96 فحصًا إضافيًا بإجمالي 448).
- إجمالي الفحوصات المنفذة محليًا: **352/352 PASSED (0 failed)**.

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

### Milestone M5 Workstream A — Dirty-State Login & Pull Reconciliation (F-03, T-5.1-08)
Commit: `37806ed47bc9ea01ff88f64b11cc63008a05cdb2`  
GitHub Actions Run #24: `42099610871` (`438/438 PASSED`)  
الحالة: **CI VERIFIED — NOT APPROVED**.

## 4. المرحلة النشطة

# Milestone M5-A.1 — Provenance, Async Account-Switch Safety & Fail-Closed Reconciliation Corrections

**Status: IMPLEMENTED — LOCAL TESTS ONLY (IN PROGRESS — NOT APPROVED)**

- مسار العمل الحالي: **M5-A.1 (تصحيحات التحقق من أصل البيانات وحماية سباق تبديل الحسابات غير المتزامن ومسارات الإجهاض الآمن Fail-Closed)**.
- مسار العمل القادم: **Milestone M5 Workstream B (F-05 Annotation Decoupling & N-02 Version-Counter Redesign)**.
- **حدود الاعتماد:** لا يُعتبر Milestone M5 مكتملاً حتى يكتمل كلا مساري العمل (M5-A.1 وM5-B) ويجتازا المراجعة المستقلة وCI.

### الأهداف والتصحيحات المنفذة في M5-A.1:

1. **التصحيح (أ) — التحقق الإيجابي من أصل البيانات (Verified Guest Provenance):**
   - تم إنشاء دالة `verifyLocalWorkspaceProvenance(targetUid, opCtx, priorActiveUid)` للتحقق الإيجابي من ملكية البيانات المحلية قبل المصالحة.
   - البيانات المتسخة لنفس الحساب لا تدخل المصالحة إلا عند مطابقة UID الصريحة.
   - غياب `lastActiveUid` أو القيمة `'local'` لا يُعد برهانًا كافيًا لملكية الحساب الجديد، ويشترط وجود مطالبة أصلية صريحة قابلة للتدقيق (`pharmaGuestProvenanceClaim === targetUid`).
   - في حال غياب البرهان أو عدم تطابقه، يتم حظر المصالحة نهائيًا (Fail-Closed)، وحفظ مساحة عمل الضيف غير المؤكدة في مخزن عزل آمن قابل للاستعادة (`pharmaUnverifiedGuestWorkspace_quarantine`) دون إتلافها أو دمجها في الحساب الجديد ودون إجراء أي رفع سحابي كاذب.

2. **التصحيح (ب) — حماية سباق تبديل الحسابات أثناء المصالحة غير المتزامنة (True In-Flight Race Protection):**
   - تم فحص وتأمين حواجز السياق `!opCtx.isCurrent()` عبر جميع الخطوات غير المتزامنة لعملية `reconcileDirtyWorkspaceWithRemote` (قبل وبعد تفريغ الحواشي، بعد الدمج السببي، وبعد الرفع السحابي).
   - في حال تبديل الحساب أثناء تشغيل المصالحة غير المتزامنة للمستخدم (X)، تُجهض العملية فورًا بسبب `account_switched` دون دمج أي بيانات من (X) في مساحة عمل (Y) ودون كتابة أي سجلات سحابية لـ (Y).

3. **التصحيح (ج) — الإجهاض الآمن التام لمساعدي المصالحة (Fail-Closed Helper Pipeline):**
   - في `flushPendingAnnotationsSave`: يُشترط وجود الدالة ونجاح التفريغ الفعلي؛ إذا تعذرت الدالة أو فشلت المعاملة، تُجهض المصالحة فورًا برمز `pending_annotations_flush_failed` مع إبقاء علم الاتساخ مرفوعًا (`pharmaWorkspaceDirty = '1'`).
   - في `autoStampTrackedWorkspaceMutations`: يُشترط وجود الدالة وسلامة الختم لجميع التعديلات (`stampRes.ok === true && stampRes.failedCount === 0`)؛ في حال تعطل CSPRNG أو فشل الختم، تُجهض المصالحة فورًا برمز `causal_auto_stamp_failed` دون استدعاء `mergeAndApplyCloudConflict` ودون مسح التعديلات المحلية أو إقرارها سحابيًا.
   - استعادة إمكانية إعادة المحاولة النظيفة فور زوال سبب الفشل.

### الملفات الأربعة الوحيدة المعدلة ضمن النطاق المصرح به:
1. `index.html`
2. `test_phase4_regressions.js`
3. `test_phase4_1_chromium_e2e.js`
4. `reports/CURRENT.md`

### ملخص الفحوصات الإضافية المنجزة:
- **`test_phase4_regressions.js` (`TEST 19`):** 8 فحوصات إضافية دقيقة (`T-5.1-09-A` حتى `T-5.1-09-H`) رفعت إجمالي اختبارات الانحدار إلى **97/97 PASSED**.
- **`test_phase4_1_chromium_e2e.js` (`TEST V`):** فحصان إضافيان (`Test V.5` و`Test V.6`) رفعا إجمالي اختبارات Chromium E2E الحقيقية إلى **66/66 PASSED**.

### حدود الاعتماد الحالية
- حالة المرحلة الحالية هي **`IMPLEMENTED — LOCAL TESTS ONLY (IN PROGRESS — NOT APPROVED)`**.
- لم يتم التحقق من تعديلات Milestone M5-A.1 بعد عبر GitHub Actions CI على GitHub (`NOT CI VERIFIED`).
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

## 6. خطوات العمل بعد M5-A.1

1. مراجعة مستقلة لتعديلات M5-A.1 في الملفات الأربعة المصرح بها.
2. قرار المالك بشأن مزامنة GitHub وتشغيل GitHub Actions CI (Run #25).
3. بعد اعتماد M5-A.1، الانتقال إلى **Milestone M5 Workstream B (F-05 & N-02)**.
4. لا تنفذ M5-B أو M6 تلقائيًا.

## 7. دورة المراجعة والمزامنة

1. Gemini يقرأ `GEMINI.md` وهذا الملف ومستند المرحلة النشطة.
2. Gemini يفحص Base SHA والفرع والملفات السابقة.
3. Gemini يعدّل الملفات التي تسمح بها المرحلة فقط.
4. يعرض Gemini Diff كاملًا وقائمة الملفات والاختبارات الفعلية والقيود.
5. المالك وحده يقرر GitHub Sync.
6. بعد ظهور Commit على GitHub نتحقق من SHA والملفات والـDiff.
7. لا تعتبر المهمة APPROVED إلا بعد مراجعة مستقلة وقرار المالك.

