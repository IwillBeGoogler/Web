import type { Lang } from "@/shared/i18n";
import type { LegalDoc } from "../legal/content";

/** About, Contact and Help pages. Contact addresses in [brackets] must be filled in before launch. */
const CONTACT = "[hello@iwillbegoogler.uz]";
const TELEGRAM = "[@iwillbegoogler]";

export const about: Record<Lang, LegalDoc> = {
  uz: {
    title: "Biz haqimizda",
    intro:
      "IWillBeGoogler — dasturchilar uchun blog va tizim dizayni platformasi. Bu yerda maqolalar yozish, o‘qish va arxitektura diagrammalarini birgalikda chizish mumkin.",
    sections: [
      {
        h: "Maqsadimiz",
        p: [
          "Katta texnologik kompaniyalarga intervyuga tayyorlanayotgan va murakkab tizimlar qurayotgan muhandislar uchun o‘zbek, rus va ingliz tillarida sifatli bilim manbai yaratish.",
        ],
      },
      {
        h: "Nimalar bor",
        p: [
          "Blog: hikoyalar, seriyalar, nashrlar, ro‘yxatlar va teglar.",
          "Diagrammalar: tizim dizayni, ERD va OOD diagrammalarini real vaqtda hamkorlikda tahrirlash, shablonlar va ulashish havolalari.",
        ],
      },
      {
        h: "Ochiq manba",
        p: ["Platforma ochiq manbali loyihalar asosida qurilgan. Taklif va xatolar haqida xabar berishingiz mumkin."],
      },
    ],
  },
  ru: {
    title: "О нас",
    intro:
      "IWillBeGoogler — платформа для блогов и системного дизайна для разработчиков. Здесь можно писать и читать статьи, а также совместно рисовать архитектурные диаграммы.",
    sections: [
      {
        h: "Наша цель",
        p: [
          "Создать качественный источник знаний на узбекском, русском и английском для инженеров, которые готовятся к интервью в крупные компании и строят сложные системы.",
        ],
      },
      {
        h: "Что есть",
        p: [
          "Блог: истории, серии, публикации, списки и теги.",
          "Диаграммы: совместное редактирование диаграмм системного дизайна, ERD и OOD в реальном времени, шаблоны и ссылки для доступа.",
        ],
      },
      {
        h: "Открытый код",
        p: ["Платформа построена на проектах с открытым кодом. Предложения и сообщения об ошибках приветствуются."],
      },
    ],
  },
  en: {
    title: "About",
    intro: "IWillBeGoogler is a blogging and system design platform for developers. Write and read articles, and draw architecture diagrams together.",
    sections: [
      {
        h: "Our goal",
        p: ["A quality learning resource in Uzbek, Russian and English for engineers preparing for big-tech interviews and building complex systems."],
      },
      {
        h: "What's here",
        p: [
          "Blog: stories, series, publications, lists and tags.",
          "Diagrams: real-time collaborative editing of system design, ERD and OOD diagrams, templates and share links.",
        ],
      },
      {
        h: "Open source",
        p: ["The platform is built on open-source projects. Suggestions and bug reports are welcome."],
      },
    ],
  },
};

export const contact: Record<Lang, LegalDoc> = {
  uz: {
    title: "Aloqa",
    intro: "Savol, taklif yoki hamkorlik bo‘yicha biz bilan bog‘laning. Odatda 2 ish kuni ichida javob beramiz.",
    sections: [
      { h: "Email", p: [CONTACT] },
      { h: "Telegram", p: [TELEGRAM] },
      {
        h: "Shikoyatlar",
        p: ["Qoidabuzar kontent yoki mualliflik huquqi buzilishi haqida xabar berishda havola va sababni ko‘rsating."],
      },
    ],
  },
  ru: {
    title: "Контакты",
    intro: "Свяжитесь с нами по вопросам, предложениям или сотрудничеству. Обычно отвечаем в течение 2 рабочих дней.",
    sections: [
      { h: "Email", p: [CONTACT] },
      { h: "Telegram", p: [TELEGRAM] },
      {
        h: "Жалобы",
        p: ["Сообщая о нарушающем правила контенте или авторских правах, укажите ссылку и причину."],
      },
    ],
  },
  en: {
    title: "Contact",
    intro: "Reach us with questions, ideas or partnership requests. We usually reply within 2 business days.",
    sections: [
      { h: "Email", p: [CONTACT] },
      { h: "Telegram", p: [TELEGRAM] },
      {
        h: "Reports",
        p: ["When reporting content that breaks the rules or infringes copyright, include the link and the reason."],
      },
    ],
  },
};

export const help: Record<Lang, LegalDoc> = {
  uz: {
    title: "Yordam",
    intro: "Ko‘p beriladigan savollarga javoblar.",
    sections: [
      { h: "Qanday maqola yozaman?", p: ["Hisobga kiring va yuqori paneldagi «Yangi qoralama» tugmasini bosing. Qoralama avtomatik saqlanadi."] },
      {
        h: "Diagramma qanday yarataman?",
        p: ["/d sahifasida loyiha oching yoki /templates dan shablon tanlang. Havola orqali boshqalarni taklif qilish mumkin."],
      },
      { h: "Parolni unutdim", p: ["Kirish oynasida «Parolni unutdingizmi?» havolasini bosing — emailga tiklash havolasi yuboriladi."] },
      { h: "Hisobni qanday o‘chiraman?", p: ["Sozlamalar sahifasida hisobni o‘chirish bo‘limidan foydalaning."] },
    ],
  },
  ru: {
    title: "Помощь",
    intro: "Ответы на частые вопросы.",
    sections: [
      { h: "Как написать статью?", p: ["Войдите и нажмите «Новый черновик» в верхней панели. Черновик сохраняется автоматически."] },
      { h: "Как создать диаграмму?", p: ["Откройте проект на странице /d или выберите шаблон в /templates. Пригласить других можно по ссылке."] },
      { h: "Забыл пароль", p: ["В окне входа нажмите «Забыли пароль?» — ссылка для сброса придёт на email."] },
      { h: "Как удалить аккаунт?", p: ["Используйте раздел удаления аккаунта в Настройках."] },
    ],
  },
  en: {
    title: "Help",
    intro: "Answers to common questions.",
    sections: [
      { h: "How do I write a story?", p: ["Sign in and press “New draft” in the top bar. Drafts save automatically."] },
      { h: "How do I create a diagram?", p: ["Open a project at /d or pick a template at /templates. Invite others with a share link."] },
      { h: "I forgot my password", p: ["Click “Forgot password?” in the sign-in dialog — a reset link is emailed to you."] },
      { h: "How do I delete my account?", p: ["Use the delete-account section in Settings."] },
    ],
  },
};
