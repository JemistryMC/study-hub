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

الحالة: **IN PROGRESS — WP 6.0 AUDIT DELIVERED; OWNER REVIEW PENDING**.

**تقرير WP 6.0:** [PHASE_6_BASELINE_AUDIT.md](PHASE_6_BASELINE_AUDIT.md) تم رفعه إلى GitHub في commit `0a6100439a6d98fee9aaa84683ad4bf7d1247c5f` بعد جولة reconciliation مع قرارات المالك.

**الحالة:** READY FOR GATE 6.0 OWNER REVIEW. المطلوب الآن مراجعة التقرير واعتماد الإغلاق أو طلب تصحيحات محددة. لا يبدأ WP 6.1 أو أي تعديل برمجي قبل موافقة المالك الصريحة.

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
7. لا تصبح المرحلة APPROVED إلا بعد مراجعة مستقلة وقرار المالك.

## الفروع

- `main`: فرع العمل النشط لـGemini، وتظل تغييراته غير معتمدة حتى المراجعة.
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

نجاح الاختبارات المحلية لا يساوي CI VERIFIED، وCI VERIFIED لا يساوي APPROVED. الاعتماد النهائي قرار المالك.
