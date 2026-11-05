# التقارير وتسليم العمل بين Gemini وChatGPT

هذا المجلد يحتوي على حالة المشروع ومخرجات المراحل والمراجعات المستقلة. **ابدأ دائمًا من [الحالة الحالية](CURRENT.md)**؛ فهي تحدد المرحلة الوحيدة النشطة. اقرأ بعدها [العقد الهندسي الدائم](../GEMINI.md) ومستند المرحلة المحدد.

## بنية المجلد

```
reports/
├── CURRENT.md
├── README.md
├── audits/                                      # تقارير التدقيق الهندسي المرجعية
├── patches/                                     # Unified diffs تاريخية؛ ليست كودًا مطبقًا
├── phases/
│   ├── phase-4.2.4.4/                           # سجلات تاريخية لمراجعات Phase 4.2.4.4
│   │   ├── README.md
│   │   ├── chatgpt-review.md
│   │   └── phase-4-2-4-4.patch
│   ├── phase-4.2.4.4.1/                         # سجل تاريخي؛ ليس المرحلة النشطة
│   │   └── README.md
│   └── phase-5-storage-sync-audit/
│       ├── gemini-report.md                     # Phase 5.0.2 audit report
│       └── phase-5-1-implementation-blueprint.md
└── templates/
    ├── GEMINI_REPORT_TEMPLATE.md
    └── CHATGPT_REVIEW_TEMPLATE.md
```

قد تحتوي المستودعات الفرعية على ملفات إضافية؛ استخدم شجرة GitHub الفعلية عند الحاجة. لا تفترض أن القائمة أعلاه حصر كامل لكل الملفات داخل كل مرحلة.

## ما الذي يحدد المرحلة الحالية؟

- `reports/CURRENT.md` هو المرجع الوحيد للحالة والمرحلة النشطة والخطوة المصرح بها.
- ملفات Phase 4.2.4.x وتقاريرها وpatches محفوظة كسجل هندسي تاريخي. لا تعِد فتحها أو تنفيذها تلقائيًا.
- تقارير Phase 5.0 هي مراجع تدقيق للمعمارية الحالية، وتستخدم لدعم قرارات Phase 5.1.
- وثيقة Phase 5.1.0 هي Blueprint غير معتمد، وتخضع حاليًا للتصحيح والمراجعة.

## المرحلة النشطة

**Phase 5.1.1 — Blueprint Technical Validation & Correction**

الحالة: **CHANGES REQUESTED — DOCUMENTATION ONLY — NOT APPROVED**.

الملف المستهدف:
`phases/phase-5-storage-sync-audit/phase-5-1-implementation-blueprint.md`

لا يبدأ أي M1 أو تغيير للتطبيق أو قاعدة البيانات قبل تصحيح الوثيقة ومراجعتها وموافقة المالك.

## دورة العمل عبر Google AI Studio

1. Gemini يقرأ `GEMINI.md` و`CURRENT.md` ومستند المرحلة النشطة.
2. Gemini يعمل داخل مساحة Google AI Studio المرتبطة بفرع `main`.
3. Gemini يغيّر الملفات التي يسمح بها نطاق المرحلة فقط.
4. قبل المزامنة يعرض Base SHA والملفات المتغيرة والـDiff والاختبارات والقيود.
5. المالك وحده يراجع ويضغط GitHub Sync. إذا لم يكن الفرع `main` ظاهرًا بوضوح، يتوقف ولا يزامن.
6. إذا كان الخيار الوحيد هو `Force push to main`، فالمالك لا يستخدمه إلا بعد مراجعة الـDiff والتأكد من وجود نقطة الاسترجاع؛ لأن Force Push قد يعيد كتابة تاريخ الفرع.
7. بعد ظهور Commit فعلي على GitHub، تتم مراجعة SHA والـDiff والملفات وGitHub Actions المرتبطة بنفس SHA.
8. لا تعتبر أي مرحلة APPROVED إلا بعد مراجعة مستقلة وقرار المالك.

## الفروع

- `main`: فرع العمل النشط لـGemini، وتظل تغييراته غير معتمدة إلى حين المراجعة.
- `Deploying`: مرجع محفوظ لخط الأساس السابق؛ لا تعدّله أثناء المهمة الحالية.
- `backup/pre-gemini-security-2026-11-04`: نقطة استرجاع قبل العمل الأمني؛ لا تحذفها أو تستبدلها.

## قواعد الأدلة

- كل اختبار له أمر تشغيل واضح وoutput فعلي.
- اربط النتائج بالـSource SHA الذي اختبرته، لا بمجرد أحدث Documentation SHA.
- افصل الاختبارات المحلية عن GitHub Actions وStaging وProduction.
- لا تخلط PGlite مع PostgreSQL 16 الحقيقي.
- لا تعتبر mock أو test double دليلًا على سلوك Supabase/PostgREST الحقيقي.
- أظهر failures والتحذيرات كما هي ولا تحذف اختبارات لإخفائها.
- لا تضع كلمات مرور أو JWTs أو مفاتيح أو ملفات `.env` في التقارير.
- لا تضع بيانات اعتماد حساسة في Git حتى لو كانت مخصصة للاختبارات.
- لا تستخدم أعداد اختبار تاريخية كأنها نتيجة حديثة.

## حالات المرحلة

استخدم إحدى الحالات بدقة:
- `NOT STARTED`
- `IN PROGRESS`
- `CHANGES REQUESTED`
- `IMPLEMENTED — LOCAL TESTS ONLY`
- `CI VERIFIED`
- `APPROVED`

نجاح الاختبار المحلي لا يساوي CI VERIFIED، وCI VERIFIED لا يساوي APPROVED. الاعتماد قرار المالك بعد مراجعة مستقلة.
