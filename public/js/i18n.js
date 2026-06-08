/* ============================================================
   IQPREC — i18n.js
   Vanilla JS translation system. Arabic is the DEFAULT language.
   - t(key) returns the string in the current language.
   - setLanguage(lang) flips document dir/lang, persists, re-applies.
   - applyTranslations() updates every [data-i18n] element.
   ============================================================ */

const STORAGE_KEY = 'iqprec_lang';
const DEFAULT_LANG = 'ar'; // Arabic default per spec.

export const translations = {
  ar: {
    /* ---- Brand ---- */
    'brand.name': 'IQPREC',
    'brand.tagline': 'ذكاء. دقّة. كل جولة.',

    /* ---- Navigation ---- */
    'nav.dashboard': 'لوحة التحكم',
    'nav.captain': 'الكابتن',
    'nav.lineup': 'التشكيلة',
    'nav.transfers': 'الانتقالات',
    'nav.differentials': 'الفِرَق',
    'nav.playerIntel': 'معلومات اللاعبين',
    'nav.chips': 'الأوراق',
    'nav.miniLeague': 'الدوري المصغّر',
    'nav.chat': 'المساعد الذكي',
    'nav.community': 'المجتمع',
    'nav.competitions': 'المسابقات',
    'nav.arabStars': 'نجوم العرب',
    'nav.billing': 'الاشتراك',
    'nav.referrals': 'الإحالات',
    'nav.askMe': 'اسألني',
    'nav.more': 'المزيد',
    'nav.logout': 'تسجيل الخروج',

    /* ---- FPL terms ---- */
    'fpl.gameweek': 'الجولة',
    'fpl.captain': 'الكابتن',
    'fpl.transfer': 'الانتقال',
    'fpl.lineup': 'التشكيلة',
    'fpl.form': 'الفورمة',
    'fpl.wildcard': 'ورقة البدل',
    'fpl.benchBoost': 'تعزيز الاحتياطي',
    'fpl.differential': 'الفِرَق',

    /* ---- Common actions ---- */
    'action.login': 'تسجيل الدخول',
    'action.register': 'إنشاء حساب',
    'action.continue': 'متابعة',
    'action.retry': 'إعادة المحاولة',
    'action.save': 'حفظ',
    'action.cancel': 'إلغاء',
    'action.upgrade': 'ترقية الاشتراك',

    /* ---- Auth: login ---- */
    'auth.login.title': 'تسجيل الدخول إلى IQPREC',
    'auth.login.subtitle': 'أهلاً بعودتك. واصل تحليلك في كل جولة.',
    'auth.login.email': 'البريد الإلكتروني',
    'auth.login.emailPh': 'you@example.com',
    'auth.login.password': 'كلمة المرور',
    'auth.login.passwordPh': '••••••••',
    'auth.login.remember': 'تذكّرني',
    'auth.login.forgot': 'نسيت كلمة المرور؟',
    'auth.login.submit': 'تسجيل الدخول',
    'auth.login.submitting': 'جاري الدخول…',
    'auth.login.noAccount': 'ليس لديك حساب؟',
    'auth.login.registerLink': 'أنشئ حساباً',
    'auth.login.failed': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    'auth.login.unverified': 'يرجى تفعيل بريدك الإلكتروني أولاً',
    'auth.login.locked': 'تم قفل الحساب مؤقتاً. حاول لاحقاً.',
    'auth.show': 'إظهار',
    'auth.hide': 'إخفاء',

    /* ---- Auth: register ---- */
    'auth.register.title': 'أنشئ حسابك في IQPREC',
    'auth.register.subtitle': 'تجربة 7 أيام مجاناً — بدون بطاقة.',
    'auth.register.name': 'الاسم الكامل',
    'auth.register.namePh': 'اسمك',
    'auth.register.email': 'البريد الإلكتروني',
    'auth.register.password': 'كلمة المرور',
    'auth.register.confirm': 'تأكيد كلمة المرور',
    'auth.register.ref': 'كود الإحالة (اختياري)',
    'auth.register.refPh': 'أدخل الكود',
    'auth.register.submit': 'إنشاء الحساب',
    'auth.register.submitting': 'جاري الإنشاء…',
    'auth.register.haveAccount': 'لديك حساب بالفعل؟',
    'auth.register.loginLink': 'تسجيل الدخول',
    'auth.register.mismatch': 'كلمتا المرور غير متطابقتين',
    'auth.register.weakPassword': 'كلمة المرور ضعيفة — 8 أحرف على الأقل مع حرف كبير وصغير ورقم ورمز خاص.',
    'auth.register.nameShort': 'الرجاء إدخال اسمك الكامل',
    'auth.register.emailInvalid': 'أدخل بريداً إلكترونياً صحيحاً',
    'auth.register.successTitle': 'تحقّق من بريدك الإلكتروني',
    'auth.register.successMsg': 'أرسلنا رابط تفعيل إلى بريدك. اضغط عليه لبدء تجربتك المجانية.',
    'auth.register.backToLogin': 'العودة لتسجيل الدخول',
    'auth.pwHint': '8 أحرف على الأقل، حرف كبير وصغير ورقم ورمز خاص.',
    'auth.strength.label': 'قوة كلمة المرور',
    'auth.strength.weak': 'ضعيفة',
    'auth.strength.fair': 'مقبولة',
    'auth.strength.good': 'جيدة',
    'auth.strength.strong': 'قوية',

    /* ---- Auth: onboarding ---- */
    'auth.onboarding.step': 'الخطوة {n} من 3',
    'auth.onboarding.s1.title': 'اختر لغتك',
    'auth.onboarding.s1.subtitle': 'يمكنك تغييرها لاحقاً في أي وقت.',
    'auth.onboarding.s1.ar': 'العربية',
    'auth.onboarding.s1.en': 'English',
    'auth.onboarding.s2.title': 'اربط فريقك في FPL',
    'auth.onboarding.s2.subtitle': 'أدخل رقم فريقك لنخصّص توصياتك (اختياري).',
    'auth.onboarding.s2.label': 'رقم فريق FPL',
    'auth.onboarding.s2.ph': 'مثال: 1234567',
    'auth.onboarding.s2.hint': 'تجده في رابط نقاط فريقك على موقع FPL الرسمي.',
    'auth.onboarding.s2.invalid': 'أدخل رقم فريق صحيح (أرقام فقط).',
    'auth.onboarding.s2.confirm': 'تأكيد',
    'auth.onboarding.s2.skip': 'تخطّي الآن',
    'auth.onboarding.s3.title': 'تجربتك المجانية جاهزة 🎯',
    'auth.onboarding.s3.subtitle': '7 أيام كاملة للوصول إلى كل المزايا.',
    'auth.onboarding.s3.start': 'ابدأ إلى لوحة التحكم',
    'auth.onboarding.back': 'رجوع',

    /* ---- Dashboard ---- */
    'dash.gameweek': 'الجولة',
    'dash.deadline': 'الموعد النهائي',
    'dash.deadlinePassed': 'انتهى الموعد',
    'dash.points': 'النقاط الكلية',
    'dash.gwPoints': 'نقاط الجولة',
    'dash.teamValue': 'قيمة الفريق',
    'dash.inBank': 'الرصيد',
    'dash.noTeam.title': 'اربط فريقك في FPL',
    'dash.noTeam.msg': 'أضف رقم فريقك لرؤية تشكيلتك وإحصاءاتك هنا.',
    'dash.connectTeam': 'اربط فريقك',
    'dash.loadError': 'تعذّر تحميل بيانات فريقك.',
    'dash.squadValue': 'قيمة التشكيلة',
    'dash.bank': 'الرصيد',
    'dash.transfers': 'الانتقالات المتاحة',
    'dash.connectShort': 'اربط الفريق',
    'dash.formation.title': 'تشكيلتك',
    'dash.formation.bench': 'الاحتياط',
    'dash.formation.empty': 'اربط فريقك لرؤية تشكيلتك على الملعب.',
    'dash.form': 'الفورم',
    'captain.title': 'كابتن الجولة',
    'captain.generate': 'أنشئ كابتن هذه الجولة',
    'captain.cta.msg': 'دع IQPREC يحلّل المباريات والفورم وملكية المجتمع لاختيار الكابتن الأمثل.',
    'captain.confidence': 'الثقة',
    'captain.vs': 'ضد',
    'captain.readMore': 'اقرأ المزيد',
    'captain.community': '{pct}% من مدراء IQPREC العرب يوافقون',
    'captain.share': 'شارك',
    'captain.shareMessage': 'كابتن جولتي حسب IQPREC',
    'captain.loadError': 'تعذّر تحميل توصية الكابتن.',
    'comp.title': 'المسابقات',
    'comp.qualified': 'مؤهّل ✓',
    'comp.notQualified': 'غير مؤهّل بعد',
    'comp.referProgress': 'ادعُ {remaining} أصدقاء آخرين للتأهل',
    'comp.referProgressDone': 'أنت مؤهّل للمسابقة الحالية!',
    'comp.open': 'مسابقة مفتوحة',
    'comp.rankLabel': 'ترتيبك',
    'comp.prizePool': 'مجموع الجوائز ١٠٠٠$',
    'comp.shareToEnter': 'شارك للتأهل',
    'comp.milestoneToward': 'تقدّم نحو المسابقة القادمة',
    'comp.noneOpen': 'لا توجد مسابقة مفتوحة حالياً',

    /* ---- Billing ---- */
    'billing.title': 'الاشتراك والفواتير',
    'billing.currentPlan': 'خطتك الحالية',
    'billing.statusTrial': 'تجربة مجانية — باقٍ {days} يوم',
    'billing.statusActiveMonthly': 'اشتراك شهري نشط',
    'billing.statusActiveSeason': 'باقة الموسم نشطة',
    'billing.statusExpired': 'انتهى اشتراكك',
    'billing.nextBilling': 'الفاتورة القادمة: {date}',
    'billing.expiresOn': 'تنتهي في: {date}',
    'billing.renews': 'يتجدّد تلقائياً كل شهر',
    'billing.manage': 'إدارة الفواتير',
    'billing.cancel': 'إلغاء الاشتراك',
    'billing.cancelConfirm': 'هل تريد إلغاء اشتراكك في نهاية الفترة الحالية؟',
    'billing.cancelScheduled': 'سيُلغى اشتراكك في نهاية الفترة الحالية.',
    'billing.choosePlan': 'اختر خطتك',
    'billing.upgrade': 'رقِّ اشتراكك للمتابعة في كل جولة',
    'billing.receipts.title': 'سجل الإيصالات',
    'billing.receipts.empty': 'لا توجد إيصالات بعد.',
    'billing.receipts.number': 'رقم الإيصال',
    'billing.receipts.date': 'التاريخ',
    'billing.receipts.plan': 'الخطة',
    'billing.receipts.amount': 'المبلغ',
    'billing.checkoutError': 'تعذّر بدء عملية الدفع. حاول لاحقاً.',
    'billing.paySuccess': 'تم الدفع بنجاح! أهلاً بك في IQPREC.',
    'billing.payCancelled': 'تم إلغاء عملية الدفع.',
    'billing.loadError': 'تعذّر تحميل حالة الاشتراك.',
    'billing.planMonthly': 'شهري',
    'billing.planSeason': 'باقة الموسم',

    /* ---- States ---- */
    'state.loading': 'جاري التحميل…',
    'state.error.title': 'حدث خطأ ما',
    'state.error.message': 'تعذّر تحميل البيانات. حاول مرة أخرى.',
    'state.empty.title': 'لا يوجد شيء هنا بعد',
    'state.empty.message': 'ابدأ الآن لرؤية بياناتك هنا.',

    /* ---- Trial ---- */
    'trial.banner': 'تجربتك المجانية تنتهي خلال {days} يوم — رقِّ اشتراكك الآن',
    'trial.green': 'باقي {days} يوم في تجربتك المجانية',
    'trial.yellow': 'باقي {days} يوم — اشترك الآن للحفاظ على وصولك',
    'trial.red': 'آخر فرصة! تنتهي التجربة قريباً',
    'trial.lastDay': 'آخر فرصة! تنتهي التجربة غداً',
    'trial.subscribe': 'اشترك الآن',
    'trial.expired.title': 'انتهت تجربتك المجانية',
    'trial.expired.message': 'اشترك لمتابعة الوصول إلى ذكاء IQPREC في كل جولة.',

    /* ---- Pricing ---- */
    'pricing.monthly.title': 'شهري',
    'pricing.monthly.price': '15$ / شهر',
    'pricing.monthly.desc': 'كل المزايا. بدون قيود. ألغِ في أي وقت.',
    'pricing.season.title': 'باقة الموسم',
    'pricing.season.price': '110$ / موسم',
    'pricing.season.desc': 'من آب حتى 31 أيار. وفّر أكثر من الشهري.',
    'pricing.bestValue': 'الأفضل قيمة',
    'pricing.choose': 'اختر هذه الخطة',
    'pricing.everything': 'كل شيء مشمول. خطة واحدة. بدون مستويات.',

    /* ---- Referral ---- */
    'referral.title': 'ادعُ أصدقاءك',
    'referral.subtitle': 'ادعُ 5 أشخاص للتأهل للمسابقة',
    'referral.linkLabel': 'رابط الإحالة الخاص بك',
    'referral.copy': 'نسخ الرابط',
    'referral.copied': 'تم نسخ الرابط!',
    'referral.share': 'مشاركة عبر واتساب',
    'referral.shareMessage': 'انضم إليّ على IQPREC — ذكاء الفانتازي بريميرليغ بالعربي. سجّل عبر رابطي:',
    'referral.progress': '{count} من 5 إحالات',
    'referral.status.notQualified': 'غير مؤهّل',
    'referral.status.qualified': 'مؤهّل',
    'referral.status.entered': 'مشترك في المسابقة',

    /* ---- Milestone ---- */
    'milestone.title': 'تقدّم المجتمع',
    'milestone.label': '{current} من {next} مستخدم',
    'milestone.next': 'الهدف القادم: {next}',

    /* ---- Landing: hero ---- */
    'hero.h2': 'دقة الذكاء. كل جولة.',
    'hero.subtitle': 'مساعدك الذكي لدوري الفانتازي بريميرليغ — تحليلات فورية وبيانات حقيقية وقرارات أذكى في كل جولة.',
    'hero.startTrial': 'ابدأ التجربة المجانية',
    'hero.howItWorks': 'كيف يعمل',
    'hero.scroll': 'مرّر للأسفل',

    /* ---- Landing: nav ---- */
    'land.features': 'المزايا',
    'land.pricing': 'الأسعار',
    'land.competitions': 'المسابقات',
    'land.login': 'دخول',
    'land.register': 'ابدأ مجاناً',

    /* ---- Social proof ---- */
    'social.totalManagers': 'إجمالي المدراء',
    'social.arabManagers': 'المدراء العرب',
    'social.aiRecs': 'توصيات الذكاء الاصطناعي',

    /* ---- Comparison ---- */
    'compare.title': 'لماذا IQPREC وليس ChatGPT المجاني؟',
    'compare.generic.title': 'أداة فانتازي عامة',
    'compare.generic.l1': 'نصائح عامة بالإنجليزية فقط',
    'compare.generic.l2': 'أرقام بدون سياق',
    'compare.generic.l3': 'بدون شرح أو سبب',
    'compare.generic.l4': 'لا تعرف فريقك',
    'compare.iqprec.title': 'IQPREC',
    'compare.iqprec.l1': 'تحليل بالعربي بناءً على فريقك',
    'compare.iqprec.l2': 'نسبة ثقة لكل توصية',
    'compare.iqprec.l3': 'بيانات ملكية المجتمع العربي',
    'compare.iqprec.example': 'مثال: «الكابتن صلاح — ثقة 87٪ — يملكه 64٪ من منافسيك»',

    /* ---- Competitions: Falcon League ---- */
    'comp.title': 'دوري الصقر',
    'comp.subtitle': 'اربح جوائز نقدية',
    'comp.status.open': 'المسابقة مفتوحة',
    'comp.first': 'المركز الأول',
    'comp.second': 'المركز الثاني',
    'comp.third': 'المركز الثالث',
    'comp.howToEnter': 'كيف تشارك',
    'comp.step1': 'ادعُ 5 أصدقاء عبر رابط الإحالة',
    'comp.step2': 'انضم إلى دوري مجتمع IQPREC',
    'comp.step3': 'الأعلى نقاطاً يفوز بالجائزة',
    'comp.viewRules': 'القواعد الكاملة',

    /* ---- Features ---- */
    'features.title': 'كل المزايا مشمولة',
    'feature.captain.t': 'اختيار الكابتن',
    'feature.captain.s': 'Captain Picker',
    'feature.lineup.t': 'بناء التشكيلة',
    'feature.lineup.s': 'Lineup Builder',
    'feature.transfer.t': 'مستشار الانتقالات',
    'feature.transfer.s': 'Transfer Advisor',
    'feature.diff.t': 'الفِرَق',
    'feature.diff.s': 'Differentials',
    'feature.intel.t': 'معلومات اللاعبين',
    'feature.intel.s': 'Player Intel',
    'feature.chips.t': 'مخطط الأوراق',
    'feature.chips.s': 'Chip Planner',
    'feature.spy.t': 'تجسس الدوري المصغّر',
    'feature.spy.s': 'Mini-League Spy',
    'feature.chat.t': 'المساعد الذكي',
    'feature.chat.s': 'AI Chat',
    'feature.arab.t': 'نجوم العرب',
    'feature.arab.s': 'Arab Stars Watch',
    'feature.whatsapp.t': 'مشاركة واتساب',
    'feature.whatsapp.s': 'WhatsApp Share',
    'feature.telegram.t': 'بوت تيليجرام',
    'feature.telegram.s': 'Telegram Bot',
    'feature.voice.t': 'ملخص صوتي',
    'feature.voice.s': 'Voice Summary',

    /* ---- Pricing ---- */
    'price.title': 'خطة واحدة. كل شيء مشمول.',
    'price.trial': 'تجربة 7 أيام مجاناً — بدون بطاقة',
    'price.start': 'ابدأ الآن',

    /* ---- Community (Palestine) ---- */
    'community.title': 'مجتمعنا',
    'community.location': 'بيت ساحور',
    'community.leaderboard': 'أفضل المدراء',
    'community.joinTitle': 'انضم إلى دوري IQPREC',
    'community.joinHint': 'انقر لنسخ كود الانضمام',
    'community.copied': 'تم نسخ الكود!',

    /* ---- FAQ ---- */
    'faq.title': 'الأسئلة الشائعة',
    'faq.q1': 'هل أحتاج بطاقة ائتمان للتجربة؟',
    'faq.a1': 'لا. التجربة 7 أيام مجاناً بدون أي بطاقة.',
    'faq.q2': 'ما الفرق بين IQPREC و ChatGPT؟',
    'faq.a2': 'يحقن IQPREC بيانات FPL الحية وفريقك وبيانات المجتمع العربي — بالعربي.',
    'faq.q3': 'كم تكلفة الاشتراك؟',
    'faq.a3': '15$ شهرياً أو 110$ للموسم كامل من آب حتى أيار.',
    'faq.q4': 'هل التوصيات بالعربي؟',
    'faq.a4': 'نعم، كل التحليلات والردود بالعربي عند اختيار اللغة العربية.',
    'faq.q5': 'كيف أشارك في المسابقات؟',
    'faq.a5': 'ادعُ 5 أصدقاء على الأقل ثم انضم لدوري المجتمع.',
    'faq.q6': 'هل تنصحون بلاعبين معتزلين؟',
    'faq.a6': 'أبداً. نستخدم بيانات FPL الرسمية الحية فقط للاعبين النشطين.',
    'faq.q7': 'هل يمكنني الإلغاء في أي وقت؟',
    'faq.a7': 'نعم، يمكنك الإلغاء من صفحة الاشتراك في أي لحظة.',
    'faq.q8': 'هل تدعمون واتساب وتيليجرام؟',
    'faq.a8': 'نعم، مشاركة عبر واتساب وبوت تيليجرام لملخصات الجولة.',

    /* ---- Ask Me ---- */
    'askme.title': 'اسأل جاكوب وسايمون',
    'askme.body': 'بُني IQPREC من الصفر على يد صديقين — جاكوب قمصية وسايمون حداد. هل لديك سؤال أو فكرة؟ نحب أن نسمع منك.',
    'askme.cta': 'تواصل معنا',

    /* ---- Footer legal ---- */
    'footer.about': 'من نحن',
    'footer.privacy': 'الخصوصية',
    'footer.terms': 'الشروط',
    'footer.cookies': 'الكوكيز',

    /* ---- Language ---- */
    'lang.toggle': 'English',
    'lang.ar': 'عربي',
    'lang.en': 'EN',

    /* ---- Footer ---- */
    'footer.rights': 'جميع الحقوق محفوظة © IQPREC',
    'footer.credit': 'صُمّم وطُوّر بواسطة جاكوب قمصية',
  },

  en: {
    /* ---- Brand ---- */
    'brand.name': 'IQPREC',
    'brand.tagline': 'Intelligence. Precision. Every Gameweek.',

    /* ---- Navigation ---- */
    'nav.dashboard': 'Dashboard',
    'nav.captain': 'Captain',
    'nav.lineup': 'Lineup',
    'nav.transfers': 'Transfers',
    'nav.differentials': 'Differentials',
    'nav.playerIntel': 'Player Intel',
    'nav.chips': 'Chips',
    'nav.miniLeague': 'Mini-League',
    'nav.chat': 'AI Assistant',
    'nav.community': 'Community',
    'nav.competitions': 'Competitions',
    'nav.arabStars': 'Arab Stars',
    'nav.billing': 'Billing',
    'nav.referrals': 'Referrals',
    'nav.askMe': 'Ask Me',
    'nav.more': 'More',
    'nav.logout': 'Log out',

    /* ---- FPL terms ---- */
    'fpl.gameweek': 'Gameweek',
    'fpl.captain': 'Captain',
    'fpl.transfer': 'Transfer',
    'fpl.lineup': 'Lineup',
    'fpl.form': 'Form',
    'fpl.wildcard': 'Wildcard',
    'fpl.benchBoost': 'Bench Boost',
    'fpl.differential': 'Differential',

    /* ---- Common actions ---- */
    'action.login': 'Log in',
    'action.register': 'Create account',
    'action.continue': 'Continue',
    'action.retry': 'Retry',
    'action.save': 'Save',
    'action.cancel': 'Cancel',
    'action.upgrade': 'Upgrade',

    /* ---- Auth: login ---- */
    'auth.login.title': 'Sign in to IQPREC',
    'auth.login.subtitle': 'Welcome back. Keep your edge every gameweek.',
    'auth.login.email': 'Email',
    'auth.login.emailPh': 'you@example.com',
    'auth.login.password': 'Password',
    'auth.login.passwordPh': '••••••••',
    'auth.login.remember': 'Remember me',
    'auth.login.forgot': 'Forgot password?',
    'auth.login.submit': 'Sign In',
    'auth.login.submitting': 'Signing in…',
    'auth.login.noAccount': "Don't have an account?",
    'auth.login.registerLink': 'Create one',
    'auth.login.failed': 'Invalid email or password',
    'auth.login.unverified': 'Please verify your email first',
    'auth.login.locked': 'Account temporarily locked. Try again later.',
    'auth.show': 'Show',
    'auth.hide': 'Hide',

    /* ---- Auth: register ---- */
    'auth.register.title': 'Create your IQPREC account',
    'auth.register.subtitle': '7-day free trial — no card required.',
    'auth.register.name': 'Full name',
    'auth.register.namePh': 'Your name',
    'auth.register.email': 'Email',
    'auth.register.password': 'Password',
    'auth.register.confirm': 'Confirm password',
    'auth.register.ref': 'Referral code (optional)',
    'auth.register.refPh': 'Enter code',
    'auth.register.submit': 'Create account',
    'auth.register.submitting': 'Creating…',
    'auth.register.haveAccount': 'Already have an account?',
    'auth.register.loginLink': 'Sign in',
    'auth.register.mismatch': 'Passwords do not match',
    'auth.register.weakPassword': 'Weak password — at least 8 chars with upper, lower, number, and symbol.',
    'auth.register.nameShort': 'Please enter your full name',
    'auth.register.emailInvalid': 'Enter a valid email address',
    'auth.register.successTitle': 'Check your email',
    'auth.register.successMsg': 'We sent a verification link to your inbox. Click it to start your free trial.',
    'auth.register.backToLogin': 'Back to sign in',
    'auth.pwHint': 'At least 8 characters, with upper, lower, number, and a symbol.',
    'auth.strength.label': 'Password strength',
    'auth.strength.weak': 'Weak',
    'auth.strength.fair': 'Fair',
    'auth.strength.good': 'Good',
    'auth.strength.strong': 'Strong',

    /* ---- Auth: onboarding ---- */
    'auth.onboarding.step': 'Step {n} of 3',
    'auth.onboarding.s1.title': 'Choose your language',
    'auth.onboarding.s1.subtitle': 'You can change this anytime later.',
    'auth.onboarding.s1.ar': 'العربية',
    'auth.onboarding.s1.en': 'English',
    'auth.onboarding.s2.title': 'Link your FPL team',
    'auth.onboarding.s2.subtitle': 'Enter your team ID so we can tailor your advice (optional).',
    'auth.onboarding.s2.label': 'FPL Team ID',
    'auth.onboarding.s2.ph': 'e.g. 1234567',
    'auth.onboarding.s2.hint': "Find it in your team's points URL on the official FPL site.",
    'auth.onboarding.s2.invalid': 'Enter a valid team ID (numbers only).',
    'auth.onboarding.s2.confirm': 'Confirm',
    'auth.onboarding.s2.skip': 'Skip for now',
    'auth.onboarding.s3.title': 'Your free trial is ready 🎯',
    'auth.onboarding.s3.subtitle': '7 full days of access to every feature.',
    'auth.onboarding.s3.start': 'Go to Dashboard',
    'auth.onboarding.back': 'Back',

    /* ---- Dashboard ---- */
    'dash.gameweek': 'Gameweek',
    'dash.deadline': 'Deadline',
    'dash.deadlinePassed': 'Deadline passed',
    'dash.points': 'Total points',
    'dash.gwPoints': 'Gameweek points',
    'dash.teamValue': 'Team value',
    'dash.inBank': 'In the bank',
    'dash.noTeam.title': 'Link your FPL team',
    'dash.noTeam.msg': 'Add your team ID to see your squad and stats here.',
    'dash.connectTeam': 'Connect your team',
    'dash.loadError': 'Could not load your squad data.',
    'dash.squadValue': 'Squad value',
    'dash.bank': 'In the bank',
    'dash.transfers': 'Transfers available',
    'dash.connectShort': 'Connect Team',
    'dash.formation.title': 'Your squad',
    'dash.formation.bench': 'Bench',
    'dash.formation.empty': 'Connect your FPL team to see your lineup on the pitch.',
    'dash.form': 'Form',
    'captain.title': "This week's captain",
    'captain.generate': "Generate This Week's Captain Pick",
    'captain.cta.msg': 'Let IQPREC analyse fixtures, form and community ownership to pick your optimal captain.',
    'captain.confidence': 'Confidence',
    'captain.vs': 'vs',
    'captain.readMore': 'Read more',
    'captain.community': '{pct}% of IQPREC Arab managers agree',
    'captain.share': 'Share',
    'captain.shareMessage': 'My gameweek captain by IQPREC',
    'captain.loadError': 'Could not load the captain pick.',
    'comp.title': 'Competitions',
    'comp.qualified': 'Qualified ✓',
    'comp.notQualified': 'Not qualified yet',
    'comp.referProgress': 'Refer {remaining} more to qualify',
    'comp.referProgressDone': "You're qualified for the open competition!",
    'comp.open': 'Competition open',
    'comp.rankLabel': 'Your rank',
    'comp.prizePool': '$1000 prize pool',
    'comp.shareToEnter': 'Share to enter',
    'comp.milestoneToward': 'Progress toward the next competition',
    'comp.noneOpen': 'No competition is open right now',

    /* ---- Billing ---- */
    'billing.title': 'Billing & Subscription',
    'billing.currentPlan': 'Your current plan',
    'billing.statusTrial': 'Free trial — {days} days left',
    'billing.statusActiveMonthly': 'Monthly subscription active',
    'billing.statusActiveSeason': 'Season pass active',
    'billing.statusExpired': 'Your subscription has ended',
    'billing.nextBilling': 'Next billing: {date}',
    'billing.expiresOn': 'Expires: {date}',
    'billing.renews': 'Renews automatically each month',
    'billing.manage': 'Manage billing',
    'billing.cancel': 'Cancel subscription',
    'billing.cancelConfirm': 'Cancel your subscription at the end of the current period?',
    'billing.cancelScheduled': 'Your subscription will end at the close of the current period.',
    'billing.choosePlan': 'Choose your plan',
    'billing.upgrade': 'Upgrade to keep your edge every gameweek',
    'billing.receipts.title': 'Receipt history',
    'billing.receipts.empty': 'No receipts yet.',
    'billing.receipts.number': 'Receipt',
    'billing.receipts.date': 'Date',
    'billing.receipts.plan': 'Plan',
    'billing.receipts.amount': 'Amount',
    'billing.checkoutError': 'Could not start checkout. Please try again.',
    'billing.paySuccess': 'Payment successful! Welcome to IQPREC.',
    'billing.payCancelled': 'Checkout was cancelled.',
    'billing.loadError': 'Could not load your subscription status.',
    'billing.planMonthly': 'Monthly',
    'billing.planSeason': 'Season Pass',

    /* ---- States ---- */
    'state.loading': 'Loading…',
    'state.error.title': 'Something went wrong',
    'state.error.message': 'We could not load the data. Please try again.',
    'state.empty.title': 'Nothing here yet',
    'state.empty.message': 'Get started to see your data here.',

    /* ---- Trial ---- */
    'trial.banner': 'Your free trial ends in {days} days — upgrade now',
    'trial.green': '{days} days left in your free trial',
    'trial.yellow': '{days} days left — subscribe to keep access',
    'trial.red': 'Last chance! Your trial ends soon',
    'trial.lastDay': 'Last chance! Trial ends tomorrow',
    'trial.subscribe': 'Subscribe Now',
    'trial.expired.title': 'Your free trial has ended',
    'trial.expired.message': 'Subscribe to keep your IQPREC intelligence every gameweek.',

    /* ---- Pricing ---- */
    'pricing.monthly.title': 'Monthly',
    'pricing.monthly.price': '$15 / month',
    'pricing.monthly.desc': 'Everything included. No gates. Cancel anytime.',
    'pricing.season.title': 'Season Pass',
    'pricing.season.price': '$110 / season',
    'pricing.season.desc': 'August to May 31st. Save vs monthly.',
    'pricing.bestValue': 'Best Value',
    'pricing.choose': 'Choose this plan',
    'pricing.everything': 'Everything included. One plan. No tiers.',

    /* ---- Referral ---- */
    'referral.title': 'Invite your friends',
    'referral.subtitle': 'Refer 5 people to qualify for the competition',
    'referral.linkLabel': 'Your referral link',
    'referral.copy': 'Copy link',
    'referral.copied': 'Link copied!',
    'referral.share': 'Share on WhatsApp',
    'referral.shareMessage': 'Join me on IQPREC — AI Fantasy Premier League intelligence. Sign up with my link:',
    'referral.progress': '{count} of 5 referrals',
    'referral.status.notQualified': 'Not Qualified',
    'referral.status.qualified': 'Qualified',
    'referral.status.entered': 'Competition Entered',

    /* ---- Milestone ---- */
    'milestone.title': 'Community progress',
    'milestone.label': '{current} of {next} users',
    'milestone.next': 'Next goal: {next}',

    /* ---- Landing: hero ---- */
    'hero.h2': 'Precision Intelligence. Every Gameweek.',
    'hero.subtitle': 'Your AI co-manager for Fantasy Premier League — real-time data, your squad context, and smarter calls every gameweek.',
    'hero.startTrial': 'Start Free Trial',
    'hero.howItWorks': 'See How It Works',
    'hero.scroll': 'Scroll down',

    /* ---- Landing: nav ---- */
    'land.features': 'Features',
    'land.pricing': 'Pricing',
    'land.competitions': 'Competitions',
    'land.login': 'Log in',
    'land.register': 'Start free',

    /* ---- Social proof ---- */
    'social.totalManagers': 'Total Managers',
    'social.arabManagers': 'Arab Managers',
    'social.aiRecs': 'AI Recommendations Generated',

    /* ---- Comparison ---- */
    'compare.title': 'Why IQPREC, not free ChatGPT?',
    'compare.generic.title': 'Generic FPL tool',
    'compare.generic.l1': 'Generic tips, English only',
    'compare.generic.l2': 'Numbers without context',
    'compare.generic.l3': 'No reasoning or why',
    'compare.generic.l4': "Doesn't know your team",
    'compare.iqprec.title': 'IQPREC',
    'compare.iqprec.l1': 'Arabic analysis based on your squad',
    'compare.iqprec.l2': 'Confidence score on every call',
    'compare.iqprec.l3': 'Arab community ownership data',
    'compare.iqprec.example': 'Example: "Captain Salah — 87% confidence — owned by 64% of your rivals"',

    /* ---- Competitions: Falcon League ---- */
    'comp.title': 'The Falcon League',
    'comp.subtitle': 'Win Cash Prizes',
    'comp.status.open': 'Competition open',
    'comp.first': '1st Place',
    'comp.second': '2nd Place',
    'comp.third': '3rd Place',
    'comp.howToEnter': 'How to enter',
    'comp.step1': 'Refer 5 friends with your link',
    'comp.step2': 'Join the IQPREC community league',
    'comp.step3': 'Highest points wins the prize',
    'comp.viewRules': 'Full rules',

    /* ---- Features ---- */
    'features.title': 'All Features Included',
    'feature.captain.t': 'Captain Picker',
    'feature.captain.s': 'AI-ranked captain choices with confidence',
    'feature.lineup.t': 'Lineup Builder',
    'feature.lineup.s': 'Optimal XI from your squad',
    'feature.transfer.t': 'Transfer Advisor',
    'feature.transfer.s': 'Smart in/out with hit math',
    'feature.diff.t': 'Differentials',
    'feature.diff.s': 'Low-owned, high-upside picks',
    'feature.intel.t': 'Player Intel',
    'feature.intel.s': 'Form, fixtures, injury watch',
    'feature.chips.t': 'Chip Planner',
    'feature.chips.s': 'When to play each chip',
    'feature.spy.t': 'Mini-League Spy',
    'feature.spy.s': 'See what rivals are doing',
    'feature.chat.t': 'AI Chat',
    'feature.chat.s': 'Ask anything, in Arabic',
    'feature.arab.t': 'Arab Stars Watch',
    'feature.arab.s': 'Track Arab players in FPL',
    'feature.whatsapp.t': 'WhatsApp Share',
    'feature.whatsapp.s': 'Share picks in one tap',
    'feature.telegram.t': 'Telegram Bot',
    'feature.telegram.s': 'Gameweek alerts on Telegram',
    'feature.voice.t': 'Voice Summary',
    'feature.voice.s': 'Listen to your gameweek brief',

    /* ---- Pricing ---- */
    'price.title': 'One plan. Everything included.',
    'price.trial': '7-day free trial — no card required',
    'price.start': 'Get started',

    /* ---- Community (Palestine) ---- */
    'community.title': 'Our community',
    'community.location': 'Beit Sahour',
    'community.leaderboard': 'Top managers',
    'community.joinTitle': 'Join the IQPREC league',
    'community.joinHint': 'Click to copy the join code',
    'community.copied': 'Code copied!',

    /* ---- FAQ ---- */
    'faq.title': 'Frequently asked questions',
    'faq.q1': 'Do I need a credit card to start?',
    'faq.a1': 'No. The 7-day trial is free with no card required.',
    'faq.q2': "What's the difference vs ChatGPT?",
    'faq.a2': 'IQPREC injects live FPL data, your squad, and Arab community data — in Arabic.',
    'faq.q3': 'How much is the subscription?',
    'faq.a3': '$15/month or $110 for the full season, August to May.',
    'faq.q4': 'Are recommendations in Arabic?',
    'faq.a4': 'Yes — all analysis and replies are in Arabic when Arabic is selected.',
    'faq.q5': 'How do I enter the competitions?',
    'faq.a5': 'Refer at least 5 friends, then join the community league.',
    'faq.q6': 'Do you recommend retired players?',
    'faq.a6': 'Never. We use only live official FPL data for active players.',
    'faq.q7': 'Can I cancel anytime?',
    'faq.a7': 'Yes, you can cancel from the billing page at any time.',
    'faq.q8': 'Do you support WhatsApp and Telegram?',
    'faq.a8': 'Yes — WhatsApp sharing and a Telegram bot for gameweek summaries.',

    /* ---- Ask Me ---- */
    'askme.title': 'Ask Jacob and Simon',
    'askme.body': 'IQPREC was built from zero by two friends — Jacob Qumsiyeh and Simon Haddad. Got a question or an idea? We would love to hear from you.',
    'askme.cta': 'Get in touch',

    /* ---- Footer legal ---- */
    'footer.about': 'About',
    'footer.privacy': 'Privacy',
    'footer.terms': 'Terms',
    'footer.cookies': 'Cookies',

    /* ---- Language ---- */
    'lang.toggle': 'العربية',
    'lang.ar': 'عربي',
    'lang.en': 'EN',

    /* ---- Footer ---- */
    'footer.rights': 'All Rights Reserved © IQPREC',
    'footer.credit': 'Designed and Developed by Jacob Qumsiyeh',
  },
};

function readStoredLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'ar' || stored === 'en') return stored;
  } catch {
    /* localStorage may be unavailable */
  }
  return DEFAULT_LANG;
}

// window.currentLang is the single source of truth at runtime.
window.currentLang = window.currentLang || readStoredLang();

/**
 * t(key, vars?) — returns the translated string for the current language.
 * Falls back: current lang → English → the key itself.
 * Supports {placeholder} interpolation via the vars object.
 */
export function t(key, vars) {
  const lang = window.currentLang || DEFAULT_LANG;
  const dict = translations[lang] || translations[DEFAULT_LANG];
  let str = dict[key] ?? translations.en[key] ?? key;

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

/**
 * applyTranslations(root?) — walks the DOM and updates:
 *   [data-i18n]             → textContent
 *   [data-i18n-placeholder] → placeholder attribute
 *   [data-i18n-aria-label]  → aria-label attribute
 *   [data-i18n-html]        → innerHTML (trusted strings only)
 */
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
}

function applyDocumentDirection(lang) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', lang);
}

/**
 * setLanguage(lang) — switches language app-wide:
 * persists, flips dir/lang, re-applies translations, fires an event.
 */
export function setLanguage(lang) {
  const next = lang === 'en' ? 'en' : 'ar';
  window.currentLang = next;

  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore persistence failure */
  }

  applyDocumentDirection(next);
  applyTranslations();

  window.dispatchEvent(
    new CustomEvent('iqprec:languagechange', { detail: { lang: next } })
  );
}

export function toggleLanguage() {
  setLanguage(window.currentLang === 'ar' ? 'en' : 'ar');
}

export function getLanguage() {
  return window.currentLang || DEFAULT_LANG;
}

/**
 * initI18n() — call once per page on load. Establishes direction and
 * applies the saved language before paint where possible.
 */
export function initI18n() {
  const lang = window.currentLang || readStoredLang();
  window.currentLang = lang;
  applyDocumentDirection(lang);
  applyTranslations();
}

// Apply as early as possible, then again on DOM ready for late nodes.
applyDocumentDirection(window.currentLang);
document.addEventListener('DOMContentLoaded', initI18n);
