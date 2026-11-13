# Current Project Handoff

**آخر تحديث:** 2026-11-13  
**المستودع:** JemistryMC/study-hub  
**فرع العمل:** main  
**آخر Source SHA اجتاز GitHub Actions CI:** `86fda9824880c00268db117f1ab8780b106f6fe0`  
**دليل CI:** GitHub Actions CI Run #53 — Run ID `43450226930` — SUCCESS على Source SHA أعلاه، بإجمالي موحد `755/755`، بما في ذلك PostgreSQL 16 الحقيقي `96/96` وChromium E2E `148/148`.  
**دليل النشر:** GitHub Pages Run #146 — Run ID `43450226479` — SUCCESS على Source SHA نفسه.  
**التغيير بعد التحقق:** أي commits لاحقة لتوحيد ملفات الحالة والتقارير هي تغييرات توثيقية فقط ولا تغيّر Source SHA الذي اجتاز CI، ما لم يُذكر خلاف ذلك صراحةً.  
**حالة Phase 6:** IN PROGRESS — WP 6.1 CI VERIFIED; WP 6.2 ACTIVE; FINAL OWNER REVIEW DEFERRED TO PHASE 6 COMPLETION.  
**حالة WP 6.0:** READ-ONLY BASELINE AUDIT — ACCEPTED.  
**حالة WP 6.1:** CI VERIFIED — COMPLETE. تم إصلاح فشل CI #52 في Test KK.3، واجتازت جميع خطوات CI #53 على SHA المحدد أعلاه. لا توجد موافقة منفصلة مطلوبة لإغلاق كل Work Package؛ الاعتماد النهائي سيكون على Phase 6 ككل.  
**حزمة العمل النشطة:** WP 6.2 — Library, Subjects & Table of Contents (Digital Bookshelf، الحفاظ على التسلسل الأكاديمي الحالي، وجعل Table of Contents عرض الفصول الافتراضي).  
**نموذج المراجعة:** يستمر العمل في Work Packages بالتسلسل بعد اكتمال التنفيذ والتحقق التقني ونجاح GitHub Actions CI للحزمة السابقة. لا يُطلب اعتماد منفصل من المالك بعد كل حزمة. للمالك حق إرسال ملاحظات أو طلب تعديلات أو إيقاف العمل في أي وقت، ويحتفظ بالاعتماد النهائي بعد مراجعة Phase 6 كاملة.  
**حدود لا يتضمنها هذا التفويض:** لا تغييرات في Production Supabase أو SQL/Migrations/RLS/RPC/Auth/OAuth/Google Drive permissions أو عقود المزامنة أو مخططات التخزين أو عزل الحسابات أو سياسة Free/VIP أو العمليات الأكاديمية المغلقة دون تفويض صريح مستقل.  
**مراجع المصدر الحالية:** `reports/EXO_PERSONAL_STUDY_JOURNAL_DESIGN.md`, `reports/PHASE_6_EXPERIENCE_REDESIGN_PLAN.md`, `reports/PHASE_6_BASELINE_AUDIT.md`, `reports/PHASE_6_WP_6_1_REPORT.md`.
## مراجع التسليم الحالية

1. العقد الهندسي الدائم: `GEMINI.md`.
2. قرارات المنتج وتجربة الاستخدام المعتمدة: `reports/EXO_PERSONAL_STUDY_JOURNAL_DESIGN.md`.
3. خطة التنفيذ المرحلية: `reports/PHASE_6_EXPERIENCE_REDESIGN_PLAN.md`.
4. الفهرس والتسليم بين Gemini وChatGPT: `reports/README.md`.
5. تقرير WP 6.0 المكتمل: `reports/PHASE_6_BASELINE_AUDIT.md`.
6. تقرير إتمام WP 6.1 المحلي وفحوصاته: `reports/PHASE_6_WP_6_1_REPORT.md`.

## قرارات التصميم المثبتة

- EXO — Personal Study Journal؛ Dark identity بخلفية Ink/Charcoal مع أسطح Warm Paper عند الحاجة.
- Refined Journal كأساس مع تفاصيل Expressive Journal محدودة؛ لا Gaming/Deadlock/Neon/Cyberpunk.
- الألوان: Ink Black #191B1D، Charcoal #292B2D، Warm Paper #F0E6D4، Sage Green #899982 كلون الهوية، Muted Blue #7898AC، Terracotta #C47D60، Warm Gold #D7B96F.
- الخطوط: Manrope + Lora للإنجليزية، IBM Plex Sans Arabic + Noto Naskh Arabic للعربية، ولمسات يدوية نادرة.
- اللغة الافتراضية لأول تشغيل English، مع دعم عربي/إنجليزي كامل وRTL/LTR وحفظ تفضيل المستخدم.
- Hybrid Navigation؛ Dashboard تتمحور حول Daily Focus؛ Library بأسلوب Digital Bookshelf؛ Table of Contents هو عرض الشابترات الافتراضي.
- Chapter Workspace هو المظلة الموحدة لكل موارد الشابتر؛ PDF Studio وأدواته الحالية جزء داخلي منه ويجب الحفاظ عليها بالكامل.
- موارد متعددة الأنواع من مكان واحد، Collections مرنة مختلطة الأنواع، Chapter Overview، واستكمال آخر جلسة مع حفظ السياق المدعوم فعليًا.
- حالات الحفظ والمزامنة والأخطاء تتبع Explain, Guide & Recover؛ يجب شرح المشكلة وحالة البيانات وطريقة الحل بأمان، لا الاكتفاء بعرض الحالة.
- الأولوية الوظيفية وسهولة الاستخدام والأداء وسلامة البيانات؛ الحفاظ على العمليات المغلقة القائمة كما هي وعدم اختراع دورة بديلة.

## تنبيه بشأن السجل التاريخي أدناه

المحتوى بعد الفاصل التالي محفوظ لأغراض التتبع التاريخي فقط. قد يحتوي على SHA أو حالات مراحل أو أرقام اختبارات قديمة، بما فيها ادعاء أن مرحلة أقدم هي النشطة. لا تستخدم أي حالة أو SHA تاريخي أدناه باعتباره handoff حاليًا، ولا تعِد فتح Phase 5.1.1 أو أي مرحلة أقدم تلقائيًا. المرجع النشط هو هذا القسم وخطة Phase 6 أعلاه. عند كل مهمة، تحقق من GitHub HEAD والـSource SHA الفعليين من جديد.


---

## 1. هوية المستودع وخط الأساس المعتمد

- **المستودع المعتمد:** `JemistryMC/study-hub`
- **فرع العمل المعتاد:** `main`
- **آخر HEAD معتمد للتحقق (Authoritative Verified HEAD):**  
  `94259b543a021d4f06fdc0a9aa44d3f346d63037` (مبني على نقاط الأساس السابقة `0841b76d6c07ce756a44a874e8e574253ed2aeb3` و`2433bf6d4a128acf6736f3c099496d551947cc7e`)
- **أدلة التحقق الرسمية في GitHub Actions CI لـ M6:**  
  GitHub Actions **CI Run #43** (Run ID: `43241683581`, Commit SHA: `94259b543a021d4f06fdc0a9aa44d3f346d63037`) — **628/628 PASSED (100% SUCCESS)** شاملة PostgreSQL 16 الحقيقي (`96/96`) ومتصفح Chromium E2E الحقيقي (`111/111`). المرحلة في حالة `CI VERIFIED` بانتظار قرار الاعتماد النهائي (`APPROVED`) من المالك.
- **المرجع المعتمد لنهائيات M5-A (Frozen Dependency):**  
  GitHub Actions CI Run #29 (Run ID: `42117460988`, Source SHA: `ab44f08bcf97328b1583d5bdd8a85943d4dbe079`) — **463/463 PASSED (100% SUCCESS)**. سلوكيات الحجر الصحي (Quarantine) وفصل الحسابات واستعادة IndexedDB لـ M5-A مجمدة ومحمية بالكامل.
- **المرجع المعتمد لـ M5-B الأساسي:**  
  GitHub Actions CI Run #31 (Run ID: `42181917380`, Source SHA: `fb93a920fe006279e2c51eab708219b9b7566f70`) — **482/482 PASSED (100% SUCCESS)**.
- **الفروع المرجعية المحمية:**
  - `Deploying`: مرجع تاريخي لخط أساس سابق، وليس فرع العمل الحالي.
  - `backup/pre-gemini-security-2026-11-04`: نقطة استرجاع محمية؛ لا تُحذف ولا تُعدّل.

---

## 2. إغلاق متطلبات القبول النهائي لـ M5-B (Acceptance Closure)

تمت معالجة الثغرتين المتبقيتين اللتين كشفت عنهما المراجعة المستقلة للكود المصدري:

### 2.1 الثغرة الأولى: الإجهاض الصارم عند فشل هجرة الحواشي القديمة (Fail-Closed Abort)
- **الموقع:** `pullWorkspaceFromCloud()` (السطور 36330-36350) و`syncWorkspaceOnLogin()` (السطور 36810-36830) في `index.html`.
- **السلوك السابق:** كان يتم تسجيل تحذير عند فشل هجرة الحواشي القديمة `migrateLegacyAccountAnnotationsToIDB` والاستمرار في استعادة مساحة العمل، مما قد يؤدي إلى فقدان حواشي المستخدم أو الكتابة فوقها.
- **السلوك المعتمد:** الإجهاض الفوري والحاسم (Fail-Closed):
  1. إرجاع كائن خطأ هيكلي: `{ status: 'error', ok: false, reason: 'legacy_migration_failed', error: ... }`.
  2. الحفاظ الصارم على حالة التعديل المحلية بتعيين `pharmaWorkspaceDirty = '1'` و`pharmaWorkspaceDirty_<uid> = '1'`.
  3. عدم تطبيق السطر السحابي (Remote Row) محلياً وعدم تقديم رقم المراجعة `currentCloudWorkspaceRevision`.
  4. عدم حذف أو مسح الحواشي أو البيانات المحلية الحالية إطلاقاً.
- **فحوصات التحقق:** `T-5.1-M5B-10` و`T-5.1-M5B-11` في `test_phase4_regressions.js` تجتازان الاختبار بنسبة 100%.

### 2.2 الثغرة الثانية: استبدال اختبار السباق الوهمي باختبار تزامن حقيقي معلق على الشبكة
- **الموقع:** `T-5.1-M5B-08` في `test_phase4_regressions.js`.
- **السلوك السابق:** كان الاختبار يستدعي التعديل المتزامن محلياً دون إثبات تعليق استدعاء RPC على الشبكة في بيئة لاتزامنية حقيقية.
- **السلوك المعتمد:**
  1. إنشاء Deferred Promise (`deferredRpc1Promise`) لإيقاف أول استدعاء لـ `supabaseClient.rpc` في حالة انتظار شبكي معلقة (In-Flight).
  2. إنشاء إشارة مزامنة (`rpc1StartedPromise`) للتأكد قطيعاً من وصول المحرك إلى داخل استدعاء دالة RPC قبل المتابعة.
  3. تنفيذ تعديل حقيقي للحواشي عبر `saveAnnotationsToDB('lec_race_101', mutatedPagesDuringRpc, null, m5bRaceCtx)` واستدعاء `flushPendingAnnotationsSave` أثناء التعليق الشبكي.
  4. إثبات تصاعد عداد النسخ الأحادي `annotationMutationSeq > vAtStart`.
  5. حل الوعد الشبكي لـ Push 1 والتحقق من أن استجابة الخادم تُبقي علامة `dirtyAnnotationsForCloud = true` و`pharmaWorkspaceDirty = '1'` لأن تعديلاً أحدث طرأ أثناء وجود الطلب على الشبكة.
  6. إطلاق Push 2 والتحقق من إرساله للحواشي المعدلة حديثاً وتصفير علامات الاتساخ بعد تأكيد نجاح الخادم.
- **فحوصات التحقق:** `T-5.1-M5B-08a`, `08b`, `08c`, `08d` في `test_phase4_regressions.js` و`Test X.2` في Chromium E2E تجتاز الاختبارات بنسبة 100%.

---

## 3. حزمة العمل السابعة: النسخ الاحتياطي والاستعادة الكاملة لمساحة العمل (WP-7)

تم تنفيذ معمارية Tier A Complete Workspace Backup & Restore بالكامل في `index.html` مع واجهة مستخدم متكاملة:

### 3.1 هيكل المخطط القياسي (`exo_workspace_backup_v4`)
- **المخطط والإصدار:** `schema: "exo_workspace_backup_v4"`, `version: 4`.
- **حقول التعريف:** `exportedAt` (ISO Timestamp)، `accountScopeHint` (UID الحساب المُصدر)، `appVersion` (`1.4.2-1`).
- **حقول التشفير وسلامة المحتوى:**
  ```json
  "integrity": {
    "algorithm": "SHA-256",
    "canonicalScope": "data",
    "sha256": "64-character lowercase hex digest"
  }
  ```
- **حاوية البيانات الشاملة (`data`):**
  1. `subjects`: الهيكل الأكاديمي الشجري للمواد والمجموعات والفصول والمحاضرات.
  2. `schedule`: الجدول الدراسي بكافة عناصره (`events`, `backlog`, `plannerPrefs`, `weeklyReports`, `pdfFitMode`, `cloudMediaRegistry`, `_tombstones`, `_conflictRecovery`, `_deviceRegistry`, `gdriveSync` بدون رموز سرية).
  3. `logs`: سجلات المذاكرة والأنشطة الأكاديمية.
  4. `academy_progress`: مصفوفة الوحدات والمسارات الأكاديمية المكتملة.
  5. `annotations`: حواشي المحاضرات المعزولة حسابياً والمقروءة من IndexedDB، مفهرسة بمعرفات المحاضرات الصافية (Raw Lecture IDs).

### 3.2 معايير الأمان والتشفير الصارم (Zero-Token & Anti-Tampering Guarantee)
1. **استبعاد الوسائط الثنائية (Zero Binary Media):** يتم استبعاد ملفات PDF وملفات الصوت المخزنة محلياً بالكامل من ملف النسخة الاحتياطية JSON، مع الحفاظ على بصمة الروابط والمعرفات السحابية في `cloudMediaRegistry`.
2. **استبعاد الرموز السرية (Zero Secret Tokens):** يتم تفريغ واستبعاد أي رموز وصول أو رموز تحديث OAuth لـ Google Drive (`exo_gdrive_token`, `googleAccessToken`, `access_token`, `refreshToken`)، مع قصر بيانات Drive على البريد الإلكتروني ومعرف المجلد العام ومعلومات المساحة.
3. **التسلسل القياسي المعياري (Canonical JSON):** تطبيق دالة `canonicalizeJson(obj)` لترتيب كافة مفاتيح الكائنات أبجدياً بصورة تعاودية (Lexicographical Key Ordering) مع الحفاظ على الترتيب الصارم لعناصر المصفوفات.
4. **تجزئة SHA-256 القياسية (FIPS 180-4 Compliant):** حساب التجزئة باستخدام `crypto.subtle.digest('SHA-256')` عند توفر Web Crypto، أو خوارزمية التجزئة البرمجية الصافية المدمجة `computePureSha256(str)` كبديل آمن ومتوافق.

### 3.3 دورة حياة المعاملة خماسية المراحل القابلة للتعافي من الانهيار (Crash-Recoverable 5-Phase Lifecycle)
تنفذ عملية الاستعادة من خلال سجل تعافٍ مخصص في IndexedDB تحت المخزن `annotation_recovery_vault` بمفتاح حسابي محمي `usr_<sanitizedUid>::__import_journal_v1__`:
1. **المرحلة 1: `PREPARE`:**
   - فحص النسخة والتحقق من صحة التجزئة وحجم الملف (حد أقصى 50 ميجابايت).
   - التقاط لقطة تجميدية كاملة للحالة المحلية السابقة (LocalStorage + IndexedDB Annotations) وحفظها في `annotation_recovery_vault`.
   - تسجيل حالة المعاملة في `pharmaImportTxState_<uid>` كـ `PREPARE`.
2. **المرحلة 2: `APPLY_IDB`:**
   - تطبيق تعديلات الحواشي في IndexedDB عبر معاملة `readwrite`.
   - في نمط الاستبدال (`replace`): حذف حواشي المستخدم النشط فقط (مع الحفاظ على حواشي الحسابات الأخرى ومخازن الوسائط) وكتابة الحواشي المستوردة.
   - في نمط الدمج (`merge`): دمج الحواشي المستوردة مع الحواشي القائمة غير المتضاربة سببياً.
   - في حال فشل المعاملة: التراجع الفوري الطارئ (`rollbackImportFromJournal`) واستعادة الحالة السابقة من السجل.
3. **المرحلة 3: `APPLY_LOCALSTORAGE`:**
   - تطبيق بيانات المواد والجدول والسجلات محلياً.
   - وضع علامة `pharmaWorkspaceDirty = '1'` و`dirtyAnnotationsForCloud = true` وتصعيد عداد النسخ لضمان جدولة المزامنة السحابية.
4. **المرحلة 4: `COMMITTED`:**
   - تأكيد اكتمال كتابة كافة المخازن وتحديث حالة المعاملة.
5. **المرحلة 5: `FINALIZE`:**
   - مسح سجل المعاملة من `annotation_recovery_vault` ومسح `pharmaImportTxState_<uid>`.
   - تحديث واجهة المستخدم والقوائم الدراسية وإطلاق إشعار النجاح.

- **خطاف التعافي التلقائي عند بدء التشغيل (`recoverPendingImportJournalIfNeeded`):**
  يُستدعى تلقائياً عند تهيئة `initPdfDB()` وعند تسجيل الدخول `syncWorkspaceOnLogin()`. إذا عُثر على معاملة متوقفة في مرحلة `COMMITTED`، يتم إتمامها وتنظيف السجل؛ وإذا كانت في مرحلة سابقة، يتم تنفيذ التراجع التلقائي لحماية المستخدم من أي تشوه في البيانات ناتج عن إغلاق المتصفح أو انقطاع الطاقة.

### 3.4 أنماط الاستعادة وخيارات المعاينة
1. **نمط الاستبدال (`replace`):** يستبدل مساحة عمل الحساب النشط وحواشيه بالكامل دون المساس ببيانات الحسابات الأخرى أو مخازن الوسائط الثنائية.
2. **نمط الدمج السببي (`merge`):** يدمج شجرة المواد وجداول المواعيد والمهام والسجلات باستخدام المحرك السببي `mergeSubjectsHierarchyWithCausalEngine` وشواهد القبور، ويدمج صفحات الحواشي غير المتقاطعة.
3. **نافذة الفحص والمعاينة المسبقة (`#backupImportPreflightModalOverlay`):**
   - تصميم زجاجي أنيق متوافق مع نمط Exo بـ z-index 4000.
   - إحصائيات فورية: عدد المواد، عدد المحاضرات، عدد صفحات الحواشي، حجم الملف، وسلامة التجزئة SHA-256.
   - تنويه شفاف ومباشر: "النسخة تتضمن المواد والجدول والسجلات والحواشي، ولا تتضمن ملفات PDF أو الصوت الثنائية (تتم استعادتها سحابياً عبر Google Drive)".
   - أزرار صريحة لاختيار نمط الاستعادة: "استبدال مساحة العمل الحالية" أو "دمج مع مساحة العمل الحالية" أو "إلغاء".

---

## 4. قياسات الأداء الموثقة لـ WP-7 (Tier A Performance Benchmarks)

أُجريت اختبارات الأداء الميدانية على حزم بيانات متسلسلة اصطناعية تحاكي مساحات عمل حقيقية متعددة الأحجام حتى الحد الأقصى المدعوم (50 ميجابايت):
- **البيئة:** `Linux x64`, Node.js `v22.23.2`, V8 Engine.
- **الحد الأقصى المدعوم:** `50 MB` (`52,428,800 bytes`).

### نتائج القياس الميداني:
| حجم النسخة الاحتياطية | الحجم الفعلي للبيانات | الفحص والتحليل (Parse) | التسلسل المعياري (Canonicalize) | حساب تجزئة SHA-256 | إجمالي زمن المعالجة |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1 MB** | **1.04 MB** | **4.6 ms** | **13.9 ms** | **1.3 ms** | **19.8 ms** |
| **5 MB** | **5.01 MB** | **18.2 ms** | **69.8 ms** | **5.1 ms** | **93.1 ms** |
| **15 MB** | **15.02 MB** | **57.4 ms** | **213.6 ms** | **15.6 ms** | **286.7 ms** |
| **25 MB** | **25.04 MB** | **102.8 ms** | **374.9 ms** | **27.2 ms** | **505.0 ms** |
| **50 MB (الحد الأقصى)** | **50.08 MB** | **205.1 ms** | **812.3 ms** | **58.4 ms** | **1,075.8 ms (~1.08 ثانية)** |

- **تقييم الأداء:** كافة العمليات تُنجز في زمن قياسي أقل من 1.1 ثانية لحجم 50 ميجابايت ضخم يحتوي عشرات آلاف الضربات الخطية والبيانات السببية، مما يضمن سلاسة تامة واستجابة فورية دون تجميد المتصفح.

---

## 5. حزمة العمل الثامنة: التشخيص السحابي الدقيق والتفاعلي لـ Supabase (WP-8)

تم تنفيذ مصنف الأخطاء الشامل `classifySupabaseError(error, rpcResponse)` في `index.html`:

### 5.1 الفئات العشر الحتمية للأخطاء (Deterministic Classification Categories)
| # | الفئة (`category`) | الرمز (`code`) | شروط الكشف | التوجيه الموجه للمستخدم (باللغة العربية) |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `offline` | `ERR_OFFLINE` | `!navigator.onLine` أو `failed to fetch` أو أخطاء انقطاع الشبكة | لا يوجد اتصال بالإنترنت أو تعذر الوصول إلى الخادم السحابي. يمكنك متابعة المذاكرة والتسجيل محلياً، وستتم المزامنة تلقائياً فور عودة الاتصال. |
| 2 | `unauthorized` | `ERR_UNAUTHORIZED` | كود 401، `PGRST301`، انتهاء صلاحية JWT، غياب الجلسة | انتهت صلاحية جلسة تسجيل الدخول أو الرمز الأمني غير صالح. يرجى تسجيل الدخول مجدداً إلى حساب الكلاود لتجديد الجلسة ومتابعة المزامنة. |
| 3 | `function_signature_mismatch` | `ERR_SIG_MISMATCH` | كود `42883` مع ذكر المعاملات، أو عدم تطابق توقيع الدالة | معاملات دالة المزامنة غير متطابقة مع توقيع الدالة في الخادم. يرجى مطابقة معلمات الاستدعاء مع تعريف الدالة المخزنة في PostgreSQL. |
| 4 | `missing_rpc` | `ERR_MISSING_RPC` | كود 404، `PGRST202`، دالة المزامنة غير موجودة بالخادم | دالة المزامنة السحابية غير معرفة أو مفقودة في قاعدة البيانات. يرجى مراجعة إعدادات قاعدة البيانات والتأكد من تطبيق دوال المزامنة المطلوبة. |
| 5 | `postgrest_schema_cache` | `ERR_SCHEMA_CACHE` | كود `PGRST200`، `PGRST204`، الحاجة لتحديث كاش المخطط | الذاكرة المؤقتة لمخطط قاعدة البيانات تحتاج إلى تحديث. يرجى إرسال إشارة `NOTIFY pgrst, 'reload schema'` لتحديث الذاكرة المؤقتة في Supabase. |
| 6 | `permission_denied` | `ERR_PERMISSION_DENIED` | كود 403، `42501`، انتهاك سياسات RLS، صلاحية مرفوضة | تم رفض الصلاحية بواسطة سياسات أمان قاعدة البيانات (RLS). تأكد من تسجيل الدخول بالحساب الصحيح وأن سياسات RLS تسمح بهذا الإجراء. |
| 7 | `occ_conflict` | `ERR_OCC_CONFLICT` | استجابة RPC بحالة `conflict` أو تعارض أرقام المراجعة | تم اكتشاف تعارض في مراجعة البيانات بين جهازين مختلفين. جاري دمج التغييرات تلقائياً دون فقدان أي بيانات محلية. |
| 8 | `invalid_payload` | `ERR_INVALID_PAYLOAD` | كود 400، `22P02`، خطأ صياغة JSON أو بيانات غير صالحة | حمولة البيانات المرسلة غير صالحة أو تحتوي على بيانات غير متوافقة مع الخادم السحابي. |
| 9 | `server_error` | `ERR_SERVER_ERROR` | كود 500، 502، 503، أخطاء الخادم الداخلية | تعذر إتمام العملية بسبب عطل مؤقت في الخادم السحابي. بياناتك المحلية محفوظة وآمنة بالكامل. |
| 10 | `unknown` | `ERR_UNKNOWN` | أي استثناء غير مصنف | حدث خطأ غير متوقع أثناء الاتصال بالخادم السحابي. يرجى المحاولة مرة أخرى لاحقاً؛ بياناتك المحلية محفوظة وآمنة بالكامل. |

### 5.2 حماية البيانات وتجريد الأسرار (Secret Redaction)
- **ضمانة الحفاظ على الاتساخ (`preservesDirty: true`):** كافة الفئات العشر تُعيد حتماً `preservesDirty: true` لمنع تصفير علامات التعديل المحلي عند فشل الشبكة أو الخادم.
- **دالة التجريد الأمني (`sanitizeTechnicalErrorDetail(detail)`):** تقوم بمسح وإخفاء أي مفاتيح أو رموز حساسة قبل عرضها أو تسجيلها:
  - استبدال رموز JWT بتنسيق `Bearer [REDACTED]` أو `jwt=[REDACTED]`.
  - استبدال كلمات المرور والمفاتيح السرية بتنسيق `password=[REDACTED]` و`secret=[REDACTED]` و`apikey=[REDACTED]`.

### 5.3 استعلام الفحص المسبق للقاعدة المخصص للمالك (Owner-Executable SELECT-Only SQL Preflight Query)
استعلام تشخيصي آمن بصيغة `SELECT` فقط (قراءة فقط بدون أي كتابة أو DDL أو DML)، يمكن للمالك تشغيله في Supabase SQL Editor للتحقق الفوري من جاهزية الخادم السحابي لدوال ومخططات M5/M6:

```sql
-- ============================================================================
-- EXO PLATFORM — OWNER SUPABASE PREFLIGHT READ-ONLY DIAGNOSTIC QUERY
-- Safe: SELECT only. Zero writes. Zero DDL. Zero mutations.
-- ============================================================================

WITH
rpc_check AS (
    SELECT
        p.proname AS rpc_name,
        pg_get_function_identity_arguments(p.oid) AS argument_signature,
        pg_get_function_result(p.oid) AS return_type,
        p.prosecdef AS is_security_definer,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_has_execute,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_has_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('sync_workspace_with_concurrency', 'enforce_workspace_write_via_rpc')
),
table_check AS (
    SELECT
        t.tablename,
        t.rowsecurity AS rls_enabled,
        has_table_privilege('authenticated', 'public.' || t.tablename, 'SELECT') AS auth_can_select,
        has_table_privilege('authenticated', 'public.' || t.tablename, 'INSERT') AS auth_can_insert,
        has_table_privilege('authenticated', 'public.' || t.tablename, 'UPDATE') AS auth_can_update,
        has_table_privilege('authenticated', 'public.' || t.tablename, 'DELETE') AS auth_can_delete,
        has_table_privilege('anon', 'public.' || t.tablename, 'SELECT') AS anon_can_select
    FROM pg_tables t
    WHERE t.schemaname = 'public'
      AND t.tablename = 'user_workspaces'
),
columns_check AS (
    SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_workspaces'
    ORDER BY ordinal_position
),
triggers_check AS (
    SELECT
        trigger_name,
        event_manipulation,
        action_statement,
        action_timing
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'user_workspaces'
)
SELECT json_build_object(
    'diagnostic_timestamp', now(),
    'postgres_version', version(),
    'rpc_functions', (SELECT json_agg(r) FROM rpc_check r),
    'table_security', (SELECT json_agg(t) FROM table_check t),
    'table_columns', (SELECT json_agg(c) FROM columns_check c),
    'table_triggers', (SELECT json_agg(tr) FROM triggers_check tr),
    'assessment', json_build_object(
        'rpc_available', EXISTS(SELECT 1 FROM rpc_check WHERE rpc_name = 'sync_workspace_with_concurrency'),
        'rls_enforced', COALESCE((SELECT rls_enabled FROM table_check WHERE tablename = 'user_workspaces'), false),
        'direct_write_blocked', NOT COALESCE((SELECT auth_can_update FROM table_check WHERE tablename = 'user_workspaces'), true),
        'status', CASE
            WHEN EXISTS(SELECT 1 FROM rpc_check WHERE rpc_name = 'sync_workspace_with_concurrency')
             AND COALESCE((SELECT rls_enabled FROM table_check WHERE tablename = 'user_workspaces'), false)
             AND NOT COALESCE((SELECT auth_can_update FROM table_check WHERE tablename = 'user_workspaces'), true)
            THEN 'HEALTHY_AND_READY'
            ELSE 'ATTENTION_REQUIRED'
        END
    )
) AS exo_supabase_diagnostic_report;
```

---

## 6. استراتيجية التطوير الموحدة لقاعدة بيانات Supabase (Consolidated Evolution Strategy)

تأكيداً لسياسة المشروع الصارمة: **لم يتم تطبيق أي تعديل أو ترحيل (Migration) على قاعدة بيانات الإنتاج الحية**. الاستراتيجية المعتمدة ترتب التطور المستقبلي كالتالي:

### 6.1 متطلبات M6 الحالية (Milestone M6 Requirements):
- **تعديلات قاعدة البيانات المطلوبة لـ M6:** **0 (صفر تعديل / Zero Database Changes)**.
- **التبرير الهندسي:** النسخ الاحتياطي والاستعادة المحلية (WP-7) تعتمد على المخطط القياسي v4 وتخزين IndexedDB المحلي مع التشفير بـ SHA-256. التشخيص السحابي (WP-8) يعمل كطبقة تصنيف وتوجيه على مستوى العميل للمزامنة الحالية. دالة `sync_workspace_with_concurrency` المعتمدة في M5-A وM5-B كافية ومكتملة تماماً لمتطلبات M6 الحالية.

### 6.2 متطلبات المرحلة 5.2 المستقبلية (Phase 5.2: Cloud Media & Offline Google Drive Bridge):
- **تعديلات قاعدة البيانات المطلوبة لـ Phase 5.2:** **0 (صفر تعديل / Zero Database Changes)**.
- **التبرير الهندسي:** المرحلة 5.2 تختص برفع ومزامنة وإدارة ملفات الوسائط (PDF والصوتيات) عبر Google Drive API ومخازن IndexedDB المحلية والذاكرة المؤقتة. حقل `can_upload_media` الموجود مسبقاً في `public.user_workspaces` هو المحدد لاستحقاق VIP لهذه الميزات. لا يتطلب تنفيذ Phase 5.2 أي حقول أو جداول جديدة في Supabase.

### 6.3 متطلبات المرحلة 5.3 المستقبلية (Phase 5.3: Delta Sync Engine Strategy):
- عند اعتماد تنفيذ المرحلة 5.3 لاحقاً، ستتطلب المزامنة الفارقة (Delta Synchronization) تطوير مخطط قاعدة البيانات عبر ترحيل أمامي موحد (Single Coordinated Upgrade):
  1. **جدول سجل العمليات السببية (`public.workspace_operation_log`):**
     - الأعمدة: `id` (UUID), `user_id` (UUID FK), `device_id` (TEXT), `actor_id` (TEXT), `operation_id` (TEXT UNIQUE), `entity_type` (TEXT), `entity_id` (TEXT), `operation_type` (upsert/delete), `payload` (JSONB), `lamport_clock` (BIGINT), `revision` (BIGINT), `created_at` (TIMESTAMPTZ).
  2. **دالة المزامنة الفارقة الموحدة (`sync_workspace_delta_v1`):**
     - تقبل قائمة العمليات المحلية الجديدة مع آخر مراجعة معلومة للعميل (`p_client_revision`).
     - تطبق العمليات داخل معاملة ذرية مع كشف التعارض السببي وتصعيد رقم مراجعة الحساب.
     - تُرجع فقط دلتا العمليات البعيدة المضافة منذ مراجعة العميل السابقة، متفادية نقل مساحة العمل كاملة.
  3. **سياسات الأمان والحجر (RLS & Grants):**
     - تفعيل RLS الصارم مع قصر الصلاحيات على `auth.uid() = user_id`.
     - حظر أي وصول كتابي مباشر (INSERT/UPDATE/DELETE) لدور `authenticated` وقصره على الدالة البرمجية `SECURITY DEFINER`.

---

## 7. نتائج الاختبارات المعتمدة محلياً (Local Test Execution Summary — M6 Final Closure)

تم تشغيل والتحقق من كافة مجموعات الاختبارات بنسبة نجاح 100% بعد تنفيذ إغلاق سلامة البيانات النهائي (M6 Final Data-Integrity Closure):

| مسار الاختبار | الأمر المنفذ | النتيجة الفعلية | الملاحظات |
| :--- | :--- | :--- | :--- |
| **فحص الصياغة والقواعد** | `npm run lint` | **PASSED** | فحص كافة ملفات الخادم والبناء والاختبارات دون أخطاء صياغية. |
| **بناء الإنتاج والتجميع** | `npm run build` | **PASSED** | نسخ الأصول وتجهيز حزمة الإنتاج وتجميع التطبيق بنجاح. |
| **الأمان والتشفير الثابت** | `npm run test:static` | **54/54 PASSED** | اختبارات PBKDF2 والتحقق من الأمان الثابت وتجريد الأسرار. |
| **عزل الحسابات والذاكرة** | `node test_phase3_cross_account_isolation.js` | **52/52 PASSED** | التحقق من عزل الحسابات ولحظات IndexedDB المجردة. |
| **الانحدار والمنطق اللاتزامني** | `node test_phase4_regressions.js` | **168/168 PASSED** | شاملة كافة فحوصات M5-B وM6 وفحوصات الإغلاق النهائي CF1-CF5 (السجل المتين، لقطة الحواشي، مفاتيح LocalStorage الـ17، حظر Replace القديم). |
| **التحقق الشامل** | `node run_comprehensive_verification.js` | **42/42 PASSED** | اختبارات المنطق الأكاديمي والتحقق الشامل. |
| **مكتبة PGlite WASM** | `npm run test:pglite` | **41/41 PASSED** | توافق استعلامات ودوال PostgreSQL عبر محاكي WASM. |
| **المتصفح الحقيقي Chromium E2E** | `node test_phase4_1_chromium_e2e.js` | **87/87 PASSED** | شاملة سيناريوهات M5-B (Test X) وسيناريوهات M6 الموسعة (Test Y.1–Y.7) وسيناريوهات الانهيار وإعادة تشغيل المتصفح الحقيقي (Test Z.1–Z.6). |
| **مشغل الاختبارات الموحد** | `node run_all_tests.js` | **444/444 PASSED** | إجمالي الفحوصات المدمجة المنفذة محلياً بنجاح تام (100% Success). |
| **قياس الأداء المكتبي (Node.js)** | `npm run benchmark:node` | **5/5 TIERS PASSED** | قياس خوارزمي مجرد لمصفوفات الذاكرة والتجزئة لحمولات 1 إلى 50 ميجابايت. |
| **قياس الأداء الحقيقي (Chromium)** | `npm run benchmark:browser` | **5/5 TIERS PASSED** | قياس ميداني حقيقي داخل متصفح Chromium v155 لمساحات عمل كاملة حتى 48.51 ميجابايت (2,505 محاضرات). |

*(ملاحظة هامة: `test_phase4_2_1_pg16_concurrency.js` مخصص لبيئة CI مع خادم PostgreSQL 16 حقيقي متعدد الاتصالات؛ نتيجة CI Run #33 المرتبطة بنقطة البداية تُسجل منفصلة عن هذا التقرير المحلي).*

---

## 8. تفاصيل التمريرة التصحيحية السابقة (M6 Critical Corrective Pass Details)

1. **التحقق الصارم من سلامة النسخ v4 (Strict Fix A):**
   - التحقق الإلزامي من العناصر الثمانية لنسخ v4: (`schema === 'exo_workspace_backup_v4'`, `version === 4`, كائن `data` صالح، `integrity.algorithm === 'SHA-256'`, `integrity.canonicalScope === 'data'`, بصمة 64-hex SHA-256 صالحة، مطابقة تامة لـ `byteLength` مع بايتات UTF-8 للبيانات المقننة، وتطابق التجزئة المحسوبة).
   - حظر قبول أي نسخة v4 بحالة سلامة `integrityStatus === 'none'`.
   - فحص الحجم الصارم (حد أقصى 50 ميجابايت) لكافة المدخلات (نصوص، ملفات، أو كائنات محللة) دون الاعتماد على الحجم المصرح به.
2. **التحقق الهيكلي من النطاقات الإلزامية (Strict Fix B):**
   - إلزامية تواجد نطاقات `subjects` (مصفوفة)، `schedule` (كائن)، `logs` (مصفوفة)، `annotations` (كائن).
   - رفض النسخ الناقصة فوراً بأخطاء `MISSING_REQUIRED_DOMAIN` و`INVALID_DOMAIN_TYPE` لمنع تحويل النسخ الناقصة إلى عمليات استبدال مدمرة.
   - التحقق من الهياكل الداخلية (معرفات المواد وكائنات صفحات الحواشي).
   - في النسخ القديمة (v1-v3)، تتبع النطاقات المتوفرة وتعطيل نمط الاستبدال (`canReplace = false`) عند نقص النطاقات.
   - تنظيف `deepSanitizeBackupObject`: رفع الحد الأقصى للعمق إلى 32، واستبدال البايتات الصفرية فقط دون اقتصاص النصوص أو المصفوفات.
3. **تصدير مغلق عند الفشل (Strict Fix C - Fail-Closed Export):**
   - إجهاض فوري برمز `ANNOTATION_FLUSH_FAILED` عند فشل تفريغ الحواشي المعلقة.
   - التحقق من سياق الحساب `ACCOUNT_CONTEXT_SWITCHED` لمنع التصدير أثناء تبديل الحساب.
   - إجهاض فوري برمز `ANNOTATIONS_READ_FAILED` عند فشل قراءة حواشي الحساب من IndexedDB.
   - تضمين `integrity.byteLength` وتطهير تلميح الحساب `accountScopeHint`.
4. **إعادة تصميم سجل المعاملات حول مخزن الحقيقة المتين (Strict Fix D - Vault-Backed Durable Journal):**
   - جعل `annotation_recovery_vault` في IndexedDB هو المصدر الوحيد لحالة ومراحل المعاملة.
   - التقاط لقطة تجميدية لمفاتيح LocalStorage وحواشي IndexedDB السابقة مع بيانات السجلات المستهدفة.
   - إنشاء حاجز العمليات `pharmaImportBarrier_<uid>`.
   - تراجع دقيق في `rollbackImportFromJournal` واستعادة الحالة السابقة وحذف السجلات الجديدة المستوردة.
   - عند فشل التراجع، الانتقال فوراً إلى `ROLLBACK_FAILED_QUARANTINE` وتفعيل الحجر الصحي.

---

## 9. سياسة المنتج الدائمة (Free vs VIP)

- **Annotated PDF Export:** مجاني 100% لمستخدمي Free وVIP.
- **Extra Note Sheet:** مجاني 100% لمستخدمي Free وVIP مع إمكانية إنشاء عدة أوراق ملاحظات.
- **النسخ الاحتياطي والاستعادة القياسية (WP-7 JSON Backup & Restore):** مجاني 100% لكافة المستخدمين.
- **VIP:** استحقاق يدوي حصري عبر تغيير `can_upload_media` في `public.user_workspaces` لرفع وسائط Google Drive والميزات الإضافية المعتمدة من المالك.
- **حدود الصلاحيات:** لم يُجرَ أي دفع أو مزامنة لـ GitHub، والتغييرات بانتظار مراجعة المالك المستقلة.

---

## 10. إغلاق سلامة البيانات النهائي (M6 Final Data-Integrity Closure)

تم تنفيذ وتوثيق الإصلاحات الهندسية العشرة الحاسمة (CF1–CF10) لمعالجة كافة نوافذ الانهيار والسباق وحماية سلامة البيانات:

### 10.1 جدول الانتقال بين الحالات لمراحل المعاملة الست (State-Transition Table)
المصدر الحصري للحقيقة المتينة هو مخزن `annotation_recovery_vault` في IndexedDB تحت المفتاح `usr_<uid>::__import_journal_v1__`:

| حالة السجل (Journal State) | حالة المؤشر (Pointer Phase) | حاجز الحساب (Barrier) | الإجراء المتخذ عند التعافي / بدء التشغيل | العمليات السحابية |
| :--- | :--- | :--- | :--- | :--- |
| `PREPARE` | `PREPARE` | نشط | تراجع كامل إلى اللقطة السابقة وتنظيف السجل والمؤشر والحاجز | محجوبة بالكامل (`quarantine_active` / `import_in_progress`) |
| `APPLY_IDB` | `APPLY_IDB` | نشط | تراجع كامل إلى اللقطة السابقة (حذف المستورد واستعادة الأصلي) وتنظيف | محجوبة بالكامل |
| `APPLY_LOCALSTORAGE` | `APPLY_LOCALSTORAGE` | نشط | تراجع كامل واستعادة المفاتيح الـ17 الأصلية في LocalStorage وتنظيف | محجوبة بالكامل |
| `COMMITTED` | `COMMITTED` | نشط | تثبيت ونهائية تلقائية (`FINALIZE`): حفظ مساحة العمل، تصعيد النسخة، تنظيف السجل والحاجز | محجوبة حتى إتمام النهائية |
| `FINALIZE` | `FINALIZE` | نشط أو تم تنظيفه | اكتمال التنظيف وحذف المؤشر والحاجز المتبقيين دون فرض حجر صحي | مسموحة فور اكتمال التنظيف |
| `ROLLBACK_FAILED_QUARANTINE` | `ROLLBACK_FAILED_QUARANTINE` | نشط ومحجور | حجر صحي صارم دائم، منع فتح مساحة العمل، حظر المزامنة | محجوبة حاسماً (`quarantine_active`) |
| غير موجود (محذوف) | `FINALIZE` | متبقٍ | حذف المؤشر والحاجز المتبقيين بأمان دون حجر (Crash أثناء التنظيف) | مسموحة فور التنظيف |
| غير موجود (محذوف) | `PREPARE` / `APPLY_*` / `COMMITTED` | نشط | فرض الحجر الصحي الفوري للاشتباه في تلف أو فقدان السجل غير المكتمل | محجوبة حاسماً (`quarantine_active`) |
| غير صالح / تالف (JSON parse error) | أي حالة | نشط | فرض الحجر الصحي الفوري وحفظ السجل التالف للفحص الجنائي | محجوبة حاسماً (`quarantine_active`) |

### 10.2 جدول نوافذ الانهيار والنتائج الآمنة الحتمية (Crash Windows & Deterministic Safe Outcomes)
| لحظة وقوع الانهيار / إغلاق المتصفح | الحالة المتينة في IndexedDB | حالة LocalStorage المتبقية | السلوك الحتمي عند إعادة فتح المتصفح والتشغيل |
| :--- | :--- | :--- | :--- |
| **أثناء التقاط لقطة الحواشي (قبل الحفظ)** | لا يوجد سجل | تم مسح الحاجز بأمان (أو عقد إيجار منتهٍ) | لا يتم تعديل أي بيانات؛ مساحة العمل الأصلية سليمة 100%. |
| **أثناء مرحلة `APPLY_IDB`** | سجل بحالة `APPLY_IDB` | مؤشر `APPLY_IDB` وحاجز نشط | تراجع تلقائي: حذف الحواشي المستوردة واستعادة حواشي المستخدم الأصلية. |
| **أثناء مرحلة `APPLY_LOCALSTORAGE`** | سجل بحالة `APPLY_LOCALSTORAGE` | مؤشر وحاجز نشط | تراجع تلقائي: استعادة مفاتيح LocalStorage الـ17 الأصلية وحواشي IDB. |
| **أثناء كتابة `COMMITTED` إلى IDB** | سجل بحالة `APPLY_LOCALSTORAGE` | مؤشر `APPLY_LOCALSTORAGE` | التراجع التلقائي لأن الالتزام لم يُثبت متانةً في المخزن. |
| **بعد تأكيد كتابة `COMMITTED` وقبل `FINALIZE`** | سجل متين بحالة `COMMITTED` | مؤشر `COMMITTED` وحاجز | إتمام المعاملة بنجاح: تثبيت البيانات وتنظيف السجل والمؤشر والحاجز. |
| **بعد حذف سجل IDB وقبل حذف مؤشر LocalStorage** | السجل محذوف من IDB | مؤشر يحمل `phase: 'FINALIZE'` | التعافي يكتشف مرحلة `FINALIZE` ويقوم بحذف المؤشر والحاجز دون حجر زائف. |
| **ترك حاجز LocalStorage مهجوراً بعد انهيار مفاجئ** | السجل والمؤشر محذوفان | حاجز بختم زمني قديم (>60 ثانية) | إلغاء الحاجز تلقائياً واعتباره منتهي الصلاحية مع تحرير الأقفال بأمان. |
| **فشل التراجع بسبب خطأ فادح في التخزين** | سجل `ROLLBACK_FAILED_QUARANTINE` | مؤشر وحاجز حجر نشط | فرض الحجر الصحي الدائم وتجميد المزامنة وحماية بيانات المستخدم. |

### 10.3 لقطة الحواشي المغلقة عند الفشل (Fail-Closed Annotation Snapshot — CF3)
- قراءة كاملة لخرائط حواشي الحساب النشط عبر `getAllAnnotationsMapFromDB`.
- التحقق الإلزامي من نجاح القراءة (`currentAnnosRes.ok === true`).
- فحص ملكية السجلات والتحقق من تطابق بادئة المعرف مع الحساب النشط (`CROSS_ACCOUNT_RECORD_DETECTED`).
- التحقق من سياق الحساب قبل وبعد القراءة؛ في حال فشل أي فحص، يتم إلغاء العملية فوراً وتنظيف الحاجز دون كتابة سجل `PREPARE` ودون لمس مساحة العمل.

### 10.4 الجرد الشامل واستعادة مفاتيح LocalStorage الـ17 (Complete LocalStorage Inventory — CF4)
تم حصر وتجميد واستعادة كافة المفاتيح السبعة عشر (17 مفتاحاً) التي تؤثر عليها عملية الاستيراد:
1. `pharmaSubjectsV4`
2. `pharmaScheduleV4`
3. `pharmaLogsV4`
4. `pharmaWeeklyReportsV1`
5. `pharmaScheduleBacklogV1`
6. `pharmaAcademyProgressV1`
7. `pharmaCloudMediaRegistryV1`
8. `pharmaPlannerPrefsV1`
9. `pharmaPdfFitMode`
10. `pharmaWorkspaceDirty`
11. `pharmaWorkspaceDirty_<uid>`
12. `pharmaWorkspaceRevision_<uid>`
13. `pharmaWorkspaceUpdatedAt`
14. `pharmaAccountWorkspace_<uid>`
15. `pharmaTombstones_<uid>`
16. `pharmaConflictRecovery_<uid>`
17. `pharmaDeviceRegistry_<uid>`
- **ضمان الاستعادة التامة:** أي مفتاح لم يكن موجوداً قبل الاستيراد يتم حذفه قطيعاً (`localStorage.removeItem`)، والمفاتيح التي كانت موجودة تُعاد قيمتها السابقة حرفياً كما هي (Bit-for-bit Equality).
- **حماية واجهة المستخدم:** دوال تحديث الواجهة داخل `rollbackImportFromJournal` مغلفة بـ `try/catch` حتى لا تؤدي أي أخطاء في العرض إلى إفشال استعادة البيانات أو فرض حجر صحي زائف.

### 10.5 حماية النسخ القديمة وتعطيل نمط الاستبدال (Legacy Replace Protection — CF5)
- عند فحص نسخة احتياطية قديمة (v1-v3) لا تتضمن نطاق `annotations`:
  - يتم تعطيل زر الاستبدال في نافذة المعاينة (`canReplace = false`).
  - يتم تمييز النسخة بشارة تحذير صفراء واضحة في واجهة المعاينة.
  - إذا تم استدعاء دالة الاستيراد برمجياً بنمط `replace`، يتم رفض الطلب فوراً برمز `REPLACE_MODE_DISALLOWED`.
  - نمط الدمج (`merge`) يظل متاحاً ويدمج المواد والجدول مع الحفاظ التام على الحواشي القائمة.

### 10.6 أقفال التزامن وبوابات الأمان الصارمة (Concurrency Locks & Barrier Enforcement — CF6, CF7)
- استخدام `navigator.locks.request('exo_import_lock_' + uid)` لتنسيق عمليات الاستيراد بين التبويبات مع حاجز LocalStorage مدعوم بمهلة زمنية (60 ثانية).
- حظر عمليات الحفظ المحلية الروتينية (`saveSubjects`, `saveScheduleData`, `saveLogs`) أثناء وجود حاجز استيراد نشط.
- إعادة جدولة حفظ الحواشي المعلقة تلقائياً عند اعتراضها بواسطة الحاجز.
- إغلاق بوابات المزامنة السحابية فلكياً (Fail-Closed) عند وجود حاجز استيراد أو حجر نشط.

### 10.7 بروتوكول الحجر الصحي المتين (Durable Quarantine Protocol — CF8)
- كتابة مرحلة `ROLLBACK_FAILED_QUARANTINE` مباشرة إلى `annotation_recovery_vault` وانتظار اكتمال المعاملة (`await tx.oncomplete`) قبل كتابة مؤشر LocalStorage.

### 10.8 التحقق الميداني في المتصفح الحقيقي عبر إعادة التشغيل والانهيار (Real Browser Restart Tests — CF9)
تم تنفيذ واجتياز ستة سيناريوهات حقيقية متقدمة في متصفح Chromium E2E (Scenarios Z.1 إلى Z.6) عبر إغلاق الصفحة وفتح صفحات جديدة وتكرار بدء التشغيل:
- **Test Z.1:** انقطاع في مرحلة `APPLY_IDB` -> إغلاق الصفحة -> فتح صفحة جديدة -> تعافٍ تلقائي ناجح وتراجع تام واستعادة البيانات السابقة وتنظيف السجل.
- **Test Z.2:** انقطاع في مرحلة `COMMITTED` -> إغلاق الصفحة -> فتح صفحة جديدة -> تثبيت تلقائي للبيانات وتنظيف السجل بنجاح.
- **Test Z.3:** انهيار أثناء `FINALIZE` (السجل محذوف من IDB والمؤشر موجود) -> فتح صفحة جديدة -> تنظيف المؤشر والحاجز دون حجر زائف.
- **Test Z.4:** انهيار أثناء `FINALIZE` (حاجز مهجور) -> تنظيف الحاجز بأمان دون حجر.
- **Test Z.5:** حجر صحي متين في مخزن IDB -> إعادة تحميل المتصفح -> حجب المزامنة السحابية (Push & Pull) بشكل قاطع.
- **Test Z.6:** تنافس بين تبويبين حقيقيين في Chromium -> التبويب الأول يحجز القفل للمستخدم A، التبويب الثاني يُحجب للمستخدم A برمز `import_in_progress` وينجح للمستخدم B دون تداخل.

### 10.9 قياس الأداء الحقيقي في متصفح Chromium مقابل اختبارات Node الميكروية (CF10)
تم التمييز الصريح بين اختبارات Node.js الميكروية المجردة وبين الأداء الحقيقي داخل متصفح Chromium:
- **أداة قياس المتصفح الحقيقي:** `benchmark_chromium_tier_a.js` تشغل متصفح Chromium v155.0.8059.12 وتقيس مساحات عمل أكاديمية متكاملة تتضمن آلاف المحاضرات وسجلات المذاكرة والحواشي.

#### جدول قياسات الأداء الميداني في Chromium v155 (Real Headless Chromium):
| الفئة والحجم | الحجم الفعلي للبايتات | عدد المحاضرات | تحليل JSON | التسلسل المعياري | حساب SHA-256 | الفحص المسبق | الاستعادة المتينة والالتزام | النتيجة |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1 MB** | 1,061,048 بايت (~1.01 MB) | 52 محاضرة | 22.1 ms | 121.5 ms | 28.3 ms | 219.6 ms | 548.5 ms | **اجتاز (PASS)** |
| **5 MB** | 5,246,903 بايت (~5.00 MB) | 258 محاضرة | 40.8 ms | 308.2 ms | 121.3 ms | 876.8 ms | 1,574.9 ms | **اجتاز (PASS)** |
| **15 MB** | 15,730,909 بايت (~15.00 MB) | 774 محاضرة | 254.4 ms | 653.7 ms | 312.6 ms | 2,051.4 ms | 5,624.4 ms | **اجتاز (PASS)** |
| **25 MB** | 26,227,106 بايت (~25.01 MB) | 1,291 محاضرة | 446.5 ms | 1,081.2 ms | 547.5 ms | 3,555.0 ms | 8,291.4 ms | **اجتاز (PASS)** |
| **50 MB (الحد الأقصى)** | 50,870,250 بايت (~48.51 MB) | 2,505 محاضرات | 733.5 ms | 1,942.4 ms | 974.7 ms | 8,542.5 ms | 15,912.5 ms | **اجتاز (PASS)** |

- **الحد الأقصى العملي الآمن المثبت:** 50 ميجابايت (48.51 ميجابايت فعلية مع 2,505 محاضرات و50,000 نقطة بيانات). أي ملف يتجاوز 50 ميجابايت (`52,428,800 bytes`) بدقة يُرفض حاسماً قبل المعالجة برمز `FILE_TOO_LARGE`.

---

## 11. الملحق التصحيحي النهائي لـ M6 (Targeted Corrective Pass)

تم تنفيذ وإغلاق كافة المتطلبات التصحيحية الحرجة المتبقية وفق أعلى المعايير الهندسية:

### 11.1 ترتيب إتمام التراجع ومنع الحجر الزائف (Rollback Completion Ordering — Critical Fix B)
- **المشكلة السابقة:** كانت الدالة `rollbackImportFromJournal()` تكتب حالة `ROLLED_BACK` في سجل IDB، بينما تحديث مؤشر LocalStorage كان مغلفاً بـ catch صامت، ثم يُحذف السجل بعد ذلك. عند فشل تحديث المؤشر، يُحذف السجل بينما يبقى المؤشر القديم بحالة `APPLY_IDB` أو `APPLY_LOCALSTORAGE`، فيكتشف التعافي مؤشراً بلا سجل ويفرض حجراً صحياً زائفاً على حساب اكتمل تراجعه فعلياً.
- **المعمارية المعتمدة والتنفيذ:**
  1. أصبحت كتابة مؤشر `ROLLED_BACK` في LocalStorage خطوة إلزامية مدققة ومتحققاً منها (`pointerPersisted = true`) قبل الشروع في حذف السجل.
  2. في حال فشل تحديث مؤشر LocalStorage (مثل QuotaExceededError أو خطأ محقون): يتم الاحتفاظ التام بالسجل المتين بحالة `ROLLED_BACK` في `annotation_recovery_vault` وبحاجز الاستيراد، ولا يُحذف السجل إطلاقاً لكونه الدليل المتبقي الوحيد على التعافي، مع إرجاع كائن `{ ok: true, rolledBack: true, pointerPending: true, retainedJournal: true }` دون حجر الحساب.
  3. دالة التعافي التلقائي `recoverPendingImportJournalIfNeeded` أصبحت تتعرف على سجل `ROLLED_BACK` المحتفظ به في المخزن وتستكمل تنظيف المؤشر والحاجز والسجل بسلاسة متكررة ومحايدة (Idempotent).
  4. تمت إضافة خطافات حقن أخطاء صريحة وموثوقة:
     - `failRollbackPointerWrite`: لمحاكاة فشل كتابة مؤشر التراجع.
     - `crashAfterRolledBackJournal`: لمحاكاة الانهيار بعد كتابة سجل `ROLLED_BACK` في المخزن وقبل المؤشر.
     - `crashAfterRolledBackPointer`: لمحاكاة الانهيار بعد كتابة المؤشر وقبل حذف السجل.
     - `failRollbackJournalDelete`: لمحاكاة فشل حذف السجل بعد التراجع.
     - `crashDuringRollbackCleanup`: لمحاكاة الانهيار بعد حذف السجل وقبل تنظيف المؤشر والحاجز.
     - `crashBeforeRollbackBarrierCleanup`: لمحاكاة الانهيار أثناء تنظيف الحاجز.

### 11.2 طابور الحواشي المتين والآمن عبر التبويبات المتعددة (Durable Cross-Tab Queued Annotations — Critical Fix C)
- **المشكلة السابقة:** كان الطابور يعتمد فقط على خريطة في الذاكرة `queuedAnnotationWritesDuringImportByAccount` خاصة بالتبويب الذي استقبل التعديل، مما يعرض التعديل للضياع التام إذا قام تبويب آخر بالاستيراد أو أُغلق التبويب أو تم تبديل الحساب.
- **المعمارية المعتمدة والتنفيذ:**
  1. تم بناء طابور متين ثلاثي المستويات (`recordQueuedAnnotationWriteDurably`):
     - المستوى 1: خريطة الذاكرة المحلية الفورية.
     - المستوى 2: التخزين المحلي `pharmaImportQueuedAnnos_<uid>` المتاح لحظياً ومتزامناً لكافة التبويبات المفتوحة لنفس النطاق.
     - المستوى 3: مخزن IndexedDB المتين `annotation_recovery_vault` تحت المفتاح المحمي `usr_<sanitizedUid>::__import_queued_annos_v1__` للبقاء الدائم حتى بعد إعادة تشغيل المتصفح أو انهياره.
  2. دالة `saveAnnotationsToDB` لا ترجع `{ queued: true }` إلا بعد تسجيل التعديل متانةً.
  3. دالة تصريف الطابور `applyQueuedAnnotationWritesAfterImport(uid, mode)` تستدعى تلقائياً فور وصول المعاملة إلى حالتها النهائية (سواء نجاح الالتزام النهائي `FINALIZE` أو اكتمال التراجع `ROLLED_BACK` أو عبر `recoverPendingImportJournalIfNeeded`)، وتقوم بدمج الضربات الخطية مباشرة في مخزن `annotations` في IndexedDB مع فرض الملكية المزدوجة الصارمة `usr_<uid>::<lecId>` و`userId === uid`، وتحديث الذاكرة إذا كان المستخدم هو النشط حالياً.
  4. عند تبديل الحساب `handleAuthSessionChange`، لا يتم إتلاف طابور الحساب السابق، بل يتم الاحتفاظ به متانةً وتصريفه فور إعادة تنشيط حسابه.
  5. دمج وتصريف الطابور يعمل بكفاءة وأمان في نمطي الاستبدال (`replace`) والدمج (`merge`).

### 11.3 إغلاق ثغرات حيوية الحاجز ومنع فقدان تعديلات النطاق (Barrier Liveness & Zero Mutation Loss)
1. **التحقق من ملكية القفل بدل الاعتماد على انقضاء 30 ثانية مجردة:**
   - تم تعديل `isImportInProgressOrQuarantined()` و`recoverPendingImportJournalIfNeeded()` بحيث لا يتم مسح الحاجز لمجرد مرور 30 ثانية إذا كان هناك مؤشر معاملة نشط أو سجل في المخزن أو قفل نشط محجوز عبر `navigator.locks.query` أو مخزن القفل في IndexedDB.
   - يتم الإغلاق الحاسم (Fail Closed) عندما يتعذر إثبات هجر العملية، وتظل عمليات الحسابات الأخرى (User B) معزولة تماماً وتعمل باستقلالية تامة أثناء استيراد User A.
2. **منع فقدان تعديلات المواد والجدول والسجلات أثناء الحاجز:**
   - تم تدقيق `saveSubjects()` و`saveScheduleData()` و`saveLogs()`: عند وجود حاجز استيراد نشط، لا يتم إسقاط التعديلات أو إرجاع خطأ صامت، بل يتم طابرتها بأمان في الذاكرة وفي LocalStorage (`pharmaPendingDomainWrites_<uid>`) مع إرجاع `{ ok: true, queued: true, reason: 'import_in_progress' }`.
   - فور تحرير الحاجز، تقوم الدالة `flushQueuedDomainWritesAfterImport(uid)` بتطبيق كافة التعديلات المؤجلة تلقائياً.

---

## 12. مصفوفة التحقق والاختبارات الفعلية (Actual Test Execution Matrix)

تم تشغيل كافة أجنحة الاختبارات محلياً وإثبات اجتيازها بنسبة 100% دون أي أخطاء أو تحذيرات مهملة:

| أمر الاختبار | البيئة ونطاق الفحص | عدد الفحوصات الفعلي | النتيجة |
| :--- | :--- | :--- | :--- |
| `npm run lint` | Node.js syntax & static analysis لجميع ملفات السيرفر والاختبارات | 7 ملفات رئيسية | **اجتاز (PASS — 0 Errors)** |
| `npm run build` | بناء أصول الإنتاج وتوليد مجلد `dist/` | Build assets | **اجتاز (PASS)** |
| `npm run test:static` | أجنحة التشفير PBKDF2 وثوابت الأمان والـ RLS وsw.js | 54 فحصاً | **54/54 اجتاز (100%)** |
| `npm run test:unit` | اختبارات الانحدار الشاملة للمراحل 4 و4.1 و5.1 (M6, CFB, CFC, CFD) | 187 فحصاً | **187/187 اجتاز (100%)** |
| `npm run test:pglite` | توافق PostgreSQL المدمج وRLS المزدوج والـ OCC وقفل التزامن | 41 فحصاً | **41/41 اجتاز (100%)** |
| `npm run test:e2e` | اختبارات المتصفح الحقيقي Chromium E2E (السيناريوهات A - V, Z, AA 1-14, BB 1-5) | 106 فحوصات | **106/106 اجتاز (100%)** |
| **المجموع الكلي** | **كافة أجنحة الفحص والتحقق المتكاملة لمشروع Exo** | **388 فحصاً** | **388/388 اجتاز (100%)** |

### تفصيل فحوصات Chromium E2E المضافة والمحدثة:
- **Test AA (14 سيناريو انهيار وإعادة تشغيل متصفح حقيقي):**
  - AA.1: انهيار بعد `PREPARE` -> استعادة الحالة السابقة بنجاح.
  - AA.2: انهيار بعد `APPLY_IDB` -> تراجع تلقائي واستعادة الحالة الأصلية.
  - AA.3: انهيار بعد `APPLY_LOCALSTORAGE` -> تراجع تلقائي واستعادة كافة مفاتيح LS والحواشي.
  - AA.4: انهيار بعد `COMMITTED` -> إتمام المعاملة وتثبيت البيانات المستوردة.
  - AA.5: انهيار بعد كتابة مؤشر `FINALIZE` -> استكمال التنظيف دون حجر زائف.
  - AA.6: انهيار بعد حذف السجل في `FINALIZE` -> تنظيف المؤشر والحاجز.
  - AA.7: انهيار قبل تنظيف المؤشر -> تنظيف سليم عند بدء التشغيل.
  - AA.8: انهيار قبل تنظيف الحاجز -> تنظيف الحاجز فور التأكد من غياب القفل النشط.
  - AA.9: انهيار أثناء التراجع في مرحلة الاستعادة -> تنظيف وتعافٍ سليم.
  - AA.10: انهيار أثناء تنظيف التراجع -> إتمام تنظيف التراجع.
  - AA.11: فشل كتابة مؤشر `ROLLED_BACK` -> الاحتفاظ بالسجل المتين في المخزن والتعافي النظيف دونه فرض حجر زائف.
  - AA.12: انهيار بعد كتابة سجل `ROLLED_BACK` في المخزن وقبل المؤشر -> تعافٍ تلقائي واستعادة دقيقة.
  - AA.13: انهيار بعد كتابة مؤشر `ROLLED_BACK` وقبل حذف السجل -> تعافٍ متكرر محايد وتنظيف شامل.
  - AA.14: انهيار أثناء تنظيف حاجز التراجع -> تنظيف الحاجز واستعادة خط الأساس التام.
- **Test BB (5 فحوصات تنافس بين تبويبين وطابور الحواشي المتين):**
  - BB.1: حجب استيراد التبويب 2 للمستخدم A بواسطة قفل التبويب 1 النشط.
  - BB.2: طابرة تعديل الحواشي في التبويب 2 للمستخدم A بأمان ومتانة أثناء حاجز الاستيراد مع `{ queued: true }`.
  - BB.3: تبديل التبويب 2 للمستخدم B وتشغيل استيراد مستقل ينجح تزامناً دون أي تداخل في الأقفال أو البيانات.
  - BB.4: إتمام التبويب 1 لاستيراد المستخدم A وإثبات تصريف الحواشي المطابرة من التبويب 2 مباشرة إلى مخزن IndexedDB الخاص بالمستخدم A مع الملكية الصارمة والمحتوى الدقيق (`userId === uidCompA`).
  - BB.5: إغلاق التبويبات وفتح صفحة جديدة، وإثبات بقاء الحواشي المطابرة مستقرة ومحفوظة، وبقاء المستخدم B معزولاً تماماً ومحمياً من أي تسريب.

---

## 13. التوافق والقيود المتبقية (Compatibility & Constraints)

1. **سلامة الحسابات والبيانات:**
   - لم يتم إجراء أي مساس بـ M5-A أو M5-B؛ كلاهما مجمد ومحمي بنسبة 100%.
   - لا توجد أي migrations جديدة لقاعدة البيانات، ولا تعديل على مخطط Supabase، ولا DDL/DML على خوادم الإنتاج.
   - ميزات Free (تصدير PDF بالحواشي، أوراق الملاحظات الإضافية المتعددة، النسخ الاحتياطي والاستعادة Tier A) مجانية بالكامل ومتاحة للجميع دون اشتراط VIP.
   - سياسة استحقاق VIP مقصورة على رفع الوسائط السحابية إلى Google Drive عبر عمود `can_upload_media` دون تغيير.
2. **حدود البيئة والتسليم:**
   - التغييرات جاهزة ومختبرة محلياً بالكامل ومحفوظة في مساحة العمل للمراجعة.
   - لا يتم إجراء أي commit أو push أو force-push أو إنشاء فروع، التزاماً تاماً بعقد `GEMINI.md` واحتفاظ المالك بالتحكم المطلق في المستودع.

---

## 14. التمريرة التصحيحية النهائية لإغلاق M6 (M6 Final Corrective Pass — Acceptance Closure)

تم تنفيذ وإغلاق الأولويات الهندسية الست (Priorities A - F) بصورة شاملة دون أي تنازلات أو تجاوز لحدود المشروع، مع اجتياز كامل لكافة الاختبارات المحلية (510/510 بنسبة 100%):

### 14.1 الأولوية A: عزل حسابات طابور النطاق الأكاديمي (Domain Queue Account Isolation)
- **المشكلة السابقة:** كانت الدالة `flushQueuedDomainWritesAfterImport(uid)` تكتب التعديلات المؤجلة مباشرة إلى مفاتيح LocalStorage العامة المشتركة (`pharmaSubjectsV4`, `pharmaScheduleV4`, `pharmaPlannerPrefsV1`, `pharmaLogsV4`) حتى لو كان الحساب النشط في التبويب الحالي مختلفاً عن صاحب التعديل (`uid !== curUid`).
- **المعمارية المعتمدة والتنفيذ:**
  1. التحقق الصارم من ملكية الحمولة: التحقق الإلزامي من أن `payload.userId === uid`.
  2. في حالة الحساب غير النشط (`curUid !== uid`):
     - حظر قطعي للمساس بالمتغيرات العامة في الذاكرة أو بمفاتيح LocalStorage العامة المشتركة.
     - حفظ التعديلات المؤجلة حصرياً داخل مساحة عمل الحساب المعزولة `pharmaAccountWorkspace_${uid}`.
     - وضع علامة الاتساخ الخاصة بالحساب المعزول `pharmaWorkspaceDirty_${uid} = '1'`.
     - الاحتفاظ التام بسجل الطابور `pharmaPendingDomainWrites_${uid}` في LocalStorage وفي الذاكرة لحين قيام المستخدم بالتبديل إلى ذلك الحساب لاحقاً.
  3. في حالة الحساب النشط (`curUid === uid`):
     - تطبيق التعديلات على المتغيرات المحلية بالذاكرة ومفاتيح LocalStorage العامة.
     - تعيين علامات الاتساخ `pharmaWorkspaceDirty = '1'` و`pharmaWorkspaceDirty_${uid} = '1'`.
     - تحديث واجهات المستخدم (الجداول، المواد، السجلات) ومسح سجل الطابور بأمان.
- **التغطية الاختبارية:** 12 فحص انحدار مخصص (Priority A.1 إلى A.12) في `test_phase4_regressions.js` تجتاز بنسبة 100%.

### 14.2 الأولوية B: فرض رمز السياج الذري في مخزن IndexedDB (Complete Fencing Token Enforcement)
- **المشكلة السابقة:** كان التحقق من رمز السياج `fencingToken` في قفل IndexedDB البديل يتم عبر معاملة قراءة منفصلة قبل `persistPhase()`, مما أتاح نافذة زمنية لسباق التحقق والاستخدام (TOCTOU race) بين التحقق والكتابة.
- **المعمارية المعتمدة والتنفيذ:**
  1. إقران التحقق من رمز السياج ذرياً داخل نفس معاملة الكتابة (Atomic Coupling inside Readwrite Transactions):
     - داخل `persistPhase()`: التحقق من القفل وقيمة `fencingToken` داخل نفس معاملة `readwrite` على `annotation_recovery_vault`. في حال عدم التطابق أو فقدان الملكية، يتم إجهاض المعاملة فوراً عبر `tx.abort()` ورفض الوعد برمز `STALE_FENCING_TOKEN`.
     - داخل `APPLY_IDB`: استخدام معاملة متعددة المخازن ذرية تشمل `['annotations', 'annotation_recovery_vault']`. يتم التحقق من القفل ورمز السياج من مخزن `annotation_recovery_vault` داخل نفس المعاملة قبل إجراء أي كتابة على `annotations`، مع الإجهاض الفوري في حال التجاوز.
     - داخل مرحلة الحذف والنهائية (`FINALIZE`): التحقق الذري داخل معاملة حذف السجل.
     - داخل التراجع الطارئ (`rollbackImportFromJournal`): التحقق الذري داخل كافة المعاملات المتأثرة.
  2. انتظار اكتمال معاملة تحرير القفل (`tx.oncomplete`) في كتلة `finally` لـ `runWithImportLock` قبل عودة التحكم للمستدعي.
  3. تنظيف الحاجز في `finally` في حال فشل أو إجهاض المعاملة قبل الوصول لمرحلة السجل المتين (`PREPARE`).
- **التغطية الاختبارية:** الفحوصات B.1 وB.2 تجتاز بنسبة 100%.

### 14.3 الأولوية C: الاعتراف الصارم بفشل طابور الحواشي (Annotation Queue Failure Acknowledgement)
- **المشكلة السابقة:** كانت الدالة `recordQueuedAnnotationWriteDurably(uid, item)` تضيف العنصر إلى خريطة الذاكرة `queuedAnnotationWritesDuringImportByAccount`، ثم في حال فشل التخزين المتين أو تفعيل خطاف الاختبار `failAnnotationQueuePersist` ترجع `false` دون مسح العنصر من الذاكرة، مما يعرض المستدعي لاستلام تأكيد زائف `queued: true`.
- **المعمارية المعتمدة والتنفيذ:**
  1. كتابة فورية ومتزامنة في التخزين المحلي `LocalStorage` لضمان الانتقال الفوري بين التبويبات.
  2. عند فشل التخزين في مخزني IndexedDB وLocalStorage معاً، أو عند اعتراض خطاف الاختبار: يتم استئصال العنصر فوراً من خريطة الذاكرة `queuedAnnotationWritesDuringImportByAccount`.
  3. دالة `saveAnnotationsToDB` لا ترجع إطلاقاً `queued: true` في حال فشل المتانة، بل ترجع حتماً `{ ok: false, queued: false, reason: 'queue_storage_failed' }`.
- **التغطية الاختبارية:** الفحوصات C.1 إلى C.5 تجتاز بنسبة 100%.

### 14.4 الأولوية D: إدراك نتائج تصريف الطابور وإلغاء الضربات المكررة (Result-Aware Queue Drain & Stroke Deduplication)
- **المشكلة السابقة:** كانت دالة تصريف الطابور لا ترجع كائناً هيكلياً واضحاً، ولم تكن تحتوي على آلية لإلغاء تكرار الضربات (Deduplication) عند إعادة التسليم، وكانت تنظف السجلات دون ضمان إتمام المعاملة.
- **المعمارية المعتمدة والتنفيذ:**
  1. إرجاع نتيجة هيكلية صريحة: `{ ok: true, count }` عند النجاح، أو `{ ok: false, reason, error }` عند الفشل.
  2. خوارزمية ذكية لمنع الضربات المكررة `getStrokeDedupeKey`: تفحص معرف الضربة الصريح (`id` أو `strokeId`) أو التسلسل الهندسي المعياري للضربة (`JSON.stringify(s)`).
  3. تنفيذ كتابة الحواشي وحذف سجلات الطابور من `annotation_recovery_vault` داخل نفس المعاملة متعددة المخازن الذرية (`['annotations', 'annotation_recovery_vault']`).
  4. عدم مسح سجلات LocalStorage أو خريطة الذاكرة إلا بعد التحقق القطعي من التزام المعاملة بنجاح (`tx.oncomplete`).
  5. فحص نتيجة التصريف في `executeImportTransactionInternal` و`recoverPendingImportJournalIfNeeded` قبل تحرير حاجز الاستيراد؛ وفي حال تعثر التصريف، يتم الإبقاء على الحاجز لحماية البيانات وتمكين التعافي.
- **التغطية الاختبارية:** الفحوصات D.1 إلى D.5 تجتاز بنسبة 100%.

### 14.5 الأولوية E: التعافي المغلق عند الفشل في استعلام الأقفال (Fail-Closed Barrier Recovery on Query Errors)
- **المشكلة السابقة:** كانت أخطاء استعلام أقفال المتصفح أو أقفال IndexedDB تؤدي إلى مسح الحاجز بالخطأ. بالإضافة لوجود خطأ تهيئة مسبقة (TDZ ReferenceError) لمتغير `testHooks`.
- **المعمارية المعتمدة والتنفيذ:**
  1. نقل تعريف `const testHooks` إلى أعلى سطر في الدالة `recoverPendingImportJournalIfNeeded` لمنع أي خطأ TDZ.
  2. تغليف استعلامات `navigator.locks.query()` واستعلامات مخزن أقفال IndexedDB بـ `try/catch` صارم؛ وعند حدوث أي استثناء أو خطأ في القراءة، يتم الفشل المغلق فوراً بافتراض وجود قفل نشط (`hasLiveLock = true`) والاحتفاظ الصارم بالحاجز.
  3. تصريف طوابير الحواشي والنطاقات قبل فك الحاجز في كافة مسارات التعافي المعتمدة (COMMITTED, ROLLED_BACK, المهجورة المؤكدة).
- **التغطية الاختبارية:** الفحوصات E.1 إلى E.3 تجتاز بنسبة 100%.

### 14.6 الأولوية F: تنظيف ملفات التجريب القديمة (Legacy Debug Files Cleanup)
- تم الحذف الفعلي والنهائي لكافة ملفات التجريب الثمانية (8 ملفات) من جذر المستودع عبر أداة `delete_file`:
  1. `/_debug_c1c.js`
  2. `/_debug_c1c2.js`
  3. `/_debug_c1c3.js`
  4. `/_debug_c1c4.js`
  5. `/_debug_c1c5.js`
  6. `/_debug_c1c6.js`
  7. `/_debug_test.js`
  8. `/_debug_test2.js`

---

## 15. ملخص نتائج الاختبارات الشاملة المعتمدة محلياً (Comprehensive Verification Summary)

تم تشغيل والتحقق من كافة الفحوصات والأجنحة بنسبة نجاح 100% دون أي استثناء:

| أمر ومسار الاختبار | البيئة ونطاق الفحص | عدد الفحوصات | النتيجة الفعلية |
| :--- | :--- | :--- | :--- |
| `npm run lint` | التحليل الاستاتيكي وفحص صياغة ملفات Node.js | 8 ملفات | **اجتاز (PASS — 0 Errors)** |
| `npm run test:static` | فحوصات التشفير PBKDF2 وثوابت الأمان وsw.js | 54 فحصاً | **54/54 اجتاز (100%)** |
| `node test_phase3_cross_account_isolation.js` | عزل الحسابات والمخازن التحتية | 52 فحصاً | **52/52 اجتاز (100%)** |
| `node run_comprehensive_verification.js` | التحقق الشامل من المنطق الأكاديمي | 42 فحصاً | **42/42 اجتاز (100%)** |
| `npm run test:pglite` | توافق PostgreSQL المدمج وRLS المزدوج والـ OCC | 41 فحصاً | **41/41 اجتاز (100%)** |
| `node test_phase4_regressions.js` | انحدار الحواشي وعزل الطوابير وسيناريوهات M6 (Priorities A - E) | 215 فحصاً | **215/215 اجتاز (100%)** |
| `npm run test:e2e` | اختبارات متصفح Chromium E2E الحقيقية (السيناريوهات A - V, Z, AA, BB) | 106 فحوصات | **106/106 اجتاز (100%)** |
| **المجموع الكلي المدمج (`node run_all_tests.js`)** | **كافة اختبارات المنظومة المتكاملة محلياً** | **510 فحوصات** | **510/510 اجتاز (100%)** |

---

## 16. توثيق نقطة التفتيش النهائية لخط الأساس (M6 Stable Baseline Checkpoint Audit)

تم استكمال وتدقيق نقطة الأساس المستقرة النهائية لمرحلة M6 وفقاً للضوابط الهندسية وعقد العمل الدائم `GEMINI.md`:

### 16.1 سلامة بيئة المستودع والتبعيات (Repository Integrity & Dependency Alignment)
1. **استعادة ملف القفل الأصلي (`bun.lock`):** تمت استعادة ملف `bun.lock` بالكامل بايت-ببايت من خط الأساس المرجعي الأصلي للمستودع `study-hub.zip` لإلغاء الحذف التلقائي الذي أحدثته عملية هجرة البيئة الأولية.
2. **إزالة الملفات المولدة تلقائياً:** تم حذف الملف `.env.example` الذي أنشأته بيئة AI Studio تلقائياً، لضمان تطابق مساحة العمل مع خط الأساس المرجعي للمستودع.
3. **الاعتماديات والمعمارية:** لم يتم تعديل `package.json` أو ترقية إصدارات التبعيات، مع الحفاظ الكامل على المعمارية الحالية (تطبيق ويب ثابت عبر Express ودمج Supabase الحالي دون إنشاء Cloud SQL).

### 16.2 التدقيق المستقل وحلول الأولويات الهندسية (Independent Audit Resolutions)
- **الأولوية A (Domain Queue Account Isolation):** إزالة أي استدلال ضمني بـ `!subItem.userId` أو إعادة بناء البيانات من المتغيرات العامة (`subjects`, `scheduleEvents`, `scheduleBacklog`, `logs`). في الحسابات غير النشطة، تُكتب البيانات حصرياً داخل مساحة عمل الحساب المعزولة (`pharmaAccountWorkspace_<uid>`) مع التحقق من نجاح القراءة العكسية وعدم مسح طابور LocalStorage حتى يتم تنشيط الحساب.
- **الأولوية B (Fencing Token Enforcement):** فرض استدعاء `assertFencingTokenValid()` عند بداية مرحلة `APPLY_LOCALSTORAGE`. تمرير `fencingToken` و`passedTxId` لكافة استدعاءات `rollbackImportFromJournal` والتحقق الذري من القفل قبل إجراء أي تراجع. في `recoverPendingImportJournalIfNeeded`، يتم التحقق من وجود قفل نشط قبل التراجع لمنع إجهاض استيراد تبويب آخر نشط.
- **الأولوية C (Annotation Queue Durability & In-Batch Deduplication):** تجميع عناصر طابور الحواشي حسب المحاضرة (`itemsByLec`) وإلغاء تكرار الضربات الخطية داخل الدفعة الواحدة قبل المعاملة الذرية لمنع سباق `get`/`put` في IndexedDB. تنظيف المفاتيح المطبقة فقط (`appliedKeys`) من الذاكرة والتخزين المحلي دون حذف العناصر المضافة تزامناً من تبويبات أخرى.
- **الأولوية D (Result-Aware Barrier Safety):** التحقق المزدوج من نتيجة تفريغ طابور الحواشي وطابور النطاقات في خطوة الإنهاء (5c) والتراجع الطارئ ومسارات التعافي الأربعة عند بدء التشغيل. لا يتم فك الحاجز إلا بعد نجاح التصريف بنسبة 100%. في `isImportInProgressOrQuarantined`، يتم الاحتفاظ بالحاجز مغلقاً عند الفشل إذا كان مؤشر المعاملة موجوداً، مع السماح بتجاوز الحواجز المهجورة (>30 ثانية) بعد إثبات غياب المؤشر.
- **الأولوية E (E2E Test Environment Stabilization):** تصحيح احتساب أسبوع البداية في السيناريو `Test W` ليعتمد على الأسبوع الحالي ديناميكياً متوافقاً مع السيناريوهات `M.1` و`M.2`، مما يمنع انطلاق الترحيل الأسبوعي التلقائي السابق لأوانه عند إعادة تحميل المتصفح.

### 16.3 المصفوفة الشاملة للتحقق المحلي قبل مصادقة CI (Pre-CI Local Verification Matrix at Checkpoint `0841b76`)
- `npm run lint`: **PASSED** (0 Errors)
- `npm run build`: **PASSED** (Assets copied to `dist/`)
- `npm run test:static`: **54/54 PASSED** (100%)
- `node test_phase3_cross_account_isolation.js`: **52/52 PASSED** (100%)
- `node run_comprehensive_verification.js`: **42/42 PASSED** (100%)
- `node test_phase4_regressions.js`: **215/215 PASSED** (100% — ارتفعت لاحقاً إلى `232/232` في `94259b5` بعد إضافة الفحوصات F.1–I.3)
- `npm run test:pglite`: **41/41 PASSED** (100%)
- `npm run test:e2e` (`node test_phase4_1_chromium_e2e.js`): **106/106 PASSED** (100% — ارتفعت لاحقاً إلى `111/111` في `94259b5` بعد إضافة CC.1 وDD.1–DD.3 وEE.1)
- `test:pg16` (`test_phase4_2_1_pg16_concurrency.js`): **NOT VERIFIED LOCALLY** (يتطلب خادم PostgreSQL 16 خارجي في CI؛ تم التحقق منه رسمياً في CI Run #43 بنتيجة `96/96 PASSED`)
- **المجموع الإجمالي للفحوصات المنفذة محلياً عند نقطة الأساس `0841b76`:** **510/510 PASSED (100% Success)**.

---

## 17. مزامنة توثيق التحقق النهائي وأدلة GitHub Actions الرسمية (M6 Final Verification Documentation Synchronization — Commit `94259b5`)

تمت مزامنة هذا التقرير مع آخر HEAD معتمد للتحقق على الفرع `main` وسجل GitHub Actions الرسمي دون أي تعديل على الكود المصدري أو الاختبارات أو إعدادات الحزم:

### 17.1 بيانات الاعتماد المرجعية لـ GitHub Actions CI
- **المستودع:** `JemistryMC/study-hub`
- **الفرع:** `main`
- **آخر HEAD معتمد للتحقق (Commit SHA):** `94259b543a021d4f06fdc0a9aa44d3f346d63037`
- **رقم تشغيل CI الرسمي:** **CI Run #43**
- **معرف التشغيل (Run ID):** `43241683581`
- **النتيجة الإجمالية:** **SUCCESS (628/628 PASSED — 100%)**

### 17.2 جدول نتائج CI Run #43 (`43241683581`) على Commit `94259b543a021d4f06fdc0a9aa44d3f346d63037`

| جناح الاختبار (Test Suite) | النتيجة في CI Run #43 | التفاصيل والملاحظات |
| :--- | :--- | :--- |
| **Static Security** | **54/54 PASSED** | فحوصات التشفير PBKDF2 وثوابت الأمان وتجريد الأسرار و`sw.js`. |
| **Comprehensive Verification** | **42/42 PASSED** | التحقق الشامل من المنطق الأكاديمي والوظائف الأساسية. |
| **Cross-account Isolation** | **52/52 PASSED** | عزل الحسابات وسلامة مفاتيح وسجلات IndexedDB وLocalStorage. |
| **Phase 4 Regressions** | **232/232 PASSED** | شاملة كافة فحوصات M5-B وM6 والفحوصات التصحيحية النهائية (Priorities A–I). |
| **PGlite** | **41/41 PASSED** | توافق PostgreSQL المدمج وRLS المزدوج والـ OCC. |
| **PostgreSQL 16** | **96/96 PASSED** | اختبارات التكامل والتزامن الحقيقية على خادم PostgreSQL 16 في بيئة CI المعزولة. |
| **Real Chromium E2E** | **111/111 PASSED** | شاملة السيناريوهات الكاملة في متصفح Chromium الحقيقي بما فيها `CC.1` و`DD.1` و`DD.2` و`DD.3` و`EE.1`. |
| **Unified Test Runner** | **628/628 PASSED** | إجمالي الفحوصات المدمجة المنفذة في CI Run #43 بنسبة نجاح 100%. |

#### نتائج اختبارات Chromium E2E الجديدة المؤكدة في CI Run #43:
- `CC.1`: **PASS** (`Tab 2 is blocked by active IDB fallback lock held by Tab 1`)
- `DD.1`: **PASS** (`Tab 2 writes queued during active barrier`)
- `DD.2`: **PASS** (`Queued annotations drained cleanly with in-batch stroke deduplication in real Chromium`)
- `DD.3`: **PASS** (`Queued domain edits flushed cleanly into canonical state in real Chromium`)
- `EE.1`: **PASS** (`Chromium recovery fault injection hooks verify fail-closed barrier retention on query failures`)

### 17.3 توضيح دقيق بخصوص الأمر المستقل `npm run test:dd`
1. **في سجل GitHub Actions (CI Run #43 — Run ID `43241683581`):**
   - الأمر `npm run test:dd` (`node test_phase4_1_chromium_e2e.js --dd-only`) أُضيف كأمر مستقل في `package.json` لتسهيل الفحص المعزول لاختبار `Test DD`.
   - **لم يُشغّل CI Run #43 الأمر `npm run test:dd` كخطوة منفصلة ومستقلة**؛ بل شغّل مجموعة اختبارات Chromium E2E الكاملة (`111/111`) التي تضمنت الفحوصات `DD.1` و`DD.2` و`DD.3` ضمن المسار الكامل.
2. **التشغيل المحلي المباشر للأمر `npm run test:dd` (Local Standalone Execution):**
   - تم تشغيل الأمر `npm run test:dd` محلياً في بيئة العمل الحالية للتحقق المستقل من عمل المشغل المعزول `--dd-only`.
   - **الأمر المنفذ:** `npm run test:dd` (`node test_phase4_1_chromium_e2e.js --dd-only`)
   - **كود الخروج الفعلي (Exit Code):** `0`
   - **النتيجة الفعلية:** `TOTAL DD CHECKS: 3 | PASSED: 3 | FAILED: 0` (`ALL TEST DD CHECKS PASSED (100%).`)
   - **سجل المخرجات الفعلي (Actual Execution Logs):**
     ```text
     > exo-academic-platform@1.4.2-1 test:dd
     > node test_phase4_1_chromium_e2e.js --dd-only

     ======================================================================
     EXO PHASE 4.1: STANDALONE TEST DD (TWO-TAB CONCURRENT DRAIN & DEDUPE)
     ======================================================================

     --- [المرحلة 1] تشغيل الخادم والمتصفح وفتح التبويبين ---
     --- [المرحلة 2] بدء الاستيراد في التبويب 1 واحتجاز القفل الحي ---
     --- [المرحلة 3] كتابة تعديلات التبويب 2 أثناء نشاط الحاجز ---
     [Tab DD2] [DD3] قبل initPdfDB
     [Tab DD2] [DD3] بعد initPdfDB
     [Tab DD2] [DD3] قبل handleAuthSessionChange
     [Tab DD2] [DD3] بعد handleAuthSessionChange
     [Tab DD2] [DD3] قبل saveAnnotationsToDB الأول
     [Tab DD2] [DD3] بعد saveAnnotationsToDB الأول
     [Tab DD2] [DD3] قبل saveAnnotationsToDB الثاني
     [Tab DD2] [DD3] بعد saveAnnotationsToDB الثاني
     [Tab DD2] [DD3] قبل saveSubjects
     [Tab DD2] [DD3] بعد saveSubjects
     --- [المرحلة 4] تحرير قفل التبويب 1 واستكمال الاستيراد وتفريغ الطوابير ---
     --- [المرحلة 5] التحقق من صحة النتائج ---
       [PASS] Test DD.1: Tab 2 writes queued during active barrier
       [PASS] Test DD.2: Queued annotations drained cleanly with in-batch stroke deduplication in real Chromium
       [PASS] Test DD.3: Queued domain edits flushed cleanly into canonical state in real Chromium
     جاري إغلاق التبويبين والمتصفح ومسح الموارد...
     تم إغلاق الموارد بنجاح.

     ======================================================================
     TOTAL DD CHECKS: 3 | PASSED: 3 | FAILED: 0
     ======================================================================

     ALL TEST DD CHECKS PASSED (100%).
     ```

### 17.4 حالة المرحلة والقرار النهائي عند Commit `94259b5` (Phase Status & Governance Gate)
- **الحالة الهندسية لخط الأساس `94259b5`:** `CI VERIFIED` (بموجب نجاح CI Run #43 برقم `43241683581` على Commit `94259b543a021d4f06fdc0a9aa44d3f346d63037` بنتيجة `628/628`، واجتياز `npm run test:dd` محلياً بنتيجة `3/3` وExit Code `0`).
- **حالة الاعتماد الرسمي (`APPROVED`):** **غير معلنة من قِبل Gemini (Pending Owner Decision)**؛ وفقاً للبند 10 من عقد العمل الهندسي الدائم `GEMINI.md`، فإن `CI VERIFIED` لا يساوي `APPROVED` تلقائياً، وقرار إعلان `APPROVED` النهائي لمرحلة M6 حصري للمالك بعد مراجعته المستقلة.

---

## 18. معالجة سلامة البيانات واستمرارية الحفظ (M6 P0 Data Integrity Remediation — Phase A)

بناءً على التدقيق الجنائي المعتمد لأعطال حفظ البيانات (`P0`) والأداء (`P1`)، وبموجب تفويض المالك لتنفيذ **Phase A: P0 Data Safety and Persistence only** فوق خط الأساس المصدري `94259b543a021d4f06fdc0a9aa44d3f346d63037` (وآخر HEAD توثيقي `b66d72e359e7d2e8531f88f797d4d296d41206a3`)، تم تنفيذ وإغلاق البنود الستة الحرجة (`P0-1` إلى `P0-6`) دون خلط أي تعديلات أداء من Phase B:

### 18.1 ربط الأسباب الجذرية بالإصلاحات الهندسية المنفذة (Root-Cause → Fix Mapping)

| المعرف | المشكلة والسبب الجذري (Root Cause) | الإصلاح الهندسي المنفذ (Implemented Fix) |
| :--- | :--- | :--- |
| **P0-1** | **فقدان علامة الاتساخ الدائمة للحواشي بعد التفريغ الخامل (`350ms`):** كانت `flushPendingAnnotationsSave(false)` و`saveAnnotationsToDB()` تكتبان الحواشي في IndexedDB وتحدثان المتغير العابر في الذاكرة `dirtyAnnotationsForCloud = true` دون وضع علامة اتساخ دائمة في `localStorage`. وعند إعادة تحميل الصفحة قبل انقضاء مؤقت الكلاود (`3500ms`)، يُعاد تعيين `dirtyAnnotationsForCloud = false` وتكون `pharmaWorkspaceDirty_<uid>` غير مفعلة، فيقوم `syncWorkspaceOnLogin()` بسحب النسخة السحابية القديمة والكتابة فوق حواشي IndexedDB الحديثة. كما أن إغلاق الـ PDF (`flushPendingAnnotationsSave(true)`) كان يعود مبكراً دون رفع الحواشي إذا كانت `pendingAnnoSaveMap` قد أفرغت للتو بواسطة المؤقت الخامل (`350ms`). | 1. إنشاء وتحديث علامات اتساخ دائمة مرتبطة بالحساب (`pharmaAnnotationsDirty_<uid> = '1'`, `pharmaWorkspaceDirty_<uid> = '1'`, `pharmaWorkspaceDirty = '1'`) عبر `markUserWorkspaceDirtyState()` فور نجاح أي كتابة متينة للحواشي في `saveAnnotationsToDB()` و`flushPendingAnnotationsSave()`.<br>2. تضمين `pharmaAnnotationsDirty_<uid> === '1'` في كافة قرارات المصالحة عند تسجيل الدخول أو إعادة التحميل (`syncWorkspaceOnLogin` و`pullWorkspaceFromCloud`).<br>3. تحديث `flushPendingAnnotationsSave(true)` بحيث إذا كانت `pendingAnnoSaveMap` فارغة ولكن توجد حواشٍ مفرغة غير مرفوعة (`hasFlushedDirtyAnnos`)، يتم استدعاء `pushWorkspaceToCloud(false, true, ctx)` فوراً بدلاً من التخطي الصامت.<br>4. عدم مسح `pharmaAnnotationsDirty_<uid>` إلا بعد تأكيد الخادم السحابي لنجاح عملية الرفع (`status === 'success'`) وعدم حدوث تعديل أحدث أثناء الطلب.<br>5. في `applyCloudWorkspacePayload()`، دمج الحواشي المحلية غير المرفوعة (`pharmaAnnotationsDirty_<uid> === '1'`) سببياً عبر `mergeAnnotationsMapsWithCausalEngine(existingAnnos, incomingAnnos, ...)` مع جعل الحالة المحلية هي القاعدة الأساسية حتى لا تطمس النسخة السحابية القديمة الضربات الخطية أو الملاحظات النصية أو الدبابيس الصوتية أو أوراق الملاحظات الإضافية المتعددة (`Extra Note Sheets`). |
| **P0-2 & P0-4** | **تلوث هوية الحساب وعزل الجلسة المحلية البديلة عن حساب Supabase:** عند استخدام جلسة محلية بديلة (`pharmaActiveAccountSessionV1`) كانت `currentCloudUser` تصبح `null` عند بداية إعادة التحميل فتعود `getCanonicalUserId()` إلى `'local'` مؤقتاً. وفي المقابل، إذا بقيت `pharmaActiveAccountSessionV1` قديمة من جلسة محلية سابقة بعد تسجيل دخول حساب Supabase وانتهاء جلسة Supabase أو فشل استعادتها مؤقتاً، كانت الجلسة المحلية القديمة تختطف الهوية أو تُمسح بيانات الحساب المحلي السابق بصمت عند الانتقال إلى حساب Supabase. | 1. تحديث `getCanonicalUserId()` و`initSupabaseCloudEngine()` لاستعادة جلسة الحساب المحلي البديل (`pharmaActiveAccountSessionV1`) بأمان عندما لا تكون هناك جلسة Supabase نشطة متعارضة (`!lastCloudUid || lastCloudUid === 'local' || lastCloudUid === activeSession.id`).<br>2. منع أي `pharmaActiveAccountSessionV1` قديمة من اختطاف `getCanonicalUserId()` عندما يكون `pharmaLastActiveCloudUid` مسجلاً لحساب Supabase مختلف.<br>3. في `handleAuthSessionChange()`، حفظ نسخة كاملة من مساحة عمل الحساب المحلي السابق في `pharmaAccountWorkspace_<prevUid>` وأرشفة مؤشر جلسته في `pharmaPreviousLocalAccountSessionV1` عند الانتقال إلى حساب Supabase مختلف، مع عدم حذف `pharmaActiveAccountSessionV1` إذا كانت تخص نفس الحساب الوارد (`parsedPrevLocal.id === nextUid`). |
| **P0-3** | **التعامل مع أخطاء قراءة Supabase (`SELECT res.error`) على أنها مساحة عمل فارغة أو الرجوع للقطة قديمة:** في `pullWorkspaceFromCloud()` و`syncWorkspaceOnLogin()`، لم يكن يتم فحص `res.error` بشكل مستقل عن `!remoteRow`، مما كان يسمح عند فشل الشبكة أو انتهاء صلاحية الرمز الأمني بالوقوع في مسار اللقطة القديمة أو تصفير المراجعة المتوقعة (`currentCloudWorkspaceRevision = 0`). | فحص `if (res && res.error)` صراحةً وبشكل مغلق عند الفشل (`Fail-Closed`) في كلٍ من `pullWorkspaceFromCloud()` و`syncWorkspaceOnLogin()`:<br>- عدم اعتبار الاستعلام الفاشل مساحة عمل فارغة.<br>- عدم التراجع إلى لقطة حساب قديمة (`pharmaAccountWorkspace_<uid>`) وكأنها بيانات مؤكدة حديثة.<br>- عدم تصفير `currentCloudWorkspaceRevision` إلى `0` (الحفاظ على المراجعة المحفوظة).<br>- الحفاظ الكامل على البيانات المحلية وعلامات الاتساخ، وتحديث واجهة المزامنة إلى `'error'`، وإرجاع `{ ok: false, status: 'error', reason: 'remote_read_failed', error: res.error, diagnostic }`. |
| **P0-5** | **غياب الحماية من امتلاء مساحة التخزين المحلية (`QuotaExceededError`):** كانت الدوال `saveSubjects()` و`saveScheduleData()` و`saveLogs()` تستدعي `localStorage.setItem` دون تغليف `try/catch`، مما يعرض التطبيق لانهيار التنفيذ أو الإبلاغ الكاذب عن نجاح الحفظ عند امتلاء حصة المتصفح. | تغليف عمليات `localStorage.setItem` في `saveSubjects()` و`saveScheduleData()` و`saveLogs()` بـ `try/catch` صارم:<br>- التقاط `QuotaExceededError` وأي أخطاء تخزين أخرى.<br>- إرجاع `{ ok: false, persisted: false, reason: 'storage_quota_exceeded', error }` دون الإبلاغ عن نجاح الحفظ.<br>- الحفاظ على التعديلات في الذاكرة (`subjects`, `scheduleEvents`, `logs`) وتعيين حالة المزامنة إلى `'error'` دون حذف أي بيانات أو حواشٍ أو نسخ احتياطية للمستخدم.<br>- إظهار تنبيه عربي واضح وقابل للتنفيذ للمستخدم عبر `showToast`. |
| **P0-6** | **إغفال ترتيب المحاضرات داخل الفصل/المجموعة في البصمة السببية (`_causalDigest`):** كانت `computeEntityContentDigest('group', group)` تحسب بصمة اسم المجموعة ولونها فقط دون ترتيب معرفات المحاضرات، وكانت `moveLectureInGroup()` و`autoSortLecturesInGroup()` و`handleLectureDrop()` تعيد ترتيب المصفوفة دون ختم تغيير سببي على المجموعة، فيضيع الترتيب الجديد عند الدمج السببي. | 1. تضمين `_lectureOrder: group.lectures.map(l => String(l.id))` في `computeEntityContentDigest('group', group)`.<br>2. ختم تغيير سببي جديد (`stampEntityCausalMutation`) وتحديث `_causalDigest` للمجموعة والمادة الأب في `moveLectureInGroup()` و`autoSortLecturesInGroup()` و`handleLectureDrop()`.<br>3. تحديث `mergeSubjectsHierarchyWithCausalEngine()` لترتيب المحاضرات المدمجة وفق ترتيب المجموعة الفائزة سببياً (`winningGroup.lectures`). |
| **Cloud UI** | **دقة حالات مؤشر المزامنة السحابية (`updateCloudNavUI`):** الحاجة لتمثيل صادق لكافة حالات المزامنة وعدم إظهار `'synced'` بعد أي خطأ في `SELECT` أو `RPC` أو التخزين. | تحديث `updateCloudNavUI(state)` لدعم الحالات السبع بدقة (`'logged_out'`, `'local_only'`, `'pending'`, `'syncing'`, `'synced'`, `'offline'`, `'error'`)، وضمان عدم إظهار `'synced'` أو مسح علامات الاتساخ إلا بعد تأكيد الخادم السحابي للمراجعة والحمولة المتوقعة. |

### 18.2 قائمة الملفات المعدلة في Phase A (Modified Files)
1. `index.html` — تطبيق إصلاحات `P0-1` إلى `P0-6` ودقة حالات واجهة المزامنة السحابية فقط (دون أي تعديل من Phase B).
2. `test_phase4_regressions.js` — إضافة جناح اختبارات انحدار Phase A P0 (`P0-R1` إلى `P0-R10` بإجمالي **34 فحصاً جديداً**، ليصبح المجموع **266/266**).
3. `test_phase4_1_chromium_e2e.js` — إضافة سيناريو المتصفح الحقيقي `Test FF` (`Test FF.1` إلى `Test FF.5` بإجمالي **5 فحوصات E2E جديدة**، ليصبح المجموع **116/116**).
4. `reports/CURRENT.md` — توثيق تنفيذ Phase A ونتائج الاختبارات المحلية الفعلية.

### 18.3 نتائج الاختبارات المحلية الفعلية لـ Phase A (Actual Local Test Execution Summary)

| أمر الاختبار المنفذ | البيئة ونطاق الفحص | النتيجة الفعلية | كود الخروج |
| :--- | :--- | :--- | :--- |
| `npm run lint` | فحص الصياغة الاستاتيكي لملفات الخادم والبناء والاختبارات | **PASSED (0 Errors)** | `0` |
| `npm run build` | بناء وتجهيز حزمة الإنتاج (`dist/`) | **PASSED** | `0` |
| `npm run test:static` (`node run_verification_tests.js`) | فحوصات التشفير PBKDF2 والأمان الثابت و`sw.js` | **54/54 PASSED (100%)** | `0` |
| `node run_comprehensive_verification.js` | التحقق الشامل من المنطق الأكاديمي | **42/42 PASSED (100%)** | `0` |
| `node test_phase3_cross_account_isolation.js` | عزل الحسابات وسلامة السجلات | **52/52 PASSED (100%)** | `0` |
| `node test_phase4_regressions.js` | اختبارات الانحدار الشاملة + فحوصات Phase A (`P0-R1`..`P0-R10`) | **266/266 PASSED (100%)** | `0` |
| `npm run test:pglite` (`node test_phase4_2_postgres_integration.js`) | توافق PostgreSQL المدمج وRLS والـ OCC | **41/41 PASSED (100%)** | `0` |
| `npm run test:e2e` (`node test_phase4_1_chromium_e2e.js`) | متصفح Chromium الحقيقي (السيناريوهات A–FF شاملة `Test Z` و`Test FF`) | **116/116 PASSED (100%)** | `0` |
| `npm run test:pg16` (`node test_phase4_2_1_pg16_concurrency.js`) | خادم PostgreSQL 16 الحقيقي متعدد الاتصالات | **NOT RUN LOCALLY** (`ECONNREFUSED 127.0.0.1:5432` — يتطلب خادم PostgreSQL 16 المخصص في GitHub Actions CI؛ لم يتم إجراء أي تعديل SQL/DB في Phase A) | — |
| **إجمالي الفحوصات المنفذة محلياً** | **مجموع الفحوصات الفعلية المجتازة محلياً في Phase A** | **571/571 PASSED (100%)** | `0` |

### 18.4 حالة الاعتماد والحوكمة لـ Phase A
- **حالة Phase A الحالية:** `IMPLEMENTED — LOCAL TESTS ONLY`.
- **تأكيد عدم الخلط:** لم يتم خلط أي تعديلات أداء أو إعادة هيكلة من Phase B (`P1`) داخل هذه التمريرة؛ النطاق مقصور حصراً على سلامة واستمرارية البيانات (`P0`).
- **تأكيد السياسة الأمنية:** لم يتم إجراء أي commit أو push أو تعديل على قاعدة بيانات الإنتاج أو ملفات migrations.

---

## 19. إغلاق فجوات القبول لـ Phase A ومعالجة أعطال التخزين المحلي الحرجة (Phase A Acceptance Gap Closure & Critical P0 Storage Failure Remediation — Above Base `03c0737`)

بناءً على مراجعة المالك لـ Phase A فوق خط الأساس `03c0737e857c95099d416b0fbf22eff581d97d86`، تم تنفيذ وإغلاق كافة فجوات القبول الخمس (`Gap 1` إلى `Gap 5`) ومتطلبات الحماية الحرجة من فشل `localStorage` وفقدان بيانات المواد والفصول والمحاضرات والجداول (`Additional Critical P0`)، دون المساس بـ Phase B:

### 19.1 الفجوة 1: سجل الاتساخ المتين للحواشي ومساحة العمل في IndexedDB (Gap 1 — Durable Annotation & Workspace Dirty Journal)
- **المشكلة والسبب الجذري:** كانت الدالة `markUserWorkspaceDirtyState()` تغلف كتابة علامات الاتساخ في `localStorage` (`pharmaAnnotationsDirty_<uid>`, `pharmaWorkspaceDirty_<uid>`, `pharmaWorkspaceDirty`) بـ `try/catch` صامت. عند امتلاء حصة `localStorage` (`QuotaExceededError`)، تُحفظ الحواشي في IndexedDB بينما تفشل كتابة علامة الاتساخ في `localStorage`، مما يعرض الحواشي المحلية للطمس عند إعادة التحميل ومزامنة السحابة.
- **الإصلاح الهندسي المنفذ:**
  1. ترقية قاعدة بيانات IndexedDB (`WorkspaceMediaStore`) إلى الإصدار `5` وإضافة مخزنين متينين:
     - `cloud_sync_journal` (`keyPath: 'key'`، مع فهرس `by_userId`): لتسجيل حالة اتساخ المزامنة السحابية لكل حساب بمعرف `usr_<sanitizedUid>::__cloud_sync_journal_v1__`.
     - `workspace_state` (`keyPath: 'key'`، مع فهرس `by_userId`): لحفظ النسخة القانونية المتينة لمساحة العمل (`subjects`, `scheduleEvents`, `scheduleBacklog`, `plannerPrefs`, `logs`) بمعرف `usr_<sanitizedUid>::__workspace_state_v1__`.
  2. في `flushPendingAnnotationsSave()`، يتم تنفيذ كتابة سجلات الحواشي (`annotations`) وسجل الاتساخ السحابي (`cloud_sync_journal`) داخل **نفس معاملة IndexedDB الذرية متعددة المخازن** (`db.transaction(['annotations', 'cloud_sync_journal'], 'readwrite')`)، متضمنةً `dirtyAnnotations: true`, `dirtyWorkspace: true`, `dirtyLectureIds`, `lectureIds`, `mutationSeq`, `workspaceMutationSeq`.
  3. في `saveAnnotationsToDB()`، يتم كذلك تحديث سجل `cloud_sync_journal` متانةً والتحقق من عدم تجاهل أي فشل في حفظ الحواشي أو بيانات التعافي/المزامنة.
  4. تحديث `syncWorkspaceOnLogin()` و`pullWorkspaceFromCloud()` و`applyCloudWorkspacePayload()` و`pushWorkspaceToCloud()` لقراءة السجل المتين عبر `readDurableCloudSyncJournal(uid)` قبل السماح لأي بيانات سحابية بالكتابة فوق الحواشي أو مساحة العمل المحلية، مع ترقية عدادات التسلسل (`annotationMutationSeq` و`localWorkspaceMutationSeq`) من السجل المتين عبر عمليات إعادة تحميل الصفحة.
  5. لا يتم مسح سجل الاتساخ المتين (`clearDurableAnnotationDirtyJournal` و`clearDurableWorkspaceDirtyJournal`) إلا بعد تأكيد الخادم السحابي لنجاح RPC (`status === 'success'`) وبشرط عدم حدوث تعديل أحدث (`annotationMutationSeq === pushStartAnnoSeq` و`localWorkspaceMutationSeq === pushStartWorkspaceSeq`).

### 19.2 الفجوة 2: استعادة جلسة Supabase الحقيقية في متصفح Chromium E2E (Gap 2 — Real Supabase Session Restoration in Chromium E2E)
- **المشكلة والسبب الجذري:** كان الاختبار السابق يعيّن `currentCloudUser` يدوياً قبل وبعد `page.reload()`، متجاوزاً مسار بدء التشغيل الفعلي `initSupabaseCloudEngine()` واستعادة الجلسة عبر `auth.getSession()`.
- **الإصلاح الهندسي المنفذ (`Test FF.1` – `Test FF.9` في `test_phase4_1_chromium_e2e.js`):**
  1. إنشاء سياق متصفح Chromium معزول وجديد (`contextFF`) وتثبيت محاكاة `window.supabase.createClient()` عبر `contextFF.addInitScript(...)` **قبل** بدء تشغيل التطبيق.
  2. إرجاع جلسة صالحة لنفس الحساب الاصطناعي من `auth.getSession()` وإشعار `auth.onAuthStateChange()` تلقائياً عند التحميل الأولي وبعد `pageFF.reload()` الكامل دون أي تعيين يدوي لـ `currentCloudUser`.
  3. إثبات تنفيذ المسار الطبيعي الكامل: `initSupabaseCloudEngine()` ← `auth.getSession()` ← `handleAuthSessionChange()` ← `syncWorkspaceOnLogin()` في مواجهة صف سحابي قديم (`revision: 1`, `annotations: {}`)، وبقاء الحواشي المحلية (الضربات الخطية، الملاحظات النصية، الدبابيس الصوتية، وأوراق الملاحظات الإضافية المتعددة `Extra Note Sheets`) سليمة بالكامل ورفعها إلى السحابة بمراجعة محدثة.

### 19.3 الفجوة 3 والفجوة 4: فشل وتأكيد RPC عبر إعادة التحميل وامتلاء الحصة أثناء كتابة علامة الاتساخ (Gaps 3 & 4)
- **الفجوة 3 (RPC Failure & Confirmation Across Reload):**
  - عند فشل RPC (`503 Service Unavailable`) بعد تفريغ `350ms`، تبقى علامات الاتساخ في `localStorage` وسجل `cloud_sync_journal` في IndexedDB مفعلة، وتتحول حالة الواجهة إلى `'error'` (`updateCloudNavUI('error')`).
  - بعد إعادة تحميل المتصفح وفشل الاسترداد الأولي، تظل الحواشي المحلية محمية من الطمس؛ وعند استعادة الشبكة ونجاح RPC التالي، يتم تحديث المراجعة ومسح سجل الاتساخ المتين وعلامات `localStorage` وتحديث الواجهة إلى `'synced'` (`P0-R11.4`–`P0-R11.6` و`Test FF.4`–`FF.6`).
- **الفجوة 4 (QuotaExceededError on Dirty-Marker Write):**
  - عند رمي `QuotaExceededError` على `localStorage.setItem` لمفاتيح `pharmaAnnotationsDirty_*` و`pharmaWorkspaceDirty*`، يلتزم سجل `cloud_sync_journal` الذري في IndexedDB بنجاح ويمنع `syncWorkspaceOnLogin()` و`pullWorkspaceFromCloud()` من الكتابة فوق الحواشي المحلية (`P0-R11.1`–`P0-R11.3` و`Test FF.7`).

### 19.4 الفجوة 5: التغطية المستقلة لبقية مسارات Phase A P0 (Gap 5 — Remaining P0 Coverage)
تمت إضافة اختبارات انحدار مستقلة ومباشرة في `test_phase4_regressions.js`:
1. **`autoSortLecturesInGroup()` (`P0-R13.1` – `P0-R13.2`):** إثبات إعادة الترتيب الفعلي، ختم التغيير السببي (`_causalUpdatedAt`, `_causalSeq`)، تحديث `_causalDigest` للمجموعة والمادة، وفوز الترتيب الجديد عند الدمج السببي.
2. **`handleLectureDragStart` + `handleLectureDrop` (`P0-R14.1` – `P0-R14.2`):** إثبات نقل المحاضرة بالسحب والإفلات، ختم التغيير السببي، وفوز الترتيب الجديد عند الدمج السببي.
3. **استعادة الحساب المحلي المؤرشف (`P0-R15.1` – `P0-R15.2`):** إثبات استرجاع بيانات الحساب المحلي البديل من `pharmaPreviousLocalAccountSessionV1` و`pharmaAccountWorkspace_<prevLocalUid>` دون فقدان أي مادة أو محاضرة بعد تسجيل الخروج من حساب Supabase.
4. **التراجع الذري عن الكتابة الجزئية في `saveScheduleData()` (`P0-R16.1` – `P0-R16.4`):** إثبات أنه عند نجاح كتابة `pharmaScheduleV4` وفشل كتابة `pharmaScheduleBacklogV4` أو `pharmaPlannerPrefsV1` بسبب `QuotaExceededError`، يتم استرجاع القيم السابقة المتسقة لكافة المفاتيح الثلاثة في `localStorage` فوراً وإرجاع `{ ok: false, persisted: false, rolledBack: true }`.

### 19.5 المعالجة الحرجة الإضافية: منع فقدان البيانات عند فشل `localStorage` والترحيل المتين إلى IndexedDB (Additional Critical P0 — LocalStorage Failure & Data Loss)
1. **التشخيص الدقيق لأعطال التخزين (`diagnoseStorageWriteFailure` & `getLastStorageFailureDiagnostics`):**
   - تصنيف سبب الفشل بدقة إلى: `quota_exceeded`، `storage_disabled_or_private_mode`، `serialization_error`، أو `unknown_storage_error`، وتسجيل المفتاح المستهدف وحجم الحمولة واسم الاستثناء في `lastStorageFailureDiagnostics` دون كسر الجلسة.
2. **منع النجاح الكاذب في النوافذ المنبثقة والفصول (`Modal & Chapter Creation/Edit/Delete Safety`):**
   - في `openSingleInputModal()` و`saveSingleInputModal()` و`openDoubleInputModal()`: إذا أعاد رد النداء (`singleModalCallback` أو `onSave`) كائناً يشير إلى فشل الحفظ (`res.ok === false || res.persisted === false`)، تبقى النافذة مفتوحة مع الحفاظ على مدخلات المستخدم وعدم إظهار رسالة نجاح كاذبة.
   - في `triggerAddGroup()` و`triggerEditGroup()` و`triggerDeleteGroup()`: الاحتفاظ بنسخة احتياطية عميقة قبل التعديل؛ وإذا فشل حفظ `localStorage` ولم ينجح الحفظ المتين في IndexedDB (`!saveRes.idbPersisted`)، يتم استرجاع المصفوفة والاختيار السابق فوراً وإرجاع `{ ok: false, persisted: false }`. أما إذا فشل `localStorage` ونجح الحفظ المتين في IndexedDB (`idbPersisted: true`)، تبقى البيانات محفوظة بأمان مع إشعار المستخدم.
3. **الترحيل والاستعادة المتينة من IndexedDB عند بدء التشغيل (`persistWorkspaceDomainToIDB` & `migrateAndHydrateWorkspaceFromIDB`):**
   - كل عملية حفظ في `saveSubjects()` و`saveScheduleData()` و`saveLogs()` تكتب النسخة القانونية في مخزن IndexedDB `workspace_state` مع تسجيل علم `lsPersisted: Boolean(lsPersisted)`.
   - عند بدء التشغيل أو تبديل الحساب، تفحص `migrateAndHydrateWorkspaceFromIDB(uid)` مخزن `workspace_state`: فإذا كان `localStorage` فارغاً أو كان سجل IndexedDB يحمل `lsPersisted === false` (نتيجة فشل كتابة `localStorage` سابق قبل إغلاق التبويب)، يتم دمج واستعادة المواد والفصول والمحاضرات والجدول والسجلات سببياً من IndexedDB وإعادة كتابتها في `localStorage` بأمان (`P0-R17`–`P0-R20` و`Test FF.8`–`FF.9`).

### 19.6 قائمة الملفات المعدلة في هذه التمريرة
1. `index.html` — ترقية IndexedDB إلى v5 (`cloud_sync_journal`, `workspace_state`)، المعاملات الذرية لسجل اتساخ الحواشي، الترحيل المتين لمساحة العمل، التراجع المتسق في `saveScheduleData()`، وحماية النوافذ المنبثقة والفصول من الفشل الصامت.
2. `test_phase4_regressions.js` — إضافة الفحوصات `P0-R11` إلى `P0-R20` (يرتفع الإجمالي من `266/266` إلى **`289/289 PASSED`**).
3. `test_phase4_1_chromium_e2e.js` — توسيع وإعادة بناء `Test FF` (`Test FF.1` إلى `Test FF.9`) لاختبار استعادة جلسة Supabase الحقيقية وفشل/تأكيد RPC و`QuotaExceededError` واستعادة الفصول والمحاضرات عبر إعادة التحميل في Chromium (يرتفع الإجمالي من `116/116` إلى **`120/120 PASSED`**).
4. `reports/CURRENT.md` — توثيق التغييرات ونتائج الاختبارات المحلية الفعلية.

### 19.7 مصفوفة التحقق والاختبارات المحلية الفعلية بعد إغلاق الفجوات (Verified Local Test Matrix)

| أمر الاختبار المنفذ | البيئة ونطاق الفحص | النتيجة الفعلية | كود الخروج |
| :--- | :--- | :--- | :--- |
| `npm run lint` | فحص الصياغة الاستاتيكي لملفات الخادم والبناء والاختبارات | **PASSED (0 Errors)** | `0` |
| `npm run build` | بناء وتجهيز حزمة الإنتاج (`dist/`) | **PASSED** | `0` |
| `npm run test:static` (`node run_verification_tests.js`) | فحوصات التشفير PBKDF2 والأمان الثابت و`sw.js` | **54/54 PASSED (100%)** | `0` |
| `node run_comprehensive_verification.js` | التحقق الشامل من المنطق الأكاديمي | **42/42 PASSED (100%)** | `0` |
| `node test_phase3_cross_account_isolation.js` | عزل الحسابات وسلامة السجلات | **52/52 PASSED (100%)** | `0` |
| `node test_phase4_regressions.js` | اختبارات الانحدار الشاملة + فحوصات Phase A (`P0-R1`..`P0-R20`) | **289/289 PASSED (100%)** | `0` |
| `npm run test:pglite` (`node test_phase4_2_postgres_integration.js`) | توافق PostgreSQL المدمج وRLS والـ OCC | **41/41 PASSED (100%)** | `0` |
| `npm run test:e2e` (`node test_phase4_1_chromium_e2e.js`) | متصفح Chromium الحقيقي (كافة السيناريوهات A–FF شاملة `Test FF.1`..`FF.9`) | **120/120 PASSED (100%)** | `0` |
| `npm run test:dd` (`node test_phase4_1_chromium_e2e.js --dd-only`) | الاختبار المستقل للتبويبين المتزامنين في Chromium | **3/3 PASSED (100%)** | `0` |
| `npm run test:pg16` (`node test_phase4_2_1_pg16_concurrency.js`) | خادم PostgreSQL 16 الحقيقي متعدد الاتصالات | **NOT RUN LOCALLY** (يتطلب خادم PostgreSQL 16 المخصص في GitHub Actions CI؛ لا توجد أي تعديلات SQL/DB في Phase A) | — |
| **إجمالي الفحوصات المدمجة المنفذة محلياً** | **مجموع الفحوصات الفعلية المجتازة محلياً في Phase A** | **598/598 PASSED (100%)** | `0` |

---

## 20. معالجة فشل CI النهائي لـ Phase A (Phase A Final CI Failure Resolution — Above Base `5318117`)

### 20.1 خط الأساس ونتيجة تشغيل GitHub Actions CI (`43305785869`)
- **المستودع والفرع:** `JemistryMC/study-hub` (`main`)
- **خط الأساس الحالي (Current Base HEAD):** `531811772626dbd0d66729e344efc6afb659b6e1` *(ملاحظة بيئية: مجلد `.git` غير متاح داخل حاوية AI Studio المحلية، وتم الاعتماد على ملفات المستودع المحدثة مباشرةً من المالك عند هذا الـ SHA).*
- **سجل تشغيل GitHub Actions CI على `531811772626dbd0d66729e344efc6afb659b6e1` (Run ID: `43305785869`):**
  - Lint & Build: **PASSED**
  - Static Security (`run_verification_tests.js`): **54/54 PASSED**
  - Comprehensive Verification (`run_comprehensive_verification.js`): **42/42 PASSED**
  - Cross-Account Isolation (`test_phase3_cross_account_isolation.js`): **52/52 PASSED**
  - Phase 4 Regressions (`test_phase4_regressions.js`): **297/297 PASSED**
  - Embedded PGlite (`test_phase4_2_postgres_integration.js`): **41/41 PASSED**
  - Real PostgreSQL 16 (`test_phase4_2_1_pg16_concurrency.js`): **96/96 PASSED**
  - Real Chromium E2E (`test_phase4_1_chromium_e2e.js`): **121/124 PASSED** (فشلت 3 فحوصات فقط: `Test J.2`، `Test FF.7b`، `Test FF.7d`).

### 20.2 التحليل الجذري والإصلاحات المنفذة للفحوصات الثلاثة

| الفحص | السبب الجذري للفشل في CI Run `43305785869` | الإصلاح الهندسي المنفذ |
| :--- | :--- | :--- |
| **`Test J.2`** | كان الاختبار القديم يضبط `dbInstance = null` فقط لاختبار `getAllAnnotationsMapFromDB()` و`pushWorkspaceToCloud(true, true)`. ومع إضافة `readDurableCloudSyncJournal()` في بداية `pushWorkspaceToCloud()`، يحاول القارئ المتين إعادة فتح IndexedDB تلقائياً عبر `initPdfDB()`. كما أن `initPdfDB()` كانت تحتفظ بـ `dbReadyPromise` المحلولة من بدء التشغيل الأول دون تصفيرها بعد `req.onsuccess`، مما كان يُعيد الوعد القديم دون إعادة ربط `dbInstance` أو يسمح لـ `readDurableCloudSyncJournal()` بالإجهاض المبكر قبل الوصول إلى `getAllAnnotationsMapFromDB()`. | 1. في `initPdfDB()` (`index.html`): تصفير `dbReadyPromise = null` فور اكتمال `req.onsuccess` وتعيين `dbInstance = openedDb`، بحيث إذا فُقدت `dbInstance` لاحقاً، تعيد `initPdfDB()` فتح اتصال IndexedDB فعلياً وتستعيد `dbInstance` تلقائياً.<br>2. في `pushWorkspaceToCloud()` (`index.html`): تحديث مؤشر الواجهة إلى `updateCloudNavUI('error')` عند حدوث `LOCAL_ANNOTATIONS_READ_ERROR`.<br>3. في `Test J.1` و`Test J.2` (`test_phase4_1_chromium_e2e.js`): الحفاظ على سلوك إعادة التهيئة التلقائية في الإنتاج (`reopenedAutomatically === true` عبر `initPdfDB()` داخل `readDurableCloudSyncJournal()`)، مع حقن فشل قراءة IndexedDB حقيقي على مخزن `'annotations'` (`IDB_READ_ERROR`) لإثبات أن فشل قراءة الحواشي المحلية في `getAllAnnotationsMapFromDB()` يجهض `pushWorkspaceToCloud()` فوراً بـ `error: 'LOCAL_ANNOTATIONS_READ_ERROR'` ويمنع استدعاء Supabase RPC (`rpcCalled === false`). |
| **`Test FF.7b`** | في متصفح Chromium (Blink IDL)، الخاصية `dbInstance.objectStoreNames` هي `getter` على `IDBDatabase.prototype` تُعيد غلاف `DOMStringList` جديداً في كل مرة تُقرأ فيها. لذلك فإن تعديل `dbInstance.objectStoreNames.contains = ...` كان يعدل كائناً مؤقتاً يُهمل فوراً، بينما تظل استدعاءات `dbInstance.objectStoreNames.contains('cloud_sync_journal')` داخل الدوال الإنتاجية تُعيد `true`. | في `Test FF.7b` (`test_phase4_1_chromium_e2e.js`): اعتراض `DOMStringList.prototype.contains` مع التحقق الصريح من أن `dbInstance.objectStoreNames.contains('cloud_sync_journal') === false` داخل المتصفح، وإثبات أن المسارات الأربعة (`syncWorkspaceOnLogin()`، `pullWorkspaceFromCloud()`، `applyCloudWorkspacePayload()`، `pushWorkspaceToCloud()`) تفشل بشكل مغلق (`ok: false`, `status: 'error'`, `reason: 'durable_journal_read_failed'`)، مع بقاء الحواشي المحلية سليمة وبقاء واجهة السحابة في حالة `'error'` دون أي حالة `'synced'` كاذبة. |
| **`Test FF.7d`** | كان الاختبار يجدول `setTimeout(() => tx.abort(), 0)` لإجهاض معاملة `readonly` على `cloud_sync_journal`. في Chromium، تكتمل معاملة القراءة المحلية السريعة (`tx.oncomplete`) قبل تنفيذ مؤقت الماكرو (`setTimeout`). علاوةً على ذلك، عند استدعاء `tx.abort()` أثناء وجود طلبات `store.get()` معلقة في IndexedDB، يطلق المتصفح `req.onerror` و`tx.onerror` بـ `AbortError` قبل إطلاق `tx.onabort`، مما كان يجعل `readDurableCloudSyncJournal()` يحسم النتيجة مبكراً بـ `'journal_tx_error'` بدلاً من انتظار `tx.onabort` (`'journal_tx_aborted'`). | 1. في `readDurableCloudSyncJournal()` و`persistWorkspaceDomainToIDB()` (`index.html`): عند استقبال حدث خطأ يحمل `errObj.name === 'AbortError'` على الطلب أو المعاملة، عدم الحسم المبكر بـ `*_tx_error` وترك حدث `tx.onabort` يحسم المعاملة بدقة بـ `'journal_tx_aborted'` / `'idb_tx_aborted'`.<br>2. في `Test FF.7d` و`Test FF.8b` (`test_phase4_1_chromium_e2e.js`): استبدال `setTimeout(..., 0)` بـ `queueMicrotask(() => { try { tx.abort(); } catch (e) {} })` لإجهاض المعاملة الحقيقية حتمياً وهي نشطة قبل اكتمالها، مع عداد تحقق `onabortFiredCount >= 5` يثبت انطلاق `tx.onabort` الفعلي في المتصفح وإرجاع `reason: 'journal_tx_aborted'` عبر القارئ المباشر والمسارات الإنتاجية الأربعة. |

### 20.3 التحقق من صدق متانة IndexedDB في مسارات الفصول والنوافذ المنبثقة (Section 5 Verification)
تمت مراجعة والتحقق من:
- `saveSubjects()`، `saveScheduleData()`، `saveLogs()`، و`persistWorkspaceDomainToIDB()`
- `saveSingleInputModal()`، `openSingleInputModal()`، `openConfirmModal()`
- `triggerAddGroup()`، `triggerEditGroup()`، و`triggerDeleteGroup()`
وتم التأكد من أن `idbPersisted` لا تصبح `true` إلا بعد اكتمال `tx.oncomplete` فعلياً، وأن النوافذ المنبثقة لا تُغلق ولا تُظهر نجاحاً قبل التأكد من الحفظ المتين، واجتازت الفحوصات `Test FF.8` و`Test FF.8b` و`Test FF.9` في Chromium E2E بالإضافة إلى `297/297` في `test_phase4_regressions.js`.

### 20.4 قائمة الملفات المعدلة في هذه التمريرة
1. `index.html` — تصفير `dbReadyPromise` بعد اكتمال `initPdfDB()`، معالجة `AbortError` في `readDurableCloudSyncJournal()` و`persistWorkspaceDomainToIDB()` لضمان حسم `tx.onabort` بـ `journal_tx_aborted` / `idb_tx_aborted`، وتعيين `updateCloudNavUI('error')` عند `LOCAL_ANNOTATIONS_READ_ERROR` في `pushWorkspaceToCloud()`.
2. `test_phase4_1_chromium_e2e.js` — تحديث حقن الأعطال الحتمي في `Test J.2` و`Test FF.7b` و`Test FF.7d` و`Test FF.8b` في متصفح Chromium الحقيقي.
3. `reports/CURRENT.md` — توثيق خط الأساس `531811772626dbd0d66729e344efc6afb659b6e1` ونتائج CI Run `43305785869` ونتائج الاختبارات المحلية (`610/610 PASSED`).

### 20.5 مصفوفة نتائج الاختبارات المحلية الفعلية فوق `531811772626dbd0d66729e344efc6afb659b6e1`

| أمر الاختبار المنفذ | البيئة ونطاق الفحص | النتيجة الفعلية | كود الخروج |
| :--- | :--- | :--- | :--- |
| `npm run lint` | فحص الصياغة الاستاتيكي لملفات الخادم والبناء والاختبارات | **PASSED (0 Errors)** | `0` |
| `npm run build` | بناء وتجهيز حزمة الإنتاج (`dist/`) | **PASSED** | `0` |
| `npm run test:static` (`node run_verification_tests.js`) | فحوصات التشفير PBKDF2 والأمان الثابت و`sw.js` | **54/54 PASSED (100%)** | `0` |
| `node run_comprehensive_verification.js` | التحقق الشامل من المنطق الأكاديمي | **42/42 PASSED (100%)** | `0` |
| `node test_phase3_cross_account_isolation.js` | عزل الحسابات وسلامة السجلات | **52/52 PASSED (100%)** | `0` |
| `node test_phase4_regressions.js` | اختبارات الانحدار الشاملة + فحوصات Phase A | **297/297 PASSED (100%)** | `0` |
| `npm run test:pglite` (`node test_phase4_2_postgres_integration.js`) | توافق PostgreSQL المدمج وRLS والـ OCC | **41/41 PASSED (100%)** | `0` |
| `npm run test:e2e` (`node test_phase4_1_chromium_e2e.js`) | متصفح Chromium الحقيقي (شاملة `Test J.2` و`Test FF.7b` و`Test FF.7d` و`Test FF.8`–`FF.9`) | **124/124 PASSED (100%)** | `0` |
| `npm run test:pg16` (`node test_phase4_2_1_pg16_concurrency.js`) | خادم PostgreSQL 16 الحقيقي متعدد الاتصالات | **NOT RUN LOCALLY** (`0/0` محلياً لعدم وجود خادم PostgreSQL 16 محلي على `127.0.0.1:5432` في حاوية AI Studio؛ اجتاز **96/96 PASSED** في GitHub Actions CI Run `43305785869`) | — |
| **إجمالي الفحوصات المنفذة محلياً (`npm test`)** | **مجموع الفحوصات الفعلية المجتازة محلياً** | **610/610 PASSED (100%)** | `0` |

### 20.6 القيود المتبقية وحالة الاعتماد
- **حالة المرحلة (Phase A Final CI Failure Resolution):** تم رفع التعديلات في الـ Commit `b0c7d78be97692f1217880b601fefc993e4ebd2d` واجتاز GitHub Actions CI بنجاح كامل (`706/706 PASSED` شاملة `96/96` في PostgreSQL 16 و`124/124` في Chromium E2E) مع نجاح نشر GitHub Pages.

---

## 21. تمريرة الاستقرار وسرعة الاستجابة العاجلة (EXO — Stability & Responsiveness Sprint — Above Base `b0c7d78`)

### 21.1 خط الأساس ونطاق التمريرة
- **المستودع والفرع:** `JemistryMC/study-hub` (`main`)
- **خط الأساس المعتمد (Base HEAD):** `b0c7d78be97692f1217880b601fefc993e4ebd2d` (706/706 اختبار ناجح في GitHub Actions CI + نجاح نشر GitHub Pages).
- **هدف التمريرة:** ضمان حفظ بيانات المستخدم محلياً بنسبة 100% عبر إعادة التحميل وتبديل التبويبات وتبديل الحسابات، وإزالة الاختناقات الزمنية المحسوسة في التنقل والنوافذ المنبثقة وقارئ الـ PDF دون المساس بأي سلوك من M1–M6 أو Phase A ودون أي تعديل على قاعدة البيانات أو سياسات الصلاحيات.

### 21.2 التشخيص الجذري لمواضع البطء ومخاطر الحفظ والإصلاحات المنفذة

| الموضع | السبب الجذري الذي تم تشخيصه | الإصلاح الجراحي المنفذ في `index.html` |
| :--- | :--- | :--- |
| **1. حفظ الفصول والمحاضرات والجلسات والمهام والسجلات** | كانت دوال النوافذ المنبثقة (`triggerAddGroup`, `triggerEditGroup`, `triggerDeleteGroup`, `saveSmartSubjectModal`, `addSubject`, `triggerAddLecture`, `triggerEditLecture`, `saveSession`, `addBacklogTask`, `saveLogPro`) تنتظر وعود IndexedDB أو تنظيف الوسائط قبل إغلاق النافذة المنبثقة حتى عندما ينجح الحفظ المتزامن في `localStorage` (`saveRes.persisted === true`)، أو تُغلق النافذة وتمسح الحقول حتى عند فشل `localStorage` و`IndexedDB` معاً. | 1. المسار المتزامن السريع: عند نجاح `localStorage` (`saveRes.persisted === true || saveRes.queued === true`)، تُغلق النافذة وتُحدث الواجهة فوراً (`< 2ms`) بينما تكتمل كتابة النسخة المتينة في IndexedDB في الخلفية.<br>2. المسار الاحتياطي المتين: عند فشل `localStorage` (`saveRes.persisted === false`)، يتم انتظار `saveRes.idbPersistPromise`. فإذا فشل الاثنان معاً، يتم التراجع عن التغيير في الذاكرة، وإبقاء النافذة مفتوحة مع الحفاظ الكامل على نص المستخدم المدخل ومنع تكرار العنصر عند إعادة المحاولة، وعرض تنبيه واضح بالعربية.<br>3. في `triggerAddLecture` و`triggerEditLecture`، يتم انتظار `await saveMediaToDB(...)` للملفات المرفوعة قبل استدعاء `saveSubjects()` لضمان عدم فقدان مرجع الملف. |
| **2. فتح وإغلاق قارئ المحاضرات (`openLectureDocument` & `closePdfViewer`)** | 1. عند الفتح: كان القارئ ينتظر تهيئة IndexedDB وقراءة الحواشي والصوت والـ PDF بالتسلسل (`await` متتالية) قبل إظهار نافذة القارئ (`392.8 ms`).<br>2. عند الإغلاق: كان `closePdfViewer()` ينفذ حفظ الحواشي، وتفريغ المؤقتات، وإعادة رسم شجرة الفصول `renderGroups()`، وتفريغ DOM صفحات الـ PDF **قبل** إزالة الكلاس `.active` من النافذة (`40.2 ms`).<br>3. عند الضغط على `Escape` على مستوى `window`: كان المستمع العام يستدعي `e.target.matches(...)` دون فحص توفر الدالة على `window`/`document`. | 1. في `openLectureDocument()`: إظهار `#pdfViewerModalOverlay.active` فوراً (`4.4 ms`)، وتنفيذ قراءات `[getAnnotationsFromDB, getMediaFromDB('audios'), getMediaFromDB('pdfs')]` بالتوازي عبر `Promise.all` (`15.8 ms` إجمالي).<br>2. في `closePdfViewer()`: تثبيت أي نص عائم وعلامة القراءة، وإيقاف الصوت ومهام الرسم ومراقب الصفحات، وإزالة `.active` من `#pdfViewerModalOverlay` و`in-pdf-studio` من `document.body` **أولاً** (`0.6 ms` إخفاء بصري فوري)، ثم إتمام حفظ العلامة والحواشي وتحديث `renderGroups()` وتفريغ الحاوية.<br>3. فحص `typeof e.target.matches === 'function'` في مستمع `keydown` العام لدعم إغلاق `Escape` الموثوق من أي هدف. |
| **3. التنقل بين التبويبات الرئيسية (`switchView`) وإغلاق التبويب (`pagehide` / `beforeunload`)** | 1. كان مؤقت حفظ علامة القراءة (`pdfBookmarkSaveTimer` بمهلة `450ms`) ومؤقت حفظ الحواشي (`autoSaveTimer` بمهلة `350ms`) يبقيان معلقين عند التبديل السريع بين التبويبات أو إغلاق الصفحة.<br>2. عند العودة إلى تبويب `subjects`، لم تكن `switchView('subjects')` تعيد رسم البطاقات لتعكس التقدم أو الجلسات المسجلة حديثاً. | 1. تفريغ `persistCurrentLectureReadingBookmark(true)` و`flushPendingAnnotationsSave(false)` فوراً داخل `switchView()` وعند أحداث `pagehide` و`beforeunload` و`visibilitychange (hidden)`.<br>2. تحديث `renderSubjectsList()` و`renderGroups()` عند التبديل إلى `subjects`. |
| **4. استنساخ JSON المزدوج في `persistWorkspaceDomainToIDB()`** | كانت `persistWorkspaceDomainToIDB()` تنفذ `JSON.parse(JSON.stringify(payload))` على الخيط الرئيسي في كل حفظ حتى مع أن محرك IndexedDB الأصلي في المتصفح ينفذ Structured Clone أصلياً في C++. | تخطي `JSON.parse(JSON.stringify(payload))` عند العمل على `IDBDatabase` الأصلي في المتصفح مع الإبقاء عليه لمحاكي الاختبارات `InMemoryIDBDatabase` في Node.js. |
| **5. استعادة مساحة عمل الحساب العائد بدون اتصال (`handleAuthSessionChange`)** | عند التبديل من الحساب الأول إلى الحساب الثاني ثم العودة إلى الحساب الأول محلياً (`shouldInitialSync = false`)، كانت `handleAuthSessionChange` تصفر `pharmaSubjectsV4` أثناء العزل ثم تستعيد `getAccountBackupStorageKey(uid)` فقط إذا كان الحساب `usr_...` (`isLocalFallbackUser`)، مما يترك الحساب السحابي العائد بدون استعادة نسخته المحلية المحفوظة. | توسيع شرط الاستعادة المحلية في `handleAuthSessionChange` ليشمل `(isLocalFallbackUser || isSwitchingDifferentCloudUser)` مع التحقق الصارم من ملكية اللقطة (`!snapData.user_id || String(snapData.user_id) === String(activeCtx.uid)`) وتشغيلها قبل `migrateAndHydrateWorkspaceFromIDB(activeCtx.uid)`. |
| **6. وضوح حالة الحفظ المحلي والمزامنة (`updateCloudNavUI`)** | لم تكن شارة الحالة في شريط التنقل تميز بوضوح باللغة العربية بين `"تم الحفظ محليًا — المزامنة معلقة"` عند انقطاع الاتصال أو وجود تغييرات معلقة وبين `"تمت المزامنة"`. | تحديث نصوص وعناوين `updateCloudNavUI` لعرض `"تم الحفظ محليًا — المزامنة معلقة"` في حالتي `offline` و`pending`، و`"تمت المزامنة"` في حالة `synced`. |

### 21.3 قياسات الأداء الحقيقية في متصفح Chromium (قبل وبعد الإصلاح — 12 مادة، 48 فصلاً، 240 محاضرة، 35 جلسة، 20 مهمة، 60 سجلاً، 20 شريحة PDF)

| العملية المقاسة في Chromium E2E | قبل الإصلاح (Before) | بعد الإصلاح (After) | التحسن المحقق |
| :--- | :--- | :--- | :--- |
| **التحميل الأولي للتطبيق (`initialLoadMs`)** | `1030.0 ms` | `898.0 ms` | أسرع بـ `132 ms` |
| **إعادة التحميل واستعادة IndexedDB (`reloadHydrateMs`)** | `754.0 ms` | `546.0 ms` | أسرع بـ `208 ms` (-27.6%) |
| **التبديل إلى تبويب الجدول (`navToScheduleMs`)** | `38.0 ms` | `6.1 ms` | أسرع بـ **6.2x** |
| **التبديل إلى تبويب السجل (`navToTrackerMs`)** | `17.7 ms` | `12.4 ms` | أسرع بـ **30%** |
| **التبديل إلى تبويب المواد مع التحديث (`navToSubjectsMs`)** | `0.5 ms` *(بدون تحديث)* | `2.6 ms` *(مع تحديث كامل)* | استجابة فورية `< 3 ms` |
| **فتح تفاصيل المادة والفصول (`openSubjectMs`)** | `4.6 ms` | `4.5 ms` | استجابة فورية `< 5 ms` |
| **إنشاء وحفظ فصل جديد (`saveChapterMs`)** | `84.3 ms` | `40.3 ms` | أسرع بـ **2.1x** |
| **حذف فصل وإغلاق نافذة التأكيد (`deleteGroupVisualCloseMs`)** | `144.9 ms` | `19.6 ms` (`102.5 ms` شامل الخلفية) | إغلاق بصري أسرع بـ **7.4x** |
| **فتح قارئ المحاضرات (`openPdfVisualShowMs` / `openPdfTotalMs`)** | `392.8 ms` | `4.4 ms` بصري / `15.8 ms` كامل | فتح بصري أسرع بـ **89x** وإجمالي أسرع بـ **24.8x** |
| **إغلاق قارئ المحاضرات (`closePdfVisualHideMs` / `closePdfTotalMs`)** | `40.2 ms` | `0.6 ms` بصري / `25.3 ms` كامل | إخفاء بصري فوري أسرع بـ **67x** |

### 21.4 إثبات أولوية حفظ البيانات رقم 1 في متصفح Chromium الحقيقي (`Test GG.1` – `Test GG.5`)
تمت إضافة مجموعة الاختبارات الشاملة `Test GG` في `test_phase4_1_chromium_e2e.js` للتحقق الميداني من البنود الـ11 المطلوبة:
1. **`Test GG.1`:** إنشاء مادة جديدة، ومجموعة، وفصل جديد، وإضافة محاضرة، وتعديلها، وحذف محاضرة مؤقتة، وتعديل بيانات موجودة، وحفظ جلسة جدول ومهمة Backlog وسجل مذاكرة وتقرير أسبوعي، وإضافة حواشي PDF وعلامة قراءة (`page: 2, zoom: 1.35`)، ثم تنفيذ `page.reload()` والتحقق من بقاء كافة البيانات بنسبة 100%، ثم إغلاق الصفحة وفتح تبويب جديد والتحقق من استعادة مساحة العمل بالكامل.
2. **`Test GG.2` & `Test GG.3`:** قياس والتحقق من سرعة التبديل بين التبويبات الرئيسية وفتح وإغلاق قارئ الـ PDF بالزر ومفتاح `Escape` مع حفظ علامة القراءة والحواشي وعدم تجمد الواجهة.
3. **`Test GG.4`:** التحقق من بقاء نافذة الإدخال مفتوحة والحفاظ التام على نص المستخدم المدخل عند فشل `localStorage` و`IndexedDB` معاً، والتحقق من ظهور مؤشر `"تم الحفظ محليًا — المزامنة معلقة"` عند انقطاع الاتصال.
4. **`Test GG.5`:** التحقق من العزل الصارم بين حسابين مختلفين (`usr_sprint_acc_1` و`usr_sprint_acc_2`) واستعادة كل حساب لبياناته الخاصة بالكامل عند التبديل بينهما دون أي تسرب أو فقدان.

### 21.5 قائمة الملفات المعدلة في هذه التمريرة
1. `index.html` — تحسينات سرعة الاستجابة، الحفظ الفوري مع الحفاظ على مدخلات النوافذ عند الفشل، الفتح والإغلاق الفوري لقارئ الـ PDF، تفريغ علامة القراءة والحواشي عند تبديل العرض وإغلاق الصفحة، واستعادة لقطة الحساب العائد محلياً.
2. `test_phase4_1_chromium_e2e.js` — إضافة اختبارات `Test GG` (`Test GG.1` إلى `Test GG.5`) ليرتفع إجمالي فحوصات Chromium E2E من `124/124` إلى **`129/129 PASSED`**.
3. `reports/CURRENT.md` — تحديث حالة المستودع وتوثيق نتائج التمريرة والقياسات.

### 21.6 مصفوفة نتائج الاختبارات المحلية الفعلية فوق `b0c7d78be97692f1217880b601fefc993e4ebd2d`

| أمر الاختبار المنفذ | البيئة ونطاق الفحص | الحالة | النتيجة الفعلية |
| :--- | :--- | :--- | :--- |
| `npm run lint` | فحص الصياغة الاستاتيكي لملفات الخادم والبناء والاختبارات | **PASSED** | `0 Errors` |
| `npm run build` | بناء وتجهيز حزمة الإنتاج (`dist/`) | **PASSED** | `Build succeeded` |
| `npm run test:static` (`node run_verification_tests.js`) | فحوصات التشفير PBKDF2 والأمان الثابت و`sw.js` | **PASSED** | **54/54 (100%)** |
| `node run_comprehensive_verification.js` | التحقق الشامل من المنطق الأكاديمي | **PASSED** | **42/42 (100%)** |
| `node test_phase3_cross_account_isolation.js` | عزل الحسابات وسلامة السجلات | **PASSED** | **52/52 (100%)** |
| `node test_phase4_regressions.js` | اختبارات الانحدار الشاملة + فحوصات M1–M6 وPhase A | **PASSED** | **297/297 (100%)** |
| `npm run test:pglite` (`node test_phase4_2_postgres_integration.js`) | توافق PostgreSQL المدمج وRLS والـ OCC | **PASSED** | **41/41 (100%)** |
| `npm run test:e2e` (`node test_phase4_1_chromium_e2e.js`) | متصفح Chromium الحقيقي (شاملة `Test GG.1`–`GG.5`) | **PASSED** | **129/129 (100%)** |
| `npm run test:pg16` (`node test_phase4_2_1_pg16_concurrency.js`) | خادم PostgreSQL 16 الحقيقي متعدد الاتصالات | **NOT RUN** محلياً | `0/0` محلياً (`ECONNREFUSED 127.0.0.1:5432` — يتطلب خدمة PostgreSQL 16 في GitHub Actions CI؛ اجتاز **96/96 PASSED** على خط الأساس `b0c7d78be97692f1217880b601fefc993e4ebd2d` ولم يتغير أي ملف SQL) |
| **إجمالي الفحوصات المنفذة محلياً (`npm test`)** | **مجموع الفحوصات الفعلية المجتازة محلياً** | **PASSED** | **615/615 (100%)** |

---

## 22. المعالجة الجذرية لاستنزاف LocalStorage وتضخم سجل التعافي ومتانة شواهد الحذف (EXO — P0 Storage Quota & Durable Recovery Remediation)

### 22.1 التشخيص الجذري لاستنزاف LocalStorage (~5.06 MiB)
كشف الفحص التشخيصي لمتصفح المستخدم الفعلي أن `pharmaConflictRecovery_<uid>` استهلك وحده **3,831.6 KiB** (~74% من إجمالي حصة LocalStorage البالغة ~5 MiB)، مع **1,116.8 KiB** إضافية في لقطات `pharmaAccountWorkspace_<uid>`. وأثبت التحليل الهندسي لمسارات الكود ثلاثة أسباب جذرية متضافرة:
1. **تكرار شجرات الكيانات الكاملة مع كل تعديل لاحق (`winningOperationId` Drift):** كانت دالتا `mergeEntityRecordsWithCausalEngine` و`isEntitySupersededByTombstone` تمرران كائنات المواد (`subjects`) والأقسام (`groups`) بكامل مصفوفاتها الفرعية المتداخلة (`.groups` و`.lectures`) إلى `recordConflictRecoveryCandidate`. ولأن `recoveryId` يُشتق من `${losingOpId}__vs__${winningOpId}`، فإن كل تعديل جديد يجريه المستخدم على المادة أو القسم الفائز كان يولّد `winningOperationId` جديداً لنفس القيمة الخاسرة القديمة، فيضيف نسخة كاملة مكررة من شجرة المادة أو القسم داخل `pharmaConflictRecovery_<uid>`.
2. **تضخم ضربات الحواشي المتعارضة (`divergent_legacy_stroke_ancestry`):** كانت `mergeLectureAnnotationsWithCausalVersions` تخزن مصفوفات الضربات المحلية والبعيدة كاملة شاملاً حقل `_canonicalGeomOrdinal` النصي المكرر لنقاط الرسم.
3. **النسخ المتعدد لنفس السجل داخل مفاتيح LocalStorage:** كانت `saveScheduleData` و`snapshotAccountWorkspaceToLocal` تعيدان تضمين `getConflictRecoveryRecords(uid)` داخل `pharmaScheduleV4._conflictRecovery` وداخل `pharmaAccountWorkspace_<uid>.schedule._conflictRecovery`، مما ضاعف استهلاك المساحة في المتصفح.

### 22.2 الحل الهندسي المنفذ (بدون `localStorage.clear()` وبدون فقدان أي سجل تعافٍ غير محلول)
1. **الفاحص التشخيصي الآمن للخصوصية (`inspectConflictRecoveryDiagnostics(targetUid)`):**
   - يفحص `pharmaConflictRecovery_<uid>` ومخزن IndexedDB دون تعديل، ويُرجع إحصائيات دقيقة (إجمالي السجلات، السجلات الفريدة، السجلات المكررة، البايتات القابلة للاسترداد، التوزيع حسب الحالة `unresolved`/`resolved`/`recovered`، والتوزيع النسبي للبايتات حسب `entityType` و`reason`) مع ضمان عدم تسريب أي عناوين أو نصوص شخصية (`Zero Personal Content Leakage`).
2. **الترحيل المتين ذو الـ7 خطوات لسجل التعافي إلى IndexedDB (`migrateConflictRecoveryToIDB(uid, opCtx)`):**
   - يعيد استخدام قاعدة البيانات القائمة `WorkspaceMediaStore` ومخزن `workspace_state` تحت المفتاح المعزول حسابياً `usr_<sanitizedUid>::__ws_domain_conflict_recovery_v1__` وسجل الترحيل `usr_<sanitizedUid>::__ws_domain_conflict_recovery_mig_v1__`.
   - **الخطوات السبع المحققة:**
     1. قراءة `pharmaConflictRecovery_<uid>` دون تعديل أو حذف المصدر.
     2. التحقق من البنية وملكية الحساب (`userId === targetUid`) واكتشاف أي ترحيل متوقف سابقاً في مرحلة `STAGED`.
     3. كتابة سجل المرحلة `STAGED` والسجلات المنقاة من التكرار إلى `workspace_state` في معاملة `readwrite`.
     4. انتظار اكتمال المعاملة الفعلي (`await tx.oncomplete`) مع دعم خطاف فحص الانقطاع `__exoConflictMigrationTestHooks.afterStage`.
     5. إعادة القراءة من IndexedDB في معاملة `readonly` مستقلة.
     6. التحقق الصارم من عدد السجلات وطول البايتات وتجزئة `SHA-256` (`computePureSha256`).
     7. تثبيت السجل كـ `COMMITTED`، وتحديث الذاكرة الحية، واستبدال الحمولة الضخمة في `localStorage` بمؤشر مدمج (~218 بايت فقط: `{ __exoIdbMigrated: true, version: 1, userId, count, sha256, byteLength, updatedAt }`)، وتجريد النسخ المكررة من `pharmaAccountWorkspace_<uid>.schedule._conflictRecovery` و`pharmaScheduleV4._conflictRecovery`.
3. **إزالة التكرار السببي وتقنين حجم المرشحات الجديدة (`mergeConflictRecoveryLists` & `sanitizeLosingValueForConflictRecovery`):**
   - دمج السجلات المتطابقة في `(userId, scopeId, losingOperationId, losingDigest)` مع الحفاظ التام على جميع السجلات الفريدة غير المحلولة (`status: 'unresolved'`).
   - تجريد المصفوفات الفرعية المتداخلة من نسخة المرشح الخاسر على مستوى رأس المادة/القسم، وحذف `_canonicalGeomOrdinal` المؤقت من نسخ الضربات المتعارضة.
4. **الحفظ المتين لشواهد الحذف (Durable Tombstone Persistence — الحالات الأربع A وB وC وD):**
   - **الحالة A (نجاح `localStorage` و`IndexedDB`):** إتمام الحذف وتخزين شاهد القبر في المخزنين.
   - **الحالة B (فشل `localStorage` بـ `QuotaExceededError` ونجاح `IndexedDB` بعد `tx.oncomplete`):** اعتماد الحفظ المتين في `workspace_state` (نطاق `'tombstones'`)، وإتمام حذف القسم أو المحاضرة أو المادة، وتسجيل اتساخ مساحة العمل في `cloud_sync_journal`، وإطلاق `migrateConflictRecoveryToIDB` في الخلفية لتحرير مساحة `localStorage`.
   - **الحالتان C وD (فشل أو إجهاض `localStorage` و`IndexedDB` معاً):** إجهاض العملية فوراً (Fail-Closed)، والتراجع الكامل عن شواهد القبر المؤقتة والعدادات السببية ومصفوفات الكيانات (`rollbackDurable`)، والحفاظ على القسم/المحاضرة/المادة وجميع بياناتها دون مساس، وعرض تنبيه عربي صريح للمستخدم.
   - **منع الانبعاث بعد إعادة التحميل والمزامنة (Non-Resurrection Guarantee):** دمج شواهد القبر المحفوظة في IndexedDB عند بدء التشغيل (`migrateAndHydrateWorkspaceFromIDB`) وعند الدمج السحابي (`mergeAndApplyCloudConflict`, `pushWorkspaceToCloud`, `applyCloudWorkspacePayload`) لضمان عدم عودة أي عنصر محذوف.

### 22.3 مصفوفة نتائج الاختبارات المحلية الفعلية فوق `196f68df6674dea7f4d2a5a59201bb10f45f16fd`

| أمر الاختبار المنفذ | البيئة ونطاق الفحص | الحالة | النتيجة الفعلية |
| :--- | :--- | :--- | :--- |
| `npm run lint` | فحص الصياغة الاستاتيكي لملفات الخادم والبناء والاختبارات | **PASSED** | `0 Errors` |
| `npm run build` | بناء وتجهيز حزمة الإنتاج (`dist/`) | **PASSED** | `Build succeeded` |
| `npm run test:static` (`node run_verification_tests.js`) | فحوصات التشفير PBKDF2 والأمان الثابت و`sw.js` | **PASSED** | **54/54 (100%)** |
| `node run_comprehensive_verification.js` | التحقق الشامل من المنطق الأكاديمي | **PASSED** | **42/42 (100%)** |
| `node test_phase3_cross_account_isolation.js` | عزل الحسابات وسلامة السجلات | **PASSED** | **52/52 (100%)** |
| `node test_phase4_regressions.js` | اختبارات الانحدار الشاملة + `P0-R23.1` إلى `P0-R23.7` | **PASSED** | **304/304 (100%)** |
| `npm run test:pglite` (`node test_phase4_2_postgres_integration.js`) | توافق PostgreSQL المدمج وRLS والـ OCC | **PASSED** | **41/41 (100%)** |
| `npm run test:e2e` (`node test_phase4_1_chromium_e2e.js`) | متصفح Chromium الحقيقي (شاملة `Test HH.1`–`HH.7` تحت ضغط ~5 MiB) | **PASSED** | **135/135 (100%)** |
| `npm run test:pg16` (`node test_phase4_2_1_pg16_concurrency.js`) | خادم PostgreSQL 16 الحقيقي متعدد الاتصالات | **NOT RUN** محلياً | `0/0` محلياً (`ECONNREFUSED 127.0.0.1:5432` — يتطلب خدمة PostgreSQL 16 في GitHub Actions CI؛ اجتاز **96/96 PASSED** على خط الأساس `196f68df6674dea7f4d2a5a59201bb10f45f16fd` ولم يتغير أي ملف SQL) |
| **إجمالي الفحوصات المنفذة محلياً** | **مجموع الفحوصات الفعلية المجتازة محلياً** | **PASSED** | **628/628 (100%)** |

---

## 23. التحقق النهائي واعتماد CI لتمريرة P0.1 (EXO — P0.1 Durable Conflict Recovery & Atomic Deletion Rollback Hardening)

### 23.1 خط الأساس وبيانات التحقق في GitHub Actions
- **المستودع والفرع:** `JemistryMC/study-hub` (`main`)
- **خط الأساس السابق:** `10a5d5ba55255956653e17de3ca3da4f671c7fa2`
- **Commit المصدري المرفوع على GitHub (Current GitHub HEAD):** `0fba2907c375b166aeb70fe78498546a6d1c6d4b`
- **GitHub Actions CI Run #50 (`43415571477`):** **734/734 PASSED (100%)**
  - Static Security (`run_verification_tests.js`): **54/54 PASSED**
  - Comprehensive Verification (`run_comprehensive_verification.js`): **42/42 PASSED**
  - Cross-Account Isolation (`test_phase3_cross_account_isolation.js`): **52/52 PASSED**
  - Phase 4 Regressions (`test_phase4_regressions.js` شاملة `P0-R24.1`–`P0-R24.6`): **310/310 PASSED**
  - Embedded PGlite (`test_phase4_2_postgres_integration.js`): **41/41 PASSED**
  - Real PostgreSQL 16 (`test_phase4_2_1_pg16_concurrency.js`): **96/96 PASSED**
  - Real Chromium E2E (`test_phase4_1_chromium_e2e.js` شاملة `Test II.1`–`Test II.4`): **139/139 PASSED**
- **GitHub Pages Deployment Run #124 (`43415570728`):** **SUCCESS** (`https://jemistrymc.github.io/study-hub/`)
- **الاختبارات المحلية المسجلة للتمريرة عند `0fba2907`:** **638/638 PASSED** محلياً (لم يُشغّل PostgreSQL 16 محلياً؛ ونفذه GitHub CI Run #50 بنجاح `96/96`).

### 23.2 نطاق التنفيذ المحقق في المراجعة الهندسية النهائية للكود المصدري (`index.html` والاختبارات)
1. **P0-A — متانة سجل التعافي وتسلسل الكتابة (`migrateConflictRecoveryToIDB`, `_runMigrateConflictRecoveryToIDB`, `recordConflictRecoveryCandidate`, `persistConflictRecoveryRecordsList`, `flushPendingConflictRecoveryWrites`):**
   - تسلسل عمليات الترحيل والكتابة لكل حساب via `conflictRecoveryQueueByUid`.
   - منع كتابة أو تحديث مؤشر `pharmaConflictRecovery_<uid>` في `localStorage` قبل اكتمال `tx.oncomplete` والقراءة العكسية في `readonly` والتحقق من عدد السجلات و`byteLength` وتجزئة `SHA-256` وحالة `COMMITTED`.
   - التحقق الصارم من سلامة المؤشر عند التهيئة والاستعادة عند أي عدم تطابق (`pointer_count_mismatch` / `pointer_sha256_mismatch` / `idb_record_missing_for_pointer`).
   - التحقق التنفيذي في `P0-R24.2`, `P0-R24.3`, `Test II.1`, `Test II.2`.
2. **P0-B — الضغط غير المدمّر لـ LocalStorage (`compactAccountAndScheduleConflictRecoveryInLS` و`migrateAndHydrateWorkspaceFromIDB`):**
   - حفظ النسخ الأصلية في `workspace_state` (`compaction_staging`, `phase: 'STAGING'`) قبل لمس `localStorage`.
   - استبدال مباشر بـ `localStorage.setItem` دون أي استدعاء لـ `removeItem()` على المفاتيح المحمية، والتحقق من حقول مساحة العمل والجدول واستعادة النص الأصلي عند أي فشل كتابة أو فساد قراءة.
   - التعافي التلقائي من مرحلة `STAGING` المتوقفة بعد إعادة تحميل المتصفح.
   - التحقق التنفيذي في `P0-R24.4` و`Test II.3`.
3. **P0-C — التراجع المتين القابل للتحقق عن شواهد الحذف (`recordTombstonesAtomicBatch`, `rollbackDurable`, `confirmEntityCommit`, `triggerDeleteSubject`, `triggerDeleteGroup`, `triggerDeleteLecture`, `migrateAndHydrateWorkspaceFromIDB`):**
   - تسجيل `pendingDeleteTx` (`phase: 'PENDING_ENTITY_COMMIT'`) وإتاحة `rollbackDurable()` و`confirmEntityCommit()`.
   - التحقق من استعادة `localStorage` و`IndexedDB` عبر قراءة عكسية فعلية (`readWorkspaceDomainFromIDB`) وإرجاع `{ ok, verified, localStorageRestored, idbRestored, recoverableFailClosed }` صراحةً عند فشل التراجع دون ابتلاع الخطأ.
   - شفاء شواهد الحذف غير المثبتة (`pendingDeleteTx`) تلقائياً عند إعادة التحميل وقبل المزامنة السحابية حتى لا يختفي عنصر مرئي لم يُحذف.
   - التحقق التنفيذي في `P0-R24.5`, `P0-R24.6`, `Test II.4`.
4. **P0-D — الحفاظ الكامل على حمولة التعافي الفرعية (`canonicalizeRecoveryValueForDigest`, `sanitizeRecordItem`, `mergeConflictRecoveryLists`):**
   - الحفاظ على `groups` و`lectures` و`wirdLogs` و`continuousLogs` كاملة داخل `losingValue` مع إزالة الحقول العابرة فقط (`_needsCausalStamp`, `_canonicalGeomOrdinal`)، وحساب البصمة الدلالية تكرارياً لمنع الدمج الخاطئ للسجلات المتطابقة جذرياً والمختلفة فرعياً.
   - التحقق التنفيذي في `P0-R24.1` و`Test II.1`.

### 23.3 حالة المرحلة
- **الحالة الحالية:** `CI VERIFIED` على Commit `0fba2907c375b166aeb70fe78498546a6d1c6d4b` (CI Run #50 `43415571477`: `734/734 PASSED` + Pages Run #124 `43415570728`: `SUCCESS`).
- **الاعتماد النهائي (`APPROVED`):** بانتظار المراجعة والقرار النهائي من المالك.


