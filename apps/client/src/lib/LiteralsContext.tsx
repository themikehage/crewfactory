import { createContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { SupportedLocale, LiteralsContextValue } from "./types";

const LOCALE_STORAGE_KEY = "locale";

function detectLocale(): SupportedLocale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "es") return stored;
    const browser = navigator.language?.startsWith("es") ? "es" : "en";
    localStorage.setItem(LOCALE_STORAGE_KEY, browser);
    return browser;
  } catch {
    return "en";
  }
}

export const LiteralsContext = createContext<LiteralsContextValue>({
  locale: "en",
  setLocale: () => {},
});

export function LiteralsProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(detectLocale);

  const setLocale = useCallback((l: SupportedLocale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, l);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <LiteralsContext.Provider value={{ locale, setLocale }}>
      {children}
    </LiteralsContext.Provider>
  );
}
