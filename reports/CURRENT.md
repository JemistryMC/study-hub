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
- **خط الأساس الأصلي لـ M5-B (Parent Baseline):**  
  `ab44f08bcf97328b1583d5bdd8a85943d4dbe079`
- **نقطة البداية الدقيقة لعملية الإصلاح الحالية (Exact Starting HEAD):**  
  `7b2304f4e653dff931e2c8cab9c768fad2279b69`
- **المرجع المعتمد لنهائيات M5-A (Frozen Dependency):**  
  GitHub Actions CI Run #29 (Run ID: `42117460988`, Source SHA: `ab44f08bcf97328b1583d5bdd8a85943d4dbe079`) — **463/463 PASSED (100% SUCCESS)**. سلوكيات الحجر الصحي (Quarantine) وفصل الحسابات واستعادة IndexedDB لـ M5-A مجمدة ولم تُضعف أو يُعاد تصميمها.
- **تشغيل CI السابق لـ M5-B (Run #30 - فاشل):**  
  GitHub Actions Run #30 (Run ID: `42123495932`, Source SHA: `7b2304f4e653dff931e2c8cab9c768fad2279b69`).  
  النتيجة: FAILED في خطوة `Unit & Asynchronous Logic Isolation` بالخطأ:  
  `TypeError: Cannot read properties of undefined (reading 'get') at test_phase3_cross_account_isolation.js:847:34`.
- **الفروع المرجعية:**
  - `Deploying`: مرجع تاريخي لخط أساس سابق، وليس فرع العمل الحالي.
  - `backup/pre-gemini-security-2026-11-04`: نقطة استرجاع محمية؛ لا تُحذف ولا تُعدّل.

---

## 2. التحليل الجذري لفشل CI Run #30 والإصلاح المنفذ

### 2.1 السبب الجذري (Root Cause)
في الكوميت `7b2304f4e653dff931e2c8cab9c768fad2279b69`، عُدّلت توكيدات Test A في `test_phase3_cross_account_isolation.js` للتحقق من حفظ الحواشي في IndexedDB بدلاً من LocalStorage. لكن استُدعي `idb.records.get(...)` بينما فئة `InMemoryIDBDatabase` تعرّف مخازنها كـ `Map` تحت:
- `idb.stores.annotations`
- `idb.stores.annotation_recovery_vault`
- `idb.stores.pdfs`
- `idb.stores.audios`
وليس لديها خاصية باسم `idb.records`، مما أدى إلى انهيار بيئة الاختبار بـ `TypeError` فوري وتخطي باقي الفحوصات في CI. كما كانت بنية السجل تتوقع فحص `idbRecordA[1]` بدلاً من `idbRecordA.pages['1']`، وكان Test D.1 وTest D.3 يتوقعان بقاء الحواشي القديمة في LocalStorage بعد التحول إلى لقطات البيانات الوصفية المجردة.

### 2.2 الإصلاح المطبق بدقة (Targeted Repair)
1. استبدال `idb.records.get(...)` بـ `idb.stores.annotations.get(...)` للوصول الصحيح لمخزن الحواشي.
2. التحقق من كائن السجل المخزن عبر الحقل الفعلي `record.pages['1']` أو `record.pages[1]`.
3. تحديث توكيدات Test D.1 وTest D.3 لتعكس بنية F-05:
   - لقطة الحساب في LocalStorage مجردة وتحتوي `annotationsStoredInIndexedDB: true` بدون حقل `annotations`.
   - بيانات الحواشي الفعلية محفوظة وسليمة في `idb.stores.annotations`.
4. استخراج دالة `migrateLegacyAccountAnnotationsToIDB` ضمن دوال المساعدة لـ `test_phase3_cross_account_isolation.js` لضمان تكامل دورة حياة الجلسات.

---

## 3. التدقيق الهندسي الشامل لـ F-05 وN-02

### 3.1 معمارية لقطات الحساب المجردة (F-05 Metadata-Only Snapshots)
تم تدقيق وتأكيد سلامة جميع كتابات لقطة الحساب في `index.html`:
1. `handleCloudSignOut()`: يفرغ الحواشي المعلقة أولاً، ويقرأ الحواشي من IndexedDB للتحقق من سلامتها، ثم يكتب `pharmaAccountWorkspace_<uid>` مجردة من `annotations` مع وسم `annotationsStoredInIndexedDB: true`. إذا فشلت قراءة الحواشي أو فشلت كتابة اللقطة، يُجهض تسجيل الخروج fail-closed ولا تُمسح بيانات الذاكرة.
2. `pushWorkspaceToCloud()`: يرسل الحواشي في حمولة الشبكة إلى RPC، ويكتب لقطة مجردة في LocalStorage. تم ربط وسم `annotationsStoredInIndexedDB: true` بالتحقق الإيجابي المسبق من IndexedDB، وتتبع نجاح حفظ اللقطة عبر `accountSnapshotPersisted` بحيث لا تُمسح علامة `pharmaWorkspaceDirty` في حال حدوث `QuotaExceededError`.
3. `handleAuthSessionChange()`: عند تبديل الحساب، يفرغ الحواشي المعلقة، ويتحقق من قراءة حواشي المستخدم المغادر من IndexedDB، ويكتب لقطة مجردة في LocalStorage مع معالجة آمنة لامتلاء السعة دون مسح البيانات.
4. `syncWorkspaceOnLogin()`: يحفظ لقطة المستخدم المغادر بصيغة مجردة مع التحقق الإيجابي قبل تفعيل الحساب الجديد.
5. `mergeAndApplyCloudConflict()`: يدمج الحواشي محلياً وسحابياً، ويلتزم بها في IndexedDB عبر `restoreAllAnnotationsMapToDB` أولاً، ثم يكتب لقطة الحساب المجردة في LocalStorage.
6. لا يتم حفظ نسخة كاملة من الحواشي تحت أي مفتاح جديد في LocalStorage.

### 3.2 تصحيح ترقية الحسابات القديمة (Legacy Migration Audit)
تم تدقيق دالة `migrateLegacyAccountAnnotationsToIDB()` وتصحيحها وفق الشروط الصارمة:
1. **التحقق المزدوج من الهوية:** رفض أي لقطة تحمل `user_id` مخالف لمعرّف الحساب النشط برمز `CROSS_ACCOUNT_SNAPSHOT_VIOLATION`.
2. **التحقق الإيجابي الإلزامي من IndexedDB:** لا تُوضع علامة `annotationsStoredInIndexedDB: true` في اللقطات الفارغة أو الخالية من الحواشي بمجرد غياب الحقل؛ بل يتم التحقق الإيجابي من إمكانية قراءة IndexedDB للحساب (`getAllAnnotationsMapFromDB`)، وإذا تعذرت القراءة يُجهض الإجراء fail-closed دون وسم اللقطة كمهاجرة.
3. **التحقق بعد القراءة (Read-Back Verification):** بعد التزام الحواشي القديمة في IndexedDB، يتم قراءتها مجدداً ومطابقة وجود كافة المفاتيح غير الإعلامية.
4. **حماية اللقطة القديمة وتفادي التكرار:** لا يُحذف حقل `annotations` القديم ولا توضع العلامة إلا بعد نجاح التخزين وقراءة التحقق ونجاح حفظ LocalStorage.
5. **معالجة المستدعين:** تم ربط استدعاء الهجرة في `syncWorkspaceOnLogin` و`pullWorkspaceFromCloud` بالحالات التي تفتقر لعلامة التحقق أو تحتوي على حواشٍ قديمة، مع تمرير الأخطاء وحماية dirty state.

### 3.3 سلامة عداد النسخ والإرسال السحابي (N-02 Mutation-Version Integrity)
1. **عداد نسخي موحد:** اعتماد `annotationMutationSeq` كعداد مركزي وحيد لحركات الحواشي المحلية.
2. **تغطية مسارات التعديل الحقيقية:** كل تعديل محلي يقوم به المستخدم (رسم الحبر، الممحاة، حذف المقاطع، التراجع، الإعادة، مسح الصفحة، إضافة/تعديل/حذف الملاحظات النصية، إضافة/حذف الدبابيس الصوتية، أوراق الملاحظات الإضافية، إخفاء/استعادة الصفحات) يمر عبر `saveAnnotationsToDB` ويستدعي `bumpAnnotationMutationVersion()` لزيادة العداد أحادياً وتعيين `dirtyAnnotationsForCloud = true`.
3. **استثناء العمليات التلقائية:** تفريغ الحواشي إلى IndexedDB (`flushPendingAnnotationsSave`) والاسترداد السحابي لا يزيدان العداد.
4. **حماية التزامن أثناء الإرسال السحابي (In-Flight Push Race Protection):** عند بدء الإرسال، يتم التقاط `annoSeqAtStart`. وعند استلام تأكيد الخادم، يُفحص `annotationMutationSeq`؛ إذا طرأ أي تعديل أثناء انتظار الشبكة (`currentAnnoSeqNow !== annoSeqAtStart`) تظل علامة `dirtyAnnotationsForCloud` و`pharmaWorkspaceDirty` مفعلة ولا تُمسح.
5. **إلغاء النقطة العمياء لتقطيع التجزئة:** إثبات عجز تجزئة العينات ذات الـ512 خطوة (`computeFastStringSignature`) عن اكتشاف تعديل حرف واحد في حمولة 100 كيلوبايت، واعتماد دالة التجزئة الكاملة `computeFullStringHash` التي تفحص كامل السلسلة دون نقاط عمياء.

---

## 4. قياسات الأداء الفعلية الموثقة (Local Benchmarks)

أُجريت اختبارات الأداء الميدانية على بيئة التشغيل الحقيقية دون أرقام تقديرية:
- **البيئة:** `Linux x64`, Node.js `v22.23.2`, V8 Engine.
- **الحمولة التمثيلية:** محاضرة 50 صفحة تحتوي على 600 ضربة قلم/هايلايتر/ملاحظات نصية وبيانات وصفية سببية (~12 ضربة لكل صفحة بمتوسط 25 نقطة لكل ضربة).
- **حجم الحمولة المتسلسلة:** `306.58 KB` (`313,942 bytes`).
- **عدد التكرارات:** `100` دورة قياس متتالية.

### نتائج القياس:
| العملية | المتوسط (Average) | الانحراف المعياري (Std Dev) | الحد الأدنى (Min) | الحد الأقصى (Max) |
| :--- | :--- | :--- | :--- | :--- |
| **قراءة وفك الترميز (JSON.parse)** | **4.568 ms** | 1.796 ms | 3.450 ms | 10.435 ms |
| **التسلسل (JSON.stringify)** | **3.875 ms** | 0.296 ms | 3.763 ms | 6.198 ms |
| **حساب التجزئة الكاملة (computeFullStringHash)** | **0.865 ms** | 0.378 ms | 0.761 ms | 4.544 ms |
| **توليد حمولة RPC السحابية الكاملة** | **4.054 ms** | 0.451 ms | 3.805 ms | 7.604 ms |

- **إنتاجية التجزئة الكاملة (Hash Throughput):** **346.13 MB/s** (تكلفة شبه معدومة في مسار المزامنة).
- **البصمة في الذاكرة (Memory Footprint):** ~314 KB كسلسلة نصية متسلسلة، و~1.2 MB كشجرة كائنات في ذاكرة V8.

---

## 5. نتائج الاختبارات المعتمدة محلياً

تم تشغيل والتحقق من كافة مجموعات الاختبارات بنسبة نجاح 100%:

| مسار الاختبار | الأمر المنفذ | النتيجة الفعلية | الملاحظات |
| :--- | :--- | :--- | :--- |
| **فحص الصياغة والقواعد** | `npm run lint` | **PASSED** | فحص كافة ملفات الخادم والبناء والاختبارات دون أخطاء صياغية. |
| **بناء الإنتاج** | `npm run build` | **PASSED** | نسخ الأصول إلى `dist/` بنجاح. |
| **الأمان والتشفير الثابت** | `npm run test:static` | **54/54 PASSED** | اختبارات PBKDF2 والتحقق من الأمان الثابت. |
| **عزل الحسابات والذاكرة** | `node test_phase3_cross_account_isolation.js` | **52/52 PASSED** | إصلاح Test A وTest D.1 وTest D.3 وتأكيد العزل التام. |
| **الانحدار والمنطق اللاتزامني** | `node test_phase4_regressions.js` | **123/123 PASSED** | شاملة فحوصات Test 20 لـ M5-B وTombstones والحجر الصحي. |
| **التحقق الشامل** | `node run_comprehensive_verification.js` | **42/42 PASSED** | اختبارات المنطق الأكاديمي والتحقق الشامل. |
| **مكتبة PGlite WASM** | `npm run test:pglite` | **41/41 PASSED** | توافق استعلامات PostgreSQL عبر محاكي WASM. |
| **المتصفح الحقيقي Chromium E2E** | `npm run test:e2e` | **74/74 PASSED** | شاملة Test X.1 وX.2 وX.3 مع إعادة تحميل المتصفح. |
| **مشغل الاختبارات الموحد** | `node run_all_tests.js` | **386/386 PASSED** | إجمالي الفحوصات المدمجة المنفذة محلياً بنجاح تام. |

*(ملاحظة: `test_phase4_2_1_pg16_concurrency.js` مخصص لبيئة CI مع خادم PostgreSQL 16 خارجي، ومتوقع اجتيازه 96 فحصاً إضافياً في CI ليصل الإجمالي إلى 482 فحصاً).*

---

## 6. الملفات المعدلة ضمن النطاق المصرح به

1. `/index.html`: إحكام لقطات الحسابات المجردة، وبوابات متانة IndexedDB، والتحقق الإيجابي في الهجرة، والعداد النسخي الموحد والتجزئة الكاملة.
2. `/test_phase3_cross_account_isolation.js`: إصلاح مرجع `idb.stores.annotations` وتحديث توكيدات Test A وD.1 وD.3 واستخراج دالة الهجرة.
3. `/test_phase4_regressions.js`: تعزيز Test 20 بفحوصات الحالات الحدية للقطات الفارغة، وحقن الفشل، والعداد النسخي.
4. `/test_phase4_1_chromium_e2e.js`: إضافة Test X.3 للتحقق من صمود الحواشي في IndexedDB عبر إعادة تحميل الصفحة في Chromium الحقيقي.
5. `/reports/CURRENT.md`: توثيق الحالة، وتحليل الفشل، والقياسات، ونتائج الاختبارات.

---

## 7. سياسة المنتج الدائمة (Free vs VIP)

- **Annotated PDF Export:** مجاني 100% لمستخدمي Free وVIP.
- **Extra Note Sheet:** مجاني 100% لمستخدمي Free وVIP مع إمكانية إنشاء عدة أوراق.
- **VIP:** استحقاق يدوي عبر تغيير `can_upload_media` في `public.user_workspaces` لرفع وسائط Google Drive والميزات الخاصة المعتمدة من المالك.
- **حدود الصلاحيات:** لم يُجرَ أي دفع أو مزامنة لـ GitHub، والتغييرات بانتظار مراجعة المالك المستقلة.
