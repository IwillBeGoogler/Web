import type { Lang } from "@/shared/i18n";

/**
 * Privacy Policy and Terms of Use. Template text: placeholders in [brackets]
 * must be filled in, and a lawyer should review it before launch.
 */
export interface LegalDoc {
  title: string;
  intro: string;
  sections: { h: string; p: string[] }[];
}

export const LEGAL_UPDATED = "2026-10-06";

const OPERATOR = "[Operator: legal name, TIN/STIR, address]";
const EMAIL = "[privacy@iwillbegoogler.uz]";

export const privacy: Record<Lang, LegalDoc> = {
  uz: {
    title: "Maxfiylik siyosati",
    intro: `Ushbu siyosat IWillBeGoogler (keyingi o‘rinlarda — «Platforma») shaxsga doir ma’lumotlaringizni qanday yig‘ishi, ishlatishi va himoya qilishini tushuntiradi. Ma’lumotlar operatori: ${OPERATOR}. Siyosat O‘zbekiston Respublikasining «Shaxsga doir ma’lumotlar to‘g‘risida»gi Qonuni (O‘RQ-547) asosida tuzilgan.`,
    sections: [
      {
        h: "1. Qanday ma’lumotlarni yig‘amiz",
        p: [
          "Hisob ma’lumotlari: foydalanuvchi nomi, email, parol (faqat xeshlangan holda saqlanadi), ixtiyoriy ism, bio va avatar.",
          "Kontent: siz yozgan hikoyalar, izohlar, belgilar, ro‘yxatlar va reaksiyalar.",
          "Xavfsizlik ma’lumotlari: faol sessiyalar, kirish vaqti, IP manzil va brauzer turi — faqat hisobni himoya qilish va suiiste’molning oldini olish uchun.",
          "Anonim statistika (faqat roziligingiz bilan): ko‘rilgan sahifalar, o‘qish vaqti, til va qaysi saytdan kelganingiz (faqat domen). IP manzil va brauzer ma’lumoti statistikada saqlanmaydi.",
          "Texnik xato hisobotlari (avtomatik, rozilik so‘ralmaydi): xato matni, sahifa manzili (so‘rov parametrlarisiz) va brauzer turi. Ular hisob yoki IP manzil bilan bog‘lanmaydi (suiiste’molga qarshi cheklov uchun IP manzil taxminan 10 daqiqalik qisqa muddatli hisoblagichda turadi, hisobotda saqlanmaydi) va 90 kungacha saqlanadi.",
        ],
      },
      {
        h: "2. Nima uchun ishlatamiz",
        p: [
          "Xizmatni ko‘rsatish: hisob, nashr qilish, obunalar va bildirishnomalar.",
          "Xavfsizlik: spam, botlar va hisobni buzishga urinishlarga qarshi kurash (Cloudflare Turnstile tekshiruvi shu jumladan).",
          "Xizmatni yaxshilash: qaysi funksiyalar foydali ekanini anonim tarzda tushunish.",
          "Email xabarlar: tasdiqlash, parolni tiklash va siz obuna bo‘lgan mualliflarning yangi hikoyalari. Har bir xatda obunadan chiqish havolasi bor.",
        ],
      },
      {
        h: "3. Cookie va brauzer xotirasi",
        p: [
          "Zarur: tizimga kirish tokeni, til, mavzu va o‘qish sozlamalari. Ularsiz Platforma ishlamaydi.",
          "Statistika: tasodifiy tashrif identifikatori — faqat «Barchasiga rozi» tugmasini bossangiz. Roziligingizni istalgan vaqtda sahifa pastidagi «Cookie sozlamalari» orqali bekor qilishingiz mumkin.",
          "Reklama yoki uchinchi tomon kuzatuv cookie’lari ishlatilmaydi.",
        ],
      },
      {
        h: "4. Ma’lumotlarni kimga beramiz",
        p: [
          "Ma’lumotlaringizni sotmaymiz. Ular faqat xizmatni ta’minlovchi provayderlar (hosting, email yuborish, Cloudflare Turnstile) bilan va faqat zarur hajmda ulashiladi, shuningdek qonun talab qilgan hollarda vakolatli organlarga beriladi.",
          "Ochiq nashr qilgan hikoya va izohlaringiz hamma uchun ko‘rinadi va qidiruv tizimlari tomonidan indekslanishi mumkin.",
        ],
      },
      {
        h: "5. Saqlash joyi va muddati",
        p: [
          "O‘zbekiston fuqarolarining shaxsga doir ma’lumotlari qonun talabiga ko‘ra O‘zbekiston hududidagi serverlarda saqlanadi va Shaxsga doir ma’lumotlar davlat reyestrida ro‘yxatdan o‘tkazilgan bazada qayta ishlanadi. [Hosting provayderi va joylashuvini kiriting.]",
          "Hisob ma’lumotlari hisob mavjud bo‘lguncha saqlanadi. Hisobni o‘chirganingizdan so‘ng 30 kun ichida (tiklash muddati) ma’lumotlar butunlay o‘chiriladi.",
          "Anonim statistika 400 kundan keyin avtomatik o‘chiriladi.",
        ],
      },
      {
        h: "6. Sizning huquqlaringiz",
        p: [
          "Ma’lumotlaringiz bilan tanishish, ularni tuzatish, o‘chirish va qayta ishlashga roziligingizni qaytarib olish huquqiga egasiz.",
          "Profil va hisobni Sozlamalar bo‘limida o‘zingiz tahrirlashingiz yoki o‘chirishingiz mumkin. Boshqa so‘rovlar uchun: " +
            EMAIL +
            ". 30 kun ichida javob beramiz.",
        ],
      },
      {
        h: "7. Bolalar",
        p: ["Platforma 14 yoshdan kichik shaxslar uchun mo‘ljallanmagan. Bunday hisob aniqlansa, u o‘chiriladi."],
      },
      {
        h: "8. Xavfsizlik",
        p: [
          "Parollar argon2id bilan xeshlanadi, ikki bosqichli autentifikatsiya mavjud, ulanishlar HTTPS orqali shifrlanadi. Shunga qaramay, internetda 100% xavfsizlik kafolati yo‘q — ma’lumot sizib chiqsa, sizni va vakolatli organni qonunda belgilangan muddatda xabardor qilamiz.",
        ],
      },
      {
        h: "9. O‘zgarishlar",
        p: ["Siyosat o‘zgarsa, sanani yangilaymiz; muhim o‘zgarishlar haqida email yoki Platformada oldindan xabar beramiz."],
      },
    ],
  },
  ru: {
    title: "Политика конфиденциальности",
    intro: `Эта политика объясняет, как IWillBeGoogler («Платформа») собирает, использует и защищает ваши персональные данные. Оператор данных: ${OPERATOR}. Политика составлена на основании Закона Республики Узбекистан «О персональных данных» (ЗРУ-547).`,
    sections: [
      {
        h: "1. Какие данные мы собираем",
        p: [
          "Данные аккаунта: имя пользователя, email, пароль (хранится только в виде хеша), по желанию — имя, био и аватар.",
          "Контент: ваши истории, комментарии, выделения, списки и реакции.",
          "Данные безопасности: активные сессии, время входа, IP-адрес и тип браузера — только для защиты аккаунта и предотвращения злоупотреблений.",
          "Анонимная статистика (только с вашего согласия): просмотренные страницы, время чтения, язык и сайт-источник (только домен). IP-адрес и данные браузера в статистике не хранятся.",
          "Технические отчёты об ошибках (автоматически, без запроса согласия): текст ошибки, адрес страницы без параметров запроса и тип браузера. Они не связываются с учётной записью или IP-адресом (для защиты от флуда IP-адрес около 10 минут лежит в коротком счётчике и в отчёте не сохраняется) и хранятся до 90 дней.",
        ],
      },
      {
        h: "2. Зачем мы их используем",
        p: [
          "Работа сервиса: аккаунт, публикации, подписки и уведомления.",
          "Безопасность: защита от спама, ботов и взлома (включая проверку Cloudflare Turnstile).",
          "Улучшение сервиса: анонимное понимание того, какие функции полезны.",
          "Письма: подтверждение, восстановление пароля и новые истории авторов, на которых вы подписаны. В каждом письме есть ссылка для отписки.",
        ],
      },
      {
        h: "3. Cookie и хранилище браузера",
        p: [
          "Необходимые: токен входа, язык, тема и настройки чтения. Без них Платформа не работает.",
          "Статистика: случайный идентификатор посещения — только если вы нажали «Принять все». Согласие можно отозвать в любой момент через «Настройки cookie» внизу страницы.",
          "Рекламные и сторонние трекинговые cookie не используются.",
        ],
      },
      {
        h: "4. Кому мы передаём данные",
        p: [
          "Мы не продаём ваши данные. Они передаются только поставщикам, обеспечивающим работу сервиса (хостинг, отправка email, Cloudflare Turnstile), в необходимом объёме, а также уполномоченным органам в случаях, предусмотренных законом.",
          "Опубликованные истории и комментарии видны всем и могут индексироваться поисковыми системами.",
        ],
      },
      {
        h: "5. Где и сколько хранятся данные",
        p: [
          "Персональные данные граждан Узбекистана в соответствии с законом хранятся на серверах на территории Узбекистана в базе, зарегистрированной в Государственном реестре баз персональных данных. [Укажите хостинг-провайдера и расположение.]",
          "Данные аккаунта хранятся, пока существует аккаунт. После удаления аккаунта данные полностью удаляются в течение 30 дней (срок восстановления).",
          "Анонимная статистика автоматически удаляется через 400 дней.",
        ],
      },
      {
        h: "6. Ваши права",
        p: [
          "Вы вправе получить доступ к своим данным, исправить, удалить их и отозвать согласие на обработку.",
          `Профиль и аккаунт можно изменить или удалить в Настройках. Иные запросы: ${EMAIL}. Отвечаем в течение 30 дней.`,
        ],
      },
      { h: "7. Дети", p: ["Платформа не предназначена для лиц младше 14 лет. Такие аккаунты удаляются."] },
      {
        h: "8. Безопасность",
        p: [
          "Пароли хешируются argon2id, доступна двухфакторная аутентификация, соединения шифруются HTTPS. В случае утечки мы уведомим вас и уполномоченный орган в сроки, установленные законом.",
        ],
      },
      { h: "9. Изменения", p: ["При изменении политики мы обновим дату; о существенных изменениях сообщим заранее по email или на Платформе."] },
    ],
  },
  en: {
    title: "Privacy Policy",
    intro: `This policy explains how IWillBeGoogler (the "Platform") collects, uses and protects your personal data. Data operator: ${OPERATOR}. It is based on the Law of the Republic of Uzbekistan "On Personal Data" (ZRU-547).`,
    sections: [
      {
        h: "1. What we collect",
        p: [
          "Account data: username, email, password (stored only as a hash), and optionally a display name, bio and avatar.",
          "Content: stories, responses, highlights, lists and reactions you create.",
          "Security data: active sessions, sign-in times, IP address and browser type — only to protect your account and prevent abuse.",
          "Anonymous statistics (only with your consent): pages viewed, reading time, language and referring site (domain only). No IP address or browser data is stored with statistics.",
          "Technical error reports (sent automatically, without asking): the error text, the page address without its query, and the browser type. They are not linked to an account or an IP address (to stop flooding, your IP address sits in a short-lived counter for about 10 minutes and is not saved with the report) and are kept for up to 90 days.",
        ],
      },
      {
        h: "2. Why we use it",
        p: [
          "To run the service: accounts, publishing, subscriptions and notifications.",
          "Security: fighting spam, bots and account takeover (including the Cloudflare Turnstile check).",
          "Improvement: understanding anonymously which features help readers and writers.",
          "Email: verification, password resets and new stories from writers you subscribe to. Every email has an unsubscribe link.",
        ],
      },
      {
        h: "3. Cookies and browser storage",
        p: [
          "Necessary: sign-in token, language, theme and reading settings. The Platform does not work without them.",
          'Statistics: a random visit identifier — only if you choose "Accept all". Withdraw consent any time via "Cookie settings" at the bottom of the page.',
          "No advertising or third-party tracking cookies.",
        ],
      },
      {
        h: "4. Who we share it with",
        p: [
          "We do not sell your data. It is shared only with providers that run the service (hosting, email delivery, Cloudflare Turnstile), to the extent needed, and with authorities where the law requires.",
          "Stories and responses you publish are public and may be indexed by search engines.",
        ],
      },
      {
        h: "5. Where and how long we keep it",
        p: [
          "As the law requires, personal data of citizens of Uzbekistan is stored on servers located in Uzbekistan, in a database registered in the State Register of Personal Data Bases. [Name the hosting provider and location.]",
          "Account data is kept while the account exists and erased within 30 days (the restore window) after you delete it.",
          "Anonymous statistics are deleted automatically after 400 days.",
        ],
      },
      {
        h: "6. Your rights",
        p: [
          "You may access, correct and delete your data, and withdraw consent to processing.",
          `Edit or delete your profile and account in Settings. Other requests: ${EMAIL}. We answer within 30 days.`,
        ],
      },
      { h: "7. Children", p: ["The Platform is not intended for anyone under 14. Such accounts are removed."] },
      {
        h: "8. Security",
        p: [
          "Passwords are hashed with argon2id, two-factor authentication is available and connections use HTTPS. If a breach happens we will notify you and the authority within the period the law sets.",
        ],
      },
      { h: "9. Changes", p: ["We update the date when this policy changes and announce significant changes in advance by email or on the Platform."] },
    ],
  },
};

export const terms: Record<Lang, LegalDoc> = {
  uz: {
    title: "Foydalanish shartlari",
    intro: `Ushbu shartlar siz bilan ${OPERATOR} o‘rtasidagi IWillBeGoogler’dan foydalanish bo‘yicha kelishuvdir. Ro‘yxatdan o‘tish yoki Platformadan foydalanish orqali siz ularga rozilik bildirasiz.`,
    sections: [
      {
        h: "1. Hisob",
        p: [
          "Ro‘yxatdan o‘tish uchun kamida 14 yoshda bo‘lishingiz kerak. Hisob ma’lumotlari to‘g‘ri bo‘lishi va parolingiz maxfiy saqlanishi lozim.",
          "Hisobingiz orqali qilingan harakatlar uchun siz javobgarsiz. Begona kirishni sezsangiz, darhol parolni o‘zgartiring va bizga xabar bering.",
        ],
      },
      {
        h: "2. Sizning kontentingiz",
        p: [
          "Siz yozgan hikoyalar sizga tegishli bo‘lib qoladi. Nashr qilish orqali siz Platformaga ushbu kontentni saqlash, ko‘rsatish, tarqatish (RSS, email obunalar, havola ko‘rinishlari) uchun bepul, eksklyuziv bo‘lmagan litsenziya berasiz.",
          "Kontentni o‘chirsangiz, litsenziya tugaydi (zaxira nusxalar va boshqalar ulashgan iqtiboslardan tashqari).",
          "Siz joylagan kontentga bo‘lgan huquqlaringiz borligini va u qonunni buzmasligini kafolatlaysiz.",
        ],
      },
      {
        h: "3. Taqiqlangan kontent va xatti-harakatlar",
        p: [
          "O‘zbekiston qonunchiligini buzuvchi kontent; zo‘ravonlik, terrorizm, ekstremizm, milliy, irqiy yoki diniy adovatga chaqiruv.",
          "Ta’qib, haqorat, tuhmat, boshqalarning shaxsiy ma’lumotlarini ruxsatsiz e’lon qilish.",
          "Mualliflik huquqi buzilishi, plagiat, spam, firibgarlik, zararli dasturlar va havolalar.",
          "Platformani buzishga, avtomatlashtirilgan tarzda ommaviy ro‘yxatdan o‘tishga yoki ma’lumot yig‘ishga urinish.",
        ],
      },
      {
        h: "4. Moderatsiya",
        p: [
          "Shikoyat qilish tugmasi orqali qoidabuzarlik haqida xabar bering. Biz qoidalarni buzgan kontentni olib tashlash, hisobni vaqtincha yoki butunlay bloklash huquqini saqlab qolamiz.",
          `Mualliflik huquqi bo‘yicha da’volar: ${EMAIL} — asar, huquq egasi va buzilish havolasini ko‘rsating.`,
        ],
      },
      {
        h: "5. Javobgarlikni cheklash",
        p: [
          "Platforma «boricha» taqdim etiladi. Foydalanuvchilar joylagan kontent ularning shaxsiy fikri bo‘lib, Platforma pozitsiyasini aks ettirmaydi.",
          "Qonun ruxsat bergan darajada, biz bilvosita zararlar, ma’lumot yo‘qolishi yoki xizmatdagi uzilishlar uchun javobgar emasmiz.",
        ],
      },
      {
        h: "6. Hisobni o‘chirish",
        p: ["Hisobingizni istalgan vaqtda Sozlamalarda o‘chirishingiz mumkin. 30 kun ichida qayta kirsangiz, hisob tiklanadi."],
      },
      {
        h: "7. Nizolar va qo‘llaniladigan huquq",
        p: [
          "Ushbu shartlarga O‘zbekiston Respublikasi qonunchiligi qo‘llaniladi. Nizolar avval muzokara yo‘li bilan, kelishilmasa — O‘zbekiston sudlarida hal qilinadi.",
        ],
      },
      {
        h: "8. O‘zgarishlar va aloqa",
        p: [`Shartlar o‘zgarsa, kamida 14 kun oldin xabar beramiz. Savollar uchun: ${EMAIL}.`],
      },
    ],
  },
  ru: {
    title: "Условия использования",
    intro: `Настоящие условия — соглашение между вами и ${OPERATOR} об использовании IWillBeGoogler. Регистрируясь или пользуясь Платформой, вы их принимаете.`,
    sections: [
      {
        h: "1. Аккаунт",
        p: [
          "Для регистрации вам должно быть не менее 14 лет. Данные аккаунта должны быть достоверными, пароль — храниться в тайне.",
          "Вы отвечаете за действия, совершённые через ваш аккаунт. При подозрении на чужой доступ смените пароль и сообщите нам.",
        ],
      },
      {
        h: "2. Ваш контент",
        p: [
          "Ваши истории остаются вашими. Публикуя их, вы предоставляете Платформе безвозмездную неисключительную лицензию на хранение, показ и распространение (RSS, email-подписки, превью ссылок).",
          "При удалении контента лицензия прекращается (кроме резервных копий и цитат, которыми поделились другие).",
          "Вы гарантируете, что обладаете правами на размещаемый контент и он не нарушает закон.",
        ],
      },
      {
        h: "3. Запрещено",
        p: [
          "Контент, нарушающий законодательство Узбекистана; призывы к насилию, терроризму, экстремизму, национальной, расовой или религиозной вражде.",
          "Травля, оскорбления, клевета, публикация чужих персональных данных без согласия.",
          "Нарушение авторских прав, плагиат, спам, мошенничество, вредоносные программы и ссылки.",
          "Попытки взлома, массовой автоматической регистрации или сбора данных.",
        ],
      },
      {
        h: "4. Модерация",
        p: [
          "Сообщайте о нарушениях кнопкой «Пожаловаться». Мы вправе удалять нарушающий контент и временно или навсегда блокировать аккаунты.",
          `Претензии по авторским правам: ${EMAIL} — укажите произведение, правообладателя и ссылку на нарушение.`,
        ],
      },
      {
        h: "5. Ограничение ответственности",
        p: [
          "Платформа предоставляется «как есть». Контент пользователей выражает их мнение, а не позицию Платформы.",
          "В пределах, допускаемых законом, мы не отвечаем за косвенные убытки, потерю данных или перерывы в работе сервиса.",
        ],
      },
      { h: "6. Удаление аккаунта", p: ["Удалить аккаунт можно в Настройках. Если войти в течение 30 дней, аккаунт восстановится."] },
      {
        h: "7. Применимое право",
        p: [
          "К условиям применяется законодательство Республики Узбекистан. Споры решаются путём переговоров, а при недостижении согласия — в судах Узбекистана.",
        ],
      },
      { h: "8. Изменения и контакты", p: [`Об изменениях условий сообщим не менее чем за 14 дней. Вопросы: ${EMAIL}.`] },
    ],
  },
  en: {
    title: "Terms of Use",
    intro: `These terms are an agreement between you and ${OPERATOR} about using IWillBeGoogler. By signing up or using the Platform you accept them.`,
    sections: [
      {
        h: "1. Your account",
        p: [
          "You must be at least 14 to sign up. Keep your account details accurate and your password secret.",
          "You are responsible for what happens through your account. If you suspect someone else has access, change your password and tell us.",
        ],
      },
      {
        h: "2. Your content",
        p: [
          "Your stories stay yours. By publishing you grant the Platform a free, non-exclusive licence to store, display and distribute them (RSS, email subscriptions, link previews).",
          "The licence ends when you delete the content (except backups and quotes others have shared).",
          "You confirm you hold the rights to what you post and that it is lawful.",
        ],
      },
      {
        h: "3. Not allowed",
        p: [
          "Content that breaks the law of Uzbekistan; calls to violence, terrorism, extremism, or national, racial or religious hatred.",
          "Harassment, insults, defamation, publishing others' personal data without consent.",
          "Copyright infringement, plagiarism, spam, fraud, malware and malicious links.",
          "Attempts to break the Platform, mass automated sign-ups or scraping.",
        ],
      },
      {
        h: "4. Moderation",
        p: [
          "Use Report to flag violations. We may remove violating content and suspend or ban accounts.",
          `Copyright claims: ${EMAIL} — name the work, the rights holder and link to the infringement.`,
        ],
      },
      {
        h: "5. Limitation of liability",
        p: [
          "The Platform is provided \"as is\". User content is the author's opinion, not the Platform's position.",
          "To the extent the law allows, we are not liable for indirect damages, data loss or service interruptions.",
        ],
      },
      { h: "6. Deleting your account", p: ["Delete your account any time in Settings. Signing in within 30 days restores it."] },
      {
        h: "7. Governing law",
        p: ["These terms are governed by the law of the Republic of Uzbekistan. Disputes are settled by negotiation first, then in the courts of Uzbekistan."],
      },
      { h: "8. Changes and contact", p: [`We announce changes at least 14 days in advance. Questions: ${EMAIL}.`] },
    ],
  },
};
