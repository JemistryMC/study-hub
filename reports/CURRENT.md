# Current Project Handoff

**آخر تحديث:** 2026-11-06  
**المستودع:** `JemistryMC/study-hub`  
**الفرع النشط:** `main`  
**الحالة:** `IMPLEMENTED — LOCAL TESTS ONLY (IN PROGRESS — NOT APPROVED)`

هذا الملف هو المرجع الوحيد للحالة الحالية والمرحلة النشطة. إذا خالفه تقرير تاريخي أو تعليمات مرحلة قديمة، يُتبع هذا الملف ومستند المرحلة النشطة.

---

## 1. هوية المستودع وخطوط الأساس المعتمدة

- **المستودع المعتمد:** `JemistryMC/study-hub`
- **فرع العمل المعتاد:** `main`
- **نقطة البداية الدقيقة لعملية الإغلاق والتنفيذ الحالية (Starting HEAD):**  
  `fb93a920fe006279e2c51eab708219b9b7566f70`
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

## 7. نتائج الاختبارات المعتمدة محلياً (Local Test Execution Summary — M6 Critical Corrective Pass)

تم تشغيل والتحقق من كافة مجموعات الاختبارات بنسبة نجاح 100% بعد تنفيذ التمريرة التصحيحية الحرجة (M6 Critical Corrective Pass):

| مسار الاختبار | الأمر المنفذ | النتيجة الفعلية | الملاحظات |
| :--- | :--- | :--- | :--- |
| **فحص الصياغة والقواعد** | `npm run lint` | **PASSED** | فحص كافة ملفات الخادم والبناء والاختبارات دون أخطاء صياغية. |
| **بناء الإنتاج والتجميع** | `npm run build` | **PASSED** | نسخ الأصول وتجهيز حزمة الإنتاج وتجميع التطبيق بنجاح. |
| **الأمان والتشفير الثابت** | `npm run test:static` | **54/54 PASSED** | اختبارات PBKDF2 والتحقق من الأمان الثابت وتجريد الأسرار. |
| **عزل الحسابات والذاكرة** | `node test_phase3_cross_account_isolation.js` | **52/52 PASSED** | التحقق من عزل الحسابات ولحظات IndexedDB المجردة. |
| **الانحدار والمنطق اللاتزامني** | `node test_phase4_regressions.js` | **155/155 PASSED** | شاملة 11 فحصاً لـ M5-B و21 فحصاً لـ M6 (فحوصات التجزئة، البايتات، النطاقات المطلوبة، السجل المتين، الحجر الصحي). |
| **التحقق الشامل** | `node run_comprehensive_verification.js` | **42/42 PASSED** | اختبارات المنطق الأكاديمي والتحقق الشامل. |
| **مكتبة PGlite WASM** | `npm run test:pglite` | **41/41 PASSED** | توافق استعلامات ودوال PostgreSQL عبر محاكي WASM. |
| **المتصفح الحقيقي Chromium E2E** | `node test_phase4_1_chromium_e2e.js` | **81/81 PASSED** | شاملة سيناريوهات M5-B (Test X) وسيناريوهات M6 الموسعة (Test Y.1–Y.7 عبر الانهيار والحجر وحجب المزامنة). |
| **مشغل الاختبارات الموحد** | `node run_all_tests.js` | **425/425 PASSED** | إجمالي الفحوصات المدمجة المنفذة محلياً بنجاح تام (100% Success). |
| **حزمة قياس الأداء Tier A** | `node benchmark_tier_a.js` | **5/5 TIERS PASSED** | قياس أداء النسخ والاستعادة لحمولات 1، 5، 15، 25، 50 ميجابايت بنجاح تام. |

*(ملاحظة: `test_phase4_2_1_pg16_concurrency.js` مخصص لبيئة CI مع خادم PostgreSQL 16 حقيقي متعدد الاتصالات، ومتوقع اجتيازه 96 فحصاً إضافياً في CI ليصل إجمالي تشغيل CI المتوقع إلى 521 فحصاً).*

---

## 8. تفاصيل التمريرة التصحيحية الحرجة (M6 Critical Corrective Pass Details)

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
   - جعل `annotation_recovery_vault` في IndexedDB هو المصدر الوحيد لحالة ومراحل المعاملة: `PREPARE`, `APPLY_IDB`, `APPLY_LOCALSTORAGE`, `COMMITTED`, `FINALIZE`.
   - التقاط لقطة تجميدية لكافة مفاتيح LocalStorage الاثني عشر وحواشي IndexedDB السابقة مع بيانات السجلات المستهدفة.
   - إنشاء حاجز العمليات `pharmaImportBarrier_<uid>`.
   - تراجع دقيق في `rollbackImportFromJournal` واستعادة الحالة السابقة وحذف السجلات الجديدة المستوردة.
   - عند فشل التراجع، الانتقال فوراً إلى `ROLLBACK_FAILED_QUARANTINE` وتفعيل الحجر الصحي.
   - في `recoverPendingImportJournalIfNeeded`: قراءة السجل مباشرة من IndexedDB؛ وجود مؤشر دون سجل يؤدي للحجر فورا؛ وجود سجل تالف يؤدي للحجر؛ مرحلة `COMMITTED` تُثبت وتُنهى؛ ما قبل `COMMITTED` يتراجع بأمان.
   - حجب فوري حاسم (Fail-Closed) لأي محاولة رفع أو سحب سحابي (`pushWorkspaceToCloud`, `pullWorkspaceFromCloud`, `syncWorkspaceOnLogin`) عند وجود حاجز استيراد أو حجر نشط.
5. **فحوصات الانهيار في المتصفح الحقيقي (Strict Fix E - Real Chromium Fault Injections):**
   - سيناريوهات Test Y.5 وY.6 وY.7 في Chromium E2E تتحقق بنجاح 100% من تعافي مراحل ما قبل وما بعد `COMMITTED`، وحجر السجلات التالفة أو المفقودة، وحجب المزامنة السحابية أثناء الحجر.
6. **حزمة قياس الأداء (Strict Fix F - Benchmark Tier A):**
   - إضافة الملف المستقل والمكرر `/benchmark_tier_a.js` واختبار الحمولات 1، 5، 15، 25، 50 ميجابايت.
7. **تدقيق تشخيص أخطاء Supabase (Strict Fix G - WP-8 Diagnostics Refinement):**
   - تدقيق `classifySupabaseError` لاشتراط سياق الشبكة قبل تصنيف `offline` واشتراط سياق الدوال والوسائط قبل تصنيف `function_signature_mismatch`.

---

## 9. سياسة المنتج الدائمة (Free vs VIP)

- **Annotated PDF Export:** مجاني 100% لمستخدمي Free وVIP.
- **Extra Note Sheet:** مجاني 100% لمستخدمي Free وVIP مع إمكانية إنشاء عدة أوراق ملاحظات.
- **النسخ الاحتياطي والاستعادة القياسية (WP-7 JSON Backup & Restore):** مجاني 100% لكافة المستخدمين.
- **VIP:** استحقاق يدوي حصري عبر تغيير `can_upload_media` في `public.user_workspaces` لرفع وسائط Google Drive والميزات الإضافية المعتمدة من المالك.
- **حدود الصلاحيات:** لم يُجرَ أي دفع أو مزامنة لـ GitHub، والتغييرات بانتظار مراجعة المالك المستقلة.

