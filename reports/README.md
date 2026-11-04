# التقارير وتسليم العمل بين Gemini وChatGPT

هذا المجلد يحتوي على حالة المشروع ومخرجات كل مرحلة والمراجعات المستقلة.

## اقرأ أولًا

- [الحالة الحالية](CURRENT.md)
- [تعليمات Gemini العامة](../GEMINI.md)
- [قالب تقرير Gemini](templates/GEMINI_REPORT_TEMPLATE.md)
- [قالب مراجعة ChatGPT](templates/CHATGPT_REVIEW_TEMPLATE.md)

## بنية المجلد

```
reports/
├── CURRENT.md
├── README.md
├── audits/          # تقارير التدقيق الهندسي المرجعية
├── patches/         # Unified diffs تاريخية؛ ليست كودًا مطبقًا
├── phases/
│   ├── phase-4.2.4.4/
│   │   ├── README.md
│   │   ├── chatgpt-review.md
│   │   └── phase-4-2-4-4.patch
│   └── phase-4.2.4.4.1/
│       └── README.md
└── templates/
    ├── GEMINI_REPORT_TEMPLATE.md
    └── CHATGPT_REVIEW_TEMPLATE.md
```

## طريقة العمل

1. Gemini يقرأ `GEMINI.md` و`CURRENT.md` وملف المرحلة النشطة قبل لمس الكود.
2. Gemini يعمل على فرع `Deploying` فقط.
3. Gemini يغيّر الملفات المطلوبة في نطاق المرحلة ولا ينفذ إعادة كتابة أو مميزات غير مطلوبة.
4. قبل Sync، يعرض Gemini الملفات المتغيرة والـ Diff والاختبارات والفرع المستهدف.
5. المالك وحده يضغط GitHub Sync بعد التأكد أن الوجهة `Deploying`.
6. بعد ظهور Commit فعلي على GitHub، تتم مراجعة SHA والـ diff وGitHub Actions.
7. لا يتم دمج الكود إلى `main` إلا بعد موافقة المراجعة المستقلة والمالك.

## قواعد الأدلة

- كل اختبار له أمر تشغيل واضح وoutput فعلي.
- اربط النتائج بالـ source SHA الذي اختبرته.
- افصل الاختبارات المحلية عن GitHub Actions وStaging وProduction.
- لا تخلط PGlite مع PostgreSQL 16 الحقيقي.
- لا تعتبر mock أو test double دليلًا على سلوك Supabase/PostgREST الحقيقي.
- أظهر failures كما هي ولا تحذف اختبارات لإخفائها.
- لا تضع كلمات مرور أو JWTs أو مفاتيح أو ملفات `.env` في التقارير.
- لا تضع بيانات اعتماد حساسة في GitHub حتى لو كانت مخصصة للاختبارات.

## حالات المرحلة

استخدم إحدى الحالات بدقة:
- `NOT STARTED`
- `IN PROGRESS`
- `CHANGES REQUESTED`
- `IMPLEMENTED — LOCAL TESTS ONLY`
- `CI VERIFIED`
- `APPROVED`

نجاح الاختبار المحلي لا يساوي CI VERIFIED، وCI VERIFIED لا يساوي APPROVED.
