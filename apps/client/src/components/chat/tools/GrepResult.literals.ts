import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    noMatches: "No matches found",
    match: "match",
    matches: "matches",
  },
  es: {
    noMatches: "Sin coincidencias",
    match: "coincidencia",
    matches: "coincidencias",
  },
};
