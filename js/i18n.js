// Lightweight i18n for the admin panel. Auto-detects a language once, on
// first visit — instantly from the browser/OS locale (private, no network),
// then refined by a best-effort IP-country lookup if that didn't already
// point at a supported language. After that, whatever the person picks
// from the switcher always wins and is remembered (localStorage) — auto-
// detection never runs again once a choice has been made.
const STORAGE_KEY = "adminLang";
export const SUPPORTED = ["en", "pt"];

// Countries where Portuguese is the primary/official language — used only
// to map the IP-country refinement step to a language.
const PT_COUNTRIES = new Set(["PT", "BR", "AO", "MZ", "CV", "GW", "ST", "TL"]);

const DICT = {
  en: {
    "brand.subtitle": "Backstage",
    "nav.listings": "Listings",
    "nav.agents": "Agents",
    "nav.enquiries": "Enquiries",
    "nav.bookings": "Bookings & BTC",
    "nav.reviews": "Reviews",
    "nav.messages": "Messages",
    "nav.settings": "Settings",
    "nav.staff": "Staff",
    "header.signout": "Sign out",
    "header.enable_push": "Enable notifications",
    "header.enabling_push": "Enabling…",
    "header.push_on": "Notifications on ✓",
    "login.email": "Email",
    "login.password": "Password",
    "login.submit": "Sign in",
    "common.loading": "Loading…",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.send": "Send",
    "common.close": "Close",
    "messages.title": "Messages",
    "messages.no_messages": "No messages yet.",
    "messages.reply_placeholder": "Reply…",
    "messages.is_typing": "{name} is typing…",
    "messages.demo_warning": "Demo data present. Threads marked DEMO are seeded preview content from the training tool — not real customers.",
    "reviews.title": "Reviews",
    "reviews.add_manual": "+ Add review manually",
    "reviews.demo_warning": "Demo data present. Rows marked DEMO are seeded preview content from the training tool — not real customers. Clear them from the training tool before this site goes live.",
    "push.unsupported": "Push notifications aren't supported in this browser.",
    "push.denied_prev": "Notifications were previously blocked for this app. Browsers won't re-prompt once blocked — re-enable them from your browser/OS notification settings for this app, then try again.",
    "push.could_not_enable": "Could not enable notifications: "
  },
  pt: {
    "brand.subtitle": "Bastidores",
    "nav.listings": "Imóveis",
    "nav.agents": "Agentes",
    "nav.enquiries": "Consultas",
    "nav.bookings": "Reservas e BTC",
    "nav.reviews": "Avaliações",
    "nav.messages": "Mensagens",
    "nav.settings": "Definições",
    "nav.staff": "Equipa",
    "header.signout": "Sair",
    "header.enable_push": "Ativar notificações",
    "header.enabling_push": "A ativar…",
    "header.push_on": "Notificações ativas ✓",
    "login.email": "Email",
    "login.password": "Palavra-passe",
    "login.submit": "Entrar",
    "common.loading": "A carregar…",
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
    "common.delete": "Eliminar",
    "common.edit": "Editar",
    "common.send": "Enviar",
    "common.close": "Fechar",
    "messages.title": "Mensagens",
    "messages.no_messages": "Ainda não há mensagens.",
    "messages.reply_placeholder": "Responder…",
    "messages.is_typing": "{name} está a escrever…",
    "messages.demo_warning": "Existem dados de demonstração. As conversas marcadas DEMO são conteúdo de pré-visualização gerado pela ferramenta de formação — não são clientes reais.",
    "reviews.title": "Avaliações",
    "reviews.add_manual": "+ Adicionar avaliação manualmente",
    "reviews.demo_warning": "Existem dados de demonstração. As linhas marcadas DEMO são conteúdo de pré-visualização gerado pela ferramenta de formação — não são clientes reais. Remova-as na ferramenta de formação antes deste site entrar em produção.",
    "push.unsupported": "As notificações push não são suportadas neste navegador.",
    "push.denied_prev": "As notificações foram bloqueadas anteriormente para esta aplicação. Os navegadores não voltam a perguntar depois de bloqueado — reative-as nas definições de notificações do navegador/sistema para esta aplicação e tente novamente.",
    "push.could_not_enable": "Não foi possível ativar as notificações: "
  }
};

let currentLang = "en";

export function getLang() { return currentLang; }

export function t(key) {
  return (DICT[currentLang] && DICT[currentLang][key]) ?? DICT.en[key] ?? key;
}

// Applies translations to every already-rendered [data-i18n] /
// [data-i18n-placeholder] element — used for the static chrome (login
// screen, header, sidebar). Dynamically-generated tab content (admin.js's
// render* functions) calls t() directly inline instead, since that markup
// doesn't exist yet at the time this runs.
export function applyStaticI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
}

export function setLang(lang, { persist = true } = {}) {
  if (!SUPPORTED.includes(lang)) lang = "en";
  currentLang = lang;
  if (persist) localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  applyStaticI18n();
  // Lets admin.js re-render whatever dynamic tab is currently open so its
  // inline t()-driven strings pick up the change immediately too, and lets
  // every <select class="lang-switch-select"> stay in sync with each other.
  window.dispatchEvent(new CustomEvent("adminlangchange", { detail: { lang } }));
}

export async function detectAndApplyLanguage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) { setLang(saved, { persist: false }); return; }

  // Instant, private, zero-network guess from the browser/OS locale — this
  // alone already covers "my phone/browser is set to Portuguese."
  const browserLang = (navigator.language || "en").slice(0, 2).toLowerCase();
  setLang(browserLang === "pt" ? "pt" : "en", { persist: false });
  if (browserLang === "pt") return;

  // Best-effort refinement by IP country (ipapi.co — free, no key), only
  // reached if the browser locale didn't already say Portuguese. Soft-fails
  // silently on any error/timeout/block, leaving the locale guess as-is —
  // this is a nice-to-have refinement, never a requirement.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch("https://ipapi.co/json/", { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();
    if (data?.country_code && PT_COUNTRIES.has(data.country_code)) {
      setLang("pt", { persist: false });
    }
  } catch {
    // ignore — keep the browser-locale guess
  }
}
