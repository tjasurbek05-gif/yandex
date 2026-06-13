// Language selection + lookup. Lang comes from the Yandex SDK when present, else the browser.
import { STRINGS } from '../strings.js';

let lang = 'en';

export function initLang(sdkLang) {
  const cand = (sdkLang || navigator.language || 'en').slice(0, 2).toLowerCase();
  lang = STRINGS[cand] ? cand : 'en';
  return lang;
}

export function getLang() {
  return lang;
}

// t('score') -> localized string; falls back to en, then to the key itself.
export function t(key) {
  const table = STRINGS[lang] || STRINGS.en;
  return table[key] ?? STRINGS.en[key] ?? key;
}

// Localized "N days" / "N day".
export function plural(n, oneKey, manyKey) {
  return `${n} ${t(n === 1 ? oneKey : manyKey)}`;
}
