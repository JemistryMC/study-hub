# تقرير المراجعة الهندسية والأمنية الشاملة لمنصة Exo — Phase 4.1, Phase 4.2, Phase 4.2.1 & GUC Forgery Remediation

## نطاق المراجعة والتنفيذ الفعلي
يوثق هذا التقرير النتائج والتعديلات المنفذة والمختبرة فعليًا في **Exo Phase 4.1** و**Phase 4.2** و**Phase 4.2.1** وتصحيح ثغرة تزوير متغيرات الجلسة (**GUC Forgery Remediation**) لعزل الحسابات، ومنع سباقات التزامن (`Race Conditions`)، وضمان متانة معاملات `IndexedDB`، وتأمين قواعد بيانات وسياسات `PostgreSQL / Supabase` مع الفصل الكامل والصريح بين:
1. **اختبارات التوافق المضمنة (`Embedded PostgreSQL Compatibility Tests — PGlite WASM`)** في `test_phase4_2_postgres_integration.js`.
2. **اختبارات خادم PostgreSQL 16 الفعلي والتزامن متعدد الاتصالات ومقاومة تزوير GUC (`Real PostgreSQL 16 Multi-Connection Concurrency, GUC Forgery Proof & 10-Point Schema Parity`)** في `test_phase4_2_1_pg16_concurrency.js`.
3. **اختبارات المتصفح الفعلي (`Real Headless Chromium + IndexedDB v4 E2E`)** في `test_phase4_1_chromium_e2e.js`.

### هيكل ملفات قاعدة البيانات المنظم (`supabase/`):
- `supabase/config.toml` — إعدادات مشروع Supabase المحلية والـ Auth والـ Storage.
- `supabase/schema.sql` — المخطط النهائي الكامل (`Canonical Final Schema`) الذي يعكس حالة قاعدة البيانات بعد تطبيق جميع الـ Migrations (بما في ذلك الدور المخصص `exo_occ_rpc_definer`، والمخطط الخاص `exo_internal.occ_active_write_context`، والعمود `revision`، والدالة `sync_workspace_with_concurrency`، ودوال الحماية، وسياسات `RLS` و`Storage`، وتقليص الصلاحيات).
- `supabase/migrations/20261103133622_remote_schema.sql` — مخطط القاعدة الأساسي الأولي (Baseline Migration، متوافق بالكامل مع PostgreSQL 16 بعد إزالة صلاحية `MAINTAIN` الخاصة بـ PostgreSQL 17+).
- `supabase/migrations/20261103140000_fix_security_and_privileges.sql` — ترقية الأمان، سحب الصلاحيات الزائدة والافتراضية (`ALTER DEFAULT PRIVILEGES`)، فرض التحكم التفاؤلي في التزامن (`OCC`) عبر آلية غير قابلة للتزوير (`exo_occ_rpc_definer` + `exo_internal.occ_active_write_context`)، وإصلاح سياسات `Storage`.
- `supabase/rollbacks/20261103140000_safe_rollback_concurrency_only.sql` — **البديل الآمن للتراجع في حالات الطوارئ**: يرفع قيد المنع الصارم للكتابة المباشرة (`trg_enforce_workspace_write_via_rpc`) عند الضرورة التشغيلية، مع الحفاظ الكامل على عزل الحسابات (`RLS`)، وسياسات VIP للرفع (`can_upload_media = true`)، وسحب الصلاحيات الخطرة والافتراضية.
- `supabase/rollbacks/20261103140000_rollback_fix_security_and_privileges.sql` — نص التراجع التاريخي إلى حالة الـ Baseline (معزول خارج `migrations/` ومحمي ببوابة أمان `exo.allow_unsafe_legacy_rollback = 'I_ACCEPT_SECURITY_DOWNGRADE'` لمنع تشغيله بالخطأ).

---

## القسم الأول: إعادة تصميم إثبات مسار OCC RPC لمنع تزوير Custom GUC

### 1. سبب عدم أمان متغيرات الجلسة المخصصة (`Custom PostgreSQL GUC`)
في التصميم السابق، اعتمدت الدالة `enforce_workspace_write_via_rpc()` وسياسات `RLS` على فحص:
`current_setting('exo.occ_rpc_active', true) = 'true'`
في PostgreSQL، أي متغير جلسة مخصص (`Custom GUC` يحمل بادئة مثل `exo.*`) يمكن لأي جلسة SQL عادية تنتمي إلى دور `authenticated` أو `anon` ضبطه يدويًا عبر `SET exo.occ_rpc_active = 'true'` أو `SELECT pg_catalog.set_config('exo.occ_rpc_active', 'true', true)` دون الحاجة إلى صلاحيات `SUPERUSER`. لذلك، إذا حصل دور `authenticated` لأي سبب تشغيلي أو خطأ إداري على صلاحية `INSERT` أو `UPDATE` المباشرة على الجدول، فإنه كان يستطيع تزوير هذا المتغير وتجاوز فحص `OCC RPC`.

### 2. التصميم الجديد غير القابل للتزوير (`Unforgeable Dual-Layer OCC RPC Proof`)
تمت إزالة الاعتماد على `exo.occ_rpc_active` بالكامل (صفر وجود في جميع ملفات `migrations` و`schema.sql` و`rollbacks` والـ Triggers وسياسات `RLS`)، واستبداله بطبقتين مستقلتين تفرضهما نواة PostgreSQL ولا يستطيع العميل تزويرهما:

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
   - منح اتصال المسؤول (`migClient`) صلاحيات `GRANT INSERT, UPDATE ON TABLE public.user_workspaces TO authenticated` مؤقتًا لأغراض الاختبار.
   - بدأت جلسة `authenticated` للمستخدم A، وضبطت يدويًا `SELECT pg_catalog.set_config('exo.occ_rpc_active', 'true', true)`.
   - حاولت الجلسة تنفيذ `UPDATE public.user_workspaces SET subjects = ... WHERE user_id = userA` مباشرةً -> **تم رفض التحديث** بخطأ `OCC_BYPASS_FORBIDDEN` (`42501`).
   - حاولت الجلسة تنفيذ `INSERT INTO public.user_workspaces ...` مباشرةً مع ضبط `exo.occ_rpc_active = 'true'` -> **تم رفض الإدراج** بخطأ `OCC_BYPASS_FORBIDDEN` (`42501`).
   - حاولت الجلسة تنفيذ `SET LOCAL ROLE exo_occ_rpc_definer` والكتابة المباشرة في `exo_internal.occ_active_write_context` -> **تم رفض المحاولتين** بخطأ `permission denied`.
   - حاولت الجلسة تنفيذ هجوم التطفل داخل نفس المعاملة (`Same-Transaction Piggyback`: استدعاء `sync_workspace_with_concurrency` ثم تنفيذ `UPDATE` مباشر في نفس المعاملة) -> **تم رفض التحديث المباشر** بخطأ `OCC_BYPASS_FORBIDDEN` (`42501`).
   - حتى عند تعطيل الـ Trigger `trg_enforce_workspace_write_via_rpc` مؤقتًا مع بقاء صلاحية `UPDATE` المؤقتة وضبط `exo.occ_rpc_active = 'true'`، قامت طبقة `RLS WITH CHECK (CURRENT_USER = 'exo_occ_rpc_definer')` المستقلة **برفض التحديث المباشر** بخطأ `new row violates row-level security policy` (`42501`).
   - تم التحقق من أن التحديث المشروع عبر `SELECT public.sync_workspace_with_concurrency(payload, expected_rev)` ينجح بصورة طبيعية ويرفع `revision` من `3` إلى `4`، وأن حساب المستخدم B لم يتأثر إطلاقًا.
2. **اختبار حماية هوية `auth.uid()` ومنع انتحال الهوية (`Section 7`)**:
   - قامت جلسة المستخدم A (`auth.uid() = userA`) باستدعاء `sync_workspace_with_concurrency` مع تمرير حمولة خبيثة تتضمن `"user_id": "<userB>"`, `"user_email": "bob.victim@exo.edu"`, `"can_upload_media": true`, `"revision": 999`.
   - أثبت الاختبار أن الدالة والـ Triggers تتجاهل تمامًا `user_id` الممرر في الـ JSON، وتقيد الكتابة حصريًا بـ `auth.uid()`، وتفرض البريد الحقيقي للمستخدم A من جدول `auth.users` (`alice.concurrency@exo.edu`)، وتبقي `can_upload_media = false`، وتترك صف المستخدم B سليمًا دون أي تغيير.
   - أثبت الاختبار أن جلسة `authenticated` لا تستطيع تصعيد صلاحياتها عبر `SET ROLE postgres` أو `SET ROLE service_role` للتلاعب بمطالبات JWT.

---

## القسم الثاني: إثبات التزامن متعدد الاتصالات وتطابق المخطط على PostgreSQL 16 الفعلي (Phase 4.2.1)

### 1. الفرق الهندسي الصريح بين محرك PGlite المضمن وخادم PostgreSQL 16 الفعلي
- **محرك PGlite (`@electric-sql/pglite` 0.5.15 — `test_phase4_2_postgres_integration.js`)**:
  - يعمل كمحرك PostgreSQL مضمن أحادي الاتصال (`Single-Connection WebAssembly Engine`) مبني من نواة PostgreSQL 18.6 (`server_version_num = 180006` على `wasm32-unknown-emscripten`).
  - يُحتفظ به باعتباره **Embedded PostgreSQL Compatibility Tests** ولا يُوصف بأنه اختبار PostgreSQL 16.
- **خادم PostgreSQL 16 الفعلي (`postgres:16` — `test_phase4_2_1_pg16_concurrency.js`)**:
  - يتصل بخادم PostgreSQL 16 حقيقي مستقل (`PostgreSQL 16.15`, `server_version_num = 160015`) عبر مكتبة `pg` واتصالات TCP متوازية ومستقلة (`pg_backend_pid()`).
  - يتحقق في بداية الاختبار عبر بوابة إلزامية (`SELECT version()` و`SHOW server_version_num`) من أن الإصدار الرئيسي (`Major Version`) هو `16` حصريًا.

### 2. توثيق واختبار الإضافات الأربعة (`Extensions`)
| الإضافة (`Extension`) | الـ Schema | حالتها في `PGlite` (WASM) | حالتها في `PostgreSQL 16` الفعلي (`postgres:16`) | الاستخدام الفعلي في Exo |
| :--- | :---: | :---: | :---: | :--- |
| **`pg_stat_statements`** | `extensions` | مستثناة (غير مدمجة في WASM) | **مثبتة ومختبرة فعليًا** (`postgresql-contrib-16`) | إحصاءات أداء استعلامات Supabase؛ لا يعتمد عليها منطق التطبيق. |
| **`pgcrypto`** | `extensions` | مستثناة في التهيئة الافتراضية | **مثبتة ومختبرة فعليًا** (`gen_random_uuid()`, `digest()`) | دوال التشفير وتوليد المعرفات القياسية في Supabase. |
| **`uuid-ossp`** | `extensions` | مستثناة في التهيئة الافتراضية | **مثبتة ومختبرة فعليًا** (`uuid_generate_v4()`) | توليد معرفات UUID القياسية. |
| **`supabase_vault`** | `vault` | مستثناة (خاصة بمنصة Supabase) | **مستثناة وموثقة صراحةً** (إضافة سحابية خاصة بصورة Supabase) | غير مستخدمة إطلاقًا في أي جدول أو دالة أو سياسة في Exo. |

### 3. إثبات التزامن الحقيقي متعدد الاتصالات (`Real Multi-Connection Concurrency Proof`)
- تم إثبات التداخل الفعلي لمعاملتين مستقلتين (`conn1`, `conn2`) ومراقبتهما عبر اتصال ثالث (`connMonitor`) من خلال `pg_stat_activity` و`pg_locks`:
  1. توقف `conn2` فعليًا على قفل `SELECT ... FOR UPDATE` (`Lock:transactionid`) أثناء احتفاظ `conn1` بالمعاملة مفتوحة، ثم رفض تحديث `conn2` القديم (`conflict`, `current_revision = 2`) فور تنفيذ `COMMIT` في `conn1`.
  2. سباق التحديث المتزامن عبر حاجز التزامن (`Promise Barrier`) وإثبات نجاح اتصال واحد فقط (`revision = 3`) ورفض الآخر (`conflict`).
  3. سباق الإنشاء للمرة الأولى من اتصالين في نفس الوقت لمستخدم جديد، وتوقف `conn2` داخل `INSERT` على قفل الفهرس الفريد (`user_workspaces_pkey`)، ثم التقاط استثناء `unique_violation` (`23505`) فعليًا وإرجاع `{ status: "conflict", current_revision: 1, message: "Concurrent workspace initialization detected" }` دون فقدان البيانات.

---

## القسم الثالث: نتائج الاختبارات المفصولة حسب فئاتها الخمس (274 / 274)

تم تشغيل جميع الاختبارات فعليًا عبر `npm test` (`run_all_tests.js`) وجاءت النتائج مفصولة بدقة كالتالي:

| الفئة | ملف الاختبار | البيئة الفعلية | عدد الفحوصات | النتيجة |
| :--- | :--- | :--- | :---: | :---: |
| **1. اختبارات التشفير الإنتاجي والفحص الثابت** | `run_verification_tests.js` | Node.js Web Crypto (`index.html`) + فحص SQL/SW | **50** | **50 PASS / 0 FAIL** |
| **2. اختبارات الوحدات والمنطق غير المتزامن (Unit Tests)** | `run_comprehensive_verification.js`<br>`test_phase3_cross_account_isolation.js`<br>`test_phase4_regressions.js` | Node.js + محاكي معاملات IDB | **102**<br>(42 + 25 + 35) | **102 PASS / 0 FAIL** |
| **3. اختبارات التوافق المضمنة (Embedded PG Compatibility)** | `test_phase4_2_postgres_integration.js` | **PGlite WASM (`PG 18.6 Single-Connection`)** | **41** | **41 PASS / 0 FAIL** |
| **4. اختبارات خادم PostgreSQL 16 الفعلي والتزامن ومقاومة التزوير** | `test_phase4_2_1_pg16_concurrency.js` | **PostgreSQL 16.15 حقيقي (`Multi-Connection TCP`)** | **39** | **39 PASS / 0 FAIL** |
| **5. اختبارات المتصفح الشاملة (Browser E2E)** | `test_phase4_1_chromium_e2e.js` | **Headless Chromium + Real IndexedDB v4** | **42** | **42 PASS / 0 FAIL** |
| **الإجمالي الكلي** | **جميع الحزم (7 ملفات اختبار)** | **Node.js + PGlite + PostgreSQL 16.15 + Chromium** | **274** | **274 PASS / 0 FAIL** |

---

## القسم الرابع: المخاطر المتبقية والضوابط التشغيلية (`Residual Risks`)

1. **سر توقيع JWT في بوابة Supabase / PostgREST (`JWT Secret Integrity`)**:
   - تعتمد الدالة `auth.uid()` في Supabase على قيمة `request.jwt.claim.sub` التي تضبطها بوابة PostgREST بعد التحقق التشفيري من توقيع JWT. داخل جلسة `authenticated` في قاعدة البيانات، لا يستطيع المستخدم تغيير دوره إلى `postgres` أو `service_role` أو التلاعب بصفوف غيره، ولكن يجب تشغيليًا حماية مفتاح `SUPABASE_SERVICE_ROLE_KEY` و`JWT_SECRET` في إعدادات المنصة السحابية وعدم كشفهما في الكود العميل.
2. **التعديلات الإدارية المباشرة عبر `postgres` أو `service_role`**:
   - تسمح الدالة `enforce_workspace_write_via_rpc()` للعمليات الإدارية الخلفية المنفذة مباشرةً بواسطة دور الإدارة (`postgres` أو `service_role` عندما يكون `auth.uid() IS NULL`) بتحديث حالات الحسابات (مثل تفعيل صلاحية VIP `can_upload_media = true`). أما جميع عمليات المستخدمين (`authenticated`) فتمر حصريًا عبر `sync_workspace_with_concurrency()`.
3. **تطبيق الترقية على قاعدة الإنتاج السحابية**:
   - جميع التعديلات مطبقة ومختبرة بالكامل داخل المستودع وعلى خادم PostgreSQL 16 الفعلي المحلي وفي GitHub Actions CI، ويجب تطبيق ملف الترقية `supabase/migrations/20261103140000_fix_security_and_privileges.sql` على مشروع Supabase السحابي عند اعتماد الدمج النهائي.
