# Exo Academic Platform

منصة Exo لإدارة الدراسة والمواد والمحاضرات والتخطيط الأكاديمي. هذا المستودع هو المصدر المرجعي للكود وقرارات المنتج والتقارير الهندسية.

## ابدأ من هنا

1. اقرأ [الحالة الحالية للمشروع](reports/CURRENT.md) لمعرفة المرحلة النشطة والخطوة المصرح بها.
2. اقرأ [العقد الهندسي الدائم لـGemini](GEMINI.md) قبل أي تعديل.
3. عند العمل على الواجهة وتجربة الاستخدام، اقرأ [EXO — Personal Study Journal Design Contract](reports/EXO_PERSONAL_STUDY_JOURNAL_DESIGN.md).
4. اقرأ [Phase 6 — Experience Redesign Plan](reports/PHASE_6_EXPERIENCE_REDESIGN_PLAN.md) لمعرفة مراحل التنفيذ وبوابات المراجعة.
5. راجع [طريقة العمل والتقارير](reports/README.md).

## خريطة المشروع

| المسار | وظيفته |
| --- | --- |
| `index.html` | التطبيق الحالي ومنطقه وواجهة المستخدم |
| `server.js` | خادم التطوير وتقديم الملفات |
| `build.js` | تجهيز نسخة التوزيع |
| `sw.js` و`manifest.json` | PWA وملفات التشغيل |
| `supabase/migrations/` | تغييرات قاعدة البيانات المتسلسلة |
| `supabase/schema.sql` | مرجع مخطط قاعدة البيانات؛ لا يُطبق بالكامل تلقائيًا على قاعدة قائمة |
| `supabase/rollbacks/` | خطط التراجع الموثقة |
| `test_*.js` و`run_*.js` | اختبارات الأمان والتكامل والمتصفح |
| `reports/` | قرارات التصميم، مراحل التنفيذ، التقارير، وسجل التسليم |

## الفروع ومصدر الحقيقة

| الفرع | الاستخدام |
| --- | --- |
| `main` | فرع العمل النشط المرتبط بـGoogle AI Studio / Gemini؛ التغييرات تظل غير معتمدة حتى المراجعة |
| `Deploying` | مرجع تاريخي لخط أساس سابق؛ ليس فرع العمل النشط |
| `backup/pre-gemini-security-2026-11-04` | نقطة استرجاع محمية؛ لا تحذفها أو تعدلها |

- `reports/CURRENT.md` هو المرجع الوحيد للمرحلة النشطة والخطوة المصرح بها.
- `GEMINI.md` هو العقد الدائم للأمان والهندسة والصلاحيات.
- `reports/EXO_PERSONAL_STUDY_JOURNAL_DESIGN.md` هو المرجع المعتمد لقرارات الشكل وتجربة الاستخدام.
- `reports/PHASE_6_EXPERIENCE_REDESIGN_PLAN.md` يحدد مراحل إعادة التصميم وبوابات مراجعتها.

## الحالة الحالية

المرحلة النشطة هي **Phase 6 — EXO Personal Study Journal Experience Redesign**. تم رفع تقرير **WP 6.0 Read-Only Baseline Audit** إلى `reports/PHASE_6_BASELINE_AUDIT.md`، وهو الآن بانتظار مراجعة المالك وإغلاق Gate 6.0. لا يبدأ WP 6.1 أو أي تعديل برمجي قبل موافقة المالك الصريحة. راجع `reports/CURRENT.md` للتفاصيل الدقيقة.

## دورة العمل — تحكم المالك

1. Gemini يقرأ README.md وGEMINI.md وreports/CURRENT.md، ثم مستند التصميم وخطة Phase 6 عند العمل على الواجهة.
2. Gemini يتحقق من المستودع والفرع وBase SHA وحالة الملفات المحلية.
3. Gemini يعمل ضمن Work Package محدد، ويحافظ على الوظائف والبيانات الحالية.
4. قبل المزامنة يعرض Gemini Base SHA والملفات المتغيرة والـDiff والاختبارات والقيود.
5. المالك وحده يراجع ويقرر GitHub Sync. لا Force Push كإجراء روتيني.
6. بعد المزامنة نتحقق من Commit SHA والملفات الفعلية وGitHub Actions المرتبطة بنفس SHA.
7. المراجعة المستقلة وموافقة المالك مطلوبة قبل اعتماد أي مرحلة.

## قواعد أساسية

- لا أسرار أو كلمات مرور أو JWTs أو مفاتيح خاصة أو ملفات `.env` في Git.
- لا اتصال بقاعدة Supabase Production أو تطبيق migrations عليها دون تفويض مستقل.
- لا تفترض أن قاعدة البيانات الحية فارغة أو مطابقة لـ`schema.sql`.
- لا تحذف اختبارات أو تخفف Assertions لإظهار نجاح زائف.
- لا تخلط PGlite مع PostgreSQL 16 الحقيقي أو mocks مع Chromium E2E.
- لا تجعل VIP شرطًا للحفظ الأكاديمي الأساسي أو مزامنة Workspace/annotations الأساسية.
- استحقاق VIP الحالي يدوي من المالك عبر `public.user_workspaces.can_upload_media`.
- Google Drive media upload منفصل عن مزامنة بيانات Workspace.
- كل نتيجة اختبار يجب أن ترتبط بـSource SHA محدد؛ لا تستخدم نتائج تاريخية كأنها اختبارات جديدة.
- لا تغييرات في `Deploying` أو فرع الاسترجاع.

التفاصيل الدائمة في [GEMINI.md](GEMINI.md)، والمرحلة النشطة في [reports/CURRENT.md](reports/CURRENT.md).
