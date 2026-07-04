import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    title: "Providers",
    subtitle: "Configure API keys for LLM providers to use with the coding agent.",
    searchPlaceholder: "Search providers...",
  },
  es: {
    title: "Proveedores",
    subtitle: "Configura las claves de API para usar con el agente.",
    searchPlaceholder: "Buscar proveedores...",
  },
};
