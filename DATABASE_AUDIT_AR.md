# تقرير المراجعة الهندسية والأمنية الشاملة لمنصة Exo — Phase 4.1, 4.2, 4.2.1, 4.2.2 & 4.2.3 (Forward Migration Safety & Auth Boundary)

## نطاق المراجعة والتنفيذ الفعلي
يوثق هذا التقرير النتائج والتعديلات المنفذة والمختبرة فعليًا عبر مسار التطوير الشامل (**Phase 4.1, Phase 4.2, Phase 4.2.1, Phase 4.2.2, Phase 4.2.3**) لعزل الحسابات، ومنع سباقات التزامن (`Race Conditions`)، وضمان متانة معاملات `IndexedDB`، وتأمين قواعد بيانات وسياسات `PostgreSQL / Supabase` مع التحقق من مساري النشر (التثبيت الجديد والتحديث المباشر لقواعد البيانات الحالية):
1. **اختبارات التوافق المضمنة (`Embedded PostgreSQL Compatibility Tests — PGlite WASM`)** في `test_phase4_2_postgres_integration.js`.
2. **اختبارات خادم PostgreSQL 16 الفعلي والتزامن متعدد الاتصالات ومساري النشر A وB (`Real PostgreSQL 16 Multi-Connection Concurrency, Dual-Path Parity & Unforgeable OCC`)** في `test_phase4_2_1_pg16_concurrency.js`.
3. **اختبارات المتصفح الفعلي (`Real Headless Chromium + IndexedDB v4 E2E`)** في `test_phase4_1_chromium_e2e.js`.
4. **الفحص الثابت والتشفيري الصارم (`Production PBKDF2 & Static Migration Audit`)** في `run_verification_tests.js`.

### هيكل ملفات قاعدة البيانات المنظم (`supabase/`):
- `supabase/config.toml` — إعدادات مشروع Supabase المحلية والـ Auth والـ Storage.
- `supabase/schema.sql` — المخطط النهائي الكنسي الكامل (`Canonical Final Schema`) الذي يعكس حالة قاعدة البيانات بعد تطبيق جميع الـ Migrations (بما في ذلك الدور المخصص `exo_occ_rpc_definer`، والمخطط الخاص `exo_internal.occ_active_write_context`، والعمود `revision`، والدالة `sync_workspace_with_concurrency`، ودوال الحماية، وسياسات `RLS` و`Storage`، وتقليص الصلاحيات).
- `supabase/migrations/20261103133622_remote_schema.sql` — مخطط القاعدة الأساسي الأولي (Baseline Migration، متوافق بالكامل مع PostgreSQL 16 بعد إزالة صلاحية `MAINTAIN` الخاصة بـ PostgreSQL 17+).
- `supabase/migrations/20261103140000_fix_security_and_privileges.sql` — **الهجرة التاريخية الأصلية المحفوظة بالكامل (Phase 4.2.1 Historical Reference)**: تم استرجاعها بدقة وفق مرجع الالتزام `5b8c5ab1fd2d78ec23934a6e50e0a786ac6775c9` دون أي تعديل لاحق عليها لحماية قواعد البيانات الحالية من انحراف النشر (`Deployment Drift`).
- `supabase/migrations/20261103150000_unforgeable_occ_and_role_hardening.sql` — **الهجرة الأمامية الآمنة الجديدة (Phase 4.2.3 Forward Migration)**: تحمل ختمًا زمنيًا لاحقًا وتنفذ الترقية الكاملة من تصميم GUC التاريخي إلى التصميم الجديد غير القابل للتزوير (`exo_occ_rpc_definer` + `exo_internal.occ_active_write_context`) وتعديل سياسات RLS وTriggers ونقل الملكية وإعداد الصلاحيات الافتراضية.
- `supabase/rollbacks/20261103140000_safe_rollback_concurrency_only.sql` — **البديل الآمن للتراجع في حالات الطوارئ**: يرفع قيد المنع الصارم للكتابة المباشرة (`trg_enforce_workspace_write_via_rpc`) عند الضرورة التشغيلية، مع الحفاظ الكامل على عزل الحسابات (`RLS`)، وسياسات VIP للرفع (`can_upload_media = true`)، وسحب الصلاحيات الخطرة والافتراضية.
- `supabase/rollbacks/20261103140000_rollback_fix_security_and_privileges.sql` — نص التراجع التاريخي إلى حالة الـ Baseline (معزول خارج `migrations/` ومحمي ببوابة أمان `exo.allow_unsafe_legacy_rollback = 'I_ACCEPT_SECURITY_DOWNGRADE'` لمنع تشغيله بالخطأ).

---

## القسم الأول: سلامة الهجرات الأمامية وإثبات التطابق التام بين المسارين A وB (Phase 4.2.3)

### 1. لماذا يحظر تعديل الهجرات السابقة المطبقة؟ (`Forward Migration Rule`)
تسجل أدوات ترحيل Supabase (`supabase db push` / `supabase migration up`) أسماء وتواريخ الهجرات المطبقة في جدول النظام الداخلي `supabase_migrations.schema_migrations`.
- إذا تم تعديل ملف هجرة سابق مطبق بالفعل مثل `20261103140000` بدلاً من إنشاء ملف جديد، فإن أداة النشر تتجاهل الملف تمامًا ولن تنفذ أي تغيير على قواعد البيانات الحالية (Staging أو Production)، مما يؤدي إلى انحراف خطير بين كود المستودع وقاعدة البيانات الحية.
- لذلك، تمت إعادة ملف `20261103140000_fix_security_and_privileges.sql` إلى حالته التاريخية الأصلية بدقة، وإنشاء الهجرة الأمامية الجديدة `20261103150000_unforgeable_occ_and_role_hardening.sql`.

### 2. إثبات مساري النشر على PostgreSQL 16 الفعلي (`test_phase4_2_1_pg16_concurrency.js`)
تم إنشاء واختبار ثلاثة قواعد بيانات متزامنة على خادم PostgreSQL 16 الفعلي:
1. **المسار A — التثبيت الجديد (`exo_pg16_fresh_install`)**:
   - تطبيق الهجرات بالترتيب الزمني: `20261103133622` -> `20261103140000` -> `20261103150000`.
2. **المسار B — ترقية قاعدة بيانات حالية (`exo_pg16_existing_upgrade`)**:
   - إنشاء الحالة التاريخية الدقيقة لـ Phase 4.2.1 (`133622` + `140000`).
   - التحقق من وجود فحص GUC التاريخي وامتلاك postgres لدالة RPC.
   - تطبيق الهجرة الأمامية الجديدة فقط: `20261103150000`.
3. **القاعدة المرجعية (`exo_pg16_fresh_schema`)**:
   - تهيئة مباشرة من المخطط النهائي الكنسي `supabase/schema.sql`.

### 3. نتائج تدقيق التطابق الشامل عبر 10 أبعاد في الكتالوج (10-Dimension Parity)
أثبتت الفحوصات التطابق البايتي والتام بنسبة 100% بين **المسار A** و**المسار B** و**المخطط النهائي `schema.sql`** عبر جميع الأبعاد العشرة:
1. أعمدة جدول `user_workspaces` العشرة، وأنواعها، وقابليتها للقيم الفارغة، والقيم الافتراضية.
2. قيود الجدول (المفتاح الأساسي والمفتاح الأجنبي مع الحذف المتتالي `ON DELETE CASCADE`).
3. الفهارس الفريدة (`user_workspaces_pkey`).
4. سياسات أمان الصفوف السبعة (`RLS Policies`) بما في ذلك تعابير `USING` و`WITH CHECK`.
5. مشغلات الجدول الأربعة (`Triggers`) وتعاريف `pg_get_triggerdef`.
6. مشغل الأحداث العام (`Event Trigger: ensure_rls`).
7. دوال النظام الست وتعاريفها وخصائص `SECURITY DEFINER` و`search_path` وقوائم الصلاحيات `ACL`.
8. صلاحيات الجداول (`Table ACL`) وأعلام RLS على `public.user_workspaces`.
9. الصلاحيات الافتراضية العامة والمحلية (`pg_default_acl`) لكل من `postgres` و`exo_occ_rpc_definer`.
10. إعدادات باقة التخزين `storage.buckets (lecture_media)` والمخطط الداخلي `exo_internal.occ_active_write_context`.

---

## القسم الثاني: إعادة تصميم إثبات مسار OCC RPC لمنع تزوير Custom GUC

### 1. سبب عدم أمان متغيرات الجلسة المخصصة (`Custom PostgreSQL GUC`)
في التصميم السابق، اعتمدت الدالة `enforce_workspace_write_via_rpc()` وسياسات `RLS` على فحص:
`current_setting('exo.occ_rpc_active', true) = 'true'`
في PostgreSQL، أي متغير جلسة مخصص (`Custom GUC` يحمل بادئة مثل `exo.*`) يمكن لأي جلسة SQL عادية تنتمي إلى دور `authenticated` أو `anon` ضبطه يدويًا عبر `SET exo.occ_rpc_active = 'true'` أو `SELECT pg_catalog.set_config('exo.occ_rpc_active', 'true', true)` دون الحاجة إلى صلاحيات `SUPERUSER`. لذلك، إذا حصل دور `authenticated` لأي سبب تشغيلي أو خطأ إداري على صلاحية `INSERT` أو `UPDATE` المباشرة على الجدول، فإنه كان يستطيع تزوير هذا المتغير وتجاوز فحص `OCC RPC`.

### 2. التصميم الجديد غير القابل للتزوير (`Unforgeable Dual-Layer OCC RPC Proof`)
تمت إزالة الاعتماد على `exo.occ_rpc_active` بالكامل من المخطط النهائي والهجرة الأمامية، واستبداله بطبقتين مستقلتين تفرضهما نواة PostgreSQL ولا يستطيع العميل تزويرهما:

1. **الطبقة الأولى — دور مالك مخصص معزول (`exo_occ_rpc_definer`) وفحص `CURRENT_USER` في سياسات `RLS`**:
   - إنشاء دور مخصص غير قابل لتسجيل الدخول ولا يتخطى سياسات أمان الصفوف:
     `CREATE ROLE "exo_occ_rpc_definer" NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`
   - سحب عضوية هذا الدور من `anon` و`authenticated`:
     `REVOKE "exo_occ_rpc_definer" FROM "anon", "authenticated";`
     بحيث يفشل أي استدعاء `SET ROLE exo_occ_rpc_definer` من جلسة العميل بخطأ `permission denied to set role`.
   - نقل ملكية الدالة `public.sync_workspace_with_concurrency(jsonb, integer)` (`SECURITY DEFINER`) إلى الدور `"exo_occ_rpc_definer"`, مع إبقاء سحب صلاحيات `INSERT, UPDATE, DELETE` المباشرة من `authenticated` ومنح `SELECT, INSERT, UPDATE` للدور `exo_occ_rpc_definer`.
   - لأن `exo_occ_rpc_definer` يملك خاصية `NOBYPASSRLS`، تستمر سياسات `RLS` على `public.user_workspaces` في العمل داخل الدالة، وتشترط في سياسات `INSERT` و`UPDATE`:
     `WITH CHECK ((auth.uid() = user_id) AND (CURRENT_USER = 'exo_occ_rpc_definer'::name))`
   - في PostgreSQL، القيمة `CURRENT_USER` هي معرّف الدور الفعلي للـ Security Context وليست متغير GUC نصيًا، ولا يمكن أن تصبح `'exo_occ_rpc_definer'` إلا أثناء تنفيذ الدالة `SECURITY DEFINER` المملوكة لهذا الدور.

2. **الطبقة الثانية — جدول سياق المعاملات الخاص (`exo_internal.occ_active_write_context`) وفحص الـ Trigger**:
   - إنشاء مخطط خاص `exo_internal` وجدول محمي:
     `exo_internal.occ_active_write_context (txid xid8, user_id uuid, write_op text, PRIMARY KEY (txid, user_id))`
   - سحب جميع الصلاحيات على المخطط `exo_internal` والجدول `occ_active_write_context` من `PUBLIC` و`anon` و`authenticated`، وحصرها في `"postgres", "service_role", "exo_occ_rpc_definer"`.
   - داخل `public.sync_workspace_with_concurrency()`، يتم إدراج سجل يحمل رقم المعاملة الفعلي في النواة `(pg_catalog.pg_current_xact_id(), v_uid, 'UPDATE' | 'INSERT')` قبل جملة `UPDATE` أو `INSERT` مباشرةً، ثم **يُحذف السجل فورًا بعد انتهاء الجملة وقبل إرجاع النتيجة** (وكذلك داخل كتلة `EXCEPTION WHEN unique_violation`).
   - تتحقق دالة الـ Trigger `public.enforce_workspace_write_via_rpc()` (`BEFORE INSERT OR UPDATE`) من وجود هذا السجل الفعلي المطابق لـ `(pg_current_xact_id(), NEW.user_id, TG_OP)` داخل `exo_internal.occ_active_write_context`؛ فإذا لم يوجد، ترفض العملية فورًا بالخطأ `OCC_BYPASS_FORBIDDEN` (`ERRCODE = '42501'`).
   - يمنع الحذف الفوري للسجل بعد جملة التحديث داخل `sync_workspace_with_concurrency()` حتى هجوم **التطفل داخل نفس المعاملة (`Same-Transaction Piggyback Attack`)** الذي يحاول تنفيذ `UPDATE` مباشر بعد استدعاء الـ RPC في نفس المعاملة (`BEGIN ... SELECT sync_workspace_with_concurrency(...); UPDATE ...; COMMIT`).

### 3. نتائج اختبارات الهجوم وتزوير GUC واختبار عدم التلاعب بـ `auth.uid()` على PostgreSQL 16 الفعلي
في `test_phase4_2_1_pg16_concurrency.js` (القسمين 6 و7)، تم تنفيذ الاختبارات الفعلية التالية على خادم `PostgreSQL 16.15`:
1. **اختبار تزوير `exo.occ_rpc_active = 'true'` مع منح صلاحيات `INSERT, UPDATE` مؤقتًا (`Section 6`)**:
   - منح اتصال المسؤول صلاحيات `GRANT INSERT, UPDATE ON TABLE public.user_workspaces TO authenticated` مؤقتًا لأغراض الاختبار.
   - بدأت جلسة `authenticated` للمستخدم A، وضبطت يدويًا `SELECT pg_catalog.set_config('exo.occ_rpc_active', 'true', true)`.
   - حاولت الجلسة تنفيذ `UPDATE public.user_workspaces SET subjects = ... WHERE user_id = userA` مباشرةً -> **تم رفض التحديث** بخطأ `OCC_BYPASS_FORBIDDEN` (`42501`).
   - حاولت الجلسة تنفيذ `INSERT INTO public.user_workspaces ...` مباشرةً مع ضبط `exo.occ_rpc_active = 'true'` -> **تم رفض الإدراج** بخطأ `OCC_BYPASS_FORBIDDEN` (`42501`).
   - حاولت الجلسة تنفيذ `SET LOCAL ROLE exo_occ_rpc_definer` والكتابة المباشرة في `exo_internal.occ_active_write_context` -> **تم رفض المحاولتين** بخطأ `permission denied`.
   - حاولت الجلسة تنفيذ هجوم التطفل داخل نفس المعاملة (`Same-Transaction Piggyback`) -> **تم رفض التحديث المباشر** بخطأ `OCC_BYPASS_FORBIDDEN` (`42501`).
   - حتى عند تعطيل الـ Trigger `trg_enforce_workspace_write_via_rpc` مؤقتًا مع بقاء صلاحية `UPDATE` المؤقتة وضبط `exo.occ_rpc_active = 'true'`، قامت طبقة `RLS WITH CHECK (CURRENT_USER = 'exo_occ_rpc_definer')` المستقلة **برفض التحديث المباشر** بخطأ `new row violates row-level security policy` (`42501`).
   - تم التحقق من أن التحديث المشروع عبر `SELECT public.sync_workspace_with_concurrency(payload, expected_rev)` ينجح بصورة طبيعية ويرفع `revision` من `3` إلى `4`، وأن حساب المستخدم B لم يتأثر إطلاقًا.
2. **اختبار حماية هوية `auth.uid()` ومنع انتحال الهوية (`Section 7`)**:
   - قامت جلسة المستخدم A (`auth.uid() = userA`) باستدعاء `sync_workspace_with_concurrency` مع تمرير حمولة خبيثة تتضمن `"user_id": "<userB>"`, `"user_email": "bob.victim@exo.edu"`, `"can_upload_media": true`, `"revision": 999`.
   - أثبت الاختبار أن الدالة والـ Triggers تتجاهل تمامًا `user_id` الممرر في الـ JSON، وتقيد الكتابة حصريًا بـ `auth.uid()`، وتفرض البريد الحقيقي للمستخدم A من جدول `auth.users` (`alice.concurrency@exo.edu`)، وتبقي `can_upload_media = false`، وتترك صف المستخدم B سليمًا دون أي تغيير.
   - أثبت الاختبار أن جلسة `authenticated` لا تستطيع تصعيد صلاحياتها عبر `SET ROLE postgres` أو `SET ROLE service_role`.

---

## القسم الثالث: نتائج الاختبارات المفصولة حسب فئاتها الخمس (276 / 276)

تم تشغيل جميع الاختبارات فعليًا عبر `npm test` (`run_all_tests.js`) وجاءت النتائج مفصولة بدقة كالتالي:

| الفئة | ملف الاختبار | البيئة الفعلية | عدد الفحوصات | النتيجة |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **1. اختبارات التشفير الإنتاجي والفحص الثابت** | `run_verification_tests.js` | Node.js Web Crypto (`index.html`) + فحص SQL/SW | **50** | **50 PASS / 0 FAIL** |
| **2. اختبارات الوحدات والمنطق غير المتزامن (Unit Tests)** | `run_comprehensive_verification.js`<br>`test_phase3_cross_account_isolation.js`<br>`test_phase4_regressions.js` | Node.js + محاكي معاملات IDB | **102**<br>(42 + 25 + 35) | **102 PASS / 0 FAIL** |
| **3. اختبارات التوافق المضمنة (Embedded PG Compatibility)** | `test_phase4_2_postgres_integration.js` | **PGlite WASM (`PG 18.6 Single-Connection`)** | **41** | **41 PASS / 0 FAIL** |
| **4. خادم PostgreSQL 16 الفعلي ومساري النشر والتزامن** | `test_phase4_2_1_pg16_concurrency.js` | **PostgreSQL 16.15 حقيقي (`Multi-Connection TCP`)** | **41** | **41 PASS / 0 FAIL** |
| **5. اختبارات المتصفح الشاملة (Browser E2E)** | `test_phase4_1_chromium_e2e.js` | **Headless Chromium + Real IndexedDB v4** | **42** | **42 PASS / 0 FAIL** |
| **الإجمالي الكلي** | **جميع الحزم (7 ملفات اختبار)** | **Node.js + PGlite + PostgreSQL 16.15 + Chromium** | **276** | **276 PASS / 0 FAIL** |

---

## القسم الرابع: التمييز الصريح لحدود الأمان بين قاعدة البيانات وبوابة Supabase Auth / PostgREST

### 1. ما تم إثباته قطعيًا داخل PostgreSQL 16
- تم إثبات أن محرك قاعدة البيانات نفسه، تحت أدوار `anon` و`authenticated`، يفرض حماية غير قابلة للتزوير:
  1. عزل الحسابات بـ `auth.uid()`.
  2. منع التلاعب بحمولة JSON أو انتحال معرّفات مستخدمين آخرين.
  3. منع الكتابة المباشرة وتزوير متغيرات GUC.
  4. فرض أقفال التزامن الحقيقية `SELECT ... FOR UPDATE` ورفض التحديثات المتعارضة.

### 2. ما لا تثبته اختبارات PostgreSQL المحلية (الحدود الخارجية لـ Supabase Auth)
- تحاكي اختبارات قاعدة البيانات مطالبات JWT عبر ضبط جلسة الاتصال:
  `SELECT pg_catalog.set_config('request.jwt.claim.sub', '<uuid>', true);`
- هذا الإعداد يثبت صحة تفاعل قاعدة البيانات مع المطالبة، **لكنه لا يثبت صحة توقيع الـ JWT مشفرًا من Supabase GoTrue Auth (HMAC-SHA256 أو RS256) أو رفض بوابة PostgREST للرموز منتهية الصلاحية أو المزورة قبل وصولها لقاعدة البيانات**.

### 3. إجراء التحقق الإلزامي القابل للتكرار على بيئة الاستضافة (`Staging Validation Procedure`)
قبل اعتماد النشر النهائي على بيئة الإنتاج، يجب تنفيذ الخطوات التالية على مشروع Supabase Staging:
1. **التحقق من توقيع الرمز ورفض التزوير**:
   - إرسال طلب HTTP إلى نقطة نهاية RPC باستخدام Bearer Token غير موقع بمفتاح المشروع:
     ```bash
     curl -i -X POST "https://<PROJECT-REF>.supabase.co/rest/v1/rpc/sync_workspace_with_concurrency" \
       -H "apikey: <ANON_KEY>" \
       -H "Authorization: Bearer forged.unsigned.token" \
       -H "Content-Type: application/json" \
       -d '{"p_payload": {"subjects": []}, "p_expected_revision": null}'
     ```
   - **النتيجة المتوقعة**: استجابة `HTTP 401 Unauthorized` من بوابة PostgREST دون ملامسة قاعدة البيانات.
2. **التحقق من الرمز الصحيح لمستخدم حقيقي**:
   - تسجيل الدخول عبر Supabase Auth SDK والحصول على `access_token` صالح.
   - استدعاء نقطة النهاية بالرمز الصحيح:
     ```bash
     curl -i -X POST "https://<PROJECT-REF>.supabase.co/rest/v1/rpc/sync_workspace_with_concurrency" \
       -H "apikey: <ANON_KEY>" \
       -H "Authorization: Bearer <VALID_USER_TOKEN>" \
       -H "Content-Type: application/json" \
       -d '{"p_payload": {"subjects": [{"id": "staging_test", "name": "Staging Verification"}]}, "p_expected_revision": null}'
     ```
   - **النتيجة المتوقعة**: استجابة `HTTP 200 OK` مع `{ "status": "success", "revision": 1 }`.
3. **التحقق من منع الكتابة المباشرة عبر واجهة PostgREST REST API**:
   - محاولة استدعاء `PATCH /rest/v1/user_workspaces` مباشرةً بالرمز الصالح:
     ```bash
     curl -i -X PATCH "https://<PROJECT-REF>.supabase.co/rest/v1/user_workspaces" \
       -H "apikey: <ANON_KEY>" \
       -H "Authorization: Bearer <VALID_USER_TOKEN>" \
       -H "Content-Type: application/json" \
       -d '{"subjects": []}'
     ```
   - **النتيجة المتوقعة**: رفض التحديث إما بـ `HTTP 401/403` بسبب سحب صلاحيات `UPDATE`، أو بـ `HTTP 400` مع خطأ `OCC_BYPASS_FORBIDDEN` (`42501`).

