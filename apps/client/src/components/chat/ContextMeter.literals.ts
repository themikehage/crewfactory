import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    refresh: "Refresh context usage",
    compacting: "Compacting...",
    compact: "Compact",
  },
  es: {
    refresh: "Actualizar uso de contexto",
    compacting: "Compactando...",
    compact: "Compactar",
  },
};
