# Current Project Handoff

**آخر تحديث:** 2026-11-05  
**المستودع:** `JemistryMC/study-hub`

هذا الملف هو المرجع الوحيد للحالة الحالية والمرحلة النشطة. إذا خالفه تقرير تاريخي أو تعليمات مرحلة قديمة، يُتبع هذا الملف ومستند المرحلة النشطة.

## 1. حالة المستودع

- فرع العمل النشط: `main`.
- آخر `main` تم التحقق منه قبل تحديث تعليمات الحوكمة:  
  `6020a78e585d415ca3d8dcdd37a024cda2614652`
- هذا الـHEAD يحتوي على commits توثيقية فقط بعد آخر Source SHA اجتاز مجموعة الاختبارات الكاملة.
- آخر Source SHA موثق باختبارات شاملة:  
  `c211d034eb074c43f74eee480b8186e58868dc80`
- مقارنة `c211d03` مع `6020a78` أظهرت Commitين توثيقيين وملفين مضافين فقط:
  - `reports/phases/phase-5-storage-sync-audit/gemini-report.md`
  - `reports/phases/phase-5-storage-sync-audit/phase-5-1-implementation-blueprint.md`
- لا تعتبر أي SHA أعلاه هو HEAD بعد تحديث الحوكمة الحالي؛ تحقق من HEAD الفعلي بعد المزامنة.

الفروع المرجعية:
- `Deploying`: مرجع تاريخي لخط أساس سابق، وليس فرع العمل الحالي.
- `backup/pre-gemini-security-2026-11-04`: نقطة استرجاع محمية؛ لا تحذفها أو تعدلها.

## 2. نتائج الاختبار المثبتة

آخر تشغيل كامل موثق:
- GitHub Actions Run: `41857800822`
- Source SHA: `c211d034eb074c43f74eee480b8186e58868dc80`
- Static: **54/54**
- Unit: **102/102**
- PGlite: **41/41**
- PostgreSQL 16: **96/96**
- Chromium E2E: **42/42**
- الإجمالي: **335/335**

هذه النتائج تخص الكود الموجود عند `c211d03` فقط. لا تعني أن اختبارات المصدر أعيد تشغيلها على commits التوثيقية `1758bba` و`6020a78`، ولا تثبت أي تعديل برمجي لاحق. لا تعِد عرض هذه الأرقام كاختبار جديد.

## 3. العمل المنجز والمرجع التاريخي

### Phase 4.2.x — Security, OCC, PostgreSQL 16

تقارير وملفات هذه المرحلة سجلات هندسية تاريخية. لا تجعلها المرحلة النشطة مرة أخرى ولا تعِد تنفيذها تلقائيًا. ارجع إليها فقط عندما تتطلب Phase حالية دليلًا أو سياقًا محددًا منها.

### Phase 5.0 — Storage, Sync & Google Drive Audit

تقرير التدقيق المرجعي موجود في:
`reports/phases/phase-5-storage-sync-audit/gemini-report.md`

تم رفع التقرير إلى `main` في Commit:
`1758bba343746f4b457d8793fa9389b80117bcf8`

يحتوي التقرير على findings مرقمة F-01 إلى F-15. معاني هذه المعرفات مرتبطة بالتقرير الأصلي ولا يجوز إعادة استخدام أرقامها لمعانٍ مختلفة. عند إضافة findings جديدة استخدم معرفات منفصلة مثل N-01 وما بعدها، مع Traceability صريحة.

### Phase 5.1.0 — Implementation Blueprint

المستند الحالي:
`reports/phases/phase-5-storage-sync-audit/phase-5-1-implementation-blueprint.md`

Commit:
`6020a78e585d415ca3d8dcdd37a024cda2614652`

الحالة: **CHANGES REQUESTED — NOT APPROVED**.

المستند يتضمن أفكارًا مفيدة، لكنه يحتوي على أخطاء في تتبع findings، وافتراضات غير مثبتة عن Google Drive والاختبارات، ومخاطر في تصميم causal merge وtombstone compaction وbackup import recovery وغيرها. راجع ملاحظات Phase 5.1.1 في المهمة النشطة قبل أي اعتماد.

## 4. المرحلة النشطة

# Phase 5.1.1 — Blueprint Technical Validation & Correction

<badge>CHANGES REQUESTED — DOCUMENTATION ONLY — NOT APPROVED</badge>

**الهدف:** تصحيح Blueprint Phase 5.1.0 اعتمادًا على تقرير Phase 5.0.2 والكود الفعلي والأدلة المتاحة، قبل السماح بأي تنفيذ.

**الملف المستهدف الوحيد في هذه المرحلة:**
`reports/phases/phase-5-storage-sync-audit/phase-5-1-implementation-blueprint.md`

المطلوب مراجعة وتصحيح:
1. Traceability: الحفاظ على المعاني الأصلية لكل F-01 إلى F-15؛ أي finding جديد يأخذ N-01 وما بعده.
2. Google Drive: إزالة أي ادعاء عن دوال أو صلاحيات أو endpoints لا توجد في المصدر الحالي، والتمييز بين resumable upload والملفات الخاصة والوصول المحلي.
3. Conflict resolution: عدم وصف مقارنة revision/timestamp بأنها causal أو three-way merge دون causal metadata وآلية ancestor صحيحة واختبارات clock skew.
4. Tombstones: عدم حذفها آليًا بمدة TTL أو عدد revisions دون acknowledgements/watermarks آمنة لكل الأجهزة.
5. Backup import: تصميم recovery journal مستمر بعد crash، لا rollback محفوظ في RAM فقط؛ وفصل حدود المعاملات بين IndexedDB وlocalStorage.
6. Integrity and memory: عدم وصف FNV بأنه SHA-256، وتوضيح أن `crypto.subtle.digest` one-shot، وعدم ادعاء JSON streaming لمجرد chunking.
7. Legacy stroke identity: منع اصطدام IDs عند وجود strokes متطابقة عمدًا.
8. Tests: استخدام scripts والأعداد الموجودة فعلًا، وعدم اختراع أسماء اختبارات أو نتائج.
9. Free/VIP: عدم إغلاق وظائف الحفظ والمزامنة الأساسية خلف VIP، وعدم الادعاء بإمكانية تنزيل ملفات Drive الخاصة دون صلاحية حقيقية.
10. Supabase: إبقاء الفحوصات المقترحة Read-only؛ لا توجد موافقة لتطبيق `schema.sql` كاملًا على قاعدة قائمة.
11. Idle sync: عدم اعتماد polling/threshold قبل قياس payload size والوقت والضغط على RPC وIndexedDB.

### حدود التنفيذ

- لا تعدل `index.html` أو أي مصدر تطبيق.
- لا تعدل SQL أو migrations أو schema أو rollbacks.
- لا تعدل الاختبارات أو dependencies أو GitHub Actions.
- لا تبدأ M1 أو أي Implementation Milestone.
- لا تتصل بـSupabase Production أو Google Drive.
- لا تطبق SQL أو migrations.
- لا تنفذ Git Sync أو Push أو Force Push.

**بوابة الانتقال:** لا يبدأ M1 إلا بعد تصحيح Blueprint، ومراجعته مستقلًا، وموافقة المالك الصريحة على التصميم.

## 5. سياسة المنتج والحسابات

### Free

يظل الحفظ المحلي الأساسي وبيانات Workspace الأكاديمية ومزامنة البيانات والـannotations الأساسية عبر Supabase متاحة للمستخدم المسجل عندما تكون الخدمة مهيأة وتنجح صلاحياتها. لا تجعل VIP شرطًا للحفظ الأكاديمي الأساسي.

### VIP

الاستحقاق يدوي من المالك باستخدام:
- الجدول: `public.user_workspaces`
- العمود: `can_upload_media`
- المالك يغيّر القيمة يدويًا بين FALSE وTRUE.

لا يوجد في النطاق الحالي نظام اشتراكات أو دفع آلي. WhatsApp قناة تواصل فقط، وليس تفعيلًا آليًا. `can_upload_media` بوابة ميزات وسائط/ميزات مميزة محددة، وليست بوابة حفظ Workspace الأساسي.

### Supabase وGoogle Drive

- المستخدم أكد أن migrations الخاصة بـExo لم تُطبق بعد على مشروع Supabase الفعلي.
- المستخدم أكد وجود `public.user_workspaces` وعمود `can_upload_media`، لكن ذلك لا يثبت سلامة بقية schema أو RPC أو RLS أو grants أو triggers.
- لا توجد مراجعة شاملة حديثة للـlive schema؛ اعتبرها غير معروفة.
- Project ref الظاهر في تقرير Phase 5.0.2 والكود: `dszjmgzzqpdrdjkycvht`. لا تستخدم معرّفًا مختلفًا من وثيقة غير موثقة.
- لا توجد موافقة للاتصال الحي أو تنفيذ migrations.
- Google Drive media workflow منفصل عن Core Workspace sync. لا تفترض أن الملفات الخاصة متاحة لـFree أو أن روابط Drive عامة.

## 6. خطوات العمل بعد Phase 5.1.1

1. تصحيح Blueprint فقط.
2. عرض Diff وشرح كل تعديل وأي نقاط ما زالت غير محسومة.
3. مراجعة مستقلة للـBlueprint المصحح.
4. قرار المالك بالموافقة أو طلب تعديلات إضافية.
5. بعد الموافقة فقط، إعداد نطاق تنفيذ منفصل لكل milestone.

لا تنفذ المرحلة التالية تلقائيًا.

## 7. دورة المراجعة والمزامنة

1. Gemini يقرأ `GEMINI.md` وهذا الملف ومستند المرحلة النشطة.
2. Gemini يفحص Base SHA والفرع والملفات السابقة.
3. Gemini يعدّل الملفات التي تسمح بها المرحلة فقط.
4. يعرض Gemini Diff كاملًا وقائمة الملفات والاختبارات الفعلية والقيود.
5. المالك وحده يقرر GitHub Sync.
6. بعد ظهور Commit على GitHub نتحقق من SHA والملفات والـDiff.
7. لا تعتبر المهمة APPROVED إلا بعد مراجعة مستقلة وقرار المالك.

