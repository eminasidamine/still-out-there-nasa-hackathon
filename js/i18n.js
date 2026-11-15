// Strings live in data/i18n/<lang>.json. Only ship a language a team member has checked.
// English is always loaded underneath, so a missing translation shows English, never a raw key.
let strings = {}, fallback = {};
export let lang = 'en';
export const LANGUAGES = [['en', 'EN'], ['fr', 'FR']];          // Arabic is off for now (its files are kept in data/i18n)
const RTL = new Set(['ar']);
const KEY = 'still-out-there-v2:lang';

/** Language to use: ?lang=xx in the address, then the saved choice, then the browser's language. */
export function preferredLanguage() {
  const ok = (c) => LANGUAGES.some(([x]) => x === c);
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (ok(fromUrl)) return fromUrl;
  try { const saved = localStorage.getItem(KEY); if (ok(saved)) return saved; } catch { /* storage blocked */ }
  const nav = (navigator.language || 'en').slice(0, 2);
  return ok(nav) ? nav : 'en';
}

export function chooseLanguage(code) {
  try { localStorage.setItem(KEY, code); } catch { /* storage blocked */ }
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) { url.searchParams.delete('lang'); location.replace(url); }
  else location.reload();                      // simplest and safest: reload everything in the new language
}

export async function loadLanguage(code = 'en') {
  // v1 strings (stories, facts, labels) with the v2 journey strings layered on top.
  const one = async (path) => { const res = await fetch(path); if (!res.ok) throw new Error(`Missing language file: ${path}`); return res.json(); };
  const get = async (c) => { const [base, v2] = await Promise.all([one(`data/i18n/${c}.json`), one(`data/i18n/v2/${c}.json`).catch(() => ({}))]); return { ...base, ...v2 }; };
  fallback = await get('en');
  try { strings = code === 'en' ? fallback : await get(code); lang = code; } catch { strings = fallback; lang = 'en'; }
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL.has(lang) ? 'rtl' : 'ltr';
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel));
}

export function t(key, vars = {}) {
  const s = strings[key] ?? fallback[key];
  if (s == null) return key;
  return s.replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? `{${name}}`));
}

export const has = (key) => key in strings;

// Numbers and dates in the reader's language. Arabic uses Western digits (0-9), as in Mauritania.
const locale = () => (lang === 'ar' ? 'ar-u-nu-latn' : lang === 'fr' ? 'fr-FR' : 'en-GB');
export const fmtNumber = (n, digits = 0) => new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
export const fmtDate = (d) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
