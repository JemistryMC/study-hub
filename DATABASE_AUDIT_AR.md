# تقرير المراجعة الهندسية والأمنية الشاملة لمنصة Exo — Phase 4.1

## نطاق المراجعة والتنفيذ (Phase 4.1)
يغطي هذا التقرير المراجعة الهندسية الثابتة والديناميكية وتنفيذ تحديثات **Exo Phase 4.1** الكاملة لعزل الحسابات، ومنع سباقات التزامن (`Race Conditions`)، وضمان سلامة معاملات `IndexedDB`، وتأمين قواعد بيانات وسياسات `Supabase`:

### هيكل ملفات قاعدة البيانات المنظم (`supabase/`):
تم تنظيم جميع ملفات قاعدة البيانات والـ Migrations في المسارات القياسية لـ Supabase CLI مع إزالة النسخ المكررة من الجذر:
- `supabase/config.toml` — إعدادات مشروع Supabase المحلية والـ Auth والـ Storage.
- `supabase/schema.sql` — المخطط المرجعي الكامل للقاعدة.
- `supabase/migrations/20261103133622_remote_schema.sql` — مخطط القاعدة الأساسي (Baseline Migration).
- `supabase/migrations/20261103140000_fix_security_and_privileges.sql` — ترقية الأمان، تقليل الصلاحيات، التحقق التفاؤلي من التزامن (`Optimistic Concurrency Control`)، وإصلاح سياسات `Storage`.
- `supabase/rollbacks/20261103140000_rollback_fix_security_and_privileges.sql` — ملف التراجع المعزول خارج مجلد `migrations/` لضمان عدم تنفيذه تلقائيًا أثناء `supabase db push`.

---

## القسم الأول: إصلاحات Phase 4.1 الحرجة في الواجهة (`index.html`) وعزل الحسابات

### 1. P0 — سياق العملية غير القابل للتغيير (`Account Operation Context`) ومنع سباقات تبديل الحسابات
- **المشكلة السابقة**: كانت الدوال غير المتزامنة (`syncWorkspaceOnLogin`, `pullWorkspaceFromCloud`, `pullWorkspaceFromCloudIfNewer`, `applyCloudWorkspacePayload`, `mergeAndApplyCloudConflict`, `pushWorkspaceToCloud`, `getAllAnnotationsMapFromDB`, `restoreAllAnnotationsMapToDB`) تعتمد على المتغير العام المتغير `currentCloudUser` بعد نقاط الانتظار `await`. عند تبديل الحساب من A إلى B أثناء انتظار الشبكة أو القرص، كانت استجابة A المتأخرة تطبق بياناتها داخل مساحة عمل B.
- **الإصلاح المنفذ في Phase 4.1**:
  - إنشاء عداد حقبة جلسة متزايد (`currentSessionGeneration`) يتم رفعه عبر `bumpAccountSessionGeneration()` عند كل تغيير في حالة المصادقة.
  - إنشاء كائن سياق غير قابل للتعديل `createAccountOperationContext(explicitUid, explicitGen)` يعيد `{ uid, sanitizedUid, generation, sessionEpoch, authorized, ok, error, isCurrent() }` عبر `Object.freeze`.
  - التحقق الصارم من `ctx.isCurrent()` قبل وبعد كل عملية `await` وفي حال تبدل الحساب تتوقف العملية فورًا (`{ status: 'aborted', reason: 'account_switched' }`) دون المساس بـ `IndexedDB` أو `inMemoryAnnotationsCache` أو `localStorage` أو عناصر الواجهة.

### 2. P0 — توحيد عقد الإرجاع الصريح (`Explicit Result Contract`) في `getAllAnnotationsMapFromDB()`
- **المشكلة السابقة**: كانت الدالة تعيد كائنًا فارغًا `{}` عند فشل قراءة `IndexedDB`، ما قد يوهم `pushWorkspaceToCloud()` بأن المستخدم ليس لديه تعليقات فيرفع خريطة فارغة إلى السحابة.
- **الإصلاح المنفذ في Phase 4.1**:
  - تعيد الدالة دائمًا `{ ok: true, verifiedMap: {...}, quarantined: [...] }` عند النجاح، أو `{ ok: false, error: { code, message } }` عند أي خطأ (`DB_NOT_INITIALIZED`, `UNAUTHORIZED_TARGET_USER`, `ACCOUNT_CONTEXT_EXPIRED`, `IDB_READ_ERROR`, `IDB_TX_ABORTED`).
  - جميع المستدعين (`pushWorkspaceToCloud`, `mergeAndApplyCloudConflict`, `handleCloudSignOut`) يوقفون التنفيذ فورًا إذا كان `!annoRes.ok`.

### 3. P0 — الملكية المزدوجة الصارمة (`Strict Dual Ownership`) ورفض المفاتيح الأجنبية (`Foreign Key Rejection`)
- **الإصلاح المنفذ في Phase 4.1**:
  - التحقق من مفتاح الإدخال عبر `resolveAuthorizedScopedKey(inputKeyOrRawId, canonicalUid)` و`toScopedKey()` **قبل** استخراج المعرف الخام، ورمي خطأ `CROSS_ACCOUNT_KEY_VIOLATION` فورًا إذا كان المفتاح يبدأ ببادئة حساب آخر (`usr_B::123` أثناء نشاط الحساب A).
  - فرض `hasStrictDualRecordOwnership(item, canonicalUid)` في جميع عمليات القراءة والتصدير والاستعادة، بحيث يُشترط تطابق البادئة `usr_<sanitizedUid>::` وتطابق الحقل الصريح غير الفارغ `item.userId === canonicalUid`. أي سجل يفتقر إلى `userId` أو يحمل `userId` متعارضًا يتم عزله (`Quarantined`).

### 4. P0 — عزل السجلات القديمة مجهولة المصدر (`Provenance-Verified Legacy Migration`)
- **الإصلاح المنفذ في Phase 4.1**:
  - إزالة الاعتماد على `isLectureInActiveUserWorkspace()` أثناء ترحيل السجلات القديمة، لأن أرقام المحاضرات (`101`، `1`) تتشابه بين الطلاب.
  - قصر الترحيل في `claimAndMigrateLegacyRecords()` عبر `hasVerifiedLegacyProvenance()` على السجلات التي تحتوي على إثبات ملكية صريح (`item.userId === canonicalUid` أو `item.ownerUid === canonicalUid`) مع إبقاء السجلات المجهولة في العزل (`quarantined`).

### 5. P1 — متانة معاملات خزنة الاستعادة (`Two-Phase Recovery Vault Durability`)
- **الإصلاح المنفذ في Phase 4.1**:
  - في `flushPendingAnnotationsSave()` / `flushAnnotationsToDBImmediate()`:
    1. كتابة السجلات إلى `annotation_recovery_vault` وانتظار `vTx.oncomplete`؛ وإذا فشلت المعاملة تعيد الدالة `false` فورًا.
    2. كتابة السجلات إلى مخزن `annotations` الأساسي وانتظار `tx.oncomplete`؛ وإذا فشلت تظل البيانات محفوظة في `annotation_recovery_vault` للاستعادة التلقائية عند إعادة التشغيل وتعيد `false`.
    3. تحديث `inMemoryAnnotationsCache` فقط بعد التزام `tx.oncomplete` وبشرط `ctx.isCurrent()`.
    4. حذف المفاتيح الملتزمة فقط من `annotation_recovery_vault` دون استخدام `vStore.clear()` لحماية سجلات أي حساب آخر.

---

## القسم الثاني: مراجعة قاعدة البيانات وسياسات Supabase وتصحيحاتها

### 1. P0/P1 — سياسات رفع Storage وقيد VIP (`lecture_media`)
- في المخطط الأولي كانت توجد سياستان من نوع `INSERT` على `storage.objects` للـ bucket المسمى `lecture_media`، وبما أن سياسات PostgreSQL الافتراضية `PERMISSIVE` تُجمع بمنطق `OR`، كانت السياسة العامة تسمح بتجاوز شرط `can_upload_media = true`.
- **التصحيح في `20261103140000_fix_security_and_privileges.sql`**:
  - جعل الـ bucket `lecture_media` خاصًا (`public = false`) مع تقييد الحجم (`52428800` بايت) وأنواع الملفات المسموحة (`application/pdf`, `audio/*`).
  - حذف السياسة المتساهلة والإبقاء على سياسة تحقق صارمة تشترط ملكية المجلد (`(storage.foldername(name))[1] = auth.uid()::text`) وتفعيل `can_upload_media = true` في `public.user_workspaces`.

### 2. P1 — تقليص صلاحيات الجدول (`Principle of Least Privilege`)
- تم سحب الصلاحيات الخطرة (`TRUNCATE`, `DELETE`, `REFERENCES`, `TRIGGER`, `MAINTAIN`) من الأدوار `anon` و`authenticated` على `public.user_workspaces`، وحصر صلاحية `authenticated` في `SELECT, INSERT, UPDATE` الخاضعة لسياسات RLS، وسحب الصلاحيات الافتراضية المستقبلية (`ALTER DEFAULT PRIVILEGES ... REVOKE ALL`).

### 3. P1 — التزامن التفاؤلي (`Optimistic Concurrency Control`) وختم الوقت الخادمي
- إضافة العمود `sync_version integer NOT NULL DEFAULT 1` إلى `public.user_workspaces`.
- إنشاء الدالة والـ Trigger `public.enforce_workspace_sync_and_timestamp()` ببيئة آمنة (`SECURITY DEFINER SET search_path = public, pg_temp`) لفرض:
  - تعيين `NEW.updated_at := now()` من ساعة الخادم.
  - زيادة `NEW.sync_version := OLD.sync_version + 1` تلقائيًا عند كل تحديث.
- في الواجهة (`pushWorkspaceToCloud`) يتم التحديث بشرط `.eq('sync_version', expectedVersion)` وعند حدوث تعارض (`PGRST116` / `409`) يتم استدعاء `mergeAndApplyCloudConflict(cloudRow, opCtx)` بأمان.

---

## القسم الثالث: المصادر والمراجع التقنية المعتمدة (Phase 4.1 Technical Sources)

1. **معيار W3C لقاعدة البيانات المفهرسة (W3C Indexed Database API 3.0 — Transaction Lifetime & Durability)**:
   - المرجع الرسمي لدورة حياة المعاملات وشروط التزام `oncomplete` مقابل `onabort`:
   - `https://www.w3.org/TR/IndexedDB-3/#transaction-lifetime-concept`
2. **توثيق MDN Web Docs — ضمانات اكتمال معاملات IndexedDB (`IDBTransaction.oncomplete`)**:
   - يثبت أن نجاح طلب `store.put()` لا يعني كتابة البيانات على القرص حتى يكتمل حدث `transaction.oncomplete`:
   - `https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event`
3. **توثيق PostgreSQL 16 الرسمي — سياسات أمان الصفوف (Row Security Policies & Permissive OR Combination)**:
   - يوضح أن سياسات `PERMISSIVE` المتعددة تُجمع بمنطق `OR` وأن صلاحيات `TRUNCATE` و`REFERENCES` لا تخضع لـ RLS:
   - `https://www.postgresql.org/docs/current/ddl-rowsecurity.html`
4. **توثيق PostgreSQL 16 الرسمي — كتابة دوال `SECURITY DEFINER` بأمان (`search_path` Hardening)**:
   - يفرض تثبيت `SET search_path = public, pg_temp` لمنع اختطاف الكائنات:
   - `https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY`
5. **توثيق Supabase الرسمي — التحكم في الوصول إلى التخزين السحابي (Supabase Storage Access Control & RLS)**:
   - قواعد عزل مجلدات المستخدمين عبر `storage.foldername(name)` و`auth.uid()`:
   - `https://supabase.com/docs/guides/storage/security/access-control`
6. **توثيق PostgREST الرسمي — رموز الأخطاء والتحقق التفاؤلي (`PGRST116` Cardinality Violation)**:
   - آلية اكتشاف تعارض الإصدارات عند تحديث صف واحد بشرط `.eq('sync_version', expectedVersion).single()`:
   - `https://postgrest.org/en/stable/references/errors.html`
7. **معيار OWASP للتحقق من أمان التطبيقات (OWASP ASVS v4.0.3 — Session Management & Multi-Tenant Client Storage Isolation)**:
   - ضوابط عزل جلسات المستخدمين ومنع تسرب البيانات المحلية بين الحسابات المتعاقبة على نفس المتصفح:
   - `https://owasp.org/www-project-application-security-verification-standard/`
8. **المعهد الوطني للمعايير والتقنية (NIST SP 800-132 — Recommendation for Password-Based Key Derivation)**:
   - معيار اشتقاق مفاتيح كلمات المرور باستخدام `PBKDF2-HMAC-SHA256` مع الملح العشوائي (`Salt`) و100,000 تكرار:
   - `https://csrc.nist.gov/publications/detail/sp/800-132/final`
