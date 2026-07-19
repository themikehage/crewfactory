import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    tabSessions: "Sessions",
    tabAnalytics: "Analytics",
    tabConsole: "Console",
  },
  es: {
    tabSessions: "Sesiones",
    tabAnalytics: "Analíticas",
    tabConsole: "Consola",
  },
};
