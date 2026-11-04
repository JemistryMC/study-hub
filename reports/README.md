# التقارير وتسليم العمل بين Gemini وChatGPT

هذا المجلد يحتوي على حالة المشروع ومخرجات كل مرحلة والمراجعات المستقلة. ابدأ دائمًا من [الحالة الحالية](CURRENT.md) ثم تعليمات [GEMINI.md](../GEMINI.md).

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

## دورة العمل الحالية

1. Gemini يقرأ `GEMINI.md` و`CURRENT.md` وملف المرحلة النشطة.
2. Gemini يعمل داخل مساحة Google AI Studio المرتبطة بفرع `main`.
3. Gemini يغيّر الملفات المطلوبة ضمن نطاق المرحلة فقط.
4. قبل المزامنة يعرض Gemini Base SHA والملفات المتغيرة والـ Diff والاختبارات.
5. المالك وحده يراجع ويضغط GitHub Sync. إذا لم يكن الفرع `main` ظاهرًا بوضوح، يتوقف ولا يزامن.
6. إذا كان الخيار الوحيد هو `Force push to main`، فالمالك لا يستخدمه إلا بعد مراجعة الـ Diff والتأكد من وجود نسخة الاسترجاع.
7. بعد ظهور Commit فعلي على GitHub، تتم مراجعة SHA والـ diff وGitHub Actions المرتبطة بنفس SHA.
8. لا تعتبر أي مرحلة APPROVED إلا بعد مراجعة مستقلة وقرار المالك.

## الفروع

- `main`: فرع العمل النشط لـ Gemini، وتظل تغييراته غير معتمدة إلى حين المراجعة.
- `Deploying`: مرجع محفوظ لخط الأساس السابق؛ لا تعدّله أثناء المهمة الحالية.
- `backup/pre-gemini-security-2026-11-04`: نقطة استرجاع قبل بدء العمل الأمني؛ لا تحذفها أو تستبدلها.

## قواعد الأدلة

- كل اختبار له أمر تشغيل واضح وoutput فعلي.
- اربط النتائج بالـ source SHA الذي اختبرته.
- افصل الاختبارات المحلية عن GitHub Actions وStaging وProduction.
- لا تخلط PGlite مع PostgreSQL 16 الحقيقي.
- لا تعتبر mock أو test double دليلًا على سلوك Supabase/PostgREST الحقيقي.
- أظهر failures كما هي ولا تحذف اختبارات لإخفائها.
- لا تضع كلمات مرور أو JWTs أو مفاتيح أو ملفات `.env` في التقارير.
- لا تضع بيانات اعتماد حساسة في Git حتى لو كانت مخصصة للاختبارات.

## حالات المرحلة

استخدم إحدى الحالات بدقة:
- `NOT STARTED`
- `IN PROGRESS`
- `CHANGES REQUESTED`
- `IMPLEMENTED — LOCAL TESTS ONLY`
- `CI VERIFIED`
- `APPROVED`

نجاح الاختبار المحلي لا يساوي CI VERIFIED، وCI VERIFIED لا يساوي APPROVED.
