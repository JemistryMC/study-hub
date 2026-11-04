# Reports & AI Handoff

هذا المجلد هو نقطة تبادل التقارير بين صاحب المشروع وGemini وChatGPT. Gemini يعمل محليًا؛ صاحب المشروع هو من ينقل مخرجاته إلى GitHub. ChatGPT يقرأ هذه الملفات مباشرةً من المستودع، ويمكنه نشر سجل المراجعة هنا عند الطلب.

## الهيكل

```text
reports/
├── CURRENT.md
├── README.md
├── audits/       # التقارير الهندسية التاريخية
├── patches/      # Unified diffs محفوظة كمرجع، وليست كودًا مطبقًا
├── phases/
│   └── <phase>/
│       ├── gemini-report.md
│       ├── chatgpt-review.md
│       └── decisions.md
└── templates/
    ├── GEMINI_REPORT_TEMPLATE.md
    └── CHATGPT_REVIEW_TEMPLATE.md
```

## طريقة تسليم كل Phase

1. بعد انتهاء Gemini محليًا، يُرفع نص تقريره إلى:
   `reports/phases/<phase>/gemini-report.md`
2. تُرفع ملفات الكود المعدّلة نفسها إلى فرع `Deploying`، وليس التقرير أو الـ Patch فقط.
3. يجب أن يذكر التقرير Base SHA وCommit SHA الذي يحتوي على الكود، ورابط CI الذي اختبر هذا الـ SHA.
4. إذا كان هناك Patch فقط ولم تُطبق تعديلاته على ملفات المشروع، نضعه في `reports/patches/` ونصنفه **غير مطبق**.
5. بعد المراجعة، يُحفظ قرار ChatGPT في `chatgpt-review.md`، والقرارات البشرية النهائية في `decisions.md`.

## قواعد الأدلة

- لا تكتب أرقام اختبارات تقديرية؛ استخدم المخرجات الفعلية.
- افصل بين الاختبارات المحلية وGitHub Actions وStaging وProduction.
- اذكر الاختبارات التي لم تُنفذ والقيود المتبقية.
- لا تعتبر محاكاة PostgreSQL المحلية إثباتًا لتكامل JWT/PostgREST الحقيقي.
- لا تضع أسرارًا أو بيانات اعتماد أو JWTs حقيقية في التقارير.

## الأرشيف الحالي

- `audits/` يحتوي على تقريري التدقيق التاريخيين اللذين كانا في جذر المستودع.
- `patches/` يحتوي على Patches المرفوعة سابقًا، بما فيها Patch Phase 4.2.4.2 الذي كان مرفقًا بالـ PR #1.
- بعض الـ Patches التاريخية متطابقة بايتًا؛ راجع `patches/README.md` قبل استخدام أي منها.
