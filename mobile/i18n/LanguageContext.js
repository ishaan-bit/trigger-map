import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getLanguage, setLanguage as persistLanguage } from "@/services/deviceService";
import en from "./en.json";
import hi from "./hi.json";

const translations = { en, hi };
const SUPPORTED_LANGS = ["en", "hi"];
const DEFAULT_LANG = "en";

const LanguageContext = createContext(null);

function resolve(obj, path) {
  return path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function interpolate(template, vars) {
  if (!vars || typeof template !== "string") return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : `{${key}}`));
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LANG);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getLanguage().then((stored) => {
      if (stored && SUPPORTED_LANGS.includes(stored)) {
        setLangState(stored);
      }
      setReady(true);
    });
  }, []);

  const setLang = useCallback(async (newLang) => {
    if (!SUPPORTED_LANGS.includes(newLang)) return;
    setLangState(newLang);
    await persistLanguage(newLang);
  }, []);

  const t = useCallback(
    (key, vars) => {
      const dict = translations[lang] || translations[DEFAULT_LANG];
      const value = resolve(dict, key);
      if (value === undefined) {
        const fallback = resolve(translations[DEFAULT_LANG], key);
        if (fallback === undefined) return key;
        return typeof fallback === "string" ? interpolate(fallback, vars) : fallback;
      }
      return typeof value === "string" ? interpolate(value, vars) : value;
    },
    [lang]
  );

  if (!ready) return null;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
