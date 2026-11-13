# GEMINI.md — Exo Permanent Engineering Contract

هذا الملف هو عقد العمل الهندسي الدائم لمشروع Exo. يحدد قواعد السلامة، سلامة البيانات، حدود الصلاحيات، الاختبارات، والتعامل مع GitHub. **لا يحدد هذا الملف المرحلة النشطة أو تفاصيل تنفيذها**؛ المرجع الوحيد لذلك هو `reports/CURRENT.md`، ثم مستند المرحلة الذي يشير إليه.

## 1. هوية المشروع ومصدر الحقيقة

- Repository: `JemistryMC/study-hub`.
- فرع العمل المعتاد المرتبط بـ Google AI Studio هو `main`.
- `Deploying` فرع مرجعي تاريخي، وليس فرع العمل المعتاد.
- `backup/pre-gemini-security-2026-11-04` نقطة استرجاع محمية؛ لا تحذفها أو تعدلها.
- GitHub هو المصدر المرجعي لنسخة المستودع؛ تغييرات مساحة AI Studio المحلية تظل مسودات حتى يراجعها المالك ويزامنها.
- `reports/CURRENT.md` هو المرجع الوحيد لتحديد المرحلة الحالية وحالتها والخطوة المصرح بها.
- تقارير المراحل القديمة وملفات Patch التاريخية أدلة وسجلات تاريخية، وليست أوامر لتنفيذ تلك المراحل من جديد.
- الكود الحالي هو المرجع لسلوك التطبيق الفعلي. لا تعتمد على تقرير قديم إذا تعارض مع الكود الحالي أو مع handoff أحدث.

قبل كل مهمة:
1. تحقق من اسم المستودع والفرع المتصلين.
2. سجل Base SHA الفعلي و`git status --short` و`git diff --stat` إن كانت أدوات البيئة تتيح ذلك.
3. افحص التغييرات الموجودة مسبقًا ولا تستبدلها أو تتخلص منها.
4. ميّز بين آخر Repository HEAD وآخر Source SHA اجتاز الاختبارات؛ قد تضيف commits توثيقية لا تغيّر المصدر.
5. إذا اختلفت البيئة أو الفرع أو الملفات عن النطاق المتوقع، توقف واشرح الاختلاف قبل التعديل.

لا تضع SHA تاريخيًا باعتباره HEAD دائمًا. يجب التحقق من HEAD الفعلي في كل مهمة.

## 2. ترتيب القراءة الإلزامي

اقرأ بالترتيب:
1. `README.md`.
2. هذا الملف `GEMINI.md`.
3. `reports/CURRENT.md`.
4. مستند المرحلة النشطة المشار إليه في `reports/CURRENT.md`.
5. تقارير التدقيق والمراجعات المستقلة ذات الصلة بهذه المرحلة.
6. ملفات المصدر والاختبارات وmigrations ذات الصلة بالنطاق المطلوب.

لا تبدأ من تقرير مرحلة قديمة لمجرد أنه موجود في تعليمات تاريخية. ولا تجعل Prompt مرحلة سابقة يتغلب على نطاق المهمة الحالية.

## 3. النطاق وإدارة التغيير

- كل مهمة يجب أن تحدد بوضوح الملفات المسموح تعديلها والملفات المحظورة.
- عدّل الحد الأدنى اللازم لتحقيق المطلوب.
- لا تنفذ مهام إضافية أو Refactoring واسع أو تحسينات غير مطلوبة.
- لا تغير الواجهة أو التصميم أو تجربة الاستخدام إلا بتكليف صريح.
- لا تضف ميزات أكاديمية أو Productivity خارج نطاق المرحلة.
- لا تحذف اختبارات موجودة ولا تضعف Assertions ولا تستبدل الاختبارات الحقيقية بـ mocks لإظهار نجاح زائف.
- لا تضف Dependencies أو تغيّر Framework أو Build System دون موافقة صريحة.
- في مهام Documentation-only لا تعدل المصدر أو الاختبارات أو SQL أو إعدادات المشروع.
- في مهام Planning-only لا تبدأ التنفيذ.
- لا تنتقل تلقائيًا إلى Milestone أو Phase تالية؛ توقف عند حدود المهمة واطلب المراجعة.

## 4. الأمان والخدمات الخارجية

- لا تتصل بقاعدة Supabase Production ولا تنفذ عليها أي كتابة أو DDL أو DML.
- أي عملية قراءة من خدمة حقيقية تتطلب تفويضًا منفصلًا وصريحًا يحدد المشروع والعملية والحدود. لا تفترض أن التفويض السابق ما زال ساريًا.
- لا تطبق migrations على Production أو على قاعدة بيانات يملكها المستخدم.
- لا تفترض أن قاعدة البيانات الحية فارغة أو مطابقة لـ `supabase/schema.sql` أو لما في migrations.
- لا توصي بتطبيق `supabase/schema.sql` كاملًا على قاعدة قائمة كإجراء إصلاح عام.
- لا تتصل بحساب Google Drive الحقيقي للمالك ولا ترفع أو تحذف أو تنقل ملفاته أثناء التطوير أو الاختبارات.
- استخدم بيئات اختبار disposable وبيانات اصطناعية فقط.
- لا تعرض أو تسجل كلمات مرور أو JWTs أو service-role keys أو OAuth tokens أو مفاتيح خاصة أو أسرارًا أو محتوى ملفات `.env`.
- لا تضع بيانات اعتماد حساسة في التقارير أو Git حتى لو كانت مخصصة للاختبارات.
- لا تعتبر وجود متغير مثل `CI=true` أو `GITHUB_ACTIONS` وحده إثباتًا لعزل بيئة الاختبار.

## 5. عزل الحسابات وسلامة البيانات

اعتبر بيانات كل UID حدًا أمنيًا مستقلًا. حافظ على الضوابط القائمة ما لم تسمح المهمة ومراجعة مستقلة بتغيير محدد لها، بما في ذلك عند وجودها في المسار المعني:

- Supabase Auth identity.
- Account operation context وsession-generation/epoch guards.
- Account-scoped IndexedDB records والمفاتيح المحلية.
- التحقق المزدوج من ملكية السجل وبياناته الوصفية.
- آليات استعادة annotations وrecovery vault.
- OCC ومراجعة workspace revision.
- RLS وقيود صلاحيات قاعدة البيانات.
- قواعد التزامن عند login/logout وتبديل الحساب.

قواعد غير قابلة للتجاوز:
- لا تخلط بيانات UID بحساب آخر.
- لا تعِد ربط بيانات حساب قديم بالحساب الحالي بمجرد تغيير prefix أو metadata.
- لا تسحب بيانات بعيدة فوق تغييرات محلية لم تُحسم أو تُحفظ.
- لا تعتبر البيانات محفوظة في السحابة إلا بعد تأكيد نجاح العملية من الخادم.
- لا تحذف سجلًا محليًا أو بعيدًا قبل إثبات اكتمال الحفظ أو وجود مسار استعادة آمن.
- اجعل عمليات الاستيراد والاستعادة والترحيل قابلة للاسترداد بعد إغلاق المتصفح أو انهيار الصفحة، ولا تصف عدة مخازن مستقلة بأنها Atomic ما لم يوجد برهان تقني على ذلك.
- لا تحذف Tombstones أو سجلات تعارض اعتمادًا على TTL وحده إذا كان جهاز قديم أو غير متصل يستطيع إعادة إحياء بيانات محذوفة.

## 6. سياسة المنتج: Free وVIP

هذه سياسة منتج دائمة، وليست تفصيلًا اختياريًا في كل مرحلة.

### Free — الوظائف الأساسية

يجب ألا يعتمد الحفظ الأكاديمي الأساسي على VIP. يجب الحفاظ على:
- إدارة المواد والمجموعات والمحاضرات.
- الجدول الدراسي والمهام وBacklog وسجلات الدراسة والبيانات الأكاديمية الأساسية.
- الحفظ المحلي الأساسي للـWorkspace والبيانات المرتبطة به.
- annotations والملاحظات والكتابة اليدوية المرتبطة بالمحاضرات محليًا.
- **Annotated PDF Export مجاني** لمستخدمي Free وVIP.
- **Extra Note Sheet مجاني** لمستخدمي Free وVIP، ويجوز للمستخدم إنشاء عدة Extra Note Sheets؛ لا تجعل `can_upload_media` شرطًا لإنشاء الورقة أو الوصول إليها.
- مزامنة بيانات Workspace الأساسية والـannotations عبر Supabase للمستخدم المسجل عندما تكون المزامنة مهيأة وتنجح صلاحياتها.
- تصدير واستيراد بيانات Workspace الأساسية كمسار نسخ احتياطي، دون اشتراط VIP لمجرد حماية بيانات المستخدم.

### VIP — استحقاق يدوي لميزات محددة

آلية VIP الحالية يدوية:
- الجدول المرجعي الحالي هو `public.user_workspaces`.
- العمود الحالي هو `can_upload_media`.
- المالك هو من يغيّر القيمة يدويًا بين `FALSE` و`TRUE` لمنح أو إلغاء استحقاق رفع الوسائط.
- لا تنشئ جدول اشتراكات جديدًا.
- لا تضف بوابة دفع أو فوترة أو تجديدًا أو انتهاء اشتراك تلقائيًا.
- لا تنفذ تفعيل VIP تلقائيًا من WhatsApp أو أي قناة تواصل؛ WhatsApp وسيلة تواصل فقط، والمالك يغيّر القيمة بنفسه.
- لا تغيّر اسم `can_upload_media` أو معناها ولا تجعل المستخدم قادرًا على منح نفسه VIP.
- يجب أن يبقى التحقق من الاستحقاق على الخادم، لا في واجهة العميل فقط.

VIP مخصص لميزات إضافية محددة، من ضمنها رفع ومزامنة وسائط Google Drive والميزات الأكاديمية المميزة التي يعتمدها المالك صراحةً. **Annotated PDF Export وExtra Note Sheet (بما في ذلك إنشاء عدة Note Sheets) ليست ميزات VIP. لا تستخدم `can_upload_media` كشرط لها، ولا كشرط لحفظ Workspace الأساسي أو مزامنة بياناته وannotations.**

إذا وجدت تناقضًا بين تعليق في دالة أو قفل في الواجهة وبين السياسة المعتمدة، لا تخترع قرارًا جديدًا. وثّق التناقض وصحح تنفيذه فقط ضمن نطاق مصرح به. من أمثلة ذلك أقفال VIP القديمة على أزرار `exportAnnotatedSlides` وExtra Note Sheet؛ السياسة المعتمدة الآن تجعل الوظيفتين متاحتين لمستخدمي Free وVIP، مع السماح بإنشاء عدة Note Sheets.

## 7. حدود Google Drive والوسائط

- مزامنة بيانات Workspace الأساسية عبر Supabase منفصلة عن رفع ملفات الوسائط إلى Google Drive.
- لا تفترض أن Supabase Storage هو مسار الوسائط الحالي أو أنه مستخدم لمجرد وجود bucket أو schema.
- لا تفترض وجود دالة أو endpoint أو صلاحية Drive قبل التحقق من المصدر الحالي.
- لا تغير OAuth scopes أو token lifecycle أو سلوك الرفع والتنزيل أو مشاركة الملفات دون نطاق وموافقة صريحين.
- افصل بين ملف موجود في IndexedDB محليًا وملف خاص في Drive وملف متاح برابط عام.
- لا تدّعِ أن مستخدم Free يستطيع تنزيل ملف Drive خاص أو فتحه دون تحقق من صلاحيات Google الفعلية.
- لا تنشئ Public/Anyone permissions ولا تحول الملفات إلى عامة كحل افتراضي.
- لا تحذف ملف Drive بعيدًا لمجرد حذف محاضرة أو نسخة محلية؛ أي حذف بعيد يحتاج تفويضًا منفصلًا وتحقق ملكية صريحًا.
- حافظ على Private-by-default للملفات المرفوعة ما لم يقرر المالك خلاف ذلك.

## 8. Migrations وSupabase

- افحص migration history وsignatures وowners وgrants وRLS وtriggers وconstraints قبل استنتاج حالة قاعدة بيانات.
- لا تعدّل migration تاريخية مطبقة أو محتمل تطبيقها دون تحليل Fresh Install وExisting Upgrade وسجل migrations/checksums.
- استخدم forward migration عند الحاجة وبعد مراجعة أثرها؛ لا تفترض أنها آمنة لمجرد أنها أحدث timestamp.
- لا تستخدم migration أو schema كاملًا كاختصار لإصلاح نقص موضعي.
- لا تعتبر فحص وجود جدول أو عمود إثباتًا لصحة RPC أو ACL أو RLS أو trigger behavior.
- ميّز دائمًا بين سلوك PostgreSQL المحلي وPGlite وبين Supabase Hosted Auth وPostgREST الفعلي.
- وثّق ما لم يتم التحقق منه بدل صياغته كحقيقة.

## 9. الاختبارات والأدلة

- اقرأ `package.json` والـworkflow الحاليين لتحديد أوامر الاختبار الموجودة فعلًا؛ لا تخترع أسماء scripts.
- لا تفترض توافر JSDOM أو fake-indexeddb أو أي dependency غير معلنة ومثبتة.
- لا تخلط Unit أو PGlite مع PostgreSQL 16 حقيقي أو Chromium E2E.
- اربط كل نتيجة اختبار بـSource SHA محدد، وسجل الأمر والبيئة والـruntime والنتيجة الفعلية.
- افصل الاختبارات المحلية عن GitHub Actions، وافصل نجاح CI عن موافقة المرحلة.
- لا تنسب CI إلى commit لم يكن يحتوي على المصدر الذي اختبره.
- لا تعِد استخدام أرقام اختبار تاريخية على أنها نتيجة جديدة.
- اذكر الاختبارات التي لم تُشغّل وأسباب عدم تشغيلها.
- أظهر الفشل والتحذيرات ومشكلات cleanup كما حدثت؛ لا تخفها.
- لا تستخدم `assert(true)` أو أي Assertion شكلي بدل التحقق الحقيقي.
- في اختبارات PostgreSQL الحساسة، أثبت أن البيئة disposable ومخصصة للتشغيل الحالي، وأن cleanup نجح بالفعل.

نتائج اختبار سابقة لا تصبح ضمانًا دائمًا؛ يجب إسنادها إلى SHA وWorkflow المحددين في `reports/CURRENT.md` أو تقرير الاختبار ذي الصلة.

## 10. تقارير المرحلة وحالات الاعتماد

كل تقرير تنفيذ يجب أن يذكر، حسب طبيعة المهمة:
1. Base SHA والفرع والمستودع.
2. نطاق المهمة والملفات المعدلة بدقة.
3. السبب الجذري والتغييرات.
4. أوامر الاختبار والبيئة والمخرجات.
5. القيود والاختبارات غير المنفذة.
6. المخاطر المتعلقة بالبيانات أو التوافق أو النشر.
7. أي قرار يتطلب موافقة المالك.

استخدم حالات المرحلة بدقة:
- `NOT STARTED`
- `IN PROGRESS`
- `CHANGES REQUESTED`
- `IMPLEMENTED — LOCAL TESTS ONLY`
- `CI VERIFIED`
- `APPROVED`

نجاح الاختبار المحلي لا يساوي CI VERIFIED، وCI VERIFIED لا يساوي APPROVED. Gemini لا يعلن اعتماد المرحلة؛ الاعتماد قرار المالك بعد المراجعة المستقلة.

## 11. GitHub وGoogle AI Studio — تحكم المالك

- Gemini يعمل داخل مساحة AI Studio ويجهز التغييرات للمراجعة.
- لا تنفذ GitHub Sync أو Push أو Force Push بنفسك.
- لا تنفذ commit أو إعادة كتابة للتاريخ أو تغيير branch refs من تلقاء نفسك.
- لا تنشئ مستودعًا أو فرعًا جديدًا إلا إذا سمحت المهمة بذلك صراحةً.
- لا تعدل `Deploying` أو فرع الاسترجاع.
- لا تعتبر التغييرات المحلية مرفوعة إلى GitHub.

قبل أن يقرر المالك المزامنة، قدم:
1. Repository والفرع الهدف.
2. Base SHA الفعلي.
3. قائمة كاملة بالملفات الجديدة والمعدلة والمحذوفة.
4. Diff واضح وملخص لكل تغيير.
5. أوامر الاختبار ونتائجها الفعلية مع SHA.
6. الاختبارات غير المنفذة والقيود.
7. تأكيد عدم تضمين أسرار أو ملفات حساسة.
8. المخاطر أو قرارات المالك المطلوبة.

إذا كان خيار AI Studio الوحيد هو `Force push to main`، لا تقدمه كإجراء روتيني؛ وضّح أن Force Push قد يعيد كتابة تاريخ الفرع واترك القرار للمالك. بعد المزامنة لا تدّعِ نجاحها حتى يتم التحقق من Commit SHA ومحتوى الملفات على GitHub.

## 12. قاعدة الإيقاف

عند وجود تعارض في التعليمات، أو غموض في ملكية البيانات، أو غياب دليل على سلوك قاعدة البيانات، أو طلب تغيير يتجاوز النطاق:
- لا تخمّن.
- لا تنفذ إجراءً مدمّرًا أو غير قابل للعكس.
- اشرح موضع التعارض والدليل المتاح.
- توقف عند الحد الآمن وانتظر قرار المالك.

**الأولوية الدائمة: أمن الحسابات، سلامة بيانات المستخدم، قابلية التحقق، ثم سرعة التنفيذ.**


## 13. Design, UX, and full-interface redesign contract

For any authorized UI/UX redesign, read and follow:
- `reports/EXO_PERSONAL_STUDY_JOURNAL_DESIGN.md` — authoritative owner-approved visual/product experience decisions.
- `reports/PHASE_6_EXPERIENCE_REDESIGN_PLAN.md` — current Phase 6 work packages and acceptance gates.
- `reports/CURRENT.md` — the only authority for the active phase and next authorized action.

These documents do not weaken this engineering contract. In any conflict, preserve security, data integrity, privacy, account isolation, and owner permissions, then stop and explain the conflict.

### 13.1 Non-negotiable UX principles
- The approved product identity is EXO — Personal Study Journal: Dark Personal Study Journal, Refined Journal first with restrained Expressive Journal details.
- The experience must be attractive, functional, and user-friendly. Functionality, clarity, accessibility, and performance are not optional trade-offs for visual styling.
- No gaming/Deadlock visual identity, gamer UI, neon, cyberpunk, excessive grunge, or decorative scrapbook clutter.
- English is the first-run default only when no saved locale exists; Arabic and English are both first-class, with intentional LTR/RTL layouts.
- Follow the approved exact palette, typography, navigation, dashboard, library, Table of Contents, and Chapter Workspace decisions in the design contract.

### 13.2 Mandatory pre-redesign audit
Before changing any app UI code:
- Inventory every screen, route/panel, shared component, modal, toast, context menu, empty/loading/error state, and responsive variant.
- Map the DOM IDs, selectors, classes, data attributes, event listeners/delegation, inline handlers, state stores, function entry points, and tests used by the current UI.
- Inventory all existing PDF Studio controls and behavior; create a feature-by-feature preservation matrix.
- Trace resource relationships and existing local/IndexedDB/cloud/Drive persistence paths.
- Trace save/sync/error states and prove what each state actually means.
- Identify the actual existing closed-loop operations in source and tests; preserve their semantics. Do not invent or substitute a generic process.
- Capture/document representative visual baselines in desktop/mobile and English/Arabic where available, without exposing personal data.
- Record exact Source SHA and actual baseline checks.

### 13.3 Incremental implementation and behavior preservation
- Follow the work-package gates in the Phase 6 plan. The first work package is documentation/audit only; no source changes until the owner reviews its deliverables.
- Do not perform a one-shot rewrite of index.html or replace the existing UI wholesale.
- Preserve existing IDs, event wiring, handlers, data contracts, storage formats, account boundaries, permissions, and integrations unless a separately reviewed task explicitly authorizes a change.
- A UI redesign does not authorize changing Supabase, RLS, migrations, RPC, auth/OAuth, Google Drive permissions, sync contracts, IndexedDB/LocalStorage schemas, backups, deletion/recovery, annotation identity, or Free/VIP policy.
- Do not remove, hide without replacement, or weaken existing features and tests. PDF Studio is integrated inside Chapter Workspace; all current Studio functionality must be preserved.
- Chapter Workspace is the umbrella for chapter resources; first-entry resource setup must be skippable and later additions supported. Mixed-type user Collections and a unified resource index are part of the approved direction.
- Preserve existing closed-loop business operations exactly. Any desired change in their rules needs separate owner approval.
- Work screen by screen and keep each diff reviewable. Stop at every acceptance gate for review.

### 13.4 Truthful user feedback and safe recovery
- Distinguish local durable save from cloud synchronization. Never show Saved before durable local completion is verified or Synced before remote acknowledgement.
- Any actionable error must explain what happened, the supported likely cause/uncertainty, the current data-safety state, and ordered safe next steps.
- Provide a direct retry/reconnect/review/recovery action only if it exists, is safe, and is tested.
- Do not advise clearing browser storage, deleting IndexedDB/LocalStorage, resetting the app, or removing files as generic troubleshooting.
- Never silently overwrite conflicts or discard pending data. Redact tokens, secrets, private URLs, and personal content from diagnostics.

### 13.5 Acceptance
A redesigned screen is not complete because a screenshot looks good. Verify its real interactions, data behavior, bilingual layouts, responsive states, accessibility, reduced motion, performance, and regression coverage. Tie evidence to exact Source SHA. Local tests, CI VERIFIED, and owner APPROVED are separate states; Gemini cannot self-approve.
