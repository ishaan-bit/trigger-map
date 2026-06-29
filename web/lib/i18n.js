import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "../i18n/en.json";
import hi from "../i18n/hi.json";

// Web i18n — full English + Hindi parity with the mobile build (catalogs copied
// verbatim from mobile/i18n). Language is persisted in localStorage so it
// survives reloads and is read by api callers (lang threading) for server LLM copy.

const translations = { en, hi };
const SUPPORTED_LANGS = ["en", "hi"];
const DEFAULT_LANG = "en";
const LANG_KEY = "triggermap.language";

const I18nContext = createContext(null);

function resolve(obj, path) {
  return path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function interpolate(template, vars) {
  if (!vars || typeof template !== "string") return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : `{${key}}`));
}

function humanize(key) {
  const last = key.split(".").pop() || key;
  return last
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LANG);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored && SUPPORTED_LANGS.includes(stored)) setLangState(stored);
    } catch {
      // ignore — fall back to default
    }
  }, []);

  const setLang = useCallback((newLang) => {
    if (!SUPPORTED_LANGS.includes(newLang)) return;
    setLangState(newLang);
    try {
      window.localStorage.setItem(LANG_KEY, newLang);
    } catch {
      // ignore persistence failure
    }
  }, []);

  const t = useCallback(
    (key, varsOrFallback) => {
      // 2nd arg may be an interpolation vars object OR a plain string fallback.
      const isFallbackStr = typeof varsOrFallback === "string";
      const vars = isFallbackStr ? undefined : varsOrFallback;

      const dict = translations[lang] || translations[DEFAULT_LANG];
      let value = resolve(dict, key);
      if (value === undefined) value = resolve(translations[DEFAULT_LANG], key);
      if (value === undefined) return isFallbackStr ? varsOrFallback : humanize(key);
      return typeof value === "string" ? interpolate(value, vars) : value;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  // Tolerate usage outside the provider (e.g. isolated component tests) with a
  // sensible English fallback so the UI never crashes.
  if (!ctx) {
    return {
      lang: DEFAULT_LANG,
      setLang: () => {},
      t: (key, fb) => (typeof fb === "string" ? fb : humanize(key)),
    };
  }
  return ctx;
}

// Alias matching the mobile hook name.
export const useLanguage = useI18n;
