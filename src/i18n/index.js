import en from "./en.json";
import rw from "./rw.json";
import tourRw from "./tourRw";
import { createI18n, DEFAULT_LANGUAGE, isSupported, LANGUAGES } from "./core";

export { LANGUAGES, DEFAULT_LANGUAGE, isSupported };
const STORAGE_KEY = "ireme_language";

export function readSavedLanguage() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isSupported(saved)) return saved;
  } catch { /* Storage can be disabled. */ }
  return DEFAULT_LANGUAGE;
}

const rwWithTour = { ...rw, tour: { ...rw.tour, steps: tourRw } };
const instance = createI18n({ en, rw: rwWithTour }, readSavedLanguage());

// Switches every mounted component straight away, with no reload.
export function setLanguage(code) {
  if (!isSupported(code)) return Promise.resolve();
  try { window.localStorage.setItem(STORAGE_KEY, code); } catch { /* The change still applies for this visit. */ }
  document.documentElement.lang = code;
  return instance.changeLanguage(code);
}

document.documentElement.lang = instance.language;

export default instance;
