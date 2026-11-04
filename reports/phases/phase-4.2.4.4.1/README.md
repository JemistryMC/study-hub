# Phase 4.2.4.4.1 — Critical Fixture Corrections & Verifiable Execution

**Status: IN PROGRESS — NOT APPROVED**

## الهدف

إغلاق مشكلات Fixture واختبارات PostgreSQL 16 التي ظهرت في المراجعة المستقلة لـ Phase 4.2.4.4، وإنتاج دليل قابل للتكرار على سلامة تنفيذ migrations ومساري Path A وPath B.

هذه مرحلة أمان واختبارات قاعدة بيانات فقط. لا تغيّر واجهة التطبيق ولا تضف مميزات منتج.

## الملفات الأساسية للفحص

- `test_phase4_2_1_pg16_concurrency.js`
- `.github/workflows/ci.yml`
- `supabase/migrations/20261103133622_remote_schema.sql`
- `supabase/migrations/20261103140000_fix_security_and_privileges.sql`
- `supabase/migrations/20261103150000_unforgeable_occ_and_role_hardening.sql`
- `supabase/migrations/20261103160000_hosted_supabase_auth_compat.sql`
- `supabase/schema.sql`
- `run_all_tests.js` وملفات الاختبار المرتبطة.

## بوابات القبول

### B1 — اتصالات وهوية PostgreSQL

- إصلاح connection builder بحيث يمرر database وusername وpassword فعليًا.
- إنشاء Bootstrap connection وMigration runner connection بهويتين منفصلتين.
- إثبات `session_user` و`current_user` وخصائص الدور بعد اتصال ناجح فعليًا.
- لا تعتمد على تمرير arguments إضافية إلى دالة لا تستخدمها.

### B2 — دورة حياة الاتصالات

- لا تستخدم أي Client بعد `end()`.
- إبقاء Path A متصلًا حتى انتهاء تدقيقه ومقارنته، أو فتح audit client مستقل.
- إغلاق جميع الاتصالات في `finally` حتى عند فشل setup أو migration أو assertion.

### B3 — عزل PostgreSQL 16

- استخدام خدمة أو cluster disposable مخصص للـ CI/test run.
- التحقق من أن target الفعلي هو fixture المخصص لهذا التشغيل.
- لا تعتبر `CI` أو `GITHUB_ACTIONS` أو وجود `pg_ctl` إثباتًا كافيًا.
- لا تغيّر role عالميًا على خادم مشترك.
- وضّح استراتيجية التشغيل المحلي الآمن أيضًا.

### B4 — Cleanup

- ضع كل عمليات الإنشاء والتعديل داخل نطاق cleanup.
- نظّف كل قواعد البيانات والأدوار والـ grants والموارد التي أنشأها الاختبار.
- تحقق من اختفاء الموارد أو استعادة حالتها من catalogs.
- لا تبتلع أخطاء cleanup ولا تستخدم `assert(true)`.
- فشل cleanup يجب أن يجعل الاختبار يفشل بوضوح.

### B5 — Warnings وAuth ACL

- افحص `capturedWarnings` بدل جمعها دون Assertions.
- افحص ACL على schema `auth`.
- افحص ACL على الجدول `auth.users`.
- تحقق من عدم وجود صلاحيات مباشرة غير مقصودة للـ definer role بعد migration.
- استخدم catalog queries دقيقة، واذكر expected privileges.

### B6 — تدقيق Path B

نفّذ بشكل مستقل كل الفحوص الأمنية الحرجة في Path B كما في Path A، بما فيها:
- Auth schema/table ACL.
- Helper function: SECURITY DEFINER وfixed search_path.
- RPC function `proconfig` وsearch_path.
- RLS flags وpolicy expressions.
- Trigger enabled state.
- السلوك مع وبدون claim.
- رفض direct `auth.uid()` حيث يجب رفضه.
- السلوك تحت definer role.

لا تستنتج نجاح Path B من Path A.

### B7 — Parity wording

المقارنة السابقة شملت ثلاثة أسطح فقط:
1. `user_workspaces` columns.
2. Policies على `user_workspaces`.
3. `occ_active_write_context` columns.

إما توسّع المقارنة إلى جميع أبعاد catalog التي تريد الادعاء بتغطيتها، أو سمّها بدقة `three-surface parity` واشرح ما لا تتم مقارنته.

### Migration History — قيد إلزامي

Patch Phase 4.2.4.4 عدّل migration تاريخية:
`20261103150000_unforgeable_occ_and_role_hardening.sql`

قبل تعديل الملف مجددًا:
- حدّد هل النسخة الأصلية طُبقت بالفعل على أي قاعدة بيانات.
- ميّز Fresh Install عن Existing Upgrade.
- اشرح أثر checksums وسجل Supabase migrations.
- فضّل forward migration عندما يكون ذلك صحيحًا.
- إذا لم يمكن التحقق من حالة أي قاعدة بيانات deployed، صرّح بذلك ولا تفترض أنها لم تُطبق.

**لا تطبق أي migration على Supabase Production أو أي قاعدة بيانات حقيقية.**

## مسارات التنفيذ المطلوبة

- **Path A — Clean/Fresh:** إنشاء قاعدة جديدة وتنفيذ migration chain المطلوبة بالترتيب الصحيح، مع إثبات role identity ونتائج كل migration.
- **Path B — Upgrade:** إنشاء/استعادة الحالة الدقيقة التي تمثل 4.2.3 ثم تنفيذ migration 160000 فقط تحت الهوية والصلاحيات المتوقعة.
- **Ownership scratch experiment:** اختبار منفصل ومعزول لنقل الملكية، لا يغير حالة مساري A/B.

وثّق نقطة البداية الدقيقة لكل مسار، ولا تخلط بين clean install وupgrade.

## الأدلة المطلوبة

- Base SHA والـ resulting source SHA.
- أسماء الملفات المعدلة.
- الأوامر الكاملة ونسخ Node/PostgreSQL/Playwright.
- logs خام غير معدلة.
- نتائج Path A وPath B كلٌ على حدة.
- catalog/ACL/RLS/trigger/function evidence.
- cleanup evidence.
- `git diff --check`.
- GitHub Actions URL يختبر نفس كود SHA بعد Sync.

## ممنوع

- لا تعديل على UI أو business features.
- لا حذف للاختبارات أو تعطيلها.
- لا weakening للـ assertions.
- لا mocks لإثبات PostgreSQL الحقيقي.
- لا secrets أو credentials في Git.
- لا Production Supabase.
- لا تعدّل `Deploying` أو فرع الاسترجاع.
- لا تنفذ Sync أو Force Push بنفسك؛ المالك يراجع ويقرر.
- لا ادعاء 312/312 دون logs مطابقة للـ SHA.

## ملف التسليم

`reports/phases/phase-4.2.4.4.1/gemini-report.md`

الحالة لا تصبح APPROVED إلا بعد مراجعة مستقلة.
