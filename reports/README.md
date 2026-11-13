# التقارير وتسليم العمل بين Gemini وChatGPT

يحتوي هذا المجلد على قرارات التصميم وخطط المراحل والتقارير والمراجعات. **ابدأ دائمًا من [الحالة الحالية](CURRENT.md)**؛ فهي تحدد المرحلة النشطة والخطوة المصرح بها.

## المراجع المعتمدة

- [CURRENT.md](CURRENT.md): مصدر الحقيقة الوحيد للمرحلة النشطة وحالتها والخطوة المصرح بها.
- [EXO Personal Study Journal Design Contract](EXO_PERSONAL_STUDY_JOURNAL_DESIGN.md): مرجع قرارات المنتج والهوية البصرية وتجربة الاستخدام المعتمدة.
- [Phase 6 Experience Redesign Plan](PHASE_6_EXPERIENCE_REDESIGN_PLAN.md): مراحل إعادة التصميم وبوابات المراجعة.
- [GEMINI.md](../GEMINI.md): العقد الدائم للهندسة والأمان والصلاحيات.
- [README.md](../README.md): مدخل المستودع وخريطة الملفات.

## المرحلة النشطة

**Phase 6 — EXO Personal Study Journal Experience Redesign**

الحالة: **Phase 6 IN PROGRESS — WP 6.1 CI VERIFIED; WP 6.2 IMPLEMENTED — LOCAL TESTS ONLY; WP 6.3 INACTIVE UNTIL WP 6.2 CI PASSES; FINAL OWNER REVIEW DEFERRED TO PHASE 6 COMPLETION**.

**تقرير WP 6.0:** [PHASE_6_BASELINE_AUDIT.md](PHASE_6_BASELINE_AUDIT.md) تم رفعه إلى GitHub في commit `0a6100439a6d98fee9aaa84683ad4bf7d1247c5f` بعد جولة reconciliation مع قرارات المالك، واعتمده المالك بتاريخ 2026-11-13.  
**تقرير WP 6.1:** [PHASE_6_WP_6_1_REPORT.md](PHASE_6_WP_6_1_REPORT.md) — CI Run #53 (`43450226930`) SUCCESS على SHA `86fda9824880c00268db117f1ab8780b106f6fe0`، بإجمالي `755/755` في `npm test` وPostgreSQL 16 `96/96` وChromium E2E `148/148`؛ وGitHub Pages Run #146 (`43450226479`) SUCCESS على SHA نفسه.  
**تقرير WP 6.2:** [PHASE_6_WP_6_2_REPORT.md](PHASE_6_WP_6_2_REPORT.md) — الحالة: **`IMPLEMENTED — LOCAL TESTS ONLY`** (`670/670` محلياً شاملة `Test LL.1–LL.5` و`test_wp6_2_unit.js`؛ بانتظار مزامنة المالك مع `main` واجتياز GitHub Actions CI قبل بدء WP 6.3). تظل WP 6.3 غير مفعّلة حتى يجتاز مصدر WP 6.2 المرفوع اختبارات CI، ويحتفظ المالك بالاعتماد النهائي لـ Phase 6 عند اكتمالها.

## حالة Phase 5.2 السابقة

آخر commit مصدري معروف قبل توثيق Phase 6 هو `c74315a4580d68c61da8a0f49ec2b2f5946301e4` بعنوان تنفيذ Google Drive Reliability and OAuth. Gemini أفاد محليًا بـ650/650 ونجاح lint وbuild. فحص GitHub Combined Status عند التسليم لم يُرجع Status Checks؛ لذلك لا تصف Phase 5.2 بأنها CI VERIFIED اعتمادًا على التقرير المحلي وحده. أعد فحص SHA والـworkflow الفعلي عند الحاجة.

## بنية المجلد

- `CURRENT.md`: الحالة الحالية والتسليم النشط، مع الاحتفاظ بالسجل الهندسي التاريخي.
- `EXO_PERSONAL_STUDY_JOURNAL_DESIGN.md`: مرجع تجربة المستخدم والتصميم.
- `PHASE_6_EXPERIENCE_REDESIGN_PLAN.md`: خطة Phase 6.
- `audits/`: تقارير التدقيق.
- `patches/`: Unified diffs تاريخية وليست كودًا مطبقًا.
- `phases/`: تقارير المراحل السابقة.
- `templates/`: قوالب تقارير التنفيذ والمراجعة.

قد توجد ملفات أخرى؛ استخدم شجرة GitHub الفعلية ولا تفترض أن القائمة حصر كامل.

## دورة العمل عبر Google AI Studio

1. Gemini يقرأ README.md وGEMINI.md وCURRENT.md، ومستند التصميم وخطة Phase 6 عند العمل على الواجهة.
2. يتحقق من المستودع والفرع وBase SHA وحالة التغييرات المحلية.
3. يعمل ضمن Work Package واحد ونطاق ملفاته فقط.
4. يقدم Diff والملفات والاختبارات والقيود قبل أي مزامنة.
5. المالك وحده يقرر GitHub Sync. إذا لم يكن الفرع main ظاهرًا بوضوح يتوقف. لا يستخدم Force Push كإجراء روتيني.
6. بعد المزامنة نتحقق من Commit SHA والملفات الفعلية وGitHub Actions المرتبطة بنفس SHA.
7. كل Work Package يحتاج اختبارات وأدلة ومراجعة هندسية مستقلة ونجاح CI على Source SHA الخاص به قبل الانتقال للحزمة التالية. لا توجد موافقة منفصلة من المالك بين الحزم؛ الاعتماد النهائي للـPhase من المالك بعد اكتمال النطاق كله.

## الفروع

- `main`: فرع العمل النشط لـGemini. ملفات AI Studio المحلية تظل مسودات حتى يزامنها المالك؛ بعد المزامنة يُتحقق من كل Work Package عبر CI، وتُؤجل موافقة المالك النهائية إلى نهاية Phase 6.
- `Deploying`: مرجع تاريخي محفوظ؛ لا تعدّله في المهمة الحالية.
- `backup/pre-gemini-security-2026-11-04`: نقطة استرجاع محمية؛ لا تحذفها أو تستبدلها.

## قواعد الأدلة والاعتماد

- اربط كل نتيجة اختبار بالأمر والبيئة والـSource SHA الفعلي.
- افصل الاختبارات المحلية عن GitHub Actions وStaging وProduction.
- لا تخلط PGlite مع PostgreSQL 16 الحقيقي، أو mocks مع Chromium E2E أو Supabase Hosted.
- أظهر الفشل والتحذيرات والاختبارات التي لم تعمل.
- لا تضع أسرارًا أو بيانات اعتماد أو محتوى ملفات خاصة في التقارير.
- لا تستخدم أرقام اختبارات تاريخية كأنها نتائج جديدة.

استخدم الحالات بدقة:
- `NOT STARTED`
- `IN PROGRESS`
- `CHANGES REQUESTED`
- `IMPLEMENTED — LOCAL TESTS ONLY`
- `CI VERIFIED`
- `APPROVED`

نجاح الاختبارات المحلية لا يساوي CI VERIFIED. حالة CI VERIFIED تثبت الاجتياز التقني للحزمة، لكنها لا تعني الاعتماد النهائي للـPhase؛ الاعتماد النهائي من المالك بعد اكتمال Phase 6.
